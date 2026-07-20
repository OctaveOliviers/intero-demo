"""Lock canonical table-population API surface: legacy start flow is not exported."""

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

import core.table_population as table_population  # noqa: E402


class TablePopulationPublicInterfaceTest(unittest.TestCase):
    def test_exports_only_canonical_package_interface(self) -> None:
        self.assertEqual(
            set(table_population.__all__),
            {
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
            },
        )

    def test_legacy_start_surface_is_not_available(self) -> None:
        self.assertFalse(hasattr(table_population, "start_run"))
        # The status.json machinery is gone (#326): the package no longer
        # exports a file writer/reader pair.
        self.assertNotIn("write_status", table_population.__all__)
        self.assertNotIn("read_status", table_population.__all__)
        self.assertFalse(hasattr(table_population, "build_agent_prompt"))
        self.assertFalse(hasattr(table_population, "collect_deps"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
