"""The state store: a real local SQLite DB with CRUD for runs/cells/events.

This is the Gate-1 foundation — Lane B writes runs/cells/events here (B1/B4/B5),
Lane D reads them (D4/D7). It implements the frozen W0.2 contract
(`specs/mvp/contracts/state-schema.md`).

MVP is a single local SQLite file under ``var/`` (gitignored, mountable); the
schema and access paths anticipate moving to a hospital-hosted DB later
(doc 7 §Persistence) — no engine-specific assumptions leak past this module.
List/map-valued contract fields are JSON-encoded in their columns.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from core.config import STATE_DB_PATH, VAR_DIR
from core.store.models import Cell, Event, Run, RunExecution, RunMember, derive_status
from core.store.runtime_permissions import (
    EVENTS_INSERT_COLUMNS,
    FIELD_CODES_COLUMNS,
    require_runtime_db_action,
)
from core.store.schema import SCHEMA

# Columns carrying JSON-encoded list/map contract fields.
_RUN_JSON = ("database_ids", "prompt_versions", "filters", "parameters")
_CELL_JSON = ("attempts", "sources")

_RUN_COLS = (
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
    "population_status",
    "population_status_detail",
    "population_result_status",
)
# The table-population PROCESS-status record on a run row (issue #326) — the
# ONLY population lifecycle record (it retired the per-run-dir status.json),
# written together by record_population_status. api_app-only
# (runtime_permissions.py).
_POPULATION_LIFECYCLE_COLS = (
    "population_status",
    "population_status_detail",
    "population_result_status",
)
_CELL_COLS = (
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
)
_EXEC_COLS = (
    "id",
    "run_id",
    "status",
    "started_at",
    "ended_at",
    "summary_json",
)
_MEMBER_COLS = (
    "run_id",
    "member",
    "row_index",
    "active",
    "first_seen_execution_id",
    "last_seen_execution_id",
)
_EXEC_STATUS = {"queued", "running", "completed", "error", "stopped"}
_EXEC_TRANSITIONS = {
    "queued": {"running"},
    "running": {"completed", "error", "stopped"},
    "completed": set(),
    "error": set(),
    "stopped": set(),
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _encode_cell_column(col: str, val):
    """Encode one ``cells`` column value for SQLite storage.

    This keeps list/bool normalization in one place so ``_cell_row`` and
    ``update_cell`` serialize values identically.
    """
    if col in _CELL_JSON:
        return json.dumps(val)
    if col == "corrected":
        return None if val is None else int(val)
    return val


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {str(row["name"]) for row in conn.execute(f"PRAGMA table_info({table})")}


class Store:
    """SQLite-backed state store. Pass ``":memory:"`` for an ephemeral store."""

    def __init__(
        self,
        path: str | Path | None = None,
        *,
        runtime_role: str = "api_app",
    ) -> None:
        if path is None:
            VAR_DIR.mkdir(parents=True, exist_ok=True)
            path = STATE_DB_PATH
        # The on-disk path, exposed so out-of-process consumers (the agent's
        # query_cells tool) can open the same state DB. ":memory:" for ephemeral
        # stores — which the agent plane cannot reach, by design.
        self.path = str(path)
        self._conn = sqlite3.connect(str(path))
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.executescript(SCHEMA)
        self._migrate_schema()
        self._conn.commit()
        self.runtime_role = runtime_role

    def close(self) -> None:
        self._conn.close()

    def _migrate_schema(self) -> None:
        """Idempotent upgrades for pre-refresh state DBs."""
        if "execution_id" not in _table_columns(self._conn, "events"):
            self._conn.execute("ALTER TABLE events ADD COLUMN execution_id TEXT")
        self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_events_execution ON events(execution_id, id)"
        )
        # Table-population lifecycle columns (issue #326): a pre-#326 runs table
        # gains them here, appended in DDL order so PRAGMA table_info matches
        # _RUN_COLS on migrated and fresh DBs alike.
        run_cols = _table_columns(self._conn, "runs")
        for col in _POPULATION_LIFECYCLE_COLS:
            if col not in run_cols:
                self._conn.execute(f"ALTER TABLE runs ADD COLUMN {col} TEXT")

    def with_runtime_role(self, runtime_role: str) -> "Store":
        """Open a role-tagged store session against the same state DB path."""
        return Store(self.path, runtime_role=runtime_role)

    def _require_permission(
        self,
        table: str,
        action: str,
        columns: list[str] | tuple[str, ...] | None = None,
    ) -> None:
        require_runtime_db_action(
            role=self.runtime_role,
            table=table,
            action=action,
            columns=columns,
        )

    # -- runs ---------------------------------------------------------------

    def create_run(self, run: Run) -> Run:
        if run.started_at is None and run.status != "queued":
            run.started_at = _now()
        self._require_permission("runs", "insert", _RUN_COLS)
        self._conn.execute(
            f"INSERT INTO runs ({', '.join(_RUN_COLS)}) "
            f"VALUES ({', '.join('?' for _ in _RUN_COLS)})",
            self._run_row(run),
        )
        self._conn.commit()
        return run

    def get_run(self, run_id: str) -> Run | None:
        self._require_permission("runs", "select")
        row = self._conn.execute(
            "SELECT * FROM runs WHERE id = ?", (run_id,)
        ).fetchone()
        return self._row_to_run(row) if row else None

    def list_runs(self, user_id: str | None = None) -> list[Run]:
        self._require_permission("runs", "select")
        if user_id is None:
            rows = self._conn.execute(
                "SELECT * FROM runs ORDER BY started_at"
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT * FROM runs WHERE user_id = ? ORDER BY started_at", (user_id,)
            ).fetchall()
        return [self._row_to_run(r) for r in rows]

    def delete_run(self, run_id: str) -> bool:
        """Delete a run and ALL its child rows. The child tables (cells,
        field_codes, run_executions, run_members, events) declare
        ``REFERENCES runs(id) ON DELETE CASCADE`` and ``PRAGMA foreign_keys`` is
        ON, so removing the parent row removes every trace of the run from the
        state DB in one statement. Returns True if a run row existed."""
        self._require_permission("runs", "delete")
        cur = self._conn.execute("DELETE FROM runs WHERE id = ?", (run_id,))
        self._conn.commit()
        return cur.rowcount > 0

    def update_run(self, run_id: str, **fields) -> None:
        """Patch named run columns. JSON fields are encoded automatically.

        The caller owns lifecycle timing: this is a generic column patch and does
        **not** auto-stamp ``started_at``/``ended_at`` on a status transition.
        Lane B (B4) sets those when it moves a run through queued → in_progress →
        … → complete.
        """
        self._exec_update_run(run_id, fields)
        self._conn.commit()

    def _exec_update_run(self, run_id: str, fields: dict) -> None:
        """update_run without the commit — for batching into one transaction."""
        if not fields:
            return
        sets, values = [], []
        for col, val in fields.items():
            if col not in _RUN_COLS:
                raise KeyError(f"unknown runs column: {col}")
            sets.append(f"{col} = ?")
            values.append(json.dumps(val) if col in _RUN_JSON else val)
        self._require_permission("runs", "update", tuple(fields.keys()))
        values.append(run_id)
        self._conn.execute(f"UPDATE runs SET {', '.join(sets)} WHERE id = ?", values)

    def record_population_status(
        self,
        run_id: str,
        status: str,
        *,
        detail: str | None = None,
        result_status: str | None = None,
    ) -> bool:
        """Record the table-population PROCESS status on the run row (issue #326).

        The ONLY population lifecycle record; every transition arrives through
        the single canonical writer
        (``core.table_population.table_population_sessions.record_status``).
        This is the process lifecycle — queued | running | stopped | error |
        completed (the ``run_executions.status`` vocabulary) — DISTINCT from
        ``runs.status``, the cell-derived RESULT status.

        ``status`` and ``detail`` are replaced on every transition.
        ``population_result_status`` is PRESERVED across a transition that does
        not supply a new one (COALESCE) — issue #330: starting a refresh stamps
        ``running`` with ``result_status=None``, and it must NOT null the prior
        completed run's durable result snapshot. So a refresh that then crashes
        leaves the row ``running`` but still carrying the last-known-good
        result, which stays visible/recoverable instead of being destroyed. A
        terminal transition supplies the fresh snapshot and overwrites it as
        before; passing an explicit new ``result_status`` still replaces it.

        Historical oddity (pinned by the lifecycle characterization tests):
        a USER PAUSE finalizes as ``completed`` (with a result_status) even
        though the stop endpoint answers "stopped"; only a hard abort/delete
        records ``stopped``.

        Returns True when a run row existed to record on, False when it does
        not (a FRESH population's ``open_session`` stamps ``running`` before
        the session executor creates the run row — the executor compensates by
        creating the row with ``population_status='running'``).
        """
        if status not in _EXEC_STATUS:
            raise ValueError(f"invalid population status: {status!r}")
        self._require_permission("runs", "update", _POPULATION_LIFECYCLE_COLS)
        cur = self._conn.execute(
            "UPDATE runs SET population_status = ?, population_status_detail = ?, "
            "population_result_status = COALESCE(?, population_result_status) "
            "WHERE id = ?",
            (status, detail, result_status, run_id),
        )
        self._conn.commit()
        return cur.rowcount > 0

    # -- run executions -----------------------------------------------------

    def create_execution(self, execution: RunExecution) -> RunExecution:
        if execution.status not in _EXEC_STATUS:
            raise ValueError(f"invalid execution status: {execution.status!r}")
        if execution.status == "running" and execution.started_at is None:
            execution.started_at = _now()
        if (
            execution.status in {"completed", "error", "stopped"}
            and execution.ended_at is None
        ):
            execution.ended_at = _now()
        self._conn.execute(
            f"INSERT INTO run_executions ({', '.join(_EXEC_COLS)}) "
            f"VALUES ({', '.join('?' for _ in _EXEC_COLS)})",
            self._execution_row(execution),
        )
        self._conn.commit()
        return execution

    def get_execution(self, execution_id: str) -> RunExecution | None:
        row = self._conn.execute(
            "SELECT * FROM run_executions WHERE id = ?", (execution_id,)
        ).fetchone()
        return self._row_to_execution(row) if row else None

    def list_executions(self, run_id: str) -> list[RunExecution]:
        rows = self._conn.execute(
            "SELECT * FROM run_executions WHERE run_id = ? ORDER BY started_at, id",
            (run_id,),
        ).fetchall()
        return [self._row_to_execution(row) for row in rows]

    def update_execution_status(
        self,
        execution_id: str,
        status: str,
        *,
        summary_json: dict | None = None,
    ) -> RunExecution:
        if status not in _EXEC_STATUS:
            raise ValueError(f"invalid execution status: {status!r}")
        execution = self.get_execution(execution_id)
        if execution is None:
            raise KeyError(f"unknown execution: {execution_id}")
        if (
            status != execution.status
            and status not in _EXEC_TRANSITIONS[execution.status]
        ):
            raise ValueError(
                f"illegal execution status transition: {execution.status!r} -> {status!r}"
            )
        patch: dict[str, object] = {}
        if status != execution.status:
            patch["status"] = status
            if status == "running" and execution.started_at is None:
                patch["started_at"] = _now()
            if (
                status in {"completed", "error", "stopped"}
                and execution.ended_at is None
            ):
                patch["ended_at"] = _now()
        if summary_json is not None:
            patch["summary_json"] = summary_json
        if patch:
            sets = ", ".join(f"{col} = ?" for col in patch)
            values = [
                json.dumps(val) if col == "summary_json" else val
                for col, val in patch.items()
            ]
            values.append(execution_id)
            self._conn.execute(
                f"UPDATE run_executions SET {sets} WHERE id = ?",
                values,
            )
            self._conn.commit()
        refreshed = self.get_execution(execution_id)
        if refreshed is None:
            raise KeyError(f"unknown execution: {execution_id}")
        return refreshed

    # -- run members --------------------------------------------------------

    def upsert_run_member(self, member: RunMember) -> RunMember:
        self._require_execution_reference(
            member.run_id,
            member.first_seen_execution_id,
            field_name="first_seen_execution_id",
        )
        self._require_execution_reference(
            member.run_id,
            member.last_seen_execution_id,
            field_name="last_seen_execution_id",
        )
        self._conn.execute(
            f"INSERT INTO run_members ({', '.join(_MEMBER_COLS)}) "
            f"VALUES ({', '.join('?' for _ in _MEMBER_COLS)}) "
            "ON CONFLICT(run_id, member) DO UPDATE SET "
            "row_index = excluded.row_index, "
            "active = excluded.active, "
            "first_seen_execution_id = COALESCE(run_members.first_seen_execution_id, excluded.first_seen_execution_id), "
            "last_seen_execution_id = COALESCE(excluded.last_seen_execution_id, run_members.last_seen_execution_id)",
            self._member_row(member),
        )
        self._conn.commit()
        row = self._conn.execute(
            "SELECT * FROM run_members WHERE run_id = ? AND member = ?",
            (member.run_id, member.member),
        ).fetchone()
        if row is None:
            raise KeyError(
                f"unknown run member: ({member.run_id!r}, {member.member!r})"
            )
        return self._row_to_member(row)

    def list_run_members(self, run_id: str) -> list[RunMember]:
        rows = self._conn.execute(
            "SELECT * FROM run_members WHERE run_id = ? "
            "ORDER BY (row_index IS NULL), row_index, member",
            (run_id,),
        ).fetchall()
        return [self._row_to_member(row) for row in rows]

    # -- cells --------------------------------------------------------------

    def upsert_cell(self, cell: Cell) -> Cell:
        """Insert or replace a cell, keyed by (run_id, ref)."""
        if cell.extracted_at is None and cell.value is not None:
            cell.extracted_at = _now()
        self._require_permission("cells", "insert", _CELL_COLS)
        self._require_permission(
            "cells",
            "update",
            tuple(c for c in _CELL_COLS if c not in ("run_id", "ref")),
        )
        self._conn.execute(
            f"INSERT INTO cells ({', '.join(_CELL_COLS)}) "
            f"VALUES ({', '.join('?' for _ in _CELL_COLS)}) "
            f"ON CONFLICT(run_id, ref) DO UPDATE SET "
            f"{', '.join(f'{c}=excluded.{c}' for c in _CELL_COLS if c not in ('run_id', 'ref'))}",
            self._cell_row(cell),
        )
        self._conn.commit()
        return cell

    def insert_pending_cells(self, cells: list[Cell]) -> None:
        """Batch-insert the run's full `pending` grid in one transaction.

        The orchestrator's first write (A0): one row per (region × cohort member ×
        cell slot), each carrying sheet/ref/field/member/kind and state=`pending`
        and nothing else. Inserted up front so every cell exists in the store (and
        the FE) before any tier runs; the tiers then UPDATE them in place via
        :meth:`update_cell`.
        """
        if not cells:
            return
        self._require_permission("cells", "insert", _CELL_COLS)
        self._conn.executemany(
            f"INSERT INTO cells ({', '.join(_CELL_COLS)}) "
            f"VALUES ({', '.join('?' for _ in _CELL_COLS)})",
            [self._cell_row(c) for c in cells],
        )
        self._conn.commit()

    def materialize_field_codes(self, run_id: str, audit: dict | None) -> int:
        """Project spec.json's per-field code sets into ``field_codes`` for a run.

        Called once by the orchestrator at run start (alongside the pending
        grid). spec.json stays the canonical source; this is a derived,
        run-scoped copy that exists ONLY so the off-code triggers can reject a
        bad write at the DB level — for the agent's raw SQL and every tier
        alike. Idempotent per run (clears then re-inserts). Returns the number
        of code rows written.

        A field is coded when its ``permitted_values`` is a non-empty map
        (audit-spec.schema.json); free-text / numeric fields contribute no rows
        and so are never off-code-checked.
        """
        self._require_permission("field_codes", "delete")
        self._conn.execute("DELETE FROM field_codes WHERE run_id = ?", (run_id,))
        rows: list[tuple] = []
        for field in (audit or {}).get("fields", []) or []:
            field_id = field.get("id")
            codes = field.get("permitted_values")
            if not field_id or not isinstance(codes, dict):
                continue
            for code, meaning in codes.items():
                rows.append((run_id, field_id, str(code), meaning))
        if rows:
            self._require_permission("field_codes", "insert", FIELD_CODES_COLUMNS)
            self._conn.executemany(
                "INSERT OR REPLACE INTO field_codes (run_id, field, code, meaning) "
                "VALUES (?, ?, ?, ?)",
                rows,
            )
        self._conn.commit()
        return len(rows)

    def update_cell(self, run_id: str, ref: str, **fields) -> Cell:
        """Surgically UPDATE one cell in place, keyed by (run_id, ref).

        The in-place write every tier makes (A0): patch only the named columns
        (state/value/resolved_by/attempts/…), leaving sheet/ref/field/member and
        every other column untouched. JSON-encoded list columns are encoded
        automatically. Returns the refreshed row. Raises KeyError on an unknown
        column or a missing cell.
        """
        if self.runtime_role == "clinician_editor_runtime" and not fields:
            raise PermissionError(
                "clinician runtime update requires at least one editable field"
            )
        if (
            "value" in fields
            and fields["value"] is not None
            and "extracted_at" not in fields
            and self.runtime_role != "clinician_editor_runtime"
        ):
            fields["extracted_at"] = _now()
        if fields:
            sets, values = [], []
            for col, val in fields.items():
                if col not in _CELL_COLS or col in ("run_id", "ref"):
                    raise KeyError(f"cannot update cells column: {col}")
                sets.append(f"{col} = ?")
                values.append(_encode_cell_column(col, val))
            self._require_permission("cells", "update", tuple(fields.keys()))
            values += [run_id, ref]
            self._conn.execute(
                f"UPDATE cells SET {', '.join(sets)} WHERE run_id = ? AND ref = ?",
                values,
            )
            self._conn.commit()
        if self.runtime_role == "clinician_editor_runtime":
            row = self._conn.execute(
                "SELECT * FROM cells WHERE run_id = ? AND ref = ?", (run_id, ref)
            ).fetchone()
            cell = self._row_to_cell(row) if row else None
        else:
            cell = self.get_cell(run_id, ref)
        if cell is None:
            raise KeyError(f"unknown cell: ({run_id!r}, {ref!r})")
        return cell

    def get_cells(self, run_id: str) -> list[Cell]:
        self._require_permission("cells", "select")
        rows = self._conn.execute(
            "SELECT * FROM cells WHERE run_id = ? ORDER BY ref", (run_id,)
        ).fetchall()
        return [self._row_to_cell(r) for r in rows]

    def get_cell(self, run_id: str, ref: str) -> Cell | None:
        self._require_permission("cells", "select")
        row = self._conn.execute(
            "SELECT * FROM cells WHERE run_id = ? AND ref = ?", (run_id, ref)
        ).fetchone()
        return self._row_to_cell(row) if row else None

    # -- events -------------------------------------------------------------

    def append_event(self, event: Event) -> Event:
        self._require_execution_reference(
            event.run_id,
            event.execution_id,
            field_name="execution_id",
        )
        self._exec_append_event(event)
        self._conn.commit()
        return event

    def _exec_append_event(self, event: Event) -> Event:
        """append_event without the commit — for batching into one transaction."""
        if event.ts is None:
            event.ts = _now()
        self._require_permission("events", "insert", EVENTS_INSERT_COLUMNS)
        cur = self._conn.execute(
            "INSERT INTO events (run_id, execution_id, ts, type, payload) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                event.run_id,
                event.execution_id,
                event.ts,
                event.type,
                json.dumps(event.payload),
            ),
        )
        event.id = cur.lastrowid
        return event

    def get_events(self, run_id: str) -> list[Event]:
        self._require_permission("events", "select")
        rows = self._conn.execute(
            "SELECT * FROM events WHERE run_id = ? ORDER BY id", (run_id,)
        ).fetchall()
        return [
            Event(
                run_id=r["run_id"],
                type=r["type"],
                payload=json.loads(r["payload"] or "{}"),
                execution_id=r["execution_id"],
                ts=r["ts"],
                id=r["id"],
            )
            for r in rows
        ]

    def count_events(
        self,
        run_id: str,
        *,
        execution_id: str | None = None,
        type: str | None = None,
    ) -> int:
        where = ["run_id = ?"]
        values: list[object] = [run_id]
        if execution_id is not None:
            where.append("execution_id = ?")
            values.append(execution_id)
        if type is not None:
            where.append("type = ?")
            values.append(type)
        row = self._conn.execute(
            f"SELECT COUNT(*) AS n FROM events WHERE {' AND '.join(where)}",
            tuple(values),
        ).fetchone()
        return int(row["n"] or 0) if row is not None else 0

    # -- status -------------------------------------------------------------

    def recompute_status(self, run_id: str) -> str:
        """Re-derive the run's status from its persisted cells, persist it, and
        append a ``status_change`` event if it moved (GAP-3 durability).

        The status update and its ``status_change`` event are committed in a
        single transaction so the durable status and the audit trail can never
        disagree after a crash.
        """
        run = self.get_run(run_id)
        if run is None:
            raise KeyError(f"unknown run: {run_id}")
        new_status = derive_status(
            self.get_cells(run_id), started=run.started_at is not None
        )
        if new_status != run.status:
            self._exec_update_run(run_id, {"status": new_status})
            self._exec_append_event(
                Event(
                    run_id=run_id,
                    type="status_change",
                    payload={"from": run.status, "to": new_status},
                )
            )
            self._conn.commit()
        return new_status

    # -- row <-> dataclass --------------------------------------------------

    def _run_row(self, run: Run) -> tuple:
        return tuple(
            json.dumps(getattr(run, c)) if c in _RUN_JSON else getattr(run, c)
            for c in _RUN_COLS
        )

    def _require_execution_reference(
        self,
        run_id: str,
        execution_id: str | None,
        *,
        field_name: str,
    ) -> None:
        if execution_id is None:
            return
        row = self._conn.execute(
            "SELECT 1 FROM run_executions WHERE id = ? AND run_id = ?",
            (execution_id, run_id),
        ).fetchone()
        if row is None:
            raise ValueError(
                f"{field_name} must reference an existing run_executions.id for this run: "
                f"run_id={run_id!r}, execution_id={execution_id!r}"
            )

    def _row_to_run(self, row: sqlite3.Row) -> Run:
        data = {c: row[c] for c in _RUN_COLS}
        for c in _RUN_JSON:
            data[c] = (
                json.loads(data[c])
                if data[c]
                else ({} if c in ("prompt_versions", "parameters") else [])
            )
        return Run(**data)

    def _execution_row(self, execution: RunExecution) -> tuple:
        out = []
        for col in _EXEC_COLS:
            value = getattr(execution, col)
            out.append(json.dumps(value) if col == "summary_json" else value)
        return tuple(out)

    def _row_to_execution(self, row: sqlite3.Row) -> RunExecution:
        data = {col: row[col] for col in _EXEC_COLS}
        data["summary_json"] = (
            json.loads(data["summary_json"]) if data["summary_json"] else {}
        )
        return RunExecution(**data)

    def _member_row(self, member: RunMember) -> tuple:
        out = []
        for col in _MEMBER_COLS:
            value = getattr(member, col)
            if col == "active":
                out.append(1 if value else 0)
            else:
                out.append(value)
        return tuple(out)

    def _row_to_member(self, row: sqlite3.Row) -> RunMember:
        return RunMember(
            run_id=row["run_id"],
            member=row["member"],
            row_index=row["row_index"],
            active=bool(row["active"]),
            first_seen_execution_id=row["first_seen_execution_id"],
            last_seen_execution_id=row["last_seen_execution_id"],
        )

    def _cell_row(self, cell: Cell) -> tuple:
        out = []
        for c in _CELL_COLS:
            out.append(_encode_cell_column(c, getattr(cell, c)))
        return tuple(out)

    def _row_to_cell(self, row: sqlite3.Row) -> Cell:
        data = {c: row[c] for c in _CELL_COLS}
        for c in _CELL_JSON:
            data[c] = json.loads(data[c]) if data[c] else []
        if data["corrected"] is not None:
            data["corrected"] = bool(data["corrected"])
        return Cell(**data)
