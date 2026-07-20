"""The thread control plane: list / read / create / message / delete the
free-ranging, unscoped conversation surface (product-flows.md §Threads, tables &
outputs; decisions/0004-scope-binds-to-table-not-thread.md).

A **thread** carries no fixed Dataset and does not fork — it *is* the only
conversation surface. Each thread gets one persistent primary thread-agent
session (``core.agent.runtime``); each user message crosses ONE seam —
``run_turn`` — and opencode owns the conversation context. The agent either records a cited natural-
language answer, asks a clarification as assistant text, or records a domain-
level table request. When it records a table request, this route owns the server-
side side effect: pin the first-class table, launch the existing table-population
worker, and stamp ``resolution.output="table"`` + ``resolution.artifact_id`` onto
the agent message. The backend does not pre-classify messages with regexes,
phrase lists, or hidden output/scope classifiers before the agent sees them.

The thread ENGINE (``core.threads.store``) does mint/append/persist/load/list/delete;
these routes are the thin auth + wiring shell over it, mirroring
``server/routes/datasets.py``. Reads need ``thread.read``, writes ``thread.manage``
(a user reads/manages their OWN threads — sharing is Issue 5, untouched here); the
middleware already 401s an anonymous ``/api/*`` request, and each route raises 403
when the authenticated role lacks the permission key. Message ATTACHMENTS are
additionally per-resource authorized before any agent work: an attached Dataset or
template id the caller holds no active grant on is refused fail-closed, exactly
like the corresponding read route (``_authorized_attachments``); the turn then
carries the STRUCTURED attachment context — the runtime owns all prompt text.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from core.agent import runtime as agent_runtime
from core.agent.outputs import append_citation_marker
from core.agent.runtime import ThreadAgentResult, ThreadAgentTurn
from core.config import DATASETS_DIR, THREADS_DIR
from core.datasets import store as dataset_store
from core.datasets.store import DatasetError
from core.threads import store as thread_store
from core.threads.store import ThreadError
from server.auth import grants
from server.auth import store as auth_store
from server.models import (
    ThreadCreateRequest,
    ThreadMessageRequest,
    ThreadQuestionAnswersRequest,
    ThreadRenameRequest,
    ThreadSummary,
)
from server.routes import tables as tables_route
from server.routes._guards import require, safe_id
from server.routes.table_populations import _encode_sse_data_message

router = APIRouter()
logger = logging.getLogger(__name__)
_DEFAULT_SOURCE_TEMPLATE = "cord-ph"


def _safe_id(thread_id: str) -> str:
    """Refuse a non-slug thread id with a 404 (the shared traversal guard, with the
    Thread entity label)."""
    return safe_id(thread_id, kind="Thread")


def _require(request: Request, permission: str) -> dict[str, Any]:
    """Resolve the caller and enforce a permission key (401 then 403) — the shared
    control-plane gate."""
    return require(request, permission)


def _whole_db_scope() -> dict[str, Any]:
    return {
        "kind": "whole_db",
        "dataset_id": None,
        "disclosure": "answered across the whole hospital database",
    }


# A persisted "running" older than this is a dead turn: in-process failures
# always reset the status (finish_chat / _append_agent_reply), so only process
# death leaves it behind — startup sweeps those (reset_running_threads), and
# this window keeps the guard fail-open even before a restart.
_TURN_STALE_AFTER_S = 600


def _require_thread_idle(thread: dict[str, Any]) -> None:
    """409 while the thread's agent turn is LIVE.

    Two concurrent turns would share one opencode session and one set of
    worktree sink files — ``clear_turn_outputs`` at the second turn's start
    would delete the first turn's citations/table_request mid-flight. A
    "running" status older than the staleness window (or with an unreadable
    timestamp) never blocks: better a rare doubled turn than a bricked thread.
    """
    if thread.get("status") != "running":
        return
    try:
        started = datetime.fromisoformat(str(thread.get("updated_at") or ""))
        age_s = (datetime.now(timezone.utc) - started).total_seconds()
    except (ValueError, TypeError):
        return
    if age_s < _TURN_STALE_AFTER_S:
        raise HTTPException(
            status_code=409,
            detail="The thread agent is still answering; wait for the current "
            "turn to finish.",
        )


def _pin_and_spawn_agent_table(
    table_request: dict[str, Any], *, thread_id: str, user: dict[str, Any]
) -> str:
    """The backend side effect of the agent's Table request (ADR 0006).

    The agent's choice is never itself an authorization: the requesting USER is
    passed through so ``pin_and_spawn_table`` re-checks their Dataset grant
    fail-closed before pinning, and the agent-supplied ids are slug-guarded
    exactly like attachment ids before any path join.

    The request's recorded user intent is passed through as the table's
    **Brief** — trimmed, kept for life — so a re-run can work from the
    original delegation instruction. Empty text is never stored (guarded below),
    so a table simply has no ``brief`` rather than an empty one."""
    request_text = str(table_request.get("request") or "").strip()
    if not request_text:
        raise ValueError("the table request requires a non-empty `request`.")
    title = str(table_request.get("title") or request_text).strip()
    source_template = str(table_request.get("source_template") or "").strip()
    if not source_template:
        source_template = _DEFAULT_SOURCE_TEMPLATE
    source_template = safe_id(source_template, kind="Template")
    dataset_id = table_request.get("dataset_id")
    dataset_id = str(dataset_id).strip() if dataset_id is not None else None
    if dataset_id:
        dataset_id = safe_id(dataset_id, kind="Dataset")
    description = table_request.get("description")
    description = str(description).strip() if description is not None else None
    table = tables_route.pin_and_spawn_table(
        title=title,
        source_template=source_template,
        description=description or None,
        dataset_id=dataset_id or None,
        brief=request_text,
        thread_id=thread_id,
        user_id=user.get("id"),
        user=user,
    )
    return str(table["id"])


def _attachment_dict(item: Any) -> dict[str, str]:
    if hasattr(item, "model_dump"):
        item = item.model_dump()
    if not isinstance(item, dict):
        raise HTTPException(status_code=422, detail="Invalid request attachment.")
    attachment_type = str(item.get("type") or "").strip()
    if attachment_type not in {"dataset", "template"}:
        raise HTTPException(status_code=422, detail="Invalid request attachment type.")
    attachment_id = safe_id(
        str(item.get("id") or "").strip(),
        kind="Attachment",
    )
    return {"type": attachment_type, "id": attachment_id}


def _normalize_attachments(attachments: list[Any] | None) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in attachments or []:
        attachment = _attachment_dict(item)
        attachment_type = attachment["type"]
        if attachment_type in seen:
            raise HTTPException(
                status_code=422,
                detail=f"Only one {attachment_type} attachment is allowed per message.",
            )
        seen.add(attachment_type)
        normalized.append(attachment)
    return normalized


def _attachment_id(
    attachments: list[dict[str, str]], attachment_type: str
) -> str | None:
    for attachment in attachments:
        if attachment.get("type") == attachment_type:
            return str(attachment.get("id") or "")
    return None


def _load_dataset(dataset_id: str) -> dict[str, Any] | None:
    """A missing/broken Dataset yields None — the thread scope falls back."""
    try:
        return dataset_store.load_dataset(dataset_id, datasets_dir=DATASETS_DIR)
    except DatasetError:
        return None


def _dataset_scope(dataset_id: str, dataset: dict[str, Any]) -> dict[str, Any]:
    name = str(dataset.get("name") or dataset_id)
    return {
        "kind": "dataset",
        "dataset_id": dataset_id,
        "disclosure": f"answered within the {name} Dataset",
    }


def _authorized_attachments(
    user: dict[str, Any],
    attachments: list[dict[str, str]],
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, str | None]:
    """Resolve attachments into STRUCTURED turn context — ``(scope, dataset,
    template_id)`` — enforcing the same per-resource gates as the
    Dataset/template read routes: the caller needs an active grant on every
    attached id (direct, or the table-share cascade for a Dataset) —
    fail-closed 403 — so unauthorized resource metadata never reaches the
    agent. A genuinely missing Dataset stays 404, ordered before the grant
    check exactly like GET /api/datasets/<id>. No prompt text is assembled
    here: the runtime owns all prompt construction (core.agent.prompts)."""
    dataset = None
    scope = None
    dataset_id = _attachment_id(attachments, "dataset")
    if dataset_id:
        dataset = _load_dataset(dataset_id)
        if dataset is None:
            raise HTTPException(status_code=404, detail="Dataset not found.")
        if not (
            grants.has_resource_access(user, "dataset", dataset_id)
            or grants.has_dataset_access_via_table(user, dataset_id)
        ):
            raise HTTPException(status_code=403, detail="You don't have access to this")
        scope = _dataset_scope(dataset_id, dataset)
    template_id = _attachment_id(attachments, "template")
    if template_id and not grants.has_resource_access(user, "template", template_id):
        raise HTTPException(status_code=403, detail="You don't have access to this")
    return scope, dataset, template_id


def _worktree_authorizer(user: dict[str, Any]):
    """The per-resource predicate the agent worktree is projected through
    (``core.agent.worktree.AuthorizeResource``): an id is exposed iff the caller
    may READ it — an active direct grant, plus (Datasets only) the table-share
    cascade — exactly the gate ``GET /api/datasets/<id>`` applies, so anything
    the caller can attach the agent can also navigate. Injected here because the
    grants store is server-layer code the core worktree module must not import;
    with no predicate the worktree exposes nothing (fail-closed)."""

    def authorize(resource_type: str, resource_id: str) -> bool:
        if grants.has_resource_access(user, resource_type, resource_id):
            return True
        return resource_type == "dataset" and grants.has_dataset_access_via_table(
            user, resource_id
        )

    return authorize


async def _run_turn(turn: ThreadAgentTurn, *, on_event=None) -> ThreadAgentResult:
    """The one seam this route crosses into the thread agent
    (``core.agent.runtime.run_turn``): the runtime hides the worktree, the
    session, the prompts, and the output collection. A module-level wrapper so
    tests stub the engine — it never launches under test. ``THREADS_DIR`` is
    passed from this module so the runtime state lives beside the thread JSON
    this route persists (one knob, patched together under test).
    """
    return await agent_runtime.run_turn(
        turn, on_event=on_event, threads_dir=THREADS_DIR
    )


def _agent_turn(
    thread: dict[str, Any],
    user_text: str,
    *,
    user: dict[str, Any],
    scope: dict[str, Any] | None,
    dataset: dict[str, Any] | None,
    template_id: str | None = None,
) -> ThreadAgentTurn:
    return ThreadAgentTurn(
        thread_id=thread["id"],
        user_text=user_text,
        scope=scope,
        dataset=dataset,
        template_id=template_id,
        authorize=_worktree_authorizer(user) if user else None,
    )


def _record_chat_query_log(user_id: str | None, entries: list[dict]) -> None:
    if not user_id:
        return
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        query = str(entry.get("query") or "").strip()
        if not query:
            continue
        database = entry.get("database")
        ts = str(entry.get("ts") or datetime.now(timezone.utc).isoformat())
        auth_store.record_query(
            user_id,
            query,
            str(database) if database is not None else None,
            None,
            ts,
        )


def _query_log_from_error(exc: BaseException) -> list[dict]:
    query_log = getattr(exc, "query_log", None)
    return list(query_log) if isinstance(query_log, list) else []


def _base_resolution() -> dict[str, Any]:
    return {
        "output": "chat",
        "scope": _whole_db_scope(),
        "artifact_id": None,
        "seam": None,
    }


def _question_request_payload(questions: list[dict]) -> dict[str, Any]:
    return {
        "id": f"ask-{uuid4().hex[:12]}",
        "status": "pending",
        "questions": questions,
        "answers": [],
    }


def _pending_question_request(thread: dict[str, Any]) -> tuple[int, dict] | None:
    for index in range(len(thread.get("messages") or []) - 1, -1, -1):
        message = thread["messages"][index]
        resolution = message.get("resolution") if isinstance(message, dict) else None
        request = (
            resolution.get("ask_user_questions")
            if isinstance(resolution, dict)
            else None
        )
        if isinstance(request, dict) and request.get("status") == "pending":
            return index, request
    return None


def _format_answer_for_prompt(answer: dict[str, Any], questions: list[dict]) -> str:
    question_by_id = {str(item.get("id")): item for item in questions}
    question_id = str(answer.get("question_id") or "")
    question = str(question_by_id.get(question_id, {}).get("question") or question_id)
    if answer.get("status") == "skipped":
        return f"- {question}: skipped"
    text = str(answer.get("text") or "").strip()
    choice_id = str(answer.get("choice_id") or "").strip()
    if text:
        return f"- {question}: {text}"
    if choice_id:
        choices = question_by_id.get(question_id, {}).get("choices") or []
        label = next(
            (
                str(choice.get("label"))
                for choice in choices
                if str(choice.get("id")) == choice_id
            ),
            choice_id,
        )
        return f"- {question}: {label}"
    return f"- {question}: answered"


def _clarified_request(original: str, request: dict, answers: list[dict]) -> str:
    lines = [
        "Continue the original request using the user's answers.",
        "",
        "Original request:",
        original,
        "",
        "User answers:",
    ]
    questions = list(request.get("questions") or [])
    lines.extend(_format_answer_for_prompt(answer, questions) for answer in answers)
    return "\n".join(lines)


def _validated_question_answers(
    question_request: dict, body: ThreadQuestionAnswersRequest
) -> list[dict[str, Any]]:
    questions = list(question_request.get("questions") or [])
    question_ids = [str(question.get("id") or "") for question in questions]
    answers = [answer.model_dump() for answer in body.answers]
    answer_ids = [str(answer.get("question_id") or "") for answer in answers]
    if answer_ids != question_ids:
        raise HTTPException(
            status_code=422, detail="Answers must match the pending questions."
        )
    for answer in answers:
        if answer.get("status") == "skipped":
            answer["choice_id"] = None
            answer["text"] = None
            continue
        if (
            not str(answer.get("choice_id") or "").strip()
            and not str(answer.get("text") or "").strip()
        ):
            raise HTTPException(
                status_code=422,
                detail="Answered questions require a choice_id or text.",
            )
    return answers


def _apply_question_answers(
    thread: dict[str, Any],
    *,
    agent_index: int,
    question_request: dict,
    answers: list[dict[str, Any]],
) -> dict[str, str] | None:
    question_request["answers"] = answers
    question_request["status"] = (
        "skipped"
        if answers and all(a.get("status") == "skipped" for a in answers)
        else "answered"
    )
    thread["messages"][agent_index]["resolution"]["ask_user_questions"] = (
        question_request
    )

    if question_request["status"] == "skipped":
        thread["updated_at"] = thread_store._now_iso()
        return None

    original = ""
    if agent_index > 0:
        original = str(thread["messages"][agent_index - 1].get("content") or "")
    user_content = "\n".join(
        _format_answer_for_prompt(answer, question_request["questions"])
        for answer in answers
    )
    return {
        "user_content": user_content,
        "agent_prompt": _clarified_request(original, question_request, answers),
    }


async def _delete_thread_agent_session(thread_id: str) -> None:
    """Best-effort cleanup of the persistent agent session for a deleted thread."""
    try:
        await agent_runtime.delete_thread(thread_id, threads_dir=THREADS_DIR)
    except Exception:
        logger.exception(
            "failed to delete the thread-agent session for thread %s", thread_id
        )


def _upsert_chat_activity(payload: dict[str, Any], activity: dict[str, Any]) -> None:
    if not isinstance(activity, dict):
        return
    events = payload.setdefault("activity", [])
    if not isinstance(events, list):
        payload["activity"] = events = []
    activity_id = activity.get("id")
    if activity_id:
        for i, existing in enumerate(events):
            if isinstance(existing, dict) and existing.get("id") == activity_id:
                events[i] = activity
                return
    events.append(activity)


def _upsert_chat_citation(payload: dict[str, Any], citation: dict[str, Any]) -> None:
    if not isinstance(citation, dict):
        return
    citations = payload.setdefault("citations", [])
    if not isinstance(citations, list):
        payload["citations"] = citations = []
    marker = str(citation.get("marker") or "")
    if marker:
        for i, existing in enumerate(citations):
            if (
                isinstance(existing, dict)
                and str(existing.get("marker") or "") == marker
            ):
                citations[i] = citation
                return
    citations.append(citation)


def _checkpoint_thread(thread: dict[str, Any]) -> None:
    """Best-effort save for live chat progress before the final done event."""
    try:
        thread_store.save_thread(thread, threads_dir=THREADS_DIR)
    except ThreadError:
        logger.exception("failed to checkpoint live thread %s", thread.get("id"))


def _thread_is_opened_for_user(
    summary: dict[str, Any], opened_at_by_thread: dict[str, str]
) -> bool:
    if summary.get("status") == "running":
        return False
    opened_at = opened_at_by_thread.get(str(summary.get("id") or ""))
    return bool(opened_at and opened_at >= str(summary.get("updated_at") or ""))


async def _append_agent_reply(
    thread: dict[str, Any],
    content: str,
    *,
    user: dict[str, Any],
    attachments: list[dict[str, str]] | None = None,
) -> None:
    user_id = user.get("id")
    payload = _base_resolution()
    scope, dataset, template_id = _authorized_attachments(user, attachments or [])
    if scope is not None:
        payload["scope"] = scope
    try:
        result = await _run_turn(
            _agent_turn(
                thread,
                content,
                user=user,
                scope=scope,
                dataset=dataset,
                template_id=template_id,
            )
        )
        payload["scope"] = result.scope or _whole_db_scope()
        _record_chat_query_log(user_id, list(result.query_log))
        if result.kind == "questions":
            payload["ask_user_questions"] = _question_request_payload(
                list(result.questions)
            )
            thread_store.append_agent_message(thread, "", resolution=payload)
            return
        if result.kind == "table_request":
            table_id = _pin_and_spawn_agent_table(
                result.table_request or {},
                thread_id=thread["id"],
                user=user,
            )
            payload["output"] = "table"
            payload["artifact_id"] = table_id
            thread.setdefault("artifact_ids", []).append(table_id)
            message = result.answer or "I started that table."
        else:
            citations = list(result.citations)
            if citations:
                payload["citations"] = citations
            message = result.answer
    except Exception as exc:
        _record_chat_query_log(user_id, _query_log_from_error(exc))
        logger.exception("thread-agent turn failed for thread %s", thread.get("id"))
        message = (
            "I couldn't answer that just now — the database assistant is "
            "unavailable. Please try again."
        )
    thread_store.append_agent_message(thread, message, resolution=payload)
    thread["status"] = "complete"


async def _run_agent_and_reply(
    thread: dict[str, Any],
    content: str,
    *,
    user: dict[str, Any],
    attachments: list[dict[str, str]] | None = None,
) -> None:
    """Append the user message and pass it to the agent.

    There is no pre-agent regex/phrase-list router here. The agent owns the
    request interpretation. If it needs more input, it calls `ask_user_question`
    and the resulting structured questions are stored on the agent message for
    the composer to answer.
    """
    attachments = attachments or []
    thread_store.append_user_message(thread, content, attachments=attachments)
    await _append_agent_reply(thread, content, user=user, attachments=attachments)


async def _run_agent_and_stream_reply(
    thread: dict[str, Any],
    content: str,
    *,
    user: dict[str, Any],
    scope: dict[str, Any] | None = None,
    dataset: dict[str, Any] | None = None,
    template_id: str | None = None,
    user_content: str | None = None,
    attachments: list[dict[str, str]] | None = None,
):
    # `scope`/`dataset`/`template_id` are resolved EAGERLY by the route (via
    # `_authorized_attachments`) so an attachment the caller may not read
    # 403s as a real response — never as a mid-stream error event.
    user_id = user.get("id")
    attachments = attachments or []
    thread_store.append_user_message(
        thread,
        content if user_content is None else user_content,
        attachments=attachments if user_content is None else None,
    )
    payload = _base_resolution()
    if scope is not None:
        payload["scope"] = scope
    thread_store.append_agent_message(thread, "", resolution=payload)
    thread["status"] = "running"
    agent_index = len(thread["messages"]) - 1

    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    starting_activity = {
        "id": "chat-starting",
        "label": "Thinking",
        "headline": "Thinking",
        "kind": "system",
    }
    _upsert_chat_activity(payload, starting_activity)
    thread["messages"][agent_index]["resolution"] = payload
    thread_store.save_thread(thread, threads_dir=THREADS_DIR)
    await queue.put(
        {
            "type": "chat_activity",
            "messageIndex": agent_index,
            "activity": starting_activity,
        }
    )

    async def forward(event: dict[str, Any]) -> None:
        if event.get("type") == "chat_activity":
            activity = event.get("activity") or {}
            _upsert_chat_activity(payload, activity)
            thread["messages"][agent_index]["resolution"] = payload
            _checkpoint_thread(thread)
            await queue.put(
                {
                    "type": "chat_activity",
                    "messageIndex": agent_index,
                    "activity": activity,
                }
            )
            return
        if event.get("type") == "chat_delta":
            content_delta = str(event.get("content") or "")
            thread["messages"][agent_index]["content"] = content_delta
            _checkpoint_thread(thread)
            await queue.put(
                {
                    "type": "chat_delta",
                    "messageIndex": agent_index,
                    "content": content_delta,
                }
            )
            return
        if event.get("type") == "chat_citation":
            citation = event.get("citation") or {}
            _upsert_chat_citation(payload, citation)
            thread["messages"][agent_index]["content"] = append_citation_marker(
                str(thread["messages"][agent_index].get("content") or ""),
                citation,
            )
            thread["messages"][agent_index]["resolution"] = payload
            _checkpoint_thread(thread)
            await queue.put(
                {
                    "type": "chat_citation",
                    "messageIndex": agent_index,
                    "citation": citation,
                }
            )

    async def finish_chat() -> None:
        try:
            result = await _run_turn(
                _agent_turn(
                    thread,
                    content,
                    user=user,
                    scope=scope,
                    dataset=dataset,
                    template_id=template_id,
                ),
                on_event=forward,
            )
            payload["scope"] = result.scope or _whole_db_scope()
            _record_chat_query_log(user_id, list(result.query_log))
            if result.kind == "questions":
                payload["ask_user_questions"] = _question_request_payload(
                    list(result.questions)
                )
                thread["messages"][agent_index]["resolution"] = payload
                _checkpoint_thread(thread)
                await queue.put(
                    {
                        "type": "ask_user_questions",
                        "messageIndex": agent_index,
                        "request": payload["ask_user_questions"],
                    }
                )
                thread["status"] = "complete"
                thread["updated_at"] = thread_store._now_iso()
                try:
                    thread_store.save_thread(thread, threads_dir=THREADS_DIR)
                    await queue.put({"type": "done", "thread": thread})
                except ThreadError as exc:
                    await queue.put({"type": "error", "message": str(exc)})
                return
            if result.kind == "table_request":
                table_id = _pin_and_spawn_agent_table(
                    result.table_request or {},
                    thread_id=thread["id"],
                    user=user,
                )
                payload["output"] = "table"
                payload["artifact_id"] = table_id
                thread.setdefault("artifact_ids", []).append(table_id)
                answer = result.answer or "I started that table."
            else:
                citations = list(result.citations)
                if citations:
                    payload["citations"] = citations
                answer = result.answer
            if thread["messages"][agent_index]["content"] != answer:
                thread["messages"][agent_index]["content"] = answer
                await queue.put(
                    {
                        "type": "chat_delta",
                        "messageIndex": agent_index,
                        "content": answer,
                    }
                )
            thread["messages"][agent_index]["content"] = answer
            thread["messages"][agent_index]["resolution"] = payload
        except Exception as exc:
            _record_chat_query_log(user_id, _query_log_from_error(exc))
            logger.exception("thread-agent turn failed for thread %s", thread.get("id"))
            fallback = (
                "I couldn't answer that just now — the database assistant is "
                "unavailable. Please try again."
            )
            thread["messages"][agent_index]["content"] = fallback
            thread["messages"][agent_index]["resolution"] = payload
            await queue.put(
                {
                    "type": "chat_delta",
                    "messageIndex": agent_index,
                    "content": fallback,
                }
            )
        thread["status"] = "complete"
        thread["updated_at"] = thread_store._now_iso()
        try:
            thread_store.save_thread(thread, threads_dir=THREADS_DIR)
            await queue.put({"type": "done", "thread": thread})
        except ThreadError as exc:
            await queue.put({"type": "error", "message": str(exc)})

    asyncio.create_task(finish_chat())
    yield {"type": "thread_snapshot", "thread": thread}

    while True:
        event = await queue.get()
        yield event
        if event.get("type") in {"done", "error"}:
            return


@router.get("/api/threads", response_model=list[ThreadSummary])
async def list_threads(request: Request) -> list[ThreadSummary]:
    user = _require(request, "thread.read")
    summaries = thread_store.list_summaries(threads_dir=THREADS_DIR)
    opened_at_by_thread = auth_store.thread_opened_at_for_user(user.get("id"))
    for summary in summaries:
        summary["opened"] = _thread_is_opened_for_user(summary, opened_at_by_thread)
    return [ThreadSummary(**s) for s in summaries]


@router.get("/api/threads/{thread_id}")
async def get_thread(thread_id: str, request: Request) -> dict[str, Any]:
    user = _require(request, "thread.read")
    thread_id = _safe_id(thread_id)
    try:
        thread = thread_store.load_thread(thread_id, threads_dir=THREADS_DIR)
    except ThreadError:
        raise HTTPException(status_code=404, detail="Thread not found.")
    auth_store.mark_thread_opened(user.get("id"), thread_id, thread_store._now_iso())
    return thread


@router.post("/api/threads/{thread_id}/open", status_code=204)
async def open_thread(thread_id: str, request: Request) -> Response:
    user = _require(request, "thread.read")
    thread_id = _safe_id(thread_id)
    try:
        thread_store.load_thread(thread_id, threads_dir=THREADS_DIR)
    except ThreadError:
        raise HTTPException(status_code=404, detail="Thread not found.")
    auth_store.mark_thread_opened(user.get("id"), thread_id, thread_store._now_iso())
    return Response(status_code=204)


@router.post("/api/threads")
async def create_thread(body: ThreadCreateRequest, request: Request) -> dict[str, Any]:
    user = _require(request, "thread.manage")
    thread = thread_store.new_thread()
    message = (body.message or "").strip()
    if body.attachments and not message:
        raise HTTPException(status_code=422, detail="Attachments require a message.")
    attachments = _normalize_attachments(body.attachments) if message else []
    if message:
        await _run_agent_and_reply(thread, message, user=user, attachments=attachments)
    try:
        thread_store.save_thread(thread, threads_dir=THREADS_DIR)
    except ThreadError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return thread


@router.post("/api/threads/{thread_id}/messages")
async def post_message(
    thread_id: str, body: ThreadMessageRequest, request: Request
) -> dict[str, Any]:
    user = _require(request, "thread.manage")
    thread_id = _safe_id(thread_id)
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="Message content is required.")
    attachments = _normalize_attachments(body.attachments)
    try:
        thread = thread_store.load_thread(thread_id, threads_dir=THREADS_DIR)
    except ThreadError:
        raise HTTPException(status_code=404, detail="Thread not found.")
    _require_thread_idle(thread)
    await _run_agent_and_reply(thread, content, user=user, attachments=attachments)
    try:
        thread_store.save_thread(thread, threads_dir=THREADS_DIR)
    except ThreadError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return thread


@router.post("/api/threads/{thread_id}/messages/stream")
async def post_message_stream(
    thread_id: str, body: ThreadMessageRequest, request: Request
):
    user = _require(request, "thread.manage")
    thread_id = _safe_id(thread_id)
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="Message content is required.")
    attachments = _normalize_attachments(body.attachments)
    try:
        thread = thread_store.load_thread(thread_id, threads_dir=THREADS_DIR)
    except ThreadError:
        raise HTTPException(status_code=404, detail="Thread not found.")
    _require_thread_idle(thread)
    # Resolve (and authorize) the attachments BEFORE the stream starts, so a
    # missing Dataset 404s and an ungranted one 403s as a real response.
    scope, dataset, template_id = _authorized_attachments(user, attachments)

    async def event_source():
        try:
            async for event in _run_agent_and_stream_reply(
                thread,
                content,
                user=user,
                scope=scope,
                dataset=dataset,
                template_id=template_id,
                attachments=attachments,
            ):
                yield _encode_sse_data_message(event)
        except ThreadError as exc:
            yield _encode_sse_data_message({"type": "error", "message": str(exc)})

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/api/threads/{thread_id}/question-answers")
async def post_question_answers(
    thread_id: str, body: ThreadQuestionAnswersRequest, request: Request
) -> dict[str, Any]:
    user = _require(request, "thread.manage")
    thread_id = _safe_id(thread_id)
    try:
        thread = thread_store.load_thread(thread_id, threads_dir=THREADS_DIR)
    except ThreadError:
        raise HTTPException(status_code=404, detail="Thread not found.")
    _require_thread_idle(thread)

    pending = _pending_question_request(thread)
    if pending is None:
        raise HTTPException(status_code=409, detail="No pending questions.")
    agent_index, question_request = pending
    answers = _validated_question_answers(question_request, body)
    followup = _apply_question_answers(
        thread,
        agent_index=agent_index,
        question_request=question_request,
        answers=answers,
    )

    if followup is not None:
        thread_store.append_user_message(thread, followup["user_content"])
        await _append_agent_reply(thread, followup["agent_prompt"], user=user)

    try:
        thread_store.save_thread(thread, threads_dir=THREADS_DIR)
    except ThreadError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return thread


@router.post("/api/threads/{thread_id}/question-answers/stream")
async def post_question_answers_stream(
    thread_id: str, body: ThreadQuestionAnswersRequest, request: Request
):
    user = _require(request, "thread.manage")
    thread_id = _safe_id(thread_id)
    try:
        thread = thread_store.load_thread(thread_id, threads_dir=THREADS_DIR)
    except ThreadError:
        raise HTTPException(status_code=404, detail="Thread not found.")
    _require_thread_idle(thread)

    pending = _pending_question_request(thread)
    if pending is None:
        raise HTTPException(status_code=409, detail="No pending questions.")
    agent_index, question_request = pending
    answers = _validated_question_answers(question_request, body)
    followup = _apply_question_answers(
        thread,
        agent_index=agent_index,
        question_request=question_request,
        answers=answers,
    )

    async def event_source():
        try:
            if followup is None:
                thread_store.save_thread(thread, threads_dir=THREADS_DIR)
                yield _encode_sse_data_message(
                    {"type": "thread_snapshot", "thread": thread}
                )
                yield _encode_sse_data_message({"type": "done", "thread": thread})
                return
            async for event in _run_agent_and_stream_reply(
                thread,
                followup["agent_prompt"],
                user=user,
                user_content=followup["user_content"],
            ):
                yield _encode_sse_data_message(event)
        except ThreadError as exc:
            yield _encode_sse_data_message({"type": "error", "message": str(exc)})

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.patch("/api/threads/{thread_id}")
async def rename_thread(
    thread_id: str, body: ThreadRenameRequest, request: Request
) -> dict[str, Any]:
    """Rename a thread: replace ONLY its display ``title`` (+ bump ``updated_at``)
    and persist. ``thread.manage`` guarded (parity with create/delete); the id is
    ``_safe_id``'d and a missing thread 404s. A blank title 422s."""
    _require(request, "thread.manage")
    thread_id = _safe_id(thread_id)
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=422, detail="Title is required.")
    try:
        thread = thread_store.load_thread(thread_id, threads_dir=THREADS_DIR)
    except ThreadError:
        raise HTTPException(status_code=404, detail="Thread not found.")
    thread["title"] = title
    thread["updated_at"] = thread_store._now_iso()
    try:
        thread_store.save_thread(thread, threads_dir=THREADS_DIR)
    except ThreadError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return thread


@router.delete("/api/threads/{thread_id}", status_code=204)
async def delete_thread(thread_id: str, request: Request) -> Response:
    _require(request, "thread.manage")
    thread_id = _safe_id(thread_id)
    try:
        await _delete_thread_agent_session(thread_id)
        thread_store.delete_thread(thread_id, threads_dir=THREADS_DIR)
        auth_store.delete_thread_views(thread_id)
    except ThreadError:
        raise HTTPException(status_code=404, detail="Thread not found.")
    return Response(status_code=204)
