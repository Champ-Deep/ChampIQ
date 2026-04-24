# ChampIQ Voice Gateway — Final SOLID Architecture

## The Problem We're Solving

The current system is a **React UI + Express backend** tightly coupled to a single call flow. You want:

1. A **headless CLI service** — no browser required, fully programmable
2. A **credential gateway** — configure ElevenLabs or other providers once, use everywhere
3. A **ChampIQ Canvas connector** — plug into flows, nodes, pipelines
4. A **ChampGraph memory layer** — every call's full context (transcript, timestamps, metadata) persists as a graph node, enabling cross-call continuity and flow synchronization

---

## Architecture: `champiq-voice-gateway`

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         CHAMPIQ VOICE GATEWAY                                   │
│                    Contained Node.js / TypeScript Service                        │
├────────────────────────┬────────────────────────┬───────────────────────────────┤
│   CLI Layer            │   HTTP Gateway Layer   │   Event/Webhook Layer         │
│   (commander)          │   (Express REST API)   │   (Express POST /webhook)     │
│                        │                        │                               │
│ $ champiq-voice call   │ POST /v1/calls         │ POST /v1/webhook              │
│ $ champiq-voice config │ GET  /v1/calls/:id     │   ← ElevenLabs fires this    │
│ $ champiq-voice status │ GET  /v1/calls         │   → ChampGraph updated        │
│ $ champiq-voice logs   │ DELETE /v1/calls/:id   │   → Canvas notified           │
│ $ champiq-voice serve  │ GET  /v1/health        │                               │
└────────────┬───────────┴────────────┬───────────┴──────────────┬────────────────┘
             │                        │                            │
             ▼                        ▼                            ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                           CORE ENGINE LAYER                                     │
├──────────────────────┬─────────────────────────┬──────────────────────────────┤
│  ProviderRegistry    │   CallOrchestrator       │   WebhookProcessor            │
│                      │                          │                               │
│ - ElevenLabsProvider │ - initiateCall()         │ - verifyHMAC()               │
│ - [future: Bland]    │ - getCallStatus()        │ - parsePayload()             │
│ - [future: Vapi]     │ - cancelCall()           │ - routeToProcessor()         │
│                      │ - listCalls()            │ - emitToCanvas()             │
│ Interface:           │                          │                               │
│ initiateCall(params) │ Uses configured          │ Fires canvas_event on        │
│ getTranscript(id)    │ provider from registry   │ completion                   │
│ cancelCall(id)       │                          │                               │
└──────────────────────┴──────────────────┬────────┴──────────────────────────────┘
                                           │
                                           ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                            CHAMPGRAPH LAYER                                       │
│                   (Persistent call memory + context graph)                        │
├─────────────────────────────┬──────────────────────────────────────────────────┤
│  CallNode                   │  ChampGraph (Redis/JSON store)                    │
│                             │                                                    │
│  {                          │  Key: champgraph:call:{callId}                    │
│    callId: string           │  Key: champgraph:conv:{conversationId}            │
│    nodeId: string           │  Key: champgraph:contact:{phone}                  │
│    flowId: string           │  Key: champgraph:flow:{flowId}:calls (sorted set) │
│    contactId: string        │  Key: champgraph:agent:{agentId}:calls            │
│    agentId: string          │                                                    │
│    provider: string         │  Graph edges (sorted sets with score=timestamp):  │
│    status: CallStatus       │  - contact→calls (all calls to a number)          │
│    timestamps: {            │  - flow→calls (all calls in a flow)               │
│      initiated: ISO         │  - agent→calls (all calls by an agent)            │
│      connected: ISO         │                                                    │
│      completed: ISO         │  TTL: configurable (default 30 days)              │
│    }                        │                                                    │
│    transcript: Message[]    │  Graph traversal: getContactHistory(phone)        │
│    metadata: Record<string> │                  getFlowCalls(flowId)             │
│    prevCallId?: string      │                  getAgentCalls(agentId)           │
│    nextCallId?: string      │                                                    │
│    canvasNodeId?: string    │                                                    │
│    canvasFlowId?: string    │                                                    │
│    summary?: string         │  ← LLM-generated call summary stored here         │
│  }                          │                                                    │
└─────────────────────────────┴────────────────────────────────────────────────────┘
                                           │
                                           ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                        CANVAS SYNC LAYER                                          │
│              (ChampIQ Canvas webhook emitter + event bus)                         │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│  CanvasEmitter.emit(event: CanvasEvent)                                           │
│    - POST to configured CANVAS_WEBHOOK_URL                                        │
│    - Signs payload with CANVAS_WEBHOOK_SECRET (HMAC-SHA256)                      │
│    - Retries with exponential backoff (3x)                                        │
│    - Stores emission log in champgraph                                             │
│                                                                                    │
│  CanvasEvent shape:                                                                │
│  {                                                                                 │
│    event: 'call.initiated' | 'call.completed' | 'call.failed' | 'transcript.ready'│
│    callId: string                                                                  │
│    flowId?: string                                                                 │
│    nodeId?: string                                                                 │
│    timestamp: ISO                                                                  │
│    payload: CallNode                  ← full context attached                     │
│    prevContext?: CallNode             ← previous call context if chain            │
│  }                                                                                 │
│                                                                                    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
champiq-voice-gateway/
├── src/
│   ├── cli/
│   │   ├── index.ts              ← commander entry: $ champiq-voice <cmd>
│   │   ├── commands/
│   │   │   ├── call.ts           ← champiq-voice call <phone> [options]
│   │   │   ├── config.ts         ← champiq-voice config set/get/list
│   │   │   ├── status.ts         ← champiq-voice status <callId>
│   │   │   ├── logs.ts           ← champiq-voice logs [callId|--flow|--contact]
│   │   │   └── serve.ts          ← champiq-voice serve (starts HTTP + webhook server)
│   │   └── formatters/
│   │       ├── table.ts          ← ASCII table for call list
│   │       └── transcript.ts     ← Pretty-print transcript to terminal
│   │
│   ├── providers/
│   │   ├── types.ts              ← IVoiceProvider interface
│   │   ├── registry.ts           ← ProviderRegistry (multi-provider support)
│   │   └── elevenlabs/
│   │       ├── client.ts         ← ElevenLabs API calls
│   │       ├── webhook.ts        ← ElevenLabs webhook payload parser
│   │       └── types.ts          ← ElevenLabs-specific types
│   │
│   ├── orchestrator/
│   │   └── CallOrchestrator.ts   ← Core business logic: initiate, track, cancel
│   │
│   ├── graph/
│   │   ├── ChampGraph.ts         ← Redis graph layer: read/write CallNodes
│   │   ├── types.ts              ← CallNode, ContactHistory, FlowContext types
│   │   └── queries.ts            ← Graph traversal helpers
│   │
│   ├── canvas/
│   │   ├── CanvasEmitter.ts      ← Outbound webhook to ChampIQ Canvas
│   │   └── types.ts              ← CanvasEvent types
│   │
│   ├── server/
│   │   ├── app.ts                ← Express app factory
│   │   ├── routes/
│   │   │   ├── calls.ts          ← /v1/calls CRUD routes
│   │   │   ├── webhook.ts        ← /v1/webhook inbound route
│   │   │   └── health.ts         ← /v1/health
│   │   └── middleware/
│   │       ├── auth.ts           ← API key auth for gateway routes
│   │       └── validate.ts       ← Zod request validation
│   │
│   ├── config/
│   │   ├── ConfigStore.ts        ← Read/write ~/.champiq/config.json
│   │   └── schema.ts             ← Zod schema for config validation
│   │
│   └── index.ts                  ← Library entry (when used as SDK, not CLI)
│
├── bin/
│   └── champiq-voice.ts          ← CLI shebang entry point
│
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Key Interfaces

### `IVoiceProvider` (the provider contract)
```typescript
interface IVoiceProvider {
  name: string;                         // 'elevenlabs' | 'bland' | 'vapi'
  initiateCall(params: CallParams): Promise<ProviderCallResult>;
  getTranscript(conversationId: string): Promise<Message[]>;
  cancelCall(conversationId: string): Promise<void>;
  parseWebhook(body: unknown, signature: string): WebhookPayload;
}
```

### `CallNode` (the ChampGraph node — the core memory unit)
```typescript
interface CallNode {
  // Identity
  callId: string;                       // champiq-generated UUID
  conversationId: string;               // provider conversation ID

  // Graph linkage
  contactId: string;                    // normalized phone number
  flowId?: string;                      // ChampIQ Canvas flow ID
  canvasNodeId?: string;                // specific node in the flow
  prevCallId?: string;                  // previous call in a chain
  nextCallId?: string;                  // set retroactively when next call is made

  // Call metadata
  provider: string;
  agentId: string;
  toNumber: string;
  leadName: string;
  company: string;
  email: string;
  script?: string;
  dynamicVars: Record<string, string>;  // arbitrary custom vars passed to agent

  // Temporal state
  status: CallStatus;
  timestamps: {
    created: string;                    // ISO: when call was initiated
    connected?: string;                 // ISO: when call was answered
    completed?: string;                 // ISO: when call ended
  };

  // Content
  transcript: Message[];
  summary?: string;                     // LLM-generated summary (optional)
  outcome?: 'qualified' | 'not_qualified' | 'callback' | 'voicemail' | 'no_answer';

  // Canvas sync
  canvasSynced: boolean;
  canvasEventsSent: CanvasEventType[];
}
```

### CLI Commands

```bash
# Configure credentials (stored in ~/.champiq/config.json)
champiq-voice config set elevenlabs.api_key <KEY>
champiq-voice config set elevenlabs.agent_id <AGENT_ID>
champiq-voice config set elevenlabs.phone_number_id <PHONE_ID>
champiq-voice config set canvas.webhook_url https://your-canvas.champiq.ai/hooks
champiq-voice config set canvas.webhook_secret <SECRET>
champiq-voice config set redis.url redis://localhost:6379
champiq-voice config list

# Initiate a call
champiq-voice call +15551234567 \
  --name "John Smith" \
  --company "Acme Corp" \
  --email "john@acme.com" \
  --flow-id flow_abc123 \           # optional: links call to ChampIQ flow
  --node-id node_xyz789 \           # optional: links call to specific canvas node
  --var "discount=20%" \            # arbitrary dynamic vars
  --wait                            # wait for transcript (blocks until webhook)

# Check status
champiq-voice status call_abc123

# View transcript
champiq-voice logs call_abc123

# View all calls for a contact
champiq-voice logs --contact +15551234567

# View all calls in a flow
champiq-voice logs --flow flow_abc123

# Start the HTTP gateway server (for Canvas/flows to POST to)
champiq-voice serve --port 3001

# Use a specific provider config (override config file)
champiq-voice call +1555... --provider elevenlabs --agent-id <override>
```

---

## ChampGraph — How Context Flows Across Calls

The key innovation. Every call is a **node** in a linked list, per contact:

```
Contact: +15551234567
  │
  ├── Call 1 (2026-04-20)  status=completed, outcome=callback
  │     transcript: "Interested, call back Thursday"
  │     summary: "Prospect showed interest, requested callback on 4/23"
  │     nextCallId → call_2
  │
  ├── Call 2 (2026-04-23)  status=in_progress  ← CURRENT
  │     prevCallId → call_1
  │     dynamicVars includes: { prev_summary: "...", prev_outcome: "callback" }
  │
  └── (future calls...)
```

When a new call is made to a phone number that has prior calls, the orchestrator:
1. Queries `champgraph:contact:{phone}` sorted set to get prior call history
2. Loads the most recent completed `CallNode` with its transcript + summary
3. Injects `prev_summary`, `prev_outcome`, `prev_call_date` into `dynamic_variables`
4. Links `prevCallId` on the new node and `nextCallId` on the prior node
5. The ElevenLabs agent receives prior context and can reference it naturally

This is the **memory persistence** that enables true continuity.

---

## Canvas Sync Flow

When a call completes (webhook received), the gateway:

```
ElevenLabs webhook → /v1/webhook
  → verify HMAC signature
  → parse payload
  → update CallNode in ChampGraph (transcript + final status)
  → generate summary (optional: call LLM)
  → CanvasEmitter.emit('call.completed', { callNode, prevContext })
      → POST https://canvas.champiq.ai/hooks
          body: { event, callId, flowId, nodeId, timestamp, payload: callNode, prevContext }
          headers: X-Champiq-Signature: hmac(payload)
      → retry up to 3x on failure
      → log emission in champgraph
  → update prevCall.nextCallId = callId
  → (optional) summarize transcript with LLM → store summary
```

Canvas receives the full `CallNode` including transcript, timestamps, outcome, and previous call context. Canvas flows can branch on `outcome`, `status`, or any field in `dynamicVars`.

---

## Config Store

Stored at `~/.champiq/config.json` (or path from `CHAMPIQ_CONFIG` env var):

```json
{
  "providers": {
    "elevenlabs": {
      "api_key": "...",
      "agent_id": "...",
      "phone_number_id": "...",
      "webhook_secret": "..."
    }
  },
  "canvas": {
    "webhook_url": "https://canvas.champiq.ai/hooks",
    "webhook_secret": "..."
  },
  "redis": {
    "url": "redis://localhost:6379",
    "ttl_days": 30
  },
  "gateway": {
    "port": 3001,
    "api_key": "...",
    "default_provider": "elevenlabs"
  },
  "graph": {
    "inject_prev_context": true,
    "max_context_calls": 3
  }
}
```

---

## Data Flow: Complete Call Lifecycle

```
champiq-voice call +1555... --flow flow_123 --node node_456
          │
          ▼
  ConfigStore.load()
  ProviderRegistry.get('elevenlabs')
  ChampGraph.getContactHistory(+1555...)  ← fetch prior calls
          │
          ▼  (if prior calls exist)
  Build dynamicVars += { prev_summary, prev_outcome, prev_date }
          │
          ▼
  CallOrchestrator.initiateCall()
    → champgraph:call:{callId} = CallNode{ status: 'initiated', timestamps.created }
    → champgraph:contact:{phone} += callId (scored by timestamp)
    → champgraph:flow:{flowId}:calls += callId
    → ElevenLabsProvider.initiateCall()  → ElevenLabs API
          │
          ▼  (async, minutes later)
  ElevenLabs completes call
  POST /v1/webhook (on the serve process)
    → verify HMAC
    → parse: transcript, status, conversation_id
    → ChampGraph.updateCallNode(callId, { transcript, status, timestamps.completed })
    → CanvasEmitter.emit('call.completed', fullNode)  → ChampIQ Canvas
    → link prevCall.nextCallId = callId
    → (optional) summarize transcript with LLM → store summary
```

---

## What to Retain / Throw Away

| Current Code | Decision | Reason |
|---|---|---|
| `backend/src/server.ts` | **Refactor** into `src/server/` modules | Keep Redis logic, add graph layer |
| `src/` (React frontend) | **Remove entirely** | Headless CLI replaces it |
| ElevenLabs proxy logic | **Keep + generalize** into `ElevenLabsProvider` | Core provider impl |
| Webhook handler | **Keep + expand** | Add canvas emit + graph linking |
| Redis TTL keys | **Replace** with ChampGraph sorted sets | Graph traversal requires sorted sets |
| `src/services/redisService.ts` | **Remove** | Was HTTP-to-Redis bridge for React |
| `src/types/index.ts` | **Move/expand** into `src/graph/types.ts` | Richer CallNode types |
| `docker-compose.yml` | **Keep** | Still need Redis container |
| `.env` secrets | **Move** to `~/.champiq/config.json` | CLI-native config |

---

## Implementation Phases

- **Phase 1** — Core gateway (strip React, build CLI skeleton + provider system + HTTP serve)
- **Phase 2** — ChampGraph (Redis graph layer with CallNode CRUD + contact history)
- **Phase 3** — Canvas sync (CanvasEmitter + outbound webhook + retry logic)
- **Phase 4** — Context injection (auto-inject prev call context into dynamic vars)
- **Phase 5** — LLM summary (optional: call Claude/GPT to summarize transcript, store on node)
