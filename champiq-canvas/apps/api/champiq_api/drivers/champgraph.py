"""ChampGraph driver — wraps the ChampServer (ChampMail backend) REST API.

The server lives at CHAMPGRAPH_BASE_URL (same host as ChampMail by default).
Auth: JWT bearer token via POST /api/v1/auth/login (form-encoded username/password).
Credentials: {"email": "...", "password": "..."} OR env CHAMPSERVER_EMAIL / CHAMPSERVER_PASSWORD.

Supported actions (mapped to actual server endpoints):
    create_prospect      POST /api/v1/admin/prospects
    list_prospects       GET  /api/v1/admin/prospects
    research_prospects   POST /api/v1/admin/ai-campaigns/research
    campaign_essence     POST /api/v1/admin/ai-campaigns/essence
    campaign_segment     POST /api/v1/admin/ai-campaigns/segment
    campaign_pitch       POST /api/v1/admin/ai-campaigns/pitch
    campaign_personalize POST /api/v1/admin/ai-campaigns/personalize
    campaign_html        POST /api/v1/admin/ai-campaigns/html
    list_sequences       GET  /api/v1/sequences
    enroll_sequence      POST /api/v1/sequences/{sequence_id}/enroll
    upload_prospect_list POST /api/v1/admin/prospect-lists/upload
"""
from __future__ import annotations

import urllib.parse
from typing import Any

import httpx

from .base import HttpToolDriver


class ChampGraphDriver(HttpToolDriver):
    tool_id = "champgraph"

    # action -> {method, path (may have {placeholders})}
    actions: dict[str, dict[str, Any]] = {
        # Prospect CRUD
        "create_prospect":      {"method": "POST", "path": "/api/v1/prospects"},
        "bulk_import":          {"method": "POST", "path": "/api/v1/prospects/bulk"},
        "list_prospects":       {"method": "GET",  "path": "/api/v1/prospects"},
        "enrich_prospect":      {"method": "POST", "path": "/api/v1/prospects/{email}/enrich"},
        # AI campaign pipeline
        "research_prospects":   {"method": "POST", "path": "/api/v1/admin/ai-campaigns/research"},
        "campaign_essence":     {"method": "POST", "path": "/api/v1/admin/ai-campaigns/essence"},
        "campaign_segment":     {"method": "POST", "path": "/api/v1/admin/ai-campaigns/segment"},
        "campaign_pitch":       {"method": "POST", "path": "/api/v1/admin/ai-campaigns/pitch"},
        "campaign_personalize": {"method": "POST", "path": "/api/v1/admin/ai-campaigns/personalize"},
        "campaign_html":        {"method": "POST", "path": "/api/v1/admin/ai-campaigns/html"},
        "campaign_preview":     {"method": "POST", "path": "/api/v1/admin/ai-campaigns/preview"},
        # Sequences
        "list_sequences":       {"method": "GET",  "path": "/api/v1/sequences"},
        "enroll_sequence":      {"method": "POST", "path": "/api/v1/sequences/{sequence_id}/enroll"},
        # Campaigns & analytics
        "list_campaigns":       {"method": "GET",  "path": "/api/v1/campaigns"},
        "analytics_overview":   {"method": "GET",  "path": "/api/v1/analytics/overview"},
    }

    def _build_headers(self, auth_kind: str, credentials: dict[str, Any]) -> dict[str, str]:
        return {"Content-Type": "application/json"}

    async def _get_token(self, credentials: dict[str, Any]) -> str:
        from ..database import get_settings
        s = get_settings()
        email = credentials.get("email") or s.champserver_email
        password = credentials.get("password") or s.champserver_password
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                f"{self._base_url}/api/v1/auth/login",
                data={"username": email, "password": password},
            )
            r.raise_for_status()
            return r.json()["access_token"]

    async def invoke(
        self,
        action: str,
        inputs: dict[str, Any],
        credentials: dict[str, Any],
    ) -> dict[str, Any]:
        token = credentials.get("_token") or await self._get_token(credentials)

        spec = self.actions.get(action)
        if spec is None:
            raise KeyError(f"champgraph: unknown action {action!r}. Available: {list(self.actions)}")

        method = spec["method"].upper()
        path = spec["path"].format(
            **{k: urllib.parse.quote(str(v), safe="") for k, v in inputs.items() if isinstance(v, (str, int))}
        )
        url = f"{self._base_url}{path}"
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}

        # Strip internal keys and None values — server rejects null for non-nullable fields.
        clean_inputs = {k: v for k, v in inputs.items() if not k.startswith("_") and v is not None}

        json_payload = None
        params = None
        if method in {"GET", "DELETE"}:
            params = clean_inputs
        else:
            json_payload = clean_inputs

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.request(method, url, headers=headers, json=json_payload, params=params)

        if response.status_code >= 400:
            raise RuntimeError(f"champgraph.{action} → {response.status_code}: {response.text[:500]}")

        try:
            return response.json()
        except ValueError:
            return {"raw": response.text}
