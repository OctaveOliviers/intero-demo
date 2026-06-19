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
//   auditDetail      — mock audit-detail localization (database summary + fixed-criteria labels/units)
//   specValues       — mock parse chip VALUES (cohort defaults/options)
//   explain          — namespace of FUNCTIONS returning the right-panel explanation strings (preserve ${…} interpolation)
//   blockedReason    — the blocked-cell reason_detail (CPH009 age-at-discharge)
//   timeline         — { activities, tools, thinks, summaryWords, email parsing } headline/detail/think strings keyed sensibly
//   email            — mockSampleEmail body

const blankFilters = () => ({ dateFrom: "", dateTo: "", hospitals: "", cohort: "" });

// --- Databases (README §6.2) ------------------------------------------------
const databases = [
  { id: "patient-notes-db", name: "Patiëntnotities", status: "ready" },
  { id: "lab-results-db", name: "Laboratoriumuitslagen", status: "ready" },
  { id: "radiology-db", name: "Radiologiedatabase", status: "ready" },
];

const ehrDatabaseName = "EPD-database";

// --- Pre-loaded analyses (home list) ----------------------------------------
const analyses = [
  { id: "sentinel-stroke", name: "Sentinel-beroerte", description: "Deur-tot-naald-tijden, beeldvorming en uitkomsten voor sentinel-beroerte-opnames.", defaultFilters: blankFilters() },
  { id: "paediatric-diabetes", name: "Kinderdiabetes", description: "Nieuwe pediatrische type 1-presentaties, DKA-ernst en follow-up.", defaultFilters: blankFilters() },
  { id: "emergency-laparotomy", name: "Spoedlaparotomie", description: "Risicobeoordeling, tijd tot operatiekamer en uitkomsten voor spoedlaparotomieën.", defaultFilters: blankFilters() },
  { id: "heart-failure", name: "Hartfalen", description: "Hartfalenopnames: ejectiefractie, behandeling en heropname.", defaultFilters: blankFilters() },
  { id: "early-inflammatory-autoimmune", name: "Vroege inflammatoire auto-immuunziekten", description: "Tijd tot diagnose en behandeling voor vroege inflammatoire auto-immuunziekte.", defaultFilters: blankFilters() },
];

// The cord-pH template the user uploads live (Flow A).
const cordTemplate = {
  id: "cord-ph-audit",
  name: "Audit navelstreng-pH bij geboorte",
  description: "Navelstrengbloedgas, reanimatie en documentatiekwaliteit bij de geboorte.",
  defaultFilters: blankFilters(),
};

// --- Template catalog (translatable: category, name, description, columns) ---
// KEEP id, fileName, submissionDeadline unchanged.
const catalog = [
  {
    category: "Landelijke audits",
    templates: [
      {
        id: "nnap-national",
        name: "Neonatale zorg",
        category: "Landelijke audits",
        fileName: "nnap-audit.xlsx",
        description:
          "Landelijk neonataal auditprogramma — opnames, ademhalingsondersteuning en uitkomsten voor baby's opgenomen op neonatale afdelingen.",
        columns: [
          "NHS-nummer",
          "Zwangerschapsduur (weken)",
          "Geboortegewicht (gram)",
          "Temperatuur bij opname",
          "Antenatale corticosteroïden",
          "Magnesiumsulfaat toegediend",
          "Type ademhalingsondersteuning",
          "Dagen aan ademhalingsondersteuning",
          "ROP-screening uitgevoerd",
          "Borstvoeding bij ontslag",
          "Overleving tot ontslag",
        ],
      },
      {
        id: "nhfd-national",
        name: "Heupfractuur",
        category: "Landelijke audits",
        fileName: "nhfd-audit.xlsx",
        description:
          "Landelijke heupfractuurdatabase — zorgkwaliteit en uitkomsten voor patiënten opgenomen met een fragiliteitsheupfractuur.",
        columns: [
          "NHS-nummer",
          "Leeftijd",
          "Geslacht",
          "Type fractuur",
          "Tijd tot operatie (uren)",
          "Type operatie",
          "Preoperatieve cognitieve beoordeling",
          "Status decubitus",
          "Botbeschermende medicatie",
          "Gemobiliseerd dag 1",
          "30-daagse mortaliteit",
        ],
      },
      {
        id: "minap-national",
        name: "Hartinfarct",
        category: "Landelijke audits",
        fileName: "minap-audit.xlsx",
        description:
          "Landelijk auditproject myocardischemie — behandeling en uitkomsten voor patiënten opgenomen met een acuut coronair syndroom.",
        columns: [
          "NHS-nummer",
          "Leeftijd",
          "Diagnose bij opname",
          "Tijdstip symptoombegin",
          "Tijdstip opname",
          "ECG-uitslag",
          "Troponine-uitslag",
          "Reperfusiebehandeling",
          "Deur-tot-ballon-tijd (min)",
          "Ontslagen met statine",
          "Ontslagen met dubbele plaatjesremming",
        ],
      },
      {
        id: "npda-lo-audit",
        name: "Kinderdiabetes",
        category: "Landelijke audits",
        fileName: "npda-diabetes-audit.xlsx",
        submissionDeadline: "2026-07-20",
        description:
          "Landelijke audit kinderdiabetes — jaarlijkse controle van kinderen en jongeren met diabetes: HbA1c, de belangrijkste zorgprocessen, surveillancescreening en psychologische ondersteuning.",
        columns: [
          // Full NPDA 2026 core dataset — all 59 data items, in dataset order.
          "NHS-nummer",
          "Geboortedatum",
          "Postcode van het gebruikelijke adres",
          "Geslacht toegekend bij geboorte",
          "Etnische categorie",
          "ADHD / ASS-diagnose",
          "Verstandelijke beperking",
          "Type diabetes",
          "Datum van diagnose",
          "Datum van uitschrijving uit de dienst",
          "Reden van uitschrijving uit de dienst",
          "Overlijdensdatum",
          "Huisartspraktijkcode",
          "PDU-nummer",
          "Datum bezoek/afspraak",
          "Lengte (cm)",
          "Gewicht (kg)",
          "Meetdatum (lengte/gewicht)",
          "HbA1c (mmol/mol)",
          "Meetdatum (HbA1c)",
          "Insulineregime",
          "Andere glucoseverlagende medicatie",
          "Leefstijl-/voedingsadvies gegeven",
          "CGM in gebruik",
          "Bloedketontesten",
          "Immunotherapie ontvangen",
          "Datum start immunotherapie",
          "Systolische BD",
          "Diastolische BD",
          "Meetdatum (BD)",
          "Datum voetonderzoek",
          "Datum retinascreening",
          "Uitslag retinascreening",
          "Albumine in urine (ACR)",
          "Meetdatum (ACR)",
          "Stadium albuminurie",
          "Totaal cholesterol (mmol/l)",
          "Meetdatum (cholesterol)",
          "Meetdatum (schildklierfunctie)",
          "Schildklierbehandeling",
          "Meetdatum (coeliakiescreening)",
          "Glutenvrij dieet",
          "Rookt / vapet",
          "Datum advies stoppen met roken",
          "Datum griepvaccinatie",
          "Datum advies ziektedagregels",
          "Datum psychologische screening",
          "Aanvullende psychologische ondersteuning nodig",
          "Afspraak geestelijke gezondheidszorg aangeboden",
          "Datum koolhydraattellen niveau 3",
          "Aanvullende diëtistenafspraak aangeboden",
          "Datum diëtistenafspraak",
          "Startdatum opname",
          "Ontslagdatum opname",
          "Reden voor opname",
          "Reden voor opname (overig)",
          "DKA-therapieën gegeven",
          "Initiële pH bij opname",
          "Initiële bicarbonaat (mmol/l)",
        ],
      },
    ],
  },
  {
    category: "Regionale audits",
    templates: [
      {
        id: "cord-ph-lo-audit",
        name: "Navelstreng-pH (regionaal)",
        category: "Regionale audits",
        fileName: "cord-ph-lo-audit.xlsx",
        submissionDeadline: "2026-06-12",
        description:
          "Regionale audit navelstrengbloedgasafname — neonatale uitkomsten en naleving van regionale richtlijnen voor foetale acidose en navelstrenggasafname.",
        columns: [
          "Patiëntcode",
          "Zwangerschapsduur (weken)",
          "Zwangerschapsduur (dagen)",
          "Leeftijd moeder",
          "Pariteit",
          "CTG uitgevoerd",
          "Chorioamnionitis",
          "Bevalling",
          "Geboortegewicht (gram)",
          "Apgar 5",
          "Late navelstrengafklemming",
          "Arteriële navelstreng-pH",
          "Arteriële navelstreng-BE",
          "Arterieel navelstrenglactaat",
          "Geïntubeerd bij geboorte",
          "Opgenomen op NICU",
          "Regionale richtlijn voor navelstrenggasafname beschikbaar",
        ],
      },
    ],
  },
  {
    category: "Lokale audits",
    templates: [
      {
        id: "acute-sore-throat-audit",
        name: "Acute keelpijn (lokaal)",
        category: "Lokale audits",
        fileName: "acute-sore-throat-audit.xlsx",
        description:
          "Lokale audit acute keelpijn — FeverPAIN/Centor-scores en naleving van richtlijnen voor antibioticavoorschrijving.",
        columns: [
          "Patiëntcode",
          "Leeftijd",
          "Geslacht",
          "Presenterende klacht",
          "FeverPAIN-score",
          "Centor-score",
          "Keelkweek afgenomen",
          "Antibioticum voorgeschreven",
          "Antibioticum",
          "Uitgesteld voorschrift",
          "Heraanmelding binnen 28 dagen",
        ],
      },
      {
        id: "chest-pain-audit",
        name: "Pijn op de borst (lokaal)",
        category: "Lokale audits",
        fileName: "chest-pain-audit.xlsx",
        description:
          "Lokale audit pijn op de borst — triage, troponinebepaling en risicogestratificeerde bestemming voor patiënten die zich presenteren met pijn op de borst.",
        columns: [
          "Patiëntcode",
          "Leeftijd",
          "Geslacht",
          "Triagecategorie",
          "Tijd tot ECG (min)",
          "ECG-uitslag",
          "Troponine-uitslag",
          "HEART-score",
          "Bestemming",
          "Verwijzing cardiologie",
          "Heraanmelding binnen 30 dagen",
        ],
      },
    ],
  },
];

// --- Column descriptors (header translatable; key/width are logic) -----------
const columns = {
  cordAll: [
    { key: "patient", header: "Patiëntcode", width: 12 },
    { key: "gestWeeks", header: "Zwangerschapsduur (weken)", width: 14 },
    { key: "gestDays", header: "Zwangerschapsduur (dagen)", width: 12 },
    { key: "maternalAge", header: "Leeftijd moeder", width: 12 },
    { key: "parity", header: "Pariteit", width: 8 },
    { key: "_s1", header: "", width: 4 },
    { key: "foetalMovements", header: "Foetale bewegingen", width: 16 },
    { key: "maternalComorbidities", header: "Comorbiditeit moeder", width: 22 },
    { key: "maternalComorbiditiesOther", header: "Comorbiditeit moeder overig", width: 24 },
    { key: "normalScans", header: "Normale echo's", width: 12 },
    { key: "normalDopplers", header: "Normale dopplers", width: 14 },
    { key: "_s2", header: "", width: 4 },
    { key: "ctgDone", header: "CTG uitgevoerd", width: 10 },
    { key: "liquorMeconium", header: "Vruchtwater- meconium", width: 16 },
    { key: "chorioamnionitis", header: "Chorioamnionitis", width: 16 },
    { key: "prom", header: "PROM (>18 uur)", width: 16 },
    { key: "rffs", header: "RFFS", width: 8 },
    { key: "sentinelEvent", header: "Sentinel-gebeurtenis", width: 18 },
    { key: "_s3", header: "", width: 4 },
    { key: "delivery", header: "Bevalling", width: 20 },
    { key: "birthWeight", header: "Geboortegewicht (gram)", width: 18 },
    { key: "apgar1", header: "Apgar 1", width: 10 },
    { key: "apgar5", header: "Apgar 5", width: 10 },
    { key: "apgar10", header: "Apgar 10", width: 10 },
    { key: "dcc", header: "Late navelstrengafklemming", width: 22 },
    { key: "ph", header: "Arteriële navelstreng-pH", width: 16 },
    { key: "be", header: "Arteriële navelstreng-BE", width: 16 },
    { key: "lactate", header: "Arterieel navelstrenglactaat", width: 18 },
    { key: "_s4", header: "", width: 4 },
    { key: "intubated", header: "Geïntubeerd bij geboorte", width: 18 },
    { key: "compressions", header: "Hartmassage", width: 20 },
    { key: "drugs", header: "Toegediende medicatie", width: 16 },
    { key: "ward", header: "Afdeling", width: 14 },
    { key: "gasRepeated", header: "Gas herhaald?", width: 12 },
    { key: "ageRepeatedGas", header: "Leeftijd bij herhaald gas (uren)", width: 22 },
    { key: "repeatedLactate", header: "Herhaald lactaat", width: 16 },
    { key: "ageGasNormalised", header: "Leeftijd gas genormaliseerd (uren)", width: 22 },
    { key: "hypoglycaemia", header: "Hypoglykemie", width: 14 },
    { key: "admittedNicu", header: "Opgenomen op NICU", width: 16 },
    { key: "ageDischargeHome", header: "Leeftijd bij ontslag naar huis (dagen)", width: 24 },
    { key: "unitQuestionnaire", header: "Vragenlijst afdelingsniveau ingevuld ", width: 26 },
    { key: "guidelineCordGas", header: "Lokale richtlijn voor navelstrenggasafname beschikbaar", width: 34 },
    { key: "guidelineFetalAcidosis", header: "Lokale richtlijn voor foetale acidose beschikbaar", width: 34 },
  ],
  cordNicu: [
    { key: "nnuAdmitAge", header: "Leeftijd (uren) bij NNU-opname", width: 22 },
    { key: "cooled", header: "Gekoeld", width: 10 },
    { key: "ageCooling", header: "Leeftijd bij koeling (uren)", width: 20 },
    { key: "transferredOut", header: "Overgeplaatst", width: 14 },
    { key: "cfm", header: "CFM", width: 14 },
    { key: "seizures", header: "Convulsies", width: 12 },
    { key: "clinicalSeizures", header: "Klinische convulsies", width: 16 },
    { key: "electrographicSeizure", header: "Elektrografische convulsie", width: 20 },
    { key: "mriInjury", header: "MRI-letsel", width: 24 },
    { key: "_sn", header: "", width: 4 },
    { key: "durationNicu", header: "Duur opname op NICU (dagen)", width: 30 },
    { key: "ageDischargeHomeNicu", header: "Leeftijd bij ontslag naar huis (dagen)", width: 24 },
    { key: "feeding", header: "Voeding bij ontslag", width: 20 },
    { key: "abnormalNeurology", header: "Afwijkende neurologie bij ontslag", width: 28 },
  ],
  chest: [
    { key: "patient", header: "Patiënt", width: 10 },
    { key: "age", header: "Leeftijd", width: 8 },
    { key: "complaint", header: "Presenterende klacht", width: 26 },
    { key: "troponin", header: "Troponine (ng/L)", width: 16 },
    { key: "ecg", header: "ECG-bevindingen", width: 24 },
    { key: "timeToEcg", header: "Tijd tot ECG (min)", width: 18 },
    { key: "diagnosis", header: "Diagnose", width: 22 },
    { key: "decision", header: "Beslissing ontslag/opname", width: 24 },
  ],
  npda: [
    // 1 — Patient details/information
    { key: "patient", header: "NHS-nummer", width: 12 },                                 // item 1
    { key: "dob", header: "Geboortedatum", width: 14 },                                  // item 2
    { key: "postcode", header: "Postcode van het gebruikelijke adres", width: 16 },                 // item 3
    { key: "sex", header: "Geslacht toegekend bij geboorte", width: 18 },                          // item 4
    { key: "ethnicity", header: "Etnische categorie", width: 26 },                          // item 5
    { key: "adhdAsd", header: "ADHD / ASS-diagnose", width: 20 },                       // item 6
    { key: "learningDisability", header: "Verstandelijke beperking", width: 18 },             // item 7
    { key: "diabetesType", header: "Type diabetes", width: 14 },                         // item 8
    { key: "diagnosisDate", header: "Datum van diagnose", width: 16 },                    // item 9
    { key: "leavingDate", header: "Datum van uitschrijving uit de dienst", width: 20 },                // item 10
    { key: "leavingReason", header: "Reden van uitschrijving uit de dienst", width: 24 },           // item 11
    { key: "deathDate", header: "Overlijdensdatum", width: 14 },                               // item 12
    { key: "gpPractice", header: "Huisartspraktijkcode", width: 16 },                        // item 13
    { key: "pduNumber", header: "PDU-nummer", width: 12 },                               // item 14
    { key: "visitDate", header: "Datum bezoek/afspraak", width: 20 },                   // item 15
    { key: "_s1", header: "", width: 4 },
    // 2 — Routine measurements
    { key: "height", header: "Lengte (cm)", width: 12 },                                 // item 16
    { key: "weight", header: "Gewicht (kg)", width: 12 },                                 // item 17
    { key: "obsDateHtWt", header: "Meetdatum (lengte/gewicht)", width: 20 },               // item 18
    { key: "hba1c", header: "HbA1c (mmol/mol)", width: 16 },                             // item 19
    { key: "obsDateHba1c", header: "Meetdatum (HbA1c)", width: 18 },                      // item 20
    { key: "_s2", header: "", width: 4 },
    // 3 — Treatment/monitoring
    { key: "insulinRegime", header: "Insulineregime", width: 24 },                       // item 21
    { key: "otherMed", header: "Andere glucoseverlagende medicatie", width: 24 },                // item 22
    { key: "lifestyle", header: "Leefstijl-/voedingsadvies gegeven", width: 26 },           // item 23
    { key: "cgm", header: "CGM in gebruik", width: 12 },                                     // item 24
    { key: "ketoneTesting", header: "Bloedketontesten", width: 18 },                 // item 25
    { key: "immunotherapy", header: "Immunotherapie ontvangen", width: 20 },               // item 26
    { key: "immunotherapyDate", header: "Datum start immunotherapie", width: 22 },       // item 27
    { key: "_s3", header: "", width: 4 },
    // 4 — Annual review: health checks
    { key: "systolic", header: "Systolische BD", width: 12 },                              // item 28
    { key: "diastolic", header: "Diastolische BD", width: 12 },                            // item 29
    { key: "obsDateBP", header: "Meetdatum (BD)", width: 16 },                            // item 30
    { key: "footDate", header: "Datum voetonderzoek", width: 18 },                      // item 31
    { key: "retinalDate", header: "Datum retinascreening", width: 20 },                 // item 32
    { key: "retinalResult", header: "Uitslag retinascreening", width: 22 },             // item 33
    { key: "acr", header: "Albumine in urine (ACR)", width: 18 },                          // item 34
    { key: "obsDateAcr", header: "Meetdatum (ACR)", width: 16 },                          // item 35
    { key: "albuminuriaStage", header: "Stadium albuminurie", width: 18 },                 // item 36
    { key: "cholesterol", header: "Totaal cholesterol (mmol/l)", width: 22 },             // item 37
    { key: "obsDateChol", header: "Meetdatum (cholesterol)", width: 20 },                 // item 38
    { key: "thyroidDate", header: "Meetdatum (schildklierfunctie)", width: 22 },            // item 39
    { key: "thyroidTreatment", header: "Schildklierbehandeling", width: 22 },                 // item 40
    { key: "coeliacDate", header: "Meetdatum (coeliakiescreening)", width: 24 },           // item 41
    { key: "glutenFree", header: "Glutenvrij dieet", width: 16 },                        // item 42
    { key: "smoking", header: "Rookt / vapet", width: 14 },                             // item 43
    { key: "smokingCessationDate", header: "Datum advies stoppen met roken", width: 24 }, // item 44
    { key: "fluDate", header: "Datum griepvaccinatie", width: 24 },                // item 45
    { key: "sickDayDate", header: "Datum advies ziektedagregels", width: 22 },                 // item 46
    { key: "_s4", header: "", width: 4 },
    // 5 — Annual review: psychology
    { key: "psychScreen", header: "Datum psychologische screening", width: 24 },           // item 47
    { key: "psychOutcome", header: "Aanvullende psychologische ondersteuning nodig", width: 32 }, // item 48
    { key: "mentalHealthAppt", header: "Afspraak geestelijke gezondheidszorg aangeboden", width: 28 }, // item 49
    { key: "_s5", header: "", width: 4 },
    // 6 — Annual review: dietetics
    { key: "carbCounting", header: "Datum koolhydraattellen niveau 3", width: 22 },            // item 50
    { key: "dietitian", header: "Aanvullende diëtistenafspraak aangeboden", width: 32 }, // item 51
    { key: "dietitianApptDate", header: "Datum diëtistenafspraak", width: 22 },       // item 52
    { key: "_s6", header: "", width: 4 },
    // 7 — Hospital admissions / inpatient entry
    { key: "admissionStart", header: "Startdatum opname", width: 18 },                // item 53
    { key: "admissionDischarge", header: "Ontslagdatum opname", width: 20 },        // item 54
    { key: "admissionReason", header: "Reden voor opname", width: 20 },               // item 55
    { key: "admissionReasonOther", header: "Reden voor opname (overig)", width: 24 },  // item 56
    { key: "dkaTherapies", header: "DKA-therapieën gegeven", width: 18 },                   // item 57
    { key: "initialPh", header: "Initiële pH bij opname", width: 20 },                  // item 58
    { key: "initialBicarb", header: "Initiële bicarbonaat (mmol/l)", width: 24 },         // item 59
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
    normalScans: "Ja", normalDopplers: "Ja", ctgDone: "Ja",
    delivery: "Spontaan vaginaal", birthWeight: 3420, apgar1: 8, apgar5: 9, apgar10: 10,
    cordPh: 7.28, baseExcess: -3.4, lactate: 3.1,
    ward: "Kraamafdeling",
    gasRepeated: "Nee", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "Nee", ageDischargeHome: 2,
    unitQuestionnaire: "Ja", guidelineCordGas: "Ja", guidelineFetalAcidosis: "Nee",
    i: {
      fm: { v: "Normaal", e: ["foetale bewegingen waren gedurende de hele zwangerschap normaal"] },
      mc: { v: "Geen", e: ["Er was geen comorbiditeit bij de moeder gedocumenteerd"] },
      mco: { v: "Geen", e: ["geen overige relevante medische voorgeschiedenis"] },
      lm: { v: "Helder", e: ["Het vruchtwater was overal helder"] },
      chorio: { v: "Nee", e: ["geen kenmerken van chorioamnionitis"] },
      prom: { v: "Nee", e: ["zonder langdurig gebroken vliezen"] },
      rffs: { v: "Nee", e: ["Er werden geen risicofactoren voor sepsis vastgesteld"] },
      sentinel: { v: "Geen", e: ["Er was geen sentinel-gebeurtenis"] },
      dcc: { v: "Ja", e: ["Late navelstrengafklemming uitgevoerd gedurende ongeveer 90 seconden", "afgeklemd na ongeveer 90 seconden conform het afdelingsbeleid"] },
      intub: { v: "Nee", e: ["De baby werd niet geïntubeerd"] },
      compress: { v: "Nee", e: ["was geen hartmassage nodig"] },
      drugs: { v: "Geen", e: ["werd geen reanimatiemedicatie toegediend"] },
      hypo: { v: "Nee", e: ["zonder hypoglykemie"] },
    },
    notes: [
      { role: "Verloskunde — antenatale polikliniek", date: "2026-04-02", type: "antenatal", text: "Intake en antenataal beloop laagrisico. Gerapporteerde foetale bewegingen waren gedurende de hele zwangerschap normaal. Er was geen comorbiditeit bij de moeder gedocumenteerd en er was geen overige relevante medische voorgeschiedenis. Er werden geen risicofactoren voor sepsis vastgesteld, en de vliezen braken bij de bevalling zonder langdurig gebroken vliezen." },
      { role: "Verloskunde — Dr Hannah Reid", date: "2026-04-02", type: "birth_summary", text: "Voldragen baby geboren via spontane vaginale bevalling bij 39+4. Het vruchtwater was overal helder en er waren geen kenmerken van chorioamnionitis. Er was geen sentinel-gebeurtenis. Navelstrenggassen normaal (arteriële pH 7.28). Late navelstrengafklemming uitgevoerd gedurende ongeveer 90 seconden. Geen reanimatie afgezien van drogen en stimuleren." },
      { role: "Verloskunde — Leah Morgan", date: "2026-04-02", type: "delivery", text: "Spontane vaginale geboorte, direct huid-op-huidcontact. Navelstreng laten uitkloppen en afgeklemd na ongeveer 90 seconden conform het afdelingsbeleid. Apgar 8 en 9, baby roze en gedurende de hele periode actief." },
      { role: "Neonatologie — reanimatieverslag", date: "2026-04-02", type: "resuscitation", text: "Er was geen actieve reanimatie nodig. De baby werd niet geïntubeerd, er was geen hartmassage nodig en er werd geen reanimatiemedicatie toegediend." },
      { role: "Kraamafdeling — onderzoek pasgeborene", date: "2026-04-04", type: "postnatal", text: "Routineonderzoek pasgeborene normaal. Bloedglucose bleef binnen de normale grenzen zonder hypoglykemie. Drinkt goed; ontslagen naar huis op dag 2." },
    ],
  },

  CPH002: {
    code: "CPH002", baby: "cph-baby-002",
    gestWeeks: 40, gestDays: 1, maternalAge: 34, parity: 2,
    normalScans: "Ja", normalDopplers: "Nee", ctgDone: "Ja",
    delivery: "Spoedkeizersnede", birthWeight: 3650, apgar1: 3, apgar5: 5, apgar10: 7,
    cordPh: 7.03, baseExcess: -15.2, lactate: 10.6,
    ward: "NICU",
    gasRepeated: "Ja", ageRepeatedGas: 2, repeatedLactate: 6.2, ageGasNormalised: 10,
    admittedNicu: "Ja", ageDischargeHome: 6,
    unitQuestionnaire: "Ja", guidelineCordGas: "Ja", guidelineFetalAcidosis: "Nee",
    i: {
      fm: { v: "Verminderd", e: ["Verminderde foetale bewegingen gemeld"] },
      mc: { v: "Zwangerschapsdiabetes", e: ["zwangerschapsdiabetes"] },
      mco: { v: "Met dieet gereguleerd", e: ["met dieet gereguleerd"] },
      lm: { v: "Meconium", e: ["meconiumhoudend vruchtwater"] },
      chorio: { v: "Nee", e: ["geen kenmerken van chorioamnionitis"] },
      prom: { v: "Nee", e: ["geen langdurig gebroken vliezen"] },
      rffs: { v: "Nee", e: ["Geen andere risicofactoren voor sepsis"] },
      sentinel: { v: "Geen", e: ["geen sentinel-gebeurtenis"] },
      dcc: { v: "Nee", e: ["navelstreng direct afgeklemd om reanimatie mogelijk te maken", "geen late navelstrengafklemming aangezien actieve reanimatie nodig was"] },
      intub: { v: "Ja", e: ["Baby geïntubeerd bij geboorte"] },
      compress: { v: "Ja", e: ["kortdurende hartmassage"] },
      drugs: { v: "Adrenaline", e: ["eenmalig adrenaline toegediend"] },
      hypo: { v: "Ja", e: ["Voorbijgaande hypoglykemie in de eerste levensuren"] },
    },
    n: {
      admitAge: 0.5, transferredOut: "Nee", durationDays: 5,
      cooled: { v: "Ja", e: ["Therapeutische koeling gestart"] },
      ageCooling: { v: "1.3", e: ["gestart na 1.3 uur"] },
      cfm: { v: "Overeenkomstig", e: ["afwijkend achtergrondpatroon zonder elektrografische convulsies", "afwijkend achtergrondpatroon, geen convulsies"], explanation: "De CFM-notitie aan bed en het formele neurologierapport lezen beide een afwijkend achtergrondpatroon zonder convulsies — overeenkomstig." },
      seizures: { v: "Nee", e: ["geen klinische of elektrografische convulsies"] },
      clinical: { v: "Nee", e: ["geen klinische of elektrografische convulsies"] },
      electro: { v: "Nee", e: ["geen klinische of elektrografische convulsies"] },
      mri: { v: "Geen acuut letsel", e: ["MRI toonde geen acuut letsel"] },
      feeding: { v: "Borstvoeding", e: ["borstvoeding op gang gekomen"] },
      abnNeuro: { v: "Nee", e: ["Neurologisch onderzoek normaal bij ontslag"] },
    },
    notes: [
      { role: "Verloskunde — antenatale polikliniek", date: "2026-04-04", type: "antenatal", text: "Zwangerschap gecompliceerd door zwangerschapsdiabetes, met dieet gereguleerd. Verminderde foetale bewegingen gemeld in de dagen voor de bevalling. Geen andere risicofactoren voor sepsis en geen langdurig gebroken vliezen." },
      { role: "Verloskunde — Dr Mark Alvarez", date: "2026-04-04", type: "birth_summary", text: "Spoedkeizersnede wegens pathologisch CTG en meconiumhoudend vruchtwater. Er waren geen kenmerken van chorioamnionitis en geen sentinel-gebeurtenis. Baby slap bij geboorte; navelstreng direct afgeklemd om reanimatie mogelijk te maken." },
      { role: "Verloskunde — Leah Morgan", date: "2026-04-04", type: "delivery", text: "Categorie 1-keizersnede. Baby direct overgedragen aan het neonatale team; geen late navelstrengafklemming aangezien actieve reanimatie nodig was." },
      { role: "Neonatologie — reanimatieverslag", date: "2026-04-04", type: "resuscitation", text: "Baby geïntubeerd bij geboorte met kortdurende hartmassage en eenmalig adrenaline toegediend. Goede respons met terugkeer van spontane circulatie." },
      { role: "Neonatologie — metabool pasgeborene", date: "2026-04-05", type: "postnatal", text: "Voorbijgaande hypoglykemie in de eerste levensuren, behandeld met intraveneuze dextrose en hersteld." },
      { role: "Neonatologie — Dr Priya Shah", date: "2026-04-04", type: "nicu_admission", text: "Opgenomen op NICU op de leeftijd van 0,5 uur. Therapeutische koeling gestart na 1.3 uur. CFM toonde een afwijkend achtergrondpatroon zonder elektrografische convulsies, in overeenstemming met het gestructureerde verslag." },
      { role: "Neurologie — formeel aEEG-rapport", date: "2026-04-06", type: "neurology_report", text: "Formele aEEG-beoordeling bevestigt een afwijkend achtergrondpatroon, geen convulsies. Er waren geen klinische of elektrografische convulsies. MRI toonde geen acuut letsel." },
      { role: "Neonatologie — ontslagbrief", date: "2026-04-10", type: "discharge", text: "Ontslagen naar huis op dag 6, borstvoeding op gang gekomen. Neurologisch onderzoek normaal bij ontslag." },
    ],
  },

  CPH003: {
    code: "CPH003", baby: "cph-baby-003",
    gestWeeks: 38, gestDays: 6, maternalAge: 29, parity: 0,
    normalScans: "Ja", normalDopplers: "Ja", ctgDone: "Ja",
    delivery: "Forceps", birthWeight: 3180, apgar1: 7, apgar5: 9, apgar10: 10,
    cordPh: null, baseExcess: null, lactate: null, phMissing: true,
    ward: "Kraamafdeling",
    gasRepeated: "Nee", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "Nee", ageDischargeHome: 3,
    unitQuestionnaire: "Ja", guidelineCordGas: "Ja", guidelineFetalAcidosis: "Nee",
    phEvidence: ["Arterieel navelstrengmonster gestold en er is geen geldige pH beschikbaar"],
    i: {
      fm: { v: "Normaal", e: ["normale foetale bewegingen"] },
      mc: { v: "Geen", e: ["Geen comorbiditeit bij de moeder"] },
      mco: { v: "Geen", e: ["geen overige relevante medische voorgeschiedenis"] },
      lm: { v: "Helder", e: ["Het vruchtwater was helder"] },
      chorio: { v: "Nee", e: ["geen kenmerken van chorioamnionitis"] },
      prom: { v: "Ja", e: ["Langdurig gebroken vliezen gedurende meer dan 24 uur"] },
      rffs: { v: "Ja", e: ["geregistreerd werd als risicofactor voor sepsis"] },
      sentinel: { v: "Geen", e: ["geen sentinel-gebeurtenis"] },
      dcc: { v: "Ja", e: ["navelstrengafklemming met ongeveer 60 seconden uitgesteld", "navelstreng ongeveer een minuut intact voor het afklemmen"] },
      intub: { v: "Nee", e: ["De baby werd niet geïntubeerd"] },
      compress: { v: "Nee", e: ["was geen hartmassage nodig"] },
      drugs: { v: "Geen", e: ["werd geen reanimatiemedicatie toegediend"] },
      hypo: { v: "Nee", e: ["zonder hypoglykemie"] },
    },
    notes: [
      { role: "Verloskunde — antenatale polikliniek", date: "2026-04-06", type: "antenatal", text: "Laagrisicozwangerschap met normale foetale bewegingen. Geen comorbiditeit bij de moeder en geen overige relevante medische voorgeschiedenis. Langdurig gebroken vliezen gedurende meer dan 24 uur voor de bevalling, wat geregistreerd werd als risicofactor voor sepsis." },
      { role: "Verloskunde — Dr Hannah Reid", date: "2026-04-06", type: "birth_summary", text: "Forcepsbevalling wegens langdurig tweede tijdperk. Het vruchtwater was helder met geen kenmerken van chorioamnionitis en geen sentinel-gebeurtenis. Arterieel navelstrengmonster gestold en er is geen geldige pH beschikbaar. Baby vitaal; navelstrengafklemming met ongeveer 60 seconden uitgesteld voor de overdracht." },
      { role: "Verloskunde — Leah Morgan", date: "2026-04-06", type: "delivery", text: "Vaginale kunstverlossing. Baby huilde direct en werd op de borst van de moeder gehouden met de navelstreng ongeveer een minuut intact voor het afklemmen." },
      { role: "Neonatologie — reanimatieverslag", date: "2026-04-06", type: "resuscitation", text: "Geen reanimatie nodig. De baby werd niet geïntubeerd, er was geen hartmassage nodig en er werd geen reanimatiemedicatie toegediend." },
      { role: "Kraamafdeling — onderzoek pasgeborene", date: "2026-04-08", type: "postnatal", text: "Onderzoek pasgeborene normaal. Bloedglucose binnen de normale grenzen zonder hypoglykemie. Ontslagen naar huis op dag 3." },
    ],
  },

  CPH004: {
    code: "CPH004", baby: "cph-baby-004",
    gestWeeks: 39, gestDays: 2, maternalAge: 28, parity: 1,
    normalScans: "Ja", normalDopplers: "Ja", ctgDone: "Ja",
    delivery: "Spontaan vaginaal", birthWeight: 3350, apgar1: 8, apgar5: 9, apgar10: 10,
    cordPh: 7.26, baseExcess: -4.1, lactate: 3.6,
    ward: "Kraamafdeling",
    gasRepeated: "Nee", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "Nee", ageDischargeHome: 2,
    unitQuestionnaire: "Ja", guidelineCordGas: "Ja", guidelineFetalAcidosis: "Nee",
    i: {
      fm: { v: "Normaal", e: ["foetale bewegingen waren overal normaal"] },
      mc: { v: "Geen", e: ["Geen comorbiditeit bij de moeder"] },
      mco: { v: "Geen", e: ["geen overige relevante medische voorgeschiedenis"] },
      lm: { v: "Helder", e: ["Het vruchtwater was helder"] },
      chorio: { v: "Nee", e: ["geen kenmerken van chorioamnionitis"] },
      prom: { v: "Nee", e: ["zonder langdurig gebroken vliezen"] },
      rffs: { v: "Nee", e: ["geen risicofactoren voor sepsis"] },
      sentinel: { v: "Geen", e: ["geen sentinel-gebeurtenis"] },
      dcc: { v: "Ja", e: ["late navelstrengafklemming gedurende ongeveer 60 seconden", "Navelstreng ongeveer een minuut laten uitkloppen voor het afklemmen"] },
      intub: { v: "Nee", e: ["De baby werd niet geïntubeerd"] },
      compress: { v: "Nee", e: ["was geen hartmassage nodig"] },
      drugs: { v: "Geen", e: ["werd geen reanimatiemedicatie toegediend"] },
      hypo: { v: "Nee", e: ["zonder hypoglykemie"] },
    },
    notes: [
      { role: "Verloskunde — antenatale polikliniek", date: "2026-04-09", type: "antenatal", text: "Laagrisicozwangerschap en foetale bewegingen waren overal normaal. Geen comorbiditeit bij de moeder en geen overige relevante medische voorgeschiedenis. Vliezen braken bij het begin van de baring zonder langdurig gebroken vliezen. Er werden geen risicofactoren voor sepsis vastgesteld." },
      { role: "Verloskunde — Dr Hannah Reid", date: "2026-04-09", type: "birth_summary", text: "Voldragen baby geboren via spontane vaginale bevalling bij 39+2. Het vruchtwater was helder en er waren geen kenmerken van chorioamnionitis. Er was geen sentinel-gebeurtenis. Navelstrenggassen geruststellend (arteriële pH 7.26), met late navelstrengafklemming gedurende ongeveer 60 seconden." },
      { role: "Verloskunde — Leah Morgan", date: "2026-04-09", type: "delivery", text: "Spontane vaginale geboorte met direct huid-op-huidcontact. Navelstreng ongeveer een minuut laten uitkloppen voor het afklemmen. Apgar 8 en 9, baby roze en actief." },
      { role: "Neonatologie — reanimatieverslag", date: "2026-04-09", type: "resuscitation", text: "Geen actieve reanimatie nodig. De baby werd niet geïntubeerd, er was geen hartmassage nodig en er werd geen reanimatiemedicatie toegediend." },
      { role: "Kraamafdeling — onderzoek pasgeborene", date: "2026-04-11", type: "postnatal", text: "Routineonderzoek pasgeborene normaal. Bloedglucose bleef binnen de normale grenzen zonder hypoglykemie. Drinkt goed; ontslagen naar huis op dag 2." },
    ],
  },

  CPH005: {
    code: "CPH005", baby: "cph-baby-005",
    gestWeeks: 41, gestDays: 0, maternalAge: 33, parity: 3,
    normalScans: "Ja", normalDopplers: "Ja", ctgDone: "Ja",
    delivery: "Spontaan vaginaal", birthWeight: 4120, apgar1: 6, apgar5: 8, apgar10: 9,
    cordPh: 7.12, baseExcess: -9.8, lactate: 7.2,
    ward: "Kraamafdeling",
    gasRepeated: "Ja", ageRepeatedGas: 1, repeatedLactate: 4.1, ageGasNormalised: 6,
    admittedNicu: "Nee", ageDischargeHome: 2,
    unitQuestionnaire: "Ja", guidelineCordGas: "Ja", guidelineFetalAcidosis: "Nee",
    i: {
      fm: { v: "Normaal", e: ["Normale foetale bewegingen gedurende de hele zwangerschap"] },
      mc: { v: "Zwangerschapsdiabetes", e: ["zwangerschapsdiabetes"] },
      mco: { v: "Met insuline behandeld", e: ["met insuline behandeld"] },
      lm: { v: "Helder", e: ["Het vruchtwater was helder"] },
      chorio: { v: "Nee", e: ["geen kenmerken van chorioamnionitis"] },
      prom: { v: "Nee", e: ["Geen langdurig gebroken vliezen"] },
      rffs: { v: "Nee", e: ["geen risicofactoren voor sepsis"] },
      sentinel: { v: "Schouderdystocie", e: ["schouderdystocie binnen 90 seconden opgelost"] },
      dcc: { v: "Nee", e: ["werd de navelstreng vroeg afgeklemd en de baby naar de reanimatietafel gebracht", "Direct afklemmen en overbrengen naar de reanimatietafel"] },
      intub: { v: "Nee", e: ["De baby werd niet geïntubeerd"] },
      compress: { v: "Nee", e: ["was geen hartmassage nodig"] },
      drugs: { v: "Geen", e: ["werd geen reanimatiemedicatie toegediend"] },
      hypo: { v: "Ja", e: ["Hypoglykemie op de eerste dag"] },
    },
    notes: [
      { role: "Verloskunde — antenatale polikliniek", date: "2026-04-11", type: "antenatal", text: "Zwangerschap gecompliceerd door zwangerschapsdiabetes, met insuline behandeld, met een macrosome baby op groei-echo's. Normale foetale bewegingen gedurende de hele zwangerschap. Geen langdurig gebroken vliezen en geen risicofactoren voor sepsis." },
      { role: "Verloskunde — Dr Mark Alvarez", date: "2026-04-11", type: "birth_summary", text: "Spontane vaginale bevalling gecompliceerd door schouderdystocie binnen 90 seconden opgelost. Het vruchtwater was helder met geen kenmerken van chorioamnionitis. Baby had stimulatie en kortdurende maskerbeademing nodig, daarom werd de navelstreng vroeg afgeklemd en de baby naar de reanimatietafel gebracht." },
      { role: "Verloskunde — Leah Morgan", date: "2026-04-11", type: "delivery", text: "Moeizame geboorte gecompliceerd door schouderdystocie. Direct afklemmen en overbrengen naar de reanimatietafel voor inflatiebeademingen." },
      { role: "Neonatologie — reanimatieverslag", date: "2026-04-11", type: "resuscitation", text: "Kortdurende maskerbeademing gegeven met goede respons. De baby werd niet geïntubeerd, er was geen hartmassage nodig en er werd geen reanimatiemedicatie toegediend." },
      { role: "Kraamafdeling — onderzoek pasgeborene", date: "2026-04-13", type: "postnatal", text: "Macrosome zuigeling van een diabetische moeder. Hypoglykemie op de eerste dag waarvoor extra voedingen en monitoring nodig waren, naderhand hersteld." },
    ],
  },

  CPH006: {
    code: "CPH006", baby: "cph-baby-006",
    gestWeeks: 35, gestDays: 5, maternalAge: 27, parity: 0,
    normalScans: "Nee", normalDopplers: "Nee", ctgDone: "Ja",
    delivery: "Spoedkeizersnede", birthWeight: 2680, apgar1: 5, apgar5: 7, apgar10: 8,
    cordPh: 7.18, baseExcess: -8.1, lactate: 6.4,
    ward: "NICU",
    gasRepeated: "Nee", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "Ja", ageDischargeHome: 16,
    unitQuestionnaire: "Ja", guidelineCordGas: "Ja", guidelineFetalAcidosis: "Nee",
    i: {
      fm: { v: "Normaal", e: ["Normale foetale bewegingen gemeld"] },
      mc: { v: "Geen", e: ["Geen vooraf bestaande comorbiditeit bij de moeder"] },
      mco: { v: "Geen", e: ["geen overige relevante medische voorgeschiedenis"] },
      lm: { v: "Helder", e: ["Het vruchtwater was helder"] },
      chorio: { v: "Verdacht", e: ["verdenking op chorioamnionitis"] },
      prom: { v: "Ja", e: ["Langdurig gebroken vliezen langer dan 18 uur"] },
      rffs: { v: "Ja", e: ["geregistreerd als risicofactor voor sepsis"] },
      sentinel: { v: "Geen", e: ["geen sentinel-gebeurtenis"] },
      dcc: { v: "Nee", e: ["Premature baby direct afgeklemd en naar de NICU gebracht", "zonder late afklemming vanwege prematuriteit"] },
      intub: { v: "Nee", e: ["De baby werd niet geïntubeerd"] },
      compress: { v: "Nee", e: ["was geen hartmassage nodig"] },
      drugs: { v: "Geen", e: ["werd geen reanimatiemedicatie toegediend"] },
      hypo: { v: "Ja", e: ["episodes van hypoglykemie in de eerste dagen"] },
    },
    n: {
      admitAge: 0.4, transferredOut: "Nee", durationDays: 14,
      cooled: { v: "Nee", e: ["therapeutische koeling niet geïndiceerd"] },
      ageCooling: { v: "N.v.t.", e: ["therapeutische koeling niet geïndiceerd"] },
      cfm: { v: "Niet uitgevoerd", e: ["werd geen CFM gebruikt"], explanation: "Opgenomen op NICU wegens prematuriteit en verdenking op sepsis in plaats van encefalopathie, daarom werd er geen CFM-monitoring gebruikt — expliciet vastgelegd als niet uitgevoerd." },
      seizures: { v: "Nee", e: ["Er werden geen klinische convulsies waargenomen"] },
      clinical: { v: "Nee", e: ["Er werden geen klinische convulsies waargenomen"] },
      electro: { v: "Nee", e: ["werden geen elektrografische convulsies vastgelegd"] },
      mri: { v: "Niet uitgevoerd", e: ["Er werd geen MRI uitgevoerd"] },
      feeding: { v: "Sonde- en borstvoeding", e: ["sonde- en borstvoeding"] },
      abnNeuro: { v: "Nee", e: ["Neurologisch normaal bij ontslag"] },
    },
    notes: [
      { role: "Verloskunde — antenatale polikliniek", date: "2026-04-13", type: "antenatal", text: "Vroeggeboorte bij 35+5. Normale foetale bewegingen gemeld. Langdurig gebroken vliezen langer dan 18 uur met maternale koorts, geregistreerd als risicofactor voor sepsis. Geen vooraf bestaande comorbiditeit bij de moeder en geen overige relevante medische voorgeschiedenis. Groei-echo's waren in deze zwangerschap beperkt geweest." },
      { role: "Verloskunde — Dr Hannah Reid", date: "2026-04-13", type: "birth_summary", text: "Spoedkeizersnede bij 35+5 wegens verdenking op chorioamnionitis. Het vruchtwater was helder en er was geen sentinel-gebeurtenis. Premature baby direct afgeklemd en naar de NICU gebracht voor CPAP en antibiotica." },
      { role: "Verloskunde — Leah Morgan", date: "2026-04-13", type: "delivery", text: "Vroeggeboorte; baby overgedragen aan het neonatale team zonder late afklemming vanwege prematuriteit en de noodzaak van ademhalingsondersteuning." },
      { role: "Neonatologie — reanimatieverslag", date: "2026-04-13", type: "resuscitation", text: "Gestabiliseerd op CPAP. De baby werd niet geïntubeerd, er was geen hartmassage nodig en er werd geen reanimatiemedicatie toegediend." },
      { role: "Neonatologie — metabool pasgeborene", date: "2026-04-15", type: "postnatal", text: "Premature zuigeling met episodes van hypoglykemie in de eerste dagen waarvoor sondevoeding en monitoring nodig waren." },
      { role: "Neonatologie — Dr Priya Shah", date: "2026-04-13", type: "nicu_admission", text: "Opgenomen op NICU na 0,4 uur wegens prematuriteit en verdenking op sepsis. Dit was geen encefalopathietraject, daarom was therapeutische koeling niet geïndiceerd en werd geen CFM gebruikt." },
      { role: "Neurologie — beoordelingsnotitie", date: "2026-04-20", type: "neurology_report", text: "Er werden geen klinische convulsies waargenomen en er werden geen elektrografische convulsies vastgelegd. Er werd geen MRI uitgevoerd aangezien er geen aanwijzingen voor encefalopathie waren." },
      { role: "Neonatologie — ontslagbrief", date: "2026-04-29", type: "discharge", text: "Ontslagen naar huis op dag 16 op sonde- en borstvoeding. Neurologisch normaal bij ontslag." },
    ],
  },

  CPH007: {
    code: "CPH007", baby: "cph-baby-007",
    gestWeeks: 39, gestDays: 0, maternalAge: 38, parity: 1,
    normalScans: "Ja", normalDopplers: "Nee", ctgDone: "Ja",
    delivery: "Vacuüm", birthWeight: 3030, apgar1: 7, apgar5: 9, apgar10: 10,
    cordPh: 7.24, baseExcess: -5.6, lactate: null,
    ward: "Kraamafdeling",
    gasRepeated: "Nee", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "Nee", ageDischargeHome: 2,
    unitQuestionnaire: "Ja", guidelineCordGas: "Ja", guidelineFetalAcidosis: "Nee",
    i: {
      fm: { v: "Verminderd", e: ["Verminderde foetale bewegingen waren aanleiding voor beoordeling"] },
      mc: { v: "Pre-eclampsie", e: ["pre-eclampsie"] },
      mco: { v: "Op labetalol", e: ["behandeld met labetalol"] },
      lm: { v: "Helder", e: ["Het vruchtwater was helder"] },
      chorio: { v: "Nee", e: ["geen kenmerken van chorioamnionitis"] },
      prom: { v: "Nee", e: ["Geen langdurig gebroken vliezen"] },
      rffs: { v: "Nee", e: ["geen risicofactoren voor sepsis"] },
      sentinel: { v: "Geen", e: ["geen sentinel-gebeurtenis"] },
      dcc: { v: "Nee", e: ["Navelstreng vroeg afgeklemd om de beoordeling te bespoedigen", "directe navelstrengafklemming gedocumenteerd"] },
      intub: { v: "Nee", e: ["De baby werd niet geïntubeerd"] },
      compress: { v: "Nee", e: ["was geen hartmassage nodig"] },
      drugs: { v: "Geen", e: ["werd geen reanimatiemedicatie toegediend"] },
      hypo: { v: "Nee", e: ["zonder hypoglykemie"] },
    },
    notes: [
      { role: "Verloskunde — antenatale polikliniek", date: "2026-04-16", type: "antenatal", text: "Zwangerschap gecompliceerd door pre-eclampsie, behandeld met labetalol. Verminderde foetale bewegingen waren aanleiding voor beoordeling. Geen langdurig gebroken vliezen en geen risicofactoren voor sepsis." },
      { role: "Verloskunde — Dr Mark Alvarez", date: "2026-04-16", type: "birth_summary", text: "Vacuümbevalling wegens foetale nood na verminderde foetale bewegingen. Het vruchtwater was helder met geen kenmerken van chorioamnionitis en geen sentinel-gebeurtenis. Navelstreng vroeg afgeklemd om de beoordeling te bespoedigen; navelstrenggas geruststellend (pH 7.24)." },
      { role: "Verloskunde — Leah Morgan", date: "2026-04-16", type: "delivery", text: "Vacuümextractie. Baby snel beoordeeld door het team; directe navelstrengafklemming gedocumenteerd." },
      { role: "Neonatologie — reanimatieverslag", date: "2026-04-16", type: "resuscitation", text: "Geen reanimatie nodig. De baby werd niet geïntubeerd, er was geen hartmassage nodig en er werd geen reanimatiemedicatie toegediend." },
      { role: "Kraamafdeling — onderzoek pasgeborene", date: "2026-04-18", type: "postnatal", text: "Onderzoek pasgeborene normaal. Bloedglucose binnen de normale grenzen zonder hypoglykemie. Ontslagen naar huis op dag 2." },
    ],
  },

  CPH008: {
    code: "CPH008", baby: "cph-baby-008",
    gestWeeks: 40, gestDays: 3, maternalAge: 30, parity: 2,
    normalScans: "Ja", normalDopplers: "Ja", ctgDone: "Nee",
    delivery: "Spontaan vaginaal", birthWeight: 3520, apgar1: 9, apgar5: 10, apgar10: 10,
    cordPh: 7.31, baseExcess: -2.2, lactate: 2.4,
    ward: "Kraamafdeling",
    gasRepeated: "Nee", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "Nee", ageDischargeHome: 1,
    unitQuestionnaire: "Ja", guidelineCordGas: "Ja", guidelineFetalAcidosis: "Nee",
    i: {
      fm: { v: "Normaal", e: ["overal normale foetale bewegingen"] },
      mc: { v: "Geen", e: ["Geen comorbiditeit bij de moeder"] },
      mco: { v: "Geen", e: ["geen overige relevante medische voorgeschiedenis"] },
      lm: { v: "Helder", e: ["Het vruchtwater was helder"] },
      chorio: { v: "Nee", e: ["geen kenmerken van chorioamnionitis"] },
      prom: { v: "Nee", e: ["Geen langdurig gebroken vliezen"] },
      rffs: { v: "Nee", e: ["geen risicofactoren voor sepsis"] },
      sentinel: { v: "Geen", e: ["geen sentinel-gebeurtenis"] },
      dcc: { v: "Ja", e: ["de navelstreng afgeklemd nadat het kloppen stopte", "Navelstreng intact gelaten tot het kloppen stopte voor het afklemmen"] },
      intub: { v: "Nee", e: ["De baby werd niet geïntubeerd"] },
      compress: { v: "Nee", e: ["was geen hartmassage nodig"] },
      drugs: { v: "Geen", e: ["werd geen reanimatiemedicatie toegediend"] },
      hypo: { v: "Nee", e: ["zonder hypoglykemie"] },
    },
    notes: [
      { role: "Verloskunde — antenatale polikliniek", date: "2026-04-20", type: "antenatal", text: "Laagrisicozwangerschap met overal normale foetale bewegingen. Geen comorbiditeit bij de moeder en geen overige relevante medische voorgeschiedenis. Geen langdurig gebroken vliezen en geen risicofactoren voor sepsis." },
      { role: "Verloskunde — Dr Hannah Reid", date: "2026-04-20", type: "birth_summary", text: "Ongecompliceerde waterbevalling bij 40+3. Het vruchtwater was helder met geen kenmerken van chorioamnionitis en geen sentinel-gebeurtenis. Optimaal navelstrengbeleid toegepast, met de navelstreng afgeklemd nadat het kloppen stopte." },
      { role: "Verloskunde — Leah Morgan", date: "2026-04-20", type: "delivery", text: "Fysiologische waterbevalling. Navelstreng intact gelaten tot het kloppen stopte voor het afklemmen. Apgar 9 en 10." },
      { role: "Neonatologie — reanimatieverslag", date: "2026-04-20", type: "resuscitation", text: "Geen reanimatie nodig. De baby werd niet geïntubeerd, er was geen hartmassage nodig en er werd geen reanimatiemedicatie toegediend." },
      { role: "Kraamafdeling — onderzoek pasgeborene", date: "2026-04-21", type: "postnatal", text: "Onderzoek pasgeborene normaal. Bloedglucose binnen de normale grenzen zonder hypoglykemie. Ontslagen naar huis op dag 1." },
    ],
  },

  CPH009: {
    code: "CPH009", baby: "cph-baby-009",
    gestWeeks: 38, gestDays: 1, maternalAge: 36, parity: 1,
    normalScans: "Ja", normalDopplers: "Nee", ctgDone: "Ja",
    delivery: "Spoedkeizersnede", birthWeight: 3260, apgar1: 2, apgar5: 4, apgar10: 6,
    cordPh: 6.98, baseExcess: -18.7, lactate: 12.8,
    ward: "NICU",
    gasRepeated: "Ja", ageRepeatedGas: 1, repeatedLactate: 9.1, ageGasNormalised: "Niet genormaliseerd",
    admittedNicu: "Ja", ageDischargeHome: null,
    unitQuestionnaire: "Ja", guidelineCordGas: "Ja", guidelineFetalAcidosis: "Nee",
    i: {
      fm: { v: "Verminderd", e: ["Verminderde foetale bewegingen gemeld op de dag van opname"] },
      mc: { v: "Eerdere keizersnede", e: ["eerdere keizersnede in het onderste segment"] },
      mco: { v: "Eén eerdere LSCS", e: ["één eerdere keizersnede in het onderste segment"] },
      lm: { v: "Meconium", e: ["Sterk meconiumhoudend vruchtwater"] },
      chorio: { v: "Nee", e: ["geen kenmerken van chorioamnionitis"] },
      prom: { v: "Nee", e: ["Geen langdurig gebroken vliezen"] },
      rffs: { v: "Nee", e: ["geen andere risicofactoren voor sepsis"] },
      sentinel: { v: "Uterusruptuur", e: ["Spoedkeizersnede wegens uterusruptuur"] },
      dcc: { v: "Nee", e: ["Baby direct afgeklemd voor reanimatie", "geen late navelstrengafklemming"] },
      intub: { v: "Ja", e: ["Baby geïntubeerd bij geboorte"] },
      compress: { v: "Ja", e: ["aanhoudende hartmassage"] },
      drugs: { v: "Adrenaline", e: ["herhaalde doses adrenaline"] },
      hypo: { v: "Ja", e: ["Ernstige hypoglykemie in de eerste uren"] },
    },
    n: {
      admitAge: 0.3, transferredOut: "Ja", durationDays: 7,
      cooled: { v: "Ja", e: ["Therapeutische koeling gestart"] },
      ageCooling: { v: "1.8", e: ["gestart op de leeftijd van 1,8 uur"] },
      cfm: { v: "Tegenstrijdig", e: ["CFM-curve aan bed aanvankelijk beoordeeld als normaal achtergrondpatroon", "vermeldt elektrografische convulsies", "in tegenspraak met de CFM-indruk aan bed"], explanation: "De CFM-notitie aan bed las een normaal achtergrondpatroon, maar het formele neurologierapport vermeldt elektrografische convulsies — gemarkeerd als tegenstrijdig met het gestructureerde verslag." },
      seizures: { v: "Ja", e: ["vermeldt elektrografische convulsies"] },
      clinical: { v: "Ja", e: ["Er werden ook klinische convulsies waargenomen"] },
      electro: { v: "Ja", e: ["vermeldt elektrografische convulsies"] },
      mri: { v: "Letsel basale ganglia en thalamus", e: ["letsel van de basale ganglia en thalamus op MRI"] },
      feeding: { v: "Sondevoeding", e: ["sondevoeding"] },
      abnNeuro: { v: "Ja", e: ["afwijkende tonus en verminderde bewegingen bij overplaatsing"] },
    },
    notes: [
      { role: "Verloskunde — antenatale polikliniek", date: "2026-04-23", type: "antenatal", text: "Vaginale bevalling na keizersnede beproefd met één eerdere keizersnede in het onderste segment. Verminderde foetale bewegingen gemeld op de dag van opname. Geen langdurig gebroken vliezen en geen andere risicofactoren voor sepsis." },
      { role: "Verloskunde — Dr Mark Alvarez", date: "2026-04-23", type: "birth_summary", text: "Spoedkeizersnede wegens uterusruptuur met ernstige metabole acidose. Sterk meconiumhoudend vruchtwater werd waargenomen. Er waren geen kenmerken van chorioamnionitis. Baby direct afgeklemd voor reanimatie." },
      { role: "Verloskunde — Leah Morgan", date: "2026-04-23", type: "delivery", text: "Crash-keizersnede. Baby direct overgedragen aan het neonatale team; geen late navelstrengafklemming." },
      { role: "Neonatologie — reanimatieverslag", date: "2026-04-23", type: "resuscitation", text: "Baby geïntubeerd bij geboorte met aanhoudende hartmassage en herhaalde doses adrenaline voor terugkeer van de circulatie." },
      { role: "Neonatologie — metabool pasgeborene", date: "2026-04-24", type: "postnatal", text: "Ernstige hypoglykemie in de eerste uren waarvoor intraveneuze dextrose nodig was, in de context van significante encefalopathie." },
      { role: "Neonatologie — notitie aan bed", date: "2026-04-23", type: "nicu_admission", text: "Opgenomen op NICU na 0,3 uur met ernstige encefalopathie. Therapeutische koeling gestart op de leeftijd van 1,8 uur voor overplaatsing. CFM-curve aan bed aanvankelijk beoordeeld als normaal achtergrondpatroon gedurende de eerste uren na opname." },
      { role: "Neurologie — formeel rapport", date: "2026-04-25", type: "neurology_report", text: "Formeel neurologierapport vermeldt elektrografische convulsies en letsel van de basale ganglia en thalamus op MRI, in tegenspraak met de CFM-indruk aan bed van een normaal achtergrondpatroon. Er werden ook klinische convulsies waargenomen." },
      { role: "Neonatologie — overplaatsingsbrief", date: "2026-04-30", type: "discharge", text: "Op dag 7 overgeplaatst naar het regionale koel- en neurologiecentrum voor verdere zorg, en dus niet vanaf deze afdeling naar huis ontslagen. Op sondevoeding met afwijkende tonus en verminderde bewegingen bij overplaatsing." },
    ],
  },
};

// --- Records: Chest Pain (Flow B) -------------------------------------------
const chest = {
  CP001: {
    code: "CP001", age: 58, troponin: 320, ecg: "ST-elevatie, V2-V4", timeToEcg: 8,
    complaint: "Centrale beklemmende pijn op de borst", diagnosis: "STEMI", decision: "Opnemen",
    complaintEvidence: ["centrale beklemmende pijn op de borst uitstralend naar de linkerarm"],
    ecgEvidence: ["ST-elevatie in V2-V4"],
    diagnosisEvidence: ["een anterieure STEMI"],
    decisionEvidence: ["Opgenomen op de hartkatheterisatiekamer voor primaire PCI"],
    notes: {
      triage: { role: "Spoedverpleegkundige — Triage", date: "2026-05-04", type: "triage", text: "58-jarige man met 40 minuten centrale beklemmende pijn op de borst uitstralend naar de linkerarm, gepaard met zweten en misselijkheid." },
      cardiology: { role: "Cardiologie — Dr Mark Alvarez", date: "2026-05-04", type: "cardiology", text: "ECG toont ST-elevatie in V2-V4 passend bij een anterieure STEMI. Troponine sterk verhoogd. Verwezen voor primaire PCI." },
      discharge: { role: "Spoedeisende geneeskunde — Ontslag", date: "2026-05-04", type: "discharge_summary", text: "Opgenomen op de hartkatheterisatiekamer voor primaire PCI en overgebracht naar de hartbewakingsafdeling." },
    },
  },
  CP002: {
    code: "CP002", age: 47, troponin: 4, ecg: "Normaal sinusritme", timeToEcg: 14,
    complaint: "Pleuritische linkszijdige pijn op de borst", diagnosis: "Niet-cardiale pijn op de borst", decision: "Ontslaan",
    complaintEvidence: ["intermitterende linkszijdige scherpe pijn op de borst, erger bij inademing"],
    ecgEvidence: ["normaal sinusritme zonder ischemische veranderingen"],
    diagnosisEvidence: ["een cardiale oorzaak is onwaarschijnlijk"],
    decisionEvidence: ["Ontslagen naar huis met vangnetadvies"],
    notes: {
      triage: { role: "Spoedverpleegkundige — Triage", date: "2026-05-05", type: "triage", text: "47-jarige vrouw met intermitterende linkszijdige scherpe pijn op de borst, erger bij inademing, zonder uitstraling." },
      cardiology: { role: "Cardiologie — Dr Sara Lin", date: "2026-05-05", type: "cardiology", text: "ECG normaal sinusritme zonder ischemische veranderingen. Seriële troponine negatief. Pijn reproduceerbaar bij palpatie, daarom is een cardiale oorzaak is onwaarschijnlijk." },
      discharge: { role: "Spoedeisende geneeskunde — Ontslag", date: "2026-05-05", type: "discharge_summary", text: "Ontslagen naar huis met vangnetadvies en follow-up bij de huisarts." },
    },
  },
  CP003: {
    code: "CP003", age: 63, troponin: 95, ecg: "T-topinversie, inferieur", timeToEcg: 11,
    complaint: "Pijn op de borst uitstralend naar de kaak", diagnosis: "NSTEMI", decision: "Opnemen",
    complaintEvidence: ["zware pijn op de borst in rust, uitstralend naar de kaak"],
    ecgEvidence: ["T-topinversie in de inferieure afleidingen"],
    diagnosisEvidence: ["passend bij een NSTEMI"],
    decisionEvidence: ["Opgenomen onder cardiologie"],
    notes: {
      triage: { role: "Spoedverpleegkundige — Triage", date: "2026-05-07", type: "triage", text: "63-jarige man met twee uur zware pijn op de borst in rust, uitstralend naar de kaak, met bijkomende kortademigheid." },
      cardiology: { role: "Cardiologie — Dr Mark Alvarez", date: "2026-05-07", type: "cardiology", text: "ECG toont T-topinversie in de inferieure afleidingen. Troponinestijging bij seriële bepaling passend bij een NSTEMI. Voor plaatjesremmende therapie." },
      discharge: { role: "Spoedeisende geneeskunde — Ontslag", date: "2026-05-07", type: "discharge_summary", text: "Opgenomen onder cardiologie voor een NSTEMI met geplande klinische angiografie." },
    },
  },
  CP004: {
    code: "CP004", age: 72, troponin: null, troponinMissing: true, ecg: "AF, snelle ventriculaire respons", timeToEcg: 19,
    complaint: "Kortademigheid en beklemming op de borst", diagnosis: "Snel AF, ?ACS", decision: "Opnemen",
    complaintEvidence: ["kortademigheid en beklemming op de borst"],
    troponinEvidence: ["onderweg gehemolyseerd en de troponine kon niet gerapporteerd worden"],
    ecgEvidence: ["atriumfibrilleren met een snelle ventriculaire respons"],
    diagnosisEvidence: ["acuut coronair syndroom is niet uitgesloten"],
    decisionEvidence: ["Opgenomen op de medische beoordelingsafdeling"],
    notes: {
      triage: { role: "Spoedverpleegkundige — Triage", date: "2026-05-09", type: "triage", text: "72-jarige vrouw met kortademigheid en beklemming op de borst en een onregelmatig onregelmatige pols." },
      lab: { role: "Laboratorium — Biochemie", date: "2026-05-09", type: "lab", text: "Het bloedmonster is onderweg gehemolyseerd en de troponine kon niet gerapporteerd worden. Een nieuw monster is aangevraagd." },
      cardiology: { role: "Cardiologie — Dr Sara Lin", date: "2026-05-09", type: "cardiology", text: "ECG toont atriumfibrilleren met een snelle ventriculaire respons. Frequentiecontrole gestart; acuut coronair syndroom is niet uitgesloten in afwachting van een herhaalde troponine." },
      discharge: { role: "Spoedeisende geneeskunde — Ontslag", date: "2026-05-09", type: "discharge_summary", text: "Opgenomen op de medische beoordelingsafdeling voor frequentiecontrole en een herhaalde troponine." },
    },
  },
  CP005: {
    code: "CP005", age: 35, troponin: 6, ecg: null, ecgMissing: true, timeToEcg: null,
    complaint: "Musculoskeletale pijn op de borst", diagnosis: "Musculoskeletale pijn op de borst", decision: "Ontslaan",
    complaintEvidence: ["scherpe pijn op de linkerborst na een sportsessie"],
    diagnosisEvidence: ["waarschijnlijk musculoskeletale pijn op de borst"],
    decisionEvidence: ["Ontslagen met eenvoudige pijnstilling"],
    notes: {
      triage: { role: "Spoedverpleegkundige — Triage", date: "2026-05-10", type: "triage", text: "35-jarige man met scherpe pijn op de linkerborst na een sportsessie, reproduceerbaar bij beweging." },
      cardiology: { role: "Cardiologie — Dr Sara Lin", date: "2026-05-10", type: "cardiology", text: "Lage klinische verdenking op een cardiale oorzaak en troponine negatief. De patiënt heeft zichzelf ontslagen voordat een ECG kon worden gemaakt." },
      discharge: { role: "Spoedeisende geneeskunde — Ontslag", date: "2026-05-10", type: "discharge_summary", text: "Ontslagen met eenvoudige pijnstilling wegens waarschijnlijk musculoskeletale pijn op de borst." },
    },
  },
  CP006: {
    code: "CP006", age: 55, troponin: 12, ecg: "Normaal sinusritme", timeToEcg: 22,
    complaint: "Beklemming op de borst bij inspanning", diagnosis: "Stabiele angina pectoris", decision: "Opnemen",
    complaintEvidence: ["beklemming op de borst bij inspanning de afgelopen week"],
    ecgEvidence: ["Rust-ECG normaal sinusritme"],
    diagnosisEvidence: ["suggestief voor stabiele angina pectoris"],
    decisionEvidence: ["Opgenomen op de observatieafdeling"],
    notes: {
      triage: { role: "Spoedverpleegkundige — Triage", date: "2026-05-12", type: "triage", text: "55-jarige man met beklemming op de borst bij inspanning de afgelopen week, verlicht door rust." },
      cardiology: { role: "Cardiologie — Dr Mark Alvarez", date: "2026-05-12", type: "cardiology", text: "Rust-ECG normaal sinusritme. Troponine op de bovengrens van de referentiewaarde zonder dynamische verandering. Anamnese suggestief voor stabiele angina pectoris." },
      discharge: { role: "Spoedeisende geneeskunde — Ontslag", date: "2026-05-12", type: "discharge_summary", text: "Opgenomen op de observatieafdeling voor seriële troponine en een inspanningstest." },
    },
  },
  CP007: {
    code: "CP007", age: 68, troponin: 210, ecg: "ST-depressie, lateraal", timeToEcg: 9,
    complaint: "Epigastrische en centrale pijn op de borst", diagnosis: "NSTEMI", decision: "Opnemen",
    complaintEvidence: ["epigastrische en centrale pijn op de borst met braken"],
    ecgEvidence: ["ST-depressie in de laterale afleidingen"],
    diagnosisEvidence: ["passend bij een NSTEMI"],
    decisionEvidence: ["Opgenomen onder cardiologie"],
    notes: {
      triage: { role: "Spoedverpleegkundige — Triage", date: "2026-05-14", type: "triage", text: "68-jarige vrouw met epigastrische en centrale pijn op de borst met braken." },
      cardiology: { role: "Cardiologie — Dr Sara Lin", date: "2026-05-14", type: "cardiology", text: "ECG toont ST-depressie in de laterale afleidingen. Troponine significant verhoogd, passend bij een NSTEMI. Dubbele plaatjesremmende therapie gestart." },
      discharge: { role: "Spoedeisende geneeskunde — Ontslag", date: "2026-05-14", type: "discharge_summary", text: "Opgenomen onder cardiologie voor een NSTEMI en klinische angiografie." },
    },
  },
  CP008: {
    code: "CP008", age: 41, troponin: 3, ecg: "Normaal", timeToEcg: 16,
    complaint: "Pijn op de borst na tillen", diagnosis: "Niet-cardiale pijn op de borst", decision: "Ontslaan",
    complaintEvidence: ["scherpe, kortdurende pijn op de borst na zwaar tillen"],
    ecgEvidence: ["ECG normaal zonder acute veranderingen"],
    diagnosisEvidence: ["Geen kenmerken van een acuut coronair syndroom"],
    decisionEvidence: ["Ontslagen naar huis met geruststelling"],
    notes: {
      triage: { role: "Spoedverpleegkundige — Triage", date: "2026-05-16", type: "triage", text: "41-jarige man met scherpe, kortdurende pijn op de borst na zwaar tillen." },
      cardiology: { role: "Cardiologie — Dr Mark Alvarez", date: "2026-05-16", type: "cardiology", text: "ECG normaal zonder acute veranderingen. Troponine negatief bij seriële bepaling. Geen kenmerken van een acuut coronair syndroom." },
      discharge: { role: "Spoedeisende geneeskunde — Ontslag", date: "2026-05-16", type: "discharge_summary", text: "Ontslagen naar huis met geruststelling en advies om terug te keren als de klachten terugkeren." },
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
      insulin: { v: "Insulin pump (CSII)", e: ["Behandeld met een insulinepomp (CSII)"] },
      cgm: { v: "Yes", e: ["gebruikt een continue glucosemeter"] },
      lifestyle: { v: "Yes", e: ["Leefstijl- en voedingsaanpassing werd aanbevolen"] },
      dietitian: { v: "Yes", e: ["aanvullende afspraak met de kinderdiëtist werd aangeboden"] },
      psych: { v: "No", e: ["Geen aanvullende psychologische ondersteuning was nodig"] },
      smoking: { v: "No", e: ["rookt of vapet niet"] },
    },
    notes: [
      { role: "Kinderdiabetes — Dr Naomi Clarke", date: "2025-11-04", type: "diabetes_clinic", text: "Gecontroleerd op de polikliniek kinderdiabetes. Behandeld met een insulinepomp (CSII) en gebruikt een continue glucosemeter. Leefstijl- en voedingsaanpassing werd aanbevolen om de bloedglucosewaarden te helpen verlagen. Een aanvullende afspraak met de kinderdiëtist werd aangeboden." },
      { role: "Klinische psychologie — Dr Owen Pratt", date: "2025-11-04", type: "psychology", text: "Jaarlijkse psychologische screening voltooid. Geen aanvullende psychologische ondersteuning was nodig buiten de reguliere zorg." },
      { role: "Kinderdiabetes — jaarlijkse controle", date: "2025-11-04", type: "annual_review", text: "Jaarlijkse controle voltooid. De jongere rookt of vapet niet." },
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
      insulin: { v: "MDI (basal-bolus)", e: ["multiple daily injection (MDI) basaal-bolusregime"] },
      cgm: { v: "Yes", e: ["gebruikt een continue glucosemeter"] },
      lifestyle: { v: "Yes", e: ["Leefstijl- en voedingsaanpassing werd aanbevolen"] },
      dietitian: { v: "Yes", e: ["aanvullende afspraak met de kinderdiëtist werd aangeboden"] },
      psych: { v: "Yes", e: ["Aanvullende psychologische ondersteuning buiten de reguliere zorg werd aanbevolen"] },
      smoking: { v: "No", e: ["rookt of vapet niet"] },
    },
    notes: [
      { role: "Kinderdiabetes — Dr Naomi Clarke", date: "2025-12-09", type: "diabetes_clinic", text: "Gecontroleerd op de polikliniek met HbA1c boven de streefwaarde. Behandeld met een multiple daily injection (MDI) basaal-bolusregime en gebruikt een continue glucosemeter. Leefstijl- en voedingsaanpassing werd aanbevolen om de bloedglucosewaarden te helpen verlagen. Een aanvullende afspraak met de kinderdiëtist werd aangeboden." },
      { role: "Klinische psychologie — Dr Owen Pratt", date: "2025-12-09", type: "psychology", text: "Jaarlijkse psychologische screening voltooid. De jongere vindt het moeilijk om therapietrouw te zijn. Aanvullende psychologische ondersteuning buiten de reguliere zorg werd aanbevolen." },
      { role: "Kinderdiabetes — jaarlijkse controle", date: "2025-12-09", type: "annual_review", text: "Jaarlijkse controle voltooid. De jongere rookt of vapet niet." },
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
      insulin: { v: "MDI (basal-bolus)", e: ["multiple daily injection (MDI) basaal-bolusregime"] },
      cgm: { v: "Yes", e: ["gebruikt een continue glucosemeter"] },
      lifestyle: { v: "Yes", e: ["Leefstijl- en voedingsaanpassing werd aanbevolen"] },
      dietitian: { v: "Yes", e: ["aanvullende afspraak met de kinderdiëtist werd aangeboden"] },
      psych: { v: "No", e: ["Geen aanvullende psychologische ondersteuning was nodig"] },
      smoking: { v: "No", e: ["rookt of vapet niet"] },
      admission: { v: "DKA (new diagnosis)", e: ["diabetische ketoacidose (DKA) op het moment van de nieuwe diagnose"] },
    },
    notes: [
      { role: "Kinderdiabetes — Dr Naomi Clarke", date: "2026-02-19", type: "diabetes_clinic", text: "Eerste poliklinische controle na een nieuwe diagnose. Behandeld met een multiple daily injection (MDI) basaal-bolusregime en gebruikt een continue glucosemeter. Leefstijl- en voedingsaanpassing werd aanbevolen om de bloedglucosewaarden te helpen verlagen. Een aanvullende afspraak met de kinderdiëtist werd aangeboden." },
      { role: "Klinische psychologie — Dr Owen Pratt", date: "2026-02-19", type: "psychology", text: "Psychologische screening voltooid bij de eerste controle. Geen aanvullende psychologische ondersteuning was nodig buiten de reguliere zorg." },
      { role: "Kinderdiabetes — jaarlijkse controle", date: "2026-02-19", type: "annual_review", text: "Controle voltooid. Het kind rookt of vapet niet." },
      { role: "Kindergeneeskunde — opname", date: "2026-01-22", type: "admission", text: "Bij presentatie opgenomen in diabetische ketoacidose (DKA) op het moment van de nieuwe diagnose. Behandeld volgens het DKA-traject met intraveneuze insuline en vocht, met goed herstel." },
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
      insulin: { v: "Insulin pump (CSII)", e: ["Behandeld met een insulinepomp (CSII)"] },
      cgm: { v: "Yes", e: ["gebruikt een continue glucosemeter"] },
      lifestyle: { v: "Yes", e: ["Leefstijl- en voedingsaanpassing werd aanbevolen"] },
      dietitian: { v: "No", e: ["Geen aanvullende diëtistenafspraak was nodig"] },
      psych: { v: "No", e: ["Geen aanvullende psychologische ondersteuning was nodig"] },
      smoking: { v: "No", e: ["rookt of vapet niet"] },
    },
    notes: [
      { role: "Kinderdiabetes — Dr Naomi Clarke", date: "2025-10-28", type: "diabetes_clinic", text: "Gecontroleerd op de polikliniek met goede regulatie. Behandeld met een insulinepomp (CSII) en gebruikt een continue glucosemeter. Leefstijl- en voedingsaanpassing werd aanbevolen om de bloedglucosewaarden te helpen verlagen. Geen aanvullende diëtistenafspraak was nodig bij dit bezoek." },
      { role: "Klinische psychologie — Dr Owen Pratt", date: "2025-10-28", type: "psychology", text: "Jaarlijkse psychologische screening voltooid. Geen aanvullende psychologische ondersteuning was nodig buiten de reguliere zorg." },
      { role: "Kinderdiabetes — jaarlijkse controle", date: "2025-10-28", type: "annual_review", text: "Jaarlijkse controle voltooid. Het kind rookt of vapet niet." },
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
      insulin: { v: "MDI (basal-bolus)", e: ["multiple daily injection (MDI) basaal-bolusregime"] },
      cgm: { v: "No", e: ["gebruikt momenteel geen continue glucosemeter"] },
      lifestyle: { v: "Yes", e: ["Leefstijl- en voedingsaanpassing werd aanbevolen"] },
      dietitian: { v: "Yes", e: ["aanvullende afspraak met de kinderdiëtist werd aangeboden"] },
      psych: { v: "Yes", e: ["Aanvullende psychologische ondersteuning buiten de reguliere zorg werd aanbevolen"] },
      smoking: { v: "Smokes", e: ["rookt momenteel"] },
    },
    notes: [
      { role: "Kinderdiabetes — Dr Naomi Clarke", date: "2025-11-25", type: "diabetes_clinic", text: "Gecontroleerd op de polikliniek; de regulatie blijft een zorg. Behandeld met een multiple daily injection (MDI) basaal-bolusregime en gebruikt momenteel geen continue glucosemeter. Leefstijl- en voedingsaanpassing werd aanbevolen om de bloedglucosewaarden te helpen verlagen. Een aanvullende afspraak met de kinderdiëtist werd aangeboden." },
      { role: "Klinische psychologie — Dr Owen Pratt", date: "2025-11-25", type: "psychology", text: "Jaarlijkse psychologische screening voltooid. Aanvullende psychologische ondersteuning buiten de reguliere zorg werd aanbevolen gezien sombere stemming en diabetesgerelateerde stress." },
      { role: "Kinderdiabetes — jaarlijkse controle", date: "2025-11-25", type: "annual_review", text: "Jaarlijkse controle voltooid. De jongere rookt momenteel; advies om te stoppen met roken werd aangeboden." },
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
      insulin: { v: "MDI (basal-bolus)", e: ["multiple daily injection (MDI) basaal-bolusregime"] },
      cgm: { v: "No", e: ["gebruikt momenteel geen continue glucosemeter"] },
      lifestyle: { v: "Yes", e: ["Leefstijl- en voedingsaanpassing werd aanbevolen"] },
      dietitian: { v: "Yes", e: ["aanvullende afspraak met de kinderdiëtist werd aangeboden"] },
      psych: { v: "Yes", e: ["Aanvullende psychologische ondersteuning buiten de reguliere zorg werd aanbevolen"] },
      smoking: { v: "No", e: ["rookt of vapet niet"] },
      admission: { v: "DKA", e: ["diabetische ketoacidose (DKA) na een intercurrente ziekte"] },
    },
    notes: [
      { role: "Kinderdiabetes — Dr Naomi Clarke", date: "2025-12-16", type: "diabetes_clinic", text: "Gecontroleerd op de polikliniek na een recente opname. Behandeld met een multiple daily injection (MDI) basaal-bolusregime en gebruikt momenteel geen continue glucosemeter. Leefstijl- en voedingsaanpassing werd aanbevolen om de bloedglucosewaarden te helpen verlagen. Een aanvullende afspraak met de kinderdiëtist werd aangeboden." },
      { role: "Klinische psychologie — Dr Owen Pratt", date: "2025-12-16", type: "psychology", text: "Jaarlijkse psychologische screening voltooid. Aanvullende psychologische ondersteuning buiten de reguliere zorg werd aanbevolen ter ondersteuning van het zelfmanagement." },
      { role: "Kinderdiabetes — jaarlijkse controle", date: "2025-12-16", type: "annual_review", text: "Jaarlijkse controle voltooid. Het kind rookt of vapet niet." },
      { role: "Kindergeneeskunde — opname", date: "2025-08-07", type: "admission", text: "Spoedopname met diabetische ketoacidose (DKA) na een intercurrente ziekte. Behandeld volgens het DKA-traject en ontslagen met herhaalde ziektedagregels." },
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
      insulin: { v: "Insulin pump (CSII)", e: ["Behandeld met een insulinepomp (CSII)"] },
      cgm: { v: "Yes", e: ["gebruikt een continue glucosemeter"] },
      lifestyle: { v: "Yes", e: ["Leefstijl- en voedingsaanpassing werd aanbevolen"] },
      dietitian: { v: "Yes", e: ["aanvullende afspraak met de kinderdiëtist werd aangeboden"] },
      psych: { v: "No", e: ["Geen aanvullende psychologische ondersteuning was nodig"] },
      smoking: { v: "No", e: ["rookt of vapet niet"] },
    },
    notes: [
      { role: "Kinderdiabetes — Dr Naomi Clarke", date: "2025-11-18", type: "diabetes_clinic", text: "Vroege controle van een jong kind na de diagnose. Behandeld met een insulinepomp (CSII) en gebruikt een continue glucosemeter. Leefstijl- en voedingsaanpassing werd aanbevolen aan het gezin om de bloedglucosewaarden te helpen verlagen. Een aanvullende afspraak met de kinderdiëtist werd aangeboden." },
      { role: "Klinische psychologie — Dr Owen Pratt", date: "2025-11-18", type: "psychology", text: "Psychologische screening voltooid met het gezin. Geen aanvullende psychologische ondersteuning was nodig buiten de reguliere zorg." },
      { role: "Kinderdiabetes — jaarlijkse controle", date: "2025-11-18", type: "annual_review", text: "Controle voltooid. Het kind rookt of vapet niet." },
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
      insulin: { v: "Insulin pump (CSII)", e: ["Behandeld met een insulinepomp (CSII)"] },
      cgm: { v: "Yes", e: ["gebruikt een continue glucosemeter"] },
      lifestyle: { v: "Yes", e: ["Leefstijl- en voedingsaanpassing werd aanbevolen"] },
      dietitian: { v: "Yes", e: ["aanvullende afspraak met de kinderdiëtist werd aangeboden"] },
      psych: { v: "No", e: ["Geen aanvullende psychologische ondersteuning was nodig"] },
      smoking: { v: "Vapes", e: ["vapet regelmatig"] },
    },
    notes: [
      { role: "Kinderdiabetes — Dr Naomi Clarke", date: "2025-12-02", type: "diabetes_clinic", text: "Gecontroleerd op de polikliniek. Behandeld met een insulinepomp (CSII) en gebruikt een continue glucosemeter. Leefstijl- en voedingsaanpassing werd aanbevolen om de bloedglucosewaarden te helpen verlagen. Een aanvullende afspraak met de kinderdiëtist werd aangeboden." },
      { role: "Klinische psychologie — Dr Owen Pratt", date: "2025-12-02", type: "psychology", text: "Jaarlijkse psychologische screening voltooid. Geen aanvullende psychologische ondersteuning was nodig buiten de reguliere zorg." },
      { role: "Kinderdiabetes — jaarlijkse controle", date: "2025-12-02", type: "annual_review", text: "Jaarlijkse controle voltooid. De jongere vapet regelmatig; advies om te stoppen werd aangeboden." },
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
      insulin: { v: "MDI (basal-bolus)", e: ["multiple daily injection (MDI) basaal-bolusregime"] },
      cgm: { v: "Yes", e: ["gebruikt een continue glucosemeter"] },
      lifestyle: { v: "Yes", e: ["Leefstijl- en voedingsaanpassing werd aanbevolen"] },
      dietitian: { v: "No", e: ["Geen aanvullende diëtistenafspraak was nodig"] },
      psych: { v: "No", e: ["Geen aanvullende psychologische ondersteuning was nodig"] },
      smoking: { v: "No", e: ["rookt of vapet niet"] },
    },
    notes: [
      { role: "Kinderdiabetes — Dr Naomi Clarke", date: "2025-11-11", type: "diabetes_clinic", text: "Gecontroleerd op de polikliniek met stabiele regulatie. Behandeld met een multiple daily injection (MDI) basaal-bolusregime en gebruikt een continue glucosemeter. Leefstijl- en voedingsaanpassing werd aanbevolen om de bloedglucosewaarden te helpen verlagen. Geen aanvullende diëtistenafspraak was nodig bij dit bezoek." },
      { role: "Klinische psychologie — Dr Owen Pratt", date: "2025-11-11", type: "psychology", text: "Jaarlijkse psychologische screening voltooid. Geen aanvullende psychologische ondersteuning was nodig buiten de reguliere zorg." },
      { role: "Kinderdiabetes — jaarlijkse controle", date: "2025-11-11", type: "annual_review", text: "Jaarlijkse controle voltooid. Het kind rookt of vapet niet." },
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
      insulin: { v: "MDI (basal-bolus)", e: ["multiple daily injection (MDI) basaal-bolusregime"] },
      cgm: { v: "Yes", e: ["gebruikt een continue glucosemeter"] },
      lifestyle: { v: "Yes", e: ["Leefstijl- en voedingsaanpassing werd aanbevolen"] },
      dietitian: { v: "Yes", e: ["aanvullende afspraak met de kinderdiëtist werd aangeboden"] },
      psych: { v: "No", e: ["Geen aanvullende psychologische ondersteuning was nodig"] },
      smoking: { v: "No", e: ["rookt of vapet niet"] },
    },
    notes: [
      { role: "Kinderdiabetes — Dr Naomi Clarke", date: "2025-10-21", type: "diabetes_clinic", text: "Gecontroleerd op de polikliniek. Behandeld met een multiple daily injection (MDI) basaal-bolusregime en gebruikt een continue glucosemeter. Leefstijl- en voedingsaanpassing werd aanbevolen om de bloedglucosewaarden te helpen verlagen. Een aanvullende afspraak met de kinderdiëtist werd aangeboden." },
      { role: "Klinische psychologie — Dr Owen Pratt", date: "2025-10-21", type: "psychology", text: "Jaarlijkse psychologische screening voltooid. Geen aanvullende psychologische ondersteuning was nodig buiten de reguliere zorg." },
      { role: "Kinderdiabetes — jaarlijkse controle", date: "2025-10-21", type: "annual_review", text: "Jaarlijkse controle voltooid. De jongere rookt of vapet niet." },
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
      insulin: { v: "Insulin pump (CSII)", e: ["Behandeld met een insulinepomp (CSII)"] },
      cgm: { v: "Yes", e: ["gebruikt een continue glucosemeter"] },
      lifestyle: { v: "Yes", e: ["Leefstijl- en voedingsaanpassing werd aanbevolen"] },
      dietitian: { v: "No", e: ["Geen aanvullende diëtistenafspraak was nodig"] },
      psych: { v: "No", e: ["Geen aanvullende psychologische ondersteuning was nodig"] },
      smoking: { v: "No", e: ["rookt of vapet niet"] },
    },
    notes: [
      { role: "Kinderdiabetes — Dr Naomi Clarke", date: "2025-12-19", type: "diabetes_clinic", text: "Gecontroleerd op de polikliniek met goede regulatie. Behandeld met een insulinepomp (CSII) en gebruikt een continue glucosemeter. Leefstijl- en voedingsaanpassing werd aanbevolen om de bloedglucosewaarden te helpen verlagen. Geen aanvullende diëtistenafspraak was nodig bij dit bezoek." },
      { role: "Klinische psychologie — Dr Owen Pratt", date: "2025-12-19", type: "psychology", text: "Jaarlijkse psychologische screening voltooid. Geen aanvullende psychologische ondersteuning was nodig buiten de reguliere zorg." },
      { role: "Kinderdiabetes — jaarlijkse controle", date: "2025-12-19", type: "annual_review", text: "Jaarlijkse controle voltooid. Het kind rookt of vapet niet." },
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
      insulin: { v: "Diet and metformin (no insulin)", e: ["behandeld met metformine zonder insuline"] },
      cgm: { v: "No", e: ["gebruikt momenteel geen continue glucosemeter"] },
      lifestyle: { v: "Yes", e: ["Leefstijl- en voedingsaanpassing werd aanbevolen"] },
      dietitian: { v: "Yes", e: ["aanvullende afspraak met de kinderdiëtist werd aangeboden"] },
      psych: { v: "Yes", e: ["Aanvullende psychologische ondersteuning buiten de reguliere zorg werd aanbevolen"] },
      smoking: { v: "No", e: ["rookt of vapet niet"] },
    },
    notes: [
      { role: "Kinderdiabetes — Dr Naomi Clarke", date: "2025-11-28", type: "diabetes_clinic", text: "Gecontroleerd op de polikliniek type 2-diabetes voor jongeren. Momenteel behandeld met metformine zonder insuline, en gebruikt momenteel geen continue glucosemeter. Leefstijl- en voedingsaanpassing werd aanbevolen om de bloedglucosewaarden te helpen verlagen. Een aanvullende afspraak met de kinderdiëtist werd aangeboden." },
      { role: "Klinische psychologie — Dr Owen Pratt", date: "2025-11-28", type: "psychology", text: "Jaarlijkse psychologische screening voltooid. Aanvullende psychologische ondersteuning buiten de reguliere zorg werd aanbevolen rondom gewicht en welzijn." },
      { role: "Kinderdiabetes — jaarlijkse controle", date: "2025-11-28", type: "annual_review", text: "Jaarlijkse controle voltooid. De jongere rookt of vapet niet." },
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
    Male: { code: 1, label: "Man" },
    Female: { code: 2, label: "Vrouw" },
    "Not specified": { code: 3, label: "Niet gespecificeerd" },
    Unknown: { code: 99, label: "Onbekend" },
  },
  // item 5 — Ethnic category. `label` is the exact NPDA wording shown as evidence.
  ethnicity: {
    "White British": { code: "A", label: "Wit - Brits" },
    "White — Other": { code: "C", label: "Wit - Elke andere witte achtergrond" },
    "Mixed — White and Black Caribbean": { code: "D", label: "Gemengd - Wit en Zwart Caribisch" },
    "Asian — Indian": { code: "H", label: "Aziatisch - Indiaas" },
    "Asian — Pakistani": { code: "J", label: "Aziatisch - Pakistaans" },
    "Asian — Bangladeshi": { code: "K", label: "Aziatisch - Bengalees" },
    "Black Caribbean": { code: "M", label: "Zwart - Caribisch" },
    "Black African": { code: "N", label: "Zwart - Afrikaans" },
  },
  // item 8 — Diabetes Type.
  diabetesType: {
    "Type 1": { code: 1, label: "Type 1 diabetes mellitus" },
    "Type 2": { code: 2, label: "Type 2 diabetes mellitus" },
  },
  // item 21 — Insulin regime at time of visit.
  insulinRegime: {
    "Insulin pump (CSII)": { code: 4, label: "een losstaande insulinepomp" },
    "MDI (basal-bolus)": { code: 3, label: "een multiple daily injection basaal-bolusregime (vier of meer injecties per dag)" },
    "Diet and metformin (no insulin)": { code: 1, label: "geen insuline (behandeld met dieet en metformine)" },
  },
  // item 24 — CGM in use.
  cgm: {
    Yes: { code: 1, label: "gebruikt een continue glucosemeter" },
    No: { code: 2, label: "gebruikt geen continue glucosemeter" },
  },
  // 1 = Yes, 2 = No, 99 = Unknown — items 23, 48, 51 (labels not displayed).
  yesNo: { Yes: 1, No: 2, Unknown: 99 },
  // item 43 — Does the patient smoke and/or vape?
  smoking: {
    No: { code: 1, label: "een niet-roker en niet-vaper" },
    Smokes: { code: 2, label: "een actieve roker (niet-vaper)" },
    Vapes: { code: 3, label: "een actieve vaper (niet-roker)" },
  },
  // item 33 — Retinal screening result.
  retinal: {
    "No retinopathy": { code: 1, label: "Normaal" },
    "Background retinopathy": { code: 2, label: "Afwijkend (achtergrondretinopathie)" },
  },
  // item 55 — Reason for admission. Every modelled admission is acute DKA (= 1).
  admissionDka: { code: 1, label: "een acute opname met diabetische ketoacidose (DKA)" },
  // --- code→label maps keyed by the permitted-value code ---
  // item 6 — ADHD / ASD diagnosis.
  adhdAsd: { 1: "Ja, ADHD", 2: "Ja, ASS", 3: "Ja, zowel ADHD als ASS", 4: "Nee, geen van beide", 99: "Onbekend" },
  // item 7 — Learning disability. Also items 25, 26, 42 (Yes/No/Unknown).
  yesNo99: { 1: "Ja", 2: "Nee", 99: "Onbekend" },
  // item 11 — Reason for leaving service.
  leavingReason: { 1: "Overgegaan naar volwassenendiabeteszorg", 2: "Buiten het gebied verhuisd", 3: "Overig" },
  // item 22 — Other (non-insulin) blood-glucose-lowering medication.
  otherMed: { 1: "Geen medicatie", 2: "Alleen metformine", 3: "GLP-1-agonist", 4: "SGLT2-remmer", 5: "Overig", 99: "Onbekend" },
  // item 36 — Albuminuria stage.
  albuminuriaStage: { 1: "Normoalbuminurie", 2: "Microalbuminurie", 3: "Macroalbuminurie", 99: "Onbekend" },
  // item 40 — Thyroid treatment.
  thyroidTx: { 1: "Geen schildkliertherapie", 2: "Thyroxine voor hypothyreoïdie", 3: "Antithyreoïdmedicatie voor hyperthyreoïdie", 99: "Onbekend" },
  // item 49 — Mental health appointment offered.
  mentalHealthAppt: { 1: "Aangeboden en bijgewoond", 2: "Aangeboden en niet bijgewoond", 3: "Aangeboden en geweigerd", 4: "Niet aangeboden", 5: "Geestelijke gezondheidszorg elders verkregen", 99: "Onbekend" },
  // item 57 — DKA therapies given during the admission.
  dkaTherapy: { 1: "Hypertoon zout", 2: "Mannitol", 3: "Bicarbonaatinfuus", 4: "Geen van bovenstaande" },
};

// --- Short inline value labels ----------------------------------------------
const labels = {
  na: "N.v.t.",
  notRecorded: "Niet geregistreerd",
  unavailable: "Niet beschikbaar",
  notNormalised: "Niet genormaliseerd",
  naTransferred: "N.v.t. (overgeplaatst)",
  notDone: "Niet uitgevoerd",
  notPerformed: "Niet uitgevoerd",
  // Displayed cord Yes/No cell values. These are ALSO matched in mockData.js
  // logic (e.g. r.ctgDone === labels.yes), so a translation MUST use the same
  // word for the cord record Yes/No values and for these labels.
  yes: "Ja",
  no: "Nee",
};

// --- Mock audit-detail strings (criteria + summary) -------------------------
const auditDetail = {
  databaseSummary: "Demografie, opnames en gecodeerde klinische gebeurtenissen voor de cohortkoppeling.",
  criteria: {
    age: { label: "Leeftijd patiënt", unit: "jaar" },
    admissionDate: { label: "Opnamedatum" },
  },
};

const specValues = {
  condition: {
    cordBloodGasSampling: "Navelstrengbloedgasanalyse",
    neonatalAdmission: "Neonatale opname",
    acuteSoreThroat: "Acute keelpijn",
    chestPain: "Pijn op de borst",
  },
  specialty: {
    neonatology: "Neonatologie",
    obstetrics: "Verloskunde",
    paediatrics: "Kindergeneeskunde",
    ent: "KNO",
    cardiology: "Cardiologie",
    generalMedicine: "Algemene geneeskunde",
    emergencyMedicine: "Spoedeisende geneeskunde",
  },
  ward: {
    nicu: "NICU",
    emergencyDepartment: "Spoedeisende hulp",
    maternityUnit: "Kraamafdeling",
    wardPrefix: "Afdeling",
  },
  admissionMethod: {
    emergency: "Spoed",
    elective: "Electief",
    transfer: "Overplaatsing",
    dayCase: "Dagbehandeling",
  },
  age: {
    neonates: "Pasgeborenen",
    paediatric: "Pediatrisch",
    overPrefix: "Boven",
    underPrefix: "Onder",
  },
  sex: {
    male: "Man",
    female: "Vrouw",
  },
  gestation: {
    minWeeks: "≥ 34 weken",
  },
  fallback: {
    customFilter: "Aangepaste filter",
  },
};

// --- Right-panel explanation strings (FUNCTIONS; preserve ${…}) -------------
// Each function takes the args it interpolates and returns the user-visible
// explanation. Keyed by builder + field; translate the returned strings, keeping
// the interpolated values (codes, dates, patient codes) in place.
const explain = {
  // gasCell
  gasUnavailable: (code) => `Uit de obstetrische geboortesamenvatting voor ${code} — het arteriële navelstrengmonster is gestold, daarom werd er geen geldig navelstrenggas geregistreerd.`,
  gasLactateNotRecorded: (code) => `Het navelstrenggaspaneel voor ${code} bevatte geen lactaatwaarde.`,
  gasPanel: (code) => `Uit het EPD-navelstrenggaspaneel voor ${code} — pH, base excess en lactaat van de arteria umbilicalis.`,
  // repeatGasField
  repeatGasNone: (code, label) => `Er werd geen herhaald navelstrenggas uitgevoerd voor ${code} — het eerste gas gaf daartoe geen aanleiding — daarom is ${label} niet geregistreerd.`,
  repeatGasNotNormalised: (code, label) => `Het navelstrenglactaat voor ${code} was voor overplaatsing niet genormaliseerd, daarom is ${label} niet geregistreerd.`,
  repeatGasValue: (code, label) => `Uit het herhaalde navelstrenggasverslag voor ${code} — ${label}.`,
  // repeatGasField labels (the `label` arg passed into the three above)
  repeatGasLabelAge: "de leeftijd in uren bij het herhaalde gas",
  repeatGasLabelLactate: "het herhaalde lactaat",
  repeatGasLabelNormalised: "de leeftijd in uren waarop het gas genormaliseerd was",

  // makeCordAllCell
  cordPatient: (code) => `De patiëntcode die ${code} in het EPD identificeert.`,
  cordGestWeeks: (code) => `Uit het EPD-geboorteverslag voor ${code} — zwangerschapsduur in voltooide weken.`,
  cordGestDays: (code) => `Uit het EPD-geboorteverslag voor ${code} — zwangerschapsdagen boven de voltooide weken.`,
  cordMaternalAge: (code) => `Uit de EPD-demografie voor ${code} — leeftijd van de moeder bij de bevalling.`,
  cordParity: (code) => `Uit de EPD-demografie voor ${code} — pariteit van de moeder.`,
  cordFoetalMovements: (code) => `Uit de antenatale notitie voor ${code} — gemelde foetale bewegingen.`,
  cordMaternalComorbidities: (code) => `Uit de antenatale notitie voor ${code} — gedocumenteerde comorbiditeit bij de moeder.`,
  cordMaternalComorbiditiesOther: (code) => `Uit de antenatale notitie voor ${code} — overige relevante voorgeschiedenis van de moeder.`,
  cordNormalScans: (code) => `Uit het antenatale echoverslag voor ${code} — of de groei-echo's normaal waren.`,
  cordNormalDopplers: (code) => `Uit het antenatale echoverslag voor ${code} — of de dopplers van de arteria umbilicalis normaal waren.`,
  cordCtgDoneYes: (code) => `Uit het intrapartumverslag voor ${code} — er werd continu CTG uitgevoerd.`,
  cordCtgDoneNo: (code) => `Uit het intrapartumverslag voor ${code} — baring bewaakt met intermitterende auscultatie; geen continu CTG uitgevoerd.`,
  cordLiquorMeconium: (code) => `Uit de geboortesamenvatting voor ${code} — de toestand van het vruchtwater.`,
  cordChorioamnionitis: (code) => `Uit de geboortesamenvatting voor ${code} — eventuele chorioamnionitis.`,
  cordProm: (code) => `Uit de antenatale notitie voor ${code} — langdurig gebroken vliezen langer dan 18 uur.`,
  cordRffs: (code) => `Uit de antenatale notitie voor ${code} — risicofactoren voor sepsis.`,
  cordSentinelEvent: (code) => `Uit de geboortesamenvatting voor ${code} — eventuele sentinel-gebeurtenis tijdens de baring.`,
  cordDelivery: (code) => `Uit het EPD-geboorteverslag voor ${code} — wijze van bevalling.`,
  cordBirthWeight: (code) => `Uit het EPD-geboorteverslag voor ${code} — geboortegewicht in gram.`,
  cordApgar1: (code) => `Uit het EPD-geboorteverslag voor ${code} — Apgar-score na één minuut.`,
  cordApgar5: (code) => `Uit het EPD-geboorteverslag voor ${code} — Apgar-score na vijf minuten.`,
  cordApgar10: (code) => `Uit het EPD-geboorteverslag voor ${code} — Apgar-score na tien minuten.`,
  cordDccYes: (code) => `Uit de obstetrische geboortesamenvatting en de verloskundige bevallingsnotitie voor ${code} — beide vermelden late navelstrengafklemming, daarom is dit gedocumenteerd als uitgevoerd.`,
  cordDccNo: (code) => `Uit de obstetrische geboortesamenvatting en de verloskundige bevallingsnotitie voor ${code} — beide vermelden dat de navelstreng vroeg werd afgeklemd, daarom werd late afklemming niet uitgevoerd.`,
  cordIntubated: (code) => `Uit het reanimatieverslag voor ${code} — of de baby bij de geboorte werd geïntubeerd.`,
  cordCompressions: (code) => `Uit het reanimatieverslag voor ${code} — of er hartmassage werd gegeven.`,
  cordDrugs: (code) => `Uit het reanimatieverslag voor ${code} — eventueel toegediende reanimatiemedicatie.`,
  cordWard: (code) => `Uit het EPD-contact voor ${code} — de afdeling ten tijde van de audit.`,
  cordGasRepeatedYes: (code) => `Er werd een herhaald navelstreng-/neonataal gas uitgevoerd voor ${code}.`,
  cordGasRepeatedNo: (code) => `Er werd geen herhaald navelstreng-/neonataal gas uitgevoerd voor ${code}.`,
  cordHypoglycaemia: (code) => `Uit de metabole notitie van de pasgeborene voor ${code} — eventuele hypoglykemie.`,
  cordAdmittedNicu: (code) => `Uit de NICU-opnametabel voor ${code} — of de baby op de neonatale afdeling werd opgenomen.`,
  cordAgeDischargeHomeTransferred: (code) => `${code} werd overgeplaatst naar het regionale centrum en niet vanaf deze afdeling naar huis ontslagen, daarom is de leeftijd bij ontslag naar huis hier niet geregistreerd.`,
  cordAgeDischargeHome: (code) => `Uit het ontslagverslag voor ${code} — leeftijd in dagen bij ontslag naar huis.`,
  cordUnitQuestionnaire: () => `Uit het governanceverslag van de audit op afdelingsniveau — of de vragenlijst op afdelingsniveau is ingevuld.`,
  cordGuidelineCordGas: () => `Uit het governanceverslag van de audit op afdelingsniveau — of er een lokale richtlijn voor navelstrenggasafname beschikbaar is.`,
  cordGuidelineFetalAcidosis: () => `Uit het governanceverslag van de audit op afdelingsniveau — of er een lokale richtlijn voor foetale acidose beschikbaar is.`,

  // makeCordNicuCell
  nicuAdmitAge: (code) => `Uit het NICU-opnameverslag voor ${code} — leeftijd in uren bij opname op de neonatale afdeling.`,
  nicuCooled: (code) => `Uit de NICU-opnamenotitie voor ${code} — of er therapeutische koeling werd gegeven.`,
  nicuAgeCoolingNA: (code) => `Uit de NICU-opnamenotitie voor ${code} — therapeutische koeling was niet geïndiceerd, daarom is er geen leeftijd bij koeling.`,
  nicuAgeCooling: (code) => `Uit de NICU-opnamenotitie voor ${code} — leeftijd in uren waarop de therapeutische koeling startte.`,
  nicuTransferredOut: (code) => `Uit het NICU-opnameverslag voor ${code} — of de baby naar een andere afdeling werd overgeplaatst.`,
  // cfm explanation comes from the record (n.cfm.explanation), no function needed.
  nicuSeizures: (code) => `Uit het neurologierapport voor ${code} — of er convulsies werden vastgelegd.`,
  nicuClinicalSeizures: (code) => `Uit het neurologierapport voor ${code} — of er klinische convulsies werden waargenomen.`,
  nicuElectrographicSeizure: (code) => `Uit het neurologierapport voor ${code} — of er elektrografische convulsies werden vastgelegd.`,
  nicuMriInjury: (code) => `Uit het neurologierapport voor ${code} — MRI-bevindingen van letsel.`,
  nicuDurationNicu: (code) => `Uit het NICU-opnameverslag voor ${code} — duur van de opname in dagen.`,
  nicuAgeDischargeHomeTransferred: (code) => `${code} werd overgeplaatst naar een andere afdeling en niet vanaf hier naar huis ontslagen, daarom is de leeftijd bij ontslag naar huis niet geregistreerd.`,
  nicuAgeDischargeHome: (code) => `Uit het NICU-ontslagverslag voor ${code} — leeftijd in dagen bij ontslag naar huis.`,
  nicuFeeding: (code) => `Uit de NICU-ontslagbrief voor ${code} — voedingsmethode bij ontslag.`,
  nicuAbnormalNeurology: (code) => `Uit de NICU-ontslagbrief voor ${code} — of de neurologie afwijkend was bij ontslag.`,

  // makeChestPainCell
  chestAge: (code) => `Uit het EPD-contactverslag voor ${code} — leeftijd bij presentatie.`,
  chestComplaint: (code) => `Uit de triagenotitie voor ${code} — de presenterende klacht vastgelegd bij triage.`,
  chestTroponinUnavailable: (code) => `Uit de laboratoriumnotitie voor ${code} — het bloedmonster is gehemolyseerd, daarom is er geen troponine-uitslag beschikbaar.`,
  chestTroponin: (code) => `Uit de EPD-troponine-uitslag voor ${code} — eerste hooggevoelige troponine in ng/L.`,
  chestEcgMissing: () => "Tijdens deze presentatie werd geen ECG gemaakt, daarom zijn er geen bevindingen geregistreerd.",
  chestEcg: (code) => `Uit de cardiologienotitie voor ${code} — de gedocumenteerde ECG-bevindingen.`,
  chestTimeToEcgMissing: () => "Tijdens deze presentatie werd geen ECG gemaakt, daarom is er geen tijd tot het eerste ECG.",
  chestTimeToEcg: (code) => `Uit het EPD-ECG-verslag voor ${code} — minuten van aankomst tot het eerste ECG.`,
  chestDiagnosis: (code) => `Uit de cardiologie- en ontslagbriefnotities voor ${code} — de werkdiagnose bij beoordeling.`,
  chestDecision: (code) => `Uit de ontslagbriefnotitie voor ${code} — de beslissing tot ontslag of opname.`,

  // makeNpdaCell
  npdaPatient: (code) => `Uit de EPD-demografie voor ${code} — het 10-cijferige NHS-nummer van de patiënt.`,
  npdaDob: (code) => `Uit de EPD-demografie voor ${code} — geboortedatum, opgemaakt als DD/MM/JJJJ.`,
  npdaSex: (code, sex, sexCode) => `Uit de EPD-demografie voor ${code} — geslacht toegekend bij geboorte geregistreerd als ${sex}, gecodeerd ${sexCode} volgens de NPDA-dataset (1 = Man, 2 = Vrouw).`,
  npdaEthnicity: (code, label, ethCode) => `Uit de EPD-demografie voor ${code} — etnische categorie geregistreerd als '${label}', gecodeerd ${ethCode} volgens de NPDA-lijst met etnische categorieën.`,
  npdaDiabetesType: (code, label, dtCode) => `Uit het EPD-diabetesdiagnoseverslag voor ${code} — ${label}, gecodeerd ${dtCode} volgens de NPDA-dataset.`,
  npdaDiagnosisDate: (code) => `Uit het EPD-diabetesdiagnoseverslag voor ${code} — datum van diagnose, opgemaakt als DD/MM/JJJJ.`,
  npdaVisitDate: (code) => `Uit het EPD-poliklinisch observatiepaneel voor ${code} — datum bezoek/afspraak, opgemaakt als DD/MM/JJJJ.`,
  npdaHeight: (code) => `Uit het EPD-poliklinisch observatiepaneel voor ${code} — lengte in cm (NPDA-formaat 999.9).`,
  npdaWeight: (code) => `Uit het EPD-poliklinisch observatiepaneel voor ${code} — gewicht in kg (NPDA-formaat 999.9).`,
  npdaHba1c: (code, value) => `Uit het EPD-poliklinisch observatiepaneel voor ${code} — HbA1c van ${value} (NPDA-formaat 999.9); een waarde tussen 20 en 195 wordt behandeld als mmol/mol volgens de NPDA-dataset.`,
  npdaInsulinRegime: (code, label, mCode) => `Uit de diabetespoliklinieknotitie voor ${code} — ${label}, gecodeerd ${mCode} volgens de NPDA-insulineregimewaarden.`,
  npdaCgm: (code, label, mCode) => `Uit de diabetespoliklinieknotitie voor ${code} — ${label}, gecodeerd ${mCode} (1 = Ja, 2 = Nee).`,
  npdaLifestyle: (code, recommended, mCode) => `Uit de diabetespoliklinieknotitie voor ${code} — leefstijl- en voedingsaanpassing werd ${recommended ? "aanbevolen" : "niet aanbevolen"}, gecodeerd ${mCode} (1 = Ja, 2 = Nee).`,
  npdaSystolic: (code) => `Uit het EPD-poliklinisch observatiepaneel voor ${code} — systolische bloeddruk in mmHg (NPDA-formaat 999).`,
  npdaDiastolic: (code) => `Uit het EPD-poliklinisch observatiepaneel voor ${code} — diastolische bloeddruk in mmHg (NPDA-formaat 999).`,
  npdaCholesterol: (code) => `Uit het EPD-poliklinisch observatiepaneel voor ${code} — totaal cholesterol in mmol/l (NPDA-formaat 99.9).`,
  npdaAcrNotDone: (code) => `Albumine in urine (ACR) werd bij dit bezoek niet bepaald voor ${code}, daarom is er geen waarde geregistreerd.`,
  npdaAcr: (code) => `Uit het EPD-poliklinisch observatiepaneel voor ${code} — albumine-creatinineratio (ACR) in urine in mg/mmol (NPDA-formaat 9999.9).`,
  npdaFootDateNotDue: (code) => `Voetonderzoek is een verplicht zorgproces vanaf 12 jaar; ${code} is jonger, daarom werd het niet uitgevoerd en is de datum leeg gelaten.`,
  npdaFootDate: (code) => `Uit het diabetesscreeningsverslag voor ${code} — datum voetonderzoek, opgemaakt als DD/MM/JJJJ.`,
  npdaRetinalDateNotDue: (code) => `Retinascreening is een verplicht zorgproces vanaf 12 jaar; ${code} is jonger, daarom werd het niet uitgevoerd en is de datum leeg gelaten.`,
  npdaRetinalDate: (code) => `Uit het diabetesscreeningsverslag voor ${code} — datum retinascreening, opgemaakt als DD/MM/JJJJ.`,
  npdaRetinalResultNone: (code) => `Er werd geen retinascreening uitgevoerd voor ${code} (jonger dan 12), daarom is er geen uitslag om te coderen.`,
  npdaRetinalResult: (code, label, mCode) => `Uit het diabetesscreeningsverslag voor ${code} — uitslag retinascreening was ${label}, gecodeerd ${mCode} (1 = Normaal, 2 = Afwijkend).`,
  npdaPsychScreen: (code) => `Uit het diabetesscreeningsverslag voor ${code} — datum van de jaarlijkse psychologische screeningsbeoordeling, opgemaakt als DD/MM/JJJJ.`,
  npdaPsychOutcome: (code, required, mCode) => `Uit de psychologische screeningsnotitie voor ${code} — aanvullende psychologische ondersteuning buiten de reguliere zorg was ${required ? "nodig" : "niet nodig"}, gecodeerd ${mCode} (1 = Ja, 2 = Nee).`,
  npdaSmoking: (code, label, mCode) => `Uit de jaarlijkse controlenotitie voor ${code} — ${label}, gecodeerd ${mCode} volgens de NPDA-rook-/vapewaarden.`,
  npdaDietitian: (code, offered, mCode) => `Uit de diabetespoliklinieknotitie voor ${code} — een aanvullende afspraak met de kinderdiëtist werd ${offered ? "aangeboden" : "niet aangeboden"}, gecodeerd ${mCode} (1 = Ja, 2 = Nee).`,
  npdaCarbCountingNA: (code) => `Koolhydraattellen niveau 3 is van toepassing op patiënten met injecties of een pomp; ${code} wordt behandeld met dieet en metformine, daarom is het niet van toepassing en is de datum leeg gelaten.`,
  npdaCarbCounting: (code) => `Uit het diabeteseducatieverslag voor ${code} — datum waarop educatie koolhydraattellen niveau 3 werd ontvangen, opgemaakt als DD/MM/JJJJ.`,
  npdaAdmissionReasonDka: (code, label, dkaCode) => `Uit de opnamenotitie voor ${code} — ${label}, gecodeerd ${dkaCode} volgens de NPDA-waarden voor reden voor opname (1 = Acute DKA).`,
  npdaAdmissionReasonNone: (code) => `Er werd geen diabetesgerelateerde ziekenhuisopname geregistreerd voor ${code} gedurende het auditjaar, daarom is er geen code voor reden voor opname.`,
  npdaPostcode: (code) => `Uit de EPD-demografie voor ${code} — postcode van het gebruikelijke adres in hoofdletters met de juiste spatiëring.`,
  npdaAdhdAsd: (code, label, adhdCode) => `Uit de EPD-demografie voor ${code} — ${label}, gecodeerd ${adhdCode} volgens de NPDA-ADHD/ASS-waarden.`,
  npdaLearningDisability: (code, label, ldCode) => `Uit de EPD-demografie voor ${code} — verstandelijke beperking ${label}, gecodeerd ${ldCode} (1 = Ja, 2 = Nee).`,
  npdaLeavingDateNone: (code) => `${code} bleef gedurende het hele auditjaar onder de kinderdiabeteszorg, daarom is er geen uitschrijvingsdatum geregistreerd.`,
  npdaLeavingDate: (code) => `Uit de EPD-demografie voor ${code} — datum waarop de patiënt de dienst verliet, opgemaakt als DD/MM/JJJJ.`,
  npdaLeavingReasonNone: (code) => `${code} verliet de dienst niet gedurende het auditjaar, daarom is er geen code voor reden van uitschrijving.`,
  npdaLeavingReason: (code, label, lrCode) => `Uit de EPD-demografie voor ${code} — ${label}, gecodeerd ${lrCode} volgens de NPDA-waarden voor reden van uitschrijving.`,
  npdaDeathDate: (code) => `Er werd geen overlijden geregistreerd voor ${code} gedurende het auditjaar, daarom is de overlijdensdatum leeg gelaten.`,
  npdaGpPractice: (code) => `Uit de EPD-demografie voor ${code} — geregistreerde huisartspraktijkcode (NPDA-formaat X99999).`,
  npdaPduNumber: (code) => `Uit de afdelingsregistratie voor ${code} — het nummer van de kinderdiabeteseenheid (PDU), een 3-cijferige code die gedeeld wordt door elk kind dat op deze afdeling wordt gezien.`,
  npdaObsDateHtWt: (code) => `Uit het EPD-poliklinisch observatiepaneel voor ${code} — gecombineerde meetdatum lengte/gewicht (genomen bij het poliklinische bezoek), opgemaakt als DD/MM/JJJJ.`,
  npdaObsDateHba1c: (code) => `Uit het EPD-poliklinisch observatiepaneel voor ${code} — datum waarop de HbA1c werd bepaald (binnen het auditjaar), opgemaakt als DD/MM/JJJJ.`,
  npdaOtherMed: (code, label, omCode) => `Uit het EPD-medicatieverslag voor ${code} — ${label}, gecodeerd ${omCode} volgens de NPDA-waarden voor niet-insulinemedicatie.`,
  npdaKetoneTesting: (code, label, ktCode) => `Uit het diabetesscreeningsverslag voor ${code} — gebruikt of opgeleid in het gebruik van bloedketontestapparatuur: ${label}, gecodeerd ${ktCode} (1 = Ja, 2 = Nee).`,
  npdaImmunotherapyNA: (code) => `Het immunotherapie-item wordt alleen ingevuld voor patiënten die binnen het auditjaar nieuw met type 1-diabetes zijn gediagnosticeerd; ${code} komt niet in aanmerking, daarom is het leeg gelaten.`,
  npdaImmunotherapy: (code, label, imCode) => `Uit het diabetesdiagnoseverslag voor ${code} — immunotherapie rond de stadium-3 type 1-diagnose: ${label}, gecodeerd ${imCode} (1 = Ja, 2 = Nee).`,
  npdaImmunotherapyDateNone: (code) => `Er werd geen immunotherapie gegeven aan ${code}, daarom is er geen startdatum om te registreren.`,
  npdaImmunotherapyDate: (code) => `Uit het diabetesdiagnoseverslag voor ${code} — datum start immunotherapie, opgemaakt als DD/MM/JJJJ.`,
  npdaObsDateBP: (code) => `Uit het EPD-poliklinisch observatiepaneel voor ${code} — meetdatum bloeddruk (genomen bij het poliklinische bezoek), opgemaakt als DD/MM/JJJJ.`,
  npdaObsDateAcrNone: (code) => `Albumine in urine (ACR) werd bij dit bezoek niet bepaald voor ${code}, daarom is er geen meetdatum.`,
  npdaObsDateAcr: (code) => `Uit het EPD-poliklinisch observatiepaneel voor ${code} — datum waarop de ACR in urine werd bepaald, opgemaakt als DD/MM/JJJJ.`,
  npdaAlbuminuriaStageNone: (code) => `Er werd geen ACR in urine gemeten voor ${code}, daarom kan het stadium van albuminurie niet worden gecodeerd.`,
  npdaAlbuminuriaStage: (code, acrValue, label, alCode) => `Geïnterpreteerd uit de ACR in urine van ${acrValue} mg/mmol voor ${code} — ${label}, gecodeerd ${alCode} (een ACR onder 3 mg/mmol is normoalbuminurie).`,
  npdaObsDateChol: (code) => `Uit het EPD-poliklinisch observatiepaneel voor ${code} — datum waarop het totaal cholesterol werd bepaald, opgemaakt als DD/MM/JJJJ.`,
  npdaThyroidDateNA: (code) => `Jaarlijkse schildklierfunctiemonitoring is een zorgproces voor type 1-diabetes; ${code} heeft type 2-diabetes, daarom is er geen meetdatum schildklier geregistreerd.`,
  npdaThyroidDate: (code) => `Uit het diabetesscreeningsverslag voor ${code} — datum van de jaarlijkse schildklierfunctiebepaling, opgemaakt als DD/MM/JJJJ.`,
  npdaThyroidTreatmentNA: (code) => `Schildklierbehandeling wordt geregistreerd naast de jaarlijkse schildkliercontrole voor type 1; ${code} heeft type 2-diabetes, daarom is het leeg gelaten.`,
  npdaThyroidTreatment: (code, label, ttCode) => `Uit het diabetesscreeningsverslag voor ${code} — ${label}, gecodeerd ${ttCode} volgens de NPDA-waarden voor schildklierbehandeling.`,
  npdaCoeliacDateNA: (code) => `De datum coeliakiescreening wordt alleen geregistreerd voor patiënten die binnen het auditjaar zijn gediagnosticeerd; ${code} werd eerder gediagnosticeerd, daarom is het leeg gelaten.`,
  npdaCoeliacDate: (code) => `Uit het diabetesscreeningsverslag voor ${code} — datum van de serologische coeliakiescreening, opgemaakt als DD/MM/JJJJ.`,
  npdaGlutenFree: (code, label, gfCode) => `Uit het diabetesscreeningsverslag voor ${code} — aanbevolen/voorgeschreven een glutenvrij dieet: ${label}, gecodeerd ${gfCode} (een 'Ja' wordt geïnterpreteerd als een diagnose van coeliakie).`,
  npdaSmokingCessationDateNone: (code) => `${code} is geen actieve roker of vaper, daarom was er geen advies voor stoppen met roken nodig en is de datum leeg gelaten.`,
  npdaSmokingCessationDate: (code) => `Uit het diabetesscreeningsverslag voor ${code} — datum waarop advies/verwijzing voor stoppen met roken werd aangeboden, opgemaakt als DD/MM/JJJJ.`,
  npdaFluDateNone: (code) => `Er werd geen griepvaccinatie geregistreerd voor ${code} gedurende het auditjaar, daarom wordt dit zorgproces als onvolledig beschouwd en is de datum leeg gelaten.`,
  npdaFluDate: (code) => `Uit het diabetesscreeningsverslag voor ${code} — datum waarop griepvaccinatie werd aanbevolen, opgemaakt als DD/MM/JJJJ.`,
  npdaSickDayDate: (code) => `Uit het diabetesscreeningsverslag voor ${code} — datum waarop advies over 'ziektedagregels' werd gegeven (herzien bij de jaarlijkse controle), opgemaakt als DD/MM/JJJJ.`,
  npdaMentalHealthAppt: (code, label, mhCode) => `Uit het psychologieverslag voor ${code} — ${label}, gecodeerd ${mhCode} volgens de NPDA-waarden voor afspraak geestelijke gezondheidszorg.`,
  npdaDietitianApptDateNone: (code) => `Er werd geen aanvullende diëtistenafspraak bijgewoond door ${code}, daarom is de afspraakdatum leeg gelaten.`,
  npdaDietitianApptDate: (code) => `Uit het diabeteseducatieverslag voor ${code} — datum van de aanvullende afspraak met de kinderdiëtist, opgemaakt als DD/MM/JJJJ.`,
  npdaAdmissionStartNone: (code) => `Er werd geen diabetesgerelateerde opname geregistreerd voor ${code} gedurende het auditjaar, daarom is er geen startdatum van de episode.`,
  npdaAdmissionStart: (code) => `Uit het ziekenhuisopnameverslag voor ${code} — startdatum van de zorgepisode bij de zorgaanbieder, opgemaakt als DD/MM/JJJJ.`,
  npdaAdmissionDischargeNone: (code) => `Er werd geen diabetesgerelateerde opname geregistreerd voor ${code} gedurende het auditjaar, daarom is er geen ontslagdatum.`,
  npdaAdmissionDischarge: (code) => `Uit het ziekenhuisopnameverslag voor ${code} — ontslagdatum van de zorgepisode bij de zorgaanbieder, opgemaakt als DD/MM/JJJJ.`,
  npdaAdmissionReasonOtherNoAdmission: (code) => `Er werd geen opname geregistreerd voor ${code}, daarom is er geen vrije-tekstreden.`,
  npdaAdmissionReasonOther: (code) => `De vrije-tekstreden is alleen verplicht wanneer 'Overige oorzaken' is geselecteerd; de opname van ${code} werd gecodeerd als DKA, daarom is het leeg gelaten.`,
  npdaDkaTherapiesNone: (code) => `Er werd geen DKA-opname geregistreerd voor ${code}, daarom zijn er geen DKA-therapieën om te registreren.`,
  npdaDkaTherapies: (code, label, dkaCode) => `Uit het ziekenhuisopnameverslag voor ${code} — ontvangen DKA-therapieën: ${label}, gecodeerd ${dkaCode} volgens de NPDA-waarden voor DKA-therapie.`,
  npdaInitialPhNone: (code) => `Er werd geen bloedgas bij opname geregistreerd voor ${code}, daarom is er geen initiële pH.`,
  npdaInitialPh: (code) => `Uit het ziekenhuisopnameverslag voor ${code} — initiële (eerst geregistreerde) pH bij opname (NPDA-formaat 0.00).`,
  npdaInitialBicarbNone: (code) => `Er werd geen bloedgas bij opname geregistreerd voor ${code}, daarom is er geen initieel standaardbicarbonaat.`,
  npdaInitialBicarb: (code) => `Uit het ziekenhuisopnameverslag voor ${code} — initieel standaardbicarbonaat bij opname in mmol/l (NPDA-formaat 00.0).`,
};

// --- Blocked-cell reason_detail (CPH009 age-at-discharge) --------------------
const blockedReason = {
  cordAgeDischargeHome:
    "CPH009 werd op dag 7 overgeplaatst naar het regionale koel- en neurologiecentrum en werd nooit vanaf deze afdeling naar huis ontslagen, daarom is er geen leeftijd bij ontslag naar huis geregistreerd (cord_ph_birth_records en de overplaatsingsbrief doorzocht).",
};

// --- Timeline strings (headlines, details, think snippets, tool headlines) ---
// KEEP wait/kind/tool name/status in logic. Translate headline/detail/think text
// and the few derived words below. `summaryWords` are the first few words the
// folded activity line shows — handled by shortLabel() in logic, so nothing to
// translate beyond the headlines themselves.
const timeline = {
  // Tool-call headlines (the agent's sql_execute / query_schema lines).
  tools: {
    cordGasPanel: "Het navelstrenggaspaneel gelezen",
    inspectedSchema: "Het EPD-schema geïnspecteerd",
    troponinResults: "De troponine-uitslagen gelezen",
    cardiometabolicScreen: "De cardiometabole screening gelezen",
  },
  // Cord-pH population (timelineA -> cordPhPopulation).
  cord: {
    mapTemplate: { headline: "De template aan het EPD-schema koppelen…", detail: "Elke kolom van de template wordt aan een veld in de **EPD-database** gekoppeld voordat de gestructureerde waarden uit het geboorteverslag worden overgenomen." },
    copyBirthRecord: { headline: "De gestructureerde velden van het geboorteverslag kopiëren…", detail: "Zwangerschapsduur, leeftijd van de moeder, pariteit, wijze van bevalling, geboortegewicht en de Apgar-scores rechtstreeks ophalen uit `cord_ph_birth_records` en `patient_demographics`." },
    antenatalScreening: { headline: "De antenatale screeningsvelden lezen…", detail: "De vlaggen voor normale echo, normale doppler en CTG kopiëren uit de antenatale verslagen." },
    antenatalNotes: { headline: "De antenatale notities lezen…", detail: "De antenatale notitie van elke zwangerschap lezen op foetale bewegingen, comorbiditeit bij de moeder, langdurig gebroken vliezen en risicofactoren voor sepsis." },
    obstetricNotes: { headline: "De obstetrische en verloskundige notities lezen…", detail: "Elke obstetrische geboortesamenvatting combineren met de bijbehorende verloskundige bevallingsnotitie om late navelstrengafklemming, de toestand van het vruchtwater, chorioamnionitis en eventuele sentinel-gebeurtenis te bevestigen." },
    thinkDcc: "CPH002 was een categorie 1-keizersnede met een slappe baby — de navelstreng werd direct afgeklemd voor reanimatie, daarom leest late navelstrengafklemming als \"Nee\" ondanks het afdelingsbeleid.",
    resuscitationNotes: { headline: "De reanimatienotities lezen…", detail: "Elk reanimatieverslag lezen op intubatie, hartmassage en eventuele bij de geboorte toegediende medicatie." },
    metabolicScreen: { headline: "De metabole screening van de pasgeborene controleren…", detail: "De postnatale notitie van elke baby lezen om eventuele hypoglykemie te registreren." },
    followUp: { headline: "De follow-up- en ontslagvelden kopiëren…", detail: "De afdeling, herhaalde navelstrenggasuitslagen, NICU-opname en ontslagtiming ophalen uit het gestructureerde verslag. Waar geen herhaald gas werd uitgevoerd, wordt het veld ingevuld met een expliciete \"N.v.t.\" in plaats van leeg gelaten." },
    governance: { headline: "De governance-antwoorden op afdelingsniveau vastleggen…", detail: "De kolommen voor de vragenlijst op afdelingsniveau en de beschikbaarheid van lokale richtlijnen invullen uit het governanceverslag van de audit." },
    nicuSheet: { headline: "Het NICU-blad invullen…", detail: "Overschakelen naar het **NICU**-blad om de uitkomsten in te vullen voor de baby's die op de neonatale afdeling zijn opgenomen." },
    coolingCfm: { headline: "De koel- en CFM-notities lezen…", detail: "Elke NICU-opnamenotitie lezen op therapeutische koeling en de CFM-indruk aan bed afstemmen met het formele neurologierapport. Eén geval is in tegenspraak met het gestructureerde verslag; bij één premature sepsisopname was er geen CFM, expliciet vastgelegd." },
    thinkCfm: "**CPH009 — het CFM-conflict afstemmen.** De CFM-notitie aan bed leest een *normaal achtergrondpatroon*, maar het formele neurologierapport vermeldt **elektrografische convulsies** met `basal ganglia and thalamic injury` op MRI. Deze spreken elkaar tegen, dus in plaats van stilzwijgend één bron te kiezen markeer ik deze cel als een **conflict** voor beoordeling door de clinicus:\n\n- CFM aan bed: normaal achtergrondpatroon\n- Formeel aEEG: afwijkend, elektrografische convulsies\n- MRI: basale ganglia / thalamus\n\nHet formele rapport is de meer gezaghebbende bron, maar de discrepantie zelf is de bevinding die het waard is om naar voren te brengen.",
    neurologyReports: { headline: "De neurologierapporten lezen…", detail: "Elk formeel neurologierapport lezen op klinische en elektrografische convulsies en eventueel MRI-letsel." },
    dischargeSummaries: { headline: "De NICU-ontslagbrieven controleren…", detail: "Elke NICU-ontslagbrief lezen op voedingsmethode en neurologie bij ontslag." },
    finalizing: { headline: "De audit afronden…", detail: "Alle cellen ingevuld en herleidbaar tot het EPD-verslag of de bronnotities op zowel het ALL- als het NICU-blad." },
  },
  // Chest-pain population (timelineB -> chestPainPopulation).
  chest: {
    populating: { headline: "Invullen vanuit het EPD…", detail: "Het werkboek pijn op de borst kolom voor kolom invullen vanuit de **EPD-database** en de triage- en cardiologienotities." },
    triageNotes: { headline: "De triagenotities lezen…", detail: "De triagenotitie van elke presentatie lezen om de presenterende klacht vast te leggen." },
    ecgResults: { headline: "De ECG-uitslagen lezen…", detail: "De gedocumenteerde ECG-bevindingen en de tijd van aankomst tot het eerste ECG ophalen, en elke presentatie zonder ECG in het dossier markeren." },
    cardiologyNotes: { headline: "De cardiologienotities beoordelen…", detail: "De cardiologische beoordeling lezen om de werkdiagnose voor elke patiënt vast te stellen." },
    dischargeSummaries: { headline: "De ontslagbrieven controleren…", detail: "Elke ontslagbrief lezen om vast te leggen of de patiënt werd ontslagen of opgenomen." },
    finalizing: { headline: "De audit afronden…", detail: "Alle cellen ingevuld en herleidbaar tot het EPD-verslag of de bronnotities." },
  },
  // NPDA population (timelineC -> npdaPopulation).
  npda: {
    mapTemplate: { headline: "De template aan het EPD-schema koppelen…", detail: "Elke NPDA-kolom wordt aan een veld in de **EPD-database** gekoppeld voordat de gestructureerde demografie en diagnosegegevens worden overgenomen." },
    demographics: { headline: "De demografie- en diagnosevelden kopiëren…", detail: "Geboortedatum, postcode, geslacht, etnische categorie, de ADHD/ASS- en verstandelijke-beperkingsvlaggen, type diabetes en datum van diagnose rechtstreeks ophalen uit `patient_demographics` en `diabetes_diagnoses`." },
    registration: { headline: "De registratie- en dienstvelden kopiëren…", detail: "De datum en reden van uitschrijving uit de dienst, eventuele overlijdensdatum, de huisartspraktijkcode, het PDU-nummer en de datum bezoek/afspraak ophalen. Patiënten die onder de dienst bleven, dragen een expliciet label in plaats van een leeg veld." },
    clinicMeasurements: { headline: "De poliklinische metingen kopiëren…", detail: "Lengte, gewicht en HbA1c met hun meetdatums kopiëren uit het gestructureerde poliklinische observatiepaneel." },
    diabetesClinicNotes: { headline: "De diabetespoliklinieknotities lezen…", detail: "De diabetespoliklinieknotitie van elk kind lezen op het insulineregime, het gebruik van een continue glucosemeter en het gegeven leefstijl- en voedingsadvies." },
    treatmentFlags: { headline: "De behandel- en monitoringsvlaggen kopiëren…", detail: "Eventuele niet-insuline glucoseverlagende medicatie, bloedketontesten en — voor nieuw gediagnosticeerde type 1-patiënten — of immunotherapie werd ontvangen en wanneer." },
    surveillanceScreening: { headline: "De surveillancescreeningsdatums kopiëren…", detail: "De velden voor voetonderzoek, retinascreening, schildklier, coeliakie en koolhydraattellen ophalen uit het gestructureerde verslag. Waar screening nog niet aan de orde of niet van toepassing is, wordt het veld ingevuld met een expliciet label in plaats van leeg gelaten." },
    annualReviewNotes: { headline: "De jaarlijkse controlenotities lezen…", detail: "De jaarlijkse controlenotitie van elk kind lezen op rook- of vapestatus, en vervolgens de zorgprocesdatums voor stoppen met roken, griepvaccinatie en ziektedagregels vastleggen." },
    psychologyNotes: { headline: "De psychologienotities lezen…", detail: "De uitkomst van de jaarlijkse psychologische screening voor elk kind lezen, en vervolgens vastleggen of er een afspraak geestelijke gezondheidszorg werd aangeboden als onderdeel van het diabetes-MDT." },
    dieteticAdmissions: { headline: "Diëtetische inbreng en opnames controleren…", detail: "De diabetespoliklinieknotitie lezen op eventuele aangeboden aanvullende diëtistenafspraak, en vervolgens de datums voor koolhydraattellen en diëtistenafspraak en het opnameverslag ophalen voor elke diabetesgerelateerde opname zoals DKA." },
    finalizing: { headline: "De audit afronden…", detail: "Alle cellen ingevuld en herleidbaar tot het EPD-verslag of de bronnotities." },
  },
  // Flow openers (timelineA / timelineB / timelineC).
  flowA: {
    reviewingTemplate: { headline: "De template beoordelen…", detail: "De audit **Navelstreng-pH (regionaal)** beoordelen tegen de **EPD-database** en de veldkoppelingen op zowel het ALL- als het NICU-blad oplossen." },
  },
  flowB: {
    readingRequest: { headline: "Het verzoek lezen…", detail: "Het verzoek van Dr Alvarez verwerken: een audit van de presentaties met pijn op de borst bij volwassenen in de **EPD-database** over het laatste kwartaal." },
    buildingSpreadsheet: { headline: "De spreadsheet bouwen…", detail: "Een werkboek pijn op de borst ontwerpen vanuit de **EPD-database** — contacten, troponine- en ECG-uitslagen plus de triage- en cardiologienotities." },
    addingColumns: { headline: "Kolommen toevoegen…", detail: "Kolommen toevoegen: Patiënt, Leeftijd, Presenterende klacht, Troponine (ng/L), ECG-bevindingen, Tijd tot ECG (min), Diagnose, Beslissing ontslag/opname." },
  },
  flowC: {
    reviewingTemplate: { headline: "De template beoordelen…", detail: "De audit **Kinderdiabetes (NPDA)** beoordelen tegen de **EPD-database** en de veldkoppelingen oplossen." },
  },
  // Folded activity-line label for thinking steps.
  thinkingLabel: "Denken",
};

// --- Sample doctor's email (Flow B) -----------------------------------------
const email = `Hallo team,

Voor de evaluatie van het zorgpad pijn op de borst heb ik een audit nodig van de presentaties met pijn op de borst bij volwassenen in de EPD-database over het laatste kwartaal.

Haal voor elke patiënt het volgende op: leeftijd, presenterende klacht bij triage, de eerste troponine-uitslag, de tijd van aankomst tot het eerste ECG en de gedocumenteerde ECG-bevindingen. Naast de gestructureerde velden, lees de triage- en cardiologienotities en geef me de werkdiagnose, en of de patiënt werd ontslagen of opgenomen.

Markeer elk geval waarin een troponine of ECG ontbreekt.

Bedankt,
Dr Mark Alvarez
Spoedeisende geneeskunde`;

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
  auditDetail,
  specValues,
  explain,
  blockedReason,
  timeline,
  email,
};
