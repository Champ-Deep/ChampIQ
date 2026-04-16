from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import canvas, registry, tools, jobs

app = FastAPI(title="ChampIQ Canvas API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://localhost:4173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(canvas.router, prefix="/api")
app.include_router(registry.router, prefix="/api")
app.include_router(tools.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
