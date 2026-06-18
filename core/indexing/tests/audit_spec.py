"""T11: the audit-spec builder's MECHANICAL skeleton + prose-only LLM merge.

The altitude invariant: structure (`fields[]` ids/numbers/names/cells/sections)
is extracted from the workbook and is never the LLM's to change — the prose
merge can only annotate. Pins the regression for each killed A5 bug: #2 (row
matched structurally, not by string suffix), #4 (`name` IS the verbatim
header), #3/#7/#8 (no coverage guard to fool — restructuring is impossible).

Run: ``python3 -m core.indexing.tests.audit_spec``
"""

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from core.indexing.build_audit_spec import (  # noqa: E402
    BuilderValidationError,
    _assemble,
    extract_field_skeleton,
    merge_preserved_state,
)


def _sheet(name: str, cells: list[tuple[str, str]]) -> dict:
    return {"name": name, "cells": [{"cell": ref, "value": v} for ref, v in cells]}


class SkeletonTest(unittest.TestCase):
    def test_row_is_matched_structurally_not_by_suffix(self):
        # Bug #2: ref.endswith("1") treated A11/A21/A101 as header cells.
        sheets = [_sheet("ALL", [
            ("A1", "Patient code"), ("B1", "Delivery"),
            ("A11", "data"), ("B21", "data"), ("C101", "data"),
        ])]
        fields, _ = extract_field_skeleton(sheets)
        self.assertEqual([f["cell"] for f in fields], ["A", "B"])

    def test_name_is_the_verbatim_header(self):
        # Bug #4: slugify(header) ≠ slugify(name) broke the FK chain when the
        # LLM cleaned header text — the skeleton copies it verbatim.
        sheets = [_sheet("ALL", [("A1", "Gestation (weeks)")])]
        fields, _ = extract_field_skeleton(sheets)
        self.assertEqual(fields[0]["name"], "Gestation (weeks)")
        self.assertEqual(fields[0]["id"], "gestation_weeks")

    def test_multi_sheet_numbers_continue_and_ids_are_prefixed(self):
        sheets = [
            _sheet("ALL", [("A1", "Patient code"), ("B1", "Delivery")]),
            _sheet("NICU", [("A1", "Patient code")]),
        ]
        fields, sheet_names = extract_field_skeleton(sheets)
        self.assertEqual(sheet_names, ["ALL", "NICU"])
        self.assertEqual(
            [(f["number"], f["id"], f["section"]) for f in fields],
            [(1, "all/patient_code", "ALL"), (2, "all/delivery", "ALL"),
             (3, "nicu/patient_code", "NICU")],
        )

    def test_single_sheet_uses_bare_ids_and_no_section(self):
        fields, _ = extract_field_skeleton([_sheet("Data", [("A1", "NHS Number")])])
        self.assertEqual(fields[0]["id"], "nhs_number")
        self.assertNotIn("section", fields[0])

    def test_duplicate_header_on_one_sheet_raises(self):
        sheets = [_sheet("ALL", [("A1", "Code"), ("B1", "Code")])]
        with self.assertRaises(BuilderValidationError):
            extract_field_skeleton(sheets)


class AssembleTest(unittest.TestCase):
    SHEETS = [_sheet("ALL", [("A1", "Patient code"), ("B1", "Delivery")]),
              _sheet("NICU", [("A1", "Cooled")])]

    def _assembled(self, prose: dict) -> dict:
        skeleton, sheet_names = extract_field_skeleton(self.SHEETS)
        return _assemble("test", skeleton, sheet_names, prose)

    def test_llm_prose_cannot_restructure(self):
        # The prose tries to rename / move / add fields — none of it lands.
        model = self._assembled({"fields": [
            {"number": 1, "type": "text", "name": "Renamed!", "cell": "Z",
             "section": "Other", "id": "hacked"},
            {"number": 99, "type": "number", "notes": "unknown number — discarded"},
        ]})
        self.assertEqual(len(model["fields"]), 3)
        first = model["fields"][0]
        self.assertEqual(
            (first["id"], first["name"], first["cell"], first["section"]),
            ("all/patient_code", "Patient code", "A", "ALL"),
        )

    def test_category_without_codes_downgrades_to_text(self):
        model = self._assembled({"fields": [
            {"number": 2, "type": "category"},  # no permitted_values: a guess
            {"number": 3, "type": "category", "permitted_values": {"1": "Yes", "2": "No"}},
        ]})
        by_number = {f["number"]: f for f in model["fields"]}
        self.assertEqual(by_number[2]["type"], "text")
        self.assertEqual(by_number[3]["type"], "category")
        self.assertEqual(by_number[3]["permitted_values"], {"1": "Yes", "2": "No"})

    def test_deadline_must_be_an_iso_date(self):
        self.assertEqual(self._assembled({"deadline": "2026-07-07"})["deadline"], "2026-07-07")
        self.assertNotIn("deadline", self._assembled({"deadline": "next July"}))

    def test_sections_are_the_sheets_with_llm_display_names(self):
        model = self._assembled({"sections": [
            {"id": "ALL", "name": "Cord assessment"},
            {"id": "Bogus", "name": "Not a sheet"},
        ]})
        self.assertEqual(model["sections"], [
            {"id": "ALL", "name": "Cord assessment"},
            {"id": "NICU", "name": "NICU"},  # un-named sheet falls back to its name
        ])


class PreservedStateTest(unittest.TestCase):
    def test_hand_set_deadline_survives_reindex(self):
        new = {"fields": [], "inclusion_criteria": []}
        merged = merge_preserved_state(new, {"deadline": "2026-07-07"})
        self.assertEqual(merged["deadline"], "2026-07-07")
        # …but a freshly extracted deadline wins over the old one.
        new = {"fields": [], "inclusion_criteria": [], "deadline": "2027-01-01"}
        merged = merge_preserved_state(new, {"deadline": "2026-07-07"})
        self.assertEqual(merged["deadline"], "2027-01-01")


if __name__ == "__main__":
    unittest.main(verbosity=2)
