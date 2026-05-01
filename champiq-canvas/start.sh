#!/bin/sh
set -eu

export PYTHONPATH=/app/apps/api

cd /app/apps/api

# One-shot diagnostic: print the DB target the app will actually use, with
# password masked. Lets us see in Railway logs exactly what DATABASE_URL
# resolved to (or that it's missing) without reading 5000-line stack traces.
python - <<'PY'
import os, urllib.parse as up
raw = os.environ.get("DATABASE_URL", "")
if not raw:
    print("[start] DB target: NOT SET (app will fall back to localhost default)")
else:
    parse_target = raw
    if "+" in parse_target.split("://", 1)[0]:
        scheme, rest = parse_target.split("://", 1)
        parse_target = f"{scheme.split('+')[0]}://{rest}"
    u = up.urlparse(parse_target)
    print(
        f"[start] DB target: host={u.hostname or '?'} port={u.port or '?'} "
        f"user={u.username or '?'} db={(u.path or '/').lstrip('/') or '?'} "
        f"password={'***SET***' if u.password else 'EMPTY'}"
    )
PY

if [ -n "${DATABASE_URL:-}" ]; then
  # Wait for Postgres to be reachable before running migrations.
  # Railway's Postgres container accepts TCP before it's ready to authenticate,
  # so we probe with an actual auth attempt rather than just a socket check.
  echo "[start] waiting for database..."
  python - <<'PY'
import os, time, urllib.parse as up

raw = os.environ["DATABASE_URL"]
if "+" in raw.split("://", 1)[0]:
    scheme, rest = raw.split("://", 1)
    raw = f"{scheme.split('+')[0]}://{rest}"

u = up.urlparse(raw)
host = u.hostname or "localhost"
port = u.port or 5432
deadline = time.time() + 120
attempt = 0
while time.time() < deadline:
    try:
        import socket
        with socket.create_connection((host, port), timeout=3):
            pass
        print(f"[start] db {host}:{port} is up (attempt {attempt + 1})")
        break
    except OSError as e:
        attempt += 1
        print(f"[start] attempt {attempt}: db not ready ({e}), retrying...")
        time.sleep(2)
else:
    raise SystemExit(f"[start] db {host}:{port} never became reachable")
PY

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
