# Contract — per-stage model configuration (`models.json`)

**Status: SPEC (S4, 2026-06-10). Implementation is a Phase-4 task.** Until it lands, the
single `LLM_API_BASE` / `LLM_MODEL` / `LLM_API_KEY` env trio in `core/config.py` is the live
behaviour — and it remains the **final fallback** below, so single-model deployments keep
working unchanged.

## Why

Different pipeline stages want different models: indexing and mapping are where quality
compounds (top-tier, slow is fine), Tier 2 runs per-cell and wants fast/cheap, and the Tier-3
agent has its own opencode-managed model. One global env var cannot express that. The
deployment target is **local-first (Ollama)** with the option to point any individual stage
at a cloud OpenAI-compatible endpoint.

## Files & precedence

| File | Committed? | Role |
| --- | --- | --- |
| `models.json` (repo root) | yes | Working defaults for every stage (local Ollama out of the box). |
| `models.local.json` (repo root) | **no — gitignored** | Per-deployment override. Merged **per stage key** over `models.json`: a stage entry present here replaces that stage's entry entirely; absent stages fall through to the default. |
| `LLM_API_BASE` / `LLM_MODEL` / `LLM_API_KEY` env | n/a | Final fallback for any stage with **no entry** after the merge. |

**Secrets never live in either file.** `api_key_env` names an **environment variable**; the
loader reads the key from the environment at call time. A committed file containing a literal
key is a defect.

## Shape

```jsonc
{
  "schema_version": "1",
  "stages": {
    "index_audit": {                      // A5 — audit-template spec builder
      "provider": "ollama",               // "ollama" | "openai-compatible"
      "model": "qwen3:32b",
      "endpoint": "http://localhost:11434/v1",
      "temperature": 0.2,                 // optional — stage default if omitted
      "max_tokens": 8000                  // optional — stage default if omitted
    },
    "index_db":   { "provider": "ollama", "model": "qwen3:32b",  "endpoint": "http://localhost:11434/v1" },
    "mapping":    { "provider": "ollama", "model": "qwen3:32b",  "endpoint": "http://localhost:11434/v1" },
    "tier2":      { "provider": "ollama", "model": "qwen3:8b",   "endpoint": "http://localhost:11434/v1" },
    "tier3_agent":{ "provider": "ollama", "model": "qwen3:32b",  "endpoint": "http://localhost:11434/v1" }
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

Example — point `tier2` (one fast LLM call per unresolved cell) at a small,
fast model with **reasoning switched off**. "Off reasoning" is spelled
differently per endpoint, so it rides on the raw `extra_body` passthrough:

```jsonc
{
  "stages": {
    "tier2": {
      "provider": "openai-compatible",
      "model": "fast-mini",
      "endpoint": "https://my-fast-endpoint/v1",
      "api_key_env": "FAST_LLM_API_KEY",
      "extra_body": { "reasoning_effort": "none" }   // or {"enable_thinking": false},
                                                      // or {"chat_template_kwargs": {"enable_thinking": false}}
    }
  }
}
```

### Stage keys (closed set)

| Stage | Consumer |
| --- | --- |
| `index_audit` | `core/indexing/build_audit_spec.py` (A5) |
| `index_db` | `core/indexing/build_database_model.py` |
| `mapping` | `core/mapping/build_audit_database_map.py` + `build_criteria.py` (both mapping LLM calls) |
| `tier2` | `core/running/try_llm.py` |
| `tier3_agent` | projected into the per-run opencode agent config (`core/agent/opencode.json` model substitution) — not called through `core/clients/llm.py` |
| `filters` | **reserved** — the deferred `POST /api/parseFilters` extractor ([api.md](./api.md)); invalid to configure until that endpoint lands |

An unknown stage key in either file is a **startup error** (typos must not silently fall back).

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

- With no `models.json`, behaviour is byte-identical to today (env-trio fallback).
- A stage entry in `models.local.json` overrides only that stage; other stages keep defaults.
- An unknown stage key or a missing required field fails startup with a named error.
- No file ever contains a literal API key; keys resolve via `api_key_env` at call time.
- Startup with a stopped local Ollama and an all-local config brings the endpoint up (or
  fails loudly); startup never triggers a model download.
- Each stage's calls go to its configured `model` + `endpoint` (observable in the run log /
  prompt-version record, doc 7).
