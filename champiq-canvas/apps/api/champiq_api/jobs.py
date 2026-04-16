import asyncio
import uuid
from datetime import datetime, timezone

# In-memory job store for Phase 1 only.
# TODO(Hemang): replace with persistent job store (Postgres or Redis) in Phase 2.
job_store: dict[str, dict] = {}


async def simulate_job_progression(job_id: str) -> None:
    """Simulate idle to running to done over 10 seconds."""
    job_store[job_id] = {
        "job_id": job_id,
        "status": "idle",
        "progress": 0,
        "result": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await asyncio.sleep(1)
    job_store[job_id]["status"] = "running"
    job_store[job_id]["progress"] = 30
    await asyncio.sleep(4)
    job_store[job_id]["progress"] = 70
    await asyncio.sleep(5)
    job_store[job_id]["status"] = "done"
    job_store[job_id]["progress"] = 100
    job_store[job_id]["result"] = {
        "message": "Stub job completed successfully.",
        # TODO(Hemang): replace with real tool output payload.
        "records": [
            {
                "id": f"rec_{uuid.uuid4().hex[:6]}",
                "name": "Stub Prospect",
                "email": "stub@example.com",
                "company": "Stub Corp",
                "role": "CTO",
            }
        ],
    }
