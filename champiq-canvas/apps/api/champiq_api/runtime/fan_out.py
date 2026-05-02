"""Fan-out envelope + propagation.

Single source of truth for what `{{ item.* }}`, `{{ prev.* }}`, and
`{{ index }}` mean inside a loop body — including chained fan-out nodes.

Why a dedicated module
----------------------
The orchestrator used to inline this logic, which conflated two distinct
things into one variable named `item`:

  1. The original loop row (CSV row, JSON object, ...).
  2. The immediately-previous node's per-item output.

After one hop downstream, `item` was the original row; after two hops,
`item` was overwritten by the previous node's per-item result and the
original row was lost. Workflows that did
   loop -> champgraph -> champmail
broke because champmail's `{{ item.email }}` resolved to whatever
champgraph returned, not to the CSV row.

The envelope below preserves both concepts in separate slots so they
can never overwrite each other:

  - `FanOutItem.item`  → the ORIGINAL loop row, immutable across the chain
  - `FanOutItem.prev`  → the immediately-upstream node's per-item output
  - `FanOutItem.index` → loop position

Expression resolution maps `{{ item.X }}` → envelope.item[X] and
`{{ prev.X }}` → envelope.prev[X], so the same expressions a workflow
already uses keep working — they just resolve to the right value at
every depth.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# Sentinel keys we attach to fan-out outputs so the next downstream fan-out
# can recover the original loop row + prior upstream output. They start with
# underscores so they don't collide with user data fields.
ITEM_KEY = "_item"
INDEX_KEY = "_index"
PREV_KEY = "_prev"
FAN_OUT_ITEMS_KEY = "_fan_out_items"
CADENCE_KEY = "_cadence"


@dataclass(frozen=True)
class FanOutItem:
    """One entry in a fan-out — original row + immediately-prior result.

    Frozen because mutating these mid-walk would silently corrupt downstream
    iterations. Builders below construct new instances rather than edit.
    """
    item: Any
    """The ORIGINAL loop-row from the upstream loop node. Preserved
    across the entire chain regardless of how many fan-out nodes have run."""

    index: int
    """Position in the loop (0-based)."""

    prev: dict[str, Any] = field(default_factory=dict)
    """The immediately-upstream node's per-item output for this index.
    Empty dict for the first node downstream of a loop."""

    def expression_names(self) -> dict[str, Any]:
        """The names bound when evaluating expressions inside this body."""
        return {"item": self.item, "index": self.index, "prev": self.prev}

    def with_prev(self, new_prev: dict[str, Any]) -> "FanOutItem":
        """Return a copy with `prev` replaced — used when chaining."""
        return FanOutItem(item=self.item, index=self.index, prev=dict(new_prev or {}))

    def to_chain_payload(self, node_output: dict[str, Any]) -> dict[str, Any]:
        """Serialize as one entry of the next-hop `_fan_out_items` list.

        Carries forward both the original row (so future hops can still see
        `{{ item.X }}`) and the current node's output (so future hops can
        read `{{ prev.X }}`). The output is also splatted at the top level
        so legacy callers that read raw fields off the chained payload
        keep working.
        """
        payload: dict[str, Any] = {}
        if isinstance(node_output, dict):
            payload.update(node_output)
        payload[ITEM_KEY] = self.item
        payload[INDEX_KEY] = self.index
        payload[PREV_KEY] = dict(node_output) if isinstance(node_output, dict) else {}
        return payload


def envelope_from_loop_output(item: Any, index: int) -> FanOutItem:
    """Build a fresh envelope from a loop's `items[i]` entry.

    Loop nodes emit `{"_item": <row>, "_index": i, ...rendered each fields}`.
    For the first downstream hop, `prev` is empty — there's no per-item
    upstream node yet (the loop itself is the upstream, but its output
    is the items list, not a per-item result).
    """
    if isinstance(item, dict) and ITEM_KEY in item:
        return FanOutItem(item=item[ITEM_KEY], index=int(item.get(INDEX_KEY, index)), prev={})
    return FanOutItem(item=item, index=index, prev={})


def envelope_from_chained_output(payload: Any, fallback_index: int) -> FanOutItem:
    """Rebuild the envelope from a previous fan-out node's chained payload.

    Reads the sentinel keys we wrote in `to_chain_payload`. Falls back
    gracefully if a node executor returns a flat dict without our markers
    (treats the whole dict as both item + prev — the legacy behavior, only
    hit when an executor doesn't go through the fan-out runner).
    """
    if isinstance(payload, dict) and ITEM_KEY in payload:
        return FanOutItem(
            item=payload.get(ITEM_KEY),
            index=int(payload.get(INDEX_KEY, fallback_index)),
            prev=payload.get(PREV_KEY) or {},
        )
    # Legacy / non-fan-out source: treat the whole payload as both item and prev.
    base = payload if isinstance(payload, dict) else {"value": payload}
    return FanOutItem(item=base, index=fallback_index, prev=base)
