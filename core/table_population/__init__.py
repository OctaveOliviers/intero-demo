"""Public interface for table population.

Callers use this package surface; the implementation modules below are private
to the table-population module unless a package-local test is exercising them.
"""

from __future__ import annotations

from typing import Any

from core.table_population.build_workbook import field_display_names
from core.table_population.cell_ref import (
    DEFAULT_FIRST_DATA_ROW,
    member_id,
)
from core.table_population.events import (
    build_review_summary_event,
)
from core.table_population.populate import (
    PopulationOutcome,
    build_pending_table_cells,
    cell_wire,
    finalize_cancelled_population,
    finalize_completed_population,
    new_execution_id,
    new_table_population_id,
    populate_table,
    prepare_refresh_delta,
)
from core.table_population.prepare import (
    AssembledPopulation,
    assemble_population_context,
    filters_from_dataset,
    read_json_document,
    resolve_cohort_tables,
)
from core.table_population.sql import (
    SqlError,
    bind_named_params,
    readonly_connection,
    run_readonly_sql,
    validate_sql,
)
from core.table_population.table_population_sessions import (
    TablePopulationSessionRelay,
)
from core.table_population.workbook_stream import cells_to_xlsx, sheets_from_cells


def get_session_relay() -> TablePopulationSessionRelay | None:
    from core.table_population import table_population_sessions

    return table_population_sessions.session_relay


def set_session_relay(relay: TablePopulationSessionRelay | None) -> None:
    from core.table_population import table_population_sessions

    table_population_sessions.session_relay = relay


def install_session_relay(
    agent_client: Any | None = None,
) -> TablePopulationSessionRelay:
    relay = TablePopulationSessionRelay(agent_client)
    set_session_relay(relay)
    return relay


__all__ = [
    "DEFAULT_FIRST_DATA_ROW",
    "AssembledPopulation",
    "PopulationOutcome",
    "SqlError",
    "TablePopulationSessionRelay",
    "assemble_population_context",
    "bind_named_params",
    "build_pending_table_cells",
    "build_review_summary_event",
    "cell_wire",
    "cells_to_xlsx",
    "field_display_names",
    "filters_from_dataset",
    "finalize_cancelled_population",
    "finalize_completed_population",
    "get_session_relay",
    "install_session_relay",
    "member_id",
    "new_execution_id",
    "new_table_population_id",
    "populate_table",
    "prepare_refresh_delta",
    "read_json_document",
    "readonly_connection",
    "resolve_cohort_tables",
    "run_readonly_sql",
    "set_session_relay",
    "sheets_from_cells",
    "validate_sql",
]
