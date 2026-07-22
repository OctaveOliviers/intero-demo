// Demo data for the Intero front-end demo.
//
// Everything here is fake but grounded in the existing fixtures (cord-ph under
// database/cord-ph/, plus a parallel chest-pain set for Flow B). It powers the
// whole demo with no backend: the home analyses, the EHR / Lab / Radiology
// databases, the populated workbooks, the live-population timelines, the
// SQL/note evidence, and the sample doctor's email for Flow B.
//
// Two value kinds (README §6.5):
//   • DIRECT      — copied verbatim from a structured EHR table
//   • INTERPRETIVE — derived by reading free-text clinical notes
//
// Datasets share one descriptor shape (see buildDataset):
//   • cordAll / cordNicu — Flow A, the uploaded "Cord pH (local)" audit. Two
//     sheets ("ALL" and "NICU") faithfully reproduce data/templates/
//     cord-ph-lo-audit.xlsx, including the blank spacer columns.
//   • chestPain          — Flow B, built live from the pasted chest-pain email
//
// This module is pure data + builders — no Svelte stores, no env. mock.js wires
// it into the table-population API layer.
//
// All human-readable (translatable) strings live in the locale-selected content
// pack (src/lib/mock/content). This module reads them via CONTENT and keeps the
// logic — SQL, identifiers, numbers, dates, codes, cadence, timeline assembly.

import { CONTENT } from "./mock/content/index.js";
import { ARTIFACT_WORKSPACE_THREAD_ID } from "./artifactWorkspaceDemo.js";

// --- Databases (README §6.2) ------------------------------------------------
// The picker offers patient notes, lab results and radiology. MOCK_DATABASE
// remains the EHR id used as the source tag on populated cell metadata — it
// is intentionally not exposed in the picker list.
export const MOCK_DATABASES = CONTENT.databases;
export const MOCK_DATABASE = { id: "ehr-db", name: CONTENT.ehrDatabaseName };

// --- Pre-loaded analyses (home list) ----------------------------------------
// Display-only decorations so the home screen looks lived-in. Cord pH is NOT
// here — the user uploads it live (Flow A). Running any of these replays the
// cord-pH dataset, which is acceptable for the demo.
export const MOCK_ANALYSES = CONTENT.analyses;

// The cord-pH template the user uploads live (Flow A). Kept for the upload
// handler's default filters; it is not seeded into the home list.
export const MOCK_TEMPLATE = CONTENT.cordTemplate;

// --- Generic helpers --------------------------------------------------------
// Zero-based column index -> A1 letters. Must handle multi-letter columns
// (AA, AB, … AQ): the cord-pH "ALL" sheet is 43 columns wide.
const colLetter = (i) => {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

// Parse an A1 ref like "C4" into zero-based { row, col }.
export function parseRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return { row: 0, col: 0 };
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: parseInt(m[2], 10) - 1, col: col - 1 };
}

// Random integer in [min, max] — drives the irregular population cadence.
function rnd(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// A compact structured result. `rows` is an array of rows (each an array of
// cell values); an empty `rows` is a valid "lookup ran, returned nothing".
function structuredResult(columns, rows) {
  return { columns, rows, rowCount: rows.length, durationMs: rnd(3, 9) };
}

// One row per source note (long TEXT column = NoteEvidenceView body).
function noteResult(notes) {
  return {
    columns: ["AUTHOR_ROLE", "DATE", "NOTE_TYPE", "TEXT"],
    rows: notes.map((n) => [n.role, n.date, n.type, n.text]),
    rowCount: notes.length,
    durationMs: rnd(5, 12),
  };
}

// ===========================================================================
// Dataset 1 — Cord pH (local) audit (Flow A) — two sheets: ALL + NICU
// ===========================================================================
//
// Reproduces data/templates/cord-ph-lo-audit.xlsx exactly: same sheets, same
// column headers (incl. the blank spacer columns F/L/S/AC on ALL and J on
// NICU), fully populated for every baby. Every populated cell is either:
//   • DIRECT      — copied from a structured EHR table (carries a SELECT, a
//                   structured result leading with PATIENT_CODE, meta.kind
//                   "direct"); or
//   • INTERPRETIVE — read from a free-text clinical note (carries a notes
//                   query, a note-backed result, meta.kind "interpretive", and
//                   an `evidence` array of verbatim quoted spans).
// Where something genuinely was not done, the cell carries an explicit label
// (e.g. "N/A", "Not done") backed by a lookup that proves the query ran — never
// a mysterious blank.

// The note types every baby's clinical_notes can carry.
const CORD_NOTE_TYPES = new Set([
  "antenatal", "birth_summary", "delivery", "resuscitation", "postnatal",
  "nicu_admission", "neurology_report", "discharge",
]);

const CORDPH_RECORDS = CONTENT.records.cord;

// ALL-sheet row order = every baby; this is also the contract's patient count.
const CORDPH_ROW_ORDER = ["CPH001", "CPH002", "CPH003", "CPH004", "CPH005", "CPH006", "CPH007", "CPH008", "CPH009"];
// NICU sheet has a row only for babies with Admitted to NICU = Yes.
const CORDPH_NICU_ROW_ORDER = ["CPH002", "CPH006", "CPH009"];

// The contract's "N patients match" must equal the ALL-sheet row count.
export const CORDPH_PATIENT_COUNT = CORDPH_ROW_ORDER.length;

// Sheet 1 — "ALL". Column order matches the template exactly, INCLUDING the
// blank spacer columns F/L/S/AC (empty header, empty non-clickable cells).
const CORDPH_ALL_COLUMNS = CONTENT.columns.cordAll;

// Sheet 2 — "NICU". J is a blank spacer column.
const CORDPH_NICU_COLUMNS = CONTENT.columns.cordNicu;

// Translatable strings: short value labels (L) and the right-panel explanation
// functions (X). The builders read every human string from these; the logic
// (codes, SQL, identifiers) stays here.
const L = CONTENT.labels;
const X = CONTENT.explain;

// --- Cord cell builders -----------------------------------------------------
// A DIRECT cell: SELECT PATIENT_CODE, <column> FROM <table>. `resultValue`
// (when given) is what the SQL row shows while `value` is what the cell shows —
// used for graceful "N/A"/"Not done" labels backed by a null field.
function cordDirect({ code, ref, db, table, column, value, resultValue, explanation }) {
  const sql = `SELECT PATIENT_CODE, ${column} FROM ${table} WHERE PATIENT_CODE = '${code}'`;
  const rv = resultValue !== undefined ? resultValue : value;
  return {
    ref, value, sql,
    result: structuredResult(["PATIENT_CODE", column], [[code, rv]]),
    meta: { kind: "direct", database: db, sql, explanation },
  };
}

// An INTERPRETIVE cell: a notes query over the baby's clinical_notes filtered
// to the relevant NOTE_TYPE(s), with verbatim quoted `evidence` spans.
function cordInterp({ r, ref, db, value, noteTypes, evidence, explanation }) {
  const inList = noteTypes.map((t) => `'${t}'`).join(", ");
  const sql = `SELECT AUTHOR_ROLE, DATE, NOTE_TYPE, TEXT FROM clinical_notes WHERE PATIENT = '${r.baby}' AND NOTE_TYPE IN (${inList})`;
  const notes = r.notes.filter((n) => noteTypes.includes(n.type));
  return {
    ref, value, sql,
    result: noteResult(notes),
    meta: { kind: "interpretive", database: db, sql, evidence, explanation },
  };
}

// The cord-gas panel (pH / BE / lactate share one SELECT). CPH003's sample
// clotted → "Unavailable" via the birth-summary note; CPH007 has no lactate →
// "Not recorded" while the panel shows the null field.
function gasCell(colKey, { r, ref, db }) {
  if (r.phMissing) {
    return cordInterp({
      r, ref, db, value: L.unavailable, noteTypes: ["birth_summary"], evidence: r.phEvidence,
      explanation: X.gasUnavailable(r.code),
    });
  }
  const sql = `SELECT PATIENT_CODE, Cord_arterial_pH, Cord_arterial_BE, Cord_arterial_lactate FROM cord_ph_birth_records WHERE PATIENT_CODE = '${r.code}'`;
  const value = colKey === "ph" ? r.cordPh
    : colKey === "be" ? r.baseExcess
    : (r.lactate == null ? L.notRecorded : r.lactate);
  const explanation = colKey === "lactate" && r.lactate == null
    ? X.gasLactateNotRecorded(r.code)
    : X.gasPanel(r.code);
  return {
    ref, value, sql,
    result: structuredResult(
      ["PATIENT_CODE", "Cord_arterial_pH", "Cord_arterial_BE", "Cord_arterial_lactate"],
      [[r.code, r.cordPh, r.baseExcess, r.lactate]],
    ),
    meta: { kind: "direct", database: db, sql, explanation },
  };
}

// The three repeat-gas fields. When no repeat gas was performed (or the lactate
// never normalised) the cell shows an explicit label backed by a null field.
function repeatGasField({ r, ref, db, column, value, label }) {
  if (r.gasRepeated !== L.yes) {
    return cordDirect({
      code: r.code, ref, db, table: "repeated_gas", column, value: L.na, resultValue: null,
      explanation: X.repeatGasNone(r.code, label),
    });
  }
  if (value === L.notNormalised) {
    return cordDirect({
      code: r.code, ref, db, table: "repeated_gas", column, value: L.notNormalised, resultValue: null,
      explanation: X.repeatGasNotNormalised(r.code, label),
    });
  }
  return cordDirect({
    code: r.code, ref, db, table: "repeated_gas", column, value,
    explanation: X.repeatGasValue(r.code, label),
  });
}

// Build one populated cell for the ALL sheet.
function makeCordAllCell(colKey, { r, ref, db }) {
  // One genuinely unresolvable cell, so the blocked state + its reason are
  // visible in the demo: CPH009 was transferred to the regional centre on day 7
  // and never discharged home from this unit, so there is no age-at-discharge.
  if (r.code === "CPH009" && colKey === "ageDischargeHome") {
    return {
      ref,
      value: "",
      meta: {
        kind: "direct",
        state: "blocked",
        database: db,
        reason_code: "NOT_LOCATED",
        reason_detail: CONTENT.blockedReason.cordAgeDischargeHome,
      },
    };
  }
  const i = r.i;
  switch (colKey) {
    case "patient": {
      const sql = `SELECT PATIENT_CODE FROM patient_demographics WHERE PATIENT_CODE = '${r.code}'`;
      return {
        ref, value: r.code, sql,
        result: structuredResult(["PATIENT_CODE"], [[r.code]]),
        meta: { kind: "direct", database: db, sql, explanation: X.cordPatient(r.code) },
      };
    }
    case "gestWeeks": return cordDirect({ code: r.code, ref, db, table: "cord_ph_birth_records", column: "Gestation_weeks", value: r.gestWeeks, explanation: X.cordGestWeeks(r.code) });
    case "gestDays": return cordDirect({ code: r.code, ref, db, table: "cord_ph_birth_records", column: "Gestation_days", value: r.gestDays, explanation: X.cordGestDays(r.code) });
    case "maternalAge": return cordDirect({ code: r.code, ref, db, table: "patient_demographics", column: "Maternal_age", value: r.maternalAge, explanation: X.cordMaternalAge(r.code) });
    case "parity": return cordDirect({ code: r.code, ref, db, table: "patient_demographics", column: "Parity", value: r.parity, explanation: X.cordParity(r.code) });

    case "foetalMovements": return cordInterp({ r, ref, db, value: i.fm.v, noteTypes: ["antenatal"], evidence: i.fm.e, explanation: X.cordFoetalMovements(r.code) });
    case "maternalComorbidities": return cordInterp({ r, ref, db, value: i.mc.v, noteTypes: ["antenatal"], evidence: i.mc.e, explanation: X.cordMaternalComorbidities(r.code) });
    case "maternalComorbiditiesOther": return cordInterp({ r, ref, db, value: i.mco.v, noteTypes: ["antenatal"], evidence: i.mco.e, explanation: X.cordMaternalComorbiditiesOther(r.code) });

    case "normalScans": return cordDirect({ code: r.code, ref, db, table: "antenatal_scans", column: "Normal_scans", value: r.normalScans, explanation: X.cordNormalScans(r.code) });
    case "normalDopplers": return cordDirect({ code: r.code, ref, db, table: "antenatal_scans", column: "Normal_dopplers", value: r.normalDopplers, explanation: X.cordNormalDopplers(r.code) });

    case "ctgDone": return cordDirect({ code: r.code, ref, db, table: "ctg", column: "CTG_done", value: r.ctgDone, explanation: r.ctgDone === L.yes ? X.cordCtgDoneYes(r.code) : X.cordCtgDoneNo(r.code) });

    case "liquorMeconium": return cordInterp({ r, ref, db, value: i.lm.v, noteTypes: ["birth_summary"], evidence: i.lm.e, explanation: X.cordLiquorMeconium(r.code) });
    case "chorioamnionitis": return cordInterp({ r, ref, db, value: i.chorio.v, noteTypes: ["birth_summary"], evidence: i.chorio.e, explanation: X.cordChorioamnionitis(r.code) });
    case "prom": return cordInterp({ r, ref, db, value: i.prom.v, noteTypes: ["antenatal"], evidence: i.prom.e, explanation: X.cordProm(r.code) });
    case "rffs": return cordInterp({ r, ref, db, value: i.rffs.v, noteTypes: ["antenatal"], evidence: i.rffs.e, explanation: X.cordRffs(r.code) });
    case "sentinelEvent": return cordInterp({ r, ref, db, value: i.sentinel.v, noteTypes: ["birth_summary"], evidence: i.sentinel.e, explanation: X.cordSentinelEvent(r.code) });

    case "delivery": return cordDirect({ code: r.code, ref, db, table: "cord_ph_birth_records", column: "Delivery", value: r.delivery, explanation: X.cordDelivery(r.code) });
    case "birthWeight": return cordDirect({ code: r.code, ref, db, table: "cord_ph_birth_records", column: "Birth_weight_grams", value: r.birthWeight, explanation: X.cordBirthWeight(r.code) });
    case "apgar1": return cordDirect({ code: r.code, ref, db, table: "cord_ph_birth_records", column: "Apgars_1", value: r.apgar1, explanation: X.cordApgar1(r.code) });
    case "apgar5": return cordDirect({ code: r.code, ref, db, table: "cord_ph_birth_records", column: "Apgars_5", value: r.apgar5, explanation: X.cordApgar5(r.code) });
    case "apgar10": return cordDirect({ code: r.code, ref, db, table: "cord_ph_birth_records", column: "Apgars_10", value: r.apgar10, explanation: X.cordApgar10(r.code) });

    case "dcc": return cordInterp({
      r, ref, db, value: i.dcc.v, noteTypes: ["birth_summary", "delivery"], evidence: i.dcc.e,
      explanation: i.dcc.v === L.yes ? X.cordDccYes(r.code) : X.cordDccNo(r.code),
    });

    case "ph":
    case "be":
    case "lactate": return gasCell(colKey, { r, ref, db });

    case "intubated": return cordInterp({ r, ref, db, value: i.intub.v, noteTypes: ["resuscitation"], evidence: i.intub.e, explanation: X.cordIntubated(r.code) });
    case "compressions": return cordInterp({ r, ref, db, value: i.compress.v, noteTypes: ["resuscitation"], evidence: i.compress.e, explanation: X.cordCompressions(r.code) });
    case "drugs": return cordInterp({ r, ref, db, value: i.drugs.v, noteTypes: ["resuscitation"], evidence: i.drugs.e, explanation: X.cordDrugs(r.code) });

    case "ward": return cordDirect({ code: r.code, ref, db, table: "encounters", column: "Ward", value: r.ward, explanation: X.cordWard(r.code) });
    case "gasRepeated": return cordDirect({ code: r.code, ref, db, table: "repeated_gas", column: "Gas_repeated", value: r.gasRepeated, explanation: r.gasRepeated === L.yes ? X.cordGasRepeatedYes(r.code) : X.cordGasRepeatedNo(r.code) });
    case "ageRepeatedGas": return repeatGasField({ r, ref, db, column: "Age_at_repeated_gas_hours", value: r.ageRepeatedGas, label: X.repeatGasLabelAge });
    case "repeatedLactate": return repeatGasField({ r, ref, db, column: "Repeated_lactate", value: r.repeatedLactate, label: X.repeatGasLabelLactate });
    case "ageGasNormalised": return repeatGasField({ r, ref, db, column: "Age_gas_normalised_hours", value: r.ageGasNormalised, label: X.repeatGasLabelNormalised });

    case "hypoglycaemia": return cordInterp({ r, ref, db, value: i.hypo.v, noteTypes: ["postnatal"], evidence: i.hypo.e, explanation: X.cordHypoglycaemia(r.code) });
    case "admittedNicu": return cordDirect({ code: r.code, ref, db, table: "nicu_admissions", column: "Admitted_to_NICU", value: r.admittedNicu, explanation: X.cordAdmittedNicu(r.code) });

    case "ageDischargeHome":
      if (r.ageDischargeHome == null) {
        return cordDirect({ code: r.code, ref, db, table: "discharges", column: "Age_at_discharge_home_days", value: L.naTransferred, resultValue: null, explanation: X.cordAgeDischargeHomeTransferred(r.code) });
      }
      return cordDirect({ code: r.code, ref, db, table: "discharges", column: "Age_at_discharge_home_days", value: r.ageDischargeHome, explanation: X.cordAgeDischargeHome(r.code) });

    case "unitQuestionnaire": return cordDirect({ code: r.code, ref, db, table: "audit_governance", column: "Unit_level_questionnaire_filled", value: r.unitQuestionnaire, explanation: X.cordUnitQuestionnaire() });
    case "guidelineCordGas": return cordDirect({ code: r.code, ref, db, table: "audit_governance", column: "Local_guideline_cord_gas_sampling", value: r.guidelineCordGas, explanation: X.cordGuidelineCordGas() });
    case "guidelineFetalAcidosis": return cordDirect({ code: r.code, ref, db, table: "audit_governance", column: "Local_guideline_fetal_acidosis", value: r.guidelineFetalAcidosis, explanation: X.cordGuidelineFetalAcidosis() });

    default:
      return { ref, value: "" }; // blank spacer columns (F/L/S/AC)
  }
}

// Build one populated cell for the NICU sheet (NICU-admitted babies only).
function makeCordNicuCell(colKey, { r, ref, db }) {
  const n = r.n;
  switch (colKey) {
    case "nnuAdmitAge": return cordDirect({ code: r.code, ref, db, table: "nicu_admissions", column: "Age_at_NNU_admission_hours", value: n.admitAge, explanation: X.nicuAdmitAge(r.code) });
    case "cooled": return cordInterp({ r, ref, db, value: n.cooled.v, noteTypes: ["nicu_admission"], evidence: n.cooled.e, explanation: X.nicuCooled(r.code) });
    case "ageCooling": return cordInterp({ r, ref, db, value: n.ageCooling.v, noteTypes: ["nicu_admission"], evidence: n.ageCooling.e, explanation: n.ageCooling.v === L.na ? X.nicuAgeCoolingNA(r.code) : X.nicuAgeCooling(r.code) });
    case "transferredOut": return cordDirect({ code: r.code, ref, db, table: "nicu_admissions", column: "Transferred_out", value: n.transferredOut, explanation: X.nicuTransferredOut(r.code) });
    case "cfm": return cordInterp({ r, ref, db, value: n.cfm.v, noteTypes: ["nicu_admission", "neurology_report"], evidence: n.cfm.e, explanation: n.cfm.explanation });
    case "seizures": return cordInterp({ r, ref, db, value: n.seizures.v, noteTypes: ["neurology_report"], evidence: n.seizures.e, explanation: X.nicuSeizures(r.code) });
    case "clinicalSeizures": return cordInterp({ r, ref, db, value: n.clinical.v, noteTypes: ["neurology_report"], evidence: n.clinical.e, explanation: X.nicuClinicalSeizures(r.code) });
    case "electrographicSeizure": return cordInterp({ r, ref, db, value: n.electro.v, noteTypes: ["neurology_report"], evidence: n.electro.e, explanation: X.nicuElectrographicSeizure(r.code) });
    case "mriInjury": return cordInterp({ r, ref, db, value: n.mri.v, noteTypes: ["neurology_report"], evidence: n.mri.e, explanation: X.nicuMriInjury(r.code) });
    case "durationNicu": return cordDirect({ code: r.code, ref, db, table: "nicu_admissions", column: "Duration_of_admission_days", value: n.durationDays, explanation: X.nicuDurationNicu(r.code) });
    case "ageDischargeHomeNicu":
      if (r.ageDischargeHome == null) {
        return cordDirect({ code: r.code, ref, db, table: "nicu_admissions", column: "Age_at_discharge_home_days", value: L.naTransferred, resultValue: null, explanation: X.nicuAgeDischargeHomeTransferred(r.code) });
      }
      return cordDirect({ code: r.code, ref, db, table: "nicu_admissions", column: "Age_at_discharge_home_days", value: r.ageDischargeHome, explanation: X.nicuAgeDischargeHome(r.code) });
    case "feeding": return cordInterp({ r, ref, db, value: n.feeding.v, noteTypes: ["discharge"], evidence: n.feeding.e, explanation: X.nicuFeeding(r.code) });
    case "abnormalNeurology": return cordInterp({ r, ref, db, value: n.abnNeuro.v, noteTypes: ["discharge"], evidence: n.abnNeuro.e, explanation: X.nicuAbnormalNeurology(r.code) });

    default:
      return { ref, value: "" }; // blank spacer column (J)
  }
}

// ===========================================================================
// Dataset 2 — Chest Pain (Flow B / the pasted email)
// ===========================================================================

// ~8 adult chest-pain attendances. Direct fields come from EHR tables
// (patient_encounters, troponin, ecg_results); interpretive fields are read
// from the triage / cardiology / discharge-summary notes. Two cells are
// deliberately missing (CP004 troponin haemolysed, CP005 no ECG recorded).
const CHESTPAIN_RECORDS = CONTENT.records.chest;

const CHESTPAIN_ROW_ORDER = ["CP001", "CP002", "CP003", "CP004", "CP005", "CP006", "CP007", "CP008"];

const CHESTPAIN_COLUMNS = CONTENT.columns.chest;

// Build one populated cell for the chest-pain dataset. Direct cells lead with
// PATIENT_CODE; interpretive cells quote verbatim spans from the notes.
function makeChestPainCell(colKey, { r, ref, db }) {
  const notesSql = (types) =>
    `SELECT AUTHOR_ROLE, DATE, NOTE_TYPE, TEXT FROM clinical_notes WHERE PATIENT_CODE = '${r.code}' AND NOTE_TYPE ${types}`;

  switch (colKey) {
    case "patient":
      return { ref, value: r.code };

    case "age": {
      const sql = `SELECT PATIENT_CODE, Age FROM patient_encounters WHERE PATIENT_CODE = '${r.code}'`;
      return {
        ref, value: r.age, sql,
        result: structuredResult(["PATIENT_CODE", "Age"], [[r.code, r.age]]),
        meta: { kind: "direct", database: db, sql, explanation: X.chestAge(r.code) },
      };
    }

    case "complaint": {
      const sql = notesSql("= 'triage'");
      return {
        ref, value: r.complaint, sql,
        result: noteResult([r.notes.triage]),
        meta: { kind: "interpretive", database: db, sql, evidence: r.complaintEvidence, explanation: X.chestComplaint(r.code) },
      };
    }

    case "troponin": {
      // CP004 — sample haemolysed, no result. "Unavailable" backed by the lab note.
      if (r.troponinMissing) {
        const sql = notesSql("= 'lab'");
        return {
          ref, value: L.unavailable, sql,
          result: noteResult([r.notes.lab]),
          meta: { kind: "interpretive", database: db, sql, evidence: r.troponinEvidence, explanation: X.chestTroponinUnavailable(r.code) },
        };
      }
      const sql = `SELECT PATIENT_CODE, Troponin_ng_L FROM troponin WHERE PATIENT_CODE = '${r.code}'`;
      return {
        ref, value: r.troponin, sql,
        result: structuredResult(["PATIENT_CODE", "Troponin_ng_L"], [[r.code, r.troponin]]),
        meta: { kind: "direct", database: db, sql, explanation: X.chestTroponin(r.code) },
      };
    }

    case "ecg": {
      // CP005 — no ECG recorded. Empty but clickable, backed by an empty lookup.
      if (r.ecgMissing) {
        const sql = `SELECT PATIENT_CODE, ECG_rhythm, ST_changes FROM ecg_results WHERE PATIENT_CODE = '${r.code}'`;
        return {
          ref, value: "", sql,
          result: structuredResult(["PATIENT_CODE", "ECG_rhythm", "ST_changes"], []),
          meta: { kind: "direct", database: db, sql, explanation: X.chestEcgMissing() },
        };
      }
      const sql = notesSql("= 'cardiology'");
      return {
        ref, value: r.ecg, sql,
        result: noteResult([r.notes.cardiology]),
        meta: { kind: "interpretive", database: db, sql, evidence: r.ecgEvidence, explanation: X.chestEcg(r.code) },
      };
    }

    case "timeToEcg": {
      if (r.ecgMissing) {
        const sql = `SELECT PATIENT_CODE, Time_to_ECG_min FROM ecg_results WHERE PATIENT_CODE = '${r.code}'`;
        return {
          ref, value: "", sql,
          result: structuredResult(["PATIENT_CODE", "Time_to_ECG_min"], []),
          meta: { kind: "direct", database: db, sql, explanation: X.chestTimeToEcgMissing() },
        };
      }
      const sql = `SELECT PATIENT_CODE, Time_to_ECG_min FROM ecg_results WHERE PATIENT_CODE = '${r.code}'`;
      return {
        ref, value: r.timeToEcg, sql,
        result: structuredResult(["PATIENT_CODE", "Time_to_ECG_min"], [[r.code, r.timeToEcg]]),
        meta: { kind: "direct", database: db, sql, explanation: X.chestTimeToEcg(r.code) },
      };
    }

    case "diagnosis": {
      const sql = notesSql("IN ('cardiology','discharge_summary')");
      const notes = [r.notes.cardiology, r.notes.discharge].filter(Boolean);
      return {
        ref, value: r.diagnosis, sql,
        result: noteResult(notes),
        meta: { kind: "interpretive", database: db, sql, evidence: r.diagnosisEvidence, explanation: X.chestDiagnosis(r.code) },
      };
    }

    case "decision": {
      const sql = notesSql("= 'discharge_summary'");
      return {
        ref, value: r.decision, sql,
        result: noteResult([r.notes.discharge]),
        meta: { kind: "interpretive", database: db, sql, evidence: r.decisionEvidence, explanation: X.chestDecision(r.code) },
      };
    }

    default:
      return { ref, value: "" };
  }
}

// ===========================================================================
// Dataset 3 — NPDA paediatric diabetes (local) audit (Flow C) — one sheet
// ===========================================================================
//
// The National Paediatric Diabetes Audit (NPDA): one row per child/young person
// with type 1 (or type 2) diabetes seen during the audit year. Same two value
// kinds as the cord audit:
//   • DIRECT      — copied from structured EHR tables (demographics, the
//                   diabetes diagnosis, the clinic observation panel, the
//                   surveillance-screening dates).
//   • INTERPRETIVE — read from the free-text diabetes-clinic, psychology,
//                   annual-review and admission notes.
// Genuine "not done / not due / not applicable" cases carry an explicit label
// backed by a lookup that proves the query ran — never a mysterious blank.

const NPDA_NOTE_TYPES = new Set([
  "diabetes_clinic", "psychology", "annual_review", "admission",
]);

const NPDA_RECORDS = CONTENT.records.npda;

// One row per child seen in the audit year; this is also the contract's count.
const NPDA_ROW_ORDER = [
  "NPD001", "NPD002", "NPD003", "NPD004", "NPD005", "NPD006",
  "NPD007", "NPD008", "NPD009", "NPD010", "NPD011", "NPD012",
];

// The contract's "N patients match" must equal the NPDA row count.
export const NPDA_PATIENT_COUNT = NPDA_ROW_ORDER.length;

// Single sheet — "NPDA". The full NPDA 2026 core dataset: all 59 data items in
// the order they appear in the dataset document, grouped into the seven sections
// by blank spacer columns (_s1.._s6).
const NPDA_COLUMNS = CONTENT.columns.npda;
const DW = CONTENT.diabetesWorklist;

const DIABETES_WORKLIST_COLUMNS = DW.columns;

const DIABETES_WORKLIST_ROW_ORDER = [
  "NPD002", "NPD003", "NPD005", "NPD006", "NPD007", "NPD008", "NPD010",
];

// --- NPDA permitted-value code maps (NPDA 2026 dataset spec) -----------------
// Every populated NPDA cell holds the audit's *coded* permitted value — a
// number or letter — not free text. The cell's source evidence (the SQL result
// row for direct fields, or the highlighted source note for interpretive ones)
// surfaces the underlying descriptive value, and the explanation states the
// mapping. So clicking ethnic-category "H" reveals "Asian - Indian", coded H.
// Dates render DD/MM/YYYY and measurements follow the spec formats.

// 10-digit NHS numbers (item 1). Rows are still keyed internally on PATIENT_ID
// (NPD###); the NHS number is a demographic field like any other.
const NPDA_NHS = {
  NPD001: "9990014725", NPD002: "9990026731", NPD003: "9990033412",
  NPD004: "9990047958", NPD005: "9990052203", NPD006: "9990068849",
  NPD007: "9990071164", NPD008: "9990089517", NPD009: "9990094470",
  NPD010: "9990103386", NPD011: "9990117729", NPD012: "9990126052",
};

// Per-record extra fields for the new/2026 NPDA items. Kept beside the records
// (like NPDA_NHS) so the record bodies above stay focused on the original demo
// narrative. Codes are the NPDA permitted values; descriptive labels live in the
// code maps below. Conditional items (thyroid for type 2, coeliac/immunotherapy
// for the newly diagnosed, admission therapies for DKA, etc.) are derived in the
// cell builders from the record itself and so are not repeated here.
const NPDA_EXTRA = {
  NPD001: { postcode: "M20 4BX", gpPractice: "P81045", adhdAsd: 4, learningDisability: 2, otherMed: 1, thyroidTreatment: 1, glutenFree: 2, mentalHealthAppt: 4, fluDate: "2025-10-15" },
  NPD002: { postcode: "M14 5HD", gpPractice: "M83012", adhdAsd: 1, learningDisability: 2, otherMed: 1, thyroidTreatment: 1, glutenFree: 2, mentalHealthAppt: 1, fluDate: "2025-11-05" },
  NPD003: { postcode: "OL8 1NX", gpPractice: "L84021", adhdAsd: 4, learningDisability: 2, otherMed: 1, thyroidTreatment: 1, glutenFree: 2, mentalHealthAppt: 4, fluDate: null, immunotherapy: 2, coeliacDate: "2026-02-05", admStart: "2026-01-22", admDischarge: "2026-01-27", dkaTherapy: 4, initialPh: "7.18", initialBicarb: "12.0" },
  NPD004: { postcode: "M16 7AB", gpPractice: "P81045", adhdAsd: 4, learningDisability: 2, otherMed: 1, thyroidTreatment: 1, glutenFree: 2, mentalHealthAppt: 4, fluDate: "2025-10-09" },
  NPD005: { postcode: "SK4 3QL", gpPractice: "G85533", adhdAsd: 4, learningDisability: 2, otherMed: 1, thyroidTreatment: 2, glutenFree: 2, mentalHealthAppt: 2, fluDate: "2025-10-22", leavingDate: "2026-02-28", leavingReason: 1 },
  NPD006: { postcode: "M9 8RT", gpPractice: "M83012", adhdAsd: 1, learningDisability: 1, otherMed: 1, thyroidTreatment: 1, glutenFree: 2, mentalHealthAppt: 1, fluDate: "2025-11-12", admStart: "2025-08-07", admDischarge: "2025-08-11", dkaTherapy: 4, initialPh: "7.05", initialBicarb: "8.0" },
  NPD007: { postcode: "M22 0DE", gpPractice: "N81044", adhdAsd: 4, learningDisability: 2, otherMed: 1, thyroidTreatment: 1, glutenFree: 2, mentalHealthAppt: 4, fluDate: "2025-10-05", immunotherapy: 1, immunotherapyDate: "2025-09-20", coeliacDate: "2025-10-01" },
  NPD008: { postcode: "M33 2GH", gpPractice: "C84017", adhdAsd: 2, learningDisability: 2, otherMed: 1, thyroidTreatment: 1, glutenFree: 2, mentalHealthAppt: 4, fluDate: "2025-10-30" },
  NPD009: { postcode: "BL3 5JP", gpPractice: "B86025", adhdAsd: 4, learningDisability: 2, otherMed: 1, thyroidTreatment: 1, glutenFree: 1, mentalHealthAppt: 4, fluDate: "2025-10-18" },
  NPD010: { postcode: "WA15 8LM", gpPractice: "K82019", adhdAsd: 4, learningDisability: 2, otherMed: 1, thyroidTreatment: 1, glutenFree: 2, mentalHealthAppt: 4, fluDate: "2025-10-02" },
  NPD011: { postcode: "M40 1RS", gpPractice: "M83012", adhdAsd: 4, learningDisability: 2, otherMed: 1, thyroidTreatment: 1, glutenFree: 2, mentalHealthAppt: 4, fluDate: "2025-11-14" },
  NPD012: { postcode: "OL9 6TU", gpPractice: "L84021", adhdAsd: 4, learningDisability: 2, otherMed: 2, thyroidTreatment: 1, glutenFree: 2, mentalHealthAppt: 1, fluDate: "2025-10-25" },
};

// --- NPDA code maps (codes/keys are logic; labels live in CONTENT.codeMaps) --
// Pulled from the locale content pack so the displayed labels translate while the
// permitted-value codes and lookup keys (which logic matches on) stay fixed.
const SEX_CODE = CONTENT.codeMaps.sex;                       // item 4
const ETHNICITY = CONTENT.codeMaps.ethnicity;               // item 5
const DIABETES_TYPE = CONTENT.codeMaps.diabetesType;        // item 8
const INSULIN_REGIME = CONTENT.codeMaps.insulinRegime;      // item 21
const CGM_CODE = CONTENT.codeMaps.cgm;                      // item 24
const YESNO_CODE = CONTENT.codeMaps.yesNo;                  // items 23, 48, 51
const SMOKING_CODE = CONTENT.codeMaps.smoking;              // item 43
const RETINAL_CODE = CONTENT.codeMaps.retinal;             // item 33
const ADMISSION_DKA = CONTENT.codeMaps.admissionDka;        // item 55
const ADHD_ASD = CONTENT.codeMaps.adhdAsd;                  // item 6
const YESNO99 = CONTENT.codeMaps.yesNo99;                   // items 7, 25, 26, 42
const LEAVING_REASON = CONTENT.codeMaps.leavingReason;      // item 11
const OTHER_MED = CONTENT.codeMaps.otherMed;                // item 22
const ALBUMINURIA_STAGE = CONTENT.codeMaps.albuminuriaStage; // item 36
const THYROID_TX = CONTENT.codeMaps.thyroidTx;             // item 40
const MENTAL_HEALTH_APPT = CONTENT.codeMaps.mentalHealthAppt; // item 49
const DKA_THERAPY = CONTENT.codeMaps.dkaTherapy;           // item 57

// Audit year 2025/26 runs 1 Apr 2025 – 31 Mar 2026; used to flag the newly
// diagnosed (whose coeliac-screening and immunotherapy items apply).
const AUDIT_YEAR_START = "2025-04-01";
const isNewlyDiagnosed = (r) => (r.diagnosisDate || "") >= AUDIT_YEAR_START;
// Decimal age at the visit, from DOB and visit date (used for age-gated items).
function ageAtVisit(r) {
  const [by, bm, bd] = (r.dob || "").split("-").map(Number);
  const [vy, vm, vd] = (r.visitDate || "").split("-").map(Number);
  let age = vy - by;
  if (vm < bm || (vm === bm && vd < bd)) age -= 1;
  return age;
}

// ISO (YYYY-MM-DD) -> NPDA date format DD/MM/YYYY.
function fmtDMY(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || "");
}
// One-decimal numeric string for the NPDA 999.9 / 99.9 / 9999.9 formats.
const dec1 = (n) => Number(n).toFixed(1);

// --- NPDA cell builders -----------------------------------------------------
// DIRECT cell over an NPDA structured table, keyed on the internal PATIENT_ID.
// `value` is what the cell shows (usually a permitted code); `resultValue` is
// what the evidence row shows (usually the descriptive value behind the code).
function npdaDirect({ code, ref, db, table, column, value, resultValue, explanation }) {
  const sql = `SELECT PATIENT_ID, ${column} FROM ${table} WHERE PATIENT_ID = '${code}'`;
  const rv = resultValue !== undefined ? resultValue : value;
  return {
    ref, value, sql,
    result: structuredResult(["PATIENT_ID", column], [[code, rv]]),
    meta: { kind: "direct", database: db, sql, explanation },
  };
}

// INTERPRETIVE cell: a notes query over the child's clinical_notes filtered to
// the relevant NOTE_TYPE(s), with verbatim quoted `evidence` spans.
function npdaInterp({ r, ref, db, value, noteTypes, evidence, explanation }) {
  const inList = noteTypes.map((t) => `'${t}'`).join(", ");
  const sql = `SELECT AUTHOR_ROLE, DATE, NOTE_TYPE, TEXT FROM clinical_notes WHERE PATIENT = '${r.patient}' AND NOTE_TYPE IN (${inList})`;
  const notes = r.notes.filter((n) => noteTypes.includes(n.type));
  return {
    ref, value, sql,
    result: noteResult(notes),
    meta: { kind: "interpretive", database: db, sql, evidence, explanation },
  };
}

// Small DIRECT-cell helpers shared by the many structured NPDA items.
const npdaBlank = ({ r, ref, db, table, column, explanation }) =>
  npdaDirect({ code: r.code, ref, db, table, column, value: "", resultValue: null, explanation });
const npdaCoded = ({ r, ref, db, table, column, code, map, explanation }) =>
  npdaDirect({ code: r.code, ref, db, table, column, value: code, resultValue: map[code], explanation });
const npdaDate = ({ r, ref, db, table, column, iso, explanation }) =>
  npdaDirect({ code: r.code, ref, db, table, column, value: fmtDMY(iso), explanation });

// Build one populated cell for the NPDA sheet. The cell value is the NPDA
// permitted code/format; the evidence + explanation justify it.
function makeNpdaCell(colKey, { r, ref, db }) {
  const i = r.i;
  const x = NPDA_EXTRA[r.code];
  switch (colKey) {
    case "patient": {
      const nhs = NPDA_NHS[r.code];
      const sql = `SELECT PATIENT_ID, NHS_Number FROM patient_demographics WHERE PATIENT_ID = '${r.code}'`;
      return {
        ref, value: nhs, sql,
        result: structuredResult(["PATIENT_ID", "NHS_Number"], [[r.code, nhs]]),
        meta: { kind: "direct", database: db, sql, explanation: X.npdaPatient(r.code) },
      };
    }
    case "dob": return npdaDirect({ code: r.code, ref, db, table: "patient_demographics", column: "Date_of_birth", value: fmtDMY(r.dob), explanation: X.npdaDob(r.code) });

    case "sex": {
      const m = SEX_CODE[r.sex];
      return npdaDirect({ code: r.code, ref, db, table: "patient_demographics", column: "Sex_assigned_at_birth", value: m.code, resultValue: m.label, explanation: X.npdaSex(r.code, m.label, m.code) });
    }
    case "ethnicity": {
      const e = ETHNICITY[r.ethnicity];
      return npdaDirect({ code: r.code, ref, db, table: "patient_demographics", column: "Ethnic_category", value: e.code, resultValue: e.label, explanation: X.npdaEthnicity(r.code, e.label, e.code) });
    }
    case "diabetesType": {
      const d = DIABETES_TYPE[r.diabetesType];
      return npdaDirect({ code: r.code, ref, db, table: "diabetes_diagnoses", column: "Diabetes_type", value: d.code, resultValue: d.label, explanation: X.npdaDiabetesType(r.code, d.label, d.code) });
    }
    case "diagnosisDate": return npdaDirect({ code: r.code, ref, db, table: "diabetes_diagnoses", column: "Date_of_diagnosis", value: fmtDMY(r.diagnosisDate), explanation: X.npdaDiagnosisDate(r.code) });

    case "visitDate": return npdaDirect({ code: r.code, ref, db, table: "clinic_observations", column: "Visit_date", value: fmtDMY(r.visitDate), explanation: X.npdaVisitDate(r.code) });
    case "height": return npdaDirect({ code: r.code, ref, db, table: "clinic_observations", column: "Height_cm", value: dec1(r.height), explanation: X.npdaHeight(r.code) });
    case "weight": return npdaDirect({ code: r.code, ref, db, table: "clinic_observations", column: "Weight_kg", value: dec1(r.weight), explanation: X.npdaWeight(r.code) });
    case "hba1c": return npdaDirect({ code: r.code, ref, db, table: "clinic_observations", column: "Hba1c", value: dec1(r.hba1c), explanation: X.npdaHba1c(r.code, dec1(r.hba1c)) });

    case "insulinRegime": {
      const m = INSULIN_REGIME[i.insulin.v];
      return npdaInterp({ r, ref, db, value: m.code, noteTypes: ["diabetes_clinic"], evidence: i.insulin.e, explanation: X.npdaInsulinRegime(r.code, m.label, m.code) });
    }
    case "cgm": {
      const m = CGM_CODE[i.cgm.v];
      return npdaInterp({ r, ref, db, value: m.code, noteTypes: ["diabetes_clinic"], evidence: i.cgm.e, explanation: X.npdaCgm(r.code, m.label, m.code) });
    }
    case "lifestyle": return npdaInterp({ r, ref, db, value: YESNO_CODE[i.lifestyle.v], noteTypes: ["diabetes_clinic"], evidence: i.lifestyle.e, explanation: X.npdaLifestyle(r.code, i.lifestyle.v === "Yes", YESNO_CODE[i.lifestyle.v]) });

    case "systolic": return npdaDirect({ code: r.code, ref, db, table: "clinic_observations", column: "Systolic_BP", value: r.systolic, explanation: X.npdaSystolic(r.code) });
    case "diastolic": return npdaDirect({ code: r.code, ref, db, table: "clinic_observations", column: "Diastolic_BP", value: r.diastolic, explanation: X.npdaDiastolic(r.code) });
    case "cholesterol": return npdaDirect({ code: r.code, ref, db, table: "clinic_observations", column: "Total_cholesterol", value: dec1(r.cholesterol), explanation: X.npdaCholesterol(r.code) });

    case "acr":
      if (r.acr == null) {
        return npdaDirect({ code: r.code, ref, db, table: "clinic_observations", column: "Urinary_ACR", value: "", resultValue: null, explanation: X.npdaAcrNotDone(r.code) });
      }
      return npdaDirect({ code: r.code, ref, db, table: "clinic_observations", column: "Urinary_ACR", value: dec1(r.acr), explanation: X.npdaAcr(r.code) });

    case "footDate":
      if (!r.footDate) {
        return npdaDirect({ code: r.code, ref, db, table: "diabetes_screening", column: "Foot_assessment_date", value: "", resultValue: null, explanation: X.npdaFootDateNotDue(r.code) });
      }
      return npdaDirect({ code: r.code, ref, db, table: "diabetes_screening", column: "Foot_assessment_date", value: fmtDMY(r.footDate), explanation: X.npdaFootDate(r.code) });

    case "retinalDate":
      if (!r.retinalDate) {
        return npdaDirect({ code: r.code, ref, db, table: "diabetes_screening", column: "Retinal_screening_date", value: "", resultValue: null, explanation: X.npdaRetinalDateNotDue(r.code) });
      }
      return npdaDirect({ code: r.code, ref, db, table: "diabetes_screening", column: "Retinal_screening_date", value: fmtDMY(r.retinalDate), explanation: X.npdaRetinalDate(r.code) });

    case "retinalResult": {
      if (!r.retinalResult) {
        return npdaDirect({ code: r.code, ref, db, table: "diabetes_screening", column: "Retinal_screening_result", value: "", resultValue: null, explanation: X.npdaRetinalResultNone(r.code) });
      }
      const m = RETINAL_CODE[r.retinalResult];
      return npdaDirect({ code: r.code, ref, db, table: "diabetes_screening", column: "Retinal_screening_result", value: m.code, resultValue: m.label, explanation: X.npdaRetinalResult(r.code, m.label, m.code) });
    }

    case "psychScreen": return npdaDirect({ code: r.code, ref, db, table: "diabetes_screening", column: "Psychological_screening_date", value: fmtDMY(r.psychScreen), explanation: X.npdaPsychScreen(r.code) });
    case "psychOutcome": return npdaInterp({ r, ref, db, value: YESNO_CODE[i.psych.v], noteTypes: ["psychology"], evidence: i.psych.e, explanation: X.npdaPsychOutcome(r.code, i.psych.v === "Yes", YESNO_CODE[i.psych.v]) });
    case "smoking": {
      const m = SMOKING_CODE[i.smoking.v];
      return npdaInterp({ r, ref, db, value: m.code, noteTypes: ["annual_review"], evidence: i.smoking.e, explanation: X.npdaSmoking(r.code, m.label, m.code) });
    }
    case "dietitian": return npdaInterp({ r, ref, db, value: YESNO_CODE[i.dietitian.v], noteTypes: ["diabetes_clinic"], evidence: i.dietitian.e, explanation: X.npdaDietitian(r.code, i.dietitian.v === "Yes", YESNO_CODE[i.dietitian.v]) });

    case "carbCounting":
      if (!r.carbDate) {
        return npdaDirect({ code: r.code, ref, db, table: "diabetes_education", column: "Level3_carb_counting_date", value: "", resultValue: null, explanation: X.npdaCarbCountingNA(r.code) });
      }
      return npdaDirect({ code: r.code, ref, db, table: "diabetes_education", column: "Level3_carb_counting_date", value: fmtDMY(r.carbDate), explanation: X.npdaCarbCounting(r.code) });

    case "admissionReason":
      if (r.admission) {
        return npdaInterp({ r, ref, db, value: ADMISSION_DKA.code, noteTypes: ["admission"], evidence: i.admission.e, explanation: X.npdaAdmissionReasonDka(r.code, ADMISSION_DKA.label, ADMISSION_DKA.code) });
      }
      return npdaDirect({ code: r.code, ref, db, table: "hospital_admissions", column: "Reason_for_admission", value: "", resultValue: null, explanation: X.npdaAdmissionReasonNone(r.code) });

    // --- Section 1: patient details (new/2026 items) -----------------------
    case "postcode":
      return npdaDirect({ code: r.code, ref, db, table: "patient_demographics", column: "Postcode", value: x.postcode, explanation: X.npdaPostcode(r.code) });
    case "adhdAsd":
      return npdaCoded({ r, ref, db, table: "patient_demographics", column: "ADHD_ASD", code: x.adhdAsd, map: ADHD_ASD, explanation: X.npdaAdhdAsd(r.code, ADHD_ASD[x.adhdAsd], x.adhdAsd) });
    case "learningDisability":
      return npdaCoded({ r, ref, db, table: "patient_demographics", column: "Learning_disability", code: x.learningDisability, map: YESNO99, explanation: X.npdaLearningDisability(r.code, YESNO99[x.learningDisability], x.learningDisability) });
    case "leavingDate":
      if (!x.leavingDate) return npdaBlank({ r, ref, db, table: "patient_demographics", column: "Date_left_service", explanation: X.npdaLeavingDateNone(r.code) });
      return npdaDate({ r, ref, db, table: "patient_demographics", column: "Date_left_service", iso: x.leavingDate, explanation: X.npdaLeavingDate(r.code) });
    case "leavingReason":
      if (!x.leavingReason) return npdaBlank({ r, ref, db, table: "patient_demographics", column: "Reason_left_service", explanation: X.npdaLeavingReasonNone(r.code) });
      return npdaCoded({ r, ref, db, table: "patient_demographics", column: "Reason_left_service", code: x.leavingReason, map: LEAVING_REASON, explanation: X.npdaLeavingReason(r.code, LEAVING_REASON[x.leavingReason], x.leavingReason) });
    case "deathDate":
      return npdaBlank({ r, ref, db, table: "patient_demographics", column: "Death_date", explanation: X.npdaDeathDate(r.code) });
    case "gpPractice":
      return npdaDirect({ code: r.code, ref, db, table: "patient_demographics", column: "GP_practice_code", value: x.gpPractice, explanation: X.npdaGpPractice(r.code) });
    case "pduNumber":
      return npdaDirect({ code: r.code, ref, db, table: "patient_demographics", column: "PDU_number", value: "147", explanation: X.npdaPduNumber(r.code) });

    // --- Section 2: routine-measurement observation dates ------------------
    case "obsDateHtWt":
      return npdaDate({ r, ref, db, table: "clinic_observations", column: "Height_weight_obs_date", iso: r.visitDate, explanation: X.npdaObsDateHtWt(r.code) });
    case "obsDateHba1c":
      return npdaDate({ r, ref, db, table: "clinic_observations", column: "Hba1c_obs_date", iso: r.visitDate, explanation: X.npdaObsDateHba1c(r.code) });

    // --- Section 3: treatment/monitoring (new/2026 items) ------------------
    case "otherMed":
      return npdaCoded({ r, ref, db, table: "medications", column: "Other_glucose_lowering_med", code: x.otherMed, map: OTHER_MED, explanation: X.npdaOtherMed(r.code, OTHER_MED[x.otherMed], x.otherMed) });
    case "ketoneTesting": {
      const code = r.diabetesType === "Type 2" ? 2 : 1;
      return npdaCoded({ r, ref, db, table: "diabetes_screening", column: "Blood_ketone_testing", code, map: YESNO99, explanation: X.npdaKetoneTesting(r.code, YESNO99[code], code) });
    }
    case "immunotherapy":
      if (!(isNewlyDiagnosed(r) && r.diabetesType === "Type 1"))
        return npdaBlank({ r, ref, db, table: "diabetes_diagnoses", column: "Immunotherapy_received", explanation: X.npdaImmunotherapyNA(r.code) });
      return npdaCoded({ r, ref, db, table: "diabetes_diagnoses", column: "Immunotherapy_received", code: x.immunotherapy, map: YESNO99, explanation: X.npdaImmunotherapy(r.code, YESNO99[x.immunotherapy], x.immunotherapy) });
    case "immunotherapyDate":
      if (!x.immunotherapyDate) return npdaBlank({ r, ref, db, table: "diabetes_diagnoses", column: "Immunotherapy_start_date", explanation: X.npdaImmunotherapyDateNone(r.code) });
      return npdaDate({ r, ref, db, table: "diabetes_diagnoses", column: "Immunotherapy_start_date", iso: x.immunotherapyDate, explanation: X.npdaImmunotherapyDate(r.code) });

    // --- Section 4: health checks (observation dates + new/2026 items) -----
    case "obsDateBP":
      return npdaDate({ r, ref, db, table: "clinic_observations", column: "BP_obs_date", iso: r.visitDate, explanation: X.npdaObsDateBP(r.code) });
    case "obsDateAcr":
      if (r.acr == null) return npdaBlank({ r, ref, db, table: "clinic_observations", column: "ACR_obs_date", explanation: X.npdaObsDateAcrNone(r.code) });
      return npdaDate({ r, ref, db, table: "clinic_observations", column: "ACR_obs_date", iso: r.visitDate, explanation: X.npdaObsDateAcr(r.code) });
    case "albuminuriaStage": {
      if (r.acr == null) return npdaBlank({ r, ref, db, table: "clinic_observations", column: "Albuminuria_stage", explanation: X.npdaAlbuminuriaStageNone(r.code) });
      const code = r.acr < 3 ? 1 : (r.acr <= 30 ? 2 : 3);
      return npdaCoded({ r, ref, db, table: "clinic_observations", column: "Albuminuria_stage", code, map: ALBUMINURIA_STAGE, explanation: X.npdaAlbuminuriaStage(r.code, dec1(r.acr), ALBUMINURIA_STAGE[code], code) });
    }
    case "obsDateChol":
      return npdaDate({ r, ref, db, table: "clinic_observations", column: "Cholesterol_obs_date", iso: r.visitDate, explanation: X.npdaObsDateChol(r.code) });
    case "thyroidDate":
      if (r.diabetesType !== "Type 1") return npdaBlank({ r, ref, db, table: "diabetes_screening", column: "Thyroid_obs_date", explanation: X.npdaThyroidDateNA(r.code) });
      return npdaDate({ r, ref, db, table: "diabetes_screening", column: "Thyroid_obs_date", iso: r.visitDate, explanation: X.npdaThyroidDate(r.code) });
    case "thyroidTreatment":
      if (r.diabetesType !== "Type 1") return npdaBlank({ r, ref, db, table: "diabetes_screening", column: "Thyroid_treatment", explanation: X.npdaThyroidTreatmentNA(r.code) });
      return npdaCoded({ r, ref, db, table: "diabetes_screening", column: "Thyroid_treatment", code: x.thyroidTreatment, map: THYROID_TX, explanation: X.npdaThyroidTreatment(r.code, THYROID_TX[x.thyroidTreatment], x.thyroidTreatment) });
    case "coeliacDate":
      if (!x.coeliacDate) return npdaBlank({ r, ref, db, table: "diabetes_screening", column: "Coeliac_screening_date", explanation: X.npdaCoeliacDateNA(r.code) });
      return npdaDate({ r, ref, db, table: "diabetes_screening", column: "Coeliac_screening_date", iso: x.coeliacDate, explanation: X.npdaCoeliacDate(r.code) });
    case "glutenFree":
      return npdaCoded({ r, ref, db, table: "diabetes_screening", column: "Gluten_free_diet", code: x.glutenFree, map: YESNO99, explanation: X.npdaGlutenFree(r.code, YESNO99[x.glutenFree], x.glutenFree) });
    case "smokingCessationDate":
      if (i.smoking.v === "No") return npdaBlank({ r, ref, db, table: "diabetes_screening", column: "Smoking_cessation_date", explanation: X.npdaSmokingCessationDateNone(r.code) });
      return npdaDate({ r, ref, db, table: "diabetes_screening", column: "Smoking_cessation_date", iso: r.visitDate, explanation: X.npdaSmokingCessationDate(r.code) });
    case "fluDate":
      if (!x.fluDate) return npdaBlank({ r, ref, db, table: "diabetes_screening", column: "Influenza_immunisation_date", explanation: X.npdaFluDateNone(r.code) });
      return npdaDate({ r, ref, db, table: "diabetes_screening", column: "Influenza_immunisation_date", iso: x.fluDate, explanation: X.npdaFluDate(r.code) });
    case "sickDayDate":
      return npdaDate({ r, ref, db, table: "diabetes_screening", column: "Sick_day_rules_date", iso: r.visitDate, explanation: X.npdaSickDayDate(r.code) });

    // --- Section 5: psychology (new/2026 item) -----------------------------
    case "mentalHealthAppt":
      return npdaCoded({ r, ref, db, table: "diabetes_screening", column: "Mental_health_appt_offered", code: x.mentalHealthAppt, map: MENTAL_HEALTH_APPT, explanation: X.npdaMentalHealthAppt(r.code, MENTAL_HEALTH_APPT[x.mentalHealthAppt], x.mentalHealthAppt) });

    // --- Section 6: dietetics (new/2026 item) ------------------------------
    case "dietitianApptDate":
      if (i.dietitian.v !== "Yes") return npdaBlank({ r, ref, db, table: "diabetes_education", column: "Dietitian_appt_date", explanation: X.npdaDietitianApptDateNone(r.code) });
      return npdaDate({ r, ref, db, table: "diabetes_education", column: "Dietitian_appt_date", iso: r.visitDate, explanation: X.npdaDietitianApptDate(r.code) });

    // --- Section 7: admissions (dates + new/2026 items) --------------------
    case "admissionStart":
      if (!r.admission) return npdaBlank({ r, ref, db, table: "hospital_admissions", column: "Spell_start_date", explanation: X.npdaAdmissionStartNone(r.code) });
      return npdaDate({ r, ref, db, table: "hospital_admissions", column: "Spell_start_date", iso: x.admStart, explanation: X.npdaAdmissionStart(r.code) });
    case "admissionDischarge":
      if (!r.admission) return npdaBlank({ r, ref, db, table: "hospital_admissions", column: "Spell_discharge_date", explanation: X.npdaAdmissionDischargeNone(r.code) });
      return npdaDate({ r, ref, db, table: "hospital_admissions", column: "Spell_discharge_date", iso: x.admDischarge, explanation: X.npdaAdmissionDischarge(r.code) });
    case "admissionReasonOther":
      if (!r.admission) return npdaBlank({ r, ref, db, table: "hospital_admissions", column: "Reason_for_admission_other", explanation: X.npdaAdmissionReasonOtherNoAdmission(r.code) });
      return npdaBlank({ r, ref, db, table: "hospital_admissions", column: "Reason_for_admission_other", explanation: X.npdaAdmissionReasonOther(r.code) });
    case "dkaTherapies":
      if (!r.admission) return npdaBlank({ r, ref, db, table: "hospital_admissions", column: "DKA_therapies", explanation: X.npdaDkaTherapiesNone(r.code) });
      return npdaCoded({ r, ref, db, table: "hospital_admissions", column: "DKA_therapies", code: x.dkaTherapy, map: DKA_THERAPY, explanation: X.npdaDkaTherapies(r.code, DKA_THERAPY[x.dkaTherapy], x.dkaTherapy) });
    case "initialPh":
      if (!r.admission) return npdaBlank({ r, ref, db, table: "hospital_admissions", column: "Initial_pH", explanation: X.npdaInitialPhNone(r.code) });
      return npdaDirect({ code: r.code, ref, db, table: "hospital_admissions", column: "Initial_pH", value: x.initialPh, explanation: X.npdaInitialPh(r.code) });
    case "initialBicarb":
      if (!r.admission) return npdaBlank({ r, ref, db, table: "hospital_admissions", column: "Initial_bicarbonate", explanation: X.npdaInitialBicarbNone(r.code) });
      return npdaDirect({ code: r.code, ref, db, table: "hospital_admissions", column: "Initial_bicarbonate", value: x.initialBicarb, explanation: X.npdaInitialBicarb(r.code) });

    default:
      return { ref, value: "" }; // blank spacer columns (_s1.._s6)
  }
}

function diabetesWorklistDirect({ r, ref, db, table, column, value, resultValue, explanation }) {
  const sql = `SELECT PATIENT_ID, ${column} FROM ${table} WHERE PATIENT_ID = '${r.code}'`;
  const rv = resultValue !== undefined ? resultValue : value;
  return {
    ref, value, sql,
    result: structuredResult(["PATIENT_ID", column], [[r.code, rv]]),
    meta: { kind: "direct", database: db, sql, explanation },
  };
}

function firstNoteEvidence(r, type) {
  const note = r.notes.find((n) => n.type === type);
  const sentence = String(note?.text || "").split(".")[0].trim();
  return sentence ? [sentence] : [];
}

function noteDate(r, type) {
  return r.notes.find((n) => n.type === type)?.date || r.visitDate;
}

function makeDiabetesWorklistCell(colKey, { r, ref, db }) {
  switch (colKey) {
    case "patient":
      return diabetesWorklistDirect({
        r, ref, db, table: "patient_demographics", column: "PATIENT_ID", value: r.code,
        explanation: DW.cell.patientExplanation(r.code),
      });
    case "hba1c":
      return makeNpdaCell("hba1c", { r, ref, db });
    case "hba1cDate":
      return diabetesWorklistDirect({
        r, ref, db, table: "clinic_observations", column: "Hba1c_recorded_date",
        value: fmtDMY(r.visitDate),
        explanation: DW.cell.hba1cDate(r.code),
      });
    case "glucoseIntervention":
      return npdaInterp({
        r, ref, db, value: r.i.lifestyle.e[0],
        noteTypes: ["diabetes_clinic"], evidence: r.i.lifestyle.e,
        explanation: DW.cell.glucoseIntervention(r.code),
      });
    case "acr":
      return makeNpdaCell("acr", { r, ref, db });
    case "acrDate":
      if (r.acr == null) {
        return diabetesWorklistDirect({
          r, ref, db, table: "clinic_observations", column: "Urinary_ACR_recorded_date",
          value: "", resultValue: null,
          explanation: DW.cell.acrDateMissing(r.code),
        });
      }
      return diabetesWorklistDirect({
        r, ref, db, table: "clinic_observations", column: "Urinary_ACR_recorded_date",
        value: fmtDMY(r.visitDate),
        explanation: DW.cell.acrDate(r.code),
      });
    case "admission":
      if (r.admission) {
        return npdaInterp({
          r, ref, db, value: r.i.admission.e[0], noteTypes: ["admission"],
          evidence: r.i.admission.e,
          explanation: DW.cell.dkaAdmission(r.code),
        });
      }
      return diabetesWorklistDirect({
        r, ref, db, table: "hospital_admissions", column: "Reason_for_admission", value: DW.cell.noneRecorded,
        resultValue: null,
        explanation: DW.cell.noAdmission(r.code),
      });
    case "lastReview":
      return npdaInterp({
        r, ref, db, value: fmtDMY(noteDate(r, "annual_review")),
        noteTypes: ["annual_review"], evidence: firstNoteEvidence(r, "annual_review"),
        explanation: DW.cell.lastReview(r.code),
      });
    default:
      return { ref, value: "" };
  }
}


// ===========================================================================
// Dataset 4 — Epilepsy12 paediatric epilepsy audit (Flow E) — one sheet
// ===========================================================================
//
// Epilepsy12: one row per child/young person (≤18) in their first year of
// epilepsy care, coded to TFC 223. Same two value kinds as the other audits:
//   • DIRECT      — copied from structured EHR tables (demographics, the
//                   epilepsy-assessment record, radiology, cardiology and the
//                   prescribing record).
//   • INTERPRETIVE — read from the free-text epilepsy clinic letter and the
//                   mental-health screening note (epilepsy expertise of the
//                   assessing paediatrician, seizure type, and the MH
//                   problem/support outcome).
// Genuine "not done / not indicated / not applicable" cases carry an explicit
// label backed by a lookup that proves the query ran — never a mysterious blank;
// one MRI report is genuinely blocked.

const EPILEPSY_NOTE_TYPES = new Set(["epilepsy_clinic", "mh_screening"]);

const EPILEPSY_RECORDS = CONTENT.records.epilepsy;

// One row per child in the first-year-of-care cohort; this is also the count.
const EPILEPSY_ROW_ORDER = [
  "EPI001", "EPI002", "EPI003", "EPI004", "EPI005",
  "EPI006", "EPI007", "EPI008", "EPI009", "EPI010",
];

// The contract's "N patients match" must equal the Epilepsy row count.
export const EPILEPSY_PATIENT_COUNT = EPILEPSY_ROW_ORDER.length;

// Single sheet — "Epilepsy". Headers/widths live in the locale content pack.
const EPILEPSY_COLUMNS = CONTENT.columns.epilepsy;

// 10-digit NHS numbers. Rows are keyed internally on PATIENT_ID (EPI###); the
// NHS number is a demographic field like any other.
const EPILEPSY_NHS = {
  EPI001: "9991002731", EPI002: "9991013448", EPI003: "9991024165",
  EPI004: "9991035882", EPI005: "9991046509", EPI006: "9991057226",
  EPI007: "9991068943", EPI008: "9991079660", EPI009: "9991080387",
  EPI010: "9991091004",
};

// --- Epilepsy code maps (codes/keys are logic; labels live in CONTENT.codeMaps)
const EPI_SEX = CONTENT.codeMaps.sex;                 // sex assigned at birth
const EPI_SEIZURE_TYPE = CONTENT.codeMaps.seizureType; // convulsive vs not

// Whole-days between two ISO dates (b − a). Used for the KPI time-windows shown
// in the explanations (referral→assessment, MRI request→performed).
function daysBetween(aIso, bIso) {
  const a = Date.parse(aIso + "T00:00:00Z");
  const b = Date.parse(bIso + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

// --- Epilepsy cell builders -------------------------------------------------
// DIRECT cell over an Epilepsy12 structured table, keyed on the PATIENT_ID.
function epilepsyDirect({ code, ref, db, table, column, value, resultValue, explanation }) {
  const sql = `SELECT PATIENT_ID, ${column} FROM ${table} WHERE PATIENT_ID = '${code}'`;
  const rv = resultValue !== undefined ? resultValue : value;
  return {
    ref, value, sql,
    result: structuredResult(["PATIENT_ID", column], [[code, rv]]),
    meta: { kind: "direct", database: db, sql, explanation },
  };
}

// INTERPRETIVE cell: a notes query over the child's clinical_notes filtered to
// the relevant NOTE_TYPE(s), with verbatim quoted `evidence` spans.
function epilepsyInterp({ r, ref, db, value, noteTypes, evidence, explanation }) {
  const inList = noteTypes.map((t) => `'${t}'`).join(", ");
  const sql = `SELECT AUTHOR_ROLE, DATE, NOTE_TYPE, TEXT FROM clinical_notes WHERE PATIENT = '${r.patient}' AND NOTE_TYPE IN (${inList})`;
  const notes = r.notes.filter((n) => noteTypes.includes(n.type));
  return {
    ref, value, sql,
    result: noteResult(notes),
    meta: { kind: "interpretive", database: db, sql, evidence, explanation },
  };
}

// A DIRECT date cell formatted DD/MM/YYYY (value present).
const epilepsyDate = ({ code, ref, db, table, column, iso, explanation }) =>
  epilepsyDirect({ code, ref, db, table, column, value: fmtDMY(iso), explanation });
// A DIRECT "lookup ran, nothing recorded" cell — explicit label, null result.
const epilepsyBlank = ({ code, ref, db, table, column, explanation }) =>
  epilepsyDirect({ code, ref, db, table, column, value: "", resultValue: null, explanation });

// Eligibility for the pregnancy-prevention-programme KPI (KPI 8): female aged 12
// or over on valproate or topiramate. Mirrors the cohort logic in makeNpdaCell.
const pppEligible = (r) =>
  r.sex === "Female" && r.ageAtAssessment >= 12 &&
  (r.onValproate === "Yes" || r.onTopiramate === "Yes");

// Build one populated cell for the Epilepsy sheet. The cell value is the audit
// value/format; the evidence + explanation justify it.
function makeEpilepsyCell(colKey, { r, ref, db }) {
  // One genuinely unresolvable cell, so the blocked state + its reason show in
  // the demo: EPI007's MRI was requested but the report could not be located
  // (imaging performed at a transferring unit and not yet returned).
  if (r.code === "EPI007" && colKey === "mriPerformedDate") {
    return {
      ref,
      value: "",
      meta: {
        kind: "direct",
        state: "blocked",
        database: db,
        reason_code: "NOT_LOCATED",
        reason_detail: CONTENT.blockedReason.epilepsyMriPerformed,
      },
    };
  }
  const i = r.i;
  switch (colKey) {
    case "patient": {
      const nhs = EPILEPSY_NHS[r.code];
      const sql = `SELECT PATIENT_ID, NHS_Number FROM patient_demographics WHERE PATIENT_ID = '${r.code}'`;
      return {
        ref, value: nhs, sql,
        result: structuredResult(["PATIENT_ID", "NHS_Number"], [[r.code, nhs]]),
        meta: { kind: "direct", database: db, sql, explanation: X.epiPatient(r.code) },
      };
    }
    case "dob": return epilepsyDirect({ code: r.code, ref, db, table: "patient_demographics", column: "Date_of_birth", value: fmtDMY(r.dob), explanation: X.epiDob(r.code) });
    case "sex": {
      const m = EPI_SEX[r.sex];
      return epilepsyDirect({ code: r.code, ref, db, table: "patient_demographics", column: "Sex_assigned_at_birth", value: m.code, resultValue: m.label, explanation: X.epiSex(r.code, m.label, m.code) });
    }
    case "ageAtAssessment": return epilepsyDirect({ code: r.code, ref, db, table: "epilepsy_assessments", column: "Age_at_first_assessment", value: r.ageAtAssessment, explanation: X.epiAgeAtAssessment(r.code, r.ageAtAssessment) });

    // --- B1: epilepsy-expert paediatrician within 2 weeks of referral --------
    case "referralDate": return epilepsyDate({ code: r.code, ref, db, table: "epilepsy_assessments", column: "Referral_date", iso: r.referralDate, explanation: X.epiReferralDate(r.code) });
    case "firstAssessmentDate": return epilepsyDate({ code: r.code, ref, db, table: "epilepsy_assessments", column: "First_assessment_date", iso: r.firstAssessmentDate, explanation: X.epiFirstAssessmentDate(r.code, daysBetween(r.referralDate, r.firstAssessmentDate)) });
    case "expertisePaediatrician": return epilepsyInterp({ r, ref, db, value: i.expertise.v, noteTypes: ["epilepsy_clinic"], evidence: i.expertise.e, explanation: X.epiExpertise(r.code, i.expertise.v === "Yes", i.expertise.v) });

    // --- B2: ESN input within first year -------------------------------------
    case "esnInputDate":
      if (!r.esnInputDate) return epilepsyBlank({ code: r.code, ref, db, table: "epilepsy_assessments", column: "ESN_input_date", explanation: X.epiEsnInputNotDone(r.code) });
      return epilepsyDate({ code: r.code, ref, db, table: "epilepsy_assessments", column: "ESN_input_date", iso: r.esnInputDate, explanation: X.epiEsnInputDate(r.code) });

    // --- B3: MRI within 6 weeks where indicated ------------------------------
    case "mriIndicated": return epilepsyDirect({ code: r.code, ref, db, table: "epilepsy_assessments", column: "MRI_indicated", value: r.mriIndicated, explanation: X.epiMriIndicated(r.code, r.mriIndicated === "Yes") });
    case "mriRequestDate":
      if (r.mriIndicated !== "Yes" || !r.mriRequestDate) return epilepsyBlank({ code: r.code, ref, db, table: "radiology_requests", column: "MRI_request_date", explanation: X.epiMriRequestNA(r.code) });
      return epilepsyDate({ code: r.code, ref, db, table: "radiology_requests", column: "MRI_request_date", iso: r.mriRequestDate, explanation: X.epiMriRequestDate(r.code) });
    case "mriPerformedDate":
      if (r.mriIndicated !== "Yes") return epilepsyBlank({ code: r.code, ref, db, table: "radiology_results", column: "MRI_performed_date", explanation: X.epiMriPerformedNA(r.code) });
      if (!r.mriPerformedDate) return epilepsyBlank({ code: r.code, ref, db, table: "radiology_results", column: "MRI_performed_date", explanation: X.epiMriPerformedNotDone(r.code) });
      return epilepsyDate({ code: r.code, ref, db, table: "radiology_results", column: "MRI_performed_date", iso: r.mriPerformedDate, explanation: X.epiMriPerformedDate(r.code, daysBetween(r.mriRequestDate, r.mriPerformedDate)) });

    // --- B4: ECG in convulsive seizures --------------------------------------
    case "seizureType": {
      const m = EPI_SEIZURE_TYPE[i.seizureType.v];
      return epilepsyInterp({ r, ref, db, value: m.code, noteTypes: ["epilepsy_clinic"], evidence: i.seizureType.e, explanation: X.epiSeizureType(r.code, m.label, m.code) });
    }
    case "ecgDate":
      if (i.seizureType.v !== "Convulsive") return epilepsyBlank({ code: r.code, ref, db, table: "cardiology_results", column: "ECG_date", explanation: X.epiEcgNA(r.code) });
      if (!r.ecgDate) return epilepsyBlank({ code: r.code, ref, db, table: "cardiology_results", column: "ECG_date", explanation: X.epiEcgNotDone(r.code) });
      return epilepsyDate({ code: r.code, ref, db, table: "cardiology_results", column: "ECG_date", iso: r.ecgDate, explanation: X.epiEcgDate(r.code) });

    // --- B5: mental-health screening + support -------------------------------
    case "mhScreeningDate":
      if (!r.mhScreeningDate) return epilepsyBlank({ code: r.code, ref, db, table: "epilepsy_assessments", column: "MH_screening_date", explanation: X.epiMhScreeningNotDone(r.code) });
      return epilepsyDate({ code: r.code, ref, db, table: "epilepsy_assessments", column: "MH_screening_date", iso: r.mhScreeningDate, explanation: X.epiMhScreeningDate(r.code) });
    case "mhProblemIdentified": return epilepsyInterp({ r, ref, db, value: i.mhProblem.v, noteTypes: ["mh_screening"], evidence: i.mhProblem.e, explanation: X.epiMhProblem(r.code, i.mhProblem.v === "Yes", i.mhProblem.v) });
    case "mhSupportProvided":
      if (i.mhProblem.v !== "Yes") return epilepsyBlank({ code: r.code, ref, db, table: "epilepsy_assessments", column: "MH_support_provided", explanation: X.epiMhSupportNA(r.code) });
      return epilepsyInterp({ r, ref, db, value: i.mhSupport.v, noteTypes: ["mh_screening"], evidence: i.mhSupport.e, explanation: X.epiMhSupportProvided(r.code, i.mhSupport.v === "Yes", i.mhSupport.v) });

    // --- B6: comprehensive care plan by 12 months ----------------------------
    case "carePlanDate":
      if (!r.carePlanDate) return epilepsyBlank({ code: r.code, ref, db, table: "epilepsy_assessments", column: "Care_plan_date", explanation: X.epiCarePlanNotDone(r.code) });
      return epilepsyDate({ code: r.code, ref, db, table: "epilepsy_assessments", column: "Care_plan_date", iso: r.carePlanDate, explanation: X.epiCarePlanDate(r.code) });

    // --- B7: valproate/topiramate safety (PPP, females ≥12) ------------------
    case "onValproate": return epilepsyDirect({ code: r.code, ref, db, table: "medications", column: "On_sodium_valproate", value: r.onValproate, explanation: X.epiOnValproate(r.code, r.onValproate === "Yes") });
    case "onTopiramate": return epilepsyDirect({ code: r.code, ref, db, table: "medications", column: "On_topiramate", value: r.onTopiramate, explanation: X.epiOnTopiramate(r.code, r.onTopiramate === "Yes") });
    case "pppInPlace":
      if (!pppEligible(r)) return epilepsyBlank({ code: r.code, ref, db, table: "epilepsy_assessments", column: "PPP_in_place", explanation: X.epiPppNA(r.code) });
      return epilepsyDirect({ code: r.code, ref, db, table: "epilepsy_assessments", column: "PPP_in_place", value: r.pppInPlace === "Yes" ? "Yes" : "No", explanation: X.epiPppInPlace(r.code, r.pppInPlace === "Yes") });

    default:
      return { ref, value: "" }; // blank spacer columns (_s1.._s7)
  }
}


// ===========================================================================
// Dataset 5 — National Major Trauma Registry (NMTR/TARN) paediatric audit
// (Flow T) — one sheet
// ===========================================================================
//
// NMTR: one row per paediatric (<16) major-trauma case at the MTC with ≥1 AIS3+
// injury. Same two value kinds as the other audits:
//   • DIRECT      — copied from structured tables (demographics, the trauma
//                   registry record, the ED reception record, radiology and the
//                   medication record).
//   • INTERPRETIVE — read from the free-text resuscitation note and the
//                   rehabilitation/discharge note (whether airway/intubation was
//                   considered, and whether a rehabilitation prescription was
//                   issued).
// The BPT pays a two-level top-up: Level 1 (ISS ≥9) and the higher Level 2
// (ISS ≥16); several process criteria are level-gated. Genuine "not applicable /
// not done" cases carry an explicit lookup-backed label, never a mysterious
// blank; one consultant-arrival time is genuinely blocked.

const TRAUMA_NOTE_TYPES = new Set(["resus", "rehab"]);

const TRAUMA_RECORDS = CONTENT.records.trauma;

// One row per case in the paediatric major-trauma cohort; this is also the count.
const TRAUMA_ROW_ORDER = [
  "TRA001", "TRA002", "TRA003", "TRA004", "TRA005",
  "TRA006", "TRA007", "TRA008", "TRA009", "TRA010",
];

// The contract's "N patients match" must equal the Trauma row count.
export const TRAUMA_PATIENT_COUNT = TRAUMA_ROW_ORDER.length;

// Single sheet — "Trauma". Headers/widths live in the locale content pack.
const TRAUMA_COLUMNS = CONTENT.columns.trauma;

// 10-digit NHS numbers. Rows are keyed internally on PATIENT_ID (TRA###); the
// NHS number is a demographic field like any other.
const TRAUMA_NHS = {
  TRA001: "9992001839", TRA002: "9992012556", TRA003: "9992023273",
  TRA004: "9992034990", TRA005: "9992045617", TRA006: "9992056334",
  TRA007: "9992067051", TRA008: "9992078778", TRA009: "9992089495",
  TRA010: "9992090112",
};

// --- Trauma code maps (codes/keys are logic; labels live in CONTENT.codeMaps)
const TRA_SEX = CONTENT.codeMaps.sex;                 // sex assigned at birth

// BPT level label from the Injury Severity Score (Level 2 ≥16, Level 1 ≥9).
const traumaLevel = (iss) =>
  iss >= 16 ? "Level 2" : iss >= 9 ? "Level 1" : "below Level 1";

// --- Eligibility / level gating (mirrors the cohort logic in makeEpilepsyCell) -
const isLevel2 = (r) => r.iss >= 16;                   // C2 / C3 / C4 process gate
const ctHeadEligible = (r) =>                          // C3: Level 2 head injury, GCS ≤13
  r.headInjury === "Yes" && r.iss >= 16 && r.gcs <= 13;
const airwayEligible = (r) => r.gcs < 9;               // C5: GCS <9 (Level 1)
const rehabApplies = (r) => r.iss >= 9;                // C6: cohort ISS ≥9

// --- Trauma cell builders ---------------------------------------------------
// DIRECT cell over an NMTR structured table, keyed on the PATIENT_ID.
function traumaDirect({ code, ref, db, table, column, value, resultValue, explanation }) {
  const sql = `SELECT PATIENT_ID, ${column} FROM ${table} WHERE PATIENT_ID = '${code}'`;
  const rv = resultValue !== undefined ? resultValue : value;
  return {
    ref, value, sql,
    result: structuredResult(["PATIENT_ID", column], [[code, rv]]),
    meta: { kind: "direct", database: db, sql, explanation },
  };
}

// INTERPRETIVE cell: a notes query over the case's clinical_notes filtered to the
// relevant NOTE_TYPE(s), with verbatim quoted `evidence` spans.
function traumaInterp({ r, ref, db, value, noteTypes, evidence, explanation }) {
  const inList = noteTypes.map((t) => `'${t}'`).join(", ");
  const sql = `SELECT AUTHOR_ROLE, DATE, NOTE_TYPE, TEXT FROM clinical_notes WHERE PATIENT = '${r.patient}' AND NOTE_TYPE IN (${inList})`;
  const notes = r.notes.filter((n) => noteTypes.includes(n.type));
  return {
    ref, value, sql,
    result: noteResult(notes),
    meta: { kind: "interpretive", database: db, sql, evidence, explanation },
  };
}

// A DIRECT date cell formatted DD/MM/YYYY (value present).
const traumaDate = ({ code, ref, db, table, column, iso, explanation }) =>
  traumaDirect({ code, ref, db, table, column, value: fmtDMY(iso), explanation });
// A DIRECT "lookup ran, nothing recorded" cell — explicit label, null result.
const traumaBlank = ({ code, ref, db, table, column, explanation }) =>
  traumaDirect({ code, ref, db, table, column, value: "", resultValue: null, explanation });

// Build one populated cell for the Trauma sheet. The cell value is the audit
// value/format; the evidence + explanation justify it.
function makeTraumaCell(colKey, { r, ref, db }) {
  // One genuinely unresolvable cell, so the blocked state + its reason show in
  // the demo: TRA009's consultant-arrival time was not captured in the ED record.
  if (r.code === "TRA009" && colKey === "consultantArrivalMin") {
    return {
      ref,
      value: "",
      meta: {
        kind: "direct",
        state: "blocked",
        database: db,
        reason_code: "NOT_LOCATED",
        reason_detail: CONTENT.blockedReason.traumaConsultantArrival,
      },
    };
  }
  const i = r.i;
  switch (colKey) {
    case "patient": {
      const nhs = TRAUMA_NHS[r.code];
      const sql = `SELECT PATIENT_ID, NHS_Number FROM patient_demographics WHERE PATIENT_ID = '${r.code}'`;
      return {
        ref, value: nhs, sql,
        result: structuredResult(["PATIENT_ID", "NHS_Number"], [[r.code, nhs]]),
        meta: { kind: "direct", database: db, sql, explanation: X.traPatient(r.code) },
      };
    }
    case "dob": return traumaDirect({ code: r.code, ref, db, table: "patient_demographics", column: "Date_of_birth", value: fmtDMY(r.dob), explanation: X.traDob(r.code) });
    case "sex": {
      const m = TRA_SEX[r.sex];
      return traumaDirect({ code: r.code, ref, db, table: "patient_demographics", column: "Sex_assigned_at_birth", value: m.code, resultValue: m.label, explanation: X.traSex(r.code, m.label, m.code) });
    }
    case "ageYears": return traumaDirect({ code: r.code, ref, db, table: "trauma_registry", column: "Age_years", value: r.ageYears, explanation: X.traAgeYears(r.code, r.ageYears) });
    case "iss": return traumaDirect({ code: r.code, ref, db, table: "trauma_registry", column: "Injury_severity_score", value: r.iss, explanation: X.traIss(r.code, r.iss, traumaLevel(r.iss)) });
    case "ais3plus": return traumaDirect({ code: r.code, ref, db, table: "trauma_registry", column: "AIS_3plus_injury", value: r.ais3plus, explanation: X.traAis3plus(r.code, r.ais3plus === "Yes") });

    // --- C1: registry submission within 25 days of discharge -----------------
    case "edArrivalDateTime": return traumaDirect({ code: r.code, ref, db, table: "ed_trauma_receptions", column: "ED_arrival_datetime", value: r.edArrivalDateTime, explanation: X.traEdArrival(r.code) });
    case "dischargeDate": return traumaDate({ code: r.code, ref, db, table: "trauma_registry", column: "Discharge_date", iso: r.dischargeDate, explanation: X.traDischargeDate(r.code) });
    case "nmtrSubmitted": return traumaDirect({ code: r.code, ref, db, table: "trauma_registry", column: "NMTR_submitted", value: r.nmtrSubmitted, explanation: X.traNmtrSubmitted(r.code, r.nmtrSubmitted === "Yes") });
    case "datasetComplete": return traumaDirect({ code: r.code, ref, db, table: "trauma_registry", column: "NMTR_dataset_complete", value: r.datasetComplete, explanation: X.traDatasetComplete(r.code, r.datasetComplete === "Yes") });
    case "submissionDate": return traumaDate({ code: r.code, ref, db, table: "trauma_registry", column: "NMTR_submission_date", iso: r.submissionDate, explanation: X.traSubmissionDate(r.code, daysBetween(r.dischargeDate, r.submissionDate)) });

    // --- C2: consultant-led trauma-team reception ≤5 min (Level 2) -----------
    case "traumaTeamActivated": return traumaDirect({ code: r.code, ref, db, table: "ed_trauma_receptions", column: "Trauma_team_activated", value: r.traumaTeamActivated, explanation: X.traTeamActivated(r.code, r.traumaTeamActivated === "Yes") });
    case "consultantPresent": return traumaDirect({ code: r.code, ref, db, table: "ed_trauma_receptions", column: "Consultant_present", value: r.consultantPresent, explanation: X.traConsultantPresent(r.code, r.consultantPresent === "Yes") });
    case "consultantArrivalMin":
      if (!isLevel2(r)) return traumaBlank({ code: r.code, ref, db, table: "ed_trauma_receptions", column: "Consultant_arrival_min", explanation: X.traConsultantArrivalNA(r.code) });
      return traumaDirect({ code: r.code, ref, db, table: "ed_trauma_receptions", column: "Consultant_arrival_min", value: r.consultantArrivalMin, explanation: X.traConsultantArrival(r.code, r.consultantArrivalMin) });

    // --- C3: CT head ≤60 min (GCS ≤13 head injury, Level 2) ------------------
    case "gcs": return traumaDirect({ code: r.code, ref, db, table: "ed_trauma_receptions", column: "GCS_at_arrival", value: r.gcs, explanation: X.traGcs(r.code, r.gcs) });
    case "headInjury": return traumaDirect({ code: r.code, ref, db, table: "trauma_registry", column: "Head_injury", value: r.headInjury, explanation: X.traHeadInjury(r.code, r.headInjury === "Yes") });
    case "ctHeadMin":
      if (r.headInjury !== "Yes") return traumaBlank({ code: r.code, ref, db, table: "radiology_results", column: "CT_head_min", explanation: X.traCtHeadNAnoHead(r.code) });
      if (!ctHeadEligible(r)) return traumaBlank({ code: r.code, ref, db, table: "radiology_results", column: "CT_head_min", explanation: X.traCtHeadNAnotEligible(r.code) });
      return traumaDirect({ code: r.code, ref, db, table: "radiology_results", column: "CT_head_min", value: r.ctHeadMin, explanation: X.traCtHead(r.code, r.ctHeadMin) });

    // --- C4: tranexamic acid ≤1 h (Level 2) ---------------------------------
    case "txaIndicated": return traumaDirect({ code: r.code, ref, db, table: "trauma_registry", column: "TXA_indicated", value: r.txaIndicated, explanation: X.traTxaIndicated(r.code, r.txaIndicated === "Yes") });
    case "txaGiven":
      if (r.txaIndicated !== "Yes") return traumaBlank({ code: r.code, ref, db, table: "medications", column: "TXA_given", explanation: X.traTxaNAnotIndicated(r.code) });
      return traumaDirect({ code: r.code, ref, db, table: "medications", column: "TXA_given", value: r.txaGiven, explanation: X.traTxaGiven(r.code, r.txaGiven === "Yes") });
    case "txaMin":
      if (r.txaIndicated !== "Yes" || r.txaMin == null) return traumaBlank({ code: r.code, ref, db, table: "medications", column: "TXA_given_min", explanation: X.traTxaNAnotIndicated(r.code) });
      return traumaDirect({ code: r.code, ref, db, table: "medications", column: "TXA_given_min", value: r.txaMin, explanation: X.traTxaMin(r.code, r.txaMin) });

    // --- C5: airway considered ≤30 min (GCS <9, Level 1) --------------------
    case "intubationConsidered": return traumaInterp({ r, ref, db, value: i.intubationConsidered.v, noteTypes: ["resus"], evidence: i.intubationConsidered.e, explanation: X.traIntubationConsidered(r.code, i.intubationConsidered.v === "Yes", i.intubationConsidered.v) });
    case "airwayConsideredMin":
      if (!airwayEligible(r)) return traumaBlank({ code: r.code, ref, db, table: "ed_trauma_receptions", column: "Airway_considered_min", explanation: X.traAirwayNA(r.code) });
      return traumaDirect({ code: r.code, ref, db, table: "ed_trauma_receptions", column: "Airway_considered_min", value: r.airwayConsideredMin, explanation: X.traAirwayMin(r.code, r.airwayConsideredMin) });

    // --- C6: rehabilitation prescription (ISS ≥9, Level 1) ------------------
    case "rehabNeedsAssessed": return traumaDirect({ code: r.code, ref, db, table: "trauma_registry", column: "Rehab_needs_assessed", value: r.rehabNeedsAssessed, explanation: X.traRehabNeedsAssessed(r.code, r.rehabNeedsAssessed === "Yes") });
    case "rehabPrescriptionIssued":
      if (!rehabApplies(r)) return traumaBlank({ code: r.code, ref, db, table: "trauma_registry", column: "Rehab_prescription_issued", explanation: X.traRehabNA(r.code) });
      return traumaInterp({ r, ref, db, value: i.rehabPrescription.v, noteTypes: ["rehab"], evidence: i.rehabPrescription.e, explanation: X.traRehabPrescription(r.code, i.rehabPrescription.v === "Yes", i.rehabPrescription.v) });

    default:
      return { ref, value: "" }; // blank spacer columns (_s1.._s6)
  }
}


// ===========================================================================
// Dataset descriptor — bundles the data + builders for one dataset so all
// flows share identical workbook/timeline/SQL machinery (POLISH T3).
// ===========================================================================
function buildDataset({ id, sheet, label, columns, rowOrder, records, makeCell }) {
  const colIndex = (key) => columns.findIndex((c) => c.key === key);
  const headerRow = columns.map((c) => c.header);
  const columnMeta = { columns: columns.map((c) => ({ width: c.width })) };
  const blankBody = () => rowOrder.map(() => columns.map(() => ""));

  const cell = (colKey, rowIdx) => {
    const code = rowOrder[rowIdx];
    const r = records[code];
    const ref = colLetter(colIndex(colKey)) + (rowIdx + 2);
    const c = makeCell(colKey, { code, r, ref, db: MOCK_DATABASE.id, rowIdx });
    // Carry the cell-state metadata the real backend sends, so the FE's status
    // counter + colours behave identically against the mock: a value-bearing
    // cell is `filled`, and a filled INTERPRET cell awaits clinician sign-off
    // (review_state='not_reviewed') — exactly what the store's trigger sets.
    // Builders that set their own state (a blocked cell) are left untouched.
    if (c && c.meta) {
      const meta = { ...c.meta };
      if (!meta.state) meta.state = "filled";
      const k = meta.kind;
      if (
        (k === "interpret" || k === "interpretive") &&
        meta.state === "filled" &&
        !meta.review_state
      ) {
        meta.review_state = "not_reviewed";
      }
      c.meta = meta;
    }
    return c;
  };

  // A cell is included in a populate batch when it has a value OR metadata
  // (so empty-but-clickable cells still populate + flash).
  const packCell = (c) => ({ ref: c.ref, value: c.value, ...(c.meta ? { meta: c.meta } : {}) });
  const populated = (c) => c.value !== "" || c.meta;

  // The structured (header present, body blank) sheet spec for this dataset.
  function blankSheet() {
    return { name: sheet, data: [headerRow, ...blankBody()], meta: columnMeta };
  }

  // workbook_created: structured (headers present) but body blank. The event
  // carries its strict-v2 `type` so it survives applyRunEvent's gate unchanged.
  function workbookEvent() {
    return {
      type: "workbook_created",
      label,
      sheets: [blankSheet()],
      cellMetadata: {},
    };
  }

  // A fully-populated workbook + complete cellMetadata (openWorkbook fallback).
  function populatedWorkbook() {
    const data = [headerRow, ...blankBody()];
    const cellMetadata = {};
    for (let i = 0; i < rowOrder.length; i++) {
      for (const col of columns) {
        const c = cell(col.key, i);
        const { row, col: cc } = parseRef(c.ref);
        data[row][cc] = c.value;
        if (c.meta) cellMetadata[sheet + "!" + c.ref] = c.meta;
      }
    }
    return { sheets: [{ name: sheet, data, meta: columnMeta }], cellMetadata };
  }

  // --- Population-step builders (varied cadence) ---
  function columnBatch(wait, colKey) {
    const cells = [];
    for (let i = 0; i < rowOrder.length; i++) {
      const c = cell(colKey, i);
      if (populated(c)) cells.push(packCell(c));
    }
    return { kind: "cells", wait, event: { type: "cell_update", sheet, cells } };
  }
  function multiColumnBatch(wait, colKeys) {
    const cells = [];
    for (const colKey of colKeys) {
      for (let i = 0; i < rowOrder.length; i++) {
        const c = cell(colKey, i);
        if (populated(c)) cells.push(packCell(c));
      }
    }
    return { kind: "cells", wait, event: { type: "cell_update", sheet, cells } };
  }
  function singleCell(wait, colKey, rowIdx) {
    return { kind: "cells", wait, event: { type: "cell_update", sheet, cells: [packCell(cell(colKey, rowIdx))] } };
  }
  // INTERPRETIVE columns fill one cell at a time (a human reading each note in
  // turn), not as a single column paste. `waitFn()` is called per cell so each
  // gets its own randomized pause. Returns an array of steps to spread into the
  // timeline; column order is preserved, top-to-bottom within each column.
  function streamColumn(waitFn, colKey) {
    const steps = [];
    for (let i = 0; i < rowOrder.length; i++) {
      const c = cell(colKey, i);
      if (populated(c)) steps.push(singleCell(waitFn(), colKey, i));
    }
    return steps;
  }
  function streamColumns(waitFn, colKeys) {
    const steps = [];
    for (const colKey of colKeys) steps.push(...streamColumn(waitFn, colKey));
    return steps;
  }
  function rowCells(wait, colKey, rowIdxs) {
    return { kind: "cells", wait, event: { type: "cell_update", sheet, cells: rowIdxs.map((i) => packCell(cell(colKey, i))) } };
  }

  // Register every populated cell's exact SQL -> result into a shared map.
  function registerSql(into) {
    for (let i = 0; i < rowOrder.length; i++) {
      for (const col of columns) {
        const c = cell(col.key, i);
        if (c.sql) into[c.sql] = c.result;
      }
    }
  }

  return {
    id, sheet, label, columns, rowOrder, records,
    cell, blankSheet, workbookEvent, populatedWorkbook,
    columnBatch, multiColumnBatch, singleCell, rowCells, registerSql,
    streamColumn, streamColumns,
  };
}

const cordAll = buildDataset({
  id: "cordAll", sheet: "ALL", label: "cord-ph-lo-audit.xlsx",
  columns: CORDPH_ALL_COLUMNS, rowOrder: CORDPH_ROW_ORDER, records: CORDPH_RECORDS, makeCell: makeCordAllCell,
});

const cordNicu = buildDataset({
  id: "cordNicu", sheet: "NICU", label: "cord-ph-lo-audit.xlsx",
  columns: CORDPH_NICU_COLUMNS, rowOrder: CORDPH_NICU_ROW_ORDER, records: CORDPH_RECORDS, makeCell: makeCordNicuCell,
});

const chestPain = buildDataset({
  id: "chestPain", sheet: "Chest Pain", label: "chest-pain-audit.xlsx",
  columns: CHESTPAIN_COLUMNS, rowOrder: CHESTPAIN_ROW_ORDER, records: CHESTPAIN_RECORDS, makeCell: makeChestPainCell,
});

const npda = buildDataset({
  id: "npda", sheet: "NPDA", label: "npda-diabetes-audit.xlsx",
  columns: NPDA_COLUMNS, rowOrder: NPDA_ROW_ORDER, records: NPDA_RECORDS, makeCell: makeNpdaCell,
});

const diabetesWorklist = buildDataset({
  id: "diabetesWorklist", sheet: DW.sheetName, label: DW.fileLabel || "diabetes-reporting-risk-worklist.xlsx",
  columns: DIABETES_WORKLIST_COLUMNS, rowOrder: DIABETES_WORKLIST_ROW_ORDER, records: NPDA_RECORDS, makeCell: makeDiabetesWorklistCell,
});

const epilepsy = buildDataset({
  id: "epilepsy", sheet: "Epilepsy", label: "epilepsy12-audit.xlsx",
  columns: EPILEPSY_COLUMNS, rowOrder: EPILEPSY_ROW_ORDER, records: EPILEPSY_RECORDS, makeCell: makeEpilepsyCell,
});

const trauma = buildDataset({
  id: "trauma", sheet: "Trauma", label: "nmtr-trauma-audit.xlsx",
  columns: TRAUMA_COLUMNS, rowOrder: TRAUMA_ROW_ORDER, records: TRAUMA_RECORDS, makeCell: makeTraumaCell,
});

// The cord audit is one workbook with TWO sheets (ALL + NICU). The viewer reads
// cellMetadata keyed "<Sheet>!<ref>", so the two datasets' metadata merge.
function cordWorkbookEvent() {
  return {
    type: "workbook_created",
    label: "cord-ph-lo-audit.xlsx",
    sheets: [cordAll.blankSheet(), cordNicu.blankSheet()],
    cellMetadata: {},
  };
}
function cordPopulatedWorkbook() {
  const a = cordAll.populatedWorkbook();
  const n = cordNicu.populatedWorkbook();
  return {
    sheets: [a.sheets[0], n.sheets[0]],
    cellMetadata: { ...a.cellMetadata, ...n.cellMetadata },
  };
}

// --- SQL resolver (mockExecuteSql) -----------------------------------------
// Built once from every dataset: every populated cell's exact SQL maps to its
// result. mock.js looks up by exact query first, then falls back to fragments.
const SQL_RESULTS = {};
cordAll.registerSql(SQL_RESULTS);
cordNicu.registerSql(SQL_RESULTS);
chestPain.registerSql(SQL_RESULTS);
npda.registerSql(SQL_RESULTS);
diabetesWorklist.registerSql(SQL_RESULTS);
epilepsy.registerSql(SQL_RESULTS);
trauma.registerSql(SQL_RESULTS);

function selectedDiabetesColumns(query) {
  const match = /SELECT\s+(.+?)\s+FROM\s+/i.exec(query || "");
  if (!match) return [];
  return match[1]
    .split(",")
    .map((part) => part.trim().replace(/^.*\./, ""))
    .filter((column) => column && column !== "PATIENT_ID");
}

function diabetesSqlValue(r, column) {
  switch (column) {
    case "NHS_Number":
      return NPDA_NHS[r.code];
    case "Diabetes_type":
      return DIABETES_TYPE[r.diabetesType].code;
    case "Hba1c":
      return dec1(r.hba1c);
    case "Hba1c_recorded_date":
      return fmtDMY(r.visitDate);
    case "Urinary_ACR":
      return r.acr == null ? null : dec1(r.acr);
    case "Urinary_ACR_recorded_date":
      return r.acr == null ? null : fmtDMY(r.visitDate);
    case "Foot_assessment_date":
      return r.footDate ? fmtDMY(r.footDate) : null;
    case "Retinal_screening_date":
      return r.retinalDate ? fmtDMY(r.retinalDate) : null;
    case "Psychological_screening_date":
      return r.psychScreen ? fmtDMY(r.psychScreen) : null;
    case "Visit_date":
      return fmtDMY(r.visitDate);
    case "Reason_for_admission":
      return r.admission ? "DKA admission" : null;
    default:
      return null;
  }
}

export function resolveSql(query) {
  const q = (query || "").trim();
  if (SQL_RESULTS[q]) return SQL_RESULTS[q];

  // --- Chest-pain dataset (CP###; EHR encounter / troponin / ecg tables) ---
  const cpMatch = /'(CP\d{3})'/.exec(q);
  if (cpMatch || /patient_encounters|ecg_results|troponin/i.test(q)) {
    const r = cpMatch ? CHESTPAIN_RECORDS[cpMatch[1]] : null;
    if (r && /clinical_notes/i.test(q)) {
      if (/'lab'/.test(q) && r.notes.lab) return noteResult([r.notes.lab]);
      if (/'triage'/.test(q)) return noteResult([r.notes.triage]);
      if (/cardiology/.test(q) && /discharge_summary/.test(q)) return noteResult([r.notes.cardiology, r.notes.discharge].filter(Boolean));
      if (/discharge_summary/.test(q)) return noteResult([r.notes.discharge]);
      if (/cardiology/.test(q)) return noteResult([r.notes.cardiology]);
    }
    if (r) return structuredResult(["PATIENT_CODE", "Age", "Troponin_ng_L"], [[r.code, r.age, r.troponinMissing ? null : r.troponin]]);
    return structuredResult(["PATIENT_CODE", "value"], []);
  }


  // --- Major-trauma dataset (TRA###; trauma-registry / ED / resus tables) ---
  // registerSql already covers every exact query; this is robustness for note
  // lookups. Checked before epilepsy/NPDA so a TRA### query is never caught by a
  // shared `medications` or `radiology_results` table match.
  const traMatch = /'(TRA\d{3})'/.exec(q);
  const traPatient = /'(trauma-patient-\d+)'/.exec(q);
  if (traMatch || traPatient || /trauma_registry|ed_trauma_receptions/i.test(q)) {
    const tcode = traMatch
      ? traMatch[1]
      : (traPatient ? TRAUMA_ROW_ORDER.find((k) => TRAUMA_RECORDS[k].patient === traPatient[1]) : null);
    const tr = tcode ? TRAUMA_RECORDS[tcode] : null;
    if (tr && /clinical_notes/i.test(q)) {
      const types = (q.match(/'([a-z_]+)'/g) || [])
        .map((s) => s.slice(1, -1))
        .filter((t) => TRAUMA_NOTE_TYPES.has(t));
      const notes = types.length ? tr.notes.filter((n) => types.includes(n.type)) : tr.notes;
      return noteResult(notes.length ? notes : tr.notes);
    }
    if (tr) {
      return structuredResult(
        ["PATIENT_ID", "NHS_Number", "Injury_severity_score"],
        [[tr.code, TRAUMA_NHS[tr.code], tr.iss]],
      );
    }
    return structuredResult(["PATIENT_ID", "value"], []);
  }

  // --- Epilepsy12 dataset (EPI###; epilepsy/radiology/cardiology tables) ---
  // registerSql already covers every exact query; this is robustness for note
  // lookups. Checked before NPDA so an EPI### query is never caught by NPDA's
  // shared `medications` table match.
  const epiMatch = /'(EPI\d{3})'/.exec(q);
  const epiPatient = /'(epilepsy-patient-\d+)'/.exec(q);
  if (epiMatch || epiPatient || /epilepsy_assessments|radiology_requests|radiology_results|cardiology_results/i.test(q)) {
    const ecode = epiMatch
      ? epiMatch[1]
      : (epiPatient ? EPILEPSY_ROW_ORDER.find((k) => EPILEPSY_RECORDS[k].patient === epiPatient[1]) : null);
    const er = ecode ? EPILEPSY_RECORDS[ecode] : null;
    if (er && /clinical_notes/i.test(q)) {
      const types = (q.match(/'([a-z_]+)'/g) || [])
        .map((s) => s.slice(1, -1))
        .filter((t) => EPILEPSY_NOTE_TYPES.has(t));
      const notes = types.length ? er.notes.filter((n) => types.includes(n.type)) : er.notes;
      return noteResult(notes.length ? notes : er.notes);
    }
    if (er) {
      return structuredResult(
        ["PATIENT_ID", "NHS_Number", "Seizure_type"],
        [[er.code, EPILEPSY_NHS[er.code], EPI_SEIZURE_TYPE[er.i.seizureType.v].code]],
      );
    }
    return structuredResult(["PATIENT_ID", "value"], []);
  }

  // --- NPDA paediatric diabetes dataset (NPD###; diabetes/clinic tables) ---
  if (/COUNT\(\*\)\s+AS\s+n\s+FROM\s+diabetes_diagnoses/i.test(q)) {
    return structuredResult(["n"], [[12]]);
  }
  if (/COUNT\(\*\)\s+AS\s+n\s+FROM\s+clinic_observations/i.test(q) && /Hba1c\s*>=\s*70/i.test(q)) {
    return structuredResult(["n"], [[5]]);
  }
  if (/COUNT\(\*\)\s+AS\s+n\s+FROM\s+clinic_observations/i.test(q) && /Urinary_ACR\s+IS\s+NULL/i.test(q)) {
    return structuredResult(["n"], [[2]]);
  }
  const npdMatch = /'(NPD\d{3})'/.exec(q);
  const npdPatient = /'(npda-patient-\d+)'/.exec(q);
  if (npdMatch || npdPatient || /diabetes_diagnoses|clinic_observations|diabetes_screening|diabetes_education|hospital_admissions/i.test(q)) {
    const ncode = npdMatch
      ? npdMatch[1]
      : (npdPatient ? NPDA_ROW_ORDER.find((k) => NPDA_RECORDS[k].patient === npdPatient[1]) : null);
    const nr = ncode ? NPDA_RECORDS[ncode] : null;
    if (nr && /clinical_notes/i.test(q)) {
      const types = (q.match(/'([a-z_]+)'/g) || [])
        .map((s) => s.slice(1, -1))
        .filter((t) => NPDA_NOTE_TYPES.has(t));
      const notes = types.length ? nr.notes.filter((n) => types.includes(n.type)) : nr.notes;
      return noteResult(notes.length ? notes : nr.notes);
    }
    if (nr) {
      const selected = selectedDiabetesColumns(q);
      const columns = selected.length ? selected : ["NHS_Number", "Diabetes_type", "Hba1c"];
      return structuredResult(
        ["PATIENT_ID", ...columns],
        [[nr.code, ...columns.map((column) => diabetesSqlValue(nr, column))]],
      );
    }
    return structuredResult(["PATIENT_ID", "value"], []);
  }

  // --- Cord-pH dataset ---
  if (/COUNT\(\*\)\s+AS\s+n\s+FROM\s+cord_ph_birth_records/i.test(q)) {
    return structuredResult(["n"], [[412]]);
  }
  const patientMatch = /'(cph-baby-\d+|CPH\d+)'/.exec(q);
  const code = patientMatch
    ? (patientMatch[1].startsWith("CPH")
        ? patientMatch[1]
        : CORDPH_ROW_ORDER.find((k) => CORDPH_RECORDS[k].baby === patientMatch[1]))
    : null;
  const r = code ? CORDPH_RECORDS[code] : null;

  if (/clinical_notes/i.test(q)) {
    if (r) {
      // Filter to the NOTE_TYPE(s) named in the query, else show all notes.
      const types = (q.match(/'([a-z_]+)'/g) || [])
        .map((s) => s.slice(1, -1))
        .filter((t) => CORD_NOTE_TYPES.has(t));
      const notes = types.length ? r.notes.filter((n) => types.includes(n.type)) : r.notes;
      return noteResult(notes.length ? notes : r.notes);
    }
    return noteResult(CORDPH_RECORDS.CPH001.notes);
  }
  if (r) {
    return structuredResult(
      ["PATIENT_CODE", "Gestation_weeks", "Birth_weight_grams", "Cord_arterial_pH", "Apgars_5"],
      [[r.code, r.gestWeeks, r.birthWeight, r.phMissing ? null : r.cordPh, r.apgar5]],
    );
  }
  // Last-resort generic result (lookup ran, nothing matched).
  return structuredResult(["PATIENT_CODE", "value"], []);
}

// --- Workbook builders (dataset-aware) --------------------------------------
// cord-pH (two sheets) stays the mockGetTablePopulationWorkbook reload fallback.
export function buildWorkbookEvent() {
  return cordWorkbookEvent();
}
export function buildPopulatedWorkbook() {
  return cordPopulatedWorkbook();
}
export function buildDiabetesWorklistPopulatedWorkbook() {
  return diabetesWorklist.populatedWorkbook();
}

// --- Dataset-keyed snapshot + seeded dashboard tables -----------------------
// The 3 seeded BPT dashboards each open to their OWN workbook: a tablePopulationId maps to
// the dataset whose populated snapshot openWorkbook should return. Anything not
// in this map falls back to the cord-pH workbook (the live-upload Flow A).
const SEEDED_DASHBOARD_POPULATIONS = [
  { tablePopulationId: "mock-tp-npda", dataset: npda },
  { tablePopulationId: "mock-tp-epilepsy", dataset: epilepsy },
  { tablePopulationId: "mock-tp-trauma", dataset: trauma },
];

// Mark every populated cell reviewed and clear any blocked state, so a seeded
// snapshot reads as a fully-clean dashboard (zero needs-review, zero blocked,
// Change 2). ONLY the 3 pre-seeded BPT dashboards use this; the cord-pH workbook
// (created live from the home flow, and its reopen fallback) keeps its
// needs-review + blocked cells so the review walkthrough happens there.
function markAllReviewed(workbook) {
  const cellMetadata = {};
  for (const [ref, meta] of Object.entries(workbook.cellMetadata || {})) {
    if (!meta || typeof meta !== "object") {
      cellMetadata[ref] = meta;
      continue;
    }
    const next = { ...meta };
    if (next.state === "blocked") next.state = "filled";
    if (next.review_state === "not_reviewed") next.review_state = "reviewed";
    cellMetadata[ref] = next;
  }
  return { ...workbook, cellMetadata };
}

export function buildPopulatedWorkbookForTablePopulation(tablePopulationId) {
  const hit = SEEDED_DASHBOARD_POPULATIONS.find((s) => s.tablePopulationId === tablePopulationId);
  // Seeded BPT dashboards open fully clean; cord-pH (the fallback, created live)
  // keeps its needs-review/blocked cells for the live review walkthrough.
  return hit ? markAllReviewed(hit.dataset.populatedWorkbook()) : cordPopulatedWorkbook();
}

// The 3 seed populated-table records (sidebar rows). Hardcoded per the wiring contract so
// this works even before any CONTENT.dashboards exists. `createdAt` is set by
// the store seeder, keeping this pure.
export function seededDashboardPopulatedTableRecords() {
  const base = { status: "completed", messages: [], activity: [], reviewSummary: null, workbook: null, runStartedAt: null, runEndedAt: null, filters: {}, criteria: [] };
  return [
    { ...base, id: "npda-lo-audit", tablePopulationId: "mock-tp-npda", title: "Diabetes BPT", submissionDeadline: "2026-07-20" },
    { ...base, id: "epilepsy12-lo-audit", tablePopulationId: "mock-tp-epilepsy", title: "Epilepsy BPT", submissionDeadline: "2027-01-12" },
    { ...base, id: "nmtr-trauma-lo-audit", tablePopulationId: "mock-tp-trauma", title: "Major Trauma BPT", submissionDeadline: "Submit ≤25 days of discharge" },
  ];
}

// --- Run timeline -----------------------------------------------------------
// A flat list of steps; each fires `wait` ms after the previous one. mock.js
// plays them. Activity events carry a short `headline` (collapsed status line,
// §5) plus a fuller `detail`. Waits are randomized so population no longer
// marches column-by-column on a fixed clock.

// A crisp 3–5 word "now" line derived from a fuller headline — what the activity
// box shows folded. Strips trailing punctuation and keeps the first few words.
const shortLabel = (headline) => {
  const clean = String(headline || "").replace(/[….\s]+$/, "").trim();
  return clean.split(/\s+/).slice(0, 5).join(" ");
};

// Three activity KINDS the box distinguishes (doc 11 §agent_activity), matching
// the backend contract: orchestrator `step`s, agent `tool` calls, and `thinking`
// snippets. Each carries `label` (folded now-line) + `kind`.
const act = (wait, headline, detail, extra = {}) => ({
  kind: "activity", wait,
  event: { type: "activity", headline, detail, label: shortLabel(headline), kind: "step", ...extra },
});
const tool = (wait, name, status, headline, label) => ({
  kind: "activity", wait,
  event: {
    type: "activity", name, status, headline,
    label: label || shortLabel(headline), kind: "tool",
  },
});
const think = (wait, text, label = CONTENT.timeline.thinkingLabel) => ({
  kind: "activity", wait,
  event: { type: "activity", headline: text, label, kind: "thinking" },
});

// Translatable timeline strings (headlines, details, think snippets, tool
// headlines). The cadence (wait/kind/tool name/status) stays in logic.
const T = CONTENT.timeline;

// Derive the review-summary totals from the SAME cell metadata the live chip
// counts (countWorkbookStatus uses blocked + needs_verification), so the mock
// summary at the end of the run matches the top-band chip exactly — the whole
// point of the count-alignment fix. Computed from the populated workbook, which
// shares the cell() builder (hence the same state/review_state) with the stream.
function totalsFromCellMetadata(cellMetadata) {
  let cells = 0, filled = 0, blocked = 0, needs_verification = 0, low_confidence = 0;
  for (const meta of Object.values(cellMetadata || {})) {
    if (!meta || typeof meta !== "object") continue;
    cells += 1;
    const state = String(meta.state || "").toLowerCase();
    const reviewState = String(meta.review_state || "").toLowerCase();
    const confidence = String(meta.confidence || "").toLowerCase();
    if (state === "blocked") blocked += 1;
    else if (state === "filled") filled += 1;
    if (state === "filled" && reviewState === "not_reviewed") needs_verification += 1;
    if (confidence === "low" || confidence === "medium") low_confidence += 1;
  }
  return { cells, filled, blocked, needs_verification, low_confidence };
}

const reviewSummary = (wait, { totals }) => ({
  kind: "review_summary",
  wait,
  event: {
    type: "review_summary",
    totals,
    blocking: { count: totals.blocked, reason_codes: {}, focus: [] },
    verification: {
      pending: totals.needs_verification,
      reviewed: 0,
      corrected: 0,
      focus: { needs_review: [], low_confidence: [], assumptions: [] },
    },
  },
});

// Cord-pH population: fill the wide ALL sheet in mixed-cadence batches
// (structured columns fast, interpretive note reads slower, a few single
// cells), then switch to and populate the NICU sheet.
function cordPhPopulation(all, nicu) {
  const steps = [];

  // DIRECT columns paste as a whole column at once (a structured copy). The two
  // value kinds populate at different cadences (README §6.5): a randomized
  // per-cell pause for interpretive note reads, a single batch wait for direct
  // copies. `ic()` is the per-cell interpretive pause; the spread of waits makes
  // some cells linger and others snap, so the fill never marches on a fixed
  // clock. Tuned so the whole run lands around a minute.
  const ic = () => rnd(200, 420);

  steps.push(act(rnd(400, 600), T.cord.mapTemplate.headline, T.cord.mapTemplate.detail));
  steps.push(all.columnBatch(rnd(400, 600), "patient"));

  steps.push(act(rnd(350, 550), T.cord.copyBirthRecord.headline, T.cord.copyBirthRecord.detail));
  steps.push(all.multiColumnBatch(rnd(600, 800), ["gestWeeks", "gestDays", "maternalAge", "parity"]));
  steps.push(all.multiColumnBatch(rnd(550, 750), ["delivery", "birthWeight"]));
  steps.push(all.multiColumnBatch(rnd(550, 750), ["apgar1", "apgar5", "apgar10"]));

  steps.push(act(rnd(400, 600), T.cord.antenatalScreening.headline, T.cord.antenatalScreening.detail));
  steps.push(all.multiColumnBatch(rnd(550, 750), ["normalScans", "normalDopplers", "ctgDone"]));

  // INTERPRETIVE: read each baby's antenatal note in turn, one cell at a time.
  steps.push(act(rnd(550, 750), T.cord.antenatalNotes.headline, T.cord.antenatalNotes.detail));
  steps.push(...all.streamColumns(ic, ["foetalMovements", "maternalComorbidities", "maternalComorbiditiesOther", "prom", "rffs"]));

  steps.push(tool(rnd(450, 650), "sql_execute", "ok", T.tools.cordGasPanel));
  steps.push(all.multiColumnBatch(rnd(600, 800), ["ph", "be", "lactate"])); // CPH003 Unavailable, CPH007 lactate Not recorded

  // INTERPRETIVE: obstetric + midwifery notes, read baby by baby.
  steps.push(act(rnd(550, 750), T.cord.obstetricNotes.headline, T.cord.obstetricNotes.detail));
  steps.push(think(rnd(350, 550), T.cord.thinkDcc));
  steps.push(...all.streamColumns(ic, ["dcc", "liquorMeconium", "chorioamnionitis", "sentinelEvent"]));

  // INTERPRETIVE: resuscitation records, read one at a time.
  steps.push(act(rnd(500, 700), T.cord.resuscitationNotes.headline, T.cord.resuscitationNotes.detail));
  steps.push(...all.streamColumns(ic, ["intubated", "compressions", "drugs"]));

  // INTERPRETIVE: postnatal metabolic note, baby by baby.
  steps.push(act(rnd(400, 600), T.cord.metabolicScreen.headline, T.cord.metabolicScreen.detail));
  steps.push(...all.streamColumn(ic, "hypoglycaemia"));

  steps.push(act(rnd(450, 650), T.cord.followUp.headline, T.cord.followUp.detail));
  steps.push(all.multiColumnBatch(rnd(650, 900), ["ward", "gasRepeated", "ageRepeatedGas", "repeatedLactate", "ageGasNormalised"]));
  steps.push(all.multiColumnBatch(rnd(500, 700), ["admittedNicu", "ageDischargeHome"]));

  steps.push(act(rnd(400, 600), T.cord.governance.headline, T.cord.governance.detail));
  steps.push(all.multiColumnBatch(rnd(500, 700), ["unitQuestionnaire", "guidelineCordGas", "guidelineFetalAcidosis"]));

  // --- NICU sheet ---
  steps.push(act(rnd(550, 750), T.cord.nicuSheet.headline, T.cord.nicuSheet.detail));
  steps.push(nicu.columnBatch(rnd(450, 650), "nnuAdmitAge"));
  steps.push(nicu.multiColumnBatch(rnd(550, 750), ["transferredOut", "durationNicu", "ageDischargeHomeNicu"]));

  // INTERPRETIVE: cooling + CFM reconciliation, cell by cell.
  steps.push(act(rnd(550, 750), T.cord.coolingCfm.headline, T.cord.coolingCfm.detail));
  steps.push(think(rnd(400, 600), T.cord.thinkCfm));
  steps.push(...nicu.streamColumns(ic, ["cooled", "ageCooling", "cfm"]));

  // INTERPRETIVE: neurology reports, read one at a time.
  steps.push(act(rnd(550, 750), T.cord.neurologyReports.headline, T.cord.neurologyReports.detail));
  steps.push(...nicu.streamColumns(ic, ["seizures", "clinicalSeizures", "electrographicSeizure", "mriInjury"]));

  // INTERPRETIVE: discharge summaries, cell by cell.
  steps.push(act(rnd(450, 650), T.cord.dischargeSummaries.headline, T.cord.dischargeSummaries.detail));
  steps.push(...nicu.streamColumns(ic, ["feeding", "abnormalNeurology"]));

  steps.push(act(rnd(450, 650), T.cord.finalizing.headline, T.cord.finalizing.detail));
  steps.push(reviewSummary(rnd(250, 450), {
    totals: totalsFromCellMetadata(cordPopulatedWorkbook().cellMetadata),
  }));
  steps.push({ kind: "done", wait: rnd(400, 600), event: { type: "done" } });
  return steps;
}

// Chest-pain population: build-then-populate, largely column-by-column.
function chestPainPopulation(ds) {
  const steps = [];

  steps.push(act(rnd(450, 650), T.chest.populating.headline, T.chest.populating.detail));
  steps.push(ds.columnBatch(rnd(400, 600), "patient"));
  steps.push(ds.columnBatch(rnd(500, 700), "age"));

  steps.push(act(rnd(450, 650), T.chest.triageNotes.headline, T.chest.triageNotes.detail));
  steps.push(ds.columnBatch(rnd(600, 850), "complaint"));

  steps.push(tool(rnd(450, 650), "sql_execute", "ok", T.tools.troponinResults));
  steps.push(ds.columnBatch(rnd(550, 750), "troponin")); // includes CP004 "Unavailable"

  steps.push(act(rnd(450, 650), T.chest.ecgResults.headline, T.chest.ecgResults.detail));
  steps.push(ds.columnBatch(rnd(550, 750), "ecg")); // includes CP005 empty
  steps.push(ds.columnBatch(rnd(450, 650), "timeToEcg")); // includes CP005 empty

  steps.push(act(rnd(500, 700), T.chest.cardiologyNotes.headline, T.chest.cardiologyNotes.detail));
  steps.push(ds.columnBatch(rnd(600, 800), "diagnosis"));

  steps.push(act(rnd(450, 650), T.chest.dischargeSummaries.headline, T.chest.dischargeSummaries.detail));
  steps.push(ds.columnBatch(rnd(550, 750), "decision"));

  steps.push(act(rnd(450, 650), T.chest.finalizing.headline, T.chest.finalizing.detail));
  steps.push(reviewSummary(rnd(250, 450), {
    totals: totalsFromCellMetadata(ds.populatedWorkbook().cellMetadata),
  }));
  steps.push({ kind: "done", wait: rnd(400, 600), event: { type: "done" } });
  return steps;
}

// Flow A — run the uploaded Cord pH template: structure ready, then populate.
function timelineA() {
  return [
    act(250, T.flowA.reviewingTemplate.headline, T.flowA.reviewingTemplate.detail),
    tool(rnd(550, 750), "query_schema", "ok", T.tools.inspectedSchema),
    { kind: "workbook", wait: rnd(550, 750), event: cordWorkbookEvent() },
    ...cordPhPopulation(cordAll, cordNicu),
  ];
}

// Flow TBL — a thread-spawned TABLE population. REUSES the cord-pH workbook +
// cell builders, but a COMPACT timeline: a couple of column batches, the review
// summary, then done. Two reasons it's short: (1) the table inspector demo shows
// running → done quickly (the user watches it fill, gets the completion toast,
// clicks through), and (2) it keeps the store test fast. The wrapped table population is still
// the same engine / stream / workbook — only the step list is trimmed. It
// keeps the cord workbook's needs-review/blocked cells so the cell-evidence
// walkthrough still demos in the opened table.
function timelineTable() {
  return [
    act(250, T.flowA.reviewingTemplate.headline, T.flowA.reviewingTemplate.detail),
    tool(rnd(350, 500), "query_schema", "ok", T.tools.inspectedSchema),
    { kind: "workbook", wait: rnd(350, 500), event: cordWorkbookEvent() },
    act(rnd(300, 450), T.cord.mapTemplate.headline, T.cord.mapTemplate.detail),
    cordAll.columnBatch(rnd(300, 450), "patient"),
    act(rnd(300, 450), T.cord.copyBirthRecord.headline, T.cord.copyBirthRecord.detail),
    ...cordAll.streamColumns(() => rnd(150, 300), ["dcc", "liquorMeconium"]),
    act(rnd(300, 450), T.cord.dischargeSummaries.headline, T.cord.dischargeSummaries.detail),
    act(rnd(300, 450), T.cord.finalizing.headline, T.cord.finalizing.detail),
    reviewSummary(rnd(200, 350), {
      totals: totalsFromCellMetadata(cordPopulatedWorkbook().cellMetadata),
    }),
    { kind: "done", wait: rnd(300, 450), event: { type: "done" } },
  ];
}

function diabetesWorklistPopulation(ds) {
  const steps = [];
  const noteCell = () => rnd(700, 1200);
  const dwt = T.diabetesWorklist;

  steps.push(act(rnd(700, 950), dwt.scoping.headline, dwt.scoping.detail));
  steps.push(ds.columnBatch(rnd(500, 750), "patient"));
  steps.push(tool(rnd(800, 1100), "sql_execute", "ok", dwt.fetchingEvidence));
  steps.push(ds.multiColumnBatch(rnd(850, 1150), ["hba1c", "hba1cDate"]));
  steps.push(ds.multiColumnBatch(rnd(700, 950), ["acr", "acrDate"]));
  steps.push(act(rnd(850, 1150), dwt.readingNotes.headline, dwt.readingNotes.detail));
  steps.push(...ds.streamColumns(noteCell, ["glucoseIntervention", "admission", "lastReview"]));
  steps.push(reviewSummary(rnd(500, 750), {
    totals: totalsFromCellMetadata(ds.populatedWorkbook().cellMetadata),
  }));
  steps.push({ kind: "done", wait: rnd(400, 650), event: { type: "done" } });
  return steps;
}

function timelineDiabetesWorklist() {
  const dwt = T.diabetesWorklist;
  return [
    act(450, dwt.creating.headline, dwt.creating.detail),
    tool(rnd(650, 900), "query_schema", "ok", T.tools.inspectedSchema),
    { kind: "workbook", wait: rnd(550, 800), event: diabetesWorklist.workbookEvent() },
    ...diabetesWorklistPopulation(diabetesWorklist),
  ];
}

// Flow B — describe the data (the chest-pain email): build the spreadsheet
// first, then populate it column-by-column.
function timelineB() {
  return [
    act(300, T.flowB.readingRequest.headline, T.flowB.readingRequest.detail),
    act(rnd(900, 1200), T.flowB.buildingSpreadsheet.headline, T.flowB.buildingSpreadsheet.detail),
    act(rnd(1000, 1300), T.flowB.addingColumns.headline, T.flowB.addingColumns.detail),
    { kind: "workbook", wait: rnd(900, 1100), event: chestPain.workbookEvent() },
    ...chestPainPopulation(chestPain),
  ];
}

// NPDA population: fill the single sheet in mixed-cadence batches (structured
// columns fast, interpretive note reads slower), faithful to the cord cadence.
function npdaPopulation(ds) {
  const steps = [];
  const ic = () => rnd(200, 420);

  steps.push(act(rnd(400, 600), T.npda.mapTemplate.headline, T.npda.mapTemplate.detail));
  steps.push(ds.columnBatch(rnd(400, 600), "patient"));

  steps.push(act(rnd(350, 550), T.npda.demographics.headline, T.npda.demographics.detail));
  steps.push(ds.multiColumnBatch(rnd(600, 800), ["dob", "postcode", "sex", "ethnicity"]));
  steps.push(ds.multiColumnBatch(rnd(550, 750), ["adhdAsd", "learningDisability", "diabetesType", "diagnosisDate"]));

  steps.push(act(rnd(400, 600), T.npda.registration.headline, T.npda.registration.detail));
  steps.push(ds.multiColumnBatch(rnd(600, 850), ["leavingDate", "leavingReason", "deathDate", "gpPractice", "pduNumber", "visitDate"]));

  steps.push(act(rnd(400, 600), T.npda.clinicMeasurements.headline, T.npda.clinicMeasurements.detail));
  steps.push(ds.multiColumnBatch(rnd(650, 900), ["height", "weight", "obsDateHtWt", "hba1c", "obsDateHba1c"]));

  // INTERPRETIVE: read each child's diabetes clinic note, one cell at a time.
  steps.push(act(rnd(550, 750), T.npda.diabetesClinicNotes.headline, T.npda.diabetesClinicNotes.detail));
  steps.push(...ds.streamColumns(ic, ["insulinRegime", "cgm", "lifestyle"]));

  steps.push(act(rnd(450, 650), T.npda.treatmentFlags.headline, T.npda.treatmentFlags.detail));
  steps.push(ds.multiColumnBatch(rnd(600, 850), ["otherMed", "ketoneTesting", "immunotherapy", "immunotherapyDate"]));

  steps.push(tool(rnd(450, 650), "sql_execute", "ok", T.tools.cardiometabolicScreen));
  steps.push(ds.multiColumnBatch(rnd(650, 900), ["systolic", "diastolic", "obsDateBP", "cholesterol", "obsDateChol"]));
  steps.push(ds.multiColumnBatch(rnd(600, 850), ["acr", "obsDateAcr", "albuminuriaStage"])); // NPD007/NPD010 ACR Not done

  steps.push(act(rnd(450, 650), T.npda.surveillanceScreening.headline, T.npda.surveillanceScreening.detail));
  steps.push(ds.multiColumnBatch(rnd(650, 900), ["footDate", "retinalDate", "retinalResult"]));
  steps.push(ds.multiColumnBatch(rnd(600, 850), ["thyroidDate", "thyroidTreatment", "coeliacDate", "glutenFree"]));

  // INTERPRETIVE: annual review note for smoking/vaping, child by child.
  steps.push(act(rnd(450, 650), T.npda.annualReviewNotes.headline, T.npda.annualReviewNotes.detail));
  steps.push(...ds.streamColumn(ic, "smoking"));
  steps.push(ds.multiColumnBatch(rnd(600, 850), ["smokingCessationDate", "fluDate", "sickDayDate"]));

  steps.push(ds.columnBatch(rnd(450, 650), "psychScreen"));

  // INTERPRETIVE: psychology note for the support outcome, child by child.
  steps.push(act(rnd(550, 750), T.npda.psychologyNotes.headline, T.npda.psychologyNotes.detail));
  steps.push(...ds.streamColumn(ic, "psychOutcome"));
  steps.push(ds.columnBatch(rnd(450, 650), "mentalHealthAppt"));

  // INTERPRETIVE: dietetic input + admissions, cell by cell.
  steps.push(act(rnd(500, 700), T.npda.dieteticAdmissions.headline, T.npda.dieteticAdmissions.detail));
  steps.push(...ds.streamColumn(ic, "dietitian"));
  steps.push(ds.multiColumnBatch(rnd(600, 850), ["carbCounting", "dietitianApptDate"]));
  steps.push(...ds.streamColumn(ic, "admissionReason"));
  steps.push(ds.multiColumnBatch(rnd(650, 900), ["admissionStart", "admissionDischarge", "admissionReasonOther", "dkaTherapies", "initialPh", "initialBicarb"]));

  steps.push(act(rnd(450, 650), T.npda.finalizing.headline, T.npda.finalizing.detail));
  steps.push(reviewSummary(rnd(250, 450), {
    totals: totalsFromCellMetadata(ds.populatedWorkbook().cellMetadata),
  }));
  steps.push({ kind: "done", wait: rnd(400, 600), event: { type: "done" } });
  return steps;
}

// Flow C — run the uploaded NPDA template: structure ready, then populate.
function timelineC() {
  return [
    act(250, T.flowC.reviewingTemplate.headline, T.flowC.reviewingTemplate.detail),
    tool(rnd(550, 750), "query_schema", "ok", T.tools.inspectedSchema),
    { kind: "workbook", wait: rnd(550, 750), event: npda.workbookEvent() },
    ...npdaPopulation(npda),
  ];
}

// Epilepsy12 population: fill the single sheet in mixed-cadence batches
// (structured columns fast, interpretive note reads slower), mirroring NPDA.
function epilepsyPopulation(ds) {
  const steps = [];
  const ic = () => rnd(200, 420);

  steps.push(act(rnd(400, 600), T.epilepsy.mapTemplate.headline, T.epilepsy.mapTemplate.detail));
  steps.push(ds.columnBatch(rnd(400, 600), "patient"));

  steps.push(act(rnd(350, 550), T.epilepsy.demographics.headline, T.epilepsy.demographics.detail));
  steps.push(ds.multiColumnBatch(rnd(600, 800), ["dob", "sex", "ageAtAssessment"]));
  steps.push(ds.multiColumnBatch(rnd(550, 750), ["referralDate", "firstAssessmentDate"]));

  // INTERPRETIVE: read each child's epilepsy clinic letter for the assessing
  // paediatrician's expertise (B1) and the seizure type (B4), cell by cell.
  steps.push(act(rnd(550, 750), T.epilepsy.clinicLetters.headline, T.epilepsy.clinicLetters.detail));
  steps.push(...ds.streamColumns(ic, ["expertisePaediatrician", "seizureType"]));

  steps.push(act(rnd(400, 600), T.epilepsy.specialistInput.headline, T.epilepsy.specialistInput.detail));
  steps.push(ds.multiColumnBatch(rnd(600, 850), ["esnInputDate", "carePlanDate"])); // EPI006 ESN / EPI010 plan Not done

  steps.push(tool(rnd(450, 650), "sql_execute", "ok", T.tools.epilepsyInvestigations));
  steps.push(act(rnd(400, 600), T.epilepsy.investigations.headline, T.epilepsy.investigations.detail));
  steps.push(ds.multiColumnBatch(rnd(650, 900), ["mriIndicated", "mriRequestDate", "mriPerformedDate"])); // EPI007 MRI blocked
  steps.push(ds.columnBatch(rnd(500, 700), "ecgDate")); // EPI005 ECG Not done / non-convulsive N/A

  // INTERPRETIVE: mental-health screening note for the problem/support outcome.
  steps.push(act(rnd(450, 650), T.epilepsy.mentalHealth.headline, T.epilepsy.mentalHealth.detail));
  steps.push(ds.columnBatch(rnd(450, 650), "mhScreeningDate")); // EPI009 screening Not done
  steps.push(...ds.streamColumns(ic, ["mhProblemIdentified", "mhSupportProvided"]));

  steps.push(act(rnd(450, 650), T.epilepsy.medicationSafety.headline, T.epilepsy.medicationSafety.detail));
  steps.push(ds.multiColumnBatch(rnd(600, 850), ["onValproate", "onTopiramate", "pppInPlace"])); // EPI005 PPP missing (safety-critical)

  steps.push(act(rnd(450, 650), T.epilepsy.finalizing.headline, T.epilepsy.finalizing.detail));
  steps.push(reviewSummary(rnd(250, 450), {
    totals: totalsFromCellMetadata(ds.populatedWorkbook().cellMetadata),
  }));
  steps.push({ kind: "done", wait: rnd(400, 600), event: { type: "done" } });
  return steps;
}

// Flow E — run the uploaded Epilepsy12 template: structure ready, then populate.
function timelineEpilepsy() {
  return [
    act(250, T.flowE.reviewingTemplate.headline, T.flowE.reviewingTemplate.detail),
    tool(rnd(550, 750), "query_schema", "ok", T.tools.inspectedSchema),
    { kind: "workbook", wait: rnd(550, 750), event: epilepsy.workbookEvent() },
    ...epilepsyPopulation(epilepsy),
  ];
}

// Major-trauma population: fill the single sheet in mixed-cadence batches
// (structured columns fast, interpretive note reads slower), mirroring epilepsy.
function traumaPopulation(ds) {
  const steps = [];
  const ic = () => rnd(200, 420);

  steps.push(act(rnd(400, 600), T.trauma.mapTemplate.headline, T.trauma.mapTemplate.detail));
  steps.push(ds.columnBatch(rnd(400, 600), "patient"));

  steps.push(act(rnd(350, 550), T.trauma.demographics.headline, T.trauma.demographics.detail));
  steps.push(ds.multiColumnBatch(rnd(600, 800), ["dob", "sex", "ageYears", "iss", "ais3plus"]));

  steps.push(act(rnd(400, 600), T.trauma.registrySubmission.headline, T.trauma.registrySubmission.detail));
  steps.push(ds.multiColumnBatch(rnd(650, 900), ["edArrivalDateTime", "dischargeDate", "nmtrSubmitted", "datasetComplete", "submissionDate"])); // TRA003 submitted at 31 days (>25)

  steps.push(tool(rnd(450, 650), "sql_execute", "ok", T.tools.traumaReception));
  steps.push(act(rnd(400, 600), T.trauma.reception.headline, T.trauma.reception.detail));
  steps.push(ds.multiColumnBatch(rnd(600, 850), ["traumaTeamActivated", "consultantPresent", "consultantArrivalMin"])); // TRA009 arrival blocked / TRA002 late

  steps.push(tool(rnd(450, 650), "sql_execute", "ok", T.tools.traumaInterventions));
  steps.push(act(rnd(400, 600), T.trauma.investigations.headline, T.trauma.investigations.detail));
  steps.push(ds.multiColumnBatch(rnd(650, 900), ["gcs", "headInjury", "ctHeadMin"])); // TRA002 CT late / TRA005 no head N/A
  steps.push(ds.multiColumnBatch(rnd(600, 850), ["txaIndicated", "txaGiven", "txaMin"])); // TRA006 TXA late
  steps.push(ds.columnBatch(rnd(500, 700), "airwayConsideredMin")); // gated to GCS <9

  // INTERPRETIVE: read each case's resuscitation note for airway/intubation.
  steps.push(act(rnd(450, 650), T.trauma.resusNotes.headline, T.trauma.resusNotes.detail));
  steps.push(...ds.streamColumn(ic, "intubationConsidered"));

  // INTERPRETIVE: rehabilitation prescription read from the rehab/discharge note.
  steps.push(act(rnd(450, 650), T.trauma.rehabilitation.headline, T.trauma.rehabilitation.detail));
  steps.push(ds.columnBatch(rnd(450, 650), "rehabNeedsAssessed"));
  steps.push(...ds.streamColumn(ic, "rehabPrescriptionIssued")); // TRA005 prescription Not done

  steps.push(act(rnd(450, 650), T.trauma.finalizing.headline, T.trauma.finalizing.detail));
  steps.push(reviewSummary(rnd(250, 450), {
    totals: totalsFromCellMetadata(ds.populatedWorkbook().cellMetadata),
  }));
  steps.push({ kind: "done", wait: rnd(400, 600), event: { type: "done" } });
  return steps;
}

// Flow T — run the uploaded NMTR trauma template: structure ready, then populate.
function timelineTrauma() {
  return [
    act(250, T.flowT.reviewingTemplate.headline, T.flowT.reviewingTemplate.detail),
    tool(rnd(550, 750), "query_schema", "ok", T.tools.inspectedSchema),
    { kind: "workbook", wait: rnd(550, 750), event: trauma.workbookEvent() },
    ...traumaPopulation(trauma),
  ];
}

export function buildTimeline(flow) {
  if (flow === "C") return timelineC();
  if (flow === "E") return timelineEpilepsy();
  if (flow === "T") return timelineTrauma();
  if (flow === "DW") return timelineDiabetesWorklist();
  if (flow === "TBL") return timelineTable();
  return flow === "B" ? timelineB() : timelineA();
}

// --- Sample doctor's email (Flow B) ----------------------------------------
export const mockSampleEmail = CONTENT.email;

// --- Data-library Datasets (saved cohort filters) ---------------------------
// A Dataset is a saved, named filter scoping the hospital database to a slice
// (library-and-sources.md §A). Each criterion binds to a real table.column with
// a parameterised SQL predicate; `cohort_sql` is the read-only statement that
// implements the slice, and `count` is its proved COUNT(DISTINCT identity).
//
// Seeded: one cord-pH Dataset — term babies (gestation ≥ 39) admitted to NICU —
// with two filter criteria, a not_available row for a free-text-only concept,
// and a deterministic count. PATCH / add-filter recompute the count with no LLM.

export const DATASET_NOT_AVAILABLE_REASON =
  "Recorded only in free-text notes, not in a filterable column — deferred (structured fields only).";

// Shapes conform to specs/product/contracts/dataset.schema.json: `schema_version`
// "1", predicate `op` from the contract symbol enum (">=", "=", …), and no extra
// keys on `predicate`. The `display` string is the contract-formatted one-liner the
// backend computes (store.display_predicate) — the chip strips the label off it.
export const MOCK_LIBRARY_DATASETS = [
  {
    schema_version: "1",
    id: "ds-cordph-nicu",
    name: "Term babies admitted to NICU",
    description:
      "The group of babies born at term (39 weeks or more) who were admitted to the neonatal unit.",
    databases: ["cord-ph"],
    cohort: {
      database: "cord-ph",
      from: "cord_ph_birth_records",
      identity_select: "DISTINCT cord_ph_birth_records.patient_code",
      identity_keys: ["patient_code"],
    },
    criteria: [
      {
        criterion_id: "gestation_weeks",
        label: "Gestation (weeks)",
        type: "number",
        source: "cord-ph -> cord_ph_birth_records.gestation_weeks",
        predicate: { op: ">=", value: 39 },
        display: "Gestation (weeks) ≥ 39",
        sql: "cord_ph_birth_records.gestation_weeks >= :gestation_weeks",
        params: { gestation_weeks: 39 },
      },
      {
        criterion_id: "admitted_nicu",
        label: "Admitted to NICU",
        type: "category",
        source: "cord-ph -> cord_ph_birth_records.nicu_admission",
        predicate: { op: "=", value: "yes" },
        display: "Admitted to NICU = yes",
        sql: "cord_ph_birth_records.nicu_admission = :admitted_nicu",
        params: { admitted_nicu: "yes" },
      },
    ],
    not_available: [
      {
        phrase: "showed signs of birth asphyxia",
        reason: DATASET_NOT_AVAILABLE_REASON,
      },
    ],
    count: 1,
  },
];

// Compose the read-only cohort SQL from the Dataset's criteria — the exact,
// transparent statement of the slice shown in the raw-SQL view. Pure: it is the
// single source of `cohort_sql`, so any chip edit recomposes it deterministically.
export function composeCohortSql(dataset) {
  const cohort = dataset?.cohort || {};
  const from = cohort.from || "records";
  // The contract's cohort_sql ENUMERATES the slice's identities
  // (SELECT DISTINCT <identity> … — dataset.schema.json), the same shape the real
  // backend persists; the count is run separately. identity_select already carries
  // the DISTINCT, so we don't double it.
  const identity = cohort.identity_select || "DISTINCT *";
  const criteria = Array.isArray(dataset?.criteria) ? dataset.criteria : [];
  const where = criteria.map((c) => c.sql).filter(Boolean);
  const lines = [`SELECT ${identity}`, `FROM ${from}`];
  if (where.length) {
    lines.push("WHERE " + where.join("\n  AND "));
  }
  return lines.join("\n") + ";";
}

// Deterministic, no-LLM count recompute. Each filter is "tighter or looser" by a
// reproducible rule keyed off its predicate, so editing a chip changes the count
// the same way every time (a stand-in for the real read-only COUNT). The seeded
// Dataset (gestation ≥ 39, NICU = yes) resolves to 1 to match the fixture.
export function deriveDatasetCount(dataset) {
  const BASE = 240; // notional cohort size before filters
  const criteria = Array.isArray(dataset?.criteria) ? dataset.criteria : [];
  let count = BASE;
  for (const c of criteria) {
    const p = c.predicate || {};
    if (c.type === "number") {
      const v = Number(Array.isArray(p.value) ? p.value[0] : p.value);
      if (Number.isFinite(v)) {
        // A `>=` threshold keeps the rows at or above it: every step up the scale
        // drops ~1/40 of the notional 40-week span, so a higher cut → fewer rows.
        const span = p.op === "<=" ? v - 20 : 40 - v;
        count = Math.round((count * Math.max(0, Math.min(span, 40))) / 40);
      }
    } else {
      // A categorical equality keeps a deterministic fraction of the cohort.
      count = Math.round(count * 0.2);
    }
  }
  return Math.max(0, count);
}

// --- Threads (the conversation surface) ------------------------------------
// A thread is the free-ranging, UNSCOPED conversation surface (product-flows.md
// §Threads, tables & outputs). The shapes below mirror the FROZEN backend
// contract EXACTLY — core/threads/store.py (mint/append/title) plus the agent
// result shapes. The mock layer in mock.js reuses these constants + helpers so
// VITE_MOCK is a faithful demo.

// Default title until the first user message names the thread; ~60-char trim
// ceiling for a derived title (store.py DEFAULT_TITLE / _TITLE_MAX).
export const THREAD_DEFAULT_TITLE = "New thread";
export const DIABETES_DEMO_THREAD_TITLE = "Remboursements diabète pedia";
const THREAD_TITLE_MAX = 60;

// The honest agent-message scope disclosure. The real backend passes every
// message to the agent; mock mode mirrors that with canned agent outputs.
export const THREAD_WHOLE_DB_DISCLOSURE =
  "answered across the whole hospital database";

// A canned chat answer + ≥1 inline citation the mock returns for a chat-style
// message, MIRRORING the server (the real answer is the chat-answer skill's
// output; the citation is the evidence-skill source shape).
export const THREAD_CHAT_ANSWER =
  "Across the whole hospital database, there were 412 births this quarter [1].";
export const THREAD_CHAT_CITATIONS = [
  {
    kind: "aggregate",
    marker: "1",
    database: "cord-ph",
    query: "SELECT COUNT(*) AS n FROM cord_ph_birth_records",
    table_column: "cord_ph_birth_records.patient_code",
    explanation: "count of birth records across the whole hospital database",
    denominator: { label: "birth records", value: 412 },
    completeness: { label: "records counted", value: "412/412" },
    covered_rows: [
      {
        kind: "source",
        database: "cord-ph",
        query:
          "SELECT patient_code FROM cord_ph_birth_records WHERE patient_code = 'CPH001'",
        table_column: "cord_ph_birth_records.patient_code",
        explanation: "covered birth record",
      },
    ],
  },
];

export const DIABETES_WORKLIST_SOURCE_TEMPLATE = "diabetes-worklist";
export const DIABETES_WORKLIST_TABLE_TITLE = DW.tableTitle;
export const DIABETES_RISK_LIST_ASK_ID = "ask-diabetes-risk-list";
export const DIABETES_RISK_LIST_QUESTION_ID = "show_diabetes_risk_list";
export const DIABETES_RISK_LIST_SHOW_CHOICE_ID = "show_list";
export const DIABETES_RISK_LIST_KEEP_CHOICE_ID = "keep_summary";
export const DIABETES_WORKLIST_ASK_ID = "ask-diabetes-worklist";
export const DIABETES_WORKLIST_QUESTION_ID = "create_diabetes_worklist";
export const DIABETES_WORKLIST_CREATE_CHOICE_ID = "create_table";
export const DIABETES_WORKLIST_KEEP_CHOICE_ID = "keep_list";

export const DIABETES_WORKLIST_ANSWER = DW.answer;

export const DIABETES_PATIENT_RISK_LIST_ANSWER = DIABETES_WORKLIST_ANSWER;

export const DIABETES_WORKLIST_CITATIONS = [
  {
    kind: "aggregate",
    marker: "1",
    database: MOCK_DATABASE.id,
    query: "SELECT COUNT(*) AS n FROM diabetes_diagnoses WHERE audit_year = '2025/26'",
    table_column: "diabetes_diagnoses.PATIENT_ID",
    explanation: DW.citations.cohort.explanation,
    denominator: { label: DW.citations.cohort.denominatorLabel, value: 12 },
    completeness: { label: DW.citations.cohort.completenessLabel, value: "12/12" },
  },
  {
    kind: "aggregate",
    marker: "2",
    database: MOCK_DATABASE.id,
    query: "SELECT COUNT(*) AS n FROM clinic_observations WHERE Hba1c >= 70 AND audit_year = '2025/26'",
    table_column: "clinic_observations.Hba1c",
    explanation: DW.citations.highHba1c.explanation,
    denominator: { label: DW.citations.highHba1c.denominatorLabel, value: 5 },
    completeness: { label: DW.citations.highHba1c.completenessLabel, value: "12/12" },
  },
  {
    kind: "aggregate",
    marker: "3",
    database: MOCK_DATABASE.id,
    query: "SELECT COUNT(*) AS n FROM clinic_observations WHERE Urinary_ACR IS NULL AND audit_year = '2025/26'",
    table_column: "clinic_observations.Urinary_ACR",
    explanation: DW.citations.missingAcr.explanation,
    denominator: { label: DW.citations.missingAcr.denominatorLabel, value: 2 },
    completeness: { label: DW.citations.missingAcr.completenessLabel, value: "12/12" },
  },
  {
    marker: "4",
    database: MOCK_DATABASE.id,
    query: "SELECT PATIENT_ID, Hba1c FROM clinic_observations WHERE PATIENT_ID = 'NPD002'",
    table_column: "clinic_observations.Hba1c",
    explanation: DW.citations.hba1c("NPD002"),
  },
  {
    marker: "5",
    database: MOCK_DATABASE.id,
    query: "SELECT PATIENT_ID, Hba1c FROM clinic_observations WHERE PATIENT_ID = 'NPD003'",
    table_column: "clinic_observations.Hba1c",
    explanation: DW.citations.hba1c("NPD003"),
  },
  {
    marker: "6",
    database: MOCK_DATABASE.id,
    query: "SELECT AUTHOR_ROLE, DATE, NOTE_TYPE, TEXT FROM clinical_notes WHERE PATIENT = 'npda-patient-003' AND NOTE_TYPE IN ('admission')",
    table_column: "clinical_notes.TEXT",
    explanation: DW.citations.dkaNewDiagnosis("NPD003"),
    citations: [DW.evidence.dkaNewDiagnosis],
  },
  {
    marker: "7",
    database: MOCK_DATABASE.id,
    query: "SELECT PATIENT_ID, Hba1c FROM clinic_observations WHERE PATIENT_ID = 'NPD005'",
    table_column: "clinic_observations.Hba1c",
    explanation: DW.citations.hba1c("NPD005"),
  },
  {
    marker: "8",
    database: MOCK_DATABASE.id,
    query: "SELECT PATIENT_ID, Hba1c FROM clinic_observations WHERE PATIENT_ID = 'NPD006'",
    table_column: "clinic_observations.Hba1c",
    explanation: DW.citations.hba1c("NPD006"),
  },
  {
    marker: "9",
    database: MOCK_DATABASE.id,
    query: "SELECT AUTHOR_ROLE, DATE, NOTE_TYPE, TEXT FROM clinical_notes WHERE PATIENT = 'npda-patient-006' AND NOTE_TYPE IN ('admission')",
    table_column: "clinical_notes.TEXT",
    explanation: DW.citations.recentDka("NPD006"),
    citations: [DW.evidence.recentDka],
  },
  {
    marker: "10",
    database: MOCK_DATABASE.id,
    query: "SELECT PATIENT_ID, Urinary_ACR FROM clinic_observations WHERE PATIENT_ID = 'NPD007'",
    table_column: "clinic_observations.Urinary_ACR",
    explanation: DW.citations.urinaryAcr("NPD007"),
  },
  {
    marker: "11",
    database: MOCK_DATABASE.id,
    query: "SELECT PATIENT_ID, Hba1c FROM clinic_observations WHERE PATIENT_ID = 'NPD008'",
    table_column: "clinic_observations.Hba1c",
    explanation: DW.citations.hba1c("NPD008"),
  },
  {
    marker: "12",
    database: MOCK_DATABASE.id,
    query: "SELECT PATIENT_ID, Urinary_ACR FROM clinic_observations WHERE PATIENT_ID = 'NPD010'",
    table_column: "clinic_observations.Urinary_ACR",
    explanation: DW.citations.urinaryAcr("NPD010"),
  },
];

function normalizeScopeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function wholeDbScope() {
  return {
    kind: "whole_db",
    dataset_id: null,
    disclosure: THREAD_WHOLE_DB_DISCLOSURE,
  };
}

// Derive a thread title from the first user message — trimmed, truncated to ~60
// chars; "New thread" for an empty message (store._derive_title).
export function deriveThreadTitle(message) {
  const text = String(message || "").trim();
  if (!text) return THREAD_DEFAULT_TITLE;
  // Truncate by Unicode code point (spread to an array of code points) to match
  // the server's Python slice `text[:60]`, which counts code points — a plain
  // JS `.slice(60)` counts UTF-16 code units and would diverge (or split a
  // surrogate pair) on non-BMP characters, breaking mock↔server title parity.
  const points = [...text];
  return points.length > THREAD_TITLE_MAX
    ? points.slice(0, THREAD_TITLE_MAX).join("").replace(/\s+$/, "")
    : text;
}

export function mockAskUserQuestionRequest() {
  return {
    id: "ask-mock-dataset",
    status: "pending",
    questions: [
      {
        id: "dataset_scope",
        question: "Which Dataset should I use?",
        choices: [
          { id: "whole_db", label: "Whole hospital database" },
          { id: "ds-nicu", label: "Term babies admitted to NICU" },
          { id: "ds-quarter", label: "Latest complete quarter" },
        ],
        allow_other: true,
        required: true,
      },
      {
        id: "answer_format",
        question: "What output format do you want?",
        choices: [
          { id: "short_answer", label: "Short answer" },
          { id: "table", label: "Table" },
        ],
        allow_other: true,
        required: false,
      },
    ],
    answers: [],
  };
}

export function diabetesWorklistAskUserQuestionRequest() {
  return {
    id: DIABETES_WORKLIST_ASK_ID,
    status: "pending",
    questions: [
      {
        id: DIABETES_WORKLIST_QUESTION_ID,
        question: DW.ask.question,
        choices: [
          { id: DIABETES_WORKLIST_CREATE_CHOICE_ID, label: DW.ask.createLabel },
          { id: DIABETES_WORKLIST_KEEP_CHOICE_ID, label: DW.ask.keepLabel },
        ],
        allow_other: false,
        required: true,
      },
    ],
    answers: [],
  };
}

export function diabetesRiskListAskUserQuestionRequest() {
  return {
    id: DIABETES_RISK_LIST_ASK_ID,
    status: "pending",
    questions: [
      {
        id: DIABETES_RISK_LIST_QUESTION_ID,
        question: DW.riskListAsk.question,
        choices: [
          { id: DIABETES_RISK_LIST_SHOW_CHOICE_ID, label: DW.riskListAsk.showLabel },
          { id: DIABETES_RISK_LIST_KEEP_CHOICE_ID, label: DW.riskListAsk.keepLabel },
        ],
        allow_other: false,
        required: true,
      },
    ],
    answers: [],
  };
}

export function isDiabetesWorklistPrompt(content) {
  const text = normalizeScopeText(content);
  return /\b(diabetes|diabete)\b/.test(text);
}

// The agent resolution for one message. There is no mock pre-agent classifier:
// the mock agent either asks a structured question (for demo trigger text) or
// returns a canned chat answer with citations.
export function resolveThreadMessage(content) {
  const normalized = normalizeScopeText(content);
  if (isDiabetesWorklistPrompt(content)) {
    return {
      message: DIABETES_WORKLIST_ANSWER,
      resolution: {
        output: "chat",
        scope: wholeDbScope(),
        artifact_id: null,
        seam: null,
        citations: DIABETES_WORKLIST_CITATIONS.map((citation) => ({ ...citation })),
        ask_user_questions: diabetesWorklistAskUserQuestionRequest(),
      },
    };
  }
  if (normalized.includes("needs dataset")) {
    return {
      message: "",
      resolution: {
        output: "chat",
        scope: wholeDbScope(),
        artifact_id: null,
        seam: null,
        ask_user_questions: mockAskUserQuestionRequest(),
      },
    };
  }
  if (/\b(table|audit|spreadsheet)\b/i.test(String(content || ""))) {
    return {
      message: "I started that table.",
      resolution: {
        output: "table",
        scope: wholeDbScope(),
        artifact_id: null,
        seam: null,
      },
    };
  }
  return {
    message: THREAD_CHAT_ANSWER,
    resolution: {
      output: "chat",
      scope: wholeDbScope(),
      artifact_id: null,
      seam: null,
      citations: THREAD_CHAT_CITATIONS.map((c) => ({ ...c })),
    },
  };
}

// --- Tables (the populated audit table — a first-class re-openable entity) ---
// A `table` wraps an existing table population (table.schema.json; decision 0004).
// When a table is created, the system PINS this spec (columns/grain + scope) and
// spawns table population; `table_population_id` back-references that population.
// In mock mode the wrapped population is the cord-pH
// Flow A timeline (kept needs-review/blocked cells, so the live fill + evidence
// walkthrough demo end-to-end). These builders are PURE; the side-effecting mint
// (population registration, store insert) lives in mock.js.

export const TABLE_WHOLE_DB_SCOPE_DISCLOSURE = "the whole hospital database";

// The pinned columns/grain snapshot a table takes at creation. For a mock
// template-backed table this mirrors the cord-pH audit's shape — a minimal
// snapshot, enough for the contract + the inspector title.
export function buildTableSpec() {
  return {
    columns: [
      { id: "patient", name: "Patient" },
      { id: "cord_ph", name: "Cord pH" },
      { id: "discharge_summary", name: "Discharge summary" },
    ],
    grain: "one row per patient record",
  };
}

export function buildDiabetesWorklistSpec() {
  return {
    columns: DIABETES_WORKLIST_COLUMNS.map((column) => ({
      id: column.key,
      name: column.header,
    })),
    grain: "one row per paediatric diabetes patient with reporting or BPT follow-up context",
  };
}

// Build the full frozen table entity (table.schema.json) for a freshly-spawned
// mock table. `tablePopulationId` is the wrapped population (already registered with a timeline by
// the caller); `threadId` is the provenance back-ref (null for a direct create).
export function buildMockTable({ id, title, description, sourceTemplate, datasetId, tablePopulationId, threadId, now }) {
  const stamp = now || new Date().toISOString();
  const template = sourceTemplate || "cord-ph";
  return {
    schema_version: "1",
    id,
    title: title || "Untitled table",
    description: description || "",
    source_template: template,
    dataset_id: datasetId ?? null,
    scope_disclosure: TABLE_WHOLE_DB_SCOPE_DISCLOSURE,
    spec: template === DIABETES_WORKLIST_SOURCE_TEMPLATE ? buildDiabetesWorklistSpec() : buildTableSpec(),
    table_population_id: tablePopulationId ?? null,
    // Mirror the backend: a table with a wrapped population is "in_progress"; an ad-hoc
    // table (no population — the template-backed engine can't populate it) is "queued".
    status: tablePopulationId ? "in_progress" : "queued",
    reporting_period_label: "1 Apr 2025 – 31 Mar 2026",
    thread_id: threadId ?? null,
    created_at: stamp,
    updated_at: stamp,
  };
}

// Two seed threads mirroring the full frozen shape. Recency is expressed via
// updated_at so list ordering (DESC) is exercised by the demo.
export const MOCK_THREADS = [
  {
    schema_version: "1",
    id: ARTIFACT_WORKSPACE_THREAD_ID,
    title: "Lung MOC Prep",
    created_at: "2026-07-09T10:00:00+00:00",
    updated_at: "2026-07-09T10:00:05+00:00",
    // Starts empty: the streamed opening plays live when the doctor sends a
    // MOC message (from here or via keyword from a New chat).
    messages: [],
    artifact_ids: [],
  },
  {
    schema_version: "1",
    id: "thread-seedaudit01",
    title: "Audit every patient missing a discharge summary",
    created_at: "2026-06-24T09:00:00+00:00",
    updated_at: "2026-06-24T09:00:05+00:00",
    messages: [
      {
        role: "user",
        content: "Audit every patient missing a discharge summary",
        created_at: "2026-06-24T09:00:00+00:00",
      },
      {
        role: "agent",
        content: THREAD_CHAT_ANSWER,
        created_at: "2026-06-24T09:00:05+00:00",
        resolution: {
          output: "chat",
          scope: {
            kind: "whole_db",
            dataset_id: null,
            disclosure: THREAD_WHOLE_DB_DISCLOSURE,
          },
          artifact_id: null,
          seam: null,
          citations: THREAD_CHAT_CITATIONS.map((c) => ({ ...c })),
        },
      },
    ],
    artifact_ids: [],
  },
  {
    schema_version: "1",
    id: "thread-seedchat01",
    title: "How are admissions trending this week?",
    created_at: "2026-06-23T14:30:00+00:00",
    updated_at: "2026-06-23T14:30:04+00:00",
    messages: [
      {
        role: "user",
        content: "How are admissions trending this week?",
        created_at: "2026-06-23T14:30:00+00:00",
      },
      {
        role: "agent",
        content: THREAD_CHAT_ANSWER,
        created_at: "2026-06-23T14:30:04+00:00",
        resolution: {
          output: "chat",
          scope: {
            kind: "whole_db",
            dataset_id: null,
            disclosure: THREAD_WHOLE_DB_DISCLOSURE,
          },
          artifact_id: null,
          seam: null,
          citations: THREAD_CHAT_CITATIONS.map((c) => ({ ...c })),
        },
      },
    ],
    artifact_ids: [],
  },
];

// Seed tables (the populated-table cards the Tables section shows on load). Each
// is a fully-formed `table` entity (table.schema.json shape) carrying a
// table_population_id so the existing population pipeline can fill it when a card is opened; the mock
// layer registers those table_population_ids in `tablePopulationFlows` so the stream plays. Distinct
// `source_template` values + recency (updated_at DESC) exercise the section's
// filter, search, and ordering. `tablePopulationId` here is the placeholder the mock layer
// rewrites to a freshly registered table population on boot (so the timeline is wired).
export const MOCK_TABLES = [
  {
    schema_version: "1",
    id: "table-seedcordph01",
    title: "Cord pH compliance — Q4 2025/26",
    description: "Every delivery missing a paired cord-gas sample across the trust.",
    source_template: "cord-ph",
    dataset_id: null,
    scope_disclosure: TABLE_WHOLE_DB_SCOPE_DISCLOSURE,
    spec: buildTableSpec(),
    table_population_id: "table-seedcordph01-tp",
    status: "complete",
    reporting_period_label: "1 Apr 2025 – 31 Mar 2026",
    thread_id: null,
    created_at: "2026-06-25T11:00:00+00:00",
    updated_at: "2026-06-25T11:42:00+00:00",
  },
  {
    schema_version: "1",
    id: "table-seedchestpain01",
    title: "Chest-pain pathway timings",
    description: "Door-to-ECG and troponin turnaround for every chest-pain attendance.",
    source_template: "chest-pain",
    dataset_id: null,
    scope_disclosure: TABLE_WHOLE_DB_SCOPE_DISCLOSURE,
    spec: buildTableSpec(),
    table_population_id: "table-seedchestpain01-tp",
    status: "complete",
    reporting_period_label: "1 Jan 2026 – 31 Mar 2026",
    thread_id: null,
    created_at: "2026-06-24T16:00:00+00:00",
    updated_at: "2026-06-24T16:18:00+00:00",
  },
  {
    schema_version: "1",
    id: "table-seedcordph02",
    title: "Cord pH — NICU admissions",
    description: "NICU-admitted neonates and their cord-gas documentation.",
    source_template: "cord-ph",
    dataset_id: null,
    scope_disclosure: TABLE_WHOLE_DB_SCOPE_DISCLOSURE,
    spec: buildTableSpec(),
    table_population_id: "table-seedcordph02-tp",
    status: "complete",
    reporting_period_label: "1 Apr 2025 – 31 Mar 2026",
    thread_id: null,
    created_at: "2026-06-22T08:30:00+00:00",
    updated_at: "2026-06-22T09:05:00+00:00",
  },
];
