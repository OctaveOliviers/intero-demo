import test from "node:test";
import assert from "node:assert/strict";

// Drive the api.js sharing/grant functions through the in-memory mock layer by
// forcing mock mode (the same env seam isMockMode() reads). Set before importing
// api.js. These tests pin the FROZEN backend contract the mock must mirror
// EXACTLY (server/routes/clinicians.py + grants.py, resource grants). Sharing is
// always EDITOR — every grant is "manage" (the only level that confers editing):
//   - GET  /api/clinicians          → [{ id, display_name }]
//   - POST /api/grants              → { id, resource_type, resource_id, subject_id,
//                                       grant_type: "manage", granted_by, created_at,
//                                       expires_at }
//   - DELETE /api/grants/{id}       → 204
//   - GET  /api/grants/shared-by-me → [{ grant_id, resource_type, resource_id, label,
//                                       grant_type, expires_at,
//                                       grantee: { subject_id, display_name } }]
globalThis.__INTERO_MOCK_ENV = { VITE_MOCK: "true" };

const api = await import("./api.js");

test("listClinicians returns the share-target directory (id + display_name only)", async () => {
  const list = await api.listClinicians();
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 1, "at least one clinician is seeded");
  for (const c of list) {
    assert.equal(typeof c.id, "string");
    assert.equal(typeof c.display_name, "string");
    // Directory carries NAME + ID only — no PID, no role, no IAM fields.
    assert.deepEqual(Object.keys(c).sort(), ["display_name", "id"]);
  }
});

test("createGrant shares as editor — always a manage grant", async () => {
  const clinicians = await api.listClinicians();
  const subjectId = clinicians[0].id;
  const grant = await api.createGrant({
    resourceType: "dataset",
    resourceId: "ds-cohort-1",
    subjectId,
  });
  assert.equal(typeof grant.id, "string");
  assert.equal(grant.resource_type, "dataset");
  assert.equal(grant.resource_id, "ds-cohort-1");
  assert.equal(grant.subject_id, subjectId);
  // Sharing is always editor — the grant is fixed to "manage".
  assert.equal(grant.grant_type, "manage");
  assert.equal(typeof grant.granted_by, "string");
  assert.equal(typeof grant.created_at, "string");
  // expires_at is nullable in v1 (no expiry chosen in the dialog).
  assert.equal(grant.expires_at, null);
});

test("a created grant surfaces in shared-by-me with the grantee directory name", async () => {
  const clinicians = await api.listClinicians();
  const target = clinicians[0];
  const grant = await api.createGrant({
    resourceType: "table",
    resourceId: "table-share-by-1",
    subjectId: target.id,
  });
  const byMe = await api.listSharedByMe();
  assert.ok(Array.isArray(byMe));
  const row = byMe.find((g) => g.grant_id === grant.id);
  assert.ok(row, "the new grant appears in shared-by-me");
  assert.equal(row.resource_type, "table");
  assert.equal(row.resource_id, "table-share-by-1");
  assert.equal(row.grant_type, "manage");
  assert.equal(row.expires_at, null);
  assert.equal(typeof row.label, "string");
  assert.equal(row.grantee.subject_id, target.id);
  assert.equal(row.grantee.display_name, target.display_name);
});

test("deleteGrant removes the grant from shared-by-me (revoke)", async () => {
  const clinicians = await api.listClinicians();
  const grant = await api.createGrant({
    resourceType: "dataset",
    resourceId: "ds-revoke-1",
    subjectId: clinicians[0].id,
  });
  let byMe = await api.listSharedByMe();
  assert.ok(byMe.some((g) => g.grant_id === grant.id), "present before revoke");
  await api.deleteGrant(grant.id);
  byMe = await api.listSharedByMe();
  assert.ok(!byMe.some((g) => g.grant_id === grant.id), "gone after revoke");
});
