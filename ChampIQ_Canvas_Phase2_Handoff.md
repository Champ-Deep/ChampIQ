# ChampIQ Canvas — Phase 2 Handoff Document

> **Status:** Scaffold. To be filled in AFTER the Phase 1 MVP is committed, tested, and deployed.
> **Audience:** Harsha (frontend), Hemang (backend), future contributors
> **Last updated:** 2026-04-15 (scaffold only)
> **Will be updated:** Immediately after Sreedeep commits the Phase 1 MVP

---

## How This Document Works

Phase 1 is a manual-trigger canvas. Phase 2 adds agent planning, natural language goal input, and automatic node placement. Phase 3 adds full autonomy, warm handoffs, and the WHY THIS evidence panel.

This document is the bridge. It captures:

1. What Phase 1 actually shipped (vs. what the PRD promised).
2. What stubs exist and what shape the real inputs will take.
3. What Phase 2 adds, in priority order.
4. What schema and architecture decisions need to evolve.
5. Known bugs, deferred polish, and technical debt.

Sreedeep updates sections 1, 2, and 5 after the Phase 1 commit. Sections 3 and 4 are written collaboratively before Phase 2 kickoff.

---

## 1. Phase 1 Ship Report

> Sreedeep fills this in from the Claude Code `PHASE_1_COMPLETE.md` summary after MVP commit.

### What Was Built

| Layer | What Shipped | File Paths | Notes |
|-------|--------------|------------|-------|
| Frontend canvas | | | |
| Manifest-driven nodes | | | |
| Edge compatibility | | | |
| Right panel inspector | | | |
| Bottom log | | | |
| Persistence | | | |
| Tool health dots | | | |
| Async job polling | | | |
| Railway deploy | | | |

### Deployment

- Railway project URL: `_________`
- Production web URL: `_________`
- Production API URL: `_________`
- Postgres connection (secrets ref): `_________`

### Test Coverage

- Playwright smoke test pass rate: `_________`
- Vitest unit test pass rate: `_________`
- Manual acceptance criteria (all 11 from Claude Code prompt): `_________`

### Deviations from the PRD

> Any place the implementation differs from `ChampIQ_Canvas_Frontend_PRD.md`, flag it here with rationale.

- 
- 
- 

---

## 2. Phase 1 Stubs That Need Real Implementations

> Every `TODO(Hemang)` from the Phase 1 codebase is enumerated here. Fill in the real shapes as Hemang delivers them.

### ChampGraph

| Stub | Real Input Needed | Owner | Status |
|------|-------------------|-------|--------|
| CLI binary `champgraph` | Install path, auth mechanism, full arg list | Hemang | Pending |
| `POST /api/champgraph/query` schema | Full JSON Schema for request and response | Hemang | Pending |
| `GET /api/champgraph/status` payload | Real health check response (not just `{ status: "ok" }`) | Hemang | Pending |
| CLI/REST routing rule | Which queries go CLI, which go REST, by payload size | Hemang | Pending |

### Champmail

| Stub | Real Input Needed | Owner | Status |
|------|-------------------|-------|--------|
| CLI binary `champmail` | Install path, auth, send command arg list | Hemang | Pending |
| `POST /api/champmail/send` schema | Full request and response JSON Schema | Hemang | Pending |
| `GET /api/champmail/templates` schema | Real template list shape | Hemang | Pending |
| Async job callback shape | Real `job_id` polling response | Hemang | Pending |

### ChampVoice

| Stub | Real Input Needed | Owner | Status |
|------|-------------------|-------|--------|
| CLI binary `champvoice` | Install path, auth, call command arg list | Hemang | Pending |
| `POST /api/champvoice/call` schema | Full request and response JSON Schema | Hemang | Pending |
| `GET /api/champvoice/scripts` schema | Real script list shape | Hemang | Pending |
| Transcript delivery mechanism | Webhook, polling, or S3 link | Hemang | Pending |

### Job Store

| Stub | Real Input Needed | Owner | Status |
|------|-------------------|-------|--------|
| In-memory dict for job polling | Promote to Postgres table or Redis | Hemang | Pending |

---

## 3. Phase 2 Scope

Phase 2 evolves the canvas from manual to agent-planned. Full architecture is in `Efforts/Active/ChampIQ Canvas PRD.md` (the full-system PRD), sections on the Fast Path Workflow Engine and Smart Path Agent Planner.

### 3a. New Features (Phase 2)

| Feature | Owner | Complexity | Notes |
|---------|-------|------------|-------|
| Natural language goal input (the Goal Input Node goes live) | Harsha + Deep | Medium | Wire the existing Phase 1 shell to an LLM endpoint. |
| Agent decomposition of goals into node placements | Deep + Hemang | High | The BiLSTM-Attention Learned Orchestrator. |
| Named flow templates (Outreach Blitz, Re-engagement, Nurture Sequence) | Deep | Low | Saved canvas state, one-click load. |
| Warm handoff alert node | Harsha | Medium | Triggers when prospect score >= 90. |
| WHY THIS evidence panel | Harsha + Deep | High | Reads from ChampGraph explanations. |
| Multi-user auth | Hemang | Medium | Clerk or Auth0. Decide by Week 1 of Phase 2. |
| Multi-tenant workspaces | Hemang | High | Row-level security in Postgres. |
| Observability (OpenTelemetry spans across CLI and REST) | Hemang | Medium | For debugging agent plans. |

### 3b. Schema Evolution (Phase 2)

Graduate from JSON Schema 2020-12 alone to **OpenAPI 3.1** as the tool manifest format. Per `ChampIQ_Canvas_Schema_ADR.md`, this is additive:

1. Wrap each Phase 1 `tool.manifest.json` inside an OpenAPI 3.1 envelope. The existing schema becomes `components.schemas`.
2. Promote `x-champiq.transport.rest.*` into the OpenAPI `paths` block.
3. Keep all `x-champiq-*` extensions intact. They are legal in OpenAPI via `x-` vendor extensions.
4. Wire Prism (mock servers) and Spectral (linter) into CI.
5. Publish Swagger UI at `/api/docs` for partner integrators.

Graduation triggers (fire if any one is true):
- Tool count reaches six
- External partner needs to publish a tool to our Canvas
- Contract testing across tools becomes a requirement
- Phase 2 agent needs richer transport reasoning

### 3c. Architecture Evolution

| Current (Phase 1) | Target (Phase 2) |
|-------------------|------------------|
| Manual node triggers | Agent plans and triggers automatically, user approves |
| CLI vs REST routed by simple payload size rule | Routed by cost-aware policy (token budget, latency SLO, data sensitivity) |
| Single-user, single-canvas | Multi-user, multi-workspace |
| In-memory job store | Durable job store (Postgres or Redis) |
| JSON Schema manifests | OpenAPI 3.1 manifests with Swagger UI |
| No observability | OpenTelemetry spans end-to-end |
| No cost tracking | Per-node, per-run cost capture (tokens, API calls, minutes) |

---

## 4. Known Bugs and Deferred Polish (Phase 1 exit)

> Populated from the `PHASE_1_COMPLETE.md` "Known Limitations" section plus any issues surfaced during Sreedeep's acceptance testing.

### Bugs

- 
- 

### Deferred Polish

- 
- 

### Technical Debt

- 
- 

---

## 5. Sreedeep's Sign-Off

> Fill in after acceptance testing.

| Acceptance Criterion (from PRD) | Verified | Notes |
|---------------------------------|----------|-------|
| 1. Drag ChampGraph, query, see prospect list | | |
| 2. Connect ChampGraph to Champmail, payload flows | | |
| 3. Click Send, status transitions, result appears | | |
| 4. Call on ChampVoice, bottom log shows events | | |
| 5. Close and reopen, canvas restores | | |
| 6. Node select opens inspector, copy works | | |
| 7. Service down, health dot red, node errors clearly | | |
| 8. End-to-end run through all three tools | | |

**Signed off by:** ___________
**Date:** ___________
**Phase 2 kickoff scheduled:** ___________

---

## 6. Reference Links

- `ChampIQ_Canvas_Frontend_PRD.md` (Phase 1 build spec)
- `ChampIQ_Canvas_Schema_ADR.md` (schema decision + graduation path)
- `ChampIQ_Canvas_Claude_Code_Prompt.md` (the build prompt)
- `Efforts/Active/ChampIQ Canvas PRD.md` (full-system architecture PRD)
- `Efforts/Active/ChampIQ Canvas Risk Register.md` (risk tracking)
- Railway project: `_________`
- GitHub repo: `_________`

---

*Champions Accelerator | Champions Group | April 2026 | CONFIDENTIAL*
