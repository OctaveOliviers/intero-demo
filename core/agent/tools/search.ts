import { tool } from "@opencode-ai/plugin"
import path from "path"

import { pythonInterpreter, toolsDir } from "./_python"

// The navigate keyword grep. Tool name: search_execute (opencode derives
// <file>_<export>). Shells to search.py, which reads the bound databases'
// model.json files ONLY — read-only, no SQLite, no SQL.
async function run(args: Record<string, unknown>, context: any) {
  const script = path.join(toolsDir, "search.py")
  const result = await Bun.$`${pythonInterpreter()} ${script} ${JSON.stringify(args)}`
    .cwd(context.directory ?? context.worktree)
    .nothrow()
  if (result.exitCode === 0) return result.stdout.toString()
  const stderr = result.stderr.toString().trim()
  const stdout = result.stdout.toString().trim()
  return stdout || stderr || JSON.stringify({ ok: false, error: "search exited non-zero" })
}

export const execute = tool({
  description: `Keyword grep for where a value lives, across a whole collection. The way INTO tables when you don't yet know which table.column holds a field — nothing lists every table, so you search. Defaults to the bound databases.

  Case-insensitive substring match over names, descriptions, and code-set labels; returns candidate items (metadata only, never cell values). Keyword only — not semantic.

  • {"query": "ph"}  -> e.g. {"database":"cord-ph","table":"cord_ph_birth_records","column":"cord_arterial_ph","matched_on":"column_name","context":"cord_arterial_ph"}

  No matches comes back as an empty result, not an error. An unknown collection is an error listing the valid ones.`,
  args: {
    query: tool.schema.string().describe("A single keyword to grep for, e.g. \"ph\" or \"delivery\"."),
    collection: tool.schema
      .string()
      .optional()
      .describe("The collection to grep; one of \"databases\" (default), \"datasets\", or \"templates\"."),
  },
  execute: run,
})
