from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
TOOLS = REPO_ROOT / "core" / "agent" / "tools"
sys.path.insert(0, str(TOOLS))

import ask_user  # noqa: E402


class AskUserQuestionToolTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.cwd = Path(self._tmp.name)
        (self.cwd / "context.json").write_text(
            json.dumps({"mode": "chat", "databases": {"cord-ph": {}}}),
            encoding="utf-8",
        )

    def tearDown(self):
        self._tmp.cleanup()

    def test_records_questions(self):
        result = ask_user._record_questions(
            {
                "questions": [
                    {
                        "id": "dataset_scope",
                        "question": "Which Dataset should I use?",
                        "choices": [
                            {"id": "whole_db", "label": "Whole hospital database"}
                        ],
                        "allow_other": True,
                        "required": True,
                    }
                ]
            },
            self.cwd,
        )
        self.assertEqual(result["questionCount"], 1)
        payload = json.loads((self.cwd / "ask_user_questions.json").read_text())
        self.assertEqual(payload["questions"][0]["id"], "dataset_scope")
        self.assertEqual(payload["questions"][0]["choices"][0]["id"], "whole_db")

    def test_requires_chat_context(self):
        (self.cwd / "context.json").write_text(
            json.dumps({"mode": "run", "databases": {"cord-ph": {}}}),
            encoding="utf-8",
        )
        with self.assertRaises(Exception):
            ask_user._record_questions(
                {"questions": [{"id": "q", "question": "Question?"}]}, self.cwd
            )

    def test_rejects_duplicate_question_ids(self):
        with self.assertRaises(Exception):
            ask_user._record_questions(
                {
                    "questions": [
                        {"id": "q", "question": "First?"},
                        {"id": "q", "question": "Second?"},
                    ]
                },
                self.cwd,
            )


if __name__ == "__main__":
    unittest.main()
