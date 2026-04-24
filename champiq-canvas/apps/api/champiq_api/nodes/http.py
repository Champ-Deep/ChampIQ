"""Generic HTTP node — lets users call any REST endpoint without a driver.

This is what puts ChampIQ on par with n8n: any third-party service with a REST
API becomes a node without writing Python.
"""
from __future__ import annotations

from typing import Any

import httpx

from ..core.interfaces import NodeContext, NodeExecutor, NodeResult


class HttpExecutor(NodeExecutor):
    kind = "http"

    async def execute(self, ctx: NodeContext) -> NodeResult:
        method = str(ctx.render(ctx.config.get("method", "GET"))).upper()
        url = ctx.render(ctx.config.get("url", ""))
        if not url:
            raise ValueError("http node requires `url`")
        headers = ctx.render(ctx.config.get("headers", {})) or {}
        body = ctx.render(ctx.config.get("body"))
        timeout = float(ctx.config.get("timeout", 30))

        cred_name = ctx.config.get("credential") or ""
        if cred_name:
            creds = await ctx.credentials.resolve(cred_name)
            if creds.get("api_token"):
                headers.setdefault("Authorization", f"Bearer {creds['api_token']}")
            elif creds.get("api_key"):
                headers.setdefault("X-API-Key", creds["api_key"])

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.request(
                method,
                str(url),
                headers=headers,
                json=body if method in {"POST", "PUT", "PATCH"} and isinstance(body, (dict, list)) else None,
                params=body if method in {"GET", "DELETE"} and isinstance(body, dict) else None,
            )

        output: dict[str, Any] = {"status": resp.status_code}
        try:
            output["data"] = resp.json()
        except ValueError:
            output["data"] = resp.text
        if resp.status_code >= 400:
            raise RuntimeError(f"HTTP {resp.status_code}: {str(output['data'])[:500]}")
        return NodeResult(output=output)
