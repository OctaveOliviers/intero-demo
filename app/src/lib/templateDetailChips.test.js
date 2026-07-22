import test from "node:test";
import assert from "node:assert/strict";
import {
  codeText,
  buildFieldChips,
  buildDatabaseChips,
  predicateDisplay,
  predicateInputText,
  applyPredicateInput,
} from "./templateDetailChips.js";

// Shapes copied from the real seed artifacts (data/seed/audits/cord-ph/spec.json,
// data/seed/audits/cord-ph/mapping.json, data/seed/databases/cord-ph/model.json),
// trimmed to the fields the detail page actually reads.

const SPEC = {
  audit: "cord-ph",
  title: "Cord pH Audit",
  deadline: "2026-07-07",
  fields: [
    {
      number: 1,
      name: "Patient code",
      type: "text",
      section: "ALL",
      cell: "A",
      notes: "Unique identifier for the patient record.",
      id: "all/patient_code",
    },
    { number: 2, name: "Gestation (weeks)", type: "number", section: "ALL", cell: "B", unit: "weeks", id: "all/gestation_weeks" },
    { number: 17, name: "Delivery", type: "text", section: "ALL", cell: "T", id: "all/delivery" },
    { number: 41, name: "Cooled", type: "boolean", section: "NICU", cell: "B", id: "nicu/cooled" },
  ],
};

const MAPPING = {
  audit: "cord-ph",
  databases: ["cord-ph"],
  fields: [
    { region: "ALL", cell: "A", header: "Patient code", kind: "direct", sources: ["cord-ph -> cord_ph_birth_records.patient_code"] },
    { region: "ALL", cell: "B", header: "Gestation (weeks)", kind: "interpret", sources: ["cord-ph -> cord_ph_birth_records.gestation_weeks"] },
    {
      region: "ALL",
      cell: "T",
      header: "Delivery",
      kind: "direct",
      sources: ["cord-ph -> cord_ph_birth_records.delivery"],
      code: { 1: "Spontaneous vaginal", 2: "Emergency caesarean", 3: "Forceps", 4: "Vacuum" },
    },
    { region: "NICU", cell: "B", header: "Cooled", kind: "direct", sources: ["cord-ph -> nicu_admissions.cooled"] },
  ],
  fixed_criteria: [
    {
      criterion_id: "gestation_weeks",
      label: "Gestation (completed weeks)",
      type: "number",
      predicate: { op: "gte", value: 37, unit: "weeks" },
      display: "Gestation ≥ 37 weeks",
    },
    {
      criterion_id: "encounter_start",
      label: "Delivery / encounter date",
      type: "date",
      predicate: { op: "between", value: ["2025-04-01", "2026-03-31"] },
      display: "Delivery date 1 Apr 2025 – 31 Mar 2026",
    },
  ],
};

const DATABASE_ROWS = [
  {
    id: "cord-ph",
    name: "Cord pH EMR",
    description: "Maternity & neonatal birth records with cord-blood gas results",
  },
];

// --- codeText ----------------------------------------------------------------

test("codeText derives the code explanation mechanically", () => {
  assert.equal(codeText({ 1: "Male", 2: "Female" }), "1 = Male, 2 = Female");
});

test("codeText caps at four entries then ellipsis", () => {
  const code = { 1: "A", 2: "B", 3: "C", 4: "D", 5: "E" };
  assert.equal(codeText(code), "1 = A, 2 = B, 3 = C, 4 = D, …");
});

test("codeText is empty for missing or empty code maps", () => {
  assert.equal(codeText(undefined), "");
  assert.equal(codeText({}), "");
});

// --- buildFieldChips ----------------------------------------------------------

test("field chips join by section/region + cell", () => {
  const chips = buildFieldChips(SPEC, MAPPING);
  assert.equal(chips.length, 4);
  assert.deepEqual(
    chips.map((c) => [c.name, c.mapped, c.kind]),
    [
      ["Patient code", true, "direct"],
      ["Gestation (weeks)", true, "interpret"],
      ["Delivery", true, "direct"],
      ["Cooled", true, "direct"],
    ],
  );
});

test("coded direct field gets the mechanical code text, not notes", () => {
  const chips = buildFieldChips(SPEC, MAPPING);
  const delivery = chips.find((c) => c.name === "Delivery");
  assert.equal(delivery.description, "1 = Spontaneous vaginal, 2 = Emergency caesarean, 3 = Forceps, 4 = Vacuum");
});

test("interpret field gets the spec notes; uncoded direct gets notes as one-liner", () => {
  const spec = {
    fields: [
      { name: "Gestation (weeks)", section: "ALL", cell: "B", notes: "Completed weeks of gestation at birth." },
      { name: "Patient code", section: "ALL", cell: "A", notes: "Unique identifier for the patient record." },
    ],
  };
  const chips = buildFieldChips(spec, MAPPING);
  assert.equal(chips[0].kind, "interpret");
  assert.equal(chips[0].description, "Completed weeks of gestation at birth.");
  assert.equal(chips[1].kind, "direct");
  assert.equal(chips[1].description, "Unique identifier for the patient record.");
});

test("same cell letter in different sections does not collide", () => {
  const chips = buildFieldChips(SPEC, MAPPING);
  const cooled = chips.find((c) => c.name === "Cooled");
  // NICU:B must not pick up ALL:B (the interpret gestation field).
  assert.equal(cooled.kind, "direct");
});

test("falls back to a header match when the cell join misses", () => {
  const mapping = {
    ...MAPPING,
    fields: [{ header: "delivery", kind: "direct", code: { 1: "Spontaneous vaginal" } }],
  };
  const chips = buildFieldChips(SPEC, mapping);
  const delivery = chips.find((c) => c.name === "Delivery");
  assert.equal(delivery.mapped, true);
  assert.equal(delivery.description, "1 = Spontaneous vaginal");
});

test("no mapping at all yields name-only chips with notes where present", () => {
  const chips = buildFieldChips(SPEC, null);
  assert.ok(chips.every((c) => c.mapped === false && c.kind === null));
  assert.equal(chips[0].description, "Unique identifier for the patient record.");
  assert.equal(chips[1].description, "");
});

// --- buildDatabaseChips --------------------------------------------------------

test("database chips resolve names and prefer database_summaries", () => {
  const mapping = {
    ...MAPPING,
    database_summaries: { "cord-ph": "Birth records and the NICU course for the cohort join." },
  };
  const chips = buildDatabaseChips(mapping, DATABASE_ROWS);
  assert.deepEqual(chips, [
    { id: "cord-ph", name: "Cord pH EMR", summary: "Birth records and the NICU course for the cohort join." },
  ]);
});

test("missing database_summaries falls back to the generic summary/description", () => {
  const chips = buildDatabaseChips(MAPPING, DATABASE_ROWS);
  assert.equal(chips[0].summary, "Maternity & neonatal birth records with cord-blood gas results");
  // model.json-style rows carry `summary`; prefer it over `description`.
  const withSummary = buildDatabaseChips(MAPPING, [
    { id: "cord-ph", name: "Cord pH EMR", summary: "Generic model summary", description: "Long prose" },
  ]);
  assert.equal(withSummary[0].summary, "Generic model summary");
});

test("unknown database id falls back to the id with an empty sentence", () => {
  const chips = buildDatabaseChips(MAPPING, []);
  assert.deepEqual(chips, [{ id: "cord-ph", name: "cord-ph", summary: "" }]);
});

test("no mapping yields no database chips", () => {
  assert.deepEqual(buildDatabaseChips(null, DATABASE_ROWS), []);
});

// --- criteria predicate helpers --------------------------------------------------

test("predicateDisplay renders gte with unit and between with formatted dates", () => {
  assert.equal(predicateDisplay(MAPPING.fixed_criteria[0]), "Gestation (completed weeks) ≥ 37 weeks");
  assert.equal(
    predicateDisplay(MAPPING.fixed_criteria[1]),
    "Delivery / encounter date 1 Apr 2025 – 31 Mar 2026",
  );
});

test("predicateInputText exposes the raw value(s)", () => {
  assert.equal(predicateInputText(MAPPING.fixed_criteria[0]), "37");
  assert.equal(predicateInputText(MAPPING.fixed_criteria[1]), "2025-04-01, 2026-03-31");
});

test("applyPredicateInput updates a scalar number and regenerates display", () => {
  const next = applyPredicateInput(MAPPING.fixed_criteria[0], "36");
  assert.equal(next.predicate.value, 36);
  assert.equal(next.display, "Gestation (completed weeks) ≥ 36 weeks");
  // Original untouched.
  assert.equal(MAPPING.fixed_criteria[0].predicate.value, 37);
});

test("applyPredicateInput updates between bounds from comma-separated input", () => {
  const next = applyPredicateInput(MAPPING.fixed_criteria[1], "2026-04-01, 2027-03-31");
  assert.deepEqual(next.predicate.value, ["2026-04-01", "2027-03-31"]);
  assert.equal(next.display, "Delivery / encounter date 1 Apr 2026 – 31 Mar 2027");
});

test("applyPredicateInput rejects unusable input", () => {
  assert.equal(applyPredicateInput(MAPPING.fixed_criteria[0], ""), null);
  assert.equal(applyPredicateInput(MAPPING.fixed_criteria[0], "not a number"), null);
  // between needs exactly two bounds
  assert.equal(applyPredicateInput(MAPPING.fixed_criteria[1], "2026-04-01"), null);
});
