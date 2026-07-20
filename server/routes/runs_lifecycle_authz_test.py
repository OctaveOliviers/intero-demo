"""Owner-only enforcement for the table-population lifecycle: stop / stream / refresh.

§14 enforcement fold-ins (auth-and-access §14; control-plane contract §3/§9;
ADR-0003 #3). These three routes used to take no ``request`` and enforced NO
ownership — any authenticated user could stop, stream, or refresh another user's
table population. They now require the table-population owner
(``run.user_id == caller``) plus the matching permission
(``table_population.stop`` / ``table_population.read``), with NO admin override
(admin is a clinical peer). Mirrors the established owner-only patterns in
``table_populations_delete_test.py`` / ``table_populations_edit_cells_test.py``.
"""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException

from core import table_population
from core.store import Run, Store
from server.auth import store as auth_store
from server.routes import table_populations as table_populations_route


class _FakeRelay:
    """Minimal session relay stub: a live table population that stops/streams cleanly."""

    def __init__(self) -> None:
        self.stop_requested: list[str] = []
        self.streamed: list[str] = []

    def request_graceful_stop(self, table_population_id: str) -> bool:
        self.stop_requested.append(table_population_id)
        return True

    async def stream_session_events(self, table_population_id: str):
        self.streamed.append(table_population_id)
        if False:  # pragma: no cover - empty async generator
            yield None


class RunLifecycleAuthzTest(unittest.TestCase):
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
        self._orig_runs_dir = table_populations_route.ARTIFACTS_DIR
        table_populations_route.ARTIFACTS_DIR = self.runs_dir

        self._orig_store_cls = table_populations_route.Store
        state_db = self.state_db

        class TestStore(Store):
            def __init__(self, path=None, *, runtime_role="api_app") -> None:
                super().__init__(state_db, runtime_role=runtime_role)

        table_populations_route.Store = TestStore
        self._orig_relay = table_population.get_session_relay()
        table_population.set_session_relay(_FakeRelay())

        self.owner_user = {
            "id": "u_owner",
            "username": "clinician",
            "role": "clinician",
        }
        self.other_user = {
            "id": "u_other",
            "username": "clinician2",
            "role": "clinician",
        }
        self.admin_user = {"id": "u_admin", "username": "admin", "role": "admin"}
        for user in (self.owner_user, self.other_user, self.admin_user):
            auth_store.create_user(
                user["id"],
                user["username"],
                "hash",
                "salt",
                "2026-01-01T00:00:00+00:00",
            )

    def tearDown(self) -> None:
        table_populations_route.Store = self._orig_store_cls
        table_population.set_session_relay(self._orig_relay)
        table_populations_route._TABLE_POPULATION_SESSION_TASKS.clear()
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        table_populations_route.ARTIFACTS_DIR = self._orig_runs_dir
        self.tmpdir.cleanup()

    @staticmethod
    def _request_for(user: dict[str, str] | None):
        return SimpleNamespace(
            state=SimpleNamespace(user=user, user_id=(user or {}).get("id"))
        )

    def _seed_run(self, *, run_id: str, owner_user_id: str | None) -> None:
        store = Store(self.state_db, runtime_role="api_app")
        try:
            store.create_run(Run(id=run_id, audit_id="a1", user_id=owner_user_id))
        finally:
            store.close()
        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)

    # ---- stop ----

    def test_owner_can_stop_their_run(self):
        self._seed_run(run_id="r_stop", owner_user_id=self.owner_user["id"])
        out = asyncio.run(
            table_populations_route.stop_table_population(
                "r_stop", self._request_for(self.owner_user)
            )
        )
        self.assertEqual(out, {"status": "stopped"})
        self.assertEqual(
            table_population.get_session_relay().stop_requested, ["r_stop"]
        )

    def test_non_owner_cannot_stop_run(self):
        self._seed_run(run_id="r_stop2", owner_user_id=self.owner_user["id"])
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                table_populations_route.stop_table_population(
                    "r_stop2", self._request_for(self.other_user)
                )
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("ownership", str(ctx.exception.detail).lower())
        # Ownership fails closed BEFORE the runner is touched.
        self.assertEqual(table_population.get_session_relay().stop_requested, [])

    def test_admin_gets_no_override_on_stop(self):
        # ADR-0003 #3: admin is a clinical peer — no ownership override.
        self._seed_run(run_id="r_stop3", owner_user_id=self.owner_user["id"])
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                table_populations_route.stop_table_population(
                    "r_stop3", self._request_for(self.admin_user)
                )
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(table_population.get_session_relay().stop_requested, [])

    def test_missing_run_stop_returns_404(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                table_populations_route.stop_table_population(
                    "nope", self._request_for(self.owner_user)
                )
            )
        self.assertEqual(ctx.exception.status_code, 404)

    def test_unauthenticated_stop_returns_401(self):
        self._seed_run(run_id="r_stop4", owner_user_id=self.owner_user["id"])
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                table_populations_route.stop_table_population(
                    "r_stop4", self._request_for(None)
                )
            )
        self.assertEqual(ctx.exception.status_code, 401)

    # ---- stream ----

    def test_owner_can_stream_their_run(self):
        self._seed_run(run_id="r_stream", owner_user_id=self.owner_user["id"])
        resp = asyncio.run(
            table_populations_route.stream_table_population_events(
                "r_stream", self._request_for(self.owner_user)
            )
        )
        # Owner gets the SSE stream (media type confirms the stream opened).
        self.assertEqual(resp.media_type, "text/event-stream")

    def test_non_owner_cannot_stream_run(self):
        self._seed_run(run_id="r_stream2", owner_user_id=self.owner_user["id"])
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                table_populations_route.stream_table_population_events(
                    "r_stream2", self._request_for(self.other_user)
                )
            )
        self.assertEqual(ctx.exception.status_code, 403)
        # The stream must never open for a non-owner.
        self.assertEqual(table_population.get_session_relay().streamed, [])

    def test_admin_gets_no_override_on_stream(self):
        self._seed_run(run_id="r_stream3", owner_user_id=self.owner_user["id"])
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                table_populations_route.stream_table_population_events(
                    "r_stream3", self._request_for(self.admin_user)
                )
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_missing_run_stream_returns_404(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                table_populations_route.stream_table_population_events(
                    "nope", self._request_for(self.owner_user)
                )
            )
        self.assertEqual(ctx.exception.status_code, 404)

    def test_unauthenticated_stream_returns_401(self):
        self._seed_run(run_id="r_stream4", owner_user_id=self.owner_user["id"])
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                table_populations_route.stream_table_population_events(
                    "r_stream4", self._request_for(None)
                )
            )
        self.assertEqual(ctx.exception.status_code, 401)

    # ---- refresh ----

    def _seed_refreshable_run(self, *, run_id: str, owner_user_id: str | None) -> None:
        """A completed, refreshable run: store row carrying the 'completed'
        population lifecycle record (#326 step 2 — the refresh gate reads the
        run row's population_status, not status.json)."""
        store = Store(self.state_db, runtime_role="api_app")
        try:
            store.create_run(
                Run(
                    id=run_id,
                    audit_id="a1",
                    user_id=owner_user_id,
                    database_ids=["db1"],
                    status="completed",
                )
            )
            store.record_population_status(run_id, "completed")
        finally:
            store.close()
        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)

    def test_owner_can_refresh_their_run(self):
        self._seed_refreshable_run(run_id="r_ref", owner_user_id=self.owner_user["id"])
        started: dict[str, object] = {}
        original = table_populations_route._launch_table_population_session
        try:
            table_populations_route._launch_table_population_session = lambda *a, **k: (
                started.setdefault("called", a)
            )
            out = asyncio.run(
                table_populations_route.refresh_table_population(
                    "r_ref", self._request_for(self.owner_user)
                )
            )
        finally:
            table_populations_route._launch_table_population_session = original
        self.assertEqual(out.status, "started")
        self.assertIn("called", started)

    def test_non_owner_cannot_refresh_run(self):
        self._seed_refreshable_run(run_id="r_ref2", owner_user_id=self.owner_user["id"])
        started: list[object] = []
        original = table_populations_route._launch_table_population_session
        try:
            table_populations_route._launch_table_population_session = lambda *a, **k: (
                started.append(a)
            )
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    table_populations_route.refresh_table_population(
                        "r_ref2", self._request_for(self.other_user)
                    )
                )
        finally:
            table_populations_route._launch_table_population_session = original
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(started, [])  # the refresh never started

    def test_admin_gets_no_override_on_refresh(self):
        self._seed_refreshable_run(run_id="r_ref3", owner_user_id=self.owner_user["id"])
        original = table_populations_route._launch_table_population_session
        try:
            table_populations_route._launch_table_population_session = lambda *a, **k: (
                None
            )
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    table_populations_route.refresh_table_population(
                        "r_ref3", self._request_for(self.admin_user)
                    )
                )
        finally:
            table_populations_route._launch_table_population_session = original
        self.assertEqual(ctx.exception.status_code, 403)

    def test_unauthenticated_refresh_returns_401(self):
        self._seed_refreshable_run(run_id="r_ref4", owner_user_id=self.owner_user["id"])
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                table_populations_route.refresh_table_population(
                    "r_ref4", self._request_for(None)
                )
            )
        self.assertEqual(ctx.exception.status_code, 401)

    def test_refresh_missing_run_still_404(self):
        # Pre-existing 404 semantics preserved (run dir absent) AND the STRUCTURED
        # RUN_NOT_FOUND body survives the owner gate — the FE's refreshConflict.js
        # branches on `detail.code`, so the owner-only gate must not flatten it to a
        # plain-string 404 (it runs the real, un-stubbed gate here).
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                table_populations_route.refresh_table_population(
                    "nope", self._request_for(self.owner_user)
                )
            )
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail["code"], "TABLE_POPULATION_NOT_FOUND")

    def test_refresh_non_refreshable_status_still_409(self):
        # A run still running is not refreshable — owner gets the existing 409.
        run_id = "r_ref_409"
        store = Store(self.state_db, runtime_role="api_app")
        try:
            store.create_run(
                Run(
                    id=run_id,
                    audit_id="a1",
                    user_id=self.owner_user["id"],
                    database_ids=["db1"],
                    status="in_progress",
                )
            )
            # The gate reads the run row's lifecycle record (#326 step 2).
            store.record_population_status(run_id, "running")
        finally:
            store.close()
        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                table_populations_route.refresh_table_population(
                    run_id, self._request_for(self.owner_user)
                )
            )
        self.assertEqual(ctx.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
