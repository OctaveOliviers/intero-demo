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
  { id: "patient-notes-db", name: "Notes des patients", status: "ready" },
  { id: "lab-results-db", name: "Résultats de laboratoire", status: "ready" },
  { id: "radiology-db", name: "Base de données de radiologie", status: "ready" },
];

const ehrDatabaseName = "Base de données DPI";

// --- Pre-loaded analyses (home list) ----------------------------------------
const analyses = [
  { id: "sentinel-stroke", name: "AVC sentinelle", description: "Délais porte-aiguille, imagerie et devenir des admissions pour AVC sentinelle.", defaultFilters: blankFilters() },
  { id: "paediatric-diabetes", name: "Diabète pédiatrique", description: "Nouvelles présentations de diabète de type 1 pédiatrique, sévérité de l'acidocétose diabétique et suivi.", defaultFilters: blankFilters() },
  { id: "emergency-laparotomy", name: "Laparotomie en urgence", description: "Évaluation du risque, délai jusqu'au bloc opératoire et devenir des laparotomies en urgence.", defaultFilters: blankFilters() },
  { id: "heart-failure", name: "Insuffisance cardiaque", description: "Admissions pour insuffisance cardiaque : fraction d'éjection, traitement et réadmission.", defaultFilters: blankFilters() },
  { id: "early-inflammatory-autoimmune", name: "Maladies auto-immunes inflammatoires précoces", description: "Délai jusqu'au diagnostic et au traitement des maladies auto-immunes inflammatoires précoces.", defaultFilters: blankFilters() },
];

// The cord-pH template the user uploads live (Flow A).
const cordTemplate = {
  id: "cord-ph-audit",
  name: "Audit du pH au cordon à la naissance",
  description: "Gaz du sang au cordon, réanimation et qualité de la documentation à la naissance.",
  defaultFilters: blankFilters(),
};

// --- Template catalog (translatable: category, name, description, columns) ---
// KEEP id, fileName, submissionDeadline unchanged.
const catalog = [
  {
    category: "Audits nationaux",
    templates: [
      {
        id: "nnap-national",
        name: "Soins néonatals",
        category: "Audits nationaux",
        fileName: "nnap-audit.xlsx",
        description:
          "Programme national d'audit néonatal — admissions, support respiratoire et devenir des nouveau-nés admis dans les unités néonatales.",
        columns: [
          "Numéro NHS",
          "Âge gestationnel (semaines)",
          "Poids de naissance (grammes)",
          "Température à l'admission",
          "Corticoïdes anténatals",
          "Sulfate de magnésium administré",
          "Type de support respiratoire",
          "Jours sous support respiratoire",
          "Dépistage de la rétinopathie réalisé",
          "Lait maternel à la sortie",
          "Survie à la sortie",
        ],
      },
      {
        id: "nhfd-national",
        name: "Fracture de la hanche",
        category: "Audits nationaux",
        fileName: "nhfd-audit.xlsx",
        description:
          "Base de données nationale des fractures de la hanche — qualité des soins et devenir des patients admis pour une fracture de la hanche par fragilité.",
        columns: [
          "Numéro NHS",
          "Âge",
          "Sexe",
          "Type de fracture",
          "Délai jusqu'à l'intervention (heures)",
          "Type d'intervention",
          "Évaluation cognitive préopératoire",
          "Statut des escarres",
          "Médicament de protection osseuse",
          "Mise en mouvement à J1",
          "Mortalité à 30 jours",
        ],
      },
      {
        id: "minap-national",
        name: "Infarctus du myocarde",
        category: "Audits nationaux",
        fileName: "minap-audit.xlsx",
        description:
          "Projet national d'audit de l'ischémie myocardique — prise en charge et devenir des patients admis pour un syndrome coronarien aigu.",
        columns: [
          "Numéro NHS",
          "Âge",
          "Diagnostic à l'admission",
          "Heure de début des symptômes",
          "Heure d'admission",
          "Résultat de l'ECG",
          "Résultat de la troponine",
          "Traitement de reperfusion",
          "Délai porte-ballon (min)",
          "Sortie sous statine",
          "Sortie sous double antiagrégation plaquettaire",
        ],
      },
      {
        id: "npda-lo-audit",
        name: "Diabète pédiatrique",
        category: "Audits nationaux",
        fileName: "npda-diabetes-audit.xlsx",
        submissionDeadline: "2026-07-20",
        description:
          "Audit national du diabète pédiatrique — revue annuelle des enfants et des jeunes atteints de diabète : HbA1c, processus de soins clés, dépistage de surveillance et soutien psychologique.",
        columns: [
          // Full NPDA 2026 core dataset — all 59 data items, in dataset order.
          "Numéro NHS",
          "Date de naissance",
          "Code postal de l'adresse habituelle",
          "Sexe assigné à la naissance",
          "Catégorie ethnique",
          "Diagnostic de TDAH / TSA",
          "Trouble des apprentissages",
          "Type de diabète",
          "Date du diagnostic",
          "Date de sortie du service",
          "Motif de sortie du service",
          "Date du décès",
          "Code du cabinet médical",
          "Numéro PDU",
          "Date de visite/rendez-vous",
          "Taille (cm)",
          "Poids (kg)",
          "Date des mesures (taille/poids)",
          "HbA1c (mmol/mol)",
          "Date des mesures (HbA1c)",
          "Schéma d'insulinothérapie",
          "Autre traitement hypoglycémiant",
          "Conseils sur le mode de vie/l'alimentation donnés",
          "CGM utilisé",
          "Test des cétones sanguines",
          "Immunothérapie reçue",
          "Date de début de l'immunothérapie",
          "PA systolique",
          "PA diastolique",
          "Date des mesures (PA)",
          "Date de l'examen des pieds",
          "Date du dépistage rétinien",
          "Résultat du dépistage rétinien",
          "Albumine urinaire (ACR)",
          "Date des mesures (ACR)",
          "Stade de l'albuminurie",
          "Cholestérol total (mmol/l)",
          "Date des mesures (cholestérol)",
          "Date des mesures (fonction thyroïdienne)",
          "Traitement thyroïdien",
          "Date des mesures (dépistage de la maladie cœliaque)",
          "Régime sans gluten",
          "Fume / vapote",
          "Date des conseils de sevrage tabagique",
          "Date de la vaccination antigrippale",
          "Date des conseils sur les règles en cas de maladie",
          "Date du dépistage psychologique",
          "Soutien psychologique supplémentaire nécessaire",
          "Rendez-vous en santé mentale proposé",
          "Date du comptage des glucides de niveau 3",
          "Rendez-vous supplémentaire avec un diététicien proposé",
          "Date du rendez-vous avec le diététicien",
          "Date de début de l'admission",
          "Date de sortie de l'admission",
          "Motif de l'admission",
          "Motif de l'admission (autre)",
          "Traitements de l'acidocétose diabétique administrés",
          "pH initial à l'admission",
          "Bicarbonate initial (mmol/l)",
        ],
      },
    ],
  },
  {
    category: "Audits régionaux",
    templates: [
      {
        id: "cord-ph-lo-audit",
        name: "pH au cordon (régional)",
        category: "Audits régionaux",
        fileName: "cord-ph-lo-audit.xlsx",
        submissionDeadline: "2026-06-12",
        description:
          "Audit régional du prélèvement des gaz du sang au cordon — devenir néonatal et respect des recommandations régionales pour l'acidose fœtale et le prélèvement des gaz du cordon.",
        columns: [
          "Code patient",
          "Âge gestationnel (semaines)",
          "Âge gestationnel (jours)",
          "Âge maternel",
          "Parité",
          "CTG réalisé",
          "Chorioamniotite",
          "Accouchement",
          "Poids de naissance (grammes)",
          "Apgar 5",
          "Clampage tardif du cordon",
          "pH artériel au cordon",
          "BE artériel au cordon",
          "Lactate artériel au cordon",
          "Intubé à la naissance",
          "Admis en NICU",
          "Recommandation régionale pour le prélèvement des gaz du cordon disponible",
        ],
      },
    ],
  },
  {
    category: "Audits locaux",
    templates: [
      {
        id: "acute-sore-throat-audit",
        name: "Mal de gorge aigu (local)",
        category: "Audits locaux",
        fileName: "acute-sore-throat-audit.xlsx",
        description:
          "Audit local du mal de gorge aigu — score FeverPAIN/Centor et respect des recommandations de prescription d'antibiotiques.",
        columns: [
          "Code patient",
          "Âge",
          "Sexe",
          "Motif de consultation",
          "Score FeverPAIN",
          "Score Centor",
          "Prélèvement de gorge effectué",
          "Antibiotique prescrit",
          "Agent antibiotique",
          "Prescription différée",
          "Nouvelle consultation dans les 28 jours",
        ],
      },
      {
        id: "chest-pain-audit",
        name: "Douleur thoracique (local)",
        category: "Audits locaux",
        fileName: "chest-pain-audit.xlsx",
        description:
          "Audit local de la douleur thoracique — triage, dosage de la troponine et orientation stratifiée selon le risque pour les patients présentant une douleur thoracique.",
        columns: [
          "Code patient",
          "Âge",
          "Sexe",
          "Catégorie de triage",
          "Délai jusqu'à l'ECG (min)",
          "Résultat de l'ECG",
          "Résultat de la troponine",
          "Score HEART",
          "Orientation",
          "Avis cardiologique",
          "Nouvelle consultation dans les 30 jours",
        ],
      },
    ],
  },
];

// --- Column descriptors (header translatable; key/width are logic) -----------
const columns = {
  cordAll: [
    { key: "patient", header: "Code patient", width: 12 },
    { key: "gestWeeks", header: "Âge gestationnel (semaines)", width: 14 },
    { key: "gestDays", header: "Âge gestationnel (jours)", width: 12 },
    { key: "maternalAge", header: "Âge maternel", width: 12 },
    { key: "parity", header: "Parité", width: 8 },
    { key: "_s1", header: "", width: 4 },
    { key: "foetalMovements", header: "Mouvements fœtaux", width: 16 },
    { key: "maternalComorbidities", header: "Comorbidités maternelles", width: 22 },
    { key: "maternalComorbiditiesOther", header: "Comorbidités maternelles Autre", width: 24 },
    { key: "normalScans", header: "Échographies normales", width: 12 },
    { key: "normalDopplers", header: "Dopplers normaux", width: 14 },
    { key: "_s2", header: "", width: 4 },
    { key: "ctgDone", header: "CTG réalisé", width: 10 },
    { key: "liquorMeconium", header: "Liquide- méconium", width: 16 },
    { key: "chorioamnionitis", header: "Chorioamniotite", width: 16 },
    { key: "prom", header: "RPM (>18 heures)", width: 16 },
    { key: "rffs", header: "RFFS", width: 8 },
    { key: "sentinelEvent", header: "Événement sentinelle", width: 18 },
    { key: "_s3", header: "", width: 4 },
    { key: "delivery", header: "Accouchement", width: 20 },
    { key: "birthWeight", header: "Poids de naissance (grammes)", width: 18 },
    { key: "apgar1", header: "Apgar 1", width: 10 },
    { key: "apgar5", header: "Apgar 5", width: 10 },
    { key: "apgar10", header: "Apgar 10", width: 10 },
    { key: "dcc", header: "Clampage tardif du cordon", width: 22 },
    { key: "ph", header: "pH artériel au cordon", width: 16 },
    { key: "be", header: "BE artériel au cordon", width: 16 },
    { key: "lactate", header: "Lactate artériel au cordon", width: 18 },
    { key: "_s4", header: "", width: 4 },
    { key: "intubated", header: "Intubé à la naissance", width: 18 },
    { key: "compressions", header: "Compressions cardiaques", width: 20 },
    { key: "drugs", header: "Médicaments administrés", width: 16 },
    { key: "ward", header: "Service", width: 14 },
    { key: "gasRepeated", header: "Gaz répété ?", width: 12 },
    { key: "ageRepeatedGas", header: "Âge au gaz répété (heures)", width: 22 },
    { key: "repeatedLactate", header: "Lactate répété", width: 16 },
    { key: "ageGasNormalised", header: "Âge à la normalisation du gaz (heures)", width: 22 },
    { key: "hypoglycaemia", header: "Hypoglycémie", width: 14 },
    { key: "admittedNicu", header: "Admis en NICU", width: 16 },
    { key: "ageDischargeHome", header: "Âge à la sortie à domicile (jours)", width: 24 },
    { key: "unitQuestionnaire", header: "Questionnaire au niveau de l'unité rempli ", width: 26 },
    { key: "guidelineCordGas", header: "Recommandation locale pour le prélèvement des gaz du cordon disponible", width: 34 },
    { key: "guidelineFetalAcidosis", header: "Recommandation locale pour l'acidose fœtale disponible", width: 34 },
  ],
  cordNicu: [
    { key: "nnuAdmitAge", header: "Âge (heures) à l'admission en NNU", width: 22 },
    { key: "cooled", header: "Refroidi", width: 10 },
    { key: "ageCooling", header: "Âge au refroidissement (heures)", width: 20 },
    { key: "transferredOut", header: "Transféré", width: 14 },
    { key: "cfm", header: "CFM", width: 14 },
    { key: "seizures", header: "Convulsions", width: 12 },
    { key: "clinicalSeizures", header: "Convulsions cliniques", width: 16 },
    { key: "electrographicSeizure", header: "Convulsion électrographique", width: 20 },
    { key: "mriInjury", header: "Lésion à l'IRM", width: 24 },
    { key: "_sn", header: "", width: 4 },
    { key: "durationNicu", header: "Durée de l'admission en NICU (jours)", width: 30 },
    { key: "ageDischargeHomeNicu", header: "Âge à la sortie à domicile (jours)", width: 24 },
    { key: "feeding", header: "Alimentation à la sortie", width: 20 },
    { key: "abnormalNeurology", header: "Neurologie anormale à la sortie", width: 28 },
  ],
  chest: [
    { key: "patient", header: "Patient", width: 10 },
    { key: "age", header: "Âge", width: 8 },
    { key: "complaint", header: "Motif de consultation", width: 26 },
    { key: "troponin", header: "Troponine (ng/L)", width: 16 },
    { key: "ecg", header: "Constatations ECG", width: 24 },
    { key: "timeToEcg", header: "Délai jusqu'à l'ECG (min)", width: 18 },
    { key: "diagnosis", header: "Diagnostic", width: 22 },
    { key: "decision", header: "Décision de sortie/admission", width: 24 },
  ],
  npda: [
    // 1 — Patient details/information
    { key: "patient", header: "Numéro NHS", width: 12 },                                 // item 1
    { key: "dob", header: "Date de naissance", width: 14 },                                  // item 2
    { key: "postcode", header: "Code postal de l'adresse habituelle", width: 16 },                 // item 3
    { key: "sex", header: "Sexe assigné à la naissance", width: 18 },                          // item 4
    { key: "ethnicity", header: "Catégorie ethnique", width: 26 },                          // item 5
    { key: "adhdAsd", header: "Diagnostic de TDAH / TSA", width: 20 },                       // item 6
    { key: "learningDisability", header: "Trouble des apprentissages", width: 18 },             // item 7
    { key: "diabetesType", header: "Type de diabète", width: 14 },                         // item 8
    { key: "diagnosisDate", header: "Date du diagnostic", width: 16 },                    // item 9
    { key: "leavingDate", header: "Date de sortie du service", width: 20 },                // item 10
    { key: "leavingReason", header: "Motif de sortie du service", width: 24 },           // item 11
    { key: "deathDate", header: "Date du décès", width: 14 },                               // item 12
    { key: "gpPractice", header: "Code du cabinet médical", width: 16 },                        // item 13
    { key: "pduNumber", header: "Numéro PDU", width: 12 },                               // item 14
    { key: "visitDate", header: "Date de visite/rendez-vous", width: 20 },                   // item 15
    { key: "_s1", header: "", width: 4 },
    // 2 — Routine measurements
    { key: "height", header: "Taille (cm)", width: 12 },                                 // item 16
    { key: "weight", header: "Poids (kg)", width: 12 },                                 // item 17
    { key: "obsDateHtWt", header: "Date des mesures (taille/poids)", width: 20 },               // item 18
    { key: "hba1c", header: "HbA1c (mmol/mol)", width: 16 },                             // item 19
    { key: "obsDateHba1c", header: "Date des mesures (HbA1c)", width: 18 },                      // item 20
    { key: "_s2", header: "", width: 4 },
    // 3 — Treatment/monitoring
    { key: "insulinRegime", header: "Schéma d'insulinothérapie", width: 24 },                       // item 21
    { key: "otherMed", header: "Autre traitement hypoglycémiant", width: 24 },                // item 22
    { key: "lifestyle", header: "Conseils sur le mode de vie/l'alimentation donnés", width: 26 },           // item 23
    { key: "cgm", header: "CGM utilisé", width: 12 },                                     // item 24
    { key: "ketoneTesting", header: "Test des cétones sanguines", width: 18 },                 // item 25
    { key: "immunotherapy", header: "Immunothérapie reçue", width: 20 },               // item 26
    { key: "immunotherapyDate", header: "Date de début de l'immunothérapie", width: 22 },       // item 27
    { key: "_s3", header: "", width: 4 },
    // 4 — Annual review: health checks
    { key: "systolic", header: "PA systolique", width: 12 },                              // item 28
    { key: "diastolic", header: "PA diastolique", width: 12 },                            // item 29
    { key: "obsDateBP", header: "Date des mesures (PA)", width: 16 },                            // item 30
    { key: "footDate", header: "Date de l'examen des pieds", width: 18 },                      // item 31
    { key: "retinalDate", header: "Date du dépistage rétinien", width: 20 },                 // item 32
    { key: "retinalResult", header: "Résultat du dépistage rétinien", width: 22 },             // item 33
    { key: "acr", header: "Albumine urinaire (ACR)", width: 18 },                          // item 34
    { key: "obsDateAcr", header: "Date des mesures (ACR)", width: 16 },                          // item 35
    { key: "albuminuriaStage", header: "Stade de l'albuminurie", width: 18 },                 // item 36
    { key: "cholesterol", header: "Cholestérol total (mmol/l)", width: 22 },             // item 37
    { key: "obsDateChol", header: "Date des mesures (cholestérol)", width: 20 },                 // item 38
    { key: "thyroidDate", header: "Date des mesures (fonction thyroïdienne)", width: 22 },            // item 39
    { key: "thyroidTreatment", header: "Traitement thyroïdien", width: 22 },                 // item 40
    { key: "coeliacDate", header: "Date des mesures (dépistage de la maladie cœliaque)", width: 24 },           // item 41
    { key: "glutenFree", header: "Régime sans gluten", width: 16 },                        // item 42
    { key: "smoking", header: "Fume / vapote", width: 14 },                             // item 43
    { key: "smokingCessationDate", header: "Date des conseils de sevrage tabagique", width: 24 }, // item 44
    { key: "fluDate", header: "Date de la vaccination antigrippale", width: 24 },                // item 45
    { key: "sickDayDate", header: "Date des conseils sur les règles en cas de maladie", width: 22 },             // item 46
    { key: "_s4", header: "", width: 4 },
    // 5 — Annual review: psychology
    { key: "psychScreen", header: "Date du dépistage psychologique", width: 24 },           // item 47
    { key: "psychOutcome", header: "Soutien psychologique supplémentaire nécessaire", width: 32 }, // item 48
    { key: "mentalHealthAppt", header: "Rendez-vous en santé mentale proposé", width: 28 }, // item 49
    { key: "_s5", header: "", width: 4 },
    // 6 — Annual review: dietetics
    { key: "carbCounting", header: "Date du comptage des glucides de niveau 3", width: 22 },            // item 50
    { key: "dietitian", header: "Rendez-vous supplémentaire avec un diététicien proposé", width: 32 }, // item 51
    { key: "dietitianApptDate", header: "Date du rendez-vous avec le diététicien", width: 22 },       // item 52
    { key: "_s6", header: "", width: 4 },
    // 7 — Hospital admissions / inpatient entry
    { key: "admissionStart", header: "Date de début de l'admission", width: 18 },                // item 53
    { key: "admissionDischarge", header: "Date de sortie de l'admission", width: 20 },        // item 54
    { key: "admissionReason", header: "Motif de l'admission", width: 20 },               // item 55
    { key: "admissionReasonOther", header: "Motif de l'admission (autre)", width: 24 },  // item 56
    { key: "dkaTherapies", header: "Traitements de l'acidocétose diabétique administrés", width: 18 },                   // item 57
    { key: "initialPh", header: "pH initial à l'admission", width: 20 },                  // item 58
    { key: "initialBicarb", header: "Bicarbonate initial (mmol/l)", width: 24 },         // item 59
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
    normalScans: "Oui", normalDopplers: "Oui", ctgDone: "Oui",
    delivery: "Voie basse spontanée", birthWeight: 3420, apgar1: 8, apgar5: 9, apgar10: 10,
    cordPh: 7.28, baseExcess: -3.4, lactate: 3.1,
    ward: "Service post-natal",
    gasRepeated: "Non", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "Non", ageDischargeHome: 2,
    unitQuestionnaire: "Oui", guidelineCordGas: "Oui", guidelineFetalAcidosis: "Non",
    i: {
      fm: { v: "Normaux", e: ["les mouvements fœtaux étaient normaux tout au long de la grossesse"] },
      mc: { v: "Aucune", e: ["Aucune comorbidité maternelle n'a été documentée"] },
      mco: { v: "Aucun", e: ["aucun autre antécédent médical notable"] },
      lm: { v: "Clair", e: ["Le liquide était clair tout du long"] },
      chorio: { v: "Non", e: ["aucun signe de chorioamniotite"] },
      prom: { v: "Non", e: ["sans rupture prolongée des membranes"] },
      rffs: { v: "Non", e: ["Aucun facteur de risque de sepsis n'a été identifié"] },
      sentinel: { v: "Aucun", e: ["Il n'y a eu aucun événement sentinelle"] },
      dcc: { v: "Oui", e: ["Clampage tardif du cordon réalisé pendant environ 90 secondes", "clampé à environ 90 secondes conformément à la politique de l'unité"] },
      intub: { v: "Non", e: ["Le nouveau-né n'a pas été intubé"] },
      compress: { v: "Non", e: ["aucune compression cardiaque n'a été nécessaire"] },
      drugs: { v: "Aucun", e: ["aucun médicament de réanimation n'a été administré"] },
      hypo: { v: "Non", e: ["sans hypoglycémie"] },
    },
    notes: [
      { role: "Obstétrique — consultation anténatale", date: "2026-04-02", type: "antenatal", text: "Suivi de début de grossesse et déroulement anténatal à faible risque. Selon les déclarations, les mouvements fœtaux étaient normaux tout au long de la grossesse. Aucune comorbidité maternelle n'a été documentée et il n'y avait aucun autre antécédent médical notable. Aucun facteur de risque de sepsis n'a été identifié, et les membranes se sont rompues à l'accouchement sans rupture prolongée des membranes." },
      { role: "Obstétrique — Dr Hannah Reid", date: "2026-04-02", type: "birth_summary", text: "Nouveau-né à terme né par voie basse spontanée à 39+4. Le liquide était clair tout du long et il n'y avait aucun signe de chorioamniotite. Il n'y a eu aucun événement sentinelle. Gaz du cordon normaux (pH artériel 7,28). Clampage tardif du cordon réalisé pendant environ 90 secondes. Aucune réanimation au-delà du séchage et de la stimulation." },
      { role: "Sage-femme — Leah Morgan", date: "2026-04-02", type: "delivery", text: "Accouchement par voie basse spontanée, peau à peau immédiat. Cordon laissé battre et clampé à environ 90 secondes conformément à la politique de l'unité. Apgar 8 et 9, nouveau-né rose et actif tout du long." },
      { role: "Néonatologie — compte rendu de réanimation", date: "2026-04-02", type: "resuscitation", text: "Aucune réanimation active n'a été nécessaire. Le nouveau-né n'a pas été intubé, aucune compression cardiaque n'a été nécessaire et aucun médicament de réanimation n'a été administré." },
      { role: "Service post-natal — examen du nouveau-né", date: "2026-04-04", type: "postnatal", text: "Examen néonatal de routine normal. La glycémie est restée dans les limites de la normale sans hypoglycémie. Bonne prise alimentaire ; sortie à domicile à J2." },
    ],
  },

  CPH002: {
    code: "CPH002", baby: "cph-baby-002",
    gestWeeks: 40, gestDays: 1, maternalAge: 34, parity: 2,
    normalScans: "Oui", normalDopplers: "Non", ctgDone: "Oui",
    delivery: "Césarienne en urgence", birthWeight: 3650, apgar1: 3, apgar5: 5, apgar10: 7,
    cordPh: 7.03, baseExcess: -15.2, lactate: 10.6,
    ward: "NICU",
    gasRepeated: "Oui", ageRepeatedGas: 2, repeatedLactate: 6.2, ageGasNormalised: 10,
    admittedNicu: "Oui", ageDischargeHome: 6,
    unitQuestionnaire: "Oui", guidelineCordGas: "Oui", guidelineFetalAcidosis: "Non",
    i: {
      fm: { v: "Diminués", e: ["Diminution des mouvements fœtaux rapportée"] },
      mc: { v: "Diabète gestationnel", e: ["diabète gestationnel"] },
      mco: { v: "Contrôlé par le régime", e: ["contrôlé par le régime"] },
      lm: { v: "Méconium", e: ["liquide teinté de méconium"] },
      chorio: { v: "Non", e: ["aucun signe de chorioamniotite"] },
      prom: { v: "Non", e: ["aucune rupture prolongée des membranes"] },
      rffs: { v: "Non", e: ["Aucun autre facteur de risque de sepsis"] },
      sentinel: { v: "Aucun", e: ["aucun événement sentinelle"] },
      dcc: { v: "Non", e: ["cordon clampé immédiatement pour permettre la réanimation", "aucun clampage tardif du cordon car une réanimation active était nécessaire"] },
      intub: { v: "Oui", e: ["Nouveau-né intubé à la naissance"] },
      compress: { v: "Oui", e: ["brèves compressions thoraciques"] },
      drugs: { v: "Adrénaline", e: ["une dose d'adrénaline administrée"] },
      hypo: { v: "Oui", e: ["Hypoglycémie transitoire dans les premières heures de vie"] },
    },
    n: {
      admitAge: 0.5, transferredOut: "Non", durationDays: 5,
      cooled: { v: "Oui", e: ["Hypothermie thérapeutique débutée"] },
      ageCooling: { v: "1.3", e: ["débutée à 1,3 heure"] },
      cfm: { v: "Concordant", e: ["un tracé de fond anormal sans convulsions électrographiques", "un tracé de fond anormal, pas de convulsions"], explanation: "La note CFM au lit du patient et le compte rendu neurologique formel lisent tous deux un tracé de fond anormal sans convulsions — concordants." },
      seizures: { v: "Non", e: ["aucune convulsion clinique ou électrographique"] },
      clinical: { v: "Non", e: ["aucune convulsion clinique ou électrographique"] },
      electro: { v: "Non", e: ["aucune convulsion clinique ou électrographique"] },
      mri: { v: "Aucune lésion aiguë", e: ["L'IRM n'a montré aucune lésion aiguë"] },
      feeding: { v: "Allaitement maternel", e: ["allaitement maternel établi"] },
      abnNeuro: { v: "Non", e: ["Examen neurologique normal à la sortie"] },
    },
    notes: [
      { role: "Obstétrique — consultation anténatale", date: "2026-04-04", type: "antenatal", text: "Grossesse compliquée par un diabète gestationnel, contrôlé par le régime. Diminution des mouvements fœtaux rapportée dans les jours précédant l'accouchement. Aucun autre facteur de risque de sepsis et aucune rupture prolongée des membranes." },
      { role: "Obstétrique — Dr Mark Alvarez", date: "2026-04-04", type: "birth_summary", text: "Césarienne en urgence pour CTG pathologique et liquide teinté de méconium. Il n'y avait aucun signe de chorioamniotite et aucun événement sentinelle. Nouveau-né hypotonique à la naissance ; cordon clampé immédiatement pour permettre la réanimation." },
      { role: "Sage-femme — Leah Morgan", date: "2026-04-04", type: "delivery", text: "Césarienne de catégorie 1. Nouveau-né confié immédiatement à l'équipe néonatale ; aucun clampage tardif du cordon car une réanimation active était nécessaire." },
      { role: "Néonatologie — compte rendu de réanimation", date: "2026-04-04", type: "resuscitation", text: "Nouveau-né intubé à la naissance avec brèves compressions thoraciques et une dose d'adrénaline administrée. Bonne réponse avec retour à une circulation spontanée." },
      { role: "Néonatologie — métabolique néonatal", date: "2026-04-05", type: "postnatal", text: "Hypoglycémie transitoire dans les premières heures de vie, traitée par dextrose intraveineux et résolue." },
      { role: "Néonatologie — Dr Priya Shah", date: "2026-04-04", type: "nicu_admission", text: "Admis en NICU à 0,5 heure de vie. Hypothermie thérapeutique débutée à 1,3 heure. Le CFM a montré un tracé de fond anormal sans convulsions électrographiques, en accord avec le dossier structuré." },
      { role: "Neurologie — compte rendu aEEG formel", date: "2026-04-06", type: "neurology_report", text: "La revue aEEG formelle confirme un tracé de fond anormal, pas de convulsions. Il n'y a eu aucune convulsion clinique ou électrographique. L'IRM n'a montré aucune lésion aiguë." },
      { role: "Néonatologie — compte rendu de sortie", date: "2026-04-10", type: "discharge", text: "Sortie à domicile à J6, allaitement maternel établi. Examen neurologique normal à la sortie." },
    ],
  },

  CPH003: {
    code: "CPH003", baby: "cph-baby-003",
    gestWeeks: 38, gestDays: 6, maternalAge: 29, parity: 0,
    normalScans: "Oui", normalDopplers: "Oui", ctgDone: "Oui",
    delivery: "Forceps", birthWeight: 3180, apgar1: 7, apgar5: 9, apgar10: 10,
    cordPh: null, baseExcess: null, lactate: null, phMissing: true,
    ward: "Service post-natal",
    gasRepeated: "Non", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "Non", ageDischargeHome: 3,
    unitQuestionnaire: "Oui", guidelineCordGas: "Oui", guidelineFetalAcidosis: "Non",
    phEvidence: ["Le prélèvement artériel au cordon a coagulé et aucun pH valide n'est disponible"],
    i: {
      fm: { v: "Normaux", e: ["mouvements fœtaux normaux"] },
      mc: { v: "Aucune", e: ["Aucune comorbidité maternelle"] },
      mco: { v: "Aucun", e: ["aucun autre antécédent médical notable"] },
      lm: { v: "Clair", e: ["Le liquide était clair"] },
      chorio: { v: "Non", e: ["sans signe de chorioamniotite"] },
      prom: { v: "Oui", e: ["Rupture prolongée des membranes pendant plus de 24 heures"] },
      rffs: { v: "Oui", e: ["enregistrée comme facteur de risque de sepsis"] },
      sentinel: { v: "Aucun", e: ["aucun événement sentinelle"] },
      dcc: { v: "Oui", e: ["clampage du cordon retardé d'environ 60 secondes", "cordon intact pendant environ une minute avant le clampage"] },
      intub: { v: "Non", e: ["Le nouveau-né n'a pas été intubé"] },
      compress: { v: "Non", e: ["aucune compression cardiaque n'a été nécessaire"] },
      drugs: { v: "Aucun", e: ["aucun médicament de réanimation n'a été administré"] },
      hypo: { v: "Non", e: ["sans hypoglycémie"] },
    },
    notes: [
      { role: "Obstétrique — consultation anténatale", date: "2026-04-06", type: "antenatal", text: "Grossesse à faible risque avec mouvements fœtaux normaux. Aucune comorbidité maternelle et aucun autre antécédent médical notable. Rupture prolongée des membranes pendant plus de 24 heures avant l'accouchement, qui a été enregistrée comme facteur de risque de sepsis." },
      { role: "Obstétrique — Dr Hannah Reid", date: "2026-04-06", type: "birth_summary", text: "Accouchement par forceps pour deuxième stade prolongé. Le liquide était clair sans signe de chorioamniotite et aucun événement sentinelle. Le prélèvement artériel au cordon a coagulé et aucun pH valide n'est disponible. Nouveau-né vigoureux ; clampage du cordon retardé d'environ 60 secondes avant la prise en charge." },
      { role: "Sage-femme — Leah Morgan", date: "2026-04-06", type: "delivery", text: "Accouchement par voie basse assistée. Le nouveau-né a crié immédiatement et a été gardé sur la poitrine de la mère avec le cordon intact pendant environ une minute avant le clampage." },
      { role: "Néonatologie — compte rendu de réanimation", date: "2026-04-06", type: "resuscitation", text: "Aucune réanimation nécessaire. Le nouveau-né n'a pas été intubé, aucune compression cardiaque n'a été nécessaire et aucun médicament de réanimation n'a été administré." },
      { role: "Service post-natal — examen du nouveau-né", date: "2026-04-08", type: "postnatal", text: "Examen du nouveau-né normal. Glycémie dans les limites de la normale sans hypoglycémie. Sortie à domicile à J3." },
    ],
  },

  CPH004: {
    code: "CPH004", baby: "cph-baby-004",
    gestWeeks: 39, gestDays: 2, maternalAge: 28, parity: 1,
    normalScans: "Oui", normalDopplers: "Oui", ctgDone: "Oui",
    delivery: "Voie basse spontanée", birthWeight: 3350, apgar1: 8, apgar5: 9, apgar10: 10,
    cordPh: 7.26, baseExcess: -4.1, lactate: 3.6,
    ward: "Service post-natal",
    gasRepeated: "Non", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "Non", ageDischargeHome: 2,
    unitQuestionnaire: "Oui", guidelineCordGas: "Oui", guidelineFetalAcidosis: "Non",
    i: {
      fm: { v: "Normaux", e: ["les mouvements fœtaux étaient normaux tout du long"] },
      mc: { v: "Aucune", e: ["Aucune comorbidité maternelle"] },
      mco: { v: "Aucun", e: ["aucun autre antécédent médical notable"] },
      lm: { v: "Clair", e: ["Le liquide était clair"] },
      chorio: { v: "Non", e: ["aucun signe de chorioamniotite"] },
      prom: { v: "Non", e: ["sans rupture prolongée des membranes"] },
      rffs: { v: "Non", e: ["Aucun facteur de risque de sepsis"] },
      sentinel: { v: "Aucun", e: ["aucun événement sentinelle"] },
      dcc: { v: "Oui", e: ["clampage tardif du cordon pendant environ 60 secondes", "Cordon laissé battre pendant environ une minute avant le clampage"] },
      intub: { v: "Non", e: ["Le nouveau-né n'a pas été intubé"] },
      compress: { v: "Non", e: ["aucune compression cardiaque n'a été nécessaire"] },
      drugs: { v: "Aucun", e: ["aucun médicament de réanimation n'a été administré"] },
      hypo: { v: "Non", e: ["sans hypoglycémie"] },
    },
    notes: [
      { role: "Obstétrique — consultation anténatale", date: "2026-04-09", type: "antenatal", text: "Grossesse à faible risque et les mouvements fœtaux étaient normaux tout du long. Aucune comorbidité maternelle et aucun autre antécédent médical notable. Membranes rompues au début du travail sans rupture prolongée des membranes. Aucun facteur de risque de sepsis n'a été identifié." },
      { role: "Obstétrique — Dr Hannah Reid", date: "2026-04-09", type: "birth_summary", text: "Nouveau-né à terme né par voie basse spontanée à 39+2. Le liquide était clair et il n'y avait aucun signe de chorioamniotite. Il n'y a eu aucun événement sentinelle. Gaz du cordon rassurants (pH artériel 7,26), avec clampage tardif du cordon pendant environ 60 secondes." },
      { role: "Sage-femme — Leah Morgan", date: "2026-04-09", type: "delivery", text: "Accouchement par voie basse spontanée avec peau à peau immédiat. Cordon laissé battre pendant environ une minute avant le clampage. Apgar 8 et 9, nouveau-né rose et actif." },
      { role: "Néonatologie — compte rendu de réanimation", date: "2026-04-09", type: "resuscitation", text: "Aucune réanimation active nécessaire. Le nouveau-né n'a pas été intubé, aucune compression cardiaque n'a été nécessaire et aucun médicament de réanimation n'a été administré." },
      { role: "Service post-natal — examen du nouveau-né", date: "2026-04-11", type: "postnatal", text: "Examen néonatal de routine normal. La glycémie est restée dans les limites de la normale sans hypoglycémie. Bonne prise alimentaire ; sortie à domicile à J2." },
    ],
  },

  CPH005: {
    code: "CPH005", baby: "cph-baby-005",
    gestWeeks: 41, gestDays: 0, maternalAge: 33, parity: 3,
    normalScans: "Oui", normalDopplers: "Oui", ctgDone: "Oui",
    delivery: "Voie basse spontanée", birthWeight: 4120, apgar1: 6, apgar5: 8, apgar10: 9,
    cordPh: 7.12, baseExcess: -9.8, lactate: 7.2,
    ward: "Service post-natal",
    gasRepeated: "Oui", ageRepeatedGas: 1, repeatedLactate: 4.1, ageGasNormalised: 6,
    admittedNicu: "Non", ageDischargeHome: 2,
    unitQuestionnaire: "Oui", guidelineCordGas: "Oui", guidelineFetalAcidosis: "Non",
    i: {
      fm: { v: "Normaux", e: ["Mouvements fœtaux normaux tout du long"] },
      mc: { v: "Diabète gestationnel", e: ["diabète gestationnel"] },
      mco: { v: "Traité par insuline", e: ["traité par insuline"] },
      lm: { v: "Clair", e: ["Le liquide était clair"] },
      chorio: { v: "Non", e: ["sans signe de chorioamniotite"] },
      prom: { v: "Non", e: ["Aucune rupture prolongée des membranes"] },
      rffs: { v: "Non", e: ["aucun facteur de risque de sepsis"] },
      sentinel: { v: "Dystocie des épaules", e: ["dystocie des épaules résolue en moins de 90 secondes"] },
      dcc: { v: "Non", e: ["le cordon a été clampé précocement et le nouveau-né transféré sur la table de réanimation", "Clampage immédiat et transfert sur la table de réanimation"] },
      intub: { v: "Non", e: ["Le nouveau-né n'a pas été intubé"] },
      compress: { v: "Non", e: ["aucune compression cardiaque n'a été nécessaire"] },
      drugs: { v: "Aucun", e: ["aucun médicament de réanimation n'a été administré"] },
      hypo: { v: "Oui", e: ["Hypoglycémie au cours du premier jour"] },
    },
    notes: [
      { role: "Obstétrique — consultation anténatale", date: "2026-04-11", type: "antenatal", text: "Grossesse compliquée par un diabète gestationnel, traité par insuline, avec un nouveau-né macrosome aux échographies de croissance. Mouvements fœtaux normaux tout du long. Aucune rupture prolongée des membranes et aucun facteur de risque de sepsis." },
      { role: "Obstétrique — Dr Mark Alvarez", date: "2026-04-11", type: "birth_summary", text: "Accouchement par voie basse spontanée compliqué par une dystocie des épaules résolue en moins de 90 secondes. Le liquide était clair sans signe de chorioamniotite. Le nouveau-né a nécessité une stimulation et une brève ventilation au masque, donc le cordon a été clampé précocement et le nouveau-né transféré sur la table de réanimation." },
      { role: "Sage-femme — Leah Morgan", date: "2026-04-11", type: "delivery", text: "Accouchement difficile compliqué par une dystocie des épaules. Clampage immédiat et transfert sur la table de réanimation pour des insufflations." },
      { role: "Néonatologie — compte rendu de réanimation", date: "2026-04-11", type: "resuscitation", text: "Brève ventilation au masque réalisée avec une bonne réponse. Le nouveau-né n'a pas été intubé, aucune compression cardiaque n'a été nécessaire et aucun médicament de réanimation n'a été administré." },
      { role: "Service post-natal — examen du nouveau-né", date: "2026-04-13", type: "postnatal", text: "Nourrisson macrosome de mère diabétique. Hypoglycémie au cours du premier jour nécessitant des compléments alimentaires et une surveillance, résolue par la suite." },
    ],
  },

  CPH006: {
    code: "CPH006", baby: "cph-baby-006",
    gestWeeks: 35, gestDays: 5, maternalAge: 27, parity: 0,
    normalScans: "Non", normalDopplers: "Non", ctgDone: "Oui",
    delivery: "Césarienne en urgence", birthWeight: 2680, apgar1: 5, apgar5: 7, apgar10: 8,
    cordPh: 7.18, baseExcess: -8.1, lactate: 6.4,
    ward: "NICU",
    gasRepeated: "Non", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "Oui", ageDischargeHome: 16,
    unitQuestionnaire: "Oui", guidelineCordGas: "Oui", guidelineFetalAcidosis: "Non",
    i: {
      fm: { v: "Normaux", e: ["Mouvements fœtaux normaux rapportés"] },
      mc: { v: "Aucune", e: ["Aucune comorbidité maternelle préexistante"] },
      mco: { v: "Aucun", e: ["aucun autre antécédent médical notable"] },
      lm: { v: "Clair", e: ["Le liquide était clair"] },
      chorio: { v: "Suspectée", e: ["suspicion de chorioamniotite"] },
      prom: { v: "Oui", e: ["Rupture prolongée des membranes au-delà de 18 heures"] },
      rffs: { v: "Oui", e: ["enregistrée comme facteur de risque de sepsis"] },
      sentinel: { v: "Aucun", e: ["aucun événement sentinelle"] },
      dcc: { v: "Non", e: ["Nouveau-né prématuré clampé promptement et transféré en NICU", "sans clampage tardif en raison de la prématurité"] },
      intub: { v: "Non", e: ["Le nouveau-né n'a pas été intubé"] },
      compress: { v: "Non", e: ["aucune compression cardiaque n'a été nécessaire"] },
      drugs: { v: "Aucun", e: ["aucun médicament de réanimation n'a été administré"] },
      hypo: { v: "Oui", e: ["épisodes d'hypoglycémie dans les premiers jours"] },
    },
    n: {
      admitAge: 0.4, transferredOut: "Non", durationDays: 14,
      cooled: { v: "Non", e: ["l'hypothermie thérapeutique n'était pas indiquée"] },
      ageCooling: { v: "N/A", e: ["l'hypothermie thérapeutique n'était pas indiquée"] },
      cfm: { v: "Non réalisé", e: ["aucun CFM n'a été utilisé"], explanation: "Admis en NICU pour prématurité et suspicion de sepsis plutôt que pour encéphalopathie, donc aucune surveillance CFM n'a été utilisée — enregistré explicitement comme non réalisé." },
      seizures: { v: "Non", e: ["Aucune convulsion clinique n'a été notée"] },
      clinical: { v: "Non", e: ["Aucune convulsion clinique n'a été notée"] },
      electro: { v: "Non", e: ["aucune convulsion électrographique n'a été enregistrée"] },
      mri: { v: "Non réalisée", e: ["Aucune IRM n'a été réalisée"] },
      feeding: { v: "Alimentation par sonde et au sein", e: ["alimentation par sonde nasogastrique et au sein"] },
      abnNeuro: { v: "Non", e: ["Neurologiquement normal à la sortie"] },
    },
    notes: [
      { role: "Obstétrique — consultation anténatale", date: "2026-04-13", type: "antenatal", text: "Travail prématuré à 35+5. Mouvements fœtaux normaux rapportés. Rupture prolongée des membranes au-delà de 18 heures avec pyrexie maternelle, enregistrée comme facteur de risque de sepsis. Aucune comorbidité maternelle préexistante et aucun autre antécédent médical notable. Les échographies de croissance avaient été limitées au cours de cette grossesse." },
      { role: "Obstétrique — Dr Hannah Reid", date: "2026-04-13", type: "birth_summary", text: "Césarienne en urgence à 35+5 pour suspicion de chorioamniotite. Le liquide était clair et il n'y a eu aucun événement sentinelle. Nouveau-né prématuré clampé promptement et transféré en NICU pour CPAP et antibiotiques." },
      { role: "Sage-femme — Leah Morgan", date: "2026-04-13", type: "delivery", text: "Accouchement prématuré ; nouveau-né confié à l'équipe néonatale sans clampage tardif en raison de la prématurité et du besoin de support respiratoire." },
      { role: "Néonatologie — compte rendu de réanimation", date: "2026-04-13", type: "resuscitation", text: "Stabilisé sous CPAP. Le nouveau-né n'a pas été intubé, aucune compression cardiaque n'a été nécessaire et aucun médicament de réanimation n'a été administré." },
      { role: "Néonatologie — métabolique néonatal", date: "2026-04-15", type: "postnatal", text: "Nourrisson prématuré avec épisodes d'hypoglycémie dans les premiers jours nécessitant une alimentation par sonde nasogastrique et une surveillance." },
      { role: "Néonatologie — Dr Priya Shah", date: "2026-04-13", type: "nicu_admission", text: "Admis en NICU à 0,4 heure pour prématurité et suspicion de sepsis. Il ne s'agissait pas d'un parcours d'encéphalopathie, donc l'hypothermie thérapeutique n'était pas indiquée et aucun CFM n'a été utilisé." },
      { role: "Neurologie — note de revue", date: "2026-04-20", type: "neurology_report", text: "Aucune convulsion clinique n'a été notée et aucune convulsion électrographique n'a été enregistrée. Aucune IRM n'a été réalisée car il n'y avait aucun signe d'encéphalopathie." },
      { role: "Néonatologie — compte rendu de sortie", date: "2026-04-29", type: "discharge", text: "Sortie à domicile à J16 avec alimentation par sonde nasogastrique et au sein. Neurologiquement normal à la sortie." },
    ],
  },

  CPH007: {
    code: "CPH007", baby: "cph-baby-007",
    gestWeeks: 39, gestDays: 0, maternalAge: 38, parity: 1,
    normalScans: "Oui", normalDopplers: "Non", ctgDone: "Oui",
    delivery: "Ventouse", birthWeight: 3030, apgar1: 7, apgar5: 9, apgar10: 10,
    cordPh: 7.24, baseExcess: -5.6, lactate: null,
    ward: "Service post-natal",
    gasRepeated: "Non", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "Non", ageDischargeHome: 2,
    unitQuestionnaire: "Oui", guidelineCordGas: "Oui", guidelineFetalAcidosis: "Non",
    i: {
      fm: { v: "Diminués", e: ["Une diminution des mouvements fœtaux a motivé une évaluation"] },
      mc: { v: "Pré-éclampsie", e: ["pré-éclampsie"] },
      mco: { v: "Sous labétalol", e: ["traitée par labétalol"] },
      lm: { v: "Clair", e: ["Le liquide était clair"] },
      chorio: { v: "Non", e: ["sans signe de chorioamniotite"] },
      prom: { v: "Non", e: ["Aucune rupture prolongée des membranes"] },
      rffs: { v: "Non", e: ["aucun facteur de risque de sepsis"] },
      sentinel: { v: "Aucun", e: ["aucun événement sentinelle"] },
      dcc: { v: "Non", e: ["Cordon clampé précocement pour accélérer l'évaluation", "clampage immédiat du cordon documenté"] },
      intub: { v: "Non", e: ["Le nouveau-né n'a pas été intubé"] },
      compress: { v: "Non", e: ["aucune compression cardiaque n'a été nécessaire"] },
      drugs: { v: "Aucun", e: ["aucun médicament de réanimation n'a été administré"] },
      hypo: { v: "Non", e: ["sans hypoglycémie"] },
    },
    notes: [
      { role: "Obstétrique — consultation anténatale", date: "2026-04-16", type: "antenatal", text: "Grossesse compliquée par une pré-éclampsie, traitée par labétalol. Une diminution des mouvements fœtaux a motivé une évaluation. Aucune rupture prolongée des membranes et aucun facteur de risque de sepsis." },
      { role: "Obstétrique — Dr Mark Alvarez", date: "2026-04-16", type: "birth_summary", text: "Accouchement par ventouse pour souffrance fœtale faisant suite à une diminution des mouvements fœtaux. Le liquide était clair sans signe de chorioamniotite et aucun événement sentinelle. Cordon clampé précocement pour accélérer l'évaluation ; gaz du cordon rassurant (pH 7,24)." },
      { role: "Sage-femme — Leah Morgan", date: "2026-04-16", type: "delivery", text: "Accouchement par ventouse. Nouveau-né évalué promptement par l'équipe ; clampage immédiat du cordon documenté." },
      { role: "Néonatologie — compte rendu de réanimation", date: "2026-04-16", type: "resuscitation", text: "Aucune réanimation nécessaire. Le nouveau-né n'a pas été intubé, aucune compression cardiaque n'a été nécessaire et aucun médicament de réanimation n'a été administré." },
      { role: "Service post-natal — examen du nouveau-né", date: "2026-04-18", type: "postnatal", text: "Examen du nouveau-né normal. Glycémie dans les limites de la normale sans hypoglycémie. Sortie à domicile à J2." },
    ],
  },

  CPH008: {
    code: "CPH008", baby: "cph-baby-008",
    gestWeeks: 40, gestDays: 3, maternalAge: 30, parity: 2,
    normalScans: "Oui", normalDopplers: "Oui", ctgDone: "Non",
    delivery: "Voie basse spontanée", birthWeight: 3520, apgar1: 9, apgar5: 10, apgar10: 10,
    cordPh: 7.31, baseExcess: -2.2, lactate: 2.4,
    ward: "Service post-natal",
    gasRepeated: "Non", ageRepeatedGas: null, repeatedLactate: null, ageGasNormalised: null,
    admittedNicu: "Non", ageDischargeHome: 1,
    unitQuestionnaire: "Oui", guidelineCordGas: "Oui", guidelineFetalAcidosis: "Non",
    i: {
      fm: { v: "Normaux", e: ["mouvements fœtaux normaux tout du long"] },
      mc: { v: "Aucune", e: ["Aucune comorbidité maternelle"] },
      mco: { v: "Aucun", e: ["aucun autre antécédent médical notable"] },
      lm: { v: "Clair", e: ["Le liquide était clair"] },
      chorio: { v: "Non", e: ["sans signe de chorioamniotite"] },
      prom: { v: "Non", e: ["Aucune rupture prolongée des membranes"] },
      rffs: { v: "Non", e: ["aucun facteur de risque de sepsis"] },
      sentinel: { v: "Aucun", e: ["aucun événement sentinelle"] },
      dcc: { v: "Oui", e: ["le cordon clampé après l'arrêt des pulsations", "Cordon laissé intact jusqu'à l'arrêt des pulsations avant le clampage"] },
      intub: { v: "Non", e: ["Le nouveau-né n'a pas été intubé"] },
      compress: { v: "Non", e: ["aucune compression cardiaque n'a été nécessaire"] },
      drugs: { v: "Aucun", e: ["aucun médicament de réanimation n'a été administré"] },
      hypo: { v: "Non", e: ["sans hypoglycémie"] },
    },
    notes: [
      { role: "Obstétrique — consultation anténatale", date: "2026-04-20", type: "antenatal", text: "Grossesse à faible risque avec mouvements fœtaux normaux tout du long. Aucune comorbidité maternelle et aucun autre antécédent médical notable. Aucune rupture prolongée des membranes et aucun facteur de risque de sepsis." },
      { role: "Obstétrique — Dr Hannah Reid", date: "2026-04-20", type: "birth_summary", text: "Accouchement dans l'eau sans complication à 40+3. Le liquide était clair sans signe de chorioamniotite et aucun événement sentinelle. Gestion optimale du cordon appliquée, avec le cordon clampé après l'arrêt des pulsations." },
      { role: "Sage-femme — Leah Morgan", date: "2026-04-20", type: "delivery", text: "Accouchement physiologique dans l'eau. Cordon laissé intact jusqu'à l'arrêt des pulsations avant le clampage. Apgar 9 et 10." },
      { role: "Néonatologie — compte rendu de réanimation", date: "2026-04-20", type: "resuscitation", text: "Aucune réanimation nécessaire. Le nouveau-né n'a pas été intubé, aucune compression cardiaque n'a été nécessaire et aucun médicament de réanimation n'a été administré." },
      { role: "Service post-natal — examen du nouveau-né", date: "2026-04-21", type: "postnatal", text: "Examen du nouveau-né normal. Glycémie dans les limites de la normale sans hypoglycémie. Sortie à domicile à J1." },
    ],
  },

  CPH009: {
    code: "CPH009", baby: "cph-baby-009",
    gestWeeks: 38, gestDays: 1, maternalAge: 36, parity: 1,
    normalScans: "Oui", normalDopplers: "Non", ctgDone: "Oui",
    delivery: "Césarienne en urgence", birthWeight: 3260, apgar1: 2, apgar5: 4, apgar10: 6,
    cordPh: 6.98, baseExcess: -18.7, lactate: 12.8,
    ward: "NICU",
    gasRepeated: "Oui", ageRepeatedGas: 1, repeatedLactate: 9.1, ageGasNormalised: "Non normalisé",
    admittedNicu: "Oui", ageDischargeHome: null,
    unitQuestionnaire: "Oui", guidelineCordGas: "Oui", guidelineFetalAcidosis: "Non",
    i: {
      fm: { v: "Diminués", e: ["Diminution des mouvements fœtaux rapportée le jour de l'admission"] },
      mc: { v: "Antécédent de césarienne", e: ["césarienne segmentaire basse antérieure"] },
      mco: { v: "Une césarienne antérieure", e: ["une césarienne segmentaire basse antérieure"] },
      lm: { v: "Méconium", e: ["Liquide fortement teinté de méconium"] },
      chorio: { v: "Non", e: ["aucun signe de chorioamniotite"] },
      prom: { v: "Non", e: ["Aucune rupture prolongée des membranes"] },
      rffs: { v: "Non", e: ["aucun autre facteur de risque de sepsis"] },
      sentinel: { v: "Rupture utérine", e: ["Césarienne en urgence pour rupture utérine"] },
      dcc: { v: "Non", e: ["Nouveau-né clampé immédiatement pour la réanimation", "aucun clampage tardif du cordon"] },
      intub: { v: "Oui", e: ["Nouveau-né intubé à la naissance"] },
      compress: { v: "Oui", e: ["compressions thoraciques continues"] },
      drugs: { v: "Adrénaline", e: ["doses répétées d'adrénaline"] },
      hypo: { v: "Oui", e: ["Hypoglycémie sévère dans les premières heures"] },
    },
    n: {
      admitAge: 0.3, transferredOut: "Oui", durationDays: 7,
      cooled: { v: "Oui", e: ["Hypothermie thérapeutique débutée"] },
      ageCooling: { v: "1.8", e: ["débutée à 1,8 heure"] },
      cfm: { v: "Conflit", e: ["Tracé CFM au lit du patient initialement lu comme un tracé de fond normal", "enregistre des convulsions électrographiques", "contredisant l'impression du CFM au lit du patient"], explanation: "La note CFM au lit du patient a lu un tracé de fond normal, mais le compte rendu neurologique formel enregistre des convulsions électrographiques — signalé comme un conflit avec le dossier structuré." },
      seizures: { v: "Oui", e: ["enregistre des convulsions électrographiques"] },
      clinical: { v: "Oui", e: ["Des convulsions cliniques ont également été observées"] },
      electro: { v: "Oui", e: ["enregistre des convulsions électrographiques"] },
      mri: { v: "Lésion des noyaux gris centraux et du thalamus", e: ["une lésion des noyaux gris centraux et du thalamus à l'IRM"] },
      feeding: { v: "Alimentation par sonde nasogastrique", e: ["alimentation par sonde nasogastrique"] },
      abnNeuro: { v: "Oui", e: ["tonus anormal et mouvements diminués au transfert"] },
    },
    notes: [
      { role: "Obstétrique — consultation anténatale", date: "2026-04-23", type: "antenatal", text: "Tentative d'accouchement par voie basse après césarienne avec une césarienne segmentaire basse antérieure. Diminution des mouvements fœtaux rapportée le jour de l'admission. Aucune rupture prolongée des membranes et aucun autre facteur de risque de sepsis." },
      { role: "Obstétrique — Dr Mark Alvarez", date: "2026-04-23", type: "birth_summary", text: "Césarienne en urgence pour rupture utérine avec acidose métabolique sévère. Liquide fortement teinté de méconium a été noté. Il n'y avait aucun signe de chorioamniotite. Nouveau-né clampé immédiatement pour la réanimation." },
      { role: "Sage-femme — Leah Morgan", date: "2026-04-23", type: "delivery", text: "Césarienne en extrême urgence. Nouveau-né confié immédiatement à l'équipe néonatale ; aucun clampage tardif du cordon." },
      { role: "Néonatologie — compte rendu de réanimation", date: "2026-04-23", type: "resuscitation", text: "Nouveau-né intubé à la naissance avec compressions thoraciques continues et doses répétées d'adrénaline avant le retour de la circulation." },
      { role: "Néonatologie — métabolique néonatal", date: "2026-04-24", type: "postnatal", text: "Hypoglycémie sévère dans les premières heures nécessitant du dextrose intraveineux, dans le contexte d'une encéphalopathie importante." },
      { role: "Néonatologie — note au lit du patient", date: "2026-04-23", type: "nicu_admission", text: "Admis en NICU à 0,3 heure avec une encéphalopathie sévère. Hypothermie thérapeutique débutée à 1,8 heure de vie avant le transfert. Tracé CFM au lit du patient initialement lu comme un tracé de fond normal pendant les premières heures après l'admission." },
      { role: "Neurologie — compte rendu formel", date: "2026-04-25", type: "neurology_report", text: "Le compte rendu neurologique formel enregistre des convulsions électrographiques et une lésion des noyaux gris centraux et du thalamus à l'IRM, contredisant l'impression du CFM au lit du patient d'un tracé de fond normal. Des convulsions cliniques ont également été observées." },
      { role: "Néonatologie — compte rendu de transfert", date: "2026-04-30", type: "discharge", text: "Transféré au centre régional d'hypothermie et de neurologie à J7 pour la suite des soins, donc n'a pas été renvoyé à domicile depuis cette unité. Sous alimentation par sonde nasogastrique avec tonus anormal et mouvements diminués au transfert." },
    ],
  },
};

// --- Records: Chest Pain (Flow B) -------------------------------------------
const chest = {
  CP001: {
    code: "CP001", age: 58, troponin: 320, ecg: "Sus-décalage du segment ST, V2-V4", timeToEcg: 8,
    complaint: "Douleur thoracique constrictive centrale", diagnosis: "STEMI", decision: "Admission",
    complaintEvidence: ["douleur thoracique constrictive centrale irradiant vers le bras gauche"],
    ecgEvidence: ["sus-décalage du segment ST en V2-V4"],
    diagnosisEvidence: ["un STEMI antérieur"],
    decisionEvidence: ["Admis en salle de cathétérisme cardiaque pour une angioplastie primaire"],
    notes: {
      triage: { role: "Infirmier des urgences — Triage", date: "2026-05-04", type: "triage", text: "Homme de 58 ans présentant depuis 40 minutes une douleur thoracique constrictive centrale irradiant vers le bras gauche, associée à des sueurs et des nausées." },
      cardiology: { role: "Cardiologie — Dr Mark Alvarez", date: "2026-05-04", type: "cardiology", text: "L'ECG montre un sus-décalage du segment ST en V2-V4 compatible avec un STEMI antérieur. Troponine nettement élevée. Adressé pour une angioplastie primaire." },
      discharge: { role: "Médecine d’urgence — Sortie", date: "2026-05-04", type: "discharge_summary", text: "Admis en salle de cathétérisme cardiaque pour une angioplastie primaire et transféré en unité de soins intensifs coronaires." },
    },
  },
  CP002: {
    code: "CP002", age: 47, troponin: 4, ecg: "Rythme sinusal normal", timeToEcg: 14,
    complaint: "Douleur thoracique gauche pleurétique", diagnosis: "Douleur thoracique non cardiaque", decision: "Sortie",
    complaintEvidence: ["douleur thoracique gauche aiguë intermittente, majorée à l'inspiration"],
    ecgEvidence: ["rythme sinusal normal sans modifications ischémiques"],
    diagnosisEvidence: ["une cause cardiaque est peu probable"],
    decisionEvidence: ["Retour à domicile avec consignes de surveillance"],
    notes: {
      triage: { role: "Infirmier des urgences — Triage", date: "2026-05-05", type: "triage", text: "Femme de 47 ans présentant une douleur thoracique gauche aiguë intermittente, majorée à l'inspiration, sans irradiation." },
      cardiology: { role: "Cardiologie — Dr Sara Lin", date: "2026-05-05", type: "cardiology", text: "ECG en rythme sinusal normal sans modifications ischémiques. Troponine sérielle négative. Douleur reproductible à la palpation, donc une cause cardiaque est peu probable." },
      discharge: { role: "Médecine d’urgence — Sortie", date: "2026-05-05", type: "discharge_summary", text: "Retour à domicile avec consignes de surveillance et suivi par le médecin traitant." },
    },
  },
  CP003: {
    code: "CP003", age: 63, troponin: 95, ecg: "Inversion de l'onde T, inférieure", timeToEcg: 11,
    complaint: "Douleur thoracique irradiant vers la mâchoire", diagnosis: "NSTEMI", decision: "Admission",
    complaintEvidence: ["douleur thoracique intense au repos, irradiant vers la mâchoire"],
    ecgEvidence: ["inversion de l'onde T dans les dérivations inférieures"],
    diagnosisEvidence: ["en accord avec un NSTEMI"],
    decisionEvidence: ["Admis en cardiologie"],
    notes: {
      triage: { role: "Infirmier des urgences — Triage", date: "2026-05-07", type: "triage", text: "Homme de 63 ans présentant depuis deux heures une douleur thoracique intense au repos, irradiant vers la mâchoire, avec une dyspnée associée." },
      cardiology: { role: "Cardiologie — Dr Mark Alvarez", date: "2026-05-07", type: "cardiology", text: "L'ECG montre une inversion de l'onde T dans les dérivations inférieures. Élévation de la troponine au dosage sériel en accord avec un NSTEMI. Pour un traitement antiagrégant plaquettaire." },
      discharge: { role: "Médecine d’urgence — Sortie", date: "2026-05-07", type: "discharge_summary", text: "Admis en cardiologie pour un NSTEMI avec une coronarographie hospitalière programmée." },
    },
  },
  CP004: {
    code: "CP004", age: 72, troponin: null, troponinMissing: true, ecg: "FA, réponse ventriculaire rapide", timeToEcg: 19,
    complaint: "Dyspnée et oppression thoracique", diagnosis: "FA rapide, ?ACS", decision: "Admission",
    complaintEvidence: ["dyspnée et une oppression thoracique"],
    troponinEvidence: ["s'est hémolysé pendant le transport et la troponine n'a pas pu être rapportée"],
    ecgEvidence: ["une fibrillation auriculaire avec une réponse ventriculaire rapide"],
    diagnosisEvidence: ["un syndrome coronarien aigu n'est pas exclu"],
    decisionEvidence: ["Admis en unité d'évaluation médicale"],
    notes: {
      triage: { role: "Infirmier des urgences — Triage", date: "2026-05-09", type: "triage", text: "Femme de 72 ans présentant une dyspnée et une oppression thoracique et un pouls irrégulièrement irrégulier." },
      lab: { role: "Laboratoire — Biochimie", date: "2026-05-09", type: "lab", text: "L'échantillon sanguin s'est hémolysé pendant le transport et la troponine n'a pas pu être rapportée. Un nouvel échantillon a été demandé." },
      cardiology: { role: "Cardiologie — Dr Sara Lin", date: "2026-05-09", type: "cardiology", text: "L'ECG montre une fibrillation auriculaire avec une réponse ventriculaire rapide. Contrôle de la fréquence débuté ; un syndrome coronarien aigu n'est pas exclu en attendant un nouveau dosage de troponine." },
      discharge: { role: "Médecine d’urgence — Sortie", date: "2026-05-09", type: "discharge_summary", text: "Admis en unité d'évaluation médicale pour un contrôle de la fréquence et un nouveau dosage de troponine." },
    },
  },
  CP005: {
    code: "CP005", age: 35, troponin: 6, ecg: null, ecgMissing: true, timeToEcg: null,
    complaint: "Douleur thoracique de type musculo-squelettique", diagnosis: "Douleur thoracique musculo-squelettique", decision: "Sortie",
    complaintEvidence: ["douleur thoracique gauche aiguë après une séance de sport"],
    diagnosisEvidence: ["probablement une douleur thoracique musculo-squelettique"],
    decisionEvidence: ["Sortie avec antalgiques simples"],
    notes: {
      triage: { role: "Infirmier des urgences — Triage", date: "2026-05-10", type: "triage", text: "Homme de 35 ans présentant une douleur thoracique gauche aiguë après une séance de sport, reproductible au mouvement." },
      cardiology: { role: "Cardiologie — Dr Sara Lin", date: "2026-05-10", type: "cardiology", text: "Faible suspicion clinique d'une cause cardiaque et troponine négative. Le patient est sorti contre avis avant qu'un ECG ne puisse être enregistré." },
      discharge: { role: "Médecine d’urgence — Sortie", date: "2026-05-10", type: "discharge_summary", text: "Sortie avec antalgiques simples pour probablement une douleur thoracique musculo-squelettique." },
    },
  },
  CP006: {
    code: "CP006", age: 55, troponin: 12, ecg: "Rythme sinusal normal", timeToEcg: 22,
    complaint: "Oppression thoracique d'effort", diagnosis: "Angor stable", decision: "Admission",
    complaintEvidence: ["oppression thoracique à l'effort au cours de la semaine écoulée"],
    ecgEvidence: ["ECG de repos en rythme sinusal normal"],
    diagnosisEvidence: ["évocatrice d'un angor stable"],
    decisionEvidence: ["Admis en unité d'observation"],
    notes: {
      triage: { role: "Infirmier des urgences — Triage", date: "2026-05-12", type: "triage", text: "Homme de 55 ans présentant une oppression thoracique à l'effort au cours de la semaine écoulée, soulagée par le repos." },
      cardiology: { role: "Cardiologie — Dr Mark Alvarez", date: "2026-05-12", type: "cardiology", text: "ECG de repos en rythme sinusal normal. Troponine à la limite supérieure de référence sans variation dynamique. Anamnèse évocatrice d'un angor stable." },
      discharge: { role: "Médecine d’urgence — Sortie", date: "2026-05-12", type: "discharge_summary", text: "Admis en unité d'observation pour un dosage sériel de troponine et une épreuve d'effort." },
    },
  },
  CP007: {
    code: "CP007", age: 68, troponin: 210, ecg: "Sous-décalage du segment ST, latéral", timeToEcg: 9,
    complaint: "Douleur épigastrique et thoracique centrale", diagnosis: "NSTEMI", decision: "Admission",
    complaintEvidence: ["douleur épigastrique et thoracique centrale avec vomissements"],
    ecgEvidence: ["sous-décalage du segment ST dans les dérivations latérales"],
    diagnosisEvidence: ["compatible avec un NSTEMI"],
    decisionEvidence: ["Admis en cardiologie"],
    notes: {
      triage: { role: "Infirmier des urgences — Triage", date: "2026-05-14", type: "triage", text: "Femme de 68 ans présentant une douleur épigastrique et thoracique centrale avec vomissements." },
      cardiology: { role: "Cardiologie — Dr Sara Lin", date: "2026-05-14", type: "cardiology", text: "L'ECG montre un sous-décalage du segment ST dans les dérivations latérales. Troponine significativement élevée, compatible avec un NSTEMI. Double antiagrégation plaquettaire débutée." },
      discharge: { role: "Médecine d’urgence — Sortie", date: "2026-05-14", type: "discharge_summary", text: "Admis en cardiologie pour un NSTEMI et une coronarographie hospitalière." },
    },
  },
  CP008: {
    code: "CP008", age: 41, troponin: 3, ecg: "Normal", timeToEcg: 16,
    complaint: "Douleur thoracique après un effort de levage", diagnosis: "Douleur thoracique non cardiaque", decision: "Sortie",
    complaintEvidence: ["douleur thoracique aiguë et fugace faisant suite à un effort de levage important"],
    ecgEvidence: ["ECG normal sans modifications aiguës"],
    diagnosisEvidence: ["Aucun signe de syndrome coronarien aigu"],
    decisionEvidence: ["Retour à domicile avec réassurance"],
    notes: {
      triage: { role: "Infirmier des urgences — Triage", date: "2026-05-16", type: "triage", text: "Homme de 41 ans présentant une douleur thoracique aiguë et fugace faisant suite à un effort de levage important." },
      cardiology: { role: "Cardiologie — Dr Mark Alvarez", date: "2026-05-16", type: "cardiology", text: "ECG normal sans modifications aiguës. Troponine négative au dosage sériel. Aucun signe de syndrome coronarien aigu." },
      discharge: { role: "Médecine d’urgence — Sortie", date: "2026-05-16", type: "discharge_summary", text: "Retour à domicile avec réassurance et conseil de reconsulter en cas de récidive des symptômes." },
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
      insulin: { v: "Insulin pump (CSII)", e: ["Prise en charge par pompe à insuline (CSII)"] },
      cgm: { v: "Yes", e: ["utilisant un capteur de glucose en continu"] },
      lifestyle: { v: "Yes", e: ["Une modification du mode de vie et de l'alimentation a été recommandée"] },
      dietitian: { v: "Yes", e: ["Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé"] },
      psych: { v: "No", e: ["Aucun soutien psychologique supplémentaire n'était nécessaire"] },
      smoking: { v: "No", e: ["ne fume ni ne vapote"] },
    },
    notes: [
      { role: "Diabétologie pédiatrique — Dr Naomi Clarke", date: "2025-11-04", type: "diabetes_clinic", text: "Revue en consultation de diabétologie pédiatrique. Prise en charge par pompe à insuline (CSII) et utilisant un capteur de glucose en continu. Une modification du mode de vie et de l'alimentation a été recommandée pour aider à réduire la glycémie. Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé." },
      { role: "Psychologie clinique — Dr Owen Pratt", date: "2025-11-04", type: "psychology", text: "Dépistage psychologique annuel réalisé. Aucun soutien psychologique supplémentaire n'était nécessaire au-delà des soins de routine." },
      { role: "Diabétologie pédiatrique — revue annuelle", date: "2025-11-04", type: "annual_review", text: "Revue annuelle réalisée. Le jeune ne fume ni ne vapote." },
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
      insulin: { v: "MDI (basal-bolus)", e: ["schéma basal-bolus par injections quotidiennes multiples (MDI)"] },
      cgm: { v: "Yes", e: ["utilisant un capteur de glucose en continu"] },
      lifestyle: { v: "Yes", e: ["Une modification du mode de vie et de l'alimentation a été recommandée"] },
      dietitian: { v: "Yes", e: ["Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé"] },
      psych: { v: "Yes", e: ["Un soutien psychologique supplémentaire en dehors des soins de routine a été recommandé"] },
      smoking: { v: "No", e: ["ne fume ni ne vapote"] },
    },
    notes: [
      { role: "Diabétologie pédiatrique — Dr Naomi Clarke", date: "2025-12-09", type: "diabetes_clinic", text: "Revue en consultation avec une HbA1c au-dessus de l'objectif. Prise en charge par un schéma basal-bolus par injections quotidiennes multiples (MDI) et utilisant un capteur de glucose en continu. Une modification du mode de vie et de l'alimentation a été recommandée pour aider à réduire la glycémie. Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé." },
      { role: "Psychologie clinique — Dr Owen Pratt", date: "2025-12-09", type: "psychology", text: "Dépistage psychologique annuel réalisé. Le jeune trouve l'observance difficile. Un soutien psychologique supplémentaire en dehors des soins de routine a été recommandé." },
      { role: "Diabétologie pédiatrique — revue annuelle", date: "2025-12-09", type: "annual_review", text: "Revue annuelle réalisée. Le jeune ne fume ni ne vapote." },
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
      insulin: { v: "MDI (basal-bolus)", e: ["schéma basal-bolus par injections quotidiennes multiples (MDI)"] },
      cgm: { v: "Yes", e: ["utilisant un capteur de glucose en continu"] },
      lifestyle: { v: "Yes", e: ["Une modification du mode de vie et de l'alimentation a été recommandée"] },
      dietitian: { v: "Yes", e: ["Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé"] },
      psych: { v: "No", e: ["Aucun soutien psychologique supplémentaire n'était nécessaire"] },
      smoking: { v: "No", e: ["ne fume ni ne vapote"] },
      admission: { v: "DKA (new diagnosis)", e: ["acidocétose diabétique (DKA) au moment du nouveau diagnostic"] },
    },
    notes: [
      { role: "Diabétologie pédiatrique — Dr Naomi Clarke", date: "2026-02-19", type: "diabetes_clinic", text: "Première revue en consultation après un nouveau diagnostic. Prise en charge par un schéma basal-bolus par injections quotidiennes multiples (MDI) et utilisant un capteur de glucose en continu. Une modification du mode de vie et de l'alimentation a été recommandée pour aider à réduire la glycémie. Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé." },
      { role: "Psychologie clinique — Dr Owen Pratt", date: "2026-02-19", type: "psychology", text: "Dépistage psychologique réalisé lors de la première revue. Aucun soutien psychologique supplémentaire n'était nécessaire au-delà des soins de routine." },
      { role: "Diabétologie pédiatrique — revue annuelle", date: "2026-02-19", type: "annual_review", text: "Revue réalisée. L'enfant ne fume ni ne vapote." },
      { role: "Pédiatrie — admission", date: "2026-01-22", type: "admission", text: "Admis lors de la présentation en acidocétose diabétique (DKA) au moment du nouveau diagnostic. Traité selon le protocole de DKA par insuline intraveineuse et apports liquidiens, avec une bonne récupération." },
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
      insulin: { v: "Insulin pump (CSII)", e: ["Prise en charge par pompe à insuline (CSII)"] },
      cgm: { v: "Yes", e: ["utilisant un capteur de glucose en continu"] },
      lifestyle: { v: "Yes", e: ["Une modification du mode de vie et de l'alimentation a été recommandée"] },
      dietitian: { v: "No", e: ["Aucun rendez-vous supplémentaire avec le diététicien n'était nécessaire"] },
      psych: { v: "No", e: ["Aucun soutien psychologique supplémentaire n'était nécessaire"] },
      smoking: { v: "No", e: ["ne fume ni ne vapote"] },
    },
    notes: [
      { role: "Diabétologie pédiatrique — Dr Naomi Clarke", date: "2025-10-28", type: "diabetes_clinic", text: "Revue en consultation avec un bon contrôle. Prise en charge par pompe à insuline (CSII) et utilisant un capteur de glucose en continu. Une modification du mode de vie et de l'alimentation a été recommandée pour aider à réduire la glycémie. Aucun rendez-vous supplémentaire avec le diététicien n'était nécessaire lors de cette visite." },
      { role: "Psychologie clinique — Dr Owen Pratt", date: "2025-10-28", type: "psychology", text: "Dépistage psychologique annuel réalisé. Aucun soutien psychologique supplémentaire n'était nécessaire au-delà des soins de routine." },
      { role: "Diabétologie pédiatrique — revue annuelle", date: "2025-10-28", type: "annual_review", text: "Revue annuelle réalisée. L'enfant ne fume ni ne vapote." },
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
      insulin: { v: "MDI (basal-bolus)", e: ["schéma basal-bolus par injections quotidiennes multiples (MDI)"] },
      cgm: { v: "No", e: ["n'utilisant pas actuellement de capteur de glucose en continu"] },
      lifestyle: { v: "Yes", e: ["Une modification du mode de vie et de l'alimentation a été recommandée"] },
      dietitian: { v: "Yes", e: ["Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé"] },
      psych: { v: "Yes", e: ["Un soutien psychologique supplémentaire en dehors des soins de routine a été recommandé"] },
      smoking: { v: "Smokes", e: ["fume actuellement"] },
    },
    notes: [
      { role: "Diabétologie pédiatrique — Dr Naomi Clarke", date: "2025-11-25", type: "diabetes_clinic", text: "Revue en consultation ; le contrôle reste préoccupant. Prise en charge par un schéma basal-bolus par injections quotidiennes multiples (MDI) et n'utilisant pas actuellement de capteur de glucose en continu. Une modification du mode de vie et de l'alimentation a été recommandée pour aider à réduire la glycémie. Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé." },
      { role: "Psychologie clinique — Dr Owen Pratt", date: "2025-11-25", type: "psychology", text: "Dépistage psychologique annuel réalisé. Un soutien psychologique supplémentaire en dehors des soins de routine a été recommandé compte tenu de l'humeur basse et de la détresse liée au diabète." },
      { role: "Diabétologie pédiatrique — revue annuelle", date: "2025-11-25", type: "annual_review", text: "Revue annuelle réalisée. Le jeune fume actuellement ; des conseils de sevrage tabagique ont été proposés." },
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
      insulin: { v: "MDI (basal-bolus)", e: ["schéma basal-bolus par injections quotidiennes multiples (MDI)"] },
      cgm: { v: "No", e: ["n'utilisant pas actuellement de capteur de glucose en continu"] },
      lifestyle: { v: "Yes", e: ["Une modification du mode de vie et de l'alimentation a été recommandée"] },
      dietitian: { v: "Yes", e: ["Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé"] },
      psych: { v: "Yes", e: ["Un soutien psychologique supplémentaire en dehors des soins de routine a été recommandé"] },
      smoking: { v: "No", e: ["ne fume ni ne vapote"] },
      admission: { v: "DKA", e: ["acidocétose diabétique (DKA) faisant suite à une maladie intercurrente"] },
    },
    notes: [
      { role: "Diabétologie pédiatrique — Dr Naomi Clarke", date: "2025-12-16", type: "diabetes_clinic", text: "Revue en consultation après une admission récente. Prise en charge par un schéma basal-bolus par injections quotidiennes multiples (MDI) et n'utilisant pas actuellement de capteur de glucose en continu. Une modification du mode de vie et de l'alimentation a été recommandée pour aider à réduire la glycémie. Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé." },
      { role: "Psychologie clinique — Dr Owen Pratt", date: "2025-12-16", type: "psychology", text: "Dépistage psychologique annuel réalisé. Un soutien psychologique supplémentaire en dehors des soins de routine a été recommandé pour soutenir l'autogestion." },
      { role: "Diabétologie pédiatrique — revue annuelle", date: "2025-12-16", type: "annual_review", text: "Revue annuelle réalisée. L'enfant ne fume ni ne vapote." },
      { role: "Pédiatrie — admission", date: "2025-08-07", type: "admission", text: "Admission en urgence pour acidocétose diabétique (DKA) faisant suite à une maladie intercurrente. Prise en charge selon le protocole de DKA et sortie avec un rappel des règles en cas de maladie." },
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
      insulin: { v: "Insulin pump (CSII)", e: ["Prise en charge par pompe à insuline (CSII)"] },
      cgm: { v: "Yes", e: ["utilisant un capteur de glucose en continu"] },
      lifestyle: { v: "Yes", e: ["Une modification du mode de vie et de l'alimentation a été recommandée"] },
      dietitian: { v: "Yes", e: ["Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé"] },
      psych: { v: "No", e: ["Aucun soutien psychologique supplémentaire n'était nécessaire"] },
      smoking: { v: "No", e: ["ne fume ni ne vapote"] },
    },
    notes: [
      { role: "Diabétologie pédiatrique — Dr Naomi Clarke", date: "2025-11-18", type: "diabetes_clinic", text: "Revue précoce d'un jeune enfant après le diagnostic. Prise en charge par pompe à insuline (CSII) et utilisant un capteur de glucose en continu. Une modification du mode de vie et de l'alimentation a été recommandée à la famille pour aider à réduire la glycémie. Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé." },
      { role: "Psychologie clinique — Dr Owen Pratt", date: "2025-11-18", type: "psychology", text: "Dépistage psychologique réalisé avec la famille. Aucun soutien psychologique supplémentaire n'était nécessaire au-delà des soins de routine." },
      { role: "Diabétologie pédiatrique — revue annuelle", date: "2025-11-18", type: "annual_review", text: "Revue réalisée. L'enfant ne fume ni ne vapote." },
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
      insulin: { v: "Insulin pump (CSII)", e: ["Prise en charge par pompe à insuline (CSII)"] },
      cgm: { v: "Yes", e: ["utilisant un capteur de glucose en continu"] },
      lifestyle: { v: "Yes", e: ["Une modification du mode de vie et de l'alimentation a été recommandée"] },
      dietitian: { v: "Yes", e: ["Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé"] },
      psych: { v: "No", e: ["Aucun soutien psychologique supplémentaire n'était nécessaire"] },
      smoking: { v: "Vapes", e: ["vapote régulièrement"] },
    },
    notes: [
      { role: "Diabétologie pédiatrique — Dr Naomi Clarke", date: "2025-12-02", type: "diabetes_clinic", text: "Revue en consultation. Prise en charge par pompe à insuline (CSII) et utilisant un capteur de glucose en continu. Une modification du mode de vie et de l'alimentation a été recommandée pour aider à réduire la glycémie. Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé." },
      { role: "Psychologie clinique — Dr Owen Pratt", date: "2025-12-02", type: "psychology", text: "Dépistage psychologique annuel réalisé. Aucun soutien psychologique supplémentaire n'était nécessaire au-delà des soins de routine." },
      { role: "Diabétologie pédiatrique — revue annuelle", date: "2025-12-02", type: "annual_review", text: "Revue annuelle réalisée. Le jeune vapote régulièrement ; des conseils de sevrage ont été proposés." },
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
      insulin: { v: "MDI (basal-bolus)", e: ["schéma basal-bolus par injections quotidiennes multiples (MDI)"] },
      cgm: { v: "Yes", e: ["utilisant un capteur de glucose en continu"] },
      lifestyle: { v: "Yes", e: ["Une modification du mode de vie et de l'alimentation a été recommandée"] },
      dietitian: { v: "No", e: ["Aucun rendez-vous supplémentaire avec le diététicien n'était nécessaire"] },
      psych: { v: "No", e: ["Aucun soutien psychologique supplémentaire n'était nécessaire"] },
      smoking: { v: "No", e: ["ne fume ni ne vapote"] },
    },
    notes: [
      { role: "Diabétologie pédiatrique — Dr Naomi Clarke", date: "2025-11-11", type: "diabetes_clinic", text: "Revue en consultation avec un contrôle stable. Prise en charge par un schéma basal-bolus par injections quotidiennes multiples (MDI) et utilisant un capteur de glucose en continu. Une modification du mode de vie et de l'alimentation a été recommandée pour aider à réduire la glycémie. Aucun rendez-vous supplémentaire avec le diététicien n'était nécessaire lors de cette visite." },
      { role: "Psychologie clinique — Dr Owen Pratt", date: "2025-11-11", type: "psychology", text: "Dépistage psychologique annuel réalisé. Aucun soutien psychologique supplémentaire n'était nécessaire au-delà des soins de routine." },
      { role: "Diabétologie pédiatrique — revue annuelle", date: "2025-11-11", type: "annual_review", text: "Revue annuelle réalisée. L'enfant ne fume ni ne vapote." },
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
      insulin: { v: "MDI (basal-bolus)", e: ["schéma basal-bolus par injections quotidiennes multiples (MDI)"] },
      cgm: { v: "Yes", e: ["utilisant un capteur de glucose en continu"] },
      lifestyle: { v: "Yes", e: ["Une modification du mode de vie et de l'alimentation a été recommandée"] },
      dietitian: { v: "Yes", e: ["Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé"] },
      psych: { v: "No", e: ["Aucun soutien psychologique supplémentaire n'était nécessaire"] },
      smoking: { v: "No", e: ["ne fume ni ne vapote"] },
    },
    notes: [
      { role: "Diabétologie pédiatrique — Dr Naomi Clarke", date: "2025-10-21", type: "diabetes_clinic", text: "Revue en consultation. Prise en charge par un schéma basal-bolus par injections quotidiennes multiples (MDI) et utilisant un capteur de glucose en continu. Une modification du mode de vie et de l'alimentation a été recommandée pour aider à réduire la glycémie. Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé." },
      { role: "Psychologie clinique — Dr Owen Pratt", date: "2025-10-21", type: "psychology", text: "Dépistage psychologique annuel réalisé. Aucun soutien psychologique supplémentaire n'était nécessaire au-delà des soins de routine." },
      { role: "Diabétologie pédiatrique — revue annuelle", date: "2025-10-21", type: "annual_review", text: "Revue annuelle réalisée. Le jeune ne fume ni ne vapote." },
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
      insulin: { v: "Insulin pump (CSII)", e: ["Prise en charge par pompe à insuline (CSII)"] },
      cgm: { v: "Yes", e: ["utilisant un capteur de glucose en continu"] },
      lifestyle: { v: "Yes", e: ["Une modification du mode de vie et de l'alimentation a été recommandée"] },
      dietitian: { v: "No", e: ["Aucun rendez-vous supplémentaire avec le diététicien n'était nécessaire"] },
      psych: { v: "No", e: ["Aucun soutien psychologique supplémentaire n'était nécessaire"] },
      smoking: { v: "No", e: ["ne fume ni ne vapote"] },
    },
    notes: [
      { role: "Diabétologie pédiatrique — Dr Naomi Clarke", date: "2025-12-19", type: "diabetes_clinic", text: "Revue en consultation avec un bon contrôle. Prise en charge par pompe à insuline (CSII) et utilisant un capteur de glucose en continu. Une modification du mode de vie et de l'alimentation a été recommandée pour aider à réduire la glycémie. Aucun rendez-vous supplémentaire avec le diététicien n'était nécessaire lors de cette visite." },
      { role: "Psychologie clinique — Dr Owen Pratt", date: "2025-12-19", type: "psychology", text: "Dépistage psychologique annuel réalisé. Aucun soutien psychologique supplémentaire n'était nécessaire au-delà des soins de routine." },
      { role: "Diabétologie pédiatrique — revue annuelle", date: "2025-12-19", type: "annual_review", text: "Revue annuelle réalisée. L'enfant ne fume ni ne vapote." },
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
      insulin: { v: "Diet and metformin (no insulin)", e: ["prise en charge par metformine sans insuline"] },
      cgm: { v: "No", e: ["n'utilisant pas actuellement de capteur de glucose en continu"] },
      lifestyle: { v: "Yes", e: ["Une modification du mode de vie et de l'alimentation a été recommandée"] },
      dietitian: { v: "Yes", e: ["Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé"] },
      psych: { v: "Yes", e: ["Un soutien psychologique supplémentaire en dehors des soins de routine a été recommandé"] },
      smoking: { v: "No", e: ["ne fume ni ne vapote"] },
    },
    notes: [
      { role: "Diabétologie pédiatrique — Dr Naomi Clarke", date: "2025-11-28", type: "diabetes_clinic", text: "Revue en consultation de diabète de type 2 du jeune. Actuellement prise en charge par metformine sans insuline, et n'utilisant pas actuellement de capteur de glucose en continu. Une modification du mode de vie et de l'alimentation a été recommandée pour aider à réduire la glycémie. Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé." },
      { role: "Psychologie clinique — Dr Owen Pratt", date: "2025-11-28", type: "psychology", text: "Dépistage psychologique annuel réalisé. Un soutien psychologique supplémentaire en dehors des soins de routine a été recommandé concernant le poids et le bien-être." },
      { role: "Diabétologie pédiatrique — revue annuelle", date: "2025-11-28", type: "annual_review", text: "Revue annuelle réalisée. Le jeune ne fume ni ne vapote." },
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
    Male: { code: 1, label: "Masculin" },
    Female: { code: 2, label: "Féminin" },
    "Not specified": { code: 3, label: "Non spécifié" },
    Unknown: { code: 99, label: "Inconnu" },
  },
  // item 5 — Ethnic category. `label` is the exact NPDA wording shown as evidence.
  ethnicity: {
    "White British": { code: "A", label: "Blanc - Britannique" },
    "White — Other": { code: "C", label: "Blanc - Tout autre fond blanc" },
    "Mixed — White and Black Caribbean": { code: "D", label: "Métis - Blanc et Noir caribéen" },
    "Asian — Indian": { code: "H", label: "Asiatique - Indien" },
    "Asian — Pakistani": { code: "J", label: "Asiatique - Pakistanais" },
    "Asian — Bangladeshi": { code: "K", label: "Asiatique - Bangladais" },
    "Black Caribbean": { code: "M", label: "Noir - Caribéen" },
    "Black African": { code: "N", label: "Noir - Africain" },
  },
  // item 8 — Diabetes Type.
  diabetesType: {
    "Type 1": { code: 1, label: "Diabète sucré de type 1" },
    "Type 2": { code: 2, label: "Diabète sucré de type 2" },
  },
  // item 21 — Insulin regime at time of visit.
  insulinRegime: {
    "Insulin pump (CSII)": { code: 4, label: "une pompe à insuline autonome" },
    "MDI (basal-bolus)": { code: 3, label: "un schéma basal-bolus par injections quotidiennes multiples (quatre injections ou plus par jour)" },
    "Diet and metformin (no insulin)": { code: 1, label: "pas d'insuline (prise en charge par régime et metformine)" },
  },
  // item 24 — CGM in use.
  cgm: {
    Yes: { code: 1, label: "utilisant un capteur de glucose en continu" },
    No: { code: 2, label: "n'utilisant pas de capteur de glucose en continu" },
  },
  // 1 = Yes, 2 = No, 99 = Unknown — items 23, 48, 51 (labels not displayed).
  yesNo: { Yes: 1, No: 2, Unknown: 99 },
  // item 43 — Does the patient smoke and/or vape?
  smoking: {
    No: { code: 1, label: "non-fumeur et non-vapoteur" },
    Smokes: { code: 2, label: "fumeur actuel (non-vapoteur)" },
    Vapes: { code: 3, label: "vapoteur actuel (non-fumeur)" },
  },
  // item 33 — Retinal screening result.
  retinal: {
    "No retinopathy": { code: 1, label: "Normal" },
    "Background retinopathy": { code: 2, label: "Anormal (rétinopathie de fond)" },
  },
  // item 55 — Reason for admission. Every modelled admission is acute DKA (= 1).
  admissionDka: { code: 1, label: "une admission aiguë pour acidocétose diabétique (DKA)" },
  // --- code→label maps keyed by the permitted-value code ---
  // item 6 — ADHD / ASD diagnosis.
  adhdAsd: { 1: "Oui, TDAH", 2: "Oui, TSA", 3: "Oui, TDAH et TSA", 4: "Non, aucun des deux", 99: "Inconnu" },
  // item 7 — Learning disability. Also items 25, 26, 42 (Yes/No/Unknown).
  yesNo99: { 1: "Oui", 2: "Non", 99: "Inconnu" },
  // item 11 — Reason for leaving service.
  leavingReason: { 1: "Transition vers le service de diabétologie adulte", 2: "Déménagement hors de la zone", 3: "Autre" },
  // item 22 — Other (non-insulin) blood-glucose-lowering medication.
  otherMed: { 1: "Aucun médicament", 2: "Metformine uniquement", 3: "Agoniste du GLP-1", 4: "Inhibiteur du SGLT2", 5: "Autre", 99: "Inconnu" },
  // item 36 — Albuminuria stage.
  albuminuriaStage: { 1: "Normoalbuminurie", 2: "Microalbuminurie", 3: "Macroalbuminurie", 99: "Inconnu" },
  // item 40 — Thyroid treatment.
  thyroidTx: { 1: "Aucun traitement thyroïdien", 2: "Thyroxine pour hypothyroïdie", 3: "Antithyroïdien pour hyperthyroïdie", 99: "Inconnu" },
  // item 49 — Mental health appointment offered.
  mentalHealthAppt: { 1: "Proposé et honoré", 2: "Proposé et non honoré", 3: "Proposé et refusé", 4: "Non proposé", 5: "Soutien en santé mentale obtenu ailleurs", 99: "Inconnu" },
  // item 57 — DKA therapies given during the admission.
  dkaTherapy: { 1: "Sérum salé hypertonique", 2: "Mannitol", 3: "Perfusion de bicarbonate", 4: "Aucun des éléments ci-dessus" },
};

// --- Short inline value labels ----------------------------------------------
const labels = {
  na: "N/A",
  notRecorded: "Non renseigné",
  unavailable: "Indisponible",
  notNormalised: "Non normalisé",
  naTransferred: "N/A (transféré)",
  notDone: "Non réalisé",
  notPerformed: "Non effectué",
  // Displayed cord Yes/No cell values. These are ALSO matched in mockData.js
  // logic (e.g. r.ctgDone === labels.yes), so a translation MUST use the same
  // word for the cord record Yes/No values and for these labels.
  yes: "Oui",
  no: "Non",
};

// --- Right-panel explanation strings (FUNCTIONS; preserve ${…}) -------------
// Each function takes the args it interpolates and returns the user-visible
// explanation. Keyed by builder + field; translate the returned strings, keeping
// the interpolated values (codes, dates, patient codes) in place.
const explain = {
  // gasCell
  gasUnavailable: (code) => `D'après la note du compte rendu de naissance obstétrical pour ${code} — le prélèvement artériel au cordon a coagulé, donc aucun gaz du cordon valide n'a été enregistré.`,
  gasLactateNotRecorded: (code) => `Le panel de gaz du cordon pour ${code} ne comprenait pas de valeur de lactate.`,
  gasPanel: (code) => `D'après le panel de gaz du cordon du DPI pour ${code} — pH de l'artère ombilicale, excès de base et lactate.`,
  // repeatGasField
  repeatGasNone: (code, label) => `Aucun gaz du cordon répété n'a été réalisé pour ${code} — le gaz initial ne le justifiait pas — donc ${label} n'est pas renseigné.`,
  repeatGasNotNormalised: (code, label) => `Le lactate au cordon pour ${code} ne s'était pas normalisé avant le transfert, donc ${label} n'est pas renseigné.`,
  repeatGasValue: (code, label) => `D'après le gaz du cordon répété pour ${code} — ${label}.`,
  // repeatGasField labels (the `label` arg passed into the three above)
  repeatGasLabelAge: "l'âge en heures au gaz répété",
  repeatGasLabelLactate: "le lactate répété",
  repeatGasLabelNormalised: "l'âge en heures auquel le gaz s'est normalisé",

  // makeCordAllCell
  cordPatient: (code) => `Le code patient identifiant ${code} dans le DPI.`,
  cordGestWeeks: (code) => `D'après le dossier de naissance du DPI pour ${code} — âge gestationnel en semaines révolues.`,
  cordGestDays: (code) => `D'après le dossier de naissance du DPI pour ${code} — jours de gestation au-delà des semaines révolues.`,
  cordMaternalAge: (code) => `D'après les données démographiques du DPI pour ${code} — âge maternel à l'accouchement.`,
  cordParity: (code) => `D'après les données démographiques du DPI pour ${code} — parité maternelle.`,
  cordFoetalMovements: (code) => `D'après la note anténatale pour ${code} — mouvements fœtaux rapportés.`,
  cordMaternalComorbidities: (code) => `D'après la note anténatale pour ${code} — comorbidités maternelles documentées.`,
  cordMaternalComorbiditiesOther: (code) => `D'après la note anténatale pour ${code} — tout autre antécédent maternel notable.`,
  cordNormalScans: (code) => `D'après le dossier des échographies anténatales pour ${code} — si les échographies de croissance étaient normales.`,
  cordNormalDopplers: (code) => `D'après le dossier des échographies anténatales pour ${code} — si les dopplers de l'artère ombilicale étaient normaux.`,
  cordCtgDoneYes: (code) => `D'après le dossier intrapartum pour ${code} — un CTG continu a été réalisé.`,
  cordCtgDoneNo: (code) => `D'après le dossier intrapartum pour ${code} — travail surveillé par auscultation intermittente ; aucun CTG continu réalisé.`,
  cordLiquorMeconium: (code) => `D'après la note du compte rendu de naissance pour ${code} — l'état du liquide.`,
  cordChorioamnionitis: (code) => `D'après la note du compte rendu de naissance pour ${code} — toute chorioamniotite.`,
  cordProm: (code) => `D'après la note anténatale pour ${code} — rupture prolongée des membranes au-delà de 18 heures.`,
  cordRffs: (code) => `D'après la note anténatale pour ${code} — facteurs de risque de sepsis.`,
  cordSentinelEvent: (code) => `D'après la note du compte rendu de naissance pour ${code} — tout événement sentinelle intrapartum.`,
  cordDelivery: (code) => `D'après le dossier de naissance du DPI pour ${code} — mode d'accouchement.`,
  cordBirthWeight: (code) => `D'après le dossier de naissance du DPI pour ${code} — poids de naissance en grammes.`,
  cordApgar1: (code) => `D'après le dossier de naissance du DPI pour ${code} — score d'Apgar à une minute.`,
  cordApgar5: (code) => `D'après le dossier de naissance du DPI pour ${code} — score d'Apgar à cinq minutes.`,
  cordApgar10: (code) => `D'après le dossier de naissance du DPI pour ${code} — score d'Apgar à dix minutes.`,
  cordDccYes: (code) => `D'après le compte rendu de naissance obstétrical et la note d'accouchement de la sage-femme pour ${code} — tous deux enregistrent un clampage tardif du cordon, donc il est documenté comme réalisé.`,
  cordDccNo: (code) => `D'après le compte rendu de naissance obstétrical et la note d'accouchement de la sage-femme pour ${code} — tous deux enregistrent le cordon clampé précocement, donc le clampage tardif n'a pas été réalisé.`,
  cordIntubated: (code) => `D'après le compte rendu de réanimation pour ${code} — si le nouveau-né a été intubé à la naissance.`,
  cordCompressions: (code) => `D'après le compte rendu de réanimation pour ${code} — si des compressions cardiaques ont été réalisées.`,
  cordDrugs: (code) => `D'après le compte rendu de réanimation pour ${code} — tout médicament de réanimation administré.`,
  cordWard: (code) => `D'après l'épisode de soins du DPI pour ${code} — le service au moment de l'audit.`,
  cordGasRepeatedYes: (code) => `Un gaz du cordon/néonatal répété a été réalisé pour ${code}.`,
  cordGasRepeatedNo: (code) => `Aucun gaz du cordon/néonatal répété n'a été réalisé pour ${code}.`,
  cordHypoglycaemia: (code) => `D'après la note métabolique néonatale pour ${code} — toute hypoglycémie.`,
  cordAdmittedNicu: (code) => `D'après le tableau des admissions en NICU pour ${code} — si le nouveau-né a été admis dans l'unité néonatale.`,
  cordAgeDischargeHomeTransferred: (code) => `${code} a été transféré au centre régional et n'a pas été renvoyé à domicile depuis cette unité, donc l'âge à la sortie à domicile n'est pas renseigné ici.`,
  cordAgeDischargeHome: (code) => `D'après le dossier de sortie pour ${code} — âge en jours à la sortie à domicile.`,
  cordUnitQuestionnaire: () => `D'après le dossier de gouvernance de l'audit au niveau de l'unité — si le questionnaire au niveau de l'unité a été rempli.`,
  cordGuidelineCordGas: () => `D'après le dossier de gouvernance de l'audit au niveau de l'unité — si une recommandation locale pour le prélèvement des gaz du cordon est disponible.`,
  cordGuidelineFetalAcidosis: () => `D'après le dossier de gouvernance de l'audit au niveau de l'unité — si une recommandation locale pour l'acidose fœtale est disponible.`,

  // makeCordNicuCell
  nicuAdmitAge: (code) => `D'après le dossier d'admission en NICU pour ${code} — âge en heures à l'admission dans l'unité néonatale.`,
  nicuCooled: (code) => `D'après la note d'admission en NICU pour ${code} — si une hypothermie thérapeutique a été réalisée.`,
  nicuAgeCoolingNA: (code) => `D'après la note d'admission en NICU pour ${code} — l'hypothermie thérapeutique n'était pas indiquée, donc il n'y a pas d'âge au refroidissement.`,
  nicuAgeCooling: (code) => `D'après la note d'admission en NICU pour ${code} — âge en heures auquel l'hypothermie thérapeutique a débuté.`,
  nicuTransferredOut: (code) => `D'après le dossier d'admission en NICU pour ${code} — si le nouveau-né a été transféré dans une autre unité.`,
  // cfm explanation comes from the record (n.cfm.explanation), no function needed.
  nicuSeizures: (code) => `D'après le compte rendu neurologique pour ${code} — si des convulsions ont été enregistrées.`,
  nicuClinicalSeizures: (code) => `D'après le compte rendu neurologique pour ${code} — si des convulsions cliniques ont été observées.`,
  nicuElectrographicSeizure: (code) => `D'après le compte rendu neurologique pour ${code} — si des convulsions électrographiques ont été enregistrées.`,
  nicuMriInjury: (code) => `D'après le compte rendu neurologique pour ${code} — constatations de lésion à l'IRM.`,
  nicuDurationNicu: (code) => `D'après le dossier d'admission en NICU pour ${code} — durée de l'admission en jours.`,
  nicuAgeDischargeHomeTransferred: (code) => `${code} a été transféré dans une autre unité et n'a pas été renvoyé à domicile depuis ici, donc l'âge à la sortie à domicile n'est pas renseigné.`,
  nicuAgeDischargeHome: (code) => `D'après le dossier de sortie de NICU pour ${code} — âge en jours à la sortie à domicile.`,
  nicuFeeding: (code) => `D'après le compte rendu de sortie de NICU pour ${code} — méthode d'alimentation à la sortie.`,
  nicuAbnormalNeurology: (code) => `D'après le compte rendu de sortie de NICU pour ${code} — si la neurologie était anormale à la sortie.`,

  // makeChestPainCell
  chestAge: (code) => `D'après le dossier d'épisode de soins du DPI pour ${code} — âge à la consultation.`,
  chestComplaint: (code) => `D'après la note de triage pour ${code} — le motif de consultation enregistré au triage.`,
  chestTroponinUnavailable: (code) => `D'après la note du laboratoire pour ${code} — l'échantillon sanguin s'est hémolysé, donc aucun résultat de troponine n'est disponible.`,
  chestTroponin: (code) => `D'après le résultat de troponine du DPI pour ${code} — première troponine ultrasensible en ng/L.`,
  chestEcgMissing: () => "Aucun ECG n'a été réalisé lors de cette consultation, donc aucune constatation n'est enregistrée.",
  chestEcg: (code) => `D'après la note de cardiologie pour ${code} — les constatations ECG documentées.`,
  chestTimeToEcgMissing: () => "Aucun ECG n'a été réalisé lors de cette consultation, donc il n'y a pas de délai jusqu'au premier ECG.",
  chestTimeToEcg: (code) => `D'après le dossier ECG du DPI pour ${code} — minutes de l'arrivée au premier ECG.`,
  chestDiagnosis: (code) => `D'après les notes de cardiologie et le compte rendu de sortie pour ${code} — le diagnostic de travail à la revue.`,
  chestDecision: (code) => `D'après la note du compte rendu de sortie pour ${code} — la décision de sortie ou d'admission.`,

  // makeNpdaCell
  npdaPatient: (code) => `D'après les données démographiques du DPI pour ${code} — le numéro NHS à 10 chiffres du patient.`,
  npdaDob: (code) => `D'après les données démographiques du DPI pour ${code} — date de naissance, au format JJ/MM/AAAA.`,
  npdaSex: (code, sex, sexCode) => `D'après les données démographiques du DPI pour ${code} — sexe assigné à la naissance enregistré comme ${sex}, codé ${sexCode} selon le jeu de données NPDA (1 = Masculin, 2 = Féminin).`,
  npdaEthnicity: (code, label, ethCode) => `D'après les données démographiques du DPI pour ${code} — catégorie ethnique enregistrée comme '${label}', codée ${ethCode} selon la liste des catégories ethniques NPDA.`,
  npdaDiabetesType: (code, label, dtCode) => `D'après le dossier de diagnostic de diabète du DPI pour ${code} — ${label}, codé ${dtCode} selon le jeu de données NPDA.`,
  npdaDiagnosisDate: (code) => `D'après le dossier de diagnostic de diabète du DPI pour ${code} — date du diagnostic, au format JJ/MM/AAAA.`,
  npdaVisitDate: (code) => `D'après le panel d'observation clinique du DPI pour ${code} — date de visite/rendez-vous, au format JJ/MM/AAAA.`,
  npdaHeight: (code) => `D'après le panel d'observation clinique du DPI pour ${code} — taille en cm (format NPDA 999.9).`,
  npdaWeight: (code) => `D'après le panel d'observation clinique du DPI pour ${code} — poids en kg (format NPDA 999.9).`,
  npdaHba1c: (code, value) => `D'après le panel d'observation clinique du DPI pour ${code} — HbA1c de ${value} (format NPDA 999.9) ; une valeur entre 20 et 195 est traitée comme mmol/mol selon le jeu de données NPDA.`,
  npdaInsulinRegime: (code, label, mCode) => `D'après la note de consultation de diabétologie pour ${code} — ${label}, codé ${mCode} selon les valeurs de schéma d'insulinothérapie NPDA.`,
  npdaCgm: (code, label, mCode) => `D'après la note de consultation de diabétologie pour ${code} — ${label}, codé ${mCode} (1 = Oui, 2 = Non).`,
  npdaLifestyle: (code, recommended, mCode) => `D'après la note de consultation de diabétologie pour ${code} — la modification du mode de vie et de l'alimentation a été ${recommended ? "recommandée" : "non recommandée"}, codée ${mCode} (1 = Oui, 2 = Non).`,
  npdaSystolic: (code) => `D'après le panel d'observation clinique du DPI pour ${code} — pression artérielle systolique en mmHg (format NPDA 999).`,
  npdaDiastolic: (code) => `D'après le panel d'observation clinique du DPI pour ${code} — pression artérielle diastolique en mmHg (format NPDA 999).`,
  npdaCholesterol: (code) => `D'après le panel d'observation clinique du DPI pour ${code} — cholestérol total en mmol/l (format NPDA 99.9).`,
  npdaAcrNotDone: (code) => `L'albumine urinaire (ACR) n'a pas été effectuée pour ${code} lors de cette visite, donc aucune valeur n'est renseignée.`,
  npdaAcr: (code) => `D'après le panel d'observation clinique du DPI pour ${code} — ratio albumine:créatinine urinaire (ACR) en mg/mmol (format NPDA 9999.9).`,
  npdaFootDateNotDue: (code) => `L'examen des pieds est un processus de soins obligatoire à partir de 12 ans ; ${code} est plus jeune, donc aucun n'a été réalisé et la date est laissée vide.`,
  npdaFootDate: (code) => `D'après le dossier de dépistage du diabète pour ${code} — date de l'examen des pieds, au format JJ/MM/AAAA.`,
  npdaRetinalDateNotDue: (code) => `Le dépistage rétinien est un processus de soins obligatoire à partir de 12 ans ; ${code} est plus jeune, donc aucun n'a été réalisé et la date est laissée vide.`,
  npdaRetinalDate: (code) => `D'après le dossier de dépistage du diabète pour ${code} — date du dépistage rétinien, au format JJ/MM/AAAA.`,
  npdaRetinalResultNone: (code) => `Aucun dépistage rétinien n'a été réalisé pour ${code} (moins de 12 ans), donc il n'y a aucun résultat à coder.`,
  npdaRetinalResult: (code, label, mCode) => `D'après le dossier de dépistage du diabète pour ${code} — le résultat du dépistage rétinien était ${label}, codé ${mCode} (1 = Normal, 2 = Anormal).`,
  npdaPsychScreen: (code) => `D'après le dossier de dépistage du diabète pour ${code} — date de l'évaluation annuelle de dépistage psychologique, au format JJ/MM/AAAA.`,
  npdaPsychOutcome: (code, required, mCode) => `D'après la note de dépistage psychologique pour ${code} — un soutien psychologique supplémentaire en dehors des soins de routine était ${required ? "nécessaire" : "non nécessaire"}, codé ${mCode} (1 = Oui, 2 = Non).`,
  npdaSmoking: (code, label, mCode) => `D'après la note de revue annuelle pour ${code} — ${label}, codé ${mCode} selon les valeurs tabac/vapotage NPDA.`,
  npdaDietitian: (code, offered, mCode) => `D'après la note de consultation de diabétologie pour ${code} — un rendez-vous supplémentaire avec un diététicien pédiatrique a été ${offered ? "proposé" : "non proposé"}, codé ${mCode} (1 = Oui, 2 = Non).`,
  npdaCarbCountingNA: (code) => `Le comptage des glucides de niveau 3 s'applique aux patients sous injections ou sous pompe ; ${code} est pris en charge par régime et metformine, donc il n'est pas applicable et la date est laissée vide.`,
  npdaCarbCounting: (code) => `D'après le dossier d'éducation au diabète pour ${code} — date à laquelle l'éducation au comptage des glucides de niveau 3 a été reçue, au format JJ/MM/AAAA.`,
  npdaAdmissionReasonDka: (code, label, dkaCode) => `D'après la note d'admission pour ${code} — ${label}, codé ${dkaCode} selon les valeurs de motif d'admission NPDA (1 = DKA aiguë).`,
  npdaAdmissionReasonNone: (code) => `Aucune admission hospitalière liée au diabète n'a été enregistrée pour ${code} durant l'année d'audit, donc il n'y a aucun code de motif d'admission.`,
  npdaPostcode: (code) => `D'après les données démographiques du DPI pour ${code} — code postal de l'adresse habituelle en majuscules avec l'espacement correct.`,
  npdaAdhdAsd: (code, label, adhdCode) => `D'après les données démographiques du DPI pour ${code} — ${label}, codé ${adhdCode} selon les valeurs TDAH/TSA NPDA.`,
  npdaLearningDisability: (code, label, ldCode) => `D'après les données démographiques du DPI pour ${code} — trouble des apprentissages ${label}, codé ${ldCode} (1 = Oui, 2 = Non).`,
  npdaLeavingDateNone: (code) => `${code} est resté suivi par le service de diabétologie pédiatrique durant toute l'année d'audit, donc aucune date de sortie n'est renseignée.`,
  npdaLeavingDate: (code) => `D'après les données démographiques du DPI pour ${code} — date à laquelle le patient a quitté le service, au format JJ/MM/AAAA.`,
  npdaLeavingReasonNone: (code) => `${code} n'a pas quitté le service durant l'année d'audit, donc il n'y a aucun code de motif de sortie.`,
  npdaLeavingReason: (code, label, lrCode) => `D'après les données démographiques du DPI pour ${code} — ${label}, codé ${lrCode} selon les valeurs de motif de sortie NPDA.`,
  npdaDeathDate: (code) => `Aucun décès n'a été enregistré pour ${code} durant l'année d'audit, donc la date du décès est laissée vide.`,
  npdaGpPractice: (code) => `D'après les données démographiques du DPI pour ${code} — code du cabinet médical enregistré (format NPDA X99999).`,
  npdaPduNumber: (code) => `D'après l'enregistrement de l'unité pour ${code} — le numéro de l'unité de diabétologie pédiatrique (PDU), un code à 3 chiffres partagé par tous les enfants suivis dans cette unité.`,
  npdaObsDateHtWt: (code) => `D'après le panel d'observation clinique du DPI pour ${code} — date d'observation combinée taille/poids (prise lors de la visite en consultation), au format JJ/MM/AAAA.`,
  npdaObsDateHba1c: (code) => `D'après le panel d'observation clinique du DPI pour ${code} — date à laquelle l'HbA1c a été effectuée (dans l'année d'audit), au format JJ/MM/AAAA.`,
  npdaOtherMed: (code, label, omCode) => `D'après le dossier de médication du DPI pour ${code} — ${label}, codé ${omCode} selon les valeurs de médication non insulinique NPDA.`,
  npdaKetoneTesting: (code, label, ktCode) => `D'après le dossier de dépistage du diabète pour ${code} — utilisant ou formé à utiliser un équipement de test des cétones sanguines : ${label}, codé ${ktCode} (1 = Oui, 2 = Non).`,
  npdaImmunotherapyNA: (code) => `L'item immunothérapie est renseigné uniquement pour les patients nouvellement diagnostiqués avec un diabète de type 1 dans l'année d'audit ; ${code} ne remplit pas les critères, donc il est laissé vide.`,
  npdaImmunotherapy: (code, label, imCode) => `D'après le dossier de diagnostic de diabète pour ${code} — immunothérapie autour du diagnostic de type 1 au stade 3 : ${label}, codé ${imCode} (1 = Oui, 2 = Non).`,
  npdaImmunotherapyDateNone: (code) => `Aucune immunothérapie n'a été administrée à ${code}, donc il n'y a aucune date de début à enregistrer.`,
  npdaImmunotherapyDate: (code) => `D'après le dossier de diagnostic de diabète pour ${code} — date de début de l'immunothérapie, au format JJ/MM/AAAA.`,
  npdaObsDateBP: (code) => `D'après le panel d'observation clinique du DPI pour ${code} — date d'observation de la pression artérielle (prise lors de la visite en consultation), au format JJ/MM/AAAA.`,
  npdaObsDateAcrNone: (code) => `L'albumine urinaire (ACR) n'a pas été effectuée pour ${code} lors de cette visite, donc il n'y a aucune date d'observation.`,
  npdaObsDateAcr: (code) => `D'après le panel d'observation clinique du DPI pour ${code} — date à laquelle l'ACR urinaire a été effectué, au format JJ/MM/AAAA.`,
  npdaAlbuminuriaStageNone: (code) => `Aucun ACR urinaire n'a été mesuré pour ${code}, donc le stade de l'albuminurie ne peut pas être codé.`,
  npdaAlbuminuriaStage: (code, acrValue, label, alCode) => `Interprété à partir de l'ACR urinaire de ${acrValue} mg/mmol pour ${code} — ${label}, codé ${alCode} (un ACR inférieur à 3 mg/mmol correspond à une normoalbuminurie).`,
  npdaObsDateChol: (code) => `D'après le panel d'observation clinique du DPI pour ${code} — date à laquelle le cholestérol total a été effectué, au format JJ/MM/AAAA.`,
  npdaThyroidDateNA: (code) => `La surveillance annuelle de la fonction thyroïdienne est un processus de soins du diabète de type 1 ; ${code} a un diabète de type 2, donc aucune date d'observation thyroïdienne n'est renseignée.`,
  npdaThyroidDate: (code) => `D'après le dossier de dépistage du diabète pour ${code} — date du test annuel de la fonction thyroïdienne, au format JJ/MM/AAAA.`,
  npdaThyroidTreatmentNA: (code) => `Le traitement thyroïdien est enregistré en parallèle du bilan thyroïdien annuel du type 1 ; ${code} a un diabète de type 2, donc il est laissé vide.`,
  npdaThyroidTreatment: (code, label, ttCode) => `D'après le dossier de dépistage du diabète pour ${code} — ${label}, codé ${ttCode} selon les valeurs de traitement thyroïdien NPDA.`,
  npdaCoeliacDateNA: (code) => `La date de dépistage de la maladie cœliaque est enregistrée uniquement pour les patients diagnostiqués dans l'année d'audit ; ${code} a été diagnostiqué plus tôt, donc elle est laissée vide.`,
  npdaCoeliacDate: (code) => `D'après le dossier de dépistage du diabète pour ${code} — date du dépistage sérologique de la maladie cœliaque, au format JJ/MM/AAAA.`,
  npdaGlutenFree: (code, label, gfCode) => `D'après le dossier de dépistage du diabète pour ${code} — régime sans gluten recommandé/prescrit : ${label}, codé ${gfCode} (un 'Oui' est interprété comme un diagnostic de maladie cœliaque).`,
  npdaSmokingCessationDateNone: (code) => `${code} n'est pas un fumeur ou vapoteur actuel, donc aucun conseil de sevrage tabagique n'était dû et la date est laissée vide.`,
  npdaSmokingCessationDate: (code) => `D'après le dossier de dépistage du diabète pour ${code} — date à laquelle des conseils/une orientation de sevrage tabagique ont été proposés, au format JJ/MM/AAAA.`,
  npdaFluDateNone: (code) => `Aucune vaccination antigrippale n'a été enregistrée pour ${code} durant l'année d'audit, donc ce processus de soins est traité comme incomplet et la date est laissée vide.`,
  npdaFluDate: (code) => `D'après le dossier de dépistage du diabète pour ${code} — date à laquelle la vaccination antigrippale a été recommandée, au format JJ/MM/AAAA.`,
  npdaSickDayDate: (code) => `D'après le dossier de dépistage du diabète pour ${code} — date à laquelle les conseils sur les 'règles en cas de maladie' ont été fournis (réabordés lors de la revue annuelle), au format JJ/MM/AAAA.`,
  npdaMentalHealthAppt: (code, label, mhCode) => `D'après le dossier de psychologie pour ${code} — ${label}, codé ${mhCode} selon les valeurs de rendez-vous en santé mentale NPDA.`,
  npdaDietitianApptDateNone: (code) => `Aucun rendez-vous supplémentaire avec un diététicien n'a été honoré par ${code}, donc la date du rendez-vous est laissée vide.`,
  npdaDietitianApptDate: (code) => `D'après le dossier d'éducation au diabète pour ${code} — date du rendez-vous supplémentaire avec le diététicien pédiatrique, au format JJ/MM/AAAA.`,
  npdaAdmissionStartNone: (code) => `Aucune admission liée au diabète n'a été enregistrée pour ${code} durant l'année d'audit, donc il n'y a aucune date de début de séjour.`,
  npdaAdmissionStart: (code) => `D'après le dossier d'admission hospitalière pour ${code} — date de début du séjour de l'établissement, au format JJ/MM/AAAA.`,
  npdaAdmissionDischargeNone: (code) => `Aucune admission liée au diabète n'a été enregistrée pour ${code} durant l'année d'audit, donc il n'y a aucune date de sortie.`,
  npdaAdmissionDischarge: (code) => `D'après le dossier d'admission hospitalière pour ${code} — date de sortie du séjour de l'établissement, au format JJ/MM/AAAA.`,
  npdaAdmissionReasonOtherNoAdmission: (code) => `Aucune admission n'a été enregistrée pour ${code}, donc il n'y a aucun motif en texte libre.`,
  npdaAdmissionReasonOther: (code) => `Le motif en texte libre est obligatoire uniquement lorsque 'Autres causes' est sélectionné ; l'admission de ${code} a été codée comme DKA, donc il est laissé vide.`,
  npdaDkaTherapiesNone: (code) => `Aucune admission pour DKA n'a été enregistrée pour ${code}, donc il n'y a aucun traitement de DKA à enregistrer.`,
  npdaDkaTherapies: (code, label, dkaCode) => `D'après le dossier d'admission hospitalière pour ${code} — traitements de DKA reçus : ${label}, codé ${dkaCode} selon les valeurs de traitement de DKA NPDA.`,
  npdaInitialPhNone: (code) => `Aucun gaz du sang à l'admission n'a été enregistré pour ${code}, donc il n'y a aucun pH initial.`,
  npdaInitialPh: (code) => `D'après le dossier d'admission hospitalière pour ${code} — pH initial (premier enregistré) à l'admission (format NPDA 0.00).`,
  npdaInitialBicarbNone: (code) => `Aucun gaz du sang à l'admission n'a été enregistré pour ${code}, donc il n'y a aucun bicarbonate standard initial.`,
  npdaInitialBicarb: (code) => `D'après le dossier d'admission hospitalière pour ${code} — bicarbonate standard initial à l'admission en mmol/l (format NPDA 00.0).`,
};

// --- Blocked-cell reason_detail (CPH009 age-at-discharge) --------------------
const blockedReason = {
  cordAgeDischargeHome:
    "CPH009 a été transféré au centre régional d'hypothermie et de neurologie à J7 et n'a jamais été renvoyé à domicile depuis cette unité, donc aucun âge à la sortie à domicile n'est renseigné (recherche dans cord_ph_birth_records et le compte rendu de transfert).",
};

// --- Timeline strings (headlines, details, think snippets, tool headlines) ---
// KEEP wait/kind/tool name/status in logic. Translate headline/detail/think text
// and the few derived words below. `summaryWords` are the first few words the
// folded activity line shows — handled by shortLabel() in logic, so nothing to
// translate beyond the headlines themselves.
const timeline = {
  // Tool-call headlines (the agent's sql_execute / query_schema lines).
  tools: {
    cordGasPanel: "Lecture du panel de gaz du cordon",
    inspectedSchema: "Inspection du schéma du DPI",
    troponinResults: "Lecture des résultats de troponine",
    cardiometabolicScreen: "Lecture du bilan cardiométabolique",
  },
  // Cord-pH population (timelineA -> cordPhPopulation).
  cord: {
    mapTemplate: { headline: "Mise en correspondance du modèle avec le schéma du DPI…", detail: "Résolution de chacune des colonnes du modèle vers un champ de la **Base de données DPI** avant de copier les valeurs structurées du dossier de naissance." },
    copyBirthRecord: { headline: "Copie des champs structurés du dossier de naissance…", detail: "Extraction de l'âge gestationnel, de l'âge maternel, de la parité, du mode d'accouchement, du poids de naissance et des scores d'Apgar directement depuis `cord_ph_birth_records` et `patient_demographics`." },
    antenatalScreening: { headline: "Lecture des champs de dépistage anténatal…", detail: "Copie des indicateurs d'échographie normale, de doppler normal et de CTG depuis les dossiers anténatals." },
    antenatalNotes: { headline: "Lecture des notes anténatales…", detail: "Lecture de la note anténatale de chaque grossesse pour les mouvements fœtaux, les comorbidités maternelles, la rupture prolongée des membranes et les facteurs de risque de sepsis." },
    obstetricNotes: { headline: "Lecture des notes obstétricales et de sage-femme…", detail: "Combinaison de chaque compte rendu de naissance d'obstétricien avec la note d'accouchement de sage-femme correspondante pour confirmer le clampage tardif du cordon, l'état du liquide, la chorioamniotite et tout événement sentinelle." },
    thinkDcc: "CPH002 était une césarienne de catégorie 1 avec un nouveau-né hypotonique — le cordon a été clampé immédiatement pour la réanimation, donc le clampage tardif du cordon se lit \"Non\" malgré la politique de l'unité.",
    resuscitationNotes: { headline: "Lecture des notes de réanimation…", detail: "Lecture de chaque compte rendu de réanimation pour l'intubation, les compressions cardiaques et tout médicament administré à la naissance." },
    metabolicScreen: { headline: "Vérification du bilan métabolique néonatal…", detail: "Lecture de la note post-natale de chaque nouveau-né pour enregistrer toute hypoglycémie." },
    followUp: { headline: "Copie des champs de suivi et de sortie…", detail: "Extraction du service, des résultats du gaz du cordon répété, de l'admission en NICU et du moment de la sortie depuis le dossier structuré. Lorsqu'aucun gaz répété n'a été réalisé, le champ est rempli avec un \"N/A\" explicite plutôt que laissé vide." },
    governance: { headline: "Enregistrement des réponses de gouvernance au niveau de l'unité…", detail: "Remplissage des colonnes du questionnaire au niveau de l'unité et de la disponibilité des recommandations locales depuis le dossier de gouvernance de l'audit." },
    nicuSheet: { headline: "Remplissage de la feuille NICU…", detail: "Passage à la feuille **NICU** pour remplir les devenirs des nouveau-nés admis dans l'unité néonatale." },
    coolingCfm: { headline: "Lecture des notes d'hypothermie et de CFM…", detail: "Lecture de chaque note d'admission en NICU pour l'hypothermie thérapeutique et réconciliation de l'impression du CFM au lit du patient avec le compte rendu neurologique formel. Un cas est en désaccord avec le dossier structuré ; une admission pour sepsis prématuré n'avait pas de CFM, enregistré explicitement." },
    thinkCfm: "**CPH009 — réconciliation du conflit CFM.** La note CFM au lit du patient lit un *tracé de fond normal*, mais le compte rendu neurologique formel enregistre des **convulsions électrographiques** avec `lésion des noyaux gris centraux et du thalamus` à l'IRM. Ceux-ci sont en désaccord, donc plutôt que de choisir silencieusement une source, je signale cette cellule comme un **conflit** pour revue par le clinicien :\n\n- CFM au lit du patient : tracé de fond normal\n- aEEG formel : anormal, convulsions électrographiques\n- IRM : lésion des noyaux gris centraux / du thalamus\n\nLe compte rendu formel est la source la plus fiable, mais la divergence elle-même est la constatation qui mérite d'être mise en évidence.",
    neurologyReports: { headline: "Lecture des comptes rendus neurologiques…", detail: "Lecture de chaque compte rendu neurologique formel pour les convulsions cliniques et électrographiques et toute lésion à l'IRM." },
    dischargeSummaries: { headline: "Vérification des comptes rendus de sortie de NICU…", detail: "Lecture de chaque compte rendu de sortie de NICU pour la méthode d'alimentation et la neurologie à la sortie." },
    finalizing: { headline: "Finalisation de l'audit…", detail: "Toutes les cellules remplies et traçables jusqu'au dossier du DPI ou aux notes sources sur les feuilles ALL et NICU." },
  },
  // Chest-pain population (timelineB -> chestPainPopulation).
  chest: {
    populating: { headline: "Remplissage depuis le DPI…", detail: "Remplissage du classeur de douleur thoracique colonne par colonne depuis la **Base de données DPI** et les notes de triage et de cardiologie." },
    triageNotes: { headline: "Lecture des notes de triage…", detail: "Lecture de la note de triage de chaque consultation pour saisir le motif de consultation." },
    ecgResults: { headline: "Lecture des résultats ECG…", detail: "Extraction des constatations ECG documentées et du délai de l'arrivée au premier ECG, en signalant toute consultation sans ECG au dossier." },
    cardiologyNotes: { headline: "Revue des notes de cardiologie…", detail: "Lecture de la revue de cardiologie pour établir le diagnostic de travail de chaque patient." },
    dischargeSummaries: { headline: "Vérification des comptes rendus de sortie…", detail: "Lecture de chaque compte rendu de sortie pour enregistrer si le patient a été renvoyé à domicile ou admis." },
    finalizing: { headline: "Finalisation de l'audit…", detail: "Toutes les cellules remplies et traçables jusqu'au dossier du DPI ou aux notes sources." },
  },
  // NPDA population (timelineC -> npdaPopulation).
  npda: {
    mapTemplate: { headline: "Mise en correspondance du modèle avec le schéma du DPI…", detail: "Résolution de chaque colonne NPDA vers un champ de la **Base de données DPI** avant de copier les données démographiques structurées et les détails du diagnostic." },
    demographics: { headline: "Copie des champs démographiques et de diagnostic…", detail: "Extraction de la date de naissance, du code postal, du sexe, de la catégorie ethnique, des indicateurs TDAH/TSA et de trouble des apprentissages, du type de diabète et de la date du diagnostic directement depuis `patient_demographics` et `diabetes_diagnoses`." },
    registration: { headline: "Copie des champs d'enregistrement et de service…", detail: "Extraction de la date et du motif de sortie du service, de toute date de décès, du code du cabinet médical, du numéro PDU et de la date de visite/rendez-vous. Les patients restés suivis par le service portent un libellé explicite plutôt qu'un blanc." },
    clinicMeasurements: { headline: "Copie des mesures de consultation…", detail: "Copie de la taille, du poids et de l'HbA1c avec leurs dates d'observation depuis le panel d'observation clinique structuré." },
    diabetesClinicNotes: { headline: "Lecture des notes de consultation de diabétologie…", detail: "Lecture de la note de consultation de diabétologie de chaque enfant pour le schéma d'insulinothérapie, l'utilisation d'un capteur de glucose en continu et les conseils sur le mode de vie et l'alimentation donnés." },
    treatmentFlags: { headline: "Copie des indicateurs de traitement et de surveillance…", detail: "Extraction de tout traitement hypoglycémiant non insulinique, du test des cétones sanguines, et — pour les patients de type 1 nouvellement diagnostiqués — si une immunothérapie a été reçue et quand." },
    surveillanceScreening: { headline: "Copie des dates de dépistage de surveillance…", detail: "Extraction des champs d'examen des pieds, de dépistage rétinien, thyroïdien, cœliaque et de comptage des glucides depuis le dossier structuré. Lorsque le dépistage n'est pas encore dû ou non applicable, le champ est rempli avec un libellé explicite plutôt que laissé vide." },
    annualReviewNotes: { headline: "Lecture des notes de revue annuelle…", detail: "Lecture de la note de revue annuelle de chaque enfant pour le statut tabac ou vapotage, puis enregistrement des dates des processus de soins de sevrage tabagique, de vaccination antigrippale et de règles en cas de maladie." },
    psychologyNotes: { headline: "Lecture des notes de psychologie…", detail: "Lecture du résultat du dépistage psychologique annuel de chaque enfant, puis enregistrement de la proposition d'un rendez-vous en santé mentale dans le cadre de l'équipe pluridisciplinaire du diabète." },
    dieteticAdmissions: { headline: "Vérification de l'intervention diététique et des admissions…", detail: "Lecture de la note de consultation de diabétologie pour tout rendez-vous supplémentaire avec un diététicien proposé, puis extraction des dates de comptage des glucides et de rendez-vous avec le diététicien et du dossier d'admission pour toute admission liée au diabète telle qu'une DKA." },
    finalizing: { headline: "Finalisation de l'audit…", detail: "Toutes les cellules remplies et traçables jusqu'au dossier du DPI ou aux notes sources." },
  },
  // Flow openers (timelineA / timelineB / timelineC).
  flowA: {
    reviewingTemplate: { headline: "Revue du modèle…", detail: "Revue de l'audit **pH au cordon (régional)** par rapport à la **Base de données DPI** et résolution des correspondances de champs sur les feuilles ALL et NICU." },
  },
  flowB: {
    readingRequest: { headline: "Lecture de la demande…", detail: "Analyse de la demande du Dr Alvarez : un audit des consultations adultes pour douleur thoracique sur la **Base de données DPI** pour le dernier trimestre." },
    buildingSpreadsheet: { headline: "Construction du tableur…", detail: "Conception d'un classeur de douleur thoracique à partir de la **Base de données DPI** — épisodes de soins, résultats de troponine et d'ECG ainsi que les notes de triage et de cardiologie." },
    addingColumns: { headline: "Ajout des colonnes…", detail: "Ajout des colonnes : Patient, Âge, Motif de consultation, Troponine (ng/L), Constatations ECG, Délai jusqu'à l'ECG (min), Diagnostic, Décision de sortie/admission." },
  },
  flowC: {
    reviewingTemplate: { headline: "Revue du modèle…", detail: "Revue de l'audit **Diabète pédiatrique (NPDA)** par rapport à la **Base de données DPI** et résolution des correspondances de champs." },
  },
  // Folded activity-line label for thinking steps.
  thinkingLabel: "Réflexion",
};

// --- Sample doctor's email (Flow B) -----------------------------------------
const email = `Bonjour à toute l'équipe,

Pour la revue du parcours de la douleur thoracique, j'ai besoin d'un audit des consultations adultes pour douleur thoracique sur la base de données DPI pour le dernier trimestre.

Pour chaque patient, merci d'extraire : l'âge, le motif de consultation au triage, le premier résultat de troponine, le délai de l'arrivée au premier ECG, et les constatations ECG documentées. En plus des champs structurés, lisez les notes de triage et de cardiologie et donnez-moi le diagnostic de travail, et si le patient a été renvoyé à domicile ou admis.

Signalez tout cas où une troponine ou un ECG est manquant.

Merci,
Dr Mark Alvarez
Médecine d’urgence`;

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
