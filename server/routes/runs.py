import asyncio
import json
import logging
import re
import shutil
from typing import Any
from datetime import datetime, date, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from core.running import stream_runner as runner_mod
from core import running as run_engine
from core import mapping as mapping_phase
from core.catalog import get_audit_by_id
from core.config import AUDITS_DIR, DATABASES_DIR, RUNS_DIR
from core.running.sql import run_readonly_sql
from core.running.build_workbook import build_initial_workbook
from core.running.workbook_stream import read_workbook_sheets
from core.running.try_agent import make_tier_agent
from core.running.try_direct import try_direct
from core.running.try_llm import make_tier_llm
from core.running.orchestrator import precompute_pending_cells
from core.running.cell_ref import DEFAULT_FIRST_DATA_ROW, member_id as format_member_id
from core.store import Cell, Event, Run, RunExecution, RunMember, RuntimePermissionDenied, Store
from server.auth import permissions as authz
from server.auth import store as auth_store
from server.auth.deps import current_user, current_user_id
from server.models import (
    ChipMessage,
    RunCellEditRequest,
    RunCellEditResponse,
    RunCreateFromAuditRequest,
    RunCreateResponse,
    RunRefreshResponse,
    RunStateResponse,
    TextMessage,
)

router = APIRouter()
logger = logging.getLogger(__name__)
_SPINE_TASKS: dict[str, asyncio.Task[None]] = {}
_REFRESHABLE_RUN_STATUSES = {"completed"}
_REFRESH_START_LOCKS: dict[str, asyncio.Lock] = {}
_SOURCE_RE = re.compile(r"^\s*(?P<db>[^>]+?)\s*->\s*(?P<table>[^.]+?)\.(?P<column>.+?)\s*$")
_NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?")
_A1_ROW_RE = re.compile(r"[A-Za-z]+(?P<row>\d+)$")


def _audit_default_databases(audit_id: str, audit_spec: dict[str, Any]) -> list[str]:
    """Database slugs the audit is bound to, in priority order.

    The canonical declaration is ``mapping.json::databases`` (mapping
    contract). For audits that haven't been mapped yet we fall back to a
    seed-time hint at ``spec.json::databases`` — a small extension to the
    audit-spec used only as a default-pick hint (the mapping is still the
    source of truth at run time). Returns an empty list when neither
    declaration is present.
    """
    mapping_doc = _read_json(AUDITS_DIR / audit_id / "mapping.json")
    if isinstance(mapping_doc, dict):
        dbs = mapping_doc.get("databases")
        if isinstance(dbs, list) and dbs:
            return [str(d) for d in dbs if isinstance(d, str) and d]
    spec_dbs = audit_spec.get("databases") if isinstance(audit_spec, dict) else None
    if isinstance(spec_dbs, list) and spec_dbs:
        return [str(d) for d in spec_dbs if isinstance(d, str) and d]
    return []


def _resolve_audit_excel(audit_id: str) -> Path:
    audit = get_audit_by_id(audit_id)
    if audit is None:
        raise HTTPException(status_code=404, detail=f"Audit '{audit_id}' not found.")
    excel_path = AUDITS_DIR / audit_id / audit["excel_path"]
    if not excel_path.exists():
        raise HTTPException(status_code=500, detail=f"Audit file missing on server: {audit_id}/{audit['excel_path']}")
    return excel_path


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    return data if isinstance(data, dict) else None


def _write_run_status(run_dir: Path, status: str, *, detail: str | None = None,
                      run_status: str | None = None) -> None:
    payload: dict[str, Any] = {"status": status}
    if detail:
        payload["detail"] = detail
    if run_status:
        payload["run_status"] = run_status
    try:
        (run_dir / "status.json").write_text(
            json.dumps(payload, ensure_ascii=False), encoding="utf-8"
        )
    except OSError:
        pass


def _new_execution_id() -> str:
    return "exec-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8]


def _read_surface_run_status(run_dir: Path) -> str:
    status_path = run_dir / "status.json"
    result_path = run_dir / "result.xlsx"
    status = "running"
    if status_path.exists():
        try:
            status = json.loads(status_path.read_text(encoding="utf-8")).get("status", "running")
        except (json.JSONDecodeError, OSError):
            status = "running"
    elif result_path.exists():
        status = "completed"
    return status


def _is_execution_active(run_id: str) -> bool:
    task = _SPINE_TASKS.get(run_id)
    return task is not None and not task.done()


def _refresh_start_lock(run_id: str) -> asyncio.Lock:
    lock = _REFRESH_START_LOCKS.get(run_id)
    if lock is None:
        lock = asyncio.Lock()
        _REFRESH_START_LOCKS[run_id] = lock
    return lock


def _raise_refresh_error(status_code: int, code: str, message: str) -> None:
    raise HTTPException(status_code=status_code, detail={"code": code, "message": message})


def _normalize_filter_key(raw: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(raw).lower())


def _parse_source(source: str) -> tuple[str, str, str] | None:
    m = _SOURCE_RE.match(source or "")
    if not m:
        return None
    return m.group("db").strip(), m.group("table").strip(), m.group("column").strip()


def _cohort_aliases(from_clause: str) -> dict[str, str]:
    aliases: dict[str, str] = {}
    lead = re.match(
        r"^\s*([A-Za-z_][\w.]*)\s+(?:AS\s+)?([A-Za-z_]\w*)\b",
        from_clause,
        flags=re.IGNORECASE,
    )
    if lead:
        aliases[lead.group(1).strip()] = lead.group(2).strip()
    else:
        lead_table = re.match(r"^\s*([A-Za-z_][\w.]*)\b", from_clause)
        if lead_table:
            table = lead_table.group(1).strip()
            aliases[table] = table
    for m in re.finditer(
        r"\b(?:FROM|JOIN)\s+([A-Za-z_][\w.]*)\s+(?:AS\s+)?([A-Za-z_]\w*)",
        from_clause,
        flags=re.IGNORECASE,
    ):
        table = m.group(1).strip()
        alias = m.group(2).strip()
        aliases[table] = alias
    for m in re.finditer(
        r"\b(?:FROM|JOIN)\s+([A-Za-z_][\w.]*)\b",
        from_clause,
        flags=re.IGNORECASE,
    ):
        table = m.group(1).strip()
        aliases.setdefault(table, table)
    return aliases


def _date_to_iso(raw: str) -> str | None:
    text = raw.strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text).isoformat()
    except ValueError:
        pass
    try:
        return datetime.fromisoformat(text).date().isoformat()
    except ValueError:
        pass
    for fmt in ("%d %b %Y", "%d %B %Y", "%Y/%m/%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _number_clause(value: str) -> tuple[str, list[float]] | None:
    text = value.strip().lower()
    text = text.replace("≥", ">=").replace("≤", "<=").replace("–", "-")
    text = re.sub(r"\b(weeks?|days?|months?|years?|yrs?)\b", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    direct = re.match(r"^(>=|<=|>|<|=)\s*(-?\d+(?:\.\d+)?)\s*$", text)
    if direct:
        return direct.group(1), [float(direct.group(2))]
    over = re.search(r"\b(over|older than|greater than|more than)\s+(-?\d+(?:\.\d+)?)", text)
    if over:
        return ">", [float(over.group(2))]
    under = re.search(r"\b(under|less than|below)\s+(-?\d+(?:\.\d+)?)", text)
    if under:
        return "<", [float(under.group(2))]
    between = re.search(
        r"(-?\d+(?:\.\d+)?)\s*(?:to|-|\.\.)\s*(-?\d+(?:\.\d+)?)", text
    )
    if between:
        a = float(between.group(1))
        b = float(between.group(2))
        lo, hi = (a, b) if a <= b else (b, a)
        return "between", [lo, hi]
    nums = _NUMBER_RE.findall(text)
    if len(nums) == 1:
        return "=", [float(nums[0])]
    if len(nums) >= 2:
        a = float(nums[0])
        b = float(nums[1])
        lo, hi = (a, b) if a <= b else (b, a)
        return "between", [lo, hi]
    return None


def _date_clause(value: str, key_hint: str = "") -> tuple[str, list[str]] | None:
    text = value.strip()
    lower = text.lower()
    if key_hint.endswith("from"):
        key_op = ">="
    elif key_hint.endswith("to"):
        key_op = "<="
    else:
        key_op = ""
    direct = re.match(r"^(>=|<=|>|<|=)\s*(.+)$", text)
    if direct:
        parsed = _date_to_iso(direct.group(2))
        return (direct.group(1), [parsed]) if parsed else None
    if key_op:
        parsed = _date_to_iso(text)
        return (key_op, [parsed]) if parsed else None
    if " to " in lower:
        a_raw, b_raw = re.split(r"\bto\b", text, maxsplit=1, flags=re.IGNORECASE)
        a = _date_to_iso(a_raw.strip())
        b = _date_to_iso(b_raw.strip())
        if a and b:
            lo, hi = (a, b) if a <= b else (b, a)
            return "between", [lo, hi]
    for prefix, op in (("since ", ">="), ("after ", ">"), ("before ", "<"), ("until ", "<=")):
        if lower.startswith(prefix):
            parsed = _date_to_iso(text[len(prefix):].strip())
            return (op, [parsed]) if parsed else None
    parsed = _date_to_iso(text)
    return ("=", [parsed]) if parsed else None


def _resolve_binding(
    filter_key: str, bindings: list[dict[str, Any]]
) -> dict[str, Any] | None:
    norm = _normalize_filter_key(filter_key)
    if not norm:
        return None
    candidates: list[dict[str, Any]] = []
    for binding in bindings:
        source = str(binding.get("source") or "")
        parsed = _parse_source(source)
        keyset = {
            _normalize_filter_key(str(binding.get("criterion_id") or "")),
            _normalize_filter_key(str(binding.get("label") or "")),
        }
        if parsed is not None:
            keyset.add(_normalize_filter_key(parsed[2]))  # source column
        if norm in keyset:
            candidates.append(binding)
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        return None
    fuzzy = []
    for binding in bindings:
        parsed = _parse_source(str(binding.get("source") or ""))
        fields = [
            _normalize_filter_key(str(binding.get("criterion_id") or "")),
            _normalize_filter_key(str(binding.get("label") or "")),
            _normalize_filter_key(parsed[2]) if parsed is not None else "",
        ]
        if any(norm and (norm in f or f in norm) for f in fields if f):
            fuzzy.append(binding)
    if len(fuzzy) == 1:
        return fuzzy[0]
    return None


def _encode_sse_data_message(event: dict[str, Any]) -> str:
    """Canonical run-stream SSE framing: data-only payload, event name in data.type."""
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _resolve_runtime_filter_predicates(
    filters: dict[str, str],
    mapping_doc: dict[str, Any],
    *,
    database_id: str,
    cohort_from: str,
) -> tuple[list[str], dict[str, Any]]:
    if not filters:
        return [], {}
    aliases = _cohort_aliases(cohort_from)
    bindings = []
    for raw in mapping_doc.get("criteria_bindings", []) or []:
        if not isinstance(raw, dict):
            continue
        parsed = _parse_source(str(raw.get("source") or ""))
        if parsed is None:
            continue
        if parsed[0] == database_id:
            bindings.append(raw)
    if not bindings:
        raise ValueError("mapping has no criteria bindings for the selected database")

    unresolved: list[str] = []
    where_terms: list[str] = []
    params: dict[str, Any] = {}
    idx = 0
    for key, value in filters.items():
        raw_key = str(key).strip()
        raw_value = str(value).strip()
        if not raw_key or not raw_value:
            continue
        if _normalize_filter_key(raw_key) == "database":
            continue
        binding = _resolve_binding(raw_key, bindings)
        if binding is None:
            unresolved.append(f"{raw_key!r}: no unique criteria binding")
            continue
        source = _parse_source(str(binding.get("source") or ""))
        if source is None:
            unresolved.append(f"{raw_key!r}: invalid source reference")
            continue
        _, table, column = source
        if table not in aliases:
            unresolved.append(f"{raw_key!r}: source table {table!r} is not in cohort.from")
            continue
        col_ref = f"{aliases[table]}.{column}"
        ftype = str(binding.get("type") or "").strip().lower()
        if ftype == "category":
            values = [part.strip() for part in re.split(r"[,\|]", raw_value) if part.strip()]
            if not values:
                unresolved.append(f"{raw_key!r}: empty category value")
                continue
            bind_names = []
            for item in values:
                name = f"f{idx}_{len(bind_names)}"
                params[name] = item
                bind_names.append(f":{name}")
            if len(bind_names) == 1:
                where_terms.append(f"{col_ref} = {bind_names[0]}")
            else:
                where_terms.append(f"{col_ref} IN ({', '.join(bind_names)})")
            idx += 1
            continue
        if ftype == "number":
            clause = _number_clause(raw_value)
            if clause is None:
                unresolved.append(f"{raw_key!r}: cannot parse numeric filter {raw_value!r}")
                continue
            op, vals = clause
            if op == "between":
                lo = f"f{idx}_lo"
                hi = f"f{idx}_hi"
                params[lo], params[hi] = vals
                where_terms.append(f"{col_ref} BETWEEN :{lo} AND :{hi}")
            else:
                name = f"f{idx}"
                params[name] = vals[0]
                where_terms.append(f"{col_ref} {op} :{name}")
            idx += 1
            continue
        if ftype == "date":
            clause = _date_clause(raw_value, _normalize_filter_key(raw_key))
            if clause is None:
                unresolved.append(f"{raw_key!r}: cannot parse date filter {raw_value!r}")
                continue
            op, vals = clause
            if op == "between":
                lo = f"f{idx}_from"
                hi = f"f{idx}_to"
                params[lo], params[hi] = vals
                where_terms.append(f"{col_ref} BETWEEN :{lo} AND :{hi}")
            else:
                name = f"f{idx}"
                params[name] = vals[0]
                where_terms.append(f"{col_ref} {op} :{name}")
            idx += 1
            continue
        unresolved.append(f"{raw_key!r}: unsupported filter type {ftype!r}")

    if unresolved:
        raise ValueError(
            "Could not resolve one or more run filters: " + "; ".join(unresolved)
        )
    return where_terms, params


def _resolve_cohort(
    executable: dict[str, Any],
    database_paths: dict[str, Path],
    *,
    runtime_where: list[str] | None = None,
    runtime_params: dict[str, Any] | None = None,
) -> list[Any]:
    cohort_spec = executable.get("cohort")
    if not isinstance(cohort_spec, dict):
        raise ValueError("executable.cohort is missing")
    db_slug = str(cohort_spec.get("database") or "").strip()
    if not db_slug:
        raise ValueError("executable.cohort.database is missing")
    db_path = database_paths.get(db_slug)
    if db_path is None:
        raise ValueError(f"no database path supplied for cohort database {db_slug!r}")
    identity_select = str(cohort_spec.get("identity_select") or "").strip()
    from_clause = str(cohort_spec.get("from") or "").strip()
    if not identity_select or not from_clause:
        raise ValueError("executable.cohort is incomplete (identity_select/from)")
    where_terms = [
        str(term).strip()
        for term in (cohort_spec.get("where") or [])
        if str(term).strip()
    ]
    for term in runtime_where or []:
        if str(term).strip():
            where_terms.append(str(term).strip())
    sql = f"SELECT DISTINCT {identity_select} FROM {from_clause}"
    if where_terms:
        sql += " WHERE " + " AND ".join(f"({term})" for term in where_terms)
    rows = run_readonly_sql(db_path, sql, runtime_params or {})
    keys = [str(k).lower() for k in (executable.get("identity_keys") or [])]
    if not keys:
        raise ValueError("executable.identity_keys is missing")

    cohort: list[Any] = []
    seen: set[Any] = set()
    for row in rows:
        values = [row.get(key) for key in keys]
        if any(v is None for v in values):
            continue
        member: Any = values[0] if len(values) == 1 else tuple(values)
        if member in seen:
            continue
        seen.add(member)
        cohort.append(member)
    return cohort


def _resolve_cohort_tables(database_id: str, anchor: str | None) -> dict[str, list[str]]:
    if not anchor:
        return {}
    model = _read_json(DATABASES_DIR / database_id / "model.json")
    if model is None:
        return {database_id: []}
    tables: list[str] = []
    anchor_lower = anchor.lower()
    for table in model.get("tables", []) or []:
        if not isinstance(table, dict):
            continue
        cols = table.get("columns", []) or []
        if any(
            isinstance(col, dict) and str(col.get("name") or "").lower() == anchor_lower
            for col in cols
        ):
            name = str(table.get("name") or "").strip()
            if name:
                tables.append(name)
    return {database_id: tables}


def _row_index_from_ref(ref: str, *, first_data_row: int) -> int | None:
    _, _, a1 = ref.partition("!")
    m = _A1_ROW_RE.match(a1.strip())
    if not m:
        return None
    row_no = int(m.group("row"))
    idx = row_no - first_data_row
    return idx if idx >= 0 else None


def _infer_member_row_index(cells: list[Cell], *, first_data_row: int) -> dict[str, int]:
    by_member: dict[str, int] = {}
    for cell in cells:
        if not cell.member:
            continue
        idx = _row_index_from_ref(cell.ref, first_data_row=first_data_row)
        if idx is None:
            continue
        prev = by_member.get(cell.member)
        by_member[cell.member] = idx if prev is None else min(prev, idx)
    return by_member


def _sync_initial_run_members(
    store: Store,
    *,
    run_id: str,
    cohort: list[Any],
    member_row_index: dict[str, int],
) -> None:
    for member in cohort:
        member_id = format_member_id(member)
        store.upsert_run_member(
            RunMember(
                run_id=run_id,
                member=member_id,
                row_index=member_row_index[member_id],
                active=True,
            )
        )


def _prepare_refresh_delta(
    store: Store,
    *,
    run_id: str,
    execution_id: str,
    executable: dict[str, Any],
    cohort: list[Any],
) -> dict[str, Any]:
    first_data_row = int(executable.get("first_data_row", DEFAULT_FIRST_DATA_ROW))
    cohort_member_ids = [format_member_id(member) for member in cohort]
    active_member_ids = set(cohort_member_ids)

    existing_members = store.list_run_members(run_id)
    existing_by_id = {member.member: member for member in existing_members}
    member_row_index: dict[str, int] = {
        member.member: int(member.row_index)
        for member in existing_members
        if member.row_index is not None
    }

    cells = store.get_cells(run_id)
    if not member_row_index:
        member_row_index.update(
            _infer_member_row_index(cells, first_data_row=first_data_row)
        )

    known_member_ids = set(existing_by_id) | set(member_row_index)
    next_row = max(member_row_index.values(), default=-1) + 1
    for member_id in sorted(known_member_ids):
        if member_id not in member_row_index:
            member_row_index[member_id] = next_row
            next_row += 1

    new_member_ids: list[str] = []
    for member_id in cohort_member_ids:
        if member_id in known_member_ids:
            continue
        member_row_index[member_id] = next_row
        next_row += 1
        known_member_ids.add(member_id)
        new_member_ids.append(member_id)

    departed_member_ids = sorted(known_member_ids - active_member_ids)
    unchanged_member_ids = sorted(active_member_ids - set(new_member_ids))

    for member_id in departed_member_ids:
        existing = existing_by_id.get(member_id)
        store.upsert_run_member(
            RunMember(
                run_id=run_id,
                member=member_id,
                row_index=member_row_index[member_id],
                active=False,
                first_seen_execution_id=(
                    existing.first_seen_execution_id if existing is not None else None
                ),
                last_seen_execution_id=(
                    existing.last_seen_execution_id if existing is not None else None
                ),
            )
        )

    for member_id in unchanged_member_ids + new_member_ids:
        existing = existing_by_id.get(member_id)
        store.upsert_run_member(
            RunMember(
                run_id=run_id,
                member=member_id,
                row_index=member_row_index[member_id],
                active=True,
                first_seen_execution_id=(
                    existing.first_seen_execution_id
                    if existing is not None and existing.first_seen_execution_id is not None
                    else execution_id
                ),
                last_seen_execution_id=execution_id,
            )
        )

    existing_ref_set = {cell.ref for cell in cells}
    reopened_blocked_refs: set[str] = set()
    for cell in cells:
        if cell.member not in active_member_ids:
            continue
        if cell.state != "blocked":
            continue
        reopened_blocked_refs.add(cell.ref)
        store.update_cell(
            run_id,
            cell.ref,
            state="pending",
            value=None,
            confidence=None,
            resolved_by=None,
            hypothesis=None,
            attempts=[],
            review_state=None,
            corrected=None,
            explanation=None,
            sources=[],
            reason_code=None,
            reason_detail=None,
            owner_needed=None,
            outstanding_since=None,
        )

    new_pending = precompute_pending_cells(
        run_id,
        executable,
        new_member_ids,
        member_rows=member_row_index,
    )
    insertable_new_pending = [cell for cell in new_pending if cell.ref not in existing_ref_set]
    colliding_refs = sorted({cell.ref for cell in new_pending} & existing_ref_set)
    if colliding_refs:
        sample = ", ".join(colliding_refs[:3])
        raise ValueError(f"refresh produced duplicate cell refs for existing run cells: {sample}")
    store.insert_pending_cells(insertable_new_pending)

    return {
        "active_member_ids": active_member_ids,
        "member_row_index": {
            member_id: member_row_index[member_id]
            for member_id in active_member_ids
        },
        "new_members_count": len(new_member_ids),
        "departed_members_count": len(departed_member_ids),
        "retried_blocked_count": len(reopened_blocked_refs),
        "reopened_blocked_refs": reopened_blocked_refs,
        "preprocess_updated_cells_count": len(reopened_blocked_refs) + len(insertable_new_pending),
    }


def _build_refresh_summary(
    store: Store,
    *,
    run_id: str,
    execution_id: str | None,
    refresh_stats: dict[str, Any] | None,
) -> dict[str, Any]:
    if not execution_id or not refresh_stats:
        return {}
    cells = store.get_cells(run_id)
    by_ref = {cell.ref: cell for cell in cells}
    reopened_blocked_refs = set(refresh_stats.get("reopened_blocked_refs", set()))
    active_member_ids = set(refresh_stats.get("active_member_ids", set()))
    resolved_blocked_count = sum(
        1
        for ref in reopened_blocked_refs
        if by_ref.get(ref) is not None and by_ref[ref].state != "blocked"
    )
    remaining_blocked_count = sum(
        1
        for cell in cells
        if cell.member in active_member_ids and cell.state == "blocked"
    )
    event_updates = store.count_events(
        run_id,
        execution_id=execution_id,
        type="cell_update",
    )
    updated_cells_count = int(refresh_stats.get("preprocess_updated_cells_count", 0)) + event_updates
    return {
        "new_members_count": int(refresh_stats.get("new_members_count", 0)),
        "departed_members_count": int(refresh_stats.get("departed_members_count", 0)),
        "retried_blocked_count": int(refresh_stats.get("retried_blocked_count", 0)),
        "resolved_blocked_count": resolved_blocked_count,
        "remaining_blocked_count": remaining_blocked_count,
        "updated_cells_count": updated_cells_count,
    }


async def _publish_event(run_id: str, event: dict[str, Any]) -> None:
    if runner_mod.runner is not None:
        await runner_mod.runner.publish(run_id, event)


class _SpineEventPublisher:
    """Serialize spine event publication to preserve emit order deterministically."""

    def __init__(self, run_id: str) -> None:
        self._run_id = run_id
        self._queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        self._closed = False
        self._drain_task = asyncio.create_task(self._drain())

    def emit(self, event: dict[str, Any]) -> None:
        if self._closed:
            raise RuntimeError("Spine event publisher is already closed.")
        self._queue.put_nowait(event)

    async def aclose(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._queue.put_nowait(None)
        await self._drain_task

    async def _drain(self) -> None:
        while True:
            event = await self._queue.get()
            if event is None:
                break
            await _publish_event(self._run_id, event)


async def _fail_run(
    run_id: str,
    run_dir: Path,
    message: str,
    *,
    execution_id: str | None = None,
) -> None:
    if runner_mod.runner is not None:
        if execution_id:
            # Temporary behavior: emit an execution-tagged terminal error from
            # the route layer until runner.fail() accepts execution_id.
            await runner_mod.runner.publish(
                run_id,
                {"type": "error", "executionId": execution_id, "message": message},
            )
            _write_run_status(run_dir, "error", detail=message)
            return
        await runner_mod.runner.fail(run_id, message)
    else:
        _write_run_status(run_dir, "error", detail=message)


async def _run_spine(
    run_id: str,
    run_dir: Path,
    audit_id: str,
    database_id: str | None,
    filters: dict[str, str],
    workbook_path: Path,
    execution_id: str | None = None,
    user_id: str | None = None,
) -> None:
    store = Store(runtime_role="api_app")
    publisher = _SpineEventPublisher(run_id)
    orchestrator_store = store.with_runtime_role("orchestrator_runtime")
    try:
        def _safe_transition_execution(
            status: str,
            *,
            summary_json: dict[str, Any] | None = None,
        ) -> None:
            if not execution_id:
                return
            try:
                store.update_execution_status(
                    execution_id,
                    status,
                    summary_json=summary_json,
                )
            except Exception:
                logger.exception(
                    "Failed to mark execution %s as %s for run %s",
                    execution_id,
                    status,
                    run_id,
                )

        refresh_filters = {str(k): str(v) for k, v in (filters or {}).items()}
        database_ids = [database_id] if database_id else []
        existing_run = store.get_run(run_id)
        if existing_run is None:
            store.create_run(Run(
                id=run_id,
                audit_id=audit_id,
                user_id=user_id,
                status="in_progress",
                database_ids=database_ids,
                filters=refresh_filters,  # dataclass type is looser than runtime shape.
            ))
        else:
            store.update_run(
                run_id,
                audit_id=audit_id,
                database_ids=database_ids,
                filters=refresh_filters,
                status="in_progress",
                started_at=datetime.now(timezone.utc).isoformat(),
                ended_at=None,
            )

        if execution_id:
            store.create_execution(
                RunExecution(id=execution_id, run_id=run_id, status="queued")
            )
            store.update_execution_status(execution_id, "running")

        def _with_execution(event: dict[str, Any]) -> dict[str, Any]:
            if not execution_id:
                return event
            enriched = dict(event)
            enriched["executionId"] = execution_id
            return enriched

        async def _emit_now(event: dict[str, Any]) -> None:
            await _publish_event(run_id, _with_execution(event))

        # Emit a heartbeat activity event up front so the front-end's empty
        # state clears and the activity panel shows progress. Everything below
        # — ensure_mapping in particular — can take many seconds (an LLM call
        # for audits not yet mapped); without an early event the user sits on
        # the "Workbook will appear here once available" placeholder with no
        # signal that anything is happening.
        await _emit_now({"type": "activity", "headline": "Preparing the audit."})

        audit = _read_json(AUDITS_DIR / audit_id / "spec.json")
        if audit is None:
            raise ValueError(f"audit spec missing: {AUDITS_DIR / audit_id / 'spec.json'}")
        # The frontend deliberately omits the database in real mode and expects
        # the backend to default-select one (HomeScreen.svelte::defaultDbChips).
        # Per the storage / mapping contract, the audit's database binding is
        # declared in mapping.json::databases (mapping.schema.json §databases).
        # Fall back to that first; if the audit has no mapping yet, look for a
        # seed-time binding hint in spec.json::databases. If neither resolves
        # we surface a clearer error than the legacy 500.
        # The requested binding: the user's explicit pick, else the audit's
        # FULL declared set — one run may span several databases (doc 3
        # §multi-DB); the mapping is one file across all of them.
        if database_id:
            requested_ids = [database_id]
        else:
            requested_ids = _audit_default_databases(audit_id, audit)
            if not requested_ids:
                raise ValueError(
                    f"Audit '{audit_id}' has no database binding to default to. "
                    "Either pick a database in the UI or declare one in "
                    f"var/audits/{audit_id}/mapping.json::databases."
                )
        # ensure_mapping is fast when the mapping is cached but takes an LLM
        # call when it isn't (an audit running for the first time against its
        # databases). Tell the user which case we're in so they understand why
        # the wait is longer the very first time.
        mapping_cached = (AUDITS_DIR / audit_id / "mapping.json").exists()
        if mapping_cached:
            await _emit_now({"type": "activity", "headline": "Loading the audit↔database mapping."})
        else:
            await _emit_now({"type": "activity", "headline": "Building the audit↔database mapping for the first time (this can take a minute)."})
        mapping_json = await mapping_phase.ensure_mapping(audit_id, requested_ids)
        if mapping_json is None:
            raise ValueError(
                f"Cannot bind audit '{audit_id}' to database(s) {requested_ids}: no mapping is available."
            )
        mapping_doc = json.loads(mapping_json)
        executable = mapping_doc.get("executable")
        if not isinstance(executable, dict):
            raise ValueError("mapping.json is missing executable")
        # The mapping's database list is the authoritative binding (a cached
        # mapping may span more databases than the request named); every bound
        # database must have its SQLite present.
        bound_ids = [str(d) for d in (mapping_doc.get("databases") or requested_ids)]
        database_paths: dict[str, Path] = {}
        for bound_id in bound_ids:
            db_path = (DATABASES_DIR / bound_id / "database.sqlite").resolve()
            if not db_path.is_file():
                raise ValueError(
                    f"Database '{bound_id}' is bound by the mapping but no SQLite file was found at {db_path}."
                )
            database_paths[bound_id] = db_path
        if bound_ids != database_ids:
            # Keep the run record's database_ids in sync with the binding.
            store.update_run(run_id, database_ids=bound_ids)
        # Runtime filters compose into the cohort SELECT, which runs on the
        # cohort's own database — only bindings on that database can apply.
        cohort_db = str((executable.get("cohort") or {}).get("database") or bound_ids[0])
        cohort_where, cohort_params = _resolve_runtime_filter_predicates(
            filters,
            mapping_doc,
            database_id=cohort_db,
            cohort_from=str(executable.get("cohort", {}).get("from") or ""),
        )
        await _emit_now({"type": "activity", "headline": "Resolving the cohort."})
        cohort = _resolve_cohort(
            executable,
            database_paths,
            runtime_where=cohort_where,
            runtime_params=cohort_params,
        )
        if not cohort:
            raise ValueError("No cohort members matched this run.")

        # Build the initial result.xlsx from spec + cohort size BEFORE the
        # workbook_created emit. The frontend's `applyCells` drops writes to
        # rows that don't exist in `data`, so the emit must ship a sheet with
        # row 1 (headers) + N data rows pre-allocated — otherwise cell_update
        # events fire into a workbook that has nowhere to put them. The
        # workbook is regenerated for every run from spec.json; the storage
        # contract pins var/audits/<id>/workbook.xlsx as "present iff
        # uploaded" — for spec-only audits we never materialise that file,
        # only this per-run result.xlsx.
        if not workbook_path.exists():
            build_initial_workbook(audit, len(cohort), workbook_path)
        sheets = read_workbook_sheets(workbook_path)
        await _emit_now({
            "type": "workbook_created",
            "label": "result.xlsx",
            "sheets": sheets,
            "cellMetadata": {},
        })
        is_refresh = existing_run is not None and execution_id is not None
        refresh_stats: dict[str, Any] | None = None
        member_row_index = {
            format_member_id(member): idx
            for idx, member in enumerate(cohort)
        }
        active_member_ids = set(member_row_index)
        if is_refresh:
            refresh_stats = _prepare_refresh_delta(
                store,
                run_id=run_id,
                execution_id=execution_id,
                executable=executable,
                cohort=cohort,
            )
            member_row_index = dict(refresh_stats["member_row_index"])
            active_member_ids = set(refresh_stats["active_member_ids"])
        else:
            _sync_initial_run_members(
                store,
                run_id=run_id,
                cohort=cohort,
                member_row_index=member_row_index,
            )
        anchor = next(iter(executable.get("identity_keys") or []), None)
        cohort_tables: dict[str, list[str]] = {}
        for bound_id in bound_ids:
            cohort_tables.update(_resolve_cohort_tables(bound_id, anchor))
        agent_client = runner_mod.runner.agent_client() if runner_mod.runner is not None else None
        if agent_client is None:
            async def tier_agent_unavailable(_run_store) -> None:
                raise RuntimeError(
                    "Tier 3 agent execution is unavailable: runner does not expose an agent client."
                )
            tier_agent = tier_agent_unavailable
        else:
            tier_agent = make_tier_agent(
                run_dir=run_dir,
                session_directory=str(run_dir),
                client=agent_client,
            )

        deferred_done_event: dict[str, Any] | None = None

        def emit(event: dict[str, Any]) -> None:
            nonlocal deferred_done_event
            if event.get("type") == "done":
                deferred_done_event = dict(event)
                return
            publisher.emit(_with_execution(event))

        await run_engine.orchestrate_run(
            orchestrator_store,
            run_id,
            executable,
            cohort,
            tier_direct=try_direct,
            tier_llm=make_tier_llm(),
            tier_agent=tier_agent,
            emit=emit,
            database_paths=database_paths,
            audit=audit,
            anchor=anchor,
            cohort_tables=cohort_tables,
            execution_id=execution_id,
            prepare_pending_grid=not is_refresh,
            member_rows=member_row_index,
            active_member_ids=active_member_ids,
        )
        await publisher.aclose()
        run = store.get_run(run_id)
        final_status = run.status if run is not None else None
        refresh_summary = _build_refresh_summary(
            store,
            run_id=run_id,
            execution_id=execution_id,
            refresh_stats=refresh_stats,
        )
        if refresh_summary:
            await _emit_now({
                "type": "refresh_summary",
                "summary": refresh_summary,
            })
        done_event = deferred_done_event or {"type": "done"}
        if refresh_summary:
            done_event = {**done_event, "summary": refresh_summary}
        await _emit_now(done_event)
        _write_run_status(run_dir, "completed", run_status=final_status)
        _safe_transition_execution(
            "completed",
            summary_json={"run_status": final_status, **refresh_summary},
        )
    except asyncio.CancelledError:
        _write_run_status(run_dir, "stopped", detail="Stopped by user.")
        error_event = {"type": "error", "message": "Run stopped by user."}
        if execution_id:
            error_event["executionId"] = execution_id
        publisher.emit(error_event)
        await publisher.aclose()
        _safe_transition_execution("stopped")
        raise
    except Exception as exc:
        logger.exception("Run %s failed in spine path", run_id)
        await publisher.aclose()
        _safe_transition_execution(
            "error",
            summary_json={"message": str(exc)},
        )
        await _fail_run(
            run_id,
            run_dir,
            f"Run failed: {exc}",
            execution_id=execution_id,
        )
    finally:
        await publisher.aclose()
        try:
            store.update_run(run_id, ended_at=datetime.now(timezone.utc).isoformat())
        except Exception:
            pass
        orchestrator_store.close()
        store.close()
        _SPINE_TASKS.pop(run_id, None)


def _start_spine_run(
    run_id: str,
    run_dir: Path,
    audit_id: str,
    database_id: str | None,
    filters: dict[str, str],
    workbook_path: Path,
    execution_id: str | None = None,
    user_id: str | None = None,
) -> None:
    if runner_mod.runner is None:
        raise HTTPException(status_code=503, detail="Run worker is not ready.")
    runner_mod.runner.reserve(run_id, run_dir)
    _SPINE_TASKS[run_id] = asyncio.create_task(_run_spine(
        run_id,
        run_dir,
        audit_id,
        database_id,
        filters,
        workbook_path,
        execution_id=execution_id,
        user_id=user_id,
    ))


def _require_run_edit_cells_access(user: dict[str, Any] | None, run: Run) -> None:
    if not authz.has_permission(user, "run.edit_cells"):
        raise HTTPException(status_code=403, detail="Missing permission: run.edit_cells")
    if authz.is_admin(user):
        return
    if run.user_id is None or run.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Run ownership required to edit cells.")


def _build_clinician_cell_updates(cell, patch: RunCellEditRequest) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    if patch.review_state is not None:
        if patch.review_state != "reviewed":
            raise HTTPException(status_code=422, detail="reviewState can only be set to 'reviewed'.")
        if cell.review_state not in (None, "not_reviewed", "reviewed"):
            raise HTTPException(status_code=422, detail="Invalid existing reviewState on target cell.")
        updates["review_state"] = "reviewed"
    if patch.corrected is not None:
        updates["corrected"] = patch.corrected
    if patch.value is not None:
        corrected_target = patch.corrected if patch.corrected is not None else cell.corrected
        if corrected_target is not True:
            raise HTTPException(
                status_code=422,
                detail="value edits require corrected=true for clinician correction.",
            )
        updates["value"] = patch.value
    if not updates:
        raise HTTPException(status_code=400, detail="No editable fields provided.")
    return updates


@router.post("/api/runs", response_model=RunCreateResponse, status_code=200)
async def create_run(request: Request):
    content_type = request.headers.get("content-type", "")
    filters: dict[str, str] = {}
    database_id: str | None = None
    request_text: str | None = None

    run_id = run_engine.new_run_id()
    run_dir = RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    workbook_path = run_dir / "result.xlsx"

    if "application/json" in content_type:
        body = await request.json()
        req = RunCreateFromAuditRequest.model_validate(body)
        filters = req.filters or {}
        database_id = req.database
        # No template copy here — _run_spine builds result.xlsx from
        # spec.json + cohort size once the cohort is known. The storage
        # contract (§3) makes var/audits/<id>/workbook.xlsx optional: it's
        # only present when the audit was uploaded as a workbook.
        audit_id = req.audit_id
        request_text = req.prompt

    elif "multipart/form-data" in content_type:
        form = await request.form()
        template_file = form.get("template")
        if template_file is None or not getattr(template_file, "filename", None):
            raise HTTPException(status_code=400, detail="Template file is required.")
        ext = Path(template_file.filename).suffix.lower()
        if ext not in (".xlsx", ".xlsm"):
            raise HTTPException(status_code=415, detail="Only .xlsx and .xlsm files are supported.")
        raw_filters = form.get("filters")
        if raw_filters:
            try:
                parsed = json.loads(raw_filters)
                if isinstance(parsed, dict):
                    filters = {str(k): str(v) for k, v in parsed.items()}
            except json.JSONDecodeError:
                pass
        db_field = form.get("database")
        database_id = str(db_field) if db_field else None
        try:
            workbook_path.write_bytes(await template_file.read())
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save template: {e}")
        audit_id = "custom"
        prompt_field = form.get("prompt")
        request_text = str(prompt_field) if prompt_field else None

    else:
        raise HTTPException(status_code=415, detail="Unsupported content type. Use application/json or multipart/form-data.")

    user_id = current_user_id(request)
    _start_spine_run(
        run_id,
        run_dir,
        audit_id,
        database_id,
        filters,
        workbook_path,
        user_id=user_id,
    )

    # Attribute the run to the authenticated user who started it (doc 7
    # §Attribution); this is the per-user history "own audits" is read from.
    if user_id:
        auth_store.record_run(
            run_id, user_id, audit_id, request_text, filters,
            datetime.now(timezone.utc).isoformat(),
        )

    messages: list[TextMessage | ChipMessage] = [
        TextMessage(content="Audit started — the agent is working…"),
    ]
    return RunCreateResponse(run_id=run_id, messages=messages)


@router.get("/api/runs/{run_id}/stream")
async def stream_run(run_id: str):
    if runner_mod.runner is None:
        raise HTTPException(status_code=503, detail="Run worker is not ready.")

    async def event_source():
        async for event in runner_mod.runner.stream_events(run_id):
            yield _encode_sse_data_message(event)

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@router.post("/api/runs/{run_id}/stop")
async def stop_run(run_id: str):
    if runner_mod.runner is None:
        raise HTTPException(status_code=503, detail="Run worker is not ready.")
    stopped_by_runner = await runner_mod.runner.stop(run_id)
    task = _SPINE_TASKS.get(run_id)
    cancelled_task = False
    if task is not None and not task.done():
        task.cancel()
        cancelled_task = True
        try:
            await asyncio.wait_for(task, timeout=5.0)
        except asyncio.CancelledError:
            pass
        except asyncio.TimeoutError:
            logger.warning("Timed out waiting for spine task %s to stop", run_id)
    if not stopped_by_runner and not cancelled_task:
        raise HTTPException(status_code=404, detail="Run not found or already finished.")
    return {"status": "stopped"}


@router.post("/api/runs/{run_id}/refresh", response_model=RunRefreshResponse, status_code=200)
async def refresh_run(run_id: str):
    lock = _refresh_start_lock(run_id)
    async with lock:
        run_dir = RUNS_DIR / run_id
        if not run_dir.exists():
            _raise_refresh_error(404, "RUN_NOT_FOUND", f"Run {run_id!r} was not found.")
        if _is_execution_active(run_id):
            _raise_refresh_error(409, "RUN_EXECUTION_ACTIVE", "Run execution is already active.")

        status = _read_surface_run_status(run_dir)
        if status not in _REFRESHABLE_RUN_STATUSES:
            _raise_refresh_error(
                409,
                "RUN_NOT_REFRESHABLE",
                f"Run status {status!r} does not allow refresh.",
            )

        store = Store()
        try:
            run = store.get_run(run_id)
            if run is None:
                _raise_refresh_error(404, "RUN_NOT_FOUND", f"Run {run_id!r} was not found.")

            audit_id = str(run.audit_id or "").strip()
            if not audit_id or audit_id == "custom":
                _raise_refresh_error(
                    409,
                    "RUN_NOT_REFRESHABLE",
                    "Run cannot be refreshed because it has no refreshable source audit.",
                )
            database_ids = run.database_ids if isinstance(run.database_ids, list) else []
            database_id = str(database_ids[0]).strip() if database_ids else None
            if not database_id:
                _raise_refresh_error(
                    409,
                    "RUN_NOT_REFRESHABLE",
                    "Run cannot be refreshed because no source database is recorded.",
                )
            filters = run.filters if isinstance(run.filters, dict) else {}
            refresh_filters = {str(k): str(v) for k, v in filters.items()}
        finally:
            store.close()

        workbook_path = run_dir / "result.xlsx"
        if not workbook_path.exists():
            try:
                workbook_source = _resolve_audit_excel(audit_id)
            except HTTPException as exc:
                detail = exc.detail
                message = detail.get("message") if isinstance(detail, dict) else str(detail)
                _raise_refresh_error(
                    409,
                    "RUN_NOT_REFRESHABLE",
                    "Run cannot be refreshed because neither result workbook nor source audit file "
                    f"is available: {message}",
                )
            shutil.copy2(workbook_source, workbook_path)

        execution_id = _new_execution_id()
        _start_spine_run(
            run_id,
            run_dir,
            audit_id,
            database_id,
            refresh_filters,
            workbook_path,
            execution_id=execution_id,
        )
        return RunRefreshResponse(runId=run_id, executionId=execution_id, status="started")

@router.patch("/api/runs/{run_id}/cells/{ref:path}", response_model=RunCellEditResponse)
async def edit_run_cell(run_id: str, ref: str, body: RunCellEditRequest, request: Request):
    user = current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    store = Store(runtime_role="api_app")
    clinician_store = store.with_runtime_role("clinician_editor_runtime")
    try:
        run = store.get_run(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found.")
        _require_run_edit_cells_access(user, run)
        cell = store.get_cell(run_id, ref)
        if cell is None:
            raise HTTPException(status_code=404, detail="Cell not found.")
        if cell.kind != "interpret":
            raise HTTPException(
                status_code=422,
                detail="Only interpret cells are editable via clinician review/correction.",
            )

        updates = _build_clinician_cell_updates(cell, body)
        try:
            updated = clinician_store.update_cell(run_id, ref, **updates)
        except RuntimePermissionDenied as exc:
            logger.warning(
                "permission denied while editing run cell",
                extra={
                    "run_id": run_id,
                    "ref": ref,
                    "user_id": user.get("id"),
                    "username": user.get("username"),
                    "updated_fields": sorted(updates.keys()),
                    "runtime_role": clinician_store.runtime_role,
                    "permission_role": exc.role,
                    "permission_table": exc.table,
                    "permission_action": exc.action,
                    "permission_columns": list(exc.columns) if exc.columns is not None else None,
                },
            )
            raise HTTPException(status_code=403, detail="Permission denied.") from None
        try:
            clinician_store.append_event(
                Event(
                    run_id=run_id,
                    type="verification",
                    payload={
                        "ref": ref,
                        "updated_fields": sorted(updates.keys()),
                        "user_id": user["id"],
                        "username": user.get("username"),
                    },
                )
            )
        except RuntimePermissionDenied as exc:
            logger.warning(
                "permission denied while recording clinician verification event",
                extra={
                    "run_id": run_id,
                    "ref": ref,
                    "user_id": user.get("id"),
                    "username": user.get("username"),
                    "updated_fields": sorted(updates.keys()),
                    "runtime_role": clinician_store.runtime_role,
                    "permission_role": exc.role,
                    "permission_table": exc.table,
                    "permission_action": exc.action,
                    "permission_columns": list(exc.columns) if exc.columns is not None else None,
                },
            )
        return RunCellEditResponse(
            run_id=run_id,
            ref=ref,
            review_state=updated.review_state,
            corrected=updated.corrected,
            value=updated.value,
        )
    finally:
        clinician_store.close()
        store.close()


@router.get("/api/runs/{run_id}", response_model=RunStateResponse)
async def get_run(run_id: str):
    run_dir = RUNS_DIR / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="Run not found.")

    status = _read_surface_run_status(run_dir)

    messages: list[TextMessage | ChipMessage] = [
        TextMessage(content=f"Run {run_id} is {status}."),
    ]
    if status == "completed":
        messages.append(
            ChipMessage(
                workbook_url=f"/api/runs/{run_id}/workbook",
                download_url=f"/api/runs/{run_id}/download",
            )
        )

    return RunStateResponse(run_id=run_id, status=status, messages=messages)
