"""The cross-database cohort base deriver: anchor + measured identity joins.

Derivation (anchor table + a JOIN per OTHER database that has a measured identity
link to the anchor) is a pure string transform; the proof is a COUNT through the
existing :func:`core.filters.cohort.count_cohort` against the **seeded NPDA
fixture** (run ``make db seed`` first). These counts are deterministic goldens —
no LLM, no network. Unlinkable databases must never be joined, and criteria on
them must be routed to ``not_available`` rather than silently dropped or guessed.

Run: ``python3 -m core.filters.cohort_base_test``
"""

import json
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from core.config import DATABASES_DIR  # noqa: E402
from core.filters.cohort import count_cohort  # noqa: E402
from core.filters.cohort_base import derive_cohort_base, partition_criteria  # noqa: E402

ANCHOR = "npda-clinical -> clinic_visits.visit_id"


def _model(db: str) -> dict:
    with open(DATABASES_DIR / db / "model.json", encoding="utf-8") as fh:
        return json.load(fh)


def _databases() -> list[tuple[str, dict]]:
    return [
        ("npda-clinical", _model("npda-clinical")),
        ("npda-demographics", _model("npda-demographics")),
    ]


def _db_paths() -> dict[str, Path]:
    return {
        "npda-clinical": DATABASES_DIR / "npda-clinical" / "database.sqlite",
        "npda-demographics": DATABASES_DIR / "npda-demographics" / "database.sqlite",
    }


def _crit(source: str, ftype: str, op: str, value) -> dict:
    return {"source": source, "type": ftype, "predicate": {"op": op, "value": value}}


SEX_FEMALE = _crit("npda-demographics -> patients.sex", "category", "=", "Female")
SEX_MALE = _crit("npda-demographics -> patients.sex", "category", "=", "Male")

# A third, unlinkable database: it has NO measured identity_link to the anchor.
UNLINKED_DB = "ext-registry"
UNLINKED_MODEL = {
    "schema_version": "1",
    "database": UNLINKED_DB,
    "identity_links": [],  # no measured bridge to npda-clinical
    "tables": [
        {
            "name": "referrals",
            "columns": [
                {"name": "referral_status", "type": "text", "filter_type": "category"}
            ],
        }
    ],
}
REFERRAL_CRIT = _crit(
    "ext-registry -> referrals.referral_status", "category", "=", "open"
)


class DeriveCohortBaseTest(unittest.TestCase):
    def test_from_quotes_the_hyphenated_slug_and_matches_the_measured_link(self):
        base = derive_cohort_base(ANCHOR, _databases())
        from_clause = base.cohort_block["from"]
        # The anchor table is aliased; the other database is JOINed via its quoted,
        # hyphenated slug on the measured identity bridge.
        self.assertIn("clinic_visits", from_clause)
        self.assertIn('JOIN "npda-demographics".patients', from_clause)
        # The ON-clause is exactly the measured link: patient_ref = nhs_number.
        self.assertIn("patient_ref", from_clause)
        self.assertIn("nhs_number", from_clause)
        self.assertIn("npda-demographics", base.linkable)
        self.assertEqual(base.cohort_block["database"], "npda-clinical")

    def test_derived_base_counts_across_both_databases(self):
        base = derive_cohort_base(ANCHOR, _databases())
        self.assertEqual(count_cohort(_db_paths(), base.cohort_block, []), 26)
        self.assertEqual(count_cohort(_db_paths(), base.cohort_block, [SEX_FEMALE]), 15)
        self.assertEqual(count_cohort(_db_paths(), base.cohort_block, [SEX_MALE]), 11)

    def test_unmeasured_link_makes_a_database_unlinkable(self):
        # Strip the evidence off the bridge -> npda-demographics is no longer joinable.
        clinical = _model("npda-clinical")
        for link in clinical["identity_links"]:
            link["evidence"] = ""
        base = derive_cohort_base(
            ANCHOR,
            [
                ("npda-clinical", clinical),
                ("npda-demographics", _model("npda-demographics")),
            ],
        )
        self.assertNotIn('JOIN "npda-demographics"', base.cohort_block["from"])
        self.assertNotIn("npda-demographics", base.linkable)
        self.assertIn("npda-demographics", base.unlinkable)

    def test_unlinkable_third_database_is_not_joined(self):
        base = derive_cohort_base(
            ANCHOR, _databases() + [(UNLINKED_DB, UNLINKED_MODEL)]
        )
        self.assertNotIn(UNLINKED_DB, base.cohort_block["from"])
        self.assertIn(UNLINKED_DB, base.unlinkable)
        self.assertIn("npda-demographics", base.linkable)


class MeasuredLinkSafetyTest(unittest.TestCase):
    def test_zero_overlap_evidence_is_not_measured(self):
        # "0/24 sampled values found in target" means sampled, none matched — never
        # a measurement, so the database must not be joined.
        clinical = _model("npda-clinical")
        for link in clinical["identity_links"]:
            link["evidence"] = "0/24 sampled values found in target"
        base = derive_cohort_base(
            ANCHOR,
            [
                ("npda-clinical", clinical),
                ("npda-demographics", _model("npda-demographics")),
            ],
        )
        self.assertIn("npda-demographics", base.unlinkable)
        self.assertNotIn('JOIN "npda-demographics"', base.cohort_block["from"])

    def test_ambiguous_bridge_raises_rather_than_guessing(self):
        # Two measured links from the anchor table to the SAME target database: a
        # wrong pick would mix patients, so derivation must refuse, not guess.
        clinical = _model("npda-clinical")
        clinical["identity_links"] = [
            {
                "column": "clinic_visits.patient_ref",
                "target": "npda-demographics -> patients.nhs_number",
                "evidence": "10/10 sampled values found in target",
            },
            {
                "column": "clinic_visits.mother_ref",
                "target": "npda-demographics -> patients.nhs_number",
                "evidence": "10/10 sampled values found in target",
            },
        ]
        with self.assertRaises(Exception) as ctx:
            derive_cohort_base(
                ANCHOR,
                [
                    ("npda-clinical", clinical),
                    ("npda-demographics", _model("npda-demographics")),
                ],
            )
        self.assertIn("ambiguous", str(ctx.exception).lower())

    def test_derivation_is_stable_regardless_of_input_order(self):
        # Same anchor + same database SET must derive a byte-identical FROM,
        # whatever order the caller passes the databases in.
        a = derive_cohort_base(
            ANCHOR,
            [
                ("npda-clinical", _model("npda-clinical")),
                ("npda-demographics", _model("npda-demographics")),
            ],
        )
        b = derive_cohort_base(
            ANCHOR,
            [
                ("npda-demographics", _model("npda-demographics")),
                ("npda-clinical", _model("npda-clinical")),
            ],
        )
        self.assertEqual(a.cohort_block["from"], b.cohort_block["from"])


class PartitionCriteriaTest(unittest.TestCase):
    def test_anchor_and_linkable_criteria_are_usable(self):
        base = derive_cohort_base(ANCHOR, _databases())
        usable, not_available = partition_criteria(
            [SEX_FEMALE], base.linkable, base.anchor_db
        )
        self.assertEqual(usable, [SEX_FEMALE])
        self.assertEqual(not_available, [])

    def test_criterion_on_an_unlinkable_database_is_not_available(self):
        base = derive_cohort_base(
            ANCHOR, _databases() + [(UNLINKED_DB, UNLINKED_MODEL)]
        )
        usable, not_available = partition_criteria(
            [SEX_FEMALE, REFERRAL_CRIT], base.linkable, base.anchor_db
        )
        self.assertEqual(usable, [SEX_FEMALE])
        self.assertEqual(len(not_available), 1)
        routed, reason = not_available[0]
        self.assertEqual(routed, REFERRAL_CRIT)
        self.assertIn("no measured identity link", reason)

    def test_malformed_source_is_routed_not_raised(self):
        # A criterion with an unparseable source must not abort the whole partition.
        bad = _crit("not a valid source", "category", "=", "x")
        usable, not_available = partition_criteria(
            [SEX_FEMALE, bad], {"npda-demographics"}, "npda-clinical"
        )
        self.assertEqual(usable, [SEX_FEMALE])
        self.assertEqual(len(not_available), 1)
        self.assertIs(not_available[0][0], bad)


if __name__ == "__main__":
    unittest.main()
