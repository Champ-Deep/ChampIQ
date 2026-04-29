"""ChampMail FastAPI routers — mounted under /api/champmail/*."""
from . import (
    analytics,
    credentials,
    enrollments,
    prospects,
    sends,
    senders,
    sequences,
    templates,
    unsubscribe,
    webhooks,
)

__all__ = [
    "prospects",
    "senders",
    "templates",
    "sequences",
    "enrollments",
    "sends",
    "webhooks",
    "unsubscribe",
    "analytics",
    "credentials",
]
