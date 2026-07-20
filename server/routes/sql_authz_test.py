"""Permission gate for POST /api/sql — the clinical-read key dataset.query.

§14 enforcement fold-ins (auth-and-access §14; control-plane contract §4/§9).
``execute_sql`` authenticated the caller (for query-log attribution) but had NO
permission gate, so any authenticated session could run ad-hoc SELECTs over
clinical data. It now requires ``dataset.query`` (the clinical-read key — there
is NO ``database.query``). The read-only SELECT guard (422 for non-SELECT) and
the query_log attribution write must still hold for an authorized caller.
"""

from __future__ import annotations

import asyncio
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException

from server.auth import store as auth_store
from server.models import SqlQuery
from server.routes import sql


class ExecuteSqlAuthzTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmpdir.name)
        self.auth_db = self.tmp_path / "state.db"

        self._orig_auth_db = auth_store.AUTH_DB_PATH
        auth_store.AUTH_DB_PATH = self.auth_db
        auth_store.init_store()

        # A real on-disk SQLite the happy path can SELECT from.
        self.databases_dir = self.tmp_path / "databases"
        self.database_slug = "ehr-db"
        (self.databases_dir / self.database_slug).mkdir(parents=True)
        self.db_path = self.databases_dir / self.database_slug / "database.sqlite"
        conn = sqlite3.connect(self.db_path)
        conn.execute("CREATE TABLE patients (id INTEGER, name TEXT)")
        conn.execute("INSERT INTO patients VALUES (1, 'Ada')")
        conn.commit()
        conn.close()
        self._orig_databases_dir = sql.DATABASES_DIR
        sql.DATABASES_DIR = self.databases_dir

        self.clinician = {"id": "u_clin", "username": "clinician", "role": "clinician"}
        self.agent = {"id": "u_agent", "username": "agent", "role": "agent"}
        for user in (self.clinician, self.agent):
            auth_store.create_user(
                user["id"],
                user["username"],
                "hash",
                "salt",
                "2026-01-01T00:00:00+00:00",
            )

    def tearDown(self) -> None:
        sql.DATABASES_DIR = self._orig_databases_dir
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        self.tmpdir.cleanup()

    @staticmethod
    def _request_for(user: dict[str, str] | None):
        return SimpleNamespace(
            state=SimpleNamespace(user=user, user_id=(user or {}).get("id"))
        )

    def _body(self, query: str = "SELECT * FROM patients") -> SqlQuery:
        return SqlQuery(query=query, database=self.database_slug)

    def test_session_without_dataset_query_is_denied(self):
        # agent role holds no permissions — no dataset.query → 403.
        req = self._request_for(self.agent)
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(sql.execute_sql(self._body(), req))
        self.assertEqual(ctx.exception.status_code, 403)
        # Nothing was logged for the denied caller.
        self.assertEqual(auth_store.list_queries_for_user(self.agent["id"]), [])

    def test_authorized_clinician_runs_read_only_and_logs(self):
        # clinician holds dataset.query → 200, and a query_log row is written.
        req = self._request_for(self.clinician)
        resp = asyncio.run(sql.execute_sql(self._body(), req))
        self.assertEqual(resp.row_count, 1)
        self.assertEqual(resp.columns, ["id", "name"])
        self.assertEqual(resp.rows, [[1, "Ada"]])
        logged = auth_store.list_queries_for_user(self.clinician["id"])
        self.assertEqual(len(logged), 1)
        self.assertEqual(logged[0]["query"], "SELECT * FROM patients")
        self.assertEqual(logged[0]["user_id"], self.clinician["id"])

    def test_non_select_still_422_for_authorized_caller(self):
        req = self._request_for(self.clinician)
        body = SqlQuery(query="DELETE FROM patients", database=self.database_slug)
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(sql.execute_sql(body, req))
        self.assertEqual(ctx.exception.status_code, 422)

    def test_unauthenticated_returns_401(self):
        req = self._request_for(None)
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(sql.execute_sql(self._body(), req))
        self.assertEqual(ctx.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
