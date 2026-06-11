"""Auth + session endpoints and the per-user history they unlock.

- ``POST /api/auth/login``   — exchange credentials for a session cookie.
- ``POST /api/auth/logout``  — end the current session.
- ``GET  /api/auth/me``      — who am I (401 if not logged in).
- ``GET  /api/auth/runs``    — this user's own run history ("own audits").
- ``GET  /api/auth/queries`` — this user's query log (attribution trail).

The session is an HttpOnly cookie so the browser carries it on same-origin
fetches without the SPA having to manage a token. On login a user sees only
their own runs and queries (doc 7 §Access — sessions; §Attribution).
"""

from fastapi import APIRouter, HTTPException, Request, Response

from server.auth import service, store
from server.auth.deps import require_user
from server.auth.middleware import SESSION_COOKIE
from server.models import LoginRequest, RunHistoryItem, UserResponse

router = APIRouter(prefix="/api/auth")


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        path="/",
    )


@router.post("/login", response_model=UserResponse)
async def login(body: LoginRequest, response: Response):
    user = service.authenticate(body.username, body.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = service.start_session(user["id"])
    _set_session_cookie(response, token)
    return UserResponse(**user)


@router.post("/logout")
async def logout(request: Request, response: Response):
    service.end_session(request.cookies.get(SESSION_COOKIE))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserResponse)
async def me(request: Request):
    user = require_user(request)
    return UserResponse(**user)


@router.get("/runs", response_model=list[RunHistoryItem])
async def my_runs(request: Request):
    user = require_user(request)
    return [RunHistoryItem(**row) for row in store.list_runs_for_user(user["id"])]


@router.get("/queries")
async def my_queries(request: Request):
    user = require_user(request)
    return store.list_queries_for_user(user["id"])
