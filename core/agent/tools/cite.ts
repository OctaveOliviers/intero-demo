import { tool } from "@opencode-ai/plugin"
import path from "path"

import { pythonInterpreter, toolsDir } from "./_python"

// Citation sink. Tool name: cite_execute. The Python side validates the source,
// assigns the next marker, and appends it to citations.json for the backend stream.
async function run(args: Record<string, unknown>, context: any) {
  const script = path.join(toolsDir, "cite.py")
  const result = await Bun.$`${pythonInterpreter()} ${script} ${JSON.stringify(args)}`
    .cwd(context.directory ?? context.worktree)
    .nothrow()
  if (result.exitCode === 0) return result.stdout.toString()
  const stderr = result.stderr.toString().trim()
  const stdout = result.stdout.toString().trim()
  return stdout || stderr || JSON.stringify({ ok: false, error: "cite exited non-zero" })
}

export const execute = tool({
  description: `Record one evidence source for the chat answer. Call this when you want a citation marker for a claim; the backend assigns the marker and returns it. Do not choose marker numbers yourself.

Pass the evidence source only: {database, query, table_column, explanation, kind?, row_id?, row_key?, citations?, denominator?, completeness?, covered_rows?}. The query must be a SELECT over a registered chat database. After recording the citation, continue writing the answer text naturally.`,
  args: {
    kind: tool.schema.string().optional().describe("Optional citation kind: source or aggregate. Defaults to source."),
    database: tool.schema.string().describe("Registered clinical database slug."),
    query: tool.schema.string().describe("SELECT that re-extracts the cited value beside its identity."),
    table_column: tool.schema.string().describe("table.column the cited value lives in."),
    explanation: tool.schema.string().optional().describe("What the value is or how it was computed."),
    row_id: tool.schema.string().optional().describe("Free-text source primary key, when citing a note/comment."),
    row_key: tool.schema.string().optional().describe("Free-text source primary-key column."),
    citations: tool.schema.array(tool.schema.string()).optional().describe("Verbatim substrings for free-text sources."),
    denominator: tool.schema.any().optional().describe("Aggregate denominator metadata."),
    completeness: tool.schema.any().optional().describe("Aggregate completeness metadata."),
    covered_rows: tool.schema
      .array(tool.schema.record(tool.schema.string(), tool.schema.any()))
      .optional()
      .describe("Aggregate source rows behind the claim."),
  },
  execute: run,
})
