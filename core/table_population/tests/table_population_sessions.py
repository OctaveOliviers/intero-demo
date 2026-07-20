"""Relay lifecycle tests: stale-session eviction on re-open + bounded session map.

Covers bug #2: a refresh reuses the same ``table_population_id``. Before the fix,
``open_session`` no-oped on the lingering ``done=True`` state, ``publish_session_event``
dropped every ``cell_update`` (``state.done``), and ``stream_session_events`` yielded the
prior terminal frame — so re-running a completed population showed ZERO live
updates. The relay must EVICT a finished session when its id is re-opened, so a
fresh session is created and live ``cell_update`` events flow again. Finished
sessions must also not accumulate forever.
"""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path

from core.table_population.table_population_sessions import (
    _MAX_FINISHED_SESSIONS,
    TablePopulationSessionRelay,
)


async def _collect(agen, timeout: float = 2.0) -> list[str]:
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


class SessionEvictionTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.run_dir = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    async def test_reopen_done_session_yields_fresh_live_updates(self) -> None:
        """Re-opening a DONE session id must create a fresh session that receives
        NEW cell_update events — not replay the old terminal frame."""
        broker = TablePopulationSessionRelay()
        broker.open_session("r", self.run_dir)
        await broker.publish_session_event("r", {"type": "review_summary"})
        await broker.publish_session_event("r", {"type": "done"})
        # First run drained.
        first = await _collect(broker.stream_session_events("r"))
        self.assertEqual(first, ["review_summary", "done"])

        # Re-open the SAME id (a refresh). Without eviction this no-ops on the
        # stale done state.
        broker.open_session("r", self.run_dir)

        agen = broker.stream_session_events("r")

        async def feed():
            await asyncio.sleep(0.05)
            await broker.publish_session_event("r", {"type": "cell_update"})
            await broker.publish_session_event("r", {"type": "review_summary"})
            await broker.publish_session_event("r", {"type": "done"})

        task = asyncio.create_task(feed())
        got = await _collect(agen)
        await task
        # The fresh session streams the NEW live events, not the old terminal frame.
        self.assertEqual(got, ["cell_update", "review_summary", "done"])

    async def test_finished_session_is_evicted_on_reopen(self) -> None:
        """A finished session must not linger across a re-open — the relay map
        stays bounded by the number of distinct LIVE ids."""
        broker = TablePopulationSessionRelay()
        broker.open_session("r", self.run_dir)
        await broker.publish_session_event("r", {"type": "review_summary"})
        await broker.publish_session_event("r", {"type": "done"})
        await _collect(broker.stream_session_events("r"))
        # The finished session is parked in _sessions.
        self.assertIn("r", broker._sessions)

        # Re-opening evicts the stale done session (a NEW reserved one replaces it).
        broker.open_session("r", self.run_dir)
        self.assertNotIn("r", broker._sessions)
        self.assertIn("r", broker._reserved)
        self.assertFalse(broker._reserved["r"].done)

    async def test_abort_clears_prior_pause_stop_requested(self) -> None:
        """Bug #7: a pause sets stop_requested; a subsequent abort (delete) must
        CLEAR it. Otherwise the session task's CancelledError handler reads
        is_stop_requested()==True and finalizes the run as 'completed', which
        disagrees with the terminal stop error the abort pushed to the client."""
        broker = TablePopulationSessionRelay()
        broker.open_session("r", self.run_dir)
        self.assertTrue(broker.request_graceful_stop("r"))
        self.assertTrue(broker.is_stop_requested("r"))

        # Delete path: hard abort overrides the prior pause.
        self.assertTrue(await broker.abort_session("r"))
        self.assertFalse(broker.is_stop_requested("r"))

    async def test_reopening_many_times_keeps_map_bounded(self) -> None:
        """Re-running the same id repeatedly (refresh loop) must not grow the
        relay's session map without bound — each re-open evicts the prior
        finished session."""
        broker = TablePopulationSessionRelay()
        for _ in range(5):
            broker.open_session("r", self.run_dir)
            await broker.publish_session_event("r", {"type": "review_summary"})
            await broker.publish_session_event("r", {"type": "done"})
            await _collect(broker.stream_session_events("r"))
        total = len(broker._sessions) + len(broker._reserved)
        self.assertEqual(total, 1)

    async def test_run_once_finished_sessions_do_not_grow_unbounded(self) -> None:
        """Bug #2 (concern B): a population that runs ONCE and is never re-opened
        leaves its finished state parked in _sessions. Across many DISTINCT ids
        the map must stay bounded — the relay reaps the oldest finished sessions
        on terminal instead of retaining every id for the process lifetime."""
        broker = TablePopulationSessionRelay()
        n = _MAX_FINISHED_SESSIONS + 10
        for i in range(n):
            tp_id = f"run-{i}"
            broker.open_session(tp_id, self.run_dir)
            await broker.publish_session_event(tp_id, {"type": "review_summary"})
            await broker.publish_session_event(tp_id, {"type": "done"})
            await _collect(broker.stream_session_events(tp_id))
        # The finished map is capped — it does NOT retain all n distinct ids.
        self.assertLessEqual(len(broker._sessions), _MAX_FINISHED_SESSIONS)
        # The very first run-once session is gone (reaped by later terminals).
        self.assertNotIn("run-0", broker._sessions)

    async def test_aborted_sessions_do_not_grow_unbounded(self) -> None:
        """Bug #2 (concern B): an aborted/deleted population also parks a finished
        _SessionState. These must be reaped too — across many distinct aborted ids
        the map stays bounded."""
        broker = TablePopulationSessionRelay()
        n = _MAX_FINISHED_SESSIONS + 10
        for i in range(n):
            tp_id = f"abort-{i}"
            broker.open_session(tp_id, self.run_dir)
            self.assertTrue(await broker.abort_session(tp_id))
        self.assertLessEqual(len(broker._sessions), _MAX_FINISHED_SESSIONS)
        self.assertNotIn("abort-0", broker._sessions)

    async def test_reap_does_not_regress_reconnect_after_done_on_reused_id(
        self,
    ) -> None:
        """Bug #2 live-update fix must survive the reap: even after MANY other
        distinct populations finish (driving the reap), re-opening a previously
        DONE id still creates a FRESH session that streams new cell_update events
        — never a replay of the prior terminal frame."""
        broker = TablePopulationSessionRelay()
        # Finish + drain the id once.
        broker.open_session("r", self.run_dir)
        await broker.publish_session_event("r", {"type": "review_summary"})
        await broker.publish_session_event("r", {"type": "done"})
        self.assertEqual(
            await _collect(broker.stream_session_events("r")),
            ["review_summary", "done"],
        )
        # Drive the reap with unrelated finished populations.
        for i in range(_MAX_FINISHED_SESSIONS + 5):
            other = f"other-{i}"
            broker.open_session(other, self.run_dir)
            await broker.publish_session_event(other, {"type": "review_summary"})
            await broker.publish_session_event(other, {"type": "done"})
            await _collect(broker.stream_session_events(other))

        # Re-open "r" (a refresh): must yield a fresh live-streaming session.
        broker.open_session("r", self.run_dir)
        agen = broker.stream_session_events("r")

        async def feed():
            await asyncio.sleep(0.05)
            await broker.publish_session_event("r", {"type": "cell_update"})
            await broker.publish_session_event("r", {"type": "review_summary"})
            await broker.publish_session_event("r", {"type": "done"})

        task = asyncio.create_task(feed())
        got = await _collect(agen)
        await task
        self.assertEqual(got, ["cell_update", "review_summary", "done"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
