# Railway Deployment — Problems & Resolutions

## 1. Entrypoint script not found

**Error**
```
"/apps/api/docker-entrypoint.sh": not found
```

**Cause**
The Dockerfile `COPY` path referenced `apps/api/docker-entrypoint.sh` but Railway's build context is the repo root, so the file wasn't found.

**Fix**
Moved `docker-entrypoint.sh` to the repo root and updated the Dockerfile:
```dockerfile
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
```

---

## 2. Healthcheck timeout

**Error**
```
Attempt #N failed with service unavailable
```

**Cause**
The default healthcheck window (60s) was too short. The DB wait + migrations together exceeded it before uvicorn was ready.

**Fix**
Increased `healthcheckTimeout` in `railway.toml` to 300s and reduced the DB retry interval from 2s to 1s.

---

## 3. `ModuleNotFoundError: No module named 'psycopg2'`

**Error**
```
ModuleNotFoundError: No module named 'psycopg2'
```

**Cause**
Railway injects the `DATABASE_URL` as a plain `postgresql://` URL. SQLAlchemy's `create_async_engine` saw no `+asyncpg` driver prefix and fell back to psycopg2, which is not installed.

**Fix**
Added a URL rewrite helper in `database.py`:
```python
def _asyncpg_url(url: str) -> str:
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+asyncpg://" + url[len(prefix):]
    return url
```
Applied it in `get_engine()` before passing the URL to SQLAlchemy.

---

## 4. Same `psycopg2` error in Alembic migrations

**Error**
```
ModuleNotFoundError: No module named 'psycopg2'
```
(from `alembic/env.py`)

**Cause**
`alembic/env.py` was reading `DATABASE_URL` from the environment and passing it raw to `create_async_engine` — same problem as above but in a different file.

**Fix**
Applied the same `_asyncpg_url()` rewrite inside `alembic/env.py` before constructing the engine:
```python
_database_url = os.environ.get("DATABASE_URL")
if _database_url:
    config.set_main_option("sqlalchemy.url", _asyncpg_url(_database_url))
```

---

## 5. `relation "workflows" does not exist` — migrations never ran

**Error**
```
sqlalchemy.exc.ProgrammingError: relation "workflows" does not exist
```

**Cause**
`startCommand` in `railway.toml` overrides the Dockerfile `ENTRYPOINT` entirely. So `docker-entrypoint.sh` (which ran `alembic upgrade head`) was never called — uvicorn started directly against a blank database.

**Fix**
Removed the reliance on `docker-entrypoint.sh` and embedded migrations into a dedicated `start.sh`:
```sh
alembic upgrade head
exec uvicorn champiq_api.main:app ...
```
The Dockerfile `CMD` now points to `start.sh`.

---

## 6. `startCommand` complex shell string breaking Railway TOML parsing

**Error**
Container silently exited after build — no "Starting Container" log, healthcheck never began.

**Cause**
The `startCommand` in `railway.toml` used nested single quotes inside a double-quoted string. Railway's TOML parser likely mis-handled it, causing a silent failure before the container could start.

**Fix**
Simplified `startCommand` to just the script path:
```toml
startCommand = "/usr/local/bin/start.sh"
```
Then later removed `startCommand` entirely so the Dockerfile `CMD` is used directly.

---

## 7. Pre-deploy command hanging / failing

**Symptom**
Build completed successfully but healthcheck never started. Pre-deploy was set to `/usr/local/bin/start.sh` in the Railway dashboard — which starts uvicorn and never exits, blocking the deploy indefinitely.

**Cause**
`start.sh` was mistakenly set as the pre-deploy command. Pre-deploy expects a finite command that exits 0 on success.

**Fix**
Cleared the pre-deploy command in the Railway dashboard entirely.

---

## 8. Pre-deploy `alembic upgrade head` failing — missing `PYTHONPATH`

**Error**
Pre-deploy command `cd /app/apps/api && alembic upgrade head` failed because `champiq_api` could not be imported.

**Cause**
Pre-deploy runs inside the image but without the `PYTHONPATH=/app/apps/api` env var that is set in the Dockerfile `ENV` instruction — those are runtime env vars, not available during pre-deploy.

**Fix**
Dropped pre-deploy entirely. Moved `alembic upgrade head` back into `start.sh` which runs at container start time when all env vars are available:
```sh
export PYTHONPATH=/app/apps/api
cd /app/apps/api
alembic upgrade head
exec uvicorn champiq_api.main:app ...
```

---

## Final Working Setup

| Component | Value |
|---|---|
| Dockerfile `ENTRYPOINT` | `tini --` |
| Dockerfile `CMD` | `/usr/local/bin/start.sh` |
| `start.sh` | runs `alembic upgrade head` then `uvicorn` |
| Railway Pre-deploy | *empty* |
| Railway Start Command | *empty* (Dockerfile CMD used) |
| `railway.toml` `startCommand` | removed |
| `DATABASE_URL` | set in Railway dashboard (plain `postgresql://` auto-rewritten to `asyncpg`) |

## Required Railway Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Railway Postgres plugin URL |
| `REDIS_URL` | Railway Redis plugin URL |
| `FERNET_KEY` | Encryption key for stored credentials |
| `CHAMPSERVER_EMAIL` | ChampServer login email |
| `CHAMPSERVER_PASSWORD` | ChampServer login password |
| `OPENROUTER_API_KEY` | OpenRouter API key for AI features |
