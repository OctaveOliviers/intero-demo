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

  // Flatten cohort chips → a { field: value, … } filters object.
  const filters = Object.fromEntries((spec.cohort || []).map((c) => [c.field, c.value]));

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
