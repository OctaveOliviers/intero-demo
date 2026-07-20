import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import sqlglot
from fastapi import APIRouter, HTTPException, Request
from sqlglot import exp

from core.config import DATABASES_DIR, THREADS_DIR
from core.threads import store as thread_store
from server.auth import store as auth_store
from server.routes._guards import require, safe_id
from server.models import ChatCitationEvidenceRequest, SqlQuery, SqlResponse

router = APIRouter()

_READ_ONLY_EXPRESSIONS = (exp.Select, exp.Union, exp.Intersect, exp.Except)


def _is_read_only(query: str) -> bool:
    stripped = query.strip()
    if not stripped:
        return False
    try:
        statements = [
            statement
            for statement in sqlglot.parse(stripped, read="sqlite")
            if statement is not None
        ]
    except sqlglot.errors.SqlglotError:
        return False
    return len(statements) == 1 and isinstance(statements[0], _READ_ONLY_EXPRESSIONS)


def _references_sqlite_catalog(query: str) -> bool:
    try:
        statements = [
            statement
            for statement in sqlglot.parse(query.strip(), read="sqlite")
            if statement is not None
        ]
    except sqlglot.errors.SqlglotError:
        return False
    for statement in statements:
        for table in statement.find_all(exp.Table):
            name = _catalog_table_name(table)
            if name.startswith(("sqlite_", "pragma_")):
                return True
    return False


def _catalog_table_name(table: exp.Table) -> str:
    name = str(table.name or "").lower()
    if name:
        return name
    if isinstance(table.this, exp.Anonymous):
        return str(table.this.name or table.this.this or "").lower()
    return ""


def _registered_database_path(database: str) -> Path:
    if not database or "/" in database or "\\" in database:
        raise HTTPException(
            status_code=422,
            detail="Chat citation evidence must name a registered database slug.",
        )
    path = DATABASES_DIR / database / "database.sqlite"
    if not path.is_file():
        raise HTTPException(
            status_code=422,
            detail=f"Chat citation evidence database is not registered: {database}",
        )
    return path.resolve()


def _safe_thread_id(thread_id: str) -> str:
    return safe_id(thread_id, kind="Thread")


def _load_persisted_chat_citation(body: ChatCitationEvidenceRequest) -> dict:
    if not body.thread_id:
        raise HTTPException(
            status_code=422,
            detail="Chat citation evidence must reference a persisted thread citation.",
        )
    thread_id = _safe_thread_id(body.thread_id or "")
    if body.message_index is None:
        raise HTTPException(status_code=422, detail="message_index is required.")
    marker = str(body.marker or "").strip()
    if not marker:
        raise HTTPException(status_code=422, detail="marker is required.")
    try:
        thread = thread_store.load_thread(thread_id, threads_dir=THREADS_DIR)
    except thread_store.ThreadError:
        raise HTTPException(status_code=404, detail="Thread not found.")
    messages = thread.get("messages") or []
    if body.message_index < 0 or body.message_index >= len(messages):
        raise HTTPException(status_code=404, detail="Thread message not found.")
    message = messages[body.message_index]
    citations = (message.get("resolution") or {}).get("citations") or []
    citation = next(
        (
            item
            for item in citations
            if isinstance(item, dict) and str(item.get("marker") or "") == marker
        ),
        None,
    )
    if citation is None:
        raise HTTPException(status_code=404, detail="Citation not found.")
    if body.covered_row_index is None:
        return citation
    covered_rows = citation.get("covered_rows") or []
    if body.covered_row_index < 0 or body.covered_row_index >= len(covered_rows):
        raise HTTPException(status_code=404, detail="Covered row not found.")
    covered = covered_rows[body.covered_row_index]
    if not isinstance(covered, dict):
        raise HTTPException(status_code=404, detail="Covered row not found.")
    return covered


def _sqlite_ro_uri(path: Path) -> str:
    return f"file:{quote(str(path), safe='/')}?mode=ro"


def _quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _deny_runtime_side_effects(
    action_code: int,
    arg1: str | None,
    arg2: str | None,
    database: str | None,
    trigger: str | None,
) -> int:
    del arg1, database, trigger
    denied = {
        sqlite3.SQLITE_ATTACH,
        sqlite3.SQLITE_DETACH,
        sqlite3.SQLITE_INSERT,
        sqlite3.SQLITE_UPDATE,
        sqlite3.SQLITE_DELETE,
        sqlite3.SQLITE_CREATE_INDEX,
        sqlite3.SQLITE_CREATE_TABLE,
        sqlite3.SQLITE_CREATE_TEMP_INDEX,
        sqlite3.SQLITE_CREATE_TEMP_TABLE,
        sqlite3.SQLITE_CREATE_TEMP_TRIGGER,
        sqlite3.SQLITE_CREATE_TEMP_VIEW,
        sqlite3.SQLITE_CREATE_TRIGGER,
        sqlite3.SQLITE_CREATE_VIEW,
        sqlite3.SQLITE_DROP_INDEX,
        sqlite3.SQLITE_DROP_TABLE,
        sqlite3.SQLITE_DROP_TEMP_INDEX,
        sqlite3.SQLITE_DROP_TEMP_TABLE,
        sqlite3.SQLITE_DROP_TEMP_TRIGGER,
        sqlite3.SQLITE_DROP_TEMP_VIEW,
        sqlite3.SQLITE_DROP_TRIGGER,
        sqlite3.SQLITE_DROP_VIEW,
        sqlite3.SQLITE_PRAGMA,
        sqlite3.SQLITE_REINDEX,
        sqlite3.SQLITE_ALTER_TABLE,
    }
    if action_code in denied:
        return sqlite3.SQLITE_DENY
    if action_code == sqlite3.SQLITE_FUNCTION and (arg2 or "").lower() in {
        "load_extension",
        "writefile",
    }:
        return sqlite3.SQLITE_DENY
    return sqlite3.SQLITE_OK


def _execute_on_connection(conn: sqlite3.Connection, query: str) -> SqlResponse:
    conn.row_factory = sqlite3.Row
    start = time.perf_counter()
    cursor = conn.execute(query)
    rows_data = [list(row) for row in cursor.fetchall()]
    columns = [desc[0] for desc in cursor.description] if cursor.description else []
    duration_ms = int(round((time.perf_counter() - start) * 1000))
    return SqlResponse(
        columns=columns,
        rows=rows_data,
        rowCount=len(rows_data),
        durationMs=duration_ms,
    )


@router.post("/api/sql", response_model=SqlResponse)
async def execute_sql(body: SqlQuery, request: Request):
    # Identity → permission FIRST (ordered fail-closed §3): an
    # authenticated-but-unauthorized caller is denied before the query is even
    # inspected. Gate on dataset.query — the clinical-read key (control-plane
    # §4/§9; there is NO database.query). The session is the identity; any
    # client-provided user_id is ignored.
    user = require(request, "dataset.query")

    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query is required.")

    if not _is_read_only(query):
        raise HTTPException(status_code=422, detail="Only SELECT queries are allowed.")

    # Log every database query against the requesting user — the "who and why"
    # on top of the read-only "what" (doc 7 §Attribution & query logging).
    auth_store.record_query(
        user["id"],
        query,
        body.database,
        body.table_population_id,
        datetime.now(timezone.utc).isoformat(),
    )

    db_path = _registered_database_path(body.database or "")

    conn = sqlite3.connect(_sqlite_ro_uri(db_path), uri=True)
    try:
        conn.execute("PRAGMA query_only=ON")
        conn.set_authorizer(_deny_runtime_side_effects)
        return _execute_on_connection(conn, query)
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/api/chat/evidence", response_model=SqlResponse)
async def execute_chat_citation_evidence(
    body: ChatCitationEvidenceRequest, request: Request
):
    user = require(request, "thread.read")
    citation = _load_persisted_chat_citation(body)
    query = str(citation.get("query") or "").strip()
    if not query:
        raise HTTPException(status_code=422, detail="Persisted citation has no query.")
    if not _is_read_only(query):
        raise HTTPException(status_code=422, detail="Only SELECT queries are allowed.")
    if _references_sqlite_catalog(query):
        raise HTTPException(
            status_code=422,
            detail="Chat citation evidence cannot read SQLite catalog/schema tables.",
        )

    database = str(citation.get("database") or "")
    auth_store.record_query(
        user["id"],
        query,
        database,
        None,
        datetime.now(timezone.utc).isoformat(),
    )

    db_path = _registered_database_path(database)
    conn = sqlite3.connect(_sqlite_ro_uri(db_path), uri=True)
    try:
        for sibling in sorted(p for p in DATABASES_DIR.iterdir() if p.is_dir()):
            slug = sibling.name
            if slug == database:
                continue
            sibling_db = sibling / "database.sqlite"
            if not sibling_db.is_file():
                continue
            conn.execute(
                f"ATTACH DATABASE ? AS {_quote_identifier(slug)}",
                (_sqlite_ro_uri(sibling_db.resolve()),),
            )
        conn.execute("PRAGMA query_only=ON")
        conn.set_authorizer(_deny_runtime_side_effects)
        return _execute_on_connection(conn, query)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
