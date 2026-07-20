"""The thread agent's persistent OpenCode session + the shared session driver.

One persistent session exists per Thread (its id lives in the sidecar
``var/threads/<id>/agent-session.json``); :func:`ensure_thread_session`
re-materializes the worktree on EVERY call — so the authorized
datasets/templates projection converges on the caller's current grants — and
creates or reuses the session. :func:`drive_session` is the one loop that
drives any agent session (thread agent and table population alike): prompt →
forward message parts (bounded UI activity via ``core.agent.activity``, plus a
full-fidelity transcript for offline evaluation) → wait for idle, polling the
run store for out-of-process cell writes when one is attached. Its NAMED seam
is the shared sub-agent launcher (``core.agent.launcher.launch``) — both
adapters (the thread agent and table population) cross it there; nothing
outside ``core.agent`` calls :func:`drive_session` directly.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from core.agent import worktree
from core.agent.activity import activity_from_part
from core.config import DATABASES_DIR

logger = logging.getLogger(__name__)

AGENT_STATE_FILE = "agent-session.json"
AGENT_WORKTREE_DIR = "opencode"


@dataclass(frozen=True)
class ThreadSession:
    """The persistent session bound to a thread: its opencode session id, the
    thread's worktree dir, and whether this call CREATED the session (a created
    session has no standing instructions yet — the first turn seeds them)."""

    session_id: str
    worktree_dir: Path
    created: bool


def thread_worktree_dir(thread_id: str, *, threads_dir: Path) -> Path:
    return threads_dir / thread_id / AGENT_WORKTREE_DIR


def _thread_state_path(thread_id: str, *, threads_dir: Path) -> Path:
    return threads_dir / thread_id / AGENT_STATE_FILE


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_thread_state(thread_id: str, *, threads_dir: Path) -> dict[str, Any]:
    path = _thread_state_path(thread_id, threads_dir=threads_dir)
    if not path.is_file():
        return {}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return state if isinstance(state, dict) else {}


def _write_thread_state(thread_id: str, *, threads_dir: Path, session_id: str) -> None:
    path = _thread_state_path(thread_id, threads_dir=threads_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    now = _now_iso()
    state = _read_thread_state(thread_id, threads_dir=threads_dir)
    payload = {
        "schema_version": "1",
        "thread_id": thread_id,
        "session_id": session_id,
        "worktree": AGENT_WORKTREE_DIR,
        "created_at": state.get("created_at") or now,
        "updated_at": now,
    }
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


async def ensure_thread_session(
    thread_id: str,
    *,
    client,
    threads_dir: Path,
    databases_dir: Path | None = None,
    authorize: worktree.AuthorizeResource | None = None,
) -> ThreadSession:
    """Ensure one persistent opencode session is associated with ``thread_id``.

    Materializes the worktree every call (idempotent; the authorized
    projection converges on the caller's CURRENT grants) and creates the
    session only when the sidecar holds none yet.
    """
    databases_dir = DATABASES_DIR if databases_dir is None else databases_dir
    worktree_dir = thread_worktree_dir(thread_id, threads_dir=threads_dir)
    worktree.materialize(
        worktree_dir,
        authorize=authorize,
        databases_dir=databases_dir,
        config=worktree.thread_agent_opencode_config(),
    )

    state = _read_thread_state(thread_id, threads_dir=threads_dir)
    existing_session_id = str(state.get("session_id") or "").strip()
    if existing_session_id:
        _write_thread_state(
            thread_id, threads_dir=threads_dir, session_id=existing_session_id
        )
        return ThreadSession(
            session_id=existing_session_id, worktree_dir=worktree_dir, created=False
        )

    session_id = await client.create_session(
        title=f"thread:{thread_id}", directory=str(worktree_dir)
    )
    _write_thread_state(thread_id, threads_dir=threads_dir, session_id=session_id)
    return ThreadSession(session_id=session_id, worktree_dir=worktree_dir, created=True)


async def delete_thread_session(
    thread_id: str,
    *,
    client,
    threads_dir: Path,
) -> None:
    state = _read_thread_state(thread_id, threads_dir=threads_dir)
    session_id = str(state.get("session_id") or "").strip()
    if not session_id:
        return
    await client.delete_session(
        session_id,
        directory=str(thread_worktree_dir(thread_id, threads_dir=threads_dir)),
    )


# --- the shared session driver ------------------------------------------------


def _cell_signature(cell) -> tuple:
    """What a poll compares to detect an agent write: the value/state ladder
    plus the review-facing fields the FE renders from cell metadata."""
    return (cell.state, cell.value, cell.confidence, cell.reason_code)


def _changed_cells(run_store, seen: dict[str, tuple]) -> list:
    """Diff the store against ``seen`` (ref -> signature), update ``seen`` in
    place, and return the cells that changed since the last poll."""
    changed = []
    for cell in run_store.cells():
        signature = _cell_signature(cell)
        if seen.get(cell.ref) != signature:
            seen[cell.ref] = signature
            changed.append(cell)
    return changed


# Full-fidelity transcript for OFFLINE EVALUATION of the agent's process (doc 11
# §agent_activity). The live UI stream is deliberately bounded (activity_from_part truncates thinking and dedups tool calls); for judging how well the
# agent reasoned, which queries it ran and what they returned, how efficient it
# was, and whether the prompt / tool descriptions / DB model / field spec need
# work, we persist the COMPLETE, untruncated session to var/artifacts/<id>/. The
# agent's INPUTS already live in the artifact workspace (context.json,
# template/spec.json, databases/<slug>.model.json); this adds the PROCESS + OUTPUT.


def _part_transcript_record(part: dict) -> dict | None:
    """Normalize one opencode message part into a transcript record carrying its
    FULL content (untruncated tool input/output, full reasoning text, timings).
    Returns None for parts with no evaluable content (step markers, empty text).
    Pure + deterministic so it is unit-testable without opencode running."""
    if not isinstance(part, dict):
        return None
    ptype = part.get("type")
    pid = str(part.get("id") or part.get("callID") or "")
    if ptype == "tool":
        state = part.get("state") if isinstance(part.get("state"), dict) else {}
        return {
            "id": pid,
            "kind": "tool",
            "tool": part.get("tool"),
            "status": state.get("status"),
            "title": state.get("title"),
            "input": state.get("input"),
            "output": state.get("output"),
            "time": state.get("time"),
        }
    if ptype in ("reasoning", "text"):
        text = part.get("text")
        if not (isinstance(text, str) and text.strip()):
            return None
        return {
            "id": pid,
            "kind": "thinking" if ptype == "reasoning" else "text",
            "text": text,
            "time": part.get("time"),
        }
    return None


def _transcript_stats(records: list[dict]) -> dict:
    """Efficiency metrics over a transcript's records — the at-a-glance view for
    evaluating how the agent spent its turn (how many tool calls, of what, how
    much it reasoned, how many tool errors)."""
    tools = [r for r in records if r.get("kind") == "tool"]
    thinking = [r for r in records if r.get("kind") == "thinking"]
    by_tool: dict[str, int] = {}
    for r in tools:
        name = r.get("tool") or "unknown"
        by_tool[name] = by_tool.get(name, 0) + 1
    return {
        "parts": len(records),
        "tool_calls": len(tools),
        "tool_calls_by_name": by_tool,
        "tool_errors": sum(1 for r in tools if r.get("status") == "error"),
        "thinking_blocks": len(thinking),
        "thinking_chars": sum(len(r.get("text") or "") for r in thinking),
        "text_blocks": sum(1 for r in records if r.get("kind") == "text"),
    }


def write_agent_activity_log(
    log_dir: Path,
    *,
    run_id: str,
    execution_id: str | None,
    session_id: str | None,
    prompt: str | None,
    databases: list[str] | None,
    records: list[dict],
    started_at: datetime | None,
    ended_at: datetime | None,
    error: str | None = None,
) -> Path | None:
    """Persist the agent transcript as JSONL to ``var/artifacts/<run_id>/``.

    Line 1 is a ``{"kind": "meta", ...}`` header (the prompt, databases, timings,
    error, and efficiency ``stats``); each subsequent line is one part record in
    transcript order. Refresh executions get their own
    ``agent-activity.<execution_id>.jsonl`` so a re-run never clobbers the
    original. Best-effort: a logging failure is swallowed, never failing the run.
    """
    try:
        suffix = f".{execution_id}" if execution_id else ""
        path = log_dir / f"agent-activity{suffix}.jsonl"
        duration = None
        if started_at is not None and ended_at is not None:
            duration = round((ended_at - started_at).total_seconds(), 3)
        meta = {
            "kind": "meta",
            "run_id": run_id,
            "execution_id": execution_id,
            "session_id": session_id,
            "started_at": started_at.isoformat() if started_at else None,
            "ended_at": ended_at.isoformat() if ended_at else None,
            "duration_s": duration,
            "databases": list(databases or []),
            "error": error,
            "prompt": prompt,
            "stats": _transcript_stats(records),
        }
        lines = [json.dumps(meta, ensure_ascii=False, default=str)]
        lines += [json.dumps(r, ensure_ascii=False, default=str) for r in records]
        log_dir.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return path
    except Exception:
        logger.exception("write_agent_activity_log failed for run %s", run_id)
        return None


async def drive_session(
    client,
    title: str,
    prompt: str,
    directory: str,
    run_store=None,
    poll_interval: float = 1.0,
    log_dir: Path | None = None,
    on_activity: Callable[[dict], Awaitable[None]] | None = None,
    on_part: Callable[[dict], Awaitable[None]] | None = None,
    session_id: str | None = None,
    delete_session: bool = True,
) -> None:
    """One opencode session, ROOTED IN THE RUN WORKTREE.

    The engine behind the shared sub-agent launcher
    (:func:`core.agent.launcher.launch`) — new callers cross that seam, not
    this function directly.

    ``directory`` is the per-run worktree (opencode-relative): the session — and
    therefore every tool call's working directory — is rooted there, so the tools
    resolve ``context.json`` / ``template`` / ``database`` for THIS run. We wait for
    ``session.idle``; a ``session.error`` ends it (unresolved cells then fall to
    NOT_LOCATED). The client is the app's ``OpenCodeClient``.

    While waiting, the store is polled every ``poll_interval`` seconds and any
    cell the agent wrote since the last poll is rebroadcast as a ``cell_update``
    (persist + stream). The agent writes the cell SQLite out-of-process, so
    nothing else emits for those writes — without this bridge the FE shows no
    agent fills until the run ends.
    """
    # Baseline BEFORE the session exists: anything that differs later was
    # written by the agent and needs rebroadcasting.
    seen: dict[str, tuple] = {}
    if run_store is not None:
        for cell in run_store.cells():
            seen[cell.ref] = _cell_signature(cell)
    # Per-part signatures so the agent's tool/thinking parts forward without
    # flooding (see activity_from_part).
    seen_parts: dict[str, str] = {}
    # Full-fidelity transcript (id -> latest record) for offline evaluation,
    # written to var/artifacts/<id>/ on session end. Distinct from the bounded UI
    # forward above — this keeps the WHOLE thinking + tool I/O.
    transcript: dict[str, dict] = {}
    session_error: str | None = None
    session_started = datetime.now(timezone.utc)
    if session_id is None:
        session_id = await client.create_session(title=title, directory=directory)
    queue = await client.subscribe(session_id)

    async def poll() -> None:
        if run_store is None:
            return
        changed = _changed_cells(run_store, seen)
        if changed:
            await run_store.rebroadcast(changed)

    try:
        await client.prompt_async(session_id, prompt, directory=directory)
        loop = asyncio.get_running_loop()
        last_poll = loop.time()
        while True:
            # Cap the wait so a chatty event stream can't starve the poll, and
            # a silent one still polls every interval.
            wait = max(0.05, poll_interval - (loop.time() - last_poll))
            try:
                event = await asyncio.wait_for(queue.get(), timeout=wait)
            except asyncio.TimeoutError:
                event = None
            if loop.time() - last_poll >= poll_interval:
                await poll()
                last_poll = loop.time()
            if event is None:
                continue
            etype = event.get("type")
            if etype == "session.idle":
                return
            if etype == "session.error":
                props = event.get("properties") or {}
                err = (props.get("error") or {}).get("message") or "session error"
                session_error = err
                logger.warning("agent session error: %s", err)
                return
            if etype == "message.part.updated":
                part = (event.get("properties") or {}).get("part") or {}
                if on_part is not None:
                    await on_part(part)
                # Full transcript record (untruncated) — keyed by part id so a
                # streaming part collapses to its final state, in arrival order.
                record = _part_transcript_record(part)
                if record is not None:
                    transcript[record["id"] or f"#{len(transcript)}"] = record
                # Bounded projection for the live UI stream (upserted by id).
                forwarded = activity_from_part(part, seen_parts)
                if forwarded is not None:
                    if run_store is not None:
                        try:
                            await run_store.activity(
                                forwarded["headline"],
                                label=forwarded.get("label"),
                                kind=forwarded.get("kind"),
                                id=forwarded.get("id") or None,
                            )
                        except Exception:
                            logger.exception(
                                "drive_session: forwarding agent activity failed"
                            )
                    if on_activity is not None:
                        await on_activity(forwarded)
    finally:
        # Final sweep so writes landed between the last poll and session end
        # still stream before finalize settles the leftovers.
        try:
            await poll()
        except Exception:
            logger.exception("drive_session: final cell rebroadcast failed")
        # Flush each reasoning/text block's FINAL full text to the live stream
        # (upserted by id) — the growth throttle may have stopped short of the
        # tail, and the UI's expand must show everything.
        if run_store is not None:
            for rec in transcript.values():
                if (
                    rec.get("kind") in ("thinking", "text")
                    and rec.get("id")
                    and rec.get("text")
                ):
                    try:
                        await run_store.activity(
                            rec["text"],
                            label="Thinking"
                            if rec["kind"] == "thinking"
                            else "Writing a note",
                            kind="thinking",
                            id=rec["id"],
                        )
                    except Exception:
                        logger.exception(
                            "drive_session: flushing final agent thinking failed"
                        )
        if on_activity is not None:
            for rec in transcript.values():
                if (
                    rec.get("kind") in ("thinking", "text")
                    and rec.get("id")
                    and rec.get("text")
                ):
                    await on_activity(
                        {
                            "headline": rec["text"],
                            "label": "Thinking"
                            if rec["kind"] == "thinking"
                            else "Writing a note",
                            "kind": "thinking",
                            "id": rec["id"],
                        }
                    )
        # Persist the full transcript for offline evaluation (best-effort).
        if log_dir is not None:
            write_agent_activity_log(
                log_dir,
                run_id=getattr(run_store, "run_id", title),
                execution_id=getattr(run_store, "execution_id", None),
                session_id=session_id,
                prompt=prompt,
                databases=list(getattr(run_store, "database_paths", {}) or {}),
                records=list(transcript.values()),
                started_at=session_started,
                ended_at=datetime.now(timezone.utc),
                error=session_error,
            )
        await client.unsubscribe(session_id)
        if delete_session:
            await client.delete_session(session_id, directory=directory)
