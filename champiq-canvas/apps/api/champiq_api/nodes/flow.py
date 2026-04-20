"""Flow nodes: Loop, Wait."""
from __future__ import annotations

import asyncio
from typing import Any

from ..core.interfaces import NodeContext, NodeExecutor, NodeResult


class LoopExecutor(NodeExecutor):
    """Iterates over an array, invoking a sub-workflow named by `sub` per item.

    For now, keeps the loop inline: emits an output with per-item results.
    Sub-workflow dispatch can be added by injecting the orchestrator.
    """

    kind = "loop"

    async def execute(self, ctx: NodeContext) -> NodeResult:
        items = ctx.render(ctx.config.get("items", []))
        if not isinstance(items, list):
            raise TypeError("loop.items must render to a list")

        concurrency = int(ctx.config.get("concurrency", 1))
        template = ctx.config.get("each", {}) or {}

        async def _one(item: Any, index: int) -> dict[str, Any]:
            # Expose `item`/`index` to expressions via the `prev` namespace.
            sub_ctx = dict(ctx.expression_context())
            sub_ctx["prev"] = {"item": item, "index": index, **(ctx.input or {})}
            rendered = ctx.expressions.evaluate(template, sub_ctx)
            return rendered if isinstance(rendered, dict) else {"value": rendered}

        sem = asyncio.Semaphore(max(concurrency, 1))

        async def _guard(item: Any, index: int) -> dict[str, Any]:
            async with sem:
                return await _one(item, index)

        results = await asyncio.gather(*[_guard(item, i) for i, item in enumerate(items)])
        return NodeResult(output={"items": results, "count": len(results)})


class WaitExecutor(NodeExecutor):
    kind = "wait"

    async def execute(self, ctx: NodeContext) -> NodeResult:
        seconds = int(ctx.render(ctx.config.get("seconds", 0)) or 0)
        if seconds > 0:
            await asyncio.sleep(min(seconds, 3600))  # cap at 1h per node
        return NodeResult(output={"waited": seconds})
