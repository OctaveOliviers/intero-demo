"""Runtime state.db role policy (Ticket 2).

Central authority for DB-level permissions over runtime tables. This module is
deliberately deterministic and fail-closed:
- unknown role/table/action => denied
- unknown/extra columns under a constrained action => denied
"""

from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Iterable, Mapping

RuntimeRole = str
RuntimeTable = str
RuntimeAction = str


@dataclass(frozen=True)
class ActionRule:
    """One action rule over one table.

    ``allowed_columns``:
    - ``None`` means action allowed with no column-level constraint.
    - frozenset means all requested columns must be in that set.
    """

    allowed_columns: frozenset[str] | None = None


@dataclass(frozen=True)
class TableRule:
    actions: Mapping[RuntimeAction, ActionRule]


@dataclass(frozen=True)
class RuntimePermissionDenied(PermissionError):
    """Denied runtime state-db operation with safe + diagnostic payload."""

    role: RuntimeRole
    table: RuntimeTable
    action: RuntimeAction
    columns: tuple[str, ...] | None
    safe_message: str = "Permission denied for runtime state operation."

    def __str__(self) -> str:
        return self.safe_message


def _rule(actions: Mapping[RuntimeAction, frozenset[str] | None]) -> TableRule:
    return TableRule(
        actions=MappingProxyType(
            {action: ActionRule(cols) for action, cols in actions.items()}
        )
    )


def _insert_update_columns(
    *,
    insert: Iterable[str],
    immutable: Iterable[str],
) -> tuple[frozenset[str], frozenset[str]]:
    """Define insert + update column sets from one source of truth."""
    insert_cols = frozenset(insert)
    immutable_cols = frozenset(immutable)
    return insert_cols, frozenset(
        col for col in insert_cols if col not in immutable_cols
    )


# Canonical column sets, aligned with specs/mvp/contracts/control-plane-schema-and-permissions.md.
RUNS_UPDATE_COLUMNS = frozenset(
    {"status", "started_at", "ended_at", "parameters", "prompt_versions"}
)
# The table-population PROCESS-status record (issue #326) — the ONLY
# population lifecycle record. Writable by `api_app` ONLY (below, via
# RUNS_INSERT_COLUMNS): the lifecycle is owned by the server/session-transport
# layer. The orchestrator's runs surface (RUNS_UPDATE_COLUMNS) and the
# agent/clinician roles stay denied.
RUNS_POPULATION_LIFECYCLE_COLUMNS = frozenset(
    {"population_status", "population_status_detail", "population_result_status"}
)
RUNS_INSERT_COLUMNS = (
    frozenset(
        {
            "id",
            "audit_id",
            "user_id",
            "request",
            "template_version",
            "database_ids",
            "status",
            "prompt_versions",
            "filters",
            "parameters",
            "started_at",
            "ended_at",
        }
    )
    | RUNS_POPULATION_LIFECYCLE_COLUMNS
)
CELLS_RUNTIME_UPDATE_COLUMNS = frozenset(
    {
        "state",
        "value",
        "confidence",
        "resolved_by",
        "hypothesis",
        "attempts",
        "sources",
        "explanation",
        "prompt_version",
        "extracted_at",
        "reason_code",
        "reason_detail",
        "owner_needed",
        "outstanding_since",
    }
)
CELLS_ORCHESTRATOR_UPDATE_COLUMNS = CELLS_RUNTIME_UPDATE_COLUMNS | frozenset(
    {"review_state", "corrected"}
)
CELLS_AGENT_UPDATE_COLUMNS = CELLS_RUNTIME_UPDATE_COLUMNS
CELLS_CLINICIAN_UPDATE_COLUMNS = frozenset({"review_state", "corrected", "value"})

CELLS_INSERT_COLUMNS, CELLS_UPSERT_UPDATE_COLUMNS = _insert_update_columns(
    insert={
        "run_id",
        "ref",
        "field",
        "member",
        "kind",
        "state",
        "value",
        "confidence",
        "resolved_by",
        "hypothesis",
        "attempts",
        "review_state",
        "corrected",
        "explanation",
        "sources",
        "prompt_version",
        "extracted_at",
        "reason_code",
        "reason_detail",
        "owner_needed",
        "outstanding_since",
    },
    immutable={"run_id", "ref"},
)
EVENTS_INSERT_COLUMNS = frozenset({"run_id", "ts", "type", "payload", "execution_id"})
RUN_EXECUTIONS_INSERT_COLUMNS, RUN_EXECUTIONS_UPDATE_COLUMNS = _insert_update_columns(
    insert={"id", "run_id", "status", "started_at", "ended_at", "summary_json"},
    immutable={"id", "run_id"},
)
RUN_MEMBERS_INSERT_COLUMNS, RUN_MEMBERS_UPDATE_COLUMNS = _insert_update_columns(
    insert={
        "run_id",
        "member",
        "row_index",
        "active",
        "first_seen_execution_id",
        "last_seen_execution_id",
    },
    immutable={"run_id", "member", "row_index", "first_seen_execution_id"},
)
FIELD_CODES_COLUMNS = frozenset({"run_id", "field", "code", "meaning"})

EVENTS_TABLE_RULE = _rule({"select": None, "insert": EVENTS_INSERT_COLUMNS})
RUN_EXECUTIONS_TABLE_RULE = _rule(
    {
        "select": None,
        "insert": RUN_EXECUTIONS_INSERT_COLUMNS,
        "update": RUN_EXECUTIONS_UPDATE_COLUMNS,
    }
)
RUN_MEMBERS_TABLE_RULE = _rule(
    {
        "select": None,
        "insert": RUN_MEMBERS_INSERT_COLUMNS,
        "update": RUN_MEMBERS_UPDATE_COLUMNS,
    }
)
FIELD_CODES_TABLE_RULE = _rule(
    {
        "select": None,
        "insert": FIELD_CODES_COLUMNS,
        "update": FIELD_CODES_COLUMNS,
        "delete": None,
    }
)
RUNTIME_CORE_TABLE_RULES = {
    "events": EVENTS_TABLE_RULE,
    "run_executions": RUN_EXECUTIONS_TABLE_RULE,
    "run_members": RUN_MEMBERS_TABLE_RULE,
    "field_codes": FIELD_CODES_TABLE_RULE,
}


_POLICY: dict[RuntimeRole, dict[RuntimeTable, TableRule]] = {
    "api_app": {
        "runs": _rule(
            {
                "select": None,
                "insert": RUNS_INSERT_COLUMNS,
                "update": RUNS_INSERT_COLUMNS,
                "delete": None,
            }
        ),
        "cells": _rule(
            {
                "select": None,
                "insert": CELLS_INSERT_COLUMNS,
                "update": CELLS_UPSERT_UPDATE_COLUMNS,
            }
        ),
        **RUNTIME_CORE_TABLE_RULES,
    },
    "orchestrator_runtime": {
        "runs": _rule({"select": None, "update": RUNS_UPDATE_COLUMNS}),
        "cells": _rule(
            {
                "select": None,
                "insert": CELLS_INSERT_COLUMNS,
                "update": CELLS_ORCHESTRATOR_UPDATE_COLUMNS,
            }
        ),
        **RUNTIME_CORE_TABLE_RULES,
    },
    "agent_runtime_writer": {
        "runs": _rule({"select": None}),
        "cells": _rule({"select": None, "update": CELLS_AGENT_UPDATE_COLUMNS}),
        "events": _rule({"insert": EVENTS_INSERT_COLUMNS}),
        "run_members": _rule({"select": None}),
        "field_codes": _rule({"select": None}),
    },
    "clinician_editor_runtime": {
        "cells": _rule({"update": CELLS_CLINICIAN_UPDATE_COLUMNS}),
        "events": _rule({"insert": EVENTS_INSERT_COLUMNS}),
    },
}


def policy_matrix() -> Mapping[RuntimeRole, Mapping[RuntimeTable, TableRule]]:
    """Read-only view of the runtime role policy matrix."""
    return MappingProxyType({r: MappingProxyType(t) for r, t in _POLICY.items()})


def is_runtime_db_action_allowed(
    *,
    role: RuntimeRole,
    table: RuntimeTable,
    action: RuntimeAction,
    columns: Iterable[str] | None = None,
) -> bool:
    """Return whether a runtime DB action is allowed for ``role``.

    If ``columns`` is provided and the action has a column allowlist, every
    requested column must be listed.
    """
    table_rules = _POLICY.get(role)
    if table_rules is None:
        return False
    rule = table_rules.get(table)
    if rule is None:
        return False
    action_rule = rule.actions.get(action)
    if action_rule is None:
        return False

    if action_rule.allowed_columns is None:
        return True
    if columns is None:
        return False
    cols = tuple(columns)
    if not cols:
        return False
    return all(col in action_rule.allowed_columns for col in cols)


def require_runtime_db_action(
    *,
    role: RuntimeRole,
    table: RuntimeTable,
    action: RuntimeAction,
    columns: Iterable[str] | None = None,
) -> None:
    """Raise ``PermissionError`` unless the runtime DB action is allowed."""
    if is_runtime_db_action_allowed(
        role=role, table=table, action=action, columns=columns
    ):
        return
    cols = tuple(columns) if columns is not None else None
    raise RuntimePermissionDenied(
        role=role,
        table=table,
        action=action,
        columns=cols,
    )
