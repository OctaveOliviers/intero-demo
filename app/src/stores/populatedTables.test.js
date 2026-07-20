import test from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";

// Exercise the populatedTables store's server-history mapping. Force mock mode before
// importing anything that pulls api.js (populatedTables.js imports deleteTablePopulation).
globalThis.__INTERO_MOCK_ENV = { VITE_MOCK: "true" };

const { populatedTables, mergeServerTablePopulationHistory, resetPopulatedTableHistory } =
  await import("./populatedTables.js");

function findByTablePopulationId(id) {
  return get(populatedTables).find((a) => a.tablePopulationId === id) || null;
}

test("mapped row whose started_at parses to epoch 0 keeps createdAt=0 (not bumped to now)", () => {
  resetPopulatedTableHistory();
  const before = Date.now();

  // The Unix epoch — Date.parse() returns 0, a legitimate timestamp that the
  // buggy `Date.parse(...) || Date.now()` conflated with a missing value.
  mergeServerTablePopulationHistory([
    { tablePopulationId: "tp-epoch", started_at: "1970-01-01T00:00:00.000Z" },
  ]);

  const entry = findByTablePopulationId("tp-epoch");
  assert.ok(entry, "the epoch row was mapped into the store");
  assert.equal(entry.createdAt, 0, "a legitimate epoch-0 timestamp is preserved");
  assert.ok(entry.createdAt < before, "createdAt was not bumped to now");
});

test("mapped row with invalid/missing started_at falls back to a sensible value", () => {
  resetPopulatedTableHistory();
  const before = Date.now();

  mergeServerTablePopulationHistory([
    { tablePopulationId: "tp-bad", started_at: "not-a-date" },
    { tablePopulationId: "tp-missing" },
  ]);

  const after = Date.now();
  for (const id of ["tp-bad", "tp-missing"]) {
    const entry = findByTablePopulationId(id);
    assert.ok(entry, `the ${id} row was mapped into the store`);
    assert.ok(
      Number.isFinite(entry.createdAt) &&
        entry.createdAt >= before &&
        entry.createdAt <= after,
      `${id} falls back to now (got ${entry.createdAt})`,
    );
  }
});
