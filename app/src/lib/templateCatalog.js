// templateCatalog.js — the catalog of output templates the contract can target.
//
// A Template names a deliverable Excel workbook and the columns it will be
// populated with. `columns` feeds the hover-preview in OutputSpec; `description`
// is the one-line blurb shown above it. Real local workbooks live under
// docs/templates/*.xlsx; the National entries are plausible invented audits
// (NNAP / NHFD / MINAP) used only for the picker + preview.
//
// Template = { id, name, category, fileName, description, columns: string[] }

export const TEMPLATE_CATALOG = [
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

let runtimeTemplateGroups = null;

// Optional runtime override used by the real-mode Home flow so template
// pickers + resolution can point to backend audits (/api/audits). Mock mode
// leaves this unset and continues to use TEMPLATE_CATALOG.
export function setRuntimeTemplateGroups(groups) {
  runtimeTemplateGroups = Array.isArray(groups) ? groups : null;
}

function activeTemplateGroups() {
  return runtimeTemplateGroups || TEMPLATE_CATALOG;
}

// Flat lookup by template id.
export function getTemplateById(id) {
  for (const group of activeTemplateGroups()) {
    const found = group.templates.find((t) => t.id === id);
    if (found) return found;
  }
  return undefined;
}

// The catalog as-is (grouped by category) — used by the OutputSpec picker.
export function allTemplatesGrouped() {
  return activeTemplateGroups();
}

// Flat list used by template resolution paths that need a single pool.
export function allTemplatesFlat() {
  return activeTemplateGroups().flatMap((group) => group.templates);
}
