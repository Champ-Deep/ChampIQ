"""ChampVoice driver — AI calling agent for prospect outreach and follow-up.

Routes through CHAMPVOICE_BASE_URL/api/v1/*.
Auth: JWT bearer token via POST /api/v1/auth/login (same ChampServer credentials).

Supported actions:
    initiate_call      POST /api/v1/calls              — start an AI voice call for a prospect
    get_call_status    GET  /api/v1/calls/{call_id}    — poll call outcome
    list_scripts       GET  /api/v1/call-scripts        — available call scripts
    list_calls         GET  /api/v1/calls               — call history with filters
    cancel_call        POST /api/v1/calls/{call_id}/cancel
"""
from __future__ import annotations

from typing import Any, Optional

import httpx

from .base import HttpToolDriver


class ChampVoiceDriver(HttpToolDriver):
    tool_id = "champvoice"

    actions: dict[str, dict[str, Any]] = {
        "initiate_call":   {"method": "POST", "path": "/api/v1/calls"},
        "get_call_status": {"method": "GET",  "path": "/api/v1/calls/{call_id}"},
        "list_scripts":    {"method": "GET",  "path": "/api/v1/call-scripts"},
        "list_calls":      {"method": "GET",  "path": "/api/v1/calls"},
        "cancel_call":     {"method": "POST", "path": "/api/v1/calls/{call_id}/cancel"},
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
            raise KeyError(f"champvoice: unknown action {action!r}. Available: {list(self.actions)}")

        import urllib.parse

        method = spec["method"].upper()
        path = spec["path"].format(
            **{k: urllib.parse.quote(str(v), safe="") for k, v in inputs.items() if isinstance(v, (str, int))}
        )
        url = f"{self._base_url}{path}"
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}

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
            raise RuntimeError(f"champvoice.{action} → {response.status_code}: {response.text[:500]}")

        try:
            return response.json()
        except ValueError:
            return {"raw": response.text}

    def parse_webhook(self, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
        event = payload.get("event") or payload.get("type")
        if not event:
            return None
        canonical = {
            "call_completed":   "call.completed",
            "call_failed":      "call.failed",
            "call_answered":    "call.answered",
            "call_voicemail":   "call.voicemail",
            "call_no_answer":   "call.no_answer",
            "call_qualified":   "call.qualified",
            "call_disqualified": "call.disqualified",
        }.get(event, f"champvoice.{event}")
        return {"event": canonical, "data": payload.get("data", payload)}
