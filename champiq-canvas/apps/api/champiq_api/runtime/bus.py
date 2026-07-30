"""Event bus — pub/sub between the orchestrator, drivers, and the UI.

Two backends: in-memory (dev/tests, no external deps) and Redis.
Selection is a factory — callers depend only on the EventBus protocol.

Redis backend uses **streams**, not pub/sub
--------------------------------------------
This was `redis.publish()` / `pubsub.listen()` until 2026-07-30. Pub/sub is
fire-and-forget: no persistence, no consumer groups, no replay, no delivery
guarantee. Any event published while a consumer was restarting, deploying or
briefly wedged was **lost permanently and silently**. Three consumers
(EventTriggerListener, GraphWritebackConsumer, LedgerConsumer) all subscribe to
"*", so one worker restart simultaneously corrupted graph state, per-client
health numbers and event-triggered workflow firing — with no error surfaced
anywhere.

The replacement appends every event to one Redis stream (`champiq:events`) and
gives each durable consumer its own consumer group. A group remembers the last
id delivered to it, so events published while that consumer was down are
delivered when it comes back. Messages that were delivered but never acked
(the process died mid-handler) sit in the group's Pending Entries List and are
reclaimed via XAUTOCLAIM on the next startup.

Two subscription flavours, deliberately:

- `subscribe(topic)`       — ephemeral live tail (XREAD from `$`). No group, no
                             backlog. This is what the UI WebSocket wants: a
                             browser tab that closes must not leave an
                             unbounded pending list behind forever.
- `subscribe_durable(...)` — consumer-group read (XREADGROUP). At-least-once.
                             This is what the three worker consumers want.

Ack semantics: a message is acked when the consumer comes back for the *next*
one. That matches the existing consumer loops, which catch and log their own
handler exceptions and then continue — i.e. "handled, move on" — so a poison
message does not spin forever. What IS newly recovered is the case the old
transport could not handle at all: a process that dies before finishing a
message, whose work is reclaimed on restart.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from typing import Any, AsyncIterator

from ..core.interfaces import EventBus

log = logging.getLogger(__name__)

# * One stream for all topics, with the topic as a field. The alternative
# * (stream-per-topic) needs a fan-in read across an unbounded set of keys, and
# * every existing consumer subscribes to "*" anyway.
STREAM_KEY = "champiq:events"

# * Cap stream growth. At the suite's volumes this is many days of history and
# * is what makes replay and post-hoc debugging possible at all. XADD trims
# * approximately so trimming never blocks the write.
DEFAULT_MAXLEN = 100_000

# * How long a pending message must be idle before it may be reclaimed. Must
# * exceed the slowest legitimate handler — Cham_Graph ingestion on CPU-only
# * Ollama has been observed taking minutes — so this is deliberately generous.
DEFAULT_CLAIM_IDLE_MS = 10 * 60 * 1000

# * XREADGROUP block duration: long enough not to busy-loop, short enough that
# * shutdown (task.cancel()) stays responsive.
DEFAULT_BLOCK_MS = 5_000


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

    async def subscribe_durable(
        self,
        topic: str,
        *,
        group: str,
        consumer: str = "default",
        **_kwargs: Any,
    ) -> AsyncIterator[dict[str, Any]]:
        """No-op durability — in a single process there is nothing to survive.

        Present so consumer code can call one method unconditionally and get
        real durability wherever Redis is configured, without branching.
        """
        async for message in self.subscribe(topic):
            yield message


class RedisEventBus:
    """Redis *streams*-backed bus. Required for multi-worker deployments."""

    def __init__(
        self,
        url: str,
        *,
        stream_key: str = STREAM_KEY,
        maxlen: int = DEFAULT_MAXLEN,
    ) -> None:
        import redis.asyncio as redis

        self._redis = redis.from_url(url, decode_responses=True)
        self._stream = stream_key
        self._maxlen = maxlen

    # --- write side -------------------------------------------------------

    async def publish(self, topic: str, payload: dict[str, Any]) -> None:
        """Append one event to the stream.

        The payload is JSON-encoded into a single field because stream entries
        are flat string maps — nested dicts cannot be stored directly.
        """
        await self._redis.xadd(
            self._stream,
            {"topic": topic, "payload": json.dumps(payload, default=str)},
            maxlen=self._maxlen,
            approximate=True,
        )

    # --- decoding ---------------------------------------------------------

    @staticmethod
    def _decode(
        fields: dict[str, str], subscribed_topic: str
    ) -> tuple[str, dict[str, Any] | None]:
        """Return (topic, message) for one raw stream entry.

        `message` is None when the entry is unreadable; the caller still acks
        it, because a corrupt entry that is never acked would be reclaimed and
        retried forever.

        The message shape is preserved exactly from the pub/sub implementation
        so no consumer needs changing: a "*" subscriber receives the payload
        with `topic` merged in, an exact-topic subscriber receives the bare
        payload.
        """
        topic = fields.get("topic") or ""
        raw = fields.get("payload")
        if raw is None:
            return topic, None
        try:
            payload = json.loads(raw)
        except (ValueError, TypeError):
            log.warning("event bus: undecodable payload on topic %s — skipping", topic)
            return topic, None
        if not isinstance(payload, dict):
            return topic, None
        if subscribed_topic == "*":
            return topic, {"topic": topic, **payload}
        return topic, payload

    # --- read side: ephemeral --------------------------------------------

    async def subscribe(self, topic: str) -> AsyncIterator[dict[str, Any]]:
        """Live tail from now. No group, no backlog, no acks.

        For the UI WebSocket: a disconnecting client should leave no state
        behind. Events published while nobody is tailing are simply not seen by
        this subscriber — they remain in the stream for the durable consumers.
        """
        last_id = "$"
        while True:
            try:
                resp = await self._redis.xread(
                    {self._stream: last_id}, block=DEFAULT_BLOCK_MS, count=100
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("event bus: xread failed — retrying")
                await asyncio.sleep(1.0)
                continue
            for _stream, entries in resp or []:
                for entry_id, fields in entries:
                    last_id = entry_id
                    entry_topic, message = self._decode(fields, topic)
                    if message is None:
                        continue
                    if topic != "*" and entry_topic != topic:
                        continue
                    yield message

    # --- read side: durable ----------------------------------------------

    async def _ensure_group(self, group: str) -> None:
        """Create the consumer group if absent, creating the stream with it.

        `id="0"` starts a brand-new group at the beginning of the retained
        stream rather than at the tail, so standing up a new consumer backfills
        from history instead of silently skipping everything already published.
        """
        try:
            await self._redis.xgroup_create(self._stream, group, id="0", mkstream=True)
            log.info("event bus: created consumer group %s on %s", group, self._stream)
        except Exception as exc:
            # redis-py raises ResponseError("BUSYGROUP ...") when it exists.
            if "BUSYGROUP" not in str(exc):
                raise

    async def _reclaim_pending(
        self, topic: str, group: str, consumer: str, claim_idle_ms: int
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield messages this group left in-flight during a previous run."""
        cursor = "0-0"
        while True:
            try:
                next_cursor, claimed, _ = await self._redis.xautoclaim(
                    self._stream,
                    group,
                    consumer,
                    min_idle_time=claim_idle_ms,
                    start_id=cursor,
                    count=100,
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("event bus: xautoclaim failed for group %s", group)
                return
            if not claimed:
                return
            log.info(
                "event bus: reclaimed %d stale pending message(s) for group %s",
                len(claimed),
                group,
            )
            for entry_id, fields in claimed:
                entry_topic, message = self._decode(fields, topic)
                if message is None or (topic != "*" and entry_topic != topic):
                    # Nothing was handed to the consumer, so ack immediately.
                    await self._redis.xack(self._stream, group, entry_id)
                    continue
                yield message
                # * Reached only when the consumer comes back for the next
                # * message. Deliberately NOT in a `finally`: if the consumer
                # * abandons this generator (process dying mid-handler) the ack
                # * must NOT happen, so the entry stays in the PEL and is
                # * reclaimed. A `finally` would also `await` during
                # * GeneratorExit, which is illegal in an async generator.
                await self._redis.xack(self._stream, group, entry_id)
            # "0-0" means the pending scan is complete.
            if next_cursor in ("0-0", 0, None):
                return
            cursor = next_cursor

    async def subscribe_durable(
        self,
        topic: str,
        *,
        group: str,
        consumer: str = "default",
        block_ms: int = DEFAULT_BLOCK_MS,
        claim_idle_ms: int = DEFAULT_CLAIM_IDLE_MS,
    ) -> AsyncIterator[dict[str, Any]]:
        """At-least-once consumer-group read.

        Each distinct `group` gets its own independent copy of the stream —
        that is what preserves the fan-out the three consumers rely on. Two
        consumers sharing a group would *split* events between them, which
        would be a silent correctness bug, so every caller must pass a group
        name unique to its role (see runtime/consumer_groups.py).
        """
        await self._ensure_group(group)

        # Recover in-flight work from a previous run before taking new work.
        async for message in self._reclaim_pending(topic, group, consumer, claim_idle_ms):
            yield message

        while True:
            try:
                resp = await self._redis.xreadgroup(
                    group, consumer, {self._stream: ">"}, block=block_ms, count=100
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception(
                    "event bus: xreadgroup failed for group %s — retrying", group
                )
                await asyncio.sleep(1.0)
                continue
            for _stream, entries in resp or []:
                for entry_id, fields in entries:
                    entry_topic, message = self._decode(fields, topic)
                    if message is None or (topic != "*" and entry_topic != topic):
                        # Ack a filtered-out or corrupt entry straight away —
                        # otherwise it stays pending and is reclaimed forever.
                        await self._redis.xack(self._stream, group, entry_id)
                        continue
                    yield message
                    # * Ack on resume, not in a `finally` — see the note in
                    # * _reclaim_pending. This is what makes a consumer that
                    # * dies mid-handler recoverable rather than silently lossy.
                    await self._redis.xack(self._stream, group, entry_id)


def build_event_bus(redis_url: str | None) -> EventBus:
    if redis_url:
        try:
            return RedisEventBus(redis_url)
        except Exception:
            # Loud fallback: a misconfigured REDIS_URL in production silently
            # downgrades the deployment to in-memory pub/sub, breaking cross-
            # worker fan-out (webhook → bus → workflow trigger). Log at WARNING
            # so this shows up in Railway logs and ops can fix the URL.
            log.warning(
                "build_event_bus: REDIS_URL set but RedisEventBus failed to "
                "construct — falling back to InMemoryEventBus. Cross-worker "
                "events will NOT be delivered.",
                exc_info=True,
            )
    return InMemoryEventBus()
