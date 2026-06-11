# Contract — model schemas and control-plane contracts

**Status: FROZEN (Plan · S0).** This directory holds the documented **JSON Schemas** (Draft
2020-12) for the three structured models the indexing/mapping/populate pipeline writes, plus
worked examples. Everything downstream — **A1.1** (writes `spec.json` + `model.json`),
**A2.1** (writes `mapping.json`), **A6.1** (writes `criteria_bindings`), and the E1/E2 golden +
eval checks — validates against these schemas.

**Storage:** where each artifact lives on disk and how it flows between phases is governed
by [`storage-layout.md`](./storage-layout.md). The file-name and path columns in the table
below reflect that contract.

Spec source: [mapping-artifact-redesign.md](../0ld/mapping-artifact-redesign.md) (PR #156),
especially [§3 The three models](../0ld/mapping-artifact-redesign.md#3-the-three-models) and
[§6 Defaults live in the field spec](../0ld/mapping-artifact-redesign.md#6-defaults-live-in-auditjson-the-field-spec-regenerates-around-them).
These supersede the old `audit.md` / `database.md` / `mapping.md` prose formats and the old
per-DB `filters.json` catalog.

| Schema | Model file | Owner | What it is |
| --- | --- | --- | --- |
| [`audit-spec.schema.json`](audit-spec.schema.json) | `var/audits/<id>/spec.json` | A1.1 | The **audit specification** — per-field spec + the audit's inclusion criteria. DB-agnostic. |
| [`database-model.schema.json`](database-model.schema.json) | `var/databases/<id>/model.json` | A1.1 | The **database model** — schema model + the per-column filterable surface. |
| [`mapping.schema.json`](mapping.schema.json) | `var/audits/<id>/mapping.json` | A2.1 + A6.1 | The **mapping** — audit↔database bindings: `identity`, `fields[]` (with `kind`), `criteria_bindings`, `fixed_criteria`, `database_summaries`, and the nested `executable` block. |
| [`runtime-events.schema.json`](runtime-events.schema.json) | SSE run stream (wire) | Run lane | The **strict-v2 run-stream events** — all seven payloads, machine-checkable (prose companion: [runtime-shapes.md](runtime-shapes.md) §1). |
| [`cell-resolution.schema.json`](cell-resolution.schema.json) | cells (store + wire `meta`) | Run lane | The **cell object + triage decision** every tier writes (prose companion: runtime-shapes.md §2). |
| [`model-config.md`](model-config.md) | `models.json` + `models.local.json` (repo root) | Platform | **Per-stage LLM model configuration** — stages, precedence, endpoint-readiness startup behaviour. *(Spec; implementation is Phase-4.)* |
| [`control-plane-schema-and-permissions.md`](control-plane-schema-and-permissions.md) | control-plane DB (logical) | Auth lane | Canonical IAM/catalog/runtime access model: tables, role permissions, resource grants, and DB-role boundaries. |

## The governing principle

> Deterministic structured **skeleton** (extracted mechanically — openpyxl / SQLite
> introspection / read-only profiling) **+ LLM-supplied semantics** (field meanings, bindings,
> `kind`), stored as **JSON**, with prose as string fields and **coded value sets as maps**
> (`code → meaning`). Storage format ≠ prompt format: we store JSON and render a clean view for
> the LLM (`{ "1":"Male","2":"Female" }` → `"1 = Male, 2 = Female"`).

## Two cross-cutting conventions

- **Coded sets are maps, never prose.** `permitted_values` (audit), `codes` (database column), and
  `code` (mapping field) are all `code → meaning` objects so the populate step can translate and the
  resolver can enumerate allowed values.
- **Regenerable vs. state.** `spec.json`'s **field spec** is regenerable, but its **user-set
  state** — `inclusion_criteria[].default`, and any library-added `notes`/`permitted_values` for a
  local template — is **preserved across re-index** (merged by `field.number` / `criterion.id`).
  `model.json` and `mapping.json` are **purely regenerable** (no user state;
  `default`s live only in `spec.json`).

## `references` convention

In `mapping.json`, every pointer at a real column is written as `"<database_id> -> <table>.<column>"`
(e.g. `"cord-ph -> patients.gender"`) so a multi-database audit is unambiguous.

## Validating

Each fenced `json` block below is preceded by a `<!-- validate: <schema> -->` marker naming which
schema it must satisfy. See [Verify](#verify) for the check.

---

## Worked example A — cord-pH `spec.json` (audit specification)

The local cord-pH EMR fixture as an audit specification. Note `default: null` everywhere (no
defaults are invented; they are learned per §6).

<!-- validate: audit-spec -->
```json
{
  "schema_version": "1",
  "audit": "cord-ph",
  "title": "Cord pH Audit",
  "version": "2026",
  "description": "Local cord-blood-gas audit: cord arterial pH/base-excess at birth, the resuscitation given, and the NICU course, for every birth record. Items drawn from the unit's cord-gas sampling guideline.",
  "grain": "one row per birth record",
  "source": { "template": "audit.xlsx", "spec_document": "Local cord-gas sampling guideline" },
  "sections": [
    { "id": "patient-details", "name": "Patient Details" },
    { "id": "delivery", "name": "Delivery & Birth" },
    { "id": "cord-gases", "name": "Cord Blood Gases" }
  ],
  "fields": [
    { "number": 1, "section": "patient-details", "cell": "A",
      "name": "Patient code", "type": "text",
      "notes": "Per-patient identifier for the birth record. Identity column for the row." },
    { "number": 4, "section": "patient-details", "cell": "D",
      "name": "Sex assigned at birth", "type": "category",
      "permitted_values": { "1": "Male", "2": "Female", "3": "Not specified", "99": "Unknown" },
      "notes": "Sex assigned at birth. 'Not Specified' means indeterminate; 'Unknown' means not recorded." },
    { "number": 12, "section": "delivery", "cell": "T",
      "name": "Mode of delivery", "type": "category",
      "permitted_values": { "1": "Spontaneous vaginal", "2": "Emergency caesarean", "3": "Forceps", "4": "Vacuum" },
      "notes": "Mode of delivery as recorded on the birth record." },
    { "number": 20, "section": "cord-gases", "cell": "AE",
      "name": "Cord arterial pH", "type": "number", "format": "9.99",
      "notes": "Cord arterial blood pH at birth. A value <= 7.00 flags significant acidosis for review." }
  ],
  "inclusion_criteria": [
    { "id": "gestation_weeks", "label": "Gestation (weeks)", "type": "number",
      "suggested": true, "default": null },
    { "id": "delivery", "label": "Mode of delivery", "type": "category",
      "suggested": true, "default": null },
    { "id": "admitted_to_nicu", "label": "Admitted to NICU", "type": "category",
      "suggested": true, "default": null }
  ]
}
```

## Worked example B — NPDA `spec.json` (national dataset → audit specification)

The **NPDA Core Dataset 2026** (RCPCH) items as the audit specification — the canonical shape
the audit-spec schema is taken from. Each item is `name · permitted_values · notes` (NPDA's
Notes + Justification + standard citation collapsed into one `notes`).

<!-- validate: audit-spec -->
```json
{
  "schema_version": "1",
  "audit": "npda",
  "title": "National Paediatric Diabetes Audit (NPDA) Core Dataset",
  "version": "2026/27",
  "description": "Core NPDA dataset for visits from 1 Apr 2026; items drawn from NICE NG18 + Best Practice Tariff.",
  "grain": "one row per patient visit/appointment",
  "source": { "template": "audit.xlsx", "spec_document": "NPDA Dataset 2026 (RCPCH)" },
  "sections": [
    { "id": "patient-details", "name": "Patient Details / Information" },
    { "id": "routine-measurements", "name": "Routine Measurements" },
    { "id": "annual-review-health-checks", "name": "Annual Review – Health Checks" }
  ],
  "fields": [
    { "number": 4, "section": "patient-details", "cell": "D",
      "name": "Sex assigned at birth", "type": "category",
      "permitted_values": { "1": "Male", "2": "Female", "3": "Not specified", "99": "Unknown" },
      "notes": "Sex assigned at birth. 'Not Specified' means indeterminate; 'Unknown' means not recorded. Collected to analyse the effect of sex on outcomes and to interpret height/weight/BMI/BP." },
    { "number": 16, "section": "routine-measurements",
      "name": "Patient Height (cm)", "type": "number", "unit": "cm", "format": "999.9",
      "notes": "At least one height/weight measurement during the audit year; plot on a growth chart to check for normal growth. [NG18: 1.2.46]" },
    { "number": 36, "section": "annual-review-health-checks",
      "name": "Albuminuria Stage", "type": "category",
      "permitted_values": { "1": "Normoalbuminuria", "2": "Microalbuminuria", "3": "Macroalbuminuria", "99": "Unknown" },
      "notes": "Submit your interpretation of the urinary albumin level based on local laboratory reference ranges. Mandatory if a level is submitted. (Interpretive — derived from a measurement.) [NG18: 1.2.119]" }
  ],
  "inclusion_criteria": [
    { "id": "diabetes_type", "label": "Diabetes type", "type": "category",
      "suggested": true, "default": null },
    { "id": "age_years", "label": "Age (years)", "type": "number",
      "suggested": true, "default": null }
  ]
}
```

## Worked example C — cord-pH `model.json` (database model)

The cord-pH EMR profiled into the schema model + filterable surface.

<!-- validate: database-model -->
```json
{
  "schema_version": "1",
  "database": "cord-ph",
  "title": "Cord pH EMR",
  "description": "Local EMR fixture. Births in `cord_ph_birth_records` (one row per baby); NICU course in `nicu_admissions`; demographics in `patients`; events in `encounters`; free-text in `clinical_notes`.",
  "tables": [
    { "name": "cord_ph_birth_records", "row_count": 10,
      "description": "One row per baby / birth record — the audit's primary entity.",
      "columns": [
        { "name": "patient_code", "type": "text", "description": "Per-patient identifier for the birth record.",
          "filterable": false, "reason": "identifier" },
        { "name": "delivery", "type": "text", "description": "Mode of delivery.",
          "filterable": true, "filter_type": "category",
          "values": ["Spontaneous vaginal", "Emergency caesarean", "Forceps", "Vacuum"] },
        { "name": "gestation_weeks", "type": "integer", "description": "Completed weeks of gestation at birth.",
          "filterable": true, "filter_type": "number", "range": { "min": 35, "max": 41 } },
        { "name": "admitted_to_nicu", "type": "text", "description": "Whether the baby was admitted to NICU.",
          "filterable": true, "filter_type": "category", "values": ["Yes", "No"],
          "codes": { "Y": "Yes", "N": "No" } }
      ] },
    { "name": "patients", "row_count": 10, "description": "Patient demographics.",
      "columns": [
        { "name": "id", "type": "text", "description": "Internal patient id.",
          "filterable": false, "reason": "identifier" },
        { "name": "gender", "type": "text", "description": "Recorded sex.",
          "filterable": true, "filter_type": "category", "values": ["M", "F"] },
        { "name": "birthdate", "type": "date", "description": "Date of birth.",
          "filterable": true, "filter_type": "date", "range": { "min": "2020-01-01", "max": "2026-03-31" } } ] },
    { "name": "clinical_notes", "row_count": 10, "description": "Free-text clinical notes.",
      "columns": [
        { "name": "text", "type": "text", "description": "Free-text clinical note.",
          "filterable": false, "reason": "free-text" } ] }
  ]
}
```

## Worked example D — cord-pH `mapping.json` (audit↔database bindings)

The cord-pH audit bound to the cord-pH EMR. `kind` is decided here; `code` operationalises each
field's encoding against the database; `criteria_bindings` is the backing search space.

<!-- validate: mapping -->
```json
{
  "schema_version": "1",
  "audit": "cord-ph",
  "databases": ["cord-ph"],
  "description": "Cord pH audit bound to the cord-ph EMR. Births in cord_ph_birth_records; NICU in nicu_admissions; dates via encounters; demographics via patients.",
  "identity": {
    "anchor": "cord-ph -> cord_ph_birth_records.patient_code",
    "grain": "one patient per birth record",
    "keys": ["cord-ph -> cord_ph_birth_records.patient_code"],
    "patient_grain_rule": "every criterion = this patient has >=1 matching row (EXISTS/IN over the anchor), never a count-inflating join"
  },
  "regions": [
    { "id": "ALL", "sheet": "ALL", "kind": "row_per_entity", "data_range": "A2:AQ500",
      "row_id": { "cell": "A", "header": "Patient code" } }
  ],
  "fields": [
    { "region": "ALL", "cell": "T", "header": "Mode of delivery", "kind": "direct",
      "sources": ["cord-ph -> cord_ph_birth_records.delivery"],
      "code": { "1": "Spontaneous vaginal", "2": "Emergency caesarean", "3": "Forceps", "4": "Vacuum" } },
    { "region": "ALL", "cell": "D", "header": "Sex assigned at birth", "kind": "direct",
      "sources": ["cord-ph -> patients.gender"],
      "code": { "1": "Male", "2": "Female", "3": "Not specified", "99": "Unknown" } },
    { "region": "ALL", "cell": "AE", "header": "Cord arterial pH", "kind": "direct",
      "sources": ["cord-ph -> cord_ph_birth_records.cord_arterial_ph"] }
  ],
  "criteria_bindings": [
    { "criterion_id": "delivery", "label": "Mode of delivery",
      "source": "cord-ph -> cord_ph_birth_records.delivery", "type": "category",
      "join_path": "direct column on the anchor row (no join)",
      "grain_rule": "the patient's birth record has this delivery value",
      "from": "audit_field+db_column" },
    { "criterion_id": "patient_birthdate", "label": "Patient age (date of birth)",
      "source": "cord-ph -> patients.birthdate", "type": "date",
      "join_path": "cord_ph_birth_records.baby_patient -> patients.id",
      "grain_rule": "the baby has a birthdate in the implied range (older-than-5y -> birthdate <= date(:as_of,'-5 years'))",
      "from": "db_column" }
  ],
  "not_expressible": [
    { "criterion_id": "clinical_concern", "label": "Documented clinical concern",
      "source": "cord-ph -> clinical_notes.text", "reason": "only in free-text; no structured column" }
  ]
}
```

---

## Verify

Each schema is a valid Draft 2020-12 schema, and every worked example above validates against the
schema named in its `<!-- validate: -->` marker. Re-check with Python's `jsonschema` by extracting
the `<!-- validate: <schema> -->` + fenced `json` pairs from this README and validating each against
the named schema (and meta-validating each schema against the Draft 2020-12 meta-schema).
