import uuid
import asyncio
from fastapi import APIRouter
from ..jobs import job_store, simulate_job_progression
from ..cli_shim import invoke_tool_cli

router = APIRouter()

VALID_TOOLS = {"champgraph", "champmail", "champvoice"}

# Stub populate data.
# TODO(Hemang): replace stub data with real API calls to each tool backend.
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


@router.get("/{tool}/status")
async def tool_status(tool: str):
    if tool not in VALID_TOOLS:
        return {"status": "unknown", "tool": tool}
    # TODO(Hemang): replace stub with real CLI/API health check per tool.
    return {"status": "ok", "tool": tool}


@router.get("/{tool}/{resource}")
async def populate_resource(tool: str, resource: str):
    """Serve populate endpoint data for manifest dropdowns."""
    if tool not in VALID_TOOLS:
        return []
    return STUB_POPULATE.get(tool, {}).get(resource, [])


@router.post("/{tool}/{action}")
async def run_action(tool: str, action: str, payload: dict = {}):
    if tool not in VALID_TOOLS:
        return {"error": f"Unknown tool: {tool}"}
    job_id = f"job_{uuid.uuid4().hex[:8]}"
    await invoke_tool_cli(tool, action, payload)
    asyncio.create_task(simulate_job_progression(job_id))
    return {"job_id": job_id, "accepted": True, "async": True}
