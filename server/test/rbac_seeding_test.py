"""RBAC slice 5 — seeding hardening: idempotent role backfill (issue #292).

Closes the fail-closed lockout gap where a user migrated forward from the
legacy ``var/auth.sqlite`` (or otherwise created pre-RBAC) ends up with
``role_id = NULL`` — which resolves to the zero-permission ``agent`` principal.
The backfill assigns such accounts the safe ``clinician`` default (NEVER derived
from the username), while the demo account's ``admin`` assignment still wins.

Exercises the store/service public interfaces, following the
``rbac_roles_test`` harness (patched temp DB paths + ``init_store()``).
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server.auth import service, store


class RbacSeedingTests(unittest.TestCase):
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

    def _insert_roleless_user(self, username: str) -> str:
        """Create a user then force role_id back to NULL, simulating a
        migrated / pre-RBAC account."""
        user = service.register_user(username, "secret")
        store.set_user_role(user["id"], None)
        return user["id"]

    def test_roleless_user_resolves_to_agent_before_backfill(self) -> None:
        user_id = self._insert_roleless_user("ghost")
        self.assertEqual(service.role_for(user_id), "agent")

    def test_backfill_assigns_clinician_to_roleless_user(self) -> None:
        user_id = self._insert_roleless_user("ghost")
        self.assertEqual(service.role_for(user_id), "agent")

        store.backfill_user_roles()

        self.assertEqual(service.role_for(user_id), "clinician")

    def test_backfill_is_idempotent(self) -> None:
        roleless = self._insert_roleless_user("ghost")
        admin_user = service.register_user("boss", "secret")
        store.set_user_role(admin_user["id"], store.get_role_id("admin"))
        clinician_user = service.register_user("nurse", "secret")  # defaults clinician

        store.backfill_user_roles()
        store.backfill_user_roles()

        # The role-less account is now clinician; the others are untouched.
        self.assertEqual(service.role_for(roleless), "clinician")
        self.assertEqual(service.role_for(admin_user["id"]), "admin")
        self.assertEqual(service.role_for(clinician_user["id"]), "clinician")

    def test_init_store_runs_backfill_for_migrated_user(self) -> None:
        user_id = self._insert_roleless_user("ghost")
        self.assertEqual(service.role_for(user_id), "agent")

        store.init_store()  # backfill is wired into the startup seeding path

        self.assertEqual(service.role_for(user_id), "clinician")

    def test_seeding_order_keeps_demo_admin_and_registered_clinician(self) -> None:
        # The full startup sequence: init_store() (seed catalog + backfill) then
        # seed_default_user() (demo -> admin). The backfill's clinician default
        # must NOT clobber the demo admin.
        store.init_store()
        store.seed_default_user()

        demo = store.get_user_by_username("clinician")
        self.assertIsNotNone(demo)
        self.assertEqual(service.role_for(demo["id"]), "admin")

        fresh = service.register_user("dana", "secret")
        self.assertEqual(service.role_for(fresh["id"]), "clinician")


if __name__ == "__main__":
    unittest.main()
