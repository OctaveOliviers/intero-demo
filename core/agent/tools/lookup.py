"""lookup — structured, read-only peek into the run's precomputed AUDIT spec.

The agent has no file-read tool by design. `lookup` is the way it reads the audit
spec, and it can touch nothing else: it loads ``template/spec.json`` from the run
worktree by construction, and returns just the slice asked for — one field's
codes, the field list — so the agent never pulls the whole file to check one
thing.

`lookup` serves the AUDIT-SPEC reads ONLY. Database/schema reads (which databases
are bound, where a value lives, a table's columns/types/codes, a table's join
neighbours) moved to the read-only **navigate** tools — ``catalog_execute``,
``search_execute``, ``describe_execute``, ``join_paths_execute``. A request
carrying ``database`` or ``table`` is redirected there.

Selectors (one per call):
  {"field": "delivery"}                  -> that audit field's spec (type, codes, notes)
  {"audit": true}                        -> the audit's field list (ids + names)
"""

from __future__ import annotations

import json
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
    return _read_json(cwd / "template" / "spec.json")


_NAVIGATE_REDIRECT = (
    "database/schema reads moved to the navigate tools: "
    "`catalog_execute` (list bound databases), "
    "`search_execute` (find candidate table.columns), "
    "`join_paths_execute` (a table's join neighbours), "
    "`describe_execute` (a table's columns/types/codes). "
    '`lookup_execute` now serves only {"field": "<id>"} / {"audit": true}.'
)


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

    if database or table:
        raise ToolError(_NAVIGATE_REDIRECT)

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
            if suggestions
            else ""
        )
        raise ToolError(
            f"no field {field!r} in the audit spec.{hint} The field ids in this audit are: "
            f'{available}. Use lookup({{"audit": true}}) for the full list with names.'
        )

    if request.get("audit"):
        spec = _audit_spec(cwd)
        return {
            "ok": True,
            "fields": [
                {"id": f.get("id"), "name": f.get("name"), "type": f.get("type")}
                for f in spec.get("fields", []) or []
            ],
        }

    raise ToolError(
        "lookup needs a selector. Use one of: "
        '{"field": "<id>"} for a field\'s codes + notes, or '
        '{"audit": true} for the audit\'s field list. ' + _NAVIGATE_REDIRECT
    )


def main() -> None:
    try:
        print(
            json.dumps(
                _lookup(load_request(), Path.cwd()), ensure_ascii=False, indent=2
            )
        )
    except ToolError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        raise SystemExit(2) from None


if __name__ == "__main__":
    main()
