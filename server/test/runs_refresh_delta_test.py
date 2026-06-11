import tempfile
import unittest
from pathlib import Path

from core.store import Cell, Event, Run, RunExecution, RunMember, Store
from server.routes import runs as runs_route


EXECUTABLE = {
    "first_data_row": 2,
    "regions": [
        {
            "sheet": "ALL",
            "kind": "direct",
            "cell_map": [
                {"cell_template": "{col:A}{row}", "field": "f1", "kind": "direct"},
                {"cell_template": "{col:B}{row}", "field": "f2", "kind": "direct"},
            ],
        }
    ],
}


class RefreshDeltaTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self._tmp.name) / "state.db"
        self.store = Store(self.db_path)
        self.store.create_run(Run(id="r1", audit_id="audit-a", status="in_progress"))

    def tearDown(self):
        self.store.close()
        self._tmp.cleanup()

    def _create_execution(self, execution_id: str) -> None:
        self.store.create_execution(RunExecution(id=execution_id, run_id="r1", status="running"))

    def _seed_member(self, member: str, row_index: int, execution_id: str) -> None:
        self.store.upsert_run_member(
            RunMember(
                run_id="r1",
                member=member,
                row_index=row_index,
                active=True,
                first_seen_execution_id=execution_id,
                last_seen_execution_id=execution_id,
            )
        )

    def test_refresh_delta_new_and_departed_members(self):
        self._create_execution("exec-0")
        self._seed_member("A", 0, "exec-0")
        self._seed_member("B", 1, "exec-0")
        self._create_execution("exec-1")

        stats = runs_route._prepare_refresh_delta(
            self.store,
            run_id="r1",
            execution_id="exec-1",
            executable=EXECUTABLE,
            cohort=["A", "C"],
        )

        members = {m.member: m for m in self.store.list_run_members("r1")}
        self.assertEqual(members["A"].row_index, 0)
        self.assertEqual(members["A"].active, True)
        self.assertEqual(members["A"].last_seen_execution_id, "exec-1")
        self.assertEqual(members["B"].row_index, 1)
        self.assertEqual(members["B"].active, False)
        self.assertEqual(members["C"].row_index, 2)
        self.assertEqual(members["C"].active, True)
        self.assertEqual(members["C"].first_seen_execution_id, "exec-1")
        self.assertEqual(members["C"].last_seen_execution_id, "exec-1")
        self.assertEqual(stats["new_members_count"], 1)
        self.assertEqual(stats["departed_members_count"], 1)

    def test_refresh_delta_reopens_blocked_for_active_only(self):
        self._create_execution("exec-0")
        self._seed_member("A", 0, "exec-0")
        self._seed_member("B", 1, "exec-0")
        self.store.upsert_cell(
            Cell(
                run_id="r1",
                ref="ALL!A2",
                member="A",
                field="f1",
                kind="direct",
                state="blocked",
                reason_code="IDENTITY_UNRESOLVED",
                reason_detail="missing key",
            )
        )
        self.store.upsert_cell(
            Cell(
                run_id="r1",
                ref="ALL!B2",
                member="A",
                field="f2",
                kind="direct",
                state="filled",
                value="x",
                sources=[{"database": "d", "query": "q", "table_column": "t.c"}],
            )
        )
        self.store.upsert_cell(
            Cell(
                run_id="r1",
                ref="ALL!A3",
                member="B",
                field="f1",
                kind="direct",
                state="blocked",
                reason_code="IDENTITY_UNRESOLVED",
                reason_detail="missing key",
            )
        )
        self._create_execution("exec-1")

        stats = runs_route._prepare_refresh_delta(
            self.store,
            run_id="r1",
            execution_id="exec-1",
            executable=EXECUTABLE,
            cohort=["A"],
        )

        reopened = self.store.get_cell("r1", "ALL!A2")
        filled = self.store.get_cell("r1", "ALL!B2")
        departed_blocked = self.store.get_cell("r1", "ALL!A3")
        self.assertEqual(reopened.state, "pending")
        self.assertIsNone(reopened.reason_code)
        self.assertIsNone(reopened.reason_detail)
        self.assertEqual(filled.state, "filled")
        self.assertEqual(filled.value, "x")
        self.assertEqual(departed_blocked.state, "blocked")
        self.assertEqual(stats["retried_blocked_count"], 1)

    def test_refresh_delta_keeps_filled_and_needs_verification_unchanged(self):
        self._create_execution("exec-0")
        self._seed_member("A", 0, "exec-0")
        self.store.upsert_cell(
            Cell(
                run_id="r1",
                ref="ALL!A2",
                member="A",
                field="f1",
                kind="direct",
                state="filled",
                value="7",
                resolved_by="direct",
                sources=[{"database": "d", "query": "q", "table_column": "t.c"}],
            )
        )
        self.store.upsert_cell(
            Cell(
                run_id="r1",
                ref="ALL!B2",
                member="A",
                field="f2",
                kind="interpret",
                state="filled",
                value="Y",
                review_state="not_reviewed",
                corrected=False,
                sources=[{"database": "d", "query": "q", "table_column": "t.c"}],
            )
        )
        self.store.upsert_cell(
            Cell(
                run_id="r1",
                ref="ALL!A3",
                member="A",
                field="f1",
                kind="direct",
                state="pending",
            )
        )
        self.store.upsert_cell(
            Cell(
                run_id="r1",
                ref="ALL!B3",
                member="A",
                field="f2",
                kind="direct",
                state="blocked",
                reason_code="NOT_LOCATED",
                reason_detail="none",
            )
        )
        before_filled = self.store.get_cell("r1", "ALL!A2")
        before_needs = self.store.get_cell("r1", "ALL!B2")
        before_pending = self.store.get_cell("r1", "ALL!A3")
        self._create_execution("exec-1")

        runs_route._prepare_refresh_delta(
            self.store,
            run_id="r1",
            execution_id="exec-1",
            executable=EXECUTABLE,
            cohort=["A"],
        )

        after_filled = self.store.get_cell("r1", "ALL!A2")
        after_needs = self.store.get_cell("r1", "ALL!B2")
        after_pending = self.store.get_cell("r1", "ALL!A3")
        reopened = self.store.get_cell("r1", "ALL!B3")
        self.assertEqual((after_filled.state, after_filled.value, after_filled.resolved_by),
                         (before_filled.state, before_filled.value, before_filled.resolved_by))
        self.assertEqual((after_needs.state, after_needs.value, after_needs.review_state, after_needs.corrected),
                         (before_needs.state, before_needs.value, before_needs.review_state, before_needs.corrected))
        self.assertEqual(after_pending.state, before_pending.state)
        self.assertEqual(reopened.state, "pending")

    def test_refresh_summary_counters(self):
        self._create_execution("exec-0")
        self._seed_member("A", 0, "exec-0")
        self._seed_member("B", 1, "exec-0")
        self.store.upsert_cell(
            Cell(
                run_id="r1",
                ref="ALL!A2",
                member="A",
                field="f1",
                kind="direct",
                state="blocked",
                reason_code="NOT_LOCATED",
                reason_detail="none",
            )
        )
        self.store.upsert_cell(
            Cell(
                run_id="r1",
                ref="ALL!B2",
                member="A",
                field="f2",
                kind="direct",
                state="filled",
                value="x",
                sources=[{"database": "d", "query": "q", "table_column": "t.c"}],
            )
        )
        self._create_execution("exec-1")
        stats = runs_route._prepare_refresh_delta(
            self.store,
            run_id="r1",
            execution_id="exec-1",
            executable=EXECUTABLE,
            cohort=["A", "C"],
        )

        self.store.update_cell(
            "r1",
            "ALL!A2",
            state="filled",
            value="y",
            resolved_by="direct",
            sources=[{"database": "d", "query": "q", "table_column": "t.c"}],
            reason_code=None,
            reason_detail=None,
        )
        self.store.append_event(
            Event(
                run_id="r1",
                execution_id="exec-1",
                type="cell_update",
                payload={"sheet": "ALL", "cells": [{"ref": "A2"}]},
            )
        )
        self.store.update_cell(
            "r1",
            "ALL!A4",
            state="blocked",
            reason_code="NOT_LOCATED",
            reason_detail="none",
            value=None,
            confidence="low",
            resolved_by="agent",
            sources=[],
        )
        self.store.append_event(
            Event(
                run_id="r1",
                execution_id="exec-1",
                type="cell_update",
                payload={"sheet": "ALL", "cells": [{"ref": "A4"}]},
            )
        )

        summary = runs_route._build_refresh_summary(
            self.store,
            run_id="r1",
            execution_id="exec-1",
            refresh_stats=stats,
        )

        self.assertEqual(summary["new_members_count"], 1)
        self.assertEqual(summary["departed_members_count"], 1)
        self.assertEqual(summary["retried_blocked_count"], 1)
        self.assertEqual(summary["resolved_blocked_count"], 1)
        self.assertEqual(summary["remaining_blocked_count"], 1)
        self.assertEqual(summary["updated_cells_count"], 5)


if __name__ == "__main__":
    unittest.main(verbosity=2)
