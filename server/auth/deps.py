"""Route-level access to the authenticated user.

The :class:`AuthMiddleware` resolves the session and stashes the user on
``request.state``; these helpers read it back. ``require_user`` is the FastAPI
dependency routes use when they need the caller's identity (e.g. to attribute a
run or a query); it 401s defensively even though the middleware already gates
the path.
"""

from collections.abc import Callable
from typing import Any

from fastapi import HTTPException, Request

from server.auth import store


def current_user(request: Request) -> dict[str, Any] | None:
    return getattr(request.state, "user", None)


def current_user_id(request: Request) -> str | None:
    return getattr(request.state, "user_id", None)


def require_user(request: Request) -> dict[str, Any]:
    user = current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def require_permission(key: str) -> Callable[[Request], dict[str, Any]]:
    """Build a FastAPI dependency that enforces §3 step 3 — role permission.

    The returned dependency reads the session-resolved user, resolves its role
    from the DB-backed `role` (never the username), and checks the seeded
    catalog: it raises `403` if the role does not hold ``key``. This is the
    single permission-check path. Fail-closed: no user -> `401` (defensive; the
    middleware already gates the path), no permission -> `403` with a
    non-leaking body. Wiring it via ``Depends`` runs the check before the
    handler body, so an unauthorized caller never reaches the resource.
    """

    def dependency(request: Request) -> dict[str, Any]:
        user = require_user(request)
        # Fail-closed (§14): a missing/unbound role denies (403), never a 500 —
        # mirrors has_permission's `.get("role")` guard rather than KeyError-ing.
        role = user.get("role")
        if not role or key not in store.get_role_permission_keys(role):
            raise HTTPException(status_code=403, detail="You don't have access to this")
        return user

    return dependency
