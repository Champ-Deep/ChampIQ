"""ChampGraph (Graphiti) driver.

HTTP-fronted semantic graph — used for prospect/company enrichment and NL
queries like "prospects at fintech companies who replied in the last 7 days."
"""
from __future__ import annotations

from typing import Any

from .base import HttpToolDriver


class ChampGraphDriver(HttpToolDriver):
    tool_id = "champgraph"

    actions: dict[str, dict[str, Any]] = {
        "ingest_prospect": {"method": "POST", "path": "/api/ingest/prospect", "auth": "api_key"},
        "ingest_company": {"method": "POST", "path": "/api/ingest/company", "auth": "api_key"},
        "semantic_search": {"method": "POST", "path": "/api/query", "auth": "api_key"},
        "nl_query": {"method": "POST", "path": "/api/chat", "auth": "api_key"},
        "add_relationship": {"method": "POST", "path": "/api/relationships", "auth": "api_key"},
        "get_stats": {"method": "GET", "path": "/api/stats", "auth": "api_key"},
    }

    def _build_headers(self, auth_kind: str, credentials: dict[str, Any]) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if auth_kind == "api_key" and credentials.get("api_key"):
            headers["X-API-Key"] = credentials["api_key"]
        return headers
