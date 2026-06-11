"""A4 verify: the cord-pH `mapping.json` carries a valid, derived `executable`, and
that executable runs a clean Tier-1 pass on the seed.

Covers the A4 checklist (docs/mvp/BUILD-PLAN.md):
  * the seed `mapping.json` validates against `mapping.schema.json` (now including the
    folded `executable` section) and binds the audit to >=1 database (multi-DB shape);
  * every value is locatable from the match alone (each field's `sources` parse to
    `<db> -> <table>.<column>`);
  * the `executable` is DERIVED, not hand-authored — recompiling it from the match
    reproduces it byte-for-byte;
  * `kind` is derived (a multi-source field is forced to `interpret`);
  * the cohort block matches the criteria base (anchor + the joins the bindings need);
  * the executable runs a clean Tier-1 pass: `try_direct` fills the seed's direct cells
    (with a code-translated cell + a self-verifying source) against a DB built from the
    executable's own cell map.

Run: ``python3 -m core.mapping.tests.mapping_executable``
"""

import asyncio
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

import jsonschema  # noqa: E402

from core.mapping.build_populate_spec import (  # noqa: E402
    BuildError,
    _field_kind,
    build_populate_spec,
    fold_executable,
    validate_populate_spec,
)
from core.running.orchestrator import RunStore, precompute_pending_cells  # noqa: E402
from core.running.try_direct import try_direct  # noqa: E402
from core.store import Run, Store  # noqa: E402

SEED = REPO_ROOT / "seed/audits/cord-ph"
SCHEMA = json.loads(
    (REPO_ROOT / "docs/mvp/contracts/mapping.schema.json").read_text(encoding="utf-8")
)
MAPPING = json.loads((SEED / "mapping.json").read_text(encoding="utf-8"))


class SeedMappingTest(unittest.TestCase):
    def test_seed_mapping_validates_with_executable_and_multi_db_shape(self):
        jsonschema.validate(MAPPING, SCHEMA)  # raises on failure
        self.assertIn("executable", MAPPING, "the executable must be folded in")
        self.assertGreaterEqual(len(MAPPING["databases"]), 1, "binds >=1 database")
        # The multi-DB reference shape is present: every source is "<db> -> t.c".
        for field in MAPPING["fields"]:
            for src in field["sources"]:
                self.assertRegex(src, r"^\S.*->\s*\w+\.\w+$", f"unlocatable source {src!r}")

    def test_executable_is_derived_not_hand_authored(self):
        # Recompiling from the match reproduces the folded executable exactly.
        recompiled = build_populate_spec(MAPPING)
        self.assertEqual(MAPPING["executable"], recompiled)
        self.assertEqual(validate_populate_spec(MAPPING["executable"]), [])

    def test_cohort_block_matches_the_criteria_base(self):
        exe = MAPPING["executable"]
        anchor = MAPPING["identity"]["anchor"]  # "<db> -> <table>.<col>"
        anchor_table = anchor.split("->", 1)[1].strip().split(".", 1)[0]
        cohort = exe["cohort"]
        self.assertTrue(cohort["from"].startswith(anchor_table + " b"))
        self.assertIn(f"AS {exe['identity_keys'][0]}", cohort["identity_select"])
        self.assertEqual(cohort["where"], [], "precompiled cohort ships an empty where")
        # Every join in the cohort base is one a criterion binding off the anchor needs.
        needed = {
            b["join_path"].split("->", 1)[1].strip().split(".", 1)[0]
            for b in MAPPING["criteria_bindings"]
            if "->" in b["join_path"]
            and b["join_path"].split(".", 1)[0] == anchor_table
        }
        joined = {
            tok for tok in cohort["from"].split() if tok in needed
        }
        self.assertEqual(joined, needed, "cohort joins == bindings' anchor joins")

    def test_kind_is_derived_multi_source_becomes_interpret(self):
        # A single-source field keeps its match kind; a multi-source one is forced
        # to interpret (Tier 1 can only copy one column → one cell).
        self.assertEqual(_field_kind({"kind": "direct", "sources": ["a -> t.c"]}), "direct")
        self.assertEqual(
            _field_kind({"kind": "direct", "sources": ["a -> t.c", "a -> t.d"]}),
            "interpret",
        )
        # And it flows through the compile: a synthetic two-source field lands in an
        # interpret region of the executable.
        synthetic = {
            **{k: MAPPING[k] for k in ("audit", "identity", "criteria_bindings")},
            "regions": [{"id": "X", "sheet": "X"}],
            "fields": [
                {"region": "X", "cell": "A", "header": "Combo", "kind": "direct",
                 "sources": ["cord-ph -> t.a", "cord-ph -> t.b"]},
            ],
        }
        spec = build_populate_spec(synthetic)
        self.assertEqual([r["kind"] for r in spec["regions"]], ["interpret"])


def _multi_db_mapping() -> dict:
    """A synthetic two-database match mirroring NPDA's shape: a visit-grain anchor
    in `clinical`, patient demographics bridged via visits.patient_ref =
    patients.nhs_number, and a foreign table (`registrations`) that does NOT carry
    the demographics key."""
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
        "criteria_bindings": [
            {"criterion_id": "sex", "source": "demographics -> patients.sex_code",
             "join_path": "visits.patient_ref -> patients.nhs_number"},
            {"criterion_id": "ward", "source": "clinical -> wards.name",
             "join_path": "visits.ward_id -> wards.id"},
        ],
        "regions": [{"id": "ALL", "sheet": "ALL"}],
        "fields": [
            {"region": "ALL", "cell": "A", "header": "Visit date", "kind": "direct",
             "sources": ["clinical -> visits.visit_date"]},
            {"region": "ALL", "cell": "B", "header": "Date of birth", "kind": "direct",
             "sources": ["demographics -> patients.date_of_birth"]},
            {"region": "ALL", "cell": "C", "header": "Diabetes type", "kind": "direct",
             "sources": ["demographics -> registrations.diabetes_type"]},
            {"region": "ALL", "cell": "D", "header": "Summary", "kind": "interpret",
             "sources": ["clinical -> notes.text",
                         "demographics -> registrations.notes"]},
        ],
    }


class CrossDatabaseCompileTest(unittest.TestCase):
    """A3: the compiler emits per-database keyed queries + the identity bridge,
    keeps cross-database joins out of the cohort SQL, and forces fields Tier 1
    cannot key to `interpret`."""

    def setUp(self):
        self.spec = build_populate_spec(_multi_db_mapping())

    def test_spec_validates(self):
        self.assertEqual(validate_populate_spec(self.spec), [])

    def test_cohort_sql_never_joins_a_foreign_database_table(self):
        cohort = self.spec["cohort"]
        self.assertEqual(cohort["database"], "clinical")
        self.assertIn("JOIN wards", cohort["from"], "same-database criterion join kept")
        self.assertNotIn("patients", cohort["from"], "cross-database join never baked in")

    def test_foreign_query_is_keyed_by_its_own_identity_column(self):
        direct = next(r for r in self.spec["regions"] if r["kind"] == "direct")
        by_db = {q["database"]: q for q in direct["queries"]}
        self.assertNotIn("key_column", by_db["clinical"], "anchor db keeps the anchor key")
        self.assertIn("visit_id IN (:cohort)", by_db["clinical"]["sql"])
        self.assertEqual(by_db["demographics"]["key_column"], "nhs_number")
        self.assertIn("nhs_number IN (:cohort)", by_db["demographics"]["sql"])
        self.assertNotIn("visit_id", by_db["demographics"]["sql"],
                         "a foreign table never pretends to carry the anchor column")

    def test_identity_bridge_is_derived(self):
        self.assertEqual(self.spec["identity_bridges"], [{
            "database": "demographics",
            "key_column": "nhs_number",
            "via": {"table": "visits", "anchor_column": "visit_id",
                    "bridge_column": "patient_ref"},
        }])

    def test_foreign_non_key_table_field_is_forced_to_interpret(self):
        direct = next(r for r in self.spec["regions"] if r["kind"] == "direct")
        interpret = next(r for r in self.spec["regions"] if r["kind"] == "interpret")
        direct_fields = {e["field"] for e in direct["cell_map"]}
        interpret_fields = {e["field"] for e in interpret["cell_map"]}
        self.assertIn("date_of_birth", direct_fields, "key-table field stays direct")
        self.assertIn("diabetes_type", interpret_fields,
                      "registrations carries no demographics key — Tier 1 cannot copy it")
        # Its evidence is likewise not mechanically fetchable: no registrations query.
        self.assertNotIn("registrations",
                         " ".join(q["sql"] for q in interpret["queries"]))

    def test_underivable_bridge_fails_loudly(self):
        mapping = _multi_db_mapping()
        # Without the visits.patient_ref key there is nothing to bridge through.
        mapping["identity"]["keys"] = [
            "clinical -> visits.visit_id",
            "demographics -> patients.nhs_number",
        ]
        with self.assertRaises(BuildError):
            build_populate_spec(mapping)

    def test_bridgeless_key_column_is_rejected_by_the_validator(self):
        spec = build_populate_spec(_multi_db_mapping())
        spec.pop("identity_bridges")
        errors = validate_populate_spec(spec)
        self.assertTrue(any("no identity bridge" in e for e in errors))


class SeedTier1PassTest(unittest.TestCase):
    """The executable runs a clean Tier-1 pass on a DB built from its own cell map."""

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        d = Path(self._dir.name)
        self.db_path = d / "cord-ph.sqlite"
        self.cohort = ["CORD-0001", "CORD-0002"]
        _build_db_from_executable(self.db_path, MAPPING["executable"], self.cohort)
        self.store = Store(d / "state.db")
        self.store.create_run(Run(id="r1", audit_id="cord-ph", status="in_progress"))
        exe = MAPPING["executable"]
        # Pre-insert the pending grid (the orchestrator's job, mirrored here so
        # try_direct UPDATEs in place — it never INSERTs).
        self.store.insert_pending_cells(
            precompute_pending_cells("r1", exe, self.cohort)
        )
        run_store = RunStore(
            self.store, "r1",
            executable=exe, cohort=self.cohort,
            database_paths={"cord-ph": self.db_path},
            audit={"fields": []},
        )
        asyncio.run(try_direct(run_store))
        self.cells = {(c.field, c.member): c for c in self.store.get_cells("r1")}

    def tearDown(self):
        self.store.close()
        self._dir.cleanup()

    def test_direct_cells_are_filled_with_provenance(self):
        # Every direct cell of every cohort member is filled, resolved_by direct,
        # carries a narrowed attempt and a self-verifying source. No cell is blocked.
        filled = [c for c in self.cells.values() if c.state == "filled"]
        self.assertGreater(len(filled), 0)
        self.assertTrue(all(c.state != "blocked" for c in self.cells.values()))
        for c in filled:
            self.assertEqual(c.resolved_by, "direct")
            self.assertTrue(c.attempts and "sql" in c.attempts[0])
            self.assertTrue(c.sources and c.sources[0]["table_column"])

    def test_code_translation_applied(self):
        # `delivery` stores text in the DB; the Tier-1 code_map translates it to a code.
        # The audit field id is sheet-prefixed (cord-pH is multi-sheet) — `all/delivery`,
        # mirroring `build_populate_spec._field_slug`'s multi-sheet convention.
        c = self.cells[("all/delivery", "CORD-0001")]
        self.assertEqual(c.state, "filled")
        self.assertEqual(c.value, "1", "DB text 'Spontaneous vaginal' → audit code 1")
        self.assertEqual(c.sources[0]["table_column"], "cord_ph_birth_records.delivery")


def _build_db_from_executable(path: Path, executable: dict, cohort: list[str]) -> None:
    """Create one table per (table, columns) the executable's direct cell maps read,
    and insert one clean row per cohort member — so Tier 1 has a clean hit everywhere.

    Tables are built purely from the executable, so this DB tracks the seed shape
    automatically. The only value we pin is the `delivery` translate column, set to a
    text the seed code map covers so the code-translation path is exercised.
    """
    anchor = executable["identity_keys"][0]
    table_cols: dict[str, set[str]] = {}
    translate_cols: set[str] = set()
    for region in executable["regions"]:
        if region["kind"] != "direct":
            continue
        for entry in region["cell_map"]:
            table_cols.setdefault(entry["table"], {anchor}).add(entry["column"])
            if entry.get("translate"):
                translate_cols.add(entry["column"])

    conn = sqlite3.connect(path)
    try:
        for table, cols in table_cols.items():
            col_defs = ", ".join(f"{c} TEXT" for c in sorted(cols))
            conn.execute(f"CREATE TABLE {table} ({col_defs})")
            ordered = sorted(cols)
            for i, member in enumerate(cohort, start=1):
                row = []
                for c in ordered:
                    if c == anchor:
                        row.append(member)
                    elif c in translate_cols:
                        row.append("Spontaneous vaginal")  # in the seed code map → "1"
                    else:
                        row.append(f"v{i}")
                placeholders = ", ".join("?" for _ in ordered)
                conn.execute(
                    f"INSERT INTO {table} ({', '.join(ordered)}) VALUES ({placeholders})",
                    row,
                )
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
