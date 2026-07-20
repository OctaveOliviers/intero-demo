"""Per-stage LLM model configuration (contracts/model-config.md).

Two files at the repo root:

* ``models.yaml`` (committed) — working defaults for every stage.
* ``models.local.yaml`` (gitignored) — per-deployment override, merged **per
  stage key** (a stage present locally replaces that stage's entry entirely;
  absent stages fall through to the default).

Every stage MUST resolve to an entry after the merge — a stage with no entry is
a hard :class:`ModelConfigError`, so all LLM calls go through this per-stage
config (there is no global single-endpoint fallback).

Secrets never live in either file: ``api_key_env`` names an environment
variable read at call time. Startup never downloads models — it only makes
sure each configured endpoint is listening (spawning a local Ollama server if
needed) and stops on shutdown only what it spawned itself.
"""

from __future__ import annotations

import logging
import os
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path

import httpx
import yaml

logger = logging.getLogger(__name__)

# Repo root: core/model_config.py -> core/ -> root.
_ROOT = Path(__file__).resolve().parents[1]

# The closed stage set (model-config.md §Stage keys). `filters` is the Dataset
# grounding stage — turning a plain-language slice into grounded filter criteria
# (inclusion-criteria-setup.md). It subsumes the former deferred `parseFilters`
# extractor, so it is now a real, configurable stage rather than reserved.
# `thread_agent` is the conversational thread agent (also the /api/generate
# data-describe brain); `table_agent` is the table-population agent.
STAGES = (
    "index_audit",
    "index_db",
    "mapping",
    "thread_agent",
    "table_agent",
    "filters",
)
_RESERVED_STAGES = ()

_REQUIRED_FIELDS = ("provider", "model", "endpoint")
_PROVIDERS = ("ollama", "openai-compatible")
_APIS = ("chat", "responses")
_ALLOWED_FIELDS = {
    "provider",
    "model",
    "endpoint",
    "api_key_env",
    "temperature",
    "max_tokens",
    "api",
    "extra_body",
}

# Ollama servers this module spawned itself (and may therefore stop).
_spawned: list[subprocess.Popen] = []


class ModelConfigError(RuntimeError):
    """Malformed model configuration — names the file and stage."""


@dataclass(frozen=True)
class StageConfig:
    stage: str
    provider: str
    model: str
    endpoint: str
    api_key: str
    temperature: float | None = None
    max_tokens: int | None = None
    # Which OpenAI-compatible API shape this endpoint speaks: ``chat`` (the default,
    # ``/chat/completions``) or ``responses`` (``/responses`` — what the newer
    # reasoning models, e.g. gpt-5 nano, expose; they reject ``max_tokens`` on the
    # chat route and take ``max_output_tokens`` on the Responses route instead).
    api: str = "chat"
    # Raw passthrough merged into the chat/completions request body — the escape
    # hatch for provider-specific params the closed config set does not name, most
    # notably disabling a model's reasoning/thinking (the spelling varies per
    # endpoint: e.g. `{"reasoning_effort": "none"}`, `{"enable_thinking": false}`,
    # `{"chat_template_kwargs": {"enable_thinking": false}}`). Merged LAST, so a key
    # here wins over the computed body. Empty dict when unset.
    extra_body: dict = field(default_factory=dict)
    # "models.yaml" / "models.local.yaml" — for logs and the run record.
    source: str = "models.yaml"


def _read_config_file(path: Path) -> dict:
    if not path.is_file():
        return {}
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise ModelConfigError(f"{path.name}: not valid YAML ({exc})") from exc
    if not isinstance(raw, dict):
        raise ModelConfigError(f"{path.name}: top level must be a YAML mapping")
    stages = raw.get("stages")
    if stages is None:
        return {}
    if not isinstance(stages, dict):
        raise ModelConfigError(f"{path.name}: `stages` must be an object")
    return stages


def _looks_like_literal_secret(value: str) -> bool:
    """An `api_key_env` VALUE must be an env-var NAME, not a key. Heuristic:
    real keys are long, mixed-case/dashed (sk-..., key-...), env names are
    SCREAMING_SNAKE."""
    if value.startswith(("sk-", "key-", "Bearer ")):
        return True
    return not value.replace("_", "").isalnum() or value != value.upper()


def _validate_entry(filename: str, stage: str, entry: object) -> dict:
    if stage in _RESERVED_STAGES:
        raise ModelConfigError(
            f"{filename}: stage `{stage}` is reserved (deferred parseFilters) and may not be configured yet"
        )
    if stage not in STAGES:
        raise ModelConfigError(
            f"{filename}: unknown stage `{stage}` (known: {', '.join(STAGES)})"
        )
    if not isinstance(entry, dict):
        raise ModelConfigError(f"{filename}: stage `{stage}` must be an object")
    if "api_key" in entry:
        raise ModelConfigError(
            f"{filename}: stage `{stage}` carries a literal `api_key` — use `api_key_env` (an env-var NAME)"
        )
    unknown = set(entry) - _ALLOWED_FIELDS
    if unknown:
        raise ModelConfigError(
            f"{filename}: stage `{stage}` has unknown field(s): {', '.join(sorted(unknown))}"
        )
    for required_field in _REQUIRED_FIELDS:
        value = entry.get(required_field)
        if not isinstance(value, str) or not value.strip():
            raise ModelConfigError(
                f"{filename}: stage `{stage}` is missing required `{required_field}`"
            )
    if entry["provider"] not in _PROVIDERS:
        raise ModelConfigError(
            f"{filename}: stage `{stage}` provider must be one of {', '.join(_PROVIDERS)}"
        )
    if "api" in entry and entry["api"] not in _APIS:
        raise ModelConfigError(
            f"{filename}: stage `{stage}` `api` must be one of {', '.join(_APIS)}"
        )
    api_key_env = entry.get("api_key_env")
    if api_key_env is not None:
        if not isinstance(api_key_env, str) or not api_key_env.strip():
            raise ModelConfigError(
                f"{filename}: stage `{stage}` `api_key_env` must be a non-empty string"
            )
        if _looks_like_literal_secret(api_key_env):
            raise ModelConfigError(
                f"{filename}: stage `{stage}` `api_key_env` looks like a literal key — it must NAME an env var"
            )
    extra_body = entry.get("extra_body")
    if extra_body is not None and not isinstance(extra_body, dict):
        raise ModelConfigError(
            f"{filename}: stage `{stage}` `extra_body` must be an object (merged into the request body)"
        )
    return entry


def load_merged(root: Path | None = None) -> dict[str, dict]:
    """The merged per-stage config: models.local.yaml overrides models.yaml
    PER STAGE KEY. Raises :class:`ModelConfigError` on any malformed entry."""
    base = root or _ROOT
    merged: dict[str, dict] = {}
    for filename in ("models.yaml", "models.local.yaml"):
        for stage, entry in _read_config_file(base / filename).items():
            merged[stage] = {
                **_validate_entry(filename, stage, entry),
                "_source": filename,
            }
    return merged


def resolve_stage(stage: str, root: Path | None = None) -> StageConfig:
    """The effective config for one stage: the merged ``models.yaml`` /
    ``models.local.yaml`` entry. A stage with no entry is a hard error — there
    is no global single-endpoint fallback."""
    if stage not in STAGES:
        raise ModelConfigError(f"unknown stage `{stage}` (known: {', '.join(STAGES)})")
    entry = load_merged(root).get(stage)
    if entry is None:
        raise ModelConfigError(
            f"stage `{stage}` has no entry in models.yaml / models.local.yaml — "
            "every stage must be configured (no env fallback)"
        )
    api_key_env = entry.get("api_key_env")
    temperature = entry.get("temperature")
    max_tokens = entry.get("max_tokens")
    extra_body = entry.get("extra_body")
    return StageConfig(
        stage=stage,
        provider=entry["provider"],
        model=entry["model"],
        endpoint=entry["endpoint"],
        api_key=os.environ.get(api_key_env, "") if api_key_env else "",
        temperature=float(temperature) if temperature is not None else None,
        max_tokens=int(max_tokens) if max_tokens is not None else None,
        api=str(entry.get("api") or "chat"),
        extra_body=dict(extra_body) if isinstance(extra_body, dict) else {},
        source=entry["_source"],
    )


def _is_local(endpoint: str) -> bool:
    return "localhost" in endpoint or "127.0.0.1" in endpoint


def _health_url(provider: str, endpoint: str) -> str:
    base = endpoint.rstrip("/")
    if provider == "ollama":
        # Ollama health lives at the daemon root, not under /v1.
        if base.endswith("/v1"):
            base = base[: -len("/v1")]
        return f"{base}/api/tags"
    return f"{base}/models"


def _endpoint_alive(provider: str, endpoint: str) -> bool:
    try:
        # ANY HTTP response (even 404/401) proves something is listening.
        httpx.get(_health_url(provider, endpoint), timeout=2.0)
        return True
    except httpx.HTTPError:
        return False


def ensure_endpoints_ready(root: Path | None = None) -> list[str]:
    """Startup endpoint readiness (model-config.md §Startup behaviour).

    Health-checks each distinct configured endpoint; spawns a local Ollama
    server when its endpoint is down; NEVER pulls or downloads a model. A
    malformed config raises :class:`ModelConfigError` (hard startup failure);
    an unreachable endpoint is returned as a loud warning instead — the
    per-stage error then surfaces at first use, so a dev box without Ollama
    still starts (the contract's missing-model semantics applied to the
    endpoint, flagged for review in the T9 PR).
    """
    merged = load_merged(root)
    warnings: list[str] = []
    seen: set[tuple[str, str]] = set()
    for stage, entry in merged.items():
        key = (entry["provider"], entry["endpoint"])
        if key in seen:
            continue
        seen.add(key)
        provider, endpoint = key
        if _endpoint_alive(provider, endpoint):
            continue
        if provider == "ollama" and _is_local(endpoint):
            logger.info(
                "model-config: local Ollama at %s is down — starting `ollama serve`",
                endpoint,
            )
            try:
                proc = subprocess.Popen(
                    ["ollama", "serve"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True,
                )
            except OSError as exc:
                warnings.append(
                    f"stage `{stage}`: could not start `ollama serve` for {endpoint}: {exc}"
                )
                continue
            _spawned.append(proc)
            for _ in range(10):
                time.sleep(0.5)
                if _endpoint_alive(provider, endpoint):
                    break
            else:
                warnings.append(
                    f"stage `{stage}`: endpoint {endpoint} still down after starting Ollama"
                )
            continue
        warnings.append(f"stage `{stage}`: endpoint {endpoint} is not reachable")
    for message in warnings:
        logger.error("model-config: %s", message)
    return warnings


def shutdown_spawned() -> None:
    """Stop ONLY the Ollama server(s) this module spawned — never a
    pre-existing user daemon."""
    while _spawned:
        proc = _spawned.pop()
        if proc.poll() is None:
            proc.terminate()


def agent_env() -> dict[str, str]:
    """The env-var projection for the shared opencode server process: the
    ``thread_agent`` and ``table_agent`` stages mapped onto the
    ``{env:LLM_THREAD_*}`` / ``{env:LLM_TABLE_*}`` keys the per-worktree
    opencode configs substitute (a thread worktree's config names the THREAD
    keys, a table run's the TABLE keys — that per-directory config is what
    gives each agent its own model on the one server). A stage with no config
    entry projects nothing for its keys (the child then inherits the parent
    env unchanged)."""
    merged = load_merged()
    env: dict[str, str] = {}
    for stage, prefix in (("thread_agent", "LLM_THREAD"), ("table_agent", "LLM_TABLE")):
        if merged.get(stage) is None:
            continue
        cfg = resolve_stage(stage)
        env[f"{prefix}_API_BASE"] = cfg.endpoint
        env[f"{prefix}_MODEL"] = cfg.model
        env[f"{prefix}_API_KEY"] = cfg.api_key
    return env
