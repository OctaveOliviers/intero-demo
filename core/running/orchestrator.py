"""Phase 3 of the audit pipeline: orchestrator-driven run spine.

The orchestrator owns the cell store and drives the run: it precomputes and
persists one ``pending`` cell per (region × cohort member × cell slot) before
any tier runs, then sequences Tier 1 → 2 → 3 by querying cell ``state`` in the
store. Tiers only resolve cells — they update in place through ``RunStore``.

This module is transport-agnostic. HTTP/SSE framing stays in the route layer.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable
from uuid import uuid4

from core.config import DATABASES_DIR
from core.running.events import (
    build_activity_event,
    build_review_summary_event,
    event_payload,
)
from core.running.cell_ref import DEFAULT_FIRST_DATA_ROW, render_a1, member_id as format_member_id
from core.store import Cell, Event, Store

logger = logging.getLogger(__name__)


# ===========================================================================
# The run spine (A0 keystone) — store-driven, tier-sequenced orchestration
# ===========================================================================
#
# The seams this pins (the whole point of A0):
#   * the three tier signatures — each receives ONLY the `RunStore`, updates
#     cells IN PLACE through it, and returns nothing;
#   * the `RunStore` interface itself — both the per-run context handle (its
#     executable / cohort / database_paths fields) and the write seam
#     (`update`, `open_cells`, `cells`);
#   * how the orchestrator reads `state` from the store to sequence the tiers,
#     holding no cell state of its own.
#
# Tier signatures (A1/A2/A3 implement; A0 stubs them):
#   tier_direct(run_store)   # Tier 1, bulk — reads run_store.executable + .database_paths
#   tier_llm(run_store)      # Tier 2 — iterates run_store.open_cells() itself
#   tier_agent(run_store)    # Tier 3 — opens one agent session; tools read/write through it
# A tier may be sync or async — the orchestrator awaits whatever it returns.
#
# Fields A0 puts on RunStore: store binding (run_id), executable, cohort,
# database_paths, emit. Fields A1/A2/A3 are expected to ADD as they reveal what
# each tier actually consumes (the backward build's whole point — don't guess
# now, pin against a real consumer when it arrives):
#   * A1 (Tier 3): an `audit` handle (or `audit_id` + a loader) so `write_cell`
#     can resolve the field's code set from spec.json for off-code validation;
#     possibly an audit-path for the agent's lean-schema view.
#   * A2 (Tier 2): the same `audit` handle (codes are resolved from spec.json by
#     `cell.field` here too); a bound `run_readonly_sql` for the orchestrator-
#     executed retry (Tier 2 itself never holds a DB connection).
#   * A3 (Tier 1): nothing new — already has executable + database_paths.
# When you widen RunStore, plumb the new field through `orchestrate_run`'s args
# and update this stub test fixture so A0's regression net keeps holding.

# Cohort members are laid out sequentially from the first data row (the row below
# the header). The executable may override via `first_data_row`.

# An emit sink for SSE events (cell_update / activity / done); None in unit tests
# that only assert on the persisted store. A tier callable returns None or an
# awaitable.
Emit = Callable[[dict], None]
Tier = Callable[..., "Awaitable[None] | None"]


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




def precompute_pending_cells(
    run_id: str,
    executable: dict[str, Any],
    cohort: list[Any],
    *,
    member_rows: dict[str, int] | None = None,
) -> list[Cell]:
    """One ``pending`` cell per (region × cohort member × cell slot).

    sheet/ref/field/member/kind are set; nothing else — the value/state ladder is
    the tiers' job. `ref` is the combined ``"<Sheet>!<A1>"`` the store keys on;
    `kind` is carried from the executable (the cell slot's, else the region's).
    This is the full grid the FE shows from the start, before any tier runs.
    """
    first_data_row = int(executable.get("first_data_row", DEFAULT_FIRST_DATA_ROW))
    cells: list[Cell] = []
    for region in executable["regions"]:
        sheet = region["sheet"]
        region_kind = region.get("kind", "direct")
        for index, member in enumerate(cohort):
            mid = format_member_id(member)
            if member_rows is not None and mid in member_rows:
                row = first_data_row + int(member_rows[mid])
            else:
                row = first_data_row + index
            for entry in region["cell_map"]:
                ref = f"{sheet}!{render_a1(entry['cell_template'], row)}"
                cells.append(Cell(
                    run_id=run_id, ref=ref, field=entry["field"],
                    member=mid, kind=entry.get("kind", region_kind),
                    state="pending",
                ))
    return cells


def _cell_wire(cell: Cell) -> dict[str, Any]:
    """One cell as the SSE ``cell_update.cells[]`` entry: ``{ref, value?, meta}``.

    `ref` is the A1 within its sheet; the sheet travels on the wrapper. `meta` is
    the per-cell metadata projection (runtime-shapes §2) — only the set fields.
    """
    _, _, a1 = cell.ref.partition("!")
    meta = {k: v for k, v in {
        "field": cell.field, "member": cell.member, "kind": cell.kind,
        "state": cell.state, "confidence": cell.confidence,
        "resolved_by": cell.resolved_by, "hypothesis": cell.hypothesis,
        "attempts": cell.attempts, "sources": cell.sources,
        "explanation": cell.explanation, "reason_code": cell.reason_code,
        "reason_detail": cell.reason_detail,
    }.items() if v not in (None, [], {})}
    wire: dict[str, Any] = {"ref": a1, "meta": meta}
    if cell.value is not None:
        wire["value"] = cell.value
    return wire


class RunStore:
    """The per-run context handle — the ONE object every tier receives.

    Two halves, glued together because both belong to "this run":

    * **The cell-store binding.** Wraps a multi-run, multi-user :class:`Store`
      (the SQLite holding every run's cells/events; later a hospital-hosted DB)
      and scopes every read/write to this ``run_id``. The :meth:`update` seam
      is the only way tiers mutate cells: one call that surgically UPDATEs in
      place + appends the durable ``cell_update`` event + streams it live, so
      "persist + stream" can never get out of step.
    * **The run's in-memory context.** ``executable`` (mapping.json's Tier-1
      plan), ``cohort`` (resolved at run start), ``database_paths`` (the source
      clinical SQLite(s) — read-only, distinct from the state DB). Loaded once
      by the orchestrator at run start; the tiers read what they need and
      ignore what they don't (Tier 2 won't touch ``database_paths``; Tier 1
      needs all three). A0 pins the cell-store shape; A1/A2/A3 widen the
      context fields as they reveal what each tier actually consumes (e.g. an
      ``audit`` handle for code-set validation, an ``audit_path`` for the
      agent's lean-schema view, etc.).
    """

    def __init__(
        self,
        store: Store,
        run_id: str,
        *,
        executable: dict[str, Any] | None = None,
        cohort: list[Any] | None = None,
        database_paths: dict[str, Path] | None = None,
        audit: dict[str, Any] | None = None,
        anchor: str | None = None,
        cohort_tables: dict[str, list[str]] | None = None,
        emit: Emit | None = None,
        execution_id: str | None = None,
        active_member_ids: set[str] | None = None,
        member_rows: dict[str, int] | None = None,
    ) -> None:
        self._store = store
        self.run_id = run_id
        self.executable: dict[str, Any] = executable or {}
        self.cohort: list[Any] = cohort or []
        self.database_paths: dict[str, Path] = database_paths or {}
        # NB: database models (model.json) are NOT on RunStore — they are
        # per-database canonical artifacts, not run-scoped state. Tiers that
        # need a schema read it from var/databases/<slug>/model.json on demand
        # (Tier 3 does this in provision_worktree). Storage-layout §7: schema
        # comes from model.json, never live DB introspection.
        # The audit-spec dict (spec.json), used by Tier 2/3 to resolve a field's
        # permitted_values for off-code validation. A1 pins this slot — the
        # write_cell tool looks the code set up by `cell.field`. Tier 1 ignores
        # it (Tier-1 codes are the executable's, not spec.json's).
        self.audit: dict[str, Any] | None = audit
        # Tier 3's agent reaches the hospital DBs over SQL; the tool injects the
        # cohort filter onto every cohort-bearing table. `anchor` is the cohort
        # identity column (e.g. "patient_code") and `cohort_tables` is per-database
        # the set of tables that carry that anchor. Both come from mapping.json
        # (A4); A1 accepts them off RunStore so Tier 3 can write the context
        # without re-parsing the mapping.
        self.anchor: str | None = anchor
        self.cohort_tables: dict[str, list[str]] = cohort_tables or {}
        self.execution_id = execution_id
        self.active_member_ids = active_member_ids
        self.member_rows = member_rows
        self._emit = emit
        # Serialises store writes across the concurrent Tier-2 fan-out: the cells
        # all share one sqlite3 connection, which has no cross-coroutine safety.
        # `update`/`activity` hold this for their whole write — so even if a future
        # change introduces an `await` mid-write, two coroutines can't interleave
        # on the connection. Read paths (open_cells/cells) don't take it (sqlite
        # handles concurrent reads, and they only ever run between writes here).
        self._write_lock = asyncio.Lock()

    @property
    def state_db_path(self) -> str:
        """The on-disk path of the cell store — the public seam Tier 3 uses to
        symlink the run store into the agent worktree (no reaching into the
        Store internals)."""
        return self._store.path

    async def update(self, ref: str, **fields: Any) -> Cell:
        """Update one cell in place by ``ref``, then persist + stream the change.

        Async + lock-guarded so the concurrent Tier-2 fan-out can't interleave on
        the shared sqlite connection (see ``_write_lock``)."""
        async with self._write_lock:
            cell = self._store.update_cell(self.run_id, ref, **fields)
            payload = {"sheet": cell.ref.partition("!")[0], "cells": [_cell_wire(cell)]}
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

    async def activity(self, headline: str) -> None:
        """Persist + stream an ``activity`` heartbeat — the public seam a tier uses
        to surface a within-tier note (e.g. "Tier 2 is single-database") into the
        run stream the FE already consumes, without reaching into the store/emit
        internals. Mirrors the orchestrator's between-tier ``_activity``. Holds the
        same write lock as :meth:`update`."""
        event = build_activity_event(headline)
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

    def open_cells(self) -> list[Cell]:
        """The still-open (``pending``) cells, re-read from the store."""
        cells = [c for c in self._store.get_cells(self.run_id) if c.state == "pending"]
        if self.active_member_ids is not None:
            cells = [c for c in cells if c.member in self.active_member_ids]
        return cells

    def cells(self) -> list[Cell]:
        """Every cell of the run, re-read from the store."""
        return self._store.get_cells(self.run_id)


async def _run_tier(tier: Tier, run_store: "RunStore") -> None:
    """Call a tier with the run-store handle, awaiting it if it is async."""
    result = tier(run_store)
    if inspect.isawaitable(result):
        await result


def _activity(
    store: Store,
    run_id: str,
    emit: Emit | None,
    headline: str,
    execution_id: str | None = None,
) -> None:
    """Persist an ``activity`` event and stream it (the between-tier heartbeat)."""
    event = build_activity_event(headline)
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


async def orchestrate_run(
    store: Store,
    run_id: str,
    executable: dict[str, Any],
    cohort: list[Any],
    *,
    tier_direct: Tier,
    tier_llm: Tier,
    tier_agent: Tier,
    emit: Emit | None = None,
    database_paths: dict[str, Path] | None = None,
    audit: dict[str, Any] | None = None,
    anchor: str | None = None,
    cohort_tables: dict[str, list[str]] | None = None,
    execution_id: str | None = None,
    prepare_pending_grid: bool = True,
    member_rows: dict[str, int] | None = None,
    active_member_ids: set[str] | None = None,
) -> None:
    """Drive one run end to end, store-first.

    1. Build the per-run ``RunStore`` (cell-store binding + executable + cohort
       + database_paths) and persist the full ``pending`` grid BEFORE any tier
       runs.
    2. Hand the same ``RunStore`` to Tier 1, then Tier 2, then Tier 3 — each
       resolves whatever it can and writes in place. Tier 2 only runs if any
       cell is still ``pending`` after Tier 1; Tier 3 only if any is still
       ``pending`` after Tier 2. The orchestrator queries cell ``state``
       between tiers to decide.
    3. Derive the run status from the persisted cells; emit terminal ``done``.

    The orchestrator owns the store and the routing; the tiers only resolve
    cells, through the one ``RunStore`` argument. There is no SQL or LLM here
    — the tiers own that. Nothing about a cell lives outside the store: the
    open set is re-queried from ``state`` between tiers.

    ``audit`` (spec.json) is REQUIRED: it is the source the off-code guard is
    armed from (``materialize_field_codes``). Running without it would silently
    disarm DB-level value validation, so a missing audit fails fast here rather
    than weakening the guarantee mid-run. An audit with no coded fields is fine
    (no codes to enforce); ``None`` means it was never loaded — a bug.
    """
    if audit is None:
        raise ValueError(
            "orchestrate_run requires the audit spec (spec.json) so the off-code "
            "guard can be armed before any tier writes; got None"
        )
    run_store = RunStore(
        store, run_id,
        executable=executable, cohort=cohort,
        database_paths=database_paths or {}, audit=audit,
        anchor=anchor, cohort_tables=cohort_tables or {}, emit=emit,
        execution_id=execution_id,
        active_member_ids=active_member_ids,
        member_rows=member_rows,
    )

    # 1. Persist the full pending grid first — every cell exists before any tier.
    #    Materialise the run's field code sets from spec.json in the same breath,
    #    so the DB-level off-code guard is armed before any tier (or the agent's
    #    raw SQL) can write a value.
    _activity(store, run_id, emit, "Preparing workbook and cohort.", execution_id=execution_id)
    store.materialize_field_codes(run_id, audit)
    if prepare_pending_grid:
        pending = precompute_pending_cells(
            run_id,
            executable,
            cohort,
            member_rows=member_rows,
        )
        store.insert_pending_cells(pending)
    else:
        pending = run_store.open_cells()
    _activity(
        store,
        run_id,
        emit,
        f"Prepared {len(pending)} cells across {len(cohort)} cohort members.",
        execution_id=execution_id,
    )

    # 2. Deterministic auto-fill from database.
    _activity(store, run_id, emit, "Auto-filling values from the database.", execution_id=execution_id)
    await _run_tier(tier_direct, run_store)
    _activity(
        store,
        run_id,
        emit,
        f"Auto-fill complete: {_counts_text(_cell_state_counts(store, run_id))}.",
        execution_id=execution_id,
    )

    # 3. Still open? check unresolved values.
    if run_store.open_cells():
        _activity(store, run_id, emit, "Checking unresolved values.", execution_id=execution_id)
        await _run_tier(tier_llm, run_store)
        _activity(
            store,
            run_id,
            emit,
            f"Unresolved check complete: {_counts_text(_cell_state_counts(store, run_id))}.",
            execution_id=execution_id,
        )

    # 4. Still open? investigate remaining missing values.
    if run_store.open_cells():
        _activity(store, run_id, emit, "Investigating remaining missing values.", execution_id=execution_id)
        await _run_tier(tier_agent, run_store)
        _activity(
            store,
            run_id,
            emit,
            f"Missing-value investigation complete: {_counts_text(_cell_state_counts(store, run_id))}.",
            execution_id=execution_id,
        )

    # 5. Status is derived from the persisted cells (never the stream); emit
    #    terminal review_summary, then done.
    _activity(
        store,
        run_id,
        emit,
        f"Finalizing results: {_counts_text(_cell_state_counts(store, run_id))}.",
        execution_id=execution_id,
    )
    store.recompute_status(run_id)
    review_summary = build_review_summary_event(store.get_cells(run_id))
    store.append_event(Event(
        run_id=run_id,
        type="review_summary",
        payload=event_payload(review_summary),
    ))
    if emit is not None:
        emit(review_summary)
        emit({"type": "done"})


def new_run_id() -> str:
    return "run-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:4]
