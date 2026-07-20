"""Unit tests for the Dataset-scope → table-population filters translator.

A table is pinned to exactly one scope, fixed for life (0004). When that scope is
a named Dataset, table population must be bounded to the SAME hard cohort. The
resolver accepts a ``{criterion_id: value_string}`` filters dict and resolves it
into cohort WHERE clauses via
``core.filters.cohort.resolve_runtime_filter_predicates``. This
module's job is the deterministic, no-LLM translation of a
Dataset's grounded ``criteria`` into exactly the value-string formats that parser
accepts — proven by round-tripping translate → parse → assert WHERE/params.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from core.tables.scope import TableScopeError, dataset_criteria_to_filters

REPO_ROOT = Path(__file__).resolve().parents[2]
CORDPH_MAPPING = json.loads(
    (REPO_ROOT / "data" / "seed" / "templates" / "cord-ph" / "mapping.json").read_text(
        encoding="utf-8"
    )
)
CORDPH_DATASET = json.loads(
    (
        REPO_ROOT
        / "data"
        / "seed"
        / "datasets"
        / "dataset-cordph-term-nicu"
        / "dataset.json"
    ).read_text(encoding="utf-8")
)


def _resolve(
    filters: dict[str, str], cohort_from: str | None = None
) -> tuple[list[str], dict]:
    """Round-trip ``filters`` through the table-population resolver against the
    cord-ph mapping, returning (WHERE, params). Defaults to the cord-ph Dataset's
    birth-records cohort; the date criteria pass a joined ``cohort_from`` so the
    encounters table is in scope (the executable carries the join)."""
    from core.filters.cohort import resolve_runtime_filter_predicates

    return resolve_runtime_filter_predicates(
        filters,
        CORDPH_MAPPING,
        database_id="cord-ph",
        cohort_from=cohort_from or CORDPH_DATASET["cohort"]["from"],
    )


# A joined cohort base so date criteria (encounters.start) resolve in the round-trip.
_JOINED_FROM = "cord_ph_birth_records b JOIN encounters e ON b.encounter = e.id"


class TranslatePerTypeTest(unittest.TestCase):
    def test_number_ge_round_trips_to_a_comparison_clause(self):
        crit = {
            "criterion_id": "gestation_weeks",
            "type": "number",
            "predicate": {"op": ">=", "value": 39},
        }
        filters = dataset_criteria_to_filters([crit])
        self.assertEqual(filters, {"gestation_weeks": ">=39"})
        where, params = _resolve(filters)
        self.assertEqual(len(where), 1)
        self.assertIn(">=", where[0])
        self.assertEqual(set(params.values()), {39.0})

    def test_number_between_round_trips_to_a_between_clause(self):
        crit = {
            "criterion_id": "gestation_weeks",
            "type": "number",
            "predicate": {"op": "between", "value": [37, 42]},
        }
        filters = dataset_criteria_to_filters([crit])
        self.assertEqual(filters, {"gestation_weeks": "37 to 42"})
        where, params = _resolve(filters)
        self.assertEqual(len(where), 1)
        self.assertIn("BETWEEN", where[0])
        self.assertEqual(set(params.values()), {37.0, 42.0})

    def test_category_eq_round_trips_to_an_equality_clause(self):
        crit = {
            "criterion_id": "admitted_to_nicu",
            "type": "category",
            "predicate": {"op": "=", "value": "yes"},
        }
        filters = dataset_criteria_to_filters([crit])
        self.assertEqual(filters, {"admitted_to_nicu": "yes"})
        where, params = _resolve(filters)
        self.assertEqual(len(where), 1)
        self.assertIn("=", where[0])
        self.assertEqual(list(params.values()), ["yes"])

    def test_category_in_round_trips_to_an_in_clause(self):
        crit = {
            "criterion_id": "delivery",
            "type": "category",
            "predicate": {"op": "in", "value": ["caesarean", "forceps"]},
        }
        filters = dataset_criteria_to_filters([crit])
        self.assertEqual(filters, {"delivery": "caesarean,forceps"})
        where, params = _resolve(filters)
        self.assertEqual(len(where), 1)
        self.assertIn("IN (", where[0])
        self.assertEqual(set(params.values()), {"caesarean", "forceps"})

    def test_date_ge_round_trips_to_a_date_comparison(self):
        crit = {
            "criterion_id": "encounter_start",
            "type": "date",
            "predicate": {"op": ">=", "value": "2024-01-01"},
        }
        filters = dataset_criteria_to_filters([crit])
        self.assertEqual(filters, {"encounter_start": ">=2024-01-01"})
        where, params = _resolve(filters, cohort_from=_JOINED_FROM)
        self.assertEqual(len(where), 1)
        self.assertIn(">=", where[0])
        self.assertEqual(list(params.values()), ["2024-01-01"])

    def test_date_between_round_trips_to_a_between_clause(self):
        crit = {
            "criterion_id": "encounter_start",
            "type": "date",
            "predicate": {"op": "between", "value": ["2024-01-01", "2024-12-31"]},
        }
        filters = dataset_criteria_to_filters([crit])
        self.assertEqual(filters, {"encounter_start": "2024-01-01 to 2024-12-31"})
        where, params = _resolve(filters, cohort_from=_JOINED_FROM)
        self.assertEqual(len(where), 1)
        self.assertIn("BETWEEN", where[0])
        self.assertEqual(set(params.values()), {"2024-01-01", "2024-12-31"})


class CordPhDatasetFixtureTest(unittest.TestCase):
    """The concrete cord-ph Dataset {gestation_weeks >= 39, admitted_to_nicu = yes}
    translates to filters that resolve to its two cohort WHERE clauses — proving a
    scoped table now spawns bounded to exactly the pinned cohort, not the whole DB."""

    def test_cordph_dataset_translates_to_its_two_cohort_clauses(self):
        filters = dataset_criteria_to_filters(CORDPH_DATASET["criteria"])
        self.assertEqual(
            filters,
            {"gestation_weeks": ">=39", "admitted_to_nicu": "yes"},
        )
        where, params = _resolve(filters)
        self.assertEqual(len(where), 2)
        joined = " ".join(where)
        self.assertIn("gestation_weeks", joined)
        self.assertIn("admitted_to_nicu", joined)
        self.assertEqual(set(params.values()), {39.0, "yes"})


class FailClosedTest(unittest.TestCase):
    """FAIL-CLOSED (decision 0004): a criterion the value-string format cannot
    faithfully encode RAISES rather than being dropped — dropping a filter scopes
    the table to a BROADER cohort than the pinned Dataset (the wrong patients). The
    spawn turns the raise into a 422; it never produces a silently-wrong cohort."""

    def _assert_raises(self, crit):
        with self.assertRaises(TableScopeError):
            dataset_criteria_to_filters([crit])

    def test_category_value_with_comma_raises_not_silently_widened(self):
        # "a,b" would be split by the engine into IN ('a','b') — a broader cohort.
        self._assert_raises(
            {
                "criterion_id": "c",
                "type": "category",
                "predicate": {"op": "=", "value": "a,b"},
            }
        )

    def test_category_value_with_pipe_raises(self):
        self._assert_raises(
            {
                "criterion_id": "c",
                "type": "category",
                "predicate": {"op": "=", "value": "a|b"},
            }
        )

    def test_number_in_raises_not_dropped(self):
        # Dropping would widen the cohort silently; number/date 'in' has no faithful
        # value-string form, so it must fail loudly.
        self._assert_raises(
            {
                "criterion_id": "yr",
                "type": "number",
                "predicate": {"op": "in", "value": [2022, 2023]},
            }
        )

    def test_date_in_raises_not_dropped(self):
        self._assert_raises(
            {
                "criterion_id": "d",
                "type": "date",
                "predicate": {"op": "in", "value": ["2024-01-01"]},
            }
        )

    def test_unsupported_type_raises(self):
        self._assert_raises(
            {
                "criterion_id": "weird",
                "type": "geo",
                "predicate": {"op": "=", "value": "x"},
            }
        )

    def test_missing_predicate_raises(self):
        self._assert_raises({"criterion_id": "x", "type": "number"})

    def test_non_dict_criterion_raises(self):
        with self.assertRaises(TableScopeError):
            dataset_criteria_to_filters(["not-an-object"])


class ScalarValueValidationTest(unittest.TestCase):
    """A number/date criterion with a SCALAR op (=, >=, …) must carry a single clean
    literal. A value that smuggles a range/extra token (``"10-20"``, ``"37 to 42"``)
    must RAISE: the engine's ``_number_clause`` re-parses ``"=10-20"`` via its
    ``between`` search into ``BETWEEN 10 AND 20`` — silently WIDENING an exact match
    into a range (the wrong cohort). This mirrors ``_category_token``'s delimiter
    guard, so the number/date path is fail-closed on its own, not by accident of the
    engine."""

    def _assert_raises(self, crit):
        with self.assertRaises(TableScopeError):
            dataset_criteria_to_filters([crit])

    def _number(self, op, value):
        return {
            "criterion_id": "gestation_weeks",
            "type": "number",
            "predicate": {"op": op, "value": value},
        }

    def _date(self, op, value):
        return {
            "criterion_id": "encounter_start",
            "type": "date",
            "predicate": {"op": op, "value": value},
        }

    def test_number_scalar_hyphen_range_raises_not_widened_to_between(self):
        # "=10-20" is re-parsed by the engine as BETWEEN 10 AND 20 — a broader cohort.
        for op in ("=", ">=", "<=", ">", "<"):
            self._assert_raises(self._number(op, "10-20"))

    def test_number_scalar_reversed_range_raises(self):
        # "=5-3" → engine BETWEEN 3 AND 5 (it even reorders the bounds).
        self._assert_raises(self._number("=", "5-3"))

    def test_number_scalar_to_range_raises(self):
        self._assert_raises(self._number("=", "37 to 42"))

    def test_number_scalar_two_numbers_separated_by_space_raises(self):
        # "=39 42" → engine finds two numbers → BETWEEN 39 AND 42.
        self._assert_raises(self._number("=", "39 42"))

    def test_number_scalar_decimal_range_raises(self):
        self._assert_raises(self._number("=", "3.5-4"))

    def test_number_scalar_trailing_garbage_raises(self):
        self._assert_raises(self._number("=", "39 weeks"))

    def test_number_scalar_non_numeric_raises(self):
        self._assert_raises(self._number("=", "abc"))

    def test_date_scalar_range_raises(self):
        # "=2024-01-01 to 2024-12-31" smuggles a range into a scalar op.
        self._assert_raises(self._date("=", "2024-01-01 to 2024-12-31"))

    def test_date_scalar_trailing_garbage_raises(self):
        self._assert_raises(self._date("=", "2024-01-01 garbage"))

    def test_date_scalar_unparseable_raises(self):
        self._assert_raises(self._date("=", "not-a-date"))

    # --- valid scalars must STILL pass (don't over-reject) ---

    def test_valid_int_scalar_still_passes(self):
        filters = dataset_criteria_to_filters([self._number(">=", 39)])
        self.assertEqual(filters, {"gestation_weeks": ">=39"})

    def test_valid_decimal_scalar_still_passes(self):
        filters = dataset_criteria_to_filters([self._number("=", 3.5)])
        self.assertEqual(filters, {"gestation_weeks": "=3.5"})

    def test_valid_negative_scalar_still_passes(self):
        filters = dataset_criteria_to_filters([self._number(">", -2)])
        self.assertEqual(filters, {"gestation_weeks": ">-2"})

    def test_valid_negative_decimal_scalar_still_passes(self):
        filters = dataset_criteria_to_filters([self._number("<=", -3.5)])
        self.assertEqual(filters, {"gestation_weeks": "<=-3.5"})

    def test_valid_leading_plus_scalar_still_passes(self):
        # The leading-'+' strip must survive the new validation.
        filters = dataset_criteria_to_filters([self._number(">=", "+39")])
        self.assertEqual(filters, {"gestation_weeks": ">=39"})

    def test_valid_iso_date_scalar_still_passes(self):
        filters = dataset_criteria_to_filters([self._date(">=", "2024-01-01")])
        self.assertEqual(filters, {"encounter_start": ">=2024-01-01"})
        where, _ = _resolve(filters, cohort_from=_JOINED_FROM)
        self.assertIn(">=", where[0])

    def test_valid_slash_and_named_month_date_scalars_still_pass(self):
        # Formats _date_to_iso accepts beyond ISO must not be over-rejected.
        for value in ("2024/01/01", "01 Jan 2024", "01/02/2024"):
            filters = dataset_criteria_to_filters([self._date("=", value)])
            self.assertEqual(filters, {"encounter_start": f"={value}"})


class RobustnessTest(unittest.TestCase):
    """Op casing + numeric-sign normalisation, so canonical-but-noisy Datasets still
    round-trip faithfully rather than silently dropping/flipping."""

    def test_op_is_lowercased(self):
        # An upper-case op ("IN"/"BETWEEN") must not silently drop the criterion.
        filters = dataset_criteria_to_filters(
            [
                {
                    "criterion_id": "delivery",
                    "type": "category",
                    "predicate": {"op": "IN", "value": ["a", "b"]},
                }
            ]
        )
        self.assertEqual(filters, {"delivery": "a,b"})

    def test_leading_plus_on_number_is_stripped(self):
        # "+39" would fail the parser's -?\d+ regex and silently flip >= to =.
        filters = dataset_criteria_to_filters(
            [
                {
                    "criterion_id": "gestation_weeks",
                    "type": "number",
                    "predicate": {"op": ">=", "value": "+39"},
                }
            ]
        )
        self.assertEqual(filters, {"gestation_weeks": ">=39"})
        where, _ = _resolve(filters)
        self.assertIn(">=", where[0])

    def test_number_lt_and_eq_round_trip(self):
        for op in ("<", "<=", ">", "="):
            filters = dataset_criteria_to_filters(
                [
                    {
                        "criterion_id": "gestation_weeks",
                        "type": "number",
                        "predicate": {"op": op, "value": 39},
                    }
                ]
            )
            self.assertEqual(filters, {"gestation_weeks": f"{op}39"})
            where, _ = _resolve(filters)
            self.assertEqual(len(where), 1)


if __name__ == "__main__":
    unittest.main()
