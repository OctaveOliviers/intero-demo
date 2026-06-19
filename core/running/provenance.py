"""Shared provenance shapes — the ``Source`` model and ``make_attempt`` helper
(cell-resolution.schema.json §source / §attempt). The single Python definition of
each, used by every tier so the hand-rolled dicts (and their required fields)
can't drift. A cell's cohort identity lives on the cell's ``member``, never
repeated on a source; verbatim evidence lives on a source as ``citations``,
pinned to the ``row_id`` it was read from.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class Source(BaseModel):
    """One (database, row) a cell value was drawn from."""

    model_config = {"extra": "forbid"}

    database: str = Field(min_length=1)
    # SQL that shows the value ALONGSIDE its row identity (never a bare SELECT <value>).
    query: str = Field(min_length=1)
    table_column: str = Field(min_length=1)
    # The evidence row's own PK — recorded for one-to-many / interpreted sources so
    # the exact row is recoverable; omitted for a one-row-per-identity direct copy.
    row_id: str | None = None
    # The column ``row_id`` is a value of (e.g. ``note_id``) — lets the run store
    # scope a note source's ``query`` to that one row (``WHERE <row_key> = <row_id>``)
    # so clicking the cell shows the single cited note, not all of a patient's notes.
    row_key: str | None = None
    # Verbatim passage(s) from THIS row (note sources only); min_length guards a
    # caller passing [] (the contract forbids an empty citations array).
    citations: list[str] | None = Field(default=None, min_length=1)

    def as_dict(self) -> dict:
        """JSON-storable form — only set fields (no null row_id/citations)."""
        return self.model_dump(exclude_none=True)


def make_attempt(tier: str, database: str, *, sql: str | None = None,
                 value: str | None = None, table_column: str | None = None,
                 result: str | None = None, error: str | None = None) -> dict:
    """One ``attempts[]`` entry. ``tier`` + ``database`` always present (``database``
    is ``"(none)"`` when no query ran); the rest only when set."""
    attempt: dict = {"tier": tier, "database": database}
    for key, val in (("sql", sql), ("value", value), ("table_column", table_column),
                     ("result", result), ("error", error)):
        if val is not None:
            attempt[key] = val
    return attempt
