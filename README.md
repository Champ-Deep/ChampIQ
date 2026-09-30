# ChampIQ

ChampIQ is a voice and canvas workspace, held together as a pnpm monorepo. The canvas is a visual, drag-and-drop orchestration surface; the voice service is its spoken counterpart. Both talk to the same graph, so a thought captured in one is queryable from the other.

A Champions Group product.

---

## Two halves

| Package | What it is |
|---|---|
| `champiq-canvas/` | The visual orchestration canvas and the API behind it. A pnpm workspace containing `apps/api` (Python, FastAPI) and the web front end. |
| `champiq-voice/` | The voice service: transcription in, structured intent out. Node, deployable on its own via Docker or Railway. |

The shared spine is **ChampGraph**, a persistent knowledge graph. Canvas nodes and voice intents both land in it, which is what makes a spoken note and a drawn diagram the same object to the system.

---

## The API

`champiq-canvas/apps/api` is a FastAPI service with Alembic-managed schema history:

```
0001_canvas_state
0002_orchestrator
0003_champmail            <- email sequences
0004_champmail_sender_credential
0005_app_settings
0006_event_provider_id
```

Migrations are append-only. `0003` onward is where ChampMail, the outbound email product, was grafted onto the graph, so the history reads as the product's own timeline.

---

## Tech stack

TypeScript · React · Node 20+ · pnpm 9+ · Python 3.12 · uv · FastAPI · Alembic · Postgres · Docker · Railway.

---

## Local development

**Prerequisites:** Node.js 20+, pnpm 9+, Python 3.12 with [uv](https://docs.astral.sh/uv/), and a Postgres instance (local or Railway).

```bash
git clone git@github.com:Champ-Deep/ChampIQ.git
cd ChampIQ/champiq-canvas
pnpm install
cd apps/api && uv sync
```

Configure the database:

```bash
cp apps/api/.env.example apps/api/.env
# DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/champiq
```

Then migrate and run:

```bash
uv run alembic upgrade head
pnpm dev        # runs web and api together
```

The voice service runs from its own directory:

```bash
cd ../champiq-voice
cp .env.example .env
npm install && npm run dev
```

See [champiq-canvas/README.md](./champiq-canvas/README.md) for the canvas-specific detail.

---

## Product context

[ChampIQ_Canvas_Frontend_PRD.docx](./ChampIQ_Canvas_Frontend_PRD.docx) is the product requirements document the canvas was built against.

---

## Status

Active development. The canvas API and migrations are in place; the voice service is being wired into the same graph.
