# Navigation

Read [architecture.md](../architecture.md) and [table-population.md](table-population.md) first. This document
specifies how an agent **finds things** in Intero — clinical data, the saved Datasets, and the saved
table templates (the navigation over all three is built; the chat consumer of the latter two is
deferred). It is the shared substrate beneath both v1 outputs: `table-fill` (tables) and
`chat-answer` (chat) both navigate through it, and the request flow uses it to resolve a request.
The *why* — what is pooled and what is kept apart — is recorded in
[decisions/0005](../decisions/0005-navigation-is-a-generic-verb-set-over-collections.md); this is the
buildable spec. The formal tool contract is owed as a follow-up with the `chat-answer` skill
([open-questions.md](../open-questions.md) Q43).

## The agent works the data like a file tree

A source database can hold **hundreds** of linked tables, and a hospital tens of databases — loading
every table's structure into the prompt is impossible and wasteful, and a request is usually scoped to
a slice anyway. So the agent **never receives a whole schema**. It navigates **progressively**, the way
a coding agent works a file tree: a cheap listing, a content search, a targeted read, and edges to
follow. The deliverable invariant is **never a whole-schema dump** — every tool returns only its
bounded slice.

The same four primitives navigate **any described collection** — the clinical databases, the saved
**Datasets**, and the **table templates** libraries (all three are registered today, so the chat agent
will be able to find a reusable slice/template by keyword instead of listing them all; its consumer,
`chat-answer`, is shipped: the thread agent browses its granted libraries). The primitives are the file-tree toolkit:

| Primitive | File-tree op | Does |
| --- | --- | --- |
| **`catalog`** | `ls` | list a collection's items + a one-line summary (breadth, shallow) |
| **`search`** | `grep` | find items by keyword across a collection (the way in past a too-big-to-`ls` level) |
| **`describe`** | `cat` / `stat` | read one node in full — a whole table/template, or a single column/field |
| **`join-paths`** | follow a symlink | from a table, every table one hop away (databases only) |

`catalog` (breadth) and `describe` (depth) are **different operations** — `ls` vs `cat` — kept
separate for the same reason a shell keeps both: you cannot `describe` what you have not first
`catalog`ed or `search`ed to. Only **two cuts** are real, and both follow from scale or structure:
`search` exists because a database's hundreds of tables can't be listed, and `join-paths` is
**databases-only** because only a clinical database carries a measured join graph.

## Collections

A **collection** is a named set of described items the agent navigates. v1 recognises three:

- **`databases`** — the clinical databases **bound** for the work. For a table run this is the run's
  `mapping.json` full database list ([architecture.md](../architecture.md#multiple-databases)), one
  `model.json` per mounted database; for an Answer it is the databases the user's hospital
  permissions expose. A database is a **container** (it holds many tables).
- **`datasets`** — the user's saved **Datasets** (`dataset.json`), each a named slice/scope.
- **`templates`** — the user's saved **table templates** (`spec.json`), each a table definition.

All three carry a `name`/`title` + `description`, so the same keyword `search` works over every one.
**Keywords ride on the `description`** — there is no separate `keywords` field; indexing/authoring just
ensures a collection item's salient terms appear in its description prose.

## The four primitives, precisely

Each primitive takes a `collection` (or, for `describe`/`join-paths`, an item path that implies it).
Output is **metadata only** — names, types, descriptions, codes, edges — **never** clinical cell
values, and never a whole-schema dump.

### `catalog` — `ls` a collection
- **In:** `collection`.
- **Out:** `[{ id, title, summary }]` — every item in the collection, one shallow line each. It
  **never descends** (it never lists a database's tables).

### `search` — `grep` a collection
- **In:** `collection`, `query` (a keyword; v1 is **keyword**, no embedding ranking).
- **Out:** `[{ path, matched_on, context }]` — the matching items, each **fully located** like
  `grep` printing a path: `databases` → `db.table[.column]`, `templates` → `template[.field]`,
  `datasets` → `dataset`. `matched_on` ∈ `name | description | code-label`; `context` is the matching
  snippet. No match is a clean empty result, not an error.

### `describe` — `cat`/`stat` one node, at any depth
- **In:** the node's path — a whole table or one column (`{ database, table }` or
  `{ database, table, column }`), a whole template or one field (`{ template }` or
  `{ template, field }`), or a `{ dataset }`. A **database is not describable** — its children are the
  hundreds-of-tables level, so `catalog` (its summary) + `search` (find a table) cover it.
- **Out:** the node's `description` (and `grain` for a table/template), plus **either** its children
  inlined — `columns`/`fields`, each `{ name, type/format, description, codes }` — **or**, for a leaf
  path, just that one column/field; plus its `path`. `codes` is the `{ code → meaning }` dictionary.
  For a clinical table, column **names + types are read live from the database** (zero drift) and
  descriptions + codes come from `model.json`; a template's fields and a Dataset's filters come from
  their artifacts.

### `join-paths` — follow a table's edges (databases only)
- **In:** `{ database, table }`.
- **Out:** `[{ database, table, via, from_column, to_column, cardinality?, declared?, evidence? }]` —
  **every** table one hop away: within-database **foreign keys** and cross-database measured
  **identity links**, each with the columns to join on. The neighbour set is **derived** from each
  `model.json`'s `foreign_keys` + `identity_links`, never guessed from column names, never a separate
  artifact. Datasets and templates have no measured edges, so `join-paths` does not apply to them.

## Structure vs meaning — and why nothing is maintained twice

The split is **by what can be introspected**. Live **structure** (a table's column names + types)
belongs to the database and is read live by `describe`; **meaning** (clinical descriptions, code-set
meanings, the filterable surface, the measured identity links) is the judgment + measurement that
indexing produces and lives in `model.json` ([indexing-and-mapping.md](indexing-and-mapping.md)). Only
`describe` of a clinical table composes the two; `catalog`, `search`, and `join-paths` read `model.json`
(or, for the other collections, the artifact) alone.

## A code is one concept; coding a cell is a translation

A **code** is one thing everywhere — a `{ code → meaning }` dictionary (the meaning ideally a short
label, sometimes a sentence). `describe` returns it the same way for a database column and a template
field; there is no "input vs output" kind of code. What is real is narrower, and is a fact about the
**data**: a populated cell involves **two** dictionaries — the **template field's** permitted values
(the vocabulary the answer is **written in**) and the **source column's** codes (how the source
**stored** its value). They are the same kind of thing but **different dictionaries** — the database
stores `Forceps`, the audit wants `3`. So coding a cell is a **translation**: read the source value →
its meaning (source dictionary) → the field code carrying that meaning (audit dictionary) → write it.
The bridge is the shared **meaning**; the off-code guard
([decisions/0001](../decisions/0001-sql-as-data-over-generated-code.md)) checks the written value
against the audit dictionary. The agent therefore `describe`s **two items** (the field, the column) —
the same verb, twice — never two different concepts.

## Seeded, not walled

For a table run the agent **starts at the Dataset's anchor tables** — they fall out of the Dataset's
already-grounded predicates, which name real `table.column`s — and navigates outward. **With no
Dataset it starts at `catalog`** (a single line when one database is bound) and finds its first tables
with `search`. The full schema stays reachable (an output often needs a table the filter never
touched), bounded only by the user's hospital permissions ([auth §11](auth-and-access.md)).

## What ships now, what is generalised later

The four primitives ship fronted by the `navigate` skill and used by `table-fill`. The collection
seam is **built**: `catalog`/`search`/`describe` are generic over a `collection`, with **all three
collections registered** — `databases` (the default), `datasets`, and `templates`:

- `catalog` (`catalog_execute`), `search` (`search_execute`), and `describe` (`describe_execute`)
  each take an optional `collection` and delegate to it; `describe` reads at **table-or-column depth**
  (a whole table, or a single column — and, for `templates`, a whole template or one field; for
  `datasets`, one Dataset). `join-paths` (`join_paths_execute`) stays **databases-only**. The audit
  field spec is also read by the same `describe` verb over the `templates` collection; the older
  `lookup_execute` (reading `spec.json`) is unchanged and still used by `table-fill`, kept distinct only
  because it backs onto a different source, not because its codes differ in kind from a column's.

The **consumer** is shipped: the primary thread agent's worktree materializes per-id
symlinks for exactly the caller's granted Datasets/Templates
([storage-layout.md](../contracts/storage-layout.md) §3), and the same collection
verbs browse them to resolve *reuse an existing slice/template vs spin up a new
one vs answer one-off* (Q43). The navigation **substrate** was built ahead — the
shared core is collection-shaped — so the consumer calls it, never re-builds it.

## Acceptance

- The agent finds data through the navigation primitives — **catalog / search / describe / join-paths**
  — and **never a whole-schema dump**; each tool returns only its bounded slice.
- `search` is **keyword** over name/title + description (+ code labels for a database), across **all**
  items of the named collection; a value in a non-anchor / cross-database table is reachable by
  `search → join-paths → describe` (the primitives compose), asserted deterministically on the seeded
  cord-pH databases.
- A clinical table's **structure is read live** (zero drift) and its **meaning from `model.json`**; the
  join graph is **derived** from `model.json`. `describe` reads a node at table **or** column depth; a
  **database is never describable** (catalog + search cover it).
- `catalog` lists a collection's items + summaries and **never lists a database's tables**.
- The same primitives apply to the `databases`, `datasets`, and `templates` collections; all three are
  **built and registered** (the collection seam, fronted by the `navigate` skill), and the thread
  agent's worktree exposes the `datasets`/`templates` libraries **per granted id only** (fail-closed).
