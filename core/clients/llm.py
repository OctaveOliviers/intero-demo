"""Thin async client for the configured LLM endpoint.

Every call names a `stage`; endpoint/model/key resolve through
`core.model_config` (models.yaml / models.local.yaml). There is no global
endpoint fallback.

Two API shapes, by function:

* :func:`respond` / :func:`respond_stream` use the OpenAI **Responses** API
  (`POST {endpoint}/responses`) — the deterministic indexing/mapping builders.
* :func:`respond_typed` uses the **Chat Completions** API
  (`POST {endpoint}/chat/completions`) with `response_format=json_object`,
  because most open-weight models and self-hosted servers (vLLM, llama.cpp,
  Ollama, TGI) support Chat Completions but not the Responses API. It returns a
  reply parsed+validated into a caller-supplied Pydantic model.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import AsyncIterator
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from core import model_config
from core.config import LLM_TIMEOUT

logger = logging.getLogger(__name__)

ModelT = TypeVar("ModelT", bound=BaseModel)

# Transient gateway/upstream failures worth retrying. A local LLM proxy commonly
# returns 502/503/504 when the model is momentarily busy or restarting; the same
# request succeeds moments later, so one failure shouldn't kill an indexing job.
_RETRY_STATUS = {502, 503, 504}
_MAX_ATTEMPTS = 4
_BACKOFF_BASE = 1.5  # seconds: 1.5, 3.0, 6.0 between attempts


def _base_for(api_base: str, path_suffix: str) -> str:
    base = api_base.rstrip("/")
    if base.endswith(path_suffix):
        return base[: -len(path_suffix)]
    return base


def _chat_urls(api_base: str) -> list[str]:
    """Primary OpenAI-compatible chat endpoint plus a /v1 fallback.

    Some local servers expose only /v1/chat/completions even when the base URL
    is configured without /v1.
    """
    base = _base_for(api_base, "/chat/completions")
    urls = [f"{base}/chat/completions"]
    if "v1" not in base.rstrip("/").split("/"):
        urls.append(f"{base}/v1/chat/completions")
    return urls


def _resolve_call(
    stage: str,
) -> tuple[str, str, str, float | None, int | None, dict, str]:
    """The (api_base, model, api_key, cfg_temperature, cfg_max_tokens, extra_body,
    api) for a call. Resolves through models.yaml / models.local.yaml
    (contracts/model-config.md); an unconfigured stage raises
    :class:`model_config.ModelConfigError`. Config temperature / max_tokens, when
    set, OVERRIDE the call-site values — they are the per-deployment tuning knob.
    ``extra_body`` is merged into the request body last (e.g. to switch off a
    model's reasoning). ``api`` is the API shape (``chat`` default, or
    ``responses``)."""
    cfg = model_config.resolve_stage(stage)
    return (
        cfg.endpoint,
        cfg.model,
        cfg.api_key,
        cfg.temperature,
        cfg.max_tokens,
        cfg.extra_body,
        cfg.api,
    )


def _strip_null_body_keys(body: dict) -> dict:
    """Drop request-body keys whose value is ``None``. This lets a stage's
    ``extra_body`` REMOVE a computed default by setting it to ``null`` — the way
    to swap a param for an endpoint-specific name, e.g. OpenAI reasoning models
    that reject ``max_tokens`` and want ``max_completion_tokens`` instead:
    ``"extra_body": {"max_tokens": null, "max_completion_tokens": 10000}``."""
    return {k: v for k, v in body.items() if v is not None}


class LLMConfigError(RuntimeError):
    pass


class LLMRequestError(RuntimeError):
    pass


def _extract_chat_text(payload: dict) -> str:
    """The assistant text from a Chat Completions response
    (``choices[0].message.content``), tolerating the list-of-parts content shape
    some servers return."""
    choices = payload.get("choices") or []
    if not choices:
        return ""
    content = ((choices[0] or {}).get("message") or {}).get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(p.get("text", "") for p in content if isinstance(p, dict))
    return ""


def _extract_text(payload: dict) -> str:
    text = payload.get("output_text")
    if isinstance(text, str) and text.strip():
        return text
    chunks: list[str] = []
    for item in payload.get("output", []) or []:
        for part in (item or {}).get("content", []) or []:
            if part.get("type") == "output_text" and isinstance(part.get("text"), str):
                chunks.append(part["text"])
    return "".join(chunks)


async def _post_with_retry(
    url: str,
    body: dict,
    headers: dict,
    *,
    timeout: float | None = None,
    max_attempts: int | None = None,
) -> httpx.Response:
    """POST with retries on transient gateway errors and network failures.

    Retries on 5xx in ``_RETRY_STATUS`` and on httpx transport/timeout errors,
    with exponential backoff. Non-retryable responses (e.g. 4xx) are returned
    as-is for the caller to surface. The last attempt's result/exception wins.

    ``timeout`` overrides the per-request HTTP timeout (default ``LLM_TIMEOUT``);
    ``max_attempts`` overrides the retry count. An **interactive** caller (e.g.
    Dataset grounding) passes a short timeout and a single attempt so a slow or
    unreachable endpoint fails fast instead of stacking ``LLM_TIMEOUT`` × retries
    into minutes of hang.
    """
    last_exc: Exception | None = None
    attempts = max_attempts if max_attempts is not None else _MAX_ATTEMPTS
    async with httpx.AsyncClient(timeout=timeout or LLM_TIMEOUT) as client:
        for attempt in range(1, attempts + 1):
            try:
                resp = await client.post(url, json=body, headers=headers)
            except (httpx.TransportError, httpx.TimeoutException) as exc:
                last_exc = exc
                if attempt == attempts:
                    raise LLMRequestError(
                        f"LLM request failed after {attempt} attempts: {exc}"
                    ) from exc
            else:
                if resp.status_code not in _RETRY_STATUS or attempt == attempts:
                    return resp
                logger.warning(
                    "LLM endpoint returned %s (attempt %d/%d); retrying",
                    resp.status_code,
                    attempt,
                    attempts,
                )
            await asyncio.sleep(_BACKOFF_BASE**attempt)
    # Unreachable: the loop either returns or raises on the final attempt.
    raise LLMRequestError(f"LLM request failed: {last_exc}")


async def respond(
    instructions: str,
    input_text: str,
    *,
    max_output_tokens: int = 4000,
    temperature: float = 0.2,
    stage: str,
) -> str:
    api_base, model, api_key, cfg_temp, cfg_max, extra_body, _api = _resolve_call(stage)
    if not api_base or not model:
        raise LLMConfigError(f"stage `{stage}` has no endpoint/model configured.")

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": instructions},
            {"role": "user", "content": input_text},
        ],
        "temperature": cfg_temp if cfg_temp is not None else temperature,
        "max_tokens": cfg_max if cfg_max is not None else max_output_tokens,
        **extra_body,
    }
    body = _strip_null_body_keys(body)

    errors: list[tuple[str, int, str]] = []
    resp = None
    url = ""
    for candidate in _chat_urls(api_base):
        url = candidate
        resp = await _post_with_retry(url, body, headers)
        if resp.status_code < 400:
            break
        errors.append((url, resp.status_code, resp.text[:1000]))
        if resp.status_code != 404:
            break
    assert resp is not None
    if resp.status_code >= 400:
        if errors:
            u, status, detail = errors[-1]
            raise LLMRequestError(f"LLM endpoint {u} returned {status}: {detail}")
        detail = resp.text[:1000]
        raise LLMRequestError(
            f"LLM endpoint {url} returned {resp.status_code}: {detail}"
        )
    try:
        payload = resp.json()
    except ValueError as exc:
        raise LLMRequestError(
            f"LLM endpoint returned non-JSON response: {exc}"
        ) from exc

    text = _extract_chat_text(payload)
    if not text.strip():
        raise LLMRequestError("LLM endpoint returned empty assistant text.")
    return text


def _strip_fences(raw: str) -> str:
    """Reduce assistant text to its JSON object: drop ```json fences and any
    prose around the outermost braces. Mirrors the indexing builders' tolerant
    parse so a model that wraps its JSON still validates."""
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text.strip())
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        text = text[start : end + 1]
    return text


async def respond_typed(
    instructions: str,
    input_text: str,
    schema_model: type[ModelT],
    *,
    max_tokens: int = 2000,
    temperature: float = 0.0,
    stage: str,
    timeout: float | None = None,
    max_attempts: int | None = None,
) -> ModelT:
    """Call Chat Completions and return the reply parsed+validated into ``schema_model``.

    Chat Completions (not the Responses API) + ``response_format=json_object`` is
    what open-weight / self-hosted servers (vLLM, llama.cpp, Ollama, TGI) broadly
    support. The model's JSON schema is embedded in the system message (so every
    field description reaches the model) and the reply is ``model_validate_json``'d,
    so the model is the contract however loosely the server honours the schema.
    Raises :class:`LLMRequestError` on any transport/HTTP/empty/validation failure.

    ``timeout`` / ``max_attempts`` bound the HTTP call for an interactive caller
    (Dataset grounding) so a slow/unreachable endpoint fails fast.
    """
    api_base, model, api_key, cfg_temp, cfg_max, extra_body, api = _resolve_call(stage)
    if not api_base or not model:
        raise LLMConfigError(f"stage `{stage}` has no endpoint/model configured.")

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    schema = json.dumps(schema_model.model_json_schema(), separators=(",", ":"))
    system = (
        f"{instructions}\n\n"
        "Reply with ONE JSON object and nothing else — no prose, no code fences. "
        f"It MUST conform to this JSON schema:\n{schema}"
    )

    # Responses API (e.g. gpt-5 nano): a different endpoint + body shape. It takes
    # `max_output_tokens` (the chat route's `max_tokens` is rejected by these
    # models) and returns text in `output[]`; we ask for JSON in the instructions
    # and validate the reply, same as the chat path.
    if api == "responses":
        return await _respond_typed_responses(
            api_base,
            model,
            headers,
            system,
            input_text,
            schema_model,
            temperature=cfg_temp if cfg_temp is not None else temperature,
            max_output_tokens=cfg_max if cfg_max is not None else max_tokens,
            extra_body=extra_body,
            timeout=timeout,
            max_attempts=max_attempts,
        )

    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": input_text},
        ],
        "temperature": cfg_temp if cfg_temp is not None else temperature,
        "max_tokens": cfg_max if cfg_max is not None else max_tokens,
        "response_format": {"type": "json_object"},
        **extra_body,
    }
    body = _strip_null_body_keys(body)

    errors: list[tuple[str, int, str]] = []
    resp = None
    url = ""
    for candidate in _chat_urls(api_base):
        url = candidate
        resp = await _post_with_retry(
            url, body, headers, timeout=timeout, max_attempts=max_attempts
        )
        if resp.status_code < 400:
            break
        errors.append((url, resp.status_code, resp.text[:1000]))
        if resp.status_code != 404:
            break
    assert resp is not None
    if resp.status_code >= 400:
        if errors:
            u, status, detail = errors[-1]
            raise LLMRequestError(f"LLM endpoint {u} returned {status}: {detail}")
        raise LLMRequestError(
            f"LLM endpoint {url} returned {resp.status_code}: {resp.text[:1000]}"
        )
    try:
        payload = resp.json()
    except ValueError as exc:
        raise LLMRequestError(
            f"LLM endpoint returned non-JSON response: {exc}"
        ) from exc

    text = _extract_chat_text(payload)
    if not text.strip():
        raise LLMRequestError("LLM endpoint returned empty assistant text.")
    try:
        return schema_model.model_validate_json(_strip_fences(text))
    except ValidationError as exc:
        raise LLMRequestError(
            f"LLM reply did not match {schema_model.__name__}: {exc}"
        ) from exc


async def _respond_typed_responses(
    api_base: str,
    model: str,
    headers: dict,
    system: str,
    input_text: str,
    schema_model: type[ModelT],
    *,
    temperature: float | None,
    max_output_tokens: int | None,
    extra_body: dict,
    timeout: float | None,
    max_attempts: int | None,
) -> ModelT:
    """The Responses-API (`/responses`) backing for :func:`respond_typed`.

    Same contract — JSON requested in the instructions, the reply validated into
    ``schema_model`` — but the Responses request shape (`instructions` + `input`,
    `max_output_tokens`) and the Responses text extractor, so a model that only
    speaks `/responses` (and rejects the chat route's `max_tokens`) works."""
    url = f"{_base_for(api_base, '/responses')}/responses"
    body = {
        "model": model,
        "instructions": system,
        "input": input_text,
        "temperature": temperature,
        "max_output_tokens": max_output_tokens,
        **extra_body,
    }
    body = _strip_null_body_keys(body)
    resp = await _post_with_retry(
        url, body, headers, timeout=timeout, max_attempts=max_attempts
    )
    if resp.status_code >= 400:
        raise LLMRequestError(
            f"LLM endpoint {url} returned {resp.status_code}: {resp.text[:1000]}"
        )
    try:
        payload = resp.json()
    except ValueError as exc:
        raise LLMRequestError(
            f"LLM endpoint returned non-JSON response: {exc}"
        ) from exc
    text = _extract_text(payload)
    if not text.strip():
        raise LLMRequestError("LLM endpoint returned empty assistant text.")
    try:
        return schema_model.model_validate_json(_strip_fences(text))
    except ValidationError as exc:
        raise LLMRequestError(
            f"LLM reply did not match {schema_model.__name__}: {exc}"
        ) from exc


async def respond_stream(
    instructions: str,
    input_text: str,
    *,
    max_output_tokens: int = 4000,
    temperature: float = 0.2,
    stage: str,
) -> AsyncIterator[str]:
    """Stream assistant text deltas from the Responses API (`stream: true`).

    Yields plain text chunks as they arrive. Mirrors :func:`respond` but consumes
    the SSE event stream and surfaces only the incremental text. Network/gateway
    failures raise :class:`LLMRequestError`; unlike :func:`respond` it does not
    retry, since a partial stream may already have reached the caller.
    """
    api_base, model, api_key, _cfg_temp, _cfg_max, _extra, _api = _resolve_call(stage)
    if not api_base or not model:
        raise LLMConfigError(f"stage `{stage}` has no endpoint/model configured.")

    url = f"{_base_for(api_base, '/responses')}/responses"
    headers = {"Content-Type": "application/json", "Accept": "text/event-stream"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    body = {
        "model": model,
        "instructions": instructions,
        "input": input_text,
        "temperature": temperature,
        "max_output_tokens": max_output_tokens,
        "stream": True,
    }

    try:
        async with httpx.AsyncClient(timeout=LLM_TIMEOUT) as client:
            async with client.stream("POST", url, json=body, headers=headers) as resp:
                if resp.status_code >= 400:
                    detail = (await resp.aread()).decode("utf-8", "replace")[:1000]
                    raise LLMRequestError(
                        f"LLM endpoint returned {resp.status_code}: {detail}"
                    )
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[len("data:") :].strip()
                    if not data or data == "[DONE]":
                        continue
                    try:
                        event = json.loads(data)
                    except ValueError:
                        continue
                    # OpenAI Responses API streams text as `response.output_text.delta`.
                    if event.get("type") == "response.output_text.delta":
                        delta = event.get("delta")
                        if isinstance(delta, str) and delta:
                            yield delta
                    elif event.get("type") == "response.error":
                        err = event.get("error") or {}
                        raise LLMRequestError(
                            f"LLM stream error: {err.get('message', err)}"
                        )
    except (httpx.TransportError, httpx.TimeoutException) as exc:
        raise LLMRequestError(f"LLM request failed: {exc}") from exc
