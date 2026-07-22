import test from "node:test";
import assert from "node:assert/strict";
import {
  criterionChipValue,
  criterionInputText,
  criterionOptionHint,
  criterionOptionValues,
  datasetPredicateDisplay,
  isScalarDateCriterion,
  inlineSql,
  parseCriterionSource,
  parseCriterionInput,
} from "./datasetDetailChips.js";

test("inlineSql substitutes bind params for their real values", () => {
  const criteria = [
    { params: { c0: 39 } },
    { params: { c1: "yes" } },
  ];
  const sql =
    "SELECT 1 FROM t WHERE (CAST(b.gestation_weeks AS REAL) >= :c0) AND (b.admitted = :c1)";
  assert.equal(
    inlineSql(sql, criteria),
    "SELECT 1 FROM t WHERE (CAST(b.gestation_weeks AS REAL) >= 39) AND (b.admitted = 'yes')",
  );
  assert.equal(inlineSql("", criteria), "");
});

// Predicate ops are the dataset.schema.json contract symbols (">=", "="), not the
// template criteria's gte/lte vocabulary.
const GESTATION = {
  criterion_id: "gestation_weeks",
  label: "Gestation (weeks)",
  type: "number",
  predicate: { op: ">=", value: 39 },
  display: "Gestation (weeks) ≥ 39",
};

const NICU = {
  criterion_id: "admitted_nicu",
  label: "Admitted to NICU",
  type: "category",
  predicate: { op: "=", value: "yes" },
  display: "Admitted to NICU = yes",
};

test("criterionChipValue strips the label off the backend display, keeping the value", () => {
  assert.equal(criterionChipValue(GESTATION), "≥ 39");
  assert.equal(criterionChipValue(NICU), "= yes");
});

test("criterionChipValue formats the contract op when no display is supplied", () => {
  // No `display` field (e.g. a freshly built criterion) → format from the op.
  assert.equal(criterionChipValue({ ...GESTATION, display: undefined }), "≥ 39");
  assert.equal(
    criterionChipValue({
      label: "Mode of delivery",
      type: "category",
      predicate: { op: "in", value: ["Forceps", "Vacuum"] },
    }),
    "Forceps, Vacuum",
  );
});

test("datasetPredicateDisplay renders contract op symbols", () => {
  assert.equal(datasetPredicateDisplay(GESTATION), "Gestation (weeks) ≥ 39");
  assert.equal(
    datasetPredicateDisplay({ label: "Age", type: "number", predicate: { op: "between", value: [1, 5] } }),
    "Age 1 – 5",
  );
});

test("criterionInputText shows the raw bind value for editing", () => {
  assert.equal(criterionInputText(GESTATION), "39");
  assert.equal(criterionInputText(NICU), "yes");
  assert.equal(
    criterionInputText({ predicate: { op: "between", value: [37, 41] } }),
    "37, 41",
  );
});

test("parseCriterionInput casts number filters and rejects junk", () => {
  assert.equal(parseCriterionInput(GESTATION, "37"), 37);
  assert.equal(parseCriterionInput(GESTATION, "  40 "), 40);
  assert.equal(parseCriterionInput(GESTATION, "abc"), null);
  assert.equal(parseCriterionInput(GESTATION, ""), null);
});

test("parseCriterionInput keeps category values as strings", () => {
  assert.equal(parseCriterionInput(NICU, "no"), "no");
});

test("parseCriterionInput preserves array arity for between", () => {
  const between = { type: "number", predicate: { op: "between", value: [37, 41] } };
  assert.deepEqual(parseCriterionInput(between, "38, 40"), [38, 40]);
  assert.equal(parseCriterionInput(between, "38"), null); // wrong arity
});

test("parseCriterionSource splits <db> -> <table>.<column>", () => {
  assert.deepEqual(
    parseCriterionSource("cord-ph -> cord_ph_birth_records.maternal_comorbidities"),
    {
      database: "cord-ph",
      table: "cord_ph_birth_records",
      column: "maternal_comorbidities",
    },
  );
  assert.equal(parseCriterionSource("nope"), null);
});

test("criterionOptionValues resolves explicit model values/codes", () => {
  const criterion = {
    source: "cord-ph -> cord_ph_birth_records.maternal_comorbidities",
  };
  const models = {
    "cord-ph": {
      tables: [
        {
          name: "cord_ph_birth_records",
          columns: [
            {
              name: "maternal_comorbidities",
              values: ["none", "gestational diabetes"],
              codes: { "1": "none", "2": "gestational diabetes" },
            },
          ],
        },
      ],
    },
  };
  assert.deepEqual(
    criterionOptionValues(criterion, models),
    ["none", "gestational diabetes", "1", "2"],
  );
  assert.equal(
    criterionOptionHint(criterion, models, 2),
    "none, gestational diabetes +2 more",
  );
});

test("isScalarDateCriterion detects calendar-editable date predicates", () => {
  assert.equal(
    isScalarDateCriterion({ type: "date", predicate: { op: ">=", value: "2026-01-01" } }),
    true,
  );
  assert.equal(
    isScalarDateCriterion({ type: "date", predicate: { op: "between", value: ["2026-01-01", "2026-12-31"] } }),
    false,
  );
  assert.equal(isScalarDateCriterion({ type: "number", predicate: { op: ">=", value: 39 } }), false);
});
