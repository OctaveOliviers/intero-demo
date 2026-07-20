"""The table object: mint, persist, reload, list, delete + the spec snapshot.

A **table** is a populated template — a first-class, auto-persisted,
re-openable entity that owns a table population (Q36;
decisions/0004-scope-binds-to-table-not-thread.md). Its metadata is
TRANSACTIONAL state: one row per table in the deployment state store
(``var/state.db`` — the same store its cells already live in, storage-layout.md
§3), holding the ``table.schema.json``-validated table JSON — a malformed table
is never persisted.

This module is pure persistence + assembly, mirroring :mod:`core.threads.store`:

- :func:`new_table` mints a ``table-<uuid>`` id and a schema-valid table (status
  ``"queued"``, ``table_population_id`` ``None`` until population is spawned).
- :func:`save_table` / :func:`load_table` / :func:`list_summaries` /
  :func:`list_table_ids` / :func:`delete_table` are the store operations.
  Listing is recency-ordered by ``updated_at`` DESC (product-flows.md — the
  Tables section is recency-ordered). ``TABLE_DB_PATH`` is read at call time so
  tests may redirect it.
- :func:`spec_snapshot_from_template` derives the small pinned columns/grain snapshot
  from a template's ``spec.json``.

The pin/spawn wiring lives in the route (:mod:`server.routes.tables`); this module
never touches table-population execution.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional
from uuid import uuid4

from core.config import STATE_DB_PATH, TABLES_DIR
from core.contracts import validate_against_schema

_SCHEMA_FILE = "table.schema.json"

# The deployment state store the table rows live in. A module-level name (not a
# baked-in default argument) so it is resolved at CALL time — tests redirect it.
TABLE_DB_PATH = STATE_DB_PATH

_TABLES_DDL = """
CREATE TABLE IF NOT EXISTS tables (
    id         TEXT PRIMARY KEY,
    updated_at TEXT NOT NULL,
    payload    TEXT NOT NULL   -- the table.schema.json-validated table JSON
)
"""

# The clinician-readable default when no Dataset scope pins a reporting period.
_WHOLE_DB_SCOPE_DISCLOSURE = "the whole hospital database"


class TableError(ValueError):
    """A table that cannot be loaded, persisted, or validated."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_table(
    *,
    title: str,
    source_template: str,
    description: Optional[str] = None,
    dataset_id: Optional[str] = None,
    scope_disclosure: Optional[str] = None,
    spec: Optional[dict[str, Any]] = None,
    table_population_id: Optional[str] = None,
    status: str = "queued",
    reporting_period_label: Optional[str] = None,
    thread_id: Optional[str] = None,
) -> dict[str, Any]:
    """Mint a fresh, schema-valid table (id ``table-<uuid4 hex prefix>``).

    The table starts ``status="queued"`` with ``table_population_id=None`` until
    the route spawns table population (``source_template != "ad-hoc"``). ``spec``
    is the pinned columns/grain snapshot; ``dataset_id`` is the pinned scope (the
    PINNED Dataset id, or ``None`` = whole-DB — fixed for life, decision 0004).
    """
    now = _now_iso()
    table: dict[str, Any] = {
        "schema_version": "1",
        "id": f"table-{uuid4().hex[:12]}",
        "title": title,
        "source_template": source_template,
        "dataset_id": dataset_id,
        "scope_disclosure": scope_disclosure
        if scope_disclosure is not None
        else _WHOLE_DB_SCOPE_DISCLOSURE,
        "spec": spec if spec is not None else {"columns": [], "grain": ""},
        "table_population_id": table_population_id,
        "status": status,
        "reporting_period_label": reporting_period_label
        if reporting_period_label is not None
        else now,
        "thread_id": thread_id,
        "created_at": now,
        "updated_at": now,
    }
    if description is not None:
        table["description"] = description
    return table


def spec_snapshot_from_template(template: dict[str, Any]) -> dict[str, Any]:
    """Derive the small pinned columns/grain snapshot from a template's
    ``spec.json``. Kept minimal — id/name (+ optional description from
    the field's ``notes``) per column, and the template's ``grain`` prose."""
    columns: list[dict[str, Any]] = []
    for field in template.get("fields") or []:
        if not isinstance(field, dict):
            continue
        col_id = str(field.get("id") or "").strip()
        name = str(field.get("name") or "").strip()
        if not col_id or not name:
            continue
        column: dict[str, Any] = {"id": col_id, "name": name}
        notes = str(field.get("notes") or "").strip()
        if notes:
            column["description"] = notes
        columns.append(column)
    return {"columns": columns, "grain": str(template.get("grain") or "")}


def _resolved_db_path(db_path: Path | None) -> Path:
    return Path(TABLE_DB_PATH if db_path is None else db_path)


@contextmanager
def _connect(db_path: Path | None) -> Iterator[sqlite3.Connection]:
    """One transactional connection per operation, with engine failures mapped
    to :class:`TableError`: the state DB is shared with the out-of-process
    population writers, so a busy/locked database must surface as the store's
    own error (callers catch ``TableError``), never as a raw
    ``sqlite3.OperationalError`` 500."""
    path = _resolved_db_path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        conn = sqlite3.connect(path)
    except sqlite3.Error as exc:
        raise TableError(f"table store unavailable: {exc}") from exc
    try:
        conn.execute("PRAGMA busy_timeout = 5000")
        conn.execute(_TABLES_DDL)
        yield conn
        conn.commit()
    except TableError:
        raise
    except sqlite3.Error as exc:
        raise TableError(f"table store unavailable: {exc}") from exc
    finally:
        conn.close()


def save_table(table: dict[str, Any], *, db_path: Path | None = None) -> None:
    """Persist ``table`` as its state-store row (validated first).

    Raises :class:`TableError` if the table has no id or fails schema
    validation — a malformed table is never written. The write is one
    transactional upsert, so a re-save (status refresh, rename) replaces the
    row in place.
    """
    table_id = str(table.get("id") or "").strip()
    if not table_id:
        raise TableError("table is missing its id")
    problems = validate_against_schema(table, _SCHEMA_FILE)
    if problems:
        raise TableError("table failed schema validation: " + "; ".join(problems))
    with _connect(db_path) as conn:
        conn.execute(
            "INSERT INTO tables (id, updated_at, payload) VALUES (?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, "
            "payload = excluded.payload",
            (
                table_id,
                str(table.get("updated_at") or ""),
                json.dumps(table, ensure_ascii=False),
            ),
        )


def load_table(table_id: str, *, db_path: Path | None = None) -> dict[str, Any]:
    """Read a persisted table by id. Raises :class:`TableError` if it is missing
    or its stored payload is not valid JSON."""
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT payload FROM tables WHERE id = ?", (table_id,)
        ).fetchone()
    if row is None:
        raise TableError(f"table not found: {table_id}")
    try:
        payload = json.loads(row[0])
    except json.JSONDecodeError as exc:
        raise TableError(f"table {table_id} is invalid JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise TableError(f"table {table_id} is not a JSON object")
    return payload


def _summary_of(table: dict[str, Any], fallback_id: str) -> dict[str, Any]:
    """The list-card subset of one loaded table (shared by the summary listers)."""
    return {
        "id": str(table.get("id") or fallback_id),
        "title": str(table.get("title") or ""),
        "description": str(table.get("description") or ""),
        "source_template": str(table.get("source_template") or ""),
        "reporting_period_label": str(table.get("reporting_period_label") or ""),
        "status": str(table.get("status") or "queued"),
        "updated_at": str(table.get("updated_at") or ""),
    }


def _iter_tables(db_path: Path | None) -> Iterator[tuple[str, dict[str, Any]]]:
    """Yield ``(id, table)`` recency-ordered; a row whose payload is broken is
    skipped, never listed broken."""
    with _connect(db_path) as conn:
        rows = conn.execute(
            "SELECT id, payload FROM tables ORDER BY updated_at DESC, id"
        ).fetchall()
    for table_id, payload in rows:
        try:
            table = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if not isinstance(table, dict):
            continue
        yield str(table_id), table


def list_table_ids(*, db_path: Path | None = None) -> list[str]:
    """Every persisted table id (recency-ordered) — the enumeration seam for
    startup jobs like the owner-grant backfill."""
    return [table_id for table_id, _ in _iter_tables(db_path)]


def list_summaries(*, db_path: Path | None = None) -> list[dict[str, Any]]:
    """List table summaries, recency-ordered by ``updated_at`` DESC (the Tables
    section ordering). Each summary is the list-card subset."""
    return [_summary_of(table, table_id) for table_id, table in _iter_tables(db_path)]


def list_summaries_with_population_id(
    *, db_path: Path | None = None
) -> list[tuple[dict[str, Any], str | None, dict[str, Any]]]:
    """Like :func:`list_summaries` but pairs each summary with its
    ``table_population_id`` (``None`` for an ad-hoc / pre-spawn table) and the
    loaded table payload, all read from the SAME row.

    The route needs both the list-card subset AND the table population id to
    refresh statuses from table-population state; returning them together lets
    it read each row ONCE instead of loading it again to resolve the population
    id or persist a refreshed status. The population id is kept OUT of the
    summary dict so the summary's wire shape is unchanged.
    """
    return [
        (_summary_of(table, table_id), table.get("table_population_id"), table)
        for table_id, table in _iter_tables(db_path)
    ]


def table_for_population_id(
    table_population_id: str, *, db_path: Path | None = None
) -> dict[str, Any] | None:
    """The persisted table that OWNS ``table_population_id``, or ``None``.

    The refresh route holds only a population id; this resolves the owning
    Table (its pinned ``dataset_id`` scope + ``brief`` drive the re-run).
    ``None`` means no table wraps the population — a table-less legacy
    population created via ``POST /api/table-populations``."""
    if not table_population_id:
        return None
    for _table_id, table in _iter_tables(db_path):
        if table.get("table_population_id") == table_population_id:
            return table
    return None


def delete_table(table_id: str, *, db_path: Path | None = None) -> None:
    """Remove the table's row. Raises :class:`TableError` if it is absent."""
    with _connect(db_path) as conn:
        cursor = conn.execute("DELETE FROM tables WHERE id = ?", (table_id,))
        if cursor.rowcount == 0:
            raise TableError(f"table not found: {table_id}")


def import_legacy_table_files(
    *, legacy_tables_dir: Path | None = None, db_path: Path | None = None
) -> int:
    """One-time forward migration (startup): adopt every pre-migration
    ``var/tables/<id>/table.json`` file whose id has no store row yet.

    A store row always wins (never overwritten by a file); a broken file or one
    whose ``id`` disagrees with its directory is skipped; a file today's schema
    rejects stays file-only rather than aborting startup. Files are left in
    place — inert once the store owns the row. Returns how many were imported;
    idempotent."""
    legacy = TABLES_DIR if legacy_tables_dir is None else legacy_tables_dir
    if not legacy.is_dir():
        return 0
    # Every persisted id, including a row whose payload is broken — a store row
    # always wins over a file, so a corrupt row is never healed from a stale
    # legacy file (the listers skip it; this guard must not).
    with _connect(db_path) as conn:
        existing = {row[0] for row in conn.execute("SELECT id FROM tables")}
    imported = 0
    for table_dir in sorted(p for p in legacy.iterdir() if p.is_dir()):
        if table_dir.name in existing:
            continue
        try:
            table = json.loads((table_dir / "table.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(table, dict) or str(table.get("id") or "") != table_dir.name:
            continue
        try:
            save_table(table, db_path=db_path)
        except TableError:
            continue
        imported += 1
    return imported
