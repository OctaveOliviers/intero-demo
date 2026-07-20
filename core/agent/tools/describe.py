"""describe — the navigate structure-plus-meaning read.

Reads one node per batch entry, at table OR column depth (navigation.md:
``describe`` reads a node at any depth). A ``{database, table}`` entry returns the
whole table's columns; adding ``column`` makes it a LEAF path
(``{database, table, column}``) that returns just that one column — its live type,
description, and codes — for an agent that already pinpointed it via ``search``.
Each entry is qualified by its database, so one call can span databases.
``describe`` is the ONLY navigate tool that touches the live database:
column NAMES + TYPES are read LIVE from SQLite (zero drift); the code-set meanings
— and the column/table descriptions, the grain — come from ``model.json``. It
COMPOSES the two, joining the model's meaning onto the live column list by column
name (case-insensitive).

It is read-only and local-only. It opens the clinical SQLite ONLY through the
read-only helper (``_sql_runtime.attached_readonly_connection``), never writes,
never injects a cohort, and returns table STRUCTURE + meaning — never clinical
row/cell values. Each requested table name is VALIDATED against the bound
database's model (``tables[]``) before it is ever quoted into a PRAGMA, so a live
read only ever names a known identifier of our own — never raw caller input.

This tool implements the ``describe`` verb (``_navigate_collections`` /
navigation.md): it takes an optional ``collection`` and delegates the read to it.
Three collections are registered — ``databases``
(the default, the table/column behaviour below), ``datasets`` (read one Dataset:
its description + criteria/filters + scope), and ``templates`` (read a whole
template or a single field); an unknown collection is an actionable ToolError
(exit 2) listing the valid ones.

Request (a batch):
  {"tables": [{"database": "<slug>", "table": "<name>", "column": "<name>?"}, ...],
   "collection": "databases"}

  One or more ``tables`` entries; a batch may mix databases and mix table-depth and
  column-depth entries. ``column`` is OPTIONAL: present -> the entry is a LEAF path
  reading just that column; absent -> the whole table (the form below is byte
  identical to before this leaf path was added). ``collection`` is optional and
  defaults to ``databases``. Missing/empty ``tables``, or an entry missing
  ``database``/``table`` -> ToolError (a column path always needs its table — a
  database is not describable). An unknown database -> ToolError listing the bound
  databases; an unknown table -> ToolError listing that database's table names; an
  unknown ``column`` in a known table -> ToolError listing that table's live column
  names (mirrors the table-miss message).

Response (success) — a whole table (no ``column``):
  {
    "ok": true,
    "tables": [
      {
        "database": "<slug>", "table": "<name>",
        "grain": "<model grain or null>",
        "description": "<model description or null>",
        "columns": [
          {"name": "<LIVE column name>", "type": "<LIVE SQLite type>",
           "description": "<model column description or null>",
           "codes": {"<code>": "<meaning>", ...}   // omitted when the column has none
          }
        ]
      }
    ]
  }

Response (success) — a single column (a ``column`` leaf path): the same entry but
the one column inlined alongside its path, and no ``grain``/``columns``:
  {
    "ok": true,
    "tables": [
      {
        "database": "<slug>", "table": "<name>", "column": "<LIVE column name>",
        "type": "<LIVE SQLite type>",
        "description": "<model column description or null>",
        "codes": {"<code>": "<meaning>", ...}   // omitted when the column has none
      }
    ]
  }

The column list is driven by LIVE ``PRAGMA table_info`` (name + type, in
cid/definition order — deterministic). A live column with no model entry gets
``description: null`` and no ``codes``; a model column not present live is simply
not listed (live SQLite is the structural truth). Output ``tables`` preserve the
requested order — a table requested twice appears twice.
"""

from __future__ import annotations

import json
from pathlib import Path

from _common import ToolError, load_request, optional_string
from _navigate_collections import resolve_collection


def _describe(request: dict, cwd: Path) -> dict:
    collection = resolve_collection(
        optional_string(request.get("collection"), "collection")
    )
    return {"ok": True, **collection.describe(cwd, request)}


def main() -> None:
    try:
        print(
            json.dumps(
                _describe(load_request(), Path.cwd()),
                ensure_ascii=False,
                indent=2,
            )
        )
    except ToolError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        raise SystemExit(2) from None


if __name__ == "__main__":
    main()
