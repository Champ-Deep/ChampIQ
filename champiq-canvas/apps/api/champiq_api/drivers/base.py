"""Shared driver plumbing.

- HttpToolDriver is an ABC; concrete drivers declare their action map.
- ToolNodeExecutor adapts a driver to the NodeExecutor interface so the
  orchestrator can run it like any other node.

Open/Closed: new drivers subclass HttpToolDriver without touching the base.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional

import httpx

from ..core.interfaces import NodeContext, NodeExecutor, NodeResult


class HttpToolDriver(ABC):
    """Base for drivers that call an external HTTP API.

    Concrete drivers override `actions` (action_id -> spec) and may override
    `parse_webhook` to turn tool-specific webhook payloads into canonical
    {event, data} dicts.

    Each action spec:
        { "method": "POST"|"GET"|..., "path": "/..." (may contain {placeholders}),
          "auth": "bearer"|"header"|"none",
          "body": "json"|"form"|None }
    """

    tool_id: str
    actions: dict[str, dict[str, Any]] = {}

    def __init__(self, base_url: str, *, timeout: float = 30.0) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout

    # -- Public API ------------------------------------------------------

    async def invoke(
        self,
        action: str,
        inputs: dict[str, Any],
        credentials: dict[str, Any],
    ) -> dict[str, Any]:
        spec = self.actions.get(action)
        if spec is None:
            raise KeyError(f"{self.tool_id}: unknown action {action!r}")

        method = spec.get("method", "POST").upper()
        path = spec.get("path", "").format(**{k: _url_safe(v) for k, v in inputs.items() if isinstance(v, (str, int))})
        url = f"{self._base_url}{path}"
        headers = self._build_headers(spec.get("auth", "none"), credentials)

        body_kind = spec.get("body", "json" if method in {"POST", "PUT", "PATCH"} else None)
        json_payload = None
        data_payload = None
        params = None
        if method in {"GET", "DELETE"}:
            params = {k: v for k, v in inputs.items() if v is not None}
        elif body_kind == "json":
            json_payload = inputs
        elif body_kind == "form":
            data_payload = inputs

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.request(
                method, url, headers=headers, json=json_payload, data=data_payload, params=params
            )
        if response.status_code >= 400:
            raise RuntimeError(
                f"{self.tool_id}.{action} -> {response.status_code}: {response.text[:500]}"
            )
        try:
            return response.json()
        except ValueError:
            return {"raw": response.text}

    def parse_webhook(self, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
        return None

    # -- Hooks -----------------------------------------------------------

    @abstractmethod
    def _build_headers(self, auth_kind: str, credentials: dict[str, Any]) -> dict[str, str]: ...


class ToolNodeExecutor(NodeExecutor):
    """Adapts a driver + action into a canvas node executor.

    Canvas config for such a node:
        { "tool_id": "champmail", "action": "start_sequence",
          "credential": "champmail_main",
          "inputs": { ...expression-capable fields... } }
    """

    def __init__(self, driver: HttpToolDriver) -> None:
        self._driver = driver
        self.kind = driver.tool_id

    async def execute(self, ctx: NodeContext) -> NodeResult:
        action = ctx.config.get("action")
        if not action:
            raise ValueError(f"{self.kind}: node is missing 'action' in config")

        raw_inputs = ctx.config.get("inputs", {}) or {}
        rendered = ctx.render(raw_inputs)
        if not isinstance(rendered, dict):
            raise TypeError(f"{self.kind}: inputs must render to a dict, got {type(rendered).__name__}")

        # Merge the loop item fields directly into inputs so contact data
        # (phone, email, first_name, company etc.) flows through automatically
        # without needing explicit expressions in the node config.
        expr_ctx = ctx.expression_context()
        item = expr_ctx.get("item")
        if isinstance(item, dict):
            # Item fields are the base; node config inputs override them
            rendered = {**item, **rendered}

        cred_name = ctx.config.get("credential") or ""
        credentials: dict[str, Any] = {}
        if cred_name:
            try:
                credentials = await ctx.credentials.resolve(cred_name)
            except KeyError:
                # Credential name in node config doesn't match DB — fall back to
                # resolving any credential of the matching tool type.
                try:
                    credentials = await ctx.credentials.resolve_by_type(self.kind)
                except (KeyError, AttributeError):
                    pass

        result = await self._driver.invoke(action, rendered, credentials)
        return NodeResult(output={"data": result})


def _url_safe(value: Any) -> str:
    import urllib.parse

    return urllib.parse.quote(str(value), safe="")
