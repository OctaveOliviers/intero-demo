import { tool } from "@opencode-ai/plugin"
import path from "path"

import { pythonInterpreter, toolsDir } from "./_python"

// Generic clarification tool. Tool name: ask_user_question (opencode derives
// <file>_<export>). The Python side validates and writes ask_user_questions.json
// in the chat worktree; the backend then renders the composer question flow.
async function run(args: Record<string, unknown>, context: any) {
  const script = path.join(toolsDir, "ask_user.py")
  const result = await Bun.$`${pythonInterpreter()} ${script} ${JSON.stringify(args)}`
    .cwd(context.directory ?? context.worktree)
    .nothrow()
  if (result.exitCode === 0) return result.stdout.toString()
  const stderr = result.stderr.toString().trim()
  const stdout = result.stdout.toString().trim()
  return stdout || stderr || JSON.stringify({ ok: false, error: "ask_user_question exited non-zero" })
}

export const question = tool({
  description: `Ask the user one or more concise clarification questions. Use this only when a required input or output choice is genuinely unclear.

The UI shows one question at a time in the composer. Each question may include suggested choices and may allow an Other free-text answer.

  • {"questions":[{"id":"dataset_scope","question":"Which Dataset should I use?","choices":[{"id":"whole_db","label":"Whole hospital database"},{"id":"ds-nicu","label":"Term babies admitted to NICU"}],"allow_other":true,"required":true}]}

After calling this tool, stop. The backend will collect the user's answers and start a follow-up turn with those answers.`,
  args: {
    questions: tool.schema
      .array(
        tool.schema.object({
          id: tool.schema.string().describe("Stable machine-readable id for this question."),
          question: tool.schema.string().describe("Exact user-facing question text."),
          choices: tool.schema
            .array(
              tool.schema.object({
                id: tool.schema.string().describe("Stable machine-readable choice id."),
                label: tool.schema.string().describe("User-facing choice label."),
              }),
            )
            .optional()
            .describe("Ordered suggested answers."),
          allow_other: tool.schema.boolean().optional().describe("Whether the composer should show an Other option."),
          required: tool.schema.boolean().optional().describe("Whether the agent considers this answer important."),
        }),
      )
      .describe("One or more questions. The UI presents them sequentially, one at a time."),
  },
  execute: run,
})
