"""cite_execute — record one chat-answer citation with a backend-owned marker."""

from __future__ import annotations

import json
from pathlib import Path

from _common import ToolError, load_request, require_string
from _run_sql import (
    is_select,
    load_context,
    parse,
    references_sqlite_catalog,
    reject_multiple_statements,
)

_CITATIONS_FILE = "citations.json"


def _chat_databases(cwd: Path) -> set[str]:
    context = load_context(cwd)
    if context.get("mode") != "chat":
        raise ToolError(
            "cite_execute can only run in a chat worktree (context mode must be "
            "`chat`)."
        )
    databases = context.get("databases")
    if not isinstance(databases, dict) or not databases:
        raise ToolError("cite_execute has no registered clinical databases to cite.")
    return set(databases)


def _validate_source_citation(raw: object, index: int, databases: set[str]) -> dict:
    if not isinstance(raw, dict):
        raise ToolError(f"citation {index} must be an object.")
    database = require_string(raw, "database")
    if database not in databases:
        available = sorted(databases)
        raise ToolError(
            f"citation {index}: unknown database {database!r}. Citations must cite "
            f"one of the registered chat databases: {available}."
        )
    query = require_string(raw, "query")
    table_column = require_string(raw, "table_column")
    reject_multiple_statements(query)
    tree = parse(query)
    if not is_select(tree):
        raise ToolError(
            f"citation {index}: its `query` must be a SELECT that re-extracts the "
            f"cited value (you passed {type(tree).__name__}). A citation reads the "
            f"record the claim rests on; it never writes."
        )
    if references_sqlite_catalog(tree):
        raise ToolError(
            f"citation {index}: citation queries may not read SQLite catalog/schema "
            "tables. Use the navigate tools to find tables; cite clinical data rows "
            "or aggregates, not schema dumps."
        )
    citation: dict = {
        "kind": "source",
        "database": database,
        "query": query,
        "table_column": table_column,
        "explanation": str(raw.get("explanation") or ""),
    }
    for key in ("row_id", "row_key"):
        if raw.get(key) is not None:
            citation[key] = raw[key]
    if isinstance(raw.get("citations"), list):
        citation["citations"] = [str(c) for c in raw["citations"]]
    return citation


def _validate_citation(raw: object, index: int, databases: set[str]) -> dict:
    citation = _validate_source_citation(raw, index, databases)
    kind = str(raw.get("kind") or "source") if isinstance(raw, dict) else "source"
    if kind not in ("source", "aggregate"):
        raise ToolError(f"citation {index}: unknown kind {kind!r}.")
    citation["kind"] = kind
    if kind != "aggregate":
        return citation

    denominator = raw.get("denominator")
    completeness = raw.get("completeness")
    covered_rows = raw.get("covered_rows")
    if denominator is None:
        raise ToolError(f"citation {index}: aggregate citations require `denominator`.")
    if completeness is None:
        raise ToolError(
            f"citation {index}: aggregate citations require `completeness`."
        )
    if not isinstance(covered_rows, list) or not covered_rows:
        raise ToolError(
            f"citation {index}: aggregate citations require non-empty `covered_rows`."
        )
    citation["denominator"] = denominator
    citation["completeness"] = completeness
    citation["covered_rows"] = [
        _validate_source_citation(row, index, databases) for row in covered_rows
    ]
    return citation


def _read_citations(cwd: Path) -> list[dict]:
    path = cwd / _CITATIONS_FILE
    if not path.is_file():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ToolError(f"recorded citations are unreadable: {exc}") from exc
    if not isinstance(payload, list):
        raise ToolError("recorded citations must be a list.")
    return [dict(item) for item in payload if isinstance(item, dict)]


def _record_citation(request: dict, cwd: Path) -> dict:
    citations = _read_citations(cwd)
    raw = dict(request)
    citation = _validate_citation(raw, len(citations), _chat_databases(cwd))
    citation["marker"] = str(len(citations) + 1)
    citations.append(citation)
    (cwd / _CITATIONS_FILE).write_text(
        json.dumps(citations, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {"ok": True, "marker": citation["marker"], "citation": citation}


def main() -> None:
    try:
        result = _record_citation(load_request(), Path.cwd())
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except ToolError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        raise SystemExit(2) from None


if __name__ == "__main__":
    main()
