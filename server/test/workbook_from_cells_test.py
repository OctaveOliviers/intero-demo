"""The /workbook endpoint must rebuild the grid from state.db cells.

Regression for the bug where agent writes (made out-of-process, straight
to state.db) never reached the frontend. There is no on-disk result.xlsx in the
table-population path, so the grid is reconstructed from the cells table — making
every persisted value recoverable on reload, in a fresh browser, after navigating
away.
"""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from core.store import Cell, Run, Store
from server.auth import store as auth_store
from server.routes import workbook as workbook_route


class WorkbookFromCellsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp_auth = tempfile.TemporaryDirectory()
        auth_path = Path(self.tmp_auth.name)
        self._orig_auth_db = auth_store.AUTH_DB_PATH
        self._orig_legacy_auth_db = auth_store.LEGACY_AUTH_DB_PATH
        auth_store.AUTH_DB_PATH = auth_path / "auth.sqlite"
        auth_store.LEGACY_AUTH_DB_PATH = auth_path / "legacy-auth.sqlite"
        auth_store.init_store()
        self.user = {"id": "u_owner", "username": "owner", "role": "clinician"}

    def tearDown(self) -> None:
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        auth_store.LEGACY_AUTH_DB_PATH = self._orig_legacy_auth_db
        self.tmp_auth.cleanup()

    def _request(self):
        return SimpleNamespace(
            state=SimpleNamespace(user=self.user, user_id=self.user["id"])
        )

    def test_agent_values_recovered_from_state_db(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            db_path = str(tmp_path / "state.db")

            # state.db holds the truth: one direct cell, one agent cell.
            store = Store(db_path)
            try:
                store.create_run(
                    Run(
                        id="r1",
                        audit_id="a",
                        user_id=self.user["id"],
                        status="in_progress",
                    )
                )
                store.insert_pending_cells(
                    [
                        Cell(
                            run_id="r1",
                            ref="ALL!A2",
                            field="code",
                            member="P1",
                            kind="direct",
                            state="pending",
                        ),
                        Cell(
                            run_id="r1",
                            ref="ALL!B2",
                            field="delivery",
                            member="P1",
                            kind="direct",
                            state="pending",
                        ),
                    ]
                )
                src = [{"database": "db", "query": "SELECT 1", "table_column": "t.c"}]
                store.update_cell(
                    "r1",
                    "ALL!A2",
                    value="P1",
                    state="filled",
                    resolved_by="direct",
                    confidence="high",
                    sources=src,
                )
                store.update_cell(
                    "r1",
                    "ALL!B2",
                    value="SVD",
                    state="filled",
                    resolved_by="agent",
                    confidence="medium",
                    sources=src,
                )
            finally:
                store.close()

            runs_dir = tmp_path / "runs"
            (runs_dir / "r1").mkdir(parents=True)
            # The lifecycle status rides on the run row (#326 step 2) — the
            # workbook endpoint reads population_status, not status.json.
            seed = Store(db_path)
            try:
                seed.record_population_status("r1", "completed")
            finally:
                seed.close()

            # No spec on disk -> headers fall back to the field slug; values come
            # purely from the cells.
            with (
                patch.object(workbook_route, "TEMPLATES_DIR", tmp_path / "audits"),
                patch.object(workbook_route, "ARTIFACTS_DIR", runs_dir),
                patch.object(workbook_route, "Store", lambda: Store(db_path)),
            ):
                resp = asyncio.run(workbook_route.get_workbook("r1", self._request()))

            sheet = next(s for s in resp.sheets if s.name == "ALL")
            # data[0] = header row, data[1] = row 2 (first cohort member)
            self.assertEqual(sheet.data[1][0], "P1")  # A2 (direct)
            self.assertEqual(sheet.data[1][1], "SVD")  # B2 (agent) — the recovered one

            # Metadata is the live cell_update shape (state/kind/confidence),
            # keyed by full ref, so the viewer colors + provenance render.
            self.assertIn("ALL!B2", resp.cellMetadata)
            agent_meta = resp.cellMetadata["ALL!B2"]
            self.assertEqual(agent_meta["state"], "filled")
            self.assertEqual(agent_meta["resolved_by"], "agent")

            self.assertEqual(resp.resultStatus, "in_progress")
            self.assertEqual(resp.tablePopulationStatus, "completed")
            self.assertIn("SVD", resp.model_dump_json())

    def test_bare_pending_seeds_excluded_from_metadata(self) -> None:
        # The full grid is seeded as `pending` before any value lands. The live grid
        # starts from cellMetadata={} and only colors cells a step touched, so a
        # population reopened mid-flight must NOT paint every untouched interpret
        # cell as needs-review. Snapshot metadata must match the live contract: bare seeds
        # omitted; resolved AND attempted-but-still-pending cells included.
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            db_path = str(tmp_path / "state.db")

            store = Store(db_path)
            try:
                store.create_run(
                    Run(
                        id="r1",
                        audit_id="a",
                        user_id=self.user["id"],
                        status="in_progress",
                    )
                )
                store.insert_pending_cells(
                    [
                        Cell(
                            run_id="r1",
                            ref="ALL!A2",
                            field="code",
                            member="P1",
                            kind="interpret",
                            state="pending",
                        ),  # bare seed
                        Cell(
                            run_id="r1",
                            ref="ALL!B2",
                            field="delivery",
                            member="P1",
                            kind="interpret",
                            state="pending",
                        ),  # -> filled
                        Cell(
                            run_id="r1",
                            ref="ALL!C2",
                            field="note",
                            member="P1",
                            kind="interpret",
                            state="pending",
                        ),  # attempted
                    ]
                )
                src = [{"database": "db", "query": "SELECT 1", "table_column": "t.c"}]
                store.update_cell(
                    "r1",
                    "ALL!B2",
                    value="SVD",
                    state="filled",
                    resolved_by="agent",
                    confidence="medium",
                    sources=src,
                )
                store.update_cell(
                    "r1", "ALL!C2", attempts=[{"by": "agent", "ok": False}]
                )
            finally:
                store.close()

            with (
                patch.object(workbook_route, "TEMPLATES_DIR", tmp_path / "audits"),
                patch.object(workbook_route, "Store", lambda: Store(db_path)),
            ):
                resp = asyncio.run(workbook_route.get_workbook("r1", self._request()))

            # The untouched seed is in the GRID (blank) but carries no metadata, so
            # it renders blank — exactly as the live viewer saw it.
            sheet = next(s for s in resp.sheets if s.name == "ALL")
            self.assertEqual(sheet.data[1][0], "")
            self.assertNotIn("ALL!A2", resp.cellMetadata)
            # Resolved + attempted cells streamed a cell_update live, so they stay.
            self.assertIn("ALL!B2", resp.cellMetadata)
            self.assertIn("ALL!C2", resp.cellMetadata)


if __name__ == "__main__":
    unittest.main()
