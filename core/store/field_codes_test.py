"""Verify the DB-level cell-validation layer (shared by all tiers).

The run store — not any tier — enforces the cell contract: an off-code value is
rejected at the DB by a trigger over the run-scoped ``field_codes`` table
(materialised from spec.json at run start); a blocked cell with no reason is
rejected by a CHECK constraint. This holds for ANY writer — Tier 1/2/3 and the
agent's raw SQL alike — because the guarantee lives in the schema.

Run: ``python3 -m core.store.field_codes_test``
"""

import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from core.store import Cell, Run, Store  # noqa: E402


def _audit() -> dict:
    return {
        "fields": [
            {"id": "delivery", "permitted_values": {
                "1": "Spontaneous vaginal", "2": "Emergency caesarean",
                "3": "Forceps", "4": "Vacuum"}},
            {"id": "gestation_weeks", "type": "number"},  # no codes
        ]
    }


class FieldCodesTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.store = Store(Path(self._dir.name) / "state.db")
        self.store.create_run(Run(id="r1", audit_id="test", status="in_progress"))
        n = self.store.materialize_field_codes("r1", _audit())
        self.assertEqual(n, 4)
        self.store.insert_pending_cells([
            Cell(run_id="r1", ref="ALL!T2", field="delivery",
                 member="P001", kind="direct", state="pending"),
            Cell(run_id="r1", ref="ALL!B2", field="gestation_weeks",
                 member="P001", kind="direct", state="pending"),
        ])

    def tearDown(self):
        self.store.close()
        self._dir.cleanup()

    def _src(self, member="P001", col="x.delivery"):
        """A minimal valid source — identity is the cell's member, not repeated here."""
        return [{"database": "h", "query": f"SELECT patient_code FROM x WHERE patient_code='{member}'",
                 "table_column": col}]

    def test_off_code_write_is_rejected_at_the_db(self):
        with self.assertRaises(sqlite3.Error) as ctx:
            self.store.update_cell("r1", "ALL!T2", value="Spontaneous vaginal",
                                   state="filled", sources=self._src())
        self.assertIn("off-code", str(ctx.exception))
        # The cell was NOT mutated — the abort rolled the write back.
        self.assertEqual(self.store.get_cell("r1", "ALL!T2").state, "pending")

    def test_in_code_write_passes(self):
        self.store.update_cell("r1", "ALL!T2", value="1", state="filled",
                               sources=self._src())
        self.assertEqual(self.store.get_cell("r1", "ALL!T2").value, "1")

    def test_uncoded_field_accepts_any_value(self):
        self.store.update_cell("r1", "ALL!B2", value="39", state="filled",
                               sources=self._src(col="x.gestation_weeks"))
        self.assertEqual(self.store.get_cell("r1", "ALL!B2").value, "39")

    def test_blocked_without_reason_is_rejected(self):
        with self.assertRaises(sqlite3.Error):
            self.store.update_cell("r1", "ALL!B2", state="blocked")

    def test_blocked_with_reason_passes(self):
        self.store.update_cell("r1", "ALL!B2", state="blocked",
                               reason_code="NOT_LOCATED",
                               reason_detail="searched; nothing found")
        self.assertEqual(self.store.get_cell("r1", "ALL!B2").state, "blocked")

    def test_filled_without_sources_is_rejected(self):
        with self.assertRaises(sqlite3.Error) as ctx:
            self.store.update_cell("r1", "ALL!T2", value="1", state="filled",
                                   confidence="high", resolved_by="agent")
        self.assertIn("sources required", str(ctx.exception))
        self.assertEqual(self.store.get_cell("r1", "ALL!T2").state, "pending")

    def test_source_needs_no_record_id_identity_is_the_member(self):
        # record_id was dropped: the cohort identity is the cell's `member`, so a
        # source carrying no identity field is accepted (no identity-match guard).
        good = [{"database": "h", "query": "SELECT patient_code, delivery FROM x",
                 "table_column": "x.delivery"}]
        self.store.update_cell("r1", "ALL!T2", value="1", state="filled",
                               confidence="high", resolved_by="agent", sources=good)
        self.assertEqual(self.store.get_cell("r1", "ALL!T2").state, "filled")

    def test_offcode_error_message_tells_agent_how_to_fix(self):
        with self.assertRaises(sqlite3.Error) as ctx:
            self.store.update_cell("r1", "ALL!T2", value="9", state="filled",
                                   confidence="high", resolved_by="agent",
                                   sources=[{"database": "h", "query": "Q",
                                             "table_column": "t.c"}])
        msg = str(ctx.exception)
        self.assertIn("off-code", msg)
        self.assertIn("lookup", msg)  # the message points at how to fix

    def test_codes_are_run_scoped(self):
        # A second run with no materialised codes is unconstrained on the same
        # field id — the guard is per (run_id, field), not global.
        self.store.create_run(Run(id="r2", audit_id="test", status="in_progress"))
        self.store.insert_pending_cells([
            Cell(run_id="r2", ref="ALL!T2", field="delivery",
                 member="Q1", kind="direct", state="pending"),
        ])
        self.store.update_cell("r2", "ALL!T2", value="anything", state="filled",
                               sources=self._src(member="Q1"))
        self.assertEqual(self.store.get_cell("r2", "ALL!T2").value, "anything")


if __name__ == "__main__":
    unittest.main(verbosity=2)
