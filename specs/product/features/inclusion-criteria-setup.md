# Dataset creation — free text → grounded filter

Read [library-and-sources.md](library-and-sources.md) and
[product-flows.md](../product-flows.md) first. This document specifies the **engine that turns a
plain-language description of a slice into a Dataset** — a saved, named filter over the hospital
database. The library doc owns the **UX** (the chips, the empty add-filter row, the sanity count,
the read-only SQL toggle); this doc owns the **grounding mechanics** behind it.

A Dataset is **purely a filter**: it scopes the hospital database to a slice and never copies or
owns data.

---

## What a Dataset stores

A Dataset is a set of grounded inclusion criteria over the hospital database. Per criterion:

```jsonc
{ "criterion_id": "diabetes_type", "label": "Diabetes type", "type": "category",
  "predicate": { "op": "=", "value": "1" },              // the stored code, not the word
  "display": "Diabetes type = Type 1",
  "sql": "registrations.diabetes_type_code = :diabetes_type",
  "params": { "diabetes_type": { "value": "1", "type": "category" } },
  "source": "npda-demographics -> registrations.diabetes_type_code" }
```

Plus the **composed cohort SQL** (all criteria `AND`ed over the cohort base) and a **cached
count**. Every criterion binds to a **real** `database → table.column`; nothing is faked.

---

## The flow

1. The user **describes the slice in plain language** — in the Dataset-creation chat element, or
   in the empty **add-filter row** for a single addition ([library-and-sources.md](library-and-sources.md)).
2. The system **grounds that text against the database filterable surface** — the `filterable`
   columns of every available `model.json`, with their types, allowed values, ranges, and
   **measured identity links** ([indexing-and-mapping.md](indexing-and-mapping.md)).
3. Each criterion binds to a real `database → table.column` with a **parameterised predicate**;
   a criterion spanning databases joins on **measured identity links** (read-only `ATTACH`).
4. **Validity is proved** by a real read-only `COUNT(DISTINCT <identity>)` at build time. A
   phrase that grounds to nothing is surfaced as **"not available"**, never invented.
5. The grounded criteria + composed SQL + count are **saved on the Dataset** (the data library)
   for reuse.

---

## Grounding mechanics

The derivation engine (`core/mapping/ground_default_criteria.py`, mirroring the column-grounding
pattern in `core/mapping/build_criteria.py`):

- **Input:** the free-text description + the selected databases' `model.json` (real tables,
  columns, `filter_type`, allowed `values` / `range`, `codes`, and the merged `foreign_keys[]` +
  `identity_links` facts).
- **The LLM call** (`core/clients/llm.py` `respond_typed`, closed-set schema): `table.column`
  constrained to **real** filterable columns; category values constrained to the column's **real
  allowed set** — so "type 1 diabetes" → the stored code `1`; "under 25 in the 2026/27 audit year"
  → a `date_of_birth` bound + a `visit_date` range. It returns `[{table, column, op, value(s),
  join_path}]`, with `join_path` **copied from the measured FK / identity facts — never invented**.
  A phrase matching no real column yields nothing — no free-text fabrication.
- **Deterministic post-step:** build each criterion's parameterised `sql` / `params`, validated by
  the read-only guard (`core/table_population/sql.py` `validate_sql` — `sqlglot`, `SELECT`/`UNION` only).
- **Validity proof:** compose the surviving predicates into a trial
  `SELECT COUNT(DISTINCT <identity>)` over the cohort base, **`ATTACH` the source SQLite files**
  read-only, and run it through the shared cross-database resolver. Criteria whose composed query
  errors are dropped (logged); only criteria that produce a real count are stored.

### Cross-database resolution
`core/filters/cohort.py` is a read-only **cross-database cohort resolver**: it `ATTACH`es the
source SQLite files read-only and composes predicates over the cohort, joining across databases on
**`identity_links`** / the executable's identity bridges (mirroring the agent runtime's existing
read-only multi-DB `ATTACH`). `core/filters/predicates.py` holds the predicate→SQL builders so the
semantics live once. The same resolver serves the build-time validity `COUNT` and run-time scoping.

---

## Structured-only (v1)

A slice expressible only from **free-text notes** — a concept no structured column carries (e.g.
"patients with a documented comorbidity") — is **not available** in v1: the creation element states
this boundary **up front**, so the user learns the limit before describing rather than after. The
honest mechanism (retrieve-then-judge: SQL narrows candidates, an LLM reads each candidate's notes
and decides inclusion with verbatim evidence) is **deferred** to the 100-day vision
([vision-100-days.md](../vision-100-days.md)).

### Follow-up job (deferred): unstructured-note filters

Add a v2 filter mode for criteria that are only present in free-text notes (for example, maternal
history mentioned only in narrative notes). The intended flow is explicitly two-step:

1. **Structured pre-filter (deterministic):** apply all structured Dataset criteria first to create
   the candidate cohort.
2. **Unstructured qualification (agentic):** for each candidate entity, run a note-reading pass
   over the relevant free-text fields and keep only entities where the criterion is satisfied, with
   traceable evidence for the inclusion/exclusion decision.

This remains out of v1 scope; v1 continues to surface these phrases as `not_available`.

---

## Editing a Dataset

- **Value edits are deterministic:** changing a chip's value rebinds the param, recomposes the SQL,
  and re-runs the `COUNT` — **no LLM call**.
- **Adding a criterion** runs the grounding call for **that phrase only** (the add-filter row).
- The **raw-SQL view is read-only** in v1; the chips and the add-filter row are the edit surface,
  so the user never writes SQL.

---

## How a Dataset scopes a run

At run time the Dataset's **already-grounded predicates** compose into the `executable` cohort
block (or scope the agent's queries directly, for an ad-hoc table). **Resolve once at definition,
consume at every run** — the slice's count equals the populated cohort, and a re-run never
re-resolves. See [table-population.md](table-population.md).

---

## Reuse (already-merged engine)

- **Within-database FK graph (#247/#252):** `model.json` carries `foreign_keys[]` (cardinality,
  declared/measured), `identity_links`, and per-table `grain`. Grounding reads real join paths from
  these facts; it never invents joins.
- **Cross-DB read-only `ATTACH` (#253):** the agent tools already `ATTACH` multiple SQLite files
  read-only into one connection, cohort-scoped via `identity_links` + to-one FK. The Dataset
  resolver mirrors / extracts this rather than inventing `ATTACH`.

---

## Acceptance

- A Dataset is created by describing a slice in plain language; each criterion binds to a **real**
  `table.column` with a parameterised predicate and is proved by a **real read-only `COUNT`**; an
  ungroundable phrase is surfaced as **"not available"**, never faked.
- A criterion spanning databases joins on **measured** identity links via read-only `ATTACH`; the
  count spans every database the filters touch.
- **Value edits re-derive deterministically** (no LLM); **adding** a criterion grounds that phrase;
  the raw-SQL view is read-only.
- At run time the Dataset's predicates scope **every** query; the previewed count equals the
  populated cohort.
- A criterion expressible only from free-text notes is **not available** in v1 and is stated as
  such up front, never silently dropped.

---

## Critical modules

- new `core/mapping/ground_default_criteria.py` (derivation engine), `core/mapping/build_criteria.py`
  (the pattern it mirrors)
- new `core/filters/predicates.py` + `core/filters/cohort.py` (cross-database resolver, extracted
  from the agent runtime's read-only `ATTACH`), `core/table_population/sql.py` (`validate_sql`)
- `core/clients/llm.py` (`respond_typed`), `model.json` `foreign_keys[]` / `identity_links` /
  filterable surface
- the Dataset surface in `app/` (the chips, add-filter row, count, SQL toggle —
  [library-and-sources.md](library-and-sources.md))
