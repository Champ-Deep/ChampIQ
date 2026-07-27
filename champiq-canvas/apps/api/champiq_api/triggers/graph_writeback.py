"""Event consumers living beside EventTriggerListener (SUGGESTIONS 2.1 + 4.1).

GraphWritebackConsumer drains channel events into Cham_Graph hooks. Graphiti
ingestion blocks for minutes on CPU-Ollama (observed 2026-07-18), so the send
path must never call the graph synchronously; this consumer is the async seam
that makes every SDR action enrich the data store (EVENT_DESIGN rule: every
event lands in the graph, always off the hot path).

LedgerConsumer appends every bus event to run_ledger, turning "did every
client tick today" into a SQL query (phase 1 of Champ Ops, SUGGESTIONS 3.3).
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..champgraph.lifecycle import InvalidTransition, ProspectLifecycleRepository, ProspectState
from ..champgraph.service import ChampGraphService
from ..champmail.repositories import ProspectRepository
from ..core.interfaces import EventBus
from ..models import RunLedgerTable

log = logging.getLogger(__name__)

# # channel event topics this consumer drains into the graph
EMAIL_TOPICS = frozenset({
    "email.sent",
    "email.replied",
    "email.bounced",
    "email.opened",
    "email.clicked",
    "email.unsubscribed",
})
# # these two also enforce suppression in ChampMail (SUGGESTIONS 4.6b)
SUPPRESSION_TOPICS = frozenset({"email.bounced", "email.unsubscribed"})
CALL_TOPICS = frozenset({"call.completed"})
EPISODE_TOPICS = frozenset({"pulse.post.detected", "pulse.dm.replied"})
# # ChampHarbinger SENSE-stage events (webhook ingress, HarbingerDriver.parse_webhook)
SIGNAL_TOPICS = frozenset({"signal.matched", "prospect.qualified"})
HANDLED_TOPICS = EMAIL_TOPICS | CALL_TOPICS | EPISODE_TOPICS | SIGNAL_TOPICS

# # prospect_lifecycle triggers (SUGGESTIONS build-spec, item 1)
_ENGAGE_TOPICS = frozenset({"email.opened", "email.clicked"})
_REPLY_TOPICS = frozenset({"email.replied"})


class _DedupeCache:
    """In-process TTL dedupe. EVENT_DESIGN: consumers are idempotent, event id
    is the dedupe key. In-process is correct for the single-worker deployment;
    multi-worker needs a Redis SET NX store, which lands with the durable
    queue (SUGGESTIONS 4.3)."""

    def __init__(self, ttl_seconds: float = 3600.0) -> None:
        self._seen: dict[str, float] = {}
        self._ttl = ttl_seconds

    def seen_before(self, key: str) -> bool:
        now = time.time()
        if len(self._seen) > 10_000:
            self._seen = {k: ts for k, ts in self._seen.items() if now - ts < self._ttl}
        if key in self._seen:
            return True
        self._seen[key] = now
        return False


def _field(payload: dict[str, Any], *names: str) -> Any:
    """Look up a field at top level, then inside the publisher's `data` sub-dict."""
    for name in names:
        if payload.get(name) is not None:
            return payload[name]
    data = payload.get("data")
    if isinstance(data, dict):
        for name in names:
            if data.get(name) is not None:
                return data[name]
    return None


def _email_hook_payload(topic: str, payload: dict[str, Any]) -> dict[str, Any]:
    direction = _field(payload, "direction")
    if not direction:
        direction = "inbound" if topic in ("email.replied",) else "outbound"
    result = {
        "account_name": _field(payload, "account_name", "account", "client") or "default",
        "from_address": _field(payload, "from_address", "from_email", "sender") or "",
        "to_address": _field(payload, "to_address", "to_email", "recipient") or "",
        "subject": _field(payload, "subject") or f"(no subject) [{topic}]",
        "body": _field(payload, "body", "body_text", "snippet") or "",
        "direction": direction,
        "occurred_at": _field(payload, "occurred_at", "sent_at")
        or datetime.now(timezone.utc).isoformat(),
    }
    classification = _field(payload, "classification")
    if classification is not None:
        result["classification"] = classification
        confidence = _field(payload, "classification_confidence")
        if confidence is not None:
            result["classification_confidence"] = confidence
    return result


def _call_hook_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "account_name": _field(payload, "account_name", "account", "client") or "default",
        "from_number": _field(payload, "from_number", "caller") or "",
        "to_number": _field(payload, "to_number", "callee") or "",
        "transcript": _field(payload, "transcript", "transcript_text") or "",
        "duration_seconds": _field(payload, "duration_seconds", "duration") or 0,
        "occurred_at": _field(payload, "occurred_at", "completed_at")
        or datetime.now(timezone.utc).isoformat(),
    }


def _episode_payload(topic: str, payload: dict[str, Any]) -> dict[str, Any]:
    summary = _field(payload, "summary", "text", "post_text") or json.dumps(
        payload.get("data", payload), default=str
    )[:2000]
    return {
        "account_name": _field(payload, "account_name", "account", "client") or "default",
        "name": f"{topic}: {_field(payload, 'page', 'author', 'post_id') or 'social'}",
        "content": summary,
        "reference_time": _field(payload, "occurred_at", "detected_at")
        or datetime.now(timezone.utc).isoformat(),
        "source_description": f"ChampIQ event bus ({topic})",
    }


class GraphWritebackConsumer:
    """Subscribes to channel events on the bus and drains them into Cham_Graph.

    ChampGraphService.invoke degrades to {"available": False} when the graph is
    down instead of raising, so a stopped graph never breaks the loop.
    """

    def __init__(
        self,
        bus: EventBus,
        champgraph: ChampGraphService,
        dedupe_ttl: float = 3600.0,
        *,
        champmail_base_url: str = "",
        champmail_bearer_token: str = "",
        session_factory: Optional[async_sessionmaker[AsyncSession]] = None,
    ) -> None:
        self._bus = bus
        self._champgraph = champgraph
        self._dedupe = _DedupeCache(dedupe_ttl)
        self._champmail_url = champmail_base_url.rstrip("/")
        self._champmail_token = champmail_bearer_token
        # * lifecycle transitions need their own session (champgraph.invoke
        # * owns its session internally and doesn't expose one) — optional so
        # * existing constructions without it degrade to "no lifecycle wiring"
        # * instead of crashing.
        self._session_factory = session_factory
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def shutdown(self) -> None:
        if self._task:
            self._task.cancel()

    async def _run(self) -> None:
        try:
            async for message in self._bus.subscribe("*"):
                topic = message.get("topic")
                if topic not in HANDLED_TOPICS:
                    continue
                try:
                    await self._handle(topic, message)
                except Exception:
                    # ! a write-back failure must never kill the consumer; the
                    # ! event stays queryable in run_ledger for re-drive
                    log.exception("graph write-back failed for %s", topic)
        except asyncio.CancelledError:
            return
        except Exception:
            log.exception("graph write-back consumer crashed")

    async def _handle(self, topic: str, payload: dict[str, Any]) -> None:
        event_key = (
            _field(payload, "message_id", "call_id", "event_id", "post_id")
            or hashlib.sha256(
                json.dumps(payload, sort_keys=True, default=str).encode()
            ).hexdigest()[:16]
        )
        if self._dedupe.seen_before(f"{topic}:{event_key}"):
            return

        if topic in EMAIL_TOPICS:
            result = await self._champgraph.invoke("hook_email", _email_hook_payload(topic, payload))
        elif topic in CALL_TOPICS:
            result = await self._champgraph.invoke("hook_call", _call_hook_payload(payload))
        else:
            result = await self._champgraph.invoke("ingest_episode", _episode_payload(topic, payload))

        if isinstance(result, dict) and result.get("available") is False:
            log.warning("graph write-back deferred (%s): %s", topic, result.get("reason"))

        if topic in SUPPRESSION_TOPICS:
            await self._enforce_suppression(topic, payload)

        if topic in _ENGAGE_TOPICS:
            await self._transition_by_email(payload, target=ProspectState.ENGAGED)
        elif topic in _REPLY_TOPICS:
            await self._transition_by_email(payload, target=ProspectState.REPLIED)
        elif topic in SIGNAL_TOPICS:
            await self._transition_by_domain(payload, target=ProspectState.IN_CADENCE)

    async def _transition_by_email(self, payload: dict[str, Any], *, target: ProspectState) -> None:
        """prospect_lifecycle trigger: InCadence->Engaged on open/click, Engaged->
        Replied on reply. Invalid jumps (e.g. the event fires again after the
        prospect already advanced) are expected and logged at debug, not error —
        this is a best-effort side-trigger, never allowed to break write-back."""
        if self._session_factory is None:
            return
        address = _field(payload, "to_address", "to_email", "recipient", "email")
        if not address:
            return
        async with self._session_factory() as session:
            prospect = await ProspectRepository(session).get_by_email(address.strip().lower())
            if prospect is None:
                return
            try:
                await ProspectLifecycleRepository(session).transition(prospect.id, target.value)
                await session.commit()
            except InvalidTransition as exc:
                log.debug("lifecycle transition skipped for prospect %s: %s", prospect.id, exc)
                await session.rollback()

    async def _transition_by_domain(self, payload: dict[str, Any], *, target: ProspectState) -> None:
        """Researched->InCadence on a detected Harbinger signal (item 2 SENSE
        wiring). Harbinger's qualified-prospect events are company/domain-scoped
        (company_domain) while ChampMail prospects are email-scoped — there is
        no authoritative domain->prospect join table today, so this matches on
        the prospect's own email domain as a heuristic. A domain with no
        matching prospect is silently skipped (not an error: most signals will
        be for companies with no prospect record yet)."""
        if self._session_factory is None:
            return
        domain = (_field(payload, "company_domain", "domain") or "").strip().lower()
        if not domain:
            return
        async with self._session_factory() as session:
            prospects = await ProspectRepository(session).list_by_email_domain(domain)
            for prospect in prospects:
                try:
                    await ProspectLifecycleRepository(session).transition(prospect.id, target.value)
                except InvalidTransition as exc:
                    log.debug("lifecycle transition skipped for prospect %s: %s", prospect.id, exc)
            await session.commit()

    async def _enforce_suppression(self, topic: str, payload: dict[str, Any]) -> None:
        """Best-effort upsert into ChampMail's suppression list (4.6b).

        Never blocks or fails the write-back path: without a configured URL or
        token it simply logs and skips.
        """
        # * the address to suppress is the RECIPIENT (bounced mailbox /
        # * unsubscribing contact), so prefer recipient-side fields
        address = _field(payload, "recipient", "to_address", "to_email", "email")
        if not address:
            address = _field(payload, "from_address", "from_email")
        if not address:
            return
        if not self._champmail_url or not self._champmail_token:
            log.info("suppression side-call skipped (champmail url/token unset): %s", address)
            return
        reason = "bounce" if topic == "email.bounced" else "unsubscribe"
        try:
            import httpx

            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.post(
                    f"{self._champmail_url}/api/v1/suppressions",
                    headers={
                        "Authorization": f"Bearer {self._champmail_token}",
                        "Content-Type": "application/json",
                    },
                    json={"email": address, "reason": reason, "source": f"bus:{topic}"},
                )
                if r.status_code >= 400:
                    log.warning("suppression upsert failed for %s: HTTP %s", address, r.status_code)
        except Exception:
            log.exception("suppression side-call error for %s", address)


class LedgerConsumer:
    """Appends every bus event to run_ledger (SUGGESTIONS 4.1).

    Unlike EventTriggerListener this also records execution.* / node.* topics:
    per-client health needs the orchestrator's own lifecycle events.
    """

    def __init__(
        self,
        bus: EventBus,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        self._bus = bus
        self._session_factory = session_factory
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def shutdown(self) -> None:
        if self._task:
            self._task.cancel()

    async def _run(self) -> None:
        try:
            async for message in self._bus.subscribe("*"):
                topic = message.get("topic") or "unknown"
                try:
                    await self._record(topic, message)
                except Exception:
                    log.exception("ledger insert failed for %s", topic)
        except asyncio.CancelledError:
            return
        except Exception:
            log.exception("ledger consumer crashed")

    async def _record(self, topic: str, message: dict[str, Any]) -> None:
        payload = {k: v for k, v in message.items() if k != "topic"}
        digest = hashlib.sha256(
            json.dumps(payload, sort_keys=True, default=str).encode()
        ).hexdigest()[:16]
        async with self._session_factory() as session:
            session.add(
                RunLedgerTable(
                    topic=topic,
                    client=_field(message, "client", "account_name", "account"),
                    digest=digest,
                    payload=payload,
                )
            )
            await session.commit()
