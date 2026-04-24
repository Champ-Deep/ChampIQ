"""Flow nodes: Loop, Wait."""
from __future__ import annotations

import asyncio
from typing import Any

from ..core.interfaces import NodeContext, NodeExecutor, NodeResult


class LoopExecutor(NodeExecutor):
    """Iterates over an array and passes each item to downstream nodes.

    Config fields:
        items           expression resolving to a list  (required)
        concurrency     parallel items at once          (default: 1)
        each            per-item expression template    (optional)

    The orchestrator's fan-out mechanism picks up the output items list
    and runs downstream nodes once per item, injecting item + index into
    the expression context so {{ item.phone }}, {{ item.email }} etc. work.

    With concurrency=1 (default), downstream nodes run sequentially —
    one item fully completes before the next starts.
    """

    kind = "loop"

    async def execute(self, ctx: NodeContext) -> NodeResult:
        items = ctx.render(ctx.config.get("items", []))

        # If no items expression configured, auto-detect from upstream input.
        # Handles the case where the loop node has empty config ({}) but the
        # trigger passed payload.items from a CSV upload.
        if not items and isinstance(ctx.input, dict):
            payload = ctx.input.get("payload") or {}
            if isinstance(payload, dict) and isinstance(payload.get("items"), list):
                items = payload["items"]
            elif isinstance(ctx.input.get("items"), list):
                items = ctx.input["items"]

        if not isinstance(items, list):
            raise TypeError("loop.items must render to a list")

        concurrency = int(ctx.config.get("concurrency", 1))
        template = ctx.config.get("each", {}) or {}

        def _make_sub_ctx(item: Any, index: int) -> dict[str, Any]:
            sub = dict(ctx.expression_context())
            sub["item"] = item
            sub["index"] = index
            sub["prev"] = {"item": item, "index": index, **(ctx.input or {})}
            return sub

        async def _render_one(item: Any, index: int) -> dict[str, Any]:
            sub_ctx = _make_sub_ctx(item, index)
            if template:
                rendered = ctx.expressions.evaluate(template, sub_ctx)
                base = rendered if isinstance(rendered, dict) else {"value": rendered}
            else:
                base = {}
            # Always include the raw item fields so {{ item.* }} works downstream
            return {"_item": item, "_index": index, **base}

        sem = asyncio.Semaphore(max(concurrency, 1))

        async def _guarded(item: Any, index: int) -> dict[str, Any]:
            async with sem:
                return await _render_one(item, index)

        results = await asyncio.gather(
            *[_guarded(item, i) for i, item in enumerate(items)]
        )

        return NodeResult(output={"items": results, "count": len(results)})


class WaitExecutor(NodeExecutor):
    kind = "wait"

    async def execute(self, ctx: NodeContext) -> NodeResult:
        seconds = int(ctx.render(ctx.config.get("seconds", 0)) or 0)
        if seconds > 0:
            await asyncio.sleep(min(seconds, 3600))
        return NodeResult(output={"waited": seconds})
