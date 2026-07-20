from typing import Any

from pydantic import BaseModel


class SheetColumnMeta(BaseModel):
    width: int | None = None


class SheetMeta(BaseModel):
    columns: list[SheetColumnMeta]


class SheetData(BaseModel):
    name: str
    data: list[list]
    meta: SheetMeta


class WorkbookResponse(BaseModel):
    sheets: list[SheetData]
    # Per-cell metadata keyed by full ref ("Sheet!A1"): the table-population
    # cell-meta
    # projection ({state, kind, confidence, sources, ...}) — the same shape the
    # live cell_update stream sends, built via cell_wire. Typed as Any so a
    # rebuild from state.db emits the live shape with zero drift.
    cellMetadata: dict[str, Any]
    # The durable result status (`in_progress`/`queued` while live;
    # `complete`/`in_verification`/`blocked` once finished).
    resultStatus: str | None = None
    # The table-population lifecycle status (runs.population_status). The frontend uses
    # this as the AUTHORITATIVE signal for whether to reconnect the live stream on
    # open — a fresh browser has no local "running" flag to fall back on.
    tablePopulationStatus: str | None = None
    # Table-population start/end timestamps (ISO-8601). `startedAt` is set when
    # work leaves `queued`; `endedAt` when it reaches a terminal state. The frontend
    # seeds the activity-box elapsed timer from these so a reconnect (reload /
    # fresh browser) shows the TRUE elapsed time — live populations tick from
    # startedAt, finished populations freeze at endedAt − startedAt instead of
    # restarting from 0.
    startedAt: str | None = None
    endedAt: str | None = None
