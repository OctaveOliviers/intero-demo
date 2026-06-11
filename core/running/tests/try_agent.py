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
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from core.running.orchestrator import RunStore  # noqa: E402
from core.running.try_agent import (  # noqa: E402
    build_prompt,
    finalize_unresolved,
    make_tier_agent,
    provision_worktree,
    try_agent,
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

    def test_prompt_is_minimal_names_databases_defers_to_skill(self):
        prompt = build_prompt(self.run_store)
        # Names the databases the agent addresses + the skill, and nothing heavy.
        self.assertIn("cell-fill", prompt)
        self.assertIn("cord-ph", prompt)              # the bound clinical db
        self.assertIn("cells", prompt)                # the worksheet
        self.assertIn("lookup_execute", prompt)       # points at how to read specs
        # MINIMAL: no inline worklist, field codes, schema dump, or single-DB lock-in.
        self.assertNotIn("ALL!T2", prompt)            # worklist is discovered, not dumped
        self.assertNotIn("1=SVD", prompt)             # codes via lookup_execute, not prompt
        self.assertNotIn("permitted codes", prompt)
        # No leaked internals.
        for leaked in ("query_database", "query_cells", "runId", ":cohort", ":run", "P002"):
            self.assertNotIn(leaked, prompt, f"prompt leaks {leaked!r}")

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


if __name__ == "__main__":
    unittest.main(verbosity=2)
