// The single-run-store contract (Phase-4 T3, decision 14): the per-audit
// record in audits.js is the only owned run state; the live views in chat.js
// (activity / activeWorkbook / reviewSummary / runStatus / messages) are
// DERIVED from (audits, currentAuditId, activeStream). These tests drive the
// REAL stores through the mutators the stream sink uses and assert the
// derived views — replacing both the old dual-write bookkeeping tests and
// the T2 mirror regression test (the mirror layer no longer exists; a
// throwing-subscriber freeze has no home to come back to).
import test from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";

import {
  audits,
  currentAuditId,
  activeStream,
  startAudit,
  setAuditRunId,
  setAuditStatus,
  syncAuditActivity,
  syncAuditReviewSummary,
  syncAuditWorkbook,
  updateCurrentAuditWorkbook,
  resetAuditHistory,
} from "./audits.js";
import {
  messages,
  activity,
  reviewSummary,
  activeWorkbook,
  runStatus,
  addMessage,
} from "./chat.js";

function freshAudit(name = "Cord pH") {
  resetAuditHistory();
  return startAudit({ id: "cord-ph", name }, {});
}

test("a full run sequence through the mutators is visible in the derived views", () => {
  const id = freshAudit();

  // startAudit marks the lifecycle in flight BEFORE the run id exists — no
  // idle flash during the create-run round-trip.
  assert.equal(get(runStatus), "running");

  setAuditRunId(id, "r1");
  activeStream.set({ auditId: id, runId: "r1" });

  syncAuditActivity(id, [{ type: "activity", headline: "Preparing the audit." }]);
  syncAuditWorkbook(id, {
    runId: "r1",
    sheets: [{ name: "ALL", data: [["Patient code"], [null]], meta: { columns: [{}] } }],
    cellMetadata: {},
    currentSheetIndex: 0,
    updateTick: 0,
  });
  syncAuditWorkbook(id, {
    runId: "r1",
    sheets: [{ name: "ALL", data: [["Patient code"], ["P-0001"]], meta: { columns: [{}] } }],
    cellMetadata: { "ALL!A2": { kind: "direct", state: "filled" } },
    currentSheetIndex: 0,
    updateTick: 1,
  });
  addMessage({ role: "assistant", type: "chip", label: "result.xlsx" });
  syncAuditReviewSummary(id, { type: "review_summary", totals: { cells: 1 } });
  setAuditStatus(id, "completed");
  activeStream.set(null);

  assert.equal(get(activity).length, 1);
  assert.equal(get(activeWorkbook).sheets[0].data[1][0], "P-0001");
  assert.equal(get(activeWorkbook).updateTick, 1);
  assert.equal(get(messages).length, 1);
  assert.equal(get(reviewSummary).totals.cells, 1);
  assert.equal(get(runStatus), "completed");
});

test("a background run's writes never pollute the audit being viewed", () => {
  const viewed = freshAudit("Viewed");
  const background = startAudit({ id: "npda", name: "Background" }, {});
  // startAudit focuses the new audit; switch back to the first one.
  currentAuditId.set(viewed);

  syncAuditActivity(background, [{ type: "activity", headline: "Background work." }]);
  syncAuditWorkbook(background, { runId: "r2", sheets: [], cellMetadata: {} });
  syncAuditReviewSummary(background, { type: "review_summary", totals: { cells: 9 } });

  assert.deepEqual(get(activity), [], "viewed audit shows no background activity");
  assert.equal(get(activeWorkbook), null);
  assert.equal(get(reviewSummary), null);

  // Switching the pointer is all it takes to see the background audit.
  currentAuditId.set(background);
  assert.equal(get(activity).length, 1);
  assert.equal(get(reviewSummary).totals.cells, 9);
});

test("a stored 'running' status without an active stream reads as idle (reload case)", () => {
  const id = freshAudit();
  setAuditRunId(id, "r3");
  assert.equal(get(runStatus), "running", "in flight while the stream is active");

  // Simulate a page reload: the record persisted as running, no live stream.
  activeStream.set(null);
  assert.equal(get(runStatus), "idle");

  setAuditStatus(id, "completed");
  assert.equal(get(runStatus), "completed");
});

test("updateCurrentAuditWorkbook patches the viewed workbook in place", () => {
  const id = freshAudit();
  syncAuditWorkbook(id, {
    runId: "r4",
    sheets: [{ name: "ALL", data: [["H"], ["v"]] }],
    cellMetadata: { "ALL!A2": { kind: "interpret", review_state: "not_reviewed" } },
    currentSheetIndex: 0,
    updateTick: 0,
  });

  updateCurrentAuditWorkbook((wb) => ({
    ...wb,
    cellMetadata: { "ALL!A2": { kind: "interpret", review_state: "reviewed" } },
    updateTick: wb.updateTick + 1,
  }));

  assert.equal(get(activeWorkbook).cellMetadata["ALL!A2"].review_state, "reviewed");
  assert.equal(get(activeWorkbook).updateTick, 1);

  // No-op without a workbook or without a selection.
  currentAuditId.set(null);
  updateCurrentAuditWorkbook((wb) => ({ ...wb, updateTick: 99 }));
  const stored = get(audits).find((a) => a.id === id);
  assert.equal(stored.workbook.updateTick, 1);
});
