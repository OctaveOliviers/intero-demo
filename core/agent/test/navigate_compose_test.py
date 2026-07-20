"""Verify the navigate tools COMPOSE — the ``search -> join-paths ->
describe`` loop reaches a value in a non-anchor, cross-database table
WITHOUT a whole-schema dump.

The "Done when" condition for navigate: an agent that only knows a keyword can
reach a value living in a *non-anchor* table of a *different* database than the
anchor — by chaining the four tools, never by dumping every table:

  1. ``search`` a real keyword -> a candidate ``database.table.column`` (the way
     IN). It returns ONLY the matching candidates, not every table.
  2. ``join_paths`` from the ANCHOR table -> the neighbour set, which INCLUDES
     that cross-DB table via a measured ``identity_link`` carrying the
     ``from_column``/``to_column`` to join on. The path to the value is
     DISCOVERED, not guessed — and only neighbours come back, not a schema.
  3. ``describe`` that one neighbour -> its live columns + types + meaning,
     with the keyword-matched column present and NO row/cell values.

Each tool runs as a subprocess (the house pattern in ``search_test.py`` /
``describe_test.py``) with cwd a temp run worktree holding
``database/<slug>.model.json`` (+ ``database/<slug>.sqlite`` symlinked from the
seeded ``var/`` for the live describe read). The worktree binds BOTH npda
databases so the chain crosses a database boundary; the assertions pin concrete
seeded strings (``cd intero && make seed``), not stand-ins.

The cross-DB anchor is ``npda-demographics.patients`` (carries ``nhs_number``);
the target is the non-anchor ``npda-clinical.measurements`` table, linked back to
``patients.nhs_number`` by a measured identity link on ``measurements.patient_ref``.
A second, simpler class proves the same loop WITHIN one database on cord-ph
(``cord_ph_birth_records`` -> ``encounters`` by foreign key).

Run: ``python3 -m core.agent.test.navigate_compose_test`` (from intero/).
"""

import json
import shutil
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


def _run(tool: str, worktree: Path, request: dict) -> dict:
    proc = subprocess.run(
        [sys.executable, str(TOOLS / tool), json.dumps(request)],
        capture_output=True,
        text=True,
        cwd=worktree,
    )
    return json.loads(proc.stdout.strip() or proc.stderr.strip())


class _BoundWorktree(unittest.TestCase):
    """Bind the given seeded models (+ symlinked SQLite) into a temp worktree."""

    BOUND: tuple[str, ...] = ()

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

    def _search(self, query: str) -> dict:
        return _run("search.py", self.worktree, {"query": query})

    def _join_paths(self, database: str, table: str) -> dict:
        return _run(
            "join_paths.py", self.worktree, {"database": database, "table": table}
        )

    def _describe(self, database: str, table: str) -> dict:
        return _run(
            "describe.py",
            self.worktree,
            {"tables": [{"database": database, "table": table}]},
        )


class NavigateDbComposesCrossDatabaseTest(_BoundWorktree):
    """The full loop reaching a value in a NON-ANCHOR, CROSS-DATABASE table.

    Anchor: ``npda-demographics.patients`` (carries ``nhs_number``).
    Target: ``npda-clinical.measurements`` — a non-anchor table in a *different*
    database, linked back to ``patients.nhs_number`` by a measured identity link
    on ``measurements.patient_ref``. The HbA1c value table population needs lives
    here (``measurement_type``/``value``/``units``), and "hba1c" is a real token
    in those columns' model descriptions.
    """

    BOUND = ("npda-demographics", "npda-clinical")

    KEYWORD = "hba1c"
    ANCHOR_DB = "npda-demographics"
    ANCHOR_TABLE = "patients"
    ANCHOR_KEY = "nhs_number"
    TARGET_DB = "npda-clinical"
    TARGET_TABLE = "measurements"
    TARGET_FK = "patient_ref"
    MATCHED_COLUMN = "measurement_type"

    # --- step 1: search is the way IN — candidates only, not every table ------

    def test_step1_search_surfaces_only_matching_cross_db_candidates(self):
        res = self._search(self.KEYWORD)
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["match_count"], len(res["matches"]))
        self.assertGreater(res["match_count"], 0, res)

        # The keyword reaches the cross-DB, non-anchor table's matched column.
        hit = next(
            (
                m
                for m in res["matches"]
                if m["database"] == self.TARGET_DB
                and m["table"] == self.TARGET_TABLE
                and m["column"] == self.MATCHED_COLUMN
            ),
            None,
        )
        self.assertIsNotNone(hit, res["matches"])
        self.assertEqual(hit["matched_on"], "column_description")
        self.assertIn(self.KEYWORD, hit["context"].lower())

        # search returns ONLY matching candidates — every match is on the target
        # table, NOT a dump of all bound tables. The anchor `patients` table (no
        # "hba1c" anywhere) is absent, and no row of the npda-demographics db is
        # returned at all.
        for m in res["matches"]:
            self.assertEqual(
                (m["database"], m["table"]), (self.TARGET_DB, self.TARGET_TABLE), m
            )
        self.assertNotIn(
            self.ANCHOR_DB, {m["database"] for m in res["matches"]}, res["matches"]
        )

    # --- step 2: join_paths makes the path to the value DISCOVERABLE ----------

    def test_step2_join_paths_from_anchor_reaches_target_via_identity_link(self):
        res = self._join_paths(self.ANCHOR_DB, self.ANCHOR_TABLE)
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["database"], self.ANCHOR_DB)
        self.assertEqual(res["table"], self.ANCHOR_TABLE)

        # The neighbour set INCLUDES the cross-DB target via a measured identity
        # link, carrying the columns to join on — the path is discovered, not
        # guessed. (search told us WHERE the value is; join_paths tells us HOW to
        # reach it from the anchor.)
        edge = next(
            (
                n
                for n in res["neighbours"]
                if n["database"] == self.TARGET_DB and n["table"] == self.TARGET_TABLE
            ),
            None,
        )
        self.assertIsNotNone(edge, res["neighbours"])
        self.assertEqual(edge["via"], "identity_link")
        self.assertEqual(edge["from_column"], self.ANCHOR_KEY)
        self.assertEqual(edge["to_column"], self.TARGET_FK)

        # It returns ONLY neighbours — no `tables`/`columns` schema dump. The
        # anchor reaches its neighbours one hop out; it does not surface the
        # neighbours' columns.
        self.assertNotIn("tables", res)
        self.assertNotIn("columns", res)
        for n in res["neighbours"]:
            self.assertNotIn("columns", n, n)

    # --- step 3: describe reads the target's structure + meaning --------

    def test_step3_describe_target_returns_structure_not_values(self):
        res = self._describe(self.TARGET_DB, self.TARGET_TABLE)
        self.assertTrue(res["ok"], res)
        self.assertEqual(len(res["tables"]), 1)
        table = res["tables"][0]
        self.assertEqual(table["database"], self.TARGET_DB)
        self.assertEqual(table["table"], self.TARGET_TABLE)

        by_name = {c["name"]: c for c in table["columns"]}
        # The keyword-matched column is present, read LIVE with its type.
        self.assertIn(self.MATCHED_COLUMN, by_name)
        self.assertEqual(by_name[self.MATCHED_COLUMN]["type"], "TEXT")
        # The join column join_paths handed us is here too — structure, with type.
        self.assertEqual(by_name[self.TARGET_FK]["type"], "TEXT")
        # Every live column carries a name + a type (structure, not cell data).
        for col in table["columns"]:
            self.assertTrue(col["name"], col)
            self.assertTrue(col["type"], col)

        # Structure + meaning only — NEVER row/cell values.
        blob = json.dumps(res)
        self.assertNotIn('"rows"', blob)
        self.assertNotIn('"cells"', blob)

    # --- the loop, tied together end to end -----------------------------------

    def test_full_loop_reaches_cross_db_non_anchor_value_without_schema_dump(self):
        # 1. search the keyword -> WHERE the value lives (cross-DB, non-anchor).
        found = next(
            m
            for m in self._search(self.KEYWORD)["matches"]
            if m["database"] == self.TARGET_DB and m["column"] == self.MATCHED_COLUMN
        )
        self.assertNotEqual(found["database"], self.ANCHOR_DB)  # crosses a DB boundary
        self.assertNotEqual(found["table"], self.ANCHOR_TABLE)  # a non-anchor table

        # 2. join_paths from the anchor -> HOW to reach it (the join edge).
        edge = next(
            n
            for n in self._join_paths(self.ANCHOR_DB, self.ANCHOR_TABLE)["neighbours"]
            if n["database"] == found["database"] and n["table"] == found["table"]
        )

        # 3. describe the edge's target -> the column's structure + meaning,
        # composed live. The agent reached the value's column by chaining the
        # tools, never by dumping the whole schema.
        described = self._describe(edge["database"], edge["table"])["tables"][0]
        self.assertIn(
            found["column"], {c["name"] for c in described["columns"]}, described
        )


class NavigateDbComposesWithinDatabaseTest(_BoundWorktree):
    """The same loop WITHIN one database (cord-ph), via a foreign key.

    Anchor: the entity table ``cord_ph_birth_records``. Target: the non-anchor
    ``encounters`` table, reached by the measured foreign key
    ``cord_ph_birth_records.encounter -> encounters.id``. Keyword "encounterclass"
    is a real column NAME unique to ``encounters``.
    """

    BOUND = ("cord-ph",)

    KEYWORD = "encounterclass"
    ANCHOR_TABLE = "cord_ph_birth_records"
    ANCHOR_FK = "encounter"
    TARGET_TABLE = "encounters"
    TARGET_KEY = "id"

    def test_full_loop_reaches_non_anchor_value_via_foreign_key(self):
        # 1. search -> exactly the one column on the non-anchor target table.
        matches = self._search(self.KEYWORD)["matches"]
        self.assertEqual(len(matches), 1, matches)
        hit = matches[0]
        self.assertEqual(hit["database"], "cord-ph")
        self.assertEqual(hit["table"], self.TARGET_TABLE)
        self.assertEqual(hit["column"], self.KEYWORD)
        self.assertEqual(hit["matched_on"], "column_name")

        # 2. join_paths from the anchor -> the FK edge to the target.
        edge = next(
            n
            for n in self._join_paths("cord-ph", self.ANCHOR_TABLE)["neighbours"]
            if n["table"] == self.TARGET_TABLE
            and n["from_column"] == self.ANCHOR_FK
            and n["to_column"] == self.TARGET_KEY
        )
        self.assertEqual(edge["via"], "foreign_key")

        # 3. describe the target -> the matched column is present, live.
        described = self._describe("cord-ph", edge["table"])["tables"][0]
        by_name = {c["name"]: c for c in described["columns"]}
        self.assertIn(self.KEYWORD, by_name, described)
        self.assertEqual(by_name[self.KEYWORD]["type"], "TEXT")


if __name__ == "__main__":
    unittest.main(verbosity=2)
