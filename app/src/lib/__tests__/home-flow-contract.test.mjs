import test from "node:test";
import assert from "node:assert/strict";

import {
  isTemplateIdAllowed,
  normalizeDatabaseValidationError,
  pickDatabaseForRun,
} from "../runFromSpec.js";
import { AuthError } from "../api.js";
import { defaultDatabaseChipsForMode } from "../spec.js";

test("real-mode template guard accepts backend audit ids only", () => {
  const templates = [{ id: "audit-abc" }, { id: "audit-def" }];
  assert.equal(isTemplateIdAllowed("audit-abc", templates), true);
  assert.equal(isTemplateIdAllowed("cord-ph-lo-audit", templates), false);
  assert.equal(isTemplateIdAllowed("", templates), false);
});

test("real-mode DB selection omits database when id is missing/invalid", () => {
  const noDbChip = [{ kind: "value", field: "ward", value: "NICU" }];
  assert.equal(
    pickDatabaseForRun(noDbChip, {
      mockDatabases: false,
      validDatabaseIds: new Set(["db-1"]),
    }),
    null,
  );

  const invalidDbChip = [{ kind: "database", field: "database", raw: "patient-notes-db" }];
  assert.equal(
    pickDatabaseForRun(invalidDbChip, {
      mockDatabases: false,
      validDatabaseIds: new Set(["db-1"]),
    }),
    null,
  );
});

test("real-mode DB selection keeps validated backend id", () => {
  const cohort = [{ kind: "database", field: "database", raw: "db-1" }];
  assert.equal(
    pickDatabaseForRun(cohort, {
      mockDatabases: false,
      validDatabaseIds: new Set(["db-1", "db-2"]),
    }),
    "db-1",
  );
});

test("mock-mode keeps static/mock DB chip behavior", () => {
  const chips = defaultDatabaseChipsForMode({ mockDatabases: true });
  const raws = chips.map((c) => c.raw);
  assert.deepEqual(raws, ["patient-notes-db", "lab-results-db"]);

  const selected = pickDatabaseForRun(chips, { mockDatabases: true });
  assert.equal(selected, "patient-notes-db");
});

test("real-mode default DB chips are empty", () => {
  assert.deepEqual(defaultDatabaseChipsForMode({ mockDatabases: false }), []);
});

test("real-mode auth errors from DB validation are preserved (not swallowed)", () => {
  const authErr = new AuthError("Authentication required");
  assert.throws(
    () => normalizeDatabaseValidationError(authErr),
    (err) => err === authErr,
  );
});

test("non-auth DB validation failures fall back to omitted database", () => {
  const out = normalizeDatabaseValidationError(new Error("network"));
  assert.equal(out, null);
});
