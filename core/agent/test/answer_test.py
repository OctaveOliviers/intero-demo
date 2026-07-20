"""Verify the chat citation sink tool `cite_execute` (as opencode invokes it)."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
TOOLS = REPO_ROOT / "core" / "agent" / "tools"


def _citation(**overrides) -> dict:
    base = {
        "database": "cord-ph",
        "query": "SELECT COUNT(*) AS n FROM cord_ph_birth_records",
        "table_column": "cord_ph_birth_records.patient_code",
        "explanation": "the count of birth records",
    }
    base.update(overrides)
    return base


def _aggregate_citation(**overrides) -> dict:
    base = _citation(
        kind="aggregate",
        query="SELECT COUNT(*) AS n FROM cord_ph_birth_records",
        explanation="count of birth records",
        denominator={"label": "birth records", "value": 412},
        completeness={"label": "cord arterial pH recorded", "value": "389/412"},
        covered_rows=[
            {
                "database": "cord-ph",
                "query": "SELECT patient_code FROM cord_ph_birth_records WHERE patient_code='CPH001'",
                "table_column": "cord_ph_birth_records.patient_code",
                "explanation": "covered birth record",
            }
        ],
    )
    base.update(overrides)
    return base


class CiteExecuteTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        (self.worktree / "context.json").write_text(
            json.dumps(
                {
                    "mode": "chat",
                    "databases": {
                        "cord-ph": {
                            "cohort_tables": [],
                            "identity_links": [],
                            "foreign_keys": [],
                        }
                    },
                }
            ),
            encoding="utf-8",
        )

    def tearDown(self):
        self._dir.cleanup()

    def _tool(self, request: dict) -> dict:
        proc = subprocess.run(
            [sys.executable, str(TOOLS / "cite.py"), json.dumps(request)],
            capture_output=True,
            text=True,
            cwd=self.worktree,
        )
        output = proc.stdout.strip() or proc.stderr.strip()
        try:
            return json.loads(output)
        except json.JSONDecodeError:
            return {"ok": False, "error": output}

    def _citations_json(self) -> list:
        return json.loads(
            (self.worktree / "citations.json").read_text(encoding="utf-8")
        )

    def test_valid_citation_is_recorded_with_backend_marker(self):
        res = self._tool(_citation())
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["marker"], "1")
        written = self._citations_json()
        self.assertEqual(written[0]["marker"], "1")
        self.assertEqual(written[0]["database"], "cord-ph")

    def test_multiple_citations_get_sequential_markers(self):
        first = self._tool(_citation())
        second = self._tool(_citation(query="SELECT patient_code FROM patients"))
        self.assertTrue(first["ok"], first)
        self.assertTrue(second["ok"], second)
        self.assertEqual([c["marker"] for c in self._citations_json()], ["1", "2"])

    def test_citation_rejects_unknown_database(self):
        res = self._tool(_citation(database="../auth.sqlite"))
        self.assertFalse(res["ok"])
        self.assertIn("unknown database", res["error"])
        self.assertFalse((self.worktree / "citations.json").exists())

    def test_citation_missing_database_rejected(self):
        bad = _citation()
        del bad["database"]
        res = self._tool(bad)
        self.assertFalse(res["ok"])
        self.assertIn("database", res["error"])

    def test_citation_missing_query_rejected(self):
        bad = _citation()
        del bad["query"]
        res = self._tool(bad)
        self.assertFalse(res["ok"])
        self.assertIn("query", res["error"])

    def test_citation_missing_table_column_rejected(self):
        bad = _citation()
        del bad["table_column"]
        res = self._tool(bad)
        self.assertFalse(res["ok"])
        self.assertIn("table_column", res["error"])

    def test_non_select_query_rejected(self):
        res = self._tool(
            _citation(query="UPDATE cord_ph_birth_records SET delivery='9'")
        )
        self.assertFalse(res["ok"])
        self.assertFalse((self.worktree / "citations.json").exists())

    def test_schema_catalog_citation_query_rejected(self):
        res = self._tool(_citation(query="SELECT name FROM sqlite_master"))
        self.assertFalse(res["ok"])
        self.assertIn("schema", res["error"].lower())
        self.assertFalse((self.worktree / "citations.json").exists())

    def test_table_valued_schema_pragma_citation_query_rejected(self):
        res = self._tool(
            _citation(query="SELECT * FROM pragma_table_info('cord_ph_birth_records')")
        )
        self.assertFalse(res["ok"])
        self.assertIn("schema", res["error"].lower())
        self.assertFalse((self.worktree / "citations.json").exists())

    def test_bare_schema_pragma_citation_query_rejected(self):
        res = self._tool(_citation(query="SELECT * FROM pragma_database_list"))
        self.assertFalse(res["ok"])
        self.assertIn("schema", res["error"].lower())
        self.assertFalse((self.worktree / "citations.json").exists())

    def test_note_citation_round_trips_free_text_fields(self):
        cite = _citation(
            table_column="clinician_notes.note_text",
            query="SELECT note_id, note_text FROM clinician_notes WHERE note_id='n1'",
            row_id="n1",
            row_key="note_id",
            citations=["declined dose increase"],
        )
        res = self._tool(cite)
        self.assertTrue(res["ok"], res)
        written = self._citations_json()[0]
        self.assertEqual(written["row_id"], "n1")
        self.assertEqual(written["citations"], ["declined dose increase"])

    def test_aggregate_citation_records_denominator_completeness_and_rows(self):
        res = self._tool(_aggregate_citation())
        self.assertTrue(res["ok"], res)
        written = self._citations_json()[0]
        self.assertEqual(written["kind"], "aggregate")
        self.assertEqual(written["denominator"]["value"], 412)
        self.assertEqual(written["completeness"]["value"], "389/412")
        self.assertEqual(len(written["covered_rows"]), 1)

    def test_aggregate_citation_without_covered_rows_is_rejected(self):
        cite = _aggregate_citation()
        del cite["covered_rows"]
        res = self._tool(cite)
        self.assertFalse(res["ok"])
        self.assertIn("covered_rows", res["error"])
        self.assertFalse((self.worktree / "citations.json").exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
