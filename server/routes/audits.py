import shutil
import json
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from core import indexing
from core.catalog import get_audit_by_id, load_audit_registry
from core.config import AUDITS_DIR, WORKBOOK_NAME
from core.indexing.profile import validate_against_schema
from server.auth import permissions as authz
from server.auth.deps import current_user
from server.models import (
    AuditDetailResponse,
    AuditInfo,
    AuditMappingPatchRequest,
    AuditMappingPatchResponse,
    AuditRenameRequest,
    AuditUploadResponse,
)

router = APIRouter()


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


def _audit_info_from_catalog_entry(audit: dict) -> AuditInfo:
    """Centralized metadata mapping for audit list/detail payload consistency."""
    return AuditInfo(
        id=audit["id"],
        name=audit["name"],
        description=audit["description"],
        excel_path=audit["excel_path"],
        icon=audit.get("icon", "📄"),
        database=audit.get("database") or None,
        level=audit.get("level") or "Local",
        read_only=bool(audit.get("read_only") or False),
        stale=bool(audit.get("stale") or False),
        version=audit.get("version"),
        scheme=audit.get("scheme"),
        last_pulled=audit.get("last_pulled"),
        provenance_ref=audit.get("provenance_ref"),
        provenance_url=audit.get("provenance_url"),
        status=audit.get("status", "ready"),
        deadline=audit.get("deadline"),
    )


@router.get("/api/audits", response_model=list[AuditInfo])
async def list_audits():
    return [_audit_info_from_catalog_entry(audit) for audit in load_audit_registry()]


@router.get("/api/audits/{audit_id}", response_model=AuditDetailResponse)
async def get_audit_detail(audit_id: str):
    if audit_id.startswith("_"):
        raise HTTPException(status_code=404, detail="Audit not found.")
    audit = get_audit_by_id(audit_id)
    if audit is None:
        raise HTTPException(status_code=404, detail="Audit not found.")

    audit_dir = AUDITS_DIR / audit_id
    spec = _load_json_file(audit_dir / "spec.json", label="Audit spec")
    mapping_path = audit_dir / "mapping.json"
    mapping = _load_json_file(mapping_path, label="Audit mapping") if mapping_path.exists() else None
    base = _audit_info_from_catalog_entry(audit)

    return AuditDetailResponse(
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


@router.patch("/api/audits/{audit_id}/mapping", response_model=AuditMappingPatchResponse)
async def patch_audit_mapping(audit_id: str, body: AuditMappingPatchRequest, request: Request):
    """Persist an edited `fixed_criteria` array to the audit's mapping.json.

    Doc 4 §The fixed inclusion criteria / doc 9: the audit-detail page is the
    ONE place inclusion criteria are edited; every entry must reference an
    existing criteria_bindings[].criterion_id and the updated document must
    still validate against mapping.schema.json before it is written.
    """
    user = current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not authz.has_permission(user, "mapping.edit_criteria"):
        raise HTTPException(status_code=403, detail="Missing permission: mapping.edit_criteria")

    if audit_id.startswith("_"):
        raise HTTPException(status_code=404, detail="Audit not found.")
    audit = get_audit_by_id(audit_id)
    if audit is None:
        raise HTTPException(status_code=404, detail="Audit not found.")
    if bool(audit.get("read_only")):
        # National / BPT-derived items are read-only — clone to a Local audit
        # to vary them (doc 9 §Auth & IG).
        raise HTTPException(status_code=403, detail="Audit is read-only; clone it to edit criteria.")

    mapping_path = AUDITS_DIR / audit_id / "mapping.json"
    mapping = _load_json_file(mapping_path, label="Audit mapping")

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
            detail="fixed_criteria is invalid against mapping.schema.json: " + "; ".join(problems[:5]),
        )

    # Atomic persist: never leave a half-written mapping behind.
    tmp_path = mapping_path.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp_path.replace(mapping_path)

    return AuditMappingPatchResponse(id=audit_id, fixed_criteria=body.fixed_criteria)


# --- custom audit upload -----------------------------------------------------

def _new_audit_id() -> str:
    """Mint a fresh, opaque audit id (a UUID, the directory name).

    Like database ids, an audit id is the permanent handle references are keyed
    on (the frontend, the `mapping.json` that lives under it). It is
    not derived from the display name, so a rename only edits `name:` frontmatter
    and never moves the directory — the id is immutable.
    """
    while True:
        candidate = uuid4().hex
        if not (AUDITS_DIR / candidate).exists():
            return candidate


@router.post("/api/audits/upload", response_model=AuditUploadResponse)
async def upload_audit(file: UploadFile = File(...)):
    """Upload an Excel audit and kick off background indexing.

    The file is saved into its final dir under an id derived from the filename,
    a stub `spec.json` is written with `status: indexing`, and the LLM model-build
    is launched as a background task. Returns immediately with `status="indexing"`;
    the frontend tracks completion over `/api/indexing/stream`.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Audit file is required.")
    ext = Path(file.filename).suffix.lower()
    if ext not in (".xlsx", ".xlsm"):
        raise HTTPException(status_code=415, detail="Only .xlsx and .xlsm files are supported.")

    fallback = Path(file.filename).stem.replace("_", " ").replace("-", " ").strip().title() or "Untitled Audit"

    # The id is an opaque UUID minted up front; it stays fixed for the life of
    # the audit (renames only touch the display name). The filename only seeds
    # the initial display name below.
    final_id = _new_audit_id()
    final_dir = AUDITS_DIR / final_id
    final_dir.mkdir(parents=True, exist_ok=True)

    try:
        (final_dir / WORKBOOK_NAME).write_bytes(await file.read())
    except Exception as e:
        shutil.rmtree(final_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {e}")

    indexing.write_audit_stub(final_id, fallback)
    indexing.launch("audit", final_id)
    return AuditUploadResponse(id=final_id, name=fallback, status="indexing")


@router.post("/api/audits/{audit_id}/reindex", response_model=AuditUploadResponse)
async def reindex_audit(audit_id: str):
    """Retry indexing for an audit whose previous build failed."""
    if audit_id.startswith("_") or not indexing.exists("audit", audit_id):
        raise HTTPException(status_code=404, detail="Audit not found.")
    name = indexing.reindex("audit", audit_id)
    return AuditUploadResponse(id=audit_id, name=name, status="indexing")


@router.patch("/api/audits/{audit_id}", response_model=AuditInfo)
async def rename_audit(audit_id: str, req: AuditRenameRequest):
    if audit_id.startswith("_") or not indexing.exists("audit", audit_id):
        raise HTTPException(status_code=404, detail="Audit not found.")

    name = (req.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required.")

    # A rename changes only the display name. The directory name is the immutable
    # id references are keyed on (the frontend, the `mapping.json`
    # under it), so we never move the directory.
    indexing.set_display_name("audit", audit_id, name)

    audit = get_audit_by_id(audit_id)
    if audit is None:
        raise HTTPException(status_code=500, detail="Rename failed.")
    return AuditInfo(
        id=audit["id"], name=audit["name"], description=audit["description"],
        excel_path=audit["excel_path"], icon=audit.get("icon", "📄"),
    )


@router.delete("/api/audits/{audit_id}", status_code=204)
async def delete_audit(audit_id: str):
    audit_dir = AUDITS_DIR / audit_id
    if audit_id.startswith("_") or not audit_dir.is_dir():
        raise HTTPException(status_code=404, detail="Audit not found.")
    indexing.cancel("audit", audit_id)
    shutil.rmtree(audit_dir, ignore_errors=True)
