// View routing. Since the single-run-store refactor (T3) this module writes
// NO run state: switching views just moves `currentView`/`currentPopulatedTableId`,
// and the live run views (activity/workbook/summary/status in chat.js) are
// derived from the selected populated table's record — there is nothing to reset or
// restore by hand.
import { writable, get } from "svelte/store";
import { populatedTables, currentPopulatedTableId } from "./populatedTables.js";
import { closePanel as closeResultPanel, activeCommand } from "./resultViewUi.js";
import { openWorkbook } from "./chat.js";

export const currentView = writable("thread");
export const libraryPage = writable({
  section: "templates",
  templateId: null,
  databaseId: null,
  datasetId: null,
});

export function openTemplatesLibrary() {
  libraryPage.set({ section: "templates", templateId: null, databaseId: null, datasetId: null });
  currentView.set("library");
}

export function openDatabasesLibrary() {
  libraryPage.set({ section: "databases", templateId: null, databaseId: null, datasetId: null });
  currentView.set("library");
}

// The data library lists the user's Datasets (saved cohort filters). Databases
// are not a user-facing surface, so this is the destination a clinician reaches.
export function openDataLibrary() {
  libraryPage.set({ section: "datasets", templateId: null, databaseId: null, datasetId: null });
  currentView.set("library");
}

export function openDatasetLibraryDetail(datasetId) {
  if (!datasetId) return;
  libraryPage.set({ section: "datasets", templateId: null, databaseId: null, datasetId });
  currentView.set("library");
}

export function openTemplateLibraryDetail(templateId) {
  if (!templateId) return;
  libraryPage.set({ section: "templates", templateId, databaseId: null, datasetId: null });
  currentView.set("library");
}

export function openDatabaseLibraryDetail(databaseId) {
  if (!databaseId) return;
  libraryPage.set({ section: "databases", templateId: null, databaseId, datasetId: null });
  currentView.set("library");
}

export function backToLibraryList() {
  libraryPage.update((state) => ({
    section: state.section,
    templateId: null,
    databaseId: null,
    datasetId: null,
  }));
}

// Open a populated table from the sidebar. Switch the view immediately (the derived live
// views pick up the record the moment currentPopulatedTableId changes), then recover the
// run from the backend: openWorkbook re-fetches the state.db snapshot — so a run
// reopened after a sign-out, a closed browser, or a fresh session shows EVERY
// cell the agent wrote (out-of-process, straight to state.db), not the stale
// localStorage copy — and reconnects the live SSE stream when the run is still
// in flight, so any remaining streamed events keep filling the grid. This is the
// trigger PR #241's recovery was missing: its only other caller (the spreadsheet
// chip) is not mounted anywhere. Fire-and-forget: the view is already up; the
// snapshot + reconnect land when they resolve. openWorkbook focuses (never
// refetches) the run that is actively streaming, so this can't clobber a live fill.
export function selectPopulatedTable(id) {
  const entry = get(populatedTables).find((a) => a.id === id);
  if (!entry) return;
  const tablePopulationId = entry.tablePopulationId || null;
  closeResultPanel();
  activeCommand.set(null);
  currentPopulatedTableId.set(id);
  currentView.set("results");
  if (tablePopulationId) void openWorkbook(tablePopulationId);
}

// "Home" is the chat surface (the user chose "New chat" as the default landing).
// Route to the thread view showing the current chat; the app bootstrap
// (App.svelte) opens a fresh chat on first sign-in so there is always one to show.
export function goHome() {
  currentPopulatedTableId.set(null);
  activeCommand.set(null);
  closeResultPanel();
  libraryPage.set({ section: "templates", templateId: null, databaseId: null, datasetId: null });
  currentView.set("thread");
}

export function goToResults() {
  // The caller (startTablePopulation) has already created a fresh record and pointed
  // currentPopulatedTableId at it, so the derived views are already empty — no flash
  // of a previous populated table's reasoning or grid, nothing to clear by hand.
  closeResultPanel();
  activeCommand.set(null);
  currentView.set("results");
}

// Open the full-page admin Settings console in the main content area (design B —
// not a modal). Section visibility is role-gated inside SettingsPage by the
// `userRole` store (auth-and-access §13): a clinician sees only General.
export function openSettings() {
  currentView.set("settings");
}

// Open the thread surface (the conversation surface). Switch the view; the
// ThreadView reads the open thread from stores/threads.js. Callers that want a
// FRESH chat call `startNewChat()` (stores/threads.js) first, then this — that
// opens the pending landing WITHOUT persisting a thread (the thread is minted on
// the first message). Navigation stays free of any thread API/data concerns.
export function openThreadView() {
  closeResultPanel();
  activeCommand.set(null);
  currentView.set("thread");
}
