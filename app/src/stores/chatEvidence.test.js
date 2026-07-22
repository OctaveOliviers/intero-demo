import test from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";

globalThis.__INTERO_MOCK_ENV = { VITE_MOCK: "true" };

const {
  activeCommand,
  resultViewUiState,
  RIGHT_PANEL_MODES,
  openCellEvidence,
} = await import("./resultViewUi.js");
const { commandFromCitation, openChatCitationEvidence } = await import(
  "./chatEvidence.js"
);

test("commandFromCitation preserves aggregate denominator and covered rows", () => {
  const command = commandFromCitation({
    kind: "aggregate",
    database: "cord-ph",
    query: "SELECT COUNT(*) AS n FROM cord_ph_birth_records",
    table_column: "cord_ph_birth_records.patient_code",
    explanation: "count of birth records",
    denominator: { label: "birth records", value: 412 },
    completeness: { label: "cord pH recorded", value: "389/412" },
    covered_rows: [
      {
        database: "cord-ph",
        query: "SELECT patient_code FROM cord_ph_birth_records WHERE patient_code='CPH001'",
        table_column: "cord_ph_birth_records.patient_code",
      },
    ],
  });
  assert.equal(command.aggregate.denominator.value, 412);
  assert.equal(command.aggregate.coveredRows.length, 1);
});

test("openChatCitationEvidence opens the evidence panel and runs the citation query", async () => {
  openCellEvidence("A1", { state: "filled", review_state: "reviewed" });

  await openChatCitationEvidence({
    marker: "1",
    database: "cord-ph",
    query: "SELECT COUNT(*) AS n FROM cord_ph_birth_records",
    table_column: "cord_ph_birth_records.patient_code",
    explanation: "count of birth records",
  });

  const ui = get(resultViewUiState);
  assert.equal(ui.rightPanelOpen, true);
  assert.equal(ui.rightPanelMode, RIGHT_PANEL_MODES.CELL_EVIDENCE);
  assert.equal(ui.selectedCellRef, null);
  assert.equal(ui.selectedCellMeta, null);
  const command = get(activeCommand);
  assert.equal(command.loading, false);
  assert.equal(command.sql, "SELECT COUNT(*) AS n FROM cord_ph_birth_records");
  assert.ok(command.result);
});

test("openChatCitationEvidence carries clinical-note quote evidence", async () => {
  const quote = "diabetic ketoacidosis (DKA) at the time of new diagnosis";

  await openChatCitationEvidence({
    marker: "6",
    database: "diabetes",
    query: "SELECT AUTHOR_ROLE, DATE, NOTE_TYPE, TEXT FROM clinical_notes WHERE PATIENT = 'npda-patient-003' AND NOTE_TYPE IN ('admission')",
    table_column: "clinical_notes.TEXT",
    explanation: "admission note documenting DKA at new diagnosis for NPD003",
    citations: [quote],
  });

  const ui = get(resultViewUiState);
  assert.equal(ui.rightPanelOpen, true);
  assert.equal(ui.rightPanelMode, RIGHT_PANEL_MODES.CELL_EVIDENCE);
  const command = get(activeCommand);
  assert.equal(command.loading, false);
  assert.deepEqual(command.evidence, [quote]);
  assert.ok(command.result.rows.some((row) => row.some((cell) => String(cell).includes(quote))));
});
