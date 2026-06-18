"""Spec field display names — the human-readable column headers.

The run workbook is reconstructed from state.db cells (``workbook_stream``); a
cell's ``field`` is a slug (``nhs_number``), not a header. This maps that slug to
the spec's display name so an export/grid shows "NHS Number", falling back to the
slug when the spec has no match. Headers are cosmetic — this never affects where a
value lands.
"""

from __future__ import annotations

import re
from typing import Any


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def field_display_names(spec: dict[str, Any] | None) -> dict[str, str]:
    """Display name by every key the executable may carry for a field: the spec's
    full id, its last ``/`` segment, and the slugified display name (the mapping
    compiler keys ``cell_map.field`` off the name)."""
    names: dict[str, str] = {}
    for field in (spec or {}).get("fields") or []:
        field_id = field.get("id")
        if not field_id:
            continue
        name = field.get("name") or field_id
        names[field_id] = name
        names.setdefault(str(field_id).rsplit("/", 1)[-1], name)
        names.setdefault(_slug(name), name)
    return names
