"""T7: the mapping builder's envelope carries the LLM's `database_summaries` —
template-specific per-database one-liners for the library chips (doc 9).

Only entries for databases actually bound survive (the LLM cannot summarise a
database it was not given); empty/missing entries are dropped so the UI falls
back to the model.json summary; no summaries at all omits the key (schema:
optional).

Run: ``python3 -m core.mapping.tests.database_summaries``
"""

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from core.mapping.build_audit_database_map import _assemble  # noqa: E402

DBS = ["npda-clinical", "npda-demographics"]


class DatabaseSummariesTest(unittest.TestCase):
    def test_bound_summaries_survive_verbatim(self):
        model = _assemble("npda", DBS, {
            "database_summaries": {
                "npda-clinical": "Visit-level clinical record and care processes.",
                "npda-demographics": "  Patient demographics joined per visit.  ",
            },
        })
        self.assertEqual(model["database_summaries"], {
            "npda-clinical": "Visit-level clinical record and care processes.",
            "npda-demographics": "Patient demographics joined per visit.",
        })

    def test_unbound_and_empty_entries_are_dropped(self):
        model = _assemble("npda", DBS, {
            "database_summaries": {
                "npda-clinical": "Visit-level clinical record.",
                "npda-demographics": "   ",
                "some-other-db": "The LLM cannot summarise a database it was not given.",
            },
        })
        self.assertEqual(
            model["database_summaries"],
            {"npda-clinical": "Visit-level clinical record."},
        )

    def test_no_summaries_omits_the_key(self):
        for prose in ({}, {"database_summaries": None}, {"database_summaries": "prose"}):
            self.assertNotIn("database_summaries", _assemble("npda", DBS, prose), prose)


if __name__ == "__main__":
    unittest.main(verbosity=2)
