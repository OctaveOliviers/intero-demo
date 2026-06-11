import asyncio
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from openpyxl import Workbook, load_workbook
from starlette.responses import StreamingResponse

from core.store import Cell, Run, RunMember, Store
from server.routes import workbook as workbook_route


async def _read_streaming_body(response: StreamingResponse) -> bytes:
    data = b""
    async for chunk in response.body_iterator:
        data += chunk
    return data


class WorkbookDownloadPolicyTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.base = Path(self._tmp.name)
        self.runs_dir = self.base / "runs"
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.base / "state.db"

        run_dir = self.runs_dir / "run-1"
        run_dir.mkdir(parents=True, exist_ok=True)
        workbook_path = run_dir / "result.xlsx"
        wb = Workbook()
        ws = wb.active
        ws.title = "ALL"
        ws["A1"] = "member"
        ws["B1"] = "value"
        ws["A2"] = "A"
        ws["B2"] = 10
        ws["A3"] = "B"
        ws["B3"] = 20
        ws["A4"] = "C"
        ws["B4"] = 30
        ws2 = wb.create_sheet("DETAIL")
        ws2["A1"] = "member"
        ws2["B1"] = "detail"
        ws2["A2"] = "A"
        ws2["B2"] = "alpha"
        ws2["A3"] = "B"
        ws2["B3"] = "beta"
        ws2["A4"] = "C"
        ws2["B4"] = "gamma"
        wb.save(workbook_path)
        wb.close()

        store = Store(self.db_path)
        store.create_run(Run(id="run-1", audit_id="npda", status="completed"))
        store.upsert_run_member(
            RunMember(run_id="run-1", member="A", row_index=0, active=True)
        )
        store.upsert_run_member(
            RunMember(run_id="run-1", member="B", row_index=1, active=False)
        )
        store.upsert_run_member(
            RunMember(run_id="run-1", member="C", row_index=2, active=True)
        )
        store.upsert_cell(
            Cell(
                run_id="run-1",
                ref="ALL!A2",
                field="f",
                member="A",
                kind="direct",
                state="pending",
            )
        )
        store.upsert_cell(
            Cell(
                run_id="run-1",
                ref="ALL!A3",
                field="f",
                member="B",
                kind="direct",
                state="pending",
            )
        )
        store.upsert_cell(
            Cell(
                run_id="run-1",
                ref="ALL!A4",
                field="f",
                member="C",
                kind="direct",
                state="pending",
            )
        )
        store.upsert_cell(
            Cell(
                run_id="run-1",
                ref="DETAIL!A2",
                field="f",
                member="A",
                kind="direct",
                state="pending",
            )
        )
        store.upsert_cell(
            Cell(
                run_id="run-1",
                ref="DETAIL!A3",
                field="f",
                member="B",
                kind="direct",
                state="pending",
            )
        )
        store.upsert_cell(
            Cell(
                run_id="run-1",
                ref="DETAIL!A4",
                field="f",
                member="C",
                kind="direct",
                state="pending",
            )
        )
        store.close()

    def tearDown(self):
        self._tmp.cleanup()

    def test_download_excludes_inactive_members_but_keeps_history(self):
        with (
            patch.object(workbook_route, "RUNS_DIR", self.runs_dir),
            patch.object(workbook_route, "Store", lambda: Store(self.db_path)),
        ):
            response = asyncio.run(workbook_route.download_workbook("run-1"))

        self.assertIsInstance(response, StreamingResponse)
        payload = asyncio.run(_read_streaming_body(response))
        wb = load_workbook(io.BytesIO(payload), data_only=True)
        ws = wb["ALL"]
        ws2 = wb["DETAIL"]
        rows = list(ws.iter_rows(min_row=1, max_col=2, values_only=True))
        rows2 = list(ws2.iter_rows(min_row=1, max_col=2, values_only=True))
        wb.close()

        self.assertEqual(rows, [
            ("member", "value"),
            ("A", 10),
            ("C", 30),
        ])
        self.assertEqual(rows2, [
            ("member", "detail"),
            ("A", "alpha"),
            ("C", "gamma"),
        ])

        store = Store(self.db_path)
        try:
            members = {m.member: m for m in store.list_run_members("run-1")}
        finally:
            store.close()
        self.assertIn("B", members)
        self.assertFalse(members["B"].active)


if __name__ == "__main__":
    unittest.main(verbosity=2)
