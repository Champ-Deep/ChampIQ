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

    # * Widened 2026-07-30. This was 4 send-only actions against a ChampMail API
    # * of ~20 route groups, so a canvas DAG could send an email but could not
    # * enrol anyone in a sequence, suppress an address, or manage a template —
    # * the operations signal-triggered outreach is actually made of. Every
    # * entry below is an existing, verified ChampMail route.
    actions = {
        # --- sending (the send-of-record path: rotation, per-mailbox caps,
        # --- suppression checks, Message-ID correlation, InboxKit) ---------
        "send": {"method": "POST", "path": "/api/v1/send", "auth": "bearer"},
        "send_batch": {"method": "POST", "path": "/api/v1/send/batch", "auth": "bearer"},
        "get_status": {"method": "GET", "path": "/api/v1/send/status/{message_id}", "auth": "bearer"},
        "get_stats": {"method": "GET", "path": "/api/v1/send/stats", "auth": "bearer"},

        # --- prospects -----------------------------------------------------
        "list_prospects": {"method": "GET", "path": "/api/v1/prospects", "auth": "bearer"},
        "add_prospect": {"method": "POST", "path": "/api/v1/prospects", "auth": "bearer"},
        "get_prospect": {"method": "GET", "path": "/api/v1/prospects/{email}", "auth": "bearer"},
        "update_prospect": {"method": "PUT", "path": "/api/v1/prospects/{email}", "auth": "bearer"},
        "bulk_import_prospects": {"method": "POST", "path": "/api/v1/prospects/bulk", "auth": "bearer"},
        # * Per-prospect cross-channel history — the read a DAG needs before
        # * deciding whether to contact someone again.
        "get_prospect_timeline": {"method": "GET", "path": "/api/v1/prospects/{email}/timeline", "auth": "bearer"},

        # --- sequences (what signal-triggered outreach is built from) ------
        "list_sequences": {"method": "GET", "path": "/api/v1/sequences", "auth": "bearer"},
        "create_sequence": {"method": "POST", "path": "/api/v1/sequences", "auth": "bearer"},
        "get_sequence": {"method": "GET", "path": "/api/v1/sequences/{sequence_id}", "auth": "bearer"},
        "enroll_sequence": {"method": "POST", "path": "/api/v1/sequences/{sequence_id}/enroll", "auth": "bearer"},
        "pause_sequence": {"method": "POST", "path": "/api/v1/sequences/{sequence_id}/pause", "auth": "bearer"},
        "resume_sequence": {"method": "POST", "path": "/api/v1/sequences/{sequence_id}/resume", "auth": "bearer"},
        "get_sequence_analytics": {"method": "GET", "path": "/api/v1/sequences/{sequence_id}/analytics", "auth": "bearer"},

        # --- templates -----------------------------------------------------
        "list_templates": {"method": "GET", "path": "/api/v1/templates", "auth": "bearer"},
        "create_template": {"method": "POST", "path": "/api/v1/templates", "auth": "bearer"},
        "get_template": {"method": "GET", "path": "/api/v1/templates/{template_id}", "auth": "bearer"},
        "preview_template": {"method": "POST", "path": "/api/v1/templates/{template_id}/preview", "auth": "bearer"},

        # --- suppressions --------------------------------------------------
        # * A reply/unsubscribe handler that cannot suppress is not a handler.
        "suppress": {"method": "POST", "path": "/api/v1/suppressions", "auth": "bearer"},
        "check_suppression": {"method": "GET", "path": "/api/v1/suppressions/check", "auth": "bearer"},

        # --- InboxKit mailbox infrastructure (admin) ------------------------
        # * Bring-your-own-domain + mailbox provisioning as orchestratable
        # * steps, so standing up sending capacity is a workflow rather than a
        # * sequence of manual curl calls. All require an admin bearer token.
        "inboxkit_status": {"method": "GET", "path": "/api/v1/admin/inboxkit/status", "auth": "bearer"},
        "inboxkit_connect_domain": {"method": "POST", "path": "/api/v1/admin/inboxkit/domain/connect", "auth": "bearer"},
        "inboxkit_domain_records": {"method": "GET", "path": "/api/v1/admin/inboxkit/domain/records", "auth": "bearer"},
        "inboxkit_verify_domain": {"method": "POST", "path": "/api/v1/admin/inboxkit/domain/verify", "auth": "bearer"},
        "inboxkit_list_domains": {"method": "GET", "path": "/api/v1/admin/inboxkit/domain/connected", "auth": "bearer"},
        "inboxkit_buy_mailboxes": {"method": "POST", "path": "/api/v1/admin/inboxkit/domain/mailboxes", "auth": "bearer"},
        "inboxkit_set_webhook": {"method": "POST", "path": "/api/v1/admin/inboxkit/webhook", "auth": "bearer"},

        # --- domains / health ----------------------------------------------
        "list_domains": {"method": "GET", "path": "/api/v1/domains", "auth": "bearer"},
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
