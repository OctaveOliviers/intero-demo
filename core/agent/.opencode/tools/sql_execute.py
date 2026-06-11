"""sql_execute — the agent's single SQL interface.

The agent names a `database` and writes plain `sql`. Nothing else: no run id, no
cohort, no scope predicates. The tool routes by the database name and does the
rest:

* **`cells`** (the run store) → opened read-write; only `SELECT` and
  `UPDATE cells` are allowed; ``run_id = <this run>`` is injected so the agent
  only ever touches its own run; off-code / state legality are enforced by the
  store's own DB triggers (a rejection is handed straight back).
* **any other name** (a clinical database) → opened read-only; only `SELECT` is
  allowed; ``<anchor> IN (cohort)`` is injected onto every cohort-bearing table
  so the agent can never read outside the audited cohort.

The run context (run id, cohort, anchor, database paths) is read from the run
worktree (``context.json`` in the working directory), never from the agent.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from _common import ToolError, load_request, require_string
from _run_sql import (
    inject_cohort,
    inject_run,
    is_select,
    load_context,
    parse,
    reject_nested_queries,
    render,
    serialize_rows,
    top_level_tables,
)
from _sql_runtime import install_progress_guard, readonly_connection

CELLS = "cells"
logger = logging.getLogger(__name__)


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cells_db() -> Path:
    """The run store, symlinked into the run worktree as ``audit/cells.sqlite``.
    Resolved by name relative to the tool's working directory — no path needed
    from the agent or the context."""
    return Path.cwd() / "audit" / "cells.sqlite"


def _hospital_db(name: str) -> Path:
    """A clinical database, symlinked into the worktree as
    ``database/<slug>.sqlite``. Resolved by name relative to cwd."""
    return Path.cwd() / "database" / f"{name}.sqlite"


def _run_cells(ctx: dict, sql: str) -> dict:
    """Read or write the run's cells. SELECT or UPDATE cells only; run injected."""
    tree = parse(sql)
    from sqlglot import exp  # local import keeps the module import surface lean

    reject_nested_queries(tree)
    touched = [t.name.lower() for t in top_level_tables(tree)]
    if not touched or any(name != "cells" for name in touched):
        bad = sorted({name for name in touched if name != "cells"})
        detail = f" (touched: {bad})" if bad else ""
        raise ToolError(
            "for database=\"cells\", only the `cells` table is allowed; "
            "queries against runs/events/field_codes or any other table are denied"
            f"{detail}."
        )
    state_db = str(_cells_db())
    run_id = require_string(ctx, "run_id")

    if is_select(tree):
        bound = render(inject_run(tree, run_id))
        conn = sqlite3.connect(state_db, timeout=5)
        try:
            cur = conn.execute(bound)
            cols, rows = serialize_rows(cur)
            return {"ok": True, "columns": cols, "rows": rows,
                    "rowCount": len(rows), "generatedAt": _utc()}
        finally:
            conn.close()

    if isinstance(tree, exp.Update):
        target = (tree.this.name if tree.this else "").lower()
        if target != "cells":
            raise ToolError(
                f"the only writable table is `cells`; you tried to UPDATE `{target}`. "
                f"To record a value, write: UPDATE cells SET value=..., state='filled', "
                f"confidence=..., resolved_by='agent', sources='[{{...}}]' WHERE ref='<cell ref>'."
            )
        scoped = inject_run(tree, run_id)
        if not scoped.find(exp.Returning):
            scoped = scoped.copy()
            scoped.set("returning", exp.Returning(expressions=[exp.column("ref")]))
        conn = sqlite3.connect(state_db, timeout=5)
        try:
            # Connection-scoped guard: no write may touch another run, even if the
            # injected predicate were somehow defeated.
            safe = run_id.replace("'", "''")
            conn.execute(
                f"CREATE TEMP TRIGGER _guard_run BEFORE UPDATE ON cells "
                f"WHEN NEW.run_id <> '{safe}' OR OLD.run_id <> '{safe}' "
                f"BEGIN SELECT RAISE(ABORT, 'cross-run write denied'); END"
            )
            refs = [r[0] for r in conn.execute(render(scoped)).fetchall()]
            _stamp_attempts(conn, run_id, refs, sql)
            conn.commit()
            return {"ok": True, "updated": refs, "updatedCount": len(refs),
                    "generatedAt": _utc()}
        finally:
            conn.close()

    raise ToolError(
        f"`cells` accepts only SELECT (read pending cells) or UPDATE cells (record a value), "
        f"got {type(tree).__name__}. Reissue as one of those two."
    )


def _stamp_attempts(conn: sqlite3.Connection, run_id: str, refs: list[str], sql: str) -> None:
    # database="cells" — the attempt's SQL is the agent's UPDATE against the run store
    # (the value's clinical source lives in `sources`); attempt.database is required.
    entry = {"tier": "agent", "database": "cells", "sql": sql, "result": "written"}
    for ref in refs:
        row = conn.execute(
            "SELECT attempts FROM cells WHERE run_id = ? AND ref = ?", (run_id, ref)
        ).fetchone()
        attempts = json.loads(row[0]) if row and row[0] else []
        attempts.append(entry)
        conn.execute("UPDATE cells SET attempts = ? WHERE run_id = ? AND ref = ?",
                     (json.dumps(attempts), run_id, ref))


def _run_hospital(ctx: dict, name: str, sql: str) -> dict:
    """Read a clinical database. SELECT only; cohort injected onto every
    cohort-bearing table."""
    tree = parse(sql)
    if not is_select(tree):
        raise ToolError(
            f"clinical databases are read-only — only SELECT is allowed (you tried "
            f"{type(tree).__name__}). To record a value, use database=\"cells\" with an "
            f"UPDATE cells statement; clinical databases are only for reading source data."
        )
    reject_nested_queries(tree)
    databases = ctx.get("databases") or {}
    entry = databases.get(name)
    if not entry:
        available = sorted(list(databases) + [CELLS])
        raise ToolError(
            f"unknown database {name!r}. The databases available to you are: {available}. "
            f"Use \"cells\" to read or write the worksheet, or a clinical database name to "
            f"read source data."
        )
    scoped = inject_cohort(
        tree,
        anchor=require_string(ctx, "anchor"),
        cohort=list(ctx.get("cohort") or []),
        cohort_tables=set(entry.get("cohort_tables") or []),
    )
    with readonly_connection(_hospital_db(name)) as conn:
        install_progress_guard(conn)
        cur = conn.execute(render(scoped))
        cols, rows = serialize_rows(cur)
    return {"ok": True, "columns": cols, "rows": rows,
            "rowCount": len(rows), "generatedAt": _utc()}


def _is_permission_denial(err: str) -> bool:
    lowered = err.lower()
    return any(
        token in lowered
        for token in (
            "permission denied",
            "cross-run write denied",
            "not authorized",
            "unauthorized",
            "access denied",
            "not allowed",
        )
    )


def main() -> None:
    database = "<unknown>"
    sql = "<unknown>"
    try:
        request = load_request()
        ctx = load_context()
        database = require_string(request, "database")
        sql = require_string(request, "sql")
        result = _run_cells(ctx, sql) if database == CELLS else _run_hospital(ctx, database, sql)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except ToolError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        raise SystemExit(2) from None
    except sqlite3.Error as exc:
        raw = str(exc).strip() or "SQLite error"
        if _is_permission_denial(raw):
            logger.warning(
                "sql_execute permission denial",
                extra={"database": database, "error": raw},
            )
            user_error = "Permission denied for requested database operation."
        else:
            logger.warning(
                "sql_execute sqlite execution failure",
                extra={"database": database, "error": raw},
            )
            user_error = raw
        print(json.dumps({"ok": False, "error": user_error}, indent=2))
        raise SystemExit(2) from None


if __name__ == "__main__":
    main()
