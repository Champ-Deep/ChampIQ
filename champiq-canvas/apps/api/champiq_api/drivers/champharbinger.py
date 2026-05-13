"""ChampHarbinger driver — connects to a self-hosted ChampHarbinger instance.

Auth: Bearer token stored in credential as `api_key` (prefix `chh_`).
The base URL is configured via the CHAMPHARBINGER_URL environment variable.
"""
from __future__ import annotations

from typing import Any

from .base import HttpToolDriver


class ChampHarbingerDriver(HttpToolDriver):
    tool_id = "champharbinger"

    actions: dict[str, dict[str, Any]] = {
        "list_signals":            {"method": "GET",  "path": "/api/v1/signals",                  "auth": "bearer"},
        "run_signal":              {"method": "POST", "path": "/api/v1/signals/run",               "auth": "bearer"},
        "discover_companies":      {"method": "POST", "path": "/api/v1/discover",                  "auth": "bearer"},
        "enrich_company":          {"method": "POST", "path": "/api/v1/enrich/company",            "auth": "bearer"},
        "enrich_contact":          {"method": "POST", "path": "/api/v1/enrich/contact",            "auth": "bearer"},
        "get_qualified_prospects": {"method": "GET",  "path": "/api/v1/prospects/qualified",       "auth": "bearer"},
    }

    def _build_headers(self, auth_kind: str, credentials: dict[str, Any]) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if auth_kind == "bearer":
            token = credentials.get("api_key", "")
            if token:
                headers["Authorization"] = f"Bearer {token}"
        return headers
