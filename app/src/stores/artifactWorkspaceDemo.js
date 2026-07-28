import { writable } from "svelte/store";

import { CONTENT } from "../lib/mock/content/index.js";
import {
  addFollowUpNote,
  activateTab,
  appendRunActivity,
  clearContextChips,
  commitContextChip,
  closeArtifact,
  closeEvidence,
  closeTab,
  completePatient,
  createArtifactWorkspaceState,
  editField,
  finishRun,
  lungMocRows,
  openArtifact,
  openEvidence,
  openPinnedArtifact,
  openReportTab,
  removeArtifact,
  removeContextChip,
  renameArtifact,
  revealCells,
  revealColumn,
  reviewCell,
  selectCell,
  selectPatient,
  startRun,
  toggleChatFold,
  toggleContextCapture,
  togglePendingContextCell,
  togglePinArtifact,
} from "../lib/artifactWorkspaceDemo.js";

// Streamed opening-run activity lines come from the locale content pack; only the
// invariants (codes, ids, percentages, counts) are interpolated in below.
const AW = CONTENT.artifactWorkspace;

export const artifactWorkspaceDemoState = writable(createArtifactWorkspaceState());

export function resetArtifactWorkspaceDemo() {
  artifactWorkspaceDemoState.set(createArtifactWorkspaceState());
}

export function openDemoArtifact() {
  artifactWorkspaceDemoState.update((state) => openArtifact(state));
}

export function openDemoPinnedArtifact() {
  artifactWorkspaceDemoState.update((state) => openPinnedArtifact(state));
}

export function closeDemoArtifact() {
  artifactWorkspaceDemoState.update(closeArtifact);
}

export function toggleDemoArtifactPin(artifactId) {
  artifactWorkspaceDemoState.update((state) => togglePinArtifact(state, artifactId));
}

export function renameDemoArtifact(artifactId, title) {
  artifactWorkspaceDemoState.update((state) => renameArtifact(state, artifactId, title));
}

export function removeDemoArtifact(artifactId) {
  artifactWorkspaceDemoState.update((state) => removeArtifact(state, artifactId));
}

export function activateDemoTab(tabId) {
  artifactWorkspaceDemoState.update((state) => activateTab(state, tabId));
}

export function closeDemoTab(tabId) {
  artifactWorkspaceDemoState.update((state) => closeTab(state, tabId));
}

export function closeDemoEvidence() {
  artifactWorkspaceDemoState.update(closeEvidence);
}

export function toggleDemoChatFold() {
  artifactWorkspaceDemoState.update(toggleChatFold);
}

export function selectDemoCell(tableId, rowId, columnId) {
  artifactWorkspaceDemoState.update((state) => selectCell(state, tableId, rowId, columnId));
}

export function openDemoEvidence(evidenceId) {
  artifactWorkspaceDemoState.update((state) => openEvidence(state, evidenceId));
}

export function openDemoReportTab(sourceId) {
  artifactWorkspaceDemoState.update((state) => openReportTab(state, sourceId));
}

export function toggleDemoContextCapture() {
  artifactWorkspaceDemoState.update(toggleContextCapture);
}

export function toggleDemoPendingContextCell(tableId, rowId, columnId, anchor = null) {
  artifactWorkspaceDemoState.update((state) => togglePendingContextCell(state, tableId, rowId, columnId, anchor));
}

export function commitDemoContextChip(comment) {
  artifactWorkspaceDemoState.update((state) => commitContextChip(state, comment));
}

export function clearDemoContextChips() {
  artifactWorkspaceDemoState.update(clearContextChips);
}

export function removeDemoContextChip(chipId) {
  artifactWorkspaceDemoState.update((state) => removeContextChip(state, chipId));
}

export function selectDemoPatient(rowId) {
  artifactWorkspaceDemoState.update((state) => selectPatient(state, rowId));
}

export function editDemoField(tableId, rowId, columnId, value) {
  artifactWorkspaceDemoState.update((state) => editField(state, tableId, rowId, columnId, value));
}

export function markDemoCellReviewed(tableId, rowId, columnId) {
  artifactWorkspaceDemoState.update((state) => reviewCell(state, tableId, rowId, columnId));
}

export function addDemoFollowUpNote(tableId, rowId, noteText, sourceIds = []) {
  artifactWorkspaceDemoState.update((state) => addFollowUpNote(state, tableId, rowId, noteText, sourceIds));
}

// --- Streamed opening run ---------------------------------------------------
//
// A local, timed controller that mimics the product's streaming: it appends
// agent-activity lines and reveals the matrix (structured columns in bulk,
// interpreted fields cell-by-cell with jitter) over ~20s, then finishes.

// Direct fields, revealed a whole field at a time across the cohort. The five
// Annexe 55 registration fields promoted onto the form fill with them.
const STRUCTURED_REVEAL = [
  "histology",
  "baseOfDiagnosis",
  "localisation",
  "differentiation",
  "tnm",
  "biopsy",
  "petct",
  "pdl1",
  "egfr",
  "ngs",
];
let runTimers = [];

function clearRunTimers() {
  runTimers.forEach((t) => clearTimeout(t));
  runTimers = [];
}

const setStep = (fn) => artifactWorkspaceDemoState.update(fn);
const activity = (id, text) => (state) =>
  appendRunActivity(state, { id, label: text, headline: text, kind: "tool" });
const jitter = (base, spread) => base + Math.floor(Math.random() * spread);

export function startLungMocDemoRun(userText) {
  clearRunTimers();
  setStep((state) => startRun(state, Date.now(), userText));

  const steps = [];
  let at = 0;
  const push = (dt, fn) => {
    at += dt;
    steps.push([at, fn]);
  };

  // Recognize the template + load the agenda.
  push(300, activity("act-template", AW.run.template(AW.templateName)));
  push(1000, activity("act-agenda", AW.run.agenda(9)));
  push(400, (s) => revealColumn(s, "patient"));

  // Structured fields — extract each column at once.
  push(900, activity("act-structured", AW.run.structured));
  for (const col of STRUCTURED_REVEAL) push(jitter(320, 220), (s) => revealColumn(s, col));

  // Interpreted fields — cell by cell, with irregular timing.
  push(700, activity("act-ecog", AW.run.ecog));
  for (const row of lungMocRows) push(jitter(360, 320), (s) => revealCells(s, [{ rowId: row.id, columnId: "ecog" }]));

  push(700, activity("act-stage", AW.run.stage));
  for (const row of lungMocRows) push(jitter(360, 320), (s) => revealCells(s, [{ rowId: row.id, columnId: "stage" }]));

  push(700, activity("act-prior", AW.run.priorTreatment));
  for (const row of lungMocRows)
    push(jitter(360, 320), (s) => revealCells(s, [{ rowId: row.id, columnId: "previousTreatment" }]));

  // Current treatment is each patient's last field, so revealing it IS that
  // patient's record completing — the rail's checkmarks are caused by the work
  // finishing, not decorated to look that way. The jitter above is what makes
  // them land at visibly different moments.
  push(700, activity("act-treatment", AW.run.treatment));
  for (const row of lungMocRows)
    push(jitter(360, 320), (s) => completePatient(revealCells(s, [{ rowId: row.id, columnId: "treatment" }]), row.id));

  // Conflict + gap checks.
  push(700, activity("act-conflicts", AW.run.conflicts));
  push(900, activity("act-flag-3404", AW.run.flag3404("60%", "10%")));
  push(900, activity("act-flag-3402", AW.run.flag3402(25, 60)));
  push(900, activity("act-ready", AW.run.ready(7, 9)));

  // Schedule everything, then finish.
  for (const [t, fn] of steps) runTimers.push(setTimeout(() => setStep(fn), t));
  runTimers.push(setTimeout(() => setStep((s) => finishRun(s, Date.now())), at + 900));
}

// Stop button / fast-forward: cancel the schedule and jump straight to done.
export function finishLungMocDemoRun() {
  clearRunTimers();
  setStep((state) => (state.runStatus === "running" ? finishRun(state, Date.now()) : state));
}
