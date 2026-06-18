"""Canonical spine stream transport for `/api/runs/{id}/stream`.

This module is the active event-bus/runtime seam used by the spine/orchestrator
run path. It owns only run-stream transport concerns (reserve/publish/stop/
stream) and agent-client access for Tier 3 setup.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, AsyncIterator, Optional


def _write_status(run_dir: Path, status: str, detail: str | None = None) -> None:
    payload: dict[str, Any] = {"status": status}
    if detail:
        payload["detail"] = detail
    try:
        (run_dir / "status.json").write_text(json.dumps(payload), encoding="utf-8")
    except OSError:
        pass


class _RunState:
    def __init__(self, run_dir: Path):
        self.queue: asyncio.Queue[dict] = asyncio.Queue()
        self.status: str = "running"
        self.done: bool = False
        self.run_dir: Path = run_dir
        self.review_summary_emitted: bool = False
        # Set by request_stop (user pause): a cooperative signal the spine reads
        # in its CancelledError handler to FINALIZE gracefully (emit a
        # review_summary + done) rather than error out. Distinct from stop(),
        # which hard-kills with an error (the delete path).
        self.stop_requested: bool = False


class SpineRunBroker:
    def __init__(self, agent_client: Any | None = None) -> None:
        self._agent_client = agent_client
        self._runs: dict[str, _RunState] = {}
        self._reserved: dict[str, _RunState] = {}

    def agent_client(self) -> Any | None:
        return self._agent_client

    def reserve(self, run_id: str, run_dir: Path) -> None:
        if run_id in self._runs or run_id in self._reserved:
            return
        self._reserved[run_id] = _RunState(run_dir)
        _write_status(run_dir, "running")

    async def publish(self, run_id: str, event: dict) -> None:
        state = self._reserved.get(run_id) or self._runs.get(run_id)
        if state is None or state.done:
            return
        etype = event.get("type")
        if etype == "review_summary":
            if state.review_summary_emitted:
                await self.fail(run_id, "duplicate review_summary event")
                return
            state.review_summary_emitted = True
        if etype == "done" and not state.review_summary_emitted:
            await self.fail(run_id, "done emitted before review_summary")
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
        state.status = "error"
        state.done = True
        _write_status(state.run_dir, "error", message)
        await state.queue.put({"type": "error", "message": message})
        self._runs[run_id] = state

    async def stop(self, run_id: str) -> bool:
        state = self._runs.get(run_id) or self._reserved.get(run_id)
        if state is None or state.done:
            return False
        state.status = "stopped"
        state.done = True
        _write_status(state.run_dir, "stopped", "Stopped by user.")
        await state.queue.put({"type": "error", "message": "Run stopped by user."})
        self._reserved.pop(run_id, None)
        self._runs[run_id] = state
        return True

    def request_stop(self, run_id: str) -> bool:
        """Cooperative stop for a USER PAUSE: flag the run so the spine finalizes
        with a summary instead of erroring. Unlike :meth:`stop`, this does NOT
        mark the run done or push a terminal event — the spine's CancelledError
        handler still owns emitting ``review_summary`` + ``done`` (so the broker's
        "review_summary precedes done" invariant holds). Returns True if a live
        run was flagged, False if it was unknown/already finished."""
        state = self._runs.get(run_id) or self._reserved.get(run_id)
        if state is None or state.done:
            return False
        state.stop_requested = True
        return True

    def is_stop_requested(self, run_id: str) -> bool:
        state = self._runs.get(run_id) or self._reserved.get(run_id)
        return state is not None and state.stop_requested

    async def stream_events(self, run_id: str) -> AsyncIterator[dict]:
        state = self._runs.get(run_id) or self._reserved.get(run_id)
        if state is None:
            yield {"type": "error", "message": f"unknown run: {run_id}"}
            return
        while True:
            # A client reconnecting to a run whose events were already drained
            # by the original consumer (e.g. a page reload after the run
            # finished) must not block forever on an empty queue. If the run is
            # already terminal and nothing is buffered, synthesize the terminal
            # event so the client stops cleanly and keeps its fetched snapshot.
            # A still-running run, or one with buffered events, falls through to
            # the normal blocking drain — so a live reload streams future events
            # and a fast first-connect still gets everything the queue holds.
            if state.done and state.queue.empty():
                if state.status == "error":
                    yield {"type": "error", "message": "run already finished"}
                else:
                    yield {"type": "done"}
                return
            event = await state.queue.get()
            yield event
            if event.get("type") in ("done", "error"):
                return


# Runtime singleton set by `core.runtime.Runtime.startup`.
runner: Optional[SpineRunBroker] = None

