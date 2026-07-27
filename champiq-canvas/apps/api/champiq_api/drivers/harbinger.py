"""ChampHarbinger driver — the SENSE stage's front door (SYSTEM_DESIGN §3#1,
SUGGESTIONS 2.2 step 3).

Actions wrap Harbinger's v1 API; parse_webhook normalizes Harbinger's emitted
{type: topic, ...payload} events (prospect.qualified, signal.matched) into the
canonical bus shape, so event-triggered workflows can bind on those topics.
"""
from __future__ import annotations

from typing import Any, Optional

from .base import HttpToolDriver

# * topics Harbinger's emit.ts delivers (EVENT_DESIGN catalog)
_EVENT_TOPICS = frozenset({"prospect.qualified", "signal.matched"})


class HarbingerDriver(HttpToolDriver):
    tool_id = "harbinger"

    actions = {
        "get_qualified_prospects": {
            "method": "GET",
            "path": "/api/v1/prospects/qualified",
            "auth": "bearer",
        },
        # * SENSE-step read-back (item 2): Harbinger's v1 API has no per-prospect
        # * signal endpoint — the qualified-prospects feed is the only read
        # * surface that carries signal data, so get_signals reuses it. See
        # * _get_signals for the domain-filter caveat.
        "get_signals": {
            "method": "GET",
            "path": "/api/v1/prospects/qualified",
            "auth": "bearer",
        },
        "acknowledge": {
            "method": "POST",
            "path": "/api/v1/prospects/{id}/acknowledge",
            "auth": "bearer",
        },
        "run_signal": {
            "method": "POST",
            "path": "/api/v1/signals/run",
            "auth": "bearer",
        },
        "import_companies": {
            "method": "POST",
            "path": "/api/v1/companies/import",
            "auth": "bearer",
        },
    }

    def _build_headers(self, auth_kind: str, credentials: dict[str, Any]) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if auth_kind == "bearer":
            # * chh_ key from the credential store (or CHH_API_KEY-style entry)
            key = credentials.get("api_key") or credentials.get("token") or ""
            if key:
                headers["Authorization"] = f"Bearer {key}"
        return headers

    async def invoke(
        self,
        action: str,
        inputs: dict[str, Any],
        credentials: dict[str, Any],
    ) -> dict[str, Any]:
        if action == "get_signals":
            return await self._get_signals(inputs, credentials)
        return await super().invoke(action, inputs, credentials)

    async def _get_signals(self, inputs: dict[str, Any], credentials: dict[str, Any]) -> dict[str, Any]:
        """Read back detected signals for a specific prospect/domain.

        Harbinger's v1 API (checked against ChampHarbinger/src/app/api/v1/signals/*
        and prospects/qualified/route.ts, 2026-07) has no endpoint that returns
        signals for one prospect — GET /api/v1/prospects/qualified is the only
        read surface with signal data (signal.id/name/reasoning/data per row),
        and it has no server-side domain query param. This fetches that feed
        and filters client-side by company domain when one is given; without a
        domain it returns the whole feed as-is.
        """
        domain = (inputs.get("domain") or inputs.get("company_domain") or "").strip().lower()
        feed_inputs = {k: v for k, v in inputs.items() if k not in ("domain", "company_domain")}
        feed = await super().invoke("get_qualified_prospects", feed_inputs, credentials)
        prospects = feed.get("prospects", []) if isinstance(feed, dict) else []
        if domain:
            prospects = [
                p for p in prospects
                if str((p.get("company") or {}).get("domain", "")).lower() == domain
            ]
        return {
            "signals": [p["signal"] for p in prospects if p.get("signal")],
            "prospects": prospects,
            "next_cursor": feed.get("next_cursor") if isinstance(feed, dict) else None,
        }

    def parse_webhook(self, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
        topic = payload.get("type")
        if topic not in _EVENT_TOPICS:
            return None
        return {"event": topic, **{k: v for k, v in payload.items() if k != "type"}}
