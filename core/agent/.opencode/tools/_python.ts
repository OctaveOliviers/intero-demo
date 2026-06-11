// Single source of truth for the Python interpreter every tool wrapper shells
// to. Resolved once here so the venv offset is maintained in ONE place
// (storage-layout §2: "the venv must stay at the repo root … addressed from
// the code plane and shared by every run with zero per-run setup").
//
// Resolution order:
//   1. INTERO_VENV_PYTHON env var (deployment / orchestrator override).
//   2. <repo>/.venv/bin/python, computed as a fixed offset from this file's
//      real location — it is core/agent/.opencode/tools/_python.ts, so four
//      ".." hops land at the repo root regardless of which run dir launched
//      opencode (a symlinked .opencode resolves to its real path).
//   3. The system "python3" — last-resort fallback when neither is available
//      (CI, smoke tests, standalone tool invocations).

import { existsSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
// _python.ts sits at core/agent/.opencode/tools/, so four levels up = repo root.
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..")
const DEFAULT_VENV_PYTHON = path.join(REPO_ROOT, ".venv", "bin", "python")

export function pythonInterpreter(): string {
  const override = process.env.INTERO_VENV_PYTHON
  if (override && existsSync(override)) return override
  if (existsSync(DEFAULT_VENV_PYTHON)) return DEFAULT_VENV_PYTHON
  return "python3"
}

// The directory holding the .py siblings every tool wrapper exec's.
export const toolsDir = HERE
