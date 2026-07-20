"""RBAC slice 6 — the read-only IAM users endpoint (issue #293).

`GET /api/iam/users` is the data source for the admin Settings "Users & roles"
screen. It is **admin-only** (`iam.manage_users`, held only by `admin`): a
`clinician` gets `403` with a non-leaking body and no user payload; an `admin`
gets `200` with every account (id, username, display_name, role, is_active,
must_reset_password), the role resolved from `users.role_id`.

Harness mirrors `rbac_enforcement_test.py`: temp auth DBs, `init_store()`, an app
with `AuthMiddleware` + the iam router.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.auth import service, store
from server.auth.middleware import AuthMiddleware
from server.auth.routes import router as auth_router
from server.routes.iam import router as iam_router


class RbacIamUsersTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.auth_db = self.tmp_path / "auth.sqlite"
        self.legacy_auth_db = self.tmp_path / "legacy-auth.sqlite"

        self.auth_db_patch = patch.object(store, "AUTH_DB_PATH", self.auth_db)
        self.auth_db_patch.start()
        self.legacy_auth_db_patch = patch.object(
            store, "LEGACY_AUTH_DB_PATH", self.legacy_auth_db
        )
        self.legacy_auth_db_patch.start()
        store.init_store()

        # A plain registration is a clinician (§4 default).
        self.clinician = service.register_user("clin", "secret")
        # Promote a second user to admin via the seeded role.
        self.admin = service.register_user("itadmin", "secret")
        store.set_user_role(self.admin["id"], store.get_role_id("admin"))

        app = FastAPI()
        app.add_middleware(AuthMiddleware)
        app.include_router(auth_router)
        app.include_router(iam_router)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.auth_db_patch.stop()
        self.legacy_auth_db_patch.stop()
        self.tmp.cleanup()

    def _login(self, username: str, password: str = "secret") -> None:
        res = self.client.post(
            "/api/auth/login", json={"username": username, "password": password}
        )
        self.assertEqual(res.status_code, 200, res.text)

    def _logout(self) -> None:
        self.client.post("/api/auth/logout")

    # --- clinician 403, admin 200 -----------------------------------------

    def test_iam_users_clinician_403(self) -> None:
        self._login("clin")
        res = self.client.get("/api/iam/users")
        self.assertEqual(res.status_code, 403)
        body = res.json()
        # Non-leaking: a generic detail and NO user list payload.
        self.assertIn("detail", body)
        self.assertNotIsInstance(body, list)

    def test_iam_users_admin_200_with_users_and_roles(self) -> None:
        self._login("itadmin")
        res = self.client.get("/api/iam/users")
        self.assertEqual(res.status_code, 200, res.text)
        users = res.json()
        self.assertIsInstance(users, list)

        by_username = {u["username"]: u for u in users}
        self.assertIn("clin", by_username)
        self.assertIn("itadmin", by_username)

        clin = by_username["clin"]
        # The full read-only shape, with the role resolved from users.role_id.
        for key in (
            "id",
            "username",
            "display_name",
            "role",
            "is_active",
            "must_reset_password",
        ):
            self.assertIn(key, clin)
        self.assertEqual(clin["role"], "clinician")
        self.assertEqual(by_username["itadmin"]["role"], "admin")
        self.assertTrue(clin["is_active"])
        self.assertFalse(clin["must_reset_password"])

    def test_iam_users_unauthenticated_401(self) -> None:
        # No session — the middleware session check fails first -> 401, not 403.
        res = self.client.get("/api/iam/users")
        self.assertEqual(res.status_code, 401)


if __name__ == "__main__":
    unittest.main()
