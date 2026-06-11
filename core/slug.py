"""Shared slugify — the single source of truth for the field-id slug used to
pin the A4↔A5 seam.

The audit-spec builder (A5) sets `spec.json#fields[].id = slugify(field.name)`,
and the mapping compile (A4, `build_populate_spec`) sets each executable
`cell_map[].field = slugify(mapping_field.header)`. Because the mapping
preserves the audit-field's name verbatim as its `header`, both sides slug the
same string — so every cell's `field` FK resolves to a `fields[].id` in
`spec.json`. Lives here (not in `core/indexing/profile.py`) so neither side
has to import the other.
"""

from __future__ import annotations

import re

_NONALNUM = re.compile(r"[^a-z0-9]+")
_RUNS = re.compile(r"_+")


def slugify(text: str) -> str:
    """Lowercase the text, replace any run of non-alphanumerics with a single
    underscore, and trim leading/trailing underscores. Returns "" on empty/None
    input — callers that need a non-empty slug must check."""
    if not text:
        return ""
    return _RUNS.sub("_", _NONALNUM.sub("_", text.lower())).strip("_")
