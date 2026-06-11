"""Minimal MVP role/permission resolver for authenticated API users.

The runtime/state permission contract is enforced at DB role level; this module
adds route-level permission keys used by API authorization checks.
"""

from __future__ import annotations

from typing import Any

RoleName = str
PermissionKey = str

_ROLE_PERMISSIONS: dict[RoleName, frozenset[PermissionKey]] = {
    "admin": frozenset({"*"}),
    "clinician": frozenset(
        {
            "audit.read",
            "database.read",
            "database.query",
            "mapping.read",
            # The library audit-detail page is the one place inclusion
            # criteria are edited (doc 4 / doc 9); read-only items are
            # guarded per-route.
            "mapping.edit_criteria",
            "run.create",
            "run.read",
            "run.stop",
            "run.edit_cells",
        }
    ),
    "agent": frozenset(),
}


def role_for_user(user: dict[str, Any] | None) -> RoleName:
    if not user:
        return "agent"
    username = str(user.get("username") or "").strip().lower()
    if username == "admin":
        return "admin"
    if username == "agent":
        return "agent"
    return "clinician"


def is_admin(user: dict[str, Any] | None) -> bool:
    return role_for_user(user) == "admin"


def has_permission(user: dict[str, Any] | None, permission: PermissionKey) -> bool:
    role = role_for_user(user)
    grants = _ROLE_PERMISSIONS.get(role, frozenset())
    return "*" in grants or permission in grants
