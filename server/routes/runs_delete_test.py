"""Tests for DELETE /api/runs/{run_id}: stop-then-delete + full teardown.

Deleting a run must leave NO trace: the runs row and all its cascaded children
(cells, events, …) in state.db, the var/runs/<id> directory, and the auth.sqlite
attribution row. It must also stop the live execution (opencode session + spine
task) first, and refuse non-owners.
"""

from __future__ import annotations

import asyncio
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException

from core.store import Cell, Event, Run, Store
from server.auth import store as auth_store
from server.routes import runs


class DeleteRunTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmpdir.name)
        self.auth_db = self.tmp_path / "auth.sqlite"
        self.state_db = self.tmp_path / "state.db"
        self.runs_dir = self.tmp_path / "runs"
        self.runs_dir.mkdir(parents=True, exist_ok=True)

        self._orig_auth_db = auth_store.AUTH_DB_PATH
        auth_store.AUTH_DB_PATH = self.auth_db
        auth_store.init_store()
        self._orig_runs_dir = runs.RUNS_DIR
        runs.RUNS_DIR = self.runs_dir

        self._orig_store_cls = runs.Store
        state_db = self.state_db

        class TestStore(Store):
            def __init__(self, path=None, *, runtime_role="api_app") -> None:
                super().__init__(state_db, runtime_role=runtime_role)

        runs.Store = TestStore
        self._orig_runner = runs.runner_mod.runner
        runs.runner_mod.runner = None

        self.owner_user = {"id": "u_owner", "username": "clinician"}
        self.other_user = {"id": "u_other", "username": "clinician2"}
        for user in (self.owner_user, self.other_user):
            auth_store.create_user(
                user["id"], user["username"], "hash", "salt", "2026-01-01T00:00:00+00:00"
            )

    def tearDown(self) -> None:
        runs.Store = self._orig_store_cls
        runs.runner_mod.runner = self._orig_runner
        runs._SPINE_TASKS.clear()
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        runs.RUNS_DIR = self._orig_runs_dir
        self.tmpdir.cleanup()

    @staticmethod
    def _request_for(user: dict[str, str] | None):
        return SimpleNamespace(state=SimpleNamespace(user=user, user_id=(user or {}).get("id")))

    def _seed_run(self, *, run_id: str, owner_user_id: str | None) -> None:
        store = Store(self.state_db, runtime_role="api_app")
        try:
            store.create_run(Run(id=run_id, audit_id="a1", user_id=owner_user_id))
            store.upsert_cell(
                Cell(run_id=run_id, ref="ALL!A2", field="f1", member="m1",
                     kind="interpret", state="pending")
            )
            store.append_event(Event(run_id=run_id, type="activity", payload={"x": 1}))
        finally:
            store.close()
        # The on-disk run directory the agent/spine would have created.
        run_dir = self.runs_dir / run_id
        (run_dir / "audit").mkdir(parents=True, exist_ok=True)
        (run_dir / "result.xlsx").write_bytes(b"PK")
        if owner_user_id is not None:
            auth_store.record_run(run_id, owner_user_id, "a1", "do the audit", {},
                                  "2026-01-01T00:00:00+00:00")

    def _count(self, table: str, run_id: str) -> int:
        conn = sqlite3.connect(self.state_db)
        try:
            return conn.execute(
                f"SELECT COUNT(*) FROM {table} WHERE run_id = ?", (run_id,)
            ).fetchone()[0]
        finally:
            conn.close()

    def test_owner_delete_removes_every_trace(self):
        self._seed_run(run_id="r1", owner_user_id=self.owner_user["id"])
        # Preconditions.
        self.assertEqual(self._count("cells", "r1"), 1)
        self.assertEqual(self._count("events", "r1"), 1)
        self.assertTrue((self.runs_dir / "r1").exists())
        self.assertIsNotNone(auth_store.get_run_attribution("r1"))

        resp = asyncio.run(runs.delete_run("r1", self._request_for(self.owner_user)))

        self.assertEqual(resp.status_code, 204)
        store = Store(self.state_db, runtime_role="api_app")
        try:
            self.assertIsNone(store.get_run("r1"))
        finally:
            store.close()
        # Cascade removed the children; the dir and attribution are gone.
        self.assertEqual(self._count("cells", "r1"), 0)
        self.assertEqual(self._count("events", "r1"), 0)
        self.assertFalse((self.runs_dir / "r1").exists())
        self.assertIsNone(auth_store.get_run_attribution("r1"))

    def test_non_owner_is_denied_and_nothing_is_deleted(self):
        self._seed_run(run_id="r2", owner_user_id=self.owner_user["id"])

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(runs.delete_run("r2", self._request_for(self.other_user)))

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(self._count("cells", "r2"), 1)
        self.assertTrue((self.runs_dir / "r2").exists())
        self.assertIsNotNone(auth_store.get_run_attribution("r2"))

    def test_missing_run_returns_404(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(runs.delete_run("nope", self._request_for(self.owner_user)))
        self.assertEqual(ctx.exception.status_code, 404)

    def test_unauthenticated_returns_401(self):
        self._seed_run(run_id="r3", owner_user_id=self.owner_user["id"])
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(runs.delete_run("r3", self._request_for(None)))
        self.assertEqual(ctx.exception.status_code, 401)

    def test_stop_then_delete_aborts_session_and_cancels_spine_task(self):
        self._seed_run(run_id="r4", owner_user_id=self.owner_user["id"])
        stopped: list[str] = []

        class FakeRunner:
            async def stop(self, run_id: str) -> bool:
                stopped.append(run_id)
                return True

        async def scenario():
            runs.runner_mod.runner = FakeRunner()
            task = asyncio.ensure_future(asyncio.sleep(10))
            runs._SPINE_TASKS["r4"] = task
            resp = await runs.delete_run("r4", self._request_for(self.owner_user))
            return resp, task

        resp, task = asyncio.run(scenario())

        self.assertEqual(resp.status_code, 204)
        self.assertEqual(stopped, ["r4"])          # opencode session aborted
        self.assertTrue(task.cancelled())          # spine task cancelled
        self.assertNotIn("r4", runs._SPINE_TASKS)  # task handle forgotten
        self.assertFalse((self.runs_dir / "r4").exists())


if __name__ == "__main__":
    unittest.main()
