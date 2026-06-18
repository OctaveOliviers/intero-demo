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

import asyncio
import json
import logging
import shutil
import subprocess
import sys
from datetime import datetime, timezone
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


def _column_triage(run_store) -> str:
    """The pending work grouped by field (one field = one worksheet column),
    classed EMPTY / PARTIAL / INTERPRET — the lean overview 5-run-engine.md
    specifies for Tier 3, computed deterministically here so the agent starts
    column-first instead of reconstructing the grid cell-by-cell.

    * EMPTY — no member has a value: one source column likely fills the whole
      worksheet column in one pass.
    * PARTIAL — earlier tiers filled some members: the filled siblings'
      ``sources`` say where the data lives; only the stragglers need work.
    * INTERPRET — judged from free text: irreducibly cell-by-cell.

    Distinct ``hypothesis`` notes left by earlier tiers ride along per field.
    """
    names = {f.get("id"): f.get("name")
             for f in (run_store.audit or {}).get("fields", []) or []}
    by_field: dict[str, list] = {}
    for cell in run_store.cells():
        by_field.setdefault(cell.field, []).append(cell)

    empty: list[str] = []
    partial: list[str] = []
    interpret: list[str] = []
    for field in sorted(by_field):
        cells = by_field[field]
        pending = [c for c in cells if c.state == "pending"]
        if not pending:
            continue
        name = names.get(field)
        label = f'`{field}` ("{name}")' if name else f"`{field}`"
        line = f"- {label}: {len(pending)} of {len(cells)} cells pending"
        hypotheses = sorted({c.hypothesis for c in pending if c.hypothesis})
        if hypotheses:
            line += f" — earlier tiers noted: {'; '.join(hypotheses)}"
        if any(c.kind == "interpret" for c in pending):
            interpret.append(line)
        elif len(pending) == len(cells):
            empty.append(line)
        else:
            partial.append(line)

    sections: list[str] = []
    if empty:
        sections.append(
            "EMPTY columns — no member has a value yet; find the one source "
            "column, then fill the whole worksheet column in one pass:\n"
            + "\n".join(empty)
        )
    if partial:
        sections.append(
            "PARTIAL columns — earlier tiers filled the other members; read a "
            "filled sibling's `sources` to see where the data lives, then "
            "resolve only the stragglers:\n" + "\n".join(partial)
        )
    if interpret:
        sections.append(
            "INTERPRET cells — judged from free text; work these cell-by-cell:\n"
            + "\n".join(interpret)
        )
    if not sections:
        return ""
    return (
        "Work column-first, in this order. The pending work, triaged by field "
        "(one field = one worksheet column):\n\n" + "\n\n".join(sections)
    )


def build_prompt(run_store) -> str:
    """The Tier-3 prompt: the databases the agent can address, plus a
    deterministic column-first triage of the pending work.

    The triage (see :func:`_column_triage`) is the one piece of worklist the
    prompt carries — per-field counts and classes, never per-cell refs, field
    codes, or schema dumps (the agent reads those through its tools, per the
    skill). Everything procedural stays in the ``cell-fill`` skill — the skill
    is the one place the behaviour is maintained — and the skill, not the
    prompt, owns the fact that a run may bind several databases.
    """
    clinical = "\n".join(f'- "{slug}" — clinical database (read-only)'
                         for slug in sorted(run_store.database_paths)) \
        or "- (no clinical database bound)"
    triage = _column_triage(run_store)
    triage_block = f"{triage}\n\n" if triage else ""
    return (
        "Fill this audit's pending cells. Follow the `cell-fill` skill — it "
        "explains exactly how, step by step.\n\n"
        "The databases you can address (pass the name to your tools):\n"
        '- "cells" — the audit worksheet you are filling (read and write)\n'
        f"{clinical}\n\n"
        f"{triage_block}"
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


def _cell_signature(cell) -> tuple:
    """What a poll compares to detect an agent write: the value/state ladder
    plus the review-facing fields the FE renders from cell metadata."""
    return (cell.state, cell.value, cell.confidence, cell.reason_code)


def _changed_cells(run_store, seen: dict[str, tuple]) -> list:
    """Diff the store against ``seen`` (ref -> signature), update ``seen`` in
    place, and return the cells that changed since the last poll."""
    changed = []
    for cell in run_store.cells():
        signature = _cell_signature(cell)
        if seen.get(cell.ref) != signature:
            seen[cell.ref] = signature
            changed.append(cell)
    return changed


# Forward the agent's live activity (doc 11 §agent_activity): turn opencode
# ``message.part.updated`` parts into the same `activity` events the FE already
# renders, so the run stream follows the agent's tool calls and thinking — not
# just the coarse between-tier steps.
_TOOL_LABELS = {
    "sql_execute": "the database",
    "lookup_execute": "the spec",
}
_PART_TEXT_BUCKET = 400  # forward a thinking/text part ~every 400 chars of growth


def agent_activity_from_part(part: dict, seen: dict[str, str]) -> dict | None:
    """Map one opencode message part to a forwarded activity payload.

    Returns ``{"headline", "label", "kind", "id"}`` to forward, or ``None`` when
    the part carries nothing new. The ``headline`` is the FULL, untruncated text
    (the FE caps the DISPLAY to ~280 chars and expands on click — capping here
    would mean the full thinking never reaches the UI). The ``id`` (the part id)
    lets the FE upsert: a streaming part collapses into one growing line, not many
    partial copies. ``seen`` (part-key -> last signature) is updated in place to
    BOUND how often we re-emit — without it the token-by-token part stream would
    flood the SSE link:

    * ``tool`` parts forward once per status transition (running / completed /
      error) — a few per tool call.
    * ``reasoning`` / ``text`` parts forward once per ~400 chars of growth, each
      carrying the full text so far (the driver also flushes the final text on
      session end so the tail is never lost).

    Pure + deterministic so the mapping is unit-tested without opencode running.
    """
    if not isinstance(part, dict):
        return None
    ptype = part.get("type")
    part_id = str(part.get("id") or part.get("callID") or "")

    if ptype == "tool":
        tool_name = str(part.get("tool") or "tool")
        state = part.get("state")
        if not isinstance(state, dict):
            state = {}
        status = str(state.get("status") or "")
        if status not in ("running", "completed", "error"):
            return None
        key = part_id or f"tool:{tool_name}"
        sig = f"tool:{status}"
        if seen.get(key) == sig:
            return None
        seen[key] = sig
        title = str(state.get("title") or "").strip()
        target = _TOOL_LABELS.get(tool_name)
        if status == "running":
            label = f"Querying {target}" if target else f"Running {tool_name}"
            headline = title or label
        elif status == "error":
            label = "Tool call failed"
            headline = title or f"{tool_name} returned an error"
        else:  # completed
            label = f"Read {target}" if target else f"{tool_name} done"
            headline = title or label
        return {"headline": headline, "label": label, "kind": "tool", "id": part_id}

    if ptype in ("reasoning", "text"):
        text = str(part.get("text") or "").strip()
        if not text:
            return None
        key = part_id or f"{ptype}:0"
        sig = f"{ptype}:{len(text) // _PART_TEXT_BUCKET}"
        if seen.get(key) == sig:
            return None
        seen[key] = sig
        label = "Thinking" if ptype == "reasoning" else "Writing a note"
        return {"headline": text, "label": label, "kind": "thinking", "id": part_id}

    return None


# Full-fidelity transcript for OFFLINE EVALUATION of the agent's process (doc 11
# §agent_activity). The live UI stream is deliberately bounded (agent_activity_
# from_part truncates thinking and dedups tool calls); for judging how well the
# agent reasoned, which queries it ran and what they returned, how efficient it
# was, and whether the prompt / tool descriptions / DB model / audit spec need
# work, we persist the COMPLETE, untruncated session to var/runs/<id>/. The
# agent's INPUTS already live in the run dir (context.json, audit/spec.json,
# database/<slug>.model.json); this adds the PROCESS + OUTPUT.


def _part_transcript_record(part: dict) -> dict | None:
    """Normalize one opencode message part into a transcript record carrying its
    FULL content (untruncated tool input/output, full reasoning text, timings).
    Returns None for parts with no evaluable content (step markers, empty text).
    Pure + deterministic so it is unit-testable without opencode running."""
    if not isinstance(part, dict):
        return None
    ptype = part.get("type")
    pid = str(part.get("id") or part.get("callID") or "")
    if ptype == "tool":
        state = part.get("state") if isinstance(part.get("state"), dict) else {}
        return {
            "id": pid,
            "kind": "tool",
            "tool": part.get("tool"),
            "status": state.get("status"),
            "title": state.get("title"),
            "input": state.get("input"),
            "output": state.get("output"),
            "time": state.get("time"),
        }
    if ptype in ("reasoning", "text"):
        text = part.get("text")
        if not (isinstance(text, str) and text.strip()):
            return None
        return {
            "id": pid,
            "kind": "thinking" if ptype == "reasoning" else "text",
            "text": text,
            "time": part.get("time"),
        }
    return None


def _transcript_stats(records: list[dict]) -> dict:
    """Efficiency metrics over a transcript's records — the at-a-glance view for
    evaluating how the agent spent its turn (how many tool calls, of what, how
    much it reasoned, how many tool errors)."""
    tools = [r for r in records if r.get("kind") == "tool"]
    thinking = [r for r in records if r.get("kind") == "thinking"]
    by_tool: dict[str, int] = {}
    for r in tools:
        name = r.get("tool") or "unknown"
        by_tool[name] = by_tool.get(name, 0) + 1
    return {
        "parts": len(records),
        "tool_calls": len(tools),
        "tool_calls_by_name": by_tool,
        "tool_errors": sum(1 for r in tools if r.get("status") == "error"),
        "thinking_blocks": len(thinking),
        "thinking_chars": sum(len(r.get("text") or "") for r in thinking),
        "text_blocks": sum(1 for r in records if r.get("kind") == "text"),
    }


def write_agent_activity_log(
    log_dir: Path,
    *,
    run_id: str,
    execution_id: str | None,
    session_id: str | None,
    prompt: str | None,
    databases: list[str] | None,
    records: list[dict],
    started_at: datetime | None,
    ended_at: datetime | None,
    error: str | None = None,
) -> Path | None:
    """Persist the Tier-3 transcript as JSONL to ``var/runs/<run_id>/``.

    Line 1 is a ``{"kind": "meta", ...}`` header (the prompt, databases, timings,
    error, and efficiency ``stats``); each subsequent line is one part record in
    transcript order. Refresh executions get their own
    ``agent-activity.<execution_id>.jsonl`` so a re-run never clobbers the
    original. Best-effort: a logging failure is swallowed, never failing the run.
    """
    try:
        suffix = f".{execution_id}" if execution_id else ""
        path = log_dir / f"agent-activity{suffix}.jsonl"
        duration = None
        if started_at is not None and ended_at is not None:
            duration = round((ended_at - started_at).total_seconds(), 3)
        meta = {
            "kind": "meta",
            "run_id": run_id,
            "execution_id": execution_id,
            "session_id": session_id,
            "started_at": started_at.isoformat() if started_at else None,
            "ended_at": ended_at.isoformat() if ended_at else None,
            "duration_s": duration,
            "databases": list(databases or []),
            "error": error,
            "prompt": prompt,
            "stats": _transcript_stats(records),
        }
        lines = [json.dumps(meta, ensure_ascii=False, default=str)]
        lines += [json.dumps(r, ensure_ascii=False, default=str) for r in records]
        log_dir.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return path
    except Exception:
        logger.exception("write_agent_activity_log failed for run %s", run_id)
        return None


async def _drive_session(
    client, title: str, prompt: str, directory: str, run_store=None,
    poll_interval: float = 1.0, log_dir: Path | None = None,
) -> None:
    """One opencode session, ROOTED IN THE RUN WORKTREE.

    ``directory`` is the per-run worktree (opencode-relative): the session — and
    therefore every tool call's working directory — is rooted there, so the tools
    resolve ``context.json`` / ``audit`` / ``database`` for THIS run. We wait for
    ``session.idle``; a ``session.error`` ends it (unresolved cells then fall to
    NOT_LOCATED). The client is the app's ``OpenCodeClient``.

    While waiting, the store is polled every ``poll_interval`` seconds and any
    cell the agent wrote since the last poll is rebroadcast as a ``cell_update``
    (persist + stream). The agent writes the cell SQLite out-of-process, so
    nothing else emits for those writes — without this bridge the FE shows no
    Tier-3 fills until the run ends.
    """
    # Baseline BEFORE the session exists: anything that differs later was
    # written by the agent and needs rebroadcasting.
    seen: dict[str, tuple] = {}
    if run_store is not None:
        for cell in run_store.cells():
            seen[cell.ref] = _cell_signature(cell)
    # Per-part signatures so the agent's tool/thinking parts forward without
    # flooding (see agent_activity_from_part).
    seen_parts: dict[str, str] = {}
    # Full-fidelity transcript (id -> latest record) for offline evaluation,
    # written to var/runs/<id>/ on session end. Distinct from the bounded UI
    # forward above — this keeps the WHOLE thinking + tool I/O.
    transcript: dict[str, dict] = {}
    session_error: str | None = None
    session_started = datetime.now(timezone.utc)
    session_id = await client.create_session(title=title, directory=directory)
    queue = await client.subscribe(session_id)

    async def poll() -> None:
        if run_store is None:
            return
        changed = _changed_cells(run_store, seen)
        if changed:
            await run_store.rebroadcast(changed)

    try:
        await client.prompt_async(session_id, prompt, directory=directory)
        loop = asyncio.get_running_loop()
        last_poll = loop.time()
        while True:
            # Cap the wait so a chatty event stream can't starve the poll, and
            # a silent one still polls every interval.
            wait = max(0.05, poll_interval - (loop.time() - last_poll))
            try:
                event = await asyncio.wait_for(queue.get(), timeout=wait)
            except asyncio.TimeoutError:
                event = None
            if loop.time() - last_poll >= poll_interval:
                await poll()
                last_poll = loop.time()
            if event is None:
                continue
            etype = event.get("type")
            if etype == "session.idle":
                return
            if etype == "session.error":
                props = event.get("properties") or {}
                err = (props.get("error") or {}).get("message") or "session error"
                session_error = err
                logger.warning("try_agent session error: %s", err)
                return
            if etype == "message.part.updated":
                part = (event.get("properties") or {}).get("part") or {}
                # Full transcript record (untruncated) — keyed by part id so a
                # streaming part collapses to its final state, in arrival order.
                record = _part_transcript_record(part)
                if record is not None:
                    transcript[record["id"] or f"#{len(transcript)}"] = record
                # Bounded projection for the live UI stream (upserted by id).
                if run_store is not None:
                    forwarded = agent_activity_from_part(part, seen_parts)
                    if forwarded is not None:
                        try:
                            await run_store.activity(
                                forwarded["headline"],
                                label=forwarded.get("label"),
                                kind=forwarded.get("kind"),
                                id=forwarded.get("id") or None,
                            )
                        except Exception:
                            logger.exception("try_agent: forwarding agent activity failed")
    finally:
        # Final sweep so writes landed between the last poll and session end
        # still stream before finalize settles the leftovers.
        try:
            await poll()
        except Exception:
            logger.exception("try_agent: final cell rebroadcast failed")
        # Flush each reasoning/text block's FINAL full text to the live stream
        # (upserted by id) — the growth throttle may have stopped short of the
        # tail, and the UI's expand must show everything.
        if run_store is not None:
            for rec in transcript.values():
                if rec.get("kind") in ("thinking", "text") and rec.get("id") and rec.get("text"):
                    try:
                        await run_store.activity(
                            rec["text"],
                            label="Thinking" if rec["kind"] == "thinking" else "Writing a note",
                            kind="thinking",
                            id=rec["id"],
                        )
                    except Exception:
                        logger.exception("try_agent: flushing final agent thinking failed")
        # Persist the full transcript for offline evaluation (best-effort).
        if log_dir is not None:
            write_agent_activity_log(
                log_dir,
                run_id=getattr(run_store, "run_id", title),
                execution_id=getattr(run_store, "execution_id", None),
                session_id=session_id,
                prompt=prompt,
                databases=list(getattr(run_store, "database_paths", {}) or {}),
                records=list(transcript.values()),
                started_at=session_started,
                ended_at=datetime.now(timezone.utc),
                error=session_error,
            )
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
                client, run_store.run_id, prompt, session_directory or str(run_dir),
                run_store=run_store, log_dir=run_dir,
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
