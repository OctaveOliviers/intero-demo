import {
  isMockMode,
  mockCreateTablePopulationFromAudit,
  mockCreateTablePopulationFromDescription,
  mockGetTablePopulationWorkbook,
  mockExecuteSql,
  mockListTemplates,
  mockGetTemplateDetail,
  mockSaveTemplateCriteria,
  mockUploadTemplate,
  mockRenameTemplate,
  mockDeleteTemplate,
  mockReindexTemplate,
  mockListDatabases,
  mockGetDatabaseDetail,
  mockUploadDatabase,
  mockRenameDatabase,
  mockDeleteDatabase,
  mockReindexDatabase,
  mockListDatasets,
  mockGetDatasetDetail,
  mockCreateDataset,
  mockPatchDatasetCriterion,
  mockAddDatasetFilter,
  mockRenameDataset,
  mockRemoveDatasetCriterion,
  mockDeleteDataset,
  mockListThreads,
  mockGetThread,
  mockCreateThread,
  mockPostThreadMessage,
  mockPostThreadMessageStream,
  mockPostThreadQuestionAnswers,
  mockPostThreadQuestionAnswersStream,
  mockRenameThread,
  mockDeleteThread,
  mockMarkThreadOpened,
  mockListTables,
  mockGetTable,
  mockCreateTable,
  mockRenameTable,
  mockDeleteTable,
  mockMarkTableOpened,
  mockListClinicians,
  mockCreateGrant,
  mockDeleteGrant,
  mockListSharedWithMe,
  mockListSharedByMe,
} from "./mock.js";
import {
  parseRefreshTablePopulationResponse,
  parseWorkbookDownloadResponse,
} from "./apiRunResponses.js";

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
      const [{ clearAuth }, { resetChatRuntime }, { resetPopulatedTableHistory }, { goHome }] =
        await Promise.all([
          import("../stores/auth.js"),
          import("../stores/chat.js"),
          import("../stores/populatedTables.js"),
          import("../stores/navigation.js"),
        ]);
      resetChatRuntime();
      resetPopulatedTableHistory();
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

function normalizeTablePopulationHandle(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const tablePopulationId = String(payload.tablePopulationId || "").trim();
  if (!tablePopulationId) return payload;
  return { ...payload, tablePopulationId };
}

function normalizeWorkbookSnapshot(payload, tablePopulationId) {
  if (!payload || typeof payload !== "object") return payload;
  const normalizedId = String(
    payload.tablePopulationId || tablePopulationId || "",
  ).trim();
  return {
    ...payload,
    tablePopulationId: normalizedId || null,
  };
}

// --- auth ------------------------------------------------------------------

// Dev-mock auth (VITE_MOCK=true): the whole auth domain short-circuits so the
// app runs with no backend. `authMe` reports an authenticated mock user (so a
// reload stays signed in), `authLogin` accepts any credentials, and the
// per-user history endpoints return empty (mock history lives in the table/template
// fixtures, not behind auth). Without this, every auth call 401s against the
// absent server even after the login screen's bypass.
const MOCK_USER = { id: "mock-user", username: "mock", role: "admin" };

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

// Read-only IAM user list for the admin Settings "Users & roles" screen
// (admin-only `GET /api/iam/users`, gated by `iam.manage_users`). In dev-mock
// (VITE_MOCK=true) the auth domain has no backend, so return a small list
// mirroring the server shape: an admin plus a couple of clinicians, one with a
// pending first-login reset. The 403 a clinician would get server-side is
// already reflected in the SPA — the section never renders for non-admins.
const MOCK_IAM_USERS = [
  {
    id: "mock-user",
    username: "mock",
    display_name: "Demo Admin",
    role: "admin",
    is_active: true,
    must_reset_password: false,
  },
  {
    id: "mock-clin-1",
    username: "a.shah",
    display_name: "Dr Aanya Shah",
    role: "clinician",
    is_active: true,
    must_reset_password: false,
  },
  {
    id: "mock-clin-2",
    username: "j.okafor",
    display_name: "Dr James Okafor",
    role: "clinician",
    is_active: true,
    must_reset_password: true,
  },
];

export async function listIamUsers() {
  if (isMockMode("auth")) return MOCK_IAM_USERS.map((u) => ({ ...u }));
  const res = await fetch(`${API_BASE}/api/iam/users`, {
    credentials: "include",
  });
  return parseAuthResponse(res, "Failed to fetch users");
}

export async function listMyTablePopulations() {
  if (isMockMode("auth")) return [];
  const res = await fetch(`${API_BASE}/api/auth/table-populations`, {
    credentials: "include",
  });
  return parseAuthResponse(res, "Failed to fetch table-population history");
}

export async function listMyQueries() {
  if (isMockMode("auth")) return [];
  const res = await fetch(`${API_BASE}/api/auth/queries`, {
    credentials: "include",
  });
  return parseAuthResponse(res, "Failed to fetch query history");
}

export async function listTemplates() {
  // Library domain: default path is var-backed API unless templates mock is explicitly enabled.
  if (isMockMode("templates")) return mockListTemplates();
  const res = await fetch(`${API_BASE}/api/templates`);
  await throwIfUnauthorized(res);
  if (!res.ok) throw new Error("Failed to load templates");
  return res.json();
}

export async function uploadTemplate(file) {
  if (isMockMode("templates")) return mockUploadTemplate(file);
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/templates/upload`, { method: "POST", body: form });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

export async function renameTemplate(templateId, name) {
  if (isMockMode("templates")) return mockRenameTemplate(templateId, name);
  const res = await fetch(`${API_BASE}/api/templates/${encodeURIComponent(templateId)}`, {
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

export async function getTemplateDetail(templateId) {
  if (isMockMode("templates")) return mockGetTemplateDetail(templateId);
  const res = await fetch(`${API_BASE}/api/templates/${encodeURIComponent(templateId)}`);
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to load template detail");
  }
  return res.json();
}

// Persist the template-detail page's edited fixed inclusion criteria to
// mapping.json (doc 4 §The fixed inclusion criteria; doc 9 detail section 1).
export async function saveTemplateCriteria(templateId, fixedCriteria) {
  if (isMockMode("templates")) return mockSaveTemplateCriteria(templateId, fixedCriteria);
  const res = await fetch(`${API_BASE}/api/templates/${encodeURIComponent(templateId)}/mapping`, {
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

export async function deleteTemplate(templateId) {
  if (isMockMode("templates")) return mockDeleteTemplate(templateId);
  const res = await fetch(`${API_BASE}/api/templates/${encodeURIComponent(templateId)}`, { method: "DELETE" });
  await throwIfUnauthorized(res);
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Delete failed");
  }
}

export async function reindexTemplate(templateId) {
  if (isMockMode("templates")) return mockReindexTemplate(templateId);
  const res = await fetch(`${API_BASE}/api/templates/${encodeURIComponent(templateId)}/reindex`, { method: "POST" });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Retry failed");
  }
  return res.json();
}

export async function createTablePopulationFromAudit(
  auditId,
  filters = {},
  database = null,
) {
  if (isMockMode("table_populations")) {
    return normalizeTablePopulationHandle(
      await mockCreateTablePopulationFromAudit(auditId, filters),
    );
  }
  const body = { auditId, filters };
  if (database) body.database = database;
  const res = await fetch(`${API_BASE}/api/table-populations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Table population failed");
  }
  return normalizeTablePopulationHandle(await res.json());
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

// Start a table population from a free-text description. This is mock-only for the demo:
// real v1 table populations are template-backed, and pure prose → populated
// table remains deferred in the product spec.
export async function createTablePopulationFromDescription(prompt) {
  if (isMockMode("table_populations")) {
    return normalizeTablePopulationHandle(
      await mockCreateTablePopulationFromDescription(prompt),
    );
  }
  throw new Error(
    "Real table populations are template-backed; select or create a backend audit template before running.",
  );
}

export async function getTablePopulationWorkbook(tablePopulationId) {
  if (isMockMode("table_populations")) {
    return normalizeWorkbookSnapshot(
      await mockGetTablePopulationWorkbook(tablePopulationId),
      tablePopulationId,
    );
  }
  const res = await fetch(`${API_BASE}/api/table-populations/${tablePopulationId}/workbook`);
  await throwIfUnauthorized(res);
  if (!res.ok) throw new Error("Failed to load workbook");
  return normalizeWorkbookSnapshot(await res.json(), tablePopulationId);
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

export async function stopTablePopulation(tablePopulationId) {
  const res = await fetch(`${API_BASE}/api/table-populations/${tablePopulationId}/stop`, { method: "POST" });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Stop failed");
  }
  return res.json();
}

export async function executeChatCitationEvidence(citation) {
  if (isMockMode("sql")) return mockExecuteSql(String(citation?.query || ""));
  const res = await fetch(`${API_BASE}/api/chat/evidence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread_id: citation?.thread_id || null,
      message_index: citation?.message_index ?? null,
      marker: citation?.marker || null,
      covered_row_index: citation?.covered_row_index ?? null,
    }),
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Query failed");
  }
  return res.json();
}

// Delete a table population end-to-end on the backend: stops its live execution, then removes
// its state-DB rows (cells included), its var/runs/<id> directory, and its
// attribution. A 404 means it is already gone — treat that as success so the
// sidebar entry is still removed locally.
export async function deleteTablePopulation(tablePopulationId) {
  if (isMockMode("table_populations")) return;
  const res = await fetch(`${API_BASE}/api/table-populations/${tablePopulationId}`, { method: "DELETE" });
  await throwIfUnauthorized(res);
  if (!res.ok && res.status !== 404) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Delete failed");
  }
}

export async function refreshTablePopulation(tablePopulationId) {
  const res = await fetch(`${API_BASE}/api/table-populations/${tablePopulationId}/refresh`, { method: "POST" });
  return parseRefreshTablePopulationResponse(res, throwIfUnauthorized);
}

export async function downloadTablePopulationWorkbook(tablePopulationId) {
  const res = await fetch(`${API_BASE}/api/table-populations/${encodeURIComponent(tablePopulationId)}/download`);
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

export async function getTablePopulationStatus(tablePopulationId) {
  const res = await fetch(`${API_BASE}/api/table-populations/${tablePopulationId}`);
  await throwIfUnauthorized(res);
  if (!res.ok) throw new Error("Table population not found");
  return normalizeTablePopulationHandle(await res.json());
}

// --- Datasets (the data library) -------------------------------------------
// A Dataset is a saved, named cohort filter that scopes the hospital database to
// a slice. The detail view edits its filter chips (deterministic re-derive, no
// LLM) and adds new filters from free text (grounded server-side).

// Creating a Dataset / adding a filter grounds free text through an LLM, which can
// take a while (a local model may even be loading). Bound it so the UI never hangs
// forever — on timeout we surface a clear, actionable error instead.
const GROUNDING_TIMEOUT_MS = 90000;

async function fetchGrounding(url, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROUNDING_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(
        "Grounding is taking too long — the model may still be loading. Please try again.",
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function listDatasets() {
  if (isMockMode("datasets")) return mockListDatasets();
  const res = await fetch(`${API_BASE}/api/datasets`);
  await throwIfUnauthorized(res);
  if (!res.ok) throw new Error("Failed to load datasets");
  return res.json();
}

export async function getDatasetDetail(id) {
  if (isMockMode("datasets")) return mockGetDatasetDetail(id);
  const res = await fetch(`${API_BASE}/api/datasets/${encodeURIComponent(id)}`);
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to load dataset detail");
  }
  return res.json();
}

export async function createDataset(body) {
  if (isMockMode("datasets")) return mockCreateDataset(body);
  const res = await fetchGrounding(`${API_BASE}/api/datasets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Create dataset failed");
  }
  return res.json();
}

// Edit one filter's value → the predicate re-binds, the SQL recomposes, and the
// count re-runs deterministically (no LLM). Returns the re-derived dataset.
export async function patchDatasetCriterion(id, criterionId, value) {
  if (isMockMode("datasets")) return mockPatchDatasetCriterion(id, criterionId, value);
  const res = await fetch(`${API_BASE}/api/datasets/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ criterion_id: criterionId, value }),
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Edit filter failed");
  }
  return res.json();
}

// Ground one free-text phrase against the database structure; lands as a new
// chip (and SQL clause) or a not_available row. Returns the re-derived dataset.
export async function addDatasetFilter(id, text) {
  if (isMockMode("datasets")) return mockAddDatasetFilter(id, text);
  const res = await fetchGrounding(`${API_BASE}/api/datasets/${encodeURIComponent(id)}/filters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Add filter failed");
  }
  return res.json();
}

// Rename a Dataset (no LLM). Returns the updated dataset.
export async function renameDataset(id, name) {
  if (isMockMode("datasets")) return mockRenameDataset(id, name);
  const res = await fetch(`${API_BASE}/api/datasets/${encodeURIComponent(id)}`, {
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

// Remove one filter from a Dataset → re-derives the count + SQL (no LLM). Returns
// the re-scoped dataset.
export async function removeDatasetCriterion(id, criterionId) {
  if (isMockMode("datasets")) return mockRemoveDatasetCriterion(id, criterionId);
  const res = await fetch(
    `${API_BASE}/api/datasets/${encodeURIComponent(id)}/criteria/${encodeURIComponent(criterionId)}`,
    { method: "DELETE" },
  );
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Remove filter failed");
  }
  return res.json();
}

export async function deleteDataset(id) {
  if (isMockMode("datasets")) return mockDeleteDataset(id);
  const res = await fetch(`${API_BASE}/api/datasets/${encodeURIComponent(id)}`, { method: "DELETE" });
  await throwIfUnauthorized(res);
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Delete failed");
  }
}

// --- Threads (the conversation surface) ------------------------------------
// A thread is the free-ranging, UNSCOPED conversation surface — the only
// conversation surface in the app (product-flows.md §Threads, tables & outputs).
// These functions mirror the FROZEN backend control plane (server/routes/threads.py):
// list / read / create / message / delete, all under the authenticated `/api/*`
// (throwIfUnauthorized handles 401). Each user message is passed to the agent;
// the FE renders the answer or ask_user_question request it gets back.

export async function listThreads() {
  if (isMockMode("threads")) return mockListThreads();
  const res = await fetch(`${API_BASE}/api/threads`);
  await throwIfUnauthorized(res);
  if (!res.ok) throw new Error("Failed to load threads");
  return res.json();
}

export async function getThread(id) {
  if (isMockMode("threads")) return mockGetThread(id);
  const res = await fetch(`${API_BASE}/api/threads/${encodeURIComponent(id)}`);
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to load thread");
  }
  return res.json();
}

export async function markThreadOpened(id) {
  if (isMockMode("threads")) return mockMarkThreadOpened(id);
  const res = await fetch(`${API_BASE}/api/threads/${encodeURIComponent(id)}/open`, { method: "POST" });
  await throwIfUnauthorized(res);
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Mark thread opened failed");
  }
}

// Create a thread; if `body.message` is present the server passes it to the agent
// and derives the title. Returns the full thread.
export async function createThread(body) {
  if (isMockMode("threads")) return mockCreateThread(body);
  const res = await fetch(`${API_BASE}/api/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Create thread failed");
  }
  return res.json();
}

// Append a user message; the server appends the agent resolution message and
// bumps updated_at. Returns the full thread.
export async function postThreadMessage(id, content, attachments = []) {
  if (isMockMode("threads")) return mockPostThreadMessage(id, content, attachments);
  const res = await fetch(`${API_BASE}/api/threads/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, attachments }),
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Send message failed");
  }
  return res.json();
}

function parseSseBuffer(buffer, onEvent) {
  const frames = buffer.split("\n\n");
  const rest = frames.pop() || "";
  for (const frame of frames) {
    const line = frame
      .split("\n")
      .find((part) => part.startsWith("data: "));
    if (!line) continue;
    const payload = line.slice("data: ".length).trim();
    if (!payload) continue;
    onEvent(JSON.parse(payload));
  }
  return rest;
}

// Append a user message and stream the agent reply. The stream uses the same
// data-only SSE frame shape as /api/table-populations/{id}/stream.
export async function postThreadMessageStream(
  id,
  content,
  onEvent = () => {},
  attachments = [],
) {
  if (isMockMode("threads")) {
    return mockPostThreadMessageStream(id, content, onEvent, attachments);
  }
  const res = await fetch(`${API_BASE}/api/threads/${encodeURIComponent(id)}/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, attachments }),
  });
  await throwIfUnauthorized(res);
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Send message failed");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalThread = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = parseSseBuffer(buffer, (event) => {
      onEvent(event);
      if (event?.type === "done") finalThread = event.thread || null;
      if (event?.type === "error") throw new Error(event.message || "Send message failed");
    });
  }
  buffer += decoder.decode();
  parseSseBuffer(buffer + "\n\n", (event) => {
    onEvent(event);
    if (event?.type === "done") finalThread = event.thread || null;
  });
  if (!finalThread) throw new Error("Stream ended before the thread was returned.");
  return finalThread;
}

export async function postThreadQuestionAnswers(id, answers) {
  if (isMockMode("threads")) return mockPostThreadQuestionAnswers(id, answers);
  const res = await fetch(`${API_BASE}/api/threads/${encodeURIComponent(id)}/question-answers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers: Array.isArray(answers) ? answers : [] }),
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Submit answers failed");
  }
  return res.json();
}

export async function postThreadQuestionAnswersStream(id, answers, onEvent = () => {}) {
  if (isMockMode("threads")) {
    return mockPostThreadQuestionAnswersStream(id, answers, onEvent);
  }
  const res = await fetch(`${API_BASE}/api/threads/${encodeURIComponent(id)}/question-answers/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers: Array.isArray(answers) ? answers : [] }),
  });
  await throwIfUnauthorized(res);
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Submit answers failed");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalThread = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = parseSseBuffer(buffer, (event) => {
      onEvent(event);
      if (event?.type === "done") finalThread = event.thread || null;
      if (event?.type === "error") throw new Error(event.message || "Submit answers failed");
    });
  }
  buffer += decoder.decode();
  parseSseBuffer(buffer + "\n\n", (event) => {
    onEvent(event);
    if (event?.type === "done") finalThread = event.thread || null;
  });
  if (!finalThread) throw new Error("Stream ended before the thread was returned.");
  return finalThread;
}

// Rename a thread (title only). Returns the updated thread (mirrors PATCH route).
export async function renameThread(id, title) {
  if (isMockMode("threads")) return mockRenameThread(id, title);
  const res = await fetch(`${API_BASE}/api/threads/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Rename failed");
  }
  return res.json();
}

export async function deleteThread(id) {
  if (isMockMode("threads")) return mockDeleteThread(id);
  const res = await fetch(`${API_BASE}/api/threads/${encodeURIComponent(id)}`, { method: "DELETE" });
  await throwIfUnauthorized(res);
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Delete failed");
  }
}

// --- Tables (the populated audit table — a first-class re-openable entity) ---
// A `table` wraps an existing table population (table.schema.json; decision 0004).
// These mirror the FROZEN backend table control plane (server/routes/tables.py):
// list / read / create / delete under the authenticated `/api/*`. The FE tracks
// the wrapped population via the populatedTables/table-population pipeline (stores/tables.js).

export async function listTables() {
  if (isMockMode("tables")) return mockListTables();
  const res = await fetch(`${API_BASE}/api/tables`);
  await throwIfUnauthorized(res);
  if (!res.ok) throw new Error("Failed to load tables");
  return res.json();
}

export async function getTable(id) {
  if (isMockMode("tables")) return mockGetTable(id);
  const res = await fetch(`${API_BASE}/api/tables/${encodeURIComponent(id)}`);
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to load table");
  }
  return res.json();
}

export async function createTable(body) {
  if (isMockMode("tables")) return mockCreateTable(body);
  const res = await fetch(`${API_BASE}/api/tables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Create table failed");
  }
  return res.json();
}

// Rename a table (title only — scope is pinned for life, decision 0004). Returns
// the updated table (mirrors the PATCH route).
export async function renameTable(id, title) {
  if (isMockMode("tables")) return mockRenameTable(id, title);
  const res = await fetch(`${API_BASE}/api/tables/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Rename failed");
  }
  return res.json();
}

export async function deleteTable(id) {
  if (isMockMode("tables")) return mockDeleteTable(id);
  const res = await fetch(`${API_BASE}/api/tables/${encodeURIComponent(id)}`, { method: "DELETE" });
  await throwIfUnauthorized(res);
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Delete failed");
  }
}

// Mark a table OPENED for the current user (per-user "seen"): the user opened
// its full grid, so the sidebar's blue "finished, unopened" dot should clear and
// stay cleared across sessions. POST /api/tables/{id}/open → 204. A 404 means the
// table is gone — treat it as a no-op (nothing to mark) rather than surfacing an
// error out of the fire-and-forget open path.
export async function markTableOpened(id) {
  if (isMockMode("tables")) return mockMarkTableOpened(id);
  const res = await fetch(`${API_BASE}/api/tables/${encodeURIComponent(id)}/open`, { method: "POST" });
  await throwIfUnauthorized(res);
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Mark opened failed");
  }
}

// --- Resource grants & sharing (§10) ---------------------------------------
// The narrow-v1 sharing surfaces over the FROZEN grant control plane
// (server/routes/clinicians.py + grants.py). An owner shares a Dataset / table
// template / populated table to a NAMED colleague (read or run); the grantee sees
// it via shared-with-me; the owner sees + revokes via shared-by-me. Threads are
// NOT grantable (no thread share path here). Mock seam: "grants".

// The clinical-staff directory the share dialog picks from — display_name + id
// only, no PID / no IAM (GET /api/clinicians, clinician-role accounts).
export async function listClinicians() {
  if (isMockMode("grants")) return mockListClinicians();
  const res = await fetch(`${API_BASE}/api/clinicians`);
  await throwIfUnauthorized(res);
  if (!res.ok) throw new Error("Failed to load colleagues");
  return res.json();
}

// Share a resource with a colleague as an EDITOR — sharing is always editor, so
// the grant is fixed to "manage" (the only level that confers editing). 403 if
// the caller is not the owner; the dialog surfaces the detail inline. Returns the
// full created grant row.
export async function createGrant({ resourceType, resourceId, subjectId }) {
  if (isMockMode("grants")) return mockCreateGrant({ resourceType, resourceId, subjectId });
  const res = await fetch(`${API_BASE}/api/grants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resource_type: resourceType,
      resource_id: resourceId,
      subject_id: subjectId,
      grant_type: "manage",
      expires_at: null,
    }),
  });
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Share failed");
  }
  return res.json();
}

// Revoke a grant (owner removing a grantee, or a grantee removing their own
// inbound grant). 204 on success — a 404 means it is already gone, treat as done.
export async function deleteGrant(grantId) {
  if (isMockMode("grants")) return mockDeleteGrant(grantId);
  const res = await fetch(`${API_BASE}/api/grants/${encodeURIComponent(grantId)}`, { method: "DELETE" });
  await throwIfUnauthorized(res);
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Revoke failed");
  }
}

// Resources shared WITH the current user (recipient inbox): resource + access
// level + expiry + a human label. Mirrors the backend contract; a received item
// simply appears in the recipient's normal library (no badge / banner in v2).
export async function listSharedWithMe() {
  if (isMockMode("grants")) return mockListSharedWithMe();
  const res = await fetch(`${API_BASE}/api/grants/shared-with-me`);
  await throwIfUnauthorized(res);
  if (!res.ok) throw new Error("Failed to load shared-with-me");
  return res.json();
}

// Resources the current user has shared BY them (owner view): who holds each
// grant (grantee display_name) with a revoke affordance.
export async function listSharedByMe() {
  if (isMockMode("grants")) return mockListSharedByMe();
  const res = await fetch(`${API_BASE}/api/grants/shared-by-me`);
  await throwIfUnauthorized(res);
  if (!res.ok) throw new Error("Failed to load shared-by-me");
  return res.json();
}
