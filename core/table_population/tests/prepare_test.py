"""``assemble_population_context`` — the driver derives its own ingredients (#326).

The assembly is the ONE place a population's ingredients are derived from the
request identity (source template id, database hint, runtime filters): the
audit spec, the mapping's executable block, the database binding + paths, the
filter-grounded cohort, the anchor, the per-database cohort tables and the
member row layout. These tests run it against the seeded cord-pH fixture —
the same var/ goldens ``core/filters/cohort_test.py`` counts against — so
they exercise the real spec/mapping/SQLite chain with zero LLM calls.
"""

from __future__ import annotations

import asyncio
import unittest

from core.config import DATABASES_DIR, TEMPLATES_DIR
from core.table_population.prepare import assemble_population_context


def _assemble(**kwargs):
    return asyncio.run(assemble_population_context("cord-ph", **kwargs))


class AssembleHappyPathTest(unittest.TestCase):
    """The seeded template-backed request yields every ingredient."""

    def test_derives_every_ingredient_from_the_request_identity(self):
        assembled = _assemble()
        # The executable block, verbatim from the seeded mapping.
        self.assertIn("regions", assembled.executable)
        self.assertEqual(assembled.bound_database_ids, ["cord-ph"])
        # The registered path, symlink-resolved (the seed layout links
        # var/databases/<slug>/database.sqlite to the committed SQLite).
        self.assertEqual(
            assembled.database_paths["cord-ph"],
            (DATABASES_DIR / "cord-ph" / "database.sqlite").resolve(),
        )
        # The unfiltered cohort matches the cohort_test goldens (10 members).
        self.assertEqual(len(assembled.cohort), 10)
        self.assertEqual(assembled.anchor, "patient_code")
        # The anchor-bearing source tables are found for the bound database.
        self.assertTrue(assembled.cohort_tables.get("cord-ph"))
        # One row per member, rows unique — the fresh-run layout.
        self.assertEqual(len(assembled.member_rows), 10)
        self.assertEqual(
            len(set(assembled.member_rows.values())), len(assembled.member_rows)
        )

    def test_audit_spec_is_the_loaded_field_spec(self):
        assembled = _assemble()
        self.assertTrue(assembled.field_spec.get("fields"))


class AssembleFilterGroundingTest(unittest.TestCase):
    """Runtime filters ground through core.filters.cohort into the cohort."""

    def test_a_grounded_filter_narrows_the_cohort(self):
        # encounter_start binds onto encounters.start (alias `e` in the cohort
        # FROM) — a column the committed SQLite physically carries. The other
        # seeded bindings ground onto interpret-only columns (the cord-pH seed
        # is the UNSTRUCTURED variant: clinical values live in notes), so a
        # runtime filter on them fails in SQL — same as the route before the
        # move; not exercised here.
        unfiltered = _assemble()
        # The seeded encounters span 2026-04-02 → 2026-04-27; cut mid-month.
        filtered = _assemble(filters={"encounter_start_to": "2026-04-15"})
        self.assertLess(len(filtered.cohort), len(unfiltered.cohort))
        self.assertGreater(len(filtered.cohort), 0)

    def test_a_filter_matching_nobody_raises_the_historical_message(self):
        with self.assertRaises(ValueError) as ctx:
            _assemble(filters={"encounter_start_to": "2015-12-31"})
        self.assertEqual(
            str(ctx.exception), "No cohort members matched this table population."
        )

    def test_an_ungroundable_filter_raises(self):
        with self.assertRaises(ValueError):
            _assemble(filters={"no_such_criterion": "x"})


class AssembleErrorModesTest(unittest.TestCase):
    """The runtime's historical error messages survive the move into core."""

    def test_missing_template_spec_raises_the_historical_message(self):
        with self.assertRaises(ValueError) as ctx:
            asyncio.run(assemble_population_context("no-such-audit"))
        self.assertEqual(
            str(ctx.exception),
            f"template spec missing: {TEMPLATES_DIR / 'no-such-audit' / 'spec.json'}",
        )

    def test_unknown_database_hint_raises(self):
        with self.assertRaises(ValueError):
            _assemble(database_id="no-such-database")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
