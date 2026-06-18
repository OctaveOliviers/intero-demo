"""SpineRunBroker transport tests — focused on the two STOP semantics.

``request_stop`` (user PAUSE) must flag the run cooperatively WITHOUT terminating
it, so the spine's CancelledError handler can still publish a ``review_summary`` +
``done`` (the run reads as finished early). ``stop`` (DELETE) hard-kills with a
terminal error. Getting these confused would either hang the stream or surface a
"failed" run where the user asked for a graceful finish.

Run: ``python3 -m core.running.tests.stream_runner``
"""

import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from core.running.stream_runner import SpineRunBroker  # noqa: E402

_REVIEW_SUMMARY = {
    "type": "review_summary",
    "totals": {"cells": 2, "filled": 1, "blocked": 1, "needs_verification": 0, "low_confidence": 0},
    "blocking": {"count": 1, "reason_codes": {"NOT_LOCATED": 1}, "focus": []},
    "verification": {"pending": 0, "reviewed": 0, "corrected": 0,
                     "focus": {"needs_review": [], "low_confidence": [], "assumptions": []}},
}


class BrokerStopSemanticsTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.run_dir = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    async def _drain(self, broker, run_id):
        return [e async for e in broker.stream_events(run_id)]

    async def test_request_stop_flags_without_terminating_then_finalize_publishes(self):
        broker = SpineRunBroker()
        broker.reserve("r1", self.run_dir)
        self.assertFalse(broker.is_stop_requested("r1"))

        self.assertTrue(broker.request_stop("r1"))
        self.assertTrue(broker.is_stop_requested("r1"))

        # The run is NOT done and NO error was pushed — the spine still owns the
        # terminal events. Publishing the finalize sequence must therefore work.
        await broker.publish("r1", _REVIEW_SUMMARY)
        await broker.publish("r1", {"type": "done"})
        events = await self._drain(broker, "r1")
        kinds = [e["type"] for e in events]
        self.assertEqual(kinds, ["review_summary", "done"])
        self.assertNotIn("error", kinds)

    async def test_request_stop_unknown_or_finished_run_returns_false(self):
        broker = SpineRunBroker()
        self.assertFalse(broker.request_stop("nope"))
        self.assertFalse(broker.is_stop_requested("nope"))

        broker.reserve("r2", self.run_dir)
        await broker.publish("r2", _REVIEW_SUMMARY)
        await broker.publish("r2", {"type": "done"})  # run now terminal/done
        self.assertFalse(broker.request_stop("r2"))

    async def test_stop_still_hard_kills_with_terminal_error(self):
        broker = SpineRunBroker()
        broker.reserve("r3", self.run_dir)
        self.assertTrue(await broker.stop("r3"))
        events = await self._drain(broker, "r3")
        self.assertEqual([e["type"] for e in events], ["error"])
        self.assertIn("stopped", events[0]["message"].lower())
        # status.json reflects the hard stop.
        import json
        status = json.loads((self.run_dir / "status.json").read_text())
        self.assertEqual(status["status"], "stopped")


if __name__ == "__main__":
    unittest.main(verbosity=2)
