"""Lakeb2b Pulse driver.

Pulse is the LinkedIn engagement automation service. Auth is an OAuth-minted
JWT held in the credential record.
"""
from __future__ import annotations

from typing import Any, Optional

from .base import HttpToolDriver


class LakebPulseDriver(HttpToolDriver):
    tool_id = "lakeb2b_pulse"

    actions: dict[str, dict[str, Any]] = {
        "track_page": {"method": "POST", "path": "/api/v1/tracked-pages", "auth": "bearer"},
        "list_tracked_pages": {"method": "GET", "path": "/api/v1/tracked-pages", "auth": "bearer"},
        "list_posts": {"method": "GET", "path": "/api/v1/posts", "auth": "bearer"},
        "schedule_engagement": {"method": "POST", "path": "/api/v1/engagements/schedule", "auth": "bearer"},
        "get_engagement_status": {"method": "GET", "path": "/api/v1/engagements/{engagement_id}", "auth": "bearer"},
        "list_team": {"method": "GET", "path": "/api/v1/teams", "auth": "bearer"},
    }

    def _build_headers(self, auth_kind: str, credentials: dict[str, Any]) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if auth_kind == "bearer" and credentials.get("jwt"):
            headers["Authorization"] = f"Bearer {credentials['jwt']}"
        return headers

    def parse_webhook(self, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
        event = payload.get("event") or payload.get("type")
        if not event:
            return None
        canonical = {
            "post_detected": "pulse.post.detected",
            "engagement_completed": "pulse.engagement.completed",
            "daily_cap_hit": "pulse.cap.hit",
        }.get(event, f"pulse.{event}")
        return {"event": canonical, "data": payload.get("data", payload)}
