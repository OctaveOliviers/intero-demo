"""Owner-or-table-grant enforcement for table-population read outputs.

The table view reuses the existing table-population endpoints for status,
workbook snapshot, and workbook download. Those endpoints must therefore allow
the table-population owner and a caller with an active grant on a persisted table
wrapping the table population, but deny every other clinical peer (including
admin-as-peer).
"""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException
from starlette.responses import StreamingResponse

from core.store import Cell, Run, Store
from core.tables import store as table_store
from server.auth import grants as grant_store
from server.auth import store as auth_store
from server.routes import table_populations as table_populations_route
from server.routes import workbook as workbook_route


def _request_for(user):
    return SimpleNamespace(
        state=SimpleNamespace(user=user, user_id=(user or {}).get("id"))
    )


class TablePopulationReadAccessTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmpdir.name)
        self.auth_db = self.tmp_path / "auth.sqlite"
        self.legacy_auth_db = self.tmp_path / "legacy-auth.sqlite"
        self.state_db = self.tmp_path / "state.db"
        self.runs_dir = self.tmp_path / "runs"
        self.audits_dir = self.tmp_path / "audits"
        self.runs_dir.mkdir(parents=True, exist_ok=True)

        self._orig_auth_db = auth_store.AUTH_DB_PATH
        self._orig_legacy_auth_db = auth_store.LEGACY_AUTH_DB_PATH
        auth_store.AUTH_DB_PATH = self.auth_db
        auth_store.LEGACY_AUTH_DB_PATH = self.legacy_auth_db
        auth_store.init_store()

        self._orig_runs_dir = table_populations_route.ARTIFACTS_DIR
        table_populations_route.ARTIFACTS_DIR = self.runs_dir
        self._orig_workbook_runs_dir = workbook_route.ARTIFACTS_DIR
        workbook_route.ARTIFACTS_DIR = self.runs_dir
        self._orig_audits_dir = workbook_route.TEMPLATES_DIR
        workbook_route.TEMPLATES_DIR = self.audits_dir
        self._orig_table_db = table_store.TABLE_DB_PATH
        table_store.TABLE_DB_PATH = self.tmp_path / "table-state.db"

        self._orig_table_population_store = table_populations_route.Store
        self._orig_workbook_store = workbook_route.Store
        state_db = self.state_db

        class TestStore(Store):
            def __init__(self, path=None, *, runtime_role="api_app") -> None:
                super().__init__(state_db, runtime_role=runtime_role)

        table_populations_route.Store = TestStore
        workbook_route.Store = TestStore

        self.owner = {"id": "u_owner", "username": "owner", "role": "clinician"}
        self.grantee = {"id": "u_b", "username": "bee", "role": "clinician"}
        self.stranger = {"id": "u_c", "username": "cee", "role": "clinician"}
        self.admin = {"id": "u_admin", "username": "admin", "role": "admin"}
        self.agent = {"id": "u_agent", "username": "agent", "role": "agent"}

    def tearDown(self) -> None:
        table_populations_route.Store = self._orig_table_population_store
        workbook_route.Store = self._orig_workbook_store
        table_populations_route.ARTIFACTS_DIR = self._orig_runs_dir
        workbook_route.ARTIFACTS_DIR = self._orig_workbook_runs_dir
        workbook_route.TEMPLATES_DIR = self._orig_audits_dir
        table_store.TABLE_DB_PATH = self._orig_table_db
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        auth_store.LEGACY_AUTH_DB_PATH = self._orig_legacy_auth_db
        self.tmpdir.cleanup()

    def _seed_run(self, *, run_id: str = "run-1", owner_id: str = "u_owner") -> None:
        store = Store(self.state_db, runtime_role="api_app")
        try:
            store.create_run(
                Run(id=run_id, audit_id="npda", user_id=owner_id, status="completed")
            )
            store.upsert_cell(
                Cell(
                    run_id=run_id,
                    ref="ALL!A2",
                    field="member",
                    member="P1",
                    kind="direct",
                    state="filled",
                    value="P1",
                    sources=[
                        {
                            "database": "db",
                            "query": "SELECT 1",
                            "table_column": "patients.id",
                        }
                    ],
                )
            )
        finally:
            store.close()
        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        (run_dir / "status.json").write_text(
            '{"status": "completed"}', encoding="utf-8"
        )

    def _grant_table_for_run(
        self,
        *,
        run_id: str = "run-1",
        subject_id: str = "u_b",
        expires_at: str | None = None,
    ) -> dict:
        table = table_store.new_table(
            title="Shared output",
            source_template="npda",
            table_population_id=run_id,
            status="complete",
        )
        table_store.save_table(table)
        grant_store.self_grant_manage(
            resource_type="table", resource_id=table["id"], user_id=self.owner["id"]
        )
        return grant_store.create_grant(
            subject_type="user",
            subject_id=subject_id,
            resource_type="table",
            resource_id=table["id"],
            grant_type="read",
            granted_by=self.owner["id"],
            expires_at=expires_at,
        )

    def _assert_outputs_succeed(self, user) -> None:
        state = asyncio.run(
            table_populations_route.get_table_population_state(
                "run-1", _request_for(user)
            )
        )
        self.assertEqual(state.table_population_id, "run-1")
        workbook = asyncio.run(workbook_route.get_workbook("run-1", _request_for(user)))
        self.assertEqual(workbook.resultStatus, "completed")
        download = asyncio.run(
            workbook_route.download_workbook("run-1", _request_for(user))
        )
        self.assertIsInstance(download, StreamingResponse)

    def _assert_outputs_denied(self, user, status_code: int) -> None:
        calls = (
            lambda: table_populations_route.get_table_population_state(
                "run-1", _request_for(user)
            ),
            lambda: workbook_route.get_workbook("run-1", _request_for(user)),
            lambda: workbook_route.download_workbook("run-1", _request_for(user)),
        )
        for call in calls:
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(call())
            self.assertEqual(ctx.exception.status_code, status_code)

    def test_owner_can_read_status_workbook_and_download(self) -> None:
        self._seed_run()
        self._assert_outputs_succeed(self.owner)

    def test_table_grantee_can_read_status_workbook_and_download(self) -> None:
        self._seed_run()
        self._grant_table_for_run()
        self._assert_outputs_succeed(self.grantee)

    def test_non_grantee_is_denied_all_table_population_outputs(self) -> None:
        self._seed_run()
        self._grant_table_for_run()
        self._assert_outputs_denied(self.stranger, 403)

    def test_admin_gets_no_override_for_table_population_outputs(self) -> None:
        self._seed_run()
        self._assert_outputs_denied(self.admin, 403)

    def test_revoked_table_grant_fail_closes_table_population_outputs(self) -> None:
        self._seed_run()
        grant = self._grant_table_for_run()
        self._assert_outputs_succeed(self.grantee)
        grant_store.revoke_grant(grant["id"])
        self._assert_outputs_denied(self.grantee, 403)

    def test_expired_table_grant_fail_closes_table_population_outputs(self) -> None:
        self._seed_run()
        self._grant_table_for_run(expires_at="2000-01-01T00:00:00+00:00")
        self._assert_outputs_denied(self.grantee, 403)

    def test_unauthenticated_table_population_outputs_return_401(self) -> None:
        self._seed_run()
        self._assert_outputs_denied(None, 401)

    def test_missing_table_population_outputs_return_404(self) -> None:
        calls = (
            lambda: table_populations_route.get_table_population_state(
                "missing-run", _request_for(self.owner)
            ),
            lambda: workbook_route.get_workbook(
                "missing-run", _request_for(self.owner)
            ),
            lambda: workbook_route.download_workbook(
                "missing-run", _request_for(self.owner)
            ),
        )
        for call in calls:
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(call())
            self.assertEqual(ctx.exception.status_code, 404)

    def test_role_without_table_population_read_is_denied(self) -> None:
        self._seed_run(owner_id=self.agent["id"])
        self._assert_outputs_denied(self.agent, 403)


if __name__ == "__main__":
    unittest.main()
