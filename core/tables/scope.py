"""Translate a pinned Dataset's grounded ``criteria`` into table-population
runtime-filter dict (decision 0004 — scope binds to the table, fixed for life).

A table pinned to a named Dataset must populate over EXACTLY that Dataset's hard
cohort. Table population enforces a cohort from a ``{criterion_id: value}`` filters
dict — ``core.filters.cohort.resolve_runtime_filter_predicates``
parses each value string BY TYPE into a WHERE clause + binds.
This module is the deterministic, no-LLM bridge from a criterion's ``type`` +
``predicate.{op, value}`` to exactly the value-string formats that parser accepts.

**FAIL-CLOSED — never silently broaden.** Decision 0004 requires the table to equal
the cohort EXACTLY, so a criterion the value-string format cannot faithfully encode
must NOT be dropped: dropping a filter makes the cohort BROADER (the wrong
patients). Such a criterion raises :class:`TableScopeError`, which fails the table
spawn loudly rather than producing a silently-wrong cohort. This mirrors table
population itself, which RAISES on a filter it cannot bind
(``resolve_runtime_filter_predicates`` accumulates ``unresolved`` and raises
``ValueError`` → the population fails safely rather than reading a broader cohort).

The parser's accepted value-string formats (read verbatim from table_populations.py):
- **category** — the parser splits the value on ``[,\\|]``; one value → ``col = :bind``,
  many → ``col IN (...)``. So ``=`` → the bare value, ``in`` → a comma-joined list.
  A category value that itself CONTAINS ``,`` or ``|`` cannot round-trip to an exact
  match (it would be read as OR'd values) → raises.
- **number** (``_number_clause``) — ``"<op><value>"`` for ``>=``/``<=``/``>``/``<``/``=``,
  and ``"<lo> to <hi>"`` for ``between``.
- **date** (``_date_clause``) — ``"<op><date>"`` scalar, ``"<from> to <to>"`` range.
  ``in`` has no faithful value-string form for number/date → raises (rather than
  silently widening the cohort).

KNOWN LIMITATION (documented, not silent): table population re-grounds each filter from
the AUDIT's mapping, so the WHERE clause it uses is the audit's grounding of
that column — not the Dataset's stored ``criterion.sql`` (e.g. the Dataset's
``CAST(... AS REAL) >= 39`` vs an audit grounding of ``col >= 39``). For a
Dataset+audit PAIR on the same data these groundings agree; a future lossless path
would bind the Dataset's own ``sql``/``params`` directly via
``_resolve_cohort(runtime_where=...)`` instead of re-encoding strings.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

# The comparison ops whose value-string is "<op><value>" for both number and date.
_SCALAR_OPS = {">=", "<=", ">", "<", "="}
# A category value containing one of these cannot round-trip: the parser splits
# every category value on this set, turning a single literal into OR'd values.
_CATEGORY_DELIMS = (",", "|")
# A single clean numeric literal — exactly what the ``_number_clause``
# ``direct`` (anchored ``^(op)\s*(-?\d+(?:\.\d+)?)\s*$``) regex accepts as a SCALAR.
# Anything else (a hyphen/range, a second number, a trailing token) is re-parsed by
# the ``between`` search into ``BETWEEN`` — silently widening the cohort.
_NUMBER_LITERAL = re.compile(r"-?\d+(?:\.\d+)?$")


def _date_to_iso(raw: str) -> str | None:
    """Parse one date literal to ``YYYY-MM-DD`` (or ``None`` if it is not a single
    date). This is the canonical set of date formats table population accepts for a
    scalar date filter — it lives here in ``core`` so both this scope bridge (which
    validates a Dataset criterion fails closed) and ``server.routes.table_populations``
    (which parses the runtime clause) read ONE source of truth, with no core→server edge."""
    text = raw.strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text).isoformat()
    except ValueError:
        pass
    try:
        return datetime.fromisoformat(text).date().isoformat()
    except ValueError:
        pass
    for fmt in ("%d %b %Y", "%d %B %Y", "%Y/%m/%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return None


class TableScopeError(ValueError):
    """A pinned Dataset criterion cannot be faithfully encoded as a filter, so the
    table cannot be scoped EXACTLY to its cohort. Raised (fail-closed) rather than
    silently producing a broader cohort (decision 0004)."""


def _scalar(value: Any) -> str | None:
    """Render a predicate scalar as a plain string, or ``None`` for a list/null."""
    if value is None or isinstance(value, (list, tuple, dict)):
        return None
    if isinstance(value, bool):  # guard: bool is an int subclass
        return None
    s = str(value).strip()
    return s or None


def _number_scalar(value: Any) -> str:
    """A single clean numeric literal table population reads as an EXACT scalar. Strips a
    leading ``+`` (which table population's ``-?\\d+`` regex rejects, silently flipping the
    op to ``=``), then rejects anything that is not one literal — a hyphen/range, a
    second number, or a trailing token would be re-parsed by table population's ``between``
    search into ``BETWEEN`` (a broader cohort), so it raises (fail-closed)."""
    s = _scalar(value)
    if s is None:
        raise TableScopeError("missing scalar value")
    s = s[1:] if s.startswith("+") else s
    if not _NUMBER_LITERAL.match(s):
        raise TableScopeError(
            f"number scalar value {s!r} is not a single numeric literal (a range or "
            "extra token would be re-read as 'between', widening the cohort)"
        )
    return s


def _date_scalar(value: Any) -> str:
    """A single date literal table population reads as an EXACT scalar. Rejects anything the
    parser's ``_date_to_iso`` cannot parse as ONE date — a range (``"a to b"``) or a
    trailing token would leave table population's scalar clause unresolved (and a future
    parser change could re-read it as a range), so it raises (fail-closed)."""
    s = _scalar(value)
    if s is None:
        raise TableScopeError("missing scalar value")
    if _date_to_iso(s) is None:
        raise TableScopeError(
            f"date scalar value {s!r} is not a single date literal (a range or extra "
            "token has no faithful scalar form)"
        )
    return s


def _category_token(value: Any) -> str:
    """A single category literal, rejected if it carries a list delimiter (which
    table population would split into multiple OR'd values — a broader cohort)."""
    s = _scalar(value)
    if s is None:
        raise TableScopeError("empty category value")
    if any(d in s for d in _CATEGORY_DELIMS):
        raise TableScopeError(
            f"category value {s!r} contains ',' or '|' and cannot round-trip to an "
            "exact match"
        )
    return s


def _pair(value: Any) -> tuple[str, str]:
    """Render a ``[lo, hi]`` predicate value as a string pair (raises otherwise)."""
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise TableScopeError("'between' needs a [lo, hi] pair")
    lo, hi = _scalar(value[0]), _scalar(value[1])
    if lo is None or hi is None:
        raise TableScopeError("'between' bounds must be scalars")
    return lo, hi


def _filter_string(ftype: str, op: str, value: Any) -> str:
    """Map one criterion's ``type`` + ``predicate.{op, value}`` to the value-string
    the table-population resolver accepts. Raises :class:`TableScopeError` for any
    shape that cannot be faithfully encoded (never silently broadens)."""
    if ftype == "category":
        if op == "in":
            if not isinstance(value, (list, tuple)) or not value:
                raise TableScopeError("category 'in' needs a non-empty list")
            return ",".join(_category_token(v) for v in value)
        if op == "=":
            return _category_token(value)
        raise TableScopeError(f"category op {op!r} is not supported")
    if ftype in ("number", "date"):
        if op == "between":
            lo, hi = _pair(value)
            return f"{lo} to {hi}"
        if op in _SCALAR_OPS:
            scalar = _number_scalar(value) if ftype == "number" else _date_scalar(value)
            return f"{op}{scalar}"
        raise TableScopeError(
            f"{ftype} op {op!r} has no faithful filter form (e.g. 'in')"
        )
    raise TableScopeError(f"unsupported criterion type {ftype!r}")


def dataset_criteria_to_filters(criteria: list[dict[str, Any]]) -> dict[str, str]:
    """Translate a Dataset's ``criteria`` into table-population
    ``{criterion_id: value_string}`` filters dict (deterministic, no LLM).

    Every criterion becomes one entry keyed by its ``criterion_id``. FAIL-CLOSED: a
    criterion whose ``type``/``op``/``value`` cannot be faithfully encoded raises
    :class:`TableScopeError` (the caller surfaces it as a spawn failure) rather than
    being dropped — dropping would scope the table to a BROADER cohort than the
    pinned Dataset, the exact thing decision 0004 forbids. The emitted strings
    round-trip through ``resolve_runtime_filter_predicates`` to the pinned cohort's
    WHERE clauses.
    """
    filters: dict[str, str] = {}
    for crit in criteria or []:
        if not isinstance(crit, dict):
            raise TableScopeError("malformed criterion (not an object)")
        criterion_id = str(crit.get("criterion_id") or "").strip()
        ftype = str(crit.get("type") or "").strip().lower()
        predicate = crit.get("predicate")
        if not criterion_id or not isinstance(predicate, dict):
            raise TableScopeError(
                f"criterion {criterion_id or '<missing id>'!r} has no usable predicate"
            )
        op = str(predicate.get("op") or "").strip().lower()
        try:
            filters[criterion_id] = _filter_string(ftype, op, predicate.get("value"))
        except TableScopeError as exc:
            raise TableScopeError(f"criterion {criterion_id!r}: {exc}") from exc
    return filters
