"""JobQueue implementations.

PostgresJobQueue is the durable backend: enqueue() inserts a `jobs` row and
returns immediately (survives a process restart), and a background poll loop
claims due rows with `SELECT ... FOR UPDATE SKIP LOCKED` so a restart or a
second worker never double-processes the same job. Same enqueue/
register_handler signatures as the old InMemoryJobQueue (core.interfaces.
JobQueue protocol), so callers don't change.

InMemoryJobQueue is kept as the lightweight reference implementation (tests /
anywhere a DB isn't available).
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..models import JobTable

log = logging.getLogger(__name__)


class InMemoryJobQueue:
    """Simple async-task queue. Single process, best-effort.

    Handlers are registered by `kind`. `enqueue` fires off the handler on the
    event loop; `delay_seconds` uses asyncio.sleep (best-effort timer).
    """

    def __init__(self) -> None:
        self._handlers: dict[str, Callable[[dict[str, Any]], Awaitable[None]]] = {}

    async def register_handler(
        self, kind: str, handler: Callable[[dict[str, Any]], Awaitable[None]]
    ) -> None:
        self._handlers[kind] = handler

    async def enqueue(
        self, kind: str, payload: dict[str, Any], *, delay_seconds: int = 0
    ) -> str:
        job_id = f"job_{uuid.uuid4().hex[:10]}"
        handler = self._handlers.get(kind)
        if handler is None:
            raise LookupError(f"No handler registered for job kind {kind!r}")

        async def runner() -> None:
            try:
                if delay_seconds > 0:
                    await asyncio.sleep(delay_seconds)
                await handler(payload)
            except Exception:
                log.exception("Job %s (%s) failed", job_id, kind)

        asyncio.create_task(runner())
        return job_id


class PostgresJobQueue:
    """Durable job queue backed by the `jobs` table (alembic 0009_jobs).

    - enqueue() only inserts a row; nothing runs until the poll loop claims it.
    - Claiming uses `with_for_update(skip_locked=True)` so concurrent
      claimants never grab the same row.
    - `locked_at` older than `lock_timeout_seconds` is treated as abandoned
      (the worker that claimed it likely crashed) and becomes claimable again.
    """

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        *,
        poll_interval: float = 2.0,
        lock_timeout_seconds: float = 300.0,
    ) -> None:
        self._session_factory = session_factory
        self._handlers: dict[str, Callable[[dict[str, Any]], Awaitable[None]]] = {}
        self._poll_interval = poll_interval
        self._lock_timeout = timedelta(seconds=lock_timeout_seconds)
        self._worker_id = f"worker_{uuid.uuid4().hex[:8]}"
        self._task: Optional[asyncio.Task] = None
        self._stopping = False

    async def register_handler(
        self, kind: str, handler: Callable[[dict[str, Any]], Awaitable[None]]
    ) -> None:
        self._handlers[kind] = handler

    async def enqueue(
        self, kind: str, payload: dict[str, Any], *, delay_seconds: int = 0
    ) -> str:
        job_id = f"job_{uuid.uuid4().hex[:10]}"
        run_at = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)
        async with self._session_factory() as session:
            session.add(JobTable(id=job_id, kind=kind, payload=payload, run_at=run_at))
            await session.commit()
        return job_id

    async def start(self) -> None:
        self._stopping = False
        self._task = asyncio.create_task(self._run())

    async def shutdown(self) -> None:
        self._stopping = True
        if self._task:
            self._task.cancel()

    async def _run(self) -> None:
        try:
            while not self._stopping:
                job: Optional[dict[str, Any]] = None
                try:
                    job = await self._claim_one()
                except asyncio.CancelledError:
                    raise
                except Exception:
                    log.exception("job queue claim failed")
                if job is None:
                    await asyncio.sleep(self._poll_interval)
                    continue
                await self._process(job)
        except asyncio.CancelledError:
            return

    async def _claim_one(self) -> Optional[dict[str, Any]]:
        now = datetime.now(timezone.utc)
        stale_before = now - self._lock_timeout
        async with self._session_factory() as session:
            stmt = (
                select(JobTable)
                .where(
                    JobTable.status == "pending",
                    JobTable.run_at <= now,
                    or_(JobTable.locked_at.is_(None), JobTable.locked_at < stale_before),
                )
                .order_by(JobTable.run_at.asc())
                .limit(1)
                .with_for_update(skip_locked=True)
            )
            row = (await session.execute(stmt)).scalar_one_or_none()
            if row is None:
                return None
            row.status = "running"
            row.locked_at = now
            row.locked_by = self._worker_id
            row.attempts += 1
            job = {"id": row.id, "kind": row.kind, "payload": row.payload}
            await session.commit()
            return job

    async def _process(self, job: dict[str, Any]) -> None:
        handler = self._handlers.get(job["kind"])
        if handler is None:
            log.error("job %s: no handler registered for kind %r", job["id"], job["kind"])
            await self._finish(job["id"], "failed", error=f"no handler for kind {job['kind']!r}")
            return
        try:
            await handler(job["payload"])
            await self._finish(job["id"], "done")
        except Exception as exc:
            log.exception("job %s (%s) failed", job["id"], job["kind"])
            await self._finish(job["id"], "failed", error=str(exc))

    async def _finish(self, job_id: str, status: str, *, error: Optional[str] = None) -> None:
        async with self._session_factory() as session:
            row = await session.get(JobTable, job_id)
            if row is None:
                return
            row.status = status
            row.locked_at = None
            row.error = error
            await session.commit()


def build_job_queue(session_factory: async_sessionmaker[AsyncSession]) -> PostgresJobQueue:
    return PostgresJobQueue(session_factory)
