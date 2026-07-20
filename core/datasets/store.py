"""The Dataset object: derive, persist, reload — deterministically.

A Dataset's **canonical** state is its grounded ``criteria`` (each a real column
source + a structured ``predicate``) and its ``cohort`` base. Everything else —
each criterion's parameterised ``sql`` / ``params`` / ``display``, the composed
``cohort_sql``, and the cached ``count`` — is **derived** from those by
:func:`rederive`, with no LLM. Deriving is idempotent and ignores any stale cached
values, so reloading a Dataset re-derives an identical SQL + count (resolve once
at definition, consume at every run — inclusion-criteria-setup.md).

Persistence is one JSON file per Dataset at ``var/datasets/<id>/dataset.json``
(storage-layout.md §3), validated against ``dataset.schema.json`` before write.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from core.filters.cohort import compose_cohort, count_cohort, criterion_clauses
from core.contracts import validate_against_schema

_SCHEMA_FILE = "dataset.schema.json"
_DATASET_FILE = "dataset.json"

_OP_SYMBOL = {">=": "≥", "<=": "≤", ">": ">", "<": "<", "=": "="}


class DatasetError(ValueError):
    """A Dataset that cannot be loaded, derived, or validated."""


def display_predicate(label: str, ftype: str, predicate: dict[str, Any]) -> str:
    """A clinician-readable one-liner for a grounded predicate, e.g.
    ``Gestation (weeks) ≥ 39`` / ``Mode of delivery: Forceps, Vacuum``. Mechanical
    and LLM-free, so editing a value re-renders without a model call (the same role
    as the front-end chip's ``predicateDisplay``)."""
    op = str(predicate.get("op") or "").strip().lower()
    value = predicate.get("value")
    if op == "in":
        items = value if isinstance(value, (list, tuple)) else [value]
        return f"{label}: {', '.join(str(v) for v in items)}"
    if op == "between":
        items = list(value) if isinstance(value, (list, tuple)) else [value]
        lo = items[0] if items else ""
        hi = items[1] if len(items) > 1 else ""
        return f"{label} {lo} – {hi}"
    return f"{label} {_OP_SYMBOL.get(op, op)} {value}"


def rederive(
    dataset: dict[str, Any], database_paths: dict[str, Path]
) -> dict[str, Any]:
    """Return a copy of ``dataset`` with all derived fields recomputed.

    Recomputes each criterion's ``sql`` / ``params`` / ``display``, the composed
    ``cohort_sql``, and the read-only ``count`` from the canonical criteria +
    cohort. Stale cached values are discarded, never trusted. ``database_paths``
    maps each database slug the Dataset touches to its SQLite file (the count's
    read-only target). Raises :class:`DatasetError` on a malformed cohort/criterion.
    """
    out = copy.deepcopy(dataset)
    cohort = out.get("cohort")
    if not isinstance(cohort, dict):
        raise DatasetError("dataset is missing its cohort block")
    criteria = out.get("criteria") or []
    if not isinstance(criteria, list):
        raise DatasetError("dataset.criteria must be a list")

    try:
        clauses = criterion_clauses(cohort, criteria)
        for criterion, (sql, params) in zip(criteria, clauses):
            criterion["sql"] = sql
            criterion["params"] = params
            criterion["display"] = display_predicate(
                str(criterion.get("label") or criterion.get("criterion_id") or ""),
                str(criterion.get("type") or ""),
                criterion.get("predicate") or {},
            )
        cohort_sql, _ = compose_cohort(cohort, criteria)
        # The COUNT touches the read-only databases; a missing/unreadable SQLite
        # raises CohortError (a ValueError), mapped here to DatasetError so callers
        # see a clean Dataset failure rather than a raw sqlite error.
        count = count_cohort(database_paths, cohort, criteria)
    except ValueError as exc:
        raise DatasetError(str(exc)) from exc

    out["cohort_sql"] = cohort_sql
    out["count"] = count
    return out


def save_dataset(dataset: dict[str, Any], *, datasets_dir: Path) -> Path:
    """Persist ``dataset`` to ``<datasets_dir>/<id>/dataset.json`` (validated).

    The Dataset must already be derived (carry ``cohort_sql`` + ``count``). Returns
    the written path. Raises :class:`DatasetError` if it has no id or fails schema
    validation — a broken Dataset is never persisted.
    """
    dataset_id = str(dataset.get("id") or "").strip()
    if not dataset_id:
        raise DatasetError("dataset is missing its id")
    # A Dataset is persisted only AFTER its slice is proved: the composed cohort
    # SQL and the read-only count must be present (run `rederive` first). This keeps
    # the "resolve once at definition" invariant — a Dataset on disk always carries
    # the count its run-time consumers read.
    if not dataset.get("cohort_sql") or "count" not in dataset:
        raise DatasetError("dataset must be derived (cohort_sql + count) before saving")
    problems = validate_against_schema(dataset, _SCHEMA_FILE)
    if problems:
        raise DatasetError("dataset failed schema validation: " + "; ".join(problems))

    out_dir = datasets_dir / dataset_id
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / _DATASET_FILE
    path.write_text(
        json.dumps(dataset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return path


def load_dataset(dataset_id: str, *, datasets_dir: Path) -> dict[str, Any]:
    """Read a persisted Dataset by id. Raises :class:`DatasetError` if it is
    missing, not valid JSON, or not a JSON object."""
    path = datasets_dir / dataset_id / _DATASET_FILE
    if not path.exists():
        raise DatasetError(f"dataset not found: {dataset_id}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DatasetError(f"dataset {dataset_id} is invalid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise DatasetError(f"dataset {dataset_id} is not a JSON object")
    return data


def list_summaries(*, datasets_dir: Path) -> list[dict[str, Any]]:
    """Summaries (``id`` / ``name`` / ``databases`` / ``count``) of every listable
    persisted Dataset, ordered by id.

    A broken payload (unreadable, invalid JSON) or a partial/hand-edited file
    without a derived ``count`` is skipped rather than listed — a Dataset without
    its proved count would understate a slice as 0 members. A payload whose
    internal ``id`` disagrees with its directory name is skipped for the same
    reason: the storage key is the identity every grant and route addresses a
    Dataset by (``save_dataset`` keeps them equal), so a summary's ``id`` is
    guaranteed to be the storage key — never the artifact's self-declared id.
    Callers apply their own visibility scoping (grants) on top; the store owns
    only the storage layout and the skip-broken policy.
    """
    if not datasets_dir.is_dir():
        return []
    summaries: list[dict[str, Any]] = []
    for ds_dir in sorted(p for p in datasets_dir.iterdir() if p.is_dir()):
        try:
            dataset = load_dataset(ds_dir.name, datasets_dir=datasets_dir)
        except DatasetError:
            continue
        if "count" not in dataset:
            continue
        if str(dataset.get("id") or ds_dir.name) != ds_dir.name:
            continue
        summaries.append(
            {
                "id": ds_dir.name,
                "name": str(dataset.get("name") or ds_dir.name),
                "databases": list(dataset.get("databases") or []),
                "count": int(dataset.get("count") or 0),
            }
        )
    return summaries
