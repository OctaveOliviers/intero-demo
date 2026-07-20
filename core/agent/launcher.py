"""The shared sub-agent launcher — the one seam a specialized agent is run through.

Intero's outputs are produced by specialized agents that share one runtime
shape (architecture.md §"Both v1 outputs share this runtime"): a prepared
opencode WORKSPACE (a directory that is a self-contained opencode project
root, carrying the config profile that selects the agent's model and
permissions — contracts/model-config.md — plus the data projection the agent
works), a PROMPT, and one driven opencode SESSION streaming activity while it
works. This module names that seam:

* :func:`materialize_workspace` — make a directory a self-contained opencode
  project root (the ``opencode.json`` profile + the ``.opencode/`` links into
  the canonical bundle, storage-layout §2/§4). Each adapter lays its own data
  AROUND that root: the thread agent's authorized projection
  (``core.agent.worktree.materialize``), the table agent's run contents.
* :func:`launch` — drive one opencode session rooted in the workspace to
  completion: prompt → forward message parts (bounded UI activity plus the
  full-fidelity ``agent-activity.jsonl`` transcript in the workspace) → wait
  for idle. The outcome is what the agent left behind — the workspace's sink
  files (chat) or the cell store (table) — collected by the adapter; a session
  error settles the launch without raising (the adapter judges the leftovers).

Two adapters cross it: the THREAD AGENT (``core.agent.runtime.run_turn`` —
chat-answer.md §The backend thread-agent runtime), one persistent session per
Thread (``session_id`` passed in, never deleted); and the TABLE AGENT
(``core.table_population.populate.run_agent``), one one-shot session per
population run. What differs per agent stays
with its adapter: the config profile (the thread profile rewrites the provider
block onto the ``LLM_THREAD_*`` env keys — ``worktree.thread_agent_opencode_config``
— while the table agent keeps the committed ``LLM_TABLE_*`` template), the
prompt, and the sinks the outcome is collected from.

The driving loop itself lives in ``core.agent.session.drive_session`` — this
module is the named interface over it, not a second implementation.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from core.agent import session, worktree

__all__ = [
    "launch",
    "materialize_workspace",
]


def materialize_workspace(
    workspace_dir: Path, *, config: dict[str, Any] | None = None
) -> None:
    """Make ``workspace_dir`` a self-contained opencode project root.

    ``config`` is the agent's opencode profile — the per-workspace config that
    selects its model (which ``LLM_*`` env keys the provider block names) and
    its permission set; ``None`` lays down the committed template unchanged.
    Idempotent (delegates to :func:`core.agent.worktree.materialize_opencode_root`).
    """
    worktree.materialize_opencode_root(workspace_dir, config=config)


async def launch(
    client,
    *,
    workspace_dir: Path,
    prompt: str,
    title: str,
    session_id: str | None = None,
    delete_session: bool = True,
    session_directory: str | None = None,
    run_store=None,
    poll_interval: float = 1.0,
    on_activity: Callable[[dict], Awaitable[None]] | None = None,
    on_part: Callable[[dict], Awaitable[None]] | None = None,
) -> None:
    """Launch a specialized agent: drive one opencode session to completion.

    ``client`` is the app's ``OpenCodeClient`` (or a test fake). The session —
    and therefore every tool call's working directory — is rooted in the
    prepared ``workspace_dir``; the full-fidelity transcript
    (``agent-activity.jsonl``) is written there when the session settles.
    ``session_directory`` overrides how OPENCODE addresses that same workspace
    when its view of the filesystem differs (the agent-root-relative path);
    it defaults to ``str(workspace_dir)``.

    Session lifecycle: ``session_id`` reuses an existing persistent session
    (the thread agent's one-session-per-Thread posture), ``None`` creates a
    fresh one titled ``title``; ``delete_session`` tears it down afterwards
    (the one-shot posture) or keeps it (pass ``False`` with a persistent id).

    Streaming: ``on_part`` receives every raw message part; ``on_activity``
    receives the bounded UI activity projection (``core.agent.activity``).
    ``run_store`` is the table adapter's per-run store handle — polled every
    ``poll_interval`` seconds so the agent's out-of-process cell writes
    rebroadcast live, and receiving the same bounded activity — ``None`` for
    an agent with no cell store.
    """
    await session.drive_session(
        client,
        title=title,
        prompt=prompt,
        directory=session_directory or str(workspace_dir),
        run_store=run_store,
        poll_interval=poll_interval,
        log_dir=workspace_dir,
        on_activity=on_activity,
        on_part=on_part,
        session_id=session_id,
        delete_session=delete_session,
    )
