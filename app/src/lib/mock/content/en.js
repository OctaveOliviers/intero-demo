// English content pack for the Intero demo mock layer.
//
// This module holds EVERY human-readable (translatable) string used by the mock
// data layer (src/lib/mockData.js) and the template catalog
// (src/lib/templateCatalog.js). The logic — SQL strings, table/column
// identifiers, numbers, dates, ids, codes, note types, tool names, cadence
// timings — stays in mockData.js / templateCatalog.js. A translator copies this
// file to `<locale>.js` and translates only the human text here; the shape must
// stay identical so the builders keep working.
//
// Shape (top-level keys of the default export):
//   databases        — array of { id, name, status } picker databases (name translatable)
//   ehrDatabaseName  — the "EHR database" source-tag name (string)
//   analyses         — array of { id, name, description, defaultFilters } home-list analyses
//   cordTemplate     — the live-uploaded cord-pH template { id, name, description, defaultFilters }
//   catalog          — array of { category, templates:[{ id, category, fileName, submissionDeadline?, name, description, columns:[] }] }
//   columns          — { cordAll, cordNicu, chest, npda } column descriptors [{ key, header, width }] (header translatable)
//   records          — { cord, chest, npda } the WHOLE record objects (human text translatable; numbers/dates/codes/ids/types not)
//   codeMaps         — { sex, ethnicity, diabetesType, insulinRegime, cgm, yesNo, smoking, retinal, admissionDka, adhdAsd, yesNo99, leavingReason, otherMed, albuminuriaStage, thyroidTx, mentalHealthAppt, dkaTherapy } — code→label maps (labels translatable; keys/codes not)
//   labels           — short value labels (N/A, Not recorded, Unavailable, …)
//   explain          — namespace of FUNCTIONS returning the right-panel explanation strings (preserve ${…} interpolation)
//   blockedReason    — the blocked-cell reason_detail (CPH009 age-at-discharge)
//   timeline         — { activities, tools, thinks, summaryWords, email parsing } headline/detail/think strings keyed sensibly
//   email            — mockSampleEmail body

const blankFilters = () => ({ dateFrom: "", dateTo: "", hospitals: "", cohort: "" });

// --- Databases (README §6.2) ------------------------------------------------
const databases = [
  { id: "patient-notes-db", name: "Patient notes", status: "ready" },
  { id: "lab-results-db", name: "Lab results", status: "ready" },
  { id: "radiology-db", name: "Radiology database", status: "ready" },
];

const ehrDatabaseName = "EHR database";

// --- Pre-loaded analyses (home list) ----------------------------------------
const analyses = [
  { id: "sentinel-stroke", name: "Sentinel Stroke", description: "Door-to-needle times, imaging and outcomes for sentinel stroke admissions.", defaultFilters: blankFilters() },
  { id: "paediatric-diabetes", name: "Paediatric Diabetes", description: "New paediatric type 1 presentations, DKA severity and follow-up.", defaultFilters: blankFilters() },
  { id: "emergency-laparotomy", name: "Emergency Laparotomy", description: "Risk assessment, time to theatre and outcomes for emergency laparotomies.", defaultFilters: blankFilters() },
  { id: "heart-failure", name: "Heart Failure", description: "Heart-failure admissions: ejection fraction, treatment and readmission.", defaultFilters: blankFilters() },
  { id: "early-inflammatory-autoimmune", name: "Early Inflammatory Autoimmune Diseases", description: "Time to diagnosis and treatment for early inflammatory autoimmune disease.", defaultFilters: blankFilters() },
];

// The cord-pH template the user uploads live (Flow A).
const cordTemplate = {
  id: "cord-ph-audit",
  name: "Cord pH at Birth Audit",
  description: "Cord blood gas, resuscitation and documentation quality at birth.",
  defaultFilters: blankFilters(),
};

// --- Template catalog (translatable: category, name, description, columns) ---
// KEEP id, fileName, submissionDeadline unchanged.
const catalog = [
  {
    category: "National audits",
    templates: [
      {
        id: "nnap-national",
        name: "Neonatal care",
        category: "National audits",
        fileName: "nnap-audit.xlsx",
        description:
          "National Neonatal Audit Programme — admissions, respiratory support and outcomes for babies admitted to neonatal units.",
        columns: [
          "NHS number",
          "Gestation (weeks)",
          "Birth weight (grams)",
          "Admission temperature",
          "Antenatal steroids",
          "Magnesium sulphate given",
          "Respiratory support type",
          "Days on respiratory support",
          "ROP screening done",
          "Breast milk at discharge",
          "Survival to discharge",
        ],
      },
      {
        id: "nhfd-national",
        name: "Hip fracture",
        category: "National audits",
        fileName: "nhfd-audit.xlsx",
        description:
          "National Hip Fracture Database — care quality and outcomes for patients admitted with a fragility hip fracture.",
        columns: [
          "NHS number",
          "Age",
          "Sex",
          "Fracture type",
          "Time to surgery (hours)",
          "Surgery type",
          "Pre-op cognitive assessment",
          "Pressure ulcer status",
          "Bone protection medication",
          "Mobilised day 1",
          "30-day mortality",
        ],
      },
      {
        id: "minap-national",
        name: "Heart attack",
        category: "National audits",
        fileName: "minap-audit.xlsx",
        description:
          "Myocardial Ischaemia National Audit Project — management and outcomes for patients admitted with acute coronary syndrome.",
        columns: [
          "NHS number",
          "Age",
          "Admission diagnosis",
          "Time of symptom onset",
          "Time of admission",
          "ECG result",
          "Troponin result",
          "Reperfusion treatment",
          "Door-to-balloon time (mins)",
          "Discharged on statin",
          "Discharged on dual antiplatelet",
        ],
      },
      {
        id: "npda-lo-audit",
        name: "Paediatric diabetes",
        category: "National audits",
        fileName: "npda-diabetes-audit.xlsx",
        submissionDeadline: "2026-07-20",
        description:
          "National Paediatric Diabetes Audit — annual review of children and young people with diabetes: HbA1c, the key care processes, surveillance screening and psychological support.",
        columns: [
          // Full NPDA 2026 core dataset — all 59 data items, in dataset order.
          "NHS number",
          "Date of birth",
          "Postcode of usual address",
          "Sex assigned at birth",
          "Ethnic category",
          "ADHD / ASD diagnosis",
          "Learning disability",
          "Diabetes type",
          "Date of diagnosis",
          "Date of leaving service",
          "Reason for leaving service",
          "Death date",
          "GP practice code",
          "PDU number",
          "Visit/appointment date",
          "Height (cm)",
          "Weight (kg)",
          "Obs date (height/weight)",
          "HbA1c (mmol/mol)",
          "Obs date (HbA1c)",
          "Insulin regime",
          "Other glucose-lowering med",
          "Lifestyle/dietary advice given",
          "CGM in use",
          "Blood ketone testing",
          "Immunotherapy received",
          "Date immunotherapy started",
          "Systolic BP",
          "Diastolic BP",
          "Obs date (BP)",
          "Foot assessment date",
          "Retinal screening date",
          "Retinal screening result",
          "Urinary albumin (ACR)",
          "Obs date (ACR)",
          "Albuminuria stage",
          "Total cholesterol (mmol/l)",
          "Obs date (cholesterol)",
          "Obs date (thyroid function)",
          "Thyroid treatment",
          "Obs date (coeliac screening)",
          "Gluten-free diet",
          "Smokes / vapes",
          "Smoking cessation advice date",
          "Influenza immunisation date",
          "Sick-day rules advice date",
          "Psychological screening date",
          "Additional psychological support needed",
          "Mental health appointment offered",
          "Level 3 carb counting date",
          "Additional dietitian appointment offered",
          "Dietitian appointment date",
          "Admission start date",
          "Admission discharge date",
          "Reason for admission",
          "Reason for admission (other)",
          "DKA therapies given",
          "Initial pH at admission",
          "Initial bicarbonate (mmol/l)",
        ],
      },
    ],
  },
  {
    category: "Regional audits",
    templates: [
      {
        id: "cord-ph-lo-audit",
        name: "Cord pH (regional)",
        category: "Regional audits",
        fileName: "cord-ph-lo-audit.xlsx",
        submissionDeadline: "2026-06-12",
        description:
          "Regional cord blood gas sampling audit — neonatal outcomes and adherence to regional guidelines for fetal acidosis and cord gas sampling.",
        columns: [
          "Patient code",
          "Gestation (weeks)",
          "Gestation (days)",
          "Maternal age",
          "Parity",
          "CTG done",
          "Chorioamnionitis",
          "Delivery",
          "Birth weight (grams)",
          "Apgars 5",
          "Delayed cord clamping",
          "Cord arterial pH",
          "Cord arterial BE",
          "Cord arterial lactate",
          "Intubated at delivery",
          "Admitted to NICU",
          "Regional guideline for cord gas sampling available",
        ],
      },
    ],
  },
  {
    category: "Local audits",
    templates: [
      {
        id: "acute-sore-throat-audit",
        name: "Acute sore throat (local)",
        category: "Local audits",
        fileName: "acute-sore-throat-audit.xlsx",
        description:
          "Local acute sore throat audit — FeverPAIN/Centor scoring and adherence to antibiotic prescribing guidance.",
        columns: [
          "Patient code",
          "Age",
          "Sex",
          "Presenting complaint",
          "FeverPAIN score",
          "Centor score",
          "Throat swab taken",
          "Antibiotic prescribed",
          "Antibiotic agent",
          "Delayed prescription",
          "Re-attendance within 28 days",
        ],
      },
      {
        id: "chest-pain-audit",
        name: "Chest pain (local)",
        category: "Local audits",
        fileName: "chest-pain-audit.xlsx",
        description:
          "Local chest pain audit — triage, troponin testing and risk-stratified disposition for patients presenting with chest pain.",
        columns: [
          "Patient code",
          "Age",
          "Sex",
          "Triage category",
          "Time to ECG (mins)",
          "ECG result",
          "Troponin result",
          "HEART score",
          "Disposition",
          "Cardiology referral",
          "Re-attendance within 30 days",
        ],
      },
    ],
  },
];

// --- Column descriptors (header translatable; key/width are logic) -----------
const columns = {
  cordAll: [
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
  ],
  cordNicu: [
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
  ],
  chest: [
    { key: "patient", header: "Patient", width: 10 },
    { key: "age", header: "Age", width: 8 },
    { key: "complaint", header: "Presenting complaint", width: 26 },
    { key: "troponin", header: "Troponin (ng/L)", width: 16 },
    { key: "ecg", header: "ECG findings", width: 24 },
    { key: "timeToEcg", header: "Time to ECG (min)", width: 18 },
    { key: "diagnosis", header: "Diagnosis", width: 22 },
    { key: "decision", header: "Discharge/Admit decision", width: 24 },
  ],
  npda: [
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
  ],
};

// --- Records: Cord pH (Flow A) ----------------------------------------------
// Records are kept WHOLE so the shape mirrors the originals: translate the human
// text (notes[].role/.text, i.*.v, i.*.e[], n.*.v/.e[]/.explanation, phEvidence)
// but leave numbers, dates (YYYY-MM-DD), codes, ids and the type/baby/code keys.
const cord = {
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

// --- Records: Chest Pain (Flow B) -------------------------------------------
const chest = {
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

// --- Records: NPDA paediatric diabetes (Flow C) -----------------------------
const npda = {
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

// --- Code-map labels (codes/keys are logic; only labels/values translatable) -
// ethnicity/diabetesType/insulinRegime/cgm/smoking/retinal/admissionDka are keyed
// by the English lookup key (also a record value) — keep the KEYS; translate only
// `label`. The code→label maps (adhdAsd, yesNo99, …) are keyed by numeric code —
// keep the codes; translate the string values.
const codeMaps = {
  // item 4 — Sex assigned at birth. Keys are the record's r.sex lookup values
  // (keep English); `label` is the displayed/evidence wording (translatable).
  sex: {
    Male: { code: 1, label: "Male" },
    Female: { code: 2, label: "Female" },
    "Not specified": { code: 3, label: "Not specified" },
    Unknown: { code: 99, label: "Unknown" },
  },
  // item 5 — Ethnic category. `label` is the exact NPDA wording shown as evidence.
  ethnicity: {
    "White British": { code: "A", label: "White - British" },
    "White — Other": { code: "C", label: "White - Any other White background" },
    "Mixed — White and Black Caribbean": { code: "D", label: "Mixed - White and Black Caribbean" },
    "Asian — Indian": { code: "H", label: "Asian - Indian" },
    "Asian — Pakistani": { code: "J", label: "Asian - Pakistani" },
    "Asian — Bangladeshi": { code: "K", label: "Asian - Bangladeshi" },
    "Black Caribbean": { code: "M", label: "Black - Caribbean" },
    "Black African": { code: "N", label: "Black - African" },
  },
  // item 8 — Diabetes Type.
  diabetesType: {
    "Type 1": { code: 1, label: "Type 1 Diabetes Mellitus" },
    "Type 2": { code: 2, label: "Type 2 Diabetes Mellitus" },
  },
  // item 21 — Insulin regime at time of visit.
  insulinRegime: {
    "Insulin pump (CSII)": { code: 4, label: "a standalone insulin pump" },
    "MDI (basal-bolus)": { code: 3, label: "a multiple daily injection basal-bolus regimen (four or more injections a day)" },
    "Diet and metformin (no insulin)": { code: 1, label: "no insulin (managed on diet and metformin)" },
  },
  // item 24 — CGM in use.
  cgm: {
    Yes: { code: 1, label: "using a continuous glucose monitor" },
    No: { code: 2, label: "not using a continuous glucose monitor" },
  },
  // 1 = Yes, 2 = No, 99 = Unknown — items 23, 48, 51 (labels not displayed).
  yesNo: { Yes: 1, No: 2, Unknown: 99 },
  // item 43 — Does the patient smoke and/or vape?
  smoking: {
    No: { code: 1, label: "a non-smoker and non-vaper" },
    Smokes: { code: 2, label: "a current smoker (non-vaper)" },
    Vapes: { code: 3, label: "a current vaper (non-smoker)" },
  },
  // item 33 — Retinal screening result.
  retinal: {
    "No retinopathy": { code: 1, label: "Normal" },
    "Background retinopathy": { code: 2, label: "Abnormal (background retinopathy)" },
  },
  // item 55 — Reason for admission. Every modelled admission is acute DKA (= 1).
  admissionDka: { code: 1, label: "an acute admission with diabetic ketoacidosis (DKA)" },
  // --- code→label maps keyed by the permitted-value code ---
  // item 6 — ADHD / ASD diagnosis.
  adhdAsd: { 1: "Yes, ADHD", 2: "Yes, ASD", 3: "Yes, both ADHD and ASD", 4: "No, neither", 99: "Unknown" },
  // item 7 — Learning disability. Also items 25, 26, 42 (Yes/No/Unknown).
  yesNo99: { 1: "Yes", 2: "No", 99: "Unknown" },
  // item 11 — Reason for leaving service.
  leavingReason: { 1: "Transitioned to adult diabetes service", 2: "Moved out of area", 3: "Other" },
  // item 22 — Other (non-insulin) blood-glucose-lowering medication.
  otherMed: { 1: "No medication", 2: "Metformin only", 3: "GLP-1 agonist", 4: "SGLT2 inhibitor", 5: "Other", 99: "Unknown" },
  // item 36 — Albuminuria stage.
  albuminuriaStage: { 1: "Normoalbuminuria", 2: "Microalbuminuria", 3: "Macroalbuminuria", 99: "Unknown" },
  // item 40 — Thyroid treatment.
  thyroidTx: { 1: "No thyroid therapy", 2: "Thyroxine for hypothyroidism", 3: "Antithyroid medication for hyperthyroidism", 99: "Unknown" },
  // item 49 — Mental health appointment offered.
  mentalHealthAppt: { 1: "Offered and attended", 2: "Offered and did not attend", 3: "Offered and declined", 4: "Not offered", 5: "Mental health support accessed elsewhere", 99: "Unknown" },
  // item 57 — DKA therapies given during the admission.
  dkaTherapy: { 1: "Hypertonic saline", 2: "Mannitol", 3: "Bicarbonate infusion", 4: "None of the above" },
};

// --- Short inline value labels ----------------------------------------------
const labels = {
  na: "N/A",
  notRecorded: "Not recorded",
  unavailable: "Unavailable",
  notNormalised: "Not normalised",
  naTransferred: "N/A (transferred)",
  notDone: "Not done",
  notPerformed: "Not performed",
  // Displayed cord Yes/No cell values. These are ALSO matched in mockData.js
  // logic (e.g. r.ctgDone === labels.yes), so a translation MUST use the same
  // word for the cord record Yes/No values and for these labels.
  yes: "Yes",
  no: "No",
};

// --- Right-panel explanation strings (FUNCTIONS; preserve ${…}) -------------
// Each function takes the args it interpolates and returns the user-visible
// explanation. Keyed by builder + field; translate the returned strings, keeping
// the interpolated values (codes, dates, patient codes) in place.
const explain = {
  // gasCell
  gasUnavailable: (code) => `From the obstetric birth-summary note for ${code} — the arterial cord sample clotted, so no valid cord gas was recorded.`,
  gasLactateNotRecorded: (code) => `The cord-gas panel for ${code} did not include a lactate value.`,
  gasPanel: (code) => `From the EHR cord-gas panel for ${code} — umbilical artery pH, base excess and lactate.`,
  // repeatGasField
  repeatGasNone: (code, label) => `No repeat cord gas was performed for ${code} — the initial gas did not warrant one — so ${label} is not recorded.`,
  repeatGasNotNormalised: (code, label) => `The cord lactate for ${code} had not normalised before transfer, so ${label} is not recorded.`,
  repeatGasValue: (code, label) => `From the repeat cord-gas record for ${code} — ${label}.`,
  // repeatGasField labels (the `label` arg passed into the three above)
  repeatGasLabelAge: "the age in hours at the repeat gas",
  repeatGasLabelLactate: "the repeat lactate",
  repeatGasLabelNormalised: "the age in hours at which the gas normalised",

  // makeCordAllCell
  cordPatient: (code) => `The patient code identifying ${code} in the EHR.`,
  cordGestWeeks: (code) => `From the EHR birth record for ${code} — gestation in completed weeks.`,
  cordGestDays: (code) => `From the EHR birth record for ${code} — gestation days beyond completed weeks.`,
  cordMaternalAge: (code) => `From the EHR demographics for ${code} — maternal age at delivery.`,
  cordParity: (code) => `From the EHR demographics for ${code} — maternal parity.`,
  cordFoetalMovements: (code) => `From the antenatal note for ${code} — reported fetal movements.`,
  cordMaternalComorbidities: (code) => `From the antenatal note for ${code} — documented maternal comorbidities.`,
  cordMaternalComorbiditiesOther: (code) => `From the antenatal note for ${code} — any other maternal history of note.`,
  cordNormalScans: (code) => `From the antenatal scan record for ${code} — whether growth scans were normal.`,
  cordNormalDopplers: (code) => `From the antenatal scan record for ${code} — whether umbilical artery dopplers were normal.`,
  cordCtgDoneYes: (code) => `From the intrapartum record for ${code} — continuous CTG was performed.`,
  cordCtgDoneNo: (code) => `From the intrapartum record for ${code} — labour monitored with intermittent auscultation; no continuous CTG performed.`,
  cordLiquorMeconium: (code) => `From the birth-summary note for ${code} — the state of the liquor.`,
  cordChorioamnionitis: (code) => `From the birth-summary note for ${code} — any chorioamnionitis.`,
  cordProm: (code) => `From the antenatal note for ${code} — prolonged rupture of membranes over 18 hours.`,
  cordRffs: (code) => `From the antenatal note for ${code} — risk factors for sepsis.`,
  cordSentinelEvent: (code) => `From the birth-summary note for ${code} — any sentinel intrapartum event.`,
  cordDelivery: (code) => `From the EHR birth record for ${code} — mode of delivery.`,
  cordBirthWeight: (code) => `From the EHR birth record for ${code} — birth weight in grams.`,
  cordApgar1: (code) => `From the EHR birth record for ${code} — Apgar score at one minute.`,
  cordApgar5: (code) => `From the EHR birth record for ${code} — Apgar score at five minutes.`,
  cordApgar10: (code) => `From the EHR birth record for ${code} — Apgar score at ten minutes.`,
  cordDccYes: (code) => `From the obstetric birth-summary and the midwife delivery note for ${code} — both record delayed cord clamping, so it is documented as performed.`,
  cordDccNo: (code) => `From the obstetric birth-summary and the midwife delivery note for ${code} — both record the cord clamped early, so delayed clamping was not performed.`,
  cordIntubated: (code) => `From the resuscitation record for ${code} — whether the baby was intubated at delivery.`,
  cordCompressions: (code) => `From the resuscitation record for ${code} — whether cardiac compressions were given.`,
  cordDrugs: (code) => `From the resuscitation record for ${code} — any resuscitation drugs given.`,
  cordWard: (code) => `From the EHR encounter for ${code} — the ward at the time of the audit.`,
  cordGasRepeatedYes: (code) => `A repeat cord/neonatal gas was performed for ${code}.`,
  cordGasRepeatedNo: (code) => `No repeat cord/neonatal gas was performed for ${code}.`,
  cordHypoglycaemia: (code) => `From the newborn metabolic note for ${code} — any hypoglycaemia.`,
  cordAdmittedNicu: (code) => `From the NICU admissions table for ${code} — whether the baby was admitted to the neonatal unit.`,
  cordAgeDischargeHomeTransferred: (code) => `${code} was transferred to the regional centre and not discharged home from this unit, so age at discharge home is not recorded here.`,
  cordAgeDischargeHome: (code) => `From the discharge record for ${code} — age in days at discharge home.`,
  cordUnitQuestionnaire: () => `From the unit-level audit governance record — whether the unit-level questionnaire was filled.`,
  cordGuidelineCordGas: () => `From the unit-level audit governance record — whether a local guideline for cord gas sampling is available.`,
  cordGuidelineFetalAcidosis: () => `From the unit-level audit governance record — whether a local guideline for fetal acidosis is available.`,

  // makeCordNicuCell
  nicuAdmitAge: (code) => `From the NICU admission record for ${code} — age in hours at admission to the neonatal unit.`,
  nicuCooled: (code) => `From the NICU admission note for ${code} — whether therapeutic cooling was given.`,
  nicuAgeCoolingNA: (code) => `From the NICU admission note for ${code} — therapeutic cooling was not indicated, so there is no age at cooling.`,
  nicuAgeCooling: (code) => `From the NICU admission note for ${code} — age in hours at which therapeutic cooling started.`,
  nicuTransferredOut: (code) => `From the NICU admission record for ${code} — whether the baby was transferred to another unit.`,
  // cfm explanation comes from the record (n.cfm.explanation), no function needed.
  nicuSeizures: (code) => `From the neurology report for ${code} — whether any seizures were recorded.`,
  nicuClinicalSeizures: (code) => `From the neurology report for ${code} — whether clinical seizures were observed.`,
  nicuElectrographicSeizure: (code) => `From the neurology report for ${code} — whether electrographic seizures were recorded.`,
  nicuMriInjury: (code) => `From the neurology report for ${code} — MRI findings of injury.`,
  nicuDurationNicu: (code) => `From the NICU admission record for ${code} — duration of admission in days.`,
  nicuAgeDischargeHomeTransferred: (code) => `${code} was transferred to another unit and not discharged home from here, so age at discharge home is not recorded.`,
  nicuAgeDischargeHome: (code) => `From the NICU discharge record for ${code} — age in days at discharge home.`,
  nicuFeeding: (code) => `From the NICU discharge summary for ${code} — feeding method at discharge.`,
  nicuAbnormalNeurology: (code) => `From the NICU discharge summary for ${code} — whether neurology was abnormal at discharge.`,

  // makeChestPainCell
  chestAge: (code) => `From the EHR encounter record for ${code} — age at attendance.`,
  chestComplaint: (code) => `From the triage note for ${code} — the presenting complaint recorded at triage.`,
  chestTroponinUnavailable: (code) => `From the laboratory note for ${code} — the blood sample haemolysed, so no troponin result is available.`,
  chestTroponin: (code) => `From the EHR troponin result for ${code} — first high-sensitivity troponin in ng/L.`,
  chestEcgMissing: () => "No ECG was performed during this attendance, so no findings are recorded.",
  chestEcg: (code) => `From the cardiology note for ${code} — the documented ECG findings.`,
  chestTimeToEcgMissing: () => "No ECG was performed during this attendance, so there is no time to first ECG.",
  chestTimeToEcg: (code) => `From the EHR ECG record for ${code} — minutes from arrival to first ECG.`,
  chestDiagnosis: (code) => `From the cardiology and discharge-summary notes for ${code} — the working diagnosis on review.`,
  chestDecision: (code) => `From the discharge-summary note for ${code} — the discharge or admit decision.`,

  // makeNpdaCell
  npdaPatient: (code) => `From the EHR demographics for ${code} — the patient's 10-digit NHS number.`,
  npdaDob: (code) => `From the EHR demographics for ${code} — date of birth, formatted DD/MM/YYYY.`,
  npdaSex: (code, sex, sexCode) => `From the EHR demographics for ${code} — sex assigned at birth recorded as ${sex}, coded ${sexCode} per the NPDA dataset (1 = Male, 2 = Female).`,
  npdaEthnicity: (code, label, ethCode) => `From the EHR demographics for ${code} — ethnic category recorded as '${label}', coded ${ethCode} per the NPDA ethnic-category list.`,
  npdaDiabetesType: (code, label, dtCode) => `From the EHR diabetes diagnosis record for ${code} — ${label}, coded ${dtCode} per the NPDA dataset.`,
  npdaDiagnosisDate: (code) => `From the EHR diabetes diagnosis record for ${code} — date of diagnosis, formatted DD/MM/YYYY.`,
  npdaVisitDate: (code) => `From the EHR clinic observation panel for ${code} — visit/appointment date, formatted DD/MM/YYYY.`,
  npdaHeight: (code) => `From the EHR clinic observation panel for ${code} — height in cm (NPDA format 999.9).`,
  npdaWeight: (code) => `From the EHR clinic observation panel for ${code} — weight in kg (NPDA format 999.9).`,
  npdaHba1c: (code, value) => `From the EHR clinic observation panel for ${code} — HbA1c of ${value} (NPDA format 999.9); a value between 20 and 195 is treated as mmol/mol per the NPDA dataset.`,
  npdaInsulinRegime: (code, label, mCode) => `From the diabetes clinic note for ${code} — ${label}, coded ${mCode} per the NPDA insulin-regime values.`,
  npdaCgm: (code, label, mCode) => `From the diabetes clinic note for ${code} — ${label}, coded ${mCode} (1 = Yes, 2 = No).`,
  npdaLifestyle: (code, recommended, mCode) => `From the diabetes clinic note for ${code} — lifestyle and dietary modification was ${recommended ? "recommended" : "not recommended"}, coded ${mCode} (1 = Yes, 2 = No).`,
  npdaSystolic: (code) => `From the EHR clinic observation panel for ${code} — systolic blood pressure in mmHg (NPDA format 999).`,
  npdaDiastolic: (code) => `From the EHR clinic observation panel for ${code} — diastolic blood pressure in mmHg (NPDA format 999).`,
  npdaCholesterol: (code) => `From the EHR clinic observation panel for ${code} — total cholesterol in mmol/l (NPDA format 99.9).`,
  npdaAcrNotDone: (code) => `Urinary albumin (ACR) was not performed for ${code} at this visit, so no value is recorded.`,
  npdaAcr: (code) => `From the EHR clinic observation panel for ${code} — urinary albumin:creatinine ratio (ACR) in mg/mmol (NPDA format 9999.9).`,
  npdaFootDateNotDue: (code) => `Foot assessment is a mandatory care process from age 12; ${code} is younger, so none was performed and the date is left blank.`,
  npdaFootDate: (code) => `From the diabetes screening record for ${code} — foot assessment date, formatted DD/MM/YYYY.`,
  npdaRetinalDateNotDue: (code) => `Retinal screening is a mandatory care process from age 12; ${code} is younger, so none was performed and the date is left blank.`,
  npdaRetinalDate: (code) => `From the diabetes screening record for ${code} — retinal screening date, formatted DD/MM/YYYY.`,
  npdaRetinalResultNone: (code) => `No retinal screening was performed for ${code} (under 12), so there is no result to code.`,
  npdaRetinalResult: (code, label, mCode) => `From the diabetes screening record for ${code} — retinal screening result was ${label}, coded ${mCode} (1 = Normal, 2 = Abnormal).`,
  npdaPsychScreen: (code) => `From the diabetes screening record for ${code} — date of the annual psychological screening assessment, formatted DD/MM/YYYY.`,
  npdaPsychOutcome: (code, required, mCode) => `From the psychology screening note for ${code} — additional psychological support outside routine care was ${required ? "required" : "not required"}, coded ${mCode} (1 = Yes, 2 = No).`,
  npdaSmoking: (code, label, mCode) => `From the annual review note for ${code} — ${label}, coded ${mCode} per the NPDA smoking/vaping values.`,
  npdaDietitian: (code, offered, mCode) => `From the diabetes clinic note for ${code} — an additional paediatric dietitian appointment was ${offered ? "offered" : "not offered"}, coded ${mCode} (1 = Yes, 2 = No).`,
  npdaCarbCountingNA: (code) => `Level 3 carbohydrate counting applies to patients on injections or a pump; ${code} is managed on diet and metformin, so it is not applicable and the date is left blank.`,
  npdaCarbCounting: (code) => `From the diabetes education record for ${code} — date level 3 carbohydrate counting education was received, formatted DD/MM/YYYY.`,
  npdaAdmissionReasonDka: (code, label, dkaCode) => `From the admission note for ${code} — ${label}, coded ${dkaCode} per the NPDA reason-for-admission values (1 = Acute DKA).`,
  npdaAdmissionReasonNone: (code) => `No diabetes-related hospital admission was recorded for ${code} during the audit year, so there is no reason-for-admission code.`,
  npdaPostcode: (code) => `From the EHR demographics for ${code} — usual-address postcode in upper case with the correct spacing.`,
  npdaAdhdAsd: (code, label, adhdCode) => `From the EHR demographics for ${code} — ${label}, coded ${adhdCode} per the NPDA ADHD/ASD values.`,
  npdaLearningDisability: (code, label, ldCode) => `From the EHR demographics for ${code} — learning disability ${label}, coded ${ldCode} (1 = Yes, 2 = No).`,
  npdaLeavingDateNone: (code) => `${code} remained under the paediatric diabetes service throughout the audit year, so no leaving date is recorded.`,
  npdaLeavingDate: (code) => `From the EHR demographics for ${code} — date the patient left the service, formatted DD/MM/YYYY.`,
  npdaLeavingReasonNone: (code) => `${code} did not leave the service during the audit year, so there is no reason-for-leaving code.`,
  npdaLeavingReason: (code, label, lrCode) => `From the EHR demographics for ${code} — ${label}, coded ${lrCode} per the NPDA reason-for-leaving values.`,
  npdaDeathDate: (code) => `No death was recorded for ${code} during the audit year, so the death date is left blank.`,
  npdaGpPractice: (code) => `From the EHR demographics for ${code} — registered GP practice code (NPDA format X99999).`,
  npdaPduNumber: (code) => `From the unit registration for ${code} — the paediatric diabetes unit (PDU) number, a 3-digit code shared by every child seen at this unit.`,
  npdaObsDateHtWt: (code) => `From the EHR clinic observation panel for ${code} — combined height/weight observation date (taken at the clinic visit), formatted DD/MM/YYYY.`,
  npdaObsDateHba1c: (code) => `From the EHR clinic observation panel for ${code} — date the HbA1c was performed (within the audit year), formatted DD/MM/YYYY.`,
  npdaOtherMed: (code, label, omCode) => `From the EHR medication record for ${code} — ${label}, coded ${omCode} per the NPDA non-insulin medication values.`,
  npdaKetoneTesting: (code, label, ktCode) => `From the diabetes screening record for ${code} — using or trained to use blood-ketone testing equipment: ${label}, coded ${ktCode} (1 = Yes, 2 = No).`,
  npdaImmunotherapyNA: (code) => `The immunotherapy item is completed only for patients newly diagnosed with type 1 diabetes within the audit year; ${code} does not qualify, so it is left blank.`,
  npdaImmunotherapy: (code, label, imCode) => `From the diabetes diagnosis record for ${code} — immunotherapy around the stage-3 type 1 diagnosis: ${label}, coded ${imCode} (1 = Yes, 2 = No).`,
  npdaImmunotherapyDateNone: (code) => `No immunotherapy was given to ${code}, so there is no start date to record.`,
  npdaImmunotherapyDate: (code) => `From the diabetes diagnosis record for ${code} — date immunotherapy started, formatted DD/MM/YYYY.`,
  npdaObsDateBP: (code) => `From the EHR clinic observation panel for ${code} — blood-pressure observation date (taken at the clinic visit), formatted DD/MM/YYYY.`,
  npdaObsDateAcrNone: (code) => `Urinary albumin (ACR) was not performed for ${code} at this visit, so there is no observation date.`,
  npdaObsDateAcr: (code) => `From the EHR clinic observation panel for ${code} — date the urinary ACR was performed, formatted DD/MM/YYYY.`,
  npdaAlbuminuriaStageNone: (code) => `No urinary ACR was measured for ${code}, so the albuminuria stage cannot be coded.`,
  npdaAlbuminuriaStage: (code, acrValue, label, alCode) => `Interpreted from the urinary ACR of ${acrValue} mg/mmol for ${code} — ${label}, coded ${alCode} (an ACR below 3 mg/mmol is normoalbuminuria).`,
  npdaObsDateChol: (code) => `From the EHR clinic observation panel for ${code} — date the total cholesterol was performed, formatted DD/MM/YYYY.`,
  npdaThyroidDateNA: (code) => `Annual thyroid-function monitoring is a type 1 diabetes care process; ${code} has type 2 diabetes, so no thyroid observation date is recorded.`,
  npdaThyroidDate: (code) => `From the diabetes screening record for ${code} — date of annual thyroid-function testing, formatted DD/MM/YYYY.`,
  npdaThyroidTreatmentNA: (code) => `Thyroid treatment is recorded alongside the type 1 annual thyroid check; ${code} has type 2 diabetes, so it is left blank.`,
  npdaThyroidTreatment: (code, label, ttCode) => `From the diabetes screening record for ${code} — ${label}, coded ${ttCode} per the NPDA thyroid-treatment values.`,
  npdaCoeliacDateNA: (code) => `Coeliac-disease screening date is recorded only for patients diagnosed within the audit year; ${code} was diagnosed earlier, so it is left blank.`,
  npdaCoeliacDate: (code) => `From the diabetes screening record for ${code} — date of coeliac-disease serological screening, formatted DD/MM/YYYY.`,
  npdaGlutenFree: (code, label, gfCode) => `From the diabetes screening record for ${code} — recommended/prescribed a gluten-free diet: ${label}, coded ${gfCode} (a 'Yes' is interpreted as a diagnosis of coeliac disease).`,
  npdaSmokingCessationDateNone: (code) => `${code} is not a current smoker or vaper, so no smoking-cessation advice was due and the date is left blank.`,
  npdaSmokingCessationDate: (code) => `From the diabetes screening record for ${code} — date smoking-cessation advice/referral was offered, formatted DD/MM/YYYY.`,
  npdaFluDateNone: (code) => `No influenza immunisation was recorded for ${code} during the audit year, so this care process is treated as incomplete and the date is left blank.`,
  npdaFluDate: (code) => `From the diabetes screening record for ${code} — date influenza immunisation was recommended, formatted DD/MM/YYYY.`,
  npdaSickDayDate: (code) => `From the diabetes screening record for ${code} — date 'sick-day rules' advice was provided (revisited at the annual review), formatted DD/MM/YYYY.`,
  npdaMentalHealthAppt: (code, label, mhCode) => `From the psychology record for ${code} — ${label}, coded ${mhCode} per the NPDA mental-health-appointment values.`,
  npdaDietitianApptDateNone: (code) => `No additional dietitian appointment was attended by ${code}, so the appointment date is left blank.`,
  npdaDietitianApptDate: (code) => `From the diabetes education record for ${code} — date of the additional paediatric-dietitian appointment, formatted DD/MM/YYYY.`,
  npdaAdmissionStartNone: (code) => `No diabetes-related admission was recorded for ${code} during the audit year, so there is no spell start date.`,
  npdaAdmissionStart: (code) => `From the hospital admission record for ${code} — hospital provider spell start date, formatted DD/MM/YYYY.`,
  npdaAdmissionDischargeNone: (code) => `No diabetes-related admission was recorded for ${code} during the audit year, so there is no discharge date.`,
  npdaAdmissionDischarge: (code) => `From the hospital admission record for ${code} — hospital provider spell discharge date, formatted DD/MM/YYYY.`,
  npdaAdmissionReasonOtherNoAdmission: (code) => `No admission was recorded for ${code}, so there is no free-text reason.`,
  npdaAdmissionReasonOther: (code) => `The free-text reason is mandatory only when 'Other causes' is selected; ${code}'s admission was coded as DKA, so it is left blank.`,
  npdaDkaTherapiesNone: (code) => `No DKA admission was recorded for ${code}, so there are no DKA therapies to record.`,
  npdaDkaTherapies: (code, label, dkaCode) => `From the hospital admission record for ${code} — DKA therapies received: ${label}, coded ${dkaCode} per the NPDA DKA-therapy values.`,
  npdaInitialPhNone: (code) => `No admission blood gas was recorded for ${code}, so there is no initial pH.`,
  npdaInitialPh: (code) => `From the hospital admission record for ${code} — initial (first recorded) pH at admission (NPDA format 0.00).`,
  npdaInitialBicarbNone: (code) => `No admission blood gas was recorded for ${code}, so there is no initial standard bicarbonate.`,
  npdaInitialBicarb: (code) => `From the hospital admission record for ${code} — initial standard bicarbonate at admission in mmol/l (NPDA format 00.0).`,
};

// --- Blocked-cell reason_detail (CPH009 age-at-discharge) --------------------
const blockedReason = {
  cordAgeDischargeHome:
    "CPH009 was transferred out to the regional cooling and neurology centre on day 7 and was never discharged home from this unit, so no age at discharge home is recorded (searched cord_ph_birth_records and the transfer summary).",
};

// --- Timeline strings (headlines, details, think snippets, tool headlines) ---
// KEEP wait/kind/tool name/status in logic. Translate headline/detail/think text
// and the few derived words below. `summaryWords` are the first few words the
// folded activity line shows — handled by shortLabel() in logic, so nothing to
// translate beyond the headlines themselves.
const timeline = {
  // Tool-call headlines (the agent's sql_execute / query_schema lines).
  tools: {
    cordGasPanel: "Read the cord-gas panel",
    inspectedSchema: "Inspected the EHR schema",
    troponinResults: "Read the troponin results",
    cardiometabolicScreen: "Read the cardiometabolic screen",
  },
  // Cord-pH population (timelineA -> cordPhPopulation).
  cord: {
    mapTemplate: { headline: "Mapping the template to the EHR schema…", detail: "Resolving each of the template's columns to a field in the **EHR database** before copying across the structured birth-record values." },
    copyBirthRecord: { headline: "Copying the structured birth-record fields…", detail: "Pulling gestation, maternal age, parity, delivery mode, birth weight and the Apgar scores straight from `cord_ph_birth_records` and `patient_demographics`." },
    antenatalScreening: { headline: "Reading the antenatal screening fields…", detail: "Copying the normal-scan, normal-doppler and CTG flags from the antenatal records." },
    antenatalNotes: { headline: "Reading the antenatal notes…", detail: "Reading each pregnancy's antenatal note for fetal movements, maternal comorbidities, prolonged rupture of membranes and sepsis risk factors." },
    obstetricNotes: { headline: "Reading the obstetric and midwifery notes…", detail: "Combining each obstetrician birth-summary with the matching midwife delivery note to confirm delayed cord clamping, the state of the liquor, chorioamnionitis and any sentinel event." },
    thinkDcc: "CPH002 was a category-1 caesarean with a flat baby — the cord was clamped immediately for resuscitation, so delayed cord clamping reads as \"No\" despite unit policy.",
    resuscitationNotes: { headline: "Reading the resuscitation notes…", detail: "Reading each resuscitation record for intubation, cardiac compressions and any drugs given at delivery." },
    metabolicScreen: { headline: "Checking the newborn metabolic screen…", detail: "Reading the postnatal note for each baby to record any hypoglycaemia." },
    followUp: { headline: "Copying the follow-up and discharge fields…", detail: "Pulling the ward, repeat cord-gas results, NICU admission and discharge timing from the structured record. Where no repeat gas was performed the field is filled with an explicit \"N/A\" rather than left blank." },
    governance: { headline: "Recording the unit-level governance answers…", detail: "Filling the unit-level questionnaire and local-guideline availability columns from the audit governance record." },
    nicuSheet: { headline: "Populating the NICU sheet…", detail: "Switching to the **NICU** sheet to fill the outcomes for the babies admitted to the neonatal unit." },
    coolingCfm: { headline: "Reading the cooling and CFM notes…", detail: "Reading each NICU admission note for therapeutic cooling and reconciling the bedside CFM impression against the formal neurology report. One case disagrees with the structured record; one preterm sepsis admission had no CFM, recorded explicitly." },
    thinkCfm: "**CPH009 — reconciling the CFM conflict.** The bedside CFM note reads a *normal background*, but the formal neurology report records **electrographic seizures** with `basal ganglia and thalamic injury` on MRI. These disagree, so rather than silently picking one source I am flagging this cell as a **conflict** for clinician review:\n\n- Bedside CFM: normal background\n- Formal aEEG: abnormal, electrographic seizures\n- MRI: basal ganglia / thalamic injury\n\nThe formal report is the more authoritative source, but the discrepancy itself is the finding worth surfacing.",
    neurologyReports: { headline: "Reading the neurology reports…", detail: "Reading each formal neurology report for clinical and electrographic seizures and any MRI injury." },
    dischargeSummaries: { headline: "Checking the NICU discharge summaries…", detail: "Reading each NICU discharge summary for feeding method and neurology at discharge." },
    finalizing: { headline: "Finalizing the audit…", detail: "All cells populated and traceable to the EHR record or the source notes across both the ALL and NICU sheets." },
  },
  // Chest-pain population (timelineB -> chestPainPopulation).
  chest: {
    populating: { headline: "Populating from the EHR…", detail: "Filling the chest-pain workbook column by column from the **EHR database** and the triage and cardiology notes." },
    triageNotes: { headline: "Reading the triage notes…", detail: "Reading each attendance's triage note to capture the presenting complaint." },
    ecgResults: { headline: "Reading the ECG results…", detail: "Pulling the documented ECG findings and the time from arrival to first ECG, flagging any attendance with no ECG on record." },
    cardiologyNotes: { headline: "Reviewing the cardiology notes…", detail: "Reading the cardiology review to set the working diagnosis for each patient." },
    dischargeSummaries: { headline: "Checking the discharge summaries…", detail: "Reading each discharge summary to record whether the patient was discharged or admitted." },
    finalizing: { headline: "Finalizing the audit…", detail: "All cells populated and traceable to the EHR record or the source notes." },
  },
  // NPDA population (timelineC -> npdaPopulation).
  npda: {
    mapTemplate: { headline: "Mapping the template to the EHR schema…", detail: "Resolving each NPDA column to a field in the **EHR database** before copying across the structured demographics and diagnosis details." },
    demographics: { headline: "Copying the demographics and diagnosis fields…", detail: "Pulling date of birth, postcode, sex, ethnic category, the ADHD/ASD and learning-disability flags, diabetes type and date of diagnosis straight from `patient_demographics` and `diabetes_diagnoses`." },
    registration: { headline: "Copying the registration and service fields…", detail: "Pulling the date and reason for leaving the service, any death date, the GP practice code, the PDU number and the visit/appointment date. Patients who remained under the service carry an explicit label rather than a blank." },
    clinicMeasurements: { headline: "Copying the clinic measurements…", detail: "Copying height, weight and HbA1c with their observation dates from the structured clinic observation panel." },
    diabetesClinicNotes: { headline: "Reading the diabetes clinic notes…", detail: "Reading each child's diabetes clinic note for the insulin regime, continuous glucose monitor use and the lifestyle and dietary advice given." },
    treatmentFlags: { headline: "Copying the treatment and monitoring flags…", detail: "Pulling any non-insulin glucose-lowering medication, blood-ketone testing, and — for newly diagnosed type 1 patients — whether immunotherapy was received and when." },
    surveillanceScreening: { headline: "Copying the surveillance screening dates…", detail: "Pulling the foot assessment, retinal screening, thyroid, coeliac and carbohydrate-counting fields from the structured record. Where screening is not yet due or not applicable the field is filled with an explicit label rather than left blank." },
    annualReviewNotes: { headline: "Reading the annual review notes…", detail: "Reading each child's annual review note for smoking or vaping status, then recording the smoking-cessation, influenza-immunisation and sick-day-rules care-process dates." },
    psychologyNotes: { headline: "Reading the psychology notes…", detail: "Reading the annual psychological screening outcome for each child, then recording whether a mental-health appointment was offered as part of the diabetes MDT." },
    dieteticAdmissions: { headline: "Checking dietetic input and admissions…", detail: "Reading the diabetes clinic note for any additional dietitian appointment offered, then pulling the carbohydrate-counting and dietitian-appointment dates and the admission record for any diabetes-related admission such as DKA." },
    finalizing: { headline: "Finalizing the audit…", detail: "All cells populated and traceable to the EHR record or the source notes." },
  },
  // Flow openers (timelineA / timelineB / timelineC).
  flowA: {
    reviewingTemplate: { headline: "Reviewing the template…", detail: "Reviewing the **Cord pH (regional)** audit against the **EHR database** and resolving the field mappings across both the ALL and NICU sheets." },
  },
  flowB: {
    readingRequest: { headline: "Reading the request…", detail: "Parsing Dr Alvarez's request: an audit of the adult chest-pain attendances on the **EHR database** for the last quarter." },
    buildingSpreadsheet: { headline: "Building the spreadsheet…", detail: "Designing a chest-pain workbook from the **EHR database** — encounters, troponin and ECG results plus the triage and cardiology notes." },
    addingColumns: { headline: "Adding columns…", detail: "Adding columns: Patient, Age, Presenting complaint, Troponin (ng/L), ECG findings, Time to ECG (min), Diagnosis, Discharge/Admit decision." },
  },
  flowC: {
    reviewingTemplate: { headline: "Reviewing the template…", detail: "Reviewing the **Paediatric diabetes (NPDA)** audit against the **EHR database** and resolving the field mappings." },
  },
  // Folded activity-line label for thinking steps.
  thinkingLabel: "Thinking",
};

// --- Sample doctor's email (Flow B) -----------------------------------------
const email = `Hi team,

For the chest-pain pathway review I need an audit of the adult chest-pain attendances on the EHR database for the last quarter.

For each patient please pull: age, presenting complaint at triage, the first troponin result, the time from arrival to first ECG, and the documented ECG findings. On top of the structured fields, read the triage and cardiology notes and give me the working diagnosis, and whether the patient was discharged or admitted.

Flag any case where a troponin or ECG is missing.

Thanks,
Dr Mark Alvarez
Emergency Medicine`;

export default {
  databases,
  ehrDatabaseName,
  analyses,
  cordTemplate,
  catalog,
  columns,
  records: { cord, chest, npda },
  codeMaps,
  labels,
  explain,
  blockedReason,
  timeline,
  email,
};
