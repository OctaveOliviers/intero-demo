"""RBAC slice 3 — first-login password reset gating (issue #290).

Exercises the §9 "first-login credential reset" rule through the HTTP layer: a
user whose `must_reset_password` is true may authenticate ONLY to reach the
self-service set-password endpoint (plus `GET /api/auth/me` / `POST
/api/auth/logout` to confirm the session and log out); every other protected
endpoint is `403` until the flag clears. The set-password endpoint operates on
the caller's own account only and clears the flag.

Harness mirrors `rbac_enforcement_test.py`: temp auth DBs, `init_store()`, an
app with `AuthMiddleware` + the auth/databases/sql routers.
"""

from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.auth import service, store
from server.auth.middleware import AuthMiddleware
from server.auth.routes import router as auth_router
from server.routes.databases import router as databases_router
from server.routes.sql import router as sql_router


class RbacFirstLoginTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.auth_db = self.tmp_path / "auth.sqlite"
        self.legacy_auth_db = self.tmp_path / "legacy-auth.sqlite"
        self.sqlite_db = self.tmp_path / "sample.sqlite"

        with sqlite3.connect(self.sqlite_db) as conn:
            conn.execute("CREATE TABLE demo (id INTEGER PRIMARY KEY, value TEXT)")
            conn.execute("INSERT INTO demo (value) VALUES ('ok')")
            conn.commit()

        self.auth_db_patch = patch.object(store, "AUTH_DB_PATH", self.auth_db)
        self.auth_db_patch.start()
        self.legacy_auth_db_patch = patch.object(
            store, "LEGACY_AUTH_DB_PATH", self.legacy_auth_db
        )
        self.legacy_auth_db_patch.start()
        store.init_store()

        # A plain registration is a clinician with must_reset_password=0 (the
        # IT-created-account path that sets it true is a later slice). The tests
        # flip the flag directly to exercise the gate.
        self.user = service.register_user("clin", "secret")

        app = FastAPI()
        app.add_middleware(AuthMiddleware)
        app.include_router(auth_router)
        app.include_router(databases_router)
        app.include_router(sql_router)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.auth_db_patch.stop()
        self.legacy_auth_db_patch.stop()
        self.tmp.cleanup()

    # --- helpers -----------------------------------------------------------

    def _login(self, username: str = "clin", password: str = "secret") -> None:
        res = self.client.post(
            "/api/auth/login", json={"username": username, "password": password}
        )
        self.assertEqual(res.status_code, 200, res.text)

    def _logout(self) -> None:
        self.client.post("/api/auth/logout")

    def _flag_must_reset(self, user_id: str) -> None:
        store.set_must_reset_password(user_id, True)

    # --- the gate denies everything but the allowlist ----------------------

    def test_must_reset_user_403_on_protected_endpoint(self) -> None:
        self._flag_must_reset(self.user["id"])
        self._login()
        res = self.client.post(
            "/api/sql",
            json={
                "query": "SELECT value FROM demo LIMIT 1",
                "database": str(self.sqlite_db),
            },
        )
        self.assertEqual(res.status_code, 403, res.text)
        self.assertEqual(res.json().get("detail"), "Password reset required")

    def test_must_reset_user_reaches_allowlisted_endpoints(self) -> None:
        self._flag_must_reset(self.user["id"])
        self._login()

        me = self.client.get("/api/auth/me")
        self.assertEqual(me.status_code, 200, me.text)

        sp = self.client.post(
            "/api/auth/set-password", json={"new_password": "fresh-pass"}
        )
        self.assertNotEqual(sp.status_code, 403, sp.text)

        out = self.client.post("/api/auth/logout")
        self.assertEqual(out.status_code, 200, out.text)

    # --- set-password clears the flag and unblocks the gate ----------------

    def test_set_password_clears_flag_and_unblocks_gate(self) -> None:
        self._flag_must_reset(self.user["id"])
        self._login()

        # Blocked before the reset.
        blocked = self.client.get("/api/databases")
        self.assertEqual(blocked.status_code, 403, blocked.text)

        sp = self.client.post(
            "/api/auth/set-password", json={"new_password": "fresh-pass"}
        )
        self.assertEqual(sp.status_code, 200, sp.text)

        # The SAME session now passes the gate.
        unblocked = self.client.get("/api/databases")
        self.assertEqual(unblocked.status_code, 200, unblocked.text)

    def test_new_password_authenticates_old_does_not(self) -> None:
        self._flag_must_reset(self.user["id"])
        self._login()
        sp = self.client.post(
            "/api/auth/set-password", json={"new_password": "fresh-pass"}
        )
        self.assertEqual(sp.status_code, 200, sp.text)
        self._logout()

        # The old password no longer authenticates.
        old = self.client.post(
            "/api/auth/login", json={"username": "clin", "password": "secret"}
        )
        self.assertEqual(old.status_code, 401, old.text)

        # The new password does, and the gate is already cleared.
        new = self.client.post(
            "/api/auth/login", json={"username": "clin", "password": "fresh-pass"}
        )
        self.assertEqual(new.status_code, 200, new.text)
        res = self.client.get("/api/databases")
        self.assertEqual(res.status_code, 200, res.text)

    # --- self-service: caller's own account only ---------------------------

    def test_set_password_targets_only_caller_ignoring_client_id(self) -> None:
        # A second account whose credential must not be touched by clin's reset.
        other = service.register_user("other", "other-secret")
        self._flag_must_reset(self.user["id"])
        self._login()

        # A client-supplied user_id is ignored — identity comes from the session.
        sp = self.client.post(
            "/api/auth/set-password",
            json={"new_password": "fresh-pass", "user_id": other["id"]},
        )
        self.assertEqual(sp.status_code, 200, sp.text)

        # The other account's password is untouched.
        self.assertIsNotNone(service.authenticate("other", "other-secret"))
        self.assertIsNone(service.authenticate("other", "fresh-pass"))
        # The caller's own password WAS changed.
        self.assertIsNotNone(service.authenticate("clin", "fresh-pass"))

    # --- 401 when unauthenticated ------------------------------------------

    def test_set_password_unauthenticated_is_401(self) -> None:
        res = self.client.post(
            "/api/auth/set-password", json={"new_password": "fresh-pass"}
        )
        self.assertEqual(res.status_code, 401, res.text)
        self.assertEqual(res.json().get("detail"), "Authentication required")

    # --- empty / missing new password rejected -----------------------------

    def test_set_password_empty_is_rejected(self) -> None:
        self._flag_must_reset(self.user["id"])
        self._login()
        res = self.client.post("/api/auth/set-password", json={"new_password": ""})
        self.assertIn(res.status_code, (400, 422), res.text)

    def test_set_password_missing_field_is_422(self) -> None:
        self._flag_must_reset(self.user["id"])
        self._login()
        res = self.client.post("/api/auth/set-password", json={})
        self.assertEqual(res.status_code, 422, res.text)


if __name__ == "__main__":
    unittest.main()
