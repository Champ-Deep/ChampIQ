"""CSV upload node — emits rows from a CSV that was parsed at config time.

Why this design (rows stored in node.config, not on disk)?
    The user uploads a CSV in the inspector; the browser parses it once and
    writes the rows directly into `config.items`. The node is then fully
    self-contained — works after any trigger (cron, manual, webhook), portable
    across export/import, no orphaned files, no DB rows.

Output mirrors what `trigger.manual` emits when its `items` config is set,
so existing `loop` nodes work downstream without modification.
"""
from __future__ import annotations

from typing import Any

from ..core.interfaces import NodeContext, NodeExecutor, NodeResult


class CsvUploadExecutor(NodeExecutor):
    kind = "csv.upload"

    async def execute(self, ctx: NodeContext) -> NodeResult:
        items = ctx.config.get("items") or []
        if not isinstance(items, list):
            raise TypeError("csv.upload: 'items' must be a list (parsed at upload time)")
        return NodeResult(output={
            "items": items,
            "count": len(items),
            "filename": ctx.config.get("filename"),
        })
