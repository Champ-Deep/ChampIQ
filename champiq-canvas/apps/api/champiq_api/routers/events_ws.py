"""WebSocket endpoint that streams orchestrator events (execution + node)."""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..container import get_container

log = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/events")
async def ws_events(websocket: WebSocket) -> None:
    await websocket.accept()
    bus = get_container().event_bus
    try:
        async for msg in bus.subscribe("*"):
            await websocket.send_json(msg)
    except WebSocketDisconnect:
        return
    except asyncio.CancelledError:
        return
    except Exception:
        log.exception("ws stream crashed")
        await websocket.close()
