"""ChampVoice driver — calls ElevenLabs Conversational AI API directly.

No separate gateway process required. Credentials come entirely from the
ChampIQ credential store (set in the sidebar).

Credential fields:
    elevenlabs_api_key      Required — ElevenLabs API key
    agent_id                Required — ElevenLabs agent ID
    phone_number_id         Required — ElevenLabs outbound phone number ID
    canvas_webhook_secret   Optional — for verifying inbound ElevenLabs webhooks

Supported actions:
    initiate_call      POST /v1/convai/twilio/outbound-call
    get_call_status    GET  /v1/convai/conversations/{conversation_id}
    list_calls         GET  /v1/convai/conversations (filtered by agent)
    cancel_call        Not supported by ElevenLabs — raises clearly
"""
from __future__ import annotations

import uuid
from typing import Any, Optional

import httpx

from .base import HttpToolDriver

EL_BASE = "https://api.elevenlabs.io/v1"


class ChampVoiceDriver(HttpToolDriver):

    tool_id = "champvoice"

    def _build_headers(self, auth_kind: str, credentials: dict[str, Any]) -> dict[str, str]:
        return {}

    # ── Credential helpers ────────────────────────────────────────────────────

    def _el_headers(self, credentials: dict[str, Any]) -> dict[str, str]:
        api_key = credentials.get("elevenlabs_api_key") or ""
        if not api_key:
            raise ValueError(
                "ChampVoice: 'elevenlabs_api_key' is required — set it in the ChampVoice credential panel."
            )
        return {"Content-Type": "application/json", "xi-api-key": api_key}

    def _resolve_agent_id(self, inputs: dict[str, Any], credentials: dict[str, Any]) -> str:
        agent_id = inputs.get("agent_id") or credentials.get("agent_id") or ""
        if not agent_id:
            raise ValueError(
                "ChampVoice: 'agent_id' is required — set it in the ChampVoice credential panel."
            )
        return agent_id

    def _resolve_phone_number_id(self, inputs: dict[str, Any], credentials: dict[str, Any]) -> str:
        phone_number_id = (
            inputs.get("phone_number_id")
            or credentials.get("phone_number_id")
            or ""
        )
        if not phone_number_id:
            raise ValueError(
                "ChampVoice: 'phone_number_id' is required — set it in the ChampVoice credential panel."
            )
        return phone_number_id

    # ── Main entry point ──────────────────────────────────────────────────────

    async def invoke(
        self,
        action: str,
        inputs: dict[str, Any],
        credentials: dict[str, Any],
    ) -> dict[str, Any]:
        if action == "initiate_call":
            return await self._initiate_call(inputs, credentials)
        elif action == "get_call_status":
            return await self._get_call_status(inputs, credentials)
        elif action == "list_calls":
            return await self._list_calls(inputs, credentials)
        elif action == "cancel_call":
            raise RuntimeError(
                "ChampVoice (ElevenLabs) does not support call cancellation via API."
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
        """POST /v1/convai/twilio/outbound-call"""
        to_number = (
            inputs.get("to_number")
            or inputs.get("phone_number")
            or inputs.get("phone")
            or ""
        )
        # Ensure E.164 format
        if to_number and not str(to_number).startswith("+"):
            to_number = f"+{to_number}"
        if not to_number:
            raise ValueError("champvoice.initiate_call: 'to_number' is required")

        headers = self._el_headers(credentials)
        agent_id = self._resolve_agent_id(inputs, credentials)
        phone_number_id = self._resolve_phone_number_id(inputs, credentials)

        # Build dynamic variables for ElevenLabs conversation
        dynamic_vars: dict[str, str] = {}

        for field in ("lead_name", "prospect_name", "company", "email",
                      "prospect_email", "script", "call_reason",
                      "engagement_status", "email_opened", "email_replied",
                      "sequence_active"):
            val = inputs.get(field)
            if val is not None:
                key = "lead_name" if field == "prospect_name" else (
                      "email" if field == "prospect_email" else field)
                dynamic_vars[key] = str(val)

        # Accept a pre-built dynamic_vars dict from canvas node
        if isinstance(inputs.get("dynamic_vars"), dict):
            dynamic_vars.update(
                {str(k): str(v) for k, v in inputs["dynamic_vars"].items()}
            )

        # Unique lead ID for tracking
        dynamic_vars.setdefault("leadId", f"lead_{uuid.uuid4().hex[:12]}")

        body: dict[str, Any] = {
            "agent_id": agent_id,
            "agent_phone_number_id": phone_number_id,
            "to_number": to_number,
            "conversation_initiation_client_data": {
                "type": "conversation_initiation_client_data",
                "dynamic_variables": dynamic_vars,
            },
        }

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{EL_BASE}/convai/twilio/outbound-call",
                json=body,
                headers=headers,
            )

        if resp.status_code >= 400:
            raise RuntimeError(
                f"champvoice.initiate_call → ElevenLabs HTTP {resp.status_code}: {resp.text[:500]}"
            )

        data = resp.json()
        conversation_id = data.get("conversation_id")
        call_id = dynamic_vars["leadId"]

        # Poll until call completes then return full transcript
        transcript, duration_seconds, recording_url, final_status = \
            await self._poll_until_done(conversation_id, headers)

        return {
            "callId": call_id,
            "conversationId": conversation_id,
            "status": final_status,
            "phone": to_number,
            "lead_name": dynamic_vars.get("lead_name") or dynamic_vars.get("first_name", ""),
            "email": dynamic_vars.get("email", ""),
            "company": dynamic_vars.get("company", ""),
            "duration_seconds": duration_seconds,
            "recording_url": recording_url,
            "transcript": transcript,
        }

    async def _poll_until_done(
        self,
        conversation_id: str,
        headers: dict[str, str],
        poll_interval: float = 10.0,
        max_wait: float = 300.0,
    ) -> tuple[list[dict[str, Any]], Any, Any, str]:
        """Poll ElevenLabs until conversation status is 'done' or 'failed'.

        Returns (transcript, duration_seconds, recording_url, status).
        Falls back gracefully on timeout — never raises.
        """
        import asyncio

        elapsed = 0.0
        while elapsed < max_wait:
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    r = await client.get(
                        f"{EL_BASE}/convai/conversations/{conversation_id}",
                        headers=headers,
                    )
                if r.status_code != 200:
                    continue
                d = r.json()
                # Terminal states — ElevenLabs uses: done, failed, no_answer, voicemail
                # Anything that is not "in_progress" or "initiated" is terminal
                call_status = d.get("status", "")
                is_terminal = call_status not in ("in_progress", "in-progress", "initiated", "processing", "")
                if is_terminal:
                    transcript = [
                        {
                            "speaker": "agent" if t.get("role") == "agent" else "user",
                            "text": t.get("message", ""),
                            "time_in_call_secs": t.get("time_in_call_secs", 0),
                        }
                        for t in d.get("transcript", [])
                        if t.get("message") and t.get("message") != "None"
                    ]
                    metadata = d.get("metadata") or {}
                    final = "completed" if call_status == "done" else call_status
                    return (
                        transcript,
                        metadata.get("call_duration_secs"),
                        metadata.get("recording_url"),
                        final,
                    )
            except Exception:
                continue  # transient error — keep polling

        # Timeout — return empty transcript, don't fail the node
        return [], None, None, "timeout"

    async def _get_call_status(
        self,
        inputs: dict[str, Any],
        credentials: dict[str, Any],
    ) -> dict[str, Any]:
        """GET /v1/convai/conversations/{conversation_id}"""
        conversation_id = inputs.get("conversation_id") or inputs.get("call_id")
        if not conversation_id:
            raise ValueError("champvoice.get_call_status: 'conversation_id' is required")

        headers = self._el_headers(credentials)

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(
                f"{EL_BASE}/convai/conversations/{conversation_id}",
                headers=headers,
            )

        if resp.status_code == 404:
            return {"found": False, "conversation_id": conversation_id}
        if resp.status_code >= 400:
            raise RuntimeError(
                f"champvoice.get_call_status → ElevenLabs HTTP {resp.status_code}: {resp.text[:500]}"
            )

        data = resp.json()
        transcript = [
            {
                "speaker": "agent" if t.get("role") == "agent" else "lead",
                "text": t.get("message", ""),
                "time_in_call_secs": t.get("time_in_call_secs", 0),
            }
            for t in data.get("transcript", [])
        ]

        return {
            "found": True,
            "conversation_id": conversation_id,
            "status": data.get("status"),
            "transcript": transcript,
            "duration_seconds": data.get("metadata", {}).get("call_duration_secs"),
            "recording_url": data.get("metadata", {}).get("recording_url"),
        }

    async def _list_calls(
        self,
        inputs: dict[str, Any],
        credentials: dict[str, Any],
    ) -> dict[str, Any]:
        """GET /v1/convai/conversations?agent_id=..."""
        headers = self._el_headers(credentials)
        agent_id = credentials.get("agent_id") or inputs.get("agent_id")

        params: dict[str, str] = {}
        if agent_id:
            params["agent_id"] = agent_id

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(
                f"{EL_BASE}/convai/conversations",
                params=params,
                headers=headers,
            )

        if resp.status_code >= 400:
            raise RuntimeError(
                f"champvoice.list_calls → ElevenLabs HTTP {resp.status_code}: {resp.text[:500]}"
            )
        return resp.json()

    # ── Inbound webhook from ElevenLabs post-call ─────────────────────────────

    def parse_webhook(self, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
        """
        Normalize ElevenLabs post-call webhook payload.

        ElevenLabs sends:
          {
            type: "post_call_transcription",
            event_timestamp: <unix>,
            data: {
              conversation_id, agent_id, status,
              transcript: [{role, message, time_in_call_secs}],
              metadata: { call_duration_secs, recording_url },
              analysis: { data_collection_results }
            }
          }
        """
        event_type = payload.get("type", "")
        data: dict[str, Any] = payload.get("data") or {}

        if not event_type or not data:
            return None

        # Map ElevenLabs event types to ChampIQ canonical events
        event_map = {
            "post_call_transcription": "transcript.ready",
            "conversation_completed":  "call.completed",
            "conversation_failed":     "call.failed",
        }
        canonical_event = event_map.get(event_type, event_type)

        transcript = [
            {
                "speaker": "agent" if t.get("role") == "agent" else "lead",
                "text": t.get("message", ""),
                "time_in_call_secs": t.get("time_in_call_secs", 0),
            }
            for t in data.get("transcript", [])
        ]

        metadata = data.get("metadata") or {}
        analysis = data.get("analysis") or {}
        collection = analysis.get("data_collection_results") or {}
        outcome = (collection.get("outcome") or {}).get("value")

        return {
            "event":            canonical_event,
            "conversation_id":  data.get("conversation_id"),
            "agent_id":         data.get("agent_id"),
            "status":           data.get("status"),
            "outcome":          outcome,
            "duration_seconds": metadata.get("call_duration_secs"),
            "recording_url":    metadata.get("recording_url"),
            "transcript":       transcript,
            "timestamp":        payload.get("event_timestamp"),
            "data":             data,
        }
