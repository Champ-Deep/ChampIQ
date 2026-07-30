"""Redis Streams event bus — the durability properties pub/sub could not give.

Each test names the specific production failure it prevents. The old
`redis.publish()` transport fails every test in this file.

fakeredis implements XADD/XREADGROUP/XACK/XAUTOCLAIM, so these are real
protocol assertions, not mocks of our own code.
"""
from __future__ import annotations

import asyncio

import fakeredis.aioredis
import pytest

from champiq_api.runtime import consumer_groups
from champiq_api.runtime.bus import InMemoryEventBus, RedisEventBus


def _bus() -> RedisEventBus:
    """A RedisEventBus backed by fakeredis, bypassing from_url()."""
    bus = RedisEventBus.__new__(RedisEventBus)
    bus._redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    bus._stream = "champiq:events:test"
    bus._maxlen = 1000
    return bus


async def _drain(agen, count: int, timeout: float = 5.0) -> list[dict]:
    """Pull `count` messages from an async generator, then close it."""
    out: list[dict] = []

    async def _pull() -> None:
        async for msg in agen:
            out.append(msg)
            if len(out) >= count:
                return

    try:
        await asyncio.wait_for(_pull(), timeout=timeout)
    except asyncio.TimeoutError:
        pass
    finally:
        await agen.aclose()
    return out


@pytest.mark.asyncio
async def test_events_published_before_any_consumer_exists_are_still_delivered():
    """The core regression.

    Pub/sub dropped anything published while no subscriber was connected. A
    consumer restart therefore silently lost every event in the gap. A stream
    consumer group created at id=0 backfills from retained history instead.
    """
    bus = _bus()

    await bus.publish("email.sent", {"message_id": "m1"})
    await bus.publish("email.sent", {"message_id": "m2"})

    # Consumer starts only now — after both events were published.
    got = await _drain(
        bus.subscribe_durable("*", group=consumer_groups.GRAPH_WRITEBACK), 2
    )

    assert [m["message_id"] for m in got] == ["m1", "m2"]


@pytest.mark.asyncio
async def test_each_group_receives_its_own_full_copy():
    """Fan-out must survive the transport change.

    Three consumers subscribe to "*". If they shared a consumer group, Redis
    would *split* events between them — the graph would get roughly half and
    the ledger the other half, with nothing erroring. Distinct groups are what
    prevent that, which is why consumer_groups.py exists.
    """
    bus = _bus()
    await bus.publish("email.sent", {"message_id": "only-one"})

    for group in (
        consumer_groups.WORKFLOW_TRIGGERS,
        consumer_groups.GRAPH_WRITEBACK,
        consumer_groups.RUN_LEDGER,
    ):
        got = await _drain(bus.subscribe_durable("*", group=group), 1)
        assert [m["message_id"] for m in got] == ["only-one"], f"group {group} missed it"


@pytest.mark.asyncio
async def test_unacked_message_is_reclaimed_after_a_crash():
    """A process killed mid-handler must not lose the message it was holding.

    Simulated by reading one message under a group and never acking it (the
    generator is abandoned before it advances), then starting a fresh consumer
    in the same group with a zero idle threshold so XAUTOCLAIM reclaims it.
    """
    bus = _bus()
    await bus.publish("email.sent", {"message_id": "in-flight"})

    # Consumer A: takes delivery, then "crashes" before the ack.
    agen = bus.subscribe_durable("*", group=consumer_groups.RUN_LEDGER, consumer="A")
    first = await asyncio.wait_for(agen.__anext__(), timeout=5.0)
    assert first["message_id"] == "in-flight"
    await agen.aclose()  # no ack — the entry stays in the group's PEL

    # Consumer B: same group, reclaims anything idle.
    got = await _drain(
        bus.subscribe_durable(
            "*", group=consumer_groups.RUN_LEDGER, consumer="B", claim_idle_ms=0
        ),
        1,
    )
    assert [m["message_id"] for m in got] == ["in-flight"]


@pytest.mark.asyncio
async def test_wildcard_and_exact_topic_message_shapes_are_unchanged():
    """Consumers were not modified, so the payload shape must not drift.

    "*" subscribers read `message["topic"]`; exact-topic subscribers receive the
    bare payload. Both behaviours come straight from the pub/sub version.
    """
    bus = _bus()
    await bus.publish("email.replied", {"message_id": "r1", "subject": "re: hi"})

    wildcard = await _drain(bus.subscribe_durable("*", group="test.wild"), 1)
    assert wildcard[0]["topic"] == "email.replied"
    assert wildcard[0]["subject"] == "re: hi"

    exact = await _drain(
        bus.subscribe_durable("email.replied", group="test.exact"), 1
    )
    assert "topic" not in exact[0]
    assert exact[0]["message_id"] == "r1"


@pytest.mark.asyncio
async def test_exact_topic_subscription_filters_other_topics():
    bus = _bus()
    await bus.publish("email.bounced", {"message_id": "b1"})
    await bus.publish("email.sent", {"message_id": "s1"})
    await bus.publish("email.bounced", {"message_id": "b2"})

    got = await _drain(
        bus.subscribe_durable("email.bounced", group="test.filter"), 2, timeout=3.0
    )
    assert [m["message_id"] for m in got] == ["b1", "b2"]


@pytest.mark.asyncio
async def test_filtered_out_entries_are_acked_not_left_pending():
    """Unmatched topics must not accumulate in the Pending Entries List.

    If they did, every restart would reclaim an ever-growing backlog of events
    this consumer is never going to handle.

    Note what SHOULD still be pending: the one message that was yielded and
    whose consumer then went away without coming back for another. That entry
    is deliberately unacked — it is the crash-recovery property asserted in
    test_unacked_message_is_reclaimed_after_a_crash. So the expected pending
    count here is exactly 1, not 0; without filter-acking it would be 4.
    """
    bus = _bus()
    for i in range(3):
        await bus.publish("email.sent", {"message_id": f"filtered-{i}"})
    await bus.publish("email.bounced", {"message_id": "b1"})

    got = await _drain(
        bus.subscribe_durable("email.bounced", group="test.ack"), 1, timeout=3.0
    )
    assert [m["message_id"] for m in got] == ["b1"]

    pending = await bus._redis.xpending(bus._stream, "test.ack")
    assert pending["pending"] == 1, (
        "expected only the abandoned in-flight entry to be pending; "
        f"filtered entries were left unacked: {pending}"
    )


@pytest.mark.asyncio
async def test_corrupt_payload_does_not_stall_the_consumer():
    """A malformed entry must be acked and skipped, not retried forever."""
    bus = _bus()
    await bus._redis.xadd(bus._stream, {"topic": "email.sent", "payload": "{not json"})
    await bus.publish("email.sent", {"message_id": "good"})

    got = await _drain(bus.subscribe_durable("*", group="test.corrupt"), 1, timeout=3.0)
    assert [m["message_id"] for m in got] == ["good"]


@pytest.mark.asyncio
async def test_in_memory_bus_still_satisfies_the_durable_interface():
    """Dev/test runs have no Redis; subscribe_durable must degrade, not crash."""
    bus = InMemoryEventBus()
    agen = bus.subscribe_durable("*", group="anything")

    async def _publish_soon() -> None:
        await asyncio.sleep(0.05)
        await bus.publish("email.sent", {"message_id": "mem"})

    task = asyncio.create_task(_publish_soon())
    got = await _drain(agen, 1, timeout=3.0)
    await task
    assert got[0]["message_id"] == "mem"
    assert got[0]["topic"] == "email.sent"
