# Contract — per-stage model configuration (`models.json`)

Per-stage config is the only path: every LLM call names a stage and
resolves through `models.yaml` / `models.local.yaml`. There is **no** global `LLM_API_BASE` /
`LLM_MODEL` / `LLM_API_KEY` fallback — a stage with no entry is a hard error.

## Why

Different pipeline stages want different models: indexing and mapping are where quality
compounds (top quality, slow is fine), and each agent — the conversational **thread agent**
and the table-population **table agent** — has its own opencode-managed model. One global env
var cannot express that. The deployment target is **local-first (Ollama)** with the option to
point any individual stage at a cloud OpenAI-compatible endpoint.

## Files & precedence

| File | Committed? | Role |
| --- | --- | --- |
| `models.json` (repo root) | yes | Working defaults for every stage (local Ollama out of the box). |
| `models.local.json` (repo root) | **no — gitignored** | Per-deployment override. Merged **per stage key** over `models.json`: a stage entry present here replaces that stage's entry entirely; absent stages fall through to the default. |

Every stage must resolve to an entry after the merge — a stage with **no entry** is a hard
error (no env fallback). `.env` holds only the API keys named by `api_key_env`.

**Secrets never live in either file.** `api_key_env` names an **environment variable**; the
loader reads the key from the environment at call time. A committed file containing a literal
key is a defect.

## Shape

```jsonc
{
  "schema_version": "1",
  "stages": {
    "index_audit": {                      // audit-template spec builder
      "provider": "ollama",               // "ollama" | "openai-compatible"
      "model": "qwen3:32b",
      "endpoint": "http://localhost:11434/v1",
      "temperature": 0.2,                 // optional — stage default if omitted
      "max_tokens": 8000                  // optional — stage default if omitted
    },
    "index_db":     { "provider": "ollama", "model": "qwen3:32b", "endpoint": "http://localhost:11434/v1" },
    "mapping":      { "provider": "ollama", "model": "qwen3:32b", "endpoint": "http://localhost:11434/v1" },
    "thread_agent": { "provider": "ollama", "model": "qwen3:32b", "endpoint": "http://localhost:11434/v1" },
    "table_agent":  { "provider": "ollama", "model": "qwen3:32b", "endpoint": "http://localhost:11434/v1" }
  }
}
```

Example `models.local.json` — point mapping at a cloud model, leave everything else local:

```jsonc
{
  "stages": {
    "mapping": {
      "provider": "openai-compatible",
      "model": "claude-fable-5",
      "endpoint": "https://api.anthropic.com/v1",
      "api_key_env": "ANTHROPIC_API_KEY"
    }
  }
}
```

Example — point `table_agent` (the busiest stage: the table-population agent works every
cell prepopulate leaves open) at a small, fast model while the quality-critical indexing and
mapping stages keep the default:

```jsonc
{
  "stages": {
    "table_agent": {
      "provider": "openai-compatible",
      "model": "fast-mini",
      "endpoint": "https://my-fast-endpoint/v1",
      "api_key_env": "FAST_LLM_API_KEY"
    }
  }
}
```

### Stage keys (closed set)

| Stage | Consumer |
| --- | --- |
| `index_audit` | `core/indexing/build_audit_spec.py` |
| `index_db` | `core/indexing/build_database_model.py` |
| `mapping` | `core/mapping/build_audit_database_map.py` + `build_criteria.py` (both mapping LLM calls) |
| `thread_agent` | the conversational thread agent — its worktree's opencode config (env projection, below); also the model for the `/api/generate` data-describe stream (`server/routes/generate.py` via `core/clients/llm.py`) — the same agent brain answers DB questions |
| `table_agent` | the table-population agent — its run worktree's opencode config (env projection, below) |
| `filters` | **reserved** — the deferred `POST /api/parseFilters` extractor ([api.md](api.md)); invalid to configure until that endpoint lands |

An unknown stage key in either file is a **startup error** (typos must not silently fall back).

### The agent stages — one shared server, per-worktree model selection

`thread_agent` and `table_agent` are not direct chat-completions callers — both agents run on
the **one shared opencode server**. At startup, `model_config.agent_env()` projects **both**
stages into that server process's environment:

| Stage | Projected env keys |
| --- | --- |
| `thread_agent` | `LLM_THREAD_API_BASE` / `LLM_THREAD_MODEL` / `LLM_THREAD_API_KEY` |
| `table_agent` | `LLM_TABLE_API_BASE` / `LLM_TABLE_MODEL` / `LLM_TABLE_API_KEY` |

Each agent worktree's `opencode.json` then names its own keys: the **committed template**
(`core/agent/opencode.json`, table-run shaped) substitutes the `LLM_TABLE_*` keys; the
**thread profile** (`core/agent/worktree.py` `thread_agent_opencode_config`) rewrites them to
`LLM_THREAD_*`. That per-directory config is what gives each agent its own model on the one
server. Only `endpoint`, `model`, and the resolved API key project — `temperature`,
`max_tokens`, and `extra_body` apply to the direct-call stages, not the agent stages.

### Entry fields

| Field | Required | Meaning |
| --- | --- | --- |
| `provider` | yes | `ollama` (local; the tool may manage the server, below) or `openai-compatible` (any hosted/remote endpoint; never process-managed). |
| `model` | yes | Model identifier as the endpoint knows it. |
| `endpoint` | yes | OpenAI-compatible base URL. |
| `api_key_env` | no | Name of the env var holding the bearer key. Omit for local endpoints. |
| `temperature` | no | Per-stage override; stage code's default applies if omitted. |
| `max_tokens` | no | Per-stage override; stage code's default applies if omitted. |
| `extra_body` | no | An object merged **verbatim, last** into the chat/completions request body — the escape hatch for endpoint-specific params the closed set above doesn't name (most often disabling a model's reasoning/thinking; the key varies by vendor — `reasoning_effort`, `enable_thinking`, `chat_template_kwargs`). A key here overrides the computed body, so it's a raw passthrough: only put what the endpoint understands. A value of **`null` DROPS that key** from the body — the way to swap a computed default for an endpoint-specific name. E.g. OpenAI **reasoning models** (o-series / GPT-5 family) reject `max_tokens` and a non-default `temperature`: `"extra_body": {"max_tokens": null, "max_completion_tokens": 10000, "temperature": null, "reasoning_effort": "minimal"}`. |

## Startup behaviour — endpoint readiness, never downloads

On server start the loader:

1. **Parses and validates** the merged config (unknown stage, missing required field, or a
   literal-looking secret → startup error with the offending file + stage named).
2. **Health-checks each distinct endpoint** referenced by a configured stage:
   - `ollama` + a **local** endpoint (`localhost`/`127.0.0.1`): if not listening, **start the
     local Ollama server** and re-check; still down → startup error naming stage + endpoint.
   - `ollama` + a remote endpoint, or `openai-compatible`: health-check only; failure is a
     clear startup error — the tool never process-manages a remote or non-Ollama endpoint.
3. **Models are assumed already present on disk — startup never pulls or downloads.** A model
   missing from the endpoint surfaces as a per-stage error at first use, with a message naming
   the model and stage (so the operator runs the pull themselves).
4. **On shutdown**, the tool stops only what it started itself (an Ollama server it spawned in
   step 2); it never kills a pre-existing user daemon.

## Acceptance

- A stage with no entry after the merge raises a named error at first use (no env fallback).
- A stage entry in `models.local.json` overrides only that stage; other stages keep defaults.
- An unknown stage key or a missing required field fails startup with a named error.
- No file ever contains a literal API key; keys resolve via `api_key_env` at call time.
- Startup with a stopped local Ollama and an all-local config brings the endpoint up (or
  fails loudly); startup never triggers a model download.
- Each stage's calls go to its configured `model` + `endpoint` (observable in the run log /
  prompt-version record, [auth-and-access.md](../features/auth-and-access.md)).
