"""champmail.reply_classifier node.

Classifies an incoming Champmail reply with an LLM and, if positive, pauses
the prospect's active enrollment(s) so they're no longer contacted.

Canvas config:
    reply_body       str (expression) — the reply text to classify
    prospect_email   str (expression, optional) — prospect to pause; required for positive-branch pause
    sequence_id      int (expression, optional) — pause only this enrollment; otherwise pause all active for prospect
    credential       str (optional)   — credential name; only used to override LLM api_key
    model            str (optional)   — LLM model override
    system           str (optional)   — LLM system-prompt override

Outputs:
    sentiment        "positive" | "negative" | "neutral"
    paused           bool — true if at least one enrollment was paused
    paused_count     int  — number of enrollments paused (0 when no prospect / sequence found)

Branches:
    positive  — emitted when sentiment is positive (pause attempted)
    other     — emitted for negative / neutral / errors

Note: this is the canvas-level reply handler. Inbound webhooks
(`/api/champmail/webhooks/emelia`) auto-pause on every reply event regardless
of sentiment — this node is for canvas flows that classify replies coming from
other sources (e.g. forwarded events, manual triggers).
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
        prospect_email: str = str(ctx.render(ctx.config.get("prospect_email", "")) or "").strip().lower()
        raw_seq_id = ctx.render(ctx.config.get("sequence_id", ""))
        sequence_id: int | None = None
        if raw_seq_id not in (None, "", 0):
            try:
                sequence_id = int(raw_seq_id)
            except (TypeError, ValueError):
                sequence_id = None

        if not reply_body:
            return NodeResult(
                output={"sentiment": "neutral", "paused": False, "paused_count": 0, "error": "empty reply_body"},
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
        output: dict[str, Any] = {"sentiment": sentiment, "paused": False, "paused_count": 0}

        if sentiment != "positive":
            return NodeResult(output=output, branches=["other"])

        if not prospect_email:
            output["error"] = "prospect_email is required to pause on positive sentiment"
            return NodeResult(output=output, branches=["other"])

        # --- Pause the enrollment(s) via local services ---
        from ..champmail.repositories import EnrollmentRepository, ProspectRepository
        from ..champmail.services import EnrollmentService
        from ..database import get_session_factory

        session_factory = get_session_factory()
        try:
            async with session_factory() as session:
                prospect = await ProspectRepository(session).get_by_email(prospect_email)
                if prospect is None:
                    output["error"] = f"prospect {prospect_email!r} not found"
                    await session.rollback()
                    return NodeResult(output=output, branches=["other"])

                paused_count = 0
                enrollments_repo = EnrollmentRepository(session)
                if sequence_id is not None:
                    en = await enrollments_repo.find(prospect.id, sequence_id)
                    if en and en.status == "active":
                        await EnrollmentService(session).pause(en.id)
                        paused_count = 1
                else:
                    paused_count = await enrollments_repo.pause_active_for_prospect(
                        prospect.id, reason="paused"
                    )
                await session.commit()
                output["paused"] = paused_count > 0
                output["paused_count"] = paused_count
        except Exception as exc:
            log.exception("champmail.reply_classifier: pause failed")
            output["error"] = str(exc)
            return NodeResult(output=output, branches=["other"])

        return NodeResult(output=output, branches=["positive"])
