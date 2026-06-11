"""Unit tests for canonical strict-v2 run event builders.

Run: ``python3 -m core.running.tests.events``
"""

import unittest

from core.running.events import build_activity_event, build_review_summary_event, event_payload
from core.store import Cell


class EventBuildersTest(unittest.TestCase):
    def test_activity_builder_emits_required_and_optional_v2_keys_only(self):
        event = build_activity_event(
            "Prepared 10 cells.",
            detail="detail",
            name="tier",
            status="ok",
        )
        self.assertEqual(
            event,
            {
                "type": "activity",
                "headline": "Prepared 10 cells.",
                "detail": "detail",
                "name": "tier",
                "status": "ok",
            },
        )
        self.assertNotIn("summary", event)

    def test_review_summary_builder_shape_and_counts(self):
        cells = [
            Cell(run_id="r1", ref="S!A1", state="filled"),
            Cell(run_id="r1", ref="S!A2", state="blocked", reason_code="NOT_LOCATED"),
            Cell(run_id="r1", ref="S!A3", state="blocked", reason_detail="Missing chart"),
            Cell(run_id="r1", ref="S!A4", state="filled", review_state="not_reviewed"),
            Cell(run_id="r1", ref="S!A5", review_state="reviewed", corrected=True, confidence="low", hypothesis="Assumed from chart"),
        ]
        event = build_review_summary_event(cells)
        self.assertEqual(event["type"], "review_summary")
        self.assertNotIn("summary", event)
        self.assertEqual(
            event["totals"],
            {"cells": 5, "filled": 2, "blocked": 2, "needs_verification": 1, "low_confidence": 1},
        )
        self.assertEqual(event["blocking"]["count"], 2)
        self.assertEqual(
            event["blocking"]["reason_codes"],
            {"NOT_LOCATED": 1, "UNSPECIFIED": 1},
        )
        self.assertEqual(len(event["blocking"]["focus"]), 2)
        self.assertIn("sample_refs", event["blocking"]["focus"][0])
        self.assertEqual(
            event["verification"],
            {
                "pending": 1,
                "reviewed": 1,
                "corrected": 1,
                "focus": {
                    "needs_review": [{"ref": "S!A4", "field": None, "member": None, "state": "filled"}],
                    "low_confidence": [{"ref": "S!A5", "confidence": "low", "rationale": "Assumed from chart"}],
                    "assumptions": [{"ref": "S!A5", "hypothesis": "Assumed from chart"}],
                },
            },
        )

    def test_event_payload_drops_event_name(self):
        self.assertEqual(
            event_payload({"type": "activity", "headline": "hello", "status": "ok"}),
            {"headline": "hello", "status": "ok"},
        )

    def test_activity_builder_requires_non_empty_headline(self):
        with self.assertRaises(ValueError):
            build_activity_event("   ")


if __name__ == "__main__":
    unittest.main(verbosity=2)
