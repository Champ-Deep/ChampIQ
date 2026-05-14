# ChampHarbinger Integration — Branch Handoff

**Branch:** `feature/champiq-redesign` (commit `c42f323`)
**Date:** 2026-05-14
**Status:** Backend complete, ready for branch testing before merge to main

---

## What This Is

ChampHarbinger is Champions Group's signal intelligence engine. It:
- Detects buying signals (hiring surges, funding rounds, exec changes, product launches)
- Discovers companies matching an ICP
- Enriches company and contact data via Exa, Browserbase, and LinkedIn
- Stages qualified prospects for outreach

This integration adds ChampHarbinger as a **canvas node category** in ChampIQ. Once connected, users can drag-and-drop "Discover Companies", "Run Signal", "Enrich Company", etc. nodes into their canvas workflows, then pipe the signal data directly into ChampMail sequences.

---

## What's Already Built (Don't Redo)

### ChampIQ side (this repo, commit `c42f323`)

| File | What it does |
|---|---|
| `champiq-canvas/manifests/champharbinger.manifest.json` | Declares 6 canvas node actions with full JSON schemas |
| `champiq-canvas/apps/api/champiq_api/drivers/champharbinger.py` | `HttpToolDriver` subclass — routes canvas actions to ChampHarbinger's REST API using Bearer auth |
| `champiq-canvas/apps/api/champiq_api/drivers/__init__.py` | Exports `ChampHarbingerDriver` |
| `champiq-canvas/apps/api/champiq_api/database.py` | Added `champharbinger_url: str = ""` to `Settings` (read from `CHAMPHARBINGER_URL` env var) |
| `champiq-canvas/apps/api/champiq_api/container.py` | Registers `ChampHarbingerDriver(settings.champharbinger_url)` in the driver registry |
| `champiq-canvas/apps/api/champiq_api/main.py` | Added `GET /api/harbinger/health` — health probe endpoint for ChampHarbinger's connection check |

### ChampHarbinger side (separate repo, already merged to main)

ChampHarbinger exposes a REST API at `/api/v1/` and a settings UI. Everything listed below is live:

| Endpoint | What it does |
|---|---|
| `GET /api/v1/signals` | List all signals in the workspace |
| `POST /api/v1/signals/run` | Run a signal against a domain — auto-queues the company if signal fires |
| `POST /api/v1/discover` | Find companies matching an ICP (AI ICP scoring, persists to organizations table) |
| `POST /api/v1/enrich/company` | Full enrichment via Exa — product, funding, team; returns talking points |
| `POST /api/v1/enrich/contact` | Enrich a person — email inference, LinkedIn URL, seniority score |
| `GET /api/v1/prospects/qualified` | Pull prospects staged by fired signals (cursor-paginated) |

All six endpoints authenticate with `Authorization: Bearer chh_<token>`.

---

## How to Set Up the Test Environment

### Step 1 — Run ChampHarbinger locally

```bash
cd /path/to/ChampHarbinger
cp .env.example .env.local
# Fill in at minimum:
#   CLERK_*, OPENROUTER_API_KEY, EXA_API_KEY
docker compose up -d postgres
pnpm db:migrate
pnpm dev
# → http://localhost:3000
```

In ChampHarbinger, go to **Settings → ChampIQ**:
1. Set ChampIQ URL: `http://localhost:8000`
2. Click **Generate key** → copy the `chh_` token
3. Set handoff mode to "Fully automatic" for testing

### Step 2 — Run ChampIQ locally with the env var

```bash
cd champiq-canvas/apps/api
# Add to your .env:
echo "CHAMPHARBINGER_URL=http://localhost:3000" >> .env
```

Restart the API. `GET /api/harbinger/health` should now be reachable from ChampHarbinger.

### Step 3 — Add the ChampHarbinger credential in ChampIQ

In the ChampIQ frontend, go to **Settings → Credentials → Add credential**:

| Field | Value |
|---|---|
| Name | `champharbinger` (or any label) |
| Type | `champharbinger` |
| `api_key` | The `chh_` token you copied from ChampHarbinger |

---

## The 6 Canvas Nodes

All nodes appear under the **ChampHarbinger** category in the node picker.

### 1. List Signals
**Action:** `list_signals` | **Method:** `GET /api/v1/signals`

No inputs required. Output: array of signal objects with `id`, `name`, `category`, `execution_type`.

**Typical use:** First node in a workflow that needs to present signal options.

---

### 2. Run Signal
**Action:** `run_signal` | **Method:** `POST /api/v1/signals/run`

| Input | Type | Required | Description |
|---|---|---|---|
| `signal_id` | string (UUID) | ✓ | Signal to check |
| `domain` | string | ✓ | Company domain (e.g. `acme.com`) |

Output:
```json
{
  "fired": true,
  "reasoning": "Posted 8 senior DevOps roles referencing Kubernetes migration in 3 weeks",
  "data": { "job_count": 8, "roles": ["Senior DevOps", "Platform Engineer"] },
  "fired_at": "2026-05-14T09:00:00Z",
  "queued": true
}
```

**Key detail:** When `fired=true`, ChampHarbinger automatically stages the company in its `champiq_queue` table. The `queued` field confirms this. Use `{{fired}}` in a downstream If node to branch on signal outcome.

**Typical canvas flow:**
```
Schedule trigger → Run Signal (hiring-surge, {{company.domain}})
    → If {{fired}} = true → Enrich Company → ChampMail sequence
    → else → end
```

---

### 3. Discover Companies
**Action:** `discover_companies` | **Method:** `POST /api/v1/discover`

| Input | Type | Required | Description |
|---|---|---|---|
| `icp` | string | ✓ | ICP description (e.g. `"SaaS companies with 50-200 employees hiring VPs of Sales"`) |
| `industry` | string | — | Industry filter |
| `location` | string | — | Geographic filter |
| `size` | string | — | Headcount range (e.g. `"50-200"`) |

Output:
```json
{
  "companies": [
    {
      "name": "Acme Corp",
      "domain": "acme.com",
      "url": "https://acme.com",
      "description": "...",
      "score": 8.2,
      "score_reason": "Strong ICP match — B2B SaaS, 120 employees, hiring sales leadership"
    }
  ]
}
```

Companies with `score < 4` are filtered out. Results are sorted by score descending. Discovered companies are persisted to the ChampHarbinger knowledge base.

---

### 4. Enrich Company
**Action:** `enrich_company` | **Method:** `POST /api/v1/enrich/company`

| Input | Type | Required | Description |
|---|---|---|---|
| `domain` | string | ✓ | Company domain |

Output:
```json
{
  "company": { "domain": "acme.com", "description": "..." },
  "contacts": [],
  "score": null,
  "talking_points": ["Recently raised funding", "Actively hiring", "Recent product launch"]
}
```

`talking_points` are inferred from Exa search results and flow into ChampMail template variables.

---

### 5. Enrich Contact
**Action:** `enrich_contact` | **Method:** `POST /api/v1/enrich/contact`

| Input | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✓ | Full name |
| `domain` | string | ✓ | Company domain |
| `title` | string | — | Job title (improves email inference and scoring) |

Output:
```json
{
  "contact": {
    "name": "Jane Smith",
    "domain": "acme.com",
    "title": "VP Engineering",
    "email": "jane.smith@acme.com",
    "linkedin_url": "https://linkedin.com/in/janesmith"
  },
  "score": 7
}
```

`score` is a seniority score (1–10): CEO/Founder=9, VP=7, Director=5, Manager=3. Use as a filter before sending outreach.

---

### 6. Get Qualified Prospects
**Action:** `get_qualified_prospects` | **Method:** `GET /api/v1/prospects/qualified`

| Input | Type | Required | Description |
|---|---|---|---|
| `since` | ISO-8601 datetime | — | Only return prospects qualified after this time |
| `limit` | integer | — | Max results (default 50, max 200) |

Output:
```json
{
  "prospects": [
    {
      "id": "uuid",
      "company": { "name": "Acme", "domain": "acme.com" },
      "contacts": [],
      "signal": {
        "name": "Hiring Surge",
        "reasoning": "...",
        "data": {}
      },
      "score": 0.9,
      "talking_points": [],
      "qualified_at": "2026-05-14T08:00:00Z"
    }
  ],
  "next_cursor": "2026-05-14T07:55:00Z"
}
```

**Typical use:** Daily schedule trigger → Get Qualified Prospects (since last run) → loop → Enrich Contact → ChampMail sequence.

---

## Template Variable Wiring

Signal outputs pipe into downstream nodes via ChampIQ's expression engine:

```
Run Signal output → next node can reference:
  {{data.fired}}           → boolean
  {{data.reasoning}}       → string (use in ChampMail subject/body)
  {{data.data.job_count}}  → nested signal data
  {{data.fired_at}}        → ISO timestamp

Enrich Company output:
  {{data.talking_points}}  → array — join as a string in ChampMail
  {{data.company.domain}}  → string

Enrich Contact output:
  {{data.contact.email}}        → email address
  {{data.contact.linkedin_url}} → LinkedIn URL
  {{data.score}}                → seniority score (filter with If node)
```

---

## End-to-End Test Scenario

Run this manually before merging:

**Goal:** Discover SaaS companies → check hiring signal → enrich matched contacts → verify signal reasoning flows into a ChampMail draft.

1. Create a new canvas
2. Add: **Manual Trigger** → **Discover Companies** (icp: `"B2B SaaS companies with 50-200 employees"`, location: `"Austin TX"`)
3. Add: **Run Signal** (signal_id: `<any hiring-type signal UUID>`, domain: `{{item.domain}}`) inside a Loop over `{{data.companies}}`
4. Add: **If** node — condition: `{{data.fired}} == true`
5. On true branch: **Enrich Contact** (name: `{{item.name}}`, domain: `{{data.domain}}`)
6. Add: **ChampMail - Start Sequence** — reference `{{data.reasoning}}` in the message body
7. Execute and verify:
   - [ ] Discover returns companies with scores
   - [ ] Run Signal returns `fired: true/false` with reasoning text
   - [ ] Enrich Contact returns an email and seniority score
   - [ ] ChampMail draft includes the signal reasoning text
   - [ ] `GET /api/v1/prospects/qualified` in ChampHarbinger shows the fired company in the queue

---

## What's NOT Done Yet (Future Work)

- **Frontend credential wizard for `champharbinger` type** — The credential can be added manually via the existing "Add credential" UI (type: `champharbinger`, field: `api_key`), but there's no custom wizard with guided fields the way LakeB2B has. Low priority for the initial test — a plain JSON form works.
- **Webhook triggers** — ChampHarbinger can push events (Phase 2, spec'd but not built). Currently pull-only.
- **Outcome sync** — ChampIQ reply/open events don't feed back into ChampHarbinger's outreach records yet.
- **Per-node credential selection** — Nodes currently use `resolve_by_type("champharbinger")` as fallback, so any credential of type `champharbinger` will be picked up automatically. Multi-workspace credential scoping is deferred.

---

## Key Files to Know

```
champiq-canvas/
  manifests/
    champharbinger.manifest.json        ← node definitions (edit here to add/rename nodes)
  apps/api/champiq_api/
    drivers/
      champharbinger.py                 ← HTTP driver (edit here to change API calls)
      base.py                           ← HttpToolDriver base — how all drivers work
    container.py                        ← wire a new driver: add to drivers{} dict
    database.py                         ← Settings class — CHAMPHARBINGER_URL goes here
    main.py                             ← /api/harbinger/health lives here
```

For the ChampHarbinger REST API source:
```
ChampHarbinger/src/app/api/v1/
  signals/route.ts                      ← GET /api/v1/signals
  signals/run/route.ts                  ← POST /api/v1/signals/run
  discover/route.ts                     ← POST /api/v1/discover
  enrich/company/route.ts               ← POST /api/v1/enrich/company
  enrich/contact/route.ts               ← POST /api/v1/enrich/contact
  prospects/qualified/route.ts          ← GET /api/v1/prospects/qualified
ChampHarbinger/src/lib/api/
  validate-api-key.ts                   ← Bearer token auth logic
```
