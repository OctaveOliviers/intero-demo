"""Route-level access to the authenticated user.

The :class:`AuthMiddleware` resolves the session and stashes the user on
``request.state``; these helpers read it back. ``require_user`` is the FastAPI
dependency routes use when they need the caller's identity (e.g. to attribute a
run or a query); it 401s defensively even though the middleware already gates
the path.
"""

from typing import Any

from fastapi import HTTPException, Request


def current_user(request: Request) -> dict[str, Any] | None:
    return getattr(request.state, "user", None)


def current_user_id(request: Request) -> str | None:
    return getattr(request.state, "user_id", None)


def require_user(request: Request) -> dict[str, Any]:
    user = current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user
