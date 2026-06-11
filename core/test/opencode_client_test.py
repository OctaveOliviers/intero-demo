"""Tests for OpenCodeClient event routing.

The sessionID lives in different places depending on the opencode event type.
``_session_id_of`` must find it for every shape, otherwise content events
(reasoning/text/tool) get dropped before they ever reach a subscriber and the
frontend stream goes dark while the agent is working.
"""

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from core.clients.opencode_client import OpenCodeClient  # noqa: E402


class SessionIdExtractionTest(unittest.TestCase):
    def test_lifecycle_event_top_level(self):
        ev = {"type": "session.idle", "properties": {"sessionID": "ses_1"}}
        self.assertEqual(OpenCodeClient._session_id_of(ev), "ses_1")

    def test_message_part_updated_nested_in_part(self):
        # Real opencode shape: sessionID lives inside the part, not at the top.
        ev = {
            "type": "message.part.updated",
            "properties": {"part": {"sessionID": "ses_2", "type": "reasoning", "text": "hmm"}},
        }
        self.assertEqual(OpenCodeClient._session_id_of(ev), "ses_2")

    def test_message_updated_nested_in_info(self):
        ev = {"type": "message.updated", "properties": {"info": {"sessionID": "ses_3"}}}
        self.assertEqual(OpenCodeClient._session_id_of(ev), "ses_3")

    def test_missing_session_id_returns_none(self):
        self.assertIsNone(OpenCodeClient._session_id_of({"type": "server.connected", "properties": {}}))
        self.assertIsNone(OpenCodeClient._session_id_of({"type": "x"}))


if __name__ == "__main__":
    unittest.main()
