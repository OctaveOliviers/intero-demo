# NHS Paediatric Best Practice Tariffs — Research for the Demo Dashboards

*Prepared for a paediatrics Head of Department who wants to maximise their department's Best Practice Tariff (BPT) revenue. All criteria are taken from primary NHS England / RCPCH sources, cited inline. Scope is strictly paediatric — only BPTs and criteria relevant to a paediatrics department are included.*

---

## 1. Context: What a Best Practice Tariff is

A **Best Practice Tariff (BPT)** is a national price that NHS England sets *above* the ordinary tariff to reward providers who deliver care meeting a defined set of clinical-quality criteria. The intent is to "incentivise and adequately reimburse care that is both high quality and cost effective" in high-impact areas (high volume, high variation, or high outcome impact) where there is a strong evidence base and clinical consensus on best practice. [1][2]

**How it pays.** The exact mechanism varies by BPT, but the common patterns are:
- **Annual "year of care" payment per patient** (e.g. paediatric diabetes): the provider receives a fixed sum per child per year *only if* every criterion is met. [3]
- **Conditional top-up / base-plus-BPT split** (e.g. major trauma): a base price is paid regardless, plus a top-up paid only when the case is submitted to the registry and the care-process criteria are met. [3]
- **Tiered treatment-function-code (TFC) pricing** (e.g. paediatric epilepsy): activity coded to the BPT TFC (TFC 223) is paid at the higher best-practice price only if the unit demonstrates compliance; otherwise it falls back to the general paediatric price (TFC 420). SUS+ applies the epilepsy BPT automatically to activity coded to TFC 223. [3]

**Relationship to national clinical audits.** BPTs are validated through participation in the relevant **national clinical audit**. The audit is both the *evidence source* (it proves the criteria were met) and, in several cases, an explicit BPT criterion in its own right. For the flagship paediatric BPTs:
- **Paediatric diabetes → National Paediatric Diabetes Audit (NPDA)**, run by the RCPCH. Participation with quarterly data uploads is criterion (a) of the BPT. [3]
- **Paediatric epilepsy → Epilepsy12** (National Clinical Audit of Seizures and Epilepsies for Children and Young People), also run by the RCPCH and commissioned by HQIP under NCAPOP. Continuous full participation is criterion (a), and every other criterion maps to a specific Epilepsy12 service-descriptor or KPI. [3][6][7]
- **Paediatric major trauma → National Major Trauma Registry (NMTR, formerly TARN)**. The major-trauma-centre top-up is earned by submitting qualifying cases to the registry and meeting acute-phase care standards. [2][8]

**Current payment-system year.** The live framework is the **NHS Payment Scheme (NHSPS)**, which replaced the older "National Tariff Payment System." BPTs are governed by **Annex C / Annex DpC ("Guidance on best practice tariffs")**. The most recent published/consulted versions are the **2025/26 NHS Payment Scheme** (Annex C, and the consultation Annex DpC from which the precise paediatric criteria below are quoted) and the forthcoming **2026/27 NHSPS Annex C**. [1][2][3][4]

**Recent structural changes to flag:**
- The scheme is now a multi-year, fixed-element ("aligned payment and incentive" / API) model; for the year-of-care paediatric diabetes BPT the payment is *factored into the fixed element*, agreed up front between provider and commissioner against expected patient numbers, with **no in-year payment adjustments** — under-delivery is corrected in the *next* planning round. [3]
- The whole-population trauma audit **TARN was re-established by NHS England as the National Major Trauma Registry (NMTR) in 2024**, with data now flowing through the Outcome Registries Platform. The paediatric trauma dataset historically sat in "TARNLet." [8]
- The NPDA core dataset itself is being **revised effective 1 April 2026** (the 2026/27 dataset), which already encodes BPT-relevant items — this is the dataset our existing mock flow is built on (see §2).

---

## 2. Three recommended paediatric BPTs (one per dashboard)

Anchor the three demo dashboards on the two flagship, audit-backed paediatric BPTs plus one acute/whole-pathway BPT, because together they show range (chronic year-of-care, outpatient tiered, and acute top-up mechanisms) while staying entirely within paediatrics.

### Dashboard A — Paediatric Diabetes BPT (→ National Paediatric Diabetes Audit, NPDA)
- **Tariff name:** Paediatric diabetes BPT (Annex DpC §18). [3]
- **Audit it maps to:** National Paediatric Diabetes Audit (NPDA), RCPCH. [3][5]
- **Revenue mechanism:** Annual **year-of-care payment per patient** (ages 0 up to transfer at 19), paid only if *all* criteria (a)–(p) are met; covers diabetes-related outpatient and inpatient care. [3]
- **Why it's a strong demo:** It is the richest, most data-driven paediatric BPT — 16 criteria, several with explicit **≥90% completeness thresholds** and a hard **HbA1c ≥69 mmol/mol** policy trigger. The per-patient-per-year model makes "revenue at risk" trivially intuitive: every patient who fails a criterion is a whole year-of-care payment lost. It maps cleanly to per-patient database rows.

### Dashboard B — Paediatric Epilepsy BPT (→ Epilepsy12)
- **Tariff name:** Paediatric epilepsy BPT (Annex DpC §19), three levels; Level 2 = compliant (TFC 223), Level 1 = non-compliant fallback (TFC 420), Level 3 = non-mandated mental-health integration. [3]
- **Audit it maps to:** Epilepsy12, RCPCH. Compliance is *measured using the Epilepsy12 reporting tools*. [3][6][7]
- **Revenue mechanism:** **Tiered TFC pricing** — activity coded to TFC 223 is auto-paid at the best-practice rate by SUS+ *only* if Level-2 criteria (a)–(h) are demonstrably met; otherwise it drops to the general paediatric price (TFC 420). [3]
- **Why it's a strong demo:** It contrasts nicely with diabetes — here the money lever is a binary "are we Level 2 or do we fall back to TFC 420?" plus an upside "can we reach Level 3?". The Epilepsy12 KPIs (paediatrician within 2 weeks, MRI within 6 weeks, ESN within first year, etc.) are crisp time-window criteria that demo well as per-patient trackers. [7]

### Dashboard C — Paediatric Major Trauma BPT (→ National Major Trauma Registry / NMTR, formerly TARN)
- **Tariff name:** Major trauma BPT (Annex DpC §16, "Annual BPTs" list), paediatric major-trauma lens. [2]
- **Audit it maps to:** National Major Trauma Registry (NMTR, ex-TARN; paediatric data historically "TARNLet"). Major Trauma Centres receive the BPT top-up for cases submitted to the registry. [2][8]
- **Revenue mechanism:** **Best-practice top-up reimbursement** for qualifying major-trauma cases submitted to the audit, conditional on the acute-phase care standards in §3-C. Two levels: Level 1 (ISS ≥9) and the higher Level 2 (ISS ≥16). [10]
- **Why it's a strong demo:** It adds an *acute* dimension and a different money mechanic (per-case top-up tied to audit submission + acute-phase process timing), so the three dashboards don't all look the same.

### Reuse the existing NPDA flow? — **Yes. Reuse `npda-lo-audit` for Dashboard A.**
The codebase already contains a fully-built NPDA mock audit flow:
- `seed/audits/npda/spec.json` — a 59-field NPDA core dataset (2026/27 revision, effective 1 April 2026) with sections for patient details, routine measurements (HbA1c with the "every 3–4 months" note), the seven annual-review health checks, psychology, dietetics, and admissions. Several fields explicitly cite `[NHS England BPT]` (e.g. the dietitian additional-appointment field, the psychology additional-support field).
- `seed/audits/npda/mapping.json`, `seed/databases/npda-demographics/model.json`, `seed/databases/npda-clinical/model.json` — the backing mock databases.
- `scripts/eval_agent_npda.py`, mock content in `app/src/lib/mock/content/{en,de,fr,nl}.js`.

**Recommendation:** Reuse this NPDA flow as Dashboard A rather than rebuilding it. It already encodes exactly the BPT-relevant fields (HbA1c dates, the seven health checks, dietetic and psychological review, admissions/DKA) needed for the diabetes BPT trackers in §3-A, and it's already wired into the mock/eval pipeline — so Dashboard A is essentially free and battle-tested. Build **Dashboards B (epilepsy) and C (trauma) fresh**. This "1 reused + 2 fresh" split is the strongest demo: it shows the system generalising to *new* audits (epilepsy, trauma) while proving depth on the one we've already invested in.

---

## 3. Trackers and their database criteria

*The single authoritative tracker set — 21 trackers (8 / 7 / 6), each grounded in a real, revenue/compliance-relevant BPT criterion (no padding). Each row gives the exact DB criteria (fields · conditions · thresholds · time-windows · cohort/eligibility), a chart kind, and a citation; these drive the demo's mock dataset fields. Field names for Dashboard A map to `seed/audits/npda/spec.json`; Dashboards B and C are new mock datasets and their field names are the suggested mock schema.* **Cohort defaults:** *A = patients with `diabetes_type` recorded, age 0–18 (transfer at 19), `visit_date` ∈ audit year, scoped by `pdu_number`; B = CYP ≤18 with epilepsy diagnosis in their first year of care, coded to TFC 223; C = paediatric (<16) major-trauma cases at the MTC with ≥1 AIS3+ injury.*

### Dashboard A — Paediatric Diabetes BPT (NPDA) · 8 trackers

| # | Tracker (short name) | What it measures | Exact DB criteria (fields · conditions · thresholds · windows) | Chart | Cite |
|---|----------------------|------------------|-----------------------------------------------------------------|-------|------|
| A1 | **HbA1c ≥4×/yr coverage** | % of patients with ≥4 dated HbA1c results in the audit year (criterion j) | Count distinct `routine-measurements/hba1c_value` with non-null `routine-measurements/hba1c_date` ∈ audit year, per patient. **Per-patient pass:** count ≥ 4. **Cohort pass:** ≥90% of patients pass. Value handling: 3.98–<20 = %, 20–195 = mmol/mol. | donut | [3] |
| A2 | **7 NICE annual health checks** | Per-check completion of the seven annual checks (criterion k) | Each check needs a dated record ∈ audit year, eligibility age/type-conditional: BP `health-checks/systolic_bp`+`bp_observation_date` (≥age 12 T1 / dx T2); foot `foot_assessment_date` (≥12); retinal/eye `retinal_screening_date`+`retinal_screening_result` (≥12); urinary ACR `urinary_acr`+`acr_observation_date` (T1≥12 / T2 dx); cholesterol `total_cholesterol`+date (T2 dx); thyroid `thyroid_function_date` (all T1); coeliac `coeliac_screening_date` (within 90d of dx for new T1). **Per-patient pass:** every *applicable* check dated. | stat (per-check %) or donut | [3][5] |
| A3 | **MDT clinic ≥4/yr + ≥8 extra contacts** | % offered ≥4 MDT clinics and ≥8 additional contacts (criteria g & h) | Per patient: count clinic-appointment events (attendee-role flags `doctor`/`nurse`/`dietitian`/`psychologist`) ≥ 4 AND each visit seen by trained doctor + ≥1 other MDT member; count additional-contact events (`contact_type`) ≥ 8. **Cohort pass:** ≥90% each. (Contact/attendee table is the natural mock extension; NPDA spec models visits via `patient-details/visit_date`.) | stat / histogram (contacts dist.) | [3] |
| A4 | **Annual psychology assessment** | % assessed ≥annually for additional psychological-support need (criterion l) | `psychology/psychological_screening_date` non-null ∈ audit year → `psychology/additional_psych_support_needed`, `psychology/mental_health_appointment`. **Per-patient pass:** screening date present in audit year. | donut | [3] |
| A5 | **Additional dietitian appointment offered** | % offered ≥1 extra dietitian appointment/yr (criterion i) | `dietetics/dietitian_appointment_offered = Yes` (+ optional `dietitian_appointment_date`). **Per-patient pass:** offered = Yes. **Cohort pass:** ≥90%. | donut | [3] |
| A6 | **Carb-counting ≤14d of diagnosis (new T1)** | % of newly-diagnosed T1 with level-3 carbohydrate counting within 2 weeks (criterion f) | Cohort = new T1 in audit year. `dietetics/carb_counting_date − patient-details/diabetes_diagnosis_date ≤ 14 days`. **Per-patient pass:** carb-counting dated within 14d of dx. | donut | [3] |
| A7 | **High-HbA1c follow-up flag** | Patients with HbA1c ≥69 mmol/mol lacking required escalation (criterion o(i)) | Trigger: any `routine-measurements/hba1c_value ≥ 69 mmol/mol` ∈ audit year. **Flag as revenue-at-risk** if no escalation/policy-action event (care-plan-review field — to add in mock). Pair with DNA/WNB ("did not attend / was not brought") policy under o(ii). | stat (count at risk) / histogram (HbA1c dist.) | [3] |
| A8 | **Coeliac + thyroid screening at diagnosis (new T1)** | % of new T1 screened for coeliac & thyroid disease around diagnosis (criterion k subset) | Cohort = new T1 in audit year. `health-checks/coeliac_screening_date` within 90d of `diabetes_diagnosis_date` AND `health-checks/thyroid_function_date` recorded. **Per-patient pass:** both dated within the diagnosis window. | donut | [3][5] |

> **Unit-level binary badges (not per-patient KPIs), optional compliance strip:** (a) NPDA participation with **quarterly** uploads incl. PREM; (b) ≥**75%** MDT attendance at regional network meetings; (d) new diagnosis discussed with senior team member within **24 hours**; (e) seen by specialist core team by the **next working weekday**; (m) **24-hour** advice access; (n) transition policy in place; (p) annual offer of NICE-recommended self-management technology (CGM/pumps). [3]

### Dashboard B — Paediatric Epilepsy BPT (Epilepsy12) · 7 trackers

| # | Tracker (short name) | What it measures | Exact DB criteria (fields · conditions · thresholds · windows) | Chart | Cite |
|---|----------------------|------------------|-----------------------------------------------------------------|-------|------|
| B1 | **Paediatrician (epilepsy expertise) ≤2wk** | % seen by epilepsy-expert consultant paediatrician within 2 weeks of referral (KPI 1) | `first_paediatrician_assessment_date − referral_date ≤ 14 days` AND `clinician_expertise_flag = true`. **Per-patient pass** = both hold. | donut | [7] |
| B2 | **ESN input within first year** | % with epilepsy specialist nurse input in first year of care (KPI 2; criterion c, SD5) | `esn_input_date` non-null and ≤365 days after first assessment. Unit badge: `esn_employed`. **Per-patient pass** = ESN input dated within year. | donut | [3][7] |
| B3 | **MRI ≤6wk (where indicated)** | % of eligible CYP with MRI within 6 weeks of request (KPI 5) | Eligible only: `mri_indicated = true`. `mri_performed_date − mri_request_date ≤ 42 days`. **Per-patient pass** (eligible) = within 42d. Denominator = indicated cases only. | donut | [7] |
| B4 | **ECG in convulsive seizures** | % of CYP with convulsive seizures/epilepsy with an ECG by first year (KPI 4) | Eligible: `seizure_type = convulsive`. `ecg_performed_date` non-null within first year. **Per-patient pass** (eligible) = ECG dated. | donut | [7] |
| B5 | **Mental-health screening + support** | % screened for mental-health issues, and % with identified problems who got support (KPIs 6 & 7) | KPI 6: `mental_health_screening_date` / `mh_questionnaire_completed = true` documented within first year. KPI 7: where `mh_problem_identified = true`, `mh_support_provided = true`. **Per-patient pass** = screening documented (and support where flagged). | donut (or stacked stat for 6 vs 7) | [7] |
| B6 | **Comprehensive care plan by 12mo** | % with an agreed comprehensive care plan at 12 months (KPI 9a/9b; criterion d, SD27) | `care_plan_agreed_date` present by 12 months; `care_plan_individualised_document` (patient-held) and core components communicated (`care_plan_components_flag`). **Per-patient pass** = agreed plan by 12mo. | donut | [7] |
| B7 | **Valproate/topiramate safety (PPP)** | % of females ≥12 on valproate/topiramate with risk-ack form or PPP in first year (KPI 8) | Eligible: `sex = female` AND `age ≥ 12` AND (`on_valproate = true` OR `on_topiramate = true`). Pass: `risk_ack_form_date` non-null OR `ppp_in_place = true` within first year of care. **Safety-critical, high-visibility.** | donut (or stat: count at risk) | [7] |

> **Optional 8th tracker / unit badges:** KPI 10 — school individual healthcare plan for CYP **≥4** within 1 year of first assessment (`school_ihp_date`); KPI 3a — tertiary/CESS referral within first year where neurology-referral criteria met (`tertiary_referral_date`, eligibility-gated). Level-2 service-descriptor badges: (b) defined paediatric epilepsy clinical lead (SD4); (e) clinics allow **≥20 min** with expert consultant + ESN (SD6); (f) "young people" clinics (SD18); (g) agreed referral pathways ASD/ADHD/MH/tertiary/adult (SD23); (h) MH action plan where Level 3 not met (SD24). **Level-3 upside (criterion i):** integrated MH provision + joint MDT (SD24). [3][7]

### Dashboard C — Paediatric Major Trauma BPT (NMTR / TARN) · 6 trackers

*The major-trauma BPT pays a **two-level top-up**: Level 1 for ISS ≥9, Level 2 (higher) for ISS ≥16, each conditional on registry submission + the care-process standards below. Criteria and thresholds are from the West Yorkshire Major Trauma Network BPT/TQuIN summary [10] and a peer-reviewed paediatric-BPT validation study [11]; registry inclusion/timeframe from NMTR [8] and the Major Trauma Audit national report [12].*

| # | Tracker (short name) | What it measures | Exact DB criteria (fields · conditions · thresholds · windows) | Chart | Cite |
|---|----------------------|------------------|-----------------------------------------------------------------|-------|------|
| C1 | **Registry submission within 25 days** | % of qualifying cases with TARN/NMTR data completed & submitted ≤25 days of discharge (the BPT trigger) | Cohort = qualifying paediatric cases (≥1 AIS3+ injury; for <16s any LOS from 01.01.2026). `nmtr_submitted_flag = true` AND `dataset_complete_flag = true` AND `submission_date − discharge_date ≤ 25 days`. (25 days is the BPT window for revenue; 40 days is the registry's general operational target.) | donut + stat (median days) | [10][12] |
| C2 | **Consultant-led trauma-team reception ≤5 min** (Level 2) | % of direct-admission/emergency-transfer cases received by a consultant-led trauma team, consultant present within 5 min of arrival | `trauma_team_activated = true` AND `consultant_present = true` AND `consultant_arrival_time − ed_arrival_time ≤ 5 min`. Level-2 (ISS ≥16) criterion. **Per-case pass** = all hold. | donut | [10] |
| C3 | **CT head ≤60 min (GCS ≤13 head injury)** (Level 2) | % of eligible head-injury cases with CT head within 60 min of arrival | Eligible: head injury AIS 1+ AND (`gcs ≤ 13` OR `prehospital_intubated = true`). `ct_head_time − ed_arrival_time ≤ 60 min`. **Per-case pass** (eligible) = within 60 min. | donut | [10] |
| C4 | **Tranexamic acid ≤1 h** (Level 2) | % of eligible cases given TXA within 1 hour | Eligible per major-haemorrhage/TXA indication. `txa_given = true` AND `txa_time − incident_time ≤ 60 min` (or arrival at MTC for self-presentations). **Per-case pass** (eligible) = within window. | donut | [10] |
| C5 | **Airway considered ≤30 min (GCS <9)** (Level 1) | % of GCS<9 cases with documented evidence intubation considered within 30 min | Eligible: `gcs < 9`. `intubation_considered_documented = true` AND `≤ 30 min` of arrival. **Per-case pass** (eligible) = documented within 30 min. | donut | [10] |
| C6 | **Rehabilitation prescription (ISS ≥9)** (Level 1) | % of ISS ≥9 cases with rehab needs assessed + rehab prescription issued | Cohort = `iss ≥ 9`. `rehab_needs_assessed = true` AND `rehab_prescription_issued = true` with core components on TARN/NMTR AND evidence to patient + GP + ongoing-care provider. **Per-case pass** = all hold. | donut | [10] |

> **Eligibility / inclusion:** NMTR includes patients with **≥1 AIS3+ injury** admitted >3 overnight stays *or* to critical care (any length) *or* who died; **children <16 are includable with an AIS3+ injury and any length of stay from 01.01.2026** [8]. The BPT keys off **ISS ≥9** (Level 1) and **ISS ≥16** (Level 2) [10]; a paediatric study found an **ISS >8** cut-off had ~90% sensitivity for BPT eligibility in children [11].

---

## 4. National audit submission deadlines

*The deadline by which a provider must submit data for the audit year (or per case). These gate BPT validation. Used for the deadline shown on each dashboard card and audit page.*

### A — NPDA (Paediatric Diabetes)
- **Audit year:** 1 April → 31 March (the 2026/27 year runs **1 Apr 2026 – 31 Mar 2027**). [13]
- **Final annual submission deadline (2026/27):** **16 April 2027.** [13]
- **Quarterly upload windows** (criterion (a) requires quarterly uploads incl. PREM): Q1 (Apr–Jun) → **7 Jul 2026**; Q2 (Jul–Sep) → **7 Oct 2026**; Q3 (Oct–Dec) → **15 Jan 2027**; Q4 (Jan–Mar) → **16 Apr 2027**. [13]
- *(Dates shift slightly year to year — read the current data-submission page.)* [13]

### B — Epilepsy12 (Paediatric Epilepsy)
- **Cohort definition (by census, not a single date):** a rolling 12-month cohort by **first paediatric assessment** date. **Cohort 8 = first paediatric assessment between 1 Dec 2024 and 30 Nov 2025**, first-year-of-care data entered over the following year. [14]
- **Annual data-submission deadline:** **12 January 2027** for the current cohort (Cohort 8). *(Cohort 7 was 13 January 2026 — cadence is ~mid-January, ~6 weeks after the 30 Nov cohort-close.)* [14]
- **Cadence summary:** annual cohort; census closes **30 November**; submission due **~mid-January** of the following year. [14]

### C — NMTR / TARN (Major Trauma)
- **Per-case, not an annual census.** Each qualifying case must be **completed and submitted within 25 days of discharge** to earn the BPT top-up (the registry's general operational target is 40 days; the demo tracks the 25-day revenue window). [10][12]
- **Inclusion:** patients with **≥1 AIS3+ injury** admitted >3 overnight stays *or* to critical care (any length) *or* who died; **children <16 includable with an AIS3+ injury and any length of stay from 1 Jan 2026.** [8][15]
- **For the dashboard:** trauma has no annual calendar deadline — show the per-case window verbatim ("Submit ≤25 days of discharge").

---

## 5. Sources

1. NHS England — *2025/26 NHS Payment Scheme – Annex C: Guidance on best practice tariffs* (long-read). https://www.england.nhs.uk/long-read/25-26-nhsps-annex-c-guidance-on-best-practice-tariffs/
2. NHS England — *2026/27 NHS Payment Scheme – Annex C: Guidance on best practice tariffs* (PDF; full BPT list incl. Paediatric diabetes, Paediatric epilepsy, Major trauma). https://www.england.nhs.uk/wp-content/uploads/2026/03/26-27NHSPS-Annex-C-Best-practice-tariffs.pdf
3. NHS England — *2025/26 NHS Payment Scheme – a consultation notice: Annex DpC: Guidance on best practice tariffs* (PDF; §18 Paediatric diabetes criteria a–p, §19 Paediatric epilepsy Levels 1–3 / criteria a–i). https://www.england.nhs.uk/wp-content/uploads/2025/01/25-26NHSPS-Consultation-Annex-DpC-Best-practice-tariffs.pdf
4. NHS England — *2025/26 NHS Payment Scheme* (publication landing page). https://www.england.nhs.uk/publication/2025-26-nhs-payment-scheme/
5. NHS England — *Children and Young Adults (0 to 25 years) diabetes toolkit* (BPT section: ≥4 clinic appointments/year, ≥1 dietitian appointment, year-of-care per-patient payment, 0–19 scope). https://www.england.nhs.uk/long-read/children-and-young-people-diabetes-toolkit/
6. NHS England — *National bundle of care for children and young people with epilepsy: annex 1* (Epilepsy12 performance indicators, NICE NG217 / QS211 alignment). https://www.england.nhs.uk/long-read/national-bundle-of-care-for-children-and-young-people-with-epilepsy-annex-1/
7. RCPCH Epilepsy12 — *Key Performance Indicators* (KPI 1 paediatrician ≤2 weeks, KPI 2 ESN first year, KPI 5 MRI ≤6 weeks, KPI 8 valproate/topiramate risk-acknowledgement/PPP, KPI 9a comprehensive care plan, KPI 10 school healthcare plan). https://e12.rcpch.ac.uk/docs/development/key-performance-indicators/
8. NHS England — *National Major Trauma Registry (NMTR)* (TARN re-established as NMTR in 2024; major-trauma-centre BPT top-up linked to audit submission; TARNLet paediatric dataset). https://www.england.nhs.uk/outcomes-and-registries-programme/nmtr/
9. Diabetes UK — *Paediatric best practice tariff* (BPT introduced 2011/12; year-of-care tariff). https://www.diabetes.org.uk/node/1734
10. West Yorkshire Major Trauma Network — *BPT & TQuINs* (Level 1 ISS ≥9 / Level 2 ISS ≥16; TARN submission ≤25 days of discharge; rehab prescription; consultant trauma-team ≤5 min; CT head ≤60 min for GCS ≤13; TXA ≤1 h; airway considered ≤30 min for GCS <9). https://www.wymtn.com/bpt--tquins.html
11. Ravindra Lakshman et al. — *Validity of the Best Practice Tariff in paediatric major trauma* (Injury, 2020; ISS >8 cut-off ~90% sensitivity for BPT eligibility). https://pubmed.ncbi.nlm.nih.gov/32571548/
12. National Major Trauma Audit / TARN — *Major Trauma Audit National Report 2022* (data should be submitted within 40 days of discharge; incident→discharge dataset). https://d7g406zpx7bgk.cloudfront.net/x/a077abe57d/major-trauma-audit-national-report-2022-final.pdf
13. RCPCH — *National Paediatric Diabetes Audit (NPDA): data submission* (audit year 1 Apr–31 Mar; 2026/27 final deadline 16 April 2027; quarterly windows). https://www.rcpch.ac.uk/resources/national-paediatric-diabetes-audit-data-submission
14. RCPCH — *Epilepsy12 audit: methodology and data submission* (Cohort 8 = first paediatric assessment 1 Dec 2024–30 Nov 2025; submission deadline 12 January 2027). https://www.rcpch.ac.uk/work-we-do/clinical-audits/epilepsy12/methodology-data-submission
15. NHS England — *NMTR: about data collection* (inclusion = ≥1 AIS3+ injury with >3 overnight stays or critical care or death; children <16 includable with AIS3+ and any LOS from 01.01.2026). https://www.england.nhs.uk/outcomes-and-registries-programme/nmtr/about-data-collection/

### Repository asset referenced (for reuse decision)
- `seed/audits/npda/spec.json` — NPDA core dataset 2026/27 (59 fields; HbA1c, seven annual health checks, psychology, dietetics, admissions/DKA; several fields tagged `[NHS England BPT]`). Backing files: `seed/audits/npda/mapping.json`, `seed/databases/npda-demographics/model.json`, `seed/databases/npda-clinical/model.json`. Mock/eval wiring: `scripts/eval_agent_npda.py`, `app/src/lib/mock/content/{en,de,fr,nl}.js`.
