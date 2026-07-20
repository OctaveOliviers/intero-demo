"""Route-level lifecycle tests for table-population stop/abort + the record.

Covers:

* Bug #7 — pause (sets ``stop_requested``) followed by abort/delete must NOT
  leave the recorded status as ``completed``. The session task's
  CancelledError handler reads ``is_stop_requested()``; if abort doesn't
  override the prior pause it finalizes the deleted run as ``completed``,
  disagreeing with the terminal stop error the client received.
* Bug #13 — the route writes through the SINGLE canonical writer
  (``record_status``) and reads back through the SINGLE fail-safe reader —
  the run row's ``population_status`` record: a run with no recorded
  lifecycle status must not read back as ``running``.
"""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from core import table_population
from core.store import Run, Store
from core.table_population import table_population_sessions as sessions
from server.routes import table_populations as route


class _BlockingStore:
    """Minimal store stub: records nothing it can't, blocks only where needed."""

    def __init__(self):
        self.closed = False

    def with_runtime_role(self, _role):
        return self

    def get_run(self, _run_id):
        # None on the first read → not a refresh (the create_run path), so the
        # heavy _prepare_refresh_delta surface isn't needed. Later reads (final
        # status) tolerate None too.
        return None

    def create_run(self, *_a, **_k):
        return None

    def update_run(self, *_a, **_k):
        return None

    def create_execution(self, *_a, **_k):
        return None

    def update_execution_status(self, *_a, **_k):
        return None

    def recompute_status(self, *_a, **_k):
        return None

    def get_cells(self, *_a, **_k):
        return []

    def close(self):
        self.closed = True


class StopThenAbortStatusTest(unittest.IsolatedAsyncioTestCase):
    """Bug #7: pause then delete must not record 'completed'."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.run_dir = root / "tp-stop-abort"
        self.run_dir.mkdir()
        self.db_path = root / "state.db"
        # A real scratch store for the lifecycle record (the route's Store
        # stays the blocking stub); the run row exists so transitions land.
        seed = Store(self.db_path)
        seed.create_run(Run(id="tp-stop-abort", audit_id="npda", status="in_progress"))
        seed.close()
        db_path = self.db_path
        self._seam = patch.object(
            sessions,
            "_open_status_store",
            lambda: Store(db_path, runtime_role="api_app"),
        )
        self._seam.start()
        self._task_snapshot = dict(route._TABLE_POPULATION_SESSION_TASKS)
        route._TABLE_POPULATION_SESSION_TASKS.clear()

    def tearDown(self):
        self._seam.stop()
        route._TABLE_POPULATION_SESSION_TASKS.clear()
        route._TABLE_POPULATION_SESSION_TASKS.update(self._task_snapshot)
        self._tmp.cleanup()

    async def test_pause_then_abort_does_not_finalize_as_completed(self):
        run_id = "tp-stop-abort"
        relay = table_population.TablePopulationSessionRelay()
        relay.open_session(run_id, self.run_dir)

        started = asyncio.Event()

        async def _blocking_populate(*_a, **_k):
            # Stand in for the population mid-run (ingredient assembly and the
            # run both live INSIDE populate_table now, so this one patch is the
            # cancellable point): signal we're live, then block until cancelled
            # so the CancelledError handler runs.
            started.set()
            await asyncio.Event().wait()

        with (
            patch.object(route.table_population, "get_session_relay", lambda: relay),
            patch.object(route, "Store", lambda runtime_role=None: _BlockingStore()),
            patch.object(route.table_population, "populate_table", _blocking_populate),
        ):
            route._launch_table_population_session(
                run_id,
                self.run_dir,
                {
                    "source_template": "npda",
                    "dataset_id": None,
                    "table_population_id": run_id,
                },
                execution_id="exec-1",
            )
            task = route._TABLE_POPULATION_SESSION_TASKS[run_id]
            await asyncio.wait_for(started.wait(), timeout=2.0)

            # 1) USER PAUSE — sets stop_requested on the relay session.
            self.assertTrue(relay.request_graceful_stop(run_id))
            self.assertTrue(relay.is_stop_requested(run_id))

            # 2) DELETE/ABORT — hard kill that must override the pause.
            await route._stop_table_population_internal(run_id, finalize=False)
            try:
                await asyncio.wait_for(task, timeout=2.0)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass

        store = Store(self.db_path)
        try:
            status = store.get_run(run_id).population_status
        finally:
            store.close()
        self.assertNotEqual(
            status,
            "completed",
            "pause+abort must not finalize a deleted run as 'completed'",
        )
        # The no-file pin: no transition recreated a status.json.
        self.assertFalse((self.run_dir / "status.json").exists())


class RouteStatusRecordTest(unittest.TestCase):
    """Bug #13: canonical writer -> route reader roundtrip; reader fail-safe."""

    RUN_ID = "tp-route"

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.db_path = root / "state.db"
        self.run_dir = root / "runs" / self.RUN_ID  # the dir name IS the run id
        self.run_dir.mkdir(parents=True)
        seed = Store(self.db_path)
        seed.create_run(Run(id=self.RUN_ID, audit_id="npda", status="in_progress"))
        seed.close()
        db_path = self.db_path
        self._patches = [
            patch.object(
                route,
                "Store",
                lambda runtime_role="api_app": Store(
                    db_path, runtime_role=runtime_role
                ),
            ),
            patch.object(
                sessions,
                "_open_status_store",
                lambda: Store(db_path, runtime_role="api_app"),
            ),
        ]
        for p in self._patches:
            p.start()

    def tearDown(self):
        for p in self._patches:
            p.stop()
        self._tmp.cleanup()

    def test_canonical_writer_roundtrips_through_route_reader(self):
        sessions.record_status(self.RUN_ID, "completed", result_status="complete")
        self.assertEqual(route._read_table_population_status(self.RUN_ID), "completed")
        # The no-file pin: the canonical writer touches only the store.
        self.assertFalse((self.run_dir / "status.json").exists())

    def test_route_reader_does_not_read_unrecorded_as_running(self):
        # No lifecycle transition ever recorded: fail-safe, never 'running'.
        self.assertNotEqual(route._read_table_population_status(self.RUN_ID), "running")
        # Same for a population with no run row at all.
        self.assertNotEqual(
            route._read_table_population_status("tp-missing"), "running"
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
