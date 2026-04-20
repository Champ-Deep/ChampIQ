"""Chat-to-workflow endpoint.

Takes a natural-language message + the current canvas state, asks the
configured LLM for a patch (add_nodes / add_edges / update_node / remove) and
returns BOTH the assistant reply and the patch so the frontend can apply it
live.

Stateless-friendly: history is persisted in chat_messages and re-assembled
server-side from session_id. The LLM is injected via the container so the
provider (OpenRouter today; anything else tomorrow) stays swappable.
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..container import get_container
from ..database import get_db
from ..llm import LLMMessage
from ..models import ChatMessageIn, ChatMessageOut, ChatMessageTable

log = logging.getLogger(__name__)
router = APIRouter()


SYSTEM_PROMPT = """You are the ChampIQ Canvas workflow assistant — a senior SDR
operations engineer. You help the user design, edit, and explain sales-automation
workflows on a node-based canvas (like n8n), using these building blocks:

TOOL NODES (kind = tool_id):
  champmail          — cold email sequences & analytics
    actions: add_prospect, start_sequence, pause_sequence, send_single_email,
             get_analytics, list_templates
  champgraph         — semantic knowledge graph
    actions: ingest_prospect, ingest_company, semantic_search, nl_query,
             add_relationship
  lakeb2b_pulse      — LinkedIn engagement automation
    actions: track_page, schedule_engagement, list_posts,
             get_engagement_status

BUILT-IN NODES:
  trigger.manual / trigger.webhook / trigger.cron / trigger.event
  http      — generic REST call
  set       — compose object from expressions
  merge     — join multiple upstream outputs
  if        — { condition: "<expr>" }  emits branches: "true" | "false"
  switch    — { value, cases: [{match, branch}], default_branch }
  loop      — { items, each, concurrency }
  wait      — { seconds }
  code      — sandboxed Python expression
  llm       — LLM call { prompt, system, json_mode }

NODE JSON SHAPE:
  { "id": "<unique>", "type": "toolNode",
    "position": {"x": <int>, "y": <int>},
    "data": { "kind": "<kind>", "config": { ... }, "label": "<display>" } }
  - `kind` is REQUIRED (tool_id OR built-in kind).
  - For tool nodes, config is { "action": "<action_id>", "credential": "<cred_name>",
    "inputs": { "field": "{{ prev.whatever }}" } }.

EDGE JSON SHAPE:
  { "id": "<unique>", "source": "<node_id>", "target": "<node_id>",
    "type": "customEdge", "sourceHandle": "<branch or null>" }

EXPRESSIONS: use {{ ... }} — e.g. {{ prev.email }}, {{ node["Champmail-1"].output.data.id }},
  {{ trigger.payload.email }}. `prev` = direct-predecessor output;
  `node` = all upstream outputs keyed by node id; `trigger` = trigger payload.

REPLY FORMAT — ALWAYS reply with a single JSON object, no prose outside it:
{
  "explanation": "<1-3 sentence plan summary for the user>",
  "patch": {
    "add_nodes": [ ... ],
    "add_edges": [ ... ],
    "remove_node_ids": [ ... ],
    "update_nodes": [ { "id": "<id>", "data": { ... partial merge ... } } ]
  }
}

If the user is only asking a question, leave `patch` with empty arrays and put
your answer in `explanation`. Prefer small, incremental patches over replacing
the whole graph. Never invent actions or kinds that aren't in this list."""


@router.get("/chat/history", response_model=list[ChatMessageOut])
async def chat_history(session_id: str = "default", db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(ChatMessageTable)
            .where(ChatMessageTable.session_id == session_id)
            .order_by(ChatMessageTable.id)
        )
    ).scalars().all()
    return list(rows)


@router.post("/chat/message", response_model=ChatMessageOut)
async def chat_message(body: ChatMessageIn, db: AsyncSession = Depends(get_db)):
    container = get_container()

    # persist user turn first so history is consistent even if LLM fails
    user_row = ChatMessageTable(session_id=body.session_id, role="user", content=body.content)
    db.add(user_row)
    await db.commit()
    await db.refresh(user_row)

    history_rows = (
        await db.execute(
            select(ChatMessageTable)
            .where(ChatMessageTable.session_id == body.session_id)
            .order_by(ChatMessageTable.id)
        )
    ).scalars().all()

    user_turn = body.content
    if body.current_workflow:
        user_turn += "\n\nCurrent workflow JSON:\n```json\n"
        user_turn += json.dumps(body.current_workflow, indent=2)[:6000]
        user_turn += "\n```"

    messages: list[LLMMessage] = []
    for row in history_rows[:-1]:
        if row.role in ("user", "assistant"):
            messages.append(LLMMessage(role=row.role, content=row.content))  # type: ignore[arg-type]
    messages.append(LLMMessage(role="user", content=user_turn))

    try:
        resp = await container.llm.complete(
            messages,
            system=SYSTEM_PROMPT,
            temperature=0.2,
            max_tokens=2048,
        )
    except Exception as err:
        log.exception("LLM call failed")
        raise HTTPException(502, f"LLM call failed: {err}")

    text = resp.text
    patch = _extract_patch(text)

    assistant_row = ChatMessageTable(
        session_id=body.session_id,
        role="assistant",
        content=text,
        workflow_patch=patch,
    )
    db.add(assistant_row)
    await db.commit()
    await db.refresh(assistant_row)
    return assistant_row


def _extract_patch(text: str) -> dict | None:
    text = text.strip()
    if text.startswith("```"):
        segments = text.split("```")
        for seg in segments:
            seg = seg.strip()
            if seg.startswith("json"):
                seg = seg[4:].strip()
            if seg.startswith("{") or seg.startswith("["):
                try:
                    return json.loads(seg)
                except json.JSONDecodeError:
                    continue
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None
