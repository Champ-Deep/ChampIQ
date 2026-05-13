# ChampIQ Canvas — Frontend Build Spec

> **For:** Claude Code / Harsha / Hemang
> **Author:** Sreedeep Surapaneni (Deep)
> **Version:** 1.0 — April 2026
> **Status:** Ready for Dev
> **Priority:** P0 — Blocks ChampIQ Experiment on SPAN

---

## TL;DR

Build a drag-and-drop visual orchestration canvas for the ChampIQ AI SDR platform. Three tools exist as independent CLIs (Champmail, ChampVoice, ChampGraph/Graffiti). This canvas wires them together visually so a user can drag nodes onto a canvas, connect them with edges, and manually trigger each tool in sequence. Think n8n but purpose-built for ChampIQ.

**Stack:** React 18 + Vite + `@xyflow/react` (React Flow v12) + shadcn/ui + Zustand + Tailwind + TypeScript + Supabase (persistence).

**Tool manifest schema:** JSON Schema 2020-12 with a small `x-champiq-*` vocabulary for Canvas metadata. Full specification in `ChampIQ_Canvas_Schema_ADR.md`. Phase 2 graduates to OpenAPI 3.1 as an additive superset. Phase 1 manifests slot directly into `components.schemas` of a Phase 2 OpenAPI document with zero rewrite. See the Handoff Notes section at the bottom of this PRD for the graduation path.

**Start here:** Clone the [React Flow Pro Platform open-source template](https://github.com/xyflow/xyflow) — it ships with a Workflow Editor template that gives you drag-and-drop sidebar, infinite canvas, and shadcn/ui out of the box. Replace their placeholder nodes with the node types below.

---

## Context

ChampIQ is a hub-and-spoke AI SDR platform:

```
USER (SDR)
    |
CHAMPIQ CANVAS  ←— this is what you're building
    |
    ├── CHAMPMAIL   (email outreach agent)
    ├── CHAMPVOICE  (voice qualification agent)
    └── CHAMPGRAPH  (Graffiti knowledge graph — shared state)
```

Tools never talk to each other directly. All data flows through the canvas. ChampGraph (Graffiti) is the only authorized shared state between tools.

### Three-Phase Plan

| Phase | What | Who Uses It |
|-------|------|-------------|
| **Phase 1 (this spec)** | Static canvas, manual node triggers, visual data inspector | Sreedeep + Hemang (testing) |
| Phase 2 | Agent populates canvas from a natural language goal | Internal SDR team |
| Phase 3 | Full autonomous agent loop, warm handoff alerts, WHY THIS panel | External SDR clients |

**This spec covers Phase 1 only.** Architecture decisions must not foreclose Phases 2 and 3.

---

## Stack Decision

### React Flow, not Svelte Flow

Both are from xyflow. React Flow wins for this build:

| Criterion | React Flow | Svelte Flow |
|-----------|------------|-------------|
| Maturity | Production since 2019, 38k+ stars | Launched 2023, smaller community |
| Template | Full Workflow Editor template with shadcn/ui | No equivalent template |
| Team fit | Harsha knows React | Svelte = learning curve = schedule risk |
| n8n parity | n8n runs on React Flow — copy patterns directly | No parity |
| Verdict | **Use this** | Revisit later |

### Full Stack

| Layer | Technology |
|-------|------------|
| Canvas library | `@xyflow/react` v12+ |
| Framework | React 18 + Vite |
| Components | shadcn/ui |
| State | Zustand (xyflow team recommends it) |
| Styling | Tailwind CSS |
| API | Fetch / Axios → FastAPI (Hemang's backend) |
| Persistence | Postgres (managed, Railway) for canvas state. ChampGraph (Graffiti) for any prospect or knowledge data. NO Supabase. |
| Types | TypeScript (required — xyflow is fully typed) |

---

## Canvas Layout

```
┌──────────────────────────────────────────────────────────┐
│ TOP BAR: Canvas name | Save | Run All | Zoom | Mode toggle│
├──────────┬───────────────────────────────────────────────┤
│          │                                               │
│  LEFT    │           CANVAS (React Flow)                 │
│ SIDEBAR  │                                               │
│          │   [ChampGraph] ──→ [Champmail] ──→ [ChampVoice]│
│ [node    │                                               │
│  tiles]  │                                               │
│          ├───────────────────────────────────────────────┤
│          │ BOTTOM LOG: last 10 events across all nodes   │
└──────────┴───────────────────────────────────────────────┘
                                        ↑
                      RIGHT PANEL (contextual, slides in
                      when a node is selected — full JSON
                      inspector + run history)
```

### Layout Regions

| Region | Spec |
|--------|------|
| Top bar | Canvas name, Save button, Run All button, zoom controls, mode toggle (Manual / Agent), tool health indicators (one dot per tool) |
| Left sidebar | Draggable node tiles — one per node type. Drag to canvas to instantiate. |
| Canvas (center) | React Flow canvas. Infinite, pannable, zoomable, dot-grid background. |
| Right panel | Slides in on node select. Full JSON payload, copy-to-clipboard, run history for that node. |
| Bottom log | Last 10 events globally. Format: `[timestamp] [NodeName] [status]` |

---

## Node Types (Phase 1: exactly 4)

Register all node types with React Flow's `nodeTypes` prop.

### Node Anatomy (every node has these elements)

| Element | Spec |
|---------|------|
| Header bar | Tool name + icon. Color-coded by tool (see Design section). |
| Status dot | Top-right corner. Grey = idle, Amber = running, Green = success, Red = error. |
| Input handle | Left side. Accepts edges from upstream nodes. |
| Output handle | Right side. Emits data to downstream nodes. |
| Action button | Primary CTA. "Query" / "Send" / "Call". Triggers the backend API call. |
| Data preview | Collapsible panel. Shows last 3 records from output payload. Collapsed by default. |
| Inspector toggle | Small icon — opens the right panel with full JSON payload. |
| Config fields | Editable inline fields for node parameters. |

---

### Node 1: ChampGraph Node

Maps to the Graffiti knowledge graph.

**Config fields:**
- Industry (text input)
- Role / Title (text input)
- Company size (dropdown: Startup / SMB / Mid-market / Enterprise)
- Min prospect score (slider: 0–100)

**Action:** `Query` button

**API call:**
```
POST /api/champgraph/query
Body: { industry, role, company_size, min_score }
Response: { prospects: [{ id, name, company, role, score, email }] }
```

**Output:** Prospect list JSON passed to connected downstream nodes via edge.

**Error states:** Graph unavailable, 0 results returned, auth failure.

**Color:** Blue (`#1B3A6B` header, `#D5E8F0` body)

---

### Node 2: Champmail Node

Maps to the Champmail email outreach agent.

**Config fields:**
- Subject line (text input)
- Template (dropdown — fetch from `/api/champmail/templates`)
- Daily send limit (number input, default 50)

**Action:** `Send` button

**API call:**
```
POST /api/champmail/send
Body: { prospects: [...], subject, template_id, daily_limit }
Response: { job_id, sent: number, queued: number, failed: number, batch_id }
```

**Input:** Prospect list from ChampGraph edge OR manual paste.

**Output:** Send result (batch_id, counts).

**Error states:** SMTP failure, rate limit hit, empty prospect list.

**Color:** Green (`#1A5C2A` header, `#D6EAD6` body)

---

### Node 3: ChampVoice Node

Maps to the ChampVoice AI voice qualification agent.

**Config fields:**
- Script template (dropdown — fetch from `/api/champvoice/scripts`)
- Call window (time range picker — e.g., 10am–6pm)
- Max calls per run (number input, default 20)

**Action:** `Call` button

**API call:**
```
POST /api/champvoice/call
Body: { prospects: [...], script_id, call_window, max_calls }
Response: { job_id, calls_initiated: number }
```

**Input:** Prospect list from ChampGraph OR opened-email prospects from Champmail.

**Output:** `{ calls_initiated, outcomes: [{ prospect_id, status, transcript_url }] }`

**Error states:** Vapi/ElevenLabs unavailable, empty prospect list, call window blocked.

**Color:** Purple (`#3B1A5C` header, `#E8D5F0` body)

---

### Node 4: Goal Input Node (Phase 2 placeholder — build the shell now)

Build the node shell in Phase 1 so Phase 2 wiring is trivial. In Phase 1 it is disabled/greyed out.

**Config:** Text area for natural language goal (disabled in Phase 1).

**Color:** Orange (`#7A3500` header, `#FFF3CD` body)

---

## Edges

Edges are visual data pipes.

| Rule | Spec |
|------|------|
| Direction | Output handle → Input handle only. |
| State — waiting | Grey dashed line. Upstream node not yet run. |
| State — active | Blue animated line (`#2E75B6`). Data has flowed. |
| State — error | Red line (`#C0392B`). Upstream node errored. |
| Hover tooltip | Payload preview — e.g., "42 prospects" or "batch_id: abc123". |
| Delete | Select edge + Backspace. |
| Data passing | Edge carries the full output payload of the source node to the input of the target node. Zustand stores this. |

---

## Invocation Architecture (CLI + REST Dual Mode)

Every tool (ChampGraph, Champmail, ChampVoice) exposes the same capability two ways: a CLI binary and a REST endpoint. Both must be functional in Phase 1. The browser never calls a CLI directly. The flow is:

```
Browser (React Flow node) 
   ↓  POST /api/{tool}/{action}
FastAPI backend
   ↓  decides: small payload + action command → CLI path
   ↓           large payload or read-heavy → REST path
Tool (CLI binary OR REST endpoint)
   ↓  JSON response
FastAPI backend
   ↓  JSON response (uniform shape regardless of path taken)
Browser
```

### Routing Rule (Phase 1, simple)

| Operation type | Default path | Reason |
|----------------|--------------|--------|
| Action commands (`send`, `call`, `query` with small args) | CLI | ~70% token savings, faster cold start, leaner logs |
| Bulk data reads (prospect lists, templates, transcripts) | REST | Binary stream handling, pagination, JSON-native |
| Status and health checks | REST | Trivial, no CLI overhead needed |
| Long-running jobs (email sends, call batches) | CLI kicks off, REST polls | CLI returns `job_id`, frontend polls `/api/jobs/{job_id}` |

The backend encapsulates the routing decision. Node config in the frontend stays transport-agnostic. This means Phase 2 can retune the routing (e.g., promote more operations to REST for observability) without touching the Canvas code.

### CLI Shim Contract (Hemang owns)

Every tool CLI called by the backend must:

1. Accept structured args via flags (e.g., `--batch-id`, `--template-id`).
2. Accept a JSON payload on stdin when size exceeds args comfort zone.
3. Return a single JSON object to stdout on success.
4. Return a single JSON object with `error` key and non-zero exit code on failure.
5. Emit progress to stderr (parseable, line-delimited JSON) for long-running ops.
6. Support `--dry-run` for testing.
7. Complete in under 5 seconds for action commands, OR return a `job_id` immediately and run async.

A tool without a CLI binary cannot be registered in Phase 1. Period.

---

## API Contracts

All endpoints: FastAPI. All requests/responses: JSON. Auth: Bearer token.

### Canvas State

```
GET  /api/canvas/state
     → { nodes: [], edges: [], updated_at }

POST /api/canvas/state
     Body: { nodes: [], edges: [] }
     → { ok: true }
```

### Tool Triggers

```
POST /api/champgraph/query    → see Node 1 spec
GET  /api/champgraph/status   → { status: "ok" | "degraded" | "down" }

POST /api/champmail/send      → see Node 2 spec
GET  /api/champmail/templates → [{ id, name }]
GET  /api/champmail/status    → { status: "ok" | "degraded" | "down" }

POST /api/champvoice/call     → see Node 3 spec
GET  /api/champvoice/scripts  → [{ id, name }]
GET  /api/champvoice/status   → { status: "ok" | "degraded" | "down" }
```

### Async Job Polling

Long-running ops (email sends, voice calls) return a `job_id`. Poll every 5 seconds:

```
GET /api/jobs/{job_id}
→ { status: "pending" | "running" | "done" | "error", result: {}, progress: 0–100 }
```

Node status dot reflects job status in real time during polling.

> **Hemang action item:** Drop a `champiq-api-spec.json` in the repo root with full request/response schemas for all tool endpoints before Harsha starts Week 2. Harsha should not wire node action buttons until schemas are confirmed.

---

## Canvas Persistence

| Behavior | Spec |
|----------|------|
| Auto-save | Every 30 seconds + debounced 3s after any config change. |
| Manual save | Save button in top bar. Shows "Saved ✓" for 2 seconds. |
| Load on open | On page load, fetch last state from Postgres via the FastAPI backend and restore all node positions, connections, and config values. |
| Postgres schema | Table: `canvas_state`. Columns: `id uuid primary key`, `nodes jsonb not null`, `edges jsonb not null`, `updated_at timestamptz default now()`. Single row per user (Phase 1: single user, single row, upsert). |
| Knowledge data | Any prospect, account, or relationship data lives in ChampGraph (Graffiti). Canvas never persists prospect data locally. |

---

## Phase 1 MVP Scope

### In Scope — Build This

1. React Flow canvas: infinite pan, zoom, minimap, dot-grid background.
2. Left sidebar with draggable tiles for ChampGraph, Champmail, ChampVoice.
3. ChampGraph node: config fields, Query button, API call, status dot, data preview.
4. Champmail node: same pattern. Template selector fetched from API.
5. ChampVoice node: same pattern. Script selector fetched from API.
6. Goal Input node: shell only, disabled/greyed. No functionality in Phase 1.
7. Edges with state colors, hover payload tooltip, Backspace delete.
8. Right panel: full JSON inspector for selected node, copy-to-clipboard.
9. Bottom log: last 10 global events, timestamp + node name + status.
10. Canvas auto-save to Supabase. Load-on-open restore.
11. Top bar: Save, zoom controls, tool health status dots (one per tool).
12. Async job polling for Champmail and ChampVoice with live status dot updates.

### Out of Scope — Do Not Build Yet

- Natural language goal input or agent decomposition of goals.
- Agent auto-populating nodes on the canvas.
- Named flow templates (Outreach Blitz, Re-engagement, etc.).
- Warm handoff alert node.
- WHY THIS evidence panel.
- User authentication / multi-user access.
- Multi-tenant workspaces.

---

## Acceptance Criteria

Phase 1 is done when all of these pass:

| # | Criterion | Who Verifies |
|---|-----------|--------------|
| 1 | Drag ChampGraph node to canvas, fill query fields, click Query, see prospect list in data preview. | Sreedeep |
| 2 | Connect ChampGraph output edge to Champmail input. Champmail node picks up the prospect list. | Sreedeep |
| 3 | Click Send on Champmail. Status dot goes idle → running → done. Send result appears in node. | Sreedeep |
| 4 | Click Call on ChampVoice. Status dot shows running. Bottom log shows call events in real time. | Sreedeep |
| 5 | Close browser, reopen. Canvas restores to exact previous state: node positions, edges, config values. | Hemang |
| 6 | Select any node. Right panel opens with full JSON payload. Copy button copies to clipboard. | Harsha |
| 7 | Take ChampGraph service offline. Health dot in top bar turns red. Node shows error on trigger. | Hemang |
| 8 | End-to-end run: ChampGraph → Champmail → ChampVoice. Prospect list flows through all three. | Sreedeep |

---

## Sprint Plan (3 Weeks)

| Week | Deliverable | Owner | Depends On |
|------|------------|-------|------------|
| 1 | Scaffold repo: React + Vite + xyflow + shadcn/ui. Workflow Editor template running locally. Empty canvas renders. | Harsha | Repo access |
| 1 | FastAPI endpoints: canvas state GET/POST, tool health checks GET. Postgres schema migration. CLI transport shim (backend shells out to tool CLIs, returns JSON). | Hemang | Nothing |
| 2 | `champiq-api-spec.json` in repo root with all tool endpoint schemas. | Hemang | Nothing |
| 2 | ChampGraph node: config fields, Query button, API call, status dot, data preview. Edge from ChampGraph → Champmail. | Harsha | Hemang: champgraph schema |
| 2 | Champmail node: same pattern. Template dropdown live. | Harsha + Hemang | Champmail tool running |
| 2 | Right panel JSON inspector, bottom run log, copy button. | Harsha | Nodes working |
| 3 | ChampVoice node: config fields, Call button, async job polling, live status updates. | Harsha | Hemang: champvoice schema |
| 3 | Canvas auto-save wired to Postgres via FastAPI. Load-on-open restore. Top bar health dots. Railway deploy config (Dockerfile + `railway.json`). | Harsha + Hemang | State endpoints |
| 3 | End-to-end test: all 8 acceptance criteria pass. | Sreedeep | All above |

---

## Design System

### Node Colors

| Tool | Header | Body |
|------|--------|------|
| ChampGraph | `#1B3A6B` | `#D5E8F0` |
| Champmail | `#1A5C2A` | `#D6EAD6` |
| ChampVoice | `#3B1A5C` | `#E8D5F0` |
| Goal Input (Phase 2) | `#7A3500` | `#FFF3CD` |

### Status Colors

| Status | Color | Note |
|--------|-------|------|
| Idle | `#AAAAAA` (grey dot) | Default |
| Running | `#F5A623` (amber dot) | Add CSS pulse animation |
| Success | `#27AE60` (green dot) | |
| Error | `#E74C3C` (red dot) | Add brief shake animation on node |

### Canvas

- Background: dark `#0F1117` with subtle dot grid (React Flow `<Background variant="dots" />`)
- Active edge: `#2E75B6` with flow animation
- Waiting edge: `#888888` dashed
- Error edge: `#C0392B`

### Interaction Rules

- Single click to expand/collapse node config fields. Default: collapsed.
- Double-click a node to open right panel inspector.
- Hover an edge for 0.5s to see payload tooltip.
- Nodes snap to 20px grid on drop from sidebar.
- Error nodes: brief shake animation on state change to error.
- All interactive elements keyboard-accessible (Tab, Enter, Escape).
- Status dots have text labels on hover (not color-only signaling).
- Minimum font size 14px. Minimum contrast ratio 4.5:1 for body text.

---

## Resolved Decisions (Locked 2026-04-15)

| Decision | Resolution |
|----------|------------|
| App shape | **Standalone web app.** Own repo, own deploy, own domain. No embedding in an existing dashboard. |
| Deployment target | **Railway** for the full stack (FastAPI backend + Postgres + frontend). Railway handles monorepo deploys cleanly and is already in the Champions stack. Frontend-only fallback would be Vercel, but we ship as one unit. |
| Persistence | **Postgres on Railway.** Canvas state only. Prospect and knowledge data live in ChampGraph (Graffiti). NOT Supabase. |
| Tool manifest schema | **JSON Schema 2020-12** with `x-champiq-*` extensions. See `ChampIQ_Canvas_Schema_ADR.md`. Phase 2 graduates to OpenAPI 3.1. |
| ChampGraph transport (Phase 1) | **CLI AND REST, both must be functional.** Canvas uses CLI as the primary invocation for action commands (70% token savings). REST is available for bulk payloads and frontend polling. Every ChampGraph capability exposed via REST must also be exposed via CLI. Hemang owns parity. |
| Execution scope | **Node action buttons trigger backend, backend decides CLI vs REST** based on payload size and token budget. Canvas does not invoke CLI directly from the browser. The CLI path runs on the FastAPI backend shell. |

## Open Questions (Owner: Hemang, Resolve Before Harsha's Dependency Week)

| Question | Owner | Blocking | Deadline |
|----------|-------|----------|----------|
| Full request + response schema for `/api/champgraph/query` (JSON Schema) | Hemang | Blocks Harsha Week 2 | End of Week 1 |
| Full request + response schema for `/api/champmail/send` (JSON Schema) | Hemang | Blocks Harsha Week 2 | End of Week 1 |
| Full request + response schema for `/api/champvoice/call` (JSON Schema) | Hemang | Blocks Harsha Week 3 | End of Week 2 |
| ChampGraph CLI binary name, install path, auth mechanism | Hemang | Blocks backend CLI path | End of Week 1 |
| Champmail CLI binary name, install path, auth mechanism | Hemang | Blocks backend CLI path | End of Week 1 |
| ChampVoice CLI binary name, install path, auth mechanism | Hemang | Blocks backend CLI path | End of Week 2 |
| Job store for async polling: Postgres table, Redis, or FastAPI in-memory dict (Phase 1 only) | Hemang | Blocks async polling wire | End of Week 1 |

Hemang deliverable: `champiq-api-spec.json` at the repo root with all of the above filled in. This file is the Harsha contract. Harsha does not wire action buttons until that file is committed.

---

## Reference Links

- [xyflow/xyflow on GitHub](https://github.com/xyflow/xyflow)
- [React Flow docs](https://reactflow.dev/)
- [React Flow Pro Platform (open-source template)](https://xyflow.com/blog/react-flow-pro-platform-open-source)
- [shadcn/ui](https://ui.shadcn.com/)
- [Zustand](https://zustand-demo.pmnd.rs/)
- ChampIQ Canvas full architecture PRD: `Efforts/Active/ChampIQ Canvas PRD.md` (in Celsus vault)
- ChampIQ Canvas Risk Register: `Efforts/Active/ChampIQ Canvas Risk Register.md`

---

## Handoff Notes on Schema Strategy

Read this section before starting Week 1.

**Phase 1 (what you build):** Every tool ships a `tool.manifest.json` that is a JSON Schema 2020-12 document describing its input, config, and output, plus an `x-champiq` metadata block for Canvas UI and transport pointers. Validate with Ajv. Generate config forms with `@rjsf/core`. Generate TypeScript types with `json-schema-to-typescript`. A worked example for Champmail lives in the Schema ADR.

Why JSON Schema alone, not full OpenAPI, for Phase 1: we have three tools. OpenAPI's value compounds with tool count. A hand-authored 100-line JSON Schema is approachable. A hand-authored 400-line OpenAPI file is a learning cliff for a team at this stage. Canvas hardcodes the three action endpoints against the API Contracts section of this PRD.

**Phase 2 (the upgrade path, based on current research):** Graduate to OpenAPI 3.1. It is the first OpenAPI version that fully aligns with JSON Schema 2020-12, so the Phase 1 schemas drop into `components.schemas` unchanged. The `x-champiq.transport.rest.*` block we maintain today maps directly to OpenAPI `paths`. Graduation is additive, not a rewrite.

Why we graduate: Stripe, GitHub, Twilio, and AWS all publish their APIs as OpenAPI. The ecosystem is enormous: Swagger UI, Redoc, Stoplight, Prism (mock servers for frontend dev before backend is ready), `openapi-generator` (client codegen in 50+ languages), Spectral (linting in CI). External partners and auditors expect OpenAPI. LLM tool-use formats (Claude, OpenAI function calling, MCP) all consume OpenAPI's JSON Schema portion natively.

**Graduation trigger (any one fires):** tool count reaches six, we need contract testing and mock servers for parallel frontend and backend development, an external partner needs to publish a tool to our Canvas, or Phase 2 agent planning needs richer transport reasoning (multi-endpoint flows, retries, pagination).

**Read ahead:** JSON Schema 2020-12 spec at https://json-schema.org/draft/2020-12/schema. OpenAPI 3.1 spec at https://spec.openapis.org/oas/v3.1.0. Start with JSON Schema. Once fluent, OpenAPI is a short step.

---

*Champions Accelerator | Champions Group | April 2026 | CONFIDENTIAL*
