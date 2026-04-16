from datetime import datetime
from typing import Any
from sqlalchemy import Text, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from pydantic import BaseModel
from .database import Base


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


class JobStatusOut(BaseModel):
    job_id: str
    status: str
    progress: int = 0
    result: dict[str, Any] | None = None
