// View routing. Since the single-run-store refactor (T3) this module writes
// NO run state: switching views just moves `currentView`/`currentAuditId`,
// and the live run views (activity/workbook/summary/status in chat.js) are
// derived from the selected audit's record — there is nothing to reset or
// restore by hand.
import { writable, get } from "svelte/store";
import { audits, currentAuditId } from "./audits.js";
import { closePanel as closeResultPanel, activeCommand } from "./resultViewUi.js";
import { openWorkbook } from "./chat.js";

export const currentView = writable("home");
export const selectedTemplate = writable(null);
export const libraryPage = writable({
  section: "templates",
  templateId: null,
  databaseId: null,
});

export function openTemplatesLibrary() {
  selectedTemplate.set(null);
  libraryPage.set({ section: "templates", templateId: null, databaseId: null });
  currentView.set("library");
}

export function openDatabasesLibrary() {
  selectedTemplate.set(null);
  libraryPage.set({ section: "databases", templateId: null, databaseId: null });
  currentView.set("library");
}

export function openTemplateLibraryDetail(templateId) {
  if (!templateId) return;
  selectedTemplate.set(null);
  libraryPage.set({ section: "templates", templateId, databaseId: null });
  currentView.set("library");
}

export function openDatabaseLibraryDetail(databaseId) {
  if (!databaseId) return;
  selectedTemplate.set(null);
  libraryPage.set({ section: "databases", templateId: null, databaseId });
  currentView.set("library");
}

export function backToLibraryList() {
  libraryPage.update((state) => ({
    section: state.section,
    templateId: null,
    databaseId: null,
  }));
}

export function selectTemplate(template) {
  selectedTemplate.set(template);
  currentView.set("config");
}

// Open an audit from the sidebar. Switch the view immediately (the derived live
// views pick up the record the moment currentAuditId changes), then recover the
// run from the backend: openWorkbook re-fetches the state.db snapshot — so a run
// reopened after a sign-out, a closed browser, or a fresh session shows EVERY
// cell the agent wrote (out-of-process, straight to state.db), not the stale
// localStorage copy — and reconnects the live SSE stream when the run is still
// in flight, so any remaining streamed events keep filling the grid. This is the
// trigger PR #241's recovery was missing: its only other caller (the spreadsheet
// chip) is not mounted anywhere. Fire-and-forget: the view is already up; the
// snapshot + reconnect land when they resolve. openWorkbook focuses (never
// refetches) the run that is actively streaming, so this can't clobber a live fill.
export function selectAudit(id) {
  const entry = get(audits).find((a) => a.id === id);
  if (!entry) return;
  closeResultPanel();
  activeCommand.set(null);
  currentAuditId.set(id);
  selectedTemplate.set(null);
  currentView.set("results");
  if (entry.runId) void openWorkbook(entry.runId);
}

export function goHome() {
  currentAuditId.set(null);
  activeCommand.set(null);
  closeResultPanel();
  selectedTemplate.set(null);
  libraryPage.set({ section: "templates", templateId: null, databaseId: null });
  currentView.set("home");
}

export function goToResults() {
  // The caller (startAudit) has already created a fresh record and pointed
  // currentAuditId at it, so the derived views are already empty — no flash
  // of a previous audit's reasoning or grid, nothing to clear by hand.
  closeResultPanel();
  activeCommand.set(null);
  currentView.set("results");
}

export function goToConfig() {
  selectedTemplate.set(null);
  currentView.set("config");
}
