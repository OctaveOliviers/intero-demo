import test from "node:test";
import assert from "node:assert/strict";

import {
  pendingGrantByResourceId,
  pendingSharedDatasetGrants,
  parseProcessedGrantIds,
  serializeProcessedGrantIds,
} from "./sharedNotifications.js";

test("pendingSharedDatasetGrants returns unprocessed inbound dataset grants only", () => {
  const grants = [
    { grant_id: "grant-ds-1", resource_type: "dataset", resource_id: "ds-new" },
    { grant_id: "grant-tmpl-1", resource_type: "template", resource_id: "tmpl-new" },
    { grant_id: "grant-ds-2", resource_type: "dataset", resource_id: "ds-kept" },
  ];

  const pending = pendingSharedDatasetGrants(grants, new Set(["grant-ds-2"]));

  assert.deepEqual(pending.map((g) => g.grant_id), ["grant-ds-1"]);
});

test("pendingGrantByResourceId indexes pending grants by shared resource id", () => {
  const grants = [
    { grant_id: "grant-old", resource_type: "dataset", resource_id: "ds-cordph-nicu" },
    { grant_id: "grant-new", resource_type: "dataset", resource_id: "ds-cordph-nicu" },
  ];

  const pendingByResource = pendingGrantByResourceId(grants, new Set(["grant-old"]));

  assert.equal(pendingByResource["ds-cordph-nicu"].grant_id, "grant-new");
});

test("pendingGrantByResourceId can index pending template grants", () => {
  const grants = [
    { grant_id: "grant-ds-1", resource_type: "dataset", resource_id: "ds-new" },
    { grant_id: "grant-tmpl-1", resource_type: "template", resource_id: "tmpl-new" },
    { grant_id: "grant-tmpl-2", resource_type: "template", resource_id: "tmpl-kept" },
  ];

  const pendingByResource = pendingGrantByResourceId(
    grants,
    new Set(["grant-tmpl-2"]),
    "template",
  );

  assert.deepEqual(Object.keys(pendingByResource), ["tmpl-new"]);
  assert.equal(pendingByResource["tmpl-new"].grant_id, "grant-tmpl-1");
});

test("processed grant ids round-trip through localStorage-safe JSON", () => {
  const ids = parseProcessedGrantIds('["grant-b","grant-a"]');

  assert.deepEqual([...ids].sort(), ["grant-a", "grant-b"]);
  assert.equal(serializeProcessedGrantIds(ids), '["grant-a","grant-b"]');
  assert.deepEqual(parseProcessedGrantIds("not json"), new Set());
});
