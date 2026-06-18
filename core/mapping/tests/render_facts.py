"""Phase B: `_render_database_model` surfaces the within-database foreign-key
graph as FACTS and the database-wide conventions as orientation, so the mapping
LLM authors `join_path` from measured joins instead of guessing.

Run: ``python3 -m core.mapping.tests.render_facts``
"""

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from core.mapping.build_audit_database_map import _render_database_model  # noqa: E402

_MODEL = {
    "database": "npda-demographics",
    "title": "Demographics",
    "description": "Patient registry.",
    "foreign_keys": [
        {"column": "registrations.patient_id", "target": "patients.patient_id",
         "cardinality": "to-one", "declared": False,
         "evidence": "10/10 sampled values found in target"},
    ],
    "conventions": {"notes": ["All timestamps are UTC"]},
    "tables": [{"name": "patients", "description": "Registry.",
                "grain": "one row per patient", "columns": []}],
}


class RenderFactsTest(unittest.TestCase):
    def test_foreign_keys_rendered_as_facts(self):
        out = _render_database_model(_MODEL)
        self.assertIn("Within-database foreign keys (FACTS", out)
        self.assertIn(
            "registrations.patient_id -> patients.patient_id  [to-one]", out
        )

    def test_conventions_notes_rendered(self):
        out = _render_database_model(_MODEL)
        self.assertIn("Database-wide conventions", out)
        self.assertIn("All timestamps are UTC", out)

    def test_grain_rendered_per_table(self):
        out = _render_database_model(_MODEL)
        self.assertIn("[grain: one row per patient]", out)

    def test_absent_blocks_omitted(self):
        out = _render_database_model({"database": "d", "description": "x", "tables": []})
        self.assertNotIn("Within-database foreign keys", out)
        self.assertNotIn("Database-wide conventions", out)


if __name__ == "__main__":
    unittest.main(verbosity=2)
