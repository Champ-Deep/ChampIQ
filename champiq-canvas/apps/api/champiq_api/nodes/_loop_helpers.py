"""Loop-node helpers — pure single-responsibility components.

LoopExecutor was a 90-line method doing six different things at once:
  - resolve the items expression
  - auto-detect items from upstream input when expression is empty
  - validate the resolved value is iterable
  - parse cadence config
  - render the per-item `each` template
  - build the output envelope

This module breaks each step into its own helper, all of them pure /
side-effect-free / unit-testable. The executor itself becomes a thin
orchestrator that wires them together.

SOLID payoff:
  - Single Responsibility: each helper has one reason to change.
  - Open/Closed: adding a new auto-detect heuristic touches one
    function (find_items_in_input), not the executor.
  - Liskov: the executor's external behavior (input/output shape) is
    preserved exactly — tests on the executor stay green.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

# Cadence mode names. Centralized here so LoopExecutor can reference them
# without re-declaring constants.
LOOP_MODE_PARALLEL = "parallel"
LOOP_MODE_SEQUENTIAL = "sequential"
LOOP_MODE_PACED = "paced"
_VALID_MODES = (LOOP_MODE_PARALLEL, LOOP_MODE_SEQUENTIAL, LOOP_MODE_PACED)

# Names commonly used by upstream nodes for list outputs. Order matters —
# we pick the first match, with `items` (csv.upload) winning.
_LIST_FIELD_PREFERENCES = (
    "items",       # csv.upload, trigger.manual.payload, loop output
    "records",     # generic CSV/Excel parsers
    "prospects",   # champgraph list_prospects
    "results",     # generic
    "rows",        # generic
    "data",        # generic — last resort
)


# ────────────────────────────────────────────────────────────────────── cadence


@dataclass(frozen=True)
class LoopCadence:
    """Validated cadence config — see LoopExecutor docstring for semantics."""
    mode: str
    concurrency: int
    pace_seconds: int
    initial_delay_seconds: int
    jitter_seconds: int
    stop_on_error: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "concurrency": self.concurrency,
            "pace_seconds": self.pace_seconds,
            "initial_delay_seconds": self.initial_delay_seconds,
            "jitter_seconds": self.jitter_seconds,
            "stop_on_error": self.stop_on_error,
        }


def parse_cadence(cfg: dict[str, Any]) -> LoopCadence:
    """Read mode/concurrency/pace from config with safe defaults + clamping.

    Pure function. Never raises — invalid mode names fall back to "parallel".
    Numeric clamps prevent negative or absurdly-large values.
    """
    mode = (cfg.get("mode") or LOOP_MODE_PARALLEL).strip().lower()
    if mode not in _VALID_MODES:
        mode = LOOP_MODE_PARALLEL

    concurrency = max(int(cfg.get("concurrency", 1) or 1), 1)
    # paced mode forces concurrency=1 — running paced items in parallel is
    # contradictory (you can't both fix the inter-start gap AND start them
    # together).
    if mode == LOOP_MODE_PACED:
        concurrency = 1

    return LoopCadence(
        mode=mode,
        concurrency=concurrency,
        pace_seconds=max(int(cfg.get("pace_seconds", 0) or 0), 0),
        initial_delay_seconds=max(int(cfg.get("initial_delay_seconds", 0) or 0), 0),
        jitter_seconds=max(int(cfg.get("jitter_seconds", 0) or 0), 0),
        stop_on_error=bool(cfg.get("stop_on_error", False)),
    )


# ────────────────────────────────────────────────────────── items resolution


def find_items_in_input(node_input: Any) -> tuple[list[Any], str] | None:
    """Auto-detect the items list when the loop has no `items` expression.

    Returns (the list, the field name we found it under), or None.

    Searches upstream `ctx.input` in this order:
      1. ctx.input.payload.items   (trigger.manual / trigger.webhook output)
      2. ctx.input.<preferred>     (csv.upload → items, list_prospects → prospects, ...)
      3. the first list-valued top-level field as a last resort

    Pure — never raises, returns None when nothing list-shaped is found.
    """
    if not isinstance(node_input, dict):
        return None

    # 1. Look under `payload` first (the trigger output convention).
    payload = node_input.get("payload")
    if isinstance(payload, dict):
        for key in _LIST_FIELD_PREFERENCES:
            v = payload.get(key)
            if isinstance(v, list):
                return v, f"payload.{key}"

    # 2. Walk preferred top-level keys.
    for key in _LIST_FIELD_PREFERENCES:
        v = node_input.get(key)
        if isinstance(v, list):
            return v, key

    # 3. Last resort — any top-level list-valued field.
    for k, v in node_input.items():
        if isinstance(v, list) and not k.startswith("_"):
            return v, k

    return None


def coerce_to_items_list(
    rendered: Any,
    raw_expr: Any,
    upstream_input: Any,
) -> list[Any]:
    """Turn whatever the loop's `items` field rendered into a list.

    Order:
      1. Already a list → use it.
      2. None / empty / not-yet-rendered → auto-detect from upstream input.
      3. A single dict → wrap as 1-element list (forgiving for "send one").
      4. A scalar → wrap as 1-element list.
      5. Anything else → raise TypeError with full diagnostic.

    Friendly default: if the upstream auto-detect succeeds, we use that
    instead of failing — much better UX when the LLM forgot the items
    expression but wired the correct upstream node.
    """
    # 1. Happy path
    if isinstance(rendered, list):
        return rendered

    # 2. Empty / None — try to auto-detect
    if rendered in (None, "", [], {}):
        detected = find_items_in_input(upstream_input)
        if detected is not None:
            items, field = detected
            return items
        # fall through to the strict error below

    # 3-4. Single dict / scalar — wrap as 1-element list. Forgiving: lets
    # users iterate a single record without ceremony.
    if isinstance(rendered, dict):
        return [rendered]

    # 5. Strict failure — raise a clear, actionable TypeError
    actual_type = type(rendered).__name__
    sample = repr(rendered)[:120]
    raise TypeError(
        f"loop.items must render to a list, got {actual_type}: {sample}\n"
        f"  configured expression: {raw_expr!r}\n"
        f"  Common causes:\n"
        f"    - the expression resolved to None — check the upstream node "
        f"actually outputs the field you're reading. csv.upload emits 'items'; "
        f"champgraph list_prospects emits 'prospects'; most action nodes emit "
        f"single-record outputs (no list at all).\n"
        f"    - 'prev.items' inside a chained fan-out reads the previous node's "
        f"output for THIS item, not the loop's full list. To iterate the original "
        f"list inside a body, use {{{{ trigger.payload.items }}}} or wire the "
        f"loop directly off the source node.\n"
        f"    - the upstream node returned a single dict — wrap it in [] if you "
        f"meant to iterate one record."
    )


def cap_items(items: list[Any], max_items_raw: Any) -> list[Any]:
    """Apply max_items if configured. None / 0 / empty-string = no cap."""
    if max_items_raw in (None, "", 0):
        return items
    try:
        cap = int(max_items_raw)
    except (TypeError, ValueError):
        return items
    if cap <= 0:
        return items
    return items[:cap]


# ────────────────────────────────────────────────────────── per-item rendering


def render_each_template(
    template: dict[str, Any] | None,
    items: list[Any],
    *,
    base_expression_context: dict[str, Any],
    upstream_input: dict[str, Any] | None,
    evaluator_evaluate: Callable[[Any, dict[str, Any]], Any],
) -> list[dict[str, Any]]:
    """Render the per-item `each` template for every item.

    Each output entry is `{_item: <raw>, _index: i, **rendered_each}` —
    the orchestrator's fan-out runner consumes this shape (see
    runtime/fan_out.py envelope_from_loop_output).

    Pure — takes its dependency (the evaluator) as a callable so this
    function is unit-testable without spinning up the full evaluator.
    """
    if not items:
        return []

    def _make_sub_ctx(item: Any, index: int) -> dict[str, Any]:
        sub = dict(base_expression_context)
        sub["item"] = item
        sub["index"] = index
        # Inside the `each` rendering, `prev` is the loop's own input
        # plus the item/index handles. This preserves the historical
        # behavior of LoopExecutor — see SOLID note in LoopExecutor.
        sub["prev"] = {"item": item, "index": index, **(upstream_input or {})}
        return sub

    out: list[dict[str, Any]] = []
    for i, item in enumerate(items):
        if not template:
            out.append({"_item": item, "_index": i})
            continue
        sub = _make_sub_ctx(item, i)
        rendered = evaluator_evaluate(template, sub)
        base = rendered if isinstance(rendered, dict) else {"value": rendered}
        out.append({"_item": item, "_index": i, **base})
    return out
