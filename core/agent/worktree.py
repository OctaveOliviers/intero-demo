"""Materialize agent worktrees — the one seam that turns a directory into an
opencode project root referencing the canonical committed bundle.

The canonical agent bundle lives flat under ``core/agent/`` (storage-layout §2):
``tools/``, ``skills/``, ``node_modules/`` (installed, gitignored) and the
template ``opencode.json``. A worktree — a table-agent artifact workspace under
``var/artifacts/<id>/`` or a thread's chat dir under ``var/threads/<id>/opencode/`` — never copies that
code: :func:`materialize_opencode_root` lays down an ``opencode.json`` copy (the
project-root marker; carries no paths) and a REAL ``.opencode/`` directory whose
``tools`` / ``skills`` / ``node_modules`` entries are symlinks into the bundle,
so tool and skill code has exactly one source of truth.

This module also owns the one ``sys.path`` bridge into the tools directory: the
tool implementations are plain scripts importing each other as top-level modules
(opencode runs them by path), so backend code that needs ``build_context`` — the
single source of truth for the ``context.json`` shape — imports it from here
rather than re-deriving the tools path.
"""

from __future__ import annotations

import json
import logging
import shutil
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

from core.config import (
    AGENT_DIR,
    AGENT_OPENCODE_CONFIG,
    DATABASES_DIR,
    DATASETS_DIR,
    TEMPLATES_DIR,
)

TOOLS_DIR = AGENT_DIR / "tools"
SKILLS_DIR = AGENT_DIR / "skills"
NODE_MODULES_DIR = AGENT_DIR / "node_modules"

# The tools are scripts, not a package: they import one another as top-level
# modules. Extend sys.path ONCE, here, so the backend shares the exact
# context-schema code the in-worktree reader runs (writer/reader can't drift).
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))
from _run_sql import build_context  # noqa: E402

logger = logging.getLogger(__name__)

# The per-resource authorization predicate ``materialize`` projects the library
# collections through: ``authorize(resource_type, resource_id) -> bool`` with
# resource_type one of ``"dataset"`` / ``"template"``. Injected — the grants
# store lives in the server layer, which core must not import — and ABSENT
# means DENY ALL: a caller that forgets it exposes nothing, never everything.
AuthorizeResource = Callable[[str, str], bool]

__all__ = [
    "AuthorizeResource",
    "NODE_MODULES_DIR",
    "SKILLS_DIR",
    "TOOLS_DIR",
    "build_context",
    "canonical_navigation",
    "copy_canonical_model",
    "materialize",
    "materialize_opencode_root",
    "registered_database_slugs",
    "symlink",
]


def symlink(link: Path, target: str | Path) -> None:
    """Point ``link`` at ``target`` (replacing any existing link or file). The
    agent's tools open everything by worktree-relative names, never by absolute
    path — so a worktree is self-contained and mountable."""
    link.parent.mkdir(parents=True, exist_ok=True)
    if link.is_symlink() or link.exists():
        link.unlink()
    link.symlink_to(Path(target).resolve())


def materialize_opencode_root(
    worktree_dir: Path, *, config: dict[str, Any] | None = None
) -> None:
    """Make ``worktree_dir`` a self-contained opencode project root.

    * ``opencode.json`` — a copy of the committed template (its presence makes
      this dir the project root, no walk-up), or ``config`` serialized when the
      caller needs a transformed permission set (the chat profile).
    * ``.opencode/`` — a real directory holding three symlinks into the
      canonical bundle: ``tools`` and ``skills`` (the agent's code) and
      ``node_modules`` (the ``.ts`` wrappers' plugin dependency, resolvable
      whether or not the module loader canonicalizes symlinked paths).

    Idempotent: re-running converges on the same layout.
    """
    worktree_dir.mkdir(parents=True, exist_ok=True)
    if config is None:
        shutil.copy2(AGENT_OPENCODE_CONFIG, worktree_dir / "opencode.json")
    else:
        (worktree_dir / "opencode.json").write_text(
            json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    dot = worktree_dir / ".opencode"
    if dot.is_symlink():
        # A pre-move worktree symlinked the whole template dir; replace it with
        # the materialized layout.
        dot.unlink()
    dot.mkdir(parents=True, exist_ok=True)
    symlink(dot / "tools", TOOLS_DIR)
    symlink(dot / "skills", SKILLS_DIR)
    symlink(dot / "node_modules", NODE_MODULES_DIR)


def thread_agent_opencode_config() -> dict[str, Any]:
    """The thread agent's opencode config profile.

    The committed template config is intentionally table-run shaped: it permits
    `table-fill` + `lookup_execute` and its provider block substitutes the
    ``LLM_TABLE_*`` env keys. A thread agent session gets the same provider
    SHAPE but pointed at the ``LLM_THREAD_*`` keys — the per-worktree config is
    what selects each agent's model on the one shared opencode server
    (contracts/model-config.md) — and only the chat sinks are writable.
    """
    text = AGENT_OPENCODE_CONFIG.read_text(encoding="utf-8")
    if "LLM_TABLE_" not in text:
        raise ValueError(
            "core/agent/opencode.json no longer names the LLM_TABLE_* env keys; "
            "the thread-agent provider rewrite would silently keep the wrong model"
        )
    config = json.loads(text.replace("LLM_TABLE_", "LLM_THREAD_"))
    permissions = config.setdefault("permission", {})
    permissions["*"] = "deny"
    permissions["sql_execute"] = "allow"
    permissions["cite_execute"] = "allow"
    permissions["ask_user_question"] = "allow"
    permissions["table_execute"] = "allow"
    permissions["catalog_execute"] = "allow"
    permissions["search_execute"] = "allow"
    permissions["describe_execute"] = "allow"
    permissions["join_paths_execute"] = "allow"
    permissions.pop("lookup_execute", None)

    skill_permissions = permissions.setdefault("skill", {})
    skill_permissions.clear()
    skill_permissions.update(
        {
            "*": "deny",
            "chat-answer": "allow",
            "navigate": "allow",
            "evidence": "allow",
        }
    )
    return config


def registered_database_slugs(databases_dir: Path) -> list[str]:
    """The registered database slugs: every subdir of ``databases_dir`` holding a
    ``database.sqlite`` + ``model.json`` (the deployment storage layout,
    storage-layout §3). This is the whole-hospital-DB ceiling an agent may read
    — fail-closed at this set."""
    if not databases_dir.is_dir():
        return []
    return [
        sub.name
        for sub in sorted(p for p in databases_dir.iterdir() if p.is_dir())
        if (sub / "database.sqlite").exists() and (sub / "model.json").exists()
    ]


def canonical_navigation(databases_dir: Path, slug: str) -> tuple[list, list]:
    """``(identity_links, foreign_keys)`` from ``<databases_dir>/<slug>/model.json``.

    The SAME canonical map prepopulate reads — never a hand-authored copy. A
    missing/unreadable model yields empty lists: the tool then bounds only
    anchor-bearing tables for that slug rather than over-reaching."""
    src = databases_dir / slug / "model.json"
    try:
        model = json.loads(src.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("canonical_navigation: could not read %s (%s)", src, exc)
        return [], []
    return (
        list(model.get("identity_links") or []),
        list(model.get("foreign_keys") or []),
    )


def copy_canonical_model(databases_dir: Path, slug: str, dest: Path) -> None:
    """Copy ``<databases_dir>/<slug>/model.json`` to ``dest``.

    Reads the canonical schema view from disk on demand — the model is a
    per-database artifact, not worktree-scoped state. A missing or unreadable
    source is logged (not raised): provisioning continues without that slug's
    model rather than aborting; the agent's tools surface the absence to the
    LLM instead of silently introspecting the live SQLite (storage-layout §7)."""
    src = databases_dir / slug / "model.json"
    try:
        shutil.copy2(src, dest)
    except OSError as exc:
        logger.warning(
            "copy_canonical_model: could not copy %s → %s (%s)", src, dest, exc
        )


def _project_library(
    collection_dir: Path,
    library_dir: Path,
    resource_type: str,
    authorize: AuthorizeResource | None,
) -> None:
    """Converge ``collection_dir`` on per-id symlinks for EXACTLY the library
    ids ``authorize`` approves.

    The collection dir is materialization-owned projection state: an entry the
    predicate no longer approves (a revoked grant) is REMOVED on re-run, and
    with no predicate nothing is approved. The whole library is never linked as
    one folder — only approved ids, one symlink each, so an agent walking its
    worktree can never even enumerate unauthorized resource metadata."""
    collection_dir.mkdir(parents=True, exist_ok=True)
    approved: set[str] = set()
    if authorize is not None and library_dir.is_dir():
        for entry in sorted(p for p in library_dir.iterdir() if p.is_dir()):
            if authorize(resource_type, entry.name):
                approved.add(entry.name)
    for existing in collection_dir.iterdir():
        if existing.name in approved:
            continue
        if existing.is_symlink() or existing.is_file():
            existing.unlink()
        else:
            shutil.rmtree(existing)
    for resource_id in sorted(approved):
        symlink(collection_dir / resource_id, library_dir / resource_id)


def materialize(
    worktree_dir: Path,
    *,
    authorize: AuthorizeResource | None = None,
    databases_dir: Path | None = None,
    datasets_dir: Path | None = None,
    templates_dir: Path | None = None,
    config: dict[str, Any] | None = None,
) -> None:
    """Materialize a THREAD agent worktree (storage-layout §3, the
    ``var/threads/<id>/opencode/`` shape).

    * the opencode project root — :func:`materialize_opencode_root` (pass
      ``config`` for a profile-transformed ``opencode.json``);
    * ``databases/`` — EVERY registered clinical database, symlinked read-only
      by slug with its canonical ``model.json`` copied beside it: the
      whole-hospital-DB ceiling, fail-closed at the registered set (read-only
      enforcement lives in the SQL tools, which open these by name);
    * ``datasets/<id>`` and ``templates/<id>`` — per-id symlinks into the
      libraries for EXACTLY the ids ``authorize`` approves (none without a
      predicate); a re-run converges on the current grants;
    * ``context.json`` — chat mode, per-slug navigation metadata, no cohort.

    Idempotent; the directory paths default to the deployment layout and are
    resolved at call time so tests may redirect the module constants.
    """
    databases_dir = DATABASES_DIR if databases_dir is None else databases_dir
    datasets_dir = DATASETS_DIR if datasets_dir is None else datasets_dir
    # The Template library lives at var/templates/; the agent-facing collection
    # name is `templates/` too.
    templates_dir = TEMPLATES_DIR if templates_dir is None else templates_dir

    materialize_opencode_root(worktree_dir, config=config)

    db_dir = worktree_dir / "databases"
    db_dir.mkdir(parents=True, exist_ok=True)
    databases: dict[str, dict[str, Any]] = {}
    for slug in registered_database_slugs(databases_dir):
        symlink(db_dir / f"{slug}.sqlite", databases_dir / slug / "database.sqlite")
        copy_canonical_model(databases_dir, slug, db_dir / f"{slug}.model.json")
        identity_links, foreign_keys = canonical_navigation(databases_dir, slug)
        # A chat has no cohort, so no cohort_tables — the whole DB is in scope.
        databases[slug] = {
            "cohort_tables": [],
            "identity_links": identity_links,
            "foreign_keys": foreign_keys,
        }

    _project_library(worktree_dir / "datasets", datasets_dir, "dataset", authorize)
    _project_library(worktree_dir / "templates", templates_dir, "template", authorize)

    context = build_context(mode="chat", databases=databases)
    (worktree_dir / "context.json").write_text(
        json.dumps(context, ensure_ascii=False, indent=2), encoding="utf-8"
    )
