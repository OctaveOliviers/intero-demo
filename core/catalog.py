"""Read-side data access over the audit and database catalogs.

Scans ``var/audits/*`` and ``var/databases/*`` and exposes the registry both
the HTTP list endpoints and the run orchestrator need. Reads each entity through
``indexing.read_meta``, the single accessor that knows the on-disk format
(``spec.json``/``model.json``, with a legacy ``.md`` fallback) — so the catalog
never branches on file layout. No HTTP, no LLM.
"""

from __future__ import annotations

import json

from core import indexing
from core.config import AUDITS_DIR, DATABASES_DIR


def _read_json(path) -> dict | None:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return raw if isinstance(raw, dict) else None


def _audit_card_meta(audit_id: str) -> dict:
    spec = _read_json(AUDITS_DIR / audit_id / "spec.json") or {}
    provenance = spec.get("provenance")
    if not isinstance(provenance, dict):
        provenance = {}
    return {
        "version": str(spec.get("version")) if spec.get("version") is not None else None,
        "scheme": provenance.get("scheme"),
        "last_pulled": provenance.get("last_pulled") or provenance.get("lastPulled"),
        "provenance_ref": provenance.get("ref") or provenance.get("source_ref"),
        "provenance_url": provenance.get("url") or provenance.get("source_url"),
        "level": spec.get("level") or "Local",
        "read_only": bool(spec.get("read_only") or spec.get("readOnly") or False),
        "stale": bool(spec.get("stale") or False),
        "deadline": spec.get("deadline") or None,
    }


def _database_card_meta(db_id: str) -> dict:
    model = _read_json(DATABASES_DIR / db_id / "model.json") or {}
    provenance = model.get("provenance")
    if not isinstance(provenance, dict):
        provenance = {}
    return {
        "version": str(model.get("version")) if model.get("version") is not None else None,
        "scheme": provenance.get("scheme"),
        "last_pulled": provenance.get("last_pulled") or provenance.get("lastPulled"),
        "provenance_ref": provenance.get("ref") or provenance.get("source_ref"),
        "provenance_url": provenance.get("url") or provenance.get("source_url"),
        "level": model.get("level") or "Local",
        "read_only": bool(model.get("read_only") or model.get("readOnly") or False),
        "stale": bool(model.get("stale") or False),
    }


def load_audit_registry() -> list[dict]:
    """Build the audit registry from var/audits/*."""
    if not AUDITS_DIR.exists():
        return []
    audits = []
    for audit_dir in sorted(AUDITS_DIR.iterdir()):
        if not audit_dir.is_dir():
            continue
        # Hidden dirs (drafts being built) start with "_" and are not registered.
        if audit_dir.name.startswith("_"):
            continue
        meta = indexing.read_meta("audit", audit_dir.name)
        if meta is None:
            continue
        card = _audit_card_meta(audit_dir.name)
        audits.append({
            "id": meta["id"],
            "name": meta["name"],
            "description": meta["description"],
            "excel_path": meta["excel_path"],
            "icon": "📄",
            **card,
        })
    return audits


def load_database_catalog() -> list[dict]:
    """Build the database catalog from var/databases/*."""
    if not DATABASES_DIR.exists():
        return []
    databases = []
    for db_dir in sorted(DATABASES_DIR.iterdir()):
        if not db_dir.is_dir():
            continue
        if db_dir.name.startswith("_"):
            continue
        meta = indexing.read_meta("database", db_dir.name)
        if meta is None:
            continue
        card = _database_card_meta(db_dir.name)
        databases.append({
            "id": meta["id"],
            "name": meta["name"],
            "description": meta["description"],
            "type": meta["type"],
            "path": meta["path"],
            **card,
        })
    return databases


def get_audit_by_id(audit_id: str) -> dict | None:
    for audit in load_audit_registry():
        if audit["id"] == audit_id:
            return audit
    return None


def get_database_catalog_xml() -> str:
    """Generate XML catalog of available databases for prompt injection."""
    databases = load_database_catalog()
    if not databases:
        return "<available_databases>\n  <!-- No databases registered -->\n</available_databases>"

    lines = ["<available_databases>"]
    for db in databases:
        lines.append("  <database>")
        lines.append(f"    <name>{db['name']}</name>")
        lines.append(f"    <description>{db['description']}</description>")
        lines.append(f"    <type>{db['type']}</type>")
        lines.append("  </database>")
    lines.append("</available_databases>")
    return "\n".join(lines)
