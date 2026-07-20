from __future__ import annotations

import logging
import sqlite3
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote, urlparse

from _common import ToolError, optional_string

logger = logging.getLogger(__name__)


PROGRESS_STEP = 1000
MAX_PROGRESS_CALLS = 100000


def _ro_uri(db_path: Path) -> str:
    return f"file:{quote(str(db_path), safe='/')}?mode=ro"


def attached_readonly_connection(
    main_path: Path, attach: dict[str, Path]
) -> sqlite3.Connection:
    """A read-only connection on ``main_path`` with every ``attach`` database
    (``{slug: path}``) ATTACHed read-only under its slug, so one statement can join
    across databases.

    The ATTACH statements are run BY THE TOOL here (before the read-only authorizer
    is installed) — they are never accepted from agent SQL: ``query_only`` and the
    authorizer below make the connection refuse ATTACH/DETACH/PRAGMA/writes for
    every subsequent statement the agent's query triggers. URI filenames are
    enabled on the connection (``uri=True``), so the ATTACH targets open ``mode=ro``
    too, never read-write."""
    conn = sqlite3.connect(_ro_uri(main_path), uri=True, timeout=5)
    conn.row_factory = sqlite3.Row
    for slug, path in attach.items():
        # The slug is a trusted run-context key (a DB name), bound as a SQL
        # identifier; the path is a read-only URI literal.
        conn.execute(
            f'ATTACH DATABASE ? AS "{slug.replace(chr(34), chr(34) * 2)}"',
            (_ro_uri(path),),
        )
    conn.execute("PRAGMA query_only = ON")
    conn.set_authorizer(_readonly_authorizer)
    return conn


def install_progress_guard(conn: sqlite3.Connection) -> None:
    calls = {"n": 0}

    def handler() -> int:
        calls["n"] += 1
        return 1 if calls["n"] > MAX_PROGRESS_CALLS else 0

    conn.set_progress_handler(handler, PROGRESS_STEP)


def _readonly_authorizer(
    action_code: int,
    _arg1: str | None,
    arg2: str | None,
    _db: str | None,
    _trigger: str | None,
) -> int:
    # Deny ATTACH/DETACH outright: the tool performs the cross-database ATTACH
    # itself (before this authorizer is installed); a statement reaching here is
    # the agent's query, which must never (de)attach a database. query_only
    # already blocks writes; this closes the schema-mutation surface too.
    if action_code in (sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH):
        logger.warning("authorizer: blocked ATTACH/DETACH from query SQL")
        return sqlite3.SQLITE_DENY
    if action_code == sqlite3.SQLITE_FUNCTION and (arg2 or "").lower() in {
        "load_extension",
        "writefile",
    }:
        logger.warning("authorizer: blocked dangerous function %s", arg2)
        return sqlite3.SQLITE_DENY

    return sqlite3.SQLITE_OK


def serialize_row(row: sqlite3.Row) -> dict[str, Any]:
    return {key: serialize_value(row[key]) for key in row.keys()}


def serialize_value(value: Any) -> Any:
    if isinstance(value, bytes):
        return {"bytesHex": value.hex()}
    return value


def resolve_sqlite_path(request: dict[str, Any], worktree: Path) -> Path:
    database_url = optional_string(request.get("databaseUrl"), "databaseUrl")
    if database_url:
        parsed = urlparse(database_url)
        if parsed.scheme != "sqlite":
            raise ToolError(
                "This implementation currently supports SQLite URLs. Add a database adapter for other engines."
            )
        raw_path = unquote(parsed.path)
        if parsed.netloc:
            raw_path = f"/{parsed.netloc}{raw_path}"
        if raw_path.startswith("/") and not database_url.startswith("sqlite:////"):
            raw_path = raw_path[1:]
    else:
        raw_path = optional_string(request.get("databasePath"), "databasePath")
    if not raw_path:
        raise ToolError(
            "No database specified. Pass databasePath or databaseUrl to select a database."
        )
    if raw_path.startswith("file:"):
        raise ToolError(
            "Use databaseUrl for SQLite URLs or databasePath for filesystem paths."
        )
    path = Path(raw_path)
    if not path.is_absolute():
        path = worktree / path
    path = path.resolve()
    if not path.exists():
        raise ToolError(f"SQLite database not found: {path}")
    if not path.is_file():
        raise ToolError(f"SQLite database path is not a file: {path}")
    return path
