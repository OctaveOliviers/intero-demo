# Open Questions

Decisions still needed — written for the cofounders to answer precisely. Each is a real
fork: where there's a working assumption, it's stated so we can proceed until overridden.
Grouped by who owns the call.

---

## Commercial / go-to-market

**Q1 — Who holds the budget?** The product is clinician-operated, but clinicians rarely control
spend. Is the payer **clinical governance**, the **BI / data-warehouse budget**, or a
**department**? *Why it matters: it changes the pitch and the buyer. Surfaced as the main
gap in the CEO review — we changed the operator to clinicians without re-validating the
payer.*

**Q2 — Is the BI / data-warehouse analyst a channel, even though they're not the operator?**
They feel the pain and hold procurement relationships. *Why it matters: the office-hours doc
argued they're the fastest route to a procurement conversation; we removed them as a user but
not necessarily as a champion.*

**Q3 — Direct-to-Trust or partner with an incumbent (AMaT, Radar Healthcare)?** *Why it
matters: distribution vs control; affects whether we build for their forms or our own.*

**Q4 — Sanofi / pharma: same product or a different one?** *Why it matters: focus. Is it the
same core with different data sources, or a separate RWE/health-economics product?*

## Product scope

**Q5 — How far does ad-hoc go in the product?** It's the lowest-priority trigger.
*Assumption: a basic build-then-populate, behind the same engine. Confirm we're not stubbing
it entirely vs investing more.*

**Q6 — Which national audit is the first commercial proof?** The motion is identical to the
cord-pH regional demo, but national is the highest-value trigger. *Why it matters: we need a
concrete first national template + its deadline to anchor the pitch.*

**Q7 — How many databases for the first demo?** Just cord-pH, or a real multi-database
scenario (EHR + labs + radiology) to prove the N-database capability on camera? *Why it
matters: demoing multi-database needs ≥2 real datasets prepared.*

## Clinical safety & trust

**Q8 — What interpretive accuracy bar do we need before we trust/demo it?** The tracked metric
is the **not-edited rate** (reviewed interpret cells the clinician didn't correct). *Why it
matters: defines "good enough" for the safety gate and for showing a clinician.*

**Q9 — Is `low` / `medium` / `high` confidence enough, and how does the agent decide the
level?** *Why it matters: confidence drives the heat-map and routes attention; if the agent
can't assign it meaningfully, the signal is noise.*

**Q10 — Where exactly is the human-in-the-loop line?** Interpret cells already require review.
Do **low-confidence direct** values also need review before they count? *Why it matters:
trades safety against the clinician's time.*

## Auth, data & infrastructure

**Q11 (resolved 2026-06-08) — the product auth baseline.** Use local Intero accounts + server-side
sessions now, designed for later SSO replacement. Remaining open detail is only deployment
policy values (for example final timeout lengths with hospital IT).

**Q12 (resolved 2026-06-08) — Control-plane persistence model.** The architectural contract is
one logical control-plane data model (IAM + catalog + runtime + logs), with current split
stores (`state.db` + `auth.sqlite`) treated as transitional implementation. Production target
is hospital-hosted transactional storage planned with Trust IT.

**Q13 — IG sign-off path for a de-identified demo at a Trust?** *Why it matters: even a
de-identified demo can require information-governance review, which can block the date.*

**Q29 — Session length & timeout policy.** *Assumption: session cookie + 8-hour expiry +
30-minute idle timeout (see auth-and-access.md §Persistence, the `sessions` table). Confirm with hospital IT —
some Trusts mandate specific session lengths.* (Extends Q11.)

## Technical

**Q14 — OpenCode vs direct Claude API for the run agent?** *Why it matters: stability. The
current orchestration depends on OpenCode versioning; a direct API may be more reliable for a
product.*

**Q15 — How is interpret-value evidence shaped and returned by the populate spec / executor, and how do we
enforce the verbatim-passage rule?** *Why it matters: the agent must return note passages
word-for-word (not paraphrased) for the traceability highlight to be honest. Residual from
the CEO review's precompute decision.*

## Library & sources

**Q16 — Refresh mechanism.** Automated scrape/ingest of national-audit + BPT schemas vs. a
manual curation queue — and what **approval gate** sits before a new audit-year version goes
live in the library? *Why it matters: governs how the version-tracked library stays current
without silently shifting a running job's basis.*

**Q17 — What is the "Regional" level?** ICB-shared templates? And is it in scope, or do we
ship **National / Local only** for v1? *Why it matters: the library groups cards by level; an
undefined level can't ship.*

**Q18 — Fork semantics.** How does a Local audit cloned from a national template **show its
divergence** from the source, and does it **re-base** when the national version updates? *Why
it matters: avoids silent drift between a local fork and the national source of truth.*

**Q19 — BPT pricing placement.** Where do base price, BPT price, conditional top-up, MFF, and
SSEM attach — to the template card, or a **separate pricing-reference item** the template links
to? *Why it matters: keeps clinical criteria and finance cleanly separated.*

**Q20 — Verify two measurement vehicles.** Confirm **DKA / hypoglycaemia** and **Parkinson's**
against the full Annex C text before building their templates. *Why it matters: both are
flagged uncertain; building on a wrong basis wastes the synthesis.*

## Completion status & blocked items

**Q21 — Owner inference.** How reliably can the agent name the responsible role/specialty from
the record, and what is the fallback when it cannot (a generic "data team" owner)? *Why it
matters: the chase only works if it reaches the right person.*

**Q22 — "Expected by" dating.** Is there a source for when a value *should* have been recorded
(to compute how overdue a gap is), or is age-of-gap measured only from the first run? *Why it
matters: prioritising chases and showing overdue-ness.*

**Q23 — Reminder channel.** In-app list only for the product, or integration with email/messaging
(which raises gated-send and IG questions)? *Why it matters: the scope and governance of any
outbound action.*

**Q24 — `AWAITING_RESULT` vs `MISSING_SOURCE_RECORD`.** Where is the threshold when a result is
expected but not yet ordered? *Why it matters: the reason code drives who gets chased.*

**Q25 — Merge IN VERIFICATION and BLOCKED into one "Needs attention" column for now
simplicity?** *Recommendation: keep separate — different owners, different actions. Why it
matters: conflating them routes the wrong action to the wrong person.*

## Operational-intelligence redesign (2026-06-24)

The product is reframed from an audit tool to **operational intelligence** organised around
**Datasets** (saved filters) and **threads** (free-ranging, **unscoped** conversations). In v1 there
are **two outputs — chat and table**; **scope binds to the table** (pinned for life), not the thread.
*(2026-06-25 simplification: **dashboards and projects are deferred**, **threads are not shareable** —
[product-flows.md](product-flows.md), [decisions/0004](decisions/0004-scope-binds-to-table-not-thread.md).)*
An **audit** is a populated table. New decisions and flags:

**Q30 (resolved 2026-07-06, built) — Contract break: `cell.resolved_by` and the cell-resolution
triage.** `try_llm` is deleted; table population is **prepopulate → the table agent**
(`core/table_population/populate.py`). The contracts carry the two-step vocabulary:
`cell.resolved_by` is `prepopulated` / `agent`, an attempt is keyed by `by`
(`prepopulate` / `agent`), and the per-cell LLM triage is gone from
`cell-resolution.schema.json` / `state-schema.md`.

**Q31 — Additive contracts owed.** The redesign needs new contracts: a **`dataset`** artifact +
schema (`var/datasets/<id>/`) and catalog entity; **`thread` + `table` entities** (the runtime
`run`/`run_id` becomes a populate pass **inside a `table`**); **chat + table endpoints**;
`resource_grants.resource_type` **gains `dataset` and `table`, and drops `thread`/`project`** (threads
non-grantable; the **table→Dataset access-only cascade** is encoded here); and the **`fixed_criteria`
migration** out of `mapping.schema.json` into Datasets. *Specified in prose; the
schema/storage/api/control-plane contracts are extended in a follow-up, not this pass.*
*(Landed since: the **`dataset`** artifact + [`dataset.schema.json`](contracts/dataset.schema.json) +
`/api/datasets` endpoints (#287); the **`thread` + `table`** entities (#297); and the **`resource_type`
change** (`dataset`/`template`/`table`, drop `thread`/`project`) + the table→Dataset access-only
**cascade** + editor-only sharing (the §10 sharing build) — STATUS.md tracks it. Still owed: **chat
endpoints** (Track C) and the `fixed_criteria` migration. **Deferred (not owed for v1):** `project` entity, **dashboard endpoints**, and the
**`dashboard.json`** schema — picked up only if dashboards are built.)*

**Q32 — Nested Datasets.** v1 is **flat, no nesting**. Do levelled/nested Datasets (a department
Dataset inheriting an org Dataset's predicates) earn their keep later? *Assumption: flat for now.*

**Q33 — Projects / folders. Decided (2026-06-25): deferred.** The left panel is **flat** — no
grouping layer; threads are a flat, recency-ordered, searchable list. Revisit only if users ask for
grouping. *(Supersedes the earlier "how threads group into projects" question.)*

**Q34 — Editable Dataset SQL.** The raw-SQL view is read-only in v1 (the chips + the add-filter row
are the edit surface). Promote to editable-SQL-as-data later? *Assumption: read-only for now.*

**Q35 — Pre-populating audits.** Precompute is tied to persistence (mapping on persist), but the
**populated** audit is not pre-run. Pre-running recurring national audits overnight is the deferred
V2 scheduled run ([vision-100-days.md](vision-100-days.md)). *Assumption: not now.*

**Q36 — Where a populated table lives.** **Decided (2026-06-24, refined 2026-06-25):** a populated
**table** is **first-class** — its own card in the **Tables** section of the (flat) left panel — and
**auto-persisted, re-openable in its populated state** (review flags + blocked items intact), so a
clinician can leave a partial audit and **return to find it further along or complete — the run keeps
populating in the background** ([product-flows.md](product-flows.md)). It is **not filed under a
thread** (a thread roams and may produce several tables); no refresh is involved (deferred).
*Residual:* the **retention policy** for populated tables.

**Q41 — Unstructured-note filters as a follow-up capability.** V1 is structured-only and routes
free-text-only concepts to `not_available`; follow-up asks for filter criteria that are expressed only
in narrative notes (for example comorbidity phrases). Proposed shape is a two-step scope: (1) run the
current deterministic structured filters first to form a candidate cohort, then (2) run an agentic
note-qualification pass over those candidates and retain only entities that satisfy the unstructured
criterion with traceable evidence. *Why it matters: this expands Dataset scoping safely without turning
the first-pass cohort resolution into an opaque LLM step.*

---

## Output resolution & database navigation (2026-06-25)

*(Raised while specifying how the agent resolves and produces the v1 outputs (chat + table) — see
[product-flows.md](product-flows.md), [table-population.md](features/table-population.md) §`navigate` /
Chat output, and [decisions/0004](decisions/0004-scope-binds-to-table-not-thread.md).)*

**Q43 — Agent tooling contract: `navigate` + the `chat-answer` skill (owner: build).** The
contract must define the **`navigate` skill** and its four tools — `catalog`, `search` (grep),
`describe`, `join-paths` (these four **split** today's single `lookup_execute` into one
single-purpose tool each — `catalog` over all bound databases, `search`/grep over `model.json`
metadata; `lookup_execute`'s **audit-spec** reads stay on a separate small tool) — plus the
**`chat-answer`** skill (navigate →
answer + inline citations, no cells; per-message scoping bounded by permissions). *Specified in
prose; the tool/skill contracts are defined in a follow-up (with Q31), not this pass.* **Open detail:**
`search`'s ranking/semantics (keyword vs. embedding). *Working assumption: keyword search over
`model.json` descriptions/names/code-sets for v1.* The same `catalog`/`search` **verbs generalise over
the Datasets and Templates libraries** — so the thread agent finds a reusable slice/template (or
decides to spin up a one-off) by keyword instead of listing all of them — **reusing the generic core**
([ADR 0005](decisions/0005-navigation-is-a-generic-verb-set-over-collections.md)); keywords ride on
`description` (no separate field). **Shipped:** the thread agent's worktree projects the caller's granted Datasets/Templates per-id (fail-closed) and the collection verbs browse them ([storage-layout.md](contracts/storage-layout.md) §3).
**Deferred (not owed for v1):** the **dashboard reducer**, **`dashboard.json`**, and the **viz
vocabulary** — picked up only if dashboards are built.

**Q44 — Dataset/Template write tools: patch grammar + approval-token mechanics (owner: build).**
The thread contract keeps the agent's resource-change `proposal.patch` **opaque**
([thread.schema.json](contracts/thread.schema.json) `#/$defs/resource_change_proposal`;
[ask-user-questions.md](features/ask-user-questions.md) §Structured proposals) because the Dataset and
Template editors are still moving. Owed: the concrete patch grammar per resource type, the write
tools/routes that consume an approved proposal (server-side verification — the backend re-checks the
grant and the token, validates the payload, and writes atomically; ADR 0006), and the token transport
+ lifetime mechanics. Until then the agent may only *propose*; nothing consumes a proposal.

**Q40 — Chat scoping enforcement (owner: build + clinical safety).** For a **table** the cohort is
enforced mechanically (`sql_execute` rejects an unbindable query) and is **pinned to the table for
life**. A **thread is unscoped**: a **chat** answer scopes **per message**, the agent managing its
own scope **within hospital permissions** — so a mis-scoped Answer is a *correctness* bug, never
a safety breach (it can't exceed the user's access). *Decided (D0004):* scope binds to the table, not
the thread; permissions are the only hard wall; the answer **discloses what it scoped to**. **Open
detail:** does `sql_execute` run in a distinct, looser *chat mode* (no cohort injection,
permission-bounded) or does the chat agent simply not invoke the cohort path? — a build decision, not
a product fork.

**Q42 — Front-end flow: the sub-agent + inspector.** Producing a table **spawns a sub-agent** the
thread tracks via an inline **inspector** ([product-flows.md](product-flows.md)). **Decided
(2026-06-25) — completion notification:** when a table finishes, fire a **toast notification carrying
a hyperlink** that navigates straight to the table and **opens it in the main panel** — so the user
is told wherever they have roamed (it is not tied to the originating thread), and one click lands
them on the finished table. The in-thread **inspector** also flips to its done state. *Residual
(design):* the split-panel transition choreography (thread / table / split) when the table opens.

---

## Hospital-role RBAC (2026-06-25)

*(Raised while writing [features/auth-and-access.md](features/auth-and-access.md) §9–§15 and the
[control-plane contract](contracts/control-plane-schema-and-permissions.md) — the RBAC layer that sits
alongside the catalog/grant work **Q31** owes. Each logged here per "never a silent assumption".)*

**Q37 — Hospital DB-permission mechanism (owner: cofounders + Trust IT) — external dependency.** *How*
does Intero obtain/enforce each user's existing hospital DB permissions at query time — per-user DB
credentials, an imported permission map, or DB-enforced via the user's session? *Working assumption:
per-user SSO / hospital credentials passed through, with the agent reading as the user; enforcement is
**fail-closed** until resolved. Intero applies only the Dataset's scope filters and never broadens
access ([auth-and-access.md §11](features/auth-and-access.md), [contract §6](contracts/control-plane-schema-and-permissions.md#6-clinical-data-access)).
Why it matters: the entire (Dataset ∩ hospital-permissions) rule rests on it, and it is deliberately
**not designed** in this spec. **Pilot blocker (not a demo blocker):** because enforcement is
fail-closed, a real-Trust deployment reads **nothing** for any clinician until this mechanism is
wired; the de-identified/synthetic demo is unaffected (its data has no per-user hospital permission to
intersect). So the first real-patient-data pilot is gated on Q37; the demo is not.*

**Q38 — Departed-user recovery policy (owner: cofounders + Trust IG).** `admin` is now a
clinician-superset **peer** ([ADR 0003](decisions/0003-admin-is-a-clinician-superset.md)), so it reads
clinical data within the hospital's permissions like anyone — but, being a peer, it still **cannot open
another owner's** Datasets/threads without a grant. The recovery *mechanism* is specified — an
IAM-level, metadata-only **ownership reassignment**
([contract §11](contracts/control-plane-schema-and-permissions.md#11-ownership-reassignment-a-clinician-leaves),
[auth-and-access.md §9 IAM](features/auth-and-access.md)) — that re-points a deactivated user's
resources to a named active clinician so the work is reachable again. **Residual policy (still open):**
what *triggers* deactivation, who approves a reassignment, and how long a leaver's runs/PID are
retained. *Why it matters: the capability exists, but the governance around invoking it is a Trust-IG
call.*

**Q39 — Strict admin/clinical separation as a deployment option (owner: cofounders + Trust IG).**
[ADR 0003](decisions/0003-admin-is-a-clinician-superset.md) makes `admin` a **clinician-superset** by
default, accepting that an account-administrator can see PID (bounded by the hospital's permissions,
Q37). A Trust whose IG **requires** strict administrator/clinical separation would need that
re-introduced — *what shape?* *Working assumption: a deployment-time switch that drops the `clinician`
permission set from `admin` (reinstating the infra-only role of superseded
[0002](decisions/0002-it-infra-only-and-dataset-scoped-access.md) decision #1) and the two-account
model — a role-catalog/policy change, **no schema migration**.* *Why it matters: it decides whether a
strict-IG Trust can adopt. **Not a demo or first-pilot blocker** (synthetic data, single operator) — a
sales-time question for the first strict-IG Trust.*

---

## Rigor review (2026-06-04)

**Q26 — Prompt version on re-run.** A re-run pins the same template version (library-and-sources.md); should it
also pin the **prompt version**, or always use the latest? *Why it matters: a re-run with a
newer prompt changes the basis vs the original run.*

**Q27 — Low-confidence direct values.** Direct values count immediately, but the heat-map tints
low/medium as "needs eyes" — should a **low-confidence direct** value require review like an
interpret cell? *Why it matters: resolves the mixed signal; relates to Q10.*

**Q28 — Re-run idempotency.** On re-run (the product's recovery path, pause/resume deferred),
does the executor correctly **skip already-completed regions** with no double-write and no
skipped cell? *Why it matters: re-run is the only resume mechanism in the product, so it must be
exactly idempotent.*

---

*Resolved since the 2026-05-29 office-hours doc (no longer open): operator = clinicians/dept
heads (not BI analyst); interpretive values are in the product (not deferred to v2); terminology =
"audit" everywhere; precompute = a **parameterised SQL spec + fixed executor** (the
`executable` block in `mapping.json` replaced the earlier generated
`populate.py`). The superseded positions are recorded in the project's git history.*
