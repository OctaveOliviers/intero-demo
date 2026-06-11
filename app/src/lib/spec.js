// spec.js — the front-end mock "preprocessing" layer.
//
// The home screen takes a free-text clinical request and turns it into an
// editable Task Contract: which cohort filters the agent extracted, and which
// output template (Excel) it will populate. This file owns the data model and
// the deterministic mock parsers behind it. No backend calls, no Math.random
// for any value the demo depends on.
//
// ─────────────────────────────────────────────────────────────────────────
// Chip — one editable value in the contract.
//
//   {
//     id: string,          // crypto.randomUUID()
//     kind: 'value' | 'codes' | 'date' | 'database' | 'template',
//     field: string,       // machine key: 'condition' | 'dateFrom' | 'dateTo' |
//                          //   'specialty' | 'ward' | 'admissionMethod' | 'age' |
//                          //   'gestation' | 'nhsNumber' | 'dateOfBirth' |
//                          //   'birthDate' | 'appointmentDate' | 'codes' |
//                          //   'patientList' | 'database' | 'outputTemplate'
//     label: string,       // plain-text label shown BESIDE the pill, e.g. 'Starting date'
//     value: string,       // display value INSIDE the pill, e.g. '3 Jan 2026'
//     raw?: any,           // optional structured backing value, e.g. ISO '2026-01-03'
//     options?: { value, label }[],  // for fixed-option value chips
//     added?: boolean,     // true for chips added via the "+" affordance (drives the count)
//   }
//
// JobSpec — returned by parseRequest.
//
//   {
//     request: string,        // original user text
//     cohort: Chip[],         // ONLY the relevant, prefilled filters (never empty placeholders)
//     output: {
//       summary: string,      // crisp one-liner, e.g. 'Local medical Cord audit'
//       templateChip: Chip,   // kind:'template'; value = template name; raw = templateId
//     },
//     resolvedCount: number,  // health-check N (seeds to the cord row count)
//     countNoun: 'patients' | 'encounters',
//   }
// ─────────────────────────────────────────────────────────────────────────

import { allTemplatesFlat, getTemplateById } from "./templateCatalog.js";
import { isMockMode } from "./mock.js";
import { CORDPH_PATIENT_COUNT, NPDA_PATIENT_COUNT } from "./mockData.js";

// The seed cohort resolves to exactly the number of patient rows the results
// workbook populates, so the contract's "N patients match" health-check equals
// the populated row count. On the scripted demo path no "+" filter is added, so
// base == rows is what matters. The base depends on which audit was matched: the
// diabetes (NPDA) branch resolves to its own row count, every other branch to
// the cord-pH count.
const SEED_COUNT = CORDPH_PATIENT_COUNT;

// Detect the diabetes branch from the resolved cohort (it is the only branch
// that emits an appointment-date criterion), so resolveCohortCount can pick the
// right base without knowing the output template.
function baseCountFor(cohort) {
  const isDiabetes = (cohort || []).some((c) => c.field === "appointmentDate");
  return isDiabetes ? NPDA_PATIENT_COUNT : SEED_COUNT;
}

// Demo "today". Relative dates resolve against this fixed date so the contract
// is reproducible regardless of the wall clock.
const TODAY = new Date("2026-06-03T00:00:00");

// Default audit window for the cord branch: Q2 2026 (1 Apr – 30 Jun 2026). This
// quarter contains every encounter/note date in the Cord-pH dataset.
const CORD_QUARTER = {
  dateFrom: new Date("2026-04-01T00:00:00"),
  dateTo: new Date("2026-06-30T00:00:00"),
};

// The NPDA audit year: appointment dates must fall in 1 Apr 2025 – 31 Mar 2026.
const NPDA_YEAR = {
  dateFrom: new Date("2025-04-01T00:00:00"),
  dateTo: new Date("2026-03-31T00:00:00"),
};

// "Under 25 on the first day of the audit year" as a date-of-birth cut-off:
// born after (1 Apr 2025 − 25 years) = 1 Apr 2000.
const NPDA_DOB_CUTOFF = new Date("2000-04-01T00:00:00");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fmtDate(d) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function chip({ kind, field, label, value, raw, options, connector }) {
  return {
    id: crypto.randomUUID(),
    kind,
    field,
    label,
    value,
    ...(raw !== undefined ? { raw } : {}),
    ...(options ? { options } : {}),
    // `connector` renders a small word (e.g. "and") before this chip when it
    // sits on the same row as the previous one — used for "between X and Y".
    ...(connector ? { connector } : {}),
  };
}

export function defaultDatabaseChipsForMode({ mockDatabases }) {
  if (!mockDatabases) return [];
  return [
    chip({ kind: "database", field: "database", label: "Database", value: "Patient notes", raw: "patient-notes-db" }),
    chip({ kind: "database", field: "database", label: "Database", value: "Lab results", raw: "lab-results-db" }),
  ];
}

const SPECIALTY_OPTIONS = [
  "Neonatology",
  "Obstetrics",
  "Paediatrics",
  "ENT",
  "Cardiology",
  "General Medicine",
  "Emergency Medicine",
].map((s) => ({ value: s, label: s }));

const ADMISSION_OPTIONS = ["Emergency", "Elective", "Transfer", "Day case"].map((s) => ({
  value: s,
  label: s,
}));

// ─────────────────────────────────────────────────────────────────────────
// Date extraction. Handles the phrasings the demo uses: "last 6 months",
// "past 2 years", "since 2025", "in 2024". Returns { dateFrom?, dateTo? } as
// Date objects, or null when no date phrase is present.
// ─────────────────────────────────────────────────────────────────────────
function extractDates(text) {
  const t = text.toLowerCase();

  const rel = t.match(/(?:last|past|previous)\s+(\d+)\s+(day|week|month|year)s?/);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unit = rel[2];
    const d = new Date(TODAY);
    if (unit === "day") d.setDate(d.getDate() - n);
    else if (unit === "week") d.setDate(d.getDate() - n * 7);
    else if (unit === "month") d.setMonth(d.getMonth() - n);
    else if (unit === "year") d.setFullYear(d.getFullYear() - n);
    return { dateFrom: d };
  }

  const since = t.match(/since\s+(\d{4})/);
  if (since) {
    return { dateFrom: new Date(`${since[1]}-01-01T00:00:00`) };
  }

  const inYear = t.match(/\bin\s+(\d{4})\b/);
  if (inYear) {
    const y = inYear[1];
    return {
      dateFrom: new Date(`${y}-01-01T00:00:00`),
      dateTo: new Date(`${y}-12-31T00:00:00`),
    };
  }

  if (/this year/.test(t)) {
    return { dateFrom: new Date(`${TODAY.getFullYear()}-01-01T00:00:00`) };
  }

  return null;
}

// Diagnostic-code phrases like "ICD P21", "SNOMED 199240008", "codes J02, J03".
function extractCodes(text) {
  const m = text.match(/\b(?:icd(?:-10)?|snomed|codes?)\b[:\s]*([A-Z0-9.,\s]+)/i);
  if (!m) return null;
  const codes = (m[1].match(/[A-Z]\d{1,3}(?:\.\d+)?|\d{6,}/gi) || []).slice(0, 6);
  return codes.length ? codes.join(", ") : null;
}

// ─────────────────────────────────────────────────────────────────────────
// parseRequest — the ~3.5s "agent thinking" parse. Deterministic keyword
// match. Emits ONLY the filters actually present in the text (plus the
// always-present database source). Any clinical request yields a credible
// cohort and a Local-audit output.
// ─────────────────────────────────────────────────────────────────────────
export async function parseRequest(text, { templates = null } = {}) {
  await delay(3500);

  const t = (text || "").toLowerCase();
  const cohort = [];
  const templatePool = Array.isArray(templates) && templates.length ? templates : allTemplatesFlat();
  const realMode = !isMockMode("audits");

  // Condition + the template/specialty it implies.
  let templateId = "cord-ph-lo-audit";
  let summary = "Local clinical audit";
  let condition = null;
  let specialty = null;
  let branch = "cord";

  if (/diabet|t1dm|t2dm|\bnpda\b|ketoacidosis|\bdka\b/.test(t)) {
    // Diabetes (NPDA): its inclusion criteria are fixed data-quality rules (see
    // the diabetes block below), so it does not use the generic condition /
    // specialty / ward chips.
    templateId = "npda-lo-audit";
    summary = "Local paediatric diabetes audit (NPDA)";
    branch = "diabetes";
  } else if (/cord|\bph\b|blood gas|acidosis|cord gas/.test(t)) {
    condition = "cord blood gas sampling";
    specialty = "Neonatology";
    templateId = "cord-ph-lo-audit";
    summary = "Local medical Cord audit";
    branch = "cord";
  } else if (/sore throat|tonsill|pharyng|throat/.test(t)) {
    condition = "acute sore throat";
    specialty = "ENT";
    templateId = "acute-sore-throat-audit";
    summary = "Local acute sore throat audit";
    branch = "sore-throat";
  } else if (/chest pain|cardiac|myocard|angina|coronary/.test(t)) {
    condition = "chest pain";
    specialty = "Cardiology";
    templateId = "chest-pain-audit";
    summary = "Local chest pain audit";
    branch = "chest-pain";
  } else if (/neonat|newborn|baby|babies/.test(t)) {
    // generic neonatal request → default to the cord-pH local audit.
    condition = "neonatal admission";
    specialty = "Neonatology";
    templateId = "cord-ph-lo-audit";
    summary = "Local medical Cord audit";
    branch = "cord";
  }

  // Resolve the output template against the active catalog source. In real
  // mode the Home flow points this catalog at backend audits, so `templateId`
  // becomes a backend audit id (never a frontend-only static id).
  const findByName = (fn) => templatePool.find((x) => fn((x.name || "").toLowerCase()));
  let chosen = getTemplateById(templateId);
  if (!chosen) {
    if (branch === "diabetes") {
      chosen = findByName((n) => n.includes("diabet") || n.includes("npda"));
    } else if (branch === "sore-throat") {
      chosen = findByName((n) => n.includes("sore throat") || n.includes("tonsill") || n.includes("pharyng"));
    } else if (branch === "chest-pain") {
      chosen = findByName((n) => n.includes("chest pain") || n.includes("cardiac") || n.includes("heart"));
    } else {
      chosen = findByName((n) => n.includes("cord") || n.includes("neonat"));
    }
  }
  if (!chosen && templatePool.length > 0) {
    chosen = templatePool[0];
  }
  if (!chosen && realMode) {
    throw new Error("No backend audit templates available yet.");
  }
  if (chosen) {
    templateId = chosen.id;
    summary = `${chosen.name.replace(/\s*\((?:local|regional|national)\)\s*$/i, "").trim()} audit`;
  }

  // The cord branch gets a richer, prefilled chip set (the typical filters a
  // real umbilical-cord-pH audit uses): Specialty, Ward, a Gestation inclusion
  // criterion and a default quarter date range — even when the request text
  // doesn't spell them out.
  const isCord = branch === "cord";
  const isDiabetes = branch === "diabetes";

  if (condition) {
    cohort.push(chip({ kind: "value", field: "condition", label: "Condition", value: condition }));
  }

  // Specialty — overridden by an explicit mention if present.
  if (/\bent\b/.test(t)) specialty = "ENT";
  else if (/cardiolog/.test(t)) specialty = "Cardiology";
  else if (/obstetric/.test(t)) specialty = "Obstetrics";
  else if (/paediatric|pediatric/.test(t)) specialty = specialty || "Paediatrics";
  if (specialty && !isDiabetes) {
    cohort.push(
      chip({
        kind: "value",
        field: "specialty",
        label: "Specialty",
        value: specialty,
        options: SPECIALTY_OPTIONS,
      }),
    );
  }

  // Ward / care setting. The cord audit spans the maternity unit (incl. NICU),
  // so default to that when the request doesn't name a ward.
  let ward = null;
  if (/\bnicu\b|neonatal unit|nnu/.test(t)) ward = "NICU";
  else if (/\bed\b|emergency department|a&e|a and e/.test(t)) ward = "Emergency Department";
  else {
    const w = t.match(/ward\s+([a-z0-9]+)/);
    if (w) ward = `Ward ${w[1].toUpperCase()}`;
  }
  if (!ward && isCord) ward = "Maternity unit";
  if (ward && !isDiabetes) {
    cohort.push(chip({ kind: "value", field: "ward", label: "Ward", value: ward }));
  }

  // Admission method.
  let admission = null;
  if (/emergency admission|emergenc/.test(t)) admission = "Emergency";
  else if (/elective/.test(t)) admission = "Elective";
  if (admission) {
    cohort.push(
      chip({
        kind: "value",
        field: "admissionMethod",
        label: "Admission method",
        value: admission,
        options: ADMISSION_OPTIONS,
      }),
    );
  }

  // Age. The cord branch uses a Gestation inclusion criterion instead, so skip
  // the generic Age chip there.
  let age = null;
  if (/neonat|newborn|baby|babies/.test(t)) age = "Neonates";
  else if (/paediatric|pediatric|child/.test(t)) age = "Paediatric";
  else {
    const over = t.match(/over\s+(\d+)/);
    const under = t.match(/under\s+(\d+)/);
    if (over) age = `Over ${over[1]}`;
    else if (under) age = `Under ${under[1]}`;
  }
  if (age && !isCord && !isDiabetes) {
    cohort.push(chip({ kind: "value", field: "age", label: "Age", value: age }));
  }

  // Cord audit: a gestation inclusion criterion (every baby in the dataset is
  // ≥ 34 weeks, so the cohort and the populated rows stay consistent).
  if (isCord) {
    cohort.push(chip({ kind: "value", field: "gestation", label: "Gestation", value: "≥ 34 weeks" }));
  }

  // Diabetes audit (NPDA): the inclusion criteria are the audit's fixed
  // data-quality rules (the "registered PDU" rule is intentionally omitted).
  // A patient is included only with a date of birth after the under-25 cut-off;
  // the appointment-date window is added below.
  if (isDiabetes) {
    cohort.push(
      chip({
        kind: "date",
        field: "dateOfBirth",
        label: "Date of birth after",
        value: fmtDate(NPDA_DOB_CUTOFF),
        raw: isoDate(NPDA_DOB_CUTOFF),
      }),
    );
  }

  // Diagnostic codes.
  const codes = extractCodes(text || "");
  if (codes) {
    cohort.push(chip({ kind: "codes", field: "codes", label: "Codes", value: codes }));
  }

  // Dates. The diabetes branch fixes the appointment-date window to the NPDA
  // audit year and renders it as a single row — "Appointment X to Y" — via two
  // date chips sharing one field, the second carrying a "to" connector. The
  // cord branch defaults to the audit quarter; other branches emit dates only
  // when the request text names them.
  if (isDiabetes) {
    cohort.push(
      chip({
        kind: "date",
        field: "appointmentDate",
        label: "Appointment",
        value: fmtDate(NPDA_YEAR.dateFrom),
        raw: isoDate(NPDA_YEAR.dateFrom),
      }),
      chip({
        kind: "date",
        field: "appointmentDate",
        label: "Appointment",
        value: fmtDate(NPDA_YEAR.dateTo),
        raw: isoDate(NPDA_YEAR.dateTo),
        connector: "to",
      }),
    );
  } else if (isCord) {
    // Cord audit: birth-date window rendered as a single row — "Birth X to Y".
    // Two date chips share one field so they group; the second carries a "to"
    // connector. Any date phrase in the request overrides the default quarter.
    const dates = extractDates(text || "") || CORD_QUARTER;
    if (dates?.dateFrom) {
      cohort.push(
        chip({
          kind: "date",
          field: "birthDate",
          label: "Birth",
          value: fmtDate(dates.dateFrom),
          raw: isoDate(dates.dateFrom),
        }),
      );
    }
    if (dates?.dateTo) {
      cohort.push(
        chip({
          kind: "date",
          field: "birthDate",
          label: "Birth",
          value: fmtDate(dates.dateTo),
          raw: isoDate(dates.dateTo),
          connector: "to",
        }),
      );
    }
  } else {
    const dates = extractDates(text || "");
    if (dates?.dateFrom) {
      cohort.push(
        chip({
          kind: "date",
          field: "dateFrom",
          label: "Starting date",
          value: fmtDate(dates.dateFrom),
          raw: isoDate(dates.dateFrom),
        }),
      );
    }
    if (dates?.dateTo) {
      cohort.push(
        chip({
          kind: "date",
          field: "dateTo",
          label: "End date",
          value: fmtDate(dates.dateTo),
          raw: isoDate(dates.dateTo),
        }),
      );
    }
  }

  // Database sources — the two defaults the agent suggests. The user can add
  // more (e.g. radiology) via the "+" affordance on the row.
  cohort.push(...defaultDatabaseChipsForMode({ mockDatabases: isMockMode("databases") }));

  const template = getTemplateById(templateId);
  const templateChip = chip({
    kind: "template",
    field: "outputTemplate",
    label: "Template",
    value: template ? template.name : "Cord pH (regional)",
    raw: templateId,
  });

  return {
    request: text || "",
    cohort,
    output: { summary, templateChip },
    resolvedCount: isDiabetes ? NPDA_PATIENT_COUNT : SEED_COUNT,
    countNoun: "patients",
  };
}

// ─────────────────────────────────────────────────────────────────────────
// parseAdditionalFilters — the ~1s parse behind the "+" add-filter chip.
// Turns a free-text phrase into one or more new cohort chips. Chips are
// flagged `added: true` so resolveCohortCount can shrink the count.
// ─────────────────────────────────────────────────────────────────────────
export async function parseAdditionalFilters(text) {
  await delay(1000);

  const t = (text || "").toLowerCase();
  const chips = [];
  const add = (c) => chips.push({ ...c, added: true });

  if (/\bmale\b|\bmen\b|\bboys?\b/.test(t)) {
    add(chip({ kind: "value", field: "sex", label: "Sex", value: "Male" }));
  } else if (/\bfemale\b|\bwomen\b|\bgirls?\b/.test(t)) {
    add(chip({ kind: "value", field: "sex", label: "Sex", value: "Female" }));
  }

  const over = t.match(/over\s+(\d+)/);
  const under = t.match(/under\s+(\d+)/);
  if (over) add(chip({ kind: "value", field: "age", label: "Age", value: `Over ${over[1]}` }));
  else if (under) add(chip({ kind: "value", field: "age", label: "Age", value: `Under ${under[1]}` }));

  if (/\bnicu\b|neonatal unit/.test(t)) {
    add(chip({ kind: "value", field: "ward", label: "Ward", value: "NICU" }));
  }

  const dates = extractDates(text || "");
  if (dates?.dateFrom) {
    add(
      chip({
        kind: "date",
        field: "dateFrom",
        label: "Starting date",
        value: fmtDate(dates.dateFrom),
        raw: isoDate(dates.dateFrom),
      }),
    );
  }

  // Fallback: keep the phrase as a single free-text filter so nothing is lost.
  if (chips.length === 0) {
    const trimmed = (text || "").trim();
    add(
      chip({
        kind: "value",
        field: "custom",
        label: "Filter",
        value: trimmed || "custom filter",
      }),
    );
  }

  return chips;
}

// ─────────────────────────────────────────────────────────────────────────
// resolveCohortCount — deterministic health-check count. The seed cohort
// resolves to the base count (the populated row count for the matched audit —
// cord-pH or NPDA); each filter added
// via the "+" affordance shrinks the count by a deterministic 15–30% (derived
// from a hash of the chip, never random).
// ─────────────────────────────────────────────────────────────────────────
export function resolveCohortCount(cohort) {
  let count = baseCountFor(cohort);
  for (const c of cohort || []) {
    if (!c.added) continue;
    const factor = reductionFactor(c);
    count = Math.round(count * (1 - factor));
  }
  return Math.max(count, 1);
}

// Deterministic 0.15–0.30 reduction from a string hash of the chip's identity.
function reductionFactor(chip) {
  const key = `${chip.field}:${chip.value}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return 0.15 + (h % 16) / 100; // 0.15 … 0.30
}
