import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from core import model_config
from core.config import (
    STATIC_DIR,
    ensure_runs_storage,
    migrate_legacy_runs_dir,
    migrate_legacy_templates_dir,
    run_migration_once,
)
from core.runtime import Runtime
from server.auth import AuthMiddleware, init_store, seed_default_user
from server.auth import router as auth_router
from core.config import THREADS_DIR
from core.table_population.table_population_sessions import (
    adopt_legacy_status_files,
    shutdown_status_writer,
)
from core.tables.store import import_legacy_table_files
from core.threads.store import reset_running_threads
from server.auth.grants import backfill_owner_self_grants
from server.auth.store import seed_second_clinician
from server.routes import (
    table_populations,
    sql,
    workbook,
    clinicians,
    databases,
    datasets,
    generate,
    grants,
    health,
    iam,
    indexing as indexing_routes,
    tables,
    templates,
    threads,
)

logger = logging.getLogger(__name__)

# uvicorn only configures its own loggers; ensure our ``core.*``/``server.*``
# loggers surface at INFO so opencode event flow is visible in the console.
logging.getLogger("core").setLevel(logging.INFO)
logging.getLogger("server").setLevel(logging.INFO)
if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO)


def _env_port(name: str, fallback: int) -> int:
    try:
        return int(os.environ.get(name, ""))
    except ValueError:
        return fallback


def _dev_cors_origins() -> list[str]:
    app_port = _env_port("INTERO_APP_PORT", 5173)
    return [
        f"http://127.0.0.1:{app_port}",
        f"http://localhost:{app_port}",
    ]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Legacy-adoption steps. The two dir migrations are NOT gated by the
    # applied-migrations marker: they must run every boot so a legacy dir that
    # REAPPEARS (backup restore / rollback-then-forward) is still adopted
    # (issue #331) — a marker that recorded them after the first no-op boot
    # would make that reappearance-merge dead code. They are cheap: an O(1)
    # is_dir() check returns immediately when no legacy dir is present, so
    # running them every boot costs nothing to scan (issue #335's every-boot
    # concern is about the globbing steps below, which stay gated).
    #
    # Move the retired var/audits/ into its Template-named home var/templates/
    # BEFORE anything reads TEMPLATES_DIR (core.config.migrate_legacy_templates_dir).
    migrate_legacy_templates_dir()
    # Move the retired var/runs/ into its Artifact-named home var/artifacts/
    # BEFORE anything reads ARTIFACTS_DIR (core.config.migrate_legacy_runs_dir).
    migrate_legacy_runs_dir()
    # Provision var/artifacts so each Artifact's agent project root can be
    # created there when the agent step fires (storage-layout §4).
    ensure_runs_storage()
    STATIC_DIR.mkdir(parents=True, exist_ok=True)

    # Stand up the local accounts + attribution store and seed the MVP demo
    # account before any request can arrive (doc 7 §Access, §Persistence).
    init_store()
    # A turn never survives the process: settle any thread the last run left
    # mid-turn so the concurrent-turn 409 can never brick it.
    reset_running_threads(threads_dir=THREADS_DIR)
    seed_default_user()
    # A second clinician peer so owner -> colleague sharing is exercisable, and the
    # §10.4 owner self-grant backfill so every pre-existing dataset/template/table
    # is reachable by its owner. Backfill runs AFTER seed_default_user so the demo
    # admin id (the fallback owner) is resolvable; both are idempotent no-ops once
    # applied (issue #301 / control-plane §10.4 / auth-and-access §15).
    seed_second_clinician()
    # Adopt pre-migration var/tables/<id>/table.json files into the state store
    # BEFORE the owner backfill, so imported tables get their owner grants too.
    # Gated (issue #335): runs once, then skipped on every later boot.
    run_migration_once("table_files_v1", import_legacy_table_files)
    # Adopt pre-#326 var/artifacts/<id>/status.json payloads onto run rows whose
    # population_status was never recorded (the lifecycle now lives ONLY in
    # the state store). The old files stay on disk as inert bytes. Gated (issue
    # #335): runs once, then skipped on every later boot.
    run_migration_once("status_files_v1", adopt_legacy_status_files)
    backfill_owner_self_grants()

    # Per-stage model config (contracts/model-config.md): a malformed
    # models.yaml fails startup loudly; an unreachable endpoint only warns
    # (the per-stage error surfaces at first use) — local Ollama endpoints
    # are started here when down. Never downloads a model.
    model_config.ensure_endpoints_ready()

    runtime = Runtime()
    await runtime.startup()
    try:
        yield
    finally:
        await runtime.shutdown()
        # Close the long-lived lifecycle-writer store handle so it does not
        # leak at shutdown (issue #3 — the reused handle otherwise emits
        # ResourceWarning: unclosed database).
        shutdown_status_writer()
        model_config.shutdown_spawned()


app = FastAPI(title="Intero API", lifespan=lifespan)

# Place the login gate inside CORS: add it first so CORS stays the outermost
# layer (preflight + headers apply even to a 401 from the gate).
app.add_middleware(AuthMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_dev_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(health.router)
app.include_router(table_populations.router)
app.include_router(workbook.router)
app.include_router(sql.router)
app.include_router(templates.router)
app.include_router(databases.router)
app.include_router(datasets.router)
app.include_router(threads.router)
app.include_router(tables.router)
app.include_router(grants.router)
app.include_router(clinicians.router)
app.include_router(iam.router)
app.include_router(generate.router)
app.include_router(indexing_routes.router)

static_path = Path(STATIC_DIR)
if static_path.is_dir():
    app.mount("/", StaticFiles(directory=str(static_path), html=True), name="static")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )
