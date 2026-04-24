"""Workflow CRUD + run endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..container import get_container
from ..database import get_db
from ..models import ExecutionOut, NodeRunOut, ExecutionTable, NodeRunTable, WorkflowIn, WorkflowOut, WorkflowTable

router = APIRouter()


@router.get("/workflows", response_model=list[WorkflowOut])
async def list_workflows(db: AsyncSession = Depends(get_db)) -> list[WorkflowTable]:
    rows = (await db.execute(select(WorkflowTable).order_by(WorkflowTable.id.desc()))).scalars().all()
    return list(rows)


@router.post("/workflows", response_model=WorkflowOut)
async def create_workflow(body: WorkflowIn, db: AsyncSession = Depends(get_db)) -> WorkflowTable:
    row = WorkflowTable(**body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    await get_container().cron.sync()
    return row


@router.get("/workflows/{workflow_id}", response_model=WorkflowOut)
async def get_workflow(workflow_id: int, db: AsyncSession = Depends(get_db)) -> WorkflowTable:
    row = await db.get(WorkflowTable, workflow_id)
    if row is None:
        raise HTTPException(404, "workflow not found")
    return row


@router.put("/workflows/{workflow_id}", response_model=WorkflowOut)
async def update_workflow(
    workflow_id: int, body: WorkflowIn, db: AsyncSession = Depends(get_db)
) -> WorkflowTable:
    row = await db.get(WorkflowTable, workflow_id)
    if row is None:
        raise HTTPException(404, "workflow not found")
    for field, value in body.model_dump().items():
        setattr(row, field, value)
    row.version = (row.version or 1) + 1
    await db.commit()
    await db.refresh(row)
    await get_container().cron.sync()
    return row


@router.delete("/workflows/{workflow_id}")
async def delete_workflow(workflow_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    row = await db.get(WorkflowTable, workflow_id)
    if row is None:
        raise HTTPException(404, "workflow not found")
    await db.delete(row)
    await db.commit()
    await get_container().cron.sync()
    return {"deleted": workflow_id}


@router.post("/workflows/ad-hoc/run")
async def run_ad_hoc(body: dict) -> dict:
    """Run a graph without saving it as a workflow (used by canvas 'Run All').

    Declared before /workflows/{workflow_id}/run so the literal 'ad-hoc'
    segment matches first.
    """
    execution_id = await get_container().orchestrator.run_ad_hoc(
        nodes=body.get("nodes", []),
        edges=body.get("edges", []),
        trigger_payload=body.get("trigger", {}),
    )
    return {"execution_id": execution_id, "accepted": True}


@router.post("/workflows/{workflow_id}/run")
async def run_workflow(workflow_id: int, payload: dict | None = None) -> dict:
    payload = payload or {}
    execution_id = await get_container().orchestrator.run_workflow(
        workflow_id, trigger_kind="manual", trigger_payload=payload
    )
    return {"execution_id": execution_id, "accepted": True}


@router.get("/executions/{execution_id}", response_model=ExecutionOut)
async def get_execution(execution_id: str, db: AsyncSession = Depends(get_db)) -> ExecutionTable:
    row = await db.get(ExecutionTable, execution_id)
    if row is None:
        raise HTTPException(404, "execution not found")
    return row


@router.get("/executions/{execution_id}/node_runs", response_model=list[NodeRunOut])
async def get_node_runs(execution_id: str, db: AsyncSession = Depends(get_db)) -> list[NodeRunTable]:
    rows = (
        await db.execute(
            select(NodeRunTable).where(NodeRunTable.execution_id == execution_id).order_by(NodeRunTable.id)
        )
    ).scalars().all()
    return list(rows)


@router.get("/workflows/{workflow_id}/executions", response_model=list[ExecutionOut])
async def list_executions(
    workflow_id: int, db: AsyncSession = Depends(get_db), limit: int = 50
) -> list[ExecutionTable]:
    rows = (
        await db.execute(
            select(ExecutionTable)
            .where(ExecutionTable.workflow_id == workflow_id)
            .order_by(ExecutionTable.started_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return list(rows)
