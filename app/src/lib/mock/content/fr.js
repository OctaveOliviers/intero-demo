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
      {
        id: "epilepsy12-lo-audit",
        name: "Épilepsie pédiatrique",
        category: "Audits nationaux",
        fileName: "epilepsy12-audit.xlsx",
        submissionDeadline: "2027-01-12",
        description:
          "Epilepsy12 — audit clinique national des crises et des épilepsies de l'enfant et du jeune : indicateurs clés de la première année de prise en charge couvrant l'avis spécialisé, les examens complémentaires, le dépistage en santé mentale et la sécurité médicamenteuse.",
        columns: [
          "Numéro NHS",
          "Date de naissance",
          "Sexe assigné à la naissance",
          "Âge à la première évaluation",
          "Date d'adressage",
          "Date de la première évaluation par le pédiatre",
          "Vu par un pédiatre expert en épilepsie",
          "Date d'intervention de l'infirmier spécialisé en épilepsie",
          "IRM indiquée",
          "Date de demande de l'IRM",
          "Date de réalisation de l'IRM",
          "Type de crise",
          "Date de l'ECG",
          "Date du dépistage en santé mentale",
          "Trouble de santé mentale identifié",
          "Soutien en santé mentale apporté",
          "Date du plan de soins global",
          "Sous valproate de sodium",
          "Sous topiramate",
          "Programme de prévention de la grossesse en place",
        ],
      },
      {
        id: "nmtr-trauma-lo-audit",
        name: "Polytraumatisme pédiatrique",
        category: "Audits nationaux",
        fileName: "nmtr-trauma-audit.xlsx",
        submissionDeadline: "Soumettre dans les 25 jours suivant la sortie",
        description:
          "National Major Trauma Registry (NMTR, anciennement TARN) — BPT polytraumatisme pédiatrique : soumission au registre pour chaque cas et standards de prise en charge en phase aiguë (accueil dirigé par un médecin sénior, scanner cérébral, acide tranexamique, voies aériennes, prescription de rééducation).",
        columns: [
          "Numéro NHS",
          "Date de naissance",
          "Sexe assigné à la naissance",
          "Âge (années)",
          "Score de gravité des lésions (ISS)",
          "≥1 lésion AIS 3+",
          "Date/heure d'arrivée aux urgences",
          "Date de sortie",
          "Cas soumis au NMTR",
          "Jeu de données NMTR complet",
          "Date de soumission au NMTR",
          "Équipe de traumatologie activée",
          "Médecin sénior présent à l'accueil",
          "Arrivée du médecin sénior (min après l'arrivée)",
          "GCS à l'arrivée",
          "Traumatisme crânien (AIS 1+)",
          "Scanner cérébral (min après l'arrivée)",
          "TXA indiqué",
          "TXA administré",
          "TXA administré (min après le traumatisme)",
          "Voies aériennes/intubation envisagées",
          "Voies aériennes envisagées (min après l'arrivée)",
          "Besoins en rééducation évalués",
          "Prescription de rééducation délivrée",
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
  epilepsy: [
    // Patient / cohort
    { key: "patient", header: "Numéro NHS", width: 12 },                                 // B-cohort
    { key: "dob", header: "Date de naissance", width: 14 },
    { key: "sex", header: "Sexe assigné à la naissance", width: 18 },
    { key: "ageAtAssessment", header: "Âge à la première évaluation", width: 20 },
    { key: "_s1", header: "", width: 4 },
    // B1 — epilepsy-expert paediatrician within 2 weeks of referral
    { key: "referralDate", header: "Date d'adressage", width: 14 },
    { key: "firstAssessmentDate", header: "Date de la première évaluation par le pédiatre", width: 30 },
    { key: "expertisePaediatrician", header: "Vu par un pédiatre expert en épilepsie", width: 32 },
    { key: "_s2", header: "", width: 4 },
    // B2 — ESN input within first year
    { key: "esnInputDate", header: "Date d'intervention de l'infirmier spécialisé en épilepsie", width: 30 },
    { key: "_s3", header: "", width: 4 },
    // B3 — MRI within 6 weeks where indicated
    { key: "mriIndicated", header: "IRM indiquée", width: 14 },
    { key: "mriRequestDate", header: "Date de demande de l'IRM", width: 16 },
    { key: "mriPerformedDate", header: "Date de réalisation de l'IRM", width: 18 },
    { key: "_s4", header: "", width: 4 },
    // B4 — ECG in convulsive seizures
    { key: "seizureType", header: "Type de crise", width: 18 },
    { key: "ecgDate", header: "Date de l'ECG", width: 14 },
    { key: "_s5", header: "", width: 4 },
    // B5 — mental-health screening + support
    { key: "mhScreeningDate", header: "Date du dépistage en santé mentale", width: 26 },
    { key: "mhProblemIdentified", header: "Trouble de santé mentale identifié", width: 30 },
    { key: "mhSupportProvided", header: "Soutien en santé mentale apporté", width: 28 },
    { key: "_s6", header: "", width: 4 },
    // B6 — comprehensive care plan by 12 months
    { key: "carePlanDate", header: "Date du plan de soins global", width: 26 },
    { key: "_s7", header: "", width: 4 },
    // B7 — valproate/topiramate safety (PPP, females ≥12)
    { key: "onValproate", header: "Sous valproate de sodium", width: 18 },
    { key: "onTopiramate", header: "Sous topiramate", width: 16 },
    { key: "pppInPlace", header: "Programme de prévention de la grossesse en place", width: 34 },
  ],
  trauma: [
    // Patient / cohort (paediatric <16 major trauma at the MTC, ≥1 AIS3+ injury)
    { key: "patient", header: "Numéro NHS", width: 12 },                                 // C-cohort
    { key: "dob", header: "Date de naissance", width: 14 },
    { key: "sex", header: "Sexe assigné à la naissance", width: 18 },
    { key: "ageYears", header: "Âge (années)", width: 12 },
    { key: "iss", header: "Score de gravité des lésions (ISS)", width: 22 },
    { key: "ais3plus", header: "≥1 lésion AIS 3+", width: 16 },
    { key: "_s1", header: "", width: 4 },
    // C1 — registry submission within 25 days of discharge (the BPT trigger)
    { key: "edArrivalDateTime", header: "Date/heure d'arrivée aux urgences", width: 22 },
    { key: "dischargeDate", header: "Date de sortie", width: 16 },
    { key: "nmtrSubmitted", header: "Cas soumis au NMTR", width: 20 },
    { key: "datasetComplete", header: "Jeu de données NMTR complet", width: 22 },
    { key: "submissionDate", header: "Date de soumission au NMTR", width: 20 },
    { key: "_s2", header: "", width: 4 },
    // C2 — consultant-led trauma-team reception ≤5 min (Level 2, ISS ≥16)
    { key: "traumaTeamActivated", header: "Équipe de traumatologie activée", width: 22 },
    { key: "consultantPresent", header: "Médecin sénior présent à l'accueil", width: 30 },
    { key: "consultantArrivalMin", header: "Arrivée du médecin sénior (min après l'arrivée)", width: 34 },
    { key: "_s3", header: "", width: 4 },
    // C3 — CT head ≤60 min (GCS ≤13 head injury, Level 2)
    { key: "gcs", header: "GCS à l'arrivée", width: 16 },
    { key: "headInjury", header: "Traumatisme crânien (AIS 1+)", width: 20 },
    { key: "ctHeadMin", header: "Scanner cérébral (min après l'arrivée)", width: 26 },
    { key: "_s4", header: "", width: 4 },
    // C4 — tranexamic acid ≤1 h (Level 2)
    { key: "txaIndicated", header: "TXA indiqué", width: 16 },
    { key: "txaGiven", header: "TXA administré", width: 14 },
    { key: "txaMin", header: "TXA administré (min après le traumatisme)", width: 26 },
    { key: "_s5", header: "", width: 4 },
    // C5 — airway considered ≤30 min (GCS <9, Level 1)
    { key: "intubationConsidered", header: "Voies aériennes/intubation envisagées", width: 28 },
    { key: "airwayConsideredMin", header: "Voies aériennes envisagées (min après l'arrivée)", width: 34 },
    { key: "_s6", header: "", width: 4 },
    // C6 — rehabilitation prescription (ISS ≥9, Level 1)
    { key: "rehabNeedsAssessed", header: "Besoins en rééducation évalués", width: 28 },
    { key: "rehabPrescriptionIssued", header: "Prescription de rééducation délivrée", width: 32 },
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
      expertise: { v: "Yes", e: ["Évaluation par le pédiatre sénior expert en épilepsie"] },
      seizureType: { v: "Convulsive", e: ["crises tonicocloniques généralisées (convulsives)"] },
      mhProblem: { v: "No", e: ["aucun trouble de santé mentale n'a été identifié"] },
      mhSupport: { v: "No", e: ["aucun trouble de santé mentale n'a été identifié"] },
    },
    notes: [
      { role: "Neurologie pédiatrique — Dr Helen Marsh", date: "2025-01-20", type: "epilepsy_clinic", text: "Évaluation par le pédiatre sénior expert en épilepsie lors de la première consultation après l'adressage. L'anamnèse est compatible avec des crises tonicocloniques généralisées (convulsives). Une IRM cérébrale et un ECG ont été programmés." },
      { role: "Dépistage en santé mentale — épilepsie", date: "2025-04-01", type: "mh_screening", text: "Dépistage en santé mentale réalisé à l'aide du questionnaire convenu ; aucun trouble de santé mentale n'a été identifié à ce stade de la première année de prise en charge." },
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
      expertise: { v: "Yes", e: ["Revue par le pédiatre sénior expert en épilepsie"] },
      seizureType: { v: "Convulsive", e: ["crises focales avec évolution vers une activité convulsive bilatérale"] },
      mhProblem: { v: "Yes", e: ["le dépistage a identifié une humeur dépressive et une anxiété"] },
      mhSupport: { v: "Yes", e: ["adressée à l'équipe de santé mentale et un soutien a été apporté"] },
    },
    notes: [
      { role: "Neurologie pédiatrique — Dr Helen Marsh", date: "2025-02-12", type: "epilepsy_clinic", text: "Revue par le pédiatre sénior expert en épilepsie dans les deux semaines suivant l'adressage. Les événements sont des crises focales avec évolution vers une activité convulsive bilatérale. Traitement débuté par valproate de sodium ; s'agissant d'une jeune fille en âge de procréer, un programme de prévention de la grossesse a été mis en place et documenté." },
      { role: "Dépistage en santé mentale — épilepsie", date: "2025-05-02", type: "mh_screening", text: "Dépistage en santé mentale réalisé ; le dépistage a identifié une humeur dépressive et une anxiété. Elle a été adressée à l'équipe de santé mentale et un soutien a été apporté au cours de la première année de prise en charge." },
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
      expertise: { v: "Yes", e: ["Évaluation par le pédiatre sénior expert en épilepsie"] },
      seizureType: { v: "Non-convulsive", e: ["crises d'absence typiques (non convulsives)"] },
      mhProblem: { v: "No", e: ["aucun trouble de santé mentale n'a été identifié"] },
      mhSupport: { v: "No", e: ["aucun trouble de santé mentale n'a été identifié"] },
    },
    notes: [
      { role: "Neurologie pédiatrique — Dr Helen Marsh", date: "2025-03-10", type: "epilepsy_clinic", text: "Évaluation par le pédiatre sénior expert en épilepsie. La sémiologie est celle de crises d'absence typiques (non convulsives), aucun ECG n'était donc indiqué. Une IRM cérébrale a été demandée. Traitement débuté par topiramate ; s'agissant d'une jeune fille en âge de procréer, un programme de prévention de la grossesse a été mis en place." },
      { role: "Dépistage en santé mentale — épilepsie", date: "2025-06-05", type: "mh_screening", text: "Dépistage en santé mentale réalisé à l'aide du questionnaire convenu ; aucun trouble de santé mentale n'a été identifié." },
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
      expertise: { v: "Yes", e: ["évaluation par le pédiatre expert en épilepsie"] },
      seizureType: { v: "Convulsive", e: ["crises tonicocloniques généralisées (convulsives)"] },
      mhProblem: { v: "No", e: ["aucun trouble de santé mentale n'a été identifié"] },
      mhSupport: { v: "No", e: ["aucun trouble de santé mentale n'a été identifié"] },
    },
    notes: [
      { role: "Neurologie pédiatrique — Dr Helen Marsh", date: "2025-02-20", type: "epilepsy_clinic", text: "Des tensions de capacité ont retardé la première consultation ; évaluation par le pédiatre expert en épilepsie plus de deux semaines après l'adressage. Les événements sont des crises tonicocloniques généralisées (convulsives). L'IRM n'était pas indiquée pour cette présentation typique ; un ECG a été programmé." },
      { role: "Dépistage en santé mentale — épilepsie", date: "2025-05-10", type: "mh_screening", text: "Dépistage en santé mentale réalisé avec la famille ; aucun trouble de santé mentale n'a été identifié." },
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
      expertise: { v: "Yes", e: ["Évaluation par le pédiatre sénior expert en épilepsie"] },
      seizureType: { v: "Convulsive", e: ["crises tonicocloniques généralisées (convulsives)"] },
      mhProblem: { v: "Yes", e: ["le dépistage a identifié une humeur dépressive significative"] },
      mhSupport: { v: "No", e: ["le soutien n'a pas encore été organisé"] },
    },
    notes: [
      { role: "Neurologie pédiatrique — Dr Helen Marsh", date: "2025-04-09", type: "epilepsy_clinic", text: "Évaluation par le pédiatre sénior expert en épilepsie. Les événements sont des crises tonicocloniques généralisées (convulsives). Traitement débuté par valproate de sodium. Les documents du programme de prévention de la grossesse ont été abordés mais n'ont pas été complétés et restent en attente." },
      { role: "Dépistage en santé mentale — épilepsie", date: "2025-07-02", type: "mh_screening", text: "Dépistage en santé mentale réalisé ; le dépistage a identifié une humeur dépressive significative. Un adressage a été recommandé mais le soutien n'a pas encore été organisé." },
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
      expertise: { v: "Yes", e: ["Revue par le pédiatre sénior expert en épilepsie"] },
      seizureType: { v: "Non-convulsive", e: ["crises d'absence typiques (non convulsives)"] },
      mhProblem: { v: "No", e: ["aucun trouble de santé mentale n'a été identifié"] },
      mhSupport: { v: "No", e: ["aucun trouble de santé mentale n'a été identifié"] },
    },
    notes: [
      { role: "Neurologie pédiatrique — Dr Helen Marsh", date: "2025-05-12", type: "epilepsy_clinic", text: "Revue par le pédiatre sénior expert en épilepsie. Les événements sont des crises d'absence typiques (non convulsives), ni IRM ni ECG n'étaient donc indiqués." },
      { role: "Dépistage en santé mentale — épilepsie", date: "2025-08-01", type: "mh_screening", text: "Dépistage en santé mentale réalisé à l'aide du questionnaire convenu ; aucun trouble de santé mentale n'a été identifié." },
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
      expertise: { v: "Yes", e: ["Évaluation par le pédiatre sénior expert en épilepsie"] },
      seizureType: { v: "Convulsive", e: ["crises tonicocloniques généralisées (convulsives)"] },
      mhProblem: { v: "No", e: ["aucun trouble de santé mentale n'a été identifié"] },
      mhSupport: { v: "No", e: ["aucun trouble de santé mentale n'a été identifié"] },
    },
    notes: [
      { role: "Neurologie pédiatrique — Dr Helen Marsh", date: "2025-06-12", type: "epilepsy_clinic", text: "Évaluation par le pédiatre sénior expert en épilepsie. Les événements sont des crises tonicocloniques généralisées (convulsives). Une IRM cérébrale a été demandée et un ECG a été programmé." },
      { role: "Dépistage en santé mentale — épilepsie", date: "2025-09-01", type: "mh_screening", text: "Dépistage en santé mentale réalisé ; aucun trouble de santé mentale n'a été identifié." },
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
      expertise: { v: "No", e: ["vu par un pédiatre généraliste sans expertise spécifique en épilepsie"] },
      seizureType: { v: "Convulsive", e: ["crises tonicocloniques généralisées (convulsives)"] },
      mhProblem: { v: "No", e: ["aucun trouble de santé mentale n'a été identifié"] },
      mhSupport: { v: "No", e: ["aucun trouble de santé mentale n'a été identifié"] },
    },
    notes: [
      { role: "Pédiatrie — Dr Sam Reid", date: "2025-07-10", type: "epilepsy_clinic", text: "Lors de la première évaluation, l'enfant a été vu par un pédiatre généraliste sans expertise spécifique en épilepsie ; la revue ultérieure par le référent épilepsie est en attente. Les événements sont des crises tonicocloniques généralisées (convulsives). Un ECG a été programmé ; l'IRM n'était pas indiquée." },
      { role: "Dépistage en santé mentale — épilepsie", date: "2025-10-01", type: "mh_screening", text: "Dépistage en santé mentale réalisé à l'aide du questionnaire convenu ; aucun trouble de santé mentale n'a été identifié." },
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
      expertise: { v: "Yes", e: ["Évaluation par le pédiatre sénior expert en épilepsie"] },
      seizureType: { v: "Non-convulsive", e: ["crises d'absence typiques (non convulsives)"] },
      mhProblem: { v: "No", e: ["le dépistage en santé mentale n'a pas encore été réalisé"] },
      mhSupport: { v: "No", e: ["le dépistage en santé mentale n'a pas encore été réalisé"] },
    },
    notes: [
      { role: "Neurologie pédiatrique — Dr Helen Marsh", date: "2025-08-13", type: "epilepsy_clinic", text: "Évaluation par le pédiatre sénior expert en épilepsie. Les événements sont des crises d'absence typiques (non convulsives), aucun ECG n'était donc indiqué. Une IRM cérébrale a été demandée." },
      { role: "Dépistage en santé mentale — épilepsie", date: "2025-09-01", type: "mh_screening", text: "La revue documentaire indique que le dépistage en santé mentale n'a pas encore été réalisé pour cet enfant au cours de la première année de prise en charge." },
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
      expertise: { v: "Yes", e: ["Évaluation par le pédiatre sénior expert en épilepsie"] },
      seizureType: { v: "Convulsive", e: ["crises tonicocloniques généralisées (convulsives)"] },
      mhProblem: { v: "No", e: ["aucun trouble de santé mentale n'a été identifié"] },
      mhSupport: { v: "No", e: ["aucun trouble de santé mentale n'a été identifié"] },
    },
    notes: [
      { role: "Neurologie pédiatrique — Dr Helen Marsh", date: "2025-09-19", type: "epilepsy_clinic", text: "Évaluation par le pédiatre sénior expert en épilepsie. Les événements sont des crises tonicocloniques généralisées (convulsives). Un ECG a été programmé ; l'IRM n'était pas indiquée pour cette présentation." },
      { role: "Dépistage en santé mentale — épilepsie", date: "2025-11-20", type: "mh_screening", text: "Dépistage en santé mentale réalisé à l'aide du questionnaire convenu ; aucun trouble de santé mentale n'a été identifié." },
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
      intubationConsidered: { v: "Yes", e: ["voies aériennes ont été sécurisées par une intubation en séquence rapide dans les 18 minutes suivant l'arrivée"] },
      rehabPrescription: { v: "Yes", e: ["une prescription de rééducation a été complétée et transmise à la famille, au médecin traitant et à l'équipe communautaire"] },
    },
    notes: [
      { role: "Équipe de traumatologie — Dr Olusola Bello", date: "2026-01-08", type: "resus", text: "L'équipe de traumatologie dirigée par le médecin sénior a accueilli cet enfant après une collision routière à grande vitesse. GCS 6 à l'arrivée ; les voies aériennes ont été sécurisées par une intubation en séquence rapide dans les 18 minutes suivant l'arrivée. Acide tranexamique administré pour une hémorragie majeure." },
      { role: "Rééducation — Dr Priya Nair", date: "2026-01-24", type: "rehab", text: "Les besoins en rééducation ont été évalués par le coordinateur de rééducation en traumatologie ; une prescription de rééducation a été complétée et transmise à la famille, au médecin traitant et à l'équipe communautaire, avec les composantes essentielles enregistrées au NMTR." },
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
      intubationConsidered: { v: "No", e: ["les voies aériennes étaient perméables et maintenues spontanément tout du long, une intubation n'a donc pas été nécessaire"] },
      rehabPrescription: { v: "Yes", e: ["une prescription de rééducation a été délivrée et copiée au médecin traitant et au prestataire de soins de suite"] },
    },
    notes: [
      { role: "Équipe de traumatologie — Dr Olusola Bello", date: "2026-01-15", type: "resus", text: "Chute d'une hauteur. GCS 10 à l'arrivée ; les voies aériennes étaient perméables et maintenues spontanément tout du long, une intubation n'a donc pas été nécessaire. Aucune indication d'acide tranexamique. Le médecin sénior s'est présenté dans le box neuf minutes après l'arrivée en raison d'une réanimation concomitante." },
      { role: "Rééducation — Dr Priya Nair", date: "2026-01-31", type: "rehab", text: "Besoins en rééducation évalués ; une prescription de rééducation a été délivrée et copiée au médecin traitant et au prestataire de soins de suite, avec les composantes essentielles au NMTR." },
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
      intubationConsidered: { v: "Yes", e: ["la nécessité d'une voie aérienne définitive a été documentée et l'intubation a été réalisée à 25 minutes"] },
      rehabPrescription: { v: "Yes", e: ["une prescription de rééducation a été complétée avec la famille et transmise au médecin traitant et à l'équipe communautaire"] },
    },
    notes: [
      { role: "Équipe de traumatologie — Dr Olusola Bello", date: "2026-01-20", type: "resus", text: "Lésion par écrasement. GCS 7 à l'arrivée ; la nécessité d'une voie aérienne définitive a été documentée et l'intubation a été réalisée à 25 minutes. Acide tranexamique administré dans l'heure. Médecin sénior présent dans le box dans les trois minutes." },
      { role: "Rééducation — Dr Priya Nair", date: "2026-02-03", type: "rehab", text: "Besoins en rééducation évalués ; une prescription de rééducation a été complétée avec la famille et transmise au médecin traitant et à l'équipe communautaire." },
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
      intubationConsidered: { v: "No", e: ["les voies aériennes étaient maintenues spontanément avec un GCS de 14 et l'intubation n'était pas indiquée"] },
      rehabPrescription: { v: "Yes", e: ["une prescription de rééducation a été délivrée et transmise à la famille, au médecin traitant et au prestataire de soins de suite"] },
    },
    notes: [
      { role: "Équipe de traumatologie — Dr Olusola Bello", date: "2026-01-25", type: "resus", text: "Lésion sportive avec une lacération splénique. GCS 14 à l'arrivée ; les voies aériennes étaient maintenues spontanément avec un GCS de 14 et l'intubation n'était pas indiquée. Aucune hémorragie majeure nécessitant de l'acide tranexamique." },
      { role: "Rééducation — Dr Priya Nair", date: "2026-02-07", type: "rehab", text: "Besoins en rééducation évalués ; une prescription de rééducation a été délivrée et transmise à la famille, au médecin traitant et au prestataire de soins de suite." },
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
      intubationConsidered: { v: "No", e: ["éveillé avec un GCS de 15 et des voies aériennes maintenues spontanément, aucune intervention sur les voies aériennes n'a donc été envisagée"] },
      rehabPrescription: { v: "No", e: ["une prescription formelle de rééducation n'a pas encore été complétée et reste en attente"] },
    },
    notes: [
      { role: "Équipe de traumatologie — Dr Olusola Bello", date: "2026-02-01", type: "resus", text: "Fracture d'un os long du membre inférieur à la suite d'une chute. Le jeune enfant était éveillé avec un GCS de 15 et des voies aériennes maintenues spontanément, aucune intervention sur les voies aériennes n'a donc été envisagée. Aucun traumatisme crânien." },
      { role: "Rééducation — Dr Priya Nair", date: "2026-02-05", type: "rehab", text: "Les besoins en rééducation ont été évalués pendant l'hospitalisation ; toutefois, une prescription formelle de rééducation n'a pas encore été complétée et reste en attente à la sortie." },
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
      intubationConsidered: { v: "Yes", e: ["les voies aériennes ont été sécurisées par une intubation à 22 minutes de l'arrivée"] },
      rehabPrescription: { v: "Yes", e: ["une prescription de rééducation a été complétée et remise à la famille, au médecin traitant et à l'équipe de soins de suite"] },
    },
    notes: [
      { role: "Équipe de traumatologie — Dr Olusola Bello", date: "2026-02-04", type: "resus", text: "Lésion abdominale pénétrante avec hémorragie majeure. GCS 5 à l'arrivée ; les voies aériennes ont été sécurisées par une intubation à 22 minutes de l'arrivée. Médecin sénior présent dans les deux minutes. L'acide tranexamique a été administré mais retardé à 75 minutes après le traumatisme en raison d'un transfert interhospitalier difficile." },
      { role: "Rééducation — Dr Priya Nair", date: "2026-02-23", type: "rehab", text: "Besoins en rééducation évalués par le coordinateur de rééducation en traumatologie ; une prescription de rééducation a été complétée et remise à la famille, au médecin traitant et à l'équipe de soins de suite, avec les composantes essentielles au NMTR." },
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
      intubationConsidered: { v: "Yes", e: ["une voie aérienne définitive a été envisagée et l'intubation réalisée à 29 minutes après l'arrivée"] },
      rehabPrescription: { v: "Yes", e: ["une prescription de rééducation a été complétée et transmise au médecin traitant et au service de rééducation communautaire"] },
    },
    notes: [
      { role: "Équipe de traumatologie — Dr Olusola Bello", date: "2026-02-10", type: "resus", text: "Piéton contre véhicule. GCS 8 à l'arrivée ; une voie aérienne définitive a été envisagée et l'intubation réalisée à 29 minutes après l'arrivée. Acide tranexamique administré dans l'heure. Médecin sénior présent à cinq minutes." },
      { role: "Rééducation — Dr Priya Nair", date: "2026-02-26", type: "rehab", text: "Besoins en rééducation évalués ; une prescription de rééducation a été complétée et transmise au médecin traitant et au service de rééducation communautaire." },
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
      intubationConsidered: { v: "No", e: ["pleinement éveillé avec un GCS de 15, aucune intervention sur les voies aériennes n'a donc été envisagée"] },
      rehabPrescription: { v: "No", e: ["aucune prescription de rééducation n'était requise pour cette hospitalisation pour lésion mineure" ] },
    },
    notes: [
      { role: "Équipe de traumatologie — Dr Olusola Bello", date: "2026-02-13", type: "resus", text: "Fracture fermée isolée de l'avant-bras après une chute dans une aire de jeux. L'enfant était pleinement éveillé avec un GCS de 15, aucune intervention sur les voies aériennes n'a donc été envisagée. Aucun traumatisme crânien et aucune hémorragie majeure." },
      { role: "Rééducation — Dr Priya Nair", date: "2026-02-17", type: "rehab", text: "Besoins en rééducation revus ; aucune prescription de rééducation n'était requise pour cette hospitalisation pour lésion mineure, en dessous du seuil de rééducation en polytraumatisme." },
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
      intubationConsidered: { v: "No", e: ["les voies aériennes étaient maintenues avec un GCS de 9 et l'intubation n'a pas été nécessaire à ce stade"] },
      rehabPrescription: { v: "Yes", e: ["une prescription de rééducation a été délivrée et transmise à la famille, au médecin traitant et au prestataire de soins de suite"] },
    },
    notes: [
      { role: "Équipe de traumatologie — Dr Olusola Bello", date: "2026-02-16", type: "resus", text: "Cycliste contre véhicule avec un traumatisme thoracique. GCS 9 à l'arrivée ; les voies aériennes étaient maintenues avec un GCS de 9 et l'intubation n'a pas été nécessaire à ce stade. Aucune indication d'acide tranexamique." },
      { role: "Rééducation — Dr Priya Nair", date: "2026-03-04", type: "rehab", text: "Besoins en rééducation évalués ; une prescription de rééducation a été délivrée et transmise à la famille, au médecin traitant et au prestataire de soins de suite, avec les composantes essentielles au NMTR." },
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
      intubationConsidered: { v: "No", e: ["maintenait spontanément ses voies aériennes avec un GCS de 12 et l'intubation n'était pas indiquée"] },
      rehabPrescription: { v: "Yes", e: ["une prescription de rééducation a été complétée et transmise à la famille, au médecin traitant et au prestataire de soins de suite"] },
    },
    notes: [
      { role: "Équipe de traumatologie — Dr Olusola Bello", date: "2026-02-19", type: "resus", text: "Chute dans les escaliers avec un traumatisme crânien mineur et une lacération hépatique. L'enfant maintenait spontanément ses voies aériennes avec un GCS de 12 et l'intubation n'était pas indiquée. Aucune hémorragie majeure." },
      { role: "Rééducation — Dr Priya Nair", date: "2026-03-01", type: "rehab", text: "Besoins en rééducation évalués ; une prescription de rééducation a été complétée et transmise à la famille, au médecin traitant et au prestataire de soins de suite." },
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
  // --- Epilepsy12 (Dataset 4) -----------------------------------------------
  // Seizure type read from the epilepsy clinic letter (interpretive). Keys are
  // the record's i.seizureType.v lookup values (keep English); `label` is the
  // displayed/evidence wording (translatable). The ECG KPI keys off whether the
  // type is convulsive.
  seizureType: {
    Convulsive: { code: "convulsive", label: "convulsive (tonicoclonique généralisée / focale à bilatérale)" },
    "Non-convulsive": { code: "non convulsive", label: "non convulsive (absence / focale avec conscience préservée)" },
    Absence: { code: "absence", label: "absence (non convulsive)" },
  },
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

// --- Mock audit-detail strings (criteria + summary) -------------------------
const auditDetail = {
  databaseSummary: "Données démographiques, admissions et événements cliniques codés pour la jointure de cohorte.",
  criteria: {
    age: { label: "Âge du patient", unit: "ans" },
    admissionDate: { label: "Date d'admission" },
  },
};

const specValues = {
  condition: {
    cordBloodGasSampling: "Prélèvement des gaz du sang au cordon",
    neonatalAdmission: "Admission néonatale",
    acuteSoreThroat: "Mal de gorge aigu",
    chestPain: "Douleur thoracique",
  },
  specialty: {
    neonatology: "Néonatologie",
    obstetrics: "Obstétrique",
    paediatrics: "Pédiatrie",
    ent: "ORL",
    cardiology: "Cardiologie",
    generalMedicine: "Médecine générale",
    emergencyMedicine: "Médecine d'urgence",
  },
  ward: {
    nicu: "NICU",
    emergencyDepartment: "Service des urgences",
    maternityUnit: "Maternité",
    wardPrefix: "Service",
  },
  admissionMethod: {
    emergency: "Urgence",
    elective: "Programmée",
    transfer: "Transfert",
    dayCase: "Hôpital de jour",
  },
  age: {
    neonates: "Nouveau-nés",
    paediatric: "Pédiatrique",
    overPrefix: "Plus de",
    underPrefix: "Moins de",
  },
  sex: {
    male: "Masculin",
    female: "Féminin",
  },
  gestation: {
    minWeeks: "≥ 34 semaines",
  },
  fallback: {
    customFilter: "Filtre personnalisé",
  },
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

  // --- Epilepsy12 (Dataset 4) ----------------------------------------------
  epiPatient: (code) => `D'après les données démographiques du DPI pour ${code} — le numéro NHS à 10 chiffres du patient.`,
  epiDob: (code) => `D'après les données démographiques du DPI pour ${code} — date de naissance, au format JJ/MM/AAAA.`,
  epiSex: (code, sex, sexCode) => `D'après les données démographiques du DPI pour ${code} — sexe assigné à la naissance enregistré comme ${sex === "Male" ? "Masculin" : "Féminin"}, codé ${sexCode} (1 = Masculin, 2 = Féminin).`,
  epiAgeAtAssessment: (code, age) => `D'après le dossier du service d'épileptologie pour ${code} — âge de ${age} ans lors de la première évaluation pédiatrique ; la cohorte comprend les enfants et adolescents de 18 ans ou moins.`,
  epiReferralDate: (code) => `D'après le dossier du service d'épileptologie pour ${code} — date de réception de l'adressage, au format JJ/MM/AAAA.`,
  epiFirstAssessmentDate: (code, days) => `D'après le dossier du service d'épileptologie pour ${code} — première évaluation pédiatrique ${days} jours après l'adressage (cible ICP 1 : sous 14 jours), au format JJ/MM/AAAA.`,
  epiExpertise: (code, seen, mhCode) => `D'après le compte rendu de consultation d'épileptologie pour ${code} — la première évaluation ${seen ? "a été" : "n'a pas été"} réalisée par un pédiatre expert en épilepsie (ICP 1), enregistré comme ${mhCode === "Yes" ? "Oui" : "Non"}.`,
  epiEsnInputDate: (code) => `D'après le dossier du service d'épileptologie pour ${code} — date de la première intervention de l'infirmier spécialisé en épilepsie (ESN) (cible ICP 2 : durant la première année de prise en charge), au format JJ/MM/AAAA.`,
  epiEsnInputNotDone: (code) => `Aucune intervention d'infirmier spécialisé en épilepsie (ESN) n'est enregistrée pour ${code} durant la première année de prise en charge ; cet ICP est donc incomplet et la date reste vide.`,
  epiMriIndicated: (code, indicated) => `D'après le dossier du service d'épileptologie pour ${code} — une IRM cérébrale ${indicated ? "était" : "n'était pas"} cliniquement indiquée ; l'ICP « IRM sous 6 semaines » ne s'applique qu'en cas d'indication.`,
  epiMriRequestNA: (code) => `Aucune IRM cérébrale n'était indiquée pour ${code} ; aucune demande n'a donc été faite et la date reste vide.`,
  epiMriRequestDate: (code) => `D'après le dossier du service d'épileptologie pour ${code} — date de la demande d'IRM cérébrale, au format JJ/MM/AAAA.`,
  epiMriPerformedNA: (code) => `Aucune IRM cérébrale n'était indiquée pour ${code} ; aucune n'a donc été réalisée et la date reste vide.`,
  epiMriPerformedNotDone: (code) => `Une IRM cérébrale a été demandée pour ${code} mais n'a pas encore été réalisée ; cet ICP reste donc en attente et la date reste vide.`,
  epiMriPerformedDate: (code, days) => `D'après le dossier de radiologie pour ${code} — IRM cérébrale réalisée ${days} jours après la demande (cible ICP 5 : sous 42 jours), au format JJ/MM/AAAA.`,
  epiSeizureType: (code, label, stCode) => `D'après le compte rendu de consultation d'épileptologie pour ${code} — les crises sont ${label}, enregistrées comme ${stCode} ; l'ICP relatif à l'ECG s'applique aux crises convulsives.`,
  epiEcgNA: (code) => `${code} ne présente pas de crises convulsives ; un ECG ne fait donc pas partie du bilan requis et la date reste vide.`,
  epiEcgNotDone: (code) => `${code} présente des crises convulsives et devrait donc bénéficier d'un ECG durant la première année, mais aucun n'est enregistré ; cet ICP est donc incomplet et la date reste vide.`,
  epiEcgDate: (code) => `D'après le dossier de cardiologie pour ${code} — date de réalisation de l'ECG (ICP 4, crises convulsives), au format JJ/MM/AAAA.`,
  epiMhScreeningDate: (code) => `D'après le dossier du service d'épileptologie pour ${code} — date de réalisation du dépistage en santé mentale (ICP 6, durant la première année de prise en charge), au format JJ/MM/AAAA.`,
  epiMhScreeningNotDone: (code) => `Aucun dépistage en santé mentale n'est enregistré pour ${code} durant la première année de prise en charge ; cet ICP est donc incomplet et la date reste vide.`,
  epiMhProblem: (code, identified, mhCode) => `D'après la note de dépistage en santé mentale pour ${code} — un trouble de santé mentale ${identified ? "a été" : "n'a pas été"} identifié lors du dépistage (ICP 6), enregistré comme ${mhCode === "Yes" ? "Oui" : "Non"}.`,
  epiMhSupportProvided: (code, provided, mhCode) => `D'après la note de dépistage en santé mentale pour ${code} — un accompagnement en santé mentale ${provided ? "a été" : "n'a pas été"} proposé après l'identification d'un trouble (ICP 7), enregistré comme ${mhCode === "Yes" ? "Oui" : "Non"}.`,
  epiMhSupportNA: (code) => `Aucun trouble de santé mentale n'a été identifié pour ${code} ; l'ICP relatif à l'accompagnement proposé (ICP 7) ne s'applique donc pas et la cellule reste vide.`,
  epiCarePlanDate: (code) => `D'après le dossier du service d'épileptologie pour ${code} — date de validation du plan de soins global (cible ICP 9 : avant 12 mois), au format JJ/MM/AAAA.`,
  epiCarePlanNotDone: (code) => `Aucun plan de soins global n'est enregistré pour ${code} à 12 mois ; cet ICP est donc incomplet et la date reste vide.`,
  epiOnValproate: (code, on) => `D'après le dossier de prescription pour ${code} — le patient ${on ? "reçoit actuellement" : "ne reçoit pas"} du valproate de sodium.`,
  epiOnTopiramate: (code, on) => `D'après le dossier de prescription pour ${code} — le patient ${on ? "reçoit actuellement" : "ne reçoit pas"} du topiramate.`,
  epiPppNA: (code) => `Le programme de prévention de la grossesse (ICP 8) ne s'applique qu'aux personnes de sexe féminin de 12 ans ou plus traitées par valproate ou topiramate ; ${code} ne remplit pas ces critères, il est donc non applicable et la cellule reste vide.`,
  epiPppInPlace: (code, inPlace) => `D'après le dossier du service d'épileptologie pour ${code} — un programme de prévention de la grossesse (ou un formulaire de reconnaissance du risque) ${inPlace ? "est en place" : "n'est PAS en place"} pour cette personne en âge de procréer traitée par valproate/topiramate (ICP 8, critique pour la sécurité).`,

  // --- Major trauma (Dataset 5) --------------------------------------------
  traPatient: (code) => `D'après les données démographiques du DPI pour ${code} — le numéro NHS à 10 chiffres du patient.`,
  traDob: (code) => `D'après les données démographiques du DPI pour ${code} — date de naissance, au format JJ/MM/AAAA.`,
  traSex: (code, sex, sexCode) => `D'après les données démographiques du DPI pour ${code} — sexe assigné à la naissance enregistré comme ${sex === "Male" ? "Masculin" : "Féminin"}, codé ${sexCode} (1 = Masculin, 2 = Féminin).`,
  traAgeYears: (code, age) => `D'après le dossier du registre de traumatologie pour ${code} — âge de ${age} ans ; la cohorte de traumatologie majeure pédiatrique comprend les enfants de moins de 16 ans.`,
  traIss: (code, iss, level) => `D'après le dossier du registre de traumatologie pour ${code} — Injury Severity Score de ${iss} ; le BPT verse un complément à deux niveaux, niveau 1 à partir d'un ISS ≥9 et niveau 2 à partir d'un ISS ≥16 (${level === "Level 2" ? "niveau 2" : level === "Level 1" ? "niveau 1" : "sous le niveau 1"}).`,
  traAis3plus: (code, yes) => `D'après le dossier du registre de traumatologie pour ${code} — le patient ${yes ? "présente" : "ne présente pas"} au moins une lésion AIS 3+, le critère d'éligibilité au NMTR.`,
  traEdArrival: (code) => `D'après le dossier des urgences pour ${code} — date et heure d'arrivée aux urgences, utilisées comme point de départ des délais de la phase aiguë.`,
  traDischargeDate: (code) => `D'après le dossier du registre de traumatologie pour ${code} — date de sortie, au format JJ/MM/AAAA ; le délai de soumission du BPT court à partir de cette date.`,
  traNmtrSubmitted: (code, yes) => `D'après le dossier du registre de traumatologie pour ${code} — le cas ${yes ? "a été" : "n'a pas été"} soumis au National Major Trauma Registry (C1).`,
  traDatasetComplete: (code, yes) => `D'après le dossier du registre de traumatologie pour ${code} — le jeu de données NMTR est ${yes ? "complet" : "incomplet"} pour ce cas (C1).`,
  traSubmissionDate: (code, days) => `D'après le dossier du registre de traumatologie pour ${code} — soumis ${days} jours après la sortie (cible de déclenchement du BPT : sous 25 jours), au format JJ/MM/AAAA.`,
  traTeamActivated: (code, yes) => `D'après le dossier des urgences pour ${code} — une équipe de traumatologie ${yes ? "a été" : "n'a pas été"} activée pour cet accueil (C2, niveau 2).`,
  traConsultantPresent: (code, present) => `D'après le dossier des urgences pour ${code} — un médecin senior ${present ? "était" : "n'était pas"} présent à l'accueil par l'équipe de traumatologie (C2, niveau 2).`,
  traConsultantArrival: (code, min) => `D'après le dossier des urgences pour ${code} — le médecin senior est arrivé ${min} minutes après l'admission (cible C2 : présence d'un senior sous 5 minutes, niveau 2 / ISS ≥16).`,
  traConsultantArrivalNA: (code) => `La norme d'accueil dirigé par un médecin senior (C2) est un critère de niveau 2 s'appliquant à un ISS ≥16 ; ${code} se situe sous ce seuil, elle est donc non applicable et la cellule reste vide.`,
  traGcs: (code, gcs) => `D'après le dossier des urgences pour ${code} — score de Glasgow de ${gcs} à l'arrivée ; les critères relatifs au scanner cérébral et aux voies aériennes dépendent de cette valeur.`,
  traHeadInjury: (code, yes) => `D'après le dossier du registre de traumatologie pour ${code} — il ${yes ? "existe" : "n'existe pas"} de traumatisme crânien (AIS 1+) ; le critère « scanner cérébral sous 60 minutes » ne s'applique qu'aux traumatismes crâniens éligibles.`,
  traCtHead: (code, min) => `D'après le dossier de radiologie pour ${code} — scanner cérébral réalisé ${min} minutes après l'arrivée (cible C3 : sous 60 minutes, niveau 2), exprimé en minutes.`,
  traCtHeadNAnoHead: (code) => `${code} ne présente pas de traumatisme crânien ; un scanner cérébral ne fait donc pas partie du bilan requis et la cellule reste vide.`,
  traCtHeadNAnotEligible: (code) => `La norme « scanner cérébral sous 60 minutes » (C3) s'applique aux traumatismes crâniens de niveau 2 avec un score de Glasgow ≤13 ; ${code} ne remplit pas ces critères, elle est donc non applicable et la cellule reste vide.`,
  traTxaIndicated: (code, yes) => `D'après le dossier du registre de traumatologie pour ${code} — l'acide tranexamique ${yes ? "était" : "n'était pas"} indiqué pour une hémorragie majeure ; le critère « TXA sous 1 heure » ne s'applique qu'en cas d'indication.`,
  traTxaGiven: (code, given) => `D'après le dossier médicamenteux pour ${code} — l'acide tranexamique ${given ? "a été" : "n'a pas été"} administré (C4, niveau 2).`,
  traTxaMin: (code, min) => `D'après le dossier médicamenteux pour ${code} — acide tranexamique administré ${min} minutes après le traumatisme (cible C4 : sous 60 minutes, niveau 2), exprimé en minutes.`,
  traTxaNAnotIndicated: (code) => `L'acide tranexamique n'était pas indiqué pour ${code} ; aucun n'a donc été administré et la cellule reste vide.`,
  traIntubationConsidered: (code, considered, val) => `D'après la note de réanimation pour ${code} — la prise en charge des voies aériennes/l'intubation ${considered ? "a été" : "n'a pas été"} envisagée lors du bilan initial (C5, éligible si score de Glasgow <9), enregistré comme ${val === "Yes" ? "Oui" : "Non"}.`,
  traAirwayMin: (code, min) => `D'après la note de réanimation pour ${code} — voies aériennes/intubation envisagées ${min} minutes après l'arrivée (cible C5 : sous 30 minutes si score de Glasgow <9, niveau 1), exprimé en minutes.`,
  traAirwayNA: (code) => `La norme « voies aériennes envisagées sous 30 minutes » (C5) s'applique aux cas avec un score de Glasgow <9 ; ${code} n'atteint pas ce seuil, elle est donc non applicable et la cellule reste vide.`,
  traRehabNeedsAssessed: (code, yes) => `D'après le dossier du registre de traumatologie pour ${code} — les besoins de rééducation ${yes ? "ont été" : "n'ont pas été"} évalués durant le séjour (C6, ISS ≥9).`,
  traRehabPrescription: (code, issued, val) => `D'après la note de rééducation/sortie pour ${code} — une prescription de rééducation ${issued ? "a été" : "n'a PAS été"} établie avec ses composantes essentielles dans le NMTR et transmise au patient, au médecin traitant et à l'équipe de suivi (C6, ISS ≥9), enregistré comme ${val === "Yes" ? "Oui" : "Non"}.`,
  traRehabNA: (code) => `La norme relative à la prescription de rééducation (C6) s'applique à la cohorte avec un ISS ≥9 ; ${code} se situe sous ce seuil, elle est donc non applicable et la cellule reste vide.`,
};

// --- Blocked-cell reason_detail (CPH009 age-at-discharge) --------------------
const blockedReason = {
  cordAgeDischargeHome:
    "CPH009 a été transféré au centre régional d'hypothermie et de neurologie à J7 et n'a jamais été renvoyé à domicile depuis cette unité, donc aucun âge à la sortie à domicile n'est renseigné (recherche dans cord_ph_birth_records et le compte rendu de transfert).",
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
    cordGasPanel: "Lecture du panel de gaz du cordon",
    inspectedSchema: "Inspection du schéma du DPI",
    troponinResults: "Lecture des résultats de troponine",
    cardiometabolicScreen: "Lecture du bilan cardiométabolique",
    epilepsyInvestigations: "Read the MRI and ECG records",
    traumaReception: "Read the trauma reception times",
    traumaInterventions: "Read the CT, TXA and airway records",
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
  flowE: {
    reviewingTemplate: { headline: "Reviewing the template…", detail: "Reviewing the **Paediatric epilepsy (Epilepsy12)** audit against the **EHR database** and resolving the field mappings." },
  },
  flowT: {
    reviewingTemplate: { headline: "Reviewing the template…", detail: "Reviewing the **Paediatric major trauma (NMTR)** audit against the **EHR database** and resolving the field mappings." },
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
    title: "Couverture HbA1c ≥4×/an",
    kind: "timeseries",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "m1", label: "août", value: 0.55, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m2", label: "sept.", value: 0.62, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m3", label: "oct.", value: 0.70, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m4", label: "nov.", value: 0.75, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m5", label: "déc.", value: 0.80, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m6", label: "janv.", value: 0.83, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
    ],
    criterion: "Critère (j) du BPT diabète pédiatrique — au moins 4 résultats d'HbA1c datés dans l'année d'audit, cible de cohorte ≥90 % (recherche §3 A1) [3]",
  },
  // A2 — seven NICE annual health checks, cohort partitioned by number of
  // applicable checks completed (recomputed from the BP/foot/retinal/ACR/
  // cholesterol/thyroid/coeliac fields per patient). The four bars partition all
  // 12 patients (6 + 1 + 2 + 3); each bar's row count equals value × 12. Each
  // row highlights all seven check-date columns {AG,AH,AI,AK,AN,AP,AR}.
  "t-dia-care-processes": {
    id: "t-dia-care-processes",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Les sept bilans de santé annuels NICE",
    kind: "histogram",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "c5", label: "5 bilans réalisés", value: 6 / 12, status: "met", highlightRefs: ["NPDA!AG2", "NPDA!AH2", "NPDA!AI2", "NPDA!AK2", "NPDA!AN2", "NPDA!AP2", "NPDA!AR2", "NPDA!AG3", "NPDA!AH3", "NPDA!AI3", "NPDA!AK3", "NPDA!AN3", "NPDA!AP3", "NPDA!AR3", "NPDA!AG6", "NPDA!AH6", "NPDA!AI6", "NPDA!AK6", "NPDA!AN6", "NPDA!AP6", "NPDA!AR6", "NPDA!AG7", "NPDA!AH7", "NPDA!AI7", "NPDA!AK7", "NPDA!AN7", "NPDA!AP7", "NPDA!AR7", "NPDA!AG9", "NPDA!AH9", "NPDA!AI9", "NPDA!AK9", "NPDA!AN9", "NPDA!AP9", "NPDA!AR9", "NPDA!AG13", "NPDA!AH13", "NPDA!AI13", "NPDA!AK13", "NPDA!AN13", "NPDA!AP13", "NPDA!AR13"] },
      { key: "c4", label: "4 bilans réalisés", value: 1 / 12, status: "not-met", highlightRefs: ["NPDA!AG11", "NPDA!AH11", "NPDA!AI11", "NPDA!AK11", "NPDA!AN11", "NPDA!AP11", "NPDA!AR11"] },
      { key: "c2", label: "2 bilans réalisés", value: 2 / 12, status: "not-met", highlightRefs: ["NPDA!AG4", "NPDA!AH4", "NPDA!AI4", "NPDA!AK4", "NPDA!AN4", "NPDA!AP4", "NPDA!AR4", "NPDA!AG8", "NPDA!AH8", "NPDA!AI8", "NPDA!AK8", "NPDA!AN8", "NPDA!AP8", "NPDA!AR8"] },
      { key: "c1", label: "1 bilan réalisé", value: 3 / 12, status: "not-met", highlightRefs: ["NPDA!AG5", "NPDA!AH5", "NPDA!AI5", "NPDA!AK5", "NPDA!AN5", "NPDA!AP5", "NPDA!AR5", "NPDA!AG10", "NPDA!AH10", "NPDA!AI10", "NPDA!AK10", "NPDA!AN10", "NPDA!AP10", "NPDA!AR10", "NPDA!AG12", "NPDA!AH12", "NPDA!AI12", "NPDA!AK12", "NPDA!AN12", "NPDA!AP12", "NPDA!AR12"] },
    ],
    criterion: "Critère (k) du BPT diabète pédiatrique — les sept bilans de santé annuels NICE réalisés lorsqu'ils s'appliquent (recherche §3 A2) [3][5]",
  },
  // A3 — MDT clinic ≥4/yr + ≥8 additional contacts. Representative headline
  // (no per-contact field in the mock); the gap exemplar is the highest-HbA1c row.
  "t-dia-mdt-contacts": {
    id: "t-dia-mdt-contacts",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Consultations pluridisciplinaires ≥4/an + ≥8 contacts",
    kind: "stat",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Patients atteignant ≥4 consultations + ≥8 contacts", value: 11, status: "met", highlightRefs: ["NPDA!O2", "NPDA!O3", "NPDA!O4", "NPDA!O5", "NPDA!O6", "NPDA!O8", "NPDA!O9", "NPDA!O10", "NPDA!O11", "NPDA!O12", "NPDA!O13"] },
    ],
    criterion: "Critères (g) et (h) du BPT diabète pédiatrique — au moins 4 consultations pluridisciplinaires et au moins 8 contacts supplémentaires par an. Approximation : le jeu de données ne comporte pas de champ par contact, la consultation de chaque patient (colonne O) sert donc d'ancrage au surlignage (recherche §3 A3) [3]",
  },
  // A4 — annual psychology assessment (psychScreen present in audit year for all).
  "t-dia-psychology": {
    id: "t-dia-psychology",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Évaluation psychologique annuelle",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Évalués cette année", value: 12 / 12, status: "met", highlightRefs: ["NPDA!AY2", "NPDA!AY3", "NPDA!AY4", "NPDA!AY5", "NPDA!AY6", "NPDA!AY7", "NPDA!AY8", "NPDA!AY9", "NPDA!AY10", "NPDA!AY11", "NPDA!AY12", "NPDA!AY13"] },
      { key: "not-met", label: "Non évalués", value: 0, status: "not-met", highlightRefs: [] },
    ],
    criterion: "Critère (l) du BPT diabète pédiatrique — évaluation psychologique au moins annuelle afin de repérer un besoin de soutien supplémentaire (recherche §3 A4) [3]",
  },
  // A5 — additional dietitian appointment offered (i.dietitian.v === "Yes").
  "t-dia-dietitian": {
    id: "t-dia-dietitian",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Rendez-vous supplémentaire avec un diététicien proposé",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Proposé", value: 9 / 12, status: "met", highlightRefs: ["NPDA!BD2", "NPDA!BD3", "NPDA!BD4", "NPDA!BD6", "NPDA!BD7", "NPDA!BD8", "NPDA!BD9", "NPDA!BD11", "NPDA!BD13"] },
      { key: "not-met", label: "Non proposé", value: 3 / 12, status: "not-met", highlightRefs: ["NPDA!BD5", "NPDA!BD10", "NPDA!BD12"] },
    ],
    criterion: "Critère (i) du BPT diabète pédiatrique — au moins un rendez-vous supplémentaire avec un diététicien proposé par an, cible ≥90 % (recherche §3 A5) [3]",
  },
  // A6 — carb-counting ≤14d of diagnosis, cohort = newly-diagnosed T1 (NPD003, NPD007).
  "t-dia-carb-counting": {
    id: "t-dia-carb-counting",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Comptage des glucides ≤14 j après le diagnostic (T1 nouvellement diagnostiqués)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Dans les 14 jours", value: 1 / 2, status: "met", highlightRefs: ["NPDA!BC4", "NPDA!I4"] },
      { key: "not-met", label: "Au-delà de 14 jours", value: 1 / 2, status: "not-met", highlightRefs: ["NPDA!BC8", "NPDA!I8"] },
    ],
    criterion: "Critère (f) du BPT diabète pédiatrique — comptage des glucides de niveau 3 dans les 14 jours suivant le diagnostic pour un diabète de type 1 nouvellement diagnostiqué, dénominateur = patients nouvellement diagnostiqués (recherche §3 A6) [3]",
  },
  // A7 — high-HbA1c (≥69 mmol/mol) follow-up flag. Count at risk = 5.
  "t-dia-high-hba1c": {
    id: "t-dia-high-hba1c",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Signalement de suivi pour HbA1c élevée (≥69)",
    kind: "stat",
    target: { op: "<=", value: 0 },
    elements: [
      { key: "at-risk", label: "Patients avec une HbA1c ≥69 mmol/mol", value: 5, status: "not-met", highlightRefs: ["NPDA!T3", "NPDA!T4", "NPDA!T6", "NPDA!T7", "NPDA!T9"] },
    ],
    criterion: "Critère (o)(i) du BPT diabète pédiatrique — une HbA1c ≥69 mmol/mol déclenche une escalade de prise en charge ; signalé comme recette à risque (recherche §3 A7) [3]",
  },
  // A8 — coeliac + thyroid screening at diagnosis, cohort = newly-diagnosed T1.
  "t-dia-coeliac-thyroid": {
    id: "t-dia-coeliac-thyroid",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Dépistage cœliaque et thyroïdien au diagnostic (T1 nouvellement diagnostiqués)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Les deux dépistages réalisés", value: 2 / 2, status: "met", highlightRefs: ["NPDA!AR4", "NPDA!AP4", "NPDA!AR8", "NPDA!AP8"] },
      { key: "not-met", label: "Incomplet", value: 0, status: "not-met", highlightRefs: [] },
    ],
    criterion: "Sous-ensemble du critère (k) du BPT diabète pédiatrique — dépistage de la maladie cœliaque et de la fonction thyroïdienne au moment du diagnostic pour un diabète de type 1 nouvellement diagnostiqué (recherche §3 A8) [3][5]",
  },

  // === Dashboard 2 — Paediatric Epilepsy BPT (Epilepsy12, rows A2–A11) ======
  // B1 — epilepsy-expert paediatrician ≤2 weeks of referral.
  "t-epi-paediatrician-2wk": {
    id: "t-epi-paediatrician-2wk",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "Pédiatre expert en épilepsie ≤2 semaines",
    kind: "timeseries",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "m1", label: "août", value: 0.50, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m2", label: "sept.", value: 0.58, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m3", label: "oct.", value: 0.65, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m4", label: "nov.", value: 0.72, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m5", label: "déc.", value: 0.78, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m6", label: "janv.", value: 0.80, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
    ],
    criterion: "ICP 1 d'Epilepsy12 — évaluation par un pédiatre sénior expert en épilepsie dans les 2 semaines suivant l'orientation (recherche §3 B1) [7]",
  },
  // B2 — ESN input within the first year.
  "t-epi-esn-first-year": {
    id: "t-epi-esn-first-year",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "Intervention infirmière spécialisée la première année",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Intervention dans l'année", value: 9 / 10, status: "met", highlightRefs: ["Epilepsy!J2", "Epilepsy!J3", "Epilepsy!J4", "Epilepsy!J5", "Epilepsy!J6", "Epilepsy!J8", "Epilepsy!J9", "Epilepsy!J10", "Epilepsy!J11"] },
      { key: "not-met", label: "Aucune intervention", value: 1 / 10, status: "not-met", highlightRefs: ["Epilepsy!J7"] },
    ],
    criterion: "ICP 2 d'Epilepsy12 — intervention d'un infirmier spécialisé en épilepsie au cours de la première année de prise en charge (recherche §3 B2) [3][7]",
  },
  // B3 — MRI ≤6 weeks where indicated (eligible = mriIndicated Yes; 6 of 10).
  "t-epi-mri-6wk": {
    id: "t-epi-mri-6wk",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "IRM ≤6 semaines (lorsqu'elle est indiquée)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Dans les 6 semaines", value: 4 / 6, status: "met", highlightRefs: ["Epilepsy!M2", "Epilepsy!N2", "Epilepsy!M3", "Epilepsy!N3", "Epilepsy!M6", "Epilepsy!N6", "Epilepsy!M10", "Epilepsy!N10"] },
      { key: "not-met", label: "Au-delà de 6 semaines / non réalisée", value: 2 / 6, status: "not-met", highlightRefs: ["Epilepsy!M4", "Epilepsy!N4", "Epilepsy!M8", "Epilepsy!N8"] },
    ],
    criterion: "ICP 5 d'Epilepsy12 — IRM réalisée dans les 6 semaines suivant la demande lorsqu'elle est indiquée ; dénominateur = cas indiqués uniquement (recherche §3 B3) [7]",
  },
  // B4 — ECG in convulsive seizures (eligible = convulsive; 7 of 10).
  "t-epi-ecg-convulsive": {
    id: "t-epi-ecg-convulsive",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "ECG en cas de crises convulsives",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "ECG réalisé", value: 6 / 7, status: "met", highlightRefs: ["Epilepsy!Q2", "Epilepsy!Q3", "Epilepsy!Q5", "Epilepsy!Q8", "Epilepsy!Q9", "Epilepsy!Q11"] },
      { key: "not-met", label: "Aucun ECG", value: 1 / 7, status: "not-met", highlightRefs: ["Epilepsy!Q6"] },
    ],
    criterion: "ICP 4 d'Epilepsy12 — ECG réalisé au cours de la première année lorsque les crises sont convulsives ; dénominateur = cas convulsifs (recherche §3 B4) [7]",
  },
  // B5 — mental-health screening documented within first year.
  "t-epi-mh-screening": {
    id: "t-epi-mh-screening",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "Mental-health screening + support",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Screened", value: 9 / 10, status: "met", highlightRefs: ["Epilepsy!S2", "Epilepsy!S3", "Epilepsy!S4", "Epilepsy!S5", "Epilepsy!S6", "Epilepsy!S7", "Epilepsy!S8", "Epilepsy!S9", "Epilepsy!S11"] },
      { key: "not-met", label: "Not screened", value: 1 / 10, status: "not-met", highlightRefs: ["Epilepsy!S10"] },
    ],
    criterion: "Epilepsy12 KPIs 6 & 7 — mental-health screening documented in first year, with support where a problem is identified (research §3 B5) [7]",
  },
  // B6 — comprehensive care plan by 12 months.
  "t-epi-care-plan-12mo": {
    id: "t-epi-care-plan-12mo",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "Comprehensive care plan by 12 months",
    kind: "timeseries",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "m1", label: "août", value: 0.55, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m2", label: "sept.", value: 0.65, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m3", label: "oct.", value: 0.72, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m4", label: "nov.", value: 0.80, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m5", label: "déc.", value: 0.85, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m6", label: "janv.", value: 0.90, status: "met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
    ],
    criterion: "Epilepsy12 KPI 9a/9b — an agreed comprehensive care plan by 12 months (research §3 B6) [7]",
  },
  // B7 — valproate/topiramate safety (PPP). Eligible = female ≥12 on valproate/
  // topiramate (EPI002, EPI003, EPI005); EPI005 is the deliberate PPP gap.
  "t-epi-valproate-ppp": {
    id: "t-epi-valproate-ppp",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "Valproate/topiramate safety (PPP)",
    kind: "stat",
    target: { op: ">=", value: 1 },
    elements: [
      { key: "at-risk", label: "On valproate/topiramate without PPP", value: 1, status: "not-met", highlightRefs: ["Epilepsy!AA6"] },
    ],
    criterion: "Epilepsy12 KPI 8 — pregnancy prevention programme / risk-acknowledgement for females ≥12 on valproate or topiramate (research §3 B7) [7]",
  },

  // === Dashboard 3 — Paediatric Major Trauma BPT (NMTR, rows A2–A11) ========
  // C1 — registry submission ≤25 days of discharge (the BPT trigger).
  "t-tra-registry-25d": {
    id: "t-tra-registry-25d",
    dashboardId: "paediatric-trauma-bpt",
    title: "Registry submission ≤25 days",
    kind: "timeseries",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "m1", label: "août", value: 0.60, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m2", label: "sept.", value: 0.70, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m3", label: "oct.", value: 0.78, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m4", label: "nov.", value: 0.83, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m5", label: "déc.", value: 0.88, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m6", label: "janv.", value: 0.90, status: "met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
    ],
    criterion: "Major Trauma BPT trigger — NMTR/TARN dataset complete and submitted within 25 days of discharge (research §3 C1) [10][12]",
  },
  // C2 — consultant-led reception ≤5 min, eligible = Level 2 (ISS ≥16; 6 cases).
  "t-tra-consultant-5min": {
    id: "t-tra-consultant-5min",
    dashboardId: "paediatric-trauma-bpt",
    title: "Consultant-led reception ≤5 min (Level 2)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Consultant ≤5 min", value: 4 / 6, status: "met", highlightRefs: ["Trauma!N2", "Trauma!O2", "Trauma!P2", "Trauma!N4", "Trauma!O4", "Trauma!P4", "Trauma!N7", "Trauma!O7", "Trauma!P7", "Trauma!N8", "Trauma!O8", "Trauma!P8"] },
      { key: "not-met", label: "Over 5 min / not recorded", value: 2 / 6, status: "not-met", highlightRefs: ["Trauma!N3", "Trauma!O3", "Trauma!P3", "Trauma!N10", "Trauma!O10", "Trauma!P10"] },
    ],
    criterion: "Major Trauma BPT (Level 2, ISS ≥16) — consultant-led trauma team, consultant present within 5 min of arrival (research §3 C2) [10]",
  },
  // C3 — CT head ≤60 min, eligible = Level 2 head injury with GCS ≤13 (6 cases).
  "t-tra-ct-head-60min": {
    id: "t-tra-ct-head-60min",
    dashboardId: "paediatric-trauma-bpt",
    title: "CT head ≤60 min (GCS ≤13, Level 2)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Within 60 min", value: 5 / 6, status: "met", highlightRefs: ["Trauma!R2", "Trauma!S2", "Trauma!T2", "Trauma!R4", "Trauma!S4", "Trauma!T4", "Trauma!R7", "Trauma!S7", "Trauma!T7", "Trauma!R8", "Trauma!S8", "Trauma!T8", "Trauma!R10", "Trauma!S10", "Trauma!T10"] },
      { key: "not-met", label: "Over 60 min", value: 1 / 6, status: "not-met", highlightRefs: ["Trauma!R3", "Trauma!S3", "Trauma!T3"] },
    ],
    criterion: "Major Trauma BPT (Level 2) — CT head within 60 min for head-injury cases with GCS ≤13 (research §3 C3) [10]",
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
      { key: "m1", label: "août", value: 0.45, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m2", label: "sept.", value: 0.40, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m3", label: "oct.", value: 0.36, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m4", label: "nov.", value: 0.31, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m5", label: "déc.", value: 0.28, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m6", label: "janv.", value: 0.25, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
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
