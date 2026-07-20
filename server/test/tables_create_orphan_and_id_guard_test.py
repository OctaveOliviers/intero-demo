"""Regression tests for the /api/tables control plane.

Covers two bugs in :mod:`server.routes.tables`:

* #4 — a SPAWN failure after the table was persisted left an ORPHANED
  ``status="queued"`` / ``table_population_id=None`` table on disk (a stuck amber
  dot the refresh never re-spawns). The create must instead surface a clear
  failed state.
* #10 — ``_safe_id`` used ``re.match`` so a trailing newline (``"abc\n"``)
  slipped past the slug guard (``$`` matches before a trailing newline). It must
  ``fullmatch``.

Hermetic: the table store points at a tmp state DB, the auth catalog is freshly seeded so
the clinician's ``table.read``/``table.manage`` resolve, and the spawn seam is
never allowed to launch the real worker.
"""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException

from server.auth import store as auth_store
from core.tables import store as table_store
from server.routes import tables as tables_route


def _clinician():
    return {"id": "u_clin", "username": "clinician", "role": "clinician"}


def _request_for(user):
    return SimpleNamespace(state=SimpleNamespace(user=user, user_id=user["id"]))


class CreateTableSpawnFailureTest(unittest.TestCase):
    """#4 — a spawn failure must NOT leave an orphaned queued table."""

    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmpdir.name)
        self._orig_table_db = table_store.TABLE_DB_PATH
        table_store.TABLE_DB_PATH = self.tmp_path / "table-state.db"

        self.auth_db = self.tmp_path / "auth.sqlite"
        self._orig_auth_db = auth_store.AUTH_DB_PATH
        auth_store.AUTH_DB_PATH = self.auth_db
        auth_store.init_store()

        # The spawn seam is made to FAIL exactly like a worker-not-ready launch
        # (503) — never launching the real worker / an opencode session.
        self._orig_spawn = tables_route._spawn_table_population

        def failing_spawn(**_kw):
            raise HTTPException(
                status_code=503, detail="Table population worker is not ready."
            )

        tables_route._spawn_table_population = failing_spawn

    def tearDown(self) -> None:
        table_store.TABLE_DB_PATH = self._orig_table_db
        tables_route._spawn_table_population = self._orig_spawn
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        self.tmpdir.cleanup()

    def _create_body(self, **over):
        base = dict(title="Term NICU audit", source_template="cord-ph")
        base.update(over)
        return tables_route.TableCreateRequest(**base)

    def _on_disk_tables(self) -> list[dict]:
        return [
            table_store.load_table(table_id)
            for table_id in table_store.list_table_ids()
        ]

    def test_spawn_failure_leaves_no_orphaned_queued_table(self):
        """The bug: create persists status='queued' then spawns; on a 503 spawn
        failure it left a queued table with table_population_id=None on disk that
        lists forever and is never re-spawned. After the fix the create still
        surfaces the error, but NO orphaned queued table remains — the
        row is either gone or marked 'error' (a clear failed state)."""
        req = _request_for(_clinician())
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(tables_route.create_table(self._create_body(), req))
        self.assertEqual(ctx.exception.status_code, 503)

        on_disk = self._on_disk_tables()
        for table in on_disk:
            orphan = (
                table.get("status") == "queued"
                and table.get("table_population_id") is None
            )
            self.assertFalse(
                orphan,
                "spawn failure left an orphaned queued table on disk: "
                f"{table.get('id')}",
            )
        # If the row was kept, it must be a clear failed state, not stuck queued.
        for table in on_disk:
            if table.get("source_template") != tables_route.AD_HOC_TEMPLATE:
                self.assertNotEqual(table.get("status"), "queued")


class SafeIdGuardTest(unittest.TestCase):
    """#10 — ``_safe_id`` must fullmatch so a trailing newline is rejected."""

    def test_trailing_newline_id_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            tables_route._safe_id("abc\n")
        self.assertEqual(ctx.exception.status_code, 404)

    def test_normal_id_still_passes(self):
        self.assertEqual(tables_route._safe_id("table-abc123_-"), "table-abc123_-")

    def test_traversal_still_blocked(self):
        for bad in ("..", "../victim", "foo/bar", ".", "a/../b", "abc\n.."):
            with self.assertRaises(HTTPException) as ctx:
                tables_route._safe_id(bad)
            self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
