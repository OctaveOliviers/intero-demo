"""Table population — prepopulate from the template's executable, then the agent.

A population run works one durable cell store in two steps:

1. **Prepopulate.** When the template carries a precomputed ``executable``
   (mapping.json's plan), its direct regions are copied into the table in one
   deterministic bulk pass: each region's cohort-scoped SQL runs once, the
   per-database results join on identity keys in Python, and every clean hit is
   ``filled`` in place. No LLM is involved. A table without an executable (an
   ad-hoc table) skips this step — every cell stays open for the agent.
2. **Agent.** Every cell still ``pending`` afterwards goes to one table-agent
   session (opencode), which reads and writes the store through its SQL tools.
   Cells the agent cannot place are settled ``blocked`` / ``NOT_LOCATED`` — a
   run never strands pending cells.

The orchestration here owns the store and the sequencing; both steps only
resolve cells, in place, through the one ``TablePopulationContext``. Nothing
about a cell lives outside the store: the open set is re-queried from cell
``state`` between steps. This module is transport-agnostic — HTTP/SSE framing
stays in the route layer.

**Prepopulate principle.** The executable's ``code_map`` is the ONLY place the
precompiled DB→audit translation is applied. The agent returns final values
that are never re-translated. The off-code DB guard (``field_codes``) enforces
``spec.json``'s canonical code set at write time — for every writer, including
the agent's raw SQL — which is a different concern from the executable's
translation.

The mechanic per prepopulated cell is dumb and audited — **data in, the stored
cell mutated, no generated or user-edited code ever executed**:

  * a clean hit → ``filled``, ``resolved_by: prepopulated``, exactly one
    no-error ``attempt`` carrying the **narrowed** single-column query
    (``SELECT <col> FROM <table> WHERE <identity>=<id>``) and the
    ``table_column`` it read — so the agent reads the provenance straight off
    the attempt, never by re-parsing the SQL;
  * ``NULL`` or a value **not in the executable's code_map** → the cell is left
    ``pending`` (NOT blocked) with the failed query + ``table_column`` + (for
    an unknown code) the offending ``value`` + ``error`` on ``attempts[0]``,
    for the agent to pick up;
  * an identity that is missing / ambiguous across databases → terminal
    ``blocked`` + ``IDENTITY_UNRESOLVED``; mismatched identities are **never**
    combined.

**Agent step.** The thin Python edge between the run store and the opencode
agent. It does four concrete things and nothing else:

1. **Provisions the artifact workspace** the agent's tools resolve from:
   ``context.json`` (cohort, anchor, per-DB cohort tables — no paths), the
   databases symlinked by name (``template/cells.sqlite`` → run store,
   ``databases/<slug>.sqlite`` → each clinical DB), and the models
   ``lookup_execute`` reads (``template/spec.json``,
   ``databases/<slug>.model.json``). The agent opens databases by name; it
   never sees a path or an identity.
2. **Builds a MINIMAL prompt**: which databases exist + "run the table-fill
   skill". The how-to lives in the skill — not duplicated here — and the
   skill, not the prompt, owns the fact that a run may bind several databases.
3. **Drives one opencode session** rooted in the artifact workspace
   (``directory=`` the artifact dir, so the tools' working directory is where
   the context lives) —
   create → prompt → wait for idle. The agent works entirely through
   ``sql_execute`` and ``lookup_execute``; every cell write is validated by
   the store's DB triggers, so this module enforces nothing.
4. **Finalises**: any cell still ``pending`` when the session ends is settled
   ``blocked`` / ``NOT_LOCATED`` — the agent searched and could not place it.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import sqlite3
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable
from uuid import uuid4

from core.agent import launcher
from core.agent.worktree import (
    build_context,
    canonical_navigation,
    copy_canonical_model,
    symlink,
)
from core.config import ARTIFACTS_DIR, DATABASES_DIR, DATASETS_DIR, TEMPLATES_DIR
from core.mapping import validate_populate_spec
from core.store import Cell, Event, RunMember, Store
from core.table_population.build_workbook import field_display_names
from core.table_population.cell_ref import (
    DEFAULT_FIRST_DATA_ROW,
    member_id,
    render_a1,
)
from core.table_population.events import (
    build_activity_event,
    build_review_summary_event,
    event_payload,
)
from core.table_population.prepare import (
    assemble_population_context,
    database_from_dataset,
    filters_from_dataset,
)
from core.table_population.provenance import Source, make_attempt
from core.table_population.sql import SqlError, run_readonly_sql
from core.table_population.workbook_stream import sheets_from_cells

# An emit sink for SSE events (cell_update / activity / done); None in unit tests
# that only assert on the persisted store.
Emit = Callable[[dict], None]

logger = logging.getLogger(__name__)

_NOT_LOCATED = "NOT_LOCATED"

# Sentinel for an anchor identity that maps to SEVERAL keys of a foreign database
# via the identity bridge — such a cell is blocked, identities are never mixed.
_AMBIGUOUS = object()

# Every table a query reads — FROM plus each JOIN — so a failed multi-hop query
# is attributed to ALL its tables (incl. the leaf the cell_map names), not just
# the first table after FROM (the bridge key table).
_QUERY_TABLES = re.compile(r"\b(?:FROM|JOIN)\s+(\w+)", re.IGNORECASE)

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TEMPLATE_COL = re.compile(r"\{col:([A-Za-z]+)\}")

# Cohort members are laid out sequentially from the first data row (the row below
# the header). The executable may override via `first_data_row`.


# ===========================================================================
# The pending grid + the cell wire shape
# ===========================================================================


def _cell_state_counts(store: Store, run_id: str) -> dict[str, int]:
    counts = {
        "prepared": 0,
        "filled": 0,
        "pending": 0,
        "blocked": 0,
        "needs_verification": 0,
    }
    for cell in store.get_cells(run_id):
        counts["prepared"] += 1
        if cell.state == "filled":
            counts["filled"] += 1
            # Derived needs-verification view (doc 5 §Cell state model): a
            # filled interpret cell awaiting sign-off — a subset of filled.
            if cell.review_state == "not_reviewed":
                counts["needs_verification"] += 1
        elif cell.state == "pending":
            counts["pending"] += 1
        elif cell.state == "blocked":
            counts["blocked"] += 1
    return counts


def _counts_text(counts: dict[str, int]) -> str:
    return (
        f"prepared {counts['prepared']}, filled {counts['filled']}, "
        f"pending {counts['pending']}, blocked {counts['blocked']}, "
        f"needs verification {counts['needs_verification']}"
    )


def build_pending_table_cells(
    run_id: str,
    executable: dict[str, Any],
    cohort: list[Any],
    *,
    member_rows: dict[str, int] | None = None,
) -> list[Cell]:
    """One ``pending`` cell per (region × cohort member × cell slot).

    sheet/ref/field/member/kind are set; nothing else — the value/state ladder
    is filled in by the two population steps. `ref` is the combined
    ``"<Sheet>!<A1>"`` the store keys on; `kind` is carried from the executable
    (the cell slot's, else the region's). This is the full grid the FE shows
    from the start, before any value lands.
    """
    first_data_row = int(executable.get("first_data_row", DEFAULT_FIRST_DATA_ROW))
    cells: list[Cell] = []
    for region in executable.get("regions") or []:
        sheet = region["sheet"]
        region_kind = region.get("kind", "direct")
        for index, member in enumerate(cohort):
            mid = member_id(member)
            if member_rows is not None and mid in member_rows:
                row = first_data_row + int(member_rows[mid])
            else:
                row = first_data_row + index
            for entry in region["cell_map"]:
                ref = f"{sheet}!{render_a1(entry['cell_template'], row)}"
                cells.append(
                    Cell(
                        run_id=run_id,
                        ref=ref,
                        field=entry["field"],
                        member=mid,
                        kind=entry.get("kind", region_kind),
                        state="pending",
                    )
                )
    return cells


def cell_wire(cell: Cell) -> dict[str, Any]:
    """One cell as the SSE ``cell_update.cells[]`` entry: ``{ref, value?, meta}``.

    `ref` is the A1 within its sheet; the sheet travels on the wrapper. `meta` is
    the per-cell metadata projection (runtime-shapes §2) — only the set fields.

    Public: this is the single source of truth for the cell wire shape. The live
    stream emits it (``TablePopulationContext.update`` / ``rebroadcast``) and the ``/workbook``
    rebuild reuses it (``server/routes/workbook.py``), so a reopened run renders
    identically to one watched live — keep both sides bound through this helper.
    """
    _, _, a1 = cell.ref.partition("!")
    meta = {
        k: v
        for k, v in {
            "field": cell.field,
            "member": cell.member,
            "kind": cell.kind,
            "state": cell.state,
            "confidence": cell.confidence,
            "resolved_by": cell.resolved_by,
            "hypothesis": cell.hypothesis,
            "attempts": cell.attempts,
            "sources": cell.sources,
            # review_state drives the FE's "needs review" count + cell colour: it must
            # match the backend's needs_verification rule (filled interpret cell with
            # review_state == "not_reviewed"), so the top-band chip can't diverge from
            # the review summary. Omitted when None (direct cells never need review).
            "review_state": cell.review_state,
            "explanation": cell.explanation,
            "reason_code": cell.reason_code,
            "reason_detail": cell.reason_detail,
        }.items()
        if v not in (None, [], {})
    }
    wire: dict[str, Any] = {"ref": a1, "meta": meta}
    if cell.value is not None:
        wire["value"] = cell.value
    return wire


# ===========================================================================
# The per-run context handle
# ===========================================================================


class TablePopulationContext:
    """The per-run context handle — the ONE object both population steps work.

    Two halves, glued together because both belong to "this run":

    * **The cell-store binding.** Wraps a multi-run, multi-user :class:`Store`
      (the SQLite holding every run's cells/events; later a hospital-hosted DB)
      and scopes every read/write to this ``run_id``. The :meth:`update` seam
      is the only way in-process code mutates cells: one call that surgically
      UPDATEs in place + appends the durable ``cell_update`` event + streams it
      live, so "persist + stream" can never get out of step.
    * **The run's in-memory context.** ``executable`` (mapping.json's
      prepopulation plan), ``cohort`` (resolved at run start),
      ``database_paths`` (the source clinical SQLite(s) — read-only, distinct
      from the state DB), ``field_spec`` (spec.json, the source the off-code guard
      is armed from), and the agent's scope inputs (``anchor``,
      ``cohort_tables``). Loaded once at run start; each step reads what it
      needs and ignores what it doesn't.

    NB: database models (model.json) are NOT on the context — they are
    per-database canonical artifacts, not run-scoped state. The agent step
    reads them from var/databases/<slug>/model.json on demand
    (:func:`provision_worktree`). Storage-layout §7: schema comes from
    model.json, never live DB introspection.
    """

    def __init__(
        self,
        store: Store,
        run_id: str,
        *,
        executable: dict[str, Any] | None = None,
        cohort: list[Any] | None = None,
        database_paths: dict[str, Path] | None = None,
        field_spec: dict[str, Any] | None = None,
        anchor: str | None = None,
        cohort_tables: dict[str, list[str]] | None = None,
        emit: Emit | None = None,
        execution_id: str | None = None,
        active_member_ids: set[str] | None = None,
        member_rows: dict[str, int] | None = None,
        brief: str | None = None,
    ) -> None:
        self._store = store
        self.run_id = run_id
        self.executable: dict[str, Any] = executable or {}
        self.cohort: list[Any] = cohort or []
        self.database_paths: dict[str, Path] = database_paths or {}
        self.field_spec: dict[str, Any] | None = field_spec
        # The agent reaches the hospital DBs over SQL; the tool injects the
        # cohort filter onto every cohort-bearing table. `anchor` is the cohort
        # identity column (e.g. "patient_code") and `cohort_tables` is per-database
        # the set of tables that carry that anchor. Both come from mapping.json;
        # they ride on the context so the agent step never re-parses the mapping.
        self.anchor: str | None = anchor
        self.cohort_tables: dict[str, list[str]] = cohort_tables or {}
        self.execution_id = execution_id
        self.active_member_ids = active_member_ids
        self.member_rows = member_rows
        # The table's Brief (CONTEXT.md) — the user-intent text the pinned
        # table keeps for life; ``build_prompt`` hands it to the table agent as
        # the delegation instruction. ``None``: no brief was recorded.
        self.brief: str | None = brief
        self._emit = emit
        # Serialises store writes across concurrent writers (the session driver's
        # store poll and activity forwarding interleave on one sqlite3 connection,
        # which has no cross-coroutine safety). `update`/`activity`/`rebroadcast`
        # hold this for their whole write — so even if a future change introduces
        # an `await` mid-write, two coroutines can't interleave on the connection.
        # Read paths (open_cells/cells) don't take it (sqlite handles concurrent
        # reads, and they only ever run between writes here).
        self._write_lock = asyncio.Lock()

    @property
    def state_db_path(self) -> str:
        """The on-disk path of the cell store — the public seam the agent step
        uses to symlink the run store into the agent worktree (no reaching into
        the Store internals)."""
        return self._store.path

    async def update(self, ref: str, **fields: Any) -> Cell:
        """Update one cell in place by ``ref``, then persist + stream the change.

        Async + lock-guarded so concurrent writers can't interleave on the
        shared sqlite connection (see ``_write_lock``)."""
        async with self._write_lock:
            cell = self._store.update_cell(self.run_id, ref, **fields)
            payload = {"sheet": cell.ref.partition("!")[0], "cells": [cell_wire(cell)]}
            self._store.append_event(
                Event(
                    run_id=self.run_id,
                    type="cell_update",
                    payload=payload,
                    execution_id=self.execution_id,
                )
            )
            if self._emit is not None:
                self._emit({"type": "cell_update", **payload})
            return cell

    async def activity(
        self,
        headline: str,
        *,
        label: str | None = None,
        kind: str | None = None,
        id: str | None = None,
    ) -> None:
        """Persist + stream an ``activity`` heartbeat — the public seam for a
        within-step note into the run stream the FE already consumes, without
        reaching into the store/emit internals. Mirrors the orchestration's
        between-step ``_activity``. Holds the same write lock as :meth:`update`.

        ``label`` (folded now-line) and ``kind`` ("step"|"tool"|"thinking") ride
        through to the FE — the agent session uses them to surface tool calls and
        thinking, not just coarse steps. ``id`` lets a streaming element (a tool
        call or reasoning block) UPSERT in place on the FE instead of appending a
        new line per chunk."""
        event = build_activity_event(headline, label=label, kind=kind, id=id)
        async with self._write_lock:
            self._store.append_event(
                Event(
                    run_id=self.run_id,
                    type="activity",
                    payload=event_payload(event),
                    execution_id=self.execution_id,
                )
            )
            if self._emit is not None:
                self._emit(event)

    async def rebroadcast(self, cells: list[Cell]) -> None:
        """Persist + stream ``cell_update`` events for cells changed OUTSIDE
        this process. The agent writes the store's SQLite directly through
        its SQL tool, so :meth:`update` (the in-process persist+stream seam)
        never runs for those writes; the session driver polls the store and
        rebroadcasts the changes so the FE fills live. One event per sheet per
        batch — the agent's grouped writes arrive grouped."""
        by_sheet: dict[str, list[Cell]] = {}
        for cell in cells:
            by_sheet.setdefault(cell.ref.partition("!")[0], []).append(cell)
        async with self._write_lock:
            for sheet, sheet_cells in by_sheet.items():
                payload = {"sheet": sheet, "cells": [cell_wire(c) for c in sheet_cells]}
                self._store.append_event(
                    Event(
                        run_id=self.run_id,
                        type="cell_update",
                        payload=payload,
                        execution_id=self.execution_id,
                    )
                )
                if self._emit is not None:
                    self._emit({"type": "cell_update", **payload})

    def open_cells(self) -> list[Cell]:
        """The still-open (``pending``) cells, re-read from the store."""
        cells = [c for c in self._store.get_cells(self.run_id) if c.state == "pending"]
        if self.active_member_ids is not None:
            cells = [c for c in cells if c.member in self.active_member_ids]
        return cells

    def cells(self) -> list[Cell]:
        """Every cell of the run, re-read from the store."""
        return self._store.get_cells(self.run_id)


def _activity(
    store: Store,
    run_id: str,
    emit: Emit | None,
    headline: str,
    execution_id: str | None = None,
    *,
    label: str | None = None,
    kind: str | None = "step",
) -> None:
    """Persist an ``activity`` event and stream it (the between-step heartbeat).

    ``label`` is the crisp folded now-line; ``kind`` defaults to ``"step"`` since
    every between-step heartbeat is an orchestration step (tool/thinking events
    come from the agent via :meth:`TablePopulationContext.activity`)."""
    event = build_activity_event(headline, label=label, kind=kind)
    store.append_event(
        Event(
            run_id=run_id,
            type="activity",
            payload=event_payload(event),
            execution_id=execution_id,
        )
    )
    if emit is not None:
        emit(event)


# ===========================================================================
# Step 1 — prepopulate from the executable
# ===========================================================================


def _date_columns(field_spec: dict[str, Any] | None) -> set[str]:
    """Spreadsheet column letters whose field is a date — the cells whose
    value must read in the field's declared ``DD/MM/YYYY`` format, not a source
    column's raw ISO ``YYYY-MM-DD``."""
    cols: set[str] = set()
    for field in (field_spec or {}).get("fields", []) or []:
        if (
            isinstance(field, dict)
            and field.get("type") == "date"
            and field.get("cell")
        ):
            cols.add(str(field["cell"]).upper())
    return cols


def _to_ddmmyyyy(value: str) -> str:
    """Render an ISO ``YYYY-MM-DD`` value as ``DD/MM/YYYY`` — the value is unchanged,
    only its representation (the format every date field declares). A value that is
    not a bare ISO date (e.g. a demographics date already ``DD/MM/YYYY``, an ISO
    *timestamp*, or a malformed string that merely looks date-shaped) is returned
    untouched — the value is reformatted only when it parses as a real calendar date."""
    if isinstance(value, str) and _ISO_DATE.match(value):
        try:
            parsed = datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            return value
        return parsed.strftime("%d/%m/%Y")
    return value


class PrepopulateError(Exception):
    """The executable is invalid — never raised for missing source data (that yields
    a non-clean or blocked cell, not an error)."""


async def prepopulate(run_store) -> None:
    """Run the executable over ``run_store``, UPDATEing every direct cell in place.

    Reads the executable / cohort / database_paths off ``run_store``; never holds
    cell state of its own. Only **direct** regions are resolved here — interpret
    regions stay ``pending`` for the agent. Raises :class:`PrepopulateError` only
    on an invalid executable.
    """
    executable = run_store.executable
    errors = validate_populate_spec(executable)
    if errors:
        raise PrepopulateError("executable is invalid: " + "; ".join(errors))

    identity_keys: list[str] = executable["identity_keys"]
    code_sets: dict[str, dict[str, str]] = executable.get("code_sets", {})
    first_data_row = int(executable.get("first_data_row", DEFAULT_FIRST_DATA_ROW))
    bridges = {b["database"]: b for b in executable.get("identity_bridges") or []}
    if bridges and len(identity_keys) != 1:
        raise PrepopulateError(
            "identity bridges require a single-key anchor identity "
            f"(identity_keys is {identity_keys!r})"
        )

    for region in executable["regions"]:
        if region.get("kind", "direct") == "direct":
            await _resolve_direct_region(
                run_store,
                region,
                identity_keys,
                code_sets,
                first_data_row,
                bridges,
                executable["cohort"]["database"],
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
    date_columns = _date_columns(getattr(run_store, "field_spec", None))
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
    # key set via the identity bridge, and the results join back through the
    # same translation — cross-database SQL never runs.
    per_db: list[dict[str, Any]] = []
    bridge_maps: dict[str, dict[Any, Any]] = {}
    for q in region["queries"]:
        db = q["database"]
        db_path = run_store.database_paths.get(db)
        if db_path is None:
            raise PrepopulateError(f"no database path supplied for {db!r}")
        key_column = q.get("key_column")
        bridge = bridges.get(db)
        if key_column and bridge is None:
            raise PrepopulateError(
                f"query for {db!r} is keyed by {key_column!r} but the executable "
                f"carries no identity bridge for that database"
            )
        src: dict[str, Any] = {
            "database": db,
            "sql": q["sql"],
            "by_identity": {},
            "columns": set(),
            "key_columns": [key_column] if key_column else identity_keys,
            "translate": None,
            "error": None,
        }
        try:
            if key_column:
                if db not in bridge_maps:
                    bridge_maps[db] = await _bridge_map(
                        run_store, bridge, cohort, cohort_db
                    )
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
                raise PrepopulateError(
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
                # the real error so the agent escalates with honest provenance.
                await run_store.update(
                    ref,
                    attempts=[
                        make_attempt(
                            "prepopulate",
                            failed_src["database"],
                            sql=failed_src["sql"],
                            table_column=f"{table}.{column}",
                            error=f"source query failed: {failed_src['error']}",
                        )
                    ],
                )
                continue

            if primary_blocked is not None:
                await run_store.update(
                    ref,
                    **_blocked_fields(
                        primary_blocked, primary["sql"], primary["database"]
                    ),
                )
                continue

            if column not in column_db:
                # No query returned this column — secondary may be empty for this cohort,
                # or the executable references a column that doesn't exist in any DB.
                # Leave pending (not blocked) so the agent can take over, but surface a
                # clear error rather than the misleading "is NULL" that a silent primary
                # fallback would produce.
                await run_store.update(
                    ref,
                    attempts=[
                        make_attempt(
                            "prepopulate",
                            primary["database"] if primary else "unknown",
                            table_column=f"{table}.{column}",
                            error=f"{table}.{column} not found in any query result "
                            f"(secondary DB may be empty for this cohort)",
                        )
                    ],
                )
                continue

            src = column_db[column]
            if src is primary:
                source_row, src_ident, secondary_blocked = (
                    primary_row,
                    primary_ident,
                    None,
                )
            else:
                source_row, src_ident, secondary_blocked = _lookup(src, ident, mid)
            if secondary_blocked is not None:
                await run_store.update(
                    ref,
                    **_blocked_fields(secondary_blocked, src["sql"], src["database"]),
                )
                continue

            assert source_row is not None and src_ident is not None
            raw = source_row.get(column)
            code_map = (
                code_sets.get(entry["translate"]) if entry.get("translate") else None
            )
            via = entry.get("via")
            narrowed = _narrowed_sql(table, column, src["key_columns"], src_ident, via)
            table_column = f"{table}.{column}"

            if raw is None or (isinstance(raw, str) and not raw.strip()):
                # NULL *or* empty-string source: there is no recorded value, so the
                # cell is not a clean hit. Leave it pending (the agent then blocks it
                # with a reason) rather than filling a blank — a blank is not "the
                # value from the database".
                await run_store.update(
                    ref,
                    attempts=[
                        make_attempt(
                            "prepopulate",
                            src["database"],
                            sql=narrowed,
                            table_column=table_column,
                            error=f"{table}.{column} is empty/NULL for {mid}",
                        )
                    ],
                )
            elif code_map is not None and str(raw) not in code_map:
                await run_store.update(
                    ref,
                    attempts=[
                        make_attempt(
                            "prepopulate",
                            src["database"],
                            sql=narrowed,
                            table_column=table_column,
                            value=str(raw),
                            error=f"value {str(raw)!r} not in the code map for field "
                            f"{field!r}",
                        )
                    ],
                )
            else:
                value = code_map[str(raw)] if code_map is not None else str(raw)
                col_match = _TEMPLATE_COL.search(entry["cell_template"])
                if col_match and col_match.group(1).upper() in date_columns:
                    value = _to_ddmmyyyy(value)
                source = Source(
                    database=src["database"],
                    query=_source_sql(
                        table, column, src["key_columns"], src_ident, via
                    ),
                    table_column=table_column,
                ).as_dict()
                await run_store.update(
                    ref,
                    state="filled",
                    value=value,
                    confidence="high",
                    resolved_by="prepopulated",
                    attempts=[
                        make_attempt(
                            "prepopulate",
                            src["database"],
                            sql=narrowed,
                            table_column=table_column,
                            result=value,
                        )
                    ],
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
        raise PrepopulateError("identity bridge requires the cohort database")
    db_path = run_store.database_paths.get(cohort_db)
    if db_path is None:
        raise PrepopulateError(f"no database path supplied for {cohort_db!r}")
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
            return (
                None,
                None,
                (
                    f"identity {mid!r} maps to several keys of database "
                    f"{src['database']!r} via the identity bridge; rows whose identities "
                    f"do not match are never combined."
                ),
            )
        if key is None:
            return (
                None,
                None,
                (
                    f"identity {mid!r} has no key mapping for database "
                    f"{src['database']!r} via the identity bridge; rows whose identities "
                    f"do not match are never combined."
                ),
            )
        src_ident = (key,)
    matches = src["by_identity"].get(src_ident, [])
    if len(matches) != 1:
        return (
            None,
            src_ident,
            (
                f"identity {mid!r} "
                + ("not found in" if not matches else "ambiguous in")
                + f" database {src['database']!r}; rows whose identities do not match are "
                f"never combined."
            ),
        )
    return matches[0], src_ident, None


def _blocked_fields(detail: str, failed_sql: str, database: str) -> dict[str, Any]:
    """The in-place UPDATE fields for an ``IDENTITY_UNRESOLVED`` cell — the value
    cannot be safely placed, so the cell is terminal ``blocked``."""
    return dict(
        state="blocked",
        confidence="high",
        resolved_by="prepopulated",
        attempts=[make_attempt("prepopulate", database, sql=failed_sql, error=detail)],
        reason_code="IDENTITY_UNRESOLVED",
        reason_detail=detail,
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
        raise PrepopulateError(
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
    parts = [f"{via[0]['from_table']} a0"]
    for i, hop in enumerate(via, start=1):
        a = f"a{i}"
        aliases[hop["to_table"]] = a
        parts.append(
            f"JOIN {hop['to_table']} {a} ON "
            f"{aliases[hop['from_table']]}.{hop['from_col']} = {a}.{hop['to_col']}"
        )
    return " ".join(parts), aliases


def _narrowed_sql(
    table: str,
    column: str,
    identity_keys: list[str],
    ident: tuple[Any, ...],
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
    table: str,
    column: str,
    identity_keys: list[str],
    ident: tuple[Any, ...],
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


# ===========================================================================
# Step 2 — the table agent
# ===========================================================================


def _current_commit_sha() -> str | None:
    """The HEAD commit SHA — the run's provenance stamp (storage-layout §6).

    Because the per-run ``.opencode/`` entries are symlinks to live bundle code, the
    bytes of the tools and skills that ran are not captured by any copy. The
    SHA pins every tool/skill at once with zero duplication. Returns ``None``
    in environments without git (CI without repo metadata, packaged install).
    """
    repo = Path(__file__).resolve().parents[2]
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repo,
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    sha = result.stdout.strip()
    return sha if result.returncode == 0 and sha else None


def write_run_context(
    run_store, artifact_dir: Path, *, databases_dir: Path = DATABASES_DIR
) -> Path:
    """Write ``<artifact_dir>/context.json`` — the sidecar the agent's tools read.

    Uses :func:`core/agent/tools/_run_sql.build_context` so the
    WRITER here and the READER in ``sql_execute.py`` agree on the schema by
    construction. Carries NO filesystem paths: the databases are symlinked
    into the artifact workspace (see :func:`provision_worktree`) and the tool
    opens them
    by name relative to its working directory. The context holds what a
    symlink can't convey — the cohort identities, the cohort anchor, and per
    bound database the navigation map the tool scopes with: which tables carry
    the anchor (``cohort_tables``), the cross-database bridges (``identity_links``)
    and the within-database to-one hops (``foreign_keys``) — read from the same
    canonical ``model.json`` the prepopulation plan was compiled against —
    plus the **provenance SHA** (storage-layout §6).
    """
    databases = {}
    for slug in run_store.database_paths:
        identity_links, foreign_keys = canonical_navigation(databases_dir, slug)
        databases[slug] = {
            "cohort_tables": list(run_store.cohort_tables.get(slug, [])),
            "identity_links": identity_links,
            "foreign_keys": foreign_keys,
        }
    context = build_context(
        run_id=run_store.run_id,
        anchor=run_store.anchor or "",
        cohort=list(run_store.cohort),
        databases=databases,
        provenance_sha=_current_commit_sha(),
    )
    artifact_dir.mkdir(parents=True, exist_ok=True)
    path = artifact_dir / "context.json"
    path.write_text(json.dumps(context, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def provision_worktree(
    run_store, artifact_dir: Path, *, databases_dir: Path = DATABASES_DIR
) -> None:
    """Stand up ``var/artifacts/<artifact_id>/`` as a self-contained opencode
    project root.

    The artifact workspace is the directory opencode is launched from directly
    (storage-layout §4): its ``opencode.json`` makes it the project root
    without walk-up, the materialized ``.opencode/`` references the canonical
    bundle (``core/agent/``) by symlink, and the data the agent touches is
    resolved relative to this dir.

    Contents laid down:

    * ``opencode.json`` + ``.opencode/`` — via
      :func:`core.agent.launcher.materialize_workspace`: the config copy
      (carries no paths so a copy never goes stale) and per-entry symlinks to
      the canonical ``tools`` / ``skills`` / ``node_modules``; the ``.ts``
      wrappers resolve their ``.py`` siblings and the repo-root venv via their
      real location, so the artifact workspace inherits them without copying.
    * ``context.json`` — run metadata + the provenance git SHA (no paths).
    * ``template/spec.json`` (copy) + ``template/cells.sqlite`` (symlink → state DB).
    * ``databases/<slug>.sqlite`` (symlink) + ``databases/<slug>.model.json``
      (copy) per bound database — invariant "symlinks for code/binaries,
      copies for small JSON" (§7).

    The schema models are read straight from ``var/databases/<slug>/model.json``
    — they are per-database canonical artifacts, not run-scoped state, so
    they don't live on ``TablePopulationContext``. A missing or unreadable ``model.json``
    is logged and the slug is provisioned without it: ``lookup_execute``
    will then see no model and the agent can still query the live DB (the
    storage-layout §7 invariant is "schema from model.json, never live
    introspection" — when the canonical view is genuinely absent the agent
    is allowed to fail rather than fabricate a model).
    """
    if run_store.state_db_path == ":memory:":
        raise ValueError(
            "the agent needs an on-disk run store: its tools open the cell "
            "DB out-of-process via a symlink, which an in-memory store has no file "
            "for. Use a file-backed Store for a real run."
        )
    artifact_dir.mkdir(parents=True, exist_ok=True)

    # Make this dir the opencode project root: config copy + .opencode/ of
    # symlinks into the canonical bundle (one source of truth). No config
    # override — the table agent keeps the committed LLM_TABLE_* template.
    launcher.materialize_workspace(artifact_dir)

    write_run_context(run_store, artifact_dir, databases_dir=databases_dir)

    template_dir = artifact_dir / "template"
    template_dir.mkdir(parents=True, exist_ok=True)
    (template_dir / "spec.json").write_text(
        json.dumps(run_store.field_spec or {}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    symlink(template_dir / "cells.sqlite", run_store.state_db_path)

    db_dir = artifact_dir / "databases"
    db_dir.mkdir(parents=True, exist_ok=True)
    for slug, path in run_store.database_paths.items():
        symlink(db_dir / f"{slug}.sqlite", str(path))
        copy_canonical_model(databases_dir, slug, db_dir / f"{slug}.model.json")


def _column_triage(run_store) -> str:
    """The pending work grouped by field (one field = one worksheet column),
    classed EMPTY / PARTIAL / INTERPRET, computed deterministically here so the
    agent starts column-first instead of reconstructing the grid cell-by-cell.

    * EMPTY — no member has a value: one source column likely fills the whole
      worksheet column in one pass.
    * PARTIAL — prepopulation filled some members: the filled siblings'
      ``sources`` say where the data lives; only the stragglers need work.
    * INTERPRET — judged from free text: irreducibly cell-by-cell.

    Distinct ``hypothesis`` notes left on the cells ride along per field.
    """
    names = {
        f.get("id"): f.get("name")
        for f in (run_store.field_spec or {}).get("fields", []) or []
    }
    by_field: dict[str, list] = {}
    for cell in run_store.cells():
        by_field.setdefault(cell.field, []).append(cell)

    empty: list[str] = []
    partial: list[str] = []
    interpret: list[str] = []
    for field in sorted(by_field):
        cells = by_field[field]
        pending = [c for c in cells if c.state == "pending"]
        if not pending:
            continue
        name = names.get(field)
        label = f'`{field}` ("{name}")' if name else f"`{field}`"
        line = f"- {label}: {len(pending)} of {len(cells)} cells pending"
        hypotheses = sorted({c.hypothesis for c in pending if c.hypothesis})
        if hypotheses:
            line += f" — noted so far: {'; '.join(hypotheses)}"
        if any(c.kind == "interpret" for c in pending):
            interpret.append(line)
        elif len(pending) == len(cells):
            empty.append(line)
        else:
            partial.append(line)

    sections: list[str] = []
    if empty:
        sections.append(
            "EMPTY columns — no member has a value yet; find the one source "
            "column, then fill the whole worksheet column in one pass:\n"
            + "\n".join(empty)
        )
    if partial:
        sections.append(
            "PARTIAL columns — prepopulation filled the other members; read a "
            "filled sibling's `sources` to see where the data lives, then "
            "resolve only the stragglers:\n" + "\n".join(partial)
        )
    if interpret:
        sections.append(
            "INTERPRET cells — judged from free text; work these cell-by-cell:\n"
            + "\n".join(interpret)
        )
    if not sections:
        return ""
    return (
        "Work column-first, in this order. The pending work, triaged by field "
        "(one field = one worksheet column):\n\n" + "\n\n".join(sections)
    )


def build_prompt(run_store) -> str:
    """The table agent's prompt: the table's Brief (when one was recorded),
    the databases the agent can address, plus a deterministic column-first
    triage of the pending work.

    The Brief is the delegation instruction (CONTEXT.md): the user-intent text
    the originating Table request recorded and the pinned table keeps for
    life — context for interpreting ambiguous fields, never a licence to
    change scope (the cohort stays tool-injected). The triage (see
    :func:`_column_triage`) is the one piece of worklist the prompt carries —
    per-field counts and classes, never per-cell refs, field codes, or schema
    dumps (the agent reads those through its tools, per the skill). Everything
    procedural stays in the ``table-fill`` skill — the skill is the one place
    the behaviour is maintained — and the skill, not the prompt, owns the fact
    that a run may bind several databases.
    """
    clinical = (
        "\n".join(
            f'- "{slug}" — clinical database (read-only)'
            for slug in sorted(run_store.database_paths)
        )
        or "- (no clinical database bound)"
    )
    brief = (getattr(run_store, "brief", None) or "").strip()
    brief_block = (
        f"The user's request this table was created for (its brief — context "
        f"for interpreting the fields, not a new scope):\n{brief}\n\n"
        if brief
        else ""
    )
    triage = _column_triage(run_store)
    triage_block = f"{triage}\n\n" if triage else ""
    return (
        "Fill this table's pending cells. Follow the `table-fill` skill — it "
        "explains exactly how, step by step.\n\n"
        f"{brief_block}"
        "The databases you can address (pass the name to your tools):\n"
        '- "cells" — the table worksheet you are filling (read and write)\n'
        f"{clinical}\n\n"
        f"{triage_block}"
        "Field specifications come from `lookup_execute`; find where data lives "
        "with the `navigate` skill. Begin."
    )


async def finalize_unresolved(run_store) -> int:
    """Settle every still-``pending`` cell as ``blocked`` / ``NOT_LOCATED``."""
    settled = 0
    for cell in run_store.open_cells():
        # No SQL ran for this final attempt — `make_attempt` omits `sql` (optional
        # on the contract) and carries the ``"(none)"`` database sentinel.
        attempts = list(cell.attempts or []) + [
            make_attempt("agent", "(none)", error="agent could not locate a value")
        ]
        await run_store.update(
            cell.ref,
            state="blocked",
            resolved_by="agent",
            confidence="low",
            attempts=attempts,
            reason_code=_NOT_LOCATED,
            reason_detail=(
                f"agent searched and could not place a value for field "
                f"{cell.field!r} on patient {cell.member!r}"
            ),
        )
        settled += 1
    return settled


async def run_agent(
    run_store,
    *,
    artifact_dir: Path,
    client,
    session_directory: str | None = None,
    databases_dir: Path = DATABASES_DIR,
) -> None:
    """Run the table agent: provision the workspace, drive one session, finalise.

    ``artifact_dir`` is the filesystem artifact workspace (where the files are
    written); ``session_directory`` is the SAME directory as opencode addresses
    it (the
    agent-root-relative path the session is rooted in). If the session ends
    with cells still open, they are settled ``blocked`` / ``NOT_LOCATED`` —
    the run never hangs on the agent.

    Database schema models are copied from ``<databases_dir>/<slug>/model.json``
    (the canonical view per storage-layout §3); ``databases_dir`` defaults to
    the deployment-wide ``var/databases/`` and is overridable for tests.
    """
    provision_worktree(run_store, artifact_dir, databases_dir=databases_dir)
    try:
        if run_store.open_cells():
            prompt = build_prompt(run_store)
            # One-shot posture (fresh session, deleted afterwards) is the
            # launcher's default; the transcript lands in workspace_dir.
            await launcher.launch(
                client,
                workspace_dir=artifact_dir,
                prompt=prompt,
                title=run_store.run_id,
                session_directory=session_directory,
                run_store=run_store,
            )
    finally:
        # The fallback is unconditional: whatever happens to the session —
        # transport error on create/subscribe/prompt, mid-session crash, or a
        # clean finish that left cells open — every still-pending cell is settled
        # blocked/NOT_LOCATED. The run never strands pending cells on the agent.
        await finalize_unresolved(run_store)


# ===========================================================================
# Store-shaped run bookkeeping: member layout sync + the refresh delta
# ===========================================================================

_A1_ROW_RE = re.compile(r"[A-Za-z]+(?P<row>\d+)$")


def _row_index_from_ref(ref: str, *, first_data_row: int) -> int | None:
    _, _, a1 = ref.partition("!")
    m = _A1_ROW_RE.match(a1.strip())
    if not m:
        return None
    row_no = int(m.group("row"))
    idx = row_no - first_data_row
    return idx if idx >= 0 else None


def _infer_member_row_index(
    cells: list[Cell], *, first_data_row: int
) -> dict[str, int]:
    by_member: dict[str, int] = {}
    for cell in cells:
        if not cell.member:
            continue
        idx = _row_index_from_ref(cell.ref, first_data_row=first_data_row)
        if idx is None:
            continue
        prev = by_member.get(cell.member)
        by_member[cell.member] = idx if prev is None else min(prev, idx)
    return by_member


def sync_initial_table_population_members(
    store: Store,
    *,
    table_population_id: str,
    cohort: list[Any],
    member_row_index: dict[str, int],
) -> None:
    """Persist the fresh run's member layout: one active ``RunMember`` per
    cohort member, at its assembled row."""
    for member in cohort:
        mid = member_id(member)
        store.upsert_run_member(
            RunMember(
                run_id=table_population_id,
                member=mid,
                row_index=member_row_index[mid],
                active=True,
            )
        )


def prepare_refresh_delta(
    store: Store,
    *,
    table_population_id: str,
    execution_id: str,
    executable: dict[str, Any],
    cohort: list[Any],
) -> dict[str, Any]:
    """Preprocess a refresh execution against the persisted run: reconcile the
    member roster (new / departed / unchanged, rows pinned), reopen the active
    members' retryable ``blocked`` cells to bare ``pending`` seeds, and insert
    the pending grid for the NEW members only. Returns the stats the refresh
    summary counts from. Pure store+layout logic — no HTTP, no stream."""
    first_data_row = int(executable.get("first_data_row", DEFAULT_FIRST_DATA_ROW))
    cohort_member_ids = [member_id(member) for member in cohort]
    active_member_ids = set(cohort_member_ids)

    existing_members = store.list_run_members(table_population_id)
    existing_by_id = {member.member: member for member in existing_members}
    member_row_index: dict[str, int] = {
        member.member: int(member.row_index)
        for member in existing_members
        if member.row_index is not None
    }

    cells = store.get_cells(table_population_id)
    if not member_row_index:
        member_row_index.update(
            _infer_member_row_index(cells, first_data_row=first_data_row)
        )

    known_member_ids = set(existing_by_id) | set(member_row_index)
    next_row = max(member_row_index.values(), default=-1) + 1
    for mid in sorted(known_member_ids):
        if mid not in member_row_index:
            member_row_index[mid] = next_row
            next_row += 1

    new_member_ids: list[str] = []
    for mid in cohort_member_ids:
        if mid in known_member_ids:
            continue
        member_row_index[mid] = next_row
        next_row += 1
        known_member_ids.add(mid)
        new_member_ids.append(mid)

    departed_member_ids = sorted(known_member_ids - active_member_ids)
    unchanged_member_ids = sorted(active_member_ids - set(new_member_ids))

    for mid in departed_member_ids:
        existing = existing_by_id.get(mid)
        store.upsert_run_member(
            RunMember(
                run_id=table_population_id,
                member=mid,
                row_index=member_row_index[mid],
                active=False,
                first_seen_execution_id=(
                    existing.first_seen_execution_id if existing is not None else None
                ),
                last_seen_execution_id=(
                    existing.last_seen_execution_id if existing is not None else None
                ),
            )
        )

    for mid in unchanged_member_ids + new_member_ids:
        existing = existing_by_id.get(mid)
        store.upsert_run_member(
            RunMember(
                run_id=table_population_id,
                member=mid,
                row_index=member_row_index[mid],
                active=True,
                first_seen_execution_id=(
                    existing.first_seen_execution_id
                    if existing is not None
                    and existing.first_seen_execution_id is not None
                    else execution_id
                ),
                last_seen_execution_id=execution_id,
            )
        )

    existing_ref_set = {cell.ref for cell in cells}
    reopened_blocked_refs: set[str] = set()
    for cell in cells:
        if cell.member not in active_member_ids:
            continue
        if cell.state != "blocked":
            continue
        reopened_blocked_refs.add(cell.ref)
        store.update_cell(
            table_population_id,
            cell.ref,
            state="pending",
            value=None,
            confidence=None,
            resolved_by=None,
            hypothesis=None,
            attempts=[],
            review_state=None,
            corrected=None,
            explanation=None,
            sources=[],
            reason_code=None,
            reason_detail=None,
            owner_needed=None,
            outstanding_since=None,
        )

    new_pending = build_pending_table_cells(
        table_population_id,
        executable,
        new_member_ids,
        member_rows=member_row_index,
    )
    insertable_new_pending = [
        cell for cell in new_pending if cell.ref not in existing_ref_set
    ]
    colliding_refs = sorted({cell.ref for cell in new_pending} & existing_ref_set)
    if colliding_refs:
        sample = ", ".join(colliding_refs[:3])
        raise ValueError(
            f"refresh produced duplicate cell refs for existing run cells: {sample}"
        )
    store.insert_pending_cells(insertable_new_pending)

    return {
        "active_member_ids": active_member_ids,
        "member_row_index": {mid: member_row_index[mid] for mid in active_member_ids},
        "new_members_count": len(new_member_ids),
        "departed_members_count": len(departed_member_ids),
        "retried_blocked_count": len(reopened_blocked_refs),
        "reopened_blocked_refs": reopened_blocked_refs,
        "preprocess_updated_cells_count": len(reopened_blocked_refs)
        + len(insertable_new_pending),
    }


# ===========================================================================
# The end-to-end run
# ===========================================================================


@dataclass
class PopulationOutcome:
    """What the route's bookkeeping still needs back from a finished
    population: the mapping's authoritative database binding (the run record's
    ``database_ids`` are synced to it — an api_app write the orchestrator
    store's runtime role may not perform) and, on a refresh, the delta stats
    the refresh summary counts from."""

    bound_database_ids: list[str]
    refresh_stats: dict[str, Any] | None = None


async def run_population_steps(
    run_store: TablePopulationContext,
    store: Store,
    *,
    artifact_dir: Path,
    emit: Emit | None = None,
    agent_client: Any | None = None,
    prepare_pending_grid: bool = True,
    session_directory: str | None = None,
    databases_dir: Path = DATABASES_DIR,
) -> None:
    """Drive one ASSEMBLED table population end to end, store-first.

    The ingredient-shaped inner seam: everything is read off ``run_store``
    (the :class:`TablePopulationContext` the caller built). Production traffic
    enters through :func:`populate_table`, which assembles the context from
    the request identity; the eval harnesses (``scripts/eval_agent_npda.py``)
    drive this seam directly with a hand-built context (capped cohorts, seed
    mappings) that no request identity produces.

    1. Persist the full ``pending`` grid BEFORE any value lands (skipped on a
       refresh — the delta preprocessing already reconciled the grid).
    2. If the executable carries regions, run :func:`prepopulate` — the
       deterministic bulk copy. A table without an executable skips straight
       past this.
    3. If any cell is still ``pending``, run the table agent
       (:func:`run_agent`) — it resolves what it can and settles the rest
       ``blocked``. The open set is re-queried from cell ``state``, never held
       in memory.
    4. Derive the result status from the persisted cells; emit the terminal
       ``review_summary``, then ``done``.

    The field spec on ``run_store`` is REQUIRED: it is the source the off-code
    guard is armed from (``materialize_field_codes``). Running without it
    would silently disarm DB-level value validation, so a missing field spec fails
    fast here rather than weakening the guarantee mid-run. A field spec with no
    coded fields is fine (no codes to enforce); ``None`` means it was never
    loaded — a bug.

    ``agent_client`` is the app's ``OpenCodeClient`` (from the session relay).
    It may be ``None`` only when no agent work arises — leftover pending cells
    with no client are a hard error, never silently stranded.
    """
    field_spec = run_store.field_spec
    if field_spec is None:
        raise ValueError(
            "populate_table requires the field spec (spec.json) so the off-code "
            "guard can be armed before anything writes; got None"
        )
    table_population_id = run_store.run_id
    executable = run_store.executable
    execution_id = run_store.execution_id

    # 1. Persist the full pending grid first — every cell exists before any value.
    #    Materialise the run's field code sets from spec.json in the same breath,
    #    so the DB-level off-code guard is armed before anything (including the
    #    agent's raw SQL) can write a value.
    _activity(
        store,
        table_population_id,
        emit,
        "Preparing the table.",
        execution_id=execution_id,
        label="Preparing the table",
    )
    store.materialize_field_codes(table_population_id, field_spec)
    if prepare_pending_grid:
        store.insert_pending_cells(
            build_pending_table_cells(
                table_population_id,
                executable,
                run_store.cohort,
                member_rows=run_store.member_rows,
            )
        )

    # 2. Prepopulate from the executable — only when there is one. An ad-hoc
    #    table (an EMPTY executable, no precomputed plan) goes straight to the
    #    agent; a NON-empty executable is always validated by prepopulate, so a
    #    template whose plan degenerated (e.g. compiled without regions) fails
    #    loudly instead of completing as a silent empty table.
    if executable and run_store.open_cells():
        _activity(
            store,
            table_population_id,
            emit,
            "Looking up values in the database.",
            execution_id=execution_id,
            label="Looking up values",
        )
        await prepopulate(run_store)
        counts = _cell_state_counts(store, table_population_id)
        _activity(
            store,
            table_population_id,
            emit,
            f"Filled {counts['filled']} of {counts['prepared']} values from the database.",
            execution_id=execution_id,
            label="Looked up values",
        )

    # 3. Anything still open goes to the agent. No connective line here — the
    #    agent's own thinking and tool activity stream into the same feed.
    if run_store.open_cells():
        if agent_client is None:
            raise RuntimeError(
                "agent execution is unavailable: the session relay does not "
                "expose an agent client, and cells are still pending."
            )
        await run_agent(
            run_store,
            artifact_dir=artifact_dir,
            client=agent_client,
            session_directory=session_directory,
            databases_dir=databases_dir,
        )

    # 4. Status is derived from the persisted cells (never the stream); emit
    #    terminal review_summary, then done.
    _activity(
        store,
        table_population_id,
        emit,
        f"Finalizing results: {_counts_text(_cell_state_counts(store, table_population_id))}.",
        execution_id=execution_id,
        label="Finalizing results",
    )
    store.recompute_status(table_population_id)
    review_summary = build_review_summary_event(store.get_cells(table_population_id))
    store.append_event(
        Event(
            run_id=table_population_id,
            type="review_summary",
            payload=event_payload(review_summary),
        )
    )
    if emit is not None:
        emit(review_summary)
        emit({"type": "done"})


async def populate_table(
    store: Store,
    table: dict[str, Any],
    *,
    emit: Emit | None = None,
    agent_client: Any | None = None,
    execution_id: str | None = None,
    filters: dict[str, str] | None = None,
    database_id: str | None = None,
    artifact_dir: Path | None = None,
    templates_dir: Path = TEMPLATES_DIR,
    databases_dir: Path = DATABASES_DIR,
    datasets_dir: Path = DATASETS_DIR,
) -> PopulationOutcome:
    """Populate one table from ITS REQUEST IDENTITY — the public seam.

    ``table`` is the ``table.schema.json`` dict (or, for the table-less legacy
    adapter, the minimal synthesized identity): ``source_template`` names the
    template whose spec + mapping back the run, ``dataset_id`` pins the scope the
    runtime filters and database binding derive from, ``brief`` is the
    delegation instruction the agent prompt carries, and
    ``table_population_id`` is the run the cells persist under. Everything
    else — spec, mapping executable, database paths, the filter-grounded
    cohort, anchor, cohort tables, member layout — is DERIVED here:

    * ingredients via :func:`core.table_population.prepare.assemble_population_context`
      (raises ``ValueError`` with the runtime's historical messages; the
      off-code guard's source spec failing to load fails the run fast);
    * runtime filters from the PINNED Dataset (:func:`filters_from_dataset`,
      fail-closed) and the database hint from the same Dataset
      (:func:`database_from_dataset`) — ``filters`` / ``database_id`` are the
      explicit overrides for the one table-less legacy caller
      (``POST /api/table-populations``), which has no Dataset to derive from;
    * ``artifact_dir`` from the population id (``ARTIFACTS_DIR /
      table_population_id``), overridable for tests;
    * a refresh (``execution_id`` present AND the store already holds this
      run's members/cells — an existing run) reconciles the persisted grid via
      :func:`prepare_refresh_delta` instead of inserting a fresh one; a fresh
      run persists its member layout via
      :func:`sync_initial_table_population_members`.

    Emits the initial (blank) ``workbook_created`` grid through ``emit``
    BEFORE any cell event, then drives :func:`run_population_steps` (grid →
    prepopulate → agent → review_summary/done). Returns the
    :class:`PopulationOutcome` the route's run-record/summary bookkeeping
    still needs; the events themselves all travel through ``emit``.

    Ad-hoc tables (``source_template == "ad-hoc"``) never reach this seam —
    the control plane pins them without spawning — and would fail fast here
    anyway (no ``var/templates/ad-hoc/spec.json`` to arm the guard from).
    """
    table_population_id = str(table.get("table_population_id") or "")
    if not table_population_id:
        raise ValueError("populate_table requires table['table_population_id']")
    source_template_id = str(table.get("source_template") or "")
    if not source_template_id:
        raise ValueError("populate_table requires table['source_template']")
    dataset_id = table.get("dataset_id")
    if filters is None:
        # FAIL-CLOSED: an unloadable/unfaithful pinned Dataset raises rather
        # than widening the cohort to the whole DB under a narrow-cohort label.
        filters = filters_from_dataset(dataset_id, datasets_dir=datasets_dir)
    if database_id is None:
        database_id = database_from_dataset(dataset_id, datasets_dir=datasets_dir)
    if artifact_dir is None:
        artifact_dir = ARTIFACTS_DIR / table_population_id

    # The assembly's progress notes ("Loading the mapping", "Resolving the
    # cohort") ride the SAME emit callback as every other frame — streamed
    # only, never persisted (matching the pre-move route behaviour).
    async def _emit_async(event: dict[str, Any]) -> None:
        if emit is not None:
            emit(event)

    assembled = await assemble_population_context(
        source_template_id,
        database_id=database_id,
        filters=filters,
        templates_dir=templates_dir,
        databases_dir=databases_dir,
        emit=_emit_async if emit is not None else None,
    )
    executable = assembled.executable
    cohort = assembled.cohort

    # A refresh re-enters an EXISTING run: the persisted grid/members are
    # reconciled by the delta instead of re-inserted. The run record itself
    # always exists by now (the route creates it before calling in), so "an
    # existing run" is read off the run's own persisted state: a previous
    # execution left members and/or cells behind.
    is_refresh = execution_id is not None and bool(
        store.list_run_members(table_population_id)
        or store.get_cells(table_population_id)
    )
    refresh_stats: dict[str, Any] | None = None
    member_row_index = dict(assembled.member_rows)
    active_member_ids = set(member_row_index)
    if is_refresh:
        refresh_stats = prepare_refresh_delta(
            store,
            table_population_id=table_population_id,
            execution_id=execution_id,
            executable=executable,
            cohort=cohort,
        )
        member_row_index = dict(refresh_stats["member_row_index"])
        active_member_ids = set(refresh_stats["active_member_ids"])
    else:
        sync_initial_table_population_members(
            store,
            table_population_id=table_population_id,
            cohort=cohort,
            member_row_index=member_row_index,
        )

    # Emit the initial (blank) grid the FE renders before any value lands. It's
    # built from the precomputed pending cells — the exact SHEET!A1 refs the
    # run will fill — so the grid the user sees is the grid the cells define;
    # there is no on-disk result.xlsx. Headers come from the spec's display
    # names. Emitted (never persisted — the /workbook rebuild re-derives it)
    # BEFORE any cell event, through the same emit callback everything else
    # travels on.
    if emit is not None:
        pending_cells = build_pending_table_cells(
            table_population_id, executable, cohort, member_rows=member_row_index
        )
        emit(
            {
                "type": "workbook_created",
                "label": "result.xlsx",
                "sheets": sheets_from_cells(
                    pending_cells, field_display_names(assembled.field_spec)
                ),
                "cellMetadata": {},
            }
        )

    run_store = TablePopulationContext(
        store,
        table_population_id,
        executable=executable,
        cohort=cohort,
        database_paths=assembled.database_paths,
        field_spec=assembled.field_spec,
        anchor=assembled.anchor,
        cohort_tables=assembled.cohort_tables,
        emit=emit,
        execution_id=execution_id,
        active_member_ids=active_member_ids,
        member_rows=member_row_index,
        brief=table.get("brief"),
    )
    await run_population_steps(
        run_store,
        store,
        artifact_dir=artifact_dir,
        emit=emit,
        agent_client=agent_client,
        prepare_pending_grid=not is_refresh,
        session_directory=str(artifact_dir),
        databases_dir=databases_dir,
    )
    return PopulationOutcome(
        bound_database_ids=list(assembled.bound_database_ids),
        refresh_stats=refresh_stats,
    )


# ===========================================================================
# The population TERMINAL SEQUENCE + CANCELLATION classification
# ===========================================================================
#
# These two are POPULATION behavior, not HTTP: the exact order the terminal
# frames leave through the publisher, and whether a cancellation finalizes the
# run as "completed" (a pause, or a stop that merely raced a finished run) or
# "stopped" (a hard abort). They live here beside the driver (#334) so the route
# retains only auth, HTTP translation, and the relay/publisher wiring.
#
# The route hands in the pieces that ARE its own: the ordered ``publisher`` (a
# duck-typed relay with ``emit`` / ``aclose`` / ``closed``), the lifecycle
# writers (``record_status`` and an ``update_execution`` callback), a
# ``result_status`` reader (the run's cell-derived RESULT status), and — for the
# mid-run pause — the store the summary is recomputed from. The ordering and the
# classification are decided HERE.


class _Publisher:
    """The ordered event relay the finalizers drive — duck-typed so the route's
    ``_OrderedSessionEventRelay`` satisfies it without core importing the route."""

    closed: bool

    def emit(self, event: dict[str, Any]) -> None: ...

    async def aclose(self) -> None: ...


async def finalize_completed_population(
    *,
    publisher: _Publisher,
    deferred_done_event: dict[str, Any] | None,
    refresh_summary: dict[str, Any],
    result_status: str | None,
    record_status: Callable[..., Awaitable[None]],
    transition_execution: Callable[..., None],
    with_execution: Callable[[dict[str, Any]], dict[str, Any]],
) -> None:
    """Emit the population's SUCCESS terminal sequence in order, then close ONCE.

    ``populate_table`` already queued ``review_summary`` on the publisher (its
    driver did, via ``emit``) and deferred the ``done`` frame back to the caller.
    This queues the OPTIONAL ``refresh_summary`` (present only on a refresh) and
    the final ``done`` THROUGH the same publisher, then closes: the single
    ``aclose()`` flushes ``review_summary`` → ``refresh_summary`` → ``done`` in
    that order. Emitting ``done`` after the close (the old shape) left a window
    where the publisher was shut but ``done`` was unsent — a stop racing that
    window dropped the terminal frame.

    The terminal lifecycle status (``record_status`` → ``completed``) is
    recorded BEFORE the client-visible ``done`` frame: a client that reacts to
    ``done`` by GETting the state (or trying a refresh) must never observe a
    stale ``running`` — the durable transition has to precede the signal that the
    run finished. ``record_status`` / ``transition_execution`` are the route's
    lifecycle writers, bound to this population's id.
    """
    if refresh_summary:
        publisher.emit(
            with_execution({"type": "refresh_summary", "summary": refresh_summary})
        )
    done_event = deferred_done_event or {"type": "done"}
    if refresh_summary:
        done_event = {**done_event, "summary": refresh_summary}
    await record_status("completed", result_status=result_status)
    transition_execution(
        "completed",
        # The explicit result_status is spread LAST so a refresh_summary that
        # ever carries its own result_status key can never shadow the run's
        # actual terminal result (issue #8).
        summary_json={**refresh_summary, "result_status": result_status},
    )
    publisher.emit(with_execution(done_event))
    await publisher.aclose()


async def finalize_cancelled_population(
    *,
    table_population_id: str,
    publisher: _Publisher,
    orchestrate_completed: bool,
    stop_requested: bool,
    orchestrator_store: Store,
    get_result_status: Callable[[], str | None],
    record_status: Callable[..., Awaitable[None]],
    transition_execution: Callable[..., None],
    with_execution: Callable[[dict[str, Any]], dict[str, Any]],
) -> bool:
    """Classify a cancellation and finalize accordingly. Returns ``True`` when
    the cancel was handled GRACEFULLY (recorded ``completed``); ``False`` when it
    is a HARD abort the caller must let propagate (after recording ``stopped``).

    Two cancellations finish gracefully:

      1. ``orchestrate_completed`` — the population already finished and the
         terminal frames are queued/flushing; this cancel just raced the close.
         The publisher's drain still delivers ``review_summary`` + ``done``, so
         we only record completion (never rewrite to ``stopped``).
      2. a USER PAUSE mid-run (``stop_requested``) — finalize with a
         ``review_summary`` of the work done so far, then ``done``.

    Any OTHER cancel (delete, server shutdown) is the hard abort: record
    ``stopped`` and report it un-handled so the caller re-raises.

    ``get_result_status`` is read for the graceful branch AFTER the mid-run
    pause recompute (so a paused run records the status its just-recomputed cells
    imply) — never before.
    """
    if orchestrate_completed or stop_requested:
        try:
            if not orchestrate_completed and not publisher.closed:
                # Mid-run pause: build + stream a summary of the work so far.
                orchestrator_store.recompute_status(table_population_id)
                review_summary = build_review_summary_event(
                    orchestrator_store.get_cells(table_population_id)
                )
                publisher.emit(with_execution(review_summary))
                publisher.emit(with_execution({"type": "done"}))
        except Exception:
            logger.exception(
                "Table population %s: stop-finalize emit failed",
                table_population_id,
            )
        await publisher.aclose()
        result_status = get_result_status()
        await record_status("completed", result_status=result_status)
        transition_execution(
            "completed",
            summary_json={
                "result_status": result_status,
                "stopped_by_user": stop_requested,
            },
        )
        return True

    await record_status("stopped", detail="Stopped by user.")
    error_event: dict[str, Any] = {
        "type": "error",
        "message": "Table population stopped by user.",
    }
    if not publisher.closed:
        publisher.emit(with_execution(error_event))
    await publisher.aclose()
    transition_execution("stopped")
    return False


def new_table_population_id() -> str:
    return (
        "run-"
        + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        + "-"
        + uuid4().hex[:4]
    )


def new_execution_id() -> str:
    """Mint a refresh execution id (``run_executions.id``).

    Core owns the population's execution bookkeeping (#326): the route asks
    for an id here rather than minting its own. Same shape as
    :func:`new_table_population_id`, under the ``exec-`` namespace.
    """
    return (
        "exec-"
        + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        + "-"
        + uuid4().hex[:8]
    )
