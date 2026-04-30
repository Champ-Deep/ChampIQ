"""Emelia transport — REST API, campaign-per-send model.

Why per-send campaigns?
    Emelia has no transactional `sendCustomEmail` API. Sending requires a
    campaign with at least one step and one contact, then `start`. We mirror
    "send one email" by creating a tiny single-step single-contact campaign,
    naming it `champiq:<tracking_id>` so we can correlate webhooks back to
    our send row, and starting it. Emelia's own scheduler then dispatches
    within the campaign's send window (default 08:00–17:00 Europe/Brussels).

Auth: raw API key in `Authorization` header (no `Bearer` prefix).

Cost trade-off: we leave finished campaigns in Emelia rather than deleting —
deleting after `start` is racy (Emelia may not have read the contact yet).
A periodic janitor can prune `champiq:*` campaigns older than N days; not
implemented in v1.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from .base import EmailEnvelope, SendResult

log = logging.getLogger(__name__)

EMELIA_REST_URL = "https://api.emelia.io"


class EmeliaTransport:
    name = "emelia"

    def __init__(self, api_key: str, timeout: float = 30.0) -> None:
        if not api_key:
            raise ValueError("EmeliaTransport: api_key is required")
        self._api_key = api_key
        self._timeout = timeout

    def _headers(self) -> dict[str, str]:
        return {"Authorization": self._api_key, "Content-Type": "application/json"}

    async def send(self, envelope: EmailEnvelope, *, sender_id: str) -> SendResult:
        """Bootstrap a single-step campaign, add the contact, start it.

        `sender_id` is the Emelia provider `_id` (the email account UUID).
        `envelope.tracking_id` (our send row id) is encoded in the campaign
        name so webhook ingestion can reverse-look-up the send row by name
        if the messageId is missing.
        """
        if not envelope.to_email:
            return SendResult(success=False, error="EmeliaTransport: to_email is empty")

        campaign_name = f"champiq:{envelope.tracking_id or 'oneoff'}-{abs(hash(envelope.to_email)) % 10**8}"

        async with httpx.AsyncClient(timeout=self._timeout, headers=self._headers()) as client:
            # 1. Create the campaign
            try:
                r = await client.post(
                    f"{EMELIA_REST_URL}/emails/campaigns",
                    json={"name": campaign_name, "provider": sender_id},
                )
            except httpx.HTTPError as e:
                return SendResult(success=False, error=f"Emelia create-campaign HTTP error: {e}")
            if not _ok(r):
                return SendResult(success=False, error=_err(r, "create-campaign"))
            campaign = ((r.json() or {}).get("campaign")) or {}
            campaign_id = campaign.get("_id")
            if not campaign_id:
                return SendResult(
                    success=False,
                    error=f"Emelia create-campaign returned no _id: {r.text[:300]}",
                )

            # 2. Set the single step (subject + body)
            steps_payload = {
                "steps": [
                    {
                        "delay": {"amount": 0, "unit": "DAYS"},
                        "versions": [
                            {
                                "subject": envelope.subject,
                                "message": envelope.body_html,
                            }
                        ],
                    }
                ]
            }
            try:
                r = await client.patch(
                    f"{EMELIA_REST_URL}/emails/campaigns/{campaign_id}/steps",
                    json=steps_payload,
                )
            except httpx.HTTPError as e:
                return SendResult(success=False, error=f"Emelia patch-steps HTTP error: {e}")
            if not _ok(r):
                return SendResult(success=False, error=_err(r, "patch-steps"))

            # 3. Add the contact. The id field is literally `id` (not campaignId).
            contact: dict[str, Any] = {"email": envelope.to_email}
            if envelope.to_name:
                contact["firstName"] = envelope.to_name
            try:
                r = await client.post(
                    f"{EMELIA_REST_URL}/emails/campaign/contacts",
                    json={"id": campaign_id, "contact": contact},
                )
            except httpx.HTTPError as e:
                return SendResult(success=False, error=f"Emelia add-contact HTTP error: {e}")
            if not _ok(r):
                return SendResult(success=False, error=_err(r, "add-contact"))

            # 4. Start the campaign
            try:
                r = await client.post(f"{EMELIA_REST_URL}/emails/campaigns/{campaign_id}/start")
            except httpx.HTTPError as e:
                return SendResult(success=False, error=f"Emelia start HTTP error: {e}")
            if not _ok(r):
                return SendResult(success=False, error=_err(r, "start"))

        # Emelia's own message-id isn't returned synchronously — it surfaces
        # later via webhooks. We use the campaign id as our provider reference;
        # webhook ingestion correlates by tracking_id (campaign name).
        return SendResult(success=True, provider_message_id=campaign_id)

    async def verify(self) -> bool:
        """Lightweight credential check — list campaigns."""
        try:
            async with httpx.AsyncClient(timeout=10.0, headers=self._headers()) as client:
                r = await client.get(f"{EMELIA_REST_URL}/emails/campaigns")
            return r.status_code == 200 and (r.json() or {}).get("success") is True
        except Exception as e:
            log.warning("Emelia verify failed: %s", e)
            return False


def _ok(r: httpx.Response) -> bool:
    if r.status_code >= 400:
        return False
    try:
        return (r.json() or {}).get("success") is True
    except ValueError:
        return False


def _err(r: httpx.Response, op: str) -> str:
    try:
        body = r.json()
        msg = body.get("error") or body
    except ValueError:
        msg = r.text[:300]
    return f"Emelia {op} -> HTTP {r.status_code}: {msg}"
