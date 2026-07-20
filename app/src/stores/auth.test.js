import test from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";

import { userRole, setAuthenticated, clearAuth } from "./auth.js";

test("userRole reflects the role from the auth response", () => {
  setAuthenticated({ id: "u1", username: "clinician", role: "admin" });
  assert.equal(get(userRole), "admin");

  setAuthenticated({ id: "u2", username: "dana", role: "clinician" });
  assert.equal(get(userRole), "clinician");
});

test("userRole is null when unauthenticated", () => {
  clearAuth();
  assert.equal(get(userRole), null);
});
