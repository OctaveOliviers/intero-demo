import test from "node:test";
import assert from "node:assert/strict";
import { handleRefreshConflict } from "./refreshConflict.js";

test("TABLE_POPULATION_ACTIVE resumes by reconnecting stream", () => {
  const calls = [];
  const reconnect = (tablePopulationId, populatedTableId) => calls.push({ tablePopulationId, populatedTableId });
  const out = handleRefreshConflict("TABLE_POPULATION_ACTIVE", "tp-123", "audit-456", reconnect);
  assert.deepEqual(out, { status: "resumed", tablePopulationId: "tp-123" });
  assert.deepEqual(calls, [{ tablePopulationId: "tp-123", populatedTableId: "audit-456" }]);
});

test("TABLE_POPULATION_NOT_FOUND remains a user-facing error", () => {
  assert.throws(
    () => handleRefreshConflict("TABLE_POPULATION_NOT_FOUND", "tp-123", "audit-456", () => {}),
    /Table population not found/,
  );
});

test("TABLE_POPULATION_NOT_REFRESHABLE remains a user-facing error", () => {
  assert.throws(
    () => handleRefreshConflict("TABLE_POPULATION_NOT_REFRESHABLE", "tp-123", "audit-456", () => {}),
    /not refreshable/,
  );
});

test("unknown refresh conflict code is left to caller", () => {
  const out = handleRefreshConflict("SOME_NEW_CODE", "tp-123", "audit-456", () => {});
  assert.equal(out, null);
});
