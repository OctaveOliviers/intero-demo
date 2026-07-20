"""The population TERMINAL SEQUENCE + CANCELLATION classification, at the core
seam (#334).

These pin — directly on ``finalize_completed_population`` /
``finalize_cancelled_population``, over a fake publisher — the two pieces that
moved out of the route's session executor into core:

* the terminal-frame ORDERING: the optional ``refresh_summary`` then ``done``
  are queued THROUGH the one publisher and flushed by a single ``aclose()``, and
  the ``completed`` lifecycle status is recorded BEFORE the ``done`` frame;
* the graceful-vs-hard CANCELLATION classification: a stop that raced a finished
  run (``orchestrate_completed``) and a mid-run user PAUSE (``stop_requested``)
  both finalize ``completed``; any OTHER cancel finalizes ``stopped`` and is
  reported un-handled so the route re-raises.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

import core.table_population as table_population  # noqa: E402
from core.table_population.populate import (  # noqa: E402
    finalize_cancelled_population,
    finalize_completed_population,
)


class _FakePublisher:
    """Records emit order and whether it was closed; ``closed`` is queried by the
    finalizers exactly as the route's ``_OrderedSessionEventRelay`` is."""

    def __init__(self, closed: bool = False) -> None:
        self.emitted: list[dict] = []
        self.closed = closed
        self.aclose_calls = 0

    def emit(self, event: dict) -> None:
        if self.closed:
            raise RuntimeError("emit after close")
        self.emitted.append(event)

    async def aclose(self) -> None:
        self.aclose_calls += 1
        self.closed = True


class _RecordSpy:
    def __init__(self) -> None:
        self.status_calls: list[tuple] = []
        self.exec_calls: list[tuple] = []

    async def record_status(self, status, *, detail=None, result_status=None) -> None:
        # Async: the finalizers await the lifecycle writer so its terminal-retry
        # backoff never blocks the event loop (issue #2).
        self.status_calls.append((status, detail, result_status))

    def transition_execution(self, status, *, summary_json=None) -> None:
        self.exec_calls.append((status, summary_json))


def _identity(event: dict) -> dict:
    return event


class FinalizeCompletedTest(unittest.IsolatedAsyncioTestCase):
    async def test_success_orders_refresh_summary_then_done_status_before_done(
        self,
    ) -> None:
        pub = _FakePublisher()
        spy = _RecordSpy()
        order: list[str] = []

        async def _record_status(status, *, detail=None, result_status=None):
            order.append("record_status")
            await spy.record_status(status, detail=detail, result_status=result_status)

        def _emit(event):
            if event.get("type") == "done":
                order.append("emit_done")
            return event

        await finalize_completed_population(
            publisher=pub,
            deferred_done_event={"type": "done"},
            refresh_summary={"new_members_count": 2},
            result_status="complete",
            record_status=_record_status,
            transition_execution=spy.transition_execution,
            with_execution=_emit,
        )

        # refresh_summary queued, then done — both THROUGH the publisher.
        self.assertEqual([e["type"] for e in pub.emitted], ["refresh_summary", "done"])
        self.assertEqual(pub.emitted[0]["summary"], {"new_members_count": 2})
        # done carries the refresh_summary too.
        self.assertEqual(pub.emitted[1]["summary"], {"new_members_count": 2})
        # Closed exactly once (single flush).
        self.assertEqual(pub.aclose_calls, 1)
        # completed recorded with the result status, BEFORE the done frame.
        self.assertEqual(spy.status_calls, [("completed", None, "complete")])
        self.assertEqual(order, ["record_status", "emit_done"])
        self.assertEqual(spy.exec_calls[0][0], "completed")
        self.assertEqual(
            spy.exec_calls[0][1],
            {"result_status": "complete", "new_members_count": 2},
        )

    async def test_success_without_refresh_summary_emits_only_done(self) -> None:
        pub = _FakePublisher()
        spy = _RecordSpy()
        await finalize_completed_population(
            publisher=pub,
            deferred_done_event=None,
            refresh_summary={},
            result_status="complete",
            record_status=spy.record_status,
            transition_execution=spy.transition_execution,
            with_execution=_identity,
        )
        self.assertEqual([e["type"] for e in pub.emitted], ["done"])
        self.assertNotIn("summary", pub.emitted[0])
        self.assertEqual(spy.status_calls, [("completed", None, "complete")])

    async def test_export_is_reachable_from_the_package(self) -> None:
        self.assertIs(
            table_population.finalize_completed_population,
            finalize_completed_population,
        )
        self.assertIs(
            table_population.finalize_cancelled_population,
            finalize_cancelled_population,
        )


class _StoreStub:
    def __init__(self, status: str) -> None:
        self._status = status
        self.recomputed = False

    def recompute_status(self, _run_id) -> None:
        self.recomputed = True

    def get_cells(self, _run_id) -> list:
        return []


class FinalizeCancelledTest(unittest.IsolatedAsyncioTestCase):
    async def test_raced_finished_run_records_completed_and_is_handled(self) -> None:
        """A cancel that raced a run whose terminal frames are already queued
        (``orchestrate_completed``): only completion is recorded — no extra
        frames, no rewrite to stopped — and the finalizer reports handled."""
        pub = _FakePublisher()
        spy = _RecordSpy()
        store = _StoreStub("complete")

        handled = await finalize_cancelled_population(
            table_population_id="r",
            publisher=pub,
            orchestrate_completed=True,
            stop_requested=False,
            orchestrator_store=store,
            get_result_status=lambda: "complete",
            record_status=spy.record_status,
            transition_execution=spy.transition_execution,
            with_execution=_identity,
        )

        self.assertTrue(handled)
        self.assertFalse(store.recomputed)  # already-finished run: no re-summary
        self.assertEqual(pub.emitted, [])
        self.assertEqual(spy.status_calls, [("completed", None, "complete")])
        self.assertEqual(spy.exec_calls[0][0], "completed")
        self.assertEqual(
            spy.exec_calls[0][1],
            {"result_status": "complete", "stopped_by_user": False},
        )

    async def test_mid_run_pause_builds_summary_then_done_records_completed(
        self,
    ) -> None:
        """The user PAUSE (``stop_requested``, run not yet finished): the
        finalizer recomputes + streams a review_summary of the work so far, then
        done, and records completed — read AFTER the recompute."""
        pub = _FakePublisher()
        spy = _RecordSpy()
        store = _StoreStub("in_review")

        handled = await finalize_cancelled_population(
            table_population_id="r",
            publisher=pub,
            orchestrate_completed=False,
            stop_requested=True,
            orchestrator_store=store,
            get_result_status=lambda: "in_review",
            record_status=spy.record_status,
            transition_execution=spy.transition_execution,
            with_execution=_identity,
        )

        self.assertTrue(handled)
        self.assertTrue(store.recomputed)
        self.assertEqual([e["type"] for e in pub.emitted], ["review_summary", "done"])
        self.assertEqual(spy.status_calls, [("completed", None, "in_review")])
        self.assertEqual(
            spy.exec_calls[0][1],
            {"result_status": "in_review", "stopped_by_user": True},
        )

    async def test_hard_abort_records_stopped_emits_error_and_is_unhandled(
        self,
    ) -> None:
        """Any OTHER cancel (delete, shutdown): stopped is recorded with the
        canonical detail, a terminal error frame is emitted, and the finalizer
        reports un-handled so the route re-raises."""
        pub = _FakePublisher()
        spy = _RecordSpy()
        store = _StoreStub("in_progress")

        handled = await finalize_cancelled_population(
            table_population_id="r",
            publisher=pub,
            orchestrate_completed=False,
            stop_requested=False,
            orchestrator_store=store,
            get_result_status=lambda: "in_progress",
            record_status=spy.record_status,
            transition_execution=spy.transition_execution,
            with_execution=_identity,
        )

        self.assertFalse(handled)
        self.assertEqual([e["type"] for e in pub.emitted], ["error"])
        self.assertEqual(pub.emitted[0]["message"], "Table population stopped by user.")
        self.assertEqual(spy.status_calls, [("stopped", "Stopped by user.", None)])
        self.assertEqual(spy.exec_calls, [("stopped", None)])

    async def test_hard_abort_does_not_double_emit_when_publisher_already_closed(
        self,
    ) -> None:
        """If the publisher was already closed (a race), the hard-abort path
        records stopped + transitions the execution but emits no error frame."""
        pub = _FakePublisher(closed=True)
        spy = _RecordSpy()
        store = _StoreStub("in_progress")

        handled = await finalize_cancelled_population(
            table_population_id="r",
            publisher=pub,
            orchestrate_completed=False,
            stop_requested=False,
            orchestrator_store=store,
            get_result_status=lambda: "in_progress",
            record_status=spy.record_status,
            transition_execution=spy.transition_execution,
            with_execution=_identity,
        )

        self.assertFalse(handled)
        self.assertEqual(pub.emitted, [])
        self.assertEqual(spy.status_calls, [("stopped", "Stopped by user.", None)])


if __name__ == "__main__":
    unittest.main(verbosity=2)
