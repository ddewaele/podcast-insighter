# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install deps and generate Prisma client
npm install

# Start both servers together (recommended for dev)
npm run dev:all         # Fastify on :3001 + Vite on :5173

# Start servers individually
npm run dev:server      # Fastify backend only (tsx --watch)
npm run dev             # Vite frontend only

# Local Postgres (required for dev — starts a postgres:16 container)
docker compose up postgres -d

# Database
npm run db:push         # Push schema changes without a migration file (quick dev iteration)
npm run db:migrate      # Create a named migration file (use before committing schema changes)
npm run db:studio       # Open Prisma Studio at localhost:5555

# Build & preview
npm run build           # tsc + vite build → dist/
npm run preview         # Preview the production build
```

There are no automated tests. Manual browser testing is the verification method.

## Architecture

### Request flow

```
Browser → Vite dev server (:5173)
            └─ /api/* proxy → Fastify (:3001)
            └─ /auth/*  proxy → Fastify (:3001)
```

In production the Fastify server serves the built `dist/` directly — no separate Vite process.

### Frontend view state machine (`src/App.tsx`)

The app has no router. A single `view` state drives which top-level component renders:

| `view`      | Component      | When                                    |
|-------------|----------------|-----------------------------------------|
| `'home'`    | `HomePage`     | Logged-in, default landing              |
| `'upload'`  | `DropZone`     | User clicks "Upload JSON"               |
| `'dashboard'` | `Dashboard`  | A transcript is loaded into local state |

Auth is checked via `GET /api/auth/me` on mount. If not logged in, `LoginScreen` is shown regardless of `view`.

### Backend structure (`server/`)

| File | Purpose |
|------|---------|
| `index.ts` | Fastify setup: CORS, cookies, sessions, Google OAuth, route registration, static serving in prod |
| `db.ts` | Exports the singleton `prisma` client |
| `middleware.ts` | `requireAuth` — Fastify preHandler that gates routes behind a session check |
| `routes/auth.ts` | `/auth/google` redirect, `/auth/google/callback`, `/api/auth/me`, `/api/auth/logout` |
| `routes/transcripts.ts` | CRUD for transcripts; `serializeTranscript()` shapes the API response |
| `routes/jobs.ts` | Submit YouTube URL (`POST /api/jobs`), poll status (`GET /api/jobs/:id`), SSE stream (`GET /api/jobs/:id/progress`) |
| `pipeline/fake.ts` | Simulates the real pipeline with delays; reads a local sample JSON and writes the result to the DB |

### Database (Prisma + PostgreSQL)

Schema lives in `prisma/schema.prisma`. Three models: `User`, `Transcript`, `Job`.

Key details:
- Provider is `postgresql` — local dev runs Postgres via `docker compose up postgres -d` (see `docker-compose.yml`).
- `DATABASE_URL` for local dev: `postgresql://transcriber:transcriber@localhost:5432/transcriber` (matches the compose service).
- On Railway, add the **Postgres plugin** — it injects `DATABASE_URL` automatically; no manual config needed.
- `json_data TEXT` on `Transcript` stores the full analysis JSON as a string.
- The Dockerfile runs `prisma migrate deploy` before starting the server, so Railway deploys apply migrations automatically.
- After any schema change: run `npm run db:migrate -- --name <description>` to produce a migration file, then commit it alongside the schema change.

### Pipeline & SSE

Submitting a YouTube URL (`POST /api/jobs`) creates a `Transcript` row (status `processing`) and a `Job` row, then fires `runFakePipeline` in the background. The client subscribes to `GET /api/jobs/:id/progress` (SSE). The pipeline broadcasts progress events via an in-memory `Map<jobId, writers[]>`. On completion, the transcript's `json_data` and `status` are updated in the DB.

### Transcript analysis JSON schema

The `Dashboard` component consumes a fixed JSON shape defined in `src/types.ts` (`TranscriptAnalysis`). The schema has seven top-level keys: `metadata`, `summary`, `quotes`, `insights`, `references`, `disagreements_and_nuance`, `topic_segments`. The full field-level schema is documented in `README.md`.

### Transcription pipeline (Python, `scripts/`)

`scripts/transcribe.py` downloads a YouTube video and runs NVIDIA Parakeet to produce `transcript.txt` and `transcript.json` under `scripts/output/<video-id>/`. It is separate from the Node.js app and has its own venv (`scripts/.venv/`). The fake Node pipeline (`server/pipeline/fake.ts`) reads a pre-existing output from this script to simulate a real run.

### Styling

CSS Modules throughout — no external CSS framework. Theme (`dark` / `light`) is stored in `localStorage` and applied as a `data-theme` attribute on `<html>`. All theme-sensitive values use CSS custom properties defined in `src/index.css`.

## Environment variables

All required vars are listed with instructions in `.env.example`. Copy it to `.env` before starting:

```bash
cp .env.example .env
# fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET
```

In dev, `GOOGLE_CALLBACK_URL` must point to the Vite port (`http://localhost:5173/auth/google/callback`) because the browser receives the redirect — not the backend port.
