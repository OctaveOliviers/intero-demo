import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from core.running.stream_runner import SpineRunBroker
from server.routes import runs as runs_route


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


class RunRefreshRouteTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.runs_dir = Path(self._tmp.name) / "runs"
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self._spine_snapshot = dict(runs_route._SPINE_TASKS)
        runs_route._SPINE_TASKS.clear()
        self._lock_snapshot = dict(runs_route._REFRESH_START_LOCKS)
        runs_route._REFRESH_START_LOCKS.clear()

    def tearDown(self):
        runs_route._SPINE_TASKS.clear()
        runs_route._SPINE_TASKS.update(self._spine_snapshot)
        runs_route._REFRESH_START_LOCKS.clear()
        runs_route._REFRESH_START_LOCKS.update(self._lock_snapshot)
        self._tmp.cleanup()

    def test_refresh_404_when_run_missing(self):
        with patch.object(runs_route, "RUNS_DIR", self.runs_dir):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(runs_route.refresh_run("missing"))
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail["code"], "RUN_NOT_FOUND")

    def test_refresh_409_when_execution_active(self):
        run_id = "run-1"
        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        (run_dir / "status.json").write_text(
            json.dumps({"status": "completed"}), encoding="utf-8"
        )
        runs_route._SPINE_TASKS[run_id] = _DummyTask(done=False)
        with patch.object(runs_route, "RUNS_DIR", self.runs_dir):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(runs_route.refresh_run(run_id))
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["code"], "RUN_EXECUTION_ACTIVE")

    def test_refresh_409_when_not_refreshable_status(self):
        run_id = "run-2"
        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        (run_dir / "status.json").write_text(
            json.dumps({"status": "stopped"}), encoding="utf-8"
        )
        with patch.object(runs_route, "RUNS_DIR", self.runs_dir):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(runs_route.refresh_run(run_id))
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["code"], "RUN_NOT_REFRESHABLE")

    def test_refresh_starts_spine_and_returns_execution_id(self):
        run_id = "run-3"
        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        (run_dir / "status.json").write_text(
            json.dumps({"status": "completed"}), encoding="utf-8"
        )
        fake_run = SimpleNamespace(
            audit_id="npda",
            database_ids=["npda-clinical"],
            filters={"site": "A"},
        )
        fake_store = _FakeStore(fake_run)
        calls: list[dict] = []

        def _fake_start_spine(run_id, run_dir, audit_id, database_id, filters, execution_id=None):
            calls.append(
                {
                    "run_id": run_id,
                    "run_dir": run_dir,
                    "audit_id": audit_id,
                    "database_id": database_id,
                    "filters": filters,
                    "execution_id": execution_id,
                }
            )

        with (
            patch.object(runs_route, "RUNS_DIR", self.runs_dir),
            patch.object(runs_route, "Store", lambda: fake_store),
            patch.object(runs_route, "_start_spine_run", _fake_start_spine),
            patch.object(runs_route, "_new_execution_id", lambda: "exec-test-123"),
        ):
            out = asyncio.run(runs_route.refresh_run(run_id))

        self.assertEqual(out.run_id, run_id)
        self.assertEqual(out.execution_id, "exec-test-123")
        self.assertEqual(out.status, "started")
        self.assertTrue(fake_store.closed)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["execution_id"], "exec-test-123")
        self.assertEqual(calls[0]["audit_id"], "npda")
        # No workbook is copied to disk — the run rebuilds its grid from state.db.
        self.assertFalse((run_dir / "result.xlsx").exists())

    def test_refresh_duplicate_clicks_are_rejected_while_active(self):
        run_id = "run-4"
        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        (run_dir / "status.json").write_text(
            json.dumps({"status": "completed"}), encoding="utf-8"
        )
        fake_run = SimpleNamespace(
            audit_id="npda",
            database_ids=["npda-clinical"],
            filters={},
        )
        calls: list[str] = []

        def _fake_store_factory():
            return _FakeStore(fake_run)

        def _fake_start_spine(run_id, *_args, **_kwargs):
            calls.append(run_id)
            runs_route._SPINE_TASKS[run_id] = _DummyTask(done=False)

        async def _invoke():
            try:
                out = await runs_route.refresh_run(run_id)
                return ("ok", out)
            except HTTPException as exc:
                return ("err", exc)

        async def _run_pair():
            return await asyncio.gather(_invoke(), _invoke())

        with (
            patch.object(runs_route, "RUNS_DIR", self.runs_dir),
            patch.object(runs_route, "Store", _fake_store_factory),
            patch.object(runs_route, "_start_spine_run", _fake_start_spine),
            patch.object(runs_route, "_new_execution_id", lambda: "exec-lock-test"),
        ):
            first, second = asyncio.run(_run_pair())

        results = [first, second]
        oks = [r for r in results if r[0] == "ok"]
        errs = [r for r in results if r[0] == "err"]
        self.assertEqual(len(oks), 1)
        self.assertEqual(len(errs), 1)
        self.assertEqual(errs[0][1].status_code, 409)
        self.assertEqual(errs[0][1].detail["code"], "RUN_EXECUTION_ACTIVE")
        self.assertEqual(calls, [run_id])

    def test_refresh_reused_run_id_emits_fresh_stream_events_each_execution(self):
        run_id = "run-5"
        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        (run_dir / "status.json").write_text(
            json.dumps({"status": "completed"}), encoding="utf-8"
        )
        fake_run = SimpleNamespace(
            audit_id="npda",
            database_ids=["npda-clinical"],
            filters={},
        )

        execution_ids = iter(["exec-reuse-1", "exec-reuse-2"])
        runner = SpineRunBroker()

        async def _fake_run_spine(
            run_id: str,
            run_dir: Path,
            _audit_id: str,
            _database_id: str | None,
            _filters: dict[str, str],
            execution_id: str | None = None,
            # Accept whatever the real _run_spine signature grows (the double
            # broke once when user_id landed without this).
            **_kwargs,
        ) -> None:
            # Strict-v2 vocabulary (doc 5 §Streaming): the double was written
            # pre-#200 with a legacy `log` event and no review_summary — the
            # broker now (correctly) rejects that shape.
            await runs_route.runner_mod.runner.publish(
                run_id,
                {
                    "type": "activity",
                    "executionId": execution_id,
                    "headline": f"tick:{execution_id}",
                },
            )
            await runs_route.runner_mod.runner.publish(
                run_id,
                {
                    "type": "review_summary",
                    "executionId": execution_id,
                    "totals": {"cells": 0, "filled": 0, "blocked": 0,
                               "needs_verification": 0, "low_confidence": 0},
                    "blocking": {"count": 0, "reason_codes": {}, "focus": []},
                    "verification": {"pending": 0, "reviewed": 0, "corrected": 0,
                                     "focus": {"needs_review": [], "low_confidence": [],
                                               "assumptions": []}},
                },
            )
            await runs_route.runner_mod.runner.publish(
                run_id,
                {"type": "done", "executionId": execution_id},
            )
            runs_route._write_run_status(run_dir, "completed")
            runs_route._SPINE_TASKS.pop(run_id, None)

        async def _collect_stream_events() -> list[dict]:
            out: list[dict] = []
            async for event in runs_route.runner_mod.runner.stream_events(run_id):
                out.append(event)
            return out

        async def _refresh_then_collect() -> tuple[object, list[dict]]:
            # Each execution is a fresh reservation: SpineRunBroker.reserve is a
            # no-op while the run's prior terminal state lingers, so clear it
            # before re-running the same run id (a refresh starts a new execution).
            runner._runs.pop(run_id, None)
            runner._reserved.pop(run_id, None)
            response = await runs_route.refresh_run(run_id)
            events = await asyncio.wait_for(_collect_stream_events(), timeout=1.0)
            return response, events

        def _fake_store_factory():
            return _FakeStore(fake_run)

        with (
            patch.object(runs_route, "RUNS_DIR", self.runs_dir),
            patch.object(runs_route.runner_mod, "runner", runner),
            patch.object(runs_route, "Store", _fake_store_factory),
            patch.object(runs_route, "_run_spine", _fake_run_spine),
            patch.object(runs_route, "_new_execution_id", lambda: next(execution_ids)),
        ):
            first_response, first_events = asyncio.run(_refresh_then_collect())
            second_response, second_events = asyncio.run(_refresh_then_collect())

        self.assertEqual(first_response.execution_id, "exec-reuse-1")
        self.assertEqual(second_response.execution_id, "exec-reuse-2")
        # Each refresh under the SAME run_id yields a fresh stream attributed
        # to ITS execution id, ending in done — the point of the test.
        for events, exec_id in ((first_events, "exec-reuse-1"), (second_events, "exec-reuse-2")):
            self.assertEqual(
                [e["type"] for e in events],
                ["activity", "review_summary", "done"],
            )
            self.assertTrue(all(e["executionId"] == exec_id for e in events), events)
            self.assertEqual(events[0]["headline"], f"tick:{exec_id}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
