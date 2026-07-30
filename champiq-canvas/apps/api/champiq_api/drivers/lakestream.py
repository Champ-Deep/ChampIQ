"""LakeStream driver — scraping, enrichment and ATS job-board ingestion.

LakeStream had no manifest and no driver, so the whole scraping/enrichment
capability was unreachable from a canvas DAG. The front of the funnel was
therefore not config-driven: getting companies into the system meant running
`e2e/champset_bridge.mjs` or `e2e/leads_bridge.py` by hand.

The job-board actions matter most for outreach. A new posting on a company's
Greenhouse/Lever/Ashby board is a hiring signal, and signal-triggered outreach
is the largest single lever on reply rate in the benchmarks — several times
larger than anything infrastructure spend can buy. Making `fetch_jobs_batch` a
DAG node is what turns that from a script into an automation.

Paths verified against LakeStream's router (src/api/router.py) on 2026-07-30.
"""
from __future__ import annotations

from typing import Any

from .base import HttpToolDriver


class LakeStreamDriver(HttpToolDriver):
    tool_id = "lakestream"

    actions = {
        # --- ATS job boards (hiring signal) --------------------------------
        "fetch_jobs": {
            "method": "POST", "path": "/api/jobs/board", "auth": "bearer",
        },
        "fetch_jobs_batch": {
            "method": "POST", "path": "/api/jobs/boards/batch", "auth": "bearer",
        },

        # --- scraping -------------------------------------------------------
        # * /scrape/extract escalates PLAYWRIGHT -> PLAYWRIGHT_PROXY on a block
        # * or captcha and returns tier_used + cost_usd, so a DAG can see what a
        # * page actually cost rather than assuming the cheapest tier.
        "scrape": {"method": "POST", "path": "/api/scrape", "auth": "bearer"},
        "extract": {"method": "POST", "path": "/api/scrape/extract", "auth": "bearer"},

        # --- discovery ------------------------------------------------------
        "discover_search": {"method": "POST", "path": "/api/discover/search", "auth": "bearer"},
        "discover_status": {"method": "GET", "path": "/api/discover/status/{discovery_id}", "auth": "bearer"},

        # --- domains / tracking ---------------------------------------------
        "list_domains": {"method": "GET", "path": "/api/domains", "auth": "bearer"},
        "domain_stats": {"method": "GET", "path": "/api/domains/{domain}/stats", "auth": "bearer"},
        "track_domain": {"method": "POST", "path": "/api/tracked", "auth": "bearer"},
        "list_tracked": {"method": "GET", "path": "/api/tracked", "auth": "bearer"},

        # --- exports ---------------------------------------------------------
        "export_csv": {"method": "GET", "path": "/api/export/csv/{job_id}", "auth": "bearer"},
        "export_json": {"method": "GET", "path": "/api/export/json/{job_id}", "auth": "bearer"},

        # --- health ----------------------------------------------------------
        "health": {"method": "GET", "path": "/api/health", "auth": "none"},
        "proxy_health": {"method": "GET", "path": "/api/health/proxies", "auth": "bearer"},
    }

    def _build_headers(self, auth_kind: str, credentials: dict[str, Any]) -> dict[str, str]:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if auth_kind == "bearer":
            token = credentials.get("api_key") or credentials.get("token") or ""
            if token:
                headers["Authorization"] = f"Bearer {token}"
        return headers
