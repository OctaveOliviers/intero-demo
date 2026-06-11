"""Auth logic: account creation, password verification, and session lifecycle.

Local password store for the MVP (the open-questions Q11 mechanism); stdlib
PBKDF2 only — no external identity provider. The requirements doc 7 fixes
(login, attribution, sessions, local storage) are met here without baking in
assumptions that would block swapping this for hospital SSO later: callers go
through :func:`resolve_session` / :func:`authenticate`, never the password store
directly.
"""

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from server.auth import store

_PBKDF2_ITERATIONS = 200_000
_SESSION_HARD_TTL = timedelta(hours=8)
_SESSION_IDLE_TIMEOUT = timedelta(minutes=30)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash_password(password: str, salt: str) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), _PBKDF2_ITERATIONS
    )
    return digest.hex()


def register_user(username: str, password: str) -> dict[str, Any]:
    """Create a local account. Raises ValueError if the username is taken."""
    if store.get_user_by_username(username) is not None:
        raise ValueError(f"User '{username}' already exists")
    user_id = uuid.uuid4().hex
    salt = secrets.token_hex(16)
    password_hash = _hash_password(password, salt)
    store.create_user(user_id, username, password_hash, salt, _now().isoformat())
    return {"id": user_id, "username": username}


def authenticate(username: str, password: str) -> dict[str, Any] | None:
    """Return the user record on a correct password, else None.

    Uses a constant-time comparison so a wrong password and an unknown user are
    indistinguishable by timing.
    """
    user = store.get_user_by_username(username)
    if user is None:
        # Hash anyway against a throwaway salt to keep timing uniform.
        _hash_password(password, "decoy")
        return None
    candidate = _hash_password(password, user["salt"])
    if not hmac.compare_digest(candidate, user["password_hash"]):
        return None
    return {"id": user["id"], "username": user["username"]}


def start_session(user_id: str) -> str:
    """Mint a session token for the user and persist it. Returns the token."""
    token = secrets.token_urlsafe(32)
    now = _now()
    store.create_session(token, user_id, now.isoformat(), (now + _SESSION_HARD_TTL).isoformat())
    return token


def resolve_session(token: str | None) -> dict[str, Any] | None:
    """Return the user behind a session token, or None if absent/invalid."""
    if not token:
        return None
    session = store.get_session(token)
    if session is None:
        return None
    if session.get("invalidated_at"):
        return None
    now = _now()
    try:
        expires_at = datetime.fromisoformat(session["expires_at"])
    except (ValueError, TypeError):
        return None
    if expires_at <= now:
        store.invalidate_session(token, now.isoformat(), "expired")
        return None
    try:
        last_seen_at = datetime.fromisoformat(session.get("last_seen_at") or session["created_at"])
    except (ValueError, TypeError):
        last_seen_at = now
    if now - last_seen_at >= _SESSION_IDLE_TIMEOUT:
        store.invalidate_session(token, now.isoformat(), "idle_timeout")
        return None
    store.touch_session(token, now.isoformat())
    user = store.get_user_by_id(session["user_id"])
    if user is None:
        store.invalidate_session(token, now.isoformat(), "user_missing")
        return None
    return {"id": user["id"], "username": user["username"]}


def end_session(token: str | None) -> None:
    if token:
        store.invalidate_session(token, _now().isoformat(), "logout")
