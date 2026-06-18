"""Verify the Tier-3 bridge (A1): worktree provisioning, prompt, session, finalize.

The cell-validation guarantees (cohort/run scoping, off-code, state, sources) are
enforced by the store's DB triggers and the SQL tools — exercised in
``agent/test/sql_execute_test.py`` and ``core/store/field_codes_test.py``. Here we
verify try_agent's own job: it provisions the run worktree the tools resolve from
(context + audit/db model files), builds a MINIMAL prompt that names the databases
and defers to the cell-fill skill, drives one opencode session ROOTED IN THE RUN
WORKTREE through an injected client, and settles whatever the agent left open as
blocked / NOT_LOCATED.

Run: ``python3 -m core.running.tests.try_agent``
"""

import asyncio
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from core.running.orchestrator import RunStore  # noqa: E402
from core.running.try_agent import (  # noqa: E402
    _part_transcript_record,
    _transcript_stats,
    agent_activity_from_part,
    build_prompt,
    finalize_unresolved,
    make_tier_agent,
    provision_worktree,
    try_agent,
    write_agent_activity_log,
    write_run_context,
)
from core.store import Cell, Run, Store  # noqa: E402


class _FakeClient:
    """Records the directory every session call is scoped to, fills one cell."""

    def __init__(self, store):
        self._store = store
        self.calls = []  # (method, directory)

    async def create_session(self, title=None, directory=None):
        self.calls.append(("create", directory))
        return "sess-1"

    async def subscribe(self, sid):
        q = asyncio.Queue()
        self._store.update_cell(
            "r1", "ALL!T2", value="1", state="filled",
            resolved_by="agent", confidence="high",
            sources=[{"database": "cord-ph",
                      "query": "SELECT patient_code, delivery FROM cord_ph_birth_records",
                      "table_column": "cord_ph_birth_records.delivery"}])
        q.put_nowait({"type": "session.idle"})
        return q

    async def prompt_async(self, sid, prompt, directory=None):
        self.calls.append(("prompt", directory))

    async def unsubscribe(self, sid):
        self.calls.append(("unsub", None))

    async def delete_session(self, sid, directory=None):
        self.calls.append(("delete", directory))


def _audit() -> dict:
    return {"fields": [
        {"id": "delivery", "name": "Mode of delivery", "type": "category",
         "permitted_values": {"1": "SVD", "3": "Forceps"}, "notes": "from birth record"},
        {"id": "cord_arterial_ph", "name": "Cord arterial pH", "type": "number"},
    ]}


class TryAgentTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.root = Path(self._dir.name)
        self.store = Store(self.root / "state.db")
        self.store.create_run(Run(id="r1", audit_id="cord-ph", status="in_progress"))
        self.store.materialize_field_codes("r1", _audit())
        self.store.insert_pending_cells([
            Cell(run_id="r1", ref="ALL!T2", field="delivery", member="P001",
                 kind="direct", state="pending"),
            Cell(run_id="r1", ref="ALL!V2", field="cord_arterial_ph", member="P001",
                 kind="direct", state="pending"),
        ])
        self.run_store = RunStore(
            self.store, "r1",
            cohort=["P001", "P002"],
            database_paths={"cord-ph": self.root / "cord-ph.sqlite"},
            audit=_audit(),
            anchor="patient_code",
            cohort_tables={"cord-ph": ["cord_ph_birth_records"]},
        )
        self.run_dir = self.root / "runs" / "r1"
        # Default canonical-model source for the session-driving tests; the
        # provisioning tests pass their own seeded dir explicitly.
        self.databases_dir = self.root / "databases"
        self.databases_dir.mkdir()

    def tearDown(self):
        self.store.close()
        self._dir.cleanup()

    # context sidecar ---------------------------------------------------------

    def test_write_run_context_matches_shared_schema_no_paths(self):
        # The exact keys sql_execute reads (single source of truth in
        # agent/.opencode/tools/_run_sql.build_context) — and NO filesystem paths.
        path = write_run_context(self.run_store, self.run_dir)
        ctx = json.loads(path.read_text())
        self.assertEqual(ctx["run_id"], "r1")
        self.assertEqual(ctx["anchor"], "patient_code")
        self.assertEqual(ctx["cohort"], ["P001", "P002"])
        self.assertEqual(ctx["databases"]["cord-ph"]["cohort_tables"],
                         ["cord_ph_birth_records"])
        # Paths are conveyed by symlinks, never in the context.
        self.assertNotIn("cells", ctx)
        self.assertNotIn("path", ctx["databases"]["cord-ph"])

    # provisioning ------------------------------------------------------------

    def _seed_canonical_model(self, slug: str, model: dict) -> Path:
        """Write a fake ``<databases_dir>/<slug>/model.json`` for the test to read."""
        databases_dir = self.root / "databases"
        (databases_dir / slug).mkdir(parents=True, exist_ok=True)
        (databases_dir / slug / "model.json").write_text(
            json.dumps(model), encoding="utf-8"
        )
        return databases_dir

    def test_provision_symlinks_databases_and_writes_models(self):
        # A real state.db (so the cells symlink has a live target) + a stub
        # hospital db file.
        (self.root / "cord-ph.sqlite").write_text("", encoding="utf-8")
        databases_dir = self._seed_canonical_model("cord-ph", {
            "tables": [{"name": "cord_ph_birth_records",
                        "columns": [{"name": "patient_code"}]}]
        })
        provision_worktree(self.run_store, self.run_dir,
                           databases_dir=databases_dir)
        # Audit spec copied into the worktree.
        audit = json.loads((self.run_dir / "audit" / "spec.json").read_text())
        self.assertEqual(audit["fields"][0]["id"], "delivery")
        # model.json is copied from the canonical var/databases/<slug>/model.json
        # source — never from RunStore (the model is not run-scoped state).
        model = json.loads((self.run_dir / "database" / "cord-ph.model.json").read_text())
        self.assertEqual(model["tables"][0]["name"], "cord_ph_birth_records")
        # Databases symlinked by name — resolvable, pointing at the real files.
        cells_link = self.run_dir / "audit" / "cells.sqlite"
        db_link = self.run_dir / "database" / "cord-ph.sqlite"
        self.assertTrue(cells_link.is_symlink())
        self.assertTrue(db_link.is_symlink())
        self.assertTrue(str(cells_link.resolve()).endswith("state.db"))

    def test_provision_warns_when_canonical_model_missing(self):
        # If var/databases/<slug>/model.json is absent, provisioning continues
        # (no model.json copied for that slug) — never silently introspects.
        (self.root / "cord-ph.sqlite").write_text("", encoding="utf-8")
        databases_dir = self.root / "databases-empty"
        databases_dir.mkdir()
        provision_worktree(self.run_store, self.run_dir,
                           databases_dir=databases_dir)
        self.assertFalse((self.run_dir / "database" / "cord-ph.model.json").exists())
        self.assertTrue((self.run_dir / "database" / "cord-ph.sqlite").is_symlink())

    def test_provision_lays_down_self_contained_opencode_root(self):
        # Storage-layout §4: opencode.json is COPIED (regular file) and
        # .opencode is SYMLINKED to the committed template, so the run dir
        # is a self-contained opencode project root.
        (self.root / "cord-ph.sqlite").write_text("", encoding="utf-8")
        databases_dir = self._seed_canonical_model("cord-ph", {"tables": []})
        provision_worktree(self.run_store, self.run_dir,
                           databases_dir=databases_dir)
        config = self.run_dir / "opencode.json"
        self.assertTrue(config.is_file() and not config.is_symlink(),
                        "opencode.json must be a copy, not a symlink")
        opencode = self.run_dir / ".opencode"
        self.assertTrue(opencode.is_symlink(),
                        ".opencode must be a symlink to the template")
        self.assertEqual(opencode.resolve(),
                         (REPO_ROOT / "core" / "agent" / ".opencode").resolve())

    def test_provision_stamps_provenance_sha_into_context(self):
        # Storage-layout §6: provenance is a git commit SHA stamped into
        # context.json, not a copy of the tool/skill bytes.
        (self.root / "cord-ph.sqlite").write_text("", encoding="utf-8")
        databases_dir = self._seed_canonical_model("cord-ph", {"tables": []})
        provision_worktree(self.run_store, self.run_dir,
                           databases_dir=databases_dir)
        ctx = json.loads((self.run_dir / "context.json").read_text())
        # In a git checkout the SHA is present; in a non-git environment the
        # key is omitted rather than nulled.
        if "provenance" in ctx:
            sha = ctx["provenance"]["commit_sha"]
            self.assertRegex(sha, r"^[0-9a-f]{40}$",
                             "commit_sha must be a 40-char hex SHA")

    # prompt ------------------------------------------------------------------

    def test_prompt_names_databases_defers_to_skill_with_column_triage(self):
        prompt = build_prompt(self.run_store)
        # Names the databases the agent addresses + the skill.
        self.assertIn("cell-fill", prompt)
        self.assertIn("cord-ph", prompt)              # the bound clinical db
        self.assertIn("cells", prompt)                # the worksheet
        self.assertIn("lookup_execute", prompt)       # points at how to read specs
        # The column triage: both fully-pending fields listed as EMPTY columns.
        self.assertIn("EMPTY columns", prompt)
        self.assertIn("`delivery`", prompt)
        self.assertIn("`cord_arterial_ph`", prompt)
        self.assertIn("1 of 1 cells pending", prompt)
        # Per-FIELD only: no per-cell refs, field codes, or schema dump.
        self.assertNotIn("ALL!T2", prompt)            # cell refs are discovered, not dumped
        self.assertNotIn("1=SVD", prompt)             # codes via lookup_execute, not prompt
        self.assertNotIn("permitted codes", prompt)
        # No leaked internals.
        for leaked in ("query_database", "query_cells", "runId", ":cohort", ":run", "P002"):
            self.assertNotIn(leaked, prompt, f"prompt leaks {leaked!r}")

    def test_prompt_triage_classes_partial_and_interpret_columns(self):
        # delivery becomes PARTIAL (P001 filled by an earlier tier, P002 still
        # pending with a hypothesis); a free-text field lands under INTERPRET.
        self.store.insert_pending_cells([
            Cell(run_id="r1", ref="ALL!T3", field="delivery", member="P002",
                 kind="direct", state="pending", hypothesis="value NULL in source"),
            Cell(run_id="r1", ref="ALL!G2", field="reason_declined", member="P001",
                 kind="interpret", state="pending"),
        ])
        self.store.update_cell(
            "r1", "ALL!T2", value="1", state="filled",
            resolved_by="direct", confidence="high",
            sources=[{"database": "cord-ph",
                      "query": "SELECT patient_code, delivery FROM cord_ph_birth_records",
                      "table_column": "cord_ph_birth_records.delivery"}])
        prompt = build_prompt(self.run_store)
        self.assertIn("PARTIAL columns", prompt)
        self.assertIn("1 of 2 cells pending", prompt)         # delivery: one straggler
        self.assertIn("value NULL in source", prompt)         # the earlier tier's hypothesis
        self.assertIn("INTERPRET cells", prompt)
        self.assertIn("`reason_declined`", prompt)
        # cord_arterial_ph is still fully pending — EMPTY section present too.
        self.assertIn("EMPTY columns", prompt)

    # session driving ---------------------------------------------------------

    def test_try_agent_roots_session_in_run_dir_then_finalizes(self):
        client = _FakeClient(self.store)
        session_dir = "runs/r1"  # the agent-root-relative worktree
        asyncio.run(try_agent(
            self.run_store, run_dir=self.run_dir,
            session_directory=session_dir, databases_dir=self.databases_dir,
            client=client))

        # Every directory-scoped session call used the run-specific directory —
        # this is the seam that makes the tools read THIS run's context.
        scoped = [d for m, d in client.calls if m in ("create", "prompt", "delete")]
        self.assertEqual(scoped, [session_dir, session_dir, session_dir])

        # The cell the agent filled stayed filled; the other fell to NOT_LOCATED.
        cells = {c.field: c for c in self.store.get_cells("r1")}
        self.assertEqual(cells["delivery"].state, "filled")
        self.assertEqual(cells["cord_arterial_ph"].state, "blocked")
        self.assertEqual(cells["cord_arterial_ph"].reason_code, "NOT_LOCATED")

    def test_try_agent_without_client_finalizes_everything(self):
        asyncio.run(try_agent(self.run_store, run_dir=self.run_dir,
                              databases_dir=self.databases_dir, client=None))
        for c in self.store.get_cells("r1"):
            self.assertEqual(c.state, "blocked")
            self.assertEqual(c.reason_code, "NOT_LOCATED")
            # The fallback attempt ran no SQL → it omits `sql` (matching Tier 2's
            # convention), never a synthetic "(no further query)" marker.
            self.assertNotIn("sql", c.attempts[-1])
            self.assertEqual(c.attempts[-1]["tier"], "agent")

    def test_finalize_runs_even_when_the_session_transport_throws(self):
        # A transport failure on create_session must NOT strand pending cells —
        # finalize runs in a finally block regardless.
        class ExplodingClient:
            async def create_session(self, title=None, directory=None):
                raise RuntimeError("opencode unreachable")

        with self.assertRaises(RuntimeError):
            asyncio.run(try_agent(self.run_store, run_dir=self.run_dir,
                                  session_directory="runs/r1",
                                  databases_dir=self.databases_dir,
                                  client=ExplodingClient()))
        # Every cell was still settled blocked / NOT_LOCATED.
        for c in self.store.get_cells("r1"):
            self.assertEqual(c.state, "blocked")
            self.assertEqual(c.reason_code, "NOT_LOCATED")

    def test_drive_session_rebroadcasts_out_of_process_agent_writes(self):
        # The agent writes the cell SQLite directly (out-of-process); nothing
        # else emits for those writes, so the session driver polls and
        # rebroadcasts them as cell_update — here the fake's write during the
        # session is streamed before the run ends.
        events = []
        run_store = RunStore(
            self.store, "r1",
            cohort=["P001", "P002"],
            database_paths={"cord-ph": self.root / "cord-ph.sqlite"},
            audit=_audit(),
            anchor="patient_code",
            cohort_tables={"cord-ph": ["cord_ph_birth_records"]},
            emit=events.append,
        )
        client = _FakeClient(self.store)
        asyncio.run(try_agent(run_store, run_dir=self.run_dir,
                              session_directory="runs/r1",
                              databases_dir=self.databases_dir, client=client))
        agent_fills = [
            c for e in events if e.get("type") == "cell_update"
            for c in e["cells"]
            if c["ref"] == "T2" and c["meta"].get("state") == "filled"
        ]
        self.assertTrue(agent_fills, f"agent write was never streamed: {events}")
        self.assertEqual(agent_fills[0]["value"], "1")
        self.assertEqual(agent_fills[0]["meta"]["resolved_by"], "agent")

    def test_session_writes_full_transcript_to_run_dir(self):
        # The agent's reasoning + tool I/O is captured untruncated to
        # var/runs/<id>/agent-activity.jsonl for offline evaluation.
        class _PartsClient(_FakeClient):
            async def subscribe(self, sid):
                q = asyncio.Queue()
                q.put_nowait({"type": "message.part.updated", "properties": {"part": {
                    "id": "r1", "type": "reasoning", "text": "checking the birth record"}}})
                q.put_nowait({"type": "message.part.updated", "properties": {"part": {
                    "id": "t1", "type": "tool", "tool": "sql_execute", "state": {
                        "status": "completed", "title": "q",
                        "input": {"query": "SELECT patient_code FROM cord_ph_birth_records"},
                        "output": "9 rows"}}}})
                q.put_nowait({"type": "session.idle"})
                return q

        asyncio.run(try_agent(self.run_store, run_dir=self.run_dir,
                              session_directory="runs/r1",
                              databases_dir=self.databases_dir,
                              client=_PartsClient(self.store)))

        log_path = self.run_dir / "agent-activity.jsonl"
        self.assertTrue(log_path.exists(), "transcript log was not written")
        lines = [json.loads(line) for line in
                 log_path.read_text(encoding="utf-8").strip().split("\n")]
        meta = lines[0]
        self.assertEqual(meta["kind"], "meta")
        self.assertIn("Fill this audit's pending cells", meta["prompt"])  # build_prompt output
        self.assertEqual(meta["stats"]["tool_calls"], 1)
        self.assertEqual(meta["stats"]["thinking_blocks"], 1)
        kinds = [r.get("kind") for r in lines[1:]]
        self.assertIn("thinking", kinds)
        self.assertIn("tool", kinds)
        tool_rec = next(r for r in lines[1:] if r["kind"] == "tool")
        self.assertEqual(tool_rec["input"], {"query": "SELECT patient_code FROM cord_ph_birth_records"})
        self.assertEqual(tool_rec["output"], "9 rows")

    def test_make_tier_agent_adapts_to_orchestrator_signature(self):
        # The adapter must be callable as tier(run_store) and drive try_agent.
        client = _FakeClient(self.store)
        tier = make_tier_agent(run_dir=self.run_dir, session_directory="runs/r1",
                               databases_dir=self.databases_dir, client=client)
        asyncio.run(tier(self.run_store))
        self.assertEqual(self.store.get_cell("r1", "ALL!T2").state, "filled")
        self.assertEqual(self.store.get_cell("r1", "ALL!V2").reason_code, "NOT_LOCATED")

    def test_finalize_is_idempotent_on_already_settled(self):
        self.store.update_cell("r1", "ALL!T2", value="1", state="filled",
                               resolved_by="agent", confidence="high",
                               sources=[{"database": "h", "query": "Q",
                                         "table_column": "t.c"}])
        settled = asyncio.run(finalize_unresolved(self.run_store))
        self.assertEqual(settled, 1)  # only the one still-open cell
        self.assertEqual(self.store.get_cell("r1", "ALL!T2").state, "filled")

    # opencode allow-list -----------------------------------------------------

    def test_opencode_permissions_allow_only_the_two_sql_tools(self):
        cfg = json.loads((REPO_ROOT / "core/agent/opencode.json").read_text())
        perms = cfg["permission"]
        self.assertEqual(perms.get("*"), "deny")
        allowed = {k for k, v in perms.items() if isinstance(v, str) and v == "allow"}
        self.assertEqual(allowed, {"sql_execute", "lookup_execute"})
        self.assertEqual(perms["skill"].get("cell-fill"), "allow")
        self.assertEqual(perms["skill"].get("*"), "deny")
        for legacy in ("populate_region", "table_read",
                       "table_write_values", "notes_write"):
            self.assertNotEqual(perms.get(legacy), "allow")


class AgentActivityFromPartTest(unittest.TestCase):
    """The Tier-3 part → activity mapper that lets the run stream follow the
    agent's tool calls and thinking (doc 11 §agent_activity). Bounded emission
    is the whole point: the token-by-token part stream must NOT flood the log."""

    def test_tool_running_then_completed_forwards_once_each(self):
        seen: dict[str, str] = {}
        running = {"id": "p1", "type": "tool", "tool": "sql_execute",
                   "state": {"status": "running"}}
        ev = agent_activity_from_part(running, seen)
        self.assertIsNotNone(ev)
        self.assertEqual(ev["kind"], "tool")
        # A second update at the SAME status is suppressed.
        self.assertIsNone(agent_activity_from_part(dict(running), seen))
        # The status transition to completed forwards again.
        done = {"id": "p1", "type": "tool", "tool": "sql_execute",
                "state": {"status": "completed"}}
        ev2 = agent_activity_from_part(done, seen)
        self.assertIsNotNone(ev2)
        self.assertEqual(ev2["kind"], "tool")

    def test_tool_pending_status_is_not_forwarded(self):
        self.assertIsNone(agent_activity_from_part(
            {"id": "p", "type": "tool", "tool": "x", "state": {"status": "pending"}}, {}))

    def test_tool_state_title_is_used_as_headline(self):
        ev = agent_activity_from_part(
            {"id": "p", "type": "tool", "tool": "sql_execute",
             "state": {"status": "running", "title": "SELECT * FROM patients"}}, {})
        self.assertEqual(ev["headline"], "SELECT * FROM patients")

    def test_reasoning_forwards_as_thinking_then_throttles_until_growth(self):
        seen: dict[str, str] = {}
        ev = agent_activity_from_part(
            {"id": "r1", "type": "reasoning", "text": "Cross-checking the dose"}, seen)
        self.assertIsNotNone(ev)
        self.assertEqual(ev["kind"], "thinking")
        self.assertEqual(ev["label"], "Thinking")
        # Small growth within the same bucket is suppressed (no flood).
        self.assertIsNone(agent_activity_from_part(
            {"id": "r1", "type": "reasoning", "text": "Cross-checking the dose now"}, seen))
        # Crossing the next ~400-char bucket forwards again.
        big = {"id": "r1", "type": "reasoning", "text": "x" * 450}
        self.assertIsNotNone(agent_activity_from_part(big, seen))

    def test_reasoning_headline_is_full_text_with_id(self):
        # The wire carries the FULL text (the FE caps the DISPLAY and expands on
        # click) and a stable id so chunks upsert into one line.
        ev = agent_activity_from_part(
            {"id": "r", "type": "reasoning", "text": "y" * 1000}, {})
        self.assertEqual(len(ev["headline"]), 1000)
        self.assertFalse(ev["headline"].endswith("…"))
        self.assertEqual(ev["id"], "r")
        self.assertEqual(ev["kind"], "thinking")

    def test_tool_and_thinking_carry_part_id_for_upsert(self):
        self.assertEqual(
            agent_activity_from_part(
                {"id": "t9", "type": "tool", "tool": "sql_execute",
                 "state": {"status": "running"}}, {})["id"],
            "t9")

    def test_empty_text_and_unknown_types_are_ignored(self):
        self.assertIsNone(agent_activity_from_part({"id": "r", "type": "reasoning", "text": "  "}, {}))
        self.assertIsNone(agent_activity_from_part({"id": "s", "type": "step-start"}, {}))
        self.assertIsNone(agent_activity_from_part({}, {}))
        self.assertIsNone(agent_activity_from_part(None, {}))

    def test_tool_with_non_dict_state_does_not_raise(self):
        # A drifted/garbage frame whose `state` is not an object must return None,
        # not raise — the call site is outside try/except, so a raise would fail
        # the whole run.
        self.assertIsNone(agent_activity_from_part(
            {"id": "p", "type": "tool", "tool": "x", "state": "oops"}, {}))
        self.assertIsNone(agent_activity_from_part(
            {"id": "p", "type": "tool", "tool": "x", "state": ["nope"]}, {}))


class AgentTranscriptTest(unittest.TestCase):
    """The full-fidelity transcript persisted to var/runs/<id>/ for offline
    evaluation of the agent's process (prompt, reasoning, tool I/O, efficiency)."""

    def test_tool_record_captures_untruncated_io(self):
        rec = _part_transcript_record({
            "id": "t1", "type": "tool", "tool": "sql_execute",
            "state": {
                "status": "completed", "title": "query patients",
                "input": {"query": "SELECT * FROM patients"},
                "output": "z" * 5000, "time": {"start": 1, "end": 2},
            },
        })
        self.assertEqual(rec["kind"], "tool")
        self.assertEqual(rec["tool"], "sql_execute")
        self.assertEqual(rec["input"], {"query": "SELECT * FROM patients"})
        self.assertEqual(len(rec["output"]), 5000)  # NOT truncated (unlike the UI)

    def test_reasoning_record_keeps_full_text(self):
        rec = _part_transcript_record({"id": "r1", "type": "reasoning", "text": "x" * 2000})
        self.assertEqual(rec["kind"], "thinking")
        self.assertEqual(len(rec["text"]), 2000)

    def test_record_skips_markers_and_empty_but_tool_state_is_safe(self):
        self.assertIsNone(_part_transcript_record({"type": "reasoning", "text": "  "}))
        self.assertIsNone(_part_transcript_record({"type": "step-start"}))
        self.assertIsNone(_part_transcript_record(None))
        # A tool with a non-dict state still records (status None), never raises.
        rec = _part_transcript_record({"id": "t", "type": "tool", "tool": "x", "state": "bad"})
        self.assertEqual(rec["kind"], "tool")
        self.assertIsNone(rec["status"])

    def test_stats_summarize_the_turn(self):
        records = [
            {"kind": "thinking", "text": "abc"},
            {"kind": "tool", "tool": "sql_execute", "status": "completed"},
            {"kind": "tool", "tool": "sql_execute", "status": "error"},
            {"kind": "tool", "tool": "lookup_execute", "status": "completed"},
            {"kind": "text", "text": "hi"},
        ]
        s = _transcript_stats(records)
        self.assertEqual(s["tool_calls"], 3)
        self.assertEqual(s["tool_calls_by_name"], {"sql_execute": 2, "lookup_execute": 1})
        self.assertEqual(s["tool_errors"], 1)
        self.assertEqual(s["thinking_blocks"], 1)
        self.assertEqual(s["thinking_chars"], 3)
        self.assertEqual(s["text_blocks"], 1)

    def test_write_log_emits_meta_then_records(self):
        with tempfile.TemporaryDirectory() as d:
            t0 = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
            t1 = datetime(2026, 1, 1, 0, 0, 5, tzinfo=timezone.utc)
            path = write_agent_activity_log(
                Path(d), run_id="run-1", execution_id=None, session_id="s1",
                prompt="do the thing", databases=["ehr"],
                records=[{"id": "r1", "kind": "thinking", "text": "hmm"}],
                started_at=t0, ended_at=t1, error=None,
            )
            self.assertEqual(path.name, "agent-activity.jsonl")
            lines = path.read_text(encoding="utf-8").strip().split("\n")
            meta = json.loads(lines[0])
            self.assertEqual(meta["kind"], "meta")
            self.assertEqual(meta["prompt"], "do the thing")
            self.assertEqual(meta["duration_s"], 5.0)
            self.assertEqual(meta["databases"], ["ehr"])
            self.assertEqual(meta["stats"]["thinking_blocks"], 1)
            self.assertEqual(json.loads(lines[1])["text"], "hmm")

    def test_write_log_uses_execution_suffix_for_refresh(self):
        with tempfile.TemporaryDirectory() as d:
            path = write_agent_activity_log(
                Path(d), run_id="r", execution_id="exec-9", session_id=None,
                prompt=None, databases=None, records=[],
                started_at=None, ended_at=None,
            )
            self.assertEqual(path.name, "agent-activity.exec-9.jsonl")


if __name__ == "__main__":
    unittest.main(verbosity=2)
