import { tool } from "@opencode-ai/plugin"
import path from "path"

import { pythonInterpreter, toolsDir } from "./_python"

// Domain table sink. Tool name: table_execute (opencode derives
// <file>_<export>). Shells to table.py, which records the request in the chat
// worktree; the server owns pinning the table and launching population.
async function run(args: Record<string, unknown>, context: any) {
  const script = path.join(toolsDir, "table.py")
  const result = await Bun.$`${pythonInterpreter()} ${script} ${JSON.stringify(args)}`
    .cwd(context.directory ?? context.worktree)
    .nothrow()
  if (result.exitCode === 0) return result.stdout.toString()
  const stderr = result.stderr.toString().trim()
  const stdout = result.stdout.toString().trim()
  return stdout || stderr || JSON.stringify({ ok: false, error: "table exited non-zero" })
}

export const execute = tool({
  description: `Create and populate a table for the user's request. Use this when the user is asking for a structured table/audit/worklist rather than a direct natural-language answer.

You do not launch a worker or subagent yourself. Call this tool once with the domain request; the server will pin the table, start the table-population machinery, and show the table in the thread.

  - {"title":"Cord pH audit table",
     "request":"Create one row per birth with delivery mode and cord arterial pH.",
     "source_template":"cord-ph",
     "dataset_id":"ds-term-babies",
     "description":"Any concise notes that help explain the table."}

"source_template", "dataset_id", and "description" are optional. If you are unsure which template or Dataset applies, omit it or ask the user a clarification first. Returns {ok:true, title} once the table request is recorded.`,
  args: {
    request: tool.schema.string().describe("The complete table request in plain language, including requested rows/columns/scope."),
    title: tool.schema.string().optional().describe("Short table title. Omit to derive it from request."),
    source_template: tool.schema.string().optional().describe("Optional seeded audit/template id when known, e.g. \"cord-ph\"."),
    dataset_id: tool.schema.string().optional().describe("Optional Dataset id when the table should be scoped to a saved Dataset."),
    description: tool.schema.string().optional().describe("Optional concise notes for the persisted table."),
  },
  execute: run,
})
