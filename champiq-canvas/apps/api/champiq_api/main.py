import gzip
import io
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .champmail.routers import (
    analytics as cm_analytics,
    credentials as cm_credentials,
    enrollments as cm_enrollments,
    prospects as cm_prospects,
    sends as cm_sends,
    senders as cm_senders,
    sequences as cm_sequences,
    templates as cm_templates,
    unsubscribe as cm_unsubscribe,
    webhooks as cm_webhooks,
)
from .container import get_container
from .routers import auth_lakeb2b, canvas, chat, credentials, events_ws, jobs, registry, tools, uploads, webhooks, workflows


@asynccontextmanager
async def lifespan(app: FastAPI):
    container = get_container()
    await container.cron.start()
    await container.event_listener.start()
    container.cadence_job.start()
    try:
        yield
    finally:
        container.cadence_job.stop()
        await container.cron.shutdown()
        await container.event_listener.shutdown()


app = FastAPI(title="ChampIQ Canvas API", version="0.2.0", lifespan=lifespan)

import os as _os

# CORS: allow localhost dev origins + any extra origins from CORS_ORIGINS env var.
# On Railway the frontend is same-origin (SPA served by FastAPI), so the
# wildcard fallback is only reached by direct API calls from external clients.
_cors_origins = [
    "http://localhost:3001",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:4173",
    "http://localhost:8000",
]
_extra = _os.environ.get("CORS_ORIGINS", "")
if _extra:
    _cors_origins.extend(o.strip() for o in _extra.split(",") if o.strip())

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"https://.*\.railway\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_lakeb2b.router, prefix="/api")
app.include_router(canvas.router, prefix="/api")
app.include_router(registry.router, prefix="/api")
app.include_router(tools.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(workflows.router, prefix="/api")
app.include_router(credentials.router, prefix="/api")
app.include_router(webhooks.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(uploads.router, prefix="/api")

# ChampMail inline (under /api/champmail/*)
app.include_router(cm_prospects.router, prefix="/api")
app.include_router(cm_senders.router, prefix="/api")
app.include_router(cm_templates.router, prefix="/api")
app.include_router(cm_sequences.router, prefix="/api")
app.include_router(cm_enrollments.router, prefix="/api")
app.include_router(cm_sends.router, prefix="/api")
app.include_router(cm_webhooks.router, prefix="/api")
app.include_router(cm_unsubscribe.router, prefix="/api")
app.include_router(cm_analytics.router, prefix="/api")
app.include_router(cm_credentials.router, prefix="/api")

app.include_router(events_ws.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# SPA static-file serving with gzip + aggressive caching
# ---------------------------------------------------------------------------
#
# Strategy:
#   • index.html           → no-store (un-hashed filename, must always be fresh)
#   • /assets/*.js|css     → immutable, 1-year max-age (Vite hashes filenames)
#   • /assets/fonts        → immutable, 1-year max-age
#
# Compression:
#   We gzip assets on first request, cache the result in-process, and
#   serve the cached bytes for every subsequent request — zero re-compression
#   CPU cost, and the response is ready in microseconds from RAM instead of
#   reading 1.3 MB off disk each time.
# ---------------------------------------------------------------------------

_WEB_DIST = Path(os.environ.get("WEB_DIST_DIR", "/app/web"))

_NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, must-revalidate",
    "Pragma": "no-cache",
}

# Hashed asset files are content-addressed — safe to cache forever.
_IMMUTABLE_CACHE = "public, max-age=31536000, immutable"

# In-process cache: path -> (content_type, gzipped_bytes)
_gzip_cache: dict[str, tuple[str, bytes]] = {}

_COMPRESSIBLE = {".js", ".css", ".svg", ".json", ".html", ".txt", ".map"}
_CONTENT_TYPES: dict[str, str] = {
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".zip": "application/zip",
}


def _content_type(path: Path) -> str:
    return _CONTENT_TYPES.get(path.suffix, "application/octet-stream")


def _gzip_asset(path: Path) -> tuple[str, bytes]:
    """Read, compress (level 6), cache, and return (content_type, gz_bytes)."""
    key = str(path)
    if key in _gzip_cache:
        return _gzip_cache[key]
    raw = path.read_bytes()
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=6) as gz:
        gz.write(raw)
    ct = _content_type(path)
    result = (ct, buf.getvalue())
    _gzip_cache[key] = result
    return result


def _asset_response(path: Path, request: Request, cache_header: str) -> Response:
    accepts_gzip = "gzip" in request.headers.get("accept-encoding", "")
    if accepts_gzip and path.suffix in _COMPRESSIBLE:
        ct, gz_bytes = _gzip_asset(path)
        return Response(
            content=gz_bytes,
            media_type=ct,
            headers={
                "Content-Encoding": "gzip",
                "Cache-Control": cache_header,
                "Vary": "Accept-Encoding",
                # ETag from file mtime — allows 304 on re-validate
                "ETag": f'"{int(path.stat().st_mtime)}"',
            },
        )
    # Fallback: uncompressed FileResponse (browser doesn't accept gzip)
    return FileResponse(str(path), headers={"Cache-Control": cache_header})


def _spa_shell() -> FileResponse:
    return FileResponse(str(_WEB_DIST / "index.html"), headers=_NO_CACHE_HEADERS)


if _WEB_DIST.exists() and (_WEB_DIST / "index.html").exists():
    # Warm the gzip cache for the JS and CSS bundles at startup so the first
    # real browser request is also fast.
    _assets_dir = _WEB_DIST / "assets"
    if _assets_dir.exists():
        for _asset in _assets_dir.iterdir():
            if _asset.suffix in _COMPRESSIBLE and _asset.is_file():
                try:
                    _gzip_asset(_asset)
                except Exception:
                    pass

        @app.get("/assets/{asset_path:path}", include_in_schema=False)
        async def serve_asset(asset_path: str, request: Request) -> Response:
            candidate = _assets_dir / asset_path
            if not candidate.is_file() or not candidate.resolve().is_relative_to(_assets_dir.resolve()):
                return _spa_shell()
            return _asset_response(candidate, request, _IMMUTABLE_CACHE)

    @app.get("/", include_in_schema=False)
    async def spa_root() -> FileResponse:
        return _spa_shell()

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_catch_all(full_path: str, request: Request) -> Response:
        if full_path.startswith(("api/", "ws/")) or full_path in {"health", "favicon.ico"}:
            return _spa_shell()
        candidate = _WEB_DIST / full_path
        if candidate.is_file():
            cache = _IMMUTABLE_CACHE if candidate.suffix in {".js", ".css", ".woff2", ".woff"} else "no-store"
            return _asset_response(candidate, request, cache)
        return _spa_shell()
