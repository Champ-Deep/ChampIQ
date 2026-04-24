"""Control-flow nodes: If, Switch, Set, Merge."""
from __future__ import annotations

from typing import Any

from ..core.interfaces import NodeContext, NodeExecutor, NodeResult


class IfExecutor(NodeExecutor):
    kind = "if"

    async def execute(self, ctx: NodeContext) -> NodeResult:
        condition = ctx.config.get("condition", "false")
        truthy = bool(ctx.render(f"{{{{ {condition} }}}}")) if isinstance(condition, str) else bool(condition)
        branch = "true" if truthy else "false"
        return NodeResult(output={"matched": branch, "value": truthy}, branches=[branch])


class SwitchExecutor(NodeExecutor):
    kind = "switch"

    async def execute(self, ctx: NodeContext) -> NodeResult:
        """Config:
        { "value": "{{ prev.status }}",
          "cases": [{"match": "positive", "branch": "positive"}, ...],
          "default_branch": "other" }
        """
        rendered_value = ctx.render(ctx.config.get("value"))
        cases: list[dict[str, Any]] = ctx.config.get("cases", []) or []
        for case in cases:
            if rendered_value == case.get("match"):
                return NodeResult(
                    output={"matched": case.get("branch"), "value": rendered_value},
                    branches=[case["branch"]],
                )
        default_branch = ctx.config.get("default_branch", "default")
        return NodeResult(
            output={"matched": default_branch, "value": rendered_value},
            branches=[default_branch],
        )


class SetExecutor(NodeExecutor):
    """Emits a computed object. Everything in config.fields is rendered."""

    kind = "set"

    async def execute(self, ctx: NodeContext) -> NodeResult:
        fields = ctx.config.get("fields", {}) or {}
        rendered = ctx.render(fields)
        if not isinstance(rendered, dict):
            rendered = {"value": rendered}
        return NodeResult(output=rendered)


class MergeExecutor(NodeExecutor):
    """Joins multiple upstream outputs into one dict under `merged`."""

    kind = "merge"

    async def execute(self, ctx: NodeContext) -> NodeResult:
        merged: dict[str, Any] = {}
        for node_id, payload in ctx.upstream.items():
            merged[node_id] = payload.get("output", {})
        return NodeResult(output={"merged": merged})
