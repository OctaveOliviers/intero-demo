"""Tests for the thread persistence store (core.threads.store).

A thread persists as one JSON file at ``var/threads/<id>/thread.json``, validated
against ``thread.schema.json``. The store mints ids, builds new threads, appends
messages (user + agent), derives the title, bumps ``updated_at``,
lists summaries recency-ordered, and deletes — all over a tmp threads dir.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from core.contracts import validate_against_schema
from core.threads import store as thread_store
from core.threads.store import ThreadError


class ThreadStoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.threads_dir = Path(self.tmpdir.name) / "threads"
        self.threads_dir.mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        self.tmpdir.cleanup()

    # --- mint + new --------------------------------------------------------

    def test_new_thread_is_schema_valid_and_has_a_thread_id(self):
        thread = thread_store.new_thread()
        self.assertTrue(thread["id"].startswith("thread-"))
        self.assertEqual(thread["schema_version"], "1")
        self.assertEqual(thread["status"], "complete")
        self.assertEqual(thread["messages"], [])
        self.assertEqual(thread["artifact_ids"], [])
        self.assertEqual(thread["title"], "New thread")
        self.assertEqual(validate_against_schema(thread, "thread.schema.json"), [])

    # --- title derivation --------------------------------------------------

    def test_title_derives_from_the_first_user_message_trimmed(self):
        long_msg = "Audit " + "x" * 200
        thread = thread_store.new_thread()
        thread_store.append_user_message(thread, long_msg)
        self.assertTrue(thread["title"].startswith("Audit "))
        self.assertLessEqual(len(thread["title"]), 60)
        # A later user message does NOT change the already-derived title.
        thread_store.append_user_message(thread, "a different question")
        self.assertTrue(thread["title"].startswith("Audit "))

    # --- append + persist round-trip --------------------------------------

    def test_save_and_load_round_trips_and_stays_schema_valid(self):
        thread = thread_store.new_thread()
        thread_store.append_user_message(thread, "How many births were there?")
        thread_store.append_agent_message(
            thread,
            "Chat answers aren't built yet.",
            resolution={
                "output": "chat",
                "scope": {
                    "kind": "whole_db",
                    "dataset_id": None,
                    "disclosure": "answered across the whole hospital database",
                },
                "artifact_id": None,
                "seam": "chat-answer:track-c",
            },
        )
        self.assertEqual(validate_against_schema(thread, "thread.schema.json"), [])
        path = thread_store.save_thread(thread, threads_dir=self.threads_dir)
        self.assertTrue(path.exists())

        reloaded = thread_store.load_thread(thread["id"], threads_dir=self.threads_dir)
        self.assertEqual(reloaded, thread)
        self.assertEqual(len(reloaded["messages"]), 2)
        self.assertEqual(reloaded["messages"][0]["role"], "user")
        self.assertEqual(reloaded["messages"][1]["role"], "agent")
        self.assertRegex(reloaded["messages"][0]["id"], r"^msg-")
        self.assertRegex(reloaded["messages"][1]["id"], r"^msg-")
        self.assertNotEqual(
            reloaded["messages"][0]["id"], reloaded["messages"][1]["id"]
        )
        self.assertEqual(
            reloaded["messages"][1]["resolution"]["seam"], "chat-answer:track-c"
        )

    def test_load_missing_thread_raises(self):
        with self.assertRaises(ThreadError):
            thread_store.load_thread("thread-nope", threads_dir=self.threads_dir)

    # --- listing (recency-ordered) ----------------------------------------

    def test_list_summaries_are_recency_ordered_by_updated_at_desc(self):
        older = thread_store.new_thread()
        older["updated_at"] = "2026-01-01T00:00:00+00:00"
        thread_store.append_user_message(older, "older thread question")
        older["updated_at"] = "2026-01-01T00:00:00+00:00"  # keep it old
        thread_store.save_thread(older, threads_dir=self.threads_dir)

        newer = thread_store.new_thread()
        thread_store.append_user_message(newer, "newer thread question")
        newer["updated_at"] = "2026-06-25T00:00:00+00:00"
        thread_store.save_thread(newer, threads_dir=self.threads_dir)

        summaries = thread_store.list_summaries(threads_dir=self.threads_dir)
        self.assertEqual([s["id"] for s in summaries], [newer["id"], older["id"]])
        # Summary shape is exactly the sidebar contract.
        self.assertEqual(
            set(summaries[0].keys()),
            {"id", "title", "updated_at", "message_count", "status"},
        )
        self.assertEqual(summaries[0]["message_count"], 1)
        self.assertEqual(summaries[0]["status"], "complete")

    def test_list_summaries_reports_running_status(self):
        thread = thread_store.new_thread()
        thread_store.append_user_message(thread, "How many births were there?")
        thread_store.append_agent_message(
            thread,
            "",
            resolution={
                "output": "chat",
                "scope": {
                    "kind": "whole_db",
                    "dataset_id": None,
                    "disclosure": "answered across the whole hospital database",
                },
                "artifact_id": None,
                "seam": None,
            },
        )
        thread["status"] = "running"
        thread_store.save_thread(thread, threads_dir=self.threads_dir)

        summaries = thread_store.list_summaries(threads_dir=self.threads_dir)
        self.assertEqual(summaries[0]["status"], "running")

    def test_list_on_empty_dir_is_empty(self):
        self.assertEqual(thread_store.list_summaries(threads_dir=self.threads_dir), [])

    # --- delete ------------------------------------------------------------

    def test_delete_removes_the_thread_dir(self):
        thread = thread_store.new_thread()
        thread_store.save_thread(thread, threads_dir=self.threads_dir)
        self.assertTrue((self.threads_dir / thread["id"]).exists())
        thread_store.delete_thread(thread["id"], threads_dir=self.threads_dir)
        self.assertFalse((self.threads_dir / thread["id"]).exists())

    def test_delete_missing_thread_raises(self):
        with self.assertRaises(ThreadError):
            thread_store.delete_thread("thread-nope", threads_dir=self.threads_dir)


class ResetRunningThreadsTest(unittest.TestCase):
    """Startup sweep: a turn never survives the process, so any persisted
    "running" thread is a dead turn — settled back to "complete" so the guard
    against concurrent turns can never brick a thread across a crash."""

    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.threads_dir = Path(self.tmpdir.name) / "threads"
        self.threads_dir.mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        self.tmpdir.cleanup()

    def test_settles_running_threads_and_leaves_complete_ones_alone(self):
        crashed = thread_store.new_thread()
        crashed["status"] = "running"
        thread_store.save_thread(crashed, threads_dir=self.threads_dir)
        fine = thread_store.new_thread()
        thread_store.save_thread(fine, threads_dir=self.threads_dir)

        settled = thread_store.reset_running_threads(threads_dir=self.threads_dir)

        self.assertEqual(settled, 1)
        reloaded = thread_store.load_thread(crashed["id"], threads_dir=self.threads_dir)
        self.assertEqual(reloaded["status"], "complete")
        again = thread_store.reset_running_threads(threads_dir=self.threads_dir)
        self.assertEqual(again, 0)


if __name__ == "__main__":
    unittest.main()
