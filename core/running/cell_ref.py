"""Shared cell-ref helpers — the canonical definitions of cell-template rendering
and cohort-member formatting, used by both the orchestrator (precompute) and
try_direct (resolve) so the refs always match.
"""

from __future__ import annotations

import re
from typing import Any

_COL_TOKEN = re.compile(r"\{col:([A-Za-z]+)\}")

DEFAULT_FIRST_DATA_ROW = 2


def render_a1(cell_template: str, row_number: int) -> str:
    """``"{col:AA}{row}"`` + 12 → ``"AA12"``."""
    ref = _COL_TOKEN.sub(lambda m: m.group(1).upper(), cell_template)
    return ref.replace("{row}", str(row_number))


def member_id(member: Any) -> str:
    """A cohort member's identity as a string — a multi-key identity joins on ``·``."""
    if isinstance(member, (list, tuple)):
        return "·".join(str(v) for v in member)
    return str(member)
