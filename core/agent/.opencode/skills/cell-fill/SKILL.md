---
name: cell-fill
description: Fill the empty cells of an audit worksheet with values found in a read-only clinical database. Work column-first - one field (worksheet column) usually fills from one source column in one pass; drop to cell-by-cell only for partially-filled columns and free-text interpretation. Every write carries a self-verifying source. Use whenever a run hands you pending cells to resolve.
metadata:
  boundary: cell-from-sql
---

# Cell Fill

You fill empty cells in an audit worksheet. Each cell asks for one **field** (e.g.
mode of delivery) for one **patient** — but the unit of work is the **column**,
not the cell: a field is one worksheet column, and one source column usually
fills it for every patient at once. Find each field's values in the clinical
database and write them into the cells, **always** alongside a source — the SQL
that re-extracts the value next to the patient identity. Work the worksheet and
the databases the same way: by SQL, through `sql_execute`.

## Contract — do exactly this and nothing else

Triage the pending work by field, then work **column-first**: fill each empty
column from its one source in one pass, then resolve the partially-filled
columns' stragglers, then the free-text interpretation cells. Every filled cell
carries at least one source. A coded field's value must be one of its permitted
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
    `lookup_execute({"database": "<name>"})` to see what each one holds. **You may
    read ANY bound clinical database**, and a single query may join across them
    (see "Reaching another database" below).
  - **Write plain SQL.** Do not add cohort/patient filters or any other scoping
    — the tool injects them, bounding every table to the cohort (directly, or
    through the map's bridges/joins). Do not pass an identifier; the tool knows
    which run/cohort it is serving. **One statement only** — never write `ATTACH`,
    `PRAGMA`, or DDL; the tool wires the databases together for you.
- `lookup_execute(...)` — read what a field expects or what a database holds.
  - `{"field": "<id>"}` — that field's type, permitted codes, notes. The `<id>`
    is the **full canonical slug** (e.g. `patient-details/ethnic_category`), not a
    short name (`ethnic_category`). If a lookup misses, it suggests the closest
    canonical id — re-issue with that id; do not guess other variants.
  - `{"audit": true}` — every field's id + name.
  - `{"database": "<name>"}` — the database digest: per-table grain + row counts,
    the foreign-key/identity join graph, and conventions.
  - `{"database": "<name>", "table": "<name>"}` — that table's columns.
  - When a value lives in a table you must reach by a join, read the digest's
    `foreign_keys` (within a database) and `identity_links` (across databases) and
    follow that measured graph to write the join — never guess a join from column
    names.

### Reaching another database

A field's data may live in a database other than the one a visit is anchored in
(e.g. patient demographics, or a registration/diagnosis narrative, in a separate
database). You can read it. Address that database by its own name with
`sql_execute`, or reach it from another in **one** query: qualify a table in a
different bound database as `"<database-name>".<table>` and join on the linking
column. The tool bounds every table to the cohort for you — including the foreign
one, translated through the map — so write the join, not the scope.

To know which column links two databases (and which columns join tables within
one), read `lookup_execute({"database": "<name>"})`: its `identity_links` give the
cross-database bridges (this database's column = a sibling database's key) and its
`foreign_keys` give the within-database joins. Follow that measured graph — never
guess a cross-database key from column names. If the tool reports a table cannot
be scoped to the cohort, it is not reachable through the map from a cohort table;
pick a table the `identity_links`/`foreign_keys` do connect.

## Steps

**The routine — follow it, do not re-derive it.** Per field/column, in order:

1. Look up the field spec **once**, with the full canonical id
   (`lookup_execute {"field": "patient-details/ethnic_category"}`). If it misses,
   re-issue with the id it suggests — never guess other variants.
2. From the field spec + the database map (`lookup_execute {"database": …}`),
   list the **distinct plausible sources** for the field — every table/column/
   database where its value could live (e.g. a structured column, a clinical
   note, a second database). There is usually more than one.
3. Query those sources for the column's members.
4. For each member: **fill** it if the value is found, else **block it with a
   reason**. **Fill before you block** — never run a column-wide
   `state='blocked'` before the fills; block only the members genuinely empty
   *after* the fill attempt. (A block-first UPDATE leaves the fill matching 0
   rows and wrongly blocks the whole column.)
5. **Block a cell only once you have checked every distinct plausible source for
   it and none has the value.** A miss in the first source is NOT a reason to
   block — try the other plausible sources first.

**Retrying — what counts and what doesn't.** A query that comes back with an
**error** (malformed SQL, wrong column/table name, bad syntax) has checked
*nothing* — fix it and re-run it against the same source; that is correct, not
thrashing. A query that **ran successfully and returned no value** *has* checked
that source — don't re-run the identical query; move to the next plausible
source. Block a cell only after every distinct plausible source has been
**successfully queried** and missed.

The cap is on **wasted** work, not on breadth or on error-recovery: don't re-run
an identical query that already executed, and don't re-decide a question you've
already settled or loop without new information — but DO fix-and-retry an errored
query, and DO check every genuinely-different source before blocking. The spec +
map bound the number of sources, so this terminates on its own. Decide and write;
don't narrate "on one hand… but the rules say…" — the rules are here, apply them.

### 1. Triage the work by column — `sql_execute`

The prompt carries a triage of the pending work by field: **EMPTY** columns (no
member has a value — Phase A), **PARTIAL** columns (earlier tiers filled the
rest — Phase B), and **INTERPRET** cells (free text — Phase C). Work the phases
in that order. Re-derive the picture any time with:

```json
{"database": "cells", "sql": "SELECT field, kind, SUM(state = 'pending') AS pending, COUNT(*) AS total FROM cells GROUP BY field"}
```

And list one column's open cells (with what earlier tiers learned) with:

```json
{"database": "cells", "sql": "SELECT ref, member, hypothesis FROM cells WHERE field = 'delivery' AND state = 'pending'"}
```

`member` is the patient, `ref` is where the result goes (e.g. `ALL!T17`), and
`hypothesis` is why the earlier, cheaper pass failed — read it before searching.

### 2. Phase A — fill each EMPTY column from one source

For each EMPTY column, once:

1. Learn what the field expects — `lookup_execute {"field": "delivery"}`
   returns the field's type, permitted codes, and notes. For a coded field,
   every value you write must be one of the listed codes.
2. See where such a value lives — `lookup_execute {"database": "cord-ph"}`
   returns the digest (per-table grain, the foreign-key/identity join graph,
   conventions); then `{"database": "cord-ph", "table": "<name>"}` for the
   columns. Pick the column that holds the field's value, and if it sits in a
   non-anchor table, use the digest's `foreign_keys`/`identity_links` to write
   the join.
3. Read the whole column in **one** query — the tool restricts results to the
   audited cohort, so you get exactly the rows you need:

```json
{"database": "cord-ph", "sql": "SELECT patient_code, delivery FROM cord_ph_birth_records"}
```

4. Write the whole column in **one** UPDATE — a `CASE` over `member`, one
   shared source (the column-wide query that re-extracts every value next to
   the patient identity), and a `member IN (...)` that lists **exactly** the
   members the `CASE` covers (never let an uncovered member catch a NULL):

```json
{"database": "cells", "sql": "UPDATE cells SET value = CASE member WHEN 'P001' THEN '1' WHEN 'P002' THEN '3' END, state='filled', confidence='high', resolved_by='agent', explanation='delivery read from cord_ph_birth_records.delivery, codes per field spec', sources='[{\"database\":\"cord-ph\",\"query\":\"SELECT patient_code, delivery FROM cord_ph_birth_records\",\"table_column\":\"cord_ph_birth_records.delivery\"}]' WHERE field='delivery' AND state='pending' AND member IN ('P001','P002')"}
```

   For a large cohort, chunk the `CASE` (about 20 members per statement). If
   the write is rejected because one member's value is off-code, fix that
   member's code (the error names the allowed codes) — or split that member
   into its own statement — and re-issue; a rejection aborts the whole
   statement, no cell is half-written.

   **Read broad, write narrow.** Keep reading the column in one broad query —
   that is efficient and correct. You attach the same column-wide query as the
   shared source, and the tool **narrows each cell's stored source to that cell's
   own member** (`… WHERE patient_code = '<member>'`), so clicking a cell shows
   only that patient's row — never the whole column. You don't write the per-cell
   filter; the tool adds it.

5. **Only after the fill UPDATE has run**, block the members the source query
   did not return — **in one statement** the same way (see §6), with
   `member IN (...)` listing exactly those absentees. Never block the column
   first: a block-before-fill leaves your fill matching 0 rows.

### 3. Phase B — resolve the PARTIAL columns' stragglers

Earlier tiers already filled most of these columns, and the filled cells say
where the data lives. For each PARTIAL column:

1. Read a filled sibling's source — no schema exploration needed:

```json
{"database": "cells", "sql": "SELECT sources FROM cells WHERE field = 'delivery' AND state = 'filled' LIMIT 1"}
```

2. Re-run that source's query against its database and look for the pending
   members. Whatever it returns, write (batch the write as in Phase A if
   several members resolve).
3. For members it does not return, read their `hypothesis`, search the other
   plausible tables/databases once, then write or block. The stragglers are
   stragglers for a reason — a genuine gap is `blocked`, not a guess.

### 4. Phase C — INTERPRET cells, one by one

Interpreted values are judged from free text and worked **cell-by-cell** —
this is the one phase where per-cell effort is irreducible. **Fill one interpret
cell per UPDATE** (`WHERE ref='<one cell>'`): each interpret cell has its own
explanation and its own note, so the tool **rejects an UPDATE that fills more than
one interpret cell** at once. You may still read broadly to find the right note —
only the write is per-cell.

For an interpreted cell, set `state='filled'` (the store automatically flags an
interpret cell as awaiting clinician review — you do NOT write a
`needs_verification` state, which is not a valid stored state and will be
rejected) and put the verbatim evidence **inside the source as `citations`** — a
list of **exact substrings** of the note that justify the value — alongside the
note's `row_id` (its own primary key) and `row_key` (the column that primary key
is in, e.g. `note_id`). Scope the source's `query` to **that one note**
(`… WHERE <row_key> = '<row_id>'`) and project the patient identity, that row
identifier, and the source text — so clicking the cell shows the single cited
note, not every note for the patient. One source per note; one note can carry
several citations.

```json
{"database": "cells", "sql": "UPDATE cells SET value='Patient declined dose increase', state='filled', confidence='medium', resolved_by='agent', explanation='Note from 2024-03-12 for P042 documents the patient''s refusal — per the field instruction the documented reason is the patient''s own decision.', sources='[{\"database\":\"cord-ph\",\"query\":\"SELECT patient_code, note_id, note_date, note_text FROM clinician_notes WHERE patient_code = ''P042'' AND note_id = ''note-2291''\",\"table_column\":\"clinician_notes.note_text\",\"row_id\":\"note-2291\",\"row_key\":\"note_id\",\"citations\":[\"patient declined dose increase, prefers to retry diet first\"]}]' WHERE ref='ALL!G42'"}
```

Each citation must be an **exact substring** of the note text — not a paraphrase.
If the value draws on several notes, include **one source per note**, each with
its own `row_id`, `row_key`, and `citations`, so every contributing note is
highlighted. Write each interpret cell in its own UPDATE.

### 5. What every write must carry

Writing cells is the only step that records a result, so it has the strictest
rules. Every write must:

- Set the `value` (or, for a missing value, set `state='blocked'` instead).
- Set `state`, `confidence`, `resolved_by='agent'`, and a short `explanation`.
- **Set `sources` to a JSON array with at least one source.** A source is a JSON
  object: `{"database": "<name>", "query": "<sql>", "table_column": "<table.column>"}`,
  plus `"row_id"` + `"row_key"` + `"citations"` for a note (see Phase C). The write is
  **rejected** if `sources` is empty. You do NOT repeat the patient identity on the source — it
  is the cell's `member` already; just make the `query` project it so the value is
  verifiable. For a column-wide write, the one shared query that returns every
  value **alongside the patient identity** is the source — never a bare
  `SELECT delivery` with no `patient_code`.

For a single cell, address it by its exact `ref`:

```json
{"database": "cells", "sql": "UPDATE cells SET value='3', state='filled', confidence='high', resolved_by='agent', explanation='delivery = Forceps -> code 3', sources='[{\"database\":\"cord-ph\",\"query\":\"SELECT patient_code, delivery FROM cord_ph_birth_records WHERE patient_code = ''P001''\",\"table_column\":\"cord_ph_birth_records.delivery\"}]' WHERE ref='ALL!T17'"}
```

### 6. When a value cannot be found — `sql_execute`

After a real search, if the value is not there, block the cell — never guess. A
blocked cell carries no `value` and no `sources`; it must carry `reason_code` +
`reason_detail`. Block several members of one column in one statement.

```json
{"database": "cells", "sql": "UPDATE cells SET state='blocked', reason_code='NOT_LOCATED', reason_detail='no delivery recorded for these patients (searched cord_ph_birth_records.delivery)' WHERE field='delivery' AND state='pending' AND member IN ('P007','P009')"}
```

## Rules

- `sql_execute` is the only way to run SQL; `lookup_execute` is the only way to read
  specs / schemas. You cannot open files or run shell/Python.
- Never add a cohort or patient filter on a clinical database — the tool injects
  scope. Clinical databases are read-only (SELECT only); the worksheet (`cells`)
  takes SELECT and UPDATE cells.
- Work column-first: one read and one (chunked) write per column. Per-cell
  queries and per-cell writes are the exception (Phase C, lone stragglers), not
  the default.
- A coded field's value must be one of its permitted codes. Do not invent values;
  a rejected write tells you the allowed codes — re-issue with the correct code.
- A filled cell **must** carry a non-empty `sources` array. The DB rejects a
  write that violates this with an explicit error — follow the instructions in
  the error to correct it. The patient identity is the cell's `member`; it is
  not repeated on the source.
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
