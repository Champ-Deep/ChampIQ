"""ChampGraph dispatcher — routes canvas champgraph actions to the right backend.

Three backends:
  - ChampMail Postgres   for prospect-CRUD actions (already has the data)
  - Graphiti HTTP        for graph-memory and AI-campaign-pipeline actions
  - degraded             for graph/campaign actions when Graphiti is unreachable

The split exists because Graphiti is account-centric (episodes attached to an
account) while ChampMail is prospect-centric (one row per email). Both are
useful — neither owns the other's data.
"""
from .node import ChampGraphLocalExecutor
from .service import (
    ChampGraphService,
    GraphitiClient,
    GRAPH_ACTIONS,
    CAMPAIGN_ACTIONS,
    PROSPECT_ACTIONS,
)

__all__ = [
    "ChampGraphService",
    "ChampGraphLocalExecutor",
    "GraphitiClient",
    "GRAPH_ACTIONS",
    "CAMPAIGN_ACTIONS",
    "PROSPECT_ACTIONS",
]
