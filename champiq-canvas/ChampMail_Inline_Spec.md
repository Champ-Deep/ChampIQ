# ChampMail Inline Module — Build Spec

> **Status:** Backend v1 complete (2026-04-29). Phase 6 (frontend panels) and final hardening pending.
> **Goal:** Absorb ChampMail's full sending/sequencing functionality into ChampIQ as a SOLID-designed internal module, replacing the external VPS-hosted ChampMail. Email transport via Emelia (https://emelia.io).

---

## Why this exists

The VPS-based ChampMail (`http://10.10.21.19:8000`) is unreachable from Railway because `10.x.x.x` is a private IP range. Rather than fight network routing, ChampMail is being collapsed into ChampIQ itself. Outbound email and reply detection are delegated to Emelia, removing all SMTP/IMAP infrastructure burden.

This document is the contract for that work. Update it as decisions evolve.

---

## Locked-in decisions (Q&A from 2026-04-28)

| # | Question | Decision |
|---|----------|----------|
| 1 | Sequence cadence model | **Local cadence — Emelia is a per-send shuttle.** Our scheduler ticks every minute. Each send creates a single-step, single-contact Emelia campaign named `champiq:<send_id>-<hash>` and starts it. Emelia has no transactional API, so this is the cheapest way to keep our SOLID surface unchanged. (Revised 2026-04-29 after API discovery.) |
| 2 | Inbound replies | **Emelia webhooks** — no IMAP polling. Events: sent, opened, clicked, replied, bounced, unsubscribed. |
| 3 | Multi-tenant | **Single-tenant data, credential-driven transport.** Prospects/sequences/templates are still global, but each `champmail_senders` row carries an optional `credential_id` so different operators can sign in with their own Emelia API key from the UI. (Refined 2026-04-29.) |
| 4 | Email accounts | **Round-robin pool** — multiple Emelia senders, cadence engine picks the next available one per send. |
| 5 | Frontend UI | **Hybrid** — dedicated panels for Prospects + Templates; Sequences and Analytics live on the canvas. |
| 6 | Rate limits | **Local enforcement** — daily cap per sender + global rate cap, both configurable. |
| 7 | VPS data migration | **Start fresh** — empty tables, no import. |
| 8 | Emelia creds | **Assumed available** (placeholders in env until provided). |
| 9 | v1 feature scope | See "Scope" below. |
| 10 | Canvas node actions | Same set as today + new ones for `add_template`, `create_sequence`, etc. |

---

## v1 Scope

### IN
- Bounce handling (auto-pause on bounce)
- Unsubscribe links (signed token, click pauses all enrollments)
- Open / click tracking via Emelia events
- Reply classification (already exists as `champmail_reply` node — wire to new module)
- Conditional sequence steps (if-opened-then-X-else-Y)
- Working hours / timezone-aware sending
- CSV bulk import (already a route in ChampIQ)
- Reply auto-pause
- Daily/per-sender rate limits

### OUT (deferred to v2+)
- Warmup ramp for new senders
- Email validation (Emelia Email Verifier API)
- A/B subject testing (Split node already covers this on canvas)
- Campaign grouping (sequence-level analytics is enough for v1)

---

## Required Emelia credentials

```env
EMELIA_API_KEY=<from Settings → API Keys>
EMELIA_DEFAULT_SENDER_IDS=<sender_id_1>,<sender_id_2>,<sender_id_3>
EMELIA_WEBHOOK_SECRET=<from Webhooks → signing secret>
EMELIA_DEFAULT_FROM_EMAIL=<optional fallback>
EMELIA_DEFAULT_FROM_NAME=<optional fallback>
```

Webhook URL to register in Emelia: `https://champiq-production.up.railway.app/api/champmail/webhooks/emelia`
Subscribe to events: `email.sent, email.opened, email.clicked, email.replied, email.bounced, email.unsubscribed`

---

## Architecture (SOLID-driven)

```
apps/api/champiq_api/champmail/
├── __init__.py                    # public exports
├── models.py                      # SQLAlchemy ORM (extends models.Base)
├── schemas.py                     # Pydantic IO contracts
├── repositories/                  # one repo per aggregate (SRP)
│   ├── prospects.py
│   ├── sequences.py
│   ├── enrollments.py
│   ├── templates.py
│   ├── senders.py
│   ├── sends.py
│   └── events.py
├── services/                      # use cases (DIP — depend on repos + transport)
│   ├── prospect_service.py
│   ├── sequence_service.py
│   ├── template_service.py
│   ├── send_service.py
│   ├── cadence_service.py
│   ├── webhook_service.py
│   ├── unsubscribe_service.py
│   └── analytics_service.py
├── transport/                     # Strategy pattern — swap providers without service changes
│   ├── __init__.py
│   ├── base.py                    # MailTransport protocol
│   ├── emelia.py                  # EmeliaTransport (GraphQL)
│   ├── stub.py                    # in-memory transport for tests
│   └── results.py                 # SendResult dataclass
├── rendering/
│   ├── template_renderer.py       # Jinja2 sandboxed
│   └── unsubscribe_token.py       # signed-token util
├── scheduling/
│   └── cadence_job.py             # APScheduler job — runs every 60s
├── routers/                       # FastAPI endpoints
│   ├── prospects.py
│   ├── sequences.py
│   ├── templates.py
│   ├── senders.py
│   ├── enrollments.py
│   ├── sends.py
│   ├── webhooks.py
│   ├── unsubscribe.py
│   └── analytics.py
└── nodes/                         # canvas executors — replaces ChampmailDriver
    └── champmail_node.py
```

### SOLID adherence

| Principle | How it's applied |
|-----------|------------------|
| **SRP** | One repo per aggregate; one service per use case; transport handles only wire format |
| **OCP** | Add a new transport (SendGrid, Postmark) by implementing `MailTransport`; no change to services |
| **LSP** | Every transport returns the same `SendResult`; services don't know which transport ran |
| **ISP** | Services depend on narrow interfaces (`SendTransport`, `EventReceiver`) not the whole transport |
| **DIP** | `SendService` takes `MailTransport` in its constructor; container injects `EmeliaTransport`; tests inject `StubTransport` |

---

## Data model

### Tables (all live in the existing ChampIQ Postgres DB via Alembic migration `0003_champmail.py`)

**champmail_prospects**
- `id` PK, `email` UNIQUE NOT NULL, `first_name`, `last_name`, `company`, `title`, `phone`, `linkedin_url`
- `status` ENUM(active, bounced, unsubscribed, replied)
- `timezone` (default UTC), `custom_fields` JSONB
- `last_opened_at`, `last_clicked_at`, `last_replied_at`, `last_sent_at`
- `created_at`, `updated_at`

**champmail_senders**
- `id` PK, `name`, `from_email`, `from_name`, `emelia_sender_id`
- `daily_cap` INT (default 100), `enabled` BOOL
- `created_at`

**champmail_templates**
- `id` PK, `name`, `subject`, `body_html`, `body_text` (auto-derived if null)
- `variables` JSONB (auto-extracted from `{{ var }}` in subject/body)
- `created_at`, `updated_at`

**champmail_sequences**
- `id` PK, `name`, `description`
- `working_hours_start` (default 9), `working_hours_end` (default 17), `timezone` (default UTC)
- `enabled` BOOL
- `created_at`, `updated_at`

**champmail_sequence_steps**
- `id` PK, `sequence_id` FK, `step_index` INT, `template_id` FK
- `delay_days` INT, `delay_hours` INT
- `condition` JSONB (e.g. `{"if": "previous_step.opened", "else_skip": true}`)

**champmail_enrollments**
- `id` PK, `prospect_id` FK, `sequence_id` FK
- `current_step_index` INT (default 0)
- `status` ENUM(active, paused, completed, bounced, replied, unsubscribed)
- `next_step_at` TIMESTAMP (when cadence engine should fire next)
- `enrolled_at`, `paused_at`, `completed_at`

**champmail_sends**
- `id` PK, `enrollment_id` FK, `step_id` FK, `template_id` FK, `sender_id` FK, `prospect_id` FK
- `idempotency_key` UNIQUE (= sha1(enrollment_id, step_index)) — prevents double-send
- `emelia_message_id`, `subject_rendered`, `body_html_rendered`
- `status` ENUM(pending, sent, failed, bounced)
- `sent_at`, `failed_reason`

**champmail_events**
- `id` PK, `send_id` FK, `prospect_id` FK
- `event_type` ENUM(sent, opened, clicked, replied, bounced, unsubscribed)
- `metadata` JSONB (e.g. for clicks: the URL clicked)
- `occurred_at` TIMESTAMP

---

## Build phases

### Phase 1 — Foundation (DB + transport + send)
- [x] Spec doc written
- [x] Models + Alembic migration `0003_champmail.py`
- [x] Pydantic schemas
- [x] Repositories (CRUD)
- [x] Transport interface + EmeliaTransport implementation + StubTransport
- [x] SendService — high-level "send email to prospect" entry point
- [x] Wire into `Container` (DI)
- [ ] Smoke test: send 1 email via stub transport

### Phase 2 — Cadence + lifecycle
- [x] CadenceService — scheduler tick logic
- [x] APScheduler job registered in container
- [x] EnrollmentService — enroll/pause/resume/complete
- [x] Idempotency enforcement
- [x] Round-robin sender picker with daily-cap accounting
- [x] Working-hours / timezone gate

### Phase 3 — Inbound events
- [x] WebhookService — Emelia event ingestion
- [x] Signature verification
- [x] Auto-pause on reply / bounce / unsubscribe
- [x] Reply classification wiring (existing `champmail_reply` node) — 2026-04-29 rewired to local services
- [x] Open / click event recording

### Phase 4 — Public API
- [x] FastAPI routers (prospects, sequences, templates, senders, enrollments, sends, webhooks, unsubscribe, analytics)
- [x] Mounted under `/api/champmail/*`
- [x] OpenAPI documented (auto via FastAPI)

### Phase 5 — Canvas integration
- [x] New `ChampmailLocalExecutor` — replaces HTTP-based driver
- [x] Same node config schema (no chat.py prompt changes)
- [x] Register under `champmail` kind in registry
- [x] Old `ChampmailDriver` deleted — 2026-04-29 (`drivers/champmail.py` removed; `/api/tools/champmail/*` now routes to local executor)

### Phase 6 — Frontend UI panels
- [x] **Connect Emelia wizard** in Credentials panel (paste key → test → pick inbox → save) — added 2026-04-29
- [ ] Prospects panel (table + bulk import)
- [ ] Templates panel (list + Jinja-aware editor with variable picker)
- [ ] Senders panel (list connected Emelia inboxes + daily-cap config + credential picker)
- [ ] Sequences and Analytics remain canvas-only

### Phase 7 — Production hardening
- [x] Rate limits — per-sender daily cap enforced in `SenderPicker`; auto-disable after 5 consecutive bounces
- [x] Unsubscribe link generation + handler (signed token, `GET /api/champmail/unsubscribe/{token}`)
- [x] Bounce handling (sender counter + auto-disable, prospect status, enrollment auto-pause)
- [ ] Global per-second rate limit (deferred — daily caps are sufficient for v1)
- [ ] Structured logging / metrics
- [ ] End-to-end test via real Emelia (when creds provided)

---

## Migration of existing canvas

The current `champmail` node executor calls `ChampmailDriver` over HTTP. The new local executor accepts the same actions:

- `add_prospect`, `get_prospect`, `enrich_prospect`
- `list_sequences`, `start_sequence`, `enroll_sequence`, `pause_sequence`, `resume_sequence`
- `send_single_email`, `get_analytics`
- `list_templates`, `get_template`, `preview_template`
- **NEW:** `create_template`, `create_sequence`, `add_sequence_step`, `list_prospects`

This means the chat.py system prompt and existing canvas workflows continue to work unchanged. Only the underlying transport changes.

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Emelia API rate limits hit during burst sends | Local rate limiter throttles us before Emelia does |
| Webhook spoofing | HMAC signature verification with `EMELIA_WEBHOOK_SECRET` |
| Double-send on retry | `idempotency_key` UNIQUE constraint |
| Sender inbox suspended for spam | Per-sender daily cap + auto-disable on consecutive bounces |
| Long-running cadence job blocks scheduler | Job runs in own thread; processes batches with timeout per batch |
| Schema drift between v1 and Emelia API changes | Transport layer isolated — only `transport/emelia.py` touches GraphQL |

---

## Out of scope (won't build)

- Domain/DKIM management (Emelia handles)
- IMAP polling
- Custom SMTP fallback (would re-introduce the infrastructure we're escaping)
- Multi-tenant scoping
- A/B subject testing (canvas Split node already covers)
- Warmup ramp (defer to v2 if needed)
- Campaign grouping (defer to v2)

---

*Last updated: 2026-04-29 — Phases 1–5 + most of 7 complete and verified end-to-end against the live Emelia API. Phase 6 (frontend panels) is the remaining build item.*

---

## Verified end-to-end on 2026-04-29

Sent 4 successful messages through real Emelia (account `lakeb2bdeveloper@gmail.com`, provider `69f1e13ae98b6b4a618c1cf4`) via:
- Direct API: `POST /api/champmail/sends`
- Canvas tool route: `POST /api/tools/champmail/send_single_email`
- Cadence engine: enrollment-driven send through `CadenceJob` ticking every 60s

Each ChampIQ send produces one Emelia campaign named `champiq:<send_id>-<hash>` with one step + one contact, started immediately.

## Emelia REST API — discovered shapes

| Action | Method + Path | Body |
|---|---|---|
| Create campaign | `POST /emails/campaigns` | `{name, provider}` |
| Update steps | `PATCH /emails/campaigns/{id}/steps` | `{steps:[{delay:{amount,unit},versions:[{subject,message}]}]}` |
| Add contact | `POST /emails/campaign/contacts` | `{id, contact:{email, firstName,...}}` ← field is **`id`**, not `campaignId` |
| Start | `POST /emails/campaigns/{id}/start` | — |
| Pause | `POST /emails/campaigns/{id}/pause` | — |
| List | `GET /emails/campaigns` | — |
| List providers (inboxes) | GraphQL `{ providers { _id imap{port} smtp{port} } }` at `https://graphql.emelia.io/graphql` | — |

Auth: raw API key in `Authorization` header (no `Bearer`). REST base: `https://api.emelia.io`. GraphQL base: `https://graphql.emelia.io/graphql`.

## Emelia constraints to know

- **No transactional API.** Sending requires a campaign — see "Locked-in decision #1" above for our per-send-campaign workaround.
- **Default schedule is 08:00–17:00 Europe/Brussels Mon–Fri.** Sends queued outside this window wait for the next slot. Override via `dailyContact`/`schedule.start`/`schedule.end` on campaign create if you need 24/7 (not yet implemented).
- **GraphQL introspection is disabled in production.** Schema discovery is by trial-and-error.
- **Campaign-not-found surfaces as a generic 400.** It usually means a wrong field name, not a missing record. Check field names first.
