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

        # Body routing:
        #   GET/DELETE  + dict body → query params
        #   POST/PUT/PATCH + dict/list body → JSON
        #   POST/PUT/PATCH + str body → raw bytes (Content-Type left to user;
        #     defaults to text/plain via httpx if not set in `headers`).
        # Strings used to be silently dropped here, which made it impossible to
        # send raw text (JWTs, GraphQL queries, base64 payloads) without a hack.
        send_kwargs: dict[str, Any] = {}
        if method in {"POST", "PUT", "PATCH"}:
            if isinstance(body, (dict, list)):
                send_kwargs["json"] = body
            elif isinstance(body, str):
                send_kwargs["content"] = body
        elif method in {"GET", "DELETE"} and isinstance(body, dict):
            send_kwargs["params"] = body

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.request(
                method,
                str(url),
                headers=headers,
                **send_kwargs,
            )

        output: dict[str, Any] = {"status": resp.status_code}
        try:
            output["data"] = resp.json()
        except ValueError:
            output["data"] = resp.text
        if resp.status_code >= 400:
            raise RuntimeError(f"HTTP {resp.status_code}: {str(output['data'])[:500]}")
        return NodeResult(output=output)
