"""Guard: `join-paths` does NOT apply to the `datasets` collection.

A Dataset is a saved filter with **no measured edges**, so `join-paths` is a
databases-only verb (navigation.md / ADR 0005). This test pins the boundary: the
`join_paths` tool exposes no `datasets` surface — a `{dataset}` request (and a
`collection: "datasets"` arg) is rejected with the {"ok": false, error} contract,
never silently routed at a dataset. It is the negative counterpart to the
catalog/search/describe datasets suites.

Run: ``python3 -m core.agent.test.join_paths_datasets_test`` (from intero/).
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


class JoinPathsHasNoDatasetSurfaceTest(unittest.TestCase):
    """A worktree holding only Datasets — `join-paths` finds no databases here."""

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        dst = self.worktree / "datasets" / "dataset-cordph-term-nicu"
        dst.mkdir(parents=True)
        shutil.copyfile(
            _seeded_dataset("dataset-cordph-term-nicu"), dst / "dataset.json"
        )

    def tearDown(self):
        self._dir.cleanup()

    def _join_paths(self, request: dict) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, str(TOOLS / "join_paths.py"), json.dumps(request)],
            capture_output=True,
            text=True,
            cwd=self.worktree,
        )

    # --- a `{dataset}` request is rejected — join-paths needs database+table ---

    def test_dataset_request_is_rejected_not_routed(self):
        proc = self._join_paths({"dataset": "dataset-cordph-term-nicu"})
        self.assertEqual(proc.returncode, 2, proc.stderr)
        res = json.loads(proc.stdout.strip() or proc.stderr.strip())
        self.assertFalse(res["ok"], res)
        # It demands a database — there is no Dataset edge graph to follow.
        self.assertIn("database", res["error"])

    # --- a `collection: datasets` arg buys nothing — there is no DB here -------

    def test_collection_datasets_arg_does_not_route_to_a_dataset(self):
        proc = self._join_paths(
            {"collection": "datasets", "dataset": "dataset-cordph-term-nicu"}
        )
        self.assertEqual(proc.returncode, 2, proc.stderr)
        res = json.loads(proc.stdout.strip() or proc.stderr.strip())
        self.assertFalse(res["ok"], res)
        # No Dataset id leaks into a neighbours result; it is a plain arg error.
        self.assertNotIn("neighbours", res)


if __name__ == "__main__":
    unittest.main(verbosity=2)
