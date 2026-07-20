"""Phase C: a `direct` field whose column lives in a foreign NON-key table is
filled by prepopulate via a measured to-one FK chain (multi-hop JOIN keyed by the
bridge key) WITH code translation — instead of being demoted to `interpret`.

Compiler: with the FK graph the field stays direct and the query JOINs to it;
without it (or with a to-many edge) it demotes — no regression. Executor: the
multi-hop query fills the cell with the translated value, leaves an off-code
value pending, and BLOCKS a runtime fan-out (duplicate child rows).

Run: ``python3 -m core.mapping.tests.multihop_direct``
"""

import asyncio
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from core.mapping.build_populate_spec import (  # noqa: E402
    _qualify_predicate,
    build_populate_spec,
    validate_populate_spec,
)
from core import table_population  # noqa: E402
from core.store import Run, Store  # noqa: E402
from core.table_population.populate import TablePopulationContext  # noqa: E402
from core.table_population.populate import prepopulate  # noqa: E402

_DTYPE_CODE = {"1": "Type 1 Diabetes Mellitus", "2": "Type 2 Diabetes Mellitus"}


def _mapping() -> dict:
    """NPDA-shaped: visit-grain anchor in `clinical`, demographics bridged by
    nhs_number, Diabetes Type in the foreign non-key table `registrations`."""
    return {
        "audit": "multi",
        "databases": ["clinical", "demographics"],
        "identity": {
            "anchor": "clinical -> visits.visit_id",
            "keys": [
                "clinical -> visits.visit_id",
                "clinical -> visits.patient_ref",
                "demographics -> patients.nhs_number",
            ],
        },
        "criteria_bindings": [],
        "regions": [{"id": "ALL", "sheet": "ALL"}],
        "fields": [
            {
                "region": "ALL",
                "cell": "A",
                "header": "Visit date",
                "kind": "direct",
                "sources": ["clinical -> visits.visit_date"],
            },
            {
                "region": "ALL",
                "cell": "B",
                "header": "Diabetes type",
                "kind": "direct",
                "sources": ["demographics -> registrations.diabetes_type"],
                "code": _DTYPE_CODE,
            },
        ],
    }


def _graph(cardinality: str = "to-one") -> dict:
    return {
        "demographics": [
            {
                "column": "registrations.patient_id",
                "target": "patients.patient_id",
                "cardinality": cardinality,
                "declared": False,
                "evidence": "n/n sampled values found in target",
            },
        ]
    }


def _direct_region(spec: dict) -> dict:
    return next(r for r in spec["regions"] if r["kind"] == "direct")


def _interpret_fields(spec: dict) -> set[str]:
    region = next((r for r in spec["regions"] if r["kind"] == "interpret"), None)
    return {e["field"] for e in region["cell_map"]} if region else set()


class CompileTest(unittest.TestCase):
    def test_multihop_keeps_field_direct_with_join_and_translation(self):
        spec = build_populate_spec(_mapping(), join_graph=_graph("to-one"))
        self.assertEqual(validate_populate_spec(spec), [])
        direct = _direct_region(spec)
        entry = next(e for e in direct["cell_map"] if e["field"] == "diabetes_type")
        self.assertEqual(entry["table"], "registrations")
        self.assertEqual(entry["translate"], "diabetes_type")
        self.assertIn("diabetes_type", spec["code_sets"])
        q = next(q for q in direct["queries"] if q["database"] == "demographics")
        self.assertEqual(q["key_column"], "nhs_number")
        self.assertIn("JOIN registrations", q["sql"])
        self.assertIn("p.patient_id = r.patient_id", q["sql"])
        self.assertIn("nhs_number IN (:cohort)", q["sql"])

    def test_without_graph_demotes_to_interpret(self):
        spec = build_populate_spec(_mapping())  # join_graph=None — today's behavior
        self.assertIn("diabetes_type", _interpret_fields(spec))

    def test_to_many_edge_demotes_to_interpret(self):
        spec = build_populate_spec(_mapping(), join_graph=_graph("to-many"))
        self.assertIn("diabetes_type", _interpret_fields(spec))

    def test_cell_map_carries_via_for_valid_provenance(self):
        # The multi-hop entry carries the FK chain so prepopulate can render a VALID
        # per-cell provenance query (JOIN to the leaf, keyed on the bridge table).
        from core.table_population.populate import _source_sql

        spec = build_populate_spec(_mapping(), join_graph=_graph("to-one"))
        entry = next(
            e for e in _direct_region(spec)["cell_map"] if e["field"] == "diabetes_type"
        )
        self.assertEqual(entry["via"][0]["from_table"], "patients")
        sql = _source_sql(
            "registrations", "diabetes_type", ["nhs_number"], ("NHS1",), entry["via"]
        )
        # JOINs to the leaf and keys on the bridge table — never the malformed
        # `… FROM registrations WHERE nhs_number = …` (registrations has no nhs_number).
        self.assertIn("JOIN registrations", sql)
        self.assertIn("a0.nhs_number = 'NHS1'", sql)

    def test_multihop_selects_a_leaf_column_sharing_the_key_name(self):
        # A leaf column whose name equals the bridge key must NOT be dropped
        # (key_col lives on the key table, a different alias).
        m = _mapping()
        m["fields"].append(
            {
                "region": "ALL",
                "cell": "C",
                "header": "Reg NHS",
                "kind": "direct",
                "sources": ["demographics -> registrations.nhs_number"],
            }
        )
        spec = build_populate_spec(m, join_graph=_graph("to-one"))
        sql = next(
            q
            for q in _direct_region(spec)["queries"]
            if q["database"] == "demographics"
        )["sql"]
        # both the key (bridge alias) and the leaf's own nhs_number are selected.
        self.assertGreaterEqual(sql.split("FROM")[0].count("nhs_number"), 2)

    def test_row_filter_is_anded_into_the_join(self):
        convs = {
            "demographics": {
                "row_filters": [
                    {"table": "registrations", "predicate": "deleted_at IS NULL"}
                ]
            }
        }
        spec = build_populate_spec(
            _mapping(), join_graph=_graph("to-one"), conventions=convs
        )
        q = next(
            q
            for q in _direct_region(spec)["queries"]
            if q["database"] == "demographics"
        )
        self.assertIn("AND r.deleted_at IS NULL", q["sql"])

    def test_compound_row_filter_qualifies_every_column(self):
        # A compound predicate on the joined (non-key) table: BOTH columns must be
        # qualified to that table's alias, never left bare or bound to the key table.
        convs = {
            "demographics": {
                "row_filters": [
                    {
                        "table": "registrations",
                        "predicate": "status != 'void' AND deleted_at IS NULL",
                    }
                ]
            }
        }
        spec = build_populate_spec(
            _mapping(), join_graph=_graph("to-one"), conventions=convs
        )
        sql = next(
            q
            for q in _direct_region(spec)["queries"]
            if q["database"] == "demographics"
        )["sql"]
        # registrations is the joined leaf, aliased r; both columns land on r,
        # the literal 'void' is untouched, and nothing binds to the key table (p).
        self.assertIn("r.status != 'void' AND r.deleted_at IS NULL", sql)
        self.assertNotIn("p.status", sql)
        self.assertNotIn("p.deleted_at", sql)


class QualifyPredicateTest(unittest.TestCase):
    def test_qualifies_all_bare_columns(self):
        self.assertEqual(
            _qualify_predicate("deleted_at IS NULL", "r"), "r.deleted_at IS NULL"
        )
        self.assertEqual(
            _qualify_predicate("status != 'void' AND deleted_at IS NULL", "r"),
            "r.status != 'void' AND r.deleted_at IS NULL",
        )

    def test_leaves_functions_and_qualified_and_literals(self):
        # function name stays bare; its column argument is qualified
        self.assertEqual(
            _qualify_predicate("LOWER(name) = 'x'", "r"), "LOWER(r.name) = 'x'"
        )
        # already-qualified column is untouched
        self.assertEqual(
            _qualify_predicate("t.deleted_at IS NULL", "r"), "t.deleted_at IS NULL"
        )
        # the AND'd string literal is never qualified
        self.assertNotIn("r.'", _qualify_predicate("kind = 'a_b' AND x IS NULL", "r"))
        # a CAST type name stays bare; only the column is qualified
        self.assertEqual(
            _qualify_predicate("CAST(status_code AS INTEGER) != 0", "r"),
            "CAST(r.status_code AS INTEGER) != 0",
        )


def _build_dbs(
    clinical: Path, demographics: Path, cohort: list[str], rows: dict
) -> None:
    """`rows[visit_id] = (nhs, patient_id, [diabetes_type, ...])` — a list with >1
    entry models a runtime fan-out (duplicate registrations)."""
    cc = sqlite3.connect(clinical)
    cc.execute("CREATE TABLE visits (visit_id TEXT, patient_ref TEXT, visit_date TEXT)")
    for v in cohort:
        cc.execute("INSERT INTO visits VALUES (?,?,?)", (v, rows[v][0], "2026-01-01"))
    cc.commit()
    cc.close()

    dc = sqlite3.connect(demographics)
    dc.execute(
        "CREATE TABLE patients (nhs_number TEXT, patient_id TEXT, sex_code TEXT)"
    )
    dc.execute("CREATE TABLE registrations (patient_id TEXT, diabetes_type TEXT)")
    seen_patients = set()
    for v in cohort:
        nhs, pid, dtypes = rows[v]
        if pid not in seen_patients:
            dc.execute("INSERT INTO patients VALUES (?,?,?)", (nhs, pid, "1"))
            seen_patients.add(pid)
        for dt in dtypes:
            dc.execute("INSERT INTO registrations VALUES (?,?)", (pid, dt))
    dc.commit()
    dc.close()


class ExecutorTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        d = Path(self._dir.name)
        self.cohort = ["V1", "V2", "V3"]
        rows = {
            "V1": ("NHS1", "P1", ["Type 1 Diabetes Mellitus"]),  # clean -> "1"
            "V2": ("NHS2", "P2", ["Gestational"]),  # off-code -> pending
            "V3": (
                "NHS3",
                "P3",
                [
                    "Type 2 Diabetes Mellitus",  # fan-out -> blocked
                    "Type 1 Diabetes Mellitus",
                ],
            ),
        }
        clinical, demographics = d / "clinical.sqlite", d / "demographics.sqlite"
        _build_dbs(clinical, demographics, self.cohort, rows)
        self.demographics = demographics
        spec = build_populate_spec(_mapping(), join_graph=_graph("to-one"))
        self.store = Store(d / "state.db")
        self.store.create_run(Run(id="r1", audit_id="multi", status="in_progress"))
        self.store.insert_pending_cells(
            table_population.build_pending_table_cells("r1", spec, self.cohort)
        )
        run_store = TablePopulationContext(
            self.store,
            "r1",
            executable=spec,
            cohort=self.cohort,
            database_paths={"clinical": clinical, "demographics": demographics},
            field_spec={"fields": []},
        )
        asyncio.run(prepopulate(run_store))
        self.cells = {(c.field, c.member): c for c in self.store.get_cells("r1")}

    def tearDown(self):
        self.store.close()
        self._dir.cleanup()

    def test_clean_member_fills_translated_value(self):
        c = self.cells[("diabetes_type", "V1")]
        self.assertEqual(c.state, "filled")
        self.assertEqual(c.value, "1")
        self.assertEqual(c.resolved_by, "prepopulated")
        self.assertEqual(c.sources[0]["table_column"], "registrations.diabetes_type")

    def test_multihop_provenance_query_is_valid_and_self_verifying(self):
        # The recorded source query must actually RUN against the leaf's database
        # (the old single-table form `… FROM registrations WHERE nhs_number=…`
        # was malformed) and return the value alongside its identity.
        c = self.cells[("diabetes_type", "V1")]
        rows = (
            sqlite3.connect(self.demographics).execute(c.sources[0]["query"]).fetchall()
        )
        self.assertEqual(rows, [("NHS1", "Type 1 Diabetes Mellitus")])

    def test_off_code_value_stays_pending(self):
        c = self.cells[("diabetes_type", "V2")]
        self.assertNotEqual(c.state, "filled")
        self.assertNotEqual(c.state, "blocked")
        self.assertTrue(c.attempts and c.attempts[0].get("error"))

    def test_runtime_fanout_is_blocked(self):
        c = self.cells[("diabetes_type", "V3")]
        self.assertEqual(c.state, "blocked")


if __name__ == "__main__":
    unittest.main(verbosity=2)
