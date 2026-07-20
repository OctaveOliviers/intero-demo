"""Shared core for the agent's `sql_execute` tool.

The agent writes plain SQL and names a database; everything that keeps the query
safe and scoped is done HERE, so the agent cannot get it wrong:

* **Run context comes from the working directory, not the agent.** Each run is a
  worktree holding ``context.json`` (the run id, the cohort identities, the
  cohort anchor column, and the database map). The agent never sees or passes any
  of it.
* **Scope is INJECTED into the parsed SQL, never required of the agent.** A
  hospital query gets a cohort predicate ANDed onto every TOP-LEVEL table it
  touches; a run-store query gets ``run_id = <this run>`` ANDed in. The agent
  writes none of this. A table that carries the anchor is bounded by
  ``<anchor> IN (cohort)``; a foreign-database table is bounded — via the
  precomputed navigation map (``identity_links`` + ``foreign_keys``) — to
  the same cohort, translated into that database's bridge key. If a table cannot
  be safely bounded by any of these, the query is rejected (fail-safe) rather
  than run unscoped. **Cross-database reads are free** (one read-only attached
  connection joins every bound database), but only ever over cohort-scoped tables.

Injection is done on the sqlglot AST (not by string-mangling) so joins, aliases,
and existing WHERE clauses are handled correctly.

The :func:`build_context` factory below is the **single source of truth** for the
context.json shape: ``write_run_context`` in ``core/table_population/populate.py``
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
    databases: dict[str, dict[str, Any]],
    run_id: str = "",
    anchor: str = "",
    cohort: list[Any] | None = None,
    provenance_sha: str | None = None,
    mode: str = "run",
) -> dict[str, Any]:
    """Build the run-context dict in the ONE shape both the tool reader and the
    Python writer agree on.

    Carries NO filesystem paths — the databases are symlinked into the run dir
    (``databases/<slug>.sqlite`` and ``template/cells.sqlite``) and the tool opens
    them by name, relative to its working directory. The context only holds
    the metadata the tool can't get from a symlink.

    ``mode`` selects the SQL posture (Q40):

    * ``"run"`` (default) — a populate run. The dict is BYTE-IDENTICAL to before:
      ``run_id``/``anchor``/``cohort``/``databases`` (no ``mode`` key), so the
      table run path stays unchanged.
    * ``"chat"`` — a chat (no run, no cells, no cohort). The dict is
      ``{"mode": "chat", "databases": {...}}`` only: there is no run id, no anchor,
      and no cohort to inject, so the chat-mode ``sql_execute`` reads the whole
      registered read-only hospital DB (the per-message ceiling, fail-closed at
      the bound databases). ``run_id``/``anchor``/``cohort`` are ignored.

    The ``databases`` map (in either mode) is per slug:

    * ``cohort_tables``   — tables that physically carry the anchor column.
    * ``identity_links``  — cross-database bridges (``{column, target}``).
    * ``foreign_keys``    — within-database join hops (``{column, target,
      cardinality}``).

    In run mode the rest are:

    * ``run_id``    — run identity (cells writes are auto-scoped to it)
    * ``anchor``    — cohort identity column (e.g. ``patient_code``)
    * ``cohort``    — the list of cohort identities (bound into IN-clauses)
    * ``provenance`` — ``{commit_sha: <sha>}`` when known. Omitted when absent.
    """
    db_map = {
        slug: {
            "cohort_tables": list(meta.get("cohort_tables") or []),
            "identity_links": list(meta.get("identity_links") or []),
            "foreign_keys": list(meta.get("foreign_keys") or []),
        }
        for slug, meta in databases.items()
    }
    if mode == "chat":
        # A chat has no run / no cells / no cohort — read the whole bound DB.
        return {"mode": "chat", "databases": db_map}
    context: dict[str, Any] = {
        "run_id": run_id,
        "anchor": anchor,
        "cohort": list(cohort or []),
        "databases": db_map,
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
        raise ToolError(
            f"no run context (expected {path}); the run worktree is not set up"
        )
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise ToolError(f"run context is unreadable: {exc}") from exc


# --- SQL parsing + classification --------------------------------------------


def parse(sql: str) -> exp.Expression:
    try:
        tree = sqlglot.parse_one(sql, read="sqlite")
    except sqlglot.errors.SqlglotError as exc:
        # Agents often embed JSON in SQL string literals (e.g. sources='[...]'),
        # and may escape nested single quotes as \' instead of SQLite's ''.
        # sqlite itself treats backslash as a normal character, but sqlglot
        # rejects these inputs at parse time — as a ParseError OR a TokenError
        # (siblings under SqlglotError, NOT a subclass relationship), so we catch
        # the base to turn a \' tokenization failure into a clean ToolError rather
        # than an uncaught traceback. On failure, normalize only single-quoted SQL
        # string literals from \' -> '' and retry once.
        normalized = _normalize_backslash_single_quote(sql)
        if normalized != sql:
            try:
                tree = sqlglot.parse_one(normalized, read="sqlite")
            except sqlglot.errors.SqlglotError:
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


def references_sqlite_catalog(tree: exp.Expression) -> bool:
    """Return True when a statement reads SQLite's internal schema/catalog tables.

    Chat agents must find structure through the navigate tools, not by dumping
    ``sqlite_master`` / ``sqlite_schema`` (or related ``sqlite_*`` internals) or
    table-valued ``pragma_*`` schema functions over SQL. SQLite reserves
    ``sqlite_`` table names for internal objects, and ``pragma_*`` table-valued
    functions expose catalog metadata, so blocking those prefixes does not reject
    user-created clinical tables.
    """
    for table in tree.find_all(exp.Table):
        name = _catalog_table_name(table)
        if name.startswith(("sqlite_", "pragma_")):
            return True
    return False


def _catalog_table_name(table: exp.Table) -> str:
    name = str(table.name or "").lower()
    if name:
        return name
    # sqlglot represents table-valued PRAGMAs with arguments, e.g.
    # pragma_table_info('x'), as Table(this=Anonymous(...)) and an empty
    # table.name. Pull the function name from the wrapped expression.
    if isinstance(table.this, exp.Anonymous):
        return str(table.this.name or table.this.this or "").lower()
    return ""


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


def reject_multiple_statements(sql: str) -> None:
    """Refuse a submission that is more than one SQL statement.

    Scope injection works on the ONE statement :func:`parse` returns (sqlglot's
    ``parse_one`` silently keeps only the first). A second statement — e.g. a
    trailing ``ATTACH``/``PRAGMA``/DDL the agent appended — would slip past
    unscoped and unguarded, so we reject anything but a single statement. The
    tool, never the agent, performs the cross-database ATTACH at setup."""
    try:
        # Normalize \' -> '' FIRST, exactly as parse() does, so a SELECT carrying
        # backslash-escaped quotes (JSON in a string literal) is not rejected here
        # before parse() ever gets to accept it. Catch the SqlglotError base so a
        # TokenError (a \' tokenization failure, not a ParseError) is a clean error.
        statements = [
            s
            for s in sqlglot.parse(
                _normalize_backslash_single_quote(sql), read="sqlite"
            )
            if s is not None
        ]
    except sqlglot.errors.SqlglotError as exc:
        raise ToolError(f"SQL parse error: {exc}") from exc
    if len(statements) > 1:
        raise ToolError(
            "only a single SQL statement is allowed; the tool performs any "
            "cross-database ATTACH itself — never send ATTACH, PRAGMA, DDL, or a "
            "second statement."
        )


def reject_nested_queries(tree: exp.Expression) -> None:
    """Refuse a statement that contains a nested query block.

    Scope injection (cohort / run) is applied to the statement's TOP-LEVEL tables
    only. A subquery, CTE, or set-operation arm is its own query block that the
    top-level injection does not reach — so a cohort/run filter could be silently
    missing there. Rather than run a partially-scoped query, we reject it until
    recursive injection is implemented. (Joins and aggregates are fine — they are
    not separate query blocks.)

    A parenthesized FROM/JOIN source (``FROM (t)``, ``JOIN (a JOIN b)``) parses to
    an ``exp.Subquery`` even when it wraps only a table or join — NOT a SELECT —
    so the ``find_all(exp.Select)`` check below does not see it. But
    :func:`top_level_tables` does not descend into a Subquery, so the wrapped table
    would slip past cohort scoping entirely (an unscoped read of the whole clinical
    table). Reject every Subquery node alongside true nested SELECTs (fail-safe).
    """
    if (
        any(node is not tree for node in tree.find_all(exp.Select))
        or tree.find(exp.Subquery) is not None
    ):
        raise ToolError(
            "nested queries (subqueries, CTEs/WITH, UNION/INTERSECT/EXCEPT) and "
            "parenthesized table groups (e.g. `FROM (t)` or `JOIN (a JOIN b)`) are "
            "not supported yet — scope cannot be guaranteed inside them. Rewrite as a "
            "single flat SELECT/UPDATE over its tables (JOINs and aggregates are fine)."
        )


# --- the precomputed navigation map (parsed from context.json) ----------------
#
# Shares the prepopulate executor's NAVIGATION inputs (core/table_population/populate +
# build_populate_spec): the cohort lives in the ANCHOR database keyed by `anchor`;
# a foreign database is bounded by translating that cohort into the foreign DB's
# bridge key (via an `identity_links` entry).
#
# TIER-1 vs TIER-3 — DELIBERATE DIVERGENCE on which FK hops are usable:
#   * Tier 1 (build_populate_spec) COPIES a value into the cell by JOINing along
#     the FK path. A to-many hop joins one anchor row to many rows and would
#     duplicate the cell value, so Tier 1 walks TO-ONE edges ONLY (its
#     `_fk_adjacency` / `_reachable_via_fk`).
#   * Tier 3 (this tool) NEVER copies along the path. It wraps the agent's own
#     SELECT in an `EXISTS` that merely FILTERS the queried table's rows to the
#     cohort (`_scope_predicate` / `_exists_over_path`). The EXISTS correlates each
#     queried row back to its single ancestor chain, so descending a to-many FK
#     (`clinic_visits` -> `measurements`) does NOT fan the row out — the fan-out
#     stays harmlessly inside the EXISTS subquery. So the agent ALSO reaches the
#     to-many child tables (measurements/screening_results/clinical_notes) that
#     hold most of the audit data and that Tier 1 cannot copy.
# Hence `_scope_adjacency` / `_scope_path` below are intentionally BROADER than
# build_populate_spec's to-one-only pair — do NOT "re-sync" them.


def _split2(ref: str) -> tuple[str, str] | None:
    """``"table.column"`` -> ``(table, column)`` (lower-cased), or None."""
    if not isinstance(ref, str):
        return None
    table, _, column = ref.partition(".")
    table, column = table.strip().lower(), column.strip().lower()
    return (table, column) if table and column else None


def _split_target(ref: str) -> tuple[str, str, str] | None:
    """``"<db> -> table.column"`` -> ``(db, table, column)`` (lower-cased), or None.

    The canonical cross-database reference used in ``identity_links[].target``."""
    if not isinstance(ref, str) or "->" not in ref:
        return None
    db, _, rest = ref.partition("->")
    tc = _split2(rest)
    if tc is None:
        return None
    return (db.strip().lower(), tc[0], tc[1])


def _anchor_db(databases: dict[str, dict[str, Any]]) -> str | None:
    """The anchor database slug: the one whose tables physically carry the anchor
    column (its ``cohort_tables`` is non-empty). The anchor column lives only
    there, so at most one database qualifies — if more than one does, the context
    is malformed and we refuse rather than silently scope against whichever
    iterates first (which would bound foreign tables to the wrong anchor)."""
    anchors = [slug for slug, meta in databases.items() if meta.get("cohort_tables")]
    if len(anchors) > 1:
        raise ToolError(
            f"ambiguous run context: more than one database is marked anchor "
            f"(carries cohort_tables): {sorted(anchors)}. Exactly one anchor "
            f"database is expected — cohort scoping cannot proceed safely."
        )
    return anchors[0] if anchors else None


def _key_roots_for(
    owner_db: str,
    anchor_db: str,
    databases: dict[str, dict[str, Any]],
    anchor: str,
) -> list[tuple[str, str, tuple[str, str] | None]]:
    """Safe key roots for ``owner_db`` that can be bounded to the cohort.

    Returns ``[(table, column, via), ...]`` where ``via`` is:

    * ``None`` for a direct anchor-key root (``table.anchor IN (cohort)``), or
    * ``(anchor_bridge_table, anchor_bridge_col)`` for an identity-translated
      root (``table.column IN (SELECT bridge_col FROM anchor_bridge_table WHERE
      anchor IN (cohort))``).

    One mechanism for both anchor and foreign databases:

    1. Build the set of cohort-translatable identity domains from the anchor DB's
       ``identity_links`` whose SOURCE table is cohort-bearing.
    2. Materialize owner roots from that set:
       - foreign owner: target-side keys in that owner DB;
       - anchor owner: anchor tables + identity-peer source columns whose target
         domain is cohort-translatable.

    Fail-safe rules:

    * any target domain with multiple cohort-translatable bridges is ambiguous;
      roots depending on it are omitted (query later rejects),
    * any root with multiple distinct translated bridges is omitted,
    * direct anchor roots take precedence over translated variants.
    """
    anchor_meta = databases.get(anchor_db, {})
    anchor_cohort_tables = {t.lower() for t in anchor_meta.get("cohort_tables") or []}

    # target-domain -> {cohort-translatable anchor bridge source(s)}
    # target-domain is the canonical (db, table, col) from identity_links[].target.
    bridge_sources: dict[tuple[str, str, str], set[tuple[str, str]]] = {}
    for link in anchor_meta.get("identity_links") or []:
        src = _split2(link.get("column", ""))
        tgt = _split_target(link.get("target", ""))
        if src is None or tgt is None:
            continue
        # The translated key set is safe only if the bridge source table carries
        # the anchor (exactly the Tier-1 identity-bridge invariant).
        if src[0] not in anchor_cohort_tables:
            continue
        bridge_sources.setdefault(tgt, set()).add(src)

    # (table, col) -> {None | (anchor_bridge_table, anchor_bridge_col)}
    candidates: dict[tuple[str, str], set[tuple[str, str] | None]] = {}

    def add(table: str, col: str, via: tuple[str, str] | None) -> None:
        candidates.setdefault((table, col), set()).add(via)

    if owner_db == anchor_db:
        for table in anchor_cohort_tables:
            add(table, anchor, None)
        # Anchor-side identity peers: source columns whose target domain is
        # cohort-translatable (e.g. screening_results.patient_ref).
        for link in anchor_meta.get("identity_links") or []:
            src = _split2(link.get("column", ""))
            tgt = _split_target(link.get("target", ""))
            if src is None or tgt is None:
                continue
            # A cohort table is already safely keyed by the anchor itself; adding
            # its peer identity columns as alternate roots would broaden scope
            # from "these cohort rows" to "all rows sharing those peer ids".
            if src[0] in anchor_cohort_tables:
                continue
            via_opts = bridge_sources.get(tgt) or set()
            if len(via_opts) == 1:
                add(src[0], src[1], next(iter(via_opts)))
    else:
        owner = owner_db.lower()
        for tgt, via_opts in bridge_sources.items():
            tgt_db, tgt_table, tgt_col = tgt
            if tgt_db != owner or len(via_opts) != 1:
                continue
            add(tgt_table, tgt_col, next(iter(via_opts)))

    out: list[tuple[str, str, tuple[str, str] | None]] = []
    for (table, col), via_opts in sorted(candidates.items()):
        if None in via_opts:
            out.append((table, col, None))
            continue
        if len(via_opts) == 1:
            out.append((table, col, next(iter(via_opts))))
    return out


def _scope_adjacency(
    foreign_keys: list[dict[str, Any]],
) -> dict[str, list[tuple[str, str, str]]]:
    """Directed adjacency the cohort-scoping ``EXISTS`` walks: ``table -> [(col_here,
    other_table, col_there), …]``.

    A foreign key is stored child-side — ``column`` is the FK column (on the child
    table) and ``target`` is the referenced key (on the parent). The agent's scope
    correlates the LEAF (queried) table's row back to the outer row
    (:func:`_exists_over_path`), so a path is safe iff, walked from the queried
    table UP to the cohort-keyed table, every hop follows a foreign key
    (child -> parent, i.e. many-to-one) — that ascent is deterministic and never
    fans the queried row out. In the DFS direction (cohort-keyed table down to the
    queried table) that is the reverse, parent -> child. Therefore:

      * ``to-one`` (1:1) edges — both directions (either way is 1:1).
      * ``to-many`` edges (the ordinary many-children -> one-parent FK) —
        parent -> child only, so the DFS can DESCEND from a cohort-keyed root into
        its descendant tables (``clinic_visits`` -> ``measurements``). The reverse
        (child -> parent walked as the correlated leaf) would over-include, so it
        is omitted.

    This is the DELIBERATE divergence from Tier 1 (see the Tier-1/Tier-3 note above
    ``_split2``): Tier 1 COPIES along the path so it must stay to-one only; the
    agent only FILTERS rows via the EXISTS, so a to-many descent is safe. The
    opencode tools run in a sandbox that cannot import ``core.mapping``, so this is
    a separate implementation on purpose — do NOT collapse it back into
    build_populate_spec's to-one-only pair."""
    adj: dict[str, list[tuple[str, str, str]]] = {}
    for e in foreign_keys or []:
        card = e.get("cardinality")
        if card not in ("to-one", "to-many"):
            continue
        child = _split2(e.get("column", ""))  # FK column lives on the child
        parent = _split2(e.get("target", ""))  # references the parent's key
        if child is None or parent is None or child[0] == parent[0]:
            continue
        # parent -> child: the descent the EXISTS needs to reach a leaf it then
        # correlates back to the outer row — safe for to-one AND to-many.
        adj.setdefault(parent[0], []).append((parent[1], child[0], child[1]))
        # child -> parent: ascent by following the FK. Only a 1:1 edge is safe to
        # also walk this way; a many-to-one edge walked here as the leaf would
        # over-include, so to-many edges contribute the descent direction only.
        if card == "to-one":
            adj.setdefault(child[0], []).append((child[1], parent[0], parent[1]))
    return adj


_FK_HOP_CAP = 4

# Internal alias prefix for the tool-injected EXISTS hops. It MUST NOT be able to
# collide with a table alias the agent chose: the EXISTS correlates the leaf hop
# back to the OUTER table by the outer table's (agent-chosen) alias, so if the
# agent could name its outer table the same as an inner hop (`h1`), the inner hop
# would shadow it and the correlation would collapse to a tautology — leaking the
# whole foreign table outside the cohort. We use this reserved prefix for the hop
# aliases AND reject any agent query whose table alias/name uses it.
_SCOPE_ALIAS_PREFIX = "__scope_h"


def _scope_path(
    table: str,
    key_table: str,
    foreign_keys: list[dict[str, Any]],
) -> list[dict[str, str]] | None:
    """The FK hops from ``key_table`` (cohort-keyed) down to ``table``, or None when
    unreachable or AMBIGUOUS (≥2 distinct shortest joins). ``[]`` when they are the
    same table. A hop is ``{from_table, from_col, to_table, to_col}``. Edges come
    from :func:`_scope_adjacency` (to-one both ways, to-many parent->child); the
    path is consumed by :func:`_exists_over_path`, whose leaf correlation is what
    keeps a to-many descent from over-including. An ambiguous reach is treated as
    no reach (fail-safe) — a guessed join could mix rows."""
    if table == key_table:
        return []
    adj = _scope_adjacency(foreign_keys)
    paths: list[list[dict[str, str]]] = []

    def dfs(node: str, visited: set[str], hops: list[dict[str, str]]) -> None:
        if len(hops) >= _FK_HOP_CAP:
            return
        for col_here, nxt, col_there in adj.get(node, []):
            if nxt in visited:
                continue
            hop = {
                "from_table": node,
                "from_col": col_here,
                "to_table": nxt,
                "to_col": col_there,
            }
            if nxt == table:
                paths.append(hops + [hop])
            else:
                dfs(nxt, visited | {nxt}, hops + [hop])

    dfs(key_table, {key_table}, [])
    if not paths:
        return None
    shortest = min(len(p) for p in paths)
    distinct: dict[tuple, list[dict[str, str]]] = {}
    for p in paths:
        if len(p) == shortest:
            canon = tuple(
                (h["from_table"], h["to_table"], h["from_col"], h["to_col"]) for h in p
            )
            distinct[canon] = p
    if len(distinct) != 1:  # >1 = ambiguous; 0 impossible at this length
        return None
    return next(iter(distinct.values()))


def _lit_list(cohort: list[Any]) -> str:
    return ", ".join("'" + str(v).replace("'", "''") + "'" for v in cohort)


def _qid(name: str) -> str:
    """Quote a SQL identifier, doubling any embedded ``"`` (consistent with the
    ATTACH in _sql_runtime). Names come from the trusted run context today, so a
    ``"`` is not agent-reachable — this just keeps the generated SQL well-formed
    rather than crashing parse() on a pathological name."""
    return '"' + name.replace('"', '""') + '"'


def _qual(db: str, target_db: str, table: str) -> str:
    """``"table"`` when ``db`` is the connection's ``main`` schema (the named
    target DB), else ``"db"."table"`` — the attached schema reached by slug. So a
    predicate joining the target's own tables stays unqualified while a reach into
    another bound database is addressed explicitly."""
    return _qid(table) if db == target_db else f"{_qid(db)}.{_qid(table)}"


def _cohort_subquery_sql(
    anchor_db: str,
    target_db: str,
    bridge_table: str,
    bridge_col: str,
    anchor: str,
    cohort: list[Any],
) -> str:
    """``SELECT <bridge_col> FROM <anchor.bridge_table> WHERE <anchor> IN
    (cohort)`` — the cohort translated into a foreign DB's bridge-key set, read
    from the anchor database (``main`` if it is the target, else the attached
    slug). An empty cohort yields ``WHERE 0`` so the IN matches nothing."""
    table = _qual(anchor_db, target_db, bridge_table)
    if not cohort:
        return f"SELECT {_qid(bridge_col)} FROM {table} WHERE 0"
    return f"SELECT {_qid(bridge_col)} FROM {table} WHERE {_qid(anchor)} IN ({_lit_list(cohort)})"


def _bound_key_sql(
    key_ref: str,
    target_db: str,
    anchor: str,
    cohort: list[Any],
    anchor_db: str,
    via: tuple[str, str] | None,
) -> str:
    """A SQL boolean expression bounding ``key_ref`` (a ``<qualifier>.<col>``
    string) to the cohort. A direct anchor key root uses ``IN (cohort)``;
    an identity-translated root uses ``IN (<translated key set>)``."""
    if via is None:
        if not cohort:
            return "0"  # empty cohort matches nothing, never everything
        return f"{key_ref} IN ({_lit_list(cohort)})"
    abt, abc = via
    return (
        f"{key_ref} IN "
        f"({_cohort_subquery_sql(anchor_db, target_db, abt, abc, anchor, cohort)})"
    )


def _scope_predicate(
    alias: str,
    table: str,
    owner_db: str,
    target_db: str,
    anchor: str,
    cohort: list[Any],
    databases: dict[str, dict[str, Any]],
    anchor_db: str,
) -> exp.Expression | None:
    """The cohort-bounding predicate for one top-level table, or None if the table
    cannot be safely bounded (→ the caller rejects).

    ``owner_db`` is the database the table physically lives in (its schema
    qualifier, or the named target DB when unqualified); ``target_db`` is the
    connection's ``main`` schema. The safe key roots come from
    :func:`_key_roots_for` (single mechanism for anchor + foreign owners):
      1. direct key-bearing root table → bound its own key column.
      2. table reaches a key root via an FK path in its OWN database →
         ``EXISTS (SELECT 1 FROM <its joins> WHERE <root key bound to cohort>
         AND <leaf>.<col> = <alias>.<col>)``. The path may DESCEND a to-many FK
         (e.g. ``clinic_visits`` → ``measurements``): the leaf correlation bounds
         each queried row to its own ancestor chain, so the to-many fan-out stays
         inside the EXISTS. (Tier 1 cannot do this — see the module note.)

    When multiple DISTINCT safe strategies exist, the table is bounded by the
    intersection (AND) of all of them — no single strategy is guessed.
    """
    foreign_keys = databases.get(owner_db, {}).get("foreign_keys") or []

    key_roots = _key_roots_for(owner_db, anchor_db, databases, anchor)
    if not key_roots:
        return None

    # All safe ways this table can be scoped. If there is more than one distinct
    # strategy, we apply the intersection (AND) of every strategy.
    strategies: dict[
        tuple[Any, ...],
        tuple[str, str, str, tuple[str, str] | None, list[dict[str, str]] | None],
    ] = {}

    # (1) This table IS a key-bearing root.
    for key_table, key_col, via in key_roots:
        if table == key_table:
            sig = ("direct", key_table, key_col, via)
            strategies.setdefault(sig, ("direct", key_table, key_col, via, None))
            continue

    # (2) Reachable from a key root over a unique FK path.
    for key_table, key_col, via in key_roots:
        hops = _scope_path(table, key_table, foreign_keys)
        if not hops:  # None = unreachable/ambiguous path, [] handled by direct roots.
            continue
        hop_sig = tuple(
            (h["from_table"], h["from_col"], h["to_table"], h["to_col"]) for h in hops
        )
        sig = ("path", key_table, key_col, via, hop_sig)
        strategies.setdefault(sig, ("path", key_table, key_col, via, hops))

    if not strategies:
        return None

    predicates: list[exp.Expression] = []
    for mode, key_table, key_col, via, hops in strategies.values():
        if mode == "direct":
            bound = _bound_key_sql(
                f"{_qid(alias)}.{_qid(key_col)}",
                target_db,
                anchor,
                cohort,
                anchor_db,
                via,
            )
            predicates.append(parse(f"SELECT 1 WHERE {bound}").find(exp.Where).this)
            continue
        assert hops is not None
        predicates.append(
            _exists_over_path(
                alias,
                table,
                owner_db,
                target_db,
                key_table,
                key_col,
                hops,
                anchor,
                cohort,
                anchor_db,
                via,
            )
        )

    pred = predicates[0]
    for extra in predicates[1:]:
        pred = exp.and_(pred, extra)
    return pred


def _exists_over_path(
    outer_alias: str,
    table: str,
    owner_db: str,
    target_db: str,
    key_table: str,
    key_col: str,
    hops: list[dict[str, str]],
    anchor: str,
    cohort: list[Any],
    anchor_db: str,
    via: tuple[str, str] | None,
) -> exp.Expression:
    """``EXISTS (SELECT 1 FROM <key_table> h0 JOIN … <table> hN … WHERE <h0.key
    bound to cohort> AND hN.<join_col> = <outer_alias>.<join_col>)``.

    Bounds ``table`` to the cohort through its FK chain to a key-bearing table,
    correlating the leaf back to the OUTER occurrence so only the outer table's
    matching rows survive (not a blanket "some cohort row exists"). The FK chain
    is wholly within the table's OWN database, so its tables are
    qualified by that database's schema (``main`` when it is the target, else the
    attached slug)."""
    qt = lambda t: _qual(owner_db, target_db, t)  # noqa: E731
    # Reserved hop aliases (`__scope_h0`, `__scope_h1`, …) that the agent's outer
    # alias provably cannot equal (inject_cohort rejects any agent table whose
    # alias/name uses this prefix), so the correlation below can never bind to an
    # inner hop instead of the outer occurrence.
    h = lambda i: f"{_SCOPE_ALIAS_PREFIX}{i}"  # noqa: E731
    alias_of = {key_table: h(0)}
    from_parts = [f"{qt(key_table)} {h(0)}"]
    for i, hop in enumerate(hops, start=1):
        a = h(i)
        alias_of[hop["to_table"]] = a
        from_parts.append(
            f"JOIN {qt(hop['to_table'])} {a} ON "
            f"{_qid(alias_of[hop['from_table']])}.{_qid(hop['from_col'])} = "
            f"{_qid(a)}.{_qid(hop['to_col'])}"
        )
    bound = _bound_key_sql(
        f"{_qid(h(0))}.{_qid(key_col)}",
        target_db,
        anchor,
        cohort,
        anchor_db,
        via,
    )
    # The hop landing on the target table names the column that joins it back to
    # the chain; correlate THAT column to the outer occurrence (by its agent-chosen
    # alias — safe because that alias cannot collide with the reserved hop aliases).
    leaf_alias = alias_of[table]
    leaf_join_col = hops[-1]["to_col"]
    sql = (
        f"EXISTS (SELECT 1 FROM {' '.join(from_parts)} "
        f"WHERE {bound} AND {_qid(leaf_alias)}.{_qid(leaf_join_col)} = "
        f"{_qid(outer_alias)}.{_qid(leaf_join_col)})"
    )
    return parse(f"SELECT 1 WHERE {sql}").find(exp.Where).this


def inject_cohort(
    tree: exp.Expression,
    anchor: str,
    cohort: list[Any],
    databases: dict[str, dict[str, Any]],
    target_db: str,
) -> exp.Expression:
    """Bound every top-level table in the query to the cohort, then return the AST.

    Each table is bounded by the safe predicate :func:`_scope_predicate` derives
    from the navigation map — directly (carries the anchor / a bridge key) or via
    a safe FK path (to-one either way, plus parent→child to-many descent) via
    EXISTS. A table with NO safe path makes the whole query rejected (fail-safe):
    an unscoped query must never reach the clinical data."""
    anchor_db = _anchor_db(databases)
    if anchor_db is None:
        raise ToolError(
            "cohort scoping cannot be applied: no anchor database is configured "
            "for this run (no database carries the cohort identity)."
        )
    tables = top_level_tables(tree)
    cohort_tables = sorted(databases.get(target_db, {}).get("cohort_tables") or [])
    if not tables:
        hint = (
            f" The cohort-bearing tables in this database are: {cohort_tables}."
            if cohort_tables
            else ""
        )
        raise ToolError(
            f"cohort scoping cannot be applied: the query reads no table. Read from a "
            f"table bounded to the audited cohort (the tool adds the cohort filter).{hint}"
        )
    # Resolve a (possibly differently-cased) database reference to the canonical
    # slug key the connection ATTACHed under — `_qual` must emit that exact name.
    by_lower = {slug.lower(): slug for slug in databases}
    for table in tables:
        name = table.name.lower()
        alias = table.alias_or_name
        # The tool's injected EXISTS uses reserved hop aliases (`__scope_h*`); an
        # agent table aliased/named into that space could shadow a hop and defeat
        # the cohort correlation, so refuse it outright.
        if alias.lower().startswith(_SCOPE_ALIAS_PREFIX) or name.startswith(
            _SCOPE_ALIAS_PREFIX
        ):
            raise ToolError(
                f"table alias/name {alias!r} uses the reserved prefix "
                f"{_SCOPE_ALIAS_PREFIX!r}; rename it (the tool reserves that prefix "
                f"for the cohort-scoping it injects)."
            )
        # A table may be schema-qualified (`"<slug>".<table>`) to reach an attached
        # database in a cross-DB join; scope it against the database it lives in.
        # An unqualified table is the named target DB (the connection's `main`).
        ref = table.db or target_db
        owner_db = by_lower.get(ref.lower())
        if owner_db is None:
            raise ToolError(
                f"unknown database {ref!r} in the reference to {table.name!r}. "
                f"The databases you can read are: {sorted(databases)}. Qualify a "
                f'cross-database table as "<database>".<table>.'
            )
        pred = _scope_predicate(
            alias,
            name,
            owner_db,
            target_db,
            anchor,
            cohort,
            databases,
            anchor_db,
        )
        if pred is None:
            owner_cohort = sorted(
                databases.get(owner_db, {}).get("cohort_tables") or []
            )
            cohort_hint = (
                f" The cohort-bearing tables in {owner_db!r} are: {owner_cohort}."
                if owner_cohort
                else ""
            )
            raise ToolError(
                f"cohort scoping cannot be applied to table {table.name!r}: it does "
                f"not carry the cohort identity and is not safely reachable from a "
                f"cohort-scoped table over a safe foreign-key path in database "
                f"{owner_db!r} (or the safe scoping path is ambiguous). The tool "
                f"will only run a query whose every table is "
                f'bounded to the audited cohort. Use join_paths_execute({{"database": '
                f'{owner_db!r}, "table": "<a cohort-bearing table>"}}) to see the '
                f"foreign_keys/identity_links you can join through, and read from a "
                f"table the map can reach.{cohort_hint}"
            )
        tree = tree.where(pred, append=True)
    return tree


def inject_run(tree: exp.Expression, run_id: str) -> exp.Expression:
    """AND ``run_id = <this run>`` into a cells SELECT/UPDATE."""
    cond = exp.column("run_id").eq(exp.Literal.string(run_id))
    return tree.where(cond, append=True)


def _has_eq_literal(tree: exp.Expression, column: str, value: Any) -> bool:
    """Does the query already constrain ``<column> = '<value>'`` anywhere (any
    alias)? Used so scoping never doubles a predicate the agent already wrote."""
    want = str(value)
    for eq in tree.find_all(exp.EQ):
        sides = (eq.this, eq.expression)
        col = next((s for s in sides if isinstance(s, exp.Column)), None)
        lit = next((s for s in sides if isinstance(s, exp.Literal)), None)
        if (
            col is not None
            and lit is not None
            and col.name.lower() == column.lower()
            and lit.this == want
        ):
            return True
    return False


def inject_identity(
    tree: exp.Expression, anchor: str, member: Any, cohort_tables: set[str]
) -> exp.Expression:
    """AND ``<alias>.<anchor> = '<member>'`` onto each cohort-bearing top-level
    table, pinning the query to ONE cohort member. Lenient (unlike
    :func:`inject_cohort`): if the query already pins this member, or touches no
    cohort-bearing table, it is left untouched — a stored source is not a
    safety-critical read, so we narrow it when we can and otherwise leave it be."""
    if not anchor or member is None or _has_eq_literal(tree, anchor, member):
        return tree
    lowered = {t.lower() for t in cohort_tables}
    for table in top_level_tables(tree):
        if table.name.lower() in lowered:
            col = exp.column(anchor, table=table.alias_or_name)
            tree = tree.where(col.eq(exp.Literal.string(str(member))), append=True)
    return tree


def scope_source_to_cell(
    query: str,
    *,
    anchor: str,
    member: Any,
    cohort_tables: set[str],
    row_key: str | None = None,
    row_id: Any | None = None,
) -> str:
    """Narrow a stored source query to ONE cell: AND the member identity onto its
    cohort-bearing table, and (for a note source) AND ``<row_key> = '<row_id>'`` so
    only the single cited row is returned. Synthesize, never override: a predicate
    the agent already wrote is kept as-is (no doubled WHERE). Any query we can't
    safely rewrite (non-SELECT, nested, unparseable) is returned verbatim."""
    try:
        tree = parse(query)
    except ToolError:
        return query
    if not is_select(tree) or any(
        node is not tree for node in tree.find_all(exp.Select)
    ):
        return query
    before = render(tree)
    tree = inject_identity(tree, anchor, member, set(cohort_tables or []))
    if row_key and row_id is not None and not _has_eq_literal(tree, row_key, row_id):
        col = exp.column(row_key)
        tree = tree.where(col.eq(exp.Literal.string(str(row_id))), append=True)
    after = render(tree)
    return after if after != before else query


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
