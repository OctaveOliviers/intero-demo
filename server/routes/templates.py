import shutil
import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from core import indexing
from core.catalog import get_audit_by_id, load_audit_registry
from core.config import TEMPLATES_DIR, WORKBOOK_NAME
from core.contracts import validate_against_schema
from server.auth import grants
from server.auth import permissions as authz
from server.auth.deps import current_user
from server.models import (
    TemplateDetailResponse,
    TemplateInfo,
    TemplateMappingPatchRequest,
    TemplateMappingPatchResponse,
    TemplateRenameRequest,
    TemplateUploadResponse,
)

router = APIRouter()


def _require(request: Request, permission: str) -> dict[str, Any]:
    """Resolve the caller and enforce a permission key (401 then 403).

    The auth middleware already 401s an anonymous ``/api/*`` request; this
    defensive check mirrors datasets.py / tables.py so the guard holds even when a
    route is exercised directly (tests) and not behind the gate.
    """
    user = current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not authz.has_permission(user, permission):
        raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")
    return user


def _require_manage(user: dict[str, Any], template_id: str) -> None:
    """Owner-OR-manage gate on a template write target (#302, ADR-0003 peer model).

    The ``template.manage`` ROLE permission is necessary but not sufficient — it
    would let any clinician edit/delete/rename another clinician's template. This
    second, per-resource gate requires the caller to own it (the ``manage``
    self-grant from upload/backfill) or hold an active ``manage`` grant. Called
    AFTER the existence (404) check so a missing id never discloses as a 403.
    Admin gets NO override — it is a clinical peer (contract §3/§5)."""
    if not grants.can_manage_resource(user, "template", template_id):
        raise HTTPException(status_code=403, detail="You don't own this resource")


def _load_json_file(path: Path, *, label: str) -> dict:
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"{label} not found.")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail=f"{label} is invalid JSON.")
    if not isinstance(data, dict):
        raise HTTPException(status_code=422, detail=f"{label} must be a JSON object.")
    return data


def _template_info_from_catalog_entry(template: dict) -> TemplateInfo:
    """Centralized metadata mapping for template list/detail payload consistency."""
    return TemplateInfo(
        id=template["id"],
        name=template["name"],
        description=template["description"],
        excel_path=template["excel_path"],
        icon=template.get("icon", "📄"),
        database=template.get("database") or None,
        level=template.get("level") or "Local",
        read_only=bool(template.get("read_only") or False),
        stale=bool(template.get("stale") or False),
        version=template.get("version"),
        scheme=template.get("scheme"),
        last_pulled=template.get("last_pulled"),
        provenance_ref=template.get("provenance_ref"),
        provenance_url=template.get("provenance_url"),
        status=template.get("status", "ready"),
        deadline=template.get("deadline"),
    )


@router.get("/api/templates", response_model=list[TemplateInfo])
async def list_templates(request: Request):
    user = _require(request, "template.read")
    # Owner-OR-grant scoping (#302, peer model §13): list ONLY templates the caller
    # owns (active `manage` self-grant — the demo admin owns the seeded cord-ph/npda
    # via the #301 backfill) or holds an active read/run/manage grant on. An
    # ungranted template is simply absent from the library — for admin and clinician
    # alike. Running an audit is UNAFFECTED: the run engine reads spec.json directly,
    # never via this gated route (demo-safety invariant).
    return [
        _template_info_from_catalog_entry(template)
        for template in load_audit_registry()
        if grants.has_resource_access(user, "template", template["id"])
    ]


@router.get("/api/templates/{template_id}", response_model=TemplateDetailResponse)
async def get_template_detail(template_id: str, request: Request):
    user = _require(request, "template.read")
    if template_id.startswith("_"):
        raise HTTPException(status_code=404, detail="Template not found.")
    template = get_audit_by_id(template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found.")
    # Owner-OR-grant gate (#302): the template EXISTS, so a non-grantee gets a
    # fail-closed 403 with no body leak — ordered AFTER the 404 so a non-existent id
    # never discloses as a 403 (contract §3, §13).
    if not grants.has_resource_access(user, "template", template_id):
        raise HTTPException(status_code=403, detail="You don't have access to this")

    template_dir = TEMPLATES_DIR / template_id
    spec = _load_json_file(template_dir / "spec.json", label="Template spec")
    mapping_path = template_dir / "mapping.json"
    mapping = (
        _load_json_file(mapping_path, label="Template mapping")
        if mapping_path.exists()
        else None
    )
    base = _template_info_from_catalog_entry(template)

    return TemplateDetailResponse(
        id=base.id,
        name=base.name,
        description=base.description,
        excel_path=base.excel_path,
        status=base.status,
        level=base.level,
        read_only=base.read_only,
        stale=base.stale,
        version=base.version,
        scheme=base.scheme,
        last_pulled=base.last_pulled,
        provenance_ref=base.provenance_ref,
        provenance_url=base.provenance_url,
        deadline=base.deadline,
        spec=spec,
        mapping=mapping,
    )


@router.patch(
    "/api/templates/{template_id}/mapping", response_model=TemplateMappingPatchResponse
)
async def patch_template_mapping(
    template_id: str, body: TemplateMappingPatchRequest, request: Request
):
    """Persist an edited `fixed_criteria` array to the template's mapping.json.

    Doc 4 §The fixed inclusion criteria / doc 9: the template-detail page is the
    ONE place inclusion criteria are edited; every entry must reference an
    existing criteria_bindings[].criterion_id and the updated document must
    still validate against mapping.schema.json before it is written.
    """
    user = current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not authz.has_permission(user, "template.manage"):
        raise HTTPException(
            status_code=403, detail="Missing permission: template.manage"
        )

    if template_id.startswith("_"):
        raise HTTPException(status_code=404, detail="Template not found.")
    template = get_audit_by_id(template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found.")
    # Owner-OR-manage on the template (#302) in ADDITION to the role permission —
    # the role key alone would let any clinician edit another's mapping. Ordered
    # after the 404, before the read-only check.
    _require_manage(user, template_id)
    if bool(template.get("read_only")):
        # National / BPT-derived items are read-only — clone to a Local template
        # to vary them (doc 9 §Auth & IG).
        raise HTTPException(
            status_code=403, detail="Template is read-only; clone it to edit criteria."
        )

    mapping_path = TEMPLATES_DIR / template_id / "mapping.json"
    mapping = _load_json_file(mapping_path, label="Template mapping")

    known_ids = {
        binding.get("criterion_id")
        for binding in mapping.get("criteria_bindings") or []
        if isinstance(binding, dict)
    }
    for entry in body.fixed_criteria:
        criterion_id = entry.get("criterion_id") if isinstance(entry, dict) else None
        if criterion_id not in known_ids:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown criterion_id: {criterion_id!r} (not in criteria_bindings).",
            )

    updated = {**mapping, "fixed_criteria": body.fixed_criteria}
    problems = validate_against_schema(updated, "mapping.schema.json")
    if problems:
        raise HTTPException(
            status_code=422,
            detail="fixed_criteria is invalid against mapping.schema.json: "
            + "; ".join(problems[:5]),
        )

    # Atomic persist: never leave a half-written mapping behind.
    tmp_path = mapping_path.with_suffix(".json.tmp")
    tmp_path.write_text(
        json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    tmp_path.replace(mapping_path)

    return TemplateMappingPatchResponse(
        id=template_id, fixed_criteria=body.fixed_criteria
    )


# --- custom template upload ---------------------------------------------------


def _new_template_id() -> str:
    """Mint a fresh, opaque template id (a UUID, the directory name).

    Like database ids, a template id is the permanent handle references are keyed
    on (the frontend, the `mapping.json` that lives under it). It is
    not derived from the display name, so a rename only edits `name:` frontmatter
    and never moves the directory — the id is immutable.
    """
    while True:
        candidate = uuid4().hex
        if not (TEMPLATES_DIR / candidate).exists():
            return candidate


@router.post("/api/templates/upload", response_model=TemplateUploadResponse)
async def upload_template(request: Request, file: UploadFile = File(...)):
    """Upload an Excel template and kick off background indexing.

    The file is saved into its final dir under an id derived from the filename,
    a stub `spec.json` is written with `status: indexing`, and the LLM model-build
    is launched as a background task. Returns immediately with `status="indexing"`;
    the frontend tracks completion over `/api/indexing/stream`.

    Creating a template requires `template.manage` (§9); the uploader becomes the
    OWNER via a `manage` self-grant once the template dir is created (#302), so
    the new template is owner-or-grant gated like any other.
    """
    user = _require(request, "template.manage")
    if not file.filename:
        raise HTTPException(status_code=400, detail="Template file is required.")
    ext = Path(file.filename).suffix.lower()
    if ext not in (".xlsx", ".xlsm"):
        raise HTTPException(
            status_code=415, detail="Only .xlsx and .xlsm files are supported."
        )

    fallback = (
        Path(file.filename).stem.replace("_", " ").replace("-", " ").strip().title()
        or "Untitled Template"
    )

    # The id is an opaque UUID minted up front; it stays fixed for the life of
    # the template (renames only touch the display name). The filename only seeds
    # the initial display name below.
    final_id = _new_template_id()
    final_dir = TEMPLATES_DIR / final_id
    final_dir.mkdir(parents=True, exist_ok=True)

    try:
        (final_dir / WORKBOOK_NAME).write_bytes(await file.read())
    except Exception as e:
        shutil.rmtree(final_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {e}")

    indexing.write_audit_stub(final_id, fallback)
    indexing.launch("audit", final_id)
    # Ownership IS an active `manage` self-grant (#302): the uploader self-grants
    # `manage` on the new template now the dir exists, so they own it (read/list/
    # rename/delete) and can share it. Done after the file lands so a failed save
    # never mints an owner grant for a non-existent template.
    grants.self_grant_manage(
        resource_type="template", resource_id=final_id, user_id=user["id"]
    )
    return TemplateUploadResponse(id=final_id, name=fallback, status="indexing")


@router.post(
    "/api/templates/{template_id}/reindex", response_model=TemplateUploadResponse
)
async def reindex_template(template_id: str, request: Request):
    """Retry indexing for a template whose previous build failed."""
    user = _require(request, "template.manage")
    if template_id.startswith("_") or not indexing.exists("audit", template_id):
        raise HTTPException(status_code=404, detail="Template not found.")
    # Re-running the build overwrites spec.json/mapping.json and resets status, so
    # it is a template write: owner-OR-manage (#302) in addition to the role
    # permission — else any clinician could rebuild another's template. Ordered
    # after the 404 so a missing id never discloses as a 403.
    _require_manage(user, template_id)
    name = indexing.reindex("audit", template_id)
    return TemplateUploadResponse(id=template_id, name=name, status="indexing")


@router.patch("/api/templates/{template_id}", response_model=TemplateInfo)
async def rename_template(
    template_id: str, req: TemplateRenameRequest, request: Request
):
    user = _require(request, "template.manage")
    if template_id.startswith("_") or not indexing.exists("audit", template_id):
        raise HTTPException(status_code=404, detail="Template not found.")
    # Owner-OR-manage (#302) in addition to the role permission — else any clinician
    # could rename another's template. Ordered after the 404.
    _require_manage(user, template_id)

    name = (req.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required.")

    # A rename changes only the display name. The directory name is the immutable
    # id references are keyed on (the frontend, the `mapping.json`
    # under it), so we never move the directory.
    indexing.set_display_name("audit", template_id, name)

    template = get_audit_by_id(template_id)
    if template is None:
        raise HTTPException(status_code=500, detail="Rename failed.")
    return TemplateInfo(
        id=template["id"],
        name=template["name"],
        description=template["description"],
        excel_path=template["excel_path"],
        icon=template.get("icon", "📄"),
    )


@router.delete("/api/templates/{template_id}", status_code=204)
async def delete_template(template_id: str, request: Request):
    user = _require(request, "template.manage")
    template_dir = TEMPLATES_DIR / template_id
    if template_id.startswith("_") or not template_dir.is_dir():
        raise HTTPException(status_code=404, detail="Template not found.")
    # Owner-OR-manage (#302) in addition to the role permission — else any clinician
    # could delete another's template. Ordered after the 404.
    _require_manage(user, template_id)
    indexing.cancel("audit", template_id)
    shutil.rmtree(template_dir, ignore_errors=True)
