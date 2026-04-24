"""Persistence models and wire schemas for the orchestrator.

Every SQLAlchemy table is single-purpose (SRP). Pydantic DTOs live next to the
tables they mirror so routers don't reach into ORM objects.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Text, DateTime, Integer, String, ForeignKey, Boolean, Index, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pydantic import BaseModel, Field

from .database import Base


# --- Canvas (UI state) ---------------------------------------------------

class CanvasStateTable(Base):
    __tablename__ = "canvas_state"

    id: Mapped[int] = mapped_column(primary_key=True)
    canvas_id: Mapped[str] = mapped_column(Text, unique=True, default="default")
    nodes: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    edges: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CanvasStateIn(BaseModel):
    nodes: list[Any] = []
    edges: list[Any] = []


class CanvasStateOut(BaseModel):
    nodes: list[Any]
    edges: list[Any]
    updated_at: datetime
    model_config = {"from_attributes": True}


# --- Credentials ---------------------------------------------------------

class CredentialTable(Base):
    __tablename__ = "credentials"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    type: Mapped[str] = mapped_column(String(100), index=True)
    data_encrypted: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CredentialIn(BaseModel):
    name: str
    type: str
    data: dict[str, Any]


class CredentialOut(BaseModel):
    id: int
    name: str
    type: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# --- Workflows -----------------------------------------------------------

class WorkflowTable(Base):
    __tablename__ = "workflows"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    nodes: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    edges: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    triggers: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class WorkflowIn(BaseModel):
    name: str
    description: Optional[str] = None
    active: bool = True
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    triggers: list[dict[str, Any]] = []


class WorkflowOut(WorkflowIn):
    id: int
    version: int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# --- Executions ----------------------------------------------------------

class ExecutionTable(Base):
    __tablename__ = "executions"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    workflow_id: Mapped[int] = mapped_column(ForeignKey("workflows.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="queued", index=True)
    trigger_kind: Mapped[str] = mapped_column(String(30), default="manual")
    trigger_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    result: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    node_runs: Mapped[list["NodeRunTable"]] = relationship(
        "NodeRunTable", back_populates="execution", cascade="all, delete-orphan"
    )


class NodeRunTable(Base):
    __tablename__ = "node_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id", ondelete="CASCADE"), index=True)
    node_id: Mapped[str] = mapped_column(String(100))
    node_kind: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(30), default="pending")
    input: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    output: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retries: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    execution: Mapped[ExecutionTable] = relationship("ExecutionTable", back_populates="node_runs")


Index("ix_node_runs_exec_node", NodeRunTable.execution_id, NodeRunTable.node_id)


class ExecutionOut(BaseModel):
    id: str
    workflow_id: int
    status: str
    trigger_kind: str
    trigger_payload: dict[str, Any]
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    started_at: datetime
    finished_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class NodeRunOut(BaseModel):
    id: int
    execution_id: str
    node_id: str
    node_kind: str
    status: str
    input: Optional[dict[str, Any]] = None
    output: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    retries: int
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


# --- Legacy job DTO (used by existing /jobs/{id} route) ------------------

class JobStatusOut(BaseModel):
    job_id: str
    status: str
    progress: int = 0
    result: dict[str, Any] | None = None


# --- Chat history --------------------------------------------------------

class ChatMessageTable(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    role: Mapped[str] = mapped_column(String(20))  # user | assistant | system
    content: Mapped[str] = mapped_column(Text)
    workflow_patch: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChatMessageIn(BaseModel):
    session_id: str = Field(default="default")
    content: str
    current_workflow: Optional[dict[str, Any]] = None


class ChatMessageOut(BaseModel):
    id: int
    session_id: str
    role: str
    content: str
    workflow_patch: Optional[dict[str, Any]] = None
    created_at: datetime
    model_config = {"from_attributes": True}
