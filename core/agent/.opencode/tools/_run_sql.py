"""Shared core for the agent's `sql_execute` tool.

The agent writes plain SQL and names a database; everything that keeps the query
safe and scoped is done HERE, so the agent cannot get it wrong:

* **Run context comes from the working directory, not the agent.** Each run is a
  worktree holding ``context.json`` (the run id, the cohort identities, the
  cohort anchor column, and the database map). The agent never sees or passes any
  of it.
* **Scope is INJECTED into the parsed SQL, never required of the agent.** A
  hospital query gets ``<anchor> IN (cohort)`` ANDed onto every cohort-bearing
  table it touches; a run-store query gets ``run_id = <this run>`` ANDed in. The
  agent writes none of this. If a hospital query references no cohort-bearing
  table, it is rejected (fail-safe) rather than run unscoped.

Injection is done on the sqlglot AST (not by string-mangling) so joins, aliases,
and existing WHERE clauses are handled correctly.

The :func:`build_context` factory below is the **single source of truth** for the
context.json shape: ``write_run_context`` in ``core/running/try_agent.py``
imports it and :func:`load_context` reads exactly the keys it sets. Bind both
sides through this helper — never hand-author the dict — so writer and reader
can never drift.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import sqlglot
from sqlglot import exp

from _common import ToolError


# --- run context (from the worktree, never from the agent) -------------------


def build_context(
    *,
    run_id: str,
    anchor: str,
    cohort: list[Any],
    databases: dict[str, dict[str, Any]],
    provenance_sha: str | None = None,
) -> dict[str, Any]:
    """Build the run-context dict in the ONE shape both the tool reader and the
    Python writer agree on.

    Carries NO filesystem paths — the databases are symlinked into the run dir
    (``database/<slug>.sqlite`` and ``audit/cells.sqlite``) and the tool opens
    them by name, relative to its working directory. The context only holds
    the metadata the tool can't get from a symlink:

    * ``run_id``    — run identity (cells writes are auto-scoped to it)
    * ``anchor``    — cohort identity column (e.g. ``patient_code``)
    * ``cohort``    — the list of cohort identities (bound into IN-clauses)
    * ``databases`` — ``{<slug>: {cohort_tables: [<tables>]}}`` (the clinical DBs
      the run binds + which of their tables carry the anchor)
    * ``provenance`` — ``{commit_sha: <sha>}`` when known. The agent's tool
      code is symlinked from the live template (storage-layout §6), so the
      honest record of what ran is the commit SHA stamped here. Omitted from
      the dict when no SHA is available (CI without repo metadata, packaged
      install) rather than written as ``null``.
    """
    context: dict[str, Any] = {
        "run_id": run_id,
        "anchor": anchor,
        "cohort": list(cohort),
        "databases": {
            slug: {"cohort_tables": list(meta.get("cohort_tables") or [])}
            for slug, meta in databases.items()
        },
    }
    if provenance_sha:
        context["provenance"] = {"commit_sha": provenance_sha}
    return context


def load_context(cwd: Path | None = None) -> dict[str, Any]:
    """The run's ``context.json``, read from the session worktree (cwd).

    Reads exactly the shape :func:`build_context` writes — see that function for
    the keys."""
    path = (cwd or Path.cwd()) / "context.json"
    if not path.is_file():
        raise ToolError(f"no run context (expected {path}); the run worktree is not set up")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise ToolError(f"run context is unreadable: {exc}") from exc


# --- SQL parsing + classification --------------------------------------------


def parse(sql: str) -> exp.Expression:
    try:
        tree = sqlglot.parse_one(sql, read="sqlite")
    except sqlglot.errors.ParseError as exc:
        # Agents often embed JSON in SQL string literals (e.g. sources='[...]'),
        # and may escape nested single quotes as \' instead of SQLite's ''.
        # sqlite itself treats backslash as a normal character, but sqlglot
        # rejects these inputs at parse time. On parse failure, normalize only
        # single-quoted SQL string literals from \' -> '' and retry once.
        normalized = _normalize_backslash_single_quote(sql)
        if normalized != sql:
            try:
                tree = sqlglot.parse_one(normalized, read="sqlite")
            except sqlglot.errors.ParseError:
                raise ToolError(f"SQL parse error: {exc}") from exc
        else:
            raise ToolError(f"SQL parse error: {exc}") from exc
    if tree is None:
        raise ToolError("could not parse SQL")
    return tree


def _normalize_backslash_single_quote(sql: str) -> str:
    """Return ``sql`` with ``\\'`` inside single-quoted literals rewritten as
    SQLite-style escaped quotes (``''``).

    Only text *inside* single-quoted SQL string literals is touched; outside
    literal context the statement is preserved byte-for-byte.
    """
    out: list[str] = []
    i = 0
    in_single = False
    n = len(sql)
    while i < n:
        ch = sql[i]
        if not in_single:
            out.append(ch)
            if ch == "'":
                in_single = True
            i += 1
            continue

        # Inside a single-quoted literal:
        # - '' is an escaped quote and stays inside the literal.
        # - \' is normalized to '' for SQLite compatibility.
        if ch == "'":
            if i + 1 < n and sql[i + 1] == "'":
                out.append("''")
                i += 2
            else:
                out.append("'")
                in_single = False
                i += 1
            continue
        if ch == "\\" and i + 1 < n and sql[i + 1] == "'":
            out.append("''")
            i += 2
            continue

        out.append(ch)
        i += 1
    return "".join(out)


def is_select(tree: exp.Expression) -> bool:
    return isinstance(tree, (exp.Select, exp.Union, exp.Intersect, exp.Except))


def top_level_tables(tree: exp.Expression) -> list[exp.Table]:
    """Tables in the statement's own FROM/JOINs — DIRECT sources only, never
    nested subqueries (a subquery's alias is not valid at the outer scope)."""
    out: list[exp.Table] = []
    # sqlglot stores the FROM under "from_" (30.x) or "from" (older).
    from_ = tree.args.get("from_") or tree.args.get("from")
    if from_ is not None:
        sources = [from_.this, *(from_.args.get("expressions") or [])]
        out.extend(s for s in sources if isinstance(s, exp.Table))
    for join in tree.args.get("joins") or []:
        if isinstance(join.this, exp.Table):
            out.append(join.this)
    # An UPDATE's target table lives in `this`.
    if isinstance(tree, exp.Update) and isinstance(tree.this, exp.Table):
        out.append(tree.this)
    return out


# --- scope injection ----------------------------------------------------------


def reject_nested_queries(tree: exp.Expression) -> None:
    """Refuse a statement that contains a nested query block.

    Scope injection (cohort / run) is applied to the statement's TOP-LEVEL tables
    only. A subquery, CTE, or set-operation arm is its own query block that the
    top-level injection does not reach — so a cohort/run filter could be silently
    missing there. Rather than run a partially-scoped query, we reject it until
    recursive injection is implemented. (Joins and aggregates are fine — they are
    not separate query blocks.)
    """
    if any(node is not tree for node in tree.find_all(exp.Select)):
        raise ToolError(
            "nested queries (subqueries, CTEs/WITH, UNION/INTERSECT/EXCEPT) are not "
            "supported yet — scope cannot be guaranteed inside them. Rewrite as a "
            "single flat SELECT/UPDATE over its tables (JOINs and aggregates are fine)."
        )


def _in_cohort(column: exp.Column, cohort: list[Any]) -> exp.Expression:
    if not cohort:
        return exp.false()  # an empty cohort matches nothing, never everything
    return column.isin(*[exp.Literal.string(str(v)) for v in cohort])


def inject_cohort(tree: exp.Expression, anchor: str, cohort: list[Any],
                  cohort_tables: set[str]) -> exp.Expression:
    """AND ``<alias>.<anchor> IN (cohort)`` onto every cohort-bearing table.

    Reject if the query touches no cohort-bearing table — better to fail than to
    let an unscoped query reach the clinical data."""
    applied = 0
    touched = []
    for table in top_level_tables(tree):
        touched.append(table.name)
        if table.name in cohort_tables:
            alias = table.alias_or_name
            col = exp.column(anchor, table=alias)
            tree = tree.where(_in_cohort(col, cohort), append=True)
            applied += 1
    if applied == 0:
        raise ToolError(
            f"cohort scoping cannot be applied: the query reads {touched or '<no tables>'} "
            f"but none of these carry the cohort identity. The cohort-bearing tables in this "
            f"database are: {sorted(cohort_tables)}. Rewrite the query so it joins or selects "
            f"from one of those tables (the tool will add the cohort filter for you)."
        )
    return tree


def inject_run(tree: exp.Expression, run_id: str) -> exp.Expression:
    """AND ``run_id = <this run>`` into a cells SELECT/UPDATE."""
    cond = exp.column("run_id").eq(exp.Literal.string(run_id))
    return tree.where(cond, append=True)


def render(tree: exp.Expression) -> str:
    return tree.sql(dialect="sqlite")


# --- result shaping -----------------------------------------------------------


def serialize_rows(cursor) -> tuple[list[str], list[dict[str, Any]]]:
    """Cursor → (lower-cased columns, row dicts). Bytes render as hex; duplicate
    lower-cased columns are an error (alias them)."""
    cols = [c[0].lower() for c in cursor.description or []]
    dupes = {c for c in cols if cols.count(c) > 1}
    if dupes:
        raise ToolError(
            f"query selects columns that collide when lower-cased: {sorted(dupes)}; "
            "alias them so each result column is distinct"
        )
    rows = [
        {c: (v.hex() if isinstance(v, bytes) else v) for c, v in zip(cols, row)}
        for row in cursor.fetchall()
    ]
    return cols, rows
