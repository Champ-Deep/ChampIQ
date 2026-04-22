# syntax=docker/dockerfile:1.7
#
# Single-container ChampIQ Canvas image.
#   stage 1 (web-builder):  pnpm install + vite build -> /app/apps/web/dist
#   stage 2 (runtime):      python 3.12 + uv + copy dist + run API that also
#                           serves the built SPA.
#
# Everything listens on port 8000. Postgres and Redis are sibling services.

FROM node:20-alpine AS web-builder

WORKDIR /src

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/

RUN pnpm install --frozen-lockfile

COPY apps/web ./apps/web
COPY packages/shared-types ./packages/shared-types
COPY manifests ./manifests

RUN pnpm --filter @champiq/web build:docker

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    WEB_DIST_DIR=/app/web

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir uv

COPY apps/api/pyproject.toml ./apps/api/pyproject.toml
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

COPY apps/api ./apps/api
COPY manifests ./manifests
COPY --from=web-builder /src/apps/web/dist ./web

COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV PYTHONPATH=/app/apps/api

WORKDIR /app/apps/api

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:8000/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["uvicorn", "champiq_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
