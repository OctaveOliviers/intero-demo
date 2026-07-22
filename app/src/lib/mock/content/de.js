// German content pack for the Intero demo mock layer.
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
  { id: "patient-notes-db", name: "Patientenakten", status: "ready" },
  { id: "lab-results-db", name: "Laborbefunde", status: "ready" },
  { id: "radiology-db", name: "Radiologie-Datenbank", status: "ready" },
];

const ehrDatabaseName = "EHR-Datenbank";

// --- Pre-loaded analyses (home list) ----------------------------------------
const analyses = [
  { id: "sentinel-stroke", name: "Sentinel-Schlaganfall", description: "Door-to-Needle-Zeiten, Bildgebung und Outcomes bei Sentinel-Schlaganfall-Aufnahmen.", defaultFilters: blankFilters() },
  { id: "paediatric-diabetes", name: "Pädiatrischer Diabetes", description: "Neue pädiatrische Typ-1-Erstmanifestationen, DKA-Schweregrad und Nachsorge.", defaultFilters: blankFilters() },
  { id: "emergency-laparotomy", name: "Notfall-Laparotomie", description: "Risikobeurteilung, Zeit bis zur OP und Outcomes bei Notfall-Laparotomien.", defaultFilters: blankFilters() },
  { id: "heart-failure", name: "Herzinsuffizienz", description: "Aufnahmen wegen Herzinsuffizienz: Ejektionsfraktion, Behandlung und Wiederaufnahme.", defaultFilters: blankFilters() },
  { id: "early-inflammatory-autoimmune", name: "Frühe entzündliche Autoimmunerkrankungen", description: "Zeit bis zur Diagnose und Behandlung bei früher entzündlicher Autoimmunerkrankung.", defaultFilters: blankFilters() },
];

// The cord-pH template the user uploads live (Flow A).
const cordTemplate = {
  id: "cord-ph-audit",
  name: "Audit des Nabelschnur-pH bei Geburt",
  description: "Nabelschnur-Blutgas, Reanimation und Dokumentationsqualität bei Geburt.",
  defaultFilters: blankFilters(),
};

// --- Template catalog (translatable: category, name, description, columns) ---
// KEEP id, fileName, submissionDeadline unchanged.
const catalog = [
  {
    category: "Nationale Audits",
    templates: [
      {
        id: "nnap-national",
        name: "Neonatologische Versorgung",
        category: "Nationale Audits",
        fileName: "nnap-audit.xlsx",
        description:
          "National Neonatal Audit Programme — Aufnahmen, Atemunterstützung und Outcomes bei Neugeborenen, die auf neonatologische Stationen aufgenommen werden.",
        columns: [
          "NHS-Nummer",
          "Gestationsalter (Wochen)",
          "Geburtsgewicht (Gramm)",
          "Aufnahmetemperatur",
          "Antenatale Steroide",
          "Magnesiumsulfat verabreicht",
          "Art der Atemunterstützung",
          "Tage mit Atemunterstützung",
          "ROP-Screening durchgeführt",
          "Muttermilch bei Entlassung",
          "Überleben bis zur Entlassung",
        ],
      },
      {
        id: "nhfd-national",
        name: "Hüftfraktur",
        category: "Nationale Audits",
        fileName: "nhfd-audit.xlsx",
        description:
          "National Hip Fracture Database — Versorgungsqualität und Outcomes bei Patienten, die mit einer osteoporotischen Hüftfraktur aufgenommen werden.",
        columns: [
          "NHS-Nummer",
          "Alter",
          "Geschlecht",
          "Frakturtyp",
          "Zeit bis zur Operation (Stunden)",
          "Art der Operation",
          "Präoperative kognitive Beurteilung",
          "Dekubitus-Status",
          "Knochenschutzmedikation",
          "Mobilisiert an Tag 1",
          "30-Tage-Mortalität",
        ],
      },
      {
        id: "minap-national",
        name: "Herzinfarkt",
        category: "Nationale Audits",
        fileName: "minap-audit.xlsx",
        description:
          "Myocardial Ischaemia National Audit Project — Behandlung und Outcomes bei Patienten, die mit akutem Koronarsyndrom aufgenommen werden.",
        columns: [
          "NHS-Nummer",
          "Alter",
          "Aufnahmediagnose",
          "Zeitpunkt des Symptombeginns",
          "Aufnahmezeitpunkt",
          "ECG-Befund",
          "Troponin-Befund",
          "Reperfusionsbehandlung",
          "Door-to-Balloon-Zeit (Min.)",
          "Bei Entlassung auf Statin",
          "Bei Entlassung auf dualer Thrombozytenaggregationshemmung",
        ],
      },
      {
        id: "npda-lo-audit",
        name: "Pädiatrischer Diabetes",
        category: "Nationale Audits",
        fileName: "npda-diabetes-audit.xlsx",
        submissionDeadline: "2026-07-20",
        description:
          "National Paediatric Diabetes Audit — jährliche Überprüfung von Kindern und Jugendlichen mit Diabetes: HbA1c, die wesentlichen Versorgungsprozesse, Überwachungs-Screening und psychologische Unterstützung.",
        columns: [
          // Full NPDA 2026 core dataset — all 59 data items, in dataset order.
          "NHS-Nummer",
          "Geburtsdatum",
          "Postleitzahl der üblichen Adresse",
          "Bei Geburt zugewiesenes Geschlecht",
          "Ethnische Zugehörigkeit",
          "ADHS-/ASS-Diagnose",
          "Lernbehinderung",
          "Diabetes-Typ",
          "Diagnosedatum",
          "Datum des Ausscheidens aus dem Dienst",
          "Grund für das Ausscheiden aus dem Dienst",
          "Sterbedatum",
          "Hausarztpraxis-Code",
          "PDU-Nummer",
          "Termin-/Vorstellungsdatum",
          "Körpergröße (cm)",
          "Gewicht (kg)",
          "Messdatum (Größe/Gewicht)",
          "HbA1c (mmol/mol)",
          "Messdatum (HbA1c)",
          "Insulinregime",
          "Sonstiges blutzuckersenkendes Medikament",
          "Lebensstil-/Ernährungsberatung erfolgt",
          "CGM in Verwendung",
          "Blutketon-Testung",
          "Immuntherapie erhalten",
          "Datum des Immuntherapiebeginns",
          "Systolischer BP",
          "Diastolischer BP",
          "Messdatum (BP)",
          "Datum der Fußuntersuchung",
          "Datum des Netzhaut-Screenings",
          "Ergebnis des Netzhaut-Screenings",
          "Albumin im Urin (ACR)",
          "Messdatum (ACR)",
          "Albuminurie-Stadium",
          "Gesamtcholesterin (mmol/l)",
          "Messdatum (Cholesterin)",
          "Messdatum (Schilddrüsenfunktion)",
          "Schilddrüsenbehandlung",
          "Messdatum (Zöliakie-Screening)",
          "Glutenfreie Ernährung",
          "Raucht / dampft",
          "Datum der Raucherentwöhnungsberatung",
          "Datum der Influenza-Impfung",
          "Datum der Krankheitstage-Regeln-Beratung",
          "Datum des psychologischen Screenings",
          "Zusätzliche psychologische Unterstützung erforderlich",
          "Termin für psychische Gesundheit angeboten",
          "Datum der Level-3-Kohlenhydratzählung",
          "Zusätzlicher Diätassistenz-Termin angeboten",
          "Datum des Diätassistenz-Termins",
          "Aufnahmebeginn-Datum",
          "Aufnahmeentlassung-Datum",
          "Aufnahmegrund",
          "Aufnahmegrund (sonstige)",
          "Verabreichte DKA-Therapien",
          "Initialer pH bei Aufnahme",
          "Initiales Bikarbonat (mmol/l)",
        ],
      },
      {
        id: "epilepsy12-lo-audit",
        name: "Pädiatrische Epilepsie",
        category: "Nationale Audits",
        fileName: "epilepsy12-audit.xlsx",
        submissionDeadline: "2027-01-12",
        description:
          "Epilepsy12 — nationales klinisches Audit zu Anfällen und Epilepsien bei Kindern und Jugendlichen: KPIs des ersten Versorgungsjahres zu fachärztlicher Beurteilung, Diagnostik, Screening der psychischen Gesundheit und Medikationssicherheit.",
        columns: [
          "NHS-Nummer",
          "Geburtsdatum",
          "Bei Geburt zugewiesenes Geschlecht",
          "Alter bei Erstbeurteilung",
          "Überweisungsdatum",
          "Datum der ersten pädiatrischen Beurteilung",
          "Von epilepsieerfahrenem Pädiater beurteilt",
          "Datum der Einbindung der Epilepsie-Fachpflegekraft",
          "MRI indiziert",
          "Datum der MRI-Anforderung",
          "Datum der MRI-Durchführung",
          "Anfallstyp",
          "ECG-Datum",
          "Datum des Screenings der psychischen Gesundheit",
          "Psychisches Problem festgestellt",
          "Psychische Unterstützung geleistet",
          "Datum des umfassenden Behandlungsplans",
          "Unter Natriumvalproat",
          "Unter Topiramat",
          "Schwangerschaftsverhütungsprogramm vorhanden",
        ],
      },
      {
        id: "nmtr-trauma-lo-audit",
        name: "Pädiatrisches schweres Trauma",
        category: "Nationale Audits",
        fileName: "nmtr-trauma-audit.xlsx",
        submissionDeadline: "Einreichung ≤25 Tage nach Entlassung",
        description:
          "National Major Trauma Registry (NMTR, ehemals TARN) — BPT für pädiatrisches schweres Trauma: fallbezogene Registermeldung und Versorgungsstandards der Akutphase (oberärztlich geführte Schockraumaufnahme, Schädel-CT, Tranexamsäure, Atemweg, Rehabilitationsverordnung).",
        columns: [
          "NHS-Nummer",
          "Geburtsdatum",
          "Bei Geburt zugewiesenes Geschlecht",
          "Alter (Jahre)",
          "Verletzungsschwere-Score (ISS)",
          "≥1 Verletzung mit AIS 3+",
          "Datum/Uhrzeit der Ankunft in der Notaufnahme",
          "Entlassungsdatum",
          "NMTR-Fall übermittelt",
          "NMTR-Datensatz vollständig",
          "NMTR-Übermittlungsdatum",
          "Traumateam aktiviert",
          "Oberarzt bei Schockraumaufnahme anwesend",
          "Eintreffen des Oberarztes (Min. ab Ankunft)",
          "GCS bei Ankunft",
          "Kopfverletzung (AIS 1+)",
          "Schädel-CT (Min. ab Ankunft)",
          "TXA indiziert",
          "TXA verabreicht",
          "TXA verabreicht (Min. ab Verletzung)",
          "Atemweg/Intubation erwogen",
          "Atemweg erwogen (Min. ab Ankunft)",
          "Rehabilitationsbedarf erhoben",
          "Rehabilitationsverordnung ausgestellt",
        ],
      },
    ],
  },
  {
    category: "Regionale Audits",
    templates: [
      {
        id: "cord-ph-lo-audit",
        name: "Nabelschnur-pH (regional)",
        category: "Regionale Audits",
        fileName: "cord-ph-lo-audit.xlsx",
        submissionDeadline: "2026-06-12",
        description:
          "Regionales Audit der Nabelschnur-Blutgasentnahme — neonatale Outcomes und Einhaltung der regionalen Leitlinien für fetale Azidose und Nabelschnur-Blutgasentnahme.",
        columns: [
          "Patientencode",
          "Gestationsalter (Wochen)",
          "Gestationsalter (Tage)",
          "Mütterliches Alter",
          "Parität",
          "CTG durchgeführt",
          "Chorioamnionitis",
          "Entbindung",
          "Geburtsgewicht (Gramm)",
          "Apgar 5",
          "Verzögertes Abnabeln",
          "Arterieller Nabelschnur-pH",
          "Arterielles Nabelschnur-BE",
          "Arterielles Nabelschnur-Laktat",
          "Bei Entbindung intubiert",
          "Auf NICU aufgenommen",
          "Regionale Leitlinie zur Nabelschnur-Blutgasentnahme verfügbar",
        ],
      },
    ],
  },
  {
    category: "Lokale Audits",
    templates: [
      {
        id: "acute-sore-throat-audit",
        name: "Akute Halsschmerzen (lokal)",
        category: "Lokale Audits",
        fileName: "acute-sore-throat-audit.xlsx",
        description:
          "Lokales Audit akuter Halsschmerzen — FeverPAIN-/Centor-Score und Einhaltung der Leitlinien zur Antibiotikaverordnung.",
        columns: [
          "Patientencode",
          "Alter",
          "Geschlecht",
          "Vorstellungsbeschwerde",
          "FeverPAIN-Score",
          "Centor-Score",
          "Rachenabstrich entnommen",
          "Antibiotikum verordnet",
          "Antibiotikum-Wirkstoff",
          "Verzögerte Verordnung",
          "Wiedervorstellung innerhalb von 28 Tagen",
        ],
      },
      {
        id: "chest-pain-audit",
        name: "Brustschmerzen (lokal)",
        category: "Lokale Audits",
        fileName: "chest-pain-audit.xlsx",
        description:
          "Lokales Audit von Brustschmerzen — Triage, Troponin-Testung und risikostratifizierte Disposition bei Patienten mit Brustschmerzen.",
        columns: [
          "Patientencode",
          "Alter",
          "Geschlecht",
          "Triage-Kategorie",
          "Zeit bis zum ECG (Min.)",
          "ECG-Befund",
          "Troponin-Befund",
          "HEART-Score",
          "Disposition",
          "Kardiologische Überweisung",
          "Wiedervorstellung innerhalb von 30 Tagen",
        ],
      },
    ],
  },
];

// --- Column descriptors (header translatable; key/width are logic) -----------
const columns = {
  cordAll: [
    { key: "patient", header: "Patientencode", width: 12 },
    { key: "gestWeeks", header: "Gestationsalter (Wochen)", width: 14 },
    { key: "gestDays", header: "Gestationsalter (Tage)", width: 12 },
    { key: "maternalAge", header: "Mütterliches Alter", width: 12 },
    { key: "parity", header: "Parität", width: 8 },
    { key: "_s1", header: "", width: 4 },
    { key: "foetalMovements", header: "Kindsbewegungen", width: 16 },
    { key: "maternalComorbidities", header: "Mütterliche Komorbiditäten", width: 22 },
    { key: "maternalComorbiditiesOther", header: "Mütterliche Komorbiditäten Sonstige", width: 24 },
    { key: "normalScans", header: "Normale Sonografien", width: 12 },
    { key: "normalDopplers", header: "Normale Dopplerbefunde", width: 14 },
    { key: "_s2", header: "", width: 4 },
    { key: "ctgDone", header: "CTG durchgeführt", width: 10 },
    { key: "liquorMeconium", header: "Mekonium im Fruchtwasser", width: 16 },
    { key: "chorioamnionitis", header: "Chorioamnionitis", width: 16 },
    { key: "prom", header: "PROM (>18 Stunden)", width: 16 },
    { key: "rffs", header: "RFFS", width: 8 },
    { key: "sentinelEvent", header: "Sentinel-Ereignis", width: 18 },
    { key: "_s3", header: "", width: 4 },
    { key: "delivery", header: "Entbindung", width: 20 },
    { key: "birthWeight", header: "Geburtsgewicht (Gramm)", width: 18 },
    { key: "apgar1", header: "Apgar 1", width: 10 },
    { key: "apgar5", header: "Apgar 5", width: 10 },
    { key: "apgar10", header: "Apgar 10", width: 10 },
    { key: "dcc", header: "Verzögertes Abnabeln", width: 22 },
    { key: "ph", header: "Arterieller Nabelschnur-pH", width: 16 },
    { key: "be", header: "Arterielles Nabelschnur-BE", width: 16 },
    { key: "lactate", header: "Arterielles Nabelschnur-Laktat", width: 18 },
    { key: "_s4", header: "", width: 4 },
    { key: "intubated", header: "Bei Entbindung intubiert", width: 18 },
    { key: "compressions", header: "Herzdruckmassage", width: 20 },
    { key: "drugs", header: "Verabreichte Medikamente", width: 16 },
    { key: "ward", header: "Station", width: 14 },
    { key: "gasRepeated", header: "Blutgas wiederholt?", width: 12 },
    { key: "ageRepeatedGas", header: "Alter bei wiederholtem Blutgas (Stunden)", width: 22 },
    { key: "repeatedLactate", header: "Wiederholtes Laktat", width: 16 },
    { key: "ageGasNormalised", header: "Alter bei Normalisierung des Blutgases (Stunden)", width: 22 },
    { key: "hypoglycaemia", header: "Hypoglykämie", width: 14 },
    { key: "admittedNicu", header: "Auf NICU aufgenommen", width: 16 },
    { key: "ageDischargeHome", header: "Alter bei Entlassung nach Hause (Tage)", width: 24 },
    { key: "unitQuestionnaire", header: "Fragebogen auf Stationsebene ausgefüllt ", width: 26 },
    { key: "guidelineCordGas", header: "Lokale Leitlinie zur Nabelschnur-Blutgasentnahme verfügbar", width: 34 },
    { key: "guidelineFetalAcidosis", header: "Lokale Leitlinie zur fetalen Azidose verfügbar", width: 34 },
  ],
  cordNicu: [
    { key: "nnuAdmitAge", header: "Alter (Stunden) bei NNU-Aufnahme", width: 22 },
    { key: "cooled", header: "Gekühlt", width: 10 },
    { key: "ageCooling", header: "Alter bei Kühlung (Stunden)", width: 20 },
    { key: "transferredOut", header: "Verlegt", width: 14 },
    { key: "cfm", header: "CFM", width: 14 },
    { key: "seizures", header: "Krampfanfälle", width: 12 },
    { key: "clinicalSeizures", header: "Klinische Krampfanfälle", width: 16 },
    { key: "electrographicSeizure", header: "Elektrografischer Krampfanfall", width: 20 },
    { key: "mriInjury", header: "MRI-Schädigung", width: 24 },
    { key: "_sn", header: "", width: 4 },
    { key: "durationNicu", header: "Dauer der Aufnahme auf der NICU (Tage)", width: 30 },
    { key: "ageDischargeHomeNicu", header: "Alter bei Entlassung nach Hause (Tage)", width: 24 },
    { key: "feeding", header: "Ernährung bei Entlassung", width: 20 },
    { key: "abnormalNeurology", header: "Auffällige Neurologie bei Entlassung", width: 28 },
  ],
  chest: [
    { key: "patient", header: "Patient", width: 10 },
    { key: "age", header: "Alter", width: 8 },
    { key: "complaint", header: "Vorstellungsbeschwerde", width: 26 },
    { key: "troponin", header: "Troponin (ng/L)", width: 16 },
    { key: "ecg", header: "ECG-Befunde", width: 24 },
    { key: "timeToEcg", header: "Zeit bis zum ECG (Min.)", width: 18 },
    { key: "diagnosis", header: "Diagnose", width: 22 },
    { key: "decision", header: "Entscheidung Entlassung/Aufnahme", width: 24 },
  ],
  npda: [
    // 1 — Patient details/information
    { key: "patient", header: "NHS-Nummer", width: 12 },                                 // item 1
    { key: "dob", header: "Geburtsdatum", width: 14 },                                  // item 2
    { key: "postcode", header: "Postleitzahl der üblichen Adresse", width: 16 },                 // item 3
    { key: "sex", header: "Bei Geburt zugewiesenes Geschlecht", width: 18 },                          // item 4
    { key: "ethnicity", header: "Ethnische Zugehörigkeit", width: 26 },                          // item 5
    { key: "adhdAsd", header: "ADHS-/ASS-Diagnose", width: 20 },                       // item 6
    { key: "learningDisability", header: "Lernbehinderung", width: 18 },             // item 7
    { key: "diabetesType", header: "Diabetes-Typ", width: 14 },                         // item 8
    { key: "diagnosisDate", header: "Diagnosedatum", width: 16 },                    // item 9
    { key: "leavingDate", header: "Datum des Ausscheidens aus dem Dienst", width: 20 },                // item 10
    { key: "leavingReason", header: "Grund für das Ausscheiden aus dem Dienst", width: 24 },           // item 11
    { key: "deathDate", header: "Sterbedatum", width: 14 },                               // item 12
    { key: "gpPractice", header: "Hausarztpraxis-Code", width: 16 },                        // item 13
    { key: "pduNumber", header: "PDU-Nummer", width: 12 },                               // item 14
    { key: "visitDate", header: "Termin-/Vorstellungsdatum", width: 20 },                   // item 15
    { key: "_s1", header: "", width: 4 },
    // 2 — Routine measurements
    { key: "height", header: "Körpergröße (cm)", width: 12 },                                 // item 16
    { key: "weight", header: "Gewicht (kg)", width: 12 },                                 // item 17
    { key: "obsDateHtWt", header: "Messdatum (Größe/Gewicht)", width: 20 },               // item 18
    { key: "hba1c", header: "HbA1c (mmol/mol)", width: 16 },                             // item 19
    { key: "obsDateHba1c", header: "Messdatum (HbA1c)", width: 18 },                      // item 20
    { key: "_s2", header: "", width: 4 },
    // 3 — Treatment/monitoring
    { key: "insulinRegime", header: "Insulinregime", width: 24 },                       // item 21
    { key: "otherMed", header: "Sonstiges blutzuckersenkendes Medikament", width: 24 },                // item 22
    { key: "lifestyle", header: "Lebensstil-/Ernährungsberatung erfolgt", width: 26 },           // item 23
    { key: "cgm", header: "CGM in Verwendung", width: 12 },                                     // item 24
    { key: "ketoneTesting", header: "Blutketon-Testung", width: 18 },                 // item 25
    { key: "immunotherapy", header: "Immuntherapie erhalten", width: 20 },               // item 26
    { key: "immunotherapyDate", header: "Datum des Immuntherapiebeginns", width: 22 },       // item 27
    { key: "_s3", header: "", width: 4 },
    // 4 — Annual review: health checks
    { key: "systolic", header: "Systolischer BP", width: 12 },                              // item 28
    { key: "diastolic", header: "Diastolischer BP", width: 12 },                            // item 29
    { key: "obsDateBP", header: "Messdatum (BP)", width: 16 },                            // item 30
    { key: "footDate", header: "Datum der Fußuntersuchung", width: 18 },                      // item 31
    { key: "retinalDate", header: "Datum des Netzhaut-Screenings", width: 20 },                 // item 32
    { key: "retinalResult", header: "Ergebnis des Netzhaut-Screenings", width: 22 },             // item 33
    { key: "acr", header: "Albumin im Urin (ACR)", width: 18 },                          // item 34
    { key: "obsDateAcr", header: "Messdatum (ACR)", width: 16 },                          // item 35
    { key: "albuminuriaStage", header: "Albuminurie-Stadium", width: 18 },                 // item 36
    { key: "cholesterol", header: "Gesamtcholesterin (mmol/l)", width: 22 },             // item 37
    { key: "obsDateChol", header: "Messdatum (Cholesterin)", width: 20 },                 // item 38
    { key: "thyroidDate", header: "Messdatum (Schilddrüsenfunktion)", width: 22 },            // item 39
    { key: "thyroidTreatment", header: "Schilddrüsenbehandlung", width: 22 },                 // item 40
    { key: "coeliacDate", header: "Messdatum (Zöliakie-Screening)", width: 24 },           // item 41
    { key: "glutenFree", header: "Glutenfreie Ernährung", width: 16 },                        // item 42
    { key: "smoking", header: "Raucht / dampft", width: 14 },                             // item 43
    { key: "smokingCessationDate", header: "Datum der Raucherentwöhnungsberatung", width: 24 }, // item 44
    { key: "fluDate", header: "Datum der Influenza-Impfung", width: 24 },                // item 45
    { key: "sickDayDate", header: "Datum der Krankheitstage-Regeln-Beratung", width: 22 },             // item 46
    { key: "_s4", header: "", width: 4 },
    // 5 — Annual review: psychology
    { key: "psychScreen", header: "Datum des psychologischen Screenings", width: 24 },           // item 47
    { key: "psychOutcome", header: "Zusätzliche psychologische Unterstützung erforderlich", width: 32 }, // item 48
    { key: "mentalHealthAppt", header: "Termin für psychische Gesundheit angeboten", width: 28 }, // item 49
    { key: "_s5", header: "", width: 4 },
    // 6 — Annual review: dietetics
    { key: "carbCounting", header: "Datum der Level-3-Kohlenhydratzählung", width: 22 },            // item 50
    { key: "dietitian", header: "Zusätzlicher Diätassistenz-Termin angeboten", width: 32 }, // item 51
    { key: "dietitianApptDate", header: "Datum des Diätassistenz-Termins", width: 22 },       // item 52
    { key: "_s6", header: "", width: 4 },
    // 7 — Hospital admissions / inpatient entry
    { key: "admissionStart", header: "Aufnahmebeginn-Datum", width: 18 },                // item 53
    { key: "admissionDischarge", header: "Aufnahmeentlassung-Datum", width: 20 },        // item 54
    { key: "admissionReason", header: "Aufnahmegrund", width: 20 },               // item 55
    { key: "admissionReasonOther", header: "Aufnahmegrund (sonstige)", width: 24 },  // item 56
    { key: "dkaTherapies", header: "Verabreichte DKA-Therapien", width: 18 },                   // item 57
    { key: "initialPh", header: "Initialer pH bei Aufnahme", width: 20 },                  // item 58
    { key: "initialBicarb", header: "Initiales Bikarbonat (mmol/l)", width: 24 },         // item 59
  ],
  epilepsy: [
    // Patient / cohort
    { key: "patient", header: "NHS-Nummer", width: 12 },                                 // B-cohort
    { key: "dob", header: "Geburtsdatum", width: 14 },
    { key: "sex", header: "Bei Geburt zugewiesenes Geschlecht", width: 18 },
    { key: "ageAtAssessment", header: "Alter bei Erstbeurteilung", width: 20 },
    { key: "_s1", header: "", width: 4 },
    // B1 — epilepsy-expert paediatrician within 2 weeks of referral
    { key: "referralDate", header: "Überweisungsdatum", width: 14 },
    { key: "firstAssessmentDate", header: "Datum der ersten pädiatrischen Beurteilung", width: 30 },
    { key: "expertisePaediatrician", header: "Von epilepsieerfahrenem Pädiater beurteilt", width: 32 },
    { key: "_s2", header: "", width: 4 },
    // B2 — ESN input within first year
    { key: "esnInputDate", header: "Datum der Einbindung der Epilepsie-Fachpflegekraft", width: 30 },
    { key: "_s3", header: "", width: 4 },
    // B3 — MRI within 6 weeks where indicated
    { key: "mriIndicated", header: "MRI indiziert", width: 14 },
    { key: "mriRequestDate", header: "Datum der MRI-Anforderung", width: 16 },
    { key: "mriPerformedDate", header: "Datum der MRI-Durchführung", width: 18 },
    { key: "_s4", header: "", width: 4 },
    // B4 — ECG in convulsive seizures
    { key: "seizureType", header: "Anfallstyp", width: 18 },
    { key: "ecgDate", header: "ECG-Datum", width: 14 },
    { key: "_s5", header: "", width: 4 },
    // B5 — mental-health screening + support
    { key: "mhScreeningDate", header: "Datum des Screenings der psychischen Gesundheit", width: 26 },
    { key: "mhProblemIdentified", header: "Psychisches Problem festgestellt", width: 30 },
    { key: "mhSupportProvided", header: "Psychische Unterstützung geleistet", width: 28 },
    { key: "_s6", header: "", width: 4 },
    // B6 — comprehensive care plan by 12 months
    { key: "carePlanDate", header: "Datum des umfassenden Behandlungsplans", width: 26 },
    { key: "_s7", header: "", width: 4 },
    // B7 — valproate/topiramate safety (PPP, females ≥12)
    { key: "onValproate", header: "Unter Natriumvalproat", width: 18 },
    { key: "onTopiramate", header: "Unter Topiramat", width: 16 },
    { key: "pppInPlace", header: "Schwangerschaftsverhütungsprogramm vorhanden", width: 34 },
  ],
  trauma: [
    // Patient / cohort (paediatric <16 major trauma at the MTC, ≥1 AIS3+ injury)
    { key: "patient", header: "NHS-Nummer", width: 12 },                                 // C-cohort
    { key: "dob", header: "Geburtsdatum", width: 14 },
    { key: "sex", header: "Bei Geburt zugewiesenes Geschlecht", width: 18 },
    { key: "ageYears", header: "Alter (Jahre)", width: 12 },
    { key: "iss", header: "Verletzungsschwere-Score (ISS)", width: 22 },
    { key: "ais3plus", header: "≥1 Verletzung mit AIS 3+", width: 16 },
    { key: "_s1", header: "", width: 4 },
    // C1 — registry submission within 25 days of discharge (the BPT trigger)
    { key: "edArrivalDateTime", header: "Datum/Uhrzeit der Ankunft in der Notaufnahme", width: 22 },
    { key: "dischargeDate", header: "Entlassungsdatum", width: 16 },
    { key: "nmtrSubmitted", header: "NMTR-Fall übermittelt", width: 20 },
    { key: "datasetComplete", header: "NMTR-Datensatz vollständig", width: 22 },
    { key: "submissionDate", header: "NMTR-Übermittlungsdatum", width: 20 },
    { key: "_s2", header: "", width: 4 },
    // C2 — consultant-led trauma-team reception ≤5 min (Level 2, ISS ≥16)
    { key: "traumaTeamActivated", header: "Traumateam aktiviert", width: 22 },
    { key: "consultantPresent", header: "Oberarzt bei Schockraumaufnahme anwesend", width: 30 },
    { key: "consultantArrivalMin", header: "Eintreffen des Oberarztes (Min. ab Ankunft)", width: 34 },
    { key: "_s3", header: "", width: 4 },
    // C3 — CT head ≤60 min (GCS ≤13 head injury, Level 2)
    { key: "gcs", header: "GCS bei Ankunft", width: 16 },
    { key: "headInjury", header: "Kopfverletzung (AIS 1+)", width: 20 },
    { key: "ctHeadMin", header: "Schädel-CT (Min. ab Ankunft)", width: 26 },
    { key: "_s4", header: "", width: 4 },
    // C4 — tranexamic acid ≤1 h (Level 2)
    { key: "txaIndicated", header: "TXA indiziert", width: 16 },
    { key: "txaGiven", header: "TXA verabreicht", width: 14 },
    { key: "txaMin", header: "TXA verabreicht (Min. ab Verletzung)", width: 26 },
    { key: "_s5", header: "", width: 4 },
    // C5 — airway considered ≤30 min (GCS <9, Level 1)
    { key: "intubationConsidered", header: "Atemweg/Intubation erwogen", width: 28 },
    { key: "airwayConsideredMin", header: "Atemweg erwogen (Min. ab Ankunft)", width: 34 },
    { key: "_s6", header: "", width: 4 },
    // C6 — rehabilitation prescription (ISS ≥9, Level 1)
    { key: "rehabNeedsAssessed", header: "Rehabilitationsbedarf erhoben", width: 28 },
    { key: "rehabPrescriptionIssued", header: "Rehabilitationsverordnung ausgestellt", width: 32 },
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
    delivery: "Spontane vaginale Entbindung", birthWeight: 3420, apgar1: 8, apgar5: 9, apgar10: 10,
    cordPh: 7.28, baseExcess: -3.4, lactate: 3.1,
    ward: "Wochenbettstation",
    gasRepeated: "Nein", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "Nein", ageDischargeHome: 2,
    unitQuestionnaire: "Ja", guidelineCordGas: "Ja", guidelineFetalAcidosis: "Nein",
    i: {
      fm: { v: "Normal", e: ["die Kindsbewegungen während der gesamten Schwangerschaft normal waren"] },
      mc: { v: "Keine", e: ["Es wurden keine mütterlichen Komorbiditäten dokumentiert"] },
      mco: { v: "Keine", e: ["keine sonstige nennenswerte Vorgeschichte"] },
      lm: { v: "Klar", e: ["Das Fruchtwasser war durchgehend klar"] },
      chorio: { v: "Nein", e: ["keine Anzeichen einer Chorioamnionitis"] },
      prom: { v: "Nein", e: ["ohne vorzeitiger Blasensprung"] },
      rffs: { v: "Nein", e: ["Es wurden keine Risikofaktoren für eine Sepsis festgestellt"] },
      sentinel: { v: "Keines", e: ["Es gab kein Sentinel-Ereignis"] },
      dcc: { v: "Ja", e: ["Verzögertes Abnabeln über etwa 90 Sekunden durchgeführt", "gemäß Stationsrichtlinie nach etwa 90 Sekunden abgenabelt"] },
      intub: { v: "Nein", e: ["Das Neugeborene wurde nicht intubiert"] },
      compress: { v: "Nein", e: ["keine Herzdruckmassage erforderlich"] },
      drugs: { v: "Keine", e: ["keine Reanimationsmedikamente verabreicht"] },
      hypo: { v: "Nein", e: ["ohne Hypoglykämie"] },
    },
    notes: [
      { role: "Geburtshilfe — Schwangerenambulanz", date: "2026-04-02", type: "antenatal", text: "Anmeldung und Schwangerschaftsverlauf risikoarm. Berichtet wurde, dass die Kindsbewegungen während der gesamten Schwangerschaft normal waren. Es wurden keine mütterlichen Komorbiditäten dokumentiert und es gab keine sonstige nennenswerte Vorgeschichte. Es wurden keine Risikofaktoren für eine Sepsis festgestellt, und die Membranen rissen bei der Entbindung ohne vorzeitiger Blasensprung." },
      { role: "Geburtshilfe — Dr Hannah Reid", date: "2026-04-02", type: "birth_summary", text: "Reifes Neugeborenes, geboren durch spontane vaginale Entbindung bei 39+4. Das Fruchtwasser war durchgehend klar und es gab keine Anzeichen einer Chorioamnionitis. Es gab kein Sentinel-Ereignis. Nabelschnur-Blutgase normal (arterieller pH 7,28). Verzögertes Abnabeln über etwa 90 Sekunden durchgeführt. Keine Reanimation über Abtrocknen und Stimulation hinaus." },
      { role: "Hebammenwesen — Leah Morgan", date: "2026-04-02", type: "delivery", text: "Spontane vaginale Geburt, sofortiger Haut-zu-Haut-Kontakt. Nabelschnur auspulsieren lassen und gemäß Stationsrichtlinie nach etwa 90 Sekunden abgenabelt. Apgar 8 und 9, Neugeborenes durchgehend rosig und aktiv." },
      { role: "Neonatologie — Reanimationsprotokoll", date: "2026-04-02", type: "resuscitation", text: "Es war keine aktive Reanimation erforderlich. Das Neugeborene wurde nicht intubiert, es war keine Herzdruckmassage erforderlich und es wurden keine Reanimationsmedikamente verabreicht." },
      { role: "Wochenbettstation — Neugeborenenuntersuchung", date: "2026-04-04", type: "postnatal", text: "Routinemäßige Neugeborenenuntersuchung unauffällig. Der Blutzucker blieb im Normbereich ohne Hypoglykämie. Trinkt gut; an Tag 2 nach Hause entlassen." },
    ],
  },

  CPH002: {
    code: "CPH002", baby: "cph-baby-002",
    gestWeeks: 40, gestDays: 1, maternalAge: 34, parity: 2,
    normalScans: "Ja", normalDopplers: "Nein", ctgDone: "Ja",
    delivery: "Notfall-Kaiserschnitt", birthWeight: 3650, apgar1: 3, apgar5: 5, apgar10: 7,
    cordPh: 7.03, baseExcess: -15.2, lactate: 10.6,
    ward: "NICU",
    gasRepeated: "Ja", ageRepeatedGas: 2, repeatedLactate: 6.2, ageGasNormalised: 10,
    admittedNicu: "Ja", ageDischargeHome: 6,
    unitQuestionnaire: "Ja", guidelineCordGas: "Ja", guidelineFetalAcidosis: "Nein",
    i: {
      fm: { v: "Vermindert", e: ["verminderte Kindsbewegungen berichtet"] },
      mc: { v: "Gestationsdiabetes", e: ["Gestationsdiabetes"] },
      mco: { v: "Diätetisch eingestellt", e: ["diätetisch eingestellt"] },
      lm: { v: "Mekonium", e: ["mekoniumhaltiges Fruchtwasser"] },
      chorio: { v: "Nein", e: ["keine Anzeichen einer Chorioamnionitis"] },
      prom: { v: "Nein", e: ["kein vorzeitiger Blasensprung"] },
      rffs: { v: "Nein", e: ["Keine weiteren Risikofaktoren für eine Sepsis"] },
      sentinel: { v: "Keines", e: ["kein Sentinel-Ereignis"] },
      dcc: { v: "Nein", e: ["Nabelschnur sofort abgeklemmt, um die Reanimation zu ermöglichen", "kein verzögertes Abnabeln, da eine aktive Reanimation erforderlich war"] },
      intub: { v: "Ja", e: ["Neugeborenes bei Entbindung intubiert"] },
      compress: { v: "Ja", e: ["kurze Herzdruckmassage"] },
      drugs: { v: "Adrenalin", e: ["eine Dosis Adrenalin verabreicht"] },
      hypo: { v: "Ja", e: ["Transiente Hypoglykämie in den ersten Lebensstunden"] },
    },
    n: {
      admitAge: 0.5, transferredOut: "Nein", durationDays: 5,
      cooled: { v: "Ja", e: ["Therapeutische Kühlung bei 1,3 Stunden begonnen"] },
      ageCooling: { v: "1.3", e: ["bei 1,3 Stunden begonnen"] },
      cfm: { v: "Übereinstimmend", e: ["auffälliges Grundmuster ohne elektrografische Krampfanfälle", "auffälliges Grundmuster, keine Krampfanfälle"], explanation: "Die bettseitige CFM-Notiz und der formale neurologische Befund lasen beide ein auffälliges Grundmuster ohne Krampfanfälle — übereinstimmend." },
      seizures: { v: "Nein", e: ["keine klinischen oder elektrografischen Krampfanfälle"] },
      clinical: { v: "Nein", e: ["keine klinischen oder elektrografischen Krampfanfälle"] },
      electro: { v: "Nein", e: ["keine klinischen oder elektrografischen Krampfanfälle"] },
      mri: { v: "Keine akute Schädigung", e: ["MRI zeigte keine akute Schädigung"] },
      feeding: { v: "Stillen", e: ["Stillen etabliert"] },
      abnNeuro: { v: "Nein", e: ["Neurologische Untersuchung bei Entlassung unauffällig"] },
    },
    notes: [
      { role: "Geburtshilfe — Schwangerenambulanz", date: "2026-04-04", type: "antenatal", text: "Schwangerschaft kompliziert durch Gestationsdiabetes, diätetisch eingestellt. In den Tagen vor der Entbindung wurden verminderte Kindsbewegungen berichtet. Keine weiteren Risikofaktoren für eine Sepsis und kein vorzeitiger Blasensprung." },
      { role: "Geburtshilfe — Dr Mark Alvarez", date: "2026-04-04", type: "birth_summary", text: "Notfall-Kaiserschnitt bei pathologischem CTG und mekoniumhaltiges Fruchtwasser. Es gab keine Anzeichen einer Chorioamnionitis und kein Sentinel-Ereignis. Neugeborenes bei Entbindung schlaff; Nabelschnur sofort abgeklemmt, um die Reanimation zu ermöglichen." },
      { role: "Hebammenwesen — Leah Morgan", date: "2026-04-04", type: "delivery", text: "Kaiserschnitt der Kategorie 1. Neugeborenes sofort an das neonatologische Team übergeben; kein verzögertes Abnabeln, da eine aktive Reanimation erforderlich war." },
      { role: "Neonatologie — Reanimationsprotokoll", date: "2026-04-04", type: "resuscitation", text: "Neugeborenes bei Entbindung intubiert mit kurze Herzdruckmassage und eine Dosis Adrenalin verabreicht. Gutes Ansprechen mit Wiedereinsetzen des Spontankreislaufs." },
      { role: "Neonatologie — neonatale Stoffwechselkontrolle", date: "2026-04-05", type: "postnatal", text: "Transiente Hypoglykämie in den ersten Lebensstunden, behandelt mit intravenöser Glukose und abgeklungen." },
      { role: "Neonatologie — Dr Priya Shah", date: "2026-04-04", type: "nicu_admission", text: "Mit einem Alter von 0,5 Stunden auf die NICU aufgenommen. Therapeutische Kühlung bei 1,3 Stunden begonnen. CFM zeigte ein auffälliges Grundmuster ohne elektrografische Krampfanfälle, übereinstimmend mit dem strukturierten Datensatz." },
      { role: "Neurologie — formaler aEEG-Befund", date: "2026-04-06", type: "neurology_report", text: "Die formale aEEG-Auswertung bestätigt ein auffälliges Grundmuster, keine Krampfanfälle. Es gab keine klinischen oder elektrografischen Krampfanfälle. MRI zeigte keine akute Schädigung." },
      { role: "Neonatologie — Entlassungsbericht", date: "2026-04-10", type: "discharge", text: "An Tag 6 nach Hause entlassen, Stillen etabliert. Neurologische Untersuchung bei Entlassung unauffällig." },
    ],
  },

  CPH003: {
    code: "CPH003", baby: "cph-baby-003",
    gestWeeks: 38, gestDays: 6, maternalAge: 29, parity: 0,
    normalScans: "Ja", normalDopplers: "Ja", ctgDone: "Ja",
    delivery: "Forzeps", birthWeight: 3180, apgar1: 7, apgar5: 9, apgar10: 10,
    cordPh: null, baseExcess: null, lactate: null, phMissing: true,
    ward: "Wochenbettstation",
    gasRepeated: "Nein", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "Nein", ageDischargeHome: 3,
    unitQuestionnaire: "Ja", guidelineCordGas: "Ja", guidelineFetalAcidosis: "Nein",
    phEvidence: ["Die arterielle Nabelschnurprobe war geronnen und es ist kein gültiger pH verfügbar"],
    i: {
      fm: { v: "Normal", e: ["normale Kindsbewegungen"] },
      mc: { v: "Keine", e: ["Keine mütterlichen Komorbiditäten"] },
      mco: { v: "Keine", e: ["keine sonstige nennenswerte Vorgeschichte"] },
      lm: { v: "Klar", e: ["Das Fruchtwasser war klar"] },
      chorio: { v: "Nein", e: ["ohne Anzeichen einer Chorioamnionitis"] },
      prom: { v: "Ja", e: ["Vorzeitiger Blasensprung über mehr als 24 Stunden"] },
      rffs: { v: "Ja", e: ["als Risikofaktor für eine Sepsis dokumentiert"] },
      sentinel: { v: "Keines", e: ["kein Sentinel-Ereignis"] },
      dcc: { v: "Ja", e: ["Abnabeln um etwa 60 Sekunden verzögert", "Nabelschnur etwa eine Minute lang intakt belassen, bevor abgenabelt wurde"] },
      intub: { v: "Nein", e: ["Das Neugeborene wurde nicht intubiert"] },
      compress: { v: "Nein", e: ["keine Herzdruckmassage erforderlich"] },
      drugs: { v: "Keine", e: ["keine Reanimationsmedikamente verabreicht"] },
      hypo: { v: "Nein", e: ["ohne Hypoglykämie"] },
    },
    notes: [
      { role: "Geburtshilfe — Schwangerenambulanz", date: "2026-04-06", type: "antenatal", text: "Risikoarme Schwangerschaft mit normale Kindsbewegungen. Keine mütterlichen Komorbiditäten und keine sonstige nennenswerte Vorgeschichte. Vorzeitiger Blasensprung über mehr als 24 Stunden vor der Entbindung, was als Risikofaktor für eine Sepsis dokumentiert wurde." },
      { role: "Geburtshilfe — Dr Hannah Reid", date: "2026-04-06", type: "birth_summary", text: "Forzepsentbindung wegen verlängerter Austreibungsphase. Das Fruchtwasser war klar ohne Anzeichen einer Chorioamnionitis und kein Sentinel-Ereignis. Die arterielle Nabelschnurprobe war geronnen und es ist kein gültiger pH verfügbar. Neugeborenes vital; Abnabeln um etwa 60 Sekunden verzögert vor der Übergabe." },
      { role: "Hebammenwesen — Leah Morgan", date: "2026-04-06", type: "delivery", text: "Assistierte vaginale Geburt. Neugeborenes schrie sofort und wurde mit Nabelschnur etwa eine Minute lang intakt belassen, bevor abgenabelt wurde, auf der Brust der Mutter gehalten." },
      { role: "Neonatologie — Reanimationsprotokoll", date: "2026-04-06", type: "resuscitation", text: "Keine Reanimation erforderlich. Das Neugeborene wurde nicht intubiert, es war keine Herzdruckmassage erforderlich und es wurden keine Reanimationsmedikamente verabreicht." },
      { role: "Wochenbettstation — Neugeborenenuntersuchung", date: "2026-04-08", type: "postnatal", text: "Neugeborenenuntersuchung unauffällig. Blutzucker im Normbereich ohne Hypoglykämie. An Tag 3 nach Hause entlassen." },
    ],
  },

  CPH004: {
    code: "CPH004", baby: "cph-baby-004",
    gestWeeks: 39, gestDays: 2, maternalAge: 28, parity: 1,
    normalScans: "Ja", normalDopplers: "Ja", ctgDone: "Ja",
    delivery: "Spontane vaginale Entbindung", birthWeight: 3350, apgar1: 8, apgar5: 9, apgar10: 10,
    cordPh: 7.26, baseExcess: -4.1, lactate: 3.6,
    ward: "Wochenbettstation",
    gasRepeated: "Nein", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "Nein", ageDischargeHome: 2,
    unitQuestionnaire: "Ja", guidelineCordGas: "Ja", guidelineFetalAcidosis: "Nein",
    i: {
      fm: { v: "Normal", e: ["die Kindsbewegungen waren durchgehend normal"] },
      mc: { v: "Keine", e: ["Keine mütterlichen Komorbiditäten"] },
      mco: { v: "Keine", e: ["keine sonstige nennenswerte Vorgeschichte"] },
      lm: { v: "Klar", e: ["Das Fruchtwasser war klar"] },
      chorio: { v: "Nein", e: ["keine Anzeichen einer Chorioamnionitis"] },
      prom: { v: "Nein", e: ["ohne vorzeitiger Blasensprung"] },
      rffs: { v: "Nein", e: ["Keine Risikofaktoren für eine Sepsis"] },
      sentinel: { v: "Keines", e: ["kein Sentinel-Ereignis"] },
      dcc: { v: "Ja", e: ["verzögertes Abnabeln über etwa 60 Sekunden", "Nabelschnur etwa eine Minute lang auspulsieren lassen, bevor abgenabelt wurde"] },
      intub: { v: "Nein", e: ["Das Neugeborene wurde nicht intubiert"] },
      compress: { v: "Nein", e: ["keine Herzdruckmassage erforderlich"] },
      drugs: { v: "Keine", e: ["keine Reanimationsmedikamente verabreicht"] },
      hypo: { v: "Nein", e: ["ohne Hypoglykämie"] },
    },
    notes: [
      { role: "Geburtshilfe — Schwangerenambulanz", date: "2026-04-09", type: "antenatal", text: "Risikoarme Schwangerschaft und die Kindsbewegungen waren durchgehend normal. Keine mütterlichen Komorbiditäten und keine sonstige nennenswerte Vorgeschichte. Die Membranen rissen zu Beginn der Wehen ohne vorzeitiger Blasensprung. Keine Risikofaktoren für eine Sepsis festgestellt." },
      { role: "Geburtshilfe — Dr Hannah Reid", date: "2026-04-09", type: "birth_summary", text: "Reifes Neugeborenes, geboren durch spontane vaginale Entbindung bei 39+2. Das Fruchtwasser war klar und es gab keine Anzeichen einer Chorioamnionitis. Es gab kein Sentinel-Ereignis. Nabelschnur-Blutgase beruhigend (arterieller pH 7,26), mit verzögertes Abnabeln über etwa 60 Sekunden." },
      { role: "Hebammenwesen — Leah Morgan", date: "2026-04-09", type: "delivery", text: "Spontane vaginale Geburt mit sofortigem Haut-zu-Haut-Kontakt. Nabelschnur etwa eine Minute lang auspulsieren lassen, bevor abgenabelt wurde. Apgar 8 und 9, Neugeborenes rosig und aktiv." },
      { role: "Neonatologie — Reanimationsprotokoll", date: "2026-04-09", type: "resuscitation", text: "Keine aktive Reanimation erforderlich. Das Neugeborene wurde nicht intubiert, es war keine Herzdruckmassage erforderlich und es wurden keine Reanimationsmedikamente verabreicht." },
      { role: "Wochenbettstation — Neugeborenenuntersuchung", date: "2026-04-11", type: "postnatal", text: "Routinemäßige Neugeborenenuntersuchung unauffällig. Der Blutzucker blieb im Normbereich ohne Hypoglykämie. Trinkt gut; an Tag 2 nach Hause entlassen." },
    ],
  },

  CPH005: {
    code: "CPH005", baby: "cph-baby-005",
    gestWeeks: 41, gestDays: 0, maternalAge: 33, parity: 3,
    normalScans: "Ja", normalDopplers: "Ja", ctgDone: "Ja",
    delivery: "Spontane vaginale Entbindung", birthWeight: 4120, apgar1: 6, apgar5: 8, apgar10: 9,
    cordPh: 7.12, baseExcess: -9.8, lactate: 7.2,
    ward: "Wochenbettstation",
    gasRepeated: "Ja", ageRepeatedGas: 1, repeatedLactate: 4.1, ageGasNormalised: 6,
    admittedNicu: "Nein", ageDischargeHome: 2,
    unitQuestionnaire: "Ja", guidelineCordGas: "Ja", guidelineFetalAcidosis: "Nein",
    i: {
      fm: { v: "Normal", e: ["Durchgehend normale Kindsbewegungen"] },
      mc: { v: "Gestationsdiabetes", e: ["Gestationsdiabetes"] },
      mco: { v: "Insulinbehandelt", e: ["insulinbehandelt"] },
      lm: { v: "Klar", e: ["Das Fruchtwasser war klar"] },
      chorio: { v: "Nein", e: ["ohne Anzeichen einer Chorioamnionitis"] },
      prom: { v: "Nein", e: ["Kein vorzeitiger Blasensprung"] },
      rffs: { v: "Nein", e: ["keine Risikofaktoren für eine Sepsis"] },
      sentinel: { v: "Schulterdystokie", e: ["Schulterdystokie, innerhalb von 90 Sekunden behoben"] },
      dcc: { v: "Nein", e: ["wurde die Nabelschnur früh abgeklemmt und das Neugeborene zur Reanimationseinheit gebracht", "Sofortiges Abklemmen und Transfer zur Reanimationseinheit"] },
      intub: { v: "Nein", e: ["Das Neugeborene wurde nicht intubiert"] },
      compress: { v: "Nein", e: ["keine Herzdruckmassage erforderlich"] },
      drugs: { v: "Keine", e: ["keine Reanimationsmedikamente verabreicht"] },
      hypo: { v: "Ja", e: ["Hypoglykämie am ersten Tag"] },
    },
    notes: [
      { role: "Geburtshilfe — Schwangerenambulanz", date: "2026-04-11", type: "antenatal", text: "Schwangerschaft kompliziert durch Gestationsdiabetes, insulinbehandelt, mit einem makrosomen Neugeborenen in den Wachstumssonografien. Durchgehend normale Kindsbewegungen. Kein vorzeitiger Blasensprung und keine Risikofaktoren für eine Sepsis." },
      { role: "Geburtshilfe — Dr Mark Alvarez", date: "2026-04-11", type: "birth_summary", text: "Spontane vaginale Entbindung kompliziert durch Schulterdystokie, innerhalb von 90 Sekunden behoben. Das Fruchtwasser war klar ohne Anzeichen einer Chorioamnionitis. Das Neugeborene benötigte Stimulation und kurze Maskenbeatmung, daher wurde die Nabelschnur früh abgeklemmt und das Neugeborene zur Reanimationseinheit gebracht." },
      { role: "Hebammenwesen — Leah Morgan", date: "2026-04-11", type: "delivery", text: "Schwierige Geburt kompliziert durch Schulterdystokie. Sofortiges Abklemmen und Transfer zur Reanimationseinheit für Beatmungshübe." },
      { role: "Neonatologie — Reanimationsprotokoll", date: "2026-04-11", type: "resuscitation", text: "Kurze Maskenbeatmung mit gutem Ansprechen durchgeführt. Das Neugeborene wurde nicht intubiert, es war keine Herzdruckmassage erforderlich und es wurden keine Reanimationsmedikamente verabreicht." },
      { role: "Wochenbettstation — Neugeborenenuntersuchung", date: "2026-04-13", type: "postnatal", text: "Makrosomes Kind einer diabetischen Mutter. Hypoglykämie am ersten Tag, die zusätzliche Mahlzeiten und Überwachung erforderte, anschließend abgeklungen." },
    ],
  },

  CPH006: {
    code: "CPH006", baby: "cph-baby-006",
    gestWeeks: 35, gestDays: 5, maternalAge: 27, parity: 0,
    normalScans: "Nein", normalDopplers: "Nein", ctgDone: "Ja",
    delivery: "Notfall-Kaiserschnitt", birthWeight: 2680, apgar1: 5, apgar5: 7, apgar10: 8,
    cordPh: 7.18, baseExcess: -8.1, lactate: 6.4,
    ward: "NICU",
    gasRepeated: "Nein", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "Ja", ageDischargeHome: 16,
    unitQuestionnaire: "Ja", guidelineCordGas: "Ja", guidelineFetalAcidosis: "Nein",
    i: {
      fm: { v: "Normal", e: ["Normale Kindsbewegungen berichtet"] },
      mc: { v: "Keine", e: ["Keine vorbestehenden mütterlichen Komorbiditäten"] },
      mco: { v: "Keine", e: ["keine sonstige nennenswerte Vorgeschichte"] },
      lm: { v: "Klar", e: ["Das Fruchtwasser war klar"] },
      chorio: { v: "Verdacht", e: ["Verdacht auf Chorioamnionitis"] },
      prom: { v: "Ja", e: ["Vorzeitiger Blasensprung über mehr als 18 Stunden"] },
      rffs: { v: "Ja", e: ["als Risikofaktor für eine Sepsis dokumentiert"] },
      sentinel: { v: "Keines", e: ["kein Sentinel-Ereignis"] },
      dcc: { v: "Nein", e: ["Frühgeborenes umgehend abgeklemmt und auf die NICU gebracht", "ohne verzögertes Abklemmen aufgrund der Frühgeburtlichkeit"] },
      intub: { v: "Nein", e: ["Das Neugeborene wurde nicht intubiert"] },
      compress: { v: "Nein", e: ["keine Herzdruckmassage erforderlich"] },
      drugs: { v: "Keine", e: ["keine Reanimationsmedikamente verabreicht"] },
      hypo: { v: "Ja", e: ["Hypoglykämie-Episoden in den ersten Tagen"] },
    },
    n: {
      admitAge: 0.4, transferredOut: "Nein", durationDays: 14,
      cooled: { v: "Nein", e: ["war eine therapeutische Kühlung nicht indiziert"] },
      ageCooling: { v: "k. A.", e: ["war eine therapeutische Kühlung nicht indiziert"] },
      cfm: { v: "Nicht durchgeführt", e: ["wurde kein CFM eingesetzt"], explanation: "Aufgrund von Frühgeburtlichkeit und Verdacht auf Sepsis statt einer Enzephalopathie auf die NICU aufgenommen, daher wurde kein CFM-Monitoring eingesetzt — ausdrücklich als nicht durchgeführt dokumentiert." },
      seizures: { v: "Nein", e: ["Es wurden keine klinischen Krampfanfälle festgestellt"] },
      clinical: { v: "Nein", e: ["Es wurden keine klinischen Krampfanfälle festgestellt"] },
      electro: { v: "Nein", e: ["keine elektrografischen Krampfanfälle dokumentiert"] },
      mri: { v: "Nicht durchgeführt", e: ["Es wurde kein MRI durchgeführt"] },
      feeding: { v: "Sondennahrung und Stillen", e: ["Sondennahrung und Stillen"] },
      abnNeuro: { v: "Nein", e: ["Neurologisch unauffällig bei Entlassung"] },
    },
    notes: [
      { role: "Geburtshilfe — Schwangerenambulanz", date: "2026-04-13", type: "antenatal", text: "Frühgeburtliche Wehen bei 35+5. Normale Kindsbewegungen berichtet. Vorzeitiger Blasensprung über mehr als 18 Stunden mit mütterlichem Fieber, als Risikofaktor für eine Sepsis dokumentiert. Keine vorbestehenden mütterlichen Komorbiditäten und keine sonstige nennenswerte Vorgeschichte. Die Wachstumssonografien waren in dieser Schwangerschaft eingeschränkt gewesen." },
      { role: "Geburtshilfe — Dr Hannah Reid", date: "2026-04-13", type: "birth_summary", text: "Notfall-Kaiserschnitt bei 35+5 wegen Verdacht auf Chorioamnionitis. Das Fruchtwasser war klar und es gab kein Sentinel-Ereignis. Frühgeborenes umgehend abgeklemmt und auf die NICU gebracht für CPAP und Antibiotika." },
      { role: "Hebammenwesen — Leah Morgan", date: "2026-04-13", type: "delivery", text: "Frühgeburt; Neugeborenes an das neonatologische Team übergeben, ohne verzögertes Abklemmen aufgrund der Frühgeburtlichkeit und der Notwendigkeit einer Atemunterstützung." },
      { role: "Neonatologie — Reanimationsprotokoll", date: "2026-04-13", type: "resuscitation", text: "Stabilisiert unter CPAP. Das Neugeborene wurde nicht intubiert, es war keine Herzdruckmassage erforderlich und es wurden keine Reanimationsmedikamente verabreicht." },
      { role: "Neonatologie — neonatale Stoffwechselkontrolle", date: "2026-04-15", type: "postnatal", text: "Frühgeborenes mit Hypoglykämie-Episoden in den ersten Tagen, die Sondennahrung und Überwachung erforderten." },
      { role: "Neonatologie — Dr Priya Shah", date: "2026-04-13", type: "nicu_admission", text: "Mit einem Alter von 0,4 Stunden wegen Frühgeburtlichkeit und Verdacht auf Sepsis auf die NICU aufgenommen. Dies war kein Enzephalopathie-Pfad, daher war eine therapeutische Kühlung nicht indiziert und es wurde kein CFM eingesetzt." },
      { role: "Neurologie — Befundnotiz", date: "2026-04-20", type: "neurology_report", text: "Es wurden keine klinischen Krampfanfälle festgestellt und keine elektrografischen Krampfanfälle dokumentiert. Es wurde kein MRI durchgeführt, da es keinen Hinweis auf eine Enzephalopathie gab." },
      { role: "Neonatologie — Entlassungsbericht", date: "2026-04-29", type: "discharge", text: "An Tag 16 nach Hause entlassen mit Sondennahrung und Stillen. Neurologisch unauffällig bei Entlassung." },
    ],
  },

  CPH007: {
    code: "CPH007", baby: "cph-baby-007",
    gestWeeks: 39, gestDays: 0, maternalAge: 38, parity: 1,
    normalScans: "Ja", normalDopplers: "Nein", ctgDone: "Ja",
    delivery: "Vakuum", birthWeight: 3030, apgar1: 7, apgar5: 9, apgar10: 10,
    cordPh: 7.24, baseExcess: -5.6, lactate: null,
    ward: "Wochenbettstation",
    gasRepeated: "Nein", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "Nein", ageDischargeHome: 2,
    unitQuestionnaire: "Ja", guidelineCordGas: "Ja", guidelineFetalAcidosis: "Nein",
    i: {
      fm: { v: "Vermindert", e: ["Verminderte Kindsbewegungen veranlassten eine Untersuchung"] },
      mc: { v: "Präeklampsie", e: ["Präeklampsie"] },
      mco: { v: "Unter Labetalol", e: ["unter Labetalol eingestellt"] },
      lm: { v: "Klar", e: ["Das Fruchtwasser war klar"] },
      chorio: { v: "Nein", e: ["ohne Anzeichen einer Chorioamnionitis"] },
      prom: { v: "Nein", e: ["Kein vorzeitiger Blasensprung"] },
      rffs: { v: "Nein", e: ["keine Risikofaktoren für eine Sepsis"] },
      sentinel: { v: "Keines", e: ["kein Sentinel-Ereignis"] },
      dcc: { v: "Nein", e: ["Nabelschnur früh abgeklemmt, um die Beurteilung zu beschleunigen", "sofortiges Abnabeln dokumentiert"] },
      intub: { v: "Nein", e: ["Das Neugeborene wurde nicht intubiert"] },
      compress: { v: "Nein", e: ["keine Herzdruckmassage erforderlich"] },
      drugs: { v: "Keine", e: ["keine Reanimationsmedikamente verabreicht"] },
      hypo: { v: "Nein", e: ["ohne Hypoglykämie"] },
    },
    notes: [
      { role: "Geburtshilfe — Schwangerenambulanz", date: "2026-04-16", type: "antenatal", text: "Schwangerschaft kompliziert durch Präeklampsie, unter Labetalol eingestellt. Verminderte Kindsbewegungen veranlassten eine Untersuchung. Kein vorzeitiger Blasensprung und keine Risikofaktoren für eine Sepsis." },
      { role: "Geburtshilfe — Dr Mark Alvarez", date: "2026-04-16", type: "birth_summary", text: "Vakuumentbindung wegen fetaler Gefährdung nach verminderten Kindsbewegungen. Das Fruchtwasser war klar ohne Anzeichen einer Chorioamnionitis und kein Sentinel-Ereignis. Nabelschnur früh abgeklemmt, um die Beurteilung zu beschleunigen; Nabelschnur-Blutgas beruhigend (pH 7,24)." },
      { role: "Hebammenwesen — Leah Morgan", date: "2026-04-16", type: "delivery", text: "Saugglockengeburt. Neugeborenes umgehend vom Team beurteilt; sofortiges Abnabeln dokumentiert." },
      { role: "Neonatologie — Reanimationsprotokoll", date: "2026-04-16", type: "resuscitation", text: "Keine Reanimation erforderlich. Das Neugeborene wurde nicht intubiert, es war keine Herzdruckmassage erforderlich und es wurden keine Reanimationsmedikamente verabreicht." },
      { role: "Wochenbettstation — Neugeborenenuntersuchung", date: "2026-04-18", type: "postnatal", text: "Neugeborenenuntersuchung unauffällig. Blutzucker im Normbereich ohne Hypoglykämie. An Tag 2 nach Hause entlassen." },
    ],
  },

  CPH008: {
    code: "CPH008", baby: "cph-baby-008",
    gestWeeks: 40, gestDays: 3, maternalAge: 30, parity: 2,
    normalScans: "Ja", normalDopplers: "Ja", ctgDone: "Nein",
    delivery: "Spontane vaginale Entbindung", birthWeight: 3520, apgar1: 9, apgar5: 10, apgar10: 10,
    cordPh: 7.31, baseExcess: -2.2, lactate: 2.4,
    ward: "Wochenbettstation",
    gasRepeated: "Nein", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "Nein", ageDischargeHome: 1,
    unitQuestionnaire: "Ja", guidelineCordGas: "Ja", guidelineFetalAcidosis: "Nein",
    i: {
      fm: { v: "Normal", e: ["durchgehend normale Kindsbewegungen"] },
      mc: { v: "Keine", e: ["Keine mütterlichen Komorbiditäten"] },
      mco: { v: "Keine", e: ["keine sonstige nennenswerte Vorgeschichte"] },
      lm: { v: "Klar", e: ["Das Fruchtwasser war klar"] },
      chorio: { v: "Nein", e: ["ohne Anzeichen einer Chorioamnionitis"] },
      prom: { v: "Nein", e: ["Kein vorzeitiger Blasensprung"] },
      rffs: { v: "Nein", e: ["keine Risikofaktoren für eine Sepsis"] },
      sentinel: { v: "Keines", e: ["kein Sentinel-Ereignis"] },
      dcc: { v: "Ja", e: ["die Nabelschnur abgeklemmt wurde, nachdem die Pulsation aufgehört hatte", "Nabelschnur intakt belassen, bis sie aufhörte zu pulsieren, bevor abgenabelt wurde"] },
      intub: { v: "Nein", e: ["Das Neugeborene wurde nicht intubiert"] },
      compress: { v: "Nein", e: ["keine Herzdruckmassage erforderlich"] },
      drugs: { v: "Keine", e: ["keine Reanimationsmedikamente verabreicht"] },
      hypo: { v: "Nein", e: ["ohne Hypoglykämie"] },
    },
    notes: [
      { role: "Geburtshilfe — Schwangerenambulanz", date: "2026-04-20", type: "antenatal", text: "Risikoarme Schwangerschaft mit durchgehend normale Kindsbewegungen. Keine mütterlichen Komorbiditäten und keine sonstige nennenswerte Vorgeschichte. Kein vorzeitiger Blasensprung und keine Risikofaktoren für eine Sepsis." },
      { role: "Geburtshilfe — Dr Hannah Reid", date: "2026-04-20", type: "birth_summary", text: "Unkomplizierte Wassergeburt bei 40+3. Das Fruchtwasser war klar ohne Anzeichen einer Chorioamnionitis und kein Sentinel-Ereignis. Optimales Nabelschnurmanagement durchgeführt, wobei die Nabelschnur abgeklemmt wurde, nachdem die Pulsation aufgehört hatte." },
      { role: "Hebammenwesen — Leah Morgan", date: "2026-04-20", type: "delivery", text: "Physiologische Wassergeburt. Nabelschnur intakt belassen, bis sie aufhörte zu pulsieren, bevor abgenabelt wurde. Apgar 9 und 10." },
      { role: "Neonatologie — Reanimationsprotokoll", date: "2026-04-20", type: "resuscitation", text: "Keine Reanimation erforderlich. Das Neugeborene wurde nicht intubiert, es war keine Herzdruckmassage erforderlich und es wurden keine Reanimationsmedikamente verabreicht." },
      { role: "Wochenbettstation — Neugeborenenuntersuchung", date: "2026-04-21", type: "postnatal", text: "Neugeborenenuntersuchung unauffällig. Blutzucker im Normbereich ohne Hypoglykämie. An Tag 1 nach Hause entlassen." },
    ],
  },

  CPH009: {
    code: "CPH009", baby: "cph-baby-009",
    gestWeeks: 38, gestDays: 1, maternalAge: 36, parity: 1,
    normalScans: "Ja", normalDopplers: "Nein", ctgDone: "Ja",
    delivery: "Notfall-Kaiserschnitt", birthWeight: 3260, apgar1: 2, apgar5: 4, apgar10: 6,
    cordPh: 6.98, baseExcess: -18.7, lactate: 12.8,
    ward: "NICU",
    gasRepeated: "Ja", ageRepeatedGas: 1, repeatedLactate: 9.1, ageGasNormalised: "Nicht normalisiert",
    admittedNicu: "Ja", ageDischargeHome: null,
    unitQuestionnaire: "Ja", guidelineCordGas: "Ja", guidelineFetalAcidosis: "Nein",
    i: {
      fm: { v: "Vermindert", e: ["Verminderte Kindsbewegungen am Aufnahmetag berichtet"] },
      mc: { v: "Vorausgegangener Kaiserschnitt", e: ["vorausgegangener Kaiserschnitt im unteren Uterinsegment"] },
      mco: { v: "Ein vorausgegangener LSCS", e: ["ein vorausgegangener Kaiserschnitt im unteren Uterinsegment"] },
      lm: { v: "Mekonium", e: ["Stark mekoniumhaltiges Fruchtwasser"] },
      chorio: { v: "Nein", e: ["keine Anzeichen einer Chorioamnionitis"] },
      prom: { v: "Nein", e: ["Kein vorzeitiger Blasensprung"] },
      rffs: { v: "Nein", e: ["keine weiteren Risikofaktoren für eine Sepsis"] },
      sentinel: { v: "Uterusruptur", e: ["Notfall-Kaiserschnitt wegen Uterusruptur"] },
      dcc: { v: "Nein", e: ["Neugeborenes sofort zur Reanimation abgeklemmt", "kein verzögertes Abnabeln"] },
      intub: { v: "Ja", e: ["Neugeborenes bei Entbindung intubiert"] },
      compress: { v: "Ja", e: ["anhaltende Herzdruckmassage"] },
      drugs: { v: "Adrenalin", e: ["wiederholte Dosen Adrenalin"] },
      hypo: { v: "Ja", e: ["Schwere Hypoglykämie in den ersten Stunden"] },
    },
    n: {
      admitAge: 0.3, transferredOut: "Ja", durationDays: 7,
      cooled: { v: "Ja", e: ["Therapeutische Kühlung bei 1,8 Stunden Lebensalter vor der Verlegung begonnen"] },
      ageCooling: { v: "1.8", e: ["bei 1,8 Stunden Lebensalter vor der Verlegung begonnen"] },
      cfm: { v: "Widerspruch", e: ["Bettseitige CFM-Ableitung anfänglich als normales Grundmuster gelesen", "dokumentiert elektrografische Krampfanfälle", "im Widerspruch zum bettseitigen CFM-Eindruck"], explanation: "Die bettseitige CFM-Notiz las ein normales Grundmuster, aber der formale neurologische Befund dokumentiert elektrografische Krampfanfälle — als Widerspruch zum strukturierten Datensatz gekennzeichnet." },
      seizures: { v: "Ja", e: ["dokumentiert elektrografische Krampfanfälle"] },
      clinical: { v: "Ja", e: ["Klinische Krampfanfälle wurden ebenfalls beobachtet"] },
      electro: { v: "Ja", e: ["dokumentiert elektrografische Krampfanfälle"] },
      mri: { v: "Schädigung der Basalganglien und des Thalamus", e: ["Schädigung der Basalganglien und des Thalamus im MRI"] },
      feeding: { v: "Sondennahrung", e: ["Sondennahrung"] },
      abnNeuro: { v: "Ja", e: ["auffälliger Tonus und reduzierte Bewegungen bei Verlegung"] },
    },
    notes: [
      { role: "Geburtshilfe — Schwangerenambulanz", date: "2026-04-23", type: "antenatal", text: "Vaginale Geburt nach Kaiserschnitt versucht bei ein vorausgegangener Kaiserschnitt im unteren Uterinsegment. Verminderte Kindsbewegungen am Aufnahmetag berichtet. Kein vorzeitiger Blasensprung und keine weiteren Risikofaktoren für eine Sepsis." },
      { role: "Geburtshilfe — Dr Mark Alvarez", date: "2026-04-23", type: "birth_summary", text: "Notfall-Kaiserschnitt wegen Uterusruptur mit schwerer metabolischer Azidose. Stark mekoniumhaltiges Fruchtwasser wurde festgestellt. Es gab keine Anzeichen einer Chorioamnionitis. Neugeborenes sofort zur Reanimation abgeklemmt." },
      { role: "Hebammenwesen — Leah Morgan", date: "2026-04-23", type: "delivery", text: "Notkaiserschnitt. Neugeborenes sofort an das neonatologische Team übergeben; kein verzögertes Abnabeln." },
      { role: "Neonatologie — Reanimationsprotokoll", date: "2026-04-23", type: "resuscitation", text: "Neugeborenes bei Entbindung intubiert mit anhaltende Herzdruckmassage und wiederholte Dosen Adrenalin vor Wiedereinsetzen des Kreislaufs." },
      { role: "Neonatologie — neonatale Stoffwechselkontrolle", date: "2026-04-24", type: "postnatal", text: "Schwere Hypoglykämie in den ersten Stunden, die intravenöse Glukose erforderte, im Kontext einer signifikanten Enzephalopathie." },
      { role: "Neonatologie — Bettseitige Notiz", date: "2026-04-23", type: "nicu_admission", text: "Mit einem Alter von 0,3 Stunden mit schwerer Enzephalopathie auf die NICU aufgenommen. Therapeutische Kühlung bei 1,8 Stunden Lebensalter vor der Verlegung begonnen. Bettseitige CFM-Ableitung anfänglich als normales Grundmuster gelesen in den ersten Stunden nach der Aufnahme." },
      { role: "Neurologie — formaler Befund", date: "2026-04-25", type: "neurology_report", text: "Der formale neurologische Befund dokumentiert elektrografische Krampfanfälle und Schädigung der Basalganglien und des Thalamus im MRI, im Widerspruch zum bettseitigen CFM-Eindruck eines normalen Grundmusters. Klinische Krampfanfälle wurden ebenfalls beobachtet." },
      { role: "Neonatologie — Verlegungsbericht", date: "2026-04-30", type: "discharge", text: "An Tag 7 in das regionale Kühlungs- und Neurologiezentrum zur weiteren Versorgung verlegt, daher nicht von dieser Station nach Hause entlassen. Unter Sondennahrung mit auffälliger Tonus und reduzierte Bewegungen bei Verlegung." },
    ],
  },
};

// --- Records: Chest Pain (Flow B) -------------------------------------------
const chest = {
  CP001: {
    code: "CP001", age: 58, troponin: 320, ecg: "ST-Hebung, V2-V4", timeToEcg: 8,
    complaint: "Zentraler vernichtender Brustschmerz", diagnosis: "STEMI", decision: "Aufnahme",
    complaintEvidence: ["zentraler vernichtender Brustschmerz mit Ausstrahlung in den linken Arm"],
    ecgEvidence: ["ST-Hebung in V2-V4"],
    diagnosisEvidence: ["einem anterioren STEMI"],
    decisionEvidence: ["In das Herzkatheterlabor zur primären PCI aufgenommen"],
    notes: {
      triage: { role: "Notfallpflege — Triage", date: "2026-05-04", type: "triage", text: "58-jähriger Mann mit seit 40 Minuten bestehendem zentraler vernichtender Brustschmerz mit Ausstrahlung in den linken Arm, begleitet von Schwitzen und Übelkeit." },
      cardiology: { role: "Kardiologie — Dr Mark Alvarez", date: "2026-05-04", type: "cardiology", text: "ECG zeigt ST-Hebung in V2-V4, vereinbar mit einem anterioren STEMI. Troponin deutlich erhöht. Zur primären PCI überwiesen." },
      discharge: { role: "Notfallmedizin — Entlassung", date: "2026-05-04", type: "discharge_summary", text: "In das Herzkatheterlabor zur primären PCI aufgenommen und auf die kardiologische Überwachungsstation verlegt." },
    },
  },
  CP002: {
    code: "CP002", age: 47, troponin: 4, ecg: "Normaler Sinusrhythmus", timeToEcg: 14,
    complaint: "Pleuritischer linksseitiger Brustschmerz", diagnosis: "Nichtkardialer Brustschmerz", decision: "Entlassung",
    complaintEvidence: ["intermittierender linksseitiger stechender Brustschmerz, schlimmer bei der Einatmung"],
    ecgEvidence: ["normaler Sinusrhythmus ohne ischämische Veränderungen"],
    diagnosisEvidence: ["eine kardiale Ursache unwahrscheinlich"],
    decisionEvidence: ["Mit Sicherheitsnetz-Beratung nach Hause entlassen"],
    notes: {
      triage: { role: "Notfallpflege — Triage", date: "2026-05-05", type: "triage", text: "47-jährige Frau mit intermittierender linksseitiger stechender Brustschmerz, schlimmer bei der Einatmung, ohne Ausstrahlung." },
      cardiology: { role: "Kardiologie — Dr Sara Lin", date: "2026-05-05", type: "cardiology", text: "ECG normaler Sinusrhythmus ohne ischämische Veränderungen. Serielles Troponin negativ. Schmerz bei Palpation reproduzierbar, daher ist eine kardiale Ursache unwahrscheinlich." },
      discharge: { role: "Notfallmedizin — Entlassung", date: "2026-05-05", type: "discharge_summary", text: "Mit Sicherheitsnetz-Beratung nach Hause entlassen und hausärztliche Nachsorge." },
    },
  },
  CP003: {
    code: "CP003", age: 63, troponin: 95, ecg: "T-Wellen-Inversion, inferior", timeToEcg: 11,
    complaint: "Brustschmerz mit Ausstrahlung in den Kiefer", diagnosis: "NSTEMI", decision: "Aufnahme",
    complaintEvidence: ["schwerer Brustschmerz in Ruhe mit Ausstrahlung in den Kiefer"],
    ecgEvidence: ["T-Wellen-Inversion in den inferioren Ableitungen"],
    diagnosisEvidence: ["vereinbar mit einem NSTEMI"],
    decisionEvidence: ["Unter kardiologischer Betreuung aufgenommen"],
    notes: {
      triage: { role: "Notfallpflege — Triage", date: "2026-05-07", type: "triage", text: "63-jähriger Mann mit seit zwei Stunden bestehendem schwerer Brustschmerz in Ruhe mit Ausstrahlung in den Kiefer, begleitet von Atemnot." },
      cardiology: { role: "Kardiologie — Dr Mark Alvarez", date: "2026-05-07", type: "cardiology", text: "ECG zeigt T-Wellen-Inversion in den inferioren Ableitungen. Troponin-Anstieg in der seriellen Testung vereinbar mit einem NSTEMI. Für Thrombozytenaggregationshemmung." },
      discharge: { role: "Notfallmedizin — Entlassung", date: "2026-05-07", type: "discharge_summary", text: "Unter kardiologischer Betreuung aufgenommen wegen eines NSTEMI mit geplanter stationärer Angiografie." },
    },
  },
  CP004: {
    code: "CP004", age: 72, troponin: null, troponinMissing: true, ecg: "VHF, schnelle Kammerantwort", timeToEcg: 19,
    complaint: "Atemnot und Brustenge", diagnosis: "Schnelles VHF, ?ACS", decision: "Aufnahme",
    complaintEvidence: ["Atemnot und Brustenge"],
    troponinEvidence: ["beim Transport hämolysiert und das Troponin konnte nicht berichtet werden"],
    ecgEvidence: ["Vorhofflimmern mit schneller Kammerantwort"],
    diagnosisEvidence: ["ein akutes Koronarsyndrom ist nicht ausgeschlossen"],
    decisionEvidence: ["Auf die medizinische Aufnahmestation aufgenommen"],
    notes: {
      triage: { role: "Notfallpflege — Triage", date: "2026-05-09", type: "triage", text: "72-jährige Frau mit Atemnot und Brustenge und einem unregelmäßig unregelmäßigen Puls." },
      lab: { role: "Labor — Biochemie", date: "2026-05-09", type: "lab", text: "Die Blutprobe ist beim Transport hämolysiert und das Troponin konnte nicht berichtet werden. Eine Wiederholungsprobe wurde angefordert." },
      cardiology: { role: "Kardiologie — Dr Sara Lin", date: "2026-05-09", type: "cardiology", text: "ECG zeigt Vorhofflimmern mit schneller Kammerantwort. Frequenzkontrolle begonnen; ein akutes Koronarsyndrom ist nicht ausgeschlossen, bis ein erneutes Troponin vorliegt." },
      discharge: { role: "Notfallmedizin — Entlassung", date: "2026-05-09", type: "discharge_summary", text: "Auf die medizinische Aufnahmestation aufgenommen zur Frequenzkontrolle und einem erneuten Troponin." },
    },
  },
  CP005: {
    code: "CP005", age: 35, troponin: 6, ecg: null, ecgMissing: true, timeToEcg: null,
    complaint: "Brustschmerz vom muskuloskelettalen Typ", diagnosis: "Muskuloskelettaler Brustschmerz", decision: "Entlassung",
    complaintEvidence: ["stechender linksseitiger Brustschmerz nach einer Trainingseinheit"],
    diagnosisEvidence: ["wahrscheinlich muskuloskelettaler Brustschmerz"],
    decisionEvidence: ["Mit einfacher Analgesie entlassen"],
    notes: {
      triage: { role: "Notfallpflege — Triage", date: "2026-05-10", type: "triage", text: "35-jähriger Mann mit stechender linksseitiger Brustschmerz nach einer Trainingseinheit, bei Bewegung reproduzierbar." },
      cardiology: { role: "Kardiologie — Dr Sara Lin", date: "2026-05-10", type: "cardiology", text: "Geringer klinischer Verdacht auf eine kardiale Ursache und Troponin negativ. Der Patient entließ sich selbst, bevor ein ECG aufgezeichnet werden konnte." },
      discharge: { role: "Notfallmedizin — Entlassung", date: "2026-05-10", type: "discharge_summary", text: "Mit einfacher Analgesie entlassen bei wahrscheinlich muskuloskelettaler Brustschmerz." },
    },
  },
  CP006: {
    code: "CP006", age: 55, troponin: 12, ecg: "Normaler Sinusrhythmus", timeToEcg: 22,
    complaint: "Belastungsabhängige Brustenge", diagnosis: "Stabile Angina pectoris", decision: "Aufnahme",
    complaintEvidence: ["Brustenge bei Belastung über die letzte Woche"],
    ecgEvidence: ["Ruhe-ECG normaler Sinusrhythmus"],
    diagnosisEvidence: ["hinweisend auf eine stabile Angina pectoris"],
    decisionEvidence: ["Auf die Beobachtungsstation aufgenommen"],
    notes: {
      triage: { role: "Notfallpflege — Triage", date: "2026-05-12", type: "triage", text: "55-jähriger Mann mit Brustenge bei Belastung über die letzte Woche, durch Ruhe gelindert." },
      cardiology: { role: "Kardiologie — Dr Mark Alvarez", date: "2026-05-12", type: "cardiology", text: "Ruhe-ECG normaler Sinusrhythmus. Troponin an der oberen Referenzgrenze ohne dynamische Veränderung. Anamnese hinweisend auf eine stabile Angina pectoris." },
      discharge: { role: "Notfallmedizin — Entlassung", date: "2026-05-12", type: "discharge_summary", text: "Auf die Beobachtungsstation aufgenommen für serielles Troponin und einen Belastungstest." },
    },
  },
  CP007: {
    code: "CP007", age: 68, troponin: 210, ecg: "ST-Senkung, lateral", timeToEcg: 9,
    complaint: "Epigastrischer und zentraler Brustschmerz", diagnosis: "NSTEMI", decision: "Aufnahme",
    complaintEvidence: ["epigastrischer und zentraler Brustschmerz mit Erbrechen"],
    ecgEvidence: ["ST-Senkung in den lateralen Ableitungen"],
    diagnosisEvidence: ["vereinbar mit einem NSTEMI"],
    decisionEvidence: ["Unter kardiologischer Betreuung aufgenommen"],
    notes: {
      triage: { role: "Notfallpflege — Triage", date: "2026-05-14", type: "triage", text: "68-jährige Frau mit epigastrischer und zentraler Brustschmerz mit Erbrechen." },
      cardiology: { role: "Kardiologie — Dr Sara Lin", date: "2026-05-14", type: "cardiology", text: "ECG zeigt ST-Senkung in den lateralen Ableitungen. Troponin deutlich erhöht, vereinbar mit einem NSTEMI. Duale Thrombozytenaggregationshemmung begonnen." },
      discharge: { role: "Notfallmedizin — Entlassung", date: "2026-05-14", type: "discharge_summary", text: "Unter kardiologischer Betreuung aufgenommen wegen eines NSTEMI und stationärer Angiografie." },
    },
  },
  CP008: {
    code: "CP008", age: 41, troponin: 3, ecg: "Normal", timeToEcg: 16,
    complaint: "Brustschmerz nach dem Heben", diagnosis: "Nichtkardialer Brustschmerz", decision: "Entlassung",
    complaintEvidence: ["stechender, flüchtiger Brustschmerz nach schwerem Heben"],
    ecgEvidence: ["ECG normal ohne akute Veränderungen"],
    diagnosisEvidence: ["Keine Anzeichen eines akuten Koronarsyndroms"],
    decisionEvidence: ["Mit Beruhigung nach Hause entlassen"],
    notes: {
      triage: { role: "Notfallpflege — Triage", date: "2026-05-16", type: "triage", text: "41-jähriger Mann mit stechender, flüchtiger Brustschmerz nach schwerem Heben." },
      cardiology: { role: "Kardiologie — Dr Mark Alvarez", date: "2026-05-16", type: "cardiology", text: "ECG normal ohne akute Veränderungen. Troponin in der seriellen Testung negativ. Keine Anzeichen eines akuten Koronarsyndroms." },
      discharge: { role: "Notfallmedizin — Entlassung", date: "2026-05-16", type: "discharge_summary", text: "Mit Beruhigung nach Hause entlassen und dem Rat, bei erneuten Symptomen wiederzukommen." },
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
      insulin: { v: "Insulin pump (CSII)", e: ["Mit einer Insulinpumpe (CSII) behandelt"] },
      cgm: { v: "Yes", e: ["verwendet einen kontinuierlichen Glukosesensor"] },
      lifestyle: { v: "Yes", e: ["Eine Lebensstil- und Ernährungsumstellung wurde empfohlen"] },
      dietitian: { v: "Yes", e: ["zusätzlicher Termin bei der pädiatrischen Diätassistenz wurde angeboten"] },
      psych: { v: "No", e: ["Es war keine zusätzliche psychologische Unterstützung über die Routineversorgung hinaus erforderlich"] },
      smoking: { v: "No", e: ["raucht und dampft nicht"] },
    },
    notes: [
      { role: "Pädiatrischer Diabetes — Dr Naomi Clarke", date: "2025-11-04", type: "diabetes_clinic", text: "In der pädiatrischen Diabetesambulanz untersucht. Mit einer Insulinpumpe (CSII) behandelt und verwendet einen kontinuierlichen Glukosesensor. Eine Lebensstil- und Ernährungsumstellung wurde empfohlen, um die Blutzuckerwerte zu senken. Ein zusätzlicher Termin bei der pädiatrischen Diätassistenz wurde angeboten." },
      { role: "Klinische Psychologie — Dr Owen Pratt", date: "2025-11-04", type: "psychology", text: "Jährliches psychologisches Screening durchgeführt. Es war keine zusätzliche psychologische Unterstützung über die Routineversorgung hinaus erforderlich." },
      { role: "Pädiatrischer Diabetes — Jahreskontrolle", date: "2025-11-04", type: "annual_review", text: "Jahreskontrolle durchgeführt. Der Jugendliche raucht und dampft nicht." },
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
      insulin: { v: "MDI (basal-bolus)", e: ["Basis-Bolus-Regime mit mehrfachen täglichen Injektionen (MDI)"] },
      cgm: { v: "Yes", e: ["verwendet einen kontinuierlichen Glukosesensor"] },
      lifestyle: { v: "Yes", e: ["Eine Lebensstil- und Ernährungsumstellung wurde empfohlen"] },
      dietitian: { v: "Yes", e: ["zusätzlicher Termin bei der pädiatrischen Diätassistenz wurde angeboten"] },
      psych: { v: "Yes", e: ["Zusätzliche psychologische Unterstützung außerhalb der Routineversorgung wurde empfohlen"] },
      smoking: { v: "No", e: ["raucht und dampft nicht"] },
    },
    notes: [
      { role: "Pädiatrischer Diabetes — Dr Naomi Clarke", date: "2025-12-09", type: "diabetes_clinic", text: "In der Ambulanz untersucht mit HbA1c über dem Zielwert. Auf einem Basis-Bolus-Regime mit mehrfachen täglichen Injektionen (MDI) eingestellt und verwendet einen kontinuierlichen Glukosesensor. Eine Lebensstil- und Ernährungsumstellung wurde empfohlen, um die Blutzuckerwerte zu senken. Ein zusätzlicher Termin bei der pädiatrischen Diätassistenz wurde angeboten." },
      { role: "Klinische Psychologie — Dr Owen Pratt", date: "2025-12-09", type: "psychology", text: "Jährliches psychologisches Screening durchgeführt. Der Jugendliche findet die Therapietreue schwierig. Zusätzliche psychologische Unterstützung außerhalb der Routineversorgung wurde empfohlen." },
      { role: "Pädiatrischer Diabetes — Jahreskontrolle", date: "2025-12-09", type: "annual_review", text: "Jahreskontrolle durchgeführt. Der Jugendliche raucht und dampft nicht." },
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
      insulin: { v: "MDI (basal-bolus)", e: ["Basis-Bolus-Regime mit mehrfachen täglichen Injektionen (MDI)"] },
      cgm: { v: "Yes", e: ["verwendet einen kontinuierlichen Glukosesensor"] },
      lifestyle: { v: "Yes", e: ["Eine Lebensstil- und Ernährungsumstellung wurde empfohlen"] },
      dietitian: { v: "Yes", e: ["zusätzlicher Termin bei der pädiatrischen Diätassistenz wurde angeboten"] },
      psych: { v: "No", e: ["Es war keine zusätzliche psychologische Unterstützung über die Routineversorgung hinaus erforderlich"] },
      smoking: { v: "No", e: ["raucht und dampft nicht"] },
      admission: { v: "DKA (new diagnosis)", e: ["diabetischer Ketoazidose (DKA) zum Zeitpunkt der Neudiagnose"] },
    },
    notes: [
      { role: "Pädiatrischer Diabetes — Dr Naomi Clarke", date: "2026-02-19", type: "diabetes_clinic", text: "Erste ambulante Kontrolle nach einer Neudiagnose. Auf einem Basis-Bolus-Regime mit mehrfachen täglichen Injektionen (MDI) eingestellt und verwendet einen kontinuierlichen Glukosesensor. Eine Lebensstil- und Ernährungsumstellung wurde empfohlen, um die Blutzuckerwerte zu senken. Ein zusätzlicher Termin bei der pädiatrischen Diätassistenz wurde angeboten." },
      { role: "Klinische Psychologie — Dr Owen Pratt", date: "2026-02-19", type: "psychology", text: "Psychologisches Screening bei der Erstkontrolle durchgeführt. Es war keine zusätzliche psychologische Unterstützung über die Routineversorgung hinaus erforderlich." },
      { role: "Pädiatrischer Diabetes — Jahreskontrolle", date: "2026-02-19", type: "annual_review", text: "Kontrolle durchgeführt. Das Kind raucht und dampft nicht." },
      { role: "Pädiatrie — Aufnahme", date: "2026-01-22", type: "admission", text: "Bei Vorstellung in diabetischer Ketoazidose (DKA) zum Zeitpunkt der Neudiagnose aufgenommen. Auf dem DKA-Pfad mit intravenösem Insulin und Flüssigkeit behandelt, mit guter Erholung." },
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
      insulin: { v: "Insulin pump (CSII)", e: ["Mit einer Insulinpumpe (CSII) behandelt"] },
      cgm: { v: "Yes", e: ["verwendet einen kontinuierlichen Glukosesensor"] },
      lifestyle: { v: "Yes", e: ["Eine Lebensstil- und Ernährungsumstellung wurde empfohlen"] },
      dietitian: { v: "No", e: ["Es war kein zusätzlicher Diätassistenz-Termin bei diesem Besuch erforderlich"] },
      psych: { v: "No", e: ["Es war keine zusätzliche psychologische Unterstützung über die Routineversorgung hinaus erforderlich"] },
      smoking: { v: "No", e: ["raucht und dampft nicht"] },
    },
    notes: [
      { role: "Pädiatrischer Diabetes — Dr Naomi Clarke", date: "2025-10-28", type: "diabetes_clinic", text: "In der Ambulanz mit guter Einstellung untersucht. Mit einer Insulinpumpe (CSII) behandelt und verwendet einen kontinuierlichen Glukosesensor. Eine Lebensstil- und Ernährungsumstellung wurde empfohlen, um die Blutzuckerwerte zu senken. Es war kein zusätzlicher Diätassistenz-Termin bei diesem Besuch erforderlich." },
      { role: "Klinische Psychologie — Dr Owen Pratt", date: "2025-10-28", type: "psychology", text: "Jährliches psychologisches Screening durchgeführt. Es war keine zusätzliche psychologische Unterstützung über die Routineversorgung hinaus erforderlich." },
      { role: "Pädiatrischer Diabetes — Jahreskontrolle", date: "2025-10-28", type: "annual_review", text: "Jahreskontrolle durchgeführt. Das Kind raucht und dampft nicht." },
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
      insulin: { v: "MDI (basal-bolus)", e: ["Basis-Bolus-Regime mit mehrfachen täglichen Injektionen (MDI)"] },
      cgm: { v: "No", e: ["verwendet derzeit keinen kontinuierlichen Glukosesensor"] },
      lifestyle: { v: "Yes", e: ["Eine Lebensstil- und Ernährungsumstellung wurde empfohlen"] },
      dietitian: { v: "Yes", e: ["zusätzlicher Termin bei der pädiatrischen Diätassistenz wurde angeboten"] },
      psych: { v: "Yes", e: ["Zusätzliche psychologische Unterstützung außerhalb der Routineversorgung wurde angesichts niedergedrückter Stimmung und Diabetes-Belastung empfohlen"] },
      smoking: { v: "Smokes", e: ["raucht derzeit"] },
    },
    notes: [
      { role: "Pädiatrischer Diabetes — Dr Naomi Clarke", date: "2025-11-25", type: "diabetes_clinic", text: "In der Ambulanz untersucht; die Einstellung bleibt besorgniserregend. Auf einem Basis-Bolus-Regime mit mehrfachen täglichen Injektionen (MDI) eingestellt und verwendet derzeit keinen kontinuierlichen Glukosesensor. Eine Lebensstil- und Ernährungsumstellung wurde empfohlen, um die Blutzuckerwerte zu senken. Ein zusätzlicher Termin bei der pädiatrischen Diätassistenz wurde angeboten." },
      { role: "Klinische Psychologie — Dr Owen Pratt", date: "2025-11-25", type: "psychology", text: "Jährliches psychologisches Screening durchgeführt. Zusätzliche psychologische Unterstützung außerhalb der Routineversorgung wurde angesichts niedergedrückter Stimmung und Diabetes-Belastung empfohlen." },
      { role: "Pädiatrischer Diabetes — Jahreskontrolle", date: "2025-11-25", type: "annual_review", text: "Jahreskontrolle durchgeführt. Der Jugendliche raucht derzeit; eine Raucherentwöhnungsberatung wurde angeboten." },
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
      insulin: { v: "MDI (basal-bolus)", e: ["Basis-Bolus-Regime mit mehrfachen täglichen Injektionen (MDI)"] },
      cgm: { v: "No", e: ["verwendet derzeit keinen kontinuierlichen Glukosesensor"] },
      lifestyle: { v: "Yes", e: ["Eine Lebensstil- und Ernährungsumstellung wurde empfohlen"] },
      dietitian: { v: "Yes", e: ["zusätzlicher Termin bei der pädiatrischen Diätassistenz wurde angeboten"] },
      psych: { v: "Yes", e: ["Zusätzliche psychologische Unterstützung außerhalb der Routineversorgung wurde empfohlen"] },
      smoking: { v: "No", e: ["raucht und dampft nicht"] },
      admission: { v: "DKA", e: ["diabetischer Ketoazidose (DKA) nach einer interkurrenten Erkrankung"] },
    },
    notes: [
      { role: "Pädiatrischer Diabetes — Dr Naomi Clarke", date: "2025-12-16", type: "diabetes_clinic", text: "In der Ambulanz nach einer kürzlichen Aufnahme untersucht. Auf einem Basis-Bolus-Regime mit mehrfachen täglichen Injektionen (MDI) eingestellt und verwendet derzeit keinen kontinuierlichen Glukosesensor. Eine Lebensstil- und Ernährungsumstellung wurde empfohlen, um die Blutzuckerwerte zu senken. Ein zusätzlicher Termin bei der pädiatrischen Diätassistenz wurde angeboten." },
      { role: "Klinische Psychologie — Dr Owen Pratt", date: "2025-12-16", type: "psychology", text: "Jährliches psychologisches Screening durchgeführt. Zusätzliche psychologische Unterstützung außerhalb der Routineversorgung wurde empfohlen, um das Selbstmanagement zu unterstützen." },
      { role: "Pädiatrischer Diabetes — Jahreskontrolle", date: "2025-12-16", type: "annual_review", text: "Jahreskontrolle durchgeführt. Das Kind raucht und dampft nicht." },
      { role: "Pädiatrie — Aufnahme", date: "2025-08-07", type: "admission", text: "Notfallaufnahme mit diabetischer Ketoazidose (DKA) nach einer interkurrenten Erkrankung. Auf dem DKA-Pfad behandelt und mit verstärkten Krankheitstage-Regeln entlassen." },
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
      insulin: { v: "Insulin pump (CSII)", e: ["Mit einer Insulinpumpe (CSII) behandelt"] },
      cgm: { v: "Yes", e: ["verwendet einen kontinuierlichen Glukosesensor"] },
      lifestyle: { v: "Yes", e: ["Eine Lebensstil- und Ernährungsumstellung wurde empfohlen"] },
      dietitian: { v: "Yes", e: ["zusätzlicher Termin bei der pädiatrischen Diätassistenz wurde angeboten"] },
      psych: { v: "No", e: ["Es war keine zusätzliche psychologische Unterstützung über die Routineversorgung hinaus erforderlich"] },
      smoking: { v: "No", e: ["raucht und dampft nicht"] },
    },
    notes: [
      { role: "Pädiatrischer Diabetes — Dr Naomi Clarke", date: "2025-11-18", type: "diabetes_clinic", text: "Frühe Kontrolle eines Kleinkindes nach Diagnose. Mit einer Insulinpumpe (CSII) behandelt und verwendet einen kontinuierlichen Glukosesensor. Eine Lebensstil- und Ernährungsumstellung wurde empfohlen, um der Familie zu helfen, die Blutzuckerwerte zu senken. Ein zusätzlicher Termin bei der pädiatrischen Diätassistenz wurde angeboten." },
      { role: "Klinische Psychologie — Dr Owen Pratt", date: "2025-11-18", type: "psychology", text: "Psychologisches Screening mit der Familie durchgeführt. Es war keine zusätzliche psychologische Unterstützung über die Routineversorgung hinaus erforderlich." },
      { role: "Pädiatrischer Diabetes — Jahreskontrolle", date: "2025-11-18", type: "annual_review", text: "Kontrolle durchgeführt. Das Kind raucht und dampft nicht." },
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
      insulin: { v: "Insulin pump (CSII)", e: ["Mit einer Insulinpumpe (CSII) behandelt"] },
      cgm: { v: "Yes", e: ["verwendet einen kontinuierlichen Glukosesensor"] },
      lifestyle: { v: "Yes", e: ["Eine Lebensstil- und Ernährungsumstellung wurde empfohlen"] },
      dietitian: { v: "Yes", e: ["zusätzlicher Termin bei der pädiatrischen Diätassistenz wurde angeboten"] },
      psych: { v: "No", e: ["Es war keine zusätzliche psychologische Unterstützung über die Routineversorgung hinaus erforderlich"] },
      smoking: { v: "Vapes", e: ["dampft regelmäßig"] },
    },
    notes: [
      { role: "Pädiatrischer Diabetes — Dr Naomi Clarke", date: "2025-12-02", type: "diabetes_clinic", text: "In der Ambulanz untersucht. Mit einer Insulinpumpe (CSII) behandelt und verwendet einen kontinuierlichen Glukosesensor. Eine Lebensstil- und Ernährungsumstellung wurde empfohlen, um die Blutzuckerwerte zu senken. Ein zusätzlicher Termin bei der pädiatrischen Diätassistenz wurde angeboten." },
      { role: "Klinische Psychologie — Dr Owen Pratt", date: "2025-12-02", type: "psychology", text: "Jährliches psychologisches Screening durchgeführt. Es war keine zusätzliche psychologische Unterstützung über die Routineversorgung hinaus erforderlich." },
      { role: "Pädiatrischer Diabetes — Jahreskontrolle", date: "2025-12-02", type: "annual_review", text: "Jahreskontrolle durchgeführt. Der Jugendliche dampft regelmäßig; eine Entwöhnungsberatung wurde angeboten." },
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
      insulin: { v: "MDI (basal-bolus)", e: ["Basis-Bolus-Regime mit mehrfachen täglichen Injektionen (MDI)"] },
      cgm: { v: "Yes", e: ["verwendet einen kontinuierlichen Glukosesensor"] },
      lifestyle: { v: "Yes", e: ["Eine Lebensstil- und Ernährungsumstellung wurde empfohlen"] },
      dietitian: { v: "No", e: ["Es war kein zusätzlicher Diätassistenz-Termin bei diesem Besuch erforderlich"] },
      psych: { v: "No", e: ["Es war keine zusätzliche psychologische Unterstützung über die Routineversorgung hinaus erforderlich"] },
      smoking: { v: "No", e: ["raucht und dampft nicht"] },
    },
    notes: [
      { role: "Pädiatrischer Diabetes — Dr Naomi Clarke", date: "2025-11-11", type: "diabetes_clinic", text: "In der Ambulanz mit stabiler Einstellung untersucht. Auf einem Basis-Bolus-Regime mit mehrfachen täglichen Injektionen (MDI) eingestellt und verwendet einen kontinuierlichen Glukosesensor. Eine Lebensstil- und Ernährungsumstellung wurde empfohlen, um die Blutzuckerwerte zu senken. Es war kein zusätzlicher Diätassistenz-Termin bei diesem Besuch erforderlich." },
      { role: "Klinische Psychologie — Dr Owen Pratt", date: "2025-11-11", type: "psychology", text: "Jährliches psychologisches Screening durchgeführt. Es war keine zusätzliche psychologische Unterstützung über die Routineversorgung hinaus erforderlich." },
      { role: "Pädiatrischer Diabetes — Jahreskontrolle", date: "2025-11-11", type: "annual_review", text: "Jahreskontrolle durchgeführt. Das Kind raucht und dampft nicht." },
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
      insulin: { v: "MDI (basal-bolus)", e: ["Basis-Bolus-Regime mit mehrfachen täglichen Injektionen (MDI)"] },
      cgm: { v: "Yes", e: ["verwendet einen kontinuierlichen Glukosesensor"] },
      lifestyle: { v: "Yes", e: ["Eine Lebensstil- und Ernährungsumstellung wurde empfohlen"] },
      dietitian: { v: "Yes", e: ["zusätzlicher Termin bei der pädiatrischen Diätassistenz wurde angeboten"] },
      psych: { v: "No", e: ["Es war keine zusätzliche psychologische Unterstützung über die Routineversorgung hinaus erforderlich"] },
      smoking: { v: "No", e: ["raucht und dampft nicht"] },
    },
    notes: [
      { role: "Pädiatrischer Diabetes — Dr Naomi Clarke", date: "2025-10-21", type: "diabetes_clinic", text: "In der Ambulanz untersucht. Auf einem Basis-Bolus-Regime mit mehrfachen täglichen Injektionen (MDI) eingestellt und verwendet einen kontinuierlichen Glukosesensor. Eine Lebensstil- und Ernährungsumstellung wurde empfohlen, um die Blutzuckerwerte zu senken. Ein zusätzlicher Termin bei der pädiatrischen Diätassistenz wurde angeboten." },
      { role: "Klinische Psychologie — Dr Owen Pratt", date: "2025-10-21", type: "psychology", text: "Jährliches psychologisches Screening durchgeführt. Es war keine zusätzliche psychologische Unterstützung über die Routineversorgung hinaus erforderlich." },
      { role: "Pädiatrischer Diabetes — Jahreskontrolle", date: "2025-10-21", type: "annual_review", text: "Jahreskontrolle durchgeführt. Der Jugendliche raucht und dampft nicht." },
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
      insulin: { v: "Insulin pump (CSII)", e: ["Mit einer Insulinpumpe (CSII) behandelt"] },
      cgm: { v: "Yes", e: ["verwendet einen kontinuierlichen Glukosesensor"] },
      lifestyle: { v: "Yes", e: ["Eine Lebensstil- und Ernährungsumstellung wurde empfohlen"] },
      dietitian: { v: "No", e: ["Es war kein zusätzlicher Diätassistenz-Termin bei diesem Besuch erforderlich"] },
      psych: { v: "No", e: ["Es war keine zusätzliche psychologische Unterstützung über die Routineversorgung hinaus erforderlich"] },
      smoking: { v: "No", e: ["raucht und dampft nicht"] },
    },
    notes: [
      { role: "Pädiatrischer Diabetes — Dr Naomi Clarke", date: "2025-12-19", type: "diabetes_clinic", text: "In der Ambulanz mit guter Einstellung untersucht. Mit einer Insulinpumpe (CSII) behandelt und verwendet einen kontinuierlichen Glukosesensor. Eine Lebensstil- und Ernährungsumstellung wurde empfohlen, um die Blutzuckerwerte zu senken. Es war kein zusätzlicher Diätassistenz-Termin bei diesem Besuch erforderlich." },
      { role: "Klinische Psychologie — Dr Owen Pratt", date: "2025-12-19", type: "psychology", text: "Jährliches psychologisches Screening durchgeführt. Es war keine zusätzliche psychologische Unterstützung über die Routineversorgung hinaus erforderlich." },
      { role: "Pädiatrischer Diabetes — Jahreskontrolle", date: "2025-12-19", type: "annual_review", text: "Jahreskontrolle durchgeführt. Das Kind raucht und dampft nicht." },
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
      insulin: { v: "Diet and metformin (no insulin)", e: ["mit Metformin ohne Insulin behandelt"] },
      cgm: { v: "No", e: ["verwendet derzeit keinen kontinuierlichen Glukosesensor"] },
      lifestyle: { v: "Yes", e: ["Eine Lebensstil- und Ernährungsumstellung wurde empfohlen"] },
      dietitian: { v: "Yes", e: ["zusätzlicher Termin bei der pädiatrischen Diätassistenz wurde angeboten"] },
      psych: { v: "Yes", e: ["Zusätzliche psychologische Unterstützung außerhalb der Routineversorgung wurde im Hinblick auf Gewicht und Wohlbefinden empfohlen"] },
      smoking: { v: "No", e: ["raucht und dampft nicht"] },
    },
    notes: [
      { role: "Pädiatrischer Diabetes — Dr Naomi Clarke", date: "2025-11-28", type: "diabetes_clinic", text: "In der Typ-2-Diabetesambulanz für Jugendliche untersucht. Derzeit mit Metformin ohne Insulin behandelt und verwendet derzeit keinen kontinuierlichen Glukosesensor. Eine Lebensstil- und Ernährungsumstellung wurde empfohlen, um die Blutzuckerwerte zu senken. Ein zusätzlicher Termin bei der pädiatrischen Diätassistenz wurde angeboten." },
      { role: "Klinische Psychologie — Dr Owen Pratt", date: "2025-11-28", type: "psychology", text: "Jährliches psychologisches Screening durchgeführt. Zusätzliche psychologische Unterstützung außerhalb der Routineversorgung wurde im Hinblick auf Gewicht und Wohlbefinden empfohlen." },
      { role: "Pädiatrischer Diabetes — Jahreskontrolle", date: "2025-11-28", type: "annual_review", text: "Jahreskontrolle durchgeführt. Der Jugendliche raucht und dampft nicht." },
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
      expertise: { v: "Yes", e: ["Vom pädiatrischen Oberarzt mit Expertise in Epilepsie"] },
      seizureType: { v: "Convulsive", e: ["generalisierte tonisch-klonische (konvulsive) Anfälle"] },
      mhProblem: { v: "No", e: ["kein Problem der psychischen Gesundheit festgestellt"] },
      mhSupport: { v: "No", e: ["kein Problem der psychischen Gesundheit festgestellt"] },
    },
    notes: [
      { role: "Pädiatrische Neurologie — Dr Helen Marsh", date: "2025-01-20", type: "epilepsy_clinic", text: "Vom pädiatrischen Oberarzt mit Expertise in Epilepsie bei der Erstbeurteilung nach der Überweisung gesehen. Anamnestisch bestehen generalisierte tonisch-klonische (konvulsive) Anfälle. Ein MRI des Schädels und ein ECG wurden veranlasst." },
      { role: "Epilepsie — Screening der psychischen Gesundheit", date: "2025-04-01", type: "mh_screening", text: "Screening der psychischen Gesundheit mit dem vereinbarten Fragebogen durchgeführt; zu diesem Zeitpunkt im ersten Versorgungsjahr wurde kein Problem der psychischen Gesundheit festgestellt." },
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
      expertise: { v: "Yes", e: ["Vom epilepsieerfahrenen pädiatrischen Oberarzt"] },
      seizureType: { v: "Convulsive", e: ["fokale Anfälle mit Übergang in bilaterale konvulsive Aktivität"] },
      mhProblem: { v: "Yes", e: ["das Screening ergab eine niedergedrückte Stimmung und Angst"] },
      mhSupport: { v: "Yes", e: ["an das Team für psychische Gesundheit überwiesen, und Unterstützung wurde im ersten Versorgungsjahr geleistet"] },
    },
    notes: [
      { role: "Pädiatrische Neurologie — Dr Helen Marsh", date: "2025-02-12", type: "epilepsy_clinic", text: "Vom epilepsieerfahrenen pädiatrischen Oberarzt innerhalb von zwei Wochen nach der Überweisung kontrolliert. Es handelt sich um fokale Anfälle mit Übergang in bilaterale konvulsive Aktivität. Behandlungsbeginn mit Natriumvalproat; als Frau im gebärfähigen Alter wurde ein Schwangerschaftsverhütungsprogramm eingerichtet und dokumentiert." },
      { role: "Epilepsie — Screening der psychischen Gesundheit", date: "2025-05-02", type: "mh_screening", text: "Screening der psychischen Gesundheit durchgeführt; das Screening ergab eine niedergedrückte Stimmung und Angst. Sie wurde an das Team für psychische Gesundheit überwiesen, und Unterstützung wurde im ersten Versorgungsjahr geleistet." },
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
      expertise: { v: "Yes", e: ["Vom pädiatrischen Oberarzt mit Expertise in Epilepsie"] },
      seizureType: { v: "Non-convulsive", e: ["typische Absencen (nicht-konvulsive Anfälle)"] },
      mhProblem: { v: "No", e: ["kein Problem der psychischen Gesundheit festgestellt"] },
      mhSupport: { v: "No", e: ["kein Problem der psychischen Gesundheit festgestellt"] },
    },
    notes: [
      { role: "Pädiatrische Neurologie — Dr Helen Marsh", date: "2025-03-10", type: "epilepsy_clinic", text: "Vom pädiatrischen Oberarzt mit Expertise in Epilepsie gesehen. Semiologisch liegen typische Absencen (nicht-konvulsive Anfälle) vor, sodass kein ECG indiziert war. Ein MRI des Schädels wurde angefordert. Behandlungsbeginn mit Topiramat; als Frau im gebärfähigen Alter wurde ein Schwangerschaftsverhütungsprogramm eingerichtet." },
      { role: "Epilepsie — Screening der psychischen Gesundheit", date: "2025-06-05", type: "mh_screening", text: "Screening der psychischen Gesundheit mit dem vereinbarten Fragebogen durchgeführt; es wurde kein Problem der psychischen Gesundheit festgestellt." },
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
      expertise: { v: "Yes", e: ["Beurteilung durch den epilepsieerfahrenen Pädiater"] },
      seizureType: { v: "Convulsive", e: ["generalisierte tonisch-klonische (konvulsive) Anfälle"] },
      mhProblem: { v: "No", e: ["kein Problem der psychischen Gesundheit festgestellt"] },
      mhSupport: { v: "No", e: ["kein Problem der psychischen Gesundheit festgestellt"] },
    },
    notes: [
      { role: "Pädiatrische Neurologie — Dr Helen Marsh", date: "2025-02-20", type: "epilepsy_clinic", text: "Kapazitätsengpässe verzögerten die erste Ambulanzvorstellung; die Beurteilung durch den epilepsieerfahrenen Pädiater erfolgte mehr als zwei Wochen nach der Überweisung. Es liegen generalisierte tonisch-klonische (konvulsive) Anfälle vor. Ein MRI war bei dieser typischen Präsentation nicht indiziert; ein ECG wurde veranlasst." },
      { role: "Epilepsie — Screening der psychischen Gesundheit", date: "2025-05-10", type: "mh_screening", text: "Screening der psychischen Gesundheit gemeinsam mit der Familie durchgeführt; es wurde kein Problem der psychischen Gesundheit festgestellt." },
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
      expertise: { v: "Yes", e: ["Vom pädiatrischen Oberarzt mit Expertise in Epilepsie"] },
      seizureType: { v: "Convulsive", e: ["generalisierte tonisch-klonische (konvulsive) Anfälle"] },
      mhProblem: { v: "Yes", e: ["das Screening ergab eine deutlich niedergedrückte Stimmung"] },
      mhSupport: { v: "No", e: ["Unterstützung wurde bisher jedoch nicht organisiert"] },
    },
    notes: [
      { role: "Pädiatrische Neurologie — Dr Helen Marsh", date: "2025-04-09", type: "epilepsy_clinic", text: "Vom pädiatrischen Oberarzt mit Expertise in Epilepsie gesehen. Es liegen generalisierte tonisch-klonische (konvulsive) Anfälle vor. Behandlungsbeginn mit Natriumvalproat. Die Unterlagen zum Schwangerschaftsverhütungsprogramm wurden besprochen, jedoch nicht vervollständigt und stehen weiterhin aus." },
      { role: "Epilepsie — Screening der psychischen Gesundheit", date: "2025-07-02", type: "mh_screening", text: "Screening der psychischen Gesundheit durchgeführt; das Screening ergab eine deutlich niedergedrückte Stimmung. Eine Überweisung wurde empfohlen, Unterstützung wurde bisher jedoch nicht organisiert." },
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
      expertise: { v: "Yes", e: ["Vom epilepsieerfahrenen pädiatrischen Oberarzt"] },
      seizureType: { v: "Non-convulsive", e: ["typische Absencen (nicht-konvulsive Anfälle)"] },
      mhProblem: { v: "No", e: ["kein Problem der psychischen Gesundheit festgestellt"] },
      mhSupport: { v: "No", e: ["kein Problem der psychischen Gesundheit festgestellt"] },
    },
    notes: [
      { role: "Pädiatrische Neurologie — Dr Helen Marsh", date: "2025-05-12", type: "epilepsy_clinic", text: "Vom epilepsieerfahrenen pädiatrischen Oberarzt gesehen. Es liegen typische Absencen (nicht-konvulsive Anfälle) vor, sodass weder ein MRI noch ein ECG indiziert war." },
      { role: "Epilepsie — Screening der psychischen Gesundheit", date: "2025-08-01", type: "mh_screening", text: "Screening der psychischen Gesundheit mit dem vereinbarten Fragebogen durchgeführt; es wurde kein Problem der psychischen Gesundheit festgestellt." },
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
      expertise: { v: "Yes", e: ["Vom pädiatrischen Oberarzt mit Expertise in Epilepsie"] },
      seizureType: { v: "Convulsive", e: ["generalisierte tonisch-klonische (konvulsive) Anfälle"] },
      mhProblem: { v: "No", e: ["kein Problem der psychischen Gesundheit festgestellt"] },
      mhSupport: { v: "No", e: ["kein Problem der psychischen Gesundheit festgestellt"] },
    },
    notes: [
      { role: "Pädiatrische Neurologie — Dr Helen Marsh", date: "2025-06-12", type: "epilepsy_clinic", text: "Vom pädiatrischen Oberarzt mit Expertise in Epilepsie gesehen. Es liegen generalisierte tonisch-klonische (konvulsive) Anfälle vor. Ein MRI des Schädels wurde angefordert und ein ECG veranlasst." },
      { role: "Epilepsie — Screening der psychischen Gesundheit", date: "2025-09-01", type: "mh_screening", text: "Screening der psychischen Gesundheit durchgeführt; es wurde kein Problem der psychischen Gesundheit festgestellt." },
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
      expertise: { v: "No", e: ["durch einen allgemeinen Pädiater ohne spezifische Epilepsie-Expertise"] },
      seizureType: { v: "Convulsive", e: ["generalisierte tonisch-klonische (konvulsive) Anfälle"] },
      mhProblem: { v: "No", e: ["kein Problem der psychischen Gesundheit festgestellt"] },
      mhSupport: { v: "No", e: ["kein Problem der psychischen Gesundheit festgestellt"] },
    },
    notes: [
      { role: "Pädiatrie — Dr Sam Reid", date: "2025-07-10", type: "epilepsy_clinic", text: "Die Erstbeurteilung erfolgte durch einen allgemeinen Pädiater ohne spezifische Epilepsie-Expertise; die weiterführende Kontrolle durch den Epilepsie-Verantwortlichen steht aus. Es liegen generalisierte tonisch-klonische (konvulsive) Anfälle vor. Ein ECG wurde veranlasst; ein MRI war nicht indiziert." },
      { role: "Epilepsie — Screening der psychischen Gesundheit", date: "2025-10-01", type: "mh_screening", text: "Screening der psychischen Gesundheit mit dem vereinbarten Fragebogen durchgeführt; es wurde kein Problem der psychischen Gesundheit festgestellt." },
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
      expertise: { v: "Yes", e: ["Vom pädiatrischen Oberarzt mit Expertise in Epilepsie"] },
      seizureType: { v: "Non-convulsive", e: ["typische Absencen (nicht-konvulsive Anfälle)"] },
      mhProblem: { v: "No", e: ["das Screening der psychischen Gesundheit bisher nicht durchgeführt wurde"] },
      mhSupport: { v: "No", e: ["das Screening der psychischen Gesundheit bisher nicht durchgeführt wurde"] },
    },
    notes: [
      { role: "Pädiatrische Neurologie — Dr Helen Marsh", date: "2025-08-13", type: "epilepsy_clinic", text: "Vom pädiatrischen Oberarzt mit Expertise in Epilepsie gesehen. Es liegen typische Absencen (nicht-konvulsive Anfälle) vor, sodass kein ECG indiziert war. Ein MRI des Schädels wurde angefordert." },
      { role: "Epilepsie — Screening der psychischen Gesundheit", date: "2025-09-01", type: "mh_screening", text: "Die Dokumentationsprüfung vermerkt, dass für dieses Kind im ersten Versorgungsjahr das Screening der psychischen Gesundheit bisher nicht durchgeführt wurde." },
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
      expertise: { v: "Yes", e: ["Vom pädiatrischen Oberarzt mit Expertise in Epilepsie"] },
      seizureType: { v: "Convulsive", e: ["generalisierte tonisch-klonische (konvulsive) Anfälle"] },
      mhProblem: { v: "No", e: ["kein Problem der psychischen Gesundheit festgestellt"] },
      mhSupport: { v: "No", e: ["kein Problem der psychischen Gesundheit festgestellt"] },
    },
    notes: [
      { role: "Pädiatrische Neurologie — Dr Helen Marsh", date: "2025-09-19", type: "epilepsy_clinic", text: "Vom pädiatrischen Oberarzt mit Expertise in Epilepsie gesehen. Es liegen generalisierte tonisch-klonische (konvulsive) Anfälle vor. Ein ECG wurde veranlasst; ein MRI war bei dieser Präsentation nicht indiziert." },
      { role: "Epilepsie — Screening der psychischen Gesundheit", date: "2025-11-20", type: "mh_screening", text: "Screening der psychischen Gesundheit mit dem vereinbarten Fragebogen durchgeführt; es wurde kein Problem der psychischen Gesundheit festgestellt." },
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
      intubationConsidered: { v: "Yes", e: ["der Atemweg wurde innerhalb von 18 Minuten nach Ankunft mittels Rapid-Sequence-Intubation gesichert"] },
      rehabPrescription: { v: "Yes", e: ["eine Rehabilitationsverordnung wurde erstellt und der Familie, dem Hausarzt und dem gemeindenahen Versorgungsteam übermittelt"] },
    },
    notes: [
      { role: "Trauma-Team — Dr Olusola Bello", date: "2026-01-08", type: "resus", text: "Das oberarztgeleitete Trauma-Team nahm dieses Kind nach einem Verkehrsunfall mit hoher Geschwindigkeit auf. GCS 6 bei Ankunft; der Atemweg wurde innerhalb von 18 Minuten nach Ankunft mittels Rapid-Sequence-Intubation gesichert. Tranexamsäure wurde bei massiver Blutung verabreicht." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-01-24", type: "rehab", text: "Der Rehabilitationsbedarf wurde durch den Rehabilitationskoordinator der Traumaversorgung beurteilt; eine Rehabilitationsverordnung wurde erstellt und der Familie, dem Hausarzt und dem gemeindenahen Versorgungsteam übermittelt, wobei die Kernkomponenten im NMTR dokumentiert wurden." },
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
      intubationConsidered: { v: "No", e: ["der Atemweg war durchgängig und wurde durchgehend eigenständig aufrechterhalten, sodass keine Intubation erforderlich war"] },
      rehabPrescription: { v: "Yes", e: ["eine Rehabilitationsverordnung wurde ausgestellt und dem Hausarzt sowie dem weiterbehandelnden Leistungserbringer in Kopie übermittelt"] },
    },
    notes: [
      { role: "Trauma-Team — Dr Olusola Bello", date: "2026-01-15", type: "resus", text: "Sturz aus großer Höhe. GCS 10 bei Ankunft; der Atemweg war durchgängig und wurde durchgehend eigenständig aufrechterhalten, sodass keine Intubation erforderlich war. Keine Indikation für Tranexamsäure. Der Oberarzt traf wegen einer parallel laufenden Reanimation neun Minuten nach Ankunft im Schockraum ein." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-01-31", type: "rehab", text: "Rehabilitationsbedarf beurteilt; eine Rehabilitationsverordnung wurde ausgestellt und dem Hausarzt sowie dem weiterbehandelnden Leistungserbringer in Kopie übermittelt, mit den Kernkomponenten im NMTR." },
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
      intubationConsidered: { v: "Yes", e: ["die Notwendigkeit eines definitiven Atemwegs wurde dokumentiert und die Intubation wurde nach 25 Minuten durchgeführt"] },
      rehabPrescription: { v: "Yes", e: ["eine Rehabilitationsverordnung wurde gemeinsam mit der Familie erstellt und dem Hausarzt sowie dem gemeindenahen Versorgungsteam übermittelt"] },
    },
    notes: [
      { role: "Trauma-Team — Dr Olusola Bello", date: "2026-01-20", type: "resus", text: "Quetschverletzung. GCS 7 bei Ankunft; die Notwendigkeit eines definitiven Atemwegs wurde dokumentiert und die Intubation wurde nach 25 Minuten durchgeführt. Tranexamsäure wurde innerhalb einer Stunde verabreicht. Der Oberarzt war innerhalb von drei Minuten im Schockraum anwesend." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-02-03", type: "rehab", text: "Rehabilitationsbedarf beurteilt; eine Rehabilitationsverordnung wurde gemeinsam mit der Familie erstellt und dem Hausarzt sowie dem gemeindenahen Versorgungsteam übermittelt." },
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
      intubationConsidered: { v: "No", e: ["der Atemweg wurde bei einem GCS von 14 eigenständig aufrechterhalten und eine Intubation war nicht indiziert"] },
      rehabPrescription: { v: "Yes", e: ["eine Rehabilitationsverordnung wurde ausgestellt und der Familie, dem Hausarzt und dem weiterbehandelnden Leistungserbringer übermittelt"] },
    },
    notes: [
      { role: "Trauma-Team — Dr Olusola Bello", date: "2026-01-25", type: "resus", text: "Sportverletzung mit einer Milzlazeration. GCS 14 bei Ankunft; der Atemweg wurde bei einem GCS von 14 eigenständig aufrechterhalten und eine Intubation war nicht indiziert. Keine massive Blutung, die Tranexamsäure erfordert hätte." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-02-07", type: "rehab", text: "Rehabilitationsbedarf beurteilt; eine Rehabilitationsverordnung wurde ausgestellt und der Familie, dem Hausarzt und dem weiterbehandelnden Leistungserbringer übermittelt." },
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
      intubationConsidered: { v: "No", e: ["wach mit einem GCS von 15 und einem eigenständig aufrechterhaltenen Atemweg, sodass keine Atemwegsintervention erwogen wurde"] },
      rehabPrescription: { v: "No", e: ["eine formelle Rehabilitationsverordnung wurde jedoch bisher nicht erstellt und steht bei Entlassung weiterhin aus"] },
    },
    notes: [
      { role: "Trauma-Team — Dr Olusola Bello", date: "2026-02-01", type: "resus", text: "Röhrenknochenfraktur der unteren Extremität nach einem Sturz. Das Kleinkind war wach mit einem GCS von 15 und einem eigenständig aufrechterhaltenen Atemweg, sodass keine Atemwegsintervention erwogen wurde. Kein Schädel-Hirn-Trauma." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-02-05", type: "rehab", text: "Der Rehabilitationsbedarf wurde während des Aufenthalts beurteilt; eine formelle Rehabilitationsverordnung wurde jedoch bisher nicht erstellt und steht bei Entlassung weiterhin aus." },
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
      intubationConsidered: { v: "Yes", e: ["der Atemweg wurde 22 Minuten nach Ankunft mittels Intubation gesichert"] },
      rehabPrescription: { v: "Yes", e: ["eine Rehabilitationsverordnung wurde erstellt und der Familie, dem Hausarzt und dem weiterbehandelnden Team ausgehändigt"] },
    },
    notes: [
      { role: "Trauma-Team — Dr Olusola Bello", date: "2026-02-04", type: "resus", text: "Penetrierende Abdominalverletzung mit massiver Blutung. GCS 5 bei Ankunft; der Atemweg wurde 22 Minuten nach Ankunft mittels Intubation gesichert. Der Oberarzt war innerhalb von zwei Minuten anwesend. Tranexamsäure wurde verabreicht, jedoch wegen eines schwierigen Interhospitaltransfers verzögert auf 75 Minuten nach dem Trauma." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-02-23", type: "rehab", text: "Der Rehabilitationsbedarf wurde durch den Rehabilitationskoordinator der Traumaversorgung beurteilt; eine Rehabilitationsverordnung wurde erstellt und der Familie, dem Hausarzt und dem weiterbehandelnden Team ausgehändigt, mit den Kernkomponenten im NMTR." },
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
      intubationConsidered: { v: "Yes", e: ["ein definitiver Atemweg wurde erwogen und die Intubation 29 Minuten nach Ankunft durchgeführt"] },
      rehabPrescription: { v: "Yes", e: ["eine Rehabilitationsverordnung wurde erstellt und dem Hausarzt sowie dem gemeindenahen Rehabilitationsdienst übermittelt"] },
    },
    notes: [
      { role: "Trauma-Team — Dr Olusola Bello", date: "2026-02-10", type: "resus", text: "Fußgänger gegen Fahrzeug. GCS 8 bei Ankunft; ein definitiver Atemweg wurde erwogen und die Intubation 29 Minuten nach Ankunft durchgeführt. Tranexamsäure wurde innerhalb einer Stunde verabreicht. Der Oberarzt war nach fünf Minuten anwesend." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-02-26", type: "rehab", text: "Rehabilitationsbedarf beurteilt; eine Rehabilitationsverordnung wurde erstellt und dem Hausarzt sowie dem gemeindenahen Rehabilitationsdienst übermittelt." },
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
      intubationConsidered: { v: "No", e: ["vollständig wach mit einem GCS von 15, sodass keine Atemwegsintervention erwogen wurde"] },
      rehabPrescription: { v: "No", e: ["für diese Aufnahme mit leichter Verletzung war keine Rehabilitationsverordnung erforderlich" ] },
    },
    notes: [
      { role: "Trauma-Team — Dr Olusola Bello", date: "2026-02-13", type: "resus", text: "Isolierte geschlossene Unterarmfraktur nach einem Sturz auf dem Spielplatz. Das Kind war vollständig wach mit einem GCS von 15, sodass keine Atemwegsintervention erwogen wurde. Kein Schädel-Hirn-Trauma und keine massive Blutung." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-02-17", type: "rehab", text: "Rehabilitationsbedarf überprüft; für diese Aufnahme mit leichter Verletzung war keine Rehabilitationsverordnung erforderlich, da sie unterhalb des Schwellenwerts für die Rehabilitation bei schwerem Trauma lag." },
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
      intubationConsidered: { v: "No", e: ["der Atemweg wurde bei einem GCS von 9 aufrechterhalten und eine Intubation war zu diesem Zeitpunkt nicht erforderlich"] },
      rehabPrescription: { v: "Yes", e: ["eine Rehabilitationsverordnung wurde ausgestellt und der Familie, dem Hausarzt und dem weiterbehandelnden Leistungserbringer übermittelt"] },
    },
    notes: [
      { role: "Trauma-Team — Dr Olusola Bello", date: "2026-02-16", type: "resus", text: "Radfahrer gegen Fahrzeug mit Thoraxverletzung. GCS 9 bei Ankunft; der Atemweg wurde bei einem GCS von 9 aufrechterhalten und eine Intubation war zu diesem Zeitpunkt nicht erforderlich. Keine Indikation für Tranexamsäure." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-03-04", type: "rehab", text: "Rehabilitationsbedarf beurteilt; eine Rehabilitationsverordnung wurde ausgestellt und der Familie, dem Hausarzt und dem weiterbehandelnden Leistungserbringer übermittelt, mit den Kernkomponenten im NMTR." },
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
      intubationConsidered: { v: "No", e: ["hielt den eigenen Atemweg bei einem GCS von 12 aufrecht und eine Intubation war nicht indiziert"] },
      rehabPrescription: { v: "Yes", e: ["eine Rehabilitationsverordnung wurde erstellt und der Familie, dem Hausarzt und dem weiterbehandelnden Leistungserbringer übermittelt"] },
    },
    notes: [
      { role: "Trauma-Team — Dr Olusola Bello", date: "2026-02-19", type: "resus", text: "Treppensturz mit einem leichten Schädel-Hirn-Trauma und einer Leberlazeration. Das Kind hielt den eigenen Atemweg bei einem GCS von 12 aufrecht und eine Intubation war nicht indiziert. Keine massive Blutung." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-03-01", type: "rehab", text: "Rehabilitationsbedarf beurteilt; eine Rehabilitationsverordnung wurde erstellt und der Familie, dem Hausarzt und dem weiterbehandelnden Leistungserbringer übermittelt." },
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
    Male: { code: 1, label: "Männlich" },
    Female: { code: 2, label: "Weiblich" },
    "Not specified": { code: 3, label: "Nicht angegeben" },
    Unknown: { code: 99, label: "Unbekannt" },
  },
  // item 5 — Ethnic category. `label` is the exact NPDA wording shown as evidence.
  ethnicity: {
    "White British": { code: "A", label: "Weiß - Britisch" },
    "White — Other": { code: "C", label: "Weiß - Jeder andere weiße Hintergrund" },
    "Mixed — White and Black Caribbean": { code: "D", label: "Gemischt - Weiß und Schwarz-Karibisch" },
    "Asian — Indian": { code: "H", label: "Asiatisch - Indisch" },
    "Asian — Pakistani": { code: "J", label: "Asiatisch - Pakistanisch" },
    "Asian — Bangladeshi": { code: "K", label: "Asiatisch - Bangladeschisch" },
    "Black Caribbean": { code: "M", label: "Schwarz - Karibisch" },
    "Black African": { code: "N", label: "Schwarz - Afrikanisch" },
  },
  // item 8 — Diabetes Type.
  diabetesType: {
    "Type 1": { code: 1, label: "Diabetes mellitus Typ 1" },
    "Type 2": { code: 2, label: "Diabetes mellitus Typ 2" },
  },
  // item 21 — Insulin regime at time of visit.
  insulinRegime: {
    "Insulin pump (CSII)": { code: 4, label: "eine eigenständige Insulinpumpe" },
    "MDI (basal-bolus)": { code: 3, label: "ein Basis-Bolus-Regime mit mehrfachen täglichen Injektionen (vier oder mehr Injektionen pro Tag)" },
    "Diet and metformin (no insulin)": { code: 1, label: "kein Insulin (mit Diät und Metformin behandelt)" },
  },
  // item 24 — CGM in use.
  cgm: {
    Yes: { code: 1, label: "verwendet einen kontinuierlichen Glukosesensor" },
    No: { code: 2, label: "verwendet keinen kontinuierlichen Glukosesensor" },
  },
  // 1 = Yes, 2 = No, 99 = Unknown — items 23, 48, 51 (labels not displayed).
  yesNo: { Yes: 1, No: 2, Unknown: 99 },
  // item 43 — Does the patient smoke and/or vape?
  smoking: {
    No: { code: 1, label: "Nichtraucher und Nichtdampfer" },
    Smokes: { code: 2, label: "aktueller Raucher (Nichtdampfer)" },
    Vapes: { code: 3, label: "aktueller Dampfer (Nichtraucher)" },
  },
  // item 33 — Retinal screening result.
  retinal: {
    "No retinopathy": { code: 1, label: "Normal" },
    "Background retinopathy": { code: 2, label: "Auffällig (Hintergrundretinopathie)" },
  },
  // item 55 — Reason for admission. Every modelled admission is acute DKA (= 1).
  admissionDka: { code: 1, label: "eine akute Aufnahme mit diabetischer Ketoazidose (DKA)" },
  // --- code→label maps keyed by the permitted-value code ---
  // item 6 — ADHD / ASD diagnosis.
  adhdAsd: { 1: "Ja, ADHS", 2: "Ja, ASS", 3: "Ja, sowohl ADHS als auch ASS", 4: "Nein, keines von beiden", 99: "Unbekannt" },
  // item 7 — Learning disability. Also items 25, 26, 42 (Yes/No/Unknown).
  yesNo99: { 1: "Ja", 2: "Nein", 99: "Unbekannt" },
  // item 11 — Reason for leaving service.
  leavingReason: { 1: "In den Erwachsenen-Diabetesdienst übergegangen", 2: "Aus dem Gebiet weggezogen", 3: "Sonstiges" },
  // item 22 — Other (non-insulin) blood-glucose-lowering medication.
  otherMed: { 1: "Keine Medikation", 2: "Nur Metformin", 3: "GLP-1-Agonist", 4: "SGLT2-Hemmer", 5: "Sonstiges", 99: "Unbekannt" },
  // item 36 — Albuminuria stage.
  albuminuriaStage: { 1: "Normoalbuminurie", 2: "Mikroalbuminurie", 3: "Makroalbuminurie", 99: "Unbekannt" },
  // item 40 — Thyroid treatment.
  thyroidTx: { 1: "Keine Schilddrüsentherapie", 2: "Thyroxin bei Hypothyreose", 3: "Thyreostatikum bei Hyperthyreose", 99: "Unbekannt" },
  // item 49 — Mental health appointment offered.
  mentalHealthAppt: { 1: "Angeboten und wahrgenommen", 2: "Angeboten und nicht wahrgenommen", 3: "Angeboten und abgelehnt", 4: "Nicht angeboten", 5: "Unterstützung der psychischen Gesundheit anderweitig in Anspruch genommen", 99: "Unbekannt" },
  // item 57 — DKA therapies given during the admission.
  dkaTherapy: { 1: "Hypertone Kochsalzlösung", 2: "Mannitol", 3: "Bikarbonat-Infusion", 4: "Keines der oben genannten" },
  // --- Epilepsy12 (Dataset 4) -----------------------------------------------
  // Seizure type read from the epilepsy clinic letter (interpretive). Keys are
  // the record's i.seizureType.v lookup values (keep English); `label` is the
  // displayed/evidence wording (translatable). The ECG KPI keys off whether the
  // type is convulsive.
  seizureType: {
    Convulsive: { code: "konvulsiv", label: "konvulsiv (generalisiert tonisch-klonisch / fokal zu bilateral)" },
    "Non-convulsive": { code: "nicht konvulsiv", label: "nicht konvulsiv (Absence / fokal bewusst erlebt)" },
    Absence: { code: "Absence", label: "Absence (nicht konvulsiv)" },
  },
};

// --- Short inline value labels ----------------------------------------------
const labels = {
  na: "k. A.",
  notRecorded: "Nicht dokumentiert",
  unavailable: "Nicht verfügbar",
  notNormalised: "Nicht normalisiert",
  naTransferred: "k. A. (verlegt)",
  notDone: "Nicht durchgeführt",
  notPerformed: "Nicht durchgeführt",
  // Displayed cord Yes/No cell values. These are ALSO matched in mockData.js
  // logic (e.g. r.ctgDone === labels.yes), so a translation MUST use the same
  // word for the cord record Yes/No values and for these labels.
  yes: "Ja",
  no: "Nein",
};

// --- Mock audit-detail strings (criteria + summary) -------------------------
const auditDetail = {
  databaseSummary: "Demografie, Aufnahmen und kodierte klinische Ereignisse für den Kohortenabgleich.",
  criteria: {
    age: { label: "Patientenalter", unit: "Jahre" },
    admissionDate: { label: "Aufnahmedatum" },
  },
};

const specValues = {
  condition: {
    cordBloodGasSampling: "Nabelschnur-Blutgasentnahme",
    neonatalAdmission: "Neonatale Aufnahme",
    acuteSoreThroat: "Akute Halsschmerzen",
    chestPain: "Brustschmerzen",
  },
  specialty: {
    neonatology: "Neonatologie",
    obstetrics: "Geburtshilfe",
    paediatrics: "Pädiatrie",
    ent: "HNO",
    cardiology: "Kardiologie",
    generalMedicine: "Allgemeinmedizin",
    emergencyMedicine: "Notfallmedizin",
  },
  ward: {
    nicu: "NICU",
    emergencyDepartment: "Notaufnahme",
    maternityUnit: "Entbindungsstation",
    wardPrefix: "Station",
  },
  admissionMethod: {
    emergency: "Notfall",
    elective: "Elektiv",
    transfer: "Verlegung",
    dayCase: "Tagesfall",
  },
  age: {
    neonates: "Neugeborene",
    paediatric: "Pädiatrisch",
    overPrefix: "Über",
    underPrefix: "Unter",
  },
  sex: {
    male: "Männlich",
    female: "Weiblich",
  },
  gestation: {
    minWeeks: "≥ 34 Wochen",
  },
  fallback: {
    customFilter: "Benutzerdefinierter Filter",
  },
};

// --- Right-panel explanation strings (FUNCTIONS; preserve ${…}) -------------
// Each function takes the args it interpolates and returns the user-visible
// explanation. Keyed by builder + field; translate the returned strings, keeping
// the interpolated values (codes, dates, patient codes) in place.
const explain = {
  // gasCell
  gasUnavailable: (code) => `Aus der geburtshilflichen Geburtszusammenfassung für ${code} — die arterielle Nabelschnurprobe war geronnen, sodass kein gültiges Nabelschnur-Blutgas dokumentiert wurde.`,
  gasLactateNotRecorded: (code) => `Das Nabelschnur-Blutgas-Panel für ${code} enthielt keinen Laktatwert.`,
  gasPanel: (code) => `Aus dem EHR-Nabelschnur-Blutgas-Panel für ${code} — Nabelarterien-pH, Basenüberschuss und Laktat.`,
  // repeatGasField
  repeatGasNone: (code, label) => `Für ${code} wurde kein wiederholtes Nabelschnur-Blutgas durchgeführt — das initiale Blutgas erforderte keines —, sodass ${label} nicht dokumentiert ist.`,
  repeatGasNotNormalised: (code, label) => `Das Nabelschnur-Laktat für ${code} hatte sich vor der Verlegung nicht normalisiert, sodass ${label} nicht dokumentiert ist.`,
  repeatGasValue: (code, label) => `Aus dem wiederholten Nabelschnur-Blutgas-Datensatz für ${code} — ${label}.`,
  // repeatGasField labels (the `label` arg passed into the three above)
  repeatGasLabelAge: "das Alter in Stunden beim wiederholten Blutgas",
  repeatGasLabelLactate: "das wiederholte Laktat",
  repeatGasLabelNormalised: "das Alter in Stunden, bei dem sich das Blutgas normalisierte",

  // makeCordAllCell
  cordPatient: (code) => `Der Patientencode, der ${code} in der EHR identifiziert.`,
  cordGestWeeks: (code) => `Aus dem EHR-Geburtsdatensatz für ${code} — Gestationsalter in vollendeten Wochen.`,
  cordGestDays: (code) => `Aus dem EHR-Geburtsdatensatz für ${code} — Gestationstage über die vollendeten Wochen hinaus.`,
  cordMaternalAge: (code) => `Aus den EHR-Demografiedaten für ${code} — mütterliches Alter bei Entbindung.`,
  cordParity: (code) => `Aus den EHR-Demografiedaten für ${code} — mütterliche Parität.`,
  cordFoetalMovements: (code) => `Aus der Schwangerenvorsorge-Notiz für ${code} — berichtete Kindsbewegungen.`,
  cordMaternalComorbidities: (code) => `Aus der Schwangerenvorsorge-Notiz für ${code} — dokumentierte mütterliche Komorbiditäten.`,
  cordMaternalComorbiditiesOther: (code) => `Aus der Schwangerenvorsorge-Notiz für ${code} — jede sonstige nennenswerte mütterliche Vorgeschichte.`,
  cordNormalScans: (code) => `Aus dem Schwangerenvorsorge-Sonografiedatensatz für ${code} — ob die Wachstumssonografien normal waren.`,
  cordNormalDopplers: (code) => `Aus dem Schwangerenvorsorge-Sonografiedatensatz für ${code} — ob die Nabelarterien-Dopplerbefunde normal waren.`,
  cordCtgDoneYes: (code) => `Aus dem intrapartalen Datensatz für ${code} — es wurde ein kontinuierliches CTG durchgeführt.`,
  cordCtgDoneNo: (code) => `Aus dem intrapartalen Datensatz für ${code} — Wehen mit intermittierender Auskultation überwacht; kein kontinuierliches CTG durchgeführt.`,
  cordLiquorMeconium: (code) => `Aus der Geburtszusammenfassung für ${code} — der Zustand des Fruchtwassers.`,
  cordChorioamnionitis: (code) => `Aus der Geburtszusammenfassung für ${code} — etwaige Chorioamnionitis.`,
  cordProm: (code) => `Aus der Schwangerenvorsorge-Notiz für ${code} — vorzeitiger Blasensprung über 18 Stunden.`,
  cordRffs: (code) => `Aus der Schwangerenvorsorge-Notiz für ${code} — Risikofaktoren für eine Sepsis.`,
  cordSentinelEvent: (code) => `Aus der Geburtszusammenfassung für ${code} — jedes intrapartale Sentinel-Ereignis.`,
  cordDelivery: (code) => `Aus dem EHR-Geburtsdatensatz für ${code} — Entbindungsmodus.`,
  cordBirthWeight: (code) => `Aus dem EHR-Geburtsdatensatz für ${code} — Geburtsgewicht in Gramm.`,
  cordApgar1: (code) => `Aus dem EHR-Geburtsdatensatz für ${code} — Apgar-Wert nach einer Minute.`,
  cordApgar5: (code) => `Aus dem EHR-Geburtsdatensatz für ${code} — Apgar-Wert nach fünf Minuten.`,
  cordApgar10: (code) => `Aus dem EHR-Geburtsdatensatz für ${code} — Apgar-Wert nach zehn Minuten.`,
  cordDccYes: (code) => `Aus der geburtshilflichen Geburtszusammenfassung und der Hebammen-Entbindungsnotiz für ${code} — beide dokumentieren ein verzögertes Abnabeln, sodass es als durchgeführt dokumentiert ist.`,
  cordDccNo: (code) => `Aus der geburtshilflichen Geburtszusammenfassung und der Hebammen-Entbindungsnotiz für ${code} — beide dokumentieren ein frühes Abklemmen der Nabelschnur, sodass kein verzögertes Abklemmen durchgeführt wurde.`,
  cordIntubated: (code) => `Aus dem Reanimationsprotokoll für ${code} — ob das Neugeborene bei Entbindung intubiert wurde.`,
  cordCompressions: (code) => `Aus dem Reanimationsprotokoll für ${code} — ob eine Herzdruckmassage durchgeführt wurde.`,
  cordDrugs: (code) => `Aus dem Reanimationsprotokoll für ${code} — etwaige verabreichte Reanimationsmedikamente.`,
  cordWard: (code) => `Aus dem EHR-Kontakt für ${code} — die Station zum Zeitpunkt des Audits.`,
  cordGasRepeatedYes: (code) => `Für ${code} wurde ein wiederholtes Nabelschnur-/Neugeborenen-Blutgas durchgeführt.`,
  cordGasRepeatedNo: (code) => `Für ${code} wurde kein wiederholtes Nabelschnur-/Neugeborenen-Blutgas durchgeführt.`,
  cordHypoglycaemia: (code) => `Aus der neonatalen Stoffwechselnotiz für ${code} — etwaige Hypoglykämie.`,
  cordAdmittedNicu: (code) => `Aus der NICU-Aufnahmetabelle für ${code} — ob das Neugeborene auf die neonatologische Station aufgenommen wurde.`,
  cordAgeDischargeHomeTransferred: (code) => `${code} wurde in das regionale Zentrum verlegt und nicht von dieser Station nach Hause entlassen, sodass das Alter bei Entlassung nach Hause hier nicht dokumentiert ist.`,
  cordAgeDischargeHome: (code) => `Aus dem Entlassungsdatensatz für ${code} — Alter in Tagen bei Entlassung nach Hause.`,
  cordUnitQuestionnaire: () => `Aus dem Audit-Governance-Datensatz auf Stationsebene — ob der Fragebogen auf Stationsebene ausgefüllt wurde.`,
  cordGuidelineCordGas: () => `Aus dem Audit-Governance-Datensatz auf Stationsebene — ob eine lokale Leitlinie zur Nabelschnur-Blutgasentnahme verfügbar ist.`,
  cordGuidelineFetalAcidosis: () => `Aus dem Audit-Governance-Datensatz auf Stationsebene — ob eine lokale Leitlinie zur fetalen Azidose verfügbar ist.`,

  // makeCordNicuCell
  nicuAdmitAge: (code) => `Aus dem NICU-Aufnahmedatensatz für ${code} — Alter in Stunden bei Aufnahme auf die neonatologische Station.`,
  nicuCooled: (code) => `Aus der NICU-Aufnahmenotiz für ${code} — ob eine therapeutische Kühlung durchgeführt wurde.`,
  nicuAgeCoolingNA: (code) => `Aus der NICU-Aufnahmenotiz für ${code} — eine therapeutische Kühlung war nicht indiziert, daher gibt es kein Alter bei Kühlung.`,
  nicuAgeCooling: (code) => `Aus der NICU-Aufnahmenotiz für ${code} — Alter in Stunden, bei dem die therapeutische Kühlung begann.`,
  nicuTransferredOut: (code) => `Aus dem NICU-Aufnahmedatensatz für ${code} — ob das Neugeborene auf eine andere Station verlegt wurde.`,
  // cfm explanation comes from the record (n.cfm.explanation), no function needed.
  nicuSeizures: (code) => `Aus dem neurologischen Befund für ${code} — ob Krampfanfälle dokumentiert wurden.`,
  nicuClinicalSeizures: (code) => `Aus dem neurologischen Befund für ${code} — ob klinische Krampfanfälle beobachtet wurden.`,
  nicuElectrographicSeizure: (code) => `Aus dem neurologischen Befund für ${code} — ob elektrografische Krampfanfälle dokumentiert wurden.`,
  nicuMriInjury: (code) => `Aus dem neurologischen Befund für ${code} — MRI-Befunde einer Schädigung.`,
  nicuDurationNicu: (code) => `Aus dem NICU-Aufnahmedatensatz für ${code} — Dauer der Aufnahme in Tagen.`,
  nicuAgeDischargeHomeTransferred: (code) => `${code} wurde auf eine andere Station verlegt und nicht von hier nach Hause entlassen, sodass das Alter bei Entlassung nach Hause nicht dokumentiert ist.`,
  nicuAgeDischargeHome: (code) => `Aus dem NICU-Entlassungsdatensatz für ${code} — Alter in Tagen bei Entlassung nach Hause.`,
  nicuFeeding: (code) => `Aus dem NICU-Entlassungsbericht für ${code} — Ernährungsmethode bei Entlassung.`,
  nicuAbnormalNeurology: (code) => `Aus dem NICU-Entlassungsbericht für ${code} — ob die Neurologie bei Entlassung auffällig war.`,

  // makeChestPainCell
  chestAge: (code) => `Aus dem EHR-Kontaktdatensatz für ${code} — Alter bei Vorstellung.`,
  chestComplaint: (code) => `Aus der Triage-Notiz für ${code} — die bei der Triage dokumentierte Vorstellungsbeschwerde.`,
  chestTroponinUnavailable: (code) => `Aus der Labornotiz für ${code} — die Blutprobe hämolysierte, sodass kein Troponin-Befund verfügbar ist.`,
  chestTroponin: (code) => `Aus dem EHR-Troponin-Befund für ${code} — erstes hochsensitives Troponin in ng/L.`,
  chestEcgMissing: () => "Bei dieser Vorstellung wurde kein ECG durchgeführt, sodass keine Befunde dokumentiert sind.",
  chestEcg: (code) => `Aus der kardiologischen Notiz für ${code} — die dokumentierten ECG-Befunde.`,
  chestTimeToEcgMissing: () => "Bei dieser Vorstellung wurde kein ECG durchgeführt, sodass es keine Zeit bis zum ersten ECG gibt.",
  chestTimeToEcg: (code) => `Aus dem EHR-ECG-Datensatz für ${code} — Minuten von der Ankunft bis zum ersten ECG.`,
  chestDiagnosis: (code) => `Aus den kardiologischen und Entlassungsberichtsnotizen für ${code} — die Arbeitsdiagnose bei der Untersuchung.`,
  chestDecision: (code) => `Aus der Entlassungsberichtsnotiz für ${code} — die Entscheidung zur Entlassung oder Aufnahme.`,

  // makeNpdaCell
  npdaPatient: (code) => `Aus den EHR-Demografiedaten für ${code} — die 10-stellige NHS-Nummer des Patienten.`,
  npdaDob: (code) => `Aus den EHR-Demografiedaten für ${code} — Geburtsdatum, formatiert als DD/MM/YYYY.`,
  npdaSex: (code, sex, sexCode) => `Aus den EHR-Demografiedaten für ${code} — bei Geburt zugewiesenes Geschlecht dokumentiert als ${sex}, kodiert als ${sexCode} gemäß NPDA-Datensatz (1 = Male, 2 = Female).`,
  npdaEthnicity: (code, label, ethCode) => `Aus den EHR-Demografiedaten für ${code} — ethnische Zugehörigkeit dokumentiert als '${label}', kodiert als ${ethCode} gemäß NPDA-Liste der ethnischen Zugehörigkeit.`,
  npdaDiabetesType: (code, label, dtCode) => `Aus dem EHR-Diabetes-Diagnosedatensatz für ${code} — ${label}, kodiert als ${dtCode} gemäß NPDA-Datensatz.`,
  npdaDiagnosisDate: (code) => `Aus dem EHR-Diabetes-Diagnosedatensatz für ${code} — Diagnosedatum, formatiert als DD/MM/YYYY.`,
  npdaVisitDate: (code) => `Aus dem EHR-Klinik-Beobachtungspanel für ${code} — Termin-/Vorstellungsdatum, formatiert als DD/MM/YYYY.`,
  npdaHeight: (code) => `Aus dem EHR-Klinik-Beobachtungspanel für ${code} — Körpergröße in cm (NPDA-Format 999.9).`,
  npdaWeight: (code) => `Aus dem EHR-Klinik-Beobachtungspanel für ${code} — Gewicht in kg (NPDA-Format 999.9).`,
  npdaHba1c: (code, value) => `Aus dem EHR-Klinik-Beobachtungspanel für ${code} — HbA1c von ${value} (NPDA-Format 999.9); ein Wert zwischen 20 und 195 wird gemäß NPDA-Datensatz als mmol/mol behandelt.`,
  npdaInsulinRegime: (code, label, mCode) => `Aus der Diabetesambulanz-Notiz für ${code} — ${label}, kodiert als ${mCode} gemäß NPDA-Insulinregime-Werten.`,
  npdaCgm: (code, label, mCode) => `Aus der Diabetesambulanz-Notiz für ${code} — ${label}, kodiert als ${mCode} (1 = Yes, 2 = No).`,
  npdaLifestyle: (code, recommended, mCode) => `Aus der Diabetesambulanz-Notiz für ${code} — eine Lebensstil- und Ernährungsumstellung wurde ${recommended ? "empfohlen" : "nicht empfohlen"}, kodiert als ${mCode} (1 = Yes, 2 = No).`,
  npdaSystolic: (code) => `Aus dem EHR-Klinik-Beobachtungspanel für ${code} — systolischer Blutdruck in mmHg (NPDA-Format 999).`,
  npdaDiastolic: (code) => `Aus dem EHR-Klinik-Beobachtungspanel für ${code} — diastolischer Blutdruck in mmHg (NPDA-Format 999).`,
  npdaCholesterol: (code) => `Aus dem EHR-Klinik-Beobachtungspanel für ${code} — Gesamtcholesterin in mmol/l (NPDA-Format 99.9).`,
  npdaAcrNotDone: (code) => `Albumin im Urin (ACR) wurde für ${code} bei diesem Besuch nicht durchgeführt, sodass kein Wert dokumentiert ist.`,
  npdaAcr: (code) => `Aus dem EHR-Klinik-Beobachtungspanel für ${code} — Albumin-Kreatinin-Verhältnis im Urin (ACR) in mg/mmol (NPDA-Format 9999.9).`,
  npdaFootDateNotDue: (code) => `Die Fußuntersuchung ist ab dem Alter von 12 Jahren ein verpflichtender Versorgungsprozess; ${code} ist jünger, sodass keine durchgeführt wurde und das Datum leer bleibt.`,
  npdaFootDate: (code) => `Aus dem Diabetes-Screeningdatensatz für ${code} — Datum der Fußuntersuchung, formatiert als DD/MM/YYYY.`,
  npdaRetinalDateNotDue: (code) => `Das Netzhaut-Screening ist ab dem Alter von 12 Jahren ein verpflichtender Versorgungsprozess; ${code} ist jünger, sodass keines durchgeführt wurde und das Datum leer bleibt.`,
  npdaRetinalDate: (code) => `Aus dem Diabetes-Screeningdatensatz für ${code} — Datum des Netzhaut-Screenings, formatiert als DD/MM/YYYY.`,
  npdaRetinalResultNone: (code) => `Für ${code} wurde kein Netzhaut-Screening durchgeführt (unter 12), sodass es kein zu kodierendes Ergebnis gibt.`,
  npdaRetinalResult: (code, label, mCode) => `Aus dem Diabetes-Screeningdatensatz für ${code} — das Ergebnis des Netzhaut-Screenings war ${label}, kodiert als ${mCode} (1 = Normal, 2 = Auffällig).`,
  npdaPsychScreen: (code) => `Aus dem Diabetes-Screeningdatensatz für ${code} — Datum der jährlichen psychologischen Screening-Beurteilung, formatiert als DD/MM/YYYY.`,
  npdaPsychOutcome: (code, required, mCode) => `Aus der psychologischen Screening-Notiz für ${code} — zusätzliche psychologische Unterstützung außerhalb der Routineversorgung war ${required ? "erforderlich" : "nicht erforderlich"}, kodiert als ${mCode} (1 = Yes, 2 = No).`,
  npdaSmoking: (code, label, mCode) => `Aus der Jahreskontroll-Notiz für ${code} — ${label}, kodiert als ${mCode} gemäß NPDA-Werten für Rauchen/Dampfen.`,
  npdaDietitian: (code, offered, mCode) => `Aus der Diabetesambulanz-Notiz für ${code} — ein zusätzlicher Termin bei der pädiatrischen Diätassistenz wurde ${offered ? "angeboten" : "nicht angeboten"}, kodiert als ${mCode} (1 = Yes, 2 = No).`,
  npdaCarbCountingNA: (code) => `Die Level-3-Kohlenhydratzählung gilt für Patienten unter Injektionen oder einer Pumpe; ${code} wird mit Diät und Metformin behandelt, sodass sie nicht zutreffend ist und das Datum leer bleibt.`,
  npdaCarbCounting: (code) => `Aus dem Diabetes-Schulungsdatensatz für ${code} — Datum, an dem die Schulung zur Level-3-Kohlenhydratzählung erhalten wurde, formatiert als DD/MM/YYYY.`,
  npdaAdmissionReasonDka: (code, label, dkaCode) => `Aus der Aufnahmenotiz für ${code} — ${label}, kodiert als ${dkaCode} gemäß NPDA-Werten für den Aufnahmegrund (1 = Akute DKA).`,
  npdaAdmissionReasonNone: (code) => `Für ${code} wurde im Auditjahr keine diabetesbezogene Krankenhausaufnahme dokumentiert, sodass es keinen Code für den Aufnahmegrund gibt.`,
  npdaPostcode: (code) => `Aus den EHR-Demografiedaten für ${code} — Postleitzahl der üblichen Adresse in Großbuchstaben mit korrekter Abstandsangabe.`,
  npdaAdhdAsd: (code, label, adhdCode) => `Aus den EHR-Demografiedaten für ${code} — ${label}, kodiert als ${adhdCode} gemäß NPDA-ADHS/ASS-Werten.`,
  npdaLearningDisability: (code, label, ldCode) => `Aus den EHR-Demografiedaten für ${code} — Lernbehinderung ${label}, kodiert als ${ldCode} (1 = Yes, 2 = No).`,
  npdaLeavingDateNone: (code) => `${code} blieb während des gesamten Auditjahres unter Betreuung des pädiatrischen Diabetesdienstes, sodass kein Austrittsdatum dokumentiert ist.`,
  npdaLeavingDate: (code) => `Aus den EHR-Demografiedaten für ${code} — Datum, an dem der Patient den Dienst verlassen hat, formatiert als DD/MM/YYYY.`,
  npdaLeavingReasonNone: (code) => `${code} hat den Dienst im Auditjahr nicht verlassen, sodass es keinen Code für den Austrittsgrund gibt.`,
  npdaLeavingReason: (code, label, lrCode) => `Aus den EHR-Demografiedaten für ${code} — ${label}, kodiert als ${lrCode} gemäß NPDA-Werten für den Austrittsgrund.`,
  npdaDeathDate: (code) => `Für ${code} wurde im Auditjahr kein Tod dokumentiert, sodass das Sterbedatum leer bleibt.`,
  npdaGpPractice: (code) => `Aus den EHR-Demografiedaten für ${code} — registrierter Hausarztpraxis-Code (NPDA-Format X99999).`,
  npdaPduNumber: (code) => `Aus der Stationsregistrierung für ${code} — die Nummer der pädiatrischen Diabetesstation (PDU), ein 3-stelliger Code, der von jedem an dieser Station betreuten Kind gemeinsam genutzt wird.`,
  npdaObsDateHtWt: (code) => `Aus dem EHR-Klinik-Beobachtungspanel für ${code} — kombiniertes Messdatum für Größe/Gewicht (beim Ambulanzbesuch erhoben), formatiert als DD/MM/YYYY.`,
  npdaObsDateHba1c: (code) => `Aus dem EHR-Klinik-Beobachtungspanel für ${code} — Datum, an dem der HbA1c durchgeführt wurde (innerhalb des Auditjahres), formatiert als DD/MM/YYYY.`,
  npdaOtherMed: (code, label, omCode) => `Aus dem EHR-Medikationsdatensatz für ${code} — ${label}, kodiert als ${omCode} gemäß NPDA-Werten für Nicht-Insulin-Medikation.`,
  npdaKetoneTesting: (code, label, ktCode) => `Aus dem Diabetes-Screeningdatensatz für ${code} — verwendet oder geschult im Umgang mit Blutketon-Testgeräten: ${label}, kodiert als ${ktCode} (1 = Yes, 2 = No).`,
  npdaImmunotherapyNA: (code) => `Der Immuntherapie-Eintrag wird nur für Patienten ausgefüllt, die innerhalb des Auditjahres neu mit Typ-1-Diabetes diagnostiziert wurden; ${code} erfüllt dies nicht, sodass er leer bleibt.`,
  npdaImmunotherapy: (code, label, imCode) => `Aus dem Diabetes-Diagnosedatensatz für ${code} — Immuntherapie rund um die Stadium-3-Typ-1-Diagnose: ${label}, kodiert als ${imCode} (1 = Yes, 2 = No).`,
  npdaImmunotherapyDateNone: (code) => `${code} erhielt keine Immuntherapie, sodass es kein zu dokumentierendes Startdatum gibt.`,
  npdaImmunotherapyDate: (code) => `Aus dem Diabetes-Diagnosedatensatz für ${code} — Datum des Immuntherapiebeginns, formatiert als DD/MM/YYYY.`,
  npdaObsDateBP: (code) => `Aus dem EHR-Klinik-Beobachtungspanel für ${code} — Messdatum des Blutdrucks (beim Ambulanzbesuch erhoben), formatiert als DD/MM/YYYY.`,
  npdaObsDateAcrNone: (code) => `Albumin im Urin (ACR) wurde für ${code} bei diesem Besuch nicht durchgeführt, sodass es kein Messdatum gibt.`,
  npdaObsDateAcr: (code) => `Aus dem EHR-Klinik-Beobachtungspanel für ${code} — Datum, an dem der ACR im Urin durchgeführt wurde, formatiert als DD/MM/YYYY.`,
  npdaAlbuminuriaStageNone: (code) => `Für ${code} wurde kein ACR im Urin gemessen, sodass das Albuminurie-Stadium nicht kodiert werden kann.`,
  npdaAlbuminuriaStage: (code, acrValue, label, alCode) => `Interpretiert aus dem ACR im Urin von ${acrValue} mg/mmol für ${code} — ${label}, kodiert als ${alCode} (ein ACR unter 3 mg/mmol ist eine Normoalbuminurie).`,
  npdaObsDateChol: (code) => `Aus dem EHR-Klinik-Beobachtungspanel für ${code} — Datum, an dem das Gesamtcholesterin durchgeführt wurde, formatiert als DD/MM/YYYY.`,
  npdaThyroidDateNA: (code) => `Die jährliche Schilddrüsenfunktionsüberwachung ist ein Versorgungsprozess bei Typ-1-Diabetes; ${code} hat Typ-2-Diabetes, sodass kein Schilddrüsen-Messdatum dokumentiert ist.`,
  npdaThyroidDate: (code) => `Aus dem Diabetes-Screeningdatensatz für ${code} — Datum der jährlichen Schilddrüsenfunktionstestung, formatiert als DD/MM/YYYY.`,
  npdaThyroidTreatmentNA: (code) => `Die Schilddrüsenbehandlung wird zusammen mit der jährlichen Schilddrüsenkontrolle bei Typ 1 dokumentiert; ${code} hat Typ-2-Diabetes, sodass sie leer bleibt.`,
  npdaThyroidTreatment: (code, label, ttCode) => `Aus dem Diabetes-Screeningdatensatz für ${code} — ${label}, kodiert als ${ttCode} gemäß NPDA-Werten für die Schilddrüsenbehandlung.`,
  npdaCoeliacDateNA: (code) => `Das Datum des Zöliakie-Screenings wird nur für Patienten dokumentiert, die innerhalb des Auditjahres diagnostiziert wurden; ${code} wurde früher diagnostiziert, sodass es leer bleibt.`,
  npdaCoeliacDate: (code) => `Aus dem Diabetes-Screeningdatensatz für ${code} — Datum des serologischen Zöliakie-Screenings, formatiert als DD/MM/YYYY.`,
  npdaGlutenFree: (code, label, gfCode) => `Aus dem Diabetes-Screeningdatensatz für ${code} — eine glutenfreie Ernährung empfohlen/verordnet: ${label}, kodiert als ${gfCode} (ein 'Yes' wird als Diagnose einer Zöliakie interpretiert).`,
  npdaSmokingCessationDateNone: (code) => `${code} ist kein aktueller Raucher oder Dampfer, sodass keine Raucherentwöhnungsberatung fällig war und das Datum leer bleibt.`,
  npdaSmokingCessationDate: (code) => `Aus dem Diabetes-Screeningdatensatz für ${code} — Datum, an dem eine Raucherentwöhnungsberatung/-überweisung angeboten wurde, formatiert als DD/MM/YYYY.`,
  npdaFluDateNone: (code) => `Für ${code} wurde im Auditjahr keine Influenza-Impfung dokumentiert, sodass dieser Versorgungsprozess als unvollständig behandelt wird und das Datum leer bleibt.`,
  npdaFluDate: (code) => `Aus dem Diabetes-Screeningdatensatz für ${code} — Datum, an dem eine Influenza-Impfung empfohlen wurde, formatiert als DD/MM/YYYY.`,
  npdaSickDayDate: (code) => `Aus dem Diabetes-Screeningdatensatz für ${code} — Datum, an dem die Beratung zu den 'Krankheitstage-Regeln' erfolgte (bei der Jahreskontrolle erneut aufgegriffen), formatiert als DD/MM/YYYY.`,
  npdaMentalHealthAppt: (code, label, mhCode) => `Aus dem psychologischen Datensatz für ${code} — ${label}, kodiert als ${mhCode} gemäß NPDA-Werten für Termine zur psychischen Gesundheit.`,
  npdaDietitianApptDateNone: (code) => `${code} hat keinen zusätzlichen Diätassistenz-Termin wahrgenommen, sodass das Termindatum leer bleibt.`,
  npdaDietitianApptDate: (code) => `Aus dem Diabetes-Schulungsdatensatz für ${code} — Datum des zusätzlichen pädiatrischen Diätassistenz-Termins, formatiert als DD/MM/YYYY.`,
  npdaAdmissionStartNone: (code) => `Für ${code} wurde im Auditjahr keine diabetesbezogene Aufnahme dokumentiert, sodass es kein Aufnahmebeginn-Datum gibt.`,
  npdaAdmissionStart: (code) => `Aus dem Krankenhaus-Aufnahmedatensatz für ${code} — Beginn des Krankenhausaufenthalts, formatiert als DD/MM/YYYY.`,
  npdaAdmissionDischargeNone: (code) => `Für ${code} wurde im Auditjahr keine diabetesbezogene Aufnahme dokumentiert, sodass es kein Entlassungsdatum gibt.`,
  npdaAdmissionDischarge: (code) => `Aus dem Krankenhaus-Aufnahmedatensatz für ${code} — Ende des Krankenhausaufenthalts, formatiert als DD/MM/YYYY.`,
  npdaAdmissionReasonOtherNoAdmission: (code) => `Für ${code} wurde keine Aufnahme dokumentiert, sodass es keinen Freitext-Grund gibt.`,
  npdaAdmissionReasonOther: (code) => `Der Freitext-Grund ist nur verpflichtend, wenn 'Sonstige Ursachen' ausgewählt ist; die Aufnahme von ${code} wurde als DKA kodiert, sodass er leer bleibt.`,
  npdaDkaTherapiesNone: (code) => `Für ${code} wurde keine DKA-Aufnahme dokumentiert, sodass es keine zu dokumentierenden DKA-Therapien gibt.`,
  npdaDkaTherapies: (code, label, dkaCode) => `Aus dem Krankenhaus-Aufnahmedatensatz für ${code} — erhaltene DKA-Therapien: ${label}, kodiert als ${dkaCode} gemäß NPDA-Werten für DKA-Therapien.`,
  npdaInitialPhNone: (code) => `Für ${code} wurde kein Aufnahme-Blutgas dokumentiert, sodass es keinen initialen pH gibt.`,
  npdaInitialPh: (code) => `Aus dem Krankenhaus-Aufnahmedatensatz für ${code} — initialer (erster dokumentierter) pH bei Aufnahme (NPDA-Format 0.00).`,
  npdaInitialBicarbNone: (code) => `Für ${code} wurde kein Aufnahme-Blutgas dokumentiert, sodass es kein initiales Standardbikarbonat gibt.`,
  npdaInitialBicarb: (code) => `Aus dem Krankenhaus-Aufnahmedatensatz für ${code} — initiales Standardbikarbonat bei Aufnahme in mmol/l (NPDA-Format 00.0).`,

  // --- Epilepsy12 (Dataset 4) ----------------------------------------------
  epiPatient: (code) => `Aus den KIS-Stammdaten für ${code} — die 10-stellige NHS-Nummer der Patientin/des Patienten.`,
  epiDob: (code) => `Aus den KIS-Stammdaten für ${code} — Geburtsdatum, formatiert als DD/MM/YYYY.`,
  epiSex: (code, sex, sexCode) => `Aus den KIS-Stammdaten für ${code} — bei Geburt zugewiesenes Geschlecht dokumentiert als ${sex === "Male" ? "Männlich" : "Weiblich"}, kodiert als ${sexCode} (1 = Männlich, 2 = Weiblich).`,
  epiAgeAtAssessment: (code, age) => `Aus dem Epilepsie-Versorgungsdatensatz für ${code} — Alter ${age} Jahre bei der ersten pädiatrischen Untersuchung; die Kohorte umfasst Kinder und Jugendliche bis einschließlich 18 Jahre.`,
  epiReferralDate: (code) => `Aus dem Epilepsie-Versorgungsdatensatz für ${code} — Datum des Eingangs der Überweisung, formatiert als DD/MM/YYYY.`,
  epiFirstAssessmentDate: (code, days) => `Aus dem Epilepsie-Versorgungsdatensatz für ${code} — erste pädiatrische Untersuchung ${days} Tage nach der Überweisung (KPI-1-Ziel: innerhalb von 14 Tagen), formatiert als DD/MM/YYYY.`,
  epiExpertise: (code, seen, mhCode) => `Aus dem Epilepsie-Ambulanzbrief für ${code} — die erste Untersuchung wurde ${seen ? "" : "nicht "}von einer Pädiaterin/einem Pädiater mit Epilepsie-Expertise durchgeführt (KPI 1), dokumentiert als ${mhCode === "Yes" ? "Ja" : "Nein"}.`,
  epiEsnInputDate: (code) => `Aus dem Epilepsie-Versorgungsdatensatz für ${code} — Datum der ersten Mitbetreuung durch eine Epilepsie-Fachpflegekraft (ESN) (KPI-2-Ziel: innerhalb des ersten Betreuungsjahres), formatiert als DD/MM/YYYY.`,
  epiEsnInputNotDone: (code) => `Für ${code} ist im ersten Betreuungsjahr keine Mitbetreuung durch eine Epilepsie-Fachpflegekraft (ESN) dokumentiert, sodass dieser KPI unvollständig ist und das Datum leer bleibt.`,
  epiMriIndicated: (code, indicated) => `Aus dem Epilepsie-Versorgungsdatensatz für ${code} — eine kraniale MRT war klinisch ${indicated ? "" : "nicht "}indiziert; der KPI „MRT innerhalb von 6 Wochen" gilt nur bei bestehender Indikation.`,
  epiMriRequestNA: (code) => `Für ${code} war keine kraniale MRT indiziert, sodass keine Anforderung gestellt wurde und das Datum leer bleibt.`,
  epiMriRequestDate: (code) => `Aus dem Epilepsie-Versorgungsdatensatz für ${code} — Datum der Anforderung der kranialen MRT, formatiert als DD/MM/YYYY.`,
  epiMriPerformedNA: (code) => `Für ${code} war keine kraniale MRT indiziert, sodass keine durchgeführt wurde und das Datum leer bleibt.`,
  epiMriPerformedNotDone: (code) => `Für ${code} wurde eine kraniale MRT angefordert, aber noch nicht durchgeführt, sodass dieser KPI offen ist und das Datum leer bleibt.`,
  epiMriPerformedDate: (code, days) => `Aus dem Radiologie-Datensatz für ${code} — kraniale MRT ${days} Tage nach der Anforderung durchgeführt (KPI-5-Ziel: innerhalb von 42 Tagen), formatiert als DD/MM/YYYY.`,
  epiSeizureType: (code, label, stCode) => `Aus dem Epilepsie-Ambulanzbrief für ${code} — die Anfälle sind ${label}, dokumentiert als ${stCode}; der EKG-KPI gilt für konvulsive Anfälle.`,
  epiEcgNA: (code) => `${code} hat keine konvulsiven Anfälle, sodass ein EKG nicht Teil der erforderlichen Abklärung ist und das Datum leer bleibt.`,
  epiEcgNotDone: (code) => `${code} hat konvulsive Anfälle und sollte daher innerhalb des ersten Jahres ein EKG erhalten; es ist jedoch keines dokumentiert, sodass dieser KPI unvollständig ist und das Datum leer bleibt.`,
  epiEcgDate: (code) => `Aus dem kardiologischen Datensatz für ${code} — Datum der EKG-Durchführung (KPI 4, konvulsive Anfälle), formatiert als DD/MM/YYYY.`,
  epiMhScreeningDate: (code) => `Aus dem Epilepsie-Versorgungsdatensatz für ${code} — Datum des abgeschlossenen Screenings der psychischen Gesundheit (KPI 6, innerhalb des ersten Betreuungsjahres), formatiert als DD/MM/YYYY.`,
  epiMhScreeningNotDone: (code) => `Für ${code} ist im ersten Betreuungsjahr kein Screening der psychischen Gesundheit dokumentiert, sodass dieser KPI unvollständig ist und das Datum leer bleibt.`,
  epiMhProblem: (code, identified, mhCode) => `Aus der Notiz zum Screening der psychischen Gesundheit für ${code} — beim Screening wurde ${identified ? "" : "kein "}psychisches Problem festgestellt (KPI 6), dokumentiert als ${mhCode === "Yes" ? "Ja" : "Nein"}.`,
  epiMhSupportProvided: (code, provided, mhCode) => `Aus der Notiz zum Screening der psychischen Gesundheit für ${code} — nach Feststellung eines Problems wurde ${provided ? "" : "keine "}psychosoziale Unterstützung geleistet (KPI 7), dokumentiert als ${mhCode === "Yes" ? "Ja" : "Nein"}.`,
  epiMhSupportNA: (code) => `Für ${code} wurde kein psychisches Problem festgestellt, sodass der KPI zur geleisteten Unterstützung (KPI 7) nicht zutrifft und die Zelle leer bleibt.`,
  epiCarePlanDate: (code) => `Aus dem Epilepsie-Versorgungsdatensatz für ${code} — Datum der Vereinbarung des umfassenden Behandlungsplans (KPI-9-Ziel: bis zum 12. Monat), formatiert als DD/MM/YYYY.`,
  epiCarePlanNotDone: (code) => `Für ${code} ist bis zum 12. Monat kein umfassender Behandlungsplan dokumentiert, sodass dieser KPI unvollständig ist und das Datum leer bleibt.`,
  epiOnValproate: (code, on) => `Aus dem Verordnungsdatensatz für ${code} — der Patientin/dem Patienten ist ${on ? "derzeit Natriumvalproat verordnet" : "kein Natriumvalproat verordnet"}.`,
  epiOnTopiramate: (code, on) => `Aus dem Verordnungsdatensatz für ${code} — der Patientin/dem Patienten ist ${on ? "derzeit Topiramat verordnet" : "kein Topiramat verordnet"}.`,
  epiPppNA: (code) => `Das Schwangerschaftsverhütungsprogramm (KPI 8) gilt nur für weibliche Personen ab 12 Jahren unter Valproat oder Topiramat; ${code} erfüllt diese Kriterien nicht, sodass es nicht zutrifft und die Zelle leer bleibt.`,
  epiPppInPlace: (code, inPlace) => `Aus dem Epilepsie-Versorgungsdatensatz für ${code} — für diese gebärfähige weibliche Person unter Valproat/Topiramat ${inPlace ? "besteht ein Schwangerschaftsverhütungsprogramm" : "besteht KEIN Schwangerschaftsverhütungsprogramm"} (bzw. eine Risikoaufklärungserklärung) (KPI 8, sicherheitskritisch).`,

  // --- Major trauma (Dataset 5) --------------------------------------------
  traPatient: (code) => `Aus den KIS-Stammdaten für ${code} — die 10-stellige NHS-Nummer der Patientin/des Patienten.`,
  traDob: (code) => `Aus den KIS-Stammdaten für ${code} — Geburtsdatum, formatiert als DD/MM/YYYY.`,
  traSex: (code, sex, sexCode) => `Aus den KIS-Stammdaten für ${code} — bei Geburt zugewiesenes Geschlecht dokumentiert als ${sex === "Male" ? "Männlich" : "Weiblich"}, kodiert als ${sexCode} (1 = Männlich, 2 = Weiblich).`,
  traAgeYears: (code, age) => `Aus dem Traumaregister-Datensatz für ${code} — Alter ${age} Jahre; die pädiatrische Schwerverletzten-Kohorte umfasst Kinder unter 16 Jahren.`,
  traIss: (code, iss, level) => `Aus dem Traumaregister-Datensatz für ${code} — Injury Severity Score von ${iss}; der BPT zahlt einen zweistufigen Zuschlag, Stufe 1 ab ISS ≥9 und Stufe 2 ab ISS ≥16 (${level === "Level 2" ? "Stufe 2" : level === "Level 1" ? "Stufe 1" : "unter Stufe 1"}).`,
  traAis3plus: (code, yes) => `Aus dem Traumaregister-Datensatz für ${code} — die Patientin/der Patient ${yes ? "weist mindestens eine AIS-3+-Verletzung auf" : "weist keine AIS-3+-Verletzung auf"}, das Einschlusskriterium des NMTR.`,
  traEdArrival: (code) => `Aus dem Notaufnahme-Datensatz für ${code} — Datum und Uhrzeit des Eintreffens in der Notaufnahme, verwendet als Startzeitpunkt für die Zeitmessungen der Akutphase.`,
  traDischargeDate: (code) => `Aus dem Traumaregister-Datensatz für ${code} — Entlassungsdatum, formatiert als DD/MM/YYYY; ab diesem Datum läuft die BPT-Einreichungsfrist.`,
  traNmtrSubmitted: (code, yes) => `Aus dem Traumaregister-Datensatz für ${code} — der Fall wurde ${yes ? "" : "nicht "}an das National Major Trauma Registry übermittelt (C1).`,
  traDatasetComplete: (code, yes) => `Aus dem Traumaregister-Datensatz für ${code} — der NMTR-Datensatz ist für diesen Fall ${yes ? "vollständig" : "unvollständig"} (C1).`,
  traSubmissionDate: (code, days) => `Aus dem Traumaregister-Datensatz für ${code} — ${days} Tage nach Entlassung übermittelt (BPT-Auslöseziel: innerhalb von 25 Tagen), formatiert als DD/MM/YYYY.`,
  traTeamActivated: (code, yes) => `Aus dem Notaufnahme-Datensatz für ${code} — für diese Aufnahme wurde ${yes ? "" : "kein "}Trauma-Team alarmiert (C2, Stufe 2).`,
  traConsultantPresent: (code, present) => `Aus dem Notaufnahme-Datensatz für ${code} — bei der Schockraumaufnahme war ${present ? "" : "keine "}Fachärztin/kein Facharzt anwesend (C2, Stufe 2).`,
  traConsultantArrival: (code, min) => `Aus dem Notaufnahme-Datensatz für ${code} — die Fachärztin/der Facharzt traf ${min} Minuten nach Eintreffen ein (C2-Ziel: fachärztliche Anwesenheit innerhalb von 5 Minuten, Stufe 2 / ISS ≥16).`,
  traConsultantArrivalNA: (code) => `Der Standard der fachärztlich geleiteten Schockraumaufnahme (C2) ist ein Kriterium der Stufe 2 und gilt ab ISS ≥16; ${code} liegt unter diesem Schwellenwert, sodass er nicht zutrifft und die Zelle leer bleibt.`,
  traGcs: (code, gcs) => `Aus dem Notaufnahme-Datensatz für ${code} — Glasgow Coma Scale von ${gcs} bei Eintreffen; die Kriterien zu CT-Schädel und Atemwegssicherung richten sich nach diesem Wert.`,
  traHeadInjury: (code, yes) => `Aus dem Traumaregister-Datensatz für ${code} — es liegt ${yes ? "ein" : "kein"} Schädel-Hirn-Trauma (AIS 1+) vor; das Kriterium „CT-Schädel innerhalb von 60 Minuten" gilt nur bei entsprechend qualifizierenden Kopfverletzungen.`,
  traCtHead: (code, min) => `Aus dem Radiologie-Datensatz für ${code} — CT-Schädel ${min} Minuten nach Eintreffen durchgeführt (C3-Ziel: innerhalb von 60 Minuten, Stufe 2), Angabe in Minuten.`,
  traCtHeadNAnoHead: (code) => `${code} hat kein Schädel-Hirn-Trauma, sodass ein CT-Schädel nicht Teil der erforderlichen Abklärung ist und die Zelle leer bleibt.`,
  traCtHeadNAnotEligible: (code) => `Der Standard „CT-Schädel innerhalb von 60 Minuten" (C3) gilt für Kopfverletzungen der Stufe 2 mit GCS ≤13; ${code} erfüllt diese Kriterien nicht, sodass er nicht zutrifft und die Zelle leer bleibt.`,
  traTxaIndicated: (code, yes) => `Aus dem Traumaregister-Datensatz für ${code} — Tranexamsäure war bei massiver Blutung ${yes ? "" : "nicht "}indiziert; das Kriterium „TXA innerhalb von 1 Stunde" gilt nur bei bestehender Indikation.`,
  traTxaGiven: (code, given) => `Aus dem Medikationsdatensatz für ${code} — Tranexamsäure wurde ${given ? "" : "nicht "}verabreicht (C4, Stufe 2).`,
  traTxaMin: (code, min) => `Aus dem Medikationsdatensatz für ${code} — Tranexamsäure ${min} Minuten nach dem Trauma verabreicht (C4-Ziel: innerhalb von 60 Minuten, Stufe 2), Angabe in Minuten.`,
  traTxaNAnotIndicated: (code) => `Für ${code} war Tranexamsäure nicht indiziert, sodass keine verabreicht wurde und die Zelle leer bleibt.`,
  traIntubationConsidered: (code, considered, val) => `Aus der Reanimationsnotiz für ${code} — Atemwegsmanagement/Intubation wurde im Rahmen der Erstuntersuchung ${considered ? "" : "nicht "}erwogen (C5, qualifizierend bei GCS <9), dokumentiert als ${val === "Yes" ? "Ja" : "Nein"}.`,
  traAirwayMin: (code, min) => `Aus der Reanimationsnotiz für ${code} — Atemwegssicherung/Intubation ${min} Minuten nach Eintreffen erwogen (C5-Ziel: innerhalb von 30 Minuten bei GCS <9, Stufe 1), Angabe in Minuten.`,
  traAirwayNA: (code) => `Der Standard „Atemwegssicherung innerhalb von 30 Minuten erwogen" (C5) gilt für Fälle mit GCS <9; ${code} erreicht diesen Schwellenwert nicht, sodass er nicht zutrifft und die Zelle leer bleibt.`,
  traRehabNeedsAssessed: (code, yes) => `Aus dem Traumaregister-Datensatz für ${code} — der Rehabilitationsbedarf wurde während des Aufenthalts ${yes ? "" : "nicht "}erhoben (C6, ISS ≥9).`,
  traRehabPrescription: (code, issued, val) => `Aus der Rehabilitations-/Entlassungsnotiz für ${code} — eine Rehabilitationsverordnung wurde ${issued ? "" : "NICHT "}mit den Kernkomponenten im NMTR ausgestellt und an die Patientin/den Patienten, den Hausarzt und den weiterbehandelnden Leistungserbringer weitergegeben (C6, ISS ≥9), dokumentiert als ${val === "Yes" ? "Ja" : "Nein"}.`,
  traRehabNA: (code) => `Der Standard zur Rehabilitationsverordnung (C6) gilt für die Kohorte mit ISS ≥9; ${code} liegt unter diesem Schwellenwert, sodass er nicht zutrifft und die Zelle leer bleibt.`,
};

// --- Blocked-cell reason_detail (CPH009 age-at-discharge) --------------------
const blockedReason = {
  cordAgeDischargeHome:
    "CPH009 wurde an Tag 7 in das regionale Kühlungs- und Neurologiezentrum verlegt und nie von dieser Station nach Hause entlassen, sodass kein Alter bei Entlassung nach Hause dokumentiert ist (cord_ph_birth_records und der Verlegungsbericht durchsucht).",
  epilepsyMriPerformed:
    "Die kraniale MRT von EPI007 wurde angefordert, aber im verlegenden Haus durchgeführt, und der Befund ist noch nicht in das EHR zurückgelangt, sodass kein Durchführungsdatum der MRT dokumentiert ist (radiology_results und der Verlegungsbericht wurden durchsucht).",
  traumaConsultantArrival:
    "TRA009 war eine Verlegung in den Schockraum und der Zeitstempel des fachärztlichen Eintreffens wurde nicht im strukturierten Notaufnahme-Datensatz erfasst; die Traumadokumentation wird angefordert, sodass die Zeit ab Eintreffen noch nicht bestätigt werden kann (ed_trauma_receptions und die Reanimationsnotiz wurden durchsucht).",
};

// --- Timeline strings (headlines, details, think snippets, tool headlines) ---
// KEEP wait/kind/tool name/status in logic. Translate headline/detail/think text
// and the few derived words below. `summaryWords` are the first few words the
// folded activity line shows — handled by shortLabel() in logic, so nothing to
// translate beyond the headlines themselves.
const timeline = {
  // Tool-call headlines (the agent's sql_execute / query_schema lines).
  tools: {
    cordGasPanel: "Das Nabelschnur-Blutgas-Panel gelesen",
    inspectedSchema: "Das EHR-Schema untersucht",
    troponinResults: "Die Troponin-Befunde gelesen",
    cardiometabolicScreen: "Das kardiometabolische Screening gelesen",
    epilepsyInvestigations: "Die MRT- und EKG-Daten gelesen",
    traumaReception: "Die Schockraum-Aufnahmezeiten gelesen",
    traumaInterventions: "Die CT-, TXA- und Atemwegsdaten gelesen",
  },
  // Cord-pH population (timelineA -> cordPhPopulation).
  cord: {
    mapTemplate: { headline: "Die Vorlage auf das EHR-Schema abbilden…", detail: "Jede der Spalten der Vorlage wird auf ein Feld in der **EHR-Datenbank** aufgelöst, bevor die strukturierten Geburtsdatensatz-Werte übertragen werden." },
    copyBirthRecord: { headline: "Die strukturierten Geburtsdatensatz-Felder kopieren…", detail: "Gestationsalter, mütterliches Alter, Parität, Entbindungsmodus, Geburtsgewicht und die Apgar-Werte werden direkt aus `cord_ph_birth_records` und `patient_demographics` gezogen." },
    antenatalScreening: { headline: "Die Schwangerenvorsorge-Screeningfelder lesen…", detail: "Die Flags für normale Sonografien, normale Dopplerbefunde und CTG werden aus den Schwangerenvorsorge-Datensätzen kopiert." },
    antenatalNotes: { headline: "Die Schwangerenvorsorge-Notizen lesen…", detail: "Die Schwangerenvorsorge-Notiz jeder Schwangerschaft wird auf Kindsbewegungen, mütterliche Komorbiditäten, vorzeitigen Blasensprung und Sepsis-Risikofaktoren gelesen." },
    obstetricNotes: { headline: "Die geburtshilflichen und Hebammen-Notizen lesen…", detail: "Jede geburtshilfliche Geburtszusammenfassung wird mit der passenden Hebammen-Entbindungsnotiz kombiniert, um verzögertes Abnabeln, den Zustand des Fruchtwassers, Chorioamnionitis und etwaige Sentinel-Ereignisse zu bestätigen." },
    thinkDcc: "CPH002 war ein Kaiserschnitt der Kategorie 1 mit einem schlaffen Neugeborenen — die Nabelschnur wurde sofort zur Reanimation abgeklemmt, sodass das verzögerte Abnabeln trotz Stationsrichtlinie als \"Nein\" gelesen wird.",
    resuscitationNotes: { headline: "Die Reanimationsnotizen lesen…", detail: "Jedes Reanimationsprotokoll wird auf Intubation, Herzdruckmassage und etwaige bei der Entbindung verabreichte Medikamente gelesen." },
    metabolicScreen: { headline: "Das neonatale Stoffwechselscreening prüfen…", detail: "Die postnatale Notiz jedes Neugeborenen wird gelesen, um etwaige Hypoglykämie zu dokumentieren." },
    followUp: { headline: "Die Nachsorge- und Entlassungsfelder kopieren…", detail: "Station, wiederholte Nabelschnur-Blutgasbefunde, NICU-Aufnahme und Entlassungszeitpunkt werden aus dem strukturierten Datensatz gezogen. Wo kein wiederholtes Blutgas durchgeführt wurde, wird das Feld mit einem ausdrücklichen \"k. A.\" gefüllt statt leer gelassen." },
    governance: { headline: "Die Governance-Antworten auf Stationsebene dokumentieren…", detail: "Die Spalten zum Fragebogen auf Stationsebene und zur Verfügbarkeit lokaler Leitlinien werden aus dem Audit-Governance-Datensatz gefüllt." },
    nicuSheet: { headline: "Das NICU-Blatt befüllen…", detail: "Es wird auf das **NICU**-Blatt gewechselt, um die Outcomes für die auf die neonatologische Station aufgenommenen Neugeborenen zu füllen." },
    coolingCfm: { headline: "Die Kühlungs- und CFM-Notizen lesen…", detail: "Jede NICU-Aufnahmenotiz wird auf therapeutische Kühlung gelesen und der bettseitige CFM-Eindruck wird mit dem formalen neurologischen Befund abgeglichen. Ein Fall widerspricht dem strukturierten Datensatz; eine Frühgeborenen-Sepsis-Aufnahme hatte kein CFM, ausdrücklich dokumentiert." },
    thinkCfm: "**CPH009 — Abgleich des CFM-Widerspruchs.** Die bettseitige CFM-Notiz liest ein *normales Grundmuster*, aber der formale neurologische Befund dokumentiert **elektrografische Krampfanfälle** mit `Schädigung der Basalganglien und des Thalamus` im MRI. Diese widersprechen sich, sodass ich, anstatt stillschweigend eine Quelle auszuwählen, diese Zelle als **Widerspruch** zur ärztlichen Überprüfung kennzeichne:\n\n- Bettseitiges CFM: normales Grundmuster\n- Formales aEEG: auffällig, elektrografische Krampfanfälle\n- MRI: Schädigung der Basalganglien / des Thalamus\n\nDer formale Befund ist die maßgeblichere Quelle, aber die Diskrepanz selbst ist der Befund, der hervorzuheben ist.",
    neurologyReports: { headline: "Die neurologischen Befunde lesen…", detail: "Jeder formale neurologische Befund wird auf klinische und elektrografische Krampfanfälle und etwaige MRI-Schädigung gelesen." },
    dischargeSummaries: { headline: "Die NICU-Entlassungsberichte prüfen…", detail: "Jeder NICU-Entlassungsbericht wird auf Ernährungsmethode und Neurologie bei Entlassung gelesen." },
    finalizing: { headline: "Das Audit abschließen…", detail: "Alle Zellen befüllt und auf den EHR-Datensatz oder die Quellnotizen über beide Blätter ALL und NICU rückverfolgbar." },
  },
  // Chest-pain population (timelineB -> chestPainPopulation).
  chest: {
    populating: { headline: "Aus der EHR befüllen…", detail: "Die Brustschmerz-Arbeitsmappe wird Spalte für Spalte aus der **EHR-Datenbank** und den Triage- und kardiologischen Notizen gefüllt." },
    triageNotes: { headline: "Die Triage-Notizen lesen…", detail: "Die Triage-Notiz jeder Vorstellung wird gelesen, um die Vorstellungsbeschwerde zu erfassen." },
    ecgResults: { headline: "Die ECG-Befunde lesen…", detail: "Die dokumentierten ECG-Befunde und die Zeit von der Ankunft bis zum ersten ECG werden gezogen, wobei jede Vorstellung ohne dokumentiertes ECG gekennzeichnet wird." },
    cardiologyNotes: { headline: "Die kardiologischen Notizen prüfen…", detail: "Die kardiologische Untersuchung wird gelesen, um die Arbeitsdiagnose für jeden Patienten festzulegen." },
    dischargeSummaries: { headline: "Die Entlassungsberichte prüfen…", detail: "Jeder Entlassungsbericht wird gelesen, um zu dokumentieren, ob der Patient entlassen oder aufgenommen wurde." },
    finalizing: { headline: "Das Audit abschließen…", detail: "Alle Zellen befüllt und auf den EHR-Datensatz oder die Quellnotizen rückverfolgbar." },
  },
  // NPDA population (timelineC -> npdaPopulation).
  npda: {
    mapTemplate: { headline: "Die Vorlage auf das EHR-Schema abbilden…", detail: "Jede NPDA-Spalte wird auf ein Feld in der **EHR-Datenbank** aufgelöst, bevor die strukturierten Demografie- und Diagnosedetails übertragen werden." },
    demographics: { headline: "Die Demografie- und Diagnosefelder kopieren…", detail: "Geburtsdatum, Postleitzahl, Geschlecht, ethnische Zugehörigkeit, die ADHS/ASS- und Lernbehinderungs-Flags, Diabetes-Typ und Diagnosedatum werden direkt aus `patient_demographics` und `diabetes_diagnoses` gezogen." },
    registration: { headline: "Die Registrierungs- und Dienstfelder kopieren…", detail: "Das Datum und der Grund für das Ausscheiden aus dem Dienst, ein etwaiges Sterbedatum, der Hausarztpraxis-Code, die PDU-Nummer und das Termin-/Vorstellungsdatum werden gezogen. Patienten, die unter Betreuung des Dienstes blieben, tragen ein ausdrückliches Label statt eines leeren Feldes." },
    clinicMeasurements: { headline: "Die Klinikmessungen kopieren…", detail: "Körpergröße, Gewicht und HbA1c werden mit ihren Messdaten aus dem strukturierten Klinik-Beobachtungspanel kopiert." },
    diabetesClinicNotes: { headline: "Die Diabetesambulanz-Notizen lesen…", detail: "Die Diabetesambulanz-Notiz jedes Kindes wird auf das Insulinregime, die Verwendung eines kontinuierlichen Glukosesensors und die erteilte Lebensstil- und Ernährungsberatung gelesen." },
    treatmentFlags: { headline: "Die Behandlungs- und Überwachungs-Flags kopieren…", detail: "Etwaige nicht-insulinhaltige blutzuckersenkende Medikation, Blutketon-Testung und — bei neu diagnostizierten Typ-1-Patienten — ob eine Immuntherapie erhalten wurde und wann, werden gezogen." },
    surveillanceScreening: { headline: "Die Überwachungs-Screeningdaten kopieren…", detail: "Die Felder zu Fußuntersuchung, Netzhaut-Screening, Schilddrüse, Zöliakie und Kohlenhydratzählung werden aus dem strukturierten Datensatz gezogen. Wo ein Screening noch nicht fällig oder nicht zutreffend ist, wird das Feld mit einem ausdrücklichen Label gefüllt statt leer gelassen." },
    annualReviewNotes: { headline: "Die Jahreskontroll-Notizen lesen…", detail: "Die Jahreskontroll-Notiz jedes Kindes wird auf den Raucher- oder Dampferstatus gelesen, dann werden die Versorgungsprozess-Daten zu Raucherentwöhnung, Influenza-Impfung und Krankheitstage-Regeln dokumentiert." },
    psychologyNotes: { headline: "Die psychologischen Notizen lesen…", detail: "Das Ergebnis des jährlichen psychologischen Screenings jedes Kindes wird gelesen, dann wird dokumentiert, ob ein Termin zur psychischen Gesundheit als Teil des Diabetes-MDT angeboten wurde." },
    dieteticAdmissions: { headline: "Diätetische Betreuung und Aufnahmen prüfen…", detail: "Die Diabetesambulanz-Notiz wird auf einen etwaigen angebotenen zusätzlichen Diätassistenz-Termin gelesen, dann werden die Daten zur Kohlenhydratzählung und zum Diätassistenz-Termin sowie der Aufnahmedatensatz für eine etwaige diabetesbezogene Aufnahme wie eine DKA gezogen." },
    finalizing: { headline: "Das Audit abschließen…", detail: "Alle Zellen befüllt und auf den EHR-Datensatz oder die Quellnotizen rückverfolgbar." },
  },
  // Epilepsy12 population (timelineE -> epilepsyPopulation).
  epilepsy: {
    mapTemplate: { headline: "Die Vorlage dem EHR-Schema zuordnen…", detail: "Jede Epilepsy12-Spalte wird einem Feld der **EHR-Datenbank** zugeordnet, bevor die strukturierten Stammdaten und die Angaben zur Erstuntersuchung übernommen werden." },
    demographics: { headline: "Die Stammdaten- und Überweisungsfelder übernehmen…", detail: "Geburtsdatum, Geschlecht, Alter bei der Erstuntersuchung, das Überweisungsdatum und das Datum der ersten pädiatrischen Untersuchung werden direkt aus `patient_demographics` und `epilepsy_assessments` gezogen." },
    clinicLetters: { headline: "Die Epilepsie-Ambulanzbriefe lesen…", detail: "Der erste Epilepsie-Ambulanzbrief jedes Kindes wird daraufhin gelesen, ob die untersuchende Pädiaterin/der untersuchende Pädiater über Epilepsie-Expertise verfügte (KPI 1), und auf den Anfallstyp, der den EKG-KPI bestimmt." },
    specialistInput: { headline: "Die Felder zu Fachpflegekraft und Behandlungsplan übernehmen…", detail: "Das Datum der Mitbetreuung durch die Epilepsie-Fachpflegekraft (KPI 2) und das Datum des umfassenden Behandlungsplans (KPI 9) werden gezogen. Wo weder Mitbetreuung noch Plan dokumentiert sind, trägt das Feld eine ausdrückliche Kennzeichnung statt eines Leerwerts." },
    investigations: { headline: "Die MRT- und EKG-Felder übernehmen…", detail: "Es wird gezogen, ob eine MRT indiziert war, samt Anforderungs- und Durchführungsdatum (KPI 5), sowie das EKG-Datum bei konvulsiven Anfällen (KPI 4). Fälle, in denen eine Untersuchung nicht indiziert, noch nicht erfolgt oder nicht verfügbar ist, tragen eine ausdrückliche Kennzeichnung." },
    mentalHealth: { headline: "Screening und Unterstützung der psychischen Gesundheit prüfen…", detail: "Das Datum des Screenings der psychischen Gesundheit wird gezogen (KPI 6), anschließend wird die Screening-Notiz daraufhin gelesen, ob ein Problem festgestellt wurde und, falls ja, ob Unterstützung geleistet wurde (KPI 7)." },
    medicationSafety: { headline: "Die Sicherheit von Valproat/Topiramat prüfen…", detail: "Die Verordnungskennzeichen für Valproat und Topiramat werden gezogen und, für weibliche Personen ab 12 Jahren unter einem dieser Wirkstoffe, ob ein Schwangerschaftsverhütungsprogramm besteht (KPI 8, sicherheitskritisch)." },
    finalizing: { headline: "Das Audit abschließen…", detail: "Alle Zellen sind befüllt und auf den EHR-Datensatz oder die Quellnotizen zurückführbar." },
  },
  // Major trauma population (timelineT -> traumaPopulation).
  trauma: {
    mapTemplate: { headline: "Die Vorlage dem EHR-Schema zuordnen…", detail: "Jede NMTR-Spalte wird einem Feld der **EHR-Datenbank** zugeordnet, bevor die strukturierten Stammdaten und die Angaben zur Verletzungsschwere übernommen werden." },
    demographics: { headline: "Die Stammdaten- und Verletzungsfelder übernehmen…", detail: "Geburtsdatum, Geschlecht, Alter, der Injury Severity Score und das AIS-3+-Einschlusskennzeichen werden direkt aus `patient_demographics` und dem Traumaregister-Datensatz gezogen." },
    registrySubmission: { headline: "Die Felder zur Registerübermittlung übernehmen…", detail: "Die Ankunftszeit in der Notaufnahme, das Entlassungsdatum und die NMTR-Kennzeichen für übermittelt/vollständig werden samt Übermittlungsdatum gezogen, um das 25-Tage-BPT-Fenster zu prüfen (C1)." },
    reception: { headline: "Die Felder zur Schockraumaufnahme übernehmen…", detail: "Es wird gezogen, ob ein Trauma-Team alarmiert wurde, ob eine Fachärztin/ein Facharzt anwesend war und wann sie/er eintraf (C2, Stufe 2). Eine Aufnahmezeit konnte nicht ermittelt werden und ist markiert." },
    investigations: { headline: "Die CT-, TXA- und Atemwegsfelder übernehmen…", detail: "Der GCS und das Kennzeichen für ein Schädel-Hirn-Trauma werden samt Zeit bis zum CT-Schädel (C3), der TXA-Indikation und -Zeit (C4) sowie dem Zeitpunkt der erwogenen Atemwegssicherung bei Fällen mit niedrigem GCS (C5) gezogen. Fälle, in denen eine Maßnahme nicht indiziert oder nicht qualifizierend ist, tragen eine ausdrückliche Kennzeichnung." },
    resusNotes: { headline: "Die Reanimationsnotizen lesen…", detail: "Die Reanimationsnotiz jedes Falls wird daraufhin gelesen, ob Atemwegsmanagement/Intubation im Rahmen der Erstuntersuchung erwogen wurde (C5)." },
    rehabilitation: { headline: "Die Rehabilitationsverordnungen prüfen…", detail: "Es wird gezogen, ob der Rehabilitationsbedarf erhoben wurde, anschließend wird die Rehabilitations-/Entlassungsnotiz daraufhin gelesen, ob eine Rehabilitationsverordnung ausgestellt wurde (C6, ISS ≥9)." },
    finalizing: { headline: "Das Audit abschließen…", detail: "Alle Zellen sind befüllt und auf den EHR-Datensatz oder die Quellnotizen zurückführbar." },
  },
  // Flow openers (timelineA / timelineB / timelineC).
  flowA: {
    reviewingTemplate: { headline: "Die Vorlage prüfen…", detail: "Das Audit **Nabelschnur-pH (regional)** wird gegen die **EHR-Datenbank** geprüft und die Feldzuordnungen über beide Blätter ALL und NICU werden aufgelöst." },
  },
  flowB: {
    readingRequest: { headline: "Die Anfrage lesen…", detail: "Die Anfrage von Dr Alvarez wird ausgewertet: ein Audit der Brustschmerz-Vorstellungen Erwachsener in der **EHR-Datenbank** für das letzte Quartal." },
    buildingSpreadsheet: { headline: "Die Tabelle erstellen…", detail: "Eine Brustschmerz-Arbeitsmappe wird aus der **EHR-Datenbank** entworfen — Kontakte, Troponin- und ECG-Befunde sowie die Triage- und kardiologischen Notizen." },
    addingColumns: { headline: "Spalten hinzufügen…", detail: "Spalten werden hinzugefügt: Patient, Alter, Vorstellungsbeschwerde, Troponin (ng/L), ECG-Befunde, Zeit bis zum ECG (Min.), Diagnose, Entscheidung Entlassung/Aufnahme." },
  },
  flowC: {
    reviewingTemplate: { headline: "Die Vorlage prüfen…", detail: "Das Audit **Pädiatrischer Diabetes (NPDA)** wird gegen die **EHR-Datenbank** geprüft und die Feldzuordnungen werden aufgelöst." },
  },
  flowE: {
    reviewingTemplate: { headline: "Die Vorlage prüfen…", detail: "Das Audit **Pädiatrische Epilepsie (Epilepsy12)** wird gegen die **EHR-Datenbank** geprüft und die Feldzuordnungen werden aufgelöst." },
  },
  flowT: {
    reviewingTemplate: { headline: "Die Vorlage prüfen…", detail: "Das Audit **Pädiatrisches schweres Trauma (NMTR)** wird gegen die **EHR-Datenbank** geprüft und die Feldzuordnungen werden aufgelöst." },
  },
  // Folded activity-line label for thinking steps.
  thinkingLabel: "Überlegt",
};

// --- Sample doctor's email (Flow B) -----------------------------------------
const email = `Hallo Team,

für die Überprüfung des Brustschmerz-Pfads benötige ich ein Audit der Brustschmerz-Vorstellungen Erwachsener in der EHR-Datenbank für das letzte Quartal.

Bitte ziehen Sie für jeden Patienten: Alter, Vorstellungsbeschwerde bei der Triage, den ersten Troponin-Befund, die Zeit von der Ankunft bis zum ersten ECG und die dokumentierten ECG-Befunde. Lesen Sie zusätzlich zu den strukturierten Feldern die Triage- und kardiologischen Notizen und nennen Sie mir die Arbeitsdiagnose sowie ob der Patient entlassen oder aufgenommen wurde.

Kennzeichnen Sie jeden Fall, in dem ein Troponin oder ECG fehlt.

Danke,
Dr Mark Alvarez
Notfallmedizin`;

// --- Tracked-dashboard descriptors (home cards §2.2 + left panel §4) ---------
// Three paediatric BPT dashboards. Each opens a seeded audit via selectAudit().
// `trackers` lists ids into the `trackers` map below. Numbers/ids/refs/kinds are
// logic and identical across packs; title/subtitle strings stay English verbatim.
const dashboards = [
  {
    id: "paediatric-diabetes-bpt",
    auditId: "npda-lo-audit",
    title: "Diabetes-BPT",
    logo: "dash-diabetes",
    subtitle: "NPDA · zentrale Versorgungsprozesse",
    submissionDeadline: "2026-07-20",
    trackers: ["t-dia-hba1c-coverage", "t-dia-care-processes", "t-dia-mdt-contacts", "t-dia-psychology", "t-dia-dietitian", "t-dia-carb-counting", "t-dia-high-hba1c", "t-dia-coeliac-thyroid"],
  },
  {
    id: "paediatric-epilepsy-bpt",
    auditId: "epilepsy12-lo-audit",
    title: "Epilepsie-BPT",
    logo: "dash-epilepsy",
    subtitle: "Epilepsy12 · KPIs der Abteilung",
    submissionDeadline: "2027-01-12",
    trackers: ["t-epi-paediatrician-2wk", "t-epi-esn-first-year", "t-epi-mri-6wk", "t-epi-ecg-convulsive", "t-epi-mh-screening", "t-epi-care-plan-12mo", "t-epi-valproate-ppp"],
  },
  {
    id: "paediatric-trauma-bpt",
    auditId: "nmtr-trauma-lo-audit",
    title: "BPT Schwerverletztenversorgung",
    logo: "dash-trauma",
    subtitle: "NMTR · Standards der Akutversorgung",
    submissionDeadline: "Einreichung ≤25 Tage nach Entlassung",
    trackers: ["t-tra-registry-25d", "t-tra-consultant-5min", "t-tra-ct-head-60min", "t-tra-txa-1h", "t-tra-airway-30min", "t-tra-rehab-prescription"],
  },
  {
    id: "cord-ph-bpt",
    auditId: "cord-ph-lo-audit",
    title: "Audit Nabelschnur-pH",
    logo: "dash-cordph",
    subtitle: "Nabelschnurblutgas · Qualität bei der Geburt",
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
    title: "HbA1c ≥4×/Jahr Abdeckung",
    kind: "timeseries",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "m1", label: "Aug.", value: 0.55, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m2", label: "Sep.", value: 0.62, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m3", label: "Okt.", value: 0.70, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m4", label: "Nov.", value: 0.75, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m5", label: "Dez.", value: 0.80, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m6", label: "Jan.", value: 0.83, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
    ],
    criterion: "BPT-Kriterium Kinderdiabetes (j) — ≥4 datierte HbA1c-Ergebnisse im Auditjahr, Kohortenziel ≥90 % (Forschung §3 A1) [3]",
  },
  // A2 — seven NICE annual health checks, cohort partitioned by number of
  // applicable checks completed (recomputed from the BP/foot/retinal/ACR/
  // cholesterol/thyroid/coeliac fields per patient). The four bars partition all
  // 12 patients (6 + 1 + 2 + 3); each bar's row count equals value × 12. Each
  // row highlights all seven check-date columns {AG,AH,AI,AK,AN,AP,AR}.
  "t-dia-care-processes": {
    id: "t-dia-care-processes",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Sieben jährliche NICE-Gesundheitschecks",
    kind: "histogram",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "c5", label: "5 Checks erfolgt", value: 6 / 12, status: "met", highlightRefs: ["NPDA!AG2", "NPDA!AH2", "NPDA!AI2", "NPDA!AK2", "NPDA!AN2", "NPDA!AP2", "NPDA!AR2", "NPDA!AG3", "NPDA!AH3", "NPDA!AI3", "NPDA!AK3", "NPDA!AN3", "NPDA!AP3", "NPDA!AR3", "NPDA!AG6", "NPDA!AH6", "NPDA!AI6", "NPDA!AK6", "NPDA!AN6", "NPDA!AP6", "NPDA!AR6", "NPDA!AG7", "NPDA!AH7", "NPDA!AI7", "NPDA!AK7", "NPDA!AN7", "NPDA!AP7", "NPDA!AR7", "NPDA!AG9", "NPDA!AH9", "NPDA!AI9", "NPDA!AK9", "NPDA!AN9", "NPDA!AP9", "NPDA!AR9", "NPDA!AG13", "NPDA!AH13", "NPDA!AI13", "NPDA!AK13", "NPDA!AN13", "NPDA!AP13", "NPDA!AR13"] },
      { key: "c4", label: "4 Checks erfolgt", value: 1 / 12, status: "not-met", highlightRefs: ["NPDA!AG11", "NPDA!AH11", "NPDA!AI11", "NPDA!AK11", "NPDA!AN11", "NPDA!AP11", "NPDA!AR11"] },
      { key: "c2", label: "2 Checks erfolgt", value: 2 / 12, status: "not-met", highlightRefs: ["NPDA!AG4", "NPDA!AH4", "NPDA!AI4", "NPDA!AK4", "NPDA!AN4", "NPDA!AP4", "NPDA!AR4", "NPDA!AG8", "NPDA!AH8", "NPDA!AI8", "NPDA!AK8", "NPDA!AN8", "NPDA!AP8", "NPDA!AR8"] },
      { key: "c1", label: "1 Check erfolgt", value: 3 / 12, status: "not-met", highlightRefs: ["NPDA!AG5", "NPDA!AH5", "NPDA!AI5", "NPDA!AK5", "NPDA!AN5", "NPDA!AP5", "NPDA!AR5", "NPDA!AG10", "NPDA!AH10", "NPDA!AI10", "NPDA!AK10", "NPDA!AN10", "NPDA!AP10", "NPDA!AR10", "NPDA!AG12", "NPDA!AH12", "NPDA!AI12", "NPDA!AK12", "NPDA!AN12", "NPDA!AP12", "NPDA!AR12"] },
    ],
    criterion: "BPT-Kriterium Kinderdiabetes (k) — die sieben jährlichen NICE-Gesundheitschecks, soweit zutreffend, durchgeführt (Forschung §3 A2) [3][5]",
  },
  // A3 — MDT clinic ≥4/yr + ≥8 additional contacts. Representative headline
  // (no per-contact field in the mock); the gap exemplar is the highest-HbA1c row.
  "t-dia-mdt-contacts": {
    id: "t-dia-mdt-contacts",
    dashboardId: "paediatric-diabetes-bpt",
    title: "MDT-Sprechstunde ≥4/Jahr + ≥8 Kontakte",
    kind: "stat",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Patienten mit ≥4 Sprechstunden + ≥8 Kontakten", value: 11, status: "met", highlightRefs: ["NPDA!O2", "NPDA!O3", "NPDA!O4", "NPDA!O5", "NPDA!O6", "NPDA!O8", "NPDA!O9", "NPDA!O10", "NPDA!O11", "NPDA!O12", "NPDA!O13"] },
    ],
    criterion: "BPT-Kriterien Kinderdiabetes (g) & (h) — ≥4 MDT-Sprechstundentermine und ≥8 zusätzliche Kontakte pro Jahr. Näherung: Der Demodatensatz enthält kein Feld je Kontakt, daher verankert der Sprechstundenbesuch jeder Patientin/jedes Patienten (Spalte O) die Hervorhebung (Forschung §3 A3) [3]",
  },
  // A4 — annual psychology assessment (psychScreen present in audit year for all).
  "t-dia-psychology": {
    id: "t-dia-psychology",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Jährliche psychologische Beurteilung",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "In diesem Jahr beurteilt", value: 12 / 12, status: "met", highlightRefs: ["NPDA!AY2", "NPDA!AY3", "NPDA!AY4", "NPDA!AY5", "NPDA!AY6", "NPDA!AY7", "NPDA!AY8", "NPDA!AY9", "NPDA!AY10", "NPDA!AY11", "NPDA!AY12", "NPDA!AY13"] },
      { key: "not-met", label: "Nicht beurteilt", value: 0, status: "not-met", highlightRefs: [] },
    ],
    criterion: "BPT-Kriterium Kinderdiabetes (l) — mindestens jährliche psychologische Beurteilung hinsichtlich eines zusätzlichen Unterstützungsbedarfs (Forschung §3 A4) [3]",
  },
  // A5 — additional dietitian appointment offered (i.dietitian.v === "Yes").
  "t-dia-dietitian": {
    id: "t-dia-dietitian",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Zusätzlicher Ernährungsberatungstermin angeboten",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Angeboten", value: 9 / 12, status: "met", highlightRefs: ["NPDA!BD2", "NPDA!BD3", "NPDA!BD4", "NPDA!BD6", "NPDA!BD7", "NPDA!BD8", "NPDA!BD9", "NPDA!BD11", "NPDA!BD13"] },
      { key: "not-met", label: "Nicht angeboten", value: 3 / 12, status: "not-met", highlightRefs: ["NPDA!BD5", "NPDA!BD10", "NPDA!BD12"] },
    ],
    criterion: "BPT-Kriterium Kinderdiabetes (i) — mindestens ein zusätzlicher Ernährungsberatungstermin pro Jahr angeboten, Ziel ≥90 % (Forschung §3 A5) [3]",
  },
  // A6 — carb-counting ≤14d of diagnosis, cohort = newly-diagnosed T1 (NPD003, NPD007).
  "t-dia-carb-counting": {
    id: "t-dia-carb-counting",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Kohlenhydratzählen ≤14 Tage nach Diagnose (neuer Typ 1)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Innerhalb von 14 Tagen", value: 1 / 2, status: "met", highlightRefs: ["NPDA!BC4", "NPDA!I4"] },
      { key: "not-met", label: "Über 14 Tage", value: 1 / 2, status: "not-met", highlightRefs: ["NPDA!BC8", "NPDA!I8"] },
    ],
    criterion: "BPT-Kriterium Kinderdiabetes (f) — Kohlenhydratzählen der Stufe 3 innerhalb von 14 Tagen nach Diagnose bei neu diagnostiziertem Typ 1, Nenner = Neudiagnosen (Forschung §3 A6) [3]",
  },
  // A7 — high-HbA1c (≥69 mmol/mol) follow-up flag. Count at risk = 5.
  "t-dia-high-hba1c": {
    id: "t-dia-high-hba1c",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Markierung Nachverfolgung bei hohem HbA1c (≥69)",
    kind: "stat",
    target: { op: "<=", value: 0 },
    elements: [
      { key: "at-risk", label: "Patienten mit HbA1c ≥69 mmol/mol", value: 5, status: "not-met", highlightRefs: ["NPDA!T3", "NPDA!T4", "NPDA!T6", "NPDA!T7", "NPDA!T9"] },
    ],
    criterion: "BPT-Kriterium Kinderdiabetes (o)(i) — ein HbA1c ≥69 mmol/mol löst eine Eskalation aus; als erlösgefährdet markiert (Forschung §3 A7) [3]",
  },
  // A8 — coeliac + thyroid screening at diagnosis, cohort = newly-diagnosed T1.
  "t-dia-coeliac-thyroid": {
    id: "t-dia-coeliac-thyroid",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Zöliakie- und Schilddrüsenscreening bei Diagnose (neuer Typ 1)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Beide gescreent", value: 2 / 2, status: "met", highlightRefs: ["NPDA!AR4", "NPDA!AP4", "NPDA!AR8", "NPDA!AP8"] },
      { key: "not-met", label: "Unvollständig", value: 0, status: "not-met", highlightRefs: [] },
    ],
    criterion: "Teilmenge des BPT-Kriteriums Kinderdiabetes (k) — Zöliakie- und Schilddrüsenscreening im Umfeld der Diagnose bei neu diagnostiziertem Typ 1 (Forschung §3 A8) [3][5]",
  },

  // === Dashboard 2 — Paediatric Epilepsy BPT (Epilepsy12, rows A2–A11) ======
  // B1 — epilepsy-expert paediatrician ≤2 weeks of referral.
  "t-epi-paediatrician-2wk": {
    id: "t-epi-paediatrician-2wk",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "Pädiater mit Epilepsie-Expertise ≤2 Wochen",
    kind: "timeseries",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "m1", label: "Aug.", value: 0.50, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m2", label: "Sep.", value: 0.58, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m3", label: "Okt.", value: 0.65, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m4", label: "Nov.", value: 0.72, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m5", label: "Dez.", value: 0.78, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m6", label: "Jan.", value: 0.80, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
    ],
    criterion: "Epilepsy12 KPI 1 — Vorstellung bei einer Fachärztin/einem Facharzt für Kinderheilkunde mit Epilepsie-Expertise innerhalb von 2 Wochen nach Überweisung (Forschung §3 B1) [7]",
  },
  // B2 — ESN input within the first year.
  "t-epi-esn-first-year": {
    id: "t-epi-esn-first-year",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "ESN-Mitbetreuung im ersten Jahr",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "ESN-Mitbetreuung im Jahr", value: 9 / 10, status: "met", highlightRefs: ["Epilepsy!J2", "Epilepsy!J3", "Epilepsy!J4", "Epilepsy!J5", "Epilepsy!J6", "Epilepsy!J8", "Epilepsy!J9", "Epilepsy!J10", "Epilepsy!J11"] },
      { key: "not-met", label: "Keine ESN-Mitbetreuung", value: 1 / 10, status: "not-met", highlightRefs: ["Epilepsy!J7"] },
    ],
    criterion: "Epilepsy12 KPI 2 — Mitbetreuung durch eine Epilepsie-Fachpflegekraft im ersten Betreuungsjahr (Forschung §3 B2) [3][7]",
  },
  // B3 — MRI ≤6 weeks where indicated (eligible = mriIndicated Yes; 6 of 10).
  "t-epi-mri-6wk": {
    id: "t-epi-mri-6wk",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "MRT ≤6 Wochen (bei Indikation)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Innerhalb von 6 Wochen", value: 4 / 6, status: "met", highlightRefs: ["Epilepsy!M2", "Epilepsy!N2", "Epilepsy!M3", "Epilepsy!N3", "Epilepsy!M6", "Epilepsy!N6", "Epilepsy!M10", "Epilepsy!N10"] },
      { key: "not-met", label: "Über 6 Wochen / nicht erfolgt", value: 2 / 6, status: "not-met", highlightRefs: ["Epilepsy!M4", "Epilepsy!N4", "Epilepsy!M8", "Epilepsy!N8"] },
    ],
    criterion: "Epilepsy12 KPI 5 — MRT innerhalb von 6 Wochen nach Anforderung bei bestehender Indikation; Nenner = nur indizierte Fälle (Forschung §3 B3) [7]",
  },
  // B4 — ECG in convulsive seizures (eligible = convulsive; 7 of 10).
  "t-epi-ecg-convulsive": {
    id: "t-epi-ecg-convulsive",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "EKG bei konvulsiven Anfällen",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "EKG durchgeführt", value: 6 / 7, status: "met", highlightRefs: ["Epilepsy!Q2", "Epilepsy!Q3", "Epilepsy!Q5", "Epilepsy!Q8", "Epilepsy!Q9", "Epilepsy!Q11"] },
      { key: "not-met", label: "Kein EKG", value: 1 / 7, status: "not-met", highlightRefs: ["Epilepsy!Q6"] },
    ],
    criterion: "Epilepsy12 KPI 4 — EKG bis zum Ende des ersten Jahres bei konvulsiven Anfällen; Nenner = konvulsive Fälle (Forschung §3 B4) [7]",
  },
  // B5 — mental-health screening documented within first year.
  "t-epi-mh-screening": {
    id: "t-epi-mh-screening",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "Screening der psychischen Gesundheit + Unterstützung",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Gescreent", value: 9 / 10, status: "met", highlightRefs: ["Epilepsy!S2", "Epilepsy!S3", "Epilepsy!S4", "Epilepsy!S5", "Epilepsy!S6", "Epilepsy!S7", "Epilepsy!S8", "Epilepsy!S9", "Epilepsy!S11"] },
      { key: "not-met", label: "Nicht gescreent", value: 1 / 10, status: "not-met", highlightRefs: ["Epilepsy!S10"] },
    ],
    criterion: "Epilepsy12 KPI 6 & 7 — im ersten Jahr dokumentiertes Screening der psychischen Gesundheit, mit Unterstützung bei festgestelltem Problem (Forschung §3 B5) [7]",
  },
  // B6 — comprehensive care plan by 12 months.
  "t-epi-care-plan-12mo": {
    id: "t-epi-care-plan-12mo",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "Umfassender Behandlungsplan bis 12 Monate",
    kind: "timeseries",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "m1", label: "Aug.", value: 0.55, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m2", label: "Sep.", value: 0.65, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m3", label: "Okt.", value: 0.72, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m4", label: "Nov.", value: 0.80, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m5", label: "Dez.", value: 0.85, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m6", label: "Jan.", value: 0.90, status: "met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
    ],
    criterion: "Epilepsy12 KPI 9a/9b — ein vereinbarter umfassender Behandlungsplan bis zum 12. Monat (Forschung §3 B6) [7]",
  },
  // B7 — valproate/topiramate safety (PPP). Eligible = female ≥12 on valproate/
  // topiramate (EPI002, EPI003, EPI005); EPI005 is the deliberate PPP gap.
  "t-epi-valproate-ppp": {
    id: "t-epi-valproate-ppp",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "Sicherheit von Valproat/Topiramat (Schwangerschaftsverhütungsprogramm)",
    kind: "stat",
    target: { op: ">=", value: 1 },
    elements: [
      { key: "at-risk", label: "Unter Valproat/Topiramat ohne Verhütungsprogramm", value: 1, status: "not-met", highlightRefs: ["Epilepsy!AA6"] },
    ],
    criterion: "Epilepsy12 KPI 8 — Schwangerschaftsverhütungsprogramm bzw. Risikoaufklärung für weibliche Personen ab 12 Jahren unter Valproat oder Topiramat (Forschung §3 B7) [7]",
  },

  // === Dashboard 3 — Paediatric Major Trauma BPT (NMTR, rows A2–A11) ========
  // C1 — registry submission ≤25 days of discharge (the BPT trigger).
  "t-tra-registry-25d": {
    id: "t-tra-registry-25d",
    dashboardId: "paediatric-trauma-bpt",
    title: "Registeraanlieferung ≤25 Tage",
    kind: "timeseries",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "m1", label: "Aug.", value: 0.60, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m2", label: "Sep.", value: 0.70, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m3", label: "Okt.", value: 0.78, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m4", label: "Nov.", value: 0.83, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m5", label: "Dez.", value: 0.88, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m6", label: "Jan.", value: 0.90, status: "met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
    ],
    criterion: "BPT-Auslöser Schwerverletztenversorgung — NMTR/TARN-Datensatz vollständig und innerhalb von 25 Tagen nach Entlassung übermittelt (Forschung §3 C1) [10][12]",
  },
  // C2 — consultant-led reception ≤5 min, eligible = Level 2 (ISS ≥16; 6 cases).
  "t-tra-consultant-5min": {
    id: "t-tra-consultant-5min",
    dashboardId: "paediatric-trauma-bpt",
    title: "Fachärztlich geleitete Aufnahme ≤5 Min. (Stufe 2)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Facharzt ≤5 Min.", value: 4 / 6, status: "met", highlightRefs: ["Trauma!N2", "Trauma!O2", "Trauma!P2", "Trauma!N4", "Trauma!O4", "Trauma!P4", "Trauma!N7", "Trauma!O7", "Trauma!P7", "Trauma!N8", "Trauma!O8", "Trauma!P8"] },
      { key: "not-met", label: "Über 5 Min. / nicht dokumentiert", value: 2 / 6, status: "not-met", highlightRefs: ["Trauma!N3", "Trauma!O3", "Trauma!P3", "Trauma!N10", "Trauma!O10", "Trauma!P10"] },
    ],
    criterion: "BPT Schwerverletztenversorgung (Stufe 2, ISS ≥16) — fachärztlich geleitetes Trauma-Team, Facharzt innerhalb von 5 Min. nach Eintreffen anwesend (Forschung §3 C2) [10]",
  },
  // C3 — CT head ≤60 min, eligible = Level 2 head injury with GCS ≤13 (6 cases).
  "t-tra-ct-head-60min": {
    id: "t-tra-ct-head-60min",
    dashboardId: "paediatric-trauma-bpt",
    title: "CT-Schädel ≤60 Min. (GCS ≤13, Stufe 2)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Innerhalb von 60 Min.", value: 5 / 6, status: "met", highlightRefs: ["Trauma!R2", "Trauma!S2", "Trauma!T2", "Trauma!R4", "Trauma!S4", "Trauma!T4", "Trauma!R7", "Trauma!S7", "Trauma!T7", "Trauma!R8", "Trauma!S8", "Trauma!T8", "Trauma!R10", "Trauma!S10", "Trauma!T10"] },
      { key: "not-met", label: "Über 60 Min.", value: 1 / 6, status: "not-met", highlightRefs: ["Trauma!R3", "Trauma!S3", "Trauma!T3"] },
    ],
    criterion: "BPT Schwerverletztenversorgung (Stufe 2) — CT-Schädel innerhalb von 60 Min. bei Kopfverletzungen mit GCS ≤13 (Forschung §3 C3) [10]",
  },
  // C4 — tranexamic acid ≤1 h, eligible = Level 2 with TXA indicated (4 cases).
  "t-tra-txa-1h": {
    id: "t-tra-txa-1h",
    dashboardId: "paediatric-trauma-bpt",
    title: "Tranexamsäure ≤1 Std. (Stufe 2)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Innerhalb von 1 Stunde", value: 3 / 4, status: "met", highlightRefs: ["Trauma!V2", "Trauma!W2", "Trauma!X2", "Trauma!V4", "Trauma!W4", "Trauma!X4", "Trauma!V8", "Trauma!W8", "Trauma!X8"] },
      { key: "not-met", label: "Über 1 Stunde", value: 1 / 4, status: "not-met", highlightRefs: ["Trauma!V7", "Trauma!W7", "Trauma!X7"] },
    ],
    criterion: "BPT Schwerverletztenversorgung (Stufe 2) — Tranexamsäure innerhalb von 1 Stunde bei bestehender Indikation (Forschung §3 C4) [10]",
  },
  // C5 — airway considered ≤30 min, eligible = Level 1 GCS <9 (4 cases; all met).
  "t-tra-airway-30min": {
    id: "t-tra-airway-30min",
    dashboardId: "paediatric-trauma-bpt",
    title: "Atemwegssicherung erwogen ≤30 Min. (GCS <9)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Innerhalb von 30 Min.", value: 4 / 4, status: "met", highlightRefs: ["Trauma!Z2", "Trauma!AA2", "Trauma!Z4", "Trauma!AA4", "Trauma!Z7", "Trauma!AA7", "Trauma!Z8", "Trauma!AA8"] },
      { key: "not-met", label: "Über 30 Min.", value: 0, status: "not-met", highlightRefs: [] },
    ],
    criterion: "BPT Schwerverletztenversorgung (Stufe 1) — Atemwegssicherung/Intubation innerhalb von 30 Min. bei GCS <9 erwogen (Forschung §3 C5) [10]",
  },
  // C6 — rehabilitation prescription, cohort = ISS ≥9 (9 cases; TRA005 is the gap).
  "t-tra-rehab-prescription": {
    id: "t-tra-rehab-prescription",
    dashboardId: "paediatric-trauma-bpt",
    title: "Rehabilitationsverordnung (ISS ≥9)",
    kind: "stat",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "gap", label: "Fälle mit ISS≥9 ohne Rehabilitationsverordnung", value: 1, status: "not-met", highlightRefs: ["Trauma!AC6", "Trauma!AD6"] },
    ],
    criterion: "BPT Schwerverletztenversorgung (Stufe 1) — Rehabilitationsbedarf erhoben und Rehabilitationsverordnung bei ISS ≥9 ausgestellt (Forschung §3 C6) [10]",
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
    title: "Gepaarte Nabelschnurgase abgenommen",
    kind: "donut",
    target: { op: ">=", value: 0.95 },
    elements: [
      { key: "met", label: "Gültiger arterieller pH dokumentiert", value: 8 / 9, status: "met", highlightRefs: ["ALL!Z2", "ALL!AA2", "ALL!Z3", "ALL!AA3", "ALL!Z5", "ALL!AA5", "ALL!Z6", "ALL!AA6", "ALL!Z7", "ALL!AA7", "ALL!Z8", "ALL!AA8", "ALL!Z9", "ALL!AA9", "ALL!Z10", "ALL!AA10"] },
      { key: "not-met", label: "Fehlend / nicht verwertbar", value: 1 / 9, status: "not-met", highlightRefs: ["ALL!Z4", "ALL!AA4"] },
    ],
    criterion: "Audit Nabelschnurblutgase — gepaarte (arterielle + venöse) Nabelschnurgase bei der Geburt abgenommen, Ziel ≥95 % der Geburten (Forschung §7.1 D1)",
  },
  // D2 — cord arterial pH ≥7.1 (non-acidotic). Denominator = babies with a valid
  // pH (8). met = pH ≥7.1 (rows 2,5,6,7,8,9); not-met = pH <7.1 (rows 3,10).
  "t-cord-ph-acidosis": {
    id: "t-cord-ph-acidosis",
    dashboardId: "cord-ph-bpt",
    title: "Arterieller Nabelschnur-pH ≥7,1",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "pH ≥7,1", value: 6 / 8, status: "met", highlightRefs: ["ALL!Z2", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9"] },
      { key: "not-met", label: "pH <7,1 (azidotisch)", value: 2 / 8, status: "not-met", highlightRefs: ["ALL!Z3", "ALL!Z10"] },
    ],
    criterion: "Audit Nabelschnurblutgase — arterieller Nabelschnur-pH ≥7,1 bei der Geburt (nicht azidotisch), Nenner = Neugeborene mit gültigem pH (Forschung §7.1 D2)",
  },
  // D3 — severe acidosis (pH <7.0). One baby: CPH009 (pH 6.98, row 10).
  "t-cord-severe-acidosis": {
    id: "t-cord-severe-acidosis",
    dashboardId: "cord-ph-bpt",
    title: "Schwere Azidose (pH <7,0)",
    kind: "stat",
    target: { op: "<=", value: 0 },
    elements: [
      { key: "at-risk", label: "Neugeborene mit arteriellem Nabelschnur-pH <7,0", value: 1, status: "not-met", highlightRefs: ["ALL!Z10"] },
    ],
    criterion: "Audit Nabelschnurblutgase — schwere metabolische Azidose (arterieller Nabelschnur-pH <7,0) zur Überprüfung markiert; jeder Fall ist ein Sentinel-Befund (Forschung §7.1 D3)",
  },
  // D4 — base-excess distribution (col AA). Denominator = babies with a BE value
  // (8). Healthy band BE ≥ -8 (rows 2,5,8,9) = met; worse bands not-met.
  "t-cord-base-excess": {
    id: "t-cord-base-excess",
    dashboardId: "cord-ph-bpt",
    title: "Verteilung des Basenüberschusses",
    kind: "histogram",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "be1", label: "≥ -8", value: 4 / 8, status: "met", highlightRefs: ["ALL!AA2", "ALL!AA5", "ALL!AA8", "ALL!AA9"] },
      { key: "be2", label: "-8 bis -12", value: 2 / 8, status: "not-met", highlightRefs: ["ALL!AA6", "ALL!AA7"] },
      { key: "be3", label: "< -12", value: 2 / 8, status: "not-met", highlightRefs: ["ALL!AA3", "ALL!AA10"] },
    ],
    criterion: "Audit Nabelschnurblutgase — Verteilung des arteriellen Nabelschnur-Basenüberschusses; BE ≥ -8 mmol/l ist der unauffällige Bereich, Nenner = Neugeborene mit dokumentiertem BE (Forschung §7.1 D4)",
  },
  // D5 — NICU admission (col AM). met = not admitted (6, rows 2,4,5,6,8,9);
  // not-met = admitted (3, rows 3,7,10).
  "t-cord-nicu-admission": {
    id: "t-cord-nicu-admission",
    dashboardId: "cord-ph-bpt",
    title: "Aufnahme auf die Neugeborenen-Intensivstation",
    kind: "donut",
    target: { op: "<=", value: 0.2 },
    elements: [
      { key: "met", label: "Nicht aufgenommen", value: 6 / 9, status: "met", highlightRefs: ["ALL!AM2", "ALL!AM5", "ALL!AM6", "ALL!AM8", "ALL!AM9", "ALL!AM4"] },
      { key: "not-met", label: "Auf die Neugeborenen-Intensivstation aufgenommen", value: 3 / 9, status: "not-met", highlightRefs: ["ALL!AM3", "ALL!AM7", "ALL!AM10"] },
    ],
    criterion: "Audit Nabelschnurblutgase — Aufnahmen reifer Neugeborener auf die Neugeborenen-Intensivstation nach der Geburt; niedriger ist besser, verstanden als Indikator für die Qualität bei der Geburt (Forschung §7.1 D5)",
  },
  // D6 — delayed cord clamping performed (i.dcc.v, col Y). met = Yes (4, rows
  // 2,4,5,9); not-met = No (5, rows 3,6,7,8,10).
  "t-cord-dcc": {
    id: "t-cord-dcc",
    dashboardId: "cord-ph-bpt",
    title: "Verzögertes Abnabeln durchgeführt",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Verzögertes Abnabeln erfolgt", value: 4 / 9, status: "met", highlightRefs: ["ALL!Y2", "ALL!Y4", "ALL!Y5", "ALL!Y9"] },
      { key: "not-met", label: "Kein verzögertes Abnabeln", value: 5 / 9, status: "not-met", highlightRefs: ["ALL!Y3", "ALL!Y6", "ALL!Y7", "ALL!Y8", "ALL!Y10"] },
    ],
    criterion: "Audit Nabelschnurblutgase — verzögertes Abnabeln bei der Geburt durchgeführt, Ziel ≥90 % der infrage kommenden Geburten (Forschung §7.1 D6)",
  },
  // D7 — acidosis rate (pH <7.1) trend. Lower is better, target ≤0.10. Six
  // monthly points trending down; the latest (Jan) ≈ the current cohort's <7.1
  // rate (2 of 8 = 0.25). Refs = the full pH column (col Z, all 9 rows).
  "t-cord-acidosis-trend": {
    id: "t-cord-acidosis-trend",
    dashboardId: "cord-ph-bpt",
    title: "Trend der Azidoserate (pH <7,1)",
    kind: "timeseries",
    target: { op: "<=", value: 0.1 },
    elements: [
      { key: "m1", label: "Aug.", value: 0.45, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m2", label: "Sep.", value: 0.40, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m3", label: "Okt.", value: 0.36, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m4", label: "Nov.", value: 0.31, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m5", label: "Dez.", value: 0.28, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m6", label: "Jan.", value: 0.25, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
    ],
    criterion: "Audit Nabelschnurblutgase — monatliche Rate arterieller Nabelschnurazidosen (pH <7,1); niedriger ist besser, Verbesserungsziel ≤10 % (Forschung §7.1 D7)",
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
