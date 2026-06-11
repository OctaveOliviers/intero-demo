---
name: <skill-name>
description: <one-line description>
metadata:
  boundary: <workflow-boundary>
---

# <Skill Name>

<2-3 sentences: what this skill does, what problem it solves, what the output is. Lead with the point. No filler, no throat-clearing.>

## Contract — do exactly this and nothing else

<1-3 sentences defining the strict boundary of what this skill does. List allowed tools. List tools that look related but are out of scope. End with what to do when done (e.g. "Stop as soon as X succeeds.").>

**Allowed tools:** <list>

**Never use these here:** <list>

## When to use

- <Trigger 1: specific scenario>
- <Trigger 2: specific scenario>
- <Trigger 3: specific scenario>

## Tools

- `<tool_name>` — <what the tool does, one sentence>
- `<tool_name>` — <what the tool does, one sentence>

## Steps

### 1. <Step title>

<What to do, why. Include example tool calls:>

```json
{"key": "value"}
```

### 2. <Step title>

<What to do, including edge cases to handle.>

### 3. <Step title>

<Include alternative paths: if X, do Y; if Z, do W.>

## Rules

- <Constraint or guardrail. Concrete, actionable.>
- <Reference tools by their registered names (e.g. `sql_execute`, not "the SQL tool").>
- <Include example tool calls in JSON format within Steps.>
- <Document the storage location for any artifacts the skill creates.>
- <Be honest about limits.>

## Completion

When done, report status using one of:
- **DONE** — completed with evidence.
- **DONE_WITH_CONCERNS** — completed, but list concerns.
- **BLOCKED** — cannot proceed; state blocker and what was tried.
- **NEEDS_CONTEXT** — missing info; state exactly what is needed.

## What this skill does NOT do

- <Thing the skill might be confused with, but doesn't do.>
- <Another out-of-scope action.>
