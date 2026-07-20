"""Ground a plain-language slice into a Dataset's filter criteria.

The derivation engine behind Dataset creation and the add-filter row
(inclusion-criteria-setup.md). It mirrors the column-grounding pattern in
:mod:`core.mapping.build_criteria`: ONE closed-set LLM call proposes
``{table, column, op, value}`` tuples constrained to the databases' **real**
filterable surface, then **deterministic** assembly here is the contract — it binds
only real, filterable columns with real allowed values, drops anything the model
hallucinated, and routes a concept no structured column carries to
``not_available`` (structured-only, v1). A phrase that grounds to nothing is
surfaced as *not available*, **never invented**.

The grounded criteria are then composed into the cohort and proved by a real
read-only ``COUNT`` (:mod:`core.filters.cohort`) before they are saved on the
Dataset — that proof lives with the creation flow, not here, so this module stays
a pure text -> criteria step.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from core.clients import llm
from core.filters.predicates import PredicateError, build_predicate
from core.slug import slugify as _slug
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)

# Grounding is interactive (the user is waiting on "add filter" / "create
# dataset"), so it is bounded tightly: at most two grounding attempts, each a
# single HTTP call with a short timeout — a slow or unreachable model fails fast
# with a clear error instead of stacking LLM_TIMEOUT × retries into minutes.
_MAX_ATTEMPTS = 2
_GROUNDING_TIMEOUT_S = 75.0


class _GroundingOutput(BaseModel):
    """Typed contract for one grounding call (mirrors build_criteria's shape)."""

    model_config = ConfigDict(extra="ignore")

    criteria: Any = Field(default_factory=list)
    not_available: Any = Field(default_factory=list)


_PROMPT = """\
You translate a plain-language description of a patient cohort into concrete
inclusion FILTERS over a set of databases, and bind each filter to a real
database column. You are given the description and, for each database, its model
(model.json — tables and columns, each column marked whether it is filterable and
how, with its allowed category values or numeric/date range). Produce ONLY a
single JSON object — no preamble, no markdown fences, no commentary.

Your job is GROUNDING — map each idea in the description onto a real filterable
column and pick the concrete predicate. You do NOT invent columns or values.

Output shape:

{
  "criteria": [
    { "database": "<database slug>", "table": "<table>", "column": "<column>",
      "op": "= | in | >= | <= | > | < | between",
      "value": <the stored value(s): a string for =, a list for in, a number/date
                for >=/<=/>/</=, a [low, high] pair for between> }
  ],
  "not_available": [
    { "phrase": "<the part of the description that cannot be expressed>",
      "reason": "<why, e.g. 'only in free-text notes; no structured column'>" }
  ]
}

Rules:
- Use ONLY columns marked filterable in the given model.json, written with names
  verbatim. A column that is not filterable, or does not exist, must not appear.
- For a CATEGORY column, `value` MUST be one of that column's real allowed values
  (the stored code, e.g. "type 1 diabetes" -> the stored code "1"), never a word
  you made up. Use `in` with a list for several values.
- For a NUMBER column use a numeric value (or a [low, high] pair with between);
  for a DATE column use ISO-8601 dates.
- A concept that no structured column carries — something written only in
  free-text notes — goes in `not_available` (structured filtering only for now).
  Do NOT force it onto an unrelated column.
- Output only the JSON object, starting with `{`.
"""


def _filterable_surface(model: dict[str, Any]) -> list[dict[str, Any]]:
    """The trimmed prompt surface for one database: only its **filterable** columns,
    and only the fields the model needs to ground (name, filter type, allowed
    values / range / codes, a short description). Tables with no filterable column
    are dropped. This is what keeps the grounding prompt small enough to be
    interactive — it mirrors what `assemble_criteria` will actually accept."""
    tables: list[dict[str, Any]] = []
    for table in model.get("tables", []) or []:
        cols: list[dict[str, Any]] = []
        for col in table.get("columns", []) or []:
            if not col.get("filterable"):
                continue
            entry: dict[str, Any] = {"name": col.get("name")}
            for key in ("filter_type", "values", "range", "codes"):
                if col.get(key) is not None:
                    entry[key] = col[key]
            desc = str(col.get("description") or "").strip()
            if desc:
                entry["description"] = desc
            cols.append(entry)
        if cols:
            tables.append({"name": table.get("name"), "columns": cols})
    return tables


def _index_columns(
    databases: list[tuple[str, dict[str, Any]]],
) -> dict[tuple[str, str, str], dict[str, Any]]:
    """Index every (db, table, column) -> its model.json column record."""
    index: dict[tuple[str, str, str], dict[str, Any]] = {}
    for db_id, model in databases:
        for table in model.get("tables", []) or []:
            tname = table.get("name")
            for col in table.get("columns", []) or []:
                cname = col.get("name")
                if tname and cname:
                    index[(db_id, tname, cname)] = col
    return index


def _allowed_category_values(col: dict[str, Any]) -> set[str]:
    """The real stored values a category column accepts — its enumerated
    ``values`` plus any ``codes`` keys (the stored codes)."""
    allowed = {str(v) for v in (col.get("values") or [])}
    allowed |= {str(k) for k in (col.get("codes") or {})}
    return allowed


def _clean_value(value: Any, col: dict[str, Any], ftype: str, op: str) -> Any | None:
    """Coerce a proposed value to the column's real allowed set; drop the offending
    parts. Returns the cleaned value, or None when nothing survives."""
    if ftype == "category":
        allowed = _allowed_category_values(col)
        if op == "in":
            items = value if isinstance(value, (list, tuple)) else [value]
            kept = [str(v) for v in items if str(v) in allowed]
            return kept or None
        return str(value) if str(value) in allowed else None
    # number / date: the predicate builder is the validator (numeric / shape).
    return value


def _clean_criterion(
    raw: dict[str, Any], columns: dict[tuple[str, str, str], dict[str, Any]]
) -> dict[str, Any] | None:
    """Coerce one proposed filter into a grounded criterion, or drop it.

    Drops anything binding to a non-existent / non-filterable column, an off-list
    category value, or a predicate the deterministic builder rejects.
    """
    db = str(raw.get("database") or "").strip()
    table = str(raw.get("table") or "").strip()
    column = str(raw.get("column") or "").strip()
    col = columns.get((db, table, column))
    if col is None or not col.get("filterable"):
        return None
    ftype = str(col.get("filter_type") or "").strip().lower()
    if ftype not in {"category", "number", "date"}:
        return None
    op = str(raw.get("op") or "").strip().lower()
    value = _clean_value(raw.get("value"), col, ftype, op)
    if value is None:
        return None
    predicate = {"op": op, "value": value}
    # The predicate->SQL builder is the single validator for op/value/type shape:
    # if it cannot compile a read-only clause, the criterion is not grounded.
    try:
        build_predicate({"type": ftype, "predicate": predicate}, "x", bind="c0")
    except PredicateError:
        return None
    return {
        "criterion_id": _slug(column),
        "label": _label_for(col, column),
        "type": ftype,
        "source": f"{db} -> {table}.{column}",
        "predicate": predicate,
    }


def _label_for(col: dict[str, Any], column: str) -> str:
    desc = str(col.get("description") or "").strip()
    if desc:
        # First clause of the description reads as a label; fall back to the name.
        first = desc.split(".")[0].strip()
        if 0 < len(first) <= 60:
            return first
    return column.replace("_", " ").strip().capitalize()


def _clean_not_available(raw: dict[str, Any]) -> dict[str, Any] | None:
    phrase = str(raw.get("phrase") or "").strip()
    reason = str(raw.get("reason") or "").strip()
    if not (phrase and reason):
        return None
    return {"phrase": phrase, "reason": reason}


def assemble_criteria(
    selection: dict[str, Any], databases: list[tuple[str, dict[str, Any]]]
) -> dict[str, Any]:
    """Pure, deterministic assembly: coerce a raw grounding selection into
    ``{criteria, not_available}``, dropping any criterion that does not resolve to
    a real, filterable column with a real value. Separated from the LLM call so it
    can be driven deterministically (tests, replay)."""
    columns = _index_columns(databases)
    raw_criteria = selection.get("criteria")
    raw_criteria = raw_criteria if isinstance(raw_criteria, list) else []
    raw_na = selection.get("not_available")
    raw_na = raw_na if isinstance(raw_na, list) else []

    criteria = [
        c
        for c in (
            _clean_criterion(r, columns) for r in raw_criteria if isinstance(r, dict)
        )
        if c is not None
    ]
    not_available = [
        n
        for n in (_clean_not_available(r) for r in raw_na if isinstance(r, dict))
        if n is not None
    ]
    out: dict[str, Any] = {"criteria": criteria}
    if not_available:
        out["not_available"] = not_available
    return out


async def ground_criteria(
    description: str,
    databases: list[tuple[str, dict[str, Any]]],
) -> dict[str, Any]:
    """Ground a plain-language ``description`` into ``{criteria, not_available}``.

    ONE closed-set LLM call proposes filters against the ``databases`` filterable
    surface; deterministic assembly coerces the result against the real schema.
    Retries on a malformed/empty model reply; raises ``llm.LLMRequestError`` after
    ``_MAX_ATTEMPTS``. ``databases`` is a list of ``(db_id, model_json)`` pairs.
    """
    # Send ONLY the filterable surface, not the whole model.json. The full model
    # for one database can be thousands of lines (every column, identifier,
    # free-text field, description); a local model chews through all of it, making
    # an interactive grounding call take minutes. The prompt only ever uses
    # filterable columns, so the rest is waste that also invites hallucination.
    user_input = json.dumps(
        {
            "description": description,
            "databases": [
                {"database": db_id, "tables": _filterable_surface(model)}
                for db_id, model in databases
            ],
        },
        ensure_ascii=False,
    )
    last_exc: Exception | None = None
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            selection = await llm.respond_typed(
                _PROMPT,
                user_input,
                _GroundingOutput,
                max_tokens=4000,
                temperature=0.0,
                stage="filters",
                timeout=_GROUNDING_TIMEOUT_S,
                max_attempts=1,
            )
        except llm.LLMRequestError as exc:
            last_exc = exc
            logger.warning(
                "grounding call failed (attempt %d/%d): %s", attempt, _MAX_ATTEMPTS, exc
            )
            continue
        return assemble_criteria(
            selection.model_dump(mode="python", exclude_none=True), databases
        )
    raise llm.LLMRequestError(
        f"grounding failed after {_MAX_ATTEMPTS} attempts: {last_exc}"
    )
