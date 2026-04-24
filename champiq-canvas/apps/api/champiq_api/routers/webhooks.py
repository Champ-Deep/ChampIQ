"""Webhook receivers for external tools + per-workflow webhook triggers."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from ..container import get_container
from ..database import get_db
from ..models import WorkflowTable

router = APIRouter()


@router.post("/webhooks/tools/{tool_id}")
async def tool_webhook(tool_id: str, request: Request):
    """Generic receiver. Tool drivers translate payloads into canonical events
    on the bus; workflows with matching event triggers fire automatically.
    """
    container = get_container()
    driver = container.drivers.get(tool_id)
    if driver is None:
        raise HTTPException(404, f"unknown tool {tool_id}")
    body = await request.json()
    canonical = driver.parse_webhook(body)
    if canonical is None:
        return {"ignored": True}
    event = canonical["event"]
    payload = {k: v for k, v in canonical.items() if k != "event"}
    await container.event_bus.publish(event, payload)
    return {"published": event}


@router.post("/webhooks/wf/{workflow_id}/{trigger_id}")
async def workflow_webhook(
    workflow_id: int,
    trigger_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    wf = await db.get(WorkflowTable, workflow_id)
    if wf is None or not wf.active:
        raise HTTPException(404, "workflow inactive or missing")
    if not any(
        t.get("kind") == "webhook" and t.get("id", "default") == trigger_id
        for t in (wf.triggers or [])
    ):
        raise HTTPException(404, "webhook trigger not configured")
    payload = await request.json()
    execution_id = await get_container().orchestrator.run_workflow(
        workflow_id, trigger_kind="webhook", trigger_payload=payload
    )
    return {"execution_id": execution_id}
