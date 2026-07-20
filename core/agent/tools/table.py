"""table_execute - primary chat-agent table sink.

This is the domain-level table interface exposed to the primary thread agent.
It does NOT launch table population itself: this tool runs inside the OpenCode
tool process, while live table-population tasks and their SSE relay are owned by
the server process. The tool records the agent's table request in the chat
worktree; the server reads it after the agent turn, pins the first-class table,
launches the existing table-population worker, and streams the table element to
the thread.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from _common import ToolError, load_request, optional_string, require_string
from _run_sql import load_context

_TABLE_REQUEST_FILE = "table_request.json"


def _ensure_chat_worktree(cwd: Path) -> None:
    context = load_context(cwd)
    if context.get("mode") != "chat":
        raise ToolError(
            "table_execute can only run in a chat worktree (context mode must be "
            "`chat`)."
        )


def _default_title(request_text: str) -> str:
    title = " ".join(request_text.split())
    if len(title) <= 80:
        return title
    return title[:77].rstrip() + "..."


def _record_table_request(request: dict[str, Any], cwd: Path) -> dict[str, Any]:
    _ensure_chat_worktree(cwd)
    request_text = require_string(request, "request")
    title = optional_string(request.get("title"), "title") or _default_title(
        request_text
    )
    payload = {
        "title": title,
        "request": request_text,
        "source_template": optional_string(
            request.get("source_template"), "source_template"
        ),
        "dataset_id": optional_string(request.get("dataset_id"), "dataset_id"),
        "description": optional_string(request.get("description"), "description"),
    }
    path = cwd / _TABLE_REQUEST_FILE
    if path.exists():
        raise ToolError(
            "a table request has already been recorded for this agent turn; call "
            "table_execute at most once."
        )
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True, "title": title}


def main() -> None:
    try:
        result = _record_table_request(load_request(), Path.cwd())
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ToolError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        raise SystemExit(2) from None


if __name__ == "__main__":
    main()
