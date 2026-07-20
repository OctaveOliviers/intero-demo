# Intero — Ubiquitous Language (CONTEXT.md)

The canonical glossary for **Intero** — operational intelligence for hospitals, of
which **clinical audit is one use case**. One shared vocabulary for **the code**, **the
people building it**, and **the clinicians and directors who own the problem**. When a
spec, a test, a variable, or a conversation names a domain concept, it uses the term
defined here.

This file is a **glossary and nothing else** — no implementation details, no file
paths, no decisions (those are [ADRs](decisions/)). It is maintained live by the
`/grill-with-docs` and `/domain-modeling` skills: when a term gets sharpened during
a grilling session, it is written here the moment it crystallises.

---

## People & actors

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Auditing Clinician** | A doctor (registrar or consultant) who runs an audit themselves; knows the clinical meaning of every field but is not a SQL user. Primary persona (P1). | end user, customer |
| **Department Head** | A clinician who defines a department's tables/Datasets and re-runs them on a schedule (P2). | manager, admin |
| **Clinical Lead** | An oversight clinician who watches a department — what is on track, where the gaps are — rather than running extractions. *(Dashboards are their eventual surface but are **deferred**; in v1 they work from individual owned **tables** + per-table-population status, with no cross-audit board yet.)* | head, supervisor |
| **CIO / Executive** | An organisation-level overseer who works from org-wide Datasets. *(Dashboard-led oversight is **deferred** — see Clinical Lead.)* | exec, sponsor |
| **Requesting Doctor** | A doctor who describes a data need in free text and has no template yet; today served by a scoped **chat**. | requester |
| **Clinical staff** | The single human role (`clinician`) covering every clinical persona — auditing clinician, department head, requesting doctor, clinical lead, CIO/director (P1–P5). Distinct personas, one role. | clinician (the role key), end users |
| **Hospital IT Engineer** | The infrastructure operator (persona P6) who points Intero at the source database(s) and manages accounts/roles — **and** who operates the tool like any clinician (the `admin` role is a **clinician-superset**). Sees clinical data only within the hospital's own permissions, like everyone else; a **peer**, not a clinical superuser. | sysadmin, clinical superuser |
| **User** | The logged-in identity that ran a thread; every thread and every database query is attributed to a User. | account, login |
| **Governance** | Clinical / Information Governance — owns the read-only, local-only, attribution constraints. Shapes requirements; not an operator. | admin, compliance |

## Access & authorization

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Role** | A named permission set gating **action classes**; the keys are `clinician` (clinical staff), `admin` (a **clinician-superset**: the clinician capability **plus** the admin surface — IAM + source-DB connections), `agent` (system). | group, tier |
| **Permission** | An action-class key a role holds (e.g. `dataset.query`, `template.manage`, `grant.manage_owned`). Roles gate *what kind* of action; grants gate *which resource*. | privilege, scope |
| **Resource grant** | An assignable, revocable grant of `read`/`run`/`manage` on one resource (`dataset`/`template`/`table`) to a user or role; owner-driven sharing, no team entity. **Threads are not grantable** (deferred); sharing a **table** cascades its Dataset as access-only. v1 product sharing is **editor-only** (issues `manage`). | ACL, share, role assignment |
| **IAM** | Identity & access management — accounts, role assignment, sessions. Owned by IT (`admin`); **resource sharing is not IAM** — it is owner-driven grants (clinical staff). | admin, user management |
| **Hospital permissions** | The user's *existing* data-access rights in the hospital's databases, which Intero defers to and intersects with the Dataset's scope. Intero never broadens them and builds no row-level permissions of its own. | DB perms, row security |
| **Resource change proposal** | A structured, opaque-patch proposal the agent attaches to an `ask_user_question` when it wants to create or edit a Dataset or Template; the user accepts or rejects it in the composer ([ask-user-questions.md](features/ask-user-questions.md)). | patch, edit request |
| **Approval token** | The short-lived, single-use token the backend issues when the user accepts a resource change proposal, bound to that exact proposal; Dataset/Template write paths verify it server-side before any write (ADR 0006). Patch grammar + mechanics owed: Q44. | consent flag, write permission |

## Datasets, scope & the database

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Dataset** | A saved, named **filter (a query) that scopes the hospital database to a slice** (NICU, paediatric diabetes, a whole department). The unit of scoping. **Flat** (no nesting), unlimited, and may span several source databases. A Dataset is *purely a filter* — it never copies or owns data. **Scope binds to the table, not the thread:** a **table** pins one Dataset *or* the whole DB as a **hard cohort, fixed for life** (the populated table equals the cohort, exactly — tool-enforced); a **chat** answer scopes **per message** (the thread is unscoped). The Dataset is **never the security boundary** — that is the user's hospital permissions ([decisions/0004](decisions/0004-scope-binds-to-table-not-thread.md)). | view, cohort (a cohort is what a Dataset *resolves to*) |
| **Hospital database** | The single **logical** database the product scopes: the union of all registered source databases, joined on measured identity links. Datasets slice this. | the data, the warehouse |
| **Database (source system)** | One registered source system (a SQLite database in the product) that forms part of the hospital database. **Backend infrastructure — not a user-facing library.** | datasource, DB, source |
| **Identity link / Identity key** | A *measured* (not guessed) fact that a column in one source database holds the same values as a key column in another; how a Dataset or a table joins across databases. | foreign key, join |
| **Cohort** | The set of records a Dataset resolves to — the rows a **table** is populated over (or that an Answer is scoped to). | population, sample |
| **Inclusion / exclusion criteria** | The filters that define a Dataset, stated in plain language and grounded to a real `table.column` + a parameterised SQL predicate. | filters (acceptable), query params |

## Threads, tables & outputs

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Thread** | The **free-ranging conversation** in the left panel — the work unit. **Unscoped: it roams**, and *each message* scopes itself (a Dataset, or the whole DB); it is **not** bound to a Dataset. Persists (recency-ordered, searchable, deletable). **Not shareable** (deferred). | run, session; chat (the conversation is the **thread**) |
| **Project** | *(Deferred — not in v1.)* An organisational grouping of threads; the left panel is **flat**, no folders. | folder, workspace |
| **Primary thread agent** | The persistent agent attached to a Thread. It interprets each user message, asks a clarifying question when needed (at most one per request — product-flows.md), and chooses the appropriate Output: an Answer or a Table request. | router, classifier, chat-only agent |
| **Output** | What a request produces; in v1 **two**: an **Answer** and a **Table**. The Primary thread agent chooses the Output from the user's request; both rest on the same database-navigation substrate (`navigate`). *(A **dashboard** is a deferred third output.)* | result |
| **Artifact** | The subset of Outputs built by a **dedicated, persistent, rerunnable sub-agent workspace**, each with its own **artifact id**: a **Table** today; a **Dashboard**, later, once built (its agent would extract from the underlying table and visualize per the dashboard template's rules — not built yet). An **Answer** is never an Artifact — it has no id of its own and no workspace; it runs inline in the Thread's own turn. **The artifact id is the Artifact's OWN identity** (a Table's `id`, `table-<uuid>`) — what the Thread's **`artifact_ids`** list and a message's **`resolution.artifact_id`** reference. It is **distinct from the population id** (`table_population_id`, `tp-<uuid>`) — the *run* that fills the artifact, which keys the `var/artifacts/` workspace and streams progress. Do not conflate the two on the wire. | run, pipeline artifact (see [Flagged ambiguities](#flagged-ambiguities)) |
| **Answer** | The conversational output: natural-language text in the Thread, with inline sources whenever it relies on database values. It has **no cells**. It scopes **per message** and **discloses the scope it answered at** (never silently hospital-wide for a slice question). | plain answer, cited answer, chat answer |
| **Table** | An **Artifact**: a populated **Template** — a row-based, field-defined extract where columns are fields and rows are entities. **Pinned to exactly one scope (a Dataset or the whole DB), fixed for life**; **first-class** (its own left-panel section) and **shareable**. Produced by a **table population** over the two population steps, tracked by an inline **inspector** in the thread. Stores first-class card attributes — its **source template** (or `ad-hoc`), a **title/description**, a **brief**, and a **reporting-period label** — so the **Tables** list is searchable (title/description) and filterable (by template) without folders. (Front-end only: a SQL/source table is always **"source table" / "database table"**.) | audit, workbook, sheet |
| **Inspector** | The compact inline component in a thread that is the **handle to a table's running sub-agent**: status while building, click-to-open (into the main panel), and the flip to a done state. Cross-thread, completion also fires a **toast with a hyperlink** that opens the finished table in the main panel (so the user is told wherever they roamed). | spinner, chip |
| **Dashboard** | *(Deferred — not in v1; retained design.)* An output built **on a table**: a set of **indicators**, each **deterministically computed from the table's fields by a stored formula** (the agent never aggregates — a fixed reducer does), rendered as cards; the agent chooses each indicator's **visualization**. | report, chart |
| **Indicator / Indicator formula / Viz config** | *(Deferred — dashboards not in v1.)* An **indicator** is one dashboard metric; its **formula** is the declarative definition (data, not code) of how it is computed from table fields (incl. ratios/denominators), evaluated by a fixed reducer that also records its denominator + completeness; its **viz config** is the declarative choice of how it is drawn. Full retained design: [table-population.md §Dashboard output (deferred)](features/table-population.md#dashboard-output-deferred). | metric, KPI, aggregation, chart code |
| **Audit** | The **intersection of a Dataset (scope) and a table (output), populated within a thread** — the clinical-audit use case, **not a separate stored object**. | report, assessment |
| **Template** | A reusable **output structure** in the **Templates** library. In v1 Templates are table templates — fields plus entity/grain — and persisting one triggers background mapping. *(A dashboard template is a deferred variant.)* | form, the sheet, output template |
| **Entity / Grain** | What one **row** of a table represents (a patient, a visit, a birth record); the identity anchor the mapping resolves against. | record, unit |

## The left-panel libraries

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Datasets** (data library) | The user's saved **Datasets**. | sources |
| **Templates** | The user's saved **table templates** (a table's fields + entity/grain). *(Dashboard templates are deferred.)* | output library |
| **Tables** | Every populated **Template** (audit), first-class and directly findable — its own left-panel section. | instances, output library |

## Pipeline outputs (the phases)

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Indexing** | Phase 1: turn a newly-added **table template** or **source database** into a structured JSON model a later agent can work from without seeing the original. | parsing, ingestion |
| **Mapping** | Phase 2: bind a **persisted table template** to the hospital database — for every field, where its value lives (direct) and, for interpret fields, where the **evidence to combine** lives. Runs **in the background when a template is persisted**, across all databases, and **never blocks** a request. | linking, matching |
| **Table Population** | Phase 3: apply a Dataset's scope, populate a table live, and record evidence for every cell. | running, execution, run |
| **Field spec** | The per-table-template field model produced by indexing (`spec.json`). Database-agnostic. | template model |
| **Schema model** | The per-source-database model produced by indexing (`model.json`): tables, columns, types, coded value sets, the filterable surface, identity links. | DB model, schema |
| **Field mapping** | The per-template record produced by mapping (`mapping.json`): for every field, the `database → table.column` where its **value** (direct) or its **evidence** (interpret) lives. Holds no SQL and no filter values. | the map |
| **Executable block** | The precomputed, parameterised read-only SQL + cell map + identity keys folded into the field mapping; the **prepopulate** plan. **Exists only for persisted templates**; without it, prepopulate is skipped. | the query plan |
| **Region** | A contiguous block of cells sharing one entity grain; the unit the mapping is organised by. | block, section |

## Table Population lifecycle & resolution

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Prepopulate / Table agent** | The two population steps: **prepopulate** (a deterministic bulk copy running the executable's fixed read-only SQL — only when a mapping/executable exists) → the **Table agent** (only when cells remain open; an ad-hoc table goes straight to it). The Table agent is the specialized **sub-agent** a Table population delegates to: a read-only agent session following the `table-fill` skill, working from the Table's **brief**. | tiers, passes, ladder |
| **Navigation** | How an agent **finds things** in Intero — the file-tree primitives below, generic over any **collection** (the clinical databases, the Datasets, the templates), never loading a whole schema. Full spec: [navigation.md](features/navigation.md); rationale [decisions/0005](decisions/0005-navigation-is-a-generic-verb-set-over-collections.md). | schema dump |
| **`navigate` skill** | The **databases specialisation** of **Navigation** — the shared read-only substrate agents use to find clinical data without loading a whole schema. | schema dump, lookup |
| **Navigation tools** | The four read-only file-tree primitives ([navigation.md](features/navigation.md)), each over a **collection**: **catalog** (`ls` → items + one-line summaries), **search** (`grep` → candidate items, each fully located), **describe** (`cat`/`stat` a node → a whole table/template *or* a single column/field, with its codes), **join-paths** (follow FK + measured identity edges; **databases only**). A clinical table's **structure** (names/types) is read **live** from the database; **meaning** (descriptions, code sets, identity links) and the **derived** join graph come from `model.json`. | lookup_execute |
| **`table-fill` skill** | The skill the **Table agent** follows to **fill a table** — navigate (via `navigate`), then write each open cell with a self-verifying source. Scope is a **hard cohort** (pinned to the table), tool-injected; the agent never writes filters. | cell-fill (former name), the agent (when ambiguous) |
| **Table request** | A tool-recorded request from the Primary thread agent to populate a Template as a Table. The tool records the user's intended output structure, scope, template context, and the **brief**; the backend owns pinning the Table and starting table population. | table router, hidden table branch |
| **Brief** | The user-intent text a **Table request** records and the pinned **Table keeps for life** — the delegation instruction the **Table agent** works from when populating (and re-populating) the table. | prompt, instruction (generic) |
| **Table population status** | The lifecycle status of the population process itself: whether the background work is live, completed, stopped, errored, or unknown. This answers "should the UI reconnect to the live stream?" | run status, spinner status |
| **Table result status** | The durable status derived from the table's cells: queued, in progress, blocked, needs review, or complete. This answers "what is the clinical state of the populated table?" | engine status |
| **Cohort injection** | How a **table** scopes the **Table agent** **without the agent managing filters**: the cohort identities + the navigation map live in the table-population context, and the `sql_execute` tool **ANDs the cohort predicate onto every queried table on the parsed SQL** (directly, via a cross-database identity bridge, or via a safe FK `EXISTS`), **rejecting** any table it cannot bind (fail-safe). For an **Answer** the posture is per-message + permission-bounded — see [Dataset](#datasets-scope--the-database). | filter append, prompt scoping |
| **Direct field / Direct value** | A value copied straight from a structured column (with code translation if needed). | mapped value |
| **Interpret field / Interpretive value** | A value inferred by the agent reading free-text notes; the mapping records **where its evidence lives**, and the agent reads it at run time. Visibly marked. | indirect, inferred, guessed |
| **Cell** | One populated position in a table, carrying a value, its metadata, and its evidence. | field |
| **Evidence** | The traceable source behind a **cell or a chat citation**: the exact query + record (direct) or the notes and highlighted passages (interpret). | proof, provenance |
| **Traceability** | The invariant that every value links back to its evidence, plus who ran it and when. | audit trail |
| **Refresh** | *(Deferred — not in the product.)* An in-place, incremental update of a completed audit to pick up source data that landed later. A run already completes in the background; refresh is the parked "re-check afterwards" feature. | reload, sync |
| **Re-run** | An idempotent re-execution that resolves only open cells and preserves reviewed/corrected cells. | redo |
| **Review (dwell-to-review)** | The safety gate by which a clinician dwells on an interpret value to mark it reviewed; a reviewed/corrected cell is preserved across re-runs. | approval, sign-off |
| **Blocked item / Blocked cell** | A cell that cannot complete, carrying a reason code and an owner; surfaced rather than fabricated. | error, failure |

---

## Relationships

- The **Hospital database** is the union of **source Databases** joined on **Identity links**; a **Dataset** slices it.
- A **Thread** is an **unscoped** conversation — *each message* scopes itself (a Dataset, or the whole DB). It produces **Outputs**: an **Answer** or a **Table**. **Scope binds to the Table** (pinned to one Dataset *or* the whole DB, fixed for life), not to the thread.
- An **Audit** is a **Table** populated within a **Dataset**'s (or the whole DB's) scope. *(Projects and Dashboards are deferred.)*
- **Indexing** produces a **Field spec** (per Table template) and a **Schema model** (per source Database); **Mapping** produces one **Field mapping** per persisted Template, spanning all databases.
- A **Field mapping** is organised into **Regions**; each field is **Direct** or **Interpret** — Direct fields compile into the **Executable block**, Interpret fields record **evidence locations** for the agent.
- A table population runs **prepopulate → the table agent** over **Cells**, each carrying **Evidence**; one that cannot resolve becomes a **Blocked cell**. **Prepopulate runs only when a mapping exists**; an ad-hoc table goes straight to the agent.
- The **Primary thread agent** owns output selection inside the Thread. It may ask clarification questions to understand the request; once clear, it produces an **Answer** or calls the **Table request** tool. A **Table** is then populated by delegation to the **Table agent** (following **`table-fill`**, working from the **brief**) and is tracked by an **Inspector**. *(A deferred **Dashboard** would build on a Table.)*
- Every **Thread** and every database query is attributed to a **User**.

## Example dialogue

> **Dev:** "A clinician opens a thread and asks a question about NICU babies — is that a table?"
> **Domain expert:** "No, that's an **Answer**. The thread is **unscoped**; *that message* scopes itself to NICU, the answer comes back with sources, and it discloses it answered for NICU. A **Table** appears only when they ask for a structured extract — and that table **pins its scope for life**."
> **Dev:** "And if they create a table in the thread but don't persist its template?"
> **Domain expert:** "Then there's no **mapping** yet, so we **skip prepopulate** and let the agent populate it from the schema model. Persist the template and we map it in the background, so next time the fast prepopulate step does the bulk."

## Flagged ambiguities

- **"view" vs "Dataset"** — earlier drafts said "view"; the canonical term is **Dataset**. A database/SQL view is a different (implementation) thing.
- **"table" (output) vs "source/database table" (SQL)** — a **table** is the front-end output, an **Artifact**; a SQL table in the schema is always qualified **"source table" / "database table"**.
- **"audit" overload** — "audit" is the **clinical-audit use case** and the populated **(Dataset × table) intersection**; it is **never a stored library object** (the stored objects are **Datasets** and **templates**).
- **"thread" vs "table population"** — the user-facing conversation is the **Thread** (unscoped); the background work that fills a structured table is **Table Population**. Do not use "run" or "session" for either concept.
- **"field" vs "cell"** — a **field** is a column in a table template; a **cell** is a populated position in the output.
- **"indirect" vs "interpretive"** — canonical: **interpretive**. Keep "indirect" only where a contract field is already named that way.
- **"artifact" reassigned** — earlier drafts used "artifact" loosely for indexing/mapping's own output files (`spec.json`/`model.json`/`mapping.json`); those are the **Field spec**, **Schema model**, and **Field mapping** — call them that. **Artifact** is now reserved for the Table/Dashboard concept above (an Output with its own id and sub-agent workspace). The storage contract names the population workspace `var/artifacts/<id>/` (keyed by the population id, `tp-<uuid>`). The Thread's **artifact-reference** fields are renamed to the Artifact vocabulary — `table_ids` → **`artifact_ids`**, `resolution.table_id` → **`resolution.artifact_id`** (both reference a Table's own `id`). **`table_population_id` is NOT renamed to `artifact_id`** — it is the *population* id (the run that fills the artifact), a distinct concept that keeps its own name. The store's `run_id` column (its internal name for the population id) also stays.
- **"cell-fill" vs "table-fill"** — canonical: **`table-fill`** (the skill fills a *table*; the cell is the unit it works in). "cell-fill" is the former name; storage and code paths still carrying **"audit"** for template artifacts are equally former names — the stored object is the **Template**.
