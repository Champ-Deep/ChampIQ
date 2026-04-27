"""Lakeb2b Pulse driver — connects to https://b2b-pulse.up.railway.app

Auth: JWT stored in credential as `access_token` (with `jwt` as legacy fallback).
On 401, auto-refreshes using `refresh_token` via POST /api/auth/refresh,
updates the stored credential, and retries once.
"""
from __future__ import annotations

from typing import Any, Optional

import httpx

from .base import HttpToolDriver


class LakebPulseDriver(HttpToolDriver):
    tool_id = "lakeb2b_pulse"

    actions: dict[str, dict[str, Any]] = {
        "track_page":            {"method": "POST", "path": "/api/tracked-pages",                       "auth": "bearer"},
        "list_tracked_pages":    {"method": "GET",  "path": "/api/tracked-pages",                       "auth": "bearer"},
        "poll_page":             {"method": "POST", "path": "/api/tracked-pages/{page_id}/poll-now",    "auth": "bearer"},
        "list_posts":            {"method": "GET",  "path": "/api/tracked-pages/{page_id}/posts",       "auth": "bearer"},
        "schedule_engagement":   {"method": "POST", "path": "/api/automation/generate-comment",         "auth": "bearer"},
        "get_engagement_status": {"method": "GET",  "path": "/api/audit",                               "auth": "bearer"},
        "get_integration_status":{"method": "GET",  "path": "/api/integrations/status",                 "auth": "bearer"},
    }

    def _build_headers(self, auth_kind: str, credentials: dict[str, Any]) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        token = credentials.get("access_token") or credentials.get("jwt") or ""
        if auth_kind == "bearer" and token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    async def invoke(
        self,
        action: str,
        inputs: dict[str, Any],
        credentials: dict[str, Any],
    ) -> dict[str, Any]:
        """Override to add 401 → refresh → retry logic."""
        try:
            return await super().invoke(action, inputs, credentials)
        except RuntimeError as exc:
            if "401" not in str(exc):
                raise
            # Try to refresh
            refreshed = await self._refresh_token(credentials)
            if refreshed:
                credentials = {**credentials, **refreshed}
                return await super().invoke(action, inputs, credentials)
            raise

    async def _refresh_token(self, credentials: dict[str, Any]) -> Optional[dict[str, str]]:
        """POST /api/auth/refresh — returns new {access_token, refresh_token} or None."""
        refresh_token = credentials.get("refresh_token")
        if not refresh_token:
            return None
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{self._base_url}/api/auth/refresh",
                    json={"refresh_token": refresh_token},
                )
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "access_token": data.get("access_token", ""),
                    "refresh_token": data.get("refresh_token", refresh_token),
                }
        except Exception:
            pass
        return None

    def parse_webhook(self, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
        event = payload.get("event") or payload.get("type")
        if not event:
            return None
        canonical = {
            "post_detected":        "pulse.post.detected",
            "engagement_completed": "pulse.engagement.completed",
            "daily_cap_hit":        "pulse.cap.hit",
        }.get(str(event), f"pulse.{event}")
        return {"event": canonical, "data": payload.get("data", payload)}
