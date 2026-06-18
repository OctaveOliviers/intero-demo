import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

from core.config import DATABASES_DIR, ROOT
from server.auth import store as auth_store
from server.auth.deps import require_user
from server.models import SqlQuery, SqlResponse

router = APIRouter()

FORBIDDEN_KEYWORDS = [
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE",
    "PRAGMA", "ATTACH", "DETACH", "REINDEX", "VACUUM",
]


def _is_read_only(query: str) -> bool:
    stripped = query.strip()
    if not stripped:
        return False
    first_token = stripped.split()[0].upper()
    if first_token != "SELECT":
        return False
    upper_query = stripped.upper()
    for kw in FORBIDDEN_KEYWORDS:
        if kw in upper_query:
            return False
    return True


def _resolve_database_path(database: str | None) -> Path:
    if not database:
        raise HTTPException(
            status_code=422,
            detail="No database specified. Provide a database path in the request body.",
        )
    # A bare database id — what the spine's cell `sources[].database` carries
    # (e.g. "npda-demographics") — resolves to the deployment's SQLite for
    # that database. Path forms keep working for legacy callers.
    if "/" not in database and "\\" not in database:
        slug_path = DATABASES_DIR / database / "database.sqlite"
        if slug_path.is_file():
            return slug_path.resolve()
    path = Path(database)
    if not path.is_absolute():
        path = ROOT / path
    path = path.resolve()
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Database not found: {database}")
    if not path.is_file():
        raise HTTPException(status_code=400, detail=f"Database path is not a file: {database}")
    return path


@router.post("/api/sql", response_model=SqlResponse)
async def execute_sql(body: SqlQuery, request: Request):
    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query is required.")

    if not _is_read_only(query):
        raise HTTPException(status_code=422, detail="Only SELECT queries are allowed.")

    # Log every database query against the requesting user — the "who and why"
    # on top of the read-only "what" (doc 7 §Attribution & query logging).
    user = require_user(request)
    auth_store.record_query(
        user["id"], query, body.database, body.run_id, datetime.now(timezone.utc).isoformat()
    )

    db_path = _resolve_database_path(body.database)

    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA query_only=ON")
    conn.row_factory = sqlite3.Row
    try:
        start = time.perf_counter()
        cursor = conn.execute(query)
        rows_data = [list(row) for row in cursor.fetchall()]
        columns = [desc[0] for desc in cursor.description] if cursor.description else []
        duration_ms = int(round((time.perf_counter() - start) * 1000))
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

    return SqlResponse(
        columns=columns,
        rows=rows_data,
        row_count=len(rows_data),
        duration_ms=duration_ms,
    )
