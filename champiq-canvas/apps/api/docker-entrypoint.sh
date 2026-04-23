#!/bin/sh
# Container entrypoint:
#   1. Wait for Postgres to accept TCP connections (up to 90s)
#   2. Run alembic migrations
#   3. exec the main process (uvicorn)
#
# Designed for Railway: DATABASE_URL and PORT are injected as env vars.
# If DATABASE_URL is absent the migration step is skipped (local dev without db).
set -eu

cd /app/apps/api

# ── Wait for Postgres ────────────────────────────────────────────────────────
if [ -n "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] waiting for database..."
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
deadline = time.time() + 90
while time.time() < deadline:
    try:
        with socket.create_connection((host, port), timeout=2):
            print(f"[entrypoint] db {host}:{port} is up")
            break
    except OSError:
        time.sleep(2)
else:
    raise SystemExit(f"[entrypoint] db {host}:{port} never became reachable (90s timeout)")
PY

  echo "[entrypoint] running alembic migrations..."
  alembic upgrade head || {
    echo "[entrypoint] alembic upgrade failed — refusing to start" >&2
    exit 1
  }
  echo "[entrypoint] migrations OK"
fi

# ── Start the app ─────────────────────────────────────────────────────────────
# Railway passes PORT as an env var. We honour it here so the process binds
# on whatever port Railway has assigned.
PORT="${PORT:-8000}"
echo "[entrypoint] starting on port ${PORT}: $*"

# If CMD is the default shell form (starts with "sh -c …") exec it directly so
# $PORT is expanded. Otherwise exec the array form as-is.
exec "$@"
