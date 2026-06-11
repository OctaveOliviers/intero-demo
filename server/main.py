import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from core import model_config
from core.config import STATIC_DIR, ensure_runs_storage
from core.runtime import Runtime
from server.auth import AuthMiddleware, init_store, seed_default_user
from server.auth import router as auth_router
from server.routes import runs, sql, workbook, audits, databases, generate, health, indexing as indexing_routes

logger = logging.getLogger(__name__)

# uvicorn only configures its own loggers; ensure our ``core.*``/``server.*``
# loggers surface at INFO so opencode event flow is visible in the console.
logging.getLogger("core").setLevel(logging.INFO)
logging.getLogger("server").setLevel(logging.INFO)
if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Provision var/runs so per-run agent project roots can be created
    # there at Tier-3 fire time (storage-layout §4).
    ensure_runs_storage()
    STATIC_DIR.mkdir(parents=True, exist_ok=True)

    # Stand up the local accounts + attribution store and seed the MVP demo
    # account before any request can arrive (doc 7 §Access, §Persistence).
    init_store()
    seed_default_user()

    # Per-stage model config (contracts/model-config.md): a malformed
    # models.json fails startup loudly; an unreachable endpoint only warns
    # (the per-stage error surfaces at first use) — local Ollama endpoints
    # are started here when down. Never downloads a model.
    model_config.ensure_endpoints_ready()

    runtime = Runtime()
    await runtime.startup()
    try:
        yield
    finally:
        await runtime.shutdown()
        model_config.shutdown_spawned()


app = FastAPI(title="Intero API", lifespan=lifespan)

# The login gate runs inside CORS: add it first so CORS stays the outermost
# layer (preflight + headers apply even to a 401 from the gate).
app.add_middleware(AuthMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(health.router)
app.include_router(runs.router)
app.include_router(workbook.router)
app.include_router(sql.router)
app.include_router(audits.router)
app.include_router(databases.router)
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
