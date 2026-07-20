# Build: the thread + table front-end flow + narrow sharing (Intero v1) — Track B

> Build-loop orchestration prompt. Working artifact, not a spec — safe to delete or gitignore
> once the build lands. The verifiable success criteria are duplicated into the goal-skill "goal
> condition"; this file holds the full method.
>
> **One of three split build-loops** — see [threads-tables-build-loop.md](threads-tables-build-loop.md)
> for the map. This is **Track B: the thread/table front-end flow + sharing**. It **reuses the
> already-shipped table-population `table-fill` engine** (which runs on today's `lookup`), so it is
> **independent of Track A (`navigate-db`)** and both can run in parallel. **Track C (chat-with-DB)
> depends on this** — chat renders inline in the thread surface this track builds — so leave a clean
> chat **seam** and do not implement chat here.
>
> **Builds on the landed Dataset primitive** (`var/datasets/<id>/`, `dataset.schema.json`,
> `/api/datasets*` — #287) and the existing table-population **table** flow (`core/table_population`, `table-fill`),
> streaming/activity feed, and evidence panel — **all already exist; reuse them, don't rebuild.**

I'm building the **front-end thread/table flow** so a clinician opens a **thread** (a free-ranging,
**unscoped** conversation), and — when they want an audit — gets a **table** that is **pinned to one
scope for life**, populated by a **spawned sub-agent** they track via an inline **inspector**, surfaced
as a first-class card they can re-open. Plus **narrow sharing** and the **additive contracts** (thread +
table entities, the `resource_type` change + cascade, table endpoints, the `fixed_criteria` migration).
The engine already exists — this is the FE flow + the contracts. Scope it at the top of your range, but
stay strictly inside the boundary below.

## Read first — completely, before any code
- intero/specs/README.md — the index of where every spec lives; defer to it for paths
- intero/specs/STATUS.md — what's shipped vs owed: Dataset ✅ (#287); table-population `table-fill` ✅;
  **thread+table FE, the Tables/Templates left-panel sections, and sharing are ⬜ open (your build)**
- intero/specs/product/product-flows.md — **the load-bearing spec.** Read **§The request flow**
  (per-message scope → output → execute — you build the **table** branch; the **chat** branch is a
  seam for Track C), **§The table population seam — scope binds to the table, not the thread**, **§The left panel
  (flat — no projects)**, **§Producing a table — pin, then spawn a sub-agent**, **§Iterating a table**.
  *(Skip **§Scoping a chat — per message** — that's Track C.)*
- intero/specs/product/features/table-population.md — the existing **table-population flow** you **reuse** (do
  **not** rebuild it) and the **sub-agent / inspector**. *(Skip **§Chat output** — Track C; skip
  **§Dashboard output** — deferred.)*
- intero/specs/product/features/library-and-sources.md — the **Datasets / Templates / Tables**
  libraries and **§Sharing — narrow (v1)** (Datasets/templates/tables shareable; **threads not**;
  editor-only Share dialog chip-input; received Datasets show the Data library notification +
  Keep/Delete until handled; table→Dataset **access-only** cascade)
- intero/specs/product/features/traceability-and-evidence.md — the **evidence panel** (reused for cell
  evidence; the right panel toggles Activity ↔ Evidence)
- intero/specs/product/decisions/0004-scope-binds-to-table-not-thread.md — WHY scope binds to the table
  and the thread roams (Accepted, 2026-06-25; build to it, do not re-litigate)
- intero/specs/product/acceptance-criteria.md — your done-source: the **§Flows** bullets (thread
  unscoped; each message resolves scope + output; producing a table **spawns a sub-agent** tracked by
  an inline **inspector**, the thread is **not forked**) + the **§Library & sources** sharing bullet
- intero/specs/product/README.md + architecture.md + CONTEXT.md — the canonical glossary; use these
  terms exactly (**thread**, **table**, **inspector**, **Dataset**, **scope**, **table-fill**)
- intero/specs/product/open-questions.md — read the CURRENT text of each:
  - **Q42** — sub-agent + inspector. **DECIDED (2026-06-25):** completion fires a **toast with a
    hyperlink** that opens the finished table in the main panel. **Only** the split-panel transition
    *choreography* remains a taste call → that is the `/prototype`-and-surface part, nothing else
  - **Q36** — **DECIDED:** a populated table is a **first-class, auto-persisted, re-openable card** in
    the Tables section; the **background run continues** even if the user navigates away (build to this)
  - **Q31** — your owed additive contracts: **thread** + **table** entities, the `resource_type` change
    (+ `table`, − `thread`/`project`) + the table→Dataset cascade, the **table** endpoints, and the
    **`fixed_criteria` migration** out of `mapping.json` onto the Dataset. *(Dataset itself landed #287;
    the **chat** endpoints are Track C, not here.)*
  - **Q30** — the cell-resolution **re-freeze** is **out of this track** unless you touch that contract
    (you should not — the table run is reused unchanged)
- The existing code you extend: `app/src/lib/api.js` (**the one FE↔BE seam** — every call is
  mock-or-fetch; the mock layer must mirror the server shapes); the Svelte app; `core/table_population/try_agent.py`
  (sub-agent spawn) and the streaming/activity feed; the server routes (`server/main.py`, `server/routes/`)
- intero/specs/product/contracts/ — `dataset.schema.json` exists; you **ADD** the `thread` + `table`
  entities (+ schemas, `storage-layout.md` paths e.g. `var/threads/`, `var/tables/`), the **table**
  endpoints in `api.md`, the `resource_type` change + cascade in
  `control-plane-schema-and-permissions.md`, and the `fixed_criteria` migration out of `mapping.json`
There is no pre-written build plan — you slice it into issues next.

Skills this prompt names (`/to-issues`, `/tdd`, `/prototype`): invoke each as a skill;
if your harness won't auto-invoke it, read and follow its `SKILL.md` in `.agents/skills/`.

## Commands — use these exact ones, don't guess (run from intero/)
- Setup (once): `python3 -m venv .venv && source .venv/bin/activate && uv pip install -r requirements.txt`; `cd app && npm install`
- Test (Python, unittest — all three, all must pass):
  - `python3 -m unittest discover -s core -p '*_test.py'`
  - `python3 -m unittest discover -s core/table_population/tests -p '*.py'`
  - `python3 -m unittest discover -s server -p '*_test.py'`
- Test (front-end): `cd app && npm test`
- Lint/format: `ruff check .` and `ruff format --check .` (the pre-commit gate)
- Seed + run backend: `make seed` then `make dev` (FastAPI on :8000); UI: `cd app && npm run dev` (:5173)

## Slice the work into issues — run /to-issues
Break the spec into **vertical-slice issues on the tracker** with the `/to-issues` skill: each is a
thin slice through all layers (entity/contract + API + UI + tests), verifiable on its own. Order them
in dependency order. Suggested slice — **issue #1 is the thinnest end-to-end slice**:
1. **Thread surface + the request-flow router (table branch).** A thread is the only conversation
   surface — it **persists**, is recency-ordered/searchable/deletable, and **does not fork**. Each
   message resolves **scope → output → execute**; build the **table** branch end-to-end. The **chat**
   branch is a **clearly-marked seam** (a stub the agent routes to for Track C) — **do not implement
   chat**. Lands the `thread` entity + persistence.
2. **Producing a table — pin + spawn sub-agent + inspector + toast.** Asking for a table **pins** its
   spec (columns/grain + scope) and **spawns table population** through `table-fill`; an inline **inspector** shows running → done with **click-to-open**
   (table → main panel) and a **completion toast with a hyperlink** (Q42). The table **auto-persists as
   a first-class, re-openable card** in the Tables section and its **background table population survives navigation**
   (Q36). Lands the `table` entity + endpoints.
3. **Scope-binds-to-table + iterate in place.** The table's scope is a **hard cohort, pinned for life**;
   **column/value changes happen in place** on the same table; **a different cohort produces a NEW
   table** (the agent discloses the fork). Build to decision 0004.
4. **Flat left panel + the three-panel layout.** Top → bottom: **New · Search · Datasets · Templates ·
   Tables · Threads** (no projects). Main panel = **thread / table / split**; right panel toggles
   **Activity ↔ Evidence**. The **Tables** section lists every populated audit as a first-class card.
5. **Sharing (narrow).** **Datasets**, **table templates**, and **populated tables** are shareable;
   **threads are not**. Sharing a table cascades **Dataset access-only** (recipient gets table access;
   the Dataset is **not** added to their Datasets library). Sharing is editor-only and managed from the
   item's Share dialog chip-input; received items appear directly in the recipient's normal library;
   newly received Datasets show Data library notification + Keep/Delete until handled.
   Lands the `resource_type` change (+ `table`, − `thread`/`project`) + cascade + 401/403.

`/to-issues` tags each slice **AFK** (an agent can finish it unattended) or **HITL** (a taste call — the
split-panel choreography of Q42, or a DB/artifact migration), and records blocking relationships (2→1,
3→2, 4 parallels 2/3, 5→2). The **issue list is the persisted task board**; the per-issue
*implementation* plan stays ephemeral — derive each from [INSTRUCTIONS.md](INSTRUCTIONS.md) (the
backwards, output-first method) in working memory, not committed.

## How you run — you are the orchestrator
Work the issues in dependency order; run non-blocked issues in parallel.
For each issue:
1. Dispatch a builder subagent to implement just that issue, **test-first via the `/tdd` skill** (red →
   green → refactor, tested through public interfaces). Run independent builders in separate worktrees.
2. **Reuse, don't reinvent.** The table-population `table-fill` run, the sub-agent spawn (`try_agent.py`), the
   streaming/activity feed, and the evidence panel **already exist**. This build ADDS only: the
   thread/table FE flow + the additive contracts. A builder that rebuilds the table run, the cohort
   injection, the streaming, or the evidence panel has failed the issue. The `navigate-db` tool work is
   **Track A** — the table run uses today's `lookup`; do not touch navigation here.
3. Authoring the additive contracts (`thread`+`table` entities, the `resource_type` change + cascade,
   the table endpoints, the `fixed_criteria` migration) is **part of the relevant issue and does NOT
   pause** — get it right from the spec and proceed. The completion-notification is **already decided**
   (toast + hyperlink); the **only** genuine taste call is the split-panel transition *choreography* →
   use `/prototype` (a few switchable UI variations) and surface it.
4. **Keep chat a seam.** When the request-flow router meets a chat request, it routes to a documented
   stub — **never** a half-built chat answer. Track C plugs in there.
5. When it reports done, open the review gate below — you never grade your own build.
6. Integrate, mark the issue done on the tracker, move on.

## Review gate — independent, fresh-context, in parallel
After each issue, spin up these reviewer agents (in `.agents/agents/`) — adversarial by default. Each
gets the spec + the diff only — NOT the builder's explanation — and returns pass/fail per condition:
- `acceptance-reviewer` — does the build satisfy the thread/table + sharing subset and conform to the
  new contracts? Rubric: the **thread is unscoped and never forks**; producing a table **pins scope +
  spawns a sub-agent** surfaced by an **inspector**, completion fires a **toast with a hyperlink**, the
  table is a **first-class auto-persisted re-openable card** whose **background table population survives navigation**
  (Q36), and its scope is **fixed for life** (a different cohort makes a new table; an in-place
  column/value edit does not); the left panel is **flat** (no projects); sharing is
  Datasets/templates/tables only (**threads not**), editor-only, managed from the Share dialog, with
  received Dataset notification + Keep/Delete handling and the **Dataset access-only cascade**; and
  **chat is left as a seam, not implemented**. ("Did we build the right thing?")
- `code-reviewer` — Intero backend/app: **correct and safe first** — read-only invariant (no writes to
  clinical DBs), local-only (no PID egress), parameterised SQL, the mock layer in `api.js` mirrors the
  server shapes, `/api/*` enforces 401/403 with the updated `resource_type` — then simple and
  maintainable within architecture.md's boundaries, **reusing** table population / streaming / evidence,
  with **none** of the deferred dashboard / project / thread-sharing scope (and **no** Track-A
  navigation or Track-C chat) leaking in. ("Is it built right?")
- **Ad-hoc visual reviewer** (spin up inline) — runs the app and **screenshots** the **thread**, **the
  inspector** (building → click-to-open → done) and the **completion toast**, the **table filling live
  in the main panel** (cells → cell evidence) and as a **card in the Tables section**, and the **flat
  left panel** (Datasets/Templates/Tables/Threads), grading against design-system.md + product-flows.md.
On any fail, **oscillate until it converges** (builder triages → fresh reviewer each round with a
one-line note per rejected finding → repeat until a fresh pass accepts every condition AND the builder
sees no gap). Bound at **10 rounds** per gate; escalate a still-contested finding rather than spin.
Don't move past a failing gate.

## Done when — each line tagged with how it's checked
- [Functional] All three Python `unittest` suites exit 0 from `intero/`; `cd app && npm test` exits 0;
  `ruff check .` and `ruff format --check .` exit 0.
- [Functional] Open a thread; ask for a table → it **pins** its spec and **spawns table population**;
  an inline **inspector** shows running → done; **click-to-open** and a **completion
  toast with a hyperlink** both put the live-filling table in the main panel; the thread is **not
  forked**.
- [Functional] The table **auto-persists as a first-class re-openable card** in the Tables section, and
  navigating away and back shows the **background run continued** (Q36).
- [Functional] Scope is **fixed**: a different-cohort request creates a **new** table; an in-place
  column/value edit stays on the **same** table.
- [Functional] The left panel is **flat** (New · Search · Datasets · Templates · Tables · Threads, no
  projects); the main panel does thread / table / split; the right panel toggles Activity ↔ Evidence.
- [Functional] Sharing: a **populated table** can be shared and cascades **Dataset access-only** (not
  added to the recipient's Datasets library); sharing is editor-only from the Share dialog chip-input;
  received Datasets/templates/tables appear directly in the recipient's normal library; newly received
  Datasets show Data library notification + Keep/Delete until handled; a **thread cannot be shared**;
  `/api/*` enforces 401/403 with the updated `resource_type`
  (+ `table`, − `thread`/`project`).
- [Functional] The **chat** branch of the request-flow router is a clear, documented **seam** (a
  not-yet stub) — **not** a half-built chat answer.
- [Visual] The thread, the inspector + toast, the table view + Tables-section card, and the flat left
  panel match product-flows.md + design-system tokens — reviewer screenshots `npm run dev`.
- [Judgment] The new code **reuses** the existing table-population / streaming / evidence / sub-agent machinery
  rather than reinventing it, holds the read-only / local-only / never-fabricate invariants, and pulls
  in **none** of the deferred dashboard / project / thread-sharing scope (and no Track-A navigation or
  Track-C chat).
- [You decide] Running any **state-DB migration** (the `resource_type` enum change) or any **artifact
  reshape** (the `fixed_criteria` migration out of existing `var/.../mapping.json`) — **pause for my
  approval** before applying it to non-fixture data.
If a condition isn't checkable, rewrite it until it is.

## Stop
Run all issues end-to-end to done — **no per-issue pause** (except the migration approval gate above).
Run the **thinnest slice first** (open a thread → ask for a table → the table spawns and fills in the
main panel) and let me see that run before you widen scope. Bound each review gate at **10 rounds**.
Halt and report if a gate is still contested after 10 rounds, an issue would need Track A's
`navigate-db` work or Track C's chat, or you'd have to expand beyond the thread/table + sharing
boundary. Still blocked at a bound? Halt and report — don't loop.

## Escalate to me only for
Destructive/irreversible actions and the **[You decide]** migration gates above; a review finding you
and a fresh reviewer still disagree on after 10 rounds; **any pressure to build a deferred surface**
(dashboards, projects/folders, thread sharing, table versioning, run-over-run history) — halt and ask;
**any pressure to implement chat** (Track C — keep the seam) or to do Track-A navigation work; real
scope changes; or input only I can provide. The split-panel transition *choreography* (the residual of
Q42) is a `/prototype`-and-surface call, **not** a gate. Otherwise run end to end, and never end your
turn on a promise.

## Before you report
Audit every claim against a tool result from this session. Unverified? Say so. Tests failed? Show the
output. List any ad-hoc reviewer roles you spun up. Open with the outcome — the TLDR I'd ask for, in
complete sentences.

## Scope — in / out (hold this line)
IN: the **thread + table front-end flow** (unscoped thread that doesn't fork; the request-flow router's
**table** branch; pin scope + spawn sub-agent + inline inspector + completion toast; the table as a
first-class auto-persisted re-openable card with a surviving background run (Q36); scope-binds-to-table
+ in-place iterate / new-cohort-new-table; the flat Datasets/Templates/Tables/Threads panel; thread /
table / split main panel; Activity ↔ Evidence right panel); **narrow sharing** (Datasets/templates/
tables; threads not; editor-only Share dialog; received Dataset notification + Keep/Delete;
table→Dataset access-only cascade); the **additive contracts**
(`thread`+`table` entities, `resource_type` change + cascade, **table** endpoints, `fixed_criteria`
migration). Reuse the existing table-population run, cohort injection, streaming, and evidence panel.
OUT (other tracks / deferred — do not build): the **`chat-answer` skill** + chat output + chat
endpoints (Track C — leave a clean **seam**); the **`navigate-db`** tool work (Track A — the table run
uses today's `lookup`); the cell-resolution **re-freeze** (Q30, unless you touch that contract — you
should not); **dashboards**, **projects / folders**, **thread sharing**, **table versioning**,
**run-over-run / longitudinal** views, **scheduled runs**, **refresh**, and the **hospital-permission
intersection** (Q37). Simplicity: minimum code that satisfies the done conditions; no speculative
abstraction for the deferred surfaces.
