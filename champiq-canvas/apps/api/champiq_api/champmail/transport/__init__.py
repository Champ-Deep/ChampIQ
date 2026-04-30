"""Mail transport — Strategy pattern.

Services depend on the `MailTransport` Protocol, not concrete classes. Swap
providers without touching service code.
"""
from .base import EmailEnvelope, MailTransport, SendResult
from .emelia import EmeliaTransport
from .factory import MailTransportFactory
from .stub import StubTransport

__all__ = [
    "EmailEnvelope",
    "MailTransport",
    "SendResult",
    "EmeliaTransport",
    "StubTransport",
    "MailTransportFactory",
]
