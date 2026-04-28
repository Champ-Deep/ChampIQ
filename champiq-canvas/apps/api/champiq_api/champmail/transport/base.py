"""MailTransport interface + shared dataclasses.

Adding a new provider (SendGrid, Postmark, Mailgun) means implementing this
Protocol. Services never import concrete transport classes — only the Protocol.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Protocol


@dataclass
class EmailEnvelope:
    """Everything needed to send a single email.

    Rendering (subject + body interpolation) happens upstream in SendService —
    by the time the transport sees this, all `{{ var }}` substitutions are done.
    """
    to_email: str
    to_name: Optional[str]
    subject: str
    body_html: str
    body_text: Optional[str] = None
    from_email: Optional[str] = None  # transport may override with sender's default
    from_name: Optional[str] = None
    reply_to: Optional[str] = None
    custom_headers: dict[str, str] = field(default_factory=dict)
    # Tracking — provider-specific. Emelia handles its own opens/clicks tracking
    # via the campaign config, so we only ship the IDs we need to correlate webhooks.
    tracking_id: Optional[str] = None


@dataclass
class SendResult:
    success: bool
    provider_message_id: Optional[str] = None
    error: Optional[str] = None
    raw_response: Optional[dict] = None


class MailTransport(Protocol):
    """Outbound email transport — every provider implements this."""

    name: str  # short identifier ("emelia", "stub", "sendgrid", ...)

    async def send(self, envelope: EmailEnvelope, *, sender_id: str) -> SendResult:
        """Deliver the envelope. `sender_id` is the provider's own sender identifier
        (e.g. an Emelia inbox UUID). Implementations resolve from_email/from_name
        from the sender if envelope doesn't override.
        """
        ...

    async def verify(self) -> bool:
        """Lightweight health check — verify credentials work. Non-fatal failures
        return False; never raise."""
        ...
