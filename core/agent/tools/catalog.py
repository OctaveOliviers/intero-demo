"""catalog — the navigate `ls` of the bound databases.

The entry point when the agent doesn't yet know which database holds what. It
lists the **bound databases**, each with its one-line ``summary``, sorted by
slug. It is the top-level listing in the file-tree analogy: a cheap orientation
before the agent ``search``es for where a value lives.

It **NEVER lists tables** — a database can hold hundreds, so loading them is
both impossible and pointless here; ``search`` is the way into tables. It reads
``databases/<slug>.model.json`` ONLY (via ``_navigate``): it never opens a SQLite
database, runs SQL, or reads anything else, and it returns metadata only.

``catalog`` is collection-generic (``_navigate_collections`` / navigation.md): it takes an
optional ``collection`` and delegates to it, carrying no collection-specific
logic. Three collections are registered — ``databases`` (the default, the
behaviour below), ``datasets`` (the saved Datasets), and ``templates`` (the saved
table templates); an unknown collection is an actionable error listing the valid
ones.

Request:
  {"collection": "databases"}   optional — defaults to ``databases``; one of
                                ``databases`` / ``datasets`` / ``templates``. An
                                unknown value is a ToolError (exit 2). Unknown keys
                                are ignored. It lists every item of the collection.

Response (success):
  {
    "ok": true,
    "databases": [
      {"database": "<slug>", "title": "<model title or null>",
       "summary": "<one-line summary or null>"}
    ]
  }

One entry per bound database (``databases/<slug>.model.json``), sorted by slug
(deterministic — ``bound_databases`` already sorts). ``summary`` is the model's
``summary`` field; when it is absent/empty it falls back to the first sentence
of ``description`` (the documented UI fallback — split on the first ". "), and
to ``null`` when ``description`` is also absent. NEVER a ``tables`` key.

No bound databases -> a clean empty list ({"databases": []}), NOT an error.
"""

from __future__ import annotations

import json
from pathlib import Path

from _common import ToolError, load_request, optional_string
from _navigate_collections import resolve_collection


def _catalog(request: dict, cwd: Path) -> dict:
    collection = resolve_collection(
        optional_string(request.get("collection"), "collection")
    )
    return {"ok": True, **collection.catalog(cwd)}


def main() -> None:
    try:
        print(
            json.dumps(
                _catalog(load_request(), Path.cwd()), ensure_ascii=False, indent=2
            )
        )
    except ToolError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        raise SystemExit(2) from None


if __name__ == "__main__":
    main()
