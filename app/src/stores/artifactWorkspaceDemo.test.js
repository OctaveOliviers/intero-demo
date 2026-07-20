import assert from "node:assert/strict";
import test from "node:test";
import { get } from "svelte/store";
import {
  artifactWorkspaceDemoState,
  resetArtifactWorkspaceDemo,
  openDemoArtifact,
  openDemoPinnedArtifact,
  closeDemoArtifact,
  closeDemoEvidence,
  toggleDemoChatFold,
  toggleDemoContextCapture,
  selectDemoCell,
  toggleDemoPendingContextCell,
  commitDemoContextChip,
  clearDemoContextChips,
  removeDemoContextChip,
  resolveDemoConflictCell,
  addDemoFollowUpNote,
  openDemoReportTab,
} from "./artifactWorkspaceDemo.js";
import {
  ARTIFACT_WORKSPACE_STATES,
  LUNG_MOC_ARTIFACT_ID,
  LUNG_MOC_TABLE_ID,
  resolvedTable,
  cellClassFor,
} from "../lib/artifactWorkspaceDemo.js";

test("store actions expose the artifact workspace transitions", () => {
  resetArtifactWorkspaceDemo();
  assert.equal(get(artifactWorkspaceDemoState).workspaceState, ARTIFACT_WORKSPACE_STATES.ARTIFACT_CLOSED);

  openDemoArtifact();
  assert.equal(get(artifactWorkspaceDemoState).activeTabId, LUNG_MOC_ARTIFACT_ID);

  toggleDemoChatFold();
  assert.equal(get(artifactWorkspaceDemoState).workspaceState, ARTIFACT_WORKSPACE_STATES.ARTIFACT_EXPANDED);

  toggleDemoChatFold();
  selectDemoCell(LUNG_MOC_TABLE_ID, "L-3401", "pdl1");
  assert.equal(get(artifactWorkspaceDemoState).selectedCellRefs.length, 1);

  closeDemoArtifact();
  assert.equal(get(artifactWorkspaceDemoState).workspaceState, ARTIFACT_WORKSPACE_STATES.ARTIFACT_CLOSED);
});

test("opening the pinned table uses the expanded artifact workspace", () => {
  resetArtifactWorkspaceDemo();
  openDemoPinnedArtifact();
  assert.equal(get(artifactWorkspaceDemoState).activeTabId, LUNG_MOC_ARTIFACT_ID);
  assert.equal(get(artifactWorkspaceDemoState).workspaceState, ARTIFACT_WORKSPACE_STATES.ARTIFACT_EXPANDED);
});

test("closing evidence hides the panel without closing the table", () => {
  resetArtifactWorkspaceDemo();
  openDemoArtifact();
  selectDemoCell(LUNG_MOC_TABLE_ID, "L-3401", "pdl1");
  closeDemoEvidence();
  assert.equal(get(artifactWorkspaceDemoState).activeTabId, LUNG_MOC_ARTIFACT_ID);
  assert.equal(get(artifactWorkspaceDemoState).activeEvidenceId, null);
});

test("context chips can be committed, removed, and cleared via the store", () => {
  resetArtifactWorkspaceDemo();
  toggleDemoContextCapture();
  toggleDemoPendingContextCell(LUNG_MOC_TABLE_ID, "L-3402", "treatment");
  commitDemoContextChip("why no durvalumab?");
  assert.equal(get(artifactWorkspaceDemoState).contextChips.length, 1);
  assert.equal(get(artifactWorkspaceDemoState).pendingContextCells.length, 0);

  const chipId = get(artifactWorkspaceDemoState).contextChips[0].id;
  removeDemoContextChip(chipId);
  assert.equal(get(artifactWorkspaceDemoState).contextChips.length, 0);

  toggleDemoContextCapture();
  toggleDemoPendingContextCell(LUNG_MOC_TABLE_ID, "L-3407", "treatment");
  commitDemoContextChip("response?");
  clearDemoContextChips();
  assert.equal(get(artifactWorkspaceDemoState).contextChips.length, 0);
});

test("resolving the PD-L1 conflict via the store updates the cell and MOC Notes", () => {
  resetArtifactWorkspaceDemo();
  resolveDemoConflictCell(LUNG_MOC_TABLE_ID, "L-3404", "pdl1", "pathology");

  const state = get(artifactWorkspaceDemoState);
  assert.equal(cellClassFor(state, LUNG_MOC_TABLE_ID, "L-3404", "pdl1"), "direct");
  const row = resolvedTable(state).rows.find((candidate) => candidate.id === "L-3404");
  assert.equal(row.pdl1, "60%");
  assert.match(row.mocNotes, /PD-L1 conflict resolved/);
});

test("adding a follow-up note via the store writes the MOC Notes cell", () => {
  resetArtifactWorkspaceDemo();
  addDemoFollowUpNote(LUNG_MOC_TABLE_ID, "L-3402", "Precedent (2 cases): ...", ["a", "b"]);
  const row = resolvedTable(get(artifactWorkspaceDemoState)).rows.find((candidate) => candidate.id === "L-3402");
  assert.equal(row.mocNotes, "Precedent (2 cases): ...");
});

test("context capture and report tabs flow through the store", () => {
  resetArtifactWorkspaceDemo();
  toggleDemoContextCapture();
  assert.equal(get(artifactWorkspaceDemoState).contextCaptureMode, true);
  toggleDemoPendingContextCell(LUNG_MOC_TABLE_ID, "L-3407", "treatment", { x: 5, y: 6 });
  assert.deepEqual(get(artifactWorkspaceDemoState).contextComposerAnchor, { x: 5, y: 6 });

  openDemoReportTab("l3011-oncology-note-2026-05-06");
  assert.equal(get(artifactWorkspaceDemoState).activeTabId, "report:l3011-oncology-note-2026-05-06");
});
