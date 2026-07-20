"""Unit tests for the table object: mint, persist, reload, list, delete + the
spec-snapshot / reporting-period helpers.

A table owns table-population state (Q36); its METADATA is transactional state
and lives as a row in the state store (storage-layout §3 — the cells were
already there), not as a per-table JSON file. Every persisted table is
validated against table.schema.json — a malformed table is never written.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from core.contracts import validate_against_schema
from core.tables import store as table_store


class NewTableTest(unittest.TestCase):
    def test_new_table_is_schema_valid_and_minted(self):
        table = table_store.new_table(
            title="Term NICU audit",
            source_template="cord-ph",
        )
        self.assertTrue(table["id"].startswith("table-"))
        self.assertEqual(table["schema_version"], "1")
        self.assertEqual(table["status"], "queued")
        self.assertIsNone(table["table_population_id"])
        self.assertEqual(validate_against_schema(table, "table.schema.json"), [])

    def test_new_table_carries_optional_fields(self):
        table = table_store.new_table(
            title="Term NICU audit",
            source_template="cord-ph",
            description="A description",
            dataset_id="dataset-abc",
            scope_disclosure="the term NICU slice",
            spec={"columns": [{"id": "c1", "name": "Col"}], "grain": "one row"},
            thread_id="thread-xyz",
            reporting_period_label="2026",
        )
        self.assertEqual(table["dataset_id"], "dataset-abc")
        self.assertEqual(table["thread_id"], "thread-xyz")
        self.assertEqual(table["spec"]["grain"], "one row")
        self.assertEqual(validate_against_schema(table, "table.schema.json"), [])


class PersistenceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmpdir.name) / "state.db"

    def tearDown(self) -> None:
        self.tmpdir.cleanup()

    def test_save_then_load_round_trips(self):
        table = table_store.new_table(title="T", source_template="cord-ph")
        table_store.save_table(table, db_path=self.db_path)
        reloaded = table_store.load_table(table["id"], db_path=self.db_path)
        self.assertEqual(reloaded, table)

    def test_save_updates_an_existing_table_in_place(self):
        table = table_store.new_table(title="T", source_template="cord-ph")
        table_store.save_table(table, db_path=self.db_path)
        table["status"] = "complete"
        table_store.save_table(table, db_path=self.db_path)
        reloaded = table_store.load_table(table["id"], db_path=self.db_path)
        self.assertEqual(reloaded["status"], "complete")
        self.assertEqual(len(table_store.list_summaries(db_path=self.db_path)), 1)

    def test_save_rejects_a_malformed_table(self):
        table = table_store.new_table(title="T", source_template="cord-ph")
        del table["status"]  # required by the schema
        with self.assertRaises(table_store.TableError):
            table_store.save_table(table, db_path=self.db_path)

    def test_load_missing_table_raises(self):
        with self.assertRaises(table_store.TableError):
            table_store.load_table("table-nope", db_path=self.db_path)

    def test_list_summaries_is_recency_ordered(self):
        first = table_store.new_table(title="First", source_template="cord-ph")
        first["updated_at"] = "2026-01-01T00:00:00+00:00"
        second = table_store.new_table(title="Second", source_template="cord-ph")
        second["updated_at"] = "2026-02-01T00:00:00+00:00"
        table_store.save_table(first, db_path=self.db_path)
        table_store.save_table(second, db_path=self.db_path)
        summaries = table_store.list_summaries(db_path=self.db_path)
        self.assertEqual([s["id"] for s in summaries], [second["id"], first["id"]])
        # Summary carries the list-card fields.
        self.assertEqual(
            set(summaries[0].keys()),
            {
                "id",
                "title",
                "description",
                "source_template",
                "reporting_period_label",
                "status",
                "updated_at",
            },
        )

    def test_a_broken_row_is_skipped_never_listed(self):
        table = table_store.new_table(title="T", source_template="cord-ph")
        table_store.save_table(table, db_path=self.db_path)
        import sqlite3

        conn = sqlite3.connect(self.db_path)
        try:
            with conn:
                conn.execute(
                    "INSERT INTO tables (id, updated_at, payload) VALUES (?, ?, ?)",
                    ("table-broken", "2099-01-01T00:00:00+00:00", "{not json"),
                )
        finally:
            conn.close()
        summaries = table_store.list_summaries(db_path=self.db_path)
        self.assertEqual([s["id"] for s in summaries], [table["id"]])

    def test_table_for_population_id_resolves_the_owning_table(self):
        owner = table_store.new_table(
            title="Owner",
            source_template="cord-ph",
            table_population_id="run-owned-1",
        )
        other = table_store.new_table(title="Other", source_template="cord-ph")
        table_store.save_table(owner, db_path=self.db_path)
        table_store.save_table(other, db_path=self.db_path)
        found = table_store.table_for_population_id("run-owned-1", db_path=self.db_path)
        self.assertEqual(found, owner)
        # No table wraps this population (a table-less legacy run) → None,
        # never a raise. Empty id short-circuits too (an ad-hoc table's
        # table_population_id is null — it must never match "").
        self.assertIsNone(
            table_store.table_for_population_id("run-unowned", db_path=self.db_path)
        )
        self.assertIsNone(table_store.table_for_population_id("", db_path=self.db_path))

    def test_delete_removes_the_row(self):
        table = table_store.new_table(title="T", source_template="cord-ph")
        table_store.save_table(table, db_path=self.db_path)
        table_store.delete_table(table["id"], db_path=self.db_path)
        with self.assertRaises(table_store.TableError):
            table_store.load_table(table["id"], db_path=self.db_path)
        self.assertEqual(table_store.list_table_ids(db_path=self.db_path), [])

    def test_delete_missing_table_raises(self):
        with self.assertRaises(table_store.TableError):
            table_store.delete_table("table-nope", db_path=self.db_path)


class LegacyImportTest(unittest.TestCase):
    """One-time forward migration: pre-migration ``var/tables/<id>/table.json``
    files are adopted into the state store at startup — never overwriting a row
    the store already holds, never importing a broken or mismatched file."""

    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmpdir.name)
        self.db_path = self.tmp_path / "state.db"
        self.legacy_dir = self.tmp_path / "tables"
        self.legacy_dir.mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        self.tmpdir.cleanup()

    def _write_legacy(self, table: dict) -> None:
        d = self.legacy_dir / table["id"]
        d.mkdir(parents=True, exist_ok=True)
        import json as _json

        (d / "table.json").write_text(_json.dumps(table), encoding="utf-8")

    def test_imports_legacy_files_and_is_idempotent(self) -> None:
        table = table_store.new_table(title="Legacy", source_template="cord-ph")
        self._write_legacy(table)
        (self.legacy_dir / "table-broken").mkdir()
        (self.legacy_dir / "table-broken" / "table.json").write_text(
            "{not json", encoding="utf-8"
        )
        imported = table_store.import_legacy_table_files(
            legacy_tables_dir=self.legacy_dir, db_path=self.db_path
        )
        self.assertEqual(imported, 1)
        self.assertEqual(
            table_store.load_table(table["id"], db_path=self.db_path)["title"],
            "Legacy",
        )
        again = table_store.import_legacy_table_files(
            legacy_tables_dir=self.legacy_dir, db_path=self.db_path
        )
        self.assertEqual(again, 0)

    def test_never_overwrites_an_existing_store_row(self) -> None:
        table = table_store.new_table(title="Store wins", source_template="cord-ph")
        table_store.save_table(table, db_path=self.db_path)
        stale = dict(table, title="Stale legacy file")
        self._write_legacy(stale)
        imported = table_store.import_legacy_table_files(
            legacy_tables_dir=self.legacy_dir, db_path=self.db_path
        )
        self.assertEqual(imported, 0)
        self.assertEqual(
            table_store.load_table(table["id"], db_path=self.db_path)["title"],
            "Store wins",
        )


class SpecSnapshotTest(unittest.TestCase):
    def test_derives_minimal_columns_and_grain_from_template_spec(self):
        template = {
            "grain": "one row per patient record",
            "fields": [
                {
                    "id": "all/patient_code",
                    "name": "Patient code",
                    "notes": "Unique id",
                },
                {"id": "all/gestation_weeks", "name": "Gestation (weeks)"},
            ],
        }
        spec = table_store.spec_snapshot_from_template(template)
        self.assertEqual(spec["grain"], "one row per patient record")
        self.assertEqual(len(spec["columns"]), 2)
        self.assertEqual(spec["columns"][0]["id"], "all/patient_code")
        self.assertEqual(spec["columns"][0]["name"], "Patient code")
        self.assertEqual(spec["columns"][0]["description"], "Unique id")
        # Snapshot is schema-valid embedded in a table.
        table = table_store.new_table(title="T", source_template="cord-ph", spec=spec)
        self.assertEqual(validate_against_schema(table, "table.schema.json"), [])


if __name__ == "__main__":
    unittest.main()
