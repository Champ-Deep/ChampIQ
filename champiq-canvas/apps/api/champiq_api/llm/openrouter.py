"""OpenRouter LLM provider.

OpenRouter is an OpenAI-compatible proxy that exposes many underlying models
through a single API key. We use the chat-completions endpoint over HTTP
(httpx) — no SDK required.
"""
from __future__ import annotations

from typing import Sequence

import httpx

from .base import LLMMessage, LLMProvider, LLMResponse


class OpenRouterProvider(LLMProvider):
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = "https://openrouter.ai/api/v1",
        default_model: str = "anthropic/claude-sonnet-4",
        referrer: str = "https://champiq.local",
        app_title: str = "ChampIQ Canvas",
        timeout: float = 60.0,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._default_model = default_model
        self._referrer = referrer
        self._app_title = app_title
        self._timeout = timeout

    async def complete(
        self,
        messages: Sequence[LLMMessage],
        *,
        system: str | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> LLMResponse:
        if not self._api_key:
            raise RuntimeError("OPENROUTER_API_KEY is not configured")

        payload_messages: list[dict[str, str]] = []
        if system:
            payload_messages.append({"role": "system", "content": system})
        for m in messages:
            payload_messages.append({"role": m.role, "content": m.content})

        body = {
            "model": model or self._default_model,
            "messages": payload_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            # OpenRouter asks for these for rate-limit/analytics tiers.
            "HTTP-Referer": self._referrer,
            "X-Title": self._app_title,
        }

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._base_url}/chat/completions",
                json=body,
                headers=headers,
            )
        if resp.status_code >= 400:
            raise RuntimeError(
                f"OpenRouter {resp.status_code}: {resp.text[:500]}"
            )
        data = resp.json()

        text = ""
        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as err:
            raise RuntimeError(f"OpenRouter malformed response: {err}; body={data}")

        return LLMResponse(text=text, model=body["model"], raw=data)
