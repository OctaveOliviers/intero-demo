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

// --- Databases (README §6.2) ------------------------------------------------
// The picker offers patient notes, lab results and radiology. MOCK_DATABASE
// remains the EHR id used as the source tag on populated cell metadata — it
// is intentionally not exposed in the picker list.
export const MOCK_DATABASES = [
  { id: "patient-notes-db", name: "Patient notes", status: "ready" },
  { id: "lab-results-db", name: "Lab results", status: "ready" },
  { id: "radiology-db", name: "Radiology database", status: "ready" },
];
export const MOCK_DATABASE = { id: "ehr-db", name: "EHR database" };

// --- Pre-loaded analyses (home list) ----------------------------------------
// Display-only decorations so the home screen looks lived-in. Cord pH is NOT
// here — the user uploads it live (Flow A). Running any of these replays the
// cord-pH dataset, which is acceptable for the demo.
const blankFilters = () => ({ dateFrom: "", dateTo: "", hospitals: "", cohort: "" });

export const MOCK_ANALYSES = [
  { id: "sentinel-stroke", name: "Sentinel Stroke", description: "Door-to-needle times, imaging and outcomes for sentinel stroke admissions.", defaultFilters: blankFilters() },
  { id: "paediatric-diabetes", name: "Paediatric Diabetes", description: "New paediatric type 1 presentations, DKA severity and follow-up.", defaultFilters: blankFilters() },
  { id: "emergency-laparotomy", name: "Emergency Laparotomy", description: "Risk assessment, time to theatre and outcomes for emergency laparotomies.", defaultFilters: blankFilters() },
  { id: "heart-failure", name: "Heart Failure", description: "Heart-failure admissions: ejection fraction, treatment and readmission.", defaultFilters: blankFilters() },
  { id: "early-inflammatory-autoimmune", name: "Early Inflammatory Autoimmune Diseases", description: "Time to diagnosis and treatment for early inflammatory autoimmune disease.", defaultFilters: blankFilters() },
];

// The cord-pH template the user uploads live (Flow A). Kept for the upload
// handler's default filters; it is not seeded into the home list.
export const MOCK_TEMPLATE = {
  id: "cord-ph-audit",
  name: "Cord pH at Birth Audit",
  description: "Cord blood gas, resuscitation and documentation quality at birth.",
  defaultFilters: blankFilters(),
};

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

const CORDPH_RECORDS = {
  CPH001: {
    code: "CPH001", baby: "cph-baby-001",
    gestWeeks: 39, gestDays: 4, maternalAge: 31, parity: 1,
    normalScans: "Yes", normalDopplers: "Yes", ctgDone: "Yes",
    delivery: "Spontaneous vaginal", birthWeight: 3420, apgar1: 8, apgar5: 9, apgar10: 10,
    cordPh: 7.28, baseExcess: -3.4, lactate: 3.1,
    ward: "Postnatal ward",
    gasRepeated: "No", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "No", ageDischargeHome: 2,
    unitQuestionnaire: "Yes", guidelineCordGas: "Yes", guidelineFetalAcidosis: "No",
    i: {
      fm: { v: "Normal", e: ["fetal movements were normal throughout the pregnancy"] },
      mc: { v: "None", e: ["No maternal comorbidities were documented"] },
      mco: { v: "None", e: ["no other medical history of note"] },
      lm: { v: "Clear", e: ["Liquor was clear throughout"] },
      chorio: { v: "No", e: ["no features of chorioamnionitis"] },
      prom: { v: "No", e: ["no prolonged rupture of membranes"] },
      rffs: { v: "No", e: ["No risk factors for sepsis were identified"] },
      sentinel: { v: "None", e: ["There was no sentinel event"] },
      dcc: { v: "Yes", e: ["Delayed cord clamping performed for about 90 seconds", "clamped at around 90 seconds in line with unit policy"] },
      intub: { v: "No", e: ["The baby was not intubated"] },
      compress: { v: "No", e: ["no cardiac compressions were required"] },
      drugs: { v: "None", e: ["no resuscitation drugs were given"] },
      hypo: { v: "No", e: ["with no hypoglycaemia"] },
    },
    notes: [
      { role: "Obstetrics — antenatal clinic", date: "2026-04-02", type: "antenatal", text: "Booking and antenatal course low risk. Reported fetal movements were normal throughout the pregnancy. No maternal comorbidities were documented and there was no other medical history of note. No risk factors for sepsis were identified, and membranes ruptured at delivery with no prolonged rupture of membranes." },
      { role: "Obstetrics — Dr Hannah Reid", date: "2026-04-02", type: "birth_summary", text: "Term baby born by spontaneous vaginal delivery at 39+4. Liquor was clear throughout and there were no features of chorioamnionitis. There was no sentinel event. Cord gases normal (arterial pH 7.28). Delayed cord clamping performed for about 90 seconds. No resuscitation beyond drying and stimulation." },
      { role: "Midwifery — Leah Morgan", date: "2026-04-02", type: "delivery", text: "Spontaneous vaginal birth, immediate skin-to-skin. Cord left to pulsate and clamped at around 90 seconds in line with unit policy. Apgars 8 and 9, baby pink and active throughout." },
      { role: "Neonatology — resuscitation record", date: "2026-04-02", type: "resuscitation", text: "No active resuscitation was required. The baby was not intubated, no cardiac compressions were required and no resuscitation drugs were given." },
      { role: "Postnatal ward — newborn check", date: "2026-04-04", type: "postnatal", text: "Routine newborn examination normal. Blood glucose remained within normal limits with no hypoglycaemia. Feeding well; discharged home on day 2." },
    ],
  },

  CPH002: {
    code: "CPH002", baby: "cph-baby-002",
    gestWeeks: 40, gestDays: 1, maternalAge: 34, parity: 2,
    normalScans: "Yes", normalDopplers: "No", ctgDone: "Yes",
    delivery: "Emergency caesarean", birthWeight: 3650, apgar1: 3, apgar5: 5, apgar10: 7,
    cordPh: 7.03, baseExcess: -15.2, lactate: 10.6,
    ward: "NICU",
    gasRepeated: "Yes", ageRepeatedGas: 2, repeatedLactate: 6.2, ageGasNormalised: 10,
    admittedNicu: "Yes", ageDischargeHome: 6,
    unitQuestionnaire: "Yes", guidelineCordGas: "Yes", guidelineFetalAcidosis: "No",
    i: {
      fm: { v: "Reduced", e: ["Reduced fetal movements reported"] },
      mc: { v: "Gestational diabetes", e: ["gestational diabetes"] },
      mco: { v: "Diet-controlled", e: ["diet-controlled"] },
      lm: { v: "Meconium", e: ["meconium-stained liquor"] },
      chorio: { v: "No", e: ["no features of chorioamnionitis"] },
      prom: { v: "No", e: ["no prolonged rupture of membranes"] },
      rffs: { v: "No", e: ["No other risk factors for sepsis"] },
      sentinel: { v: "None", e: ["no sentinel event"] },
      dcc: { v: "No", e: ["cord clamped immediately to allow resuscitation", "no delayed cord clamping as active resuscitation was required"] },
      intub: { v: "Yes", e: ["Baby intubated at delivery"] },
      compress: { v: "Yes", e: ["brief chest compressions"] },
      drugs: { v: "Adrenaline", e: ["one dose of adrenaline given"] },
      hypo: { v: "Yes", e: ["Transient hypoglycaemia in the first hours of life"] },
    },
    n: {
      admitAge: 0.5, transferredOut: "No", durationDays: 5,
      cooled: { v: "Yes", e: ["Therapeutic cooling started"] },
      ageCooling: { v: "1.3", e: ["started at 1.3 hours"] },
      cfm: { v: "Concordant", e: ["abnormal background without electrographic seizures", "abnormal background, no seizures"], explanation: "The bedside CFM note and the formal neurology report both read an abnormal background with no seizures — concordant." },
      seizures: { v: "No", e: ["no clinical or electrographic seizures"] },
      clinical: { v: "No", e: ["no clinical or electrographic seizures"] },
      electro: { v: "No", e: ["no clinical or electrographic seizures"] },
      mri: { v: "No acute injury", e: ["MRI showed no acute injury"] },
      feeding: { v: "Breastfeeding", e: ["breastfeeding established"] },
      abnNeuro: { v: "No", e: ["Neurological examination normal at discharge"] },
    },
    notes: [
      { role: "Obstetrics — antenatal clinic", date: "2026-04-04", type: "antenatal", text: "Pregnancy complicated by gestational diabetes, diet-controlled. Reduced fetal movements reported in the days before delivery. No other risk factors for sepsis and no prolonged rupture of membranes." },
      { role: "Obstetrics — Dr Mark Alvarez", date: "2026-04-04", type: "birth_summary", text: "Emergency caesarean for pathological CTG and meconium-stained liquor. There were no features of chorioamnionitis and no sentinel event. Baby flat at delivery; cord clamped immediately to allow resuscitation." },
      { role: "Midwifery — Leah Morgan", date: "2026-04-04", type: "delivery", text: "Category 1 caesarean. Baby handed to the neonatal team straight away; no delayed cord clamping as active resuscitation was required." },
      { role: "Neonatology — resuscitation record", date: "2026-04-04", type: "resuscitation", text: "Baby intubated at delivery with brief chest compressions and one dose of adrenaline given. Good response with return of spontaneous circulation." },
      { role: "Neonatology — newborn metabolic", date: "2026-04-05", type: "postnatal", text: "Transient hypoglycaemia in the first hours of life, treated with intravenous dextrose and resolved." },
      { role: "Neonatology — Dr Priya Shah", date: "2026-04-04", type: "nicu_admission", text: "Admitted to NICU at 0.5 hours of age. Therapeutic cooling started at 1.3 hours. CFM showed an abnormal background without electrographic seizures, consistent with the structured record." },
      { role: "Neurology — formal aEEG report", date: "2026-04-06", type: "neurology_report", text: "Formal aEEG review confirms an abnormal background, no seizures. There were no clinical or electrographic seizures. MRI showed no acute injury." },
      { role: "Neonatology — discharge summary", date: "2026-04-10", type: "discharge", text: "Discharged home on day 6, breastfeeding established. Neurological examination normal at discharge." },
    ],
  },

  CPH003: {
    code: "CPH003", baby: "cph-baby-003",
    gestWeeks: 38, gestDays: 6, maternalAge: 29, parity: 0,
    normalScans: "Yes", normalDopplers: "Yes", ctgDone: "Yes",
    delivery: "Forceps", birthWeight: 3180, apgar1: 7, apgar5: 9, apgar10: 10,
    cordPh: null, baseExcess: null, lactate: null, phMissing: true,
    ward: "Postnatal ward",
    gasRepeated: "No", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "No", ageDischargeHome: 3,
    unitQuestionnaire: "Yes", guidelineCordGas: "Yes", guidelineFetalAcidosis: "No",
    phEvidence: ["Arterial cord sample clotted and no valid pH is available"],
    i: {
      fm: { v: "Normal", e: ["normal fetal movements"] },
      mc: { v: "None", e: ["No maternal comorbidities"] },
      mco: { v: "None", e: ["no other medical history of note"] },
      lm: { v: "Clear", e: ["Liquor was clear"] },
      chorio: { v: "No", e: ["no features of chorioamnionitis"] },
      prom: { v: "Yes", e: ["Prolonged rupture of membranes for over 24 hours"] },
      rffs: { v: "Yes", e: ["recorded as a risk factor for sepsis"] },
      sentinel: { v: "None", e: ["no sentinel event"] },
      dcc: { v: "Yes", e: ["cord clamping delayed approximately 60 seconds", "cord intact for about a minute prior to clamping"] },
      intub: { v: "No", e: ["The baby was not intubated"] },
      compress: { v: "No", e: ["no cardiac compressions were required"] },
      drugs: { v: "None", e: ["no resuscitation drugs were given"] },
      hypo: { v: "No", e: ["with no hypoglycaemia"] },
    },
    notes: [
      { role: "Obstetrics — antenatal clinic", date: "2026-04-06", type: "antenatal", text: "Low-risk pregnancy with normal fetal movements. No maternal comorbidities and no other medical history of note. Prolonged rupture of membranes for over 24 hours before delivery, which was recorded as a risk factor for sepsis." },
      { role: "Obstetrics — Dr Hannah Reid", date: "2026-04-06", type: "birth_summary", text: "Forceps delivery for prolonged second stage. Liquor was clear with no features of chorioamnionitis and no sentinel event. Arterial cord sample clotted and no valid pH is available. Baby vigorous; cord clamping delayed approximately 60 seconds before handover." },
      { role: "Midwifery — Leah Morgan", date: "2026-04-06", type: "delivery", text: "Assisted vaginal birth. Baby cried immediately and was kept on mother's chest with cord intact for about a minute prior to clamping." },
      { role: "Neonatology — resuscitation record", date: "2026-04-06", type: "resuscitation", text: "No resuscitation required. The baby was not intubated, no cardiac compressions were required and no resuscitation drugs were given." },
      { role: "Postnatal ward — newborn check", date: "2026-04-08", type: "postnatal", text: "Newborn check normal. Blood glucose within normal limits with no hypoglycaemia. Discharged home on day 3." },
    ],
  },

  CPH004: {
    code: "CPH004", baby: "cph-baby-004",
    gestWeeks: 39, gestDays: 2, maternalAge: 28, parity: 1,
    normalScans: "Yes", normalDopplers: "Yes", ctgDone: "Yes",
    delivery: "Spontaneous vaginal", birthWeight: 3350, apgar1: 8, apgar5: 9, apgar10: 10,
    cordPh: 7.26, baseExcess: -4.1, lactate: 3.6,
    ward: "Postnatal ward",
    gasRepeated: "No", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "No", ageDischargeHome: 2,
    unitQuestionnaire: "Yes", guidelineCordGas: "Yes", guidelineFetalAcidosis: "No",
    i: {
      fm: { v: "Normal", e: ["fetal movements were normal throughout"] },
      mc: { v: "None", e: ["No maternal comorbidities"] },
      mco: { v: "None", e: ["no other medical history of note"] },
      lm: { v: "Clear", e: ["Liquor was clear"] },
      chorio: { v: "No", e: ["no features of chorioamnionitis"] },
      prom: { v: "No", e: ["no prolonged rupture of membranes"] },
      rffs: { v: "No", e: ["No risk factors for sepsis"] },
      sentinel: { v: "None", e: ["no sentinel event"] },
      dcc: { v: "Yes", e: ["delayed cord clamping for around 60 seconds", "cord left to pulsate for about a minute before clamping"] },
      intub: { v: "No", e: ["The baby was not intubated"] },
      compress: { v: "No", e: ["no cardiac compressions were required"] },
      drugs: { v: "None", e: ["no resuscitation drugs were given"] },
      hypo: { v: "No", e: ["with no hypoglycaemia"] },
    },
    notes: [
      { role: "Obstetrics — antenatal clinic", date: "2026-04-09", type: "antenatal", text: "Low-risk pregnancy and fetal movements were normal throughout. No maternal comorbidities and no other medical history of note. Membranes ruptured at the onset of labour with no prolonged rupture of membranes. No risk factors for sepsis were identified." },
      { role: "Obstetrics — Dr Hannah Reid", date: "2026-04-09", type: "birth_summary", text: "Term baby born by spontaneous vaginal delivery at 39+2. Liquor was clear and there were no features of chorioamnionitis. There was no sentinel event. Cord gases reassuring (arterial pH 7.26), with delayed cord clamping for around 60 seconds." },
      { role: "Midwifery — Leah Morgan", date: "2026-04-09", type: "delivery", text: "Spontaneous vaginal birth with immediate skin-to-skin. Cord left to pulsate for about a minute before clamping. Apgars 8 and 9, baby pink and active." },
      { role: "Neonatology — resuscitation record", date: "2026-04-09", type: "resuscitation", text: "No active resuscitation required. The baby was not intubated, no cardiac compressions were required and no resuscitation drugs were given." },
      { role: "Postnatal ward — newborn check", date: "2026-04-11", type: "postnatal", text: "Routine newborn examination normal. Blood glucose remained within normal limits with no hypoglycaemia. Feeding well; discharged home on day 2." },
    ],
  },

  CPH005: {
    code: "CPH005", baby: "cph-baby-005",
    gestWeeks: 41, gestDays: 0, maternalAge: 33, parity: 3,
    normalScans: "Yes", normalDopplers: "Yes", ctgDone: "Yes",
    delivery: "Spontaneous vaginal", birthWeight: 4120, apgar1: 6, apgar5: 8, apgar10: 9,
    cordPh: 7.12, baseExcess: -9.8, lactate: 7.2,
    ward: "Postnatal ward",
    gasRepeated: "Yes", ageRepeatedGas: 1, repeatedLactate: 4.1, ageGasNormalised: 6,
    admittedNicu: "No", ageDischargeHome: 2,
    unitQuestionnaire: "Yes", guidelineCordGas: "Yes", guidelineFetalAcidosis: "No",
    i: {
      fm: { v: "Normal", e: ["Normal fetal movements throughout"] },
      mc: { v: "Gestational diabetes", e: ["gestational diabetes"] },
      mco: { v: "Insulin-treated", e: ["insulin-treated"] },
      lm: { v: "Clear", e: ["Liquor was clear"] },
      chorio: { v: "No", e: ["no features of chorioamnionitis"] },
      prom: { v: "No", e: ["No prolonged rupture of membranes"] },
      rffs: { v: "No", e: ["no risk factors for sepsis"] },
      sentinel: { v: "Shoulder dystocia", e: ["shoulder dystocia resolved within 90 seconds"] },
      dcc: { v: "No", e: ["the cord was clamped early and the baby passed to the resuscitaire", "Immediate clamping and transfer to the resuscitaire"] },
      intub: { v: "No", e: ["The baby was not intubated"] },
      compress: { v: "No", e: ["no cardiac compressions were required"] },
      drugs: { v: "None", e: ["no resuscitation drugs were given"] },
      hypo: { v: "Yes", e: ["Hypoglycaemia in the first day"] },
    },
    notes: [
      { role: "Obstetrics — antenatal clinic", date: "2026-04-11", type: "antenatal", text: "Pregnancy complicated by gestational diabetes, insulin-treated, with a macrosomic baby on growth scans. Normal fetal movements throughout. No prolonged rupture of membranes and no risk factors for sepsis." },
      { role: "Obstetrics — Dr Mark Alvarez", date: "2026-04-11", type: "birth_summary", text: "Spontaneous vaginal delivery complicated by shoulder dystocia resolved within 90 seconds. Liquor was clear with no features of chorioamnionitis. Baby required stimulation and brief mask ventilation, so the cord was clamped early and the baby passed to the resuscitaire." },
      { role: "Midwifery — Leah Morgan", date: "2026-04-11", type: "delivery", text: "Difficult birth complicated by shoulder dystocia. Immediate clamping and transfer to the resuscitaire for inflation breaths." },
      { role: "Neonatology — resuscitation record", date: "2026-04-11", type: "resuscitation", text: "Brief mask ventilation given with a good response. The baby was not intubated, no cardiac compressions were required and no resuscitation drugs were given." },
      { role: "Postnatal ward — newborn check", date: "2026-04-13", type: "postnatal", text: "Macrosomic infant of a diabetic mother. Hypoglycaemia in the first day requiring additional feeds and monitoring, subsequently resolved." },
    ],
  },

  CPH006: {
    code: "CPH006", baby: "cph-baby-006",
    gestWeeks: 35, gestDays: 5, maternalAge: 27, parity: 0,
    normalScans: "No", normalDopplers: "No", ctgDone: "Yes",
    delivery: "Emergency caesarean", birthWeight: 2680, apgar1: 5, apgar5: 7, apgar10: 8,
    cordPh: 7.18, baseExcess: -8.1, lactate: 6.4,
    ward: "NICU",
    gasRepeated: "No", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "Yes", ageDischargeHome: 16,
    unitQuestionnaire: "Yes", guidelineCordGas: "Yes", guidelineFetalAcidosis: "No",
    i: {
      fm: { v: "Normal", e: ["Normal fetal movements reported"] },
      mc: { v: "None", e: ["No pre-existing maternal comorbidities"] },
      mco: { v: "None", e: ["no other medical history of note"] },
      lm: { v: "Clear", e: ["Liquor was clear"] },
      chorio: { v: "Suspected", e: ["suspected chorioamnionitis"] },
      prom: { v: "Yes", e: ["Prolonged rupture of membranes beyond 18 hours"] },
      rffs: { v: "Yes", e: ["recorded as a risk factor for sepsis"] },
      sentinel: { v: "None", e: ["no sentinel event"] },
      dcc: { v: "No", e: ["Preterm baby clamped promptly and taken to NICU", "without delayed clamping due to prematurity"] },
      intub: { v: "No", e: ["The baby was not intubated"] },
      compress: { v: "No", e: ["no cardiac compressions were required"] },
      drugs: { v: "None", e: ["no resuscitation drugs were given"] },
      hypo: { v: "Yes", e: ["episodes of hypoglycaemia in the first days"] },
    },
    n: {
      admitAge: 0.4, transferredOut: "No", durationDays: 14,
      cooled: { v: "No", e: ["therapeutic cooling was not indicated"] },
      ageCooling: { v: "N/A", e: ["therapeutic cooling was not indicated"] },
      cfm: { v: "Not done", e: ["no CFM was used"], explanation: "Admitted to NICU for prematurity and suspected sepsis rather than encephalopathy, so no CFM monitoring was used — recorded explicitly as not done." },
      seizures: { v: "No", e: ["No clinical seizures were noted"] },
      clinical: { v: "No", e: ["No clinical seizures were noted"] },
      electro: { v: "No", e: ["no electrographic seizures were recorded"] },
      mri: { v: "Not performed", e: ["No MRI was performed"] },
      feeding: { v: "NG and breast feeds", e: ["nasogastric and breast feeds"] },
      abnNeuro: { v: "No", e: ["Neurologically normal at discharge"] },
    },
    notes: [
      { role: "Obstetrics — antenatal clinic", date: "2026-04-13", type: "antenatal", text: "Preterm labour at 35+5. Normal fetal movements reported. Prolonged rupture of membranes beyond 18 hours with maternal pyrexia, recorded as a risk factor for sepsis. No pre-existing maternal comorbidities and no other medical history of note. Growth scans had been limited in this pregnancy." },
      { role: "Obstetrics — Dr Hannah Reid", date: "2026-04-13", type: "birth_summary", text: "Emergency caesarean at 35+5 for suspected chorioamnionitis. Liquor was clear and there was no sentinel event. Preterm baby clamped promptly and taken to NICU for CPAP and antibiotics." },
      { role: "Midwifery — Leah Morgan", date: "2026-04-13", type: "delivery", text: "Preterm delivery; baby handed to the neonatal team without delayed clamping due to prematurity and the need for respiratory support." },
      { role: "Neonatology — resuscitation record", date: "2026-04-13", type: "resuscitation", text: "Stabilised on CPAP. The baby was not intubated, no cardiac compressions were required and no resuscitation drugs were given." },
      { role: "Neonatology — newborn metabolic", date: "2026-04-15", type: "postnatal", text: "Preterm infant with episodes of hypoglycaemia in the first days requiring nasogastric feeds and monitoring." },
      { role: "Neonatology — Dr Priya Shah", date: "2026-04-13", type: "nicu_admission", text: "Admitted to NICU at 0.4 hours for prematurity and suspected sepsis. This was not an encephalopathy pathway, so therapeutic cooling was not indicated and no CFM was used." },
      { role: "Neurology — review note", date: "2026-04-20", type: "neurology_report", text: "No clinical seizures were noted and no electrographic seizures were recorded. No MRI was performed as there was no evidence of encephalopathy." },
      { role: "Neonatology — discharge summary", date: "2026-04-29", type: "discharge", text: "Discharged home on day 16 on nasogastric and breast feeds. Neurologically normal at discharge." },
    ],
  },

  CPH007: {
    code: "CPH007", baby: "cph-baby-007",
    gestWeeks: 39, gestDays: 0, maternalAge: 38, parity: 1,
    normalScans: "Yes", normalDopplers: "No", ctgDone: "Yes",
    delivery: "Vacuum", birthWeight: 3030, apgar1: 7, apgar5: 9, apgar10: 10,
    cordPh: 7.24, baseExcess: -5.6, lactate: null,
    ward: "Postnatal ward",
    gasRepeated: "No", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "No", ageDischargeHome: 2,
    unitQuestionnaire: "Yes", guidelineCordGas: "Yes", guidelineFetalAcidosis: "No",
    i: {
      fm: { v: "Reduced", e: ["Reduced fetal movements prompted review"] },
      mc: { v: "Pre-eclampsia", e: ["pre-eclampsia"] },
      mco: { v: "On labetalol", e: ["managed on labetalol"] },
      lm: { v: "Clear", e: ["Liquor was clear"] },
      chorio: { v: "No", e: ["no features of chorioamnionitis"] },
      prom: { v: "No", e: ["No prolonged rupture of membranes"] },
      rffs: { v: "No", e: ["no risk factors for sepsis"] },
      sentinel: { v: "None", e: ["no sentinel event"] },
      dcc: { v: "No", e: ["Cord clamped early to expedite assessment", "immediate cord clamping documented"] },
      intub: { v: "No", e: ["The baby was not intubated"] },
      compress: { v: "No", e: ["no cardiac compressions were required"] },
      drugs: { v: "None", e: ["no resuscitation drugs were given"] },
      hypo: { v: "No", e: ["with no hypoglycaemia"] },
    },
    notes: [
      { role: "Obstetrics — antenatal clinic", date: "2026-04-16", type: "antenatal", text: "Pregnancy complicated by pre-eclampsia, managed on labetalol. Reduced fetal movements prompted review. No prolonged rupture of membranes and no risk factors for sepsis." },
      { role: "Obstetrics — Dr Mark Alvarez", date: "2026-04-16", type: "birth_summary", text: "Vacuum delivery for fetal distress following reduced fetal movements. Liquor was clear with no features of chorioamnionitis and no sentinel event. Cord clamped early to expedite assessment; cord gas reassuring (pH 7.24)." },
      { role: "Midwifery — Leah Morgan", date: "2026-04-16", type: "delivery", text: "Ventouse birth. Baby assessed promptly by the team; immediate cord clamping documented." },
      { role: "Neonatology — resuscitation record", date: "2026-04-16", type: "resuscitation", text: "No resuscitation required. The baby was not intubated, no cardiac compressions were required and no resuscitation drugs were given." },
      { role: "Postnatal ward — newborn check", date: "2026-04-18", type: "postnatal", text: "Newborn check normal. Blood glucose within normal limits with no hypoglycaemia. Discharged home on day 2." },
    ],
  },

  CPH008: {
    code: "CPH008", baby: "cph-baby-008",
    gestWeeks: 40, gestDays: 3, maternalAge: 30, parity: 2,
    normalScans: "Yes", normalDopplers: "Yes", ctgDone: "No",
    delivery: "Spontaneous vaginal", birthWeight: 3520, apgar1: 9, apgar5: 10, apgar10: 10,
    cordPh: 7.31, baseExcess: -2.2, lactate: 2.4,
    ward: "Postnatal ward",
    gasRepeated: "No", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "No", ageDischargeHome: 1,
    unitQuestionnaire: "Yes", guidelineCordGas: "Yes", guidelineFetalAcidosis: "No",
    i: {
      fm: { v: "Normal", e: ["normal fetal movements throughout"] },
      mc: { v: "None", e: ["No maternal comorbidities"] },
      mco: { v: "None", e: ["no other medical history of note"] },
      lm: { v: "Clear", e: ["Liquor was clear"] },
      chorio: { v: "No", e: ["no features of chorioamnionitis"] },
      prom: { v: "No", e: ["No prolonged rupture of membranes"] },
      rffs: { v: "No", e: ["no risk factors for sepsis"] },
      sentinel: { v: "None", e: ["no sentinel event"] },
      dcc: { v: "Yes", e: ["the cord clamped after pulsation ceased", "Cord left intact until it stopped pulsating before clamping"] },
      intub: { v: "No", e: ["The baby was not intubated"] },
      compress: { v: "No", e: ["no cardiac compressions were required"] },
      drugs: { v: "None", e: ["no resuscitation drugs were given"] },
      hypo: { v: "No", e: ["with no hypoglycaemia"] },
    },
    notes: [
      { role: "Obstetrics — antenatal clinic", date: "2026-04-20", type: "antenatal", text: "Low-risk pregnancy with normal fetal movements throughout. No maternal comorbidities and no other medical history of note. No prolonged rupture of membranes and no risk factors for sepsis." },
      { role: "Obstetrics — Dr Hannah Reid", date: "2026-04-20", type: "birth_summary", text: "Uncomplicated water birth at 40+3. Liquor was clear with no features of chorioamnionitis and no sentinel event. Optimal cord management practised, with the cord clamped after pulsation ceased." },
      { role: "Midwifery — Leah Morgan", date: "2026-04-20", type: "delivery", text: "Physiological water birth. Cord left intact until it stopped pulsating before clamping. Apgars 9 and 10." },
      { role: "Neonatology — resuscitation record", date: "2026-04-20", type: "resuscitation", text: "No resuscitation required. The baby was not intubated, no cardiac compressions were required and no resuscitation drugs were given." },
      { role: "Postnatal ward — newborn check", date: "2026-04-21", type: "postnatal", text: "Newborn check normal. Blood glucose within normal limits with no hypoglycaemia. Discharged home on day 1." },
    ],
  },

  CPH009: {
    code: "CPH009", baby: "cph-baby-009",
    gestWeeks: 38, gestDays: 1, maternalAge: 36, parity: 1,
    normalScans: "Yes", normalDopplers: "No", ctgDone: "Yes",
    delivery: "Emergency caesarean", birthWeight: 3260, apgar1: 2, apgar5: 4, apgar10: 6,
    cordPh: 6.98, baseExcess: -18.7, lactate: 12.8,
    ward: "NICU",
    gasRepeated: "Yes", ageRepeatedGas: 1, repeatedLactate: 9.1, ageGasNormalised: "Not normalised",
    admittedNicu: "Yes", ageDischargeHome: null,
    unitQuestionnaire: "Yes", guidelineCordGas: "Yes", guidelineFetalAcidosis: "No",
    i: {
      fm: { v: "Reduced", e: ["Reduced fetal movements reported on the day of admission"] },
      mc: { v: "Previous caesarean section", e: ["previous lower-segment caesarean section"] },
      mco: { v: "One previous LSCS", e: ["one previous lower-segment caesarean section"] },
      lm: { v: "Meconium", e: ["Heavily meconium-stained liquor"] },
      chorio: { v: "No", e: ["no features of chorioamnionitis"] },
      prom: { v: "No", e: ["No prolonged rupture of membranes"] },
      rffs: { v: "No", e: ["no other risk factors for sepsis"] },
      sentinel: { v: "Uterine rupture", e: ["Emergency caesarean for uterine rupture"] },
      dcc: { v: "No", e: ["Baby clamped immediately for resuscitation", "no delayed cord clamping"] },
      intub: { v: "Yes", e: ["Baby intubated at delivery"] },
      compress: { v: "Yes", e: ["ongoing chest compressions"] },
      drugs: { v: "Adrenaline", e: ["repeated doses of adrenaline"] },
      hypo: { v: "Yes", e: ["Severe hypoglycaemia in the first hours"] },
    },
    n: {
      admitAge: 0.3, transferredOut: "Yes", durationDays: 7,
      cooled: { v: "Yes", e: ["Therapeutic cooling commenced"] },
      ageCooling: { v: "1.8", e: ["commenced at 1.8 hours"] },
      cfm: { v: "Conflict", e: ["Bedside CFM trace initially read as normal background", "records electrographic seizures", "contradicting the bedside CFM impression"], explanation: "The bedside CFM note read a normal background, but the formal neurology report records electrographic seizures — flagged as a conflict with the structured record." },
      seizures: { v: "Yes", e: ["records electrographic seizures"] },
      clinical: { v: "Yes", e: ["Clinical seizures were also observed"] },
      electro: { v: "Yes", e: ["records electrographic seizures"] },
      mri: { v: "Basal ganglia and thalamic injury", e: ["basal ganglia and thalamic injury on MRI"] },
      feeding: { v: "Nasogastric feeds", e: ["nasogastric feeds"] },
      abnNeuro: { v: "Yes", e: ["abnormal tone and reduced movements at transfer"] },
    },
    notes: [
      { role: "Obstetrics — antenatal clinic", date: "2026-04-23", type: "antenatal", text: "Vaginal birth after caesarean attempted with one previous lower-segment caesarean section. Reduced fetal movements reported on the day of admission. No prolonged rupture of membranes and no other risk factors for sepsis." },
      { role: "Obstetrics — Dr Mark Alvarez", date: "2026-04-23", type: "birth_summary", text: "Emergency caesarean for uterine rupture with severe metabolic acidosis. Heavily meconium-stained liquor was noted. There were no features of chorioamnionitis. Baby clamped immediately for resuscitation." },
      { role: "Midwifery — Leah Morgan", date: "2026-04-23", type: "delivery", text: "Crash caesarean. Baby passed to the neonatal team at once; no delayed cord clamping." },
      { role: "Neonatology — resuscitation record", date: "2026-04-23", type: "resuscitation", text: "Baby intubated at delivery with ongoing chest compressions and repeated doses of adrenaline before return of circulation." },
      { role: "Neonatology — newborn metabolic", date: "2026-04-24", type: "postnatal", text: "Severe hypoglycaemia in the first hours requiring intravenous dextrose, in the context of significant encephalopathy." },
      { role: "Neonatology — bedside note", date: "2026-04-23", type: "nicu_admission", text: "Admitted to NICU at 0.3 hours with severe encephalopathy. Therapeutic cooling commenced at 1.8 hours of age before transfer. Bedside CFM trace initially read as normal background during the first hours after admission." },
      { role: "Neurology — formal report", date: "2026-04-25", type: "neurology_report", text: "Formal neurology report records electrographic seizures and basal ganglia and thalamic injury on MRI, contradicting the bedside CFM impression of a normal background. Clinical seizures were also observed." },
      { role: "Neonatology — transfer summary", date: "2026-04-30", type: "discharge", text: "Transferred out to the regional cooling and neurology centre on day 7 for ongoing care, so was not discharged home from this unit. On nasogastric feeds with abnormal tone and reduced movements at transfer." },
    ],
  },
};

// ALL-sheet row order = every baby; this is also the contract's patient count.
const CORDPH_ROW_ORDER = ["CPH001", "CPH002", "CPH003", "CPH004", "CPH005", "CPH006", "CPH007", "CPH008", "CPH009"];
// NICU sheet has a row only for babies with Admitted to NICU = Yes.
const CORDPH_NICU_ROW_ORDER = ["CPH002", "CPH006", "CPH009"];

// The contract's "N patients match" must equal the ALL-sheet row count.
export const CORDPH_PATIENT_COUNT = CORDPH_ROW_ORDER.length;

// Sheet 1 — "ALL". Column order matches the template exactly, INCLUDING the
// blank spacer columns F/L/S/AC (empty header, empty non-clickable cells).
const CORDPH_ALL_COLUMNS = [
  { key: "patient", header: "Patient code", width: 12 },
  { key: "gestWeeks", header: "Gestation (weeks)", width: 14 },
  { key: "gestDays", header: "Gestation (days)", width: 12 },
  { key: "maternalAge", header: "Maternal age", width: 12 },
  { key: "parity", header: "Parity", width: 8 },
  { key: "_s1", header: "", width: 4 },
  { key: "foetalMovements", header: "Foetal movements", width: 16 },
  { key: "maternalComorbidities", header: "Maternal comorbidities", width: 22 },
  { key: "maternalComorbiditiesOther", header: "Maternal comorbidities Other", width: 24 },
  { key: "normalScans", header: "Normal scans", width: 12 },
  { key: "normalDopplers", header: "Normal dopplers", width: 14 },
  { key: "_s2", header: "", width: 4 },
  { key: "ctgDone", header: "CTG done", width: 10 },
  { key: "liquorMeconium", header: "Liquor- meconium", width: 16 },
  { key: "chorioamnionitis", header: "Chorioamnionitis", width: 16 },
  { key: "prom", header: "PROM (>18hours)", width: 16 },
  { key: "rffs", header: "RFFS", width: 8 },
  { key: "sentinelEvent", header: "Sentinel event", width: 18 },
  { key: "_s3", header: "", width: 4 },
  { key: "delivery", header: "Delivery", width: 20 },
  { key: "birthWeight", header: "Birth weight (grams)", width: 18 },
  { key: "apgar1", header: "Apgars 1", width: 10 },
  { key: "apgar5", header: "Apgars 5", width: 10 },
  { key: "apgar10", header: "Apgars 10", width: 10 },
  { key: "dcc", header: "Delayed cord clamping", width: 22 },
  { key: "ph", header: "Cord arterial pH", width: 16 },
  { key: "be", header: "Cord arterial BE", width: 16 },
  { key: "lactate", header: "Cord arterial lactate", width: 18 },
  { key: "_s4", header: "", width: 4 },
  { key: "intubated", header: "Intubated at delivery", width: 18 },
  { key: "compressions", header: "Cardiac compressions", width: 20 },
  { key: "drugs", header: "Drugs given", width: 16 },
  { key: "ward", header: "Ward", width: 14 },
  { key: "gasRepeated", header: "Gas repeated?", width: 12 },
  { key: "ageRepeatedGas", header: "Age at repeated gas (hours)", width: 22 },
  { key: "repeatedLactate", header: "Repeated lactate", width: 16 },
  { key: "ageGasNormalised", header: "Age gas normalised (hours)", width: 22 },
  { key: "hypoglycaemia", header: "Hypoglycaemia", width: 14 },
  { key: "admittedNicu", header: "Admitted to NICU", width: 16 },
  { key: "ageDischargeHome", header: "Age at discharge home (days)", width: 24 },
  { key: "unitQuestionnaire", header: "Unit level questionnaire filled ", width: 26 },
  { key: "guidelineCordGas", header: "Local guideline for cord gas sampling available", width: 34 },
  { key: "guidelineFetalAcidosis", header: "Local guideline for fetal acidosis available", width: 34 },
];

// Sheet 2 — "NICU". J is a blank spacer column.
const CORDPH_NICU_COLUMNS = [
  { key: "nnuAdmitAge", header: "Age (hours) at NNU admission", width: 22 },
  { key: "cooled", header: "Cooled", width: 10 },
  { key: "ageCooling", header: "Age at cooling (hours)", width: 20 },
  { key: "transferredOut", header: "Transferred out", width: 14 },
  { key: "cfm", header: "CFM", width: 14 },
  { key: "seizures", header: "Seizures", width: 12 },
  { key: "clinicalSeizures", header: "Clinical seizures", width: 16 },
  { key: "electrographicSeizure", header: "Electrographic seizure", width: 20 },
  { key: "mriInjury", header: "MRI injury", width: 24 },
  { key: "_sn", header: "", width: 4 },
  { key: "durationNicu", header: "Duration of admission in NICU (days)", width: 30 },
  { key: "ageDischargeHomeNicu", header: "Age at discharge home (days)", width: 24 },
  { key: "feeding", header: "Feeding on discharge", width: 20 },
  { key: "abnormalNeurology", header: "Abnormal neurology at discharge", width: 28 },
];

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
      r, ref, db, value: "Unavailable", noteTypes: ["birth_summary"], evidence: r.phEvidence,
      explanation: `From the obstetric birth-summary note for ${r.code} — the arterial cord sample clotted, so no valid cord gas was recorded.`,
    });
  }
  const sql = `SELECT PATIENT_CODE, Cord_arterial_pH, Cord_arterial_BE, Cord_arterial_lactate FROM cord_ph_birth_records WHERE PATIENT_CODE = '${r.code}'`;
  const value = colKey === "ph" ? r.cordPh
    : colKey === "be" ? r.baseExcess
    : (r.lactate == null ? "Not recorded" : r.lactate);
  const explanation = colKey === "lactate" && r.lactate == null
    ? `The cord-gas panel for ${r.code} did not include a lactate value.`
    : `From the EHR cord-gas panel for ${r.code} — umbilical artery pH, base excess and lactate.`;
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
  if (r.gasRepeated !== "Yes") {
    return cordDirect({
      code: r.code, ref, db, table: "repeated_gas", column, value: "N/A", resultValue: null,
      explanation: `No repeat cord gas was performed for ${r.code} — the initial gas did not warrant one — so ${label} is not recorded.`,
    });
  }
  if (value === "Not normalised") {
    return cordDirect({
      code: r.code, ref, db, table: "repeated_gas", column, value: "Not normalised", resultValue: null,
      explanation: `The cord lactate for ${r.code} had not normalised before transfer, so ${label} is not recorded.`,
    });
  }
  return cordDirect({
    code: r.code, ref, db, table: "repeated_gas", column, value,
    explanation: `From the repeat cord-gas record for ${r.code} — ${label}.`,
  });
}

// Build one populated cell for the ALL sheet.
function makeCordAllCell(colKey, { r, ref, db }) {
  const i = r.i;
  switch (colKey) {
    case "patient": {
      const sql = `SELECT PATIENT_CODE FROM patient_demographics WHERE PATIENT_CODE = '${r.code}'`;
      return {
        ref, value: r.code, sql,
        result: structuredResult(["PATIENT_CODE"], [[r.code]]),
        meta: { kind: "direct", database: db, sql, explanation: `The patient code identifying ${r.code} in the EHR.` },
      };
    }
    case "gestWeeks": return cordDirect({ code: r.code, ref, db, table: "cord_ph_birth_records", column: "Gestation_weeks", value: r.gestWeeks, explanation: `From the EHR birth record for ${r.code} — gestation in completed weeks.` });
    case "gestDays": return cordDirect({ code: r.code, ref, db, table: "cord_ph_birth_records", column: "Gestation_days", value: r.gestDays, explanation: `From the EHR birth record for ${r.code} — gestation days beyond completed weeks.` });
    case "maternalAge": return cordDirect({ code: r.code, ref, db, table: "patient_demographics", column: "Maternal_age", value: r.maternalAge, explanation: `From the EHR demographics for ${r.code} — maternal age at delivery.` });
    case "parity": return cordDirect({ code: r.code, ref, db, table: "patient_demographics", column: "Parity", value: r.parity, explanation: `From the EHR demographics for ${r.code} — maternal parity.` });

    case "foetalMovements": return cordInterp({ r, ref, db, value: i.fm.v, noteTypes: ["antenatal"], evidence: i.fm.e, explanation: `From the antenatal note for ${r.code} — reported fetal movements.` });
    case "maternalComorbidities": return cordInterp({ r, ref, db, value: i.mc.v, noteTypes: ["antenatal"], evidence: i.mc.e, explanation: `From the antenatal note for ${r.code} — documented maternal comorbidities.` });
    case "maternalComorbiditiesOther": return cordInterp({ r, ref, db, value: i.mco.v, noteTypes: ["antenatal"], evidence: i.mco.e, explanation: `From the antenatal note for ${r.code} — any other maternal history of note.` });

    case "normalScans": return cordDirect({ code: r.code, ref, db, table: "antenatal_scans", column: "Normal_scans", value: r.normalScans, explanation: `From the antenatal scan record for ${r.code} — whether growth scans were normal.` });
    case "normalDopplers": return cordDirect({ code: r.code, ref, db, table: "antenatal_scans", column: "Normal_dopplers", value: r.normalDopplers, explanation: `From the antenatal scan record for ${r.code} — whether umbilical artery dopplers were normal.` });

    case "ctgDone": return cordDirect({ code: r.code, ref, db, table: "ctg", column: "CTG_done", value: r.ctgDone, explanation: r.ctgDone === "Yes" ? `From the intrapartum record for ${r.code} — continuous CTG was performed.` : `From the intrapartum record for ${r.code} — labour monitored with intermittent auscultation; no continuous CTG performed.` });

    case "liquorMeconium": return cordInterp({ r, ref, db, value: i.lm.v, noteTypes: ["birth_summary"], evidence: i.lm.e, explanation: `From the birth-summary note for ${r.code} — the state of the liquor.` });
    case "chorioamnionitis": return cordInterp({ r, ref, db, value: i.chorio.v, noteTypes: ["birth_summary"], evidence: i.chorio.e, explanation: `From the birth-summary note for ${r.code} — any chorioamnionitis.` });
    case "prom": return cordInterp({ r, ref, db, value: i.prom.v, noteTypes: ["antenatal"], evidence: i.prom.e, explanation: `From the antenatal note for ${r.code} — prolonged rupture of membranes over 18 hours.` });
    case "rffs": return cordInterp({ r, ref, db, value: i.rffs.v, noteTypes: ["antenatal"], evidence: i.rffs.e, explanation: `From the antenatal note for ${r.code} — risk factors for sepsis.` });
    case "sentinelEvent": return cordInterp({ r, ref, db, value: i.sentinel.v, noteTypes: ["birth_summary"], evidence: i.sentinel.e, explanation: `From the birth-summary note for ${r.code} — any sentinel intrapartum event.` });

    case "delivery": return cordDirect({ code: r.code, ref, db, table: "cord_ph_birth_records", column: "Delivery", value: r.delivery, explanation: `From the EHR birth record for ${r.code} — mode of delivery.` });
    case "birthWeight": return cordDirect({ code: r.code, ref, db, table: "cord_ph_birth_records", column: "Birth_weight_grams", value: r.birthWeight, explanation: `From the EHR birth record for ${r.code} — birth weight in grams.` });
    case "apgar1": return cordDirect({ code: r.code, ref, db, table: "cord_ph_birth_records", column: "Apgars_1", value: r.apgar1, explanation: `From the EHR birth record for ${r.code} — Apgar score at one minute.` });
    case "apgar5": return cordDirect({ code: r.code, ref, db, table: "cord_ph_birth_records", column: "Apgars_5", value: r.apgar5, explanation: `From the EHR birth record for ${r.code} — Apgar score at five minutes.` });
    case "apgar10": return cordDirect({ code: r.code, ref, db, table: "cord_ph_birth_records", column: "Apgars_10", value: r.apgar10, explanation: `From the EHR birth record for ${r.code} — Apgar score at ten minutes.` });

    case "dcc": return cordInterp({
      r, ref, db, value: i.dcc.v, noteTypes: ["birth_summary", "delivery"], evidence: i.dcc.e,
      explanation: i.dcc.v === "Yes"
        ? `From the obstetric birth-summary and the midwife delivery note for ${r.code} — both record delayed cord clamping, so it is documented as performed.`
        : `From the obstetric birth-summary and the midwife delivery note for ${r.code} — both record the cord clamped early, so delayed clamping was not performed.`,
    });

    case "ph":
    case "be":
    case "lactate": return gasCell(colKey, { r, ref, db });

    case "intubated": return cordInterp({ r, ref, db, value: i.intub.v, noteTypes: ["resuscitation"], evidence: i.intub.e, explanation: `From the resuscitation record for ${r.code} — whether the baby was intubated at delivery.` });
    case "compressions": return cordInterp({ r, ref, db, value: i.compress.v, noteTypes: ["resuscitation"], evidence: i.compress.e, explanation: `From the resuscitation record for ${r.code} — whether cardiac compressions were given.` });
    case "drugs": return cordInterp({ r, ref, db, value: i.drugs.v, noteTypes: ["resuscitation"], evidence: i.drugs.e, explanation: `From the resuscitation record for ${r.code} — any resuscitation drugs given.` });

    case "ward": return cordDirect({ code: r.code, ref, db, table: "encounters", column: "Ward", value: r.ward, explanation: `From the EHR encounter for ${r.code} — the ward at the time of the audit.` });
    case "gasRepeated": return cordDirect({ code: r.code, ref, db, table: "repeated_gas", column: "Gas_repeated", value: r.gasRepeated, explanation: r.gasRepeated === "Yes" ? `A repeat cord/neonatal gas was performed for ${r.code}.` : `No repeat cord/neonatal gas was performed for ${r.code}.` });
    case "ageRepeatedGas": return repeatGasField({ r, ref, db, column: "Age_at_repeated_gas_hours", value: r.ageRepeatedGas, label: "the age in hours at the repeat gas" });
    case "repeatedLactate": return repeatGasField({ r, ref, db, column: "Repeated_lactate", value: r.repeatedLactate, label: "the repeat lactate" });
    case "ageGasNormalised": return repeatGasField({ r, ref, db, column: "Age_gas_normalised_hours", value: r.ageGasNormalised, label: "the age in hours at which the gas normalised" });

    case "hypoglycaemia": return cordInterp({ r, ref, db, value: i.hypo.v, noteTypes: ["postnatal"], evidence: i.hypo.e, explanation: `From the newborn metabolic note for ${r.code} — any hypoglycaemia.` });
    case "admittedNicu": return cordDirect({ code: r.code, ref, db, table: "nicu_admissions", column: "Admitted_to_NICU", value: r.admittedNicu, explanation: `From the NICU admissions table for ${r.code} — whether the baby was admitted to the neonatal unit.` });

    case "ageDischargeHome":
      if (r.ageDischargeHome == null) {
        return cordDirect({ code: r.code, ref, db, table: "discharges", column: "Age_at_discharge_home_days", value: "N/A (transferred)", resultValue: null, explanation: `${r.code} was transferred to the regional centre and not discharged home from this unit, so age at discharge home is not recorded here.` });
      }
      return cordDirect({ code: r.code, ref, db, table: "discharges", column: "Age_at_discharge_home_days", value: r.ageDischargeHome, explanation: `From the discharge record for ${r.code} — age in days at discharge home.` });

    case "unitQuestionnaire": return cordDirect({ code: r.code, ref, db, table: "audit_governance", column: "Unit_level_questionnaire_filled", value: r.unitQuestionnaire, explanation: `From the unit-level audit governance record — whether the unit-level questionnaire was filled.` });
    case "guidelineCordGas": return cordDirect({ code: r.code, ref, db, table: "audit_governance", column: "Local_guideline_cord_gas_sampling", value: r.guidelineCordGas, explanation: `From the unit-level audit governance record — whether a local guideline for cord gas sampling is available.` });
    case "guidelineFetalAcidosis": return cordDirect({ code: r.code, ref, db, table: "audit_governance", column: "Local_guideline_fetal_acidosis", value: r.guidelineFetalAcidosis, explanation: `From the unit-level audit governance record — whether a local guideline for fetal acidosis is available.` });

    default:
      return { ref, value: "" }; // blank spacer columns (F/L/S/AC)
  }
}

// Build one populated cell for the NICU sheet (NICU-admitted babies only).
function makeCordNicuCell(colKey, { r, ref, db }) {
  const n = r.n;
  switch (colKey) {
    case "nnuAdmitAge": return cordDirect({ code: r.code, ref, db, table: "nicu_admissions", column: "Age_at_NNU_admission_hours", value: n.admitAge, explanation: `From the NICU admission record for ${r.code} — age in hours at admission to the neonatal unit.` });
    case "cooled": return cordInterp({ r, ref, db, value: n.cooled.v, noteTypes: ["nicu_admission"], evidence: n.cooled.e, explanation: `From the NICU admission note for ${r.code} — whether therapeutic cooling was given.` });
    case "ageCooling": return cordInterp({ r, ref, db, value: n.ageCooling.v, noteTypes: ["nicu_admission"], evidence: n.ageCooling.e, explanation: n.ageCooling.v === "N/A" ? `From the NICU admission note for ${r.code} — therapeutic cooling was not indicated, so there is no age at cooling.` : `From the NICU admission note for ${r.code} — age in hours at which therapeutic cooling started.` });
    case "transferredOut": return cordDirect({ code: r.code, ref, db, table: "nicu_admissions", column: "Transferred_out", value: n.transferredOut, explanation: `From the NICU admission record for ${r.code} — whether the baby was transferred to another unit.` });
    case "cfm": return cordInterp({ r, ref, db, value: n.cfm.v, noteTypes: ["nicu_admission", "neurology_report"], evidence: n.cfm.e, explanation: n.cfm.explanation });
    case "seizures": return cordInterp({ r, ref, db, value: n.seizures.v, noteTypes: ["neurology_report"], evidence: n.seizures.e, explanation: `From the neurology report for ${r.code} — whether any seizures were recorded.` });
    case "clinicalSeizures": return cordInterp({ r, ref, db, value: n.clinical.v, noteTypes: ["neurology_report"], evidence: n.clinical.e, explanation: `From the neurology report for ${r.code} — whether clinical seizures were observed.` });
    case "electrographicSeizure": return cordInterp({ r, ref, db, value: n.electro.v, noteTypes: ["neurology_report"], evidence: n.electro.e, explanation: `From the neurology report for ${r.code} — whether electrographic seizures were recorded.` });
    case "mriInjury": return cordInterp({ r, ref, db, value: n.mri.v, noteTypes: ["neurology_report"], evidence: n.mri.e, explanation: `From the neurology report for ${r.code} — MRI findings of injury.` });
    case "durationNicu": return cordDirect({ code: r.code, ref, db, table: "nicu_admissions", column: "Duration_of_admission_days", value: n.durationDays, explanation: `From the NICU admission record for ${r.code} — duration of admission in days.` });
    case "ageDischargeHomeNicu":
      if (r.ageDischargeHome == null) {
        return cordDirect({ code: r.code, ref, db, table: "nicu_admissions", column: "Age_at_discharge_home_days", value: "N/A (transferred)", resultValue: null, explanation: `${r.code} was transferred to another unit and not discharged home from here, so age at discharge home is not recorded.` });
      }
      return cordDirect({ code: r.code, ref, db, table: "nicu_admissions", column: "Age_at_discharge_home_days", value: r.ageDischargeHome, explanation: `From the NICU discharge record for ${r.code} — age in days at discharge home.` });
    case "feeding": return cordInterp({ r, ref, db, value: n.feeding.v, noteTypes: ["discharge"], evidence: n.feeding.e, explanation: `From the NICU discharge summary for ${r.code} — feeding method at discharge.` });
    case "abnormalNeurology": return cordInterp({ r, ref, db, value: n.abnNeuro.v, noteTypes: ["discharge"], evidence: n.abnNeuro.e, explanation: `From the NICU discharge summary for ${r.code} — whether neurology was abnormal at discharge.` });

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
const CHESTPAIN_RECORDS = {
  CP001: {
    code: "CP001", age: 58, troponin: 320, ecg: "ST elevation, V2-V4", timeToEcg: 8,
    complaint: "Central crushing chest pain", diagnosis: "STEMI", decision: "Admit",
    complaintEvidence: ["central crushing chest pain radiating to the left arm"],
    ecgEvidence: ["ST elevation in V2-V4"],
    diagnosisEvidence: ["an anterior STEMI"],
    decisionEvidence: ["Admitted to the cardiac catheter lab for primary PCI"],
    notes: {
      triage: { role: "Emergency Nurse — Triage", date: "2026-05-04", type: "triage", text: "58-year-old man with 40 minutes of central crushing chest pain radiating to the left arm, associated with sweating and nausea." },
      cardiology: { role: "Cardiology — Dr Mark Alvarez", date: "2026-05-04", type: "cardiology", text: "ECG shows ST elevation in V2-V4 consistent with an anterior STEMI. Troponin markedly raised. Referred for primary PCI." },
      discharge: { role: "Emergency Medicine — Discharge", date: "2026-05-04", type: "discharge_summary", text: "Admitted to the cardiac catheter lab for primary PCI and transferred to the coronary care unit." },
    },
  },
  CP002: {
    code: "CP002", age: 47, troponin: 4, ecg: "Normal sinus rhythm", timeToEcg: 14,
    complaint: "Pleuritic left-sided chest pain", diagnosis: "Non-cardiac chest pain", decision: "Discharge",
    complaintEvidence: ["intermittent left-sided sharp chest pain, worse on inspiration"],
    ecgEvidence: ["normal sinus rhythm with no ischaemic changes"],
    diagnosisEvidence: ["a cardiac cause is unlikely"],
    decisionEvidence: ["Discharged home with safety-netting advice"],
    notes: {
      triage: { role: "Emergency Nurse — Triage", date: "2026-05-05", type: "triage", text: "47-year-old woman with intermittent left-sided sharp chest pain, worse on inspiration, with no radiation." },
      cardiology: { role: "Cardiology — Dr Sara Lin", date: "2026-05-05", type: "cardiology", text: "ECG normal sinus rhythm with no ischaemic changes. Serial troponin negative. Pain reproducible on palpation, so a cardiac cause is unlikely." },
      discharge: { role: "Emergency Medicine — Discharge", date: "2026-05-05", type: "discharge_summary", text: "Discharged home with safety-netting advice and GP follow-up." },
    },
  },
  CP003: {
    code: "CP003", age: 63, troponin: 95, ecg: "T-wave inversion, inferior", timeToEcg: 11,
    complaint: "Chest pain radiating to jaw", diagnosis: "NSTEMI", decision: "Admit",
    complaintEvidence: ["heavy chest pain at rest, radiating to the jaw"],
    ecgEvidence: ["T-wave inversion in the inferior leads"],
    diagnosisEvidence: ["in keeping with an NSTEMI"],
    decisionEvidence: ["Admitted under cardiology"],
    notes: {
      triage: { role: "Emergency Nurse — Triage", date: "2026-05-07", type: "triage", text: "63-year-old man with two hours of heavy chest pain at rest, radiating to the jaw, with associated breathlessness." },
      cardiology: { role: "Cardiology — Dr Mark Alvarez", date: "2026-05-07", type: "cardiology", text: "ECG shows T-wave inversion in the inferior leads. Troponin rise on serial testing in keeping with an NSTEMI. For antiplatelet therapy." },
      discharge: { role: "Emergency Medicine — Discharge", date: "2026-05-07", type: "discharge_summary", text: "Admitted under cardiology for an NSTEMI with planned inpatient angiography." },
    },
  },
  CP004: {
    code: "CP004", age: 72, troponin: null, troponinMissing: true, ecg: "AF, rapid ventricular response", timeToEcg: 19,
    complaint: "Breathlessness and chest tightness", diagnosis: "Fast AF, ?ACS", decision: "Admit",
    complaintEvidence: ["breathlessness and chest tightness"],
    troponinEvidence: ["haemolysed in transit and the troponin could not be reported"],
    ecgEvidence: ["atrial fibrillation with a rapid ventricular response"],
    diagnosisEvidence: ["acute coronary syndrome is not excluded"],
    decisionEvidence: ["Admitted to the medical assessment unit"],
    notes: {
      triage: { role: "Emergency Nurse — Triage", date: "2026-05-09", type: "triage", text: "72-year-old woman with breathlessness and chest tightness and an irregularly irregular pulse." },
      lab: { role: "Laboratory — Biochemistry", date: "2026-05-09", type: "lab", text: "The blood sample haemolysed in transit and the troponin could not be reported. A repeat sample has been requested." },
      cardiology: { role: "Cardiology — Dr Sara Lin", date: "2026-05-09", type: "cardiology", text: "ECG shows atrial fibrillation with a rapid ventricular response. Rate control commenced; acute coronary syndrome is not excluded pending a repeat troponin." },
      discharge: { role: "Emergency Medicine — Discharge", date: "2026-05-09", type: "discharge_summary", text: "Admitted to the medical assessment unit for rate control and a repeat troponin." },
    },
  },
  CP005: {
    code: "CP005", age: 35, troponin: 6, ecg: null, ecgMissing: true, timeToEcg: null,
    complaint: "Musculoskeletal-type chest pain", diagnosis: "Musculoskeletal chest pain", decision: "Discharge",
    complaintEvidence: ["sharp left chest pain after a gym session"],
    diagnosisEvidence: ["likely musculoskeletal chest pain"],
    decisionEvidence: ["Discharged with simple analgesia"],
    notes: {
      triage: { role: "Emergency Nurse — Triage", date: "2026-05-10", type: "triage", text: "35-year-old man with sharp left chest pain after a gym session, reproducible on movement." },
      cardiology: { role: "Cardiology — Dr Sara Lin", date: "2026-05-10", type: "cardiology", text: "Low clinical suspicion of a cardiac cause and troponin negative. The patient self-discharged before an ECG could be recorded." },
      discharge: { role: "Emergency Medicine — Discharge", date: "2026-05-10", type: "discharge_summary", text: "Discharged with simple analgesia for likely musculoskeletal chest pain." },
    },
  },
  CP006: {
    code: "CP006", age: 55, troponin: 12, ecg: "Normal sinus rhythm", timeToEcg: 22,
    complaint: "Exertional chest tightness", diagnosis: "Stable angina", decision: "Admit",
    complaintEvidence: ["chest tightness on exertion over the past week"],
    ecgEvidence: ["Resting ECG normal sinus rhythm"],
    diagnosisEvidence: ["suggestive of stable angina"],
    decisionEvidence: ["Admitted to the observation unit"],
    notes: {
      triage: { role: "Emergency Nurse — Triage", date: "2026-05-12", type: "triage", text: "55-year-old man with chest tightness on exertion over the past week, relieved by rest." },
      cardiology: { role: "Cardiology — Dr Mark Alvarez", date: "2026-05-12", type: "cardiology", text: "Resting ECG normal sinus rhythm. Troponin at the upper reference limit without dynamic change. History suggestive of stable angina." },
      discharge: { role: "Emergency Medicine — Discharge", date: "2026-05-12", type: "discharge_summary", text: "Admitted to the observation unit for serial troponin and an exercise tolerance test." },
    },
  },
  CP007: {
    code: "CP007", age: 68, troponin: 210, ecg: "ST depression, lateral", timeToEcg: 9,
    complaint: "Epigastric and central chest pain", diagnosis: "NSTEMI", decision: "Admit",
    complaintEvidence: ["epigastric and central chest pain with vomiting"],
    ecgEvidence: ["ST depression in the lateral leads"],
    diagnosisEvidence: ["consistent with an NSTEMI"],
    decisionEvidence: ["Admitted under cardiology"],
    notes: {
      triage: { role: "Emergency Nurse — Triage", date: "2026-05-14", type: "triage", text: "68-year-old woman with epigastric and central chest pain with vomiting." },
      cardiology: { role: "Cardiology — Dr Sara Lin", date: "2026-05-14", type: "cardiology", text: "ECG shows ST depression in the lateral leads. Troponin significantly elevated, consistent with an NSTEMI. Dual antiplatelet therapy started." },
      discharge: { role: "Emergency Medicine — Discharge", date: "2026-05-14", type: "discharge_summary", text: "Admitted under cardiology for an NSTEMI and inpatient angiography." },
    },
  },
  CP008: {
    code: "CP008", age: 41, troponin: 3, ecg: "Normal", timeToEcg: 16,
    complaint: "Chest pain after lifting", diagnosis: "Non-cardiac chest pain", decision: "Discharge",
    complaintEvidence: ["sharp, fleeting chest pain following heavy lifting"],
    ecgEvidence: ["ECG normal with no acute changes"],
    diagnosisEvidence: ["No features of an acute coronary syndrome"],
    decisionEvidence: ["Discharged home with reassurance"],
    notes: {
      triage: { role: "Emergency Nurse — Triage", date: "2026-05-16", type: "triage", text: "41-year-old man with sharp, fleeting chest pain following heavy lifting." },
      cardiology: { role: "Cardiology — Dr Mark Alvarez", date: "2026-05-16", type: "cardiology", text: "ECG normal with no acute changes. Troponin negative on serial testing. No features of an acute coronary syndrome." },
      discharge: { role: "Emergency Medicine — Discharge", date: "2026-05-16", type: "discharge_summary", text: "Discharged home with reassurance and advice to return if symptoms recur." },
    },
  },
};

const CHESTPAIN_ROW_ORDER = ["CP001", "CP002", "CP003", "CP004", "CP005", "CP006", "CP007", "CP008"];

const CHESTPAIN_COLUMNS = [
  { key: "patient", header: "Patient", width: 10 },
  { key: "age", header: "Age", width: 8 },
  { key: "complaint", header: "Presenting complaint", width: 26 },
  { key: "troponin", header: "Troponin (ng/L)", width: 16 },
  { key: "ecg", header: "ECG findings", width: 24 },
  { key: "timeToEcg", header: "Time to ECG (min)", width: 18 },
  { key: "diagnosis", header: "Diagnosis", width: 22 },
  { key: "decision", header: "Discharge/Admit decision", width: 24 },
];

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
        meta: { kind: "direct", database: db, sql, explanation: `From the EHR encounter record for ${r.code} — age at attendance.` },
      };
    }

    case "complaint": {
      const sql = notesSql("= 'triage'");
      return {
        ref, value: r.complaint, sql,
        result: noteResult([r.notes.triage]),
        meta: { kind: "interpretive", database: db, sql, evidence: r.complaintEvidence, explanation: `From the triage note for ${r.code} — the presenting complaint recorded at triage.` },
      };
    }

    case "troponin": {
      // CP004 — sample haemolysed, no result. "Unavailable" backed by the lab note.
      if (r.troponinMissing) {
        const sql = notesSql("= 'lab'");
        return {
          ref, value: "Unavailable", sql,
          result: noteResult([r.notes.lab]),
          meta: { kind: "interpretive", database: db, sql, evidence: r.troponinEvidence, explanation: `From the laboratory note for ${r.code} — the blood sample haemolysed, so no troponin result is available.` },
        };
      }
      const sql = `SELECT PATIENT_CODE, Troponin_ng_L FROM troponin WHERE PATIENT_CODE = '${r.code}'`;
      return {
        ref, value: r.troponin, sql,
        result: structuredResult(["PATIENT_CODE", "Troponin_ng_L"], [[r.code, r.troponin]]),
        meta: { kind: "direct", database: db, sql, explanation: `From the EHR troponin result for ${r.code} — first high-sensitivity troponin in ng/L.` },
      };
    }

    case "ecg": {
      // CP005 — no ECG recorded. Empty but clickable, backed by an empty lookup.
      if (r.ecgMissing) {
        const sql = `SELECT PATIENT_CODE, ECG_rhythm, ST_changes FROM ecg_results WHERE PATIENT_CODE = '${r.code}'`;
        return {
          ref, value: "", sql,
          result: structuredResult(["PATIENT_CODE", "ECG_rhythm", "ST_changes"], []),
          meta: { kind: "direct", database: db, sql, explanation: "No ECG was performed during this attendance, so no findings are recorded." },
        };
      }
      const sql = notesSql("= 'cardiology'");
      return {
        ref, value: r.ecg, sql,
        result: noteResult([r.notes.cardiology]),
        meta: { kind: "interpretive", database: db, sql, evidence: r.ecgEvidence, explanation: `From the cardiology note for ${r.code} — the documented ECG findings.` },
      };
    }

    case "timeToEcg": {
      if (r.ecgMissing) {
        const sql = `SELECT PATIENT_CODE, Time_to_ECG_min FROM ecg_results WHERE PATIENT_CODE = '${r.code}'`;
        return {
          ref, value: "", sql,
          result: structuredResult(["PATIENT_CODE", "Time_to_ECG_min"], []),
          meta: { kind: "direct", database: db, sql, explanation: "No ECG was performed during this attendance, so there is no time to first ECG." },
        };
      }
      const sql = `SELECT PATIENT_CODE, Time_to_ECG_min FROM ecg_results WHERE PATIENT_CODE = '${r.code}'`;
      return {
        ref, value: r.timeToEcg, sql,
        result: structuredResult(["PATIENT_CODE", "Time_to_ECG_min"], [[r.code, r.timeToEcg]]),
        meta: { kind: "direct", database: db, sql, explanation: `From the EHR ECG record for ${r.code} — minutes from arrival to first ECG.` },
      };
    }

    case "diagnosis": {
      const sql = notesSql("IN ('cardiology','discharge_summary')");
      const notes = [r.notes.cardiology, r.notes.discharge].filter(Boolean);
      return {
        ref, value: r.diagnosis, sql,
        result: noteResult(notes),
        meta: { kind: "interpretive", database: db, sql, evidence: r.diagnosisEvidence, explanation: `From the cardiology and discharge-summary notes for ${r.code} — the working diagnosis on review.` },
      };
    }

    case "decision": {
      const sql = notesSql("= 'discharge_summary'");
      return {
        ref, value: r.decision, sql,
        result: noteResult([r.notes.discharge]),
        meta: { kind: "interpretive", database: db, sql, evidence: r.decisionEvidence, explanation: `From the discharge-summary note for ${r.code} — the discharge or admit decision.` },
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

const NPDA_RECORDS = {
  NPD001: {
    code: "NPD001", patient: "npda-patient-001",
    dob: "2012-06-12", sex: "Female", ethnicity: "White British",
    diabetesType: "Type 1", diagnosisDate: "2020-09-03",
    visitDate: "2025-11-04", height: 152, weight: 45.0, hba1c: 52,
    systolic: 108, diastolic: 66, cholesterol: 4.1, acr: 0.8,
    footDate: "2025-11-04", retinalDate: "2025-10-20", retinalResult: "No retinopathy",
    psychScreen: "2025-11-04", carbDate: "2021-01-15",
    i: {
      insulin: { v: "Insulin pump (CSII)", e: ["Managed on an insulin pump (CSII)"] },
      cgm: { v: "Yes", e: ["using a continuous glucose monitor"] },
      lifestyle: { v: "Yes", e: ["Lifestyle and dietary modification was recommended"] },
      dietitian: { v: "Yes", e: ["additional appointment with the paediatric dietitian was offered"] },
      psych: { v: "No", e: ["No additional psychological support was required"] },
      smoking: { v: "No", e: ["does not smoke or vape"] },
    },
    notes: [
      { role: "Paediatric Diabetes — Dr Naomi Clarke", date: "2025-11-04", type: "diabetes_clinic", text: "Reviewed in the paediatric diabetes clinic. Managed on an insulin pump (CSII) and is using a continuous glucose monitor. Lifestyle and dietary modification was recommended to help reduce blood glucose levels. An additional appointment with the paediatric dietitian was offered." },
      { role: "Clinical Psychology — Dr Owen Pratt", date: "2025-11-04", type: "psychology", text: "Annual psychological screening completed. No additional psychological support was required beyond routine care." },
      { role: "Paediatric Diabetes — annual review", date: "2025-11-04", type: "annual_review", text: "Annual review completed. The young person does not smoke or vape." },
    ],
  },

  NPD002: {
    code: "NPD002", patient: "npda-patient-002",
    dob: "2011-02-25", sex: "Male", ethnicity: "White British",
    diabetesType: "Type 1", diagnosisDate: "2019-05-18",
    visitDate: "2025-12-09", height: 168, weight: 60.2, hba1c: 74,
    systolic: 118, diastolic: 72, cholesterol: 4.6, acr: 1.4,
    footDate: "2025-12-09", retinalDate: "2025-09-30", retinalResult: "Background retinopathy",
    psychScreen: "2025-12-09", carbDate: "2020-02-10",
    i: {
      insulin: { v: "MDI (basal-bolus)", e: ["multiple daily injection (MDI) basal-bolus regime"] },
      cgm: { v: "Yes", e: ["using a continuous glucose monitor"] },
      lifestyle: { v: "Yes", e: ["Lifestyle and dietary modification was recommended"] },
      dietitian: { v: "Yes", e: ["additional appointment with the paediatric dietitian was offered"] },
      psych: { v: "Yes", e: ["Additional psychological support outside routine care was recommended"] },
      smoking: { v: "No", e: ["does not smoke or vape"] },
    },
    notes: [
      { role: "Paediatric Diabetes — Dr Naomi Clarke", date: "2025-12-09", type: "diabetes_clinic", text: "Reviewed in clinic with HbA1c above target. Managed on a multiple daily injection (MDI) basal-bolus regime and is using a continuous glucose monitor. Lifestyle and dietary modification was recommended to help reduce blood glucose levels. An additional appointment with the paediatric dietitian was offered." },
      { role: "Clinical Psychology — Dr Owen Pratt", date: "2025-12-09", type: "psychology", text: "Annual psychological screening completed. The young person is finding adherence difficult. Additional psychological support outside routine care was recommended." },
      { role: "Paediatric Diabetes — annual review", date: "2025-12-09", type: "annual_review", text: "Annual review completed. The young person does not smoke or vape." },
    ],
  },

  NPD003: {
    code: "NPD003", patient: "npda-patient-003",
    dob: "2019-08-30", sex: "Female", ethnicity: "Asian — Pakistani",
    diabetesType: "Type 1", diagnosisDate: "2026-01-22",
    visitDate: "2026-02-19", height: 118, weight: 21.0, hba1c: 81,
    systolic: 100, diastolic: 60, cholesterol: 4.0, acr: 0.6,
    footDate: null, retinalDate: null, retinalResult: null,
    psychScreen: "2026-02-19", carbDate: "2026-02-05",
    admission: true,
    i: {
      insulin: { v: "MDI (basal-bolus)", e: ["multiple daily injection (MDI) basal-bolus regime"] },
      cgm: { v: "Yes", e: ["using a continuous glucose monitor"] },
      lifestyle: { v: "Yes", e: ["Lifestyle and dietary modification was recommended"] },
      dietitian: { v: "Yes", e: ["additional appointment with the paediatric dietitian was offered"] },
      psych: { v: "No", e: ["No additional psychological support was required"] },
      smoking: { v: "No", e: ["does not smoke or vape"] },
      admission: { v: "DKA (new diagnosis)", e: ["diabetic ketoacidosis (DKA) at the time of new diagnosis"] },
    },
    notes: [
      { role: "Paediatric Diabetes — Dr Naomi Clarke", date: "2026-02-19", type: "diabetes_clinic", text: "First clinic review after a new diagnosis. Managed on a multiple daily injection (MDI) basal-bolus regime and is using a continuous glucose monitor. Lifestyle and dietary modification was recommended to help reduce blood glucose levels. An additional appointment with the paediatric dietitian was offered." },
      { role: "Clinical Psychology — Dr Owen Pratt", date: "2026-02-19", type: "psychology", text: "Psychological screening completed at first review. No additional psychological support was required beyond routine care." },
      { role: "Paediatric Diabetes — annual review", date: "2026-02-19", type: "annual_review", text: "Review completed. The child does not smoke or vape." },
      { role: "Paediatrics — admission", date: "2026-01-22", type: "admission", text: "Admitted at presentation in diabetic ketoacidosis (DKA) at the time of new diagnosis. Treated on the DKA pathway with intravenous insulin and fluids, with good recovery." },
    ],
  },

  NPD004: {
    code: "NPD004", patient: "npda-patient-004",
    dob: "2013-11-10", sex: "Male", ethnicity: "Black African",
    diabetesType: "Type 1", diagnosisDate: "2023-07-12",
    visitDate: "2025-10-28", height: 148, weight: 38.5, hba1c: 58,
    systolic: 104, diastolic: 64, cholesterol: 4.2, acr: 0.9,
    footDate: "2025-10-28", retinalDate: "2025-08-14", retinalResult: "No retinopathy",
    psychScreen: "2025-10-28", carbDate: "2023-09-01",
    i: {
      insulin: { v: "Insulin pump (CSII)", e: ["Managed on an insulin pump (CSII)"] },
      cgm: { v: "Yes", e: ["using a continuous glucose monitor"] },
      lifestyle: { v: "Yes", e: ["Lifestyle and dietary modification was recommended"] },
      dietitian: { v: "No", e: ["No additional dietitian appointment was required"] },
      psych: { v: "No", e: ["No additional psychological support was required"] },
      smoking: { v: "No", e: ["does not smoke or vape"] },
    },
    notes: [
      { role: "Paediatric Diabetes — Dr Naomi Clarke", date: "2025-10-28", type: "diabetes_clinic", text: "Reviewed in clinic with good control. Managed on an insulin pump (CSII) and is using a continuous glucose monitor. Lifestyle and dietary modification was recommended to help reduce blood glucose levels. No additional dietitian appointment was required at this visit." },
      { role: "Clinical Psychology — Dr Owen Pratt", date: "2025-10-28", type: "psychology", text: "Annual psychological screening completed. No additional psychological support was required beyond routine care." },
      { role: "Paediatric Diabetes — annual review", date: "2025-10-28", type: "annual_review", text: "Annual review completed. The child does not smoke or vape." },
    ],
  },

  NPD005: {
    code: "NPD005", patient: "npda-patient-005",
    dob: "2009-03-19", sex: "Female", ethnicity: "White British",
    diabetesType: "Type 1", diagnosisDate: "2014-04-22",
    visitDate: "2025-11-25", height: 165, weight: 58.0, hba1c: 86,
    systolic: 122, diastolic: 76, cholesterol: 5.1, acr: 2.1,
    footDate: "2025-11-25", retinalDate: "2025-07-10", retinalResult: "Background retinopathy",
    psychScreen: "2025-11-25", carbDate: "2015-06-01",
    i: {
      insulin: { v: "MDI (basal-bolus)", e: ["multiple daily injection (MDI) basal-bolus regime"] },
      cgm: { v: "No", e: ["not currently using a continuous glucose monitor"] },
      lifestyle: { v: "Yes", e: ["Lifestyle and dietary modification was recommended"] },
      dietitian: { v: "Yes", e: ["additional appointment with the paediatric dietitian was offered"] },
      psych: { v: "Yes", e: ["Additional psychological support outside routine care was recommended"] },
      smoking: { v: "Smokes", e: ["currently smokes"] },
    },
    notes: [
      { role: "Paediatric Diabetes — Dr Naomi Clarke", date: "2025-11-25", type: "diabetes_clinic", text: "Reviewed in clinic; control remains a concern. Managed on a multiple daily injection (MDI) basal-bolus regime and is not currently using a continuous glucose monitor. Lifestyle and dietary modification was recommended to help reduce blood glucose levels. An additional appointment with the paediatric dietitian was offered." },
      { role: "Clinical Psychology — Dr Owen Pratt", date: "2025-11-25", type: "psychology", text: "Annual psychological screening completed. Additional psychological support outside routine care was recommended given low mood and diabetes distress." },
      { role: "Paediatric Diabetes — annual review", date: "2025-11-25", type: "annual_review", text: "Annual review completed. The young person currently smokes; smoking cessation advice was offered." },
    ],
  },

  NPD006: {
    code: "NPD006", patient: "npda-patient-006",
    dob: "2013-09-05", sex: "Male", ethnicity: "Mixed — White and Black Caribbean",
    diabetesType: "Type 1", diagnosisDate: "2021-11-30",
    visitDate: "2025-12-16", height: 152, weight: 44.0, hba1c: 92,
    systolic: 114, diastolic: 70, cholesterol: 4.8, acr: 1.8,
    footDate: "2025-12-16", retinalDate: "2025-09-02", retinalResult: "No retinopathy",
    psychScreen: "2025-12-16", carbDate: "2022-01-20",
    admission: true,
    i: {
      insulin: { v: "MDI (basal-bolus)", e: ["multiple daily injection (MDI) basal-bolus regime"] },
      cgm: { v: "No", e: ["not currently using a continuous glucose monitor"] },
      lifestyle: { v: "Yes", e: ["Lifestyle and dietary modification was recommended"] },
      dietitian: { v: "Yes", e: ["additional appointment with the paediatric dietitian was offered"] },
      psych: { v: "Yes", e: ["Additional psychological support outside routine care was recommended"] },
      smoking: { v: "No", e: ["does not smoke or vape"] },
      admission: { v: "DKA", e: ["diabetic ketoacidosis (DKA) following an intercurrent illness"] },
    },
    notes: [
      { role: "Paediatric Diabetes — Dr Naomi Clarke", date: "2025-12-16", type: "diabetes_clinic", text: "Reviewed in clinic after a recent admission. Managed on a multiple daily injection (MDI) basal-bolus regime and is not currently using a continuous glucose monitor. Lifestyle and dietary modification was recommended to help reduce blood glucose levels. An additional appointment with the paediatric dietitian was offered." },
      { role: "Clinical Psychology — Dr Owen Pratt", date: "2025-12-16", type: "psychology", text: "Annual psychological screening completed. Additional psychological support outside routine care was recommended to support self-management." },
      { role: "Paediatric Diabetes — annual review", date: "2025-12-16", type: "annual_review", text: "Annual review completed. The child does not smoke or vape." },
      { role: "Paediatrics — admission", date: "2025-08-07", type: "admission", text: "Emergency admission with diabetic ketoacidosis (DKA) following an intercurrent illness. Managed on the DKA pathway and discharged with sick-day rules reinforced." },
    ],
  },

  NPD007: {
    code: "NPD007", patient: "npda-patient-007",
    dob: "2021-12-01", sex: "Male", ethnicity: "White British",
    diabetesType: "Type 1", diagnosisDate: "2025-09-14",
    visitDate: "2025-11-18", height: 104, weight: 16.5, hba1c: 64,
    systolic: 96, diastolic: 58, cholesterol: 3.9, acr: null,
    footDate: null, retinalDate: null, retinalResult: null,
    psychScreen: "2025-11-18", carbDate: "2025-10-01",
    i: {
      insulin: { v: "Insulin pump (CSII)", e: ["Managed on an insulin pump (CSII)"] },
      cgm: { v: "Yes", e: ["using a continuous glucose monitor"] },
      lifestyle: { v: "Yes", e: ["Lifestyle and dietary modification was recommended"] },
      dietitian: { v: "Yes", e: ["additional appointment with the paediatric dietitian was offered"] },
      psych: { v: "No", e: ["No additional psychological support was required"] },
      smoking: { v: "No", e: ["does not smoke or vape"] },
    },
    notes: [
      { role: "Paediatric Diabetes — Dr Naomi Clarke", date: "2025-11-18", type: "diabetes_clinic", text: "Early review of a young child after diagnosis. Managed on an insulin pump (CSII) and is using a continuous glucose monitor. Lifestyle and dietary modification was recommended to the family to help reduce blood glucose levels. An additional appointment with the paediatric dietitian was offered." },
      { role: "Clinical Psychology — Dr Owen Pratt", date: "2025-11-18", type: "psychology", text: "Psychological screening completed with the family. No additional psychological support was required beyond routine care." },
      { role: "Paediatric Diabetes — annual review", date: "2025-11-18", type: "annual_review", text: "Review completed. The child does not smoke or vape." },
    ],
  },

  NPD008: {
    code: "NPD008", patient: "npda-patient-008",
    dob: "2010-07-22", sex: "Male", ethnicity: "White British",
    diabetesType: "Type 1", diagnosisDate: "2018-03-15",
    visitDate: "2025-12-02", height: 172, weight: 63.5, hba1c: 70,
    systolic: 120, diastolic: 74, cholesterol: 4.7, acr: 1.1,
    footDate: "2025-12-02", retinalDate: "2025-08-28", retinalResult: "No retinopathy",
    psychScreen: "2025-12-02", carbDate: "2018-09-01",
    i: {
      insulin: { v: "Insulin pump (CSII)", e: ["Managed on an insulin pump (CSII)"] },
      cgm: { v: "Yes", e: ["using a continuous glucose monitor"] },
      lifestyle: { v: "Yes", e: ["Lifestyle and dietary modification was recommended"] },
      dietitian: { v: "Yes", e: ["additional appointment with the paediatric dietitian was offered"] },
      psych: { v: "No", e: ["No additional psychological support was required"] },
      smoking: { v: "Vapes", e: ["vapes regularly"] },
    },
    notes: [
      { role: "Paediatric Diabetes — Dr Naomi Clarke", date: "2025-12-02", type: "diabetes_clinic", text: "Reviewed in clinic. Managed on an insulin pump (CSII) and is using a continuous glucose monitor. Lifestyle and dietary modification was recommended to help reduce blood glucose levels. An additional appointment with the paediatric dietitian was offered." },
      { role: "Clinical Psychology — Dr Owen Pratt", date: "2025-12-02", type: "psychology", text: "Annual psychological screening completed. No additional psychological support was required beyond routine care." },
      { role: "Paediatric Diabetes — annual review", date: "2025-12-02", type: "annual_review", text: "Annual review completed. The young person vapes regularly; cessation advice was offered." },
    ],
  },

  NPD009: {
    code: "NPD009", patient: "npda-patient-009",
    dob: "2017-05-14", sex: "Female", ethnicity: "Asian — Indian",
    diabetesType: "Type 1", diagnosisDate: "2024-02-08",
    visitDate: "2025-11-11", height: 128, weight: 26.0, hba1c: 60,
    systolic: 100, diastolic: 62, cholesterol: 4.0, acr: 0.7,
    footDate: null, retinalDate: null, retinalResult: null,
    psychScreen: "2025-11-11", carbDate: "2024-04-01",
    i: {
      insulin: { v: "MDI (basal-bolus)", e: ["multiple daily injection (MDI) basal-bolus regime"] },
      cgm: { v: "Yes", e: ["using a continuous glucose monitor"] },
      lifestyle: { v: "Yes", e: ["Lifestyle and dietary modification was recommended"] },
      dietitian: { v: "No", e: ["No additional dietitian appointment was required"] },
      psych: { v: "No", e: ["No additional psychological support was required"] },
      smoking: { v: "No", e: ["does not smoke or vape"] },
    },
    notes: [
      { role: "Paediatric Diabetes — Dr Naomi Clarke", date: "2025-11-11", type: "diabetes_clinic", text: "Reviewed in clinic with stable control. Managed on a multiple daily injection (MDI) basal-bolus regime and is using a continuous glucose monitor. Lifestyle and dietary modification was recommended to help reduce blood glucose levels. No additional dietitian appointment was required at this visit." },
      { role: "Clinical Psychology — Dr Owen Pratt", date: "2025-11-11", type: "psychology", text: "Annual psychological screening completed. No additional psychological support was required beyond routine care." },
      { role: "Paediatric Diabetes — annual review", date: "2025-11-11", type: "annual_review", text: "Annual review completed. The child does not smoke or vape." },
    ],
  },

  NPD010: {
    code: "NPD010", patient: "npda-patient-010",
    dob: "2012-10-08", sex: "Female", ethnicity: "White — Other",
    diabetesType: "Type 1", diagnosisDate: "2020-06-25",
    visitDate: "2025-10-21", height: 156, weight: 47.0, hba1c: 68,
    systolic: 110, diastolic: 68, cholesterol: 4.4, acr: null,
    footDate: "2025-10-21", retinalDate: "2025-09-16", retinalResult: "No retinopathy",
    psychScreen: "2025-10-21", carbDate: "2020-09-10",
    i: {
      insulin: { v: "MDI (basal-bolus)", e: ["multiple daily injection (MDI) basal-bolus regime"] },
      cgm: { v: "Yes", e: ["using a continuous glucose monitor"] },
      lifestyle: { v: "Yes", e: ["Lifestyle and dietary modification was recommended"] },
      dietitian: { v: "Yes", e: ["additional appointment with the paediatric dietitian was offered"] },
      psych: { v: "No", e: ["No additional psychological support was required"] },
      smoking: { v: "No", e: ["does not smoke or vape"] },
    },
    notes: [
      { role: "Paediatric Diabetes — Dr Naomi Clarke", date: "2025-10-21", type: "diabetes_clinic", text: "Reviewed in clinic. Managed on a multiple daily injection (MDI) basal-bolus regime and is using a continuous glucose monitor. Lifestyle and dietary modification was recommended to help reduce blood glucose levels. An additional appointment with the paediatric dietitian was offered." },
      { role: "Clinical Psychology — Dr Owen Pratt", date: "2025-10-21", type: "psychology", text: "Annual psychological screening completed. No additional psychological support was required beyond routine care." },
      { role: "Paediatric Diabetes — annual review", date: "2025-10-21", type: "annual_review", text: "Annual review completed. The young person does not smoke or vape." },
    ],
  },

  NPD011: {
    code: "NPD011", patient: "npda-patient-011",
    dob: "2015-04-19", sex: "Male", ethnicity: "Black Caribbean",
    diabetesType: "Type 1", diagnosisDate: "2023-12-04",
    visitDate: "2025-12-19", height: 142, weight: 35.0, hba1c: 56,
    systolic: 102, diastolic: 64, cholesterol: 4.1, acr: 0.8,
    footDate: null, retinalDate: null, retinalResult: null,
    psychScreen: "2025-12-19", carbDate: "2024-01-15",
    i: {
      insulin: { v: "Insulin pump (CSII)", e: ["Managed on an insulin pump (CSII)"] },
      cgm: { v: "Yes", e: ["using a continuous glucose monitor"] },
      lifestyle: { v: "Yes", e: ["Lifestyle and dietary modification was recommended"] },
      dietitian: { v: "No", e: ["No additional dietitian appointment was required"] },
      psych: { v: "No", e: ["No additional psychological support was required"] },
      smoking: { v: "No", e: ["does not smoke or vape"] },
    },
    notes: [
      { role: "Paediatric Diabetes — Dr Naomi Clarke", date: "2025-12-19", type: "diabetes_clinic", text: "Reviewed in clinic with good control. Managed on an insulin pump (CSII) and is using a continuous glucose monitor. Lifestyle and dietary modification was recommended to help reduce blood glucose levels. No additional dietitian appointment was required at this visit." },
      { role: "Clinical Psychology — Dr Owen Pratt", date: "2025-12-19", type: "psychology", text: "Annual psychological screening completed. No additional psychological support was required beyond routine care." },
      { role: "Paediatric Diabetes — annual review", date: "2025-12-19", type: "annual_review", text: "Annual review completed. The child does not smoke or vape." },
    ],
  },

  NPD012: {
    code: "NPD012", patient: "npda-patient-012",
    dob: "2010-11-02", sex: "Female", ethnicity: "Asian — Bangladeshi",
    diabetesType: "Type 2", diagnosisDate: "2024-09-10",
    visitDate: "2025-11-28", height: 160, weight: 82.0, hba1c: 63,
    systolic: 128, diastolic: 80, cholesterol: 5.3, acr: 2.4,
    footDate: "2025-11-28", retinalDate: "2025-10-05", retinalResult: "No retinopathy",
    psychScreen: "2025-11-28", carbDate: null,
    i: {
      insulin: { v: "Diet and metformin (no insulin)", e: ["managed on metformin with no insulin"] },
      cgm: { v: "No", e: ["not currently using a continuous glucose monitor"] },
      lifestyle: { v: "Yes", e: ["Lifestyle and dietary modification was recommended"] },
      dietitian: { v: "Yes", e: ["additional appointment with the paediatric dietitian was offered"] },
      psych: { v: "Yes", e: ["Additional psychological support outside routine care was recommended"] },
      smoking: { v: "No", e: ["does not smoke or vape"] },
    },
    notes: [
      { role: "Paediatric Diabetes — Dr Naomi Clarke", date: "2025-11-28", type: "diabetes_clinic", text: "Reviewed in the young person's type 2 diabetes clinic. Currently managed on metformin with no insulin, and is not currently using a continuous glucose monitor. Lifestyle and dietary modification was recommended to help reduce blood glucose levels. An additional appointment with the paediatric dietitian was offered." },
      { role: "Clinical Psychology — Dr Owen Pratt", date: "2025-11-28", type: "psychology", text: "Annual psychological screening completed. Additional psychological support outside routine care was recommended around weight and wellbeing." },
      { role: "Paediatric Diabetes — annual review", date: "2025-11-28", type: "annual_review", text: "Annual review completed. The young person does not smoke or vape." },
    ],
  },
};

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
const NPDA_COLUMNS = [
  // 1 — Patient details/information
  { key: "patient", header: "NHS number", width: 12 },                                 // item 1
  { key: "dob", header: "Date of birth", width: 14 },                                  // item 2
  { key: "postcode", header: "Postcode of usual address", width: 16 },                 // item 3
  { key: "sex", header: "Sex assigned at birth", width: 18 },                          // item 4
  { key: "ethnicity", header: "Ethnic category", width: 26 },                          // item 5
  { key: "adhdAsd", header: "ADHD / ASD diagnosis", width: 20 },                       // item 6
  { key: "learningDisability", header: "Learning disability", width: 18 },             // item 7
  { key: "diabetesType", header: "Diabetes type", width: 14 },                         // item 8
  { key: "diagnosisDate", header: "Date of diagnosis", width: 16 },                    // item 9
  { key: "leavingDate", header: "Date of leaving service", width: 20 },                // item 10
  { key: "leavingReason", header: "Reason for leaving service", width: 24 },           // item 11
  { key: "deathDate", header: "Death date", width: 14 },                               // item 12
  { key: "gpPractice", header: "GP practice code", width: 16 },                        // item 13
  { key: "pduNumber", header: "PDU number", width: 12 },                               // item 14
  { key: "visitDate", header: "Visit/appointment date", width: 20 },                   // item 15
  { key: "_s1", header: "", width: 4 },
  // 2 — Routine measurements
  { key: "height", header: "Height (cm)", width: 12 },                                 // item 16
  { key: "weight", header: "Weight (kg)", width: 12 },                                 // item 17
  { key: "obsDateHtWt", header: "Obs date (height/weight)", width: 20 },               // item 18
  { key: "hba1c", header: "HbA1c (mmol/mol)", width: 16 },                             // item 19
  { key: "obsDateHba1c", header: "Obs date (HbA1c)", width: 18 },                      // item 20
  { key: "_s2", header: "", width: 4 },
  // 3 — Treatment/monitoring
  { key: "insulinRegime", header: "Insulin regime", width: 24 },                       // item 21
  { key: "otherMed", header: "Other glucose-lowering med", width: 24 },                // item 22
  { key: "lifestyle", header: "Lifestyle/dietary advice given", width: 26 },           // item 23
  { key: "cgm", header: "CGM in use", width: 12 },                                     // item 24
  { key: "ketoneTesting", header: "Blood ketone testing", width: 18 },                 // item 25
  { key: "immunotherapy", header: "Immunotherapy received", width: 20 },               // item 26
  { key: "immunotherapyDate", header: "Date immunotherapy started", width: 22 },       // item 27
  { key: "_s3", header: "", width: 4 },
  // 4 — Annual review: health checks
  { key: "systolic", header: "Systolic BP", width: 12 },                              // item 28
  { key: "diastolic", header: "Diastolic BP", width: 12 },                            // item 29
  { key: "obsDateBP", header: "Obs date (BP)", width: 16 },                            // item 30
  { key: "footDate", header: "Foot assessment date", width: 18 },                      // item 31
  { key: "retinalDate", header: "Retinal screening date", width: 20 },                 // item 32
  { key: "retinalResult", header: "Retinal screening result", width: 22 },             // item 33
  { key: "acr", header: "Urinary albumin (ACR)", width: 18 },                          // item 34
  { key: "obsDateAcr", header: "Obs date (ACR)", width: 16 },                          // item 35
  { key: "albuminuriaStage", header: "Albuminuria stage", width: 18 },                 // item 36
  { key: "cholesterol", header: "Total cholesterol (mmol/l)", width: 22 },             // item 37
  { key: "obsDateChol", header: "Obs date (cholesterol)", width: 20 },                 // item 38
  { key: "thyroidDate", header: "Obs date (thyroid function)", width: 22 },            // item 39
  { key: "thyroidTreatment", header: "Thyroid treatment", width: 22 },                 // item 40
  { key: "coeliacDate", header: "Obs date (coeliac screening)", width: 24 },           // item 41
  { key: "glutenFree", header: "Gluten-free diet", width: 16 },                        // item 42
  { key: "smoking", header: "Smokes / vapes", width: 14 },                             // item 43
  { key: "smokingCessationDate", header: "Smoking cessation advice date", width: 24 }, // item 44
  { key: "fluDate", header: "Influenza immunisation date", width: 24 },                // item 45
  { key: "sickDayDate", header: "Sick-day rules advice date", width: 22 },             // item 46
  { key: "_s4", header: "", width: 4 },
  // 5 — Annual review: psychology
  { key: "psychScreen", header: "Psychological screening date", width: 24 },           // item 47
  { key: "psychOutcome", header: "Additional psychological support needed", width: 32 }, // item 48
  { key: "mentalHealthAppt", header: "Mental health appointment offered", width: 28 }, // item 49
  { key: "_s5", header: "", width: 4 },
  // 6 — Annual review: dietetics
  { key: "carbCounting", header: "Level 3 carb counting date", width: 22 },            // item 50
  { key: "dietitian", header: "Additional dietitian appointment offered", width: 32 }, // item 51
  { key: "dietitianApptDate", header: "Dietitian appointment date", width: 22 },       // item 52
  { key: "_s6", header: "", width: 4 },
  // 7 — Hospital admissions / inpatient entry
  { key: "admissionStart", header: "Admission start date", width: 18 },                // item 53
  { key: "admissionDischarge", header: "Admission discharge date", width: 20 },        // item 54
  { key: "admissionReason", header: "Reason for admission", width: 20 },               // item 55
  { key: "admissionReasonOther", header: "Reason for admission (other)", width: 24 },  // item 56
  { key: "dkaTherapies", header: "DKA therapies given", width: 18 },                   // item 57
  { key: "initialPh", header: "Initial pH at admission", width: 20 },                  // item 58
  { key: "initialBicarb", header: "Initial bicarbonate (mmol/l)", width: 24 },         // item 59
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

// item 4 — Sex assigned at birth.
const SEX_CODE = { Male: 1, Female: 2, "Not specified": 3, Unknown: 99 };

// item 5 — Ethnic category. Keyed by the record's descriptive value; `label` is
// the exact NPDA wording shown as evidence.
const ETHNICITY = {
  "White British": { code: "A", label: "White - British" },
  "White — Other": { code: "C", label: "White - Any other White background" },
  "Mixed — White and Black Caribbean": { code: "D", label: "Mixed - White and Black Caribbean" },
  "Asian — Indian": { code: "H", label: "Asian - Indian" },
  "Asian — Pakistani": { code: "J", label: "Asian - Pakistani" },
  "Asian — Bangladeshi": { code: "K", label: "Asian - Bangladeshi" },
  "Black Caribbean": { code: "M", label: "Black - Caribbean" },
  "Black African": { code: "N", label: "Black - African" },
};

// item 8 — Diabetes Type.
const DIABETES_TYPE = {
  "Type 1": { code: 1, label: "Type 1 Diabetes Mellitus" },
  "Type 2": { code: 2, label: "Type 2 Diabetes Mellitus" },
};

// item 21 — Insulin regime at time of visit.
const INSULIN_REGIME = {
  "Insulin pump (CSII)": { code: 4, label: "a standalone insulin pump" },
  "MDI (basal-bolus)": { code: 3, label: "a multiple daily injection basal-bolus regimen (four or more injections a day)" },
  "Diet and metformin (no insulin)": { code: 1, label: "no insulin (managed on diet and metformin)" },
};

// item 24 — CGM in use.
const CGM_CODE = {
  Yes: { code: 1, label: "using a continuous glucose monitor" },
  No: { code: 2, label: "not using a continuous glucose monitor" },
};

// 1 = Yes, 2 = No, 99 = Unknown — items 23 (lifestyle), 48 (psychology), 51
// (dietitian).
const YESNO_CODE = { Yes: 1, No: 2, Unknown: 99 };

// item 43 — Does the patient smoke and/or vape?
const SMOKING_CODE = {
  No: { code: 1, label: "a non-smoker and non-vaper" },
  Smokes: { code: 2, label: "a current smoker (non-vaper)" },
  Vapes: { code: 3, label: "a current vaper (non-smoker)" },
};

// item 33 — Retinal screening result.
const RETINAL_CODE = {
  "No retinopathy": { code: 1, label: "Normal" },
  "Background retinopathy": { code: 2, label: "Abnormal (background retinopathy)" },
};

// item 55 — Reason for admission. Every modelled admission is acute DKA (= 1).
const ADMISSION_DKA = { code: 1, label: "an acute admission with diabetic ketoacidosis (DKA)" };

// --- New / 2026 NPDA code maps (keyed by the permitted-value code) -----------
// item 6 — ADHD / ASD diagnosis.
const ADHD_ASD = { 1: "Yes, ADHD", 2: "Yes, ASD", 3: "Yes, both ADHD and ASD", 4: "No, neither", 99: "Unknown" };
// item 7 — Learning disability. Also items 25, 26, 42 (Yes/No/Unknown).
const YESNO99 = { 1: "Yes", 2: "No", 99: "Unknown" };
// item 11 — Reason for leaving service.
const LEAVING_REASON = { 1: "Transitioned to adult diabetes service", 2: "Moved out of area", 3: "Other" };
// item 22 — Other (non-insulin) blood-glucose-lowering medication.
const OTHER_MED = { 1: "No medication", 2: "Metformin only", 3: "GLP-1 agonist", 4: "SGLT2 inhibitor", 5: "Other", 99: "Unknown" };
// item 36 — Albuminuria stage.
const ALBUMINURIA_STAGE = { 1: "Normoalbuminuria", 2: "Microalbuminuria", 3: "Macroalbuminuria", 99: "Unknown" };
// item 40 — Thyroid treatment.
const THYROID_TX = { 1: "No thyroid therapy", 2: "Thyroxine for hypothyroidism", 3: "Antithyroid medication for hyperthyroidism", 99: "Unknown" };
// item 49 — Mental health appointment offered.
const MENTAL_HEALTH_APPT = { 1: "Offered and attended", 2: "Offered and did not attend", 3: "Offered and declined", 4: "Not offered", 5: "Mental health support accessed elsewhere", 99: "Unknown" };
// item 57 — DKA therapies given during the admission.
const DKA_THERAPY = { 1: "Hypertonic saline", 2: "Mannitol", 3: "Bicarbonate infusion", 4: "None of the above" };

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
        meta: { kind: "direct", database: db, sql, explanation: `From the EHR demographics for ${r.code} — the patient's 10-digit NHS number.` },
      };
    }
    case "dob": return npdaDirect({ code: r.code, ref, db, table: "patient_demographics", column: "Date_of_birth", value: fmtDMY(r.dob), explanation: `From the EHR demographics for ${r.code} — date of birth, formatted DD/MM/YYYY.` });

    case "sex": {
      const code = SEX_CODE[r.sex];
      return npdaDirect({ code: r.code, ref, db, table: "patient_demographics", column: "Sex_assigned_at_birth", value: code, resultValue: r.sex, explanation: `From the EHR demographics for ${r.code} — sex assigned at birth recorded as ${r.sex}, coded ${code} per the NPDA dataset (1 = Male, 2 = Female).` });
    }
    case "ethnicity": {
      const e = ETHNICITY[r.ethnicity];
      return npdaDirect({ code: r.code, ref, db, table: "patient_demographics", column: "Ethnic_category", value: e.code, resultValue: e.label, explanation: `From the EHR demographics for ${r.code} — ethnic category recorded as '${e.label}', coded ${e.code} per the NPDA ethnic-category list.` });
    }
    case "diabetesType": {
      const d = DIABETES_TYPE[r.diabetesType];
      return npdaDirect({ code: r.code, ref, db, table: "diabetes_diagnoses", column: "Diabetes_type", value: d.code, resultValue: d.label, explanation: `From the EHR diabetes diagnosis record for ${r.code} — ${d.label}, coded ${d.code} per the NPDA dataset.` });
    }
    case "diagnosisDate": return npdaDirect({ code: r.code, ref, db, table: "diabetes_diagnoses", column: "Date_of_diagnosis", value: fmtDMY(r.diagnosisDate), explanation: `From the EHR diabetes diagnosis record for ${r.code} — date of diagnosis, formatted DD/MM/YYYY.` });

    case "visitDate": return npdaDirect({ code: r.code, ref, db, table: "clinic_observations", column: "Visit_date", value: fmtDMY(r.visitDate), explanation: `From the EHR clinic observation panel for ${r.code} — visit/appointment date, formatted DD/MM/YYYY.` });
    case "height": return npdaDirect({ code: r.code, ref, db, table: "clinic_observations", column: "Height_cm", value: dec1(r.height), explanation: `From the EHR clinic observation panel for ${r.code} — height in cm (NPDA format 999.9).` });
    case "weight": return npdaDirect({ code: r.code, ref, db, table: "clinic_observations", column: "Weight_kg", value: dec1(r.weight), explanation: `From the EHR clinic observation panel for ${r.code} — weight in kg (NPDA format 999.9).` });
    case "hba1c": return npdaDirect({ code: r.code, ref, db, table: "clinic_observations", column: "Hba1c", value: dec1(r.hba1c), explanation: `From the EHR clinic observation panel for ${r.code} — HbA1c of ${dec1(r.hba1c)} (NPDA format 999.9); a value between 20 and 195 is treated as mmol/mol per the NPDA dataset.` });

    case "insulinRegime": {
      const m = INSULIN_REGIME[i.insulin.v];
      return npdaInterp({ r, ref, db, value: m.code, noteTypes: ["diabetes_clinic"], evidence: i.insulin.e, explanation: `From the diabetes clinic note for ${r.code} — ${m.label}, coded ${m.code} per the NPDA insulin-regime values.` });
    }
    case "cgm": {
      const m = CGM_CODE[i.cgm.v];
      return npdaInterp({ r, ref, db, value: m.code, noteTypes: ["diabetes_clinic"], evidence: i.cgm.e, explanation: `From the diabetes clinic note for ${r.code} — ${m.label}, coded ${m.code} (1 = Yes, 2 = No).` });
    }
    case "lifestyle": return npdaInterp({ r, ref, db, value: YESNO_CODE[i.lifestyle.v], noteTypes: ["diabetes_clinic"], evidence: i.lifestyle.e, explanation: `From the diabetes clinic note for ${r.code} — lifestyle and dietary modification was ${i.lifestyle.v === "Yes" ? "recommended" : "not recommended"}, coded ${YESNO_CODE[i.lifestyle.v]} (1 = Yes, 2 = No).` });

    case "systolic": return npdaDirect({ code: r.code, ref, db, table: "clinic_observations", column: "Systolic_BP", value: r.systolic, explanation: `From the EHR clinic observation panel for ${r.code} — systolic blood pressure in mmHg (NPDA format 999).` });
    case "diastolic": return npdaDirect({ code: r.code, ref, db, table: "clinic_observations", column: "Diastolic_BP", value: r.diastolic, explanation: `From the EHR clinic observation panel for ${r.code} — diastolic blood pressure in mmHg (NPDA format 999).` });
    case "cholesterol": return npdaDirect({ code: r.code, ref, db, table: "clinic_observations", column: "Total_cholesterol", value: dec1(r.cholesterol), explanation: `From the EHR clinic observation panel for ${r.code} — total cholesterol in mmol/l (NPDA format 99.9).` });

    case "acr":
      if (r.acr == null) {
        return npdaDirect({ code: r.code, ref, db, table: "clinic_observations", column: "Urinary_ACR", value: "", resultValue: null, explanation: `Urinary albumin (ACR) was not performed for ${r.code} at this visit, so no value is recorded.` });
      }
      return npdaDirect({ code: r.code, ref, db, table: "clinic_observations", column: "Urinary_ACR", value: dec1(r.acr), explanation: `From the EHR clinic observation panel for ${r.code} — urinary albumin:creatinine ratio (ACR) in mg/mmol (NPDA format 9999.9).` });

    case "footDate":
      if (!r.footDate) {
        return npdaDirect({ code: r.code, ref, db, table: "diabetes_screening", column: "Foot_assessment_date", value: "", resultValue: null, explanation: `Foot assessment is a mandatory care process from age 12; ${r.code} is younger, so none was performed and the date is left blank.` });
      }
      return npdaDirect({ code: r.code, ref, db, table: "diabetes_screening", column: "Foot_assessment_date", value: fmtDMY(r.footDate), explanation: `From the diabetes screening record for ${r.code} — foot assessment date, formatted DD/MM/YYYY.` });

    case "retinalDate":
      if (!r.retinalDate) {
        return npdaDirect({ code: r.code, ref, db, table: "diabetes_screening", column: "Retinal_screening_date", value: "", resultValue: null, explanation: `Retinal screening is a mandatory care process from age 12; ${r.code} is younger, so none was performed and the date is left blank.` });
      }
      return npdaDirect({ code: r.code, ref, db, table: "diabetes_screening", column: "Retinal_screening_date", value: fmtDMY(r.retinalDate), explanation: `From the diabetes screening record for ${r.code} — retinal screening date, formatted DD/MM/YYYY.` });

    case "retinalResult": {
      if (!r.retinalResult) {
        return npdaDirect({ code: r.code, ref, db, table: "diabetes_screening", column: "Retinal_screening_result", value: "", resultValue: null, explanation: `No retinal screening was performed for ${r.code} (under 12), so there is no result to code.` });
      }
      const m = RETINAL_CODE[r.retinalResult];
      return npdaDirect({ code: r.code, ref, db, table: "diabetes_screening", column: "Retinal_screening_result", value: m.code, resultValue: m.label, explanation: `From the diabetes screening record for ${r.code} — retinal screening result was ${m.label}, coded ${m.code} (1 = Normal, 2 = Abnormal).` });
    }

    case "psychScreen": return npdaDirect({ code: r.code, ref, db, table: "diabetes_screening", column: "Psychological_screening_date", value: fmtDMY(r.psychScreen), explanation: `From the diabetes screening record for ${r.code} — date of the annual psychological screening assessment, formatted DD/MM/YYYY.` });
    case "psychOutcome": return npdaInterp({ r, ref, db, value: YESNO_CODE[i.psych.v], noteTypes: ["psychology"], evidence: i.psych.e, explanation: `From the psychology screening note for ${r.code} — additional psychological support outside routine care was ${i.psych.v === "Yes" ? "required" : "not required"}, coded ${YESNO_CODE[i.psych.v]} (1 = Yes, 2 = No).` });
    case "smoking": {
      const m = SMOKING_CODE[i.smoking.v];
      return npdaInterp({ r, ref, db, value: m.code, noteTypes: ["annual_review"], evidence: i.smoking.e, explanation: `From the annual review note for ${r.code} — ${m.label}, coded ${m.code} per the NPDA smoking/vaping values.` });
    }
    case "dietitian": return npdaInterp({ r, ref, db, value: YESNO_CODE[i.dietitian.v], noteTypes: ["diabetes_clinic"], evidence: i.dietitian.e, explanation: `From the diabetes clinic note for ${r.code} — an additional paediatric dietitian appointment was ${i.dietitian.v === "Yes" ? "offered" : "not offered"}, coded ${YESNO_CODE[i.dietitian.v]} (1 = Yes, 2 = No).` });

    case "carbCounting":
      if (!r.carbDate) {
        return npdaDirect({ code: r.code, ref, db, table: "diabetes_education", column: "Level3_carb_counting_date", value: "", resultValue: null, explanation: `Level 3 carbohydrate counting applies to patients on injections or a pump; ${r.code} is managed on diet and metformin, so it is not applicable and the date is left blank.` });
      }
      return npdaDirect({ code: r.code, ref, db, table: "diabetes_education", column: "Level3_carb_counting_date", value: fmtDMY(r.carbDate), explanation: `From the diabetes education record for ${r.code} — date level 3 carbohydrate counting education was received, formatted DD/MM/YYYY.` });

    case "admissionReason":
      if (r.admission) {
        return npdaInterp({ r, ref, db, value: ADMISSION_DKA.code, noteTypes: ["admission"], evidence: i.admission.e, explanation: `From the admission note for ${r.code} — ${ADMISSION_DKA.label}, coded ${ADMISSION_DKA.code} per the NPDA reason-for-admission values (1 = Acute DKA).` });
      }
      return npdaDirect({ code: r.code, ref, db, table: "hospital_admissions", column: "Reason_for_admission", value: "", resultValue: null, explanation: `No diabetes-related hospital admission was recorded for ${r.code} during the audit year, so there is no reason-for-admission code.` });

    // --- Section 1: patient details (new/2026 items) -----------------------
    case "postcode":
      return npdaDirect({ code: r.code, ref, db, table: "patient_demographics", column: "Postcode", value: x.postcode, explanation: `From the EHR demographics for ${r.code} — usual-address postcode in upper case with the correct spacing.` });
    case "adhdAsd":
      return npdaCoded({ r, ref, db, table: "patient_demographics", column: "ADHD_ASD", code: x.adhdAsd, map: ADHD_ASD, explanation: `From the EHR demographics for ${r.code} — ${ADHD_ASD[x.adhdAsd]}, coded ${x.adhdAsd} per the NPDA ADHD/ASD values.` });
    case "learningDisability":
      return npdaCoded({ r, ref, db, table: "patient_demographics", column: "Learning_disability", code: x.learningDisability, map: YESNO99, explanation: `From the EHR demographics for ${r.code} — learning disability ${YESNO99[x.learningDisability]}, coded ${x.learningDisability} (1 = Yes, 2 = No).` });
    case "leavingDate":
      if (!x.leavingDate) return npdaBlank({ r, ref, db, table: "patient_demographics", column: "Date_left_service", explanation: `${r.code} remained under the paediatric diabetes service throughout the audit year, so no leaving date is recorded.` });
      return npdaDate({ r, ref, db, table: "patient_demographics", column: "Date_left_service", iso: x.leavingDate, explanation: `From the EHR demographics for ${r.code} — date the patient left the service, formatted DD/MM/YYYY.` });
    case "leavingReason":
      if (!x.leavingReason) return npdaBlank({ r, ref, db, table: "patient_demographics", column: "Reason_left_service", explanation: `${r.code} did not leave the service during the audit year, so there is no reason-for-leaving code.` });
      return npdaCoded({ r, ref, db, table: "patient_demographics", column: "Reason_left_service", code: x.leavingReason, map: LEAVING_REASON, explanation: `From the EHR demographics for ${r.code} — ${LEAVING_REASON[x.leavingReason]}, coded ${x.leavingReason} per the NPDA reason-for-leaving values.` });
    case "deathDate":
      return npdaBlank({ r, ref, db, table: "patient_demographics", column: "Death_date", explanation: `No death was recorded for ${r.code} during the audit year, so the death date is left blank.` });
    case "gpPractice":
      return npdaDirect({ code: r.code, ref, db, table: "patient_demographics", column: "GP_practice_code", value: x.gpPractice, explanation: `From the EHR demographics for ${r.code} — registered GP practice code (NPDA format X99999).` });
    case "pduNumber":
      return npdaDirect({ code: r.code, ref, db, table: "patient_demographics", column: "PDU_number", value: "147", explanation: `From the unit registration for ${r.code} — the paediatric diabetes unit (PDU) number, a 3-digit code shared by every child seen at this unit.` });

    // --- Section 2: routine-measurement observation dates ------------------
    case "obsDateHtWt":
      return npdaDate({ r, ref, db, table: "clinic_observations", column: "Height_weight_obs_date", iso: r.visitDate, explanation: `From the EHR clinic observation panel for ${r.code} — combined height/weight observation date (taken at the clinic visit), formatted DD/MM/YYYY.` });
    case "obsDateHba1c":
      return npdaDate({ r, ref, db, table: "clinic_observations", column: "Hba1c_obs_date", iso: r.visitDate, explanation: `From the EHR clinic observation panel for ${r.code} — date the HbA1c was performed (within the audit year), formatted DD/MM/YYYY.` });

    // --- Section 3: treatment/monitoring (new/2026 items) ------------------
    case "otherMed":
      return npdaCoded({ r, ref, db, table: "medications", column: "Other_glucose_lowering_med", code: x.otherMed, map: OTHER_MED, explanation: `From the EHR medication record for ${r.code} — ${OTHER_MED[x.otherMed]}, coded ${x.otherMed} per the NPDA non-insulin medication values.` });
    case "ketoneTesting": {
      const code = r.diabetesType === "Type 2" ? 2 : 1;
      return npdaCoded({ r, ref, db, table: "diabetes_screening", column: "Blood_ketone_testing", code, map: YESNO99, explanation: `From the diabetes screening record for ${r.code} — using or trained to use blood-ketone testing equipment: ${YESNO99[code]}, coded ${code} (1 = Yes, 2 = No).` });
    }
    case "immunotherapy":
      if (!(isNewlyDiagnosed(r) && r.diabetesType === "Type 1"))
        return npdaBlank({ r, ref, db, table: "diabetes_diagnoses", column: "Immunotherapy_received", explanation: `The immunotherapy item is completed only for patients newly diagnosed with type 1 diabetes within the audit year; ${r.code} does not qualify, so it is left blank.` });
      return npdaCoded({ r, ref, db, table: "diabetes_diagnoses", column: "Immunotherapy_received", code: x.immunotherapy, map: YESNO99, explanation: `From the diabetes diagnosis record for ${r.code} — immunotherapy around the stage-3 type 1 diagnosis: ${YESNO99[x.immunotherapy]}, coded ${x.immunotherapy} (1 = Yes, 2 = No).` });
    case "immunotherapyDate":
      if (!x.immunotherapyDate) return npdaBlank({ r, ref, db, table: "diabetes_diagnoses", column: "Immunotherapy_start_date", explanation: `No immunotherapy was given to ${r.code}, so there is no start date to record.` });
      return npdaDate({ r, ref, db, table: "diabetes_diagnoses", column: "Immunotherapy_start_date", iso: x.immunotherapyDate, explanation: `From the diabetes diagnosis record for ${r.code} — date immunotherapy started, formatted DD/MM/YYYY.` });

    // --- Section 4: health checks (observation dates + new/2026 items) -----
    case "obsDateBP":
      return npdaDate({ r, ref, db, table: "clinic_observations", column: "BP_obs_date", iso: r.visitDate, explanation: `From the EHR clinic observation panel for ${r.code} — blood-pressure observation date (taken at the clinic visit), formatted DD/MM/YYYY.` });
    case "obsDateAcr":
      if (r.acr == null) return npdaBlank({ r, ref, db, table: "clinic_observations", column: "ACR_obs_date", explanation: `Urinary albumin (ACR) was not performed for ${r.code} at this visit, so there is no observation date.` });
      return npdaDate({ r, ref, db, table: "clinic_observations", column: "ACR_obs_date", iso: r.visitDate, explanation: `From the EHR clinic observation panel for ${r.code} — date the urinary ACR was performed, formatted DD/MM/YYYY.` });
    case "albuminuriaStage": {
      if (r.acr == null) return npdaBlank({ r, ref, db, table: "clinic_observations", column: "Albuminuria_stage", explanation: `No urinary ACR was measured for ${r.code}, so the albuminuria stage cannot be coded.` });
      const code = r.acr < 3 ? 1 : (r.acr <= 30 ? 2 : 3);
      return npdaCoded({ r, ref, db, table: "clinic_observations", column: "Albuminuria_stage", code, map: ALBUMINURIA_STAGE, explanation: `Interpreted from the urinary ACR of ${dec1(r.acr)} mg/mmol for ${r.code} — ${ALBUMINURIA_STAGE[code]}, coded ${code} (an ACR below 3 mg/mmol is normoalbuminuria).` });
    }
    case "obsDateChol":
      return npdaDate({ r, ref, db, table: "clinic_observations", column: "Cholesterol_obs_date", iso: r.visitDate, explanation: `From the EHR clinic observation panel for ${r.code} — date the total cholesterol was performed, formatted DD/MM/YYYY.` });
    case "thyroidDate":
      if (r.diabetesType !== "Type 1") return npdaBlank({ r, ref, db, table: "diabetes_screening", column: "Thyroid_obs_date", explanation: `Annual thyroid-function monitoring is a type 1 diabetes care process; ${r.code} has type 2 diabetes, so no thyroid observation date is recorded.` });
      return npdaDate({ r, ref, db, table: "diabetes_screening", column: "Thyroid_obs_date", iso: r.visitDate, explanation: `From the diabetes screening record for ${r.code} — date of annual thyroid-function testing, formatted DD/MM/YYYY.` });
    case "thyroidTreatment":
      if (r.diabetesType !== "Type 1") return npdaBlank({ r, ref, db, table: "diabetes_screening", column: "Thyroid_treatment", explanation: `Thyroid treatment is recorded alongside the type 1 annual thyroid check; ${r.code} has type 2 diabetes, so it is left blank.` });
      return npdaCoded({ r, ref, db, table: "diabetes_screening", column: "Thyroid_treatment", code: x.thyroidTreatment, map: THYROID_TX, explanation: `From the diabetes screening record for ${r.code} — ${THYROID_TX[x.thyroidTreatment]}, coded ${x.thyroidTreatment} per the NPDA thyroid-treatment values.` });
    case "coeliacDate":
      if (!x.coeliacDate) return npdaBlank({ r, ref, db, table: "diabetes_screening", column: "Coeliac_screening_date", explanation: `Coeliac-disease screening date is recorded only for patients diagnosed within the audit year; ${r.code} was diagnosed earlier, so it is left blank.` });
      return npdaDate({ r, ref, db, table: "diabetes_screening", column: "Coeliac_screening_date", iso: x.coeliacDate, explanation: `From the diabetes screening record for ${r.code} — date of coeliac-disease serological screening, formatted DD/MM/YYYY.` });
    case "glutenFree":
      return npdaCoded({ r, ref, db, table: "diabetes_screening", column: "Gluten_free_diet", code: x.glutenFree, map: YESNO99, explanation: `From the diabetes screening record for ${r.code} — recommended/prescribed a gluten-free diet: ${YESNO99[x.glutenFree]}, coded ${x.glutenFree} (a 'Yes' is interpreted as a diagnosis of coeliac disease).` });
    case "smokingCessationDate":
      if (i.smoking.v === "No") return npdaBlank({ r, ref, db, table: "diabetes_screening", column: "Smoking_cessation_date", explanation: `${r.code} is not a current smoker or vaper, so no smoking-cessation advice was due and the date is left blank.` });
      return npdaDate({ r, ref, db, table: "diabetes_screening", column: "Smoking_cessation_date", iso: r.visitDate, explanation: `From the diabetes screening record for ${r.code} — date smoking-cessation advice/referral was offered, formatted DD/MM/YYYY.` });
    case "fluDate":
      if (!x.fluDate) return npdaBlank({ r, ref, db, table: "diabetes_screening", column: "Influenza_immunisation_date", explanation: `No influenza immunisation was recorded for ${r.code} during the audit year, so this care process is treated as incomplete and the date is left blank.` });
      return npdaDate({ r, ref, db, table: "diabetes_screening", column: "Influenza_immunisation_date", iso: x.fluDate, explanation: `From the diabetes screening record for ${r.code} — date influenza immunisation was recommended, formatted DD/MM/YYYY.` });
    case "sickDayDate":
      return npdaDate({ r, ref, db, table: "diabetes_screening", column: "Sick_day_rules_date", iso: r.visitDate, explanation: `From the diabetes screening record for ${r.code} — date 'sick-day rules' advice was provided (revisited at the annual review), formatted DD/MM/YYYY.` });

    // --- Section 5: psychology (new/2026 item) -----------------------------
    case "mentalHealthAppt":
      return npdaCoded({ r, ref, db, table: "diabetes_screening", column: "Mental_health_appt_offered", code: x.mentalHealthAppt, map: MENTAL_HEALTH_APPT, explanation: `From the psychology record for ${r.code} — ${MENTAL_HEALTH_APPT[x.mentalHealthAppt]}, coded ${x.mentalHealthAppt} per the NPDA mental-health-appointment values.` });

    // --- Section 6: dietetics (new/2026 item) ------------------------------
    case "dietitianApptDate":
      if (i.dietitian.v !== "Yes") return npdaBlank({ r, ref, db, table: "diabetes_education", column: "Dietitian_appt_date", explanation: `No additional dietitian appointment was attended by ${r.code}, so the appointment date is left blank.` });
      return npdaDate({ r, ref, db, table: "diabetes_education", column: "Dietitian_appt_date", iso: r.visitDate, explanation: `From the diabetes education record for ${r.code} — date of the additional paediatric-dietitian appointment, formatted DD/MM/YYYY.` });

    // --- Section 7: admissions (dates + new/2026 items) --------------------
    case "admissionStart":
      if (!r.admission) return npdaBlank({ r, ref, db, table: "hospital_admissions", column: "Spell_start_date", explanation: `No diabetes-related admission was recorded for ${r.code} during the audit year, so there is no spell start date.` });
      return npdaDate({ r, ref, db, table: "hospital_admissions", column: "Spell_start_date", iso: x.admStart, explanation: `From the hospital admission record for ${r.code} — hospital provider spell start date, formatted DD/MM/YYYY.` });
    case "admissionDischarge":
      if (!r.admission) return npdaBlank({ r, ref, db, table: "hospital_admissions", column: "Spell_discharge_date", explanation: `No diabetes-related admission was recorded for ${r.code} during the audit year, so there is no discharge date.` });
      return npdaDate({ r, ref, db, table: "hospital_admissions", column: "Spell_discharge_date", iso: x.admDischarge, explanation: `From the hospital admission record for ${r.code} — hospital provider spell discharge date, formatted DD/MM/YYYY.` });
    case "admissionReasonOther":
      if (!r.admission) return npdaBlank({ r, ref, db, table: "hospital_admissions", column: "Reason_for_admission_other", explanation: `No admission was recorded for ${r.code}, so there is no free-text reason.` });
      return npdaBlank({ r, ref, db, table: "hospital_admissions", column: "Reason_for_admission_other", explanation: `The free-text reason is mandatory only when 'Other causes' is selected; ${r.code}'s admission was coded as DKA, so it is left blank.` });
    case "dkaTherapies":
      if (!r.admission) return npdaBlank({ r, ref, db, table: "hospital_admissions", column: "DKA_therapies", explanation: `No DKA admission was recorded for ${r.code}, so there are no DKA therapies to record.` });
      return npdaCoded({ r, ref, db, table: "hospital_admissions", column: "DKA_therapies", code: x.dkaTherapy, map: DKA_THERAPY, explanation: `From the hospital admission record for ${r.code} — DKA therapies received: ${DKA_THERAPY[x.dkaTherapy]}, coded ${x.dkaTherapy} per the NPDA DKA-therapy values.` });
    case "initialPh":
      if (!r.admission) return npdaBlank({ r, ref, db, table: "hospital_admissions", column: "Initial_pH", explanation: `No admission blood gas was recorded for ${r.code}, so there is no initial pH.` });
      return npdaDirect({ code: r.code, ref, db, table: "hospital_admissions", column: "Initial_pH", value: x.initialPh, explanation: `From the hospital admission record for ${r.code} — initial (first recorded) pH at admission (NPDA format 0.00).` });
    case "initialBicarb":
      if (!r.admission) return npdaBlank({ r, ref, db, table: "hospital_admissions", column: "Initial_bicarbonate", explanation: `No admission blood gas was recorded for ${r.code}, so there is no initial standard bicarbonate.` });
      return npdaDirect({ code: r.code, ref, db, table: "hospital_admissions", column: "Initial_bicarbonate", value: x.initialBicarb, explanation: `From the hospital admission record for ${r.code} — initial standard bicarbonate at admission in mmol/l (NPDA format 00.0).` });

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
    return makeCell(colKey, { code, r, ref, db: MOCK_DATABASE.id, rowIdx });
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

const act = (wait, headline, detail, extra = {}) => ({
  kind: "activity", wait,
  event: { type: "activity", headline, detail, ...extra },
});
const tool = (wait, name, status, headline) => ({
  kind: "activity", wait,
  event: { type: "activity", name, status, headline },
});

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

  steps.push(act(rnd(400, 600), "Mapping the template to the EHR schema…",
    "Resolving each of the template's columns to a field in the **EHR database** before copying across the structured birth-record values."));
  steps.push(all.columnBatch(rnd(400, 600), "patient"));

  steps.push(act(rnd(350, 550), "Copying the structured birth-record fields…",
    "Pulling gestation, maternal age, parity, delivery mode, birth weight and the Apgar scores straight from `cord_ph_birth_records` and `patient_demographics`."));
  steps.push(all.multiColumnBatch(rnd(600, 800), ["gestWeeks", "gestDays", "maternalAge", "parity"]));
  steps.push(all.multiColumnBatch(rnd(550, 750), ["delivery", "birthWeight"]));
  steps.push(all.multiColumnBatch(rnd(550, 750), ["apgar1", "apgar5", "apgar10"]));

  steps.push(act(rnd(400, 600), "Reading the antenatal screening fields…",
    "Copying the normal-scan, normal-doppler and CTG flags from the antenatal records."));
  steps.push(all.multiColumnBatch(rnd(550, 750), ["normalScans", "normalDopplers", "ctgDone"]));

  // INTERPRETIVE: read each baby's antenatal note in turn, one cell at a time.
  steps.push(act(rnd(550, 750), "Reading the antenatal notes…",
    "Reading each pregnancy's antenatal note for fetal movements, maternal comorbidities, prolonged rupture of membranes and sepsis risk factors."));
  steps.push(...all.streamColumns(ic, ["foetalMovements", "maternalComorbidities", "maternalComorbiditiesOther", "prom", "rffs"]));

  steps.push(tool(rnd(450, 650), "sql_execute", "ok", "Read the cord-gas panel"));
  steps.push(all.multiColumnBatch(rnd(600, 800), ["ph", "be", "lactate"])); // CPH003 Unavailable, CPH007 lactate Not recorded

  // INTERPRETIVE: obstetric + midwifery notes, read baby by baby.
  steps.push(act(rnd(550, 750), "Reading the obstetric and midwifery notes…",
    "Combining each obstetrician birth-summary with the matching midwife delivery note to confirm delayed cord clamping, the state of the liquor, chorioamnionitis and any sentinel event."));
  steps.push(...all.streamColumns(ic, ["dcc", "liquorMeconium", "chorioamnionitis", "sentinelEvent"]));

  // INTERPRETIVE: resuscitation records, read one at a time.
  steps.push(act(rnd(500, 700), "Reading the resuscitation notes…",
    "Reading each resuscitation record for intubation, cardiac compressions and any drugs given at delivery."));
  steps.push(...all.streamColumns(ic, ["intubated", "compressions", "drugs"]));

  // INTERPRETIVE: postnatal metabolic note, baby by baby.
  steps.push(act(rnd(400, 600), "Checking the newborn metabolic screen…",
    "Reading the postnatal note for each baby to record any hypoglycaemia."));
  steps.push(...all.streamColumn(ic, "hypoglycaemia"));

  steps.push(act(rnd(450, 650), "Copying the follow-up and discharge fields…",
    "Pulling the ward, repeat cord-gas results, NICU admission and discharge timing from the structured record. Where no repeat gas was performed the field is filled with an explicit \"N/A\" rather than left blank."));
  steps.push(all.multiColumnBatch(rnd(650, 900), ["ward", "gasRepeated", "ageRepeatedGas", "repeatedLactate", "ageGasNormalised"]));
  steps.push(all.multiColumnBatch(rnd(500, 700), ["admittedNicu", "ageDischargeHome"]));

  steps.push(act(rnd(400, 600), "Recording the unit-level governance answers…",
    "Filling the unit-level questionnaire and local-guideline availability columns from the audit governance record."));
  steps.push(all.multiColumnBatch(rnd(500, 700), ["unitQuestionnaire", "guidelineCordGas", "guidelineFetalAcidosis"]));

  // --- NICU sheet ---
  steps.push(act(rnd(550, 750), "Populating the NICU sheet…",
    "Switching to the **NICU** sheet to fill the outcomes for the babies admitted to the neonatal unit."));
  steps.push(nicu.columnBatch(rnd(450, 650), "nnuAdmitAge"));
  steps.push(nicu.multiColumnBatch(rnd(550, 750), ["transferredOut", "durationNicu", "ageDischargeHomeNicu"]));

  // INTERPRETIVE: cooling + CFM reconciliation, cell by cell.
  steps.push(act(rnd(550, 750), "Reading the cooling and CFM notes…",
    "Reading each NICU admission note for therapeutic cooling and reconciling the bedside CFM impression against the formal neurology report. One case disagrees with the structured record; one preterm sepsis admission had no CFM, recorded explicitly."));
  steps.push(...nicu.streamColumns(ic, ["cooled", "ageCooling", "cfm"]));

  // INTERPRETIVE: neurology reports, read one at a time.
  steps.push(act(rnd(550, 750), "Reading the neurology reports…",
    "Reading each formal neurology report for clinical and electrographic seizures and any MRI injury."));
  steps.push(...nicu.streamColumns(ic, ["seizures", "clinicalSeizures", "electrographicSeizure", "mriInjury"]));

  // INTERPRETIVE: discharge summaries, cell by cell.
  steps.push(act(rnd(450, 650), "Checking the NICU discharge summaries…",
    "Reading each NICU discharge summary for feeding method and neurology at discharge."));
  steps.push(...nicu.streamColumns(ic, ["feeding", "abnormalNeurology"]));

  steps.push(act(rnd(450, 650), "Finalizing the audit…",
    "All cells populated and traceable to the EHR record or the source notes across both the ALL and NICU sheets."));
  steps.push(reviewSummary(rnd(250, 450), {
    totals: { cells: 328, filled: 318, blocked: 2, needs_verification: 8, low_confidence: 5 },
  }));
  steps.push({ kind: "done", wait: rnd(400, 600), event: { type: "done" } });
  return steps;
}

// Chest-pain population: build-then-populate, largely column-by-column.
function chestPainPopulation(ds) {
  const steps = [];

  steps.push(act(rnd(450, 650), "Populating from the EHR…",
    "Filling the chest-pain workbook column by column from the **EHR database** and the triage and cardiology notes."));
  steps.push(ds.columnBatch(rnd(400, 600), "patient"));
  steps.push(ds.columnBatch(rnd(500, 700), "age"));

  steps.push(act(rnd(450, 650), "Reading the triage notes…",
    "Reading each attendance's triage note to capture the presenting complaint."));
  steps.push(ds.columnBatch(rnd(600, 850), "complaint"));

  steps.push(tool(rnd(450, 650), "sql_execute", "ok", "Read the troponin results"));
  steps.push(ds.columnBatch(rnd(550, 750), "troponin")); // includes CP004 "Unavailable"

  steps.push(act(rnd(450, 650), "Reading the ECG results…",
    "Pulling the documented ECG findings and the time from arrival to first ECG, flagging any attendance with no ECG on record."));
  steps.push(ds.columnBatch(rnd(550, 750), "ecg")); // includes CP005 empty
  steps.push(ds.columnBatch(rnd(450, 650), "timeToEcg")); // includes CP005 empty

  steps.push(act(rnd(500, 700), "Reviewing the cardiology notes…",
    "Reading the cardiology review to set the working diagnosis for each patient."));
  steps.push(ds.columnBatch(rnd(600, 800), "diagnosis"));

  steps.push(act(rnd(450, 650), "Checking the discharge summaries…",
    "Reading each discharge summary to record whether the patient was discharged or admitted."));
  steps.push(ds.columnBatch(rnd(550, 750), "decision"));

  steps.push(act(rnd(450, 650), "Finalizing the audit…",
    "All cells populated and traceable to the EHR record or the source notes."));
  steps.push(reviewSummary(rnd(250, 450), {
    totals: { cells: 72, filled: 69, blocked: 1, needs_verification: 2, low_confidence: 1 },
  }));
  steps.push({ kind: "done", wait: rnd(400, 600), event: { type: "done" } });
  return steps;
}

// Flow A — run the uploaded Cord pH template: structure ready, then populate.
function timelineA() {
  return [
    act(250, "Reviewing the template…",
      "Reviewing the **Cord pH (regional)** audit against the **EHR database** and resolving the field mappings across both the ALL and NICU sheets."),
    tool(rnd(550, 750), "query_schema", "ok", "Inspected the EHR schema"),
    { kind: "workbook", wait: rnd(550, 750), event: cordWorkbookEvent() },
    ...cordPhPopulation(cordAll, cordNicu),
  ];
}

// Flow B — describe the data (the chest-pain email): build the spreadsheet
// first, then populate it column-by-column.
function timelineB() {
  return [
    act(300, "Reading the request…",
      "Parsing Dr Alvarez's request: an audit of the adult chest-pain attendances on the **EHR database** for the last quarter."),
    act(rnd(900, 1200), "Building the spreadsheet…",
      "Designing a chest-pain workbook from the **EHR database** — encounters, troponin and ECG results plus the triage and cardiology notes."),
    act(rnd(1000, 1300), "Adding columns…",
      "Adding columns: Patient, Age, Presenting complaint, Troponin (ng/L), ECG findings, Time to ECG (min), Diagnosis, Discharge/Admit decision."),
    { kind: "workbook", wait: rnd(900, 1100), event: chestPain.workbookEvent() },
    ...chestPainPopulation(chestPain),
  ];
}

// NPDA population: fill the single sheet in mixed-cadence batches (structured
// columns fast, interpretive note reads slower), faithful to the cord cadence.
function npdaPopulation(ds) {
  const steps = [];
  const ic = () => rnd(200, 420);

  steps.push(act(rnd(400, 600), "Mapping the template to the EHR schema…",
    "Resolving each NPDA column to a field in the **EHR database** before copying across the structured demographics and diagnosis details."));
  steps.push(ds.columnBatch(rnd(400, 600), "patient"));

  steps.push(act(rnd(350, 550), "Copying the demographics and diagnosis fields…",
    "Pulling date of birth, postcode, sex, ethnic category, the ADHD/ASD and learning-disability flags, diabetes type and date of diagnosis straight from `patient_demographics` and `diabetes_diagnoses`."));
  steps.push(ds.multiColumnBatch(rnd(600, 800), ["dob", "postcode", "sex", "ethnicity"]));
  steps.push(ds.multiColumnBatch(rnd(550, 750), ["adhdAsd", "learningDisability", "diabetesType", "diagnosisDate"]));

  steps.push(act(rnd(400, 600), "Copying the registration and service fields…",
    "Pulling the date and reason for leaving the service, any death date, the GP practice code, the PDU number and the visit/appointment date. Patients who remained under the service carry an explicit label rather than a blank."));
  steps.push(ds.multiColumnBatch(rnd(600, 850), ["leavingDate", "leavingReason", "deathDate", "gpPractice", "pduNumber", "visitDate"]));

  steps.push(act(rnd(400, 600), "Copying the clinic measurements…",
    "Copying height, weight and HbA1c with their observation dates from the structured clinic observation panel."));
  steps.push(ds.multiColumnBatch(rnd(650, 900), ["height", "weight", "obsDateHtWt", "hba1c", "obsDateHba1c"]));

  // INTERPRETIVE: read each child's diabetes clinic note, one cell at a time.
  steps.push(act(rnd(550, 750), "Reading the diabetes clinic notes…",
    "Reading each child's diabetes clinic note for the insulin regime, continuous glucose monitor use and the lifestyle and dietary advice given."));
  steps.push(...ds.streamColumns(ic, ["insulinRegime", "cgm", "lifestyle"]));

  steps.push(act(rnd(450, 650), "Copying the treatment and monitoring flags…",
    "Pulling any non-insulin glucose-lowering medication, blood-ketone testing, and — for newly diagnosed type 1 patients — whether immunotherapy was received and when."));
  steps.push(ds.multiColumnBatch(rnd(600, 850), ["otherMed", "ketoneTesting", "immunotherapy", "immunotherapyDate"]));

  steps.push(tool(rnd(450, 650), "sql_execute", "ok", "Read the cardiometabolic screen"));
  steps.push(ds.multiColumnBatch(rnd(650, 900), ["systolic", "diastolic", "obsDateBP", "cholesterol", "obsDateChol"]));
  steps.push(ds.multiColumnBatch(rnd(600, 850), ["acr", "obsDateAcr", "albuminuriaStage"])); // NPD007/NPD010 ACR Not done

  steps.push(act(rnd(450, 650), "Copying the surveillance screening dates…",
    "Pulling the foot assessment, retinal screening, thyroid, coeliac and carbohydrate-counting fields from the structured record. Where screening is not yet due or not applicable the field is filled with an explicit label rather than left blank."));
  steps.push(ds.multiColumnBatch(rnd(650, 900), ["footDate", "retinalDate", "retinalResult"]));
  steps.push(ds.multiColumnBatch(rnd(600, 850), ["thyroidDate", "thyroidTreatment", "coeliacDate", "glutenFree"]));

  // INTERPRETIVE: annual review note for smoking/vaping, child by child.
  steps.push(act(rnd(450, 650), "Reading the annual review notes…",
    "Reading each child's annual review note for smoking or vaping status, then recording the smoking-cessation, influenza-immunisation and sick-day-rules care-process dates."));
  steps.push(...ds.streamColumn(ic, "smoking"));
  steps.push(ds.multiColumnBatch(rnd(600, 850), ["smokingCessationDate", "fluDate", "sickDayDate"]));

  steps.push(ds.columnBatch(rnd(450, 650), "psychScreen"));

  // INTERPRETIVE: psychology note for the support outcome, child by child.
  steps.push(act(rnd(550, 750), "Reading the psychology notes…",
    "Reading the annual psychological screening outcome for each child, then recording whether a mental-health appointment was offered as part of the diabetes MDT."));
  steps.push(...ds.streamColumn(ic, "psychOutcome"));
  steps.push(ds.columnBatch(rnd(450, 650), "mentalHealthAppt"));

  // INTERPRETIVE: dietetic input + admissions, cell by cell.
  steps.push(act(rnd(500, 700), "Checking dietetic input and admissions…",
    "Reading the diabetes clinic note for any additional dietitian appointment offered, then pulling the carbohydrate-counting and dietitian-appointment dates and the admission record for any diabetes-related admission such as DKA."));
  steps.push(...ds.streamColumn(ic, "dietitian"));
  steps.push(ds.multiColumnBatch(rnd(600, 850), ["carbCounting", "dietitianApptDate"]));
  steps.push(...ds.streamColumn(ic, "admissionReason"));
  steps.push(ds.multiColumnBatch(rnd(650, 900), ["admissionStart", "admissionDischarge", "admissionReasonOther", "dkaTherapies", "initialPh", "initialBicarb"]));

  steps.push(act(rnd(450, 650), "Finalizing the audit…",
    "All cells populated and traceable to the EHR record or the source notes."));
  steps.push(reviewSummary(rnd(250, 450), {
    totals: { cells: 420, filled: 403, blocked: 3, needs_verification: 14, low_confidence: 9 },
  }));
  steps.push({ kind: "done", wait: rnd(400, 600), event: { type: "done" } });
  return steps;
}

// Flow C — run the uploaded NPDA template: structure ready, then populate.
function timelineC() {
  return [
    act(250, "Reviewing the template…",
      "Reviewing the **Paediatric diabetes (NPDA)** audit against the **EHR database** and resolving the field mappings."),
    tool(rnd(550, 750), "query_schema", "ok", "Inspected the EHR schema"),
    { kind: "workbook", wait: rnd(550, 750), event: npda.workbookEvent() },
    ...npdaPopulation(npda),
  ];
}

export function buildTimeline(flow) {
  if (flow === "C") return timelineC();
  return flow === "B" ? timelineB() : timelineA();
}

// --- Sample doctor's email (Flow B) ----------------------------------------
export const mockSampleEmail = `Hi team,

For the chest-pain pathway review I need an audit of the adult chest-pain attendances on the EHR database for the last quarter.

For each patient please pull: age, presenting complaint at triage, the first troponin result, the time from arrival to first ECG, and the documented ECG findings. On top of the structured fields, read the triage and cardiology notes and give me the working diagnosis, and whether the patient was discharged or admitted.

Flag any case where a troponin or ECG is missing.

Thanks,
Dr Mark Alvarez
Emergency Medicine`;
