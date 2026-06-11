"""Verify Tier 1 (``try_direct``, A3): driven by the orchestrator's ``RunStore``
seam, it UPDATEs pre-inserted pending cells **in place** — fills a clean hit,
leaves a NULL / unknown-code cell ``pending`` (not blocked) with the failed
attempt carrying ``table_column`` + ``value``, blocks an unmatched secondary
identity as ``IDENTITY_UNRESOLVED`` without mixing patients, and never returns a
cell.

Run: ``python3 -m core.running.tests.try_direct``
"""

import asyncio
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from core.mapping.build_populate_spec import validate_populate_spec  # noqa: E402
from core.running.orchestrator import RunStore, precompute_pending_cells  # noqa: E402
from core.running.try_direct import try_direct  # noqa: E402
from core.store import Cell, Run, Store  # noqa: E402

EXECUTABLE = {
    "schema_version": "2",
    "audit_id": "test",
    "workbook": "workbook.xlsx",
    "identity_keys": ["patient_code"],
    "cohort": {
        "database": "testdb",
        "from": "births b",
        "identity_select": "b.patient_code AS patient_code",
        "where": [],
    },
    "regions": [
        {
            "id": "ALL", "sheet": "ALL", "kind": "direct",
            "queries": [
                {"database": "testdb",
                 "sql": "SELECT patient_code, gestation_weeks, delivery FROM births "
                        "WHERE patient_code IN (:cohort)"},
                {"database": "testdb",
                 "sql": "SELECT patient_code, ward FROM extra "
                        "WHERE patient_code IN (:cohort)"},
            ],
            "row_anchor": "patient_code",
            "cell_map": [
                {"field": "patient_code", "column": "patient_code",
                 "table": "births", "cell_template": "{col:A}{row}"},
                {"field": "gestation_weeks", "column": "gestation_weeks",
                 "table": "births", "cell_template": "{col:B}{row}"},
                {"field": "delivery", "column": "delivery", "table": "births",
                 "cell_template": "{col:T}{row}", "translate": "delivery"},
                {"field": "ward", "column": "ward", "table": "extra",
                 "cell_template": "{col:G}{row}"},
            ],
        }
    ],
    "code_sets": {"delivery": {"Spontaneous vaginal": "1", "Forceps": "3"}},
}
COHORT = ["P001", "P002", "P003"]


def _make_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE births (patient_code TEXT, gestation_weeks INTEGER, delivery TEXT);
        CREATE TABLE extra  (patient_code TEXT, ward TEXT);
        INSERT INTO births VALUES ('P001', 39, 'Spontaneous vaginal');
        INSERT INTO births VALUES ('P002', NULL, 'Spontaneous vaginal');
        INSERT INTO births VALUES ('P003', 40, 'Caesarean');
        INSERT INTO extra VALUES ('P001', 'A');
        INSERT INTO extra VALUES ('P003', 'C');
        """
    )
    conn.commit()
    conn.close()


class TryDirectTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        d = Path(self._dir.name)
        self.db_path = d / "test.sqlite"
        _make_db(self.db_path)
        self.store = Store(d / "state.db")
        self.store.create_run(Run(id="r1", audit_id="test", status="in_progress"))
        self.assertEqual(validate_populate_spec(EXECUTABLE), [])
        # Pre-insert the pending grid (the orchestrator's job, mirrored here so
        # try_direct can update IN PLACE — never INSERT).
        self.store.insert_pending_cells(
            precompute_pending_cells("r1", EXECUTABLE, COHORT)
        )
        run_store = RunStore(
            self.store, "r1",
            executable=EXECUTABLE, cohort=COHORT,
            database_paths={"testdb": self.db_path},
            audit={"fields": []},
        )
        out = asyncio.run(try_direct(run_store))
        self.assertIsNone(out, "try_direct writes to the store and returns nothing")
        self.cells = {(c.field, c.member): c for c in self.store.get_cells("r1")}

    def tearDown(self):
        self.store.close()
        self._dir.cleanup()

    def test_clean_hit_is_filled_with_narrowed_no_error_attempt(self):
        c = self.cells[("gestation_weeks", "P001")]
        self.assertEqual(c.state, "filled")
        self.assertEqual(c.value, "39")
        self.assertEqual(c.resolved_by, "direct")
        self.assertEqual(len(c.attempts), 1)
        self.assertNotIn("error", c.attempts[0])
        self.assertEqual(c.attempts[0]["table_column"], "births.gestation_weeks")
        self.assertEqual(
            c.attempts[0]["sql"],
            "SELECT gestation_weeks FROM births WHERE patient_code = 'P001'",
        )

    def test_filled_cell_carries_self_verifying_source(self):
        c = self.cells[("delivery", "P001")]
        self.assertEqual(c.value, "1", "code-translated DB value → audit code")
        self.assertEqual(c.sources[0]["table_column"], "births.delivery")
        # Identity is the cell's member, not repeated on the source as record_id.
        self.assertNotIn("record_id", c.sources[0])
        self.assertEqual(c.member, "P001")
        self.assertIn("patient_code, delivery", c.sources[0]["query"])

    def test_null_value_is_pending_not_blocked(self):
        c = self.cells[("gestation_weeks", "P002")]
        self.assertEqual(c.state, "pending")
        self.assertIsNone(c.value)
        self.assertIn("error", c.attempts[0])
        self.assertIn("NULL", c.attempts[0]["error"])
        # The failed attempt records WHERE it looked (so Tier 2 reads provenance
        # off the attempt, not by re-parsing SQL); the source was NULL so no value.
        self.assertEqual(c.attempts[0]["table_column"], "births.gestation_weeks")
        self.assertEqual(
            c.attempts[0]["sql"],
            "SELECT gestation_weeks FROM births WHERE patient_code = 'P002'",
        )
        # Value is ABSENT (not None) — the discriminator A2 uses to refuse a
        # first-look code-drift solution over a NULL source (see try_llm.py).
        self.assertNotIn("value", c.attempts[0])

    def test_unknown_code_is_pending_not_blocked(self):
        c = self.cells[("delivery", "P003")]
        self.assertEqual(c.state, "pending")
        self.assertIn("not in the code map", c.attempts[0]["error"])
        # The raw value that failed the code-map rides on the attempt for Tier 2.
        self.assertEqual(c.attempts[0]["value"], "Caesarean")
        self.assertEqual(c.attempts[0]["table_column"], "births.delivery")
        self.assertEqual(
            c.attempts[0]["sql"],
            "SELECT delivery FROM births WHERE patient_code = 'P003'",
        )

    def test_unmatched_identity_blocks_without_mixing_patients(self):
        c = self.cells[("ward", "P002")]  # P002 absent from `extra`
        self.assertEqual(c.state, "blocked")
        self.assertEqual(c.reason_code, "IDENTITY_UNRESOLVED")
        self.assertIsNone(c.value)
        # The other patients' wards are placed correctly — never P002's.
        self.assertEqual(self.cells[("ward", "P001")].value, "A")
        self.assertEqual(self.cells[("ward", "P003")].value, "C")

    def test_run_status_is_blocked_from_persisted_cells(self):
        self.assertEqual(self.store.recompute_status("r1"), "blocked")

    def test_updates_in_place_preserves_pending_grid_count(self):
        # No extra cells were INSERTed — try_direct only UPDATEs the pre-inserted
        # pending grid. 3 members × 4 cell_map entries = 12 cells.
        self.assertEqual(len(self.cells), 12)


class RefreshSafeDirectTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        d = Path(self._dir.name)
        self.db_path = d / "test.sqlite"
        _make_db(self.db_path)
        self.store = Store(d / "state.db")
        self.store.create_run(Run(id="r1", audit_id="test", status="in_progress"))

        # Existing resolved cells from prior execution must remain untouched.
        self.store.upsert_cell(Cell(
            run_id="r1", ref="ALL!A2", field="patient_code", member="P001",
            kind="direct", state="filled", value="LOCKED",
            sources=[{"database": "testdb", "query": "q", "table_column": "births.patient_code"}],
        ))
        self.store.upsert_cell(Cell(
            run_id="r1", ref="ALL!A3", field="patient_code", member="P002",
            kind="direct", state="filled", value="P002",
            sources=[{"database": "testdb", "query": "q", "table_column": "births.patient_code"}],
        ))
        # Open set after refresh preprocessing: one reopened + one new member slot.
        self.store.upsert_cell(Cell(
            run_id="r1", ref="ALL!T2", field="delivery", member="P001",
            kind="direct", state="pending",
        ))
        self.store.upsert_cell(Cell(
            run_id="r1", ref="ALL!A4", field="patient_code", member="P003",
            kind="direct", state="pending",
        ))

    def tearDown(self):
        self.store.close()
        self._dir.cleanup()

    def test_refresh_uses_member_rows_and_updates_open_cells_only(self):
        run_store = RunStore(
            self.store, "r1",
            executable=EXECUTABLE,
            cohort=["P001", "P003"],
            database_paths={"testdb": self.db_path},
            audit={"fields": []},
            member_rows={"P001": 0, "P003": 2},
            active_member_ids={"P001", "P003"},
        )
        asyncio.run(try_direct(run_store))

        # Existing resolved cells are preserved (not recomputed by Tier 1 refresh).
        self.assertEqual(self.store.get_cell("r1", "ALL!A2").value, "LOCKED")
        self.assertEqual(self.store.get_cell("r1", "ALL!A3").value, "P002")
        # Open set is resolved using preserved append-only row mapping.
        self.assertEqual(self.store.get_cell("r1", "ALL!A4").value, "P003")
        self.assertEqual(self.store.get_cell("r1", "ALL!T2").value, "1")


class IdentityArityGuardTest(unittest.TestCase):
    """A scalar cohort member with a multi-key identity would silently truncate
    via ``zip`` in ``_where_identity``, producing an under-constrained narrowed
    query — exactly the 'never mix patients' invariant. ``_cohort_identity`` must
    reject the mismatch."""

    def test_scalar_member_with_multi_key_identity_raises(self):
        from core.running.try_direct import TryDirectError, _cohort_identity
        with self.assertRaises(TryDirectError) as cm:
            _cohort_identity("P001", ["patient_code", "encounter_id"])
        self.assertIn("under-constrained", str(cm.exception))

    def test_short_sequence_member_with_multi_key_identity_raises(self):
        from core.running.try_direct import TryDirectError, _cohort_identity
        with self.assertRaises(TryDirectError):
            _cohort_identity(["P001"], ["patient_code", "encounter_id"])

    def test_matched_arity_passes(self):
        from core.running.try_direct import _cohort_identity
        self.assertEqual(
            _cohort_identity(("P001", "E1"), ["patient_code", "encounter_id"]),
            ("P001", "E1"),
        )
        self.assertEqual(_cohort_identity("P001", ["patient_code"]), ("P001",))


CROSS_DB_EXECUTABLE = {
    "schema_version": "2",
    "audit_id": "multi",
    "workbook": "workbook.xlsx",
    "identity_keys": ["visit_id"],
    "identity_bridges": [
        {"database": "demographics", "key_column": "nhs_number",
         "via": {"table": "visits", "anchor_column": "visit_id",
                 "bridge_column": "patient_ref"}},
    ],
    "cohort": {
        "database": "clinical",
        "from": "visits b",
        "identity_select": "b.visit_id AS visit_id",
        "where": [],
    },
    "regions": [
        {
            "id": "ALL", "sheet": "ALL", "kind": "direct",
            "queries": [
                {"database": "clinical",
                 "sql": "SELECT v.visit_id, v.visit_date FROM visits v "
                        "WHERE v.visit_id IN (:cohort)"},
                {"database": "demographics", "key_column": "nhs_number",
                 "sql": "SELECT p.nhs_number, p.date_of_birth FROM patients p "
                        "WHERE p.nhs_number IN (:cohort)"},
                {"database": "clinical",
                 "sql": "SELECT t.visit_id, t.regimen FROM technology t "
                        "WHERE t.visit_id IN (:cohort)"},  # technology has NO visit_id
            ],
            "row_anchor": "visit_id",
            "cell_map": [
                {"field": "visit_date", "column": "visit_date",
                 "table": "visits", "cell_template": "{col:A}{row}"},
                {"field": "date_of_birth", "column": "date_of_birth",
                 "table": "patients", "cell_template": "{col:B}{row}"},
                {"field": "regimen", "column": "regimen",
                 "table": "technology", "cell_template": "{col:C}{row}"},
            ],
        }
    ],
    "code_sets": {},
}
CROSS_DB_COHORT = ["V1", "V2", "V3"]


def _make_cross_dbs(d: Path) -> dict[str, Path]:
    clinical, demographics = d / "clinical.sqlite", d / "demographics.sqlite"
    conn = sqlite3.connect(clinical)
    conn.executescript(
        """
        CREATE TABLE visits (visit_id TEXT, patient_ref TEXT, visit_date TEXT);
        CREATE TABLE technology (tech_id TEXT, patient_ref TEXT, regimen TEXT);
        INSERT INTO visits VALUES ('V1', 'N100', '2026-01-05');
        INSERT INTO visits VALUES ('V2', 'N200', '2026-02-10');
        INSERT INTO visits VALUES ('V3', NULL,   '2026-03-15');  -- no bridge value
        INSERT INTO technology VALUES ('T1', 'N100', 'pump');
        """
    )
    conn.commit()
    conn.close()
    conn = sqlite3.connect(demographics)
    conn.executescript(
        """
        CREATE TABLE patients (nhs_number TEXT, date_of_birth TEXT);
        INSERT INTO patients VALUES ('N100', '2011-08-14');
        -- N200 missing entirely: identity unresolved in the foreign database.
        """
    )
    conn.commit()
    conn.close()
    return {"clinical": clinical, "demographics": demographics}


class CrossDatabaseTryDirectTest(unittest.TestCase):
    """A3 cross-database joins: a bridged foreign query fills via its own key, a
    missing bridge/foreign identity blocks (never mixes patients), and a failing
    query degrades to per-cell escalation instead of killing the run."""

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        d = Path(self._dir.name)
        paths = _make_cross_dbs(d)
        self.store = Store(d / "state.db")
        self.store.create_run(Run(id="r1", audit_id="multi", status="in_progress"))
        self.assertEqual(validate_populate_spec(CROSS_DB_EXECUTABLE), [])
        self.store.insert_pending_cells(
            precompute_pending_cells("r1", CROSS_DB_EXECUTABLE, CROSS_DB_COHORT)
        )
        run_store = RunStore(
            self.store, "r1",
            executable=CROSS_DB_EXECUTABLE, cohort=CROSS_DB_COHORT,
            database_paths=paths,
            audit={"fields": []},
        )
        asyncio.run(try_direct(run_store))
        self.cells = {(c.field, c.member): c for c in self.store.get_cells("r1")}

    def tearDown(self):
        self.store.close()
        self._dir.cleanup()

    def test_bridged_foreign_cell_is_filled_with_its_own_key_provenance(self):
        c = self.cells[("date_of_birth", "V1")]
        self.assertEqual(c.state, "filled")
        self.assertEqual(c.value, "2011-08-14")
        # The narrowed attempt and the source are keyed by the FOREIGN key, never
        # by an anchor column the table does not carry.
        self.assertEqual(
            c.attempts[0]["sql"],
            "SELECT date_of_birth FROM patients WHERE nhs_number = 'N100'",
        )
        self.assertEqual(c.sources[0]["database"], "demographics")
        self.assertIn("nhs_number, date_of_birth", c.sources[0]["query"])

    def test_anchor_cells_fill_independently_of_the_bridge(self):
        for member, expected in (("V1", "2026-01-05"), ("V2", "2026-02-10"),
                                 ("V3", "2026-03-15")):
            c = self.cells[("visit_date", member)]
            self.assertEqual((c.state, c.value), ("filled", expected), member)

    def test_missing_foreign_identity_blocks_without_mixing_patients(self):
        c = self.cells[("date_of_birth", "V2")]  # N200 absent from demographics
        self.assertEqual(c.state, "blocked")
        self.assertEqual(c.reason_code, "IDENTITY_UNRESOLVED")
        self.assertIsNone(c.value)

    def test_missing_bridge_value_blocks(self):
        c = self.cells[("date_of_birth", "V3")]  # visits.patient_ref is NULL
        self.assertEqual(c.state, "blocked")
        self.assertEqual(c.reason_code, "IDENTITY_UNRESOLVED")
        self.assertIn("identity bridge", c.reason_detail)

    def test_failing_query_degrades_to_per_cell_escalation(self):
        # technology has no visit_id column: the query fails, the run survives,
        # and the table's cells stay pending with the real error for Tier 2.
        for member in CROSS_DB_COHORT:
            c = self.cells[("regimen", member)]
            self.assertEqual(c.state, "pending", member)
            self.assertIn("source query failed", c.attempts[0]["error"])
            self.assertIn("visit_id", c.attempts[0]["error"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
