# syntax=docker/dockerfile:1.7
#
# Single-container ChampIQ Canvas image — Railway-ready.
#
#   stage 1 (web-builder):  pnpm install + vite build  →  /src/apps/web/dist
#   stage 2 (runtime):      python 3.12 + uv + copy dist + API that serves the SPA
#
# Railway injects PORT at runtime. The entrypoint reads it and passes it to uvicorn.
# Postgres and Redis are Railway plugin services; their URLs come via env vars.

# ── 1. Build the Vite SPA ────────────────────────────────────────────────────
FROM node:20-alpine AS web-builder

WORKDIR /src

# Enable pnpm via corepack (deterministic version)
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy workspace manifests first so the layer is cached across code changes
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json           ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/

RUN pnpm install --frozen-lockfile

# Copy source (manifests are imported at build time via vite alias)
COPY apps/web            ./apps/web
COPY packages/shared-types ./packages/shared-types
COPY manifests           ./manifests

# build:docker skips the TS type-check pass (saves ~20 s, safe for CI)
RUN pnpm --filter @champiq/web build:docker

# ── 2. Python runtime ─────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    # Where FastAPI looks for the built SPA
    WEB_DIST_DIR=/app/web \
    # Default port — Railway overrides this with its own PORT env var
    PORT=8000

WORKDIR /app

# System deps: curl (healthcheck), ca-certificates, tini (PID 1 signal reaping)
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir uv

# Install Python deps from the explicit list so Docker layer is cached
# independently of application source changes.
RUN uv pip install --system --no-cache \
      "fastapi>=0.135.3" \
      "uvicorn[standard]>=0.44.0" \
      "sqlalchemy[asyncio]>=2.0.49" \
      "asyncpg>=0.31.0" \
      "alembic>=1.18.4" \
      "pydantic>=2.13.0" \
      "pydantic-settings>=2.13.1" \
      "python-dotenv>=1.2.2" \
      "jsonschema>=4.26.0" \
      "cryptography>=43.0.0" \
      "simpleeval>=1.0.0" \
      "httpx>=0.27.0" \
      "redis>=5.0.0" \
      "apscheduler>=3.10.4" \
      "websockets>=13.0" \
      "python-multipart>=0.0.9" \
      "openpyxl>=3.1.0"

# Copy application source
COPY apps/api  ./apps/api
COPY manifests ./manifests

# Copy the pre-built SPA
COPY --from=web-builder /src/apps/web/dist ./web

# Entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Start script (migrations + uvicorn)
COPY start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

ENV PYTHONPATH=/app/apps/api

WORKDIR /app/apps/api

# Railway routes external traffic to $PORT. We expose it as a hint only —
# the actual binding is done in CMD via $PORT so Railway's dynamic port works.
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD curl -fsS http://localhost:${PORT:-8080}/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["/usr/local/bin/start.sh"]
