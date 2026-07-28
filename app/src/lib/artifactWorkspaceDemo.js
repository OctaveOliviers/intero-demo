// Every human-readable string comes from the locale content pack; this module
// keeps only the invariants (ids, ISO dates, numbers, TNM strings, UICC stage
// groups, Annexe 55 code NUMBERS, ECOG scores, lab values, SQL) and composes
// each displayed value from a translatable name in AW + the invariant token here.
import { CONTENT } from "./mock/content/index.js";

const AW = CONTENT.artifactWorkspace;
// Coded-value formatter: `name (code NN)` — name localised, number invariant.
const coded = AW.coded;

export const ARTIFACT_WORKSPACE_STATES = Object.freeze({
  ARTIFACT_CLOSED: "artifact_closed",
  CHAT_AND_ARTIFACT: "chat_and_artifact",
  ARTIFACT_EXPANDED: "artifact_expanded",
});

export const ARTIFACT_WORKSPACE_THREAD_ID = "thread-lung-moc-prep";
export const LUNG_MOC_TEMPLATE_NAME = AW.templateName;
export const LUNG_MOC_TABLE_ID = "lung-moc";
export const LUNG_MOC_ARTIFACT_ID = "lung-moc-table";
export const MOC_DATE = "2026-07-10";
export const TODAY_DATE = "2026-07-09";

function demoResult(columns, rows) {
  return {
    columns,
    rows,
    rowCount: rows.length,
    durationMs: 4,
  };
}

// cellClass: "direct" (structured field, neutral), "interpreted" (free-text
// extraction, amber until reviewed via reviewCell). Conflicting fields override
// their own class to "conflict" (red) until the clinician edits the value.
// `kind` drives the form control: "value" is a one-line input, "prose" a
// multi-line box. Ids are unchanged from the table era so every cell ref,
// evidence key and follow-up anchor keeps working.
export const lungMocColumns = [
  { id: "patient", title: AW.columns.patient, cellClass: "direct", kind: "value" },
  { id: "histology", title: AW.columns.histology, cellClass: "direct", kind: "value" },
  { id: "baseOfDiagnosis", title: AW.provenance.labels.baseOfDiagnosis, cellClass: "direct", kind: "value" },
  { id: "localisation", title: AW.provenance.labels.localisationLaterality, cellClass: "direct", kind: "value" },
  { id: "differentiation", title: AW.provenance.labels.differentiationGrade, cellClass: "direct", kind: "value" },
  { id: "tnm", title: AW.columns.tnm, cellClass: "direct", kind: "value" },
  { id: "stage", title: AW.columns.stage, cellClass: "interpreted", kind: "value" },
  { id: "biopsy", title: AW.provenance.labels.biopsy, cellClass: "direct", kind: "value" },
  { id: "petct", title: AW.provenance.labels.petct, cellClass: "direct", kind: "value" },
  { id: "ecog", title: AW.columns.ecog, cellClass: "interpreted", kind: "value" },
  { id: "pdl1", title: AW.columns.pdl1, cellClass: "direct", kind: "value" },
  { id: "egfr", title: AW.columns.egfr, cellClass: "direct", kind: "value" },
  { id: "ngs", title: AW.columns.ngs, cellClass: "direct", kind: "value" },
  { id: "previousTreatment", title: AW.columns.previousTreatment, cellClass: "interpreted", kind: "prose" },
  { id: "treatment", title: AW.columns.treatment, cellClass: "interpreted", kind: "prose" },
  { id: "mocNotes", title: AW.columns.mocNotes, cellClass: "interpreted", kind: "prose" },
];

// The form's render order: sections top to bottom, fields within each. Patient
// is the page title, not a field, so it appears in no section.
export const FORM_SECTIONS = [
  { key: "diagnosis", title: AW.sections.diagnosis, fieldIds: ["histology", "baseOfDiagnosis", "localisation", "differentiation"] },
  { key: "staging", title: AW.sections.staging, fieldIds: ["tnm", "stage", "biopsy", "petct"] },
  { key: "performance", title: AW.sections.performance, fieldIds: ["ecog"] },
  { key: "molecular", title: AW.sections.molecular, fieldIds: ["pdl1", "egfr", "ngs"] },
  { key: "treatment", title: AW.sections.treatment, fieldIds: ["previousTreatment", "treatment"] },
  { key: "moc", title: AW.sections.moc, fieldIds: ["mocNotes"] },
];

// Each displayed value is composed from a translatable name in the pack plus the
// invariant token here: histology names (AW.histology), ECOG label+score
// (AW.ecog.scored, score invariant), coded treatments (coded(name, code)), and
// prose/mixed values (AW.values, code numbers/percentages/genomic tokens invariant).
// TNM strings, UICC stage groups and percentages stay verbatim.
export const lungMocRows = [
  {
    id: "L-3401",
    patient: "L-3401",
    histology: AW.histology.adenocarcinoma,
    ecog: AW.ecog.scored(AW.ecog.ambulatory, 1),
    tnm: "cT2 cN3 cM1b",
    stage: "IVA",
    pdl1: "80%",
    egfr: AW.values.negative,
    ngs: AW.values.completeWith("KRAS G12C"),
    // Progressed on first-line chemo-immunotherapy; the next line is the
    // meeting's job, so the fact half stops at "stopped".
    treatment: coded(AW.treatment.stoppedAtProgression, 90),
    mocNotes: "",
  },
  {
    id: "L-3402",
    patient: "L-3402",
    histology: AW.histology.adenocarcinoma,
    ecog: AW.ecog.scored(AW.ecog.ambulatory, 1),
    tnm: "cT4 cN2 cM0",
    stage: "IIIB",
    pdl1: AW.values.missing,
    egfr: AW.values.negative,
    ngs: AW.values.pending,
    // The completed chemo-RT is now a Previous treatment; what is left here is
    // exactly the gap the opening flags.
    treatment: `${coded(AW.treatment.noConsolidationImmunotherapy, 60)} ${AW.treatment.documented}`,
    mocNotes: "",
  },
  {
    id: "L-3403",
    patient: "L-3403",
    histology: AW.histology.squamousCell,
    ecog: AW.ecog.scored(AW.ecog.ambulatory, 1),
    tnm: "cT2 cN0 cM1a",
    stage: "IVA",
    pdl1: "45%",
    egfr: AW.values.naSquamous,
    ngs: AW.values.complete,
    treatment: coded(AW.treatment.carboPaclitaxelPembrolizumab, 66),
    mocNotes: "",
  },
  {
    id: "L-3404",
    patient: "L-3404",
    histology: AW.histology.adenocarcinoma,
    ecog: AW.ecog.scored(AW.ecog.fullyActive, 0),
    tnm: "cT2 cN2 cM1c",
    stage: "IVB",
    pdl1: AW.values.conflicting("60%", "10%"),
    egfr: AW.values.positiveWith("exon 19 del"),
    ngs: AW.values.complete,
    treatment: coded(AW.treatment.osimertinibStarted, 45),
    mocNotes: "",
  },
  {
    id: "L-3405",
    patient: "L-3405",
    histology: AW.histology.adenocarcinoma,
    ecog: AW.ecog.scored(AW.ecog.fullyActive, 0),
    tnm: "pT1b pN0 cM0",
    stage: "IA",
    pdl1: AW.values.naEarlyStage,
    egfr: AW.values.na,
    ngs: AW.values.na,
    treatment: coded(AW.treatment.surgeryPlanned, 10),
    mocNotes: "",
  },
  {
    id: "L-3406",
    patient: "L-3406",
    histology: AW.histology.nsclcNos,
    ecog: AW.ecog.scored(AW.ecog.selfCareOnly, 2),
    tnm: "cT3 cN2 cM0",
    stage: "IIIA",
    pdl1: AW.values.pending,
    egfr: AW.values.pending,
    ngs: AW.values.insufficientTissue,
    treatment: coded(AW.treatment.notYetStarted, 90),
    mocNotes: "",
  },
  {
    id: "L-3407",
    patient: "L-3407",
    histology: AW.histology.adenocarcinoma,
    ecog: AW.ecog.scored(AW.ecog.ambulatory, 1),
    tnm: "cT2 cN2 cM1c",
    stage: "IVB",
    pdl1: "92%",
    egfr: AW.values.negative,
    ngs: AW.values.completeWith("ALK+"),
    treatment: coded(`${AW.treatment.alectinibStarted} 2026-05-30`, 45),
    mocNotes: "",
  },
  {
    id: "L-3408",
    patient: "L-3408",
    histology: AW.histology.adenocarcinoma,
    ecog: AW.ecog.scored(AW.ecog.ambulatory, 1),
    tnm: "cT4 cN2 cM0",
    stage: "IIIB",
    pdl1: "70%",
    egfr: AW.values.negative,
    ngs: AW.values.complete,
    treatment: coded(AW.treatment.concurrentChemoRtOngoing, 25),
    mocNotes: "",
  },
  {
    id: "L-3409",
    patient: "L-3409",
    histology: AW.histology.smallCellSclc,
    ecog: AW.ecog.scored(AW.ecog.ambulatory, 1),
    tnm: "cT3 cN3 cM1c",
    stage: AW.stage.extensive,
    pdl1: AW.values.naSclc,
    egfr: AW.values.na,
    ngs: AW.values.na,
    treatment: coded(AW.treatment.carboEtoposideAtezolizumabRechallenge, 66),
    mocNotes: "",
  },
];

// The Annexe 55 registration fields (2, 4, 5, 7) plus the biopsy/PET-CT dates,
// folded into each patient's record as ordinary form fields (see lungMocRecords).
// Base of diagnosis is Histology of primary (code 2) throughout except L-3403
// (pleural cytology → code 4). Localisation, laterality and differentiation are
// derived from each patient's note narrative where the spec does not fix them.
const P = AW.provenance;
// Localisation `{lobe} · {laterality (code n)}` and coded fields are composed from
// pack names + invariant codes/dates; the code NUMBERS and dates stay here.
const histologyOfPrimary = coded(P.baseOfDiagnosis.histologyOfPrimary, 2);
const moderatelyDifferentiated = coded(P.differentiation.moderately, 2);
const rightLaterality = coded(P.laterality.right, 2);
const leftLaterality = coded(P.laterality.left, 1);

export const demoHistologyProvenance = {
  "L-3401": {
    baseOfDiagnosis: histologyOfPrimary,
    localisation: P.localisation(P.lobes.rightUpperLobe, rightLaterality),
    differentiation: moderatelyDifferentiated,
    biopsy: P.biopsyValue("2026-06-02", P.biopsyProcedures.ctGuidedLung),
    petct: "2026-06-10",
  },
  "L-3402": {
    baseOfDiagnosis: histologyOfPrimary,
    localisation: P.localisation(P.lobes.leftUpperLobe, leftLaterality),
    differentiation: moderatelyDifferentiated,
    biopsy: P.biopsyValue("2026-06-05", P.biopsyProcedures.bronchoscopy),
    petct: "2026-06-12",
  },
  "L-3403": {
    baseOfDiagnosis: coded(P.baseOfDiagnosis.cytology, 4),
    localisation: P.localisation(P.lobes.leftLowerLobe, leftLaterality),
    differentiation: moderatelyDifferentiated,
    biopsy: P.biopsyValue("2026-05-28", P.biopsyProcedures.pleural),
    petct: "2026-06-01",
  },
  "L-3404": {
    baseOfDiagnosis: histologyOfPrimary,
    localisation: P.localisation(P.lobes.rightLowerLobe, rightLaterality),
    differentiation: moderatelyDifferentiated,
    biopsy: P.biopsyValue("2026-06-08", P.biopsyProcedures.ctGuidedLung),
    petct: "2026-06-13",
  },
  "L-3405": {
    baseOfDiagnosis: histologyOfPrimary,
    localisation: P.localisation(P.lobes.rightUpperLobe, rightLaterality),
    differentiation: coded(P.differentiation.well, 1),
    biopsy: P.biopsyValue("2026-06-01", P.biopsyProcedures.vatsWedge),
    petct: "2026-06-06",
  },
  "L-3406": {
    baseOfDiagnosis: histologyOfPrimary,
    localisation: P.localisation(P.lobes.rightUpperLobe, rightLaterality),
    differentiation: coded(P.differentiation.unknown, 9),
    biopsy: P.biopsyValue("2026-06-09", P.biopsyProcedures.bronchoscopy),
    petct: "2026-06-11",
  },
  "L-3407": {
    baseOfDiagnosis: histologyOfPrimary,
    localisation: P.localisation(P.lobes.leftUpperLobe, leftLaterality),
    differentiation: moderatelyDifferentiated,
    biopsy: P.biopsyValue("2026-05-20", P.biopsyProcedures.ctGuidedLung),
    petct: "2026-05-25",
  },
  "L-3408": {
    baseOfDiagnosis: histologyOfPrimary,
    localisation: P.localisation(P.lobes.rightLowerLobe, rightLaterality),
    differentiation: moderatelyDifferentiated,
    biopsy: P.biopsyValue("2026-04-15", P.biopsyProcedures.bronchoscopy),
    petct: "2026-04-18",
  },
  "L-3409": {
    baseOfDiagnosis: histologyOfPrimary,
    localisation: P.localisation(P.lobes.leftUpperLobe, leftLaterality),
    differentiation: coded(P.differentiation.poorly, 3),
    biopsy: P.biopsyValue("2026-06-07", P.biopsyProcedures.bronchoscopy),
    petct: "2026-06-09",
  },
};

// --- Previous treatments ----------------------------------------------------
//
// One prose line per prior treatment, composed as `{ISO date} — {name}` with the
// name localised and the dates / cycle counts / doses / code numbers invariant.
// Three patients carry a real history: L-3401 progressed on first-line
// chemo-immunotherapy (which is what makes its KRAS G12C actionable), L-3402's
// completed chemo-RT moves here (leaving Current treatment undocumented — the
// gap the opening flags), and L-3409 relapsed after a >6-month platinum-free
// interval (which is what makes its current line a re-challenge). The other six
// are treatment-naive; their absence is still sourced, to a record review.
const PT = AW.priorTreatment;
const priorLine = (date, text) => `${date} — ${text}`;
const RECORD_REVIEW_SOURCE = (rowId) => `${rowId}-record-review`;

export const demoPriorTreatments = {
  "L-3401": {
    lines: [
      priorLine("2025-11-12", coded(PT.carboPemetrexedPembrolizumab(4), 66)),
      priorLine("2026-03-04", coded(PT.pemetrexedPembrolizumabMaintenance, 60)),
      priorLine("2026-05-28", PT.progressionSystemicStopped),
    ],
    sourceIds: ["l3401-oncology-note-2025-11-12", "l3401-radiology-note-2026-05-28"],
  },
  "L-3402": {
    lines: [priorLine("2026-06-20", coded(PT.concurrentChemoRtCompleted("60 Gy", 30), 25))],
    sourceIds: ["l3402-radiation-oncology-note-2026-06-20"],
  },
  "L-3409": {
    lines: [
      priorLine("2025-08-14", coded(PT.carboEtoposideAtezolizumab(4), 66)),
      priorLine("2025-11-28", coded(PT.atezolizumabMaintenance, 60)),
      priorLine("2026-06-02", PT.progressionPlatinumFreeInterval(6)),
    ],
    sourceIds: ["l3409-oncology-note-2025-08-14", "l3409-radiology-note-2026-06-02"],
  },
};

function priorTreatmentFor(rowId) {
  return demoPriorTreatments[rowId] ?? { lines: [PT.none], sourceIds: [RECORD_REVIEW_SOURCE(rowId)] };
}

// The Annexe 55 registration fields that used to live only inside the histology
// cell's evidence block are ordinary fields on the record now; fold them in from
// the provenance fixture rather than duplicating them.
export const lungMocRecords = lungMocRows.map((row) => {
  const provenance = demoHistologyProvenance[row.id];
  return {
    ...row,
    baseOfDiagnosis: provenance.baseOfDiagnosis,
    localisation: provenance.localisation,
    differentiation: provenance.differentiation,
    biopsy: provenance.biopsy,
    petct: provenance.petct,
    previousTreatment: priorTreatmentFor(row.id).lines.join("\n"),
  };
});

export const demoArtifacts = [
  {
    id: LUNG_MOC_ARTIFACT_ID,
    kind: "table",
    title: AW.artifactTitle,
    tableId: LUNG_MOC_TABLE_ID,
    columns: lungMocColumns,
    rows: lungMocRecords,
  },
];

// The session's view over the static artifact fixtures: rename/delete/pin are
// state (three-dot menu on the tray rows), never mutations of the fixtures.
// `pinned` here drives the sidebar's PINNED ARTIFACTS section — an artifact is
// pinned only when the doctor pins it, never automatically.
export function visibleDemoArtifacts(state) {
  return demoArtifacts
    .filter((artifact) => !(state.removedArtifactIds || []).includes(artifact.id))
    .map((artifact) => ({
      ...artifact,
      title: state.artifactTitleOverrides?.[artifact.id] ?? artifact.title,
      pinned: (state.pinnedArtifactIds || []).includes(artifact.id),
    }));
}

export function togglePinArtifact(state, artifactId) {
  const pinned = state.pinnedArtifactIds || [];
  return {
    ...state,
    pinnedArtifactIds: pinned.includes(artifactId)
      ? pinned.filter((id) => id !== artifactId)
      : [...pinned, artifactId],
  };
}

export function renameArtifact(state, artifactId, title) {
  const next = String(title || "").trim();
  if (!next) return state;
  return {
    ...state,
    artifactTitleOverrides: { ...(state.artifactTitleOverrides || {}), [artifactId]: next },
  };
}

// Deleting also closes the artifact's tab (if open) and drops its pin.
export function removeArtifact(state, artifactId) {
  const closed = state.tabs.some((tab) => tab.id === artifactId)
    ? closeTab(state, artifactId)
    : state;
  return {
    ...closed,
    removedArtifactIds: [...(state.removedArtifactIds || []), artifactId],
    pinnedArtifactIds: (state.pinnedArtifactIds || []).filter((id) => id !== artifactId),
  };
}

// The two-line attention list shown inline in the opening chat turn.
export const demoAttentionItems = [
  {
    id: "attention-l3402",
    rowId: "L-3402",
    columnId: "treatment",
    severity: "warning",
    flag: AW.attention.flagMissing,
    label: AW.attention.l3402Label("L-3402", "IIIB"),
    detail: AW.attention.l3402Detail(25, "2026-06-20", 60),
  },
  {
    id: "attention-l3404",
    rowId: "L-3404",
    columnId: "pdl1",
    severity: "danger",
    flag: AW.attention.flagConflicting,
    label: AW.attention.l3404Label("L-3404", "IVB"),
    detail: AW.attention.l3404Detail("60%", "10%"),
  },
];

const cellRefId = (tableId, rowId, columnId) => `cell:${tableId}:${rowId}:${columnId}`;

// Conflict definitions: two sources per conflicting cell. Both stay visible
// in the evidence panel forever; resolving one just marks which is accepted.
export const demoConflicts = {
  [cellRefId(LUNG_MOC_TABLE_ID, "L-3404", "pdl1")]: {
    rowId: "L-3404",
    columnId: "pdl1",
    sources: [
      {
        id: "pathology",
        label: AW.noteLabels.pathologyReport,
        date: "2026-06-09",
        value: "60%",
        quotes: AW.conflict.pdl1.pathology.quotes,
        body: AW.conflict.pdl1.pathology.body,
      },
      {
        id: "reread",
        label: AW.noteLabels.molecularPathologyReread,
        date: "2026-06-14",
        value: "10%",
        quotes: AW.conflict.pdl1.reread.quotes,
        body: AW.conflict.pdl1.reread.body,
      },
    ],
  },
};

// The clinical note behind every interpreted (yellow) cell, keyed
// "rowId:columnId". Clicking the cell shows THIS note as the evidence result,
// with `quotes` (verbatim substrings of `body`) highlighted — mirroring the
// product's note-backed extraction. The cell stays needs-review (yellow) until
// the doctor has dwelt on its evidence for 2s (reviewCell), then settles white.
// Note label (-> AW.noteLabels) and date stay in logic; the quotes/body prose is
// read from the pack (AW.interpretedNotes) keyed by the same "rowId:columnId".
const INTERPRETED_NOTE_META = {
  "L-3401:ecog": { label: AW.noteLabels.oncologyConsult, date: "2026-06-12" },
  "L-3401:stage": { label: AW.noteLabels.oncologyConsult, date: "2026-06-12" },
  "L-3401:treatment": { label: AW.noteLabels.oncologyTreatment, date: "2026-06-20" },
  "L-3402:ecog": { label: AW.noteLabels.mdtOutcome, date: "2026-06-01" },
  "L-3402:stage": { label: AW.noteLabels.mdtOutcome, date: "2026-06-01" },
  "L-3402:treatment": { label: AW.noteLabels.radiationOncologyCompletion, date: "2026-06-20" },
  "L-3403:ecog": { label: AW.noteLabels.oncologyConsult, date: "2026-06-03" },
  "L-3403:stage": { label: AW.noteLabels.oncologyConsult, date: "2026-06-03" },
  "L-3403:treatment": { label: AW.noteLabels.oncologyTreatment, date: "2026-06-24" },
  "L-3404:ecog": { label: AW.noteLabels.oncologyConsult, date: "2026-06-16" },
  "L-3404:stage": { label: AW.noteLabels.oncologyConsult, date: "2026-06-16" },
  "L-3404:treatment": { label: AW.noteLabels.oncologyTreatment, date: "2026-06-18" },
  "L-3405:ecog": { label: AW.noteLabels.mdtOutcome, date: "2026-06-08" },
  "L-3405:stage": { label: AW.noteLabels.mdtOutcome, date: "2026-06-08" },
  "L-3405:treatment": { label: AW.noteLabels.thoracicSurgeryClinic, date: "2026-06-22" },
  "L-3406:ecog": { label: AW.noteLabels.mdtOutcome, date: "2026-06-13" },
  "L-3406:stage": { label: AW.noteLabels.mdtOutcome, date: "2026-06-13" },
  "L-3406:treatment": { label: AW.noteLabels.oncologyClinic, date: "2026-06-25" },
  "L-3407:ecog": { label: AW.noteLabels.oncologyConsult, date: "2026-05-27" },
  "L-3407:stage": { label: AW.noteLabels.oncologyConsult, date: "2026-05-27" },
  "L-3407:treatment": { label: AW.noteLabels.oncologyTreatment, date: "2026-05-30" },
  "L-3408:ecog": { label: AW.noteLabels.mdtOutcome, date: "2026-04-22" },
  "L-3408:stage": { label: AW.noteLabels.mdtOutcome, date: "2026-04-22" },
  "L-3408:treatment": { label: AW.noteLabels.radiationOncologyProgress, date: "2026-07-06" },
  "L-3409:ecog": { label: AW.noteLabels.oncologyConsult, date: "2026-06-11" },
  "L-3409:stage": { label: AW.noteLabels.oncologyConsult, date: "2026-06-11" },
  "L-3409:treatment": { label: AW.noteLabels.oncologyTreatment, date: "2026-06-15" },
};

export const demoInterpretedNotes = Object.fromEntries(
  Object.entries(INTERPRETED_NOTE_META).map(([key, meta]) => [
    key,
    { label: meta.label, date: meta.date, quotes: AW.interpretedNotes[key].quotes, body: AW.interpretedNotes[key].body },
  ]),
);

// Sourced facts used by Follow-up A (past similar cases). L-2894 and L-3011
// are not rows in the main table — they exist only as cited precedent here
// and in the MOC Notes entry that gets written for L-3402.
// Situation/fact prose and source bodies come from the pack; the stage groups,
// ids, dates and day/week counts stay here and are interpolated in.
const PR = AW.precedent;
export const demoPrecedentCases = [
  {
    patientId: "L-2894",
    mocDate: "2026-04-11",
    situation: PR.l2894Situation("IIIB", "L-3402"),
    facts: [
      {
        id: "l2894-action",
        text: PR.l2894Action(18),
        source: {
          id: "l2894-oncology-note-2026-04-29",
          label: AW.noteLabels.oncologyNote,
          date: "2026-04-29",
          quotes: PR.sources.l2894Action.quotes,
          body: PR.sources.l2894Action.body,
        },
      },
      {
        id: "l2894-outcome",
        text: PR.l2894Outcome(7),
        source: {
          id: "l2894-oncology-note-2026-06-15",
          label: AW.noteLabels.oncologyFollowUp,
          date: "2026-06-15",
          quotes: PR.sources.l2894Outcome.quotes,
          body: PR.sources.l2894Outcome.body,
        },
      },
    ],
  },
  {
    patientId: "L-3011",
    mocDate: "2026-05-02",
    situation: PR.l3011Situation("IIIA"),
    facts: [
      {
        id: "l3011-action",
        text: PR.l3011Action,
        source: {
          id: "l3011-oncology-note-2026-05-06",
          label: AW.noteLabels.oncologyNote,
          date: "2026-05-06",
          quotes: PR.sources.l3011Action.quotes,
          body: PR.sources.l3011Action.body,
        },
      },
      {
        id: "l3011-outcome",
        text: PR.l3011Outcome(6),
        source: {
          id: "l3011-radiology-note-2026-06-20",
          label: AW.noteLabels.radiologyNote,
          date: "2026-06-20",
          quotes: PR.sources.l3011Outcome.quotes,
          body: PR.sources.l3011Outcome.body,
        },
      },
    ],
  },
];

// Follow-up A: doctor asks about L-3402, agent cites the precedent cases
// above, then offers to write a note into L-3402's MOC Notes cell.
export const followUpA = {
  id: "followup-a",
  anchorRowId: "L-3402",
  anchorColumnId: "treatment",
  // Keyword match (case-insensitive substring). Stems chosen to survive
  // inflection: "simila" catches EN "similar" + FR "similaire(s)";
  // "vergelijkb" catches NL "vergelijkbaar/vergelijkbare"; "ähnlich" + the
  // unaccented "ahnlich" catch DE "ähnlich(e/en)".
  triggerTerms: ["simila", "vergelijkb", "ähnlich", "ahnlich"],
  activity: AW.followUps.a.activity,
  prompt: AW.followUps.a.prompt,
  reply: AW.followUps.a.reply(2),
  cases: demoPrecedentCases,
  noteRowId: "L-3402",
  noteText: AW.followUps.a.noteText(2, "L-2894", 18, 7, "L-3011", 6),
  noteSourceIds: ["l2894-oncology-note-2026-04-29", "l2894-oncology-note-2026-06-15", "l3011-oncology-note-2026-05-06", "l3011-radiology-note-2026-06-20"],
};

// Follow-up B: doctor asks about L-3407's response to Alectinib. Three brain
// MRI reports back two charts; each chart point opens its own report.
// Per-scan label and the report quotes/body come from the pack; the ids, ISO
// dates, short date labels, week counts, measurements and lesion counts stay here.
export const demoBrainMriScans = [
  {
    id: "l3407-mri-2026-05-26",
    date: "2026-05-26",
    short: AW.mri.scans.baseline.short,
    label: AW.mri.labelBaseline,
    burdenPct: 100,
    lesionCount: 3,
    quotes: AW.mri.scans.baseline.quotes,
    body: AW.mri.scans.baseline.body,
  },
  {
    id: "l3407-mri-2026-06-16",
    date: "2026-06-16",
    short: AW.mri.scans.interim.short,
    label: AW.mri.labelInterim(3),
    burdenPct: 65,
    lesionCount: 3,
    quotes: AW.mri.scans.interim.quotes,
    body: AW.mri.scans.interim.body,
  },
  {
    id: "l3407-mri-2026-07-05",
    date: "2026-07-05",
    short: AW.mri.scans.latest.short,
    label: AW.mri.labelLatest(5),
    burdenPct: 35,
    lesionCount: 2,
    quotes: AW.mri.scans.latest.quotes,
    body: AW.mri.scans.latest.body,
  },
];

export const followUpB = {
  id: "followup-b",
  anchorRowId: "L-3407",
  anchorColumnId: "treatment",
  // DE uses "spricht", not "ansprechen": the verb is separable, so a real German
  // question splits it ("Spricht die Erkrankung bisher an?") and the infinitive
  // never appears — "spricht" is the part that survives in a typed sentence.
  triggerTerms: ["response", "responding", "réponse", "reponse", "respons", "reactie", "spricht"],
  activity: AW.followUps.b.activity,
  prompt: AW.followUps.b.prompt,
  reply: AW.followUps.b.reply(demoBrainMriScans.length, "2026-05-30"),
  charts: [
    {
      id: "lesion-burden",
      title: AW.charts.targetLesionBurden,
      unit: "%",
      yMax: 100,
      values: demoBrainMriScans.map((scan) => scan.burdenPct),
      pointLabels: demoBrainMriScans.map((scan) => scan.short),
      scanIds: demoBrainMriScans.map((scan) => scan.id),
    },
    {
      id: "lesion-count",
      title: AW.charts.visibleBrainLesions,
      unit: "",
      yMax: 3,
      values: demoBrainMriScans.map((scan) => scan.lesionCount),
      pointLabels: demoBrainMriScans.map((scan) => scan.short),
      scanIds: demoBrainMriScans.map((scan) => scan.id),
    },
  ],
  noteRowId: "L-3407",
  noteText: AW.followUps.b.noteText(
    demoBrainMriScans.map((scan) => `${scan.burdenPct}%`).join(" → "),
    demoBrainMriScans.length,
    5,
  ),
  noteSourceIds: demoBrainMriScans.map((scan) => scan.id),
};

export const demoFollowUps = [followUpA, followUpB];

// Match a typed question to a scripted follow-up by keyword (any language).
export function matchFollowUp(text) {
  const haystack = String(text || "").toLowerCase();
  return demoFollowUps.find((followUp) => followUp.triggerTerms.some((term) => haystack.includes(term))) ?? null;
}

export function followUpById(id) {
  return demoFollowUps.find((followUp) => followUp.id === id) ?? null;
}

// Every cited source document keyed by id, so a [source] link in a chat reply
// or a chart point can open the underlying note in the evidence panel.
// Source documents behind the Previous treatments field. Ids, labels and dates
// are invariant and live here; the prose comes from the pack. L-3402 reuses the
// radiation-oncology completion note already written for its treatment cell —
// the same document evidences both the completed chemo-RT and the missing
// consolidation line.
const PTS = AW.priorTreatmentSources;
const PRIOR_TREATMENT_DOCS = [
  { id: "l3401-oncology-note-2025-11-12", rowId: "L-3401", label: AW.noteLabels.oncologyTreatment, date: "2025-11-12", content: PTS.l3401FirstLine },
  { id: "l3401-radiology-note-2026-05-28", rowId: "L-3401", label: AW.noteLabels.radiologyNote, date: "2026-05-28", content: PTS.l3401Progression },
  { id: "l3402-radiation-oncology-note-2026-06-20", rowId: "L-3402", label: AW.noteLabels.radiationOncologyCompletion, date: "2026-06-20", content: AW.interpretedNotes["L-3402:treatment"] },
  { id: "l3409-oncology-note-2025-08-14", rowId: "L-3409", label: AW.noteLabels.oncologyTreatment, date: "2025-08-14", content: PTS.l3409FirstLine },
  { id: "l3409-radiology-note-2026-06-02", rowId: "L-3409", label: AW.noteLabels.radiologyNote, date: "2026-06-02", content: PTS.l3409Relapse },
  // The treatment-naive patients: the record review IS the evidence for the
  // absence, so no value is left without a document behind it.
  ...lungMocRows
    .filter((row) => !demoPriorTreatments[row.id])
    .map((row) => ({
      id: RECORD_REVIEW_SOURCE(row.id),
      rowId: row.id,
      label: AW.noteLabels.recordReview,
      date: TODAY_DATE,
      content: PTS.noneDocumented,
    })),
];

export const demoSourceDocs = (() => {
  const docs = {};
  for (const doc of PRIOR_TREATMENT_DOCS) {
    docs[doc.id] = {
      id: doc.id,
      header: `${doc.label} · ${doc.date} · ${doc.rowId}`,
      body: doc.content.body,
      quotes: doc.content.quotes,
    };
  }
  for (const conflict of Object.values(demoConflicts)) {
    for (const source of conflict.sources) {
      docs[source.id] = {
        id: source.id,
        header: `${source.label} · ${source.date} · ${conflict.rowId}`,
        body: source.body,
        quotes: source.quotes,
      };
    }
  }
  for (const precedent of demoPrecedentCases) {
    for (const fact of precedent.facts) {
      docs[fact.source.id] = {
        id: fact.source.id,
        header: `${fact.source.label} · ${fact.source.date} · ${precedent.patientId}`,
        body: fact.source.body,
        quotes: fact.source.quotes,
      };
    }
  }
  for (const scan of demoBrainMriScans) {
    docs[scan.id] = {
      id: scan.id,
      header: `${AW.mri.reportLabel} · ${scan.date} · L-3407 (${scan.label})`,
      body: scan.body,
      quotes: scan.quotes,
    };
  }
  return docs;
})();

export function sourceDocById(id) {
  return demoSourceDocs[id] ?? null;
}

const FIELD_SOURCES = {
  histology: { table: "condition_occurrence", concept: "histology" },
  // The five Annexe 55 registration fields promoted onto the form: each reads
  // from a structured record, so its evidence is a direct lookup, not a note.
  baseOfDiagnosis: { table: "condition_occurrence", concept: "base of diagnosis" },
  localisation: { table: "condition_occurrence", concept: "primary tumour site" },
  differentiation: { table: "condition_occurrence", concept: "differentiation grade" },
  biopsy: { table: "procedure_occurrence", concept: "diagnostic biopsy" },
  petct: { table: "procedure_occurrence", concept: "PET-CT" },
  ecog: { table: "note_nlp", concept: "ECOG performance status" },
  tnm: { table: "condition_occurrence", concept: "TNM classification" },
  stage: { table: "condition_occurrence", concept: "UICC stage group" },
  pdl1: { table: "measurement", concept: "PD-L1 TPS" },
  egfr: { table: "measurement", concept: "EGFR mutation" },
  ngs: { table: "measurement", concept: "NGS panel" },
  treatment: { table: "drug_exposure", concept: "current treatment" },
  mocNotes: { table: "note_nlp", concept: "MOC discussion note" },
};

// Cell status (Missing / Pending / Insufficient-tissue / N/A) is a fixed
// property of the record, so it is keyed by rowId:columnId in logic — NOT
// derived from the cell's displayed value, which localises. Only the cells
// listed here are non-"filled"; every other direct cell is filled/reviewed.
// (Conflict cells never reach here — conflictEvidenceFor handles them; and an
// overridden cell — a resolved conflict or MOC-note write — is always filled.)
const CELL_STATUS = {
  "L-3402:pdl1": { state: "blocked", reason_code: "no_source_found" },
  "L-3402:ngs": { state: "pending" },
  "L-3403:egfr": { state: "not_applicable" },
  "L-3405:pdl1": { state: "not_applicable" },
  "L-3405:egfr": { state: "not_applicable" },
  "L-3405:ngs": { state: "not_applicable" },
  "L-3406:pdl1": { state: "pending" },
  "L-3406:egfr": { state: "pending" },
  "L-3406:ngs": { state: "blocked", reason_code: "insufficient_tissue" },
  "L-3409:pdl1": { state: "not_applicable" },
  "L-3409:egfr": { state: "not_applicable" },
  "L-3409:ngs": { state: "not_applicable" },
};

// The reason detail is looked up from the pack at call time, so it localises.
const REASON_DETAIL = {
  no_source_found: () => AW.values.missingReasonDetail,
  insufficient_tissue: () => AW.values.insufficientTissueReasonDetail,
};

function metaForCell(rowId, columnId, hasOverride) {
  const status = hasOverride ? null : CELL_STATUS[`${rowId}:${columnId}`];
  if (!status) {
    return { state: "filled", review_state: "reviewed" };
  }
  if (status.reason_code) {
    return { state: status.state, reason_code: status.reason_code, reason_detail: REASON_DETAIL[status.reason_code]() };
  }
  return { state: status.state };
}

function tableArtifactByTableId(tableId) {
  return demoArtifacts.find((artifact) => artifact.kind === "table" && artifact.tableId === tableId) ?? null;
}

function appendUniqueRef(refs, nextRef) {
  if (!nextRef || refs.some((ref) => ref.refId === nextRef.refId)) {
    return refs;
  }
  return [...refs, nextRef];
}

function normalizeAnchor(anchor) {
  if (!anchor || typeof anchor !== "object") return null;
  const x = Number(anchor.x);
  const y = Number(anchor.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function cellContextRef(tableId, rowId, columnId) {
  const table = tableArtifactByTableId(tableId);
  const row = table?.rows.find((candidate) => candidate.id === rowId);
  const column = table?.columns.find((candidate) => candidate.id === columnId);
  if (!table || !row || !column) return null;
  return {
    refId: `cell:${tableId}:${rowId}:${columnId}`,
    kind: "cell",
    artifactId: table.id,
    tableId,
    rowId,
    columnId,
    label: `${rowId} - ${column.title}`,
  };
}

const TABLE_TAB = Object.freeze({ id: LUNG_MOC_ARTIFACT_ID, kind: "table", title: AW.artifactTitle });
const reportTabId = (sourceId) => `report:${sourceId}`;

export function createArtifactWorkspaceState() {
  return {
    workspaceState: ARTIFACT_WORKSPACE_STATES.ARTIFACT_CLOSED,
    // Chrome-style tabs: every open artifact is a closeable tab. The table tab
    // hosts a side-panel evidence (activeEvidenceId); note tabs are reports
    // opened from chat (chart points / source links).
    tabs: [],
    activeTabId: null,
    activeEvidenceId: null,
    selectedCellRefs: [],
    // Capture mode: the chat-plus toggle. While on, clicked cells accumulate in
    // pendingContextCells (highlighted, not yet a chip) and a flying composer
    // shows. Pressing Enter commits { cells, comment } as ONE contextChip.
    contextCaptureMode: false,
    contextComposerAnchor: null,
    pendingContextCells: [],
    contextChips: [],
    // Which patient's form the artifact is showing. The rail always has a
    // selection — the artifact never opens on an empty panel.
    selectedPatientId: lungMocRows[0].id,
    // { [cellRefId]: { value, cellClass, meta } } — MOC Notes writes from
    // follow-ups. Never mutates the static fixtures above.
    cellOverrides: {},
    // { [cellRefId]: value } — values the clinician typed into the form. Held
    // separately from cellOverrides so a clinician-written value can always be
    // told apart from an agent-written one, and so it survives navigation.
    fieldEdits: {},
    // { [rowId]: true } — patients whose own last field has landed. Jittered by
    // the run controller so they complete at visibly different times.
    completedPatients: {},
    // { [cellRefId]: true } — interpreted (yellow) cells the doctor has
    // reviewed: after 2s of dwelling on the cell's note evidence the cell
    // settles needs-review -> reviewed (white), mirroring the product.
    reviewedCells: {},
    // Streamed opening run. "idle" before, "running" while the agent fills the
    // matrix, "done" after. revealedCells (a Set of "rowId:columnId") gates
    // which cells are shown WHILE running; null means show everything.
    runStatus: "idle",
    runUserText: "",
    runStartedAt: null,
    runEndedAt: null,
    runActivity: [],
    revealedCells: null,
    // Bumped on every table cell change; drives SpreadsheetViewer's in-place
    // cell_update (no remount). lastUpdatedRefs is the cells touched last.
    tableTick: 0,
    lastUpdatedRefs: [],
    // Artifact management (tray three-dot menu): pins drive the sidebar's
    // PINNED ARTIFACTS section; renames/removals are session overrides over
    // the static fixtures.
    pinnedArtifactIds: [],
    artifactTitleOverrides: {},
    removedArtifactIds: [],
  };
}

const cellKey = (rowId, columnId) => `${rowId}:${columnId}`;

export const structuredColumnIds = lungMocColumns
  .filter((column) => column.cellClass === "direct")
  .map((column) => column.id);
export const interpretedColumnIds = ["ecog", "stage", "previousTreatment", "treatment"]; // MOC Notes stays empty at open

// --- Streamed opening run reducers -----------------------------------------

export function startRun(state, startedAt, userText = "") {
  return {
    ...createArtifactWorkspaceState(),
    // A fresh run starts clean (no leftover tabs / resolutions from a prior
    // run) — but pins and renames are the doctor's own organization, and a
    // re-run re-creates the artifact, so removals reset while those carry over.
    pinnedArtifactIds: state.pinnedArtifactIds || [],
    artifactTitleOverrides: state.artifactTitleOverrides || {},
    runStatus: "running",
    runUserText: userText,
    runStartedAt: startedAt,
    revealedCells: new Set(),
  };
}

export function appendRunActivity(state, event) {
  return { ...state, runActivity: [...state.runActivity, event] };
}

// Reveal a batch of cells (bulk column or a single interpreted cell). Bumps the
// table tick and records the touched refs so the grid fills them in place.
export function revealCells(state, cells) {
  if (state.runStatus !== "running") return state;
  const revealedCells = new Set(state.revealedCells);
  for (const { rowId, columnId } of cells) revealedCells.add(cellKey(rowId, columnId));
  return {
    ...state,
    revealedCells,
    tableTick: state.tableTick + 1,
    lastUpdatedRefs: cells,
  };
}

export function revealColumn(state, columnId) {
  return revealCells(
    state,
    lungMocRows.map((row) => ({ rowId: row.id, columnId })),
  );
}

export function finishRun(state, endedAt) {
  return {
    ...state,
    runStatus: "done",
    runEndedAt: endedAt,
    revealedCells: null,
    tableTick: state.tableTick + 1,
    lastUpdatedRefs: [],
  };
}

export function isCellRevealed(state, rowId, columnId) {
  if (state.runStatus !== "running" || !state.revealedCells) return true;
  return state.revealedCells.has(cellKey(rowId, columnId));
}

// Ensure a tab exists, focus it, and open the box. Preserves an already-open
// (e.g. expanded) workspace state.
function withTab(state, tab, { expanded = false } = {}) {
  const tabs = state.tabs.some((candidate) => candidate.id === tab.id) ? state.tabs : [...state.tabs, tab];
  const workspaceState = expanded
    ? ARTIFACT_WORKSPACE_STATES.ARTIFACT_EXPANDED
    : state.workspaceState === ARTIFACT_WORKSPACE_STATES.ARTIFACT_CLOSED
      ? ARTIFACT_WORKSPACE_STATES.CHAT_AND_ARTIFACT
      : state.workspaceState;
  return { ...state, tabs, activeTabId: tab.id, workspaceState };
}

export function openArtifact(state) {
  return withTab(state, TABLE_TAB);
}

export function openPinnedArtifact(state) {
  return withTab(state, TABLE_TAB, { expanded: true });
}

// Open (or focus) a cited report as its own note tab — the second surface for
// evidence, used by chart points and chat source links. Deduped by source id.
export function openReportTab(state, sourceId) {
  const doc = demoSourceDocs[sourceId];
  if (!doc) return state;
  return withTab(state, { id: reportTabId(sourceId), kind: "note", title: doc.header, sourceId });
}

export function activateTab(state, tabId) {
  if (!state.tabs.some((tab) => tab.id === tabId)) return state;
  return { ...state, activeTabId: tabId };
}

export function closeTab(state, tabId) {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) return state;
  const tabs = state.tabs.filter((tab) => tab.id !== tabId);
  if (!tabs.length) {
    return closeArtifact(state);
  }
  // If the active tab closed, fall to its neighbour.
  let activeTabId = state.activeTabId;
  if (state.activeTabId === tabId) {
    activeTabId = (tabs[index] ?? tabs[index - 1] ?? tabs[0]).id;
  }
  // Evidence side panel belongs to the table tab; drop it if that tab closed.
  const closedTable = tabId === TABLE_TAB.id;
  return {
    ...state,
    tabs,
    activeTabId,
    activeEvidenceId: closedTable ? null : state.activeEvidenceId,
    selectedCellRefs: closedTable ? [] : state.selectedCellRefs,
  };
}

export function closeEvidence(state) {
  return {
    ...state,
    activeEvidenceId: null,
    selectedCellRefs: [],
  };
}

export function closeArtifact(state) {
  return {
    ...state,
    workspaceState: ARTIFACT_WORKSPACE_STATES.ARTIFACT_CLOSED,
    tabs: [],
    activeTabId: null,
    activeEvidenceId: null,
    selectedCellRefs: [],
    contextCaptureMode: false,
    contextComposerAnchor: null,
    pendingContextCells: [],
    contextChips: [],
  };
}

// Toggle the chat-plus capture mode. Entering or leaving always discards any
// half-built pending selection (committed chips are untouched). Entering also
// defocuses the current cell selection + its evidence, so no cell shows the
// blue highlight until the doctor explicitly picks it as context.
export function toggleContextCapture(state) {
  const contextCaptureMode = !state.contextCaptureMode;
  return {
    ...state,
    contextCaptureMode,
    pendingContextCells: [],
    contextComposerAnchor: null,
    selectedCellRefs: contextCaptureMode ? [] : state.selectedCellRefs,
    activeEvidenceId: contextCaptureMode ? null : state.activeEvidenceId,
  };
}

export function toggleChatFold(state) {
  if (state.workspaceState === ARTIFACT_WORKSPACE_STATES.ARTIFACT_CLOSED) {
    return state;
  }
  return {
    ...state,
    workspaceState:
      state.workspaceState === ARTIFACT_WORKSPACE_STATES.ARTIFACT_EXPANDED
        ? ARTIFACT_WORKSPACE_STATES.CHAT_AND_ARTIFACT
        : ARTIFACT_WORKSPACE_STATES.ARTIFACT_EXPANDED,
  };
}

// Open any evidence id in the side panel — a cited document (`src:…`) picked
// from a field's source control, or a field's own cell evidence.
export function openEvidence(state, evidenceId) {
  if (!evidenceById(state, evidenceId)) return state;
  return {
    ...withTab(state, TABLE_TAB),
    activeEvidenceId: evidenceId,
    selectedCellRefs: [],
  };
}

export function selectCell(state, tableId, rowId, columnId) {
  const table = tableArtifactByTableId(tableId);
  const row = table?.rows.find((candidate) => candidate.id === rowId);
  const column = table?.columns.find((candidate) => candidate.id === columnId);

  if (!table || !row || !column) {
    return state;
  }

  // Opening a field's evidence also brings that patient's record up — an
  // attention line in the thread names a patient AND a field, so both have to
  // move for the click to land where it points.
  const opened = withTab(selectPatient(state, rowId), TABLE_TAB);
  return {
    ...opened,
    activeEvidenceId: `cell:${tableId}:${rowId}:${columnId}`,
    selectedCellRefs: [
      {
        refId: `cell:${tableId}:${rowId}:${columnId}`,
        kind: "cell",
        artifactId: LUNG_MOC_ARTIFACT_ID,
        tableId,
        rowId,
        columnId,
        label: `${rowId} - ${column.title}`,
      },
    ],
  };
}

// Click a cell in capture mode: add it to the pending selection (highlighted
// blue) and move the flying composer to it. Clicking an already-pending cell
// unselects it (the composer stays where it was). Not yet a chip.
export function togglePendingContextCell(state, tableId, rowId, columnId, anchor = null) {
  const ref = cellContextRef(tableId, rowId, columnId);
  if (!ref) return state;
  if (state.pendingContextCells.some((cell) => cell.refId === ref.refId)) {
    return {
      ...state,
      pendingContextCells: state.pendingContextCells.filter((cell) => cell.refId !== ref.refId),
    };
  }
  return {
    ...state,
    pendingContextCells: appendUniqueRef(state.pendingContextCells, ref),
    contextComposerAnchor: normalizeAnchor(anchor) ?? state.contextComposerAnchor,
  };
}

// Enter in the flying composer: fold the pending cells + comment into ONE chip,
// clear the pending selection, and leave capture mode.
export function commitContextChip(state, comment) {
  if (!state.pendingContextCells.length) return state;
  const chip = {
    id: `chip-${state.contextChips.length}-${state.pendingContextCells.map((cell) => cell.refId).join("|")}`,
    cells: state.pendingContextCells,
    comment: String(comment || "").trim(),
  };
  return {
    ...state,
    contextChips: [...state.contextChips, chip],
    pendingContextCells: [],
    contextCaptureMode: false,
    contextComposerAnchor: null,
  };
}

export function removeContextChip(state, chipId) {
  return {
    ...state,
    contextChips: state.contextChips.filter((chip) => chip.id !== chipId),
  };
}

// Clear everything context-related — used after a message is sent.
export function clearContextChips(state) {
  return {
    ...state,
    contextChips: [],
    pendingContextCells: [],
    contextCaptureMode: false,
    contextComposerAnchor: null,
  };
}

function setCellOverride(state, tableId, rowId, columnId, override) {
  const key = cellRefId(tableId, rowId, columnId);
  return {
    ...state,
    cellOverrides: { ...state.cellOverrides, [key]: override },
  };
}

// Show a patient's form. The rail always has a selection, so an unknown id is
// ignored rather than clearing the panel.
export function selectPatient(state, rowId) {
  if (!lungMocRows.some((row) => row.id === rowId)) return state;
  return { ...state, selectedPatientId: rowId };
}

// The clinician typing into a field. Every field is editable and the value is
// theirs — it carries no source and is never confused with an extraction. An
// edit also settles an interpretive field's review (looking at a value closely
// enough to correct it IS reviewing it) and clears a conflict marking, since
// the clinician has just said which reading stands.
export function editField(state, tableId, rowId, columnId, value) {
  const column = tableArtifactByTableId(tableId)?.columns.find((candidate) => candidate.id === columnId);
  if (!column) return state;
  const key = cellRefId(tableId, rowId, columnId);
  return {
    ...state,
    fieldEdits: { ...state.fieldEdits, [key]: String(value ?? "") },
    reviewedCells: { ...state.reviewedCells, [key]: true },
    tableTick: state.tableTick + 1,
    lastUpdatedRefs: [{ rowId, columnId }],
  };
}

// Mark a patient's record complete (its own last field has landed).
export function completePatient(state, rowId) {
  if (state.completedPatients[rowId]) return state;
  return { ...state, completedPatients: { ...state.completedPatients, [rowId]: true } };
}

// Writes a follow-up's finding into a patient's MOC Notes cell. Used by the
// AskUserQuestion-shaped "Add to MOC Notes" widget for Follow-up A and B.
export function addFollowUpNote(state, tableId, rowId, noteText, sourceIds = []) {
  // Doctor-owned note: plain white cell (see resolveConflictCell's write).
  const next = setCellOverride(state, tableId, rowId, "mocNotes", {
    value: noteText,
    cellClass: "direct",
    sourceIds,
  });
  return {
    ...next,
    tableTick: next.tableTick + 1,
    lastUpdatedRefs: [{ rowId, columnId: "mocNotes" }],
  };
}

export function artifactById(id) {
  return demoArtifacts.find((artifact) => artifact.id === id) ?? null;
}

// Returns the table artifact with clinician edits and cellOverrides applied —
// the fixture itself is never mutated. An edit wins over an agent write, since
// it is the later and more deliberate act.
export function resolvedTable(state, tableId = LUNG_MOC_TABLE_ID) {
  const table = tableArtifactByTableId(tableId);
  if (!table) return null;
  return {
    ...table,
    rows: table.rows.map((row) => {
      const patched = { ...row };
      for (const column of table.columns) {
        const key = cellRefId(tableId, row.id, column.id);
        const override = state.cellOverrides[key];
        if (override) {
          patched[column.id] = override.value;
        }
        // During the streamed opening, unrevealed fields are blank so the form
        // fills in progressively as the agent extracts each one.
        if (!isCellRevealed(state, row.id, column.id)) {
          patched[column.id] = "";
        }
        // A clinician edit outranks both.
        if (key in state.fieldEdits) {
          patched[column.id] = state.fieldEdits[key];
        }
      }
      return patched;
    }),
  };
}

// Previous treatments is interpretive where the history was assembled by reading
// notes and orders, and direct where the record review simply found nothing —
// so the class follows the patient, not the field.
const CELL_CLASS_OVERRIDES = Object.fromEntries(
  lungMocRows.map((row) => [
    `${row.id}:previousTreatment`,
    demoPriorTreatments[row.id] ? "interpreted" : "direct",
  ]),
);

// One field's value, with the same precedence resolvedTable applies: a
// clinician edit wins over everything, an unrevealed field is still blank, and
// an agent write outranks the fixture.
export function cellValue(state, tableId, rowId, columnId) {
  const key = cellRefId(tableId, rowId, columnId);
  if (key in state.fieldEdits) return state.fieldEdits[key];
  if (!isCellRevealed(state, rowId, columnId)) return "";
  const override = state.cellOverrides[key];
  if (override) return override.value;
  return lungMocRecords.find((record) => record.id === rowId)?.[columnId] ?? "";
}

export function cellClassFor(state, tableId, rowId, columnId) {
  const key = cellRefId(tableId, rowId, columnId);
  // A value the clinician typed is theirs — never an extraction to check, never
  // a conflict to resolve.
  if (key in state.fieldEdits) return "edited";
  // An empty field carries no marking at all: a blank MOC Notes before the
  // meeting is not something to review, and neither is a field still filling.
  if (String(cellValue(state, tableId, rowId, columnId)).trim() === "") return "direct";
  const override = state.cellOverrides[key];
  if (override) return override.cellClass;
  if (demoConflicts[key]) return "conflict";
  const column = tableArtifactByTableId(tableId)?.columns.find((candidate) => candidate.id === columnId);
  const klass = CELL_CLASS_OVERRIDES[`${rowId}:${columnId}`] ?? column?.cellClass ?? "direct";
  if (klass === "interpreted" && state.reviewedCells[key]) return "interpreted-reviewed";
  return klass;
}

// True while an interpretive field still needs the clinician's review (amber).
// Edited fields, agent writes, direct fields and empty fields never do — which
// falls straight out of the class, so the two can never disagree.
export function cellAwaitingReview(state, tableId, rowId, columnId) {
  return cellClassFor(state, tableId, rowId, columnId) === "interpreted";
}

// Dwelling on a needs-review cell's evidence marks it reviewed: the cell
// settles yellow -> white in place (tick + ref, same path as streamed fills).
export function reviewCell(state, tableId, rowId, columnId) {
  if (!cellAwaitingReview(state, tableId, rowId, columnId)) return state;
  return {
    ...state,
    reviewedCells: { ...state.reviewedCells, [cellRefId(tableId, rowId, columnId)]: true },
    tableTick: state.tableTick + 1,
    lastUpdatedRefs: [{ rowId, columnId }],
  };
}

// --- The form view-model ----------------------------------------------------
//
// Everything the form and the rail render comes from here, so the components
// stay dumb and the whole feature is testable without a DOM.

const FIELD_STATUS_LABEL = {
  interpreted: AW.fieldStatus.interpreted,
  conflict: AW.fieldStatus.conflict,
  edited: AW.fieldStatus.edited,
};

// The documents behind one field, as `{ id, title }`. One source opens straight
// from the field's source control; several are offered as a list to pick from.
// Editing a field does NOT strip its provenance: the reports that backed the
// value stay reachable, so a doctor who resolves a conflict by typing can still
// open the two disagreeing reports. Only a genuinely empty field has nothing.
export function fieldSources(state, tableId, rowId, columnId) {
  const key = cellRefId(tableId, rowId, columnId);
  const asDocs = (ids) =>
    ids.filter((id) => demoSourceDocs[id]).map((id) => ({ id: `src:${id}`, title: demoSourceDocs[id].header }));

  if (String(cellValue(state, tableId, rowId, columnId)).trim() === "") return [];
  if (columnId === "previousTreatment") return asDocs(priorTreatmentFor(rowId).sourceIds);

  const conflict = demoConflicts[key];
  if (conflict) return asDocs(conflict.sources.map((source) => source.id));

  const override = state.cellOverrides[key];
  if (override) return asDocs(override.sourceIds || []);

  // A note-backed field's source is the note itself; a direct field's is the
  // query over the structured record. Both open as this field's cell evidence.
  const note = demoInterpretedNotes[`${rowId}:${columnId}`];
  if (note) return [{ id: key, title: `${note.label} · ${note.date} · ${rowId}` }];
  return [{ id: key, title: AW.fieldSourceConcepts[columnId] ?? columnId }];
}

function formField(state, rowId, fieldId, tableId) {
  const column = lungMocColumns.find((candidate) => candidate.id === fieldId);
  const status = cellClassFor(state, tableId, rowId, fieldId);
  return {
    id: fieldId,
    refId: cellRefId(tableId, rowId, fieldId),
    label: column.title,
    kind: column.kind,
    value: cellValue(state, tableId, rowId, fieldId),
    status,
    statusLabel: FIELD_STATUS_LABEL[status] ?? null,
    awaitingReview: cellAwaitingReview(state, tableId, rowId, fieldId),
    revealed: isCellRevealed(state, rowId, fieldId),
    sources: fieldSources(state, tableId, rowId, fieldId),
  };
}

// A patient is complete once its own last field has landed; outside a run every
// field is shown, so every patient reads complete.
function patientComplete(state, rowId) {
  return state.runStatus === "running" ? !!state.completedPatients[rowId] : true;
}

// The rail: every patient on the list, with the clinical one-liner composed from
// strings already in the pack.
export function patientList(state) {
  return lungMocRecords.map((record) => ({
    id: record.id,
    summary: AW.form.summary(record.histology, record.stage),
    complete: patientComplete(state, record.id),
    selected: state.selectedPatientId === record.id,
  }));
}

// One patient's page: the title, the rail summary, and the fields in section
// order. Returns null for an unknown patient.
export function patientForm(state, patientId = state.selectedPatientId, tableId = LUNG_MOC_TABLE_ID) {
  const record = lungMocRecords.find((candidate) => candidate.id === patientId);
  if (!record) return null;
  return {
    patientId,
    title: patientId,
    summary: AW.form.summary(record.histology, record.stage),
    complete: patientComplete(state, patientId),
    sections: FORM_SECTIONS.map((section) => ({
      key: section.key,
      title: section.title,
      fields: section.fieldIds.map((fieldId) => formField(state, patientId, fieldId, tableId)),
    })),
  };
}

// A conflicting field's evidence is the two disagreeing reports side by side —
// there is no single database cell that says "Conflicting (60% vs 10%)"; that
// display value is synthesised from two sources. The two reports stay on file
// even after the doctor resolves the conflict by editing the value, so the
// resolution is always traceable back to what disagreed.
export function conflictEvidenceFor(state, tableId, rowId, columnId) {
  const key = cellRefId(tableId, rowId, columnId);
  const conflict = demoConflicts[key];
  if (!conflict) return null;
  return {
    kind: "conflict",
    title: AW.evidence.selectedCell,
    rowId,
    columnId,
    sources: conflict.sources.map((source) => ({ ...source })),
  };
}

export function evidenceById(state, id) {
  const key = String(id || "");

  if (key.startsWith("src:")) {
    const doc = demoSourceDocs[key.slice(4)];
    if (!doc) return null;
    return {
      kind: "note",
      title: doc.header,
      header: doc.header,
      body: doc.body,
      quotes: doc.quotes,
      query: `select document_text from clinical_notes where document_id = '${doc.id}'`,
    };
  }

  if (!key.startsWith("cell:")) {
    return null;
  }

  const [, tableId, rowId, columnId] = key.split(":");

  const conflict = conflictEvidenceFor(state, tableId, rowId, columnId);
  if (conflict) return conflict;

  const table = tableArtifactByTableId(tableId);
  const row = table?.rows.find((candidate) => candidate.id === rowId);
  const column = table?.columns.find((candidate) => candidate.id === columnId);
  if (!table || !row || !column) {
    return null;
  }

  const override = state.cellOverrides[cellRefId(tableId, rowId, columnId)];

  // MOC Notes cells are plain, user-owned notes — no SQL, no result table, no
  // review status. Just the note text and hyperlinked references to the sources
  // that were folded into it.
  if (columnId === "mocNotes" && override) {
    return {
      kind: "moc-note",
      title: AW.evidence.mocNote,
      content: override.value,
      references: (override.sourceIds || [])
        .map((sid) => demoSourceDocs[sid])
        .filter(Boolean)
        .map((doc) => ({ id: doc.id, label: doc.header })),
    };
  }

  // Interpreted (yellow) cells are note-backed: the evidence result is the
  // clinical note itself with the extracted phrase highlighted, and the status
  // tracks the needs-review -> reviewed dwell (reviewCell).
  const note = !override && demoInterpretedNotes[`${rowId}:${columnId}`];
  if (note) {
    const reviewed = !!state.reviewedCells[cellRefId(tableId, rowId, columnId)];
    const explanation = AW.evidence.interpretedExplanation(column.title, rowId, note.label.toLowerCase(), note.date);
    return {
      kind: "simple",
      title: AW.evidence.selectedCell,
      selected: `${rowId} - ${column.title} - ${row[columnId]}`,
      explanation,
      query: `select note_date, note_type, note_text from clinical_notes where patient_id = '${rowId}' and note_type = '${note.label}' order by note_date desc`,
      evidence: note.quotes,
      result: demoResult(["note_date", "note_type", "note_text"], [[note.date, note.label, note.body]]),
      selectedCellMeta: {
        kind: "interpret",
        state: "filled",
        review_state: reviewed ? "reviewed" : "not_reviewed",
        explanation,
      },
    };
  }

  const value = override ? override.value : row[columnId];
  const source = FIELD_SOURCES[columnId] || { table: "note_nlp", concept: column.title };
  // The SQL concept_name token stays invariant (FIELD_SOURCES); only the
  // human-readable descriptor in the explanation is re-sourced from the pack.
  const conceptLabel = AW.fieldSourceConcepts[columnId] ?? source.concept;
  const query = `select patient_id, value from ${source.table} where concept_name = '${source.concept}' and patient_id = '${rowId}'`;
  const explanation = override
    ? AW.evidence.mocNoteExplanation(rowId)
    : AW.evidence.directExplanation(column.title, conceptLabel, rowId);
  const meta = metaForCell(rowId, columnId, !!override);

  return {
    kind: "simple",
    title: AW.evidence.selectedCell,
    selected: `${rowId} - ${column.title} - ${value}`,
    explanation,
    query,
    result: demoResult(["patient_id", column.title], [[rowId, value]]),
    selectedCellMeta: {
      ...meta,
      explanation,
    },
  };
}
