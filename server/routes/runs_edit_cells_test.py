"""Authorization + field-scope tests for clinician runtime cell edits."""

from __future__ import annotations

import asyncio
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException

from core.store import Cell, Run, RuntimePermissionDenied, Store
from server.auth import store as auth_store
from server.models import RunCellEditRequest
from server.routes import runs


class RunCellEditAuthzTest(unittest.TestCase):
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

        self.owner_user = {"id": "u_owner", "username": "clinician"}
        self.other_user = {"id": "u_other", "username": "clinician2"}
        self.agent_user = {"id": "u_agent", "username": "agent"}
        self.admin_user = {"id": "u_admin", "username": "admin"}

        for user in (self.owner_user, self.other_user, self.agent_user, self.admin_user):
            auth_store.create_user(
                user["id"],
                user["username"],
                "hash",
                "salt",
                "2026-01-01T00:00:00+00:00",
            )

    def tearDown(self) -> None:
        runs.Store = self._orig_store_cls
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        runs.RUNS_DIR = self._orig_runs_dir
        self.tmpdir.cleanup()

    def _seed_run_and_cell(self, *, run_id: str, owner_user_id: str | None, kind: str = "interpret") -> None:
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
        body = RunCellEditRequest(reviewState="reviewed")

        out = asyncio.run(runs.edit_run_cell("r_owner", "ALL!A2", body, req))

        self.assertEqual(out.run_id, "r_owner")
        self.assertEqual(out.ref, "ALL!A2")
        self.assertEqual(out.review_state, "reviewed")

    def test_non_owner_without_admin_override_is_denied(self):
        self._seed_run_and_cell(run_id="r_denied", owner_user_id=self.owner_user["id"])
        req = self._request_for(self.other_user)
        body = RunCellEditRequest(reviewState="reviewed")

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(runs.edit_run_cell("r_denied", "ALL!A2", body, req))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("ownership", str(ctx.exception.detail).lower())

    def test_missing_run_edit_cells_permission_is_denied(self):
        self._seed_run_and_cell(run_id="r_agent", owner_user_id=self.agent_user["id"])
        req = self._request_for(self.agent_user)
        body = RunCellEditRequest(reviewState="reviewed")

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(runs.edit_run_cell("r_agent", "ALL!A2", body, req))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("run.edit_cells", str(ctx.exception.detail))

    def test_admin_override_can_edit_non_owned_run(self):
        self._seed_run_and_cell(run_id="r_admin", owner_user_id=self.owner_user["id"])
        req = self._request_for(self.admin_user)
        body = RunCellEditRequest(reviewState="reviewed")

        out = asyncio.run(runs.edit_run_cell("r_admin", "ALL!A2", body, req))

        self.assertEqual(out.review_state, "reviewed")

    def test_null_run_owner_is_denied_for_non_admin(self):
        self._seed_run_and_cell(run_id="r_no_owner", owner_user_id=None)
        req = self._request_for(self.owner_user)
        body = RunCellEditRequest(reviewState="reviewed")

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(runs.edit_run_cell("r_no_owner", "ALL!A2", body, req))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("ownership", str(ctx.exception.detail).lower())

    def test_non_interpret_cell_is_rejected(self):
        self._seed_run_and_cell(run_id="r_direct", owner_user_id=self.owner_user["id"], kind="direct")
        req = self._request_for(self.owner_user)
        body = RunCellEditRequest(reviewState="reviewed")

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(runs.edit_run_cell("r_direct", "ALL!A2", body, req))
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("interpret", str(ctx.exception.detail).lower())

    def test_value_edit_requires_corrected_true(self):
        self._seed_run_and_cell(run_id="r_value", owner_user_id=self.owner_user["id"])
        req = self._request_for(self.owner_user)
        body = RunCellEditRequest(value="new-value")

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(runs.edit_run_cell("r_value", "ALL!A2", body, req))
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("corrected=true", str(ctx.exception.detail))

    def test_value_edit_allowed_when_corrected_true(self):
        self._seed_run_and_cell(run_id="r_value_ok", owner_user_id=self.owner_user["id"])
        req = self._request_for(self.owner_user)
        body = RunCellEditRequest(corrected=True, value="new-value")

        out = asyncio.run(runs.edit_run_cell("r_value_ok", "ALL!A2", body, req))

        self.assertTrue(out.corrected)
        self.assertEqual(out.value, "new-value")

    def test_empty_edit_payload_is_rejected(self):
        self._seed_run_and_cell(run_id="r_empty", owner_user_id=self.owner_user["id"])
        req = self._request_for(self.owner_user)
        body = RunCellEditRequest()

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(runs.edit_run_cell("r_empty", "ALL!A2", body, req))
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("No editable fields", str(ctx.exception.detail))

    def test_review_state_only_allows_reviewed(self):
        self._seed_run_and_cell(run_id="r_review_state", owner_user_id=self.owner_user["id"])
        req = self._request_for(self.owner_user)
        body = RunCellEditRequest(reviewState="not_reviewed")

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(runs.edit_run_cell("r_review_state", "ALL!A2", body, req))
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("only be set to 'reviewed'", str(ctx.exception.detail))

    def test_store_permission_denial_returns_consistent_safe_403(self):
        self._seed_run_and_cell(run_id="r_perm", owner_user_id=self.owner_user["id"])
        req = self._request_for(self.owner_user)
        body = RunCellEditRequest(reviewState="reviewed")

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

        original = runs.Store
        runs.Store = DenyingClinicianStore
        try:
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(runs.edit_run_cell("r_perm", "ALL!A2", body, req))
        finally:
            runs.Store = original
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "Permission denied.")

    def test_event_append_permission_denial_does_not_return_false_403(self):
        self._seed_run_and_cell(run_id="r_event_perm", owner_user_id=self.owner_user["id"])
        req = self._request_for(self.owner_user)
        body = RunCellEditRequest(reviewState="reviewed")

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

        original = runs.Store
        runs.Store = EventDenyingStore
        try:
            out = asyncio.run(runs.edit_run_cell("r_event_perm", "ALL!A2", body, req))
        finally:
            runs.Store = original

        self.assertEqual(out.review_state, "reviewed")

    def test_create_run_passes_authenticated_user_id_to_start_spine(self):
        run_id = "r_new_owner"
        audit_excel = self.tmp_path / "audit.xlsx"
        audit_excel.write_bytes(b"PK")
        captured: dict[str, object] = {}

        class Req:
            headers = {"content-type": "application/json"}

            def __init__(self, user_id: str) -> None:
                self.state = SimpleNamespace(user_id=user_id)

            async def json(self):
                return {"auditId": "a1", "filters": {}, "database": "db1", "prompt": "p"}

        original_new_run_id = runs.run_engine.new_run_id
        original_resolve_excel = runs._resolve_audit_excel
        original_start_spine = runs._start_spine_run
        try:
            runs.run_engine.new_run_id = lambda: run_id
            runs._resolve_audit_excel = lambda _audit_id: audit_excel

            def fake_start_spine(
                run_id: str,
                run_dir: Path,
                audit_id: str,
                database_id: str | None,
                filters: dict[str, str],
                workbook_path: Path,
                user_id: str | None,
            ) -> None:
                captured["run_id"] = run_id
                captured["user_id"] = user_id

            runs._start_spine_run = fake_start_spine
            out = asyncio.run(runs.create_run(Req(self.owner_user["id"])))
        finally:
            runs.run_engine.new_run_id = original_new_run_id
            runs._resolve_audit_excel = original_resolve_excel
            runs._start_spine_run = original_start_spine

        self.assertEqual(out.run_id, run_id)
        self.assertEqual(captured["run_id"], run_id)
        self.assertEqual(captured["user_id"], self.owner_user["id"])

    def test_run_spine_persists_owner_user_id_to_state_run_row(self):
        run_id = "r_spine_owner"
        run_dir = self.tmp_path / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        workbook_path = run_dir / "result.xlsx"
        workbook_path.write_bytes(b"PK")

        database_id = "db1"
        database_dir = self.tmp_path / "databases" / database_id
        database_dir.mkdir(parents=True, exist_ok=True)
        sqlite_path = database_dir / "database.sqlite"
        sqlite3.connect(sqlite_path).close()

        original_databases_dir = runs.DATABASES_DIR
        original_read_sheets = runs.read_workbook_sheets
        original_read_json = runs._read_json
        original_ensure_mapping = runs.mapping_phase.ensure_mapping
        original_resolve_filters = runs._resolve_runtime_filter_predicates
        original_resolve_cohort = runs._resolve_cohort
        original_resolve_cohort_tables = runs._resolve_cohort_tables
        original_orchestrate = runs.run_engine.orchestrate_run
        try:
            runs.DATABASES_DIR = self.tmp_path / "databases"
            runs.read_workbook_sheets = lambda _path: []
            runs._read_json = lambda _path: {"fields": []}
            async def fake_ensure_mapping(*_args, **_kwargs):
                return json.dumps({"executable": {"identity_keys": ["id"], "cohort": {"from": "stub"}}})

            runs.mapping_phase.ensure_mapping = fake_ensure_mapping
            runs._resolve_runtime_filter_predicates = lambda *_args, **_kwargs: ("", [])
            runs._resolve_cohort = lambda *_args, **_kwargs: ["m1"]
            runs._resolve_cohort_tables = lambda *_args, **_kwargs: {"stub": ["stub_table"]}

            async def fake_orchestrate_run(*_args, **_kwargs):
                return None

            runs.run_engine.orchestrate_run = fake_orchestrate_run

            asyncio.run(
                runs._run_spine(
                    run_id=run_id,
                    run_dir=run_dir,
                    audit_id="a1",
                    database_id=database_id,
                    filters={},
                    workbook_path=workbook_path,
                    user_id=self.owner_user["id"],
                )
            )
        finally:
            runs.DATABASES_DIR = original_databases_dir
            runs.read_workbook_sheets = original_read_sheets
            runs._read_json = original_read_json
            runs.mapping_phase.ensure_mapping = original_ensure_mapping
            runs._resolve_runtime_filter_predicates = original_resolve_filters
            runs._resolve_cohort = original_resolve_cohort
            runs._resolve_cohort_tables = original_resolve_cohort_tables
            runs.run_engine.orchestrate_run = original_orchestrate

        store = Store(self.state_db, runtime_role="api_app")
        try:
            run = store.get_run(run_id)
        finally:
            store.close()
        self.assertIsNotNone(run)
        self.assertEqual(run.user_id, self.owner_user["id"])


if __name__ == "__main__":
    unittest.main()
