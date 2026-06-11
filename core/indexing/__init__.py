"""Phase 1 of the audit pipeline: index audit templates and database schemas.

When a user uploads an audit workbook or connects a database, this phase
extracts its structure and makes a single LLM call to compute the structured
model (`spec.json` for audits, `model.json` for databases). The model carries its own indexing
`status`, so it is the single source of truth per entity. Runs in the background
so the frontend never blocks. See :mod:`core.indexing.service`.
"""

from core.indexing.service import (
    IndexingError,
    Kind,
    await_ready,
    cancel,
    exists,
    launch,
    list_all,
    read_meta,
    read_status,
    reindex,
    rescan_on_startup,
    run_indexing,
    set_display_name,
    subscribe,
    write_audit_stub,
    write_database_stub,
)

__all__ = [
    "IndexingError",
    "Kind",
    "await_ready",
    "cancel",
    "exists",
    "launch",
    "list_all",
    "read_meta",
    "read_status",
    "reindex",
    "rescan_on_startup",
    "run_indexing",
    "set_display_name",
    "subscribe",
    "write_audit_stub",
    "write_database_stub",
]
