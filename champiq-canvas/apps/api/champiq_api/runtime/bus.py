"""Event bus — pub/sub between the orchestrator, drivers, and the UI.

Two backends: in-memory (dev/tests, no external deps) and Redis.
Selection is a factory — callers depend only on the EventBus protocol.
"""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from typing import Any, AsyncIterator

from ..core.interfaces import EventBus


class InMemoryEventBus:
    """Process-local event bus. Fine for single-worker dev; loses events across workers."""

    def __init__(self) -> None:
        self._subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)

    async def publish(self, topic: str, payload: dict[str, Any]) -> None:
        for queue in list(self._subscribers.get(topic, [])):
            await queue.put(payload)
        # Wildcard listeners use topic "*".
        for queue in list(self._subscribers.get("*", [])):
            await queue.put({"topic": topic, **payload})

    async def subscribe(self, topic: str) -> AsyncIterator[dict[str, Any]]:
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers[topic].append(queue)
        try:
            while True:
                yield await queue.get()
        finally:
            self._subscribers[topic].remove(queue)


class RedisEventBus:
    """Redis pub/sub-backed bus. Required for multi-worker deployments."""

    def __init__(self, url: str) -> None:
        import redis.asyncio as redis

        self._redis = redis.from_url(url, decode_responses=True)

    async def publish(self, topic: str, payload: dict[str, Any]) -> None:
        await self._redis.publish(topic, json.dumps(payload))
        await self._redis.publish("*", json.dumps({"topic": topic, **payload}))

    async def subscribe(self, topic: str) -> AsyncIterator[dict[str, Any]]:
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(topic)
        try:
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                yield json.loads(message["data"])
        finally:
            await pubsub.unsubscribe(topic)
            await pubsub.close()


def build_event_bus(redis_url: str | None) -> EventBus:
    if redis_url:
        try:
            return RedisEventBus(redis_url)
        except Exception:
            # Loud fallback: a misconfigured REDIS_URL in production silently
            # downgrades the deployment to in-memory pub/sub, breaking cross-
            # worker fan-out (webhook → bus → workflow trigger). Log at WARNING
            # so this shows up in Railway logs and ops can fix the URL.
            import logging as _logging
            _logging.getLogger(__name__).warning(
                "build_event_bus: REDIS_URL set but RedisEventBus failed to "
                "construct — falling back to InMemoryEventBus. Cross-worker "
                "events will NOT be delivered.",
                exc_info=True,
            )
    return InMemoryEventBus()
