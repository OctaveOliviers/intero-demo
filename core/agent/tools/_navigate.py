"""Shared substrate for the navigate tools — bound-database discovery.

The bound databases for a run are exactly the ``<slug>.model.json`` files in the
run worktree's ``databases/`` folder (the same files ``lookup`` reads). The
navigate tools (``search`` first, then ``catalog`` / ``describe`` /
``join-paths``) all start from this enumeration, so it lives here once.

These helpers read ``model.json`` ONLY — they never open a SQLite database, run
SQL, or touch anything else. The model-loading style mirrors ``lookup._read_json``
(raise ``ToolError`` on a missing/unreadable file).
"""

from __future__ import annotations

import json
from pathlib import Path

from _common import ToolError

_MODEL_SUFFIX = ".model.json"
_SPEC_NAME = "spec.json"
_DATASET_FILE = "dataset.json"


def load_model(path: Path) -> dict:
    """Load one ``model.json`` — mirrors ``lookup._read_json``.

    A model's TOP LEVEL must be a JSON object: every navigate tool does
    ``model.get(...)`` on it. Reject a non-dict top level (e.g. a bare JSON
    array) with a ``ToolError`` here, at the single shared point, so all four
    tools get the ``{"ok": false, "error": …}`` + exit-2 contract instead of a
    raw ``AttributeError`` + exit 1."""
    if not path.is_file():
        raise ToolError(f"model not found: {path}")
    try:
        model = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise ToolError(f"model is unreadable: {path}: {exc}") from exc
    if not isinstance(model, dict):
        raise ToolError(f"model is not a JSON object: {path}")
    return model


def bound_databases(cwd: Path):
    """Yield ``(slug, model_dict)`` for every bound database, sorted by slug.

    A bound database is a ``databases/<slug>.model.json`` file; the slug is the
    filename with the trailing ``.model.json`` removed (slugs contain hyphens,
    e.g. ``cord-ph``, ``npda-clinical``).
    """
    db_dir = cwd / "databases"
    if not db_dir.is_dir():
        return
    for path in sorted(db_dir.glob(f"*{_MODEL_SUFFIX}")):
        slug = path.name[: -len(_MODEL_SUFFIX)]
        yield slug, load_model(path)


def load_spec(path: Path) -> dict:
    """Load one audit ``spec.json`` — the templates analogue of ``load_model``.

    A spec's TOP LEVEL must be a JSON object (the templates collection does
    ``spec.get(...)`` on it). A missing/unreadable/non-object file is a
    ``ToolError`` here, at the single shared point, so the navigation verbs get
    the ``{"ok": false, "error": …}`` + exit-2 contract instead of a raw
    traceback + exit 1."""
    if not path.is_file():
        raise ToolError(f"template spec not found: {path}")
    try:
        spec = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise ToolError(f"template spec is unreadable: {path}: {exc}") from exc
    if not isinstance(spec, dict):
        raise ToolError(f"template spec is not a JSON object: {path}")
    return spec


def bound_templates(cwd: Path):
    """Yield ``(template_id, spec_dict)`` for every saved template, sorted by id.

    A saved template is a ``templates/<id>/spec.json`` file (storage-layout §3);
    the id is the ``templates/`` subdirectory name (e.g. ``cord-ph``, ``npda``).
    Run-worktree-relative, exactly as ``bound_databases`` reads
    ``databases/<slug>.model.json`` — the agent never sees an absolute path.
    """
    templates_dir = cwd / "templates"
    if not templates_dir.is_dir():
        return
    for spec_path in sorted(templates_dir.glob(f"*/{_SPEC_NAME}")):
        template_id = spec_path.parent.name
        yield template_id, load_spec(spec_path)


def bound_datasets(cwd: Path):
    """Yield ``(dataset_id, dataset_dict)`` for every saved Dataset, sorted by id.

    A saved Dataset is a ``datasets/<dataset_id>/dataset.json`` file (storage-layout
    §3); the id is the sub-directory name (e.g. ``dataset-cordph-term-nicu``).
    Mirrors ``bound_databases``' cwd-relative enumeration — the agent never sees an
    absolute path. Reads ``dataset.json`` ONLY (via ``load_model``'s JSON-object
    contract), never a SQLite database, never SQL.
    """
    datasets_dir = cwd / "datasets"
    if not datasets_dir.is_dir():
        return
    for path in sorted(datasets_dir.glob(f"*/{_DATASET_FILE}")):
        dataset_id = path.parent.name
        yield dataset_id, load_model(path)
