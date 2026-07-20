"""Grounding free text into Dataset criteria — assembly is deterministic.

The LLM proposes ``{table, column, op, value}`` tuples; the deterministic
assembly here is the contract: it binds ONLY real filterable columns with real
allowed values, drops anything hallucinated, and routes a concept no structured
column carries to ``not_available`` (structured-only, v1) — never invented. These
tests drive the assembly directly (no network); a separate mocked-LLM test proves
the call path wires through.

Run: ``python3 -m core.mapping.ground_default_criteria_test``
"""

import asyncio
import sys
import unittest
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from core.mapping import ground_default_criteria as g  # noqa: E402

# A trimmed cord-pH model.json filterable surface.
CORD_PH_MODEL = {
    "database": "cord-ph",
    "tables": [
        {
            "name": "cord_ph_birth_records",
            "columns": [
                {"name": "patient_code", "filterable": False, "reason": "identifier"},
                {
                    "name": "gestation_weeks",
                    "filterable": True,
                    "filter_type": "number",
                    "range": {"min": 35, "max": 41},
                },
                {
                    "name": "admitted_to_nicu",
                    "filterable": True,
                    "filter_type": "category",
                    "values": ["no", "yes"],
                },
                {
                    "name": "delivery",
                    "filterable": True,
                    "filter_type": "category",
                    "values": [
                        "Emergency caesarean",
                        "Forceps",
                        "Spontaneous vaginal",
                        "Vacuum",
                    ],
                },
            ],
        },
        {
            "name": "clinical_notes",
            "columns": [
                {"name": "text", "filterable": False, "reason": "free-text"},
            ],
        },
    ],
}
DATABASES = [("cord-ph", CORD_PH_MODEL)]


class AssembleTest(unittest.TestCase):
    def test_real_filterable_column_grounds(self):
        out = g.assemble_criteria(
            {
                "criteria": [
                    {
                        "database": "cord-ph",
                        "table": "cord_ph_birth_records",
                        "column": "gestation_weeks",
                        "op": ">=",
                        "value": 39,
                    }
                ]
            },
            DATABASES,
        )
        self.assertEqual(len(out["criteria"]), 1)
        c = out["criteria"][0]
        self.assertEqual(
            c["source"], "cord-ph -> cord_ph_birth_records.gestation_weeks"
        )
        self.assertEqual(c["type"], "number")
        self.assertEqual(c["predicate"], {"op": ">=", "value": 39})

    def test_category_value_must_be_a_real_allowed_value(self):
        out = g.assemble_criteria(
            {
                "criteria": [
                    {
                        "database": "cord-ph",
                        "table": "cord_ph_birth_records",
                        "column": "admitted_to_nicu",
                        "op": "=",
                        "value": "yes",
                    },
                    {
                        "database": "cord-ph",
                        "table": "cord_ph_birth_records",
                        "column": "delivery",
                        "op": "=",
                        "value": "Telepathy",
                    },
                ]
            },
            DATABASES,
        )
        sources = [c["source"] for c in out["criteria"]]
        self.assertIn("cord-ph -> cord_ph_birth_records.admitted_to_nicu", sources)
        # An off-list category value is not invented into a predicate.
        self.assertNotIn("cord-ph -> cord_ph_birth_records.delivery", sources)

    def test_hallucinated_column_is_dropped(self):
        out = g.assemble_criteria(
            {
                "criteria": [
                    {
                        "database": "cord-ph",
                        "table": "cord_ph_birth_records",
                        "column": "favourite_colour",
                        "op": "=",
                        "value": "blue",
                    }
                ]
            },
            DATABASES,
        )
        self.assertEqual(out["criteria"], [])

    def test_non_filterable_column_is_dropped(self):
        out = g.assemble_criteria(
            {
                "criteria": [
                    {
                        "database": "cord-ph",
                        "table": "cord_ph_birth_records",
                        "column": "patient_code",
                        "op": "=",
                        "value": "CPH001",
                    }
                ]
            },
            DATABASES,
        )
        self.assertEqual(out["criteria"], [])

    def test_free_text_only_concept_is_reported_not_available(self):
        out = g.assemble_criteria(
            {
                "criteria": [],
                "not_available": [
                    {
                        "phrase": "documented clinical concern",
                        "reason": "only in free-text notes; no structured column",
                    }
                ],
            },
            DATABASES,
        )
        self.assertEqual(out["criteria"], [])
        self.assertEqual(len(out["not_available"]), 1)
        self.assertIn("free-text", out["not_available"][0]["reason"])

    def test_in_list_category_keeps_only_real_values(self):
        out = g.assemble_criteria(
            {
                "criteria": [
                    {
                        "database": "cord-ph",
                        "table": "cord_ph_birth_records",
                        "column": "delivery",
                        "op": "in",
                        "value": ["Forceps", "Vacuum", "Teleport"],
                    }
                ]
            },
            DATABASES,
        )
        self.assertEqual(len(out["criteria"]), 1)
        self.assertEqual(
            out["criteria"][0]["predicate"]["value"], ["Forceps", "Vacuum"]
        )


class GroundCallTest(unittest.TestCase):
    def test_ground_criteria_wires_llm_through_assembly(self):
        fake = g._GroundingOutput(
            criteria=[
                {
                    "database": "cord-ph",
                    "table": "cord_ph_birth_records",
                    "column": "admitted_to_nicu",
                    "op": "=",
                    "value": "yes",
                }
            ],
            not_available=[],
        )

        async def fake_respond_typed(*args, **kwargs):
            return fake

        with mock.patch.object(g.llm, "respond_typed", fake_respond_typed):
            out = asyncio.run(g.ground_criteria("babies admitted to NICU", DATABASES))
        self.assertEqual(len(out["criteria"]), 1)
        self.assertEqual(
            out["criteria"][0]["source"],
            "cord-ph -> cord_ph_birth_records.admitted_to_nicu",
        )


if __name__ == "__main__":
    unittest.main()
