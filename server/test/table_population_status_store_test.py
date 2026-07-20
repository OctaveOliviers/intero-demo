"""Route-level lifecycle-record writes for the table-population executor (#326).

Every executor outcome lands its transition on the state store's
``runs.population_status`` record — the ONLY lifecycle record (no status.json
is written any more; the no-file pin below):

* success                → ``completed`` (+ result_status snapshot);
* USER PAUSE (the pinned oddity) → ``completed`` (+ result_status), even
  though the stop endpoint answers "stopped" — only a hard abort/delete
  records ``stopped``;
* hard abort (delete)    → ``stopped``;
* populate failure       → ``error`` (+ detail);
* and the FRESH-population compensation: ``open_session`` records 'running'
  before the run row exists, so the executor creates the row carrying
  ``population_status='running'``.

Style follows server/test/table_population_lifecycle_test.py: route internals
called directly with patched module state, never through a booted app.
"""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from core import table_population
from core.store import Store
from core.table_population import table_population_sessions as sessions
from server.routes import table_populations as route

RUN_ID = "tp-status-store"


class ExecutorStatusStoreWriteTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.db_path = root / "state.db"
        self.run_dir = root / "runs" / RUN_ID
        self.run_dir.mkdir(parents=True)
        # Prime the scratch DB's schema once so concurrent role-tagged opens
        # inside the executor don't race the initial DDL.
        Store(self.db_path).close()

        self.relay = table_population.TablePopulationSessionRelay()
        self._task_snapshot = dict(route._TABLE_POPULATION_SESSION_TASKS)
        route._TABLE_POPULATION_SESSION_TASKS.clear()

        self._stack = ExitStack()
        self._stack.enter_context(
            patch.object(
                route,
                "Store",
                lambda runtime_role="api_app": Store(
                    self.db_path, runtime_role=runtime_role
                ),
            )
        )
        self._stack.enter_context(
            patch.object(
                sessions,
                "_open_status_store",
                lambda: Store(self.db_path, runtime_role="api_app"),
            )
        )
        self._stack.enter_context(
            patch.object(
                route.table_population, "get_session_relay", lambda: self.relay
            )
        )

    def tearDown(self):
        self._stack.close()
        route._TABLE_POPULATION_SESSION_TASKS.clear()
        route._TABLE_POPULATION_SESSION_TASKS.update(self._task_snapshot)
        self._tmp.cleanup()

    # -- helpers --------------------------------------------------------------

    def _launch(self, populate) -> asyncio.Task:
        # The patch must outlive the launch: the session task looks
        # populate_table up when it RUNS, not when it is created. The stack
        # closes in tearDown, after the task has finished.
        self._stack.enter_context(
            patch.object(route.table_population, "populate_table", populate)
        )
        route._launch_table_population_session(
            RUN_ID,
            self.run_dir,
            {
                "source_template": "births",
                "dataset_id": None,
                "table_population_id": RUN_ID,
            },
            user_id="u1",
        )
        return route._TABLE_POPULATION_SESSION_TASKS[RUN_ID]

    def _store_record(self) -> tuple:
        store = Store(self.db_path)
        try:
            run = store.get_run(RUN_ID)
            self.assertIsNotNone(run, "the executor must have created the run row")
            return (
                run.population_status,
                run.population_status_detail,
                run.population_result_status,
            )
        finally:
            store.close()

    def _assert_no_status_file(self) -> None:
        # THE NO-FILE PIN: the status.json machinery is dead — no executor
        # outcome may recreate the file.
        self.assertFalse((self.run_dir / "status.json").exists())

    @staticmethod
    def _blocking_populate(started: asyncio.Event):
        async def _populate(*_a, **_k):
            started.set()
            await asyncio.Event().wait()

        return _populate

    # -- scenarios ------------------------------------------------------------

    async def test_success_records_completed_with_result_snapshot(self):
        async def _populate(*_a, emit, **_k):
            emit({"type": "review_summary", "summary": {}})
            return SimpleNamespace(bound_database_ids=[], refresh_stats=None)

        task = self._launch(_populate)
        await asyncio.wait_for(task, timeout=5.0)

        # The snapshot carries the cell-derived result status at completion
        # time (the executor created the run row as 'in_progress'; no cells
        # ever resolved in this fixture, so that is what gets snapshotted).
        self.assertEqual(self._store_record(), ("completed", None, "in_progress"))
        self._assert_no_status_file()

    async def test_user_pause_records_the_completed_oddity(self):
        # THE PINNED ODDITY: a user pause finalizes the record as 'completed'
        # (with a result_status) while the /stop endpoint answers "stopped" —
        # only a hard abort/delete records 'stopped'.
        started = asyncio.Event()
        task = self._launch(self._blocking_populate(started))
        await asyncio.wait_for(started.wait(), timeout=5.0)

        self.assertTrue(
            await route._stop_table_population_internal(RUN_ID, finalize=True)
        )
        await asyncio.wait_for(task, timeout=5.0)

        record = self._store_record()
        self.assertEqual(record, ("completed", None, "in_progress"))
        self.assertNotEqual(record[0], "stopped")
        self._assert_no_status_file()

    async def test_hard_abort_records_stopped(self):
        started = asyncio.Event()
        task = self._launch(self._blocking_populate(started))
        await asyncio.wait_for(started.wait(), timeout=5.0)

        self.assertTrue(
            await route._stop_table_population_internal(RUN_ID, finalize=False)
        )
        try:
            await asyncio.wait_for(task, timeout=5.0)
        except asyncio.CancelledError:
            pass

        self.assertEqual(self._store_record(), ("stopped", "Stopped by user.", None))
        self._assert_no_status_file()

    async def test_populate_failure_records_error(self):
        async def _populate(*_a, **_k):
            raise RuntimeError("boom")

        task = self._launch(_populate)
        await asyncio.wait_for(task, timeout=5.0)

        self.assertEqual(
            self._store_record(), ("error", "Table population failed: boom", None)
        )
        self._assert_no_status_file()

    async def test_fresh_run_row_is_born_running(self):
        # open_session records 'running' before the run row exists, so that
        # write has nowhere to land; the executor compensates by creating the
        # row with population_status='running' — the same transition, landed
        # at row birth.
        started = asyncio.Event()
        task = self._launch(self._blocking_populate(started))
        await asyncio.wait_for(started.wait(), timeout=5.0)

        self.assertEqual(self._store_record(), ("running", None, None))
        self._assert_no_status_file()

        await route._stop_table_population_internal(RUN_ID, finalize=False)
        try:
            await asyncio.wait_for(task, timeout=5.0)
        except asyncio.CancelledError:
            pass


if __name__ == "__main__":
    unittest.main(verbosity=2)
