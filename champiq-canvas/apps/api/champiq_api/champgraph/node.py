"""Canvas executor for `kind: champgraph` — delegates to ChampGraphService.

Mirrors the ChampmailLocalExecutor shape so workflows authored against the
old HTTP-based ChampGraphDriver keep working. Same node config schema:

    { "action": "<action_id>",
      "credential": "<unused — kept for backwards compat>",
      "inputs": { ... } }
"""
from __future__ import annotations

import logging
from typing import Any

from ..core.interfaces import NodeContext, NodeExecutor, NodeResult
from .service import ChampGraphService

log = logging.getLogger(__name__)


class ChampGraphLocalExecutor(NodeExecutor):
    kind = "champgraph"

    def __init__(self, service: ChampGraphService) -> None:
        self._service = service

    async def execute(self, ctx: NodeContext) -> NodeResult:
        action = ctx.config.get("action")
        if not action:
            raise ValueError("champgraph: node is missing 'action' in config")

        raw_inputs = ctx.config.get("inputs", {}) or {}
        rendered = ctx.render(raw_inputs)
        if not isinstance(rendered, dict):
            raise TypeError("champgraph: inputs must render to a dict")

        # Merge loop item fields into inputs so {{ item.email }}-style flows work
        expr_ctx = ctx.expression_context()
        item = expr_ctx.get("item")
        if isinstance(item, dict):
            rendered = {**item, **rendered}

        result = await self._service.invoke(action, rendered)
        return NodeResult(output={"data": result})
