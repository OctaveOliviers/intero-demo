import test from "node:test";
import assert from "node:assert/strict";

import { countWorkbookStatus } from "./statusCounters.js";

test("blocked and needs-review are counted from cell metadata", () => {
  const meta = {
    "ALL!A2": { kind: "direct", state: "filled" },
    "ALL!B2": { kind: "interpret", state: "filled", review_state: "not_reviewed" },
    // No review_state → NOT counted: the backend's needs_verification ignores
    // it too (the store sets "not_reviewed" on real filled interpret cells), so
    // the chip stays in lock-step with the review summary.
    "ALL!C2": { kind: "interpret", state: "filled" },
    "ALL!D2": { kind: "interpret", state: "filled", review_state: "reviewed" },
    "ALL!E2": { state: "blocked", reason_code: "NOT_LOCATED" },
    "ALL!F2": { kind: "interpret", state: "blocked", reason_code: "MISSING_SOURCE_RECORD" },
    "ALL!G2": { state: "not_applicable" },
  };
  assert.deepEqual(countWorkbookStatus(meta), { blocked: 2, needsReview: 1 });
});

test("a blocked interpret cell never double-counts as needs-review", () => {
  const meta = { "ALL!A2": { kind: "interpret", state: "blocked", review_state: "not_reviewed", reason_code: "X" } };
  assert.deepEqual(countWorkbookStatus(meta), { blocked: 1, needsReview: 0 });
});

test("counts drop to zero as cells are reviewed (live behaviour)", () => {
  const before = { "ALL!A2": { kind: "interpret", state: "filled", review_state: "not_reviewed" } };
  const after = { "ALL!A2": { kind: "interpret", state: "filled", review_state: "reviewed" } };
  assert.equal(countWorkbookStatus(before).needsReview, 1);
  assert.equal(countWorkbookStatus(after).needsReview, 0);
});

test("empty / absent metadata is zero", () => {
  assert.deepEqual(countWorkbookStatus(null), { blocked: 0, needsReview: 0 });
  assert.deepEqual(countWorkbookStatus({}), { blocked: 0, needsReview: 0 });
});
