import {
  isMockMode,
  mockCreateRunFromTemplate,
  mockCreateRunFromDescription,
  mockGetWorkbook,
  mockExecuteSql,
  mockListAudits,
  mockGetAuditDetail,
  mockSaveAuditCriteria,
  mockUploadAudit,
  mockRenameAudit,
  mockDeleteAudit,
  mockReindexAudit,
  mockListDatabases,
  mockGetDatabaseDetail,
  mockUploadDatabase,
  mockRenameDatabase,
  mockDeleteDatabase,
  mockReindexDatabase,
} from "./mock.js";
import { parseRefreshRunResponse, parseWorkbookDownloadResponse } from "./apiRunResponses.js";

const API_BASE = "";
let unauthorizedResetInFlight = null;

export class AuthError extends Error {
  constructor(message = "Authentication required", { status = 401, detail = null } = {}) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.detail = detail;
  }
}

async function parseErrorDetail(res) {
  const body = await res.json().catch(() => ({}));
  const detail = typeof body?.detail === "string" ? body.detail : res.statusText;
  return detail || "Request failed";
}

async function runUnauthorizedResetOnce() {
  if (!unauthorizedResetInFlight) {
    unauthorizedResetInFlight = (async () => {
      const [{ clearAuth }, { resetChatRuntime }, { resetAuditHistory }, { goHome }] =
        await Promise.all([
          import("../stores/auth.js"),
          import("../stores/chat.js"),
          import("../stores/audits.js"),
          import("../stores/navigation.js"),
        ]);
      resetChatRuntime();
      resetAuditHistory();
      goHome();
      clearAuth();
    })().finally(() => {
      unauthorizedResetInFlight = null;
    });
  }
  return unauthorizedResetInFlight;
}

async function throwIfUnauthorized(res) {
  if (res.status !== 401) return;
  // Start/reset coordination first so close-together 401s all join the same
  // in-flight reset window, even if one response body parses slower.
  const resetPromise = runUnauthorizedResetOnce();
  const detailPromise = parseErrorDetail(res);
  await resetPromise;
  const detail = await detailPromise;
  throw new AuthError(detail, { status: 401, detail });
}

async function parseAuthResponse(res, fallbackMessage) {
  if (res.ok) return res.json();
  await throwIfUnauthorized(res);
  const detail = await parseErrorDetail(res);
  throw new Error(detail || fallbackMessage);
}

// --- auth ------------------------------------------------------------------

// Dev-mock auth (VITE_MOCK=true): the whole auth domain short-circuits so the
// app runs with no backend. `authMe` reports an authenticated mock user (so a
// reload stays signed in), `authLogin` accepts any credentials, and the
// per-user history endpoints return empty (mock history lives in the run/audit
// fixtures, not behind auth). Without this, every auth call 401s against the
// absent server even after the login screen's bypass.
const MOCK_USER = { id: "mock-user", username: "mock" };

export async function authMe() {
  if (isMockMode("auth")) return { ...MOCK_USER };
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    credentials: "include",
  });
  return parseAuthResponse(res, "Failed to fetch current user");
}

export async function authLogin(username, password) {
  if (isMockMode("auth")) return { ...MOCK_USER, username: username || MOCK_USER.username };
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });
  return parseAuthResponse(res, "Login failed");
}

export async function authLogout() {
  if (isMockMode("auth")) return { ok: true };
  const res = await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    await throwIfUnauthorized(res);
    const detail = await parseErrorDetail(res);
    throw new Error(detail || "Logout failed");
  }
  return res.json().catch(() => ({ ok: true }));
}

export async function listMyRuns() {
  if (isMockMode("auth")) return [];
  const res = await fetch(`${API_BASE}/api/auth/runs`, {
    credentials: "include",
  });
  return parseAuthResponse(res, "Failed to fetch run history");
}

export async function listMyQueries() {
  if (isMockMode("auth")) return [];
  const res = await fetch(`${API_BASE}/api/auth/queries`, {
    credentials: "include",
  });
  return parseAuthResponse(res, "Failed to fetch query history");
}

export async function listAudits() {
  // Library domain: default path is var-backed API unless audits mock is explicitly enabled.
  if (isMockMode("audits")) return mockListAudits();
  const res = await fetch(`${API_BASE}/api/audits`);
  await throwIfUnauthorized(res);
  if (!res.ok) throw new Error("Failed to load audits");
  return res.json();
}

export async function uploadAudit(file) {
  if (isMockMode("audits")) return mockUploadAudit(file);
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/audits/upload`, { method: "POST", body: form });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

export async function renameAudit(auditId, name) {
  if (isMockMode("audits")) return mockRenameAudit(auditId, name);
  const res = await fetch(`${API_BASE}/api/audits/${encodeURIComponent(auditId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Rename failed");
  }
  return res.json();
}

export async function getAuditDetail(auditId) {
  if (isMockMode("audits")) return mockGetAuditDetail(auditId);
  const res = await fetch(`${API_BASE}/api/audits/${encodeURIComponent(auditId)}`);
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to load audit detail");
  }
  return res.json();
}

// Persist the audit-detail page's edited fixed inclusion criteria to
// mapping.json (doc 4 §The fixed inclusion criteria; doc 9 detail section 1).
export async function saveAuditCriteria(auditId, fixedCriteria) {
  if (isMockMode("audits")) return mockSaveAuditCriteria(auditId, fixedCriteria);
  const res = await fetch(`${API_BASE}/api/audits/${encodeURIComponent(auditId)}/mapping`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixed_criteria: fixedCriteria }),
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Saving criteria failed");
  }
  return res.json();
}

export async function deleteAudit(auditId) {
  if (isMockMode("audits")) return mockDeleteAudit(auditId);
  const res = await fetch(`${API_BASE}/api/audits/${encodeURIComponent(auditId)}`, { method: "DELETE" });
  await throwIfUnauthorized(res);
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Delete failed");
  }
}

export async function reindexAudit(auditId) {
  if (isMockMode("audits")) return mockReindexAudit(auditId);
  const res = await fetch(`${API_BASE}/api/audits/${encodeURIComponent(auditId)}/reindex`, { method: "POST" });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Retry failed");
  }
  return res.json();
}

export async function createRunFromAudit(auditId, filters = {}, database = null) {
  if (isMockMode("runs")) return mockCreateRunFromTemplate(auditId, filters);
  const body = { auditId, filters };
  if (database) body.database = database;
  const res = await fetch(`${API_BASE}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Run failed");
  }
  return res.json();
}

// Submit co-founder feedback as a GitHub issue. Always hits the real serverless
// endpoint — even in the mock demo, since the whole point is to collect real
// feedback from the deployed build.
export async function submitFeedback({ title, body }) {
  const res = await fetch(`${API_BASE}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body, url: window.location.href }),
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Could not send feedback");
  }
  return res.json();
}

// Start a run from a free-text description (Flow B — README §8). In the demo
// this drives the same live-population engine as a template run.
export async function createRunFromDescription(prompt) {
  if (isMockMode("runs")) return mockCreateRunFromDescription(prompt);
  const res = await fetch(`${API_BASE}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Run failed");
  }
  return res.json();
}

export async function createRun(templateFile, prompt) {
  const form = new FormData();
  form.append("template", templateFile);
  form.append("prompt", prompt);
  const res = await fetch(`${API_BASE}/api/runs`, {
    method: "POST",
    body: form,
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

export async function getWorkbook(runId) {
  if (isMockMode("runs")) return mockGetWorkbook(runId);
  const res = await fetch(`${API_BASE}/api/runs/${runId}/workbook`);
  await throwIfUnauthorized(res);
  if (!res.ok) throw new Error("Failed to load workbook");
  return res.json();
}

export async function executeSql(query, database = null) {
  if (isMockMode("sql")) return mockExecuteSql(query);
  const body = { query };
  if (database) body.database = database;
  const res = await fetch(`${API_BASE}/api/sql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Query failed");
  }
  return res.json();
}

export async function stopRun(runId) {
  const res = await fetch(`${API_BASE}/api/runs/${runId}/stop`, { method: "POST" });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Stop failed");
  }
  return res.json();
}

export async function refreshRun(runId) {
  const res = await fetch(`${API_BASE}/api/runs/${runId}/refresh`, { method: "POST" });
  return parseRefreshRunResponse(res, throwIfUnauthorized);
}

export async function downloadWorkbookExport(runId) {
  const res = await fetch(`${API_BASE}/api/runs/${encodeURIComponent(runId)}/download`);
  return parseWorkbookDownloadResponse(res, throwIfUnauthorized);
}

export async function listDatabases() {
  // Library domain: default path is var-backed API unless databases mock is explicitly enabled.
  if (isMockMode("databases")) return mockListDatabases();
  const res = await fetch(`${API_BASE}/api/databases`);
  await throwIfUnauthorized(res);
  if (!res.ok) throw new Error("Failed to load databases");
  return res.json();
}

export async function uploadDatabase(file) {
  if (isMockMode("databases")) return mockUploadDatabase(file);
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/databases/upload`, { method: "POST", body: form });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

export async function renameDatabase(dbId, name) {
  if (isMockMode("databases")) return mockRenameDatabase(dbId, name);
  const res = await fetch(`${API_BASE}/api/databases/${encodeURIComponent(dbId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Rename failed");
  }
  return res.json();
}

export async function getDatabaseDetail(dbId) {
  if (isMockMode("databases")) return mockGetDatabaseDetail(dbId);
  const res = await fetch(`${API_BASE}/api/databases/${encodeURIComponent(dbId)}`);
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to load database detail");
  }
  return res.json();
}

export async function deleteDatabase(dbId) {
  if (isMockMode("databases")) return mockDeleteDatabase(dbId);
  const res = await fetch(`${API_BASE}/api/databases/${encodeURIComponent(dbId)}`, { method: "DELETE" });
  await throwIfUnauthorized(res);
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Delete failed");
  }
}

export async function reindexDatabase(dbId) {
  if (isMockMode("databases")) return mockReindexDatabase(dbId);
  const res = await fetch(`${API_BASE}/api/databases/${encodeURIComponent(dbId)}/reindex`, { method: "POST" });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Retry failed");
  }
  return res.json();
}

// Stream a free-text data description to the LLM and invoke `onChunk` with each
// decoded text chunk as it arrives. Resolves when the stream ends. For now the
// backend just relays the prompt to the model — see server/routes/generate.py.
export async function generateData(query, onChunk, { signal } = {}) {
  const res = await fetch(`${API_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal,
  });
  await throwIfUnauthorized(res);
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Generate failed");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    if (text) onChunk(text);
  }
  const tail = decoder.decode();
  if (tail) onChunk(tail);
}

export async function getRunStatus(runId) {
  const res = await fetch(`${API_BASE}/api/runs/${runId}`);
  await throwIfUnauthorized(res);
  if (!res.ok) throw new Error("Run not found");
  return res.json();
}
