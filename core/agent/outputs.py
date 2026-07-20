"""Collect the thread agent's turn outputs.

The agent's tools hand results to the backend through per-turn sink files in
the worktree — ``citations.json``, ``table_request.json``,
``ask_user_questions.json``, ``query_log.jsonl`` — cleared at each turn start:
tool→backend IPC, never canonical storage (storage-layout §3). This module owns
reading those sinks plus :class:`AnswerStream`, which folds the live message
parts into the streamed answer text, its inline citation markers, and the
forwarded UI events.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from core.agent.prompts import is_hidden_prompt_text

ASK_USER_QUESTIONS_FILE = "ask_user_questions.json"
TABLE_REQUEST_FILE = "table_request.json"
CITATIONS_FILE = "citations.json"
QUERY_LOG_FILE = "query_log.jsonl"

StreamCallback = Callable[[dict], Awaitable[None]]


def clear_turn_outputs(worktree_dir: Path) -> None:
    for name in (
        ASK_USER_QUESTIONS_FILE,
        TABLE_REQUEST_FILE,
        CITATIONS_FILE,
        QUERY_LOG_FILE,
    ):
        path = worktree_dir / name
        if path.exists():
            path.unlink()


def read_query_log(worktree_dir: Path) -> list[dict]:
    path = worktree_dir / QUERY_LOG_FILE
    if not path.is_file():
        return []
    rows: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(item, dict):
            rows.append(item)
    return rows


def read_asked_questions(worktree_dir: Path) -> list[dict]:
    path = worktree_dir / ASK_USER_QUESTIONS_FILE
    if not path.is_file():
        return []
    try:
        item = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    questions = item.get("questions") if isinstance(item, dict) else None
    return list(questions) if isinstance(questions, list) else []


def read_table_request(worktree_dir: Path) -> dict | None:
    path = worktree_dir / TABLE_REQUEST_FILE
    if not path.is_file():
        return None
    try:
        request = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"the table request is unreadable: {exc}") from exc
    if not isinstance(request, dict):
        raise ValueError("the table request must be an object.")
    title = str(request.get("title") or "").strip()
    prompt = str(request.get("request") or "").strip()
    if not title or not prompt:
        raise ValueError("the table request requires non-empty `title` and `request`.")
    return {
        "title": title,
        "request": prompt,
        "source_template": optional_string(request.get("source_template")),
        "dataset_id": optional_string(request.get("dataset_id")),
        "description": optional_string(request.get("description")),
    }


def optional_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def coerce_tool_input(raw: Any) -> dict:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def read_citations(worktree_dir: Path) -> list[dict]:
    path = worktree_dir / CITATIONS_FILE
    if not path.is_file():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return [dict(item) for item in payload if isinstance(item, dict)]


def is_completed_tool_part(part: dict, tool_name: str) -> bool:
    if not isinstance(part, dict) or part.get("type") != "tool":
        return False
    if part.get("tool") != tool_name:
        return False
    state = part.get("state")
    return isinstance(state, dict) and state.get("status") == "completed"


def citation_from_tool_part(part: dict, marker: int) -> dict | None:
    if not is_completed_tool_part(part, "cite_execute"):
        return None
    state = part.get("state")
    if not isinstance(state, dict):
        return None
    citation = coerce_tool_input(state.get("input"))
    if not citation:
        return None
    citation = dict(citation)
    citation["marker"] = str(marker)
    citation.setdefault("kind", "source")
    return citation


def append_citation_marker(content: str, citation: dict) -> str:
    marker = str(citation.get("marker") or "").strip()
    if not marker:
        return content
    token = f"[{marker}]"
    if token in content:
        return content
    stripped = content.rstrip()
    if not stripped:
        return content
    return f"{stripped} {token}"


def _answer_delta_from_part(part: dict) -> str | None:
    if not isinstance(part, dict):
        return None
    if part.get("type") == "text":
        text = part.get("text")
        return text if isinstance(text, str) and text else None
    return None


class AnswerStream:
    """Fold live message parts into the visible answer + forwarded UI events.

    Owns the streaming state one turn accumulates: the answer text so far (with
    citation markers appended at their stream position), the citations recorded
    by ``cite_execute``, and the bounded ``chat_activity`` / ``chat_delta`` /
    ``chat_citation`` events pushed to ``on_event`` (when streaming). Prompt
    echo and thinking parts never reach the stream.
    """

    def __init__(
        self,
        worktree_dir: Path,
        *,
        prompt: str,
        on_event: StreamCallback | None = None,
    ) -> None:
        self._worktree_dir = worktree_dir
        self._prompt = prompt
        self._on_event = on_event
        self._content = ""
        self._model_text = ""
        self.citations: list[dict] = []

    @property
    def content(self) -> str:
        return self._content

    async def forward_activity(self, activity: dict) -> None:
        if activity.get("kind") == "thinking":
            return
        if self._on_event is not None:
            await self._on_event({"type": "chat_activity", "activity": activity})

    async def on_part(self, part: dict) -> None:
        await self._emit_citations_from_part(part)
        answer = _answer_delta_from_part(part)
        if not answer:
            return
        if is_hidden_prompt_text(answer, self._prompt):
            return
        await self._emit_model_text(answer)

    async def _emit_answer_text(self, answer: str) -> None:
        if not answer:
            return
        if answer == self._content:
            return
        self._content = answer
        if self._on_event is not None:
            await self._on_event({"type": "chat_delta", "content": answer})

    async def _emit_model_text(self, text: str) -> None:
        previous = self._model_text
        if text.startswith(previous):
            delta = text[len(previous) :]
            self._model_text = text
        else:
            delta = text
            self._model_text = previous + text
        if not delta:
            return
        await self._emit_answer_text(self._content + delta)

    async def _emit_citations_from_part(self, part: dict) -> None:
        if not is_completed_tool_part(part, "cite_execute"):
            return
        citations = read_citations(self._worktree_dir)
        next_citations = citations[len(self.citations) :]
        if not next_citations:
            citation = citation_from_tool_part(part, len(self.citations) + 1)
            next_citations = [citation] if citation is not None else []
        for citation in next_citations:
            self.citations.append(citation)
            self._content = append_citation_marker(self._content, citation)
            if self._on_event is not None:
                await self._on_event({"type": "chat_citation", "citation": citation})
