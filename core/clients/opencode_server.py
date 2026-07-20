"""Manage a persistent `opencode serve` subprocess.

The agent's Node.js startup is the dominant per-run latency (~1-2s). Running a
single long-lived server lets every audit run reuse it via HTTP — startup cost
is paid once at boot, not per run.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import signal
from typing import Optional

from core import model_config
from core.config import OPENCODE_BIN

logger = logging.getLogger(__name__)

_LISTEN_RE = re.compile(r"https?://([^\s:]+):(\d+)")


class OpenCodeServer:
    def __init__(self, host: str = "127.0.0.1", port: int = 0) -> None:
        self._host = host
        self._port = port  # 0 → server picks a free port; we read it from stdout
        self._proc: Optional[asyncio.subprocess.Process] = None
        self._url: Optional[str] = None
        self._stdout_task: Optional[asyncio.Task] = None
        self._stderr_task: Optional[asyncio.Task] = None

    @property
    def url(self) -> str:
        if self._url is None:
            raise RuntimeError("OpenCodeServer not started")
        return self._url

    async def start(self, startup_timeout: float = 15.0) -> str:
        args = [
            OPENCODE_BIN,
            "serve",
            "--hostname",
            self._host,
            "--port",
            str(self._port),
        ]
        # start_new_session=True puts opencode (and any binaries it execs, like
        # opencode-darwin-arm64) into its own process group, so stop() can take
        # down the whole tree with a single killpg instead of orphaning the
        # native child.
        # The thread_agent / table_agent stages project onto the
        # {env:LLM_THREAD_*} / {env:LLM_TABLE_*} keys the per-worktree opencode
        # configs substitute; with no stage configured the child inherits the
        # parent env unchanged (contracts/model-config.md).
        agent_env = model_config.agent_env()
        self._proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=True,
            env={**os.environ, **agent_env} if agent_env else None,
        )
        assert self._proc.stdout is not None

        async def _read_until_listening() -> str:
            assert self._proc is not None and self._proc.stdout is not None
            while True:
                line = await self._proc.stdout.readline()
                if not line:
                    raise RuntimeError("opencode serve exited before becoming ready")
                text = line.decode("utf-8", "replace").strip()
                logger.info("opencode: %s", text)
                m = _LISTEN_RE.search(text)
                if m and ("listening" in text.lower() or "opencode" in text.lower()):
                    return f"http://{m.group(1)}:{m.group(2)}"

        try:
            self._url = await asyncio.wait_for(
                _read_until_listening(), timeout=startup_timeout
            )
        except (asyncio.TimeoutError, RuntimeError) as exc:
            await self.stop()
            raise RuntimeError(f"opencode serve failed to start: {exc}") from exc

        # Drain BOTH pipes into the logger so neither buffer fills. opencode
        # serve echoes every tool result to stdout — a single large result
        # (e.g. the agent's pending-cells SELECT) exceeds the 64KB pipe buffer,
        # and an undrained pipe blocks that write forever: the tool call never
        # completes and the run freezes waiting for session.idle.
        self._stdout_task = asyncio.create_task(self._drain_stdout())
        self._stderr_task = asyncio.create_task(self._drain_stderr())
        return self._url

    async def _drain_stdout(self) -> None:
        # Chunked read, not readline: a single echoed line longer than the
        # StreamReader's 64KB limit would raise LimitOverrunError, kill this
        # task, and re-create the very stall this drain exists to prevent.
        assert self._proc is not None and self._proc.stdout is not None
        while True:
            chunk = await self._proc.stdout.read(65536)
            if not chunk:
                return
            logger.debug("opencode[stdout]: %d bytes", len(chunk))

    async def _drain_stderr(self) -> None:
        assert self._proc is not None and self._proc.stderr is not None
        async for line in self._proc.stderr:
            logger.warning(
                "opencode[stderr]: %s", line.decode("utf-8", "replace").rstrip()
            )

    async def stop(self) -> None:
        if self._proc is None:
            return
        if self._proc.returncode is None:
            try:
                pgid = os.getpgid(self._proc.pid)
            except ProcessLookupError:
                pgid = None

            def _signal_group(sig: int) -> None:
                if pgid is None:
                    return
                try:
                    os.killpg(pgid, sig)
                except ProcessLookupError:
                    pass

            try:
                _signal_group(signal.SIGTERM)
                await asyncio.wait_for(self._proc.wait(), timeout=5)
            except asyncio.TimeoutError:
                _signal_group(signal.SIGKILL)
                await self._proc.wait()
        if self._stdout_task is not None:
            self._stdout_task.cancel()
        if self._stderr_task is not None:
            self._stderr_task.cancel()
        self._proc = None
        self._url = None
