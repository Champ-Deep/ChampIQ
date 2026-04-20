"""Champmail driver.

Champmail is a FastAPI service (typically :8001) for cold-email sequences,
prospect management, and IMAP-driven reply detection.
"""
from __future__ import annotations

from typing import Any, Optional

from .base import HttpToolDriver


class ChampmailDriver(HttpToolDriver):
    tool_id = "champmail"

    actions: dict[str, dict[str, Any]] = {
        "add_prospect": {"method": "POST", "path": "/api/v1/prospects", "auth": "bearer"},
        "start_sequence": {"method": "POST", "path": "/api/v1/sequences/start", "auth": "bearer"},
        "pause_sequence": {"method": "POST", "path": "/api/v1/sequences/{sequence_id}/pause", "auth": "bearer"},
        "resume_sequence": {"method": "POST", "path": "/api/v1/sequences/{sequence_id}/resume", "auth": "bearer"},
        "send_single_email": {"method": "POST", "path": "/api/v1/emails/send", "auth": "bearer"},
        "list_sequences": {"method": "GET", "path": "/api/v1/sequences", "auth": "bearer"},
        "get_analytics": {"method": "GET", "path": "/api/v1/sequences/{sequence_id}/analytics", "auth": "bearer"},
        "list_templates": {"method": "GET", "path": "/api/v1/templates", "auth": "bearer"},
    }

    def _build_headers(self, auth_kind: str, credentials: dict[str, Any]) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if auth_kind == "bearer" and credentials.get("api_token"):
            headers["Authorization"] = f"Bearer {credentials['api_token']}"
        return headers

    def parse_webhook(self, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
        event = payload.get("event") or payload.get("type")
        if not event:
            return None
        canonical = {
            "email_sent": "email.sent",
            "email_opened": "email.opened",
            "email_clicked": "email.clicked",
            "email_replied": "email.replied",
            "email_bounced": "email.bounced",
            "sequence_completed": "sequence.completed",
        }.get(event, f"champmail.{event}")
        return {"event": canonical, "data": payload.get("data", payload)}
