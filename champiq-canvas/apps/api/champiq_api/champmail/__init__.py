"""ChampMail inline module — sequencing, sending, and event ingestion.

See ChampMail_Inline_Spec.md at the repo root for design and decisions.
Email transport delegated to Emelia (https://emelia.io).
"""
from . import models  # noqa: F401  -- registers tables with Base.metadata

__all__ = ["models"]
