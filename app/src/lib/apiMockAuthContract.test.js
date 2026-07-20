// The dev-mock auth layer (VITE_MOCK=true) must mirror the server auth contract
// so the SPA behaves the same with or without a backend (3-architecture.md: the
// mock layer mirrors the server contracts). The server's UserResponse now
// REQUIRES `role`, and stores/auth.js derives `userRole` from it; without `role`
// the mock leaves userRole null. The seed/demo account is the clinician-superset
// `admin`, so the mock user mirrors that.
import test from "node:test";
import assert from "node:assert/strict";

// isMockMode reads globalThis.__INTERO_MOCK_ENV first, so force mock mode
// before importing the api module.
globalThis.__INTERO_MOCK_ENV = { VITE_MOCK: "true" };

const { authMe, authLogin } = await import("./api.js");

test("mock authMe returns a role mirroring the server UserResponse", async () => {
  const user = await authMe();
  assert.equal(user.role, "admin");
});

test("mock authLogin returns a role mirroring the server UserResponse", async () => {
  const user = await authLogin("someone", "pw");
  assert.equal(user.role, "admin");
});
