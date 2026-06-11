import test from "node:test";
import assert from "node:assert/strict";

import { isV2RunEvent, isValidV2Activity, V2_RUN_EVENT_TYPES } from "./runStreamContract.js";

test("strict v2 set contains exactly seven event names", () => {
  assert.deepEqual(
    [...V2_RUN_EVENT_TYPES].sort(),
    ["activity", "cell_update", "done", "error", "refresh_summary", "review_summary", "workbook_created"],
  );
});

test("legacy event aliases are rejected", () => {
  assert.equal(isV2RunEvent({ type: "delta" }), false);
  assert.equal(isV2RunEvent({ type: "log" }), false);
  assert.equal(isV2RunEvent({ type: "text" }), false);
  assert.equal(isV2RunEvent({ type: "thinking" }), false);
  assert.equal(isV2RunEvent({ type: "tool" }), false);
});

test("activity requires non-empty headline", () => {
  assert.equal(isValidV2Activity({ type: "activity", headline: "Working." }), true);
  assert.equal(isValidV2Activity({ type: "activity", headline: "   " }), false);
  assert.equal(isValidV2Activity({ type: "activity" }), false);
});

test("review_summary and done are accepted by strict-v2 gate", () => {
  assert.equal(isV2RunEvent({ type: "review_summary" }), true);
  assert.equal(isV2RunEvent({ type: "done" }), true);
});
