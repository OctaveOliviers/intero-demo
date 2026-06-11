"""LEGACY COMPATIBILITY PATH — execution-plane seam.

This module is retained for compatibility with the legacy runner seam
(``JobRunner`` / ``OpenCodeRunner``). It is not the primary implementation
surface for new run-stream features.

Canonical primary path:
- ``core/running/orchestrator.py`` (spine orchestration, milestones, terminal
  summary contract).
- ``server/routes/runs.py`` spine startup path (``_start_spine_run``) for
  lifecycle ownership.

Scope control:
- New feature work should target the canonical orchestrator/spine path unless
  explicit approval is given to extend this legacy compatibility path.
- `review_summary` in this legacy path is best-effort from ``metadata.json``
  only; completeness is not authoritative for product-critical decisions.
- Compatibility in this module is intentionally retained during migration, but
  deprecation of this path remains the long-term direction.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any, AsyncIterator, Optional, Protocol

from core.clients.opencode_client import OpenCodeClient
from core.running.events import build_review_summary_event
from core.running.workbook_stream import read_workbook_sheets
from core.store import Cell

logger = logging.getLogger(__name__)

# How often the runner polls the run dir for workbook/cell progress while the
# agent works, translating the files it writes into W0.3 SSE events.
_WATCH_INTERVAL = 0.5


class JobRunner(Protocol):
    async def start(self, run_id: str, run_dir: Path, prompt: str, db_path: Path | None) -> None: ...

    async def stop(self, run_id: str) -> bool: ...

    def stream_events(self, run_id: str) -> AsyncIterator[dict]: ...

    def reserve(self, run_id: str, run_dir: Path) -> None: ...

    async def publish(self, run_id: str, event: dict) -> None: ...

    async def fail(self, run_id: str, message: str) -> None: ...

    def agent_client(self) -> Any | None: ...


def _write_status(run_dir: Path, status: str, detail: str | None = None) -> None:
    payload: dict[str, Any] = {"status": status}
    if detail:
        payload["detail"] = detail
    try:
        (run_dir / "status.json").write_text(json.dumps(payload), encoding="utf-8")
    except OSError:
        pass


def _backfill_metadata_database(run_dir: Path, database: str | None) -> None:
    """Stamp the run's resolved database path onto every provenance cell.

    Provenance lives in ``metadata.json`` (cell → {value, sql, database}), but
    the agent isn't required to echo the database into each tool call, so cells
    can land without one. Clicking such a cell hits /api/sql with no database
    and gets a 422. Rather than keep the path in a second file, we fill in the
    missing per-cell ``database`` here once the run finishes, so the workbook's
    metadata stays the single, self-contained source of cell provenance.
    """
    if not database:
        return
    metadata_path = run_dir / "metadata.json"
    if not metadata_path.exists():
        return
    try:
        raw = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return
    if not isinstance(raw, dict):
        return
    changed = False
    for entry in raw.values():
        if isinstance(entry, dict) and entry.get("sql") and not entry.get("database"):
            entry["database"] = database
            changed = True
    if changed:
        try:
            metadata_path.write_text(
                json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except OSError:
            pass


# --- workbook progress → W0.3 SSE events -----------------------------------
#
# The agent populates the workbook by writing files into the run dir, not over
# the SSE stream: ``result.xlsx`` (copied in by the transport before the run
# starts, so it exists from the first tick — structured, body-empty) and a
# ``metadata.json`` sidecar (keyed ``"Sheet!A1" -> {value, sql, …}``) that grows
# as regions fill. The runner watches those files and emits the two file-driven
# events of the W0.3 contract (`runtime-shapes.md` §1): ``workbook_created``
# once, seconds in (drives the file chip — never deferred to ``done``), and
# ``cell_update`` batches as cells land. Per-cell ``meta`` is passed through
# verbatim — its shape (§2) is Lane A's to produce.

def read_cell_metadata(run_dir: Path) -> dict:
    """The ``metadata.json`` sidecar as a dict, or ``{}`` if absent/malformed."""
    metadata_path = run_dir / "metadata.json"
    if not metadata_path.exists():
        return {}
    try:
        raw = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    return raw if isinstance(raw, dict) else {}


def cell_updates_from_metadata(metadata: dict, seen: set[str]) -> list[dict]:
    """New sidecar entries → one ``cell_update`` event per sheet.

    Each populated cell becomes ``{ref, value, meta}`` (``meta`` is the sidecar
    entry, passed through). A value-less (blocked) entry omits ``value``.
    ``seen`` is mutated with the keys emitted, so subsequent calls only carry
    cells that landed since — the stream never re-sends a cell.
    """
    by_sheet: dict[str, list[dict]] = {}
    for key, entry in metadata.items():
        if key in seen or "!" not in key or not isinstance(entry, dict):
            continue
        # Only real populated cells carry provenance or a value; skip anything else.
        if not (entry.get("sql") or entry.get("value") is not None or entry.get("state")):
            continue
        sheet, ref = key.split("!", 1)
        cell: dict = {"ref": ref}
        if entry.get("value") is not None:
            cell["value"] = entry["value"]
        cell["meta"] = entry
        by_sheet.setdefault(sheet, []).append(cell)
        seen.add(key)
    return [
        {"type": "cell_update", "sheet": sheet, "cells": cells}
        for sheet, cells in by_sheet.items()
    ]


def review_summary_from_metadata(run_id: str, metadata: dict) -> dict:
    """Build a strict-v2 ``review_summary`` from workbook metadata sidecar.

    Legacy-path compatibility behavior (F3, option B): this derivation is
    intentionally best-effort and only reflects entries present in
    ``metadata.json``. If the sidecar is partial, totals are a lower bound.
    The canonical authoritative completeness path is orchestrator/store-backed
    summary assembly in ``core.running.orchestrator``.
    """
    cells: list[Cell] = []
    for key, entry in metadata.items():
        if "!" not in key or not isinstance(entry, dict):
            continue
        if not (entry.get("sql") or entry.get("value") is not None or entry.get("state")):
            continue
        state = entry.get("state")
        if state is None:
            state = "filled" if entry.get("value") is not None else "blocked"
        review_state = entry.get("review_state")
        # Legacy sidecars may carry the retired stored `needs_verification`
        # state; normalize to the derived model (doc 5 §Cell state model, T13):
        # filled + review_state not_reviewed.
        if state == "needs_verification":
            state = "filled"
            review_state = review_state or "not_reviewed"
        cells.append(
            Cell(
                run_id=run_id,
                ref=key,
                field=entry.get("field"),
                member=entry.get("member"),
                state=state,
                confidence=entry.get("confidence"),
                review_state=review_state,
                corrected=entry.get("corrected"),
                reason_code=entry.get("reason_code"),
                reason_detail=entry.get("reason_detail"),
                explanation=entry.get("explanation"),
                hypothesis=entry.get("hypothesis"),
            )
        )
    return build_review_summary_event(cells)


# --- opencode server runner ------------------------------------------------

def normalize_server_event(event: dict, part_types: dict[str, str] | None = None) -> dict | None:
    """Map one opencode SSE event to strict-v2 run-stream events.

    The run-stream contract allows only ``activity``, ``workbook_created``,
    ``cell_update``, ``review_summary``, ``done``, and ``error``. This mapper
    translates opencode part updates into ``activity`` and drops delta-level
    transport events.
    """
    etype = event.get("type")
    props = event.get("properties") or {}

    if etype == "message.part.delta":
        # Strict v2 does not expose per-token delta parts in the run stream.
        return None

    if etype == "message.part.updated":
        part = props.get("part") or {}
        ptype = part.get("type")
        part_id = part.get("id")
        if part_types is not None and part_id and ptype:
            part_types[part_id] = ptype
        if ptype == "text":
            text = (part.get("text") or "").strip()
            return {
                "type": "activity",
                "headline": "Updating run activity.",
                "detail": text,
            } if text else None
        if ptype in ("reasoning", "thinking"):
            text = (part.get("text") or "").strip()
            return {
                "type": "activity",
                "headline": "Thinking through remaining fields.",
                "detail": text,
            } if text else None
        if ptype == "tool":
            name = part.get("tool") or "tool"
            state = part.get("state") if isinstance(part.get("state"), dict) else {}
            status = state.get("status")
            return {
                "type": "activity",
                "headline": f"Running tool: {name}.",
                "name": name,
                "status": status,
            }
        logger.debug("normalize_server_event: unhandled part type=%r", ptype)
        return None

    if etype == "session.error":
        err = props.get("error") or {}
        msg = err.get("message") or err.get("name") or "session error"
        return {"type": "error", "message": str(msg)}

    logger.debug("normalize_server_event: unhandled event type=%r", etype)
    return None


class _ServerRunState:
    def __init__(self, run_dir: Path, session_id: str) -> None:
        self.queue: asyncio.Queue[dict] = asyncio.Queue()
        self.status: str = "running"
        self.session_id: str = session_id
        self.task: asyncio.Task | None = None
        self.done: bool = False
        self.run_dir: Path = run_dir
        # Resolved (absolute) database path for this run, stamped onto cell
        # metadata at completion so the workbook is self-contained.
        self.db_path: Path | None = None
        # Workbook-progress watcher (emits workbook_created + cell_update) and
        # the bookkeeping it carries: has the chip fired, and which cells have
        # already streamed (so a cell is never re-sent).
        self.watch_task: asyncio.Task | None = None
        self.workbook_emitted: bool = False
        self.emitted_cells: set[str] = set()
        self.review_summary_emitted: bool = False


class OpenCodeRunner:
    """Runs each audit as a session against a persistent opencode HTTP server."""

    def __init__(self, client: OpenCodeClient) -> None:
        self._client = client
        self._runs: dict[str, _ServerRunState] = {}
        self._reserved: dict[str, _ServerRunState] = {}

    def reserve(self, run_id: str, run_dir: Path) -> None:
        if run_id in self._reserved:
            return
        existing = self._runs.get(run_id)
        if existing is not None and not existing.done:
            return
        state = _ServerRunState(run_dir, session_id="")
        if existing is not None:
            self._runs.pop(run_id, None)
        self._reserved[run_id] = state
        _write_status(run_dir, "running")

    def agent_client(self) -> Any | None:
        return self._client

    async def publish(self, run_id: str, event: dict) -> None:
        state = self._reserved.get(run_id) or self._runs.get(run_id)
        if state is not None and not state.done:
            etype = event.get("type")
            if etype == "review_summary":
                if state.review_summary_emitted:
                    msg = "duplicate review_summary event"
                    _write_status(state.run_dir, "error", msg)
                    state.status = "error"
                    state.done = True
                    await state.queue.put({"type": "error", "message": msg})
                    self._runs[run_id] = state
                    self._reserved.pop(run_id, None)
                    return
                state.review_summary_emitted = True
            if etype == "done" and not state.review_summary_emitted:
                msg = "done emitted before review_summary"
                _write_status(state.run_dir, "error", msg)
                state.status = "error"
                state.done = True
                await state.queue.put({"type": "error", "message": msg})
                self._runs[run_id] = state
                self._reserved.pop(run_id, None)
                return
            await state.queue.put(event)
            if etype in ("done", "error"):
                state.done = True
                if etype == "error":
                    state.status = "error"
                elif state.status == "running":
                    state.status = "completed"
                self._runs[run_id] = state
                self._reserved.pop(run_id, None)

    async def fail(self, run_id: str, message: str) -> None:
        state = self._reserved.pop(run_id, None) or self._runs.get(run_id)
        if state is None:
            return
        if state.watch_task is not None and not state.watch_task.done():
            state.watch_task.cancel()
        state.status = "error"
        state.done = True
        _write_status(state.run_dir, "error", message)
        await state.queue.put({"type": "error", "message": message})
        self._runs[run_id] = state

    async def start(self, run_id: str, run_dir: Path, prompt: str, db_path: Path | None) -> None:
        # Reuse the reserved state (and its queue) if we pre-created one, so the
        # SSE consumer keeps the same queue handle across the gate.
        state = self._reserved.pop(run_id, None) or _ServerRunState(run_dir, session_id="")
        state.db_path = db_path
        self._runs[run_id] = state
        _write_status(run_dir, "running")

        # The database path is conveyed to the agent as DATABASE_PATH inside the
        # prompt's Configuration section (an absolute, ready-to-use path). We do
        # not prepend a separate CLINICAL_SQLITE_DB line — a single source of
        # truth avoids the agent reconciling two differently-formatted paths.

        try:
            session_id = await self._client.create_session(title=run_id)
        except Exception as exc:
            _write_status(run_dir, "error", f"failed to create opencode session: {exc}")
            state.status = "error"
            state.done = True
            await state.queue.put({"type": "error", "message": f"failed to create session: {exc}"})
            return

        state.session_id = session_id
        sub_queue = await self._client.subscribe(session_id)
        state.task = asyncio.create_task(self._pump(run_id, state, sub_queue))
        # Watch the run dir for the workbook + filled cells the agent writes,
        # translating them into workbook_created / cell_update events alongside
        # the reasoning stream the pump forwards.
        state.watch_task = asyncio.create_task(self._watch(run_id, state))

        try:
            await self._client.prompt_async(session_id, prompt)
        except Exception as exc:
            await state.queue.put({"type": "error", "message": f"failed to send prompt: {exc}"})
            _write_status(run_dir, "error", str(exc))
            state.status = "error"
            state.done = True

    async def _pump(self, run_id: str, state: _ServerRunState, sub_queue: asyncio.Queue[dict]) -> None:
        # partID -> part type, learned from snapshot events so streaming deltas
        # (which omit the type) can be labelled text vs. thinking.
        part_types: dict[str, str] = {}
        try:
            while True:
                event = await sub_queue.get()
                etype = event.get("type")

                if etype == "session.idle":
                    self._finish(run_id, state)
                    return

                normalized = normalize_server_event(event, part_types)
                if normalized is None:
                    continue
                if normalized["type"] == "error":
                    _write_status(state.run_dir, "error", normalized.get("message", ""))
                    state.status = "error"
                    state.done = True
                    await state.queue.put(normalized)
                    return
                await state.queue.put(normalized)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            msg = f"stream error: {exc}"
            _write_status(state.run_dir, "error", msg)
            state.status = "error"
            state.done = True
            await state.queue.put({"type": "error", "message": msg})
        finally:
            await self._client.unsubscribe(state.session_id)
            # Best-effort cleanup; ignore failures.
            asyncio.create_task(self._client.delete_session(state.session_id))

    def _emit_progress(self, run_id: str, state: _ServerRunState) -> None:
        """Translate the run dir's current state into W0.3 SSE events.

        Emits ``workbook_created`` once (as soon as ``result.xlsx`` exists, so
        the chip fires seconds in) followed by a ``cell_update`` per sheet for
        every cell that has landed since the last call. Safe to call repeatedly
        — it only ever emits new cells — and on every tick of the watcher as
        well as one final time at finish to flush the last region.
        """
        if state.done:
            return
        result_path = state.run_dir / "result.xlsx"
        if not state.workbook_emitted and result_path.exists():
            try:
                sheets = read_workbook_sheets(result_path)
            except Exception as exc:  # a transient mid-write read; retry next tick
                logger.debug("workbook not yet readable for %s: %s", run_id, exc)
                return
            state.workbook_emitted = True
            state.queue.put_nowait({
                "type": "workbook_created",
                "label": "result.xlsx",
                "sheets": sheets,
                "cellMetadata": {},
            })
        if not state.workbook_emitted:
            return
        for event in cell_updates_from_metadata(read_cell_metadata(state.run_dir), state.emitted_cells):
            state.queue.put_nowait(event)

    async def _watch(self, run_id: str, state: _ServerRunState) -> None:
        try:
            while not state.done:
                self._emit_progress(run_id, state)
                await asyncio.sleep(_WATCH_INTERVAL)
        except asyncio.CancelledError:
            raise

    def _finish(self, run_id: str, state: _ServerRunState) -> None:
        # Stop the watcher and do one last synchronous flush so no region that
        # landed between ticks is dropped, then emit the terminal event.
        if state.watch_task is not None and not state.watch_task.done():
            state.watch_task.cancel()
        result_ok = (state.run_dir / "result.xlsx").exists()
        if result_ok:
            _backfill_metadata_database(state.run_dir, str(state.db_path) if state.db_path else None)
            self._emit_progress(run_id, state)
            summary = review_summary_from_metadata(run_id, read_cell_metadata(state.run_dir))
            state.queue.put_nowait(summary)
            state.review_summary_emitted = True
            _write_status(state.run_dir, "completed")
            state.status = "completed"
            # The chip already fired on workbook_created — review_summary then done.
            state.queue.put_nowait({"type": "done"})
        else:
            _write_status(state.run_dir, "error", "agent finished without producing result.xlsx")
            state.status = "error"
            state.queue.put_nowait({"type": "error", "message": "agent finished without producing result.xlsx"})
        state.done = True

    async def stop(self, run_id: str) -> bool:
        state = self._runs.get(run_id) or self._reserved.get(run_id)
        if state is None or state.done:
            return False
        if state.watch_task is not None and not state.watch_task.done():
            state.watch_task.cancel()
        if state.session_id:
            await self._client.abort_session(state.session_id)
        if state.task is not None and not state.task.done():
            state.task.cancel()
            try:
                await state.task
            except asyncio.CancelledError:
                pass
        state.status = "stopped"
        state.done = True
        await state.queue.put({"type": "error", "message": "Run stopped by user."})
        _write_status(state.run_dir, "stopped", "Stopped by user.")
        self._reserved.pop(run_id, None)
        self._runs[run_id] = state
        return True

    async def stream_events(self, run_id: str) -> AsyncIterator[dict]:
        state = self._runs.get(run_id) or self._reserved.get(run_id)
        if state is None:
            yield {"type": "error", "message": f"unknown run: {run_id}"}
            return
        while True:
            event = await state.queue.get()
            yield event
            if event.get("type") in ("done", "error"):
                return


# Set by main.py at startup once the opencode server + client are ready.
runner: Optional[JobRunner] = None
