"""Canvas executor for `kind: champmail` — calls local services, no HTTP.

This replaces the old HTTP-based ChampmailDriver/ToolNodeExecutor pair.
The node config schema stays IDENTICAL so existing canvas workflows and the
chat.py system prompt don't need to change:

    { "action": "<action_id>",
      "credential": "<unused — kept for backwards compat>",
      "inputs": { ... } }

Supported actions (mirrors the old driver + adds new local-only ones):

    Prospects:
      add_prospect          create or upsert prospect
      get_prospect          look up by email
      list_prospects        with filters

    Templates:
      list_templates
      get_template
      create_template       NEW (local only)
      preview_template

    Sequences:
      list_sequences
      create_sequence       NEW (local only)
      add_sequence_step     NEW (local only)

    Enrollments:
      enroll_sequence       prospect into sequence (alias: start_sequence)
      pause_sequence        pause prospect in a sequence
      resume_sequence       resume

    Sends:
      send_single_email     fire a one-off send (template + prospect)

    Analytics:
      get_analytics         per-sequence stats
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from ...core.interfaces import NodeContext, NodeExecutor, NodeResult
from ...database import get_session_factory
from ..rendering import TemplateRenderer
from ..repositories import (
    EnrollmentRepository,
    ProspectRepository,
    SendRepository,
    SenderRepository,
    SequenceRepository,
    TemplateRepository,
)
from ..services import EnrollmentService, SendService, SenderPicker
from ..transport import MailTransport, MailTransportFactory

log = logging.getLogger(__name__)


class ChampmailLocalExecutor(NodeExecutor):
    kind = "champmail"

    def __init__(
        self,
        transport: MailTransport,
        renderer: TemplateRenderer,
        transport_factory: Optional[MailTransportFactory] = None,
    ) -> None:
        self._transport = transport
        self._renderer = renderer
        self._transport_factory = transport_factory
        self._session_factory = get_session_factory()

    async def execute(self, ctx: NodeContext) -> NodeResult:
        action = ctx.config.get("action")
        if not action:
            raise ValueError("champmail: node is missing 'action' in config")

        raw_inputs = ctx.config.get("inputs", {}) or {}
        rendered_inputs = ctx.render(raw_inputs)
        if not isinstance(rendered_inputs, dict):
            raise TypeError("champmail: inputs must render to a dict")

        # Merge loop item fields into inputs so a {{ item.email }}-style flow works
        item = (ctx.expression_context() or {}).get("item")
        if isinstance(item, dict):
            rendered_inputs = {**item, **rendered_inputs}

        async with self._session_factory() as session:
            try:
                result = await self._dispatch(action, rendered_inputs, session)
                await session.commit()
                return NodeResult(output={"data": result})
            except Exception:
                await session.rollback()
                raise

    # -- dispatcher ----------------------------------------------------------

    async def _dispatch(self, action: str, inputs: dict[str, Any], session) -> dict[str, Any]:
        handler = _ACTION_HANDLERS.get(action)
        if handler is None:
            raise KeyError(
                f"champmail: unknown action {action!r}. Available: {sorted(_ACTION_HANDLERS)}"
            )
        return await handler(self, inputs, session)

    # -- action handlers ----------------------------------------------------

    async def _add_prospect(self, inputs: dict[str, Any], session) -> dict[str, Any]:
        repo = ProspectRepository(session)
        email = (inputs.get("email") or "").strip().lower()
        if not email:
            raise ValueError("champmail.add_prospect: 'email' is required")
        existing = await repo.get_by_email(email)
        if existing:
            updated = await repo.update(existing.id, **{k: v for k, v in inputs.items() if k != "email"})
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
        return {"id": row.id, "email": row.email, "created": True}

    async def _get_prospect(self, inputs: dict[str, Any], session) -> dict[str, Any]:
        email = (inputs.get("email") or "").strip().lower()
        if not email:
            raise ValueError("champmail.get_prospect: 'email' is required")
        row = await ProspectRepository(session).get_by_email(email)
        if row is None:
            return {"found": False, "email": email}
        return {
            "found": True,
            "id": row.id,
            "email": row.email,
            "first_name": row.first_name,
            "last_name": row.last_name,
            "company": row.company,
            "status": row.status,
            "last_opened_at": row.last_opened_at.isoformat() if row.last_opened_at else None,
            "last_replied_at": row.last_replied_at.isoformat() if row.last_replied_at else None,
            "last_sent_at": row.last_sent_at.isoformat() if row.last_sent_at else None,
        }

    async def _list_prospects(self, inputs: dict[str, Any], session) -> dict[str, Any]:
        items, total = await ProspectRepository(session).list(
            limit=int(inputs.get("limit", 50)),
            offset=int(inputs.get("offset", 0)),
            status=inputs.get("status"),
            search=inputs.get("search"),
        )
        return {
            "total": total,
            "prospects": [
                {"id": p.id, "email": p.email, "first_name": p.first_name, "company": p.company, "status": p.status}
                for p in items
            ],
        }

    async def _list_templates(self, inputs: dict[str, Any], session) -> dict[str, Any]:
        rows = await TemplateRepository(session).list()
        return {
            "templates": [{"id": t.id, "name": t.name, "subject": t.subject, "variables": t.variables} for t in rows]
        }

    async def _get_template(self, inputs: dict[str, Any], session) -> dict[str, Any]:
        repo = TemplateRepository(session)
        if "template_id" in inputs:
            row = await repo.get(int(inputs["template_id"]))
        elif "name" in inputs:
            row = await repo.get_by_name(str(inputs["name"]))
        else:
            raise ValueError("champmail.get_template: 'template_id' or 'name' required")
        if row is None:
            return {"found": False}
        return {
            "found": True,
            "id": row.id,
            "name": row.name,
            "subject": row.subject,
            "body_html": row.body_html,
            "body_text": row.body_text,
            "variables": row.variables,
        }

    async def _create_template(self, inputs: dict[str, Any], session) -> dict[str, Any]:
        repo = TemplateRepository(session)
        if not inputs.get("name") or not inputs.get("subject") or not inputs.get("body_html"):
            raise ValueError("champmail.create_template requires 'name', 'subject', 'body_html'")
        row = await repo.create(
            name=inputs["name"],
            subject=inputs["subject"],
            body_html=inputs["body_html"],
            body_text=inputs.get("body_text"),
        )
        return {"id": row.id, "name": row.name, "variables": row.variables}

    async def _preview_template(self, inputs: dict[str, Any], session) -> dict[str, Any]:
        tid = int(inputs.get("template_id") or 0)
        tpl = await TemplateRepository(session).get(tid)
        if tpl is None:
            raise ValueError(f"champmail.preview_template: template {tid} not found")
        out = self._renderer.render(
            subject=tpl.subject,
            body_html=tpl.body_html,
            body_text=tpl.body_text,
            prospect=None,
            extra_vars=inputs.get("variables") or {},
        )
        return {"subject": out.subject, "body_html": out.body_html, "body_text": out.body_text}

    async def _list_sequences(self, inputs: dict[str, Any], session) -> dict[str, Any]:
        rows = await SequenceRepository(session).list()
        return {
            "sequences": [
                {"id": s.id, "name": s.name, "step_count": len(s.steps), "enabled": s.enabled}
                for s in rows
            ]
        }

    async def _create_sequence(self, inputs: dict[str, Any], session) -> dict[str, Any]:
        if not inputs.get("name"):
            raise ValueError("champmail.create_sequence: 'name' is required")
        repo = SequenceRepository(session)
        steps_in = inputs.get("steps") or []
        row = await repo.create(
            name=inputs["name"],
            description=inputs.get("description"),
            timezone=inputs.get("timezone", "UTC"),
            working_hours_start=int(inputs.get("working_hours_start", 9)),
            working_hours_end=int(inputs.get("working_hours_end", 17)),
            enabled=bool(inputs.get("enabled", True)),
            steps=steps_in,
        )
        return {"id": row.id, "name": row.name, "step_count": len(row.steps)}

    async def _add_sequence_step(self, inputs: dict[str, Any], session) -> dict[str, Any]:
        sid = int(inputs.get("sequence_id") or 0)
        if not inputs.get("template_id"):
            raise ValueError("champmail.add_sequence_step: 'sequence_id' and 'template_id' required")
        step = await SequenceRepository(session).add_step(
            sid,
            template_id=int(inputs["template_id"]),
            delay_days=int(inputs.get("delay_days", 0)),
            delay_hours=int(inputs.get("delay_hours", 0)),
            condition=inputs.get("condition"),
        )
        if step is None:
            raise ValueError(f"champmail.add_sequence_step: sequence {sid} not found")
        return {"id": step.id, "step_index": step.step_index}

    async def _enroll_sequence(self, inputs: dict[str, Any], session) -> dict[str, Any]:
        # Accept either prospect_id or prospect_email
        prospect_id = inputs.get("prospect_id")
        if not prospect_id:
            email = (inputs.get("prospect_email") or inputs.get("email") or "").strip().lower()
            if not email:
                raise ValueError("champmail.enroll_sequence: prospect_id or prospect_email required")
            p = await ProspectRepository(session).get_by_email(email)
            if p is None:
                raise ValueError(f"champmail.enroll_sequence: prospect {email!r} not found")
            prospect_id = p.id
        sequence_id = inputs.get("sequence_id")
        if not sequence_id and inputs.get("sequence_name"):
            seq = await SequenceRepository(session).get_by_name(str(inputs["sequence_name"]))
            if seq is None:
                raise ValueError(f"champmail.enroll_sequence: sequence {inputs['sequence_name']!r} not found")
            sequence_id = seq.id
        if not sequence_id:
            raise ValueError("champmail.enroll_sequence: sequence_id or sequence_name required")
        en = await EnrollmentService(session).enroll(
            prospect_id=int(prospect_id), sequence_id=int(sequence_id)
        )
        return {
            "enrollment_id": en.id,
            "status": en.status,
            "next_step_at": en.next_step_at.isoformat() if en.next_step_at else None,
        }

    async def _pause_sequence(self, inputs: dict[str, Any], session) -> dict[str, Any]:
        en_id = inputs.get("enrollment_id")
        if not en_id:
            # Pause by (prospect, sequence) lookup
            email = (inputs.get("prospect_email") or inputs.get("email") or "").strip().lower()
            seq_id = inputs.get("sequence_id")
            if not email or not seq_id:
                raise ValueError("champmail.pause_sequence: enrollment_id OR (prospect_email + sequence_id) required")
            p = await ProspectRepository(session).get_by_email(email)
            if p is None:
                return {"paused": False, "reason": "prospect not found"}
            en = await EnrollmentRepository(session).find(p.id, int(seq_id))
            if en is None:
                return {"paused": False, "reason": "enrollment not found"}
            en_id = en.id
        row = await EnrollmentService(session).pause(int(en_id))
        return {"paused": row is not None, "enrollment_id": en_id, "status": row.status if row else None}

    async def _resume_sequence(self, inputs: dict[str, Any], session) -> dict[str, Any]:
        en_id = int(inputs.get("enrollment_id") or 0)
        row = await EnrollmentService(session).resume(en_id)
        if row is None:
            raise ValueError(f"champmail.resume_sequence: enrollment {en_id} not found")
        return {"resumed": True, "enrollment_id": row.id, "next_step_at": row.next_step_at.isoformat() if row.next_step_at else None}

    async def _send_single_email(self, inputs: dict[str, Any], session) -> dict[str, Any]:
        prospects = ProspectRepository(session)
        templates = TemplateRepository(session)
        senders = SenderRepository(session)

        prospect_id = inputs.get("prospect_id")
        if not prospect_id:
            email = (inputs.get("email") or inputs.get("to") or "").strip().lower()
            if not email:
                raise ValueError("champmail.send_single_email: prospect_id or email required")
            p = await prospects.get_by_email(email)
            if p is None:
                # Auto-create a minimal prospect record
                p = await prospects.create(email=email, first_name=inputs.get("first_name"))
            prospect_id = p.id
        prospect = await prospects.get(int(prospect_id))
        if prospect is None:
            raise ValueError("champmail.send_single_email: prospect not found")

        if inputs.get("template_id"):
            template = await templates.get(int(inputs["template_id"]))
        elif inputs.get("template_name"):
            template = await templates.get_by_name(str(inputs["template_name"]))
        else:
            # Inline subject + body — create an ephemeral template (one-off)
            subject = inputs.get("subject")
            body_html = inputs.get("body") or inputs.get("body_html") or inputs.get("html")
            if not subject or not body_html:
                raise ValueError("champmail.send_single_email: provide template_id, template_name, or (subject + body)")
            template = await templates.create(
                name=f"_oneoff_{prospect.email}_{int(__import__('time').time())}",
                subject=subject,
                body_html=body_html,
            )
        if template is None:
            raise ValueError("champmail.send_single_email: template not found")

        if inputs.get("sender_id"):
            sender = await senders.get(int(inputs["sender_id"]))
        else:
            sender = await SenderPicker(session).next_available()
        if sender is None:
            raise RuntimeError("champmail.send_single_email: no senders available")

        svc = SendService(
            session, self._transport, self._renderer,
            transport_factory=self._transport_factory,
        )
        result = await svc.send_oneoff(
            prospect=prospect,
            template=template,
            sender=sender,
            extra_vars=inputs.get("variables") or {},
        )
        if not result.success:
            raise RuntimeError(f"champmail.send_single_email failed: {result.error}")
        return {
            "sent": True,
            "message_id": result.provider_message_id,
            "prospect_email": prospect.email,
            "sender_id": sender.id,
        }

    async def _get_analytics(self, inputs: dict[str, Any], session) -> dict[str, Any]:
        from ..repositories import EventRepository, SendRepository
        from ..models import CMEnrollment
        from sqlalchemy import func, select

        sid = int(inputs.get("sequence_id") or 0)
        if not sid:
            raise ValueError("champmail.get_analytics: 'sequence_id' is required")

        sends = await SendRepository(session).count_for_sequence(sid)
        counts = await EventRepository(session).aggregates_for_sequence(sid)
        enrollments_total = int(
            (await session.execute(
                select(func.count()).select_from(CMEnrollment).where(CMEnrollment.sequence_id == sid)
            )).scalar_one()
        )

        opens = counts.get("opened", 0)
        replies = counts.get("replied", 0)
        bounces = counts.get("bounced", 0)
        return {
            "sequence_id": sid,
            "enrollments_total": enrollments_total,
            "sends_total": sends,
            "opens": opens,
            "clicks": counts.get("clicked", 0),
            "replies": replies,
            "bounces": bounces,
            "unsubscribes": counts.get("unsubscribed", 0),
            "open_rate": round(opens / sends, 4) if sends else 0.0,
            "reply_rate": round(replies / sends, 4) if sends else 0.0,
        }


_ACTION_HANDLERS = {
    "add_prospect":        ChampmailLocalExecutor._add_prospect,
    "get_prospect":        ChampmailLocalExecutor._get_prospect,
    "list_prospects":      ChampmailLocalExecutor._list_prospects,
    "list_templates":      ChampmailLocalExecutor._list_templates,
    "get_template":        ChampmailLocalExecutor._get_template,
    "create_template":     ChampmailLocalExecutor._create_template,
    "preview_template":    ChampmailLocalExecutor._preview_template,
    "list_sequences":      ChampmailLocalExecutor._list_sequences,
    "create_sequence":     ChampmailLocalExecutor._create_sequence,
    "add_sequence_step":   ChampmailLocalExecutor._add_sequence_step,
    "enroll_sequence":     ChampmailLocalExecutor._enroll_sequence,
    "start_sequence":      ChampmailLocalExecutor._enroll_sequence,  # alias
    "pause_sequence":      ChampmailLocalExecutor._pause_sequence,
    "resume_sequence":     ChampmailLocalExecutor._resume_sequence,
    "send_single_email":   ChampmailLocalExecutor._send_single_email,
    "get_analytics":       ChampmailLocalExecutor._get_analytics,
}
