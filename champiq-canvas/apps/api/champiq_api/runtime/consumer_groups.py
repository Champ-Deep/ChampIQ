"""Redis Streams consumer-group names — one per consumer *role*.

Why this file exists
--------------------
With Redis Streams, every consumer that needs its own copy of the event stream
must read under its own group. Two consumers sharing a group do not both get
each event — the group *splits* events between them. That failure is silent:
the graph would receive roughly half the events, the ledger the other half, and
nothing would error.

Keeping the names in one place, as constants, makes an accidental collision a
visible edit to this file rather than a string typo in a constructor default.

Renaming a constant resets that consumer's position: the old group keeps its
last-delivered id and the new group is created at `id="0"`, so the consumer
replays the whole retained stream once. That is usually the desired behaviour
after a bug fix (re-drive history through the corrected handler) but it is not
free — do it deliberately.
"""
from __future__ import annotations

# Dispatches event-triggered workflow DAGs.
WORKFLOW_TRIGGERS = "champiq.workflow_triggers"

# Writes email/call/social events into Cham_Graph via its hooks.
GRAPH_WRITEBACK = "champiq.graph_writeback"

# Records every topic into run_ledger for per-client health.
RUN_LEDGER = "champiq.run_ledger"

# Forwards canonical events to Harbinger's shared lead store (touchpoints +
# lead_events). See ChampHarbinger POST /api/v1/leads/events.
CANONICAL_STORE = "champiq.canonical_store"
