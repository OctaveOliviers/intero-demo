import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from core import table_population
from core.tables import store as table_population_store
from server.routes import table_populations as table_populations_route


class _DummyTask:
    def __init__(self, done: bool) -> None:
        self._done = done

    def done(self) -> bool:
        return self._done


class _FakeStore:
    def __init__(self, run):
        self._run = run
        self.closed = False

    def get_run(self, run_id):
        return self._run

    def close(self):
        self.closed = True


# These tests cover refresh-conflict semantics (404/409, lock, stream reuse),
# not authorization. Bypass the owner-only gate and pass a placeholder request.
_OWNER_REQUEST = SimpleNamespace(
    state=SimpleNamespace(user={"id": "u", "role": "clinician"}, user_id="u")
)


class TablePopulationRefreshRouteTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.runs_dir = Path(self._tmp.name) / "runs"
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self._task_snapshot = dict(
            table_populations_route._TABLE_POPULATION_SESSION_TASKS
        )
        table_populations_route._TABLE_POPULATION_SESSION_TASKS.clear()
        self._lock_snapshot = dict(table_populations_route._REFRESH_START_LOCKS)
        table_populations_route._REFRESH_START_LOCKS.clear()
        self._orig_gate = table_populations_route._require_table_population_owner
        table_populations_route._require_table_population_owner = lambda *a, **k: {
            "id": "u"
        }

    def tearDown(self):
        table_populations_route._require_table_population_owner = self._orig_gate
        table_populations_route._TABLE_POPULATION_SESSION_TASKS.clear()
        table_populations_route._TABLE_POPULATION_SESSION_TASKS.update(
            self._task_snapshot
        )
        table_populations_route._REFRESH_START_LOCKS.clear()
        table_populations_route._REFRESH_START_LOCKS.update(self._lock_snapshot)
        self._tmp.cleanup()

    def test_refresh_404_when_run_missing(self):
        with patch.object(table_populations_route, "ARTIFACTS_DIR", self.runs_dir):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    table_populations_route.refresh_table_population(
                        "missing", _OWNER_REQUEST
                    )
                )
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail["code"], "TABLE_POPULATION_NOT_FOUND")

    def test_refresh_409_when_execution_active(self):
        run_id = "run-1"
        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        table_populations_route._TABLE_POPULATION_SESSION_TASKS[run_id] = _DummyTask(
            done=False
        )
        with patch.object(table_populations_route, "ARTIFACTS_DIR", self.runs_dir):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    table_populations_route.refresh_table_population(
                        run_id, _OWNER_REQUEST
                    )
                )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["code"], "TABLE_POPULATION_ACTIVE")

    def test_refresh_409_when_not_refreshable_status(self):
        run_id = "run-2"
        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        # The status gate reads the run row's population_status record (#326).
        fake_run = SimpleNamespace(population_status="stopped")
        with (
            patch.object(table_populations_route, "ARTIFACTS_DIR", self.runs_dir),
            patch.object(
                table_populations_route, "Store", lambda: _FakeStore(fake_run)
            ),
        ):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    table_populations_route.refresh_table_population(
                        run_id, _OWNER_REQUEST
                    )
                )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(
            ctx.exception.detail["code"], "TABLE_POPULATION_NOT_REFRESHABLE"
        )

    def test_refresh_starts_session_and_returns_execution_id(self):
        run_id = "run-3"
        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        fake_run = SimpleNamespace(
            audit_id="npda",
            database_ids=["npda-clinical"],
            filters={"site": "A"},
            # The refresh gate reads the store record (#326 step 2).
            population_status="completed",
        )
        fake_store = _FakeStore(fake_run)
        calls: list[dict] = []

        def _fake_start_session(run_id, run_dir, table, execution_id=None, **kwargs):
            calls.append(
                {
                    "run_id": run_id,
                    "run_dir": run_dir,
                    "audit_id": table.get("source_template"),
                    "database_id": kwargs.get("database_id"),
                    "filters": kwargs.get("filters"),
                    "execution_id": execution_id,
                }
            )

        with (
            patch.object(table_populations_route, "ARTIFACTS_DIR", self.runs_dir),
            patch.object(table_populations_route, "Store", lambda: fake_store),
            # No owning Table in this fixture — the route synthesizes the
            # table-less legacy identity from the run record.
            patch.object(
                table_populations_route, "_table_for_population_id", lambda _id: None
            ),
            patch.object(
                table_populations_route,
                "_launch_table_population_session",
                _fake_start_session,
            ),
            patch.object(
                table_populations_route, "_new_execution_id", lambda: "exec-test-123"
            ),
        ):
            out = asyncio.run(
                table_populations_route.refresh_table_population(run_id, _OWNER_REQUEST)
            )

        self.assertEqual(out.table_population_id, run_id)
        self.assertEqual(out.execution_id, "exec-test-123")
        self.assertEqual(out.status, "started")
        self.assertTrue(fake_store.closed)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["execution_id"], "exec-test-123")
        self.assertEqual(calls[0]["audit_id"], "npda")
        # No workbook is copied to disk — the run rebuilds its grid from state.db.
        self.assertFalse((run_dir / "result.xlsx").exists())

    def _run_legacy_refresh_capturing_table(self, run_id, attribution):
        """Drive a legacy (table-less) refresh and return the synthesized
        identity dict handed to the launcher. ``attribution`` is what
        ``auth_store.get_run_attribution`` returns for this population."""
        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        fake_run = SimpleNamespace(
            audit_id="npda",
            database_ids=["npda-clinical"],
            filters={},
            population_status="completed",
        )
        captured: list[dict] = []

        def _capture_launch(run_id, run_dir, table, execution_id=None, **kwargs):
            captured.append(table)

        with (
            patch.object(table_populations_route, "ARTIFACTS_DIR", self.runs_dir),
            patch.object(
                table_populations_route, "Store", lambda: _FakeStore(fake_run)
            ),
            # Table-less legacy population — the route synthesizes the identity.
            patch.object(
                table_populations_route, "_table_for_population_id", lambda _id: None
            ),
            patch.object(
                table_populations_route.auth_store,
                "get_run_attribution",
                lambda _id: attribution,
            ),
            patch.object(
                table_populations_route,
                "_launch_table_population_session",
                _capture_launch,
            ),
            patch.object(
                table_populations_route, "_new_execution_id", lambda: "exec-brief"
            ),
        ):
            asyncio.run(
                table_populations_route.refresh_table_population(run_id, _OWNER_REQUEST)
            )
        self.assertEqual(len(captured), 1)
        return captured[0]

    def test_legacy_refresh_threads_recorded_request_as_brief(self):
        """#332: a legacy population's refresh drives the agent with the SAME
        brief its original run recorded — the request text lives on the auth
        attribution row (the core run row never carried it on this path)."""
        brief = "Cord pH for term babies in Q2, flag anything under 7.0"
        table = self._run_legacy_refresh_capturing_table(
            "run-brief",
            {"request": brief, "audit_id": "npda", "filters": {}},
        )
        self.assertEqual(table.get("brief"), brief)
        # The synthesized identity is otherwise the minimal table-less shape.
        self.assertEqual(table["source_template"], "npda")
        self.assertIsNone(table["dataset_id"])

    def test_legacy_refresh_without_recorded_request_carries_no_brief(self):
        """When the original legacy run recorded no request text, there is
        genuinely nothing to carry: the synthesized identity omits `brief`
        entirely (the prompt then keeps its classic no-brief shape)."""
        # No attribution row at all.
        table = self._run_legacy_refresh_capturing_table("run-nobrief-1", None)
        self.assertNotIn("brief", table)
        # An attribution row whose request is empty/None is treated as absent.
        table = self._run_legacy_refresh_capturing_table(
            "run-nobrief-2", {"request": None}
        )
        self.assertNotIn("brief", table)
        table = self._run_legacy_refresh_capturing_table(
            "run-nobrief-3", {"request": ""}
        )
        self.assertNotIn("brief", table)

    def test_refresh_fails_closed_when_the_table_store_is_unavailable(self):
        """A transiently busy/unavailable table store must NOT let a
        table-backed refresh fall through to the legacy whole-DB path.

        The owning-Table lookup raising ``TableError`` (the shared state DB is
        locked) is fail-CLOSED: the refresh 503s and launches nothing, rather
        than synthesizing a ``dataset_id=None`` identity that would populate the
        table over the entire hospital DB under its narrow-cohort disclosure
        (decision 0004 — never silently broaden)."""
        run_id = "run-busy"
        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        fake_run = SimpleNamespace(
            audit_id="npda",
            database_ids=["npda-clinical"],
            filters={},
            population_status="completed",
        )
        launched: list = []

        def _raise_busy(_id):
            raise table_population_store.TableError("database is locked")

        with (
            patch.object(table_populations_route, "ARTIFACTS_DIR", self.runs_dir),
            patch.object(
                table_populations_route, "Store", lambda: _FakeStore(fake_run)
            ),
            patch.object(
                table_populations_route, "_table_for_population_id", _raise_busy
            ),
            patch.object(
                table_populations_route,
                "_launch_table_population_session",
                lambda *a, **k: launched.append((a, k)),
            ),
        ):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    table_populations_route.refresh_table_population(
                        run_id, _OWNER_REQUEST
                    )
                )
        self.assertEqual(ctx.exception.status_code, 503)
        self.assertEqual(launched, [], "no population may launch on a store failure")

    def test_refresh_duplicate_clicks_are_rejected_while_active(self):
        run_id = "run-4"
        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        fake_run = SimpleNamespace(
            audit_id="npda",
            database_ids=["npda-clinical"],
            filters={},
            # The refresh gate reads the store record (#326 step 2).
            population_status="completed",
        )
        calls: list[str] = []

        def _fake_store_factory():
            return _FakeStore(fake_run)

        def _fake_start_session(run_id, *_args, **_kwargs):
            calls.append(run_id)
            table_populations_route._TABLE_POPULATION_SESSION_TASKS[run_id] = (
                _DummyTask(done=False)
            )

        async def _invoke():
            try:
                out = await table_populations_route.refresh_table_population(
                    run_id, _OWNER_REQUEST
                )
                return ("ok", out)
            except HTTPException as exc:
                return ("err", exc)

        async def _run_pair():
            return await asyncio.gather(_invoke(), _invoke())

        with (
            patch.object(table_populations_route, "ARTIFACTS_DIR", self.runs_dir),
            patch.object(table_populations_route, "Store", _fake_store_factory),
            patch.object(
                table_populations_route, "_table_for_population_id", lambda _id: None
            ),
            patch.object(
                table_populations_route,
                "_launch_table_population_session",
                _fake_start_session,
            ),
            patch.object(
                table_populations_route, "_new_execution_id", lambda: "exec-lock-test"
            ),
        ):
            first, second = asyncio.run(_run_pair())

        results = [first, second]
        oks = [r for r in results if r[0] == "ok"]
        errs = [r for r in results if r[0] == "err"]
        self.assertEqual(len(oks), 1)
        self.assertEqual(len(errs), 1)
        self.assertEqual(errs[0][1].status_code, 409)
        self.assertEqual(errs[0][1].detail["code"], "TABLE_POPULATION_ACTIVE")
        self.assertEqual(calls, [run_id])

    def test_refresh_reused_run_id_emits_fresh_stream_events_each_execution(self):
        run_id = "run-5"
        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        fake_run = SimpleNamespace(
            audit_id="npda",
            database_ids=["npda-clinical"],
            filters={},
            # The refresh gate reads the store record (#326 step 2): with the
            # session double below skipping the real terminal write, this
            # static 'completed' is what lets BOTH refreshes pass the gate.
            population_status="completed",
        )

        execution_ids = iter(["exec-reuse-1", "exec-reuse-2"])
        runner = table_population.TablePopulationSessionRelay()

        async def _fake_table_population_session(
            run_id: str,
            run_dir: Path,
            _table: dict[str, object],
            execution_id: str | None = None,
            # Accept whatever the real _execute_table_population_session signature grows (the double
            # broke once when user_id landed without this).
            **_kwargs,
        ) -> None:
            # Strict-v2 vocabulary (doc 5 §Streaming): the double was written
            # pre-#200 with a legacy `log` event and no review_summary — the
            # broker now (correctly) rejects that shape.
            await table_population.get_session_relay().publish_session_event(
                run_id,
                {
                    "type": "activity",
                    "executionId": execution_id,
                    "headline": f"tick:{execution_id}",
                },
            )
            await table_population.get_session_relay().publish_session_event(
                run_id,
                {
                    "type": "review_summary",
                    "executionId": execution_id,
                    "totals": {
                        "cells": 0,
                        "filled": 0,
                        "blocked": 0,
                        "needs_verification": 0,
                        "low_confidence": 0,
                    },
                    "blocking": {"count": 0, "reason_codes": {}, "focus": []},
                    "verification": {
                        "pending": 0,
                        "reviewed": 0,
                        "corrected": 0,
                        "focus": {
                            "needs_review": [],
                            "low_confidence": [],
                            "assumptions": [],
                        },
                    },
                },
            )
            await table_population.get_session_relay().publish_session_event(
                run_id,
                {"type": "done", "executionId": execution_id},
            )
            # No terminal status write here: the gate reads fake_run's static
            # 'completed' record (#326 step 2), so the next refresh proceeds.
            table_populations_route._TABLE_POPULATION_SESSION_TASKS.pop(run_id, None)

        async def _collect_stream_events() -> list[dict]:
            out: list[dict] = []
            async for (
                event
            ) in table_population.get_session_relay().stream_session_events(run_id):
                out.append(event)
            return out

        async def _refresh_then_collect() -> tuple[object, list[dict]]:
            # Do NOT clear the relay by hand: the production refresh path runs
            # open_session, whose eviction-on-reopen is the very thing under test.
            # Popping the prior session here would make the test pass even if that
            # eviction were deleted — so we rely entirely on the production code path.
            response = await table_populations_route.refresh_table_population(
                run_id, _OWNER_REQUEST
            )
            events = await asyncio.wait_for(_collect_stream_events(), timeout=1.0)
            return response, events

        def _fake_store_factory():
            return _FakeStore(fake_run)

        with (
            patch.object(table_populations_route, "ARTIFACTS_DIR", self.runs_dir),
            patch.object(table_population, "get_session_relay", lambda: runner),
            patch.object(table_populations_route, "Store", _fake_store_factory),
            patch.object(
                table_populations_route, "_table_for_population_id", lambda _id: None
            ),
            patch.object(
                table_populations_route,
                "_execute_table_population_session",
                _fake_table_population_session,
            ),
            patch.object(
                table_populations_route,
                "_new_execution_id",
                lambda: next(execution_ids),
            ),
        ):
            first_response, first_events = asyncio.run(_refresh_then_collect())
            second_response, second_events = asyncio.run(_refresh_then_collect())

        self.assertEqual(first_response.execution_id, "exec-reuse-1")
        self.assertEqual(second_response.execution_id, "exec-reuse-2")
        # Each refresh under the SAME run_id yields a fresh stream attributed
        # to ITS execution id, ending in done — the point of the test.
        for events, exec_id in (
            (first_events, "exec-reuse-1"),
            (second_events, "exec-reuse-2"),
        ):
            self.assertEqual(
                [e["type"] for e in events],
                ["activity", "review_summary", "done"],
            )
            self.assertTrue(all(e["executionId"] == exec_id for e in events), events)
            self.assertEqual(events[0]["headline"], f"tick:{exec_id}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
