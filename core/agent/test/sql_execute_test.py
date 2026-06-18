"""Verify the agent's two tools end to end (as opencode invokes them).

sql_execute is the agent's ENTIRE SQL surface — one tool, routed by `database`,
with the cohort/run scope INJECTED (the agent passes neither). lookup is the only
way it reads field specs / schemas, scoped to the two model files. Each tool is
run as a subprocess with its cwd set to a temp run worktree holding context.json
+ audit/ + database/ — exactly the shape the orchestrator will lay down.

Run: ``python3 -m agent.test.sql_execute_test`` (from repo root).
"""

import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from core.store import Cell, Run, Store  # noqa: E402

TOOLS = REPO_ROOT / "core" / "agent" / ".opencode" / "tools"
# Share the run-context schema with the agent tools so this test exercises the
# exact shape sql_execute reads — never a hand-authored copy that can drift.
sys.path.insert(0, str(TOOLS))
from _run_sql import build_context  # noqa: E402


def _hospital_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE cord_ph_birth_records (
            patient_code TEXT PRIMARY KEY, delivery TEXT, cord_arterial_ph REAL
        );
        INSERT INTO cord_ph_birth_records VALUES ('P001','1',7.21);
        INSERT INTO cord_ph_birth_records VALUES ('P002','3',7.05);
        INSERT INTO cord_ph_birth_records VALUES ('P_OUT','4',7.30);
        """
    )
    conn.commit()
    conn.close()


def _audit() -> dict:
    return {"audit": "cord-ph", "fields": [
        {"id": "delivery", "name": "Mode of delivery", "type": "category",
         "permitted_values": {"1": "SVD", "2": "EmCS", "3": "Forceps", "4": "Vacuum"}},
        {"id": "cord_arterial_ph", "name": "Cord arterial pH", "type": "number"},
    ]}


def _model() -> dict:
    return {
        "database": "cord-ph",
        "foreign_keys": [
            {"column": "observations.patient",
             "target": "cord_ph_birth_records.baby_patient",
             "cardinality": "to-many", "declared": False,
             "evidence": "40/40 sampled values found in target"},
        ],
        "conventions": {"notes": ["All timestamps are UTC"]},
        "tables": [
            {"name": "cord_ph_birth_records", "grain": "one row per baby", "row_count": 10,
             "columns": [{"name": "patient_code"}, {"name": "delivery"},
                         {"name": "cord_arterial_ph"}, {"name": "baby_patient"}]},
            {"name": "observations", "grain": "many rows per baby", "row_count": 40,
             "columns": [{"name": "patient"}, {"name": "value"}]},
        ],
    }


class AgentToolsTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        self.db_path = self.worktree / "hospital.sqlite"
        _hospital_db(self.db_path)
        self.state_db = self.worktree / "state.db"
        store = Store(self.state_db)
        store.create_run(Run(id="r1", audit_id="cord-ph", status="in_progress"))
        store.materialize_field_codes("r1", _audit())
        store.insert_pending_cells([
            Cell(run_id="r1", ref="ALL!T2", field="delivery", member="P001",
                 kind="direct", state="pending"),
            Cell(run_id="r1", ref="ALL!V2", field="cord_arterial_ph", member="P001",
                 kind="direct", state="pending"),
        ])
        store.close()
        # The run worktree the tools read from cwd. context.json via the shared
        # build_context() factory (no paths); databases resolved by SYMLINK name.
        (self.worktree / "context.json").write_text(
            json.dumps(build_context(
                run_id="r1", anchor="patient_code",
                cohort=["P001", "P002"],
                databases={"cord-ph": {"cohort_tables": ["cord_ph_birth_records"]}},
            )),
            encoding="utf-8",
        )
        (self.worktree / "audit").mkdir()
        (self.worktree / "audit" / "spec.json").write_text(json.dumps(_audit()), "utf-8")
        (self.worktree / "audit" / "cells.sqlite").symlink_to(self.state_db.resolve())
        (self.worktree / "database").mkdir()
        (self.worktree / "database" / "cord-ph.sqlite").symlink_to(self.db_path.resolve())
        (self.worktree / "database" / "cord-ph.model.json").write_text(
            json.dumps(_model()), "utf-8")

    def tearDown(self):
        self._dir.cleanup()

    def _tool(self, script: str, request: dict) -> dict:
        proc = subprocess.run(
            [sys.executable, str(TOOLS / script), json.dumps(request)],
            capture_output=True, text=True, cwd=self.worktree,
        )
        return json.loads(proc.stdout.strip() or proc.stderr.strip())

    def _cells(self):
        s = Store(self.state_db)
        try:
            return {(c.field, c.member): c for c in s.get_cells("r1")}
        finally:
            s.close()

    # --- sql_execute: hospital (cohort injected) -----------------------------

    def test_hospital_query_is_cohort_scoped_without_agent_asking(self):
        res = self._tool("sql_execute.py", {
            "database": "cord-ph",
            "sql": "SELECT patient_code, delivery FROM cord_ph_birth_records "
                   "ORDER BY patient_code"})
        self.assertTrue(res["ok"], res)
        # P_OUT is in the table but not the cohort — injection kept it out, though
        # the agent wrote no cohort filter at all.
        self.assertEqual([r["patient_code"] for r in res["rows"]], ["P001", "P002"])

    def test_hospital_query_touching_no_cohort_table_is_rejected(self):
        res = self._tool("sql_execute.py", {
            "database": "cord-ph", "sql": "SELECT 1 AS x"})
        self.assertFalse(res["ok"])
        # The message must name the cohort-bearing tables the agent can use.
        self.assertIn("cord_ph_birth_records", res["error"])

    def test_hospital_is_read_only(self):
        res = self._tool("sql_execute.py", {
            "database": "cord-ph",
            "sql": "UPDATE cord_ph_birth_records SET delivery='9'"})
        self.assertFalse(res["ok"])

    def test_hospital_nested_subquery_is_rejected(self):
        # Scope injection is top-level only; a subquery could be unscoped, so the
        # tool refuses it rather than run a partially-scoped query.
        res = self._tool("sql_execute.py", {
            "database": "cord-ph",
            "sql": "SELECT patient_code FROM cord_ph_birth_records "
                   "WHERE delivery IN (SELECT delivery FROM cord_ph_birth_records)"})
        self.assertFalse(res["ok"])
        self.assertIn("nested", res["error"])

    def test_hospital_cte_is_rejected(self):
        res = self._tool("sql_execute.py", {
            "database": "cord-ph",
            "sql": "WITH x AS (SELECT * FROM cord_ph_birth_records) SELECT patient_code FROM x"})
        self.assertFalse(res["ok"])
        self.assertIn("nested", res["error"])

    # --- sql_execute: cells (run injected, DB-enforced) ----------------------

    def test_cells_nested_subquery_is_rejected(self):
        # Run scoping is top-level only — reject nested query blocks on the cells
        # path too, so a subquery can't dodge the run filter.
        res = self._tool("sql_execute.py", {
            "database": "cells",
            "sql": "SELECT ref FROM cells WHERE ref IN (SELECT ref FROM cells)"})
        self.assertFalse(res["ok"])
        self.assertIn("nested", res["error"])

    def test_cells_read_lists_pending(self):
        res = self._tool("sql_execute.py", {
            "database": "cells",
            "sql": "SELECT ref, field FROM cells WHERE state = 'pending'"})
        self.assertTrue(res["ok"], res)
        self.assertEqual({r["ref"] for r in res["rows"]}, {"ALL!T2", "ALL!V2"})

    def test_cells_read_non_cells_table_is_rejected(self):
        for table in ("runs", "events", "field_codes"):
            res = self._tool("sql_execute.py", {
                "database": "cells",
                "sql": f"SELECT * FROM {table}",
            })
            self.assertFalse(res["ok"])
            self.assertIn("only the `cells` table is allowed", res["error"])

    def test_cells_in_code_write_with_source_fills_and_stamps_attempt(self):
        res = self._tool("sql_execute.py", {
            "database": "cells",
            "sql": "UPDATE cells SET value='1', state='filled', confidence='high', "
                   f"resolved_by='agent', sources='{self._good_source()}' "
                   "WHERE ref='ALL!T2'"})
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["updated"], ["ALL!T2"])
        cell = self._cells()[("delivery", "P001")]
        self.assertEqual((cell.state, cell.value), ("filled", "1"))
        self.assertEqual(cell.attempts[-1]["tier"], "agent")
        # Identity is the cell's member; the source does not repeat it.
        self.assertEqual(cell.member, "P001")
        self.assertNotIn("record_id", cell.sources[0])
        self.assertEqual(cell.sources[0]["table_column"], "cord_ph_birth_records.delivery")

    def test_cells_write_accepts_backslash_escaped_quotes_in_sources_query(self):
        source = (
            '[{"database":"cord-ph","query":"SELECT patient_code, delivery '
            'FROM cord_ph_birth_records WHERE patient_code = \\\'P001\\\'",'
            '"table_column":"cord_ph_birth_records.delivery"}]'
        )
        res = self._tool("sql_execute.py", {
            "database": "cells",
            "sql": "UPDATE cells SET value='1', state='filled', confidence='high', "
                   f"resolved_by='agent', sources='{source}' "
                   "WHERE ref='ALL!T2'"})
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["updated"], ["ALL!T2"])

    def _good_source(self, member="P001", col="cord_ph_birth_records.delivery"):
        # Nested single quotes inside the SQL string are SQL-escaped as '' so the
        # outer UPDATE parses; this is the same escape the agent must do. The
        # patient identity is the cell's member — NOT repeated on the source.
        return ('[{"database":"cord-ph","query":"SELECT patient_code, delivery '
                f"FROM cord_ph_birth_records WHERE patient_code=''{member}''\","
                f'"table_column":"{col}"}}]')

    def test_cells_off_code_write_rejected_with_actionable_message(self):
        res = self._tool("sql_execute.py", {
            "database": "cells",
            "sql": "UPDATE cells SET value='Forceps', state='filled', "
                   f"resolved_by='agent', confidence='high', sources='{self._good_source()}' "
                   "WHERE ref='ALL!T2'"})
        self.assertFalse(res["ok"])
        # The agent must learn (a) what failed and (b) how to fix it.
        self.assertIn("off-code", res["error"])
        self.assertIn("lookup", res["error"])
        self.assertEqual(self._cells()[("delivery", "P001")].state, "pending")

    def test_cells_filled_without_sources_rejected_with_actionable_message(self):
        res = self._tool("sql_execute.py", {
            "database": "cells",
            "sql": "UPDATE cells SET value='1', state='filled', resolved_by='agent', "
                   "confidence='high' WHERE ref='ALL!T2'"})
        self.assertFalse(res["ok"])
        self.assertIn("sources required", res["error"])
        self.assertIn("table_column", res["error"])
        self.assertEqual(self._cells()[("delivery", "P001")].state, "pending")

    def test_cells_source_needs_no_record_id(self):
        # record_id was dropped: identity is the cell's member, so a source with
        # no identity field is accepted (there is no identity-match guard).
        res = self._tool("sql_execute.py", {
            "database": "cells",
            "sql": f"UPDATE cells SET value='1', state='filled', resolved_by='agent', "
                   f"confidence='high', sources='{self._good_source()}' WHERE ref='ALL!T2'"})
        self.assertTrue(res["ok"], res)
        self.assertEqual(self._cells()[("delivery", "P001")].state, "filled")

    def test_cells_blocked_without_reason_rejected(self):
        res = self._tool("sql_execute.py", {
            "database": "cells",
            "sql": "UPDATE cells SET state='blocked', resolved_by='agent', "
                   "confidence='low' WHERE ref='ALL!V2'"})
        self.assertFalse(res["ok"])

    def test_cells_only_select_or_update(self):
        res = self._tool("sql_execute.py", {
            "database": "cells", "sql": "DELETE FROM cells WHERE ref='ALL!T2'"})
        self.assertFalse(res["ok"])

    def test_cells_update_non_cells_table_is_rejected(self):
        res = self._tool("sql_execute.py", {
            "database": "cells",
            "sql": "UPDATE runs SET status='complete' WHERE id='r1'",
        })
        self.assertFalse(res["ok"])
        self.assertIn("only the `cells` table is allowed", res["error"])

    def test_cells_cross_run_write_denial_is_sanitized(self):
        res = self._tool("sql_execute.py", {
            "database": "cells",
            "sql": "UPDATE cells SET run_id='r2' WHERE ref='ALL!T2'",
        })
        self.assertFalse(res["ok"])
        self.assertEqual(res["error"], "Permission denied for requested database operation.")

    # --- lookup --------------------------------------------------------------

    def test_lookup_field_returns_codes(self):
        res = self._tool("lookup.py", {"field": "delivery"})
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["field"]["permitted_values"]["3"], "Forceps")

    def test_lookup_database_returns_digest(self):
        # The {database} selector returns the digest the agent needs to write a
        # join: per-table grain + the foreign-key graph + conventions.
        res = self._tool("lookup.py", {"database": "cord-ph"})
        self.assertTrue(res["ok"], res)
        by_name = {t["name"]: t for t in res["tables"]}
        self.assertEqual(by_name["cord_ph_birth_records"]["grain"], "one row per baby")
        self.assertEqual(
            res["foreign_keys"][0]["target"], "cord_ph_birth_records.baby_patient"
        )
        self.assertIn("All timestamps are UTC", res["conventions"]["notes"])

    def test_lookup_table_lists_columns(self):
        res = self._tool("lookup.py", {"database": "cord-ph", "table": "cord_ph_birth_records"})
        self.assertTrue(res["ok"], res)
        names = [c["name"] for c in res["table"]["columns"]]
        self.assertIn("delivery", names)

    def test_lookup_requires_a_selector(self):
        res = self._tool("lookup.py", {})
        self.assertFalse(res["ok"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
