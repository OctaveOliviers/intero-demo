// Front-end mock layer for the Intero demo (enabled with VITE_MOCK=true).
//
// This drives the WHOLE demo with no backend: the home analyses list, the
// EHR / Lab / Radiology databases, indexing-on-upload, the live table-population
// timeline, the workbook, and the SQL/note evidence. The data lives in
// mockData.js; this file wires it into the table-population API layer and the indexing store.

import { indexingMap, flashing } from "../stores/indexing.js";
import { addToast } from "../stores/toasts.js";
import {
  MOCK_TEMPLATE,
  MOCK_ANALYSES,
  MOCK_DATABASES,
  MOCK_LIBRARY_DATASETS,
  DATASET_NOT_AVAILABLE_REASON,
  composeCohortSql,
  deriveDatasetCount,
  buildTimeline,
  buildPopulatedWorkbookForTablePopulation,
  resolveSql,
  MOCK_THREADS,
  THREAD_DEFAULT_TITLE,
  DIABETES_DEMO_THREAD_TITLE,
  deriveThreadTitle,
  isDiabetesWorklistPrompt,
  resolveThreadMessage,
  buildMockTable,
  buildDiabetesWorklistPopulatedWorkbook,
  diabetesWorklistAskUserQuestionRequest,
  DIABETES_PATIENT_RISK_LIST_ANSWER,
  DIABETES_RISK_LIST_ASK_ID,
  DIABETES_RISK_LIST_QUESTION_ID,
  DIABETES_RISK_LIST_SHOW_CHOICE_ID,
  DIABETES_RISK_LIST_KEEP_CHOICE_ID,
  DIABETES_WORKLIST_ASK_ID,
  DIABETES_WORKLIST_QUESTION_ID,
  DIABETES_WORKLIST_CREATE_CHOICE_ID,
  DIABETES_WORKLIST_KEEP_CHOICE_ID,
  DIABETES_WORKLIST_SOURCE_TEMPLATE,
  DIABETES_WORKLIST_TABLE_TITLE,
  THREAD_WHOLE_DB_DISCLOSURE,
  MOCK_TABLES,
} from "./mockData.js";
import { dispatchMockTimelineStep } from "./mockTimeline.js";
import { datasetPredicateDisplay } from "./datasetDetailChips.js";
import { TEMPLATE_CATALOG } from "./templateCatalog.js";
import { CONTENT } from "./mock/content/index.js";
import { predicateDisplay } from "./templateDetailChips.js";

// Flatten the agent-side template catalog so Settings shows the same
// templates the agent proposes in the InputSpec pickers.
const CATALOG_TEMPLATES = TEMPLATE_CATALOG.flatMap((group) =>
  group.templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    defaultFilters: { dateFrom: "", dateTo: "", hospitals: "", cohort: "" },
  })),
);
const CATALOG_BY_ID = new Map(
  TEMPLATE_CATALOG.flatMap((group) => group.templates).map((t) => [t.id, t]),
);

// Whether the front-end runs against the in-memory mock (no backend), resolved
// per domain so a single domain can flip to the real API while the rest stay
// mocked (the endpoint-by-endpoint migration in 3-architecture.md §front-end
// seam). Domains mirror the contract: "templates", "databases", "datasets",
// "threads", "table_populations", "sql", and "indexing" (the SSE stream consumed by
// stores/indexing.js). The table-population
// stream (stores/chat.js) belongs to "table_populations" so the whole lifecycle —
// create, stream, workbook — flips together.
//
// Precedence (most specific wins):
//   1. VITE_MOCK_<DOMAIN>="true"/"false"  → that domain only
//   2. VITE_MOCK="true"                    → mock on  (e.g. `npm run dev:mock`)
//   3. VITE_MOCK="false"                   → mock off (force the real API)
//   4. unset                               → on in a prod build, off in `vite dev`
//
// Rule 4 is what keeps the deployed demo working: the Vercel build ships no
// `/api/table-populations` backend, so a production build with no VITE_MOCK must use the
// mock rather than POST to an endpoint that 404s. Local
// `vite dev` still defaults to the real API proxied to :8000. Default: all mock.
//
// Pure resolver — takes the env explicitly so it can be unit-tested without
// `import.meta`. `domain` is optional; callers without a domain (e.g. the populate
// stream / indexing stores) fall through to the global flag.
export function resolveMockMode(env, domain) {
  const source = env || {};
  if (domain) {
    const perDomain = source[`VITE_MOCK_${domain.toUpperCase()}`];
    if (perDomain === "true") return true;
    if (perDomain === "false") return false;
  }
  const flag = source.VITE_MOCK;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return source.PROD;
}

export function isMockMode(domain) {
  return resolveMockMode(globalThis.__INTERO_MOCK_ENV || import.meta.env, domain);
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fastMockTiming() {
  const env = globalThis.__INTERO_MOCK_ENV || import.meta.env || {};
  if (env.VITE_MOCK_TIMING === "real") return false;
  if (env.VITE_MOCK_TIMING === "fast") return true;
  return typeof window === "undefined";
}

function pacedDelayMs(ms) {
  const value = Number(ms) || 0;
  if (!fastMockTiming()) return value;
  if (value <= 0) return 0;
  return Math.max(1, Math.round(value * 0.01));
}

function pacedDelay(ms) {
  return delay(pacedDelayMs(ms));
}

// --- In-memory state (resets on reload; the fixed scenario is always present)
// Five pre-loaded analyses decorate the home screen; Cord pH is NOT seeded —
// the user uploads it live (Flow A). Three ready databases mean the run card
// no longer auto-selects, so the user picks EHR on camera.
let mockTemplates = CATALOG_TEMPLATES.map((a) => ({ ...a }));
let mockDatabases = MOCK_DATABASES.map((d) => ({ ...d }));
// Data-library Datasets (saved cohort filters). Deep-cloned so PATCH / add-filter
// can mutate the in-memory copy without touching the seed; resets on reload.
let mockDatasets = MOCK_LIBRARY_DATASETS.map(cloneDataset);
// Threads (the conversation surface). Deep-cloned so append/create/delete mutate
// the in-memory copy without touching the seed; resets on reload.
let mockThreads = MOCK_THREADS.map(cloneJson);
// Tables (the populated audit table — a first-class re-openable entity). Minted
// live by direct create calls and by thread table requests; resets on reload.
// Each wraps a table population registered in `tablePopulationFlows`, so the stream fills it.
// Seeded so the Tables section shows re-openable cards on a fresh demo load.
let mockTables = MOCK_TABLES.map(cloneJson);

function cloneJson(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function cloneDataset(ds) {
  return cloneJson(ds);
}

// tablePopulationId -> "A" | "B" | "C": which timeline a started population should play.
const tablePopulationFlows = new Map();
const tablePopulationSnapshots = new Map();
// Wire the seed tables' wrapped table populations into the populate pipeline so opening a seeded
// card plays the compact cord-pH "TBL" timeline (same fill the live flow uses).
for (const t of MOCK_TABLES) {
  if (t.table_population_id) tablePopulationFlows.set(t.table_population_id, "TBL");
}

function newId(prefix) {
  return prefix + "-" + crypto.randomUUID().slice(0, 8);
}

function suggestedDatasetName(text) {
  const clean = String(text || "").trim().replace(/\s+/g, " ").replace(/[. ]+$/, "");
  if (!clean) return "New Dataset";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function newMessageId() {
  return "msg-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

// --- Indexing simulation (README §6.3) -------------------------------------
// Push an "indexing" entry into the indexing store, then flip it to "ready"
// after 5–10 s with a transient green "ready" chip + toast. We update the
// exported stores directly rather than go through the SSE-driven applyEntry.
const INDEX_MIN = 5000;
const INDEX_MAX = 10000;
const READY_FLASH_MS = 5000;

function setIndexEntry(entry) {
  indexingMap.update((m) => {
    m.set(`${entry.kind}:${entry.id}`, entry);
    return m;
  });
}

export function mockSimulateIndexing(kind, id, name) {
  const k = `${kind}:${id}`;
  setIndexEntry({ kind, id, name, status: "indexing" });
  const ms = INDEX_MIN + Math.random() * (INDEX_MAX - INDEX_MIN);
  setTimeout(() => {
    setIndexEntry({ kind, id, name, status: "ready" });
    flashing.update((s) => new Set(s).add(k));
    setTimeout(() => {
      flashing.update((s) => {
        const next = new Set(s);
        next.delete(k);
        return next;
      });
    }, READY_FLASH_MS);
    addToast({ kind: "success", message: `${name} is ready to use.` });
  }, ms);
}

// --- Templates ---------------------------------------------------------------
export async function mockListTemplates() {
  return mockTemplates.map((t) => ({ id: t.id, name: t.name, description: t.description }));
}

export async function mockUploadTemplate(file) {
  const id = newId("template");
  const base = (file && file.name ? file.name : "Uploaded template").replace(/\.[^.]+$/, "");
  const name = base || "Uploaded template";
  mockTemplates = [
    ...mockTemplates,
    { id, name, description: "Uploaded template — indexing structure and field mappings.", defaultFilters: { ...MOCK_TEMPLATE.defaultFilters } },
  ];
  mockSimulateIndexing("audit", id, name);
  return { id, name };
}

export async function mockRenameTemplate(id, name) {
  mockTemplates = mockTemplates.map((t) => (t.id === id ? { ...t, name } : t));
  return { id, name };
}

export async function mockDeleteTemplate(id) {
  mockTemplates = mockTemplates.filter((t) => t.id !== id);
  return {};
}

export async function mockReindexTemplate(id) {
  const t = mockTemplates.find((x) => x.id === id);
  if (t) mockSimulateIndexing("audit", id, t.name);
  return { id };
}

export async function mockGetTemplateDetail(id) {
  const base = mockTemplates.find((t) => t.id === id);
  if (!base) throw new Error("Template not found.");
  const full = CATALOG_BY_ID.get(id);
  const columns = Array.isArray(full?.columns) ? full.columns : [];
  // Detail-page demo shaping (doc 9 three sections): the first two fields are
  // interpret (with clinical-meaning notes), the third carries a code map so
  // the Template section shows the mechanical code text; the rest stay
  // uncoded direct.
  const fieldRows = columns.map((name, i) => ({
    id: `${id}/field-${i + 1}`,
    number: i + 1,
    name,
    type: "text",
    section: "ALL",
    cell: String.fromCharCode(65 + (i % 26)),
    ...(i < 2 ? { notes: `Clinician judgement of ${name.toLowerCase()} read from the notes.` } : {}),
  }));
  const mappingFields = columns.map((name, i) => ({
    region: "ALL",
    cell: String.fromCharCode(65 + (i % 26)),
    header: name,
    kind: i < 2 ? "interpret" : "direct",
    sources: ["mock-db -> mock_table.mock_column"],
    ...(i === 2 ? { code: { 1: "Yes", 2: "No", 9: "Not recorded" } } : {}),
  }));
  const ageCriterion = {
    criterion_id: "age_years",
    label: CONTENT.templateDetail.criteria.age.label,
    type: "number",
    predicate: { op: "gte", value: 18, unit: CONTENT.templateDetail.criteria.age.unit },
  };
  const admissionDateCriterion = {
    criterion_id: "admission_date",
    label: CONTENT.templateDetail.criteria.admissionDate.label,
    type: "date",
    predicate: { op: "between", value: ["2025-04-01", "2026-03-31"] },
  };
  const fixedCriteria = [ageCriterion, admissionDateCriterion].map((criterion) => ({
    ...criterion,
    display: predicateDisplay(criterion),
  }));

  return {
    id: base.id,
    name: base.name,
    description: base.description || "",
    excelPath: full?.fileName || `${base.name}.xlsx`,
    status: "ready",
    deadline: "2026-07-07",
    spec: {
      audit: base.id,
      title: base.name,
      description: base.description || "",
      deadline: "2026-07-07",
      fields: fieldRows,
      sections: [{ id: "ALL", name: "All fields" }],
    },
    mapping: {
      databases: ["mock-db"],
      database_summaries: {
        "mock-db": CONTENT.templateDetail.databaseSummary,
      },
      fields: mappingFields,
      criteria_bindings: [
        {
          criterion_id: "age_years",
          label: CONTENT.templateDetail.criteria.age.label,
          source: "mock-db -> patients.age_years",
          type: "number",
          join_path: "direct column on the anchor row (no join)",
          grain_rule: "the patient's record has an age in the implied range",
          from: "db_column",
        },
        {
          criterion_id: "admission_date",
          label: CONTENT.templateDetail.criteria.admissionDate.label,
          source: "mock-db -> admissions.start",
          type: "date",
          join_path: "direct column on the anchor row (no join)",
          grain_rule: "the patient has an admission starting in the implied range",
          from: "db_column",
        },
      ],
      fixed_criteria: fixedCriteria,
      executable: { source: "mock" },
    },
  };
}

// Mock persist of edited fixed criteria — resolves with the echoed array so
// the detail page's auto-save flow behaves like the real PATCH.
export async function mockSaveTemplateCriteria(id, fixedCriteria) {
  await delay(150);
  return { id, fixed_criteria: Array.isArray(fixedCriteria) ? fixedCriteria : [] };
}

// --- Databases --------------------------------------------------------------
export async function mockListDatabases() {
  return mockDatabases.map((d) => ({ ...d }));
}

export async function mockUploadDatabase(file) {
  const id = newId("db");
  const base = (file && file.name ? file.name : "Uploaded database").replace(/\.[^.]+$/, "");
  const name = base || "Uploaded database";
  mockDatabases = [...mockDatabases, { id, name, status: "indexing" }];
  mockSimulateIndexing("database", id, name);
  setTimeout(() => {
    mockDatabases = mockDatabases.map((d) => (d.id === id ? { ...d, status: "ready" } : d));
  }, INDEX_MAX);
  return { id, name };
}

export async function mockRenameDatabase(id, name) {
  mockDatabases = mockDatabases.map((d) => (d.id === id ? { ...d, name } : d));
  return { id, name };
}

export async function mockDeleteDatabase(id) {
  mockDatabases = mockDatabases.filter((d) => d.id !== id);
  return {};
}

export async function mockReindexDatabase(id) {
  const d = mockDatabases.find((x) => x.id === id);
  if (d) mockSimulateIndexing("database", id, d.name);
  return { id };
}

export async function mockGetDatabaseDetail(id) {
  const db = mockDatabases.find((d) => d.id === id);
  if (!db) throw new Error("Database not found.");
  return {
    id: db.id,
    name: db.name,
    description: db.description || "Mock database",
    type: db.type || "sqlite",
    path: db.path || `var/databases/${db.id}/database.sqlite`,
    status: db.status || "ready",
    model: {
      database: db.id,
      title: db.name,
      description: db.description || "Mock database model",
      tables: [
        {
          name: "mock_table",
          columns: [
            { name: "patient_code" },
            { name: "value" },
            { name: "recorded_at" },
          ],
        },
      ],
      identifiers: ["patient_code"],
      coded: ["mock_table.value"],
    },
  };
}

// --- Table-population lifecycle -------------------------------------------
export async function mockCreateTablePopulationFromAudit(templateId, _filters) {
  await delay(300);
  const tablePopulationId = newId("mock");
  // Each seeded dashboard plays its own dataset flow; every other template
  // plays the cord-pH Flow A.
  const flowByTemplate = {
    "npda-lo-audit": "C",
    "epilepsy12-lo-audit": "E",
    "nmtr-trauma-lo-audit": "T",
  };
  tablePopulationFlows.set(tablePopulationId, flowByTemplate[templateId] || "A");
  return { tablePopulationId };
}

export async function mockCreateTablePopulationFromDescription(_prompt) {
  await delay(300);
  const tablePopulationId = newId("mock");
  tablePopulationFlows.set(tablePopulationId, "B");
  return { tablePopulationId };
}

// Play the table-population timeline, invoking the matching callback per step. Extends the
// callback model with onWorkbookCreated + onCellUpdate + onReviewSummary.
export function mockStartTablePopulationStream(
  tablePopulationId,
  { onActivity, onWorkbookCreated, onCellUpdate, onReviewSummary, onDone, onError },
  options = {},
) {
  const flow = tablePopulationFlows.get(tablePopulationId) || "A";
  const steps = options.steps || buildTimeline(flow);
  let cancelled = false;
  let i = 0;

  function next() {
    if (cancelled || i >= steps.length) return;
    const step = steps[i++];
    setTimeout(() => {
      if (cancelled) return;
      try {
        dispatchMockTimelineStep(step, {
          onActivity,
          onWorkbookCreated,
          onCellUpdate,
          onReviewSummary,
          onDone,
        });
        if (step.kind === "done") {
          tablePopulationFlows.delete(tablePopulationId);
        }
      } catch (err) {
        onError && onError({ message: err.message });
        return;
      }
      next();
    }, pacedDelayMs(step.wait));
  }

  next();
  return {
    close() {
      cancelled = true;
    },
    // Stop & finalize (mirrors the backend's stop-and-finalize): cancel the rest
    // of the timeline and emit the table population's terminal summary + done immediately, so
    // a user stop reads as "finished early" with a real summary rather than just
    // freezing mid-fill.
    finalize() {
      if (cancelled) return;
      cancelled = true;
      tablePopulationFlows.delete(tablePopulationId);
      const summaryStep = steps.find((s) => s.kind === "review_summary");
      if (summaryStep && onReviewSummary) onReviewSummary(summaryStep.event);
      if (onDone) onDone({});
    },
  };
}

// openWorkbook fallback (e.g. restoring a finished analysis after reload). The
// live timeline is the primary path; this returns a fully-populated snapshot.
export async function mockGetTablePopulationWorkbook(tablePopulationId) {
  await delay(150);
  if (
    tablePopulationFlows.get(tablePopulationId) === "DW" ||
    tablePopulationSnapshots.get(tablePopulationId) === "DW"
  ) {
    return buildDiabetesWorklistPopulatedWorkbook();
  }
  return buildPopulatedWorkbookForTablePopulation(tablePopulationId);
}

export async function mockExecuteSql(query) {
  await delay(300);
  return resolveSql(query);
}

// --- Datasets (the data library) -------------------------------------------
// In-memory cohort filters. PATCH and add-filter re-derive deterministically:
// the predicate's bind value changes, the SQL recomposes (composeCohortSql), and
// the count re-runs (deriveDatasetCount) — no LLM, mirroring the real PATCH.

function findDataset(id) {
  const ds = mockDatasets.find((d) => d.id === id);
  if (!ds) throw new Error("Dataset not found.");
  return ds;
}

// Recompose each criterion's display (contract op symbols), the cohort SQL, and
// the count, then persist them and return a fresh clone so the UI never shares a
// reference with the store. Conforms to dataset.schema.json (schema_version "1").
function rederiveDataset(ds) {
  ds.schema_version = "1";
  ds.criteria = (ds.criteria || []).map((c) => ({
    ...c,
    display: datasetPredicateDisplay(c),
  }));
  ds.cohort_sql = composeCohortSql(ds);
  ds.count = deriveDatasetCount(ds);
  return cloneDataset(ds);
}

export async function mockListDatasets() {
  await delay(120);
  return mockDatasets.map((d) => ({
    id: d.id,
    name: d.name,
    databases: Array.isArray(d.databases) ? [...d.databases] : [],
    count: deriveDatasetCount(d),
  }));
}

export async function mockGetDatasetDetail(id) {
  await delay(150);
  return rederiveDataset(findDataset(id));
}

export async function mockCreateDataset(body) {
  await delay(200);
  const id = newId("ds");
  const ds = {
    schema_version: "1",
    id,
    name: (body?.name || suggestedDatasetName(body?.text)).trim(),
    description: body?.description || "",
    databases: Array.isArray(body?.databases) && body.databases.length ? [...body.databases] : ["cord-ph"],
    cohort: {
      database: (body?.databases && body.databases[0]) || "cord-ph",
      from: "records",
      identity_select: "DISTINCT records.patient_code",
      identity_keys: ["patient_code"],
    },
    criteria: [],
    not_available: [],
    count: 0,
  };
  mockDatasets = [ds, ...mockDatasets];
  return rederiveDataset(ds);
}

// Edit one filter's bind value → re-bind the predicate, regenerate its display,
// recompose the SQL clause's params, and re-run the count. Deterministic.
export async function mockPatchDatasetCriterion(id, criterionId, value) {
  await delay(150);
  const ds = findDataset(id);
  ds.criteria = ds.criteria.map((c) => {
    if (c.criterion_id !== criterionId) return c;
    const predicate = { ...c.predicate, value };
    const params = { ...c.params, [criterionId]: Array.isArray(value) ? value.join(",") : value };
    return { ...c, predicate, params };
  });
  return rederiveDataset(ds);
}

// Ground one free-text phrase. Deterministic stand-in for the LLM: a phrase that
// mentions a number lands as a new numeric chip + SQL clause; anything else is
// surfaced honestly as not_available (deferred), never invented.
export async function mockAddDatasetFilter(id, text) {
  await delay(250);
  const ds = findDataset(id);
  const phrase = String(text || "").trim();
  const num = /(-?\d+(?:\.\d+)?)/.exec(phrase);
  if (num) {
    const value = Number(num[1]);
    const slug = "f_" + (phrase.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24) || "filter");
    const criterionId = `${slug}_${ds.criteria.length + 1}`;
    const label = phrase.replace(/[<>=]+\s*-?\d+(?:\.\d+)?.*$/, "").trim() || phrase;
    ds.criteria = [
      ...ds.criteria,
      {
        criterion_id: criterionId,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        type: "number",
        source: `${ds.cohort.database} -> records.${slug}`,
        predicate: { op: /less|under|below|≤|<=/.test(phrase) ? "<=" : ">=", value },
        sql: `records.${slug} ${/less|under|below|≤|<=/.test(phrase) ? "<=" : ">="} :${criterionId}`,
        params: { [criterionId]: value },
      },
    ];
    return rederiveDataset(ds);
  }
  ds.not_available = [
    ...ds.not_available,
    { phrase, reason: DATASET_NOT_AVAILABLE_REASON },
  ];
  return rederiveDataset(ds);
}

export async function mockRenameDataset(id, name) {
  await delay(120);
  const ds = findDataset(id);
  ds.name = String(name || "").trim() || ds.name;
  return rederiveDataset(ds);
}

export async function mockRemoveDatasetCriterion(id, criterionId) {
  await delay(150);
  const ds = findDataset(id);
  ds.criteria = (ds.criteria || []).filter((c) => c.criterion_id !== criterionId);
  return rederiveDataset(ds);
}

export async function mockDeleteDataset(id) {
  await delay(120);
  mockDatasets = mockDatasets.filter((d) => d.id !== id);
  return {};
}

// --- Threads (the conversation surface) ------------------------------------
// In-memory mirror of the thread control plane. The real backend passes each
// message to the agent; mock mode mirrors the resulting shapes with canned agent
// outputs and the ask_user_question composer flow.

function nowIso() {
  return new Date().toISOString();
}

function findThread(id) {
  const t = mockThreads.find((x) => x.id === id);
  if (!t) throw new Error("Thread not found.");
  return t;
}

const openedThreads = new Map();

// The demo starts quiet: the seeded threads are history, not news — mark them
// opened up front so no "finished, unopened" dots sit in the sidebar before
// anything has happened this session.
for (const t of mockThreads) openedThreads.set(t.id, nowIso());

function markMockThreadOpened(id) {
  openedThreads.set(id, nowIso());
}

function threadOpened(thread) {
  if (thread.status === "running") return false;
  const openedAt = openedThreads.get(thread.id);
  return Boolean(openedAt && openedAt >= thread.updated_at);
}

function mintTableForThread(title, threadId) {
  const tablePopulationId = newId("mock");
  tablePopulationFlows.set(tablePopulationId, "TBL");
  const table = buildMockTable({
    id: "table-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12),
    title: title || "Table",
    sourceTemplate: "cord-ph",
    datasetId: null,
    tablePopulationId,
    threadId: threadId || null,
    now: nowIso(),
  });
  mockTables = [...mockTables, table];
  return table;
}

function normalizeThreadAttachments(attachments) {
  const normalized = [];
  const seen = new Set();
  for (const item of attachments || []) {
    const type = String(item?.type || "");
    const id = String(item?.id || "").trim();
    if (!["dataset", "template"].includes(type) || !id || seen.has(type)) continue;
    seen.add(type);
    normalized.push({ type, id });
  }
  return normalized;
}

function appendAgentReply(thread, content, attachments = []) {
  attachments = normalizeThreadAttachments(attachments);
  const isFirstUser = !thread.messages.some((m) => m.role === "user");
  const userMessage = {
    id: newMessageId(),
    role: "user",
    content,
    created_at: nowIso(),
  };
  if (attachments.length) userMessage.attachments = attachments;
  thread.messages.push(userMessage);
  if (isFirstUser) {
    thread.title = isDiabetesWorklistPrompt(content)
      ? THREAD_DEFAULT_TITLE
      : deriveThreadTitle(content);
  }
  const { message, resolution } = resolveThreadMessage(content);
  if (resolution.output === "table") {
    const table = mintTableForThread(deriveThreadTitle(content), thread.id);
    resolution.artifact_id = table.id;
    thread.artifact_ids = [...(thread.artifact_ids || []), table.id];
  }
  thread.messages.push({
    id: newMessageId(),
    role: "agent",
    content: message,
    created_at: nowIso(),
    resolution,
  });
  thread.updated_at = nowIso();
  thread.status = "complete";
}

function activitiesForAgentMessage(agent) {
  const request = agent?.resolution?.ask_user_questions;
  if (request?.id === DIABETES_WORKLIST_ASK_ID) {
    return CONTENT.diabetesWorklist.activities.initial.map((activity) => ({
      ...activity,
      kind: "tool",
    }));
  }
  return [
    {
      id: "mock-chat-query",
      label: CONTENT.diabetesWorklist.activities.genericQuery.label,
      headline: CONTENT.diabetesWorklist.activities.genericQuery.headline,
      kind: "tool",
    },
  ];
}

function answerDisplayText(request, answerList) {
  return answerList
    .map((answer) => {
      const question = request.questions?.find((q) => q.id === answer.question_id);
      const choice = question?.choices?.find((c) => c.id === answer.choice_id);
      const questionText = question?.question || answer.question_id || "Question";
      const responseText = answer.text || choice?.label || answer.choice_id || answer.status || "Answered";
      return `${questionText} ${responseText}`;
    })
    .join("\n");
}

function activitiesForQuestionFollowup(request, finalResolution) {
  if (request?.id === DIABETES_RISK_LIST_ASK_ID) {
    return [
      {
        id: "mock-diabetes-risk-list",
        label: CONTENT.diabetesWorklist.activities.riskList.label,
        headline: CONTENT.diabetesWorklist.activities.riskList.headline,
        kind: "tool",
      },
    ];
  }
  if (request?.id === DIABETES_WORKLIST_ASK_ID && finalResolution?.output === "table") {
    return CONTENT.diabetesWorklist.activities.table.map((activity) => ({
      ...activity,
      kind: "tool",
    }));
  }
  return [
    {
      id: "mock-question-followup",
      label: "Continuing from your answer",
      headline: "Preparing the follow-up response",
      kind: "tool",
    },
  ];
}

const DIABETES_INITIAL_ACTIVITY_DELAYS = [600, 4600, 5700, 8100, 5200, 5600];
const DIABETES_TABLE_ACTIVITY_DELAYS = [250, 300, 450];

async function streamActivities(activities, messageIndex, onEvent, delays = []) {
  for (let i = 0; i < activities.length; i += 1) {
    await pacedDelay(delays[i] ?? 80);
    onEvent({
      type: "chat_activity",
      messageIndex,
      activity: activities[i],
    });
  }
}

async function streamDelayedDiabetesThreadTitle(thread, onEvent) {
  await pacedDelay(1000);
  thread.title = DIABETES_DEMO_THREAD_TITLE;
  thread.updated_at = nowIso();
  onEvent({
    type: "thread_title",
    threadId: thread.id,
    title: thread.title,
    updated_at: thread.updated_at,
  });
}

async function streamMockChatContent(content, messageIndex, onEvent, options = {}) {
  const tokenDelay = options.tokenDelayMs ?? 5;
  const tokens = String(content || "").match(/\S+\s*/g) || [];
  let streamed = "";
  for (const token of tokens) {
    streamed += token;
    await pacedDelay(tokenDelay);
    onEvent({
      type: "chat_delta",
      messageIndex,
      content: streamed.trimEnd(),
    });
  }
}

export async function mockListThreads() {
  await delay(120);
  // Recency-ordered by updated_at DESC (list_summaries ordering).
  return mockThreads
    .map((t) => ({
      id: t.id,
      title: t.title,
      updated_at: t.updated_at,
      message_count: t.messages.length,
      status: t.status === "running" ? "running" : "complete",
      opened: threadOpened(t),
    }))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0));
}

export async function mockGetThread(id) {
  await delay(120);
  const thread = findThread(id);
  markMockThreadOpened(thread.id);
  return cloneJson(thread);
}

export async function mockCreateThread(body) {
  await delay(150);
  const now = nowIso();
  const thread = {
    schema_version: "1",
    id: "thread-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12),
    title: THREAD_DEFAULT_TITLE,
    created_at: now,
    updated_at: now,
    status: "complete",
    messages: [],
    artifact_ids: [],
  };
  const message = String(body?.message || "").trim();
  if (message) appendAgentReply(thread, message, body?.attachments);
  mockThreads = [...mockThreads, thread];
  return cloneJson(thread);
}

export async function mockPostThreadMessage(id, content, attachments = []) {
  await delay(150);
  const thread = findThread(id);
  appendAgentReply(thread, content, attachments);
  return cloneJson(thread);
}

export async function mockPostThreadMessageStream(
  id,
  content,
  onEvent = () => {},
  attachments = [],
) {
  await delay(60);
  const thread = findThread(id);
  appendAgentReply(thread, content, attachments);
  const agentIndex = thread.messages.length - 1;
  const agent = thread.messages[agentIndex];
  if (agent?.resolution?.output === "chat" && agent.content) {
    thread.status = "running";
    const activities = activitiesForAgentMessage(agent);
    agent.resolution.activity = activities;
    const streamingAgentResolution = { ...agent.resolution };
    delete streamingAgentResolution.ask_user_questions;
    onEvent({
      type: "thread_snapshot",
      thread: cloneJson({
        ...thread,
        messages: thread.messages.map((message, index) =>
          index === agentIndex
            ? {
                ...message,
                content: "",
                resolution: { ...streamingAgentResolution, activity: [] },
              }
            : message,
        ),
      }),
    });
    const isDiabetesWorklistAnswer =
      agent.resolution.ask_user_questions?.id === DIABETES_WORKLIST_ASK_ID;
    const delays = isDiabetesWorklistAnswer ? DIABETES_INITIAL_ACTIVITY_DELAYS : [];
    const titlePromise = isDiabetesWorklistAnswer
      ? streamDelayedDiabetesThreadTitle(thread, onEvent)
      : Promise.resolve();
    await streamActivities(activities, agentIndex, onEvent, delays);
    for (const citation of agent.resolution.citations || []) {
      onEvent({
        type: "chat_citation",
        messageIndex: agentIndex,
        citation: cloneJson(citation),
      });
    }
    await titlePromise;
    await streamMockChatContent(agent.content, agentIndex, onEvent, { tokenDelayMs: 12 });
  }
  thread.status = "complete";
  thread.updated_at = nowIso();
  const finalThread = cloneJson(thread);
  onEvent({ type: "done", thread: finalThread });
  return finalThread;
}

function applyMockQuestionAnswers(thread, answers, { finalAgentContent = true } = {}) {
  const pendingOffset = [...thread.messages]
    .reverse()
    .findIndex((m) => m?.resolution?.ask_user_questions?.status === "pending");
  if (pendingOffset < 0) throw new Error("No pending questions.");
  const realIndex = thread.messages.length - 1 - pendingOffset;
  const request = thread.messages[realIndex].resolution.ask_user_questions;
  const answerList = Array.isArray(answers) ? answers.map(cloneJson) : [];
  request.answers = answerList;
  request.status =
    answerList.length && answerList.every((a) => a.status === "skipped")
      ? "skipped"
      : "answered";
  let agentIndex = null;
  let finalMessage = "";
  let finalResolution = null;
  let activities = [];
  if (request.status === "answered") {
    thread.messages.push({
      role: "user",
      content: answerDisplayText(request, answerList),
      created_at: nowIso(),
    });
    const diabetesList = request.id === DIABETES_RISK_LIST_ASK_ID && answerList.some(
      (answer) =>
        answer.question_id === DIABETES_RISK_LIST_QUESTION_ID &&
        answer.choice_id === DIABETES_RISK_LIST_SHOW_CHOICE_ID,
    );
    const diabetesTable = request.id === DIABETES_WORKLIST_ASK_ID && answerList.some(
      (answer) =>
        answer.question_id === DIABETES_WORKLIST_QUESTION_ID &&
        answer.choice_id === DIABETES_WORKLIST_CREATE_CHOICE_ID,
    )
      ? createDiabetesWorklistTable(thread)
      : null;
    if (diabetesList) {
      finalMessage = DIABETES_PATIENT_RISK_LIST_ANSWER;
      finalResolution = {
        output: "chat",
        scope: wholeDbThreadScope(),
        artifact_id: null,
        seam: null,
        ask_user_questions: diabetesWorklistAskUserQuestionRequest(),
      };
    } else if (
      request.id === DIABETES_RISK_LIST_ASK_ID &&
      answerList.some((answer) => answer.choice_id === DIABETES_RISK_LIST_KEEP_CHOICE_ID)
    ) {
      finalMessage = CONTENT.diabetesWorklist.messages.keepRiskSummary;
      finalResolution = {
        output: "chat",
        scope: wholeDbThreadScope(),
        artifact_id: null,
        seam: null,
      };
    } else if (diabetesTable) {
      finalMessage = CONTENT.diabetesWorklist.messages.buildingTable;
      finalResolution = {
        output: "table",
        scope: wholeDbThreadScope(),
        artifact_id: diabetesTable.id,
        seam: null,
      };
    } else if (
      request.id === DIABETES_WORKLIST_ASK_ID &&
      answerList.some((answer) => answer.choice_id === DIABETES_WORKLIST_KEEP_CHOICE_ID)
    ) {
      finalMessage = CONTENT.diabetesWorklist.messages.keepChatAnswer;
      finalResolution = {
        output: "chat",
        scope: wholeDbThreadScope(),
        artifact_id: null,
        seam: null,
      };
    } else {
      const { message, resolution } = resolveThreadMessage("answered clarification");
      finalMessage = message;
      finalResolution = resolution;
    }
    activities = activitiesForQuestionFollowup(request, finalResolution);
    thread.messages.push({
      role: "agent",
      content: finalAgentContent ? finalMessage : "",
      created_at: nowIso(),
      resolution: finalAgentContent
        ? finalResolution
        : {
            output: finalResolution.output,
            scope: finalResolution.scope,
            artifact_id: finalResolution.artifact_id ?? null,
            seam: finalResolution.seam ?? null,
            activity: [],
          },
    });
    agentIndex = thread.messages.length - 1;
  }
  thread.updated_at = nowIso();
  thread.status = agentIndex === null ? "complete" : "running";
  return { thread, agentIndex, finalMessage, finalResolution, activities };
}

function wholeDbThreadScope() {
  return {
    kind: "whole_db",
    dataset_id: null,
    disclosure: THREAD_WHOLE_DB_DISCLOSURE,
  };
}

function createDiabetesWorklistTable(thread) {
  const tablePopulationId = newId("mock");
  tablePopulationFlows.set(tablePopulationId, "DW");
  tablePopulationSnapshots.set(tablePopulationId, "DW");
  const now = nowIso();
  const table = buildMockTable({
    id: "table-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12),
    title: DIABETES_WORKLIST_TABLE_TITLE,
    description: CONTENT.diabetesWorklist.tableDescription || "Focused paediatric diabetes reimbursement evidence table generated from the chat answer.",
    sourceTemplate: DIABETES_WORKLIST_SOURCE_TEMPLATE,
    datasetId: null,
    tablePopulationId,
    threadId: thread.id,
    now,
  });
  mockTables = [...mockTables, table];
  thread.artifact_ids = [...(thread.artifact_ids || []), table.id];
  return table;
}

export async function mockPostThreadQuestionAnswers(id, answers) {
  await delay(120);
  const thread = findThread(id);
  applyMockQuestionAnswers(thread, answers);
  thread.status = "complete";
  return cloneJson(thread);
}

export async function mockPostThreadQuestionAnswersStream(id, answers, onEvent = () => {}) {
  await delay(40);
  const thread = findThread(id);
  const { agentIndex, finalMessage, finalResolution, activities } = applyMockQuestionAnswers(
    thread,
    answers,
    { finalAgentContent: false },
  );
  if (finalResolution?.output === "table") {
    await pacedDelay(1000);
  }
  onEvent({ type: "thread_snapshot", thread: cloneJson(thread) });
  if (agentIndex !== null) {
    thread.messages[agentIndex].resolution.activity = activities;
    const delays = finalResolution?.output === "table" ? DIABETES_TABLE_ACTIVITY_DELAYS : [];
    await streamActivities(activities, agentIndex, onEvent, delays);
    for (const citation of finalResolution.citations || []) {
      onEvent({
        type: "chat_citation",
        messageIndex: agentIndex,
        citation: cloneJson(citation),
      });
    }
    await streamMockChatContent(finalMessage, agentIndex, onEvent, { tokenDelayMs: 12 });
    thread.messages[agentIndex].content = finalMessage;
    thread.messages[agentIndex].resolution = {
      ...finalResolution,
      activity: activities,
    };
    thread.updated_at = nowIso();
  }
  thread.status = "complete";
  const finalThread = cloneJson(thread);
  onEvent({ type: "done", thread: finalThread });
  return finalThread;
}

export async function mockRenameThread(id, title) {
  await delay(120);
  // Mirror the PATCH route: replace only the title (+ bump updated_at) and return
  // the full thread. 404s a missing thread (findThread throws) like the route.
  const thread = findThread(id);
  thread.title = title;
  thread.updated_at = nowIso();
  return cloneJson(thread);
}

export async function mockDeleteThread(id) {
  await delay(120);
  // The DELETE route 404s a missing thread; mirror that so the seam behaves the same.
  findThread(id);
  mockThreads = mockThreads.filter((t) => t.id !== id);
  openedThreads.delete(id);
  return {};
}

export async function mockMarkThreadOpened(id) {
  await delay(120);
  findThread(id);
  markMockThreadOpened(id);
}

// --- Tables (the populated audit table — a first-class re-openable entity) ---
// In-memory mirror of the FROZEN table control plane (table.schema.json). A table
// wraps an existing table population; the grid fills via the mock table-population stream.
// Minted directly via createTable. status mirrors the wrapped table population
// (mock keeps the stored status —
// the live inspector reads running→done from the populatedTables store, not from here).

function findTable(id) {
  const t = mockTables.find((x) => x.id === id);
  if (!t) throw new Error("Table not found.");
  return t;
}

// Per-user "seen" set: which tables this session has opened the full grid for.
// One mock session = one user, so this is a plain in-memory Set (resets on
// reload), mirroring the backend's per-user table_views store. Drives the
// `opened` flag the sidebar uses to suppress the blue "finished, unopened" dot.
const openedTables = new Set();

export async function mockListTables() {
  await delay(120);
  // Recency-ordered by updated_at DESC (list_summaries ordering).
  return mockTables
    .map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      source_template: t.source_template,
      reporting_period_label: t.reporting_period_label,
      status: t.status,
      updated_at: t.updated_at,
      opened: openedTables.has(t.id),
    }))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0));
}

// Mark a table opened for the (single mock) user. Idempotent — a Set add — and
// validates the table exists (mirrors the route's 404). Returns nothing (the
// real endpoint replies 204).
export async function mockMarkTableOpened(id) {
  await delay(120);
  findTable(id);
  openedTables.add(id);
}

// --- Resource grants & sharing (§10) ---------------------------------------
// In-memory mirror of the FROZEN grant control plane (server/routes/grants.py +
// clinicians.py). The mock owner is MOCK_USER ("mock-user"); the share-target
// directory is the seeded clinician accounts (excluding the owner / IT). Created
// grants land in shared-by-me; a small inbound set seeds shared-with-me so the
// backend contract stays exercised. Sharing is always editor ("manage"). Threads
// are NOT grantable (no thread share path exists). Resets on reload.

const MOCK_GRANT_OWNER = "mock-user";

// The clinical-staff directory (GET /api/clinicians) — display_name + id ONLY,
// no PID, no IAM. Mirrors the seeded clinician accounts a clinician can share to.
const MOCK_CLINICIANS = [
  { id: "mock-clin-1", display_name: "Dr Aanya Shah" },
  { id: "mock-clin-2", display_name: "Dr James Okafor" },
];

function clinicianName(subjectId) {
  const c = MOCK_CLINICIANS.find((x) => x.id === subjectId);
  return c ? c.display_name : subjectId;
}

// Grants this session's owner has made (drives shared-by-me + each resource's
// grantee list in the share dialog). Each is the full frozen grant row.
let mockGrantsByMe = [];

// Inbound grants TO this user (drives shared-with-me). Seeded so the backend
// contract stays exercised: a shared Dataset and a shared table template, each
// with a human label. (A received item appears in the recipient's normal
// library — there is no inbox surface in v2.)
let mockGrantsWithMe = [
  {
    grant_id: "grant-in-1",
    resource_type: "dataset",
    resource_id: "ds-cordph-nicu",
    grant_type: "read",
    expires_at: null,
    label: "Term babies admitted to NICU",
  },
  {
    grant_id: "grant-in-2",
    resource_type: "template",
    resource_id: "shared-tmpl-npda",
    grant_type: "run",
    expires_at: null,
    label: "NPDA local audit",
  },
];

export async function mockListClinicians() {
  await delay(120);
  return MOCK_CLINICIANS.map((c) => ({ ...c }));
}

export async function mockCreateGrant({ resourceType, resourceId, subjectId }) {
  await delay(150);
  const grant = {
    id: newId("grant"),
    resource_type: resourceType,
    resource_id: resourceId,
    subject_id: subjectId,
    // Sharing is always editor — the grant is fixed to "manage".
    grant_type: "manage",
    granted_by: MOCK_GRANT_OWNER,
    created_at: nowIso(),
    expires_at: null,
  };
  mockGrantsByMe = [...mockGrantsByMe, grant];
  return { ...grant };
}

export async function mockDeleteGrant(grantId) {
  await delay(120);
  // A grantee revokes an inbound grant (Remove) OR an owner revokes one they made;
  // the same DELETE drops it from whichever list holds it (mirrors the route's 204).
  mockGrantsByMe = mockGrantsByMe.filter((g) => g.id !== grantId);
  mockGrantsWithMe = mockGrantsWithMe.filter((g) => g.grant_id !== grantId);
}

export async function mockListSharedWithMe() {
  await delay(120);
  return mockGrantsWithMe.map((g) => ({ ...g }));
}

export async function mockListSharedByMe() {
  await delay(120);
  return mockGrantsByMe.map((g) => ({
    grant_id: g.id,
    resource_type: g.resource_type,
    resource_id: g.resource_id,
    label: g.resource_id,
    grant_type: g.grant_type,
    expires_at: g.expires_at,
    grantee: { subject_id: g.subject_id, display_name: clinicianName(g.subject_id) },
  }));
}

export async function mockGetTable(id) {
  await delay(120);
  return cloneJson(findTable(id));
}

// Create a table directly (no thread). Mirrors POST /api/tables: pins the spec +
// scope and spawns a table population (registered with a timeline so the stream fills it).
export async function mockCreateTable(body) {
  await delay(150);
  const sourceTemplate = body?.source_template || "cord-ph";
  // Mirror the backend: an ad-hoc table the template-backed engine can't populate
  // is pinned with NO wrapped table population (table_population_id=null / status="queued");
  // a template-backed table
  // wraps a table population registered with a timeline so the stream fills it.
  const isAdHoc = sourceTemplate === "ad-hoc";
  let tablePopulationId = null;
  if (!isAdHoc) {
    tablePopulationId = newId("mock");
    const flow = sourceTemplate === DIABETES_WORKLIST_SOURCE_TEMPLATE ? "DW" : "TBL";
    tablePopulationFlows.set(tablePopulationId, flow);
    if (flow === "DW") tablePopulationSnapshots.set(tablePopulationId, flow);
  }
  const now = nowIso();
  const table = buildMockTable({
    id: "table-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12),
    title: body?.title || "Untitled table",
    description: body?.description || "",
    sourceTemplate,
    datasetId: body?.dataset_id ?? null,
    tablePopulationId,
    threadId: body?.thread_id ?? null,
    now,
  });
  // A direct create may carry its own pinned spec; honor it when present.
  if (body?.spec && Array.isArray(body.spec.columns)) table.spec = body.spec;
  mockTables = [...mockTables, table];
  return cloneJson(table);
}

export async function mockRenameTable(id, title) {
  await delay(120);
  // Mirror the PATCH route: replace only the title (+ bump updated_at) and return
  // the full table. 404s a missing table (findTable throws) like the route.
  const table = findTable(id);
  table.title = title;
  table.updated_at = nowIso();
  return cloneJson(table);
}

export async function mockDeleteTable(id) {
  await delay(120);
  // The DELETE route 404s a missing table; mirror that so the seam behaves the same.
  findTable(id);
  mockTables = mockTables.filter((t) => t.id !== id);
  return {};
}
