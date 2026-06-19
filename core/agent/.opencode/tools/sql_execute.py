"""sql_execute — the agent's single SQL interface.

The agent names a `database` and writes plain `sql`. Nothing else: no run id, no
cohort, no scope predicates. The tool routes by the database name and does the
rest:

* **`cells`** (the run store) → opened read-write; only `SELECT` and
  `UPDATE cells` are allowed; ``run_id = <this run>`` is injected so the agent
  only ever touches its own run; off-code / state legality are enforced by the
  store's own DB triggers (a rejection is handed straight back).
* **any other name** (a clinical database) → opened read-only; only `SELECT` is
  allowed. The named database is ``main`` and EVERY other bound database is
  ATTACHed read-only (aliased by slug) on the same connection, so one statement
  can join across databases. A cohort predicate is injected onto every top-level
  table: a table that carries the anchor is bounded by ``<anchor> IN (cohort)``;
  a foreign-database table is bounded — via the precomputed map (``identity_links``
  + safe ``foreign_keys`` paths: to-one both ways, and to-many parent→child
  descent) — to the same cohort, translated into that database's bridge key. A
  table the map cannot bound makes the query rejected (fail-safe).
  The agent's SUBMITTED SQL may never contain ATTACH/PRAGMA/DDL/multiple
  statements — the tool performs the ATTACH itself at setup, never from agent SQL.

The run context (run id, cohort, anchor, database map) is read from the run
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
    reject_multiple_statements,
    reject_nested_queries,
    render,
    scope_source_to_cell,
    serialize_rows,
    top_level_tables,
)
from _sql_runtime import attached_readonly_connection, install_progress_guard

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
        scoped = inject_run(tree, run_id).copy()
        # Always RETURN the columns we post-process on: ref (what was written),
        # plus kind/state/member (interpret-batch guard + per-cell source scoping).
        scoped.set("returning", exp.Returning(expressions=[
            exp.column(c) for c in ("ref", "kind", "state", "member")]))
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
            written = conn.execute(render(scoped)).fetchall()  # [(ref, kind, state, member)]
            refs = [r[0] for r in written]
            _reject_batched_interpret_fill(written)  # raises before commit → rolls back
            _scope_cell_sources(conn, ctx, run_id, written)
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


def _reject_batched_interpret_fill(written: list[tuple]) -> None:
    """An interpret (free-text) cell's explanation and note source are unique to
    that cell, but a column-wide UPDATE sets `explanation`/`sources` as one shared
    literal across every row it fills. So an interpret cell may only be FILLED by a
    single-cell write — refuse a batch that fills an interpret cell alongside any
    other. (Batched blocks are fine; only fills carry an explanation/source.)"""
    filled = [(ref, kind) for ref, kind, state, _ in written
              if (state or "").lower() == "filled"]
    interpret = [ref for ref, kind in filled if (kind or "").lower() == "interpret"]
    if interpret and len(filled) > 1:
        raise ToolError(
            f"interpret (free-text) cells must be filled one at a time, so each carries "
            f"its own explanation and its own note source. This UPDATE fills {len(filled)} "
            f"cells including interpret cell(s) {sorted(interpret)}. Re-issue one UPDATE per "
            f"interpret cell, each with WHERE ref='<that cell>'."
        )


def _scope_cell_sources(conn: sqlite3.Connection, ctx: dict, run_id: str,
                        written: list[tuple]) -> None:
    """Narrow each just-filled cell's stored source(s) to that cell only: the agent
    may read/write a broad column-wide query, but the persisted source must show
    only this member's row (and, for a note, the single cited row). Synthesize, not
    override — `scope_source_to_cell` leaves a query the agent already scoped."""
    anchor = ctx.get("anchor") or ""
    databases = ctx.get("databases") or {}
    if not anchor:
        return
    for ref, _kind, _state, member in written:
        if member is None:
            continue
        row = conn.execute("SELECT sources FROM cells WHERE run_id = ? AND ref = ?",
                           (run_id, ref)).fetchone()
        if not row or not row[0]:
            continue
        try:
            sources = json.loads(row[0])
        except (ValueError, TypeError):
            continue
        if not isinstance(sources, list):
            continue
        changed = False
        for s in sources:
            if not isinstance(s, dict) or not isinstance(s.get("query"), str) or not s["query"]:
                continue
            cohort_tables = set((databases.get(s.get("database")) or {}).get("cohort_tables") or [])
            new_q = scope_source_to_cell(
                s["query"], anchor=anchor, member=member, cohort_tables=cohort_tables,
                row_key=s.get("row_key"), row_id=s.get("row_id"))
            if new_q != s["query"]:
                s["query"] = new_q
                changed = True
        if changed:
            conn.execute("UPDATE cells SET sources = ? WHERE run_id = ? AND ref = ?",
                         (json.dumps(sources), run_id, ref))


def _run_hospital(ctx: dict, name: str, sql: str) -> dict:
    """Read the clinical databases. SELECT only; cohort injected onto every
    top-level table; named DB is ``main`` with the rest ATTACHed by slug."""
    # The agent's SUBMITTED SQL is a single read-only SELECT — never an ATTACH,
    # PRAGMA, DDL, or a second statement. The tool performs the ATTACH itself at
    # setup (below); it must never come from the agent. Reject multiple statements
    # FIRST so a trailing statement gets the precise message (parse() keeps only
    # the first), then enforce SELECT-only and no nested query blocks.
    reject_multiple_statements(sql)
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
        databases=databases,
        target_db=name,
    )
    # ONE read-only connection: the named DB is `main`, every OTHER bound DB is
    # ATTACHed read-only by slug, so the injected cohort-translation subqueries
    # (and any cross-DB join the agent writes) resolve on a single statement.
    attach = {slug: _hospital_db(slug) for slug in databases if slug != name}
    with attached_readonly_connection(_hospital_db(name), attach) as conn:
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
