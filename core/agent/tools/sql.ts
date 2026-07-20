import { tool } from "@opencode-ai/plugin"
import path from "path"

import { pythonInterpreter, toolsDir } from "./_python"

// The single SQL interface for agents. Tool name: sql_execute (opencode derives
// <file>_<export>). Shells to sql_execute.py, which routes by the context mode:
// table runs get cohort/run injection; chat answers get read-only clinical SQL
// with no cells and no injected cohort.
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
  description: `Run one SQL statement against a database. The context decides the mode.

TABLE-RUN MODE:
database = "cells": the table worksheet you are filling (read + write).
  • find work:  SELECT ref, field, member, kind FROM cells WHERE state = 'pending'
  • write:      UPDATE cells SET value='1', state='filled', confidence='high', resolved_by='agent', explanation='...' WHERE ref='ALL!T17'
  A value must be one of the field's permitted codes; an off-code write is rejected with the reason — fix it. To mark a genuinely missing value: UPDATE cells SET state='blocked', reason_code='NOT_LOCATED', reason_detail='...' WHERE ref='...'.

database = a clinical database name (e.g. "cord-ph"): read-only, SELECT only.
  • SELECT patient_code, cord_arterial_ph FROM cord_ph_birth_records
  The cohort/run filters are injected for you in table-run mode; do not add them yourself.

CHAT MODE:
database = a clinical database name only.
  • There is no "cells" database, no worksheet, and no cohort/run injection.
  • If the prompt names a Dataset scope, you must apply that Dataset's cohort SQL or criteria explicitly in your SELECT.
  • If the prompt says whole hospital database, read exactly what the question needs from the registered clinical databases.
  • Use navigate tools (catalog/search/describe/join_paths) to find tables and joins. Do not query sqlite_master/sqlite_schema or other SQLite catalog tables.

Returns {ok, rows} for a read, {ok, updated:[refs]} for a write, or {ok:false, error}.`,
  args: {
    database: tool.schema.string().describe('Database name: in table-run mode "cells" or a clinical database; in chat mode a clinical database only.'),
    sql: tool.schema.string().describe("One SQL statement. In chat mode, apply any Dataset scope yourself and never query SQLite catalog/schema tables."),
  },
  execute: run,
})
