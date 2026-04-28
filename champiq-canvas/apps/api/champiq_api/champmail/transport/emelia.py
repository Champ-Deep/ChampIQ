"""Emelia transport — calls the Emelia GraphQL API.

Auth header is the API key directly (no "Bearer" prefix). The send mutation
used here is the *transactional* one (sendCustomEmail) so we own cadence
locally — we don't rely on Emelia's own campaign sequencing.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from .base import EmailEnvelope, MailTransport, SendResult

log = logging.getLogger(__name__)

EMELIA_GRAPHQL_URL = "https://graphql.emelia.io/graphql"


# The exact mutation field name varies between Emelia API versions. We send the
# most common shape and fall back if the server rejects it.
_SEND_MUTATION = """
mutation sendCustomEmail($input: SendCustomEmailInput!) {
  sendCustomEmail(input: $input) {
    success
    messageId
    error
  }
}
"""


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
        payload = {
            "senderId": sender_id,
            "to": envelope.to_email,
            "subject": envelope.subject,
            "html": envelope.body_html,
        }
        if envelope.body_text:
            payload["text"] = envelope.body_text
        if envelope.from_email:
            payload["fromEmail"] = envelope.from_email
        if envelope.from_name:
            payload["fromName"] = envelope.from_name
        if envelope.reply_to:
            payload["replyTo"] = envelope.reply_to
        if envelope.tracking_id:
            payload["customId"] = envelope.tracking_id
        if envelope.custom_headers:
            payload["headers"] = envelope.custom_headers

        body = {"query": _SEND_MUTATION, "variables": {"input": payload}}

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(EMELIA_GRAPHQL_URL, json=body, headers=self._headers())
        except httpx.HTTPError as e:
            return SendResult(success=False, error=f"Emelia transport HTTP error: {e}")

        if resp.status_code >= 400:
            return SendResult(
                success=False,
                error=f"Emelia HTTP {resp.status_code}: {resp.text[:300]}",
            )

        try:
            data = resp.json()
        except ValueError:
            return SendResult(success=False, error=f"Emelia returned non-JSON: {resp.text[:200]}")

        if data.get("errors"):
            return SendResult(success=False, error=f"Emelia GraphQL errors: {data['errors']}", raw_response=data)

        result = (data.get("data") or {}).get("sendCustomEmail") or {}
        if not result.get("success", True):
            return SendResult(
                success=False,
                error=result.get("error") or "Emelia returned success=false",
                raw_response=data,
            )
        return SendResult(
            success=True,
            provider_message_id=result.get("messageId"),
            raw_response=data,
        )

    async def verify(self) -> bool:
        """Simple campaigns-list query as a credentials check."""
        body = {"query": "{ campaigns { _id name } }"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.post(EMELIA_GRAPHQL_URL, json=body, headers=self._headers())
            return r.status_code == 200 and "errors" not in (r.json() or {})
        except Exception as e:
            log.warning("Emelia verify failed: %s", e)
            return False
