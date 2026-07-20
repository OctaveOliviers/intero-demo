"""``core.agent.runtime.run_turn`` — one turn against the thread agent.

Ports the chat-answer suite onto the runtime seam: a scripted fake opencode
client feeds message parts / sink files, and the tests pin the streamed answer
text, inline citations, table requests, ask-user questions, prompt hygiene,
and session reuse. The worktree profile tests pin the thread agent's opencode
config and context. (The old "reuse skips re-provisioning" behavior is gone by
design: every turn re-materializes so the authorized projection converges on
current grants — see worktree_test.)
"""

from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from pathlib import Path

from core.agent import runtime, session, worktree
from core.agent.runtime import ThreadAgentError, ThreadAgentTurn


def _seed_database(databases_dir: Path, slug: str) -> None:
    """Lay down a registered database as the deployment does:
    ``<databases_dir>/<slug>/database.sqlite`` + ``model.json``."""
    import sqlite3

    db_dir = databases_dir / slug
    db_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_dir / "database.sqlite")
    conn.execute(
        "CREATE TABLE cord_ph_birth_records (patient_code TEXT PRIMARY KEY, cord_arterial_ph REAL)"
    )
    conn.execute("INSERT INTO cord_ph_birth_records VALUES ('P001', 7.2)")
    conn.commit()
    conn.close()
    (db_dir / "model.json").write_text(
        json.dumps(
            {
                "database": slug,
                "identity_links": [],
                "foreign_keys": [],
                "tables": [
                    {
                        "name": "cord_ph_birth_records",
                        "columns": [
                            {"name": "patient_code"},
                            {"name": "cord_arterial_ph"},
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )


_ANSWER = {
    "answer": "There is 1 patient",
    "citations": [
        {
            "marker": "1",
            "database": "cord-ph",
            "query": "SELECT COUNT(*) AS n FROM cord_ph_birth_records",
            "table_column": "cord_ph_birth_records.patient_code",
            "explanation": "count of patients",
        }
    ],
}

_TABLE_REQUEST = {
    "title": "Cord pH audit table",
    "request": "Create one row per birth with delivery mode and cord pH.",
    "source_template": "cord-ph",
    "dataset_id": None,
    "description": "Requested from chat.",
}


def _citation_without_marker() -> dict:
    citation = dict(_ANSWER["citations"][0])
    citation.pop("marker", None)
    return citation


class FakeOpenCodeClient:
    """A stub opencode client for ``_drive_session``."""

    def __init__(self, answer: dict):
        self._answer = answer
        self._queues: dict[str, asyncio.Queue] = {}
        self.created: list[str] = []
        self.deleted: list[str] = []
        self.prompts: list[str] = []
        self.prompt_session_ids: list[str] = []
        self.prompt_directories: list[str | None] = []

    async def create_session(self, title=None, directory=None) -> str:
        self.created.append(title or "")
        return "sess-1"

    async def subscribe(self, session_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._queues[session_id] = q
        return q

    async def prompt_async(self, session_id: str, prompt: str, directory=None) -> None:
        self.prompts.append(prompt)
        self.prompt_session_ids.append(session_id)
        self.prompt_directories.append(directory)
        Path(directory).joinpath("citations.json").write_text(
            json.dumps(self._answer["citations"]), encoding="utf-8"
        )
        Path(directory).joinpath("query_log.jsonl").write_text(
            json.dumps(
                {
                    "database": "cord-ph",
                    "query": "SELECT COUNT(*) AS n FROM cord_ph_birth_records",
                    "ts": "2026-01-01T00:00:00+00:00",
                }
            )
            + "\n",
            encoding="utf-8",
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "tool",
                        "id": "call-sql",
                        "tool": "sql_execute",
                        "state": {
                            "status": "completed",
                            "title": "Counting birth records",
                        },
                    }
                },
            }
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "text",
                        "id": "answer-text",
                        "text": self._answer["answer"],
                    }
                },
            }
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "tool",
                        "id": "call-cite",
                        "tool": "cite_execute",
                        "state": {
                            "status": "completed",
                            "input": json.dumps(_citation_without_marker()),
                        },
                    }
                },
            }
        )
        await self._queues[session_id].put({"type": "session.idle"})

    async def unsubscribe(self, session_id: str) -> None:
        self._queues.pop(session_id, None)

    async def delete_session(self, session_id: str, directory=None) -> None:
        self.deleted.append(session_id)


class StreamingTextOpenCodeClient(FakeOpenCodeClient):
    async def prompt_async(self, session_id: str, prompt: str, directory=None) -> None:
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "text",
                        "id": "answer-text",
                        "text": "There is 1",
                    }
                },
            }
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "text",
                        "id": "answer-text",
                        "text": "There is 1 patient",
                    }
                },
            }
        )
        await super().prompt_async(session_id, prompt, directory=directory)


class StreamingTextDeltaOpenCodeClient(FakeOpenCodeClient):
    async def prompt_async(self, session_id: str, prompt: str, directory=None) -> None:
        for text in ("There ", "is ", "1"):
            await self._queues[session_id].put(
                {
                    "type": "message.part.updated",
                    "properties": {
                        "part": {
                            "type": "text",
                            "id": "answer-text",
                            "text": text,
                        }
                    },
                }
            )
        await super().prompt_async(session_id, prompt, directory=directory)


class PromptEchoOpenCodeClient(FakeOpenCodeClient):
    async def prompt_async(self, session_id: str, prompt: str, directory=None) -> None:
        self.prompts.append(prompt)
        self.prompt_session_ids.append(session_id)
        self.prompt_directories.append(directory)
        Path(directory).joinpath("citations.json").write_text(
            json.dumps(_ANSWER["citations"]), encoding="utf-8"
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "text",
                        "id": "prompt-echo",
                        "text": prompt,
                    }
                },
            }
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "text",
                        "id": "answer-text",
                        "text": _ANSWER["answer"],
                    }
                },
            }
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "tool",
                        "id": "call-cite",
                        "tool": "cite_execute",
                        "state": {
                            "status": "completed",
                            "input": json.dumps(_citation_without_marker()),
                        },
                    }
                },
            }
        )
        await self._queues[session_id].put({"type": "session.idle"})


class CiteOpenCodeClient(FakeOpenCodeClient):
    async def prompt_async(self, session_id: str, prompt: str, directory=None) -> None:
        self.prompts.append(prompt)
        self.prompt_session_ids.append(session_id)
        self.prompt_directories.append(directory)
        Path(directory).joinpath("citations.json").write_text(
            json.dumps(_ANSWER["citations"]), encoding="utf-8"
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "text",
                        "id": "answer-text",
                        "text": _ANSWER["answer"],
                    }
                },
            }
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "tool",
                        "id": "call-cite",
                        "tool": "cite_execute",
                        "state": {
                            "status": "completed",
                            "input": json.dumps(_citation_without_marker()),
                        },
                    }
                },
            }
        )
        await self._queues[session_id].put({"type": "session.idle"})


class StreamedCitationOnlyOpenCodeClient(FakeOpenCodeClient):
    async def prompt_async(self, session_id: str, prompt: str, directory=None) -> None:
        self.prompts.append(prompt)
        self.prompt_session_ids.append(session_id)
        self.prompt_directories.append(directory)
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "text",
                        "id": "answer-text",
                        "text": _ANSWER["answer"],
                    }
                },
            }
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "tool",
                        "id": "call-cite",
                        "tool": "cite_execute",
                        "state": {
                            "status": "completed",
                            "input": json.dumps(_citation_without_marker()),
                        },
                    }
                },
            }
        )
        await self._queues[session_id].put({"type": "session.idle"})


class TextThenCiteOpenCodeClient(FakeOpenCodeClient):
    async def prompt_async(self, session_id: str, prompt: str, directory=None) -> None:
        self.prompts.append(prompt)
        self.prompt_session_ids.append(session_id)
        self.prompt_directories.append(directory)
        citation = dict(_ANSWER["citations"][0])
        citation["explanation"] = "count of birth records"
        Path(directory).joinpath("citations.json").write_text(
            json.dumps([citation]), encoding="utf-8"
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "text",
                        "id": "answer-text",
                        "text": "There were 412 births",
                    }
                },
            }
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "tool",
                        "id": "call-cite",
                        "tool": "cite_execute",
                        "state": {
                            "status": "completed",
                            "input": json.dumps(_citation_without_marker()),
                        },
                    }
                },
            }
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "text",
                        "id": "answer-text",
                        "text": "There were 412 births.",
                    }
                },
            }
        )
        await self._queues[session_id].put({"type": "session.idle"})


class TextCiteThenDuplicateTextOpenCodeClient(FakeOpenCodeClient):
    async def prompt_async(self, session_id: str, prompt: str, directory=None) -> None:
        self.prompts.append(prompt)
        self.prompt_session_ids.append(session_id)
        self.prompt_directories.append(directory)
        citation = dict(_ANSWER["citations"][0])
        citation["explanation"] = "registered database list"
        Path(directory).joinpath("citations.json").write_text(
            json.dumps([citation]), encoding="utf-8"
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "text",
                        "id": "answer-text",
                        "text": "You can query the EHR, lab, and radiology databases",
                    }
                },
            }
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "tool",
                        "id": "call-cite",
                        "tool": "cite_execute",
                        "state": {
                            "status": "completed",
                            "input": json.dumps(_citation_without_marker()),
                        },
                    }
                },
            }
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "text",
                        "id": "answer-text",
                        "text": "You can query the EHR, lab, and radiology databases",
                    }
                },
            }
        )
        await self._queues[session_id].put({"type": "session.idle"})


class SkillNoiseOpenCodeClient(FakeOpenCodeClient):
    async def prompt_async(self, session_id: str, prompt: str, directory=None) -> None:
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "tool",
                        "id": "call-skill",
                        "tool": "skill",
                        "state": {
                            "status": "completed",
                        },
                    }
                },
            }
        )
        await super().prompt_async(session_id, prompt, directory=directory)


class CatalogOnlyOpenCodeClient(FakeOpenCodeClient):
    async def prompt_async(self, session_id: str, prompt: str, directory=None) -> None:
        self.prompts.append(prompt)
        self.prompt_session_ids.append(session_id)
        self.prompt_directories.append(directory)
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "tool",
                        "id": "call-catalog",
                        "tool": "catalog_execute",
                        "state": {
                            "status": "completed",
                            "input": {"collection": "databases"},
                            "output": json.dumps(
                                {
                                    "ok": True,
                                    "databases": [
                                        {
                                            "database": "cord-ph",
                                            "title": "Cord pH EMR",
                                        }
                                    ],
                                }
                            ),
                        },
                    }
                },
            }
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "text",
                        "id": "answer-text",
                        "text": "You can query cord-ph.",
                    }
                },
            }
        )
        await self._queues[session_id].put({"type": "session.idle"})


class UncitedSqlOpenCodeClient(FakeOpenCodeClient):
    async def prompt_async(self, session_id: str, prompt: str, directory=None) -> None:
        self.prompts.append(prompt)
        self.prompt_session_ids.append(session_id)
        self.prompt_directories.append(directory)
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "tool",
                        "id": "call-sql",
                        "tool": "sql_execute",
                        "state": {
                            "status": "completed",
                            "input": {
                                "database": "cord-ph",
                                "sql": "SELECT COUNT(*) AS n FROM cord_ph_birth_records",
                            },
                            "output": json.dumps(
                                {
                                    "ok": True,
                                    "columns": ["n"],
                                    "rows": [{"n": 1}],
                                    "rowCount": 1,
                                }
                            ),
                        },
                    }
                },
            }
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "text",
                        "id": "answer-text",
                        "text": "There is 1 patient.",
                    }
                },
            }
        )
        await self._queues[session_id].put({"type": "session.idle"})


class CitationOnlyOpenCodeClient(FakeOpenCodeClient):
    async def prompt_async(self, session_id: str, prompt: str, directory=None) -> None:
        self.prompts.append(prompt)
        self.prompt_session_ids.append(session_id)
        self.prompt_directories.append(directory)
        Path(directory).joinpath("citations.json").write_text(
            json.dumps(_ANSWER["citations"]), encoding="utf-8"
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "tool",
                        "id": "call-cite",
                        "tool": "cite_execute",
                        "state": {
                            "status": "completed",
                            "input": json.dumps(_citation_without_marker()),
                        },
                    }
                },
            }
        )
        await self._queues[session_id].put({"type": "session.idle"})


class TableRequestOpenCodeClient(FakeOpenCodeClient):
    async def prompt_async(self, session_id: str, prompt: str, directory=None) -> None:
        self.prompts.append(prompt)
        self.prompt_session_ids.append(session_id)
        self.prompt_directories.append(directory)
        Path(directory).joinpath("table_request.json").write_text(
            json.dumps(_TABLE_REQUEST), encoding="utf-8"
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "tool",
                        "id": "call-table",
                        "tool": "table_execute",
                        "state": {
                            "status": "completed",
                            "input": json.dumps(_TABLE_REQUEST),
                        },
                    }
                },
            }
        )
        await self._queues[session_id].put(
            {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "text",
                        "id": "table-note",
                        "text": "I am creating the table now.",
                    }
                },
            }
        )
        await self._queues[session_id].put({"type": "session.idle"})


class ThreadWorktreeProfileTest(unittest.TestCase):
    """The thread agent's worktree profile: chat-only permissions + chat context."""

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.root = Path(self._dir.name)
        self.databases_dir = self.root / "databases"
        _seed_database(self.databases_dir, "cord-ph")
        _seed_database(self.databases_dir, "npda-clinical")
        self.chat_dir = self.root / "wt"

    def tearDown(self):
        self._dir.cleanup()

    def _materialize(self):
        worktree.materialize(
            self.chat_dir,
            databases_dir=self.databases_dir,
            config=worktree.thread_agent_opencode_config(),
        )

    def test_lays_down_all_registered_db_symlinks_and_models(self):
        self._materialize()
        for slug in ("cord-ph", "npda-clinical"):
            link = self.chat_dir / "databases" / f"{slug}.sqlite"
            self.assertTrue(link.is_symlink(), f"{slug}.sqlite symlink")
            self.assertTrue(
                (self.chat_dir / "databases" / f"{slug}.model.json").exists(),
                f"{slug}.model.json copy",
            )
        self.assertTrue((self.chat_dir / "opencode.json").exists())
        self.assertTrue((self.chat_dir / ".opencode").is_dir())
        for name in ("tools", "skills", "node_modules"):
            self.assertTrue((self.chat_dir / ".opencode" / name).is_symlink(), name)

    def test_thread_agent_config_allows_only_chat_sinks(self):
        self._materialize()
        cfg = json.loads((self.chat_dir / "opencode.json").read_text())
        perms = cfg["permission"]
        self.assertEqual(perms.get("ask_user_question"), "allow")
        self.assertEqual(perms.get("cite_execute"), "allow")
        self.assertEqual(perms.get("table_execute"), "allow")
        self.assertEqual(perms["skill"].get("chat-answer"), "allow")
        self.assertNotEqual(perms.get("lookup_execute"), "allow")
        self.assertNotEqual(perms["skill"].get("table-fill"), "allow")

    def test_context_is_chat_mode_with_no_run_keys(self):
        self._materialize()
        ctx = json.loads((self.chat_dir / "context.json").read_text(encoding="utf-8"))
        self.assertEqual(ctx["mode"], "chat")
        self.assertNotIn("run_id", ctx)
        self.assertNotIn("anchor", ctx)
        self.assertNotIn("cohort", ctx)
        self.assertEqual(sorted(ctx["databases"]), ["cord-ph", "npda-clinical"])
        self.assertEqual(ctx["databases"]["cord-ph"]["cohort_tables"], [])


class RunTurnTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.root = Path(self._dir.name)
        self.databases_dir = self.root / "databases"
        _seed_database(self.databases_dir, "cord-ph")
        self.threads_dir = self.root / "threads"
        self.thread_id = "thread-1"
        self.worktree_dir = self.threads_dir / self.thread_id / "opencode"

    def tearDown(self):
        self._dir.cleanup()

    def _seed_session(self, session_id: str) -> None:
        state_path = self.threads_dir / self.thread_id / "agent-session.json"
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(
            json.dumps(
                {
                    "schema_version": "1",
                    "thread_id": self.thread_id,
                    "session_id": session_id,
                    "worktree": "opencode",
                    "created_at": "2026-01-01T00:00:00+00:00",
                    "updated_at": "2026-01-01T00:00:00+00:00",
                }
            ),
            encoding="utf-8",
        )

    def _run(
        self,
        question: str,
        *,
        client,
        session_id: str | None = None,
        scope: dict | None = None,
        dataset: dict | None = None,
        template_id: str | None = None,
        on_event=None,
    ):
        if session_id is not None:
            self._seed_session(session_id)
        turn = ThreadAgentTurn(
            thread_id=self.thread_id,
            user_text=question,
            scope=scope,
            dataset=dataset,
            template_id=template_id,
        )
        return asyncio.run(
            runtime.run_turn(
                turn,
                client=client,
                threads_dir=self.threads_dir,
                databases_dir=self.databases_dir,
                on_event=on_event,
            )
        )

    def test_returns_answer_citations_and_whole_db_scope(self):
        client = FakeOpenCodeClient(_ANSWER)
        result = self._run("How many patients are there?", client=client)
        self.assertEqual(result.kind, "answer")
        self.assertEqual(result.answer, "There is 1 patient [1]")
        self.assertEqual(len(result.citations), 1)
        self.assertEqual(result.citations[0]["database"], "cord-ph")
        self.assertEqual(result.scope["kind"], "whole_db")
        self.assertEqual(len(result.query_log), 1)
        self.assertEqual(result.query_log[0]["database"], "cord-ph")
        self.assertTrue(result.scope["disclosure"].strip())
        # The session PERSISTS for the thread: created once, never torn down.
        self.assertEqual(client.created, ["thread:thread-1"])
        self.assertEqual(client.deleted, [])

    def test_new_session_first_turn_seeds_standing_instructions(self):
        client = FakeOpenCodeClient(_ANSWER)
        self._run("How many patients are there?", client=client)
        self.assertEqual(len(client.prompts), 1)
        prompt = client.prompts[0]
        self.assertIn("You are the primary Intero thread agent", prompt)
        self.assertIn('"cord-ph"', prompt)
        self.assertIn("The user's full request:\nHow many patients are there?", prompt)

    def test_stream_callback_receives_activity_and_answer_delta(self):
        client = FakeOpenCodeClient(_ANSWER)
        events: list[dict] = []

        async def collect(event: dict) -> None:
            events.append(event)

        result = self._run(
            "How many patients are there?", client=client, on_event=collect
        )
        self.assertEqual(result.answer, "There is 1 patient [1]")
        self.assertIn("chat_activity", [event["type"] for event in events])
        self.assertIn("chat_delta", [event["type"] for event in events])
        self.assertEqual(
            [event for event in events if event["type"] == "chat_delta"][-1]["content"],
            "There is 1 patient",
        )

    def test_stream_callback_receives_answer_text_before_citation_tool_finishes(self):
        client = StreamingTextOpenCodeClient(_ANSWER)
        events: list[dict] = []

        async def collect(event: dict) -> None:
            events.append(event)

        result = self._run(
            "How many patients are there?", client=client, on_event=collect
        )
        self.assertEqual(result.answer, "There is 1 patient [1]")
        deltas = [event["content"] for event in events if event["type"] == "chat_delta"]
        self.assertEqual(deltas[0], "There is 1")
        self.assertEqual(deltas[1], "There is 1 patient")

    def test_stream_callback_accumulates_true_text_deltas(self):
        client = StreamingTextDeltaOpenCodeClient(_ANSWER)
        events: list[dict] = []

        async def collect(event: dict) -> None:
            events.append(event)

        result = self._run(
            "How many patients are there?", client=client, on_event=collect
        )
        self.assertEqual(result.answer, "There is 1 patient [1]")
        deltas = [event["content"] for event in events if event["type"] == "chat_delta"]
        self.assertEqual(deltas[:3], ["There ", "There is ", "There is 1"])

    def test_stream_callback_does_not_expose_prompt_echo_text(self):
        client = PromptEchoOpenCodeClient(_ANSWER)
        events: list[dict] = []

        async def collect(event: dict) -> None:
            events.append(event)

        self._run(
            "How many patients are there?",
            client=client,
            session_id="sess-thread",
            on_event=collect,
        )

        deltas = [event["content"] for event in events if event["type"] == "chat_delta"]
        self.assertIn("There is 1 patient", deltas)
        self.assertFalse(
            any("The user's full request:" in delta for delta in deltas),
            f"prompt leaked into chat deltas: {deltas!r}",
        )
        self.assertFalse(
            any("Scope for this message:" in delta for delta in deltas),
            f"scope prompt leaked into chat deltas: {deltas!r}",
        )

    def test_citation_without_visible_answer_raises(self):
        client = CitationOnlyOpenCodeClient(_ANSWER)
        with self.assertRaises(ThreadAgentError):
            self._run("Summarize the hospital.", client=client)

    def test_cite_tool_event_streams_backend_marker_and_final_citation(self):
        client = CiteOpenCodeClient(_ANSWER)
        events: list[dict] = []

        async def collect(event: dict) -> None:
            events.append(event)

        result = self._run(
            "How many patients are there?",
            client=client,
            session_id="sess-thread",
            on_event=collect,
        )

        citation_events = [
            event for event in events if event.get("type") == "chat_citation"
        ]
        self.assertEqual(len(citation_events), 1)
        self.assertEqual(citation_events[0]["citation"]["marker"], "1")
        self.assertEqual(citation_events[0]["citation"]["database"], "cord-ph")
        self.assertEqual(result.citations[0]["marker"], "1")

    def test_streamed_citation_is_final_citation_when_file_is_not_written(self):
        client = StreamedCitationOnlyOpenCodeClient(_ANSWER)
        events: list[dict] = []

        async def collect(event: dict) -> None:
            events.append(event)

        result = self._run(
            "How many patients are there?",
            client=client,
            session_id="sess-thread",
            on_event=collect,
        )

        self.assertEqual(result.kind, "answer")
        self.assertEqual(result.answer, "There is 1 patient [1]")
        self.assertEqual(result.citations[0]["marker"], "1")
        self.assertEqual(result.citations[0]["database"], "cord-ph")
        self.assertFalse((self.worktree_dir / "citations.json").exists())

    def test_cite_tool_marker_is_inserted_at_stream_position(self):
        client = TextThenCiteOpenCodeClient(_ANSWER)
        events: list[dict] = []

        async def collect(event: dict) -> None:
            events.append(event)

        result = self._run(
            "How many births were there?",
            client=client,
            session_id="sess-thread",
            on_event=collect,
        )

        self.assertEqual(result.answer, "There were 412 births [1].")
        self.assertEqual(
            [event["content"] for event in events if event["type"] == "chat_delta"],
            ["There were 412 births", "There were 412 births [1]."],
        )
        self.assertEqual(
            [event["type"] for event in events if event["type"] != "chat_activity"],
            ["chat_delta", "chat_citation", "chat_delta"],
        )

    def test_repeated_cumulative_text_does_not_restream_or_duplicate_answer(self):
        client = TextCiteThenDuplicateTextOpenCodeClient(_ANSWER)
        events: list[dict] = []

        async def collect(event: dict) -> None:
            events.append(event)

        result = self._run(
            "What databases can I query?",
            client=client,
            session_id="sess-thread",
            on_event=collect,
        )

        self.assertEqual(
            result.answer,
            "You can query the EHR, lab, and radiology databases [1]",
        )
        self.assertEqual(
            [event["content"] for event in events if event["type"] == "chat_delta"],
            ["You can query the EHR, lab, and radiology databases"],
        )
        self.assertEqual(
            [event["type"] for event in events if event["type"] != "chat_activity"],
            ["chat_delta", "chat_citation"],
        )

    def test_stream_activity_does_not_expose_generic_skill_done(self):
        client = SkillNoiseOpenCodeClient(_ANSWER)
        events: list[dict] = []

        async def collect(event: dict) -> None:
            events.append(event)

        self._run("How many patients are there?", client=client, on_event=collect)

        activity_labels = [
            event.get("activity", {}).get("label")
            for event in events
            if event.get("type") == "chat_activity"
        ]
        self.assertNotIn("skill done", activity_labels)

    def test_catalog_only_answer_does_not_require_clinical_citation(self):
        client = CatalogOnlyOpenCodeClient(_ANSWER)
        result = self._run(
            "Which databases can I query?", client=client, session_id="sess-thread"
        )
        self.assertEqual(result.kind, "answer")
        self.assertEqual(result.answer, "You can query cord-ph.")
        self.assertEqual(result.citations, [])
        self.assertFalse((self.worktree_dir / "citations.json").exists())

    def test_sql_answer_without_citation_is_returned(self):
        client = UncitedSqlOpenCodeClient(_ANSWER)
        result = self._run(
            "How many patients are there?", client=client, session_id="sess-thread"
        )
        self.assertEqual(result.kind, "answer")
        self.assertEqual(result.answer, "There is 1 patient.")
        self.assertEqual(result.citations, [])
        self.assertFalse((self.worktree_dir / "citations.json").exists())

    def test_dataset_scope_is_passed_to_the_agent_prompt_and_returned(self):
        client = FakeOpenCodeClient(_ANSWER)
        scope = {
            "kind": "dataset",
            "dataset_id": "ds-cordph-nicu",
            "disclosure": "answered within the Term babies admitted to NICU Dataset",
        }
        dataset = {
            "id": "ds-cordph-nicu",
            "name": "Term babies admitted to NICU",
            "cohort_sql": "SELECT DISTINCT patient_code FROM cord_ph_birth_records WHERE nicu_admission = 'yes';",
        }
        result = self._run(
            "How many babies are in the NICU Dataset?",
            client=client,
            scope=scope,
            dataset=dataset,
        )
        self.assertEqual(result.scope, scope)
        # The runtime builds ALL prompt scaffolding from the structured turn:
        # the attachment preamble plus the scope block.
        self.assertIn(
            "Attached Dataset: Term babies admitted to NICU (ds-cordph-nicu)",
            client.prompts[0],
        )
        self.assertIn("Term babies admitted to NICU", client.prompts[0])
        self.assertIn("cohort_sql", client.prompts[0])

    def test_template_attachment_reaches_the_prompt_from_the_structured_turn(self):
        client = FakeOpenCodeClient(_ANSWER)
        self._run(
            "Run this for me",
            client=client,
            session_id="sess-thread",
            template_id="npda",
        )
        prompt = client.prompts[0]
        self.assertIn("Attached template: npda. Use the templates navigation", prompt)
        self.assertIn("The user's full request:\nRun this for me", prompt)

    def test_existing_session_receives_only_the_current_turn_prompt(self):
        client = FakeOpenCodeClient(_ANSWER)
        result = self._run(
            "What was my last question?", client=client, session_id="sess-thread"
        )
        self.assertEqual(result.kind, "answer")
        self.assertEqual(client.created, [])
        self.assertEqual(client.deleted, [])
        self.assertEqual(client.prompt_session_ids, ["sess-thread"])
        prompt = client.prompts[0]
        self.assertNotIn("Conversation so far:", prompt)
        self.assertNotIn("Which are the available databases?", prompt)
        self.assertNotIn("You are the primary Intero thread agent", prompt)
        self.assertIn("The user's full request:\nWhat was my last question?", prompt)

    def test_reusing_worktree_clears_previous_turn_outputs(self):
        table_client = TableRequestOpenCodeClient(_ANSWER)
        first = self._run(
            "Build a cord pH table", client=table_client, session_id="sess-thread"
        )
        self.assertEqual(first.kind, "table_request")
        self.assertEqual(first.table_request["title"], "Cord pH audit table")

        answer_client = FakeOpenCodeClient(_ANSWER)
        second = self._run("How many patients are there?", client=answer_client)
        self.assertEqual(second.kind, "answer")
        self.assertEqual(second.answer, "There is 1 patient [1]")

    def test_reusing_worktree_replaces_previous_streamed_citations(self):
        self.worktree_dir.mkdir(parents=True, exist_ok=True)
        (self.worktree_dir / "citations.json").write_text(
            json.dumps([{"marker": "stale"}]), encoding="utf-8"
        )
        client = FakeOpenCodeClient(_ANSWER)
        self._run(
            "How many patients are there?", client=client, session_id="sess-thread"
        )
        citations = json.loads((self.worktree_dir / "citations.json").read_text())
        self.assertEqual([citation["marker"] for citation in citations], ["1"])

    def test_stream_activity_does_not_expose_text_note_parts(self):
        client = StreamingTextOpenCodeClient(_ANSWER)
        events: list[dict] = []

        async def collect(event: dict) -> None:
            events.append(event)

        self._run("How many patients are there?", client=client, on_event=collect)
        activity_labels = [
            event.get("activity", {}).get("label")
            for event in events
            if event.get("type") == "chat_activity"
        ]
        self.assertNotIn("Writing a note", activity_labels)

    def test_missing_visible_answer_raises(self):
        class Silent(FakeOpenCodeClient):
            async def prompt_async(self, session_id, prompt, directory=None):
                await self._queues[session_id].put({"type": "session.idle"})

        with self.assertRaises(ThreadAgentError):
            self._run("How many?", client=Silent(_ANSWER))

    def test_ask_user_questions_returns_structured_request(self):
        class Asking(FakeOpenCodeClient):
            async def prompt_async(self, session_id, prompt, directory=None):
                Path(directory).joinpath("ask_user_questions.json").write_text(
                    json.dumps(
                        {
                            "questions": [
                                {
                                    "id": "dataset_scope",
                                    "question": "Which Dataset should I use?",
                                    "choices": [
                                        {
                                            "id": "whole_db",
                                            "label": "Whole hospital database",
                                        }
                                    ],
                                    "allow_other": True,
                                    "required": True,
                                }
                            ]
                        }
                    ),
                    encoding="utf-8",
                )
                await self._queues[session_id].put({"type": "session.idle"})

        result = self._run("Which babies?", client=Asking(_ANSWER))
        self.assertEqual(result.kind, "questions")
        self.assertEqual(result.questions[0]["id"], "dataset_scope")


class ThreadSessionTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.root = Path(self._dir.name)
        self.databases_dir = self.root / "databases"
        _seed_database(self.databases_dir, "cord-ph")
        self.threads_dir = self.root / "threads"

    def tearDown(self):
        self._dir.cleanup()

    def test_thread_session_is_created_once_and_reused_from_sidecar(self):
        client = FakeOpenCodeClient(_ANSWER)
        first = asyncio.run(
            session.ensure_thread_session(
                "thread-abc123",
                client=client,
                threads_dir=self.threads_dir,
                databases_dir=self.databases_dir,
            )
        )
        second = asyncio.run(
            session.ensure_thread_session(
                "thread-abc123",
                client=client,
                threads_dir=self.threads_dir,
                databases_dir=self.databases_dir,
            )
        )
        self.assertEqual(first.session_id, "sess-1")
        self.assertTrue(first.created)
        self.assertEqual(second.session_id, "sess-1")
        self.assertFalse(second.created)
        self.assertEqual(client.created, ["thread:thread-abc123"])
        self.assertEqual(client.deleted, [])
        self.assertEqual(client.prompts, [])

    def test_delete_thread_session_deletes_the_sidecar_session(self):
        client = FakeOpenCodeClient(_ANSWER)
        asyncio.run(
            session.ensure_thread_session(
                "thread-abc123",
                client=client,
                threads_dir=self.threads_dir,
                databases_dir=self.databases_dir,
            )
        )
        asyncio.run(
            runtime.delete_thread(
                "thread-abc123", client=client, threads_dir=self.threads_dir
            )
        )
        self.assertEqual(client.deleted, ["sess-1"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
