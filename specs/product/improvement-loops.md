# Improvement loops — how Intero gets better over time

> **Status: proposed.** Both loops this document maps are forward-looking (neither is built). This
> is the **map**, not the mechanics — read it first, then
> [site-artifact-learning.md](features/site-artifact-learning.md) and
> [agent-code-evolution.md](features/agent-code-evolution.md) for how each actually works.

Intero's behavior at any moment is the product of three layers, and **exactly one loop owns each
layer** — never two, never zero:

```
behavior  =  model  ×  agent code (SKILL.md, tools, prompt)  ×  site artifacts (model.json, mapping.json, spec.json)
              │                    │                                        │
        model-shrink          agent code                              site artifact
        loop (dev,            evolution (dev,                         learning
        global, slow)         global, nightly)                        (production, per-site)
```

| | Site artifact learning | Agent code evolution | Model-shrink loop |
|---|---|---|---|
| Spec | [site-artifact-learning.md](features/site-artifact-learning.md) | [agent-code-evolution.md](features/agent-code-evolution.md) | same spec, [§Two cadences](features/agent-code-evolution.md#two-cadences) |
| ML analogy | online supervised learning — labels arrive one at a time, in production | offline optimization against a fixed benchmark — like architecture/prompt search on a held-out set | the same search, repeated for each candidate model size |
| Runs | continuously, at a live hospital deployment | overnight, on a Melodic engineer's machine | slower/periodic, same machine |
| Learns from | real clinicians' actions in production — both watching them fill the EHR by hand (observational) and watching them correct our output (correction) | a frozen, golden cell benchmark | the golden benchmark, re-optimized per model |
| Writes | `model.json` / `mapping.json` / `spec.json` — **per-site data bindings** | `SKILL.md` / tools / `opencode.json` / prompt — **shared agent code** | the pinned model choice, plus shared agent code |
| Actor | the deployed product, unattended | a manager agent + editor agents, run by an engineer | same, iterated across model sizes |
| Trust gate | per-artifact auto-apply rules + human-confirm, scoped to one site | invariant test suite + a human-reviewed PR | same as agent code evolution, per model trial |
| Output | an applied artifact update at one site | a pull request against the Intero repo | a pull request repinning the model |

*(The model-shrink loop is not a fourth loop — it's agent code evolution run at a slower cadence
per candidate model, so it inherits that loop's mechanics and trust gate wholesale.)*

**Why they can't merge into one machine.** The trust models are incompatible, not just the
mechanics. Site artifact learning auto-applies changes *inside a running hospital deployment*, so
its whole design is built around narrow blast radius — one binding, one site — and self-correction
via retraction ([site-artifact-learning.md §Stage
3](features/site-artifact-learning.md#stage-3--the-shared-reconciler--aggregate-arbitrate-retract)).
Agent code evolution edits *code that ships to every site*, so its design is built around a frozen
benchmark and a human merging a PR. Collapsing them would force one of two bad outcomes: benchmark-
tuned code auto-applying itself in a hospital with no PR review, or a one-site data-binding fix
waiting on a repo merge. The separate gates aren't incidental — they're sized to each loop's blast
radius, so **a change from one must never write the other's artifacts.**

## The one real connection: corrections become golden cells

The two loops don't share machinery, but they share a **pipe**. Site artifact learning's
correction signal ([site-artifact-learning.md Part
III](features/site-artifact-learning.md#part-iii--signal-b--correction-learning))
is exactly what a golden cell is made of: a doctor-in-the-loop, human-confirmed
right-answer for one patient × field. So over time:

```
clinicians correct cells in production (site artifact learning, Stage 1)
        │
        ├──▶ site artifact learning: fix this site's bindings (existing spec, unchanged)
        │
        └──▶ human-confirmed pairs export as new golden cells
                 └──▶ the nightly benchmark grows with real, hard cases
                          └──▶ agent code evolution optimizes against increasingly real data
```

Today the golden set is bootstrapped by a one-time model-drafts / doctor-confirms sprint
([agent-code-evolution.md §Ground
truth](features/agent-code-evolution.md#ground-truth--the-golden-cell-set)).
At scale, production corrections become the ongoing annotation pipeline for free — the two loops
compound without ever touching each other's artifacts. *(The concrete export mechanism — which
correction observations qualify, de-duplication, site consent — is owed; see the deferred details
in both feature specs.)*
