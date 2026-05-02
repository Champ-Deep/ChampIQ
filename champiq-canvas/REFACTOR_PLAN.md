# REFACTOR_PLAN.md (revised — integration-safe scope)

**Status:** approved. Executing now.

## Context

This service is live on Railway and communicates with a live ChampGraph server. The user's hard rules:

1. **No routes may change.**
2. **No scaffolding for future integrations may be disturbed.**
3. **Zero behavior drift on anything customer-facing.**

I scoped the plan down accordingly. Most of the seven commits I originally proposed have been dropped because they crossed one of the lines above.

## Final scope — 4 commits

### Phase 0 — Unblock + protect

**Commit 0.1 — `test(web): repair stale manifest.test.ts to read v2 manifest fields`**
- Touches `apps/web/tests/manifest.test.ts` only. No production code.
- Currently 5/14 tests fail because the test was written against schema v1 but `manifests/*.json` are schema v2.
- Goal: green vitest baseline so subsequent commits have a regression net.

**Commit 0.3 — `test(api): add route + Pydantic contract snapshot regression net`**
- New files only:
  - `apps/api/tests/__init__.py`
  - `apps/api/tests/test_route_contract.py`
  - `apps/api/tests/contract_snapshot.json`
- Adds `[tool.pytest.ini_options]` stanza to `apps/api/pyproject.toml`.
- The test iterates `app.routes`, captures `path | method | name | request schema | response schema | status_code` for every route (including the ChampMail inline routers), serializes to JSON, and asserts no drift.
- This is the user's protection: any change (intentional or accidental) to a route surface fails this test.
- **No production code touched.**

### Phase 2 — Cosmetic UI cleanup (UI-internal only, no integration touched)

**Commit C1 — `chore(web): remove stray console.* debug statements`**
- 4 stray `console.*` calls in: `CredentialsPanel.tsx`, `ChampMailPanel.tsx`, `TopBar.tsx`, `credentialStore.ts`.
- Keeps `console.error` in `ErrorBoundary.tsx` (that's the error-handler contract).
- Pure deletion. No logic, no behavior, no signature change.

**Commit C2 — `refactor(web): extract RightPanel field schemas to data module`**
- `RightPanel.tsx` is 692 lines, ~250 of which are static configuration tables (`ACTION_FIELDS` + `KIND_FIELDS` + `FieldDef` interface, lines ~17–270).
- Move those tables verbatim into a new file `apps/web/src/lib/nodeFieldSchemas.ts`. RightPanel imports from there.
- **Literal copy-paste.** Not a single field, label, placeholder, hint, or option is altered.
- Result: `RightPanel.tsx` ~440 lines; data tables are now reusable and grep-able from elsewhere if needed.
- **The data is read-only configuration for the inspector UI** — never serialized to the API, never sent to any external server, never reaches a route or integration.

## What is explicitly NOT being touched

🚫 Any route handler (`apps/api/champiq_api/routers/*`, `apps/api/champiq_api/champmail/routers/*`)
🚫 Any Pydantic model or SQLAlchemy model
🚫 Any Alembic migration
🚫 Any auth flow (`auth_lakeb2b.py`, `credentials/service.py`)
🚫 Any driver (`drivers/champvoice.py`, `drivers/lakeb2b.py`)
🚫 The orchestrator (`runtime/orchestrator.py`)
🚫 `champgraph/service.py` — talks to live ChampGraph server
🚫 Any chat / SYSTEM_PROMPT logic
🚫 Any webhook handler
🚫 Any manifest file
🚫 The CredentialsPanel split (too close to LakeB2B OAuth route)
🚫 The ChatPanel patch parsing (LLM→canvas contract)
🚫 The duplicate `champvoice.json` (might be future-integration scaffolding)
🚫 `main.py`, `container.py`
🚫 The `apps/extension/` subtree

## What is flagged for human review (deliberately not fixed)

1. **v1/v2 manifest divergence in `apps/web/src/lib/manifest.ts`** — `getRestAction`, `getConfigSchema`, `getPopulateEndpoints`, `isEdgeCompatible` are v1-only readers but the manifests are v2. Live in production. Real bug — fixing it is a feature change, not a refactor.
2. **`cli_shim.py` and `jobs.py` TODOs** — already documented in README, leaving as-is.
3. **No API tests beyond the contract snapshot.** Recommend separate effort.
4. **Duplicate `champvoice.json` vs `champvoice.manifest.json`.** Looks like dead duplicate; preserved out of caution.

## Execution order (with verification gates)

1. ✅ Update this plan file.
2. ⏳ Commit 0.1 (fix tests). Run `npx vitest run` — must be green. **Halt if not.**
3. ⏳ Commit 0.3 (contract snapshot). Run pytest — must be green; snapshot file is the new baseline. **Halt if not.**
4. ⏳ Commit C1 (console cleanup). Run `npx vitest run` + `tsc --noEmit`. **Halt if not green.**
5. ⏳ Commit C2 (RightPanel extract). Run `npx vitest run` + `tsc --noEmit`. **Halt if not green.**
6. ⏳ Phase 4: produce `REFACTOR_REPORT.md` summarizing diff, verifications, and follow-up recommendations.

## Net diff estimate

~7 files touched, **+~75 lines** (almost all of which is new test infrastructure).
