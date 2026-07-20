import test from "node:test";
import assert from "node:assert/strict";

// Drive the api.js tables functions through the in-memory mock layer by forcing
// mock mode (the same env seam isMockMode() reads). Set before importing api.js.
// These tests pin the FROZEN backend contract the mock must mirror EXACTLY
// (specs/product/contracts/table.schema.json): the table list summary shape, the
// full table shape, create, and delete.

globalThis.__INTERO_MOCK_ENV = { VITE_MOCK: "true" };

const api = await import("./api.js");

test("listTables returns recency-ordered summaries (newest first)", async () => {
  await api.createTable({ title: "List contract table", source_template: "cord-ph" });

  const list = await api.listTables();
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 1, "at least the just-minted table is present");
  for (const s of list) {
    assert.equal(typeof s.id, "string");
    assert.equal(typeof s.title, "string");
    assert.equal(typeof s.source_template, "string");
    assert.equal(typeof s.status, "string");
    assert.equal(typeof s.updated_at, "string");
  }
  for (let i = 1; i < list.length; i++) {
    assert.ok(list[i - 1].updated_at >= list[i].updated_at, "newest first");
  }
});

test("getTable returns the full frozen table shape with a table_population_id", async () => {
  const created = await api.createTable({
    title: "Get contract table",
    source_template: "cord-ph",
  });
  const table = await api.getTable(created.id);
  assert.equal(table.schema_version, "1");
  assert.match(table.id, /^table-/);
  assert.equal(typeof table.title, "string");
  assert.equal(typeof table.source_template, "string");
  assert.ok(table.source_template.length >= 1);
  assert.equal(typeof table.table_population_id, "string");
  assert.ok(table.table_population_id.length >= 1, "a spawned table wraps a real run");
  assert.ok(table.spec && Array.isArray(table.spec.columns));
  assert.equal(typeof table.spec.grain, "string");
  assert.equal(typeof table.status, "string");
  assert.equal(typeof table.created_at, "string");
  assert.equal(typeof table.updated_at, "string");
  assert.equal(table.thread_id, null);
});

test("getTable throws a 404-style detail for a missing table", async () => {
  await assert.rejects(() => api.getTable("table-does-not-exist"), /not found/i);
});

test("createTable mints a full table directly (no thread)", async () => {
  const table = await api.createTable({
    title: "Direct table",
    source_template: "cord-ph",
    dataset_id: null,
    spec: { columns: [{ id: "c1", name: "Patient" }], grain: "one row per patient" },
    thread_id: null,
  });
  assert.equal(table.schema_version, "1");
  assert.match(table.id, /^table-/);
  assert.equal(table.title, "Direct table");
  assert.equal(table.source_template, "cord-ph");
  assert.equal(table.thread_id, null);
  assert.ok(table.table_population_id, "a created table wraps a table population");
});

test("renameTable updates and persists the title", async () => {
  const created = await api.createTable({
    title: "Before rename",
    source_template: "cord-ph",
    spec: { columns: [], grain: "one row per patient" },
  });
  const renamed = await api.renameTable(created.id, "Contract renamed table");
  assert.equal(renamed.title, "Contract renamed table");
  // Persisted: a fresh read returns the new title (mock mirrors the PATCH route).
  const reloaded = await api.getTable(created.id);
  assert.equal(reloaded.title, "Contract renamed table");
});

test("deleteTable removes the table from the list", async () => {
  const created = await api.createTable({
    title: "Throwaway",
    source_template: "cord-ph",
    spec: { columns: [], grain: "one row per patient" },
  });
  await api.deleteTable(created.id);
  await assert.rejects(() => api.getTable(created.id), /not found/i);
});

test("listTables reports a per-user `opened` flag (false until opened)", async () => {
  globalThis.__INTERO_MOCK_ENV = { VITE_MOCK: "true" };
  const created = await api.createTable({ title: "Seen flag", source_template: "cord-ph" });
  const before = (await api.listTables()).find((t) => t.id === created.id);
  assert.equal(before.opened, false, "a freshly-created table is unopened");

  await api.markTableOpened(created.id);
  const after = (await api.listTables()).find((t) => t.id === created.id);
  assert.equal(after.opened, true, "after markTableOpened the table reads opened");
});

test("markTableOpened is idempotent and only affects the named table", async () => {
  globalThis.__INTERO_MOCK_ENV = { VITE_MOCK: "true" };
  const a = await api.createTable({ title: "A", source_template: "cord-ph" });
  const b = await api.createTable({ title: "B", source_template: "cord-ph" });
  await api.markTableOpened(a.id);
  await api.markTableOpened(a.id);
  const list = await api.listTables();
  assert.equal(list.find((t) => t.id === a.id).opened, true);
  assert.equal(list.find((t) => t.id === b.id).opened, false, "b is untouched");
});

test("a created template-backed table wires its population into the table timeline", async () => {
  globalThis.__INTERO_MOCK_ENV = { VITE_MOCK: "true" };
  const table = await api.createTable({
    title: "Timeline table",
    source_template: "cord-ph",
  });
  const workbook = await api.getTablePopulationWorkbook(table.table_population_id);
  assert.ok(workbook && Array.isArray(workbook.sheets), "the wrapped run yields a workbook");
});
