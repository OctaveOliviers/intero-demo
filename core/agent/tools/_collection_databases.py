"""The ``databases`` collection — navigation over the bound clinical databases.

The one collection v1 implements (``_navigate_collections``): ``catalog`` lists the bound
databases, ``search`` greps their models, ``describe`` reads one table. The logic
is exactly what the four navigate tools shipped — it lives behind the
``Collection`` interface now so the verbs are collection-generic, and a future
``datasets``/``templates`` collection is a sibling file, not a tool change.

Reads ``databases/<slug>.model.json`` (via ``_navigate``); ``describe`` also reads
live SQLite column names + types (read-only) and composes the model's meaning
onto them. Read-only, local-only, metadata only — never clinical cell values.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from _common import (
    ToolError,
    optional_string,
    require_list,
    require_object,
    require_string_value,
)
from _navigate import bound_databases
from _sql_runtime import attached_readonly_connection


def _column_matches(column: dict, needle: str) -> list[tuple[str, str]]:
    """The (matched_on, context) hits for one column, in category order."""
    hits: list[tuple[str, str]] = []

    name = column.get("name")
    if isinstance(name, str) and needle in name.lower():
        hits.append(("column_name", name))

    description = column.get("description")
    if isinstance(description, str) and needle in description.lower():
        hits.append(("column_description", description))

    # A code label hit emits ONE entry; join every matching "key: value" pair.
    codes = column.get("codes")
    if isinstance(codes, dict):
        labels = [
            f"{key}: {value}"
            for key, value in codes.items()
            if needle in str(key).lower() or needle in str(value).lower()
        ]
        if labels:
            hits.append(("code_label", "; ".join(labels)))

    return hits


def _summary(model: dict) -> str | None:
    """The model's one-line ``summary``, with the description-first-sentence fallback."""
    summary = model.get("summary")
    if isinstance(summary, str) and summary.strip():
        return summary

    description = model.get("description")
    if isinstance(description, str) and description.strip():
        return description.split(". ", 1)[0]

    return None


def _model_table(model: dict, table: str) -> dict | None:
    """The model record for ``table`` (exact name), or None."""
    for record in model.get("tables") or []:
        if isinstance(record, dict) and record.get("name") == table:
            return record
    return None


def _model_columns_by_name(model_table: dict) -> dict[str, dict]:
    """The model's columns keyed by lowercased name — meaning is joined to live
    columns case-insensitively by name."""
    by_name: dict[str, dict] = {}
    for column in model_table.get("columns") or []:
        if isinstance(column, dict) and isinstance(column.get("name"), str):
            by_name[column["name"].lower()] = column
    return by_name


def _live_columns(
    sqlite_path: Path, database: str, table: str
) -> list[tuple[str, str]]:
    """The (name, type) of each column, LIVE from SQLite, in definition order.

    Read read-only through ``attached_readonly_connection`` (mode=ro,
    ``query_only``, read-only authorizer). ``table`` is a name we already
    validated against the model, so quoting it into the PRAGMA is safe — still
    quote it (double any embedded quote) so it is read as an identifier.

    The model and the live ``.sqlite`` are provisioned independently, so the table
    can validate against the model while the DB file is missing or corrupt. Any
    SQLite failure here is re-raised as a ``ToolError`` so the agent gets the
    ``{"ok": false, "error": …}`` contract — never a raw traceback."""
    quoted = table.replace('"', '""')
    try:
        conn = attached_readonly_connection(sqlite_path, {})
        try:
            rows = conn.execute(f'PRAGMA table_info("{quoted}")').fetchall()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        raise ToolError(
            f"cannot read the live structure of table {table!r} in database "
            f"{database!r}: {exc}"
        ) from exc
    return [(row["name"], row["type"]) for row in rows]


def _compose_column(name: str, type_: str, meaning: dict[str, dict]) -> dict:
    """One column's ``{name, type, description, codes?}`` — live type, model meaning
    joined by name (case-insensitive); ``codes`` omitted when the column has none."""
    model_column = meaning.get(name.lower(), {})
    column = {
        "name": name,
        "type": type_,
        "description": model_column.get("description"),
    }
    codes = model_column.get("codes")
    if codes:
        column["codes"] = codes
    return column


def _describe_one(entry: dict, models: dict[str, dict], cwd: Path) -> dict:
    database = require_string_value(entry.get("database"), "database")
    table = require_string_value(entry.get("table"), "table")
    column = optional_string(entry.get("column"), "column")

    model = models.get(database)
    if model is None:
        raise ToolError(
            f"no bound database {database!r}. The databases available to you are: "
            f"{sorted(models)}. Use describe only with a bound database."
        )
    model_table = _model_table(model, table)
    if model_table is None:
        names = [
            t.get("name") for t in (model.get("tables") or []) if isinstance(t, dict)
        ]
        raise ToolError(
            f"no table {table!r} in database {database!r}. The tables here are: {names}."
        )

    meaning = _model_columns_by_name(model_table)
    sqlite_path = cwd / "databases" / f"{database}.sqlite"
    live = _live_columns(sqlite_path, database, table)

    if column is not None:
        for name, type_ in live:
            if name.lower() == column.lower():
                # The column is located by `column` (the live name); the remaining
                # value fields are its `type`/`description`/`codes?` — the column's
                # own `name` would only duplicate `column`, so it is dropped.
                value_fields = _compose_column(name, type_, meaning)
                value_fields.pop("name")
                return {
                    "database": database,
                    "table": table,
                    "column": name,
                    **value_fields,
                }
        names = [name for name, _ in live]
        raise ToolError(
            f"no column {column!r} in table {table!r} of database {database!r}. "
            f"The columns here are: {names}."
        )

    return {
        "database": database,
        "table": table,
        "grain": model_table.get("grain"),
        "description": model_table.get("description"),
        "columns": [_compose_column(name, type_, meaning) for name, type_ in live],
    }


class DatabasesCollection:
    """The bound clinical databases as a navigable collection."""

    name = "databases"

    def catalog(self, cwd: Path) -> dict:
        databases = [
            {
                "database": slug,
                "title": model.get("title"),
                "summary": _summary(model),
            }
            for slug, model in bound_databases(cwd)
        ]
        return {"databases": databases}

    def search(self, cwd: Path, query: str) -> dict:
        needle = query.lower()
        matches: list[dict] = []
        for slug, model in bound_databases(cwd):
            for table in model.get("tables") or []:
                if not isinstance(table, dict):
                    continue
                table_name = table.get("name")

                if isinstance(table_name, str) and needle in table_name.lower():
                    matches.append(
                        {
                            "database": slug,
                            "table": table_name,
                            "column": None,
                            "matched_on": "table_name",
                            "context": table_name,
                        }
                    )
                table_description = table.get("description")
                if (
                    isinstance(table_description, str)
                    and needle in table_description.lower()
                ):
                    matches.append(
                        {
                            "database": slug,
                            "table": table_name,
                            "column": None,
                            "matched_on": "table_description",
                            "context": table_description,
                        }
                    )

                for column in table.get("columns") or []:
                    if not isinstance(column, dict):
                        continue
                    for matched_on, context in _column_matches(column, needle):
                        matches.append(
                            {
                                "database": slug,
                                "table": table_name,
                                "column": column.get("name"),
                                "matched_on": matched_on,
                                "context": context,
                            }
                        )

        return {"query": query, "match_count": len(matches), "matches": matches}

    def describe(self, cwd: Path, request: dict) -> dict:
        entries = require_list(request.get("tables"), "tables")
        if not entries:
            raise ToolError(
                "describe needs a non-empty `tables` batch — a list of "
                '{"database": "<slug>", "table": "<name>"} entries to describe.'
            )
        models = dict(bound_databases(cwd))
        described = [
            _describe_one(require_object(entry, "tables[] entry"), models, cwd)
            for entry in entries
        ]
        return {"tables": described}
