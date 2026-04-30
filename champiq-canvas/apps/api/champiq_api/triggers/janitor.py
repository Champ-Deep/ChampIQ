"""Persistence janitor — prunes growing tables on a schedule.

Runs on the same APScheduler the cron-trigger system uses, so we don't add a
second scheduler process. Two prune targets today:

  1. `executions` older than EXECUTION_RETENTION_DAYS (default 30). The
     `node_runs` FK has `ondelete=CASCADE`, so child rows go with the parent.
  2. `champmail_templates` whose name starts with `_oneoff_` and is older
     than ONEOFF_RETENTION_DAYS (default 7). These are created by the
     `send_single_email` action's inline-subject/body path and are never
     reused after the send completes.

Both retention windows are env-overridable; if you ever need to keep a
forensic trail longer, lift them via env vars without touching code.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import delete, text
from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

from ..champmail.models import CMTemplate
from ..models import ExecutionTable

log = logging.getLogger(__name__)


_DEFAULT_EXECUTION_DAYS = 30
_DEFAULT_ONEOFF_DAYS = 7
_DEFAULT_RUN_INTERVAL_HOURS = 6


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return max(int(raw), 1)
    except ValueError:
        return default


class Janitor:
    """Single class, single concern. Inject session_factory + scheduler;
    call `register()` once at startup. Doesn't own the scheduler — it just
    pins one job to it.
    """

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        scheduler: AsyncIOScheduler,
    ) -> None:
        self._session_factory = session_factory
        self._scheduler = scheduler
        self._execution_retention = timedelta(
            days=_env_int("EXECUTION_RETENTION_DAYS", _DEFAULT_EXECUTION_DAYS)
        )
        self._oneoff_retention = timedelta(
            days=_env_int("CHAMPMAIL_ONEOFF_RETENTION_DAYS", _DEFAULT_ONEOFF_DAYS)
        )
        self._interval_hours = _env_int(
            "JANITOR_RUN_INTERVAL_HOURS", _DEFAULT_RUN_INTERVAL_HOURS
        )

    def register(self) -> None:
        self._scheduler.add_job(
            self.run_once,
            trigger=IntervalTrigger(hours=self._interval_hours),
            id="champiq:janitor",
            replace_existing=True,
            # Fire once at startup, then on the interval. APScheduler does this
            # by passing next_run_time.
            next_run_time=datetime.now(timezone.utc),
            max_instances=1,
            coalesce=True,
        )
        log.info(
            "janitor registered: executions>%dd · oneoff_templates>%dd · every %dh",
            self._execution_retention.days,
            self._oneoff_retention.days,
            self._interval_hours,
        )

    # Stable id for the Postgres advisory lock. Any int will do; pick one
    # that's unlikely to collide with another part of the codebase using
    # advisory locks. (Nothing else here uses them today.)
    _ADVISORY_LOCK_ID = 0x6A_61_6E_69_74_6F_72  # ascii "janitor"

    async def run_once(self) -> dict[str, int]:
        """Single sweep. Returns counts so it's testable + observable.

        Uses a Postgres session-scoped advisory lock so that with multiple
        workers only one runs the sweep on a given tick. `pg_try_advisory_lock`
        is non-blocking — losing the race is a no-op (other worker is sweeping).
        """
        now = datetime.now(timezone.utc)
        exec_cutoff = now - self._execution_retention
        oneoff_cutoff = now - self._oneoff_retention

        async with self._session_factory() as session:
            try:
                got_lock = (
                    await session.execute(
                        text("SELECT pg_try_advisory_lock(:k)"),
                        {"k": self._ADVISORY_LOCK_ID},
                    )
                ).scalar_one()
                if not got_lock:
                    log.debug("janitor: another worker holds the lock — skipping")
                    return {"executions_deleted": 0, "oneoff_templates_deleted": 0, "skipped": True}
                try:
                    exec_result = await session.execute(
                        delete(ExecutionTable).where(ExecutionTable.started_at < exec_cutoff)
                    )
                    tpl_result = await session.execute(
                        delete(CMTemplate)
                        .where(CMTemplate.name.like("_oneoff\\_%"))
                        .where(CMTemplate.created_at < oneoff_cutoff)
                    )
                    await session.commit()
                finally:
                    await session.execute(
                        text("SELECT pg_advisory_unlock(:k)"),
                        {"k": self._ADVISORY_LOCK_ID},
                    )
                    await session.commit()
            except Exception:
                await session.rollback()
                log.exception("janitor sweep failed")
                return {"executions_deleted": 0, "oneoff_templates_deleted": 0}

        counts = {
            "executions_deleted": exec_result.rowcount or 0,
            "oneoff_templates_deleted": tpl_result.rowcount or 0,
        }
        if counts["executions_deleted"] or counts["oneoff_templates_deleted"]:
            log.info("janitor swept: %s", counts)
        return counts
