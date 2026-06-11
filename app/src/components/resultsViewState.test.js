import test from "node:test";
import assert from "node:assert/strict";

import { shouldShowTerminalSummary } from "./resultsViewState.js";

test("terminal review summary is hidden while run is in progress", () => {
  assert.equal(shouldShowTerminalSummary("running", { type: "review_summary" }), false);
  assert.equal(shouldShowTerminalSummary("error", { type: "review_summary" }), false);
});

test("terminal review summary is visible only after completed run", () => {
  assert.equal(shouldShowTerminalSummary("completed", { type: "review_summary" }), true);
  assert.equal(shouldShowTerminalSummary("completed", null), false);
});
