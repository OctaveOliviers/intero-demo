"""Verify `catalog_execute` — the navigate `ls` of the bound databases.

`catalog` is the entry point when the agent doesn't yet know which database
holds what: it lists the **bound databases**, each with its one-line `summary`,
sorted by slug. It NEVER lists tables (a database can hold hundreds) and reads
``database/<slug>.model.json`` ONLY — never a SQLite database, never SQL.

Each call runs ``catalog.py`` as a subprocess with cwd set to a temp run
worktree holding ``database/<slug>.model.json`` — the same shape
``search_test.py`` uses, built from the REAL seeded models
(``cd intero && make seed``) so the assertions pin concrete clinical strings.

Run: ``python3 -m core.agent.test.catalog_test`` (from intero/).
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
SEEDED = REPO_ROOT / "var" / "databases"


def _seeded_model(slug: str) -> Path:
    path = SEEDED / slug / "model.json"
    if not path.is_file():
        raise unittest.SkipTest(
            f"seeded model missing: {path} — run `cd intero && make seed` first"
        )
    return path


def _run_catalog(worktree: Path, request: dict | None = None) -> dict:
    proc = subprocess.run(
        [sys.executable, str(TOOLS / "catalog.py"), json.dumps(request or {})],
        capture_output=True,
        text=True,
        cwd=worktree,
    )
    return json.loads(proc.stdout.strip() or proc.stderr.strip())


class CatalogSeededTest(unittest.TestCase):
    """Bind the real seeded cord-ph + npda models and list them."""

    BOUND = ("cord-ph", "npda-clinical", "npda-demographics")

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        db_dir = self.worktree / "databases"
        db_dir.mkdir()
        for slug in self.BOUND:
            shutil.copyfile(_seeded_model(slug), db_dir / f"{slug}.model.json")

    def tearDown(self):
        self._dir.cleanup()

    # --- lists every bound database, sorted by slug, with its summary --------

    def test_lists_all_bound_databases_sorted_by_slug(self):
        res = _run_catalog(self.worktree)
        self.assertTrue(res["ok"], res)
        slugs = [d["database"] for d in res["databases"]]
        self.assertEqual(slugs, ["cord-ph", "npda-clinical", "npda-demographics"])

    def test_cord_ph_carries_its_real_title_and_summary(self):
        res = _run_catalog(self.worktree)
        cord = next(d for d in res["databases"] if d["database"] == "cord-ph")
        self.assertEqual(cord["title"], "Cord pH EMR")
        self.assertEqual(
            cord["summary"],
            "Clinical database capturing birth events and early neonatal care at a maternity/neonatal hospital, centered on umbilical cord blood gas results and outcomes for babies at risk of hypoxic-ischaemic injury",
        )

    # --- a model with NO `summary` falls back to description's 1st sentence --

    def test_npda_clinical_summary_falls_back_to_first_sentence(self):
        # npda-clinical's model has no `summary`, so catalog falls back to the
        # first sentence of its `description` (split on the first ". ").
        res = _run_catalog(self.worktree)
        clinical = next(d for d in res["databases"] if d["database"] == "npda-clinical")
        self.assertEqual(
            clinical["summary"], "Visit-level clinical EPR for the Northway PDU"
        )
        # The fallback is the FIRST sentence only — the rest is dropped.
        self.assertNotIn(".", clinical["summary"])

    # --- the optional `collection` arg: "databases" == the default -----------

    def test_explicit_databases_collection_matches_default(self):
        # `catalog` accepts an optional `collection`; "databases" (and the
        # default) navigate the bound databases identically (navigation.md).
        default = _run_catalog(self.worktree)
        explicit = _run_catalog(self.worktree, {"collection": "databases"})
        self.assertEqual(json.dumps(explicit), json.dumps(default))

    # --- the defining constraint: NEVER lists tables -------------------------

    def test_never_lists_tables(self):
        res = _run_catalog(self.worktree)
        # No per-database entry carries a `tables` key (or any per-table data).
        for entry in res["databases"]:
            self.assertNotIn("tables", entry, entry)
            self.assertEqual(set(entry), {"database", "title", "summary"}, entry)
        # cord-ph has 13 tables; NONE of their names may appear anywhere in the
        # serialized output — not as keys, not buried in a string.
        blob = json.dumps(res)
        cord_tables = [t["name"] for t in _model_tables("cord-ph")]
        self.assertEqual(len(cord_tables), 13, cord_tables)
        for table_name in cord_tables:
            self.assertNotIn(table_name, blob, table_name)


def _model_tables(slug: str) -> list:
    return json.loads(_seeded_model(slug).read_text(encoding="utf-8"))["tables"]


class CatalogDegenerateTest(unittest.TestCase):
    """Hand-authored models: missing fields and an empty worktree."""

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        self.db_dir = self.worktree / "databases"
        self.db_dir.mkdir()

    def tearDown(self):
        self._dir.cleanup()

    def _write(self, slug: str, model: dict) -> None:
        (self.db_dir / f"{slug}.model.json").write_text(
            json.dumps(model), encoding="utf-8"
        )

    # --- neither summary nor description -> summary null; absent title null --

    def test_no_summary_no_description_yields_nulls(self):
        self._write("bare", {"database": "bare", "tables": []})
        res = _run_catalog(self.worktree)
        self.assertTrue(res["ok"], res)
        entry = next(d for d in res["databases"] if d["database"] == "bare")
        self.assertIsNone(entry["summary"])
        self.assertIsNone(entry["title"])

    # --- zero bound databases -> a clean empty list, NOT an error ------------

    def test_no_bound_databases_is_clean_empty_list(self):
        res = _run_catalog(self.worktree)
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["databases"], [])

    # --- an unknown `collection` is the standard actionable error ------------

    def test_unknown_collection_is_actionable_error_exit_2(self):
        # `catalog` is collection-generic (navigation.md): an unknown collection
        # must return the {"ok": false, "error": …} contract at exit 2, naming
        # the valid collections so the agent can self-correct — never a silent
        # success that ignores the bad arg.
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
        self.assertIn("no-such-collection", res["error"])
        self.assertIn("databases", res["error"])

    # --- a model whose top level is not a JSON object fails cleanly ----------

    def test_non_object_model_returns_error_not_crash(self):
        # A model.json whose top level is a JSON array (not an object) must be
        # rejected at the shared loader with the {"ok": false, "error": …}
        # contract — never a raw AttributeError + exit 1 (hardened in
        # _navigate.load_model so all four navigate tools are covered).
        (self.db_dir / "broken.model.json").write_text(
            json.dumps(["not", "an", "object"]), encoding="utf-8"
        )
        res = _run_catalog(self.worktree)
        self.assertFalse(res["ok"], res)
        self.assertIn("not a JSON object", res["error"], res)


if __name__ == "__main__":
    unittest.main(verbosity=2)
