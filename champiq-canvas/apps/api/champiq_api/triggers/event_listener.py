"""Listens on the event bus and fires workflows whose `trigger.event` matches."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

from ..core.interfaces import EventBus
from ..models import WorkflowTable
from ..runtime import consumer_groups
from ..runtime.orchestrator import Orchestrator

log = logging.getLogger(__name__)


class EventTriggerListener:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        bus: EventBus,
        orchestrator: Orchestrator,
    ) -> None:
        self._session_factory = session_factory
        self._bus = bus
        self._orchestrator = orchestrator
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def shutdown(self) -> None:
        if self._task:
            self._task.cancel()

    async def _run(self) -> None:
        # * Durable subscription: a workflow whose trigger event fired while
        # * this listener was restarting used to be lost silently. The group
        # * remembers its position, so the DAG fires on the way back up.
        try:
            async for message in self._bus.subscribe_durable(
                "*", group=consumer_groups.WORKFLOW_TRIGGERS
            ):
                topic = message.get("topic")
                if not topic or topic.startswith("execution.") or topic.startswith("node."):
                    continue
                try:
                    await self._dispatch(topic, message)
                except Exception:
                    # ! A dispatch failure must not kill the listener — the
                    # ! remaining events still need to reach their workflows.
                    log.exception("event listener dispatch failed for %s", topic)
        except asyncio.CancelledError:
            return
        except Exception:
            log.exception("event listener crashed")

    async def _dispatch(self, topic: str, payload: dict[str, Any]) -> None:
        async with self._session_factory() as session:
            rows = (
                await session.execute(select(WorkflowTable).where(WorkflowTable.active.is_(True)))
            ).scalars().all()

        for wf in rows:
            for trig in wf.triggers or []:
                if trig.get("kind") == "event" and trig.get("event") == topic:
                    await self._orchestrator.run_workflow(
                        wf.id, trigger_kind="event", trigger_payload=payload
                    )
