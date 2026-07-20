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

// Dutch (nl) translation of the artifactWorkspace namespace (#358). Mirrors the
// English pack's shape exactly (same keys, nesting, order, function arity and
// ${…} placeholders); only the human-readable prose is translated. Every
// language-invariant token (patient ids, ISO dates, %, mm/cm/mg/Gy, TNM strings,
// UICC stage groups, Annexe 55 code NUMBERS, ECOG scores, lab values and the
// fixed clinical/genomic tokens) is kept byte-identical to en — the
// structural-parity test guards this. Coded values render as `name (code NN)`:
// the NAME localises, the NUMBER comes from logic via the `coded` helper.
const artifactWorkspace = {
  // Matrix column headers (Annexe 55 field names).
  columns: {
    patient: "Patiënt",
    histology: "Histologie",
    ecog: "ECOG",
    tnm: "TNM",
    stage: "Stadium",
    pdl1: "PD-L1 TPS",
    egfr: "EGFR",
    ngs: "NGS/Moleculair",
    treatment: "Behandeling",
    mocNotes: "MOC-notities",
  },

  // Coded-value composition: `name (code NN)`. Name localises; the code number is
  // passed in from logic. The literal word "code" lives here so it can localise.
  coded: (name, code) => `${name} (code ${code})`,

  // Histology column names (field 6 · diagnostic histology + behaviour).
  histology: {
    adenocarcinoma: "Adenocarcinoom",
    squamousCell: "Plaveiselcel",
    nsclcNos: "NSCLC, NOS",
    smallCellSclc: "Kleincellig (SCLC)",
  },

  // ECOG labels (field 3 · WHO/ECOG score). Rendered `label (score)`; the score
  // number is invariant and lives in logic.
  ecog: {
    fullyActive: "Volledig actief",
    ambulatory: "Ambulant",
    selfCareOnly: "Alleen zelfzorg",
    scored: (label, score) => `${label} (${score})`,
  },

  // Stage column: the numbered UICC groups (IVA, IIIB, …) are invariant and stay
  // in logic; only the SCLC prose descriptor localises.
  stage: {
    extensive: "Uitgebreid stadium",
  },

  // Matrix prose values (words, not codes) and mixed-value templates. The code
  // number / percentage / genomic token is always interpolated from logic.
  values: {
    missing: "Ontbreekt",
    pending: "In afwachting",
    complete: "Volledig",
    negative: "Negatief",
    na: "N.v.t.",
    naSquamous: "N.v.t. (plaveiselcel)",
    naEarlyStage: "N.v.t. (vroeg stadium)",
    naSclc: "N.v.t. (SCLC)",
    insufficientTissue: "Onvoldoende weefsel (herhaling aangevraagd)",
    completeWith: (marker) => `Volledig (${marker})`,
    positiveWith: (variant) => `Positief (${variant})`,
    conflicting: (a, b) => `Tegenstrijdig (${a} vs ${b})`,
    // Blocked-cell reason details surfaced in the evidence panel status. The
    // status matching itself (missing / pending / insufficient tissue / n/a) is
    // logic that keys off the English value and stays in the demo module.
    missingReasonDetail: "Geen brondocument gevonden voor dit veld.",
    insufficientTissueReasonDetail: "Het monster bevatte onvoldoende weefsel voor deze test; een herhalingsbiopsie werd aangevraagd.",
  },

  // Treatment column names (field 10 · coded chronology). Each renders through
  // `coded`; dates inside a name are invariant and interpolated in logic.
  treatment: {
    pembrolizumabStarted: "Pembrolizumab, gestart",
    concurrentChemoRtCompleted: "Concomitante chemo-RT, voltooid",
    noConsolidationImmunotherapy: "geen consolidatie-immunotherapie",
    documented: "gedocumenteerd",
    carboPaclitaxelPembrolizumab: "Carbo/paclitaxel + pembrolizumab",
    osimertinibStarted: "Osimertinib, gestart",
    surgeryPlanned: "Operatie gepland — in afwachting van chirurgische planning",
    notYetStarted: "Nog niet gestart — onderzoek onvolledig",
    alectinibStarted: "Alectinib, gestart",
    concurrentChemoRtOngoing: "Concomitante chemo-RT, lopend",
    carboEtoposideAtezolizumab: "Carbo/etoposide + atezolizumab",
  },

  // Clinical note-type labels, shared across interpreted-cell notes, conflict
  // sources and precedent facts.
  noteLabels: {
    oncologyConsult: "Oncologisch consultverslag",
    oncologyTreatment: "Oncologisch behandelverslag",
    mdtOutcome: "MDO-uitkomstverslag",
    radiationOncologyCompletion: "Radiotherapie-voltooiingsverslag",
    thoracicSurgeryClinic: "Thoraxchirurgie-polikliniekverslag",
    oncologyClinic: "Oncologie-polikliniekverslag",
    radiationOncologyProgress: "Radiotherapie-voortgangsverslag",
    oncologyNote: "Oncologieverslag",
    oncologyFollowUp: "Oncologisch follow-upverslag",
    radiologyNote: "Radiologieverslag",
    pathologyReport: "Pathologieverslag",
    molecularPathologyReread: "Moleculaire pathologie-herbeoordeling",
  },

  // Histology-cell evidence: the Annexe 55 provenance block (fields 2, 4, 5, 7).
  // Coded names render through `coded`; lobe/laterality/differentiation names and
  // biopsy procedure names localise, the code numbers and dates stay in logic.
  provenance: {
    heading: "Annexe 55-herkomst",
    oldResult: "Oud resultaat",
    labels: {
      baseOfDiagnosis: "Diagnosebasis",
      localisationLaterality: "Lokalisatie · lateraliteit",
      differentiationGrade: "Differentiatiegraad",
      biopsy: "Biopsie",
      petct: "PET-CT",
    },
    baseOfDiagnosis: {
      histologyOfPrimary: "Histologie van primaire tumor",
      cytology: "Cytologie",
    },
    lobes: {
      rightUpperLobe: "Rechterbovenkwab",
      leftUpperLobe: "Linkerbovenkwab",
      leftLowerLobe: "Linkeronderkwab",
      rightLowerLobe: "Rechteronderkwab",
    },
    laterality: {
      left: "Links",
      right: "Rechts",
    },
    differentiation: {
      well: "Goed gedifferentieerd",
      moderately: "Matig gedifferentieerd",
      poorly: "Slecht gedifferentieerd",
      unknown: "Onbekend",
    },
    biopsyProcedures: {
      ctGuidedLung: "CT-geleide long",
      bronchoscopy: "bronchoscopie",
      pleural: "pleuraal",
      vatsWedge: "VATS-wig",
    },
    // `{lobe} · {laterality (code n)}` — the middot is punctuation, from logic.
    localisation: (lobe, lateralityCoded) => `${lobe} · ${lateralityCoded}`,
    // `{ISO date} ({procedure})` — the date is invariant, from logic.
    biopsyValue: (date, procedure) => `${date} (${procedure})`,
    biopsyAgeDetail: (date, days) => `Biopsie ${date} is ${days} dagen oud — oud resultaat.`,
  },

  // Evidence side panel (both the fixture-built evidence and the component chrome).
  evidence: {
    selectedCell: "Geselecteerde cel",
    mocNote: "MOC-notitie",
    interpretedExplanation: (columnTitle, rowId, noteLabel, date) =>
      `De waarde ${columnTitle} is geëxtraheerd uit vrije tekst in ${noteLabel} van ${rowId} (${date}).`,
    directExplanation: (columnTitle, concept, rowId) =>
      `De waarde ${columnTitle} is afgelezen uit de bron ${concept} gekoppeld aan patiënt ${rowId}.`,
    mocNoteExplanation: (rowId) => `Naar MOC-notities geschreven vanuit een vervolggesprek over ${rowId}.`,
    conflictResolvedNote: (acceptedValue, acceptedLabel, rejectedValue, rejectedLabel, date) =>
      `PD-L1-conflict opgelost: ${acceptedValue} (${acceptedLabel}) geaccepteerd boven ${rejectedValue} (${rejectedLabel}), bevestigd ${date}.`,
    // ArtifactEvidence.svelte chrome.
    conflictHeading: "Tegenstrijdige bronnen",
    conflictHint: "Beide aflezingen worden bewaard. Accepteer de waarde die u voor deze cel wilt gebruiken.",
    selected: "Geselecteerd",
    notSelected: "Niet geselecteerd",
    use: (value) => `Gebruik ${value}`,
    using: (value) => `In gebruik: ${value}`,
    useFrom: (value, label) => `Gebruik ${value} uit ${label}`,
    blockNote: "Notitie",
    blockReferences: "Referenties",
    blockSource: "Bron",
    blockQuery: "Query",
    blockReport: "Verslag",
    close: "Bewijs sluiten",
  },

  // The DB concept descriptor rendered in the direct-cell explanation ("…read
  // from the {concept} source…"), keyed by column id. Localises the human-facing
  // descriptor; the SQL `concept_name` token stays in logic (FIELD_SOURCES), so
  // the query text is language-invariant while the sentence localises.
  fieldSourceConcepts: {
    histology: "histologie",
    tnm: "TNM-classificatie",
    pdl1: "PD-L1 TPS",
    egfr: "EGFR-mutatie",
    ngs: "NGS-panel",
    treatment: "huidige behandeling",
    mocNotes: "MOC-besprekingsnotitie",
  },

  // The two attention-list lines shown in the opening turn. Ids, code numbers,
  // stage groups, dates and percentages are interpolated from logic.
  attention: {
    flagMissing: "Ontbreekt",
    flagConflicting: "Tegenstrijdig",
    l3402Label: (id, stage) => `${id} (stadium ${stage}, niet-resectabel)`,
    l3402Detail: (chemoCode, rtDate, immunoCode) =>
      `concomitante chemo-RT (code ${chemoCode}) voltooid ${rtDate}, maar er is geen consolidatie-immunotherapie (code ${immunoCode}) gedocumenteerd. Durvalumab-consolidatie is de richtlijn-vervolgstap na chemo-RT en wordt COM-gemonitord voor terugbetaling — het is de moeite waard om na te gaan of het venster is verstreken.`,
    l3404Label: (id, stage) => `${id} (stadium ${stage})`,
    l3404Detail: (pathologyValue, rereadValue) =>
      `PD-L1 TPS tegenstrijdig: pathologieverslag leest ${pathologyValue}, moleculaire pathologie-herbeoordeling leest ${rereadValue}. De behandelkeuze kan afhangen van welke wordt gebruikt.`,
  },

  // Source-document bodies + verbatim quote substrings for the L-3404 PD-L1
  // conflict. Percentages inside the prose are invariant, kept verbatim here.
  conflict: {
    pdl1: {
      pathology: {
        quotes: ["Tumorproportiescore 60%"],
        body: "PD-L1 (22C3 assay): Tumorproportiescore 60%.",
      },
      reread: {
        quotes: ["Tumorproportiescore 10%", "herhalingstest aanbevolen indien beslissend voor de behandelkeuze"],
        body: "Herbeoordeling van PD-L1 IHC op verzoek van de tweede beoordelaar: Tumorproportiescore 10%. Heterogene aankleuring vastgesteld; herhalingstest aanbevolen indien beslissend voor de behandelkeuze.",
      },
    },
  },

  // Clinical note prose behind every interpreted (yellow) cell, keyed
  // "rowId:columnId". `quotes` are verbatim substrings of `body`. The note label
  // and date are held in logic (label -> noteLabels; date invariant).
  interpretedNotes: {
    "L-3401:ecog": {
      quotes: ["ECOG-performancestatus 1"],
      body: "Beoordeeld op de polikliniek vóór systemische therapie. ECOG-performancestatus 1: symptomatisch door hoest maar volledig ambulant en zelfredzaam. Geschikt voor immunotherapie.",
    },
    "L-3401:stage": {
      quotes: ["gestadieerd als cT2 cN3 cM1b, UICC-stadium IVA"],
      body: "Stadiëringsonderzoek nu voltooid. CT en PET tonen een primaire tumor van 4.2cm in de RUL met mediastinale klierziekte in meerdere stations en contralaterale klierziekte, plus een solitaire bijniermetastase; gestadieerd als cT2 cN3 cM1b, UICC-stadium IVA. Moleculaire resultaten met de patiënt besproken; opties voor systemische therapie besproken.",
    },
    "L-3401:treatment": {
      quotes: ["Pembrolizumab-monotherapie vandaag gestart"],
      body: "PD-L1 TPS 80%, geen actioneerbare driver op NGS behalve KRAS G12C. Pembrolizumab-monotherapie vandaag gestart, cyclus 1 zonder complicaties toegediend. Plan: 3-wekelijks voortzetten, herstadiërings-CT na cyclus 3.",
    },
    "L-3402:ecog": {
      quotes: ["ECOG-performancestatus 1"],
      body: "Geschikt voor radicale concomitante chemoradiotherapie: ECOG-performancestatus 1, ambulant en zelfstandig in dagelijkse activiteiten, adequate orgaanfunctie bij baseline-bloedonderzoek.",
    },
    "L-3402:stage": {
      quotes: ["stadium IIIB (cT4 cN2 cM0) en niet-resectabel"],
      body: "MDO-beoordeling van beeldvorming en EBUS-resultaten: bulky mediastinale klierziekte met contralaterale klierbetrokkenheid. Thoraxchirurgie-beoordeling concludeert dat de ziekte stadium IIIB (cT4 cN2 cM0) en niet-resectabel is. Consensusplan: concomitante chemoradiotherapie met curatieve intentie.",
    },
    "L-3402:treatment": {
      quotes: ["Concomitante chemoradiotherapie vandaag voltooid", "geen consolidatie-immunotherapie besteld"],
      body: "Concomitante chemoradiotherapie vandaag voltooid: 60 Gy in 30 fracties met wekelijks carboplatin/paclitaxel, verdragen met graad 1 oesofagitis. PD-L1-resultaat nog niet beschikbaar bij voltooiing; geen consolidatie-immunotherapie besteld op dit moment. Voor follow-up medische oncologie.",
    },
    "L-3403:ecog": {
      quotes: ["Performancestatus ECOG 1"],
      body: "Pleuravochtcytologie bevestigt plaveiselcelcarcinoom. Performancestatus ECOG 1: symptomatisch met inspanningsdyspneu maar ambulant en zelfredzaam. Voor eerstelijns systemische therapie.",
    },
    "L-3403:stage": {
      quotes: ["maligne pleurale effusie — cM1a-ziekte, UICC-stadium IVA"],
      body: "Pleuravochtcytologie van de aspiratie op 2026-05-28 is positief voor maligne cellen passend bij plaveiselcelcarcinoom en bevestigt een maligne pleurale effusie — cM1a-ziekte, UICC-stadium IVA. Performancestatus ECOG 1. Voor eerstelijns systemische therapie.",
    },
    "L-3403:treatment": {
      quotes: ["carboplatin/paclitaxel met pembrolizumab"],
      body: "Cyclus 2 van carboplatin/paclitaxel met pembrolizumab vandaag toegediend. Verdraagt de behandeling goed afgezien van graad 1 vermoeidheid; pleurale effusie klinisch stabiel, geen heraccumulatie die drainage vereist.",
    },
    "L-3404:ecog": {
      quotes: ["ECOG-performancestatus 0"],
      body: "Ondanks ossale metastasen blijft de patiënt ECOG-performancestatus 0: volledig actief, in staat alle activiteiten van vóór de ziekte zonder beperking voort te zetten. Voor EGFR-gerichte doelgerichte therapie.",
    },
    "L-3404:stage": {
      quotes: ["meerdere ossale metastasen", "cM1c-ziekte, UICC-stadium IVB"],
      body: "PET-CT en MRI-wervelkolom bevestigen meerdere ossale metastasen (T8-wervellichaam, linker ilium) naast de primaire longtumor: cM1c-ziekte, UICC-stadium IVB. Gestart met analgesie; botbeschermend middel besproken. EGFR exon 19 deletie positief — voor doelgerichte therapie.",
    },
    "L-3404:treatment": {
      quotes: ["Osimertinib 80mg eenmaal daags vandaag gestart"],
      body: "EGFR exon 19 deletie bevestigd op weefsel-NGS. Osimertinib 80mg eenmaal daags vandaag gestart na baseline-ECG en bloedonderzoek. Voorgelicht over huiduitslag, diarree en QTc-monitoring; eerste responsbeoordeling over 6 weken.",
    },
    "L-3405:ecog": {
      quotes: ["ECOG-performancestatus 0"],
      body: "Gezonde patiënt met een toevallig gevonden longnodulus. ECOG-performancestatus 0: volledig actief, asymptomatisch, geen functionele beperking. Geschikt voor lobectomie.",
    },
    "L-3405:stage": {
      quotes: ["pathologisch stadium IA (pT1b pN0 cM0), resectabele ziekte"],
      body: "Solitaire longnodulus van 2.1cm in de rechterbovenkwab, PET-avid, zonder klier- of afstandsziekte: pathologisch stadium IA (pT1b pN0 cM0), resectabele ziekte. Wigresectie-histologie bevestigt adenocarcinoom met vrije marges op het diagnostische preparaat. Verwezen naar thoraxchirurgie voor definitieve resectieplanning.",
    },
    "L-3405:treatment": {
      quotes: ["in afwachting van chirurgische planning"],
      body: "Beoordeeld op de thoraxchirurgie-polikliniek. Longfunctie adequaat voor lobectomie (FEV1 92% voorspeld). Momenteel in afwachting van chirurgische planning en preoperatieve anesthesiologische beoordeling; streven om binnen 4 weken op de wachtlijst te plaatsen.",
    },
    "L-3406:ecog": {
      quotes: ["ECOG-performancestatus 2"],
      body: "ECOG-performancestatus 2: symptomatisch, meer dan de helft van de wakkere dag op de been en in staat tot zelfzorg maar niet in staat te werken. Behandelintensiteit af te wegen tegen performancestatus op de MOC.",
    },
    "L-3406:stage": {
      quotes: ["stadium IIIA (cT3 cN2 cM0) en niet-resectabel"],
      body: "EBUS bevestigt N2-klierbetrokkenheid (stations 4R en 7). MDO-consensus: de ziekte is stadium IIIA (cT3 cN2 cM0) en niet-resectabel; geen chirurgische kandidaat. Plan hangt af van de toereikendheid van de herhalingsbiopsie voor moleculaire profilering.",
    },
    "L-3406:treatment": {
      quotes: ["De behandeling is nog niet gestart"],
      body: "De behandeling is nog niet gestart. Het initiële monster bevatte onvoldoende weefsel voor het NGS-panel; herhalings-bronchoscopische biopsie aangevraagd voordat het systemische plan wordt afgerond. PD-L1 en EGFR ook nog niet beschikbaar. Opnieuw te bespreken op de MOC zodra de resultaten binnen zijn.",
    },
    "L-3407:ecog": {
      quotes: ["ECOG-performancestatus 1"],
      body: "Nieuw gediagnosticeerd met hersenmetastasen maar neurologisch intact. ECOG-performancestatus 1: ambulant en zelfredzaam, geen behoefte aan corticosteroïden. Gestart met CNS-penetrerende doelgerichte therapie.",
    },
    "L-3407:stage": {
      quotes: ["cM1c-ziekte, UICC-stadium IVB, met hersenmetastasen"],
      body: "MRI-hersenen (2026-05-26) toont drie aankleurende metastasen, grootste 14mm in de rechter frontaalkwab: cM1c-ziekte, UICC-stadium IVB, met hersenmetastasen. Asymptomatisch, geen behoefte aan corticosteroïden. ALK-herschikking geïdentificeerd op NGS — CNS-penetrerende doelgerichte therapie verkozen boven radiotherapie vooraf.",
    },
    "L-3407:treatment": {
      quotes: ["Alectinib 600mg tweemaal daags vandaag gestart (2026-05-30)"],
      body: "ALK-herschikking bevestigd. Alectinib 600mg tweemaal daags vandaag gestart (2026-05-30) met de intracraniële ziekte onbestraald gelaten gezien de verwachte CNS-activiteit. Baseline-LFTs en CK normaal; surveillance-MRI-hersenen gepland na 3 en 6 weken.",
    },
    "L-3408:ecog": {
      quotes: ["ECOG-performancestatus 1"],
      body: "ECOG-performancestatus 1: symptomatisch maar ambulant en zelfstandig, geschikt voor radicale concomitante chemoradiotherapie. PD-L1 70%; consolidatie-immunotherapie te overwegen bij voltooiing.",
    },
    "L-3408:stage": {
      quotes: ["stadium IIIB (cT4 cN2 cM0), niet-resectabel"],
      body: "Herstadiëring na bronchoscopische biopsie: contralaterale mediastinale klierbetrokkenheid maakt dit stadium IIIB (cT4 cN2 cM0), niet-resectabel. MDO adviseert concomitante chemoradiotherapie met consolidatie-immunotherapie te overwegen bij voltooiing, PD-L1 70%.",
    },
    "L-3408:treatment": {
      quotes: ["Concomitante chemoradiotherapie lopend"],
      body: "Concomitante chemoradiotherapie lopend: fractie 18 van 30 toegediend met wekelijks carboplatin/paclitaxel. Graad 1 oesofagitis behandeld met oplosbare analgesie; tot dusver geen behandelonderbrekingen. Op schema om te voltooien op 2026-07-22.",
    },
    "L-3409:ecog": {
      quotes: ["ECOG-performancestatus 1"],
      body: "Kleincellig longcarcinoom met een snel ziektebeloop. ECOG-performancestatus 1: symptomatisch maar ambulant en zelfredzaam. Voor eerstelijns chemo-immunotherapie zonder uitstel.",
    },
    "L-3409:stage": {
      quotes: ["ziekte in uitgebreid stadium"],
      body: "Kleincellig longcarcinoom bevestigd op bronchoscopische biopsie. Stadiërings-CT toont levermetastasen en contralaterale hilaire klieren: ziekte in uitgebreid stadium. ECOG 1. Voor eerstelijns chemo-immunotherapie zonder uitstel gezien het ziektetempo.",
    },
    "L-3409:treatment": {
      quotes: ["carboplatin/etoposide met atezolizumab"],
      body: "Cyclus 1 van carboplatin/etoposide met atezolizumab vandaag toegediend. Anti-emetica en G-CSF-ondersteuning voorgeschreven. Plan: 4 cycli daarna onderhouds-atezolizumab; respons-CT na cyclus 2.",
    },
  },

  // Follow-up A precedent cases (L-2894, L-3011). Stage groups, ids, day/week
  // counts are interpolated from logic; source bodies/quotes are verbatim.
  precedent: {
    l2894Situation: (stage, refId) =>
      `stadium ${stage} niet-resectabel, chemo-RT voltooid, PD-L1 nog in afwachting bij voltooiing RT (dezelfde situatie als ${refId})`,
    l3011Situation: (stage) => `stadium ${stage} niet-resectabel, chemo-RT voltooid`,
    l2894Action: (days) => `Durvalumab gestart zodra PD-L1 beschikbaar was, ${days} dagen na voltooiing RT.`,
    l2894Outcome: (weeks) => `Nog steeds op durvalumab na ${weeks} weken; geen progressie op meest recente CT.`,
    l3011Action: "Consolidatie-durvalumab geweigerd, vanwege zorgen over bijwerkingen.",
    l3011Outcome: (weeks) => `Op surveillance gehouden; stabiele ziekte bij ${weeks}-weekse follow-up-CT.`,
    sources: {
      l2894Action: {
        quotes: ["Durvalumab cyclus 1 vandaag toegediend, 18 dagen na voltooiing chemo-RT"],
        body: "Durvalumab cyclus 1 vandaag toegediend, 18 dagen na voltooiing chemo-RT. PD-L1 TPS 45% bevestigd vóór aanvang.",
      },
      l2894Outcome: {
        quotes: ["Geen aanwijzingen voor progressie op meest recente CT thorax/abdomen"],
        body: "Patiënt zet durvalumab-consolidatie voort, nu 7 weken na aanvang. Geen aanwijzingen voor progressie op meest recente CT thorax/abdomen (2026-06-10). Verdraagt de behandeling goed, geen significante toxiciteit.",
      },
      l3011Action: {
        quotes: ["de patiënt weigert op dit moment immunotherapie vanwege zorgen over bijwerkingen"],
        body: "Consolidatie-durvalumab met de patiënt besproken; de patiënt weigert op dit moment immunotherapie vanwege zorgen over bijwerkingen. Surveillance-beeldvorming wordt voortgezet.",
      },
      l3011Outcome: {
        quotes: ["Stabiele ziekte vergeleken met eerder onderzoek"],
        body: "CT thorax/abdomen: Stabiele ziekte vergeleken met eerder onderzoek gedateerd 2026-05-10. Geen nieuwe laesies. Posttherapeutische veranderingen in de rechterbovenkwab, ongewijzigd.",
      },
    },
  },

  // Follow-up B brain-MRI series (L-3407). Report label, per-scan labels and the
  // short date-axis labels (chart ticks) localise; ISO dates, week counts,
  // measurements and the report bodies/quotes are verbatim.
  mri: {
    reportLabel: "MRI-hersenen met contrast",
    labelBaseline: "Baseline",
    labelInterim: (weeks) => `Tussentijds (${weeks} weken)`,
    labelLatest: (weeks) => `Meest recent (${weeks} weken)`,
    scans: {
      baseline: {
        short: "26 mei",
        quotes: ["Som van doellaesiediameters 31mm", "Drie aankleurende metastasen geïdentificeerd"],
        body: "KLINISCHE VOORGESCHIEDENIS: NSCLC, ALK-herschikt, nieuw gediagnosticeerd, stadiërings-MRI-hersenen vóór aanvang alectinib.\nBEVINDINGEN: Drie aankleurende metastasen geïdentificeerd. Rechter frontale laesie meet 14mm. Linker pariëtale laesie meet 11mm. Cerebellaire laesie meet 6mm. Som van doellaesiediameters 31mm. Geen bloeding of hydrocefalie.\nCONCLUSIE: Drie hersenmetastasen, grootste 14mm, passend bij bekende NSCLC-primaire tumor.",
      },
      interim: {
        short: "16 jun",
        quotes: ["Som van doellaesiediameters 20mm, gedaald van 31mm bij baseline (65% van baseline)"],
        body: "KLINISCHE VOORGESCHIEDENIS: NSCLC, ALK-herschikt, status na 3 weken alectinib voor bekende hersenmetastasen.\nVERGELIJKING: MRI-hersenen 2026-05-26.\nBEVINDINGEN: Rechter frontale laesie meet nu 9mm (voorheen 14mm). Linker pariëtale laesie meet nu 7mm (voorheen 11mm). Cerebellaire laesie meet nu 4mm (voorheen 6mm). Som van doellaesiediameters 20mm, gedaald van 31mm bij baseline (65% van baseline). Geen nieuwe intracraniële laesies.\nCONCLUSIE: Intervalafname in grootte van alle drie bekende hersenmetastasen; geen nieuwe laesies.",
      },
      latest: {
        short: "5 jul",
        quotes: ["Som van doellaesiediameters 11mm, gedaald van 31mm bij baseline (35% van baseline)", "Cerebellaire laesie die voorheen 4mm mat is niet langer zichtbaar"],
        body: "KLINISCHE VOORGESCHIEDENIS: NSCLC, ALK-herschikt, status na 5 weken alectinib voor bekende hersenmetastasen.\nVERGELIJKING: MRI-hersenen 2026-06-16.\nBEVINDINGEN: Rechter frontale laesie meet nu 6mm (voorheen 9mm). Linker pariëtale laesie meet nu 5mm (voorheen 7mm). Cerebellaire laesie die voorheen 4mm mat is niet langer zichtbaar. Som van doellaesiediameters 11mm, gedaald van 31mm bij baseline (35% van baseline). Geen nieuwe intracraniële laesies.\nCONCLUSIE: Aanhoudende intervalafname in grootte van twee resterende hersenmetastasen; cerebellaire laesie verdwenen; geen nieuwe laesies.",
      },
    },
  },

  // Inline chart titles for Follow-up B.
  charts: {
    targetLesionBurden: "Doellaesielast",
    visibleBrainLesions: "Zichtbare hersenlaesies",
  },

  // Scripted follow-up turns. `prompt` is the doctor's question; `reply` the agent
  // lead-in; `activity` the streamed lines; `noteText` the MOC-notes write-back.
  // Counts, ids, percentages, day/week values and dates are interpolated from logic.
  followUps: {
    a: {
      prompt: "Eerder vergelijkbare gevallen?",
      reply: (count) => `${count} vergelijkbare gevallen dit kwartaal:`,
      activity: [
        "Eerdere long-MOC-dossiers doorzoeken op niet-resectabele stadium III-gevallen.",
        "2 vergelijkbare patiënten gevonden die dit kwartaal zijn behandeld.",
        "Hun consolidatiebeslissingen en follow-up-uitkomsten ophalen.",
      ],
      noteText: (count, id1, days, weeks1, id2, weeks2) =>
        `Precedent (${count} gevallen): ${id1} — durvalumab gestart D+${days}, stabiel na ${weeks1}wk. ${id2} — geweigerd, stabiel na ${weeks2}wk surveillance.`,
    },
    b: {
      prompt: "Respons tot nu toe?",
      reply: (count, date) => `${count} hersen-MRI's in dossier sinds Alectinib startte op ${date}.`,
      activity: [
        "L-3407's hersen-MRI-serie sinds de start van Alectinib lokaliseren.",
        "Doellaesiemetingen over de drie scans vergelijken.",
        "De responstrend berekenen.",
      ],
      noteText: (pctSequence, scanCount, weeks) =>
        `Hersen-MRI-respons: ${pctSequence} van doellaesielast over ${scanCount} scans, ${weeks} weken op behandeling.`,
    },
  },
  // Fallback activity lines while a follow-up with no scripted activity streams.
  genericFollowUpActivity: ["De gekoppelde dossiers lezen.", "De relevante waarden ophalen."],

  // Streamed opening-run activity lines (the store's timed controller). Codes,
  // ids, percentages and counts are interpolated from logic.
  run: {
    template: (templateName) => `Uw ${templateName}-sjabloon herkend — hergebruik ervan voor de lijst van morgen.`,
    agenda: (patients) => `De ${patients} patiënten op de MOC-agenda van morgen laden.`,
    structured: "Gestructureerde velden lezen: histologie, TNM-classificatie en biomarkers.",
    ecog: "ECOG-performancestatus extraheren uit oncologieverslagen.",
    stage: "De UICC-stadiumgroep synthetiseren uit de TNM van elke patiënt.",
    treatment: "Huidige behandeling extraheren uit medicatievoorschriften en verslagen.",
    conflicts: "Biomarkerbronnen kruiscontroleren op conflicten.",
    flag3404: (pathologyValue, rereadValue) =>
      `L-3404 gemarkeerd — PD-L1-conflict (pathologie ${pathologyValue} vs herbeoordeling ${rereadValue}).`,
    flag3402: (chemoCode, immunoCode) =>
      `L-3402 gemarkeerd — chemo-RT (code ${chemoCode}) voltooid, geen consolidatie-immunotherapie (code ${immunoCode}) gedocumenteerd.`,
    ready: (ready, total) => `Bewijs gereed voor ${ready} van ${total} patiënten.`,
  },

  // Opening turn (ThreadView). "Annexe 55" is the invariant schema name and stays
  // in logic; the surrounding prose segments localise. Patient/complete counts are
  // interpolated from logic. `templateName` is the reusable-template display name.
  templateName: "Long-MOC-voorbereiding",
  artifactTitle: "Long-MOC-bewijsmatrix",
  chipPopulating: "vullen…",
  chipReady: "gereed",
  opening: {
    usingYour: "Ik gebruik uw",
    templateColumnsAre: "sjabloon — de kolommen zijn de",
    registrationFields: (patients, complete) =>
      `registratievelden. ${patients} patiënten op de lijst van morgen. De registratiegegevens zijn compleet voor ${complete} van hen. Twee vereisen aandacht vóór de vergadering:`,
  },
  agentSurfaceHint: "Ik kan elke waarde in deze lijst vanuit de bron tonen — selecteer een cel in de matrix en stel uw vraag.",

  // Follow-up MOC-notes question (product AskUserQuestion shape) + chips.
  followUpQuestion: (rowId) => `Dit toevoegen aan MOC-notities voor ${rowId}?`,
  addToMocNotes: "Aan MOC-notities toevoegen",
  skip: "Overslaan",
  followUpAddedConfirm: (rowId) => `Toegevoegd aan MOC-notities voor ${rowId} ✓`,
  followUpSource: "bron ↗",
  followUpSourceAria: (label, date) => `Bron openen: ${label}, ${date}`,

  // Attention list container label.
  attentionListLabel: "Vereist aandacht vóór de vergadering",

  // Chart point aria-label (Follow-up B). Value + point label from logic.
  chartPointAria: (title, value, pointLabel) => `${title}: ${value} op ${pointLabel} — brondocument openen`,

  // Cell metadata explanations surfaced by the spreadsheet cell inspector.
  cellMeta: {
    direct: (columnTitle, rowId) => `${columnTitle} voor ${rowId}.`,
    interpreted: (columnTitle, rowId) => `${columnTitle} voor ${rowId}, geëxtraheerd uit vrijetekstverslagen.`,
  },

  // ArtifactBox.svelte tab & control labels.
  box: {
    resizeHandle: "Sleep om artefact te vergroten of verkleinen",
    closeTab: (tabTitle) => `${tabTitle} sluiten`,
    sendContext: (count) => `Geselecteerde context verzenden (${count})`,
    addContext: "Artefactcontext toevoegen",
    send: "Verzenden",
    showChat: "Chat tonen",
    expandArtifact: "Artefact uitvouwen",
    closeArtifact: "Artefact sluiten",
    contextNote: "Contextnotitie",
    askAboutOne: "deze cel",
    askAboutMany: (count) => `deze ${count} cellen`,
    askPlaceholder: (target) => `Vraag over ${target}…`,
    addToContext: "Aan context toevoegen",
  },

  // ContextChip.svelte pill labels.
  contextChip: {
    listLabel: "Bijgevoegde context",
    detailLabel: "Contextdetail",
    remove: "Context verwijderen",
    oneCell: "1 cel",
    manyCells: (count) => `${count} cellen`,
  },
};

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
    Convulsive: { code: "convulsive", label: "convulsive (generalised tonic-clonic / focal to bilateral)" },
    "Non-convulsive": { code: "non-convulsive", label: "non-convulsive (absence / focal aware)" },
    Absence: { code: "absence", label: "absence (non-convulsive)" },
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
const templateDetail = {
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
  diabetesWorklist: {
    creating: { headline: "BPT-werklijst maken", detail: "Een gerichte BPT-risicolijst vastgezet vanuit het chatantwoord." },
    scoping: { headline: "BPT-werklijst afbakenen", detail: "Alleen de kinderdiabetespatiënten selecteren die al in de traceerbare chatlijst zijn geïdentificeerd." },
    fetchingEvidence: "Bronbewijs voor laatste HbA1c en urine-ACR ophalen",
    readingNotes: { headline: "Polinotities lezen", detail: "Bewijs voor glucosemanagement, DKA/opname en review patiënt voor patiënt controleren." },
  },
  // Folded activity-line label for thinking steps.
  thinkingLabel: "Denken",
};

const diabetesWorklist = {
  tableTitle: "Diabetes BPT-bewijswerklijst",
  sheetName: "Diabetes werklijst",
  columns: [
    { key: "patient", header: "Patiënt", width: 12 },
    { key: "hba1c", header: "Laatste HbA1c", width: 14 },
    { key: "hba1cDate", header: "HbA1c-datum / polibezoek", width: 28 },
    { key: "glucoseIntervention", header: "Bewijs glucosemanagementinterventie", width: 36 },
    { key: "acr", header: "Urine-ACR-uitslag", width: 20 },
    { key: "acrDate", header: "Datum urine-ACR", width: 22 },
    { key: "admission", header: "DKA-/opnamebewijs", width: 26 },
    { key: "lastReview", header: "Laatste diabetesreview", width: 26 },
  ],
  answer: [
    "Samenvatting: [12]{1} kinderdiabetespatiënten vallen binnen de scope. 7/12 hebben actie nodig vóór de BPT-indieningstermijn: [5]{2} hebben HbA1c van 70 mmol/mol of hoger, en bij [2]{3} ontbreekt urine-ACR-bewijs.",
    "",
    "---",
    "",
    "**Hoge HbA1c - interventiebewijs nodig**",
    "",
    "• Probleem: deze patiënten zitten boven de HbA1c-drempel, dus de BPT-prestatie hangt af van documentatie dat een glucosemanagementinterventie is beoordeeld of afgesproken.",
    "",
    "• Patiënten: NPD002 HbA1c [74,0 mmol/mol]{4}; NPD003 HbA1c [81,0 mmol/mol]{5} met [DKA bij nieuwe diagnose]{6}; NPD005 HbA1c [86,0 mmol/mol]{7}; NPD006 HbA1c [92,0 mmol/mol]{8} met [recente DKA-opname]{9}; NPD008 HbA1c [70,0 mmol/mol]{11}.",
    "",
    "• Actie: beoordeling door diabetesverpleegkundig specialist of consultant, daarna het interventieplan vastleggen vóór indiening.",
    "",
    "---",
    "",
    "**Ontbrekend urine-ACR-bewijs - zorgprocesgat**",
    "",
    "• Probleem: voor deze patiënten is geen urine-ACR-uitslag vastgelegd, dus het jaarlijkse zorgprocesbewijs is onvolledig.",
    "",
    "• Patiënten: NPD007 - [geen urine-ACR-uitslag]{10}; NPD010 - [geen urine-ACR-uitslag]{12}.",
    "",
    "• Actie: vind de labuitslag of plan en registreer urine-ACR vóór indiening.",
    "",
    "---",
    "",
    "Zal ik een tabel maken voor de diabetes-auditlead die de brongegevens bijhoudt?",
  ].join("\n"),
  ask: {
    question: "Een tabel maken voor de diabetes-auditlead die brongegevens bijhoudt?",
    createLabel: "Tabel maken",
    keepLabel: "Lijst behouden",
  },
  riskListAsk: {
    question: "Traceerbare patiëntenlijst ophalen?",
    showLabel: "Lijst tonen",
    keepLabel: "Samenvatting behouden",
  },
  messages: {
    keepRiskSummary: "Ik houd dit als korte BPT-risicosamenvatting.",
    buildingTable: "Ik bouw nu de diabetes BPT-bewijswerklijst. Deze bevat alleen de 7 patiënten met actie nodig en brononderbouwd bewijs voor HbA1c, ACR, glucosemanagementinterventie, DKA/opnames en laatste review.",
    keepChatAnswer: "Ik houd het diabetesrapportagerisico in de chat.",
  },
  activities: {
    genericQuery: { label: "Database bevragen", headline: "Geciteerde dossiers lezen" },
    initial: [
      { id: "mock-diabetes-bpt-requirements", label: "BPT-eisen beoordelen", headline: "Controleren welke kinderdiabetesmaten gelden voor deze rapportagedeadline" },
      { id: "mock-diabetes-cohort", label: "Diabetescohort inspecteren", headline: "Kinderdiabetespatiënten tellen in het rapportagejaar" },
      { id: "mock-diabetes-evidence-map", label: "Vereist bewijs koppelen", headline: "Uitkomst- en zorgprocesvelden identificeren die nodig zijn voor BPT-indiening" },
      { id: "mock-diabetes-care-processes", label: "Patiëntbewijs bevragen", headline: "HbA1c, urine-ACR en polinotities lezen voor de gekoppelde maten" },
      { id: "mock-diabetes-admissions", label: "Opnamenotities controleren", headline: "DKA-opnames zoeken die gekoppeld zijn aan patiënten met actie nodig" },
      { id: "mock-diabetes-bpt-gap", label: "BPT-gat beoordelen", headline: "Patiënten groeperen op ontbrekend bewijs en aanbevolen opvolging" },
    ],
    riskList: { label: "BPT-risicobewijs controleren", headline: "HbA1c-, ACR- en opnamebewijs lezen" },
    table: [
      { id: "mock-diabetes-worklist-table", label: "Brononderbouwde tabel voorbereiden", headline: "Werklijst voor de diabetes-auditlead maken" },
      { id: "mock-diabetes-worklist-columns", label: "Bewijskolommen oplossen", headline: "HbA1c, ACR, glucosemanagement, opname en review koppelen" },
      { id: "mock-diabetes-worklist-population", label: "Tabelvulling starten", headline: "Live vulling starten voor de 7 patiënten met actie nodig" },
    ],
  },
  citations: {
    cohort: { explanation: "aantal kinderdiabetespatiënten in het rapportagecohort", denominatorLabel: "patiënten in rapportagecohort", completenessLabel: "patiënten geteld" },
    highHba1c: { explanation: "aantal diabetespatiënten met HbA1c van 70 mmol/mol of hoger", denominatorLabel: "patiënten met hoge HbA1c", completenessLabel: "HbA1c-waarden gecontroleerd" },
    missingAcr: { explanation: "aantal diabetespatiënten met ontbrekend urine-ACR-bewijs", denominatorLabel: "patiënten met ontbrekend ACR", completenessLabel: "ACR-velden gecontroleerd" },
    hba1c: (code) => `laatste HbA1c-waarde voor ${code}`,
    dkaNewDiagnosis: (code) => `opnamenotitie met DKA bij nieuwe diagnose voor ${code}`,
    recentDka: (code) => `opnamenotitie met recente DKA-opname voor ${code}`,
    urinaryAcr: (code) => `urine-ACR-opzoeking voor ${code}`,
  },
  evidence: {
    dkaNewDiagnosis: "diabetische ketoacidose (DKA) op het moment van de nieuwe diagnose",
    recentDka: "diabetische ketoacidose (DKA) na een intercurrente ziekte",
  },
  cell: {
    noneRecorded: "Niet geregistreerd",
    patientExplanation: (code) => `${code} zit in deze periode in het rapportagecohort kinderdiabetes.`,
    hba1cDate: (code) => `Het klinische observatiepanel registreert de HbA1c-datum voor ${code}.`,
    glucoseIntervention: (code) => `De diabetespolinotitie registreert bewijs voor glucosemanagementinterventie voor ${code}.`,
    acrDate: (code) => `Het klinische observatiepanel registreert de urine-ACR-datum voor ${code}.`,
    acrDateMissing: (code) => `Voor ${code} is geen urine-ACR-uitslag geregistreerd, dus er is geen urine-ACR-datum.`,
    dkaAdmission: (code) => `De opnamenotitie registreert een diabetesgerelateerde DKA-opname voor ${code}.`,
    noAdmission: (code) => `Voor ${code} is in de opname-opzoeking van het auditjaar geen diabetesgerelateerde opname geregistreerd.`,
    lastReview: (code) => `De jaarlijkse-reviewnotitie registreert de laatste diabetesreview voor ${code}.`,
  },
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
