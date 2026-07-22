import assert from "node:assert/strict";
import test from "node:test";
import {
  ARTIFACT_WORKSPACE_STATES,
  LUNG_MOC_ARTIFACT_ID,
  LUNG_MOC_TABLE_ID,
  createArtifactWorkspaceState,
  closeArtifact,
  closeEvidence,
  openArtifact,
  openPinnedArtifact,
  toggleChatFold,
  selectCell,
  togglePendingContextCell,
  commitContextChip,
  removeContextChip,
  clearContextChips,
  resolveConflictCell,
  addFollowUpNote,
  resolvedTable,
  cellClassFor,
  evidenceById,
  toggleContextCapture,
  openReportTab,
  activateTab,
  closeTab,
  matchFollowUp,
  startRun,
  revealCells,
  revealColumn,
  finishRun,
  cellAwaitingReview,
  reviewCell,
  demoArtifacts,
  demoAttentionItems,
  demoConflicts,
  demoInterpretedNotes,
  demoSourceDocs,
  followUpA,
  followUpB,
  lungMocRows,
  lungMocColumns,
  interpretedColumnIds,
  demoHistologyProvenance,
} from "./artifactWorkspaceDemo.js";

test("demo fixtures expose the lung MOC table and attention items", () => {
  assert.ok(demoArtifacts.find((artifact) => artifact.kind === "table" && artifact.id === LUNG_MOC_ARTIFACT_ID));
  assert.equal(demoAttentionItems.length, 2);
  assert.deepEqual(demoAttentionItems.map((item) => item.rowId), ["L-3402", "L-3404"]);
});

test("opening and closing the table moves between chat-only and split states", () => {
  const initial = createArtifactWorkspaceState();
  assert.equal(initial.workspaceState, ARTIFACT_WORKSPACE_STATES.ARTIFACT_CLOSED);

  const opened = openArtifact(initial);
  assert.equal(opened.workspaceState, ARTIFACT_WORKSPACE_STATES.CHAT_AND_ARTIFACT);
  assert.equal(opened.activeTabId, LUNG_MOC_ARTIFACT_ID);
  assert.equal(opened.tabs.length, 1);

  const closed = closeArtifact(opened);
  assert.equal(closed.workspaceState, ARTIFACT_WORKSPACE_STATES.ARTIFACT_CLOSED);
  assert.equal(closed.activeTabId, null);
  assert.deepEqual(closed.tabs, []);
});

test("opening the pinned table moves directly to the expanded artifact state", () => {
  const opened = openPinnedArtifact(createArtifactWorkspaceState());
  assert.equal(opened.workspaceState, ARTIFACT_WORKSPACE_STATES.ARTIFACT_EXPANDED);
});

test("folding chat toggles between split and expanded artifact states", () => {
  const opened = openArtifact(createArtifactWorkspaceState());
  const expanded = toggleChatFold(opened);
  assert.equal(expanded.workspaceState, ARTIFACT_WORKSPACE_STATES.ARTIFACT_EXPANDED);
  const split = toggleChatFold(expanded);
  assert.equal(split.workspaceState, ARTIFACT_WORKSPACE_STATES.CHAT_AND_ARTIFACT);
});

test("selecting an ordinary cell opens its evidence", () => {
  const opened = openArtifact(createArtifactWorkspaceState());
  const selected = selectCell(opened, LUNG_MOC_TABLE_ID, "L-3401", "pdl1");
  assert.equal(selected.activeEvidenceId, `cell:${LUNG_MOC_TABLE_ID}:L-3401:pdl1`);
  assert.deepEqual(selected.selectedCellRefs.map((ref) => ref.refId), [`cell:${LUNG_MOC_TABLE_ID}:L-3401:pdl1`]);

  const evidence = evidenceById(selected, selected.activeEvidenceId);
  assert.equal(evidence.kind, "simple");
  assert.match(evidence.selected, /L-3401 - PD-L1 TPS - 80%/);
});

test("selecting an invalid cell leaves state unchanged", () => {
  const opened = openArtifact(createArtifactWorkspaceState());
  const next = selectCell(opened, LUNG_MOC_TABLE_ID, "L-9999", "pdl1");
  assert.equal(next, opened);
});

test("closing evidence keeps the table open and clears only the selection", () => {
  const selected = selectCell(
    openArtifact(createArtifactWorkspaceState()),
    LUNG_MOC_TABLE_ID,
    "L-3401",
    "pdl1",
  );
  const closed = closeEvidence(selected);
  assert.equal(closed.activeTabId, LUNG_MOC_ARTIFACT_ID);
  assert.equal(closed.activeEvidenceId, null);
  assert.deepEqual(closed.selectedCellRefs, []);
});

test("selecting cells then committing folds them into one chip with the comment", () => {
  let state = toggleContextCapture(createArtifactWorkspaceState());
  state = togglePendingContextCell(state, LUNG_MOC_TABLE_ID, "L-3402", "treatment", { x: 1, y: 2 });
  state = togglePendingContextCell(state, LUNG_MOC_TABLE_ID, "L-3402", "treatment"); // re-click unselects
  assert.equal(state.pendingContextCells.length, 0);
  state = togglePendingContextCell(state, LUNG_MOC_TABLE_ID, "L-3402", "treatment"); // click again reselects
  state = togglePendingContextCell(state, LUNG_MOC_TABLE_ID, "L-3402", "stage");
  assert.equal(state.pendingContextCells.length, 2);
  assert.equal(state.contextChips.length, 0);

  const committed = commitContextChip(state, "why no durvalumab?");
  assert.equal(committed.contextChips.length, 1);
  assert.equal(committed.contextChips[0].comment, "why no durvalumab?");
  assert.equal(committed.contextChips[0].cells.length, 2);
  assert.equal(committed.pendingContextCells.length, 0);
  assert.equal(committed.contextCaptureMode, false);
});

test("committing with no pending cells is a no-op", () => {
  const state = toggleContextCapture(createArtifactWorkspaceState());
  assert.equal(commitContextChip(state, "hello"), state);
});

test("context chips can be removed and cleared", () => {
  let state = commitContextChip(
    togglePendingContextCell(toggleContextCapture(createArtifactWorkspaceState()), LUNG_MOC_TABLE_ID, "L-3402", "treatment"),
    "a",
  );
  state = commitContextChip(
    togglePendingContextCell(toggleContextCapture(state), LUNG_MOC_TABLE_ID, "L-3407", "treatment"),
    "b",
  );
  assert.equal(state.contextChips.length, 2);

  const removed = removeContextChip(state, state.contextChips[0].id);
  assert.equal(removed.contextChips.length, 1);
  assert.equal(removed.contextChips[0].comment, "b");

  const cleared = clearContextChips(state);
  assert.deepEqual(cleared.contextChips, []);
  assert.deepEqual(cleared.pendingContextCells, []);
});

test("the L-3404 PD-L1 cell starts as an unresolved conflict", () => {
  const state = createArtifactWorkspaceState();
  assert.equal(cellClassFor(state, LUNG_MOC_TABLE_ID, "L-3404", "pdl1"), "conflict");

  const evidence = evidenceById(state, `cell:${LUNG_MOC_TABLE_ID}:L-3404:pdl1`);
  assert.equal(evidence.kind, "conflict");
  assert.equal(evidence.sources.length, 2);
  assert.ok(evidence.sources.every((source) => source.accepted === null));
});

test("resolving a conflict writes the cell value, cell class, and a MOC Notes entry", () => {
  const resolved = resolveConflictCell(createArtifactWorkspaceState(), LUNG_MOC_TABLE_ID, "L-3404", "pdl1", "pathology");

  assert.equal(cellClassFor(resolved, LUNG_MOC_TABLE_ID, "L-3404", "pdl1"), "direct");
  const table = resolvedTable(resolved);
  const row = table.rows.find((candidate) => candidate.id === "L-3404");
  assert.equal(row.pdl1, "60%");
  assert.match(row.mocNotes, /PD-L1 conflict resolved: 60%.*accepted over 10%/);

  const evidence = evidenceById(resolved, `cell:${LUNG_MOC_TABLE_ID}:L-3404:pdl1`);
  assert.equal(evidence.kind, "conflict");
  const accepted = evidence.sources.find((source) => source.id === "pathology");
  const rejected = evidence.sources.find((source) => source.id === "reread");
  assert.equal(accepted.accepted, true);
  assert.equal(rejected.accepted, false);
});

test("resolving a conflict can be switched to the other source", () => {
  const first = resolveConflictCell(createArtifactWorkspaceState(), LUNG_MOC_TABLE_ID, "L-3404", "pdl1", "pathology");
  const switched = resolveConflictCell(first, LUNG_MOC_TABLE_ID, "L-3404", "pdl1", "reread");

  const table = resolvedTable(switched);
  const row = table.rows.find((candidate) => candidate.id === "L-3404");
  assert.equal(row.pdl1, "10%");
  assert.match(row.mocNotes, /PD-L1 conflict resolved: 10%.*accepted over 60%/);
});

test("resolving an unknown conflict cell leaves state unchanged", () => {
  const state = createArtifactWorkspaceState();
  const next = resolveConflictCell(state, LUNG_MOC_TABLE_ID, "L-3401", "pdl1", "pathology");
  assert.equal(next, state);
});

test("MOC Notes cells are blank until a follow-up writes them", () => {
  const state = createArtifactWorkspaceState();
  const table = resolvedTable(state);
  assert.ok(table.rows.every((row) => row.mocNotes === ""));
});

test("addFollowUpNote writes Follow-up A's precedent note for L-3402", () => {
  const written = addFollowUpNote(
    createArtifactWorkspaceState(),
    LUNG_MOC_TABLE_ID,
    followUpA.noteRowId,
    followUpA.noteText,
    followUpA.noteSourceIds,
  );
  const table = resolvedTable(written);
  const row = table.rows.find((candidate) => candidate.id === "L-3402");
  assert.equal(row.mocNotes, followUpA.noteText);
  // Doctor-owned notes are plain white cells, not yellow extractions.
  assert.equal(cellClassFor(written, LUNG_MOC_TABLE_ID, "L-3402", "mocNotes"), "direct");
});

test("addFollowUpNote writes Follow-up B's response note for L-3407", () => {
  const written = addFollowUpNote(
    createArtifactWorkspaceState(),
    LUNG_MOC_TABLE_ID,
    followUpB.noteRowId,
    followUpB.noteText,
    followUpB.noteSourceIds,
  );
  const table = resolvedTable(written);
  const row = table.rows.find((candidate) => candidate.id === "L-3407");
  assert.equal(row.mocNotes, followUpB.noteText);
});

test("follow-up B charts carry one scan id per data point", () => {
  for (const chart of followUpB.charts) {
    assert.equal(chart.values.length, chart.scanIds.length);
    assert.equal(chart.values.length, 3);
  }
});

test("conflict fixture has exactly the L-3404 PD-L1 cell", () => {
  assert.deepEqual(Object.keys(demoConflicts), [`cell:${LUNG_MOC_TABLE_ID}:L-3404:pdl1`]);
});

test("the streamed run reveals cells progressively then fills fully", () => {
  const started = startRun(createArtifactWorkspaceState(), 1000, "is everything ready for the lung MOC?");
  assert.equal(started.runStatus, "running");
  assert.equal(started.runUserText, "is everything ready for the lung MOC?");

  // Nothing revealed yet — the matrix is blank while running.
  let blank = resolvedTable(started);
  assert.ok(blank.rows.every((row) => row.histology === ""));
  assert.ok(blank.rows.every((row) => row.stage === ""));

  // Reveal a structured column in bulk + one interpreted cell.
  let s = revealColumn(started, "histology");
  s = revealCells(s, [{ rowId: "L-3401", columnId: "stage" }]);
  const partial = resolvedTable(s);
  assert.equal(partial.rows.find((r) => r.id === "L-3401").histology, "Adenocarcinoma");
  assert.equal(partial.rows.find((r) => r.id === "L-3402").histology, "Adenocarcinoma");
  assert.equal(partial.rows.find((r) => r.id === "L-3401").stage, "IVA");
  assert.equal(partial.rows.find((r) => r.id === "L-3402").stage, ""); // not revealed yet
  assert.ok(s.tableTick > started.tableTick);
  assert.deepEqual(s.lastUpdatedRefs, [{ rowId: "L-3401", columnId: "stage" }]);

  // Finishing reveals everything.
  const done = finishRun(s, 2000);
  assert.equal(done.runStatus, "done");
  const full = resolvedTable(done);
  assert.ok(full.rows.every((row) => row.stage !== ""));
  assert.equal(full.rows.find((r) => r.id === "L-3402").treatment.length > 0, true);
});

test("every interpreted cell has a note whose quotes appear verbatim in its body", () => {
  for (const row of lungMocRows) {
    for (const columnId of ["ecog", "stage", "treatment"]) {
      const note = demoInterpretedNotes[`${row.id}:${columnId}`];
      assert.ok(note, `missing note for ${row.id}:${columnId}`);
      assert.ok(note.quotes.length > 0);
      for (const quote of note.quotes) {
        assert.ok(note.body.includes(quote), `quote not in body for ${row.id}:${columnId}: "${quote}"`);
      }
    }
  }
});

test("interpreted cells surface their note as evidence and settle on review", () => {
  const state = createArtifactWorkspaceState();
  assert.equal(cellAwaitingReview(state, LUNG_MOC_TABLE_ID, "L-3401", "stage"), true);
  assert.equal(cellClassFor(state, LUNG_MOC_TABLE_ID, "L-3401", "stage"), "interpreted");

  const evidence = evidenceById(state, `cell:${LUNG_MOC_TABLE_ID}:L-3401:stage`);
  assert.equal(evidence.kind, "simple");
  const note = demoInterpretedNotes["L-3401:stage"];
  assert.deepEqual(evidence.evidence, note.quotes);
  assert.equal(evidence.result.rows[0][2], note.body);
  assert.equal(evidence.selectedCellMeta.review_state, "not_reviewed");

  const reviewed = reviewCell(state, LUNG_MOC_TABLE_ID, "L-3401", "stage");
  assert.equal(cellAwaitingReview(reviewed, LUNG_MOC_TABLE_ID, "L-3401", "stage"), false);
  assert.equal(cellClassFor(reviewed, LUNG_MOC_TABLE_ID, "L-3401", "stage"), "interpreted-reviewed");
  assert.ok(reviewed.tableTick > state.tableTick);
  assert.deepEqual(reviewed.lastUpdatedRefs, [{ rowId: "L-3401", columnId: "stage" }]);
  const after = evidenceById(reviewed, `cell:${LUNG_MOC_TABLE_ID}:L-3401:stage`);
  assert.equal(after.selectedCellMeta.review_state, "reviewed");

  // Structured cells and already-reviewed cells are no-ops.
  assert.equal(reviewCell(state, LUNG_MOC_TABLE_ID, "L-3401", "histology"), state);
  assert.equal(reviewCell(reviewed, LUNG_MOC_TABLE_ID, "L-3401", "stage"), reviewed);
});

test("revealCells is a no-op once the run is done", () => {
  const done = finishRun(startRun(createArtifactWorkspaceState(), 1, "moc"), 2);
  assert.equal(revealCells(done, [{ rowId: "L-3401", columnId: "stage" }]), done);
});

test("entering capture mode defocuses the current cell selection and evidence", () => {
  const selected = selectCell(createArtifactWorkspaceState(), LUNG_MOC_TABLE_ID, "L-3401", "pdl1");
  assert.equal(selected.selectedCellRefs.length, 1);
  const capture = toggleContextCapture(selected);
  assert.deepEqual(capture.selectedCellRefs, []);
  assert.equal(capture.activeEvidenceId, null);
});

test("toggleContextCapture flips capture mode and discards the pending selection", () => {
  const on = toggleContextCapture(createArtifactWorkspaceState());
  assert.equal(on.contextCaptureMode, true);
  const staged = togglePendingContextCell(on, LUNG_MOC_TABLE_ID, "L-3407", "treatment", { x: 10, y: 20 });
  assert.deepEqual(staged.contextComposerAnchor, { x: 10, y: 20 });
  assert.equal(staged.pendingContextCells.length, 1);
  const off = toggleContextCapture(staged);
  assert.equal(off.contextCaptureMode, false);
  assert.equal(off.contextComposerAnchor, null);
  assert.equal(off.pendingContextCells.length, 0);
});

test("matchFollowUp maps keywords (and translations) to the right follow-up", () => {
  assert.equal(matchFollowUp("Any similar cases before?"), followUpA);
  assert.equal(matchFollowUp("Zijn er vergelijkbare gevallen?"), followUpA);
  assert.equal(matchFollowUp("Response so far?"), followUpB);
  assert.equal(matchFollowUp("Quelle est la réponse au traitement?"), followUpB);
  assert.equal(matchFollowUp("Spricht die Erkrankung bisher an?"), followUpB);
  assert.equal(matchFollowUp("what is the histology"), null);
});

test("every follow-up note source id and cited link resolves to a source doc", () => {
  for (const id of [...followUpA.noteSourceIds, ...followUpB.noteSourceIds]) {
    assert.ok(demoSourceDocs[id], `missing source doc ${id}`);
  }
});

test("openReportTab opens a cited note as its own deduped tab", () => {
  const sourceId = followUpA.noteSourceIds[2]; // L-3011 declined note
  const opened = openReportTab(createArtifactWorkspaceState(), sourceId);
  assert.equal(opened.activeTabId, `report:${sourceId}`);
  const tab = opened.tabs.find((candidate) => candidate.id === `report:${sourceId}`);
  assert.equal(tab.kind, "note");
  assert.equal(tab.sourceId, sourceId);

  // Re-opening the same report focuses it, doesn't add a second tab.
  const again = openReportTab(opened, sourceId);
  assert.equal(again.tabs.length, 1);

  // A different report accumulates a second tab.
  const two = openReportTab(again, followUpA.noteSourceIds[0]);
  assert.equal(two.tabs.length, 2);
});

test("the table tab and report tabs coexist; closing tabs falls through to a neighbour then the tray", () => {
  let state = selectCell(createArtifactWorkspaceState(), LUNG_MOC_TABLE_ID, "L-3401", "pdl1");
  state = openReportTab(state, followUpB.noteSourceIds[0]); // a scan report tab
  assert.equal(state.tabs.length, 2);
  assert.equal(state.activeTabId, `report:${followUpB.noteSourceIds[0]}`);

  // Close the active report → falls back to the table tab.
  const backToTable = closeTab(state, state.activeTabId);
  assert.equal(backToTable.tabs.length, 1);
  assert.equal(backToTable.activeTabId, LUNG_MOC_ARTIFACT_ID);

  // Closing the last tab collapses the box.
  const collapsed = closeTab(backToTable, LUNG_MOC_ARTIFACT_ID);
  assert.equal(collapsed.workspaceState, ARTIFACT_WORKSPACE_STATES.ARTIFACT_CLOSED);
  assert.deepEqual(collapsed.tabs, []);
});

test("activateTab switches the active tab", () => {
  let state = selectCell(createArtifactWorkspaceState(), LUNG_MOC_TABLE_ID, "L-3401", "pdl1");
  state = openReportTab(state, followUpB.noteSourceIds[0]);
  const back = activateTab(state, LUNG_MOC_ARTIFACT_ID);
  assert.equal(back.activeTabId, LUNG_MOC_ARTIFACT_ID);
});

// --- Annexe 55 column set (issue #356) -------------------------------------

test("the matrix has the 10 Annexe 55 columns in order with the right color classes", () => {
  assert.deepEqual(
    lungMocColumns.map((c) => c.id),
    ["patient", "histology", "ecog", "tnm", "stage", "pdl1", "egfr", "ngs", "treatment", "mocNotes"],
  );
  assert.deepEqual(
    lungMocColumns.map((c) => c.title),
    ["Patient", "Histology", "ECOG", "TNM", "Stage", "PD-L1 TPS", "EGFR", "NGS/Molecular", "Treatment", "MOC Notes"],
  );
  // ECOG, Stage, Treatment, MOC Notes are interpreted (yellow); the rest direct.
  assert.deepEqual(
    lungMocColumns.filter((c) => c.cellClass === "interpreted").map((c) => c.id),
    ["ecog", "stage", "treatment", "mocNotes"],
  );
  // Biopsy / PET-CT are gone as columns.
  assert.ok(!lungMocColumns.some((c) => c.id === "biopsy" || c.id === "petct"));
});

test("interpretedColumnIds are ecog, stage, treatment (MOC Notes stays blank at open)", () => {
  assert.deepEqual(interpretedColumnIds, ["ecog", "stage", "treatment"]);
});

test("row values byte-match the spec §2 rows table", () => {
  const byId = Object.fromEntries(lungMocRows.map((r) => [r.id, r]));
  const expected = {
    "L-3401": ["Adenocarcinoma", "Ambulatory (1)", "cT2 cN3 cM1b", "IVA", "80%", "Negative", "Complete (KRAS G12C)", "Pembrolizumab, started (code 60)"],
    "L-3402": ["Adenocarcinoma", "Ambulatory (1)", "cT4 cN2 cM0", "IIIB", "Missing", "Negative", "Pending", "Concurrent chemo-RT, completed 2026-06-20 (code 25) — no consolidation immunotherapy (code 60) documented"],
    "L-3403": ["Squamous cell", "Ambulatory (1)", "cT2 cN0 cM1a", "IVA", "45%", "N/A (squamous)", "Complete", "Carbo/paclitaxel + pembrolizumab (code 66)"],
    "L-3404": ["Adenocarcinoma", "Fully active (0)", "cT2 cN2 cM1c", "IVB", "Conflicting (60% vs 10%)", "Positive (exon 19 del)", "Complete", "Osimertinib, started (code 45)"],
    "L-3405": ["Adenocarcinoma", "Fully active (0)", "pT1b pN0 cM0", "IA", "N/A (early stage)", "N/A", "N/A", "Surgery planned — awaiting surgical planning (code 10)"],
    "L-3406": ["NSCLC, NOS", "Self-care only (2)", "cT3 cN2 cM0", "IIIA", "Pending", "Pending", "Insufficient tissue (repeat requested)", "Not yet started — workup incomplete (code 90)"],
    "L-3407": ["Adenocarcinoma", "Ambulatory (1)", "cT2 cN2 cM1c", "IVB", "92%", "Negative", "Complete (ALK+)", "Alectinib, started 2026-05-30 (code 45)"],
    "L-3408": ["Adenocarcinoma", "Ambulatory (1)", "cT4 cN2 cM0", "IIIB", "70%", "Negative", "Complete", "Concurrent chemo-RT, ongoing (code 25)"],
    "L-3409": ["Small cell (SCLC)", "Ambulatory (1)", "cT3 cN3 cM1c", "Extensive stage", "N/A (SCLC)", "N/A", "N/A", "Carbo/etoposide + atezolizumab (code 66)"],
  };
  for (const [id, [histology, ecog, tnm, stage, pdl1, egfr, ngs, treatment]] of Object.entries(expected)) {
    const row = byId[id];
    assert.deepEqual(
      [row.histology, row.ecog, row.tnm, row.stage, row.pdl1, row.egfr, row.ngs, row.treatment],
      [histology, ecog, tnm, stage, pdl1, egfr, ngs, treatment],
      `row ${id}`,
    );
    assert.equal(row.mocNotes, "", `${id} MOC Notes blank at open`);
  }
});

test("Treatment carries a coded '(code NN)' marker; ECOG/TNM/Stage never do", () => {
  for (const row of lungMocRows) {
    // Treatment either names a code or is a still-blank plan line (none here).
    if (/\(code \d+\)/.test(row.treatment) === false) {
      // Every treatment in the fixture carries a code.
      assert.fail(`treatment for ${row.id} is missing a (code NN) marker: ${row.treatment}`);
    }
    assert.ok(!/code/.test(row.ecog), `ECOG for ${row.id} must not carry a code marker`);
    assert.ok(!/code/.test(row.tnm), `TNM for ${row.id} must not carry a code marker`);
    assert.ok(!/code/.test(row.stage), `Stage for ${row.id} must not carry a code marker`);
  }
});

test("histology evidence carries the Annexe 55 provenance block, coded as name (code)", () => {
  const state = createArtifactWorkspaceState();
  const evidence = evidenceById(state, `cell:${LUNG_MOC_TABLE_ID}:L-3401:histology`);
  assert.ok(evidence.provenance, "histology cell has a provenance block");
  const labels = evidence.provenance.fields.map((f) => f.label);
  assert.deepEqual(labels, ["Base of diagnosis", "Localisation · laterality", "Differentiation grade", "Biopsy", "PET-CT"]);
  // Coded fields render as name (code).
  assert.match(evidence.provenance.fields[0].value, /\(code \d+\)/);
  assert.equal(evidence.provenance.fields[0].value, "Histology of primary (code 2)");
  // L-3403 base of diagnosis is cytology (code 4), per spec.
  const l3403 = evidenceById(state, `cell:${LUNG_MOC_TABLE_ID}:L-3403:histology`);
  assert.equal(l3403.provenance.fields[0].value, "Cytology (code 4)");
  // Non-histology cells carry no provenance block.
  const pdl1 = evidenceById(state, `cell:${LUNG_MOC_TABLE_ID}:L-3401:pdl1`);
  assert.equal(pdl1.provenance, null);
});

test("L-3408 histology flags its 86-day-old biopsy as Old result in status, not cell colour", () => {
  const state = createArtifactWorkspaceState();
  const evidence = evidenceById(state, `cell:${LUNG_MOC_TABLE_ID}:L-3408:histology`);
  const biopsy = evidence.provenance.fields.find((f) => f.label === "Biopsy");
  assert.equal(biopsy.status, "Old result");
  assert.equal(evidence.selectedCellMeta.reason_code, "old_result");
  // Cell colour is unchanged — histology stays a direct (white) cell.
  assert.equal(cellClassFor(state, LUNG_MOC_TABLE_ID, "L-3408", "histology"), "direct");
});

test("ECOG cells are note-backed interpreted cells that settle on review", () => {
  const state = createArtifactWorkspaceState();
  assert.equal(cellClassFor(state, LUNG_MOC_TABLE_ID, "L-3404", "ecog"), "interpreted");
  assert.equal(cellAwaitingReview(state, LUNG_MOC_TABLE_ID, "L-3404", "ecog"), true);
  const evidence = evidenceById(state, `cell:${LUNG_MOC_TABLE_ID}:L-3404:ecog`);
  assert.equal(evidence.kind, "simple");
  assert.deepEqual(evidence.evidence, demoInterpretedNotes["L-3404:ecog"].quotes);
  const reviewed = reviewCell(state, LUNG_MOC_TABLE_ID, "L-3404", "ecog");
  assert.equal(cellClassFor(reviewed, LUNG_MOC_TABLE_ID, "L-3404", "ecog"), "interpreted-reviewed");
});

test("every patient has a histology provenance entry", () => {
  for (const row of lungMocRows) {
    assert.ok(demoHistologyProvenance[row.id], `missing provenance for ${row.id}`);
  }
});
