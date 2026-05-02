"""Execution memory collector — stores workflow run outcomes in ChampGraph.

After every execution finishes (success or error), this module:
  1. Reads the node_runs from Postgres
  2. Deterministically tags each node (good / bad / warning) based on output signals
  3. Generates plain-English future_notes from known anti-patterns
  4. Serialises the whole run as a natural-language episode
  5. Pushes it to ChampGraph via /api/ingest (raw episode) + /api/hooks/call
     into the reserved `champiq-orchestrator` account

The chat orchestrator queries `champiq-orchestrator` at prompt-build time to
retrieve similar past runs and inject them as learned context — this is the
read side; this file is the write side.

Design constraints:
  - Fire-and-forget: called with asyncio.create_task(), never blocks execution
  - Non-fatal: any exception is logged and swallowed — never propagates
  - No PII in graph: emails are hashed before storing in content; names/companies
    are kept because they're business-context signals, not sensitive
  - Uses existing GraphitiClient already wired in the container
"""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

from ..models import ExecutionTable, NodeRunTable

log = logging.getLogger(__name__)

# Reserved ChampGraph account for all orchestrator memories
MEMORY_ACCOUNT = "champiq-orchestrator"

# ── Tagging rules ────────────────────────────────────────────────────────────

def _tag_node(node_kind: str, status: str, output: dict[str, Any]) -> tuple[str, Optional[str]]:
    """Return (decision_tag, note_or_None) for one node run.

    Tags:
        good    = ran cleanly, output is meaningful
        bad     = error or degraded output (available=false, sent=false, json missing)
        warning = ran but with a signal worth remembering
    """
    if status == "error":
        return "bad", None

    if not output:
        return "good", None

    # champgraph
    if node_kind == "champgraph":
        if output.get("available") is False:
            return "bad", "champgraph unavailable — check CHAMPGRAPH_URL"
        asset = output.get("asset") or output.get("data", {}).get("asset") or {}
        data = output.get("data") or output
        confidence = asset.get("confidence") or data.get("confidence")
        if confidence == "low":
            inputs = {}  # we don't have inputs here; caller adds note if linkedin missing
            return "warning", "champgraph confidence=low — pass linkedin_url to improve research quality"

    # llm
    if node_kind == "llm":
        # json_mode was on but json key missing or None
        items = output.get("items") or []
        for it in items:
            if it.get("json") is None and it.get("text"):
                return "bad", "llm json_mode=true but response was not valid JSON — tighten system prompt"
        if output.get("json") is None and output.get("text") and "json" not in (output.get("text") or "").lower():
            return "warning", "llm output may not be JSON — verify json_mode=true is set"

    # champmail
    if node_kind == "champmail":
        items = output.get("items") or []
        for it in items:
            d = it.get("data") or {}
            if d.get("sent") is False:
                return "bad", "champmail: send failed — check sender credentials and Emelia account"
        data = output.get("data") or {}
        if data.get("sent") is False:
            return "bad", "champmail: send failed — check sender credentials and Emelia account"

    # champvoice
    if node_kind == "champvoice":
        items = output.get("items") or []
        for it in items:
            d = it.get("data") or {}
            if d.get("status") == "timeout":
                return "warning", "champvoice: call timed out — check phone format (E.164) and ElevenLabs/Twilio config"
            if d.get("status") in ("failed", "no_answer"):
                return "warning", f"champvoice: call ended with status={d.get('status')}"
        data = output.get("data") or {}
        if data.get("status") == "timeout":
            return "warning", "champvoice: call timed out"

    return "good", None


def _extract_pattern(node_runs: list[Any]) -> str:
    """Build a readable workflow pattern string from node runs."""
    parts = []
    for r in node_runs:
        kind = r.node_kind or r.get("node_kind", "unknown")
        action = None
        # try to extract action from input or config
        inp = (r.input if hasattr(r, "input") else r.get("input")) or {}
        config = inp.get("config") or {}
        action = inp.get("action") or config.get("action")
        if action:
            parts.append(f"{kind}({action})")
        else:
            parts.append(kind)
    return " -> ".join(parts)


def _hash_email(email: str) -> str:
    return "email_" + hashlib.sha256(email.lower().encode()).hexdigest()[:12]


def _build_episode_content(
    execution_id: str,
    pattern: str,
    node_results: list[dict[str, Any]],
    overall_outcome: str,
    future_notes: list[str],
) -> str:
    """Serialise the execution as a natural-language episode for Graphiti."""
    lines = [
        f"ChampIQ workflow execution {execution_id}.",
        f"Pattern: {pattern}.",
        f"Outcome: {overall_outcome}.",
        "",
    ]
    for nr in node_results:
        tag = nr["tag"]
        kind = nr["kind"]
        note = nr.get("note")
        status = nr["status"]
        line = f"Node {kind}: status={status} tag={tag}."
        if note:
            line += f" Note: {note}."
        # add key output signals (non-PII)
        for sig_key in ("confidence", "sent", "status"):
            sig = nr.get("signals", {}).get(sig_key)
            if sig is not None:
                line += f" {sig_key}={sig}."
        lines.append(line)

    if future_notes:
        lines.append("")
        lines.append("Future improvements:")
        for note in future_notes:
            lines.append(f"  - {note}")

    return "\n".join(lines)


def _build_call_summary(
    execution_id: str,
    pattern: str,
    node_results: list[dict[str, Any]],
    overall_outcome: str,
) -> str:
    good = sum(1 for r in node_results if r["tag"] == "good")
    bad = sum(1 for r in node_results if r["tag"] == "bad")
    warn = sum(1 for r in node_results if r["tag"] == "warning")
    return (
        f"Execution {execution_id}: {pattern}. "
        f"Outcome: {overall_outcome}. "
        f"Nodes: {len(node_results)} total, {good} good, {warn} warning, {bad} bad."
    )


def _build_transcript(node_results: list[dict[str, Any]]) -> str:
    parts = []
    for nr in node_results:
        p = f"node={nr['node_id']} kind={nr['kind']} status={nr['status']} tag={nr['tag']}"
        if nr.get("note"):
            p += f" note={nr['note']}"
        for k, v in (nr.get("signals") or {}).items():
            p += f" {k}={v}"
        parts.append(p + ".")
    return " ".join(parts)


# ── Main entry point ─────────────────────────────────────────────────────────

async def collect_execution_memory(
    execution_id: str,
    session_factory: async_sessionmaker[AsyncSession],
    graphiti_client: Any,  # GraphitiClient — typed loosely to avoid circular import
) -> None:
    """Fire-and-forget. Swallows all exceptions."""
    try:
        await _collect(execution_id, session_factory, graphiti_client)
    except Exception:
        log.exception("memory_collector: failed for execution %s (non-fatal)", execution_id)


async def _collect(
    execution_id: str,
    session_factory: async_sessionmaker[AsyncSession],
    graphiti_client: Any,
) -> None:
    if not graphiti_client or not graphiti_client.configured:
        log.debug("memory_collector: champgraph not configured, skipping")
        return

    # 1. Load execution + node_runs from DB
    async with session_factory() as session:
        exec_row = await session.get(ExecutionTable, execution_id)
        if exec_row is None:
            return
        node_run_rows = (
            await session.execute(
                select(NodeRunTable)
                .where(NodeRunTable.execution_id == execution_id)
                .order_by(NodeRunTable.id)
            )
        ).scalars().all()

    # 2. Tag each node + collect signals
    node_results: list[dict[str, Any]] = []
    future_notes: list[str] = []

    for row in node_run_rows:
        output = row.output or {}
        tag, note = _tag_node(row.node_kind or "", row.status or "", output)

        signals: dict[str, Any] = {}
        # pull lightweight non-PII signals
        data = output.get("data") or output
        asset = data.get("asset") or {}
        for key in ("confidence", "sent", "status", "found", "created", "count"):
            val = data.get(key) or output.get(key) or asset.get(key)
            if val is not None:
                signals[key] = val

        node_results.append({
            "node_id":  row.node_id,
            "kind":     row.node_kind or "unknown",
            "status":   row.status or "unknown",
            "tag":      tag,
            "note":     note,
            "signals":  signals,
        })
        if note:
            future_notes.append(note)

    # 3. Determine overall outcome
    has_bad = any(r["tag"] == "bad" for r in node_results)
    has_warn = any(r["tag"] == "warning" for r in node_results)
    if exec_row.status == "error" or has_bad:
        overall_outcome = "failed" if exec_row.status == "error" else "partial_success"
    elif has_warn:
        overall_outcome = "success_with_warnings"
    else:
        overall_outcome = "success"

    # 4. Build episode text
    pattern = _extract_pattern(node_run_rows)
    episode_content = _build_episode_content(
        execution_id, pattern, node_results, overall_outcome, future_notes,
    )
    call_summary = _build_call_summary(
        execution_id, pattern, node_results, overall_outcome,
    )
    transcript = _build_transcript(node_results)

    # 5. Ingest into ChampGraph — two calls for richer indexing
    # 5a. Raw episode (full detail, tags, notes)
    try:
        await graphiti_client._post("/api/ingest", {
            "account_name":       MEMORY_ACCOUNT,
            "mode":               "raw",
            "name":               execution_id,
            "content":            episode_content,
            "source_description": "ChampIQ execution log",
        })
        log.info("memory_collector: ingested episode for %s", execution_id)
    except Exception as e:
        log.warning("memory_collector: ingest episode failed for %s: %s", execution_id, e)

    # 5b. Structured call-hook (better relationship extraction by Graphiti)
    try:
        await graphiti_client._post("/api/hooks/call", {
            "account_name":   MEMORY_ACCOUNT,
            "contact_name":   "ChampIQ Workflow Engine",
            "summary":        call_summary,
            "duration_minutes": 0,
            "direction":      "outbound",
            "transcript":     transcript,
        })
        log.info("memory_collector: ingested hook_call for %s", execution_id)
    except Exception as e:
        log.warning("memory_collector: hook_call failed for %s: %s", execution_id, e)
