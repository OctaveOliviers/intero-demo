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
  description: `Look up what an audit field expects. Read-only; returns just the slice you ask for.

  • {"field": "delivery"}                 -> the field's type, permitted codes, and notes
  • {"audit": true}                       -> the audit's field list (ids + names)

  Database/schema reads (which databases are bound, where a value lives, a table's columns/types/codes, a table's join neighbours) are via the navigate tools: catalog_execute, search_execute, describe_execute, join_paths_execute.`,
  args: {
    field: tool.schema.string().optional().describe("An audit field id, e.g. \"delivery\"."),
    audit: tool.schema.boolean().optional().describe("List the audit's fields."),
  },
  execute: run,
})
