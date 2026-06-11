from __future__ import annotations

import sqlglot
from sqlglot import exp

from _common import ToolError

ALLOWED_ROOT = {exp.Select, exp.Union, exp.Intersect, exp.Except}

FORBIDDEN = {
    exp.Insert,
    exp.Update,
    exp.Delete,
    exp.Create,
    exp.Alter,
    exp.Drop,
    exp.Attach,
    exp.Detach,
    exp.Transaction,
    exp.Commit,
    exp.Rollback,
    exp.Pragma,
    exp.Command,
}

ALLOWED_FUNCTIONS = frozenset({
    "count",
    "sum",
    "avg",
    "min",
    "max",
    "total",
    "group_concat",
    "length",
    "substr",
    "instr",
    "replace",
    "trim",
    "ltrim",
    "rtrim",
    "upper",
    "lower",
    "abs",
    "round",
    "floor",
    "ceil",
    "coalesce",
    "ifnull",
    "nullif",
    "strftime",
    "date",
    "time",
    "datetime",
    "julianday",
    "hex",
    "typeof",
    "last_insert_rowid",
    "changes",
    "json_extract",
    "json_object",
    "json_array",
    "json_type",
    "json_valid",
})


def validate_sql(sql: str) -> None:
    stripped = sql.strip().lower()
    if stripped.startswith("pragma"):
        raise ToolError("PRAGMA not allowed")

    try:
        tree = sqlglot.parse_one(sql, read="sqlite")
    except sqlglot.errors.ParseError as e:
        raise ToolError(f"SQL parse error: {e}") from e

    if tree is None:
        raise ToolError("Failed to parse SQL")

    if type(tree) not in ALLOWED_ROOT:
        raise ToolError(f"Only SELECT queries are allowed, got: {type(tree).__name__}")

    for node in tree.walk():
        if type(node) in FORBIDDEN:
            raise ToolError(f"Forbidden SQL construct: {type(node).__name__}")

    for func_node in tree.find_all(exp.Anonymous):
        name = (func_node.name or "").lower()
        if name and name not in ALLOWED_FUNCTIONS:
            raise ToolError(f"Function not allowed: {name}")