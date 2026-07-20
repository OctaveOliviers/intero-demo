import { tool } from "@opencode-ai/plugin"
import path from "path"

import { pythonInterpreter, toolsDir } from "./_python"

async function run(args: Record<string, unknown>, context: any) {
  const script = path.join(toolsDir, "join_paths.py")
  const result = await Bun.$`${pythonInterpreter()} ${script} ${JSON.stringify(args)}`
    .cwd(context.directory ?? context.worktree)
    .nothrow()
  if (result.exitCode === 0) return result.stdout.toString()
  const stderr = result.stderr.toString().trim()
  const stdout = result.stdout.toString().trim()
  return stdout || stderr || JSON.stringify({ ok: false, error: "join_paths exited non-zero" })
}

export const execute = tool({
  description: `Follow the edges: from a table, every table one hop away. The join graph is DERIVED from model.json (within-database foreign keys + measured cross-database identity links) — never guessed from column names, and it never opens a live database. Read the neighbours, then describe the one(s) you want.

  {"database": "cord-ph", "table": "cord_ph_birth_records"}

  Returns {ok, database, table, neighbours: [{database, table, via: "foreign_key"|"identity_link", from_column, to_column, cardinality?, declared?, evidence?}]}. from_column is the column on YOUR table to join on; to_column is the column on the neighbour. cardinality/declared are foreign_key-only. A table with no neighbours returns an empty list.`,
  args: {
    database: tool.schema.string().describe("The database slug the table lives in, e.g. \"cord-ph\"."),
    table: tool.schema.string().describe("The table whose one-hop neighbours you want, e.g. \"cord_ph_birth_records\"."),
  },
  execute: run,
})
