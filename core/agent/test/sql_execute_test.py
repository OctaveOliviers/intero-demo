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
from _run_sql import build_context, scope_source_to_cell  # noqa: E402


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

    def test_hospital_accepts_backslash_escaped_quote(self):
        # REGRESSION: the multi-statement guard now normalizes \' -> '' before
        # parsing (as the main path does), so a SELECT carrying backslash-escaped
        # quotes in a string literal is no longer rejected at the guard.
        res = self._tool("sql_execute.py", {
            "database": "cord-ph",
            "sql": "SELECT patient_code FROM cord_ph_birth_records "
                   "WHERE delivery = '[{\\'k\\': 1}]'"})
        self.assertTrue(res["ok"], res)

    def test_hospital_backslash_quote_returns_clean_error_not_crash(self):
        # REGRESSION: a \' input that trips sqlglot's tokenizer must surface as a
        # JSON error, not an uncaught TokenError traceback. _tool parses stdout as
        # JSON — a crash (traceback on stderr) would fail this before the asserts.
        res = self._tool("sql_execute.py", {
            "database": "cord-ph",
            "sql": "SELECT patient_code FROM cord_ph_birth_records WHERE notes = 'a\\'b'"})
        self.assertIsInstance(res, dict)
        self.assertFalse(res.get("ok"))
        self.assertIn("error", res)

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

    # --- per-cell source scoping + interpret-batch guard ---------------------

    def _insert_cells(self, cells):
        s = Store(self.state_db)
        try:
            s.insert_pending_cells(cells)
        finally:
            s.close()

    def test_column_wide_source_is_scoped_per_cell(self):
        # The agent fills a whole column in ONE UPDATE with a single shared
        # column-wide source. Each cell's STORED source must be narrowed to its
        # own member, so clicking a cell shows only that patient's row.
        self._insert_cells([
            Cell(run_id="r1", ref="ALL!T3", field="delivery", member="P002",
                 kind="direct", state="pending"),
        ])
        shared = ('[{"database":"cord-ph","query":"SELECT patient_code, delivery '
                  'FROM cord_ph_birth_records","table_column":"cord_ph_birth_records.delivery"}]')
        res = self._tool("sql_execute.py", {
            "database": "cells",
            "sql": "UPDATE cells SET value = CASE member WHEN 'P001' THEN '1' "
                   "WHEN 'P002' THEN '3' END, state='filled', confidence='high', "
                   f"resolved_by='agent', sources='{shared}' "
                   "WHERE field='delivery' AND state='pending' AND member IN ('P001','P002')"})
        self.assertTrue(res["ok"], res)
        cells = self._cells()
        q1 = cells[("delivery", "P001")].sources[0]["query"]
        q2 = cells[("delivery", "P002")].sources[0]["query"]
        self.assertIn("patient_code = 'P001'", q1)
        self.assertNotIn("P002", q1)
        self.assertIn("patient_code = 'P002'", q2)
        self.assertNotIn("P001", q2)

    def test_batched_interpret_fill_is_rejected_and_rolls_back(self):
        # Interpret cells must be filled one at a time (each needs its own
        # explanation/source) — a multi-cell interpret fill is refused, nothing
        # persisted.
        self._insert_cells([
            Cell(run_id="r1", ref="ALL!G3", field="delivery", member="P003",
                 kind="interpret", state="pending"),
            Cell(run_id="r1", ref="ALL!G4", field="delivery", member="P004",
                 kind="interpret", state="pending"),
        ])
        res = self._tool("sql_execute.py", {
            "database": "cells",
            "sql": "UPDATE cells SET value='1', state='filled', confidence='medium', "
                   f"resolved_by='agent', sources='{self._good_source()}' "
                   "WHERE ref IN ('ALL!G3','ALL!G4')"})
        self.assertFalse(res["ok"])
        self.assertIn("one at a time", res["error"])
        cells = self._cells()
        self.assertEqual(cells[("delivery", "P003")].state, "pending")
        self.assertEqual(cells[("delivery", "P004")].state, "pending")

    def test_single_interpret_fill_allowed_and_note_scoped_to_row(self):
        # One interpret cell at a time is allowed, and its note source is narrowed
        # to the single cited row so clicking shows only that one note.
        self._insert_cells([
            Cell(run_id="r1", ref="ALL!G5", field="delivery", member="P003",
                 kind="interpret", state="pending"),
        ])
        note = ('[{"database":"cord-ph","query":"SELECT patient_code, note_id, note_text '
                "FROM clinician_notes WHERE patient_code=''P003''\","
                '"table_column":"clinician_notes.note_text","row_id":"note-2291",'
                '"row_key":"note_id","citations":["declined"]}]')
        res = self._tool("sql_execute.py", {
            "database": "cells",
            "sql": "UPDATE cells SET value='1', state='filled', confidence='medium', "
                   f"resolved_by='agent', sources='{note}' WHERE ref='ALL!G5'"})
        self.assertTrue(res["ok"], res)
        q = self._cells()[("delivery", "P003")].sources[0]["query"]
        self.assertIn("note_id = 'note-2291'", q)
        self.assertEqual(q.count("patient_code = 'P003'"), 1)  # member not doubled

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


# --- cross-database access (NPDA-shaped: anchor + foreign demographics) -------


def _npda_clinical_db(path: Path) -> None:
    """Anchor DB: one row per visit, keyed by ``visit_id``; ``patient_ref`` is the
    bridge to demographics (== ``nhs_number``). Two patients, several visits each;
    one out-of-cohort patient/visit plus one out-of-cohort VISIT for an in-cohort
    patient to prove anchor scoping stays row-level."""
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE clinic_visits (
            visit_id TEXT PRIMARY KEY, patient_ref TEXT, patient_ref_alt TEXT,
            patient_id_ref TEXT, visit_date TEXT
        );
        INSERT INTO clinic_visits VALUES ('V1','NHS1','NHS1','PID1','2024-01-01');
        INSERT INTO clinic_visits VALUES ('V2','NHS1','NHS1','PID1','2024-02-01');
        INSERT INTO clinic_visits VALUES ('V3','NHS2','NHS2','PID2','2024-01-15');
        INSERT INTO clinic_visits VALUES ('V4','NHS1','NHS1','PID1','2024-02-15');
        INSERT INTO clinic_visits VALUES ('V_OUT','NHS_OUT','NHS_OUT','PID_OUT','2024-03-01');

        -- A to-MANY child of clinic_visits (many measurements per visit). Holds
        -- the bulk of the audit (HbA1c, weight, …). visit_ref -> visit_id is a
        -- many-to-one FK, labelled `to-many`; Tier 1 cannot copy through it, but
        -- the agent must be able to read it bounded to the cohort via EXISTS.
        CREATE TABLE measurements (
            measurement_id TEXT PRIMARY KEY, visit_ref TEXT,
            measurement_type TEXT, value TEXT, patient_ref TEXT
        );
        INSERT INTO measurements VALUES ('M1','V1','hba1c','58','NHS1');
        INSERT INTO measurements VALUES ('M2','V1','weight','42.0','NHS1');
        INSERT INTO measurements VALUES ('M3','V2','hba1c','61','NHS1');
        INSERT INTO measurements VALUES ('M4','V3','hba1c','49','NHS2');
        INSERT INTO measurements VALUES ('M_OUT','V_OUT','hba1c','999','NHS_OUT');
        -- Inconsistent identity: visit is in cohort but patient_ref is not.
        -- Multi-strategy scoping must keep this row out by intersecting roots.
        INSERT INTO measurements VALUES ('M_BAD','V1','hba1c','777','NHS_OUT');

        -- Identity-linked peer table in the anchor DB: keyed by patient_ref
        -- (== demographics.patients.nhs_number), but with NO FK path from
        -- clinic_visits.visit_id. This is the screening_results reachability gap.
        CREATE TABLE screening_results (
            screening_id TEXT PRIMARY KEY, patient_ref TEXT, programme TEXT, outcome TEXT
        );
        INSERT INTO screening_results VALUES ('S1','NHS1','retinopathy','clear');
        INSERT INTO screening_results VALUES ('S2','NHS2','retinopathy','background');
        INSERT INTO screening_results VALUES ('S_OUT','NHS_OUT','retinopathy','proliferative');
        """
    )
    conn.commit()
    conn.close()


def _npda_demographics_db(path: Path) -> None:
    """Foreign DB: ``patients`` keyed by ``nhs_number`` (the bridge key), with a
    to-one ``registrations`` (patient_id) and a to-one ``registration_notes``
    (patient_id) carrying the ADHD/learning-disability-style narrative that lives
    ONLY here."""
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE patients (
            patient_id TEXT PRIMARY KEY, nhs_number TEXT, family_name TEXT
        );
        INSERT INTO patients VALUES ('PID1','NHS1','Patel');
        INSERT INTO patients VALUES ('PID2','NHS2','Whitfield');
        INSERT INTO patients VALUES ('PID_OUT','NHS_OUT','Stranger');

        CREATE TABLE registrations (
            registration_id TEXT PRIMARY KEY, patient_id TEXT, diabetes_type TEXT
        );
        INSERT INTO registrations VALUES ('R1','PID1','Type 1');
        INSERT INTO registrations VALUES ('R2','PID2','Type 2');
        INSERT INTO registrations VALUES ('R_OUT','PID_OUT','Type 1');

        CREATE TABLE registration_notes (
            note_id TEXT PRIMARY KEY, patient_id TEXT, body TEXT
        );
        INSERT INTO registration_notes VALUES ('N1','PID1','ADHD diagnosis noted');
        INSERT INTO registration_notes VALUES ('N_OUT','PID_OUT','learning disability');
        """
    )
    conn.commit()
    conn.close()


def _npda_clinical_model() -> dict:
    return {
        "database": "npda-clinical",
        # The anchor DB's bridge OUT to demographics — the cohort's visit_ids
        # translate to nhs_numbers through clinic_visits.patient_ref.
        "identity_links": [
            {"column": "clinic_visits.patient_ref",
             "target": "npda-demographics -> patients.nhs_number",
             "evidence": "all sampled values found in target"},
            {"column": "measurements.patient_ref",
             "target": "npda-demographics -> patients.nhs_number",
             "evidence": "all sampled values found in target"},
            {"column": "screening_results.patient_ref",
             "target": "npda-demographics -> patients.nhs_number",
             "evidence": "all sampled values found in target"},
        ],
        "foreign_keys": [
            {"column": "measurements.visit_ref", "target": "clinic_visits.visit_id",
             "cardinality": "to-many", "declared": False, "evidence": "5/5"},
        ],
        "tables": [
            {"name": "clinic_visits", "grain": "one row per visit",
             "columns": [{"name": "visit_id"}, {"name": "patient_ref"},
                         {"name": "patient_ref_alt"}, {"name": "patient_id_ref"},
                         {"name": "visit_date"}]},
            {"name": "measurements", "grain": "one row per measurement",
             "columns": [{"name": "measurement_id"}, {"name": "visit_ref"},
                         {"name": "measurement_type"}, {"name": "value"},
                         {"name": "patient_ref"}]},
            {"name": "screening_results", "grain": "one row per patient screening result",
             "columns": [{"name": "screening_id"}, {"name": "patient_ref"},
                         {"name": "programme"}, {"name": "outcome"}]},
        ],
    }


def _npda_demographics_model() -> dict:
    return {
        "database": "npda-demographics",
        "identity_links": [
            {"column": "patients.nhs_number",
             "target": "npda-clinical -> clinic_visits.patient_ref",
             "evidence": "all sampled values found in target"},
        ],
        "foreign_keys": [
            {"column": "patients.patient_id", "target": "registrations.patient_id",
             "cardinality": "to-one", "declared": False, "evidence": "10/10"},
            {"column": "registration_notes.patient_id", "target": "patients.patient_id",
             "cardinality": "to-one", "declared": False, "evidence": "6/6"},
        ],
        "tables": [
            {"name": "patients", "grain": "one row per patient",
             "columns": [{"name": "patient_id"}, {"name": "nhs_number"},
                         {"name": "family_name"}]},
            {"name": "registrations", "grain": "one row per patient",
             "columns": [{"name": "registration_id"}, {"name": "patient_id"},
                         {"name": "diabetes_type"}]},
            {"name": "registration_notes", "grain": "one row per note",
             "columns": [{"name": "note_id"}, {"name": "patient_id"},
                         {"name": "body"}]},
        ],
    }


class CrossDatabaseTest(unittest.TestCase):
    """The agent can READ a foreign (non-anchor) database — and any table the
    precomputed map reaches — bounded to the cohort, without writing any scope.

    Cohort = the visits of two patients (NHS1, NHS2); NHS_OUT is out of cohort.
    The anchor column ``visit_id`` exists ONLY in npda-clinical, so under the old
    rule every npda-demographics query was rejected; here they succeed, scoped via
    ``identity_links`` (the bridge) + to-one ``foreign_keys`` (the hops)."""

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        self.clin = self.worktree / "clinical.sqlite"
        self.demo = self.worktree / "demographics.sqlite"
        _npda_clinical_db(self.clin)
        _npda_demographics_db(self.demo)

        # Cohort: every visit of NHS1 + NHS2 (the anchor is visit_id).
        cohort = ["V1", "V2", "V3"]
        (self.worktree / "context.json").write_text(
            json.dumps(build_context(
                run_id="r1", anchor="visit_id", cohort=cohort,
                databases={
                    "npda-clinical": {
                        "cohort_tables": ["clinic_visits"],
                        "identity_links": _npda_clinical_model()["identity_links"],
                        "foreign_keys": _npda_clinical_model()["foreign_keys"]},
                    "npda-demographics": {
                        "cohort_tables": [],
                        "identity_links": _npda_demographics_model()["identity_links"],
                        "foreign_keys": _npda_demographics_model()["foreign_keys"]},
                })),
            encoding="utf-8",
        )
        db_dir = self.worktree / "database"
        db_dir.mkdir()
        (db_dir / "npda-clinical.sqlite").symlink_to(self.clin.resolve())
        (db_dir / "npda-demographics.sqlite").symlink_to(self.demo.resolve())
        (db_dir / "npda-clinical.model.json").write_text(
            json.dumps(_npda_clinical_model()), "utf-8")
        (db_dir / "npda-demographics.model.json").write_text(
            json.dumps(_npda_demographics_model()), "utf-8")

    def tearDown(self):
        self._dir.cleanup()

    def _tool(self, request: dict) -> dict:
        proc = subprocess.run(
            [sys.executable, str(TOOLS / "sql_execute.py"), json.dumps(request)],
            capture_output=True, text=True, cwd=self.worktree,
        )
        return json.loads(proc.stdout.strip() or proc.stderr.strip())

    def _set_clinical_identity_links(self, links: list[dict]) -> None:
        ctx_path = self.worktree / "context.json"
        ctx = json.loads(ctx_path.read_text(encoding="utf-8"))
        ctx["databases"]["npda-clinical"]["identity_links"] = links
        ctx_path.write_text(json.dumps(ctx), encoding="utf-8")

    # foreign DB: bridge-key-bearing table (patients) ------------------------

    def test_foreign_db_bridge_table_succeeds_and_is_cohort_scoped(self):
        # patients carries the bridge key nhs_number; the tool translates the
        # cohort's visit_ids -> nhs_numbers and bounds the read. NHS_OUT is in the
        # table but not the cohort — it must be filtered out, agent wrote no scope.
        res = self._tool({"database": "npda-demographics",
                          "sql": "SELECT nhs_number, family_name FROM patients"})
        self.assertTrue(res["ok"], res)
        self.assertEqual(sorted(r["nhs_number"] for r in res["rows"]),
                         ["NHS1", "NHS2"])

    def test_foreign_db_to_one_hop_from_bridge_table_succeeds(self):
        # registrations does NOT carry nhs_number, but reaches patients over a
        # to-one FK — the tool bounds it via an EXISTS over that hop.
        res = self._tool({"database": "npda-demographics",
                          "sql": "SELECT registration_id, diabetes_type FROM registrations"})
        self.assertTrue(res["ok"], res)
        self.assertEqual(sorted(r["registration_id"] for r in res["rows"]),
                         ["R1", "R2"])  # R_OUT excluded

    def test_foreign_db_narrative_only_here_is_reachable(self):
        # The ADHD / learning-disability narrative lives ONLY in demographics'
        # registration_notes (reached via a to-one hop) — the field the old rule
        # blocked forever. It now returns exactly the cohort's notes.
        res = self._tool({"database": "npda-demographics",
                          "sql": "SELECT note_id, body FROM registration_notes"})
        self.assertTrue(res["ok"], res)
        self.assertEqual([r["note_id"] for r in res["rows"]], ["N1"])
        self.assertIn("ADHD", res["rows"][0]["body"])

    # cross-database JOIN -----------------------------------------------------

    def test_cross_db_join_anchor_to_foreign(self):
        # A single statement joins the anchor DB (main) to the attached foreign DB.
        # Both sides are bounded: cv by visit_id IN cohort, p by the translated key.
        res = self._tool({"database": "npda-clinical", "sql": (
            "SELECT cv.visit_id, p.family_name FROM clinic_visits cv "
            'JOIN "npda-demographics".patients p ON cv.patient_ref = p.nhs_number')})
        self.assertTrue(res["ok"], res)
        self.assertEqual({r["visit_id"] for r in res["rows"]}, {"V1", "V2", "V3"})
        self.assertEqual({r["family_name"] for r in res["rows"]}, {"Patel", "Whitfield"})

    def test_cross_db_join_foreign_target_to_anchor(self):
        # The mirror: query demographics as the target, join the attached clinical.
        res = self._tool({"database": "npda-demographics", "sql": (
            "SELECT p.nhs_number, cv.visit_date FROM patients p "
            'JOIN "npda-clinical".clinic_visits cv ON p.nhs_number = cv.patient_ref')})
        self.assertTrue(res["ok"], res)
        self.assertEqual({r["nhs_number"] for r in res["rows"]}, {"NHS1", "NHS2"})

    # fail-safe ---------------------------------------------------------------

    def test_anchor_db_query_still_cohort_scoped(self):
        # The unchanged anchor-DB behavior: only cohort visits come back.
        res = self._tool({"database": "npda-clinical",
                          "sql": "SELECT visit_id FROM clinic_visits"})
        self.assertTrue(res["ok"], res)
        self.assertEqual(sorted(r["visit_id"] for r in res["rows"]),
                         ["V1", "V2", "V3"])  # V_OUT excluded

    def test_anchor_identity_peer_table_is_reachable_and_scoped(self):
        # screening_results has no FK path from clinic_visits.visit_id, but it is
        # identity-linked on patient_ref to a cohort-translatable domain.
        res = self._tool({"database": "npda-clinical",
                          "sql": "SELECT screening_id, patient_ref FROM screening_results"})
        self.assertTrue(res["ok"], res)
        self.assertEqual(sorted(r["screening_id"] for r in res["rows"]), ["S1", "S2"])
        self.assertEqual({r["patient_ref"] for r in res["rows"]}, {"NHS1", "NHS2"})

    def test_anchor_identity_peer_with_ambiguous_bridge_fails_closed(self):
        # Two cohort-translatable bridge sources to the same target domain are
        # ambiguous; fail closed instead of guessing one.
        self._set_clinical_identity_links([
            {"column": "clinic_visits.patient_ref",
             "target": "npda-demographics -> patients.nhs_number",
             "evidence": "all sampled values found in target"},
            {"column": "clinic_visits.patient_ref_alt",
             "target": "npda-demographics -> patients.nhs_number",
             "evidence": "all sampled values found in target"},
            {"column": "screening_results.patient_ref",
             "target": "npda-demographics -> patients.nhs_number",
             "evidence": "all sampled values found in target"},
        ])
        res = self._tool({"database": "npda-clinical",
                          "sql": "SELECT screening_id FROM screening_results"})
        self.assertFalse(res["ok"])
        self.assertIn("cohort scoping cannot be applied", res["error"].lower())

    def test_foreign_table_with_multiple_root_domains_uses_intersection(self):
        # Cross-domain multi-root scoping is resolved by intersecting strategies
        # (nhs_number and patient_id), so duplicates leaking through one domain
        # are excluded by the other.
        conn = sqlite3.connect(self.demo)
        try:
            conn.execute("INSERT INTO patients VALUES ('PID_LEAK','NHS1','Leak')")
            conn.commit()
        finally:
            conn.close()
        self._set_clinical_identity_links([
            {"column": "clinic_visits.patient_ref",
             "target": "npda-demographics -> patients.nhs_number",
             "evidence": "all sampled values found in target"},
            {"column": "clinic_visits.patient_id_ref",
             "target": "npda-demographics -> patients.patient_id",
             "evidence": "all sampled values found in target"},
        ])
        res = self._tool({"database": "npda-demographics",
                          "sql": "SELECT patient_id, nhs_number FROM patients"})
        self.assertTrue(res["ok"], res)
        self.assertEqual(sorted(r["patient_id"] for r in res["rows"]), ["PID1", "PID2"])
        self.assertNotIn("PID_LEAK", {r["patient_id"] for r in res["rows"]})

    # to-many child tables of the anchor (the Tier-1/Tier-3 divergence) ---------

    def test_to_many_child_of_anchor_is_reachable_via_exists(self):
        # measurements is a to-MANY child of clinic_visits (the FK measurements.
        # visit_ref -> clinic_visits.visit_id is many-to-one). Tier 1 can't copy
        # through it, but the agent reaches it via an EXISTS that descends the FK
        # and bounds each measurement to whether its one visit is in the cohort.
        # M_OUT (visit V_OUT) must be filtered out, with no scope written.
        res = self._tool({"database": "npda-clinical",
                          "sql": "SELECT measurement_id, value FROM measurements"})
        self.assertTrue(res["ok"], res)
        self.assertEqual(sorted(r["measurement_id"] for r in res["rows"]),
                         ["M1", "M2", "M3", "M4"])  # M_OUT excluded

    def test_multi_strategy_table_is_scoped_by_intersection(self):
        # measurements has two safe strategies in this fixture:
        # - FK-path from clinic_visits.visit_id (via visit_ref)
        # - direct identity-key root on measurements.patient_ref
        # They are intersected, so inconsistent M_BAD is excluded.
        res = self._tool({"database": "npda-clinical",
                          "sql": "SELECT measurement_id FROM measurements"})
        self.assertTrue(res["ok"], res)
        self.assertEqual(sorted(r["measurement_id"] for r in res["rows"]),
                         ["M1", "M2", "M3", "M4"])

    def test_parenthesized_table_group_is_rejected_not_leaked(self):
        # A clinical table wrapped in parens (`FROM (t)` / `JOIN (t)`) parses to an
        # exp.Subquery wrapping a bare Table — top_level_tables does not descend
        # into it, so without an explicit guard the table escapes cohort scoping
        # and the whole clinical table (M_OUT/M_BAD/S_OUT) leaks. Must fail closed.
        for sql in (
            "SELECT m.measurement_id FROM clinic_visits cv, (measurements) m",
            "SELECT m.measurement_id FROM clinic_visits cv CROSS JOIN (measurements) m",
            "SELECT m.measurement_id FROM clinic_visits cv "
            "JOIN (measurements) m ON cv.visit_id = m.visit_ref",
            "SELECT s.screening_id FROM clinic_visits cv, (screening_results) s",
            "SELECT measurement_id FROM "
            "(clinic_visits JOIN measurements ON clinic_visits.visit_id = measurements.visit_ref)",
        ):
            res = self._tool({"database": "npda-clinical", "sql": sql})
            self.assertFalse(res["ok"], f"expected rejection, got rows for: {sql}\n{res}")

    def test_to_many_child_joined_to_anchor_is_cohort_scoped(self):
        # The natural shape: join the child up to its anchor parent. Both tables
        # are bounded (clinic_visits by visit_id IN cohort, measurements by the
        # descending EXISTS), so only cohort visits' measurements come back.
        res = self._tool({"database": "npda-clinical", "sql": (
            "SELECT cv.visit_id, m.value FROM clinic_visits cv "
            "JOIN measurements m ON cv.visit_id = m.visit_ref")})
        self.assertTrue(res["ok"], res)
        self.assertEqual({r["visit_id"] for r in res["rows"]}, {"V1", "V2", "V3"})
        self.assertNotIn("999", {r["value"] for r in res["rows"]})  # M_OUT's value

    def test_unreachable_table_fails_safe(self):
        # A foreign table with no bridge key and no to-one path to one cannot be
        # bounded — rejected rather than read unscoped. We synthesize one by asking
        # for an orphan table the map cannot reach.
        # (registration_notes -> patients is to-one, so it IS reachable; prove the
        #  reject path with a genuinely unmapped table reference.)
        res = self._tool({"database": "npda-demographics",
                          "sql": "SELECT * FROM sqlite_master"})
        self.assertFalse(res["ok"])
        self.assertIn("cohort", res["error"].lower())

    def test_no_table_query_is_rejected(self):
        res = self._tool({"database": "npda-demographics", "sql": "SELECT 1 AS x"})
        self.assertFalse(res["ok"])

    def test_agent_submitted_attach_is_rejected(self):
        # The tool ATTACHes the sibling DBs itself; an ATTACH in the agent's SQL
        # must never run. (A second statement is also rejected.)
        res = self._tool({"database": "npda-demographics", "sql": (
            "SELECT nhs_number FROM patients; "
            "ATTACH DATABASE 'x.sqlite' AS evil")})
        self.assertFalse(res["ok"])

    def test_multiple_statements_rejected(self):
        res = self._tool({"database": "npda-demographics",
                          "sql": "SELECT nhs_number FROM patients; SELECT 1"})
        self.assertFalse(res["ok"])
        self.assertIn("single", res["error"].lower())

    def test_foreign_db_is_read_only(self):
        res = self._tool({"database": "npda-demographics",
                          "sql": "UPDATE patients SET family_name='x'"})
        self.assertFalse(res["ok"])

    def test_exists_correlation_survives_outer_alias_collision(self):
        # REGRESSION: the EXISTS that scopes a hopped table correlates back to the
        # OUTER table by its agent-chosen alias. The injected hops now use a
        # reserved prefix, so an agent aliasing the outer table `h1`/`h0` (the old
        # hop names) can no longer shadow a hop and collapse the correlation to a
        # tautology. The out-of-cohort note N_OUT must stay filtered out.
        for alias in ("h0", "h1", "h2"):
            res = self._tool({"database": "npda-demographics",
                              "sql": f"SELECT note_id FROM registration_notes {alias}"})
            self.assertTrue(res["ok"], res)
            self.assertEqual([r["note_id"] for r in res["rows"]], ["N1"],
                             f"alias {alias!r} must not leak out-of-cohort rows")

    def test_reserved_scope_alias_is_rejected(self):
        # The agent may not alias/name a table into the tool's reserved hop-alias
        # space — that is what makes the collision above impossible.
        res = self._tool({"database": "npda-demographics",
                          "sql": "SELECT note_id FROM registration_notes __scope_h0"})
        self.assertFalse(res["ok"])
        self.assertIn("reserved", res["error"].lower())

    def test_single_statement_attach_is_rejected(self):
        # A lone ATTACH (not a multi-statement) must still be refused — by the
        # SELECT-only guard, since the tool performs every ATTACH itself.
        res = self._tool({"database": "npda-demographics",
                          "sql": "ATTACH DATABASE 'x.sqlite' AS evil"})
        self.assertFalse(res["ok"])
        self.assertIn("select", res["error"].lower())


def _directed_path_ambig_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE visits (
            visit_id TEXT PRIMARY KEY, left_id TEXT, right_id TEXT
        );
        INSERT INTO visits VALUES ('V1','L1','R1');
        INSERT INTO visits VALUES ('V_OUT','L_OUT','R_OUT');

        CREATE TABLE mirrored_obs (
            obs_id TEXT PRIMARY KEY, left_id TEXT, right_id TEXT
        );
        -- matches only path visits.right_id -> mirrored_obs.left_id
        INSERT INTO mirrored_obs VALUES ('O_PATH1','R1','X');
        -- matches only path visits.left_id -> mirrored_obs.right_id
        INSERT INTO mirrored_obs VALUES ('O_PATH2','X','L1');
        INSERT INTO mirrored_obs VALUES ('O_OUT','R_OUT','L_OUT');
        """
    )
    conn.commit()
    conn.close()


class DirectedPathAmbiguityTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        self.db_path = self.worktree / "ambig.sqlite"
        _directed_path_ambig_db(self.db_path)
        db_dir = self.worktree / "database"
        db_dir.mkdir()
        (db_dir / "ambig.sqlite").symlink_to(self.db_path.resolve())

    def tearDown(self):
        self._dir.cleanup()

    def _write_context(self, foreign_keys: list[dict]) -> None:
        (self.worktree / "context.json").write_text(
            json.dumps(build_context(
                run_id="r1",
                anchor="visit_id",
                cohort=["V1"],
                databases={
                    "ambig": {
                        "cohort_tables": ["visits"],
                        "identity_links": [],
                        "foreign_keys": foreign_keys,
                    }
                },
            )),
            encoding="utf-8",
        )

    def _tool(self, sql: str) -> dict:
        proc = subprocess.run(
            [sys.executable, str(TOOLS / "sql_execute.py"),
             json.dumps({"database": "ambig", "sql": sql})],
            capture_output=True, text=True, cwd=self.worktree,
        )
        return json.loads(proc.stdout.strip() or proc.stderr.strip())

    def test_ambiguous_directed_paths_fail_closed_and_order_invariant(self):
        # Mirrored directed pairs between the same table pair must stay distinct.
        # If multiple shortest directed paths exist, scoping must fail closed,
        # independent of foreign_keys order.
        fk1 = {"column": "mirrored_obs.left_id", "target": "visits.right_id",
               "cardinality": "to-one", "declared": False, "evidence": "n/a"}
        fk2 = {"column": "mirrored_obs.right_id", "target": "visits.left_id",
               "cardinality": "to-one", "declared": False, "evidence": "n/a"}
        for foreign_keys in ([fk1, fk2], [fk2, fk1]):
            self._write_context(foreign_keys)
            res = self._tool("SELECT obs_id FROM mirrored_obs")
            self.assertFalse(res["ok"])
            self.assertIn("cohort scoping cannot be applied", res["error"].lower())


# --- scope_source_to_cell: narrow a stored source to ONE cell ----------------


class ScopeSourceToCellTest(unittest.TestCase):
    """The synthesize-don't-override rewrite that makes a stored source show only
    the clicked cell's evidence: AND the member identity (and, for a note, the
    single row) onto the query, but only when the agent didn't already scope it."""

    CT = {"cord_ph_birth_records"}

    def test_column_wide_query_gains_member_predicate(self):
        out = scope_source_to_cell(
            "SELECT patient_code, delivery FROM cord_ph_birth_records",
            anchor="patient_code", member="P001", cohort_tables=self.CT)
        self.assertIn("patient_code = 'P001'", out)

    def test_already_scoped_query_is_untouched(self):
        original = "SELECT patient_code, delivery FROM cord_ph_birth_records WHERE patient_code = 'P001'"
        out = scope_source_to_cell(
            original, anchor="patient_code", member="P001", cohort_tables=self.CT)
        # No doubled predicate, and the agent's own SQL is preserved verbatim.
        self.assertEqual(out, original)
        self.assertEqual(out.count("patient_code = 'P001'"), 1)

    def test_cohort_wide_in_clause_is_narrowed_to_the_member(self):
        out = scope_source_to_cell(
            "SELECT patient_code, delivery FROM cord_ph_birth_records "
            "WHERE patient_code IN ('P001','P002')",
            anchor="patient_code", member="P001", cohort_tables=self.CT)
        self.assertIn("patient_code = 'P001'", out)

    def test_aliased_table_predicate_uses_the_alias(self):
        out = scope_source_to_cell(
            "SELECT b.patient_code, b.delivery FROM cord_ph_birth_records AS b",
            anchor="patient_code", member="P002", cohort_tables=self.CT)
        self.assertIn("b.patient_code = 'P002'", out)

    def test_note_source_is_narrowed_to_the_single_row(self):
        out = scope_source_to_cell(
            "SELECT patient_code, note_id, note_text FROM clinician_notes "
            "WHERE patient_code = 'P042' ORDER BY note_date",
            anchor="patient_code", member="P042",
            cohort_tables={"clinician_notes"},
            row_key="note_id", row_id="note-2291")
        # Member already pinned (no double), and the one cited row is added.
        self.assertEqual(out.count("patient_code = 'P042'"), 1)
        self.assertIn("note_id = 'note-2291'", out)

    def test_unknown_database_table_left_unchanged(self):
        original = "SELECT a, b FROM some_other_table"
        out = scope_source_to_cell(
            original, anchor="patient_code", member="P001", cohort_tables=self.CT)
        self.assertEqual(out, original)

    def test_non_select_and_unparseable_returned_verbatim(self):
        for q in ("UPDATE t SET x=1", "this is not sql ("):
            self.assertEqual(
                scope_source_to_cell(q, anchor="patient_code", member="P001",
                                     cohort_tables=self.CT),
                q)

    def test_nested_query_returned_verbatim(self):
        original = ("SELECT patient_code FROM cord_ph_birth_records "
                    "WHERE delivery IN (SELECT delivery FROM cord_ph_birth_records)")
        out = scope_source_to_cell(
            original, anchor="patient_code", member="P001", cohort_tables=self.CT)
        self.assertEqual(out, original)


if __name__ == "__main__":
    unittest.main(verbosity=2)
