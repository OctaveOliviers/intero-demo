"""Authorization + field-scope tests for clinician runtime cell edits."""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException

from core.store import Cell, Run, RuntimePermissionDenied, Store
from server.auth import store as auth_store
from server.models import TablePopulationCellEditRequest
from server.routes import table_populations

route = table_populations


class TablePopulationCellEditAuthzTest(unittest.TestCase):
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
        self._orig_runs_dir = route.ARTIFACTS_DIR
        route.ARTIFACTS_DIR = self.runs_dir

        self._orig_store_cls = route.Store
        state_db = self.state_db

        class TestStore(Store):
            def __init__(self, path=None, *, runtime_role="api_app") -> None:
                super().__init__(state_db, runtime_role=runtime_role)

        route.Store = TestStore

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
        self.agent_user = {"id": "u_agent", "username": "agent", "role": "agent"}
        self.admin_user = {"id": "u_admin", "username": "admin", "role": "admin"}

        for user in (
            self.owner_user,
            self.other_user,
            self.agent_user,
            self.admin_user,
        ):
            auth_store.create_user(
                user["id"],
                user["username"],
                "hash",
                "salt",
                "2026-01-01T00:00:00+00:00",
            )

    def tearDown(self) -> None:
        route.Store = self._orig_store_cls
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        route.ARTIFACTS_DIR = self._orig_runs_dir
        self.tmpdir.cleanup()

    def _seed_run_and_cell(
        self, *, run_id: str, owner_user_id: str | None, kind: str = "interpret"
    ) -> None:
        store = Store(self.state_db, runtime_role="api_app")
        try:
            store.create_run(Run(id=run_id, audit_id="a1", user_id=owner_user_id))
            store.upsert_cell(
                Cell(
                    run_id=run_id,
                    ref="ALL!A2",
                    field="f1",
                    member="m1",
                    kind=kind,
                    state="pending",
                )
            )
        finally:
            store.close()

    @staticmethod
    def _request_for(user: dict[str, str]):
        return SimpleNamespace(state=SimpleNamespace(user=user, user_id=user["id"]))

    def test_owner_with_run_edit_cells_permission_can_edit(self):
        self._seed_run_and_cell(run_id="r_owner", owner_user_id=self.owner_user["id"])
        req = self._request_for(self.owner_user)
        body = TablePopulationCellEditRequest(reviewState="reviewed")

        out = asyncio.run(
            route.edit_table_population_cell("r_owner", "ALL!A2", body, req)
        )

        self.assertEqual(out.table_population_id, "r_owner")
        self.assertEqual(out.ref, "ALL!A2")
        self.assertEqual(out.review_state, "reviewed")

    def test_non_owner_without_admin_override_is_denied(self):
        self._seed_run_and_cell(run_id="r_denied", owner_user_id=self.owner_user["id"])
        req = self._request_for(self.other_user)
        body = TablePopulationCellEditRequest(reviewState="reviewed")

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                route.edit_table_population_cell("r_denied", "ALL!A2", body, req)
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("ownership", str(ctx.exception.detail).lower())

    def test_missing_run_edit_cells_permission_is_denied(self):
        self._seed_run_and_cell(run_id="r_agent", owner_user_id=self.agent_user["id"])
        req = self._request_for(self.agent_user)
        body = TablePopulationCellEditRequest(reviewState="reviewed")

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                route.edit_table_population_cell("r_agent", "ALL!A2", body, req)
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("table_population.edit_cells", str(ctx.exception.detail))

    def test_admin_is_a_peer_and_cannot_edit_non_owned_run(self):
        # ADR 0003: admin is a clinical peer, not a superuser — no override on
        # another user's run. Editing a run it does not own is denied for
        # ownership (it still holds table_population.edit_cells as a clinician-superset).
        self._seed_run_and_cell(run_id="r_admin", owner_user_id=self.owner_user["id"])
        req = self._request_for(self.admin_user)
        body = TablePopulationCellEditRequest(reviewState="reviewed")

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                route.edit_table_population_cell("r_admin", "ALL!A2", body, req)
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("ownership", str(ctx.exception.detail).lower())

    def test_admin_can_edit_its_own_run(self):
        # The peer model still lets admin edit runs it owns.
        self._seed_run_and_cell(
            run_id="r_admin_owned", owner_user_id=self.admin_user["id"]
        )
        req = self._request_for(self.admin_user)
        body = TablePopulationCellEditRequest(reviewState="reviewed")

        out = asyncio.run(
            route.edit_table_population_cell("r_admin_owned", "ALL!A2", body, req)
        )

        self.assertEqual(out.review_state, "reviewed")

    def test_null_run_owner_is_denied_for_non_admin(self):
        self._seed_run_and_cell(run_id="r_no_owner", owner_user_id=None)
        req = self._request_for(self.owner_user)
        body = TablePopulationCellEditRequest(reviewState="reviewed")

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                route.edit_table_population_cell("r_no_owner", "ALL!A2", body, req)
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("ownership", str(ctx.exception.detail).lower())

    def test_non_interpret_cell_is_rejected(self):
        self._seed_run_and_cell(
            run_id="r_direct", owner_user_id=self.owner_user["id"], kind="direct"
        )
        req = self._request_for(self.owner_user)
        body = TablePopulationCellEditRequest(reviewState="reviewed")

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                route.edit_table_population_cell("r_direct", "ALL!A2", body, req)
            )
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("interpret", str(ctx.exception.detail).lower())

    def test_value_edit_requires_corrected_true(self):
        self._seed_run_and_cell(run_id="r_value", owner_user_id=self.owner_user["id"])
        req = self._request_for(self.owner_user)
        body = TablePopulationCellEditRequest(value="new-value")

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                route.edit_table_population_cell("r_value", "ALL!A2", body, req)
            )
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("corrected=true", str(ctx.exception.detail))

    def test_value_edit_allowed_when_corrected_true(self):
        self._seed_run_and_cell(
            run_id="r_value_ok", owner_user_id=self.owner_user["id"]
        )
        req = self._request_for(self.owner_user)
        body = TablePopulationCellEditRequest(corrected=True, value="new-value")

        out = asyncio.run(
            route.edit_table_population_cell("r_value_ok", "ALL!A2", body, req)
        )

        self.assertTrue(out.corrected)
        self.assertEqual(out.value, "new-value")

    def test_empty_edit_payload_is_rejected(self):
        self._seed_run_and_cell(run_id="r_empty", owner_user_id=self.owner_user["id"])
        req = self._request_for(self.owner_user)
        body = TablePopulationCellEditRequest()

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                route.edit_table_population_cell("r_empty", "ALL!A2", body, req)
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("No editable fields", str(ctx.exception.detail))

    def test_review_state_only_allows_reviewed(self):
        self._seed_run_and_cell(
            run_id="r_review_state", owner_user_id=self.owner_user["id"]
        )
        req = self._request_for(self.owner_user)
        body = TablePopulationCellEditRequest(reviewState="not_reviewed")

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                route.edit_table_population_cell("r_review_state", "ALL!A2", body, req)
            )
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("only be set to 'reviewed'", str(ctx.exception.detail))

    def test_store_permission_denial_returns_consistent_safe_403(self):
        self._seed_run_and_cell(run_id="r_perm", owner_user_id=self.owner_user["id"])
        req = self._request_for(self.owner_user)
        body = TablePopulationCellEditRequest(reviewState="reviewed")

        state_db = self.state_db

        class DenyingClinicianStore(Store):
            def __init__(self, path=None, *, runtime_role="api_app") -> None:
                super().__init__(state_db, runtime_role=runtime_role)

            def with_runtime_role(self, runtime_role: str) -> "DenyingClinicianStore":
                return DenyingClinicianStore(runtime_role=runtime_role)

            def update_cell(self, run_id: str, ref: str, **fields):
                if self.runtime_role == "clinician_editor_runtime":
                    raise RuntimePermissionDenied(
                        role=self.runtime_role,
                        table="cells",
                        action="update",
                        columns=tuple(fields.keys()) if fields else None,
                    )
                return super().update_cell(run_id, ref, **fields)

        original = route.Store
        route.Store = DenyingClinicianStore
        try:
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    route.edit_table_population_cell("r_perm", "ALL!A2", body, req)
                )
        finally:
            route.Store = original
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "Permission denied.")

    def test_event_append_permission_denial_does_not_return_false_403(self):
        self._seed_run_and_cell(
            run_id="r_event_perm", owner_user_id=self.owner_user["id"]
        )
        req = self._request_for(self.owner_user)
        body = TablePopulationCellEditRequest(reviewState="reviewed")

        state_db = self.state_db

        class EventDenyingStore(Store):
            def __init__(self, path=None, *, runtime_role="api_app") -> None:
                super().__init__(state_db, runtime_role=runtime_role)

            def with_runtime_role(self, runtime_role: str) -> "EventDenyingStore":
                return EventDenyingStore(runtime_role=runtime_role)

            def append_event(self, event):
                if self.runtime_role == "clinician_editor_runtime":
                    raise RuntimePermissionDenied(
                        role=self.runtime_role,
                        table="events",
                        action="insert",
                        columns=("run_id", "ts", "type", "payload"),
                    )
                return super().append_event(event)

        original = route.Store
        route.Store = EventDenyingStore
        try:
            out = asyncio.run(
                route.edit_table_population_cell("r_event_perm", "ALL!A2", body, req)
            )
        finally:
            route.Store = original

        self.assertEqual(out.review_state, "reviewed")

    def test_create_table_population_passes_authenticated_user_id_to_launcher(self):
        run_id = "r_new_owner"
        captured: dict[str, object] = {}

        class Req:
            headers = {"content-type": "application/json"}

            def __init__(self, user_id: str) -> None:
                self.state = SimpleNamespace(user_id=user_id)

            async def json(self):
                return {
                    "auditId": "a1",
                    "filters": {},
                    "database": "db1",
                    "prompt": "p",
                }

        original_new_table_population_id = (
            route.table_population.new_table_population_id
        )
        original_launcher = route._launch_table_population_session
        try:
            route.table_population.new_table_population_id = lambda: run_id

            def fake_launcher(
                run_id: str,
                run_dir: Path,
                table: dict[str, object],
                execution_id: str | None = None,
                user_id: str | None = None,
                **_kw,
            ) -> None:
                captured["run_id"] = run_id
                captured["user_id"] = user_id

            route._launch_table_population_session = fake_launcher
            out = asyncio.run(route.create_table_population(Req(self.owner_user["id"])))
        finally:
            route.table_population.new_table_population_id = (
                original_new_table_population_id
            )
            route._launch_table_population_session = original_launcher

        self.assertEqual(out.table_population_id, run_id)
        self.assertEqual(captured["run_id"], run_id)
        self.assertEqual(captured["user_id"], self.owner_user["id"])

    def test_table_population_session_persists_owner_user_id_to_state_row(self):
        run_id = "r_session_owner"
        run_dir = self.tmp_path / run_id
        run_dir.mkdir(parents=True, exist_ok=True)

        # Ingredient assembly and the run itself live inside populate_table
        # now — stub it whole (returning the outcome shape the route's
        # bookkeeping reads) so this test pins ONLY the route-side attribution:
        # the durable state row is stamped with the creating user.
        original_orchestrate = route.table_population.populate_table
        try:

            async def fake_orchestrate_run(*_args, **_kwargs):
                return route.table_population.PopulationOutcome(
                    bound_database_ids=[], refresh_stats=None
                )

            route.table_population.populate_table = fake_orchestrate_run

            asyncio.run(
                route._execute_table_population_session(
                    table_population_id=run_id,
                    artifact_dir=run_dir,
                    table={
                        "source_template": "a1",
                        "dataset_id": None,
                        "table_population_id": run_id,
                    },
                    user_id=self.owner_user["id"],
                )
            )
        finally:
            route.table_population.populate_table = original_orchestrate

        store = Store(self.state_db, runtime_role="api_app")
        try:
            run = store.get_run(run_id)
        finally:
            store.close()
        self.assertIsNotNone(run)
        self.assertEqual(run.user_id, self.owner_user["id"])


if __name__ == "__main__":
    unittest.main()
