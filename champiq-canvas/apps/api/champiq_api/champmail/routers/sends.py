"""Single-shot send + send history."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ...container import get_container
from ...database import get_db
from ..repositories import (
    ProspectRepository,
    SendRepository,
    SenderRepository,
    TemplateRepository,
)
from ..schemas import SendOut, SingleSendIn
from ..services import SendService, SenderPicker

router = APIRouter(prefix="/champmail/sends", tags=["champmail:sends"])


@router.post("", response_model=SendOut, status_code=201)
async def send_oneoff(body: SingleSendIn, db: AsyncSession = Depends(get_db)):
    container = get_container()
    prospects = ProspectRepository(db)
    templates = TemplateRepository(db)
    senders = SenderRepository(db)

    prospect = await prospects.get(body.prospect_id)
    if prospect is None:
        raise HTTPException(404, "prospect not found")
    template = await templates.get(body.template_id)
    if template is None:
        raise HTTPException(404, "template not found")

    if body.sender_id:
        sender = await senders.get(body.sender_id)
        if sender is None:
            raise HTTPException(404, "sender not found")
    else:
        sender = await SenderPicker(db).next_available()
        if sender is None:
            raise HTTPException(503, "no senders available (all exhausted or none configured)")

    svc = SendService(db, container.mail_transport, container.mail_renderer)
    result = await svc.send_oneoff(
        prospect=prospect,
        template=template,
        sender=sender,
        extra_vars=body.variables,
    )
    await db.commit()

    if not result.success:
        raise HTTPException(502, f"send failed: {result.error}")

    sends = SendRepository(db)
    row = await sends.get_by_emelia_message_id(result.provider_message_id) if result.provider_message_id else None
    if row is None:
        # fall back to the most recent send for this prospect (covers stub transport edge cases)
        rows = await sends.list_for_prospect(body.prospect_id, limit=1)
        row = rows[0] if rows else None
    if row is None:
        raise HTTPException(500, "send succeeded but no send row found")
    return SendOut.model_validate(row)


@router.get("/by-prospect/{prospect_id}", response_model=list[SendOut])
async def list_for_prospect(prospect_id: int, db: AsyncSession = Depends(get_db), limit: int = 50):
    repo = SendRepository(db)
    return [SendOut.model_validate(r) for r in await repo.list_for_prospect(prospect_id, limit=limit)]


@router.get("/{send_id}", response_model=SendOut)
async def get_send(send_id: int, db: AsyncSession = Depends(get_db)):
    repo = SendRepository(db)
    row = await repo.get(send_id)
    if row is None:
        raise HTTPException(404, "send not found")
    return SendOut.model_validate(row)
