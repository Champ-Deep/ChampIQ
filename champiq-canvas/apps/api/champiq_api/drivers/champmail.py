"""ChampMail driver — the send-of-record's front door (SYSTEM_DESIGN §3#2).

parse_webhook normalizes ChampMail's emitted {type: topic, ...payload} events
(email.sent, email.bounced, ...) into the canonical bus shape, so the graph
write-back and run_ledger consumers see real sends, not just the inline
champmail node's traffic (2026-07-23 live run, finding #7).
"""
from __future__ import annotations

from typing import Any, Optional

from .base import HttpToolDriver

# * topics ChampMail's champiq_emit.py delivers (EVENT_DESIGN catalog, subset
# * actually wired so far — bounced/opened/clicked land when those handlers
# * grow the same emit_email_event call)
_EVENT_TOPICS = frozenset({"email.sent", "email.bounced", "email.opened", "email.clicked", "email.unsubscribed"})


class ChampMailDriver(HttpToolDriver):
    tool_id = "champmail"

    actions = {
        "send": {"method": "POST", "path": "/api/v1/send", "auth": "bearer"},
        "send_batch": {"method": "POST", "path": "/api/v1/send/batch", "auth": "bearer"},
        "get_status": {"method": "GET", "path": "/api/v1/send/status/{message_id}", "auth": "bearer"},
        "get_stats": {"method": "GET", "path": "/api/v1/send/stats", "auth": "bearer"},
    }

    def _build_headers(self, auth_kind: str, credentials: dict[str, Any]) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if auth_kind == "bearer":
            key = credentials.get("token") or credentials.get("api_key") or ""
            if key:
                headers["Authorization"] = f"Bearer {key}"
        return headers

    def parse_webhook(self, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
        topic = payload.get("type")
        if topic not in _EVENT_TOPICS:
            return None
        return {"event": topic, **{k: v for k, v in payload.items() if k != "type"}}
