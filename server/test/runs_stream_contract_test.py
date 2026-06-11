import unittest
import json
import asyncio

from server.routes import runs as runs_route
from core.running.stream_runner import SpineRunBroker


class _FakeRunner:
    def __init__(self, events):
        self._events = events

    async def stream_events(self, _run_id):
        for event in self._events:
            yield event


class RunStreamContractTest(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def _parse_data_frame(frame: str) -> dict:
        assert frame.startswith("data: "), frame
        assert frame.endswith("\n\n"), frame
        assert "event:" not in frame, frame
        payload = frame[len("data: "):].strip()
        event = json.loads(payload)
        assert isinstance(event.get("type"), str), event
        return event

    def test_encode_sse_data_message_uses_data_only_framing(self):
        payload = {"type": "activity", "headline": "Preparing workbook."}
        frame = runs_route._encode_sse_data_message(payload)
        self.assertTrue(frame.startswith("data: "))
        self.assertTrue(frame.endswith("\n\n"))
        self.assertNotIn("\nevent:", frame)
        self.assertIn('"type": "activity"', frame)

    async def test_stream_endpoint_yields_data_only_frames(self):
        previous_runner = runs_route.runner_mod.runner
        runs_route.runner_mod.runner = _FakeRunner([{"type": "done"}])
        try:
            response = await runs_route.stream_run("r1")
            first = await response.body_iterator.__anext__()
        finally:
            runs_route.runner_mod.runner = previous_runner

        self.assertEqual(response.media_type, "text/event-stream")
        self.assertEqual(response.headers.get("Cache-Control"), "no-cache")
        self.assertEqual(first, 'data: {"type": "done"}\n\n')
        self.assertNotIn("event:", first)

    async def test_stream_success_sequence_has_review_summary_before_done(self):
        previous_runner = runs_route.runner_mod.runner
        runner = SpineRunBroker()
        runs_route.runner_mod.runner = runner
        review_summary = {
            "type": "review_summary",
            "totals": {"cells": 1, "filled": 1, "blocked": 0, "needs_verification": 0, "low_confidence": 0},
            "blocking": {"count": 0, "reason_codes": {}, "focus": []},
            "verification": {
                "pending": 0,
                "reviewed": 0,
                "corrected": 0,
                "focus": {"needs_review": [], "low_confidence": [], "assumptions": []},
            },
        }
        try:
            runner.reserve("r1", runs_route.RUNS_DIR / "r1")
            await runner.publish("r1", {"type": "workbook_created", "label": "result.xlsx", "sheets": [], "cellMetadata": {}})
            await runner.publish("r1", review_summary)
            await runner.publish("r1", {"type": "done"})
            response = await runs_route.stream_run("r1")
            events = [self._parse_data_frame(frame) async for frame in response.body_iterator]
        finally:
            runs_route.runner_mod.runner = previous_runner

        self.assertEqual(response.media_type, "text/event-stream")
        kinds = [e["type"] for e in events]
        self.assertIn("review_summary", kinds)
        self.assertIn("done", kinds)
        self.assertLess(kinds.index("review_summary"), kinds.index("done"))
        self.assertEqual(kinds[-1], "done")
        self.assertNotIn("error", kinds)

    async def test_stream_failure_sequence_ends_with_error_without_success_terminal(self):
        previous_runner = runs_route.runner_mod.runner
        runner = SpineRunBroker()
        runs_route.runner_mod.runner = runner
        try:
            runner.reserve("r2", runs_route.RUNS_DIR / "r2")
            await runner.publish("r2", {"type": "activity", "headline": "Preparing workbook."})
            await runner.publish("r2", {"type": "error", "message": "failed"})
            await runner.publish("r2", {"type": "done"})  # ignored after terminal error
            response = await runs_route.stream_run("r2")
            events = [self._parse_data_frame(frame) async for frame in response.body_iterator]
        finally:
            runs_route.runner_mod.runner = previous_runner

        kinds = [e["type"] for e in events]
        self.assertEqual(kinds[-1], "error")
        self.assertNotIn("done", kinds)
        self.assertNotIn("review_summary", kinds)

    async def test_spine_event_publisher_preserves_source_order_under_async_delays(self):
        observed: list[str] = []
        original_publish = runs_route._publish_event

        async def delayed_publish(_run_id: str, event: dict) -> None:
            delays = {
                "activity": 0.02,
                "review_summary": 0.0,
                "done": 0.0,
            }
            await asyncio.sleep(delays.get(str(event.get("type")), 0.0))
            observed.append(str(event.get("type")))

        runs_route._publish_event = delayed_publish
        publisher = runs_route._SpineEventPublisher("r-order")
        try:
            publisher.emit({"type": "activity", "headline": "Preparing workbook."})
            publisher.emit({
                "type": "review_summary",
                "totals": {"cells": 1, "filled": 1, "blocked": 0, "needs_verification": 0, "low_confidence": 0},
                "blocking": {"count": 0, "reason_codes": {}, "focus": []},
                "verification": {
                    "pending": 0,
                    "reviewed": 0,
                    "corrected": 0,
                    "focus": {"needs_review": [], "low_confidence": [], "assumptions": []},
                },
            })
            publisher.emit({"type": "done"})
            await publisher.aclose()
        finally:
            runs_route._publish_event = original_publish

        self.assertEqual(observed, ["activity", "review_summary", "done"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
