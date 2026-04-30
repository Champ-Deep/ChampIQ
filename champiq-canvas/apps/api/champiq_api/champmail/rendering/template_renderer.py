"""Template rendering — Jinja2 sandboxed.

Render subject + body with prospect fields and ad-hoc variables. Sandbox
blocks attribute access to dunder names and module access — safe to render
LLM-generated templates.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from jinja2.sandbox import SandboxedEnvironment

from ..models import CMProspect


_env = SandboxedEnvironment(autoescape=False, keep_trailing_newline=True)


@dataclass
class RenderedEmail:
    subject: str
    body_html: str
    body_text: Optional[str] = None


def _prospect_context(prospect: CMProspect) -> dict[str, Any]:
    return {
        "email": prospect.email,
        "first_name": prospect.first_name or "",
        "last_name": prospect.last_name or "",
        "full_name": f"{prospect.first_name or ''} {prospect.last_name or ''}".strip(),
        "company": prospect.company or "",
        "title": prospect.title or "",
        "phone": prospect.phone or "",
        "linkedin_url": prospect.linkedin_url or "",
        "timezone": prospect.timezone,
        "custom": prospect.custom_fields or {},
    }


class TemplateRenderer:
    def render(
        self,
        *,
        subject: str,
        body_html: str,
        body_text: Optional[str] = None,
        prospect: Optional[CMProspect] = None,
        extra_vars: Optional[dict[str, Any]] = None,
    ) -> RenderedEmail:
        ctx: dict[str, Any] = {}
        if prospect is not None:
            p = _prospect_context(prospect)
            ctx.update(p)
            # Also expose under `prospect.<field>` for explicit access in templates
            ctx["prospect"] = p
        if extra_vars:
            ctx.update(extra_vars)

        rendered_subject = _env.from_string(subject).render(**ctx)
        rendered_html = _env.from_string(body_html).render(**ctx)
        rendered_text = _env.from_string(body_text).render(**ctx) if body_text else None
        return RenderedEmail(
            subject=rendered_subject,
            body_html=rendered_html,
            body_text=rendered_text,
        )
