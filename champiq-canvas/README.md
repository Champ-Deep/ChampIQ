# ChampIQ Canvas

Visual drag-and-drop orchestration canvas for ChampGraph, Champmail, and ChampVoice.

## Local Development

### Prerequisites

- Node.js 20+, pnpm 9+
- Python 3.12, uv
- Postgres (local or Railway)

### Setup

```bash
pnpm install
cd apps/api && uv sync
```

### Environment Variables

Copy `apps/api/.env.example` to `apps/api/.env`:

```
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/champiq
```

### Run Migrations

```bash
cd apps/api && uv run alembic upgrade head
```

### Start Dev Servers

```bash
pnpm dev
```

- Frontend: http://localhost:5173
- API: http://localhost:8000

## Railway Deployment

1. Install Railway CLI: `npm install -g @railway/cli`
2. `railway login`
3. `railway link` to your project
4. `railway up` from the repo root with build context set to monorepo root

Set `DATABASE_URL` via Railway dashboard under the api service variables.

## TODO(Hemang): Swap Real CLI Binaries

1. Install champgraph, champmail, champvoice CLI binaries on the server.
2. In `apps/api/champiq_api/cli_shim.py`, update `SCRIPTS_DIR` to point to the real binaries or add `shutil.which(tool_id)` lookup.
3. Remove or keep `apps/api/scripts/fake_cli/` as fallback.
4. Update `STUB_POPULATE` data in `apps/api/champiq_api/routers/tools.py` to call real tool APIs.
5. Update manifest endpoint URLs from stub paths to real production API paths.
