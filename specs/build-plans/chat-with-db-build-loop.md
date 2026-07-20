# Build: chat-with-the-database — the `chat-answer` skill (Intero v1) — Track C

> Build-loop orchestration prompt. Working artifact, not a spec — safe to delete or gitignore
> once the build lands. The verifiable success criteria are duplicated into the goal-skill "goal
> condition"; this file holds the full method.
>
> **The third of three split build-loops** — see [threads-tables-build-loop.md](threads-tables-build-loop.md)
> for the map. This is **Track C: chat-with-DB**, the **join** of the two landed foundations:
> - **Track A (`navigate`) is landed** — the skill `navigate` and the four tools `catalog_execute`,
>   `search_execute`, `describe_execute`, `join_paths_execute` (`core/agent/.opencode/tools/`). **Reuse them.**
> - **Track B (thread/table flow) is landed** — the thread surface renders, and chat has a **marked
>   seam to plug into** (front-end + backend). **Fill the seam; do not rebuild the flow.**
>
> Assume A and B are landed (they are — verified in code). If a dependency you expect is missing,
> **halt and report** — do **not** rebuild Track A or Track B.

I'm building **chat-with-the-database** so a clinician asks the database a question **inside a thread**
and gets a streamed **natural-language answer with inline citations** — each citation opening the
evidence panel — scoped **per message** (the thread is unscoped) and **disclosing the scope it answered
at**. Chat reuses the `navigate` tools and the `evidence` source shape; it has **no cells, no tiers**
and never touches the cell store or `table-fill`. This is a **hard** problem on the safety axis (it reads
the hospital DB) — scope it at the top of your range, but stay strictly inside the boundary below.

## Read first — completely, before any code
- intero/specs/README.md — the index of where every spec lives; defer to it for paths
- intero/specs/STATUS.md — confirm the state: navigate ✅, thread/table flow ✅, **chat output is the
  open item (your build)**
- intero/specs/product/features/table-population.md — **§Chat output**: the thread is **unscoped — each
  message scopes itself**; chat **reuses the agent + the `navigate` skill but NOT the cell store, the
  two tiers, or `table-fill`**; it does **not** use `sql_execute`'s reject-if-unbindable cohort injection
  (the agent **manages its own scope, bounded by hospital permissions — the only hard wall**); **every
  answer discloses the scope** — a **quiet scope chip** for a slice, a **prominent inline callout** for
  hospital-wide
- intero/specs/product/features/navigation.md + intero/specs/product/decisions/0005-navigation-is-a-generic-verb-set-over-collections.md
  — the four `navigate` verbs chat uses to find data (never a whole-schema dump)
- intero/specs/product/features/traceability-and-evidence.md — the **evidence panel** + **§Aggregate
  value**: a chat aggregate claim opens **explanation + denominator/completeness**, the **aggregate
  query**, and the **covered rows** (each drillable to its own cell evidence; never one arbitrary row)
- intero/specs/product/product-flows.md — **§The request flow** (the **chat** branch of scope → output
  → execute) and **§Scoping a chat — per message**
- intero/specs/product/decisions/0004-scope-binds-to-table-not-thread.md — the thread roams; chat scopes
  per message (build to it, do not re-litigate)
- intero/specs/product/acceptance-criteria.md — your done-source: the **chat** bullets in §Precompute &
  run (chat-answer skill; answer + inline citations; no cells/tiers; `navigate`, never a whole-schema dump)
- intero/specs/product/README.md + architecture.md + CONTEXT.md — the canonical glossary; use these
  terms exactly (**chat**, **chat-answer**, **navigate**, **thread**, **scope**, **evidence**)
- intero/specs/product/open-questions.md — read the CURRENT text of each:
  - **Q40** — the chat `sql_execute` mode is a **build decision** (a looser **permission-bounded**
    posture, **not** the table's reject-if-unbindable injection) — **decide it from the spec, do NOT pause**
  - **Q37** — the hospital-permission ceiling (chat's hard wall) is **deferred / fail-closed**. **For v1,
    the ceiling is the whole registered read-only hospital DB** — chat never reads outside it, fail-closed
    on anything unbindable; the per-user permission **intersection** is **OUT of this track** (escalate if
    pressed)
  - **Q43** — the **`chat-answer` skill/tool contract** is owed — author it here
- The landed code you build on (read before touching):
  - **Track A (reuse):** `core/agent/.opencode/skills/navigate/SKILL.md`; the tools
    `core/agent/.opencode/tools/{catalog,search,describe,join_paths}.py` (registered as
    `catalog_execute` / `search_execute` / `describe_execute` / `join_paths_execute`);
    `core/agent/.opencode/skills/evidence/SKILL.md` (the source shape; it already names chat-answer as a
    sink); `core/agent/.opencode/skills/table-fill/SKILL.md` (a **structural model** for a skill — do not
    copy its cells/tiers)
  - **Backend entrypoint:** `core/agent/runtime.py` (`run_turn`) runs the primary thread agent for the turn;
    `server/routes/threads.py` — `_run_router_and_reply()` stamps the agent result onto the agent message;
    `server/routes/table_populations.py` — `GET /api/table-populations/{table_population_id}/stream`
    (the SSE framing helper to reuse for streaming);
    `core/agent/.opencode/tools/sql_execute.py` — read-only + **run-scoped** cohort injection (chat needs
    a **permission-bounded** mode that is NOT run-scoped)
  - **Front-end seam (fill it):** `app/src/components/ThreadView.svelte` **lines ~119–125,
    `data-seam="chat-answer:track-c"`** — rendered when `message.resolution.output === "chat"`; reuse the
    scope-disclosure chip pattern already there for tables; `app/src/stores/threads.js`;
    `app/src/lib/api.js` (the one FE↔BE seam — add a chat function if a new endpoint is needed; mock
    mirrors server); `app/src/components/{NoteEvidenceView,RightPanel}.svelte` (the evidence panel to
    reuse for inline citations)
- intero/specs/product/contracts/ — you **ADD** the `chat-answer` skill/tool contract (Q43) and any new
  chat endpoint in `api.md`; reuse `runtime-shapes.md` / `runtime-events.schema.json` for streaming.
  Chat is **never permission-gated** (control-plane §7) — **do NOT** add a chat `resource_type`
There is no pre-written build plan — you slice it into issues next.

Skills this prompt names (`/to-issues`, `/tdd`, `/prototype`): invoke each as a skill;
if your harness won't auto-invoke it, read and follow its `SKILL.md` in `.agents/skills/`.

## Commands — use these exact ones, don't guess (run from intero/)
- Setup (once): `python3 -m venv .venv && source .venv/bin/activate && uv pip install -r requirements.txt`; `cd app && npm install`
- Test (Python, unittest — all three, all must pass):
  - `python3 -m unittest discover -s core -p '*_test.py'`
  - `python3 -m unittest discover -s core/running/tests -p '*.py'`
  - `python3 -m unittest discover -s server -p '*_test.py'`
- Test (front-end): `cd app && npm test`
- Lint/format: `ruff check .` and `ruff format --check .` (the pre-commit gate)
- Seed + run backend: `make seed` then `make dev` (FastAPI on :8000); UI: `cd app && npm run dev` (:5173)

## Slice the work into issues — run /to-issues
Break the spec into **vertical-slice issues on the tracker** with the `/to-issues` skill: each is a thin
slice through all layers (skill + agent wiring + API + UI + tests), verifiable on its own. Order them in
dependency order. Suggested spine — **issue #1 is the thinnest end-to-end slice**:
1. **A whole-DB chat answer, rendered in the thread.** The backend **`chat-answer` skill** navigates
   (via the four `navigate` tools) → produces a natural-language answer + **≥1 source** (reuse the
   `evidence` skill source shape); **no cells, no tiers**. **Replace the router's chat stub** so
   `output="chat"` runs the skill and puts the real answer on the agent message; **render the answer at
   the `ThreadView` seam** (remove the placeholder). Whole-DB scope, non-streamed (synchronous in the
   existing POST), **permission-bounded and fail-closed** at the registered read-only hospital DB. Ask in
   a thread → see an answer. **Thinnest end-to-end slice — build this first.**
2. **Per-message scoping + disclose-scope.** The chat path resolves **per message** whether the question
   needs a **Dataset** slice or the **whole DB**; the answer **discloses** it — a **quiet scope chip**
   (slice) vs a **prominent inline callout** (hospital-wide); a later message in the same thread can
   scope differently. This is where the **permission-bounded `sql_execute` chat mode** lands (Q40 — NOT
   the table's reject-if-unbindable injection).
3. **Inline citations → the evidence panel.** Each citation in the answer **opens the evidence panel**
   (explanation + SQL + rows, or highlighted notes) — reuse `NoteEvidenceView` / `RightPanel`; wire the
   `api.js` call if a new endpoint is needed.
4. **Stream the answer inline.** Stream the answer (+ activity) inline in the thread, reusing the run SSE
   infra (`GET /api/table-populations/{table_population_id}/stream`) or a chat-specific stream.
5. **Aggregate claims.** An aggregate sentence ("the average is 4.2 days") opens the **aggregate query +
   denominator/completeness + covered rows**, each **drillable** to its own cell evidence (the
   §Aggregate value shape).

`/to-issues` tags each slice **AFK** (an agent can finish it unattended) and records blocking
relationships (2, 3, 4 depend on 1; 5 depends on 2 + 3). The **issue list is the persisted task board**;
the per-issue *implementation* plan stays ephemeral — derive each from [INSTRUCTIONS.md](INSTRUCTIONS.md)
(the backwards, output-first method) in working memory, not committed.

## How you run — you are the orchestrator
Work the issues in dependency order; run non-blocked issues in parallel.
For each issue:
1. Dispatch a builder subagent to implement just that issue, **test-first via the `/tdd` skill** (red →
   green → refactor, tested through public interfaces). Run independent builders in separate worktrees.
2. **Reuse, don't reinvent.** The four `navigate` tools, the `evidence` source shape, the thread surface
   + chat seam, the SSE streaming infra, and the evidence panel **already exist**. This build ADDS only:
   the `chat-answer` skill, the per-message permission-bounded scoping, replacing the router stub, the
   streaming wiring, and rendering at the seam. A builder that rebuilds navigation, the thread/table
   flow, the streaming infra, or the evidence panel — or that touches the **table run / two-tier engine /
   `table-fill`** — has failed the issue.
3. Authoring the additive contracts (the `chat-answer` skill/tool contract — Q43; any chat endpoint in
   `api.md`) is **part of the relevant issue and does NOT pause** — get it right from the spec and
   proceed. The chat UI (scope chip vs callout, inline citations) is **specified** — no `/prototype` is
   expected; only reach for it if a genuine taste call the spec can't resolve appears, then surface it.
4. When it reports done, open the review gate below — you never grade your own build.
5. Integrate, mark the issue done on the tracker, move on.

## Review gate — independent, fresh-context, in parallel
After each issue, spin up these reviewer agents (in `.agents/agents/`) — adversarial by default. Each
gets the spec + the diff only — NOT the builder's explanation — and returns pass/fail per condition:
- `acceptance-reviewer` — does the build satisfy table-population.md §Chat output + the acceptance criteria?
  Rubric: a chat answers **inline in the thread** with **≥1 inline citation** that opens the evidence
  panel; **no cells, no tiers**; it **scopes per message** and **discloses** it (quiet chip for a slice,
  prominent callout hospital-wide); a later message can scope differently; an **aggregate** claim opens
  the aggregate query + denominator/completeness + covered rows (each drillable); it finds data via
  `navigate` (**never a whole-schema dump**). ("Did we build the right thing?")
- `code-reviewer` — Intero backend/app: **correct and safe first** — the chat path is **read-only** (no
  writes to clinical DBs; `PRAGMA query_only` / authorizer holds), **local-only** (no PID egress),
  **permission-bounded and fail-closed at the registered read-only hospital DB** (Q37 ceiling; a mis-scope
  can't read beyond it), uses a permission-bounded `sql_execute` **chat mode** (NOT the table's
  reject-if-unbindable injection — Q40), **parameterised SQL**, and **never fabricates** (every claim
  carries ≥1 real source) — then simple and maintainable within architecture.md's boundaries, **reusing**
  navigate / evidence / streaming / the evidence panel, with **no** change to the table run / `table-fill`
  / two-tier engine and **none** of the deferred dashboard / project / thread-sharing scope leaking in.
  ("Is it built right?")
- **Ad-hoc visual reviewer** (spin up inline) — runs the app and **screenshots** the **chat answer in the
  thread** (with inline citations → evidence panel), the **quiet scope chip** vs the **prominent
  hospital-wide callout**, and an **aggregate claim's** evidence (query + covered rows), grading against
  table-population.md §Chat output + design-system.md.
On any fail, **oscillate until it converges** (builder triages → fresh reviewer each round with a
one-line note per rejected finding → repeat until a fresh pass accepts every condition AND the builder
sees no gap). Bound at **10 rounds** per gate; escalate a still-contested finding rather than spin.
Don't move past a failing gate.

## Done when — each line tagged with how it's checked
- [Functional] All three Python `unittest` suites exit 0 from `intero/`; `cd app && npm test` exits 0;
  `ruff check .` and `ruff format --check .` exit 0. New backend tests assert the `chat-answer` skill
  produces an answer + **≥1 source** on the cord-pH fixtures, and the router **no longer returns the
  chat stub** for `output="chat"`.
- [Functional] In a thread, asking a question returns a natural-language **chat** answer **rendered
  inline** (the seam placeholder is gone), carrying **≥1 inline citation**; **no cells and no tiers** are
  created (the cell store / `table-fill` are untouched).
- [Functional] The answer **scopes per message** and **discloses** it — a **quiet scope chip** for a
  Dataset slice, a **prominent callout** for whole-DB; a **later message in the same thread can scope
  differently** (the thread stays unscoped).
- [Functional] An inline citation opens the **evidence panel** (explanation + SQL + rows, or highlighted
  notes via `NoteEvidenceView`); an **aggregate** claim opens the **aggregate query + denominator/
  completeness + covered rows**, each **drillable** to its own cell evidence.
- [Functional] Chat is **permission-bounded and fail-closed**: it never reads outside the **registered
  read-only hospital DB** (Q37 ceiling); it uses a permission-bounded `sql_execute` **chat mode**, **NOT**
  the table's reject-if-unbindable cohort injection (Q40); it reaches data via the `navigate` tools
  (**no whole-schema dump**) and reuses the `evidence` source shape.
- [Functional] The answer **streams inline** in the thread (reuses the run SSE infra or a chat stream).
- [Visual] The chat answer, the quiet scope chip vs the prominent hospital-wide callout, the inline
  citations → evidence panel, and an aggregate claim's evidence match table-population.md §Chat output +
  product-flows.md + design-system tokens — reviewer screenshots `npm run dev`.
- [Judgment] The chat path **reuses** navigate / evidence / streaming / the evidence panel rather than
  reinventing them; holds the **read-only / local-only / never-fabricate** invariants; does **not** modify
  the table run, `table-fill`, or the two-tier engine; extends Track A/B code rather than rebuilding it;
  and pulls in **none** of the deferred dashboard / project / thread-sharing scope.
If a condition isn't checkable, rewrite it until it is.

## Stop
Run all issues end-to-end to done — **no per-issue pause**. Run the **thinnest slice first** (ask a
question in a thread → get a whole-DB answer with ≥1 citation rendered inline) and let me see that run
before you widen scope. Bound each review gate at **10 rounds**. Halt and report if a gate is still
contested after 10 rounds, an issue would require the **per-user permission intersection** (Q37 — beyond
the registered-read-only ceiling) or a **deferred surface**, or you'd have to touch the table run /
`table-fill` / two-tier engine. Still blocked at a bound? Halt and report — don't loop.

## Escalate to me only for
Destructive/irreversible actions; a review finding you and a fresh reviewer still disagree on after 10
rounds; **any pressure to build the per-user hospital-permission intersection** (Q37 — the v1 ceiling is
the whole registered read-only DB, fail-closed) or **any deferred surface** (dashboards, projects/folders,
thread sharing, table versioning) — halt and ask; **any pressure to modify the table run / `table-fill` /
two-tier engine** or to rebuild Track A/B; real scope changes; or input only I can provide. Otherwise run
end to end, and never end your turn on a promise.

## Before you report
Audit every claim against a tool result from this session. Unverified? Say so. Tests failed? Show the
output. List any ad-hoc reviewer roles you spun up. Open with the outcome — the TLDR I'd ask for, in
complete sentences.

## Scope — in / out (hold this line)
IN: the **`chat-answer` skill** (navigate → answer + inline citations; **no cells, no tiers**);
**replacing the router chat stub** so `output="chat"` runs the skill and the agent message carries the
real answer; **per-message scoping + disclose-scope** (quiet chip / prominent callout); the
**permission-bounded `sql_execute` chat mode** (Q40), **fail-closed at the registered read-only hospital
DB** (Q37 ceiling); **streaming** the answer inline; **front-end rendering at the `ThreadView` seam** +
**inline citations opening the evidence panel** (reuse `NoteEvidenceView` / `RightPanel`); **aggregate-
claim evidence** (query + denominator/completeness + covered rows); the **additive contracts** (the
`chat-answer` skill/tool contract — Q43; any chat endpoint in `api.md`). Reuse the four `navigate` tools,
the `evidence` source shape, the thread surface + seam, the SSE streaming infra, and the evidence panel.
OUT (other tracks / deferred — do not build): the **per-user hospital-permission intersection** (Q37 —
the ceiling is the whole registered read-only DB; fail-closed; defer); any change to the **table run /
`table-fill` / two-tier engine / table cohort injection**; **rebuilding `navigate`** (Track A — reuse) or
the **thread/table flow** (Track B — reuse, only fill the seam); a chat **`resource_type`** (chat is
never permission-gated — control-plane §7); **embeddings / semantic search** (navigate is keyword);
**dashboards**, **projects / folders**, **thread sharing**, **table versioning**, **refresh**. Simplicity:
minimum code that satisfies the done conditions; no speculative abstraction for the deferred surfaces.
