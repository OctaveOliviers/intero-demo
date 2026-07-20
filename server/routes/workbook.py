import json
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from core import table_population

# ARTIFACTS_DIR is unused by the route since the lifecycle status moved into the
# state store (#326); it stays importable as the patch point the
# workbook/read-access tests set up their tmp dirs on.
from core.config import ARTIFACTS_DIR, TEMPLATES_DIR  # noqa: F401
from core.table_population.table_population_sessions import population_status_of
from core.store import Store
from server.models import WorkbookResponse, SheetData, SheetMeta, SheetColumnMeta
from server.routes import table_populations as table_populations_route

router = APIRouter()
_A1_ROW_RE = re.compile(r"^[A-Za-z]+([1-9][0-9]*)$")


def _row_from_a1(ref: str) -> int | None:
    match = _A1_ROW_RE.match(ref.strip())
    if match is None:
        return None
    return int(match.group(1))


def _inactive_member_rows_by_sheet(
    cells, inactive_members: set[str]
) -> dict[str, list[int]]:
    if not inactive_members:
        return {}
    rows_by_sheet: dict[str, set[int]] = {}
    for cell in cells:
        if cell.member not in inactive_members:
            continue
        sheet, sep, a1 = cell.ref.partition("!")
        if not sep:
            continue
        row = _row_from_a1(a1)
        if row is None:
            continue
        rows_by_sheet.setdefault(sheet, set()).add(row)
    return {
        sheet: sorted(rows, reverse=True)
        for sheet, rows in rows_by_sheet.items()
        if rows
    }


def _read_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None
    return data if isinstance(data, dict) else None


def _field_names_for_run(audit_id: str | None) -> dict[str, str]:
    """The audit spec's display names, for human-readable column headers. The spec
    is the canonical audit definition (not a per-run copy); a miss just falls the
    header back to the field slug — it can never misplace a value."""
    if not audit_id:
        return {}
    return table_population.field_display_names(
        _read_json(TEMPLATES_DIR / audit_id / "spec.json")
    )


def _table_population_lifecycle_status(run) -> str:
    # The process status rides on the run row (population_status, written by
    # record_status — the only lifecycle record, #326). Fail-safe: no recorded
    # status reads back as STATUS_UNKNOWN, never "running" (bug #13).
    return population_status_of(run)


@router.get(
    "/api/table-populations/{table_population_id}/workbook",
    response_model=WorkbookResponse,
)
async def get_workbook(table_population_id: str, request: Request):
    # state.db is the single source of truth: the run's grid is rebuilt from its
    # cells, never read from disk. Per-cell metadata is the SAME projection the
    # live cell_update stream sends (cell_wire), so a reopened/reloaded run renders
    # identically to one watched live. The run's durable status rides along so a
    # fresh browser knows, authoritatively, whether to reconnect the live stream.
    store = Store()
    try:
        run = table_populations_route.require_table_population_read_access(
            request, table_population_id, store=store
        )
        cells = store.get_cells(table_population_id)
    finally:
        store.close()

    field_names = _field_names_for_run(run.audit_id)
    sheets = [
        SheetData(
            name=sheet["name"],
            data=sheet["data"],
            meta=SheetMeta(
                columns=[SheetColumnMeta(**col) for col in sheet["meta"]["columns"]]
            ),
        )
        for sheet in table_population.sheets_from_cells(cells, field_names)
    ]

    cell_metadata: dict[str, object] = {}
    for cell in cells:
        if "!" not in cell.ref:
            continue
        # Match the live contract exactly. The live grid is created with
        # cellMetadata={} (runs.py workbook_created) and only accretes metadata for
        # cells population actually touches — each touch streams a cell_update. The full
        # grid is persisted as `pending` up front (grid seeding) BEFORE any
        # step runs, so a bare pending seed (never resolved, never even attempted)
        # never reaches a live viewer. The snapshot must omit it too; otherwise a run
        # reopened mid-flight paints every not-yet-processed interpret cell as
        # needs-review (kind=interpret + no review_state) and the counter balloons to
        # the whole grid while the agent is still working. A pending cell that HAS
        # been attempted did stream a cell_update, so it stays.
        if cell.state == "pending" and not cell.attempts and cell.value is None:
            continue
        cell_metadata[cell.ref] = table_population.cell_wire(cell)["meta"]

    return WorkbookResponse(
        sheets=sheets,
        cellMetadata=cell_metadata,
        resultStatus=run.status,
        tablePopulationStatus=_table_population_lifecycle_status(run),
        startedAt=run.started_at,
        endedAt=run.ended_at,
    )


@router.get("/api/table-populations/{table_population_id}/download")
async def download_workbook(table_population_id: str, request: Request):
    # Same source of truth as the live grid: build the .xlsx from the run's cells
    # and drop deselected (inactive) members' rows. Nothing is read from disk.
    store = Store()
    try:
        run = table_populations_route.require_table_population_read_access(
            request, table_population_id, store=store
        )
        cells = store.get_cells(table_population_id)
        inactive_members = {
            member.member
            for member in store.list_run_members(table_population_id)
            if not member.active
        }
    finally:
        store.close()

    field_names = _field_names_for_run(run.audit_id)
    inactive_rows_by_sheet = _inactive_member_rows_by_sheet(cells, inactive_members)

    try:
        stream = table_population.cells_to_xlsx(
            cells, field_names, inactive_rows_by_sheet
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to build workbook: {e}")

    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="result.xlsx"'},
    )
