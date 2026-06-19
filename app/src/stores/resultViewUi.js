import { writable } from "svelte/store";

export const RIGHT_PANEL_MODES = Object.freeze({
  INCLUSION_CRITERIA: "inclusion_criteria",
  AGENT_ACTIVITY: "agent_activity",
  CELL_EVIDENCE: "cell_evidence",
});

export const ACTIVITY_VISUAL_STATES = Object.freeze({
  RUNNING: "running",
  COMPLETE: "complete",
});

const RIGHT_PANEL_MODE_VALUES = new Set(Object.values(RIGHT_PANEL_MODES));
const ACTIVITY_VISUAL_STATE_VALUES = new Set(Object.values(ACTIVITY_VISUAL_STATES));
const IS_DEV = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);

function isRightPanelMode(mode) {
  return RIGHT_PANEL_MODE_VALUES.has(mode);
}

function isActivityVisualState(state) {
  return ACTIVITY_VISUAL_STATE_VALUES.has(state);
}

function guardEnum(name, value, validator) {
  if (validator(value)) return true;
  if (IS_DEV) throw new Error(`resultViewUi: invalid ${name} "${value}"`);
  return false;
}

const INITIAL_STATE = Object.freeze({
  rightPanelOpen: false,
  rightPanelMode: null, // "inclusion_criteria" | "agent_activity" | "cell_evidence" | null
  selectedCellRef: null,
  selectedCellMeta: null,
  // Conservative default: don't show running animation before run state hydration.
  activityVisualState: ACTIVITY_VISUAL_STATES.COMPLETE,
});

export const resultViewUiState = writable({ ...INITIAL_STATE });

// The cell-evidence command shown in the right panel (SQL + explanation +
// result). Result-view UI state, not run state — it lives here so navigation
// can clear it without importing the run stores. chat.js re-exports it for
// existing readers and owns runCommand/closeCommand.
export const activeCommand = writable(null);

// Monotonic tick the top-band status counters bump when clicked: the right
// panel opens in agent_activity and scrolls to the review-summary entry
// (doc 11 §Status counters). A counter is a pure open/scroll — never an action.
export const summaryScrollRequest = writable(0);

export function requestSummaryScroll() {
  openPanel(RIGHT_PANEL_MODES.AGENT_ACTIVITY);
  summaryScrollRequest.update((n) => n + 1);
}

export function openPanel(mode) {
  if (!guardEnum("rightPanelMode", mode, isRightPanelMode)) return;
  resultViewUiState.update((state) => ({
    ...state,
    rightPanelOpen: true,
    rightPanelMode: mode,
  }));
}

export function closePanel() {
  resultViewUiState.update((state) => ({
    ...state,
    rightPanelOpen: false,
    rightPanelMode: null,
  }));
}

// Toggle semantics: clicking the same already-open mode closes the panel;
// otherwise it opens (or switches mode) in one action.
export function togglePanel(mode) {
  if (!guardEnum("rightPanelMode", mode, isRightPanelMode)) return;
  resultViewUiState.update((state) => {
    if (state.rightPanelOpen && state.rightPanelMode === mode) {
      return {
        ...state,
        rightPanelOpen: false,
        rightPanelMode: null,
      };
    }
    return {
      ...state,
      rightPanelOpen: true,
      rightPanelMode: mode,
    };
  });
}

// Use when a grid cell is clicked: capture selection and force cell-evidence view.
export function openCellEvidence(cellRef, cellMeta) {
  resultViewUiState.update((state) => ({
    ...state,
    rightPanelOpen: true,
    rightPanelMode: RIGHT_PANEL_MODES.CELL_EVIDENCE,
    selectedCellRef: cellRef,
    selectedCellMeta: cellMeta,
  }));
}

// Keep the right-panel status in sync when the selected cell's metadata changes
// in-place (for example, dwell auto-review flips review_state to reviewed).
export function patchSelectedCellMeta(cellRef, patch) {
  if (!cellRef || !patch || typeof patch !== "object") return;
  resultViewUiState.update((state) => {
    if (!state.rightPanelOpen) return state;
    if (state.rightPanelMode !== RIGHT_PANEL_MODES.CELL_EVIDENCE) return state;
    if (state.selectedCellRef !== cellRef || !state.selectedCellMeta) return state;
    return {
      ...state,
      selectedCellMeta: {
        ...state.selectedCellMeta,
        ...patch,
      },
    };
  });
}

export function setActivityVisualState(state) {
  if (!guardEnum("activityVisualState", state, isActivityVisualState)) return;
  resultViewUiState.update((current) => ({
    ...current,
    activityVisualState: state,
  }));
}

export function initializeActivityVisualState({ runStatus } = {}) {
  if (runStatus === "running") {
    setActivityVisualState(ACTIVITY_VISUAL_STATES.RUNNING);
    return;
  }
  setActivityVisualState(ACTIVITY_VISUAL_STATES.COMPLETE);
}

export function resetResultViewUiState() {
  resultViewUiState.set({ ...INITIAL_STATE });
}
