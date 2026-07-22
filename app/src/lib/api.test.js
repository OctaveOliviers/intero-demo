// Real-mode table-population API normalization contract.
import test from "node:test";
import assert from "node:assert/strict";

// Force the real (non-mock) API path regardless of ambient env.
globalThis.__INTERO_MOCK_ENV = { VITE_MOCK: "false" };

const {
  createTablePopulationFromAudit,
  createTablePopulationFromDescription,
  listMyTablePopulations,
  getTablePopulationWorkbook,
} = await import("./api.js");

function stubWorkbookFetch(payload) {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  });
}

test("createTablePopulationFromAudit exposes the canonical tablePopulationId only", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ tablePopulationId: "tp-1", messages: [] }),
  });
  try {
    const out = await createTablePopulationFromAudit("audit-1");
    assert.equal(out.tablePopulationId, "tp-1");
    assert.equal(Object.hasOwn(out, "runId"), false);
  } finally {
    delete globalThis.fetch;
  }
});

test("listMyTablePopulations uses the canonical auth history endpoint", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => [{ tablePopulationId: "tp-1" }],
    };
  };
  try {
    const rows = await listMyTablePopulations();
    assert.deepEqual(rows, [{ tablePopulationId: "tp-1" }]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/auth/table-populations");
    assert.equal(calls[0].options.credentials, "include");
  } finally {
    delete globalThis.fetch;
  }
});

test("keeps backend tablePopulationStatus distinct from durable resultStatus", async () => {
  stubWorkbookFetch({
    sheets: [],
    cellMetadata: {},
    resultStatus: "in_progress",
    tablePopulationStatus: "completed",
  });
  try {
    const snap = await getTablePopulationWorkbook("r1");
    assert.equal(snap.resultStatus, "in_progress");
    assert.equal(snap.tablePopulationStatus, "completed");
  } finally {
    delete globalThis.fetch;
  }
});

test("surfaces startedAt/endedAt from the backend payload", async () => {
  stubWorkbookFetch({
    sheets: [],
    cellMetadata: {},
    resultStatus: "complete",
    tablePopulationStatus: "completed",
    startedAt: "2026-06-27T10:00:00Z",
    endedAt: "2026-06-27T10:05:00Z",
  });
  try {
    const snap = await getTablePopulationWorkbook("r1");
    assert.equal(snap.startedAt, "2026-06-27T10:00:00Z");
    assert.equal(snap.endedAt, "2026-06-27T10:05:00Z");
  } finally {
    delete globalThis.fetch;
  }
});

test("real-mode free-text table population is not posted as a prompt-only run", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return {
      ok: false,
      status: 422,
      json: async () => ({ detail: "server should not receive prompt-only runs" }),
    };
  };
  try {
    await assert.rejects(
      () => createTablePopulationFromDescription("audit chest-pain attendances"),
      /template-backed/,
    );
    assert.equal(called, false);
  } finally {
    delete globalThis.fetch;
  }
});
