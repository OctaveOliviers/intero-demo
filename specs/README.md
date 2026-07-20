# Intero specifications

This is the specification tree for Intero — the clinical-audit agent. It is the source of truth for
**what we are building and how**. Start here to find the right document, or to know where a new one
goes.

## The two areas

```
specs/
├── STATUS.md       the single build-status tracker (done / in progress / todo) — the ONLY place status lives
├── product/        the durable product source of truth — WHAT the product is and how it behaves
│   ├── README.md                  index of the product spec set (read this next)
│   ├── CONTEXT.md                  the canonical domain glossary (ubiquitous language)
│   ├── personas-and-use-cases.md  ┐
│   ├── product-flows.md           │ high-level orientation — read these first
│   ├── architecture.md            │
│   ├── vision-100-days.md         ┘ where the product goes next
│   ├── acceptance-criteria.md     ┐ cross-cutting
│   ├── open-questions.md          │ decisions still owed by the cofounders
│   ├── decisions/                 ┘ ADRs — hard-to-reverse decisions already made, and why
│   ├── improvement-loops.md   map of the two forward-looking improvement loops below
│   ├── features/   one self-contained spec per capability / surface
│   │   ├── indexing-and-mapping.md   table-population.md   navigation.md
│   │   ├── traceability-and-evidence.md   auth-and-access.md   library-and-sources.md
│   │   ├── status-and-blocked-items.md   refresh.md   result-view.md   design-system.md
│   │   ├── site-artifact-learning.md   agent-code-evolution.md
│   │   └── inclusion-criteria-setup.md   excel-traceability.md
│   └── contracts/  NORMATIVE machine-checkable contracts (JSON Schemas + their prose companions)
│
└── build-plans/          HOW we plan an implementation — the method only; plans aren't stored here
    └── INSTRUCTIONS.md    the backwards, output-first method the build agent follows
```

**The organising axis is durability, not topic.** `product/` is durable and normative — WHAT the
product is. `build-plans/` holds only the method for HOW to plan a build; the per-feature plans
themselves are never written to the tree — the build agent derives and discards them — so nothing
here rots. Keep the two apart and the tree stays maintainable.

## We are building from scratch — specs describe the latest model only

**There is no legacy.** Intero is being built from scratch: no legacy code, no legacy systems, no
deployed behavior anyone must stay compatible with. The specs exist to describe the **one** product
we have agreed to build — nothing more.

So every spec MUST describe **only the latest agreed behavior**, stated as if it were always the
plan. Specifically:

- **Rewrite, don't amend.** When a decision changes a spec, **rewrite the affected sections in place**
  so they read as a single clean statement. Do **not** keep the old version and bolt on an
  "amendment", a "superseded" note, an inline `(amended — see §N)` marker, or a "frozen baseline +
  later override" structure. If you find yourself writing "§A wins where it differs from §B", collapse
  A and B into one section.
- **No legacy vocabulary.** Don't carry forward retired tables, permission keys, endpoints, or terms
  with strikethrough / "kept for history" / "(or admin)" notes. Delete them. The reader should never
  have to reconcile two competing descriptions of the same thing.
- **Forward-pointers are fine; amendments are not.** Work that is genuinely *still owed* (an open
  question, a contract not yet frozen) gets **one** plain forward-pointer — "the concrete X is defined
  by [Q…]" — not a running diff against a previous draft.
- **The git history is the changelog.** What a spec used to say lives in version control. The spec
  file itself is always the present tense.

When you hand an agent a new or changed decision, the expected output is a **clean rewrite** of the
relevant specs to the latest model — crisp, concise, internally consistent — never a layer of
amendments on top of the old text.

## Concise by default — shortest precise wording wins

The goal is to keep the specs **as concise as possible**. When two phrasings describe the same
behavior equally precisely, **always choose the shorter one.** Cut every word that does not change
what an implementer would build: no restating a point three ways, no defensive hedging, no
"as mentioned above". A spec the reader finishes is worth more than one that covers every angle.
Precision first, then brevity — never sacrifice an actual constraint to save words, but never spend
words that add no constraint.

## Specs describe the target; status lives in one file

A spec describes **the product's target behavior, in the present tense** — what it does when built. It
does **not** carry build status. Don't interleave `*[gap]*` / `*[partial]*` / `[built]` markers,
"current implementation status" notes, ticket numbers, or "TODO-NNNN" references into the spec text —
that mixes two things that change on different clocks (the design vs. how far the build has got) and
makes both harder to read and maintain.

Progress is tracked in exactly one place: [`STATUS.md`](STATUS.md) — a single, minimal tracker of
what is **done / in progress / todo / deferred**, one line per item, each linking the spec section it
refers to. It is the only source of truth for status; the specs stay clean and timeless.

## Where does a new spec go?

| You are writing… | It goes in… |
|---|---|
| A **domain term** — defining or renaming a concept the code/specs/UI share | `product/CONTEXT.md` (the canonical glossary) |
| A **hard-to-reverse decision** you made and want to record the *why* of | `product/decisions/NNNN-*.md` (an ADR) — distinct from open-questions (decisions still owed) |
| Behaviour of a **capability or surface** (table population, refresh, a panel, auth UX) | `product/features/<topic>.md` |
| **High-level** product framing (a persona, the overall flows, system architecture, the vision) | `product/` root |
| A **machine-checkable contract** — a JSON Schema, an API shape, the state/storage model, the permission matrix | `product/contracts/` |
| **Role-based auth / access** behaviour (roles, what each can do, sessions, attribution) | `product/features/auth-and-access.md` — with the normative role/permission matrix in `product/contracts/control-plane-schema-and-permissions.md` |
| The **definition of an audit template** (its single source of truth) | it *is* the `audit-spec` contract: `product/contracts/audit-spec.schema.json` (worked examples + conventions in `product/contracts/README.md`). The registry of *which* templates exist is a catalog concern — see `product/features/library-and-sources.md` |
| **How to plan** building a feature | follow `build-plans/INSTRUCTIONS.md` — the build agent derives the plan itself and keeps it in working memory; plans aren't stored in the tree. |

Rule of thumb: if it's a fact about *what the product is*, it belongs in `product/`. *How* to build a
feature isn't stored as a doc — the build agent plans it on the fly from `build-plans/INSTRUCTIONS.md`.
A forward/exploratory idea that isn't committed product yet stays out of the tree (a doc in Drive)
until it becomes a real `product/` spec.

## How to read the product spec

Read [`product/README.md`](product/README.md) and
[`product/architecture.md`](product/architecture.md) first, then only the feature spec(s) for the
area you're working on — each is written to stand alone. The normative shapes everything validates
against are in [`product/contracts/`](product/contracts/).

## Source of truth

Google Drive is the source of truth for partner-facing product discussion; this repository is the
source of truth for implementation commitments once decisions are accepted. Workflow: discuss scope
in Drive → promote accepted decisions into `product/` as implementation requirements → keep
implementation, tests, and agent behaviour aligned with the accepted spec.
