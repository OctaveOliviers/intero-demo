"""search — the navigate keyword grep into the bound databases' models.

The way INTO tables. A source database can hold hundreds of linked tables, so
the agent never loads a whole schema; instead it greps for where a value lives.
``search`` runs a case-insensitive substring match across ALL bound databases
over table/column **names + descriptions + code-set labels**, returning
candidate ``table.column``s. v1 is **keyword only** — no embeddings, no semantic
ranking.

It reads ``databases/<slug>.model.json`` ONLY (via ``_navigate``): it never opens
a SQLite database, runs SQL, or reads anything else, and it returns metadata —
never clinical cell values.

``search`` is collection-generic (``_navigate_collections`` / navigation.md): it
takes an optional ``collection`` and delegates the grep to it. Three collections
are registered — ``databases`` (the default, the behaviour below), ``datasets``
(the saved Datasets), and ``templates`` (the saved table templates); an unknown
collection is an actionable ToolError (exit 2) listing the valid ones.

Request:
  {"query": "<keyword>", "collection": "databases"}   ``query`` is a single
      keyword, matched case-insensitively as a substring (empty/missing ->
      ToolError); ``collection`` is optional and defaults to ``databases`` (one of
      ``databases`` / ``datasets`` / ``templates``).

Response (success):
  {
    "ok": true,
    "query": "<the query>",
    "match_count": <int>,
    "matches": [
      {"database": "<slug>", "table": "<table>", "column": "<column or null>",
       "matched_on": "table_name|table_description|column_name|"
                     "column_description|code_label",
       "context": "<the snippet that matched>"}
    ]
  }

No matches -> a clean empty result (``match_count`` 0, ``matches`` []), NOT an
error. Ordering is deterministic: databases sorted by slug; within a database,
tables then columns in model order; for one column the matched_on categories in
the order listed above — so the result is byte-stable across runs.
"""

from __future__ import annotations

import json
from pathlib import Path

from _common import ToolError, load_request, optional_string
from _navigate_collections import resolve_collection


def _search(request: dict, cwd: Path) -> dict:
    collection = resolve_collection(
        optional_string(request.get("collection"), "collection")
    )
    query = optional_string(request.get("query"), "query")
    if not query:
        raise ToolError(
            "search needs a non-empty `query` — a keyword to grep for across the "
            "collection's item names, descriptions, and code labels."
        )
    return {"ok": True, **collection.search(cwd, query)}


def main() -> None:
    try:
        print(
            json.dumps(
                _search(load_request(), Path.cwd()), ensure_ascii=False, indent=2
            )
        )
    except ToolError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        raise SystemExit(2) from None


if __name__ == "__main__":
    main()
