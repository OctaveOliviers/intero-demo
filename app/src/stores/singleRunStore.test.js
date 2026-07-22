// The single-run-store contract (Phase-4 T3, decision 14): the per-populated-table
// record in populatedTables.js is the only owned run state; the live views in chat.js
// (activity / activeWorkbook / reviewSummary / tablePopulationStatus / messages) are
// DERIVED from (populatedTables, currentPopulatedTableId, activeStream). These tests drive the
// REAL stores through the mutators the stream sink uses and assert the
// derived views — replacing both the old dual-write bookkeeping tests and
// the T2 mirror regression test (the mirror layer no longer exists; a
// throwing-subscriber freeze has no home to come back to).
import test from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";

import {
  populatedTables,
  currentPopulatedTableId,
  activeStream,
  startTablePopulation,
  setPopulatedTablePopulationId,
  setPopulatedTableStatus,
  syncPopulatedTableActivity,
  syncPopulatedTableReviewSummary,
  syncPopulatedTableWorkbook,
  updateCurrentPopulatedTableWorkbook,
  resetPopulatedTableHistory,
} from "./populatedTables.js";
import {
  messages,
  activity,
  reviewSummary,
  activeWorkbook,
  tablePopulationStatus,
  addMessage,
} from "./chat.js";

function freshPopulatedTable(name = "Cord pH") {
  resetPopulatedTableHistory();
  return startTablePopulation({ id: "cord-ph", name }, {});
}

test("a full run sequence through the mutators is visible in the derived views", () => {
  const id = freshPopulatedTable();

  // startTablePopulation marks the lifecycle in flight BEFORE the run id exists — no
  // idle flash during the create-run round-trip.
  assert.equal(get(tablePopulationStatus), "running");

  setPopulatedTablePopulationId(id, "r1");
  activeStream.set({ populatedTableId: id, tablePopulationId: "r1" });

  syncPopulatedTableActivity(id, [{ type: "activity", headline: "Preparing the audit." }]);
  syncPopulatedTableWorkbook(id, {
    tablePopulationId: "r1",
    sheets: [{ name: "ALL", data: [["Patient code"], [null]], meta: { columns: [{}] } }],
    cellMetadata: {},
    currentSheetIndex: 0,
    updateTick: 0,
  });
  syncPopulatedTableWorkbook(id, {
    tablePopulationId: "r1",
    sheets: [{ name: "ALL", data: [["Patient code"], ["P-0001"]], meta: { columns: [{}] } }],
    cellMetadata: { "ALL!A2": { kind: "direct", state: "filled" } },
    currentSheetIndex: 0,
    updateTick: 1,
  });
  addMessage({ role: "assistant", type: "chip", label: "result.xlsx" });
  syncPopulatedTableReviewSummary(id, { type: "review_summary", totals: { cells: 1 } });
  setPopulatedTableStatus(id, "completed");
  activeStream.set(null);

  assert.equal(get(activity).length, 1);
  assert.equal(get(activeWorkbook).sheets[0].data[1][0], "P-0001");
  assert.equal(get(activeWorkbook).updateTick, 1);
  assert.equal(get(messages).length, 1);
  assert.equal(get(reviewSummary).totals.cells, 1);
  assert.equal(get(tablePopulationStatus), "completed");
});

test("a background run's writes never pollute the populated table being viewed", () => {
  const viewed = freshPopulatedTable("Viewed");
  const background = startTablePopulation({ id: "npda", name: "Background" }, {});
  // startTablePopulation focuses the new populated table; switch back to the first one.
  currentPopulatedTableId.set(viewed);

  syncPopulatedTableActivity(background, [{ type: "activity", headline: "Background work." }]);
  syncPopulatedTableWorkbook(background, { tablePopulationId: "r2", sheets: [], cellMetadata: {} });
  syncPopulatedTableReviewSummary(background, { type: "review_summary", totals: { cells: 9 } });

  assert.deepEqual(get(activity), [], "viewed populated table shows no background activity");
  assert.equal(get(activeWorkbook), null);
  assert.equal(get(reviewSummary), null);

  // Switching the pointer is all it takes to see the background record.
  currentPopulatedTableId.set(background);
  assert.equal(get(activity).length, 1);
  assert.equal(get(reviewSummary).totals.cells, 9);
});

test("a stored 'running' status without an active stream reads as idle (reload case)", () => {
  const id = freshPopulatedTable();
  setPopulatedTablePopulationId(id, "r3");
  assert.equal(get(tablePopulationStatus), "running", "in flight while the stream is active");

  // Simulate a page reload: the record persisted as running, no live stream.
  activeStream.set(null);
  assert.equal(get(tablePopulationStatus), "idle");

  setPopulatedTableStatus(id, "completed");
  assert.equal(get(tablePopulationStatus), "completed");
});

test("updateCurrentPopulatedTableWorkbook patches the viewed workbook in place", () => {
  const id = freshPopulatedTable();
  syncPopulatedTableWorkbook(id, {
    tablePopulationId: "r4",
    sheets: [{ name: "ALL", data: [["H"], ["v"]] }],
    cellMetadata: { "ALL!A2": { kind: "interpret", review_state: "not_reviewed" } },
    currentSheetIndex: 0,
    updateTick: 0,
  });

  updateCurrentPopulatedTableWorkbook((wb) => ({
    ...wb,
    cellMetadata: { "ALL!A2": { kind: "interpret", review_state: "reviewed" } },
    updateTick: wb.updateTick + 1,
  }));

  assert.equal(get(activeWorkbook).cellMetadata["ALL!A2"].review_state, "reviewed");
  assert.equal(get(activeWorkbook).updateTick, 1);

  // No-op without a workbook or without a selection.
  currentPopulatedTableId.set(null);
  updateCurrentPopulatedTableWorkbook((wb) => ({ ...wb, updateTick: 99 }));
  const stored = get(populatedTables).find((a) => a.id === id);
  assert.equal(stored.workbook.updateTick, 1);
});
