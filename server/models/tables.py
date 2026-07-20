from typing import Any

from pydantic import BaseModel


class TableSummary(BaseModel):
    """The Tables-list row: just enough to render a recency-ordered card.

    ``opened`` is PER-USER, derived into this response (never stored on the
    shared table): True when the requesting user has opened the table's full
    grid, so the sidebar can suppress the blue "finished, unopened" dot."""

    id: str
    title: str
    description: str
    source_template: str
    reporting_period_label: str
    status: str
    updated_at: str
    opened: bool = False


class TableColumn(BaseModel):
    id: str
    name: str
    description: str | None = None


class TableSpec(BaseModel):
    """The pinned columns/grain snapshot taken at creation."""

    columns: list[TableColumn]
    grain: str


class TableRenameRequest(BaseModel):
    """Rename a table: replaces only its display ``title`` (scope is pinned for
    life — decision 0004 — so a rename never touches ``dataset_id``)."""

    title: str


class TableCreateRequest(BaseModel):
    """Pin + spawn a table.

    ``source_template`` is a seeded audit/template id (table population fills the
    table), or the literal ``"ad-hoc"`` (pinned + persisted, not yet populated).
    ``dataset_id`` is the PINNED scope (a Dataset id, or null = whole-DB), fixed
    for life (decision 0004); ``spec`` overrides the snapshot derived from the
    template; ``thread_id`` records provenance back to the spawning thread.
    """

    title: str
    description: str | None = None
    source_template: str
    dataset_id: str | None = None
    spec: dict[str, Any] | None = None
    thread_id: str | None = None
