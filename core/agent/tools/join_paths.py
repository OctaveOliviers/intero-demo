"""join_paths — from a given table, every table one hop away (the join graph).

The fourth navigate tool (*follow edges* — the file-tree analogy). From a
table T in database D it returns the FULL neighbour set: every table reachable
in a single hop, so the agent can then ``describe`` the one(s) it wants.
Neighbours come from two MEASURED sources, never guessed from column names:

  - within-database FOREIGN KEYS (``model.json`` ``foreign_keys``), and
  - cross-database measured IDENTITY LINKS (``model.json`` ``identity_links``).

The join graph is DERIVED from each model's edges — it is not a separate
artifact. This tool reads ``model.json`` ONLY: it never opens a SQLite database,
runs SQL, touches the network, or writes anything. It returns graph metadata,
never clinical values.

Request (one shape):
  {"database": "<slug>", "table": "<table name>"}   -> the neighbours of that table

Response (success):
  {
    "ok": true,
    "database": "<slug>", "table": "<name>",
    "neighbours": [
      {
        "database": "<neighbour db slug>",
        "table": "<neighbour table>",
        "via": "foreign_key" | "identity_link",
        "from_column": "<column on the GIVEN table to join on>",
        "to_column": "<column on the NEIGHBOUR table to join on>",
        "cardinality": "to-one" | "to-many",  // foreign_key only
        "declared": true | false,              // foreign_key only
        "evidence": "<measurement string>"     // present when the model carries it
      },
      ...
    ]
  }

The full neighbour set of T in D:
  - WITHIN-DB foreign keys (D's model only). For each FK edge, if its CHILD table
    (the ``column`` table) is T -> an OUTGOING neighbour, the parent table
    (``from_column`` = T's FK col, ``to_column`` = parent key col); if its PARENT
    table (the ``target`` table) is T -> an INCOMING neighbour, the child table
    (``from_column`` = T's key col, ``to_column`` = child FK col). Both directions
    are returned — the agent can join either way. Carries ``cardinality`` +
    ``declared`` (+ ``evidence`` when present). Neighbour ``database`` = D.
  - CROSS-DB identity links (scan ALL bound models, since a link is stored on the
    SOURCE side only). If a link's ``column`` table is T and lives in D -> an
    OUTGOING neighbour (the link's target db+table). If any SIBLING database's link
    ``target`` points at "<D> -> <T>.<col>" -> an INCOMING neighbour (that sibling's
    source table). Carries ``evidence``.

Order is deterministic (byte-stable): sorted by
``(via, neighbour database, neighbour table, from_column, to_column)``. A table
with no neighbours returns ``{"ok": true, ..., "neighbours": []}`` — clean, not an
error. Unknown database/table -> ``ToolError`` listing the valid names.
"""

from __future__ import annotations

import json
from pathlib import Path

from _common import ToolError, load_request, require_string
from _navigate import bound_databases


def _split_qualified(value: str) -> tuple[str, str]:
    """Split a "<table>.<column>" reference into (table, column).

    Mirrors how the model stores ``foreign_keys`` columns/targets and the local
    side of an ``identity_links`` column. Only the FIRST dot separates table from
    column; a malformed value raises ToolError so a bad model surfaces loudly
    rather than producing a silently-wrong neighbour.
    """
    if not isinstance(value, str):
        raise ToolError(f"malformed table.column reference in model: {value!r}")
    table, sep, column = value.partition(".")
    if not sep or not table or not column:
        raise ToolError(f"malformed table.column reference in model: {value!r}")
    return table, column


def _split_identity_target(target: str) -> tuple[str, str, str]:
    """Split an identity-link target "<db> -> <table>.<column>" into its parts."""
    if not isinstance(target, str):
        raise ToolError(f"malformed identity_link target in model: {target!r}")
    db_part, sep, ref = target.partition("->")
    if not sep:
        raise ToolError(f"malformed identity_link target in model: {target!r}")
    db = db_part.strip()
    table, column = _split_qualified(ref.strip())
    if not db:
        raise ToolError(f"malformed identity_link target in model: {target!r}")
    return db, table, column


def _table_names(model: dict) -> list:
    return [t.get("name") for t in (model.get("tables") or []) if isinstance(t, dict)]


def _fk_neighbours(database: str, table: str, model: dict) -> list[dict]:
    """Within-database FK neighbours of ``table`` (both directions)."""
    neighbours: list[dict] = []
    for fk in model.get("foreign_keys") or []:
        if not isinstance(fk, dict):
            continue
        child_table, child_col = _split_qualified(fk.get("column"))
        parent_table, parent_col = _split_qualified(fk.get("target"))
        edge = {
            "database": database,
            "via": "foreign_key",
            "cardinality": fk.get("cardinality"),
            "declared": fk.get("declared"),
        }
        if "evidence" in fk:
            edge["evidence"] = fk["evidence"]
        if child_table == table:
            # T is the child: outgoing to the parent table.
            neighbours.append(
                {
                    **edge,
                    "table": parent_table,
                    "from_column": child_col,
                    "to_column": parent_col,
                }
            )
        if parent_table == table:
            # T is the parent: incoming from the child table.
            neighbours.append(
                {
                    **edge,
                    "table": child_table,
                    "from_column": parent_col,
                    "to_column": child_col,
                }
            )
    return neighbours


def _identity_neighbours(
    database: str, table: str, models: dict[str, dict]
) -> list[dict]:
    """Cross-database identity-link neighbours of ``table`` (both directions)."""
    neighbours: list[dict] = []
    for slug, model in models.items():
        for link in model.get("identity_links") or []:
            if not isinstance(link, dict):
                continue
            src_table, src_col = _split_qualified(link.get("column"))
            tgt_db, tgt_table, tgt_col = _split_identity_target(link.get("target"))
            edge = {"via": "identity_link"}
            if "evidence" in link:
                edge["evidence"] = link["evidence"]
            # Outgoing: a link stored on THIS database whose source table is T.
            if slug == database and src_table == table:
                neighbours.append(
                    {
                        **edge,
                        "database": tgt_db,
                        "table": tgt_table,
                        "from_column": src_col,
                        "to_column": tgt_col,
                    }
                )
            # Incoming: a sibling's link whose target points back at <D>.<T>.
            if tgt_db == database and tgt_table == table:
                neighbours.append(
                    {
                        **edge,
                        "database": slug,
                        "table": src_table,
                        "from_column": tgt_col,
                        "to_column": src_col,
                    }
                )
    return neighbours


def _sort_key(n: dict) -> tuple:
    return (n["via"], n["database"], n["table"], n["from_column"], n["to_column"])


# The neighbour-dict key order, so the serialized output reads consistently
# (the LIST order — sorted by _sort_key — is what makes the response byte-stable).
_KEY_ORDER = (
    "database",
    "table",
    "via",
    "from_column",
    "to_column",
    "cardinality",
    "declared",
    "evidence",
)


def _ordered(n: dict) -> dict:
    return {k: n[k] for k in _KEY_ORDER if k in n}


def _join_paths(request: dict, cwd: Path) -> dict:
    database = require_string(request, "database")
    table = require_string(request, "table")

    models = dict(bound_databases(cwd))
    if database not in models:
        raise ToolError(
            f"no database {database!r} bound for this run. "
            f"The bound databases are: {sorted(models)}."
        )
    names = _table_names(models[database])
    if table not in names:
        raise ToolError(
            f"no table {table!r} in database {database!r}. The tables here are: {names}."
        )

    neighbours = _fk_neighbours(database, table, models[database])
    neighbours += _identity_neighbours(database, table, models)

    # Dedupe identical edges (e.g. a reciprocally-stored identity link surfaces
    # both as this DB's outgoing link and the sibling's incoming link), then sort
    # for a byte-stable order.
    seen: set[tuple] = set()
    unique: list[dict] = []
    for n in neighbours:
        marker = tuple(sorted(n.items()))
        if marker in seen:
            continue
        seen.add(marker)
        unique.append(n)
    unique.sort(key=_sort_key)

    return {
        "ok": True,
        "database": database,
        "table": table,
        "neighbours": [_ordered(n) for n in unique],
    }


def main() -> None:
    try:
        print(
            json.dumps(
                _join_paths(load_request(), Path.cwd()), ensure_ascii=False, indent=2
            )
        )
    except ToolError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        raise SystemExit(2) from None


if __name__ == "__main__":
    main()
