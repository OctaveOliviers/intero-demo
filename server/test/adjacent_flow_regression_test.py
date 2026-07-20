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
        self.assertIn('$currentView === "results"', content)
        self.assertIn('$currentView === "library"', content)
        self.assertIn("<HomeScreen />", content)
        self.assertIn("<ResultsView />", content)
        self.assertIn("<LibraryPanel />", content)

    def test_run_start_and_results_navigation_paths_present(self) -> None:
        chat = _read("app/src/stores/chat.js")
        run_from_spec = _read("app/src/lib/runFromSpec.js")
        self.assertIn("createTablePopulationFromDescription", chat)
        self.assertIn("goToResults();", chat)
        self.assertIn("goToResults();", run_from_spec)

    def test_settings_opens_full_page_console_wiring_present(self) -> None:
        # RBAC slice 6 (issue #293) replaced the Settings modal with a full-page
        # admin console (design B): the LeftPanel Settings button now navigates to
        # the "settings" view, and MainPanel renders SettingsPage for it.
        left_panel = _read("app/src/components/LeftPanel.svelte")
        self.assertIn("openSettings", left_panel)
        self.assertIn("on:click={openSettings}", left_panel)
        self.assertNotIn("SettingsModal", left_panel)

        main_panel = _read("app/src/components/MainPanel.svelte")
        self.assertIn('$currentView === "settings"', main_panel)
        self.assertIn("<SettingsPage />", main_panel)


if __name__ == "__main__":
    unittest.main()
