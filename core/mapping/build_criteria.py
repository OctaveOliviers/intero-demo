"""Phase 2 add-on: select + bind the audit's inclusion-criteria surface at mapping.

Mapping is where audit concepts are linked to real `database -> table.column`s, so
it is also where we decide **what the audit can be filtered against**. This module
builds the `criteria_bindings` (+ `not_expressible`) blocks of `mapping.json`
(mapping-artifact-redesign.md §3.3, §5; A6.1).

SELECTION-ONLY — one LLM call, no profiling. The filterable surface (a column's
type, values, range) is a property of the *database* and was already computed once,
read-only, at DB indexing (`core/indexing/profile.py`, folded into `model.json`).
We do **not** re-profile here: a binding references its column by
`"<db> -> <table>.<column>"`, and the renderer / run-time resolver (B6) joins the
authoritative type/values from `model.json` at consumption time.

How it is built (mapping-artifact-redesign.md §5, "two levels"):
  - Level 1 (deterministic, at DB indexing): `model.json` already proposes the
    candidate columns — the filterable surface ("what *can* be filtered here").
  - Level 2 (this module, one LLM call, at mapping): the LLM **selects** which
    dimensions are relevant inclusion criteria for THIS audit, drawing on BOTH
    (a) the audit's own `inclusion_criteria` / fields (`spec.json`) AND (b) the
    databases' filterable columns reachable by join (`model.json`), and links
    each to the cohort identity — `source`, `type`, `join_path` back to the anchor,
    `grain_rule` (patient grain, never a count-inflating join), and `from`
    provenance (`audit_field` / `db_column` / `audit_field+db_column`). A concept
    the bound database can satisfy only from free-text goes to `not_expressible`
    (structured-only; free-text cohort filtering is deferred, P1).

NO DEFAULTS — those are user-set state and live in `spec.json` (§6); the LLM never
picks a default value. The assembled blocks are validated against the S0 mapping
schema (`mapping.schema.json`) before they are returned.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from core.clients import llm
from core.indexing.profile import validate_against_schema
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)

_SCHEMA_FILE = "mapping.schema.json"
_MAX_BUILD_ATTEMPTS = 3

_FILTER_TYPES = {"category", "number", "date"}
_FROM_VALUES = {"audit_field", "db_column", "audit_field+db_column"}

# "<db> -> <table>.<column>" — the canonical source reference used everywhere in
# mapping.json. Parsed so we can check a binding cites a column that really exists.
_SOURCE_RE = re.compile(r"^\s*(?P<db>[^>]+?)\s*->\s*(?P<table>[^.]+?)\.(?P<column>.+?)\s*$")


class _CriteriaSelectionOutput(BaseModel):
    """Typed contract for criteria selection during mapping (A6.1)."""

    model_config = ConfigDict(extra="ignore")

    criteria_bindings: Any = Field(default_factory=list)
    not_expressible: Any = Field(default_factory=list)


_PROMPT = """\
You SELECT the inclusion criteria a clinical audit can filter its cohort on, and
bind each to a real database column. You are given the audit specification
(spec.json — its suggested `inclusion_criteria` and its `fields`) and, for each
source database, its model (model.json — tables and columns, each column marked
whether it is filterable and how). Produce ONLY a single JSON object — no preamble,
no markdown fences, no commentary.

Your job is JUDGMENT — relevance and linkage — NOT profiling. You do NOT decide a
column's type/values/range; those are already in model.json and are referenced,
not copied. You MUST NOT invent values or ranges, and you MUST NOT pick any default.

Choose the dimensions a clinician would realistically filter THIS audit's cohort
on, drawing from BOTH sources:
  - the audit's own `inclusion_criteria` and `fields` (spec.json), and
  - the databases' filterable columns reachable from the cohort by join
    (model.json) — including useful DB-only dimensions the audit did not list
    (e.g. an encounter date, a patient birthdate for age).

For EVERY selected dimension, link it to the cohort identity given below.

Output shape:

{
  "criteria_bindings": [
    { "criterion_id": "<audit inclusion_criteria id when it is an audit dimension; else a fresh slug>",
      "label": "<human-readable dimension label>",
      "source": "<db> -> <table>.<column>",
      "type": "category | number | date",
      "join_path": "<how the column reaches the cohort anchor, e.g. 'direct column on the anchor row (no join)' or 'cord_ph_birth_records.baby_patient -> patients.id'>",
      "grain_rule": "<how a value is interpreted at the patient grain, e.g. 'the patient has >=1 matching row'>",
      "from": "audit_field | db_column | audit_field+db_column" }
  ],
  "not_expressible": [
    { "criterion_id": "<slug>", "label": "<label>",
      "source": "<db> -> <table>.<column>",
      "reason": "<why it is not structurally expressible, e.g. 'only in free-text; no structured column'>" }
  ]
}

Rules:
- `source` MUST be a real column that appears in the given model.json, written
  EXACTLY as "<database slug> -> <table>.<column>" with names verbatim.
- `type` MUST match that column's filter type in model.json (category / number /
  date). Never type an identifier, free-text, or reference column.
- `from`: "audit_field+db_column" when the dimension is an audit inclusion
  criterion / field that you matched to a real DB column; "db_column" for a useful
  DB-only dimension the audit did not list; "audit_field" only if it is an audit
  dimension with no backing column (rare — usually it then goes to not_expressible).
- When a binding corresponds to an audit `inclusion_criteria` entry, reuse that
  entry's `id` as `criterion_id`. Otherwise mint a short, descriptive slug.
- `join_path` and `grain_rule` keep the cohort COUNT correct: every criterion means
  "this cohort member has >=1 matching row" (EXISTS/IN over the anchor), never a
  count-inflating join.
- A concept the database can satisfy ONLY from a free-text column goes in
  `not_expressible` (not in criteria_bindings) — structured filtering only for now.
- Do NOT include `values`, `range`, or any default value anywhere.
- Output only the JSON object, starting with `{`.
"""


# --- source references --------------------------------------------------------

def _index_columns(databases: list[tuple[str, dict[str, Any]]]) -> dict[tuple[str, str, str], dict[str, Any]]:
    """Index every (db, table, column) -> its model.json column record, so a
    binding can be checked against the real schema and its filter type read by
    reference (never re-profiled)."""
    index: dict[tuple[str, str, str], dict[str, Any]] = {}
    for db_id, model in databases:
        for table in model.get("tables", []) or []:
            tname = table.get("name")
            for col in table.get("columns", []) or []:
                cname = col.get("name")
                if tname and cname:
                    index[(db_id, tname, cname)] = col
    return index


def _parse_source(source: str) -> tuple[str, str, str] | None:
    m = _SOURCE_RE.match(source or "")
    if not m:
        return None
    return m.group("db").strip(), m.group("table").strip(), m.group("column").strip()


# --- assembly + validation ----------------------------------------------------
def _as_item_list(raw: Any) -> list[Any]:
    """Normalize uncertain top-level containers into a list of candidate items."""
    if isinstance(raw, list):
        return raw
    if isinstance(raw, tuple):
        return list(raw)
    if isinstance(raw, dict):
        return [raw]
    return []


def _clean_binding(
    raw: dict[str, Any], columns: dict[tuple[str, str, str], dict[str, Any]]
) -> dict[str, Any] | None:
    """Coerce one LLM criteria binding into the schema shape; drop it if its source
    column does not exist, it is not filterable, or a required field is missing.
    The `type` is taken from model.json (referenced, authoritative), falling back
    to the LLM's proposal only if the column carries no filter_type."""
    source = str(raw.get("source") or "").strip()
    parsed = _parse_source(source)
    if not parsed:
        return None
    col = columns.get(parsed)
    if col is None or not col.get("filterable"):
        return None  # never bind to a non-existent / non-filterable column

    criterion_id = str(raw.get("criterion_id") or "").strip()
    label = str(raw.get("label") or "").strip()
    join_path = str(raw.get("join_path") or "").strip()
    grain_rule = str(raw.get("grain_rule") or "").strip()
    provenance = str(raw.get("from") or raw.get("from_") or "").strip()
    if not (criterion_id and label and join_path and grain_rule):
        return None
    if provenance not in _FROM_VALUES:
        return None

    # Type comes from model.json (referenced, not re-derived); the LLM's value is
    # only a fallback for the rare column with no filter_type recorded.
    ftype = str(col.get("filter_type") or raw.get("type") or "").strip().lower()
    if ftype not in _FILTER_TYPES:
        return None

    return {
        "criterion_id": criterion_id,
        "label": label,
        "source": f"{parsed[0]} -> {parsed[1]}.{parsed[2]}",
        "type": ftype,
        "join_path": join_path,
        "grain_rule": grain_rule,
        "from": provenance,
    }


def _clean_not_expressible(
    raw: dict[str, Any], columns: dict[tuple[str, str, str], dict[str, Any]]
) -> dict[str, Any] | None:
    source = str(raw.get("source") or "").strip()
    parsed = _parse_source(source)
    if not parsed or parsed not in columns:
        return None
    criterion_id = str(raw.get("criterion_id") or "").strip()
    label = str(raw.get("label") or "").strip()
    reason = str(raw.get("reason") or "").strip()
    if not (criterion_id and label and reason):
        return None
    return {
        "criterion_id": criterion_id,
        "label": label,
        "source": f"{parsed[0]} -> {parsed[1]}.{parsed[2]}",
        "reason": reason,
    }


def assemble_criteria(
    selection: dict[str, Any], databases: list[tuple[str, dict[str, Any]]]
) -> dict[str, Any]:
    """Pure assembly: coerce a raw LLM selection into the validated
    `criteria_bindings` + `not_expressible` blocks, dropping any entry that does not
    resolve to a real, filterable column. Separated from the LLM call so it can be
    driven deterministically (tests, replay)."""
    columns = _index_columns(databases)
    raw_bindings = _as_item_list(selection.get("criteria_bindings"))
    raw_not_expr = _as_item_list(selection.get("not_expressible"))
    bindings = [
        b
        for b in (
            _clean_binding(r, columns)
            for r in raw_bindings
            if isinstance(r, dict)
        )
        if b is not None
    ]
    not_expr = [
        n
        for n in (
            _clean_not_expressible(r, columns)
            for r in raw_not_expr
            if isinstance(r, dict)
        )
        if n is not None
    ]
    out: dict[str, Any] = {"criteria_bindings": bindings}
    if not_expr:
        out["not_expressible"] = not_expr
    return out


def _validate(blocks: dict[str, Any], audit_id: str, database_ids: list[str], identity: dict[str, Any]) -> list[str]:
    """Validate the criteria blocks against the S0 mapping schema by embedding them
    in a minimal-but-valid mapping document (so we use the real contract, not a
    hand-rolled subset)."""
    probe: dict[str, Any] = {
        "schema_version": "1",
        "audit": audit_id,
        "databases": database_ids,
        "description": "criteria-bindings validation probe",
        "identity": identity,
        "regions": [],
        "fields": [],
        "criteria_bindings": blocks.get("criteria_bindings", []),
    }
    if blocks.get("not_expressible"):
        probe["not_expressible"] = blocks["not_expressible"]
    problems = validate_against_schema(probe, _SCHEMA_FILE)
    # Strip problems that belong to the probe scaffold, not our blocks.
    return [p for p in problems if p.startswith("criteria_bindings") or p.startswith("not_expressible")]


async def build_criteria_bindings(
    audit: dict[str, Any],
    databases: list[tuple[str, dict[str, Any]]],
    *,
    identity: dict[str, Any],
) -> dict[str, Any]:
    """Build the validated `criteria_bindings` (+ `not_expressible`) blocks for
    `mapping.json`. ONE LLM call selects the relevant dimensions from `audit` and
    `databases` and links each to `identity`; deterministic code coerces the result
    against the real schema (columns must exist + be filterable; type read from
    model.json). Retries on malformed output; raises `RuntimeError` after
    `_MAX_BUILD_ATTEMPTS`.

    `audit` is the spec.json document, `databases` a list of `(db_id, database_json)`
    pairs, `identity` the mapping's identity block (anchor + join keys).
    """
    audit_id = str(audit.get("audit") or "audit")
    database_ids = [db_id for db_id, _ in databases]
    user_input = json.dumps(
        {
            "audit_id": audit_id,
            "identity": identity,
            "audit": {
                "inclusion_criteria": audit.get("inclusion_criteria", []),
                "fields": audit.get("fields", []),
            },
            "databases": [
                {"database": db_id, "tables": model.get("tables", [])}
                for db_id, model in databases
            ],
        },
        ensure_ascii=False,
        indent=2,
    )

    instructions = _PROMPT
    problems: list[str] = []
    for attempt in range(1, _MAX_BUILD_ATTEMPTS + 1):
        try:
            selection_typed = await llm.respond_typed(
                instructions,
                user_input,
                _CriteriaSelectionOutput,
                max_tokens=8000,
                temperature=0.0,
                stage="mapping",
            )
            selection = selection_typed.model_dump(mode="python", exclude_none=True)
        except llm.LLMRequestError as exc:
            problems = [f"criteria_bindings: {exc}"]
        else:
            blocks = assemble_criteria(selection, databases)
            problems = _validate(blocks, audit_id, database_ids, identity)
            if not problems and not blocks["criteria_bindings"]:
                problems = ["criteria_bindings: no usable bindings were produced"]
            if not problems:
                return blocks
        logger.warning(
            "criteria bindings failed validation (attempt %d/%d): %s",
            attempt, _MAX_BUILD_ATTEMPTS, "; ".join(problems),
        )
        instructions = _PROMPT + _retry_feedback(problems)
    raise RuntimeError(
        f"criteria bindings failed validation after {_MAX_BUILD_ATTEMPTS} attempts: "
        + "; ".join(problems)
    )


def _retry_feedback(problems: list[str]) -> str:
    joined = "\n".join(f"- {p}" for p in problems)
    return (
        "\n\nYOUR PREVIOUS OUTPUT WAS REJECTED for these reasons:\n"
        f"{joined}\n"
        "Produce a corrected JSON object that fixes every issue. Bind only real, "
        "filterable columns from the given model.json. Output only the JSON "
        "object, starting with `{`."
    )
