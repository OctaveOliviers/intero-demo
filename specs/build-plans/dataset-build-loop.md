# Build: the Dataset primitive + data library + run-time scoping (Intero)

> Build-loop orchestration prompt. Working artifact, not a spec — safe to delete or
> gitignore once the build lands. The verifiable success criteria are duplicated into
> the goal-skill "goal condition"; this file holds the full method.

I'm building the **Dataset primitive, its data-library surface, and run-time cohort
scoping** so an auditing clinician (P1) and clinical lead (P4) can scope the one
hospital database to a **named, reusable Dataset** — a saved filter defined in plain
language — and have **every request run inside that scope**. This is a hard problem
(a new persisted primitive + a control-plane contract + run-time composition);
scope it at the top of your range, but stay strictly inside the boundary below.

## Read first — completely, before any code
- intero/specs/README.md — the index of where every spec lives; defer to it for paths
- intero/specs/product/features/library-and-sources.md — the data library + Dataset detail UI (source of truth for the surface)
- intero/specs/product/features/inclusion-criteria-setup.md — the free-text → grounded-filter engine; read its **§Reuse** carefully (what already exists)
- intero/specs/product/features/table-population.md — read **§Cohort scope and the count** (how a Dataset scopes table population)
- intero/specs/product/acceptance-criteria.md — the **Datasets + scoping subset** is your done-source: the Dataset bullet in §Library & sources (lines ~128–132) + the scope criteria in §Flows (lines ~26–32, 38) and §Precompute & run (lines ~70–72)
- intero/specs/product/README.md + architecture.md + CONTEXT.md — how it fits together, the module boundaries, and the canonical glossary (use these terms — Dataset, cohort, grain, scope — exactly)
- intero/specs/product/open-questions.md — Q31 (additive contracts owed), Q32 (Datasets are flat, no nesting), Q34 (raw-SQL view read-only in v1)
- intero/specs/product/contracts/ — control-plane-schema-and-permissions.md, storage-layout.md, api.md, README.md: this is where you ADD the `dataset` contract
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
- Offline prepopulate eval (no LLM): `make eval-prepopulate`

## Slice the work into issues — run /to-issues
Break the spec into **vertical-slice issues on the tracker** with the `/to-issues`
skill: each issue is a thin slice through all layers (storage + API + grounding/SQL
composition + UI + tests as needed), complete enough to verify on its own — not a
horizontal "build the schema" layer. Order them in dependency order; **issue #1 is
the thinnest end-to-end slice**: create + persist a Dataset from a plain-language
slice → it scopes a run's **read-only COUNT** on the cord-pH fixtures. `/to-issues`
tags each slice **AFK** (an agent can finish it unattended) — this slice has no HITL
design calls — and records blocking relationships. The **issue list is the persisted
task board**; the per-issue *implementation* plan stays ephemeral — derive each one
from `intero/specs/build-plans/INSTRUCTIONS.md` (the backwards, output-first method)
in the builder's working memory, not committed.

## How you run — you are the orchestrator
Work the issues in dependency order; run non-blocked issues in parallel.
For each issue:
1. Dispatch a builder subagent to implement just that issue, **test-first via the
   `/tdd` skill** (red → green → refactor, one behavior at a time, tested through
   public interfaces). Run independent builders in separate worktrees so parallel
   work doesn't collide.
2. **Reuse, don't reinvent.** The grounding engine (`ground_default_criteria`), the
   cross-DB read-only `ATTACH` + identity bridges, and the read-only `COUNT` already
   exist (inclusion-criteria-setup.md §Reuse). This slice ADDS only: the Dataset
   object + storage (`var/datasets/<id>/`), the additive `dataset` contract
   (schema + `/api/datasets*` + `resource_grants.resource_type` gains `dataset`,
   written into contracts/), the data-library detail UI, and composing the Dataset's
   persisted predicates into the executable cohort block at run time. A builder that
   reimplements grounding/ATTACH/COUNT has failed the issue.
3. Authoring the `dataset` contract is **part of issue #1 and does NOT pause** — get
   it right from the spec and proceed. If a builder hits a genuine taste call it
   can't resolve from the spec, it uses the `/prototype` skill (a throwaway terminal
   app or a few switchable UI variations) and surfaces it — but this slice shouldn't
   need it.
4. When it reports done, open the review gate below — you never grade your own build.
5. Integrate the result, mark the issue done on the tracker, move to the next.

## Review gate — independent, fresh-context, in parallel
After each issue, spin up these reviewer agents (in `.agents/agents/`) — adversarial
by default: assume there's a problem until the evidence says otherwise. Each gets
the spec + the diff only — NOT the builder's explanation — and returns pass/fail per
condition, checking by the method tagged in "Done when":
- `acceptance-reviewer` — does the build satisfy the Datasets + scoping subset and
  conform to the new `dataset` contract? Rubric: a Dataset is created from plain
  language → grounded chips + a parameterised SQL predicate + a real read-only
  `COUNT`; it persists to `var/datasets/<id>/` per the new schema and reloads with an
  identical SQL/count (deterministic re-derivation); its predicates compose into the
  executable cohort block and scope a run; multi-DB scope works via ATTACH + identity
  bridges; `/api/datasets*` enforces 401/403 via `resource_grants` `dataset`; the
  structured-only constraint holds (a free-text-only slice is reported "not
  available", never hallucinated). ("Did we build the right thing?")
- `code-reviewer` — Intero backend/app code: **correct and safe first** — the
  read-only invariant (no writes to clinical DBs; the raw-SQL view is read-only;
  COUNT is read-only), local-only (no PID leaves the environment), parameterised SQL
  (no injection), edge cases — then simple and maintainable within architecture.md's
  boundaries, with no deferred dashboard/thread/output scope leaking in. ("Is it
  built right?")
- **Ad-hoc visual reviewer** (spin up inline) — runs the app (`make seed && make dev`,
  `cd app && npm run dev`) and **screenshots the data-library Dataset detail**,
  grading it against design-system.md + the spec's layout. Rubric: label +
  value-chip filters, an empty add-filter row, a sanity count, and a **top-right
  toggle to a read-only raw-SQL view** are all present and laid out per the spec;
  colours/shapes/sizes come from `app.css` tokens; one icon family; empty / loading /
  error / partial states are handled.
On any fail, this is a loop, not a one-shot gate — **oscillate until it converges**:
1. The builder **triages** the findings: fix the legitimate ones; for any it judges
   wrong, it does NOT silently comply — it's ready to defend why that one is out of
   scope (e.g. "that's the deferred output-library, not this slice").
2. Re-review with a **fresh reviewer agent each round**. It gets the spec + diff
   only, same as the first pass, plus a one-line note for each rejected finding —
   *"already raised X; rejected because Y — look elsewhere"* — so it engages that
   reasoning instead of re-raising a settled point, and hunts for what else is wrong.
3. Repeat until a fresh pass returns pass/accept on every condition AND the builder
   itself sees no remaining gap — it doesn't ship just because the reviewer went quiet.
Bound it at **10 rounds** per gate. If a finding is still contested after 10 rounds,
halt and escalate it to me — don't spin. Don't move past a failing gate.

These are strong defaults, not a closed set. If an issue needs a review they don't
cover (e.g. SQL-injection safety on the predicate composition, multi-DB ATTACH
correctness, control-plane authz), spin up an ad-hoc reviewer subagent inline.

## Done when — each line tagged with how it's checked
- [Functional] All three Python `unittest` suites exit 0 from `intero/`, including a
  new deterministic test that a Dataset's persisted predicates compose into the
  cohort block and the read-only `COUNT` returns the expected count on the cord-pH
  fixtures.
- [Functional] `cd app && npm test` exits 0.
- [Functional] `ruff check .` and `ruff format --check .` exit 0.
- [Functional] A Dataset round-trips: created from plain language → grounded chips +
  parameterised SQL predicate + sanity COUNT persisted to `var/datasets/<id>/` per
  the new `dataset` schema → reloads and **re-derives identical SQL + count**.
- [Functional] `/api/datasets*` enforces auth: 401 unauthenticated, 403 unauthorized,
  per contracts/control-plane-schema-and-permissions.md with `resource_grants` gaining
  `dataset`.
- [Functional] Multi-DB: a Dataset scoping ≥2 databases composes via read-only ATTACH
  + identity bridges and the COUNT reflects the join.
- [Functional] Structured-only honored: a slice expressible only from free-text notes
  is reported **"not available"** (deferred), never silently dropped or hallucinated.
- [Visual] The data-library Dataset detail (label/value chips, empty add-filter row,
  sanity count, top-right read-only raw-SQL toggle) matches the spec's layout and
  uses `app.css` tokens — reviewer screenshots `npm run dev`.
- [Judgment] The Dataset module + run-time composition read cleanly, **reuse**
  `ground_default_criteria` / ATTACH / COUNT rather than reinventing them, hold the
  read-only / local-only invariants, and pull in **none** of the deferred
  dashboard / output-library / thread-project scope — rubric in the gate above.
If a condition isn't checkable, rewrite it until it is.

## Stop
Run all issues end-to-end to done — **no per-issue pause**. Bound each review gate at
**10 rounds**. Halt and report if: a gate is still contested after 10 rounds; any
issue is **blocked on a deferred contract** (output/dashboard endpoints, the
thread/project entities, or the `run`/`run_id` → thread rename); or you would have to
expand beyond the Datasets + scoping boundary to proceed. Still blocked at a bound?
Halt and report what's blocking — don't loop.

## Escalate to me only for
Destructive or irreversible actions; a review finding you and a fresh reviewer still
disagree on after 10 rounds of rebuttal; **any pressure to touch the deferred
contracts or perform the run→thread rename** (do NOT do it — halt and ask); real
scope changes; or input only I can provide. The `dataset` contract authoring is NOT a
gate — proceed. Otherwise run end to end, and never end your turn on a promise.

## Before you report
Audit every claim against a tool result from this session. Unverified? Say so. Tests
failed? Show the output. List any ad-hoc reviewer roles you spun up beyond
acceptance/code/visual, so I can track which review mechanisms proved useful. Open
with the outcome — the TLDR I'd ask for, in complete sentences.

## Scope — in / out (hold this line)
IN: the `var/datasets` Dataset object + storage; the additive `dataset` contract
(schema + `/api/datasets*` + `resource_grants` gains `dataset`, written into
contracts/); the data-library Dataset-detail UI (chips, empty add-filter row, sanity
count, read-only normal↔raw-SQL toggle); run-time composition of a Dataset's
persisted predicates into the executable cohort block + read-only COUNT; multi-DB
scoping (reuse of existing ATTACH + identity bridges). Datasets are **flat — no
nesting** (Q32); the raw-SQL view is **read-only** (Q34).
OUT (a later slice — do not build, do not author their contracts): the output
library, tables/dashboards, indicator drill-down, mapping-on-persist, template
versioning, the thread/project entities, and the runtime-wide `run`/`run_id` → thread
rename. Simplicity: minimum code that satisfies the done conditions; no speculative
abstraction for the deferred surfaces.
