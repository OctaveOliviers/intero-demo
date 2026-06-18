"""Verify (C1): a run + its cells + events persist and reload; status derives
from them.

Run: ``python3 -m core.store.store_test``
"""

import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from core.store import Cell, Event, Run, RunExecution, RunMember, Store, derive_status  # noqa: E402
from core.store.store import _CELL_COLS, _EXEC_COLS, _MEMBER_COLS, _RUN_COLS  # noqa: E402


class StorePersistenceTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self._dir.name) / "state.db"

    def tearDown(self):
        self._dir.cleanup()

    def test_run_cells_events_persist_and_reload(self):
        # Write a run + cells + events to a real on-disk DB.
        store = Store(self.db_path)
        run = store.create_run(Run(
            id="run_1",
            audit_id="cord-ph",
            user_id="alice",
            request="run the cord pH audit for 2024",
            template_version="cord-ph@2024-01-01",
            database_ids=["cord-ph", "synthea-data"],
            status="in_progress",
            prompt_versions={"run": "v3"},
            filters=[{"field": "year", "value": "2024"}],
            parameters={"model": "opus"},
        ))
        store.upsert_cell(Cell(
            run_id="run_1", ref="Cases!B12", kind="direct", state="filled",
            value="7.21", confidence="high",
            sources=[{"database": "cord-ph", "query": "SELECT patient_code, ph FROM results WHERE patient_code='m1'",
                       "table_column": "results.ph"}],
        ))
        store.upsert_cell(Cell(
            run_id="run_1", ref="Cases!B13", kind="direct", state="blocked",
            reason_code="IDENTITY_UNRESOLVED", reason_detail="join key missing across DBs",
            owner_needed="data team",
        ))
        store.upsert_cell(Cell(
            run_id="run_1", ref="Cases!C12", kind="interpret", state="filled",
            value="Yes", confidence="medium", review_state="not_reviewed", corrected=False,
            sources=[{"database": "cord-ph",
                      "query": "SELECT patient_code, note_text FROM notes WHERE patient_code='m1'",
                      "table_column": "notes.note_text", "row_id": "n1",
                      "citations": ["cord around neck noted"]}],
        ))
        store.append_event(Event(run_id="run_1", type="activity", payload={"headline": "querying"}))
        store.append_event(Event(run_id="run_1", type="cell_update", payload={"ref": "Cases!B12", "value": "7.21"}))
        store.close()

        # Reopen the same file: everything reloads intact.
        store = Store(self.db_path)
        reloaded = store.get_run("run_1")
        self.assertIsNotNone(reloaded)
        self.assertEqual(reloaded.audit_id, "cord-ph")
        self.assertEqual(reloaded.user_id, "alice")
        self.assertEqual(reloaded.database_ids, ["cord-ph", "synthea-data"])
        self.assertEqual(reloaded.filters, [{"field": "year", "value": "2024"}])
        self.assertEqual(reloaded.prompt_versions, {"run": "v3"})
        self.assertEqual(reloaded.parameters, {"model": "opus"})

        cells = store.get_cells("run_1")
        self.assertEqual(len(cells), 3)
        b12 = store.get_cell("run_1", "Cases!B12")
        self.assertEqual(b12.value, "7.21")
        self.assertEqual(b12.sources[0]["table_column"], "results.ph")
        self.assertIsNotNone(b12.extracted_at)  # stamped on write
        blocked = store.get_cell("run_1", "Cases!B13")
        self.assertEqual(blocked.reason_code, "IDENTITY_UNRESOLVED")
        self.assertEqual(blocked.owner_needed, "data team")
        interp = store.get_cell("run_1", "Cases!C12")
        self.assertEqual(interp.review_state, "not_reviewed")
        self.assertIs(interp.corrected, False)
        self.assertEqual(interp.sources[0]["citations"], ["cord around neck noted"])
        self.assertEqual(interp.sources[0]["row_id"], "n1")

        events = store.get_events("run_1")
        self.assertEqual([e.type for e in events], ["activity", "cell_update"])
        self.assertEqual(events[1].payload["ref"], "Cases!B12")
        store.close()

    def test_status_derives_from_cells(self):
        store = Store(self.db_path)
        store.create_run(Run(id="r", audit_id="cord-ph", status="in_progress", started_at="2024-01-01T00:00:00+00:00"))

        # A blocked cell present → run is blocked.
        store.upsert_cell(Cell(run_id="r", ref="S!A1", kind="direct", state="blocked", reason_code="AWAITING_RESULT", reason_detail="result not yet back"))
        store.upsert_cell(Cell(run_id="r", ref="S!A2", kind="direct", state="filled", value="x",
                               sources=[{"database": "d", "query": "Q", "table_column": "t.c"}]))
        self.assertEqual(store.recompute_status("r"), "blocked")
        self.assertEqual(store.get_run("r").status, "blocked")
        # ...and a durable status_change event was recorded.
        self.assertIn("status_change", [e.type for e in store.get_events("r")])

        # The block resolves on re-run → in_verification (interpret awaits sign-off).
        store.upsert_cell(Cell(run_id="r", ref="S!A1", kind="interpret", state="filled", value="y", review_state="not_reviewed",
                               sources=[{"database": "d", "query": "Q", "table_column": "t.c"}]))
        self.assertEqual(store.recompute_status("r"), "in_verification")

        # Sign-off completes it → complete.
        store.upsert_cell(Cell(run_id="r", ref="S!A1", kind="interpret", state="filled", value="y", review_state="reviewed", corrected=False,
                               sources=[{"database": "d", "query": "Q", "table_column": "t.c"}]))
        self.assertEqual(store.recompute_status("r"), "complete")
        store.close()

    def test_derive_status_unit(self):
        self.assertEqual(derive_status([], started=False), "queued")
        self.assertEqual(derive_status([], started=True), "in_progress")
        self.assertEqual(derive_status([Cell("r", "a", state="not_applicable")]), "complete")
        self.assertEqual(
            derive_status([Cell("r", "a", state="filled"), Cell("r", "b", state="blocked")]),
            "blocked",
        )
        # An out-of-enum state must not be treated as "done" — it falls through
        # to in_progress, never silently completing the run.
        self.assertEqual(derive_status([Cell("r", "a", state="weird")], started=True), "in_progress")

    def test_orphan_cell_rejected(self):
        # FK + PRAGMA foreign_keys=ON: a cell with no parent run is rejected,
        # never silently written.
        store = Store(self.db_path)
        with self.assertRaises(sqlite3.IntegrityError):
            store.upsert_cell(Cell(run_id="ghost", ref="S!A1", state="filled"))
        store.close()

    def test_update_run_unknown_column(self):
        store = Store(self.db_path)
        store.create_run(Run(id="r", audit_id="a"))
        with self.assertRaises(KeyError):
            store.update_run("r", bogus="x")
        store.close()

    def test_recompute_status_missing_run(self):
        store = Store(self.db_path)
        with self.assertRaises(KeyError):
            store.recompute_status("ghost")
        store.close()

    def test_lookups_return_none_on_miss(self):
        store = Store(self.db_path)
        store.create_run(Run(id="r", audit_id="a"))
        self.assertIsNone(store.get_run("ghost"))
        self.assertIsNone(store.get_cell("r", "Sheet!Z99"))
        store.close()

    def test_list_runs_filters_by_user(self):
        store = Store(self.db_path)
        store.create_run(Run(id="r1", audit_id="a", user_id="alice"))
        store.create_run(Run(id="r2", audit_id="a", user_id="bob"))
        self.assertEqual([r.id for r in store.list_runs(user_id="alice")], ["r1"])
        self.assertEqual({r.id for r in store.list_runs()}, {"r1", "r2"})
        store.close()

    def test_empty_and_null_json_roundtrip(self):
        store = Store(self.db_path)
        store.create_run(Run(id="r", audit_id="a"))
        store.upsert_cell(Cell(run_id="r", ref="X", state=None, value=None))
        store.close()

        store = Store(self.db_path)
        run = store.get_run("r")
        self.assertEqual((run.database_ids, run.filters), ([], []))
        self.assertEqual((run.prompt_versions, run.parameters), ({}, {}))
        cell = store.get_cell("r", "X")
        self.assertEqual(cell.sources, [])
        self.assertIsNone(cell.value)
        self.assertIsNone(cell.extracted_at)  # not stamped when value is None
        store.close()

    def test_upsert_cell_replaces_in_place(self):
        store = Store(self.db_path)
        store.create_run(Run(id="r", audit_id="a"))
        store.upsert_cell(Cell(run_id="r", ref="X", state="blocked", value=None,
                               reason_code="NOT_LOCATED", reason_detail="not found"))
        store.upsert_cell(Cell(run_id="r", ref="X", state="filled", value="7",
                               sources=[{"database": "d", "query": "Q", "table_column": "t.c"}]))
        cells = store.get_cells("r")
        self.assertEqual(len(cells), 1)
        self.assertEqual((cells[0].state, cells[0].value), ("filled", "7"))
        store.close()

    def test_insert_pending_cells_batches_the_grid(self):
        # The orchestrator's first write (A0): the full pending grid in one shot.
        store = Store(self.db_path)
        store.create_run(Run(id="r", audit_id="a"))
        store.insert_pending_cells([
            Cell(run_id="r", ref="ALL!A2", field="patient_code", member="P1",
                 kind="direct", state="pending"),
            Cell(run_id="r", ref="ALL!B2", field="gestation_weeks", member="P1",
                 kind="direct", state="pending"),
        ])
        cells = store.get_cells("r")
        self.assertEqual(len(cells), 2)
        self.assertTrue(all(c.state == "pending" and c.value is None for c in cells))
        self.assertEqual({c.field for c in cells}, {"patient_code", "gestation_weeks"})
        store.insert_pending_cells([])  # no-op, no error
        self.assertEqual(len(store.get_cells("r")), 2)
        store.close()

    def test_update_cell_patches_in_place_by_ref(self):
        # A tier's in-place write: patch only the named columns, leave the rest.
        store = Store(self.db_path)
        store.create_run(Run(id="r", audit_id="a"))
        store.insert_pending_cells([
            Cell(run_id="r", ref="ALL!A2", field="delivery", member="P1",
                 kind="direct", state="pending"),
        ])
        out = store.update_cell(
            "r", "ALL!A2", state="filled", value="1", resolved_by="direct",
            attempts=[{"tier": "direct", "database": "d", "sql": "SELECT delivery ...",
                       "result": "1"}],
            sources=[{"database": "d", "query": "Q", "table_column": "t.c"}],
        )
        self.assertEqual((out.state, out.value, out.resolved_by), ("filled", "1", "direct"))
        self.assertEqual(out.attempts[0]["result"], "1")          # json column round-trips
        self.assertEqual((out.field, out.member, out.kind), ("delivery", "P1", "direct"))  # untouched
        with self.assertRaises(KeyError):
            store.update_cell("r", "ALL!A2", bogus_col="x")       # unknown column
        with self.assertRaises(KeyError):
            store.update_cell("r", "ALL!ZZ99", state="filled")    # missing cell
        store.close()

    def test_filling_interpret_cell_auto_flags_not_reviewed(self):
        # An interpret cell needs clinician sign-off: the moment it is filled
        # (without an explicit review_state) the DB trigger marks it
        # not_reviewed, so the derived needs_verification count is right for
        # EVERY writer — including the agent's raw UPDATE. A direct fill never
        # needs review, so its review_state stays NULL.
        store = Store(self.db_path)
        store.create_run(Run(id="r", audit_id="a"))
        store.insert_pending_cells([
            Cell(run_id="r", ref="ALL!A2", field="dcc", member="P1",
                 kind="interpret", state="pending"),
            Cell(run_id="r", ref="ALL!B2", field="age", member="P1",
                 kind="direct", state="pending"),
        ])
        store.update_cell(
            "r", "ALL!A2", state="filled", value="Yes", resolved_by="agent",
            sources=[{"database": "d", "query": "Q", "table_column": "t.c"}],
        )
        store.update_cell(
            "r", "ALL!B2", state="filled", value="40", resolved_by="direct",
            sources=[{"database": "d", "query": "Q", "table_column": "t.c"}],
        )
        self.assertEqual(store.get_cell("r", "ALL!A2").review_state, "not_reviewed")
        self.assertIsNone(store.get_cell("r", "ALL!B2").review_state)
        store.close()

    def test_status_change_event_atomic_with_status(self):
        # The persisted status and its status_change event always agree.
        store = Store(self.db_path)
        store.create_run(Run(id="r", audit_id="a", status="in_progress",
                             started_at="2024-01-01T00:00:00+00:00"))
        store.upsert_cell(Cell(run_id="r", ref="X", state="blocked", reason_code="AWAITING_RESULT", reason_detail="result not yet back"))
        store.recompute_status("r")
        changes = [e for e in store.get_events("r") if e.type == "status_change"]
        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0].payload["to"], store.get_run("r").status)
        store.close()

    def test_store_migrates_pre_refresh_schema(self):
        conn = sqlite3.connect(self.db_path)
        conn.executescript("""
        CREATE TABLE runs (
            id               TEXT PRIMARY KEY,
            audit_id         TEXT NOT NULL,
            user_id          TEXT,
            request          TEXT,
            template_version TEXT,
            database_ids     TEXT,
            status           TEXT NOT NULL DEFAULT 'queued',
            prompt_versions  TEXT,
            filters          TEXT,
            parameters       TEXT,
            started_at       TEXT,
            ended_at         TEXT
        );
        CREATE TABLE events (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id  TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
            ts      TEXT,
            type    TEXT,
            payload TEXT
        );
        """)
        conn.execute("INSERT INTO runs (id, audit_id, status) VALUES (?, ?, ?)", ("r", "a", "queued"))
        conn.execute(
            "INSERT INTO events (run_id, ts, type, payload) VALUES (?, ?, ?, ?)",
            ("r", "2024-01-01T00:00:00+00:00", "activity", "{\"hello\": \"world\"}"),
        )
        conn.commit()
        conn.close()

        store = Store(self.db_path)
        event_cols = {r["name"] for r in store._conn.execute("PRAGMA table_info(events)")}
        self.assertIn("execution_id", event_cols)
        table_names = {
            r["name"] for r in store._conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        self.assertIn("run_executions", table_names)
        self.assertIn("run_members", table_names)
        events = store.get_events("r")
        self.assertEqual(len(events), 1)
        self.assertIsNone(events[0].execution_id)
        self.assertEqual(events[0].payload["hello"], "world")
        store.close()

    def test_execution_lifecycle_transitions(self):
        store = Store(self.db_path)
        store.create_run(Run(id="r", audit_id="a"))
        e1 = store.create_execution(RunExecution(id="e1", run_id="r"))
        self.assertEqual(e1.status, "queued")
        self.assertIsNone(e1.started_at)
        self.assertIsNone(e1.ended_at)

        running = store.update_execution_status("e1", "running")
        self.assertEqual(running.status, "running")
        self.assertIsNotNone(running.started_at)
        self.assertIsNone(running.ended_at)

        completed = store.update_execution_status(
            "e1",
            "completed",
            summary_json={"run_status": "complete"},
        )
        self.assertEqual(completed.status, "completed")
        self.assertIsNotNone(completed.ended_at)
        self.assertEqual(completed.summary_json["run_status"], "complete")

        with self.assertRaises(ValueError):
            store.update_execution_status("e1", "running")
        with self.assertRaises(ValueError):
            store.create_execution(RunExecution(id="bad", run_id="r", status="weird"))

        store.create_execution(RunExecution(id="e2", run_id="r", status="queued"))
        with self.assertRaises(ValueError):
            store.update_execution_status("e2", "completed")
        with self.assertRaises(KeyError):
            store.update_execution_status("missing", "running")
        store.close()

    def test_events_roundtrip_with_and_without_execution_id(self):
        store = Store(self.db_path)
        store.create_run(Run(id="r", audit_id="a"))
        store.create_execution(RunExecution(id="e-123", run_id="r"))
        store.append_event(Event(run_id="r", type="activity", payload={"headline": "first"}))
        store.append_event(
            Event(
                run_id="r",
                type="activity",
                payload={"headline": "second"},
                execution_id="e-123",
            )
        )
        events = store.get_events("r")
        self.assertEqual(len(events), 2)
        self.assertIsNone(events[0].execution_id)
        self.assertEqual(events[1].execution_id, "e-123")
        self.assertEqual(events[1].payload["headline"], "second")
        self.assertEqual(store.count_events("r"), 2)
        self.assertEqual(store.count_events("r", execution_id="e-123"), 1)
        self.assertEqual(store.count_events("r", type="activity"), 2)
        self.assertEqual(
            store.count_events("r", execution_id="e-123", type="activity"),
            1,
        )
        self.assertEqual(store.count_events("r", execution_id="missing"), 0)
        store.close()

    def test_event_rejects_unknown_execution_reference(self):
        store = Store(self.db_path)
        store.create_run(Run(id="r", audit_id="a"))
        with self.assertRaises(ValueError):
            store.append_event(
                Event(
                    run_id="r",
                    type="activity",
                    payload={"headline": "bad"},
                    execution_id="missing",
                )
            )
        store.close()

    def test_run_members_upsert_and_list(self):
        store = Store(self.db_path)
        store.create_run(Run(id="r", audit_id="a"))
        store.create_execution(RunExecution(id="e1", run_id="r"))
        store.create_execution(RunExecution(id="e2", run_id="r"))
        store.upsert_run_member(
            RunMember(
                run_id="r",
                member="m2",
                row_index=2,
                active=True,
                first_seen_execution_id="e1",
                last_seen_execution_id="e1",
            )
        )
        store.upsert_run_member(
            RunMember(
                run_id="r",
                member="m1",
                row_index=1,
                active=True,
                first_seen_execution_id="e1",
                last_seen_execution_id="e1",
            )
        )
        updated = store.upsert_run_member(
            RunMember(
                run_id="r",
                member="m2",
                row_index=3,
                active=False,
                first_seen_execution_id=None,
                last_seen_execution_id="e2",
            )
        )
        self.assertFalse(updated.active)
        self.assertEqual(updated.row_index, 3)
        self.assertEqual(updated.first_seen_execution_id, "e1")
        self.assertEqual(updated.last_seen_execution_id, "e2")

        members = store.list_run_members("r")
        self.assertEqual([m.member for m in members], ["m1", "m2"])
        self.assertEqual([m.row_index for m in members], [1, 3])
        self.assertEqual(store.list_run_members("missing"), [])
        store.close()

    def test_run_member_rejects_unknown_execution_reference(self):
        store = Store(self.db_path)
        store.create_run(Run(id="r", audit_id="a"))
        store.create_execution(RunExecution(id="e1", run_id="r"))
        with self.assertRaises(ValueError):
            store.upsert_run_member(
                RunMember(
                    run_id="r",
                    member="m1",
                    row_index=1,
                    active=True,
                    first_seen_execution_id="missing",
                    last_seen_execution_id="e1",
                )
            )
        with self.assertRaises(ValueError):
            store.upsert_run_member(
                RunMember(
                    run_id="r",
                    member="m1",
                    row_index=1,
                    active=True,
                    first_seen_execution_id="e1",
                    last_seen_execution_id="missing",
                )
            )
        store.close()

    def test_col_lists_match_schema(self):
        # _RUN_COLS / _CELL_COLS hand-mirror the DDL + dataclass field order; if
        # they drift, the positional INSERT corrupts rows. Pin them to the live
        # table schema so drift fails loudly here.
        store = Store(self.db_path)
        run_cols = [r["name"] for r in store._conn.execute("PRAGMA table_info(runs)")]
        cell_cols = [r["name"] for r in store._conn.execute("PRAGMA table_info(cells)")]
        exec_cols = [r["name"] for r in store._conn.execute("PRAGMA table_info(run_executions)")]
        member_cols = [r["name"] for r in store._conn.execute("PRAGMA table_info(run_members)")]
        self.assertEqual(list(_RUN_COLS), run_cols)
        self.assertEqual(list(_CELL_COLS), cell_cols)
        self.assertEqual(list(_EXEC_COLS), exec_cols)
        self.assertEqual(list(_MEMBER_COLS), member_cols)
        store.close()

    def test_with_runtime_role_returns_role_tagged_session(self):
        store = Store(self.db_path)
        agent_store = store.with_runtime_role("agent_runtime_writer")
        self.assertEqual(agent_store.runtime_role, "agent_runtime_writer")
        self.assertEqual(Path(agent_store.path), Path(store.path))
        agent_store.close()
        store.close()

    def test_agent_role_denies_run_updates(self):
        seed = Store(self.db_path)
        seed.create_run(Run(id="r", audit_id="a", status="in_progress"))
        seed.close()

        store = Store(self.db_path, runtime_role="agent_runtime_writer")
        with self.assertRaises(PermissionError):
            store.update_run("r", status="complete")
        store.close()

    def test_clinician_role_denies_provenance_write_columns(self):
        seed = Store(self.db_path)
        seed.create_run(Run(id="r", audit_id="a", status="in_progress"))
        seed.insert_pending_cells([
            Cell(run_id="r", ref="ALL!A2", field="f", member="m", kind="interpret", state="pending")
        ])
        seed.close()

        store = Store(self.db_path, runtime_role="clinician_editor_runtime")
        with self.assertRaises(PermissionError):
            store.update_cell("r", "ALL!A2", attempts=[{"tier": "agent"}])
        with self.assertRaises(PermissionError):
            store.update_cell("r", "ALL!A2")
        with self.assertRaises(PermissionError):
            store.update_cell("r", "ALL!MISSING")
        out = store.update_cell("r", "ALL!A2", review_state="reviewed", corrected=True, value="yes")
        self.assertEqual(out.review_state, "reviewed")
        self.assertTrue(out.corrected)
        store.close()

    def test_orchestrator_role_allows_runtime_run_and_cell_writes(self):
        seed = Store(self.db_path)
        seed.create_run(Run(id="r", audit_id="a", status="queued"))
        seed.insert_pending_cells([
            Cell(run_id="r", ref="ALL!A2", field="f", member="m", kind="direct", state="pending")
        ])
        seed.close()

        store = Store(self.db_path, runtime_role="orchestrator_runtime")
        store.update_run("r", status="in_progress", started_at="2026-01-01T00:00:00+00:00")
        out = store.update_cell(
            "r",
            "ALL!A2",
            state="filled",
            value="1",
            resolved_by="direct",
            confidence="high",
            sources=[{"database": "d", "query": "Q", "table_column": "t.c"}],
            attempts=[{"tier": "direct"}],
        )
        self.assertEqual((out.state, out.value), ("filled", "1"))
        store.append_event(Event(run_id="r", type="status_change", payload={"to": "in_progress"}))
        self.assertEqual(len(store.get_events("r")), 1)
        store.close()

    def test_orchestrator_role_denies_out_of_scope_writes(self):
        seed = Store(self.db_path)
        seed.create_run(Run(id="r", audit_id="a", status="queued"))
        seed.close()

        store = Store(self.db_path, runtime_role="orchestrator_runtime")
        with self.assertRaises(PermissionError):
            store.create_run(Run(id="r2", audit_id="a", status="queued"))
        with self.assertRaises(PermissionError):
            store.update_run("r", audit_id="other")
        store.close()

    def test_unknown_runtime_role_is_fail_closed(self):
        seed = Store(self.db_path)
        seed.create_run(Run(id="r", audit_id="a", status="queued"))
        seed.close()

        store = Store(self.db_path, runtime_role="unknown_role")
        with self.assertRaises(PermissionError):
            store.get_run("r")
        with self.assertRaises(PermissionError):
            store.update_run("r", status="in_progress")
        store.close()


if __name__ == "__main__":
    unittest.main()


class LegacyStateMigrationTest(unittest.TestCase):
    """T13 (doc 5 §Cell state model): opening a pre-change state.db rewrites
    any stored ``needs_verification`` row to ``filled`` + ``review_state
    not_reviewed`` — needs-verification is derived, never stored."""

    def test_legacy_needs_verification_rows_are_migrated_on_open(self):
        with tempfile.TemporaryDirectory() as d:
            db_path = Path(d) / "state.db"
            # A minimal PRE-CHANGE database: the old five-value CHECK and a
            # legacy needs_verification row (with sources, as the old trigger
            # required).
            conn = sqlite3.connect(db_path)
            # Build the legacy table with the CURRENT column set (a real
            # pre-change DB has all of them) but the OLD five-value CHECK.
            cols = ", ".join(f"{c} TEXT" for c in _CELL_COLS)
            conn.executescript(
                f"""
                CREATE TABLE cells (
                    {cols},
                    PRIMARY KEY (run_id, ref),
                    CHECK (state IS NULL OR state IN
                        ('pending', 'filled', 'needs_verification', 'blocked', 'not_applicable'))
                );
                INSERT INTO cells (run_id, ref, kind, state, value, sources)
                VALUES ('r1', 'S!A1', 'interpret', 'needs_verification', 'y',
                        '[{{"database":"d","query":"q","table_column":"t.c"}}]');
                """
            )
            conn.commit()
            conn.close()

            store = Store(db_path)  # applying the schema runs the migration
            cells = store.get_cells("r1")
            self.assertEqual(len(cells), 1)
            self.assertEqual(cells[0].state, "filled")
            self.assertEqual(cells[0].review_state, "not_reviewed")
            # The run derives in_verification from the migrated row.
            self.assertEqual(derive_status(cells, started=True), "in_verification")
