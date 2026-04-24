"""Champmail driver.

Routes through CHAMPMAIL_BASE_URL/api/v1/*.
Auth: JWT bearer token obtained via /api/v1/auth/login (form-encoded).
Credentials stored in canvas: {"email": "...", "password": "..."} OR
the driver falls back to CHAMPSERVER_EMAIL / CHAMPSERVER_PASSWORD from settings.

Legacy credential shape {"api_token": "..."} is also accepted — the token is
used directly so existing stored credentials keep working.
"""
from __future__ import annotations

from typing import Any, Optional

import httpx

from .base import HttpToolDriver


class ChampmailDriver(HttpToolDriver):
    tool_id = "champmail"

    actions: dict[str, dict[str, Any]] = {
        "add_prospect":       {"method": "POST", "path": "/api/v1/prospects",                             "auth": "bearer"},
        "get_prospect":       {"method": "GET",  "path": "/api/v1/prospects/{email}",                    "auth": "bearer"},
        "enrich_prospect":    {"method": "POST", "path": "/api/v1/prospects/{email}/enrich",             "auth": "bearer"},
        "list_sequences":     {"method": "GET",  "path": "/api/v1/sequences",                            "auth": "bearer"},
        "start_sequence":     {"method": "POST", "path": "/api/v1/sequences/{sequence_id}/enroll",       "auth": "bearer"},
        "enroll_sequence":    {"method": "POST", "path": "/api/v1/sequences/{sequence_id}/enroll",       "auth": "bearer"},
        "pause_sequence":     {"method": "POST", "path": "/api/v1/sequences/{sequence_id}/pause",        "auth": "bearer"},
        "resume_sequence":    {"method": "POST", "path": "/api/v1/sequences/{sequence_id}/resume",       "auth": "bearer"},
        "send_single_email":  {"method": "POST", "path": "/api/v1/send",                                  "auth": "bearer"},
        "get_analytics":      {"method": "GET",  "path": "/api/v1/sequences/{sequence_id}/analytics",   "auth": "bearer"},
        "list_templates":     {"method": "GET",  "path": "/api/v1/templates",                            "auth": "bearer"},
        "get_template":       {"method": "GET",  "path": "/api/v1/templates/{template_id}",              "auth": "bearer"},
        "preview_template":   {"method": "POST", "path": "/api/v1/templates/{template_id}/preview",     "auth": "bearer"},
    }

    async def _get_token(self, credentials: dict[str, Any]) -> str:
        # Legacy: direct token provided
        if credentials.get("api_token"):
            return credentials["api_token"]
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

    def _build_headers(self, auth_kind: str, credentials: dict[str, Any]) -> dict[str, str]:
        # Sync fallback — token is injected via invoke() override.
        return {"Content-Type": "application/json"}

    async def invoke(
        self,
        action: str,
        inputs: dict[str, Any],
        credentials: dict[str, Any],
    ) -> dict[str, Any]:
        token = credentials.get("_token") or await self._get_token(credentials)
        credentials = {**credentials, "_token": token}
        spec = self.actions.get(action)
        if spec is None:
            raise KeyError(f"champmail: unknown action {action!r}")

        import urllib.parse

        transformed = dict(inputs)
        if action in ("start_sequence", "enroll_sequence"):
            if "prospect_email" in transformed and "prospect_emails" not in transformed:
                transformed["prospect_emails"] = [transformed.pop("prospect_email")]

        method = spec.get("method", "POST").upper()
        path = spec.get("path", "").format(
            **{k: urllib.parse.quote(str(v), safe="") for k, v in transformed.items() if isinstance(v, (str, int))}
        )
        url = f"{self._base_url}{path}"
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}

        json_payload = None
        params = None
        if method in {"GET", "DELETE"}:
            params = {k: v for k, v in transformed.items() if v is not None and not k.startswith("_")}
        else:
            json_payload = {k: v for k, v in transformed.items() if not k.startswith("_")}

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.request(method, url, headers=headers, json=json_payload, params=params)
        if response.status_code >= 400:
            raise RuntimeError(f"champmail.{action} -> {response.status_code}: {response.text[:500]}")
        try:
            return response.json()
        except ValueError:
            return {"raw": response.text}

    def parse_webhook(self, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
        event = payload.get("event") or payload.get("type")
        if not event:
            return None
        canonical = {
            "email_sent":          "email.sent",
            "email_opened":        "email.opened",
            "email_clicked":       "email.clicked",
            "email_replied":       "email.replied",
            "email_bounced":       "email.bounced",
            "sequence_completed":  "sequence.completed",
        }.get(event, f"champmail.{event}")
        return {"event": canonical, "data": payload.get("data", payload)}
