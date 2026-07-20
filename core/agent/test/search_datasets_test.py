"""Verify `search_execute` over the `datasets` collection — the navigate `grep`
across the user's saved Datasets.

`search({collection: "datasets", query})` is a case-insensitive substring match
over each Dataset's **name + description**, returning the matching Datasets each
**fully located as a `dataset`** (navigation.md: `datasets` → `dataset`). A
Dataset is not a container of sub-items, so a hit locates the WHOLE Dataset (its
`dataset` path), never a sub-node. No match is a clean empty result, NOT an
error. It reads `datasets/<id>/dataset.json` ONLY — never a SQLite database,
never SQL — and returns metadata, never clinical cell values.

Each call runs ``search.py`` as a subprocess with cwd set to a temp run worktree
holding ``datasets/<id>/dataset.json`` — mirroring the databases ``search_test.py``
shape, built from the tracked seeded Dataset fixture.

Run: ``python3 -m core.agent.test.search_datasets_test`` (from intero/).
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


class SearchDatasetsSeededTest(unittest.TestCase):
    """Lay down the real seeded Dataset and grep it by name + description."""

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

    def _search(self, query) -> dict:
        request = {"collection": "datasets"}
        if query is not None:
            request["query"] = query
        proc = subprocess.run(
            [sys.executable, str(TOOLS / "search.py"), json.dumps(request)],
            capture_output=True,
            text=True,
            cwd=self.worktree,
        )
        return json.loads(proc.stdout.strip() or proc.stderr.strip())

    # --- a name keyword locates the WHOLE Dataset as `dataset` ----------------

    def test_name_keyword_locates_the_dataset(self):
        res = self._search("NICU")
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["query"], "NICU")
        self.assertEqual(res["match_count"], len(res["matches"]))
        hit = next(
            (
                m
                for m in res["matches"]
                if m["dataset"] == "dataset-cordph-term-nicu"
                and m["matched_on"] == "name"
            ),
            None,
        )
        self.assertIsNotNone(hit, res["matches"])
        self.assertIn("NICU", hit["context"])

    # --- a description keyword also locates the Dataset -----------------------

    def test_description_keyword_locates_the_dataset(self):
        # "term" appears in the description ("born at term") but not the name.
        res = self._search("born at term")
        self.assertTrue(res["ok"], res)
        hit = next(
            (
                m
                for m in res["matches"]
                if m["dataset"] == "dataset-cordph-term-nicu"
                and m["matched_on"] == "description"
            ),
            None,
        )
        self.assertIsNotNone(hit, res["matches"])
        self.assertIn("born at term", hit["context"])

    # --- the located hit is the WHOLE Dataset, never a sub-node ---------------

    def test_hit_locates_the_whole_dataset_no_sub_node(self):
        res = self._search("NICU")
        for m in res["matches"]:
            # `dataset` is the located path; there is no table/column/criterion
            # sub-node key (datasets are not containers — navigation.md).
            self.assertEqual(set(m), {"dataset", "matched_on", "context"}, m)

    # --- no match is a clean empty result, NOT an error ----------------------

    def test_non_matching_query_is_clean_empty_not_error(self):
        res = self._search("zzqqxx_no_such_token")
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["match_count"], 0)
        self.assertEqual(res["matches"], [])

    # --- case-insensitive substring ------------------------------------------

    def test_match_is_case_insensitive(self):
        lower = self._search("nicu")
        upper = self._search("NICU")
        self.assertEqual(lower["match_count"], upper["match_count"])
        self.assertGreater(lower["match_count"], 0)

    # --- an empty / missing query is a ToolError -----------------------------

    def test_empty_query_is_a_tool_error(self):
        res = self._search("")
        self.assertFalse(res["ok"], res)
        self.assertIn("query", res["error"])

    def test_missing_query_is_a_tool_error(self):
        res = self._search(None)
        self.assertFalse(res["ok"], res)
        self.assertIn("query", res["error"])

    # --- carries no clinical cell values --------------------------------------

    def test_carries_no_cell_values(self):
        res = self._search("NICU")
        blob = json.dumps(res)
        self.assertNotIn('"count"', blob)
        self.assertNotIn('"cohort_sql"', blob)


class SearchDatasetsMultipleTest(unittest.TestCase):
    """Hand-authored datasets: determinism, name+description double hits."""

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

    def _search(self, query: str) -> dict:
        proc = subprocess.run(
            [
                sys.executable,
                str(TOOLS / "search.py"),
                json.dumps({"collection": "datasets", "query": query}),
            ],
            capture_output=True,
            text=True,
            cwd=self.worktree,
        )
        return json.loads(proc.stdout.strip() or proc.stderr.strip())

    # --- a keyword in BOTH name and description -> two hits, name first --------

    def test_name_and_description_both_hit_name_first(self):
        self._write(
            "dataset-twin",
            {"id": "dataset-twin", "name": "Twin study", "description": "Twin cohort."},
        )
        res = self._search("twin")
        hits = [m for m in res["matches"] if m["dataset"] == "dataset-twin"]
        self.assertEqual([h["matched_on"] for h in hits], ["name", "description"])

    # --- results are sorted by dataset id (byte-stable) -----------------------

    def test_result_is_byte_stable_and_sorted_by_id(self):
        self._write("dataset-b", {"id": "dataset-b", "name": "Sepsis B"})
        self._write("dataset-a", {"id": "dataset-a", "name": "Sepsis A"})
        a = self._search("sepsis")
        b = self._search("sepsis")
        self.assertEqual(json.dumps(a), json.dumps(b))
        ids = [m["dataset"] for m in a["matches"]]
        self.assertEqual(ids, sorted(ids))

    # --- no saved Datasets -> a clean empty result ----------------------------

    def test_no_datasets_is_clean_empty(self):
        res = self._search("anything")
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["match_count"], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
