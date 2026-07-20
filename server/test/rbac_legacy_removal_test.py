"""RBAC slice 4 — remove the legacy username role + admin `*` wildcard (issue #291).

Exercises the public ``server.auth.permissions`` interface and the run cell-edit
HTTP path. The role is resolved from the DB-backed ``role`` carried on the user
dict (``request.state.user``), checked positively against the seeded
``role_permissions`` catalog — never from the username, never via a ``*`` wildcard.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from core.store import Run
from server.auth import permissions as authz
from server.auth import store
from server.routes.table_populations import _require_table_population_cell_edit_access


class SeededStoreTestCase(unittest.TestCase):
    """Seed a throwaway auth DB so ``get_role_permission_keys`` resolves the §4
    catalog (no global state touched)."""

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


class HasPermissionResolvesFromDbRoleTest(SeededStoreTestCase):
    def test_resolves_from_db_role_not_username(self) -> None:
        # A user literally named "admin" but bound to the clinician role does NOT
        # hold an admin-only key — proving there is no username-derived logic.
        username_admin_clinician_role = {"username": "admin", "role": "clinician"}
        self.assertFalse(
            authz.has_permission(username_admin_clinician_role, "database.manage")
        )
        self.assertFalse(
            authz.has_permission(username_admin_clinician_role, "iam.manage_users")
        )

        # And the inverse: a user named "someone" bound to admin DOES hold it.
        someone_admin_role = {"username": "someone", "role": "admin"}
        self.assertTrue(authz.has_permission(someone_admin_role, "database.manage"))
        self.assertTrue(authz.has_permission(someone_admin_role, "iam.manage_users"))

    def test_fail_closed_for_no_user_or_unknown_role(self) -> None:
        # No user -> False.
        self.assertFalse(authz.has_permission(None, "dataset.read"))
        # Empty / missing role -> False.
        self.assertFalse(authz.has_permission({"username": "x"}, "dataset.read"))
        self.assertFalse(authz.has_permission({"role": ""}, "dataset.read"))
        # Unknown role -> False.
        self.assertFalse(authz.has_permission({"role": "wizard"}, "dataset.read"))
        # No key is granted via a `*` wildcard.
        self.assertFalse(authz.has_permission({"role": "admin"}, "*"))
        self.assertFalse(authz.has_permission({"role": "clinician"}, "*"))

    def test_clinician_can_manage_templates(self) -> None:
        # Editing an audit-template's inclusion criteria maps onto template.manage
        # (the old `mapping.edit_criteria` key is gone) — a clinician keeps it.
        clinician = {"username": "carol", "role": "clinician"}
        self.assertTrue(authz.has_permission(clinician, "template.manage"))
        admin = {"username": "ita", "role": "admin"}
        self.assertTrue(authz.has_permission(admin, "template.manage"))


class AdminCellEditOverrideRemovedTest(SeededStoreTestCase):
    """The admin run-ownership override for cell edits is gone — admin is a peer
    (ADR 0003): editing a run it does not own is denied for ownership, while the
    table population's owner (any role) holding ``table_population.edit_cells`` is allowed."""

    def test_admin_denied_on_run_it_does_not_own(self) -> None:
        admin = {"id": "u_admin", "username": "admin", "role": "admin"}
        run = Run(id="r1", audit_id="a1", user_id="u_someone_else")
        with self.assertRaises(HTTPException) as ctx:
            _require_table_population_cell_edit_access(admin, run)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("ownership", str(ctx.exception.detail).lower())

    def test_owner_with_run_edit_cells_is_allowed(self) -> None:
        owner = {"id": "u_owner", "username": "clinician", "role": "clinician"}
        run = Run(id="r2", audit_id="a1", user_id="u_owner")
        # No exception raised -> allowed.
        _require_table_population_cell_edit_access(owner, run)


if __name__ == "__main__":
    unittest.main()
