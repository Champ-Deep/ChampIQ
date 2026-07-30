"""ChampVoice driver — proxies to the champiq-voice gateway (ChampIQ/champiq-voice).

Consolidation note (2026-07-27): this driver used to call ElevenLabs'
`/v1/convai/twilio/outbound-call` directly, duplicating the exact same call
the standalone champiq-voice gateway already makes through its
ProviderRegistry/IVoiceProvider abstraction (src/providers/elevenlabs/client.ts)
— a real split-brain, since either implementation could fire an outbound call.
The gateway's abstraction is the more extensible design (adding a second voice
provider only means implementing IVoiceProvider), so it's now canonical: this
driver only talks to the gateway's HTTP API. ElevenLabs is called from exactly
one place in the whole system — champiq-voice/src/providers/elevenlabs/client.ts.

Credential fields (ChampIQ "champvoice" credential):
    gateway_api_key         Optional — gateway's own x-api-key/Bearer auth
                            (src/server/middleware/auth.ts; skipped if the
                            gateway has no GATEWAY_API_KEY configured)
    elevenlabs_api_key      Forwarded per-call, overrides the gateway's env default
    agent_id                Forwarded per-call as `agent_id`
    phone_number_id         Forwarded per-call as `elevenlabs_phone_number_id`

Supported actions:
    initiate_call      POST {gateway}/v1/calls, then polls GET {gateway}/v1/calls/{id}
                        until terminal (mirrors the previous synchronous-transcript
                        contract so existing canvas nodes reading {{ prev.transcript }}
                        etc. keep working unchanged)
    get_call_status    GET  {gateway}/v1/calls/{call_id}
    list_calls         GET  {gateway}/v1/calls?contact=... or ?flow=...
    cancel_call        Not supported by the gateway (ElevenLabs has no cancel API) — raises clearly
"""
from __future__ import annotations

import asyncio
from typing import Any, Optional

import httpx

from .base import HttpToolDriver


class ChampVoiceDriver(HttpToolDriver):

    tool_id = "champvoice"

    def _build_headers(self, auth_kind: str, credentials: dict[str, Any]) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        key = credentials.get("gateway_api_key") or credentials.get("api_key") or ""
        if key:
            headers["Authorization"] = f"Bearer {key}"
        return headers

    def _require_base_url(self) -> str:
        if not self._base_url:
            raise ValueError(
                "champvoice: gateway URL not configured — set CHAMPVOICE_GATEWAY_URL "
                "to the champiq-voice deployment (e.g. https://champiq-voice.up.railway.app)"
            )
        return self._base_url

    # ── Main entry point ──────────────────────────────────────────────────────

    async def invoke(
        self,
        action: str,
        inputs: dict[str, Any],
        credentials: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_base_url()
        if action == "initiate_call":
            return await self._initiate_call(inputs, credentials)
        elif action == "get_call_status":
            return await self._get_call_status(inputs, credentials)
        elif action == "list_calls":
            return await self._list_calls(inputs, credentials)
        elif action == "cancel_call":
            raise RuntimeError(
                "champvoice: the gateway does not support call cancellation "
                "(ElevenLabs has no cancel-in-flight-call API)."
            )
        else:
            raise KeyError(
                f"champvoice: unknown action {action!r}. "
                "Available: initiate_call, get_call_status, list_calls"
            )

    # ── Action implementations ────────────────────────────────────────────────

    async def _initiate_call(
        self,
        inputs: dict[str, Any],
        credentials: dict[str, Any],
    ) -> dict[str, Any]:
        """POST {gateway}/v1/calls — see champiq-voice/src/server/routes/calls.ts InitiateSchema."""
        to_number = (
            inputs.get("to_number")
            or inputs.get("phone_number")
            or inputs.get("phone")
            or ""
        )
        if to_number and not str(to_number).startswith("+"):
            to_number = f"+{to_number}"
        if not to_number:
            raise ValueError("champvoice.initiate_call: 'to_number' is required")

        dynamic_vars: dict[str, str] = {}
        for field in ("call_reason", "engagement_status", "email_opened", "email_replied", "sequence_active"):
            val = inputs.get(field)
            if val is not None:
                dynamic_vars[field] = str(val)
        if isinstance(inputs.get("dynamic_vars"), dict):
            dynamic_vars.update({str(k): str(v) for k, v in inputs["dynamic_vars"].items()})

        lead_name = inputs.get("lead_name") or inputs.get("prospect_name") or inputs.get("first_name")
        email = inputs.get("email") or inputs.get("prospect_email")
        company = inputs.get("company")

        body: dict[str, Any] = {
            "to_number": to_number,
            "lead_name": lead_name,
            "company": company,
            "email": email,
            "script": inputs.get("script"),
            "flow_id": inputs.get("flow_id"),
            "canvas_node_id": inputs.get("canvas_node_id"),
            "agent_id": inputs.get("agent_id") or credentials.get("agent_id"),
            "dynamic_vars": dynamic_vars or None,
            "elevenlabs_api_key": credentials.get("elevenlabs_api_key"),
            "elevenlabs_phone_number_id": credentials.get("phone_number_id"),
        }
        body = {k: v for k, v in body.items() if v is not None}

        headers = self._build_headers("bearer", credentials)
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(f"{self._base_url}/v1/calls", json=body, headers=headers)
        if resp.status_code >= 400:
            raise RuntimeError(
                f"champvoice.initiate_call -> gateway HTTP {resp.status_code}: {resp.text[:500]}"
            )
        started = resp.json()
        call_id = started.get("callId") or started.get("call_id")
        conversation_id = started.get("conversationId") or started.get("conversation_id")

        transcript, duration_seconds, recording_url, final_status = await self._poll_until_done(call_id, headers)

        return {
            "callId": call_id,
            "conversationId": conversation_id,
            "status": final_status,
            "phone": to_number,
            "lead_name": lead_name or "",
            "email": email or "",
            "company": company or "",
            "duration_seconds": duration_seconds,
            "recording_url": recording_url,
            "transcript": transcript,
        }

    async def _poll_until_done(
        self,
        call_id: Optional[str],
        headers: dict[str, str],
        poll_interval: float = 10.0,
        max_wait: float = 300.0,
    ) -> tuple[list[dict[str, Any]], Any, Any, str]:
        """Poll the gateway (not ElevenLabs) until the call's CallNode reaches a
        terminal status. Falls back gracefully on timeout — never raises."""
        if not call_id:
            return [], None, None, "unknown"

        elapsed = 0.0
        while elapsed < max_wait:
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    r = await client.get(f"{self._base_url}/v1/calls/{call_id}", headers=headers)
                if r.status_code != 200:
                    continue
                node = r.json()
                status = node.get("status", "")
                if status in ("completed", "failed"):
                    return (
                        node.get("transcript") or [],
                        node.get("durationSeconds"),
                        node.get("recordingUrl"),
                        status,
                    )
            except Exception:
                continue  # transient error — keep polling

        return [], None, None, "timeout"

    async def _get_call_status(
        self,
        inputs: dict[str, Any],
        credentials: dict[str, Any],
    ) -> dict[str, Any]:
        """GET {gateway}/v1/calls/{call_id}"""
        call_id = inputs.get("call_id") or inputs.get("conversation_id")
        if not call_id:
            raise ValueError("champvoice.get_call_status: 'call_id' is required")

        headers = self._build_headers("bearer", credentials)
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(f"{self._base_url}/v1/calls/{call_id}", headers=headers)

        if resp.status_code == 404:
            return {"found": False, "call_id": call_id}
        if resp.status_code >= 400:
            raise RuntimeError(
                f"champvoice.get_call_status -> gateway HTTP {resp.status_code}: {resp.text[:500]}"
            )

        node = resp.json()
        return {
            "found": True,
            "call_id": call_id,
            "conversation_id": node.get("conversationId"),
            "status": node.get("status"),
            "transcript": node.get("transcript") or [],
            "duration_seconds": node.get("durationSeconds"),
            "recording_url": node.get("recordingUrl"),
        }

    async def _list_calls(
        self,
        inputs: dict[str, Any],
        credentials: dict[str, Any],
    ) -> dict[str, Any]:
        """GET {gateway}/v1/calls?contact=<phone> or ?flow=<flowId>.

        The gateway has no agent-scoped listing (unlike the old direct-ElevenLabs
        driver) — it only supports filtering by contact phone or flow id.
        """
        contact = inputs.get("contact") or inputs.get("phone_number") or inputs.get("phone")
        flow_id = inputs.get("flow_id") or inputs.get("flow")
        if not contact and not flow_id:
            raise ValueError(
                "champvoice.list_calls: 'contact' (phone) or 'flow_id' is required — "
                "the gateway has no agent-scoped call listing"
            )
        params = {"contact": contact} if contact else {"flow": flow_id}

        headers = self._build_headers("bearer", credentials)
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(f"{self._base_url}/v1/calls", params=params, headers=headers)

        if resp.status_code >= 400:
            raise RuntimeError(
                f"champvoice.list_calls -> gateway HTTP {resp.status_code}: {resp.text[:500]}"
            )
        return resp.json()

    # ── Inbound webhook (gateway -> canvas, already canonical shape) ─────────

    def parse_webhook(self, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
        """The gateway's CanvasEmitter (src/canvas/CanvasEmitter.ts) already posts
        canonical {event, callId, flowId, canvasNodeId, timestamp, payload,
        prevContext} — no ElevenLabs-shape translation needed here anymore."""
        event = payload.get("event")
        if not event:
            return None
        return {"event": event, **{k: v for k, v in payload.items() if k != "event"}}
