# Product Flows

Read [README.md](README.md), [personas-and-use-cases.md](personas-and-use-cases.md),
and [architecture.md](architecture.md) first. This document specifies the **user-facing
behaviour**: how a request becomes a scoped answer, the v1 outputs, the live table-population
experience, and the state coverage every screen must handle.

Intero is **operational intelligence**: a clinician reaches whatever information they need from
the hospital's data through a **thread** — a free-ranging conversation — and gets it back as a
**Answer** or a **table** (a populated audit), each fully traceable. A **clinical audit** is
one shape of this: a table **pinned to a slice** of the data. The hero is **information that arrives
scoped, structured, and traceable, with the risky values flagged for a human.**

> **v1 scope (deliberately cut hard).** The two things a user does are **(1) chat with the database**
> and **(2) run audits = populate complete tables.** **Dashboards, projects/folders, and thread
> sharing are deferred** — see [v1 scope](#v1-scope--what-is-deferred). Where this document still
> describes a dashboard, it is a **fenced, deferred** design retained for when a customer asks.

---

## The request flow

Every request runs through the same steps, whether it ends as an **Answer** or a **table**.
The shape mirrors this repo's specs-based-development method — **understand the intent, pin a
precise spec with the user, then execute against it.**

1. **Understand the query.** A request is a message in a **thread** — the free-ranging
   conversation (see [Threads, tables & outputs](#threads-tables--outputs)). The thread is **not
   bound to a Dataset**; the agent reads what *this message* is actually asking for.

2. **Resolve the scope — per message.** The agent decides, **for this message**, whether the
   question needs a precise slice (a Dataset) or runs against the whole hospital database. The
   thread carries no fixed scope — a later message can ask about a different slice.
   - If the inclusion criteria are **unclear**, it asks **at most one clarifying question** (with
     clear options to choose from); otherwise it proceeds with its **best-guess Dataset, shown as an
     editable element** the user can correct. It never interrogates.
   - When the scope is **clear** (often from the message itself), it confirms the **Dataset**
     as a **structured, editable element in the thread** — the inclusion criteria as label +
     value chips ([library-and-sources.md](features/library-and-sources.md)) — with a
     **"persist dataset"** action to save it to the data library for reuse.
   - Grounding the free text to real, validated filters happens either way (it is what scopes
     the answer or the table); persisting only saves it. A message with **no slice** runs against
     the whole hospital database. **For a table the resolved scope is pinned to that table for life**
     ([scope binds to the table](#the-table-population-seam--scope-binds-to-the-table-not-the-thread)); for a chat
     answer it scopes only that answer.

3. **Resolve the output — an Answer or a table.** Asked **only when genuinely ambiguous.** An
   obvious Answer is never interrupted with "do you want a chat?", but when a structured
   **table** would clearly serve, the agent offers it — the same one-question ceiling applies;
   otherwise it picks the obvious one and shows it editable. *(Dashboards are deferred — the only
   structured output in v1 is the table.)*
   - If a **persisted table template** in the Templates library matches the request, the agent
     suggests it.
   - Otherwise it **co-creates a new table spec** in a structured, editable thread element: the
     fields (columns) and the entity/grain (rows). The element offers three entry paths —
     **select an existing template, upload an Excel** (we parse fields + descriptions), or
     **describe it** (the agent derives a short description, the grain, and the fields) — and the
     user edits the suggestion directly, with a **"persist template"** action.

4. **Execute.** The agent works from the pinned scope + output. **Both outputs share one
   database-navigation substrate** — the `navigate` skill (catalog / search / describe /
   join-paths), so the agent finds data progressively without ever loading the whole schema
   ([table-population.md](features/table-population.md)). They differ only in the final step:
   - An **Answer** runs the **`chat-answer`** skill: navigate, then stream natural-language
     text with **inline citations** — **no cells**, answered inline in the thread. The
     answer is scoped to **this message's** resolved slice (or the whole DB) and **discloses what it
     scoped to**; the user's hospital permissions are the only hard wall (see
     [Scoping a chat](#scoping-a-chat--per-message)).
   - **Table** runs table population through the **`table-fill`** skill, **spawned as a sub-agent** — the
     thread is *not* forked, and an inline **inspector** tracks the job (see
     [Threads, tables & outputs](#threads-tables--outputs)). A **persisted** table has a
     `mapping.json` (computed in the background on persist), so table population starts with
     **prepopulate** (the executable's bulk read-only SQL), the **table agent** then working any
     cells still open — see [table-population.md](features/table-population.md), which also owns the
     read-only guard and the cohort count. An **ad-hoc** table just created in the thread has **no
     mapping**, so **prepopulate is skipped** and the agent populates directly, read-only. The table's
     scope is a **hard cohort, pinned for life**: the populated table equals the cohort, exactly
     ([decisions/0004](decisions/0004-scope-binds-to-table-not-thread.md)).

**Starting a known audit in one step.** A standard audit is a seeded **Dataset + table pair**;
naming it (e.g. "run the cord-pH audit for Q2") resolves the pair and populates with **no clarifying
questions** — the scope and the output are both already pinned by the pair, and a period like "Q2"
just fills the Dataset's date filter. This is the fast path for P1's recurring national/regional
audit; the four steps above are what a more open-ended request walks.

**Re-running for the next cycle (P2's cadence).** A department head re-running a standing audit each
quarter just names the pair again with the new period (or edits the Dataset's period chip and runs) —
producing a fresh populated table for **this** cycle's cohort. This **manual cadence re-run is
distinct from the error-recovery re-run** ([table-population.md](features/table-population.md), which re-attempts
the *same* table population's open/blocked cells); **auto-scheduled** overnight cycles are V2
([vision-100-days.md](vision-100-days.md)).

**Acceptance (request flow):**
- Each **message** resolves its own **scope (a Dataset, or whole-DB)** and an **Output (an Answer
  or a Table)** before executing; the agent asks **at most one clarifying question** and only when
  genuinely ambiguous — a clear request (e.g. naming a seeded audit) executes with **zero** clarifying
  questions. The thread carries **no fixed Dataset**.
- A confirmed Dataset and a created table each appear as a **structured, editable thread element**
  with a **persist** action.
- A table can be **selected, uploaded as Excel, or described**, all yielding the same editable
  spec.
- A **persisted** table runs prepopulate, then the table agent over any cells still open; an
  **ad-hoc** table **skips prepopulate** and runs on the agent. Both outputs find data through the
  **`navigate`** skill (catalog / search / describe / join-paths), never a whole-schema dump.
- An **Answer** runs the **`chat-answer`** skill (text + inline citations, **no cells**),
  scopes itself **per message** bounded only by the user's hospital permissions, and
  **discloses the scope it answered at** on every reply — never silently hospital-wide for a slice
  question.
- Producing a **table spawns a sub-agent** and shows an inline **inspector** in the thread; the
  thread is **not forked** and remains the only conversation surface; the table's scope is pinned for
  life.
- The agent **never fabricates** a value; missing/ambiguous data is flagged, not imputed.

---

## Threads, tables & outputs

### v1 scope — what is deferred
The two things a user does in v1 are **(1) chat with the database** and **(2) run audits =
populate complete tables.** Deferred (do **not** build now, retained as fenced design where noted):
**dashboards** (no customer has asked — the only structured output in v1 is the table), **projects /
folders** (the left panel is a **flat** list), **thread sharing** (only tables + library items are
shareable), and **table versioning** (in-place edits carry no version history yet).

### The table population seam — scope binds to the table, not the thread
A **thread** and a **table** are genuinely different things:

|              | **Thread** (the conversation)                          | **Table** (the audit artifact)                          |
|--------------|--------------------------------------------------------|---------------------------------------------------------|
| What it is   | Throwaway, free-ranging conversation                   | Durable — the actual value the user extracts            |
| Scope        | **Roams** — *each message* scopes itself (a Dataset, or whole-DB) | **Pinned to exactly one scope, fixed for life**  |
| Conversation | It *is* the conversation surface                       | **None of its own** — to discuss/iterate, attach it as context to a thread |
| Persistence  | Persists; recency-ordered, searchable, deletable        | First-class; its own left-panel section                 |
| Shareable?   | **No** (deferred)                                      | **Yes** — sharing it auto-grants its Dataset as access-only |

Fixing one Dataset per conversation is artificial for chat — you naturally ask about different
slices in one conversation — but a *structured* output must be pinned to one slice
([decisions/0004](decisions/0004-scope-binds-to-table-not-thread.md)).

### The left panel (flat — no projects)
Top → bottom: **New · Search · Datasets · Templates**, then a **Tables** section (every populated
audit, first-class and directly findable), then a **Threads** section (recency-ordered, searchable,
deletable). No grouping layer.

Because a department head re-runs a standing audit every cycle and **each cycle is a new table**
([Iterating a table](#iterating-a-table)), the **Tables** section must stay findable without folders.
Each populated table stores first-class attributes — its **source template** (or `ad-hoc` when
described in-thread with no template), a **title/description**, and a **reporting-period label** (from
its Dataset's date filter; falls back to the table-population date) — so the section is **recency-ordered**,
**searchable over title/description** (so even an ad-hoc, template-less table is findable),
and **filterable by source template** (e.g. "all my NNAP runs"), with the period on each card ("NNAP ·
Q2 2026") to tell cycles apart ([library-and-sources.md](features/library-and-sources.md)). This is
the v1 substitute for the deferred grouping layer.

**Row behaviour (shared across Tables and Threads).** Both sections render the **same row**: a title
that opens the item in the main panel, a hover-revealed **⋯ menu offering Rename and Delete** (rename
is inline — the title becomes an editable field), and the **selected row stays highlighted** so the
user always knows which table or chat they are in. Selecting an existing chat opens **that** chat —
never a flash of the empty composer or the previously-open chat. **New chat** opens an empty centered
composer but **does not create or list a thread until the first message is sent**, so pressing it
never litters the Threads section with empty chats.

**Table status dot (per-user "seen").** Each Tables row carries a small dot that reflects the wrapped
table population's real state: an **amber, pulsing dot while the table is still building**; a **solid blue
"finished, unopened" dot** once it completes, shown **until the current user opens its full grid**;
and **no dot** thereafter. "Opened" is **per-user** — a colleague opening the (shared) table does not
clear your dot — and is persisted server-side ([storage-layout.md](contracts/storage-layout.md)
`table_views`; [api.md](contracts/api.md) `POST /api/tables/{id}/open`, surfaced as the per-user
`opened` flag on the tables list). A **finished table opens instantly, fully populated** from the
persisted table-population snapshot and **never re-runs the agent**; only a table still building streams its cells
in live.

### Producing a table — pin, then spawn a sub-agent
A thread starts as a normal conversation. When the user asks for an **audit / table**, the thread
**first pins exactly what they want** (columns/grain + scope), **then spawns a sub-agent** to
populate it. **The thread is *not* forked** — there is no separate "table chat"; the single thread
stays the only conversation surface.

- The moment the sub-agent starts, a compact **inspector** component appears **inline in the thread**
  (a status card / "file" chip): *"Created your table — it's running."* From there the user can
  **keep chatting** — the table builds in the background and **they're notified when it's done** —
  **or click the inspector** to open the table in the **main panel** and start working immediately
  (watch cells fill live, click cells to review evidence).
- Because the model **encourages roaming** (the thread is unscoped; the user may move to another
  thread while it builds), **completion reaches the user wherever they are**: when the table
  finishes, a **toast notification with a hyperlink** fires, and clicking it **navigates straight to
  the table and opens it in the main panel**. It is **not** tied to the originating thread — the user
  is told and one click lands them on the finished table. The in-thread **inspector** also flips to
  its done state (decision: [open-questions.md](open-questions.md) Q42).
- The table itself has **no conversational chat** — only the live **activity feed** + a **summary
  footer** (open items / cells needing review). This reuses the existing run-activity feed
  ([table-population.md](features/table-population.md)); it is **not** a second chat.

### Iterating a table
The thread that produced a table can keep refining it (its inspector is right there); to pick a table
up in a **different** thread, **attach it as context** first. Either way:
- **Column/value changes happen in place** on the same table (live, never overwriting
  reviewed/corrected cells).
- **A different cohort produces a NEW table** — a table's scope is fixed for life. Because a clinician
  may expect an in-place edit, **the agent discloses the fork** ("that's a different cohort, so I've
  started a *new* table — your NICU audit is unchanged"), the same disclosure discipline as a chat
  answer's scope, and the new table gets its own inspector. A single thread can produce **several**
  tables over its life, all first-class in the **Tables** section.

**Panels.** The main panel shows one of: **thread (full)** · **table (full)** · **split**
(thread + table — used when asking about a table while it fills). The **right panel toggles
Activity ↔ Evidence**: during a run it shows the live agent narration ("reading the midwife's notes
for spell 145…"); click a table cell and it flips to that cell's evidence (the existing
cell-evidence structure). A chat citation opens the same evidence panel. *(On the table screen the
same panel also shows the table's pinned **Dataset** read-only via the settings icon —
[result-view.md](features/result-view.md).)*

**Inline citations.** An Answer carries its sources **inline**; pressing one opens the
**evidence** — explanation + the SQL query + the database output, or the highlighted notes —
reusing the cell-evidence structure
([traceability-and-evidence.md](features/traceability-and-evidence.md)). A citation on an
**aggregate** claim ("the average is 4.2 days") opens the aggregate's own query and the rows it
covered — the same structure, scaled to the aggregate, not a single arbitrary row.

### Scoping a chat — per message
The thread carries **no fixed Dataset**, so each message
**resolves its own scope** (the request flow above): a slice (a Dataset) when the question needs one,
or the whole hospital database. Crucially, **every answer discloses the scope it was computed at**, so
a clinician is never silently handed a hospital-wide number for a question they meant of a slice — and
the in-slice and whole-DB cases are **visually distinct** (a quiet scope chip in the clinician's own
words, e.g. "answered for NICU babies this quarter", vs. a **prominent inline callout** when an answer
is hospital-wide), so the routine label never becomes unreadable wallpaper and a departure stands out.
The **only hard wall is the user's hospital permissions** (the agent reads under the user's
credentials — [auth-and-access.md §11](features/auth-and-access.md); until that intersection lands the
ceiling is the registered read-only hospital database, [open-questions.md](open-questions.md) Q37).
This is why **scope binds to the table, not the thread**: a structured audit needs an exact, fixed
cohort, but a conversation roams ([decisions/0004](decisions/0004-scope-binds-to-table-not-thread.md)).

### Dashboards — deferred
**No customer has asked, so dashboards are not in v1** — the only structured output is the table. The
design is **retained, fenced**, for when one does: a dashboard is built **on a table**, its
**indicators computed deterministically** from the table's cells by **stored declarative formulas**
(the agent never aggregates — a fixed reducer does), each card showing its **denominator +
completeness** (blocked / unreviewed → **provisional**) and the agent choosing only the
**visualization**; point-in-time, with run-over-run history a further V2 item. Full retained design:
[table-population.md §Dashboard output (deferred)](features/table-population.md#dashboard-output-deferred). **Do
not build it now.**

**Which output, when.** An **Answer** for a one-off question; a **table** when you need the rows.
The agent picks the obvious one and only asks when it is genuinely ambiguous (the one-question ceiling
of the request flow).

**Leaving and returning — table population keeps working.** A table population (the populate sub-agent) is a **long-lived
background job**; it **keeps populating after the clinician leaves**, so on return the audit is
**further along or complete** — nothing is needed to resume it, and the thread's **inspector** reflects
the latest state. The produced table is **auto-persisted** as a first-class item in the **Tables**
section and **re-opens in its current populated state** — review flags, blocked items, and evidence
intact (resolves [open-questions.md](open-questions.md) Q36). *(Picking a completed audit back up
later, when **new** source data has since landed, is the **refresh** feature — **deferred**, see
[refresh.md](features/refresh.md). A cell blocked on absent source data stays blocked until a fresh
**re-run**.)*

### Sharing (in scope, narrow)
- **Shareable:** **Datasets**, **table templates**, and **populated tables**. **Threads are NOT
  shareable** (deferred — the value is the table; wait for users to ask before building thread
  sharing).
- **Sharing a populated table** auto-grants the recipient access to its **Dataset as access-only** (so
  they can see the cohort) — but the Dataset is **not** persisted into their Datasets library (they get
  the table; they may not care about the Dataset itself).
- **Sharing is editor-only and managed from the item's ⋯ → Share dialog** — a chip-input where each
  current grantee is a chip (remove to revoke) and a search adds colleagues. A received
  Dataset/template/table **appears in the recipient's normal library** — no "Shared" panel. A newly
  received **Dataset** also shows a blue Data library notification dot and a matching blue card until
  the recipient clicks **Keep** (clear the notification, keep the grant) or **Delete** (revoke the
  inbound grant and remove the Dataset from their library). *(Grant semantics — `resource_type` is
  `dataset`/`template`/`table`
  (thread/project not grantable), the table→Dataset access-only cascade, and editor-only sharing — are
  in [auth-and-access.md §10](features/auth-and-access.md) /
  [contract §5](contracts/control-plane-schema-and-permissions.md#5-resource-grants-and-sharing).)*

**Acceptance (threads & outputs):**
- The left panel is **flat** (no projects): **New · Search · Datasets · Templates · Tables · Threads**;
  threads are recency-ordered, searchable, deletable; tables are a first-class section.
- A **thread is unscoped** — each message resolves its own scope; producing a table **pins** its scope
  and **spawns a sub-agent**, surfaced by an inline **inspector**; the thread is **not** forked. On
  completion a **toast with a hyperlink** fires (wherever the user has roamed); clicking it opens the
  finished table in the main panel.
- The main panel is **thread / table / split**; the **right panel toggles Activity ↔ Evidence**; a
  chat citation opens the same evidence structure as a cell.
- **Tables, Datasets, and templates are shareable; threads are not.** Sharing a table cascades
  **Dataset access-only** without adding it to the recipient's library.

---

## The table-population experience

This is the hero interaction whenever a **table** is being populated (an audit, or any structured
extract). The concrete table-screen layout (top band, right panel, activity-eye states) is
specified in [result-view.md](features/result-view.md).

### Live, traceable population
- The **table chip** is emitted **when the table is created** (~seconds), not on completion. The
  table starts structured (headers present) and body-empty.
- Cells fill progressively — sometimes a whole region/column at once (one query), sometimes single
  cells. Newly filled cells flash briefly.
- A cell is clickable/traceable **as soon as it has a value + metadata**, while the rest of the
  sheet is still filling. Selecting a cell must not interrupt population.

### Streamed agent activity
- The agent's reasoning and tool calls stream to the **agent-activity feed** (the Activity side of
  the right panel; SSE — table-population event stream already exists in `core/table_population`). The table has no
  chat of its own; the conversation lives in the thread.
- **Collapsed = one fixed-height status line** (e.g. "Reading the midwife's notes…"). The row height
  must not jump as messages change.
- **Expanded = fixed-height scroll window** over the full reasoning. Auto-scroll to the bottom only
  when the user is already at the bottom; never yank them down while they read.

### Stop + re-run (pause/resume deferred)
- **Stop** ends table population; work already written persists. **Re-run** continues from the last completed
  region (idempotent) and **never overwrites reviewed/corrected cells**.
- **Refresh ("Check for updates") — re-checking a completed audit for source data that landed
  later — is deferred** ([refresh.md](features/refresh.md)). A table population **completes in the background**;
  **re-run** is the recovery path if table population errored, re-attempting open/blocked cells as a fresh table population
  (pinned to the same template version) without overwriting reviewed/corrected work.
- **True pause/resume is deferred to the 100-day vision** (leave-and-return — returning to a still-running job — ships)
  ([vision-100-days.md](vision-100-days.md)). The product ships stop + re-run. See
  [table-population.md](features/table-population.md).

### The interpretive safety gate
*(CEO decision D1, 2026-06-04.)*
- **Direct** values (copied from a structured table) populate and count immediately, with no review
  flag.
- **Interpretive** values (inferred by the agent from free-text notes) are populated **immediately
  too** — the agent fills everything so the user can start clicking through at once. But each
  interpretive cell carries one of **two distinct flag states**: **not yet reviewed** (right after
  population) and **reviewed** (after the user has opened it and looked at the evidence).
- The two states are **visually distinct**, so at a glance the user sees which interpretive cells
  they have already checked and which still need their eyes. An interpretive value does **not count
  as final** until it is in the reviewed state.
- **Reviewing is just looking — no confirm button.** A **single click** opens the evidence (the
  notes with the relevant passages highlighted); after a brief look (~2s) the cell **auto-flips to
  reviewed**. To **correct** a value the user **double-clicks the cell to edit** it. Whether they
  edited it (corrected) or left it (confirmed) is the signal the 100-day self-improvement loop feeds
  on; see [vision-100-days.md](vision-100-days.md).
- The **accuracy bar** (submit-ready = all interpret cells reviewed) is specified in
  [table-population.md](features/table-population.md) and
  [traceability-and-evidence.md](features/traceability-and-evidence.md).

### Confidence heat-map
*(CEO expansion E2, accepted into the product.)*
- Every cell carries a **confidence** and a **kind** (direct / interpretive).
- The table is tinted into a **trust heat-map**: high-confidence direct values read as "settled",
  interpretive / lower-confidence values read as "needs your eyes", so the clinician's attention
  routes to the cells that matter instead of all of them.

### Final summary message
*(Where blocked items surface — [status-and-blocked-items.md](features/status-and-blocked-items.md).)*
- When table population finishes, the agent posts a **structured final summary as the terminal entry of the
  agent-activity feed** (the `review_summary` event; [result-view.md](features/result-view.md))
  stating what it completed and **explicitly listing any blocked values and why / who** — e.g.
  *"Table populated. Three values are blocked: the orthogeriatric review note for spells 123 and 145
  hasn't been written yet."* **The feed is the summary's only home** — there is no summary banner
  above, below, or over the table.
- The top band's compact **blocked / needs-review counters** mirror the summary's two queues at a
  glance, even with the panel closed.
- The **table stays clean** — missing values are **empty cells**, no markers, no appendix — and the
  **download is never blocked**: a partial table downloads as the plain template at any status.

---

## State coverage

*(Every screen handles all of these — empty states are features.)*

| Surface | Empty | Loading | Error | Partial |
| --- | --- | --- | --- | --- |
| Home / threads | "no threads yet" + new-thread CTA | skeleton | load failed + retry | — |
| Datasets / Templates / Tables | "no Datasets / templates / tables yet" | skeleton | load failed + retry | — |
| Indexing / mapping | — | "indexing…" / "mapping…" badge + explainer | failed + retry | — |
| Table-population activity | — | streaming activity | population error + reason | stopped / partial table population |
| Table | structured, body empty | cells filling (flash) | populate error per region | some cells filled, rest pending |
| Cell / citation evidence | "no evidence" (should not happen for filled cells) | evidence loading | evidence fetch failed | interpretive: flagged, unverified |
| Missing / blocked cell | left **empty** in the table; the reason is surfaced in the agent's final message + status, not in the cell ([status-and-blocked-items.md](features/status-and-blocked-items.md)) | — | — | — |

Beyond per-surface states, each populated table carries a **result status** — Queued / In
progress / Blocked / In verification / Complete — surfaced in v1 by the table's **top-band counters**
(the cross-audit **Kanban board is next-phase**); see
[status-and-blocked-items.md](features/status-and-blocked-items.md). A cell the agent **cannot** fill
becomes a **blocked item** (reason + owner to chase), kept distinct from a cell that **needs
verification** (the interpretive review gate above). Blank cells must carry an explicit reason
(`missing` / `unknown` / `not_available`), never a fabricated value.
