import asyncio
import json
import logging
import shutil
from typing import Any
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from core import table_population
from core.table_population.table_population_sessions import (
    population_status_of,
    record_status_async,
)

# TEMPLATES_DIR is unused by the route itself since ingredient derivation moved
# into core (populate_table assembles from the request identity); it stays
# importable as the patch point server/test/templates_run_unaffected_test.py pins
# (the run engine reads specs straight from disk, never via the gated route).
from core.config import ARTIFACTS_DIR, TEMPLATES_DIR  # noqa: F401
from core.store import (
    Event,
    Run,
    RunExecution,
    RuntimePermissionDenied,
    Store,
)
from core.tables import store as core_table_store
from core.tables.store import TableError
from server.auth import grants as grant_store
from server.auth import permissions as authz
from server.auth import store as auth_store
from server.auth.deps import current_user, current_user_id
from server.models import (
    ChipMessage,
    TablePopulationCellEditRequest,
    TablePopulationCellEditResponse,
    TablePopulationCreateFromAuditRequest,
    TablePopulationCreateResponse,
    TablePopulationRefreshResponse,
    TablePopulationStateResponse,
    TextMessage,
)

router = APIRouter()
logger = logging.getLogger(__name__)
_TABLE_POPULATION_SESSION_TASKS: dict[str, asyncio.Task[None]] = {}
_REFRESHABLE_TABLE_POPULATION_STATUSES = {"completed"}
_REFRESH_START_LOCKS: dict[str, asyncio.Lock] = {}


# The run engine reads audit artifacts straight from disk — kept as the seam
# server/test/templates_run_unaffected_test.py pins (gating the audit READ routes
# must not change run behavior).
_read_json = table_population.read_json_document

# The refresh-delta preprocessing lives in core (populate_table owns it);
# this alias remains the direct seam server/test/table_population_refresh_delta_test.py
# and server/routes/tables_test.py exercise it through.
_prepare_refresh_delta = table_population.prepare_refresh_delta


# Core mints the execution ids (#326): kept as a route-module alias so tests
# can patch the seam without reaching into core.
_new_execution_id = table_population.new_execution_id


def _read_table_population_status(table_population_id: str) -> str:
    # The process status is read from the run row's population_status record —
    # the ONLY lifecycle record (#326); record_status is its single writer.
    # Fail-safe (bug #13): no run row, or a row with no recorded lifecycle
    # status, reads back as STATUS_UNKNOWN — NEVER "running" — and a stale
    # 'running' from a crashed process is trusted verbatim (no staleness
    # detection; the crash lockout stays until a deliberate recovery change).
    # Known residual edge, documented on population_status_of: a fresh run
    # cancelled before its run row existed reads STATUS_UNKNOWN.
    store = Store()
    try:
        run = store.get_run(table_population_id)
    finally:
        store.close()
    return population_status_of(run)


def _is_execution_active(table_population_id: str) -> bool:
    task = _TABLE_POPULATION_SESSION_TASKS.get(table_population_id)
    return task is not None and not task.done()


def _refresh_start_lock(table_population_id: str) -> asyncio.Lock:
    lock = _REFRESH_START_LOCKS.get(table_population_id)
    if lock is None:
        lock = asyncio.Lock()
        _REFRESH_START_LOCKS[table_population_id] = lock
    return lock


def _raise_refresh_error(status_code: int, code: str, message: str) -> None:
    raise HTTPException(
        status_code=status_code, detail={"code": code, "message": message}
    )


def _encode_sse_data_message(event: dict[str, Any]) -> str:
    """Canonical table-population SSE framing: data-only payload, event name in data.type."""
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _table_for_population_id(table_population_id: str) -> dict[str, Any] | None:
    """The persisted Table that owns this population, or ``None`` when no table
    wraps it (a table-less legacy population).

    A ``TableError`` (the state store being busy/unavailable — it is shared with
    the population writers) is NOT swallowed: it propagates so the caller fails
    CLOSED. Flattening "store unavailable" into "no owning table" would make a
    table-BACKED refresh silently fall through to the legacy path and populate
    the whole hospital DB under the table's narrow-cohort disclosure — the exact
    broadening decision 0004 forbids. A genuine legacy population returns
    ``None`` cleanly (no row, no error)."""
    return core_table_store.table_for_population_id(table_population_id)


def _build_refresh_summary(
    store: Store,
    *,
    table_population_id: str,
    execution_id: str | None,
    refresh_stats: dict[str, Any] | None,
) -> dict[str, Any]:
    if not execution_id or not refresh_stats:
        return {}
    cells = store.get_cells(table_population_id)
    by_ref = {cell.ref: cell for cell in cells}
    reopened_blocked_refs = set(refresh_stats.get("reopened_blocked_refs", set()))
    active_member_ids = set(refresh_stats.get("active_member_ids", set()))
    resolved_blocked_count = sum(
        1
        for ref in reopened_blocked_refs
        if by_ref.get(ref) is not None and by_ref[ref].state != "blocked"
    )
    remaining_blocked_count = sum(
        1
        for cell in cells
        if cell.member in active_member_ids and cell.state == "blocked"
    )
    event_updates = store.count_events(
        table_population_id,
        execution_id=execution_id,
        type="cell_update",
    )
    updated_cells_count = (
        int(refresh_stats.get("preprocess_updated_cells_count", 0)) + event_updates
    )
    return {
        "new_members_count": int(refresh_stats.get("new_members_count", 0)),
        "departed_members_count": int(refresh_stats.get("departed_members_count", 0)),
        "retried_blocked_count": int(refresh_stats.get("retried_blocked_count", 0)),
        "resolved_blocked_count": resolved_blocked_count,
        "remaining_blocked_count": remaining_blocked_count,
        "updated_cells_count": updated_cells_count,
    }


async def _publish_event(table_population_id: str, event: dict[str, Any]) -> None:
    relay = table_population.get_session_relay()
    if relay is not None:
        await relay.publish_session_event(table_population_id, event)


class _OrderedSessionEventRelay:
    """Serialize session event publication to preserve emit order deterministically."""

    def __init__(self, table_population_id: str) -> None:
        self._table_population_id = table_population_id
        self._queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        self._closed = False
        self._drain_task = asyncio.create_task(self._drain())

    @property
    def closed(self) -> bool:
        return self._closed

    def emit(self, event: dict[str, Any]) -> None:
        if self._closed:
            raise RuntimeError("Table-population event publisher is already closed.")
        self._queue.put_nowait(event)

    async def aclose(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._queue.put_nowait(None)
        await self._drain_task

    async def _drain(self) -> None:
        while True:
            event = await self._queue.get()
            if event is None:
                break
            await _publish_event(self._table_population_id, event)


async def _fail_table_population_session(
    table_population_id: str,
    message: str,
    *,
    execution_id: str | None = None,
) -> None:
    relay = table_population.get_session_relay()
    if relay is not None:
        if execution_id:
            # Temporary behavior: emit an execution-tagged terminal error from
            # the route layer until close_session_with_error() accepts execution_id.
            await relay.publish_session_event(
                table_population_id,
                {"type": "error", "executionId": execution_id, "message": message},
            )
            await record_status_async(table_population_id, "error", detail=message)
            return
        await relay.close_session_with_error(table_population_id, message)
    else:
        await record_status_async(table_population_id, "error", detail=message)


async def _execute_table_population_session(
    table_population_id: str,
    artifact_dir: Path,
    table: dict[str, Any],
    execution_id: str | None = None,
    user_id: str | None = None,
    filters: dict[str, str] | None = None,
    database_id: str | None = None,
) -> None:
    """Run one population session for THE TABLE (the request identity dict).

    ``table`` carries ``source_template`` / ``dataset_id`` / ``brief`` /
    ``table_population_id``; everything population-shaped (ingredient
    assembly, member sync, refresh delta, the grid emit, the run itself) lives
    in ``core.table_population.populate_table``. The route keeps only the
    route-shaped work: session bookkeeping, relay/publisher wiring (with the
    deferred done-event dance), run-record/execution updates, the population
    lifecycle-record writes, and the HTTP error mapping. ``filters`` / ``database_id`` are the
    explicit overrides the table-less legacy adapter threads through.
    """
    store = Store(runtime_role="api_app")
    publisher = _OrderedSessionEventRelay(table_population_id)
    orchestrator_store = store.with_runtime_role("orchestrator_runtime")
    # Flips True the instant orchestration returns normally — lets the
    # CancelledError handler tell a mid-run user-stop (must build the summary
    # itself) apart from a stop that raced in after the run already finished.
    orchestrate_completed = False
    try:

        def _safe_transition_execution(
            status: str,
            *,
            summary_json: dict[str, Any] | None = None,
        ) -> None:
            if not execution_id:
                return
            try:
                store.update_execution_status(
                    execution_id,
                    status,
                    summary_json=summary_json,
                )
            except Exception:
                logger.exception(
                    "Failed to mark execution %s as %s for run %s",
                    execution_id,
                    status,
                    table_population_id,
                )

        async def _record_population_status(
            status: str,
            *,
            detail: str | None = None,
            result_status: str | None = None,
        ) -> None:
            # The population lifecycle writer, bound to THIS run's id — the
            # canonical single writer, called exactly as the route always has.
            # The core finalizers (#334) await it. Async so the terminal-retry
            # backoff never blocks the event loop (issue #2).
            await record_status_async(
                table_population_id,
                status,
                detail=detail,
                result_status=result_status,
            )

        audit_id = str(table.get("source_template") or "")
        # Only the legacy adapter still hands the route explicit filters /
        # database; a table-backed run derives both from the pinned Dataset
        # inside populate_table, and its run record's database_ids are synced
        # to the mapping's authoritative binding after the run.
        refresh_filters = {str(k): str(v) for k, v in (filters or {}).items()}
        database_ids = [database_id] if database_id else []
        existing_run = store.get_run(table_population_id)
        if existing_run is None:
            store.create_run(
                Run(
                    id=table_population_id,
                    audit_id=audit_id,
                    user_id=user_id,
                    status="in_progress",
                    database_ids=database_ids,
                    filters=refresh_filters,  # dataclass type is looser than runtime shape.
                    # A FRESH population's open_session recorded 'running'
                    # BEFORE this row existed, so that write had no row to
                    # land on (issue #326) — the row is born carrying that
                    # same 'running' transition. A refresh re-enters through
                    # the update path below with the row already present, so
                    # its open_session record landed directly.
                    population_status="running",
                )
            )
        else:
            store.update_run(
                table_population_id,
                audit_id=audit_id,
                database_ids=database_ids,
                filters=refresh_filters,
                status="in_progress",
                started_at=datetime.now(timezone.utc).isoformat(),
                ended_at=None,
            )

        if execution_id:
            store.create_execution(
                RunExecution(
                    id=execution_id, run_id=table_population_id, status="queued"
                )
            )
            store.update_execution_status(execution_id, "running")

        def _with_execution(event: dict[str, Any]) -> dict[str, Any]:
            if not execution_id:
                return event
            enriched = dict(event)
            enriched["executionId"] = execution_id
            return enriched

        async def _emit_now(event: dict[str, Any]) -> None:
            await _publish_event(table_population_id, _with_execution(event))

        # Emit a heartbeat activity event up front so the front-end's empty
        # state clears and the activity panel shows progress. Everything below
        # — ensure_mapping in particular — can take many seconds (an LLM call
        # for audits not yet mapped); without an early event the user sits on
        # the "Workbook will appear here once available" placeholder with no
        # signal that anything is happening.
        await _emit_now(
            {
                "type": "activity",
                "headline": "Preparing the audit.",
                "label": "Preparing the audit",
                "kind": "step",
            }
        )

        relay = table_population.get_session_relay()
        agent_client = relay.agent_client() if relay is not None else None
        deferred_done_event: dict[str, Any] | None = None

        def emit(event: dict[str, Any]) -> None:
            nonlocal deferred_done_event
            if event.get("type") == "done":
                deferred_done_event = dict(event)
                return
            publisher.emit(_with_execution(event))

        # ONE populate_table call: the request identity in, the whole
        # population out. Assembly failures are core ValueErrors mapped by the
        # generic handler below with the runtime's historical messages.
        outcome = await table_population.populate_table(
            orchestrator_store,
            {**table, "table_population_id": table_population_id},
            emit=emit,
            agent_client=agent_client,
            execution_id=execution_id,
            filters=filters,
            database_id=database_id,
            artifact_dir=artifact_dir,
        )
        orchestrate_completed = True
        # Keep the run record's database_ids in sync with the mapping's
        # authoritative binding (an api_app write — the orchestrator store's
        # runtime role may not touch runs.database_ids).
        bound_ids = list(outcome.bound_database_ids)
        if bound_ids != database_ids:
            store.update_run(table_population_id, database_ids=bound_ids)
        run = store.get_run(table_population_id)
        final_status = run.status if run is not None else None
        refresh_summary = _build_refresh_summary(
            store,
            table_population_id=table_population_id,
            execution_id=execution_id,
            refresh_stats=outcome.refresh_stats,
        )
        # The population's TERMINAL SEQUENCE ordering (review_summary →
        # refresh_summary → done, all through the one publisher, status recorded
        # BEFORE `done`) is population behavior and lives in core (#334); the
        # route supplies only the publisher and its lifecycle writers.
        await table_population.finalize_completed_population(
            publisher=publisher,
            deferred_done_event=deferred_done_event,
            refresh_summary=refresh_summary,
            result_status=final_status,
            record_status=_record_population_status,
            transition_execution=_safe_transition_execution,
            with_execution=_with_execution,
        )
    except asyncio.CancelledError:
        # The graceful-vs-hard CANCELLATION classification is population behavior
        # and lives in core (#334): it decides whether this cancel finalizes as
        # `completed` (a pause, or a stop that raced a finished run) or `stopped`
        # (a hard abort). A hard abort returns False here — the route re-raises.
        relay = table_population.get_session_relay()
        stop_to_finalize = relay is not None and relay.is_stop_requested(
            table_population_id
        )

        def _read_result_status() -> str | None:
            run = store.get_run(table_population_id)
            return run.status if run is not None else None

        handled = await table_population.finalize_cancelled_population(
            table_population_id=table_population_id,
            publisher=publisher,
            orchestrate_completed=orchestrate_completed,
            stop_requested=stop_to_finalize,
            orchestrator_store=orchestrator_store,
            get_result_status=_read_result_status,
            record_status=_record_population_status,
            transition_execution=_safe_transition_execution,
            with_execution=_with_execution,
        )
        if handled:
            return
        raise
    except Exception as exc:
        logger.exception(
            "Table population %s failed during session execution", table_population_id
        )
        await publisher.aclose()
        _safe_transition_execution(
            "error",
            summary_json={"message": str(exc)},
        )
        await _fail_table_population_session(
            table_population_id,
            f"Table population failed: {exc}",
            execution_id=execution_id,
        )
    finally:
        await publisher.aclose()
        try:
            store.update_run(
                table_population_id, ended_at=datetime.now(timezone.utc).isoformat()
            )
        except Exception:
            pass
        orchestrator_store.close()
        store.close()
        _TABLE_POPULATION_SESSION_TASKS.pop(table_population_id, None)


def _launch_table_population_session(
    table_population_id: str,
    artifact_dir: Path,
    table: dict[str, Any],
    execution_id: str | None = None,
    user_id: str | None = None,
    filters: dict[str, str] | None = None,
    database_id: str | None = None,
) -> None:
    relay = table_population.get_session_relay()
    if relay is None:
        raise HTTPException(
            status_code=503, detail="Table population worker is not ready."
        )
    relay.open_session(table_population_id, artifact_dir)
    _TABLE_POPULATION_SESSION_TASKS[table_population_id] = asyncio.create_task(
        _execute_table_population_session(
            table_population_id,
            artifact_dir,
            table,
            execution_id=execution_id,
            user_id=user_id,
            filters=filters,
            database_id=database_id,
        )
    )


def _require_table_population_cell_edit_access(
    user: dict[str, Any] | None, run: Run
) -> None:
    if not authz.has_permission(user, "table_population.edit_cells"):
        raise HTTPException(
            status_code=403, detail="Missing permission: table_population.edit_cells"
        )
    if run.user_id is None or run.user_id != user["id"]:
        raise HTTPException(
            status_code=403, detail="Table population ownership required to edit cells."
        )


def _build_clinician_cell_updates(
    cell, patch: TablePopulationCellEditRequest
) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    if patch.review_state is not None:
        if patch.review_state != "reviewed":
            raise HTTPException(
                status_code=422, detail="reviewState can only be set to 'reviewed'."
            )
        if cell.review_state not in (None, "not_reviewed", "reviewed"):
            raise HTTPException(
                status_code=422, detail="Invalid existing reviewState on target cell."
            )
        updates["review_state"] = "reviewed"
    if patch.corrected is not None:
        updates["corrected"] = patch.corrected
    if patch.value is not None:
        corrected_target = (
            patch.corrected if patch.corrected is not None else cell.corrected
        )
        if corrected_target is not True:
            raise HTTPException(
                status_code=422,
                detail="value edits require corrected=true for clinician correction.",
            )
        updates["value"] = patch.value
    if not updates:
        raise HTTPException(status_code=400, detail="No editable fields provided.")
    return updates


@router.post(
    "/api/table-populations",
    response_model=TablePopulationCreateResponse,
    status_code=200,
)
async def create_table_population(request: Request):
    content_type = request.headers.get("content-type", "")
    if "application/json" not in content_type:
        raise HTTPException(
            status_code=415, detail="Unsupported content type. Use application/json."
        )

    table_population_id = table_population.new_table_population_id()
    artifact_dir = ARTIFACTS_DIR / table_population_id
    artifact_dir.mkdir(parents=True, exist_ok=False)

    body = await request.json()
    req = TablePopulationCreateFromAuditRequest.model_validate(body)
    filters = req.filters or {}
    database_id = req.database
    # No workbook on disk — populate_table emits the initial grid from precomputed
    # pending cells and every value lives in state.db (the single source of truth).
    audit_id = req.audit_id
    request_text = req.prompt

    user_id = current_user_id(request)
    # The TABLE-LESS LEGACY ADAPTER: this endpoint creates a population with no
    # wrapping Table, so there is no pinned Dataset to derive scope from. The
    # minimal identity dict names the source template only; the request's own
    # filters/database ride through populate_table's explicit overrides.
    table = {
        "source_template": audit_id,
        "dataset_id": None,
        "table_population_id": table_population_id,
    }
    _launch_table_population_session(
        table_population_id,
        artifact_dir,
        table,
        user_id=user_id,
        filters=filters,
        database_id=database_id,
    )

    # Attribute the run to the authenticated user who started it (doc 7
    # §Attribution); this is the per-user history "own audits" is read from.
    if user_id:
        auth_store.record_run(
            table_population_id,
            user_id,
            audit_id,
            request_text,
            filters,
            datetime.now(timezone.utc).isoformat(),
        )

    messages: list[TextMessage | ChipMessage] = [
        TextMessage(content="Audit started — the agent is working…"),
    ]
    return TablePopulationCreateResponse(
        table_population_id=table_population_id, messages=messages
    )


@router.get("/api/table-populations/{table_population_id}/stream")
async def stream_table_population_events(table_population_id: str, request: Request):
    # Owner-only gate BEFORE the SSE stream opens. EventSource sends the session
    # cookie, so request.state.user is available; a non-owner never streams
    # another user's table-population frames.
    _require_table_population_owner(
        request, table_population_id, permission="table_population.read"
    )
    relay = table_population.get_session_relay()
    if relay is None:
        raise HTTPException(
            status_code=503, detail="Table population worker is not ready."
        )

    async def event_source():
        async for event in relay.stream_session_events(table_population_id):
            yield _encode_sse_data_message(event)

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


async def _stop_table_population_internal(
    table_population_id: str, *, finalize: bool = True
) -> bool:
    """Stop a table population's live execution by cancelling the in-flight session task and
    waiting for it to wind down (the cancel aborts the opencode agent session
    via the session driver's cleanup).

    ``finalize`` picks the semantics:

    * ``True`` (user PAUSE): flag a cooperative stop on the session relay so the
      session executor's CancelledError handler emits a ``review_summary`` of the
      work done so far + ``done`` — the table population reads as finished early,
      not failed.
    * ``False`` (DELETE): hard kill — the relay pushes a terminal error and marks
      the session done before the row is wiped; no summary is built.

    Returns True if anything was actually stopped (a flagged/killed live session or a
    running session task), False if the table population was already finished/unknown.
    Never raises on an already-finished session — callers that need the 404 semantics check
    the return value themselves.
    """
    stopped_by_relay = False
    relay = table_population.get_session_relay()
    if relay is not None:
        if finalize:
            stopped_by_relay = relay.request_graceful_stop(table_population_id)
        else:
            stopped_by_relay = await relay.abort_session(table_population_id)
    task = _TABLE_POPULATION_SESSION_TASKS.get(table_population_id)
    cancelled_task = False
    if task is not None and not task.done():
        task.cancel()
        cancelled_task = True
        try:
            await asyncio.wait_for(task, timeout=5.0)
        except asyncio.CancelledError:
            pass
        except asyncio.TimeoutError:
            logger.warning(
                "Timed out waiting for session task %s to stop",
                table_population_id,
            )
    return stopped_by_relay or cancelled_task


def _require_table_population_owner(
    request: Request, table_population_id: str, *, permission: str
) -> dict[str, Any]:
    """Owner-only gate for a table-population lifecycle action, ordered fail-closed (§3/§9).

    Resolves the session-bound caller (401 if anonymous — defensive; the
    middleware already gates the path), requires ``permission``, loads the table population
    via the api_app store (404 if missing), then enforces ownership
    (``run.user_id == caller``). There is NO admin override (ADR-0003 #3) — the
    client-provided ``user_id`` is never trusted; identity comes from the
    session. Returns the caller dict on success.
    """
    user = current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not authz.has_permission(user, permission):
        raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")
    store = Store(runtime_role="api_app")
    try:
        run = store.get_run(table_population_id)
    finally:
        store.close()
    if run is None:
        raise HTTPException(status_code=404, detail="Table population not found.")
    if run.user_id is None or run.user_id != user["id"]:
        raise HTTPException(
            status_code=403, detail="Table population ownership required."
        )
    return user


def require_table_population_read_access(
    request: Request, table_population_id: str, *, store: Store | None = None
) -> Run:
    """Allow the table-population owner, or a caller with an active grant on its wrapping table.

    The table UI reuses these table-population output endpoints. Role permission
    ``table_population.read`` is necessary for everyone; non-owners also need
    ``table.read`` plus an active table grant whose persisted
    ``table_population_id`` matches the requested table population.
    """
    user = current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not authz.has_permission(user, "table_population.read"):
        raise HTTPException(
            status_code=403, detail="Missing permission: table_population.read"
        )

    own_store = store is None
    s = store if store is not None else Store(runtime_role="api_app")
    try:
        run = s.get_run(table_population_id)
    finally:
        if own_store:
            s.close()
    if run is None:
        raise HTTPException(status_code=404, detail="Table population not found.")
    if run.user_id is not None and run.user_id == user["id"]:
        return run
    if not authz.has_permission(user, "table.read"):
        raise HTTPException(status_code=403, detail="Missing permission: table.read")
    if grant_store.has_table_population_access_via_table(user, table_population_id):
        return run
    raise HTTPException(
        status_code=403, detail="You don't have access to this table population"
    )


@router.post("/api/table-populations/{table_population_id}/stop")
async def stop_table_population(table_population_id: str, request: Request):
    _require_table_population_owner(
        request, table_population_id, permission="table_population.stop"
    )
    if table_population.get_session_relay() is None:
        raise HTTPException(
            status_code=503, detail="Table population worker is not ready."
        )
    # User pause → finalize with a summary (not a hard kill).
    if not await _stop_table_population_internal(table_population_id, finalize=True):
        raise HTTPException(
            status_code=404, detail="Table population not found or already finished."
        )
    return {"status": "stopped"}


@router.delete("/api/table-populations/{table_population_id}", status_code=204)
async def delete_table_population(table_population_id: str, request: Request):
    """Delete a table population end-to-end: stop its live execution, then remove every trace
    of it so the frontend and backend stay in lock-step. Order matters — we stop
    BEFORE deleting so neither the opencode agent nor the session executor can write a cell
    or recreate a file mid-teardown.

    Removes the table population from all three storage locations:
    - ``var/state.db``: the ``runs`` row + every child row (cells, field_codes,
      run_executions, run_members, events) via ``ON DELETE CASCADE``;
    - ``var/artifacts/<table_population_id>/``: the Artifact's workspace directory
      (context.json, the ``cells.sqlite`` symlink — the real DB lives at
      ``var/state.db`` and is already cleared by the cascade);
    - ``auth.sqlite``: the attribution row, so the table population no longer reappears in the
      user's sidebar history on reload.
    """
    user = current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    store = Store(runtime_role="api_app")
    try:
        run = store.get_run(table_population_id)
        if run is None:
            raise HTTPException(status_code=404, detail="Table population not found.")
        if run.user_id is None or run.user_id != user["id"]:
            raise HTTPException(
                status_code=403, detail="Table population ownership required to delete."
            )

        # 1. STOP the live execution (opencode session + session task) and wait.
        #    Hard kill — the table population is about to be deleted, so don't spend effort
        #    finalizing a summary for it.
        await _stop_table_population_internal(table_population_id, finalize=False)

        # 2. DELETE from all three stores.
        store.delete_run(table_population_id)
        _TABLE_POPULATION_SESSION_TASKS.pop(table_population_id, None)
        shutil.rmtree(ARTIFACTS_DIR / table_population_id, ignore_errors=True)
        auth_store.delete_run_attribution(table_population_id)
    finally:
        store.close()
    return Response(status_code=204)


@router.post(
    "/api/table-populations/{table_population_id}/refresh",
    response_model=TablePopulationRefreshResponse,
    status_code=200,
)
async def refresh_table_population(table_population_id: str, request: Request):
    # Ordered fail-closed (§3/§9): a missing table population is the structured
    # TABLE_POPULATION_NOT_FOUND 404 — THEN the owner-only gate (auth →
    # permission → ownership, NO admin override, ADR-0003) so a non-owner never
    # learns an existing population's refresh state, BEFORE the 409 checks.
    artifact_dir = ARTIFACTS_DIR / table_population_id
    if not artifact_dir.exists():
        _raise_refresh_error(
            404,
            "TABLE_POPULATION_NOT_FOUND",
            f"Table population {table_population_id!r} was not found.",
        )
    _require_table_population_owner(
        request, table_population_id, permission="table_population.read"
    )
    lock = _refresh_start_lock(table_population_id)
    async with lock:
        artifact_dir = ARTIFACTS_DIR / table_population_id
        if not artifact_dir.exists():
            _raise_refresh_error(
                404,
                "TABLE_POPULATION_NOT_FOUND",
                f"Table population {table_population_id!r} was not found.",
            )
        if _is_execution_active(table_population_id):
            _raise_refresh_error(
                409,
                "TABLE_POPULATION_ACTIVE",
                "Table population execution is already active.",
            )

        status = _read_table_population_status(table_population_id)
        if status not in _REFRESHABLE_TABLE_POPULATION_STATUSES:
            _raise_refresh_error(
                409,
                "TABLE_POPULATION_NOT_REFRESHABLE",
                f"Table population status {status!r} does not allow refresh.",
            )

        store = Store()
        try:
            run = store.get_run(table_population_id)
            if run is None:
                _raise_refresh_error(
                    404,
                    "TABLE_POPULATION_NOT_FOUND",
                    f"Table population {table_population_id!r} was not found.",
                )

            audit_id = str(run.audit_id or "").strip()
            if not audit_id or audit_id == "custom":
                _raise_refresh_error(
                    409,
                    "TABLE_POPULATION_NOT_REFRESHABLE",
                    "Table population cannot be refreshed because it has no refreshable source audit.",
                )
            database_ids = (
                run.database_ids if isinstance(run.database_ids, list) else []
            )
            database_id = str(database_ids[0]).strip() if database_ids else None
            if not database_id:
                _raise_refresh_error(
                    409,
                    "TABLE_POPULATION_NOT_REFRESHABLE",
                    "Table population cannot be refreshed because no source database is recorded.",
                )
            filters = run.filters if isinstance(run.filters, dict) else {}
            refresh_filters = {str(k): str(v) for k, v in filters.items()}
        finally:
            store.close()

        # A refresh holds only the population id — resolve the OWNING Table so
        # the re-run derives its scope from the pinned Dataset and carries the
        # table's brief (the request identity, same as the spawn). A table-less
        # legacy population (created via POST /api/table-populations) has no
        # owning Table: synthesize the minimal identity from the run record and
        # thread its recorded filters/database through the explicit overrides.
        try:
            table = _table_for_population_id(table_population_id)
        except TableError:
            # The state store is transiently busy/unavailable — we cannot tell a
            # table-backed population from a legacy one, so fail CLOSED (retryable)
            # rather than risk refreshing a scoped table over the whole DB.
            raise HTTPException(
                status_code=503,
                detail="Table store temporarily unavailable; retry the refresh.",
            ) from None
        launch_overrides: dict[str, Any] = {}
        if table is None:
            # A table-less legacy population (POST /api/table-populations) has
            # no owning Table to carry a brief, but the ORIGINAL request text it
            # was created with was recorded on the attribution row (auth.sqlite,
            # the `request` column — the core run row's `request` is never set on
            # this path). Thread it back as the brief so the refresh drives the
            # agent with the same user-intent context the first run had (#332).
            # When no request text was recorded, there is genuinely nothing to
            # carry: `brief` stays absent and the prompt keeps its classic shape.
            # The read is fail-OPEN (unlike the owning-Table lookup above, which
            # fails closed to protect the cohort): a missing brief is tolerated
            # by design, so a transiently locked attribution store must NOT 500
            # the whole refresh — proceed without a brief.
            try:
                attribution = auth_store.get_run_attribution(table_population_id)
            except Exception:
                logger.warning(
                    "could not read the attribution brief for %s; refreshing "
                    "without it",
                    table_population_id,
                )
                attribution = None
            recorded_request = (attribution or {}).get("request")
            table = {
                "source_template": audit_id,
                "dataset_id": None,
                "table_population_id": table_population_id,
            }
            if recorded_request:
                table["brief"] = recorded_request
            launch_overrides = {
                "filters": refresh_filters,
                "database_id": database_id,
            }

        execution_id = _new_execution_id()
        _launch_table_population_session(
            table_population_id,
            artifact_dir,
            table,
            execution_id=execution_id,
            **launch_overrides,
        )
        return TablePopulationRefreshResponse(
            tablePopulationId=table_population_id,
            executionId=execution_id,
            status="started",
        )


@router.patch(
    "/api/table-populations/{table_population_id}/cells/{ref:path}",
    response_model=TablePopulationCellEditResponse,
)
async def edit_table_population_cell(
    table_population_id: str,
    ref: str,
    body: TablePopulationCellEditRequest,
    request: Request,
):
    user = current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    store = Store(runtime_role="api_app")
    clinician_store = store.with_runtime_role("clinician_editor_runtime")
    try:
        run = store.get_run(table_population_id)
        if run is None:
            raise HTTPException(status_code=404, detail="Table population not found.")
        _require_table_population_cell_edit_access(user, run)
        cell = store.get_cell(table_population_id, ref)
        if cell is None:
            raise HTTPException(status_code=404, detail="Cell not found.")
        if cell.kind != "interpret":
            raise HTTPException(
                status_code=422,
                detail="Only interpret cells are editable via clinician review/correction.",
            )

        updates = _build_clinician_cell_updates(cell, body)
        try:
            updated = clinician_store.update_cell(table_population_id, ref, **updates)
        except RuntimePermissionDenied as exc:
            logger.warning(
                "permission denied while editing run cell",
                extra={
                    "table_population_id": table_population_id,
                    "ref": ref,
                    "user_id": user.get("id"),
                    "username": user.get("username"),
                    "updated_fields": sorted(updates.keys()),
                    "runtime_role": clinician_store.runtime_role,
                    "permission_role": exc.role,
                    "permission_table": exc.table,
                    "permission_action": exc.action,
                    "permission_columns": list(exc.columns)
                    if exc.columns is not None
                    else None,
                },
            )
            raise HTTPException(status_code=403, detail="Permission denied.") from None
        try:
            clinician_store.append_event(
                Event(
                    run_id=table_population_id,
                    type="verification",
                    payload={
                        "ref": ref,
                        "updated_fields": sorted(updates.keys()),
                        "user_id": user["id"],
                        "username": user.get("username"),
                    },
                )
            )
        except RuntimePermissionDenied as exc:
            logger.warning(
                "permission denied while recording clinician verification event",
                extra={
                    "table_population_id": table_population_id,
                    "ref": ref,
                    "user_id": user.get("id"),
                    "username": user.get("username"),
                    "updated_fields": sorted(updates.keys()),
                    "runtime_role": clinician_store.runtime_role,
                    "permission_role": exc.role,
                    "permission_table": exc.table,
                    "permission_action": exc.action,
                    "permission_columns": list(exc.columns)
                    if exc.columns is not None
                    else None,
                },
            )
        return TablePopulationCellEditResponse(
            table_population_id=table_population_id,
            ref=ref,
            review_state=updated.review_state,
            corrected=updated.corrected,
            value=updated.value,
        )
    finally:
        clinician_store.close()
        store.close()


@router.get(
    "/api/table-populations/{table_population_id}",
    response_model=TablePopulationStateResponse,
)
async def get_table_population_state(table_population_id: str, request: Request):
    require_table_population_read_access(request, table_population_id)
    artifact_dir = ARTIFACTS_DIR / table_population_id
    if not artifact_dir.exists():
        raise HTTPException(status_code=404, detail="Table population not found.")

    status = _read_table_population_status(table_population_id)

    messages: list[TextMessage | ChipMessage] = [
        TextMessage(content=f"Table population {table_population_id} is {status}."),
    ]
    if status == "completed":
        messages.append(
            ChipMessage(
                workbook_url=f"/api/table-populations/{table_population_id}/workbook",
                download_url=f"/api/table-populations/{table_population_id}/download",
            )
        )

    return TablePopulationStateResponse(
        table_population_id=table_population_id, status=status, messages=messages
    )
