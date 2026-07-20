"""The thread object: mint, append, persist, reload, list, delete.

A thread is the free-ranging, unscoped conversation surface (product-flows.md
§Threads, tables & outputs). It persists as one JSON file per thread at
``var/threads/<id>/thread.json`` (storage-layout.md §3), validated against
``thread.schema.json`` before every write — a malformed thread is never persisted.

This module is pure persistence + assembly:

- :func:`new_thread` mints a ``thread-<uuid>`` id and an empty, schema-valid thread.
- :func:`append_user_message` / :func:`append_agent_message` append one message and
  bump ``updated_at``; the user-message append derives the title from the FIRST user
  message (trimmed to ~60 chars).
- :func:`save_thread` / :func:`load_thread` / :func:`list_summaries` /
  :func:`delete_thread` are the disk operations. Listing is recency-ordered by
  ``updated_at`` DESC (product-flows.md — the Threads section is recency-ordered).

Request interpretation belongs to the agent. This module only stamps whatever
resolution metadata the route passes onto an agent message.
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from core.contracts import validate_against_schema

_SCHEMA_FILE = "thread.schema.json"
_THREAD_FILE = "thread.json"

# The default title until the first user message names the thread, and the trim
# ceiling for a derived title (storage contract / frozen schema).
DEFAULT_TITLE = "New thread"
_TITLE_MAX = 60


class ThreadError(ValueError):
    """A thread that cannot be loaded, persisted, or validated."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _derive_title(message: str) -> str:
    """A thread title from the first user message: trimmed of surrounding
    whitespace and truncated to ~60 chars (the frozen schema). Falls back to
    ``"New thread"`` for an empty message."""
    text = (message or "").strip()
    if not text:
        return DEFAULT_TITLE
    if len(text) > _TITLE_MAX:
        return text[:_TITLE_MAX].rstrip()
    return text


def _new_message_id() -> str:
    return f"msg-{uuid4().hex[:12]}"


def new_thread() -> dict[str, Any]:
    """Mint a fresh, empty, schema-valid thread (id ``thread-<uuid4 hex prefix>``).

    ``created_at`` and ``updated_at`` are set to now; ``title`` is the placeholder
    until the first user message derives it; ``messages`` and ``artifact_ids`` are
    empty (Issue 2 appends ``artifact_ids`` when a table spawns)."""
    now = _now_iso()
    return {
        "schema_version": "1",
        "id": f"thread-{uuid4().hex[:12]}",
        "title": DEFAULT_TITLE,
        "created_at": now,
        "updated_at": now,
        "status": "complete",
        "messages": [],
        "artifact_ids": [],
    }


def append_user_message(
    thread: dict[str, Any],
    content: str,
    *,
    attachments: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """Append a user message, bump ``updated_at``, and — if this is the FIRST user
    message — derive the thread title from it. Returns the same thread (mutated)."""
    is_first_user = not any(m.get("role") == "user" for m in thread.get("messages", []))
    message = {
        "id": _new_message_id(),
        "role": "user",
        "content": content,
        "created_at": _now_iso(),
    }
    if attachments:
        message["attachments"] = attachments
    thread.setdefault("messages", []).append(message)
    if is_first_user:
        thread["title"] = _derive_title(content)
    thread["updated_at"] = _now_iso()
    return thread


def append_agent_message(
    thread: dict[str, Any],
    content: str,
    *,
    resolution: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Append an agent message (optionally carrying its routing ``resolution``) and
    bump ``updated_at``. Returns the same thread (mutated)."""
    message: dict[str, Any] = {
        "id": _new_message_id(),
        "role": "agent",
        "content": content,
        "created_at": _now_iso(),
    }
    if resolution is not None:
        message["resolution"] = resolution
    thread.setdefault("messages", []).append(message)
    thread["updated_at"] = _now_iso()
    return thread


def save_thread(thread: dict[str, Any], *, threads_dir: Path) -> Path:
    """Persist ``thread`` to ``<threads_dir>/<id>/thread.json`` (validated first).

    Returns the written path. Raises :class:`ThreadError` if the thread has no id or
    fails schema validation — a malformed thread is never written. The write is
    atomic (tmp file + ``os.replace``) so a crashed write never leaves a half file.
    """
    thread_id = str(thread.get("id") or "").strip()
    if not thread_id:
        raise ThreadError("thread is missing its id")
    thread.setdefault("status", "complete")
    problems = validate_against_schema(thread, _SCHEMA_FILE)
    if problems:
        raise ThreadError("thread failed schema validation: " + "; ".join(problems))

    out_dir = threads_dir / thread_id
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / _THREAD_FILE
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(
        json.dumps(thread, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    tmp.replace(path)
    return path


def reset_running_threads(*, threads_dir: Path) -> int:
    """Settle every thread persisted mid-turn (``status="running"``) back to
    ``"complete"``. Called at server startup: a turn never survives the process,
    so a persisted "running" is always a dead turn — settling it keeps the
    concurrent-turn guard from ever bricking a thread across a crash. Returns
    how many threads were settled; idempotent."""
    if not threads_dir.is_dir():
        return 0
    settled = 0
    for thread_dir in threads_dir.iterdir():
        if not thread_dir.is_dir():
            continue
        try:
            thread = load_thread(thread_dir.name, threads_dir=threads_dir)
        except ThreadError:
            continue
        if thread.get("status") != "running":
            continue
        thread["status"] = "complete"
        thread["updated_at"] = _now_iso()
        try:
            save_thread(thread, threads_dir=threads_dir)
            settled += 1
        except ThreadError:
            continue
    return settled


def load_thread(thread_id: str, *, threads_dir: Path) -> dict[str, Any]:
    """Read a persisted thread by id. Raises :class:`ThreadError` if it is missing
    or not valid JSON."""
    path = threads_dir / thread_id / _THREAD_FILE
    if not path.exists():
        raise ThreadError(f"thread not found: {thread_id}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ThreadError(f"thread {thread_id} is invalid JSON: {exc}") from exc


def list_summaries(*, threads_dir: Path) -> list[dict[str, Any]]:
    """List thread summaries, recency-ordered by ``updated_at`` DESC (the Threads
    section ordering). Each summary is ``{ id, title, updated_at, message_count }``.
    A thread whose file is missing or unreadable is skipped, never listed broken."""
    if not threads_dir.is_dir():
        return []
    summaries: list[dict[str, Any]] = []
    for thread_dir in threads_dir.iterdir():
        if not thread_dir.is_dir():
            continue
        try:
            thread = load_thread(thread_dir.name, threads_dir=threads_dir)
        except ThreadError:
            continue
        summaries.append(
            {
                "id": str(thread.get("id") or thread_dir.name),
                "title": str(thread.get("title") or DEFAULT_TITLE),
                "updated_at": str(thread.get("updated_at") or ""),
                "message_count": len(thread.get("messages") or []),
                "status": (
                    "running" if thread.get("status") == "running" else "complete"
                ),
            }
        )
    summaries.sort(key=lambda s: s["updated_at"], reverse=True)
    return summaries


def delete_thread(thread_id: str, *, threads_dir: Path) -> None:
    """Remove ``<threads_dir>/<id>/``. Raises :class:`ThreadError` if it is absent."""
    thread_dir = threads_dir / thread_id
    if not thread_dir.is_dir():
        raise ThreadError(f"thread not found: {thread_id}")
    shutil.rmtree(thread_dir, ignore_errors=True)
