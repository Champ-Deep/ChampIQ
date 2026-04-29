"""ChampGraph service — single entry point for the `champgraph` canvas tool.

`ChampGraphService.invoke(action, inputs)` is the only public method. It picks
the right backend per action and never raises for "Graphiti unreachable" —
returns {"available": false, "reason": "..."} so the canvas execution can
flow onward (an If/Switch node downstream can branch on it).

Why one big service instead of three small adapters?
    Canvas tool routing is action-keyed. A consumer only knows "I want to do
    `query` against champgraph" — it shouldn't have to know whether `query`
    lives in our Postgres or Graphiti. Routing belongs in one place.

Reachability probe:
    `_is_reachable()` does a 3-second GET /health, result cached for 60s.
    Avoids hammering Graphiti when it's down (and adding latency to every
    canvas tick) while still picking up the recovery within a minute.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Optional

import httpx
from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

from ..champmail.repositories import EnrollmentRepository, EventRepository, ProspectRepository
from ..champmail.models import CMProspect

log = logging.getLogger(__name__)


# Action sets — kept as module-level frozensets so the dispatcher branches are
# O(1) lookups and the action surface is grep-able from one file.
PROSPECT_ACTIONS: frozenset[str] = frozenset({
    "create_prospect",
    "list_prospects",
    "get_prospect_status",
    "bulk_import",
    "enrich_prospect",
})

# Graphiti's account-centric memory + intelligence endpoints. Keep names
# action-style (snake_case verbs) — the underlying URL paths are constructed
# inside `GraphitiClient`.
GRAPH_ACTIONS: frozenset[str] = frozenset({
    # Ingest
    "ingest_episode",
    "ingest_batch",
    "hook_email",
    "hook_email_batch",
    "hook_call",
    # Query
    "query",
    "account_contacts",
    "account_topics",
    "account_communications",
    "account_personal_details",
    "account_team_contacts",
    "account_graph",
    "account_timeline",
    "account_relationships",
    "account_email_context",
    "account_briefing",
    # Intelligence
    "intelligence_salesperson_overlap",
    "intelligence_stakeholder_map",
    "intelligence_engagement_gaps",
    "intelligence_cross_branch",
    "intelligence_opportunities",
    # Sync
    "sync_account",
    "sync_status",
})

CAMPAIGN_ACTIONS: frozenset[str] = frozenset({
    "research_prospects",
    "campaign_essence",
    "campaign_segment",
    "campaign_pitch",
    "campaign_personalize",
    "campaign_html",
    "campaign_preview",
})


# Action → engagement_status normalizer (kept inline — same logic the legacy
# ChampGraphDriver had, ported so canvas Switch nodes branching on
# {{ prev.engagement_status }} keep working).
_PROSPECT_NOT_FOUND: dict[str, Any] = {
    "found": False,
    "engagement_status": "not_found",
    "email_sent": False,
    "email_opened": False,
    "email_replied": False,
    "sequence_active": False,
    "sequence_completed": False,
}


def _normalize_prospect_status(p: CMProspect, *, has_active_enrollment: bool, completed_count: int) -> dict[str, Any]:
    email_sent = bool(p.last_sent_at)
    email_opened = bool(p.last_opened_at)
    email_replied = bool(p.last_replied_at) or p.status == "replied"

    if email_replied:
        status = "replied"
    elif completed_count > 0 and not has_active_enrollment:
        status = "sequence_completed"
    elif has_active_enrollment:
        status = "sequence_active"
    elif email_opened:
        status = "opened"
    elif email_sent:
        status = "sent"
    else:
        status = "cold"

    return {
        "found": True,
        "id": p.id,
        "email": p.email,
        "first_name": p.first_name,
        "last_name": p.last_name,
        "company": p.company,
        "title": p.title,
        "status": p.status,
        "engagement_status": status,
        "email_sent": email_sent,
        "email_opened": email_opened,
        "email_replied": email_replied,
        "sequence_active": has_active_enrollment,
        "sequence_completed": completed_count > 0 and not has_active_enrollment,
        "last_sent_at": p.last_sent_at.isoformat() if p.last_sent_at else None,
        "last_opened_at": p.last_opened_at.isoformat() if p.last_opened_at else None,
        "last_replied_at": p.last_replied_at.isoformat() if p.last_replied_at else None,
    }


# ----------------------------------------------------------------- HTTP client


class GraphitiClient:
    """Thin HTTP client for the Graphiti + campaign-pipeline service.

    Method-per-endpoint stays explicit — one place to update if Graphiti's
    URL shape ever changes. `invoke(action, inputs)` is the dispatcher entry
    point; it picks the right method.
    """

    name = "graphiti"

    def __init__(self, base_url: str, api_key: str, timeout: float = 30.0) -> None:
        self._base_url = (base_url or "").rstrip("/")
        self._api_key = api_key or ""
        self._timeout = timeout
        # Reachability cache: (last_check_ts, was_reachable)
        self._probe_cache: tuple[float, bool] = (0.0, False)
        self._probe_ttl = 60.0

    @property
    def configured(self) -> bool:
        return bool(self._base_url)

    def _headers(self) -> dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self._api_key:
            h["X-API-Key"] = self._api_key
        return h

    async def is_reachable(self) -> bool:
        """3-second /health probe, cached 60s. Always returns False if no base_url."""
        if not self._base_url:
            return False
        now = time.time()
        if now - self._probe_cache[0] < self._probe_ttl:
            return self._probe_cache[1]
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                r = await client.get(f"{self._base_url}/health")
            ok = r.status_code == 200
        except httpx.HTTPError:
            ok = False
        self._probe_cache = (now, ok)
        if not ok:
            log.warning("Graphiti unreachable at %s", self._base_url)
        return ok

    async def invoke(self, action: str, inputs: dict[str, Any]) -> dict[str, Any]:
        """Dispatch one of the GRAPH_ACTIONS or CAMPAIGN_ACTIONS to Graphiti.

        Uses GET when the action is a pure read (account_*, intelligence_*,
        sync_status) and POST otherwise. The Graphiti endpoints follow that
        same convention.
        """
        if action in CAMPAIGN_ACTIONS:
            stage = action.replace("research_prospects", "research").replace("campaign_", "")
            return await self._post(
                f"/api/admin/ai-campaigns/{stage}",
                {
                    "account_name": inputs.get("account_name") or inputs.get("account") or "default",
                    "inputs": {k: v for k, v in inputs.items() if k not in ("account_name", "account", "persist")},
                    "persist": bool(inputs.get("persist", True)),
                },
            )

        # --- ingest / hooks ---
        if action == "ingest_episode":
            return await self._post("/api/ingest", inputs)
        if action == "ingest_batch":
            return await self._post("/api/ingest/batch", inputs)
        if action == "hook_email":
            return await self._post("/api/hooks/email", inputs)
        if action == "hook_email_batch":
            return await self._post("/api/hooks/email/batch", inputs)
        if action == "hook_call":
            return await self._post("/api/hooks/call", inputs)

        # --- query ---
        if action == "query":
            return await self._post("/api/query", inputs)

        # --- account-scoped reads ---
        # Map snake_case action → URL path segment (account_email_context → email-context)
        ACCOUNT_PATH_MAP = {
            "account_contacts": "contacts",
            "account_topics": "topics",
            "account_communications": "communications",
            "account_personal_details": "personal-details",
            "account_team_contacts": "team-contacts",
            "account_graph": "graph",
            "account_timeline": "timeline",
            "account_relationships": "relationships",
            "account_email_context": "email-context",
            "account_briefing": "briefing",
        }
        if action in ACCOUNT_PATH_MAP:
            account = inputs.get("account_name") or inputs.get("account")
            if not account:
                raise ValueError(f"champgraph.{action}: 'account_name' is required")
            params = {k: v for k, v in inputs.items() if k not in ("account_name", "account") and v is not None}
            return await self._get(
                f"/api/accounts/{account}/{ACCOUNT_PATH_MAP[action]}",
                params=params,
            )

        INTEL_PATH_MAP = {
            "intelligence_salesperson_overlap": "salesperson-overlap",
            "intelligence_stakeholder_map": "stakeholder-map",
            "intelligence_engagement_gaps": "engagement-gaps",
            "intelligence_cross_branch": "cross-branch",
            "intelligence_opportunities": "opportunities",
        }
        if action in INTEL_PATH_MAP:
            account = inputs.get("account_name") or inputs.get("account")
            if not account:
                raise ValueError(f"champgraph.{action}: 'account_name' is required")
            params = {k: v for k, v in inputs.items() if k not in ("account_name", "account") and v is not None}
            return await self._get(
                f"/api/accounts/{account}/intelligence/{INTEL_PATH_MAP[action]}",
                params=params,
            )

        # --- sync ---
        if action == "sync_account":
            account = inputs.get("account_name") or inputs.get("account")
            if not account:
                raise ValueError("champgraph.sync_account: 'account_name' is required")
            body = {k: v for k, v in inputs.items() if k not in ("account_name", "account")}
            return await self._post(f"/api/sync/{account}", body)
        if action == "sync_status":
            return await self._get("/api/sync/status")

        raise KeyError(f"GraphitiClient: unknown action {action!r}")

    async def _get(self, path: str, params: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=self._timeout, headers=self._headers()) as client:
                r = await client.get(f"{self._base_url}{path}", params=params or None)
        except httpx.HTTPError as e:
            raise RuntimeError(f"Graphiti GET {path} HTTP error: {e}") from e
        if r.status_code >= 400:
            raise RuntimeError(f"Graphiti GET {path} -> HTTP {r.status_code}: {r.text[:300]}")
        try:
            return r.json()
        except ValueError:
            return {"raw": r.text}

    async def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=self._timeout, headers=self._headers()) as client:
                r = await client.post(f"{self._base_url}{path}", json=body)
        except httpx.HTTPError as e:
            raise RuntimeError(f"Graphiti POST {path} HTTP error: {e}") from e
        if r.status_code >= 400:
            raise RuntimeError(f"Graphiti POST {path} -> HTTP {r.status_code}: {r.text[:300]}")
        try:
            return r.json()
        except ValueError:
            return {"raw": r.text}


# ----------------------------------------------------------------- dispatcher


class ChampGraphService:
    """Single entry point. `invoke(action, inputs)` does the routing."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        graphiti: GraphitiClient,
    ) -> None:
        self._session_factory = session_factory
        self._graphiti = graphiti

    @property
    def graphiti(self) -> GraphitiClient:
        return self._graphiti

    async def invoke(self, action: str, inputs: dict[str, Any]) -> dict[str, Any]:
        if action in PROSPECT_ACTIONS:
            return await self._invoke_prospect(action, inputs)
        if action in GRAPH_ACTIONS or action in CAMPAIGN_ACTIONS:
            return await self._invoke_graphiti(action, inputs)
        raise KeyError(
            f"champgraph: unknown action {action!r}. "
            f"Valid: {sorted(PROSPECT_ACTIONS | GRAPH_ACTIONS | CAMPAIGN_ACTIONS)}"
        )

    # -- prospect (local Postgres) -------------------------------------------

    async def _invoke_prospect(self, action: str, inputs: dict[str, Any]) -> dict[str, Any]:
        async with self._session_factory() as session:
            try:
                if action == "create_prospect":
                    return await self._create_prospect(session, inputs)
                if action == "list_prospects":
                    return await self._list_prospects(session, inputs)
                if action == "get_prospect_status":
                    return await self._get_prospect_status(session, inputs)
                if action == "bulk_import":
                    return await self._bulk_import(session, inputs)
                if action == "enrich_prospect":
                    return await self._enrich_prospect(session, inputs)
                raise KeyError(f"unhandled prospect action {action!r}")
            except Exception:
                await session.rollback()
                raise

    async def _create_prospect(self, session: AsyncSession, inputs: dict[str, Any]) -> dict[str, Any]:
        repo = ProspectRepository(session)
        email = (inputs.get("email") or "").strip().lower()
        if not email:
            raise ValueError("champgraph.create_prospect: 'email' is required")
        existing = await repo.get_by_email(email)
        if existing:
            updated = await repo.update(
                existing.id,
                **{k: v for k, v in inputs.items() if k != "email" and v is not None},
            )
            await session.commit()
            return {"id": updated.id, "email": updated.email, "created": False}
        row = await repo.create(
            email=email,
            first_name=inputs.get("first_name"),
            last_name=inputs.get("last_name"),
            company=inputs.get("company") or inputs.get("company_name"),
            title=inputs.get("title"),
            phone=inputs.get("phone") or inputs.get("phone_number"),
            linkedin_url=inputs.get("linkedin_url"),
            timezone=inputs.get("timezone") or "UTC",
            custom_fields=inputs.get("custom_fields") or {},
        )
        await session.commit()
        return {"id": row.id, "email": row.email, "created": True}

    async def _list_prospects(self, session: AsyncSession, inputs: dict[str, Any]) -> dict[str, Any]:
        items, total = await ProspectRepository(session).list(
            limit=int(inputs.get("limit", 50)),
            offset=int(inputs.get("offset", 0)),
            status=inputs.get("status"),
            search=inputs.get("search"),
        )
        return {
            "total": total,
            "prospects": [
                {
                    "id": p.id, "email": p.email, "first_name": p.first_name,
                    "last_name": p.last_name, "company": p.company,
                    "status": p.status,
                }
                for p in items
            ],
        }

    async def _get_prospect_status(self, session: AsyncSession, inputs: dict[str, Any]) -> dict[str, Any]:
        email = (inputs.get("email") or "").strip().lower()
        if not email:
            raise ValueError("champgraph.get_prospect_status: 'email' is required")
        prospects = ProspectRepository(session)
        enrollments = EnrollmentRepository(session)
        p = await prospects.get_by_email(email)
        if p is None:
            return {**_PROSPECT_NOT_FOUND, "email": email}

        ens = await enrollments.list_for_prospect(p.id)
        active = any(e.status == "active" for e in ens)
        completed = sum(1 for e in ens if e.status == "completed")
        return _normalize_prospect_status(p, has_active_enrollment=active, completed_count=completed)

    async def _bulk_import(self, session: AsyncSession, inputs: dict[str, Any]) -> dict[str, Any]:
        records = inputs.get("records") or inputs.get("prospects") or []
        if not isinstance(records, list):
            raise TypeError("champgraph.bulk_import: 'records' must be a list")
        repo = ProspectRepository(session)
        created = 0
        updated = 0
        skipped: list[str] = []
        for raw in records:
            email = (raw.get("email") or "").strip().lower()
            if not email:
                skipped.append("(missing email)")
                continue
            existing = await repo.get_by_email(email)
            payload = {k: v for k, v in raw.items() if k != "email" and v is not None}
            if existing:
                await repo.update(existing.id, **payload)
                updated += 1
            else:
                await repo.create(
                    email=email,
                    first_name=payload.get("first_name"),
                    last_name=payload.get("last_name"),
                    company=payload.get("company") or payload.get("company_name"),
                    title=payload.get("title"),
                    phone=payload.get("phone"),
                    linkedin_url=payload.get("linkedin_url"),
                    timezone=payload.get("timezone") or "UTC",
                    custom_fields=payload.get("custom_fields") or {},
                )
                created += 1
        await session.commit()
        return {"created": created, "updated": updated, "skipped": skipped, "total": len(records)}

    async def _enrich_prospect(self, session: AsyncSession, inputs: dict[str, Any]) -> dict[str, Any]:
        """Local enrichment: merge known fields and recent event signals into one record.

        The legacy VPS endpoint did inferred-from-LLM enrichment; we don't replicate
        that here (out of scope for prospect-CRUD). For LLM enrichment the canvas
        should chain `champgraph.research_prospects` after this.
        """
        email = (inputs.get("email") or "").strip().lower()
        if not email:
            raise ValueError("champgraph.enrich_prospect: 'email' is required")
        repo = ProspectRepository(session)
        events_repo = EventRepository(session)
        p = await repo.get_by_email(email)
        if p is None:
            return {**_PROSPECT_NOT_FOUND, "email": email}
        recent = await events_repo.list_for_prospect(p.id, limit=20)
        return {
            "found": True,
            "email": p.email,
            "first_name": p.first_name,
            "last_name": p.last_name,
            "company": p.company,
            "title": p.title,
            "phone": p.phone,
            "linkedin_url": p.linkedin_url,
            "timezone": p.timezone,
            "custom_fields": p.custom_fields,
            "recent_events": [
                {"type": e.event_type, "occurred_at": e.occurred_at.isoformat()}
                for e in recent
            ],
        }

    # -- Graphiti delegation -------------------------------------------------

    async def _invoke_graphiti(self, action: str, inputs: dict[str, Any]) -> dict[str, Any]:
        if not self._graphiti.configured:
            return {
                "available": False,
                "reason": "champgraph: Graphiti URL not configured (set CHAMPGRAPH_URL)",
                "action": action,
            }
        if not await self._graphiti.is_reachable():
            return {
                "available": False,
                "reason": f"champgraph: Graphiti at {self._graphiti._base_url} not reachable",
                "action": action,
            }
        try:
            return await self._graphiti.invoke(action, inputs)
        except Exception as e:
            log.exception("graphiti %s failed", action)
            return {
                "available": False,
                "reason": f"champgraph: {action} failed: {e}",
                "action": action,
            }
