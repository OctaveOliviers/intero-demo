"""Tier 3 — the opencode agent bridge (A1).

The thin Python edge between the orchestrator's run store and the opencode agent.
It does four concrete things and nothing else:

1. **Provisions the run worktree** the agent's tools resolve from: ``context.json``
   (cohort, anchor, per-DB cohort tables — no paths), the databases symlinked by
   name (``audit/cells.sqlite`` → run store, ``database/<slug>.sqlite`` → each
   clinical DB), and the models ``lookup_execute`` reads (``audit/spec.json``,
   ``database/<slug>.model.json``). The agent opens databases by name; it never
   sees a path or an identity.
2. **Builds a MINIMAL prompt**: which databases exist + "run the cell-fill skill".
   The how-to (find pending cells, look up specs, query, write with a source) all
   lives in the skill — not duplicated here — and the skill, not the prompt, owns
   the fact that a run may bind several databases.
3. **Drives one opencode session** rooted in the run worktree (``directory=`` the
   run dir, so the tools' working directory is where the context lives) — create →
   prompt → wait for idle. The agent works entirely through ``sql_execute`` and
   ``lookup_execute``; every cell write is validated by the store's DB triggers,
   so this module enforces nothing.
4. **Finalises**: any cell still ``pending`` when the session ends is settled
   ``blocked`` / ``NOT_LOCATED`` — the agent searched and could not place it.

The session is driven through an injected opencode client (the app's
``OpenCodeClient``); :func:`make_tier_agent` adapts ``try_agent`` to the
orchestrator's ``tier_agent`` seam. The provisioning, prompt, and finalize steps
are unit-testable without opencode running.
"""

from __future__ import annotations

import json
import logging
import shutil
import subprocess
import sys
from pathlib import Path

# Share the run-context schema with the agent's tool (single source of truth so
# the writer here and the reader in sql_execute can never drift apart). The
# agent template lives at core/agent/.opencode/ per storage-layout §2; the tools
# directory is a sibling we extend sys.path into once.
_TOOLS_DIR = Path(__file__).resolve().parents[1] / "agent" / ".opencode" / "tools"
if str(_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_TOOLS_DIR))
from _run_sql import build_context  # noqa: E402

from core.config import AGENT_OPENCODE_CONFIG, AGENT_OPENCODE_DIR, DATABASES_DIR  # noqa: E402
from core.running.provenance import make_attempt  # noqa: E402

logger = logging.getLogger(__name__)

_NOT_LOCATED = "NOT_LOCATED"


# --- 1. run context the agent's tools resolve from ---------------------------


def _current_commit_sha() -> str | None:
    """The HEAD commit SHA — the run's provenance stamp (storage-layout §6).

    Because the per-run ``.opencode`` is a symlink to live template code, the
    bytes of the tools and skills that ran are not captured by any copy. The
    SHA pins every tool/skill at once with zero duplication. Returns ``None``
    in environments without git (CI without repo metadata, packaged install).
    """
    repo = Path(__file__).resolve().parents[2]
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repo, capture_output=True, text=True, timeout=2, check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    sha = result.stdout.strip()
    return sha if result.returncode == 0 and sha else None


def write_run_context(run_store, run_dir: Path) -> Path:
    """Write ``<run_dir>/context.json`` — the sidecar the agent's tools read.

    Uses :func:`core/agent/.opencode/tools/_run_sql.build_context` so the
    WRITER here and the READER in ``sql_execute.py`` agree on the schema by
    construction. Carries NO filesystem paths: the databases are symlinked
    into the run dir (see :func:`provision_worktree`) and the tool opens them
    by name relative to its working directory. The context only holds what a
    symlink can't convey — the cohort identities, the cohort anchor, which
    tables of each bound database carry that anchor, and the **provenance
    SHA** (storage-layout §6).
    """
    databases = {
        slug: {"cohort_tables": list(run_store.cohort_tables.get(slug, []))}
        for slug in run_store.database_paths
    }
    context = build_context(
        run_id=run_store.run_id,
        anchor=run_store.anchor or "",
        cohort=list(run_store.cohort),
        databases=databases,
        provenance_sha=_current_commit_sha(),
    )
    run_dir.mkdir(parents=True, exist_ok=True)
    path = run_dir / "context.json"
    path.write_text(json.dumps(context, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


# --- 2. provision the run worktree the tools resolve from --------------------


def _symlink(link: Path, target: str) -> None:
    """Point ``link`` at ``target`` (replacing any existing link). The agent's
    tools open databases by these worktree-relative names, never by absolute
    path — so a run worktree is self-contained and mountable."""
    link.parent.mkdir(parents=True, exist_ok=True)
    if link.is_symlink() or link.exists():
        link.unlink()
    link.symlink_to(Path(target).resolve())


def _copy_canonical_model(databases_dir: Path, slug: str, dest: Path) -> None:
    """Copy ``<databases_dir>/<slug>/model.json`` to ``dest``.

    Reads the canonical schema view from disk on demand — the model is a
    per-database artifact, not run-scoped state. A missing or unreadable
    source is logged (not raised): provisioning continues without that
    slug's model rather than aborting the run. If the model isn't there
    yet, the agent's ``lookup_execute`` surfaces that to the LLM rather
    than silently introspecting the live SQLite (storage-layout §7)."""
    src = databases_dir / slug / "model.json"
    try:
        shutil.copy2(src, dest)
    except OSError as exc:
        logger.warning("provision_worktree: could not copy %s → %s (%s)", src, dest, exc)


def provision_worktree(
    run_store, run_dir: Path, *, databases_dir: Path = DATABASES_DIR
) -> None:
    """Stand up ``var/runs/<run_id>/`` as a self-contained opencode project root.

    The run dir is the directory opencode is launched from directly
    (storage-layout §4): its ``opencode.json`` makes it the project root
    without walk-up, the ``.opencode`` symlink references the committed
    template (`core/agent/.opencode`), and the data the agent touches is
    resolved relative to this dir.

    Contents laid down:

    * ``opencode.json`` — **copy** of ``core/agent/opencode.json``. Makes this
      dir the opencode root; carries no paths so a copy never goes stale.
    * ``.opencode`` — **symlink** to ``core/agent/.opencode``. Tools, skills,
      and ``node_modules`` are referenced from the one committed template; the
      ``.ts`` wrappers resolve their ``.py`` siblings and the repo-root venv
      via their real location, so the run dir inherits them without copying.
    * ``context.json`` — run metadata + the provenance git SHA (no paths).
    * ``audit/spec.json`` (copy) + ``audit/cells.sqlite`` (symlink → state DB).
    * ``database/<slug>.sqlite`` (symlink) + ``database/<slug>.model.json``
      (copy) per bound database — invariant "symlinks for code/binaries,
      copies for small JSON" (§7).

    The schema models are read straight from ``var/databases/<slug>/model.json``
    — they are per-database canonical artifacts, not run-scoped state, so
    they don't live on ``RunStore``. A missing or unreadable ``model.json``
    is logged and the slug is provisioned without it: ``lookup_execute``
    will then see no model and the agent can still query the live DB (the
    storage-layout §7 invariant is "schema from model.json, never live
    introspection" — when the canonical view is genuinely absent the agent
    is allowed to fail rather than fabricate a model).
    """
    if run_store.state_db_path == ":memory:":
        raise ValueError(
            "Tier 3 needs an on-disk run store: the agent's tools open the cell "
            "DB out-of-process via a symlink, which an in-memory store has no file "
            "for. Use a file-backed Store for a real run."
        )
    run_dir.mkdir(parents=True, exist_ok=True)

    # Make this dir the opencode project root: copy opencode.json (text, no
    # paths) and symlink .opencode → the template (one source of truth).
    shutil.copy2(AGENT_OPENCODE_CONFIG, run_dir / "opencode.json")
    _symlink(run_dir / ".opencode", str(AGENT_OPENCODE_DIR))

    write_run_context(run_store, run_dir)

    audit_dir = run_dir / "audit"
    audit_dir.mkdir(parents=True, exist_ok=True)
    (audit_dir / "spec.json").write_text(
        json.dumps(run_store.audit or {}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    _symlink(audit_dir / "cells.sqlite", run_store.state_db_path)

    db_dir = run_dir / "database"
    db_dir.mkdir(parents=True, exist_ok=True)
    for slug, path in run_store.database_paths.items():
        _symlink(db_dir / f"{slug}.sqlite", str(path))
        _copy_canonical_model(databases_dir, slug, db_dir / f"{slug}.model.json")


# --- 3. the (minimal) prompt -------------------------------------------------


def build_prompt(run_store) -> str:
    """The Tier-3 prompt — deliberately minimal.

    It names the databases the agent can address and hands off to the
    ``cell-fill`` skill for everything else. No worklist, no field specs, no
    schema dump (the agent discovers those through its tools, per the skill), and
    no single-database assumption (the skill owns the multi-database flow). Keep
    it this small: the skill is the one place the behaviour is maintained.
    """
    clinical = "\n".join(f'- "{slug}" — clinical database (read-only)'
                         for slug in sorted(run_store.database_paths)) \
        or "- (no clinical database bound)"
    return (
        "Fill this audit's pending cells. Follow the `cell-fill` skill — it "
        "explains exactly how, step by step.\n\n"
        "The databases you can address (pass the name to your tools):\n"
        '- "cells" — the audit worksheet you are filling (read and write)\n'
        f"{clinical}\n\n"
        "Field specifications and database schemas are available through "
        "`lookup_execute`. Begin."
    )


# --- 4. session-end fallback -------------------------------------------------


async def finalize_unresolved(run_store) -> int:
    """Settle every still-``pending`` cell as ``blocked`` / ``NOT_LOCATED``."""
    settled = 0
    for cell in run_store.open_cells():
        # No SQL ran for this final attempt — `make_attempt` omits `sql` (optional
        # on the contract) and carries the ``"(none)"`` database sentinel, matching
        # Tier 2's convention rather than a synthetic "(no further query)" marker.
        attempts = list(cell.attempts or []) + [
            make_attempt("agent", "(none)", error="agent could not locate a value")
        ]
        await run_store.update(
            cell.ref,
            state="blocked", resolved_by="agent", confidence="low",
            attempts=attempts, reason_code=_NOT_LOCATED,
            reason_detail=(
                f"agent searched and could not place a value for field "
                f"{cell.field!r} on patient {cell.member!r}"
            ),
        )
        settled += 1
    return settled


# --- 3. drive the opencode session -------------------------------------------


async def _drive_session(client, title: str, prompt: str, directory: str) -> None:
    """One opencode session, ROOTED IN THE RUN WORKTREE.

    ``directory`` is the per-run worktree (opencode-relative): the session — and
    therefore every tool call's working directory — is rooted there, so the tools
    resolve ``context.json`` / ``audit`` / ``database`` for THIS run. Mirrors the
    runner's pump (``run_audit.OpenCodeRunner._pump``): we wait for
    ``session.idle``; a ``session.error`` ends it (unresolved cells then fall to
    NOT_LOCATED). The client is the app's ``OpenCodeClient``.
    """
    session_id = await client.create_session(title=title, directory=directory)
    queue = await client.subscribe(session_id)
    try:
        await client.prompt_async(session_id, prompt, directory=directory)
        while True:
            event = await queue.get()
            etype = event.get("type")
            if etype == "session.idle":
                return
            if etype == "session.error":
                props = event.get("properties") or {}
                err = (props.get("error") or {}).get("message") or "session error"
                logger.warning("try_agent session error: %s", err)
                return
    finally:
        await client.unsubscribe(session_id)
        await client.delete_session(session_id, directory=directory)


async def try_agent(
    run_store,
    *,
    run_dir: Path,
    session_directory: str | None = None,
    databases_dir: Path = DATABASES_DIR,
    client=None,
) -> None:
    """Run Tier 3: provision the worktree, drive one agent session, finalise.

    ``run_dir`` is the filesystem run worktree (where the files are written);
    ``session_directory`` is the SAME directory as opencode addresses it (the
    agent-root-relative path the session is rooted in). With no client (or if the
    session ends with cells still open), the unresolved cells are settled
    ``blocked`` / ``NOT_LOCATED`` — the run never hangs on the agent.

    Database schema models are copied from ``<databases_dir>/<slug>/model.json``
    (the canonical view per storage-layout §3); ``databases_dir`` defaults to
    the deployment-wide ``var/databases/`` and is overridable for tests.
    """
    provision_worktree(run_store, run_dir, databases_dir=databases_dir)
    try:
        if client is not None and run_store.open_cells():
            prompt = build_prompt(run_store)
            await _drive_session(
                client, run_store.run_id, prompt, session_directory or str(run_dir)
            )
    finally:
        # A1's fallback is unconditional: whatever happens to the session —
        # transport error on create/subscribe/prompt, mid-session crash, or a
        # clean finish that left cells open — every still-pending cell is settled
        # blocked/NOT_LOCATED. The run never strands pending cells on Tier 3.
        await finalize_unresolved(run_store)


# --- the orchestrator seam ---------------------------------------------------


def make_tier_agent(
    *,
    run_dir: Path,
    session_directory: str | None = None,
    databases_dir: Path = DATABASES_DIR,
    client=None,
):
    """Adapt :func:`try_agent` to the orchestrator's ``tier_agent`` signature.

    ``orchestrate_run`` calls each tier as ``tier(run_store)``; the run-specific
    dependencies (the worktree, the opencode client) are closed over here. The
    canonical schema view is read from ``<databases_dir>/<slug>/model.json``
    (default ``var/databases/``); pass a different path in tests. This is the
    seam that wires Tier 3 into the spine: the orchestrator's production caller
    builds the agent tier with ``make_tier_agent(...)`` and passes it as
    ``tier_agent=``.
    """
    async def tier_agent(run_store) -> None:
        await try_agent(
            run_store,
            run_dir=run_dir,
            session_directory=session_directory,
            databases_dir=databases_dir,
            client=client,
        )

    return tier_agent
