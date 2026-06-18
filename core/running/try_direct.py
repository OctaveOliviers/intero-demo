"""Tier 1 — ``try_direct``: the deterministic per-cell fill (A3).

The bottom rung of the resolution ladder. Reads the executable's **direct**
regions off the run-store, runs each region's cohort-scoped query **once** via
the shared read-only primitive (``core/running/sql.run_readonly_sql``), joins the
per-database results in Python on the identity keys, and for each
``(cohort member × cell_map entry)`` **UPDATEs the pending cell in place** via
``run_store.update`` — it returns nothing. Tiers communicate through the store,
never by passing cells along.

The mechanic per cell is dumb and audited — **data in, the stored cell
mutated, no generated or user-edited code ever executed**:

  * a clean hit → ``filled``, ``resolved_by: direct``, exactly one no-error
    ``attempt`` carrying the **narrowed** single-column query
    (``SELECT <col> FROM <table> WHERE <identity>=<id>``) and the
    ``table_column`` it read — so Tier 2 reads the provenance straight off the
    attempt, never by re-parsing the SQL;
  * ``NULL`` or a value **not in the executable's Tier-1 code_map** → the cell
    is left ``pending`` (NOT blocked) with the failed query + ``table_column``
    + (for an unknown code) the offending ``value`` + ``error`` on
    ``attempts[0]``, for Tier 2 (``try_llm``) to pick up — ``try_direct`` never
    calls an LLM;
  * an identity that is missing / ambiguous across databases → terminal
    ``blocked`` + ``IDENTITY_UNRESOLVED``; mismatched identities are **never**
    combined.

**Principle.** The ``code_map`` here is the ONLY place the precompiled
DB→audit translation is applied (the executable's Tier-1 plan). Higher tiers
return final values that are never re-translated. The off-code DB guard
(``field_codes``) enforces ``spec.json``'s **canonical** code set at write
time — for every writer, including raw SQL — which is a different concern
from the executable's translation.
"""

from __future__ import annotations

import asyncio
import re
import sqlite3
from typing import Any

from core.mapping.build_populate_spec import validate_populate_spec
from core.running.cell_ref import DEFAULT_FIRST_DATA_ROW, member_id, render_a1
from core.running.provenance import Source, make_attempt
from core.running.sql import SqlError, run_readonly_sql

# Sentinel for an anchor identity that maps to SEVERAL keys of a foreign database
# via the identity bridge — such a cell is blocked, identities are never mixed.
_AMBIGUOUS = object()

# Every table a query reads — FROM plus each JOIN — so a failed multi-hop query
# is attributed to ALL its tables (incl. the leaf the cell_map names), not just
# the first table after FROM (the bridge key table).
_QUERY_TABLES = re.compile(r"\b(?:FROM|JOIN)\s+(\w+)", re.IGNORECASE)


class TryDirectError(Exception):
    """The executable is invalid — never raised for missing source data (that yields
    a non-clean or blocked cell, not an error)."""


async def try_direct(run_store) -> None:
    """Run Tier 1 over ``run_store.executable``, UPDATEing every direct cell in place.

    Reads the executable / cohort / database_paths off ``run_store``; never holds
    cell state of its own. Only **direct** regions are resolved here — interpret
    regions stay ``pending`` for higher tiers. Raises :class:`TryDirectError` only
    on an invalid executable.
    """
    executable = run_store.executable
    errors = validate_populate_spec(executable)
    if errors:
        raise TryDirectError("executable is invalid: " + "; ".join(errors))
    await run_store.activity("Auto-fill is reading values from the database.")

    identity_keys: list[str] = executable["identity_keys"]
    code_sets: dict[str, dict[str, str]] = executable.get("code_sets", {})
    first_data_row = int(executable.get("first_data_row", DEFAULT_FIRST_DATA_ROW))
    bridges = {b["database"]: b for b in executable.get("identity_bridges") or []}
    if bridges and len(identity_keys) != 1:
        raise TryDirectError(
            "identity bridges require a single-key anchor identity "
            f"(identity_keys is {identity_keys!r})"
        )

    for region in executable["regions"]:
        if region.get("kind", "direct") == "direct":
            await _resolve_direct_region(
                run_store, region, identity_keys, code_sets, first_data_row,
                bridges, executable["cohort"]["database"],
            )


async def _resolve_direct_region(
    run_store,
    region: dict[str, Any],
    identity_keys: list[str],
    code_sets: dict[str, dict[str, str]],
    first_data_row: int,
    bridges: dict[str, dict[str, Any]] | None = None,
    cohort_db: str | None = None,
) -> None:
    sheet = region["sheet"]
    cohort = list(run_store.cohort)
    open_refs = {
        cell.ref
        for cell in run_store.open_cells()
        if cell.ref.partition("!")[0] == sheet
    }
    if not open_refs:
        return
    member_rows = getattr(run_store, "member_rows", None)
    bridges = bridges or {}

    # Run each source query once (max coverage), index its rows by identity tuple.
    # A foreign-database query (one carrying `key_column`) is keyed by ITS database's
    # identity column: the cohort's anchor identities are first translated into that
    # key set via the identity bridge (A3), and the results join back through the
    # same translation — cross-database SQL never runs.
    per_db: list[dict[str, Any]] = []
    bridge_maps: dict[str, dict[Any, Any]] = {}
    for q in region["queries"]:
        db = q["database"]
        db_path = run_store.database_paths.get(db)
        if db_path is None:
            raise TryDirectError(f"no database path supplied for {db!r}")
        key_column = q.get("key_column")
        bridge = bridges.get(db)
        if key_column and bridge is None:
            raise TryDirectError(
                f"query for {db!r} is keyed by {key_column!r} but the executable "
                f"carries no identity bridge for that database"
            )
        src: dict[str, Any] = {
            "database": db, "sql": q["sql"], "by_identity": {}, "columns": set(),
            "key_columns": [key_column] if key_column else identity_keys,
            "translate": None, "error": None,
        }
        try:
            if key_column:
                if db not in bridge_maps:
                    bridge_maps[db] = await _bridge_map(run_store, bridge, cohort, cohort_db)
                src["translate"] = bridge_maps[db]
                bind = sorted(
                    {v for v in src["translate"].values() if v is not _AMBIGUOUS},
                    key=str,
                )
                rows = await asyncio.to_thread(
                    run_readonly_sql, db_path, q["sql"], {"cohort": bind}
                )
            else:
                rows = await asyncio.to_thread(
                    run_readonly_sql, db_path, q["sql"], {"cohort": cohort}
                )
        except (SqlError, sqlite3.Error) as exc:
            # One failing query degrades to per-cell escalation (its cells stay
            # pending with the error on attempts[0]) — it never kills the run.
            src["error"] = f"{type(exc).__name__}: {exc}"
            per_db.append(src)
            continue
        for row in rows:
            ident = _identity(row, src["key_columns"])
            if ident is not None:
                src["by_identity"].setdefault(ident, []).append(row)
        src["columns"] = set(rows[0]) if rows else set()
        per_db.append(src)

    # The table each FAILED query reads (best effort, the compiled SQL shape is
    # `... FROM <table> <alias> ...`) — its cells get the real error, not a
    # misleading "column not found".
    failed_tables: dict[str, dict[str, Any]] = {}
    for src in per_db:
        if src["error"] is not None:
            for tbl in _QUERY_TABLES.findall(src["sql"]):
                failed_tables.setdefault(tbl.lower(), src)

    successful = [s for s in per_db if s["error"] is None]
    anchor_srcs = [s for s in successful if s["translate"] is None]
    # The primary source decides whether a cohort member exists at all — prefer a
    # source keyed by the anchor identity itself.
    primary = anchor_srcs[0] if anchor_srcs else (successful[0] if successful else None)
    # Which database returned each mapped column (the primary wins on a tie).
    column_db: dict[str, dict[str, Any]] = {}
    for src in successful:
        for col in src["columns"]:
            column_db.setdefault(col, src)

    for index, member in enumerate(cohort):
        ident = _cohort_identity(member, identity_keys)
        mid = member_id(member)
        if member_rows is not None:
            if mid not in member_rows:
                raise TryDirectError(
                    f"missing row mapping for active member {mid!r} in refresh execution"
                )
            row_number = first_data_row + int(member_rows[mid])
        else:
            row_number = first_data_row + index

        primary_row: dict[str, Any] | None = None
        primary_ident: tuple[Any, ...] | None = None
        primary_blocked: str | None = None
        if primary is not None:
            primary_row, primary_ident, primary_blocked = _lookup(primary, ident, mid)

        for entry in region["cell_map"]:
            column = entry["column"].lower()
            table = entry["table"]
            field = entry["field"]
            ref = f"{sheet}!{render_a1(entry['cell_template'], row_number)}"
            if ref not in open_refs:
                continue

            failed_src = failed_tables.get(table.lower())
            if failed_src is not None:
                # The query reading this table failed — leave the cell pending with
                # the real error so Tier 2 escalates with honest provenance.
                await run_store.update(ref, attempts=[make_attempt(
                    "direct", failed_src["database"], sql=failed_src["sql"],
                    table_column=f"{table}.{column}",
                    error=f"source query failed: {failed_src['error']}")])
                continue

            if primary_blocked is not None:
                await run_store.update(ref, **_blocked_fields(
                    primary_blocked, primary["sql"], primary["database"]))
                continue

            if column not in column_db:
                # No query returned this column — secondary may be empty for this cohort,
                # or the executable references a column that doesn't exist in any DB.
                # Leave pending (not blocked) so Tier 2 can escalate, but surface a
                # clear error rather than the misleading "is NULL" that a silent primary
                # fallback would produce.
                await run_store.update(ref, attempts=[make_attempt(
                    "direct", primary["database"] if primary else "unknown",
                    table_column=f"{table}.{column}",
                    error=f"{table}.{column} not found in any query result "
                          f"(secondary DB may be empty for this cohort)")])
                continue

            src = column_db[column]
            if src is primary:
                source_row, src_ident, secondary_blocked = primary_row, primary_ident, None
            else:
                source_row, src_ident, secondary_blocked = _lookup(src, ident, mid)
            if secondary_blocked is not None:
                await run_store.update(ref, **_blocked_fields(
                    secondary_blocked, src["sql"], src["database"]))
                continue

            assert source_row is not None and src_ident is not None
            raw = source_row.get(column)
            code_map = (code_sets.get(entry["translate"])
                        if entry.get("translate") else None)
            via = entry.get("via")
            narrowed = _narrowed_sql(table, column, src["key_columns"], src_ident, via)
            table_column = f"{table}.{column}"

            if raw is None:
                await run_store.update(ref, attempts=[make_attempt(
                    "direct", src["database"], sql=narrowed,
                    table_column=table_column,
                    error=f"{table}.{column} is NULL for {mid}")])
            elif code_map is not None and str(raw) not in code_map:
                await run_store.update(ref, attempts=[make_attempt(
                    "direct", src["database"], sql=narrowed,
                    table_column=table_column, value=str(raw),
                    error=f"value {str(raw)!r} not in the code map for field "
                          f"{field!r}")])
            else:
                value = code_map[str(raw)] if code_map is not None else str(raw)
                source = Source(
                    database=src["database"],
                    query=_source_sql(table, column, src["key_columns"], src_ident, via),
                    table_column=table_column,
                ).as_dict()
                await run_store.update(
                    ref, state="filled", value=value, confidence="high",
                    resolved_by="direct",
                    attempts=[make_attempt("direct", src["database"], sql=narrowed,
                                           table_column=table_column, result=value)],
                    explanation=f"Copied directly from {table_column} for {mid}.",
                    sources=[source],
                )


async def _bridge_map(
    run_store, bridge: dict[str, Any], cohort: list[Any], cohort_db: str | None
) -> dict[Any, Any]:
    """Resolve the identity bridge once per region: anchor identity → the foreign
    database's key value, read from the bridge's `via` table in the COHORT database
    (read-only). An anchor mapping to several distinct keys becomes ``_AMBIGUOUS``
    so its cells block rather than mix identities."""
    if cohort_db is None:
        raise TryDirectError("identity bridge requires the cohort database")
    db_path = run_store.database_paths.get(cohort_db)
    if db_path is None:
        raise TryDirectError(f"no database path supplied for {cohort_db!r}")
    via = bridge["via"]
    sql = (
        f"SELECT {via['anchor_column']}, {via['bridge_column']} "
        f"FROM {via['table']} WHERE {via['anchor_column']} IN (:cohort)"
    )
    rows = await asyncio.to_thread(run_readonly_sql, db_path, sql, {"cohort": cohort})
    out: dict[Any, Any] = {}
    anchor_col = via["anchor_column"].lower()
    bridge_col = via["bridge_column"].lower()
    for row in rows:
        a, k = row.get(anchor_col), row.get(bridge_col)
        if a is None or k is None or (isinstance(k, str) and not k.strip()):
            continue
        if a in out and out[a] != k:
            out[a] = _AMBIGUOUS
        else:
            out.setdefault(a, k)
    return out


def _lookup(
    src: dict[str, Any], ident: tuple[Any, ...], mid: str
) -> tuple[dict[str, Any] | None, tuple[Any, ...] | None, str | None]:
    """The source's single row for a cohort member: ``(row, source_identity, None)``
    on a clean hit, ``(None, _, detail)`` when the identity is missing or ambiguous
    (→ ``IDENTITY_UNRESOLVED``). A bridged source first translates the anchor
    identity into its own key via the resolved bridge map — rows whose identities
    do not match are never combined."""
    translate = src["translate"]
    if translate is None:
        src_ident = ident
    else:
        key = translate.get(ident[0])
        if key is _AMBIGUOUS:
            return None, None, (
                f"identity {mid!r} maps to several keys of database "
                f"{src['database']!r} via the identity bridge; rows whose identities "
                f"do not match are never combined."
            )
        if key is None:
            return None, None, (
                f"identity {mid!r} has no key mapping for database "
                f"{src['database']!r} via the identity bridge; rows whose identities "
                f"do not match are never combined."
            )
        src_ident = (key,)
    matches = src["by_identity"].get(src_ident, [])
    if len(matches) != 1:
        return None, src_ident, (
            f"identity {mid!r} "
            + ("not found in" if not matches else "ambiguous in")
            + f" database {src['database']!r}; rows whose identities do not match are "
            f"never combined."
        )
    return matches[0], src_ident, None


def _blocked_fields(detail: str, failed_sql: str, database: str) -> dict[str, Any]:
    """The in-place UPDATE fields for an ``IDENTITY_UNRESOLVED`` cell — the value
    cannot be safely placed, so the cell is terminal ``blocked``."""
    return dict(
        state="blocked", confidence="high", resolved_by="direct",
        attempts=[make_attempt("direct", database, sql=failed_sql, error=detail)],
        reason_code="IDENTITY_UNRESOLVED", reason_detail=detail,
        owner_needed="data team",
    )


def _identity(row: dict[str, Any], keys: list[str]) -> tuple[Any, ...] | None:
    """The identity tuple of a row, or None if any key is missing/blank — such a
    row cannot be safely joined."""
    values = []
    for k in keys:
        v = row.get(k.lower())
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        values.append(v)
    return tuple(values)


def _cohort_identity(member: Any, identity_keys: list[str]) -> tuple[Any, ...]:
    """Normalise a cohort entry to the identity tuple a row's
    :func:`_identity` produces. A scalar member (single-key identity) becomes a
    1-tuple; a sequence keeps its order. The arity is checked against
    ``identity_keys`` — a mismatch would silently truncate via ``zip`` in
    ``_where_identity`` and produce an under-constrained narrowed query, so we
    fail loudly instead (never mix patients)."""
    ident = tuple(member) if isinstance(member, (list, tuple)) else (member,)
    if len(ident) != len(identity_keys):
        raise TryDirectError(
            f"cohort member {member!r} has {len(ident)} identity value(s) but the "
            f"executable's identity_keys has {len(identity_keys)} ({identity_keys!r}); "
            f"narrowed SQL would be under-constrained — refusing to run."
        )
    return ident


def _lit(value: Any) -> str:
    """A SQL literal for an identity value, so the narrowed query is runnable as-is."""
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def _where_identity(identity_keys: list[str], ident: tuple[Any, ...]) -> str:
    return " AND ".join(f"{k} = {_lit(v)}" for k, v in zip(identity_keys, ident))


def _via_from(via: list[dict[str, Any]]) -> tuple[str, dict[str, str]]:
    """Build the multi-hop ``FROM <key_table> a0 JOIN … `` clause and the per-table
    aliases. ``via`` is the FK hop chain the compiler attached to the cell_map
    entry: ``[{from_table, from_col, to_table, to_col}, …]`` from the bridge key
    table to the leaf table that actually holds the value."""
    aliases = {via[0]["from_table"]: "a0"}
    parts = [f'{via[0]["from_table"]} a0']
    for i, hop in enumerate(via, start=1):
        a = f"a{i}"
        aliases[hop["to_table"]] = a
        parts.append(
            f'JOIN {hop["to_table"]} {a} ON '
            f'{aliases[hop["from_table"]]}.{hop["from_col"]} = {a}.{hop["to_col"]}'
        )
    return " ".join(parts), aliases


def _narrowed_sql(
    table: str, column: str, identity_keys: list[str], ident: tuple[Any, ...],
    via: list[dict[str, Any]] | None = None,
) -> str:
    """The narrowed per-cell projection recorded on ``attempts[0]`` — focused
    context for an escalated cell (not the wide bulk query that actually ran).
    For a multi-hop direct field the leaf ``table`` does not carry the bridge key,
    so the narrowed query JOINs along ``via`` and keys on the bridge table (a0)."""
    if via:
        frm, aliases = _via_from(via)
        where = _where_identity([f"a0.{k}" for k in identity_keys], ident)
        return f"SELECT {aliases[table]}.{column} FROM {frm} WHERE {where}"
    return f"SELECT {column} FROM {table} WHERE {_where_identity(identity_keys, ident)}"


def _source_sql(
    table: str, column: str, identity_keys: list[str], ident: tuple[Any, ...],
    via: list[dict[str, Any]] | None = None,
) -> str:
    """The provenance query on ``sources[]``: the value shown ALONGSIDE its identity
    so the evidence is self-verifying (never a bare ``SELECT <value>``)."""
    if via:
        frm, aliases = _via_from(via)
        keys = [f"a0.{k}" for k in identity_keys]
        cols = ", ".join(keys + [f"{aliases[table]}.{column}"])
        return f"SELECT {cols} FROM {frm} WHERE {_where_identity(keys, ident)}"
    cols = ", ".join(identity_keys + [column])
    return f"SELECT {cols} FROM {table} WHERE {_where_identity(identity_keys, ident)}"

