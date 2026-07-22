// The mock run timelines must speak the SAME strict-v2 wire contract as the
// real backend (specs/product/contracts/runtime-events.schema.json). Every step's
// event is validated against the schema, and each flow's event order must
// match doc 5 §Streaming:
//   activity* -> workbook_created -> (activity | cell_update)* -> review_summary -> done
// This is the shared net that keeps mock and real vocabularies from drifting
// apart again (the pre-T1 bug: typeless workbook/cells events were silently
// dropped by applyRunEvent's strict-v2 gate).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { Ajv2020 } from "ajv/dist/2020.js";

import { buildTimeline } from "./mockData.js";

const schema = JSON.parse(
  readFileSync(
    new URL("../../../specs/product/contracts/runtime-events.schema.json", import.meta.url),
    "utf8",
  ),
);

// `format: "date"` appears in other contracts, not here; no formats needed.
const ajv = new Ajv2020({ strict: false });
const validate = ajv.compile(schema);

// "TBL" is the Issue-2 thread-spawned table run (a compact cord-pH timeline);
// "DW" is the focused diabetes worklist spawned from chat. Both must satisfy
// the SAME schema + ordering contract as the other flows.
const FLOWS = ["A", "B", "C", "DW", "TBL"];

for (const flow of FLOWS) {
  test(`flow ${flow}: every mock timeline event validates against runtime-events.schema.json`, () => {
    const steps = buildTimeline(flow);
    assert.ok(steps.length > 0, "timeline is non-empty");
    for (const [i, step] of steps.entries()) {
      const ok = validate(step.event);
      assert.ok(
        ok,
        `step ${i} (kind=${step.kind}) invalid: ${JSON.stringify(validate.errors)}\n` +
          JSON.stringify(step.event).slice(0, 300),
      );
    }
  });

  test(`flow ${flow}: event order matches the strict-v2 ordering contract`, () => {
    const types = buildTimeline(flow).map((s) => s.event.type);
    // activity* -> workbook_created -> (activity|cell_update)* -> review_summary -> done
    assert.match(
      types.join(" "),
      /^(activity )*workbook_created( (activity|cell_update))* review_summary done$/,
      `unexpected order: ${types.join(" -> ")}`,
    );
  });
}
