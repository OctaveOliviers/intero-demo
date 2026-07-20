"""ask_user_question — generic user-clarification sink tool.

The agent calls this when it needs missing user input before it can continue.
It writes ``ask_user_questions.json`` in the chat worktree. The backend detects
that file after the opencode turn ends and hands the queued questions to the UI.
The tool does not decide when clarification is needed; that decision belongs to
the agent prompt/skill using it.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from _common import ToolError, load_request, require_string
from _run_sql import load_context

_QUESTIONS_FILE = "ask_user_questions.json"


def _ensure_chat_context(cwd: Path) -> None:
    context = load_context(cwd)
    if context.get("mode") != "chat":
        raise ToolError(
            "ask_user_question can only run in a chat worktree (context mode must "
            "be `chat`)."
        )


def _validate_choice(raw: object, index: int, question_id: str) -> dict[str, str]:
    if not isinstance(raw, dict):
        raise ToolError(f"question {question_id!r} choice {index} must be an object.")
    choice_id = require_string(raw, "id")
    label = require_string(raw, "label")
    return {"id": choice_id, "label": label}


def _validate_question(raw: object, index: int) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ToolError(f"question {index} must be an object.")
    question_id = require_string(raw, "id")
    question = require_string(raw, "question")
    choices_raw = raw.get("choices") or []
    if not isinstance(choices_raw, list):
        raise ToolError(f"question {question_id!r}: `choices` must be a list.")
    choices = [
        _validate_choice(choice, choice_index, question_id)
        for choice_index, choice in enumerate(choices_raw)
    ]
    choice_ids = [choice["id"] for choice in choices]
    duplicates = sorted(
        {choice_id for choice_id in choice_ids if choice_ids.count(choice_id) > 1}
    )
    if duplicates:
        raise ToolError(
            f"question {question_id!r}: choice ids must be unique; duplicates: {duplicates}."
        )
    return {
        "id": question_id,
        "question": question,
        "choices": choices,
        "allow_other": bool(raw.get("allow_other", False)),
        "required": bool(raw.get("required", False)),
    }


def _record_questions(request: dict, cwd: Path) -> dict[str, Any]:
    _ensure_chat_context(cwd)
    questions_raw = request.get("questions")
    if not isinstance(questions_raw, list) or not questions_raw:
        raise ToolError("ask_user_question requires a non-empty `questions` list.")
    questions = [
        _validate_question(question, index)
        for index, question in enumerate(questions_raw)
    ]
    ids = [question["id"] for question in questions]
    duplicates = sorted(
        {question_id for question_id in ids if ids.count(question_id) > 1}
    )
    if duplicates:
        raise ToolError(f"question ids must be unique; duplicates: {duplicates}.")
    payload = {"questions": questions}
    (cwd / _QUESTIONS_FILE).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {"ok": True, "questionCount": len(questions)}


def main() -> None:
    try:
        result = _record_questions(load_request(), Path.cwd())
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except ToolError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        raise SystemExit(2) from None


if __name__ == "__main__":
    main()
