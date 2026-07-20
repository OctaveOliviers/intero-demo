"""The login gate.

Every ``/api`` route requires a valid session except the auth endpoints
themselves and the liveness probe; an anonymous request to any data endpoint
gets ``401`` and sees nothing (doc 7 §Access — "No anonymous use"). The
resolved user is stashed on ``request.state`` so downstream routes can attribute
runs and queries to whoever caused them.

The static SPA shell is served unauthenticated so the browser can load the app
and present the login screen; the data behind it stays gated.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from server.auth import service

SESSION_COOKIE = "intero_session"

# Endpoints reachable without a session: the auth handshake and the liveness
# probe. Everything else under /api requires login.
_PUBLIC_PATHS = frozenset({"/api/auth/login", "/api/auth/logout", "/health"})

# While `must_reset_password` is true a user may authenticate ONLY to reach the
# set-password endpoint, confirm their session (`me`), or log out (§9). Every
# other protected endpoint is 403 until the flag clears.
_MUST_RESET_ALLOWLIST = frozenset(
    {"/api/auth/set-password", "/api/auth/me", "/api/auth/logout"}
)


def _requires_auth(path: str) -> bool:
    if path in _PUBLIC_PATHS:
        return False
    return path.startswith("/api/")


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        token = request.cookies.get(SESSION_COOKIE)
        user = service.resolve_session(token)
        request.state.user = user
        request.state.user_id = user["id"] if user else None

        # CORS preflight carries no cookie; let it through to the CORS layer.
        if request.method == "OPTIONS":
            return await call_next(request)

        if _requires_auth(request.url.path):
            # §3 step 1 — authenticated session.
            if user is None:
                return JSONResponse(
                    status_code=401, content={"detail": "Authentication required"}
                )
            # §3 step 2 — active user. A valid session whose user is deactivated
            # is a 403 (the session resolved; it's the active check that fails),
            # never a 401. Non-leaking body. (contract §3; auth-and-access §13/§14)
            if not user.get("is_active", False):
                return JSONResponse(
                    status_code=403, content={"detail": "Account is not active"}
                )
            # §9 first-login gate — a user with must_reset_password may reach ONLY
            # the set-password endpoint (plus me/logout to confirm and exit); every
            # other endpoint is 403 until the flag clears. Runs after the active
            # check, before any route permission. Non-leaking body.
            if user.get("must_reset_password", False) and (
                request.url.path not in _MUST_RESET_ALLOWLIST
            ):
                return JSONResponse(
                    status_code=403, content={"detail": "Password reset required"}
                )

        return await call_next(request)
