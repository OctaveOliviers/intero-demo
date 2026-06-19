"""Verify lookup's canonical field-id handling (the 'did you mean' hint).

Audit field ids are canonical slugs like ``patient-details/ethnic_category``.
The agent often tries the short tail (``ethnic_category``) and the lookup misses;
on a miss the tool must SUGGEST the closest canonical id(s) — strictly a hint,
never a silent resolve. An exact canonical id still works, and ``{audit: true}``
still lists the fields.

lookup.py is run as a subprocess with its cwd set to a temp run worktree holding
``audit/spec.json`` — the same shape sql_execute_test.py uses.

Run: ``python3 -m core.agent.test.lookup_fieldids_test`` (from repo root).
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
TOOLS = REPO_ROOT / "core" / "agent" / ".opencode" / "tools"


def _audit() -> dict:
    # Field ids are canonical slugs: <group>/<name>.
    return {"audit": "patient-details", "fields": [
        {"id": "patient-details/ethnic_category", "name": "Ethnic category",
         "type": "category",
         "permitted_values": {"A": "British", "B": "Irish"}},
        {"id": "patient-details/sex", "name": "Sex", "type": "category"},
        {"id": "delivery/mode_of_delivery", "name": "Mode of delivery",
         "type": "category"},
    ]}


class LookupFieldIdsTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        (self.worktree / "audit").mkdir()
        (self.worktree / "audit" / "spec.json").write_text(
            json.dumps(_audit()), encoding="utf-8")

    def tearDown(self):
        self._dir.cleanup()

    def _tool(self, request: dict) -> dict:
        proc = subprocess.run(
            [sys.executable, str(TOOLS / "lookup.py"), json.dumps(request)],
            capture_output=True, text=True, cwd=self.worktree,
        )
        return json.loads(proc.stdout.strip() or proc.stderr.strip())

    # --- a short-name miss suggests the canonical id -------------------------

    def test_short_name_miss_suggests_canonical_id(self):
        res = self._tool({"field": "ethnic_category"})
        self.assertFalse(res["ok"], res)
        # The hint must point at the full canonical slug, not the short tail.
        self.assertIn("patient-details/ethnic_category", res["error"])
        self.assertIn("Did you mean", res["error"])

    def test_substring_miss_suggests_canonical_id(self):
        # 'delivery' is not a tail (the tail is 'mode_of_delivery') but is a
        # substring of the group — still suggested.
        res = self._tool({"field": "delivery"})
        self.assertFalse(res["ok"], res)
        self.assertIn("delivery/mode_of_delivery", res["error"])

    def test_miss_is_strict_not_resolved_to_a_value(self):
        # A miss is an error (exit 2 / ok False) — the suggestion never becomes
        # a resolved field; the agent must re-issue with the canonical id.
        res = self._tool({"field": "ethnic_category"})
        self.assertFalse(res["ok"], res)
        self.assertNotIn("field", res)

    def test_unrelated_miss_still_lists_available_ids(self):
        res = self._tool({"field": "totally_unknown_xyz"})
        self.assertFalse(res["ok"], res)
        # No close match, but the full id list is still offered.
        self.assertIn("patient-details/ethnic_category", res["error"])

    # --- the exact canonical id still works ----------------------------------

    def test_exact_canonical_id_returns_field(self):
        res = self._tool({"field": "patient-details/ethnic_category"})
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["field"]["id"], "patient-details/ethnic_category")
        self.assertEqual(res["field"]["permitted_values"]["A"], "British")

    # --- {audit: true} still lists fields ------------------------------------

    def test_audit_true_lists_fields(self):
        res = self._tool({"audit": True})
        self.assertTrue(res["ok"], res)
        ids = {f["id"] for f in res["fields"]}
        self.assertIn("patient-details/ethnic_category", ids)
        self.assertIn("delivery/mode_of_delivery", ids)


if __name__ == "__main__":
    unittest.main(verbosity=2)
