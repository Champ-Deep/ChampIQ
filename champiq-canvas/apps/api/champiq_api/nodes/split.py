"""Split node — fans an array out into N named branches for A/B testing or parallel dispatch."""
from __future__ import annotations

from typing import Any

from ..core.interfaces import NodeContext, NodeExecutor, NodeResult


class SplitExecutor(NodeExecutor):
    """Config options:
    - mode: "fixed_n"  → split items evenly into N branches (branch_0, branch_1, ..., branch_N-1)
    - mode: "fan_out"  → duplicate full item list into N parallel branches
    - n: number of branches (default 2)
    """

    kind = "split"

    async def execute(self, ctx: NodeContext) -> NodeResult:
        mode = ctx.config.get("mode", "fixed_n")
        n = max(int(ctx.config.get("n", 2)), 2)

        items = ctx.render(ctx.config.get("items", ctx.input.get("items", [])))
        if not isinstance(items, list):
            items = list(items) if hasattr(items, "__iter__") else [items]

        branches: list[str] = [f"branch_{i}" for i in range(n)]
        output: dict[str, Any] = {"n": n, "mode": mode}

        if mode == "fan_out":
            # Each branch receives the full list (for parallel independent processing).
            for i, branch in enumerate(branches):
                output[branch] = items
        else:
            # fixed_n: distribute items round-robin across branches.
            buckets: list[list[Any]] = [[] for _ in range(n)]
            for idx, item in enumerate(items):
                buckets[idx % n].append(item)
            for i, branch in enumerate(branches):
                output[branch] = buckets[i]

        return NodeResult(output=output, branches=branches)
