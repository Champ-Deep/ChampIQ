# ChampIQ — Product Documentation

> Visual workflow automation for sales teams. Build outbound, prospecting, and reply-handling pipelines on a node canvas; ship them to a server that actually executes them on schedule.

---

## What ChampIQ is

ChampIQ is two things in one repo:

1. **A workflow runtime** — a stateful orchestrator that executes graphs of nodes on a schedule (cron), on demand (manual), or in response to events (webhooks, replies). Each node does one job: send an email, place a call, query a knowledge graph, transform data, branch on a condition.
2. **A visual canvas** — a React-based editor where you drag nodes, wire them together, and configure each one's inputs. The canvas saves to a Postgres-backed workflow store the runtime reads from.

You author workflows visually (or via the chat console — see [CHAT_PROMPT_HANDBOOK.md](CHAT_PROMPT_HANDBOOK.md)), then activate them. From that moment forward the runtime owns execution: cron triggers fire on schedule, webhooks fire on inbound HTTP, event triggers fire on bus topics.

## What it's for (in priority order)

1. **Cold-email outbound at small-team scale** — prospects in CSVs, sent through Emelia (the current transport), tracked back via webhook (sent / opened / clicked / replied / bounced / unsubscribed).
2. **Per-prospect drip sequences** — multi-step email cadences with per-recipient timing (each enrollment has its own clock).
3. **AI-personalized outreach** — pipe prospect data through ChampGraph (Perplexity-backed research) before composing the message, so each email references real signals.
4. **Voice outreach** — initiate calls through ElevenLabs Conversational AI (ChampVoice) for hot leads.
5. **Reply-driven workflows** — when a prospect replies, the canvas can auto-pause the sequence and branch into a hand-off, a thank-you, or a Slack alert.

## What it deliberately is not

- **Not a marketing automation suite.** No landing pages, lead-scoring DAGs, multi-touch attribution, or CDP. Stay focused: outbound + reply handling.
- **Not multi-tenant SaaS yet.** A ChampIQ deployment serves one org's workflows. The data model has a `tenant_id` placeholder for the day this changes; today it's effectively single-tenant.
- **Not a no-code platform for non-engineers.** It's a tool for SDR ops / RevOps engineers who can read JSON, write a cron expression, and reason about graph topology. The chat console makes it friendlier, but you'll still hit a JSON view when something goes wrong.

---

## How it's structured (architecture)

### One container, three subsystems

```
                ┌─────────────────────────────────────────────┐
                │            ChampIQ container                 │
                │                                              │
                │   ┌─────────────────────────────────────┐    │
                │   │  uvicorn (2 workers by default)      │    │
                │   │   ├─ FastAPI app                     │    │
                │   │   │    ├─ /api/workflows  CRUD/run   │    │
                │   │   │    ├─ /api/champmail/*           │    │
                │   │   │    ├─ /api/chat/message  (LLM)   │    │
                │   │   │    ├─ /api/champmail/webhooks/*  │    │
                │   │   │    └─ /api/settings              │    │
                │   │   ├─ APScheduler                     │    │
                │   │   │    ├─ Cron triggers              │    │
                │   │   │    ├─ Cadence job (sequences)    │    │
                │   │   │    └─ Janitor (TTL prune)        │    │
                │   │   └─ Event listener (bus → orchestr) │    │
                │   └─────────────────────────────────────┘    │
                │                                              │
                │   ┌─────────────────────────────────────┐    │
                │   │  Static SPA (Vite build)             │    │
                │   │    served from /  (FastAPI)          │    │
                │   └─────────────────────────────────────┘    │
                └─────────────────────────────────────────────┘
                            │           │
                       Postgres       Redis
                       (state)      (pub/sub +
                                     idempotency)
```

External services the runtime calls into:

- **Emelia** — email transport. ChampIQ sends through Emelia and ingests its webhooks for sent/opened/clicked/replied/bounced/unsubscribed events.
- **Graphiti VPS** (deployed separately) — knowledge graph, prospect research, AI campaign generation. ChampIQ talks to it via the `champgraph` node.
- **ElevenLabs** — voice agent for `champvoice` outbound calls.
- **OpenRouter** — LLM provider for the chat-to-canvas endpoint and any `llm` nodes.

### Repo layout

```
champiq-canvas/
├── apps/
│   ├── api/                          # Python backend (FastAPI + SQLAlchemy)
│   │   ├── alembic/versions/         # Database migrations
│   │   └── champiq_api/
│   │       ├── routers/              # HTTP endpoints
│   │       │   ├── workflows.py      # CRUD + run
│   │       │   ├── chat.py           # LLM workflow generator
│   │       │   ├── credentials.py
│   │       │   ├── settings.py
│   │       │   └── ...
│   │       ├── nodes/                # Built-in node executors
│   │       │   ├── triggers.py       # trigger.manual / .cron / .webhook / .event
│   │       │   ├── flow.py           # loop / wait
│   │       │   ├── control.py        # if / switch / set / merge
│   │       │   ├── http.py / code.py / llm.py / split.py
│   │       │   └── csv_upload.py     # csv.upload data source
│   │       ├── champmail/            # Inline email subsystem
│   │       │   ├── nodes/            # `champmail` canvas executor
│   │       │   ├── routers/          # /api/champmail/*
│   │       │   ├── repositories/     # Per-table data access
│   │       │   ├── services/         # Send / enrollment / webhook ingest
│   │       │   ├── transport/        # Emelia HTTP client
│   │       │   ├── rendering/        # Template engine + unsubscribe tokens
│   │       │   └── scheduling/       # Cadence job (sequences)
│   │       ├── champgraph/           # ChampGraph dispatcher (local + Graphiti)
│   │       ├── drivers/              # ChampVoice (HTTP) + LakeB2B (legacy)
│   │       ├── runtime/              # Orchestrator + event bus + queue
│   │       ├── triggers/             # Cron scheduler + event listener + janitor
│   │       ├── expressions/          # `{{ ... }}` template engine
│   │       ├── credentials/          # Encrypted credential store
│   │       ├── llm/                  # OpenRouter client
│   │       └── core/interfaces.py    # All Protocols (DIP boundary)
│   └── web/                          # React + Vite frontend
│       └── src/
│           ├── components/
│           │   ├── canvas/           # ToolNode, edges, csv.upload inspector
│           │   ├── layout/           # TopBar, RightPanel (config), ChatPanel
│           │   └── settings/         # /settings page
│           ├── store/                # Zustand stores (canvas, view, credentials)
│           └── hooks/                # Persistence, manifests, exec stream
├── manifests/                        # Tool manifests (system, champmail, etc.)
├── docs/                             # ← you are here
├── docker-compose.yml
├── Dockerfile
└── start.sh
```

---

## Domain model (what's in Postgres)

| Table | Purpose | Key columns |
|---|---|---|
| `workflows` | Workflow definitions (nodes, edges, triggers JSONB) | `id`, `name`, `active`, `nodes`, `edges`, `triggers`, `version` |
| `executions` | One row per workflow run (cron tick, manual, webhook) | `id` (`exec_…`), `workflow_id`, `trigger_kind`, `status`, `started_at` |
| `node_runs` | Per-node row per execution | `execution_id`, `node_id`, `status`, `input`, `output`, `error`, `retries` |
| `canvas_state` | Single-row scratchpad for the canvas (unsaved work) | `nodes`, `edges`, `updated_at` |
| `app_settings` | Tenant-level toggles (default email engine + credential) | `default_engine_provider`, `default_email_credential_id` |
| `credentials` | Encrypted external-service credentials | `name`, `type`, `data_encrypted` |
| `chat_messages` | History for the chat-to-canvas endpoint | `session_id`, `role`, `content` |
| `champmail_prospects` | One row per email recipient | `email` (unique), `status`, `last_*_at` timestamps |
| `champmail_senders` | Connected Emelia inboxes (round-robin sending) | `name`, `enabled`, `consecutive_bounces`, `credential_id` |
| `champmail_templates` | Reusable email content | `name`, `subject`, `body_html`, `body_text` |
| `champmail_sequences` | Multi-step cadence definitions | `name`, `working_hours_*`, `enabled`, `steps` (relationship) |
| `champmail_sequence_steps` | One row per step | `sequence_id`, `step_index`, `template_id`, `delay_days/hours`, `condition` |
| `champmail_enrollments` | Prospect ↔ sequence with per-prospect clock | `prospect_id`, `sequence_id`, `status`, `next_step_at`, `current_step_index` |
| `champmail_sends` | Audit row per send attempt | `prospect_id`, `enrollment_id`, `sender_id`, `status`, `emelia_message_id`, `idempotency_key` |
| `champmail_events` | Webhook event audit trail | `prospect_id`, `event_type`, `provider`, `provider_event_id` (deduped via UNIQUE constraint) |

Migrations live in `apps/api/alembic/versions/`. Run `alembic upgrade head` on every deploy (the entrypoint script does this).

---

## The execution model

### A workflow is a graph with one trigger

```
trigger.X  →  data sources  →  control flow  →  tool nodes  →  …
```

**Constraints enforced at save time** (HTTP 400 if violated):

- **Exactly one trigger** per workflow. CSV uploads are *data-source* nodes (`csv.upload`), not triggers.
- Node count ≤ 500, edge count ≤ 1000.

### When a workflow runs

1. The trigger fires (cron tick, manual `POST /api/workflows/{id}/run`, webhook receive, or event-bus topic match).
2. The orchestrator creates a fresh `executions` row with a unique id like `exec_e88ae19a9e12`.
3. It does a topological pass over the graph — runs each node once its inputs are ready.
4. Per node:
   - Build a `NodeContext` with `{config, input, upstream, trigger, execution_id, expressions, credentials, events}`.
   - Render the config recursively — every `{{ … }}` expression is replaced with its evaluated value against the context.
   - Call the node's executor.
   - Persist a `node_runs` row with input/output/error/retries.
5. Branches: if a node returns named branches (e.g. `if` returns `"true"`/`"false"`), only edges whose `sourceHandle` matches a branch are followed.
6. Loops: a `loop` node's output items become a per-item fan-out across downstream nodes — one downstream `node_run` row per item.

### Expression engine

`{{ expr }}` strings inside any config are resolved at runtime against this name table:

| Name | Bound to |
|---|---|
| `prev` | The output of the immediately upstream node |
| `node` | A dict `{node_id: output}` for all upstream nodes |
| `trigger` | The trigger's output (cron passes `{trigger_id}`; webhooks pass the request body) |
| `execution_id` | The current execution's id (fresh per run) |
| `item` | Inside a loop body: the current item |
| `index` | Inside a loop body: the 0-based item index |

The engine is `simpleeval` — sandboxed Python, no imports, no `eval()`. Allowed: arithmetic, comparisons, comprehensions, dict/list literals, ternaries, and a few helper functions (`len`, `default`, `lower`, `upper`, `strip`, `get`).

**Two important rules** — both have caused user-facing bugs:

1. Expressions reference `trigger.payload.X`, not `trigger.X`. The orchestrator wraps each trigger's output under `payload`.
2. The `if` node's `condition` is a *raw* expression — do not wrap in `{{ … }}` (the executor wraps it for you).

---

## Node catalog

### Triggers

| Kind | What it does |
|---|---|
| `trigger.manual` | Fired when a user clicks Run All or POSTs to `/api/workflows/{id}/run`. May carry inline `items`. |
| `trigger.cron` | Fires on a cron schedule. Requires the workflow to be `active`. |
| `trigger.webhook` | Fires when an external system POSTs to `/api/webhooks/wf/{workflow_id}/{trigger_id}`. |
| `trigger.event` | Fires when the runtime's event bus sees a topic this trigger subscribed to (e.g. `email.replied`). |

### Data sources / transforms

| Kind | What it does |
|---|---|
| `csv.upload` | Self-contained CSV — rows are baked into the node config at upload time. Output: `{ items, count, filename }`. |
| `set` | Emit a computed object. All field values are rendered. |
| `merge` | Join multiple upstream outputs. |
| `code` | Sandboxed Python expression. `prev`, `node`, `trigger` are dot-accessible. |

### Control flow

| Kind | Branches |
|---|---|
| `if` | `"true"` / `"false"` based on a raw expression |
| `switch` | Custom branches based on case-match on a value expression |
| `loop` | Single output, but downstream nodes fan out per item. Modes: `parallel` / `sequential` / `paced`. |
| `split` | N branches (`branch_0`, `branch_1`, …); `mode: fixed_n` distributes items, `fan_out` duplicates |
| `wait` | Sleep N seconds (cap 1h) |

### IO / external

| Kind | What it does |
|---|---|
| `http` | Generic REST call. Optional credential injects `Authorization: Bearer …` or `X-API-Key`. |
| `llm` | Single LLM completion via OpenRouter. Supports `json_mode` (raises on parse fail). |

### Tools

| Kind | Subsystem | Verbs |
|---|---|---|
| `champmail` | Inline email | `add_prospect`, `get_prospect`, `list_prospects`, `list_templates`, `get_template`, `create_template`, `preview_template`, `list_sequences`, `create_sequence`, `add_sequence_step`, `enroll_sequence` (alias `start_sequence`), `pause_sequence`, `resume_sequence`, `send_single_email`, `get_analytics` |
| `champmail.reply_classifier` | Reply triage | LLM-classified `positive`/`negative`/`neutral` branches; auto-pauses on positive. |
| `champgraph` | Knowledge graph dispatcher | Local: `create_prospect`, `list_prospects`, `get_prospect_status`, `bulk_import`, `enrich_prospect`. Remote (Graphiti): `research_prospects`, `campaign_essence`, `campaign_segment`, `campaign_pitch`, `campaign_personalize`, `campaign_html`, `campaign_preview`, `account_briefing`, `account_contacts`, `account_topics`, `account_communications`, `account_personal_details`, `account_team_contacts`, `account_graph`, `account_timeline`, `account_relationships`, `account_email_context`, `intelligence_salesperson_overlap`, `intelligence_stakeholder_map`, `intelligence_engagement_gaps`, `intelligence_cross_branch`, `intelligence_opportunities`, `ingest_episode`, `ingest_batch`, `hook_email`, `hook_email_batch`, `hook_call`, `query`, `sync_account`, `sync_status` |
| `champvoice` | Voice (ElevenLabs) | `initiate_call`, `get_call_status`, `list_calls` |
| `lakeb2b_pulse` | Legacy B2B data lookup | (in maintenance — not actively developed) |

---

## Settings & credentials

The `/settings` page (full-page route, button next to "Run All") hosts:

- **Email Engine switcher** — Emelia or ChampMail-native (the latter is a placeholder for future native SMTP). Default credential pickable when multiple Emelia keys exist.
- **Credentials** — same `<CredentialsPanel />` component as the canvas right rail, surfaced here too. Two views, one source of truth.

ChampVoice credentials still live on the canvas right rail (no plan to move them — they're per-node, not per-tenant).

### Credential types

Stored encrypted via Fernet (`fernet_key` env var). Recognized types:

- `champmail` — `api_key` (Emelia), optional `default_sender_id`
- `champgraph` — `email`, `password` (legacy; current ChampGraph uses env vars)
- `champvoice` — `elevenlabs_api_key`, `agent_id`, `phone_number_id`, optional `canvas_webhook_secret`
- `lakeb2b` — auto-managed by the LakeB2B login flow
- `http` — `token` (Bearer) or `api_key` (X-API-Key) + optional `header_name`
- `generic` — single `value` field

---

## Runtime guarantees

### Idempotency

- **Webhook events**: deduped on `(provider, provider_event_id, event_type)` via a UNIQUE constraint. Emelia's 24-hour 5xx retries can't cause double bus fires.
- **Run endpoints**: optional `Idempotency-Key` header on `/api/workflows/ad-hoc/run` and `/api/workflows/{id}/run`. Replays within 10 min return the same execution_id with `idempotent_replay: true`. Backed by Redis when available, in-memory fallback.

### After-commit publishing

When a webhook updates the DB, the bus publish runs **after the transaction commits** — never before. A flaky bus can't make the canvas see events the DB doesn't believe in.

### Retention

- `executions` older than `EXECUTION_RETENTION_DAYS` (default 30) get pruned by the janitor. `node_runs` cascade.
- `champmail_templates` named `_oneoff_*` (created by inline-subject `send_single_email` calls) older than `CHAMPMAIL_ONEOFF_RETENTION_DAYS` (default 7) are pruned.
- Multi-worker safety: a Postgres advisory lock ensures only one worker actually sweeps per tick.

### Reply detection

ChampIQ does **not** poll IMAP. Emelia detects replies on its side and POSTs to `/api/champmail/webhooks/emelia` with an HMAC signature. Empty `EMELIA_WEBHOOK_SECRET` disables signature checks (dev-only). Reply events:

- Mark prospect status `replied` and `last_replied_at`.
- Pause every active enrollment for that prospect.
- Publish `email.replied` on the canvas event bus, where `trigger.event { event: "email.replied" }` workflows can pick it up.

---

## Deployment

The whole stack is one Docker image (`Dockerfile`) plus Postgres and Redis services (`docker-compose.yml`). Railway-ready; the entrypoint script:

1. Waits for Postgres TCP.
2. Runs `alembic upgrade head`.
3. Boots `uvicorn` with `${UVICORN_WORKERS:-2}` workers.

Environment variables it reads (the important ones):

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (asyncpg or psycopg URL — both are auto-rewritten) |
| `REDIS_URL` | Pub/sub bus + idempotency cache |
| `FERNET_KEY` | Credential encryption |
| `EMELIA_API_KEY`, `EMELIA_DEFAULT_SENDER_IDS`, `EMELIA_WEBHOOK_SECRET`, `EMELIA_DEFAULT_FROM_*` | ChampMail bootstrap (also configurable per-credential row) |
| `CHAMPMAIL_UNSUBSCRIBE_SECRET` | Signs unsubscribe tokens |
| `PUBLIC_BASE_URL` | Used in unsubscribe URLs |
| `CHAMPGRAPH_URL`, `CHAMPGRAPH_API_KEY` | Graphiti VPS endpoint |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, … | Chat console + `llm` nodes |
| `EXECUTION_RETENTION_DAYS`, `CHAMPMAIL_ONEOFF_RETENTION_DAYS`, `JANITOR_RUN_INTERVAL_HOURS` | Janitor knobs |
| `UVICORN_WORKERS` | Process count |

---

## Where to go next

- **First-time user?** Read [HANDBOOK.md](HANDBOOK.md). It walks from "install" to "first working workflow" to "advanced patterns".
- **Building workflows via the chat console?** [CHAT_PROMPT_HANDBOOK.md](CHAT_PROMPT_HANDBOOK.md) has 30 production-ready prompts.
- **API reference?** Hit `/docs` (Swagger) or `/redoc` on the live deployment — auto-generated from the FastAPI route definitions.
- **Architectural decisions?** [ChampIQ_Canvas_Schema_ADR.md](ChampIQ_Canvas_Schema_ADR.md) covers the canvas schema; deeper ADRs live in commit messages.
