"""Pure data-access layer. One repository per aggregate (SRP).

Repositories never call external services or contain business logic — that's
the service layer's job.
"""
from .prospects import ProspectRepository
from .senders import SenderRepository
from .templates import TemplateRepository
from .sequences import SequenceRepository
from .enrollments import EnrollmentRepository
from .sends import SendRepository
from .events import EventRepository

__all__ = [
    "ProspectRepository",
    "SenderRepository",
    "TemplateRepository",
    "SequenceRepository",
    "EnrollmentRepository",
    "SendRepository",
    "EventRepository",
]
