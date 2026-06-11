---
name: cell-fill
description: Fill the empty cells of an audit worksheet with values found in a read-only clinical database. Each pending cell names a field and a patient; find that field's value for that patient and write it into the cell with a self-verifying source. Use whenever a run hands you pending cells to resolve.
metadata:
  boundary: cell-from-sql
---

# Cell Fill

You fill empty cells in an audit worksheet. Each cell asks for one **field** (e.g.
mode of delivery) for one **patient**. Find that value in the clinical database
and write it into the cell, **always** alongside a source — the SQL that
re-extracts the value next to the patient identity. Work the worksheet and the
databases the same way: by SQL, through `sql_execute`.

## Contract — do exactly this and nothing else

For each pending cell: find the value in the clinical data and write it back
with at least one source. A coded field's value must be one of its permitted
codes. If a value genuinely cannot be found, mark the cell blocked with a reason.
Stop when no pending cells remain.

**Allowed tools:** `sql_execute`, `lookup_execute`. Those are the only ways to run SQL
and the only ways to read field specs / database schemas.

**Never use these here:** anything else. You have **no** shell, no Python, no
generic file access — you cannot open or read any other file.

## When to use

- A run hands you pending cells to resolve.
- The values live in a read-only clinical database reached over SQL.
- A cell needs looking up, joining, or reading free text — not a plain copy.

## Tools

- `sql_execute(database, sql)` — run one SQL statement.
  - `database = "cells"` — the worksheet you fill (read + write).
  - `database = "<clinical-database-name>"` — read-only source of clinical data.
    Use the exact name as listed in the prompt; never a file path. **A run may
    bind several clinical databases** — the prompt lists every name. Different
    fields may live in different databases; query each by its own name, and use
    `lookup_execute({"database": "<name>"})` to see what each one holds.
  - **Write plain SQL.** Do not add cohort/patient filters or any other scoping
    — the tool injects them. Do not pass an identifier; the tool knows which
    run/cohort it is serving.
- `lookup_execute(...)` — read what a field expects or what a database holds.
  - `{"field": "<id>"}` — that field's type, permitted codes, notes.
  - `{"audit": true}` — every field's id + name.
  - `{"database": "<name>"}` — that database's table names.
  - `{"database": "<name>", "table": "<name>"}` — that table's columns.

## Steps

### 1. List the pending cells — `sql_execute`

```json
{"database": "cells", "sql": "SELECT ref, field, member, kind FROM cells WHERE state = 'pending'"}
```

Each row is one cell to fill: `field` is what it asks for, `member` is the
patient, `ref` is where to write the result (e.g. `ALL!T17`), and `kind` is
`direct` (a literal column read) or `interpret` (judged from free text).

### 2. Learn what the field expects — `lookup_execute`

```json
{"field": "delivery"}
```

returns the field's type, permitted codes, and notes. For a coded field, every
value you write must be one of the listed codes.

### 3. See where such a value lives — `lookup_execute`

```json
{"database": "cord-ph", "table": "cord_ph_birth_records"}
```

returns the table's columns. Use `{"database": "<name>"}` first if you don't yet
know which table to read.

### 4. Find the value in the clinical database — `sql_execute`

```json
{"database": "cord-ph", "sql": "SELECT patient_code, delivery FROM cord_ph_birth_records"}
```

The query returns rows for the audited patients only — the tool restricts the
results to the audited cohort, so you do not write any patient or cohort filter
yourself. You may batch — read a field for the whole worksheet in one query, then
write each cell.

### 5. Write the value into the cell, with a source — `sql_execute`

This is the only step that records a result, so it has the strictest rules. Every
write must:

- Set the `value` (or, for a missing value, set `state='blocked'` instead — see
  step 6).
- Set `state`, `confidence`, `resolved_by='agent'`, and a short `explanation`.
- **Set `sources` to a JSON array with at least one source.** A source is a JSON
  object: `{"database": "<name>", "query": "<sql>", "table_column": "<table.column>"}`,
  plus `"row_id"` + `"citations"` for a note (see below). The write is **rejected**
  if `sources` is empty. You do NOT repeat the patient identity on the source — it
  is the cell's `member` already; just make the `query` project it so the value is
  verifiable.

#### Direct value (read from a column)

```json
{"database": "cells", "sql": "UPDATE cells SET value='3', state='filled', confidence='high', resolved_by='agent', explanation='delivery = Forceps -> code 3', sources='[{\"database\":\"cord-ph\",\"query\":\"SELECT patient_code, delivery FROM cord_ph_birth_records WHERE patient_code = ''P001''\",\"table_column\":\"cord_ph_birth_records.delivery\"}]' WHERE ref='ALL!T17'"}
```

What makes the source good:

- The `query` returns the value **alongside the patient identity** — never a
  bare `SELECT delivery` with no `patient_code`. This is what lets a clinician
  click the cell and verify the value belongs to the right patient. (The cell's
  `member` is that identity; you don't store it again on the source.)

#### Interpreted value (judged from free text)

For an interpreted cell, set `state='needs_verification'` and put the verbatim
evidence **inside the source as `citations`** — a list of **exact substrings** of
the note that justify the value — alongside the note's `row_id` (its own primary
key, e.g. the note id or date). The source's `query` must project the patient
identity, that row identifier, and the source text — so a reviewer finds the
exact note. One source per note; one note can carry several citations.

```json
{"database": "cells", "sql": "UPDATE cells SET value='Patient declined dose increase', state='needs_verification', confidence='medium', resolved_by='agent', explanation='Note from 2024-03-12 for P042 documents the patient''s refusal — per the field instruction the documented reason is the patient''s own decision.', sources='[{\"database\":\"cord-ph\",\"query\":\"SELECT patient_code, note_id, note_date, note_text FROM clinician_notes WHERE patient_code = ''P042'' ORDER BY note_date\",\"table_column\":\"clinician_notes.note_text\",\"row_id\":\"note-2291\",\"citations\":[\"patient declined dose increase, prefers to retry diet first\"]}]' WHERE ref='ALL!G42'"}
```

Each citation must be an **exact substring** of the note text — not a paraphrase.
If the value draws on several notes, include **one source per note**, each with
its own `row_id` and `citations`, so every contributing note is highlighted.

### 6. When a value cannot be found — `sql_execute`

After a real search, if the value is not there, block the cell — never guess. A
blocked cell carries no `value` and no `sources`; it must carry `reason_code` +
`reason_detail`.

```json
{"database": "cells", "sql": "UPDATE cells SET state='blocked', reason_code='NOT_LOCATED', reason_detail='no delivery recorded for this patient (searched cord_ph_birth_records.delivery)' WHERE ref='ALL!T17'"}
```

## Rules

- `sql_execute` is the only way to run SQL; `lookup_execute` is the only way to read
  specs / schemas. You cannot open files or run shell/Python.
- Never add a cohort or patient filter — the tool injects scope. Clinical
  databases are read-only (SELECT only); the worksheet (`cells`) takes SELECT and
  UPDATE cells.
- A coded field's value must be one of its permitted codes. Do not invent values;
  a rejected write tells you the allowed codes — re-issue with the correct code.
- A filled or needs_verification cell **must** carry a non-empty `sources` array.
  The DB rejects a write that violates this with an explicit error — follow the
  instructions in the error to correct it. The patient identity is the cell's
  `member`; it is not repeated on the source.
- Address each written cell by its exact `ref` (e.g. `ALL!T17`).
- Do not fabricate. A value you cannot find is `blocked` with a reason, not a guess.

## Completion

When done, report status using one of:
- **DONE** — every pending cell is filled or blocked with a reason.
- **DONE_WITH_CONCERNS** — completed, but list cells written with low confidence.
- **BLOCKED** — cannot proceed; state the blocker and what was tried.
- **NEEDS_CONTEXT** — missing info; state exactly what is needed.

## What this skill does NOT do

- Open or edit files — cells are read and written only through `sql_execute`.
- Explore the filesystem or rediscover schema by guesswork — use `lookup_execute`.
- Write to or modify a clinical database — those are read-only.
