import test from "node:test";
import assert from "node:assert/strict";

import { attachmentTypeIcon, attachmentTypeLabel } from "./attachmentTypes.js";

test("attachment type registry defines canonical icons and labels", () => {
  assert.equal(attachmentTypeIcon("dataset"), "datasets");
  assert.equal(attachmentTypeIcon("template"), "table");
  assert.equal(attachmentTypeLabel("dataset"), "Dataset");
  assert.equal(attachmentTypeLabel("template"), "Template");
});

test("attachment type registry falls back safely for unknown types", () => {
  assert.equal(attachmentTypeIcon("nope"), "table");
  assert.equal(attachmentTypeLabel("nope"), "Attachment");
});
