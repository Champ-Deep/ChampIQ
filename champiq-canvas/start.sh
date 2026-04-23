#!/bin/sh
set -eu

PORT="${PORT:-8000}"
echo "[start] starting uvicorn on port ${PORT}"
exec uvicorn champiq_api.main:app \
  --host 0.0.0.0 \
  --port "${PORT}" \
  --workers 1 \
  --loop uvloop \
  --http httptools
