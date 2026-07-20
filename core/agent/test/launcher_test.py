"""``core.agent.launcher`` — the shared sub-agent launcher seam.

Pins the launcher's contract with a scripted fake opencode client (the pattern
``runtime_test.py`` established): a launch is rooted in the prepared workspace,
a fresh session is one-shot while a passed ``session_id`` is reused and kept,
``session_directory`` only changes how opencode addresses the workspace, parts
and bounded activity stream to the sinks, an attached run store gets its
out-of-process cell writes rebroadcast, and the full-fidelity transcript —
including a session error — always lands in the workspace.
``materialize_workspace`` lays down the opencode project root with the
adapter's config profile.
"""

from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from dataclasses import dataclass
from pathlib import Path

from core.agent import launcher
from core.config import AGENT_DIR, AGENT_OPENCODE_CONFIG

_TOOL_PART = {
    "type": "tool",
    "id": "call-sql",
    "tool": "sql_execute",
    "state": {
        "status": "completed",
        "title": "Counting birth records",
        "input": {"database": "cord-ph", "sql": "SELECT COUNT(*) FROM births"},
        "output": '{"ok": true}',
    },
}

_TEXT_PART = {
    "type": "text",
    "id": "answer-text",
    "text": "There is 1 patient",
}


def _part_event(part: dict) -> dict:
    return {"type": "message.part.updated", "properties": {"part": part}}


_DEFAULT_EVENTS = [
    _part_event(_TOOL_PART),
    _part_event(_TEXT_PART),
    {"type": "session.idle"},
]


class ScriptedOpenCodeClient:
    """A stub opencode client: session lifecycle calls are recorded and
    ``prompt_async`` plays a scripted event list into the session's queue."""

    def __init__(self, events: list[dict] | None = None, on_prompt=None):
        self.events = list(_DEFAULT_EVENTS if events is None else events)
        self.on_prompt = on_prompt
        self.created: list[tuple[str, str | None]] = []
        self.deleted: list[tuple[str, str | None]] = []
        self.prompts: list[str] = []
        self.prompt_session_ids: list[str] = []
        self.prompt_directories: list[str | None] = []
        self._queues: dict[str, asyncio.Queue] = {}

    async def create_session(self, title=None, directory=None) -> str:
        self.created.append((title or "", directory))
        return "sess-new"

    async def subscribe(self, session_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._queues[session_id] = queue
        return queue

    async def prompt_async(self, session_id: str, prompt: str, directory=None) -> None:
        self.prompts.append(prompt)
        self.prompt_session_ids.append(session_id)
        self.prompt_directories.append(directory)
        if self.on_prompt is not None:
            self.on_prompt()
        for event in self.events:
            await self._queues[session_id].put(event)

    async def unsubscribe(self, session_id: str) -> None:
        self._queues.pop(session_id, None)

    async def delete_session(self, session_id: str, directory=None) -> None:
        self.deleted.append((session_id, directory))


@dataclass
class FakeCell:
    """The cell surface the launcher's poll reads (the signature fields)."""

    ref: str
    state: str = "pending"
    value: str | None = None
    confidence: str | None = None
    reason_code: str | None = None


class FakeRunStore:
    """The store surface ``launch`` touches: cells to poll, the rebroadcast +
    activity sinks, and the attributes the transcript meta is stamped from."""

    def __init__(self):
        self.run_id = "run-42"
        self.execution_id = None
        self.database_paths = {"cord-ph": "/nowhere/cord-ph.sqlite"}
        self._cells = [FakeCell(ref="Sheet1!B2")]
        self.rebroadcasts: list[list[FakeCell]] = []
        self.activities: list[dict] = []

    def cells(self) -> list[FakeCell]:
        return list(self._cells)

    def fill_first_cell(self) -> None:
        """Simulate the agent's OUT-OF-PROCESS write (via its SQL tool)."""
        self._cells[0].state = "filled"
        self._cells[0].value = "7.2"

    async def rebroadcast(self, cells) -> None:
        self.rebroadcasts.append(list(cells))

    async def activity(self, headline, *, label=None, kind=None, id=None) -> None:
        self.activities.append(
            {"headline": headline, "label": label, "kind": kind, "id": id}
        )


class LaunchTest(unittest.TestCase):
    def setUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.workspace = Path(self._dir.name) / "workspace"
        self.workspace.mkdir(parents=True)

    def tearDown(self) -> None:
        self._dir.cleanup()

    def _launch(self, client, **kwargs):
        return asyncio.run(
            launcher.launch(
                client,
                workspace_dir=self.workspace,
                prompt="Do the work.",
                title="launch-test",
                **kwargs,
            )
        )

    def _transcript(self) -> tuple[dict, list[dict]]:
        lines = (
            (self.workspace / "agent-activity.jsonl")
            .read_text(encoding="utf-8")
            .splitlines()
        )
        records = [json.loads(line) for line in lines]
        return records[0], records[1:]

    def test_one_shot_launch_creates_and_deletes_a_fresh_session(self):
        client = ScriptedOpenCodeClient()
        self._launch(client)
        self.assertEqual(client.created, [("launch-test", str(self.workspace))])
        self.assertEqual(client.prompt_session_ids, ["sess-new"])
        # The session — and every tool call's working directory — is rooted in
        # the prepared workspace.
        self.assertEqual(client.prompt_directories, [str(self.workspace)])
        self.assertEqual(client.deleted, [("sess-new", str(self.workspace))])

    def test_persistent_launch_reuses_the_session_and_keeps_it(self):
        client = ScriptedOpenCodeClient()
        self._launch(client, session_id="sess-thread", delete_session=False)
        self.assertEqual(client.created, [])
        self.assertEqual(client.deleted, [])
        self.assertEqual(client.prompt_session_ids, ["sess-thread"])
        self.assertEqual(client.prompts, ["Do the work."])

    def test_session_directory_overrides_opencode_addressing_only(self):
        client = ScriptedOpenCodeClient()
        self._launch(client, session_directory="agent-root/runs/run-42")
        # opencode addresses the workspace by the caller's path...
        self.assertEqual(client.prompt_directories, ["agent-root/runs/run-42"])
        self.assertEqual(client.deleted, [("sess-new", "agent-root/runs/run-42")])
        # ...while the transcript still lands in the filesystem workspace.
        self.assertTrue((self.workspace / "agent-activity.jsonl").is_file())

    def test_transcript_lands_in_the_workspace(self):
        client = ScriptedOpenCodeClient()
        self._launch(client)
        meta, records = self._transcript()
        self.assertEqual(meta["kind"], "meta")
        # No run store attached: the title is the transcript's run key.
        self.assertEqual(meta["run_id"], "launch-test")
        self.assertEqual(meta["prompt"], "Do the work.")
        self.assertIsNone(meta["error"])
        self.assertEqual(
            [(r["kind"], r["id"]) for r in records],
            [("tool", "call-sql"), ("text", "answer-text")],
        )

    def test_parts_and_bounded_activity_stream_to_the_sinks(self):
        client = ScriptedOpenCodeClient()
        parts: list[dict] = []
        activities: list[dict] = []

        async def on_part(part: dict) -> None:
            parts.append(part)

        async def on_activity(activity: dict) -> None:
            activities.append(activity)

        self._launch(client, on_part=on_part, on_activity=on_activity)
        self.assertEqual([p["id"] for p in parts], ["call-sql", "answer-text"])
        tool_events = [a for a in activities if a["kind"] == "tool"]
        self.assertEqual(len(tool_events), 1)
        self.assertEqual(tool_events[0]["id"], "call-sql")
        self.assertEqual(tool_events[0]["headline"], "Counting birth records")
        self.assertEqual(tool_events[0]["label"], "Read the cord-ph database")

    def test_run_store_cell_writes_rebroadcast_and_meta_is_stamped(self):
        store = FakeRunStore()
        # The agent writes the cell store out-of-process mid-session; the
        # launcher's poll (final sweep at the latest) must rebroadcast it.
        client = ScriptedOpenCodeClient(on_prompt=store.fill_first_cell)
        self._launch(client, run_store=store)
        changed = [cell.ref for batch in store.rebroadcasts for cell in batch]
        self.assertEqual(changed, ["Sheet1!B2"])
        # The bounded activity projection also lands on the store.
        tool_activities = [a for a in store.activities if a["kind"] == "tool"]
        self.assertEqual(len(tool_activities), 1)
        self.assertEqual(tool_activities[0]["id"], "call-sql")
        meta, _ = self._transcript()
        self.assertEqual(meta["run_id"], "run-42")
        self.assertEqual(meta["databases"], ["cord-ph"])

    def test_session_error_settles_the_launch_and_stamps_the_transcript(self):
        client = ScriptedOpenCodeClient(
            events=[
                _part_event(_TOOL_PART),
                {"type": "session.error", "properties": {"error": {"message": "boom"}}},
            ]
        )
        self._launch(client)  # settles, never raises — the adapter judges leftovers
        meta, records = self._transcript()
        self.assertEqual(meta["error"], "boom")
        self.assertEqual([r["id"] for r in records], ["call-sql"])
        self.assertEqual(client.deleted, [("sess-new", str(self.workspace))])


class MaterializeWorkspaceTest(unittest.TestCase):
    def setUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.workspace = Path(self._dir.name) / "workspace"

    def tearDown(self) -> None:
        self._dir.cleanup()

    def test_lays_down_the_opencode_project_root(self):
        launcher.materialize_workspace(self.workspace)
        self.assertEqual(
            (self.workspace / "opencode.json").read_text(encoding="utf-8"),
            AGENT_OPENCODE_CONFIG.read_text(encoding="utf-8"),
        )
        for name in ("tools", "skills", "node_modules"):
            link = self.workspace / ".opencode" / name
            self.assertTrue(link.is_symlink(), name)
            self.assertEqual(link.resolve(), (AGENT_DIR / name).resolve(), name)

    def test_adapter_profile_replaces_the_committed_template(self):
        launcher.materialize_workspace(
            self.workspace, config={"permission": {"*": "deny"}}
        )
        config = json.loads(
            (self.workspace / "opencode.json").read_text(encoding="utf-8")
        )
        self.assertEqual(config, {"permission": {"*": "deny"}})


if __name__ == "__main__":
    unittest.main(verbosity=2)
