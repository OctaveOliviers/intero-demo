import test from "node:test";
import assert from "node:assert/strict";

// Drive the api.js dataset functions through the in-memory mock layer by forcing
// mock mode (the same env seam isMockMode() reads). Set before importing api.js.
globalThis.__INTERO_MOCK_ENV = { VITE_MOCK: "true" };

const api = await import("./api.js");

test("listDatasets returns the seeded cord-pH Dataset with a count", async () => {
  const list = await api.listDatasets();
  assert.ok(Array.isArray(list));
  const seed = list.find((d) => d.id === "ds-cordph-nicu");
  assert.ok(seed, "seeded dataset present");
  assert.equal(seed.name, "Term babies admitted to NICU");
  assert.deepEqual(seed.databases, ["cord-ph"]);
  assert.equal(seed.count, 1);
});

test("getDatasetDetail exposes criteria, cohort_sql, and a not_available row", async () => {
  const ds = await api.getDatasetDetail("ds-cordph-nicu");
  assert.equal(ds.criteria.length, 2);
  // The cohort_sql enumerates the slice's identities (contract shape).
  assert.match(ds.cohort_sql, /SELECT DISTINCT cord_ph_birth_records\.patient_code/);
  assert.match(ds.cohort_sql, /gestation_weeks >=/);
  assert.equal(ds.not_available.length, 1);
  assert.equal(ds.count, 1);
});

test("patchDatasetCriterion re-derives the count deterministically (no LLM)", async () => {
  const before = await api.getDatasetDetail("ds-cordph-nicu");
  const after = await api.patchDatasetCriterion("ds-cordph-nicu", "gestation_weeks", 37);
  assert.notEqual(after.count, before.count, "count changes when the threshold relaxes");
  assert.equal(after.count, 4);
  // The bind value and recomposed SQL params reflect the edit.
  const edited = after.criteria.find((c) => c.criterion_id === "gestation_weeks");
  assert.equal(edited.predicate.value, 37);
  // Restore so other tests see the seed value (in-memory state persists).
  await api.patchDatasetCriterion("ds-cordph-nicu", "gestation_weeks", 39);
});

test("addDatasetFilter grounds a numeric phrase into a new chip + clause", async () => {
  const ds = await api.createDataset({
    name: "scratch",
    databases: ["cord-ph"],
    anchor: "patient",
    text: "all patients",
  });
  const withFilter = await api.addDatasetFilter(ds.id, "birthweight 2500 or more");
  assert.equal(withFilter.criteria.length, 1);
  assert.equal(withFilter.criteria[0].type, "number");
  assert.equal(withFilter.criteria[0].predicate.value, 2500);
  assert.match(withFilter.cohort_sql, /WHERE/);
});

test("addDatasetFilter surfaces an ungroundable phrase as not_available", async () => {
  const ds = await api.createDataset({
    name: "scratch2",
    databases: ["cord-ph"],
    anchor: "patient",
    text: "all patients",
  });
  const res = await api.addDatasetFilter(ds.id, "looked unwell to the midwife");
  assert.equal(res.criteria.length, 0);
  assert.equal(res.not_available.length, 1);
  assert.equal(res.not_available[0].phrase, "looked unwell to the midwife");
});

test("createDataset accepts text only and lists the newest Dataset first", async () => {
  const ds = await api.createDataset({ text: "term babies admitted to NICU" });
  assert.equal(ds.name, "Term babies admitted to NICU");
  assert.deepEqual(ds.databases, ["cord-ph"]);

  const list = await api.listDatasets();
  assert.equal(list[0].id, ds.id);
});

test("deleteDataset removes it from the list", async () => {
  const ds = await api.createDataset({ name: "to delete", databases: ["cord-ph"], anchor: "p", text: "x" });
  await api.deleteDataset(ds.id);
  const list = await api.listDatasets();
  assert.equal(list.find((d) => d.id === ds.id), undefined);
});
