# Railway Deploy Guide

One-page guide for shipping ChampIQ Canvas to Railway. The Dockerfile,
`start.sh`, and `railway.toml` already do the heavy lifting — this file is
about what *you* set in the Railway dashboard.

For the historical war stories that produced the current setup, see
[`RAILWAY_DEPLOYMENT_NOTES.md`](./RAILWAY_DEPLOYMENT_NOTES.md).

---

## Architecture on Railway

```
[ Railway service: champiq-canvas ]   ← single Docker container, this repo
        │
        ├── Postgres plugin            ← DATABASE_URL injected by Railway
        ├── Redis plugin               ← REDIS_URL injected by Railway
        │
        ├── (external) OpenRouter      ← LLM provider, paid
        ├── (external) Emelia          ← email transport for ChampMail Inline
        └── (external) Graphiti        ← knowledge graph + AI campaign pipeline
                                           Hosted separately (BlueOcean VPS or
                                           a second Railway service from
                                           https://github.com/developer00777/Cham_Graph)
```

**One container** runs the FastAPI API + serves the pre-built Vite SPA from
`/app/web`. Frontend calls `/api/*` same-origin so no extra CORS config needed.

---

## 1. Spin up the dependencies (Railway plugins)

In the Railway project:
1. **Add Service → Database → PostgreSQL** — Railway injects `DATABASE_URL`
   into your service. Plain `postgresql://` scheme — gets auto-rewritten to
   `postgresql+asyncpg://` inside the app.
2. **Add Service → Database → Redis** — Railway injects `REDIS_URL`.

That's it for plugins. No volumes to configure; Railway handles persistence.

---

## 2. Deploy the app

1. **Add Service → GitHub Repo** → pick `champiq-canvas`
2. Railway detects `railway.toml` and uses the root `Dockerfile`
3. Set env vars (next section)
4. Deploy

Healthcheck path is `/health`. Healthcheck timeout is 300 s (in
`railway.toml`) to absorb the alembic-migrations-on-boot step.

---

## 3. Required env vars

Set these in **Service → Variables**:

### Core (everything breaks without these)

| Variable | What | Example |
|---|---|---|
| `DATABASE_URL` | Auto-injected by the Postgres plugin | `postgresql://...` |
| `REDIS_URL` | Auto-injected by the Redis plugin | `redis://...` |
| `FERNET_KEY` | Symmetric encryption for stored credentials | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `OPENROUTER_API_KEY` | LLM provider for chat + canvas LLM nodes | `sk-or-v1-...` |
| `PUBLIC_BASE_URL` | Your Railway URL — used for unsubscribe links in emails | `https://champiq-production.up.railway.app` |

### ChampMail Inline (Emelia transport)

| Variable | What | Notes |
|---|---|---|
| `EMELIA_API_KEY` | Emelia GraphQL API key | Empty = `StubTransport` (sends fail with stub_*) |
| `EMELIA_DEFAULT_SENDER_IDS` | Comma-separated provider `_id`s from `{ providers { _id } }` | Pick the inboxes you want round-robin'd |
| `EMELIA_WEBHOOK_SECRET` | HMAC-SHA256 secret for `X-Emelia-Signature` verification | Empty = signature checking disabled (dev only) |
| `EMELIA_DEFAULT_FROM_EMAIL` | Optional fallback `from` address | |
| `EMELIA_DEFAULT_FROM_NAME` | Optional fallback `from` name | Default: `ChampIQ` |
| `CHAMPMAIL_UNSUBSCRIBE_SECRET` | Signs unsubscribe tokens | Defaults to `FERNET_KEY` if empty |

**Webhook URL to register in Emelia after deploy:**
`<PUBLIC_BASE_URL>/api/champmail/webhooks/emelia`
Subscribe to: `email.sent, email.opened, email.clicked, email.replied, email.bounced, email.unsubscribed`

### ChampGraph (Graphiti — graph + AI campaign pipeline)

| Variable | What | Notes |
|---|---|---|
| `CHAMPGRAPH_URL` | Public URL of your Graphiti deployment | Empty = graph + campaign actions return `{"available": false, ...}` instead of crashing. **Prospect actions still work locally.** |
| `CHAMPGRAPH_API_KEY` | `X-API-Key` header for Graphiti | Optional (Graphiti's auth is optional too) |

### Other tools (legacy; mostly ignored on Railway)

| Variable | What | Notes |
|---|---|---|
| `CHAMPSERVER_EMAIL` / `CHAMPSERVER_PASSWORD` | Legacy ChampServer JWT login | Only used by the LakeB2B / ChampVoice adapters. Safe to leave empty. |
| `OPENROUTER_BASE_URL` | Default `https://openrouter.ai/api/v1` | Override for self-hosted gateways |
| `OPENROUTER_MODEL` | Default LLM model | e.g. `openai/gpt-4.1-mini` |
| `CORS_ORIGINS` | Extra comma-separated origins to allow | `.railway.app` is already covered by regex |

---

## 4. Post-deploy verification

After the deploy is green, test from your shell:

```bash
RW=https://your-service.up.railway.app

# 1. Liveness
curl -sf $RW/health
# → {"status":"ok"}

# 2. Frontend served
curl -s $RW/ | grep -o '<title>[^<]*</title>'
# → <title>web</title>

# 3. ChampMail (works without Emelia)
curl -sf $RW/api/champmail/prospects | head -c 200
# → {"items":[],"total":0,...}

# 4. ChampGraph prospect-CRUD (always-local)
curl -sS -X POST $RW/api/tools/champgraph/list_prospects \
  -H 'Content-Type: application/json' -d '{"inputs":{}}'
# → {"job_id":"...","accepted":true,"async":true}

# 5. ChampGraph graph action (degrades when CHAMPGRAPH_URL unset)
curl -sS -X POST $RW/api/tools/champgraph/account_briefing \
  -H 'Content-Type: application/json' -d '{"inputs":{"account_name":"acme"}}'
# Expected without CHAMPGRAPH_URL:
# → result: {"available": false, "reason": "champgraph: Graphiti URL not configured..."}
```

If `/health` returns 200 but `/api/...` returns 502, check **Logs** in
Railway for migration errors — the most common culprit is a stale migration
revision after a schema change.

---

## 5. Adding Graphiti later

ChampIQ doesn't need Graphiti to deploy. Once you have it running:

1. Deploy `Cham_Graph` (https://github.com/developer00777/Cham_Graph) — it
   has its own `Dockerfile` + `railway.toml` + Neo4j docker-compose. Same
   pattern: add Postgres-style plugin (Neo4j Aura or self-host), set
   `OPENAI_API_KEY` and `NEO4J_*` env, deploy.
2. Once it's up, get its public URL.
3. In ChampIQ's Railway service:
   ```
   CHAMPGRAPH_URL=https://<graphiti-railway-url>
   CHAMPGRAPH_API_KEY=<the X-API-Key you set on Graphiti>
   ```
4. Within 60 s of saving (the reachability probe is cached 60 s), graph +
   campaign actions start flowing through. No ChampIQ redeploy needed.

---

## 6. Common runtime issues

| Symptom | Cause | Fix |
|---|---|---|
| `relation "..." does not exist` | Migrations didn't run | Check `start.sh` is the `CMD`. Pre-deploy command must be empty. |
| `ModuleNotFoundError: psycopg2` | Postgres URL not rewritten | Should never happen — `_asyncpg_url()` covers `postgresql://` and `postgres://`. If you're using a different scheme, file a bug. |
| `Healthcheck timeout` on first deploy | Migrations took > 5 min | Bump `healthcheckTimeout` in `railway.toml`. |
| Emelia send fails with `Authentication required` | `EMELIA_API_KEY` wrong or revoked | Update credential or env var, redeploy. |
| ChampGraph graph action returns `{available: false}` | `CHAMPGRAPH_URL` unset or wrong | Set it; probe re-checks every 60 s. |
| Pre-deploy hangs forever | `start.sh` set as pre-deploy by mistake | Pre-deploy must be a finite command — clear it. |

---

## 7. Don't do these

- **Don't `--no-verify` Git hooks** when committing migrations (we run alembic on boot — bad migrations brick boot).
- **Don't set `startCommand` in `railway.toml`** — let the Dockerfile `CMD` win. We tried fighting that before; see Notes #5–7.
- **Don't expose the Postgres or Redis plugin URLs externally.** Railway plugins are private-network by default. Keep them that way.
- **Don't bake `EMELIA_API_KEY` into the image.** It's runtime-only — Railway env var.
- **Don't disable secret-scanning push protection** on this repo. We ran into it on the Graphiti repo, but on this repo there's no leaked secret to bypass.

---

*Last updated: 2026-04-29 — adds Emelia, ChampGraph (Graphiti), public-base-url, and the post-deploy verification block.*
