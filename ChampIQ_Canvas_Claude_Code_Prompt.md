# ChampIQ Canvas — Claude Code Build Prompt

> Copy everything below the separator into a fresh Claude Code session inside the `champiq-canvas` repo. Paste, run, review. This prompt assumes you have `ChampIQ_Canvas_Frontend_PRD.md` and `ChampIQ_Canvas_Schema_ADR.md` available in the session context (upload them or put them in the repo).

---

## PROMPT TO PASTE INTO CLAUDE CODE

You are building **ChampIQ Canvas**, a visual drag-and-drop orchestration layer for an AI SDR platform. Think n8n, but purpose-built for three tools: ChampGraph (knowledge graph), Champmail (email outreach), and ChampVoice (voice qualification).

### Your Deliverables

Build a production-ready Phase 1 MVP. Spec is in `ChampIQ_Canvas_Frontend_PRD.md` (frontend PRD) and `ChampIQ_Canvas_Schema_ADR.md` (tool manifest schema). Treat both as authoritative. If anything is ambiguous, stop and ask me one batched round of questions (max 4) using your best judgment for confidence gating. Do not proceed below 80% confidence.

### Stack (non-negotiable, per the PRD)

- **Frontend:** React 18 + Vite + TypeScript + `@xyflow/react` v12+ + shadcn/ui + Zustand + Tailwind CSS
- **Backend:** FastAPI (Python 3.12), async. Shells out to tool CLIs and proxies REST calls.
- **Database:** Postgres (Railway managed). NOT Supabase. NOT SQLite.
- **Form rendering:** `@rjsf/core` v5 against JSON Schema manifests
- **Validation:** Ajv on the frontend, `jsonschema` (Python) on the backend
- **Deployment:** Railway. Single monorepo, two services (web, api), one Postgres plugin.

### Repo Layout

```
champiq-canvas/
├── apps/
│   ├── web/          # React + Vite frontend
│   └── api/          # FastAPI backend
├── packages/
│   └── shared-types/ # TypeScript types generated from JSON Schema manifests
├── manifests/        # tool.manifest.json per tool (stubbed for Phase 1)
│   ├── champgraph.manifest.json
│   ├── champmail.manifest.json
│   └── champvoice.manifest.json
├── docs/
│   ├── ChampIQ_Canvas_Frontend_PRD.md
│   ├── ChampIQ_Canvas_Schema_ADR.md
│   └── manifest-vocabulary.md
├── railway.json
├── Dockerfile (api)
├── Dockerfile (web)
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

### Build Order (follow strictly)

**Step 1: Scaffold.** Init a pnpm monorepo. Set up `apps/web` with Vite + React 18 + TypeScript + Tailwind + shadcn/ui init. Set up `apps/api` with FastAPI + uv for dependency management. Add Postgres via Railway CLI config. Commit.

**Step 2: Shared types.** Create the three manifest files in `manifests/` as JSON Schema 2020-12 documents following the `x-champiq-*` vocabulary from the ADR. Use placeholder endpoints (e.g., `/api/champgraph/query`) where the real schemas are pending from Hemang. Generate TypeScript types from them using `json-schema-to-typescript` into `packages/shared-types/`. Commit.

**Step 3: Backend skeleton.** FastAPI app with these routes:
- `GET /api/canvas/state` returns `{ nodes, edges, updated_at }` from Postgres
- `POST /api/canvas/state` upserts canvas state to Postgres
- `GET /api/registry/manifests` returns the three manifests from `manifests/`
- `GET /api/{tool}/status` health check (stub: return `{ status: "ok" }`)
- `POST /api/{tool}/{action}` action proxy (stub: logs the call, returns fake `job_id`)
- `GET /api/jobs/{job_id}` job polling (stub: simulate progression idle → running → done over 10 seconds)

Create the `canvas_state` Postgres table via a migration. Use Alembic. Commit.

**Step 4: CLI shim.** In `apps/api/champiq_api/cli_shim.py`, implement a function `invoke_tool_cli(tool_id, action, payload)` that shells out to a CLI binary following the contract in the PRD's "Invocation Architecture" section. For Phase 1, the CLI binaries are stubs: create `scripts/fake_cli/{tool_id}.py` executables that read JSON from stdin, sleep 500ms, and return `{"job_id": "fake-<uuid>", "accepted": true}`. Wire the action proxy to call the shim. Commit.

**Step 5: Canvas frontend shell.** In `apps/web`:
- Set up React Flow with infinite canvas, dot-grid background (dark `#0F1117`), minimap, zoom controls
- Left sidebar with draggable node tiles, one per manifest, color-coded per the PRD
- Top bar: canvas name, Save, Run All (disabled in Phase 1), zoom, tool health dots
- Zustand store for nodes, edges, and per-node runtime state (status dot, output payload)
- Drag-from-sidebar-to-canvas instantiates nodes with manifest-driven config
- Commit.

**Step 6: Manifest-driven nodes.** Build a single `ToolNode` React Flow custom node component that renders itself entirely from the manifest:
- Header with label, icon, color from `x-champiq.canvas.node`
- Status dot (Zustand state: idle, running, success, error)
- Input handle (left), output handle (right)
- Collapsible config form using `@rjsf/core` against the `config` subschema, widget hints from `x-champiq-field`
- Dropdown options populated by calling the endpoint in `x-champiq.transport.rest.populate`
- Primary action button with label from `x-champiq.transport.rest.action.button_label`
- Data preview: last 3 records from the output payload
- Inspector toggle (right panel)
- Commit.

**Step 7: Edges.** Implement edge state colors (grey dashed = waiting, blue animated = active, red = error). Implement edge compatibility: only allow A to B if B's manifest `accepts_input_from` includes A's `tool_id`. Payload flows from source node output into target node input on edge creation. Hover tooltip shows payload summary (`42 prospects`). Commit.

**Step 8: Right panel inspector + bottom log.** Slide-in right panel with full JSON output, copy-to-clipboard. Bottom log shows last 10 events (timestamp, node name, status). Commit.

**Step 9: Async job polling.** When an action returns `async: true` in its manifest, frontend polls `GET /api/jobs/{job_id}` every 5 seconds, updates status dot live. Commit.

**Step 10: Persistence.** Wire auto-save (30s interval + 3s debounce on config change). Manual Save button. Load-on-open restores canvas exactly. Verify round-trip on hard refresh. Commit.

**Step 11: Railway config.** `railway.json` with two services (web, api), Postgres plugin. Dockerfiles for each. Environment variables documented in `README.md`. Verify `railway up` deploys cleanly. Commit.

**Step 12: Smoke tests.** Playwright test that: drags each of the three nodes to the canvas, connects them, clicks Query on ChampGraph, verifies status dot goes idle → running → done, verifies output appears in Champmail's input. Vitest unit tests for the Zustand store and the manifest loader. Commit.

### Acceptance Criteria (all must pass before you say "done")

1. Fresh clone, `pnpm install`, `pnpm dev` brings up both apps, canvas loads.
2. Three nodes are draggable from the sidebar and instantiate on the canvas.
3. Edges connect where compatibility allows, reject where it does not.
4. Clicking a node action button calls the backend, which logs the invocation, returns a fake `job_id`, and the frontend polls to completion.
5. Canvas state persists: close tab, reopen, canvas is identical.
6. Right panel inspector shows full JSON for the selected node.
7. Bottom log shows the last 10 events.
8. Tool health dots in the top bar reflect the `/api/{tool}/status` responses.
9. All three manifests validate against JSON Schema 2020-12 (Ajv passes).
10. `railway up` deploys the app to a live URL.
11. Playwright smoke test passes in CI.

### What NOT to Build (scope discipline)

Do not build: natural language goal input, agent-driven node placement, named flow templates, warm handoff alerts, the WHY THIS panel, multi-user auth, multi-tenant workspaces. These are Phase 2 and Phase 3. Phase 1 MVP is a manual-trigger canvas for one user.

### Stubs Are Okay, But Declare Them

The real CLI binaries and backend schemas from Hemang will land after Phase 1 commit. Anywhere you stub, leave a clear `# TODO(Hemang): replace stub with real ...` comment that lists what shape you expect. This is how we keep the handoff clean.

### When You Are Done

1. Commit everything. Tag `v0.1.0-phase1-mvp`.
2. Produce a summary Markdown at `docs/PHASE_1_COMPLETE.md` that lists:
   - Every file created, with one-line descriptions
   - Every stub, with `# TODO(Hemang)` marker and expected real input
   - Railway deployment URL
   - Known limitations and bugs
   - Step-by-step instructions for Hemang to swap in real CLI binaries and REST schemas
3. Open a PR on the `main` branch titled `Phase 1 MVP: drag-and-drop canvas, manifest-driven nodes, CLI+REST dual mode`.

### Constraints

- Never use em-dashes in code comments, docs, or commit messages. Use periods, commas, or restructure.
- All text on dark backgrounds must be explicitly white or light-grey via Tailwind classes, not inherited.
- Minimum font size 14px in the UI. Minimum contrast 4.5:1 for body text.
- Every interactive element must be keyboard-accessible.
- Code blocks in commits and docs always specify the language.
- Do not use Supabase under any circumstance. Postgres only.
- Do not use SQLite. Postgres only, Railway managed.

### Confidence Check Before You Start

Before writing a single line of code, respond with:
1. Your understanding of the build in three sentences.
2. Any ambiguity you need resolved (batched, max 4 questions).
3. The first three files you will create, with one-line reasons.

Only proceed to Step 1 after I acknowledge.

---

## END OF PROMPT
