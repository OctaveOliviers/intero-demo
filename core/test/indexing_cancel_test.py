"""Tests for cancelling in-flight indexing when an entity is deleted."""

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from core.indexing import service  # noqa: E402


class CancelIndexingTest(unittest.TestCase):
    def test_cancel_is_idempotent_when_nothing_running(self):
        service.cancel("audit", "does-not-exist")
        service.cancel("database", "does-not-exist")


if __name__ == "__main__":
    unittest.main()
