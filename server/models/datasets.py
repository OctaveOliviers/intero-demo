from typing import Any

from pydantic import BaseModel


class DatasetSummary(BaseModel):
    """The library list row for a Dataset: just enough to render a card."""

    id: str
    name: str
    databases: list[str]
    count: int


class DatasetCreateRequest(BaseModel):
    """Create a Dataset from a plain-language slice.

    ``anchor`` is the primary identity reference (``"<db> -> <table>.<column>"``);
    ``text`` is the plain-language description the grounding engine maps onto real
    filterable columns.
    """

    name: str
    description: str | None = None
    databases: list[str]
    anchor: str
    text: str


class DatasetPatchRequest(BaseModel):
    """Edit a Dataset. Either RENAME it (provide ``name``) or edit one chip's value
    (provide ``criterion_id`` + ``value``) — a deterministic re-derive, no LLM."""

    name: str | None = None
    criterion_id: str | None = None
    value: Any = None


class DatasetFilterRequest(BaseModel):
    """Add a filter row: ground one more plain-language phrase onto the Dataset."""

    text: str
