"""A5 verify: `spec.json` + `model.json` satisfy what A4 consumes.

Covers the A5 checklist (docs/mvp/BUILD-PLAN.md §A5):
  * the rebuilt seed `spec.json` validates against `audit-spec.schema.json`
    AFTER `field.id` is derived (the FK every cell's `field` resolves through);
  * every `field` referenced by the seed `mapping.json` (its compiled `executable`)
    resolves to a `fields[].id` in `spec.json` — the **A4↔A5 FK seam**;
  * the seed `mapping.json` recompiled via `fold_executable` produces the same FK
    chain (the builders agree, not just the seeds);
  * user-set state — `inclusion_criteria[].default` and a library-set `field.id` —
    survives a re-index (the regen never blows away durable user state);
  * the database-model filterable surface is correct on a synthetic cord-pH
    schema (category / number / identifier / free-text), so A4's prompt has the
    surface it needs to bind code maps and criteria.

Run: ``python3 -m core.indexing.tests.audit_database``
"""

import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

import jsonschema  # noqa: E402

from core.indexing.build_audit_spec import (  # noqa: E402
    BuilderValidationError,
    _assemble,
    merge_preserved_state,
)
from core.indexing.build_database_model import _assemble as _db_assemble  # noqa: E402
from core.indexing.build_database_model import extract_schema  # noqa: E402
from core.indexing.profile import (  # noqa: E402
    classify_column,
    readonly_connection,
    validate_against_schema,
)
from core.mapping.build_populate_spec import fold_executable  # noqa: E402
from core.slug import slugify  # noqa: E402

SEED = REPO_ROOT / "seed/audits/cord-ph"
AUDIT_SCHEMA = json.loads(
    (REPO_ROOT / "docs/mvp/contracts/audit-spec.schema.json").read_text(encoding="utf-8")
)
SEED_AUDIT = json.loads((SEED / "spec.json").read_text(encoding="utf-8"))
SEED_MAPPING = json.loads((SEED / "mapping.json").read_text(encoding="utf-8"))


class SeedAuditSpecTest(unittest.TestCase):
    """The seed `spec.json` carries every field id the seed mapping's executable
    FKs into — schemas + seeds agree."""

    def test_seed_audit_spec_validates(self):
        jsonschema.validate(SEED_AUDIT, AUDIT_SCHEMA)  # raises on failure

    def test_field_ids_are_unique(self):
        # Uniqueness is a contract invariant the JSON Schema can't enforce on
        # an object array. This test IS the enforcement; the schema's `id`
        # description points back to it.
        ids = [f["id"] for f in SEED_AUDIT["fields"]]
        self.assertEqual(len(ids), len(set(ids)), "field ids must be unique within the audit")

    def test_field_ids_follow_the_prefixed_convention(self):
        # Multi-sheet audits (cord-pH has ALL + NICU) prefix every id with the
        # sheet slug. Single-sheet audits keep bare slugs. Both halves are slug-
        # shaped through `core.slug.slugify`.
        sections = {f.get("section") for f in SEED_AUDIT["fields"] if f.get("section")}
        multi = len(sections) > 1
        for f in SEED_AUDIT["fields"]:
            fid = f["id"]
            if multi:
                self.assertIn("/", fid, f"multi-sheet audit id {fid!r} must carry a sheet prefix")
                sheet, _, body = fid.partition("/")
                self.assertEqual(sheet, slugify(sheet), f"prefix slug malformed: {sheet!r}")
                self.assertEqual(body, slugify(body), f"body slug malformed: {body!r}")
            else:
                self.assertNotIn("/", fid)
                self.assertEqual(fid, slugify(fid))

    def test_field_cell_is_bare_column_letter(self):
        # The audit's pinned shape carries no row number in `cell` (headers row 1,
        # row implicit). The schema `pattern: ^[A-Z]+$` enforces this; this test
        # holds it on the seed even when the schema is bypassed.
        for f in SEED_AUDIT["fields"]:
            cell = f.get("cell", "")
            self.assertRegex(cell, r"^[A-Z]+$", f"field {f['id']!r} cell {cell!r} must be a bare letter")


class FKSeamTest(unittest.TestCase):
    """A5-2 + the A4↔A5 end-to-end seam: the executable `cell_map[].field` set
    is in **bijection** with `audit.fields[].id` — every audit field is FK'd by
    at least one cell, AND every cell is FK'd by exactly one audit field. The
    earlier set-membership check missed the `_2`/orphan failure mode (two cells
    pointing at the same id while one id had no cell). The auto-prefix slug
    convention (`build_populate_spec._field_slug`) makes the collision class
    structurally impossible; this test holds the invariant."""

    def _all_fks(self, executable):
        return [
            entry["field"]
            for region in executable["regions"]
            for entry in region["cell_map"]
        ]

    def test_seed_bijection_audit_ids_and_cell_map_fks(self):
        audit_ids = {f["id"] for f in SEED_AUDIT["fields"]}
        fks = self._all_fks(SEED_MAPPING["executable"])
        # Every cell FK resolves into the audit.
        for fk in fks:
            self.assertIn(fk, audit_ids, f"cell FK {fk!r} not in spec.json")
        # Every audit id is FK'd by ≥1 cell (no orphan).
        orphans = audit_ids - set(fks)
        self.assertFalse(
            orphans,
            f"orphan audit ids (not FK'd by any cell): {sorted(orphans)}",
        )
        # Every cell FK'd by exactly one audit field (uniqueness is implicit but
        # state explicitly — two cells with the same FK + one orphan was the
        # original bug shape).
        from collections import Counter
        fk_counts = Counter(fks)
        # We allow multiple cells to point at the same audit field ONLY by design
        # (e.g. row_id echo in two regions). For cord-pH today every FK appears
        # exactly once; if that changes, this assert flags it for review.
        dup_fks = [fk for fk, n in fk_counts.items() if n > 1]
        self.assertFalse(
            dup_fks,
            f"multiple cell_map entries share an FK (review intent): {dup_fks}",
        )

    def test_recompiled_executable_keeps_the_same_fks(self):
        # The builders agree — not just today's seed JSON: `fold_executable`
        # recompiled from the match produces the same FK set as the committed
        # executable. Pins the A4↔A5 contract against future drift on either side.
        match = {k: v for k, v in SEED_MAPPING.items() if k != "executable"}
        recompiled = fold_executable(match)
        self.assertEqual(
            set(self._all_fks(recompiled["executable"])),
            set(self._all_fks(SEED_MAPPING["executable"])),
            "fold_executable drifted vs the committed executable FK set",
        )


class IdDerivationTest(unittest.TestCase):
    """`_assemble` (paused-but-still-tested) derives `field.id` and mirrors the
    mapping compile's prefix convention: bare slug for single-section audits,
    `{section}/{name}` for multi-section ones. Collisions raise — no `_2` suffix,
    no orphan. These tests pin the contract behavior the resumption work will
    have to honor."""

    def _spec(self, fields):
        return {
            "title": "T", "description": "d", "grain": "g",
            "sections": [], "fields": fields, "inclusion_criteria": [],
        }

    def test_single_section_ids_are_bare_slugs_from_name(self):
        model = _assemble("t", self._spec([
            {"number": 1, "name": "Patient code", "type": "text"},
            {"number": 2, "name": "Gestation (weeks)", "type": "number"},
        ]))
        self.assertEqual([f["id"] for f in model["fields"]],
                         ["patient_code", "gestation_weeks"])

    def test_multi_section_ids_are_section_prefixed(self):
        # Two sections → every id carries the section slug as a prefix. Mirrors
        # `build_populate_spec._field_slug` so the FK chain stays bijective.
        model = _assemble("t", self._spec([
            {"number": 1, "section": "ALL", "name": "Patient code", "type": "text"},
            {"number": 2, "section": "NICU", "name": "Cooled", "type": "category"},
        ]))
        self.assertEqual([f["id"] for f in model["fields"]],
                         ["all/patient_code", "nicu/cooled"])

    def test_id_collisions_raise_rather_than_suffix(self):
        # The earlier `_2`/`_3` suffix logic silently created orphan ids no
        # mapping cell FK'd into. Duplicates must surface at build time so the
        # source can be disambiguated.
        with self.assertRaises(BuilderValidationError) as cm:
            _assemble("t", self._spec([
                {"number": 1, "name": "Apgar", "type": "number"},
                {"number": 2, "name": "Apgar", "type": "number"},  # collides
            ]))
        self.assertIn("duplicate field id", str(cm.exception).lower())

    def test_empty_slug_falls_back_to_field_number(self):
        # An exotic name (CJK, punctuation) can slug to ""; the FK must still be
        # non-empty and unique.
        model = _assemble("t", self._spec([
            {"number": 7, "name": "—", "type": "text"},
        ]))
        self.assertEqual(model["fields"][0]["id"], "field_7")


class StatePreservationTest(unittest.TestCase):
    """A5-4: `inclusion_criteria[].default`, library-set `field.id`, `notes`, and
    `permitted_values` survive a re-index — the regen overwrites structure but
    never durable user state. The merge keys are stable across re-index
    (`criterion.id`, `field.number`), so a renamed name or a redrawn field list
    doesn't lose state."""

    def _build(self, prose, previous=None):
        return merge_preserved_state(_assemble("t", prose), previous)

    def test_default_survives_reindex(self):
        old = {
            "inclusion_criteria": [
                {"id": "gestation_weeks", "label": "G", "type": "number",
                 "suggested": True, "default": 37},
            ],
        }
        new = self._build(
            {"title": "T", "description": "d", "grain": "g",
             "fields": [{"number": 1, "name": "X", "type": "text"}],
             "inclusion_criteria": [
                 {"id": "gestation_weeks", "label": "G", "type": "number"},
             ]},
            previous=old,
        )
        self.assertEqual(new["inclusion_criteria"][0]["default"], 37)

    def test_library_set_field_id_survives_reindex(self):
        # The seed pattern: `name = "Mode of delivery"` (slugs to
        # "mode_of_delivery") but the library set `id = "delivery"` so executable
        # FKs already in flight stay valid. Re-index must keep "delivery".
        old = {"fields": [
            {"id": "delivery", "number": 17, "name": "Mode of delivery", "type": "category"},
        ]}
        new = self._build(
            {"title": "T", "description": "d", "grain": "g",
             "fields": [{"number": 17, "name": "Mode of delivery", "type": "category"}],
             "inclusion_criteria": []},
            previous=old,
        )
        self.assertEqual(new["fields"][0]["id"], "delivery",
                         "library-set id must survive re-index, not snap back to the slug")

    def test_notes_and_permitted_values_survive_when_regen_left_them_empty(self):
        old = {"fields": [
            {"id": "delivery", "number": 17, "name": "Mode of delivery", "type": "category",
             "notes": "library-written", "permitted_values": {"1": "SVD", "2": "CS"}},
        ]}
        new = self._build(
            {"title": "T", "description": "d", "grain": "g",
             "fields": [{"number": 17, "name": "Mode of delivery", "type": "category"}],
             "inclusion_criteria": []},
            previous=old,
        )
        f = new["fields"][0]
        self.assertEqual(f["notes"], "library-written")
        self.assertEqual(f["permitted_values"], {"1": "SVD", "2": "CS"})

    def test_regen_does_not_blow_away_a_fresh_fill(self):
        # The regen IS authoritative for any field the new spec did fill — a fresh
        # `notes` from the rebuild wins over an empty old notes.
        old = {"fields": [
            {"id": "x", "number": 1, "name": "X", "type": "text", "notes": "old"},
        ]}
        new = self._build(
            {"title": "T", "description": "d", "grain": "g",
             "fields": [{"number": 1, "name": "X", "type": "text", "notes": "fresh"}],
             "inclusion_criteria": []},
            previous=old,
        )
        self.assertEqual(new["fields"][0]["notes"], "fresh")


def _make_cordph_like_db(path: Path) -> None:
    """A small cord-pH-shaped sqlite: a birth_records table with one category
    column (delivery), one number column (gestation_weeks), one identifier
    (patient_code), and a notes table with one long-text column — enough to
    exercise the four filterable-surface verdicts the schema can return."""
    conn = sqlite3.connect(path)
    try:
        conn.executescript("""
            CREATE TABLE cord_ph_birth_records (
                patient_code TEXT,
                gestation_weeks REAL,
                delivery TEXT
            );
            CREATE TABLE clinical_notes (
                patient_code TEXT,
                text TEXT
            );
        """)
        # 12 rows so `delivery` repeats — the identifier heuristic (all-distinct +
        # n >= 3 rows) only short-circuits a category when distinct == nonempty.
        modes = ["Spontaneous vaginal", "Emergency caesarean", "Forceps", "Vacuum"]
        for i in range(12):
            conn.execute(
                "INSERT INTO cord_ph_birth_records (patient_code, gestation_weeks, delivery) "
                "VALUES (?, ?, ?)",
                (f"CORD-{i + 1:04d}", 38.0 + (i % 6) * 0.5, modes[i % 4]),
            )
        conn.execute(
            "INSERT INTO clinical_notes (patient_code, text) VALUES (?, ?)",
            ("CORD-0001", "A long narrative note documenting the delivery, with "
                          "free prose about cord around neck, resuscitation, and "
                          "the immediate postnatal course of the baby."),
        )
        conn.commit()
    finally:
        conn.close()


class FilterableSurfaceTest(unittest.TestCase):
    """A5-5: `profile.classify_column` produces the right verdict for each shape
    A4 cares about — category (with values), number (with range), identifier,
    free-text. Type-based, audit-independent (§3.2)."""

    @classmethod
    def setUpClass(cls):
        cls._dir = tempfile.TemporaryDirectory()
        cls.db_path = Path(cls._dir.name) / "cord-ph.sqlite"
        _make_cordph_like_db(cls.db_path)

    @classmethod
    def tearDownClass(cls):
        cls._dir.cleanup()

    def _classify(self, table, col, is_pk=False, is_fk=False):
        conn = readonly_connection(self.db_path)
        try:
            return classify_column(conn, table, col, is_pk=is_pk, is_fk=is_fk)
        finally:
            conn.close()

    def test_category_column_lists_its_values(self):
        v = self._classify("cord_ph_birth_records", "delivery")
        self.assertEqual(v["filterable"], True)
        self.assertEqual(v["filter_type"], "category")
        self.assertEqual(
            set(v["values"]),
            {"Spontaneous vaginal", "Emergency caesarean", "Forceps", "Vacuum"},
        )

    def test_number_column_carries_its_range(self):
        v = self._classify("cord_ph_birth_records", "gestation_weeks")
        self.assertEqual(v["filterable"], True)
        self.assertEqual(v["filter_type"], "number")
        self.assertIn("range", v)
        self.assertLess(v["range"]["min"], v["range"]["max"])

    def test_identifier_column_is_not_filterable(self):
        # `patient_code` is all-distinct AND id-named → identifier (never a category).
        v = self._classify("cord_ph_birth_records", "patient_code")
        self.assertEqual(v, {"filterable": False, "reason": "identifier"})

    def test_free_text_column_is_not_filterable(self):
        # A single long note exceeds the free-text length cap → free-text.
        v = self._classify("clinical_notes", "text")
        self.assertEqual(v, {"filterable": False, "reason": "free-text"})


DATABASE_SCHEMA = json.loads(
    (REPO_ROOT / "docs/mvp/contracts/database-model.schema.json").read_text(encoding="utf-8")
)
SEED_DB_JSON = REPO_ROOT / "seed/databases/cord-ph/model.json"
SEED_SQLITE = REPO_ROOT / "database/cord-ph/sql/cord_ph.sqlite"


def _build_seed_sqlite_if_missing() -> bool:
    """Build the cord-pH sqlite from CSVs if it isn't on disk (fresh checkout).
    Deterministic — same CSVs → same DB. Returns True if the DB is available."""
    if SEED_SQLITE.exists():
        return True
    csv_dir = REPO_ROOT / "database/cord-ph/csv"
    if not csv_dir.exists():
        return False
    # Drive `build_database` directly so the test stays single-process and
    # doesn't hijack sys.argv via the CLI's parse_args.
    from database.scripts.build_emr_db import build_database
    SEED_SQLITE.parent.mkdir(parents=True, exist_ok=True)
    build_database(csv_dirs=[csv_dir], db_path=SEED_SQLITE)
    return SEED_SQLITE.exists()


class SeedDatabaseSanityTest(unittest.TestCase):
    """The committed `seed/databases/cord-ph/model.json` is schema-valid,
    duplication-free, and re-profiles cleanly against the live sqlite (the
    deterministic surface is reproducible from the source). Smoke-tests the
    profiler against the full seed shape, not just the 2-table mini DB in
    `FilterableSurfaceTest`."""

    @classmethod
    def setUpClass(cls):
        cls._available = _build_seed_sqlite_if_missing()
        cls.committed = json.loads(SEED_DB_JSON.read_text(encoding="utf-8"))

    def test_seed_database_json_validates(self):
        jsonschema.validate(self.committed, DATABASE_SCHEMA)

    def test_no_duplicate_table_or_column_names(self):
        # Names are the structural identifiers; duplicates would silently shadow
        # in any lookup downstream (mapping prompt, code binding).
        table_names = [t["name"] for t in self.committed["tables"]]
        self.assertEqual(len(table_names), len(set(table_names)),
                         f"duplicate table names: {table_names}")
        for t in self.committed["tables"]:
            col_names = [c["name"] for c in t["columns"]]
            self.assertEqual(
                len(col_names), len(set(col_names)),
                f"duplicate columns in {t['name']!r}: {col_names}",
            )

    def test_filterable_surface_reprofiles_to_the_committed_snapshot(self):
        # The profiler is deterministic — running it against the live seed sqlite
        # must reproduce the committed `filterable`/`filter_type`/`values`/`range`/
        # `reason` for every column. Catches drift between the snapshot and the
        # profiler logic.
        if not self._available:
            self.skipTest(f"seed sqlite missing at {SEED_SQLITE}")
        schema = extract_schema(SEED_SQLITE)
        committed_by_table = {t["name"]: t for t in self.committed["tables"]}
        fk_pairs = {
            (r["from_table"], r["from_column"]) for r in schema["relationships"]
        }
        conn = readonly_connection(SEED_SQLITE)
        try:
            for table in schema["tables"]:
                committed_t = committed_by_table.get(table["name"])
                self.assertIsNotNone(
                    committed_t,
                    f"table {table['name']!r} present in sqlite but missing from committed seed",
                )
                committed_cols = {c["name"]: c for c in committed_t["columns"]}
                for col in table["columns"]:
                    cname = col["name"]
                    live = classify_column(
                        conn, table["name"], cname,
                        is_pk=col["primary_key"],
                        is_fk=(table["name"], cname) in fk_pairs,
                    )
                    committed = committed_cols.get(cname)
                    self.assertIsNotNone(
                        committed,
                        f"{table['name']}.{cname} present in sqlite but missing from committed seed",
                    )
                    # Compare the deterministic-surface keys only — description
                    # and codes are LLM/prose territory.
                    for key in ("filterable", "filter_type", "values", "range", "reason"):
                        if key in live or key in committed:
                            self.assertEqual(
                                committed.get(key), live.get(key),
                                f"{table['name']}.{cname}.{key} drifted: "
                                f"committed {committed.get(key)!r} vs live {live.get(key)!r}",
                            )
        finally:
            conn.close()


class DeterministicSurfaceTest(unittest.TestCase):
    """`build_database_model._assemble` enforces the deterministic surface by
    ORDERING: `record.update(classifications)` runs AFTER prose, so anything the
    LLM may have leaked into `filterable`/`filter_type`/`values`/`range`/`reason`
    is overwritten. This test feeds bogus values via prose and asserts they're
    ignored — the safety net for the invariant the comment in `_assemble` names."""

    def test_llm_prose_cannot_override_classifications(self):
        # One table, two columns: a real category and a real identifier.
        schema = {
            "tables": [{
                "name": "t", "row_count": 10, "columns": [
                    {"name": "mode", "type": "TEXT", "primary_key": False},
                    {"name": "id",   "type": "TEXT", "primary_key": True},
                ],
            }],
            "relationships": [],
        }
        classifications = {
            "t": {
                "mode": {"filterable": True, "filter_type": "category",
                         "values": ["a", "b"]},
                "id":   {"filterable": False, "reason": "identifier"},
            },
        }
        # The LLM tries to lie: claim the identifier is a filterable number, and
        # the category is something it isn't. The deterministic surface must win.
        prose = {
            "title": "T", "description": "d",
            "tables": [{
                "name": "t", "description": "T table",
                "columns": [
                    {"name": "mode", "description": "mode-desc",
                     "filterable": False, "reason": "free-text"},
                    {"name": "id", "description": "id-desc",
                     "filterable": True, "filter_type": "number",
                     "range": {"min": 0, "max": 99}},
                ],
            }],
        }
        model = _db_assemble("test", schema, classifications, prose)
        cols = {c["name"]: c for c in model["tables"][0]["columns"]}
        # `mode`: deterministic says category; the LLM's "free-text" must be wiped.
        self.assertEqual(cols["mode"]["filterable"], True)
        self.assertEqual(cols["mode"]["filter_type"], "category")
        self.assertNotIn("reason", cols["mode"])
        # `id`: deterministic says identifier; the LLM's "number" + range wiped.
        self.assertEqual(cols["id"]["filterable"], False)
        self.assertEqual(cols["id"]["reason"], "identifier")
        self.assertNotIn("filter_type", cols["id"])
        self.assertNotIn("range", cols["id"])
        # `description` IS the LLM's contribution — that one comes through.
        self.assertEqual(cols["mode"]["description"], "mode-desc")
        self.assertEqual(cols["id"]["description"], "id-desc")


if __name__ == "__main__":
    unittest.main(verbosity=2)
