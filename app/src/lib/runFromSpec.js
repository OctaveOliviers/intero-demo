// runFromSpec.js — the integration seam (SPEC §8).
//
// Hands a finished Task Contract (a JobSpec from spec.js) off to the existing,
// unchanged run pipeline. This replicates the run chain in `handleRun` from
// app/src/components/TemplateCard.svelte: it builds a synthetic audit target
// from the chosen output template, flattens the cohort chips into a filters
// object, posts the user message + contract into the Results conversation, and
// kicks off the run stream. In mock mode this streams the cord-pH activity +
// workbook regardless of the parsed template (see mockCreateRunFromTemplate in
// app/src/lib/mock.js).

import { isSubmitting, addMessage, startRunStream } from "../stores/chat.js";
import { startAudit, setAuditRunId, setAuditStatus, activeStream } from "../stores/audits.js";
import { goToResults } from "../stores/navigation.js";
import { AuthError, createRunFromAudit, listDatabases } from "./api.js";
import { isMockMode } from "./mock.js";
import { allTemplatesFlat, getTemplateById } from "./templateCatalog.js";

export function isTemplateIdAllowed(templateId, templates) {
  if (typeof templateId !== "string" || !templateId) return false;
  return (templates || []).some((t) => t.id === templateId);
}

export function pickDatabaseForRun(cohort, { mockDatabases, validDatabaseIds } = {}) {
  const dbChip = (cohort || []).find((c) => c.kind === "database");
  const selectedDatabase = dbChip?.raw || null;
  if (mockDatabases) return selectedDatabase;
  if (typeof selectedDatabase !== "string") return null;
  if (!(validDatabaseIds instanceof Set)) return null;
  return validDatabaseIds.has(selectedDatabase) ? selectedDatabase : null;
}

export function normalizeDatabaseValidationError(err) {
  if (err instanceof AuthError) throw err;
  return null;
}

// Demo-spec cohort fields → the mapping criterion the run engine binds them
// to (server _resolve_binding matches criterion_id / label / source column).
// The NPDA appointment window is the audit-year criterion on
// clinic_visits.visit_date.
const FILTER_KEY_BY_FIELD = { appointmentDate: "audit_year" };

// Criteria the runtime cannot apply yet: the cohort SELECT runs on the
// cohort's own database only (runs.py::_resolve_runtime_filter_predicates),
// and these bind to a column on a different bound database. The chip stays in
// the displayed contract; sending it as a filter would fail the whole run.
const DISPLAY_ONLY_FIELDS = new Set(["dateOfBirth"]);

// Flatten cohort chips → the { key: value, … } filters object POST /api/runs
// binds against the audit's criteria. Date chips that share a field carry a
// "to" connector on the second chip (one displayed range row) — merge them
// into a single "from to to" value instead of letting the later chip
// overwrite the earlier one. Prefer a chip's machine value (`raw`, ISO dates)
// over its display text.
export function filtersFromCohort(cohort) {
  const filters = {};
  for (const c of cohort || []) {
    if (!c?.field || DISPLAY_ONLY_FIELDS.has(c.field)) continue;
    const key = FILTER_KEY_BY_FIELD[c.field] || c.field;
    const value = c.raw ?? c.value;
    if (value == null || String(value).trim() === "") continue;
    if (c.connector === "to" && key in filters) {
      filters[key] = `${filters[key]} to ${value}`;
    } else {
      filters[key] = String(value);
    }
  }
  return filters;
}

// Plain multi-line string — messages render with white-space: pre-wrap, not
// markdown. Includes the original request, the
// cohort (label: value per line), the resolved count, and the output (summary
// + template file name).
export function buildContractMessage(spec) {
  const cohortLines = (spec.cohort || []).map((c) => `• ${c.label}: ${c.value}`);

  const template = getTemplateById(spec.output.templateChip.raw);
  const fileName = template ? template.fileName : spec.output.templateChip.value;

  return [
    spec.request,
    "",
    "Input — cohort",
    ...cohortLines,
    "",
    "Output",
    `• ${spec.output.summary} → ${fileName}`,
  ].join("\n");
}

export async function runFromSpec(spec) {
  // Build a synthetic audit target from the chosen output template.
  const outputTemplate = getTemplateById(spec.output.templateChip.raw);
  const runTarget = {
    id: spec.output.templateChip.raw,
    name: spec.output.summary,
    submissionDeadline: outputTemplate?.submissionDeadline || null,
  };
  if (!isMockMode("runs")) {
    const id = runTarget.id;
    const existsInActiveCatalog = isTemplateIdAllowed(id, allTemplatesFlat());
    if (!existsInActiveCatalog) {
      throw new Error("Select a backend audit template before running.");
    }
  }

  const filters = filtersFromCohort(spec.cohort);

  let selectedDatabase = pickDatabaseForRun(spec.cohort, {
    mockDatabases: isMockMode("databases"),
  });
  if (!isMockMode("databases")) {
    // Real mode: only forward database if it is a known backend DB id.
    try {
      const dbs = await listDatabases();
      const validIds = new Set((dbs || []).map((d) => d.id));
      selectedDatabase = pickDatabaseForRun(spec.cohort, {
        mockDatabases: false,
        validDatabaseIds: validIds,
      });
    } catch (err) {
      selectedDatabase = normalizeDatabaseValidationError(err);
    }
  }

  isSubmitting.set(true);
  let histId = null;
  try {
    histId = startAudit(runTarget, filters, spec.cohort || []);
    goToResults();
    addMessage({
      role: "user",
      type: "text",
      content: buildContractMessage(spec),
    });
    const data = await createRunFromAudit(runTarget.id, filters, selectedDatabase);
    setAuditRunId(histId, data.runId);
    startRunStream(data.runId, histId);
  } catch (err) {
    addMessage({ role: "assistant", type: "text", content: "Run failed: " + err.message });
    if (histId) setAuditStatus(histId, "error");
    activeStream.set(null);
    isSubmitting.set(false);
  }
}
