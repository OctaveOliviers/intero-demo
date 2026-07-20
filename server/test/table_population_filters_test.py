import unittest

from core.filters.cohort import (
    resolve_runtime_filter_predicates as _resolve_runtime_filter_predicates,
)


_MAPPING = {
    "criteria_bindings": [
        {
            "criterion_id": "delivery",
            "label": "Mode of delivery",
            "source": "cord-ph -> cord_ph_birth_records.delivery",
            "type": "category",
        },
        {
            "criterion_id": "gestation_weeks",
            "label": "Gestation (completed weeks)",
            "source": "cord-ph -> cord_ph_birth_records.gestation_weeks",
            "type": "number",
        },
        {
            "criterion_id": "encounter_start",
            "label": "Delivery / encounter date",
            "source": "cord-ph -> encounters.start",
            "type": "date",
        },
    ]
}

_COHORT_FROM = "cord_ph_birth_records b JOIN encounters e ON b.encounter = e.id"


class RunFilterResolutionTest(unittest.TestCase):
    def test_resolves_category_number_and_date(self):
        where_terms, params = _resolve_runtime_filter_predicates(
            {
                "delivery": "Caesarean, Ventouse",
                "gestation_weeks": ">= 34 weeks",
                "encounter_start": "2024-01-01 to 2024-12-31",
            },
            _MAPPING,
            database_id="cord-ph",
            cohort_from=_COHORT_FROM,
        )
        self.assertEqual(len(where_terms), 3)
        self.assertTrue(any("b.delivery IN" in term for term in where_terms))
        self.assertTrue(any("b.gestation_weeks >=" in term for term in where_terms))
        self.assertTrue(any("e.start BETWEEN" in term for term in where_terms))
        self.assertIn("Caesarean", params.values())
        self.assertIn("Ventouse", params.values())
        self.assertIn(34.0, params.values())
        self.assertIn("2024-01-01", params.values())
        self.assertIn("2024-12-31", params.values())

    def test_rejects_unresolved_filter_key(self):
        with self.assertRaises(ValueError):
            _resolve_runtime_filter_predicates(
                {"ward": "NICU"},
                _MAPPING,
                database_id="cord-ph",
                cohort_from=_COHORT_FROM,
            )

    def test_date_suffix_from_to_apply_comparators(self):
        where_terms, params = _resolve_runtime_filter_predicates(
            {
                "encounter_start_from": "2024-01-01",
                "encounter_start_to": "2024-12-31",
            },
            _MAPPING,
            database_id="cord-ph",
            cohort_from=_COHORT_FROM,
        )
        self.assertEqual(len(where_terms), 2)
        self.assertTrue(any("e.start >=" in term for term in where_terms))
        self.assertTrue(any("e.start <=" in term for term in where_terms))
        self.assertIn("2024-01-01", params.values())
        self.assertIn("2024-12-31", params.values())


if __name__ == "__main__":
    unittest.main(verbosity=2)
