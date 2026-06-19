"""End-to-end integration test for Tier 3 (A1).

Exercises the FULL chain — RunStore → write_run_context → real sql_execute.py
subprocess → cells DB — exactly the way Tier 3 will run in production. This is
the test that pins the run-context contract: if write_run_context and
sql_execute drift apart, this test breaks first.

Run: ``python3 -m core.running.tests.try_agent_e2e``
"""

from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

import asyncio  # noqa: E402

import types  # noqa: E402

from core.running.orchestrator import RunStore, orchestrate_run  # noqa: E402
from core.running.try_agent import (  # noqa: E402
    make_tier_agent,
    provision_worktree,
    write_run_context,
)
from core.store import Cell, Run, Store  # noqa: E402

TOOLS = REPO_ROOT / "core" / "agent" / ".opencode" / "tools"


def _hospital_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE cord_ph_birth_records (
            patient_code TEXT PRIMARY KEY, delivery TEXT
        );
        INSERT INTO cord_ph_birth_records VALUES ('P001','1');
        INSERT INTO cord_ph_birth_records VALUES ('P002','3');
        INSERT INTO cord_ph_birth_records VALUES ('P_OUT','4');
        """
    )
    conn.commit()
    conn.close()


def _audit() -> dict:
    return {"fields": [
        {"id": "delivery", "name": "Delivery", "type": "category",
         "permitted_values": {"1": "SVD", "2": "EmCS", "3": "Forceps", "4": "Vacuum"}},
    ]}


class TryAgentEndToEndTest(unittest.TestCase):
    """RunStore → write_run_context → real sql_execute subprocess → cells changed."""

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.root = Path(self._dir.name)
        self.hospital_db = self.root / "cord-ph.sqlite"
        _hospital_db(self.hospital_db)
        self.state_db = self.root / "state.db"

        self.store = Store(self.state_db)
        self.store.create_run(Run(id="r1", audit_id="cord-ph", status="in_progress"))
        self.store.materialize_field_codes("r1", _audit())
        self.store.insert_pending_cells([
            Cell(run_id="r1", ref="ALL!T2", field="delivery", member="P001",
                 kind="direct", state="pending"),
            Cell(run_id="r1", ref="ALL!T3", field="delivery", member="P002",
                 kind="direct", state="pending"),
        ])
        self.store.close()  # the subprocess opens its own connection

        # Re-open just to wrap in RunStore for write_run_context.
        self.store = Store(self.state_db)
        self.run_store = RunStore(
            self.store, "r1",
            cohort=["P001", "P002"],
            database_paths={"cord-ph": self.hospital_db},
            audit=_audit(),
            anchor="patient_code",
            cohort_tables={"cord-ph": ["cord_ph_birth_records"]},
        )
        self.run_dir = self.root / "run"
        # Provision the FULL worktree (context + symlinked DBs + models) — the
        # tool resolves audit/cells.sqlite and database/cord-ph.sqlite by name.
        provision_worktree(self.run_store, self.run_dir)

    def tearDown(self):
        self.store.close()
        self._dir.cleanup()

    def _sql_execute(self, database: str, sql: str) -> dict:
        """Invoke the real sql_execute.py the way opencode does — cwd = the run
        worktree (where context.json lives)."""
        proc = subprocess.run(
            [sys.executable, str(TOOLS / "sql_execute.py"),
             json.dumps({"database": database, "sql": sql})],
            capture_output=True, text=True, cwd=self.run_dir,
        )
        out = (proc.stdout.strip() or proc.stderr.strip())
        return json.loads(out)

    def _cells(self) -> dict:
        s = Store(self.state_db)
        try:
            return {c.ref: c for c in s.get_cells("r1")}
        finally:
            s.close()

    # --- the contract test: write_run_context output works for sql_execute ----

    def test_pending_select_round_trips_through_real_tool(self):
        # The agent's first move: ask "what is open?" via sql_execute on cells.
        # If context.json and sql_execute disagree on shape, this fails.
        res = self._sql_execute(
            "cells", "SELECT ref, field, member FROM cells WHERE state = 'pending'"
        )
        self.assertTrue(res["ok"], f"sql_execute rejected the read: {res}")
        self.assertEqual({r["ref"] for r in res["rows"]}, {"ALL!T2", "ALL!T3"})

    def test_cells_route_denies_runtime_table_reads_in_integrated_flow(self):
        for table in ("runs", "events", "field_codes"):
            res = self._sql_execute("cells", f"SELECT * FROM {table}")
            self.assertFalse(res["ok"], res)
            self.assertIn("only the `cells` table is allowed", res["error"])

    def test_hospital_select_cohort_scoped_round_trips_through_real_tool(self):
        # The tool must read cohort+anchor+cohort_tables from context.json that
        # write_run_context produced — P_OUT is in the table but not the cohort.
        res = self._sql_execute(
            "cord-ph",
            "SELECT patient_code, delivery FROM cord_ph_birth_records ORDER BY patient_code"
        )
        self.assertTrue(res["ok"], f"sql_execute rejected the read: {res}")
        self.assertEqual([r["patient_code"] for r in res["rows"]], ["P001", "P002"])

    def test_cells_route_denies_runtime_table_writes_in_integrated_flow(self):
        # A forbidden table write via the cells route must fail and leave the run
        # record untouched.
        before = self.store.get_run("r1")
        self.assertIsNotNone(before)
        self.assertEqual(before.status, "in_progress")

        res = self._sql_execute(
            "cells",
            "UPDATE runs SET status='complete' WHERE id='r1'",
        )
        self.assertFalse(res["ok"], res)
        self.assertIn("only the `cells` table is allowed", res["error"])

        after = self.store.get_run("r1")
        self.assertIsNotNone(after)
        self.assertEqual(after.status, "in_progress")

    def test_full_resolution_flow_changes_the_cell(self):
        # 1. agent reads pending cells.
        pending = self._sql_execute(
            "cells", "SELECT ref, member FROM cells WHERE state = 'pending'"
        )
        self.assertTrue(pending["ok"], pending)
        refs = {r["ref"]: r["member"] for r in pending["rows"]}
        self.assertEqual(refs, {"ALL!T2": "P001", "ALL!T3": "P002"})

        # 2. agent reads the hospital — cohort applied by the tool.
        hosp = self._sql_execute(
            "cord-ph",
            "SELECT patient_code, delivery FROM cord_ph_birth_records"
        )
        self.assertTrue(hosp["ok"], hosp)
        values = {r["patient_code"]: r["delivery"] for r in hosp["rows"]}

        # 3. agent writes the value with a self-verifying source — ref by ref.
        for ref, member in refs.items():
            src = (f'[{{"database":"cord-ph",'
                   f'"query":"SELECT patient_code, delivery FROM cord_ph_birth_records '
                   f"WHERE patient_code=''{member}''\","
                   f'"table_column":"cord_ph_birth_records.delivery"}}]')
            write = self._sql_execute(
                "cells",
                f"UPDATE cells SET value='{values[member]}', state='filled', "
                f"confidence='high', resolved_by='agent', sources='{src}' "
                f"WHERE ref='{ref}'"
            )
            self.assertTrue(write["ok"], f"write for {ref} rejected: {write}")
            self.assertEqual(write["updated"], [ref])

        # 4. the cells reflect the writes.
        cells = self._cells()
        self.assertEqual(cells["ALL!T2"].state, "filled")
        self.assertEqual(cells["ALL!T2"].value, "1")
        self.assertEqual(cells["ALL!T3"].value, "3")
        # Every written cell got an agent attempt stamped on it.
        self.assertEqual(cells["ALL!T2"].attempts[-1]["tier"], "agent")


class _FillOneClient:
    """Fake opencode client: the 'agent' fills ALL!T2, then goes idle."""

    def __init__(self, store):
        self._store = store

    async def create_session(self, title=None, directory=None):
        return "sess"

    async def subscribe(self, sid):
        q = asyncio.Queue()
        self._store.update_cell(
            "r1", "ALL!T2", value="1", state="filled",
            resolved_by="agent", confidence="high",
            sources=[{"database": "cord-ph", "query": "SELECT patient_code, delivery FROM t",
                      "table_column": "t.delivery"}])
        q.put_nowait({"type": "session.idle"})
        return q

    async def prompt_async(self, sid, prompt, directory=None):
        pass

    async def unsubscribe(self, sid):
        pass

    async def delete_session(self, sid, directory=None):
        pass


class OrchestratorIntegratesTierAgentTest(unittest.TestCase):
    """orchestrate_run drives the REAL try_agent through make_tier_agent — the
    seam that wires Tier 3 into the spine (no production caller yet because A2's
    try_llm is unbuilt, but the integration point itself is exercised here)."""

    EXECUTABLE = {
        "regions": [{
            "id": "ALL", "sheet": "ALL", "kind": "direct",
            "cell_map": [{"field": "delivery", "cell_template": "{col:T}{row}"}],
        }],
    }
    AUDIT = {"fields": [
        {"id": "delivery", "name": "Delivery", "type": "category",
         "permitted_values": {"1": "SVD", "3": "Forceps"}},
    ]}

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.root = Path(self._dir.name)
        seed = Store(self.root / "state.db", runtime_role="api_app")
        seed.create_run(Run(id="r1", audit_id="cord-ph", status="in_progress"))
        seed.close()
        # The real run path passes an orchestrator-scoped store session into
        # orchestrate_run; keep this integration harness aligned.
        self.store = Store(self.root / "state.db", runtime_role="orchestrator_runtime")
        self.run_dir = self.root / "run"

    def tearDown(self):
        self.store.close()
        self._dir.cleanup()

    def test_tier_agent_runs_via_orchestrator(self):
        async def noop(_run_store):  # Tier 1 / Tier 2 do nothing — leave cells open.
            return None

        tier_agent = make_tier_agent(
            run_dir=self.run_dir, session_directory="runs/r1",
            client=_FillOneClient(self.store),
        )
        asyncio.run(orchestrate_run(
            self.store, "r1", self.EXECUTABLE, ["P001"],
            tier_direct=noop, tier_llm=noop, tier_agent=tier_agent,
            audit=self.AUDIT,
        ))

        # The agent tier (real try_agent) ran inside the orchestrator: the one
        # pending cell was filled, and the context.json was provisioned.
        cell = self.store.get_cell("r1", "ALL!T2")
        self.assertEqual(cell.state, "filled")
        self.assertEqual(cell.resolved_by, "agent")
        self.assertTrue((self.run_dir / "context.json").is_file())


class WriteRunContextNavMapTest(unittest.TestCase):
    """Hermetic contract test for the NEW emission: write_run_context must copy
    each bound database's identity_links/foreign_keys into context.json FROM the
    given databases_dir (not the live repo). Reads a temp model.json, so a
    regression that emitted []/garbage for the nav map would fail here — the gap
    the anchor-only round-trip test could not catch."""

    def test_write_run_context_emits_navigation_map_from_databases_dir(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            databases_dir = root / "databases"
            # A FOREIGN database's canonical model with a real nav map.
            links = [{"column": "patients.nhs_number",
                      "target": "npda-clinical -> clinic_visits.patient_ref"}]
            fks = [{"column": "registrations.patient_id",
                    "target": "patients.patient_id", "cardinality": "to-one"}]
            (databases_dir / "npda-demographics").mkdir(parents=True)
            (databases_dir / "npda-demographics" / "model.json").write_text(
                json.dumps({"identity_links": links, "foreign_keys": fks}), "utf-8")
            (databases_dir / "npda-clinical").mkdir(parents=True)
            (databases_dir / "npda-clinical" / "model.json").write_text(
                json.dumps({"identity_links": [], "foreign_keys": []}), "utf-8")

            run_store = types.SimpleNamespace(
                run_id="r1", anchor="visit_id", cohort=["V1", "V2"],
                database_paths={"npda-clinical": root / "clinical.sqlite",
                                "npda-demographics": root / "demographics.sqlite"},
                cohort_tables={"npda-clinical": ["clinic_visits"], "npda-demographics": []},
            )
            ctx = json.loads(write_run_context(
                run_store, root / "run", databases_dir=databases_dir).read_text())

            demo = ctx["databases"]["npda-demographics"]
            self.assertEqual(demo["identity_links"], links)
            self.assertEqual(demo["foreign_keys"], fks)
            self.assertEqual(demo["cohort_tables"], [])
            self.assertEqual(ctx["databases"]["npda-clinical"]["cohort_tables"],
                             ["clinic_visits"])

    def test_missing_model_degrades_to_empty_nav_map(self):
        # The documented fail-safe: an unreadable model yields empty links/keys
        # (the slug then bounds only anchor-bearing tables), never a crash.
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            run_store = types.SimpleNamespace(
                run_id="r1", anchor="visit_id", cohort=["V1"],
                database_paths={"npda-demographics": root / "demographics.sqlite"},
                cohort_tables={"npda-demographics": []},
            )
            ctx = json.loads(write_run_context(
                run_store, root / "run", databases_dir=root / "nope").read_text())
            self.assertEqual(ctx["databases"]["npda-demographics"]["identity_links"], [])
            self.assertEqual(ctx["databases"]["npda-demographics"]["foreign_keys"], [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
