"""Public unsubscribe handler — token in URL, no auth needed."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ...container import get_container
from ...database import get_db
from ..repositories import EnrollmentRepository, ProspectRepository

router = APIRouter(prefix="/champmail/unsubscribe", tags=["champmail:unsubscribe"])


_PAGE = """<!doctype html>
<meta charset="utf-8">
<title>{title}</title>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:24px;text-align:center;color:#222">
<h2>{title}</h2>
<p>{body}</p>
</body>
"""


@router.get("/{token}", response_class=HTMLResponse)
async def unsubscribe_get(token: str, db: AsyncSession = Depends(get_db)):
    container = get_container()
    pid = container.unsubscribe_tokens.verify(token)
    if pid is None:
        raise HTTPException(400, "invalid or expired unsubscribe link")
    prospects = ProspectRepository(db)
    enrollments = EnrollmentRepository(db)
    prospect = await prospects.get(pid)
    if prospect is None:
        raise HTTPException(404, "prospect not found")
    await prospects.mark_event(pid, status="unsubscribed")
    paused = await enrollments.pause_active_for_prospect(pid, reason="unsubscribed")
    await db.commit()
    return HTMLResponse(_PAGE.format(
        title="You're unsubscribed",
        body=f"We've removed {prospect.email} from all active sequences ({paused} paused).",
    ))


@router.get("/issue/{prospect_id}")
async def issue_token(prospect_id: int):
    """Helper for templates — returns the URL to embed.
    Not strictly required since templates can render via Jinja, but handy
    for ad-hoc generation in the UI.
    """
    container = get_container()
    return {"token": container.unsubscribe_tokens.issue(prospect_id)}
