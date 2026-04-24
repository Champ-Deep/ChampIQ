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
async def populate_resource(tool: str, resource: str):
    if tool not in VALID_TOOLS:
        return []
    return STUB_POPULATE.get(tool, {}).get(resource, [])


@router.post("/tools/{tool}/{action}")
async def run_action(tool: str, action: str, payload: dict = {}, db: AsyncSession = Depends(get_db)):
    if tool not in VALID_TOOLS:
        raise HTTPException(400, f"Unknown tool: {tool}")

    container = get_container()
    driver = container.drivers.get(tool)
    if driver is None:
        raise HTTPException(500, f"No driver registered for tool: {tool}")

    # Resolve credentials — accept credential_id (int) or credential name (str)
    credentials: dict = {}
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
            result = await driver.invoke(action, inputs, credentials)
            job_store[job_id] = {"job_id": job_id, "status": "done", "progress": 100, "result": result}
        except Exception as exc:
            job_store[job_id] = {"job_id": job_id, "status": "failed", "progress": 100, "result": {"error": str(exc)}}

    job_store[job_id] = {"job_id": job_id, "status": "running", "progress": 0, "result": None, "created_at": datetime.now(timezone.utc).isoformat()}
    asyncio.create_task(_run())

    return {"job_id": job_id, "accepted": True, "async": True}
