import test from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";

import {
  reviewSummary,
  activity,
  activeWorkbook,
  activeCommand,
  tablePopulationStatus,
  isSubmitting,
  error,
  resetChatRuntime,
} from "./chat.js";
import {
  populatedTables,
  currentPopulatedTableId,
  activeStream,
  startTablePopulation,
  syncPopulatedTableActivity,
  syncPopulatedTableReviewSummary,
  syncPopulatedTableWorkbook,
  resetPopulatedTableHistory,
} from "./populatedTables.js";

test("resetChatRuntime clears transients; resetPopulatedTableHistory clears the derived views", () => {
  const id = startTablePopulation({ id: "t", name: "Cord pH" }, {});
  syncPopulatedTableActivity(id, [{ type: "activity", headline: "Preparing workbook." }]);
  syncPopulatedTableReviewSummary(id, { type: "review_summary", totals: { cells: 1 } });
  syncPopulatedTableWorkbook(id, { tablePopulationId: "r1", sheets: [], cellMetadata: {} });
  activeCommand.set({ command: "run" });
  isSubmitting.set(true);
  error.set("boom");

  resetChatRuntime();

  // Transients cleared; the populated-table record (and its derived views) survive a
  // runtime reset — they are wiped by resetPopulatedTableHistory (the logout path).
  assert.equal(get(activeCommand), null);
  assert.equal(get(isSubmitting), false);
  assert.equal(get(error), null);
  assert.equal(get(activeStream), null);
  assert.equal(get(activity).length, 1);

  resetPopulatedTableHistory();

  assert.equal(get(reviewSummary), null);
  assert.deepEqual(get(activity), []);
  assert.equal(get(activeWorkbook), null);
  assert.equal(get(tablePopulationStatus), "idle");
  assert.deepEqual(get(populatedTables), []);
  assert.equal(get(currentPopulatedTableId), null);
});
