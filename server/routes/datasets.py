"""The Dataset control plane: list / read / create / edit / delete the saved,
named filters that scope the hospital database to a slice (library-and-sources.md,
inclusion-criteria-setup.md).

The Dataset ENGINE (``core.datasets.store`` + ``core.filters.cohort_base`` +
``core.mapping.ground_default_criteria``) does the work; these routes are a thin
auth + persistence shell over it. Reads need ``dataset.read``, writes need
``dataset.manage``; the middleware already 401s an anonymous ``/api/*`` request,
and each route raises 403 when the authenticated user lacks the permission key —
mirroring ``server/routes/templates.py``.

Every derive (create, value edit, add-filter) ends in a real read-only
``rederive`` + ``save_dataset``: a Dataset only touches disk once its cohort_sql
and count are proved. A value edit is deterministic — NO LLM — so editing a chip
re-derives without a grounding call.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, Response

from core.config import DATABASES_DIR, DATASETS_DIR
from core.datasets import store as dataset_store
from core.datasets.store import DatasetError, load_dataset, rederive, save_dataset
from core.filters.cohort import criterion_clauses
from core.clients.llm import LLMRequestError
from core.filters.cohort_base import (
    CohortBaseError,
    derive_cohort_base,
    partition_criteria,
)
from core.mapping import ground_criteria
from server.auth import grants
from server.models import (
    DatasetCreateRequest,
    DatasetFilterRequest,
    DatasetPatchRequest,
    DatasetSummary,
)
from server.routes._guards import VALID_ID, require, safe_id

router = APIRouter()


def _safe_id(dataset_id: str) -> str:
    """Refuse a non-slug Dataset id with a 404 (the shared traversal guard, with the
    Dataset entity label)."""
    return safe_id(dataset_id, kind="Dataset")


def _safe_slug(slug: str) -> str:
    """Validate a database slug before it is joined into a filesystem path.

    A slug is the OTHER caller-controlled path component (it indexes
    ``var/databases/<slug>/``); like the Dataset id it must be a flat slug so it
    can never traverse out of the database sandbox. Mirrors the agent tool's
    ``_DB_SLUG`` guard. A malformed slug is a 422 (the request body is invalid).
    This is route-SPECIFIC (a 422, not a 404), so it stays here.
    """
    if not VALID_ID.fullmatch(slug or ""):
        raise HTTPException(status_code=422, detail=f"Invalid database id: {slug!r}")
    return slug


def _require(request: Request, permission: str) -> dict[str, Any]:
    """Resolve the caller and enforce a permission key (401 then 403) — the shared
    control-plane gate."""
    return require(request, permission)


def _require_manage(user: dict[str, Any], dataset_id: str) -> None:
    """Owner-OR-manage gate on a write target (#302, ADR-0003 peer model).

    The `dataset.manage` ROLE permission (checked in `_require`) is necessary but
    not sufficient: it would let any clinician edit/delete another clinician's
    Dataset. This second, per-resource gate requires the caller to own it (the
    `manage` self-grant from creation) or hold an active `manage` grant on it.
    Called AFTER the existence (404) check so a missing id never discloses as a
    403. Admin gets NO override — it is a clinical peer (contract §3/§5)."""
    if not grants.can_manage_resource(user, "dataset", dataset_id):
        raise HTTPException(status_code=403, detail="You don't own this resource")


def _database_paths(slugs: list[str]) -> dict[str, Path]:
    """Map each touched database slug to its read-only SQLite (the count target)."""
    return {slug: DATABASES_DIR / slug / "database.sqlite" for slug in slugs}


def _load_model(slug: str) -> dict[str, Any]:
    path = DATABASES_DIR / slug / "model.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"Database not found: {slug}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        raise HTTPException(
            status_code=422, detail=f"Database model is invalid JSON: {slug}"
        )
    if not isinstance(data, dict):
        raise HTTPException(
            status_code=422, detail=f"Database model must be an object: {slug}"
        )
    return data


def _uniquify_criterion_ids(criteria: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Ensure every criterion has a UNIQUE ``criterion_id`` within the Dataset.

    Grounding mints ``criterion_id`` from the column slug, so adding a second
    filter on the same column (e.g. a second ``gestation_weeks``) would collide.
    A duplicate id breaks editing (PATCH finds a criterion by id) and crashes a
    keyed list in the UI, so later collisions are suffixed (``gestation_weeks``,
    ``gestation_weeks_2``). The first occurrence keeps its id; order is preserved.
    """
    seen: set[str] = set()
    for criterion in criteria:
        base = str(criterion.get("criterion_id") or "filter")
        cid = base
        n = 1
        while cid in seen:
            n += 1
            cid = f"{base}_{n}"
        seen.add(cid)
        criterion["criterion_id"] = cid
    return criteria


async def _ground(
    text: str, databases: list[tuple[str, dict[str, Any]]]
) -> dict[str, Any]:
    """Ground a phrase, mapping a grounding-model failure to a clean **502** rather
    than a 500. The model is an upstream dependency (it may be slow, mis-configured,
    or rejecting the request — e.g. a stage pointed at an endpoint that needs a
    different parameter); the caller should see a clear "model unavailable", and the
    UI surfaces the detail so the user can fix the model config."""
    try:
        return await ground_criteria(text, databases)
    except LLMRequestError as exc:
        raise HTTPException(
            status_code=502, detail=f"Grounding model unavailable: {exc}"
        ) from exc


def _na_from_links(pairs: list[tuple[dict[str, Any], str]]) -> list[dict[str, Any]]:
    """Reshape ``partition_criteria``'s ``(criterion, reason)`` pairs into the
    Dataset's ``{phrase, reason}`` not-available rows — honesty, never a predicate."""
    out: list[dict[str, Any]] = []
    for criterion, reason in pairs:
        phrase = str(
            criterion.get("label") or criterion.get("criterion_id") or "filter"
        )
        out.append({"phrase": phrase, "reason": reason})
    return out


def _derive_dropping_broken(dataset: dict[str, Any]) -> dict[str, Any]:
    """``rederive`` the Dataset, routing any criterion the cohort FROM cannot
    resolve (a column on a table not in the cohort base) to ``not_available``
    rather than 500 — a broken cohort is never persisted.

    Each criterion is checked deterministically by composing it ALONE against the
    cohort (``criterion_clauses``, a pure string transform — no DB, no LLM); a
    criterion that cannot compose is dropped to ``not_available``. This decides
    per-criterion validity from the engine directly, never by parsing error prose.
    """
    cohort = dataset.get("cohort") or {}
    kept: list[dict[str, Any]] = []
    dropped: list[dict[str, Any]] = list(dataset.get("not_available") or [])
    for criterion in dataset.get("criteria") or []:
        try:
            criterion_clauses(cohort, [criterion])
        except ValueError as exc:
            dropped.append(
                {
                    "phrase": str(
                        criterion.get("label")
                        or criterion.get("criterion_id")
                        or "filter"
                    ),
                    "reason": str(exc),
                }
            )
        else:
            kept.append(criterion)

    work = dict(dataset)
    work["criteria"] = _uniquify_criterion_ids(kept)
    work["not_available"] = dropped
    paths = _database_paths(list(dataset.get("databases") or []))
    try:
        return rederive(work, paths)
    except DatasetError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/api/datasets", response_model=list[DatasetSummary])
async def list_datasets(request: Request) -> list[DatasetSummary]:
    user = _require(request, "dataset.read")
    # The store owns enumeration (storage layout, skip-broken policy); the route
    # owns visibility. Owner-OR-grant scoping (#302): keep only Datasets the
    # caller owns (active `manage` self-grant) or holds an active read/run/manage
    # grant on. The role permission `dataset.read` above is necessary but not
    # sufficient — the per-resource grant is the second, fail-closed gate
    # (contract §3).
    return [
        DatasetSummary(**summary)
        for summary in dataset_store.list_summaries(datasets_dir=DATASETS_DIR)
        if grants.has_resource_access(user, "dataset", summary["id"])
    ]


@router.get("/api/datasets/{dataset_id}")
async def get_dataset(dataset_id: str, request: Request) -> dict[str, Any]:
    user = _require(request, "dataset.read")
    dataset_id = _safe_id(dataset_id)
    try:
        dataset = load_dataset(dataset_id, datasets_dir=DATASETS_DIR)
    except DatasetError:
        # Genuinely missing/unreadable Dataset → 404 (unchanged).
        raise HTTPException(status_code=404, detail="Dataset not found.")
    # Owner-OR-grant gate (#302) PLUS the §10/§5 share-then-use cascade (#303): the
    # Dataset EXISTS, so a caller is allowed read iff they hold a direct dataset
    # grant OR an active table grant whose pinned dataset_id is this Dataset (the
    # access-only cascade — derived, so a table-grant revoke fail-closes it). A
    # caller with neither gets a fail-closed 403 (not 404 — the resource is real,
    # access denied) and no body leak. Ordered AFTER the 404 so a non-existent id
    # never discloses as a 403 (contract §3, §13). The cascade is READ-ONLY: it is
    # checked here (the read path) only — patch/delete still require owner-or-manage.
    if not (
        grants.has_resource_access(user, "dataset", dataset_id)
        or grants.has_dataset_access_via_table(user, dataset_id)
    ):
        raise HTTPException(status_code=403, detail="You don't have access to this")
    return dataset


@router.post("/api/datasets")
async def create_dataset(
    body: DatasetCreateRequest, request: Request
) -> dict[str, Any]:
    user = _require(request, "dataset.manage")
    slugs = [_safe_slug(s) for s in body.databases]
    if not slugs:
        raise HTTPException(
            status_code=422, detail="At least one database is required."
        )

    databases = [(slug, _load_model(slug)) for slug in slugs]
    try:
        base = derive_cohort_base(body.anchor, databases)
    except CohortBaseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    grounded = await _ground(body.text, databases)
    usable, na_links = partition_criteria(
        grounded.get("criteria") or [], base.linkable, base.anchor_db
    )

    not_available = list(grounded.get("not_available") or [])
    not_available.extend(_na_from_links(na_links))

    dataset: dict[str, Any] = {
        "schema_version": "1",
        "id": f"dataset-{uuid4().hex[:12]}",
        "name": body.name,
        "databases": slugs,
        "cohort": base.cohort_block,
        "criteria": usable,
        "not_available": not_available,
    }
    if body.description is not None:
        dataset["description"] = body.description

    derived = _derive_dropping_broken(dataset)
    try:
        save_dataset(derived, datasets_dir=DATASETS_DIR)
    except DatasetError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    # Ownership IS an active `manage` self-grant (#302, mirroring tables.py): the
    # creator self-grants `manage` on the new Dataset AFTER it persists, so the §5
    # predicate "created_by OR active manage grant" holds without a `created_by`
    # column on the artifact. Only the creator (or a future manage-grant holder)
    # can then read/list/edit it.
    grants.self_grant_manage(
        resource_type="dataset", resource_id=str(derived["id"]), user_id=user["id"]
    )
    return derived


@router.patch("/api/datasets/{dataset_id}")
async def patch_dataset(
    dataset_id: str, body: DatasetPatchRequest, request: Request
) -> dict[str, Any]:
    user = _require(request, "dataset.manage")
    dataset_id = _safe_id(dataset_id)
    try:
        dataset = load_dataset(dataset_id, datasets_dir=DATASETS_DIR)
    except DatasetError:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    _require_manage(user, dataset_id)

    # Rename: a name change touches no criteria, so just update + save (still
    # carries its derived cohort_sql + count, so it re-saves cleanly).
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="Dataset name cannot be empty.")
        dataset["name"] = name
        try:
            save_dataset(dataset, datasets_dir=DATASETS_DIR)
        except DatasetError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return dataset

    if not body.criterion_id:
        raise HTTPException(
            status_code=422,
            detail="Provide `name` to rename, or `criterion_id` + `value` to edit a filter.",
        )
    target = None
    for criterion in dataset.get("criteria") or []:
        if criterion.get("criterion_id") == body.criterion_id:
            target = criterion
            break
    if target is None:
        raise HTTPException(
            status_code=404, detail=f"Criterion not found: {body.criterion_id}"
        )

    # Deterministic re-derive — editing a chip's value never calls the LLM.
    target.setdefault("predicate", {})["value"] = body.value
    # Validate the persisted slugs before they become read-only SQLite paths, so a
    # tampered dataset.json cannot point the count at a file outside the sandbox
    # (symmetry with create/add-filter; the connection is read-only regardless).
    paths = _database_paths([_safe_slug(s) for s in (dataset.get("databases") or [])])
    try:
        derived = rederive(dataset, paths)
        save_dataset(derived, datasets_dir=DATASETS_DIR)
    except DatasetError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return derived


@router.delete("/api/datasets/{dataset_id}", status_code=204)
async def delete_dataset(dataset_id: str, request: Request) -> Response:
    user = _require(request, "dataset.manage")
    dataset_id = _safe_id(dataset_id)
    ds_dir = DATASETS_DIR / dataset_id
    if not ds_dir.is_dir():
        raise HTTPException(status_code=404, detail="Dataset not found.")
    _require_manage(user, dataset_id)
    shutil.rmtree(ds_dir, ignore_errors=True)
    return Response(status_code=204)


@router.delete("/api/datasets/{dataset_id}/criteria/{criterion_id}")
async def remove_dataset_criterion(
    dataset_id: str, criterion_id: str, request: Request
) -> dict[str, Any]:
    """Remove one filter from a Dataset and re-derive (no LLM). Returns the
    re-scoped Dataset so the UI updates its chips, SQL and count in one round-trip."""
    user = _require(request, "dataset.manage")
    dataset_id = _safe_id(dataset_id)
    try:
        dataset = load_dataset(dataset_id, datasets_dir=DATASETS_DIR)
    except DatasetError:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    _require_manage(user, dataset_id)

    criteria = dataset.get("criteria") or []
    kept = [c for c in criteria if c.get("criterion_id") != criterion_id]
    if len(kept) == len(criteria):
        raise HTTPException(
            status_code=404, detail=f"Criterion not found: {criterion_id}"
        )
    dataset["criteria"] = kept
    paths = _database_paths([_safe_slug(s) for s in (dataset.get("databases") or [])])
    try:
        derived = rederive(dataset, paths)
        save_dataset(derived, datasets_dir=DATASETS_DIR)
    except DatasetError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return derived


@router.post("/api/datasets/{dataset_id}/filters")
async def add_dataset_filter(
    dataset_id: str, body: DatasetFilterRequest, request: Request
) -> dict[str, Any]:
    user = _require(request, "dataset.manage")
    dataset_id = _safe_id(dataset_id)
    try:
        dataset = load_dataset(dataset_id, datasets_dir=DATASETS_DIR)
    except DatasetError:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    _require_manage(user, dataset_id)

    slugs = [_safe_slug(s) for s in (dataset.get("databases") or [])]
    databases = [(slug, _load_model(slug)) for slug in slugs]
    # Re-derive linkability from the persisted cohort so a newly grounded criterion
    # on an unlinkable database is routed to not_available, never silently joined.
    try:
        base = derive_cohort_base(_anchor_from_cohort(dataset), databases)
        linkable, anchor_db = base.linkable, base.anchor_db
    except CohortBaseError:
        linkable, anchor_db = (
            set(),
            str((dataset.get("cohort") or {}).get("database") or ""),
        )

    grounded = await _ground(body.text, databases)
    usable, na_links = partition_criteria(
        grounded.get("criteria") or [], linkable, anchor_db
    )

    dataset.setdefault("criteria", []).extend(usable)
    dataset.setdefault("not_available", [])
    dataset["not_available"].extend(grounded.get("not_available") or [])
    dataset["not_available"].extend(_na_from_links(na_links))

    derived = _derive_dropping_broken(dataset)
    try:
        save_dataset(derived, datasets_dir=DATASETS_DIR)
    except DatasetError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return derived


def _anchor_from_cohort(dataset: dict[str, Any]) -> str:
    """Reconstruct the ``"<db> -> <table>.<column>"`` anchor from a persisted
    cohort block, so the add-filter row can re-derive linkability."""
    cohort = dataset.get("cohort") or {}
    db = str(cohort.get("database") or "")
    from_clause = str(cohort.get("from") or "")
    table = from_clause.split()[0] if from_clause else ""
    keys = cohort.get("identity_keys") or []
    column = str(keys[0]) if keys else ""
    return f"{db} -> {table}.{column}"
