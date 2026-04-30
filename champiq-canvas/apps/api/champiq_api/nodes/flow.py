"""Flow nodes: Loop, Wait."""
from __future__ import annotations

import asyncio
from typing import Any

from ..core.interfaces import NodeContext, NodeExecutor, NodeResult


# Cadence modes — see _MODES tuple in docstring below for semantics.
LOOP_MODE_PARALLEL = "parallel"
LOOP_MODE_SEQUENTIAL = "sequential"
LOOP_MODE_PACED = "paced"
_VALID_MODES = (LOOP_MODE_PARALLEL, LOOP_MODE_SEQUENTIAL, LOOP_MODE_PACED)


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

        cfg = ctx.config or {}
        template = cfg.get("each", {}) or {}

        # --- Resolve cadence config (with safe defaults + clamping) ----------
        mode = (cfg.get("mode") or LOOP_MODE_PARALLEL).strip().lower()
        if mode not in _VALID_MODES:
            mode = LOOP_MODE_PARALLEL

        concurrency = max(int(cfg.get("concurrency", 1) or 1), 1)
        pace_seconds = max(int(cfg.get("pace_seconds", 0) or 0), 0)
        initial_delay = max(int(cfg.get("initial_delay_seconds", 0) or 0), 0)
        jitter = max(int(cfg.get("jitter_seconds", 0) or 0), 0)
        stop_on_error = bool(cfg.get("stop_on_error", False))

        max_items_raw = cfg.get("max_items")
        max_items = int(max_items_raw) if max_items_raw not in (None, "", 0) else None
        if max_items is not None and max_items > 0:
            items = items[:max_items]

        # In paced mode, concurrency is implicitly 1 — running items in parallel
        # while pacing their starts is contradictory.
        if mode == LOOP_MODE_PACED:
            concurrency = 1

        cadence = {
            "mode": mode,
            "concurrency": concurrency,
            "pace_seconds": pace_seconds,
            "initial_delay_seconds": initial_delay,
            "jitter_seconds": jitter,
            "stop_on_error": stop_on_error,
        }

        # --- Render per-item template (cheap, sync-ish) ---------------------
        def _make_sub_ctx(item: Any, index: int) -> dict[str, Any]:
            sub = dict(ctx.expression_context())
            sub["item"] = item
            sub["index"] = index
            sub["prev"] = {"item": item, "index": index, **(ctx.input or {})}
            return sub

        def _render_one(item: Any, index: int) -> dict[str, Any]:
            sub_ctx = _make_sub_ctx(item, index)
            if template:
                rendered = ctx.expressions.evaluate(template, sub_ctx)
                base = rendered if isinstance(rendered, dict) else {"value": rendered}
            else:
                base = {}
            return {"_item": item, "_index": index, **base}

        results = [_render_one(item, i) for i, item in enumerate(items)]

        return NodeResult(output={
            "items": results,
            "count": len(results),
            "_cadence": cadence,
        })


class WaitExecutor(NodeExecutor):
    kind = "wait"

    async def execute(self, ctx: NodeContext) -> NodeResult:
        seconds = int(ctx.render(ctx.config.get("seconds", 0)) or 0)
        if seconds > 0:
            await asyncio.sleep(min(seconds, 3600))
        return NodeResult(output={"waited": seconds})
