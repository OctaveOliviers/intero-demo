"""One-time startup adoption of pre-#326 status.json files into the store.

``adopt_legacy_status_files`` copies each legacy ``var/artifacts/<id>/status.json``
payload onto its run row's ``population_status`` record — once. Pinned here:
adoption of the full payload (status/detail/result_status), idempotence (a
second pass is a no-op, and an already-recorded row is never overwritten),
and tolerance (malformed files, off-vocabulary statuses, and row-less dirs are
skipped without failing startup). The adopted files stay on disk as inert
bytes — nothing writes or reads them after this.

Run: ``python3 -m core.table_population.tests.status_backfill_test``
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from core.store import Run, Store  # noqa: E402
from core.table_population import table_population_sessions as sessions  # noqa: E402
from core.table_population.table_population_sessions import (  # noqa: E402
    adopt_legacy_status_files,
)


class AdoptLegacyStatusFilesTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.db_path = root / "state.db"
        self.runs_dir = root / "runs"
        self.runs_dir.mkdir()
        Store(self.db_path).close()
        patcher = patch.object(
            sessions,
            "_open_status_store",
            lambda: Store(self.db_path, runtime_role="api_app"),
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self._tmp.cleanup)

    def _seed_run(self, run_id: str, **fields) -> None:
        store = Store(self.db_path)
        try:
            store.create_run(
                Run(id=run_id, audit_id="births", status="in_progress", **fields)
            )
        finally:
            store.close()

    def _seed_file(self, run_id: str, payload) -> Path:
        run_dir = self.runs_dir / run_id
        run_dir.mkdir(exist_ok=True)
        path = run_dir / "status.json"
        text = payload if isinstance(payload, str) else json.dumps(payload)
        path.write_text(text, encoding="utf-8")
        return path

    def _record(self, run_id: str) -> tuple:
        store = Store(self.db_path)
        try:
            run = store.get_run(run_id)
            return (
                run.population_status,
                run.population_status_detail,
                run.population_result_status,
            )
        finally:
            store.close()

    def test_legacy_file_is_adopted_onto_null_row_once(self):
        self._seed_run("tp-legacy")
        legacy_file = self._seed_file(
            "tp-legacy",
            {"status": "completed", "result_status": "complete"},
        )

        self.assertEqual(adopt_legacy_status_files(self.runs_dir), 1)
        self.assertEqual(self._record("tp-legacy"), ("completed", None, "complete"))
        # The file stays on disk as inert bytes — deletion is not the
        # migration's job.
        self.assertTrue(legacy_file.exists())

        # IDEMPOTENT: the second startup adopts nothing and changes nothing.
        self.assertEqual(adopt_legacy_status_files(self.runs_dir), 0)
        self.assertEqual(self._record("tp-legacy"), ("completed", None, "complete"))

    def test_detail_rides_along(self):
        self._seed_run("tp-err")
        self._seed_file("tp-err", {"status": "error", "detail": "boom"})
        self.assertEqual(adopt_legacy_status_files(self.runs_dir), 1)
        self.assertEqual(self._record("tp-err"), ("error", "boom", None))

    def test_recorded_row_is_never_overwritten(self):
        # A run that already carries a lifecycle record keeps it, whatever the
        # stale file says.
        self._seed_run("tp-live", population_status="running")
        self._seed_file("tp-live", {"status": "completed"})
        self.assertEqual(adopt_legacy_status_files(self.runs_dir), 0)
        self.assertEqual(self._record("tp-live"), ("running", None, None))

    def test_malformed_and_degenerate_files_are_skipped(self):
        # Malformed JSON, a non-object payload, an off-vocabulary status, and
        # a file with no run row: each skipped, none fatal, valid dirs still
        # adopted in the same pass.
        self._seed_run("tp-bad-json")
        self._seed_file("tp-bad-json", '{"status": "runn')
        self._seed_run("tp-not-object")
        self._seed_file("tp-not-object", '["running"]')
        self._seed_run("tp-off-vocab")
        self._seed_file("tp-off-vocab", {"status": "paused"})
        self._seed_file("tp-no-row", {"status": "completed"})
        self._seed_run("tp-good")
        self._seed_file("tp-good", {"status": "stopped", "detail": "Stopped by user."})

        self.assertEqual(adopt_legacy_status_files(self.runs_dir), 1)
        self.assertEqual(self._record("tp-good"), ("stopped", "Stopped by user.", None))
        for skipped in ("tp-bad-json", "tp-not-object", "tp-off-vocab"):
            self.assertEqual(self._record(skipped), (None, None, None))

    def test_missing_runs_dir_is_a_noop(self):
        self.assertEqual(adopt_legacy_status_files(self.runs_dir / "does-not-exist"), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
