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
    # Per-cell metadata keyed by full ref ("Sheet!A1"): the spine cell-meta
    # projection ({state, kind, confidence, sources, ...}) — the same shape the
    # live cell_update stream sends, built via cell_wire. Typed as Any so a
    # rebuild from state.db emits the live shape with zero drift.
    cellMetadata: dict[str, Any]
    # The run's durable store status (`in_progress`/`queued` while live;
    # `complete`/`in_verification`/`blocked` once finished). The frontend uses it
    # as the AUTHORITATIVE signal for whether to reconnect the live stream on
    # open — a fresh browser has no local "running" flag to fall back on.
    runStatus: str | None = None
    # The run's start/end timestamps (ISO-8601). `startedAt` is set when the run
    # leaves `queued`; `endedAt` when it reaches a terminal state. The frontend
    # seeds the activity-box elapsed timer from these so a reconnect (reload /
    # fresh browser) shows the TRUE elapsed time — live runs tick from startedAt,
    # finished runs freeze at endedAt − startedAt instead of restarting from 0.
    startedAt: str | None = None
    endedAt: str | None = None
