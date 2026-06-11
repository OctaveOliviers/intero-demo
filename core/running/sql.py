"""The one read-only SQL primitive for the run plane (A4).

`run_readonly_sql(db_path, sql, params)` is `validate_sql` + a read-only SQLite
connection + execute, returning rows as dicts keyed by **lower-cased** column name.
It is the single read primitive used by Tier 1 (`try_direct`) and the Tier-2
(`try_llm`) retries; the agent plane mirrors it with its own
`_sql_runtime.readonly_connection` + `_sql_validate.validate_sql` (the agent tools
import from `_common`, so they cannot share this module — they parallel it).

Read-only is enforced three ways: a lightweight statement guard here
(`validate_sql`), `PRAGMA query_only`, and an authorizer that blocks dangerous
functions. The module is stdlib-only so it stays easy to audit.
"""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path
from typing import Any

# Named bind params in the SQL, e.g. `:cohort`. (`::` casts are not used.)
_BIND = re.compile(r"(?<!:):([A-Za-z_]\w*)")
# Statements a read-only query may never contain (the SQLite layer enforces it too,
# but a query carrying these is malformed at the contract level).
_WRITE = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|ATTACH|DETACH|"
    r"PRAGMA|VACUUM|REINDEX|BEGIN|COMMIT|ROLLBACK)\b",
    re.IGNORECASE,
)


class SqlError(Exception):
    """An invalid (non-read-only / malformed) query, or a missing bind value."""


def validate_sql(sql: str) -> None:
    """Reject a query that is not a single read-only statement. Raises :class:`SqlError`."""
    if not isinstance(sql, str) or not sql.strip():
        raise SqlError("empty SQL")
    # One statement only — a trailing `;` is fine, an embedded one is not.
    if ";" in sql.rstrip().rstrip(";"):
        raise SqlError("only a single statement is allowed")
    if _WRITE.search(sql):
        raise SqlError("query is not read-only (write/DDL/transaction keyword)")


def readonly_connection(db_path: Path) -> sqlite3.Connection:
    """A read-only SQLite connection — `mode=ro`, `PRAGMA query_only`, and an
    authorizer blocking dangerous functions. Mirrors the agent plane's
    `_sql_runtime.readonly_connection`; one connection per database, so results are
    only ever joined in Python, never across attached DBs."""
    uri = f"file:{db_path}?mode=ro"
    conn = sqlite3.connect(uri, uri=True, timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only = ON")

    def _authorizer(action, _a1, arg2, _db, _trigger):
        if action == sqlite3.SQLITE_FUNCTION and (arg2 or "").lower() in {
            "load_extension",
            "writefile",
        }:
            return sqlite3.SQLITE_DENY
        return sqlite3.SQLITE_OK

    conn.set_authorizer(_authorizer)
    return conn


def _bind(sql: str, params: dict[str, Any]) -> tuple[str, list[Any]]:
    """Rewrite `:named` binds to positional `?` placeholders and build the argument
    list in order of appearance. A **list** value (the cohort identity set bound as
    `… IN (:cohort)`) expands to `?, ?, …`; an empty list becomes `NULL` so the `IN`
    matches nothing rather than raising on `IN ()`."""
    args: list[Any] = []

    def repl(m: re.Match) -> str:
        name = m.group(1)
        if name not in params:
            raise SqlError(f"no value supplied for bind :{name}")
        val = params[name]
        if isinstance(val, (list, tuple)):
            if not val:
                return "NULL"
            args.extend(val)
            return ", ".join("?" for _ in val)
        args.append(val)
        return "?"

    return _BIND.sub(repl, sql), args


def run_readonly_sql(
    db_path: Path, sql: str, params: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    """Run one read-only query and return its rows as dicts keyed by lower-cased
    column name. `params` supplies the `:named` binds (a list value expands for an
    `IN (:cohort)` clause). Raises :class:`SqlError` for a non-read-only/malformed
    query or a missing bind.

    SQLite reports a column by its *stored* name (e.g. `PATIENT_CODE`); lower-casing
    the keys lets the spec's lower-case column references resolve regardless of how
    the database happens to case its identifiers (AGENTS.md)."""
    validate_sql(sql)
    bound_sql, args = _bind(sql, params or {})
    with readonly_connection(db_path) as conn:
        cursor = conn.execute(bound_sql, args)
        cols = [c[0].lower() for c in cursor.description or []]
        dupes = {c for c in cols if cols.count(c) > 1}
        if dupes:
            raise SqlError(
                f"query selects columns that collide when lower-cased: {sorted(dupes)}; "
                f"alias them so each result column is distinct"
            )
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
