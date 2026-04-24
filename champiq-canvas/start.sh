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
echo "[start] starting uvicorn on port ${PORT}"
exec uvicorn champiq_api.main:app \
  --host 0.0.0.0 \
  --port "${PORT}" \
  --workers 1 \
  --loop uvloop \
  --http httptools
