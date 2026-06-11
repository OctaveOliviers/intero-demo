"""contracts/model-config.md — loader, precedence, fallback, and readiness.

Drives core/model_config.py against temp config roots; HTTP and subprocess are
mocked (no network, no real Ollama). The env-trio fallback acceptance: a stage
with no entry resolves to exactly LLM_API_BASE/LLM_MODEL/LLM_API_KEY.
"""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

from core import model_config
from core.model_config import ModelConfigError


def _entry(**overrides):
    base = {"provider": "ollama", "model": "m1", "endpoint": "http://localhost:11434/v1"}
    base.update(overrides)
    return base


class _Root:
    """Context manager: a temp repo root with optional models(.local).json."""

    def __init__(self, models=None, local=None):
        self.models = models
        self.local = local

    def __enter__(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        if self.models is not None:
            (root / "models.json").write_text(json.dumps({"stages": self.models}))
        if self.local is not None:
            (root / "models.local.json").write_text(json.dumps({"stages": self.local}))
        return root

    def __exit__(self, *exc):
        self._tmp.cleanup()


class LoadMergeTest(unittest.TestCase):
    def test_local_overrides_one_stage_others_fall_through(self):
        with _Root(
            models={"tier2": _entry(model="default-model"), "mapping": _entry(model="map-model")},
            local={"tier2": _entry(provider="openai-compatible", model="cloud", endpoint="https://api.x/v1")},
        ) as root:
            merged = model_config.load_merged(root)
            self.assertEqual(merged["tier2"]["model"], "cloud")
            self.assertEqual(merged["tier2"]["_source"], "models.local.json")
            self.assertEqual(merged["mapping"]["model"], "map-model")
            self.assertEqual(merged["mapping"]["_source"], "models.json")

    def test_no_config_files_is_empty(self):
        with _Root() as root:
            self.assertEqual(model_config.load_merged(root), {})

    def test_unknown_stage_errors_naming_file_and_stage(self):
        with _Root(models={"tier9": _entry()}) as root:
            with self.assertRaises(ModelConfigError) as ctx:
                model_config.load_merged(root)
            self.assertIn("models.json", str(ctx.exception))
            self.assertIn("tier9", str(ctx.exception))

    def test_reserved_filters_stage_is_rejected(self):
        with _Root(models={"filters": _entry()}) as root:
            with self.assertRaises(ModelConfigError) as ctx:
                model_config.load_merged(root)
            self.assertIn("reserved", str(ctx.exception))

    def test_missing_required_field_errors(self):
        bad = {"provider": "ollama", "model": "m1"}  # no endpoint
        with _Root(models={"tier2": bad}) as root:
            with self.assertRaises(ModelConfigError) as ctx:
                model_config.load_merged(root)
            self.assertIn("endpoint", str(ctx.exception))

    def test_literal_secret_is_rejected(self):
        with _Root(models={"tier2": _entry(api_key_env="sk-abc123")}) as root:
            with self.assertRaises(ModelConfigError):
                model_config.load_merged(root)
        with _Root(models={"tier2": {**_entry(), "api_key": "sk-abc123"}}) as root:
            with self.assertRaises(ModelConfigError):
                model_config.load_merged(root)

    def test_invalid_json_errors_naming_file(self):
        with _Root() as root:
            (root / "models.json").write_text("{not json")
            with self.assertRaises(ModelConfigError) as ctx:
                model_config.load_merged(root)
            self.assertIn("models.json", str(ctx.exception))


class ResolveStageTest(unittest.TestCase):
    def test_env_trio_fallback_when_stage_absent(self):
        env = {"LLM_API_BASE": "http://env:1/v1", "LLM_MODEL": "env-model", "LLM_API_KEY": "k"}
        with _Root(models={"mapping": _entry()}) as root, patch.dict("os.environ", env):
            cfg = model_config.resolve_stage("tier2", root)
        self.assertEqual(cfg.source, "env")
        self.assertEqual(cfg.endpoint, "http://env:1/v1")
        self.assertEqual(cfg.model, "env-model")
        self.assertEqual(cfg.api_key, "k")
        self.assertIsNone(cfg.temperature)
        self.assertIsNone(cfg.max_tokens)

    def test_configured_stage_resolves_key_from_named_env_var(self):
        entry = _entry(
            provider="openai-compatible",
            endpoint="https://api.x/v1",
            api_key_env="X_KEY",
            temperature=0.1,
            max_tokens=512,
        )
        with _Root(models={"tier2": entry}) as root, patch.dict("os.environ", {"X_KEY": "secret"}):
            cfg = model_config.resolve_stage("tier2", root)
        self.assertEqual(cfg.api_key, "secret")
        self.assertEqual(cfg.temperature, 0.1)
        self.assertEqual(cfg.max_tokens, 512)
        self.assertEqual(cfg.source, "models.json")

    def test_unknown_stage_name_errors(self):
        with self.assertRaises(ModelConfigError):
            model_config.resolve_stage("nope")


class ReadinessTest(unittest.TestCase):
    def test_no_config_is_a_noop(self):
        with _Root() as root:
            with patch.object(httpx, "get") as get:
                self.assertEqual(model_config.ensure_endpoints_ready(root), [])
                get.assert_not_called()

    def test_alive_endpoint_is_checked_once_per_distinct_endpoint(self):
        with _Root(models={"tier2": _entry(), "mapping": _entry()}) as root:
            with patch.object(httpx, "get") as get:
                warnings = model_config.ensure_endpoints_ready(root)
        self.assertEqual(warnings, [])
        self.assertEqual(get.call_count, 1)
        self.assertIn("/api/tags", get.call_args[0][0])  # ollama health, /v1 stripped

    def test_down_local_ollama_is_spawned_and_rechecked(self):
        calls = {"n": 0}

        def fake_get(url, timeout):
            calls["n"] += 1
            if calls["n"] == 1:
                raise httpx.ConnectError("down")
            return httpx.Response(200, request=httpx.Request("GET", url))

        with _Root(models={"tier2": _entry()}) as root:
            with (
                patch.object(httpx, "get", side_effect=fake_get),
                patch.object(model_config.subprocess, "Popen") as popen,
                patch.object(model_config.time, "sleep"),
            ):
                warnings = model_config.ensure_endpoints_ready(root)
        self.assertEqual(warnings, [])
        popen.assert_called_once()
        self.assertEqual(popen.call_args[0][0], ["ollama", "serve"])
        model_config._spawned.clear()

    def test_down_remote_endpoint_warns_and_never_spawns(self):
        entry = _entry(provider="openai-compatible", endpoint="https://api.x/v1")
        with _Root(models={"tier2": entry}) as root:
            with (
                patch.object(httpx, "get", side_effect=httpx.ConnectError("down")),
                patch.object(model_config.subprocess, "Popen") as popen,
            ):
                warnings = model_config.ensure_endpoints_ready(root)
        self.assertEqual(len(warnings), 1)
        self.assertIn("not reachable", warnings[0])
        popen.assert_not_called()


class Tier3EnvTest(unittest.TestCase):
    def test_projection_maps_stage_onto_llm_env_keys(self):
        entry = _entry(model="agent-model", endpoint="http://localhost:11434/v1")
        with _Root(models={"tier3_agent": entry}) as root:
            with patch.object(model_config, "_ROOT", root):
                env = model_config.tier3_agent_env()
        self.assertEqual(env["LLM_MODEL"], "agent-model")
        self.assertEqual(env["LLM_API_BASE"], "http://localhost:11434/v1")

    def test_empty_without_a_tier3_entry(self):
        with _Root(models={"tier2": _entry()}) as root:
            with patch.object(model_config, "_ROOT", root):
                self.assertEqual(model_config.tier3_agent_env(), {})


if __name__ == "__main__":
    unittest.main()
