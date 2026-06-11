import test from "node:test";
import assert from "node:assert/strict";
import { handleRefreshConflict } from "./refreshConflict.js";

test("RUN_EXECUTION_ACTIVE resumes by reconnecting stream", () => {
  const calls = [];
  const reconnect = (runId, auditId) => calls.push({ runId, auditId });
  const out = handleRefreshConflict("RUN_EXECUTION_ACTIVE", "run-123", "audit-456", reconnect);
  assert.deepEqual(out, { status: "resumed", runId: "run-123" });
  assert.deepEqual(calls, [{ runId: "run-123", auditId: "audit-456" }]);
});

test("RUN_NOT_FOUND remains a user-facing error", () => {
  assert.throws(
    () => handleRefreshConflict("RUN_NOT_FOUND", "run-123", "audit-456", () => {}),
    /Run not found/,
  );
});

test("RUN_NOT_REFRESHABLE remains a user-facing error", () => {
  assert.throws(
    () => handleRefreshConflict("RUN_NOT_REFRESHABLE", "run-123", "audit-456", () => {}),
    /not refreshable/,
  );
});

test("unknown refresh conflict code is left to caller", () => {
  const out = handleRefreshConflict("SOME_NEW_CODE", "run-123", "audit-456", () => {});
  assert.equal(out, null);
});
