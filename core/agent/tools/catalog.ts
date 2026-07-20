import { tool } from "@opencode-ai/plugin"
import path from "path"

import { pythonInterpreter, toolsDir } from "./_python"

// The navigate `ls`. Tool name: catalog_execute (opencode derives
// <file>_<export>). Shells to catalog.py, which reads the bound databases'
// model.json files ONLY — read-only, no SQLite, no SQL.
async function run(args: Record<string, unknown>, context: any) {
  const script = path.join(toolsDir, "catalog.py")
  const result = await Bun.$`${pythonInterpreter()} ${script} ${JSON.stringify(args)}`
    .cwd(context.directory ?? context.worktree)
    .nothrow()
  if (result.exitCode === 0) return result.stdout.toString()
  const stderr = result.stderr.toString().trim()
  const stdout = result.stdout.toString().trim()
  return stdout || stderr || JSON.stringify({ ok: false, error: "catalog exited non-zero" })
}

export const execute = tool({
  description: `List a collection's items, each with its one-line summary. The entry point when you don't yet know what holds what — like \`ls\` of the top level. Defaults to the bound databases.

  NEVER lists a database's tables (a database can hold hundreds) — use \`search\` to find where a value lives. Reads metadata only, never opens SQLite for cell values.

  • {}  -> e.g. {"ok":true,"databases":[{"database":"cord-ph","title":"Cord pH EMR","summary":"Maternity & neonatal birth records with cord-blood gas results"}]}

  No items comes back as an empty list, not an error. An unknown collection is an error listing the valid ones.`,
  args: {
    collection: tool.schema
      .string()
      .optional()
      .describe("The collection to list; one of \"databases\" (default), \"datasets\", or \"templates\"."),
  },
  execute: run,
})
