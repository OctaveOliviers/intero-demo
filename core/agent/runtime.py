"""The Thread Agent runtime — the one public interface over a thread's agent.

A Thread has one persistent agent (ADR 0006). The route hands each user turn
across this seam and knows nothing else::

    result = await runtime.run_turn(
        ThreadAgentTurn(thread_id=..., user_text=..., scope=..., dataset=...,
                        authorize=...),
        on_event=emit,
    )

Hidden behind it: whether the OpenCode session was created or reused, how the
worktree and its authorized datasets/templates projection are materialized
(``core.agent.worktree``), how standing instructions are seeded (folded into a
new session's first turn — ``core.agent.prompts``), how the session is driven
to completion (the shared sub-agent launcher, ``core.agent.launcher`` — the
thread agent is its persistent-session adapter), how raw message parts become
UI activity and streamed answer text (``core.agent.activity`` /
``core.agent.outputs``), and how the turn's outputs — answer, citations, table
request, ask-user questions, query log — are collected from the worktree sinks.

The result states which Output the agent chose: an ``answer``, a
``table_request`` (the backend owns the pin-and-populate side effect), or
``questions`` (not an output — how the agent gathers missing input).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from core.agent import launcher, outputs, prompts, session, worktree
from core.config import DATABASES_DIR, THREADS_DIR

__all__ = [
    "ThreadAgentError",
    "ThreadAgentResult",
    "ThreadAgentTurn",
    "delete_thread",
    "run_turn",
]


class ThreadAgentError(RuntimeError):
    """A turn failure carrying the clinical query log gathered so far."""

    def __init__(self, message: str, *, query_log: list[dict] | None = None) -> None:
        super().__init__(message)
        self.query_log = list(query_log or [])


@dataclass(frozen=True)
class ThreadAgentTurn:
    """One user turn for a thread's agent.

    ``user_text`` is the user's RAW request — the runtime owns every character
    of prompt scaffolding around it. Attachments arrive STRUCTURED (the caller
    authorizes and loads them, never assembles text): ``scope`` / ``dataset``
    carry the per-message Dataset scope, ``template_id`` a pinned Template.
    ``authorize`` is the per-resource grants predicate the worktree projection
    is materialized through (absent → nothing is exposed, fail-closed).
    """

    thread_id: str
    user_text: str
    scope: dict[str, Any] | None = None
    dataset: dict[str, Any] | None = None
    template_id: str | None = None
    authorize: worktree.AuthorizeResource | None = None


@dataclass(frozen=True)
class ThreadAgentResult:
    """What one turn produced. ``kind`` is ``"answer"`` (text + citations),
    ``"table_request"`` (the recorded request; the backend pins and populates),
    or ``"questions"`` (structured ask-user questions awaiting the composer)."""

    kind: str
    answer: str = ""
    citations: list[dict] = field(default_factory=list)
    scope: dict[str, Any] | None = None
    query_log: list[dict] = field(default_factory=list)
    table_request: dict[str, Any] | None = None
    questions: list[dict] = field(default_factory=list)


def _relay_client():
    # Lazy: core.table_population imports agent modules for the table agent; importing it
    # at module load would cycle.
    from core import table_population

    relay = table_population.get_session_relay()
    return relay.agent_client() if relay is not None else None


async def run_turn(
    turn: ThreadAgentTurn,
    *,
    on_event: outputs.StreamCallback | None = None,
    client=None,
    threads_dir: Path | None = None,
    databases_dir: Path | None = None,
) -> ThreadAgentResult:
    """Run one turn against the thread's persistent agent session.

    Ensures the session (materializing the worktree so the authorized
    projection converges on current grants), clears the previous turn's sinks,
    sends the prompt — a new session's first turn carries the standing
    instructions, every later turn only the per-message prompt — and collects
    the outputs. ``on_event`` receives bounded ``chat_activity`` /
    ``chat_delta`` / ``chat_citation`` events while the turn streams.

    Raises :class:`ThreadAgentError` when the agent produced no output at all
    or the engine failed, and ``RuntimeError`` when no opencode client is
    available (none passed and the app relay is down).

    Two deliberate boundaries: the worktree's ``agent-activity.jsonl``
    transcript holds the LAST turn only (per-turn IPC posture — opencode owns
    the full history), and the authorized projection bounds what NEW reads a
    turn can make — the persistent session's conversation memory is
    thread-scoped, so anything an earlier caller's grants let the agent read
    remains in that thread's context (threads are not shareable; revisit with
    thread sharing).
    """
    threads_dir = THREADS_DIR if threads_dir is None else threads_dir
    databases_dir = DATABASES_DIR if databases_dir is None else databases_dir
    if client is None:
        client = _relay_client()
    if client is None:
        raise RuntimeError(
            "no opencode client is available to answer this thread (the opencode "
            "runtime is not configured)."
        )

    sess = await session.ensure_thread_session(
        turn.thread_id,
        client=client,
        threads_dir=threads_dir,
        databases_dir=databases_dir,
        authorize=turn.authorize,
    )
    outputs.clear_turn_outputs(sess.worktree_dir)
    answered_scope = dict(turn.scope or prompts.WHOLE_DB_SCOPE)
    if sess.created:
        prompt = prompts.first_turn_prompt(
            turn.user_text,
            worktree.registered_database_slugs(databases_dir),
            scope=answered_scope,
            dataset=turn.dataset,
            template_id=turn.template_id,
        )
    else:
        prompt = prompts.turn_prompt(
            turn.user_text,
            scope=answered_scope,
            dataset=turn.dataset,
            template_id=turn.template_id,
        )
    stream = outputs.AnswerStream(sess.worktree_dir, prompt=prompt, on_event=on_event)
    try:
        # The shared sub-agent launcher, in the thread agent's posture: the
        # thread's PERSISTENT session (reused, never deleted), rooted in the
        # thread's worktree, streaming into the per-turn answer sinks.
        await launcher.launch(
            client,
            workspace_dir=sess.worktree_dir,
            prompt=prompt,
            title=f"thread:{turn.thread_id}",
            session_id=sess.session_id,
            delete_session=False,
            on_activity=stream.forward_activity if on_event is not None else None,
            on_part=stream.on_part,
        )
        query_log = outputs.read_query_log(sess.worktree_dir)
        table_request = outputs.read_table_request(sess.worktree_dir)
        if table_request is not None:
            return ThreadAgentResult(
                kind="table_request",
                answer=stream.content,
                table_request=table_request,
                scope=answered_scope,
                query_log=query_log,
            )
        ask_path = sess.worktree_dir / outputs.ASK_USER_QUESTIONS_FILE
        if ask_path.is_file() and not stream.content.strip():
            return ThreadAgentResult(
                kind="questions",
                questions=outputs.read_asked_questions(sess.worktree_dir),
                scope=answered_scope,
                query_log=query_log,
            )
        answer = stream.content
        if not isinstance(answer, str) or not answer.strip():
            raise ValueError(
                "the turn produced no visible answer text; the agent must stream "
                "assistant text, request a table with table_execute, or ask "
                "questions with ask_user_question."
            )
        citations = outputs.read_citations(sess.worktree_dir) or list(stream.citations)
        return ThreadAgentResult(
            kind="answer",
            answer=answer,
            citations=citations,
            scope=answered_scope,
            query_log=query_log,
        )
    except ThreadAgentError:
        raise
    except Exception as exc:
        raise ThreadAgentError(
            str(exc), query_log=outputs.read_query_log(sess.worktree_dir)
        ) from exc


async def delete_thread(
    thread_id: str,
    *,
    client=None,
    threads_dir: Path | None = None,
) -> None:
    """Delete the thread's persistent agent session (best-effort: a missing
    client — the opencode runtime not configured — is a no-op; the caller owns
    deleting the thread's on-disk state)."""
    threads_dir = THREADS_DIR if threads_dir is None else threads_dir
    if client is None:
        client = _relay_client()
    if client is None:
        return
    await session.delete_thread_session(
        thread_id, client=client, threads_dir=threads_dir
    )
