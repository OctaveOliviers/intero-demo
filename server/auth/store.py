"""The local user + attribution store.

A single SQLite database under ``var/`` holds accounts, sessions, and the
table-population/query attribution log together (doc 7 §Persistence). The MVP runs this
locally on the server machine; the schema and access paths deliberately avoid
SQLite-specific assumptions so the same store can move to a hospital-hosted DB
later (no triggers, no SQLite-only types — plain columns + JSON text).

Patient-identifiable data may appear in the query log (the SQL text), so this
store stays local and is never exported (doc 7 §Data handling & safety).
"""

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from core.config import STATE_DB_PATH, VAR_DIR

# Auth/session/query persistence now lives in the unified state store.
AUTH_DB_PATH = STATE_DB_PATH
# Legacy pre-AUTH-T12 auth plane store; migrated forward idempotently at startup.
LEGACY_AUTH_DB_PATH = VAR_DIR / "auth.sqlite"

# The three role keys and their EXACT §4 permission sets (control-plane
# contract §4 / ADR 0003). `admin` is the clinician set PLUS three infra keys —
# enumerated, with no `*` wildcard. `agent` holds nothing.
_CLINICIAN_PERMISSIONS = (
    "dataset.read",
    "dataset.manage",
    "dataset.query",
    "template.read",
    "template.manage",
    "thread.read",
    "thread.manage",
    "table.read",
    "table.manage",
    "project.read",
    "project.manage",
    "table_population.create",
    "table_population.read",
    "table_population.stop",
    "table_population.edit_cells",
    "grant.manage_owned",
    "logs.read_query_log",
)
_ADMIN_INFRA_PERMISSIONS = (
    "iam.manage_users",
    "iam.manage_roles",
    "database.manage",
)
_ROLE_CATALOG: dict[str, tuple[str, ...]] = {
    "clinician": _CLINICIAN_PERMISSIONS,
    "admin": _CLINICIAN_PERMISSIONS + _ADMIN_INFRA_PERMISSIONS,
    "agent": (),
}
# The seed/demo account resolves to the clinician-superset admin role; freshly
# registered human accounts default to clinician (§10 / §15).
SEED_USER_ROLE = "admin"
DEFAULT_USER_ROLE = "clinician"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id                  TEXT PRIMARY KEY,
    username            TEXT NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    salt                TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    role_id             TEXT,
    is_active           INTEGER NOT NULL DEFAULT 1,
    display_name        TEXT,
    must_reset_password INTEGER NOT NULL DEFAULT 0
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

-- The role catalog and its action-class permissions (control-plane §2/§4).
-- A user's role is resolved from `users.role_id` -> `roles.name`, never from
-- the username. `admin` is the full `clinician` set plus three infra keys —
-- there is no `*` wildcard in the seeded data (ADR 0003).
CREATE TABLE IF NOT EXISTS roles (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
    id          TEXT PRIMARY KEY,
    key         TEXT NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    granted_at    TEXT NOT NULL,
    UNIQUE (role_id, permission_id)
);

-- Every table population is attributed to the user who started it (doc 7 §Attribution).
-- This is the per-user table-population history "own audits" is read from; it does not
-- replace the C1 state DB (runs/cells/events) — it is the attribution table
-- the auth plane owns.
CREATE TABLE IF NOT EXISTS run_attributions (
    run_id     TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    audit_id   TEXT,
    request    TEXT,
    filters    TEXT,
    started_at TEXT NOT NULL
);

-- Per-user "seen" record: which tables a user has opened the FULL grid for.
-- A shared table is global, but this row is PER-USER, so a user's blue
-- "finished, unopened" dot survives across logins until THEY open it and a
-- different user opening it does not clear it for others. Mirrors the per-user
-- run_attributions table the auth plane owns.
CREATE TABLE IF NOT EXISTS table_views (
    user_id   TEXT NOT NULL,
    table_id  TEXT NOT NULL,
    opened_at TEXT NOT NULL,
    PRIMARY KEY (user_id, table_id)
);

-- Per-user "seen latest thread update" record. Unlike table_views, this timestamp
-- is updated on every thread open because a later completed agent turn should
-- make the thread unread again until this user opens it after that update.
CREATE TABLE IF NOT EXISTS thread_views (
    user_id    TEXT NOT NULL,
    thread_id  TEXT NOT NULL,
    opened_at  TEXT NOT NULL,
    PRIMARY KEY (user_id, thread_id)
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

-- Per-resource access grants (control-plane contract §2/§5): the single source
-- of truth for who may reach a dataset/template/table. Ownership IS an active
-- `manage` self-grant (creation self-grants manage), so there is no separate
-- `created_by` on the artifact JSON. An active grant is
-- `revoked_at IS NULL AND (expires_at IS NULL OR now < expires_at)`; evaluation
-- is additive over a user's own grants + their role grants (subject_type='role').
-- `hospital_id` is OMITTED for MVP-store consistency with the tables above (the
-- contract carries it as tenant-ready intent; single-deployment MVP doesn't need
-- it and adding it now would diverge from the seeded store).
CREATE TABLE IF NOT EXISTS resource_grants (
    id            TEXT PRIMARY KEY,
    subject_type  TEXT NOT NULL,
    subject_id    TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id   TEXT NOT NULL,
    grant_type    TEXT NOT NULL,
    granted_by    TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    expires_at    TEXT,
    revoked_at    TEXT
);
"""


def init_store() -> None:
    """Create the store and its schema if absent. Idempotent; safe at startup.

    Startup seeding order matters: the role catalog is seeded first so the
    ``clinician`` role exists, then role-less accounts are backfilled to it
    (the safe default). ``seed_default_user`` runs after ``init_store`` and
    re-points the demo account to ``admin``, so the backfill's clinician default
    never clobbers the demo admin.

    The ``resource_grants`` table (control-plane §2/§5) is created here via the
    same ``CREATE TABLE IF NOT EXISTS`` pattern. Ownership is an active ``manage``
    self-grant written at resource-creation time (no ``created_by`` on artifacts),
    so this slice (#298) builds grant CRUD + owner-or-grant enforcement on the
    table reads; the §10.4 owner self-grant BACKFILL of pre-existing artifacts is
    the next slice. The grant store + helpers live in ``server.auth.grants``.
    """
    VAR_DIR.mkdir(parents=True, exist_ok=True)
    with _connect() as conn:
        conn.executescript(_SCHEMA)
        _ensure_session_columns(conn)
        _ensure_user_rbac_columns(conn)
        _migrate_legacy_auth_store(conn)
        _seed_role_catalog(conn)
        _backfill_user_roles(conn)


def _ensure_session_columns(conn: sqlite3.Connection) -> None:
    """Backfill session columns when upgrading an existing local auth store."""
    columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(sessions)").fetchall()
    }
    if "last_seen_at" not in columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN last_seen_at TEXT")
        conn.execute(
            "UPDATE sessions SET last_seen_at = created_at WHERE last_seen_at IS NULL"
        )
    if "invalidated_at" not in columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN invalidated_at TEXT")
    if "invalidation_reason" not in columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN invalidation_reason TEXT")


def _ensure_user_rbac_columns(conn: sqlite3.Connection) -> None:
    """Add the RBAC columns to `users` when upgrading an existing store.

    All columns carry defaults so pre-RBAC flows (create_user / register) keep
    working: `is_active` defaults true, `must_reset_password` false (first-login
    enforcement is a later slice), `display_name` falls back to the username,
    and `role_id` is assigned by the seed/register paths.
    """
    columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(users)").fetchall()
    }
    if "role_id" not in columns:
        conn.execute("ALTER TABLE users ADD COLUMN role_id TEXT")
    if "is_active" not in columns:
        conn.execute(
            "ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1"
        )
    if "display_name" not in columns:
        conn.execute("ALTER TABLE users ADD COLUMN display_name TEXT")
        conn.execute(
            "UPDATE users SET display_name = username WHERE display_name IS NULL"
        )
    if "must_reset_password" not in columns:
        conn.execute(
            "ALTER TABLE users ADD COLUMN must_reset_password INTEGER NOT NULL DEFAULT 0"
        )


def _seed_role_catalog(conn: sqlite3.Connection) -> None:
    """Seed the three roles, the permission keys, and the role->permission rows.

    Idempotent: keyed on the unique `name`/`key`/(role_id, permission_id), so
    re-running creates no duplicates and raises no errors.
    """
    now = _now_iso()
    role_ids: dict[str, str] = {}
    for name in _ROLE_CATALOG:
        conn.execute(
            "INSERT OR IGNORE INTO roles (id, name, description, created_at) "
            "VALUES (?, ?, NULL, ?)",
            (uuid.uuid4().hex, name, now),
        )
        row = conn.execute("SELECT id FROM roles WHERE name = ?", (name,)).fetchone()
        role_ids[name] = row["id"]

    permission_ids: dict[str, str] = {}
    all_keys = {key for keys in _ROLE_CATALOG.values() for key in keys}
    for key in all_keys:
        conn.execute(
            "INSERT OR IGNORE INTO permissions (id, key, description) VALUES (?, ?, NULL)",
            (uuid.uuid4().hex, key),
        )
        row = conn.execute(
            "SELECT id FROM permissions WHERE key = ?", (key,)
        ).fetchone()
        permission_ids[key] = row["id"]

    for name, keys in _ROLE_CATALOG.items():
        for key in keys:
            conn.execute(
                "INSERT OR IGNORE INTO role_permissions "
                "(role_id, permission_id, granted_at) VALUES (?, ?, ?)",
                (role_ids[name], permission_ids[key], now),
            )


def _backfill_user_roles(conn: sqlite3.Connection) -> None:
    """Assign the ``clinician`` default to every user with ``role_id IS NULL``.

    A user migrated forward from the legacy ``var/auth.sqlite`` (via
    ``_migrate_legacy_auth_store``) or otherwise created pre-RBAC ends up with
    ``role_id = NULL``, which resolves to the zero-permission ``agent`` principal
    and is locked out once enforcement is live. Backfilling to ``clinician`` (the
    safe default — NEVER derived from the username) closes that fail-closed gap.

    Idempotent: only touches ``role_id IS NULL`` rows, so re-running is a clean
    no-op and accounts already bound to ``admin``/``clinician`` are untouched.
    Runs before ``seed_default_user`` re-points the demo account to ``admin``.
    """
    row = conn.execute(
        "SELECT id FROM roles WHERE name = ?", (DEFAULT_USER_ROLE,)
    ).fetchone()
    if row is None:
        return
    conn.execute("UPDATE users SET role_id = ? WHERE role_id IS NULL", (row["id"],))


def backfill_user_roles() -> None:
    """Standalone test/ops entry point for the idempotent role backfill: opens
    its own connection and runs the same ``_backfill_user_roles`` logic.

    Boot startup does NOT go through here — ``init_store`` calls the private
    ``_backfill_user_roles(conn)`` directly on its own connection. This wrapper
    exists only for callers that need to run the backfill on demand."""
    with _connect() as conn:
        _backfill_user_roles(conn)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table,),
    ).fetchone()
    return row is not None


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    if not _table_exists(conn, table):
        return set()
    return {
        row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
    }


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
        user_cols = _table_columns(legacy_conn, "users")
        if user_cols:
            # display_name is required (contract §2); default it to the username
            # like create_user, preserving a legacy display_name when present.
            display_name_expr = (
                "COALESCE(display_name, username)"
                if "display_name" in user_cols
                else "username"
            )
            for row in legacy_conn.execute(
                "SELECT id, username, password_hash, salt, created_at, "
                f"{display_name_expr} AS display_name FROM users"
            ).fetchall():
                conn.execute(
                    "INSERT OR IGNORE INTO users "
                    "(id, username, password_hash, salt, created_at, display_name) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        row["id"],
                        row["username"],
                        row["password_hash"],
                        row["salt"],
                        row["created_at"],
                        row["display_name"],
                    ),
                )

        session_cols = _table_columns(legacy_conn, "sessions")
        if session_cols:
            last_seen_expr = (
                "last_seen_at" if "last_seen_at" in session_cols else "created_at"
            )
            invalidated_expr = (
                "invalidated_at" if "invalidated_at" in session_cols else "NULL"
            )
            reason_expr = (
                "invalidation_reason"
                if "invalidation_reason" in session_cols
                else "NULL"
            )
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


# --- roles -----------------------------------------------------------------


def get_role_permission_keys(role_name: str) -> frozenset[str]:
    """Return the set of permission keys granted to a role, resolved from the
    seeded catalog. Unknown roles return the empty set."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT p.key FROM role_permissions rp "
            "JOIN roles r ON r.id = rp.role_id "
            "JOIN permissions p ON p.id = rp.permission_id "
            "WHERE r.name = ?",
            (role_name,),
        ).fetchall()
    return frozenset(row["key"] for row in rows)


def get_role_id(role_name: str) -> str | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id FROM roles WHERE name = ?", (role_name,)
        ).fetchone()
    return row["id"] if row else None


def set_user_role(user_id: str, role_id: str | None) -> None:
    with _connect() as conn:
        conn.execute("UPDATE users SET role_id = ? WHERE id = ?", (role_id, user_id))


def get_role_name_for_user(user_id: str) -> str | None:
    """Resolve a user's role name via `users.role_id` -> `roles.name`.

    Never derives the role from the username. Returns None when the user has no
    role bound (callers treat the missing case as the `agent` principal)."""
    with _connect() as conn:
        row = conn.execute(
            "SELECT r.name FROM users u "
            "JOIN roles r ON r.id = u.role_id "
            "WHERE u.id = ?",
            (user_id,),
        ).fetchone()
    return row["name"] if row else None


# --- users -----------------------------------------------------------------


def create_user(
    user_id: str, username: str, password_hash: str, salt: str, created_at: str
) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO users (id, username, password_hash, salt, created_at, display_name) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, username, password_hash, salt, created_at, username),
        )


def get_user_by_username(username: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def get_first_user_id_with_role(role_id: str) -> str | None:
    """The id of the EARLIEST-created account bound to ``role_id`` (``created_at``
    ASC), or ``None`` when no account holds that role. Keeps the ``users``-table
    query behind the store boundary — the §10.4 backfill resolves the demo admin
    by role this way, never by a hardcoded id/username."""
    with _connect() as conn:
        row = conn.execute(
            "SELECT id FROM users WHERE role_id = ? ORDER BY created_at LIMIT 1",
            (role_id,),
        ).fetchone()
    return row["id"] if row else None


def list_users() -> list[dict[str, Any]]:
    """Return every account with its role name resolved from `users.role_id`.

    The read-only data source for the admin IAM "Users & roles" screen (§9). Joins
    `roles` so the row carries the role *name* (never the username-derived role).
    `is_active`/`must_reset_password` are normalized to booleans for the API layer.
    A user with no bound role surfaces `role = None` (the caller treats it as the
    fail-closed `agent` principal — it should not happen post-backfill)."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT u.id, u.username, u.display_name, r.name AS role, "
            "u.is_active, u.must_reset_password "
            "FROM users u LEFT JOIN roles r ON r.id = u.role_id "
            "ORDER BY u.username"
        ).fetchall()
    out = []
    for row in rows:
        item = dict(row)
        item["is_active"] = bool(item["is_active"])
        item["must_reset_password"] = bool(item["must_reset_password"])
        out.append(item)
    return out


def list_clinicians() -> list[dict[str, Any]]:
    """Return the share-target directory: `id` + `display_name` of every active
    `clinician`-role account (control-plane §5; auth-and-access §10).

    The minimal clinical-staff directory an owner picks a colleague from when
    sharing. The role is resolved from `users.role_id` -> `roles.name` (NEVER the
    username), so the seed/demo `admin` account is excluded — only `clinician`-role
    accounts. Deactivated users (`is_active = 0`) are excluded; not-yet-onboarded
    accounts (`must_reset_password = 1`) are INCLUDED, so a colleague created but
    not yet logged in can be pre-shared. No PID/IAM fields are read — `id` and
    `display_name` only."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT u.id, COALESCE(u.display_name, u.username) AS display_name "
            "FROM users u JOIN roles r ON r.id = u.role_id "
            "WHERE r.name = 'clinician' AND u.is_active = 1 "
            "ORDER BY display_name",
        ).fetchall()
    return [dict(row) for row in rows]


def set_must_reset_password(user_id: str, must_reset: bool) -> None:
    """Set or clear the first-login reset flag for a single account (§9)."""
    with _connect() as conn:
        conn.execute(
            "UPDATE users SET must_reset_password = ? WHERE id = ?",
            (1 if must_reset else 0, user_id),
        )


def update_password_and_clear_reset(
    user_id: str, password_hash: str, salt: str
) -> None:
    """Set a new credential and clear the first-login reset flag in one write (§9)."""
    with _connect() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ?, salt = ?, must_reset_password = 0 "
            "WHERE id = ?",
            (password_hash, salt, user_id),
        )


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
        row = conn.execute(
            "SELECT * FROM sessions WHERE token = ?", (token,)
        ).fetchone()
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


def record_run(
    run_id: str,
    user_id: str,
    audit_id: str | None,
    request: str | None,
    filters: dict | None,
    started_at: str,
) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO run_attributions "
            "(run_id, user_id, audit_id, request, filters, started_at) VALUES (?, ?, ?, ?, ?, ?)",
            (run_id, user_id, audit_id, request, json.dumps(filters or {}), started_at),
        )


def delete_run_attribution(run_id: str) -> None:
    """Remove a run's attribution row so a deleted run no longer reappears in
    the user's sidebar history."""
    with _connect() as conn:
        conn.execute("DELETE FROM run_attributions WHERE run_id = ?", (run_id,))


def list_table_populations_for_user(user_id: str) -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT run_id, audit_id, request, filters, started_at FROM run_attributions "
            "WHERE user_id = ? ORDER BY started_at DESC",
            (user_id,),
        ).fetchall()
    out = []
    for row in rows:
        item = dict(row)
        item["table_population_id"] = item.pop("run_id")
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


# --- per-user table 'seen' --------------------------------------------------


def mark_table_opened(user_id: str, table_id: str, opened_at: str) -> None:
    """Record that ``user_id`` has opened the full grid of ``table_id``.

    Idempotent upsert keyed on (user_id, table_id): re-opening a table is a
    no-op (the first ``opened_at`` is preserved via ``INSERT OR IGNORE``), so
    "opened" is a durable, per-user fact."""
    with _connect() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO table_views (user_id, table_id, opened_at) "
            "VALUES (?, ?, ?)",
            (user_id, table_id, opened_at),
        )


def opened_table_ids_for_user(user_id: str) -> set[str]:
    """The set of table ids ``user_id`` has opened (for stamping the per-user
    ``opened`` flag on the tables list). Empty set when the user has opened none."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT table_id FROM table_views WHERE user_id = ?", (user_id,)
        ).fetchall()
    return {row["table_id"] for row in rows}


def delete_table_views(table_id: str) -> None:
    """Remove every per-user ``table_views`` ('seen') row for a table so deleting
    a table leaves no orphaned 'opened' rows behind (mirrors the
    table-population attribution cleanup)."""
    with _connect() as conn:
        conn.execute("DELETE FROM table_views WHERE table_id = ?", (table_id,))


# --- per-user thread 'seen latest update' ----------------------------------


def mark_thread_opened(user_id: str, thread_id: str, opened_at: str) -> None:
    """Record that ``user_id`` opened ``thread_id`` at ``opened_at``.

    Re-opening updates the timestamp, so the sidebar can compare it with the
    thread's latest ``updated_at`` and show a blue dot for completed updates this
    user has not opened yet.
    """
    with _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO thread_views (user_id, thread_id, opened_at) "
            "VALUES (?, ?, ?)",
            (user_id, thread_id, opened_at),
        )


def thread_opened_at_for_user(user_id: str) -> dict[str, str]:
    """Map of thread id to the time ``user_id`` last opened it."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT thread_id, opened_at FROM thread_views WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    return {row["thread_id"]: row["opened_at"] for row in rows}


def delete_thread_views(thread_id: str) -> None:
    """Remove every per-user ``thread_views`` row for a deleted thread."""
    with _connect() as conn:
        conn.execute("DELETE FROM thread_views WHERE thread_id = ?", (thread_id,))


def record_query(
    user_id: str, query: str, database: str | None, run_id: str | None, ts: str
) -> None:
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
    out = []
    for row in rows:
        item = dict(row)
        item["table_population_id"] = item.pop("run_id")
        out.append(item)
    return out


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

    # The seed/demo account is the clinician-superset admin (§10/§15) — its role
    # is resolved by role_id, not its username (which may itself be "clinician").
    # Idempotent: re-pointing to the same role_id is a no-op.
    seeded = get_user_by_username(username)
    if seeded is not None:
        set_user_role(seeded["id"], get_role_id(SEED_USER_ROLE))


def seed_second_clinician() -> None:
    """Provision a second ``clinician``-role account distinct from the demo admin,
    so ``make dev-seeded`` yields a colleague to exercise owner -> peer sharing
    end-to-end (§15). Reads ``INTERO_AUTH_USER_2`` / ``INTERO_AUTH_PASSWORD_2``
    (defaults: ``clinician2`` / ``intero``). No-op once the account exists.

    Unlike ``seed_default_user`` this account stays ``clinician`` (the
    ``register_user`` default), NOT the admin superset — it is a clinical peer
    that holds none of the demo's resource grants until something is shared.
    """
    import os

    from server.auth import service

    username = os.environ.get("INTERO_AUTH_USER_2", "clinician2")
    password = os.environ.get("INTERO_AUTH_PASSWORD_2", "intero")
    if get_user_by_username(username) is None:
        try:
            service.register_user(username, password)
        except (ValueError, sqlite3.IntegrityError):
            # Another concurrent startup may have created the same account.
            pass
