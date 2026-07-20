# How to build a plan

This file is the method an implementing agent follows to turn a product spec (in
[`../product/`](../product/)) into working code. **The per-issue build plan is not stored
here, or anywhere** — the build agent derives it, holds it in its own working
memory, and discards it when the feature ships. The specs and git history are the
durable record; this file is the single source for *how* to plan well.

> **Issues vs build plans vs build-loop prompts.** Three different things: the loop persists the
> *task breakdown* as vertical-slice issues on the tracker (via `/to-issues`) — the shared,
> grab-able task board; the *per-issue build plan* (the backwards, output-first sequencing below)
> **stays ephemeral**, derived in the builder's working memory and never committed; and a
> ***-build-loop.md** orchestration prompt (e.g. [dataset-build-loop.md](dataset-build-loop.md),
> [threads-tables-build-loop.md](threads-tables-build-loop.md)) is a **transient working artifact**
> — the hand-off that launches a build session — kept here for convenience and **safe to delete or
> gitignore once its build lands** (it is not a spec).

Two rules that never change:

- **Reference the specs, don't restate them.** A plan points at the spec(s) and
  contracts it implements and adds only the build sequencing.
- **Existing code ≠ correct.** When the plan reaches a step whose code already
  exists, verify it against the now-pinned downstream contract and rework it if it
  drifted — never assume it's right just because it's there.

---

## The method: build the feature backwards, output first

Think of any feature as a small chain: one or more **producers** transform inputs
into the feature's **output**, which something — a UI, an endpoint, another system,
a person — **consumes**. Data flows forward (producer → … → output → consumer).
**You build it in the opposite direction: start from the output and walk upstream.**

```
   data flows forward  ───────────────────────────────────────────▶
     producer ──▶ producer ──▶ … ──▶ producer ──▶ OUTPUT ──▶ consumer
         ▲            ▲                  ▲            │
         └─ contract ─┴──── contract ────┴─ contract ┘
   build order  ◀───────────────────────────────────────────────────
   start here ↑  pin the output the consumer needs, then move upstream
```

### Why output-first / backwards

1. **The output is the part you can state most precisely.** Before writing a line
   of code you can say what the feature must produce and who consumes it. That
   definition of "done" is the firmest ground in the whole feature — so start there.
2. **The consumer's needs *are* the contract.** Once the output and its consumer
   are pinned, you know exactly what the producer immediately upstream must deliver.
   Its contract is not a guess — it is dictated by a real consumer.
3. **Every producer is the next consumer.** To build that producer you ask what
   *it* needs as input; that pins the contract for the producer upstream of it.
   Step back and repeat, to the most-upstream producer.

Building **forwards** instead means defining a producer's output *before its
consumer exists*, so every contract is a guess — and guesses get falsified
downstream, forcing a rebuild of the upstream step. Backwards, the consumer always
exists when you define the producer, so the contract is validated by real usage the
moment you write it.

### Three rules that make it work

1. **Define the consumer first.** Never specify a producer's output until something
   concrete consumes it. The consumer's real needs are the producer's contract.
2. **Freeze the contract late.** A contract/schema is a *hypothesis* until a real
   consumer has exercised it on a concrete example. Re-freeze it only then —
   contracts are living, re-frozen per consumer, not pinned up front.
3. **Keep one concrete example that travels backwards with you.** Pick a single
   end-to-end case (a fixture, a golden test, a worked example). Each step pins a
   shape → update the example → a check on it holds the line, so an upstream change
   can't silently break a downstream consumer.

---

## Scope each task for a fresh subagent

Each task in the plan is handed to a subagent that starts with **no prior context**.
Those subagents do their best work when the task is small and precisely scoped —
just enough to do one well-defined thing, then stop. Size every step to a single
coherent sub-feature:

- **Small enough** that a fresh agent can hold the whole task at once. Too big, and
  its subagent has to juggle a large, growing context, and the quality of its work
  falls off as that context bloats — it loses track of what matters.
- **Large enough** to be worth spawning — don't split a one-line change into its
  own task. The unit is a precise sub-feature, not a single line.

When a step carries more than one concern, break it down until each piece is one
clean job a fresh agent can finish and hand back. Well-scoped tasks aren't just
tidy — small, sharp context is what keeps the subagents effective.

---

## What a good plan establishes

Hold these in working memory (or jot them in your run notes) — you do not write them
to a file:

- **The chain.** Name this feature's producer→consumer chain in one line
  (`<source> ──▶ <transform> ──▶ <output> ──▶ <consumer>`), and mark the
  output/consumer end — that's where the backward build starts.
- **The build order, backwards.** Steps from the output's consumer (step 1) to the
  most-upstream producer. For each step, know:
  - **Role** — what it owns, and explicitly what it does *not*.
  - **Consumer that pins it** — the already-defined downstream step whose needs are
    this step's contract.
  - **Pins upstream** — what this step therefore requires of the producer feeding it.
  - **Build or verify** — does the code already exist? `BUILD`, `VERIFY`, or
    `VERIFY/rework`.
  - **Verify** — the concrete, runnable check that the step is done (ideally
    exercised by the regression example).
  - **Freeze** — the contract/schema this step (re)freezes once its consumer has
    exercised it.
- **Contracts touched** — the schemas this feature freezes or changes, and at which
  step. Regenerate derived artifacts; don't hand-edit them.
- **Out of scope** — what the feature deliberately doesn't cover, and where that
  deferred scope is recorded.
- **Done when** — the single end-to-end check (the regression example passing) that
  subsumes the per-step verifies.
