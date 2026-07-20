"""The one read-only SQL primitive for the run plane (A4).

`run_readonly_sql(db_path, sql, params)` is `validate_sql` + a read-only SQLite
connection + execute, returning rows as dicts keyed by **lower-cased** column name.
It is the single read primitive used by `prepopulate`; the cross-database cohort
resolver (`core.filters.cohort`) shares this module's `readonly_connection`
(passing `attach=` for the multi-database join) and `bind_named_params`, so the
read-only guard has one owner. The agent plane mirrors it with its own
`_sql_runtime.attached_readonly_connection` + `_sql_validate.validate_sql` (the
agent tools import from `_common`, so they cannot share this module — they
parallel it).

Read-only is enforced three ways: a lightweight statement guard here
(`validate_sql`), `PRAGMA query_only`, and an authorizer that blocks ATTACH/DETACH
and dangerous functions. The module is stdlib-only so it stays easy to audit.
"""

from __future__ import annotations

import contextlib
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


def _ro_uri(db_path: Path) -> str:
    return f"file:{db_path}?mode=ro"


def _readonly_authorizer(action, _a1, arg2, _db, _trigger):
    # Deny ATTACH/DETACH outright: any cross-database ATTACH is performed by this
    # module BEFORE the authorizer is installed, so a statement reaching here is the
    # caller's query, which must never (de)attach a database. `query_only` already
    # blocks writes; this closes the schema-mutation surface too.
    if action in (sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH):
        return sqlite3.SQLITE_DENY
    if action == sqlite3.SQLITE_FUNCTION and (arg2 or "").lower() in {
        "load_extension",
        "writefile",
    }:
        return sqlite3.SQLITE_DENY
    return sqlite3.SQLITE_OK


def readonly_connection(
    db_path: Path, attach: dict[str, Path] | None = None
) -> sqlite3.Connection:
    """A read-only SQLite connection — `mode=ro`, `PRAGMA query_only`, and an
    authorizer blocking ATTACH/DETACH and dangerous functions. Mirrors the agent
    plane's `_sql_runtime.attached_readonly_connection`.

    With no `attach`, this is one connection per database (the default read
    primitive), so `run_readonly_sql` results are only ever joined in Python. When
    `attach` (`{slug: path}`) is supplied — the cross-database cohort case — each
    database is ATTACHed read-only under its slug BY THIS MODULE, before the
    authorizer is installed, so one statement can join across them; the authorizer
    then refuses any ATTACH/DETACH the query itself might carry. URI filenames are
    enabled (`uri=True`) so the ATTACH targets open `mode=ro` too, never read-write."""
    conn = sqlite3.connect(_ro_uri(db_path), uri=True, timeout=5)
    conn.row_factory = sqlite3.Row
    for slug, path in (attach or {}).items():
        # The slug is a trusted run-context key (a DB name), bound as a SQL
        # identifier; the path is a read-only URI literal.
        conn.execute(
            f'ATTACH DATABASE ? AS "{slug.replace(chr(34), chr(34) * 2)}"',
            (_ro_uri(Path(path)),),
        )
    conn.execute("PRAGMA query_only = ON")
    conn.set_authorizer(_readonly_authorizer)
    return conn


def bind_named_params(sql: str, params: dict[str, Any]) -> tuple[str, list[Any]]:
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
    bound_sql, args = bind_named_params(sql, params or {})
    # sqlite3.Connection.__exit__ only commits/rolls back — it never closes the
    # connection, so a bare `with readonly_connection(...) as conn:` leaks it.
    with contextlib.closing(readonly_connection(db_path)) as conn:
        cursor = conn.execute(bound_sql, args)
        cols = [c[0].lower() for c in cursor.description or []]
        dupes = {c for c in cols if cols.count(c) > 1}
        if dupes:
            raise SqlError(
                f"query selects columns that collide when lower-cased: {sorted(dupes)}; "
                f"alias them so each result column is distinct"
            )
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
