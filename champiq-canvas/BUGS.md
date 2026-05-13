# ChampIQ Canvas — Bug Fixes (2026-04-24)

## Backend

### BUG-01 — Webhook canonical payload missing on event bus
**Symptom:** Inbound tool webhooks (e.g. ChampVoice post-call) were published to the event bus without their `data` field — downstream event-trigger nodes received an empty payload.
**Root cause:** `webhooks.py` was extracting `canonical["data"]` and passing only that slice, dropping `event`, `call_id`, `transcript` etc.
**Fix:** Pass the full canonical dict to `event_bus.publish()`.

---

### BUG-02 — `/api/tools/{tool}/{action}` hit the fake CLI stub, not the real driver
**Symptom:** Clicking "Run" on a ChampVoice node always returned a stub result (`Stub Prospect`, `Stub Corp`) — no real call was ever made.
**Root cause:** `tools.py` router called `invoke_tool_cli()` (a fake Python subprocess) instead of the real `ToolNodeExecutor` / driver registered in the container.
**Fix:** Rewrote the route to resolve credentials from DB, call `driver.invoke()` directly, and store the real result in `job_store`.

---

### BUG-03 — ChampVoice driver called a gateway URL instead of ElevenLabs directly
**Symptom:** Calls failed with `HTTP 405 Method Not Allowed` because `gateway_url` in the credential pointed at the Canvas app itself, not a separate voice gateway service.
**Root cause:** Architecture required a separate Node.js gateway service (Voice-Qualified-Template) to be running. No such service was deployed.
**Fix:** Removed the gateway entirely. `ChampVoiceDriver` now calls ElevenLabs `POST /v1/convai/twilio/outbound-call` directly using credentials from the Canvas credential store. No separate service needed.

---

### BUG-04 — ElevenLabs API key, agent ID, phone number ID required as Railway env vars
**Symptom:** Gateway (and later the Canvas API) needed `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_PHONE_NUMBER_ID` set as Railway environment variables — credentials couldn't come from the UI.
**Root cause:** Driver read these from server config only, with no per-call override path.
**Fix:** Driver now reads `elevenlabs_api_key`, `agent_id`, `phone_number_id` from the Canvas credential store per-call. Railway env vars no longer needed for these fields.

---

### BUG-05 — Credential name mismatch silently skipped the call
**Symptom:** ChampVoice node had `credential: "Lead_qualifier"` in its config but the DB only had `"champvoice-test"` — so credentials resolved to `{}`, the driver threw a `ValueError`, but the fan-out caught it silently and reported "success" with no call.
**Root cause:** `ToolNodeExecutor` raised `KeyError` when credential name wasn't found and had no fallback.
**Fix:** Added `resolve_by_type()` to `SqlCredentialResolver` — when a named credential isn't found, falls back to the first credential of the matching tool type.

---

### BUG-06 — Loop node output was always `count: 0, items: []`
**Symptom:** Loop node showed "success" but produced no items — ChampVoice fan-out never fired.
**Root cause:** Loop `config` was `{}` (empty) in every UI-triggered workflow. `ctx.config.get("items", [])` returned `[]`. The auto-configure from CSV upload wasn't persisted before Run All fired (debounce race).
**Fix (backend):** Loop executor now auto-detects items from `prev.payload.items` when `config.items` is empty — handles the CSV upload case transparently.
**Fix (frontend):** CSV upload calls `saveCurrentCanvas()` immediately (not via 3s debounce) after auto-configuring the loop node.

---

### BUG-07 — Fan-out passed `{"_item": {...}, "_index": 0}` as `item` instead of the raw CSV row
**Symptom:** `{{ item.phone }}` in ChampVoice inputs resolved to `None` — fan-out was setting `item` to the loop's output wrapper dict instead of the raw CSV row.
**Root cause:** Loop outputs `{"_item": <raw row>, "_index": N}` per item. Orchestrator fan-out was iterating over these wrapper dicts and setting `item = {"_item": {...}}` instead of unwrapping.
**Fix:** Fan-out extracts `item["_item"]` before injecting into expression context.

---

### BUG-08 — Expression error on multi-expression string `{{ item.first_name }} {{ item.last_name }}`
**Symptom:** Node run failed with `unmatched '}' (<unknown>, line 1)`.
**Root cause:** The expression `{{ item.first_name }} {{ item.last_name }}` was being parsed as a single expression instead of two interpolations — the parser choked on the second `}}`.
**Fix:** Removed `lead_name` from the node config inputs entirely. Contact fields now flow from `item.*` automatically — no manual expressions needed.

---

### BUG-09 — `wait_for_event` on loop caused a deadlock
**Symptom:** Loop ran but ChampVoice never executed — execution stayed in `running` state indefinitely.
**Root cause:** Loop was subscribed to `transcript.ready` before the ChampVoice node had run, so the event never fired and the loop blocked forever.
**Fix:** Removed `wait_for_event` from the loop. Sequential execution via `concurrency=1` on the orchestrator fan-out is the correct model — calls fire one at a time.

---

### BUG-10 — `to_number` without `+` prefix rejected by ElevenLabs
**Symptom:** ElevenLabs returned an error because `919098474926` is not valid E.164 format.
**Root cause:** ChampVoice driver didn't normalize the number.
**Fix:** Driver auto-prepends `+` if the number doesn't already start with it.

---

## Frontend

### BUG-11 — `to_number` field visible in ChampVoice config panel
**Symptom:** ChampVoice node showed a "Phone number (E.164)" input field in the config panel, leading users to hardcode a phone number instead of letting it flow from the CSV.
**Root cause:** `ACTION_FIELDS['champvoice']['initiate_call']` in `RightPanel.tsx` defined `to_number` as a UI field.
**Fix:** Removed `to_number`, `lead_name`, `email`, `company` from `ACTION_FIELDS`. Config panel now only shows `Agent ID override` (optional) and `Call reason` (optional). All contact fields flow automatically from the loop item.

---

### BUG-12 — Old flows visible on new canvas / stale nodes on page load
**Symptom:** Creating a new canvas showed the previous session's nodes. Switching canvases sometimes showed stale content before the correct canvas loaded.
**Root cause:** Zustand `persist` middleware was rehydrating the last session's flat `nodes/edges` snapshot into the store before `usePersistence` could load the correct per-canvas state — causing a race condition.
**Fix:** Removed `persist` middleware entirely. `usePersistence` owns all persistence via per-canvas `champiq:canvas:{id}` keys. Canvas is explicitly cleared before loading new state.

---

### BUG-13 — Duplicate "Untitled Canvas" entries in sidebar
**Symptom:** Two or more identically-named canvases appeared in the sidebar. Second canvas showed same nodes as first.
**Root cause:** `createCanvas()` didn't check for existing blank canvases before creating a new one. Also the `persist` middleware's stale `champiq:canvas` key caused the canvas list to load duplicates.
**Fix:** `createCanvas()` reuses an existing blank canvas instead of creating a duplicate. `usePersistence` deduplicates the canvas list by ID on init and removes the stale `champiq:canvas` key.

---

### BUG-14 — Deleting a node left its wires (edges) on the canvas
**Symptom:** After deleting a node, the connecting edges remained as dangling dashed lines.
**Root cause:** `onNodesChange` applied node removals but never cleaned up edges whose `source` or `target` no longer existed.
**Fix:** `onNodesChange` now filters out orphan edges inline — any edge referencing a deleted node is removed in the same state update.

---

### BUG-15 — Stale `to_number: 919098474926` persisted in localStorage
**Symptom:** Even after the UI field was removed, old canvas saves in localStorage still had `inputs.to_number = "919098474926"` on the ChampVoice node — so Run All kept sending the hardcoded number.
**Root cause:** The value was baked into the node config saved to `champiq:canvas:{id}` in localStorage before the fix was applied.
**Fix:** `migrateNodes()` in `usePersistence` strips `to_number`, `phone`, `phone_number`, `first_name`, `last_name`, `lead_name`, `email`, `company` from any champvoice node's `inputs` on load — transparent one-time migration on next page refresh.

---

### BUG-16 — Loop + ChampVoice config not saved before Run All (debounce race)
**Symptom:** CSV upload auto-configured the loop and champvoice nodes correctly in memory, but Run All sent `config: {}` for the loop because the 3s debounce save hadn't fired yet.
**Root cause:** `usePersistence` debounced saves by 3 seconds. If the user clicked Run All within that window, the old (empty) config was sent.
**Fix:** Reduced debounce to 1s. CSV upload calls `saveCurrentCanvas()` synchronously after auto-configure — no debounce wait before Run All.

---

### BUG-17 — Credential hint mentioned `gateway_url` (stale after gateway removal)
**Symptom:** ChampVoice credential picker showed hint: *"Must contain gateway_url, api_key, elevenlabs_api_key..."* — confusing users into thinking a gateway URL was required.
**Root cause:** Hint text in `RightPanel.tsx` was written before the gateway was removed.
**Fix:** Updated hint to: *"Must contain elevenlabs_api_key, agent_id, phone_number_id."*
