"""Verify the primary chat agent's table sink tool ``table_execute``.

The tool is intentionally not the table-population worker. It is the deep
interface the primary agent sees: record a domain-level table request in the chat
worktree. The server owns the side effect after the agent session returns: pin
the first-class table, launch the existing table-population run, and stream the
table element back through the thread.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
TOOLS = REPO_ROOT / "core" / "agent" / "tools"


class TableExecuteTest(unittest.TestCase):
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
            [sys.executable, str(TOOLS / "table.py"), json.dumps(request)],
            capture_output=True,
            text=True,
            cwd=self.worktree,
        )
        return json.loads(proc.stdout.strip() or proc.stderr.strip())

    def _table_request_json(self) -> dict:
        return json.loads(
            (self.worktree / "table_request.json").read_text(encoding="utf-8")
        )

    def test_valid_table_request_writes_table_request_json(self):
        res = self._tool(
            {
                "title": "Cord pH audit table",
                "request": "Create one row per birth with delivery mode and cord pH.",
                "source_template": "cord-ph",
                "dataset_id": "ds-term",
                "description": "Requested from chat.",
            }
        )
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["title"], "Cord pH audit table")
        written = self._table_request_json()
        self.assertEqual(written["title"], "Cord pH audit table")
        self.assertEqual(
            written["request"],
            "Create one row per birth with delivery mode and cord pH.",
        )
        self.assertEqual(written["source_template"], "cord-ph")
        self.assertEqual(written["dataset_id"], "ds-term")
        self.assertEqual(written["description"], "Requested from chat.")

    def test_title_defaults_from_request(self):
        res = self._tool({"request": "Build a table for the cord pH audit."})
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["title"], "Build a table for the cord pH audit.")
        written = self._table_request_json()
        self.assertEqual(written["title"], "Build a table for the cord pH audit.")
        self.assertIsNone(written["source_template"])
        self.assertIsNone(written["dataset_id"])

    def test_empty_request_is_rejected(self):
        res = self._tool({"request": "   "})
        self.assertFalse(res["ok"])
        self.assertIn("request", res["error"])
        self.assertFalse((self.worktree / "table_request.json").exists())

    def test_only_runs_in_chat_worktree(self):
        (self.worktree / "context.json").write_text(
            json.dumps({"mode": "run", "databases": {}}),
            encoding="utf-8",
        )
        res = self._tool({"request": "Build a table."})
        self.assertFalse(res["ok"])
        self.assertIn("chat worktree", res["error"])
        self.assertFalse((self.worktree / "table_request.json").exists())


if __name__ == "__main__":
    unittest.main()
