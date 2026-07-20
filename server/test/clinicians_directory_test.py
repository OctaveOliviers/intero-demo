"""Sharing slice — the `GET /api/clinicians` share-target directory (issue #300).

The minimal clinical-staff directory an owner picks a colleague from when sharing
(auth-and-access §10; control-plane contract §5). It returns `display_name` + user
`id` ONLY — no PID, no IAM fields — for `clinician`-role accounts, gated by
`grant.manage_owned`. It lists clinician accounts regardless of login state (so a
not-yet-onboarded joiner can be pre-shared) but EXCLUDES deactivated users, and
never lists `admin`/`agent` accounts.

Harness mirrors `rbac_iam_users_test.py`: temp auth DBs, `init_store()`, an app
with `AuthMiddleware` + the clinicians router, driven through `TestClient`.
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
from server.routes.clinicians import router as clinicians_router


class CliniciansDirectoryTests(unittest.TestCase):
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

        app = FastAPI()
        app.add_middleware(AuthMiddleware)
        app.include_router(auth_router)
        app.include_router(clinicians_router)
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

    def _deactivate(self, user_id: str) -> None:
        with store._connect() as conn:
            conn.execute("UPDATE users SET is_active = 0 WHERE id = ?", (user_id,))

    # --- tracer bullet: clinician with grant.manage_owned -> 200 -----------

    def test_clinician_gets_directory_with_id_and_display_name_only(self) -> None:
        self._login("clin")
        res = self.client.get("/api/clinicians")
        self.assertEqual(res.status_code, 200, res.text)

        people = res.json()
        self.assertIsInstance(people, list)
        by_id = {p["id"]: p for p in people}
        self.assertIn(self.clinician["id"], by_id)

        me = by_id[self.clinician["id"]]
        # Payload carries ONLY id + display_name.
        self.assertEqual(set(me.keys()), {"id", "display_name"})
        self.assertEqual(me["display_name"], "clin")
        # No PID/IAM fields leak.
        for leaked in ("username", "email", "role", "is_active", "must_reset_password"):
            self.assertNotIn(leaked, me)

    # --- deactivated clinician is absent -----------------------------------

    def test_deactivated_clinician_is_absent(self) -> None:
        gone = service.register_user("gone", "secret")
        self._deactivate(gone["id"])
        self._login("clin")
        res = self.client.get("/api/clinicians")
        self.assertEqual(res.status_code, 200, res.text)
        ids = {p["id"] for p in res.json()}
        self.assertNotIn(gone["id"], ids)
        # The still-active caller is unaffected.
        self.assertIn(self.clinician["id"], ids)

    # --- not-yet-onboarded clinician IS present ----------------------------

    def test_not_yet_onboarded_clinician_is_present(self) -> None:
        joiner = service.register_user("joiner", "secret")
        # An IT-created colleague who has not completed first login.
        store.set_must_reset_password(joiner["id"], True)
        self._login("clin")
        res = self.client.get("/api/clinicians")
        self.assertEqual(res.status_code, 200, res.text)
        ids = {p["id"] for p in res.json()}
        self.assertIn(joiner["id"], ids)

    # --- admin-role account is NOT listed (clinician-role only) -------------

    def test_admin_role_account_is_not_listed(self) -> None:
        boss = service.register_user("boss", "secret")
        store.set_user_role(boss["id"], store.get_role_id("admin"))
        self._login("clin")
        res = self.client.get("/api/clinicians")
        self.assertEqual(res.status_code, 200, res.text)
        ids = {p["id"] for p in res.json()}
        self.assertNotIn(boss["id"], ids)

    # --- gate: missing grant.manage_owned -> 403; unauthenticated -> 401 ----

    def test_session_without_grant_manage_owned_gets_403(self) -> None:
        # The zero-permission `agent` role holds no `grant.manage_owned`.
        powerless = service.register_user("agentuser", "secret")
        store.set_user_role(powerless["id"], store.get_role_id("agent"))
        self._login("agentuser")
        res = self.client.get("/api/clinicians")
        self.assertEqual(res.status_code, 403)
        # Non-leaking: a generic detail, no directory payload.
        self.assertNotIsInstance(res.json(), list)

    def test_unauthenticated_gets_401(self) -> None:
        # No session — the middleware session check fails first -> 401, not 403.
        res = self.client.get("/api/clinicians")
        self.assertEqual(res.status_code, 401)


if __name__ == "__main__":
    unittest.main()
