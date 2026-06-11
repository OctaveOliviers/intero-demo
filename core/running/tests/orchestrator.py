"""Verify the run spine (A0 keystone): the orchestrator persists every `pending`
cell BEFORE any tier runs, sequences Tier 1 → 2 → 3 by querying cell `state` in
the store, lets each STUBBED tier mutate the store in place, and streams
`cell_update` + terminal `review_summary`/`done`. No real SQL, no LLM; nothing
about a cell is
held outside the store. Every cell — pending and resolved — validates against
`cell-resolution.schema.json` (the re-frozen contract).

Run: ``python3 -m core.running.tests.orchestrator``
"""

import asyncio
import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

import jsonschema  # noqa: E402

from core.running.orchestrator import (  # noqa: E402
    RunStore,
    orchestrate_run,
    precompute_pending_cells,
)
from core.store import Cell, Run, Store  # noqa: E402

SCHEMA = json.loads(
    (REPO_ROOT / "docs/mvp/contracts/cell-resolution.schema.json").read_text(encoding="utf-8")
)

# A hand-authored executable fixture (A0): one region, four cell slots (three
# direct + one interpret), two cohort members. The orchestrator consumes the same
# shape the real `mapping.json` executable (A4) will produce.
EXECUTABLE = {
    "schema_version": "2",
    "audit_id": "test",
    "identity_keys": ["patient_code"],
    "regions": [
        {
            "id": "ALL", "sheet": "ALL", "kind": "direct",
            "queries": [
                {"database": "testdb",
                 "sql": "SELECT patient_code, gestation_weeks, delivery FROM births "
                        "WHERE patient_code IN (:cohort)"}
            ],
            "cell_map": [
                {"field": "patient_code", "column": "patient_code",
                 "table": "births", "cell_template": "{col:A}{row}"},
                {"field": "gestation_weeks", "column": "gestation_weeks",
                 "table": "births", "cell_template": "{col:B}{row}"},
                {"field": "delivery", "column": "delivery",
                 "table": "births", "cell_template": "{col:T}{row}"},
                {"field": "summary", "kind": "interpret",
                 "sources": ["testdb -> notes.text"], "cell_template": "{col:S}{row}"},
            ],
        }
    ],
}
COHORT = ["P001", "P002"]


# --- stubbed tiers: write CANNED updates to the store, never touch SQL/LLM ------
# Each tier receives ONLY the run-store handle (the seam A0 pins) — it reads
# whatever else it needs from there (executable / cohort / database_paths) and
# iterates open_cells() at its own pace.

async def stub_direct(run_store):
    """Tier 1 stub: fill the direct cells in place; leave P002's gestation NULL
    (→ stays pending for Tier 2) and the interpret cells untouched."""
    stub_direct.calls.append({"open": len(run_store.open_cells()),
                              "executable_kind": run_store.executable.get("regions", [{}])[0].get("kind"),
                              "database_paths": dict(run_store.database_paths),
                              "cohort": list(run_store.cohort)})
    for cell in run_store.open_cells():
        if cell.kind != "direct":
            continue  # interpret slots aren't Tier 1's job
        if cell.field == "gestation_weeks" and cell.member == "P002":
            await run_store.update(
                cell.ref,
                attempts=[{"tier": "direct", "database": "testdb",
                           "sql": "SELECT gestation_weeks FROM births WHERE patient_code = 'P002'",
                           "table_column": "births.gestation_weeks",
                           "error": "births.gestation_weeks is NULL for P002"}],
            )  # non-clean → left pending (NOT blocked) for Tier 2
            continue
        await run_store.update(
            cell.ref, state="filled", value=f"{cell.field}:{cell.member}",
            confidence="high", resolved_by="direct",
            attempts=[{"tier": "direct", "database": "testdb",
                       "sql": f"SELECT {cell.field} FROM births WHERE patient_code = '{cell.member}'",
                       "table_column": f"births.{cell.field}", "result": cell.member}],
            sources=[{"database": "testdb",
                      "query": f"SELECT patient_code, {cell.field} FROM births "
                               f"WHERE patient_code = '{cell.member}'",
                      "table_column": f"births.{cell.field}"}],
        )


stub_direct.calls = []


async def stub_llm(run_store):
    """Tier 2 stub: one cheap pass per still-open cell. Solve gestation via one
    retry; leave the interpret cells open for Tier 3. Tier 2 owns its own
    pacing — it iterates open_cells() itself, the orchestrator just hands it
    the run-store handle."""
    stub_llm.calls += 1
    for cell in run_store.open_cells():
        stub_llm.seen.append((cell.field, cell.member, cell.state))
        if cell.field == "gestation_weeks":
            await run_store.update(
                cell.ref, state="filled", value="39", confidence="medium",
                resolved_by="LLM", hypothesis="NULL in births; recovered from the dating scan",
                attempts=cell.attempts + [{"tier": "LLM", "database": "testdb",
                                           "sql": "SELECT weeks FROM dating_scans WHERE patient_code = 'P002'",
                                           "result": "39"}],
                sources=[{"database": "testdb",
                          "query": "SELECT patient_code, weeks FROM dating_scans WHERE patient_code = 'P002'",
                          "table_column": "dating_scans.weeks"}],
            )


stub_llm.seen = []
stub_llm.calls = 0


async def stub_agent(run_store):
    """Tier 3 stub: ONE session over whatever is still open. P001's note yields an
    interpreted value; P002's cannot be located (→ blocked NOT_LOCATED). The
    agent's real bridge (A1) will expose per-cell tools rather than handing the
    full list to the model — here the stub just iterates what's left."""
    open_now = run_store.open_cells()
    stub_agent.sessions.append([c.ref for c in open_now])
    for cell in open_now:
        if cell.member == "P001":
            await run_store.update(
                cell.ref, state="filled", value="cord around neck",
                confidence="low", resolved_by="agent",
                attempts=[{"tier": "agent", "database": "testdb",
                           "sql": "SELECT text FROM notes WHERE patient_code = 'P001'",
                           "result": "cord around neck noted"}],
                sources=[{"database": "testdb",
                          "query": f"SELECT patient_code, text FROM notes WHERE patient_code = '{cell.member}'",
                          "table_column": "notes.text", "row_id": "n1",
                          "citations": ["cord around neck noted"]}],
                review_state="not_reviewed", corrected=False,
            )
        else:
            await run_store.update(
                cell.ref, state="blocked", confidence="low", resolved_by="agent",
                attempts=[{"tier": "agent", "database": "testdb",
                           "sql": "SELECT text FROM notes WHERE patient_code = 'P002'",
                           "result": "no cord mention"}],
                reason_code="NOT_LOCATED",
                reason_detail="searched the notes for P002; nothing about the cord",
            )


stub_agent.sessions = []


def _schema_cell(cell: Cell) -> dict:
    """Project a store Cell onto the cell-resolution schema's `cell` shape: split
    the combined `ref` into sheet + A1, keep only the fields that are set."""
    sheet, _, a1 = cell.ref.partition("!")
    out = {"sheet": sheet, "ref": a1, "field": cell.field,
           "member": cell.member, "kind": cell.kind, "state": cell.state}
    for k in ("value", "confidence", "resolved_by", "hypothesis", "attempts",
              "explanation", "sources", "review_state", "corrected",
              "reason_code", "reason_detail", "owner_needed", "outstanding_since",
              "prompt_version", "extracted_at"):
        v = getattr(cell, k)
        if v not in (None, [], {}):
            out[k] = v
    return out


class OrchestratorSpineTest(unittest.TestCase):
    def setUp(self):
        stub_direct.calls.clear()
        stub_llm.seen.clear()
        stub_llm.calls = 0
        stub_agent.sessions.clear()
        self._dir = tempfile.TemporaryDirectory()
        self.store = Store(Path(self._dir.name) / "state.db")
        self.store.create_run(Run(id="r1", audit_id="test", status="in_progress"))
        self.events: list[dict] = []
        asyncio.run(orchestrate_run(
            self.store, "r1", EXECUTABLE, COHORT,
            tier_direct=stub_direct, tier_llm=stub_llm, tier_agent=stub_agent,
            emit=self.events.append,
            # audit is REQUIRED (arms the off-code guard); this keystone test
            # exercises sequencing, not codes, so a code-free audit is correct.
            audit={"fields": []},
        ))
        self.cells = {(c.field, c.member): c for c in self.store.get_cells("r1")}

    def tearDown(self):
        self.store.close()
        self._dir.cleanup()

    # 1. All pending cells are persisted BEFORE any tier runs ------------------
    def test_full_pending_grid_persisted_up_front(self):
        # 2 members × 4 cell slots = 8 cells, every one in the store.
        self.assertEqual(len(self.store.get_cells("r1")), 8)
        # The first tier already saw all 8 as open — they existed before it ran.
        self.assertEqual(stub_direct.calls[0]["open"], 8)
        # The prepare heartbeat is streamed before any cell_update.
        first_cell_update = next(i for i, e in enumerate(self.events)
                                 if e["type"] == "cell_update")
        prepared = next(i for i, e in enumerate(self.events)
                        if e["type"] == "activity" and "Prepared" in e["headline"])
        self.assertLess(prepared, first_cell_update)

    # 2. Each tier mutated the store in place ----------------------------------
    def test_each_tier_settled_its_cells(self):
        by_tier: dict[str, int] = {}
        for c in self.store.get_cells("r1"):
            if c.resolved_by:
                by_tier[c.resolved_by] = by_tier.get(c.resolved_by, 0) + 1
        # direct: patient_code×2 + gestation P001 + delivery×2 = 5; LLM: gestation
        # P002 = 1; agent: the two interpret cells = 2.
        self.assertEqual(by_tier, {"direct": 5, "LLM": 1, "agent": 2})
        self.assertEqual(self.cells[("gestation_weeks", "P002")].resolved_by, "LLM")
        self.assertEqual(self.cells[("summary", "P001")].state, "filled")
        self.assertEqual(self.cells[("summary", "P001")].review_state, "not_reviewed")
        self.assertEqual(self.cells[("summary", "P002")].state, "blocked")
        self.assertEqual(self.cells[("summary", "P002")].reason_code, "NOT_LOCATED")

    # 3. Tiers are sequenced by querying `state`, not by passing cells ----------
    def test_orchestrator_sequences_by_open_state(self):
        # Tier 2 was called ONCE (not per-cell) — it iterates open_cells itself
        # and only ever sees cells left `pending` by Tier 1.
        self.assertEqual(stub_llm.calls, 1)
        self.assertTrue(all(state == "pending" for _, _, state in stub_llm.seen))
        self.assertEqual({(f, m) for f, m, _ in stub_llm.seen},
                         {("gestation_weeks", "P002"), ("summary", "P001"), ("summary", "P002")})
        # Tier 3 ran exactly once, over only the cells Tier 2 left open.
        self.assertEqual(len(stub_agent.sessions), 1)
        self.assertEqual(set(stub_agent.sessions[0]), {"ALL!S2", "ALL!S3"})

    # 3b. RunStore carries the run's full context, not just the cell binding ---
    def test_run_store_carries_executable_cohort_and_db_paths(self):
        # Tier 1 reads run_store.executable/.cohort/.database_paths — verifying
        # the per-run context handle is what flows in, not separate arguments.
        self.assertEqual(stub_direct.calls[0]["executable_kind"], "direct")
        self.assertEqual(stub_direct.calls[0]["cohort"], COHORT)
        self.assertEqual(stub_direct.calls[0]["database_paths"], {})

    # 4. Streams cell_update + terminal review_summary + done -------------------
    def test_streams_cell_update_then_review_summary_then_done(self):
        kinds = [e["type"] for e in self.events]
        # One per store change: 8 cells, but gestation P002 is touched twice (Tier
        # 1 leaves it pending-with-attempt, then Tier 2 fills it) → 9 streamed.
        self.assertEqual(kinds.count("cell_update"), 9, "one per store change")
        self.assertEqual(kinds.count("review_summary"), 1)
        self.assertIn("review_summary", kinds)
        self.assertLess(kinds.index("review_summary"), kinds.index("done"))
        self.assertEqual(self.events[-1]["type"], "done")
        self.assertNotIn("error", kinds)
        # No SQL/LLM: database_paths is empty (no connection ever opened) and the
        # spine itself touches neither a DB nor a model — the tiers own that.
        self.assertEqual(stub_direct.calls[0]["database_paths"], {})

    def test_activity_events_are_v2_shape_without_legacy_keys(self):
        activity_events = [e for e in self.events if e["type"] == "activity"]
        self.assertTrue(activity_events, "expected activity events")
        for event in activity_events:
            self.assertIn("headline", event)
            self.assertNotIn("summary", event)
            self.assertNotIn("Tier ", event["headline"])

    def test_milestone_headlines_include_plain_language_and_counters(self):
        headlines = [e.get("headline", "") for e in self.events if e.get("type") == "activity"]
        self.assertTrue(any("Preparing workbook and cohort" in h for h in headlines), headlines)
        self.assertTrue(any("Auto-filling values from the database" in h for h in headlines), headlines)
        self.assertTrue(any("Checking unresolved values" in h for h in headlines), headlines)
        self.assertTrue(any("Investigating remaining missing values" in h for h in headlines), headlines)
        self.assertTrue(any("Finalizing results" in h for h in headlines), headlines)
        self.assertTrue(
            any("prepared " in h and "filled " in h and "pending " in h and "blocked " in h
                and "needs verification " in h
                for h in headlines),
            headlines,
        )
        self.assertEqual(
            sum(1 for h in headlines if "Investigating remaining missing values." in h),
            1,
            headlines,
        )

    def test_review_summary_shape(self):
        review = next(e for e in self.events if e["type"] == "review_summary")
        self.assertEqual(set(review.keys()), {"type", "totals", "blocking", "verification"})
        self.assertEqual(
            set(review["totals"].keys()),
            {"cells", "filled", "blocked", "needs_verification", "low_confidence"},
        )
        self.assertEqual(set(review["blocking"].keys()), {"count", "reason_codes", "focus"})
        self.assertEqual(
            set(review["verification"].keys()),
            {"pending", "reviewed", "corrected", "focus"},
        )
        self.assertEqual(
            set(review["verification"]["focus"].keys()),
            {"needs_review", "low_confidence", "assumptions"},
        )

    # 5. Nothing held in memory that isn't in the store ------------------------
    def test_state_lives_only_in_the_store(self):
        # orchestrate_run returns nothing; the run's truth is the persisted cells.
        reloaded = {(c.field, c.member): c.state for c in self.store.get_cells("r1")}
        self.assertEqual(reloaded[("summary", "P002")], "blocked")
        self.assertEqual(reloaded[("delivery", "P001")], "filled")
        # Run status is DERIVED from the persisted cells (a blocked cell present).
        self.assertEqual(self.store.recompute_status("r1"), "blocked")
        # Every streamed cell_update was also persisted to the events table — the
        # durable mirror of the live stream (9 store changes, see above).
        cell_events = [e for e in self.store.get_events("r1") if e.type == "cell_update"]
        self.assertEqual(len(cell_events), 9)

    # 6. Re-freeze: every cell validates against cell-resolution.schema.json ----
    def test_every_cell_validates_against_the_contract(self):
        for c in self.store.get_cells("r1"):
            jsonschema.validate({"cell": _schema_cell(c)}, SCHEMA)

    def test_pending_cells_validate_against_the_contract(self):
        for c in precompute_pending_cells("r1", EXECUTABLE, COHORT):
            jsonschema.validate({"cell": _schema_cell(c)}, SCHEMA)

    def test_missing_audit_fails_fast(self):
        # Without the audit spec the off-code guard can't be armed — orchestrate_run
        # must refuse rather than run with validation silently disarmed.
        import tempfile as _tf
        with _tf.TemporaryDirectory() as d:
            store = Store(Path(d) / "s.db")
            store.create_run(Run(id="r2", audit_id="test", status="in_progress"))
            with self.assertRaises(ValueError):
                asyncio.run(orchestrate_run(
                    store, "r2", EXECUTABLE, COHORT,
                    tier_direct=stub_direct, tier_llm=stub_llm, tier_agent=stub_agent,
                    audit=None,
                ))
            store.close()

    def test_failed_tier_does_not_emit_success_terminal_sequence(self):
        async def boom_tier(_run_store):
            raise RuntimeError("tier failed")

        with tempfile.TemporaryDirectory() as d:
            store = Store(Path(d) / "s.db")
            store.create_run(Run(id="r3", audit_id="test", status="in_progress"))
            events: list[dict] = []
            with self.assertRaises(RuntimeError):
                asyncio.run(orchestrate_run(
                    store,
                    "r3",
                    EXECUTABLE,
                    COHORT,
                    tier_direct=stub_direct,
                    tier_llm=boom_tier,
                    tier_agent=stub_agent,
                    emit=events.append,
                    audit={"fields": []},
                ))
            kinds = [e["type"] for e in events]
            self.assertNotIn("done", kinds)
            self.assertNotIn("review_summary", kinds)
            store.close()


class SeedExecutableTest(unittest.TestCase):
    """The pending grid precomputes correctly from the real seed executable — the
    regression net that holds the executable/cohort shape A0 consumes."""

    def test_precompute_consumes_seed_executable(self):
        # A4 folded the executable into mapping.json (no standalone populate.json).
        mapping = json.loads(
            (REPO_ROOT / "seed/audits/cord-ph/mapping.json").read_text(encoding="utf-8")
        )
        spec = mapping["executable"]
        cohort = ["CORD-0001", "CORD-0002", "CORD-0003"]
        cells = precompute_pending_cells("r", spec, cohort)
        expected = len(cohort) * sum(len(r["cell_map"]) for r in spec["regions"])
        self.assertEqual(len(cells), expected)
        self.assertTrue(all(c.state == "pending" for c in cells))
        for c in cells:
            self.assertIn("!", c.ref)
            self.assertTrue(c.field and c.member and c.kind)
            jsonschema.validate({"cell": _schema_cell(c)}, SCHEMA)


if __name__ == "__main__":
    unittest.main(verbosity=2)
