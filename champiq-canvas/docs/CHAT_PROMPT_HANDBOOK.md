# ChampIQ — Chat-Console Prompt Handbook

> 30 production-ready prompts for the chat console, organized by tool node. Pick the closest use case, copy-paste, replace placeholders, send.

**Read [HANDBOOK.md § Part 8](HANDBOOK.md#part-8--the-chat-console) first** if you haven't seen the chat console before. Read [PRODUCT.md](PRODUCT.md) for the vocabulary used here (what `csv.upload` is, what an "action" is, what the credential names are).

---

## How to use these prompts

1. **Pick the closest use case** to what you want.
2. **Copy the prompt verbatim** into the chat console (in the canvas UI, the chat panel on the left).
3. **Replace placeholders in `< >`** with your real data before sending.
4. **Save the workflow** the chat generates. The runtime validates at save time — invalid shapes return `400` with a clear remediation message.
5. If the chat output is wrong, **paste the validator's error back into the chat as your next message** — the LLM corrects itself.

### Universal rules baked into every prompt

- One trigger per workflow.
- `{{ trigger.payload.X }}` outside loops, `{{ item.X }}` inside.
- For CSV data, use `csv.upload` (a data-source node), never a second trigger.
- Pin the credential name explicitly so the LLM doesn't invent one.

### When you want professional-grade email/call bodies

For any prompt below, append this block:

```
Body specs:
  Length: 70-90 words
  Tone: <peer/exec/casual/formal>
  Banned phrases: "I hope this finds you well", "circling back", "just checking in"
  Hook: <one-line opener tied to a real specific signal>
  CTA: <exact ask, e.g. "15 min next Wed at 11am ET?">
  Sender persona: <name + role + company>
```

Five lines doubles output quality. The LLM stops generating SDR clichés.

---

## 1. ChampMail — 10 use cases

ChampMail handles email send, prospects, templates, sequences, and analytics. Available actions: `add_prospect`, `get_prospect`, `list_prospects`, `list_templates`, `get_template`, `create_template`, `preview_template`, `list_sequences`, `create_sequence`, `add_sequence_step`, `enroll_sequence` / `start_sequence`, `pause_sequence`, `resume_sequence`, `send_single_email`, `get_analytics`.

### M1 — Single personalized email, manual trigger

```
Build trigger.manual → csv.upload → loop concurrency 5 → champmail send_single_email
(credential champmail-admin). CSV row shape: {email, first_name, company}.
Subject: "{{ item.first_name }} — quick question about {{ item.company }}".
Body: 60-word cold email pitching <product> with one CTA: "15 min next Tuesday?".
Use csv.upload, not trigger.manual items. One trigger only.
```

### M2 — Cron-scheduled blast (every Monday 9am)

```
Build trigger.cron "0 9 * * 1" UTC → csv.upload (rows: <paste CSV here>) →
loop concurrency 4 → champmail send_single_email (credential champmail-admin).
Each tick produces a unique subject using {{ execution_id }}. Body 80 words,
professional tone, one CTA. One trigger only.
```

### M3 — Reply-triggered nurture pause + thank-you

```
Build trigger.event { event: "email.replied", source: "champmail" } →
champmail_reply (credential champmail-admin). On "positive" branch: champmail
pause_sequence then champmail send_single_email (credential champmail-admin)
with a brief "thanks, I'll follow up shortly" reply. On "negative"/"other"
branches: champmail pause_sequence only.
```

### M4 — Sequence enrollment from CSV

```
Build trigger.manual → csv.upload (rows: {email, first_name}) →
loop concurrency 3 → champmail add_prospect (credential champmail-admin) →
champmail enroll_sequence (credential champmail-admin) with sequence_name
"<my-sequence>". Use {{ item.email }} for prospect_email. One trigger only.
```

### M5 — Daily analytics digest to Slack

```
Build trigger.cron "0 17 * * 1-5" UTC → champmail get_analytics
(credential champmail-admin) with sequence_id <id> → http POST
to Slack webhook URL <url> with body that summarizes
{{ prev.data.sends_total }} sends, {{ prev.data.opens }} opens,
{{ prev.data.replies }} replies. One trigger only.
```

### M6 — Bulk add prospects from a CSV without sending

```
Build trigger.manual → csv.upload (rows have email, first_name, last_name,
company, title) → loop concurrency 5 → champmail add_prospect
(credential champmail-admin). Pass each row's fields as inputs. One trigger only.
```

### M7 — Webhook-triggered welcome email (form submission)

```
Build trigger.webhook with path "/hooks/new-signup" →
champmail send_single_email (credential champmail-admin) with email
{{ trigger.payload.email }}, first_name {{ trigger.payload.first_name }},
subject "Welcome to <product>", body 50-word welcome with one
"Get started here" link to <url>.
```

### M8 — A/B test two subject lines

```
Build trigger.manual → csv.upload (rows: email, first_name) →
split mode "fixed_n" n 2 items "{{ prev.items }}" →
branch_0 → champmail send_single_email (credential champmail-admin) subject A:
"{{ item.first_name }}, quick idea" body <body A>;
branch_1 → champmail send_single_email (credential champmail-admin) subject B:
"{{ item.first_name }} — saw your post on <topic>" body <body B>.
After both: merge mode all → champmail get_analytics. One trigger only.
```

### M9 — Re-engagement of cold prospects

```
Build trigger.cron "0 10 * * 1" UTC → champmail list_prospects
(credential champmail-admin) with status "cold" → loop "{{ prev.data.prospects }}"
concurrency 3 → champmail send_single_email (credential champmail-admin)
to {{ item.email }}, subject "{{ item.first_name }}, still interested?",
body 50-word soft re-engagement with one CTA. One trigger only.
```

### M10 — Send + log to ChampGraph for memory

```
Build trigger.manual → csv.upload (one row {email, first_name}) →
loop concurrency 1 → champmail send_single_email (credential champmail-admin)
with a 60-word custom pitch → champgraph hook_email logging the same email
content under account_name {{ item.company | default('default') }}
so the next interaction has context. One trigger only.
```

---

## 2. ChampGraph — 10 use cases

ChampGraph dispatches to either local Postgres (`PROSPECT_ACTIONS`: `create_prospect`, `list_prospects`, `get_prospect_status`, `bulk_import`, `enrich_prospect`) or to the Graphiti VPS (`GRAPH_ACTIONS` + `CAMPAIGN_ACTIONS`: `research_prospects`, `campaign_essence`, `campaign_segment`, `campaign_pitch`, `campaign_personalize`, `campaign_html`, `campaign_preview`, `account_briefing`, `account_contacts`, `intelligence_*`, `hook_email`, `ingest_episode`, `sync_status`, etc.).

### G1 — Research a single prospect (Perplexity-backed)

```
Build trigger.manual → csv.upload (one row {email, first_name, last_name,
title, company}) → loop concurrency 1 → champgraph research_prospects
with inputs {email, first_name, last_name, title, company}. Output goes to a
set node that captures prev.data.asset.summary. One trigger only.
```

### G2 — Research a CSV of prospects in parallel

```
Build trigger.manual → csv.upload (rows: email, first_name, last_name,
title, company, linkedin_url, country) → loop concurrency 4 →
champgraph research_prospects passing all item fields as inputs. One trigger only.
```

### G3 — Full campaign pipeline for one account

```
Build trigger.manual → champgraph campaign_essence inputs {our_product_pitch,
target_outcome} → champgraph campaign_segment → champgraph campaign_pitch →
champgraph campaign_personalize → champgraph campaign_html. Pass the previous
asset into the next stage's inputs as <stage>_asset. One trigger only.
```

### G4 — Account briefing before a sales call

```
Build trigger.manual → champgraph account_briefing with inputs
{account_name: "<Company>"}. The output should contain summary, key contacts,
recent communications, and intelligence notes. One trigger only.
```

### G5 — Stakeholder map for a target account

```
Build trigger.manual → champgraph intelligence_stakeholder_map with inputs
{account_name: "<Company>"}. Output to a set node that exposes
{ stakeholders: prev.data.stakeholders, decision_makers: prev.data.decision_makers }.
One trigger only.
```

### G6 — Cron-driven account graph sync

```
Build trigger.cron "0 */6 * * *" UTC → champgraph sync_account with inputs
{account_name: "<Company>", since: "{{ trigger.payload.trigger_id }}"}.
One trigger only. Run on every workflow active.
```

### G7 — Engagement-gap analysis on a CSV of accounts

```
Build trigger.manual → csv.upload (rows: account_name) → loop concurrency 3
→ champgraph intelligence_engagement_gaps with inputs {account_name:
"{{ item.account_name }}"} → set node capturing gaps array. One trigger only.
```

### G8 — Ingest an external email thread

```
Build trigger.webhook path "/hooks/email-ingest" → champgraph ingest_episode
with inputs {account_name: "{{ trigger.payload.account }}",
content: "{{ trigger.payload.body }}", source: "{{ trigger.payload.source }}"}.
One trigger only.
```

### G9 — Pre-call research → drop into Slack

```
Build trigger.manual → csv.upload (one row: account_name) →
champgraph account_briefing inputs {account_name: "{{ prev.items.0.account_name }}"}
→ http POST to Slack webhook "<url>" with body {{ prev.data.summary }}.
One trigger only.
```

### G10 — Prospect enrichment from minimal CSV

```
Build trigger.manual → csv.upload (rows: email only) → loop concurrency 4
→ champgraph enrich_prospect inputs {email: "{{ item.email }}"} →
champmail add_prospect (credential champmail-admin) using the enriched
{first_name, last_name, company, title} from prev.data. One trigger only.
```

---

## 3. ChampVoice — 10 use cases

ChampVoice calls ElevenLabs Conversational AI. Actions: `initiate_call`, `get_call_status`, `list_calls`. (`cancel_call` is unsupported by the upstream API.) Required credential: `champvoice` with `elevenlabs_api_key`, `agent_id`, `phone_number_id`.

### V1 — Single outbound call to one prospect

```
Build trigger.manual → champvoice initiate_call (credential champvoice-cred)
with inputs {to_number: "<+1...>", lead_name: "<Name>", email: "<email>"}.
One trigger only.
```

### V2 — Bulk dial from a CSV

```
Build trigger.manual → csv.upload (rows: phone, first_name, email, company)
→ loop concurrency 1 → champvoice initiate_call (credential champvoice-cred)
with inputs {to_number: "{{ item.phone }}", lead_name: "{{ item.first_name }}",
email: "{{ item.email }}", company: "{{ item.company }}"}. One trigger only.
```

### V3 — Call after CSV upload, pace 60 seconds between dials

```
Build trigger.manual → csv.upload → loop mode "paced" pace_seconds 60
concurrency 1 → champvoice initiate_call (credential champvoice-cred)
with inputs from each item. Avoids burst-dialing into telco rate limits.
One trigger only.
```

### V4 — Call after a prospect replies positively

```
Build trigger.event event "email.replied" source "champmail" →
champmail_reply (credential champmail-admin). On "positive" branch:
champvoice initiate_call (credential champvoice-cred) inputs
{to_number: "{{ trigger.payload.phone }}",
lead_name: "{{ trigger.payload.first_name }}",
email: "{{ trigger.payload.email }}"}.
```

### V5 — Cron-scheduled morning call queue

```
Build trigger.cron "0 9 * * 1-5" UTC → csv.upload (rows: phone, first_name,
email) → loop mode "paced" pace_seconds 90 concurrency 1 → champvoice
initiate_call (credential champvoice-cred) per item. Calls fire weekdays 9am
with 90s gap between each. One trigger only.
```

### V6 — Webhook from CRM kicks off a call

```
Build trigger.webhook path "/hooks/new-hot-lead" → champvoice initiate_call
(credential champvoice-cred) with inputs {to_number:
"{{ trigger.payload.phone }}", lead_name: "{{ trigger.payload.first_name }}",
email: "{{ trigger.payload.email }}"}. One trigger only.
```

### V7 — Call → log into ChampGraph

```
Build trigger.manual → champvoice initiate_call (credential champvoice-cred)
with hardcoded inputs → champgraph hook_call inputs {account_name:
"<Company>", call_id: "{{ prev.data.conversation_id }}",
notes: "Initiated by ChampIQ workflow"}. One trigger only.
```

### V8 — Call status polling

```
Build trigger.manual → champvoice get_call_status (credential champvoice-cred)
inputs {conversation_id: "<id>"} → set node exposing prev.data.status.
One trigger only.
```

### V9 — Call all prospects who opened but didn't reply

```
Build trigger.cron "0 14 * * 1-5" UTC → champmail list_prospects
(credential champmail-admin) with status "opened" → loop "{{ prev.data.prospects }}"
mode "paced" pace_seconds 60 concurrency 1 → champvoice initiate_call
(credential champvoice-cred) inputs {to_number: "{{ item.phone }}",
lead_name: "{{ item.first_name }}", email: "{{ item.email }}"}. One trigger only.
```

### V10 — Call + send follow-up email immediately after

```
Build trigger.manual → champvoice initiate_call (credential champvoice-cred)
with inputs {to_number: "<+1...>", lead_name: "<Name>", email: "<email>"} →
wait seconds 60 → champmail send_single_email (credential champmail-admin)
to "<email>", subject "Quick recap from our call",
body "Hi <Name>, thanks for the conversation — here's the link we discussed: <url>".
One trigger only.
```

---

## Tips for prompt-engineering quality

The same prompt template gives wildly different output depending on how concrete you are.

### Bad — vague (generic clichéd output)

> Send a personalized email about our discount.

### Good — specific (workable output)

> Build trigger.manual → csv.upload (one row: hemang.k@championsmail.com,
> Hemang) → loop concurrency 1 → champmail send_single_email (credential
> champmail-admin). Body should be a 3-paragraph cold email pitching ChampIQ's
> B2B CEO-Level Data dataset (verified emails + LinkedIn URLs + company tech
> stack for 250k+ US/UK CEOs, refreshed monthly, $2/contact bulk price,
> currently 50% off launch promo through May 15). Tone: confident, no fluff,
> no "hope this finds you well", no "circling back". 75 words max. Open with
> a one-line hook tied to a Champions Group pain (they're a B2B data company,
> so the hook should be self-aware about us pitching data to a data company).
> End with: "15 min next Tuesday or Wednesday at 11am ET?". Subject must
> include {{ execution_id }} and reference the 50% off. Use {{ item.first_name }}
> for the greeting. One trigger only. Use csv.upload, not trigger.manual.

The second prompt produces something that reads like a real SDR wrote it. The first produces ChatGPT-flavored mush.

### Phrases the LLM responds well to

- **"Use csv.upload, not trigger.manual"** — locks the data-source choice.
- **"One trigger only"** — belt-and-suspenders against the two-triggers bug.
- **"Subject must include {{ execution_id }}"** — guarantees per-tick uniqueness.
- **"Pin credential name as <…>"** — stops the LLM from inventing names.
- **"Tone: <…>. Banned phrases: <…>. Length: <N> words."** — three lines that fix 80% of body-quality issues.

### Phrases to avoid

- "Use a trigger to upload CSV" — invites the bad two-trigger pattern.
- "Schedule emails" without specifying cron — LLM may pick sequences instead.
- "Personalized email" without specifics — produces generic openers.

---

## When the workflow doesn't save

If the API rejects with `400`, paste the error message back into the chat and say "fix this". The validator's messages are written to be self-correcting:

> `workflow has multiple trigger nodes (2: ['t1', 't2']). A workflow may have at most one trigger. Use a regular data-source node (e.g. csv.upload) instead of a second trigger.`

→ The LLM reads this and re-emits the workflow with `csv.upload` instead of the second trigger. Usually one round-trip is enough.
