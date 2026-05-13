# B2B Pulse Integration Plan

## What B2B Pulse Is

A **LinkedIn engagement automation platform** hosted at `https://b2b-pulse.up.railway.app`.
Users connect their LinkedIn account, track competitor/prospect pages, and the service
auto-likes and auto-comments on new posts using AI-generated comments.
It is multi-user, org-based, with teams and audit logs.

---

## URL Test Results

| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/health` | GET | **200** | Service is up |
| `/api/auth/linkedin` | GET | **200** | Returns LinkedIn OAuth URL — no auth needed |
| `/api/auth/linkedin/callback` | GET | 200 | OAuth redirect handler |
| `/api/auth/refresh` | POST | 401 | Needs valid refresh_token |
| `/api/auth/me` | GET | 401 | Needs Bearer JWT |
| `/api/users/profile` | GET | 401 | Needs Bearer JWT |
| `/api/tracked-pages` | GET | 401 | Needs Bearer JWT |
| `/api/integrations/status` | GET | 401 | Needs Bearer JWT |
| `/api/integrations/linkedin/auth-url` | GET | 401 | Needs Bearer JWT |
| `/api/automation/settings` | GET | 401 | Needs Bearer JWT |
| `/api/automation/avoid-phrases` | GET | 401 | Needs Bearer JWT |
| `/api/audit` | GET | 401 | Needs Bearer JWT |
| `/api/audit/analytics/summary` | GET | 401 | Needs Bearer JWT |
| `/api/audit/recent-activity` | GET | 401 | Needs Bearer JWT |
| `/api/org/members` | GET | 401 | Needs Bearer JWT |
| `/api/org/teams` | GET | 401 | Needs Bearer JWT |
| `/api/org/invites` | GET | 401 | Needs Bearer JWT |
| `/api/admin/stats` | GET | 401 | Needs Bearer JWT (platform admin) |
| `/api/admin/orgs` | GET | 401 | Needs Bearer JWT (platform admin) |

**Conclusion:** Service is live. All protected endpoints correctly return 401.
Auth entry point is `/api/auth/linkedin` → LinkedIn OAuth → JWT.
The LinkedIn OAuth client_id is `86baxgwuzu15we`, redirect back to `b2b-pulse.up.railway.app`.

---

## Auth Flow

```
User → /api/auth/linkedin → LinkedIn OAuth consent → /api/auth/linkedin/callback
     → { access_token, refresh_token }
     → store JWT in ChampIQ credential
     → all API calls: Authorization: Bearer <access_token>
     → refresh via POST /api/auth/refresh { refresh_token }
```

---

## Integration Phases

### Phase 1 — Backend: URL + Driver fix

**File:** `apps/api/champiq_api/container.py` + `.env`

- Set `LAKEB2B_BASE_URL=https://b2b-pulse.up.railway.app` in `.env`
- Update driver actions to match real API paths:

| Canvas Action | Real Endpoint |
|---|---|
| `track_page` | `POST /api/tracked-pages` — `{url, name, page_type}` |
| `list_tracked_pages` | `GET /api/tracked-pages` |
| `get_page_posts` | `GET /api/tracked-pages/{page_id}/posts` |
| `submit_post` | `POST /api/tracked-pages/{page_id}/submit-post` — `{url}` |
| `poll_now` | `POST /api/tracked-pages/{page_id}/poll-now` |
| `subscribe_page` | `POST /api/tracked-pages/{page_id}/subscribe` — `{auto_like, auto_comment}` |
| `get_analytics` | `GET /api/audit/analytics/summary` |
| `get_recent_activity` | `GET /api/audit/recent-activity` |
| `get_automation_settings` | `GET /api/automation/settings` |
| `update_automation_settings` | `PUT /api/automation/settings` |
| `generate_comment` | `POST /api/automation/generate-comment` — `{post_content, page_tags}` |

---

### Phase 2 — Frontend: Credential form

**File:** `apps/web/src/store/credentialStore.ts`

Current `lakeb2b` credential only has `jwt`. Replace with:

```
- base_url     : B2B Pulse URL (default https://b2b-pulse.up.railway.app)
- access_token : Bearer JWT (from LinkedIn OAuth login)
- refresh_token: For auto-refresh when access_token expires
```

Auth note: JWT comes from LinkedIn OAuth — user must log in to B2B Pulse first,
then copy their access token. A better UX would be an OAuth button in the canvas
(future phase).

---

### Phase 3 — Manifest + Canvas actions

**File:** `manifests/lakeb2b_pulse.manifest.json`

Update actions to match Phase 1 table. Key additions:
- `submit_post` — manually feed a post URL to trigger engagement
- `poll_now` — force-check a tracked page for new posts
- `subscribe_page` — set auto_like / auto_comment per page
- `generate_comment` — preview AI comment for a post (useful before automating)
- `get_analytics` — pull engagement counts into the flow

**File:** `apps/web/src/components/layout/RightPanel.tsx`

Update `ACTION_FIELDS.lakeb2b_pulse` to match new actions with proper input fields.

---

### Phase 4 — Triggers (Polling-based for now)

B2B Pulse has **no outbound webhook registration** in the API.
The `/api/webhooks/whatsapp-link` endpoint receives links *from* WhatsApp — it is inbound only.

**Workaround:** Use a `trigger.cron` node → `list_tracked_pages` → `get_page_posts`
to detect new posts on a schedule (e.g. every 15 min).

**Future:** Add a webhook registration endpoint to B2B Pulse so it can push
`pulse.post.detected` and `pulse.engagement.completed` events to the canvas.

---

## Recommended Execution Order

1. Update `.env` → `LAKEB2B_BASE_URL=https://b2b-pulse.up.railway.app`
2. Rewrite `apps/api/champiq_api/drivers/lakeb2b.py` with correct paths
3. Update `credentialStore.ts` — add `base_url` + `refresh_token` fields
4. Update manifest + `RightPanel.tsx` action fields
5. Test end-to-end with a real JWT from B2B Pulse login
6. (Later) Add OAuth button flow in canvas for one-click LinkedIn connect
