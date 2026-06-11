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

        if _requires_auth(request.url.path) and user is None:
            return JSONResponse(status_code=401, content={"detail": "Authentication required"})

        return await call_next(request)
