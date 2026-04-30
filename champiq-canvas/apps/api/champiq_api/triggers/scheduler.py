"""Cron scheduler: scans workflows for cron triggers and dispatches runs."""
from __future__ import annotations

import logging
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

from ..models import WorkflowTable
from ..runtime.orchestrator import Orchestrator

log = logging.getLogger(__name__)


class CronScheduler:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        orchestrator: Orchestrator,
    ) -> None:
        self._session_factory = session_factory
        self._orchestrator = orchestrator
        self._scheduler = AsyncIOScheduler()
        self._jobs: dict[str, str] = {}  # trigger_id -> apscheduler job id

    @property
    def scheduler(self) -> AsyncIOScheduler:
        """Underlying APScheduler instance — exposed so other modules
        (e.g. ChampMail cadence) can register jobs on the same loop."""
        return self._scheduler

    async def start(self) -> None:
        self._scheduler.start()
        await self.sync()

    async def shutdown(self) -> None:
        self._scheduler.shutdown(wait=False)

    async def sync(self) -> None:
        """Re-scan workflows for cron triggers and (re)register them."""
        async with self._session_factory() as session:
            rows = (await session.execute(select(WorkflowTable).where(WorkflowTable.active.is_(True)))).scalars().all()

        desired: dict[str, tuple[int, str]] = {}
        for wf in rows:
            for trig in wf.triggers or []:
                if trig.get("kind") != "cron":
                    continue
                trigger_id = f"wf{wf.id}:{trig.get('id', 'cron')}"
                desired[trigger_id] = (wf.id, trig.get("cron", "0 * * * *"))

        # Remove stale.
        for trigger_id in list(self._jobs.keys()):
            if trigger_id not in desired:
                self._scheduler.remove_job(self._jobs.pop(trigger_id))

        # Add new/updated.
        for trigger_id, (workflow_id, cron) in desired.items():
            if trigger_id in self._jobs:
                continue
            try:
                trigger = CronTrigger.from_crontab(cron)
            except Exception as err:
                log.warning("invalid cron %r for %s: %s", cron, trigger_id, err)
                continue
            job = self._scheduler.add_job(
                self._fire,
                trigger=trigger,
                args=[workflow_id, trigger_id],
                id=trigger_id,
                replace_existing=True,
            )
            self._jobs[trigger_id] = job.id

    async def _fire(self, workflow_id: int, trigger_id: str) -> None:
        log.info("cron fire %s -> wf%s", trigger_id, workflow_id)
        await self._orchestrator.run_workflow(
            workflow_id, trigger_kind="cron", trigger_payload={"trigger_id": trigger_id}
        )
