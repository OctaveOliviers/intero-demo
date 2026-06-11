from __future__ import annotations

import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.auth import service, store
from server.auth.middleware import AuthMiddleware
from server.auth.routes import router as auth_router
from server.routes.runs import router as runs_router
from server.routes.sql import router as sql_router


class AuthSmokeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.auth_db = self.tmp_path / "auth.sqlite"
        self.legacy_auth_db = self.tmp_path / "legacy-auth.sqlite"
        self.sqlite_db = self.tmp_path / "sample.sqlite"
        self.workbook = self.tmp_path / "workbook.xlsx"
        self.workbook.write_bytes(b"test workbook bytes")
        self.run_root = self.tmp_path / "runs"
        self.run_root.mkdir(parents=True, exist_ok=True)

        with sqlite3.connect(self.sqlite_db) as conn:
            conn.execute("CREATE TABLE demo (id INTEGER PRIMARY KEY, value TEXT)")
            conn.execute("INSERT INTO demo (value) VALUES ('ok')")
            conn.commit()

        self.auth_db_patch = patch.object(store, "AUTH_DB_PATH", self.auth_db)
        self.auth_db_patch.start()
        self.legacy_auth_db_patch = patch.object(store, "LEGACY_AUTH_DB_PATH", self.legacy_auth_db)
        self.legacy_auth_db_patch.start()
        store.init_store()
        self.user = service.register_user("alice", "secret")

        app = FastAPI()
        app.add_middleware(AuthMiddleware)
        app.include_router(auth_router)
        app.include_router(sql_router)
        app.include_router(runs_router)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.auth_db_patch.stop()
        self.legacy_auth_db_patch.stop()
        self.tmp.cleanup()

    def test_unauthenticated_protected_route_returns_401(self) -> None:
        res = self.client.post(
            "/api/sql",
            json={"query": "SELECT 1", "database": str(self.sqlite_db)},
        )
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json().get("detail"), "Authentication required")

    def test_login_success_and_failure(self) -> None:
        bad = self.client.post(
            "/api/auth/login",
            json={"username": "alice", "password": "wrong"},
        )
        self.assertEqual(bad.status_code, 401)
        self.assertEqual(bad.json().get("detail"), "Invalid username or password")

        good = self.client.post(
            "/api/auth/login",
            json={"username": "alice", "password": "secret"},
        )
        self.assertEqual(good.status_code, 200)
        body = good.json()
        self.assertEqual(body.get("username"), "alice")
        self.assertEqual(body.get("id"), self.user["id"])
        set_cookie = good.headers.get("set-cookie", "")
        self.assertNotIn("Max-Age=", set_cookie)
        self.assertNotIn("Expires=", set_cookie)

    def test_authenticated_me_and_logout_invalidate_session(self) -> None:
        login = self.client.post(
            "/api/auth/login",
            json={"username": "alice", "password": "secret"},
        )
        self.assertEqual(login.status_code, 200)

        me = self.client.get("/api/auth/me")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json().get("id"), self.user["id"])

        logout = self.client.post("/api/auth/logout")
        self.assertEqual(logout.status_code, 200)
        self.assertEqual(logout.json().get("ok"), True)

        me_after = self.client.get("/api/auth/me")
        self.assertEqual(me_after.status_code, 401)
        self.assertEqual(me_after.json().get("detail"), "Authentication required")

    def test_authenticated_run_and_query_are_attributed_to_user(self) -> None:
        login = self.client.post(
            "/api/auth/login",
            json={"username": "alice", "password": "secret"},
        )
        self.assertEqual(login.status_code, 200)

        query_res = self.client.post(
            "/api/sql",
            json={
                "query": "SELECT value FROM demo ORDER BY id LIMIT 1",
                "database": str(self.sqlite_db),
                "runId": "run-from-sql",
            },
        )
        self.assertEqual(query_res.status_code, 200)
        self.assertEqual(query_res.json().get("rows"), [["ok"]])

        with (
            patch("server.routes.runs.run_engine.new_run_id", return_value="run-smoke-1"),
            patch("server.routes.runs._start_spine_run", return_value=None) as start_spine_mock,
            patch("server.routes.runs._resolve_audit_excel", return_value=self.workbook),
            patch("server.routes.runs.RUNS_DIR", self.run_root),
        ):
            run_res = self.client.post(
                "/api/runs",
                json={"auditId": "audit-smoke", "filters": {"cohort": "all"}},
            )
        self.assertEqual(run_res.status_code, 200)
        self.assertEqual(run_res.json().get("runId"), "run-smoke-1")
        self.assertEqual(start_spine_mock.call_count, 1)

        runs = store.list_runs_for_user(self.user["id"])
        self.assertTrue(any(row.get("run_id") == "run-smoke-1" for row in runs))

        queries = store.list_queries_for_user(self.user["id"])
        self.assertTrue(any(row.get("run_id") == "run-from-sql" for row in queries))
        self.assertTrue(all(row.get("user_id") == self.user["id"] for row in queries))

    def test_session_idle_timeout_invalidation_reason(self) -> None:
        t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
        with patch("server.auth.service._now", return_value=t0):
            token = service.start_session(self.user["id"])

        with patch("server.auth.service._now", return_value=t0 + timedelta(minutes=29)):
            user = service.resolve_session(token)
        self.assertIsNotNone(user)
        self.assertEqual(user["id"], self.user["id"])

        with patch("server.auth.service._now", return_value=t0 + timedelta(minutes=60)):
            expired_user = service.resolve_session(token)
        self.assertIsNone(expired_user)

        session = store.get_session(token)
        self.assertIsNotNone(session)
        self.assertIsNotNone(session.get("invalidated_at"))
        self.assertEqual(session.get("invalidation_reason"), "idle_timeout")

    def test_session_hard_expiry_invalidation_reason(self) -> None:
        t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
        with patch("server.auth.service._now", return_value=t0):
            token = service.start_session(self.user["id"])

        # Keep the session active (touch < idle timeout) up to near 8h.
        for minute in range(20, (8 * 60), 20):
            with patch("server.auth.service._now", return_value=t0 + timedelta(minutes=minute)):
                user = service.resolve_session(token)
            self.assertIsNotNone(user)
            self.assertEqual(user["id"], self.user["id"])

        with patch("server.auth.service._now", return_value=t0 + timedelta(hours=8, minutes=1)):
            expired_user = service.resolve_session(token)
        self.assertIsNone(expired_user)

        session = store.get_session(token)
        self.assertIsNotNone(session)
        self.assertIsNotNone(session.get("invalidated_at"))
        self.assertEqual(session.get("invalidation_reason"), "expired")


if __name__ == "__main__":
    unittest.main()
