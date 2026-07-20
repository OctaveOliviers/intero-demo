"""RBAC slice 1 — roles in the DB + role on the wire (issue #288).

Exercises the public store/service/HTTP interfaces: the seeded role catalog,
role resolution from ``users.role_id`` (never username), and the ``role`` field
on ``GET /api/auth/me`` and ``POST /api/auth/login``.
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

# The exact §4 permission sets (control-plane contract).
CLINICIAN_PERMISSIONS = frozenset(
    {
        "dataset.read",
        "dataset.manage",
        "dataset.query",
        "template.read",
        "template.manage",
        "thread.read",
        "thread.manage",
        "table.read",
        "table.manage",
        "project.read",
        "project.manage",
        "table_population.create",
        "table_population.read",
        "table_population.stop",
        "table_population.edit_cells",
        "grant.manage_owned",
        "logs.read_query_log",
    }
)
ADMIN_EXTRA_PERMISSIONS = frozenset(
    {"iam.manage_users", "iam.manage_roles", "database.manage"}
)


class RbacRolesTests(unittest.TestCase):
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

    def tearDown(self) -> None:
        self.auth_db_patch.stop()
        self.legacy_auth_db_patch.stop()
        self.tmp.cleanup()

    def _make_client(self) -> TestClient:
        app = FastAPI()
        app.add_middleware(AuthMiddleware)
        app.include_router(auth_router)
        return TestClient(app)

    def test_role_catalog_seeded_with_exact_permission_sets(self) -> None:
        clinician = store.get_role_permission_keys("clinician")
        admin = store.get_role_permission_keys("admin")
        agent = store.get_role_permission_keys("agent")

        self.assertEqual(clinician, CLINICIAN_PERMISSIONS)
        self.assertEqual(admin, CLINICIAN_PERMISSIONS | ADMIN_EXTRA_PERMISSIONS)
        self.assertEqual(agent, frozenset())
        # No `*` wildcard anywhere in the seeded data.
        self.assertNotIn("*", clinician)
        self.assertNotIn("*", admin)
        self.assertNotIn("*", agent)

    def test_reseeding_is_idempotent(self) -> None:
        store.init_store()
        store.init_store()

        # Permission sets unchanged; no duplicate role/permission/grant rows.
        self.assertEqual(
            store.get_role_permission_keys("admin"),
            CLINICIAN_PERMISSIONS | ADMIN_EXTRA_PERMISSIONS,
        )
        with store._connect() as conn:
            role_count = conn.execute("SELECT COUNT(*) c FROM roles").fetchone()["c"]
            perm_count = conn.execute("SELECT COUNT(*) c FROM permissions").fetchone()[
                "c"
            ]
            grant_count = conn.execute(
                "SELECT COUNT(*) c FROM role_permissions"
            ).fetchone()["c"]
        self.assertEqual(role_count, 3)
        self.assertEqual(
            perm_count, len(CLINICIAN_PERMISSIONS | ADMIN_EXTRA_PERMISSIONS)
        )
        self.assertEqual(
            grant_count,
            len(CLINICIAN_PERMISSIONS) * 2 + len(ADMIN_EXTRA_PERMISSIONS),
        )

    def test_role_resolves_from_role_id_not_username(self) -> None:
        # A user literally named "admin" but bound to the clinician role.
        user = service.register_user("admin", "secret")
        clinician_role_id = store.get_role_id("clinician")
        admin_role_id = store.get_role_id("admin")
        store.set_user_role(user["id"], clinician_role_id)
        self.assertEqual(service.role_for(user["id"]), "clinician")

        # And the inverse: a user named "bob" bound to the admin role.
        bob = service.register_user("bob", "secret")
        store.set_user_role(bob["id"], admin_role_id)
        self.assertEqual(service.role_for(bob["id"]), "admin")

    def test_missing_role_id_resolves_to_agent(self) -> None:
        user = service.register_user("nobody", "secret")
        store.set_user_role(user["id"], None)
        self.assertEqual(service.role_for(user["id"]), "agent")

    def test_registered_user_defaults_to_clinician(self) -> None:
        user = service.register_user("carol", "secret")
        self.assertEqual(service.role_for(user["id"]), "clinician")

    def test_registered_user_display_name_defaults_to_username(self) -> None:
        # The clinician directory returns the human full name (contract §2
        # `users.display_name`, required) — a freshly-created account must not be
        # left NULL; it falls back to the username, mirroring the upgrade backfill.
        user = service.register_user("erin", "secret")
        stored = store.get_user_by_id(user["id"])
        self.assertEqual(stored["display_name"], "erin")

    def test_seed_demo_account_resolves_to_admin(self) -> None:
        store.seed_default_user()
        seeded = store.get_user_by_username("clinician")
        self.assertIsNotNone(seeded)
        self.assertEqual(service.role_for(seeded["id"]), "admin")

    def test_seed_default_user_is_idempotent(self) -> None:
        store.seed_default_user()
        store.seed_default_user()
        seeded = store.get_user_by_username("clinician")
        self.assertEqual(service.role_for(seeded["id"]), "admin")

    def test_login_response_includes_role(self) -> None:
        service.register_user("dana", "secret")  # defaults to clinician
        client = self._make_client()
        res = client.post(
            "/api/auth/login", json={"username": "dana", "password": "secret"}
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json().get("role"), "clinician")

    def test_me_response_includes_role(self) -> None:
        store.seed_default_user()  # the demo account resolves to admin
        client = self._make_client()
        login = client.post(
            "/api/auth/login", json={"username": "clinician", "password": "intero"}
        )
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.json().get("role"), "admin")

        me = client.get("/api/auth/me")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json().get("role"), "admin")


if __name__ == "__main__":
    unittest.main()
