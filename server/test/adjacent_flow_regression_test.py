"""Deterministic adjacent-flow regression guardrails for stage-1 merge gate."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def _read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


class AdjacentFlowRegressionTest(unittest.TestCase):
    def test_home_results_library_routes_present_in_main_panel(self) -> None:
        content = _read("app/src/components/MainPanel.svelte")
        self.assertIn('$currentView === "home"', content)
        self.assertIn("$currentView === \"results\"", content)
        self.assertIn("$currentView === \"library\"", content)
        self.assertIn("<HomeScreen />", content)
        self.assertIn("<ResultsView />", content)
        self.assertIn("<LibraryPanel />", content)

    def test_run_start_and_results_navigation_paths_present(self) -> None:
        chat = _read("app/src/stores/chat.js")
        run_from_spec = _read("app/src/lib/runFromSpec.js")
        self.assertIn("createRunFromDescription", chat)
        self.assertIn("goToResults();", chat)
        self.assertIn("goToResults();", run_from_spec)

    def test_settings_modal_open_close_wiring_present(self) -> None:
        left_panel = _read("app/src/components/LeftPanel.svelte")
        self.assertIn("let showSettings = false;", left_panel)
        self.assertIn("on:click={() => (showSettings = true)}", left_panel)
        self.assertIn("<SettingsModal on:close={() => (showSettings = false)} />", left_panel)


if __name__ == "__main__":
    unittest.main()
