"""Unit tests for runtime state.db role policy (Ticket 2).

Run: ``python3 -m core.store.runtime_permissions_test``
"""

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from core.store.runtime_permissions import (  # noqa: E402
    RuntimePermissionDenied,
    is_runtime_db_action_allowed,
    policy_matrix,
    require_runtime_db_action,
)


class RuntimePermissionsTest(unittest.TestCase):
    def test_fail_closed_unknown_role_table_or_action(self):
        self.assertFalse(
            is_runtime_db_action_allowed(role="unknown", table="cells", action="update")
        )
        self.assertFalse(
            is_runtime_db_action_allowed(
                role="orchestrator_runtime", table="unknown_table", action="select"
            )
        )
        self.assertFalse(
            is_runtime_db_action_allowed(
                role="orchestrator_runtime", table="cells", action="truncate"
            )
        )

    def test_orchestrator_column_constraints_are_enforced(self):
        self.assertTrue(
            is_runtime_db_action_allowed(
                role="orchestrator_runtime",
                table="runs",
                action="update",
                columns=["status", "ended_at"],
            )
        )
        self.assertFalse(
            is_runtime_db_action_allowed(
                role="orchestrator_runtime",
                table="runs",
                action="update",
                columns=["status", "audit_id"],
            )
        )
        self.assertFalse(
            is_runtime_db_action_allowed(
                role="orchestrator_runtime",
                table="runs",
                action="update",
                columns=None,
            )
        )
        self.assertFalse(
            is_runtime_db_action_allowed(
                role="orchestrator_runtime",
                table="runs",
                action="update",
                columns=[],
            )
        )

    def test_agent_cannot_edit_clinician_review_columns(self):
        self.assertFalse(
            is_runtime_db_action_allowed(
                role="agent_runtime_writer",
                table="cells",
                action="update",
                columns=["review_state"],
            )
        )
        self.assertTrue(
            is_runtime_db_action_allowed(
                role="agent_runtime_writer",
                table="cells",
                action="update",
                columns=["value", "attempts", "sources"],
            )
        )

    def test_clinician_editor_update_scope(self):
        self.assertTrue(
            is_runtime_db_action_allowed(
                role="clinician_editor_runtime",
                table="cells",
                action="update",
                columns=["review_state", "corrected"],
            )
        )
        self.assertFalse(
            is_runtime_db_action_allowed(
                role="clinician_editor_runtime",
                table="cells",
                action="update",
                columns=["attempts"],
            )
        )
        self.assertFalse(
            is_runtime_db_action_allowed(
                role="clinician_editor_runtime",
                table="cells",
                action="select",
            )
        )

    def test_require_raises_permission_error_when_denied(self):
        with self.assertRaises(RuntimePermissionDenied) as denied:
            require_runtime_db_action(
                role="agent_runtime_writer",
                table="runs",
                action="update",
                columns=["status"],
            )
        self.assertEqual(denied.exception.safe_message, "Permission denied for runtime state operation.")
        self.assertEqual(str(denied.exception), "Permission denied for runtime state operation.")
        self.assertEqual(denied.exception.role, "agent_runtime_writer")
        self.assertEqual(denied.exception.table, "runs")
        self.assertEqual(denied.exception.action, "update")
        self.assertEqual(denied.exception.columns, ("status",))
        with self.assertRaises(PermissionError):
            require_runtime_db_action(
                role="unknown",
                table="cells",
                action="select",
            )
        with self.assertRaises(PermissionError):
            require_runtime_db_action(
                role="orchestrator_runtime",
                table="unknown_table",
                action="select",
            )
        with self.assertRaises(PermissionError):
            require_runtime_db_action(
                role="orchestrator_runtime",
                table="cells",
                action="truncate",
            )

    def test_policy_matrix_is_read_only(self):
        matrix = policy_matrix()
        with self.assertRaises(TypeError):
            matrix["new_role"] = {}  # type: ignore[index]
        with self.assertRaises(TypeError):
            matrix["orchestrator_runtime"]["new_table"] = {}  # type: ignore[index]
        with self.assertRaises(TypeError):
            matrix["orchestrator_runtime"]["runs"].actions["drop"] = object()  # type: ignore[index]


if __name__ == "__main__":
    unittest.main()
