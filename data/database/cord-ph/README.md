# Cord pH at Birth Synthetic EHR Dataset

This directory contains a synthetic, de-identified EHR fixture for developing a CordPhLo audit workflow about umbilical cord blood gas health at birth.

The fixture is aligned to `data/templates/CordPhLo Data Collection spreadsheet (1).xlsm`. The workbook contains two header-only sheets:

- `ALL`: birth, intrapartum, delivery, Apgar, cord arterial gas, resuscitation, ward, and repeat-gas fields.
- `NICU`: neonatal unit admission, cooling, CFM, seizure, MRI injury, discharge, feeding, and neurology fields.

The files follow the same broad pattern as the Synthea-style fixtures:

- `patients.csv`: synthetic baby and mother demographics.
- `organizations.csv`: maternity and neonatal care settings.
- `providers.csv`: obstetric, midwifery, neonatal, and paediatric clinicians.
- `payers.csv`: simple coverage row.
- `encounters.csv`: delivery and neonatal encounters for 10 audit babies.
- `conditions.csv`: maternal, fetal, delivery, and neonatal diagnoses relevant to the audit.
- `observations.csv`: structured gestation, cord gas, Apgar, birthweight, resuscitation, repeat gas, and neonatal outcome observations.
- `procedures.csv`: delivery mode, CTG, cord gas sampling, cooling, CFM, MRI, and related procedures.
- `devices.csv`: ventilation and monitoring devices.
- `medications.csv`: neonatal resuscitation drugs and maternal antibiotics where relevant.
- `clinical_notes.csv`: free-text notes for extraction and validation testing.
- `cord_ph_birth_records.csv`: source maternity-system birth record containing the `ALL` sheet fields with source trace columns.
- `nicu_admissions.csv`: source neonatal-system admission record containing the `NICU` sheet fields with source trace columns.

Reporting period used by the fixture: `2026-04-01` to `2026-04-30`.

Realism notes:

- The 10 cases include term, late-preterm, emergency caesarean, instrumental, meconium, reduced fetal movements, PROM, chorioamnionitis, shoulder dystocia, placental abruption, uterine rupture, low cord pH, normal cord pH, missing cord gases, repeated gases, NICU admission, therapeutic cooling, seizures, MRI injury, and discharge neurology variation.
- Some values are deliberately missing, unknown, or source-conflicting. For example, one baby has no valid arterial cord gas recorded, one case has unknown fetal movement documentation, one repeat gas age is missing, and one CFM result conflicts between structured data and the note.
- All names, addresses, identifiers, notes, and clinical events are synthetic.

The audit workflow should treat `cord_ph_birth_records.csv` and `nicu_admissions.csv` as source system extracts, then validate against the lower-level clinical tables. Missing values must remain explicit rather than inferred.
