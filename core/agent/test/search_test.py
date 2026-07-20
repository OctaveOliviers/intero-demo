"""Verify `search_execute` — the navigate keyword grep into the bound models.

`search` is the way INTO tables: a case-insensitive substring search across ALL
bound databases over table/column names + descriptions + code-set labels,
returning candidate `table.column`s. It reads ``database/<slug>.model.json``
ONLY — never a SQLite database, never SQL — and returns metadata, never clinical
cell values.

Each call runs ``search.py`` as a subprocess with cwd set to a temp run worktree
holding ``database/<slug>.model.json`` — the same shape ``sql_execute_test.py``
uses, but built from the REAL seeded models (``cd intero && make seed``) so the
assertions pin concrete clinical strings, not hand-authored stand-ins.

Run: ``python3 -m core.agent.test.search_test`` (from intero/).
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


class SearchTest(unittest.TestCase):
    """Bind the seeded cord-ph + npda-clinical models and grep them."""

    BOUND = ("cord-ph", "npda-clinical")

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        db_dir = self.worktree / "databases"
        db_dir.mkdir()
        for slug in self.BOUND:
            shutil.copyfile(_seeded_model(slug), db_dir / f"{slug}.model.json")

    def tearDown(self):
        self._dir.cleanup()

    def _search(self, query) -> dict:
        request = {} if query is None else {"query": query}
        proc = subprocess.run(
            [sys.executable, str(TOOLS / "search.py"), json.dumps(request)],
            capture_output=True,
            text=True,
            cwd=self.worktree,
        )
        return json.loads(proc.stdout.strip() or proc.stderr.strip())

    def _search_proc(self, request: dict):
        return subprocess.run(
            [sys.executable, str(TOOLS / "search.py"), json.dumps(request)],
            capture_output=True,
            text=True,
            cwd=self.worktree,
        )

    # --- a keyword over a real column surfaces the table.column ---------------

    def test_query_ph_surfaces_observation_ph_metadata(self):
        res = self._search("ph")
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["query"], "ph")
        self.assertEqual(res["match_count"], len(res["matches"]))
        # In the unstructured cord-pH fixture, pH values are exposed through the
        # observation metadata rather than a direct cord_ph_birth_records column.
        hit = next(
            (
                m
                for m in res["matches"]
                if m["database"] == "cord-ph"
                and m["table"] == "observations"
                and m["column"] == "description"
            ),
            None,
        )
        self.assertIsNotNone(hit, res["matches"])
        self.assertEqual(hit["matched_on"], "column_description")
        self.assertIn("pH", hit["context"])

    # --- a code-set label hit carries the "key: value" context ----------------

    def test_code_label_match_returns_key_value_context(self):
        # cord-ph's clinical_notes.note_type codes include
        # "nicu_admission": "Admission note for the neonatal intensive care unit".
        res = self._search("Admission note for the neonatal")
        self.assertTrue(res["ok"], res)
        hit = next(
            (
                m
                for m in res["matches"]
                if m["matched_on"] == "code_label"
                and m["table"] == "clinical_notes"
                and m["column"] == "note_type"
            ),
            None,
        )
        self.assertIsNotNone(hit, res["matches"])
        self.assertEqual(hit["database"], "cord-ph")
        self.assertIn("nicu_admission", hit["context"])
        self.assertIn(
            "Admission note for the neonatal intensive care unit", hit["context"]
        )

    # --- searches ALL bound databases ----------------------------------------

    def test_term_in_both_databases_returns_candidates_from_both(self):
        # Both cord-ph and npda-clinical have a `clinical_notes` table, so a
        # table_name search for "clinical" must surface BOTH databases.
        res = self._search("clinical")
        self.assertTrue(res["ok"], res)
        dbs = {
            m["database"]
            for m in res["matches"]
            if m["matched_on"] == "table_name" and m["table"] == "clinical_notes"
        }
        self.assertEqual(dbs, {"cord-ph", "npda-clinical"}, res["matches"])

    # --- no match is a clean empty result, NOT an error ----------------------

    def test_non_matching_query_is_clean_empty_not_error(self):
        res = self._search("zzqqxx_no_such_token")
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["match_count"], 0)
        self.assertEqual(res["matches"], [])

    # --- an empty / missing query is a ToolError -----------------------------

    def test_empty_query_is_a_tool_error(self):
        res = self._search("")
        self.assertFalse(res["ok"], res)
        self.assertIn("query", res["error"])

    def test_missing_query_is_a_tool_error(self):
        res = self._search(None)
        self.assertFalse(res["ok"], res)
        self.assertIn("query", res["error"])

    # --- ordering is deterministic / byte-stable -----------------------------

    def test_result_is_byte_stable_across_runs(self):
        a = self._search("note")
        b = self._search("note")
        self.assertEqual(json.dumps(a), json.dumps(b))
        # databases come back sorted by slug.
        slugs = [m["database"] for m in a["matches"]]
        self.assertEqual(slugs, sorted(slugs))

    # --- the optional `collection` arg: "databases" == the default -----------

    def test_explicit_databases_collection_matches_default(self):
        # `search` accepts an optional `collection`; "databases" (and the
        # default) grep the bound databases identically (navigation.md).
        default = self._search("note")
        explicit = json.loads(
            self._search_proc({"query": "note", "collection": "databases"}).stdout
        )
        self.assertEqual(json.dumps(explicit), json.dumps(default))

    def test_unknown_collection_is_actionable_error_exit_2(self):
        # An unknown collection is the {"ok": false, "error": …} contract at exit
        # 2, naming the valid collections — never a silent grep of the default.
        proc = self._search_proc({"query": "note", "collection": "no-such"})
        self.assertEqual(proc.returncode, 2, proc.stderr)
        res = json.loads(proc.stdout.strip() or proc.stderr.strip())
        self.assertFalse(res["ok"], res)
        self.assertIn("no-such", res["error"])
        self.assertIn("databases", res["error"])

    def test_collection_is_resolved_before_query_is_validated(self):
        # Deliberate precedence: the collection is selected FIRST, because a
        # verb's args are only meaningful relative to the collection they target
        # (a future `templates` collection would take different args). So with an
        # unknown collection AND an empty query, the collection error wins — both
        # paths are still {"ok": false, error} + exit 2.
        proc = self._search_proc({"query": "", "collection": "no-such"})
        self.assertEqual(proc.returncode, 2, proc.stderr)
        res = json.loads(proc.stdout.strip() or proc.stderr.strip())
        self.assertFalse(res["ok"], res)
        self.assertIn("no-such", res["error"])

    # --- case-insensitive substring ------------------------------------------

    def test_match_is_case_insensitive(self):
        lower = self._search("nicu")
        upper = self._search("NICU")
        self.assertEqual(lower["match_count"], upper["match_count"])
        self.assertGreater(lower["match_count"], 0)


class SearchEmptyModelTest(unittest.TestCase):
    """Degenerate / malformed models must not crash the grep."""

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

    def _search(self, query: str) -> dict:
        proc = subprocess.run(
            [sys.executable, str(TOOLS / "search.py"), json.dumps({"query": query})],
            capture_output=True,
            text=True,
            cwd=self.worktree,
        )
        return json.loads(proc.stdout.strip() or proc.stderr.strip())

    def test_null_tables_and_missing_fields_do_not_crash(self):
        self._write("a", {"database": "a", "tables": None})
        self._write("b", {"database": "b"})  # no tables key at all
        self._write(
            "c",
            {
                "database": "c",
                "tables": [
                    {"name": "t"},  # no description, no columns
                    {
                        "name": "u",
                        "columns": [{"name": "col"}],
                    },  # column, no codes/desc
                ],
            },
        )
        res = self._search("t")
        self.assertTrue(res["ok"], res)
        # Matches the table name "t" in DB c — and does not blow up on a/b.
        self.assertTrue(
            any(
                m["database"] == "c"
                and m["table"] == "t"
                and m["matched_on"] == "table_name"
                for m in res["matches"]
            ),
            res,
        )

    def test_no_bound_databases_is_clean_empty(self):
        res = self._search("anything")
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["match_count"], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
