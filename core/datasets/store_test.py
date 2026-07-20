"""The Dataset object: deterministic derivation, persistence, and round-trip.

The headline guarantee (acceptance-criteria.md, table-population.md): a Dataset's
persisted predicates **compose into the executable cohort block** and a read-only
``COUNT`` returns the **expected count on the cord-pH fixtures**; reloading it
**re-derives an identical SQL + count** — resolve once at definition, consume at
every run, no LLM. Run ``make db seed`` first.

Run: ``python3 -m core.datasets.store_test``
"""

import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from core.config import DATABASES_DIR  # noqa: E402
from core.datasets.store import (  # noqa: E402
    DatasetError,
    display_predicate,
    list_summaries,
    load_dataset,
    rederive,
    save_dataset,
)

COHORT = {
    "database": "cord-ph",
    "from": (
        "cord_ph_birth_records b "
        "LEFT JOIN nicu_admissions n ON b.patient_code = n.patient_code"
    ),
    "identity_select": "b.patient_code AS patient_code",
    "identity_keys": ["patient_code"],
}


def _dataset():
    """A Dataset whose grounded criteria scope a late-row NICU birth record."""
    return {
        "schema_version": "1",
        "id": "dataset-cordph-nicu",
        "name": "Late NICU birth record",
        "databases": ["cord-ph"],
        "cohort": dict(COHORT),
        "criteria": [
            {
                "criterion_id": "birth_record_row",
                "label": "Birth record row",
                "type": "number",
                "source": "cord-ph -> cord_ph_birth_records._row_id",
                "predicate": {"op": ">=", "value": 9},
            },
            {
                "criterion_id": "admitted_to_nicu",
                "label": "Admitted to NICU",
                "type": "category",
                "source": "cord-ph -> nicu_admissions.source_system",
                "predicate": {"op": "=", "value": "Northbank Neonatal EHR"},
            },
        ],
        "not_available": [
            {
                "phrase": "babies with a documented clinical concern",
                "reason": "only in free-text notes; no structured column",
            }
        ],
    }


def _db_paths():
    return {"cord-ph": DATABASES_DIR / "cord-ph" / "database.sqlite"}


class DeriveTest(unittest.TestCase):
    def test_predicates_compose_into_the_cohort_block_and_count(self):
        d = rederive(_dataset(), _db_paths())
        # The predicates AND into the cohort base, alias-qualified + parameterised.
        self.assertIn("CAST(b._row_id AS REAL) >= :c0", d["cohort_sql"])
        self.assertIn("n.source_system = :c1", d["cohort_sql"])
        self.assertIn(" AND ", d["cohort_sql"])
        # The read-only COUNT on the cord-pH fixtures is the expected intersection.
        self.assertEqual(d["count"], 1)

    def test_each_criterion_gets_a_parameterised_sql_and_display(self):
        d = rederive(_dataset(), _db_paths())
        row, nicu = d["criteria"]
        self.assertEqual(row["sql"], "CAST(b._row_id AS REAL) >= :c0")
        self.assertEqual(row["params"], {"c0": 9})
        self.assertEqual(row["display"], "Birth record row ≥ 9")
        self.assertEqual(nicu["sql"], "n.source_system = :c1")
        self.assertEqual(nicu["display"], "Admitted to NICU = Northbank Neonatal EHR")

    def test_derivation_ignores_any_stale_cached_values(self):
        poisoned = _dataset()
        poisoned["count"] = 999
        poisoned["cohort_sql"] = "SELECT 1"
        poisoned["criteria"][0]["sql"] = "1=1"
        d = rederive(poisoned, _db_paths())
        self.assertEqual(d["count"], 1)
        self.assertNotEqual(d["cohort_sql"], "SELECT 1")
        self.assertEqual(d["criteria"][0]["sql"], "CAST(b._row_id AS REAL) >= :c0")

    def test_not_available_is_kept_but_never_becomes_a_predicate(self):
        d = rederive(_dataset(), _db_paths())
        self.assertEqual(len(d["not_available"]), 1)
        self.assertNotIn("clinical concern", d["cohort_sql"])
        self.assertNotIn("documented", d["cohort_sql"])


class RoundTripTest(unittest.TestCase):
    def test_reload_re_derives_identical_sql_and_count(self):
        paths = _db_paths()
        with tempfile.TemporaryDirectory() as tmp:
            datasets_dir = Path(tmp)
            derived = rederive(_dataset(), paths)
            save_dataset(derived, datasets_dir=datasets_dir)

            reloaded = load_dataset("dataset-cordph-nicu", datasets_dir=datasets_dir)
            self.assertEqual(reloaded["cohort_sql"], derived["cohort_sql"])
            self.assertEqual(reloaded["count"], derived["count"])

            # Re-deriving the reloaded Dataset is byte-for-byte identical: no LLM,
            # no drift — the slice the user saw is the slice every run populates.
            again = rederive(reloaded, paths)
            self.assertEqual(again["cohort_sql"], derived["cohort_sql"])
            self.assertEqual(again["count"], derived["count"])
            self.assertEqual(again["criteria"], derived["criteria"])

    def test_value_edit_re_derives_deterministically_without_an_llm(self):
        # Editing a chip's value is a pure recompute — the count moves accordingly.
        paths = _db_paths()
        edited = rederive(_dataset(), paths)
        edited["criteria"][0]["predicate"]["value"] = 1  # widen row threshold to all
        edited.pop("count", None)
        again = rederive(edited, paths)
        self.assertEqual(again["criteria"][0]["display"], "Birth record row ≥ 1")
        self.assertEqual(
            again["count"], 4
        )  # every NICU baby, none excluded by row threshold

    def test_missing_dataset_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(DatasetError):
                load_dataset("nope", datasets_dir=Path(tmp))

    def test_underived_dataset_is_not_persisted(self):
        # A Dataset must be proved (cohort_sql + count) before it touches disk.
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(DatasetError):
                save_dataset(_dataset(), datasets_dir=Path(tmp))


class ListSummariesTest(unittest.TestCase):
    def test_lists_persisted_datasets_ordered_by_id(self):
        paths = _db_paths()
        with tempfile.TemporaryDirectory() as tmp:
            datasets_dir = Path(tmp)
            derived = rederive(_dataset(), paths)
            save_dataset(derived, datasets_dir=datasets_dir)
            second = _dataset()
            second["id"] = "dataset-a-first"
            save_dataset(rederive(second, paths), datasets_dir=datasets_dir)

            summaries = list_summaries(datasets_dir=datasets_dir)
            self.assertEqual(
                [s["id"] for s in summaries],
                ["dataset-a-first", "dataset-cordph-nicu"],
            )
            self.assertEqual(summaries[1]["name"], "Late NICU birth record")
            self.assertEqual(summaries[1]["databases"], ["cord-ph"])
            self.assertEqual(summaries[1]["count"], 1)

    def test_broken_and_partial_payloads_are_skipped_not_listed(self):
        paths = _db_paths()
        with tempfile.TemporaryDirectory() as tmp:
            datasets_dir = Path(tmp)
            save_dataset(rederive(_dataset(), paths), datasets_dir=datasets_dir)
            # Invalid JSON: skipped, never listed as an empty slice.
            broken = datasets_dir / "dataset-broken"
            broken.mkdir()
            (broken / "dataset.json").write_text("{not json", encoding="utf-8")
            # Hand-edited file without its proved count: skipped, not listed as 0.
            partial = datasets_dir / "dataset-partial"
            partial.mkdir()
            (partial / "dataset.json").write_text(
                '{"id": "dataset-partial", "name": "No count"}', encoding="utf-8"
            )
            # A stray file (not a dataset dir) is ignored.
            (datasets_dir / "README.txt").write_text("hi", encoding="utf-8")
            # A payload whose internal id disagrees with its directory name is
            # skipped: the storage key is the identity grants are checked
            # against, so a hand-edited id must never relabel a listing row.
            imposter = datasets_dir / "dataset-imposter"
            imposter.mkdir()
            (imposter / "dataset.json").write_text(
                '{"id": "dataset-other", "name": "Mislabeled", "count": 3}',
                encoding="utf-8",
            )

            summaries = list_summaries(datasets_dir=datasets_dir)
            self.assertEqual([s["id"] for s in summaries], ["dataset-cordph-nicu"])

    def test_missing_directory_lists_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(
                list_summaries(datasets_dir=Path(tmp) / "nowhere"), []
            )

    def test_non_object_payload_is_a_load_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            ds_dir = Path(tmp) / "dataset-list"
            ds_dir.mkdir()
            (ds_dir / "dataset.json").write_text("[1, 2]", encoding="utf-8")
            with self.assertRaises(DatasetError):
                load_dataset("dataset-list", datasets_dir=Path(tmp))


class DisplayTest(unittest.TestCase):
    def test_operator_symbols(self):
        self.assertEqual(
            display_predicate("Age", "number", {"op": ">=", "value": 18}), "Age ≥ 18"
        )
        self.assertEqual(
            display_predicate("Age", "number", {"op": "between", "value": [1, 5]}),
            "Age 1 – 5",
        )
        self.assertEqual(
            display_predicate("Type", "category", {"op": "in", "value": ["a", "b"]}),
            "Type: a, b",
        )


if __name__ == "__main__":
    unittest.main()
