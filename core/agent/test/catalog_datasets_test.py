"""Verify `catalog_execute` over the `datasets` collection — the navigate `ls`
of the user's saved Datasets.

`catalog({collection: "datasets"})` lists every saved Dataset (a `dataset.json`),
each as `{id, title, summary}` — `id` is the dataset's directory name, `title` is
the Dataset's `name`, `summary` is the first sentence of its `description`. It
NEVER descends into a Dataset's criteria (that is `describe`'s job) and reads
`datasets/<id>/dataset.json` ONLY — never a SQLite database, never SQL.

Each call runs ``catalog.py`` as a subprocess with cwd set to a temp run
worktree holding ``datasets/<id>/dataset.json`` — mirroring the databases
``catalog_test.py`` shape, but built from the tracked seeded Dataset fixture so
the assertions pin concrete clinical strings.

Run: ``python3 -m core.agent.test.catalog_datasets_test`` (from intero/).
"""

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
TOOLS = REPO_ROOT / "core" / "agent" / "tools"
SEEDED = REPO_ROOT / "data" / "seed" / "datasets"


def _seeded_dataset(dataset_id: str) -> Path:
    path = SEEDED / dataset_id / "dataset.json"
    if not path.is_file():
        raise unittest.SkipTest(f"seeded dataset missing: {path}")
    return path


def _run_catalog(worktree: Path, request: dict | None = None) -> dict:
    proc = subprocess.run(
        [sys.executable, str(TOOLS / "catalog.py"), json.dumps(request or {})],
        capture_output=True,
        text=True,
        cwd=worktree,
    )
    return json.loads(proc.stdout.strip() or proc.stderr.strip())


class CatalogDatasetsSeededTest(unittest.TestCase):
    """Lay down the real seeded Dataset and list it."""

    DATASETS = ("dataset-cordph-term-nicu",)

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        for dataset_id in self.DATASETS:
            dst = self.worktree / "datasets" / dataset_id
            dst.mkdir(parents=True)
            shutil.copyfile(_seeded_dataset(dataset_id), dst / "dataset.json")

    def tearDown(self):
        self._dir.cleanup()

    # --- lists the saved Dataset as {id, title, summary} ----------------------

    def test_lists_seeded_dataset_with_id_title_summary(self):
        res = _run_catalog(self.worktree, {"collection": "datasets"})
        self.assertTrue(res["ok"], res)
        self.assertEqual(len(res["datasets"]), 1)
        entry = res["datasets"][0]
        self.assertEqual(entry["id"], "dataset-cordph-term-nicu")
        self.assertEqual(entry["title"], "Term babies admitted to NICU")
        self.assertEqual(
            entry["summary"],
            "Babies born at term (>=39 weeks) who were admitted to the NICU.",
        )

    # --- catalog is shallow: NEVER descends into a Dataset's criteria ---------

    def test_never_lists_criteria(self):
        # `catalog` is `ls`, not `cat`: each entry is exactly {id, title, summary}
        # — never the criteria/cohort/cohort_sql a `describe` would inline. Assert
        # on quoted JSON KEYS (not prose substrings, which a description could
        # legitimately contain) so the guard pins the shape, not the fixture text.
        res = _run_catalog(self.worktree, {"collection": "datasets"})
        for entry in res["datasets"]:
            self.assertEqual(set(entry), {"id", "title", "summary"}, entry)
        blob = json.dumps(res)
        self.assertNotIn('"criteria"', blob)
        self.assertNotIn('"cohort"', blob)
        self.assertNotIn('"cohort_sql"', blob)
        # No criterion SQL (the cohort predicates) may leak into the listing.
        self.assertNotIn("gestation_weeks", blob)

    # --- catalog is metadata only: NEVER a clinical cell value ----------------

    def test_carries_no_cell_values(self):
        res = _run_catalog(self.worktree, {"collection": "datasets"})
        blob = json.dumps(res)
        # `count` is a derived metric a `describe` may surface, but the shallow
        # listing never carries it. Match the quoted JSON key, not the bare word
        # (a description could legitimately say "count").
        self.assertNotIn('"count"', blob)


class CatalogDatasetsMultipleTest(unittest.TestCase):
    """Hand-authored datasets: sorting by id, missing description, empty dir."""

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        self.datasets_dir = self.worktree / "datasets"
        self.datasets_dir.mkdir()

    def tearDown(self):
        self._dir.cleanup()

    def _write(self, dataset_id: str, dataset: dict) -> None:
        dst = self.datasets_dir / dataset_id
        dst.mkdir()
        (dst / "dataset.json").write_text(json.dumps(dataset), encoding="utf-8")

    # --- lists every saved Dataset, sorted by id ------------------------------

    def test_lists_all_datasets_sorted_by_id(self):
        self._write(
            "dataset-b", {"id": "dataset-b", "name": "B", "description": "Bee."}
        )
        self._write("dataset-a", {"id": "dataset-a", "name": "A", "description": "Ay."})
        res = _run_catalog(self.worktree, {"collection": "datasets"})
        self.assertTrue(res["ok"], res)
        self.assertEqual([d["id"] for d in res["datasets"]], ["dataset-a", "dataset-b"])

    # --- a Dataset with no description -> summary null ------------------------

    def test_no_description_yields_null_summary(self):
        self._write("dataset-x", {"id": "dataset-x", "name": "X"})
        res = _run_catalog(self.worktree, {"collection": "datasets"})
        entry = next(d for d in res["datasets"] if d["id"] == "dataset-x")
        self.assertIsNone(entry["summary"])
        self.assertEqual(entry["title"], "X")

    # --- summary is the FIRST sentence only ----------------------------------

    def test_summary_is_first_sentence_only(self):
        self._write(
            "dataset-y",
            {"id": "dataset-y", "name": "Y", "description": "First. Second."},
        )
        res = _run_catalog(self.worktree, {"collection": "datasets"})
        entry = next(d for d in res["datasets"] if d["id"] == "dataset-y")
        self.assertEqual(entry["summary"], "First")

    # --- no saved Datasets -> a clean empty list, NOT an error ----------------

    def test_no_datasets_is_clean_empty_list(self):
        res = _run_catalog(self.worktree, {"collection": "datasets"})
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["datasets"], [])


class CatalogDatasetsCollectionGuardTest(unittest.TestCase):
    """The `datasets` collection co-exists with `databases`; unknown is an error."""

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        (self.worktree / "datasets").mkdir()

    def tearDown(self):
        self._dir.cleanup()

    # --- `datasets` is named alongside `databases` in the error list ----------

    def test_unknown_collection_lists_datasets_among_valid(self):
        proc = subprocess.run(
            [
                sys.executable,
                str(TOOLS / "catalog.py"),
                json.dumps({"collection": "no-such-collection"}),
            ],
            capture_output=True,
            text=True,
            cwd=self.worktree,
        )
        self.assertEqual(proc.returncode, 2, proc.stderr)
        res = json.loads(proc.stdout.strip() or proc.stderr.strip())
        self.assertFalse(res["ok"], res)
        self.assertIn("datasets", res["error"])
        self.assertIn("databases", res["error"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
