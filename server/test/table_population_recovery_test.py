"""Route-level crash-recovery characterization for table populations (#326).

The table-population process status lives in the STATE STORE — the run row's
``population_status`` record, the ONLY lifecycle record (#326 deleted the
per-run-dir status.json machinery). When the server crashes (or is
simply restarted) mid-run, the record keeps saying ``running`` while the
backing session task and relay session are gone — a NEW process holds an empty
``_TABLE_POPULATION_SESSION_TASKS`` map and a fresh relay. These tests pin
what every HTTP surface reports for such a crashed population:

* the status endpoint trusts the stale record and reports ``running`` forever
  (no staleness detection, no startup reconciliation — ``Runtime.startup``
  only rescans indexing);
* refresh is locked out with 409 ``TABLE_POPULATION_NOT_REFRESHABLE`` (the
  status gate sees ``running``), so a crashed population can never be
  re-driven — the known crash-recovery gap;
* stop reports 404 "not found or already finished" — nothing live to stop —
  directly contradicting the ``running`` the status endpoint reports;
* the SSE stream errors immediately with the unknown-population frame;
* none of those reads/attempts repairs the stale record.

The next migration step must keep these pins green, or consciously rewrite
them together with an actual crash-recovery behaviour change.

Style follows server/test/table_population_refresh_test.py: the route handlers
are called directly with patched module state (ARTIFACTS_DIR, the store, owner
gates, relay), never through a booted app.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from core import table_population
from core.store import Run, Store
from core.table_population import table_population_sessions as sessions
from core.table_population.table_population_sessions import (
    population_status_of,
    record_status,
)
from server.models import ChipMessage
from server.routes import table_populations as table_populations_route


# These tests cover crash-recovery semantics, not authorization: bypass the
# owner/read gates and pass a placeholder request.
_OWNER_REQUEST = SimpleNamespace(
    state=SimpleNamespace(user={"id": "u", "role": "clinician"}, user_id="u")
)


class TablePopulationCrashRecoveryTest(unittest.IsolatedAsyncioTestCase):
    """One simulated crash, every surface pinned.

    The crash simulation: a run row whose ``population_status`` record a
    PREVIOUS process stamped ``running`` through the canonical writer (exactly
    what ``open_session`` writes), read by a NEW process — empty session-task
    map, fresh (empty) relay."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.runs_dir = Path(self._tmp.name) / "runs"
        self.runs_dir.mkdir(parents=True, exist_ok=True)

        # The state DB the crashed process wrote and the new process reads:
        # the route's Store and the canonical writer's store seam both point
        # at the same scratch DB, exactly as both point at var/state.db in
        # production.
        self.state_db = Path(self._tmp.name) / "state.db"
        Store(self.state_db).close()
        state_db = self.state_db

        class _TestStore(Store):
            def __init__(self, path=None, *, runtime_role="api_app") -> None:
                super().__init__(state_db, runtime_role=runtime_role)

        self._store_patch = patch.object(table_populations_route, "Store", _TestStore)
        self._store_patch.start()
        self._seam_patch = patch.object(
            sessions,
            "_open_status_store",
            lambda: Store(state_db, runtime_role="api_app"),
        )
        self._seam_patch.start()
        # The writer reuses one long-lived handle; drop any stale one now and
        # close the scratch one on cleanup so this test leaks no connection.
        sessions._reset_status_store_handle()
        self.addCleanup(sessions._reset_status_store_handle)

        # A fresh process: no session tasks, no refresh locks.
        self._task_snapshot = dict(
            table_populations_route._TABLE_POPULATION_SESSION_TASKS
        )
        table_populations_route._TABLE_POPULATION_SESSION_TASKS.clear()
        self._lock_snapshot = dict(table_populations_route._REFRESH_START_LOCKS)
        table_populations_route._REFRESH_START_LOCKS.clear()

        # A fresh relay, as Runtime.startup installs after a restart — it has
        # never seen the crashed population's id.
        self._prev_relay = table_population.get_session_relay()
        table_population.set_session_relay(
            table_population.TablePopulationSessionRelay()
        )

        # Bypass the authz gates (owner + read) — not under test here.
        self._orig_owner_gate = table_populations_route._require_table_population_owner
        table_populations_route._require_table_population_owner = lambda *a, **k: {
            "id": "u"
        }
        self._orig_read_gate = (
            table_populations_route.require_table_population_read_access
        )
        table_populations_route.require_table_population_read_access = lambda *a, **k: (
            None
        )

    def tearDown(self):
        table_populations_route.require_table_population_read_access = (
            self._orig_read_gate
        )
        table_populations_route._require_table_population_owner = self._orig_owner_gate
        table_population.set_session_relay(self._prev_relay)
        table_populations_route._REFRESH_START_LOCKS.clear()
        table_populations_route._REFRESH_START_LOCKS.update(self._lock_snapshot)
        table_populations_route._TABLE_POPULATION_SESSION_TASKS.clear()
        table_populations_route._TABLE_POPULATION_SESSION_TASKS.update(
            self._task_snapshot
        )
        self._seam_patch.stop()
        self._store_patch.stop()
        self._tmp.cleanup()

    def _crashed_run_dir(self, table_population_id: str) -> Path:
        """A run dir + run row a previous process left behind mid-run."""
        run_dir = self.runs_dir / table_population_id
        run_dir.mkdir(parents=True, exist_ok=True)
        seed = Store(self.state_db)
        try:
            seed.create_run(
                Run(id=table_population_id, audit_id="npda", status="in_progress")
            )
        finally:
            seed.close()
        # The canonical writer, exactly as open_session stamped it before the
        # crash: population_status='running' on the run row.
        record_status(table_population_id, "running")
        return run_dir

    def _population_status(self, table_population_id: str) -> str:
        store = Store(self.state_db)
        try:
            return population_status_of(store.get_run(table_population_id))
        finally:
            store.close()

    async def test_status_endpoint_reports_crashed_population_as_running(self):
        """GET /api/table-populations/{id} trusts the stale record: a
        population whose process died mid-run reports ``running`` — there is no
        liveness cross-check against the session task or the relay, and no
        startup reconciliation ever rewrites the record."""
        self._crashed_run_dir("tp-crashed")
        with patch.object(table_populations_route, "ARTIFACTS_DIR", self.runs_dir):
            out = await table_populations_route.get_table_population_state(
                "tp-crashed", _OWNER_REQUEST
            )
        self.assertEqual(out.status, "running")
        self.assertEqual(
            out.messages[0].content, "Table population tp-crashed is running."
        )
        # Only a 'completed' status appends the workbook chip.
        self.assertFalse(any(isinstance(m, ChipMessage) for m in out.messages))
        # The read did not repair the record.
        self.assertEqual(self._population_status("tp-crashed"), "running")

    async def test_refresh_of_crashed_population_is_locked_out_with_409(self):
        """POST /refresh on a crashed population: the ACTIVE check passes (no
        session task survives a restart), but the status gate reads the stale
        record — ``running``, not in the refreshable set {'completed'} — and
        rejects with 409 TABLE_POPULATION_NOT_REFRESHABLE. This is the
        crash-recovery gap #326 exists to close: a population that crashed
        mid-run can NEVER be refreshed again; the stale record value surfaces
        verbatim in the message."""
        self._crashed_run_dir("tp-crashed")
        with patch.object(table_populations_route, "ARTIFACTS_DIR", self.runs_dir):
            with self.assertRaises(HTTPException) as ctx:
                await table_populations_route.refresh_table_population(
                    "tp-crashed", _OWNER_REQUEST
                )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(
            ctx.exception.detail["code"], "TABLE_POPULATION_NOT_REFRESHABLE"
        )
        self.assertIn("'running'", ctx.exception.detail["message"])
        # The rejected refresh left the stale record in place.
        self.assertEqual(self._population_status("tp-crashed"), "running")

    async def test_stop_of_crashed_population_reports_not_found(self):
        """POST /stop on a crashed population: the fresh relay has no session
        and the task map has no entry, so nothing is stopped and the route
        404s — even though the status endpoint simultaneously reports the same
        population as ``running``. That contradiction IS the current
        behaviour; pin it so the migration replaces it deliberately."""
        self._crashed_run_dir("tp-crashed")
        with patch.object(table_populations_route, "ARTIFACTS_DIR", self.runs_dir):
            with self.assertRaises(HTTPException) as ctx:
                await table_populations_route.stop_table_population(
                    "tp-crashed", _OWNER_REQUEST
                )
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(
            ctx.exception.detail,
            "Table population not found or already finished.",
        )
        # The failed stop did not touch the record: still 'running'.
        self.assertEqual(self._population_status("tp-crashed"), "running")

    async def test_stream_reconnect_to_crashed_population_errors_immediately(self):
        """GET /stream after a crash: the frontend reconnects (the status said
        ``running``), but the fresh relay has no session for the id — the SSE
        stream yields exactly one data-only error frame naming the unknown
        population, then closes. The client is told the stream is dead while
        the status surface still claims the run is alive."""
        self._crashed_run_dir("tp-crashed")
        with patch.object(table_populations_route, "ARTIFACTS_DIR", self.runs_dir):
            response = await table_populations_route.stream_table_population_events(
                "tp-crashed", _OWNER_REQUEST
            )
            frames = [frame async for frame in response.body_iterator]
        self.assertEqual(len(frames), 1)
        self.assertTrue(frames[0].startswith("data: "))
        event = json.loads(frames[0][len("data: ") :].strip())
        self.assertEqual(
            event,
            {"type": "error", "message": "unknown table population: tp-crashed"},
        )
        # The reconnect attempt did not repair the record either.
        self.assertEqual(self._population_status("tp-crashed"), "running")


if __name__ == "__main__":
    unittest.main(verbosity=2)
