"""`profile.discover_foreign_keys` + grain + fingerprints + the durable-semantics
merge: within-database joins are MEASURED (value-overlap) or taken from declared
SQL constraints, never guessed from names; asserted prose survives a re-index of
an unchanged table.

Run: ``python3 -m core.indexing.tests.foreign_keys``
"""

import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from core.indexing.build_database_model import (  # noqa: E402
    _assemble,
    _build_filterable_surface,
    _merge_durable,
    _render_for_llm,
    extract_schema,
)
from core.contracts import validate_against_schema  # noqa: E402
from core.indexing.profile import (  # noqa: E402
    discover_foreign_keys,
    grain_cardinality_warnings,
    grain_signal,
    schema_fingerprint,
)

PIDS = [f"NORTH-2020-{i:03d}" for i in range(6)]


def _make_db(path: Path, *, declared_fk: bool = False, event_table: bool = False) -> None:
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE patients (patient_id TEXT PRIMARY KEY, family_name TEXT)")
    reg_fk = (
        ", FOREIGN KEY(patient_id) REFERENCES patients(patient_id)" if declared_fk else ""
    )
    conn.execute(
        "CREATE TABLE registrations "
        f"(reg_id TEXT PRIMARY KEY, patient_id TEXT, diabetes_type_code TEXT{reg_fk})"
    )
    conn.execute(
        "CREATE TABLE measurements "
        "(meas_id TEXT PRIMARY KEY, patient_id TEXT, value TEXT)"
    )
    if event_table:
        # No natural all-distinct key (only the rowid alias) — an event table.
        conn.execute("CREATE TABLE events (_row_id INTEGER PRIMARY KEY, patient_id TEXT, kind TEXT)")
    for i, pid in enumerate(PIDS):
        conn.execute("INSERT INTO patients VALUES (?, ?)", (pid, f"Fam{i}"))
        conn.execute("INSERT INTO registrations VALUES (?, ?, ?)", (f"REG{i}", pid, str(i % 4 + 1)))
        for m in range(2):  # two measurements per patient -> to-many
            conn.execute("INSERT INTO measurements VALUES (?, ?, ?)", (f"M{i}{m}", pid, str(i + m)))
            if event_table:  # two events per patient -> no all-distinct natural key
                conn.execute("INSERT INTO events VALUES (?, ?, ?)", (None, pid, "x"))
    conn.commit()
    conn.close()


def _fks(path: Path) -> list[dict]:
    schema = extract_schema(path)
    cls = _build_filterable_surface(path, schema)
    return discover_foreign_keys(path, schema, cls)


class ForeignKeyDetectTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.db = Path(self._dir.name) / "demo.sqlite"

    def tearDown(self):
        self._dir.cleanup()

    def test_to_one_fk_is_measured_with_evidence(self):
        _make_db(self.db)
        edges = _fks(self.db)
        match = [e for e in edges
                 if e["column"] == "registrations.patient_id"
                 and e["target"] == "patients.patient_id"]
        self.assertEqual(len(match), 1, edges)
        self.assertEqual(match[0]["cardinality"], "to-one")
        self.assertFalse(match[0]["declared"])
        self.assertEqual(match[0]["evidence"], "6/6 sampled values found in target")

    def test_to_many_fk_cardinality(self):
        _make_db(self.db)
        match = [e for e in _fks(self.db)
                 if e["column"] == "measurements.patient_id"
                 and e["target"] == "patients.patient_id"]
        self.assertEqual(len(match), 1)
        self.assertEqual(match[0]["cardinality"], "to-many")

    def test_declared_fk_has_no_evidence(self):
        _make_db(self.db, declared_fk=True)
        match = [e for e in _fks(self.db)
                 if e["column"] == "registrations.patient_id"
                 and e["target"] == "patients.patient_id"]
        self.assertEqual(len(match), 1, "declared should win and dedupe the measured edge")
        self.assertTrue(match[0]["declared"])
        self.assertNotIn("evidence", match[0])

    def test_tiny_code_set_is_not_a_fk(self):
        # diabetes_type_code has <5 distinct values -> never a source or target.
        _make_db(self.db)
        self.assertFalse(
            [e for e in _fks(self.db) if "diabetes_type_code" in (e["column"], e["target"])]
        )

    def test_no_reverse_edge_and_pk_never_source(self):
        # patients.patient_id is a TEXT PRIMARY KEY: it identifies its own rows,
        # so it is never an FK source — only the forward child->parent edge exists.
        _make_db(self.db)
        edges = {(e["column"], e["target"]) for e in _fks(self.db)}
        self.assertIn(("registrations.patient_id", "patients.patient_id"), edges)
        self.assertNotIn(("patients.patient_id", "registrations.patient_id"), edges)
        self.assertFalse(
            [c for (c, t) in edges if c == "patients.patient_id"],
            "a primary key is never emitted as a source",
        )
        self.assertFalse([(c, t) for (c, t) in edges if (t, c) in edges],
                         "no reverse pairs")

    def test_two_builds_are_identical(self):
        # Deterministic sampling -> identical edges (and thus schema_fingerprint)
        # across repeated builds of the same database.
        _make_db(self.db)
        self.assertEqual(_fks(self.db), _fks(self.db))

    def test_partial_containment_is_not_a_fk(self):
        # Containment is measured over the FULL distinct source set, so a column
        # only partially present in a key (below the 0.95 threshold) is never an
        # edge — even if its lexicographically-first values would all match.
        conn = sqlite3.connect(self.db)
        conn.execute("CREATE TABLE patients (patient_id TEXT PRIMARY KEY, x TEXT)")
        conn.execute("CREATE TABLE foo (ref TEXT)")
        for i in range(10):
            conn.execute("INSERT INTO patients VALUES (?,?)", (f"AAA{i}", "y"))
        # 5 of foo.ref are 'AAA*' (in patients), 5 are 'ZZZ*' (not) -> 50% contained.
        for i in range(5):
            conn.execute("INSERT INTO foo VALUES (?)", (f"AAA{i}",))
            conn.execute("INSERT INTO foo VALUES (?)", (f"ZZZ{i}",))
        conn.commit(); conn.close()
        self.assertFalse(
            [e for e in _fks(self.db)
             if e["column"] == "foo.ref" and e["target"] == "patients.patient_id"]
        )


class GrainTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.db = Path(self._dir.name) / "demo.sqlite"
        _make_db(self.db, event_table=True)

    def tearDown(self):
        self._dir.cleanup()

    def test_grain_signal_matches_all_distinct_key(self):
        schema = extract_schema(self.db)
        cls = _build_filterable_surface(self.db, schema)
        grain = grain_signal(self.db, schema)
        self.assertEqual(grain["patients"], "one row per entity")
        self.assertEqual(grain["registrations"], "one row per entity")
        # events has only a rowid alias + repeating columns -> many per entity.
        self.assertEqual(grain["events"], "many rows per entity")

    def test_grain_cardinality_warning(self):
        grain = {"a": "one row per entity"}
        fks = [{"column": "a.x", "target": "b.y", "cardinality": "to-many", "declared": False}]
        self.assertEqual(len(grain_cardinality_warnings(grain, fks)), 1)
        # to-one is consistent -> no warning.
        fks[0]["cardinality"] = "to-one"
        self.assertEqual(grain_cardinality_warnings(grain, fks), [])

    def test_assemble_uses_signal_floor_and_llm_override(self):
        schema = extract_schema(self.db)
        cls = _build_filterable_surface(self.db, schema)
        grain = grain_signal(self.db, schema)
        # No grain in the prose -> the deterministic signal is the floor.
        m = _assemble("demo", schema, cls, {"tables": []}, None, [], grain)
        by = {t["name"]: t for t in m["tables"]}
        self.assertEqual(by["patients"]["grain"], grain["patients"])
        # LLM prose overrides the signal when present.
        prose = {"tables": [{"name": "patients", "grain": "one row per registered patient"}]}
        m2 = _assemble("demo", schema, cls, prose, None, [], grain)
        by2 = {t["name"]: t for t in m2["tables"]}
        self.assertEqual(by2["patients"]["grain"], "one row per registered patient")

    def test_render_for_llm_shows_grain_signal(self):
        schema = extract_schema(self.db)
        cls = _build_filterable_surface(self.db, schema)
        grain = grain_signal(self.db, schema)
        self.assertIn("grain signal:", _render_for_llm(schema, cls, grain))


class FingerprintTest(unittest.TestCase):
    def test_stable_then_changes(self):
        schema = {"tables": [{"name": "t", "columns": [
            {"name": "id", "type": "TEXT"}, {"name": "x", "type": "TEXT"}]}]}
        fp1 = schema_fingerprint(schema, [], None)
        self.assertEqual(fp1, schema_fingerprint(schema, [], None))  # deterministic
        changed = {"tables": [{"name": "t", "columns": [
            {"name": "id", "type": "TEXT"}, {"name": "x", "type": "INTEGER"}]}]}  # type drift
        self.assertNotEqual(fp1, schema_fingerprint(changed, [], None))
        # An added edge changes the fingerprint too.
        edge = [{"column": "t.x", "target": "u.id", "cardinality": "to-one", "declared": False}]
        self.assertNotEqual(fp1, schema_fingerprint(schema, edge, None))


class ConventionsRoundtripTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.db = Path(self._dir.name) / "demo.sqlite"
        _make_db(self.db)

    def tearDown(self):
        self._dir.cleanup()

    def _assembled(self, prose):
        schema = extract_schema(self.db)
        cls = _build_filterable_surface(self.db, schema)
        fks = discover_foreign_keys(self.db, schema, cls)
        return _assemble("demo", schema, cls, prose, None, fks)

    def test_conventions_present_validates(self):
        prose = {"title": "Demo", "description": "A demo db.", "tables": [],
                 "conventions": {"notes": ["All timestamps are UTC"],
                                 "row_filters": [{"table": "registrations", "predicate": "deleted_at IS NULL"}]}}
        model = self._assembled(prose)
        self.assertEqual(model["conventions"]["notes"], ["All timestamps are UTC"])
        self.assertFalse(validate_against_schema(model, "database-model.schema.json"))

    def test_conventions_absent_is_fine(self):
        model = self._assembled({"title": "Demo", "description": "A demo db.", "tables": []})
        self.assertNotIn("conventions", model)
        self.assertFalse(validate_against_schema(model, "database-model.schema.json"))


class DurableMergeTest(unittest.TestCase):
    def _fresh(self):
        return {
            "schema_version": "1", "database": "d", "title": "T",
            "description": "fresh db desc", "schema_fingerprint": "FP",
            "tables": [{
                "name": "patients", "description": "fresh table desc",
                "fingerprint": "TFP",
                "columns": [{"name": "patient_id", "type": "text",
                             "description": "fresh col desc", "filterable": False,
                             "reason": "identifier"}],
            }],
        }

    def test_unchanged_fingerprint_preserves_asserted(self):
        prev = self._fresh()
        prev["description"] = "EDITED db"
        prev["tables"][0]["description"] = "EDITED table"
        prev["tables"][0]["grain"] = "one row per patient"
        prev["tables"][0]["columns"][0]["description"] = "EDITED col"
        prev["conventions"] = {"notes": ["hand-authored"]}
        merged = _merge_durable(self._fresh(), prev)
        self.assertEqual(merged["description"], "EDITED db")
        self.assertEqual(merged["tables"][0]["description"], "EDITED table")
        self.assertEqual(merged["tables"][0]["grain"], "one row per patient")
        self.assertEqual(merged["tables"][0]["columns"][0]["description"], "EDITED col")
        self.assertEqual(merged["conventions"], {"notes": ["hand-authored"]})

    def test_first_migration_no_fingerprint_preserves(self):
        prev = self._fresh()
        prev.pop("schema_fingerprint")
        prev["tables"][0].pop("fingerprint")
        prev["tables"][0]["description"] = "SEED prose"
        merged = _merge_durable(self._fresh(), prev)
        self.assertEqual(merged["tables"][0]["description"], "SEED prose")

    def test_changed_fingerprint_rederives(self):
        prev = self._fresh()
        prev["tables"][0]["fingerprint"] = "OLD"
        prev["tables"][0]["description"] = "STALE prose"
        merged = _merge_durable(self._fresh(), prev)
        self.assertEqual(merged["tables"][0]["description"], "fresh table desc")


class SeedModelFKTest(unittest.TestCase):
    """The committed NPDA demographics seed carries the measured within-db FK."""

    def test_npda_demographics_seed_has_registrations_fk(self):
        model = json.loads(
            (REPO_ROOT / "data/seed/databases/npda-demographics/model.json").read_text()
        )
        edges = {(e["column"], e["target"]) for e in model.get("foreign_keys", [])}
        # The patients<->registrations 1:1 join is present; with no declared FK the
        # direction is the stable sorted one (either is correct — read undirected).
        pair = {("registrations.patient_id", "patients.patient_id"),
                ("patients.patient_id", "registrations.patient_id")}
        self.assertTrue(edges & pair, edges)
        # ...and never both directions.
        self.assertNotEqual(edges & pair, pair, edges)


if __name__ == "__main__":
    unittest.main(verbosity=2)
