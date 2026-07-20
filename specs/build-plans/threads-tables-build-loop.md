# Threads / tables / chat — build-loop map (Intero v1)

> Index, not a build prompt. The 2026-06-25 threads/tables redesign is built as **three separate
> build-loops**, not one orchestration, so each lands and is validated on its own. This file records
> the split, the dependency graph, and which prompt owns what. Working artifact — safe to delete once
> all three land.

## Why three prompts

The redesign is three things, and they are **not** a chain:

- **`navigate-db`** — the shared backend navigation substrate. Pure backend; independently testable.
- **thread / table flow** — the front-end + the additive contracts. **Reuses the already-shipped
  table-population `table-fill` engine** (which runs on today's `lookup`), so it does **not** depend on
  `navigate-db` and can be built **in parallel** with it.
- **chat-with-DB** — the **join** of the two: the `chat-answer` skill wants `navigate-db` to find data,
  and it renders **inline in the thread** the flow builds. So it lands **after both foundations**.

```
navigate-db (A) ─┐
                 ├──▶ chat-with-DB (C)
thread/table (B) ┘
       │
       └──▶ sharing  (rides on Track B — its contract is coupled to the table entity)
```

A and B are independent, parallel tracks. C is gated on both.

## The three prompts

| Track | Prompt | Status | Depends on |
|-------|--------|--------|------------|
| **A** | navigate-db-build-loop.md *(brief deleted on landing)* — the navigation skill + its four tools, backend only | **✅ Landed** — shipped as the `navigate` skill (renamed from `navigate-db`) + `catalog_execute` / `search_execute` / `describe_execute` / `join_paths_execute`; see [navigation.md](../product/features/navigation.md) + ADR [0005](../product/decisions/0005-navigation-is-a-generic-verb-set-over-collections.md) | — |
| **B** | [thread-table-flow-build-loop.md](thread-table-flow-build-loop.md) — the thread/table front-end flow + narrow sharing + the additive contracts; chat left as a **seam** | **✅ Landed** — thread surface (`app/src/components/ThreadView.svelte`) + the chat seam (`data-seam="chat-answer:track-c"`); thread/table entities + endpoints (`server/routes/`, `core/threads/`) | — (reuses the shipped engine) |
| **C** | [chat-with-db-build-loop.md](chat-with-db-build-loop.md) — the `chat-answer` skill + chat output rendered inline in the thread | **✅ Landed** — `chat-answer`, chat-mode SQL, per-message scope disclosure, backend-owned citation evidence, aggregate evidence, and streamed inline answers | A and B |

> NOTE (navigate-db build): Track A landed and its working brief was deleted. This row's
> description predates the collection split — navigate-db's verbs are now generic over `databases` /
> `datasets` / `templates` and `describe-table` reads table-or-column depth. Defer to
> [navigation.md](../product/features/navigation.md) for the shipped shape; left here for the owner.

A, B, and C are **landed**. Track C filled the chat seam using Track A's `navigate`
tools and Track B's thread surface. Each prompt is self-contained: it carries its
own read-first list, commands, slice spine, review gate, done-conditions, stop
bounds, and in/out scope.

## Shared facts (true for every track)

- **Builds on:** the landed Dataset primitive (#287) and the existing table-population `table-fill` run,
  streaming/activity feed, and evidence panel — reuse, don't rebuild.
- **Holds the line:** read-only / local-only / never-fabricate invariants; scope binds to the **table**,
  the **thread** roams (decision 0004).
- **Deferred everywhere — do not build:** dashboards, projects/folders, thread sharing, table
  versioning, run-over-run / longitudinal views, scheduled runs, refresh, and the hospital-permission
  intersection (Q37).
- **Per-issue method:** each prompt slices the spec into vertical-slice issues via `/to-issues`,
  dispatches a test-first builder per issue (`/tdd`) in its own worktree, and runs an adversarial,
  fresh-context review gate (acceptance-reviewer + code-reviewer, plus a visual reviewer for Track B)
  that oscillates up to 10 rounds. The per-issue implementation plan derives from
  [INSTRUCTIONS.md](INSTRUCTIONS.md) and stays ephemeral; the issue list is the persisted task board.
