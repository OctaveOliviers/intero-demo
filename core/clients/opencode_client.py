"""Async HTTP client for the opencode REST API.

A single shared SSE subscription (`GET /global/event`) fans events out to
per-session queues. This avoids opening one SSE stream per run and matches how
opencode itself models events as a global firehose scoped by sessionID.

Note (opencode 1.14.x): the per-directory `/event` endpoint only emits
``server.connected`` and never carries ``message.part.updated`` — the live
agent activity (reasoning/text/tool parts) is published exclusively on
`/global/event`, wrapped as ``{directory, project, payload: {id,type,properties}}``.
We unwrap ``payload`` and route by sessionID just like before.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


class OpenCodeClient:
    def __init__(self, base_url: str, directory: str, timeout: float = 30.0) -> None:
        self._base = base_url.rstrip("/")
        self._directory = directory
        self._http = httpx.AsyncClient(base_url=self._base, timeout=timeout)
        self._stream_http = httpx.AsyncClient(base_url=self._base, timeout=None)

        self._subscribers: dict[str, asyncio.Queue[dict]] = {}
        self._subscribers_lock = asyncio.Lock()
        self._pump_task: Optional[asyncio.Task] = None
        self._pump_ready = asyncio.Event()

    @property
    def directory(self) -> str:
        return self._directory

    # --- lifecycle ---------------------------------------------------------

    async def start(self) -> None:
        """Open the shared SSE subscription. Must be called before any session."""
        if self._pump_task is not None:
            return
        self._pump_task = asyncio.create_task(self._pump_events())
        # Wait briefly for the stream to be established so subscribers added
        # immediately after won't miss the first events.
        try:
            await asyncio.wait_for(self._pump_ready.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            logger.warning("opencode event stream not ready within 5s; continuing")

    async def close(self) -> None:
        if self._pump_task is not None:
            self._pump_task.cancel()
            try:
                await self._pump_task
            except asyncio.CancelledError:
                pass
            self._pump_task = None
        await self._http.aclose()
        await self._stream_http.aclose()

    # --- REST wrappers -----------------------------------------------------

    async def create_session(
        self, title: Optional[str] = None, directory: Optional[str] = None
    ) -> str:
        body = {"title": title} if title else {}
        r = await self._http.post(
            "/session", params={"directory": directory or self._directory}, json=body
        )
        r.raise_for_status()
        data = r.json()
        return data["id"]

    async def prompt_async(
        self, session_id: str, prompt: str, directory: Optional[str] = None
    ) -> None:
        body = {"parts": [{"type": "text", "text": prompt}]}
        r = await self._http.post(
            f"/session/{session_id}/prompt_async",
            params={"directory": directory or self._directory},
            json=body,
        )
        r.raise_for_status()

    async def abort_session(
        self, session_id: str, directory: Optional[str] = None
    ) -> None:
        try:
            await self._http.post(
                f"/session/{session_id}/abort",
                params={"directory": directory or self._directory},
            )
        except httpx.HTTPError as exc:
            logger.warning("abort_session failed for %s: %s", session_id, exc)

    async def delete_session(
        self, session_id: str, directory: Optional[str] = None
    ) -> None:
        try:
            await self._http.delete(
                f"/session/{session_id}",
                params={"directory": directory or self._directory},
            )
        except httpx.HTTPError as exc:
            logger.warning("delete_session failed for %s: %s", session_id, exc)

    # --- event subscription ------------------------------------------------

    async def subscribe(self, session_id: str) -> asyncio.Queue[dict]:
        async with self._subscribers_lock:
            q: asyncio.Queue[dict] = asyncio.Queue()
            self._subscribers[session_id] = q
            return q

    async def unsubscribe(self, session_id: str) -> None:
        async with self._subscribers_lock:
            self._subscribers.pop(session_id, None)

    async def _pump_events(self) -> None:
        """Single SSE consumer that dispatches events to per-session queues.

        Subscribes to ``/global/event``; each frame is ``{directory, project,
        payload}`` where ``payload`` is the actual ``{id, type, properties}``
        event. We unwrap ``payload`` (and skip the ``sync`` replication frames)
        before routing by sessionID.
        """
        backoff = 1.0
        while True:
            try:
                async with self._stream_http.stream("GET", "/global/event") as r:
                    r.raise_for_status()
                    self._pump_ready.set()
                    backoff = 1.0
                    async for line in r.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if not data:
                            continue
                        try:
                            frame = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        event = (
                            frame.get("payload") if isinstance(frame, dict) else None
                        )
                        if not isinstance(event, dict) or event.get("type") == "sync":
                            continue
                        await self._dispatch(event)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning(
                    "opencode event stream dropped (%s); reconnecting in %.1fs",
                    exc,
                    backoff,
                )
                self._pump_ready.clear()
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 10.0)

    async def _dispatch(self, event: dict) -> None:
        session_id = self._session_id_of(event)
        if not session_id:
            return
        logger.debug("opencode event type=%s session=%s", event.get("type"), session_id)
        q = self._subscribers.get(session_id)
        if q is not None:
            await q.put(event)

    @staticmethod
    def _session_id_of(event: dict) -> Optional[str]:
        """Extract the sessionID from an opencode event.

        opencode nests sessionID differently per event type: lifecycle events
        (``session.idle``/``session.error``) carry it at ``properties.sessionID``,
        but ``message.part.updated`` carries it inside ``properties.part.sessionID``
        and ``message.updated`` inside ``properties.info.sessionID``. Check all
        known locations so content events (reasoning/text/tool) aren't dropped.
        """
        props = event.get("properties") or {}
        sid = props.get("sessionID")
        if sid:
            return sid
        for nested_key in ("part", "info", "message"):
            nested = props.get(nested_key)
            if isinstance(nested, dict) and nested.get("sessionID"):
                return nested["sessionID"]
        return None
