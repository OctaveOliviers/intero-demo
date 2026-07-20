"""Shared control-plane guards: the path-traversal id whitelist and the
401/403 permission gate, used identically by the Dataset / Table / Thread routes.

These were byte-identical across ``datasets.py``, ``tables.py``, and ``threads.py``
(``_VALID_ID`` + ``_safe_id`` + ``_require``). Extracting them here keeps a future
tightening — e.g. narrowing the allowed id charset or hardening the permission
check — in ONE place so the three routes can never silently diverge. Route-SPECIFIC
guards (e.g. datasets.py's database-slug validation) stay in their own module.
"""

from __future__ import annotations

import re
from typing import Any

from fastapi import HTTPException, Request

from server.auth import permissions as authz
from server.auth.deps import current_user

# A control-plane entity id is a flat slug — letters, digits, underscore, hyphen.
# Anything else (a path separator, ``.``, ``..``) is refused so the id can never
# escape its ``var/<entity>/`` dir when joined into a filesystem path (no traversal,
# no deleting a sibling artifact). Mirrors the agent tool's ``_DB_SLUG`` guard.
VALID_ID = re.compile(r"^[A-Za-z0-9_-]+$")


def safe_id(value: str, *, kind: str) -> str:
    """Return ``value`` if it is a flat slug, else 404 (never touch the path).

    A traversal attempt is indistinguishable from a missing entity to the caller —
    it is simply not found. ``kind`` is the human entity label ("Table" / "Dataset"
    / "Thread") so the 404 detail stays accurate.
    """
    if not VALID_ID.fullmatch(value or ""):
        raise HTTPException(status_code=404, detail=f"{kind} not found.")
    return value


def require(request: Request, permission: str) -> dict[str, Any]:
    """Resolve the caller and enforce a permission key (401 then 403).

    The auth middleware already 401s an anonymous ``/api/*`` request; this
    defensive check holds the guard even when a route is exercised directly
    (tests) and not behind the gate.
    """
    user = current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not authz.has_permission(user, permission):
        raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")
    return user
