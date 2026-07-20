# 0001 — SQL-as-data + a fixed executor, not generated code

- **Status:** Accepted
- **Date:** 2026-06-04

## Context

A run must turn each region of a field mapping into rows from a hospital database.
The obvious agentic approach is to let the LLM write Python or SQL at run time and
execute it. But the product's hardest invariant is **read-only, never-fabricate
safety against real patient data**: no generated or user-edited code may execute
against a hospital database. We also want runs to be fast and reproducible, which
argues for precomputing everything that does not depend on the user's request.

## Decision

The mapping carries an **executable block**: parameterised, read-only SQL per
region (filters supplied as bind parameters), a cell map, and the identity join
keys — all **data, not code**. A single fixed, audited executor (Tier 1) runs that
SQL read-only. The LLM injects only the filter values; it never authors executable
code. Interpretive values are the one run-time exception, and even there the agent
only *reads* evidence — it never queries with generated code.

## Consequences

- **Easy:** strong safety story (no generated code touches patient data); fast,
  reproducible runs; SQL is inspectable and captured as each cell's evidence.
- **Hard:** anything the precomputed SQL cannot express must escalate to the
  interpretive tiers rather than have the agent write a smarter query.
- **Forecloses:** run-time code generation against hospital databases. Reversing
  this would reopen the core safety posture and is not a casual change — hence
  this record.
