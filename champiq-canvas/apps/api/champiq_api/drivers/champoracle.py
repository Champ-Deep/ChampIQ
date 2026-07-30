"""ChampOracle driver — pre-send campaign simulation against synthetic personas.

ChampOracle exposes a Flask blueprint mounted at `/api/v1` whose own source
comments it as *"PR-11: public API for ChampIQ"*. It was built to be driven by
the orchestrator and then never got a driver or a manifest, so the whole
capability sat unreachable from a DAG.

What it is for
--------------
Every other module in the suite acts on the real world: Harbinger finds real
people, LakeStream scrapes real sites, ChampMail mails real prospects.
ChampOracle is the one that does not — it builds a knowledge graph of synthetic
personas from a reality seed and runs a campaign against them.

That makes it the natural **pre-flight check** in an outreach workflow. Before
committing a sequence to a real list you can simulate it, read the personas'
reactions, and ask follow-up questions of the simulation. Getting a campaign
wrong on 500 real prospects costs you those prospects and some domain
reputation; getting it wrong in a simulation costs a few minutes of compute.

Paths verified against ChampOracle's `app/__init__.py` blueprint registration
and `app/api/v1.py` route decorators on 2026-07-30.
"""
from __future__ import annotations

from typing import Any

from .base import HttpToolDriver


class ChampOracleDriver(HttpToolDriver):
    tool_id = "champoracle"

    actions = {
        # --- simulation ------------------------------------------------------
        # * Kicks off the full pipeline: reality seed -> ontology -> knowledge
        # * graph -> persona simulation -> report. Long-running; poll
        # * get_campaign for progress rather than expecting a synchronous result.
        "simulate_campaign": {
            "method": "POST", "path": "/api/v1/campaigns/simulate", "auth": "bearer",
        },
        "get_campaign": {
            "method": "GET", "path": "/api/v1/campaigns/{campaign_id}", "auth": "bearer",
        },
        "get_personas": {
            "method": "GET", "path": "/api/v1/campaigns/{campaign_id}/personas", "auth": "bearer",
        },
        "get_report": {
            "method": "GET", "path": "/api/v1/campaigns/{campaign_id}/report", "auth": "bearer",
        },
        # * Free-form question against a finished simulation — "which persona
        # * objected to pricing and why". This is the read that turns a report
        # * into something a DAG can branch on.
        "ask_campaign": {
            "method": "POST", "path": "/api/v1/campaigns/{campaign_id}/ask", "auth": "bearer",
        },
        # * Interview one persona in depth rather than reading aggregate output.
        "interview_persona": {
            "method": "POST", "path": "/api/v1/campaigns/{campaign_id}/interview", "auth": "bearer",
        },
        # * Predicted deliverability for campaign copy — a spam/placement read
        # * BEFORE sending, distinct from ChampMail's InboxKit health, which
        # * measures a mailbox after the fact.
        "check_deliverability": {
            "method": "POST", "path": "/api/v1/campaigns/deliverability", "auth": "bearer",
        },
        # --- metadata --------------------------------------------------------
        "list_channels": {
            "method": "GET", "path": "/api/v1/channels", "auth": "bearer",
        },
        "health": {
            "method": "GET", "path": "/api/v1/health", "auth": "none",
        },
    }

    def _build_headers(self, auth_kind: str, credentials: dict[str, Any]) -> dict[str, str]:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if auth_kind == "bearer":
            # ChampOracle's require_api_key decorator accepts the key as a
            # bearer token; see app/api/v1.py::_load_api_keys.
            token = credentials.get("api_key") or credentials.get("token") or ""
            if token:
                headers["Authorization"] = f"Bearer {token}"
        return headers
