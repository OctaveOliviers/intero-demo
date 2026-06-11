"""Lock canonical run API surface: legacy start flow is not exported."""

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

import core.running as running  # noqa: E402


class RunningPublicApiTest(unittest.TestCase):
    def test_exports_only_canonical_spine_surface(self) -> None:
        self.assertEqual(
            set(running.__all__),
            {"RunStore", "new_run_id", "orchestrate_run"},
        )

    def test_legacy_run_start_surface_is_not_available(self) -> None:
        self.assertFalse(hasattr(running, "start_run"))
        self.assertFalse(hasattr(running, "build_agent_prompt"))
        self.assertFalse(hasattr(running, "collect_deps"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
