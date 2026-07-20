"""The per-stage `extra_body` (model-config.md) is merged into the chat/completions
request body — the knob that switches a model's reasoning off on an
OpenAI-compatible endpoint. HTTP is mocked; we assert what hits the wire.

Run: ``python3 -m core.test.llm_extra_body_test``
"""

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from core import model_config
from core.clients import llm


class _Resp:
    status_code = 200

    def json(self):
        return {"choices": [{"message": {"content": "OK"}}]}


def _stage(extra_body):
    return model_config.StageConfig(
        stage="mapping",
        provider="openai-compatible",
        model="fast-mini",
        endpoint="https://fast/v1",
        api_key="k",
        extra_body=extra_body,
        source="models.local.yaml",
    )


class ExtraBodyMergeTest(unittest.TestCase):
    def _capture_body(self, extra_body):
        post = AsyncMock(return_value=_Resp())
        with (
            patch.object(
                model_config, "resolve_stage", return_value=_stage(extra_body)
            ),
            patch.object(llm, "_post_with_retry", post),
        ):
            asyncio.run(llm.respond("sys", "user", stage="mapping"))
        return post.await_args.args[1]  # (url, body, headers)

    def test_extra_body_keys_reach_the_request(self):
        body = self._capture_body(
            {"reasoning_effort": "none", "enable_thinking": False}
        )
        self.assertEqual(body["reasoning_effort"], "none")
        self.assertFalse(body["enable_thinking"])
        # The computed fields are still present.
        self.assertEqual(body["model"], "fast-mini")
        self.assertIn("messages", body)

    def test_extra_body_wins_over_computed_keys(self):
        # A raw passthrough overrides the computed body (documented escape-hatch).
        body = self._capture_body({"temperature": 1.5})
        self.assertEqual(body["temperature"], 1.5)

    def test_empty_extra_body_is_a_noop(self):
        body = self._capture_body({})
        self.assertNotIn("reasoning_effort", body)
        self.assertEqual(body["model"], "fast-mini")

    def test_null_extra_body_value_drops_the_key(self):
        # OpenAI reasoning models reject `max_tokens` (want `max_completion_tokens`)
        # and reject a non-default `temperature` — extra_body nulls drop both.
        body = self._capture_body(
            {
                "max_tokens": None,
                "max_completion_tokens": 10000,
                "temperature": None,
            }
        )
        self.assertNotIn("max_tokens", body)
        self.assertNotIn("temperature", body)
        self.assertEqual(body["max_completion_tokens"], 10000)


if __name__ == "__main__":
    unittest.main(verbosity=2)
