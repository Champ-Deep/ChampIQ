"""APScheduler job that ticks CadenceService every 60s.

Reuses the orchestrator's existing AsyncIOScheduler instance so we don't run
two competing schedulers in the same process.
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from ..services import CadenceService

log = logging.getLogger(__name__)

JOB_ID = "champmail.cadence.tick"


class CadenceJob:
    def __init__(
        self,
        scheduler: AsyncIOScheduler,
        cadence_service: CadenceService,
        *,
        interval_seconds: int = 60,
    ) -> None:
        self._scheduler = scheduler
        self._cadence_service = cadence_service
        self._interval = interval_seconds

    def start(self) -> None:
        """Register the cadence tick. Idempotent — safe to call on every reload."""
        self._scheduler.add_job(
            self._fire,
            trigger="interval",
            seconds=self._interval,
            id=JOB_ID,
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            next_run_time=None,  # first fire after interval
        )
        log.info("Cadence job registered (every %ds)", self._interval)

    def stop(self) -> None:
        try:
            self._scheduler.remove_job(JOB_ID)
        except Exception:
            pass

    async def _fire(self) -> None:
        try:
            counters = await self._cadence_service.tick()
            if counters["due"] > 0 or counters["sent"] > 0:
                log.info("cadence tick: %s", counters)
        except Exception:
            log.exception("cadence tick raised — continuing")
