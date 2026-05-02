"""Flow nodes: Loop, Wait."""
from __future__ import annotations

import asyncio
from typing import Any

from ..core.interfaces import NodeContext, NodeExecutor, NodeResult
from ._loop_helpers import (
    LOOP_MODE_PACED,
    LOOP_MODE_PARALLEL,
    LOOP_MODE_SEQUENTIAL,
    cap_items,
    coerce_to_items_list,
    parse_cadence,
    render_each_template,
)


class LoopExecutor(NodeExecutor):
    """Iterates over an array and passes each item to downstream nodes.

    Core fields
        items                  expression resolving to a list  (required)
        each                   per-item expression template    (optional)

    Cadence fields (all optional, all backward-compatible — empty = current behavior)
        mode                   "parallel" | "sequential" | "paced"   default: "parallel"
        concurrency            parallel items at once (only with mode="parallel")  default: 1
        pace_seconds           gap between successive item STARTS (mode="paced")    default: 0
        initial_delay_seconds  wait before the very first item                       default: 0
        jitter_seconds         random ± offset added to every gap (anti-pattern)    default: 0
        stop_on_error          abort remaining items if one fails                    default: False
        max_items              hard cap on items processed                           default: None

    Mode semantics
        parallel    → run items concurrently, capped at `concurrency` in flight.
                      Best for independent work (HTTP fan-out, data enrichment).
        sequential  → item N+1 only starts after item N's body completes.
                      Best when items have side-effects on each other.
        paced       → each item starts at `last_start + pace_seconds (+ jitter)`,
                      regardless of body duration. Concurrency is forced to 1.
                      Best for cold-email cadence / rate-limited APIs.

    The orchestrator's fan-out mechanism picks up the output items list and runs
    downstream nodes once per item, reading the cadence config from
    output["_cadence"]. Item + index are injected into the expression context
    so {{ item.phone }}, {{ item.email }} etc. work downstream.
    """

    kind = "loop"

    async def execute(self, ctx: NodeContext) -> NodeResult:
        cfg = ctx.config or {}
        raw_items_expr = cfg.get("items", [])

        # 1. Resolve the items list — render expression, fall back to upstream
        #    auto-detect, or raise a friendly TypeError. See _loop_helpers.
        rendered = ctx.render(raw_items_expr)
        items = coerce_to_items_list(rendered, raw_items_expr, ctx.input)

        # 2. Apply max_items cap (testing aid — process only the first N rows).
        items = cap_items(items, cfg.get("max_items"))

        # 3. Parse cadence with safe defaults / clamping.
        cadence = parse_cadence(cfg)

        # 4. Render per-item `each` template into the fan-out envelopes.
        results = render_each_template(
            cfg.get("each") or {},
            items,
            base_expression_context=ctx.expression_context(),
            upstream_input=ctx.input,
            evaluator_evaluate=ctx.expressions.evaluate,
        )

        return NodeResult(output={
            "items": results,
            "count": len(results),
            "_cadence": cadence.to_dict(),
        })


class WaitExecutor(NodeExecutor):
    kind = "wait"

    async def execute(self, ctx: NodeContext) -> NodeResult:
        seconds = int(ctx.render(ctx.config.get("seconds", 0)) or 0)
        if seconds > 0:
            await asyncio.sleep(min(seconds, 3600))
        return NodeResult(output={"waited": seconds})
