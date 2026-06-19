import test from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";

import {
  RIGHT_PANEL_MODES,
  openCellEvidence,
  openPanel,
  patchSelectedCellMeta,
  resetResultViewUiState,
  resultViewUiState,
} from "./resultViewUi.js";

test("patchSelectedCellMeta updates the selected evidence cell metadata", () => {
  resetResultViewUiState();
  openCellEvidence("ALL!B2", { review_state: "not_reviewed", state: "filled" });

  patchSelectedCellMeta("ALL!B2", { review_state: "reviewed" });

  const state = get(resultViewUiState);
  assert.equal(state.selectedCellRef, "ALL!B2");
  assert.equal(state.selectedCellMeta.review_state, "reviewed");
});

test("patchSelectedCellMeta is a no-op for a different selected cell", () => {
  resetResultViewUiState();
  openCellEvidence("ALL!B2", { review_state: "not_reviewed", state: "filled" });

  patchSelectedCellMeta("ALL!C2", { review_state: "reviewed" });

  const state = get(resultViewUiState);
  assert.equal(state.selectedCellRef, "ALL!B2");
  assert.equal(state.selectedCellMeta.review_state, "not_reviewed");
});

test("patchSelectedCellMeta does not mutate metadata outside cell-evidence mode", () => {
  resetResultViewUiState();
  openCellEvidence("ALL!B2", { review_state: "not_reviewed", state: "filled" });
  openPanel(RIGHT_PANEL_MODES.AGENT_ACTIVITY);

  patchSelectedCellMeta("ALL!B2", { review_state: "reviewed" });

  const state = get(resultViewUiState);
  assert.equal(state.rightPanelMode, RIGHT_PANEL_MODES.AGENT_ACTIVITY);
  assert.equal(state.selectedCellMeta.review_state, "not_reviewed");
});
