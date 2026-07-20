"""Auth + round-trip tests for the /api/threads control-plane endpoints.

Mirrors datasets_test (auth helpers) and table_populations_edit_cells_test (temp auth DB +
``init_store()`` so role permission checks resolve against a freshly-seeded role
catalog — self-contained, no ``make seed`` and no cord-pH fixtures). THREADS_DIR
points at a tmp dir so nothing touches the real ``var/threads/``.
"""

from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException

from core.agent.runtime import ThreadAgentResult
from core.tables import store as table_store
from core.contracts import validate_against_schema
from server.auth import grants as grants_store
from server.auth import store as auth_store
from server.routes import threads as threads_route


def _clinician():
    return {"id": "u_clin", "username": "clinician", "role": "clinician"}


def _agent():
    return {"id": "u_agent", "username": "agent", "role": "agent"}


def _request_for(user):
    return SimpleNamespace(state=SimpleNamespace(user=user, user_id=user["id"]))


def _request_anon():
    return SimpleNamespace(state=SimpleNamespace(user=None, user_id=None))


_CITATION = {
    "marker": "1",
    "database": "cord-ph",
    "query": "SELECT COUNT(*) AS n FROM cord_ph_birth_records",
    "table_column": "cord_ph_birth_records.patient_code",
    "explanation": "count of birth records",
}


def _answer_result(query_log=None):
    return ThreadAgentResult(
        kind="answer",
        answer="There were 412 births this quarter [1].",
        citations=[dict(_CITATION)],
        scope={
            "kind": "whole_db",
            "dataset_id": None,
            "disclosure": "answered across the whole hospital database",
        },
        query_log=list(query_log or []),
    )


class ThreadRouteTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmpdir.name)
        self.threads_dir = self.tmp_path / "threads"
        self.threads_dir.mkdir(parents=True, exist_ok=True)

        self._orig_threads_dir = threads_route.THREADS_DIR
        threads_route.THREADS_DIR = self.threads_dir

        self.auth_db = self.tmp_path / "auth.sqlite"
        self._orig_auth_db = auth_store.AUTH_DB_PATH
        auth_store.AUTH_DB_PATH = self.auth_db
        auth_store.init_store()

        # Stub the runtime seam so the route records a real answer + citations
        # without provisioning a worktree or driving an opencode session.
        self.chat_answer_calls: list[dict] = []
        self._orig_run_turn = threads_route._run_turn

        async def fake_run_turn(turn, *, on_event=None):
            content = turn.user_text
            self.chat_answer_calls.append(
                {
                    "content": content,
                    "scope": turn.scope,
                    "dataset": turn.dataset,
                    "template_id": turn.template_id,
                }
            )
            if "needs dataset" in content and not content.startswith("Continue"):
                return ThreadAgentResult(
                    kind="questions",
                    questions=[
                        {
                            "id": "dataset_scope",
                            "question": "Which Dataset should I use?",
                            "choices": [
                                {"id": "whole_db", "label": "Whole hospital database"},
                                {
                                    "id": "ds-nicu",
                                    "label": "Term babies admitted to NICU",
                                },
                            ],
                            "allow_other": True,
                            "required": True,
                        }
                    ],
                    scope=turn.scope,
                    query_log=[],
                )
            if on_event is not None:
                await on_event(
                    {
                        "type": "chat_activity",
                        "activity": {
                            "id": "a1",
                            "label": "Querying the database",
                            "headline": "Counting birth records",
                            "kind": "tool",
                        },
                    }
                )
                await on_event(
                    {
                        "type": "chat_citation",
                        "citation": {
                            "marker": "1",
                            "database": "cord-ph",
                            "query": "SELECT COUNT(*) AS n FROM cord_ph_birth_records",
                            "table_column": "cord_ph_birth_records.patient_code",
                            "explanation": "count of birth records",
                        },
                    }
                )
                await on_event(
                    {
                        "type": "chat_delta",
                        "content": "There were 412 births this quarter [1].",
                    }
                )
            return _answer_result(
                query_log=[
                    {
                        "database": "cord-ph",
                        "query": "SELECT COUNT(*) AS n FROM cord_ph_birth_records",
                        "ts": "2026-01-01T00:00:00+00:00",
                    }
                ]
            )

        threads_route._run_turn = fake_run_turn

    def tearDown(self) -> None:
        threads_route.THREADS_DIR = self._orig_threads_dir
        threads_route._run_turn = self._orig_run_turn
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        self.tmpdir.cleanup()

    def test_anonymous_user_is_rejected_401(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(threads_route.list_threads(_request_anon()))
        self.assertEqual(ctx.exception.status_code, 401)

    def test_agent_role_is_denied_read(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(threads_route.list_threads(_request_for(_agent())))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("thread.read", str(ctx.exception.detail))

    def test_agent_role_is_denied_create(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                threads_route.create_thread(
                    threads_route.ThreadCreateRequest(message="hi"),
                    _request_for(_agent()),
                )
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("thread.manage", str(ctx.exception.detail))

    def test_create_empty_thread(self):
        thread = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(), _request_for(_clinician())
            )
        )
        self.assertTrue(thread["id"].startswith("thread-"))
        self.assertEqual(thread["messages"], [])
        self.assertEqual(thread["title"], "New thread")
        self.assertEqual(validate_against_schema(thread, "thread.schema.json"), [])

    def test_every_message_goes_to_the_agent_without_table_phrase_routing(self):
        thread = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(
                    message="Build an audit table, one row per patient"
                ),
                _request_for(_clinician()),
            )
        )
        agent = thread["messages"][1]
        self.assertEqual(agent["resolution"]["output"], "chat")
        self.assertIsNone(agent["resolution"]["artifact_id"])
        self.assertEqual(
            self.chat_answer_calls[0]["content"],
            "Build an audit table, one row per patient",
        )
        self.assertEqual(thread["artifact_ids"], [])

    def test_create_with_chat_message_answers_inline_with_citations(self):
        thread = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(
                    message="What was the average length of stay?"
                ),
                _request_for(_clinician()),
            )
        )
        res = thread["messages"][1]["resolution"]
        self.assertEqual(res["output"], "chat")
        self.assertIsNone(res["seam"])
        self.assertIsNone(res["artifact_id"])
        self.assertEqual(
            [c["content"] for c in self.chat_answer_calls],
            ["What was the average length of stay?"],
        )
        self.assertEqual(
            thread["messages"][1]["content"],
            "There were 412 births this quarter [1].",
        )
        self.assertEqual(len(res["citations"]), 1)
        self.assertEqual(res["citations"][0]["marker"], "1")
        self.assertEqual(thread["artifact_ids"], [])
        self.assertEqual(validate_against_schema(thread, "thread.schema.json"), [])

    def test_create_with_attachment_persists_user_context_for_agent(self):
        grants_store.self_grant_manage(
            resource_type="template", resource_id="npda", user_id="u_clin"
        )
        thread = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(
                    message="Run this for me",
                    attachments=[{"type": "template", "id": "npda"}],
                ),
                _request_for(_clinician()),
            )
        )
        user, agent = thread["messages"]
        self.assertEqual(user["attachments"], [{"type": "template", "id": "npda"}])
        self.assertEqual(agent["resolution"]["output"], "chat")
        # The turn carries the STRUCTURED attachment; the raw user text is
        # untouched (the runtime owns all prompt scaffolding).
        self.assertEqual(self.chat_answer_calls[-1]["template_id"], "npda")
        self.assertEqual(self.chat_answer_calls[-1]["content"], "Run this for me")
        self.assertEqual(validate_against_schema(thread, "thread.schema.json"), [])

    def test_attachments_without_a_message_are_rejected_422(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                threads_route.create_thread(
                    threads_route.ThreadCreateRequest(
                        attachments=[{"type": "template", "id": "npda"}]
                    ),
                    _request_for(_clinician()),
                )
            )
        self.assertEqual(ctx.exception.status_code, 422)

    def test_duplicate_attachment_kind_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                threads_route.create_thread(
                    threads_route.ThreadCreateRequest(
                        message="Run this for me",
                        attachments=[
                            {"type": "template", "id": "npda"},
                            {"type": "template", "id": "cord-ph"},
                        ],
                    ),
                    _request_for(_clinician()),
                )
            )
        self.assertEqual(ctx.exception.status_code, 422)

    def _persist_running(self, thread: dict, *, updated_at: str | None = None):
        thread["status"] = "running"
        if updated_at is not None:
            thread["updated_at"] = updated_at
        threads_route.thread_store.save_thread(thread, threads_dir=self.threads_dir)

    def test_second_message_during_a_live_turn_is_409(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(threads_route.ThreadCreateRequest(), req)
        )
        self._persist_running(thread)
        for call in (
            lambda: threads_route.post_message(
                thread["id"],
                threads_route.ThreadMessageRequest(content="second"),
                req,
            ),
            lambda: threads_route.post_message_stream(
                thread["id"],
                threads_route.ThreadMessageRequest(content="second"),
                req,
            ),
            lambda: threads_route.post_question_answers(
                thread["id"],
                threads_route.ThreadQuestionAnswersRequest(answers=[]),
                req,
            ),
        ):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(call())
            self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(self.chat_answer_calls, [])

    def test_stale_running_thread_recovers_and_accepts_a_message(self):
        # A crashed turn leaves "running" behind; past the staleness window the
        # guard treats it as dead and the thread stays usable.
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(threads_route.ThreadCreateRequest(), req)
        )
        self._persist_running(thread, updated_at="2026-01-01T00:00:00+00:00")
        result = asyncio.run(
            threads_route.post_message(
                thread["id"],
                threads_route.ThreadMessageRequest(content="hello again"),
                req,
            )
        )
        self.assertEqual(result["status"], "complete")
        self.assertEqual(len(self.chat_answer_calls), 1)

    def test_chat_answer_queries_are_attributed_to_requesting_user(self):
        asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(message="How many births?"),
                _request_for(_clinician()),
            )
        )
        rows = auth_store.list_queries_for_user("u_clin")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["database"], "cord-ph")
        self.assertEqual(
            rows[0]["query"], "SELECT COUNT(*) AS n FROM cord_ph_birth_records"
        )

    def test_chat_answer_failure_appends_honest_error_not_500(self):
        async def boom(turn, *, on_event=None):
            raise RuntimeError("opencode unavailable")

        threads_route._run_turn = boom
        thread = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(message="How is the ward today?"),
                _request_for(_clinician()),
            )
        )
        res = thread["messages"][1]["resolution"]
        self.assertEqual(res["output"], "chat")
        self.assertNotIn("citations", res)
        self.assertTrue(thread["messages"][1]["content"].strip())
        self.assertEqual(validate_against_schema(thread, "thread.schema.json"), [])

    def test_agent_can_ask_user_questions(self):
        thread = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(message="needs dataset"),
                _request_for(_clinician()),
            )
        )
        agent = thread["messages"][1]
        request = agent["resolution"]["ask_user_questions"]
        self.assertEqual(request["status"], "pending")
        self.assertEqual(request["questions"][0]["id"], "dataset_scope")
        self.assertEqual(agent["content"], "")
        self.assertEqual(validate_against_schema(thread, "thread.schema.json"), [])

    def test_question_answers_mark_request_and_continue_agent(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(message="needs dataset"), req
            )
        )
        updated = asyncio.run(
            threads_route.post_question_answers(
                thread["id"],
                threads_route.ThreadQuestionAnswersRequest(
                    answers=[
                        {
                            "question_id": "dataset_scope",
                            "status": "answered",
                            "choice_id": "ds-nicu",
                        }
                    ]
                ),
                req,
            )
        )
        self.assertEqual(
            updated["messages"][1]["resolution"]["ask_user_questions"]["status"],
            "answered",
        )
        self.assertEqual(updated["messages"][2]["role"], "user")
        self.assertEqual(updated["messages"][3]["role"], "agent")
        self.assertIn("Original request:", self.chat_answer_calls[-1]["content"])
        self.assertIn(
            "Term babies admitted to NICU", self.chat_answer_calls[-1]["content"]
        )
        self.assertEqual(validate_against_schema(updated, "thread.schema.json"), [])

    def test_skipping_every_question_returns_to_normal_without_rerunning_agent(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(message="needs dataset"), req
            )
        )
        calls_before = len(self.chat_answer_calls)
        updated = asyncio.run(
            threads_route.post_question_answers(
                thread["id"],
                threads_route.ThreadQuestionAnswersRequest(
                    answers=[
                        {
                            "question_id": "dataset_scope",
                            "status": "skipped",
                            "choice_id": None,
                            "text": None,
                        }
                    ]
                ),
                req,
            )
        )
        self.assertEqual(len(self.chat_answer_calls), calls_before)
        self.assertEqual(len(updated["messages"]), 2)
        self.assertEqual(
            updated["messages"][1]["resolution"]["ask_user_questions"]["status"],
            "skipped",
        )

    def test_post_question_answers_without_pending_request_is_409(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(message="How many births?"), req
            )
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                threads_route.post_question_answers(
                    thread["id"],
                    threads_route.ThreadQuestionAnswersRequest(answers=[]),
                    req,
                )
            )
        self.assertEqual(ctx.exception.status_code, 409)

    def test_post_question_answers_must_match_pending_questions(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(message="needs dataset"), req
            )
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                threads_route.post_question_answers(
                    thread["id"],
                    threads_route.ThreadQuestionAnswersRequest(answers=[]),
                    req,
                )
            )
        self.assertEqual(ctx.exception.status_code, 422)

    def test_answered_question_requires_choice_or_text(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(message="needs dataset"), req
            )
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                threads_route.post_question_answers(
                    thread["id"],
                    threads_route.ThreadQuestionAnswersRequest(
                        answers=[
                            {
                                "question_id": "dataset_scope",
                                "status": "answered",
                                "choice_id": None,
                                "text": None,
                            }
                        ]
                    ),
                    req,
                )
            )
        self.assertEqual(ctx.exception.status_code, 422)

    def test_get_missing_thread_is_404(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                threads_route.get_thread("thread-nope", _request_for(_clinician()))
            )
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Thread not found.")

    def test_list_is_recency_ordered(self):
        req = _request_for(_clinician())
        first = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(message="first question"), req
            )
        )
        second = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(message="second question"), req
            )
        )
        asyncio.run(
            threads_route.post_message(
                first["id"], threads_route.ThreadMessageRequest(content="bump it"), req
            )
        )
        summaries = asyncio.run(threads_route.list_threads(req))
        self.assertEqual(summaries[0].id, first["id"])
        self.assertEqual(summaries[1].id, second["id"])
        self.assertEqual(summaries[0].message_count, 4)

    def test_list_reports_status_and_opened_for_the_current_user(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(message="first question"), req
            )
        )

        summaries = asyncio.run(threads_route.list_threads(req))
        summary = next(s for s in summaries if s.id == thread["id"])
        self.assertEqual(summary.status, "complete")
        self.assertFalse(summary.opened)

        asyncio.run(threads_route.get_thread(thread["id"], req))
        summaries = asyncio.run(threads_route.list_threads(req))
        summary = next(s for s in summaries if s.id == thread["id"])
        self.assertTrue(summary.opened)

        asyncio.run(
            threads_route.post_message(
                thread["id"],
                threads_route.ThreadMessageRequest(content="new update"),
                req,
            )
        )
        summaries = asyncio.run(threads_route.list_threads(req))
        summary = next(s for s in summaries if s.id == thread["id"])
        self.assertFalse(summary.opened)

    def test_open_thread_marks_latest_update_opened_for_the_current_user(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(message="first question"), req
            )
        )

        resp = asyncio.run(threads_route.open_thread(thread["id"], req))
        self.assertEqual(resp.status_code, 204)
        summaries = asyncio.run(threads_route.list_threads(req))
        summary = next(s for s in summaries if s.id == thread["id"])
        self.assertTrue(summary.opened)

    def test_open_thread_missing_thread_is_404(self):
        req = _request_for(_clinician())
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(threads_route.open_thread("thread-nope", req))
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Thread not found.")

    def test_open_thread_requires_read_permission(self):
        thread = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(), _request_for(_clinician())
            )
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(threads_route.open_thread(thread["id"], _request_for(_agent())))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("thread.read", str(ctx.exception.detail))

    def test_post_message_appends_user_and_agent(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(threads_route.ThreadCreateRequest(), req)
        )
        updated = asyncio.run(
            threads_route.post_message(
                thread["id"],
                threads_route.ThreadMessageRequest(content="populate the columns"),
                req,
            )
        )
        self.assertEqual([m["role"] for m in updated["messages"]], ["user", "agent"])
        res = updated["messages"][1]["resolution"]
        self.assertEqual(res["output"], "chat")
        self.assertIsNone(res["artifact_id"])
        self.assertEqual(updated["artifact_ids"], [])
        self.assertGreaterEqual(updated["updated_at"], thread["updated_at"])

    def test_post_message_to_missing_thread_is_404(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                threads_route.post_message(
                    "thread-nope",
                    threads_route.ThreadMessageRequest(content="hi"),
                    _request_for(_clinician()),
                )
            )
        self.assertEqual(ctx.exception.status_code, 404)

    def test_post_message_rejects_empty_content(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(threads_route.ThreadCreateRequest(), req)
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                threads_route.post_message(
                    thread["id"],
                    threads_route.ThreadMessageRequest(content="   "),
                    req,
                )
            )
        self.assertEqual(ctx.exception.status_code, 422)
        reloaded = asyncio.run(threads_route.get_thread(thread["id"], req))
        self.assertEqual(reloaded["messages"], [])

    def test_delete_removes_the_thread(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(threads_route.ThreadCreateRequest(), req)
        )
        resp = asyncio.run(threads_route.delete_thread(thread["id"], req))
        self.assertEqual(resp.status_code, 204)
        self.assertFalse((self.threads_dir / thread["id"]).exists())

    def test_delete_missing_thread_is_404(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                threads_route.delete_thread("thread-nope", _request_for(_clinician()))
            )
        self.assertEqual(ctx.exception.status_code, 404)

    def test_rename_updates_and_persists_the_title(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(threads_route.ThreadCreateRequest(), req)
        )
        renamed = asyncio.run(
            threads_route.rename_thread(
                thread["id"],
                threads_route.ThreadRenameRequest(title="Renamed chat"),
                req,
            )
        )
        self.assertEqual(renamed["title"], "Renamed chat")
        reloaded = asyncio.run(threads_route.get_thread(thread["id"], req))
        self.assertEqual(reloaded["title"], "Renamed chat")
        self.assertEqual(validate_against_schema(renamed, "thread.schema.json"), [])
        self.assertGreaterEqual(renamed["updated_at"], thread["updated_at"])

    def test_rename_missing_thread_is_404(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                threads_route.rename_thread(
                    "thread-nope",
                    threads_route.ThreadRenameRequest(title="x"),
                    _request_for(_clinician()),
                )
            )
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Thread not found.")

    def test_rename_requires_manage_permission(self):
        thread = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(), _request_for(_clinician())
            )
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                threads_route.rename_thread(
                    thread["id"],
                    threads_route.ThreadRenameRequest(title="x"),
                    _request_for(_agent()),
                )
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("thread.manage", str(ctx.exception.detail))

    def test_rename_blank_title_is_422(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(threads_route.ThreadCreateRequest(), req)
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                threads_route.rename_thread(
                    thread["id"], threads_route.ThreadRenameRequest(title="   "), req
                )
            )
        self.assertEqual(ctx.exception.status_code, 422)

    def test_rename_traversal_id_is_refused_404(self):
        req = _request_for(_clinician())
        for bad in ("..", "../victim", "foo/bar", ".", "a/../b"):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    threads_route.rename_thread(
                        bad, threads_route.ThreadRenameRequest(title="x"), req
                    )
                )
            self.assertEqual(ctx.exception.status_code, 404)

    def test_rename_save_validation_failure_is_422(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(threads_route.ThreadCreateRequest(), req)
        )
        path = self.threads_dir / thread["id"] / "thread.json"
        data = json.loads(path.read_text())
        del data["schema_version"]
        path.write_text(json.dumps(data))

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                threads_route.rename_thread(
                    thread["id"],
                    threads_route.ThreadRenameRequest(title="Renamed"),
                    req,
                )
            )
        self.assertEqual(ctx.exception.status_code, 422)

    def test_post_message_save_validation_failure_is_422(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(threads_route.ThreadCreateRequest(), req)
        )
        path = self.threads_dir / thread["id"] / "thread.json"
        data = json.loads(path.read_text())
        del data["schema_version"]
        path.write_text(json.dumps(data))

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                threads_route.post_message(
                    thread["id"],
                    threads_route.ThreadMessageRequest(content="populate the columns"),
                    req,
                )
            )
        self.assertEqual(ctx.exception.status_code, 422)

    def test_streaming_chat_message_emits_deltas_and_persists_final_thread(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(threads_route.ThreadCreateRequest(), req)
        )
        body = threads_route.ThreadMessageRequest(content="How many births were there?")
        response = asyncio.run(
            threads_route.post_message_stream(thread["id"], body, req)
        )

        async def read_body():
            chunks = []
            async for chunk in response.body_iterator:
                chunks.append(chunk.decode() if isinstance(chunk, bytes) else chunk)
            return "".join(chunks)

        raw = asyncio.run(read_body())
        events = [
            json.loads(frame.removeprefix("data: ").strip())
            for frame in raw.split("\n\n")
            if frame.startswith("data: ")
        ]
        self.assertIn("chat_activity", [e["type"] for e in events])
        self.assertIn("chat_citation", [e["type"] for e in events])
        self.assertIn("chat_delta", [e["type"] for e in events])
        citation_event = next(e for e in events if e["type"] == "chat_citation")
        self.assertEqual(citation_event["messageIndex"], 1)
        self.assertEqual(citation_event["citation"]["marker"], "1")
        self.assertEqual(events[-1]["type"], "done")
        final = events[-1]["thread"]
        self.assertEqual(
            final["messages"][-1]["content"], "There were 412 births this quarter [1]."
        )
        reloaded = asyncio.run(threads_route.get_thread(thread["id"], req))
        self.assertEqual(
            reloaded["messages"][-1]["content"], final["messages"][-1]["content"]
        )

    def test_streaming_message_emits_starting_activity_before_agent_output(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(threads_route.ThreadCreateRequest(), req)
        )

        async def read_initial_events():
            release = asyncio.Event()

            async def slow_answer(turn, *, on_event=None):
                await release.wait()
                return _answer_result()

            threads_route._run_turn = slow_answer
            stream = threads_route._run_agent_and_stream_reply(
                thread,
                "How many births were there?",
                user={"id": "u1"},
            )
            try:
                first = await stream.__anext__()
                try:
                    second = await asyncio.wait_for(stream.__anext__(), timeout=0.1)
                except asyncio.TimeoutError:
                    release.set()
                    await stream.aclose()
                    self.fail(
                        "expected an immediate starting activity before agent output"
                    )
                release.set()
                await stream.aclose()
                return first, second
            finally:
                release.set()

        first, second = asyncio.run(read_initial_events())
        self.assertEqual(first["type"], "thread_snapshot")
        self.assertEqual(second["type"], "chat_activity")
        self.assertEqual(second["messageIndex"], 1)
        self.assertEqual(second["activity"]["id"], "chat-starting")
        self.assertEqual(second["activity"]["label"], "Thinking")
        self.assertEqual(second["activity"]["headline"], "Thinking")
        self.assertNotEqual(second["activity"]["label"], "Starting assistant")
        self.assertNotEqual(
            second["activity"]["headline"], "Starting the database assistant"
        )
        self.assertEqual(second["activity"]["kind"], "system")

    def test_streaming_thread_lists_as_running_before_agent_finishes(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(threads_route.ThreadCreateRequest(), req)
        )

        async def read_start_then_list():
            release = asyncio.Event()

            async def slow_answer(turn, *, on_event=None):
                await release.wait()
                return _answer_result()

            threads_route._run_turn = slow_answer
            stream = threads_route._run_agent_and_stream_reply(
                thread,
                "How many births were there?",
                user={"id": "u1"},
            )
            try:
                await stream.__anext__()  # thread_snapshot
                await stream.__anext__()  # starting activity
                summaries = await threads_route.list_threads(req)
                return next(s for s in summaries if s.id == thread["id"])
            finally:
                release.set()
                await stream.aclose()

        summary = asyncio.run(read_start_then_list())
        self.assertEqual(summary.status, "running")
        self.assertFalse(summary.opened)

    def test_streaming_chat_checkpoints_partial_answer_before_done(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(threads_route.ThreadCreateRequest(), req)
        )

        async def read_until_partial_then_reload():
            release = asyncio.Event()

            async def partial_answer(turn, *, on_event=None):
                await on_event(
                    {
                        "type": "chat_delta",
                        "content": "Counting births",
                    }
                )
                await release.wait()
                return _answer_result()

            threads_route._run_turn = partial_answer
            stream = threads_route._run_agent_and_stream_reply(
                thread,
                "How many births were there?",
                user={"id": "u1"},
            )
            try:
                await stream.__anext__()  # thread_snapshot
                await stream.__anext__()  # server-owned starting activity
                partial = await stream.__anext__()
                reloaded = await threads_route.get_thread(thread["id"], req)
                return partial, reloaded
            finally:
                release.set()
                await stream.aclose()

        partial, reloaded = asyncio.run(read_until_partial_then_reload())
        self.assertEqual(partial["type"], "chat_delta")
        self.assertEqual(reloaded["messages"][1]["content"], "Counting births")

    def test_question_answer_stream_emits_followup_activity(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(message="needs dataset"), req
            )
        )
        response = asyncio.run(
            threads_route.post_question_answers_stream(
                thread["id"],
                threads_route.ThreadQuestionAnswersRequest(
                    answers=[
                        {
                            "question_id": "dataset_scope",
                            "status": "answered",
                            "choice_id": "ds-nicu",
                        }
                    ]
                ),
                req,
            )
        )

        async def read_body():
            chunks = []
            async for chunk in response.body_iterator:
                chunks.append(chunk.decode() if isinstance(chunk, bytes) else chunk)
            return "".join(chunks)

        raw = asyncio.run(read_body())
        events = [
            json.loads(frame.removeprefix("data: ").strip())
            for frame in raw.split("\n\n")
            if frame.startswith("data: ")
        ]
        self.assertEqual(events[0]["type"], "thread_snapshot")
        self.assertIn("chat_activity", [e["type"] for e in events])
        self.assertIn("chat_delta", [e["type"] for e in events])
        self.assertEqual(events[-1]["type"], "done")
        snapshot = events[0]["thread"]
        self.assertEqual(
            snapshot["messages"][1]["resolution"]["ask_user_questions"]["status"],
            "answered",
        )
        self.assertEqual(snapshot["messages"][-1]["role"], "agent")
        self.assertEqual(snapshot["messages"][-1]["content"], "")

    def test_streaming_chat_continues_and_persists_after_client_disconnect(self):
        req = _request_for(_clinician())
        thread = asyncio.run(
            threads_route.create_thread(threads_route.ThreadCreateRequest(), req)
        )

        async def read_first_event_close_then_finish():
            started = asyncio.Event()
            release = asyncio.Event()

            async def slow_answer(turn, *, on_event=None):
                self.chat_answer_calls.append(
                    {
                        "content": turn.user_text,
                        "scope": turn.scope,
                        "dataset": turn.dataset,
                    }
                )
                started.set()
                await release.wait()
                return _answer_result(
                    query_log=[
                        {
                            "database": "cord-ph",
                            "query": "SELECT COUNT(*) AS n FROM cord_ph_birth_records",
                            "ts": "2026-01-01T00:00:00+00:00",
                        }
                    ]
                )

            threads_route._run_turn = slow_answer
            stream = threads_route._run_agent_and_stream_reply(
                thread,
                "How many births were there?",
                user={"id": "u1"},
            )
            try:
                first = await stream.__anext__()
                await asyncio.wait_for(started.wait(), timeout=1)
            finally:
                await stream.aclose()
            release.set()
            for _ in range(20):
                reloaded = await threads_route.get_thread(thread["id"], req)
                if reloaded["messages"][1]["content"]:
                    return first, reloaded
                await asyncio.sleep(0.05)
            return first, await threads_route.get_thread(thread["id"], req)

        first, reloaded = asyncio.run(read_first_event_close_then_finish())
        self.assertEqual(first["type"], "thread_snapshot")
        self.assertEqual(
            [message["role"] for message in reloaded["messages"]],
            ["user", "agent"],
        )
        self.assertEqual(
            reloaded["messages"][1]["content"],
            "There were 412 births this quarter [1].",
        )
        self.assertEqual(len(auth_store.list_queries_for_user("u1")), 1)

    def test_failed_chat_answer_queries_are_still_attributed(self):
        class FailingChatAnswer(RuntimeError):
            query_log = [
                {
                    "database": "cord-ph",
                    "query": "SELECT COUNT(*) AS n FROM cord_ph_birth_records",
                    "ts": "2026-01-01T00:00:00+00:00",
                }
            ]

        async def fail_after_query(turn, *, on_event=None):
            raise FailingChatAnswer("answer validation failed")

        threads_route._run_turn = fail_after_query
        thread = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(
                    message="How many births were there?"
                ),
                _request_for(_clinician()),
            )
        )
        self.assertIn("couldn't answer", thread["messages"][1]["content"])
        rows = auth_store.list_queries_for_user("u_clin")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["database"], "cord-ph")

    def test_traversal_thread_id_is_refused_and_siblings_survive(self):
        victim = self.tmp_path / "victim"
        victim.mkdir()
        req = _request_for(_clinician())
        for bad in ("..", "../victim", "foo/bar", ".", "a/../b"):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(threads_route.delete_thread(bad, req))
            self.assertEqual(ctx.exception.status_code, 404)
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(threads_route.get_thread(bad, req))
            self.assertEqual(ctx.exception.status_code, 404)
        self.assertTrue(victim.exists())


class ThreadChatAsyncPathTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmpdir.name)
        self.threads_dir = self.tmp_path / "threads"
        self.threads_dir.mkdir(parents=True, exist_ok=True)

        self._orig_threads_dir = threads_route.THREADS_DIR
        threads_route.THREADS_DIR = self.threads_dir

        self.auth_db = self.tmp_path / "auth.sqlite"
        self._orig_auth_db = auth_store.AUTH_DB_PATH
        auth_store.AUTH_DB_PATH = self.auth_db
        auth_store.init_store()

        # A SCRIPTED opencode client behind the app relay: the real seam chain
        # (route → runtime.run_turn → session/worktree/drive) runs end-to-end;
        # only the engine is faked. It writes the citation sink and feeds one
        # answer text part + the cite tool part, then goes idle.
        from core import table_population

        self._table_population = table_population
        self._orig_relay = table_population.get_session_relay()

        stubbed_citation = {
            "database": "cord-ph",
            "query": "SELECT COUNT(*) AS n FROM cord_ph_birth_records",
            "table_column": "cord_ph_birth_records.patient_code",
            "explanation": "count of birth records",
        }
        self.stubbed = {
            "answer": "There were 412 births this quarter [1]",
            "citations": [dict(stubbed_citation, marker="1")],
        }

        class FakeAgentClient:
            def __init__(self):
                self.prompts: list[str] = []
                self._queues: dict[str, asyncio.Queue] = {}

            async def create_session(self, title=None, directory=None):
                return "sess-test"

            async def subscribe(self, session_id):
                q: asyncio.Queue = asyncio.Queue()
                self._queues[session_id] = q
                return q

            async def prompt_async(self, session_id, prompt, directory=None):
                self.prompts.append(prompt)
                Path(directory).joinpath("citations.json").write_text(
                    json.dumps([dict(stubbed_citation, marker="1")]),
                    encoding="utf-8",
                )
                await self._queues[session_id].put(
                    {
                        "type": "message.part.updated",
                        "properties": {
                            "part": {
                                "type": "text",
                                "id": "answer-text",
                                "text": "There were 412 births this quarter",
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
                                    "input": json.dumps(stubbed_citation),
                                },
                            }
                        },
                    }
                )
                await self._queues[session_id].put({"type": "session.idle"})

            async def unsubscribe(self, session_id):
                self._queues.pop(session_id, None)

            async def delete_session(self, session_id, directory=None):
                return None

        self.fake_client = FakeAgentClient()
        table_population.set_session_relay(
            SimpleNamespace(agent_client=lambda: self.fake_client)
        )

    def tearDown(self) -> None:
        threads_route.THREADS_DIR = self._orig_threads_dir
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        self._table_population.set_session_relay(self._orig_relay)
        self.tmpdir.cleanup()

    def _client(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from starlette.middleware.base import BaseHTTPMiddleware

        clinician = _clinician() | {"is_active": True}

        class _InjectUser(BaseHTTPMiddleware):
            async def dispatch(self, request, call_next):
                request.state.user = clinician
                request.state.user_id = clinician["id"]
                return await call_next(request)

        app = FastAPI()
        app.add_middleware(_InjectUser)
        app.include_router(threads_route.router)
        return TestClient(app)

    def test_chat_message_returns_the_real_answer_on_the_async_path(self) -> None:
        client = self._client()
        res = client.post(
            "/api/threads", json={"message": "What was the average length of stay?"}
        )
        self.assertEqual(res.status_code, 200, res.text)
        thread = res.json()
        self.assertEqual(len(self.fake_client.prompts), 1)
        self.assertIn(
            "What was the average length of stay?", self.fake_client.prompts[0]
        )
        agent = thread["messages"][1]
        self.assertEqual(agent["content"], self.stubbed["answer"])
        self.assertTrue(agent["resolution"].get("citations"))
        self.assertEqual(validate_against_schema(thread, "thread.schema.json"), [])

    def test_thread_worktree_projects_only_granted_resources(self) -> None:
        # The thread's REAL provisioning path (runtime.run_turn →
        # session.ensure_thread_session → worktree.materialize) exposes
        # exactly the caller's granted ids:
        # the granted Dataset appears as a per-id symlink, the ungranted one
        # is absent, and the Template projection is empty (fail-closed).
        from unittest import mock

        from core.agent import worktree as worktree_module
        from server.auth import grants as grants_store

        datasets_dir = self.tmp_path / "datasets"
        for dataset_id in ("ds-granted", "ds-secret"):
            d = datasets_dir / dataset_id
            d.mkdir(parents=True)
            (d / "dataset.json").write_text(
                json.dumps({"id": dataset_id, "name": dataset_id}), encoding="utf-8"
            )
        audits_dir = self.tmp_path / "audits"
        audits_dir.mkdir()
        grants_store.self_grant_manage(
            resource_type="dataset", resource_id="ds-granted", user_id="u_clin"
        )
        with (
            mock.patch.object(worktree_module, "DATASETS_DIR", datasets_dir),
            mock.patch.object(worktree_module, "TEMPLATES_DIR", audits_dir),
        ):
            client = self._client()
            res = client.post("/api/threads", json={"message": "hello"})
        self.assertEqual(res.status_code, 200, res.text)
        worktree_dir = self.threads_dir / res.json()["id"] / "opencode"
        self.assertTrue((worktree_dir / "datasets" / "ds-granted").is_symlink())
        self.assertFalse((worktree_dir / "datasets" / "ds-secret").exists())
        self.assertEqual(list((worktree_dir / "templates").iterdir()), [])


class ThreadAttachmentAuthzTest(unittest.TestCase):
    """Message attachments are per-resource authorized, mirroring the Dataset/
    template read routes: the role permission is necessary but not sufficient —
    a dataset/template id the caller holds no active grant on is refused
    fail-closed (403; a genuinely missing Dataset stays 404) BEFORE any agent
    work, so unauthorized resource metadata never reaches the agent prompt."""

    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmpdir.name)
        self.threads_dir = self.tmp_path / "threads"
        self.threads_dir.mkdir(parents=True, exist_ok=True)
        self.datasets_dir = self.tmp_path / "datasets"
        self.datasets_dir.mkdir(parents=True, exist_ok=True)

        self._orig_threads_dir = threads_route.THREADS_DIR
        threads_route.THREADS_DIR = self.threads_dir
        self._orig_datasets_dir = threads_route.DATASETS_DIR
        threads_route.DATASETS_DIR = self.datasets_dir
        self._orig_table_db = table_store.TABLE_DB_PATH
        table_store.TABLE_DB_PATH = self.tmp_path / "table-state.db"

        self.auth_db = self.tmp_path / "auth.sqlite"
        self._orig_auth_db = auth_store.AUTH_DB_PATH
        auth_store.AUTH_DB_PATH = self.auth_db
        auth_store.init_store()

        self._seed_dataset("ds-nicu", "Term babies admitted to NICU")

        self.chat_answer_calls: list[dict] = []
        self._orig_run_turn = threads_route._run_turn

        async def fake_run_turn(turn, *, on_event=None):
            self.chat_answer_calls.append(
                {
                    "content": turn.user_text,
                    "scope": turn.scope,
                    "dataset": turn.dataset,
                    "template_id": turn.template_id,
                }
            )
            return ThreadAgentResult(
                kind="answer",
                answer="ok",
                scope=turn.scope or threads_route._whole_db_scope(),
            )

        threads_route._run_turn = fake_run_turn

    def tearDown(self) -> None:
        threads_route.THREADS_DIR = self._orig_threads_dir
        threads_route.DATASETS_DIR = self._orig_datasets_dir
        table_store.TABLE_DB_PATH = self._orig_table_db
        threads_route._run_turn = self._orig_run_turn
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        self.tmpdir.cleanup()

    def _seed_dataset(self, dataset_id: str, name: str) -> None:
        ds_dir = self.datasets_dir / dataset_id
        ds_dir.mkdir(parents=True, exist_ok=True)
        (ds_dir / "dataset.json").write_text(
            json.dumps({"id": dataset_id, "name": name}), encoding="utf-8"
        )

    def _create(self, message: str, attachments: list[dict]) -> dict:
        return asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(
                    message=message, attachments=attachments
                ),
                _request_for(_clinician()),
            )
        )

    def test_dataset_attachment_without_grant_is_403_and_never_reaches_agent(self):
        with self.assertRaises(HTTPException) as ctx:
            self._create("How many?", [{"type": "dataset", "id": "ds-nicu"}])
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertNotIn("Term babies", str(ctx.exception.detail))
        self.assertEqual(self.chat_answer_calls, [])

    def test_missing_dataset_attachment_stays_404(self):
        with self.assertRaises(HTTPException) as ctx:
            self._create("How many?", [{"type": "dataset", "id": "ds-ghost"}])
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(self.chat_answer_calls, [])

    def test_dataset_attachment_with_direct_grant_reaches_agent(self):
        grants_store.self_grant_manage(
            resource_type="dataset", resource_id="ds-nicu", user_id="u_clin"
        )
        thread = self._create("How many?", [{"type": "dataset", "id": "ds-nicu"}])
        self.assertEqual(self.chat_answer_calls[-1]["content"], "How many?")
        self.assertEqual(
            self.chat_answer_calls[-1]["dataset"]["name"],
            "Term babies admitted to NICU",
        )
        self.assertEqual(
            thread["messages"][1]["resolution"]["scope"]["dataset_id"], "ds-nicu"
        )

    def test_dataset_attachment_via_table_share_cascade_reaches_agent(self):
        # The share-then-use cascade: an active grant on a table pinning this
        # Dataset confers read, exactly as on GET /api/datasets/<id>.
        table = table_store.new_table(
            title="Shared table", source_template="cord-ph", dataset_id="ds-nicu"
        )
        table["id"] = "tbl-1"
        table_store.save_table(table)
        grants_store.create_grant(
            subject_type="user",
            subject_id="u_clin",
            resource_type="table",
            resource_id="tbl-1",
            grant_type="read",
            granted_by="u_owner",
        )
        thread = self._create("How many?", [{"type": "dataset", "id": "ds-nicu"}])
        self.assertEqual(self.chat_answer_calls[-1]["dataset"]["id"], "ds-nicu")
        self.assertEqual(
            thread["messages"][1]["resolution"]["scope"]["dataset_id"], "ds-nicu"
        )

    def test_template_attachment_without_grant_is_403(self):
        with self.assertRaises(HTTPException) as ctx:
            self._create("Run this", [{"type": "template", "id": "npda"}])
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(self.chat_answer_calls, [])

    def test_template_attachment_with_grant_reaches_agent(self):
        grants_store.self_grant_manage(
            resource_type="template", resource_id="npda", user_id="u_clin"
        )
        self._create("Run this", [{"type": "template", "id": "npda"}])
        self.assertEqual(self.chat_answer_calls[-1]["template_id"], "npda")

    def test_agent_table_request_for_ungranted_dataset_is_refused(self):
        # ADR 0006: the agent's Table request is never itself an authorization —
        # the backend re-checks the REQUESTING USER's Dataset grant before
        # pinning. Without a grant the turn surfaces the honest error reply and
        # no table is pinned.
        async def table_requesting_turn(turn, *, on_event=None):
            return ThreadAgentResult(
                kind="table_request",
                answer="",
                table_request={
                    "title": "Sneaky table",
                    "request": "one row per patient",
                    "source_template": "ad-hoc",
                    "dataset_id": "ds-nicu",
                },
                scope=turn.scope or threads_route._whole_db_scope(),
            )

        threads_route._run_turn = table_requesting_turn
        from unittest import mock

        from server.routes import tables as tables_route

        # Point the tables route at the SAME seeded Dataset library, so absent
        # the grant gate the pin would genuinely succeed — the test then fails.
        with mock.patch.object(tables_route, "DATASETS_DIR", self.datasets_dir):
            thread = self._create("build it", [])
        self.assertIn("couldn't answer", thread["messages"][1]["content"])
        self.assertEqual(thread.get("artifact_ids", []), [])
        self.assertEqual(table_store.list_table_ids(), [])

    def test_agent_table_request_pins_the_brief_onto_the_table(self):
        # The Brief (glossary): the Table request's recorded user intent is
        # copied onto the pinned table as a first-class attribute — trimmed,
        # kept for life — so a re-run can work from the original delegation
        # instruction.
        async def table_requesting_turn(turn, *, on_event=None):
            return ThreadAgentResult(
                kind="table_request",
                answer="I started that table.",
                table_request={
                    "title": "Cord pH audit",
                    "request": "  one row per patient with their cord pH  ",
                    "source_template": "ad-hoc",
                    "dataset_id": None,
                },
                scope=turn.scope or threads_route._whole_db_scope(),
            )

        threads_route._run_turn = table_requesting_turn
        thread = self._create("build it", [])
        table_ids = thread.get("artifact_ids", [])
        self.assertEqual(len(table_ids), 1)
        table = table_store.load_table(table_ids[0])
        # Stored TRIMMED, and the persisted table stays schema-valid.
        self.assertEqual(table["brief"], "one row per patient with their cord pH")
        self.assertEqual(validate_against_schema(table, "table.schema.json"), [])

    def test_worktree_authorizer_matches_the_read_routes(self):
        # The projection predicate mirrors what the caller may READ: a direct
        # grant, or (Datasets only) the table-share cascade — so anything
        # attachable is also navigable in the agent worktree.
        user = _clinician()
        authorize = threads_route._worktree_authorizer(user)
        self.assertFalse(authorize("dataset", "ds-nicu"))
        table = table_store.new_table(
            title="Shared", source_template="cord-ph", dataset_id="ds-nicu"
        )
        table["id"] = "tbl-cascade"
        table_store.save_table(table)
        grants_store.create_grant(
            subject_type="user",
            subject_id="u_clin",
            resource_type="table",
            resource_id="tbl-cascade",
            grant_type="read",
            granted_by="u_owner",
        )
        self.assertTrue(authorize("dataset", "ds-nicu"))
        self.assertFalse(authorize("template", "tpl-anything"))

    def test_stream_route_rejects_unauthorized_dataset_before_streaming(self):
        thread = asyncio.run(
            threads_route.create_thread(
                threads_route.ThreadCreateRequest(), _request_for(_clinician())
            )
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                threads_route.post_message_stream(
                    thread["id"],
                    threads_route.ThreadMessageRequest(
                        content="How many?",
                        attachments=[{"type": "dataset", "id": "ds-nicu"}],
                    ),
                    _request_for(_clinician()),
                )
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(self.chat_answer_calls, [])


class ThreadMiddleware401Test(unittest.TestCase):
    def test_unauthenticated_list_threads_returns_401(self) -> None:
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from server.auth.middleware import AuthMiddleware

        app = FastAPI()
        app.add_middleware(AuthMiddleware)
        app.include_router(threads_route.router)
        client = TestClient(app)

        res = client.get("/api/threads")
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json().get("detail"), "Authentication required")


if __name__ == "__main__":
    unittest.main()
