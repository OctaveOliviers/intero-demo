import { tool } from "@opencode-ai/plugin"
import path from "path"

import { pythonInterpreter, toolsDir } from "./_python"

async function run(args: Record<string, unknown>, context: any) {
  const script = path.join(toolsDir, "lookup.py")
  const result = await Bun.$`${pythonInterpreter()} ${script} ${JSON.stringify(args)}`
    .cwd(context.directory ?? context.worktree)
    .nothrow()
  if (result.exitCode === 0) return result.stdout.toString()
  const stderr = result.stderr.toString().trim()
  const stdout = result.stdout.toString().trim()
  return stdout || stderr || JSON.stringify({ ok: false, error: "lookup exited non-zero" })
}

export const execute = tool({
  description: `Look up what a field expects or what a database contains. Read-only; returns just the slice you ask for.

  • {"field": "delivery"}                 -> the field's type, permitted codes, and notes
  • {"audit": true}                       -> the audit's field list (ids + names)
  • {"database": "cord-ph"}               -> the database digest: per-table grain + row counts, the foreign-key/identity join graph, and conventions (use the graph to write multi-hop joins)
  • {"database": "cord-ph", "table": "t"} -> that table's columns`,
  args: {
    field: tool.schema.string().optional().describe("An audit field id, e.g. \"delivery\"."),
    audit: tool.schema.boolean().optional().describe("List the audit's fields."),
    database: tool.schema.string().optional().describe("A database name."),
    table: tool.schema.string().optional().describe("A table within `database`."),
  },
  execute: run,
})
