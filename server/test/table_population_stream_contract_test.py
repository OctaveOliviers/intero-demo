import unittest
import json
import asyncio
from types import SimpleNamespace

from core import table_population
from server.routes import table_populations as table_populations_route


class _FakeRunner:
    def __init__(self, events):
        self._events = events

    async def stream_session_events(self, _run_id):
        for event in self._events:
            yield event


# These tests cover the SSE framing/ordering contract, not authorization. Bypass
# the owner-only gate so the table-population id need not be seeded here.
_OWNER_REQUEST = SimpleNamespace(
    state=SimpleNamespace(user={"id": "u", "role": "clinician"}, user_id="u")
)


class TablePopulationStreamContractTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._orig_gate = table_populations_route._require_table_population_owner
        table_populations_route._require_table_population_owner = lambda *a, **k: {
            "id": "u"
        }

    def tearDown(self) -> None:
        table_populations_route._require_table_population_owner = self._orig_gate

    @staticmethod
    def _parse_data_frame(frame: str) -> dict:
        assert frame.startswith("data: "), frame
        assert frame.endswith("\n\n"), frame
        assert "event:" not in frame, frame
        payload = frame[len("data: ") :].strip()
        event = json.loads(payload)
        assert isinstance(event.get("type"), str), event
        return event

    def test_encode_sse_data_message_uses_data_only_framing(self):
        payload = {"type": "activity", "headline": "Preparing workbook."}
        frame = table_populations_route._encode_sse_data_message(payload)
        self.assertTrue(frame.startswith("data: "))
        self.assertTrue(frame.endswith("\n\n"))
        self.assertNotIn("\nevent:", frame)
        self.assertIn('"type": "activity"', frame)

    async def test_stream_endpoint_yields_data_only_frames(self):
        previous_runner = table_population.get_session_relay()
        table_population.set_session_relay(_FakeRunner([{"type": "done"}]))
        try:
            response = await table_populations_route.stream_table_population_events(
                "r1", _OWNER_REQUEST
            )
            first = await response.body_iterator.__anext__()
        finally:
            table_population.set_session_relay(previous_runner)

        self.assertEqual(response.media_type, "text/event-stream")
        self.assertEqual(response.headers.get("Cache-Control"), "no-cache")
        self.assertEqual(first, 'data: {"type": "done"}\n\n')
        self.assertNotIn("event:", first)

    async def test_stream_success_sequence_has_review_summary_before_done(self):
        previous_runner = table_population.get_session_relay()
        runner = table_population.TablePopulationSessionRelay()
        table_population.set_session_relay(runner)
        review_summary = {
            "type": "review_summary",
            "totals": {
                "cells": 1,
                "filled": 1,
                "blocked": 0,
                "needs_verification": 0,
                "low_confidence": 0,
            },
            "blocking": {"count": 0, "reason_codes": {}, "focus": []},
            "verification": {
                "pending": 0,
                "reviewed": 0,
                "corrected": 0,
                "focus": {"needs_review": [], "low_confidence": [], "assumptions": []},
            },
        }
        try:
            runner.open_session("r1", table_populations_route.ARTIFACTS_DIR / "r1")
            await runner.publish_session_event(
                "r1",
                {
                    "type": "workbook_created",
                    "label": "result.xlsx",
                    "sheets": [],
                    "cellMetadata": {},
                },
            )
            await runner.publish_session_event("r1", review_summary)
            await runner.publish_session_event("r1", {"type": "done"})
            response = await table_populations_route.stream_table_population_events(
                "r1", _OWNER_REQUEST
            )
            events = [
                self._parse_data_frame(frame) async for frame in response.body_iterator
            ]
        finally:
            table_population.set_session_relay(previous_runner)

        self.assertEqual(response.media_type, "text/event-stream")
        kinds = [e["type"] for e in events]
        self.assertIn("review_summary", kinds)
        self.assertIn("done", kinds)
        self.assertLess(kinds.index("review_summary"), kinds.index("done"))
        self.assertEqual(kinds[-1], "done")
        self.assertNotIn("error", kinds)

    async def test_stream_failure_sequence_ends_with_error_without_success_terminal(
        self,
    ):
        previous_runner = table_population.get_session_relay()
        runner = table_population.TablePopulationSessionRelay()
        table_population.set_session_relay(runner)
        try:
            runner.open_session("r2", table_populations_route.ARTIFACTS_DIR / "r2")
            await runner.publish_session_event(
                "r2", {"type": "activity", "headline": "Preparing workbook."}
            )
            await runner.publish_session_event(
                "r2", {"type": "error", "message": "failed"}
            )
            await runner.publish_session_event(
                "r2", {"type": "done"}
            )  # ignored after terminal error
            response = await table_populations_route.stream_table_population_events(
                "r2", _OWNER_REQUEST
            )
            events = [
                self._parse_data_frame(frame) async for frame in response.body_iterator
            ]
        finally:
            table_population.set_session_relay(previous_runner)

        kinds = [e["type"] for e in events]
        self.assertEqual(kinds[-1], "error")
        self.assertNotIn("done", kinds)
        self.assertNotIn("review_summary", kinds)

    async def test_table_population_event_publisher_preserves_source_order_under_async_delays(
        self,
    ):
        observed: list[str] = []
        original_publish = table_populations_route._publish_event

        async def delayed_publish(_run_id: str, event: dict) -> None:
            delays = {
                "activity": 0.02,
                "review_summary": 0.0,
                "done": 0.0,
            }
            await asyncio.sleep(delays.get(str(event.get("type")), 0.0))
            observed.append(str(event.get("type")))

        table_populations_route._publish_event = delayed_publish
        publisher = table_populations_route._OrderedSessionEventRelay("r-order")
        try:
            publisher.emit({"type": "activity", "headline": "Preparing workbook."})
            publisher.emit(
                {
                    "type": "review_summary",
                    "totals": {
                        "cells": 1,
                        "filled": 1,
                        "blocked": 0,
                        "needs_verification": 0,
                        "low_confidence": 0,
                    },
                    "blocking": {"count": 0, "reason_codes": {}, "focus": []},
                    "verification": {
                        "pending": 0,
                        "reviewed": 0,
                        "corrected": 0,
                        "focus": {
                            "needs_review": [],
                            "low_confidence": [],
                            "assumptions": [],
                        },
                    },
                }
            )
            publisher.emit({"type": "done"})
            await publisher.aclose()
        finally:
            table_populations_route._publish_event = original_publish

        self.assertEqual(observed, ["activity", "review_summary", "done"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
