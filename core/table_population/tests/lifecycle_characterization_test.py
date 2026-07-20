"""Characterization tests for the table-population lifecycle (issue #326).

The process status of a table population lives in the STATE STORE — the run
row's ``population_status`` record, written by the single canonical writer
(``record_status``, bug #13). The per-run-dir status.json is GONE (#326):
nothing writes it, nothing reads it. These tests pin the CURRENT semantics —
what IS, not what should be — so any later change must keep them green (or
consciously rewrite them alongside a behaviour change).

Pinned here (core seam):

* the ``running`` record ``open_session`` stamps — and that NO status.json is
  created any more — and the fact that a stale ``running`` RECORD from a
  crashed process reads back as ``running``: the fail-safe ``STATUS_UNKNOWN``
  marker covers only a missing row / unrecorded status; there is NO staleness
  detection;
* the exact ``STATUS_UNKNOWN`` marker value (it leaks to API consumers via the
  refresh 409 message);
* a fresh relay (a restarted process) can neither stop nor repair a crashed
  population — every stop surface returns False and the record keeps saying
  ``running``;
* stop semantics against the durable store: a hard abort marks the record
  ``stopped`` and leaves every persisted cell untouched; a graceful-stop flag
  alone touches NEITHER the record NOR the cells;
* re-run (refresh) preservation at the ``populate_table`` seam: only cells
  still open (``pending``) are resolved — reviewed and clinician-corrected
  cells survive a re-run byte-for-byte.

Complements (does not duplicate):

* ``tests/session_relay_stop.py`` — the two STOP semantics on the relay/stream;
* ``tests/table_population_sessions.py`` — session eviction/reap semantics;
* ``server/test/stream_reconnect_test.py`` — the unknown-run stream error.

Run: ``python3 -m core.table_population.tests.lifecycle_characterization_test``
(also discovered by the pre-push gate's ``discover -s core -p "*_test.py"``).
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

import core.mapping as core_mapping  # noqa: E402
import core.table_population as table_population  # noqa: E402
from core.store import Cell, Run, RunExecution, Store  # noqa: E402
from core.table_population import table_population_sessions as sessions  # noqa: E402
from core.table_population.table_population_sessions import (  # noqa: E402
    STATUS_UNKNOWN,
    TablePopulationSessionRelay,
    population_status_of,
    record_status,
)


def _patch_status_store(case: unittest.TestCase, db_path: Path) -> None:
    """Point the canonical writer's store seam at the test's scratch state DB
    so every record_status transition lands where the test can observe it."""
    patcher = patch.object(
        sessions,
        "_open_status_store",
        lambda: Store(db_path, runtime_role="api_app"),
    )
    patcher.start()
    case.addCleanup(patcher.stop)
    # The writer reuses one long-lived handle; drop any stale handle now and
    # close the scratch one on cleanup so the test never leaks a connection
    # (ResourceWarning) or lands a later test's write on this scratch DB.
    sessions._reset_status_store_handle()
    case.addCleanup(sessions._reset_status_store_handle)


def _population_status(db_path: Path, run_id: str) -> str:
    """Read the population process status exactly as the routes do now: the
    run row through the fail-safe ``population_status_of`` mapping."""
    store = Store(db_path)
    try:
        return population_status_of(store.get_run(run_id))
    finally:
        store.close()


class StatusRunningMarkerTest(unittest.TestCase):
    """The ``running`` record in the state store: how it is stamped, and that
    a stale copy of it is indistinguishable from a live one.

    The store record is what every surface consults — and the ONLY thing
    written: opening a session must no longer create a status.json (the
    no-file pin, #326)."""

    RUN_ID = "tp-lifecycle"

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.db_path = root / "state.db"
        # Production layout: the artifact workspace is var/artifacts/<table_population_id>,
        # and the run row exists by the time transitions land (a fresh
        # population's executor creates it stamped 'running').
        self.run_dir = root / "runs" / self.RUN_ID
        self.run_dir.mkdir(parents=True)
        seed = Store(self.db_path)
        seed.create_run(Run(id=self.RUN_ID, audit_id="births", status="in_progress"))
        seed.close()
        _patch_status_store(self, self.db_path)

    def tearDown(self):
        self._tmp.cleanup()

    def test_open_session_stamps_running_but_preserves_prior_result(self) -> None:
        """Opening a session (create AND refresh reuse this path) flips the
        record to the bare ``running`` marker and clears the stale DETAIL — no
        pid, no heartbeat. That thin schema is WHY a crash is undetectable from
        the record alone (see the next test).

        But the prior run's ``population_result_status`` is PRESERVED, NOT
        nulled (issue #330): a refresh must never destroy the last completed
        run's durable result snapshot, so a refresh that then crashes leaves
        the row ``running`` while the last-known-good result stays visible.
        And the retired file artifact is NOT recreated (the no-file pin)."""
        record_status(self.RUN_ID, "completed", result_status="complete")
        relay = TablePopulationSessionRelay()
        relay.open_session(self.RUN_ID, self.run_dir)
        self.assertEqual(_population_status(self.db_path, self.RUN_ID), "running")
        store = Store(self.db_path)
        try:
            run = store.get_run(self.RUN_ID)
        finally:
            store.close()
        # The detail is replaced (cleared) on the transition...
        self.assertIsNone(run.population_status_detail)
        # ...but the prior completed run's result snapshot survives (#330).
        self.assertEqual(run.population_result_status, "complete")
        # THE NO-FILE PIN: the status.json machinery is dead — opening a
        # session writes the store record and nothing on disk.
        self.assertFalse((self.run_dir / "status.json").exists())

    def test_stale_running_record_reads_back_as_running(self) -> None:
        """CRASH RECOVERY (the known gap): a run row whose record was stamped
        ``running`` by a PREVIOUS process — server crashed or restarted, the
        backing session/task is gone — still reads back as ``running``. The
        fail-safe (``STATUS_UNKNOWN``) only guards a missing row / unrecorded
        status; a stale ``running`` record is trusted verbatim. Nothing at
        startup (``Runtime.startup`` only rescans indexing) reconciles it, so
        the population reports ``running`` forever."""
        # The previous process stamped the record through the canonical
        # writer, exactly as open_session does...
        record_status(self.RUN_ID, "running")
        # ...then died. The new process reads it back through the canonical
        # mapping: no staleness detection, the record wins.
        self.assertEqual(_population_status(self.db_path, self.RUN_ID), "running")

    def test_status_unknown_marker_is_exactly_unknown(self) -> None:
        """The fail-safe schema marker is the exact string ``"unknown"``.

        The exact value matters because it surfaces to API consumers verbatim
        (the refresh 409 interpolates it: "Table population status 'unknown'
        does not allow refresh"). Every degenerate shape maps to the SAME
        marker."""
        self.assertEqual(STATUS_UNKNOWN, "unknown")

        # No run row at all (also the step-1 residual edge: a fresh run
        # cancelled before its row existed).
        self.assertEqual(
            _population_status(self.db_path, "tp-never-existed"), STATUS_UNKNOWN
        )
        # A run row with NO recorded lifecycle status (a pre-#326 run, or one
        # whose transitions never landed) — the seeded row, untouched.
        self.assertEqual(_population_status(self.db_path, self.RUN_ID), STATUS_UNKNOWN)
        # And the mapping itself is fail-closed on degenerate rows.
        self.assertEqual(population_status_of(None), STATUS_UNKNOWN)
        self.assertEqual(population_status_of(object()), STATUS_UNKNOWN)


class CrashedPopulationRelayTest(unittest.IsolatedAsyncioTestCase):
    """A restarted process holds a FRESH relay: the crashed population has no
    session in it, so no stop surface can act on it and nothing repairs the
    stale ``running`` record. Characterization for #326: post-migration, a
    restart must not make these surfaces claim MORE than they do today."""

    async def test_fresh_relay_cannot_stop_or_repair_a_crashed_population(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db_path = root / "state.db"
            run_dir = root / "runs" / "tp-crashed"
            run_dir.mkdir(parents=True)
            seed = Store(db_path)
            seed.create_run(
                Run(id="tp-crashed", audit_id="births", status="in_progress")
            )
            seed.close()
            _patch_status_store(self, db_path)
            # The previous process stamped 'running' through the canonical
            # writer, then the server restarted: the new relay has never seen
            # this id.
            record_status("tp-crashed", "running")
            relay = TablePopulationSessionRelay()

            # Every stop surface reports "nothing to stop" — the population is
            # unknown to the new process even though its record says running.
            self.assertFalse(relay.request_graceful_stop("tp-crashed"))
            self.assertFalse(relay.is_stop_requested("tp-crashed"))
            self.assertFalse(await relay.abort_session("tp-crashed"))

            # None of those reads/attempts repaired the record: it still
            # claims 'running'. (The stream surface for an unknown id — an
            # immediate error frame — is pinned in
            # server/test/stream_reconnect_test.py.)
            self.assertEqual(_population_status(db_path, "tp-crashed"), "running")


class StopPreservesPersistedCellsTest(unittest.IsolatedAsyncioTestCase):
    """Stopping a live population must leave the durable store alone.

    ``tests/session_relay_stop.py`` pins the stream/status side of the two stop
    semantics; this complements it with the STORE side: cells persisted before
    the stop — including reviewed and clinician-corrected ones — survive both
    a hard abort and a graceful-stop flag byte-for-byte. The status RECORD
    lives in the state store (#326), so the stop transition writes right next
    to the cells — and must still never touch them."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.run_dir = root / "tp-stop"  # the dir name IS the run id
        self.run_dir.mkdir()
        self.db_path = root / "state.db"
        self.store = Store(self.db_path)
        _patch_status_store(self, self.db_path)
        self.store.create_run(
            Run(id="tp-stop", audit_id="births", status="in_progress")
        )
        self.store.upsert_cell(
            Cell(
                run_id="tp-stop",
                ref="ALL!A2",
                member="P001",
                field="patient_code",
                kind="direct",
                state="filled",
                value="P001",
                resolved_by="prepopulated",
                sources=[{"database": "d", "query": "q", "table_column": "t.c"}],
            )
        )
        self.store.upsert_cell(
            Cell(
                run_id="tp-stop",
                ref="ALL!B2",
                member="P001",
                field="gestation_weeks",
                kind="interpret",
                state="filled",
                value="38",
                review_state="reviewed",
                corrected=True,
                sources=[{"database": "d", "query": "q", "table_column": "t.c"}],
            )
        )

    def tearDown(self):
        self.store.close()
        self._tmp.cleanup()

    def _cells_snapshot(self) -> list[tuple]:
        return [
            (c.ref, c.state, c.value, c.review_state, c.corrected, c.sources)
            for c in self.store.get_cells("tp-stop")
        ]

    async def test_abort_marks_stopped_and_preserves_persisted_cells(self) -> None:
        """The hard stop (delete path): the record flips to ``stopped`` with
        the canonical detail, and the already-persisted cells — filled,
        reviewed, corrected — are untouched even though the transition now
        writes to the same state DB."""
        before = self._cells_snapshot()
        relay = TablePopulationSessionRelay()
        relay.open_session("tp-stop", self.run_dir)
        self.assertTrue(await relay.abort_session("tp-stop"))

        # The record, through the canonical mapping + its exact payload.
        self.assertEqual(_population_status(self.db_path, "tp-stop"), "stopped")
        run = self.store.get_run("tp-stop")
        self.assertEqual(run.population_status_detail, "Stopped by user.")
        # The no-file pin: the stop wrote no status.json.
        self.assertFalse((self.run_dir / "status.json").exists())

        # The durable cells are byte-for-byte what they were before the stop.
        self.assertEqual(self._cells_snapshot(), before)

    async def test_graceful_stop_flag_touches_neither_status_nor_cells(self) -> None:
        """The user PAUSE: ``request_graceful_stop`` only FLAGS the session —
        it writes no status transition (the session executor's CancelledError
        handler owns finalization, and records the pause as ``completed``, not
        ``stopped``) and it does not touch the cells. The pause flag must stay
        this side-effect-free."""
        before = self._cells_snapshot()
        relay = TablePopulationSessionRelay()
        relay.open_session("tp-stop", self.run_dir)  # stamps 'running'
        self.assertTrue(relay.request_graceful_stop("tp-stop"))

        # The record still says what open_session stamped: 'running'.
        self.assertEqual(_population_status(self.db_path, "tp-stop"), "running")
        # And the durable cells are untouched.
        self.assertEqual(self._cells_snapshot(), before)


# ---------------------------------------------------------------------------
# Re-run preservation at the populate_table seam
# ---------------------------------------------------------------------------

AUDIT_SPEC = {
    "fields": [
        {"id": "patient_code", "name": "Patient code"},
        {"id": "gestation_weeks", "name": "Gestation weeks"},
        {
            "id": "delivery",
            "name": "Delivery",
            "permitted_values": {
                "1": "Spontaneous vaginal",
                "3": "Forceps",
            },
        },
    ]
}

EXECUTABLE = {
    "schema_version": "2",
    "audit_id": "births",
    "workbook": "births.xlsx",
    "identity_keys": ["patient_code"],
    "cohort": {
        "database": "testdb",
        "from": "births b",
        "identity_select": "b.patient_code AS patient_code",
        "where": [],
    },
    "regions": [
        {
            "id": "ALL",
            "sheet": "ALL",
            "kind": "direct",
            "queries": [
                {
                    "database": "testdb",
                    "sql": "SELECT patient_code, gestation_weeks, delivery FROM births "
                    "WHERE patient_code IN (:cohort)",
                }
            ],
            "row_anchor": "patient_code",
            "cell_map": [
                {
                    "field": "patient_code",
                    "column": "patient_code",
                    "table": "births",
                    "cell_template": "{col:A}{row}",
                },
                {
                    "field": "gestation_weeks",
                    "column": "gestation_weeks",
                    "table": "births",
                    "cell_template": "{col:B}{row}",
                },
                {
                    "field": "delivery",
                    "column": "delivery",
                    "table": "births",
                    "cell_template": "{col:C}{row}",
                    "translate": "delivery",
                },
            ],
        }
    ],
    "code_sets": {
        "delivery": {
            "Spontaneous vaginal": "1",
            "Forceps": "3",
        }
    },
}


class _IdleAgentClient:
    """The agent faked at its natural boundary (one opencode session that goes
    idle immediately) — same double as tests/table_population.py."""

    def __init__(self) -> None:
        self.prompts: list[str] = []

    async def create_session(self, title=None, directory=None) -> str:
        return "s1"

    async def subscribe(self, session_id):
        queue: asyncio.Queue = asyncio.Queue()
        queue.put_nowait({"type": "session.idle"})
        return queue

    async def prompt_async(self, session_id, prompt, directory=None) -> None:
        self.prompts.append(prompt)

    async def unsubscribe(self, session_id) -> None:
        pass

    async def delete_session(self, session_id, directory=None) -> None:
        pass


class RerunPreservationSeamTest(unittest.TestCase):
    """A re-run (refresh) resolves ONLY the still-open cells.

    Characterization for the #326 lifecycle migration, at the public
    ``populate_table`` seam: populate_table takes THE REQUEST (the table
    identity dict) and derives its own ingredients, so this test lays the
    request's world on disk (spec.json + the source SQLite) and stubs only
    the LLM edge (``ensure_mapping``). A re-run enters the SAME seam with an
    ``execution_id`` — populate_table detects the existing run, runs the
    refresh delta itself, and skips the fresh pending grid. Prepopulation
    reads its work list from ``open_cells()`` (state == 'pending'), so
    everything else — plain filled cells, clinician-REVIEWED cells,
    clinician-CORRECTED values — must survive the re-run untouched. The delta
    itself (which cells get reopened) is already pinned in
    server/test/table_population_refresh_delta_test.py; this pins the
    populate side."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.audits_dir = self.root / "audits"
        (self.audits_dir / "births").mkdir(parents=True)
        # spec.json::databases is the seed-time binding hint the assembly
        # defaults the database from when no mapping.json is cached yet.
        (self.audits_dir / "births" / "spec.json").write_text(
            json.dumps({**AUDIT_SPEC, "databases": ["testdb"]}), encoding="utf-8"
        )
        self.databases_dir = self.root / "databases"
        (self.databases_dir / "testdb").mkdir(parents=True)
        self.db_path = self.databases_dir / "testdb" / "database.sqlite"
        self.store = Store(self.root / "state.db")
        # populate_table finalizes through the canonical lifecycle writer; point
        # its store seam at this scratch state DB so the run drives its status
        # writes here (not the real var/state.db) and leaks no connection.
        _patch_status_store(self, self.root / "state.db")

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    def _populate(
        self, run_id: str, *, execution_id: str | None = None
    ) -> tuple[list[dict], _IdleAgentClient]:
        events: list[dict] = []
        client = _IdleAgentClient()
        mapping_json = json.dumps({"databases": ["testdb"], "executable": EXECUTABLE})

        async def fake_ensure_mapping(*_a, **_k):
            return mapping_json

        table = {
            "table_population_id": run_id,
            "source_template": "births",
            "dataset_id": None,
        }
        with patch.object(core_mapping, "ensure_mapping", fake_ensure_mapping):
            asyncio.run(
                table_population.populate_table(
                    self.store,
                    table,
                    emit=events.append,
                    agent_client=client,
                    execution_id=execution_id,
                    artifact_dir=self.root / run_id,
                    templates_dir=self.audits_dir,
                    databases_dir=self.databases_dir,
                )
            )
        return events, client

    def test_rerun_resolves_only_open_cells_preserving_review_and_corrections(
        self,
    ) -> None:
        # --- First run: P002's gestation is NULL in the source, so that one
        # cell ends blocked (idle agent + session-end fallback); the other five
        # cells are prepopulated filled.
        conn = sqlite3.connect(self.db_path)
        try:
            conn.executescript(
                "CREATE TABLE births ("
                "patient_code TEXT, gestation_weeks INTEGER, delivery TEXT"
                ");"
            )
            conn.executemany(
                "INSERT INTO births VALUES (?, ?, ?)",
                [
                    ("P001", 39, "Spontaneous vaginal"),
                    ("P002", None, "Forceps"),
                ],
            )
            conn.commit()
        finally:
            conn.close()
        self.store.create_run(Run(id="rr", audit_id="births", status="in_progress"))

        self._populate("rr")
        self.assertEqual(self.store.get_cell("rr", "ALL!B3").state, "blocked")
        self.assertEqual(self.store.get_cell("rr", "ALL!B2").value, "39")

        # --- Clinician work between the runs: correct P001's gestation and
        # sign off P001's delivery.
        self.store.update_cell("rr", "ALL!B2", value="38", corrected=True)
        self.store.update_cell("rr", "ALL!C2", review_state="reviewed")

        # --- The refresh delta reopens the retryable blocked cell to a bare
        # pending seed (mirrors _prepare_refresh_delta's exact reset), and the
        # source database has since gained the missing value.
        self.store.update_cell(
            "rr",
            "ALL!B3",
            state="pending",
            value=None,
            confidence=None,
            resolved_by=None,
            hypothesis=None,
            attempts=[],
            review_state=None,
            corrected=None,
            explanation=None,
            sources=[],
            reason_code=None,
            reason_detail=None,
            owner_needed=None,
            outstanding_since=None,
        )
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                "UPDATE births SET gestation_weeks = 40 WHERE patient_code = 'P002'"
            )
            conn.commit()
        finally:
            conn.close()

        # --- Re-run: the refresh path (an existing run + an execution id —
        # populate_table runs the delta itself; no fresh pending grid). The
        # execution row exists first, exactly as the route records it before
        # calling populate_table.
        self.store.create_execution(
            RunExecution(id="exec-refresh-1", run_id="rr", status="running")
        )
        events, client = self._populate("rr", execution_id="exec-refresh-1")

        # The ONE open cell was resolved from the source...
        reopened = self.store.get_cell("rr", "ALL!B3")
        self.assertEqual(
            (reopened.state, reopened.value, reopened.resolved_by),
            ("filled", "40", "prepopulated"),
        )
        # ...and it was the only cell the re-run touched (one cell_update on
        # the stream) — with no work left open, the agent never runs.
        kinds = [e["type"] for e in events]
        self.assertEqual(kinds.count("cell_update"), 1)
        self.assertEqual(client.prompts, [])
        # The terminal contract holds on the re-run too.
        self.assertEqual(kinds[-2:], ["review_summary", "done"])

        # The corrected cell keeps the clinician's value, NOT the source's 39.
        corrected = self.store.get_cell("rr", "ALL!B2")
        self.assertEqual(
            (corrected.state, corrected.value, corrected.corrected),
            ("filled", "38", True),
        )
        # The reviewed cell keeps its sign-off and value.
        reviewed = self.store.get_cell("rr", "ALL!C2")
        self.assertEqual(
            (reviewed.state, reviewed.value, reviewed.review_state),
            ("filled", "1", "reviewed"),
        )
        # The untouched filled cells keep their first-run values.
        self.assertEqual(self.store.get_cell("rr", "ALL!A2").value, "P001")
        self.assertEqual(self.store.get_cell("rr", "ALL!A3").value, "P002")
        self.assertEqual(self.store.get_cell("rr", "ALL!C3").value, "3")
        # And the durable run status re-derives from the cells: all filled,
        # nothing awaiting review -> complete.
        self.assertEqual(self.store.get_run("rr").status, "complete")


if __name__ == "__main__":
    unittest.main(verbosity=2)
