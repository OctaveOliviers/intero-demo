# Site Artifact Learning

> **Status: proposed.** A forward-looking feature spec, not yet built. This is the
> **umbrella** for everything we learn from watching people use intero, **at one hospital
> deployment**. It is precise about
> the **structure** — *what* can be learned (the site's own artifacts: `model.json` /
> `mapping.json` / `spec.json`), *what we learn from* (the
> signals), and the **one shared shape** every signal flows through (Observe → Learn →
> Reconcile). The two signals we specify in full are **observational learning** (watching the
> nurse fill the EHR) and **correction learning** (watching the nurse edit our table).
> Tunable knobs — cadence, prompts, thresholds, field-level schemas — are corralled into
> **[Deferred details](#deferred-details)**. We agree the structure first.

Read [indexing-and-mapping.md](indexing-and-mapping.md), [table-population.md](table-population.md),
and [traceability-and-evidence.md](traceability-and-evidence.md) first. See
[improvement-loops.md](../improvement-loops.md) for how this loop relates to the other
improvement loop, [agent-code-evolution.md](agent-code-evolution.md) — this loop never
writes that loop's artifacts, and vice versa.

---

## The problem

The agent's behaviour at a site is governed by a small set of **source-of-truth
artifacts**. Today every one of them is **guessed up front** — the database model from
schema, the mapping from the model, the field spec from the table template — and a guess is wrong
in predictable ways: the same fact lives in several tables, under cryptic names, behind
site-specific conventions; a value the agent copies straight should have been derived; a
unit is off.

But the building is full of teachers. Two of them matter most:

- the **nurse who fills the audit by hand**, navigating the EHR to find each value, and
- the **nurse who corrects our output**, changing a value we got wrong in the table.

The **learning loop** is the single, shared machine that turns watching them into
improvements to those artifacts — and that keeps improving as they keep working. We learn
the artifacts on our own at first; then, the more the nurses use the system, the better the
artifacts get.

This document is the umbrella. The rest of it answers three questions in order:

1. **What can be learned** — the artifacts (the *outputs*).
2. **What we learn from** — the signals (the *inputs*).
3. **The one shared shape** every signal flows through to connect an input to an output.

Then it specifies the two signals in full and closes with storage, build order, and
deferred details.

---

## 1 · What can be learned — the artifacts

Every learning episode ends by proposing a change to **exactly one** artifact (or
abstaining). There are four real targets and one that is *not* a target:

| Target | Governs | Lives in | Blast radius |
|---|---|---|---|
| **Schema model** | what each column means; cohort scope; types | `model.json` | **site-wide** — every table at the site |
| **Mapping · binding** | table field → *which* database column | `mapping.json` · `fields[].sources` | **one table** |
| **Mapping · derivation** | `direct` vs `interpret`; the derive `instruction`; `code_sets` | `mapping.json` · `fields[].kind/instruction/code_sets` | **one table** |
| **Field spec** | what the table asks; permitted values; expected format/units | `spec.json` | **every site** running that audit |
| ~~Executable~~ — **not a target** | the deterministic prepopulate plan | `mapping.json` · `executable` | — *derived* |

**The executable is never a learning target.** It is compiled mechanically from the mapping
by `build_populate_spec.py` and regenerated on *any* mapping change ([mapping.schema.json](../contracts/mapping.schema.json),
§`executable`). Learning writes the **match** — the binding and the derivation; the
executable recompiles for free. So the natural question *"do we ever update the
executable?"* has a clean answer: **no — you update the mapping, and the executable
follows.**

We split the mapping into two targets (**binding** vs **derivation**) not because they live
in different files — they don't — but because they are **diagnosed differently and gated
differently**. Rebinding a field to a clearer column is often safe; flipping `direct` ↔
`interpret`, or rewriting how a value is derived, is structural and always needs a human.

---

## 2 · What we learn from — the signals

| Signal | Trigger | Tells us | Status |
|---|---|---|---|
| **Observational** | nurse fills the EHR by hand during a capture session | *where the value lives* — EHR field → database column | **specified below** |
| **Correction** | nurse edits a value in the populated table | *our answer was wrong* — and the agent's provenance says *how* | **specified below** |
| **Refusal** | *(later)* a field is left blocked-with-reason | a binding/derivation can't hold for this cohort | sketched |
| **Annotation** | *(later)* nurse comments on a cell | free-form *why*, in her words | sketched |

The first two are **complementary**:

- **Observational** tells us *where to look* (which EHR field she read) but not *what was
  wrong* — she is filling from scratch, not reacting to us.
- **Correction** tells us *what was wrong* (our value vs hers, with full agent provenance)
  but not *where to look* — she changed a number, she didn't show us the screen.

Together they **triangulate**. And — crucially — both feed the **same** reconcilers, so a
"where" vote and a "what was wrong" vote about the same field **stack**.

---

## 3 · The one shared shape — Observe → Learn → Reconcile

Every signal flows through the **same three stages**. Stage 1 runs **live** (per event, on
the user's path). Stages 2 and 3 run in the **background** (a parallel worker; "at night" or
continuously — it does not matter; they are off the critical path).

```
  STAGE 1 · OBSERVE            STAGE 2 · LEARN               STAGE 3 · RECONCILE
  (live, per event)           (background, per observation)  (background, per artifact field)

  capture the teacher's       bridge / diagnose the          aggregate candidate changes,
  action into durable    ──▶  observation into a        ──▶  compare to the live artifact,
  evidence                    typed CANDIDATE CHANGE         gate, and apply if better

  out: observation            out: candidate change          out: artifact update (or none)
       (signal-specific)           (artifact-agnostic)            (gated per artifact)
```

What varies by signal is only **Stage 1's evidence shape** and **Stage 2's bridge**. The
handoff from Stage 2 to Stage 3 is **uniform** — a typed `CandidateChange` — so Stage 3
never needs to know which signal produced it.

### The handoff: `CandidateChange`

```
CandidateChange {
  target:     "schema-model" | "mapping.binding" | "mapping.derivation" | "field-spec"
  field:      which table field / database column it concerns
  polarity:   "assert"  — "the value belongs in X" (proposes X)
            | "refute"  — "what we currently use for this field is wrong" (may also assert a replacement)
  payload:    the proposed new value (e.g. new source column, new instruction, new format); may be null for a bare refute
  confidence: how strong this single vote is
  provenance: { signal, patient, evidence_ref, against_applied?: <learned-change-id> }
              // against_applied is set when this vote contradicts a previously learned-and-applied change — the retraction hook (§Reconcile)
}
```

**Polarity is structural, not a knob.** Observational votes are pure **assertions** ("the
value lives in column X"). Correction votes are **refutations** that usually also assert a
replacement ("column Y was wrong; her value is in X"). The two only *stack* when they
**agree**; when they **disagree** Stage 3 must arbitrate, not merely accumulate — so polarity
rides on every vote (see [Reconcile](#stage-3--the-shared-reconciler--aggregate-arbitrate-retract)).

One observation produces **at most one** `CandidateChange` for the *observational* signal —
or **none** (abstain). The *correction* signal is different: a single edit rarely fixes the
target on its own, so its Stage 2 may emit **several low-confidence hypotheses across
targets**, and the real diagnosis crystallises at Stage 3 on the aggregate (see
[Signal B Stage 2](#stage-2--learn--background-form-hypotheses-not-a-verdict)). Either way a
`CandidateChange` is a **vote, not a decision**; Stage 3 decides.

### Reconcile is per-artifact, not per-signal

This is the load-bearing structural rule. **The gate depends on *what is being written*, not
on which signal proposed it.** Rebinding one field in one audit is local and reversible;
restating what a column *means* ripples across every table at the site; changing an audit
spec changes every site that runs that audit. So each **target** owns its gate, and **every**
`CandidateChange` for that target — observational or correction — passes through the **same
gate** and is **tallied together**.

| Target | Auto-apply when… | Otherwise | Corroboration required |
|---|---|---|---|
| `mapping.binding` | same table, clearer/correct column, strong agreement across votes | **human-confirm** | votes within the one table |
| `mapping.derivation` | — *(a `direct`↔`interpret` flip or instruction change is structural)* | **always human-confirm** | votes within the one table |
| `schema-model` | — *(site-wide blast radius)* | **human-confirm**, then flag dependent audits for re-index | **cross-table** — evidence is audit-local ("in NPDA, column X behaves like Y") but the blast radius is site-global; one table's votes do **not** license restating what a column means for *every* audit. Require corroboration from **≥2 tables** before the proposal is even surfaced. |
| `spec.json` | — *(never — the field spec is human-owned)* | **proposal only**, never auto-applied | **repeated, unexplained** — inferring a change to what the *national* audit asks from one site's corrections is local-evidence → global-definition. Only **repeated unexplained** corrections of the same field raise a flag, routed to whoever owns the audit definition; a single correction never does. |

The **convergence point** — and its honest limit. An observational vote and a correction vote
about the same `mapping.binding` field **stack** when they agree, and Stage 3 arbitrates when
they don't. Note what is and isn't shared between the two signals: their Stage 1 and Stage 2
are **entirely disjoint** (one needs vision, one doesn't). What they genuinely share is **the
reconciler and the artifact gates** — and that is enough to call it one loop. But the payoff
is **contingent on votes actually converging**: if bridging abstains on most real EHR data
(see [yield](#build-order-build-backwards-from-the-consumer)), observational contributes few
votes and the "one machine" is mostly carrying correction. We claim unification of the
*decision*, not of the *sensing*.

### Stage 3 · the shared reconciler — aggregate, arbitrate, retract

The reconciler is the **consumer at the end of the chain**, and everything upstream is built
to satisfy *its* contract (see [build order](#build-order-build-backwards-from-the-consumer)).
It is not a vote-counter; it is an **arbiter**. Per artifact field it does three things:

1. **[deterministic] Aggregate across observations.** Gather every `CandidateChange` for the
   field. Correction's per-edit hypotheses are weak and ambiguous in isolation — *the
   diagnosis only emerges from the pattern across patients.* A single `2.7 → 2.5` cannot tell
   wrong-column from wrong-unit from a one-off data fix; ten corrections that all relocate to
   the same column can. So Stage 3, not Stage 2, is where a correction diagnosis is *settled*.
2. **[intelligence — judgement] Arbitrate polarity.** Asserts and refutes for the same field
   may **agree** (stack → stronger) or **conflict** (observational says column X, corrections
   imply Z). Conflict is resolved, never averaged: weigh evidence strength and recency, and
   when neither side dominates, **hold** (surface to a human) rather than apply a coin-flip.
3. **[deterministic + gated] Apply, or retract.** If the winning change clears its target's
   [gate](#reconcile-is-per-artifact-not-per-signal), write it; record the applied change with
   its provenance so it can later be undone. **Retraction is first-class:** a learned-and-
   applied change that starts *attracting refutations* — nurses re-fixing the very field we
   "learned" — is evidence the learning was wrong. A `CandidateChange` whose
   `provenance.against_applied` points at a prior learned change **down-weights and, past
   threshold, reverts** it (back to the pre-learning binding or to a human). Nothing here ever
   silently ossifies: a bad learned change is self-correcting because the corrections it
   provokes are themselves votes against it. This is the answer to *unlearning* — drift, a
   one-off error that crossed threshold, or an EHR upgrade that moved a field all surface the
   same way, as accumulating refutations of an applied change.

> **Why this lives at Stage 3, not Stage 2.** Observational Stage 2 *can* honestly resolve one
> observation to one column (each observation independently locates a value). Correction Stage
> 2 cannot — diagnosis is inherently cross-observation. Putting arbitration and diagnosis here
> keeps Stage 2 honest (it only ever *proposes*) and gives both signals one place where
> contradiction, aggregation, and retraction are handled uniformly.

---

# Part II · Signal A · Observational learning

> *Watching the nurse fill the EHR by hand.* This is the original feature spec, now framed
> as one signal of the shared loop above. Its Stage 1 is the richest of any signal — it needs
> vision — and its Stage 2 is the one genuinely new bridging capability.

The thread: **table field → EHR field → database column.** Stage 1 captures the first arrow
(which EHR field the nurse read). Stage 2 resolves the second (which database column that EHR
field is) and emits a `CandidateChange`. Stage 3 is the shared reconciler.

**Why the screenshots, not the typed value:** the value the nurse *types* may be derived,
reformatted, or summarised, so it is an unreliable key. The reliable signal is **where she
was looking** and **the value as the EHR displayed it**. (See
[Why not reverse-search the typed value](#why-not-just-reverse-search-the-typed-value).)

## Stage 1 · Observe — *live, triggered by a value commit*

**Purpose.** Turn "the nurse just filled a cell" into a single durable **observation** of
*where on the EHR screen* she found that value — and throw the rest of the screen capture
away.

**Runs:** synchronously, the moment she commits one or more values in the intero grid.

**Input:** the live screen-capture buffer (transient) + the commit event.

**Steps:**

1. **[deterministic] Buffer the EHR screen.** While a capture session is active, intero
   keeps a short **rolling buffer** of recent EHR frames (browser screen-share). This buffer
   is **transient** — never persisted, continuously overwritten.
2. **[deterministic] Catch the commit.** When she enters a value, intero knows — from its
   own grid, no vision — **which table field, which patient, and the typed value**. One
   commit may carry **several values at once** (she read them off the same EHR screen);
   each committed field is handled below.
3. **[intelligence — OCR / vision] Find the relevant frame.** *This is the crux.* For the
   committed value(s), intero scans the recent buffer to find the frame where that value (or
   the table field's subject) is **visible on the EHR screen**. The frame that contains it is
   the relevant one. A single frame can satisfy **several** committed fields at once.
   - If the typed value is derived and appears nowhere on screen, intero falls back to the
     field label / most recent stable frame, or **abstains** (records the observation as
     *source-unseen*) rather than guess.
4. **[intelligence — OCR / vision] Extract the evidence.** From the relevant frame, read
   the **EHR-displayed value**, the **field label** beside it, and the **screen identity**.

**Output / stored:** one **observation** per committed field —
`{ patient, table field, typed value, EHR-displayed value, EHR field label, screen id,
relevant-frame crop }`. **Discarded:** every other screenshot in the buffer. We keep only
the relevant evidence, never the full capture.

> Stage 1 does **not** touch the database. It only answers *"where on the screen did this
> value come from."* Resolving that to a database column is Stage 2's job.

## Stage 2 · Learn — *background, per observation*

**Purpose.** Bridge each observation from *"where on the EHR screen"* to *"where in the
database"*, producing a `CandidateChange` targeting `mapping.binding` (or, when the EHR shows
raw evidence behind a value the nurse computed, `mapping.derivation`).

**Runs:** as a background worker over recorded observations — in parallel with live work,
on a schedule, whenever. Not on the nurse's critical path.

**Input:** one observation (EHR-displayed value + field label + patient).

**Steps:**

1. **[deterministic] Probe the database.** For that patient, query the database for the
   **EHR-displayed value** across a pruned set of plausible columns (typed, in-cohort,
   read-only). This yields candidate `table.column` locations.
2. **[intelligence — matching judgement] Pick the column.** Combine two signals — the
   value match above and a **fuzzy match of the EHR field label against column
   names/descriptions** in the [database model](../contracts/database-model.schema.json) — to
   choose the column. Where both agree, confidence is high; where they disagree or several
   survive, **abstain**.

**Output / stored:** a `CandidateChange` for this `(patient, table field)` —
`target: mapping.binding`, `payload: <db> -> table.column`, with `confidence` and
`provenance` pointing back to the observation. One unreliable observation is not a
conclusion; it is a **vote**.

## Stage 3 · Reconcile — *the shared reconciler*

Observational votes feed the [shared reconciler](#stage-3--the-shared-reconciler--aggregate-arbitrate-retract)
unchanged. They are pure **assertions** (polarity `assert`). The only observational-specific
note: a vote that the EHR showed *raw evidence* behind a value the nurse computed is a
`mapping.derivation` candidate (`direct` → `interpret`), which is structural and always
human-confirmed.

## Why not just reverse-search the typed value?

Because the typed value is often **not** what is in the database — derived, reformatted, or
summarised. Matching it directly fails silently or matches the wrong column by coincidence.
The robust signal is **where the nurse looked** and **what the EHR displayed**. Value
matching survives only as *one* of Stage 2's two bridging signals, never the backbone.
Derived fields are first-class: even if she typed a computed stage, the screenshot shows the
raw lab she read, and we learn it as an `interpret` field
([mapping.schema.json](../contracts/mapping.schema.json)).

---

# Part III · Signal B · Correction learning

> *Watching the nurse change a value we got wrong in the populated table.* The mirror of
> observational learning: it needs **no vision and no capture session** — every signal is
> inside our own system — but its Stage 2 is harder, because the question is not "where is
> this value" but **"why was *ours* wrong, and which artifact is to blame."**

The thread: **our value vs hers → a diagnosis → the artifact that caused the error.** The
same correction (`agent = 2.7`, `nurse = 2.5`) can mean four different things — wrong column,
wrong derivation, wrong unit, or wrong column-meaning — and each points at a *different*
artifact. What lets us tell them apart is the **agent's own provenance**.

**What provenance we actually have — and a gap to close first.** The resolution record
([cell-resolution.schema.json](../contracts/cell-resolution.schema.json),
[traceability-and-evidence.md](traceability-and-evidence.md)) records, per cell: the source
`table_column`(s) we read, `kind` (`direct`/`interpret`), a **one-sentence prose
`explanation`**, the `attempts[]`, any `citations`, and `confidence`. It does **not** record
the structured `instruction`, the `code_sets` applied, or the **targeted format/unit**. So:

- **wrong binding** is cleanly diagnosable — the source column *is* recorded.
- **wrong derivation** needs the structured derive rule; the prose `explanation` is too weak,
  but we can fetch the field's `instruction`/`code_sets` from `mapping.json` deterministically
  at diagnosis time. Supported, with a reach-back.
- **wrong unit/format** has **nothing to compare against** — the format we targeted is stored
  nowhere. **Prerequisite:** record the agent's targeted format/unit in the resolution record
  before format/unit diagnosis can work (this is the first step of correction's
  [backward build](#build-order-build-backwards-from-the-consumer)). It is *not* "no new
  provenance."

## Stage 1 · Observe — *live, triggered by a table edit*

**Purpose.** Turn "the nurse just changed a cell we filled" into a single durable
**observation** pairing *our* answer with *hers*, carrying *our full provenance*.

**Runs:** synchronously, the moment she edits a previously-filled cell in the table.

**Input:** the edit event + the cell's existing resolution record.

**Steps:**

1. **[deterministic] Catch the edit.** intero already tracks cell edits and review state. On
   an edit to a filled cell, capture **which table field, which patient, our value, her new
   value**.
2. **[deterministic] Gather provenance.** Pull the cell's resolution record (source
   `table_column`(s), `kind`, prose `explanation`, `attempts[]`) and reach back into
   `mapping.json` for the field's `instruction`/`code_sets` and into the field spec for its
   declared format — plus the **targeted format/unit** once that is recorded (the
   prerequisite above). **No vision** — it is all in our own system, though it is *not* all in
   one record; some is a deterministic join.

**Output / stored:** one **observation** —
`{ patient, table field, agent value, corrected value, agent provenance }`. Append-only.

## Stage 2 · Learn — *background, form hypotheses, not a verdict*

**Purpose.** Given **one** correction and our provenance, form the **hypotheses** it is
consistent with — *not* a verdict. A single `2.7 → 2.5` almost never identifies *which* of the
causes below it was; wrong-column, wrong-unit, wrong-threshold and one-off-data-fix are
usually indistinguishable from one example. The verdict needs the **pattern across patients**,
which is [Stage 3's job](#stage-3--the-shared-reconciler--aggregate-arbitrate-retract). So
this stage emits **one *or several* low-confidence `CandidateChange`s** (each polarity
`refute`, optionally asserting a replacement) and lets the aggregate disambiguate.

**Runs:** as a background worker. Not on the nurse's critical path.

**Steps:**

1. **[deterministic] Probe the database for *her* value.** For that patient, search the
   plausible columns for the **corrected value** (reusing observational Stage 2's probe).
   *Where does her number actually live?*
2. **[intelligence — hypothesis] Map the evidence to candidate targets.** Each row that fits
   becomes a weak `CandidateChange`; several may fire at once and that is expected — Stage 3
   settles it:

   | What this one correction is consistent with | Hypothesis | Target |
   |---|---|---|
   | Her value sits in a **different column** than the one we read | wrong binding | `mapping.binding` |
   | Her value uses the **same raw data**, different transform/threshold | wrong derivation (incl. `direct` should be `interpret`) | `mapping.derivation` |
   | Her value is the **same data, different unit / format / code** | wrong expected format/encoding | `mapping.code_sets`, or `spec.json` *(proposal-only)* — **requires the targeted-format prerequisite** |
   | Her value implies a **column means something** other than the model records | wrong column meaning/scope | `schema-model` *(needs cross-table corroboration at Stage 3)* |
   | Nothing fits, or it looks like a **one-off data fix** | inconclusive | **abstain** |

**Output / stored:** zero or more `CandidateChange`s, each `provenance.signal = correction`.
When the corrected field was itself *previously learned-and-applied*, the vote carries
`provenance.against_applied` so Stage 3 can [retract](#stage-3--the-shared-reconciler--aggregate-arbitrate-retract)
rather than pile on.

## Stage 3 · Reconcile — *the shared reconciler*

Correction hypotheses feed the same
[shared reconciler](#stage-3--the-shared-reconciler--aggregate-arbitrate-retract), where the
diagnosis is **actually settled** on the cross-patient aggregate, contradictions with
observational asserts are arbitrated, and a vote against a prior learned change drives
retraction.

---

# Part IV · Cross-cutting

## Storage — what lives where, and for how long

| Thing | Lifetime | Where | Stage |
|---|---|---|---|
| **EHR screen buffer** *(observational only)* | **Transient** — seconds, overwritten, **never persisted** | memory / ring buffer | 1 |
| **Observation** (signal-specific evidence) | Persisted, append-only | site's `var/` (table-scoped) | 1 → 2 |
| **Candidate change** (a vote: target + polarity + payload + confidence) | Persisted, accumulates | site's `var/` (table-scoped) | 2 → 3 |
| **Applied-change log** (what we learned, when, from which votes) | Persisted, append-only | site's `var/` | written by 3 — the **retraction** audit trail |
| **The four artifacts** (model / mapping / field spec) | Persisted, the live bindings | `var/...` | written by 3, read by the table population |

Everything is **local to the hospital** (the `var/` deployment folder), so two sites never
pollute each other's learning, and no data leaves the building. We **never** keep the full
screen capture — only the relevant frames we extracted an observation from.

> **Retention is not just exfiltration.** Observations carry **clinical values and EHR
> crops** and sit in `var/` append-only. "Local to the hospital" addresses data *leaving* the
> building, not in-deployment **retention and access**. A clinical product needs an explicit
> policy: how long observations are kept after their votes are spent, who in the deployment
> can read them, and when crops are purged. Specifics in [Deferred details](#deferred-details).

> **The durability invariant** (one rule, load-bearing): **no artifact regeneration may wipe
> accumulated learning.** When the database model, mapping, or field spec is regenerated from
> schema or template, the learned candidate changes **and** the human-confirmed overrides must
> survive and re-apply. Their durable home and the carry-through mechanism are in
> [Deferred details](#deferred-details).

## Deterministic vs intelligence — at a glance

| Deterministic (plumbing) | Needs intelligence (OCR / vision / LLM) |
|---|---|
| **Obs:** buffer frames; catch the commit (field, patient, value) | **Obs:** finding the relevant frame for a committed value |
| **Obs:** query the DB for a value; prune candidate columns | **Obs:** reading value + label + screen off the frame |
| **Corr:** catch the edit; gather provenance (record + reach-back) | **Obs:** choosing the column from value + label signals |
| **Corr:** probe the DB for the corrected value | **Corr:** forming candidate hypotheses from one correction |
| **Both:** aggregate votes; detect learned ≠ current; apply/retract; write the artifact | **Corr:** settling the diagnosis on the cross-patient aggregate |
| | **Both:** arbitrating conflicting votes; judging a change is correct |

Each intelligence step has a small, well-scoped job. Everything else is mechanical.
**No second autonomous agent** owns this loop — the intelligence is called as discrete
functions inside otherwise deterministic stages.

## How this fits the existing system

- **Consumer — unchanged.** The table population steps ([core/table_population](../../../core/table_population))
  read the artifacts and never write them.
- **Evidence — new, append-only.** Observations (Stage 1) and candidate changes (Stage 2) are
  immutable votes; they mutate nothing directly.
- **Owner — new, deterministic + gated.** Stage 3 is the **only writer** of the artifacts.

## Deferred details

Settled once the structure above is agreed:

- **Observational Stage 1** — buffer length and frame cadence; commit-to-frame timestamp
  pairing; the OCR/vision model and output shape (which configured model is vision-capable is
  an open infra question — [model-config.md](../contracts/model-config.md)); the abstain rule
  when the value is unseen on screen.
- **Observational Stage 2** — candidate-column pruning and ranking; how value-match and
  label-match combine into a confidence score; the abstain threshold.
- **Correction provenance prerequisite** — the shape of the **targeted format/unit** field
  added to the resolution record (the gate before format/unit diagnosis can run); whether the
  structured `instruction`/`code_sets` are recorded at fill time or always reach-back-fetched.
- **Correction Stage 2** — the hypothesis-mapping rules and per-hypothesis confidence; how an
  inconclusive correction is still weakly recorded.
- **Reconcile** — per target: how many corroborating votes (and, for `schema-model`, how
  many distinct tables) before a change; the **polarity arbitration rule** when an assert and
  a refute conflict (evidence-strength vs recency weighting); the **retraction threshold** —
  how many refutations against an applied change revert it, and whether it reverts to the
  pre-learning state or to a human; the exact line between "safe/mechanical" (auto-apply) and
  "structural" (human-confirm); the judgement prompt.
- **Storage shapes** — the on-disk shape of observations, candidate changes (incl. `polarity`
  and `against_applied`), and the applied-change log in `var/`; the durable home + carry-through
  rule that keeps learned state alive across an artifact regeneration (the
  [durability invariant](#storage--what-lives-where-and-for-how-long)).
- **Retention & access policy** — how long observations (clinical values + EHR crops) are kept
  after their votes are spent, who in the deployment may read them, and when crops are purged.
- **UI** — start/stop capture and the always-visible "recording" indicator (observational);
  the human-confirm surface for structural changes and the **retraction notice** (both signals).
- **Cross-database bridging within one site** — a later phase.
- **Golden-cell export** — confirmed/corrected correction observations (Part III) are the same
  shape of label as a golden cell; exporting them to grow
  [agent-code-evolution.md](agent-code-evolution.md)'s benchmark is sketched, not specified — see
  [improvement-loops.md](../improvement-loops.md#the-one-real-connection-corrections-become-golden-cells).

## Build order: build backwards from the consumer

We build **backwards**, endpoint first — the same method the rest of the product uses. The data
chain is `observation → CandidateChange → artifact → table population`. The table population **already
exists** and already consumes the artifacts, so *its* contract is fixed. We build the nearest
new producer to it (the reconciler), then step back one producer at a time, updating an
earlier producer's contract only when a later one forces it. This is why the shared table-population seam
comes first and is *not* the speculative abstraction the review feared: its input contract
(`CandidateChange`) is pinned by a **real, existing consumer**, not an imagined signal. We
discover the contract at the *endpoint*, where it is concrete — not by guessing all contracts
up front and reworking forward.

Correction is the cheapest producer (no vision, in-system), so its track lands before
observational's.

1. **Endpoint — the reconciler + the `CandidateChange` contract (headless).** Stage 3 built
   against the *real* artifacts: aggregate, arbitrate polarity, gate per target, apply, and
   **retract**; plus the `var/` stores and the durability carry-through. Prove a hand-fed
   candidate updates an artifact, **survives a regeneration**, and that a refuting vote
   **reverts a prior applied change**. *Everything upstream is built to satisfy this.*
2. **Step back — correction Stage 2 producer (no vision).** First concrete step: **record the
   targeted format/unit** in the resolution record (the prerequisite without which format/unit
   diagnosis has nothing to compare). Then probe for her value ▸ form hypotheses ▸ emit
   `CandidateChange`s ▸ let step 1's reconciler settle it. A **complete learning loop with
   zero vision** — the first real win. *(Binding + derivation diagnosis still ship if the
   format-recording work slips.)*
3. **Step back — observational Stage 2 bridging, gated on yield (headless).** EHR field
   (value + label) + patient → ranked column on the seed databases; same `CandidateChange`
   contract, no UI, no vision. This is the one unproven primitive, so its build carries an
   **explicit success gate: measured yield on genuinely ambiguous seed data.** Does it produce
   *votes*, or abstain on everything? A target yield gates steps 4–5 — if bridging abstains on
   most real EHR-shaped data, observational learning is theatre and we stop here.
   *(Correction does not depend on this gate.)*
4. **Step back — observational Stage 1 commit hook + observation log**, value/label supplied
   explicitly (vision stubbed). Proves the live capture loop with zero vision risk.
5. **Observational Stage 1 capture + vision.** Real screen buffer, real "find the relevant
   frame", real extraction; discard the rest. Prove the *next run* fills a previously-wrong
   field correctly.
