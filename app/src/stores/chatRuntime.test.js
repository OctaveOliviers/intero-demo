import test from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";

import {
  reviewSummary,
  activity,
  activeWorkbook,
  activeCommand,
  runStatus,
  isSubmitting,
  error,
  resetChatRuntime,
} from "./chat.js";
import {
  audits,
  currentAuditId,
  activeStream,
  startAudit,
  syncAuditActivity,
  syncAuditReviewSummary,
  syncAuditWorkbook,
  resetAuditHistory,
} from "./audits.js";

test("resetChatRuntime clears transients; resetAuditHistory clears the derived views", () => {
  const id = startAudit({ id: "t", name: "Cord pH" }, {});
  syncAuditActivity(id, [{ type: "activity", headline: "Preparing workbook." }]);
  syncAuditReviewSummary(id, { type: "review_summary", totals: { cells: 1 } });
  syncAuditWorkbook(id, { runId: "r1", sheets: [], cellMetadata: {} });
  activeCommand.set({ command: "run" });
  isSubmitting.set(true);
  error.set("boom");

  resetChatRuntime();

  // Transients cleared; the audit record (and its derived views) survive a
  // runtime reset — they are wiped by resetAuditHistory (the logout path).
  assert.equal(get(activeCommand), null);
  assert.equal(get(isSubmitting), false);
  assert.equal(get(error), null);
  assert.equal(get(activeStream), null);
  assert.equal(get(activity).length, 1);

  resetAuditHistory();

  assert.equal(get(reviewSummary), null);
  assert.deepEqual(get(activity), []);
  assert.equal(get(activeWorkbook), null);
  assert.equal(get(runStatus), "idle");
  assert.deepEqual(get(audits), []);
  assert.equal(get(currentAuditId), null);
});
