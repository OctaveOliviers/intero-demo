---
name: navigate
description: Find where things live across any registered collection — the bound databases, the saved Datasets, and the table templates — progressively, like grepping a file tree, never loading a whole schema. Four read-only tools; loop search → join-paths → describe. `catalog`/`search`/`describe` are collection-generic (default `databases`; also `datasets` / `templates`); `describe` reads a whole table/template or a single column/field. Use before reading a value when you don't yet know which table/column holds it, or how to join to it.
metadata:
  boundary: find-data
---

# Navigate

Find *where* something lives across any registered collection — the bound
**databases**, the saved **Datasets**, the table **templates** — **progressively**,
never a whole-schema dump. Four read-only tools. For a clinical table, structure is
read live from SQLite, meaning from `model.json`, the join graph derived from
`model.json`.

## When to use
- You need the table/column that holds a value, before reading it.
- You're reaching a value in a non-anchor table or another database (need the join).
- You don't yet know which databases are bound, or what each holds.

## The loop
`search` (candidates) → `join-paths` (how to reach them) → `describe` (confirm columns/codes).
`catalog` first only when ≥2 databases are bound and you don't know which holds what.

## The four tools
`catalog`/`search`/`describe` take an optional `collection` — `databases` (default),
`datasets`, or `templates`; an unknown collection is an error listing the valid ones. The
calls below default to `databases`. `join-paths` is **databases-only** (only a clinical
database carries a measured join graph). All read metadata — never cell values; only
`describe` of a clinical table also reads live SQLite.

In a table-fill run **only `databases` is bound** — your job is filling cells from the
clinical databases. The `datasets` and `templates` collections are the request-time
library (browsed by the chat agent, not here): they are unpopulated in this run, so a
`catalog`/`search` over them returns empty and a `describe` not-found. Navigate
`databases` only; leave `datasets`/`templates` to the request flow.

- `catalog_execute({})` → a collection's items + one-line `summary`. **Never lists a database's tables.**
  → `{databases:[{database, title, summary}]}`
- `search_execute({"query":"<keyword>"})` → keyword grep over a collection's names, descriptions,
  code labels → candidate paths. The way INTO tables. No match → empty (not an error).
  → `{matches:[{database, table, column|null, matched_on, context}], match_count}`
  — each match is fully located, like `grep` printing the path.
- `describe_execute({"tables":[{"database":"<name>","table":"<name>"}, ...]})` → read one node
  in full: a whole table (column **names + types live from SQLite**, descriptions + code
  meanings from `model.json`), or — over `templates` — a whole template or one field, or — over
  `datasets` — one Dataset.
  → `{tables:[{database, table, grain, description, columns:[{name, type, description, codes?}]}]}`
  Add a `"column"` to an entry (`{"database","table","column"}`) to read **just that one column**
  — its live type, description, and codes — once you've pinpointed it (e.g. via `search`).
  → `{tables:[{database, table, column, type, description, codes?}]}`
- `join_paths_execute({"database":"<name>","table":"<name>"})` → **every** table one hop away:
  within-DB **foreign keys** + cross-DB **identity links**, each with `from_column`/`to_column`.
  → `{neighbours:[{database, table, via, from_column, to_column, cardinality?, declared?, evidence?}]}`

## Rules
- Read-only, local-only — these tools return metadata, never clinical values.
- Joins come from `join-paths` (the measured graph) — **never guess a join from column-name similarity**.
- `search` is keyword only.
- A table `join-paths` can't reach from a cohort table is not reachable — pick one its neighbours connect.

## What this skill does NOT do
- Read clinical values or write cells — that's `sql_execute` (the caller's skill).
- Read the audit field spec — that's `lookup_execute` (the caller's skill).
- Apply cohort/scope — the data-access tool does that, not here.
