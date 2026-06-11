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


class CellMetadata(BaseModel):
    value: Any = None
    sql: str
    explanation: str | None = None
    database: str | None = None
    evidence: list[str] | None = None


class WorkbookResponse(BaseModel):
    sheets: list[SheetData]
    cellMetadata: dict[str, CellMetadata]
