"""Tests for OpenCodeServer startup-timeout cleanup.

When ``opencode serve`` never becomes ready within ``startup_timeout``,
``start()`` must (a) tear down the leaked process group via the real cleanup
path and (b) raise a clear startup-timeout ``RuntimeError`` — never an
``AttributeError`` from calling a method the class does not define.
"""

import sys
import unittest
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from core.clients.opencode_server import OpenCodeServer  # noqa: E402


class _NeverReadyStdout:
    """A StreamReader stand-in whose readline() never returns a ready line.

    It hangs forever so that ``asyncio.wait_for`` hits ``startup_timeout`` and
    raises ``TimeoutError`` — exactly the scenario the cleanup handler guards.
    """

    async def readline(self) -> bytes:
        import asyncio

        await asyncio.Event().wait()  # never resolves
        return b""


def _make_fake_proc() -> mock.Mock:
    proc = mock.Mock()
    proc.stdout = _NeverReadyStdout()
    proc.stderr = mock.Mock()
    proc.pid = 4242
    # returncode None means "still running", so stop() will try to kill it.
    proc.returncode = None

    async def _wait() -> int:
        return 0

    proc.wait = mock.Mock(side_effect=_wait)
    return proc


class StartupTimeoutCleanupTest(unittest.IsolatedAsyncioTestCase):
    async def test_timeout_kills_process_group_and_raises_runtime_error(self):
        fake_proc = _make_fake_proc()

        async def _fake_create_subprocess_exec(*args, **kwargs):
            return fake_proc

        with (
            mock.patch(
                "core.clients.opencode_server.asyncio.create_subprocess_exec",
                new=_fake_create_subprocess_exec,
            ),
            mock.patch(
                "core.clients.opencode_server.os.getpgid", return_value=4242
            ) as getpgid,
            mock.patch("core.clients.opencode_server.os.killpg") as killpg,
        ):
            server = OpenCodeServer()

            with self.assertRaises(RuntimeError) as ctx:
                # Tiny timeout so the never-ready stdout trips it immediately.
                await server.start(startup_timeout=0.05)

        # (b) A RuntimeError — not AttributeError — must propagate, and it must
        # be the intended startup-failure message.
        self.assertIn("opencode serve failed to start", str(ctx.exception))

        # (a) The leaked process group must actually be killed (no leak): stop()
        # resolves the pgid and signals the group.
        getpgid.assert_called_once_with(4242)
        self.assertTrue(killpg.called, "process group was never signalled")
        signalled_pgids = {call.args[0] for call in killpg.call_args_list}
        self.assertEqual(signalled_pgids, {4242})

        # stop() clears the handle so a leaked process is not retained.
        self.assertIsNone(server._proc)


if __name__ == "__main__":
    unittest.main()
