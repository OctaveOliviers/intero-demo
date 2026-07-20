"""contracts/model-config.md — loader, precedence, and readiness.

Drives core/model_config.py against temp config roots; HTTP and subprocess are
mocked (no network, no real Ollama). Every stage must resolve to a file entry:
a stage with no entry is a hard ModelConfigError (no env fallback).
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
    base = {
        "provider": "ollama",
        "model": "m1",
        "endpoint": "http://localhost:11434/v1",
    }
    base.update(overrides)
    return base


class _Root:
    """Context manager: a temp repo root with optional models(.local).yaml."""

    def __init__(self, models=None, local=None):
        self.models = models
        self.local = local

    def __enter__(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        # JSON is a YAML subset, so dumping the fixtures as JSON keeps the
        # fixtures simple AND pins that JSON-style content still loads.
        if self.models is not None:
            (root / "models.yaml").write_text(json.dumps({"stages": self.models}))
        if self.local is not None:
            (root / "models.local.yaml").write_text(json.dumps({"stages": self.local}))
        return root

    def __exit__(self, *exc):
        self._tmp.cleanup()


class LoadMergeTest(unittest.TestCase):
    def test_local_overrides_one_stage_others_fall_through(self):
        with _Root(
            models={
                "table_agent": _entry(model="default-model"),
                "mapping": _entry(model="map-model"),
            },
            local={
                "table_agent": _entry(
                    provider="openai-compatible",
                    model="cloud",
                    endpoint="https://api.x/v1",
                )
            },
        ) as root:
            merged = model_config.load_merged(root)
            self.assertEqual(merged["table_agent"]["model"], "cloud")
            self.assertEqual(merged["table_agent"]["_source"], "models.local.yaml")
            self.assertEqual(merged["mapping"]["model"], "map-model")
            self.assertEqual(merged["mapping"]["_source"], "models.yaml")

    def test_no_config_files_is_empty(self):
        with _Root() as root:
            self.assertEqual(model_config.load_merged(root), {})

    def test_unknown_stage_errors_naming_file_and_stage(self):
        with _Root(models={"tier2": _entry()}) as root:
            with self.assertRaises(ModelConfigError) as ctx:
                model_config.load_merged(root)
            self.assertIn("models.yaml", str(ctx.exception))
            self.assertIn("tier2", str(ctx.exception))

    def test_filters_stage_is_configurable(self):
        # `filters` is the Dataset grounding stage — a real, configurable stage now
        # (it subsumes the former deferred parseFilters extractor), not reserved.
        with _Root(models={"filters": _entry()}) as root:
            merged = model_config.load_merged(root)
            self.assertIn("filters", merged)

    def test_api_defaults_to_chat_and_accepts_responses(self):
        with _Root(models={"mapping": _entry()}) as root:
            self.assertEqual(model_config.resolve_stage("mapping", root).api, "chat")
        with _Root(models={"mapping": _entry(api="responses")}) as root:
            self.assertEqual(
                model_config.resolve_stage("mapping", root).api, "responses"
            )

    def test_unknown_api_value_is_rejected(self):
        with _Root(models={"mapping": _entry(api="grpc")}) as root:
            with self.assertRaises(ModelConfigError) as ctx:
                model_config.load_merged(root)
            self.assertIn("api", str(ctx.exception))

    def test_missing_required_field_errors(self):
        bad = {"provider": "ollama", "model": "m1"}  # no endpoint
        with _Root(models={"mapping": bad}) as root:
            with self.assertRaises(ModelConfigError) as ctx:
                model_config.load_merged(root)
            self.assertIn("endpoint", str(ctx.exception))

    def test_literal_secret_is_rejected(self):
        with _Root(models={"mapping": _entry(api_key_env="sk-abc123")}) as root:
            with self.assertRaises(ModelConfigError):
                model_config.load_merged(root)
        with _Root(models={"mapping": {**_entry(), "api_key": "sk-abc123"}}) as root:
            with self.assertRaises(ModelConfigError):
                model_config.load_merged(root)

    def test_invalid_yaml_errors_naming_file(self):
        with _Root() as root:
            (root / "models.yaml").write_text("{not yaml")
            with self.assertRaises(ModelConfigError) as ctx:
                model_config.load_merged(root)
            self.assertIn("models.yaml", str(ctx.exception))

    def test_non_object_extra_body_is_rejected(self):
        with _Root(models={"mapping": _entry(extra_body="reasoning=off")}) as root:
            with self.assertRaises(ModelConfigError) as ctx:
                model_config.load_merged(root)
            self.assertIn("extra_body", str(ctx.exception))


class ResolveStageTest(unittest.TestCase):
    def test_absent_stage_raises_no_env_fallback(self):
        # A stage with no merged entry is a hard error — there is no global
        # endpoint fallback; every stage must be configured.
        with _Root(models={"filters": _entry()}) as root:
            with self.assertRaises(ModelConfigError) as ctx:
                model_config.resolve_stage("mapping", root)
        self.assertIn("mapping", str(ctx.exception))

    def test_configured_stage_resolves_key_from_named_env_var(self):
        entry = _entry(
            provider="openai-compatible",
            endpoint="https://api.x/v1",
            api_key_env="X_KEY",
            temperature=0.1,
            max_tokens=512,
        )
        with (
            _Root(models={"mapping": entry}) as root,
            patch.dict("os.environ", {"X_KEY": "secret"}),
        ):
            cfg = model_config.resolve_stage("mapping", root)
        self.assertEqual(cfg.api_key, "secret")
        self.assertEqual(cfg.temperature, 0.1)
        self.assertEqual(cfg.max_tokens, 512)
        self.assertEqual(cfg.source, "models.yaml")

    def test_extra_body_resolves_and_defaults_empty(self):
        body = {"reasoning_effort": "none", "enable_thinking": False}
        with _Root(models={"mapping": _entry(extra_body=body)}) as root:
            self.assertEqual(
                model_config.resolve_stage("mapping", root).extra_body, body
            )
        # Absent → empty dict (the merge is then a no-op).
        with _Root(models={"mapping": _entry()}) as root:
            self.assertEqual(model_config.resolve_stage("mapping", root).extra_body, {})

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
        with _Root(models={"table_agent": _entry(), "mapping": _entry()}) as root:
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

        with _Root(models={"mapping": _entry()}) as root:
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
        with _Root(models={"mapping": entry}) as root:
            with (
                patch.object(httpx, "get", side_effect=httpx.ConnectError("down")),
                patch.object(model_config.subprocess, "Popen") as popen,
            ):
                warnings = model_config.ensure_endpoints_ready(root)
        self.assertEqual(len(warnings), 1)
        self.assertIn("not reachable", warnings[0])
        popen.assert_not_called()


class AgentEnvTest(unittest.TestCase):
    def test_projection_maps_each_agent_stage_onto_its_env_keys(self):
        with _Root(
            models={
                "thread_agent": _entry(
                    model="thread-model", endpoint="http://localhost:11434/v1"
                ),
                "table_agent": _entry(
                    model="table-model", endpoint="http://localhost:11434/v1"
                ),
            }
        ) as root:
            with patch.object(model_config, "_ROOT", root):
                env = model_config.agent_env()
        self.assertEqual(env["LLM_THREAD_MODEL"], "thread-model")
        self.assertEqual(env["LLM_THREAD_API_BASE"], "http://localhost:11434/v1")
        self.assertEqual(env["LLM_TABLE_MODEL"], "table-model")
        self.assertEqual(env["LLM_TABLE_API_BASE"], "http://localhost:11434/v1")

    def test_an_unconfigured_stage_projects_nothing_for_its_keys(self):
        entry = _entry(model="table-model", endpoint="http://localhost:11434/v1")
        with _Root(models={"table_agent": entry}) as root:
            with patch.object(model_config, "_ROOT", root):
                env = model_config.agent_env()
        self.assertEqual(env["LLM_TABLE_MODEL"], "table-model")
        self.assertNotIn("LLM_THREAD_MODEL", env)

    def test_empty_without_any_agent_entry(self):
        with _Root(models={"mapping": _entry()}) as root:
            with patch.object(model_config, "_ROOT", root):
                self.assertEqual(model_config.agent_env(), {})


if __name__ == "__main__":
    unittest.main()
