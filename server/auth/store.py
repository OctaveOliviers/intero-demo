"""The local user + attribution store.

A single SQLite database under ``var/`` holds accounts, sessions, and the
run/query attribution log together (doc 7 §Persistence). The MVP runs this
locally on the server machine; the schema and access paths deliberately avoid
SQLite-specific assumptions so the same store can move to a hospital-hosted DB
later (no triggers, no SQLite-only types — plain columns + JSON text).

Patient-identifiable data may appear in the query log (the SQL text), so this
store stays local and is never exported (doc 7 §Data handling & safety).
"""

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from core.config import STATE_DB_PATH, VAR_DIR

# Auth/session/query persistence now lives in the unified state store.
AUTH_DB_PATH = STATE_DB_PATH
# Legacy pre-AUTH-T12 auth plane store; migrated forward idempotently at startup.
LEGACY_AUTH_DB_PATH = VAR_DIR / "auth.sqlite"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt          TEXT NOT NULL,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token               TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    expires_at          TEXT NOT NULL,
    last_seen_at        TEXT NOT NULL,
    invalidated_at      TEXT,
    invalidation_reason TEXT
);

-- Every run is attributed to the user who started it (doc 7 §Attribution).
-- This is the per-user run history "own audits" is read from; it does not
-- replace the C1 state DB (runs/cells/events) — it is the attribution spine
-- the auth plane owns.
CREATE TABLE IF NOT EXISTS run_attributions (
    run_id     TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    audit_id   TEXT,
    request    TEXT,
    filters    TEXT,
    started_at TEXT NOT NULL
);

-- Every database query the agent/user runs is logged against the requesting
-- user (doc 7 §Attribution & query logging) — the "who and why" on top of the
-- read-only "what" already enforced at the SQLite level.
CREATE TABLE IF NOT EXISTS query_log (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id  TEXT NOT NULL,
    run_id   TEXT,
    database TEXT,
    query    TEXT NOT NULL,
    ts       TEXT NOT NULL
);
"""


def init_store() -> None:
    """Create the store and its schema if absent. Idempotent; safe at startup."""
    VAR_DIR.mkdir(parents=True, exist_ok=True)
    with _connect() as conn:
        conn.executescript(_SCHEMA)
        _ensure_session_columns(conn)
        _migrate_legacy_auth_store(conn)


def _ensure_session_columns(conn: sqlite3.Connection) -> None:
    """Backfill session columns when upgrading an existing local auth store."""
    columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(sessions)").fetchall()
    }
    if "last_seen_at" not in columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN last_seen_at TEXT")
        conn.execute(
            "UPDATE sessions SET last_seen_at = created_at "
            "WHERE last_seen_at IS NULL"
        )
    if "invalidated_at" not in columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN invalidated_at TEXT")
    if "invalidation_reason" not in columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN invalidation_reason TEXT")


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table,),
    ).fetchone()
    return row is not None


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    if not _table_exists(conn, table):
        return set()
    return {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _migrate_legacy_auth_store(conn: sqlite3.Connection) -> None:
    """Backfill auth/session/query data from legacy var/auth.sqlite.

    Idempotent by design: inserts use stable PKs (`id`/`token`/`run_id`) with
    `INSERT OR IGNORE`, so repeated startups do not duplicate rows.
    """
    legacy = LEGACY_AUTH_DB_PATH
    if not legacy.exists():
        return
    try:
        if legacy.resolve() == Path(AUTH_DB_PATH).resolve():
            return
    except OSError:
        return

    legacy_conn = sqlite3.connect(str(legacy))
    legacy_conn.row_factory = sqlite3.Row
    try:
        if _table_exists(legacy_conn, "users"):
            for row in legacy_conn.execute(
                "SELECT id, username, password_hash, salt, created_at FROM users"
            ).fetchall():
                conn.execute(
                    "INSERT OR IGNORE INTO users "
                    "(id, username, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)",
                    (row["id"], row["username"], row["password_hash"], row["salt"], row["created_at"]),
                )

        session_cols = _table_columns(legacy_conn, "sessions")
        if session_cols:
            last_seen_expr = "last_seen_at" if "last_seen_at" in session_cols else "created_at"
            invalidated_expr = "invalidated_at" if "invalidated_at" in session_cols else "NULL"
            reason_expr = "invalidation_reason" if "invalidation_reason" in session_cols else "NULL"
            for row in legacy_conn.execute(
                "SELECT token, user_id, created_at, expires_at, "
                f"{last_seen_expr} AS last_seen_at, "
                f"{invalidated_expr} AS invalidated_at, "
                f"{reason_expr} AS invalidation_reason "
                "FROM sessions"
            ).fetchall():
                conn.execute(
                    "INSERT OR IGNORE INTO sessions "
                    "(token, user_id, created_at, expires_at, last_seen_at, invalidated_at, invalidation_reason) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (
                        row["token"],
                        row["user_id"],
                        row["created_at"],
                        row["expires_at"],
                        row["last_seen_at"] or row["created_at"],
                        row["invalidated_at"],
                        row["invalidation_reason"],
                    ),
                )

        if _table_exists(legacy_conn, "run_attributions"):
            for row in legacy_conn.execute(
                "SELECT run_id, user_id, audit_id, request, filters, started_at FROM run_attributions"
            ).fetchall():
                conn.execute(
                    "INSERT OR IGNORE INTO run_attributions "
                    "(run_id, user_id, audit_id, request, filters, started_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        row["run_id"],
                        row["user_id"],
                        row["audit_id"],
                        row["request"],
                        row["filters"],
                        row["started_at"],
                    ),
                )

        query_cols = _table_columns(legacy_conn, "query_log")
        if query_cols:
            has_id = "id" in query_cols
            if has_id:
                rows = legacy_conn.execute(
                    "SELECT id, user_id, run_id, database, query, ts FROM query_log"
                ).fetchall()
                for row in rows:
                    conn.execute(
                        "INSERT OR IGNORE INTO query_log "
                        "(id, user_id, run_id, database, query, ts) VALUES (?, ?, ?, ?, ?, ?)",
                        (
                            row["id"],
                            row["user_id"],
                            row["run_id"],
                            row["database"],
                            row["query"],
                            row["ts"],
                        ),
                    )
            else:
                rows = legacy_conn.execute(
                    "SELECT user_id, run_id, database, query, ts FROM query_log"
                ).fetchall()
                for row in rows:
                    conn.execute(
                        "INSERT INTO query_log (user_id, run_id, database, query, ts) VALUES (?, ?, ?, ?, ?)",
                        (
                            row["user_id"],
                            row["run_id"],
                            row["database"],
                            row["query"],
                            row["ts"],
                        ),
                    )
    finally:
        legacy_conn.close()


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(str(AUTH_DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# --- users -----------------------------------------------------------------

def create_user(user_id: str, username: str, password_hash: str, salt: str, created_at: str) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO users (id, username, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, username, password_hash, salt, created_at),
        )


def get_user_by_username(username: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


# --- sessions --------------------------------------------------------------

def create_session(token: str, user_id: str, created_at: str, expires_at: str) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO sessions "
            "(token, user_id, created_at, expires_at, last_seen_at, invalidated_at, invalidation_reason) "
            "VALUES (?, ?, ?, ?, ?, NULL, NULL)",
            (token, user_id, created_at, expires_at, created_at),
        )


def get_session(token: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE token = ?", (token,)).fetchone()
    return dict(row) if row else None


def delete_session(token: str) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def touch_session(token: str, last_seen_at: str) -> None:
    with _connect() as conn:
        conn.execute(
            "UPDATE sessions SET last_seen_at = ? "
            "WHERE token = ? AND invalidated_at IS NULL",
            (last_seen_at, token),
        )


def invalidate_session(token: str, invalidated_at: str, reason: str) -> None:
    with _connect() as conn:
        conn.execute(
            "UPDATE sessions SET invalidated_at = ?, invalidation_reason = ? "
            "WHERE token = ? AND invalidated_at IS NULL",
            (invalidated_at, reason, token),
        )


# --- attribution -----------------------------------------------------------

def record_run(run_id: str, user_id: str, audit_id: str | None, request: str | None,
               filters: dict | None, started_at: str) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO run_attributions "
            "(run_id, user_id, audit_id, request, filters, started_at) VALUES (?, ?, ?, ?, ?, ?)",
            (run_id, user_id, audit_id, request, json.dumps(filters or {}), started_at),
        )


def delete_run_attribution(run_id: str) -> None:
    """Remove a run's attribution row so a deleted run no longer reappears in
    the user's sidebar history (mergeServerRunHistory)."""
    with _connect() as conn:
        conn.execute("DELETE FROM run_attributions WHERE run_id = ?", (run_id,))


def list_runs_for_user(user_id: str) -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT run_id, audit_id, request, filters, started_at FROM run_attributions "
            "WHERE user_id = ? ORDER BY started_at DESC",
            (user_id,),
        ).fetchall()
    out = []
    for row in rows:
        item = dict(row)
        item["filters"] = json.loads(item["filters"]) if item["filters"] else {}
        out.append(item)
    return out


def get_run_attribution(run_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT run_id, user_id, audit_id, request, filters, started_at "
            "FROM run_attributions WHERE run_id = ?",
            (run_id,),
        ).fetchone()
    if row is None:
        return None
    item = dict(row)
    item["filters"] = json.loads(item["filters"]) if item["filters"] else {}
    return item


def record_query(user_id: str, query: str, database: str | None, run_id: str | None, ts: str) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO query_log (user_id, run_id, database, query, ts) VALUES (?, ?, ?, ?, ?)",
            (user_id, run_id, database, query, ts),
        )


def list_queries_for_user(user_id: str) -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT user_id, run_id, database, query, ts FROM query_log "
            "WHERE user_id = ? ORDER BY ts DESC",
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def seed_default_user() -> None:
    """Provision a single local account from env for the MVP demo so the loop
    is usable out of the box. Reads ``INTERO_AUTH_USER`` / ``INTERO_AUTH_PASSWORD``
    (defaults: ``clinician`` / ``intero``). No-op once the account exists.
    """
    import os

    from server.auth import service

    username = os.environ.get("INTERO_AUTH_USER", "clinician")
    password = os.environ.get("INTERO_AUTH_PASSWORD", "intero")
    if get_user_by_username(username) is None:
        try:
            service.register_user(username, password)
        except (ValueError, sqlite3.IntegrityError):
            # Another concurrent startup may have created the same default user.
            pass
