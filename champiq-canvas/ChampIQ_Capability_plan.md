# ChampIQ Canvas — Capability Plan

> **Living document.** Every feature added, changed, or planned is recorded here.
> Update this file whenever a capability is built or modified.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Implemented and working |
| 🔧 | In progress / partial |
| 📋 | Planned but not yet built |
| ❌ | Blocked / known issue |

---

## Core Infrastructure

| Capability | Status | Notes |
|------------|--------|-------|
| React 19 + Vite frontend | ✅ | `apps/web/` |
| FastAPI backend with async SQLAlchemy | ✅ | `apps/api/` |
| PostgreSQL + Redis | ✅ | Via docker-compose |
| pnpm monorepo | ✅ | Shared-types package |
| Single Docker image (frontend + backend) | ✅ | `Dockerfile` — multi-stage build |
| APScheduler for cron execution | ✅ | |
| WebSocket support | ✅ | |

---

## Chat-to-Canvas Auto-Workflow Feature

**The flagship capability: every chat message automatically generates and applies a workflow on the canvas, including full node configs.**

### How It Works

1. User types in the left chat panel (e.g. "Build a bulk email campaign with cadence")
2. Message + current canvas state (all node IDs, kinds, configs) is sent to the LLM
3. LLM returns a JSON patch: `{ add_nodes, add_edges, update_nodes, remove_node_ids }`
4. Frontend applies the patch instantly — nodes appear on canvas with full config pre-filled
5. Right panel auto-opens on the last added node so the user can review/adjust config
6. A badge on the assistant message confirms what changed ("Canvas updated: +4 nodes")

### Implementation Files

| File | Role |
|------|------|
| `apps/api/champiq_api/routers/chat.py` | SYSTEM_PROMPT with full config schemas per node kind; LLM call; patch extraction |
| `apps/web/src/lib/applyPatch.ts` | `applyWorkflowPatch()` — single source of truth for all canvas mutations from LLM |
| `apps/web/src/components/layout/ChatPanel.tsx` | Chat UI; calls API; applies patch; auto-selects last added node |
| `apps/web/src/components/canvas/ToolNode.tsx` | Node rendering; config summary display; kind-specific colors |
| `apps/web/src/components/layout/RightPanel.tsx` | Node inspector; structured config form per kind |
| `apps/web/src/store/canvasStore.ts` | Zustand store; `updateNodeConfig()`; `setSelectedNode()` |

### Node Config Auto-population

The system prompt embeds the **complete config schema** for every node kind so the LLM always generates fully-populated configs. The LLM is instructed to:
- Never return `"config": {}` — always fill all fields
- Use the user's existing workflow JSON to generate `update_nodes` (not re-add existing nodes)
- Position nodes in a left-to-right horizontal chain (x += 280 per step)

### Layout Algorithm

Nodes are placed **linearly left-to-right**:
- First node at x=80, y=300
- Each subsequent node: x += 280 from the rightmost existing node
- Branch paths (if/switch/split) use y offsets specified by the LLM (±150)
- Implemented in `applyPatch.ts` → `linearPosition()`

### Auto-select Behavior

After every AI patch is applied, the **last added node** is auto-selected, opening the RightPanel config form so the user can immediately review and edit its configuration.

### Chat History Replay

On page load, chat history is fetched from the DB and each assistant message re-applies its patch exactly once (tracked by `patchApplied = useRef(false)` per bubble) to reconstruct the canvas state.

### Status: ✅ Implemented (April 2026)

---

## Node Kinds — Full Inventory

| Kind | Group | Config Fields | Status |
|------|-------|--------------|--------|
| `trigger.manual` | trigger | label, items (JSON array) | ✅ |
| `trigger.webhook` | trigger | path, secret | ✅ |
| `trigger.cron` | trigger | cron expression, timezone | ✅ |
| `trigger.event` | trigger | event name, source | ✅ |
| `http` | action | url, method, headers, body, credential | ✅ |
| `set` | transform | fields (key→expression map) | ✅ |
| `merge` | control | mode (all/first) | ✅ |
| `if` | control | condition expression → "true"/"false" handles | ✅ |
| `switch` | control | value expression, cases array, default_branch | ✅ |
| `loop` | control | items expression, concurrency, each transform | ✅ |
| `split` | control | mode (fixed_n/fan_out), n, items expression | ✅ |
| `wait` | control | seconds | ✅ |
| `code` | transform | Python expression | ✅ |
| `llm` | ai | prompt, system, json_mode, model override | ✅ |
| `champmail` | integration | action, credential (required), inputs | ✅ |
| `champmail_reply` | integration | credential | ✅ |
| `champgraph` | integration | action, credential, inputs | ✅ |
| `lakeb2b_pulse` | integration | action, credential, inputs | ✅ |

---

## CSV / Excel File Upload

| Capability | Status | Notes |
|------------|--------|-------|
| Upload CSV/Excel from chat panel | ✅ | Paperclip icon → `/api/uploads/prospects` |
| Parse and return records + columns | ✅ | `apps/api/champiq_api/routers/uploads.py` |
| Auto-inject into Manual Trigger node | ✅ | Patches existing trigger or creates new one |
| Upload banner showing count + columns | ✅ | Dismissable banner in chat panel |

---

## Credential Manager

| Capability | Status | Notes |
|------------|--------|-------|
| Add credentials (name, type, values) | ✅ | Key icon in chat header |
| Encrypted storage (Fernet) | ✅ | `credentials` DB table |
| ChampMail admin email + password | ✅ | Type "champmail" |
| HTTP bearer token | ✅ | Type "http_bearer" |
| Delete credential | ✅ | |
| AI auto-prompts for credential if missing | ✅ | In system prompt |

---

## Node Configuration Forms (RightPanel)

| Capability | Status | Notes |
|------------|--------|-------|
| Structured form per node kind | ✅ | `RightPanel.tsx` KIND_FIELDS map |
| Real-time canvas update on change | ✅ | `updateNodeConfig()` called on every field change |
| Field types: text, textarea, number, select, JSON | ✅ | |
| Runtime status display (idle/running/success/error) | ✅ | |
| Raw JSON config view (collapsible) | ✅ | |
| Runtime output preview | ✅ | |
| Auto-open on newly added node | ✅ | After AI patch applied |

---

## Canvas Execution

| Capability | Status | Notes |
|------------|--------|-------|
| Run All button (top bar) | ✅ | Executes workflow from trigger |
| Per-node status indicators (colored dot) | ✅ | idle/running/success/error |
| Job polling via APScheduler | ✅ | `useJobPolling` hook |
| Execution log (bottom panel, last 10) | ✅ | `BottomLog` component |
| Node runtime output inspection | ✅ | RightPanel output section |

---

## ChampMail Integration

| Capability | Status | Notes |
|------------|--------|-------|
| add_prospect | ✅ | |
| start_sequence | ✅ | |
| pause_sequence | ✅ | |
| send_single_email | ✅ | |
| get_analytics | ✅ | |
| list_templates | ✅ | |
| enroll_sequence | ✅ | |
| Reply classification (champmail_reply) | ✅ | Positive/negative/neutral branches |
| Credential gate enforcement | ✅ | AI always asks for creds before champmail nodes |
| ChampMail SMTP sending (external) | ❌ | SMTP auth failing for test@accountsonline.biz (wrong password). TurboSMTP creds invalid. Network blocks 587. Needs correct mail account credentials. |

---

## ChampGraph Integration

| Capability | Status | Notes |
|------------|--------|-------|
| ingest_prospect | ✅ | |
| ingest_company | ✅ | |
| semantic_search | ✅ | |
| nl_query | ✅ | |
| add_relationship | ✅ | |

---

## LakeB2B Pulse Integration

| Capability | Status | Notes |
|------------|--------|-------|
| track_page | ✅ | |
| schedule_engagement | ✅ | |
| list_posts | ✅ | |
| get_engagement_status | ✅ | |

---

## Split Node (A/B Testing & Parallel Channels)

| Capability | Status | Notes |
|------------|--------|-------|
| Split node executor | ✅ | `apps/api/champiq_api/nodes/split.py` |
| fixed_n mode (distribute evenly) | ✅ | |
| fan_out mode (full list to each branch) | ✅ | |
| N dynamic output handles on canvas | ✅ | Rendered in `ToolNode.tsx` |
| Registered in container + manifest | ✅ | |

---

## Multi-Canvas Support

| Capability | Status | Notes |
|------------|--------|-------|
| Multiple named canvases | ✅ | `canvasList` in store |
| Switch between canvases | ✅ | |
| Persist canvas to DB | ✅ | |

---

## Use Case Coverage (ChampIQ_Use_Cases.md)

| UC | Name | Status |
|----|------|--------|
| UC-1 | Cold outreach sequence from CSV | ✅ |
| UC-2 | Reply-triggered sequence pause | ✅ |
| UC-3 | Daily prospecting from ChampGraph | ✅ |
| UC-4 | A/B subject line test | ✅ (Split node) |
| UC-5 | Webhook-triggered enrichment + sequence | ✅ |
| UC-6 | LinkedIn engagement parallel with email | ✅ |
| UC-7 | LLM-personalized cold email | ✅ |
| UC-8 | Scheduled re-engagement after wait | ✅ |
| UC-9 | Parallel channels (Split + Merge) | ✅ |
| UC-10 | Event-driven knowledge graph enrichment | ✅ |

---

## Known Issues / Blockers

| Issue | Severity | Detail |
|-------|----------|--------|
| ChampMail SMTP sending blocked | High | test@accountsonline.biz password wrong (Champ@123456 rejected). TurboSMTP API key invalid. Correct credentials needed from the mail server admin. |
| TurboSMTP credentials invalid | High | `768b7b5c38904f7381b0` / `fTcbZNk6Jym0I2OYzHRp` returns "invalid username/password combination" on all ports |
| mail.privatemail.com unreachable | Medium | Network unreachable from this server (charlie.evans@infobase360.com IMAP) |

---

## Planned / Future Capabilities

| Capability | Priority | Notes |
|------------|----------|-------|
| Streaming LLM responses (SSE) | High | Show partial text as LLM types instead of waiting |
| Patch preview modal | Medium | Show what will change before applying; user confirms |
| Undo/redo for canvas mutations | Medium | History stack in Zustand |
| Template library | Medium | Pre-built workflow templates selectable from chat |
| Canvas auto-fit after patch | Low | Zoom to show newly added nodes |
| Multi-user / team canvases | Low | Per-user sessions, shared team canvases |
| Workflow version history | Low | Git-style snapshots per save |
| Export workflow as JSON/YAML | Low | Download for import into other tools |
| ChampMail bulk send via correct SMTP | Blocked | Needs valid SMTP credentials |

---

*Last updated: 2026-04-22*
