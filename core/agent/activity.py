"""Raw OpenCode message parts → concrete UI activity events.

The ONE normalizer every agent surface shares (the thread agent and table
population): the FE renders a bounded, upserted activity feed, and both
streams are produced here so their vocabulary can never drift. Labels are
CONCRETE (ADR 0006): the user sees a Dataset read, a Template read, or a named
source-database query — never a generic tool badge.
"""

from __future__ import annotations

import json

# Forward the agent's live activity (doc 11 §agent_activity): turn opencode
# ``message.part.updated`` parts into the same `activity` events the FE already
# renders, so the run stream follows the agent's tool calls and thinking — not
# just the coarse between-tier steps.
_TOOL_LABELS = {
    "sql_execute": "the database",
    "lookup_execute": "the spec",
    "catalog_execute": "the database",
    "search_execute": "the database",
    "describe_execute": "the database",
    "join_paths_execute": "the database",
    "cite_execute": "a source",
    "table_execute": "a table request",
}
# The navigation verbs are generic over collections (navigation.md): name what
# the agent actually touched. catalog/search sweep a whole collection; describe
# reads one item of it.
_COLLECTION_SWEEP_TARGETS = {"datasets": "the Datasets", "templates": "the Templates"}
_COLLECTION_ITEM_TARGETS = {"datasets": "a Dataset", "templates": "a Template"}
_COLLECTION_TOOLS = {
    "catalog_execute": _COLLECTION_SWEEP_TARGETS,
    "search_execute": _COLLECTION_SWEEP_TARGETS,
    "describe_execute": _COLLECTION_ITEM_TARGETS,
    "join_paths_execute": _COLLECTION_ITEM_TARGETS,
}
_SILENT_ACTIVITY_TOOLS = {"cite_execute", "skill"}
_PART_TEXT_BUCKET = 400  # forward a thinking/text part ~every 400 chars of growth


def _tool_input(state: dict) -> dict:
    raw = state.get("input")
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _tool_target(tool_name: str, state: dict) -> str | None:
    """The concrete thing this call touches: the named source database for
    ``sql_execute``, the Dataset/Template collection (or item) for the
    navigation verbs, else the tool's generic target."""
    tool_input = _tool_input(state)
    if tool_name == "sql_execute":
        database = str(tool_input.get("database") or "").strip()
        if database and database != "cells":
            return f"the {database} database"
    collections = _COLLECTION_TOOLS.get(tool_name)
    if collections:
        collection = str(tool_input.get("collection") or "").strip()
        target = collections.get(collection)
        if target:
            return target
    return _TOOL_LABELS.get(tool_name)


def activity_from_part(part: dict, seen: dict[str, str]) -> dict | None:
    """Map one opencode message part to a forwarded activity payload.

    Returns ``{"headline", "label", "kind", "id"}`` to forward, or ``None`` when
    the part carries nothing new. The ``headline`` is the FULL, untruncated text
    (the FE caps the DISPLAY to ~280 chars and expands on click — capping here
    would mean the full thinking never reaches the UI). The ``id`` (the part id)
    lets the FE upsert: a streaming part collapses into one growing line, not many
    partial copies. ``seen`` (part-key -> last signature) is updated in place to
    BOUND how often we re-emit — without it the token-by-token part stream would
    flood the SSE link:

    * ``tool`` parts forward once per status transition (running / completed /
      error) — a few per tool call.
    * ``reasoning`` / ``text`` parts forward once per ~400 chars of growth, each
      carrying the full text so far (the driver also flushes the final text on
      session end so the tail is never lost).

    Pure + deterministic so the mapping is unit-tested without opencode running.
    """
    if not isinstance(part, dict):
        return None
    ptype = part.get("type")
    part_id = str(part.get("id") or part.get("callID") or "")

    if ptype == "tool":
        tool_name = str(part.get("tool") or "tool")
        if tool_name in _SILENT_ACTIVITY_TOOLS:
            return None
        state = part.get("state")
        if not isinstance(state, dict):
            state = {}
        status = str(state.get("status") or "")
        if status not in ("running", "completed", "error"):
            return None
        key = part_id or f"tool:{tool_name}"
        sig = f"tool:{status}"
        if seen.get(key) == sig:
            return None
        seen[key] = sig
        title = str(state.get("title") or "").strip()
        target = _tool_target(tool_name, state)
        if status == "running":
            label = f"Querying {target}" if target else f"Running {tool_name}"
            headline = title or label
        elif status == "error":
            label = "Tool call failed"
            headline = title or f"{tool_name} returned an error"
        else:  # completed
            label = f"Read {target}" if target else f"{tool_name} done"
            headline = title or label
        return {"headline": headline, "label": label, "kind": "tool", "id": part_id}

    if ptype in ("reasoning", "text"):
        text = str(part.get("text") or "").strip()
        if not text:
            return None
        key = part_id or f"{ptype}:0"
        sig = f"{ptype}:{len(text) // _PART_TEXT_BUCKET}"
        if seen.get(key) == sig:
            return None
        seen[key] = sig
        label = "Thinking" if ptype == "reasoning" else "Writing a note"
        return {"headline": text, "label": label, "kind": "thinking", "id": part_id}

    return None
