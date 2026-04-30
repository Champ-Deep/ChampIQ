"""LLM node — uses the configured LLMProvider (OpenRouter by default).

Config:
    model        str, optional — overrides the provider default
    system       str (expressions allowed)
    prompt       str (expressions allowed) — the user message
    temperature  float
    max_tokens   int
    json_mode    bool — parse response as JSON into output.json
    credential   optional credential name containing `api_key` to override env

The node resolves the provider lazily from the container, so tests can
substitute a fake provider without touching this file.
"""
from __future__ import annotations

import json
from typing import Any

from ..core.interfaces import NodeContext, NodeExecutor, NodeResult
from ..llm import LLMMessage


class LLMExecutor(NodeExecutor):
    kind = "llm"

    async def execute(self, ctx: NodeContext) -> NodeResult:
        # Lazy import to avoid the container<->nodes circular at module load.
        from ..container import get_container

        provider = get_container().llm

        # Optional per-node credential override. The credential entry should
        # contain {"api_key": "..."} — if present we build a one-off provider
        # of the same type with that key.
        cred_name = ctx.config.get("credential") or ""
        if cred_name:
            creds = await ctx.credentials.resolve(cred_name)
            api_key = creds.get("api_key")
            if api_key:
                from ..database import get_settings
                from ..llm import OpenRouterProvider

                s = get_settings()
                provider = OpenRouterProvider(
                    api_key=api_key,
                    base_url=s.openrouter_base_url,
                    default_model=s.openrouter_model,
                    referrer=s.openrouter_referrer,
                    app_title=s.openrouter_app_title,
                )

        model = ctx.config.get("model") or None
        system = ctx.render(ctx.config.get("system", "")) or None
        prompt = str(ctx.render(ctx.config.get("prompt", "")))
        max_tokens = int(ctx.config.get("max_tokens", 1024))
        temperature = float(ctx.config.get("temperature", 0.7))

        resp = await provider.complete(
            [LLMMessage(role="user", content=prompt)],
            system=system,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        output: dict[str, Any] = {"text": resp.text, "model": resp.model}
        if ctx.config.get("json_mode"):
            # Raise on parse failure so downstream nodes that template
            # `{{ prev.json.foo }}` get a clear, actionable error here instead
            # of a confusing "missing key" further down the graph. The raw
            # text is included in the message so the user can see what the LLM
            # actually produced.
            try:
                output["json"] = json.loads(_extract_json(resp.text))
            except Exception as err:
                snippet = (resp.text or "").strip()
                if len(snippet) > 500:
                    snippet = snippet[:500] + "…"
                raise ValueError(
                    f"llm.json_mode: response was not valid JSON ({err}). "
                    f"Text: {snippet!r}"
                ) from err
        return NodeResult(output=output)


def _extract_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        for part in parts:
            part = part.strip()
            if part.startswith("{") or part.startswith("["):
                return part
            if part.startswith("json"):
                return part[4:].strip()
    return text
