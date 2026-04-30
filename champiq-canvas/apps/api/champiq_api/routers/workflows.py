"""Workflow CRUD + run endpoints."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..container import get_container
from ..database import get_db
from ..models import ExecutionOut, NodeRunOut, ExecutionTable, NodeRunTable, WorkflowIn, WorkflowOut, WorkflowTable

router = APIRouter()


# Caps chosen so a runaway client can't OOM the API: 500 nodes/edges is far
# more than any sane canvas (real ones top out around 30). Pydantic enforces
# these before we ever load the orchestrator.
_MAX_NODES = 500
_MAX_EDGES = 1000


class AdHocRunIn(BaseModel):
    nodes: list[dict[str, Any]] = Field(default_factory=list, max_length=_MAX_NODES)
    edges: list[dict[str, Any]] = Field(default_factory=list, max_length=_MAX_EDGES)
    trigger: dict[str, Any] = Field(default_factory=dict)


class WorkflowRunIn(BaseModel):
    """Optional payload for `/workflows/{id}/run`. Free-form trigger object,
    same as the saved workflow's trigger contract."""
    trigger: dict[str, Any] = Field(default_factory=dict)


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


# Idempotency cache for run endpoints. Keyed by `Idempotency-Key` request
# header — when the same key is replayed within TTL, return the original
# execution id instead of starting a new run. Defends against double-clicks,
# webhook retries, and broken clients.
#
# Backed by Redis when REDIS_URL is set (multi-worker correct). Falls back to
# an in-memory dict when Redis isn't reachable — single-worker dev, tests.
# The in-memory fallback is best-effort across workers; production deploys
# should always have REDIS_URL set.
import time as _time

_IDEMP_TTL_SECONDS = 600
_IDEMP_PREFIX = "champiq:idemp:"
_idemp_cache: dict[str, tuple[float, str]] = {}  # in-memory fallback


def _redis_client():
    """Returns a redis.asyncio client or None if Redis isn't configured/reachable.
    Cached at module level via lru_cache on the wrapping function — see _redis()."""
    from ..database import get_settings
    s = get_settings()
    if not s.redis_url:
        return None
    try:
        import redis.asyncio as redis
        return redis.from_url(s.redis_url, decode_responses=True)
    except Exception:
        return None


from functools import lru_cache as _lru_cache


@_lru_cache(maxsize=1)
def _redis():
    return _redis_client()


async def _idemp_lookup(key: str) -> str | None:
    r = _redis()
    if r is not None:
        try:
            return await r.get(f"{_IDEMP_PREFIX}{key}")
        except Exception:
            pass  # fall through to in-memory
    entry = _idemp_cache.get(key)
    if entry is None:
        return None
    expires_at, exec_id = entry
    if expires_at < _time.time():
        _idemp_cache.pop(key, None)
        return None
    return exec_id


async def _idemp_remember(key: str, exec_id: str) -> None:
    r = _redis()
    if r is not None:
        try:
            await r.set(f"{_IDEMP_PREFIX}{key}", exec_id, ex=_IDEMP_TTL_SECONDS)
            return
        except Exception:
            pass  # fall through to in-memory
    _idemp_cache[key] = (_time.time() + _IDEMP_TTL_SECONDS, exec_id)
    if len(_idemp_cache) > 256:
        now = _time.time()
        for k in [k for k, (exp, _) in _idemp_cache.items() if exp < now]:
            _idemp_cache.pop(k, None)


@router.post("/workflows/ad-hoc/run")
async def run_ad_hoc(
    body: AdHocRunIn,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    """Run a graph without saving it as a workflow (used by canvas 'Run All').

    Declared before /workflows/{workflow_id}/run so the literal 'ad-hoc'
    segment matches first. Pass `Idempotency-Key` to make retries safe.
    """
    if idempotency_key:
        existing = await _idemp_lookup(idempotency_key)
        if existing:
            return {"execution_id": existing, "accepted": True, "idempotent_replay": True}

    execution_id = await get_container().orchestrator.run_ad_hoc(
        nodes=body.nodes,
        edges=body.edges,
        trigger_payload=body.trigger,
    )
    if idempotency_key:
        await _idemp_remember(idempotency_key, execution_id)
    return {"execution_id": execution_id, "accepted": True}


@router.post("/workflows/{workflow_id}/run")
async def run_workflow(
    workflow_id: int,
    payload: WorkflowRunIn | None = None,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    if idempotency_key:
        existing = await _idemp_lookup(idempotency_key)
        if existing:
            return {"execution_id": existing, "accepted": True, "idempotent_replay": True}

    trigger = payload.trigger if payload else {}
    execution_id = await get_container().orchestrator.run_workflow(
        workflow_id, trigger_kind="manual", trigger_payload=trigger
    )
    if idempotency_key:
        await _idemp_remember(idempotency_key, execution_id)
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
