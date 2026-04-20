#!/bin/sh
# Runs on container start. Waits for Postgres, applies migrations, then execs
# the main command (uvicorn). Keep this minimal — anything more belongs in
# Python lifespan startup.
set -eu

cd /app/apps/api

if [ -n "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] waiting for database..."
  # Derive host+port from DATABASE_URL for a simple TCP check.
  python - <<'PY'
import os, socket, time, urllib.parse as up
raw = os.environ["DATABASE_URL"]
# Strip driver prefix so urlparse handles host/port cleanly.
if "+" in raw.split("://", 1)[0]:
    scheme, rest = raw.split("://", 1)
    base = scheme.split("+", 1)[0]
    raw = f"{base}://{rest}"
u = up.urlparse(raw)
host = u.hostname or "localhost"
port = u.port or 5432
deadline = time.time() + 60
while time.time() < deadline:
    try:
        with socket.create_connection((host, port), timeout=2):
            print(f"[entrypoint] db {host}:{port} is up")
            break
    except OSError:
        time.sleep(1)
else:
    raise SystemExit(f"[entrypoint] db {host}:{port} never became reachable")
PY

  echo "[entrypoint] running alembic migrations..."
  alembic upgrade head || {
    echo "[entrypoint] alembic upgrade failed — refusing to start" >&2
    exit 1
  }
fi

echo "[entrypoint] starting: $*"
exec "$@"
