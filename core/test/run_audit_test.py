"""Tests for the opencode SSE event normalizer and the W0.3 run-streaming events."""

import asyncio
import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from openpyxl import Workbook  # noqa: E402

from core.running.run_audit import (  # noqa: E402
    OpenCodeRunner,
    _ServerRunState,
    cell_updates_from_metadata,
    normalize_server_event,
    review_summary_from_metadata,
    read_cell_metadata,
)
from core.running.workbook_stream import read_workbook_sheets  # noqa: E402


class NormalizeServerEventTest(unittest.TestCase):
    def test_text_part(self):
        ev = {"type": "message.part.updated", "properties": {"sessionID": "ses_1", "part": {"id": "prt_1", "type": "text", "text": "hello"}}}
        self.assertEqual(
            normalize_server_event(ev),
            {"type": "activity", "headline": "Updating run activity.", "detail": "hello"},
        )

    def test_reasoning_part(self):
        ev = {"type": "message.part.updated", "properties": {"sessionID": "ses_1", "part": {"id": "prt_1", "type": "reasoning", "text": "thinking"}}}
        self.assertEqual(
            normalize_server_event(ev),
            {
                "type": "activity",
                "headline": "Thinking through remaining fields.",
                "detail": "thinking",
            },
        )

    def test_tool_part(self):
        ev = {"type": "message.part.updated", "properties": {"sessionID": "ses_1", "part": {"id": "prt_1", "type": "tool", "tool": "populate_region", "state": {"status": "running"}}}}
        out = normalize_server_event(ev)
        self.assertEqual(out["type"], "activity")
        self.assertEqual(out["headline"], "Running tool: populate_region.")
        self.assertEqual(out["name"], "populate_region")
        self.assertEqual(out["status"], "running")

    def test_delta_is_ignored_in_strict_v2(self):
        ev = {"type": "message.part.delta", "properties": {"sessionID": "ses_1", "partID": "prt_1", "field": "text", "delta": "hel"}}
        self.assertIsNone(normalize_server_event(ev))

    def test_part_types_is_still_updated_from_snapshot(self):
        # A snapshot should still populate part_types (used for internal
        # bookkeeping), even though delta events are no longer emitted.
        part_types: dict[str, str] = {}
        snap = {"type": "message.part.updated", "properties": {"part": {"id": "prt_1", "type": "reasoning", "text": "x"}}}
        normalize_server_event(snap, part_types)
        self.assertEqual(part_types["prt_1"], "reasoning")

    def test_delta_non_text_field_ignored(self):
        ev = {"type": "message.part.delta", "properties": {"partID": "prt_1", "field": "title", "delta": "z"}}
        self.assertIsNone(normalize_server_event(ev))

    def test_session_error(self):
        ev = {"type": "session.error", "properties": {"sessionID": "ses_1", "error": {"message": "boom"}}}
        out = normalize_server_event(ev)
        self.assertEqual(out, {"type": "error", "message": "boom"})

    def test_session_idle_is_not_normalized(self):
        # Completion is handled by the runner, not the normalizer.
        self.assertIsNone(normalize_server_event({"type": "session.idle", "properties": {"sessionID": "ses_1"}}))

    def test_normalizer_never_emits_legacy_event_shapes(self):
        events = [
            {"type": "message.part.updated", "properties": {"part": {"id": "p1", "type": "text", "text": "hello"}}},
            {"type": "message.part.updated", "properties": {"part": {"id": "p2", "type": "reasoning", "text": "think"}}},
            {"type": "message.part.updated", "properties": {"part": {"id": "p3", "type": "tool", "tool": "sql_execute", "state": {"status": "ok"}}}},
            {"type": "session.error", "properties": {"error": {"message": "boom"}}},
        ]
        allowed = {"activity", "error"}
        for raw in events:
            out = normalize_server_event(raw, {})
            self.assertIsNotNone(out)
            self.assertIn(out["type"], allowed)
            self.assertNotIn("summary", out)
            self.assertNotIn("partID", out)


def _make_workbook(path: Path) -> None:
    """A structured, body-empty workbook like the template copied in at run start."""
    wb = Workbook()
    all_sheet = wb.active
    all_sheet.title = "ALL"
    all_sheet.append(["Patient", "pH", "Outcome"])  # header row; body left blank
    all_sheet.append([None, None, None])
    nicu = wb.create_sheet("NICU")
    nicu.append(["Patient", "Cooled"])
    nicu.append([None, None])
    wb.save(path)


def _drain(queue) -> list[dict]:
    out: list[dict] = []
    while not queue.empty():
        out.append(queue.get_nowait())
    return out


class ReadWorkbookSheetsTest(unittest.TestCase):
    def test_reads_structured_sheets(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "result.xlsx"
            _make_workbook(path)
            sheets = read_workbook_sheets(path)
        self.assertEqual([s["name"] for s in sheets], ["ALL", "NICU"])
        # Header present — structured workbook, no values written yet.
        self.assertEqual(sheets[0]["data"][0], ["Patient", "pH", "Outcome"])
        # Per-column meta mirrors the /workbook serialization shape.
        self.assertIn("columns", sheets[0]["meta"])
        self.assertEqual(len(sheets[0]["meta"]["columns"]), 3)


class CellUpdatesFromMetadataTest(unittest.TestCase):
    def test_groups_by_sheet_and_passes_meta_through(self):
        metadata = {
            "ALL!A2": {"value": "P-0001", "sql": "SELECT …", "explanation": "Copied."},
            "ALL!B2": {"value": "7.28", "sql": "SELECT …"},
            "NICU!B2": {"value": "Yes", "sql": "SELECT …"},
        }
        seen: set[str] = set()
        events = cell_updates_from_metadata(metadata, seen)
        by_sheet = {e["sheet"]: e for e in events}
        self.assertEqual(set(by_sheet), {"ALL", "NICU"})
        all_cells = {c["ref"]: c for c in by_sheet["ALL"]["cells"]}
        self.assertEqual(all_cells["A2"]["value"], "P-0001")
        # meta is the sidecar entry, passed through verbatim (Lane A owns its shape).
        self.assertEqual(all_cells["A2"]["meta"]["explanation"], "Copied.")
        self.assertEqual(seen, {"ALL!A2", "ALL!B2", "NICU!B2"})

    def test_idempotent_only_emits_new_cells(self):
        seen: set[str] = set()
        md = {"ALL!A2": {"value": "x", "sql": "S"}}
        self.assertEqual(len(cell_updates_from_metadata(md, seen)), 1)
        # Same metadata again → nothing new.
        self.assertEqual(cell_updates_from_metadata(md, seen), [])
        # A newly-landed cell streams on its own.
        md["ALL!B2"] = {"value": "y", "sql": "S"}
        events = cell_updates_from_metadata(md, seen)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["cells"][0]["ref"], "B2")

    def test_blocked_cell_omits_value(self):
        seen: set[str] = set()
        md = {"ALL!C2": {"state": "blocked", "reason_code": "IDENTITY_UNRESOLVED"}}
        events = cell_updates_from_metadata(md, seen)
        cell = events[0]["cells"][0]
        self.assertNotIn("value", cell)
        self.assertEqual(cell["meta"]["state"], "blocked")

    def test_skips_non_cell_entries(self):
        seen: set[str] = set()
        md = {"note": "not a cell", "ALL!A2": {"value": "x", "sql": "S"}}
        events = cell_updates_from_metadata(md, seen)
        self.assertEqual(seen, {"ALL!A2"})


class EmitProgressTest(unittest.TestCase):
    """The chip fires early (workbook_created), cells stream as they land, and a
    cell is never re-sent — the W0.3 §1 contract for the file-driven events."""

    def _state(self, run_dir: Path) -> _ServerRunState:
        return _ServerRunState(run_dir, session_id="")

    def test_chip_early_then_per_region_cell_updates(self):
        runner = OpenCodeRunner(client=None)
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            _make_workbook(run_dir / "result.xlsx")
            state = self._state(run_dir)

            # First tick: workbook exists, no cells filled yet → just the chip.
            runner._emit_progress("r1", state)
            events = _drain(state.queue)
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]["type"], "workbook_created")
            self.assertEqual(events[0]["label"], "result.xlsx")
            self.assertEqual([s["name"] for s in events[0]["sheets"]], ["ALL", "NICU"])
            self.assertEqual(events[0]["cellMetadata"], {})
            self.assertTrue(state.workbook_emitted)

            # A region lands → a cell_update per sheet, no second chip.
            (run_dir / "metadata.json").write_text(json.dumps({
                "ALL!A2": {"value": "P-0001", "sql": "SELECT …"},
                "ALL!B2": {"value": "7.28", "sql": "SELECT …"},
                "NICU!B2": {"value": "Yes", "sql": "SELECT …"},
            }), encoding="utf-8")
            runner._emit_progress("r1", state)
            events = _drain(state.queue)
            self.assertTrue(all(e["type"] == "cell_update" for e in events))
            self.assertEqual({e["sheet"] for e in events}, {"ALL", "NICU"})

            # Re-poll with no new cells → nothing emitted.
            runner._emit_progress("r1", state)
            self.assertEqual(_drain(state.queue), [])

    def test_no_workbook_yet_emits_nothing(self):
        runner = OpenCodeRunner(client=None)
        with tempfile.TemporaryDirectory() as d:
            state = self._state(Path(d))  # no result.xlsx
            runner._emit_progress("r1", state)
            self.assertEqual(_drain(state.queue), [])
            self.assertFalse(state.workbook_emitted)

    def test_finish_flushes_then_emits_terminal_done(self):
        runner = OpenCodeRunner(client=None)
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            _make_workbook(run_dir / "result.xlsx")
            (run_dir / "metadata.json").write_text(
                json.dumps({"ALL!A2": {"value": "P-0001", "sql": "S"}}), encoding="utf-8"
            )
            state = self._state(run_dir)
            runner._runs["r1"] = state
            runner._finish("r1", state)
            events = _drain(state.queue)
            self.assertEqual(events[0]["type"], "workbook_created")
            self.assertIn("cell_update", [e["type"] for e in events])
            self.assertEqual([e["type"] for e in events].count("review_summary"), 1)
            self.assertLess(
                [e["type"] for e in events].index("review_summary"),
                [e["type"] for e in events].index("done"),
            )
            # done is terminal and carries no chip fields.
            self.assertEqual(events[-1], {"type": "done"})
            self.assertTrue(state.done)

    def test_finish_without_workbook_emits_error_without_success_terminal(self):
        runner = OpenCodeRunner(client=None)
        with tempfile.TemporaryDirectory() as d:
            state = self._state(Path(d))
            runner._runs["r1"] = state
            runner._finish("r1", state)
            events = _drain(state.queue)
            kinds = [e["type"] for e in events]
            self.assertEqual(kinds[-1], "error")
            self.assertNotIn("done", kinds)
            self.assertNotIn("review_summary", kinds)


class RunnerPublishInvariantTest(unittest.TestCase):
    def test_done_before_review_summary_is_rejected(self):
        async def run() -> None:
            runner = OpenCodeRunner(client=None)
            with tempfile.TemporaryDirectory() as d:
                run_dir = Path(d)
                runner.reserve("r1", run_dir)
                await runner.publish("r1", {"type": "workbook_created", "label": "result.xlsx", "sheets": [], "cellMetadata": {}})
                await runner.publish("r1", {"type": "done"})
                events = [e async for e in runner.stream_events("r1")]
                self.assertEqual(events[-1]["type"], "error")
                self.assertIn("review_summary", events[-1]["message"])

        import asyncio
        asyncio.run(run())

    def test_duplicate_review_summary_is_rejected(self):
        async def run() -> None:
            runner = OpenCodeRunner(client=None)
            with tempfile.TemporaryDirectory() as d:
                run_dir = Path(d)
                runner.reserve("r1", run_dir)
                summary = {
                    "type": "review_summary",
                    "totals": {"cells": 1, "filled": 1, "blocked": 0, "needs_verification": 0, "low_confidence": 0},
                    "blocking": {"count": 0, "reason_codes": {}, "focus": []},
                    "verification": {"pending": 0, "reviewed": 0, "corrected": 0, "focus": {"needs_review": [], "low_confidence": [], "assumptions": []}},
                }
                await runner.publish("r1", summary)
                await runner.publish("r1", summary)
                events = [e async for e in runner.stream_events("r1")]
                self.assertIn("review_summary", [e["type"] for e in events])
                self.assertEqual(events[-1]["type"], "error")
                self.assertIn("duplicate", events[-1]["message"])

        import asyncio
        asyncio.run(run())


class ReviewSummaryFromMetadataTest(unittest.TestCase):
    def test_builds_strict_v2_summary_from_sidecar(self):
        metadata = {
            "ALL!A2": {"value": "x", "state": "filled"},
            "ALL!B2": {"state": "needs_verification", "review_state": "not_reviewed"},
            "ALL!C2": {"state": "blocked", "reason_code": "NOT_LOCATED"},
        }
        summary = review_summary_from_metadata("r1", metadata)
        self.assertEqual(summary["type"], "review_summary")
        self.assertEqual(summary["totals"]["cells"], 3)
        self.assertEqual(summary["totals"]["blocked"], 1)
        self.assertEqual(summary["totals"]["needs_verification"], 1)
        self.assertEqual(summary["blocking"]["reason_codes"]["NOT_LOCATED"], 1)

    def test_partial_sidecar_yields_lower_bound_summary(self):
        # Legacy compatibility path: summary uses only entries currently present
        # in metadata.json (no extrapolation for unseen cells).
        metadata = {
            "ALL!A2": {"value": "x", "state": "filled"},
        }
        summary = review_summary_from_metadata("r1", metadata)
        self.assertEqual(summary["type"], "review_summary")
        self.assertEqual(summary["totals"]["cells"], 1)
        self.assertEqual(summary["totals"]["filled"], 1)
        self.assertEqual(summary["totals"]["blocked"], 0)
        self.assertEqual(summary["totals"]["needs_verification"], 0)


class ReusedRunIdLifecycleTest(unittest.TestCase):
    def test_reused_run_id_reserve_publish_stream_emits_fresh_events(self):
        runner = OpenCodeRunner(client=None)
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            runner.reserve("r1", run_dir)
            summary = {
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

            async def _collect_once(label: str) -> list[dict]:
                await runner.publish("r1", {"type": "activity", "headline": label})
                await runner.publish("r1", summary)
                await runner.publish("r1", {"type": "done"})

                async def _consume() -> list[dict]:
                    out: list[dict] = []
                    async for event in runner.stream_events("r1"):
                        out.append(event)
                    return out

                return await asyncio.wait_for(_consume(), timeout=1.0)

            first = asyncio.run(_collect_once("first"))
            self.assertEqual(first, [
                {"type": "activity", "headline": "first"},
                summary,
                {"type": "done"},
            ])

            # Simulate refresh by reserving the same run id again.
            runner.reserve("r1", run_dir)
            second = asyncio.run(_collect_once("second"))
            self.assertEqual(second, [
                {"type": "activity", "headline": "second"},
                summary,
                {"type": "done"},
            ])


if __name__ == "__main__":
    unittest.main()
