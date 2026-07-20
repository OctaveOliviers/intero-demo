# Agent Code Evolution

> **Status: proposed.** A forward-looking feature spec, not yet built. It specifies an
> **engineering-facing** loop — Melodic tuning its own agent's code against a benchmark, overnight
> — not a hospital-facing product surface. Read [table-population.md](table-population.md) (the
> `cell-fill` agent, its tools, and the cell-resolution contract it writes) first, and
> [improvement-loops.md](../improvement-loops.md) for how this loop relates to
> [site-artifact-learning.md](site-artifact-learning.md) (the *other*, production-facing
> improvement loop — this spec never touches its artifacts, and vice versa).

---

## The problem

The table-filling agent's behavior is governed by a handful of files: the `cell-fill`
[`SKILL.md`](../../../core/agent/skills/cell-fill/SKILL.md), the tools it calls
(`core/agent/tools/sql_execute.py`, `lookup.py`), its build prompt, and its `opencode.json` config.
Today these are hand-tuned. An eval harness already exists
(`scripts/eval_pipeline.py`, `scripts/eval_lib.py`, `scripts/eval_agent_npda.py`) that runs the
agent headlessly against seeded databases and reports cell state and tool activity — but nothing
**scores a filled cell against a known-correct value**, and nothing **proposes and tests changes**
to close the gap. This spec adds both: a **golden answer key** for cells, and a **nightly loop**
that evolves the agent's prompt/tools/config against it, unattended, landing a pull request by
morning.

## Scope (v1 of this spec)

Only the **table-filling** agent (`cell-fill`) is in scope. The **Answer** agent (`chat-answer`
skill) has no headless eval path and no golden answer key yet; it is cloned from this design once
both exist — out of scope here.

---

## The genome — what a candidate is

A **candidate** (genome) is one full configuration of the agent's editable surface:

- `core/agent/skills/cell-fill/SKILL.md` — the behavior contract
- the build prompt (`core/table_population/populate.py`'s `build_prompt()`)
- `core/agent/opencode.json` — model/tool/skill permissions and params
- `core/agent/tools/lookup.py` — used only by `cell-fill`
- `core/agent/tools/sql_execute.py` — **shared** with the Answer agent's `chat-answer` skill, but
  included anyway (see below)

**Out of scope, deliberately: the shared `navigate` and `evidence` skills and their tools**
(`catalog`/`search`/`describe`/`join_paths`, `cite`). These are also shared with `chat-answer`, but
unlike `sql_execute.py` there is no invariant suite guaranteeing an edit stays safe for whichever
agent calls them, and no benchmark measuring whether an edit helps or hurts the (unmeasured here)
Answer agent's use of them. Editing them would silently reach past this spec's "table-filling agent
only" boundary ([Scope](#scope-v1-of-this-spec)) with no way to tell. If a future night wants to
improve the shared navigation surface, that needs its own blast-radius analysis and its own
benchmark, not a quiet inclusion here.

**Why `sql_execute.py` is the one shared file in scope.** Its safety — read-only, cohort-injected,
no fabricated rows — is exactly what the invariant test suite below asserts, and that suite is
agent-agnostic: an edit that survives it is safe for *any* caller, not just `cell-fill`. So a
surviving edit can never make `chat-answer`'s use of the tool unsafe. It
*could* still make `chat-answer`'s SQL less efficient or clumsier in some way this benchmark can't
see, since only `cell-fill`'s fitness is measured here — a residual, non-safety risk, tracked in
[Deferred details](#deferred-details).

Each candidate lives in its own **git worktree**, branched off the night's baseline — so a
candidate's diff against baseline *is* its genome, and candidates never collide on disk.

**Tool-code edits are gated.** Editing `SKILL.md`/prompt/config can only make the agent perform
worse, never unsafe. Editing tool code can: a bad edit could run a write, escape cohort scope, or
fabricate rows that happen to match golden values. So any candidate that touched tool code must
pass an **invariant test suite** before its score counts at all — asserting read-only enforcement,
cohort-injection on every query ([table-population.md §How table population scopes the
agent](table-population.md#how-table-population-scopes-the-agent-without-it-managing-filters)), no
fabricated rows, and the existing unit tests. Failing the gate discards the candidate outright,
regardless of its fitness score — a higher score can never buy back a safety violation. *(The suite
itself is owed — see [Deferred details](#deferred-details).)*

---

## Ground truth — the golden cell set

Every graded cell (patient × field, across both seed audits, `cord-ph` and `npda`) needs a known-
correct value. It is established once, up front, by a hybrid process:

- **Direct / coded fields** — the golden value is the deterministic SQL query over the seed
  database. No judgment involved.
- **Interpret fields** — a strong model drafts a proposed value from the notes for every cell; a
  **medical doctor confirms or corrects each draft** in a new **golden-annotation surface**, rather
  than extracting values from scratch. This surface reuses the evidence panel's **display** — the
  query/notes and highlighted passages
  ([traceability-and-evidence.md](traceability-and-evidence.md)) — but not its review *mechanics*:
  the live product's dwell-to-review gate has no confirm/correct buttons by design (D1 safety gate,
  traceability-and-evidence.md), whereas annotating a golden set is an explicit, deliberate
  confirm/correct action, done outside any live run. The doctor's confirmed/corrected value is
  frozen as golden. *(The surface itself is owed — see [Deferred details](#deferred-details).)*

Because the doctor **corrects** drafts rather than rubber-stamping them, the golden set has no
ceiling tied to the drafting model's competence — it is real ground truth, not a frozen model
opinion.

This sprint **bootstraps** the golden set; it does not have to stay its only source. The learning
loop's confirmed/corrected corrections at live sites are the same shape of label and can export
into new golden cells over time — see
[improvement-loops.md](../improvement-loops.md#the-one-real-connection-corrections-become-golden-cells).

---

## Fitness — grading a candidate

A candidate is scored by running the agent-under-test over a set of cells and comparing its
writes to golden. **Correctness gates; cost only breaks ties among equally-correct candidates** —
a candidate can never win by being cheaper and less correct.

**Per-cell-type grading:**

| Cell kind | Grading rule |
|---|---|
| Direct / coded | Exact match against golden |
| Interpret | Tolerant match (normalized text / numeric tolerance / LLM-judge) against the doctor-confirmed golden value |
| Golden is `blocked` | Correct only if the candidate also leaves it `blocked` |
| Golden has a value | A `blocked` write is a miss, never neutral |

**Cost** (tokens, tool-call count, wall-clock) is computed from each run's trace and reported
alongside; it decides between candidates only once correctness ties.

This grading extends `eval_lib.py`'s existing scorer family (`score_audit_spec` /
`score_database_model` / `score_mapping`) with a fourth: `score_cells`.

---

## The nightly split — cross-validation at the cell level

The split unit is the **individual graded cell**, not the patient and not the field — both
legitimately need different agent behavior, so neither is a safe axis to hold out wholesale.

Each night draws a **fresh random split** (`split_draw.py`, seeded) over all graded cells: ~70%
**train**, ~30% **validation**. The split rotates every night — there is no permanent held-out
set. Two roles, kept strictly apart:

- **Train** — the *only* cells an editor agent may read traces from when crafting an edit, and the
  *only* cells it scores itself against while refining.
- **Validation** — never shown to an editor agent; used only to rank candidates against each
  other for selection.

**The trusted number.** Because a generation's winner is chosen *for* topping validation, its
validation score is optimistically biased (picking the best of many is itself a form of fitting).
The morning's honest number is **the winning genome's consistent gain across K fresh re-splits**
computed at finalize time — new random splits it was never selected against — not its in-loop
validation score.

---

## The algorithm — one generation

A **standard generational genetic algorithm** — no per-candidate inner refinement loop. Each edit
faces selection immediately; since edits are informed (an editor agent reads real failure traces,
not random mutation), there's little to gain from shielding a lineage from selection before it's
scored.

```
population = 5 elites (unchanged from last generation) + ~15 children
for each candidate (worktree):
    editor agent reads TRAIN-cell traces of the current elite it's descended from
    editor agent makes one informed edit to the genome
score every candidate on VALIDATION cells (score_cells.py)
keep top 5 by validation score  →  next generation's elites
crossover: fuse the top 5's diffs into ~15 children (an LLM judge picks
           the best parts of each — "this one's tools are better, that one's
           prompt is crisper")
repeat until deadline
```

Elitism (carrying the top 5 forward unchanged) means a bad generation can never lose ground
already won.

---

## Orchestration — the agent team

The loop is an **agentic orchestrator**, not a Python program: a **manager agent** (Claude Code
running an `evolve` skill) spawns **editor agents**, one per candidate worktree, and does the
admin — selection, crossover, deadline-keeping — as agent judgment, not hardcoded control flow.
Only three pieces are deterministic scripts the agents must call through, because these are the
places an "improving" number could otherwise be gamed or corrupted:

| Script | Why it must be code, not agent judgment |
|---|---|
| `split_draw.py` | A manager that "picks" cells for validation, having read prior nights' reports, biases the split without meaning to |
| `score_cells.py` | An agent grading its own output optimizes for what persuades the grader, not for correctness — the classic collapse mode of LLM-judged loops |
| `invariant_gate.py` | Tool-code safety cannot rest on an agent's self-assessment |

Everything else — how many generations fit, which candidates look promising, how to fuse two
genomes — is prose in the `evolve` skill.

**Recoverability, not a watchdog.** An 8-hour unattended agent can crash, hang, or drift after
context compaction. Rather than a supervising process, every scored candidate is appended to a
ledger file the moment it's scored — so the night's state always lives on disk, never only in an
agent's context:

```jsonc
// var/evolve/<date>/ledger.jsonl — one line per scored candidate, append-only
{"generation": 3, "candidate_id": "c3-07", "parent_ids": ["c2-01","c2-04"],
 "genome_diff_ref": "worktree branch or diff path",
 "validation_score": {"correctness": 0.91, "tokens": 18400, "tool_calls": 12},
 "gate_passed": true, "notes": "…"}
```

`finalize.py` reads the ledger, takes the best validated genome, scores it on fresh re-splits, and
writes the report + PR — pure code, so it runs identically whether the manager agent calls it at
the deadline (the normal path) or an engineer calls it by hand the morning after a dead night (the
recovery path).

---

## Two cadences

| Loop | Cadence | Pinned | Goal |
|---|---|---|---|
| **Nightly evolution** (this spec, primary) | every night | agent model fixed | sharpen `SKILL.md` / tools / config / prompt |
| **Model-shrink loop** | slower, periodic | genome re-optimized per trial | find the smallest/cheapest model that still clears the accuracy bar |

The model-shrink loop trials a smaller model by handing it to a full nightly-evolution stretch
**before** judging it — a genome tuned for a bigger model is unfair prompting for a smaller one, so
a candidate model is only accepted or rejected after it has had its own chance to be re-optimized.

---

## Start, stop, and the morning deliverable

- **Start** is manual: an engineer runs the loop with a deadline (e.g. `make evolve
  DEADLINE=07:00`).
- **Stop** is deadline-bound: the manager agent reserves the final ~45 minutes to stop searching,
  run `finalize.py`, and open the PR — a deliverable lands every morning regardless of how many
  generations fit.
- **Cross-night flow is merge-gated warm-start**: tomorrow's baseline is whatever is in `main`
  today. Gains compound only as fast as the engineer reviews and merges — an unreviewed night's
  edits never silently stack onto the next night's starting point.
- **The PR** is ready-to-merge with a minimal body: accuracy delta and token/tool-call delta on the
  fresh re-splits, plus a plain-English rationale for the winning change. The full attempt log
  (every candidate this night, its score, why it lost) is a committed artifact
  (`var/evolve/<date>/`, gitignored from the diff but readable) — linked from the PR, not inlined.
  A night with no genome that beat baseline produces the report only, no PR.

---

## Acceptance (agent code evolution)

- A golden cell set exists for both seed audits, direct/coded values SQL-derived and interpret
  values doctor-confirmed against model-drafted proposals in Intero's own review UI.
- `score_cells.py` grades a run's cells against golden per the per-cell-type rules above, including
  correct/incorrect blocked scoring, and reports cost from the trace.
- `split_draw.py` draws a fresh, seeded, cell-level train/validation split each night; no cell set
  is ever permanently held out.
- Tool-code edits that fail `invariant_gate.py` are discarded regardless of fitness score.
- A night's manager agent runs a standard generational GA (elitism + crossover, no per-candidate
  inner refinement loop), selecting only on validation cells, mutating only from train-cell traces.
- Every scored candidate is appended to `ledger.jsonl` before the next step proceeds, so any night
  can be finalized from disk alone.
- The loop self-finalizes at its deadline via `finalize.py`, scoring the winner on fresh re-splits
  and opening a ready-to-merge PR with a minimal body; a night with no winner produces a report
  only.
- Cross-night state is merge-gated: the next night's baseline is `main`, not an unmerged branch.

---

## Deferred details

Settled once the structure above is agreed:

- **Invariant test suite** — the concrete assertions (`invariant_gate.py`): exact SQL patterns
  disallowed, cohort-injection test fixtures, fabricated-row detection.
- **`sql_execute.py`'s effect on the Answer agent** — an edit that passes the invariant gate is
  provably still safe for `chat-answer`, but this spec only benchmarks `cell-fill`'s fitness; a
  change that's a net win for table-filling could be a wash or a mild regression for `chat-answer`'s
  use of the same tool, unmeasured until that agent has its own benchmark.
- **The golden-annotation surface** — the concrete affordance for a doctor to confirm/correct a
  drafted interpret-cell value and freeze it as golden.
- **`score_cells` tolerant-match mechanics** — the normalization / numeric-tolerance / LLM-judge
  rule for interpret cells, and its own accuracy bar.
- **Split ratio, population size, generation count** — starting defaults (~70/30, 20 candidates, 5
  elites) are illustrative; tune once real nights run.
- **Crossover judge prompt** — how the fusion step is instructed to pick "the best parts" of two
  genomes without producing an incoherent merge.
- **`var/evolve/` retention** — how long nightly ledgers and reports are kept.
- **Seed cohort size** — `cord-ph`'s ~20-patient cohort is thin for a meaningful cell-level split;
  expanding seed cohorts is a prerequisite this spec assumes but does not schedule.
- **Golden-cell export from the learning loop** — which correction observations qualify,
  de-duplication against the sprint-bootstrapped set, and site consent — see
  [improvement-loops.md](../improvement-loops.md#the-one-real-connection-corrections-become-golden-cells).
