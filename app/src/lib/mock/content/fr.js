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
//   templateDetail   — mock template-detail localization (database summary + fixed-criteria labels/units)
//   specValues       — mock parse chip VALUES (cohort defaults/options)
//   explain          — namespace of FUNCTIONS returning the right-panel explanation strings (preserve ${…} interpolation)
//   blockedReason    — the blocked-cell reason_detail (CPH009 age-at-discharge)
//   timeline         — { activities, tools, thinks, summaryWords, email parsing } headline/detail/think strings keyed sensibly
//   email            — mockSampleEmail body

// French (fr) translation of the artifactWorkspace namespace (#358, Lung MOC demo).
// Mirrors en.js's artifactWorkspace shape EXACTLY (same keys, order, function
// signatures and ${…} interpolation positions); only the human-readable prose is
// translated. Language-invariant tokens (ids, ISO dates, %, mm/cm/mg/Gy, TNM,
// UICC stage groups, Annexe 55 code numbers, ECOG scores, biomarker/drug tokens)
// stay byte-identical — see artifactWorkspaceParity.test.js.
const artifactWorkspace = {
  // Field labels (Annexe 55 field names). The five promoted registration fields
  // (base of diagnosis, localisation·laterality, differentiation, biopsy, PET-CT)
  // keep their labels in `provenance.labels` — they are the same strings, now
  // rendered as form fields rather than inside the histology evidence block.
  columns: {
    patient: "Patient",
    histology: "Histologie",
    ecog: "ECOG",
    tnm: "TNM",
    stage: "Stade",
    pdl1: "PD-L1 TPS",
    egfr: "EGFR",
    ngs: "NGS/Moléculaire",
    previousTreatment: "Traitements antérieurs",
    treatment: "Traitement actuel",
    mocNotes: "Notes COM",
  },

  // Form section headings, in render order (see FORM_SECTIONS in the demo module).
  sections: {
    diagnosis: "Diagnostic",
    staging: "Stadification et bilan",
    performance: "Statut de performance",
    molecular: "Moléculaire",
    treatment: "Traitement",
    moc: "COM",
  },

  // Per-field status word shown beside the label; the colour is the form's own.
  fieldStatus: {
    interpreted: "à vérifier",
    conflict: "conflit",
    edited: "modifié par vous",
  },

  // Coded-value composition: `name (code NN)`. Name localises; the code number is
  // passed in from logic. The literal word "code" lives here so it can localise.
  coded: (name, code) => `${name} (code ${code})`,

  // Histology column names (field 6 · diagnostic histology + behaviour).
  histology: {
    adenocarcinoma: "Adénocarcinome",
    squamousCell: "Carcinome épidermoïde",
    nsclcNos: "CBNPC, SAI",
    smallCellSclc: "Petites cellules (CBPC)",
  },

  // ECOG labels (field 3 · WHO/ECOG score). Rendered `label (score)`; the score
  // number is invariant and lives in logic.
  ecog: {
    fullyActive: "Pleinement actif",
    ambulatory: "Ambulatoire",
    selfCareOnly: "Autonome uniquement",
    scored: (label, score) => `${label} (${score})`,
  },

  // Stage column: the numbered UICC groups (IVA, IIIB, …) are invariant and stay
  // in logic; only the SCLC prose descriptor localises.
  stage: {
    extensive: "Stade étendu",
  },

  // Matrix prose values (words, not codes) and mixed-value templates. The code
  // number / percentage / genomic token is always interpolated from logic.
  values: {
    missing: "Manquant",
    pending: "En attente",
    complete: "Complet",
    negative: "Négatif",
    na: "N/A",
    naSquamous: "N/A (épidermoïde)",
    naEarlyStage: "N/A (stade précoce)",
    naSclc: "N/A (CBPC)",
    insufficientTissue: "Tissu insuffisant (nouvel examen demandé)",
    completeWith: (marker) => `Complet (${marker})`,
    positiveWith: (variant) => `Positif (${variant})`,
    conflicting: (a, b) => `Conflit (${a} vs ${b})`,
    // Blocked-cell reason details surfaced in the evidence panel status. The
    // status matching itself (missing / pending / insufficient tissue / n/a) is
    // logic that keys off the English value and stays in the demo module.
    missingReasonDetail: "Aucun document source trouvé pour ce champ.",
    insufficientTissueReasonDetail: "L'échantillon contenait un tissu insuffisant pour cet examen ; une nouvelle biopsie a été demandée.",
  },

  // Treatment column names (field 10 · coded chronology). Each renders through
  // `coded`; dates inside a name are invariant and interpolated in logic.
  treatment: {
    pembrolizumabStarted: "Pembrolizumab, débuté",
    concurrentChemoRtCompleted: "Chimioradiothérapie concomitante, terminée",
    // Stands alone as L-3402's whole Current treatment value now that its
    // completed chemo-RT has moved to Previous treatments.
    noConsolidationImmunotherapy: "Pas d'immunothérapie de consolidation",
    documented: "documentée",
    carboPaclitaxelPembrolizumab: "Carbo/paclitaxel + pembrolizumab",
    osimertinibStarted: "Osimertinib, débuté",
    surgeryPlanned: "Chirurgie planifiée — en attente de la planification chirurgicale",
    notYetStarted: "Pas encore débuté — bilan incomplet",
    alectinibStarted: "Alectinib, débuté",
    concurrentChemoRtOngoing: "Chimioradiothérapie concomitante, en cours",
    carboEtoposideAtezolizumab: "Carbo/etoposide + atezolizumab",
    // L-3401 progressed on first-line chemo-immunotherapy; L-3409 is a platinum
    // re-challenge after a >6-month platinum-free interval. Both are facts, not
    // plans — the next line is the meeting's job (design principle 1).
    stoppedAtProgression: "Arrêté à la progression — aucune nouvelle ligne débutée",
    carboEtoposideAtezolizumabRechallenge: "Carbo/etoposide + atezolizumab, réintroduction",
  },

  // Previous-treatment lines (Annexe 55 field 10 · coded chronology, rendered as
  // one prose line per prior treatment). Each line composes in logic as
  // `{ISO date} — {name}`; dates, cycle counts, doses, month counts and code
  // numbers are invariant and interpolated in from there.
  priorTreatment: {
    none: "Aucun traitement systémique, radiothérapie ni chirurgie antérieurs documentés.",
    carboPemetrexedPembrolizumab: (cycles) => `Carboplatin/pemetrexed + pembrolizumab, ${cycles} cycles`,
    pemetrexedPembrolizumabMaintenance: "Entretien par pemetrexed/pembrolizumab",
    progressionSystemicStopped: "Progression sous entretien — traitement systémique arrêté",
    concurrentChemoRtCompleted: (dose, fractions) =>
      `Chimioradiothérapie concomitante terminée, ${dose} en ${fractions} fractions avec carboplatin/paclitaxel hebdomadaire`,
    carboEtoposideAtezolizumab: (cycles) => `Carboplatin/etoposide + atezolizumab, ${cycles} cycles`,
    atezolizumabMaintenance: "Entretien par atezolizumab",
    progressionPlatinumFreeInterval: (months) =>
      `Progression sous entretien — intervalle sans platine de ${months} mois`,
  },

  // Clinical note-type labels, shared across interpreted-cell notes, conflict
  // sources and precedent facts.
  noteLabels: {
    oncologyConsult: "Note de consultation oncologique",
    oncologyTreatment: "Note de traitement oncologique",
    mdtOutcome: "Note de conclusion de concertation multidisciplinaire",
    radiationOncologyCompletion: "Note de fin de radiothérapie",
    thoracicSurgeryClinic: "Note de consultation de chirurgie thoracique",
    oncologyClinic: "Note de consultation d'oncologie",
    radiationOncologyProgress: "Note de suivi de radiothérapie",
    oncologyNote: "Note d'oncologie",
    oncologyFollowUp: "Note de suivi oncologique",
    radiologyNote: "Note de radiologie",
    recordReview: "Revue du dossier médicamenteux et des procédures",
    pathologyReport: "Compte rendu anatomopathologique",
    molecularPathologyReread: "Relecture de pathologie moléculaire",
  },

  // Histology-cell evidence: the Annexe 55 provenance block (fields 2, 4, 5, 7).
  // Coded names render through `coded`; lobe/laterality/differentiation names and
  // biopsy procedure names localise, the code numbers and dates stay in logic.
  provenance: {
    labels: {
      baseOfDiagnosis: "Base du diagnostic",
      localisationLaterality: "Localisation · latéralité",
      differentiationGrade: "Degré de différenciation",
      biopsy: "Biopsie",
      petct: "PET-CT",
    },
    baseOfDiagnosis: {
      histologyOfPrimary: "Histologie de la tumeur primitive",
      cytology: "Cytologie",
    },
    lobes: {
      rightUpperLobe: "Lobe supérieur droit",
      leftUpperLobe: "Lobe supérieur gauche",
      leftLowerLobe: "Lobe inférieur gauche",
      rightLowerLobe: "Lobe inférieur droit",
    },
    laterality: {
      left: "Gauche",
      right: "Droite",
    },
    differentiation: {
      well: "Bien différencié",
      moderately: "Moyennement différencié",
      poorly: "Peu différencié",
      unknown: "Inconnu",
    },
    biopsyProcedures: {
      ctGuidedLung: "pulmonaire guidée par scanner",
      bronchoscopy: "bronchoscopie",
      pleural: "pleurale",
      vatsWedge: "cunéiforme par VATS",
    },
    // `{lobe} · {laterality (code n)}` — the middot is punctuation, from logic.
    localisation: (lobe, lateralityCoded) => `${lobe} · ${lateralityCoded}`,
    // `{ISO date} ({procedure})` — the date is invariant, from logic.
    biopsyValue: (date, procedure) => `${date} (${procedure})`,
  },

  // Evidence side panel (both the fixture-built evidence and the component chrome).
  evidence: {
    selectedCell: "Cellule sélectionnée",
    mocNote: "Note COM",
    interpretedExplanation: (columnTitle, rowId, noteLabel, date) =>
      `La valeur ${columnTitle} a été extraite du texte libre dans la ${noteLabel} de ${rowId} (${date}).`,
    directExplanation: (columnTitle, concept, rowId) =>
      `La valeur ${columnTitle} est lue à partir de la source ${concept} liée au patient ${rowId}.`,
    mocNoteExplanation: (rowId) => `Écrit dans les Notes COM à partir d'une conversation de suivi concernant ${rowId}.`,
    // ArtifactEvidence.svelte chrome.
    conflictHeading: "Sources contradictoires",
    conflictHint: "Les deux lectures sont conservées au dossier. Corrigez le champ pour indiquer laquelle fait foi.",
    blockNote: "Note",
    blockReferences: "Références",
    blockSource: "Source",
    blockQuery: "Requête",
    blockReport: "Rapport",
    close: "Fermer les preuves",
  },

  // The DB concept descriptor rendered in the direct-cell explanation ("…read
  // from the {concept} source…"), keyed by column id. Localises the human-facing
  // descriptor; the SQL `concept_name` token stays in logic (FIELD_SOURCES), so
  // the query text is language-invariant while the sentence localises.
  fieldSourceConcepts: {
    histology: "histologie",
    tnm: "classification TNM",
    pdl1: "PD-L1 TPS",
    egfr: "mutation EGFR",
    ngs: "panel NGS",
    previousTreatment: "lignes de traitement antérieures",
    treatment: "traitement actuel",
    mocNotes: "note de discussion COM",
    // The five Annexe 55 registration fields promoted out of the histology
    // evidence block into the form.
    baseOfDiagnosis: "base du diagnostic",
    localisation: "localisation tumorale",
    differentiation: "degré de différenciation",
    biopsy: "compte rendu de biopsie",
    petct: "compte rendu PET-CT",
  },

  // The two attention-list lines shown in the opening turn. Ids, code numbers,
  // stage groups, dates and percentages are interpolated from logic.
  attention: {
    flagMissing: "Manquant",
    flagConflicting: "Conflit",
    l3402Label: (id, stage) => `${id} (stade ${stage}, non résécable)`,
    l3402Detail: (chemoCode, rtDate, immunoCode) =>
      `chimioradiothérapie concomitante (code ${chemoCode}) terminée le ${rtDate}, mais aucune ligne d'immunothérapie de consolidation (code ${immunoCode}) n'est documentée. La consolidation par durvalumab est le traitement de référence après la chimioradiothérapie et fait l'objet d'un suivi COM pour le remboursement — il convient de vérifier si la fenêtre thérapeutique est dépassée.`,
    l3404Label: (id, stage) => `${id} (stade ${stage})`,
    l3404Detail: (pathologyValue, rereadValue) =>
      `PD-L1 TPS contradictoire : le compte rendu anatomopathologique indique ${pathologyValue}, la relecture de pathologie moléculaire indique ${rereadValue}. Le choix du traitement peut dépendre de la valeur utilisée.`,
  },

  // Source-document bodies + verbatim quote substrings for the L-3404 PD-L1
  // conflict. Percentages inside the prose are invariant, kept verbatim here.
  conflict: {
    pdl1: {
      pathology: {
        quotes: ["score de proportion tumorale 60%"],
        body: "PD-L1 (22C3 assay) : score de proportion tumorale 60%.",
      },
      reread: {
        quotes: ["score de proportion tumorale 10%", "nouvel examen recommandé si déterminant pour la décision thérapeutique"],
        body: "Nouvelle relecture de l'IHC PD-L1 à la demande du second lecteur : score de proportion tumorale 10%. Marquage hétérogène constaté ; nouvel examen recommandé si déterminant pour la décision thérapeutique.",
      },
    },
  },

  // Clinical note prose behind every interpreted (yellow) cell, keyed
  // "rowId:columnId". `quotes` are verbatim substrings of `body`. The note label
  // and date are held in logic (label -> noteLabels; date invariant).
  interpretedNotes: {
    "L-3401:ecog": {
      quotes: ["Statut de performance ECOG 1"],
      body: "Revu en consultation avant la rediscussion en COM. Statut de performance ECOG 1 : symptomatique en raison de la toux mais parfaitement ambulatoire et autonome. Apte à la poursuite d'un traitement systémique.",
    },
    "L-3401:stage": {
      quotes: ["classée cT2 cN3 cM1b, stade UICC IVA"],
      body: "Nouveau bilan d'extension après progression sous entretien. Le scanner et le PET montrent la tumeur primitive connue de 4.2cm du lobe supérieur droit avec atteinte ganglionnaire médiastinale multi-stations et controlatérale, ainsi qu'une métastase surrénalienne unique ; classée cT2 cN3 cM1b, stade UICC IVA. NGS tissulaire reconfirmé et revu avec le patient.",
    },
    "L-3401:treatment": {
      quotes: ["traitement systémique arrêté et aucune nouvelle ligne débutée"],
      body: "Carboplatin/pemetrexed avec pembrolizumab en première ligne : 4 cycles réalisés, suivis d'un entretien par pemetrexed/pembrolizumab. Progression sous entretien confirmée au scanner du 2026-05-28 ; traitement systémique arrêté et aucune nouvelle ligne débutée. Le NGS tissulaire retrouve KRAS G12C. À rediscuter en COM.",
    },
    "L-3402:ecog": {
      quotes: ["statut de performance ECOG 1"],
      body: "Apte à une chimioradiothérapie concomitante à visée curative : statut de performance ECOG 1, ambulatoire et autonome dans les activités quotidiennes, fonction organique adéquate sur le bilan biologique initial.",
    },
    "L-3402:stage": {
      quotes: ["stade IIIB (cT4 cN2 cM0) et non résécable"],
      body: "Revue en concertation multidisciplinaire de l'imagerie et des résultats de l'EBUS : maladie ganglionnaire médiastinale volumineuse avec atteinte ganglionnaire controlatérale. La chirurgie thoracique conclut que la maladie est de stade IIIB (cT4 cN2 cM0) et non résécable. Plan consensuel : chimioradiothérapie concomitante à visée curative.",
    },
    "L-3402:treatment": {
      quotes: ["Chimioradiothérapie concomitante terminée aujourd'hui", "aucune prescription d'immunothérapie de consolidation effectuée"],
      body: "Chimioradiothérapie concomitante terminée aujourd'hui : 60 Gy en 30 fractions avec carboplatin/paclitaxel hebdomadaire, tolérée avec une œsophagite de grade 1. Résultat PD-L1 en attente à la fin du traitement ; aucune prescription d'immunothérapie de consolidation effectuée à ce stade. Pour suivi en oncologie médicale.",
    },
    "L-3403:ecog": {
      quotes: ["Statut de performance ECOG 1"],
      body: "La cytologie du liquide pleural confirme un carcinome épidermoïde. Statut de performance ECOG 1 : symptomatique avec dyspnée d'effort mais ambulatoire et autonome. Pour traitement systémique de première ligne.",
    },
    "L-3403:stage": {
      quotes: ["épanchement pleural malin — maladie cM1a, stade UICC IVA"],
      body: "La cytologie du liquide pleural issue de la ponction du 2026-05-28 est positive pour des cellules malignes compatibles avec un carcinome épidermoïde, confirmant un épanchement pleural malin — maladie cM1a, stade UICC IVA. Statut de performance ECOG 1. Pour traitement systémique de première ligne.",
    },
    "L-3403:treatment": {
      quotes: ["carboplatin/paclitaxel avec pembrolizumab"],
      body: "Cycle 2 de carboplatin/paclitaxel avec pembrolizumab administré aujourd'hui. Traitement bien toléré hormis une fatigue de grade 1 ; épanchement pleural cliniquement stable, pas de nouvelle accumulation nécessitant un drainage.",
    },
    "L-3404:ecog": {
      quotes: ["statut de performance ECOG 0"],
      body: "Malgré des métastases osseuses, le patient conserve un statut de performance ECOG 0 : pleinement actif, capable de poursuivre toutes ses activités antérieures à la maladie sans restriction. Pour thérapie ciblée dirigée contre l'EGFR.",
    },
    "L-3404:stage": {
      quotes: ["multiples métastases osseuses", "maladie cM1c, stade UICC IVB"],
      body: "Le PET-CT et l'IRM du rachis confirment de multiples métastases osseuses (corps vertébral T8, aile iliaque gauche) en plus de la tumeur primitive pulmonaire : maladie cM1c, stade UICC IVB. Antalgie instaurée ; agent de protection osseuse discuté. EGFR exon 19 deletion positive — pour thérapie ciblée.",
    },
    "L-3404:treatment": {
      quotes: ["Osimertinib 80mg une fois par jour débuté aujourd'hui"],
      body: "EGFR exon 19 deletion confirmée sur NGS tissulaire. Osimertinib 80mg une fois par jour débuté aujourd'hui après ECG et bilan biologique de référence. Patient informé du risque de rash, de diarrhée et de la surveillance du QTc ; première évaluation de la réponse dans 6 semaines.",
    },
    "L-3405:ecog": {
      quotes: ["Statut de performance ECOG 0"],
      body: "Patient en bon état général avec un nodule de découverte fortuite. Statut de performance ECOG 0 : pleinement actif, asymptomatique, sans limitation fonctionnelle. Apte à une lobectomie.",
    },
    "L-3405:stage": {
      quotes: ["stade pathologique IA (pT1b pN0 cM0), maladie résécable"],
      body: "Nodule solitaire de 2.1cm du lobe supérieur droit, avide au PET, sans atteinte ganglionnaire ni à distance : stade pathologique IA (pT1b pN0 cM0), maladie résécable. L'histologie de la résection cunéiforme confirme un adénocarcinome avec des marges saines sur la pièce diagnostique. Adressé en chirurgie thoracique pour la planification de la résection définitive.",
    },
    "L-3405:treatment": {
      quotes: ["en attente de la planification chirurgicale"],
      body: "Revu en consultation de chirurgie thoracique. Fonction pulmonaire adéquate pour une lobectomie (FEV1 92% de la valeur prédite). Actuellement en attente de la planification chirurgicale et de l'évaluation anesthésique préopératoire ; inscription visée dans les 4 semaines.",
    },
    "L-3406:ecog": {
      quotes: ["Statut de performance ECOG 2"],
      body: "Statut de performance ECOG 2 : symptomatique, debout et actif plus de la moitié de la journée d'éveil et capable de se prendre en charge mais incapable de travailler. L'intensité du traitement devra être mise en balance avec le statut de performance lors de la COM.",
    },
    "L-3406:stage": {
      quotes: ["stade IIIA (cT3 cN2 cM0) et non résécable"],
      body: "L'EBUS confirme une atteinte ganglionnaire N2 (stations 4R et 7). Consensus en concertation multidisciplinaire : la maladie est de stade IIIA (cT3 cN2 cM0) et non résécable ; pas de candidat chirurgical. Le plan dépend de la qualité de la nouvelle biopsie pour le profilage moléculaire.",
    },
    "L-3406:treatment": {
      quotes: ["Le traitement n'a pas encore débuté"],
      body: "Le traitement n'a pas encore débuté. L'échantillon initial contenait un tissu insuffisant pour le panel NGS ; nouvelle biopsie bronchoscopique demandée avant de finaliser le plan systémique. PD-L1 et EGFR également en attente. À rediscuter en COM dès le retour des résultats.",
    },
    "L-3407:ecog": {
      quotes: ["Statut de performance ECOG 1"],
      body: "Nouvellement diagnostiqué avec des métastases cérébrales mais neurologiquement intact. Statut de performance ECOG 1 : ambulatoire et autonome, sans besoin de corticoïdes. Mise sous thérapie ciblée à pénétration dans le SNC.",
    },
    "L-3407:stage": {
      quotes: ["maladie cM1c, stade UICC IVB, avec métastases cérébrales"],
      body: "L'IRM cérébrale (2026-05-26) montre trois métastases rehaussées, la plus grande de 14mm dans le lobe frontal droit : maladie cM1c, stade UICC IVB, avec métastases cérébrales. Asymptomatique, sans besoin de corticoïdes. Réarrangement ALK identifié au NGS — thérapie ciblée à pénétration dans le SNC préférée à la radiothérapie d'emblée.",
    },
    "L-3407:treatment": {
      quotes: ["Alectinib 600mg deux fois par jour débuté aujourd'hui (2026-05-30)"],
      body: "Réarrangement ALK confirmé. Alectinib 600mg deux fois par jour débuté aujourd'hui (2026-05-30), maladie intracrânienne laissée non irradiée compte tenu de l'activité attendue au niveau du SNC. LFTs et CK de référence normaux ; IRM cérébrale de surveillance prévue à 3 et 6 semaines.",
    },
    "L-3408:ecog": {
      quotes: ["Statut de performance ECOG 1"],
      body: "Statut de performance ECOG 1 : symptomatique mais ambulatoire et autonome, éligible à une chimioradiothérapie concomitante à visée curative. PD-L1 70% ; immunothérapie de consolidation à envisager à la fin du traitement.",
    },
    "L-3408:stage": {
      quotes: ["stade IIIB (cT4 cN2 cM0), non résécable"],
      body: "Nouveau bilan d'extension après biopsie bronchoscopique : l'atteinte ganglionnaire médiastinale controlatérale classe la maladie au stade IIIB (cT4 cN2 cM0), non résécable. La concertation multidisciplinaire recommande une chimioradiothérapie concomitante avec immunothérapie de consolidation à envisager à la fin du traitement, PD-L1 70%.",
    },
    "L-3408:treatment": {
      quotes: ["Chimioradiothérapie concomitante en cours"],
      body: "Chimioradiothérapie concomitante en cours : fraction 18 sur 30 administrée avec carboplatin/paclitaxel hebdomadaire. Œsophagite de grade 1 gérée par antalgie soluble ; aucune interruption de traitement à ce jour. En voie d'achèvement le 2026-07-22.",
    },
    "L-3409:ecog": {
      quotes: ["Statut de performance ECOG 1"],
      body: "Cancer bronchique à petites cellules en rechute, se représentant après un intervalle libre de tout traitement. Statut de performance ECOG 1 : symptomatique mais ambulatoire et autonome. Apte à la poursuite d'une chimio-immunothérapie sans délai.",
    },
    "L-3409:stage": {
      quotes: ["maladie de stade étendu"],
      body: "Cancer bronchique à petites cellules en rechute confirmé à la nouvelle biopsie bronchoscopique du 2026-06-07. Le scanner de réévaluation montre des métastases hépatiques et des ganglions hilaires controlatéraux : maladie de stade étendu. ECOG 1. Intervalle sans platine de 6 mois.",
    },
    "L-3409:treatment": {
      quotes: ["carboplatin/etoposide avec atezolizumab"],
      body: "Cycle 1 de carboplatin/etoposide avec atezolizumab administré aujourd'hui en réintroduction du platine, l'intervalle sans platine étant de 6 mois. Antiémétiques et soutien par G-CSF prescrits. Plan : 4 cycles puis atezolizumab d'entretien ; scanner de réponse après le cycle 2.",
    },
  },

  // Source documents behind the Previous treatments field for the two patients
  // that carry a real prior-treatment history (L-3401, L-3409). The other seven
  // reuse notes already in this pack. Ids, note labels and dates stay in logic.
  priorTreatmentSources: {
    l3401FirstLine: {
      quotes: ["Cycle 1 de carboplatin/pemetrexed avec pembrolizumab administré aujourd'hui"],
      body: "Cycle 1 de carboplatin/pemetrexed avec pembrolizumab administré aujourd'hui. PD-L1 TPS 80% ; le NGS tissulaire retrouve KRAS G12C sans autre altération ciblable. Plan : 4 cycles, puis entretien par pemetrexed/pembrolizumab.",
    },
    l3401Progression: {
      quotes: ["lésions hépatiques nouvelles et en augmentation compatibles avec une maladie en progression"],
      body: "Scanner thoraco-abdominal : lésions hépatiques nouvelles et en augmentation compatibles avec une maladie en progression par rapport à l'examen antérieur. La tumeur primitive du lobe supérieur droit et les ganglions médiastinaux sont également plus volumineux. Conclusion : progression sous traitement d'entretien.",
    },
    l3409FirstLine: {
      quotes: ["Cycle 1 de carboplatin/etoposide avec atezolizumab administré aujourd'hui"],
      body: "Cycle 1 de carboplatin/etoposide avec atezolizumab administré aujourd'hui pour un cancer bronchique à petites cellules de stade étendu. Antiémétiques et soutien par G-CSF prescrits. Plan : 4 cycles, puis atezolizumab d'entretien.",
    },
    l3409Relapse: {
      quotes: ["nouvelles lésions hépatiques et ganglionnaires compatibles avec une rechute"],
      body: "Scanner thoraco-abdominal de surveillance : nouvelles lésions hépatiques et ganglionnaires compatibles avec une rechute. Aucun nouveau symptôme intracrânien rapporté. Conclusion : rechute après un intervalle libre de tout traitement ; pour nouvelle biopsie et rediscussion.",
    },
    // The treatment-naive patients: an absence still needs a document behind it
    // (design principle 3), so the record review itself is the source. One body,
    // rendered per patient — the header carries the patient id.
    noneDocumented: {
      quotes: ["aucun traitement systémique, radiothérapie ni résection chirurgicale antérieurs ne sont consignés"],
      body: "Revue du dossier médicamenteux et des procédures avant la COM : aucun traitement systémique, radiothérapie ni résection chirurgicale antérieurs ne sont consignés pour ce patient avant la ligne actuelle. Dossiers examinés dans les systèmes d'oncologie, de radiothérapie et du bloc opératoire.",
    },
  },

  // Follow-up A precedent cases (L-2894, L-3011). Stage groups, ids, day/week
  // counts are interpolated from logic; source bodies/quotes are verbatim.
  precedent: {
    l2894Situation: (stage, refId) =>
      `stade ${stage} non résécable, chimioradiothérapie terminée, PD-L1 encore en attente à la fin de la radiothérapie (même situation que ${refId})`,
    l3011Situation: (stage) => `stade ${stage} non résécable, chimioradiothérapie terminée`,
    l2894Action: (days) => `Durvalumab débuté une fois le PD-L1 obtenu, ${days} jours après la fin de la radiothérapie.`,
    l2894Outcome: (weeks) => `Toujours sous durvalumab à ${weeks} semaines ; pas de progression au dernier scanner.`,
    l3011Action: "A refusé la consolidation par durvalumab, invoquant des craintes d'effets secondaires.",
    l3011Outcome: (weeks) => `Suivi en surveillance ; maladie stable au scanner de contrôle à ${weeks} semaines.`,
    sources: {
      l2894Action: {
        quotes: ["Durvalumab cycle 1 administré aujourd'hui, 18 jours après la fin de la chimioradiothérapie"],
        body: "Durvalumab cycle 1 administré aujourd'hui, 18 jours après la fin de la chimioradiothérapie. PD-L1 TPS 45% confirmé avant l'initiation.",
      },
      l2894Outcome: {
        quotes: ["Aucun signe de progression au dernier scanner thoraco-abdominal"],
        body: "Le patient poursuit la consolidation par durvalumab, désormais à 7 semaines de l'initiation. Aucun signe de progression au dernier scanner thoraco-abdominal (2026-06-10). Traitement bien toléré, pas de toxicité significative.",
      },
      l3011Action: {
        quotes: ["le patient refuse l'immunothérapie pour le moment en raison de craintes concernant les effets secondaires"],
        body: "Consolidation par durvalumab discutée avec le patient ; le patient refuse l'immunothérapie pour le moment en raison de craintes concernant les effets secondaires. Poursuite de l'imagerie de surveillance.",
      },
      l3011Outcome: {
        quotes: ["maladie stable par rapport à l'examen antérieur"],
        body: "Scanner thoraco-abdominal : maladie stable par rapport à l'examen antérieur daté du 2026-05-10. Pas de nouvelle lésion. Modifications post-thérapeutiques dans le lobe supérieur droit, inchangées.",
      },
    },
  },

  // Follow-up B brain-MRI series (L-3407). Report label, per-scan labels and the
  // short date-axis labels (chart ticks) localise; ISO dates, week counts,
  // measurements and the report bodies/quotes are verbatim.
  mri: {
    reportLabel: "IRM cérébrale avec produit de contraste",
    labelBaseline: "Référence",
    labelInterim: (weeks) => `Intermédiaire (${weeks} semaines)`,
    labelLatest: (weeks) => `Dernière (${weeks} semaines)`,
    scans: {
      baseline: {
        short: "26 mai",
        quotes: ["Somme des diamètres des lésions cibles 31mm", "Trois métastases rehaussées identifiées"],
        body: "ANTÉCÉDENTS CLINIQUES : CBNPC, réarrangé ALK, nouvellement diagnostiqué, IRM cérébrale de bilan d'extension avant l'initiation de l'alectinib.\nCONSTATATIONS : Trois métastases rehaussées identifiées. La lésion frontale droite mesure 14mm. La lésion pariétale gauche mesure 11mm. La lésion cérébelleuse mesure 6mm. Somme des diamètres des lésions cibles 31mm. Pas d'hémorragie ni d'hydrocéphalie.\nCONCLUSION : Trois métastases cérébrales, la plus grande de 14mm, compatibles avec le CBNPC primitif connu.",
      },
      interim: {
        short: "16 juin",
        quotes: ["Somme des diamètres des lésions cibles 20mm, en baisse par rapport aux 31mm de référence (65% de la référence)"],
        body: "ANTÉCÉDENTS CLINIQUES : CBNPC, réarrangé ALK, après 3 semaines d'alectinib pour des métastases cérébrales connues.\nCOMPARAISON : IRM cérébrale 2026-05-26.\nCONSTATATIONS : La lésion frontale droite mesure désormais 9mm (auparavant 14mm). La lésion pariétale gauche mesure désormais 7mm (auparavant 11mm). La lésion cérébelleuse mesure désormais 4mm (auparavant 6mm). Somme des diamètres des lésions cibles 20mm, en baisse par rapport aux 31mm de référence (65% de la référence). Pas de nouvelle lésion intracrânienne.\nCONCLUSION : Diminution de taille dans l'intervalle des trois métastases cérébrales connues ; pas de nouvelle lésion.",
      },
      latest: {
        short: "5 juil.",
        quotes: ["Somme des diamètres des lésions cibles 11mm, en baisse par rapport aux 31mm de référence (35% de la référence)", "La lésion cérébelleuse mesurant auparavant 4mm n'est plus visible"],
        body: "ANTÉCÉDENTS CLINIQUES : CBNPC, réarrangé ALK, après 5 semaines d'alectinib pour des métastases cérébrales connues.\nCOMPARAISON : IRM cérébrale 2026-06-16.\nCONSTATATIONS : La lésion frontale droite mesure désormais 6mm (auparavant 9mm). La lésion pariétale gauche mesure désormais 5mm (auparavant 7mm). La lésion cérébelleuse mesurant auparavant 4mm n'est plus visible. Somme des diamètres des lésions cibles 11mm, en baisse par rapport aux 31mm de référence (35% de la référence). Pas de nouvelle lésion intracrânienne.\nCONCLUSION : Poursuite de la diminution de taille dans l'intervalle des deux métastases cérébrales restantes ; lésion cérébelleuse résolue ; pas de nouvelle lésion.",
      },
    },
  },

  // Inline chart titles for Follow-up B.
  charts: {
    targetLesionBurden: "Charge des lésions cibles",
    visibleBrainLesions: "Lésions cérébrales visibles",
  },

  // Scripted follow-up turns. `prompt` is the doctor's question; `reply` the agent
  // lead-in; `activity` the streamed lines; `noteText` the MOC-notes write-back.
  // Counts, ids, percentages, day/week values and dates are interpolated from logic.
  followUps: {
    a: {
      prompt: "Des cas similaires auparavant ?",
      reply: (count) => `${count} cas similaires ce trimestre :`,
      activity: [
        "Recherche de cas de stade III non résécable dans les dossiers COM pulmonaires antérieurs.",
        "2 patients comparables traités ce trimestre trouvés.",
        "Extraction de leurs décisions de consolidation et de leurs devenirs de suivi.",
      ],
      noteText: (count, id1, days, weeks1, id2, weeks2) =>
        `Précédent (${count} cas) : ${id1} — durvalumab débuté J+${days}, stable à ${weeks1} sem. ${id2} — refusé, stable à ${weeks2} sem de surveillance.`,
    },
    b: {
      prompt: "Réponse jusqu'à présent ?",
      reply: (count, date) => `${count} IRM cérébrales au dossier depuis le début de l'Alectinib le ${date}.`,
      activity: [
        "Localisation de la série d'IRM cérébrales de L-3407 depuis le début de l'Alectinib.",
        "Comparaison des mesures des lésions cibles entre les trois examens.",
        "Calcul de la tendance de la réponse.",
      ],
      noteText: (pctSequence, scanCount, weeks) =>
        `Réponse à l'IRM cérébrale : ${pctSequence} de la charge des lésions cibles sur ${scanCount} examens, ${weeks} semaines de traitement.`,
    },
  },
  // Fallback activity lines while a follow-up with no scripted activity streams.
  genericFollowUpActivity: ["Lecture des dossiers liés.", "Extraction des valeurs pertinentes."],

  // Streamed opening-run activity lines (the store's timed controller). Codes,
  // ids, percentages and counts are interpolated from logic.
  run: {
    template: (templateName) => `Modèle ${templateName} reconnu — réutilisation pour la liste de demain.`,
    agenda: (patients) => `Chargement des ${patients} patients à l'ordre du jour de la COM de demain.`,
    structured: "Lecture des champs structurés : histologie, classification TNM et biomarqueurs.",
    ecog: "Extraction du statut de performance ECOG à partir des notes d'oncologie.",
    stage: "Synthèse du groupe de stade UICC à partir du TNM de chaque patient.",
    priorTreatment: "Assemblage des lignes de traitement antérieures à partir des prescriptions et des notes.",
    treatment: "Extraction du traitement actuel à partir des prescriptions et des notes.",
    conflicts: "Vérification croisée des sources de biomarqueurs à la recherche de conflits.",
    flag3404: (pathologyValue, rereadValue) =>
      `L-3404 signalé — conflit PD-L1 (pathologie ${pathologyValue} vs relecture ${rereadValue}).`,
    flag3402: (chemoCode, immunoCode) =>
      `L-3402 signalé — chimioradiothérapie (code ${chemoCode}) terminée, aucune immunothérapie de consolidation (code ${immunoCode}) documentée.`,
    ready: (ready, total) => `Preuves prêtes pour ${ready} patients sur ${total}.`,
  },

  // Opening turn (ThreadView). "Annexe 55" is the invariant schema name and stays
  // in logic; the surrounding prose segments localise. Patient/complete counts are
  // interpolated from logic. `templateName` is the reusable-template display name.
  templateName: "Préparation COM pulmonaire",
  artifactTitle: "Matrice de preuves COM pulmonaire",
  chipPopulating: "remplissage…",
  chipReady: "prêt",
  opening: {
    usingYour: "Utilisation de votre modèle",
    templateColumnsAre: "— ses colonnes sont les champs du formulaire d'enregistrement",
    registrationFields: (patients, complete) =>
      `en vigueur. ${patients} patients sur la liste de demain. Les données du registre sont complètes pour ${complete} d'entre eux. Deux méritent un examen avant la réunion :`,
  },
  agentSurfaceHint: "Je peux afficher n'importe quelle valeur de cette liste à partir de sa source — sélectionnez une cellule dans la matrice et posez votre question.",

  // Follow-up MOC-notes question (product AskUserQuestion shape) + chips.
  followUpQuestion: (rowId) => `Ajouter ceci aux Notes COM pour ${rowId} ?`,
  addToMocNotes: "Ajouter aux Notes COM",
  skip: "Ignorer",
  followUpAddedConfirm: (rowId) => `Ajouté aux Notes COM pour ${rowId} ✓`,
  followUpSource: "source ↗",
  followUpSourceAria: (label, date) => `Ouvrir la source : ${label}, ${date}`,

  // Attention list container label.
  attentionListLabel: "À examiner avant la réunion",

  // Chart point aria-label (Follow-up B). Value + point label from logic.
  chartPointAria: (title, value, pointLabel) => `${title} : ${value} le ${pointLabel} — ouvrir le rapport source`,

  // Cell metadata explanations surfaced by the spreadsheet cell inspector.
  cellMeta: {
    direct: (columnTitle, rowId) => `${columnTitle} pour ${rowId}.`,
    interpreted: (columnTitle, rowId) => `${columnTitle} pour ${rowId}, extrait des notes en texte libre.`,
  },

  // Cohort rail + patient form chrome. The rail's summary line is composed from
  // strings already in this pack (histology name + UICC stage group from logic),
  // so it costs no new translation.
  form: {
    railLabel: "Patients de la liste",
    filling: "en cours de remplissage",
    complete: "complet",
    // `{histology} · {stage group}` — the middot is punctuation, from logic.
    summary: (histology, stage) => `${histology} · ${stage}`,
    sourceButton: "Sources de cette valeur",
    sourceOne: (label) => `Ouvrir la source : ${label}`,
    sourceListLabel: "Choisir une source",
    noSources: "Aucune source au dossier",
    empty: "—",
  },

  // ArtifactBox.svelte tab & control labels.
  box: {
    resizeHandle: "Glisser pour redimensionner l'artefact",
    closeTab: (tabTitle) => `Fermer ${tabTitle}`,
    sendContext: (count) => `Envoyer le contexte sélectionné (${count})`,
    addContext: "Ajouter un contexte d'artefact",
    send: "Envoyer",
    showChat: "Afficher la conversation",
    expandArtifact: "Agrandir l'artefact",
    closeArtifact: "Fermer l'artefact",
    contextNote: "Note de contexte",
    askAboutOne: "cette cellule",
    askAboutMany: (count) => `ces ${count} cellules`,
    askPlaceholder: (target) => `Poser une question sur ${target}…`,
    addToContext: "Ajouter au contexte",
  },

  // ContextChip.svelte pill labels.
  contextChip: {
    listLabel: "Contexte joint",
    detailLabel: "Détail du contexte",
    remove: "Retirer le contexte",
    oneCell: "1 cellule",
    manyCells: (count) => `${count} cellules`,
  },
};

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
        name: "Paediatric epilepsy",
        category: "National audits",
        fileName: "epilepsy12-audit.xlsx",
        submissionDeadline: "2027-01-12",
        description:
          "Epilepsy12 — National Clinical Audit of Seizures and Epilepsies for children and young people: first-year-of-care KPIs covering specialist review, investigations, mental-health screening and medication safety.",
        columns: [
          "NHS number",
          "Date of birth",
          "Sex assigned at birth",
          "Age at first assessment",
          "Referral date",
          "First paediatrician assessment date",
          "Seen by epilepsy-expert paediatrician",
          "Epilepsy specialist nurse input date",
          "MRI indicated",
          "MRI request date",
          "MRI performed date",
          "Seizure type",
          "ECG date",
          "Mental-health screening date",
          "Mental-health problem identified",
          "Mental-health support provided",
          "Comprehensive care plan date",
          "On sodium valproate",
          "On topiramate",
          "Pregnancy prevention programme in place",
        ],
      },
      {
        id: "nmtr-trauma-lo-audit",
        name: "Paediatric major trauma",
        category: "National audits",
        fileName: "nmtr-trauma-audit.xlsx",
        submissionDeadline: "Submit ≤25 days of discharge",
        description:
          "National Major Trauma Registry (NMTR, formerly TARN) — paediatric major-trauma BPT: per-case registry submission and acute-phase care standards (consultant-led reception, CT head, tranexamic acid, airway, rehabilitation prescription).",
        columns: [
          "NHS number",
          "Date of birth",
          "Sex assigned at birth",
          "Age (years)",
          "Injury Severity Score (ISS)",
          "≥1 AIS 3+ injury",
          "ED arrival date/time",
          "Discharge date",
          "NMTR case submitted",
          "NMTR dataset complete",
          "NMTR submission date",
          "Trauma team activated",
          "Consultant present at reception",
          "Consultant arrival (min from arrival)",
          "GCS at arrival",
          "Head injury (AIS 1+)",
          "CT head (min from arrival)",
          "TXA indicated",
          "TXA given",
          "TXA given (min from injury)",
          "Airway/intubation considered",
          "Airway considered (min from arrival)",
          "Rehabilitation needs assessed",
          "Rehabilitation prescription issued",
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
    { key: "patient", header: "NHS number", width: 12 },                                 // B-cohort
    { key: "dob", header: "Date of birth", width: 14 },
    { key: "sex", header: "Sex assigned at birth", width: 18 },
    { key: "ageAtAssessment", header: "Age at first assessment", width: 20 },
    { key: "_s1", header: "", width: 4 },
    // B1 — epilepsy-expert paediatrician within 2 weeks of referral
    { key: "referralDate", header: "Referral date", width: 14 },
    { key: "firstAssessmentDate", header: "First paediatrician assessment date", width: 30 },
    { key: "expertisePaediatrician", header: "Seen by epilepsy-expert paediatrician", width: 32 },
    { key: "_s2", header: "", width: 4 },
    // B2 — ESN input within first year
    { key: "esnInputDate", header: "Epilepsy specialist nurse input date", width: 30 },
    { key: "_s3", header: "", width: 4 },
    // B3 — MRI within 6 weeks where indicated
    { key: "mriIndicated", header: "MRI indicated", width: 14 },
    { key: "mriRequestDate", header: "MRI request date", width: 16 },
    { key: "mriPerformedDate", header: "MRI performed date", width: 18 },
    { key: "_s4", header: "", width: 4 },
    // B4 — ECG in convulsive seizures
    { key: "seizureType", header: "Seizure type", width: 18 },
    { key: "ecgDate", header: "ECG date", width: 14 },
    { key: "_s5", header: "", width: 4 },
    // B5 — mental-health screening + support
    { key: "mhScreeningDate", header: "Mental-health screening date", width: 26 },
    { key: "mhProblemIdentified", header: "Mental-health problem identified", width: 30 },
    { key: "mhSupportProvided", header: "Mental-health support provided", width: 28 },
    { key: "_s6", header: "", width: 4 },
    // B6 — comprehensive care plan by 12 months
    { key: "carePlanDate", header: "Comprehensive care plan date", width: 26 },
    { key: "_s7", header: "", width: 4 },
    // B7 — valproate/topiramate safety (PPP, females ≥12)
    { key: "onValproate", header: "On sodium valproate", width: 18 },
    { key: "onTopiramate", header: "On topiramate", width: 16 },
    { key: "pppInPlace", header: "Pregnancy prevention programme in place", width: 34 },
  ],
  trauma: [
    // Patient / cohort (paediatric <16 major trauma at the MTC, ≥1 AIS3+ injury)
    { key: "patient", header: "NHS number", width: 12 },                                 // C-cohort
    { key: "dob", header: "Date of birth", width: 14 },
    { key: "sex", header: "Sex assigned at birth", width: 18 },
    { key: "ageYears", header: "Age (years)", width: 12 },
    { key: "iss", header: "Injury Severity Score (ISS)", width: 22 },
    { key: "ais3plus", header: "≥1 AIS 3+ injury", width: 16 },
    { key: "_s1", header: "", width: 4 },
    // C1 — registry submission within 25 days of discharge (the BPT trigger)
    { key: "edArrivalDateTime", header: "ED arrival date/time", width: 22 },
    { key: "dischargeDate", header: "Discharge date", width: 16 },
    { key: "nmtrSubmitted", header: "NMTR case submitted", width: 20 },
    { key: "datasetComplete", header: "NMTR dataset complete", width: 22 },
    { key: "submissionDate", header: "NMTR submission date", width: 20 },
    { key: "_s2", header: "", width: 4 },
    // C2 — consultant-led trauma-team reception ≤5 min (Level 2, ISS ≥16)
    { key: "traumaTeamActivated", header: "Trauma team activated", width: 22 },
    { key: "consultantPresent", header: "Consultant present at reception", width: 30 },
    { key: "consultantArrivalMin", header: "Consultant arrival (min from arrival)", width: 34 },
    { key: "_s3", header: "", width: 4 },
    // C3 — CT head ≤60 min (GCS ≤13 head injury, Level 2)
    { key: "gcs", header: "GCS at arrival", width: 16 },
    { key: "headInjury", header: "Head injury (AIS 1+)", width: 20 },
    { key: "ctHeadMin", header: "CT head (min from arrival)", width: 26 },
    { key: "_s4", header: "", width: 4 },
    // C4 — tranexamic acid ≤1 h (Level 2)
    { key: "txaIndicated", header: "TXA indicated", width: 16 },
    { key: "txaGiven", header: "TXA given", width: 14 },
    { key: "txaMin", header: "TXA given (min from injury)", width: 26 },
    { key: "_s5", header: "", width: 4 },
    // C5 — airway considered ≤30 min (GCS <9, Level 1)
    { key: "intubationConsidered", header: "Airway/intubation considered", width: 28 },
    { key: "airwayConsideredMin", header: "Airway considered (min from arrival)", width: 34 },
    { key: "_s6", header: "", width: 4 },
    // C6 — rehabilitation prescription (ISS ≥9, Level 1)
    { key: "rehabNeedsAssessed", header: "Rehabilitation needs assessed", width: 28 },
    { key: "rehabPrescriptionIssued", header: "Rehabilitation prescription issued", width: 32 },
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
      admission: { v: "DKA (new diagnosis)", e: ["acidocétose diabétique (ACD) au moment du nouveau diagnostic"] },
    },
    notes: [
      { role: "Diabétologie pédiatrique — Dr Naomi Clarke", date: "2026-02-19", type: "diabetes_clinic", text: "Première revue en consultation après un nouveau diagnostic. Prise en charge par un schéma basal-bolus par injections quotidiennes multiples (MDI) et utilisant un capteur de glucose en continu. Une modification du mode de vie et de l'alimentation a été recommandée pour aider à réduire la glycémie. Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé." },
      { role: "Psychologie clinique — Dr Owen Pratt", date: "2026-02-19", type: "psychology", text: "Dépistage psychologique réalisé lors de la première revue. Aucun soutien psychologique supplémentaire n'était nécessaire au-delà des soins de routine." },
      { role: "Diabétologie pédiatrique — revue annuelle", date: "2026-02-19", type: "annual_review", text: "Revue réalisée. L'enfant ne fume ni ne vapote." },
      { role: "Pédiatrie — admission", date: "2026-01-22", type: "admission", text: "Admis lors de la présentation en acidocétose diabétique (ACD) au moment du nouveau diagnostic. Traité selon le protocole d'ACD par insuline intraveineuse et apports liquidiens, avec une bonne récupération." },
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
      admission: { v: "DKA", e: ["acidocétose diabétique (ACD) faisant suite à une maladie intercurrente"] },
    },
    notes: [
      { role: "Diabétologie pédiatrique — Dr Naomi Clarke", date: "2025-12-16", type: "diabetes_clinic", text: "Revue en consultation après une admission récente. Prise en charge par un schéma basal-bolus par injections quotidiennes multiples (MDI) et n'utilisant pas actuellement de capteur de glucose en continu. Une modification du mode de vie et de l'alimentation a été recommandée pour aider à réduire la glycémie. Un rendez-vous supplémentaire avec le diététicien pédiatrique a été proposé." },
      { role: "Psychologie clinique — Dr Owen Pratt", date: "2025-12-16", type: "psychology", text: "Dépistage psychologique annuel réalisé. Un soutien psychologique supplémentaire en dehors des soins de routine a été recommandé pour soutenir l'autogestion." },
      { role: "Diabétologie pédiatrique — revue annuelle", date: "2025-12-16", type: "annual_review", text: "Revue annuelle réalisée. L'enfant ne fume ni ne vapote." },
      { role: "Pédiatrie — admission", date: "2025-08-07", type: "admission", text: "Admission en urgence pour acidocétose diabétique (ACD) faisant suite à une maladie intercurrente. Prise en charge selon le protocole d'ACD et sortie avec un rappel des règles en cas de maladie." },
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
      expertise: { v: "Yes", e: ["Seen by the consultant paediatrician with expertise in epilepsy"] },
      seizureType: { v: "Convulsive", e: ["generalised tonic-clonic (convulsive) seizures"] },
      mhProblem: { v: "No", e: ["no mental-health problem was identified"] },
      mhSupport: { v: "No", e: ["no mental-health problem was identified"] },
    },
    notes: [
      { role: "Paediatric Neurology — Dr Helen Marsh", date: "2025-01-20", type: "epilepsy_clinic", text: "Seen by the consultant paediatrician with expertise in epilepsy at the first assessment after referral. The history is consistent with generalised tonic-clonic (convulsive) seizures. An MRI brain and an ECG were arranged." },
      { role: "Epilepsy MH screening", date: "2025-04-01", type: "mh_screening", text: "Mental-health screening completed using the agreed questionnaire; no mental-health problem was identified at this point in the first year of care." },
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
      expertise: { v: "Yes", e: ["Reviewed by the epilepsy-expert consultant paediatrician"] },
      seizureType: { v: "Convulsive", e: ["focal seizures with evolution to bilateral convulsive activity"] },
      mhProblem: { v: "Yes", e: ["screening identified low mood and anxiety"] },
      mhSupport: { v: "Yes", e: ["referred to the mental-health team and support was provided"] },
    },
    notes: [
      { role: "Paediatric Neurology — Dr Helen Marsh", date: "2025-02-12", type: "epilepsy_clinic", text: "Reviewed by the epilepsy-expert consultant paediatrician within two weeks of referral. Events are focal seizures with evolution to bilateral convulsive activity. Started on sodium valproate; as a female of child-bearing potential a pregnancy prevention programme was put in place and documented." },
      { role: "Epilepsy MH screening", date: "2025-05-02", type: "mh_screening", text: "Mental-health screening completed; screening identified low mood and anxiety. She was referred to the mental-health team and support was provided within the first year of care." },
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
      expertise: { v: "Yes", e: ["Seen by the consultant paediatrician with expertise in epilepsy"] },
      seizureType: { v: "Non-convulsive", e: ["typical absence (non-convulsive) seizures"] },
      mhProblem: { v: "No", e: ["no mental-health problem was identified"] },
      mhSupport: { v: "No", e: ["no mental-health problem was identified"] },
    },
    notes: [
      { role: "Paediatric Neurology — Dr Helen Marsh", date: "2025-03-10", type: "epilepsy_clinic", text: "Seen by the consultant paediatrician with expertise in epilepsy. The semiology is of typical absence (non-convulsive) seizures, so no ECG was indicated. An MRI brain was requested. Commenced on topiramate; as a female of child-bearing potential a pregnancy prevention programme was put in place." },
      { role: "Epilepsy MH screening", date: "2025-06-05", type: "mh_screening", text: "Mental-health screening completed using the agreed questionnaire; no mental-health problem was identified." },
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
      expertise: { v: "Yes", e: ["assessed by the epilepsy-expert paediatrician"] },
      seizureType: { v: "Convulsive", e: ["generalised tonic-clonic (convulsive) seizures"] },
      mhProblem: { v: "No", e: ["no mental-health problem was identified"] },
      mhSupport: { v: "No", e: ["no mental-health problem was identified"] },
    },
    notes: [
      { role: "Paediatric Neurology — Dr Helen Marsh", date: "2025-02-20", type: "epilepsy_clinic", text: "Capacity pressures delayed the first clinic; assessed by the epilepsy-expert paediatrician more than two weeks after referral. The events are generalised tonic-clonic (convulsive) seizures. MRI was not indicated for this typical presentation; an ECG was arranged." },
      { role: "Epilepsy MH screening", date: "2025-05-10", type: "mh_screening", text: "Mental-health screening completed with the family; no mental-health problem was identified." },
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
      expertise: { v: "Yes", e: ["Seen by the consultant paediatrician with expertise in epilepsy"] },
      seizureType: { v: "Convulsive", e: ["generalised tonic-clonic (convulsive) seizures"] },
      mhProblem: { v: "Yes", e: ["screening identified significant low mood"] },
      mhSupport: { v: "No", e: ["support has not yet been arranged"] },
    },
    notes: [
      { role: "Paediatric Neurology — Dr Helen Marsh", date: "2025-04-09", type: "epilepsy_clinic", text: "Seen by the consultant paediatrician with expertise in epilepsy. Events are generalised tonic-clonic (convulsive) seizures. Started on sodium valproate. The pregnancy prevention programme paperwork was discussed but has not been completed and is outstanding." },
      { role: "Epilepsy MH screening", date: "2025-07-02", type: "mh_screening", text: "Mental-health screening completed; screening identified significant low mood. A referral was recommended but support has not yet been arranged." },
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
      expertise: { v: "Yes", e: ["Seen by the epilepsy-expert consultant paediatrician"] },
      seizureType: { v: "Non-convulsive", e: ["typical absence (non-convulsive) seizures"] },
      mhProblem: { v: "No", e: ["no mental-health problem was identified"] },
      mhSupport: { v: "No", e: ["no mental-health problem was identified"] },
    },
    notes: [
      { role: "Paediatric Neurology — Dr Helen Marsh", date: "2025-05-12", type: "epilepsy_clinic", text: "Seen by the epilepsy-expert consultant paediatrician. The events are typical absence (non-convulsive) seizures, so neither an MRI nor an ECG was indicated." },
      { role: "Epilepsy MH screening", date: "2025-08-01", type: "mh_screening", text: "Mental-health screening completed using the agreed questionnaire; no mental-health problem was identified." },
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
      expertise: { v: "Yes", e: ["Seen by the consultant paediatrician with expertise in epilepsy"] },
      seizureType: { v: "Convulsive", e: ["generalised tonic-clonic (convulsive) seizures"] },
      mhProblem: { v: "No", e: ["no mental-health problem was identified"] },
      mhSupport: { v: "No", e: ["no mental-health problem was identified"] },
    },
    notes: [
      { role: "Paediatric Neurology — Dr Helen Marsh", date: "2025-06-12", type: "epilepsy_clinic", text: "Seen by the consultant paediatrician with expertise in epilepsy. The events are generalised tonic-clonic (convulsive) seizures. An MRI brain was requested and an ECG was arranged." },
      { role: "Epilepsy MH screening", date: "2025-09-01", type: "mh_screening", text: "Mental-health screening completed; no mental-health problem was identified." },
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
      expertise: { v: "No", e: ["seen by a general paediatrician without specific epilepsy expertise"] },
      seizureType: { v: "Convulsive", e: ["generalised tonic-clonic (convulsive) seizures"] },
      mhProblem: { v: "No", e: ["no mental-health problem was identified"] },
      mhSupport: { v: "No", e: ["no mental-health problem was identified"] },
    },
    notes: [
      { role: "Paediatrics — Dr Sam Reid", date: "2025-07-10", type: "epilepsy_clinic", text: "First assessment was seen by a general paediatrician without specific epilepsy expertise; onward review by the epilepsy lead is pending. The events are generalised tonic-clonic (convulsive) seizures. An ECG was arranged; MRI was not indicated." },
      { role: "Epilepsy MH screening", date: "2025-10-01", type: "mh_screening", text: "Mental-health screening completed using the agreed questionnaire; no mental-health problem was identified." },
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
      expertise: { v: "Yes", e: ["Seen by the consultant paediatrician with expertise in epilepsy"] },
      seizureType: { v: "Non-convulsive", e: ["typical absence (non-convulsive) seizures"] },
      mhProblem: { v: "No", e: ["mental-health screening has not yet been carried out"] },
      mhSupport: { v: "No", e: ["mental-health screening has not yet been carried out"] },
    },
    notes: [
      { role: "Paediatric Neurology — Dr Helen Marsh", date: "2025-08-13", type: "epilepsy_clinic", text: "Seen by the consultant paediatrician with expertise in epilepsy. The events are typical absence (non-convulsive) seizures, so no ECG was indicated. An MRI brain was requested." },
      { role: "Epilepsy MH screening", date: "2025-09-01", type: "mh_screening", text: "Documentation review notes that mental-health screening has not yet been carried out for this child within the first year of care." },
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
      expertise: { v: "Yes", e: ["Seen by the consultant paediatrician with expertise in epilepsy"] },
      seizureType: { v: "Convulsive", e: ["generalised tonic-clonic (convulsive) seizures"] },
      mhProblem: { v: "No", e: ["no mental-health problem was identified"] },
      mhSupport: { v: "No", e: ["no mental-health problem was identified"] },
    },
    notes: [
      { role: "Paediatric Neurology — Dr Helen Marsh", date: "2025-09-19", type: "epilepsy_clinic", text: "Seen by the consultant paediatrician with expertise in epilepsy. The events are generalised tonic-clonic (convulsive) seizures. An ECG was arranged; MRI was not indicated for this presentation." },
      { role: "Epilepsy MH screening", date: "2025-11-20", type: "mh_screening", text: "Mental-health screening completed using the agreed questionnaire; no mental-health problem was identified." },
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
      intubationConsidered: { v: "Yes", e: ["airway was secured by rapid sequence intubation within 18 minutes of arrival"] },
      rehabPrescription: { v: "Yes", e: ["a rehabilitation prescription was completed and shared with the family, GP and community team"] },
    },
    notes: [
      { role: "Trauma team — Dr Olusola Bello", date: "2026-01-08", type: "resus", text: "Consultant-led trauma team received this child after a high-speed road traffic collision. GCS 6 on arrival; the airway was secured by rapid sequence intubation within 18 minutes of arrival. Tranexamic acid given for major haemorrhage." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-01-24", type: "rehab", text: "Rehabilitation needs were assessed by the trauma rehabilitation coordinator; a rehabilitation prescription was completed and shared with the family, GP and community team, with core components recorded on the NMTR." },
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
      intubationConsidered: { v: "No", e: ["the airway was patent and self-maintained throughout, so intubation was not required"] },
      rehabPrescription: { v: "Yes", e: ["a rehabilitation prescription was issued and copied to the GP and ongoing-care provider"] },
    },
    notes: [
      { role: "Trauma team — Dr Olusola Bello", date: "2026-01-15", type: "resus", text: "Fall from height. GCS 10 on arrival; the airway was patent and self-maintained throughout, so intubation was not required. No indication for tranexamic acid. Consultant attended the bay nine minutes after arrival owing to a concurrent resuscitation." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-01-31", type: "rehab", text: "Rehabilitation needs assessed; a rehabilitation prescription was issued and copied to the GP and ongoing-care provider, with core components on the NMTR." },
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
      intubationConsidered: { v: "Yes", e: ["the need for a definitive airway was documented and intubation was performed at 25 minutes"] },
      rehabPrescription: { v: "Yes", e: ["a rehabilitation prescription was completed with the family and shared with the GP and community team"] },
    },
    notes: [
      { role: "Trauma team — Dr Olusola Bello", date: "2026-01-20", type: "resus", text: "Crush injury. GCS 7 on arrival; the need for a definitive airway was documented and intubation was performed at 25 minutes. Tranexamic acid given within the hour. Consultant present in the bay within three minutes." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-02-03", type: "rehab", text: "Rehabilitation needs assessed; a rehabilitation prescription was completed with the family and shared with the GP and community team." },
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
      intubationConsidered: { v: "No", e: ["the airway was self-maintained with a GCS of 14 and intubation was not indicated"] },
      rehabPrescription: { v: "Yes", e: ["a rehabilitation prescription was issued and shared with the family, GP and ongoing-care provider"] },
    },
    notes: [
      { role: "Trauma team — Dr Olusola Bello", date: "2026-01-25", type: "resus", text: "Sporting injury with a splenic laceration. GCS 14 on arrival; the airway was self-maintained with a GCS of 14 and intubation was not indicated. No major haemorrhage requiring tranexamic acid." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-02-07", type: "rehab", text: "Rehabilitation needs assessed; a rehabilitation prescription was issued and shared with the family, GP and ongoing-care provider." },
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
      intubationConsidered: { v: "No", e: ["alert with a GCS of 15 and a self-maintained airway, so no airway intervention was considered"] },
      rehabPrescription: { v: "No", e: ["a formal rehabilitation prescription has not yet been completed and remains outstanding"] },
    },
    notes: [
      { role: "Trauma team — Dr Olusola Bello", date: "2026-02-01", type: "resus", text: "Lower-limb long-bone fracture from a fall. The toddler was alert with a GCS of 15 and a self-maintained airway, so no airway intervention was considered. No head injury." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-02-05", type: "rehab", text: "Rehabilitation needs were assessed during admission; however, a formal rehabilitation prescription has not yet been completed and remains outstanding at discharge." },
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
      intubationConsidered: { v: "Yes", e: ["the airway was secured by intubation at 22 minutes from arrival"] },
      rehabPrescription: { v: "Yes", e: ["a rehabilitation prescription was completed and issued to the family, GP and ongoing-care team"] },
    },
    notes: [
      { role: "Trauma team — Dr Olusola Bello", date: "2026-02-04", type: "resus", text: "Penetrating abdominal injury with major haemorrhage. GCS 5 on arrival; the airway was secured by intubation at 22 minutes from arrival. Consultant present within two minutes. Tranexamic acid was given but delayed to 75 minutes after injury owing to a difficult interhospital transfer." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-02-23", type: "rehab", text: "Rehabilitation needs assessed by the trauma rehabilitation coordinator; a rehabilitation prescription was completed and issued to the family, GP and ongoing-care team, with core components on the NMTR." },
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
      intubationConsidered: { v: "Yes", e: ["a definitive airway was considered and intubation carried out at 29 minutes after arrival"] },
      rehabPrescription: { v: "Yes", e: ["a rehabilitation prescription was completed and shared with the GP and community rehabilitation service"] },
    },
    notes: [
      { role: "Trauma team — Dr Olusola Bello", date: "2026-02-10", type: "resus", text: "Pedestrian versus vehicle. GCS 8 on arrival; a definitive airway was considered and intubation carried out at 29 minutes after arrival. Tranexamic acid given within the hour. Consultant present at five minutes." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-02-26", type: "rehab", text: "Rehabilitation needs assessed; a rehabilitation prescription was completed and shared with the GP and community rehabilitation service." },
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
      intubationConsidered: { v: "No", e: ["fully alert with a GCS of 15, so no airway intervention was considered"] },
      rehabPrescription: { v: "No", e: ["no rehabilitation prescription was required for this minor-injury admission" ] },
    },
    notes: [
      { role: "Trauma team — Dr Olusola Bello", date: "2026-02-13", type: "resus", text: "Isolated closed forearm fracture after a playground fall. The child was fully alert with a GCS of 15, so no airway intervention was considered. No head injury and no major haemorrhage." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-02-17", type: "rehab", text: "Rehabilitation needs reviewed; no rehabilitation prescription was required for this minor-injury admission below the major-trauma rehabilitation threshold." },
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
      intubationConsidered: { v: "No", e: ["the airway was maintained with a GCS of 9 and intubation was not required at this stage"] },
      rehabPrescription: { v: "Yes", e: ["a rehabilitation prescription was issued and shared with the family, GP and ongoing-care provider"] },
    },
    notes: [
      { role: "Trauma team — Dr Olusola Bello", date: "2026-02-16", type: "resus", text: "Cyclist versus vehicle with a chest injury. GCS 9 on arrival; the airway was maintained with a GCS of 9 and intubation was not required at this stage. No indication for tranexamic acid." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-03-04", type: "rehab", text: "Rehabilitation needs assessed; a rehabilitation prescription was issued and shared with the family, GP and ongoing-care provider, with core components on the NMTR." },
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
      intubationConsidered: { v: "No", e: ["maintaining their own airway with a GCS of 12 and intubation was not indicated"] },
      rehabPrescription: { v: "Yes", e: ["a rehabilitation prescription was completed and shared with the family, GP and ongoing-care provider"] },
    },
    notes: [
      { role: "Trauma team — Dr Olusola Bello", date: "2026-02-19", type: "resus", text: "Fall down stairs with a minor head injury and a liver laceration. The child was maintaining their own airway with a GCS of 12 and intubation was not indicated. No major haemorrhage." },
      { role: "Rehabilitation — Dr Priya Nair", date: "2026-03-01", type: "rehab", text: "Rehabilitation needs assessed; a rehabilitation prescription was completed and shared with the family, GP and ongoing-care provider." },
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
  admissionDka: { code: 1, label: "une admission aiguë pour acidocétose diabétique (ACD)" },
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
    Convulsive: { code: "convulsive", label: "convulsive (generalised tonic-clonic / focal to bilateral)" },
    "Non-convulsive": { code: "non-convulsive", label: "non-convulsive (absence / focal aware)" },
    Absence: { code: "absence", label: "absence (non-convulsive)" },
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
const templateDetail = {
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
  npdaAdmissionReasonDka: (code, label, dkaCode) => `D'après la note d'admission pour ${code} — ${label}, codé ${dkaCode} selon les valeurs de motif d'admission NPDA (1 = ACD aiguë).`,
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
  npdaAdmissionReasonOther: (code) => `Le motif en texte libre est obligatoire uniquement lorsque 'Autres causes' est sélectionné ; l'admission de ${code} a été codée comme ACD, donc il est laissé vide.`,
  npdaDkaTherapiesNone: (code) => `Aucune admission pour ACD n'a été enregistrée pour ${code}, donc il n'y a aucun traitement d'ACD à enregistrer.`,
  npdaDkaTherapies: (code, label, dkaCode) => `D'après le dossier d'admission hospitalière pour ${code} — traitements d'ACD reçus : ${label}, codé ${dkaCode} selon les valeurs de traitement de DKA NPDA.`,
  npdaInitialPhNone: (code) => `Aucun gaz du sang à l'admission n'a été enregistré pour ${code}, donc il n'y a aucun pH initial.`,
  npdaInitialPh: (code) => `D'après le dossier d'admission hospitalière pour ${code} — pH initial (premier enregistré) à l'admission (format NPDA 0.00).`,
  npdaInitialBicarbNone: (code) => `Aucun gaz du sang à l'admission n'a été enregistré pour ${code}, donc il n'y a aucun bicarbonate standard initial.`,
  npdaInitialBicarb: (code) => `D'après le dossier d'admission hospitalière pour ${code} — bicarbonate standard initial à l'admission en mmol/l (format NPDA 00.0).`,

  // --- Epilepsy12 (Dataset 4) ----------------------------------------------
  epiPatient: (code) => `From the EHR demographics for ${code} — the patient's 10-digit NHS number.`,
  epiDob: (code) => `From the EHR demographics for ${code} — date of birth, formatted DD/MM/YYYY.`,
  epiSex: (code, sex, sexCode) => `From the EHR demographics for ${code} — sex assigned at birth recorded as ${sex}, coded ${sexCode} (1 = Male, 2 = Female).`,
  epiAgeAtAssessment: (code, age) => `From the epilepsy service record for ${code} — age ${age} years at the first paediatric assessment; the cohort is children and young people aged 18 or under.`,
  epiReferralDate: (code) => `From the epilepsy service record for ${code} — date the referral was received, formatted DD/MM/YYYY.`,
  epiFirstAssessmentDate: (code, days) => `From the epilepsy service record for ${code} — first paediatric assessment ${days} days after referral (KPI 1 target: within 14 days), formatted DD/MM/YYYY.`,
  epiExpertise: (code, seen, mhCode) => `From the epilepsy clinic letter for ${code} — the first assessment ${seen ? "was" : "was not"} carried out by a paediatrician with expertise in epilepsy (KPI 1), recorded as ${mhCode}.`,
  epiEsnInputDate: (code) => `From the epilepsy service record for ${code} — date of the first epilepsy specialist nurse (ESN) input (KPI 2 target: within the first year of care), formatted DD/MM/YYYY.`,
  epiEsnInputNotDone: (code) => `No epilepsy specialist nurse (ESN) input is recorded for ${code} in the first year of care, so this KPI is incomplete and the date is left blank.`,
  epiMriIndicated: (code, indicated) => `From the epilepsy service record for ${code} — an MRI brain ${indicated ? "was" : "was not"} clinically indicated; the MRI-within-6-weeks KPI applies only where one is indicated.`,
  epiMriRequestNA: (code) => `An MRI brain was not indicated for ${code}, so no request was raised and the date is left blank.`,
  epiMriRequestDate: (code) => `From the epilepsy service record for ${code} — date the MRI brain was requested, formatted DD/MM/YYYY.`,
  epiMriPerformedNA: (code) => `An MRI brain was not indicated for ${code}, so none was performed and the date is left blank.`,
  epiMriPerformedNotDone: (code) => `An MRI brain was requested for ${code} but has not yet been performed, so this KPI is outstanding and the date is left blank.`,
  epiMriPerformedDate: (code, days) => `From the radiology record for ${code} — MRI brain performed ${days} days after request (KPI 5 target: within 42 days), formatted DD/MM/YYYY.`,
  epiSeizureType: (code, label, stCode) => `From the epilepsy clinic letter for ${code} — the seizures are ${label}, recorded as ${stCode}; the ECG KPI applies to convulsive seizures.`,
  epiEcgNA: (code) => `${code} does not have convulsive seizures, so an ECG is not part of the required workup and the date is left blank.`,
  epiEcgNotDone: (code) => `${code} has convulsive seizures and so should have an ECG within the first year, but none is recorded, so this KPI is incomplete and the date is left blank.`,
  epiEcgDate: (code) => `From the cardiology record for ${code} — date the ECG was performed (KPI 4, convulsive seizures), formatted DD/MM/YYYY.`,
  epiMhScreeningDate: (code) => `From the epilepsy service record for ${code} — date mental-health screening was completed (KPI 6, within the first year of care), formatted DD/MM/YYYY.`,
  epiMhScreeningNotDone: (code) => `No mental-health screening is recorded for ${code} in the first year of care, so this KPI is incomplete and the date is left blank.`,
  epiMhProblem: (code, identified, mhCode) => `From the mental-health screening note for ${code} — a mental-health problem ${identified ? "was" : "was not"} identified at screening (KPI 6), recorded as ${mhCode}.`,
  epiMhSupportProvided: (code, provided, mhCode) => `From the mental-health screening note for ${code} — mental-health support ${provided ? "was" : "was not"} provided after a problem was identified (KPI 7), recorded as ${mhCode}.`,
  epiMhSupportNA: (code) => `No mental-health problem was identified for ${code}, so the support-provided KPI (KPI 7) does not apply and the cell is left blank.`,
  epiCarePlanDate: (code) => `From the epilepsy service record for ${code} — date the comprehensive care plan was agreed (KPI 9 target: by 12 months), formatted DD/MM/YYYY.`,
  epiCarePlanNotDone: (code) => `No comprehensive care plan is recorded for ${code} by 12 months, so this KPI is incomplete and the date is left blank.`,
  epiOnValproate: (code, on) => `From the prescribing record for ${code} — the patient is ${on ? "currently prescribed" : "not prescribed"} sodium valproate.`,
  epiOnTopiramate: (code, on) => `From the prescribing record for ${code} — the patient is ${on ? "currently prescribed" : "not prescribed"} topiramate.`,
  epiPppNA: (code) => `The pregnancy prevention programme (KPI 8) applies only to females aged 12 or over taking valproate or topiramate; ${code} does not meet those criteria, so it is not applicable and the cell is left blank.`,
  epiPppInPlace: (code, inPlace) => `From the epilepsy service record for ${code} — a pregnancy prevention programme (or risk-acknowledgement form) ${inPlace ? "is in place" : "is NOT in place"} for this female of child-bearing potential on valproate/topiramate (KPI 8, safety-critical).`,

  // --- Major trauma (Dataset 5) --------------------------------------------
  traPatient: (code) => `From the EHR demographics for ${code} — the patient's 10-digit NHS number.`,
  traDob: (code) => `From the EHR demographics for ${code} — date of birth, formatted DD/MM/YYYY.`,
  traSex: (code, sex, sexCode) => `From the EHR demographics for ${code} — sex assigned at birth recorded as ${sex}, coded ${sexCode} (1 = Male, 2 = Female).`,
  traAgeYears: (code, age) => `From the trauma registry record for ${code} — age ${age} years; the paediatric major-trauma cohort is children under 16.`,
  traIss: (code, iss, level) => `From the trauma registry record for ${code} — Injury Severity Score of ${iss}; the BPT pays a two-level top-up, Level 1 at ISS ≥9 and Level 2 at ISS ≥16 (${level}).`,
  traAis3plus: (code, yes) => `From the trauma registry record for ${code} — the patient ${yes ? "has" : "does not have"} at least one AIS 3+ injury, the NMTR eligibility criterion.`,
  traEdArrival: (code) => `From the ED record for ${code} — date and time of arrival in the emergency department, used as the clock-start for the acute-phase timings.`,
  traDischargeDate: (code) => `From the trauma registry record for ${code} — date of discharge, formatted DD/MM/YYYY; the BPT submission window runs from this date.`,
  traNmtrSubmitted: (code, yes) => `From the trauma registry record for ${code} — the case ${yes ? "has" : "has not"} been submitted to the National Major Trauma Registry (C1).`,
  traDatasetComplete: (code, yes) => `From the trauma registry record for ${code} — the NMTR dataset is ${yes ? "complete" : "incomplete"} for this case (C1).`,
  traSubmissionDate: (code, days) => `From the trauma registry record for ${code} — submitted ${days} days after discharge (BPT trigger target: within 25 days), formatted DD/MM/YYYY.`,
  traTeamActivated: (code, yes) => `From the ED record for ${code} — a trauma team ${yes ? "was" : "was not"} activated for this reception (C2, Level 2).`,
  traConsultantPresent: (code, present) => `From the ED record for ${code} — a consultant ${present ? "was" : "was not"} present at the trauma-team reception (C2, Level 2).`,
  traConsultantArrival: (code, min) => `From the ED record for ${code} — the consultant arrived ${min} minutes after arrival (C2 target: consultant present within 5 minutes, Level 2 / ISS ≥16).`,
  traConsultantArrivalNA: (code) => `The consultant-led reception standard (C2) is a Level 2 criterion applying to ISS ≥16; ${code} is below that threshold, so it is not applicable and the cell is left blank.`,
  traGcs: (code, gcs) => `From the ED record for ${code} — Glasgow Coma Scale of ${gcs} at arrival; the CT-head and airway criteria key off this value.`,
  traHeadInjury: (code, yes) => `From the trauma registry record for ${code} — there ${yes ? "is" : "is no"} head injury (AIS 1+); the CT-head-within-60-minutes criterion applies only to eligible head injuries.`,
  traCtHead: (code, min) => `From the radiology record for ${code} — CT head performed ${min} minutes after arrival (C3 target: within 60 minutes, Level 2), formatted in minutes.`,
  traCtHeadNAnoHead: (code) => `${code} has no head injury, so a CT head is not part of the required workup and the cell is left blank.`,
  traCtHeadNAnotEligible: (code) => `The CT-head-within-60-minutes standard (C3) applies to Level 2 head injuries with GCS ≤13; ${code} does not meet those criteria, so it is not applicable and the cell is left blank.`,
  traTxaIndicated: (code, yes) => `From the trauma registry record for ${code} — tranexamic acid ${yes ? "was" : "was not"} indicated for major haemorrhage; the TXA-within-1-hour criterion applies only where indicated.`,
  traTxaGiven: (code, given) => `From the medication record for ${code} — tranexamic acid ${given ? "was" : "was not"} given (C4, Level 2).`,
  traTxaMin: (code, min) => `From the medication record for ${code} — tranexamic acid given ${min} minutes after injury (C4 target: within 60 minutes, Level 2), formatted in minutes.`,
  traTxaNAnotIndicated: (code) => `Tranexamic acid was not indicated for ${code}, so none was given and the cell is left blank.`,
  traIntubationConsidered: (code, considered, val) => `From the resuscitation note for ${code} — airway management/intubation ${considered ? "was" : "was not"} considered as part of the primary survey (C5, eligible at GCS <9), recorded as ${val}.`,
  traAirwayMin: (code, min) => `From the resuscitation note for ${code} — airway/intubation considered ${min} minutes after arrival (C5 target: within 30 minutes for GCS <9, Level 1), formatted in minutes.`,
  traAirwayNA: (code) => `The airway-considered-within-30-minutes standard (C5) applies to cases with GCS <9; ${code} does not meet that threshold, so it is not applicable and the cell is left blank.`,
  traRehabNeedsAssessed: (code, yes) => `From the trauma registry record for ${code} — rehabilitation needs ${yes ? "were" : "were not"} assessed during the admission (C6, ISS ≥9).`,
  traRehabPrescription: (code, issued, val) => `From the rehabilitation/discharge note for ${code} — a rehabilitation prescription ${issued ? "was" : "was NOT"} issued with core components on the NMTR and shared with the patient, GP and ongoing-care provider (C6, ISS ≥9), recorded as ${val}.`,
  traRehabNA: (code) => `The rehabilitation-prescription standard (C6) applies to the cohort with ISS ≥9; ${code} is below that threshold, so it is not applicable and the cell is left blank.`,
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
    dieteticAdmissions: { headline: "Vérification de l'intervention diététique et des admissions…", detail: "Lecture de la note de consultation de diabétologie pour tout rendez-vous supplémentaire avec un diététicien proposé, puis extraction des dates de comptage des glucides et de rendez-vous avec le diététicien et du dossier d'admission pour toute admission liée au diabète telle qu'une ACD." },
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
  diabetesWorklist: {
    creating: { headline: "Création de la liste de remboursement", detail: "Liste ciblée des données manquantes épinglée à partir de la réponse du chat." },
    scoping: { headline: "Délimitation de la liste de remboursement", detail: "Sélection uniquement des patients de diabétologie pédiatrique déjà repérés dans la liste traçable du chat." },
    fetchingEvidence: "Récupération des preuves sources HbA1c et ACR urinaire",
    readingNotes: { headline: "Lecture des notes de consultation", detail: "Vérification patient par patient des preuves de gestion glycémique, ACD/admission et revue." },
  },
  // Folded activity-line label for thinking steps.
  thinkingLabel: "Réflexion",
};

const diabetesWorklist = {
  tableTitle: "Données manquantes pour remboursements",
  tableDescription: "Liste ciblée des données diabète manquantes pour la soumission de remboursement, générée depuis la réponse du chat.",
  fileLabel: "donnees-manquantes-remboursements.xlsx",
  sheetName: "Remboursements",
  columns: [
    { key: "patient", header: "Patient", width: 12 },
    { key: "hba1c", header: "Dernière HbA1c", width: 14 },
    { key: "hba1cDate", header: "Date HbA1c / consultation", width: 28 },
    { key: "glucoseIntervention", header: "Preuve d'intervention de gestion glycémique", width: 40 },
    { key: "acr", header: "Résultat ACR urinaire", width: 20 },
    { key: "acrDate", header: "Date du résultat ACR urinaire", width: 30 },
    { key: "admission", header: "Preuve ACD / admission", width: 28 },
    { key: "lastReview", header: "Dernière revue diabète", width: 24 },
  ],
  answer: [
    "**Résumé :** Parmi les [12]{1} enfants suivis pour diabète, 7 nécessitent une action immédiate avant la date limite de soumission pour les critères de remboursement : [5]{2} présentent un taux d'HbA1c égal ou supérieur à 70 mmol/mol, et [2]{3} n'ont aucun résultat d'ACR urinaire enregistré.",
    "",
    "---",
    "",
    "### HbA1c élevée – Justificatif d'intervention requis",
    "",
    "• Problème : Ces patients dépassent le seuil d'HbA1c critique. La validation des critères de remboursement dépend donc de la traçabilité d'une intervention ou d'un ajustement de la prise en charge glycémique (validé ou convenu avec le patient).<br>",
    "• Patients : NPD002 : HbA1c [74,0 mmol/mol]{4}, NPD003 : HbA1c [81,0 mmol/mol]{5} avec [ACD lors du diagnostic initial]{6}, NPD005 : HbA1c [86,0 mmol/mol]{7}, NPD006 : HbA1c [92,0 mmol/mol]{8} avec [hospitalisation récente pour ACD]{9}, NPD008 : HbA1c [70,0 mmol/mol]{11}<br>",
    "• Action : Réévaluation par l'infirmier(e) spécialisé(e) en diabétologie ou par le médecin référent, puis saisie du plan d'action avant la soumission.",
    "",
    "---",
    "",
    "### Absence de résultat d'ACR urinaire – Non-conformité du parcours de soins",
    "",
    "• Problème : Aucun résultat d'ACR urinaire n'est enregistré pour ces patients ; le suivi du bilan annuel obligatoire est donc considéré comme incomplet.<br>",
    "• Patients : NPD007 – [aucun résultat d'ACR urinaire]{10}, NPD010 – [aucun résultat d'ACR urinaire]{12}<br>",
    "• Action : Récupérer le résultat d'analyse auprès du laboratoire, ou planifier et enregistrer un test d'ACR urinaire avant la soumission.",
  ].join("\n"),
  ask: {
    question: "Créer un tableau pour le responsable de l'audit diabète qui suit les données sources ?",
    createLabel: "Créer le tableau",
    keepLabel: "Garder la liste",
  },
  riskListAsk: {
    question: "Afficher la liste traçable par patient ?",
    showLabel: "Afficher la liste",
    keepLabel: "Garder le résumé",
  },
  messages: {
    keepRiskSummary: "Je garde cela comme court résumé des risques de remboursement.",
    buildingTable: "Je crée maintenant la liste des données manquantes pour remboursements. Elle inclura uniquement les 7 patients nécessitant une action et les preuves sourcées pour HbA1c, ACR, intervention de gestion glycémique, ACD/admissions et dernière revue.",
    keepChatAnswer: "Je garde la réponse sur le risque de déclaration diabète dans le chat.",
  },
  activities: {
    genericQuery: { label: "Interrogation de la base", headline: "Lecture des dossiers cités" },
    initial: [
      { id: "mock-diabetes-bpt-requirements", label: "Examen des critères de remboursement", headline: "Vérification des mesures de diabétologie pédiatrique applicables à cette échéance" },
      { id: "mock-diabetes-cohort", label: "Inspection de la cohorte diabète", headline: "Comptage des patients de diabétologie pédiatrique sur l'année de déclaration" },
      { id: "mock-diabetes-evidence-map", label: "Cartographie des preuves requises", headline: "Identification des champs de résultat et de processus de soins nécessaires à la soumission de remboursement" },
      { id: "mock-diabetes-care-processes", label: "Interrogation des preuves patient", headline: "Lecture de l'HbA1c, de l'ACR urinaire et des notes de consultation pour les mesures cartographiées" },
      { id: "mock-diabetes-admissions", label: "Vérification des notes d'admission", headline: "Recherche des admissions pour ACD liées aux patients nécessitant une action" },
      { id: "mock-diabetes-bpt-gap", label: "Évaluation de l'écart de remboursement", headline: "Regroupement des patients par preuve manquante et suivi recommandé" },
    ],
    riskList: { label: "Vérification des preuves de remboursement", headline: "Lecture des preuves HbA1c, ACR et admission" },
    table: [
      { id: "mock-diabetes-worklist-table", label: "Préparation du tableau sourcé", headline: "Création de la liste pour le responsable de l'audit diabète" },
      { id: "mock-diabetes-worklist-columns", label: "Résolution des colonnes de preuve", headline: "Correspondance HbA1c, ACR, gestion glycémique, admission et revue" },
      { id: "mock-diabetes-worklist-population", label: "Démarrage du remplissage", headline: "Lancement du remplissage en direct pour les 7 patients nécessitant une action" },
    ],
  },
  citations: {
    cohort: { explanation: "nombre de patients de diabétologie pédiatrique dans la cohorte de déclaration", denominatorLabel: "patients dans la cohorte de déclaration", completenessLabel: "patients comptés" },
    highHba1c: { explanation: "nombre de patients diabétiques avec HbA1c à 70 mmol/mol ou plus", denominatorLabel: "patients avec HbA1c élevée", completenessLabel: "valeurs HbA1c vérifiées" },
    missingAcr: { explanation: "nombre de patients diabétiques sans preuve d'ACR urinaire", denominatorLabel: "patients sans ACR", completenessLabel: "champs ACR vérifiés" },
    hba1c: (code) => `dernière valeur HbA1c pour ${code}`,
    dkaNewDiagnosis: (code) => `note d'admission documentant une ACD au diagnostic initial pour ${code}`,
    recentDka: (code) => `note d'admission documentant une hospitalisation récente pour ACD pour ${code}`,
    urinaryAcr: (code) => `recherche ACR urinaire pour ${code}`,
  },
  evidence: {
    dkaNewDiagnosis: "acidocétose diabétique (ACD) au moment du nouveau diagnostic",
    recentDka: "acidocétose diabétique (ACD) faisant suite à une maladie intercurrente",
  },
  cell: {
    noneRecorded: "Aucune enregistrée",
    patientExplanation: (code) => `${code} fait partie de la cohorte de déclaration de diabétologie pédiatrique pour cette période.`,
    hba1cDate: (code) => `Le panel d'observation clinique enregistre la date HbA1c pour ${code}.`,
    glucoseIntervention: (code) => `La note de consultation diabète documente une preuve d'intervention de gestion glycémique pour ${code}.`,
    acrDate: (code) => `Le panel d'observation clinique enregistre la date d'ACR urinaire pour ${code}.`,
    acrDateMissing: (code) => `Aucun résultat d'ACR urinaire n'est enregistré pour ${code}, donc il n'y a pas de date d'ACR urinaire.`,
    dkaAdmission: (code) => `La note d'admission documente une admission liée au diabète pour ACD chez ${code}.`,
    noAdmission: (code) => `Aucune admission liée au diabète n'est enregistrée pour ${code} dans la recherche des admissions de l'année d'audit.`,
    lastReview: (code) => `La note de revue annuelle documente la dernière revue diabète pour ${code}.`,
  },
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
// Three paediatric BPT dashboards. Each opens a seeded audit via selectPopulatedTable().
// `trackers` lists ids into the `trackers` map below. Numbers/ids/refs/kinds are
// logic and identical across packs; title/subtitle strings stay English verbatim.
const dashboards = [
  {
    id: "paediatric-diabetes-bpt",
    templateId: "npda-lo-audit",
    title: "Diabetes BPT",
    logo: "dash-diabetes",
    subtitle: "NPDA · key care processes",
    submissionDeadline: "2026-07-20",
    trackers: ["t-dia-hba1c-coverage", "t-dia-care-processes", "t-dia-mdt-contacts", "t-dia-psychology", "t-dia-dietitian", "t-dia-carb-counting", "t-dia-high-hba1c", "t-dia-coeliac-thyroid"],
  },
  {
    id: "paediatric-epilepsy-bpt",
    templateId: "epilepsy12-lo-audit",
    title: "Epilepsy BPT",
    logo: "dash-epilepsy",
    subtitle: "Epilepsy12 · service KPIs",
    submissionDeadline: "2027-01-12",
    trackers: ["t-epi-paediatrician-2wk", "t-epi-esn-first-year", "t-epi-mri-6wk", "t-epi-ecg-convulsive", "t-epi-mh-screening", "t-epi-care-plan-12mo", "t-epi-valproate-ppp"],
  },
  {
    id: "paediatric-trauma-bpt",
    templateId: "nmtr-trauma-lo-audit",
    title: "Major Trauma BPT",
    logo: "dash-trauma",
    subtitle: "NMTR · acute care standards",
    submissionDeadline: "Submit ≤25 days of discharge",
    trackers: ["t-tra-registry-25d", "t-tra-consultant-5min", "t-tra-ct-head-60min", "t-tra-txa-1h", "t-tra-airway-30min", "t-tra-rehab-prescription"],
  },
  {
    id: "cord-ph-bpt",
    templateId: "cord-ph-lo-audit",
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
    title: "HbA1c ≥4×/yr coverage",
    kind: "timeseries",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "m1", label: "Aug", value: 0.55, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m2", label: "Sep", value: 0.62, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m3", label: "Oct", value: 0.70, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m4", label: "Nov", value: 0.75, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m5", label: "Dec", value: 0.80, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
      { key: "m6", label: "Jan", value: 0.83, status: "not-met", highlightRefs: ["NPDA!T2", "NPDA!U2", "NPDA!T3", "NPDA!U3", "NPDA!T4", "NPDA!U4", "NPDA!T5", "NPDA!U5", "NPDA!T6", "NPDA!U6", "NPDA!T7", "NPDA!U7", "NPDA!T8", "NPDA!U8", "NPDA!T9", "NPDA!U9", "NPDA!T10", "NPDA!U10", "NPDA!T11", "NPDA!U11", "NPDA!T12", "NPDA!U12", "NPDA!T13", "NPDA!U13"] },
    ],
    criterion: "Paediatric Diabetes BPT criterion (j) — ≥4 dated HbA1c results in the audit year, cohort target ≥90% (research §3 A1) [3]",
  },
  // A2 — seven NICE annual health checks, cohort partitioned by number of
  // applicable checks completed (recomputed from the BP/foot/retinal/ACR/
  // cholesterol/thyroid/coeliac fields per patient). The four bars partition all
  // 12 patients (6 + 1 + 2 + 3); each bar's row count equals value × 12. Each
  // row highlights all seven check-date columns {AG,AH,AI,AK,AN,AP,AR}.
  "t-dia-care-processes": {
    id: "t-dia-care-processes",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Seven NICE annual health checks",
    kind: "histogram",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "c5", label: "5 checks done", value: 6 / 12, status: "met", highlightRefs: ["NPDA!AG2", "NPDA!AH2", "NPDA!AI2", "NPDA!AK2", "NPDA!AN2", "NPDA!AP2", "NPDA!AR2", "NPDA!AG3", "NPDA!AH3", "NPDA!AI3", "NPDA!AK3", "NPDA!AN3", "NPDA!AP3", "NPDA!AR3", "NPDA!AG6", "NPDA!AH6", "NPDA!AI6", "NPDA!AK6", "NPDA!AN6", "NPDA!AP6", "NPDA!AR6", "NPDA!AG7", "NPDA!AH7", "NPDA!AI7", "NPDA!AK7", "NPDA!AN7", "NPDA!AP7", "NPDA!AR7", "NPDA!AG9", "NPDA!AH9", "NPDA!AI9", "NPDA!AK9", "NPDA!AN9", "NPDA!AP9", "NPDA!AR9", "NPDA!AG13", "NPDA!AH13", "NPDA!AI13", "NPDA!AK13", "NPDA!AN13", "NPDA!AP13", "NPDA!AR13"] },
      { key: "c4", label: "4 checks done", value: 1 / 12, status: "not-met", highlightRefs: ["NPDA!AG11", "NPDA!AH11", "NPDA!AI11", "NPDA!AK11", "NPDA!AN11", "NPDA!AP11", "NPDA!AR11"] },
      { key: "c2", label: "2 checks done", value: 2 / 12, status: "not-met", highlightRefs: ["NPDA!AG4", "NPDA!AH4", "NPDA!AI4", "NPDA!AK4", "NPDA!AN4", "NPDA!AP4", "NPDA!AR4", "NPDA!AG8", "NPDA!AH8", "NPDA!AI8", "NPDA!AK8", "NPDA!AN8", "NPDA!AP8", "NPDA!AR8"] },
      { key: "c1", label: "1 check done", value: 3 / 12, status: "not-met", highlightRefs: ["NPDA!AG5", "NPDA!AH5", "NPDA!AI5", "NPDA!AK5", "NPDA!AN5", "NPDA!AP5", "NPDA!AR5", "NPDA!AG10", "NPDA!AH10", "NPDA!AI10", "NPDA!AK10", "NPDA!AN10", "NPDA!AP10", "NPDA!AR10", "NPDA!AG12", "NPDA!AH12", "NPDA!AI12", "NPDA!AK12", "NPDA!AN12", "NPDA!AP12", "NPDA!AR12"] },
    ],
    criterion: "Paediatric Diabetes BPT criterion (k) — the seven NICE annual health checks completed where applicable (research §3 A2) [3][5]",
  },
  // A3 — MDT clinic ≥4/yr + ≥8 additional contacts. Representative headline
  // (no per-contact field in the mock); the gap exemplar is the highest-HbA1c row.
  "t-dia-mdt-contacts": {
    id: "t-dia-mdt-contacts",
    dashboardId: "paediatric-diabetes-bpt",
    title: "MDT clinic ≥4/yr + ≥8 contacts",
    kind: "stat",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Patients meeting ≥4 clinics + ≥8 contacts", value: 11, status: "met", highlightRefs: ["NPDA!O2", "NPDA!O3", "NPDA!O4", "NPDA!O5", "NPDA!O6", "NPDA!O8", "NPDA!O9", "NPDA!O10", "NPDA!O11", "NPDA!O12", "NPDA!O13"] },
    ],
    criterion: "Paediatric Diabetes BPT criteria (g) & (h) — ≥4 MDT clinic appointments and ≥8 additional contacts per year. Proxy: the mock has no per-contact field, so each patient's clinic visit (column O) anchors the highlight (research §3 A3) [3]",
  },
  // A4 — annual psychology assessment (psychScreen present in audit year for all).
  "t-dia-psychology": {
    id: "t-dia-psychology",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Annual psychology assessment",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Assessed this year", value: 12 / 12, status: "met", highlightRefs: ["NPDA!AY2", "NPDA!AY3", "NPDA!AY4", "NPDA!AY5", "NPDA!AY6", "NPDA!AY7", "NPDA!AY8", "NPDA!AY9", "NPDA!AY10", "NPDA!AY11", "NPDA!AY12", "NPDA!AY13"] },
      { key: "not-met", label: "Not assessed", value: 0, status: "not-met", highlightRefs: [] },
    ],
    criterion: "Paediatric Diabetes BPT criterion (l) — psychological assessment at least annually for additional-support need (research §3 A4) [3]",
  },
  // A5 — additional dietitian appointment offered (i.dietitian.v === "Yes").
  "t-dia-dietitian": {
    id: "t-dia-dietitian",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Additional dietitian appointment offered",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Offered", value: 9 / 12, status: "met", highlightRefs: ["NPDA!BD2", "NPDA!BD3", "NPDA!BD4", "NPDA!BD6", "NPDA!BD7", "NPDA!BD8", "NPDA!BD9", "NPDA!BD11", "NPDA!BD13"] },
      { key: "not-met", label: "Not offered", value: 3 / 12, status: "not-met", highlightRefs: ["NPDA!BD5", "NPDA!BD10", "NPDA!BD12"] },
    ],
    criterion: "Paediatric Diabetes BPT criterion (i) — at least one additional dietitian appointment offered per year, target ≥90% (research §3 A5) [3]",
  },
  // A6 — carb-counting ≤14d of diagnosis, cohort = newly-diagnosed T1 (NPD003, NPD007).
  "t-dia-carb-counting": {
    id: "t-dia-carb-counting",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Carb-counting ≤14d of diagnosis (new T1)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Within 14 days", value: 1 / 2, status: "met", highlightRefs: ["NPDA!BC4", "NPDA!I4"] },
      { key: "not-met", label: "Over 14 days", value: 1 / 2, status: "not-met", highlightRefs: ["NPDA!BC8", "NPDA!I8"] },
    ],
    criterion: "Paediatric Diabetes BPT criterion (f) — level-3 carbohydrate counting within 14 days of diagnosis for new type 1, denominator = newly diagnosed (research §3 A6) [3]",
  },
  // A7 — high-HbA1c (≥69 mmol/mol) follow-up flag. Count at risk = 5.
  "t-dia-high-hba1c": {
    id: "t-dia-high-hba1c",
    dashboardId: "paediatric-diabetes-bpt",
    title: "High-HbA1c (≥69) follow-up flag",
    kind: "stat",
    target: { op: "<=", value: 0 },
    elements: [
      { key: "at-risk", label: "Patients with HbA1c ≥69 mmol/mol", value: 5, status: "not-met", highlightRefs: ["NPDA!T3", "NPDA!T4", "NPDA!T6", "NPDA!T7", "NPDA!T9"] },
    ],
    criterion: "Paediatric Diabetes BPT criterion (o)(i) — HbA1c ≥69 mmol/mol triggers escalation; flagged as revenue-at-risk (research §3 A7) [3]",
  },
  // A8 — coeliac + thyroid screening at diagnosis, cohort = newly-diagnosed T1.
  "t-dia-coeliac-thyroid": {
    id: "t-dia-coeliac-thyroid",
    dashboardId: "paediatric-diabetes-bpt",
    title: "Coeliac + thyroid screening at diagnosis (new T1)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Both screened", value: 2 / 2, status: "met", highlightRefs: ["NPDA!AR4", "NPDA!AP4", "NPDA!AR8", "NPDA!AP8"] },
      { key: "not-met", label: "Incomplete", value: 0, status: "not-met", highlightRefs: [] },
    ],
    criterion: "Paediatric Diabetes BPT criterion (k) subset — coeliac and thyroid screening around diagnosis for new type 1 (research §3 A8) [3][5]",
  },

  // === Dashboard 2 — Paediatric Epilepsy BPT (Epilepsy12, rows A2–A11) ======
  // B1 — epilepsy-expert paediatrician ≤2 weeks of referral.
  "t-epi-paediatrician-2wk": {
    id: "t-epi-paediatrician-2wk",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "Epilepsy-expert paediatrician ≤2 weeks",
    kind: "timeseries",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "m1", label: "Aug", value: 0.50, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m2", label: "Sep", value: 0.58, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m3", label: "Oct", value: 0.65, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m4", label: "Nov", value: 0.72, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m5", label: "Dec", value: 0.78, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
      { key: "m6", label: "Jan", value: 0.80, status: "not-met", highlightRefs: ["Epilepsy!F2", "Epilepsy!G2", "Epilepsy!H2", "Epilepsy!F3", "Epilepsy!G3", "Epilepsy!H3", "Epilepsy!F4", "Epilepsy!G4", "Epilepsy!H4", "Epilepsy!F5", "Epilepsy!G5", "Epilepsy!H5", "Epilepsy!F6", "Epilepsy!G6", "Epilepsy!H6", "Epilepsy!F7", "Epilepsy!G7", "Epilepsy!H7", "Epilepsy!F8", "Epilepsy!G8", "Epilepsy!H8", "Epilepsy!F9", "Epilepsy!G9", "Epilepsy!H9", "Epilepsy!F10", "Epilepsy!G10", "Epilepsy!H10", "Epilepsy!F11", "Epilepsy!G11", "Epilepsy!H11"] },
    ],
    criterion: "Epilepsy12 KPI 1 — seen by an epilepsy-expert consultant paediatrician within 2 weeks of referral (research §3 B1) [7]",
  },
  // B2 — ESN input within the first year.
  "t-epi-esn-first-year": {
    id: "t-epi-esn-first-year",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "ESN input within first year",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "ESN input in year", value: 9 / 10, status: "met", highlightRefs: ["Epilepsy!J2", "Epilepsy!J3", "Epilepsy!J4", "Epilepsy!J5", "Epilepsy!J6", "Epilepsy!J8", "Epilepsy!J9", "Epilepsy!J10", "Epilepsy!J11"] },
      { key: "not-met", label: "No ESN input", value: 1 / 10, status: "not-met", highlightRefs: ["Epilepsy!J7"] },
    ],
    criterion: "Epilepsy12 KPI 2 — epilepsy specialist nurse input within the first year of care (research §3 B2) [3][7]",
  },
  // B3 — MRI ≤6 weeks where indicated (eligible = mriIndicated Yes; 6 of 10).
  "t-epi-mri-6wk": {
    id: "t-epi-mri-6wk",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "MRI ≤6 weeks (where indicated)",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "Within 6 weeks", value: 4 / 6, status: "met", highlightRefs: ["Epilepsy!M2", "Epilepsy!N2", "Epilepsy!M3", "Epilepsy!N3", "Epilepsy!M6", "Epilepsy!N6", "Epilepsy!M10", "Epilepsy!N10"] },
      { key: "not-met", label: "Over 6 weeks / not done", value: 2 / 6, status: "not-met", highlightRefs: ["Epilepsy!M4", "Epilepsy!N4", "Epilepsy!M8", "Epilepsy!N8"] },
    ],
    criterion: "Epilepsy12 KPI 5 — MRI within 6 weeks of request where indicated; denominator = indicated cases only (research §3 B3) [7]",
  },
  // B4 — ECG in convulsive seizures (eligible = convulsive; 7 of 10).
  "t-epi-ecg-convulsive": {
    id: "t-epi-ecg-convulsive",
    dashboardId: "paediatric-epilepsy-bpt",
    title: "ECG in convulsive seizures",
    kind: "donut",
    target: { op: ">=", value: 0.9 },
    elements: [
      { key: "met", label: "ECG performed", value: 6 / 7, status: "met", highlightRefs: ["Epilepsy!Q2", "Epilepsy!Q3", "Epilepsy!Q5", "Epilepsy!Q8", "Epilepsy!Q9", "Epilepsy!Q11"] },
      { key: "not-met", label: "No ECG", value: 1 / 7, status: "not-met", highlightRefs: ["Epilepsy!Q6"] },
    ],
    criterion: "Epilepsy12 KPI 4 — ECG by first year where seizures are convulsive; denominator = convulsive cases (research §3 B4) [7]",
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
      { key: "m1", label: "Aug", value: 0.55, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m2", label: "Sep", value: 0.65, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m3", label: "Oct", value: 0.72, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m4", label: "Nov", value: 0.80, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m5", label: "Dec", value: 0.85, status: "not-met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
      { key: "m6", label: "Jan", value: 0.90, status: "met", highlightRefs: ["Epilepsy!W2", "Epilepsy!W3", "Epilepsy!W4", "Epilepsy!W5", "Epilepsy!W6", "Epilepsy!W7", "Epilepsy!W8", "Epilepsy!W9", "Epilepsy!W10", "Epilepsy!W11"] },
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
      { key: "m1", label: "Aug", value: 0.60, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m2", label: "Sep", value: 0.70, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m3", label: "Oct", value: 0.78, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m4", label: "Nov", value: 0.83, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m5", label: "Dec", value: 0.88, status: "not-met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
      { key: "m6", label: "Jan", value: 0.90, status: "met", highlightRefs: ["Trauma!I2", "Trauma!L2", "Trauma!J2", "Trauma!K2", "Trauma!I3", "Trauma!L3", "Trauma!J3", "Trauma!K3", "Trauma!I4", "Trauma!L4", "Trauma!J4", "Trauma!K4", "Trauma!I5", "Trauma!L5", "Trauma!J5", "Trauma!K5", "Trauma!I6", "Trauma!L6", "Trauma!J6", "Trauma!K6", "Trauma!I7", "Trauma!L7", "Trauma!J7", "Trauma!K7", "Trauma!I8", "Trauma!L8", "Trauma!J8", "Trauma!K8", "Trauma!I9", "Trauma!L9", "Trauma!J9", "Trauma!K9", "Trauma!I10", "Trauma!L10", "Trauma!J10", "Trauma!K10", "Trauma!I11", "Trauma!L11", "Trauma!J11", "Trauma!K11"] },
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
      { key: "m1", label: "Aug", value: 0.45, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m2", label: "Sep", value: 0.40, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m3", label: "Oct", value: 0.36, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m4", label: "Nov", value: 0.31, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m5", label: "Dec", value: 0.28, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
      { key: "m6", label: "Jan", value: 0.25, status: "not-met", highlightRefs: ["ALL!Z2", "ALL!Z3", "ALL!Z4", "ALL!Z5", "ALL!Z6", "ALL!Z7", "ALL!Z8", "ALL!Z9", "ALL!Z10"] },
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
  templateDetail,
  specValues,
  explain,
  blockedReason,
  timeline,
  diabetesWorklist,
  email,
  dashboards,
  trackers,
  artifactWorkspace,
};
