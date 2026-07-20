"""Verify join_paths: the full one-hop neighbour set of a table, derived from model.json.

join_paths is the fourth navigate tool. From a given table it returns EVERY
table one hop away — the within-database foreign keys plus the cross-database
measured identity links — derived purely from each ``model.json`` (it never opens
a SQLite database or runs SQL). Neighbours come strictly from ``foreign_keys`` +
``identity_links``, never guessed from column names.

The tool is run as a subprocess with its cwd set to a temp run worktree holding
the REAL seeded models at ``database/<slug>.model.json`` (the same shape
lookup_fieldids_test.py / sql_execute_test.py use). We assert on the real
seeded table/column names so the contract is exercised end-to-end.

Run: ``python3 -m core.agent.test.join_paths_test`` (from repo root), or via
``python3 -m unittest discover -s core -p '*_test.py'``.
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
TOOLS = REPO_ROOT / "core" / "agent" / "tools"
SEEDED = REPO_ROOT / "var" / "databases"

# The bound databases for these tests: cord-ph (within-DB FKs, no identity links)
# plus the npda pair (cross-DB identity links in both directions).
_DBS = ("cord-ph", "npda-demographics", "npda-clinical")


def _seeded_models_available() -> bool:
    return all((SEEDED / slug / "model.json").is_file() for slug in _DBS)


@unittest.skipUnless(
    _seeded_models_available(),
    "seeded models missing — run `cd intero && make seed`",
)
class JoinPathsTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        db_dir = self.worktree / "databases"
        db_dir.mkdir()
        for slug in _DBS:
            src = (SEEDED / slug / "model.json").read_text(encoding="utf-8")
            (db_dir / f"{slug}.model.json").write_text(src, encoding="utf-8")

    def tearDown(self):
        self._dir.cleanup()

    def _tool(self, request: dict) -> dict:
        proc = subprocess.run(
            [sys.executable, str(TOOLS / "join_paths.py"), json.dumps(request)],
            capture_output=True,
            text=True,
            cwd=self.worktree,
        )
        return json.loads(proc.stdout.strip() or proc.stderr.strip())

    # --- within-DB foreign keys: outgoing (child -> parent) -------------------

    def test_within_db_outgoing_fk_neighbour(self):
        # cord_ph_birth_records.baby_patient -> patients.id (to-one). The given
        # table is the CHILD, so patients is an OUTGOING neighbour reached by
        # joining the FK column (baby_patient) to the parent key (id).
        res = self._tool({"database": "cord-ph", "table": "cord_ph_birth_records"})
        self.assertTrue(res["ok"], res)
        match = [
            n
            for n in res["neighbours"]
            if n["table"] == "patients"
            and n["via"] == "foreign_key"
            and n["from_column"] == "baby_patient"
            and n["to_column"] == "id"
        ]
        self.assertEqual(len(match), 1, res["neighbours"])
        n = match[0]
        self.assertEqual(n["database"], "cord-ph")
        self.assertEqual(n["cardinality"], "to-one")
        self.assertEqual(n["declared"], False)
        self.assertIn("sampled values found in target", n["evidence"])

    # --- within-DB foreign keys: incoming (parent <- child) ------------------

    def test_within_db_incoming_fk_neighbour(self):
        # patients is the PARENT of cord_ph_birth_records.baby_patient -> patients.id.
        # So from patients, cord_ph_birth_records is an INCOMING neighbour reached
        # by joining patients.id to the child's FK column (baby_patient).
        res = self._tool({"database": "cord-ph", "table": "patients"})
        self.assertTrue(res["ok"], res)
        match = [
            n
            for n in res["neighbours"]
            if n["table"] == "cord_ph_birth_records"
            and n["via"] == "foreign_key"
            and n["from_column"] == "id"
            and n["to_column"] == "baby_patient"
        ]
        self.assertEqual(len(match), 1, res["neighbours"])
        self.assertEqual(match[0]["database"], "cord-ph")
        self.assertEqual(match[0]["cardinality"], "to-one")

    # --- cross-DB identity links: outgoing (npda-clinical -> demographics) ----

    def test_cross_db_identity_outgoing(self):
        # npda-clinical.clinic_visits.patient_ref -> npda-demographics.patients.nhs_number.
        # From a clinical table the demographics patients table is an OUTGOING
        # identity neighbour. identity_link carries no cardinality/declared.
        res = self._tool({"database": "npda-clinical", "table": "clinic_visits"})
        self.assertTrue(res["ok"], res)
        match = [
            n
            for n in res["neighbours"]
            if n["database"] == "npda-demographics"
            and n["table"] == "patients"
            and n["via"] == "identity_link"
        ]
        self.assertEqual(len(match), 1, res["neighbours"])
        n = match[0]
        self.assertEqual(n["from_column"], "patient_ref")
        self.assertEqual(n["to_column"], "nhs_number")
        self.assertNotIn("cardinality", n)
        self.assertNotIn("declared", n)
        self.assertIn("sampled values found in target", n["evidence"])

    # --- cross-DB identity links: incoming from siblings ---------------------

    def test_cross_db_identity_incoming_from_siblings(self):
        # npda-demographics.patients has its own outgoing link to clinic_visits,
        # AND every npda-clinical table whose *.patient_ref targets
        # "npda-demographics -> patients.nhs_number" is an INCOMING neighbour.
        # The four npda-clinical source tables must all appear, each via identity.
        res = self._tool({"database": "npda-demographics", "table": "patients"})
        self.assertTrue(res["ok"], res)
        clinical = {
            n["table"]
            for n in res["neighbours"]
            if n["database"] == "npda-clinical" and n["via"] == "identity_link"
        }
        self.assertEqual(
            clinical,
            {"clinic_visits", "clinical_notes", "measurements", "screening_results"},
            res["neighbours"],
        )
        # Each such neighbour joins demographics' nhs_number to clinical's patient_ref.
        for n in res["neighbours"]:
            if n["database"] == "npda-clinical" and n["via"] == "identity_link":
                self.assertEqual(n["from_column"], "nhs_number")
                self.assertEqual(n["to_column"], "patient_ref")

    def test_reciprocal_identity_link_is_deduped(self):
        # clinic_visits is reachable from patients BOTH as patients' own outgoing
        # link and as clinic_visits' incoming link — the identical edge must appear
        # exactly once, not twice.
        res = self._tool({"database": "npda-demographics", "table": "patients"})
        clinic_visits = [
            n
            for n in res["neighbours"]
            if n["database"] == "npda-clinical"
            and n["table"] == "clinic_visits"
            and n["via"] == "identity_link"
        ]
        self.assertEqual(len(clinic_visits), 1, res["neighbours"])

    # --- a table with no neighbours -> clean empty list ----------------------

    def test_table_with_no_neighbours_is_empty_not_error(self):
        # organizations has no FK edge touching it and no identity link.
        res = self._tool({"database": "cord-ph", "table": "organizations"})
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["neighbours"], [])

    # --- unknown database / table -> ToolError -------------------------------

    def test_unknown_database_is_error(self):
        res = self._tool({"database": "nope", "table": "patients"})
        self.assertFalse(res["ok"], res)
        self.assertIn("nope", res["error"])
        # The error lists the valid bound databases.
        self.assertIn("cord-ph", res["error"])

    def test_unknown_table_is_error(self):
        res = self._tool({"database": "cord-ph", "table": "no_such_table"})
        self.assertFalse(res["ok"], res)
        self.assertIn("no_such_table", res["error"])
        # The error lists the real tables in that database.
        self.assertIn("patients", res["error"])

    def test_missing_arguments_are_errors(self):
        self.assertFalse(self._tool({"database": "cord-ph"})["ok"])
        self.assertFalse(self._tool({"table": "patients"})["ok"])
        self.assertFalse(self._tool({})["ok"])

    # --- malformed model SHAPE -> clean error, not a crash -------------------

    def _tool_with_model(self, slug: str, model: dict, request: dict) -> dict:
        """Run the tool against a worktree whose only model is ``model``.

        A separate temp worktree so the malformed model is the sole bound
        database — exercises the shape-hardening in isolation. The tool must
        never crash with a raw traceback (exit 1): a malformed shape resolves
        to either a clean success (skipped edge) or a ToolError (exit 2).
        """
        with tempfile.TemporaryDirectory() as raw:
            worktree = Path(raw)
            db_dir = worktree / "databases"
            db_dir.mkdir()
            (db_dir / f"{slug}.model.json").write_text(
                json.dumps(model), encoding="utf-8"
            )
            proc = subprocess.run(
                [sys.executable, str(TOOLS / "join_paths.py"), json.dumps(request)],
                capture_output=True,
                text=True,
                cwd=worktree,
            )
            self.assertIn(proc.returncode, (0, 2), (proc.returncode, proc.stderr))
            return json.loads(proc.stdout.strip() or proc.stderr.strip())

    def test_non_dict_table_entry_is_error_not_crash(self):
        # A bare-string tables[] entry must not raise AttributeError — the tool
        # reports a clean error (the table simply isn't found) rather than crashing.
        model = {"tables": ["not-a-dict"], "foreign_keys": [], "identity_links": []}
        res = self._tool_with_model("bad", model, {"database": "bad", "table": "x"})
        self.assertFalse(res["ok"], res)
        self.assertTrue(res["error"])

    def test_non_dict_fk_entry_is_skipped_not_crash(self):
        # A non-dict foreign_keys[] entry must not raise TypeError — it is skipped,
        # so the (otherwise edge-less) table cleanly reports no neighbours.
        model = {
            "tables": [{"name": "t"}],
            "foreign_keys": ["not-a-dict"],
            "identity_links": [],
        }
        res = self._tool_with_model("bad", model, {"database": "bad", "table": "t"})
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["neighbours"], [])

    def test_fk_entry_missing_keys_is_error_not_crash(self):
        # An fk dict missing column/target must not raise KeyError — it surfaces
        # loudly as a ToolError (matching _split_qualified's posture).
        model = {
            "tables": [{"name": "t"}],
            "foreign_keys": [{"cardinality": "to-one"}],
            "identity_links": [],
        }
        res = self._tool_with_model("bad", model, {"database": "bad", "table": "t"})
        self.assertFalse(res["ok"], res)
        self.assertTrue(res["error"])

    def test_non_dict_identity_link_is_skipped_not_crash(self):
        # A non-dict identity_links[] entry must not raise TypeError — it is skipped.
        model = {
            "tables": [{"name": "t"}],
            "foreign_keys": [],
            "identity_links": ["not-a-dict"],
        }
        res = self._tool_with_model("bad", model, {"database": "bad", "table": "t"})
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["neighbours"], [])

    def test_identity_link_missing_keys_is_error_not_crash(self):
        # An identity_links[] dict missing column/target must not raise KeyError —
        # it surfaces loudly as a ToolError.
        model = {
            "tables": [{"name": "t"}],
            "foreign_keys": [],
            "identity_links": [{"evidence": "x"}],
        }
        res = self._tool_with_model("bad", model, {"database": "bad", "table": "t"})
        self.assertFalse(res["ok"], res)
        self.assertTrue(res["error"])

    # --- join-paths is databases-only, NOT a collection-generic verb ----------

    def test_collection_arg_is_not_honoured_join_paths_is_databases_only(self):
        # Only the clinical database carries a measured join graph, so following
        # edges is databases-only — `join-paths` is NOT routed through the
        # collection seam (navigation.md / ADR 0005). A `collection` key is just
        # an unknown arg: it is ignored, never resolved, so even a bogus value
        # leaves the result identical to omitting it (no registry error).
        plain = self._tool({"database": "cord-ph", "table": "cord_ph_birth_records"})
        with_arg = self._tool(
            {
                "database": "cord-ph",
                "table": "cord_ph_birth_records",
                "collection": "no-such-collection",
            }
        )
        self.assertTrue(with_arg["ok"], with_arg)
        self.assertEqual(json.dumps(with_arg), json.dumps(plain))

    # --- determinism: byte-stable order --------------------------------------

    def test_order_is_byte_stable(self):
        # The exact serialized neighbours list must be identical across runs.
        a = self._tool({"database": "cord-ph", "table": "encounters"})
        b = self._tool({"database": "cord-ph", "table": "encounters"})
        self.assertEqual(
            json.dumps(a["neighbours"], sort_keys=False),
            json.dumps(b["neighbours"], sort_keys=False),
        )
        # And it matches the documented sort: (via, db, table, from_column, to_column).
        keys = [
            (n["via"], n["database"], n["table"], n["from_column"], n["to_column"])
            for n in a["neighbours"]
        ]
        self.assertEqual(keys, sorted(keys))


if __name__ == "__main__":
    unittest.main(verbosity=2)
