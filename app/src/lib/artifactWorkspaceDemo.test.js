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
  addFollowUpNote,
  resolvedTable,
  cellClassFor,
  cellValue,
  conflictEvidenceFor,
  editField,
  fieldSources,
  patientForm,
  patientList,
  selectPatient,
  completePatient,
  FORM_SECTIONS,
  demoPriorTreatments,
  lungMocRecords,
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

test("the L-3404 PD-L1 field shows both readings and both their reports", () => {
  const state = createArtifactWorkspaceState();
  assert.equal(cellClassFor(state, LUNG_MOC_TABLE_ID, "L-3404", "pdl1"), "conflict");

  const evidence = evidenceById(state, `cell:${LUNG_MOC_TABLE_ID}:L-3404:pdl1`);
  assert.equal(evidence.kind, "conflict");
  assert.deepEqual(
    evidence.sources.map((source) => source.value),
    ["60%", "10%"],
  );

  // Both reports are reachable from the field's own source control too.
  assert.equal(fieldSources(state, LUNG_MOC_TABLE_ID, "L-3404", "pdl1").length, 2);
});

test("editing a conflicting field settles it but keeps both reports traceable", () => {
  const edited = editField(createArtifactWorkspaceState(), LUNG_MOC_TABLE_ID, "L-3404", "pdl1", "10%");

  assert.equal(cellClassFor(edited, LUNG_MOC_TABLE_ID, "L-3404", "pdl1"), "edited");
  const row = resolvedTable(edited).rows.find((candidate) => candidate.id === "L-3404");
  assert.equal(row.pdl1, "10%");
  // Resolving by editing does NOT erase the provenance: both disagreeing
  // reports stay on the field's source control, and the side-by-side conflict
  // evidence still opens — the resolution is always traceable to what disagreed.
  assert.equal(fieldSources(edited, LUNG_MOC_TABLE_ID, "L-3404", "pdl1").length, 2);
  const conflict = conflictEvidenceFor(edited, LUNG_MOC_TABLE_ID, "L-3404", "pdl1");
  assert.equal(conflict.kind, "conflict");
  assert.deepEqual(
    conflict.sources.map((source) => source.value),
    ["60%", "10%"],
  );
  // The conflict cell never degrades to a single fabricated database row.
  const evidence = evidenceById(edited, `cell:${LUNG_MOC_TABLE_ID}:L-3404:pdl1`);
  assert.equal(evidence.kind, "conflict");
  // Nothing is written anywhere else on the clinician's behalf.
  assert.equal(row.mocNotes, "");
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

test("the form is 15 fields in six sections, patient id being the page title", () => {
  assert.deepEqual(
    FORM_SECTIONS.map((section) => section.key),
    ["diagnosis", "staging", "performance", "molecular", "treatment", "moc"],
  );
  const fieldIds = FORM_SECTIONS.flatMap((section) => section.fieldIds);
  assert.deepEqual(fieldIds, [
    "histology",
    "baseOfDiagnosis",
    "localisation",
    "differentiation",
    "tnm",
    "stage",
    "biopsy",
    "petct",
    "ecog",
    "pdl1",
    "egfr",
    "ngs",
    "previousTreatment",
    "treatment",
    "mocNotes",
  ]);
  assert.equal(fieldIds.length, 15);
  // Patient is the page title, so it belongs to no section.
  assert.ok(!fieldIds.includes("patient"));
  // Every field in a section is a real field, and none is listed twice.
  assert.equal(new Set(fieldIds).size, fieldIds.length);
  for (const id of fieldIds) assert.ok(lungMocColumns.some((column) => column.id === id), id);
});

test("only the three prose fields take a multi-line box", () => {
  assert.deepEqual(
    lungMocColumns.filter((column) => column.kind === "prose").map((column) => column.id),
    ["previousTreatment", "treatment", "mocNotes"],
  );
});

test("interpretedColumnIds cover the fields read out of free text", () => {
  assert.deepEqual(interpretedColumnIds, ["ecog", "stage", "previousTreatment", "treatment"]);
});

test("row values byte-match the spec §2 rows table", () => {
  const byId = Object.fromEntries(lungMocRows.map((r) => [r.id, r]));
  const expected = {
    // L-3401 progressed on its first line, so the fact half stops at "stopped";
    // L-3402's completed chemo-RT has moved to Previous treatments, leaving
    // exactly the gap the opening flags.
    "L-3401": ["Adenocarcinoma", "Ambulatory (1)", "cT2 cN3 cM1b", "IVA", "80%", "Negative", "Complete (KRAS G12C)", "Stopped at progression — no new line started (code 90)"],
    "L-3402": ["Adenocarcinoma", "Ambulatory (1)", "cT4 cN2 cM0", "IIIB", "Missing", "Negative", "Pending", "No consolidation immunotherapy (code 60) documented"],
    "L-3403": ["Squamous cell", "Ambulatory (1)", "cT2 cN0 cM1a", "IVA", "45%", "N/A (squamous)", "Complete", "Carbo/paclitaxel + pembrolizumab (code 66)"],
    "L-3404": ["Adenocarcinoma", "Fully active (0)", "cT2 cN2 cM1c", "IVB", "Conflicting (60% vs 10%)", "Positive (exon 19 del)", "Complete", "Osimertinib, started (code 45)"],
    "L-3405": ["Adenocarcinoma", "Fully active (0)", "pT1b pN0 cM0", "IA", "N/A (early stage)", "N/A", "N/A", "Surgery planned — awaiting surgical planning (code 10)"],
    "L-3406": ["NSCLC, NOS", "Self-care only (2)", "cT3 cN2 cM0", "IIIA", "Pending", "Pending", "Insufficient tissue (repeat requested)", "Not yet started — workup incomplete (code 90)"],
    "L-3407": ["Adenocarcinoma", "Ambulatory (1)", "cT2 cN2 cM1c", "IVB", "92%", "Negative", "Complete (ALK+)", "Alectinib, started 2026-05-30 (code 45)"],
    "L-3408": ["Adenocarcinoma", "Ambulatory (1)", "cT4 cN2 cM0", "IIIB", "70%", "Negative", "Complete", "Concurrent chemo-RT, ongoing (code 25)"],
    "L-3409": ["Small cell (SCLC)", "Ambulatory (1)", "cT3 cN3 cM1c", "Extensive stage", "N/A (SCLC)", "N/A", "N/A", "Carbo/etoposide + atezolizumab, re-challenge (code 66)"],
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

test("histology evidence is a plain structured lookup — the provenance block is gone", () => {
  const state = createArtifactWorkspaceState();
  const evidence = evidenceById(state, `cell:${LUNG_MOC_TABLE_ID}:L-3401:histology`);
  assert.equal(evidence.kind, "simple");
  // The Annexe 55 fields are their own form fields now, not an appended block.
  assert.equal(evidence.provenance, undefined);
  // A direct field: a structured query, no highlighted note quotes.
  assert.match(evidence.query, /condition_occurrence/);
  assert.equal(evidence.evidence, undefined);
});

test("the promoted Annexe 55 fields read as structured lookups, never as notes", () => {
  const state = createArtifactWorkspaceState();
  const queryFor = (col) => evidenceById(state, `cell:${LUNG_MOC_TABLE_ID}:L-3401:${col}`).query;
  assert.match(queryFor("baseOfDiagnosis"), /condition_occurrence/);
  assert.match(queryFor("localisation"), /condition_occurrence/);
  assert.match(queryFor("differentiation"), /condition_occurrence/);
  assert.match(queryFor("biopsy"), /procedure_occurrence/);
  assert.match(queryFor("petct"), /procedure_occurrence/);
  for (const col of ["baseOfDiagnosis", "localisation", "differentiation", "biopsy", "petct"]) {
    assert.doesNotMatch(queryFor(col), /note_nlp/, `${col} must not read as a note`);
  }
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

// --- The form view-model ----------------------------------------------------

test("patientForm returns the page a clinician reads: title, summary, sections", () => {
  const state = createArtifactWorkspaceState();
  const form = patientForm(state, "L-3401");

  assert.equal(form.title, "L-3401");
  assert.equal(form.summary, "Adenocarcinoma · IVA");
  assert.deepEqual(
    form.sections.map((section) => section.title),
    ["Diagnosis", "Staging & workup", "Performance", "Molecular", "Treatment", "MOC"],
  );
  assert.equal(
    form.sections.flatMap((section) => section.fields).length,
    FORM_SECTIONS.flatMap((section) => section.fieldIds).length,
  );
});

test("patientForm defaults to the selected patient and rejects an unknown one", () => {
  const state = createArtifactWorkspaceState();
  assert.equal(patientForm(state).patientId, state.selectedPatientId);
  assert.equal(patientForm(state, "L-9999"), null);
});

test("the artifact never opens on an empty panel", () => {
  assert.equal(createArtifactWorkspaceState().selectedPatientId, lungMocRows[0].id);
});

test("selectPatient switches the page; an unknown id changes nothing", () => {
  const state = createArtifactWorkspaceState();
  assert.equal(selectPatient(state, "L-3407").selectedPatientId, "L-3407");
  assert.equal(selectPatient(state, "L-9999"), state);
});

test("the promoted Annexe 55 fields carry real values on every patient", () => {
  const state = createArtifactWorkspaceState();
  for (const row of lungMocRows) {
    for (const fieldId of ["baseOfDiagnosis", "localisation", "differentiation", "biopsy", "petct"]) {
      assert.notEqual(cellValue(state, LUNG_MOC_TABLE_ID, row.id, fieldId), "", `${row.id}.${fieldId}`);
    }
  }
  // They are the same values the histology provenance block used to hide.
  const form = patientForm(state, "L-3401");
  const field = (id) => form.sections.flatMap((s) => s.fields).find((f) => f.id === id);
  assert.equal(field("localisation").value, demoHistologyProvenance["L-3401"].localisation);
  assert.equal(field("biopsy").value, demoHistologyProvenance["L-3401"].biopsy);
});

test("field status marks extractions, conflicts and clinician edits — and nothing else", () => {
  const state = createArtifactWorkspaceState();
  const statusOf = (rowId, fieldId) => cellClassFor(state, LUNG_MOC_TABLE_ID, rowId, fieldId);

  assert.equal(statusOf("L-3401", "tnm"), "direct");
  assert.equal(statusOf("L-3401", "stage"), "interpreted");
  assert.equal(statusOf("L-3404", "pdl1"), "conflict");
  // A blank MOC Notes before the meeting is not something to review.
  assert.equal(statusOf("L-3401", "mocNotes"), "direct");
  assert.equal(cellAwaitingReview(state, LUNG_MOC_TABLE_ID, "L-3401", "mocNotes"), false);
});

test("an interpretive field settles once its evidence has been dwelt on", () => {
  const state = createArtifactWorkspaceState();
  assert.equal(cellAwaitingReview(state, LUNG_MOC_TABLE_ID, "L-3401", "stage"), true);

  const reviewed = reviewCell(state, LUNG_MOC_TABLE_ID, "L-3401", "stage");
  assert.equal(cellClassFor(reviewed, LUNG_MOC_TABLE_ID, "L-3401", "stage"), "interpreted-reviewed");
  assert.equal(cellAwaitingReview(reviewed, LUNG_MOC_TABLE_ID, "L-3401", "stage"), false);
});

test("editing a field also settles its review — correcting a value is reviewing it", () => {
  const edited = editField(createArtifactWorkspaceState(), LUNG_MOC_TABLE_ID, "L-3401", "stage", "IVB");
  assert.equal(cellAwaitingReview(edited, LUNG_MOC_TABLE_ID, "L-3401", "stage"), false);
  assert.equal(cellClassFor(edited, LUNG_MOC_TABLE_ID, "L-3401", "stage"), "edited");
});

test("an edit survives navigating to another patient and back", () => {
  let state = editField(createArtifactWorkspaceState(), LUNG_MOC_TABLE_ID, "L-3401", "ecog", "Ambulatory (1) — confirmed");
  state = selectPatient(state, "L-3407");
  state = selectPatient(state, "L-3401");

  assert.equal(cellValue(state, LUNG_MOC_TABLE_ID, "L-3401", "ecog"), "Ambulatory (1) — confirmed");
  assert.equal(cellClassFor(state, LUNG_MOC_TABLE_ID, "L-3401", "ecog"), "edited");
});

test("an edit outranks an agent write, and is never mistaken for one", () => {
  let state = addFollowUpNote(createArtifactWorkspaceState(), LUNG_MOC_TABLE_ID, "L-3402", "agent text", []);
  assert.equal(cellClassFor(state, LUNG_MOC_TABLE_ID, "L-3402", "mocNotes"), "direct");

  state = editField(state, LUNG_MOC_TABLE_ID, "L-3402", "mocNotes", "my own words");
  assert.equal(cellValue(state, LUNG_MOC_TABLE_ID, "L-3402", "mocNotes"), "my own words");
  assert.equal(cellClassFor(state, LUNG_MOC_TABLE_ID, "L-3402", "mocNotes"), "edited");
});

test("editing an unknown field changes nothing", () => {
  const state = createArtifactWorkspaceState();
  assert.equal(editField(state, LUNG_MOC_TABLE_ID, "L-3401", "nosuchfield", "x"), state);
});

// --- Sources ----------------------------------------------------------------

test("every field on every patient can be traced to a document", () => {
  const state = createArtifactWorkspaceState();
  for (const row of lungMocRows) {
    for (const section of patientForm(state, row.id).sections) {
      for (const field of section.fields) {
        // MOC Notes is deliberately blank until the meeting; everything the
        // agent filled carries at least one source.
        if (String(field.value).trim() === "") continue;
        assert.ok(field.sources.length >= 1, `${row.id}.${field.id} has no source`);
        assert.ok(field.sources.every((source) => source.id && source.title));
      }
    }
  }
});

test("editing a field keeps its source — the provenance does not vanish", () => {
  const state = createArtifactWorkspaceState();
  const before = fieldSources(state, LUNG_MOC_TABLE_ID, "L-3401", "tnm");
  const edited = editField(state, LUNG_MOC_TABLE_ID, "L-3401", "tnm", "cT3 cN3 cM1b");
  // The record still shows where the original value came from, even though the
  // clinician has since corrected it.
  assert.deepEqual(fieldSources(edited, LUNG_MOC_TABLE_ID, "L-3401", "tnm"), before);
  assert.ok(before.length >= 1);
});

test("clearing a field's value drops its source", () => {
  const edited = editField(createArtifactWorkspaceState(), LUNG_MOC_TABLE_ID, "L-3401", "tnm", "   ");
  assert.deepEqual(fieldSources(edited, LUNG_MOC_TABLE_ID, "L-3401", "tnm"), []);
});

test("an empty field offers no source", () => {
  const state = createArtifactWorkspaceState();
  assert.deepEqual(fieldSources(state, LUNG_MOC_TABLE_ID, "L-3401", "mocNotes"), []);
});

// --- Previous treatments ----------------------------------------------------

test("Previous treatments reads one line per prior treatment", () => {
  const state = createArtifactWorkspaceState();
  const lines = cellValue(state, LUNG_MOC_TABLE_ID, "L-3401", "previousTreatment").split("\n");
  assert.equal(lines.length, 3);
  assert.deepEqual(lines, [
    "2025-11-12 — Carboplatin/pemetrexed + pembrolizumab, 4 cycles (code 66)",
    "2026-03-04 — Pemetrexed/pembrolizumab maintenance (code 60)",
    "2026-05-28 — Progression on maintenance — systemic therapy stopped",
  ]);
});

test("L-3409 relapsed after a platinum-free interval, which is why its current line is a re-challenge", () => {
  const state = createArtifactWorkspaceState();
  const lines = cellValue(state, LUNG_MOC_TABLE_ID, "L-3409", "previousTreatment").split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[2], /platinum-free interval 6 months/);
  assert.match(cellValue(state, LUNG_MOC_TABLE_ID, "L-3409", "treatment"), /re-challenge/);
});

test("L-3402's completed chemo-RT is a previous treatment, leaving the gap the opening flags", () => {
  const state = createArtifactWorkspaceState();
  assert.match(cellValue(state, LUNG_MOC_TABLE_ID, "L-3402", "previousTreatment"), /Concurrent chemo-RT completed/);
  assert.equal(
    cellValue(state, LUNG_MOC_TABLE_ID, "L-3402", "treatment"),
    "No consolidation immunotherapy (code 60) documented",
  );
});

test("the other six patients are treatment-naive, and even that absence is sourced", () => {
  const state = createArtifactWorkspaceState();
  const naive = lungMocRows.filter((row) => !demoPriorTreatments[row.id]);
  assert.equal(naive.length, 6);
  for (const row of naive) {
    assert.equal(
      cellValue(state, LUNG_MOC_TABLE_ID, row.id, "previousTreatment"),
      "No prior systemic therapy, radiotherapy or surgery documented.",
    );
    // The record review IS the evidence for an absence.
    const sources = fieldSources(state, LUNG_MOC_TABLE_ID, row.id, "previousTreatment");
    assert.equal(sources.length, 1);
    assert.match(sources[0].title, /record review/i);
  }
});

test("Previous treatments is interpretive where a history was read, direct where nothing was found", () => {
  const state = createArtifactWorkspaceState();
  assert.equal(cellClassFor(state, LUNG_MOC_TABLE_ID, "L-3401", "previousTreatment"), "interpreted");
  assert.equal(cellClassFor(state, LUNG_MOC_TABLE_ID, "L-3403", "previousTreatment"), "direct");
});

// --- The cohort rail --------------------------------------------------------

test("the rail lists every patient with a clinical one-liner", () => {
  const state = createArtifactWorkspaceState();
  const rail = patientList(state);

  assert.equal(rail.length, lungMocRows.length);
  assert.deepEqual(rail.map((entry) => entry.id), lungMocRows.map((row) => row.id));
  assert.equal(rail[0].summary, "Adenocarcinoma · IVA");
  assert.equal(rail.at(-1).summary, "Small cell (SCLC) · Extensive stage");
  assert.equal(rail.filter((entry) => entry.selected).length, 1);
});

test("outside a run every patient reads complete", () => {
  assert.ok(patientList(createArtifactWorkspaceState()).every((entry) => entry.complete));
});

test("during a run a patient is complete only once its own last field has landed", () => {
  let state = startRun(createArtifactWorkspaceState(), 0, "is everything ready for the MOC?");
  assert.ok(patientList(state).every((entry) => !entry.complete));

  // Revealing everything but the last field is not enough.
  for (const fieldId of ["histology", "tnm", "ecog", "stage", "previousTreatment"]) {
    state = revealCells(state, [{ rowId: "L-3401", columnId: fieldId }]);
  }
  assert.equal(patientList(state).find((entry) => entry.id === "L-3401").complete, false);

  state = completePatient(state, "L-3401");
  const rail = patientList(state);
  assert.equal(rail.find((entry) => entry.id === "L-3401").complete, true);
  assert.equal(rail.find((entry) => entry.id === "L-3402").complete, false);
});

test("finishing the run completes the whole cohort", () => {
  const state = finishRun(startRun(createArtifactWorkspaceState(), 0, ""), 1);
  assert.ok(patientList(state).every((entry) => entry.complete));
});

test("a field still filling is blank, carries no status and offers no source", () => {
  const state = startRun(createArtifactWorkspaceState(), 0, "");
  const field = patientForm(state, "L-3401").sections
    .flatMap((section) => section.fields)
    .find((candidate) => candidate.id === "stage");

  assert.equal(field.value, "");
  assert.equal(field.revealed, false);
  assert.equal(field.status, "direct");
  assert.deepEqual(field.sources, []);
});

test("an attention line points at a field the form can open", () => {
  const state = createArtifactWorkspaceState();
  for (const item of demoAttentionItems) {
    const form = patientForm(state, item.rowId);
    assert.ok(form, item.rowId);
    const field = form.sections.flatMap((section) => section.fields).find((f) => f.id === item.columnId);
    assert.ok(field, `${item.rowId}.${item.columnId} is not on the form`);
  }
});

test("lungMocRecords carries the promoted fields without mutating the base rows", () => {
  assert.equal(lungMocRecords.length, lungMocRows.length);
  assert.ok(!("previousTreatment" in lungMocRows[0]), "base fixture stays untouched");
  assert.ok("previousTreatment" in lungMocRecords[0]);
});
