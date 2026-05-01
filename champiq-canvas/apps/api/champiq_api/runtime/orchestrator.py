"""Orchestrator — walks a workflow DAG, dispatches nodes, persists runs.

Design notes (SOLID):
  - Orchestrator depends only on interfaces in core.interfaces + the registry.
    It doesn't know about Redis, Postgres, Fernet, or any specific node kind.
  - Executors are pure strategies; orchestrator is the strategy *selector*.
  - Branching is explicit: a node's NodeResult.branches names which edges
    should fire downstream. Default = all outgoing edges.
  - Errors are isolated per node; a node failure marks its subtree as skipped
    unless the user has configured `on_error: continue` in node data.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..core.interfaces import (
    CredentialResolver,
    EventBus,
    ExpressionEvaluator,
    NodeContext,
    NodeResult,
)
from ..models import ExecutionTable, NodeRunTable, WorkflowTable
from .fan_out import (
    CADENCE_KEY,
    FAN_OUT_ITEMS_KEY,
    FanOutItem,
    envelope_from_chained_output,
    envelope_from_loop_output,
)
from .registry import NodeRegistry

log = logging.getLogger(__name__)


@dataclass
class ExecutionEvent:
    topic: str
    payload: dict[str, Any]


class Orchestrator:
    def __init__(
        self,
        *,
        session_factory: async_sessionmaker[AsyncSession],
        registry: NodeRegistry,
        credentials: CredentialResolver,
        expressions: ExpressionEvaluator,
        events: EventBus,
    ) -> None:
        self._session_factory = session_factory
        self._registry = registry
        self._credentials = credentials
        self._expressions = expressions
        self._events = events

    # -- Public entry points ---------------------------------------------

    async def run_workflow(
        self,
        workflow_id: int,
        *,
        trigger_kind: str = "manual",
        trigger_payload: dict[str, Any] | None = None,
    ) -> str:
        trigger_payload = trigger_payload or {}
        async with self._session_factory() as session:
            workflow = await session.get(WorkflowTable, workflow_id)
            if workflow is None:
                raise KeyError(workflow_id)

            execution = ExecutionTable(
                id=f"exec_{uuid.uuid4().hex[:12]}",
                workflow_id=workflow_id,
                status="running",
                trigger_kind=trigger_kind,
                trigger_payload=trigger_payload,
            )
            session.add(execution)
            await session.commit()
            await session.refresh(execution)
            snapshot = {
                "nodes": list(workflow.nodes or []),
                "edges": list(workflow.edges or []),
            }

        await self._publish("execution.started", {
            "execution_id": execution.id,
            "workflow_id": workflow_id,
            "trigger_kind": trigger_kind,
        })

        asyncio.create_task(self._run_execution(execution.id, snapshot, trigger_payload))
        return execution.id

    async def run_ad_hoc(
        self,
        nodes: list[dict[str, Any]],
        edges: list[dict[str, Any]],
        *,
        trigger_payload: dict[str, Any] | None = None,
    ) -> str:
        """Run a workflow graph without persisting it as a workflow row.

        Useful for the existing 'Run All' canvas button.
        """
        trigger_payload = trigger_payload or {}
        # Persist as a throwaway workflow so execution history is consistent.
        async with self._session_factory() as session:
            workflow = WorkflowTable(
                name=f"ad-hoc-{uuid.uuid4().hex[:6]}",
                description="ad-hoc canvas run",
                active=False,
                nodes=nodes,
                edges=edges,
                triggers=[],
            )
            session.add(workflow)
            await session.commit()
            await session.refresh(workflow)
            workflow_id = workflow.id

        return await self.run_workflow(
            workflow_id,
            trigger_kind="manual",
            trigger_payload=trigger_payload,
        )

    # -- DAG walking -----------------------------------------------------

    async def _run_execution(
        self,
        execution_id: str,
        graph: dict[str, Any],
        trigger_payload: dict[str, Any],
    ) -> None:
        nodes: list[dict[str, Any]] = graph["nodes"]
        edges: list[dict[str, Any]] = graph["edges"]

        by_id = {n["id"]: n for n in nodes}
        outgoing: dict[str, list[dict[str, Any]]] = {}
        incoming: dict[str, list[dict[str, Any]]] = {}
        for edge in edges:
            outgoing.setdefault(edge["source"], []).append(edge)
            incoming.setdefault(edge["target"], []).append(edge)

        # Roots: nodes with no incoming edges.
        pending = {nid for nid in by_id if nid not in incoming}
        results: dict[str, NodeResult] = {}
        inputs: dict[str, dict[str, Any]] = {}
        # loop_context[node_id] = list of items from an upstream loop node,
        # so the downstream node can be fanned-out per item.
        loop_context: dict[str, list[Any]] = {}
        # loop_cadence[node_id] = cadence dict from the upstream loop's output
        # (mode, pace_seconds, jitter, etc.). Read by _execute_node_fan_out.
        loop_cadence: dict[str, dict[str, Any]] = {}
        skipped: set[str] = set()

        # BFS layer-by-layer so parallel siblings run concurrently.
        # effective_trigger tracks the live trigger payload — updated after the
        # trigger node runs so {{ trigger.payload.X }} resolves for all downstream nodes.
        effective_trigger: dict[str, Any] = dict(trigger_payload)

        while pending:
            layer = list(pending)
            pending = set()

            async def _run_one(node_id: str) -> tuple[str, Optional[NodeResult], Optional[str]]:
                node = by_id[node_id]
                if node_id in skipped:
                    return node_id, None, "skipped"
                try:
                    items = loop_context.get(node_id)
                    if items is not None:
                        # Fan-out: run once per item, inject item + index into context.
                        result = await self._execute_node_fan_out(
                            execution_id=execution_id,
                            node=node,
                            upstream={nid: {"output": r.output} for nid, r in results.items()},
                            direct_input=inputs.get(node_id, {}),
                            trigger_payload=effective_trigger,
                            items=items,
                            cadence=loop_cadence.get(node_id),
                        )
                    else:
                        result = await self._execute_node(
                            execution_id=execution_id,
                            node=node,
                            upstream={nid: {"output": r.output} for nid, r in results.items()},
                            direct_input=inputs.get(node_id, {}),
                            trigger_payload=effective_trigger,
                        )
                    return node_id, result, None
                except Exception as err:  # noqa: BLE001
                    log.exception("node %s failed", node_id)
                    return node_id, None, str(err)

            outcomes = await asyncio.gather(*(_run_one(nid) for nid in layer))

            for node_id, result, error in outcomes:
                node = by_id[node_id]
                # If a trigger node just ran, promote its output to effective_trigger
                # so downstream nodes can use {{ trigger.payload.X }} expressions.
                node_kind = (node.get("data", {}) or {}).get("kind", "")
                if result is not None and node_kind.startswith("trigger."):
                    effective_trigger = result.output

                on_error = (node.get("data", {}) or {}).get("on_error", "stop")
                if error is not None:
                    await self._publish("node.failed", {
                        "execution_id": execution_id,
                        "node_id": node_id,
                        "error": error,
                    })
                    if on_error == "continue":
                        # Treat as empty result; children still fire.
                        result = NodeResult(output={"error": error})
                    else:
                        for descendant in _descendants(node_id, outgoing):
                            skipped.add(descendant)
                        continue

                assert result is not None
                results[node_id] = result
                await self._publish("node.completed", {
                    "execution_id": execution_id,
                    "node_id": node_id,
                    "output": result.output,
                    "branches": result.branches,
                })

                chosen_edges = _choose_edges(outgoing.get(node_id, []), result.branches)

                # Detect if this node produced loop items that should be fanned out.
                # A loop node (kind == "loop") outputs {"items": [...], "count": N,
                # "_cadence": {mode,pace_seconds,...}}. A chained fan-out node emits
                # {FAN_OUT_ITEMS_KEY: [<envelope_payload>, ...]} where each payload
                # carries the original loop row + the node's per-item output —
                # see fan_out.FanOutItem.to_chain_payload.
                produced_items: Optional[list[Any]] = None
                produced_cadence: Optional[dict[str, Any]] = None
                if node_kind == "loop" and result.output.get("items") is not None:
                    produced_items = result.output["items"]
                    produced_cadence = result.output.get(CADENCE_KEY)
                elif result.output.get(FAN_OUT_ITEMS_KEY) is not None:
                    produced_items = result.output[FAN_OUT_ITEMS_KEY]
                    # Carry the cadence forward so chained fan-outs keep the same pacing.
                    produced_cadence = result.output.get(CADENCE_KEY)

                log.info("[orchestrator] node %s done | kind=%s | produced_items=%s | chosen_edges=%s",
                         node_id, node_kind, len(produced_items) if produced_items is not None else None,
                         [e["target"] for e in chosen_edges])

                for edge in chosen_edges:
                    target = edge["target"]
                    if target in skipped:
                        continue
                    inputs[target] = {**inputs.get(target, {}), **result.output}
                    if produced_items is not None:
                        loop_context[target] = produced_items
                        if produced_cadence is not None:
                            loop_cadence[target] = produced_cadence
                    parents_done = _all_parents_done(target, incoming, results, skipped)
                    log.info("[orchestrator] edge %s->%s | parents_done=%s", node_id, target, parents_done)
                    if parents_done:
                        pending.add(target)

        final_status = "error" if any(r.output.get("error") for r in results.values()) else "success"
        await self._finalize_execution(execution_id, final_status, results)

    async def _execute_node_fan_out(
        self,
        *,
        execution_id: str,
        node: dict[str, Any],
        upstream: dict[str, dict[str, Any]],
        direct_input: dict[str, Any],
        trigger_payload: dict[str, Any],
        items: list[Any],
        cadence: Optional[dict[str, Any]] = None,
    ) -> NodeResult:
        """Run a node once per item in a loop's output.

        `cadence` controls timing — see LoopExecutor docstring for fields. When
        cadence is None or mode='sequential' (the historical default for an
        unconfigured loop), items run one-after-another with no delay.
        """
        node_id = node["id"]
        data = node.get("data", {}) or {}
        node_kind = data.get("kind") or data.get("toolId") or node.get("type") or "unknown"
        config = data.get("config", {}) or {}

        from ..core.interfaces import NodeContext as _NC  # local to avoid circular

        # Resolve cadence with safe defaults.
        cadence = cadence or {}
        mode = (cadence.get("mode") or "sequential").lower()
        concurrency = max(int(cadence.get("concurrency", 1) or 1), 1)
        pace_seconds = max(int(cadence.get("pace_seconds", 0) or 0), 0)
        initial_delay = max(int(cadence.get("initial_delay_seconds", 0) or 0), 0)
        jitter = max(int(cadence.get("jitter_seconds", 0) or 0), 0)
        stop_on_error = bool(cadence.get("stop_on_error", False))

        # Pre-allocated so all three runners can write at the right index.
        item_results: list[dict[str, Any]] = [None] * len(items)  # type: ignore[list-item]
        errors: list[str] = []
        aborted = False

        # Start a single node_run row for the fan-out node so the frontend can see output
        run_row = await self._start_node_run(execution_id, node_id, node_kind, direct_input)

        async def _run_one(index: int, item: Any) -> None:
            nonlocal aborted
            if aborted:
                item_results[index] = {"skipped": True, "reason": "aborted by stop_on_error"}
                return
            # Build the per-item envelope. Two cases:
            #   1. First hop after a loop: items are {_item, _index, ...} envelopes
            #      directly emitted by LoopExecutor — `prev` is empty.
            #   2. Chained fan-out (loop → A → B): items already carry the original
            #      _item AND the upstream's per-item _prev (written by to_chain_payload
            #      on the previous hop) — recover both so {{ item.X }} keeps resolving
            #      to the original CSV row at every depth.
            if isinstance(item, dict) and "_item" in item:
                envelope = envelope_from_chained_output(item, index)
            else:
                envelope = envelope_from_loop_output(item, index)
            raw_item = envelope.item
            raw_index = envelope.index
            raw_prev = envelope.prev
            per_item_input = {**direct_input, "item": raw_item, "index": raw_index, "prev": raw_prev}

            async def emit(topic: str, payload: dict[str, Any]) -> None:
                await self._publish(topic, {"execution_id": execution_id, "node_id": node_id, **payload})

            ctx = _NC(
                execution_id=execution_id,
                node_id=node_id,
                node_kind=node_kind,
                config=config,
                input=per_item_input,
                upstream=upstream,
                trigger=trigger_payload,
                credentials=self._credentials,
                expressions=self._expressions,
                events=self._events,
                emit=emit,
            )

            def _patched_ctx(envelope=envelope, ctx=ctx):
                # `prev` resolves to the immediately-upstream node's per-item
                # output — NOT the upstream node's full envelope. This is the
                # invariant the FanOutItem dataclass enforces.
                return {
                    "node": ctx.upstream,
                    "prev": envelope.prev,
                    "trigger": ctx.trigger,
                    "execution_id": ctx.execution_id,
                    "item": envelope.item,
                    "index": envelope.index,
                }

            ctx.expression_context = _patched_ctx  # type: ignore[method-assign]

            executor = self._registry.get(node_kind)
            try:
                r = await executor.execute(ctx)
                # Wrap the executor's output so the next downstream fan-out can
                # recover the original loop row + this node's output as `prev`.
                item_results[index] = envelope.to_chain_payload(r.output)
            except Exception as err:  # noqa: BLE001
                log.warning("fan-out node %s item %d failed: %s", node_id, index, err)
                errors.append(f"item[{index}]: {err}")
                # Even on failure, propagate the original item so downstream
                # nodes that handle the error can still see what they were
                # supposed to be processing.
                item_results[index] = envelope.to_chain_payload({"error": str(err), "item": raw_item})
                if stop_on_error:
                    aborted = True

        def _gap_seconds() -> float:
            """pace_seconds + uniform random jitter in [-jitter, +jitter]."""
            if jitter <= 0:
                return float(pace_seconds)
            import random  # noqa: PLC0415 — std-lib, only when jitter requested
            return max(0.0, pace_seconds + random.uniform(-jitter, jitter))

        if initial_delay > 0:
            await asyncio.sleep(initial_delay)

        # --- Dispatch by mode ----------------------------------------------------
        if mode == "parallel" and concurrency > 1:
            sem = asyncio.Semaphore(concurrency)

            async def _guarded(index: int, item: Any) -> None:
                async with sem:
                    await _run_one(index, item)

            await asyncio.gather(*[_guarded(i, it) for i, it in enumerate(items)])

        elif mode == "paced":
            # Each item starts at last_start + pace (+ jitter), regardless of body
            # duration. We launch each as a background task so a slow body doesn't
            # delay the next start; we await all of them at the end.
            tasks: list[asyncio.Task[None]] = []
            for i, it in enumerate(items):
                if aborted:
                    item_results[i] = {"skipped": True, "reason": "aborted by stop_on_error"}
                    continue
                if i > 0:
                    await asyncio.sleep(_gap_seconds())
                tasks.append(asyncio.create_task(_run_one(i, it)))
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)

        else:
            # mode == "sequential" (or "parallel" with concurrency=1) — historical
            # behavior: each item fully completes before the next starts.
            for i, it in enumerate(items):
                if aborted:
                    item_results[i] = {"skipped": True, "reason": "aborted by stop_on_error"}
                    continue
                if i > 0 and pace_seconds > 0:
                    # Even sequential mode honors pace_seconds if set — gap between
                    # the end of one body and the start of the next.
                    await asyncio.sleep(_gap_seconds())
                await _run_one(i, it)

        output: dict[str, Any] = {
            FAN_OUT_ITEMS_KEY: item_results,
            "count": len(item_results),
            "items": item_results,
        }
        # Carry cadence forward so chained fan-outs (loop → A → B) share pacing.
        if cadence:
            output[CADENCE_KEY] = cadence
        if errors:
            output["errors"] = errors
        if aborted:
            output["aborted"] = True

        # Persist to DB so frontend getNodeRuns() can show output + transcript
        final_status = "error" if errors else "success"
        await self._finish_node_run(run_row.id, final_status, output, errors[0] if errors else None, 0)

        return NodeResult(output=output)

    async def _execute_node(
        self,
        *,
        execution_id: str,
        node: dict[str, Any],
        upstream: dict[str, dict[str, Any]],
        direct_input: dict[str, Any],
        trigger_payload: dict[str, Any],
    ) -> NodeResult:
        node_id = node["id"]
        data = node.get("data", {}) or {}
        node_kind = data.get("kind") or data.get("toolId") or node.get("type") or "unknown"
        config = data.get("config", {}) or {}

        run_row = await self._start_node_run(execution_id, node_id, node_kind, direct_input)
        await self._publish("node.started", {
            "execution_id": execution_id,
            "node_id": node_id,
            "kind": node_kind,
        })

        async def emit(topic: str, payload: dict[str, Any]) -> None:
            await self._publish(topic, {"execution_id": execution_id, "node_id": node_id, **payload})

        ctx = NodeContext(
            execution_id=execution_id,
            node_id=node_id,
            node_kind=node_kind,
            config=config,
            input=direct_input,
            upstream=upstream,
            trigger=trigger_payload,
            credentials=self._credentials,
            expressions=self._expressions,
            events=self._events,
            emit=emit,
        )

        executor = self._registry.get(node_kind)

        max_retries = int(data.get("max_retries", 0))
        attempt = 0
        last_error: Optional[Exception] = None
        while attempt <= max_retries:
            try:
                result = await executor.execute(ctx)
                await self._finish_node_run(run_row.id, "success", result.output, None, attempt)
                return result
            except Exception as err:  # noqa: BLE001
                last_error = err
                attempt += 1
                if attempt > max_retries:
                    break
                await asyncio.sleep(min(2 ** attempt, 30))

        await self._finish_node_run(run_row.id, "error", None, str(last_error), attempt - 1)
        raise last_error  # type: ignore[misc]

    # -- Persistence helpers ---------------------------------------------

    async def _start_node_run(
        self, execution_id: str, node_id: str, node_kind: str, input_: dict[str, Any]
    ) -> NodeRunTable:
        async with self._session_factory() as session:
            row = NodeRunTable(
                execution_id=execution_id,
                node_id=node_id,
                node_kind=node_kind,
                status="running",
                input=input_,
                started_at=datetime.now(timezone.utc),
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return row

    async def _finish_node_run(
        self,
        run_id: int,
        status: str,
        output: Optional[dict[str, Any]],
        error: Optional[str],
        retries: int,
    ) -> None:
        async with self._session_factory() as session:
            row = await session.get(NodeRunTable, run_id)
            if row is None:
                return
            row.status = status
            row.output = output
            row.error = error
            row.retries = retries
            row.finished_at = datetime.now(timezone.utc)
            await session.commit()

    async def _finalize_execution(
        self, execution_id: str, status: str, results: dict[str, NodeResult]
    ) -> None:
        async with self._session_factory() as session:
            exec_row = await session.get(ExecutionTable, execution_id)
            if exec_row is None:
                return
            exec_row.status = status
            exec_row.result = {nid: r.output for nid, r in results.items()}
            exec_row.finished_at = datetime.now(timezone.utc)
            await session.commit()

        await self._publish("execution.finished", {
            "execution_id": execution_id,
            "status": status,
        })

    # -- Event emit ------------------------------------------------------

    async def _publish(self, topic: str, payload: dict[str, Any]) -> None:
        payload = {**payload, "ts": datetime.now(timezone.utc).isoformat()}
        await self._events.publish(topic, payload)


# -- Pure helpers -----------------------------------------------------------

def _descendants(node_id: str, outgoing: dict[str, list[dict[str, Any]]]) -> set[str]:
    seen: set[str] = set()
    stack = [node_id]
    while stack:
        current = stack.pop()
        for edge in outgoing.get(current, []):
            if edge["target"] in seen:
                continue
            seen.add(edge["target"])
            stack.append(edge["target"])
    return seen


def _choose_edges(
    edges: list[dict[str, Any]], branches: list[str]
) -> list[dict[str, Any]]:
    """If a node emitted named branches, only pass data along edges whose
    sourceHandle matches one of those branches. Otherwise, all edges."""
    if not branches:
        return edges
    return [e for e in edges if e.get("sourceHandle") in branches]


def _all_parents_done(
    target: str,
    incoming: dict[str, list[dict[str, Any]]],
    results: dict[str, NodeResult],
    skipped: set[str],
) -> bool:
    for edge in incoming.get(target, []):
        src = edge["source"]
        if src not in results and src not in skipped:
            return False
    return True
