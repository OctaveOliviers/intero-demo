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
      {
        id: "epilepsy12-lo-audit",
        name: "Kinderepilepsie",
        category: "Landelijke audits",
        fileName: "epilepsy12-audit.xlsx",
        submissionDeadline: "2027-01-12",
        description:
          "Epilepsy12 — landelijke klinische audit van aanvallen en epilepsieën bij kinderen en jongeren: KPI's voor het eerste zorgjaar met specialistische beoordeling, aanvullend onderzoek, screening op geestelijke gezondheid en medicatieveiligheid.",
        columns: [
          "NHS-nummer",
          "Geboortedatum",
          "Geslacht toegekend bij geboorte",
          "Leeftijd bij eerste beoordeling",
          "Verwijsdatum",
          "Datum eerste beoordeling door kinderarts",
          "Gezien door kinderarts met epilepsie-expertise",
          "Datum inbreng epilepsieverpleegkundige",
          "MRI geïndiceerd",
          "Datum MRI-aanvraag",
          "Datum MRI uitgevoerd",
          "Type aanval",
          "ECG-datum",
          "Datum screening geestelijke gezondheid",
          "Probleem geestelijke gezondheid vastgesteld",
          "Ondersteuning geestelijke gezondheid geboden",
          "Datum integraal zorgplan",
          "Gebruikt natriumvalproaat",
          "Gebruikt topiramaat",
          "Zwangerschapspreventieprogramma aanwezig",
        ],
      },
      {
        id: "nmtr-trauma-lo-audit",
        name: "Ernstig trauma bij kinderen",
        category: "Landelijke audits",
        fileName: "nmtr-trauma-audit.xlsx",
        submissionDeadline: "Indienen ≤25 dagen na ontslag",
        description:
          "National Major Trauma Registry (NMTR, voorheen TARN) — BPT voor ernstig trauma bij kinderen: registratie-indiening per casus en zorgstandaarden voor de acute fase (opvang onder leiding van een medisch specialist, CT-schedel, tranexaminezuur, luchtweg, revalidatievoorschrift).",
        columns: [
          "NHS-nummer",
          "Geboortedatum",
          "Geslacht toegekend bij geboorte",
          "Leeftijd (jaren)",
          "Injury Severity Score (ISS)",
          "≥1 letsel met AIS 3+",
          "Datum/tijd aankomst SEH",
          "Ontslagdatum",
          "Casus ingediend bij NMTR",
          "NMTR-dataset volledig",
          "Datum indiening NMTR",
          "Traumateam geactiveerd",
          "Medisch specialist aanwezig bij opvang",
          "Aankomst medisch specialist (min na aankomst)",
          "GCS bij aankomst",
          "Schedelhersenletsel (AIS 1+)",
          "CT-schedel (min na aankomst)",
          "TXA geïndiceerd",
          "TXA toegediend",
          "TXA toegediend (min na letsel)",
          "Luchtweg/intubatie overwogen",
          "Luchtweg overwogen (min na aankomst)",
          "Revalidatiebehoefte beoordeeld",
          "Revalidatievoorschrift afgegeven",
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
  epilepsy: [
    // Patient / cohort
    { key: "patient", header: "NHS-nummer", width: 12 },                                 // B-cohort
    { key: "dob", header: "Geboortedatum", width: 14 },
    { key: "sex", header: "Geslacht toegekend bij geboorte", width: 18 },
    { key: "ageAtAssessment", header: "Leeftijd bij eerste beoordeling", width: 20 },
    { key: "_s1", header: "", width: 4 },
    // B1 — epilepsy-expert paediatrician within 2 weeks of referral
    { key: "referralDate", header: "Verwijsdatum", width: 14 },
    { key: "firstAssessmentDate", header: "Datum eerste beoordeling door kinderarts", width: 30 },
    { key: "expertisePaediatrician", header: "Gezien door kinderarts met epilepsie-expertise", width: 32 },
    { key: "_s2", header: "", width: 4 },
    // B2 — ESN input within first year
    { key: "esnInputDate", header: "Datum inbreng epilepsieverpleegkundige", width: 30 },
    { key: "_s3", header: "", width: 4 },
    // B3 — MRI within 6 weeks where indicated
    { key: "mriIndicated", header: "MRI geïndiceerd", width: 14 },
    { key: "mriRequestDate", header: "Datum MRI-aanvraag", width: 16 },
    { key: "mriPerformedDate", header: "Datum MRI uitgevoerd", width: 18 },
    { key: "_s4", header: "", width: 4 },
    // B4 — ECG in convulsive seizures
    { key: "seizureType", header: "Type aanval", width: 18 },
    { key: "ecgDate", header: "ECG-datum", width: 14 },
    { key: "_s5", header: "", width: 4 },
    // B5 — mental-health screening + support
    { key: "mhScreeningDate", header: "Datum screening geestelijke gezondheid", width: 26 },
    { key: "mhProblemIdentified", header: "Probleem geestelijke gezondheid vastgesteld", width: 30 },
    { key: "mhSupportProvided", header: "Ondersteuning geestelijke gezondheid geboden", width: 28 },
    { key: "_s6", header: "", width: 4 },
    // B6 — comprehensive care plan by 12 months
    { key: "carePlanDate", header: "Datum integraal zorgplan", width: 26 },
    { key: "_s7", header: "", width: 4 },
    // B7 — valproate/topiramate safety (PPP, females ≥12)
    { key: "onValproate", header: "Gebruikt natriumvalproaat", width: 18 },
    { key: "onTopiramate", header: "Gebruikt topiramaat", width: 16 },
    { key: "pppInPlace", header: "Zwangerschapspreventieprogramma aanwezig", width: 34 },
  ],
  trauma: [
    // Patient / cohort (paediatric <16 major trauma at the MTC, ≥1 AIS3+ injury)
    { key: "patient", header: "NHS-nummer", width: 12 },                                 // C-cohort
    { key: "dob", header: "Geboortedatum", width: 14 },
    { key: "sex", header: "Geslacht toegekend bij geboorte", width: 18 },
    { key: "ageYears", header: "Leeftijd (jaren)", width: 12 },
    { key: "iss", header: "Injury Severity Score (ISS)", width: 22 },
    { key: "ais3plus", header: "≥1 letsel met AIS 3+", width: 16 },
    { key: "_s1", header: "", width: 4 },
    // C1 — registry submission within 25 days of discharge (the BPT trigger)
    { key: "edArrivalDateTime", header: "Datum/tijd aankomst SEH", width: 22 },
    { key: "dischargeDate", header: "Ontslagdatum", width: 16 },
    { key: "nmtrSubmitted", header: "Casus ingediend bij NMTR", width: 20 },
    { key: "datasetComplete", header: "NMTR-dataset volledig", width: 22 },
    { key: "submissionDate", header: "Datum indiening NMTR", width: 20 },
    { key: "_s2", header: "", width: 4 },
    // C2 — consultant-led trauma-team reception ≤5 min (Level 2, ISS ≥16)
    { key: "traumaTeamActivated", header: "Traumateam geactiveerd", width: 22 },
    { key: "consultantPresent", header: "Medisch specialist aanwezig bij opvang", width: 30 },
    { key: "consultantArrivalMin", header: "Aankomst medisch specialist (min na aankomst)", width: 34 },
    { key: "_s3", header: "", width: 4 },
    // C3 — CT head ≤60 min (GCS ≤13 head injury, Level 2)
    { key: "gcs", header: "GCS bij aankomst", width: 16 },
    { key: "headInjury", header: "Schedelhersenletsel (AIS 1+)", width: 20 },
    { key: "ctHeadMin", header: "CT-schedel (min na aankomst)", width: 26 },
    { key: "_s4", header: "", width: 4 },
    // C4 — tranexamic acid ≤1 h (Level 2)
    { key: "txaIndicated", header: "TXA geïndiceerd", width: 16 },
    { key: "txaGiven", header: "TXA toegediend", width: 14 },
    { key: "txaMin", header: "TXA toegediend (min na letsel)", width: 26 },
    { key: "_s5", header: "", width: 4 },
    // C5 — airway considered ≤30 min (GCS <9, Level 1)
    { key: "intubationConsidered", header: "Luchtweg/intubatie overwogen", width: 28 },
    { key: "airwayConsideredMin", header: "Luchtweg overwogen (min na aankomst)", width: 34 },
    { key: "_s6", header: "", width: 4 },
    // C6 — rehabilitation prescription (ISS ≥9, Level 1)
    { key: "rehabNeedsAssessed", header: "Revalidatiebehoefte beoordeeld", width: 28 },
    { key: "rehabPrescriptionIssued", header: "Revalidatievoorschrift afgegeven", width: 32 },
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

// --- Records: Epilepsy12 (Dataset 4) ----------------------------------------
// One row per child/young person in their first year of epilepsy care (Cohort 8
// window). DIRECT fields come from structured neurology/clinic tables; the
// INTERPRETIVE fields (epilepsy-expertise of the assessing paediatrician,
// seizure type, and the mental-health problem/support outcome) are read from the
// epilepsy clinic letter and the mental-health screening note — the `i.*.e`
// spans are verbatim substrings of the matching note text. Genuine "not done"
// cases (a missing ESN input, a missing MH screen, a missing care plan) carry an
// explicit lookup-backed label, and one MRI report is genuinely blocked.
const epilepsy = {
  EPI001: {
    code: "EPI001", patient: "epilepsy-patient-001",
    dob: "2014-03-12", sex: "Male", ageAtAssessment: 11,
    referralDate: "2025-01-10", firstAssessmentDate: "2025-01-20",
    esnInputDate: "2025-03-05",
    mriIndicated: "Yes", mriRequestDate: "2025-01-22", mriPerformedDate: "2025-02-20",
    ecgDate: "2025-02-10",
    mhScreeningDate: "2025-04-01", carePlanDate: "2025-11-15",
    onValproate: "No", onTopiramate: "No", pppInPlace: null,
    i: {
      expertise: { v: "Yes", e: ["Gezien door de kinderarts met expertise in epilepsie"] },
      seizureType: { v: "Convulsive", e: ["gegeneraliseerde tonisch-klonische (convulsieve) aanvallen"] },
      mhProblem: { v: "No", e: ["er werd geen probleem met de geestelijke gezondheid vastgesteld"] },
      mhSupport: { v: "No", e: ["er werd geen probleem met de geestelijke gezondheid vastgesteld"] },
    },
    notes: [
      { role: "Kinderneurologie — Dr Helen Marsh", date: "2025-01-20", type: "epilepsy_clinic", text: "Gezien door de kinderarts met expertise in epilepsie bij de eerste beoordeling na verwijzing. De anamnese past bij gegeneraliseerde tonisch-klonische (convulsieve) aanvallen. Een MRI van de hersenen en een ECG werden aangevraagd." },
      { role: "Epilepsie — screening geestelijke gezondheid", date: "2025-04-01", type: "mh_screening", text: "Screening geestelijke gezondheid uitgevoerd met de afgesproken vragenlijst; er werd geen probleem met de geestelijke gezondheid vastgesteld op dit moment in het eerste zorgjaar." },
    ],
  },

  EPI002: {
    code: "EPI002", patient: "epilepsy-patient-002",
    dob: "2010-07-22", sex: "Female", ageAtAssessment: 14,
    referralDate: "2025-02-03", firstAssessmentDate: "2025-02-12",
    esnInputDate: "2025-04-10",
    mriIndicated: "Yes", mriRequestDate: "2025-02-14", mriPerformedDate: "2025-03-18",
    ecgDate: "2025-03-01",
    mhScreeningDate: "2025-05-02", carePlanDate: "2025-12-20",
    onValproate: "Yes", onTopiramate: "No", pppInPlace: "Yes",
    i: {
      expertise: { v: "Yes", e: ["Beoordeeld door de kinderarts met epilepsie-expertise"] },
      seizureType: { v: "Convulsive", e: ["focale aanvallen met evolutie naar bilaterale convulsieve activiteit"] },
      mhProblem: { v: "Yes", e: ["de screening stelde somberheid en angst vast"] },
      mhSupport: { v: "Yes", e: ["verwezen naar het team geestelijke gezondheid en er werd ondersteuning geboden"] },
    },
    notes: [
      { role: "Kinderneurologie — Dr Helen Marsh", date: "2025-02-12", type: "epilepsy_clinic", text: "Beoordeeld door de kinderarts met epilepsie-expertise binnen twee weken na verwijzing. De aanvallen zijn focale aanvallen met evolutie naar bilaterale convulsieve activiteit. Gestart met natriumvalproaat; als vrouw in de vruchtbare leeftijd werd een zwangerschapspreventieprogramma ingesteld en gedocumenteerd." },
      { role: "Epilepsie — screening geestelijke gezondheid", date: "2025-05-02", type: "mh_screening", text: "Screening geestelijke gezondheid uitgevoerd; de screening stelde somberheid en angst vast. Zij werd verwezen naar het team geestelijke gezondheid en er werd ondersteuning geboden binnen het eerste zorgjaar." },
    ],
  },

  EPI003: {
    code: "EPI003", patient: "epilepsy-patient-003",
    dob: "2012-11-05", sex: "Female", ageAtAssessment: 12,
    referralDate: "2025-03-01", firstAssessmentDate: "2025-03-10",
    esnInputDate: "2025-05-15",
    mriIndicated: "Yes", mriRequestDate: "2025-03-12", mriPerformedDate: "2025-06-01",
    ecgDate: null,
    mhScreeningDate: "2025-06-05", carePlanDate: "2026-01-10",
    onValproate: "No", onTopiramate: "Yes", pppInPlace: "Yes",
    i: {
      expertise: { v: "Yes", e: ["Gezien door de kinderarts met expertise in epilepsie"] },
      seizureType: { v: "Non-convulsive", e: ["typische absences (niet-convulsieve aanvallen)"] },
      mhProblem: { v: "No", e: ["er werd geen probleem met de geestelijke gezondheid vastgesteld"] },
      mhSupport: { v: "No", e: ["er werd geen probleem met de geestelijke gezondheid vastgesteld"] },
    },
    notes: [
      { role: "Kinderneurologie — Dr Helen Marsh", date: "2025-03-10", type: "epilepsy_clinic", text: "Gezien door de kinderarts met expertise in epilepsie. De semiologie past bij typische absences (niet-convulsieve aanvallen), zodat er geen ECG geïndiceerd was. Een MRI van de hersenen werd aangevraagd. Gestart met topiramaat; als vrouw in de vruchtbare leeftijd werd een zwangerschapspreventieprogramma ingesteld." },
      { role: "Epilepsie — screening geestelijke gezondheid", date: "2025-06-05", type: "mh_screening", text: "Screening geestelijke gezondheid uitgevoerd met de afgesproken vragenlijst; er werd geen probleem met de geestelijke gezondheid vastgesteld." },
    ],
  },

  EPI004: {
    code: "EPI004", patient: "epilepsy-patient-004",
    dob: "2016-05-14", sex: "Male", ageAtAssessment: 8,
    referralDate: "2025-01-15", firstAssessmentDate: "2025-02-20",
    esnInputDate: "2025-04-02",
    mriIndicated: "No", mriRequestDate: null, mriPerformedDate: null,
    ecgDate: "2025-03-05",
    mhScreeningDate: "2025-05-10", carePlanDate: "2025-12-01",
    onValproate: "No", onTopiramate: "No", pppInPlace: null,
    i: {
      expertise: { v: "Yes", e: ["beoordeeld door de kinderarts met epilepsie-expertise"] },
      seizureType: { v: "Convulsive", e: ["gegeneraliseerde tonisch-klonische (convulsieve) aanvallen"] },
      mhProblem: { v: "No", e: ["er werd geen probleem met de geestelijke gezondheid vastgesteld"] },
      mhSupport: { v: "No", e: ["er werd geen probleem met de geestelijke gezondheid vastgesteld"] },
    },
    notes: [
      { role: "Kinderneurologie — Dr Helen Marsh", date: "2025-02-20", type: "epilepsy_clinic", text: "Capaciteitsdruk vertraagde het eerste polibezoek; beoordeeld door de kinderarts met epilepsie-expertise meer dan twee weken na verwijzing. De aanvallen zijn gegeneraliseerde tonisch-klonische (convulsieve) aanvallen. MRI was niet geïndiceerd bij deze typische presentatie; een ECG werd aangevraagd." },
      { role: "Epilepsie — screening geestelijke gezondheid", date: "2025-05-10", type: "mh_screening", text: "Screening geestelijke gezondheid uitgevoerd samen met het gezin; er werd geen probleem met de geestelijke gezondheid vastgesteld." },
    ],
  },

  EPI005: {
    code: "EPI005", patient: "epilepsy-patient-005",
    dob: "2009-03-19", sex: "Female", ageAtAssessment: 15,
    referralDate: "2025-04-01", firstAssessmentDate: "2025-04-09",
    esnInputDate: "2025-06-12",
    mriIndicated: "Yes", mriRequestDate: "2025-04-11", mriPerformedDate: "2025-05-10",
    ecgDate: null,
    mhScreeningDate: "2025-07-02", carePlanDate: "2026-02-15",
    onValproate: "Yes", onTopiramate: "No", pppInPlace: null,
    i: {
      expertise: { v: "Yes", e: ["Gezien door de kinderarts met expertise in epilepsie"] },
      seizureType: { v: "Convulsive", e: ["gegeneraliseerde tonisch-klonische (convulsieve) aanvallen"] },
      mhProblem: { v: "Yes", e: ["de screening stelde uitgesproken somberheid vast"] },
      mhSupport: { v: "No", e: ["de ondersteuning is nog niet geregeld"] },
    },
    notes: [
      { role: "Kinderneurologie — Dr Helen Marsh", date: "2025-04-09", type: "epilepsy_clinic", text: "Gezien door de kinderarts met expertise in epilepsie. De aanvallen zijn gegeneraliseerde tonisch-klonische (convulsieve) aanvallen. Gestart met natriumvalproaat. De documentatie van het zwangerschapspreventieprogramma is besproken maar niet afgerond en staat nog open." },
      { role: "Epilepsie — screening geestelijke gezondheid", date: "2025-07-02", type: "mh_screening", text: "Screening geestelijke gezondheid uitgevoerd; de screening stelde uitgesproken somberheid vast. Een verwijzing werd geadviseerd, maar de ondersteuning is nog niet geregeld." },
    ],
  },

  EPI006: {
    code: "EPI006", patient: "epilepsy-patient-006",
    dob: "2013-09-05", sex: "Male", ageAtAssessment: 11,
    referralDate: "2025-05-02", firstAssessmentDate: "2025-05-12",
    esnInputDate: null,
    mriIndicated: "No", mriRequestDate: null, mriPerformedDate: null,
    ecgDate: null,
    mhScreeningDate: "2025-08-01", carePlanDate: "2026-03-05",
    onValproate: "No", onTopiramate: "No", pppInPlace: null,
    i: {
      expertise: { v: "Yes", e: ["Gezien door de kinderarts met epilepsie-expertise"] },
      seizureType: { v: "Non-convulsive", e: ["typische absences (niet-convulsieve aanvallen)"] },
      mhProblem: { v: "No", e: ["er werd geen probleem met de geestelijke gezondheid vastgesteld"] },
      mhSupport: { v: "No", e: ["er werd geen probleem met de geestelijke gezondheid vastgesteld"] },
    },
    notes: [
      { role: "Kinderneurologie — Dr Helen Marsh", date: "2025-05-12", type: "epilepsy_clinic", text: "Gezien door de kinderarts met epilepsie-expertise. De aanvallen zijn typische absences (niet-convulsieve aanvallen), zodat noch een MRI noch een ECG geïndiceerd was." },
      { role: "Epilepsie — screening geestelijke gezondheid", date: "2025-08-01", type: "mh_screening", text: "Screening geestelijke gezondheid uitgevoerd met de afgesproken vragenlijst; er werd geen probleem met de geestelijke gezondheid vastgesteld." },
    ],
  },

  EPI007: {
    code: "EPI007", patient: "epilepsy-patient-007",
    dob: "2017-12-01", sex: "Male", ageAtAssessment: 7,
    referralDate: "2025-06-03", firstAssessmentDate: "2025-06-12",
    esnInputDate: "2025-08-20",
    mriIndicated: "Yes", mriRequestDate: "2025-06-14", mriPerformedDate: null,
    ecgDate: "2025-07-10",
    mhScreeningDate: "2025-09-01", carePlanDate: "2026-05-20",
    onValproate: "No", onTopiramate: "No", pppInPlace: null,
    i: {
      expertise: { v: "Yes", e: ["Gezien door de kinderarts met expertise in epilepsie"] },
      seizureType: { v: "Convulsive", e: ["gegeneraliseerde tonisch-klonische (convulsieve) aanvallen"] },
      mhProblem: { v: "No", e: ["er werd geen probleem met de geestelijke gezondheid vastgesteld"] },
      mhSupport: { v: "No", e: ["er werd geen probleem met de geestelijke gezondheid vastgesteld"] },
    },
    notes: [
      { role: "Kinderneurologie — Dr Helen Marsh", date: "2025-06-12", type: "epilepsy_clinic", text: "Gezien door de kinderarts met expertise in epilepsie. De aanvallen zijn gegeneraliseerde tonisch-klonische (convulsieve) aanvallen. Een MRI van de hersenen werd aangevraagd en een ECG werd geregeld." },
      { role: "Epilepsie — screening geestelijke gezondheid", date: "2025-09-01", type: "mh_screening", text: "Screening geestelijke gezondheid uitgevoerd; er werd geen probleem met de geestelijke gezondheid vastgesteld." },
    ],
  },

  EPI008: {
    code: "EPI008", patient: "epilepsy-patient-008",
    dob: "2011-02-25", sex: "Male", ageAtAssessment: 13,
    referralDate: "2025-07-01", firstAssessmentDate: "2025-07-10",
    esnInputDate: "2025-09-15",
    mriIndicated: "No", mriRequestDate: null, mriPerformedDate: null,
    ecgDate: "2025-08-05",
    mhScreeningDate: "2025-10-01", carePlanDate: "2026-06-25",
    onValproate: "No", onTopiramate: "No", pppInPlace: null,
    i: {
      expertise: { v: "No", e: ["gezien door een algemeen kinderarts zonder specifieke epilepsie-expertise"] },
      seizureType: { v: "Convulsive", e: ["gegeneraliseerde tonisch-klonische (convulsieve) aanvallen"] },
      mhProblem: { v: "No", e: ["er werd geen probleem met de geestelijke gezondheid vastgesteld"] },
      mhSupport: { v: "No", e: ["er werd geen probleem met de geestelijke gezondheid vastgesteld"] },
    },
    notes: [
      { role: "Kindergeneeskunde — Dr Sam Reid", date: "2025-07-10", type: "epilepsy_clinic", text: "De eerste beoordeling werd gezien door een algemeen kinderarts zonder specifieke epilepsie-expertise; verdere beoordeling door de epilepsiehoofdbehandelaar volgt nog. De aanvallen zijn gegeneraliseerde tonisch-klonische (convulsieve) aanvallen. Een ECG werd aangevraagd; MRI was niet geïndiceerd." },
      { role: "Epilepsie — screening geestelijke gezondheid", date: "2025-10-01", type: "mh_screening", text: "Screening geestelijke gezondheid uitgevoerd met de afgesproken vragenlijst; er werd geen probleem met de geestelijke gezondheid vastgesteld." },
    ],
  },

  EPI009: {
    code: "EPI009", patient: "epilepsy-patient-009",
    dob: "2015-04-19", sex: "Female", ageAtAssessment: 9,
    referralDate: "2025-08-04", firstAssessmentDate: "2025-08-13",
    esnInputDate: "2025-10-10",
    mriIndicated: "Yes", mriRequestDate: "2025-08-15", mriPerformedDate: "2025-09-12",
    ecgDate: null,
    mhScreeningDate: null, carePlanDate: "2026-07-15",
    onValproate: "No", onTopiramate: "No", pppInPlace: null,
    i: {
      expertise: { v: "Yes", e: ["Gezien door de kinderarts met expertise in epilepsie"] },
      seizureType: { v: "Non-convulsive", e: ["typische absences (niet-convulsieve aanvallen)"] },
      mhProblem: { v: "No", e: ["de screening geestelijke gezondheid nog niet is uitgevoerd"] },
      mhSupport: { v: "No", e: ["de screening geestelijke gezondheid nog niet is uitgevoerd"] },
    },
    notes: [
      { role: "Kinderneurologie — Dr Helen Marsh", date: "2025-08-13", type: "epilepsy_clinic", text: "Gezien door de kinderarts met expertise in epilepsie. De aanvallen zijn typische absences (niet-convulsieve aanvallen), zodat er geen ECG geïndiceerd was. Een MRI van de hersenen werd aangevraagd." },
      { role: "Epilepsie — screening geestelijke gezondheid", date: "2025-09-01", type: "mh_screening", text: "Uit de dossiercontrole blijkt dat de screening geestelijke gezondheid nog niet is uitgevoerd bij dit kind binnen het eerste zorgjaar." },
    ],
  },

  EPI010: {
    code: "EPI010", patient: "epilepsy-patient-010",
    dob: "2010-11-02", sex: "Female", ageAtAssessment: 15,
    referralDate: "2025-09-10", firstAssessmentDate: "2025-09-19",
    esnInputDate: "2025-11-12",
    mriIndicated: "No", mriRequestDate: null, mriPerformedDate: null,
    ecgDate: "2025-10-05",
    mhScreeningDate: "2025-11-20", carePlanDate: null,
    onValproate: "No", onTopiramate: "No", pppInPlace: null,
    i: {
      expertise: { v: "Yes", e: ["Gezien door de kinderarts met expertise in epilepsie"] },
      seizureType: { v: "Convulsive", e: ["gegeneraliseerde tonisch-klonische (convulsieve) aanvallen"] },
      mhProblem: { v: "No", e: ["er werd geen probleem met de geestelijke gezondheid vastgesteld"] },
      mhSupport: { v: "No", e: ["er werd geen probleem met de geestelijke gezondheid vastgesteld"] },
    },
    notes: [
      { role: "Kinderneurologie — Dr Helen Marsh", date: "2025-09-19", type: "epilepsy_clinic", text: "Gezien door de kinderarts met expertise in epilepsie. De aanvallen zijn gegeneraliseerde tonisch-klonische (convulsieve) aanvallen. Een ECG werd aangevraagd; MRI was niet geïndiceerd bij deze presentatie." },
      { role: "Epilepsie — screening geestelijke gezondheid", date: "2025-11-20", type: "mh_screening", text: "Screening geestelijke gezondheid uitgevoerd met de afgesproken vragenlijst; er werd geen probleem met de geestelijke gezondheid vastgesteld." },
    ],
  },
};

// --- Records: Major trauma (Dataset 5) --------------------------------------
// One row per paediatric (<16) major-trauma case at the MTC with ≥1 AIS3+ injury
// (the NMTR cohort). DIRECT fields come from the trauma-registry and ED tables;
// the INTERPRETIVE fields (whether airway/intubation was considered, and whether
// a rehabilitation prescription was issued) are read from the resuscitation note
// and the rehab/discharge note — the `i.*.e` spans are verbatim substrings of the
// matching note text. The BPT pays a two-level top-up: Level 1 (ISS ≥9) and the
// higher Level 2 (ISS ≥16); several process criteria are level-gated. Genuine
// "not applicable / not done" cases carry an explicit lookup-backed label, and one
// consultant-arrival time is genuinely blocked.
const trauma = {
  TRA001: {
    code: "TRA001", patient: "trauma-patient-001",
    dob: "2017-06-14", sex: "Male", ageYears: 8, iss: 25, ais3plus: "Yes",
    edArrivalDateTime: "2026-01-08 14:20", dischargeDate: "2026-01-26",
    nmtrSubmitted: "Yes", datasetComplete: "Yes", submissionDate: "2026-02-07",
    traumaTeamActivated: "Yes", consultantPresent: "Yes", consultantArrivalMin: 4,
    gcs: 6, headInjury: "Yes", ctHeadMin: 38,
    txaIndicated: "Yes", txaGiven: "Yes", txaMin: 45,
    airwayConsideredMin: 18,
    rehabNeedsAssessed: "Yes",
    i: {
      intubationConsidered: { v: "Yes", e: ["de luchtweg werd veiliggesteld door rapid sequence intubatie binnen 18 minuten na aankomst"] },
      rehabPrescription: { v: "Yes", e: ["een revalidatievoorschrift werd opgesteld en gedeeld met het gezin, de huisarts en het wijkteam"] },
    },
    notes: [
      { role: "Traumateam — Dr Olusola Bello", date: "2026-01-08", type: "resus", text: "Het traumateam onder leiding van een medisch specialist ving dit kind op na een verkeersongeval met hoge snelheid. GCS 6 bij aankomst; de luchtweg werd veiliggesteld door rapid sequence intubatie binnen 18 minuten na aankomst. Tranexaminezuur toegediend wegens ernstige bloeding." },
      { role: "Revalidatie — Dr Priya Nair", date: "2026-01-24", type: "rehab", text: "De revalidatiebehoefte werd beoordeeld door de traumarevalidatiecoördinator; een revalidatievoorschrift werd opgesteld en gedeeld met het gezin, de huisarts en het wijkteam, met de kerncomponenten vastgelegd in de NMTR." },
    ],
  },

  TRA002: {
    code: "TRA002", patient: "trauma-patient-002",
    dob: "2011-09-02", sex: "Female", ageYears: 14, iss: 18, ais3plus: "Yes",
    edArrivalDateTime: "2026-01-15 09:05", dischargeDate: "2026-02-02",
    nmtrSubmitted: "Yes", datasetComplete: "Yes", submissionDate: "2026-02-22",
    traumaTeamActivated: "Yes", consultantPresent: "Yes", consultantArrivalMin: 9,
    gcs: 10, headInjury: "Yes", ctHeadMin: 78,
    txaIndicated: "No", txaGiven: "No", txaMin: null,
    airwayConsideredMin: null,
    rehabNeedsAssessed: "Yes",
    i: {
      intubationConsidered: { v: "No", e: ["de luchtweg was vrij en werd gedurende de hele periode zelfstandig opengehouden, zodat intubatie niet nodig was"] },
      rehabPrescription: { v: "Yes", e: ["een revalidatievoorschrift werd afgegeven en in afschrift verstrekt aan de huisarts en de vervolgzorgverlener"] },
    },
    notes: [
      { role: "Traumateam — Dr Olusola Bello", date: "2026-01-15", type: "resus", text: "Val van hoogte. GCS 10 bij aankomst; de luchtweg was vrij en werd gedurende de hele periode zelfstandig opengehouden, zodat intubatie niet nodig was. Geen indicatie voor tranexaminezuur. De medisch specialist kwam negen minuten na aankomst naar de opvangkamer wegens een gelijktijdige reanimatie." },
      { role: "Revalidatie — Dr Priya Nair", date: "2026-01-31", type: "rehab", text: "Revalidatiebehoefte beoordeeld; een revalidatievoorschrift werd afgegeven en in afschrift verstrekt aan de huisarts en de vervolgzorgverlener, met de kerncomponenten in de NMTR." },
    ],
  },

  TRA003: {
    code: "TRA003", patient: "trauma-patient-003",
    dob: "2020-03-21", sex: "Male", ageYears: 5, iss: 16, ais3plus: "Yes",
    edArrivalDateTime: "2026-01-20 17:40", dischargeDate: "2026-02-05",
    nmtrSubmitted: "Yes", datasetComplete: "Yes", submissionDate: "2026-03-08",
    traumaTeamActivated: "Yes", consultantPresent: "Yes", consultantArrivalMin: 3,
    gcs: 7, headInjury: "Yes", ctHeadMin: 50,
    txaIndicated: "Yes", txaGiven: "Yes", txaMin: 40,
    airwayConsideredMin: 25,
    rehabNeedsAssessed: "Yes",
    i: {
      intubationConsidered: { v: "Yes", e: ["de noodzaak van een definitieve luchtweg werd gedocumenteerd en intubatie werd na 25 minuten uitgevoerd"] },
      rehabPrescription: { v: "Yes", e: ["een revalidatievoorschrift werd samen met het gezin opgesteld en gedeeld met de huisarts en het wijkteam"] },
    },
    notes: [
      { role: "Traumateam — Dr Olusola Bello", date: "2026-01-20", type: "resus", text: "Beknellingsletsel. GCS 7 bij aankomst; de noodzaak van een definitieve luchtweg werd gedocumenteerd en intubatie werd na 25 minuten uitgevoerd. Tranexaminezuur binnen het uur toegediend. De medisch specialist was binnen drie minuten in de opvangkamer aanwezig." },
      { role: "Revalidatie — Dr Priya Nair", date: "2026-02-03", type: "rehab", text: "Revalidatiebehoefte beoordeeld; een revalidatievoorschrift werd samen met het gezin opgesteld en gedeeld met de huisarts en het wijkteam." },
    ],
  },

  TRA004: {
    code: "TRA004", patient: "trauma-patient-004",
    dob: "2014-12-09", sex: "Female", ageYears: 11, iss: 12, ais3plus: "Yes",
    edArrivalDateTime: "2026-01-25 11:15", dischargeDate: "2026-02-09",
    nmtrSubmitted: "Yes", datasetComplete: "Yes", submissionDate: "2026-02-24",
    traumaTeamActivated: "Yes", consultantPresent: "Yes", consultantArrivalMin: 6,
    gcs: 14, headInjury: "Yes", ctHeadMin: 52,
    txaIndicated: "No", txaGiven: "No", txaMin: null,
    airwayConsideredMin: null,
    rehabNeedsAssessed: "Yes",
    i: {
      intubationConsidered: { v: "No", e: ["de luchtweg werd zelfstandig opengehouden bij een GCS van 14 en intubatie was niet geïndiceerd"] },
      rehabPrescription: { v: "Yes", e: ["een revalidatievoorschrift werd afgegeven en gedeeld met het gezin, de huisarts en de vervolgzorgverlener"] },
    },
    notes: [
      { role: "Traumateam — Dr Olusola Bello", date: "2026-01-25", type: "resus", text: "Sportletsel met een miltlaceratie. GCS 14 bij aankomst; de luchtweg werd zelfstandig opengehouden bij een GCS van 14 en intubatie was niet geïndiceerd. Geen ernstige bloeding waarvoor tranexaminezuur nodig was." },
      { role: "Revalidatie — Dr Priya Nair", date: "2026-02-07", type: "rehab", text: "Revalidatiebehoefte beoordeeld; een revalidatievoorschrift werd afgegeven en gedeeld met het gezin, de huisarts en de vervolgzorgverlener." },
    ],
  },

  TRA005: {
    code: "TRA005", patient: "trauma-patient-005",
    dob: "2023-05-30", sex: "Male", ageYears: 2, iss: 9, ais3plus: "Yes",
    edArrivalDateTime: "2026-02-01 08:50", dischargeDate: "2026-02-06",
    nmtrSubmitted: "Yes", datasetComplete: "Yes", submissionDate: "2026-02-14",
    traumaTeamActivated: "Yes", consultantPresent: "Yes", consultantArrivalMin: 5,
    gcs: 15, headInjury: "No", ctHeadMin: null,
    txaIndicated: "No", txaGiven: "No", txaMin: null,
    airwayConsideredMin: null,
    rehabNeedsAssessed: "Yes",
    i: {
      intubationConsidered: { v: "No", e: ["alert met een GCS van 15 en een zelfstandig opengehouden luchtweg, zodat geen luchtweginterventie werd overwogen"] },
      rehabPrescription: { v: "No", e: ["een formeel revalidatievoorschrift is echter nog niet opgesteld en staat nog open"] },
    },
    notes: [
      { role: "Traumateam — Dr Olusola Bello", date: "2026-02-01", type: "resus", text: "Pijpbeenfractuur van het onderbeen na een val. De peuter was alert met een GCS van 15 en een zelfstandig opengehouden luchtweg, zodat geen luchtweginterventie werd overwogen. Geen schedelhersenletsel." },
      { role: "Revalidatie — Dr Priya Nair", date: "2026-02-05", type: "rehab", text: "De revalidatiebehoefte werd tijdens de opname beoordeeld; een formeel revalidatievoorschrift is echter nog niet opgesteld en staat nog open bij ontslag." },
    ],
  },

  TRA006: {
    code: "TRA006", patient: "trauma-patient-006",
    dob: "2010-08-11", sex: "Male", ageYears: 15, iss: 29, ais3plus: "Yes",
    edArrivalDateTime: "2026-02-04 22:30", dischargeDate: "2026-02-25",
    nmtrSubmitted: "Yes", datasetComplete: "Yes", submissionDate: "2026-03-07",
    traumaTeamActivated: "Yes", consultantPresent: "Yes", consultantArrivalMin: 2,
    gcs: 5, headInjury: "Yes", ctHeadMin: 28,
    txaIndicated: "Yes", txaGiven: "Yes", txaMin: 75,
    airwayConsideredMin: 22,
    rehabNeedsAssessed: "Yes",
    i: {
      intubationConsidered: { v: "Yes", e: ["de luchtweg werd veiliggesteld door intubatie 22 minuten na aankomst"] },
      rehabPrescription: { v: "Yes", e: ["een revalidatievoorschrift werd opgesteld en verstrekt aan het gezin, de huisarts en het vervolgzorgteam"] },
    },
    notes: [
      { role: "Traumateam — Dr Olusola Bello", date: "2026-02-04", type: "resus", text: "Penetrerend buikletsel met ernstige bloeding. GCS 5 bij aankomst; de luchtweg werd veiliggesteld door intubatie 22 minuten na aankomst. De medisch specialist was binnen twee minuten aanwezig. Tranexaminezuur werd toegediend, maar met vertraging tot 75 minuten na het letsel wegens een moeizame interklinische overplaatsing." },
      { role: "Revalidatie — Dr Priya Nair", date: "2026-02-23", type: "rehab", text: "Revalidatiebehoefte beoordeeld door de traumarevalidatiecoördinator; een revalidatievoorschrift werd opgesteld en verstrekt aan het gezin, de huisarts en het vervolgzorgteam, met de kerncomponenten in de NMTR." },
    ],
  },

  TRA007: {
    code: "TRA007", patient: "trauma-patient-007",
    dob: "2016-10-03", sex: "Female", ageYears: 9, iss: 17, ais3plus: "Yes",
    edArrivalDateTime: "2026-02-10 13:00", dischargeDate: "2026-02-28",
    nmtrSubmitted: "Yes", datasetComplete: "Yes", submissionDate: "2026-03-22",
    traumaTeamActivated: "Yes", consultantPresent: "Yes", consultantArrivalMin: 5,
    gcs: 8, headInjury: "Yes", ctHeadMin: 55,
    txaIndicated: "Yes", txaGiven: "Yes", txaMin: 50,
    airwayConsideredMin: 29,
    rehabNeedsAssessed: "Yes",
    i: {
      intubationConsidered: { v: "Yes", e: ["een definitieve luchtweg werd overwogen en intubatie werd 29 minuten na aankomst uitgevoerd"] },
      rehabPrescription: { v: "Yes", e: ["een revalidatievoorschrift werd opgesteld en gedeeld met de huisarts en de revalidatiedienst in de wijk"] },
    },
    notes: [
      { role: "Traumateam — Dr Olusola Bello", date: "2026-02-10", type: "resus", text: "Voetganger aangereden door een voertuig. GCS 8 bij aankomst; een definitieve luchtweg werd overwogen en intubatie werd 29 minuten na aankomst uitgevoerd. Tranexaminezuur binnen het uur toegediend. De medisch specialist was na vijf minuten aanwezig." },
      { role: "Revalidatie — Dr Priya Nair", date: "2026-02-26", type: "rehab", text: "Revalidatiebehoefte beoordeeld; een revalidatievoorschrift werd opgesteld en gedeeld met de huisarts en de revalidatiedienst in de wijk." },
    ],
  },

  TRA008: {
    code: "TRA008", patient: "trauma-patient-008",
    dob: "2019-01-27", sex: "Male", ageYears: 6, iss: 8, ais3plus: "No",
    edArrivalDateTime: "2026-02-13 16:10", dischargeDate: "2026-02-18",
    nmtrSubmitted: "Yes", datasetComplete: "Yes", submissionDate: "2026-02-26",
    traumaTeamActivated: "Yes", consultantPresent: "Yes", consultantArrivalMin: 7,
    gcs: 15, headInjury: "No", ctHeadMin: null,
    txaIndicated: "No", txaGiven: "No", txaMin: null,
    airwayConsideredMin: null,
    rehabNeedsAssessed: "Yes",
    i: {
      intubationConsidered: { v: "No", e: ["volledig alert met een GCS van 15, zodat geen luchtweginterventie werd overwogen"] },
      rehabPrescription: { v: "No", e: ["er was geen revalidatievoorschrift vereist voor deze opname met licht letsel" ] },
    },
    notes: [
      { role: "Traumateam — Dr Olusola Bello", date: "2026-02-13", type: "resus", text: "Geïsoleerde gesloten onderarmfractuur na een val op het speelplein. Het kind was volledig alert met een GCS van 15, zodat geen luchtweginterventie werd overwogen. Geen schedelhersenletsel en geen ernstige bloeding." },
      { role: "Revalidatie — Dr Priya Nair", date: "2026-02-17", type: "rehab", text: "Revalidatiebehoefte beoordeeld; er was geen revalidatievoorschrift vereist voor deze opname met licht letsel, onder de drempel voor revalidatie bij ernstig trauma." },
    ],
  },

  TRA009: {
    code: "TRA009", patient: "trauma-patient-009",
    dob: "2012-07-18", sex: "Female", ageYears: 13, iss: 20, ais3plus: "Yes",
    edArrivalDateTime: "2026-02-16 19:45", dischargeDate: "2026-03-06",
    nmtrSubmitted: "Yes", datasetComplete: "Yes", submissionDate: "2026-03-24",
    traumaTeamActivated: "Yes", consultantPresent: "Yes", consultantArrivalMin: null,
    gcs: 9, headInjury: "Yes", ctHeadMin: 45,
    txaIndicated: "No", txaGiven: "No", txaMin: null,
    airwayConsideredMin: null,
    rehabNeedsAssessed: "Yes",
    i: {
      intubationConsidered: { v: "No", e: ["de luchtweg bleef behouden bij een GCS van 9 en intubatie was in dit stadium niet nodig"] },
      rehabPrescription: { v: "Yes", e: ["een revalidatievoorschrift werd afgegeven en gedeeld met het gezin, de huisarts en de vervolgzorgverlener"] },
    },
    notes: [
      { role: "Traumateam — Dr Olusola Bello", date: "2026-02-16", type: "resus", text: "Fietser aangereden door een voertuig met thoraxletsel. GCS 9 bij aankomst; de luchtweg bleef behouden bij een GCS van 9 en intubatie was in dit stadium niet nodig. Geen indicatie voor tranexaminezuur." },
      { role: "Revalidatie — Dr Priya Nair", date: "2026-03-04", type: "rehab", text: "Revalidatiebehoefte beoordeeld; een revalidatievoorschrift werd afgegeven en gedeeld met het gezin, de huisarts en de vervolgzorgverlener, met de kerncomponenten in de NMTR." },
    ],
  },

  TRA010: {
    code: "TRA010", patient: "trauma-patient-010",
    dob: "2021-11-08", sex: "Male", ageYears: 4, iss: 10, ais3plus: "Yes",
    edArrivalDateTime: "2026-02-19 07:25", dischargeDate: "2026-03-03",
    nmtrSubmitted: "Yes", datasetComplete: "Yes", submissionDate: "2026-03-17",
    traumaTeamActivated: "Yes", consultantPresent: "Yes", consultantArrivalMin: 4,
    gcs: 12, headInjury: "Yes", ctHeadMin: 49,
    txaIndicated: "No", txaGiven: "No", txaMin: null,
    airwayConsideredMin: null,
    rehabNeedsAssessed: "Yes",
    i: {
      intubationConsidered: { v: "No", e: ["hield de eigen luchtweg open bij een GCS van 12 en intubatie was niet geïndiceerd"] },
      rehabPrescription: { v: "Yes", e: ["een revalidatievoorschrift werd opgesteld en gedeeld met het gezin, de huisarts en de vervolgzorgverlener"] },
    },
    notes: [
      { role: "Traumateam — Dr Olusola Bello", date: "2026-02-19", type: "resus", text: "Val van de trap met licht schedelhersenletsel en een leverlaceratie. Het kind hield de eigen luchtweg open bij een GCS van 12 en intubatie was niet geïndiceerd. Geen ernstige bloeding." },
      { role: "Revalidatie — Dr Priya Nair", date: "2026-03-01", type: "rehab", text: "Revalidatiebehoefte beoordeeld; een revalidatievoorschrift werd opgesteld en gedeeld met het gezin, de huisarts en de vervolgzorgverlener." },
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
  // --- Epilepsy12 (Dataset 4) -----------------------------------------------
  // Seizure type read from the epilepsy clinic letter (interpretive). Keys are
  // the record's i.seizureType.v lookup values (keep English); `label` is the
  // displayed/evidence wording (translatable). The ECG KPI keys off whether the
  // type is convulsive.
  seizureType: {
    Convulsive: { code: "convulsief", label: "convulsief (gegeneraliseerd tonisch-klonisch / focaal naar bilateraal)" },
    "Non-convulsive": { code: "niet-convulsief", label: "niet-convulsief (absence / focaal met behouden bewustzijn)" },
    Absence: { code: "absence", label: "absence (niet-convulsief)" },
  },
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

  // --- Epilepsy12 (Dataset 4) ----------------------------------------------
  epiPatient: (code) => `Uit de EPD-demografie voor ${code} — het 10-cijferige NHS-nummer van de patiënt.`,
  epiDob: (code) => `Uit de EPD-demografie voor ${code} — geboortedatum, opgemaakt als DD/MM/JJJJ.`,
  epiSex: (code, sex, sexCode) => `Uit de EPD-demografie voor ${code} — geslacht toegekend bij geboorte geregistreerd als ${sex === "Male" ? "Man" : "Vrouw"}, gecodeerd ${sexCode} (1 = Man, 2 = Vrouw).`,
  epiAgeAtAssessment: (code, age) => `Uit het epilepsiedossier voor ${code} — leeftijd ${age} jaar bij de eerste beoordeling door de kinderarts; het cohort betreft kinderen en jongeren van 18 jaar of jonger.`,
  epiReferralDate: (code) => `Uit het epilepsiedossier voor ${code} — datum waarop de verwijzing werd ontvangen, opgemaakt als DD/MM/JJJJ.`,
  epiFirstAssessmentDate: (code, days) => `Uit het epilepsiedossier voor ${code} — eerste beoordeling door de kinderarts ${days} dagen na verwijzing (KPI 1-norm: binnen 14 dagen), opgemaakt als DD/MM/JJJJ.`,
  epiExpertise: (code, seen, mhCode) => `Uit de epilepsiepolikliniekbrief voor ${code} — de eerste beoordeling werd ${seen ? "wel" : "niet"} uitgevoerd door een kinderarts met expertise in epilepsie (KPI 1), geregistreerd als ${mhCode}.`,
  epiEsnInputDate: (code) => `Uit het epilepsiedossier voor ${code} — datum van de eerste inbreng van de epilepsieverpleegkundige (ESN) (KPI 2-norm: binnen het eerste zorgjaar), opgemaakt als DD/MM/JJJJ.`,
  epiEsnInputNotDone: (code) => `Er is voor ${code} geen inbreng van de epilepsieverpleegkundige (ESN) geregistreerd in het eerste zorgjaar, daarom is deze KPI onvolledig en is de datum leeg gelaten.`,
  epiMriIndicated: (code, indicated) => `Uit het epilepsiedossier voor ${code} — een MRI van de hersenen was ${indicated ? "wel" : "niet"} klinisch geïndiceerd; de KPI MRI-binnen-6-weken geldt alleen wanneer er een indicatie is.`,
  epiMriRequestNA: (code) => `Een MRI van de hersenen was niet geïndiceerd voor ${code}, daarom werd er geen aanvraag gedaan en is de datum leeg gelaten.`,
  epiMriRequestDate: (code) => `Uit het epilepsiedossier voor ${code} — datum waarop de MRI van de hersenen werd aangevraagd, opgemaakt als DD/MM/JJJJ.`,
  epiMriPerformedNA: (code) => `Een MRI van de hersenen was niet geïndiceerd voor ${code}, daarom werd er geen uitgevoerd en is de datum leeg gelaten.`,
  epiMriPerformedNotDone: (code) => `Er werd een MRI van de hersenen aangevraagd voor ${code}, maar deze is nog niet uitgevoerd, daarom staat deze KPI nog open en is de datum leeg gelaten.`,
  epiMriPerformedDate: (code, days) => `Uit het radiologiedossier voor ${code} — MRI van de hersenen uitgevoerd ${days} dagen na de aanvraag (KPI 5-norm: binnen 42 dagen), opgemaakt als DD/MM/JJJJ.`,
  epiSeizureType: (code, label, stCode) => `Uit de epilepsiepolikliniekbrief voor ${code} — de aanvallen zijn ${label}, geregistreerd als ${stCode}; de ECG-KPI geldt voor convulsieve aanvallen.`,
  epiEcgNA: (code) => `${code} heeft geen convulsieve aanvallen, daarom maakt een ECG geen deel uit van de vereiste diagnostiek en is de datum leeg gelaten.`,
  epiEcgNotDone: (code) => `${code} heeft convulsieve aanvallen en zou daarom binnen het eerste jaar een ECG moeten krijgen, maar er is er geen geregistreerd, daarom is deze KPI onvolledig en is de datum leeg gelaten.`,
  epiEcgDate: (code) => `Uit het cardiologiedossier voor ${code} — datum waarop het ECG werd uitgevoerd (KPI 4, convulsieve aanvallen), opgemaakt als DD/MM/JJJJ.`,
  epiMhScreeningDate: (code) => `Uit het epilepsiedossier voor ${code} — datum waarop de screening geestelijke gezondheid werd uitgevoerd (KPI 6, binnen het eerste zorgjaar), opgemaakt als DD/MM/JJJJ.`,
  epiMhScreeningNotDone: (code) => `Er is voor ${code} geen screening geestelijke gezondheid geregistreerd in het eerste zorgjaar, daarom is deze KPI onvolledig en is de datum leeg gelaten.`,
  epiMhProblem: (code, identified, mhCode) => `Uit de notitie van de screening geestelijke gezondheid voor ${code} — er werd bij de screening ${identified ? "wel" : "geen"} probleem met de geestelijke gezondheid vastgesteld (KPI 6), geregistreerd als ${mhCode}.`,
  epiMhSupportProvided: (code, provided, mhCode) => `Uit de notitie van de screening geestelijke gezondheid voor ${code} — er werd ${provided ? "wel" : "geen"} ondersteuning geestelijke gezondheid geboden nadat een probleem was vastgesteld (KPI 7), geregistreerd als ${mhCode}.`,
  epiMhSupportNA: (code) => `Er werd voor ${code} geen probleem met de geestelijke gezondheid vastgesteld, daarom is de KPI geboden ondersteuning (KPI 7) niet van toepassing en is de cel leeg gelaten.`,
  epiCarePlanDate: (code) => `Uit het epilepsiedossier voor ${code} — datum waarop het integrale zorgplan werd overeengekomen (KPI 9-norm: binnen 12 maanden), opgemaakt als DD/MM/JJJJ.`,
  epiCarePlanNotDone: (code) => `Er is voor ${code} binnen 12 maanden geen integraal zorgplan geregistreerd, daarom is deze KPI onvolledig en is de datum leeg gelaten.`,
  epiOnValproate: (code, on) => `Uit het voorschrijfdossier voor ${code} — natriumvalproaat wordt de patiënt ${on ? "momenteel voorgeschreven" : "niet voorgeschreven"}.`,
  epiOnTopiramate: (code, on) => `Uit het voorschrijfdossier voor ${code} — topiramaat wordt de patiënt ${on ? "momenteel voorgeschreven" : "niet voorgeschreven"}.`,
  epiPppNA: (code) => `Het zwangerschapspreventieprogramma (KPI 8) geldt alleen voor vrouwen van 12 jaar of ouder die valproaat of topiramaat gebruiken; ${code} voldoet niet aan die criteria, daarom is het niet van toepassing en is de cel leeg gelaten.`,
  epiPppInPlace: (code, inPlace) => `Uit het epilepsiedossier voor ${code} — een zwangerschapspreventieprogramma (of formulier risico-erkenning) ${inPlace ? "is aanwezig" : "is NIET aanwezig"} voor deze vrouw in de vruchtbare leeftijd die valproaat/topiramaat gebruikt (KPI 8, veiligheidskritisch).`,

  // --- Major trauma (Dataset 5) --------------------------------------------
  traPatient: (code) => `Uit de EPD-demografie voor ${code} — het 10-cijferige NHS-nummer van de patiënt.`,
  traDob: (code) => `Uit de EPD-demografie voor ${code} — geboortedatum, opgemaakt als DD/MM/JJJJ.`,
  traSex: (code, sex, sexCode) => `Uit de EPD-demografie voor ${code} — geslacht toegekend bij geboorte geregistreerd als ${sex === "Male" ? "Man" : "Vrouw"}, gecodeerd ${sexCode} (1 = Man, 2 = Vrouw).`,
  traAgeYears: (code, age) => `Uit het traumaregistratiedossier voor ${code} — leeftijd ${age} jaar; het cohort ernstig trauma bij kinderen betreft kinderen jonger dan 16 jaar.`,
  traIss: (code, iss, level) => `Uit het traumaregistratiedossier voor ${code} — Injury Severity Score van ${iss}; de BPT keert een toeslag op twee niveaus uit, niveau 1 bij ISS ≥9 en niveau 2 bij ISS ≥16 (${level}).`,
  traAis3plus: (code, yes) => `Uit het traumaregistratiedossier voor ${code} — de patiënt ${yes ? "heeft" : "heeft geen"} ten minste één letsel met AIS 3+, het inclusiecriterium voor de NMTR.`,
  traEdArrival: (code) => `Uit het SEH-dossier voor ${code} — datum en tijd van aankomst op de spoedeisende hulp, gebruikt als startpunt voor de tijdmetingen in de acute fase.`,
  traDischargeDate: (code) => `Uit het traumaregistratiedossier voor ${code} — ontslagdatum, opgemaakt als DD/MM/JJJJ; het BPT-indieningsvenster loopt vanaf deze datum.`,
  traNmtrSubmitted: (code, yes) => `Uit het traumaregistratiedossier voor ${code} — de casus ${yes ? "is" : "is niet"} ingediend bij de National Major Trauma Registry (C1).`,
  traDatasetComplete: (code, yes) => `Uit het traumaregistratiedossier voor ${code} — de NMTR-dataset is ${yes ? "volledig" : "onvolledig"} voor deze casus (C1).`,
  traSubmissionDate: (code, days) => `Uit het traumaregistratiedossier voor ${code} — ingediend ${days} dagen na ontslag (BPT-norm: binnen 25 dagen), opgemaakt als DD/MM/JJJJ.`,
  traTeamActivated: (code, yes) => `Uit het SEH-dossier voor ${code} — er ${yes ? "werd" : "werd geen"} traumateam geactiveerd voor deze opvang (C2, niveau 2).`,
  traConsultantPresent: (code, present) => `Uit het SEH-dossier voor ${code} — er ${present ? "was" : "was geen"} medisch specialist aanwezig bij de opvang door het traumateam (C2, niveau 2).`,
  traConsultantArrival: (code, min) => `Uit het SEH-dossier voor ${code} — de medisch specialist arriveerde ${min} minuten na aankomst (C2-norm: medisch specialist aanwezig binnen 5 minuten, niveau 2 / ISS ≥16).`,
  traConsultantArrivalNA: (code) => `De norm voor opvang onder leiding van een medisch specialist (C2) is een criterium van niveau 2 dat geldt bij ISS ≥16; ${code} ligt onder die drempel, daarom is het niet van toepassing en is de cel leeg gelaten.`,
  traGcs: (code, gcs) => `Uit het SEH-dossier voor ${code} — Glasgow Coma Scale van ${gcs} bij aankomst; de criteria voor CT-schedel en luchtweg gaan uit van deze waarde.`,
  traHeadInjury: (code, yes) => `Uit het traumaregistratiedossier voor ${code} — er ${yes ? "is" : "is geen"} schedelhersenletsel (AIS 1+); het criterium CT-schedel-binnen-60-minuten geldt alleen voor in aanmerking komend schedelhersenletsel.`,
  traCtHead: (code, min) => `Uit het radiologiedossier voor ${code} — CT-schedel uitgevoerd ${min} minuten na aankomst (C3-norm: binnen 60 minuten, niveau 2), weergegeven in minuten.`,
  traCtHeadNAnoHead: (code) => `${code} heeft geen schedelhersenletsel, daarom maakt een CT-schedel geen deel uit van de vereiste diagnostiek en is de cel leeg gelaten.`,
  traCtHeadNAnotEligible: (code) => `De norm CT-schedel-binnen-60-minuten (C3) geldt voor schedelhersenletsel van niveau 2 met een GCS ≤13; ${code} voldoet niet aan die criteria, daarom is het niet van toepassing en is de cel leeg gelaten.`,
  traTxaIndicated: (code, yes) => `Uit het traumaregistratiedossier voor ${code} — tranexaminezuur was ${yes ? "wel" : "niet"} geïndiceerd bij ernstige bloeding; het criterium TXA-binnen-1-uur geldt alleen wanneer er een indicatie is.`,
  traTxaGiven: (code, given) => `Uit het medicatiedossier voor ${code} — tranexaminezuur werd ${given ? "wel" : "niet"} toegediend (C4, niveau 2).`,
  traTxaMin: (code, min) => `Uit het medicatiedossier voor ${code} — tranexaminezuur toegediend ${min} minuten na het letsel (C4-norm: binnen 60 minuten, niveau 2), weergegeven in minuten.`,
  traTxaNAnotIndicated: (code) => `Tranexaminezuur was niet geïndiceerd voor ${code}, daarom werd het niet toegediend en is de cel leeg gelaten.`,
  traIntubationConsidered: (code, considered, val) => `Uit het reanimatieverslag voor ${code} — luchtwegmanagement/intubatie werd ${considered ? "wel" : "niet"} overwogen als onderdeel van de primary survey (C5, van toepassing bij GCS <9), geregistreerd als ${val}.`,
  traAirwayMin: (code, min) => `Uit het reanimatieverslag voor ${code} — luchtweg/intubatie overwogen ${min} minuten na aankomst (C5-norm: binnen 30 minuten bij GCS <9, niveau 1), weergegeven in minuten.`,
  traAirwayNA: (code) => `De norm luchtweg-overwogen-binnen-30-minuten (C5) geldt voor casussen met een GCS <9; ${code} voldoet niet aan die drempel, daarom is het niet van toepassing en is de cel leeg gelaten.`,
  traRehabNeedsAssessed: (code, yes) => `Uit het traumaregistratiedossier voor ${code} — de revalidatiebehoefte werd ${yes ? "wel" : "niet"} beoordeeld tijdens de opname (C6, ISS ≥9).`,
  traRehabPrescription: (code, issued, val) => `Uit de revalidatie-/ontslagnotitie voor ${code} — een revalidatievoorschrift werd ${issued ? "wel" : "NIET"} afgegeven met de kerncomponenten in de NMTR en gedeeld met de patiënt, de huisarts en de vervolgzorgverlener (C6, ISS ≥9), geregistreerd als ${val}.`,
  traRehabNA: (code) => `De norm revalidatievoorschrift (C6) geldt voor het cohort met ISS ≥9; ${code} ligt onder die drempel, daarom is het niet van toepassing en is de cel leeg gelaten.`,
};

// --- Blocked-cell reason_detail (CPH009 age-at-discharge) --------------------
const blockedReason = {
  cordAgeDischargeHome:
    "CPH009 werd op dag 7 overgeplaatst naar het regionale koel- en neurologiecentrum en werd nooit vanaf deze afdeling naar huis ontslagen, daarom is er geen leeftijd bij ontslag naar huis geregistreerd (cord_ph_birth_records en de overplaatsingsbrief doorzocht).",
  epilepsyMriPerformed:
    "EPI007's MRI brain was requested but performed at the transferring unit, and the report has not yet been returned to the EHR, so no MRI performed date is recorded (searched radiology_results and the transfer summary).",
  traumaConsultantArrival:
    "TRA009 was a resuscitation-bay transfer and the consultant-arrival timestamp was not captured in the structured ED record; the trauma documentation is being retrieved, so the time from arrival cannot yet be confirmed (searched ed_trauma_receptions and the resuscitation note).",
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
    epilepsyInvestigations: "Read the MRI and ECG records",
    traumaReception: "Read the trauma reception times",
    traumaInterventions: "Read the CT, TXA and airway records",
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
  // Epilepsy12 population (timelineE -> epilepsyPopulation).
  epilepsy: {
    mapTemplate: { headline: "Mapping the template to the EHR schema…", detail: "Resolving each Epilepsy12 column to a field in the **EHR database** before copying across the structured demographics and the first-assessment details." },
    demographics: { headline: "Copying the demographics and referral fields…", detail: "Pulling date of birth, sex, age at first assessment, the referral date and the first paediatric assessment date straight from `patient_demographics` and `epilepsy_assessments`." },
    clinicLetters: { headline: "Reading the epilepsy clinic letters…", detail: "Reading each child's first epilepsy clinic letter for whether the assessing paediatrician had epilepsy expertise (KPI 1) and the seizure type that drives the ECG KPI." },
    specialistInput: { headline: "Copying the specialist-nurse and care-plan fields…", detail: "Pulling the epilepsy specialist nurse input date (KPI 2) and the comprehensive care plan date (KPI 9). Where input or a plan is not yet recorded the field carries an explicit label rather than a blank." },
    investigations: { headline: "Copying the MRI and ECG fields…", detail: "Pulling whether an MRI was indicated and its request/performed dates (KPI 5) and the ECG date for convulsive seizures (KPI 4). Cases where an investigation is not indicated, not yet done or unobtainable carry an explicit label." },
    mentalHealth: { headline: "Checking mental-health screening and support…", detail: "Pulling the mental-health screening date (KPI 6), then reading the screening note for whether a problem was identified and, where it was, whether support was provided (KPI 7)." },
    medicationSafety: { headline: "Checking valproate/topiramate safety…", detail: "Pulling the valproate and topiramate prescribing flags and, for females aged 12 or over on either drug, whether a pregnancy prevention programme is in place (KPI 8, safety-critical)." },
    finalizing: { headline: "Finalizing the audit…", detail: "All cells populated and traceable to the EHR record or the source notes." },
  },
  // Major trauma population (timelineT -> traumaPopulation).
  trauma: {
    mapTemplate: { headline: "Mapping the template to the EHR schema…", detail: "Resolving each NMTR column to a field in the **EHR database** before copying across the structured demographics and the injury-severity details." },
    demographics: { headline: "Copying the demographics and injury fields…", detail: "Pulling date of birth, sex, age, the Injury Severity Score and the AIS 3+ eligibility flag straight from `patient_demographics` and the trauma registry record." },
    registrySubmission: { headline: "Copying the registry submission fields…", detail: "Pulling the ED arrival time, discharge date and the NMTR submitted/complete flags with the submission date to check the 25-day BPT window (C1)." },
    reception: { headline: "Copying the trauma-reception fields…", detail: "Pulling whether a trauma team was activated, whether a consultant was present and the consultant arrival time (C2, Level 2). One reception time could not be located and is flagged." },
    investigations: { headline: "Copying the CT, TXA and airway fields…", detail: "Pulling the GCS and head-injury flag with the CT-head time (C3), the TXA indication and timing (C4) and the airway-considered time for low-GCS cases (C5). Cases where an intervention is not indicated or not eligible carry an explicit label." },
    resusNotes: { headline: "Reading the resuscitation notes…", detail: "Reading each case's resuscitation note for whether airway management/intubation was considered as part of the primary survey (C5)." },
    rehabilitation: { headline: "Checking the rehabilitation prescriptions…", detail: "Pulling whether rehabilitation needs were assessed, then reading the rehab/discharge note for whether a rehabilitation prescription was issued (C6, ISS ≥9)." },
    finalizing: { headline: "Finalizing the audit…", detail: "All cells populated and traceable to the EHR record or the source notes." },
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
  flowE: {
    reviewingTemplate: { headline: "Reviewing the template…", detail: "Reviewing the **Paediatric epilepsy (Epilepsy12)** audit against the **EHR database** and resolving the field mappings." },
  },
  flowT: {
    reviewingTemplate: { headline: "Reviewing the template…", detail: "Reviewing the **Paediatric major trauma (NMTR)** audit against the **EHR database** and resolving the field mappings." },
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

// --- Tracked-dashboard descriptors (home cards §2.2 + left panel §4) ---------
// Three paediatric BPT dashboards. Each opens a seeded audit via selectAudit().
// `trackers` lists ids into the `trackers` map below. Numbers/ids/refs/kinds are
// logic and identical across packs; title/subtitle strings stay English verbatim.
const dashboards = [
  {
    id: "paediatric-diabetes-bpt",
    auditId: "npda-lo-audit",
    title: "Diabetes BPT",
    logo: "dash-diabetes",
    subtitle: "NPDA · key care processes",
    submissionDeadline: "2026-07-20",
    trackers: ["t-dia-hba1c-coverage", "t-dia-care-processes", "t-dia-mdt-contacts", "t-dia-psychology", "t-dia-dietitian", "t-dia-carb-counting", "t-dia-high-hba1c", "t-dia-coeliac-thyroid"],
  },
  {
    id: "paediatric-epilepsy-bpt",
    auditId: "epilepsy12-lo-audit",
    title: "Epilepsy BPT",
    logo: "dash-epilepsy",
    subtitle: "Epilepsy12 · service KPIs",
    submissionDeadline: "2027-01-12",
    trackers: ["t-epi-paediatrician-2wk", "t-epi-esn-first-year", "t-epi-mri-6wk", "t-epi-ecg-convulsive", "t-epi-mh-screening", "t-epi-care-plan-12mo", "t-epi-valproate-ppp"],
  },
  {
    id: "paediatric-trauma-bpt",
    auditId: "nmtr-trauma-lo-audit",
    title: "Major Trauma BPT",
    logo: "dash-trauma",
    subtitle: "NMTR · acute care standards",
    submissionDeadline: "Submit ≤25 days of discharge",
    trackers: ["t-tra-registry-25d", "t-tra-consultant-5min", "t-tra-ct-head-60min", "t-tra-txa-1h", "t-tra-airway-30min", "t-tra-rehab-prescription"],
  },
  {
    id: "cord-ph-bpt",
    auditId: "cord-ph-lo-audit",
    title: "Cord pH Audit",
    logo: "dash-cordph",
    subtitle: "Cord blood gas · quality at birth",
    submissionDeadline: "2026-06-12",
    trackers: ["t-cord-paired-gases", "t-cord-ph-acidosis", "t-cord-severe-acidosis", "t-cord-base-excess", "t-cord-nicu-admission", "t-cord-dcc", "t-cord-acidosis-trend"],
  },
];

// --- Tracker descriptors (spec §7.2), keyed by tracker id --------------------
// Values are real proportions/counts computed from the records above against the
// research §3 criteria (eligibility-gated where the criterion is); highlightRefs
// are the patient row-anchors (<Sheet>!A<row>) for the patients in each bin.
// Strings (title/label/criterion) stay English verbatim across packs.
const trackers = {
  // === Dashboard 1 — Paediatric Diabetes BPT (NPDA, rows A2–A13) ============
  // A1 — HbA1c ≥4×/yr coverage. The mock holds one HbA1c per patient, so the
  // proportion is representative; the not-met rows are the two highest HbA1c
  // patients (NPD006, NPD005) as exemplars of incomplete monitoring.
  "t-dia-hba1c-coverage": {
    id: "t-dia-hba1c-coverage",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Dekking HbA1c ≥4×/jr",
    kind: "timeseries",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "m1", label: "aug.", value: 0.55, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m2", label: "sep.", value: 0.62, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m3", label: "okt.", value: 0.70, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m4", label: "nov.", value: 0.75, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m5", label: "dec.", value: 0.80, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m6", label: "jan.", value: 0.83, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
    ],
    criterion: "BPT-criterium kinderdiabetes (j) — ≥4 gedateerde HbA1c-uitslagen in het auditjaar, cohortdoel ≥90% (onderzoek §3 A1) [3]",
  },
  // A2 — seven NICE annual health checks, cohort partitioned by number of
  // applicable checks completed (recomputed from the BP/foot/retinal/ACR/
  // cholesterol/thyroid/coeliac fields per patient). The four bars partition all
  // 12 patients (6 + 1 + 2 + 3); each bar's row count equals value × 12. Each
  // row highlights all seven check-date columns {AG,AH,AI,AK,AN,AP,AR}.
  "t-dia-care-processes": {
    id: "t-dia-care-processes",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Zeven jaarlijkse NICE-gezondheidscontroles",
    kind: "histogram",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "c5", label: "5 controles uitgevoerd", value: 6 / 12, status: "met", highlightRefs: ["NPDA!AG2", "NPDA!AH2", "NPDA!AI2", "NPDA!AK2", "NPDA!AN2", "NPDA!AP2", "NPDA!AR2", "NPDA!AG3", "NPDA!AH3", "NPDA!AI3", "NPDA!AK3", "NPDA!AN3", "NPDA!AP3", "NPDA!AR3", "NPDA!AG6", "NPDA!AH6", "NPDA!AI6", "NPDA!AK6", "NPDA!AN6", "NPDA!AP6", "NPDA!AR6", "NPDA!AG7", "NPDA!AH7", "NPDA!AI7", "NPDA!AK7", "NPDA!AN7", "NPDA!AP7", "NPDA!AR7", "NPDA!AG9", "NPDA!AH9", "NPDA!AI9", "NPDA!AK9", "NPDA!AN9", "NPDA!AP9", "NPDA!AR9", "NPDA!AG13", "NPDA!AH13", "NPDA!AI13", "NPDA!AK13", "NPDA!AN13", "NPDA!AP13", "NPDA!AR13"] },
      { key: "c4", label: "4 controles uitgevoerd", value: 1 / 12, status: "not-met", highlightRefs: ["NPDA!AG11", "NPDA!AH11", "NPDA!AI11", "NPDA!AK11", "NPDA!AN11", "NPDA!AP11", "NPDA!AR11"] },
      { key: "c2", label: "2 controles uitgevoerd", value: 2 / 12, status: "not-met", highlightRefs: ["NPDA!AG4", "NPDA!AH4", "NPDA!AI4", "NPDA!AK4", "NPDA!AN4", "NPDA!AP4", "NPDA!AR4", "NPDA!AG8", "NPDA!AH8", "NPDA!AI8", "NPDA!AK8", "NPDA!AN8", "NPDA!AP8", "NPDA!AR8"] },
      { key: "c1", label: "1 controle uitgevoerd", value: 3 / 12, status: "not-met", highlightRefs: ["NPDA!AG5", "NPDA!AH5", "NPDA!AI5", "NPDA!AK5", "NPDA!AN5", "NPDA!AP5", "NPDA!AR5", "NPDA!AG10", "NPDA!AH10", "NPDA!AI10", "NPDA!AK10", "NPDA!AN10", "NPDA!AP10", "NPDA!AR10", "NPDA!AG12", "NPDA!AH12", "NPDA!AI12", "NPDA!AK12", "NPDA!AN12", "NPDA!AP12", "NPDA!AR12"] },
    ],
    criterion: "BPT-criterium kinderdiabetes (k) — de zeven jaarlijkse NICE-gezondheidscontroles uitgevoerd waar van toepassing (onderzoek §3 A2) [3][5]",
  },
  // A3 — MDT clinic ≥4/yr + ≥8 additional contacts. Representative headline
  // (no per-contact field in the mock); the gap exemplar is the highest-HbA1c row.
  "t-dia-mdt-contacts": {
    id: "t-dia-mdt-contacts",
    dashboardId: "paediatric-diabetes-bpt",
    title: "MDT-polikliniek ≥4/jr + ≥8 contacten",
    kind: "stat",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Patiënten die voldoen aan ≥4 poliklinische bezoeken + ≥8 contacten", value: 11, status: "met", highlightRefs: ["NPDA!O2", "NPDA!O3", "NPDA!O4", "NPDA!O5", "NPDA!O6", "NPDA!O8", "NPDA!O9", "NPDA!O10", "NPDA!O11", "NPDA!O12", "NPDA!O13"] },
    ],
    criterion: "BPT-criteria kinderdiabetes (g) & (h) — ≥4 poliklinische MDT-afspraken en ≥8 aanvullende contacten per jaar. Proxy: de mockdataset bevat geen veld per contact, daarom verankert het poliklinische bezoek van elke patiënt (kolom O) de markering (onderzoek §3 A3) [3]",
  },
  // A4 — annual psychology assessment (psychScreen present in audit year for all).
  "t-dia-psychology": {
    id: "t-dia-psychology",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Jaarlijkse psychologische beoordeling",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Dit jaar beoordeeld", value: 12 / 12, status: "met", highlightRefs: ["NPDA!AY2", "NPDA!AY3", "NPDA!AY4", "NPDA!AY5", "NPDA!AY6", "NPDA!AY7", "NPDA!AY8", "NPDA!AY9", "NPDA!AY10", "NPDA!AY11", "NPDA!AY12", "NPDA!AY13"] },
      { key: "not-met", label: "Niet beoordeeld", value: 0, status: "not-met", highlightRefs: [] },
    ],
    criterion: "BPT-criterium kinderdiabetes (l) — ten minste jaarlijks een psychologische beoordeling van de behoefte aan aanvullende ondersteuning (onderzoek §3 A4) [3]",
  },
  // A5 — additional dietitian appointment offered (i.dietitian.v === "Yes").
  "t-dia-dietitian": {
    id: "t-dia-dietitian",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Aanvullende afspraak met diëtist aangeboden",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Aangeboden", value: 9 / 12, status: "met", highlightRefs: ["NPDA!BD2", "NPDA!BD3", "NPDA!BD4", "NPDA!BD6", "NPDA!BD7", "NPDA!BD8", "NPDA!BD9", "NPDA!BD11", "NPDA!BD13"] },
      { key: "not-met", label: "Niet aangeboden", value: 3 / 12, status: "not-met", highlightRefs: ["NPDA!BD5", "NPDA!BD10", "NPDA!BD12"] },
    ],
    criterion: "BPT-criterium kinderdiabetes (i) — ten minste één aanvullende afspraak met een diëtist per jaar aangeboden, doel ≥90% (onderzoek §3 A5) [3]",
  },
  // A6 — carb-counting ≤14d of diagnosis, cohort = newly-diagnosed T1 (NPD003, NPD007).
  "t-dia-carb-counting": {
    id: "t-dia-carb-counting",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Koolhydraten tellen ≤14 d na diagnose (nieuwe T1)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Binnen 14 dagen", value: 1 / 2, status: "met", highlightRefs: ["NPDA!BC4", "NPDA!I4"] },
      { key: "not-met", label: "Meer dan 14 dagen", value: 1 / 2, status: "not-met", highlightRefs: ["NPDA!BC8", "NPDA!I8"] },
    ],
    criterion: "BPT-criterium kinderdiabetes (f) — koolhydraten tellen op niveau 3 binnen 14 dagen na diagnose bij nieuwe type 1-diabetes, noemer = nieuw gediagnosticeerd (onderzoek §3 A6) [3]",
  },
  // A7 — high-HbA1c (≥69 mmol/mol) follow-up flag. Count at risk = 5.
  "t-dia-high-hba1c": {
    id: "t-dia-high-hba1c",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Signalering follow-up bij hoog HbA1c (≥69)",
    kind: "stat",
    target: { op: "<=", value: 0 },
    elements: [
      { key: "at-risk", label: "Patiënten met HbA1c ≥69 mmol/mol", value: 5, status: "not-met", highlightRefs: ["NPDA!T3", "NPDA!T4", "NPDA!T6", "NPDA!T7", "NPDA!T9"] },
    ],
    criterion: "BPT-criterium kinderdiabetes (o)(i) — een HbA1c ≥69 mmol/mol vereist escalatie; gemarkeerd als opbrengst met risico (onderzoek §3 A7) [3]",
  },
  // A8 — coeliac + thyroid screening at diagnosis, cohort = newly-diagnosed T1.
  "t-dia-coeliac-thyroid": {
    id: "t-dia-coeliac-thyroid",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Coeliakie- + schildklierscreening bij diagnose (nieuwe T1)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Beide gescreend", value: 2 / 2, status: "met", highlightRefs: ["NPDA!AR4", "NPDA!AP4", "NPDA!AR8", "NPDA!AP8"] },
      { key: "not-met", label: "Onvolledig", value: 0, status: "not-met", highlightRefs: [] },
    ],
    criterion: "Subset van BPT-criterium kinderdiabetes (k) — coeliakie- en schildklierscreening rond de diagnose bij nieuwe type 1-diabetes (onderzoek §3 A8) [3][5]",
  },

  // === Dashboard 2 — Paediatric Epilepsy BPT (Epilepsy12, rows A2–A11) ======
  // B1 — epilepsy-expert paediatrician ≤2 weeks of referral.
  "t-epi-paediatrician-2wk": {
    id: "t-epi-paediatrician-2wk",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "Kinderarts met epilepsie-expertise ≤2 weken",
    kind: "timeseries",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "m1", label: "aug.", value: 0.50, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m2", label: "sep.", value: 0.58, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m3", label: "okt.", value: 0.65, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m4", label: "nov.", value: 0.72, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m5", label: "dec.", value: 0.78, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m6", label: "jan.", value: 0.80, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
    ],
    criterion: "Epilepsy12 KPI 1 — beoordeeld door een kinderarts-specialist met epilepsie-expertise binnen 2 weken na verwijzing (onderzoek §3 B1) [7]",
  },
  // B2 — ESN input within the first year.
  "t-epi-esn-first-year": {
    id: "t-epi-esn-first-year",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "Inbreng van de ESN binnen het eerste jaar",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "ESN-inbreng in het jaar", value: 9 / 10, status: "met", highlightRefs: ["Epilepsy!J2", "Epilepsy!J3", "Epilepsy!J4", "Epilepsy!J5", "Epilepsy!J6", "Epilepsy!J8", "Epilepsy!J9", "Epilepsy!J10", "Epilepsy!J11"] },
      { key: "not-met", label: "Geen ESN-inbreng", value: 1 / 10, status: "not-met", highlightRefs: ["Epilepsy!J7"] },
    ],
    criterion: "Epilepsy12 KPI 2 — inbreng van een epilepsieverpleegkundige (ESN) binnen het eerste zorgjaar (onderzoek §3 B2) [3][7]",
  },
  // B3 — MRI ≤6 weeks where indicated (eligible = mriIndicated Yes; 6 of 10).
  "t-epi-mri-6wk": {
    id: "t-epi-mri-6wk",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "MRI ≤6 weken (indien geïndiceerd)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Binnen 6 weken", value: 4 / 6, status: "met", highlightRefs: ["Epilepsy!M2", "Epilepsy!N2", "Epilepsy!M3", "Epilepsy!N3", "Epilepsy!M6", "Epilepsy!N6", "Epilepsy!M10", "Epilepsy!N10"] },
      { key: "not-met", label: "Meer dan 6 weken / niet uitgevoerd", value: 2 / 6, status: "not-met", highlightRefs: ["Epilepsy!M4", "Epilepsy!N4", "Epilepsy!M8", "Epilepsy!N8"] },
    ],
    criterion: "Epilepsy12 KPI 5 — MRI binnen 6 weken na aanvraag waar geïndiceerd; noemer = uitsluitend geïndiceerde casussen (onderzoek §3 B3) [7]",
  },
  // B4 — ECG in convulsive seizures (eligible = convulsive; 7 of 10).
  "t-epi-ecg-convulsive": {
    id: "t-epi-ecg-convulsive",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "ECG bij convulsieve aanvallen",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "ECG uitgevoerd", value: 6 / 7, status: "met", highlightRefs: ["Epilepsy!Q2", "Epilepsy!Q3", "Epilepsy!Q5", "Epilepsy!Q8", "Epilepsy!Q9", "Epilepsy!Q11"] },
      { key: "not-met", label: "Geen ECG", value: 1 / 7, status: "not-met", highlightRefs: ["Epilepsy!Q6"] },
    ],
    criterion: "Epilepsy12 KPI 4 — ECG binnen het eerste jaar wanneer de aanvallen convulsief zijn; noemer = convulsieve casussen (onderzoek §3 B4) [7]",
  },
  // B5 — mental-health screening documented within first year.
  "t-epi-mh-screening": {
    id: "t-epi-mh-screening",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "Screening op geestelijke gezondheid + ondersteuning",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Gescreend", value: 9 / 10, status: "met", highlightRefs: ["Epilepsy!S2", "Epilepsy!S3", "Epilepsy!S4", "Epilepsy!S5", "Epilepsy!S6", "Epilepsy!S7", "Epilepsy!S8", "Epilepsy!S9", "Epilepsy!S11"] },
      { key: "not-met", label: "Niet gescreend", value: 1 / 10, status: "not-met", highlightRefs: ["Epilepsy!S10"] },
    ],
    criterion: "Epilepsy12 KPI's 6 & 7 — screening op geestelijke gezondheid gedocumenteerd in het eerste jaar, met ondersteuning wanneer een probleem wordt vastgesteld (onderzoek §3 B5) [7]",
  },
  // B6 — comprehensive care plan by 12 months.
  "t-epi-care-plan-12mo": {
    id: "t-epi-care-plan-12mo",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "Volledig zorgplan binnen 12 maanden",
    kind: "timeseries",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "m1", label: "aug.", value: 0.55, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m2", label: "sep.", value: 0.65, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m3", label: "okt.", value: 0.72, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m4", label: "nov.", value: 0.80, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m5", label: "dec.", value: 0.85, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m6", label: "jan.", value: 0.90, status: "met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
    ],
    criterion: "Epilepsy12 KPI 9a/9b — een overeengekomen volledig zorgplan binnen 12 maanden (onderzoek §3 B6) [7]",
  },
  // B7 — valproate/topiramate safety (PPP). Eligible = female ≥12 on valproate/
  // topiramate (EPI002, EPI003, EPI005); EPI005 is the deliberate PPP gap.
  "t-epi-valproate-ppp": {
    id: "t-epi-valproate-ppp",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "Veiligheid van valproaat/topiramaat (PPP)",
    kind: "stat",
    target: { op: ">=", value: 1 },
    elements: [
      { key: "at-risk", label: "Op valproaat/topiramaat zonder PPP", value: 1, status: "not-met", highlightRefs: ["Epilepsy!AA6"] },
    ],
    criterion: "Epilepsy12 KPI 8 — zwangerschapspreventieprogramma / risico-erkenning voor meisjes en vrouwen ≥12 jaar die valproaat of topiramaat gebruiken (onderzoek §3 B7) [7]",
  },

  // === Dashboard 3 — Paediatric Major Trauma BPT (NMTR, rows A2–A11) ========
  // C1 — registry submission ≤25 days of discharge (the BPT trigger).
  "t-tra-registry-25d": {
    id: "t-tra-registry-25d",
    dashboardId: "paediatric-trauma-bpt",
    title: "Indiening bij het register ≤25 dagen",
    kind: "timeseries",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "m1", label: "aug.", value: 0.60, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m2", label: "sep.", value: 0.70, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m3", label: "okt.", value: 0.78, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m4", label: "nov.", value: 0.83, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m5", label: "dec.", value: 0.88, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m6", label: "jan.", value: 0.90, status: "met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
    ],
    criterion: "Trigger van de BPT ernstig trauma — NMTR/TARN-dataset volledig en ingediend binnen 25 dagen na ontslag (onderzoek §3 C1) [10][12]",
  },
  // C2 — consultant-led reception ≤5 min, eligible = Level 2 (ISS ≥16; 6 cases).
  "t-tra-consultant-5min": {
    id: "t-tra-consultant-5min",
    dashboardId: "paediatric-trauma-bpt",
    title: "Opvang onder leiding van een medisch specialist ≤5 min (niveau 2)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Medisch specialist ≤5 min", value: 4 / 6, status: "met", highlightRefs: ["Trauma!N2", "Trauma!O2", "Trauma!P2", "Trauma!N4", "Trauma!O4", "Trauma!P4", "Trauma!N7", "Trauma!O7", "Trauma!P7", "Trauma!N8", "Trauma!O8", "Trauma!P8"] },
      { key: "not-met", label: "Meer dan 5 min / niet geregistreerd", value: 2 / 6, status: "not-met", highlightRefs: ["Trauma!N3", "Trauma!O3", "Trauma!P3", "Trauma!N10", "Trauma!O10", "Trauma!P10"] },
    ],
    criterion: "BPT ernstig trauma (niveau 2, ISS ≥16) — traumateam onder leiding van een medisch specialist, specialist aanwezig binnen 5 min na aankomst (onderzoek §3 C2) [10]",
  },
  // C3 — CT head ≤60 min, eligible = Level 2 head injury with GCS ≤13 (6 cases).
  "t-tra-ct-head-60min": {
    id: "t-tra-ct-head-60min",
    dashboardId: "paediatric-trauma-bpt",
    title: "CT-schedel ≤60 min (GCS ≤13, niveau 2)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Binnen 60 min", value: 5 / 6, status: "met", highlightRefs: ["Trauma!R2", "Trauma!S2", "Trauma!T2", "Trauma!R4", "Trauma!S4", "Trauma!T4", "Trauma!R7", "Trauma!S7", "Trauma!T7", "Trauma!R8", "Trauma!S8", "Trauma!T8", "Trauma!R10", "Trauma!S10", "Trauma!T10"] },
      { key: "not-met", label: "Meer dan 60 min", value: 1 / 6, status: "not-met", highlightRefs: ["Trauma!R3", "Trauma!S3", "Trauma!T3"] },
    ],
    criterion: "BPT ernstig trauma (niveau 2) — CT-schedel binnen 60 min voor casussen met schedelletsel en een GCS ≤13 (onderzoek §3 C3) [10]",
  },
  // C4 — tranexamic acid ≤1 h, eligible = Level 2 with TXA indicated (4 cases).
  "t-tra-txa-1h": {
    id: "t-tra-txa-1h",
    dashboardId: "paediatric-trauma-bpt",
    title: "Tranexamic acid ≤1 h (Level 2)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Within 1 hour", value: 3 / 4, status: "met", highlightRefs: ["Trauma!V2", "Trauma!W2", "Trauma!X2", "Trauma!V4", "Trauma!W4", "Trauma!X4", "Trauma!V8", "Trauma!W8", "Trauma!X8"] },
      { key: "not-met", label: "Over 1 hour", value: 1 / 4, status: "not-met", highlightRefs: ["Trauma!V7", "Trauma!W7", "Trauma!X7"] },
    ],
    criterion: "Major Trauma BPT (Level 2) — tranexamic acid within 1 hour where indicated (research §3 C4) [10]",
  },
  // C5 — airway considered ≤30 min, eligible = Level 1 GCS <9 (4 cases; all met).
  "t-tra-airway-30min": {
    id: "t-tra-airway-30min",
    dashboardId: "paediatric-trauma-bpt",
    title: "Airway considered ≤30 min (GCS <9)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Within 30 min", value: 4 / 4, status: "met", highlightRefs: ["Trauma!Z2", "Trauma!AA2", "Trauma!Z4", "Trauma!AA4", "Trauma!Z7", "Trauma!AA7", "Trauma!Z8", "Trauma!AA8"] },
      { key: "not-met", label: "Over 30 min", value: 0, status: "not-met", highlightRefs: [] },
    ],
    criterion: "Major Trauma BPT (Level 1) — airway/intubation considered within 30 min for GCS <9 (research §3 C5) [10]",
  },
  // C6 — rehabilitation prescription, cohort = ISS ≥9 (9 cases; TRA005 is the gap).
  "t-tra-rehab-prescription": {
    id: "t-tra-rehab-prescription",
    dashboardId: "paediatric-trauma-bpt",
    title: "Rehabilitation prescription (ISS ≥9)",
    kind: "stat",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "gap", label: "ISS≥9 cases without a rehab prescription", value: 1, status: "not-met", highlightRefs: ["Trauma!AC6", "Trauma!AD6"] },
    ],
    criterion: "Major Trauma BPT (Level 1) — rehabilitation needs assessed and a rehabilitation prescription issued for ISS ≥9 (research §3 C6) [10]",
  },

  // === Dashboard 4 — Cord pH Audit (cord blood gas, ALL sheet rows 2–10) =====
  // Nine babies CPH001→row 2 … CPH009→row 10. Values computed from the cord
  // records: pH (Z), BE (AA), DCC (Y), NICU (AM). CPH003 (row 4) has no valid
  // arterial pH (clotted sample) so it is the missing-gas / pH-eligibility gap.
  // D1 — paired cord gases sampled (valid arterial pH recorded). 8 of 9; the
  // not-met row is CPH003 (clotted sample, no valid pH).
  "t-cord-paired-gases": {
    id: "t-cord-paired-gases",
    dashboardId: "cord-ph-bpt",
    title: "Paired cord gases sampled",
    kind: "donut",
    target: { op: ">=", value: 0.95 },
    elements: [
      { key: "met", label: "Valid arterial pH recorded", value: 8 / 9, status: "met", highlightRefs: ["ALL!Z2", "ALL!AA2", "ALL!Z3", "ALL!AA3", "ALL!Z5", "ALL!AA5", "ALL!Z6", "ALL!AA6", "ALL!Z7", "ALL!AA7", "ALL!Z8", "ALL!AA8", "ALL!Z9", "ALL!AA9", "ALL!Z10", "ALL!AA10"] },
      { key: "not-met", label: "Missing / unusable", value: 1 / 9, status: "not-met", highlightRefs: ["ALL!Z4", "ALL!AA4"] },
    ],
    criterion: "Cord blood gas audit — paired (arterial + venous) cord gases sampled at birth, target ≥95% of births (research §7.1 D1)",
  },
  // D2 — cord arterial pH ≥7.1 (non-acidotic). Denominator = babies with a valid
  // pH (8). met = pH ≥7.1 (rows 2,5,6,7,8,9); not-met = pH <7.1 (rows 3,10).
  "t-cord-ph-acidosis": {
    id: "t-cord-ph-acidosis",
    dashboardId: "cord-ph-bpt",
    title: "Cord arterial pH ≥7.1",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "pH ≥7.1", value: 6 / 8, status: "met", highlightRefs: ["ALL!Z2", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9"] },
      { key: "not-met", label: "pH <7.1 (acidotic)", value: 2 / 8, status: "not-met", highlightRefs: ["ALL!Z3", "ALL!Z10"] },
    ],
    criterion: "Cord blood gas audit — cord arterial pH ≥7.1 at birth (non-acidotic), denominator = babies with a valid pH (research §7.1 D2)",
  },
  // D3 — severe acidosis (pH <7.0). One baby: CPH009 (pH 6.98, row 10).
  "t-cord-severe-acidosis": {
    id: "t-cord-severe-acidosis",
    dashboardId: "cord-ph-bpt",
    title: "Severe acidosis (pH <7.0)",
    kind: "stat",
    target: { op: "<=", value: 0 },
    elements: [
      { key: "at-risk", label: "Babies with cord arterial pH <7.0", value: 1, status: "not-met", highlightRefs: ["ALL!Z10"] },
    ],
    criterion: "Cord blood gas audit — severe metabolic acidosis (cord arterial pH <7.0) flagged for review; any case is a sentinel finding (research §7.1 D3)",
  },
  // D4 — base-excess distribution (col AA). Denominator = babies with a BE value
  // (8). Healthy band BE ≥ -8 (rows 2,5,8,9) = met; worse bands not-met.
  "t-cord-base-excess": {
    id: "t-cord-base-excess",
    dashboardId: "cord-ph-bpt",
    title: "Base excess distribution",
    kind: "histogram",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "be1", label: "≥ -8", value: 4 / 8, status: "met", highlightRefs: ["ALL!AA2", "ALL!AA5", "ALL!AA8", "ALL!AA9"] },
      { key: "be2", label: "-8 to -12", value: 2 / 8, status: "not-met", highlightRefs: ["ALL!AA6", "ALL!AA7"] },
      { key: "be3", label: "< -12", value: 2 / 8, status: "not-met", highlightRefs: ["ALL!AA3", "ALL!AA10"] },
    ],
    criterion: "Cord blood gas audit — cord arterial base excess distribution; BE ≥ -8 mmol/L is the reassuring band, denominator = babies with a recorded BE (research §7.1 D4)",
  },
  // D5 — NICU admission (col AM). met = not admitted (6, rows 2,4,5,6,8,9);
  // not-met = admitted (3, rows 3,7,10).
  "t-cord-nicu-admission": {
    id: "t-cord-nicu-admission",
    dashboardId: "cord-ph-bpt",
    title: "NICU admission",
    kind: "donut",
    target: { op: "<=", value: 0.2 },
    elements: [
      { key: "met", label: "Not admitted", value: 6 / 9, status: "met", highlightRefs: ["ALL!AM2", "ALL!AM5", "ALL!AM6", "ALL!AM8", "ALL!AM9", "ALL!AM4"] },
      { key: "not-met", label: "Admitted to NICU", value: 3 / 9, status: "not-met", highlightRefs: ["ALL!AM3", "ALL!AM7", "ALL!AM10"] },
    ],
    criterion: "Cord blood gas audit — term admissions to NICU after birth; lower is better, framed as a quality-at-birth indicator (research §7.1 D5)",
  },
  // D6 — delayed cord clamping performed (i.dcc.v, col Y). met = Yes (4, rows
  // 2,4,5,9); not-met = No (5, rows 3,6,7,8,10).
  "t-cord-dcc": {
    id: "t-cord-dcc",
    dashboardId: "cord-ph-bpt",
    title: "Delayed cord clamping performed",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "DCC performed", value: 4 / 9, status: "met", highlightRefs: ["ALL!Y2", "ALL!Y4", "ALL!Y5", "ALL!Y9"] },
      { key: "not-met", label: "No DCC", value: 5 / 9, status: "not-met", highlightRefs: ["ALL!Y3", "ALL!Y6", "ALL!Y7", "ALL!Y8", "ALL!Y10"] },
    ],
    criterion: "Cord blood gas audit — delayed cord clamping performed at birth, target ≥90% of eligible births (research §7.1 D6)",
  },
  // D7 — acidosis rate (pH <7.1) trend. Lower is better, target ≤0.10. Six
  // monthly points trending down; the latest (Jan) ≈ the current cohort's <7.1
  // rate (2 of 8 = 0.25). Refs = the full pH column (col Z, all 9 rows).
  "t-cord-acidosis-trend": {
    id: "t-cord-acidosis-trend",
    dashboardId: "cord-ph-bpt",
    title: "Acidosis rate (pH <7.1) trend",
    kind: "timeseries",
    target: { op: "<=", value: 0.1 },
    elements: [
      { key: "m1", label: "aug.", value: 0.45, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m2", label: "sep.", value: 0.40, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m3", label: "okt.", value: 0.36, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m4", label: "nov.", value: 0.31, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m5", label: "dec.", value: 0.28, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m6", label: "jan.", value: 0.25, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
    ],
    criterion: "Cord blood gas audit — monthly cord arterial acidosis rate (pH <7.1); lower is better, improvement target ≤10% (research §7.1 D7)",
  },
};

export default {
  databases,
  ehrDatabaseName,
  analyses,
  cordTemplate,
  catalog,
  columns,
  records: { cord, chest, npda, epilepsy, trauma },
  codeMaps,
  labels,
  auditDetail,
  specValues,
  explain,
  blockedReason,
  timeline,
  email,
  dashboards,
  trackers,
};
