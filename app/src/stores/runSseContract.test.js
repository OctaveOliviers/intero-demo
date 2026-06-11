import test from "node:test";
import assert from "node:assert/strict";

import { parseRunSseDataFrame, parseRunSsePayload, runEventDiscriminator } from "./runSseContract.js";

test("parses data-only run SSE frame and uses data.type discriminator", () => {
  const event = parseRunSseDataFrame('data: {"type":"review_summary","totals":{"cells":1}}\n\n');
  assert.equal(event.type, "review_summary");
  assert.equal(runEventDiscriminator(event), "review_summary");
});

test("ignores non-data SSE lines (named-event framing is not required)", () => {
  assert.equal(parseRunSseDataFrame("event: activity\n"), null);
  assert.equal(parseRunSseDataFrame("id: 3\n"), null);
});

test("parses EventSource message payload JSON safely", () => {
  assert.equal(parseRunSsePayload('{"type":"activity","headline":"Preparing workbook."}')?.type, "activity");
  assert.equal(parseRunSsePayload("not-json"), null);
  assert.equal(parseRunSsePayload(""), null);
});
