// Front-end mock layer for the Intero demo (enabled with VITE_MOCK=true).
//
// This drives the WHOLE demo with no backend: the home analyses list, the
// EHR / Lab / Radiology databases, indexing-on-upload, the live-population run
// timeline, the workbook, and the SQL/note evidence. The data lives in
// mockData.js; this file wires it into the api/run layer and the indexing store.

import { indexingMap, flashing } from "../stores/indexing.js";
import { addToast } from "../stores/toasts.js";
import {
  MOCK_TEMPLATE,
  MOCK_ANALYSES,
  MOCK_DATABASES,
  buildTimeline,
  buildPopulatedWorkbookForRun,
  resolveSql,
} from "./mockData.js";
import { dispatchMockTimelineStep } from "./mockTimeline.js";
import { TEMPLATE_CATALOG } from "./templateCatalog.js";
import { CONTENT } from "./mock/content/index.js";
import { predicateDisplay } from "./auditDetailChips.js";

// Flatten the agent-side template catalog so Settings shows the same
// audits the agent proposes in the InputSpec / OutputSpec pickers.
const CATALOG_AUDITS = TEMPLATE_CATALOG.flatMap((group) =>
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
// seam). Domains mirror the contract: "audits", "databases", "runs", "sql",
// and "indexing" (the SSE stream consumed by stores/indexing.js). The run
// stream (stores/chat.js) belongs to "runs" so the whole run lifecycle —
// create, stream, workbook — flips together.
//
// Precedence (most specific wins):
//   1. VITE_MOCK_<DOMAIN>="true"/"false"  → that domain only
//   2. VITE_MOCK="true"                    → mock on  (e.g. `npm run dev:mock`)
//   3. VITE_MOCK="false"                   → mock off (force the real API)
//   4. unset                               → on in a prod build, off in `vite dev`
//
// Rule 4 is what keeps the deployed demo working: the Vercel build ships no
// `/api/runs` backend, so a production build with no VITE_MOCK must use the
// mock rather than POST to an endpoint that 404s ("Run failed"). Local
// `vite dev` still defaults to the real API proxied to :8000. Default: all mock.
//
// Pure resolver — takes the env explicitly so it can be unit-tested without
// `import.meta`. `domain` is optional; callers without a domain (e.g. the run
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

// --- In-memory state (resets on reload; the fixed scenario is always present)
// Five pre-loaded analyses decorate the home screen; Cord pH is NOT seeded —
// the user uploads it live (Flow A). Three ready databases mean the run card
// no longer auto-selects, so the user picks EHR on camera.
let mockTemplates = CATALOG_AUDITS.map((a) => ({ ...a }));
let mockDatabases = MOCK_DATABASES.map((d) => ({ ...d }));

// runId -> "A" | "B" | "C": which timeline a started run should play.
const runFlows = new Map();

function newId(prefix) {
  return prefix + "-" + crypto.randomUUID().slice(0, 8);
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

// --- Templates / audits -----------------------------------------------------
export async function mockListAudits() {
  return mockTemplates.map((t) => ({ id: t.id, name: t.name, description: t.description }));
}

export async function mockUploadAudit(file) {
  const id = newId("audit");
  const base = (file && file.name ? file.name : "Uploaded audit").replace(/\.[^.]+$/, "");
  const name = base || "Uploaded audit";
  mockTemplates = [
    ...mockTemplates,
    { id, name, description: "Uploaded template — indexing structure and field mappings.", defaultFilters: { ...MOCK_TEMPLATE.defaultFilters } },
  ];
  mockSimulateIndexing("audit", id, name);
  return { id, name };
}

export async function mockRenameAudit(id, name) {
  mockTemplates = mockTemplates.map((t) => (t.id === id ? { ...t, name } : t));
  return { id, name };
}

export async function mockDeleteAudit(id) {
  mockTemplates = mockTemplates.filter((t) => t.id !== id);
  return {};
}

export async function mockReindexAudit(id) {
  const t = mockTemplates.find((x) => x.id === id);
  if (t) mockSimulateIndexing("audit", id, t.name);
  return { id };
}

export async function mockGetAuditDetail(id) {
  const base = mockTemplates.find((t) => t.id === id);
  if (!base) throw new Error("Audit not found.");
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
    label: CONTENT.auditDetail.criteria.age.label,
    type: "number",
    predicate: { op: "gte", value: 18, unit: CONTENT.auditDetail.criteria.age.unit },
  };
  const admissionDateCriterion = {
    criterion_id: "admission_date",
    label: CONTENT.auditDetail.criteria.admissionDate.label,
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
        "mock-db": CONTENT.auditDetail.databaseSummary,
      },
      fields: mappingFields,
      criteria_bindings: [
        {
          criterion_id: "age_years",
          label: CONTENT.auditDetail.criteria.age.label,
          source: "mock-db -> patients.age_years",
          type: "number",
          join_path: "direct column on the anchor row (no join)",
          grain_rule: "the patient's record has an age in the implied range",
          from: "db_column",
        },
        {
          criterion_id: "admission_date",
          label: CONTENT.auditDetail.criteria.admissionDate.label,
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
export async function mockSaveAuditCriteria(id, fixedCriteria) {
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

// --- Run lifecycle ----------------------------------------------------------
export async function mockCreateRunFromTemplate(templateId, _filters) {
  await delay(300);
  const runId = newId("mock");
  // Each seeded dashboard plays its own dataset flow; every other template
  // plays the cord-pH Flow A.
  const flowByTemplate = {
    "npda-lo-audit": "C",
    "epilepsy12-lo-audit": "E",
    "nmtr-trauma-lo-audit": "T",
  };
  runFlows.set(runId, flowByTemplate[templateId] || "A");
  return { runId };
}

export async function mockCreateRunFromDescription(_prompt) {
  await delay(300);
  const runId = newId("mock");
  runFlows.set(runId, "B");
  return { runId };
}

// Play the run timeline, invoking the matching callback per step. Extends the
// callback model with onWorkbookCreated + onCellUpdate + onReviewSummary.
export function mockStartRunStream(
  runId,
  { onActivity, onWorkbookCreated, onCellUpdate, onReviewSummary, onDone, onError },
  options = {},
) {
  const flow = runFlows.get(runId) || "A";
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
          runFlows.delete(runId);
        }
      } catch (err) {
        onError && onError({ message: err.message });
        return;
      }
      next();
    }, step.wait);
  }

  next();
  return {
    close() {
      cancelled = true;
    },
    // Stop & finalize (mirrors the backend's stop-and-finalize): cancel the rest
    // of the timeline and emit the run's terminal summary + done immediately, so
    // a user stop reads as "finished early" with a real summary rather than just
    // freezing mid-fill.
    finalize() {
      if (cancelled) return;
      cancelled = true;
      runFlows.delete(runId);
      const summaryStep = steps.find((s) => s.kind === "review_summary");
      if (summaryStep && onReviewSummary) onReviewSummary(summaryStep.event);
      if (onDone) onDone({});
    },
  };
}

// openWorkbook fallback (e.g. restoring a finished analysis after reload). The
// live timeline is the primary path; this returns a fully-populated snapshot.
export async function mockGetWorkbook(runId) {
  await delay(150);
  return buildPopulatedWorkbookForRun(runId);
}

export async function mockExecuteSql(query) {
  await delay(300);
  return resolveSql(query);
}
