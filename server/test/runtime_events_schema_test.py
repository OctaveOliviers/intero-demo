"""The backend's emitted stream events must validate against the frozen
machine contract (specs/product/contracts/runtime-events.schema.json) — the same
schema the front-end mock timelines are tested against, so the two sides
cannot drift apart silently.

Canonical builder outputs are validated directly; payload shapes table population
assembles inline (workbook_created, cell_update, refresh_summary, done,
error) are validated as representative literals mirroring their emitters in
server/routes/table_populations.py and core/table_population/populate.py.
"""

import json
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

from core import table_population
from core.table_population.events import build_activity_event

_SCHEMA_PATH = (
    Path(__file__).resolve().parents[2]
    / "specs"
    / "product"
    / "contracts"
    / "runtime-events.schema.json"
)
_VALIDATOR = Draft202012Validator(json.loads(_SCHEMA_PATH.read_text()))


def _assert_valid(event: dict) -> None:
    errors = sorted(_VALIDATOR.iter_errors(event), key=str)
    assert not errors, f"{event.get('type')}: {[e.message for e in errors]}"


def _assert_invalid(event: dict) -> None:
    assert any(_VALIDATOR.iter_errors(event)), f"expected invalid: {event}"


class RuntimeEventsSchemaTest(unittest.TestCase):
    def test_activity_builder_outputs_validate(self):
        _assert_valid(build_activity_event("Preparing the audit."))
        _assert_valid(
            build_activity_event(
                "Reading the notes.",
                detail="Per-cell evidence.",
                name="sql_execute",
                status="running",
            )
        )

    def test_activity_requires_headline(self):
        with self.assertRaises(ValueError):
            build_activity_event("   ")
        _assert_invalid({"type": "activity"})

    def test_review_summary_builder_output_validates(self):
        _assert_valid(table_population.build_review_summary_event([]))

    def test_workbook_created_shape_validates(self):
        # Mirrors the emit in server/routes/table_populations.py::_execute_table_population_session.
        _assert_valid(
            {
                "type": "workbook_created",
                "label": "result.xlsx",
                "sheets": [{"name": "ALL", "data": [["Patient code"], [None]]}],
                "cellMetadata": {},
            }
        )

    def test_cell_update_shape_validates(self):
        # Mirrors core/table_population/populate.py TablePopulationContext.update's payload.
        _assert_valid(
            {
                "type": "cell_update",
                "sheet": "ALL",
                "cells": [
                    {
                        "ref": "A2",
                        "value": "P-0001",
                        "meta": {
                            "field": "all/patient_code",
                            "member": "P-0001",
                            "kind": "direct",
                            "state": "filled",
                            "confidence": "high",
                        },
                    }
                ],
            }
        )

    def test_refresh_summary_and_done_shapes_validate(self):
        # Mirrors server/routes/table_populations.py::_build_refresh_summary.
        delta = {
            "new_members_count": 2,
            "departed_members_count": 1,
            "retried_blocked_count": 3,
            "resolved_blocked_count": 2,
            "remaining_blocked_count": 1,
            "updated_cells_count": 14,
        }
        _assert_valid({"type": "refresh_summary", "summary": delta})
        _assert_valid({"type": "done"})
        _assert_valid({"type": "done", "summary": delta})

    def test_error_shape_validates(self):
        _assert_valid({"type": "error", "message": "Table population stopped by user."})
        _assert_valid(
            {
                "type": "error",
                "message": "Database connection lost.",
                "scope": "NICU!region:outcomes",
                "executionId": "exec-2",
            }
        )
        _assert_invalid({"type": "error"})

    def test_legacy_vocabulary_is_rejected(self):
        _assert_invalid({"type": "thinking", "headline": "x"})
        _assert_invalid({"type": "tool", "name": "sql", "status": "ok"})
        _assert_invalid({"type": "delta", "text": "x"})


if __name__ == "__main__":
    unittest.main()
