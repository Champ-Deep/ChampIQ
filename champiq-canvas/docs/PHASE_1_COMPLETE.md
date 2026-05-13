# Phase 1 Complete

Phase 1 MVP of ChampIQ Canvas. Drag-and-drop orchestration canvas for ChampGraph, Champmail, and ChampVoice.

## Files Created

### Monorepo Root
- `pnpm-workspace.yaml` - Workspace definition linking apps/* and packages/*
- `package.json` - Root package with dev/build/test scripts
- `.gitignore` - Ignores node_modules, .env, __pycache__, .DS_Store
- `railway.json` - Railway deployment config with api and web services
- `README.md` - Local dev and Railway deploy instructions with Hemang handoff guide

### Manifests
- `manifests/champgraph.manifest.json` - JSON Schema 2020-12 manifest for ChampGraph (source node, blue)
- `manifests/champmail.manifest.json` - JSON Schema 2020-12 manifest for Champmail (accepts from champgraph, green)
- `manifests/champvoice.manifest.json` - JSON Schema 2020-12 manifest for ChampVoice (accepts from champgraph, purple)

### Shared Types
- `packages/shared-types/src/index.ts` - TypeScript interfaces for ChampIQManifest, NodeStatus, NodeRuntimeState, LogEntry, CanvasState

### Frontend (apps/web/src/)
- `App.tsx` - Root component wrapping ReactFlowProvider and all layout panels
- `main.tsx` - React 18 entry point
- `index.css` - Dark canvas theme with Tailwind directives
- `types/index.ts` - Re-exports from @champiq/shared-types
- `lib/api.ts` - Typed fetch wrapper for all backend endpoints
- `lib/manifest.ts` - Manifest accessor utilities and edge compatibility check
- `store/canvasStore.ts` - Zustand store with subscribeWithSelector for nodes, edges, runtime state, logs
- `hooks/useManifests.ts` - Fetches manifests and polls tool health on mount
- `hooks/usePersistence.ts` - Load on mount, 30s auto-save interval, 3s debounced save on node changes
- `hooks/useJobPolling.ts` - Polls /api/jobs/:jobId every 5s, propagates output to downstream nodes
- `components/canvas/CanvasArea.tsx` - ReactFlow canvas with dot-grid background, drag-drop handling, edge validation
- `components/canvas/ToolNode.tsx` - Manifest-driven node with RJSF config form, status dot, action button, output preview
- `components/canvas/CustomEdge.tsx` - Bezier edge with state colors (waiting/active/error) and prospect count badge
- `components/layout/TopBar.tsx` - Canvas name, health dots, zoom controls, save button
- `components/layout/LeftSidebar.tsx` - Draggable tool palette tiles built from loaded manifests
- `components/layout/RightPanel.tsx` - JSON inspector slide-in panel with copy-to-clipboard
- `components/layout/BottomLog.tsx` - Last 10 events with timestamp, node name, status, message columns

### Backend (apps/api/champiq_api/)
- `main.py` - FastAPI app with CORS and router mounts
- `database.py` - Async SQLAlchemy engine and session factory with pydantic-settings config
- `models.py` - CanvasStateTable SQLAlchemy model and Pydantic schemas
- `jobs.py` - In-memory job store with simulate_job_progression (10-second idle to done)
- `cli_shim.py` - invoke_tool_cli() that shells out to CLI binaries via subprocess
- `routers/canvas.py` - GET/POST /api/canvas/state with Postgres upsert
- `routers/registry.py` - GET /api/registry/manifests with multi-path manifest resolver
- `routers/tools.py` - GET /{tool}/status, GET /{tool}/{resource} (populate), POST /{tool}/{action}
- `routers/jobs.py` - GET /api/jobs/{job_id}

### Backend Stubs and Migrations
- `alembic/versions/0001_canvas_state.py` - Creates canvas_state table with JSONB nodes/edges columns
- `scripts/fake_cli/champgraph.py` - Fake CLI stub for champgraph
- `scripts/fake_cli/champmail.py` - Fake CLI stub for champmail
- `scripts/fake_cli/champvoice.py` - Fake CLI stub for champvoice

### Infrastructure
- `apps/api/Dockerfile` - Python 3.12-slim, installs via uv, copies manifests from monorepo root context
- `apps/web/Dockerfile` - Multi-stage: node builder then nginx serving the built SPA
- `apps/web/nginx.conf` - SPA fallback routing and /api reverse proxy to api:8000

### Tests
- `apps/web/tests/store.test.ts` - 5 Vitest unit tests for Zustand store
- `apps/web/tests/manifest.test.ts` - 9 Vitest unit tests for manifest utilities and structure
- `apps/web/tests/e2e/canvas.spec.ts` - 4 Playwright smoke tests for drag, connect, topbar
- `apps/web/playwright.config.ts` - Playwright config with Chromium and dev server integration

### Docs
- `docs/ChampIQ_Canvas_Frontend_PRD.md` - Frontend spec (copied from parent dir)
- `docs/ChampIQ_Canvas_Schema_ADR.md` - Schema ADR (copied from parent dir)
- `docs/manifest-vocabulary.md` - x-champiq vendor extension reference
- `docs/PHASE_1_COMPLETE.md` - This file

## TODO(Hemang) Stubs

All stubs are marked with `# TODO(Hemang): ...` comments in the code.

1. **`apps/api/scripts/fake_cli/champgraph.py`** - Replace with real champgraph CLI binary. Expected input: JSON with `industry`, `role`, `company_size`. Expected output: `{"job_id": "<real-id>", "accepted": true}`.

2. **`apps/api/scripts/fake_cli/champmail.py`** - Replace with real champmail CLI binary. Expected input: JSON with `prospects[]`, `subject`, `template_id`, `daily_limit`. Expected output: `{"job_id": "<real-id>", "accepted": true}`.

3. **`apps/api/scripts/fake_cli/champvoice.py`** - Replace with real champvoice CLI binary. Expected input: JSON with `prospects[]`, `script_id`, `call_window`, `max_calls`. Expected output: `{"job_id": "<real-id>", "accepted": true}`.

4. **`apps/api/champiq_api/cli_shim.py`** - Update `SCRIPTS_DIR` or add `shutil.which(tool_id)` to find real binary paths.

5. **`apps/api/champiq_api/routers/tools.py` (`STUB_POPULATE`)** - Replace stub dropdown data with real API calls to each tool backend.

6. **`apps/api/champiq_api/jobs.py` (job_store)** - Replace in-memory dict with persistent Postgres or Redis job store for Phase 2.

7. **Manifest endpoints** - Update `x-champiq.transport.rest.action.endpoint` in all three manifests once real tool API endpoints are known.

## Railway Deployment URL

To be filled after first deployment: `https://<your-project>.railway.app`

## Known Limitations and Bugs

- Postgres is required for canvas state persistence. The API will return empty state without a database connection.
- Job polling is in-memory only. Restarting the API server loses all in-progress job states.
- No authentication. Phase 1 is single-user, no auth layer.
- The "Run All" button in the top bar is disabled. This is intentional for Phase 1.
- Goal Input Node is not implemented (Phase 2 scope).
- RJSF form renders with default styling which may look different on various screen sizes.
- Playwright e2e tests require both the frontend dev server and the API server to be running.

## Step-by-Step Instructions for Hemang to Swap Real CLI Binaries

1. Install the real champgraph, champmail, and champvoice CLI tools on the server.

2. In `apps/api/champiq_api/cli_shim.py`, change `SCRIPTS_DIR` to the real binary directory or update `invoke_tool_cli()` to use `shutil.which(tool_id)` for PATH-based lookup.

3. Delete or archive `apps/api/scripts/fake_cli/` once the real binaries are confirmed working.

4. Update `STUB_POPULATE` in `apps/api/champiq_api/routers/tools.py` with real API calls to fetch industries, roles, templates, and scripts.

5. Update the three manifest files in `manifests/` to replace placeholder endpoints with real API paths.

6. Run `uv run alembic upgrade head` against the Railway Postgres instance to apply the canvas_state migration.

7. Set `DATABASE_URL` in Railway environment variables for the api service.

8. Run `railway up` from the monorepo root.
