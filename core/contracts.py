"""Validation against the S0 contract schemas.

Every persisted artifact (spec.json, model.json, mapping.json, dataset.json,
thread.json, table.json, ...) is validated against its JSON Schema contract in
`specs/product/contracts/` before being written, so a malformed document is
never persisted. This module is the single owner of that guard: it loads and
caches the contract schemas and turns validation errors into human-readable
problem strings the builders can feed back to an LLM or raise to a caller.
"""

from __future__ import annotations

import functools
import json
from typing import Any

import jsonschema

from core.config import ROOT

_CONTRACTS_DIR = ROOT / "specs" / "product" / "contracts"


@functools.lru_cache(maxsize=None)
def _load_schema(schema_filename: str) -> dict[str, Any]:
    path = _CONTRACTS_DIR / schema_filename
    return json.loads(path.read_text(encoding="utf-8"))


def validate_against_schema(instance: Any, schema_filename: str) -> list[str]:
    """Validate `instance` against an S0 contract schema; return a list of
    human-readable problems (empty means valid). Used as the final guard before
    any model is written, so a malformed document is never persisted."""
    schema = _load_schema(schema_filename)
    validator = jsonschema.Draft202012Validator(schema)
    problems: list[str] = []
    for error in sorted(validator.iter_errors(instance), key=lambda e: list(e.path)):
        location = "/".join(str(p) for p in error.path) or "(root)"
        problems.append(f"{location}: {error.message}")
    return problems
