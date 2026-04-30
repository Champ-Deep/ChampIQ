#!/bin/sh
set -eu

export PYTHONPATH=/app/apps/api

cd /app/apps/api

if [ -n "${DATABASE_URL:-}" ]; then
  echo "[start] running alembic migrations..."
  alembic upgrade head
  echo "[start] migrations OK"
else
  echo "[start] no DATABASE_URL, skipping migrations"
fi

PORT="${PORT:-8000}"
WORKERS="${UVICORN_WORKERS:-2}"
echo "[start] starting uvicorn on port ${PORT} with ${WORKERS} worker(s)"
# 2 workers fits comfortably in our 200MB cap and keeps the API responsive
# while one worker is parked on a slow LLM/Emelia call. Override with
# UVICORN_WORKERS at deploy time. The event bus is Redis-backed when
# REDIS_URL is set (see runtime/bus.py), so cross-worker pub/sub works.
exec uvicorn champiq_api.main:app \
  --host 0.0.0.0 \
  --port "${PORT}" \
  --workers "${WORKERS}" \
  --loop uvloop \
  --http httptools
