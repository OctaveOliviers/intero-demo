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
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from _common import ToolError, load_request, require_string
from _run_sql import (
    inject_cohort,
    inject_run,
    is_select,
    load_context,
    parse,
    references_sqlite_catalog,
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
    """The run store, symlinked into the run worktree as ``template/cells.sqlite``.
    Resolved by name relative to the tool's working directory — no path needed
    from the agent or the context."""
    return Path.cwd() / "template" / "cells.sqlite"


def _hospital_db(name: str) -> Path:
    """A clinical database, symlinked into the worktree as
    ``databases/<slug>.sqlite``. Resolved by name relative to cwd."""
    return Path.cwd() / "databases" / f"{name}.sqlite"


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
            'for database="cells", only the `cells` table is allowed; '
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
            return {
                "ok": True,
                "columns": cols,
                "rows": rows,
                "rowCount": len(rows),
                "generatedAt": _utc(),
            }
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
        scoped.set(
            "returning",
            exp.Returning(
                expressions=[exp.column(c) for c in ("ref", "kind", "state", "member")]
            ),
        )
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
            written = conn.execute(
                render(scoped)
            ).fetchall()  # [(ref, kind, state, member)]
            refs = [r[0] for r in written]
            _reject_batched_interpret_fill(written)  # raises before commit → rolls back
            _reject_uncited_note_fill(
                conn, run_id, written
            )  # free-text fills must cite
            _scope_cell_sources(conn, ctx, run_id, written)
            _stamp_attempts(conn, run_id, refs, sql)
            conn.commit()
            return {
                "ok": True,
                "updated": refs,
                "updatedCount": len(refs),
                "generatedAt": _utc(),
            }
        finally:
            conn.close()

    raise ToolError(
        f"`cells` accepts only SELECT (read pending cells) or UPDATE cells (record a value), "
        f"got {type(tree).__name__}. Reissue as one of those two."
    )


def _stamp_attempts(
    conn: sqlite3.Connection, run_id: str, refs: list[str], sql: str
) -> None:
    # database="cells" — the attempt's SQL is the agent's UPDATE against the run store
    # (the value's clinical source lives in `sources`); attempt.database is required.
    entry = {"by": "agent", "database": "cells", "sql": sql, "result": "written"}
    for ref in refs:
        row = conn.execute(
            "SELECT attempts FROM cells WHERE run_id = ? AND ref = ?", (run_id, ref)
        ).fetchone()
        attempts = json.loads(row[0]) if row and row[0] else []
        attempts.append(entry)
        conn.execute(
            "UPDATE cells SET attempts = ? WHERE run_id = ? AND ref = ?",
            (json.dumps(attempts), run_id, ref),
        )


_FREE_TEXT_CACHE: dict[str, set[str]] = {}


def _free_text_columns(database: str) -> set[str]:
    """`table.column` keys (lowercased) the database model flags as free text.

    The run worktree carries each bound database's canonical model at
    ``databases/<slug>.model.json`` (provisioned by the agent step). A column the indexer
    marked ``reason: "free-text"`` (a clinical note, a free-text comment) holds prose,
    not a structured value: a cell filled from it is an INTERPRETATION that must quote
    its evidence (see :func:`_reject_uncited_note_fill`). Structured columns — numbers,
    dates, codes — carry their value directly and need no citation."""
    if database in _FREE_TEXT_CACHE:
        return _FREE_TEXT_CACHE[database]
    cols: set[str] = set()
    try:
        model = json.loads(
            (Path.cwd() / "databases" / f"{database}.model.json").read_text(
                encoding="utf-8"
            )
        )
    except (OSError, ValueError) as exc:
        logger.warning(
            "citation guard: free-text column model unavailable for %r (%s) — free-text "
            "fills will not be citation-checked for this database",
            database,
            exc,
        )
        _FREE_TEXT_CACHE[database] = cols
        return cols
    for table in model.get("tables") or []:
        if not isinstance(table, dict):
            continue
        tname = str(table.get("name") or "")
        for col in table.get("columns") or []:
            if isinstance(col, dict) and str(col.get("reason") or "") == "free-text":
                cols.add(f"{tname}.{col.get('name')}".lower())
    _FREE_TEXT_CACHE[database] = cols
    return cols


_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
# A database slug names a file under ``databases/`` — slugs carry hyphens
# (``npda-demographics``, ``cord-ph``) but never a path separator or ``.``, so this
# pattern admits the real slugs while refusing traversal (``../foo``, ``a/b``).
_DB_SLUG = re.compile(r"^[A-Za-z0-9_-]+$")


def _free_text_value(source: dict) -> str | None:
    """The text of the single free-text record a note source cites, read read-only
    from the bound clinical DB by its primary key — so a citation can be checked
    against the actual record. Returns ``None`` when the record cannot be resolved
    (no ``row_id``/``row_key``, non-identifier names, DB or row absent): the caller
    then does NOT reject, so an infra miss never becomes a false rejection — only a
    citation proven absent from a record we read does."""
    table_column = str(source.get("table_column") or "")
    row_key = str(source.get("row_key") or "")
    row_id = source.get("row_id")
    database = str(source.get("database") or "")
    table, _, column = table_column.partition(".")
    if not column or not row_key or row_id is None:
        return None
    if not (_IDENT.match(table) and _IDENT.match(column) and _IDENT.match(row_key)):
        return None
    if not _DB_SLUG.match(database):
        return None
    db_path = Path.cwd() / "databases" / f"{database}.sqlite"
    if not db_path.exists():
        return None
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=5)
        try:
            hit = conn.execute(
                f"SELECT {column} FROM {table} WHERE {row_key} = ? LIMIT 1", (row_id,)
            ).fetchone()
        finally:
            conn.close()
    except sqlite3.Error:
        return None
    return None if not hit or hit[0] is None else str(hit[0])


def _reject_uncited_note_fill(
    conn: sqlite3.Connection, run_id: str, written: list[tuple]
) -> None:
    """A cell filled from a FREE-TEXT source must quote its evidence — verbatim.

    When a fill's source reads a free-text column (a clinical note / comment), the
    value is judged FROM that prose — so the source must carry ``citations``: the
    exact substring(s) of the record that state the value. Two ways the fill is
    rejected (before commit, so the UPDATE rolls back and the agent sees how to fix):

    1. **No citation** — an inference from what the note does NOT say (a guessed
       default). A value that isn't in the record is ``blocked``, not invented.
    2. **A citation that is not a verbatim substring** of the cited record (read
       read-only by its primary key). This closes the "cite anything to pass" gap:
       a fabricated or paraphrased quote is refused, not just an empty one.

    Structured fills (numbers/dates/codes) are unaffected. A citation whose record
    can't be resolved (see :func:`_free_text_value`) is left to the presence check —
    an infra miss never false-rejects a legitimate fill."""
    for ref, _kind, state, _member in written:
        if (state or "").lower() != "filled":
            continue
        row = conn.execute(
            "SELECT sources FROM cells WHERE run_id = ? AND ref = ?", (run_id, ref)
        ).fetchone()
        if not row or not row[0]:
            continue
        try:
            sources = json.loads(row[0])
        except (ValueError, TypeError):
            continue
        if not isinstance(sources, list):
            continue
        for s in sources:
            if not isinstance(s, dict):
                continue
            table_column = str(s.get("table_column") or "").lower()
            if not table_column or table_column not in _free_text_columns(
                s.get("database") or ""
            ):
                continue
            citations = s.get("citations")
            cite_list = (
                [str(c) for c in citations if str(c).strip()]
                if isinstance(citations, list)
                else []
            )
            if not cite_list:
                raise ToolError(
                    f"cell {ref} is filled from the free-text column "
                    f"{s.get('table_column')!r} but its source carries no `citations`. "
                    f"A value judged from free text must quote the exact substring(s) of "
                    f'the record that state it — "citations": ["…"]. If the text does '
                    f"not state the value, do not infer it from what is unsaid: block the "
                    f"cell — UPDATE cells SET state='blocked', reason_code='NOT_LOCATED', "
                    f"reason_detail='<the source you checked and why the value is absent>' "
                    f"WHERE ref='{ref}'."
                )
            note_text = _free_text_value(s)
            if note_text is not None:
                for cite in cite_list:
                    if cite not in note_text:
                        raise ToolError(
                            f"cell {ref}: citation {cite!r} is not a verbatim substring of "
                            f"the cited {s.get('table_column')} record "
                            f"({s.get('row_key')}={s.get('row_id')!r}). Quote the record's "
                            f"exact words; if it does not state the value, block the cell "
                            f"instead of citing text that does not support it."
                        )


def _reject_batched_interpret_fill(written: list[tuple]) -> None:
    """An interpret (free-text) cell's explanation and note source are unique to
    that cell, but a column-wide UPDATE sets `explanation`/`sources` as one shared
    literal across every row it fills. So an interpret cell may only be FILLED by a
    single-cell write — refuse a batch that fills an interpret cell alongside any
    other. (Batched blocks are fine; only fills carry an explanation/source.)"""
    filled = [
        (ref, kind)
        for ref, kind, state, _ in written
        if (state or "").lower() == "filled"
    ]
    interpret = [ref for ref, kind in filled if (kind or "").lower() == "interpret"]
    if interpret and len(filled) > 1:
        raise ToolError(
            f"interpret (free-text) cells must be filled one at a time, so each carries "
            f"its own explanation and its own note source. This UPDATE fills {len(filled)} "
            f"cells including interpret cell(s) {sorted(interpret)}. Re-issue one UPDATE per "
            f"interpret cell, each with WHERE ref='<that cell>'."
        )


def _scope_cell_sources(
    conn: sqlite3.Connection, ctx: dict, run_id: str, written: list[tuple]
) -> None:
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
        row = conn.execute(
            "SELECT sources FROM cells WHERE run_id = ? AND ref = ?", (run_id, ref)
        ).fetchone()
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
            if (
                not isinstance(s, dict)
                or not isinstance(s.get("query"), str)
                or not s["query"]
            ):
                continue
            cohort_tables = set(
                (databases.get(s.get("database")) or {}).get("cohort_tables") or []
            )
            new_q = scope_source_to_cell(
                s["query"],
                anchor=anchor,
                member=member,
                cohort_tables=cohort_tables,
                row_key=s.get("row_key"),
                row_id=s.get("row_id"),
            )
            if new_q != s["query"]:
                s["query"] = new_q
                changed = True
        if changed:
            conn.execute(
                "UPDATE cells SET sources = ? WHERE run_id = ? AND ref = ?",
                (json.dumps(sources), run_id, ref),
            )


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
            f'{type(tree).__name__}). To record a value, use database="cells" with an '
            f"UPDATE cells statement; clinical databases are only for reading source data."
        )
    reject_nested_queries(tree)
    databases = ctx.get("databases") or {}
    entry = databases.get(name)
    if not entry:
        available = sorted(list(databases) + [CELLS])
        raise ToolError(
            f"unknown database {name!r}. The databases available to you are: {available}. "
            f'Use "cells" to read or write the worksheet, or a clinical database name to '
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
    return {
        "ok": True,
        "columns": cols,
        "rows": rows,
        "rowCount": len(rows),
        "generatedAt": _utc(),
    }


def _run_chat(ctx: dict, database: str, sql: str) -> dict:
    """Route a CHAT-mode read (Q40). A chat has no run and no worksheet — there is
    nothing to write and no cohort to inject. ``database="cells"`` is rejected
    (read a clinical database instead); any other name reads the registered
    read-only hospital DB, permission-bounded and fail-closed at the bound slugs."""
    if database == CELLS:
        raise ToolError(
            "a chat has no worksheet — there is no `cells` database to read. "
            "Read a clinical database by name to answer the question."
        )
    return _run_hospital_chat(ctx, database, sql)


def _append_chat_query_log(database: str, sql: str) -> None:
    entry = {"database": database, "query": sql, "ts": _utc()}
    path = Path.cwd() / "query_log.jsonl"
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _run_hospital_chat(ctx: dict, name: str, sql: str) -> dict:
    """The looser, permission-bounded chat sibling of :func:`_run_hospital`.

    SELECT only, read-only, local-only — but with NO cohort injection: a chat
    reads the WHOLE registered database (the per-message ceiling; Q37 v1). Nested
    queries are PERMITTED here (``reject_nested_queries`` is not called):
    subqueries / CTEs / aggregates are legitimate for a chat answer (a "how many",
    an average), and there is no cohort predicate that a subquery could dodge.
    Fail-closed on an unknown database name — only the bound ``ctx["databases"]``
    slugs are readable; every OTHER bound DB is ATTACHed read-only by slug so one
    statement can join across the registered databases."""
    reject_multiple_statements(sql)
    tree = parse(sql)
    if not is_select(tree):
        raise ToolError(
            f"a chat reads the clinical databases read-only — only SELECT is allowed "
            f"(you tried {type(tree).__name__}). There is no worksheet to write in a "
            f"chat; compose your answer from what you read and record it with "
            f"answer_execute."
        )
    if references_sqlite_catalog(tree):
        raise ToolError(
            "chat SQL may not read SQLite catalog/schema tables. Use the navigate "
            "tools (`search_execute`, `describe_execute`, `join_paths_execute`) to "
            "find tables and joins instead of dumping schema through SQL."
        )
    databases = ctx.get("databases") or {}
    if name not in databases:
        available = sorted(databases)
        raise ToolError(
            f"unknown database {name!r}. The clinical databases you can read are: "
            f"{available}. A chat reads only the registered databases (fail-closed)."
        )
    _append_chat_query_log(name, sql)
    # ONE read-only connection: the named DB is `main`, every OTHER bound DB is
    # ATTACHed read-only by slug, so a cross-DB join resolves on one statement.
    # No cohort is injected — the whole registered DB is in scope (Q37 ceiling).
    attach = {slug: _hospital_db(slug) for slug in databases if slug != name}
    with attached_readonly_connection(_hospital_db(name), attach) as conn:
        install_progress_guard(conn)
        cur = conn.execute(render(tree))
        cols, rows = serialize_rows(cur)
    return {
        "ok": True,
        "columns": cols,
        "rows": rows,
        "rowCount": len(rows),
        "generatedAt": _utc(),
    }


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
        # Branch on the context mode (Q40): a chat context reads the registered
        # DB permission-bounded with NO cohort injection; a run context is the
        # unchanged cells/hospital cohort-scoped path (byte-identical to before).
        if ctx.get("mode") == "chat":
            result = _run_chat(ctx, database, sql)
        else:
            result = (
                _run_cells(ctx, sql)
                if database == CELLS
                else _run_hospital(ctx, database, sql)
            )
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
