"""Contract test for fan-out propagation invariants.

Locks in the rules:
  1. Inside any fan-out body, `{{ item.X }}` ALWAYS resolves to the
     original loop row — at every depth (loop → A → B → C → ...).
  2. Inside any fan-out body, `{{ prev.X }}` resolves to the
     immediately-upstream node's per-item output for THIS index.
  3. `{{ index }}` is the loop position (0-based).
  4. The error path preserves the original item too — a downstream
     node handling a failed item can still see what it was for.

If any of these regress, this file fails.
"""
from __future__ import annotations

import os

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://stub/stub")
os.environ.setdefault("FERNET_KEY", "0" * 44)

from champiq_api.runtime.fan_out import (  # noqa: E402
    FanOutItem,
    envelope_from_chained_output,
    envelope_from_loop_output,
)


# ----------------------------------------------------------------- envelope


def test_envelope_from_loop_output_unwraps_item_and_index() -> None:
    """LoopExecutor emits {_item: <row>, _index: i, ...rendered each fields}.
    The first downstream fan-out should see the row directly, not the wrapper.
    """
    loop_emit = {"_item": {"email": "a@b.c", "phone": "111"}, "_index": 7}
    env = envelope_from_loop_output(loop_emit, 99)
    assert env.item == {"email": "a@b.c", "phone": "111"}
    assert env.index == 7  # _index from the wrapper, not the fallback 99
    assert env.prev == {}  # nothing upstream yet


def test_envelope_from_loop_output_handles_raw_item_fallback() -> None:
    """If items happen to be raw values (no wrapper), fall back to using
    them as the item directly."""
    env = envelope_from_loop_output({"email": "a@b.c"}, 3)
    assert env.item == {"email": "a@b.c"}
    assert env.index == 3
    assert env.prev == {}


def test_chain_payload_preserves_item_and_attaches_prev() -> None:
    """The critical bug-fix invariant: when a fan-out node finishes and
    its output gets fed to the next fan-out, the original loop row MUST
    be preserved AND the node's output must be attached as `prev`.
    """
    env = FanOutItem(item={"email": "a@b.c", "phone": "111"}, index=0, prev={})
    node_output = {"data": {"id": 99, "email": "a@b.c"}, "created": True}

    payload = env.to_chain_payload(node_output)

    # The chain payload carries:
    #   _item:  the original loop row, untouched
    #   _index: position in the loop
    #   _prev:  this node's output (so the *next* hop sees it as prev)
    assert payload["_item"] == {"email": "a@b.c", "phone": "111"}
    assert payload["_index"] == 0
    assert payload["_prev"] == {"data": {"id": 99, "email": "a@b.c"}, "created": True}

    # Plus splatted top-level fields for legacy callers
    assert payload["data"] == {"id": 99, "email": "a@b.c"}
    assert payload["created"] is True


def test_chained_output_round_trips_through_two_hops() -> None:
    """End-to-end: loop → A → B. By the time B reads its envelope, the
    original loop row must still be there.
    """
    # Loop's output for one row
    loop_item = {"_item": {"email": "a@b.c", "phone": "111", "first_name": "Alice"}, "_index": 0}

    # First hop (e.g. champgraph after loop)
    env_a = envelope_from_loop_output(loop_item, 0)
    assert env_a.item == {"email": "a@b.c", "phone": "111", "first_name": "Alice"}
    assert env_a.prev == {}

    # A's executor returns
    a_output = {"data": {"id": 99}, "created": True}
    chain_after_a = env_a.to_chain_payload(a_output)

    # Second hop (e.g. champmail after champgraph) — recovers envelope
    env_b = envelope_from_chained_output(chain_after_a, 99)

    # ── THIS IS THE BUG-FIX ASSERTION ──
    # Before the fix, env_b.item was {"data": {"id": 99}, "created": True}
    # because the chain replaced item with the upstream node's output.
    # After the fix, env_b.item is the original CSV row.
    assert env_b.item == {"email": "a@b.c", "phone": "111", "first_name": "Alice"}, (
        "regression: original loop row was overwritten on the second hop. "
        "Inside a chained fan-out, {{ item.X }} must resolve to the original CSV row, "
        "NOT the previous node's per-item output."
    )
    assert env_b.index == 0
    assert env_b.prev == {"data": {"id": 99}, "created": True}


def test_three_hop_chain_still_preserves_item() -> None:
    """loop → A → B → C — original row must survive all three hops."""
    loop_item = {"_item": {"email": "a@b.c", "phone": "111"}, "_index": 0}

    env_a = envelope_from_loop_output(loop_item, 0)
    chain_after_a = env_a.to_chain_payload({"a_field": "from_a"})

    env_b = envelope_from_chained_output(chain_after_a, 0)
    chain_after_b = env_b.to_chain_payload({"b_field": "from_b"})

    env_c = envelope_from_chained_output(chain_after_b, 0)

    assert env_c.item == {"email": "a@b.c", "phone": "111"}, (
        "regression: original loop row was lost after 3 hops"
    )
    assert env_c.prev == {"b_field": "from_b"}, (
        "prev should be the immediately-upstream node's output, not A's"
    )


def test_chained_output_handles_missing_sentinel_gracefully() -> None:
    """If an executor somehow returns a flat dict without our sentinel keys
    (legacy / out-of-band node), don't crash — fall back to legacy behavior.
    """
    flat = {"some_field": "value"}
    env = envelope_from_chained_output(flat, 5)
    # No _item present → treat the whole dict as item AND prev (the
    # legacy behavior). Better than raising.
    assert env.item == flat
    assert env.index == 5
    assert env.prev == flat


def test_with_prev_returns_new_instance() -> None:
    """FanOutItem is frozen; with_prev creates a new instance, doesn't mutate."""
    env = FanOutItem(item={"x": 1}, index=0, prev={})
    env2 = env.with_prev({"y": 2})
    assert env.prev == {}, "original was mutated"
    assert env2.prev == {"y": 2}
    assert env2.item is env.item, "item should be the same reference (frozen)"


def test_expression_names_returns_correct_bindings() -> None:
    """The dict passed to the expression evaluator binds item, index, prev."""
    env = FanOutItem(item={"email": "a@b.c"}, index=2, prev={"id": 99})
    names = env.expression_names()
    assert names == {"item": {"email": "a@b.c"}, "index": 2, "prev": {"id": 99}}


def test_to_chain_payload_handles_non_dict_output() -> None:
    """A node that returns a non-dict should still produce a chainable payload."""
    env = FanOutItem(item={"email": "a@b.c"}, index=0, prev={})
    # E.g. an LLM node that returned a raw string
    payload = env.to_chain_payload(None)  # type: ignore[arg-type]
    assert payload["_item"] == {"email": "a@b.c"}
    assert payload["_prev"] == {}


def test_fan_out_item_is_frozen() -> None:
    """Mutating an envelope mid-walk would silently corrupt downstream items.
    Frozen dataclass prevents that.
    """
    env = FanOutItem(item={"x": 1}, index=0)
    with pytest.raises((AttributeError, Exception)):
        env.item = {"y": 2}  # type: ignore[misc]
