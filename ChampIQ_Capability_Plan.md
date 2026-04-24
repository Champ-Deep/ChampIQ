# ChampIQ Capability Plan
> Generated: April 2026

---

## What ChampIQ Is

ChampIQ Canvas is a **visual workflow automation platform for sales teams** — purpose-built for SDR ops. It combines two interaction modes:

1. **Chat Interface** — natural language → workflow generation via LLM
2. **Canvas Interface** — drag-drop node-based workflow builder with real-time execution

---

## Architecture

| Layer | Stack |
|---|---|
| Frontend | React 19 + Vite + Tailwind + @xyflow/react 12 + Zustand |
| Backend | Python FastAPI + PostgreSQL + Redis + APScheduler |
| LLM | OpenRouter (configurable model) |
| Real-time | WebSocket event stream |
| Auth (nodes) | Fernet-encrypted credential store |

---

## A. Chat Interface Capabilities

| Capability | Status |
|---|---|
| Natural language → canvas workflow generation | Built |
| Chat refines existing canvas ("add a wait node between step 2 and 3") | Built |
| Session history persisted per chat session | Built |
| LLM knows all 14+ node types and 3 tool integrations | Built |
| Chat output patches canvas live (add/remove/update nodes) | Built |
| "Explain this workflow" → LLM reads canvas and narrates it | To Add |
| "Why did this fail?" → LLM reads execution logs + node errors | To Add |
| "Run this now" typed in chat → triggers workflow execution | To Add |
| Contextual prompt suggestions based on current canvas | To Add |

---

## B. Canvas Interface — Node Inventory

### Trigger Nodes (entry points)
| Node | What it does |
|---|---|
| Manual Trigger | Start workflow on button click — pass any JSON payload |
| Webhook Trigger | Receive HTTP POST from external system |
| Cron Trigger | Run workflow on schedule (cron expression) |
| Event Trigger | React to internal platform events |

### Control Flow Nodes
| Node | What it does |
|---|---|
| If | Evaluate expression → route to true or false branch |
| Switch | Match value against N cases → route to matching branch |
| Merge | Wait for multiple upstream branches → combine outputs |
| Set | Compute + reshape data (build objects, extract fields) |

### Flow Nodes
| Node | What it does |
|---|---|
| Loop | Iterate over array with configurable concurrency |
| Wait | Pause execution for a duration (max 1 hour) |

### Integration Nodes
| Node | What it does |
|---|---|
| HTTP | Call any REST API (GET/POST/PUT/PATCH/DELETE) with credential auth |
| Code | Run sandboxed Python expression against node inputs |
| LLM | Call OpenRouter with a prompt template, optional JSON mode |

### Tool Nodes
| Node | Actions |
|---|---|
| Champmail | Add prospect, start/pause sequence, read replies, send email |
| ChampGraph | Ingest, search, query, find relationships in knowledge graph |
| LakeB2B Pulse | Track engagement, trigger LinkedIn actions, list engaged prospects |

---

## C. New Nodes to Add (n8n-style)

### 1. Split Node (New)
Inverse of Merge — fans out one array into N parallel branches.

**Modes:**
- `fan_out` — send each array item as a separate parallel branch
- `by_key` — group items by a field value, one branch per group
- `fixed_n` — divide array into N fixed sub-arrays

**Backend:** Add `SplitExecutor` to `nodes/control.py`. Orchestrator already supports `sourceHandle` branching.

**Manifest addition to `system.manifest.json`:**
```json
{
  "id": "split",
  "label": "Split",
  "icon": "split",
  "color": "#8B5CF6",
  "config_schema": {
    "input_key": {"type": "string", "default": "items"},
    "mode": {"type": "string", "enum": ["fan_out", "by_key", "fixed_n"]},
    "group_by": {"type": "string"}
  }
}
```

### 2. Merge Node (Enhance)
Already implemented. Add `merge_mode` config:
- `all` (current default) — wait for all upstream branches
- `first` — take first branch that completes
- `append` — collect all into array when all done

### 3. Trigger Nodes (Formalize)
Move 4 trigger sub-types into dedicated sidebar cards. Each gets its own manifest entry with appropriate config schema (cron expression field, webhook URL display, event dropdown).

---

## D. Expression System

Cross-node data flow uses template expressions:
- `{{ prev.field }}` — output from previous node
- `{{ node["id"].output }}` — output from a specific node by ID
- `{{ trigger.payload }}` — data from the trigger node
- `{{ item.field }}` — current loop item (inside Loop node)
- `{{ error.message }}` — error details on failure branch

---

## E. Implementation Priority

| Priority | Item | Effort |
|---|---|---|
| P1 | Formalize Trigger nodes into 4 sidebar entries | Low — backend done, manifest + UI only |
| P2 | Add Split node | Medium — new executor + manifest + dynamic ports |
| P3 | Enhance Merge with merge modes | Low — extend existing executor |
| P4 | Chat: explain mode (no-patch response) | Low — branch in chat router |
| P5 | Chat: run intent detection | Low — intent check → call run endpoint |
| P6 | Chat: error diagnosis (logs → LLM context) | Medium — feed nodeRuntimeStates to chat |
