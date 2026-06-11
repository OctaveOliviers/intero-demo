import { tool } from "@opencode-ai/plugin"
import path from "path"

import { pythonInterpreter, toolsDir } from "./_python"

// The single SQL interface for the cell-fill agent. Tool name: sql_execute
// (opencode derives <file>_<export>). Shells to sql_execute.py, which routes by
// the `database` name, enforces read-only vs read-write, and injects the cohort
// / run scope — the agent supplies only `database` + `sql`.
async function run(args: Record<string, unknown>, context: any) {
  const script = path.join(toolsDir, "sql_execute.py")
  // Run in the SESSION directory (context.directory), where this run's
  // context.json + symlinked databases live. Unlike the legacy tools (which take
  // an explicit databasePath and so use the project root, context.worktree), this
  // tool resolves the run by its working directory — so it must be the per-session
  // one. Fall back to worktree if a runtime only populates that.
  const result = await Bun.$`${pythonInterpreter()} ${script} ${JSON.stringify(args)}`
    .cwd(context.directory ?? context.worktree)
    .nothrow()
  if (result.exitCode === 0) return result.stdout.toString()
  const stderr = result.stderr.toString().trim()
  const stdout = result.stdout.toString().trim()
  return stdout || stderr || JSON.stringify({ ok: false, error: "sql_execute exited non-zero" })
}

export const execute = tool({
  description: `Run one SQL statement against a database. Write plain SQL — the cohort and the run are scoped in for you; never add them yourself.

database = "cells": the audit worksheet you are filling (read + write).
  • find work:  SELECT ref, field, member, kind FROM cells WHERE state = 'pending'
  • write:      UPDATE cells SET value='1', state='filled', confidence='high', resolved_by='agent', explanation='...' WHERE ref='ALL!T17'
  A value must be one of the field's permitted codes; an off-code write is rejected with the reason — fix it. To mark a genuinely missing value: UPDATE cells SET state='blocked', reason_code='NOT_LOCATED', reason_detail='...' WHERE ref='...'.

database = a clinical database name (e.g. "cord-ph"): read-only, SELECT only.
  • SELECT patient_code, cord_arterial_ph FROM cord_ph_birth_records

Returns {ok, rows} for a read, {ok, updated:[refs]} for a write, or {ok:false, error}.`,
  args: {
    database: tool.schema.string().describe('Database name: "cells", or a clinical database name.'),
    sql: tool.schema.string().describe("The SQL. Do not add cohort/run filters — the tool injects them."),
  },
  execute: run,
})
