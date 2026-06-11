"""`profile.discover_identity_links`: cross-database identity links are MEASURED
(value-overlap), never guessed from names.

The invariant: a real shared identity space (visits.patient_ref holding NHS
numbers that exist in patients.nhs_number) is found with its evidence; a
small code set, a sub-threshold overlap, or a no-siblings call never links.

Run: ``python3 -m core.indexing.tests.identity_links``
"""

import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from core.indexing.build_database_model import extract_schema, _build_filterable_surface  # noqa: E402
from core.indexing.profile import discover_identity_links  # noqa: E402

NHS = [f"94347659{i:02d}" for i in range(20)]


def _make_clinical(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.execute(
        "CREATE TABLE visits (visit_id TEXT PRIMARY KEY, patient_ref TEXT, "
        "sex_code TEXT, visit_date TEXT)"
    )
    for i, nhs in enumerate(NHS):
        conn.execute(
            "INSERT INTO visits VALUES (?, ?, ?, ?)",
            (f"V{i:04d}", nhs, "1" if i % 2 else "2", f"2026-01-{i + 1:02d}"),
        )
    conn.commit()
    conn.close()


def _make_demographics(path: Path, *, drop_overlap: bool = False) -> None:
    conn = sqlite3.connect(path)
    conn.execute(
        "CREATE TABLE patients (nhs_number TEXT PRIMARY KEY, sex_code TEXT, "
        "date_of_birth TEXT)"
    )
    numbers = [f"00000000{i:02d}" for i in range(20)] if drop_overlap else NHS
    for i, nhs in enumerate(numbers):
        conn.execute(
            "INSERT INTO patients VALUES (?, ?, ?)",
            (nhs, "1" if i % 2 else "2", f"19{60 + i}-05-01"),
        )
    conn.commit()
    conn.close()


def _links(clinical: Path, demographics: Path) -> list[dict]:
    schema = extract_schema(clinical)
    classifications = _build_filterable_surface(clinical, schema)
    return discover_identity_links(
        clinical, schema, classifications, {"demographics": demographics}
    )


class IdentityLinkTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.d = Path(self._dir.name)
        self.clinical = self.d / "clinical.sqlite"
        self.demographics = self.d / "demographics.sqlite"
        _make_clinical(self.clinical)

    def tearDown(self):
        self._dir.cleanup()

    def test_shared_identity_space_is_measured_with_evidence(self):
        _make_demographics(self.demographics)
        links = _links(self.clinical, self.demographics)
        match = [l for l in links if l["column"] == "visits.patient_ref"]
        self.assertEqual(len(match), 1, links)
        self.assertEqual(match[0]["target"], "demographics -> patients.nhs_number")
        self.assertEqual(match[0]["evidence"], "20/20 sampled values found in target")

    def test_code_sets_never_link(self):
        # sex_code overlaps 100% across the DBs ('1'/'2') but identifies nothing:
        # category columns are not candidates and tiny value sets are excluded.
        _make_demographics(self.demographics)
        links = _links(self.clinical, self.demographics)
        self.assertFalse(
            [l for l in links if "sex_code" in l["column"] or "sex_code" in l["target"]],
            links,
        )

    def test_sub_threshold_overlap_never_links(self):
        _make_demographics(self.demographics, drop_overlap=True)
        self.assertEqual(_links(self.clinical, self.demographics), [])

    def test_no_siblings_is_empty_and_runs_no_queries(self):
        schema = extract_schema(self.clinical)
        classifications = _build_filterable_surface(self.clinical, schema)
        self.assertEqual(
            discover_identity_links(self.clinical, schema, classifications, {}), []
        )


class SeedModelLinkTest(unittest.TestCase):
    """The committed NPDA seed models carry the measured link (regenerated in the
    same PR that added the profiler)."""

    def test_npda_clinical_seed_links_to_demographics(self):
        model = json.loads(
            (REPO_ROOT / "seed/databases/npda-clinical/model.json").read_text()
        )
        links = model.get("identity_links") or []
        self.assertIn(
            ("clinic_visits.patient_ref", "npda-demographics -> patients.nhs_number"),
            [(l["column"], l["target"]) for l in links],
            links,
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
