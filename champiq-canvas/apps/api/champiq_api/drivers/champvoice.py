"""ChampVoice driver — routes canvas calls to the champiq-voice Express gateway.

The champiq-voice gateway (Voice-Qualified-Template-main) is a separate Express
process that holds ElevenLabs credentials. The canvas never touches ElevenLabs
directly; it calls the gateway's REST API (/v1/calls, /v1/calls/{id}).

Auth model — the gateway uses:
  - X-Api-Key header (optional, matches gateway.api_key setting in champiq-voice config)
  - NO email/password JWT — the gateway itself owns the ElevenLabs API key

Credential fields expected from the ChampIQ credential store:
    gateway_url             Required — e.g. https://your-gateway.railway.app
    api_key                 Optional — X-Api-Key for the gateway
    elevenlabs_api_key      Required — forwarded per-call; no env var needed on gateway
    agent_id                Optional default — ElevenLabs agent ID
                            Can be overridden per-call via inputs["agent_id"]
    phone_number_id         Required — ElevenLabs outbound phone number ID; forwarded per-call
    canvas_webhook_secret   Optional — for verifying inbound call events

Agent IDs can differ per call: different agents for cold outreach vs. follow-up
vs. qualification flows. Pass agent_id in the node's inputs to override the
credential-level default. If neither is set, the gateway falls back to its own
configured elevenlabs.agent_id.

Supported actions:
    initiate_call      POST /v1/calls
    get_call_status    GET  /v1/calls/{call_id}
    list_calls         GET  /v1/calls?contact=<phone>&flow=<flow_id>
    cancel_call        ElevenLabs does not support cancellation — raises clearly
"""
from __future__ import annotations

import urllib.parse
from typing import Any, Optional

import httpx

from .base import HttpToolDriver


class ChampVoiceDriver(HttpToolDriver):
    """
    Overrides HttpToolDriver.invoke completely.

    The base URL constructor arg is kept for compatibility with ToolNodeExecutor /
    container.py, but the actual gateway URL is resolved from the credential
    store at call time (credentials["gateway_url"]), with the constructor arg as
    a fallback for local dev.
    """

    tool_id = "champvoice"

    # Not used — we override invoke() entirely, but keep for ABC compliance
    def _build_headers(self, auth_kind: str, credentials: dict[str, Any]) -> dict[str, str]:
        return {}

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _gateway_headers(self, credentials: dict[str, Any]) -> dict[str, str]:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        api_key = (
            credentials.get("api_key")
            or credentials.get("gateway_api_key")
        )
        if api_key:
            headers["X-Api-Key"] = api_key
        return headers

    def _resolve_gateway(self, credentials: dict[str, Any]) -> str:
        return (
            credentials.get("gateway_url")
            or self._base_url
        ).rstrip("/")

    # ── Main entry point ──────────────────────────────────────────────────────

    async def invoke(
        self,
        action: str,
        inputs: dict[str, Any],
        credentials: dict[str, Any],
    ) -> dict[str, Any]:
        gateway = self._resolve_gateway(credentials)
        headers = self._gateway_headers(credentials)

        if action == "initiate_call":
            return await self._initiate_call(gateway, headers, inputs, credentials)
        elif action == "get_call_status":
            return await self._get_call_status(gateway, headers, inputs)
        elif action == "list_calls":
            return await self._list_calls(gateway, headers, inputs)
        elif action == "cancel_call":
            raise RuntimeError(
                "ChampVoice (ElevenLabs) does not support call cancellation via API. "
                "Use get_call_status to monitor in-flight calls."
            )
        else:
            raise KeyError(
                f"champvoice: unknown action {action!r}. "
                "Available: initiate_call, get_call_status, list_calls, cancel_call"
            )

    # ── Action implementations ────────────────────────────────────────────────

    async def _initiate_call(
        self,
        gateway: str,
        headers: dict[str, str],
        inputs: dict[str, Any],
        credentials: dict[str, Any],
    ) -> dict[str, Any]:
        """
        POST /v1/calls

        agent_id resolution (highest priority first):
          1. inputs["agent_id"]      — per-call override from canvas node config
          2. credentials["agent_id"] — credential-level default (set in sidebar)
          3. omitted                 — gateway uses its own ElevenLabs config

        The gateway expects this shape (from routes/calls.ts InitiateSchema):
          {
            to_number, lead_name, company, email,
            script, flow_id, canvas_node_id,
            provider, agent_id,
            dynamic_vars: Record<string, string>
          }
        """
        payload: dict[str, Any] = {}

        # Required: destination phone number
        to_number = (
            inputs.get("to_number")
            or inputs.get("phone_number")
            or ""
        )
        if not to_number:
            raise ValueError("champvoice.initiate_call: 'to_number' is required")
        payload["to_number"] = to_number

        # Contact info
        if lead_name := (inputs.get("lead_name") or inputs.get("prospect_name") or ""):
            payload["lead_name"] = lead_name
        if company := inputs.get("company", ""):
            payload["company"] = company
        if email := (inputs.get("email") or inputs.get("prospect_email") or ""):
            payload["email"] = email

        # Agent ID: per-call > credential default > omit
        agent_id = inputs.get("agent_id") or credentials.get("agent_id")
        if agent_id:
            payload["agent_id"] = agent_id

        # Per-call ElevenLabs credential overrides — forwarded from Canvas credential store
        # so the gateway never needs ELEVENLABS_API_KEY / ELEVENLABS_PHONE_NUMBER_ID env vars
        el_api_key = credentials.get("elevenlabs_api_key")
        if el_api_key:
            payload["elevenlabs_api_key"] = el_api_key

        el_phone_id = (
            inputs.get("phone_number_id")
            or credentials.get("phone_number_id")
        )
        if el_phone_id:
            payload["elevenlabs_phone_number_id"] = el_phone_id

        # Optional linking fields
        if script := inputs.get("script"):
            payload["script"] = script
        if flow_id := inputs.get("flow_id"):
            payload["flow_id"] = flow_id
        if canvas_node_id := inputs.get("canvas_node_id"):
            payload["canvas_node_id"] = canvas_node_id

        # dynamic_vars: surfaced engagement data + user-supplied vars
        # The gateway embeds these as ElevenLabs conversation dynamic variables
        dynamic_vars: dict[str, str] = {}

        # Accept a pre-built dict from the canvas
        if isinstance(inputs.get("dynamic_vars"), dict):
            dynamic_vars.update(
                {str(k): str(v) for k, v in inputs["dynamic_vars"].items()}
            )

        # Convenience: lift top-level engagement fields into dynamic_vars
        for field in ("engagement_status", "call_reason", "email_opened",
                      "email_replied", "sequence_active"):
            if inputs.get(field) is not None:
                dynamic_vars[field] = str(inputs[field])

        if dynamic_vars:
            payload["dynamic_vars"] = dynamic_vars

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{gateway}/v1/calls",
                json=payload,
                headers=headers,
            )

        if resp.status_code >= 400:
            raise RuntimeError(
                f"champvoice.initiate_call → HTTP {resp.status_code}: {resp.text[:500]}"
            )
        return resp.json()  # { callId, conversationId, status }

    async def _get_call_status(
        self,
        gateway: str,
        headers: dict[str, str],
        inputs: dict[str, Any],
    ) -> dict[str, Any]:
        """GET /v1/calls/{call_id}"""
        call_id = inputs.get("call_id") or inputs.get("callId")
        if not call_id:
            raise ValueError("champvoice.get_call_status: 'call_id' is required")

        safe_id = urllib.parse.quote(str(call_id), safe="")
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(
                f"{gateway}/v1/calls/{safe_id}",
                headers=headers,
            )

        if resp.status_code == 404:
            return {"found": False, "call_id": call_id}
        if resp.status_code >= 400:
            raise RuntimeError(
                f"champvoice.get_call_status → HTTP {resp.status_code}: {resp.text[:500]}"
            )
        return resp.json()  # full CallNode

    async def _list_calls(
        self,
        gateway: str,
        headers: dict[str, str],
        inputs: dict[str, Any],
    ) -> dict[str, Any]:
        """GET /v1/calls?contact=<phone>&flow=<flow_id>"""
        params: dict[str, str] = {}
        if contact := (inputs.get("contact") or inputs.get("phone_number")):
            params["contact"] = str(contact)
        if flow_id := inputs.get("flow_id"):
            params["flow"] = str(flow_id)

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(
                f"{gateway}/v1/calls",
                params=params,
                headers=headers,
            )

        if resp.status_code >= 400:
            raise RuntimeError(
                f"champvoice.list_calls → HTTP {resp.status_code}: {resp.text[:500]}"
            )
        return resp.json()  # { calls: CallNode[] }

    # ── Inbound webhook from champiq-voice gateway CanvasEmitter ─────────────

    def parse_webhook(self, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
        """
        Normalize inbound events emitted by the champiq-voice CanvasEmitter.

        Gateway emits events shaped as:
          {
            event: "call.initiated" | "call.completed" | "call.failed" | "transcript.ready",
            callId, flowId, canvasNodeId, timestamp,
            payload: CallNode,
            prevContext?: CallNode
          }
        Headers include X-Champiq-Signature (HMAC-SHA256) if webhook_secret is configured.
        """
        event = payload.get("event") or payload.get("type")
        if not event:
            return None

        # Normalize any legacy snake_case variants
        canonical_map = {
            "call_initiated":   "call.initiated",
            "call_completed":   "call.completed",
            "call_failed":      "call.failed",
            "transcript_ready": "transcript.ready",
        }
        canonical_event = canonical_map.get(str(event), str(event))

        call_node: dict[str, Any] = payload.get("payload") or {}

        return {
            "event":            canonical_event,
            "call_id":          payload.get("callId") or call_node.get("callId"),
            "flow_id":          payload.get("flowId") or call_node.get("flowId"),
            "canvas_node_id":   payload.get("canvasNodeId") or call_node.get("canvasNodeId"),
            "timestamp":        payload.get("timestamp"),
            # CallNode fields surfaced for downstream Switch/If routing
            "status":           call_node.get("status"),
            "outcome":          call_node.get("outcome"),          # qualified / not_qualified / callback / voicemail / no_answer
            "duration_seconds": call_node.get("durationSeconds"),
            "recording_url":    call_node.get("recordingUrl"),
            "transcript":       call_node.get("transcript", []),
            "lead_name":        call_node.get("leadName"),
            "company":          call_node.get("company"),
            "email":            call_node.get("email"),
            "agent_id":         call_node.get("agentId"),
            "prev_context":     payload.get("prevContext"),
            "data":             call_node,
        }
