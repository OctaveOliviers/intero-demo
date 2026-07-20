"""Shared test helper for the library/audit route tests after #302.

#302 put owner-or-grant enforcement on the audit READ routes (``list_templates`` /
``get_template_detail`` now take a ``request`` and gate on a ``template`` grant). The
pre-existing library tests read audits as a user with no grant; this helper lets
each test stand up a tmp control-plane store, OWN the audit ids it exercises, and
build a request — so the test keeps proving its ORIGINAL behavior (contract /
metadata / drift), with the non-grantee-denied behavior proved separately in
``templates_sharing_test.py``.
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from types import SimpleNamespace

from server.auth import grants as grant_store
from server.auth import store as auth_store


class AuditAuthMixin:
    """Mixin that seeds a tmp auth DB and grants the test user ``template`` access.

    Call ``self._audit_auth_setup()`` in ``setUp`` and ``self._audit_auth_teardown()``
    in ``tearDown``. ``self._owner_request(*audit_ids)`` returns a request whose user
    owns every listed audit id (a ``manage`` self-grant), so the gated read routes
    let it through exactly as before the gate existed."""

    _AUTH_USER_ID = "u_test_owner"

    def _audit_auth_setup(self) -> None:
        self._auth_tmp = tempfile.TemporaryDirectory()
        self._orig_auth_db = auth_store.AUTH_DB_PATH
        auth_store.AUTH_DB_PATH = Path(self._auth_tmp.name) / "auth.sqlite"
        auth_store.init_store()

    def _audit_auth_teardown(self) -> None:
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        self._auth_tmp.cleanup()

    def _owner_request(self, *audit_ids: str) -> SimpleNamespace:
        for audit_id in audit_ids:
            grant_store.self_grant_manage(
                resource_type="template",
                resource_id=audit_id,
                user_id=self._AUTH_USER_ID,
            )
        user = {"id": self._AUTH_USER_ID, "username": "tester", "role": "clinician"}
        return SimpleNamespace(state=SimpleNamespace(user=user, user_id=user["id"]))
