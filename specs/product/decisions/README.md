# Architectural Decision Records (ADRs)

Short, append-only records of **decisions that were made and why** — the counterpart
to [open-questions.md](../open-questions.md), which tracks decisions still *owed*.
Git history records *what* changed; an ADR records *why* a hard-to-reverse choice
was made, so a future reader (human or agent) does not undo it without knowing the
trade-off.

These are maintained by the `/grill-with-docs` and `/domain-modeling` skills, which
offer to write one at the moment a qualifying decision crystallises.

## When to write one

Only when **all three** are true (if any is missing, skip it):

1. **Hard to reverse** — changing your mind later carries real cost.
2. **Surprising without context** — a future reader will ask "why did they do it this way?"
3. **A real trade-off** — there were genuine alternatives and one was chosen for specific reasons.

"We use library X over an interchangeable library Y" usually needs no ADR.
"We execute SQL-as-data through a fixed executor instead of generated code" does.

## Format

One file per decision, numbered: `NNNN-kebab-title.md`. Use the template:

```md
# NNNN — <Title>

- **Status:** Accepted | Superseded by [NNNN] | Deprecated
- **Date:** YYYY-MM-DD

## Context
The forces at play — what made this a real decision.

## Decision
What we chose, stated plainly.

## Consequences
What this makes easy, what it makes hard, and what it forecloses.
```

When a decision is later reversed, set the old ADR's status to **Superseded** and
write a new one — never edit the original's decision out.
