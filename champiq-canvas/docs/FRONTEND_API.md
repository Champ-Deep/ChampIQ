# ChampIQ Canvas — Frontend API Reference

**Audience:** frontend engineer building / extending the canvas, panels, and chat UI.
**Source of truth:** generated from the live FastAPI app's OpenAPI spec at `/openapi.json` plus the route handlers under `apps/api/champiq_api/routers/`. If you need a single one-shot snapshot, hit `GET /openapi.json` from the running server.

> Last verified against commit `36cd5d6` (74 HTTP routes + 1 WebSocket).

---

## Table of contents

1. [Conventions](#conventions)
2. [Auth & sessions](#auth--sessions)
3. [Real-time events (WebSocket)](#real-time-events-websocket)
4. [Canvas state](#canvas-state)
5. [Workflows](#workflows)
6. [Executions & node runs](#executions--node-runs)
7. [Chat-to-canvas](#chat-to-canvas)
8. [File uploads](#file-uploads)
9. [Tools (manifests, populate, run, status)](#tools-manifests-populate-run-status)
10. [Webhooks](#webhooks-incoming)
11. [Credentials](#credentials)
12. [Settings](#settings)
13. [Jobs](#jobs)
14. [LakeB2B OAuth flow](#lakeb2b-oauth-flow)
15. [ChampMail (inline domain — full CRUD)](#champmail-inline-domain)
16. [Error model](#error-model)
17. [Health](#health)

---

## Conventions

- **Base URL:** same origin as the SPA. In dev, the Vite proxy forwards `/api/*` and `/ws/*` to `http://localhost:4000`. In prod (Railway / Docker), the FastAPI app serves both the SPA and the API on the same port — no CORS needed for browser calls.
- **Content-Type:** JSON request bodies must be `application/json`. File uploads are `multipart/form-data`.
- **Times:** all timestamps are ISO 8601 with timezone (`2026-05-01T13:11:09.123456+00:00`).
- **IDs:**
  - Workflows / prospects / templates / sequences / etc. → integer.
  - Executions → string `exec_<12hex>` (e.g. `exec_8edd12fe714d`).
  - Node IDs (within a workflow JSON) → arbitrary slug strings the canvas creator picks.
- **Error shape:** every 4xx / 5xx returns `{"detail": "<message>"}` (FastAPI default) — see [Error model](#error-model).
- **Pagination:** list endpoints accept `limit` (default 50, max 200) and `offset` (default 0). Returned shape varies by endpoint — see each.

---

## Auth & sessions

There is **no global auth** on the API today. The frontend assumes same-origin trust. Per-tool authorization happens via **credentials** stored encrypted in Postgres (Fernet) — see [Credentials](#credentials) and [LakeB2B OAuth flow](#lakeb2b-oauth-flow).

The chat endpoint uses an opaque `session_id` string (default `"default"`) to scope conversation history; pick whatever string you want — it is just a partition key.

---

## Real-time events (WebSocket)

### `WS /ws/events`

Subscribe to **every** orchestrator event. The connection is global — you receive events for all running executions. Filter client-side by `execution_id` if needed.

**Message shape:**
```json
{
  "topic": "execution.started" | "execution.finished" | "node.started" | "node.completed" | "node.failed" | "node.progress",
  "execution_id": "exec_8edd12fe714d",
  "ts": "2026-05-01T13:11:09.123456+00:00",
  "...": "<topic-specific payload>"
}
```

**Topics & their additional fields:**

| topic | extra fields |
|---|---|
| `execution.started` | `workflow_id: int`, `trigger_kind: "manual"\|"webhook"\|"cron"\|"event"` |
| `execution.finished` | `status: "success"\|"error"` |
| `node.started` | `node_id: str`, `kind: str` |
| `node.completed` | `node_id: str`, `output: object`, `branches: string[]` |
| `node.failed` | `node_id: str`, `error: str` |

Custom topics can also flow through here — node executors call `ctx.emit(topic, payload)` to publish per-node progress (e.g. `champvoice.transcript`, `champmail.send_progress`). Always wire a `default` clause client-side.

**Reconnect strategy:** the server closes silently if the client disconnects; the frontend should auto-reconnect with exponential backoff. Events emitted while disconnected are lost — do not rely on the WS as a durable log. For history use [`GET /api/executions/{id}/node_runs`](#executions--node-runs).

---

## Canvas state

The canvas is auto-saved as a single document keyed by **a single global row** (no per-user scoping today). Frontend pushes the whole node-and-edge graph; backend returns the same on read.

### `GET /api/canvas/state` → `CanvasStateOut`
```json
{ "nodes": [...], "edges": [...], "updated_at": "..." }
```

### `POST /api/canvas/state` ← `CanvasStateIn` → `CanvasStateOut`
```json
{ "nodes": [...], "edges": [...] }
```
Both arrays are stored verbatim as JSON; the backend does no schema validation on individual nodes. Whatever the canvas saves, it gets back.

---

## Workflows

A **workflow** is a saved-and-named graph that can be activated, scheduled (cron), or triggered by webhook/event. It is distinct from the live canvas state above — call `POST /api/workflows` to promote the current canvas into a runnable, named workflow.

### `GET /api/workflows` → `WorkflowOut[]`
List all workflows. Includes ad-hoc throwaways from previous canvas "Run All" clicks (their names start with `ad-hoc-`).

### `POST /api/workflows` ← `WorkflowIn` → `WorkflowOut`
Create a new workflow.
```json
{
  "name": "UC3-Daily-Outreach",
  "description": "...",
  "active": true,
  "nodes": [...],
  "edges": [...],
  "triggers": []
}
```

### `GET /api/workflows/{workflow_id}` → `WorkflowOut`

### `PUT /api/workflows/{workflow_id}` ← `WorkflowIn` → `WorkflowOut`
Full update — pass the whole document.

### `DELETE /api/workflows/{workflow_id}` → `204`

### `POST /api/workflows/{workflow_id}/run` ← `WorkflowRunIn` → `{ "execution_id": str, "accepted": true }`
Kick off an execution of a saved workflow.
```json
{ "trigger": { "items": [{...}, {...}] } }   // optional override of trigger payload
```

### `POST /api/workflows/ad-hoc/run` ← `AdHocRunIn` → `{ "execution_id": str, "accepted": true }`
Run a graph **without saving it as a named workflow**. Use this for the canvas "Run All" button — the backend persists the graph under a throwaway name (`ad-hoc-<6hex>`) so node-runs and history still work.
```json
{
  "nodes": [...],
  "edges": [...],
  "trigger": { "items": [...] }    // optional
}
```

### `GET /api/workflows/{workflow_id}/executions` → `ExecutionOut[]`
List recent executions of a workflow, newest first.

---

## Executions & node runs

### `GET /api/executions/{execution_id}` → `ExecutionOut`
```json
{
  "id": "exec_8edd12fe714d",
  "workflow_id": 42,
  "status": "running" | "success" | "error",
  "trigger_kind": "manual",
  "trigger_payload": { ... },
  "result": { "<node_id>": <output>, ... } | null,
  "error": null,
  "started_at": "...",
  "finished_at": "..." | null
}
```

### `GET /api/executions/{execution_id}/node_runs` → `NodeRunOut[]`
Per-node detail for an execution. Use this to populate the inspector's "last run" tab and the bottom-log.
```json
[
  {
    "id": 12345,
    "execution_id": "exec_...",
    "node_id": "champmail-send-email",
    "node_kind": "champmail",
    "status": "success" | "error" | "running",
    "input":  { ... },
    "output": { ... },
    "error":  null | "string",
    "retries": 0,
    "started_at": "...",
    "finished_at": "..."
  }
]
```

For a fan-out node (loop body), one `NodeRunOut` represents the whole fan-out; `output.items` carries the per-item results.

---

## Chat-to-canvas

The chat panel sends a NL message + the current workflow JSON; the backend asks an LLM (OpenRouter, model configurable via env) to return a **patch** describing canvas mutations.

### `GET /api/chat/history?session_id={id}` → `ChatMessageOut[]`
Returns full conversation, oldest-first. `session_id` defaults to `"default"`.

### `POST /api/chat/message` ← `ChatMessageIn` → `ChatMessageOut`

**Request:**
```json
{
  "session_id": "default",
  "content": "build a workflow that calls every prospect with phone in CSV",
  "current_workflow": { "nodes": [...], "edges": [...] }   // optional, but strongly recommended
}
```

**Response (`ChatMessageOut`):**
```json
{
  "id": 17,
  "session_id": "default",
  "role": "assistant",
  "content": "<raw LLM text — usually a JSON string>",
  "workflow_patch": {
    "explanation": "I added a champvoice node downstream of the loop...",
    "patch": {
      "add_nodes":      [ <full node objects> ],
      "add_edges":      [ <full edge objects> ],
      "update_nodes":   [ { "id": "...", "data": { ... } } ],
      "remove_node_ids":[ "old-node-id" ]
    }
  },
  "created_at": "..."
}
```

**Frontend responsibilities:**

1. **Apply the patch incrementally** to the canvas store — do NOT rebuild from scratch. The reference helper is `apps/web/src/lib/applyPatch.ts`.
2. **Persist the user message before showing the assistant reply.** The backend already does this server-side, but the optimistic UI should also reflect it.
3. **Pass `current_workflow`** on every send. Without it the LLM has to guess the canvas state from history.
4. **Patch may be `null`.** A pure Q&A turn (no canvas change) returns `workflow_patch.patch.{add_nodes, add_edges, update_nodes, remove_node_ids}` as four empty arrays — render the `explanation` and do nothing to the canvas.
5. **Validate before applying.** The LLM occasionally produces malformed JSON. Wrap `applyPatch` in a try/catch; if it throws, show a "couldn't apply" toast and surface the raw `content` for the user.

---

## File uploads

### `POST /api/uploads/prospects` ← `multipart/form-data` (field `file`) → `{ records, count, columns }`

Parses a CSV or `.xlsx` file and returns rows as a JSON array ready to be dropped into a `csv.upload` node's `config.items` field.

**Constraints:**
- Max 10 MB.
- Max 10,000 rows.
- Supported types: `.csv`, `.xlsx`, `.xls`. Falls back to CSV parsing if the content type is `text/*`.
- UTF-8 with optional BOM.
- Trailing blank rows are skipped automatically.
- Cells past the header width are silently dropped.

**Response:**
```json
{
  "records": [
    { "<col1>": "...", "<col2>": "...", ... },
    ...
  ],
  "count": 137,
  "columns": ["col1", "col2", ...]
}
```

**Errors:**
- `413` — file too large.
- `422` — empty file, unsupported type, or `openpyxl` missing on server.

**Frontend pattern:**
```ts
const fd = new FormData()
fd.append('file', file)   // <input type="file"> contents
const r = await fetch('/api/uploads/prospects', { method: 'POST', body: fd })
const { records, columns } = await r.json()
// → write `records` into the csv.upload node's config.items
```

---

## Tools (manifests, populate, run, status)

### `GET /api/registry/manifests` → `ChampIQManifest[]`
Returns the static tool manifests (`manifests/*.manifest.json`) embedded in the server image. The frontend uses these for the LeftSidebar tool palette and the inspector schema.

### `GET /api/tools/{tool}/{resource}` → `unknown[]`
Populate dropdowns inside tool node configs. The `{resource}` is a key declared in the manifest's `populate` map (e.g. `sequences`, `templates`, `agents`).

Example:
```
GET /api/tools/champmail/sequences
→ [{ "id": 1, "name": "..." }, ...]
```

### `GET /api/tools/{tool}/status` → `{ "ok": boolean, "reason"?: string }`
Health check for a single tool integration. Used to drive the green/red dot next to each tool in the LeftSidebar.

### `POST /api/tools/{tool}/{action}` ← `{ inputs: {...}, credential?: string }` → `unknown`
One-shot tool invocation **outside** the workflow runtime. Lets a panel UI (e.g. "Send test email" button in CredentialsPanel) call a tool directly without building a graph.

```ts
await fetch('/api/tools/champmail/send_single_email', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    inputs:    { email: 'a@b.com', subject: 'Hi', body: '<p>Test</p>' },
    credential:'champmail-admin'
  })
})
```

The response shape mirrors what the same `(tool, action)` would emit inside a workflow node — see `apps/api/champiq_api/routers/chat.py` SYSTEM_PROMPT "INPUTS CHEAT SHEET" for the canonical input schema per `(tool, action)`.

---

## Webhooks (incoming)

These are **inbound** — external systems POST here. The frontend doesn't usually call them, but you may need to display the URL to the user.

### `POST /api/webhooks/wf/{workflow_id}/{trigger_id}`
Triggers a workflow that has a `trigger.webhook` node with the matching trigger_id. The full request body becomes `trigger.payload` for the run.

### `POST /api/webhooks/tools/{tool_id}`
Per-tool webhook (e.g. Emelia delivery callbacks routed to `tool_id=champmail`). The driver's `parse_webhook` decides what to emit on the event bus.

### `POST /api/champmail/webhooks/emelia`
Emelia-specific delivery/open/click/reply callback. Validates HMAC against `EMELIA_WEBHOOK_SECRET`.

---

## Credentials

Credentials are encrypted at rest with a Fernet key (`FERNET_KEY` env). The plaintext `data` blob is never returned in list responses — only by the tool driver server-side.

### `GET /api/credentials` → `CredentialOut[]`
```json
[{ "id": 1, "name": "champmail-admin", "type": "champmail", "created_at": "...", "updated_at": "..." }]
```

### `POST /api/credentials` ← `CredentialIn` → `CredentialOut`
```json
{
  "name": "champmail-admin",
  "type": "champmail" | "champgraph" | "champvoice" | "lakeb2b" | "http" | "generic",
  "data": { "<type-specific-fields>": "..." }
}
```

**Per-type required `data` fields** (mirrored in the frontend's `CREDENTIAL_TYPE_FIELDS` map):

| type | required fields |
|---|---|
| `champmail` | `api_key` (Emelia API key) |
| `champgraph` | `api_key` (Graphiti X-API-Key) |
| `champvoice` | `elevenlabs_api_key`, `agent_id`, `phone_number_id` |
| `lakeb2b` | `access_token`, `refresh_token` (and optionally `li_at` for LinkedIn cookie session) |
| `http` | `token` or `api_key` |
| `generic` | `value` |

### `PUT /api/credentials/{cred_id}` ← `CredentialIn` → `CredentialOut`

### `DELETE /api/credentials/{cred_id}` → `204`

### `POST /api/champmail/credentials/test` ← `{ "api_key": "..." }` → `CredentialTestOut`
Validates an Emelia API key without saving it. Returns the discovered Emelia account email and the list of available sender providers.
```json
{
  "valid": true,
  "account_email": "user@example.com",
  "account_uid": "...",
  "providers": [{ "id": "...", "email": "...", "name": "..." }]
}
```

---

## Settings

Single-row global app settings. Used to pick the default email engine (Emelia vs SMTP fallback) and the default credential to use when a node leaves it blank.

### `GET /api/settings` → `AppSettingsOut`
```json
{
  "default_engine_provider": "emelia",
  "default_email_credential_id": 1,
  "updated_at": "..."
}
```

### `PUT /api/settings` ← `AppSettingsIn` → `AppSettingsOut`

---

## Jobs

Long-running tool actions (e.g. `champgraph.research_prospects` over 100 prospects) return a **job ID** instead of a result. Poll `/api/jobs/{job_id}` until it transitions to `succeeded` / `failed`.

### `GET /api/jobs/{job_id}` → `{ id, status, progress, result, error, ... }`

The frontend already has a `useJobPolling` hook in `apps/web/src/hooks/useJobPolling.ts` — reuse it.

---

## LakeB2B OAuth flow

Multi-step credential creation that pops a window and reads a token off it via `postMessage`. Triggered from `CredentialsPanel.LakeB2BLoginFlow`.

| step | endpoint | purpose |
|---|---|---|
| 1 | `GET /api/auth/lakeb2b/oauth-url` | Returns the URL to open in a popup. |
| 2 | (popup → LakeB2B → redirect) | LakeB2B redirects to `GET /api/auth/lakeb2b/callback?token=…&refresh_token=…&name=…&li_at=…`. The server saves the credential row and returns HTML that `postMessage`s the token back to the opener. |
| 3 | `POST /api/auth/lakeb2b/linkedin-cookie` `{ credential_id, li_at }` | Save LinkedIn `li_at` cookie alongside the credential so the backend can call session-cookies. |
| 4 (optional, alt path) | `POST /api/auth/lakeb2b/linkedin-login-start` `{ credential_id, email, password }` → `POST /api/auth/lakeb2b/linkedin-login-verify` `{ credential_id, session_id, code }` | Email-and-password login fallback when the extension isn't available. Returns a session_id; user enters 2FA code; verify completes the login. |
| 5 | `POST /api/auth/lakeb2b/pair` | Issue a pairing token for the Chrome extension. |
| 6 | `GET /api/auth/lakeb2b/ws-token/{credential_id}` | Frontend exchanges credential_id for a short-lived WS token used by the LinkedIn-tracking websocket. |
| 7 | `GET /api/auth/lakeb2b/status/{credential_id}` | Check whether the credential's `li_at` is still valid. |

Reference impl: `apps/web/src/components/layout/CredentialsPanel.tsx` `LakeB2BLoginFlow` component.

---

## ChampMail (inline domain)

The ChampMail subsystem lives **inline** in this API (it used to be a separate service; absorbed in 2026-04-29). All routes are prefixed `/api/champmail/`.

### Prospects

| method | path | request | response |
|---|---|---|---|
| `GET`   | `/api/champmail/prospects?limit&offset&status&search` | — | `ProspectOut[]` |
| `POST`  | `/api/champmail/prospects` | `ProspectIn` | `ProspectOut` |
| `GET`   | `/api/champmail/prospects/{id}` | — | `ProspectOut` |
| `PATCH` | `/api/champmail/prospects/{id}` | `ProspectUpdate` | `ProspectOut` |
| `DELETE`| `/api/champmail/prospects/{id}` | — | `204` |
| `GET`   | `/api/champmail/prospects/by-email/{email}` | — | `ProspectOut` |

`ProspectIn`:
```json
{
  "email": "alice@example.com",       // required
  "first_name": "Alice",
  "last_name": "Smith",
  "company": "...",
  "title": "...",
  "phone": "...",
  "linkedin_url": "...",
  "timezone": "UTC",
  "custom_fields": { "...": "..." }
}
```

### Senders

| method | path |
|---|---|
| `GET`/`POST` | `/api/champmail/senders` |
| `GET`/`PATCH`/`DELETE` | `/api/champmail/senders/{id}` |

`SenderIn`:
```json
{
  "name": "Alice Outreach",
  "from_email": "alice@your-domain.com",
  "from_name": "Alice",
  "emelia_sender_id": "<from Emelia dashboard>",
  "credential_id": 1,
  "daily_cap": 50,
  "enabled": true
}
```

### Templates

| method | path |
|---|---|
| `GET`/`POST` | `/api/champmail/templates` |
| `GET`/`PATCH`/`DELETE` | `/api/champmail/templates/{id}` |
| `POST` | `/api/champmail/templates/preview` |

`TemplatePreviewIn`:
```json
{ "template_id": 4, "variables": { "first_name": "Alice", "company": "Acme" } }
```
→ `{ subject: "Hi Alice ...", body_html: "...", body_text: null }`

Use this in the template editor to render the rendered version live as the user types Jinja variables.

### Sequences

| method | path |
|---|---|
| `GET`/`POST` | `/api/champmail/sequences` |
| `GET`/`PATCH`/`DELETE` | `/api/champmail/sequences/{id}` |
| `POST`   | `/api/champmail/sequences/{id}/steps` |
| `DELETE` | `/api/champmail/sequences/steps/{step_id}` |

A sequence step adds: `template_id`, `delay_days`, `delay_hours`, optional `condition` expression. Steps are ordered by `step_index`.

### Enrollments (running a prospect through a sequence)

| method | path |
|---|---|
| `POST` | `/api/champmail/enrollments` `{ prospect_id, sequence_id }` |
| `GET`  | `/api/champmail/enrollments/{id}` |
| `POST` | `/api/champmail/enrollments/{id}/pause` |
| `POST` | `/api/champmail/enrollments/{id}/resume` |
| `POST` | `/api/champmail/enrollments/{id}/complete` |

### Sends

| method | path |
|---|---|
| `POST` | `/api/champmail/sends` `SingleSendIn` — fire-and-track a single email via a saved template |
| `GET`  | `/api/champmail/sends/{send_id}` |
| `GET`  | `/api/champmail/sends/by-prospect/{prospect_id}` |

`SingleSendIn`:
```json
{
  "prospect_id": 1,
  "template_id": 4,
  "sender_id": null,                          // omit to auto-pick
  "variables": { "city": "Bengaluru" }       // extra Jinja vars
}
```

### Analytics

`GET /api/champmail/analytics/sequences/{sequence_id}` → aggregate counts by event type (sent / opened / clicked / replied / bounced) plus per-day timeseries.

### Unsubscribe

`GET /api/champmail/unsubscribe/{token}` → public unsubscribe landing page (HTML). The token is opaque and generated by the backend; never construct it on the frontend.

`GET /api/champmail/unsubscribe/issue/{prospect_id}` → returns a fresh signed token for that prospect (for previews / admin overrides).

---

## Error model

Standard FastAPI errors:

```json
HTTP 4xx / 5xx
{ "detail": "human-readable message" }
```

Validation errors (422) include a structured `detail` array:

```json
HTTP 422
{
  "detail": [
    { "loc": ["body", "email"], "msg": "value is not a valid email address", "type": "value_error.email", "input": "not-an-email" }
  ]
}
```

**Common cases the frontend should handle:**

| status | meaning | UX |
|---|---|---|
| 400 | malformed request / invalid workflow shape | toast + show `detail` |
| 401 | reserved (no global auth today) | n/a |
| 404 | id not found | clear stale UI state, refetch list |
| 409 | conflict (e.g. duplicate name) | inline form error |
| 413 | upload too large | file picker error |
| 422 | Pydantic validation failure | per-field error mapping |
| 502 | upstream LLM / Graphiti / Emelia failure | toast, advise retry |

Tool driver errors are wrapped: a `champmail.send_single_email` failure surfaces as the node-run's `error` field on the WS event and `node_runs` row, **not** as a 4xx on the HTTP run endpoint.

---

## Health

`GET /health` → `{"status":"ok"}` — no auth, instant. Use as your liveness probe.

---

## Generated TypeScript types

The shared package `@champiq/shared-types` (`packages/shared-types/src/`) already exports the canvas-related types (`ChampIQManifest`, `WorkflowPatch`, `ChatMessage`, etc.). For new request/response types, the project regenerates with:

```bash
npx openapi-typescript http://localhost:8000/openapi.json -o packages/shared-types/src/generated/api.ts
```

Re-run after every API change.

---

## Quick reference card

```
canvas:        GET/POST  /api/canvas/state
workflows:     GET/POST  /api/workflows
               GET/PUT/DELETE  /api/workflows/{id}
               POST  /api/workflows/{id}/run | /api/workflows/ad-hoc/run
               GET  /api/workflows/{id}/executions
executions:    GET  /api/executions/{id}
               GET  /api/executions/{id}/node_runs
ws:            WS  /ws/events
chat:          GET/POST  /api/chat/{history,message}
upload:        POST  /api/uploads/prospects   (multipart/form-data)
tools:         GET  /api/registry/manifests
               GET  /api/tools/{tool}/status
               GET  /api/tools/{tool}/{resource}      ← populate dropdowns
               POST /api/tools/{tool}/{action}        ← one-shot invoke
credentials:   GET/POST  /api/credentials
               PUT/DELETE  /api/credentials/{id}
               POST  /api/champmail/credentials/test
settings:      GET/PUT  /api/settings
jobs:          GET  /api/jobs/{id}
lakeb2b:       (see LakeB2B OAuth flow section)
champmail:     /api/champmail/{prospects,senders,templates,sequences,enrollments,sends}/...
webhooks (in): POST  /api/webhooks/wf/{wf_id}/{trigger_id}
               POST  /api/webhooks/tools/{tool_id}
               POST  /api/champmail/webhooks/emelia
health:        GET  /health
```
