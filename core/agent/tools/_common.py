from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


class ToolError(Exception):
    pass


CELL_RE = re.compile(r"^([A-Za-z]+)([1-9][0-9]*)$")


def agent_root() -> Path:
    """Return the agent/ project root (two parents up from tools/)."""
    return Path(__file__).resolve().parents[2]


def load_request() -> dict[str, Any]:
    raw = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    if not raw:
        raise ToolError("Missing JSON request.")
    request = json.loads(raw)
    if not isinstance(request, dict):
        raise ToolError("JSON request must be an object.")
    return request


def require_string(request: dict[str, Any], key: str) -> str:
    value = request.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ToolError(f"{key} is required.")
    return value.strip()


def require_string_value(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ToolError(f"{label} is required.")
    return value.strip()


def require_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ToolError(f"{label} is required and must be an object.")
    return value


def require_list(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise ToolError(f"{label} must be an array.")
    return value


def optional_string(value: Any, label: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ToolError(f"{label} must be a string.")
    return value.strip() or None


def run_tool_main(
    actions: dict[str, Any], error_class: type[Exception] = ToolError
) -> None:
    try:
        request = load_request()
        action = request.get("action")
        handler = actions.get(action)
        if handler is None:
            raise error_class(f"Unsupported action: {action}")
        response = handler(request)
    except error_class as exc:
        response = {"ok": False, "error": str(exc)}
    except json.JSONDecodeError as exc:
        response = {"ok": False, "error": f"Invalid JSON request: {exc}"}
    print(json.dumps(response, ensure_ascii=False, indent=2, sort_keys=True))
