"""DB-backed route-level permission checks for authenticated API users.

The user's role is resolved from ``users.role_id`` upstream (the middleware
stashes it on ``request.state.user`` as ``role``); this module checks that role
against the seeded ``role_permissions`` catalog (control-plane contract §3/§4).
Checks are positive (allow-list) and fail-closed: there is no username-derived
role and no ``*`` wildcard ([ADR 0003](../../specs/product/decisions/0003-admin-is-a-clinician-superset.md)).
"""

from __future__ import annotations

from typing import Any

from server.auth import store

PermissionKey = str


def has_permission(user: dict[str, Any] | None, permission: PermissionKey) -> bool:
    """Return whether ``user``'s DB-backed role holds ``permission``.

    Resolves the role from the ``role`` already on the user dict (set from
    ``users.role_id``) and checks the seeded catalog. Fail-closed: ``False`` when
    there is no user or no role; never granted via a ``*`` wildcard.
    """
    if user is None:
        return False
    role = user.get("role")
    if not role:
        return False
    return permission in store.get_role_permission_keys(role)
