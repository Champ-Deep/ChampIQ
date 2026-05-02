# ChampIQ — Learning Handbook

> A structured path from "I just cloned the repo" to "I can build any workflow this app supports". Read it in order; each section builds on the last.

---

## How this is organized

| Part | Goal | Time |
|---|---|---|
| 1. Boot the stack | You have a working `localhost:8000` | 10 min |
| 2. The mental model | You understand what a workflow IS | 15 min |
| 3. Your first workflow | You've sent a real email through ChampMail | 20 min |
| 4. Triggers in depth | Cron, webhooks, events, manual — when each is the right choice | 20 min |
| 5. Data + control flow | csv.upload, loops, switches, splits, set | 30 min |
| 6. Tools | ChampMail, ChampGraph, ChampVoice — every action with examples | 45 min |
| 7. Expressions deeply | Templating without footguns | 20 min |
| 8. The chat console | Generate workflows with English | 15 min |
| 9. Reply handling | The full inbound-reply pipeline | 20 min |
| 10. Operating it | Logs, retries, retention, multi-worker safety | 20 min |
| 11. Common patterns | 8 production-shaped recipes you can copy | reference |
| 12. Troubleshooting | Symptoms → root causes → fixes | reference |

> **If you only have 30 minutes**: read parts 2, 3, 8 and skim 11.

---

## Part 1 — Boot the stack

### Prerequisites

- Docker (recent enough to support Compose v2 and BuildKit)
- ~600 MB free RAM for the running stack (200 MB app + 80 MB Postgres + 48 MB Redis + headroom)

### Clone + configure

```bash
git clone <repo>
cd champiq-canvas
cp .env.example .env
# Edit .env — minimum required:
#   FERNET_KEY=<generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`>
#   CHAMPMAIL_BASE_URL=http://10.10.21.19:8000   # placeholder, only legacy code reads it
#   CHAMPGRAPH_BASE_URL=http://10.10.21.19:8081  # placeholder, only legacy code reads it
#   CHAMPSERVER_EMAIL=stub@example.com
#   CHAMPSERVER_PASSWORD=stub
# Optional but useful:
#   EMELIA_API_KEY=<your key>
#   OPENROUTER_API_KEY=<your key>
#   CHAMPGRAPH_URL=<your Graphiti VPS URL>  # leave empty if you don't have one
```

### Run

```bash
docker compose up -d --build
```

What you should see in `docker compose logs app`:

```
[start] running alembic migrations...
INFO  [alembic.runtime.migration] Running upgrade ... -> 0006
[start] migrations OK
[start] starting uvicorn on port 8000 with 2 worker(s)
INFO:     Application startup complete.
```

### Smoke-check

```bash
curl http://localhost:8000/health
# {"status":"ok"}

curl http://localhost:8000/api/settings
# {"default_engine_provider":"emelia","default_email_credential_id":null,...}

# Open the canvas:
open http://localhost:8000/
```

If `/health` returns 200, you're done. If it doesn't, see [Part 12 — Troubleshooting](#part-12--troubleshooting).

---

## Part 2 — The mental model

Read [PRODUCT.md](PRODUCT.md) first if you haven't. The sections below assume you understand:

- A **workflow** is a directed graph: one trigger, then nodes, then edges.
- An **execution** is one run of that workflow. Each execution has a unique `execution_id`.
- A **node run** is one node executing once during an execution.
- A **trigger** decides *when* a workflow runs. Everything else is a *node* — a unit of work.

### The most important rule

**Exactly one trigger per workflow.** Always. The runtime rejects workflows with more.

This trips people up because intuitively, "the user uploaded a CSV" feels like a trigger. It isn't. It's data. The trigger is "when does this workflow run?" — *cron*, *manual click*, *webhook hit*, *event fired*. The CSV is a separate node (`csv.upload`) that supplies data to whichever trigger you chose.

### How a workflow actually runs (mental model)

```
trigger fires
    │
    ▼
orchestrator creates `executions` row, generates execution_id
    │
    ▼
walk graph in BFS layers
    │
    │   for each node in this layer (in parallel):
    │      - build NodeContext { config, input, upstream, trigger, item, index, … }
    │      - render config (replace `{{ … }}` against the context)
    │      - call executor
    │      - persist `node_runs` row
    │      - if it returned named branches, only follow those edges
    │      - if it's a loop, downstream nodes will fan out per item
    │
    ▼
when all reachable nodes are done → mark execution success / error
```

That's the whole engine. Every behavior in the rest of this handbook is a special case of that loop.

---

## Part 3 — Your first workflow (manual → loop → champmail)

Goal: send an email to one person. Do it visually first, then read the JSON, then poke it via API.

### Step 1 — Open the canvas

`http://localhost:8000` in your browser.

### Step 2 — Drop nodes

From the **left sidebar**, drag onto the canvas:

1. **Manual Trigger** (group: triggers)
2. **CSV Upload** (group: data)
3. **Loop** (group: control)
4. **Champmail** (group: tools — orange icon)

### Step 3 — Wire them

Click-drag from one node's right handle to the next node's left handle, in order: trigger → csv.upload → loop → champmail.

### Step 4 — Configure

Click each node, edit in the **right panel**:

- **Manual Trigger**: leave `items` blank.
- **CSV Upload**: click "CSV file", upload a CSV with one row. Columns: `email,first_name`. Row: `your-test-email@example.com,YourName`.
- **Loop**: set `items` = `{{ prev.items }}`. Mode `parallel`, concurrency `1`. (We have one row, but the loop fan-out is what makes the next node see `item`.)
- **Champmail**: action `send_single_email`. Credential `champmail-admin` (you'll need to add it on the **Settings** page first — top-bar button → Email Engine → Credentials → Add → ChampMail → paste your Emelia API key).
  - In the action's input fields:
    - `email`: `{{ item.email }}`
    - `first_name`: `{{ item.first_name }}`
    - `subject`: `Hello {{ item.first_name }}`
    - `body`: `Hi {{ item.first_name }}, this is a test from ChampIQ.`

### Step 5 — Run

Click **Run All** in the top bar. Watch the bottom log. If everything works, you'll see:

```
manual-trigger    success
csv-upload        success    1 row
loop              success    1 item
champmail-send    success    sent=true message_id=…
```

And there's a real email in your inbox.

### Step 6 — See the JSON

Open **DevTools → Network**, find the most recent `POST /api/workflows/ad-hoc/run`. The request body is the workflow you just built. Read it. Notice:

- One `trigger.manual` node.
- A `csv.upload` node with `items` baked in.
- The loop's `items` config is `"{{ prev.items }}"` — that string lives in the DB; the orchestrator renders it at runtime.
- The champmail node's `inputs` reference `{{ item.email }}` and `{{ item.first_name }}` — same templating mechanism.

That's the whole stack working end-to-end. From here on, everything is variations.

---

## Part 4 — Triggers in depth

### `trigger.manual`

When: user clicks Run All (or you POST `/api/workflows/{id}/run`).

Best for:
- Authoring + testing.
- One-off blasts where the operator decides when to fire.
- Workflows that consume a CSV the user uploaded right then.

Config:
```json
{ "label": "Run workflow", "items": [] }
```
Pass `items` if you want to inline-paste rows; otherwise put rows in a downstream `csv.upload`.

### `trigger.cron`

When: a cron schedule. Requires the workflow's `active = true`.

Config:
```json
{ "cron": "*/5 * * * *", "timezone": "UTC" }
```

Standard 5-field cron. Examples:

| Expression | Meaning |
|---|---|
| `*/5 * * * *` | Every 5 minutes |
| `0 9 * * 1-5` | Weekdays at 9:00 |
| `0 8 * * *` | Daily at 8:00 |
| `0 17 * * 5` | Fridays at 17:00 |

**Cron is stateless.** It does not know how many times it has fired. If you need "first time do X, after that do Y", you need explicit state somewhere (a column on the prospect, a sequence enrollment, an external system). See [Part 11 — Common patterns](#part-11--common-patterns).

### `trigger.webhook`

When: an external system POSTs to your ChampIQ instance.

Config:
```json
{ "path": "/hooks/new-signup", "secret": "" }
```

The endpoint is `/api/webhooks/wf/{workflow_id}/{trigger_id}`. The body is available downstream as `{{ trigger.payload.* }}`.

If `secret` is set, the request must include an HMAC signature header. (For Emelia replies, the dedicated `/api/champmail/webhooks/emelia` route is preferred — it has full event-type handling and dedup.)

### `trigger.event`

When: another part of ChampIQ publishes a topic on the bus.

Config:
```json
{ "event": "email.replied", "source": "champmail" }
```

The bus publishes these topics today: `email.sent`, `email.opened`, `email.clicked`, `email.replied`, `email.bounced`, `email.unsubscribed`. Workflows with `trigger.event { event: "email.replied" }` fire automatically when any prospect replies.

### Choosing between them

| You want | Use |
|---|---|
| Run on demand from the canvas | `trigger.manual` |
| Run on schedule | `trigger.cron` |
| Respond to inbound HTTP from a CRM, form, or third party | `trigger.webhook` |
| React to internal events (replies, bounces) | `trigger.event` |

---

## Part 5 — Data and control flow

### `csv.upload` (the data source)

The CSV's rows live **inside the node's config** (parsed in-browser at config time). Output: `{ items, count, filename }`.

Use it after any trigger to drive a loop:

```
trigger.X → csv.upload → loop "{{ prev.items }}" → tool node
```

### `loop` — the workhorse

```json
{
  "items": "{{ prev.items }}",
  "mode": "parallel",
  "concurrency": 5,
  "max_items": 100,
  "stop_on_error": false,
  "pace_seconds": 0,
  "initial_delay_seconds": 0,
  "jitter_seconds": 0
}
```

| Mode | Behavior |
|---|---|
| `parallel` | All items in flight, capped at `concurrency`. Best for independent work (HTTP fan-out, research). |
| `sequential` | One after another. Best when items have side effects on each other. |
| `paced` | Each item starts at `last_start + pace_seconds (+ jitter)` regardless of body duration. Concurrency forced to 1. Best for cold-email cadence (avoids spam-filter pattern detection). |

Inside the loop body, expressions can use:

- `{{ item.field }}` — the current item's field
- `{{ index }}` — 0-based index
- `{{ prev.* }}` — same as outside

### `if` — conditional branching

```json
{ "condition": "prev.tier == 'enterprise'" }
```

**Important**: the `condition` is a **raw expression**, not wrapped in `{{ … }}`. The executor wraps it for you. If you write `{{ … }}`, you get nested wrapping and the parse breaks.

Returns branches `"true"` and `"false"`. Edges from the `if` node need `sourceHandle: "true"` or `sourceHandle: "false"` set so the orchestrator picks the right path.

### `switch` — multi-way branching

```json
{
  "value": "{{ prev.status }}",
  "cases": [
    { "match": "positive", "branch": "positive" },
    { "match": "negative", "branch": "negative" }
  ],
  "default_branch": "other"
}
```

Same edge-handle rule as `if`.

### `split` — fan-out

```json
{ "mode": "fixed_n", "n": 3, "items": "{{ prev.records }}" }
```

`fixed_n`: distributes items round-robin across N branches. `fan_out`: every branch gets the full list. Use case: A/B/C testing different message variants on different cohorts.

### `set` — compute and emit

```json
{
  "fields": {
    "to": "{{ item.email }}",
    "personalized": "Hi {{ item.first_name }}, your account ID is {{ item.id }}"
  }
}
```

Use it to massage data between two nodes — e.g. to merge multiple upstream outputs into one shape, or to inject computed fields.

### `merge` — join branches

```json
{ "mode": "all" }
```

Waits for all upstream branches to complete and joins their outputs into `{ merged: { node_id: output, … } }`.

### `code` — sandboxed Python

```json
{ "expression": "{'doubled': prev.payload.n * 2}" }
```

`prev`, `node`, `trigger` are dot-accessible. Allowed: arithmetic, comparisons, comprehensions, dict/list literals, `len`, `min`, `max`, `sum`, `sorted`, `any`, `all`, `range`, `abs`, `round`. Disallowed: imports, file/network IO.

Use it sparingly. When you want to compute something from upstream output that's too gnarly for `{{ … }}` interpolation.

### `wait`

```json
{ "seconds": 60 }
```

Hard cap: 1 hour. For longer sleeps, use sequence cadence or cron.

---

## Part 6 — Tools (ChampMail, ChampGraph, ChampVoice)

Every tool node has the same shape:

```json
{
  "kind": "<tool>",
  "config": {
    "action": "<verb>",
    "credential": "<credential-name>",
    "inputs": { ... }
  }
}
```

The **action** picks the verb. The **credential** picks which set of secrets to use. **inputs** are the per-call arguments — every value supports `{{ … }}` expressions.

### ChampMail (16 actions, grouped)

**Prospects**:
- `add_prospect` — create or upsert. Inputs: `email` (req), `first_name`, `last_name`, `company`, `title`, `phone`, `linkedin_url`, `timezone`, `custom_fields`.
- `get_prospect` — by email. Returns `{ found, id, status, last_*_at }`.
- `list_prospects` — with `limit`, `offset`, `status`, `search`.

**Templates**:
- `list_templates`, `get_template` (by `template_id` or `name`), `create_template`, `preview_template`.

**Sequences**:
- `list_sequences`, `create_sequence` (with optional inline `steps`), `add_sequence_step`.
- `enroll_sequence` (alias `start_sequence`) — give a `prospect_id` or `prospect_email` plus a `sequence_id` or `sequence_name`.
- `pause_sequence`, `resume_sequence`.

**Sends**:
- `send_single_email` — fire-and-forget. Inputs: `email` or `prospect_id`, plus either a `template_id`/`template_name` or inline `subject` + `body`.

**Analytics**:
- `get_analytics` — per-sequence. Returns `{ sends_total, opens, clicks, replies, bounces, open_rate, reply_rate, … }`.

### ChampGraph (split: local + Graphiti)

**Local** (runs against ChampIQ's Postgres — fast, always available):

- `create_prospect`, `list_prospects`, `get_prospect_status`, `bulk_import`, `enrich_prospect`.

**Graphiti** (runs against the Graphiti VPS — requires `CHAMPGRAPH_URL`):

- **Ingest**: `ingest_episode`, `ingest_batch`, `hook_email`, `hook_email_batch`, `hook_call`.
- **Read**: `query`, `account_briefing`, `account_contacts`, `account_topics`, `account_communications`, `account_personal_details`, `account_team_contacts`, `account_graph`, `account_timeline`, `account_relationships`, `account_email_context`.
- **Intelligence**: `intelligence_salesperson_overlap`, `intelligence_stakeholder_map`, `intelligence_engagement_gaps`, `intelligence_cross_branch`, `intelligence_opportunities`.
- **Sync**: `sync_account`, `sync_status`.
- **Campaign generator** (Perplexity-backed): `research_prospects`, `campaign_essence`, `campaign_segment`, `campaign_pitch`, `campaign_personalize`, `campaign_html`, `campaign_preview`.

When `CHAMPGRAPH_URL` is empty, all Graphiti-side actions return `{"available": false}` instead of crashing — the workflow can still complete, the canvas can branch on it.

### ChampVoice (3 actions)

- `initiate_call` — outbound call via ElevenLabs Conversational AI. Inputs: `to_number` (req), `lead_name`, `email`, `agent_id` (override), `phone_number_id` (override), plus any `dynamic_variables` you want to pass into the agent's prompt.
- `get_call_status` — by `conversation_id`.
- `list_calls` — agent-filtered.

### `champmail.reply_classifier`

Special-purpose node: takes a reply body, classifies it via LLM into `positive` / `negative` / `neutral`, optionally pauses enrollments, emits matching branches.

Use case:
```
trigger.event { event: "email.replied" }
  → champmail.reply_classifier
    "positive" → champmail send_single_email (hand-off email)
    "other"    → log + move on
```

---

## Part 7 — Expressions deeply

The engine evaluates `{{ expr }}` strings at every node config render. The full name table:

| Name | What | Where bound |
|---|---|---|
| `prev` | Output of the directly upstream node | Always |
| `node` | `{node_id: output}` for all upstream | Always |
| `trigger` | The trigger's output (note: under `payload`) | Always |
| `execution_id` | Current execution id (`exec_…`) | Always |
| `item` | Current loop item | Inside a loop body only |
| `index` | 0-based loop index | Inside a loop body only |

Helper functions: `len`, `str`, `int`, `float`, `bool`, `lower`, `upper`, `strip`, `default(v, fallback)`, `get(obj, key)`.

### Common patterns

```jinja2
{{ trigger.payload.items }}                          # list from trigger
{{ prev.data.prospects }}                            # nested attribute access
{{ item.email }}                                     # loop item field
{{ default(item.first_name, 'there') }}              # fallback
{{ 'A' if index < 5 else 'B' }}                      # ternary
{{ item.title.lower() }}                             # method call (str methods)
"Subject for {{ item.first_name }} on run {{ execution_id }}"  # interpolation
```

### Pitfalls (the three most common)

1. **`trigger.X` doesn't work — use `trigger.payload.X`.** The trigger node's *output* (which is what `trigger` binds to) wraps your raw payload under `payload`. Always.

2. **The `if` node's `condition` is a RAW expression** — do not wrap in `{{ … }}`. The executor wraps it for you.

3. **Whole-string vs interpolated**:
   - `"{{ trigger.payload.items }}"` (entire string is one expression) → returns the typed value (a list).
   - `"items: {{ trigger.payload.items }}"` (mixed) → calls `str()` on the result and concatenates.

   This matters for things like `loop.items` — keep it whole-string so the loop receives an actual list, not a stringified one.

---

## Part 8 — The chat console

The chat console at `/api/chat/message` (driven from the chat panel in the UI) takes English and emits a workflow JSON. The LLM is Claude Sonnet via OpenRouter by default.

### What it's good at

- **Producing valid graph shapes** when you give it specifics. The system prompt has hard rules (one trigger, csv.upload not as a trigger, `trigger.payload.X` expressions) baked in.
- **Wiring together standard recipes** — cron + CSV + loop + champmail; webhook → reply classifier; sequence enroll from CSV.
- **Writing decent email bodies** when you give it offer details, length cap, banned phrases, and a specific CTA.

### What it's NOT good at

- **Reading your mind.** Generic prompts ("send a discount email") produce generic, clichéd content. Specifics in → specifics out.
- **Counting cron ticks.** It can't make "first tick send X, second tick send Y" work because cron is stateless. See [Part 11](#part-11--common-patterns) for the right pattern.
- **Knowing your domain.** It doesn't know your product, your prospects, your tone. Tell it.

### How to use it well

1. State the **trigger** explicitly (`trigger.cron */5 * * * *`, etc.).
2. Pin the **credential name** (`credential champmail-admin`).
3. Specify the **action** if it's ambiguous (`champmail send_single_email`, not just "send an email").
4. Use the magic line: **"Use csv.upload, not trigger.manual."** for cron+CSV cases.
5. End with **"One trigger only."** as a belt-and-suspenders guard.

The full prompt handbook with 30 production-ready prompts: [CHAT_PROMPT_HANDBOOK.md](CHAT_PROMPT_HANDBOOK.md).

---

## Part 9 — Reply handling

Reply detection is **fully push-based** via Emelia webhooks.

### Setup

1. In the Emelia dashboard, set the webhook URL to `https://<your-deployment>/api/champmail/webhooks/emelia`.
2. Set a strong `EMELIA_WEBHOOK_SECRET` in your environment AND paste the same value into Emelia's "Signing secret" field.
3. Enable events: `email.sent`, `email.opened`, `email.clicked`, `email.replied`, `email.bounced`, `email.unsubscribed`.

### What happens on a reply

1. Emelia POSTs `email.replied` to ChampIQ.
2. ChampIQ verifies the HMAC signature.
3. Dedup check on `(provider, provider_event_id, event_type)` — if it's a retry of an already-ingested event, skip everything else.
4. `champmail_events` row written, `prospect.status` set to `replied`, `prospect.last_replied_at` set, every active enrollment for that prospect paused with `reason=replied`.
5. **DB commit.**
6. Bus publish `email.replied` to canvas event listeners.

### Building a reply-driven workflow

```
trigger.event { event: "email.replied", source: "champmail" }
  → champmail.reply_classifier
       "positive" branch → champmail send_single_email (handoff to AE)
       "negative" branch → log + ensure unsubscribed
       "other"    branch → wait → re-engage later
```

The `email.replied` topic includes a payload like:

```json
{
  "prospect_id": 42,
  "send_id": 178,
  "email": "deep@example.com",
  "subject": "Re: …",
  "body": "Hey, this looks interesting…",
  "received_at": "2026-04-30T13:14:15Z",
  "tracking_id": "178",
  "raw_provider": "emelia"
}
```

Your `trigger.event` workflow's downstream nodes can reference all of these via `{{ trigger.payload.email }}`, `{{ trigger.payload.body }}`, etc.

---

## Part 10 — Operating it

### Where to look when something is wrong

| Symptom | First check |
|---|---|
| Workflow won't save | Check the API response body — the validator returns clear `400` messages (e.g. "multiple trigger nodes"). |
| Cron didn't fire | Is the workflow `active = true`? Cron triggers only fire when active. |
| Email didn't send | Open `/api/executions/<id>/node_runs` — the champmail node row will have an `error` field. Common: missing credential, no senders enabled, Emelia rejected the API key. |
| Reply trigger didn't fire | Check Emelia's webhook delivery log. Then check `champmail_events` for the row. If both exist but no canvas execution started, check that your `trigger.event` workflow is `active`. |
| Browser shows React error #310 | Refresh the page — the canvas had a hook-mismatch glitch. (Latent issue; non-fatal.) |

### Container logs

```bash
docker compose logs -f app
```

The logger uses Python's stdlib logging at INFO. Failures print exception tracebacks. Search for the `execution_id` you care about — it's tagged in most relevant log lines.

### Retention

By default:
- `executions` (and their `node_runs` cascades) are pruned after 30 days.
- One-off `_oneoff_*` templates older than 7 days are pruned.
- The janitor runs every 6 hours.

Override via `EXECUTION_RETENTION_DAYS`, `CHAMPMAIL_ONEOFF_RETENTION_DAYS`, `JANITOR_RUN_INTERVAL_HOURS`.

### Multi-worker safety

By default, 2 uvicorn workers. Things to know:

- **Event bus**: when `REDIS_URL` is set, the bus uses Redis pub/sub (cross-worker correct). If Redis is unreachable, the runtime falls back to in-memory and **logs a WARNING** — cross-worker events won't be delivered. Watch for this.
- **Idempotency cache**: same — Redis when available, in-memory fallback per worker.
- **Janitor**: uses a Postgres advisory lock so only one worker actually sweeps per tick. The other worker no-ops.

### Backups

Postgres is the only stateful component besides Emelia (which manages its own). Back up `champiq` database. Redis is purely cache + bus — losing it loses idempotency dedup but no real data.

---

## Part 11 — Common patterns

### Pattern 1: Cron + CSV every N minutes

```
trigger.cron "*/5 * * * *" UTC
  → csv.upload (rows)
  → loop "{{ prev.items }}" concurrency 4
  → champmail send_single_email
        inputs.subject: "Hello {{ item.first_name }} — run {{ execution_id }}"
```

Each tick: every row in the CSV gets one fresh email. The same email body to the same prospects each tick — *cron does not give per-tick variation by itself*. For variation across ticks, use Pattern 2 or 6.

### Pattern 2: Drip sequence enrollment

The right tool when "first email today, follow-up 5 days later, last touch 12 days after that". Per-prospect timing.

```
trigger.manual
  → csv.upload
  → loop concurrency 3
  → champmail add_prospect
  → champmail enroll_sequence (sequence_name "<my-seq>")
```

Build the sequence in advance via the canvas or via `champmail create_sequence` + `champmail add_sequence_step`. The cadence job (running on the same scheduler) wakes every minute, finds enrollments whose `next_step_at < now`, fires the next step.

### Pattern 3: Reply-driven hand-off

```
trigger.event { event: "email.replied", source: "champmail" }
  → champmail.reply_classifier
       "positive" → champmail send_single_email (notify your AE)
       "other"    → no-op
```

### Pattern 4: AI-personalized cold outbound

```
trigger.manual
  → csv.upload (rows: email, first_name, company, linkedin_url)
  → loop concurrency 3
  → champgraph research_prospects (returns {summary, pain_points, conversation_hooks, …})
  → llm
       prompt: "Write a 70-word cold email opening using these signals: {{ prev.data.asset.conversation_hooks }}"
       json_mode: true (returns {subject, body})
  → champmail send_single_email
       subject: "{{ prev.json.subject }}"
       body: "{{ prev.json.body }}"
```

### Pattern 5: A/B test

```
trigger.manual
  → csv.upload
  → split mode "fixed_n" n 2 items "{{ prev.items }}"
       branch_0 → champmail send_single_email (subject A)
       branch_1 → champmail send_single_email (subject B)
       both → merge mode "all" → champmail get_analytics
```

### Pattern 6: Daily analytics digest to Slack

```
trigger.cron "0 17 * * 1-5" UTC
  → champmail get_analytics (sequence_id <id>)
  → http POST <slack-webhook-url>
       body: '{"text": "Sequence <id>: {{ prev.data.sends_total }} sends, {{ prev.data.opens }} opens, {{ prev.data.replies }} replies"}'
```

### Pattern 7: Cron-driven re-engagement

```
trigger.cron "0 10 * * 1" UTC
  → champmail list_prospects (status "cold")
  → loop "{{ prev.data.prospects }}" concurrency 3
  → champmail send_single_email (re-engagement subject + body)
```

### Pattern 8: Voice + email follow-up

```
trigger.manual
  → champvoice initiate_call
       inputs: {to_number, lead_name, email}
  → wait seconds 60
  → champmail send_single_email
       subject: "Quick recap from our call"
       body: "Hi {{ first_name }}, here's the link we mentioned: <url>"
```

---

## Part 12 — Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `400 multiple trigger nodes` on save | You have two `trigger.*` nodes (often `trigger.cron` + `trigger.manual`). | Replace the second with `csv.upload`. |
| Cron-active workflow never fires | Workflow not `active`, OR cron expression invalid (5-field, not 6 — APScheduler is strict). | Set `active=true`; validate expression at <https://crontab.guru>. |
| `champmail.send_single_email: prospect_id or email required` | CSV column names don't match what the loop body templates expect. | Make sure `{{ item.email }}` matches a column literally named `email`. |
| `no senders available` | No `champmail_senders` row enabled, or sender's `consecutive_bounces` > 5. | Add a sender via `/api/champmail/senders`; reset bounces to 0. |
| Webhook returns 200 but nothing changes | `champmail_events` won't write if no prospect is found for the event. | Add the prospect with `add_prospect` first; or use a real `tracking_id` your sends already wrote. |
| `webhook event-bus publish failed` in logs | Redis is unreachable. The publish was swallowed (so the DB commit isn't rolled back) — but cross-worker events won't fire. | Check `REDIS_URL` and Redis health. |
| `{{ trigger.email }}` doesn't resolve | Should be `{{ trigger.payload.email }}`. | Always use the `.payload.` prefix on trigger expressions. |
| Loop produces strings instead of objects | `items` was rendered as a partial string, not whole-string. | Make sure `items` is exactly `"{{ prev.items }}"` with nothing before/after. |
| Container OOM-kills under load | 2 workers + 200MB cap is tight if you do heavy LLM work. | Bump container memory; lower `UVICORN_WORKERS` if memory-bound. |
| Browser blank screen with React #310 | Manifest race during render — known latent issue. | Refresh; will be fixed in a follow-up. Non-data-affecting. |

---

## You're done

If you got through all 12 parts you can:

- Author any workflow this app supports, by hand or via chat.
- Read a workflow's JSON and predict what it'll do.
- Debug a stuck workflow from the audit trail.
- Operate the stack at small-team scale.

Recommended next: build something for your real use case, then poke at the source — the codebase is small (~9k Python, ~5.5k TypeScript), and most files do exactly what their name says. Read `apps/api/champiq_api/runtime/orchestrator.py` next if you want to understand exactly how the engine walks the graph; it's the heart of the runtime.
