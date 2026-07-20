"""The LLM-builder harness: one owner of the build → validate → retry loop.

Every pipeline builder (audit spec, database model, audit-database mapping,
criteria bindings) has the same shape: call the model, coerce its output into a
candidate document with deterministic code, validate the candidate, and — when
it is rejected — retry with the rejection reasons appended to the instructions,
up to MAX_BUILD_ATTEMPTS, so a malformed document is never returned, let alone
persisted. This module owns that invariant; a builder supplies only its single
attempt (call the model with the given instructions, assemble, report problems)
and gets the retry policy, the rejection feedback (each retry carries only the
*latest* attempt's problems — never an accumulated history), the logging, and
the terminal :class:`BuilderValidationError` for free.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Awaitable, Callable

logger = logging.getLogger(__name__)

# One rejected-output budget for every builder.
MAX_BUILD_ATTEMPTS = 3

_DEFAULT_GUIDANCE = (
    "Produce a corrected JSON object that fixes every issue. Output only the "
    "JSON object, starting with `{`."
)


class BuilderValidationError(RuntimeError):
    """Raised when a builder's LLM output cannot be made into a valid model
    after all retries. The caller (e.g. service.run_indexing) marks the entity
    failed; no broken model is ever persisted."""


def parse_json_object(raw: str) -> dict[str, Any]:
    """Parse the model's JSON output into an object, tolerating ```json fences
    and stray prose around it. Raises :class:`ValueError` (which
    ``json.JSONDecodeError`` subclasses) when no JSON object can be recovered."""
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text.strip())
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        text = text[start : end + 1]
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("top-level JSON is not an object")
    return data


def retry_feedback(problems: list[str], guidance: str = _DEFAULT_GUIDANCE) -> str:
    """The instructions trailer for a retry: the rejection reasons plus the
    builder's closing guidance for the corrected output."""
    joined = "\n".join(f"- {p}" for p in problems)
    return (
        "\n\nYOUR PREVIOUS OUTPUT WAS REJECTED for these reasons:\n"
        f"{joined}\n"
        f"{guidance}"
    )


async def build_validated(
    attempt: Callable[[str], Awaitable[tuple[Any, list[str]]]],
    *,
    prompt: str,
    label: str,
    guidance: str = _DEFAULT_GUIDANCE,
    max_attempts: int = MAX_BUILD_ATTEMPTS,
) -> Any:
    """Run one builder to a validated result.

    ``attempt(instructions)`` performs a single try: call the model with the
    given instructions, assemble a candidate deterministically, and return
    ``(candidate, problems)`` — an empty ``problems`` list means the candidate
    is valid and is returned as the build result. On a rejected attempt the
    next call's instructions are ``prompt`` + :func:`retry_feedback` with that
    attempt's problems. After ``max_attempts`` rejections raises
    :class:`BuilderValidationError` carrying the last problems. ``label`` names
    the artifact in logs and the terminal error (e.g. ``"audit spec"``).
    """
    instructions = prompt
    problems: list[str] = []
    for attempt_no in range(1, max_attempts + 1):
        result, problems = await attempt(instructions)
        if not problems:
            return result
        logger.warning(
            "%s failed validation (attempt %d/%d): %s",
            label, attempt_no, max_attempts, "; ".join(problems),
        )
        instructions = prompt + retry_feedback(problems, guidance)
    raise BuilderValidationError(
        f"{label} failed validation after {max_attempts} attempts: "
        + "; ".join(problems)
    )
