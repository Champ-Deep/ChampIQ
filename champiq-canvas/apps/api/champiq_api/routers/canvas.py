from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..database import get_db
from ..models import CanvasStateTable, CanvasStateIn, CanvasStateOut
from datetime import datetime, timezone

router = APIRouter()


@router.get("/canvas/state", response_model=CanvasStateOut)
async def get_canvas_state(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CanvasStateTable).where(CanvasStateTable.canvas_id == "default")
    )
    row = result.scalar_one_or_none()
    if row is None:
        return CanvasStateOut(nodes=[], edges=[], updated_at=datetime.now(timezone.utc))
    return CanvasStateOut.model_validate(row)


@router.post("/canvas/state", response_model=CanvasStateOut)
async def save_canvas_state(body: CanvasStateIn, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CanvasStateTable).where(CanvasStateTable.canvas_id == "default")
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = CanvasStateTable(canvas_id="default", nodes=body.nodes, edges=body.edges)
        db.add(row)
    else:
        row.nodes = body.nodes
        row.edges = body.edges
    await db.commit()
    await db.refresh(row)
    return CanvasStateOut.model_validate(row)
