import json
from pathlib import Path
from fastapi import APIRouter, HTTPException

router = APIRouter()


def _find_manifests_dir() -> Path:
    # Check multiple locations: dev mode (4 levels up from routers/) and Docker mode (./manifests/).
    candidates = [
        Path(__file__).parents[4] / "manifests",
        Path("/manifests"),
        Path.cwd() / "manifests",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("Could not find manifests directory")


@router.get("/registry/manifests")
async def list_manifests() -> list[dict]:
    try:
        manifests_dir = _find_manifests_dir()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    manifests = []
    for path in sorted(manifests_dir.glob("*.manifest.json")):
        try:
            manifests.append(json.loads(path.read_text()))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to load {path.name}: {exc}")
    return manifests
