"""Deterministic predicate -> parameterised SQL for grounded Dataset criteria.

A Dataset criterion is ALREADY grounded — it carries a column reference and a
structured predicate (op + typed value). Turning that into a parameterised SQL
clause is deterministic and LLM-free, so editing a chip's value rebinds the bind
and recomposes the SQL with no model call (inclusion-criteria-setup.md). These
tests pin that the builder is parameterised (never inlines the value), rejects a
malformed predicate, and is stable for a given input.

Run: ``python3 -m core.filters.predicates_test``
"""

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from core.filters.predicates import PredicateError, build_predicate  # noqa: E402


class CategoryPredicateTest(unittest.TestCase):
    def test_equals_binds_the_stored_code(self):
        sql, params = build_predicate(
            {"type": "category", "predicate": {"op": "=", "value": "yes"}},
            "b.admitted_to_nicu",
            bind="c0",
        )
        self.assertEqual(sql, "b.admitted_to_nicu = :c0")
        self.assertEqual(params, {"c0": "yes"})

    def test_in_list_expands_to_distinct_binds(self):
        sql, params = build_predicate(
            {
                "type": "category",
                "predicate": {"op": "in", "value": ["Forceps", "Vacuum"]},
            },
            "b.delivery",
            bind="c1",
        )
        self.assertEqual(sql, "b.delivery IN (:c1_0, :c1_1)")
        self.assertEqual(params, {"c1_0": "Forceps", "c1_1": "Vacuum"})

    def test_value_is_never_inlined(self):
        sql, params = build_predicate(
            {
                "type": "category",
                "predicate": {"op": "=", "value": "'; DROP TABLE x;--"},
            },
            "b.delivery",
            bind="c0",
        )
        self.assertNotIn("DROP", sql)
        self.assertEqual(params["c0"], "'; DROP TABLE x;--")


class NumberPredicateTest(unittest.TestCase):
    def test_gte_casts_text_column_to_real(self):
        sql, params = build_predicate(
            {"type": "number", "predicate": {"op": ">=", "value": 39}},
            "b.gestation_weeks",
            bind="c0",
        )
        self.assertEqual(sql, "CAST(b.gestation_weeks AS REAL) >= :c0")
        self.assertEqual(params, {"c0": 39})

    def test_between_emits_two_binds(self):
        sql, params = build_predicate(
            {"type": "number", "predicate": {"op": "between", "value": [37, 41]}},
            "b.gestation_weeks",
            bind="c0",
        )
        self.assertEqual(
            sql, "CAST(b.gestation_weeks AS REAL) BETWEEN :c0_lo AND :c0_hi"
        )
        self.assertEqual(params, {"c0_lo": 37, "c0_hi": 41})

    def test_negative_value_is_supported(self):
        sql, params = build_predicate(
            {"type": "number", "predicate": {"op": "<=", "value": -10.0}},
            "b.cord_arterial_be",
            bind="c0",
        )
        self.assertEqual(sql, "CAST(b.cord_arterial_be AS REAL) <= :c0")
        self.assertEqual(params, {"c0": -10.0})


class DatePredicateTest(unittest.TestCase):
    def test_between_uses_lexical_iso_compare(self):
        sql, params = build_predicate(
            {
                "type": "date",
                "predicate": {"op": "between", "value": ["2026-04-01", "2026-04-30"]},
            },
            "p.birthdate",
            bind="c0",
        )
        self.assertEqual(sql, "p.birthdate BETWEEN :c0_lo AND :c0_hi")
        self.assertEqual(params, {"c0_lo": "2026-04-01", "c0_hi": "2026-04-30"})


class RejectionTest(unittest.TestCase):
    def test_unknown_type_is_rejected(self):
        with self.assertRaises(PredicateError):
            build_predicate(
                {"type": "free_text", "predicate": {"op": "=", "value": "x"}},
                "b.x",
                bind="c0",
            )

    def test_unknown_op_for_type_is_rejected(self):
        with self.assertRaises(PredicateError):
            build_predicate(
                {"type": "category", "predicate": {"op": ">=", "value": "x"}},
                "b.x",
                bind="c0",
            )

    def test_between_requires_two_values(self):
        with self.assertRaises(PredicateError):
            build_predicate(
                {"type": "number", "predicate": {"op": "between", "value": [1]}},
                "b.x",
                bind="c0",
            )

    def test_empty_in_list_is_rejected(self):
        with self.assertRaises(PredicateError):
            build_predicate(
                {"type": "category", "predicate": {"op": "in", "value": []}},
                "b.x",
                bind="c0",
            )

    def test_non_identifier_col_ref_is_rejected(self):
        with self.assertRaises(PredicateError):
            build_predicate(
                {"type": "number", "predicate": {"op": ">=", "value": 1}},
                "b.x; DROP TABLE y",
                bind="c0",
            )


if __name__ == "__main__":
    unittest.main()
