import shutil
import sqlite3
import json
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile

from core import indexing
from core.catalog import load_database_catalog
from core.config import DATABASES_DIR
from server.models import (
    DatabaseDetailResponse,
    DatabaseInfo,
    DatabaseRenameRequest,
    DatabaseUploadResponse,
)

router = APIRouter()


def _new_database_id() -> str:
    """Mint a fresh, opaque database id (a UUID, the directory name).

    The id is deliberately *not* derived from the display name. It is the
    permanent handle every reference is keyed on — the `mapping.<id>.md` cache,
    an audit's `database_filter`, the resolved SQLite path, and the frontend — so
    it must never change. A rename only edits the `name:` frontmatter; the
    directory (and thus the id) stays put. Keeping the id opaque also avoids the
    confusion of a folder named `cord-ph` whose display name is now something
    else entirely.
    """
    while True:
        candidate = uuid4().hex
        if not (DATABASES_DIR / candidate).exists():
            return candidate


def _get_database_by_id(db_id: str) -> dict | None:
    for db in load_database_catalog():
        if db["id"] == db_id:
            return db
    return None


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


def _database_info_from_catalog_entry(db: dict) -> DatabaseInfo:
    """Centralized metadata mapping for database list/detail payload consistency."""
    return DatabaseInfo(
        id=db["id"],
        name=db["name"],
        description=db["description"],
        type=db["type"],
        path=db["path"],
        level=db.get("level") or "Local",
        read_only=bool(db.get("read_only") or False),
        stale=bool(db.get("stale") or False),
        version=db.get("version"),
        scheme=db.get("scheme"),
        last_pulled=db.get("last_pulled"),
        provenance_ref=db.get("provenance_ref"),
        provenance_url=db.get("provenance_url"),
        status=db.get("status", "ready"),
    )


@router.get("/api/databases", response_model=list[DatabaseInfo])
async def list_databases():
    return [_database_info_from_catalog_entry(db) for db in load_database_catalog()]


@router.get("/api/databases/{db_id}", response_model=DatabaseDetailResponse)
async def get_database_detail(db_id: str):
    if db_id.startswith("_"):
        raise HTTPException(status_code=404, detail="Database not found.")
    db = _get_database_by_id(db_id)
    if db is None:
        raise HTTPException(status_code=404, detail="Database not found.")

    model = _load_json_file(DATABASES_DIR / db_id / "model.json", label="Database model")
    base = _database_info_from_catalog_entry(db)
    return DatabaseDetailResponse(
        id=base.id,
        name=base.name,
        description=base.description,
        type=base.type,
        path=base.path,
        status=base.status,
        level=base.level,
        read_only=base.read_only,
        stale=base.stale,
        version=base.version,
        scheme=base.scheme,
        last_pulled=base.last_pulled,
        provenance_ref=base.provenance_ref,
        provenance_url=base.provenance_url,
        model=model,
    )


def _validate_sqlite_file(path: Path) -> None:
    """Confirm the saved file is actually a SQLite database."""
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            conn.execute("SELECT name FROM sqlite_master LIMIT 1").fetchone()
        finally:
            conn.close()
    except sqlite3.DatabaseError as e:
        raise HTTPException(status_code=415, detail=f"Not a valid SQLite database: {e}")


@router.post("/api/databases/upload", response_model=DatabaseUploadResponse)
async def upload_database(file: UploadFile = File(...)):
    """Upload a SQLite file and kick off background indexing.

    The file is validated, saved into its final dir under an id derived from the
    filename, a stub `model.json` is written with `status: indexing`, and the
    LLM model-build is launched as a background task. Returns immediately with
    `status="indexing"`; the frontend tracks completion over
    `/api/indexing/stream`.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Database file is required.")
    ext = Path(file.filename).suffix.lower()
    if ext not in (".sqlite", ".sqlite3", ".db"):
        raise HTTPException(status_code=415, detail="Only .sqlite, .sqlite3, and .db files are supported.")

    fallback = Path(file.filename).stem.replace("_", " ").replace("-", " ").strip().title() or "Untitled Database"

    # The id is an opaque UUID decided up front; the stored SQLite path embeds
    # it, and it stays fixed for the life of the database (renames only touch the
    # display name). The filename only seeds the initial display name below.
    final_id = _new_database_id()
    final_dir = DATABASES_DIR / final_id
    final_dir.mkdir(parents=True, exist_ok=True)

    sqlite_path = final_dir / "database.sqlite"
    try:
        sqlite_path.write_bytes(await file.read())
    except Exception as e:
        shutil.rmtree(final_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {e}")

    try:
        _validate_sqlite_file(sqlite_path)
    except HTTPException:
        shutil.rmtree(final_dir, ignore_errors=True)
        raise

    indexing.write_database_stub(final_id, fallback)
    indexing.launch("database", final_id)
    return DatabaseUploadResponse(id=final_id, name=fallback, status="indexing")


@router.post("/api/databases/{db_id}/reindex", response_model=DatabaseUploadResponse)
async def reindex_database(db_id: str):
    """Retry indexing for a database whose previous build failed."""
    if db_id.startswith("_") or not indexing.exists("database", db_id):
        raise HTTPException(status_code=404, detail="Database not found.")
    name = indexing.reindex("database", db_id)
    return DatabaseUploadResponse(id=db_id, name=name, status="indexing")


@router.patch("/api/databases/{db_id}", response_model=DatabaseInfo)
async def rename_database(db_id: str, req: DatabaseRenameRequest):
    if db_id.startswith("_") or not indexing.exists("database", db_id):
        raise HTTPException(status_code=404, detail="Database not found.")

    name = (req.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required.")

    # A rename changes only the user-facing display name. The directory name is
    # the immutable id every reference is keyed on (audit `database_filter`,
    # cached `mapping.<id>.md` sidecars, the resolved SQLite path, the frontend);
    # moving the directory would change the id and silently break all of them.
    indexing.set_display_name("database", db_id, name)

    db = _get_database_by_id(db_id)
    if db is None:
        raise HTTPException(status_code=500, detail="Rename failed.")
    return DatabaseInfo(
        id=db["id"], name=db["name"], description=db["description"],
        type=db["type"], path=db["path"],
    )


@router.delete("/api/databases/{db_id}", status_code=204)
async def delete_database(db_id: str):
    db_dir = DATABASES_DIR / db_id
    if db_id.startswith("_") or not db_dir.is_dir():
        raise HTTPException(status_code=404, detail="Database not found.")
    indexing.cancel("database", db_id)
    shutil.rmtree(db_dir, ignore_errors=True)
