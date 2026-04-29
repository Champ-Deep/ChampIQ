import uuid
import json
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from ..container import get_container
from ..database import get_db
from ..jobs import job_store

router = APIRouter()

VALID_TOOLS = {"champgraph", "champmail", "champvoice", "lakeb2b_pulse"}

STUB_POPULATE: dict[str, dict] = {
    "champgraph": {
        "industries": ["SaaS", "FinTech", "HealthTech", "EdTech", "RetailTech"],
        "roles": ["CTO", "VP Engineering", "Head of Product", "CEO", "Founder"],
    },
    "champmail": {
        "templates": [
            {"value": "tmpl_001", "label": "Cold Outreach v1"},
            {"value": "tmpl_002", "label": "Follow-Up Sequence"},
        ]
    },
    "champvoice": {
        "scripts": [
            {"value": "scr_001", "label": "Discovery Call Script"},
            {"value": "scr_002", "label": "Qualification Script"},
        ]
    },
}


@router.get("/tools/{tool}/status")
async def tool_status(tool: str):
    if tool not in VALID_TOOLS:
        return {"status": "unknown", "tool": tool}
    return {"status": "ok", "tool": tool}


@router.get("/tools/{tool}/{resource}")
async def populate_resource(tool: str, resource: str, db: AsyncSession = Depends(get_db)):
    if tool not in VALID_TOOLS:
        return []
    # Real lookups for the inline champmail module — replaces the old stubs.
    if tool == "champmail":
        from ..champmail.repositories import SequenceRepository, TemplateRepository  # noqa: PLC0415
        if resource == "templates":
            rows = await TemplateRepository(db).list()
            return [{"value": str(r.id), "label": r.name} for r in rows]
        if resource == "sequences":
            rows = await SequenceRepository(db).list()
            return [{"value": str(r.id), "label": r.name} for r in rows]
    return STUB_POPULATE.get(tool, {}).get(resource, [])


async def _invoke_champmail_local(action: str, inputs: dict) -> dict:
    """Run a champmail action through the local executor's dispatcher.

    The legacy HTTP-driver pathway is gone; champmail now lives inline so we
    bypass the driver dict and call the action handlers directly against a
    fresh DB session. Credentials are not consulted — single-tenant means
    we don't need them anymore.
    """
    from ..champmail.nodes.champmail_node import _ACTION_HANDLERS, ChampmailLocalExecutor  # noqa: PLC0415
    from ..database import get_session_factory  # noqa: PLC0415

    handler = _ACTION_HANDLERS.get(action)
    if handler is None:
        raise KeyError(f"champmail: unknown action {action!r}")

    container = get_container()
    executor = ChampmailLocalExecutor(
        container.mail_transport,
        container.mail_renderer,
        transport_factory=container.mail_transport_factory,
    )
    session_factory = get_session_factory()
    async with session_factory() as session:
        try:
            result = await handler(executor, inputs or {}, session)
            await session.commit()
            return result
        except Exception:
            await session.rollback()
            raise


@router.post("/tools/{tool}/{action}")
async def run_action(tool: str, action: str, payload: dict = {}, db: AsyncSession = Depends(get_db)):
    if tool not in VALID_TOOLS:
        raise HTTPException(400, f"Unknown tool: {tool}")

    container = get_container()

    # Champmail and champgraph are inline now — no entries in the drivers dict.
    is_champmail = tool == "champmail"
    is_champgraph = tool == "champgraph"
    inline_tool = is_champmail or is_champgraph
    driver = None
    if not inline_tool:
        driver = container.drivers.get(tool)
        if driver is None:
            raise HTTPException(500, f"No driver registered for tool: {tool}")

    # Resolve credentials — accept credential_id (int) or credential name (str).
    # Inline tools (champmail/champgraph) authenticate via env or credential records
    # they manage themselves; this credential block is only for HTTP drivers.
    credentials: dict = {}
    if not inline_tool:
        cred_ref = payload.get("credential_id") or payload.get("credential")
        if cred_ref is not None:
            try:
                if isinstance(cred_ref, int):
                    from ..models import CredentialTable  # noqa: PLC0415
                    row = await db.get(CredentialTable, cred_ref)
                    if row is None:
                        raise HTTPException(404, f"Credential {cred_ref} not found")
                    credentials = json.loads(container.crypto.decrypt(row.data_encrypted))
                else:
                    credentials = await container.credential_resolver.resolve(str(cred_ref))
            except KeyError as e:
                raise HTTPException(404, str(e))

    inputs = payload.get("inputs", {})

    job_id = f"job_{uuid.uuid4().hex[:8]}"

    async def _run():
        try:
            if is_champmail:
                result = await _invoke_champmail_local(action, inputs)
            elif is_champgraph:
                result = await container.champgraph.invoke(action, inputs)
            else:
                result = await driver.invoke(action, inputs, credentials)
            job_store[job_id] = {"job_id": job_id, "status": "done", "progress": 100, "result": result}
        except Exception as exc:
            import traceback
            err_msg = str(exc) or f"{type(exc).__name__}: {repr(exc)}"
            if not err_msg.strip():
                err_msg = traceback.format_exc()
            job_store[job_id] = {"job_id": job_id, "status": "failed", "progress": 100, "result": {"error": err_msg}}

    job_store[job_id] = {"job_id": job_id, "status": "running", "progress": 0, "result": None, "created_at": datetime.now(timezone.utc).isoformat()}
    asyncio.create_task(_run())

    return {"job_id": job_id, "accepted": True, "async": True}
