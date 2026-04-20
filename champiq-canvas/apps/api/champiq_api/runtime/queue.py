"""JobQueue implementations.

For now, an in-memory queue using asyncio. Celery/Arq can be plugged in later
by implementing the same three-method protocol from core.interfaces.JobQueue.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any, Awaitable, Callable

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


def build_job_queue() -> InMemoryJobQueue:
    return InMemoryJobQueue()
