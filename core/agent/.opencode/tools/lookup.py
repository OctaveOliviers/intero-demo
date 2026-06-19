"""lookup — structured, read-only peek into the run's precomputed models.

The agent has no file-read tool by design. `lookup` is the ONLY way it reads the
audit spec and the database models, and it can touch nothing else: it loads the
two model files from the run worktree's ``audit/`` and ``database/`` folders by
construction, and returns just the slice asked for — one field's codes, one
table's columns — so the agent never pulls a whole file to check one thing.

Selectors (one per call):
  {"field": "delivery"}                  -> that audit field's spec (type, codes, notes)
  {"audit": true}                        -> the audit's field list (ids + names)
  {"database": "cord-ph"}                -> that database's digest: per-table grain +
                                           row counts, the foreign-key/identity graph,
                                           and conventions
  {"database": "cord-ph", "table": "t"}  -> that table's columns
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from _common import ToolError, load_request, optional_string


def _read_json(path: Path) -> dict:
    if not path.is_file():
        raise ToolError(f"model not found: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise ToolError(f"model is unreadable: {path}: {exc}") from exc


def _audit_spec(cwd: Path) -> dict:
    return _read_json(cwd / "audit" / "spec.json")


def _database_model(cwd: Path, slug: str) -> dict:
    return _read_json(cwd / "database" / f"{slug}.model.json")


def _suggest_field_ids(field: str, available: list) -> list:
    """Closest canonical field ids for a miss — suggestion only, never a resolve.

    Audit field ids are canonical slugs like ``patient-details/ethnic_category``;
    the agent often tries the short tail (``ethnic_category``). Match on the slug:
    an exact tail match (segment after the last ``/``) first, then any substring
    match. Stay STRICT — we only point at the canonical id, never substitute it.
    """
    needle = (field or "").strip().lower()
    if not needle:
        return []
    ids = [i for i in available if isinstance(i, str)]
    tail = [i for i in ids if i.rsplit("/", 1)[-1].lower() == needle]
    if tail:
        return tail
    sub = [i for i in ids if needle in i.lower() or i.lower() in needle]
    return sub[:3]


def _lookup(request: dict, cwd: Path) -> dict:
    field = optional_string(request.get("field"), "field")
    database = optional_string(request.get("database"), "database")
    table = optional_string(request.get("table"), "table")

    if field:
        spec = _audit_spec(cwd)
        for f in spec.get("fields", []) or []:
            if f.get("id") == field:
                return {"ok": True, "field": f}
        available = [f.get("id") for f in spec.get("fields", []) or []]
        suggestions = _suggest_field_ids(field, available)
        hint = (
            f" Did you mean: {suggestions}? Field ids are canonical slugs "
            f"(e.g. 'patient-details/ethnic_category') — use the full id, not a short name."
            if suggestions else ""
        )
        raise ToolError(
            f"no field {field!r} in the audit spec.{hint} The field ids in this audit are: "
            f"{available}. Use lookup({{\"audit\": true}}) for the full list with names."
        )

    if request.get("audit"):
        spec = _audit_spec(cwd)
        return {"ok": True, "fields": [
            {"id": f.get("id"), "name": f.get("name"), "type": f.get("type")}
            for f in spec.get("fields", []) or []
        ]}

    if database:
        model = _database_model(cwd, database)
        tables = model.get("tables", []) or []
        if table:
            for t in tables:
                if t.get("name") == table:
                    return {"ok": True, "table": t}
            names = [t.get("name") for t in tables]
            raise ToolError(
                f"no table {table!r} in database {database!r}. The tables here are: {names}."
            )
        # The database digest: per-table grain + row counts plus the join graph
        # (foreign_keys within this DB, identity_links to siblings) and any
        # database-wide conventions. This is how the agent learns which join to
        # write to reach a column in a non-anchor table — never guessed from names.
        return {
            "ok": True,
            "database": database,
            "tables": [
                {"name": t.get("name"), "grain": t.get("grain"),
                 "row_count": t.get("row_count")}
                for t in tables
            ],
            "foreign_keys": model.get("foreign_keys", []),
            "identity_links": model.get("identity_links", []),
            "conventions": model.get("conventions", {}),
        }

    raise ToolError(
        "lookup needs a selector. Use one of: "
        "{\"field\": \"<id>\"} for a field's codes + notes, "
        "{\"audit\": true} for the audit's field list, "
        "{\"database\": \"<name>\"} for the database digest (per-table grain + row "
        "counts, the foreign-key/identity graph, and conventions), or "
        "{\"database\": \"<name>\", \"table\": \"<name>\"} for a table's columns."
    )


def main() -> None:
    try:
        print(json.dumps(_lookup(load_request(), Path.cwd()), ensure_ascii=False, indent=2))
    except ToolError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        raise SystemExit(2) from None


if __name__ == "__main__":
    main()
