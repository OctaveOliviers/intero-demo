# 0005 — Navigation is a generic verb-set over described collections

- **Status:** Accepted
- **Date:** 2026-06-26

> The resulting buildable spec lives in [features/navigation.md](../features/navigation.md); this ADR
> records the *why*.

## Context

The `navigate` skill fronts four read-only tools over the clinical databases —
`catalog` (list databases + one-line summary), `search` (keyword grep over
names/descriptions/code labels → candidate `table.column`s), `describe` (one table's
columns/types/codes), `join-paths` (the measured FK + identity graph). Two adjacent stores have
the **same shape** — a *grained* container of *described, possibly-coded* items:

- **Datasets** (`dataset.json`): a saved slice, with `name` + `description`.
- **Templates** (`spec.json`): a table definition, with `title` + `description` + `grain`, and per
  field a `notes` (description) and `permitted_values` (codes). Structurally near-isomorphic to a
  database table (table.description ≈ template.description, column.description ≈ field.notes,
  column.codes ≈ field.permitted_values, column.type ≈ field.type).

Two needs pull on this:

- At **request time**, the **chat agent** must browse the **library** — potentially many Datasets and
  many Templates — to decide whether to **reuse** an existing slice/template, **spin up** a new one
  (the user may persist it later), or answer as a **one-off** with no table. With 20+ templates in a
  hospital, listing them all is wasteful; a keyword search over title/description is the right move.
- At **run time**, the resolved template's fields are read to know **what to write, and in which
  codes** (`lookup_execute`), while the clinical database is navigated to find **where the source data
  lives** (`navigate`).

The temptation is to re-implement list/search per store. The answer is one shared verb-family,
varying only the collection it reads — while keeping the two cuts that are *real*: **scale** (a
database has hundreds of tables, so its tables can't simply be listed) and the **measured join graph**
(which only the clinical database has).

## Decision

**Navigation is the file-tree toolkit — `ls` / `grep` / `cat` / follow-edge — generic over any
described collection. The four primitives are complementary, not redundant; each is one operation,
pooled over a shared core that varies only the collection it reads.**

The agent works the data the way a coding agent works a file tree:

- **`catalog` = `ls`** — list the items you have access to, each with its one-line summary (breadth,
  shallow). Over any registered collection: the bound databases, the Datasets library, or the Templates
  library.
- **`search` = `grep`** — find items by keyword across the tree. The way IN past a level too big to
  `ls`: a database has hundreds of tables, so you grep for the column rather than list every table.
  Keyword over name/title + description.
- **`describe` = `cat` / open** — open ONE item and read its full detail: a table's columns + codes +
  grain, a template's fields + codes, a Dataset's filters. For a clinical table this is
  `describe`; the template read (today `lookup_execute`) is the **same verb** over `spec.json`.
- **`join-paths` = follow a symlink** — traverse the measured edges (foreign keys / identity links) to
  neighbouring items.

`catalog` (breadth) and `describe` (depth) are **different operations** — `ls` vs `cat` — not the same
verb at two levels; keep both, for the same reason a shell keeps both. You cannot `describe` what you
have not first `catalog`ed or `search`ed to. Merging them into one polymorphic "look at X" would trade
that crisp split for one verb with two return shapes and an awkward "this level is too big to list"
exception — more confusing, not less.

Only **two cuts** are real (everything else is the same toolkit everywhere): **scale** — you cannot
`ls` a database's hundreds of tables, so `search` is the way in past that level; and **edges** — only
the clinical database carries a measured join graph, so `join-paths` is DB-only. A "shared-field graph"
across templates is **rejected**: a field's identity is its *description + code set + process*, so the
same concept coded differently in two audits (e.g. "sex of the baby") is a **different field** — truly
shared nodes are rare, the graph is sparse, and it adds a traversal axis the run agent never needs;
template reuse is served by **cloning** a canonical template (fork semantics, [Q18](../open-questions.md)),
not a graph.

**Keywords are folded into the `description`**, not a separate field — so `grep` works the same over
every collection with no schema change; the indexer just ensures salient terms appear in the prose.

**A "code" is one concept everywhere** — a `{code → meaning}` dictionary (the meaning ideally a short
label, sometimes a sentence). `describe` returns it the same way for a database column and a template
field; there is **no "input vs output" kind of code**. What is true is narrower, and is a fact about the
**data**, not the tools: a fill has **two code dictionaries** — the **audit field's** `permitted_values`
(the vocabulary the answer is **written in**) and the **source column's** `codes` (how the source
**stored** its value). Same kind of thing, **different dictionaries** (the DB stores `Forceps`; the
audit wants `3`). So coding a cell is a **translation**: source value → its meaning (source dict) → the
audit code with that meaning (audit dict) → write it; the bridge is the shared **meaning**, and the
off-code guard ([0001](0001-sql-as-data-over-generated-code.md)) checks the written value against the
audit dictionary. The agent therefore `describe`s **two items** (the field, the column) — the same verb,
twice — never two different tools or two different concepts.

## The primitives, precisely

The v1 shape (the formal contract is still deferred — [Q43](../open-questions.md)). Each is generic
over a `collection` ∈ {`databases`, `datasets`, `templates`}; **all three collections are built and
registered** (the `databases` default, plus `datasets` and `templates`). `describe` reads the node at
a **path of any depth** (a whole table or a single column; a whole template or a single field; a
dataset). The **one** node that is *not* `describe`-able is a **database** — a container whose children
(tables) are too many to inline, so `catalog` (its summary) + `search` (find a table) cover that level.
Output is metadata only — never cell values.

- **`catalog` (`ls`)** — IN: `collection`. OUT: `[{id, title, summary}]`, one shallow line per item;
  never descends.
- **`search` (`grep`)** — IN: `collection`, `query`. OUT: `[{path, matched_on, context}]` — matches,
  each fully located (`db.table[.column]` / `template[.field]` / `dataset`); `matched_on` ∈
  name | description | code-label; `context` = the matching snippet.
- **`describe` (`cat`/`stat`)** — read the node at a **path, at any depth**: a whole table/template, or
  a single column/field. IN: `{database, table}` or `{database, table, column}` · `{template}` or
  `{template, field}` · `{dataset}`. OUT: that node's `description` (+ `grain` for a table/template),
  and **either** its children inlined (`columns`/`fields`, each `{name, type/format, description,
  codes}`) **or**, for a leaf path, just that one column/field; plus its `path`. `codes` = the
  `{code → meaning}` dictionary (a table column → **live** type + source codes; a template field → the
  permitted **output** values). The one node you cannot `describe` is a **database** — its children
  (tables) are too many to inline, so `catalog`/`search` cover that level. *(Built — `describe`
  reads table-or-column depth for `databases`, a whole template or one field for `templates`, and one
  Dataset for `datasets`.)*
- **`join-paths` (follow edges)** — IN: `{database, table}` (databases only). OUT: `[{database, table,
  via, from_column, to_column, cardinality?, declared?, evidence?}]` — every table one hop away (FK
  within-DB, identity across-DB).

## Consequences

- **Substrate built ahead, consumer deferred.** The Datasets/Templates library search is a
  **chat-answer / request-flow** need, and chat-answer is deferred ([open-questions](../open-questions.md)
  Q43/Q31). The navigation **substrate** for it, however, was **built ahead in this branch**: the
  `catalog`/`search`/`describe` core is collection-shaped and all three collections (`databases`,
  `datasets`, `templates`) are registered, since generalising the already collection-shaped core (iterate
  described items, substring-match name/description) was cheap. Only the **consumer** — the chat agent
  that browses those libraries — lands later, with `chat-answer`.
- **One mental model for the agent.** `catalog → search → describe` reads the same whether finding a
  clinical table, a Dataset, or a template — less to learn, less context, consistent UX.
- **Indexing owes keyword-rich descriptions.** Because keyword search rides on `description`, the
  indexing/authoring step must ensure a Dataset's or template's salient terms appear there (no separate
  `keywords` field is added).
- **One verb, possibly a small family — a build choice, not a concept split.** Whether `describe` is a
  single polymorphic tool or a `describe`-family is decided only by the **different backing sources**:
  `describe` reads **live SQLite** (structure) + `model.json` (codes), while the template/field
  read (today `lookup_execute`,
  [table-population §navigate](../features/table-population.md#the-navigate-skill--how-the-agent-finds-data))
  reads `spec.json`. They share one contract — *return this item's description + codes + children +
  path* — so `lookup_execute` stays its own tool only because it backs onto a different store, **not**
  because its codes differ in kind from a column's. (Nothing here forces a refactor of the shipped
  tools; it records the shape any future consolidation should follow.)
