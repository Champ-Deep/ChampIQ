"""Templates CRUD + preview rendering."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ...container import get_container
from ...database import get_db
from ..repositories import TemplateRepository
from ..schemas import TemplateIn, TemplateOut, TemplatePreviewIn, TemplatePreviewOut, TemplateUpdate

router = APIRouter(prefix="/champmail/templates", tags=["champmail:templates"])


@router.get("", response_model=list[TemplateOut])
async def list_templates(db: AsyncSession = Depends(get_db)):
    repo = TemplateRepository(db)
    return [TemplateOut.model_validate(r) for r in await repo.list()]


@router.post("", response_model=TemplateOut, status_code=201)
async def create_template(body: TemplateIn, db: AsyncSession = Depends(get_db)):
    repo = TemplateRepository(db)
    if await repo.get_by_name(body.name):
        raise HTTPException(409, f"template named {body.name!r} already exists")
    row = await repo.create(**body.model_dump())
    await db.commit()
    return TemplateOut.model_validate(row)


@router.get("/{template_id}", response_model=TemplateOut)
async def get_template(template_id: int, db: AsyncSession = Depends(get_db)):
    repo = TemplateRepository(db)
    row = await repo.get(template_id)
    if row is None:
        raise HTTPException(404, "template not found")
    return TemplateOut.model_validate(row)


@router.patch("/{template_id}", response_model=TemplateOut)
async def update_template(template_id: int, body: TemplateUpdate, db: AsyncSession = Depends(get_db)):
    repo = TemplateRepository(db)
    row = await repo.update(template_id, **body.model_dump(exclude_unset=True))
    if row is None:
        raise HTTPException(404, "template not found")
    await db.commit()
    return TemplateOut.model_validate(row)


@router.delete("/{template_id}")
async def delete_template(template_id: int, db: AsyncSession = Depends(get_db)):
    repo = TemplateRepository(db)
    ok = await repo.delete(template_id)
    if not ok:
        raise HTTPException(404, "template not found")
    await db.commit()
    return {"deleted": template_id}


@router.post("/preview", response_model=TemplatePreviewOut)
async def preview_template(body: TemplatePreviewIn, db: AsyncSession = Depends(get_db)):
    """Render a template against arbitrary variables (no prospect required).
    Used by the frontend template editor."""
    repo = TemplateRepository(db)
    tpl = await repo.get(body.template_id)
    if tpl is None:
        raise HTTPException(404, "template not found")
    renderer = get_container().mail_renderer
    out = renderer.render(
        subject=tpl.subject,
        body_html=tpl.body_html,
        body_text=tpl.body_text,
        prospect=None,
        extra_vars=body.variables,
    )
    return TemplatePreviewOut(subject=out.subject, body_html=out.body_html, body_text=out.body_text)
