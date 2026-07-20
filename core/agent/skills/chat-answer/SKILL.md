---
name: chat-answer
description: Answer a clinician's question about the clinical databases in natural language, with at least one citation per claim. Find the data with the navigate skill, read it read-only over SQL, stream the answer text, and call cite_execute for each source. Use whenever a thread hands you a question to answer (no cells, no worksheet).
metadata:
  boundary: chat-from-sql
---

# Chat Answer

Answer the clinician's request from the registered clinical databases, in plain
language when the requested output is a chat answer, with **every claim carrying
≥1 real source**. A chat has **no cells, no worksheet, no tiers** — you read the
databases and compose an answer. All reads go through `sql_execute`.

→ Find *where* a value lives: the **navigate** skill.
→ The shape of the source every claim carries: the **evidence** skill.

## Contract — do exactly this and nothing else
First understand the request yourself: what inputs are required, whether the
request needs a saved Dataset or the whole registered database, and whether the
requested output is a chat answer or a table. Use the navigate tools to inspect
the available databases, Datasets, and templates as needed. If an essential input
or output choice is genuinely unclear, call `ask_user_question` and then stop.
If the request is clear and the output is a chat answer, find the data, read it,
compose a natural-language answer, call `cite_execute` for each source as the
source belongs in the answer, and then stop when the visible answer is complete.
**Every claim carries ≥1 source** (evidence skill). **Never fabricate**: a claim you
cannot back with a real value you read is not made — say so plainly rather than
guess. Stop once you have finished streaming the answer text.

**Allowed tools:** `sql_execute`, `cite_execute`, `ask_user_question`, and the
four **navigate** tools (`catalog_execute`, `search_execute`, `describe_execute`,
`join_paths_execute`).
**Never:** anything else — no shell, no Python, no file access, no whole-schema dump.

## When to use
- A thread hands you a question to answer inline.
- The answer lives in the registered read-only clinical database(s), reached over SQL.

## Find the data — navigate, never dump
You don't know the schema up front, and nothing lists every table. **Search for
where a value lives** (the **navigate** skill), then describe the table to confirm
its columns and join paths. Never ask for a whole-schema dump.

1. `catalog_execute {"collection":"datasets"}` and/or
   `search_execute {"collection":"datasets","query":"<keyword>"}` when the scope
   might be a saved Dataset.
2. `catalog_execute {"collection":"templates"}` and/or
   `search_execute {"collection":"templates","query":"<keyword>"}` when the output
   might be a table based on a saved template.
3. `search_execute {"query":"<keyword>"}` — grep for the `table.column`(s) that hold
   the value (e.g. `"length of stay"`, `"discharge"`, `"birth"`).
4. `describe_execute` / `join_paths_execute` — confirm the table's columns and how
   to join to others, when the answer spans tables.

## Ask the user only when needed — `ask_user_question`
Use `ask_user_question` when you cannot safely proceed because a required input or
output choice is unclear after reasonable navigation. Ask only the few questions
needed to remove the uncertainty.

```json
{"questions":[
  {"id":"dataset_scope",
   "question":"Which Dataset should I use?",
   "choices":[
     {"id":"whole_db","label":"Whole hospital database"},
     {"id":"dataset-cordph-term-nicu","label":"Term babies admitted to NICU"}
   ],
   "allow_other":true,
   "required":true}
]}
```

The tool may carry several questions, but the UI shows them one at a time. After
calling `ask_user_question`, stop; the backend will collect the user's answers
and start a follow-up turn with those answers.

## Read the data — `sql_execute`, read-only
- `sql_execute(database, sql)` — one SQL statement.
  - `database="<clinical-db-name>"` — a registered clinical database. The exact
    name is in the prompt; several may be bound and one query may join across them
    (qualify a foreign table `"<db>".<table>`).
  - Write **plain SELECT**. There is **no injected cohort** (unlike a table run).
    If the prompt names a Dataset scope, apply that Dataset's cohort SQL/criteria
    yourself to every query. If the prompt says whole hospital database, read the
    whole registered database. Read exactly what the question needs.
  - Read-only: SELECT only. Subqueries, CTEs, aggregates, GROUP BY are all fine and
    often necessary (a "how many", an average). No `ATTACH`/`PRAGMA`/DDL, one
    statement only — the tool ATTACHes the sibling databases itself.
  - There is **no** `cells` database in a chat — you have no worksheet to write.

## Compose the answer
Write a direct, natural-language answer to the question. Keep it to what you can
support with a value you actually read. Stream the answer text normally. When a
claim needs evidence, call `cite_execute` at that point with the source object.
The backend assigns and renders the citation marker; do not choose citation
numbers yourself.

## Cite it — `cite_execute`
Call `cite_execute` with an **evidence-skill source** re-extracting the cited
value beside its identity:

```json
{"kind":"aggregate","database":"cord-ph","query":"SELECT COUNT(*) AS n FROM cord_ph_birth_records","table_column":"cord_ph_birth_records.patient_code","explanation":"count of birth records","denominator":{"label":"birth records","value":412},"completeness":{"label":"records counted","value":"412/412"},"covered_rows":[{"database":"cord-ph","query":"SELECT patient_code FROM cord_ph_birth_records","table_column":"cord_ph_birth_records.patient_code","explanation":"covered birth records"}]}
```

- A value read from a **note / free text** carries the verbatim evidence: add
  `row_id` + `row_key` (the cited record's primary key) and `citations` (the exact
  substring(s) — never a paraphrase). See the **evidence** skill.
- `query` must be the SELECT that produced the value, projecting the entity identity
  beside it so the source verifies on its own. `cite_execute` rejects an
  unregistered citation database, a citation missing
  `database`/`query`/`table_column`, or a `query` that is not a SELECT.
- An aggregate claim (`COUNT`, `AVG`, a percentage, a rate, a trend) uses
  `kind:"aggregate"` and must carry `denominator`, `completeness`, and
  `covered_rows`. `covered_rows` are source objects for the rows behind the
  aggregate, not one arbitrary example row.

## Finish it
There is no final-answer tool. When the visible answer text is complete and all
needed citations have been recorded with `cite_execute`, stop. The backend
persists the streamed text plus the recorded citation events.

## Rules
- **≥1 source per claim** (evidence skill) — a claim with no real source is not made.
- **No pre-agent parsing.** You, the agent, resolve input scope and output shape
  by navigating the available collections and using tools. Do not rely on hidden
  regex/phrase-list routing.
- **Read-only.** Clinical databases take SELECT only; a chat never writes.
- **No inference from absence.** "The data doesn't mention X, so X is No" is not
  evidence — say the value isn't recorded rather than invent it.
- **Navigate, never dump** — reach data through `search`/`describe`, not a whole
  schema.
- **Registered DB ceiling, fail-closed.** You read the registered read-only
  databases and nothing outside them; an unknown database name is refused. A
  Dataset scope narrows what you choose to query, but it never widens this ceiling.

## What this skill does NOT do
- Fill cells or touch a worksheet — a chat has no cells.
- Decide table creation through hidden backend routing — request/output decisions
  belong to the agent turn.
- Open or edit files — data is read only through `sql_execute`.
- Rediscover schema by guesswork — use the **navigate** skill.
- Write to or modify a clinical database — read-only.
