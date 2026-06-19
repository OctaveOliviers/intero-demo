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
//     sheets ("ALL" and "NICU") faithfully reproduce docs/templates/
//     cord-ph-lo-audit.xlsx, including the blank spacer columns.
//   • chestPain          — Flow B, built live from the pasted chest-pain email
//
// This module is pure data + builders — no Svelte stores, no env. mock.js wires
// it into the api/run layer.
//
// All human-readable (translatable) strings live in the locale-selected content
// pack (src/lib/mock/content). This module reads them via CONTENT and keeps the
// logic — SQL, identifiers, numbers, dates, codes, cadence, timeline assembly.

import { CONTENT } from "./mock/content/index.js";

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
// Reproduces docs/templates/cord-ph-lo-audit.xlsx exactly: same sheets, same
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


  // --- NPDA paediatric diabetes dataset (NPD###; diabetes/clinic tables) ---
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
      return structuredResult(
        ["PATIENT_ID", "NHS_Number", "Diabetes_type", "Hba1c"],
        [[nr.code, NPDA_NHS[nr.code], DIABETES_TYPE[nr.diabetesType].code, nr.hba1c]],
      );
    }
    return structuredResult(["PATIENT_ID", "value"], []);
  }

  // --- Cord-pH dataset ---
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
// cord-pH (two sheets) stays the mockGetWorkbook reload fallback.
export function buildWorkbookEvent() {
  return cordWorkbookEvent();
}
export function buildPopulatedWorkbook() {
  return cordPopulatedWorkbook();
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

export function buildTimeline(flow) {
  if (flow === "C") return timelineC();
  return flow === "B" ? timelineB() : timelineA();
}

// --- Sample doctor's email (Flow B) ----------------------------------------
export const mockSampleEmail = CONTENT.email;
