"""Background indexing of audit templates and database schemas.

Indexing emits ONE structured JSON model per entity — `spec.json` for audits,
`model.json` for databases — under `var/audits/<id>/` and `var/databases/<id>/`
per the storage-layout contract (docs/mvp/contracts/storage-layout.md §2). The
indexing-lifecycle STATE (`status`/`error`) lives inside that same model (the
S0 schemas declare `status`/`error` as operational fields), so there is no
separate status sidecar: one file is the source of truth for both the model and
its build state.

This module is the one place that knows the on-disk format. It exposes a
normalized read/write surface — `read_meta`, `exists`, `set_display_name`,
`read_status` — that the read-side (`catalog.py`) and the HTTP routes use without
touching the file layout.

It also provides:

- A background task runner (`run_indexing`) that calls the builder, writes the
  validated JSON model atomically, and marks it `ready` or `error`.
- An efficient wake-up primitive (`await_ready`) so run-spawn can block on
  indexing completion without polling.
- A process-wide pub/sub queue (`subscribe`) used by the indexing SSE stream to
  push toast events to the frontend.
- A startup rescan (`rescan_on_startup`) that re-launches indexing for any
  entity still marked `status: indexing` (e.g. server died mid-LLM).
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import AsyncIterator, Literal

from core.indexing.build_audit_spec import build_audit_spec
from core.config import AUDITS_DIR, DATABASES_DIR, WORKBOOK_NAME
from core.indexing.build_database_model import build_database_model
from core.indexing.profile import validate_against_schema

_AUDIT_SCHEMA = "audit-spec.schema.json"
_DATABASE_SCHEMA = "database-model.schema.json"

logger = logging.getLogger(__name__)

Kind = Literal["audit", "database"]


class IndexingError(Exception):
    pass


# In-memory wake-up signals. Not state — purely an optimization so awaiters
# don't have to poll the file. The file is always re-read after the event fires.
_events: dict[tuple[str, str], asyncio.Event] = {}

# In-flight indexing tasks, keyed by (kind, entity_id). Lets `cancel` abort a
# running build (e.g. when its entity is deleted) and keeps a strong reference
# so the task isn't garbage-collected mid-flight.
_tasks: dict[tuple[str, str], asyncio.Task] = {}

# Pub/sub for the indexing SSE stream. Each subscriber gets its own queue.
_subscribers: list[asyncio.Queue[dict]] = []


def _event_for(kind: Kind, entity_id: str) -> asyncio.Event:
    key = (kind, entity_id)
    ev = _events.get(key)
    if ev is None:
        ev = asyncio.Event()
        _events[key] = ev
    return ev


def _json_path(kind: Kind, entity_id: str) -> Path:
    """Path to the structured model emitted by indexing — the single source of
    truth for both the model and its build state (storage-layout §2)."""
    if kind == "audit":
        return AUDITS_DIR / entity_id / "spec.json"
    return DATABASES_DIR / entity_id / "model.json"


def database_rel_path(db_id: str) -> str:
    """Repo-relative path to a database's SQLite file (derived from the id, which
    the directory is named after). The SQL tools resolve it from the repo root."""
    return f"var/databases/{db_id}/database.sqlite"


def _write_json_model(path: Path, model: dict) -> None:
    path.write_text(json.dumps(model, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _read_json(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (json.JSONDecodeError, OSError):
        return None


def exists(kind: Kind, entity_id: str) -> bool:
    """Whether an entity is present on disk as a JSON model."""
    return _json_path(kind, entity_id).exists()


def read_meta(kind: Kind, entity_id: str) -> dict | None:
    """Normalized metadata for one entity, from `spec.json`/`model.json`.
    None if the entity is absent.

    The returned dict always carries `id`, `name`, `description`, `status`,
    `error`, and `source` (\"json\"), plus kind-specific fields:
    audits get `excel_path`; databases get `type` and `path`. This is the one
    accessor the read-side and routes use, so they never branch on file format."""
    model = _read_json(_json_path(kind, entity_id))
    if model is not None:
        meta = {
            "id": entity_id,
            "name": (model.get("title") or entity_id),
            "description": model.get("description", "") or "",
            "status": model.get("status") or "ready",
            "error": model.get("error") or None,
            "source": "json",
        }
        if kind == "audit":
            meta["excel_path"] = (model.get("source") or {}).get("template") or WORKBOOK_NAME
        else:
            meta["type"] = "sqlite"
            meta["path"] = database_rel_path(entity_id)
        return meta
    return None


def read_status(kind: Kind, entity_id: str) -> tuple[str, str | None, dict]:
    """Return (status, error, meta). Status is "missing" when the entity is absent
    and "ready" when no explicit status is recorded."""
    meta = read_meta(kind, entity_id)
    if meta is None:
        return "missing", None, {}
    return meta["status"], meta["error"], meta


def set_display_name(kind: Kind, entity_id: str, name: str) -> bool:
    """Rename an entity's display name in place (`title` in the JSON model).
    Returns False if the entity is absent. The directory id is immutable and
    never moves."""
    jpath = _json_path(kind, entity_id)
    model = _read_json(jpath)
    if model is None:
        return False
    model["title"] = name
    _write_json_model(jpath, model)
    return True


# --- write stubs ------------------------------------------------------------

def write_audit_stub(audit_id: str, name: str) -> None:
    """Write the initial `spec.json` stub (status: indexing). It is a partial
    document — fields/criteria are filled when the build completes — so it is not
    yet schema-valid; only the final model is validated before it is marked
    ready."""
    path = _json_path("audit", audit_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    _write_json_model(path, {
        "schema_version": "1",
        "audit": audit_id,
        "title": name,
        "status": "indexing",
    })


def write_database_stub(db_id: str, name: str, relative_path: str | None = None) -> None:
    """Write the initial `model.json` stub (status: indexing). `relative_path`
    is accepted for call-site compatibility but the SQLite path is derived from
    the id (`database_rel_path`), so it is not stored."""
    path = _json_path("database", db_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    _write_json_model(path, {
        "schema_version": "1",
        "database": db_id,
        "title": name,
        "status": "indexing",
    })


# --- pub/sub ----------------------------------------------------------------

def _publish(event: dict) -> None:
    dead: list[asyncio.Queue[dict]] = []
    for q in _subscribers:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        try:
            _subscribers.remove(q)
        except ValueError:
            pass


async def subscribe() -> AsyncIterator[dict]:
    q: asyncio.Queue[dict] = asyncio.Queue(maxsize=128)
    _subscribers.append(q)
    try:
        while True:
            yield await q.get()
    finally:
        try:
            _subscribers.remove(q)
        except ValueError:
            pass


# --- core: await_ready ------------------------------------------------------

async def await_ready(kind: Kind, entity_id: str, timeout: float = 300.0) -> None:
    """Block until the entity model says `status: ready`.

    Re-reads the file after every wake-up; the event is a wake-up signal, not a
    source of truth. Raises IndexingError on `error` or timeout.
    """
    deadline = asyncio.get_event_loop().time() + timeout
    while True:
        status, err, _ = read_status(kind, entity_id)
        if status == "ready":
            return
        if status == "error":
            raise IndexingError(err or f"{kind} {entity_id} indexing failed")
        if status == "missing":
            raise IndexingError(f"{kind} {entity_id} not found")
        remaining = deadline - asyncio.get_event_loop().time()
        if remaining <= 0:
            raise IndexingError(f"Timed out waiting for {kind} {entity_id} to finish indexing")
        ev = _event_for(kind, entity_id)
        try:
            # Cap each wait at 2s as a safety net against missed wake-ups
            # (e.g. event created after the indexing task already set the prior one).
            await asyncio.wait_for(ev.wait(), timeout=min(2.0, remaining))
        except asyncio.TimeoutError:
            pass
        finally:
            # Clear so we re-arm; we'll re-check status above.
            if ev.is_set():
                ev.clear()


# --- core: run_indexing -----------------------------------------------------

async def run_indexing(kind: Kind, entity_id: str) -> None:
    """Run the appropriate builder in the background, atomically writing the
    validated JSON model when done. Always fires the wake-up event and a pub/sub
    transition at the end (success or failure).
    """
    # Announce the start so already-connected SSE clients see the `indexing`
    # state immediately. (New clients get it via the snapshot in list_all; this
    # covers uploads/retries that happen mid-session.)
    start = read_meta(kind, entity_id)
    _publish({
        "kind": kind,
        "id": entity_id,
        "name": (start or {}).get("name") or entity_id,
        "status": "indexing",
        "error": None,
    })
    try:
        if kind == "audit":
            await _run_audit_indexing(entity_id)
        else:
            await _run_database_indexing(entity_id)
    except asyncio.CancelledError:
        # Deliberate cancellation (e.g. the entity was deleted mid-index). Do
        # NOT mark error — the files are being removed by the caller. Let the
        # cancellation propagate after firing the wake-up in `finally`.
        logger.info("indexing cancelled: %s %s", kind, entity_id)
        raise
    except Exception as exc:
        logger.exception("indexing failed: %s %s", kind, entity_id)
        _mark_error(kind, entity_id, str(exc))
    finally:
        _event_for(kind, entity_id).set()


async def _run_audit_indexing(audit_id: str) -> None:
    workbook = AUDITS_DIR / audit_id / WORKBOOK_NAME
    if not workbook.exists():
        raise IndexingError(f"{WORKBOOK_NAME} missing for {audit_id}")
    meta = read_meta("audit", audit_id) or {}
    display_name = meta.get("name") or audit_id

    # The prior model (a ready model on re-index, the stub on first index) carries
    # the user-set state to preserve (§6).
    previous = _read_json(_json_path("audit", audit_id))
    model = await build_audit_spec(
        workbook, audit_id, display_name=display_name, previous=previous
    )
    # The user-chosen display name (from upload or a rename) is authoritative —
    # the builder's LLM title is only a fallback when none was set.
    model["title"] = display_name
    model["status"] = "ready"
    # Final guard: never write a broken model.
    problems = validate_against_schema(model, _AUDIT_SCHEMA)
    if problems:
        raise IndexingError("audit spec invalid before write: " + "; ".join(problems))

    _write_json_model(_json_path("audit", audit_id), model)
    _publish({"kind": "audit", "id": audit_id, "name": model["title"], "status": "ready"})


async def _run_database_indexing(db_id: str) -> None:
    sqlite_path = DATABASES_DIR / db_id / "database.sqlite"
    if not sqlite_path.exists():
        raise IndexingError(f"database.sqlite missing for {db_id}")
    meta = read_meta("database", db_id) or {}
    display_name = meta.get("name") or db_id

    # Every other database with a sqlite on disk is an identity-link sibling.
    # (A sibling indexed BEFORE this one keeps its own model unchanged — its
    # link to this database appears when it is next re-indexed; one direction
    # is enough for the mapping to read the fact.)
    siblings = {
        d.name: d / "database.sqlite"
        for d in DATABASES_DIR.iterdir()
        if d.is_dir() and d.name != db_id and (d / "database.sqlite").exists()
    }

    # The prior model (a ready model on re-index, the stub on first index) carries
    # the asserted prose to preserve for structurally-unchanged tables (§6).
    previous = _read_json(_json_path("database", db_id))
    model = await build_database_model(
        sqlite_path, db_id, display_name=display_name,
        sibling_databases=siblings, previous=previous,
    )
    # The user-chosen display name (from upload or a rename) is authoritative —
    # the builder's LLM title is only a fallback when none was set.
    model["title"] = display_name
    model["status"] = "ready"
    # Final guard: never write a broken model.
    problems = validate_against_schema(model, _DATABASE_SCHEMA)
    if problems:
        raise IndexingError("database model invalid before write: " + "; ".join(problems))

    _write_json_model(_json_path("database", db_id), model)
    _publish({"kind": "database", "id": db_id, "name": model["title"], "status": "ready"})


def _mark_error(kind: Kind, entity_id: str, error: str) -> None:
    """Record a build failure on the entity (status:error + reason) in JSON."""
    jpath = _json_path(kind, entity_id)
    model = _read_json(jpath)
    if model is None:
        return
    model["status"] = "error"
    model["error"] = error
    _write_json_model(jpath, model)
    name = model.get("title") or entity_id
    _publish({"kind": kind, "id": entity_id, "name": name, "status": "error", "error": error})


# --- launch helpers ---------------------------------------------------------

def launch(kind: Kind, entity_id: str) -> None:
    """Fire-and-forget background task.

    Tracks the task in `_tasks` so it can be cancelled (and isn't GC'd
    mid-flight). The done-callback removes the entry once the task finishes,
    guarding against a relaunch having replaced it in the meantime.
    """
    key = (kind, entity_id)
    task = asyncio.create_task(run_indexing(kind, entity_id))
    _tasks[key] = task
    task.add_done_callback(
        lambda t, k=key: _tasks.pop(k, None) if _tasks.get(k) is t else None
    )


def cancel(kind: Kind, entity_id: str) -> None:
    """Cancel an in-flight indexing task, if any, and wake awaiters.

    Idempotent and safe to call when nothing is running. The caller is
    responsible for removing the entity's files; once they are gone,
    `await_ready` re-reads status as `missing` and raises.
    """
    key = (kind, entity_id)
    task = _tasks.pop(key, None)
    if task is not None and not task.done():
        task.cancel()
    # Wake any await_ready waiters so they re-read status immediately instead of
    # waiting out their 2s safety-net tick.
    ev = _events.get(key)
    if ev is not None:
        ev.set()


def reindex(kind: Kind, entity_id: str) -> str:
    """Reset an entity to `indexing` and relaunch its builder.

    Used by the "try again" action after a failed index. Clears the prior error
    and flips the model back to `status: indexing` (so list endpoints and
    `await_ready` see in-progress) while preserving the rest of the model as the
    state to merge, then launches a fresh build. Returns the entity's display
    name. Raises IndexingError if the entity is missing.
    """
    meta = read_meta(kind, entity_id)
    if meta is None:
        raise IndexingError(f"{kind} {entity_id} not found")

    jpath = _json_path(kind, entity_id)
    model = _read_json(jpath)
    if model is None:
        raise IndexingError(f"{kind} {entity_id} not found")
    model["status"] = "indexing"
    model.pop("error", None)
    _write_json_model(jpath, model)
    launch(kind, entity_id)
    return meta["name"]


# --- list for status API ----------------------------------------------------

def list_all() -> list[dict]:
    out: list[dict] = []
    for kind, base in (("audit", AUDITS_DIR), ("database", DATABASES_DIR)):
        if not base.exists():
            continue
        for d in sorted(base.iterdir()):
            if not d.is_dir() or d.name.startswith("_"):
                continue
            meta = read_meta(kind, d.name)  # type: ignore[arg-type]
            if meta is None:
                continue
            out.append({
                "kind": kind,
                "id": d.name,
                "name": meta["name"],
                "status": meta["status"],
                "error": meta["error"],
            })
    return out


# --- startup rescan ---------------------------------------------------------

def rescan_on_startup() -> None:
    """Re-launch indexing for any entity whose stub says `status: indexing`.

    The previous LLM call (if any) is dead; we start a fresh one. Safe because
    builders are deterministic — re-running just overwrites the same model.
    """
    for entry in list_all():
        if entry["status"] == "indexing":
            logger.info("Resuming indexing for %s %s after restart", entry["kind"], entry["id"])
            launch(entry["kind"], entry["id"])
