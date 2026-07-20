"""Canonical table-population event transport for `/api/table-populations/{id}/events`.

This module owns table-population session transport concerns: open/publish/abort
and event streaming, plus agent-client access for the table-agent setup.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from pathlib import Path
from typing import Any, AsyncIterator, Optional

from core.store import Store

logger = logging.getLogger(__name__)

# The lifecycle transitions past which no further transition follows. Losing
# one of these to state-DB lock contention is what stranded a finished
# population at 'running' forever (issue #329), so these are RETRIED and their
# ultimate failure is logged at error level — never silently dropped. A
# non-terminal 'running'/'queued' write stays best-effort (it is followed by a
# terminal one that carries the durable truth).
_TERMINAL_STATUSES = frozenset({"completed", "error", "stopped"})

# Bounded retry for a terminal transition contending on the shared state DB.
_TERMINAL_WRITE_ATTEMPTS = 5
_TERMINAL_WRITE_BACKOFF_SECONDS = 0.05


# Population lifecycle fail-safe marker. ``population_status_of`` returns this
# (NOT "running") for a missing run row or an unrecorded lifecycle status, so a
# finished run is never silently reported as still working (bug #13).
STATUS_UNKNOWN = "unknown"

# Upper bound on FINISHED (done/error/aborted) sessions kept in ``_sessions``
# (bug #2, concern B). open_session already evicts a finished session when its
# SAME id is re-opened, but a population that runs once and is never re-opened —
# and every aborted/deleted one — would otherwise park its terminal state for
# the process lifetime, so across many DISTINCT ids the map grew unbounded.
# Each terminal transition reaps the oldest finished sessions past this cap.
# A reopen still creates a fresh live session for any id, so a reaped done id
# simply re-streams live on its next refresh (reconnect-after-done is preserved).
_MAX_FINISHED_SESSIONS = 32


def _open_status_store() -> Store:
    """The Store session the canonical writer lands the lifecycle through.

    A module-level seam so tests can point the writer at a scratch store. The
    default opens the deployment state DB as ``api_app`` — the process status
    is owned by the server/session-transport layer, never by the orchestrator
    or the agent (core/store/runtime_permissions.py).
    """
    return Store(runtime_role="api_app")


# A single long-lived Store handle for the transition writer, opened lazily on
# the first transition and reused for every subsequent one (issue #329). The
# retired per-call ``Store(...)`` re-ran schema init — ``executescript(SCHEMA)``
# with its DROP/CREATE TRIGGER and full-table cells UPDATE — under a write lock
# on EVERY transition, slowing each write and worsening the very lock
# contention the swallow then hid. Reusing one handle pays that cost once. Keyed
# on the seam function identity so a test that patches ``_open_status_store``
# (pointing the writer at a scratch DB) transparently gets a fresh handle.
_status_store_lock = threading.Lock()
_status_store: Store | None = None
_status_store_opener: Any | None = None


def _status_store_handle() -> Store:
    """Return the reused writer Store, (re)opening it if absent or if the seam
    (``_open_status_store``) was repointed since it was opened."""
    global _status_store, _status_store_opener
    if _status_store is None or _status_store_opener is not _open_status_store:
        if _status_store is not None:
            try:
                _status_store.close()
            except Exception:
                pass
        _status_store = _open_status_store()
        _status_store_opener = _open_status_store
    return _status_store


def _reset_status_store_handle() -> None:
    """Drop the cached writer handle (a stale handle after a store error is
    reopened on the next transition). Safe to call with no handle open."""
    global _status_store, _status_store_opener
    with _status_store_lock:
        if _status_store is not None:
            try:
                _status_store.close()
            except Exception:
                pass
        _status_store = None
        _status_store_opener = None


def shutdown_status_writer() -> None:
    """Close the long-lived lifecycle-writer store handle (issue #3).

    The writer reuses one handle for the process lifetime; the server's
    shutdown must close it so it does not leak / emit ``ResourceWarning:
    unclosed database``. Safe to call with no handle open; the next transition
    lazily reopens one."""
    _reset_status_store_handle()


def _write_status_once(
    run_id: str,
    status: str,
    *,
    detail: str | None,
    result_status: str | None,
) -> None:
    """One locked lifecycle write through the reused handle. Raises on failure;
    the caller resets the poisoned handle and decides whether to retry."""
    with _status_store_lock:
        _status_store_handle().record_population_status(
            run_id, status, detail=detail, result_status=result_status
        )


def _log_status_write_failure(
    run_id: str,
    status: str,
    *,
    terminal: bool,
    attempts: int,
    exc: Exception | None,
) -> None:
    if terminal:
        # A dropped terminal is the #329 stranding bug — surface it loudly. It
        # is still not raised (a bookkeeping write must not kill the caller),
        # but ERROR (not WARNING) so the stuck-at-running population is
        # traceable. See the KNOWN GAP note on ``population_status_of``:
        # staleness recovery for an already-lost terminal is deferred (#329).
        logger.error(
            "TERMINAL population status %r for %s was NOT recorded after %d "
            "attempts; the run may be stranded reporting 'running'",
            status,
            run_id,
            attempts,
            exc_info=exc,
        )
    else:
        logger.warning(
            "failed to record population status %r for %s",
            status,
            run_id,
            exc_info=exc,
        )


def record_status(
    run_id: str,
    status: str,
    *,
    detail: str | None = None,
    result_status: str | None = None,
) -> None:
    """The SINGLE canonical writer of the population process status (bug #13).

    Lands the transition on the run row's ``population_status`` record
    (``Store.record_population_status``) — the ONLY lifecycle record since
    issue #326 retired the per-run-dir status.json (status / detail replace on
    every transition; ``result_status`` is PRESERVED when a transition supplies
    none, issue #330). Both the relay's internal transitions
    (open/abort/close-with-error) and the route layer write through here so the
    record can never end up with two divergent shapes.

    Durability (issue #329): the writer reuses ONE long-lived Store handle
    (``_status_store_handle``) instead of opening a fresh one — that fresh open
    re-ran full schema init under a write lock on every transition, worsening
    the state-DB lock contention. A TERMINAL transition
    (completed/error/stopped) is the last chance to move the run off 'running';
    losing it stranded a finished population at 'running' forever (the refresh
    gate 409s permanently). So terminals are RETRIED with a short backoff, the
    cached handle is dropped and reopened between attempts, and a definitive
    failure is logged at ERROR level — never silently dropped. A non-terminal
    ('running'/'queued') write stays best-effort: it is always followed by a
    terminal one carrying the durable truth. Either way a store failure is
    swallowed, never raised — a bookkeeping write must not kill a live
    population mid-run.

    A FRESH population's ``open_session`` fires before the session executor
    creates the run row, so that first 'running' has nowhere to land — the
    executor compensates by creating the row already stamped
    ``population_status='running'``.
    """
    terminal = status in _TERMINAL_STATUSES
    attempts = _TERMINAL_WRITE_ATTEMPTS if terminal else 1
    last_exc: Exception | None = None
    for attempt in range(attempts):
        try:
            _write_status_once(
                run_id, status, detail=detail, result_status=result_status
            )
            return
        except Exception as exc:  # store unavailable or write lost to a lock
            last_exc = exc
            # The cached handle may be poisoned by the failure; drop it so the
            # next attempt (and any later transition) opens a clean one.
            _reset_status_store_handle()
            if terminal and attempt + 1 < attempts:
                time.sleep(_TERMINAL_WRITE_BACKOFF_SECONDS)
    _log_status_write_failure(
        run_id, status, terminal=terminal, attempts=attempts, exc=last_exc
    )


async def record_status_async(
    run_id: str,
    status: str,
    *,
    detail: str | None = None,
    result_status: str | None = None,
) -> None:
    """The async lifecycle writer — same durability guarantees as
    :func:`record_status`, but the terminal-retry backoff is ``await
    asyncio.sleep`` rather than a blocking ``time.sleep`` so a contended
    terminal write never stalls the event loop (issue #2).

    EVERY terminal transition reached from an async context writes through
    here: the relay's ``close_session_with_error`` / ``abort_session`` and the
    population finalizers (core.table_population.populate). The single reused
    store handle keeps this on the one thread, so no cross-thread SQLite access
    is introduced (issue #4). The synchronous :func:`record_status` remains for
    the one sync caller (``open_session`` stamping the non-terminal
    ``running``, which never sleeps).
    """
    terminal = status in _TERMINAL_STATUSES
    attempts = _TERMINAL_WRITE_ATTEMPTS if terminal else 1
    last_exc: Exception | None = None
    for attempt in range(attempts):
        try:
            _write_status_once(
                run_id, status, detail=detail, result_status=result_status
            )
            return
        except Exception as exc:  # store unavailable or write lost to a lock
            last_exc = exc
            _reset_status_store_handle()
            if terminal and attempt + 1 < attempts:
                await asyncio.sleep(_TERMINAL_WRITE_BACKOFF_SECONDS)
    _log_status_write_failure(
        run_id, status, terminal=terminal, attempts=attempts, exc=last_exc
    )


def population_status_of(run: Any | None) -> str:
    """The population process status of a run row — the canonical READER.

    Every consumer keys on the state store's ``runs.population_status`` record
    (written by :func:`record_status`). Takes the run row (or ``None``) rather
    than opening a store: every reading surface already holds one.

    Fail-safe (bug #13): a missing run row, or a row with no recorded
    lifecycle status, reads back as :data:`STATUS_UNKNOWN` — NEVER "running".
    A recorded ``running`` from a crashed process is trusted VERBATIM — no
    staleness detection here (the crash lockout the characterization tests
    pin; startup reconciliation is a separate, deliberate change).

    KNOWN RESIDUAL GAP: a FRESH population cancelled after ``open_session``
    but before the session executor created its run row has no record — that
    edge reads back as :data:`STATUS_UNKNOWN` rather than ``stopped``.
    Unpinned by any test; both values deny refresh and report a non-running
    population.
    """
    status = getattr(run, "population_status", None) if run is not None else None
    return status if isinstance(status, str) and status else STATUS_UNKNOWN


def adopt_legacy_status_files(runs_dir: Path | None = None) -> int:
    """One-time startup adoption of pre-#326 ``status.json`` files (idempotent).

    Populations that finished BEFORE the lifecycle record existed have a
    ``<artifact_id>/status.json`` but a NULL ``runs.population_status`` — read
    through the store alone they'd report 'unknown' (losing their workbook
    chip and refreshability). This scans every artifact workspace once at
    startup (server/main.py, right after ``import_legacy_table_files`` — the
    same
    adopt-then-never-write-again precedent) and copies each such file's
    payload (status / detail / result_status) onto its run row.

    Idempotent: a row that already carries ANY population_status is never
    touched, so the second startup is a no-op. Tolerant: a malformed file, an
    off-vocabulary status, or a file with no matching run row is skipped (and
    logged) — never fatal to startup. The adopted files are left on disk as
    inert bytes: nothing writes or reads them any more, and deleting user data
    dirs' contents is not this migration's job. Returns the number of rows
    adopted.
    """
    if runs_dir is None:
        from core.config import ARTIFACTS_DIR

        runs_dir = ARTIFACTS_DIR
    if not runs_dir.is_dir():
        return 0
    try:
        store = _open_status_store()
    except Exception:
        logger.warning(
            "legacy status adoption skipped: state store unavailable", exc_info=True
        )
        return 0
    adopted = 0
    try:
        for status_path in sorted(runs_dir.glob("*/status.json")):
            run_id = status_path.parent.name
            try:
                run = store.get_run(run_id)
                if run is None or run.population_status:
                    continue  # no row to adopt onto / already recorded
                payload = json.loads(status_path.read_text(encoding="utf-8"))
                if not isinstance(payload, dict):
                    raise ValueError("status.json payload is not an object")
                status = payload.get("status")
                if not isinstance(status, str) or not status:
                    raise ValueError("status.json has no usable status")
                store.record_population_status(
                    run_id,
                    status,
                    detail=payload.get("detail"),
                    result_status=payload.get("result_status"),
                )
                adopted += 1
            except Exception:
                logger.warning(
                    "legacy status.json for %s not adopted; skipping",
                    run_id,
                    exc_info=True,
                )
    finally:
        store.close()
    return adopted


class _SessionState:
    def __init__(self, artifact_dir: Path):
        self.queue: asyncio.Queue[dict] = asyncio.Queue()
        self.status: str = "running"
        self.done: bool = False
        self.artifact_dir: Path = artifact_dir
        self.review_summary_emitted: bool = False
        # Set by request_graceful_stop (user pause): a cooperative signal the
        # table-population session executor reads
        # in its CancelledError handler to FINALIZE gracefully (emit a
        # review_summary + done) rather than error out. Distinct from abort_session(),
        # which hard-kills with an error (the delete path).
        self.stop_requested: bool = False


class TablePopulationSessionRelay:
    def __init__(self, agent_client: Any | None = None) -> None:
        self._agent_client = agent_client
        self._sessions: dict[str, _SessionState] = {}
        self._reserved: dict[str, _SessionState] = {}
        # Insertion-ordered ids of FINISHED sessions parked in ``_sessions``,
        # oldest first — drives the bounded reap (bug #2, concern B).
        self._finished_order: list[str] = []

    def agent_client(self) -> Any | None:
        return self._agent_client

    def _park_finished(self, table_population_id: str, state: _SessionState) -> None:
        """Park a terminal session in ``_sessions`` and reap the oldest beyond the
        cap so the finished map stays bounded across distinct ids (bug #2, concern
        B). Re-parking an id refreshes its position to newest. Reaping only ever
        drops an already-finished session; a later reopen still creates a fresh
        live one, so a reaped done id simply re-streams live on its next refresh.
        """
        self._sessions[table_population_id] = state
        # Move this id to the newest position.
        if table_population_id in self._finished_order:
            self._finished_order.remove(table_population_id)
        self._finished_order.append(table_population_id)
        while len(self._finished_order) > _MAX_FINISHED_SESSIONS:
            oldest = self._finished_order.pop(0)
            self._sessions.pop(oldest, None)

    def open_session(self, table_population_id: str, artifact_dir: Path) -> None:
        # A live (not-done) session for this id is already streaming — leave it.
        if table_population_id in self._reserved:
            return
        existing = self._sessions.get(table_population_id)
        if existing is not None and not existing.done:
            return
        # Re-opening an id whose prior session FINISHED (a refresh / re-run reuses
        # the same id): EVICT the stale done state so a fresh session is created.
        # Without this, publish_session_event drops every cell_update (state.done)
        # and stream_session_events replays the prior terminal frame — the live
        # update path is dead until a manual reload. Eviction here also bounds the
        # session map: finished sessions don't accumulate across re-runs.
        if self._sessions.pop(table_population_id, None) is not None:
            # The id is now LIVE again, not a parked finished session — drop it
            # from the reap order so a later reap can't touch the live session.
            if table_population_id in self._finished_order:
                self._finished_order.remove(table_population_id)
        self._reserved[table_population_id] = _SessionState(artifact_dir)
        record_status(table_population_id, "running")

    async def publish_session_event(
        self, table_population_id: str, event: dict
    ) -> None:
        state = self._reserved.get(table_population_id) or self._sessions.get(
            table_population_id
        )
        if state is None or state.done:
            return
        etype = event.get("type")
        if etype == "review_summary":
            if state.review_summary_emitted:
                await self.close_session_with_error(
                    table_population_id, "duplicate review_summary event"
                )
                return
            state.review_summary_emitted = True
        if etype == "done" and not state.review_summary_emitted:
            await self.close_session_with_error(
                table_population_id, "done emitted before review_summary"
            )
            return
        await state.queue.put(event)
        if etype in ("done", "error"):
            state.done = True
            if etype == "error":
                state.status = "error"
            elif state.status == "running":
                state.status = "completed"
            self._reserved.pop(table_population_id, None)
            self._park_finished(table_population_id, state)

    async def close_session_with_error(
        self, table_population_id: str, message: str
    ) -> None:
        state = self._reserved.pop(table_population_id, None) or self._sessions.get(
            table_population_id
        )
        if state is None:
            return
        state.status = "error"
        state.done = True
        await record_status_async(table_population_id, "error", detail=message)
        await state.queue.put({"type": "error", "message": message})
        self._park_finished(table_population_id, state)

    async def abort_session(self, table_population_id: str) -> bool:
        state = self._sessions.get(table_population_id) or self._reserved.get(
            table_population_id
        )
        if state is None or state.done:
            return False
        # Abort OVERRIDES a prior pause: clear stop_requested so the session
        # task's CancelledError handler does NOT see is_stop_requested()==True and
        # finalize a deleted run as 'completed' (bug #7). A delete is a hard kill,
        # not a graceful finish.
        state.stop_requested = False
        state.status = "stopped"
        state.done = True
        await record_status_async(
            table_population_id, "stopped", detail="Stopped by user."
        )
        await state.queue.put(
            {"type": "error", "message": "Table population stopped by user."}
        )
        self._reserved.pop(table_population_id, None)
        self._park_finished(table_population_id, state)
        return True

    def request_graceful_stop(self, table_population_id: str) -> bool:
        """Cooperative stop for a USER PAUSE: flag the session so the executor finalizes
        with a summary instead of erroring. Unlike :meth:`abort_session`, this does NOT
        mark the session done or push a terminal event — the CancelledError
        handler still owns emitting ``review_summary`` + ``done`` (so the relay's
        "review_summary precedes done" invariant holds). Returns True if a live
        session was flagged, False if it was unknown/already finished."""
        state = self._sessions.get(table_population_id) or self._reserved.get(
            table_population_id
        )
        if state is None or state.done:
            return False
        state.stop_requested = True
        return True

    def is_stop_requested(self, table_population_id: str) -> bool:
        state = self._sessions.get(table_population_id) or self._reserved.get(
            table_population_id
        )
        return state is not None and state.stop_requested

    async def stream_session_events(
        self, table_population_id: str
    ) -> AsyncIterator[dict]:
        state = self._sessions.get(table_population_id) or self._reserved.get(
            table_population_id
        )
        if state is None:
            yield {
                "type": "error",
                "message": f"unknown table population: {table_population_id}",
            }
            return
        while True:
            # A client reconnecting to a session whose events were already drained
            # by the original consumer (e.g. a page reload after the run
            # finished) must not block forever on an empty queue. If the session is
            # already terminal and nothing is buffered, synthesize the terminal
            # event so the client stops cleanly and keeps its fetched snapshot.
            # A still-running session, or one with buffered events, falls through to
            # the normal blocking drain — so a live reload streams future events
            # and a fast first-connect still gets everything the queue holds.
            if state.done and state.queue.empty():
                if state.status == "error":
                    yield {
                        "type": "error",
                        "message": "table population already finished",
                    }
                else:
                    yield {"type": "done"}
                return
            event = await state.queue.get()
            yield event
            if event.get("type") in ("done", "error"):
                return


# Runtime singleton set by `core.runtime.Runtime.startup`.
session_relay: Optional[TablePopulationSessionRelay] = None
