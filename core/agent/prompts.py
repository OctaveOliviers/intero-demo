"""Prompt construction for the thread agent — minimal by design, and ALL of it.

STANDING instructions are seeded exactly once, folded into the FIRST turn of a
newly created session (no separate seeding round-trip); every later turn sends
only the per-message prompt: the attachment context (the structured Dataset /
Template the message pinned), the scope disclosure block, and the user's raw
request. The caller never assembles prompt text — it passes structured turn
data and this module owns every character. Everything procedural lives in the
skills, never here (ADR 0006: the standing instructions give only the thinking
frame).
"""

from __future__ import annotations

import json

WHOLE_DB_SCOPE = {
    "kind": "whole_db",
    "dataset_id": None,
    "disclosure": "answered across the whole hospital database",
}


def scope_prompt(scope: dict | None, dataset: dict | None) -> str:
    scope = scope or WHOLE_DB_SCOPE
    if scope.get("kind") != "dataset":
        return (
            "Scope for this message: whole hospital database. The UI will show a "
            "prominent whole-database disclosure; answer across the registered "
            "clinical databases only.\n"
        )

    name = str((dataset or {}).get("name") or scope.get("dataset_id") or "Dataset")
    dataset_id = str(scope.get("dataset_id") or (dataset or {}).get("id") or "")
    cohort_sql = str((dataset or {}).get("cohort_sql") or "").strip()
    criteria = dataset.get("criteria") if isinstance(dataset, dict) else None
    lines = [
        f"Scope for this message: Dataset {name!r}"
        + (f" ({dataset_id})" if dataset_id else "")
        + ". Apply this slice to every SQL query you run; no cohort is injected for you.",
    ]
    if cohort_sql:
        lines.append(f"Dataset cohort_sql:\n{cohort_sql}")
    if criteria:
        lines.append(
            "Dataset criteria JSON:\n" + json.dumps(criteria, ensure_ascii=False)
        )
    return "\n".join(lines) + "\n"


def standing_instructions(slugs: list[str]) -> str:
    clinical = (
        "\n".join(f'- "{slug}" — clinical database (read-only)' for slug in slugs)
        or "- (no clinical database registered)"
    )
    return (
        "You are the primary Intero thread agent. Answer operational hospital "
        "questions by choosing one action: answer directly with cited clinical "
        "data, ask one concise clarifying question, or request a structured table.\n"
        "Use clinical data only through tools. For database answers, use the "
        "`chat-answer` skill, stream visible assistant text, and cite sources with "
        "cite_execute. For structured tables, call table_execute. Never fabricate.\n\n"
        "The clinical databases you can read (pass these names to your tools):\n"
        f"{clinical}"
    )


def _attachment_context(dataset: dict | None, template_id: str | None) -> str:
    """The per-message attachment preamble: what the user pinned to this turn.

    A Dataset attachment names the saved filter (its full definition also rides
    in the scope block); a Template attachment names the id and points the
    agent at the templates navigation collection, where the authorized
    projection exposes it."""
    lines: list[str] = []
    if dataset:
        dataset_id = str(dataset.get("id") or "")
        name = str(dataset.get("name") or dataset_id)
        lines.append(
            f"Attached Dataset: {name}" + (f" ({dataset_id})" if dataset_id else "")
        )
    if template_id:
        lines.append(
            f"Attached template: {template_id}. Use the templates navigation "
            "tools to inspect it if relevant."
        )
    return "\n".join(lines)


def turn_prompt(
    question: str,
    *,
    scope: dict | None = None,
    dataset: dict | None = None,
    template_id: str | None = None,
) -> str:
    context = _attachment_context(dataset, template_id)
    body = f"{scope_prompt(scope, dataset)}\nThe user's full request:\n{question}"
    return f"{context}\n\n{body}" if context else body


def first_turn_prompt(
    question: str,
    slugs: list[str],
    *,
    scope: dict | None = None,
    dataset: dict | None = None,
    template_id: str | None = None,
) -> str:
    """The FIRST prompt of a newly created session: the standing instructions
    (seeded once for the session's lifetime) plus the current turn."""
    return (
        f"{standing_instructions(slugs)}\n\n"
        f"{turn_prompt(question, scope=scope, dataset=dataset, template_id=template_id)}"
    )


_HIDDEN_TEXT_MARKERS = (
    "You are the primary Intero thread agent",
    "Keep these as standing instructions for this thread",
    "Scope for this message:",
    "The user's full request:",
    "Attached Dataset:",
    "Attached template:",
)


def is_hidden_prompt_text(text: str, prompt: str) -> bool:
    candidate = text.strip()
    if not candidate:
        return True
    if candidate == prompt.strip():
        return True
    return any(marker in candidate for marker in _HIDDEN_TEXT_MARKERS)
