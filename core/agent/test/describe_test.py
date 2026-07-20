"""Verify `describe_execute` — the navigate structure-plus-meaning read.

`describe` returns one OR MORE named tables' columns, types, and code sets
in a single batched call (each table qualified by its database, so one call can
span databases). It is the ONLY navigate tool that touches the live database:
column NAMES + TYPES are read LIVE from SQLite (zero drift); the code-set meanings
(and the column/table descriptions, the grain) come from ``model.json``. It
COMPOSES both — joining the model's meaning onto the live column list by name.

It is read-only and local-only: it opens the clinical SQLite ONLY through the
read-only helper, never writes, never injects a cohort, and returns table
STRUCTURE — never clinical row/cell values.

Each call runs ``describe.py`` as a subprocess with cwd set to a temp run
worktree holding ``database/<slug>.model.json`` + ``database/<slug>.sqlite`` — the
same shape ``sql_execute_test.py`` / ``search_test.py`` use, but built from the
REAL seeded fixtures (``cd intero && make seed``) so the assertions pin concrete
clinical strings (live ``TEXT`` types, real model codes), not hand-authored
stand-ins. One small class uses a synthetic fixture to prove the live-only-column
case (a column present in SQLite but absent from the model).

Run: ``python3 -m core.agent.test.describe_test`` (from intero/).
"""

import json
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
TOOLS = REPO_ROOT / "core" / "agent" / "tools"
SEEDED = REPO_ROOT / "var" / "databases"


def _seeded(slug: str) -> tuple[Path, Path]:
    model = SEEDED / slug / "model.json"
    sqlite = (SEEDED / slug / "database.sqlite").resolve()
    if not model.is_file() or not sqlite.is_file():
        raise unittest.SkipTest(
            f"seeded fixture missing for {slug!r} — run `cd intero && make seed` first"
        )
    return model, sqlite


def _describe(worktree: Path, request: dict) -> dict:
    proc = subprocess.run(
        [sys.executable, str(TOOLS / "describe.py"), json.dumps(request)],
        capture_output=True,
        text=True,
        cwd=worktree,
    )
    return json.loads(proc.stdout.strip() or proc.stderr.strip())


class DescribeTableSeededTest(unittest.TestCase):
    """Bind the real seeded cord-ph + npda-clinical fixtures and describe them."""

    BOUND = ("cord-ph", "npda-clinical")

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        db_dir = self.worktree / "databases"
        db_dir.mkdir()
        for slug in self.BOUND:
            model, sqlite = _seeded(slug)
            shutil.copyfile(model, db_dir / f"{slug}.model.json")
            (db_dir / f"{slug}.sqlite").symlink_to(sqlite)

    def tearDown(self):
        self._dir.cleanup()

    def _describe(self, request: dict) -> dict:
        return _describe(self.worktree, request)

    # --- a single table: live columns+types composed with model codes ---------

    def test_single_coded_table_composes_live_type_and_model_codes(self):
        res = self._describe(
            {"tables": [{"database": "cord-ph", "table": "clinical_notes"}]}
        )
        self.assertTrue(res["ok"], res)
        self.assertEqual(len(res["tables"]), 1)
        table = res["tables"][0]
        self.assertEqual(table["database"], "cord-ph")
        self.assertEqual(table["table"], "clinical_notes")
        self.assertEqual(table["grain"], "one row per entity")

        by_name = {c["name"]: c for c in table["columns"]}
        # `note_type` is a coded column in the model. Its TYPE must be the LIVE
        # SQLite type (uppercase TEXT) — proving structure is read live — while
        # its CODES must be the model's code -> meaning map.
        note_type = by_name["note_type"]
        self.assertEqual(note_type["type"], "TEXT")
        self.assertEqual(
            note_type["codes"]["nicu_admission"],
            "Admission note for the neonatal intensive care unit",
        )
        self.assertEqual(
            note_type["description"],
            "Kind of clinical note, distinguishing birth summary, NICU admission and ongoing NICU progress notes.",
        )
        # The internal _row_id is an INTEGER live — composed type, no codes.
        self.assertEqual(by_name["_row_id"]["type"], "INTEGER")
        self.assertIsNone(by_name["_row_id"].get("codes"))

    def test_columns_are_in_live_definition_order(self):
        res = self._describe(
            {"tables": [{"database": "cord-ph", "table": "cord_ph_birth_records"}]}
        )
        names = [c["name"] for c in res["tables"][0]["columns"]]
        live = sqlite3.connect(
            f"file:{(SEEDED / 'cord-ph' / 'database.sqlite').resolve()}?mode=ro",
            uri=True,
        )
        try:
            expected = [
                r[1] for r in live.execute("PRAGMA table_info('cord_ph_birth_records')")
            ]
        finally:
            live.close()
        self.assertEqual(names, expected)

    # --- a coded column's meanings are all present ----------------------------

    def test_coded_column_returns_all_code_meanings(self):
        res = self._describe(
            {"tables": [{"database": "cord-ph", "table": "clinical_notes"}]}
        )
        note_type = next(
            c for c in res["tables"][0]["columns"] if c["name"] == "note_type"
        )
        self.assertEqual(
            note_type["codes"],
            {
                "birth_summary": "Summary of the birth event",
                "nicu_admission": "Admission note for the neonatal intensive care unit",
                "nicu_progress": "Ongoing progress note during NICU stay",
            },
        )

    # --- a multi-table batch spanning TWO databases in one call ---------------

    def test_batch_spans_two_databases_in_request_order(self):
        res = self._describe(
            {
                "tables": [
                    {"database": "npda-clinical", "table": "clinic_visits"},
                    {"database": "cord-ph", "table": "patients"},
                ]
            }
        )
        self.assertTrue(res["ok"], res)
        self.assertEqual(
            [(t["database"], t["table"]) for t in res["tables"]],
            [("npda-clinical", "clinic_visits"), ("cord-ph", "patients")],
        )
        # Both carry live columns; the npda one carries its model codes too.
        visit = res["tables"][0]
        coded = next(c for c in visit["columns"] if c["name"] == "visit_type")
        self.assertTrue(coded["codes"], coded)

    def test_same_table_requested_twice_appears_twice(self):
        res = self._describe(
            {
                "tables": [
                    {"database": "cord-ph", "table": "patients"},
                    {"database": "cord-ph", "table": "patients"},
                ]
            }
        )
        self.assertTrue(res["ok"], res)
        self.assertEqual(len(res["tables"]), 2)

    # --- the optional `collection` arg: "databases" == the default -----------

    def test_explicit_databases_collection_matches_default(self):
        # `describe` accepts an optional `collection`; "databases" (and the
        # default) read the bound databases identically (navigation.md).
        request = {"tables": [{"database": "cord-ph", "table": "patients"}]}
        default = self._describe(request)
        explicit = self._describe({**request, "collection": "databases"})
        self.assertEqual(json.dumps(explicit), json.dumps(default))

    def test_unknown_collection_is_actionable_error_exit_2(self):
        # An unknown collection is the {"ok": false, "error": …} contract at exit
        # 2, naming the valid collections — never a silent read of the default.
        proc = subprocess.run(
            [
                sys.executable,
                str(TOOLS / "describe.py"),
                json.dumps(
                    {
                        "collection": "no-such",
                        "tables": [{"database": "cord-ph", "table": "patients"}],
                    }
                ),
            ],
            capture_output=True,
            text=True,
            cwd=self.worktree,
        )
        self.assertEqual(proc.returncode, 2, proc.stderr)
        res = json.loads(proc.stdout.strip() or proc.stderr.strip())
        self.assertFalse(res["ok"], res)
        self.assertIn("no-such", res["error"])
        self.assertIn("databases", res["error"])

    # --- read-only: never returns row data ------------------------------------

    def test_response_carries_no_row_values(self):
        res = self._describe({"tables": [{"database": "cord-ph", "table": "patients"}]})
        self.assertTrue(res["ok"], res)
        blob = json.dumps(res)
        # `cells` / `rows` are the row-data keys sql_execute returns; structure
        # reads must never carry them.
        self.assertNotIn('"rows"', blob)
        self.assertNotIn('"cells"', blob)

    # --- validation: unknown database / table are ToolErrors ------------------

    def test_unknown_database_errors_and_lists_bound_databases(self):
        res = self._describe(
            {"tables": [{"database": "no-such-db", "table": "patients"}]}
        )
        self.assertFalse(res["ok"], res)
        self.assertIn("no-such-db", res["error"])
        # The bound databases are named so the agent can correct itself.
        self.assertIn("cord-ph", res["error"])

    def test_unknown_table_errors_and_lists_available_tables(self):
        res = self._describe(
            {"tables": [{"database": "cord-ph", "table": "no_such_table"}]}
        )
        self.assertFalse(res["ok"], res)
        self.assertIn("no_such_table", res["error"])
        # Mirror lookup.py's table-miss: the database's real table names.
        self.assertIn("cord_ph_birth_records", res["error"])

    # --- validation: empty / missing / malformed `tables` are ToolErrors ------

    def test_empty_tables_is_a_tool_error(self):
        res = self._describe({"tables": []})
        self.assertFalse(res["ok"], res)
        self.assertIn("tables", res["error"])

    def test_missing_tables_is_a_tool_error(self):
        res = self._describe({})
        self.assertFalse(res["ok"], res)
        self.assertIn("tables", res["error"])

    def test_entry_missing_table_is_a_tool_error(self):
        res = self._describe({"tables": [{"database": "cord-ph"}]})
        self.assertFalse(res["ok"], res)

    def test_entry_missing_database_is_a_tool_error(self):
        res = self._describe({"tables": [{"table": "patients"}]})
        self.assertFalse(res["ok"], res)


class DescribeColumnSeededTest(unittest.TestCase):
    """A leaf path naming a single column (``{database, table, column}``) reads
    just THAT column — its live type, plus the model's description + codes — never
    the rest of the table (navigation.md: ``describe`` reads a node at table OR
    column depth). Pinned on the real seeded cord-ph fixture."""

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        db_dir = self.worktree / "databases"
        db_dir.mkdir()
        model, sqlite = _seeded("cord-ph")
        shutil.copyfile(model, db_dir / "cord-ph.model.json")
        (db_dir / "cord-ph.sqlite").symlink_to(sqlite)

    def tearDown(self):
        self._dir.cleanup()

    def _describe(self, request: dict) -> dict:
        return _describe(self.worktree, request)

    def test_single_coded_column_returns_only_that_column(self):
        # A leaf path (database+table+column) returns ONLY that column — its path,
        # live type, model description + codes — not the rest of the table.
        res = self._describe(
            {
                "tables": [
                    {
                        "database": "cord-ph",
                        "table": "clinical_notes",
                        "column": "note_type",
                    }
                ]
            }
        )
        self.assertTrue(res["ok"], res)
        self.assertEqual(len(res["tables"]), 1)
        node = res["tables"][0]
        # The node is located: it carries its full path.
        self.assertEqual(node["database"], "cord-ph")
        self.assertEqual(node["table"], "clinical_notes")
        self.assertEqual(node["column"], "note_type")
        # It is the column itself — live type, model description + codes.
        self.assertEqual(node["type"], "TEXT")
        self.assertEqual(
            node["description"],
            "Kind of clinical note, distinguishing birth summary, NICU admission and ongoing NICU progress notes.",
        )
        self.assertEqual(
            node["codes"]["nicu_admission"],
            "Admission note for the neonatal intensive care unit",
        )
        # It is ONLY the one column — the whole-table keys are absent.
        self.assertNotIn("columns", node)
        self.assertNotIn("grain", node)
        # The leaf node matches its documented shape exactly: the column is located
        # by `column` (not a redundant `name`), then its value fields.
        self.assertNotIn("name", node)
        self.assertEqual(
            set(node), {"database", "table", "column", "type", "description", "codes"}
        )

    def test_unknown_column_in_known_table_errors_and_lists_columns(self):
        # An unknown column in a KNOWN table is the {"ok": false, "error": …}
        # contract at exit 2, listing the table's real columns so the agent can
        # self-correct — mirroring the unknown-table miss.
        proc = subprocess.run(
            [
                sys.executable,
                str(TOOLS / "describe.py"),
                json.dumps(
                    {
                        "tables": [
                            {
                                "database": "cord-ph",
                                "table": "cord_ph_birth_records",
                                "column": "no_such_column",
                            }
                        ]
                    }
                ),
            ],
            capture_output=True,
            text=True,
            cwd=self.worktree,
        )
        self.assertEqual(proc.returncode, 2, proc.stderr)
        res = json.loads(proc.stdout.strip() or proc.stderr.strip())
        self.assertFalse(res["ok"], res)
        self.assertIn("no_such_column", res["error"])
        # A real column of the table is named so the agent can correct itself.
        self.assertIn("patient_code", res["error"])

    def test_single_uncoded_column_omits_codes(self):
        # A non-coded column reads its live type with NO `codes` key — the same
        # codes-omitted shape the whole-table form uses, at column depth.
        res = self._describe(
            {
                "tables": [
                    {
                        "database": "cord-ph",
                        "table": "clinical_notes",
                        "column": "text",
                    }
                ]
            }
        )
        self.assertTrue(res["ok"], res)
        node = res["tables"][0]
        self.assertEqual(node["column"], "text")
        self.assertEqual(node["type"], "TEXT")
        self.assertIsNotNone(node["description"])
        self.assertNotIn("codes", node)

    def test_column_path_without_table_is_a_tool_error(self):
        # A column cannot be reached past a non-describable database: a leaf path
        # missing `table` is still the table-required error — the column path adds
        # depth but never makes a database (or a tableless path) describable.
        res = self._describe({"tables": [{"database": "cord-ph", "column": "text"}]})
        self.assertFalse(res["ok"], res)
        self.assertIn("table", res["error"])


class DescribeTableLiveOnlyColumnTest(unittest.TestCase):
    """A column present LIVE in SQLite but ABSENT from the model gets
    description: null and no codes — live SQLite is the structural truth, the
    model only joins meaning where it has it. Built on a synthetic fixture
    because the seeded models match their SQLite exactly (no drift)."""

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        db_dir = self.worktree / "databases"
        db_dir.mkdir()
        # Live SQLite carries `extra_col`; the model below omits it.
        sqlite_path = self.worktree / "src.sqlite"
        conn = sqlite3.connect(sqlite_path)
        conn.execute("CREATE TABLE widgets (id INTEGER, status TEXT, extra_col TEXT)")
        conn.commit()
        conn.close()
        (db_dir / "demo.sqlite").symlink_to(sqlite_path.resolve())
        (db_dir / "demo.model.json").write_text(
            json.dumps(
                {
                    "database": "demo",
                    "tables": [
                        {
                            "name": "widgets",
                            "grain": "one row per widget",
                            "description": "Demo widgets.",
                            "columns": [
                                {
                                    "name": "id",
                                    "type": "integer",
                                    "description": "The id.",
                                },
                                {
                                    "name": "status",
                                    "type": "text",
                                    "description": "Lifecycle status.",
                                    "codes": {"A": "Active", "X": "Retired"},
                                },
                            ],
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )

    def tearDown(self):
        self._dir.cleanup()

    def test_live_only_column_has_null_description_and_no_codes(self):
        res = _describe(
            self.worktree, {"tables": [{"database": "demo", "table": "widgets"}]}
        )
        self.assertTrue(res["ok"], res)
        by_name = {c["name"]: c for c in res["tables"][0]["columns"]}
        # `extra_col` is live-only: listed (live is structural truth), but with no
        # model meaning.
        self.assertIn("extra_col", by_name)
        self.assertIsNone(by_name["extra_col"]["description"])
        self.assertIsNone(by_name["extra_col"].get("codes"))
        # The modelled column still composes its meaning.
        self.assertEqual(by_name["status"]["description"], "Lifecycle status.")
        self.assertEqual(by_name["status"]["codes"], {"A": "Active", "X": "Retired"})

    def test_meaning_joins_case_insensitively_on_column_name(self):
        # The model column name case need not match SQLite's exactly; meaning
        # still joins by name, case-insensitive.
        (self.worktree / "databases" / "demo.model.json").write_text(
            json.dumps(
                {
                    "database": "demo",
                    "tables": [
                        {
                            "name": "widgets",
                            "description": "Demo.",
                            "columns": [
                                {
                                    "name": "STATUS",
                                    "type": "text",
                                    "description": "Upper-cased in model.",
                                },
                            ],
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        res = _describe(
            self.worktree, {"tables": [{"database": "demo", "table": "widgets"}]}
        )
        self.assertTrue(res["ok"], res)
        status = next(c for c in res["tables"][0]["columns"] if c["name"] == "status")
        self.assertEqual(status["description"], "Upper-cased in model.")

    def test_column_leaf_resolves_case_insensitively_to_live_name(self):
        # A column requested in a different case resolves to the LIVE column name
        # and joins the model's meaning — the same case-insensitive rule the
        # whole-table form uses, at column depth.
        res = _describe(
            self.worktree,
            {"tables": [{"database": "demo", "table": "widgets", "column": "STATUS"}]},
        )
        self.assertTrue(res["ok"], res)
        node = res["tables"][0]
        self.assertEqual(node["column"], "status")  # echoed in live casing
        self.assertEqual(node["description"], "Lifecycle status.")
        self.assertEqual(node["codes"], {"A": "Active", "X": "Retired"})

    def test_live_only_column_leaf_has_null_description_and_no_codes(self):
        # A leaf path naming a live-only column (present in SQLite, absent from the
        # model) is describable — live is the structural truth — with null meaning.
        res = _describe(
            self.worktree,
            {
                "tables": [
                    {"database": "demo", "table": "widgets", "column": "extra_col"}
                ]
            },
        )
        self.assertTrue(res["ok"], res)
        node = res["tables"][0]
        self.assertEqual(node["column"], "extra_col")
        self.assertIsNone(node["description"])
        self.assertNotIn("codes", node)


class DescribeTableMissingOrCorruptSqliteTest(unittest.TestCase):
    """The model and the live ``.sqlite`` are independent artifacts: the run
    provisions the model copy and the sqlite symlink separately, and tolerates a
    present model with an absent/broken DB. So the model can validate the table
    while ``database/<slug>.sqlite`` is missing or corrupt. The live read must
    then return the ``{"ok": false, "error": …}`` contract every other failure
    honors — never a raw SQLite traceback the agent cannot self-correct from.

    Built on a synthetic fixture: the model below validates ``widgets``, but this
    class controls the ``.sqlite`` itself (absent in one case, garbage in the
    other)."""

    MODEL = {
        "database": "demo",
        "tables": [
            {
                "name": "widgets",
                "grain": "one row per widget",
                "description": "Demo widgets.",
                "columns": [
                    {"name": "id", "type": "integer", "description": "The id."},
                ],
            }
        ],
    }

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        self.db_dir = self.worktree / "databases"
        self.db_dir.mkdir()
        # The model is present and validates the table — only the live DB varies.
        (self.db_dir / "demo.model.json").write_text(
            json.dumps(self.MODEL), encoding="utf-8"
        )

    def tearDown(self):
        self._dir.cleanup()

    def test_missing_sqlite_returns_error_not_a_crash(self):
        # No `demo.sqlite` written at all: the model validates `widgets`, but the
        # live read opens a file that does not exist.
        self.assertFalse((self.db_dir / "demo.sqlite").exists())
        res = _describe(
            self.worktree, {"tables": [{"database": "demo", "table": "widgets"}]}
        )
        self.assertFalse(res["ok"], res)
        self.assertTrue(res["error"], res)

    def test_corrupt_sqlite_returns_error_not_a_crash(self):
        # A `demo.sqlite` that is not a valid SQLite database: opening succeeds in
        # `mode=ro`, but the PRAGMA read raises a DatabaseError.
        (self.db_dir / "demo.sqlite").write_bytes(b"this is not a sqlite database")
        res = _describe(
            self.worktree, {"tables": [{"database": "demo", "table": "widgets"}]}
        )
        self.assertFalse(res["ok"], res)
        self.assertTrue(res["error"], res)


if __name__ == "__main__":
    unittest.main(verbosity=2)
