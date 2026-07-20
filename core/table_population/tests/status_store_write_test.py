"""The store is the ONLY place the population process status is written (#326).

``record_status`` is the single canonical writer: every relay transition
(open_session 'running', abort 'stopped', close-with-error 'error' — including
the relay-INTERNAL contract-error close) lands on the run row's
``population_status`` record, and NOTHING writes a ``status.json`` any more —
that absence is pinned here (the no-file pin).

Run: ``python3 -m core.table_population.tests.status_store_write_test``
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from core.store import Run, Store  # noqa: E402
from core.table_population import table_population_sessions as sessions  # noqa: E402
from core.table_population.table_population_sessions import (  # noqa: E402
    TablePopulationSessionRelay,
    record_status,
    record_status_async,
)

RUN_ID = "tp-store-write"


class _StoreWriteHarness:
    """Shared fixture: a run row in a scratch store + the seam pointed at it.

    Production artifact workspaces are ``var/artifacts/<table_population_id>``;
    the harness lays the dir out the same way so the no-file pin checks the real
    spot.
    """

    def setup(self, case: unittest.TestCase) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        case.addCleanup(self._tmp.cleanup)
        root = Path(self._tmp.name)
        self.db_path = root / "state.db"
        self.run_dir = root / "runs" / RUN_ID
        self.run_dir.mkdir(parents=True)
        seed = Store(self.db_path)
        seed.create_run(Run(id=RUN_ID, audit_id="births", status="in_progress"))
        seed.close()
        patcher = patch.object(
            sessions,
            "_open_status_store",
            lambda: Store(self.db_path, runtime_role="api_app"),
        )
        patcher.start()
        case.addCleanup(patcher.stop)
        # The writer reuses one module-level Store handle (#329); drop any
        # cached handle from a prior test so this test's seam is honored, and
        # again on cleanup so a scratch handle never leaks past the temp dir.
        sessions._reset_status_store_handle()
        case.addCleanup(sessions._reset_status_store_handle)

    def record(self, run_id: str = RUN_ID) -> tuple:
        store = Store(self.db_path)
        try:
            run = store.get_run(run_id)
            return (
                run.population_status,
                run.population_status_detail,
                run.population_result_status,
            )
        finally:
            store.close()

    def assert_no_status_file(self, case: unittest.TestCase) -> None:
        # THE NO-FILE PIN: the status.json machinery is dead; a transition
        # must leave the run dir untouched.
        case.assertFalse((self.run_dir / "status.json").exists())


class CanonicalWriterStoreOnlyTest(unittest.TestCase):
    """The chokepoint: every ``record_status`` call lands in the store — and
    ONLY in the store."""

    def setUp(self):
        self.h = _StoreWriteHarness()
        self.h.setup(self)

    def test_every_transition_lands_in_the_store(self):
        # The full lifecycle vocabulary, each with the payload its real write
        # site uses. status + detail are replaced on every transition;
        # result_status is PRESERVED across a transition that supplies none
        # (#330), so the 'complete' snapshot from the terminal 'completed'
        # write below survives the later transitions that pass result_status
        # None. (expected status, expected detail, expected result_status.)
        steps = [
            (("queued", None, None), ("queued", None, None)),
            (("running", None, None), ("running", None, None)),
            (("completed", None, "complete"), ("completed", None, "complete")),
            # No new snapshot -> the 'complete' snapshot is preserved.
            (
                ("error", "Table population failed: boom", None),
                ("error", "Table population failed: boom", "complete"),
            ),
            (
                ("stopped", "Stopped by user.", None),
                ("stopped", "Stopped by user.", "complete"),
            ),
        ]
        for (status, detail, result_status), expected in steps:
            with self.subTest(status=status):
                record_status(
                    RUN_ID, status, detail=detail, result_status=result_status
                )
                self.assertEqual(self.h.record(), expected)
        self.h.assert_no_status_file(self)

    def test_status_and_detail_replace_but_result_status_is_preserved(self):
        # status + detail are replaced wholesale on each transition; a bare
        # 'running' after an 'error' clears the stale detail. But a transition
        # that supplies no result_status PRESERVES the prior snapshot (#330):
        # starting a refresh ('running') must not null the last completed run's
        # durable result — only a new snapshot overwrites it.
        record_status(RUN_ID, "completed", result_status="complete")
        record_status(RUN_ID, "error", detail="boom")
        self.assertEqual(self.h.record(), ("error", "boom", "complete"))
        record_status(RUN_ID, "running")
        self.assertEqual(self.h.record(), ("running", None, "complete"))

    def test_missing_run_row_does_not_raise(self):
        # The FRESH-population race: open_session records 'running' before the
        # session executor creates the run row — nowhere to land, no raise;
        # the executor compensates by creating the row with
        # population_status='running' (pinned at the route seam in
        # server/test/table_population_status_store_test.py).
        record_status("tp-not-yet-created", "running")
        store = Store(self.h.db_path)
        try:
            self.assertIsNone(store.get_run("tp-not-yet-created"))
        finally:
            store.close()

    def test_store_failure_never_breaks_the_caller(self):
        # A bookkeeping write must not kill a live population mid-run: an
        # unavailable store is logged and swallowed (matching the retired file
        # writer's OSError swallow).
        def _broken_store():
            raise RuntimeError("state store unavailable")

        with patch.object(sessions, "_open_status_store", _broken_store):
            record_status(RUN_ID, "completed", result_status="complete")
        # The record was simply not written; the prior state stands.
        self.assertEqual(self.h.record(), (None, None, None))

    def test_terminal_transition_retries_past_transient_store_errors(self):
        # #329: a terminal transition (completed/error/stopped) that loses the
        # first few writes to state-DB lock contention must NOT be silently
        # dropped — losing it strands a finished population reporting 'running'
        # forever. The writer retries; a transient error that clears before the
        # attempts run out still lands the terminal record.
        real_open = sessions._open_status_store
        calls = {"n": 0}

        def _flaky_open():
            calls["n"] += 1
            if calls["n"] <= 2:  # first two attempts fail, third succeeds
                raise RuntimeError("database is locked")
            return real_open()

        with patch.object(sessions, "_open_status_store", _flaky_open):
            record_status(RUN_ID, "completed", result_status="complete")
        # The terminal transition survived the transient failures.
        self.assertEqual(self.h.record(), ("completed", None, "complete"))
        self.assertGreaterEqual(calls["n"], 3)

    def test_non_terminal_transition_is_best_effort_single_attempt(self):
        # A 'running'/'queued' write is NOT retried (a terminal one always
        # follows carrying the durable truth): one failed attempt, swallowed.
        calls = {"n": 0}

        def _broken_open():
            calls["n"] += 1
            raise RuntimeError("database is locked")

        with patch.object(sessions, "_open_status_store", _broken_open):
            record_status(RUN_ID, "running")
        self.assertEqual(calls["n"], 1)
        self.assertEqual(self.h.record(), (None, None, None))


class RelayTransitionsStoreOnlyTest(unittest.IsolatedAsyncioTestCase):
    """Each relay-owned transition writes the store record: open_session
    ('running'), abort_session ('stopped'), close_session_with_error ('error')
    — including the relay-INTERNAL error close on a broken event contract,
    which never passes through the route layer at all. None of them creates a
    status.json."""

    def setUp(self):
        self.h = _StoreWriteHarness()
        self.h.setup(self)

    def test_open_session_records_running(self):
        relay = TablePopulationSessionRelay()
        relay.open_session(RUN_ID, self.h.run_dir)
        self.assertEqual(self.h.record(), ("running", None, None))
        self.h.assert_no_status_file(self)

    async def test_abort_session_records_stopped(self):
        relay = TablePopulationSessionRelay()
        relay.open_session(RUN_ID, self.h.run_dir)
        self.assertTrue(await relay.abort_session(RUN_ID))
        self.assertEqual(self.h.record(), ("stopped", "Stopped by user.", None))
        self.h.assert_no_status_file(self)

    async def test_close_session_with_error_records_error(self):
        relay = TablePopulationSessionRelay()
        relay.open_session(RUN_ID, self.h.run_dir)
        await relay.close_session_with_error(RUN_ID, "it broke")
        self.assertEqual(self.h.record(), ("error", "it broke", None))
        self.h.assert_no_status_file(self)

    async def test_async_terminal_transition_retries_past_transient_errors(self):
        # #2/#329: the async writer the relay/finalizers use retries a terminal
        # transition (awaiting asyncio.sleep between attempts, never blocking the
        # loop) so a write lost to transient lock contention still lands.
        real_open = sessions._open_status_store
        calls = {"n": 0}

        def _flaky_open():
            calls["n"] += 1
            if calls["n"] <= 2:  # first two attempts fail, third succeeds
                raise RuntimeError("database is locked")
            return real_open()

        with patch.object(sessions, "_open_status_store", _flaky_open):
            await record_status_async(RUN_ID, "completed", result_status="complete")
        self.assertEqual(self.h.record(), ("completed", None, "complete"))
        self.assertGreaterEqual(calls["n"], 3)

    async def test_relay_internal_contract_error_records_error(self):
        # 'done' before 'review_summary' makes the relay close ITSELF with an
        # error — a write site inside publish_session_event that no route
        # wrapper sees. The chokepoint still records it.
        relay = TablePopulationSessionRelay()
        relay.open_session(RUN_ID, self.h.run_dir)
        await relay.publish_session_event(RUN_ID, {"type": "done"})
        self.assertEqual(
            self.h.record(),
            ("error", "done emitted before review_summary", None),
        )
        self.h.assert_no_status_file(self)


if __name__ == "__main__":
    unittest.main(verbosity=2)
