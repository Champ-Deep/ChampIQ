# ADR-001: Universal Tool Manifest Schema for ChampIQ Canvas

**Status:** Accepted (Phase 1)
**Date:** 2026-04-15
**Deciders:** Sreedeep (Deep), Hemang (backend), Harsha (frontend)
**Related:** `ChampIQ_Canvas_Frontend_PRD.md`, `Efforts/Active/ChampIQ Canvas PRD.md`
**Supersedes:** Initial OpenAPI 3.1 proposal (2026-04-15 morning)

---

## TL;DR

Adopt **JSON Schema 2020-12** as the universal manifest format for every tool that plugs into the ChampIQ Canvas during Phase 1. Extend it with a small, namespaced `x-champiq-*` vocabulary for Canvas-specific UI metadata and transport hints. Every tool (Champmail, ChampVoice, ChampGraph today. ChampConnect, ChampPulse, B2B Pulse, Lake Stream tomorrow) ships a `tool.manifest.json` that conforms to this contract.

Defer the full OpenAPI 3.1 wrapper to Phase 2. Once the Phase 1 manifests are in production and the team has felt the shape of the data, we graduate to OpenAPI 3.1 as a superset of the same JSON Schemas. The Phase 1 manifests embed cleanly inside OpenAPI later with zero rewrites.

One schema sublanguage. Lean for now. Growth path preserved.

---

## Context

ChampIQ is a hub-and-spoke AI SDR platform. The Canvas is the hub. Tools are the spokes. The architecture decision from [[2026-03-24]] locked in three principles:

1. Tools never talk to each other directly. All data flows through the Canvas.
2. ChampGraph (Graffiti) is the only authorized shared state.
3. New tool equals new manifest file, no Canvas code changes.

Principle 3 is the forcing function for this ADR. Without a universal manifest schema, every new tool becomes a Canvas code change, and the 90-day SPAN experiment stalls every time a new channel gets added.

### Why JSON Schema Alone for Phase 1

The initial proposal for this ADR recommended OpenAPI 3.1 wrapping JSON Schema. After weighing the real shape of Phase 1 work, we narrowed to JSON Schema alone for these reasons:

1. **Phase 1 has three tools.** OpenAPI's value compounds with tool count. At three, the verbosity tax outweighs the payoff.
2. **Hemang is junior.** A 400-line OpenAPI file per tool is a learning cliff. A 100-line JSON Schema file is a ramp.
3. **FastAPI still emits OpenAPI for free.** The REST transport layer is documented on the backend by FastAPI without anyone writing OpenAPI by hand. Canvas does not need it during Phase 1.
4. **Every OpenAPI 3.1 document *contains* JSON Schema 2020-12.** When we upgrade in Phase 2, today's manifests become the `components.schemas` block of tomorrow's OpenAPI. No rewrite. No migration pain.
5. **LLM agents read JSON Schema natively.** Claude tool-use and OpenAI function calling both speak JSON Schema directly. We lose nothing on the AI side.

The handoff document will explicitly flag OpenAPI 3.1 as the Phase 2 upgrade path with research notes (see "Forward-Looking Handoff Notes" below).

### Forces at Play

| Force | Pressure |
|-------|----------|
| **Current tools** | Champmail (launched 2026-03-20), ChampVoice (MVP live), ChampGraph (in build) |
| **Near-term tools** | ChampConnect (WhatsApp/RCS), ChampPulse (intent), B2B Pulse (social), Lake Stream (research) |
| **Execution modes** | Manual trigger (Phase 1), agent-planned (Phase 2), fully autonomous (Phase 3) |
| **Communication** | CLI for actions (token-lean), REST for data exchange |
| **Team reality** | Harsha is React-first, Hemang is junior, no dedicated DevEx engineer |
| **AI compatibility** | Phase 2 agent must reason about tool capabilities. Phase 3 agent must self-plan. |
| **Time pressure** | Harsha starts Week 2 of the frontend build next sprint. |

---

## Decision

**Phase 1: Use JSON Schema 2020-12 as the canonical tool manifest format, extended with a defined set of `x-champiq-*` keywords for Canvas-specific metadata.**

Each tool ships a file named `tool.manifest.json` at its repo root. The Canvas treats this manifest as the source of truth for:

1. Node registration (name, category, color, icon)
2. Node config UI (auto-generated from the JSON Schema of the request body)
3. Action endpoint pointer (path, method, async flag)
4. Input and output contracts (what flows across edges)
5. Edge compatibility (tool A's output fits tool B's input, yes or no)
6. Health check endpoint pointer
7. Version, deprecation status, and capability flags

**Phase 2: Graduate to OpenAPI 3.1 as a superset.** The Phase 1 manifests become the `components.schemas` section of the Phase 2 OpenAPI document. Transport metadata (paths, auth, servers) gets added at that point, not now.

---

## Options Considered

### Option A: JSON Schema 2020-12 alone (chosen for Phase 1)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low. Single spec. Tight focus on data shapes. |
| Cost | Zero. Open standard, free tooling everywhere. |
| Scalability | Proven. Used inside OpenAPI, AsyncAPI, MCP, OpenAI function calling, Claude tool-use. |
| Team familiarity | Medium. Hemang uses Pydantic (which emits JSON Schema). Harsha can consume via `@rjsf/core` or Zod. |
| AI compatibility | Native. Every LLM tool-use format speaks JSON Schema. |
| Tooling | Ajv (validator), `@rjsf/core` (form builder), `json-schema-to-typescript`, Spectral. |
| Future-proofing | Graduation path to OpenAPI 3.1 is additive, not a rewrite. |
| Lock-in risk | None. |

**Pros:**
- Smallest viable schema. One Champmail manifest is ~100 lines, not 400.
- Hemang can hand-author this without choking on transport boilerplate.
- Canvas auto-generates config forms via `@rjsf/core` against the schema directly.
- LLM agents read it natively. No translation layer.
- Phase 2 OpenAPI upgrade is a wrap-and-extend, not a port.
- `x-champiq-*` keywords are legal in JSON Schema (unknown keywords are ignored by spec-compliant validators).

**Cons:**
- Does not describe REST transport (paths, methods, auth). Phase 1 Canvas hardcodes the few endpoints per tool against the PRD's API Contracts section. This is acceptable at three tools.
- Does not describe CLI transport. We add a small `x-champiq-transport` block as a bridge for now.
- When tool count grows, the "hardcoded endpoints" cost will exceed the "write OpenAPI" cost. That is the signal to upgrade.

---

### Option B: OpenAPI 3.1 + JSON Schema 2020-12 (deferred to Phase 2)

**Pros:** One file describes transport and data. Proven at Stripe, GitHub, Twilio scale. Best long-term foundation.

**Cons:** Verbose. Steep for a junior dev onboarding for the first time. Value compounds with tool count, which we do not yet have. Phase 1 does not need it.

**Verdict:** Correct choice for Phase 2 and beyond. Overkill for Phase 1. Deferred.

---

### Option C: Model Context Protocol (MCP)

**Pros:** Purpose-built for AI tool use. Claude-native.

**Cons:** Too new. Anthropic-anchored. Weak on transport and async. Doesn't describe what we need for a visual canvas. Derivable from JSON Schema later.

**Verdict:** Downstream artifact, not source of truth.

---

### Option D: GraphQL SDL

**Verdict:** Wrong paradigm for action tools. No.

---

### Option E: Protobuf + gRPC

**Verdict:** Overkill. Binary. Not LLM-readable. No.

---

### Option F: n8n-native node format

**Verdict:** Platform-locked. No.

---

## Trade-off Analysis

The core Phase 1 trade-off is **completeness now vs. momentum now**.

OpenAPI gives us completeness. JSON Schema gives us momentum. At three tools, Harsha can hardcode the three action endpoints from the PRD without pain. At ten tools, he cannot. We pick momentum for Phase 1 and set a clear graduation trigger for Phase 2.

The secondary trade-off is **AI-readability vs. human-authorability**. JSON Schema wins both. OpenAPI wins AI-readability slightly more but loses hard on human-authorability for Hemang's first integration.

The third trade-off is **graduation cost**. This is what tipped the decision. Moving from JSON Schema to OpenAPI later is a wrap-and-extend: take the existing manifest, drop it into `components.schemas`, add the `paths` block, and publish. Zero rewrite. The inverse (starting with OpenAPI, discovering we over-engineered) is painful to undo because CI checks, code generators, and form builders all get wired against the richer spec.

---

## The Schema: What a Phase 1 Manifest Looks Like

### File: `tool.manifest.json` (one per tool, repo root)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://champiq.internal/manifests/champmail.json",
  "title": "Champmail",
  "description": "Email outreach agent. Sends warm, cadenced email sequences to prospect lists.",
  "x-champiq": {
    "tool_id": "champmail",
    "version": "1.4.0",
    "category": "outbound-channel",
    "status": "live",
    "launched": "2026-03-20",
    "canvas": {
      "node": {
        "label": "Champmail",
        "icon": "mail",
        "color": { "header": "#1A5C2A", "body": "#D6EAD6" },
        "accepts_input_from": ["champgraph", "champpulse", "lake-stream"],
        "emits_output_to": ["champvoice", "champconnect", "champgraph"]
      }
    },
    "transport": {
      "rest": {
        "action": {
          "method": "POST",
          "path": "/api/champmail/send",
          "async": true,
          "button_label": "Send"
        },
        "populate": {
          "template_id": { "method": "GET", "path": "/api/champmail/templates" }
        },
        "health": { "method": "GET", "path": "/api/champmail/status" }
      },
      "cli": {
        "binary": "champmail",
        "command": "send",
        "args": ["--batch-id", "--template-id", "--daily-limit"],
        "reads_stdin": true,
        "writes_stdout": "application/json"
      }
    }
  },
  "type": "object",
  "required": ["input", "config", "output"],
  "properties": {
    "input": {
      "type": "object",
      "properties": {
        "prospects": {
          "type": "array",
          "items": { "$ref": "#/$defs/Prospect" },
          "x-champiq-edge-input": true
        }
      }
    },
    "config": {
      "type": "object",
      "required": ["subject", "template_id"],
      "properties": {
        "subject": {
          "type": "string",
          "maxLength": 120,
          "x-champiq-field": { "widget": "text", "label": "Subject line" }
        },
        "template_id": {
          "type": "string",
          "x-champiq-field": {
            "widget": "dropdown",
            "label": "Template",
            "options_from": "populate.template_id"
          }
        },
        "daily_limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 500,
          "default": 50,
          "x-champiq-field": { "widget": "number", "label": "Daily send limit" }
        }
      }
    },
    "output": {
      "type": "object",
      "required": ["job_id"],
      "properties": {
        "job_id": { "type": "string" },
        "sent": { "type": "integer" },
        "queued": { "type": "integer" },
        "failed": { "type": "integer" },
        "batch_id": { "type": "string" }
      }
    }
  },
  "$defs": {
    "Prospect": {
      "type": "object",
      "required": ["id", "email"],
      "properties": {
        "id": { "type": "string" },
        "email": { "type": "string", "format": "email" },
        "name": { "type": "string" },
        "company": { "type": "string" },
        "score": { "type": "number", "minimum": 0, "maximum": 100 }
      }
    }
  }
}
```

Every manifest has the same top-level shape: `x-champiq` metadata block, then a standard JSON Schema describing `input`, `config`, and `output`. Canvas reads `x-champiq.canvas` for UI, `x-champiq.transport` for how to call the tool, and the `properties` block for form generation and edge validation.

---

## The `x-champiq-*` Vocabulary

Unknown keywords are legal in JSON Schema 2020-12. We reserve the `x-champiq` root object and the `x-champiq-*` property-level keys.

| Key | Location | Purpose |
|-----|----------|---------|
| `x-champiq.tool_id` | root | Unique tool slug. |
| `x-champiq.version` | root | Semver string for the manifest. |
| `x-champiq.category` | root | Grouping: `knowledge-graph`, `outbound-channel`, `intent-signal`, `research`, `handoff`. |
| `x-champiq.status` | root | `live`, `beta`, `deprecated`. |
| `x-champiq.canvas.node` | root | Label, icon, color, edge rules. |
| `x-champiq.transport.rest.action` | root | Primary action endpoint descriptor. |
| `x-champiq.transport.rest.populate` | root | Map of config-field name to populate endpoint. |
| `x-champiq.transport.rest.health` | root | Health check endpoint. |
| `x-champiq.transport.cli` | root | CLI invocation descriptor. Optional. |
| `x-champiq-field` | schema property | Widget hint: `text`, `textarea`, `dropdown`, `number`, `slider`, `time-range`. |
| `x-champiq-edge-input` | schema property | Marks this property as the edge-received payload. |

Vocabulary is versioned via `x-champiq.version`. Breaking changes bump the major. Canvas supports current major plus one previous during transition windows.

---

## How This Works in Practice

### For the Canvas (Harsha's work)

1. On startup, Canvas fetches `/api/registry/manifests`. Returns array of `tool.manifest.json` documents.
2. For each manifest, Canvas registers a React Flow node type using `x-champiq.canvas.node`.
3. On node select, Canvas renders a config form with `@rjsf/core` against the `config` subschema. Widget hints come from `x-champiq-field`.
4. Dropdowns populate by calling the endpoint in `x-champiq.transport.rest.populate`.
5. On action button click, Canvas POSTs to `x-champiq.transport.rest.action.path`. If `async: true`, it polls `GET /api/jobs/{job_id}`.
6. Edge compatibility: Canvas only allows A to B if B's `accepts_input_from` includes A's `tool_id`.

### For a New Tool

1. Hemang writes `tool.manifest.json` using an existing tool as the template.
2. Registers it: `POST /api/registry/register`.
3. Canvas auto-renders it. Zero frontend code changes.

### For Phase 2 Agents

The BiLSTM-Attention Learned Orchestrator reads all manifests as its action space. JSON Schema is its native reasoning format.

### For Phase 3 Autonomous Agents

Claude and GPT-4o both consume JSON Schema as tool-use descriptors. The manifest *is* the function-calling spec.

---

## Consequences

### What Becomes Easier

- Adding a tool is a manifest file plus a registry POST.
- Config forms auto-generate. Harsha never hand-writes a config UI per tool.
- LLM agents understand the full tool catalog without adapter code.
- Manifests are small enough for Hemang to hand-author confidently.
- Graduation to OpenAPI 3.1 in Phase 2 is additive, not a rewrite.

### What Becomes Harder

- Transport metadata (paths, auth, servers) is not expressed as richly as OpenAPI would express it. Phase 1 accepts this because it has only three endpoints to track.
- Every tool team must keep the manifest in sync with the actual API. Drift breaks Canvas nodes. Mitigate with a CI check that diffs manifest paths against FastAPI's emitted `/openapi.json`.
- `x-champiq-*` vocabulary is ours to maintain. Keep it small and this ADR keeps it documented.

### What We Will Revisit in Phase 2

**Graduation trigger:** Any one of the following fires.
- Tool count reaches six (current three plus three of: ChampConnect, ChampPulse, B2B Pulse, Lake Stream).
- We need contract testing across tools and mock servers for frontend development.
- An external partner needs to publish a tool to our Canvas (this requires a public, standard API description, i.e. OpenAPI).
- Phase 2 agent needs richer transport reasoning (multi-endpoint flows, retries, pagination).

**Graduation path:**
1. Wrap each `tool.manifest.json` inside an OpenAPI 3.1 document. The existing schema becomes `components.schemas`.
2. Promote the `x-champiq.transport.rest.*` block into OpenAPI `paths`.
3. Promote `x-champiq.canvas.*` and remaining metadata into `info.x-champiq-*` and per-operation `x-champiq-*` extensions.
4. Zero change to Canvas consumers of the schema portion. Transport consumers migrate from our custom `transport` block to standard OpenAPI `paths`.

---

## Forward-Looking Handoff Notes (for Harsha and Hemang)

The handoff document that accompanies the Phase 1 build will include this section verbatim. Both Harsha and Hemang should read it.

**Today we use JSON Schema 2020-12.** It is enough for Phase 1 and keeps the manifest files small, readable, and easy to hand-author. We validate with Ajv. We generate forms with `@rjsf/core`. We generate TypeScript types with `json-schema-to-typescript`.

**Tomorrow we use OpenAPI 3.1.** Based on current research, OpenAPI 3.1 is the right long-term foundation for ChampIQ because:

- Stripe, GitHub, Twilio, and AWS all use OpenAPI for their public APIs at scale.
- OpenAPI 3.1 is the first version that fully aligns with JSON Schema 2020-12, so our Phase 1 schemas slot in without translation.
- The ecosystem is enormous: Swagger UI, Redoc, Stoplight, Prism (mock servers), `openapi-generator` (client codegen in 50+ languages), Spectral (linting).
- LLM tool-use formats (Claude, OpenAI function calling, MCP) all consume the JSON Schema portion of OpenAPI natively.
- Partners, external integrators, and auditors expect OpenAPI as the lingua franca for API contracts.

**When we graduate:** The Phase 1 manifests do not get thrown away. They become the `components.schemas` section of an OpenAPI 3.1 document. The `x-champiq.transport.rest.*` block we maintain now maps directly to OpenAPI `paths`. The graduation is additive. Think of Phase 1 as pouring the foundation and Phase 2 as adding the second floor on top of that same foundation.

**If you want to read ahead:** The OpenAPI 3.1 spec is at https://spec.openapis.org/oas/v3.1.0. The JSON Schema 2020-12 spec is at https://json-schema.org/draft/2020-12/schema. Start with JSON Schema. Once you are fluent there, OpenAPI is a short step.

---

## Action Items

| # | Action | Owner | By |
|---|--------|-------|----|
| 1 | Publish `x-champiq-*` vocabulary as `docs/manifest-vocabulary.md` in the Canvas repo | Deep | Week 1 |
| 2 | Write `tool.manifest.json` for Champmail as the reference implementation | Hemang | Week 1 |
| 3 | Write `tool.manifest.json` for ChampGraph and ChampVoice | Hemang | Week 2 |
| 4 | Build `POST /api/registry/register` and `GET /api/registry/manifests` endpoints | Hemang | Week 2 |
| 5 | Wire `@rjsf/core` into Canvas for auto-generated config forms | Harsha | Week 2 |
| 6 | Add Ajv validation in CI for every tool repo | Hemang | Week 3 |
| 7 | Add "graduation to OpenAPI 3.1" section to handoff document | Deep | Before Week 1 kickoff |
| 8 | Document the six-tool graduation trigger in the Canvas repo README | Deep | Week 1 |

---

## Open Questions

| Question | Blocking? |
|----------|-----------|
| Where does the manifest registry live? Supabase table, static JSON file in the Canvas repo, or dedicated service? | Yes, blocks Action 4 |
| Do we enforce semantic versioning on manifests? Proposed: yes, `x-champiq.version` follows semver, Canvas pins to major. | No, decide by Week 2 |
| Do we lint manifests with Ajv only, or add a custom validator for `x-champiq.*` shape? Proposed: both. Ajv for JSON Schema correctness, custom lint for `x-champiq` presence and shape. | No |
| When does the graduation trigger fire? Monitor tool count and external-partner requests. | No, revisit quarterly |

---

## References

- [JSON Schema 2020-12](https://json-schema.org/draft/2020-12/schema)
- [OpenAPI 3.1 Specification](https://spec.openapis.org/oas/v3.1.0) (Phase 2 target)
- [Ajv (JSON Schema validator)](https://ajv.js.org/)
- [React JSON Schema Form (`@rjsf/core`)](https://rjsf-team.github.io/react-jsonschema-form/)
- [`json-schema-to-typescript`](https://github.com/bcherny/json-schema-to-typescript)
- [[ChampIQ Canvas PRD]]
- [[project_champiq_canvas_architecture]] (auto-memory, 2026-03-24)

---

*Champions Accelerator | Champions Group | April 2026 | CONFIDENTIAL*
