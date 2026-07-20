"""Verify `describe` over the `datasets` collection — the navigate `cat` of one
saved Dataset.

`describe({collection: "datasets", dataset})` reads ONE Dataset in full: its
`description` + its grounded filters/`criteria` + the scope it resolves to
(`cohort` + `databases`, plus the cached `count` when present). It locates the
whole Dataset — a Dataset is a saved, named filter, not a container of sub-items,
so there is no leaf-path variant. It reads `datasets/<id>/dataset.json` ONLY —
read-only, local-only, metadata only; never a SQLite database, never SQL, never
clinical cell values.

The `describe` verb is fronted by ``describe.py``, which forwards the whole
request to the collection; the `datasets` collection parses `{dataset}` from it.
Each call runs ``describe.py`` as a subprocess with cwd set to a temp run
worktree holding ``datasets/<id>/dataset.json`` — built from the tracked seeded
Dataset fixture so the assertions pin concrete strings.

Run: ``python3 -m core.agent.test.describe_dataset_test`` (from intero/).
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


def _describe(worktree: Path, request: dict) -> dict:
    proc = subprocess.run(
        [sys.executable, str(TOOLS / "describe.py"), json.dumps(request)],
        capture_output=True,
        text=True,
        cwd=worktree,
    )
    return json.loads(proc.stdout.strip() or proc.stderr.strip())


class DescribeDatasetSeededTest(unittest.TestCase):
    """Lay down the real seeded Dataset and `cat` it."""

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

    def _describe(self, request: dict) -> dict:
        return _describe(self.worktree, {"collection": "datasets", **request})

    # --- the Dataset's description + identity ---------------------------------

    def test_returns_dataset_description_and_identity(self):
        res = self._describe({"dataset": "dataset-cordph-term-nicu"})
        self.assertTrue(res["ok"], res)
        ds = res["dataset"]
        self.assertEqual(ds["id"], "dataset-cordph-term-nicu")
        self.assertEqual(ds["name"], "Term babies admitted to NICU")
        self.assertEqual(
            ds["description"],
            "Babies born at term (>=39 weeks) who were admitted to the NICU.",
        )

    # --- the grounded filters / criteria --------------------------------------

    def test_returns_the_grounded_criteria(self):
        res = self._describe({"dataset": "dataset-cordph-term-nicu"})
        ds = res["dataset"]
        labels = [c["label"] for c in ds["criteria"]]
        self.assertEqual(labels, ["Gestation (weeks)", "Admitted to NICU"])
        gestation = ds["criteria"][0]
        self.assertEqual(gestation["criterion_id"], "gestation_weeks")
        self.assertEqual(
            gestation["source"], "cord-ph -> cord_ph_birth_records.gestation_weeks"
        )
        self.assertEqual(gestation["predicate"], {"op": ">=", "value": 39})
        self.assertEqual(gestation["display"], "Gestation (weeks) ≥ 39")

    # --- the scope the Dataset resolves to: cohort + databases + count --------

    def test_returns_the_scope_cohort_databases_and_count(self):
        res = self._describe({"dataset": "dataset-cordph-term-nicu"})
        ds = res["dataset"]
        self.assertEqual(ds["databases"], ["cord-ph"])
        self.assertEqual(ds["cohort"]["database"], "cord-ph")
        self.assertEqual(ds["cohort"]["from"], "cord_ph_birth_records b")
        self.assertEqual(
            ds["cohort"]["identity_select"], "b.patient_code AS patient_code"
        )
        # The cached count is surfaced when present (a derived metric).
        self.assertEqual(ds["count"], 1)

    # --- read-only / metadata only: never row or cell values ------------------

    def test_carries_no_row_or_cell_values(self):
        res = self._describe({"dataset": "dataset-cordph-term-nicu"})
        blob = json.dumps(res)
        # `rows`/`cells` are sql_execute's row-data keys; a metadata read of a
        # Dataset must never carry them.
        self.assertNotIn('"rows"', blob)
        self.assertNotIn('"cells"', blob)

    # --- an unknown dataset lists the available ones --------------------------

    def test_unknown_dataset_errors_and_lists_available(self):
        proc = subprocess.run(
            [
                sys.executable,
                str(TOOLS / "describe.py"),
                json.dumps({"collection": "datasets", "dataset": "no-such-dataset"}),
            ],
            capture_output=True,
            text=True,
            cwd=self.worktree,
        )
        self.assertEqual(proc.returncode, 2, proc.stderr)
        res = json.loads(proc.stdout.strip() or proc.stderr.strip())
        self.assertFalse(res["ok"], res)
        self.assertIn("no-such-dataset", res["error"])
        # The available datasets are named so the agent can self-correct.
        self.assertIn("dataset-cordph-term-nicu", res["error"])

    # --- a missing / empty `dataset` arg is a ToolError -----------------------

    def test_missing_dataset_is_a_tool_error(self):
        res = self._describe({})
        self.assertFalse(res["ok"], res)
        self.assertIn("dataset", res["error"])

    def test_empty_dataset_is_a_tool_error(self):
        res = self._describe({"dataset": "  "})
        self.assertFalse(res["ok"], res)
        self.assertIn("dataset", res["error"])


class DescribeDatasetScopeShapeTest(unittest.TestCase):
    """Hand-authored datasets: optional `count`, empty criteria."""

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

    def _describe(self, dataset_id: str) -> dict:
        return _describe(
            self.worktree, {"collection": "datasets", "dataset": dataset_id}
        )

    # --- a Dataset with no cached `count` omits the key, not null -------------

    def test_absent_count_is_omitted(self):
        self._write(
            "dataset-nocount",
            {
                "id": "dataset-nocount",
                "name": "No count yet",
                "description": "Pending.",
                "databases": ["cord-ph"],
                "cohort": {
                    "database": "cord-ph",
                    "from": "t",
                    "identity_select": "id",
                },
                "criteria": [],
            },
        )
        res = self._describe("dataset-nocount")
        self.assertTrue(res["ok"], res)
        self.assertNotIn("count", res["dataset"])
        self.assertEqual(res["dataset"]["criteria"], [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
