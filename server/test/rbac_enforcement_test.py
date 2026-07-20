"""RBAC slice 2 — fail-closed server enforcement (issue #289).

Exercises the §3 evaluation order through the HTTP layer:
session (`401`) -> `is_active` (`403`) -> role permission (`403`), denying on the
first failed check. The five mutating/detail source-database endpoints are
`admin`-only (`database.manage`); the summary list and clinical endpoints are not
role-gated. The unauthorized `403` carries a non-leaking body and no resource
payload.

Harness mirrors `auth_smoke_test.py`: temp auth DBs, `init_store()`, an app with
`AuthMiddleware` + the databases/sql routers.
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
from server.routes import sql as sql_route

# A db_id that does not exist in the catalog — lets us assert the authz decision
# (admin must NOT get 403) in isolation from handler business logic (admin gets
# 404 because the resource is genuinely absent).
MISSING_DB_ID = "0123456789abcdef0123456789abcdef"


class RbacEnforcementTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.auth_db = self.tmp_path / "auth.sqlite"
        self.legacy_auth_db = self.tmp_path / "legacy-auth.sqlite"
        self.sqlite_db = self.tmp_path / "sample.sqlite"
        self.databases_dir = self.tmp_path / "databases"
        self.databases_dir.mkdir()

        with sqlite3.connect(self.sqlite_db) as conn:
            conn.execute("CREATE TABLE demo (id INTEGER PRIMARY KEY, value TEXT)")
            conn.execute("INSERT INTO demo (value) VALUES ('ok')")
            conn.commit()
        sample_dir = self.databases_dir / "sample"
        sample_dir.mkdir()
        self.sqlite_db.replace(sample_dir / "database.sqlite")

        self.auth_db_patch = patch.object(store, "AUTH_DB_PATH", self.auth_db)
        self.auth_db_patch.start()
        self.legacy_auth_db_patch = patch.object(
            store, "LEGACY_AUTH_DB_PATH", self.legacy_auth_db
        )
        self.legacy_auth_db_patch.start()
        self.databases_dir_patch = patch.object(
            sql_route, "DATABASES_DIR", self.databases_dir
        )
        self.databases_dir_patch.start()
        store.init_store()

        # A plain registration is a clinician (§4 default).
        self.clinician = service.register_user("clin", "secret")
        # Promote a second user to admin via the seeded role.
        self.admin = service.register_user("itadmin", "secret")
        store.set_user_role(self.admin["id"], store.get_role_id("admin"))

        app = FastAPI()
        app.add_middleware(AuthMiddleware)
        app.include_router(auth_router)
        app.include_router(databases_router)
        app.include_router(sql_route.router)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.auth_db_patch.stop()
        self.legacy_auth_db_patch.stop()
        self.databases_dir_patch.stop()
        self.tmp.cleanup()

    # --- helpers -----------------------------------------------------------

    def _login(self, username: str, password: str = "secret") -> None:
        res = self.client.post(
            "/api/auth/login", json={"username": username, "password": password}
        )
        self.assertEqual(res.status_code, 200, res.text)

    def _logout(self) -> None:
        self.client.post("/api/auth/logout")

    # --- admin-only endpoints: clinician 403, admin not-403 ----------------

    def test_database_detail_clinician_403_admin_not_403(self) -> None:
        self._login("clin")
        res = self.client.get(f"/api/databases/{MISSING_DB_ID}")
        self.assertEqual(res.status_code, 403)
        # Non-leaking: generic detail, and NO resource payload (no model).
        body = res.json()
        self.assertIn("detail", body)
        self.assertNotIn("model", body)

        self._logout()
        self._login("itadmin")
        res = self.client.get(f"/api/databases/{MISSING_DB_ID}")
        # Authz passed; resource genuinely absent -> 404, not 403.
        self.assertNotEqual(res.status_code, 403)
        self.assertEqual(res.status_code, 404)

    def test_database_upload_clinician_403_admin_not_403(self) -> None:
        self._login("clin")
        res = self.client.post(
            "/api/databases/upload",
            files={"file": ("x.sqlite", b"not-a-db", "application/octet-stream")},
        )
        self.assertEqual(res.status_code, 403)
        self.assertNotIn("model", res.json())

        self._logout()
        self._login("itadmin")
        res = self.client.post(
            "/api/databases/upload",
            files={"file": ("x.txt", b"not-a-db", "application/octet-stream")},
        )
        # Authz passed; bad file extension -> 415, not 403.
        self.assertNotEqual(res.status_code, 403)
        self.assertEqual(res.status_code, 415)

    def test_database_reindex_clinician_403_admin_not_403(self) -> None:
        self._login("clin")
        res = self.client.post(f"/api/databases/{MISSING_DB_ID}/reindex")
        self.assertEqual(res.status_code, 403)

        self._logout()
        self._login("itadmin")
        res = self.client.post(f"/api/databases/{MISSING_DB_ID}/reindex")
        self.assertNotEqual(res.status_code, 403)
        self.assertEqual(res.status_code, 404)

    def test_database_rename_clinician_403_admin_not_403(self) -> None:
        self._login("clin")
        res = self.client.patch(
            f"/api/databases/{MISSING_DB_ID}", json={"name": "New Name"}
        )
        self.assertEqual(res.status_code, 403)

        self._logout()
        self._login("itadmin")
        res = self.client.patch(
            f"/api/databases/{MISSING_DB_ID}", json={"name": "New Name"}
        )
        self.assertNotEqual(res.status_code, 403)
        self.assertEqual(res.status_code, 404)

    def test_database_delete_clinician_403_admin_not_403(self) -> None:
        self._login("clin")
        res = self.client.delete(f"/api/databases/{MISSING_DB_ID}")
        self.assertEqual(res.status_code, 403)

        self._logout()
        self._login("itadmin")
        res = self.client.delete(f"/api/databases/{MISSING_DB_ID}")
        self.assertNotEqual(res.status_code, 403)
        self.assertEqual(res.status_code, 404)

    # --- summary list stays clinician-readable -----------------------------

    def test_database_summary_list_readable_by_clinician(self) -> None:
        self._login("clin")
        res = self.client.get("/api/databases")
        self.assertEqual(res.status_code, 200)
        self.assertIsInstance(res.json(), list)

    def test_database_summary_list_readable_by_admin(self) -> None:
        self._login("itadmin")
        res = self.client.get("/api/databases")
        self.assertEqual(res.status_code, 200)

    # --- clinical endpoint not role-gated ----------------------------------

    def test_clinical_sql_not_role_gated_for_clinician_and_admin(self) -> None:
        for username in ("clin", "itadmin"):
            self._login(username)
            res = self.client.post(
                "/api/sql",
                json={
                    "query": "SELECT value FROM demo ORDER BY id LIMIT 1",
                    "database": "sample",
                },
            )
            self.assertEqual(res.status_code, 200, f"{username}: {res.text}")
            self.assertEqual(res.json().get("rows"), [["ok"]])
            self._logout()

    # --- 401 vs 403 are distinct -------------------------------------------

    def test_unauthenticated_protected_route_is_401_not_403(self) -> None:
        # No session on an admin-only route -> 401 (session check fails first),
        # NOT 403.
        res = self.client.get(f"/api/databases/{MISSING_DB_ID}")
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json().get("detail"), "Authentication required")

    def test_authenticated_but_unauthorized_is_403_not_401(self) -> None:
        self._login("clin")
        res = self.client.get(f"/api/databases/{MISSING_DB_ID}")
        self.assertEqual(res.status_code, 403)

    # --- inactive user with a valid session -> 403 (not 401) ---------------

    def test_inactive_user_with_valid_session_gets_403_not_401(self) -> None:
        self._login("clin")
        # Session resolves fine; the active check is what fails.
        with store._connect() as conn:
            conn.execute(
                "UPDATE users SET is_active = 0 WHERE id = ?", (self.clinician["id"],)
            )
        res = self.client.get("/api/databases")
        self.assertEqual(res.status_code, 403)
        self.assertNotEqual(res.status_code, 401)
        self.assertEqual(res.json().get("detail"), "Account is not active")

    # --- fail-closed: unknown active state denies (§14 invariant) -----------

    def test_user_missing_is_active_key_gets_403_fail_closed(self) -> None:
        # A resolved session whose user dict lacks `is_active` is an UNKNOWN
        # active state. The §3 step-2 active check must fail CLOSED (deny), per
        # the fail-closed invariant (auth-and-access §14; contract §3), not admit
        # the request on a defaulted-active assumption.
        user_without_active = {
            "id": self.clinician["id"],
            "username": "clin",
            "role": "clinician",
        }
        with patch.object(service, "resolve_session", return_value=user_without_active):
            res = self.client.get("/api/databases")
        self.assertEqual(res.status_code, 403)
        self.assertNotEqual(res.status_code, 200)
        self.assertNotEqual(res.status_code, 401)
        self.assertEqual(res.json().get("detail"), "Account is not active")


if __name__ == "__main__":
    unittest.main()
