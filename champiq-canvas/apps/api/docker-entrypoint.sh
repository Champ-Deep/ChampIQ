#!/bin/sh
# Container entrypoint:
#   1. Wait for Postgres to accept TCP connections (up to 120s, 1s retry)
#   2. Run alembic migrations
#   3. exec the main process (uvicorn)
#
# Designed for Railway: DATABASE_URL and PORT are injected as env vars.
# If DATABASE_URL is absent the migration step is skipped (local dev without db).
set -eu

cd /app/apps/api

# ── Wait for Postgres ────────────────────────────────────────────────────────
if [ -n "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] DATABASE_URL detected, waiting for database..."
  python - <<'PY'
import os, socket, time, urllib.parse as up

raw = os.environ["DATABASE_URL"]
# Strip asyncpg/psycopg driver prefix so urlparse handles host/port cleanly.
if "+" in raw.split("://", 1)[0]:
    scheme, rest = raw.split("://", 1)
    base = scheme.split("+", 1)[0]
    raw = f"{base}://{rest}"

u = up.urlparse(raw)
host = u.hostname or "localhost"
port = u.port or 5432
print(f"[entrypoint] connecting to {host}:{port} ...")

deadline = time.time() + 120
attempt = 0
while time.time() < deadline:
    try:
        with socket.create_connection((host, port), timeout=3):
            print(f"[entrypoint] db {host}:{port} is up (attempt {attempt + 1})")
            break
    except OSError as e:
        attempt += 1
        print(f"[entrypoint] attempt {attempt}: db not ready ({e}), retrying in 1s...")
        time.sleep(1)
else:
    raise SystemExit(f"[entrypoint] db {host}:{port} never became reachable (120s timeout)")
PY

  echo "[entrypoint] running alembic migrations..."
  alembic upgrade head || {
    echo "[entrypoint] alembic upgrade failed — refusing to start" >&2
    exit 1
  }
  echo "[entrypoint] migrations OK"
else
  echo "[entrypoint] no DATABASE_URL — skipping db wait and migrations"
fi

# ── Start the app ─────────────────────────────────────────────────────────────
# Railway passes PORT as an env var. We honour it here so the process binds
# on whatever port Railway has assigned.
PORT="${PORT:-8000}"
echo "[entrypoint] starting uvicorn on port ${PORT}"
exec "$@"
