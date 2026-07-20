import { tool } from "@opencode-ai/plugin"
import path from "path"

import { pythonInterpreter, toolsDir } from "./_python"

// The navigate structure-plus-meaning read. Tool name: describe_execute
// (opencode derives <file>_<export>). Shells to describe.py — the ONLY
// navigate tool that touches the live database: column names + types are read
// LIVE from SQLite (read-only), code-set meanings come from model.json. Read-only,
// local-only, no cohort, never row values.
async function run(args: Record<string, unknown>, context: any) {
  const script = path.join(toolsDir, "describe.py")
  const result = await Bun.$`${pythonInterpreter()} ${script} ${JSON.stringify(args)}`
    .cwd(context.directory ?? context.worktree)
    .nothrow()
  if (result.exitCode === 0) return result.stdout.toString()
  const stderr = result.stderr.toString().trim()
  const stdout = result.stdout.toString().trim()
  return stdout || stderr || JSON.stringify({ ok: false, error: "describe exited non-zero" })
}

export const execute = tool({
  description: `Describe a node at table OR column depth — its columns, types, and code sets — in a single batched call. Each entry is qualified by its database, so one call can span databases.

  An entry is {database, table} for the WHOLE table, or {database, table, column} for a single COLUMN (a leaf path) — return just that one column when you already pinpointed it (e.g. via search) and only want its type/codes, not the wide table. Column names + types are read LIVE from the database (always current, zero drift); the code-set meanings and the column/table descriptions come from the model. Read-only and metadata only — never returns row/cell values, no cohort needed.

  • {"tables": [{"database":"cord-ph","table":"cord_ph_birth_records"}, {"database":"npda-clinical","table":"clinic_visits"}]}
    -> for each: {"database","table","grain","description","columns":[{"name","type","description","codes":{...}}]}
  • {"tables": [{"database":"cord-ph","table":"cord_ph_birth_records","column":"delivery"}]}
    -> {"database","table","column","type","description","codes":{...}}  // just that column

  Entries come back in the order requested. An unknown database, table, or column is an error that lists what is available.`,
  args: {
    tables: tool.schema
      .array(
        tool.schema.object({
          database: tool.schema.string().describe("A bound database slug, e.g. \"cord-ph\"."),
          table: tool.schema.string().describe("A table within that database, e.g. \"cord_ph_birth_records\"."),
          column: tool.schema
            .string()
            .optional()
            .describe("Optional. A column within that table — present makes this a leaf path returning JUST that column; absent returns the whole table."),
        }),
      )
      .describe("One or more {database, table} or {database, table, column} entries to describe in this call (may mix databases and depths)."),
    collection: tool.schema
      .string()
      .optional()
      .describe("The collection to read; one of \"databases\" (default), \"datasets\", or \"templates\"."),
  },
  execute: run,
})
