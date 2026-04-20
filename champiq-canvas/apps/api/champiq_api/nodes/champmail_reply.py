"""champmail.reply_classifier node.

Classifies an incoming Champmail reply with an LLM and, if positive, calls
pause_sequence on the Champmail API so the prospect is no longer contacted.

Canvas config:
    reply_body      str (expression) — the reply text to classify
    sequence_id     str (expression) — Champmail sequence_id to pause
    credential      str              — credential name containing {"api_token": "..."}
    model           str (optional)   — LLM model override
    system          str (optional)   — LLM system-prompt override

Outputs:
    sentiment       "positive" | "negative" | "neutral"
    paused          bool — true if pause_sequence was called
    pause_response  dict | None

Branches:
    positive  — emitted when sentiment is positive (sequence was paused)
    other     — emitted for negative / neutral / errors
"""
from __future__ import annotations

import logging
from typing import Any

from ..core.interfaces import NodeContext, NodeExecutor, NodeResult
from ..llm import LLMMessage

log = logging.getLogger(__name__)

_DEFAULT_SYSTEM = (
    "You are a sales-reply classifier. "
    "Classify the prospect's reply as exactly one of: positive, negative, neutral. "
    "positive  = interested, wants to continue, asking for a demo/call/more info. "
    "negative  = unsubscribe, not interested, stop emailing. "
    "neutral   = out-of-office, auto-reply, asking a clarifying question with no clear intent. "
    "Reply with ONLY the single word label."
)


class ChampmailReplyClassifierExecutor(NodeExecutor):
    kind = "champmail.reply_classifier"

    async def execute(self, ctx: NodeContext) -> NodeResult:
        from ..container import get_container

        reply_body: str = str(ctx.render(ctx.config.get("reply_body", "")) or "")
        sequence_id: str = str(ctx.render(ctx.config.get("sequence_id", "")) or "")

        if not reply_body:
            return NodeResult(
                output={"sentiment": "neutral", "paused": False, "error": "empty reply_body"},
                branches=["other"],
            )

        # --- LLM classification ---
        provider = get_container().llm
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

        system = ctx.render(ctx.config.get("system", "")) or _DEFAULT_SYSTEM
        model = ctx.config.get("model") or None

        resp = await provider.complete(
            [LLMMessage(role="user", content=reply_body)],
            system=system,
            model=model,
            temperature=0.0,
            max_tokens=16,
        )

        raw_label = resp.text.strip().lower().split()[0] if resp.text.strip() else "neutral"
        if raw_label not in {"positive", "negative", "neutral"}:
            log.warning("champmail.reply_classifier: unexpected label %r, treating as neutral", raw_label)
            raw_label = "neutral"

        sentiment: str = raw_label
        output: dict[str, Any] = {"sentiment": sentiment, "paused": False, "pause_response": None}

        if sentiment != "positive" or not sequence_id:
            return NodeResult(output=output, branches=["other"])

        # --- Pause the sequence ---
        container = get_container()
        driver = container.drivers.get("champmail")
        if driver is None:
            output["error"] = "champmail driver not found"
            return NodeResult(output=output, branches=["other"])

        credentials: dict[str, Any] = {}
        if cred_name:
            credentials = await ctx.credentials.resolve(cred_name)

        try:
            seq_id_int = int(sequence_id)
        except (ValueError, TypeError):
            output["error"] = f"sequence_id must be an integer, got {sequence_id!r}"
            return NodeResult(output=output, branches=["other"])

        try:
            pause_resp = await driver.invoke(
                "pause_sequence",
                {"sequence_id": seq_id_int},
                credentials,
            )
            output["paused"] = True
            output["pause_response"] = pause_resp
        except Exception as exc:
            log.exception("champmail.reply_classifier: pause_sequence failed")
            output["error"] = str(exc)
            return NodeResult(output=output, branches=["other"])

        return NodeResult(output=output, branches=["positive"])
