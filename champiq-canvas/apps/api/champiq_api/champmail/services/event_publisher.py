"""Canonical canvas-bus fan-out for ChampMail webhook events.

Why a separate module from WebhookService?
    SRP. WebhookService owns "ingest provider events into our DB". Publishing to
    the canvas event bus is a different concern with a different blast radius —
    a bus failure must not roll back the DB write, and a slow bus must not slow
    down provider acknowledgement. Separating them lets each fail and evolve
    independently.

Why a Protocol?
    DIP. WebhookService depends on `WebhookEventPublisher`, not on `EventBus`.
    Tests can pass a stub publisher. A future replacement (Kafka, NATS, an
    outbox pattern) only needs a new implementation; the service stays put.

Topic naming:
    Provider-agnostic — `email.replied`, not `emelia.replied`. Tomorrow's
    transport swap shouldn't break canvas workflows authored against these
    topics. The raw provider name travels in the payload as `raw_provider` for
    the rare workflow that needs to differentiate.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional, Protocol

from ...core.interfaces import EventBus

log = logging.getLogger(__name__)


# Canonical event-type → bus topic. New event types add a row here and nothing
# else changes (OCP). `None` means "don't publish" — used for noisy internal
# events like `sent` that the canvas doesn't need.
_TOPIC_MAP: dict[str, Optional[str]] = {
    "replied":      "email.replied",
    "opened":       "email.opened",
    "clicked":      "email.clicked",
    "bounced":      "email.bounced",
    "unsubscribed": "email.unsubscribed",
    "sent":         None,  # too noisy, internal-only
}


class WebhookEventPublisher(Protocol):
    """Publishes canonical canvas events derived from webhook ingestion.

    Implementations MUST NOT raise — bus failures are observability problems,
    not request-failure problems. Log and swallow.
    """

    async def publish_event(
        self,
        event_type: str,
        *,
        prospect_id: int,
        send_id: Optional[int],
        data: dict[str, Any],
        occurred_at: datetime,
        raw_provider: str,
    ) -> None: ...


class NullWebhookEventPublisher:
    """No-op publisher. Used when the event bus is unavailable (tests, dev,
    standalone ChampMail deployments without a canvas runtime)."""

    async def publish_event(
        self,
        event_type: str,
        *,
        prospect_id: int,
        send_id: Optional[int],
        data: dict[str, Any],
        occurred_at: datetime,
        raw_provider: str,
    ) -> None:
        return None


class EventBusWebhookPublisher:
    """Fans out webhook events onto the canvas EventBus.

    Adapter between the webhook side (Emelia-shaped payloads) and the canvas
    side (canonical, provider-agnostic topics). Holds zero business logic.
    """

    def __init__(self, event_bus: EventBus) -> None:
        self._bus = event_bus

    async def publish_event(
        self,
        event_type: str,
        *,
        prospect_id: int,
        send_id: Optional[int],
        data: dict[str, Any],
        occurred_at: datetime,
        raw_provider: str,
    ) -> None:
        topic = _TOPIC_MAP.get(event_type)
        if topic is None:
            return
        payload = {
            "prospect_id":  prospect_id,
            "send_id":      send_id,
            "email":        data.get("to") or data.get("email") or data.get("recipient"),
            "subject":      data.get("subject"),
            "body":         data.get("body") or data.get("text"),
            "received_at":  occurred_at.isoformat(),
            "tracking_id":  data.get("customId") or data.get("custom_id") or data.get("tracking_id"),
            "raw_provider": raw_provider,
        }
        try:
            await self._bus.publish(topic, payload)
        except Exception:
            # Bus failure must not fail the webhook — Emelia would retry and
            # double-write the DB row. Log loudly and move on.
            log.exception("webhook event-bus publish failed: topic=%s", topic)
