# Acute Sore Throat Audit Synthetic EHR Dataset

This directory contains a synthetic, de-identified EHR fixture for developing an acute sore throat clinical audit workflow.

The fixture is aligned to `Acute Sore Throat Audit V10.xlsx`. The workbook expects 20-40 acute sore throat consultation records and asks the auditor to enter `1` or `0` for criteria A-M in the `Input data` sheet.

The files are intentionally shaped like the Synthea CSV exports in `database/synthea-data/csv` so they can later be loaded into SQLite with the same CSV-to-table pattern:

- `patients.csv`: synthetic patient demographics.
- `organizations.csv`: local care settings.
- `providers.csv`: clinicians linked to organizations.
- `payers.csv`: simple payer/coverage rows.
- `encounters.csv`: 24 in-period acute sore throat consultations plus non-audit encounters.
- `conditions.csv`: coded diagnoses and audit-relevant comorbidities.
- `observations.csv`: structured signs, symptoms, scores, tests, documentation flags, and some missing values.
- `medications.csv`: prescribed and delayed antibiotic records, including dose, frequency, course length, prescription type, and advice flags.
- `procedures.csv`: testing and leaflet-sharing procedures.
- `allergies.csv`: coded allergies that affect prescribing.
- `clinical_notes.csv`: free-text clinical notes for extraction and validation testing.
- `sore_throat_assessments.csv`: a source EHR consultation-template table containing FeverPAIN/Centor scores, antibiotic plan, advice flags, and data-quality flags.

Reporting period used by the fixture: `2026-01-01` to `2026-03-31`.

The source tables should be used to derive the workbook rows:

- A: `sore_throat_assessments.SCORE_TOOL_USED`.
- B-D: score fields plus antibiotic plan and medication rows.
- E: derived by the audit workflow from score, clinical context, antibiotic strategy, and documented exceptions.
- F-J: advice fields in `sore_throat_assessments`, `observations`, `procedures`, and `clinical_notes`.
- K-M: medication choice, dose/frequency, and course length from `medications`, checked against allergies and pregnancy status.

Realism notes:

- Several cases are straightforward and complete.
- Some cases have missing temperature, no scoring tool, undocumented natural-history advice, unknown safety-netting, or missing delayed-prescription access advice.
- Some values are deliberately contradictory or require human review, for example a free-text note references a delayed prescription while the medication module has no antibiotic order.
- The dataset includes children, adults, older adults, pregnancy, immunosuppression, asthma, penicillin allergy, antibiotic choice errors, dose/frequency errors, course-length errors, and non-audit encounters.
- All names, addresses, identifiers, notes, and clinical events are synthetic.

`audit_case_index.csv` and `audit_field_codebook.csv` are intentionally not included. They were useful as scaffolding while the exact workbook was unavailable, but they pre-package audit abstraction rather than representing source EHR data. Keeping the fixture as raw EHR-style tables makes the extractor prove its work against the template.
