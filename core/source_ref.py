"""The ``"<db> -> <table>.<column>"`` source-reference grammar.

Every artifact that names a database column — ``mapping.json`` sources,
``criteria_bindings``, a Dataset criterion, an executable cohort anchor — writes
it in this one canonical form. This module is the grammar's single owner, so a
reference parses (or fails to parse) identically at build time and at run time;
the guarantee that a run-time consumer accepts exactly what a builder emitted
rests on both sides importing the same parser rather than on copy-paste.

The error *policy* stays with the caller: :func:`try_parse_source` returns
``None`` on a malformed reference, and each caller raises its own domain error
(``BuildError`` / ``CohortError`` / …).
"""

from __future__ import annotations

import re

_SOURCE_RE = re.compile(
    r"^\s*(?P<db>[^>]+?)\s*->\s*(?P<table>[^.]+?)\.(?P<column>.+?)\s*$"
)


def try_parse_source(source: str) -> tuple[str, str, str] | None:
    """Parse a source reference into ``(db, table, column)``; ``None`` when the
    string is not in the canonical form."""
    m = _SOURCE_RE.match(source or "")
    if not m:
        return None
    return m.group("db").strip(), m.group("table").strip(), m.group("column").strip()


def short_alias(table: str, used: set[str]) -> str:
    """A stable, collision-free short alias for a table (first letter, then 2…).

    Shared by the executable-cohort compiler and the run-time cohort deriver so
    both produce the *same* alias for the same table order — a Dataset predicate
    alias-qualified at definition time must resolve against the FROM clause the
    compiler wrote."""
    base = table[0].lower()
    alias = base
    n = 1
    while alias in used:
        n += 1
        alias = f"{base}{n}"
    used.add(alias)
    return alias
