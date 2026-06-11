import test from "node:test";
import assert from "node:assert/strict";
import { parseRefreshRunResponse, parseWorkbookDownloadResponse } from "./apiRunResponses.js";

test("refresh unauthorized uses shared unauthorized handler", async () => {
  let called = 0;
  const unauthorized = async () => {
    called += 1;
    throw new Error("AUTH_RESET");
  };
  const res = {
    ok: false,
    status: 401,
    statusText: "Unauthorized",
    json: async () => ({ detail: "unauthorized" }),
  };
  await assert.rejects(parseRefreshRunResponse(res, unauthorized), /AUTH_RESET/);
  assert.equal(called, 1);
});

test("download unauthorized uses shared unauthorized handler", async () => {
  let called = 0;
  const unauthorized = async () => {
    called += 1;
    throw new Error("AUTH_RESET");
  };
  const res = {
    ok: false,
    status: 401,
    statusText: "Unauthorized",
    json: async () => ({ detail: "unauthorized" }),
  };
  await assert.rejects(parseWorkbookDownloadResponse(res, unauthorized), /AUTH_RESET/);
  assert.equal(called, 1);
});

test("refresh success returns parsed payload", async () => {
  const payload = { runId: "r1", executionId: "e1", status: "started" };
  const res = {
    ok: true,
    json: async () => payload,
  };
  const out = await parseRefreshRunResponse(res, async () => {});
  assert.deepEqual(out, payload);
});

test("download success returns blob", async () => {
  const blob = { fake: "blob" };
  const res = {
    ok: true,
    blob: async () => blob,
  };
  const out = await parseWorkbookDownloadResponse(res, async () => {});
  assert.equal(out, blob);
});

test("refresh non-401 error keeps status and conflict code shape", async () => {
  const unauthorized = async () => {};
  const res = {
    ok: false,
    status: 409,
    statusText: "Conflict",
    json: async () => ({
      detail: { code: "RUN_EXECUTION_ACTIVE", message: "Run execution is already active." },
    }),
  };
  await assert.rejects(
    parseRefreshRunResponse(res, unauthorized),
    (err) =>
      err instanceof Error &&
      err.message.includes("already active") &&
      err.status === 409 &&
      err.code === "RUN_EXECUTION_ACTIVE",
  );
});
