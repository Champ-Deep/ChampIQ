import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .container import get_container
from .routers import canvas, chat, credentials, events_ws, jobs, registry, tools, webhooks, workflows


@asynccontextmanager
async def lifespan(app: FastAPI):
    container = get_container()
    await container.cron.start()
    await container.event_listener.start()
    try:
        yield
    finally:
        await container.cron.shutdown()
        await container.event_listener.shutdown()


app = FastAPI(title="ChampIQ Canvas API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3001",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:4173",
        "http://localhost:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(canvas.router, prefix="/api")
app.include_router(registry.router, prefix="/api")
app.include_router(tools.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(workflows.router, prefix="/api")
app.include_router(credentials.router, prefix="/api")
app.include_router(webhooks.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(events_ws.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


# --- SPA mount -----------------------------------------------------------
#
# In the single-container image, the built SPA lives at /app/web. For local
# dev, we usually run Vite on :5174 and don't need this mount. Any unknown
# non-/api path falls through to index.html so React Router works.

_WEB_DIST = Path(os.environ.get("WEB_DIST_DIR", "/app/web"))

# HTML shell must never be cached — asset filenames are hashed, but index.html
# is not, so stale shells reference dead bundles and render a blank page.
_NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, must-revalidate",
    "Pragma": "no-cache",
}


def _spa_shell() -> FileResponse:
    return FileResponse(str(_WEB_DIST / "index.html"), headers=_NO_CACHE_HEADERS)


if _WEB_DIST.exists() and (_WEB_DIST / "index.html").exists():
    assets_dir = _WEB_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/", include_in_schema=False)
    async def spa_root() -> FileResponse:
        return _spa_shell()

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_catch_all(full_path: str, request: Request) -> FileResponse:
        # API and WS paths that reached here are genuine 404s — serve the
        # shell anyway so client-side routing can present a 404 page.
        if full_path.startswith(("api/", "ws/")) or full_path in {"health", "favicon.ico"}:
            return _spa_shell()
        candidate = _WEB_DIST / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))
        return _spa_shell()
