"""Predicate -> parameterised SQL for a grounded Dataset criterion.

The single home for the predicate->SQL semantics, so they live once and are
reused by the build-time validity ``COUNT`` and by run-time cohort scoping
(inclusion-criteria-setup.md §Grounding mechanics, §Cross-database resolution).

A Dataset criterion is **already grounded**: it names a real column and carries a
structured ``predicate`` (``op`` + typed ``value``). This module is the
deterministic, LLM-free step that turns that into a single parameterised clause —
so editing a chip's value rebinds the bind and recomposes the SQL with no model
call. The value is **always** a bind parameter, never inlined, so a stored code
can never become SQL injection.
"""

from __future__ import annotations

import re
from typing import Any

# A column reference is an optionally-qualified identifier, e.g. ``b.gestation_weeks``
# or ``gestation_weeks`` — the cohort resolver alias-qualifies it before we see it.
# Anything else (a space, a semicolon, an operator) is rejected: this module never
# accepts arbitrary SQL, only a column to compare.
_COL_REF = re.compile(r"^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?$")

# Per filter type, the comparison operators a grounded predicate may use. ``in``
# (category) and ``between`` (number/date) take a list value; the rest take a
# scalar. These mirror the database filterable surface (category / number / date —
# indexing-and-mapping.md), so a predicate can only express what a column supports.
_SCALAR_OPS = {">=", "<=", ">", "<", "="}
_OPS_BY_TYPE: dict[str, set[str]] = {
    "category": {"=", "in"},
    "number": _SCALAR_OPS | {"between"},
    "date": _SCALAR_OPS | {"between"},
}
# Number/date values live in TEXT columns in the synthetic databases; comparing
# them numerically needs an explicit CAST so "9" is not > "39" lexically. Dates are
# ISO-8601 text, which sorts correctly lexically, so they compare as-is.
_NEEDS_CAST = {"number"}


class PredicateError(ValueError):
    """A grounded predicate that cannot be compiled into a read-only SQL clause."""


def build_predicate(
    criterion: dict[str, Any], col_ref: str, *, bind: str
) -> tuple[str, dict[str, Any]]:
    """Compile one grounded criterion into ``(sql, params)``.

    ``criterion`` carries ``type`` (category/number/date) and ``predicate``
    (``{op, value}``). ``col_ref`` is the column to compare, already
    alias-qualified by the cohort resolver. ``bind`` is a unique base name for
    this criterion's bind parameters (the resolver supplies a distinct one per
    criterion so binds never collide).

    The value is always a bind parameter. Raises :class:`PredicateError` for an
    unknown type/op, a malformed value, or a ``col_ref`` that is not a bare
    (optionally qualified) column identifier.
    """
    if not isinstance(col_ref, str) or not _COL_REF.match(col_ref):
        raise PredicateError(f"col_ref is not a column identifier: {col_ref!r}")

    ftype = str(criterion.get("type") or "").strip().lower()
    allowed = _OPS_BY_TYPE.get(ftype)
    if allowed is None:
        raise PredicateError(f"unsupported filter type: {ftype!r}")

    predicate = criterion.get("predicate")
    if not isinstance(predicate, dict):
        raise PredicateError("criterion is missing its predicate object")
    op = str(predicate.get("op") or "").strip().lower()
    if op not in allowed:
        raise PredicateError(f"op {op!r} is not valid for a {ftype} filter")
    value = predicate.get("value")

    operand = f"CAST({col_ref} AS REAL)" if ftype in _NEEDS_CAST else col_ref

    if op == "in":
        items = _as_list(value)
        if not items:
            raise PredicateError("an `in` predicate needs at least one value")
        binds = [f"{bind}_{i}" for i in range(len(items))]
        sql = f"{operand} IN ({', '.join(':' + b for b in binds)})"
        return sql, {b: _coerce(v, ftype) for b, v in zip(binds, items)}

    if op == "between":
        items = _as_list(value)
        if len(items) != 2:
            raise PredicateError("a `between` predicate needs exactly two values")
        lo, hi = _coerce(items[0], ftype), _coerce(items[1], ftype)
        return (
            f"{operand} BETWEEN :{bind}_lo AND :{bind}_hi",
            {f"{bind}_lo": lo, f"{bind}_hi": hi},
        )

    # Scalar comparison (=, >=, <=, >, <).
    if isinstance(value, (list, tuple)):
        raise PredicateError(f"op {op!r} takes a single value, not a list")
    return f"{operand} {op} :{bind}", {bind: _coerce(value, ftype)}


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, (list, tuple)):
        return list(value)
    raise PredicateError("predicate value must be a list for this operator")


def _coerce(value: Any, ftype: str) -> Any:
    """Coerce a bind value to the column's storage shape. Numbers become real
    numbers (so the CAST compare is numeric); categories/dates stay as the stored
    string. ``None`` is never a valid grounded value."""
    if value is None:
        raise PredicateError("predicate value must not be null")
    if ftype == "number":
        if isinstance(value, bool):  # bool is an int subclass — never a measurement
            raise PredicateError(f"not a number: {value!r}")
        if isinstance(value, (int, float)):
            return value
        try:
            return float(str(value))
        except (TypeError, ValueError) as exc:
            raise PredicateError(f"not a number: {value!r}") from exc
    return str(value)
