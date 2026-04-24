# ChampIQ — 10 User-Facing Use Cases
> Generated: April 2026

Each use case is end-to-end executable with the current node set (except UC-4 which requires the Split node).

---

## UC-1: Book Meetings from a Cold List

**User goal:** Turn a raw prospect list into booked meetings automatically.

**How:**
1. Open chat, type: *"Build a workflow that takes a list of cold prospects, sends them an intro email sequence, and pauses the sequence if they reply"*
2. Canvas auto-populates the workflow
3. Click **Run All**

**Workflow:**
```
Manual Trigger
  → ChampGraph (ingest list)
  → Loop
    → Champmail (start_sequence)
  → Webhook Trigger (reply.received)
  → Champmail Reply Classifier
  → If (reply is positive)
    → Champmail (pause_sequence)
```

**Nodes used:** Manual Trigger, ChampGraph, Loop, Champmail, Webhook Trigger, Reply Classifier, If

---

## UC-2: AI-Personalized Emails at Scale

**User goal:** Send 100 emails each with a unique, LLM-written opening line.

**How:**
1. Drag nodes manually or via chat: *"For each prospect, write a personalized opener and send it"*
2. Configure LLM node prompt: *"Write a 1-sentence opener for {{item.name}} at {{item.company}} in {{item.industry}}"*
3. Click Run

**Workflow:**
```
Manual Trigger
  → ChampGraph (search prospects)
  → Loop
    → LLM (personalize opening line)
    → Champmail (send_email — body includes {{llm.output}})
```

**Nodes used:** Manual Trigger, ChampGraph, Loop, LLM, Champmail

---

## UC-3: Fully Automated Daily Outreach (Zero Clicks)

**User goal:** Outreach runs every weekday at 9am without any manual trigger.

**How:**
1. Drag `Cron Trigger` node onto canvas
2. Set cron expression: `0 9 * * 1-5`
3. Connect to existing workflow chain
4. Save — it fires automatically every weekday morning

**Workflow:**
```
Cron Trigger (0 9 * * 1-5)
  → ChampGraph (search new prospects added in last 24h)
  → Loop
    → Champmail (start_sequence)
```

**Nodes used:** Cron Trigger, ChampGraph, Loop, Champmail

---

## UC-4: A/B Test Two Subject Lines

**User goal:** Split prospect list in half, send different subject lines, compare results.

**How:**
1. Chat: *"Split my prospect list in half and send subject line A to one half, subject line B to the other"*
2. Canvas generates the split-branch workflow
3. Run — check the Set node output panel to compare per-variant counts

**Workflow:**
```
Manual Trigger
  → Split (fixed_n: 2)
    → Branch 0: Champmail (sequence variant A)
    → Branch 1: Champmail (sequence variant B)
  → Merge
  → Set (log variant + prospect count)
```

**Nodes used:** Manual Trigger, Split*, Champmail, Merge, Set
> *Requires Split node (P2 in implementation plan)*

---

## UC-5: Smart Prospect Routing by Tier

**User goal:** Enterprise prospects get high-touch sequence, others get standard.

**How:**
1. Drag: `Cron Trigger → ChampGraph → Loop → If → [two Champmail nodes]`
2. Set If condition: `{{item.tier}} == "enterprise"`
3. Connect true branch to enterprise sequence, false to standard
4. Save and run

**Workflow:**
```
Cron Trigger
  → ChampGraph (search new prospects)
  → Loop
    → If ({{item.tier}} == "enterprise")
      → [true]  Champmail (enterprise_sequence)
      → [false] Champmail (standard_sequence)
```

**Nodes used:** Cron Trigger, ChampGraph, Loop, If, Champmail (×2)

---

## UC-6: Keep ChampGraph Synced with External CRM

**User goal:** Pull fresh company data from an external CRM API daily and update the knowledge graph.

**How:**
1. Drag: `Cron Trigger → HTTP → Code → ChampGraph`
2. Configure HTTP node: `GET https://mycrm.com/api/companies` with API key credential
3. Configure Code node with a reshape expression to normalize CRM fields to ChampGraph schema
4. Save — runs daily, ChampGraph stays current

**Workflow:**
```
Cron Trigger (daily)
  → HTTP (GET CRM API — credential: crm_api_key)
  → Code (reshape JSON: extract name, domain, tier, headcount)
  → ChampGraph (ingest updated records)
```

**Nodes used:** Cron Trigger, HTTP, Code, ChampGraph

---

## UC-7: Automated 3-Day Follow-Up

**User goal:** Anyone who didn't reply in 3 days automatically gets a follow-up.

**How:**
1. Build the chain with a Wait node in between
2. After Wait, query ChampGraph for reply status
3. If node routes: no reply → send follow-up, replied → do nothing

**Workflow:**
```
Champmail (send first email)
  → Wait (72 hours)
  → ChampGraph (query: reply_received == false)
  → If (no reply)
    → [true]  Champmail (send follow-up)
    → [false] Set (log "already replied — skip")
```

**Nodes used:** Champmail, Wait, ChampGraph, If, Set

---

## UC-8: Slack Alert When a Node Fails

**User goal:** Get notified in Slack the moment any workflow step breaks.

**How:**
1. Add an HTTP node configured with Slack webhook URL
2. Connect the error/false branch of any If node to the HTTP node
3. Set HTTP body: `{"text": "ChampIQ workflow failed: {{error.message}} on node {{node.label}}"}`
4. Any failure now pings Slack automatically

**Workflow:**
```
[any node] → If (status == error)
  → [true] HTTP (POST Slack webhook — body: {{error.message}})
  → [false] [continues normally]
```

**Nodes used:** If, HTTP (Slack webhook)

---

## UC-9: Parallel Multi-Channel Outreach

**User goal:** Hit prospects on email AND LinkedIn at the same time, then log combined results.

**How:**
1. Chat: *"Send an email and trigger a LinkedIn engagement for each prospect simultaneously, then log the results"*
2. Canvas generates parallel branches after a Split
3. Merge waits for both channels to complete before logging

**Workflow:**
```
Manual Trigger
  → ChampGraph (search prospects)
  → Loop
    → Split (fan_out: 2 channels)
      → Branch 0: Champmail (send_email)
      → Branch 1: LakeB2B Pulse (engage on LinkedIn)
    → Merge (all)
    → Set (log: email_status + linkedin_status per prospect)
```

**Nodes used:** Manual Trigger, ChampGraph, Loop, Split*, Champmail, LakeB2B Pulse, Merge, Set
> *Requires Split node (P2 in implementation plan)*

---

## UC-10: Full Workflow Built Entirely by Chat

**User goal:** User doesn't know how to build anything — chat does it all.

**How:**
1. Open chat panel
2. Type: *"I want to track which LinkedIn posts my prospects engage with and then send them a relevant email about the same topic"*
3. Chat explains the plan and patches canvas
4. User asks: *"What if the LLM call fails?"*
5. Chat adds error-handling If node
6. User types: *"Run this now"*
7. Workflow executes

**Workflow (chat-generated):**
```
LakeB2B Pulse (track engagement — event: post_liked)
  → Set (extract post_topic from {{event.payload}})
  → LLM (write email referencing {{post_topic}} for {{prospect.name}})
  → If (LLM call succeeded)
    → [true]  Champmail (send_email — body: {{llm.output}})
    → [false] HTTP (POST Slack — "LLM failed for {{prospect.name}}")
```

**Nodes used:** LakeB2B Pulse, Set, LLM, If, Champmail, HTTP

---

## Summary Table

| # | Use Case | Trigger Type | Key Nodes | Requires New Node? |
|---|---|---|---|---|
| 1 | Cold list → meetings | Manual + Webhook | ChampGraph, Loop, Champmail, Classifier, If | No |
| 2 | AI-personalized emails | Manual | ChampGraph, Loop, LLM, Champmail | No |
| 3 | Daily automated outreach | Cron | ChampGraph, Loop, Champmail | No |
| 4 | A/B subject line test | Manual | Split, Champmail ×2, Merge, Set | **Yes — Split** |
| 5 | Tier-based routing | Cron | ChampGraph, Loop, If, Champmail ×2 | No |
| 6 | CRM sync to ChampGraph | Cron | HTTP, Code, ChampGraph | No |
| 7 | 3-day follow-up | Manual | Champmail, Wait, ChampGraph, If | No |
| 8 | Slack failure alerts | Any | If, HTTP | No |
| 9 | Parallel email + LinkedIn | Manual | Split, Champmail, LakeB2B, Merge, Set | **Yes — Split** |
| 10 | Full chat-driven workflow | Event | LakeB2B, Set, LLM, If, Champmail, HTTP | No |
