"""A client reconnecting to a run must never block on an empty queue.

When the frontend reopens an in-flight run after a page reload it re-attaches an
SSE stream. If the run already finished (and the original consumer drained its
events) the broker has a terminal `_RunState` with an empty queue — a naive
`await queue.get()` would hang forever. `stream_events` synthesizes the terminal
event in that case so the client stops cleanly and keeps its fetched snapshot,
while still draining a buffered fast-finish and streaming a live run.
"""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path

from core.running.stream_runner import SpineRunBroker


async def _collect(agen, timeout: float = 2.0) -> list[str]:
    """Drain an async event generator, flagging a hang instead of blocking."""
    out: list[str] = []
    while True:
        try:
            ev = await asyncio.wait_for(agen.__anext__(), timeout=timeout)
        except StopAsyncIteration:
            return out
        except asyncio.TimeoutError:
            out.append("HANG")
            return out
        out.append(ev["type"])


class StreamReconnectTest(unittest.IsolatedAsyncioTestCase):
    async def test_reconnect_to_drained_finished_run_does_not_hang(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            broker = SpineRunBroker()
            broker.reserve("r", Path(tmp))
            await broker.publish("r", {"type": "review_summary"})
            await broker.publish("r", {"type": "done"})

            first = await _collect(broker.stream_events("r"))
            self.assertEqual(first, ["review_summary", "done"])

            # Reconnect after the queue was drained: must synthesize `done`.
            again = await _collect(broker.stream_events("r"))
            self.assertEqual(again, ["done"])

    async def test_first_connect_after_done_drains_buffered_events(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            broker = SpineRunBroker()
            broker.reserve("r", Path(tmp))
            await broker.publish("r", {"type": "review_summary"})
            await broker.publish("r", {"type": "done"})
            # First (and only) consumer connects after done — gets everything.
            got = await _collect(broker.stream_events("r"))
            self.assertEqual(got, ["review_summary", "done"])

    async def test_unknown_run_errors_immediately(self) -> None:
        broker = SpineRunBroker()
        got = await _collect(broker.stream_events("nope"))
        self.assertEqual(got, ["error"])

    async def test_live_run_streams_future_events(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            broker = SpineRunBroker()
            broker.reserve("r", Path(tmp))
            agen = broker.stream_events("r")

            async def feed():
                await asyncio.sleep(0.05)
                await broker.publish("r", {"type": "cell_update"})
                await broker.publish("r", {"type": "review_summary"})
                await broker.publish("r", {"type": "done"})

            task = asyncio.create_task(feed())
            got = await _collect(agen)
            await task
            self.assertEqual(got, ["cell_update", "review_summary", "done"])


if __name__ == "__main__":
    unittest.main()
