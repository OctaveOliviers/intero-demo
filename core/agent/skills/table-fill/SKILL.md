---
name: table-fill
description: Fill the pending cells of an audit worksheet with values found in a read-only clinical database. Work column-first — one field usually fills from one source column in one pass; drop to cell-by-cell only for values read from free text. Every write carries a self-verifying source. Use whenever a run hands you pending cells.
metadata:
  boundary: cell-from-sql
---

# Table Fill

Fill the pending cells of an audit worksheet. Each cell = one **field** for one
**member** (patient) — but the unit of work is the **column**: one field is one
column, and one source column usually fills it for every member at once. Find the
values, write them with a source. All over SQL, through `sql_execute`.

→ Find *where* a field's value lives: the **navigate** skill.
→ The shape of the source every write carries: the **evidence** skill.

## Contract — do exactly this and nothing else
Fill **every** pending cell you are handed — the run already decided which cells
are pending; you fill them, never classify them. Read the prompt's per-field
pending counts to plan; let the **source** decide the fill strategy (below). Every
filled cell carries ≥1 source (evidence skill). A coded value must be a permitted
code. A value genuinely absent → block with a reason. Stop when no pending cells
remain.

**Allowed tools:** `sql_execute`, `lookup_execute`, and the four **navigate** tools
(`catalog_execute`, `search_execute`, `describe_execute`, `join_paths_execute`).
**Never:** anything else — no shell, no Python, no file access.
- Find where a value lives → the **navigate** skill.
- The shape of the source a write carries → the **evidence** skill.
- A field's spec (type, permitted codes, notes) → `lookup_execute({"field":"<id>"})`.

## When to use
- A run hands you pending cells to resolve.
- The values live in a read-only clinical database reached over SQL.
- A cell needs looking up, joining, or reading free text — not a plain copy.

## sql_execute
- `sql_execute(database, sql)` — one SQL statement.
  - `database="cells"` — the worksheet you fill (read + write).
  - `database="<clinical-db-name>"` — read-only clinical source. Exact name from the prompt; a run
    may bind several; one query may join across them (qualify a foreign table `"<db>".<table>`).
  - Write **plain** SQL — the tool injects the cohort/scope onto every table. No cohort/patient
    filter, no identifier, no `ATTACH`/`PRAGMA`/DDL, one statement only.

## Strategy follows the source, not a cell label
Fill how the **value lives**, not by any label on the cell:

- **Value in a structured column → copy it, in bulk.** Read the column once, write the whole
  column in **one** `UPDATE` (`CASE` over `member`, one shared source, `member IN (...)`). The
  efficient path.
- **Value read/judged from free text** (a clinician note) → fill that cell **on its own**, with
  its **own citation**. The store **rejects a single `UPDATE` carrying one shared source across
  several note-derived values** — each note value needs its own citation/explanation.

## Routine — per field/column, in order
1. Field spec **once** — `lookup_execute {"field":"<full-id>"}` (e.g. `patient-details/ethnic_category`;
   on a miss, re-issue with the id it suggests). `{"audit":true}` lists every field's id + name.
2. List the **distinct plausible sources** (a structured column, a note, another database) — find them
   via the **navigate** skill. Usually more than one.
3. Query those sources for the column's members. Read the open cells first — `hypothesis` says why a
   cheaper pass failed:
```json
{"database":"cells","sql":"SELECT ref, member, hypothesis FROM cells WHERE field='delivery' AND state='pending'"}
```
   `member` = patient, `ref` = where the value goes (e.g. `ALL!T17`).
4. **Fill before you block.** Fill the members found; block only those genuinely empty *after* the fill.
   (A block-first UPDATE matches 0 rows and wrongly blocks the whole column.)
5. Block a member only after **every** distinct plausible source has been **successfully queried** and
   missed. An errored query (bad SQL/column) checked nothing — fix and re-run it. A query that ran and
   returned nothing checked that source — move on, don't re-run it.

### Bulk fill — a column from one structured source
Read the whole column in **one** query (the tool restricts to the cohort):
```json
{"database":"cord-ph","sql":"SELECT patient_code, delivery FROM cord_ph_birth_records"}
```
Write the column in **one** UPDATE — `CASE` over `member`, one shared source, `member IN (...)`
listing exactly the covered members (never let an uncovered member catch a NULL):
```json
{"database":"cells","sql":"UPDATE cells SET value = CASE member WHEN 'P001' THEN '1' WHEN 'P002' THEN '3' END, state='filled', confidence='high', resolved_by='agent', explanation='delivery from cord_ph_birth_records.delivery, codes per field spec', sources='[{\"database\":\"cord-ph\",\"query\":\"SELECT patient_code, delivery FROM cord_ph_birth_records\",\"table_column\":\"cord_ph_birth_records.delivery\"}]' WHERE field='delivery' AND state='pending' AND member IN ('P001','P002')"}
```
- Chunk ~20 members per statement. An off-code rejection aborts the whole statement (no half-write)
  — fix that member's code (the error names the allowed ones) or split it out, then re-issue.
- **Read broad, write narrow.** Keep the broad column query as the shared source; the tool narrows
  each cell's stored source to its own member (`… WHERE patient_code='<member>'`). You don't write
  the per-cell filter.
- **After** the fill runs, block the members the query didn't return (one statement, `member IN (...)`).
- Stragglers in a mostly-filled column: read a filled sibling's source
  (`SELECT sources FROM cells WHERE field='delivery' AND state='filled' LIMIT 1`), re-run it for the
  pending members, write what resolves; for the rest read `hypothesis`, check the other sources once,
  then write or block.

### Free-text fill — one cell at a time
A value read from a note is worked **cell-by-cell** — the store **rejects an UPDATE filling >1
free-text cell** (each carries its own explanation + citation). Read broadly to find the note; write
per cell. `state='filled'` (the store auto-flags it for review — never write a `needs_verification`
state). The source carries verbatim `citations` + `row_id`/`row_key`, its `query` scoped to that one
note — see the **evidence** skill.
```json
{"database":"cells","sql":"UPDATE cells SET value='Patient declined dose increase', state='filled', confidence='medium', resolved_by='agent', explanation='Note 2024-03-12 for P042 documents the refusal.', sources='[{\"database\":\"cord-ph\",\"query\":\"SELECT patient_code, note_id, note_date, note_text FROM clinician_notes WHERE patient_code=''P042'' AND note_id=''note-2291''\",\"table_column\":\"clinician_notes.note_text\",\"row_id\":\"note-2291\",\"row_key\":\"note_id\",\"citations\":[\"patient declined dose increase, prefers to retry diet first\"]}]' WHERE ref='ALL!G42'"}
```

### Block when a value cannot be found
A blocked cell has no `value`, no `sources`; it carries `reason_code` + `reason_detail`. The
`reason_detail` is **specific and true for every cell it covers** — name the exact source(s) checked
and the precise absent value ("no retinal screening row in screening_results for this patient"), never
a generic "no data". Don't block different fields under one shared reason unless it is checked-and-true
for each.
```json
{"database":"cells","sql":"UPDATE cells SET state='blocked', reason_code='NOT_LOCATED', reason_detail='no delivery recorded (searched cord_ph_birth_records.delivery)' WHERE field='delivery' AND state='pending' AND member IN ('P007','P009')"}
```

## Rules
- Every write sets `state`, `confidence`, `resolved_by='agent'`, `explanation`; a fill also sets
  `value` + a non-empty `sources` (evidence skill) — the store rejects an empty `sources`.
- Never add a cohort/patient filter on a clinical DB — the tool injects scope. Clinical DBs are
  read-only (SELECT); `cells` takes SELECT + UPDATE cells.
- Column-first: one read + one (chunked) write per column. Per-cell is the exception (free text, lone
  stragglers).
- A coded value must be a permitted code — a rejected write names the allowed codes; re-issue.
- Don't fabricate or infer from absence (evidence skill) — an unrecorded value is `blocked`, never guessed.
- Write the **exact value**, rendered in the field's declared `format` (e.g. `2026-04-24` →
  `24/04/2026` for `DD/MM/YYYY`). Change representation, never the datum; no format declared → as stored.
- A value belongs to the member whose record it is. A row not keyed to a member attaches only when it
  can be tied to them (e.g. its date = that member's visit date); otherwise **block** for that member.
  Never carry one member's record onto another's cell.

## Completion
Report one of: **DONE** (every pending cell filled or blocked) · **DONE_WITH_CONCERNS** (list
low-confidence cells) · **BLOCKED** (state the blocker + what was tried) · **NEEDS_CONTEXT** (state
exactly what's needed).

## What this skill does NOT do
- Open or edit files — cells are read/written only through `sql_execute`.
- Rediscover schema by guesswork — use the **navigate** skill.
- Write to or modify a clinical database — read-only.
