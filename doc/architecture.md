# Architecture — Podcast Insighter

> Current state as of April 2026. Branch: `feature/backend-foundation`.

---

## Overview

Podcast Insighter is a full-stack web application that turns YouTube podcast episodes into structured, browsable analyses. A Python pipeline (download → transcribe → LLM processing) runs on a server and produces a JSON document that the React frontend renders across six themed tabs.

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│  React SPA (Vite)                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ DropZone │  │ Overview │  │  Quotes  │  │  Timeline  │  │
│  │  Upload  │  │ Summary  │  │ Insights │  │ References │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP / SSE  (proxied via Vite in dev)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Fastify  (Node.js / TypeScript)  — port 3001               │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │   Auth   │  │  Transcripts │  │  Jobs + SSE progress   │ │
│  │  routes  │  │    routes    │  │        routes          │ │
│  └──────────┘  └──────────────┘  └────────────────────────┘ │
│                         │                                    │
│  ┌──────────────────────┼───────────────────────────────┐   │
│  │  SQLite (better-sqlite3)      disk: data/app.db       │   │
│  └──────────────────────┼───────────────────────────────┘   │
│                         │                                    │
│  ┌──────────────────────┼───────────────────────────────┐   │
│  │  File store           output/<id>-analysis/           │   │
│  │                       transcript_analysis.json        │   │
│  └──────────────────────┼───────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────┘
                          │ child_process / SSH / HTTP
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Python pipeline  (local or remote VM)                       │
│  yt-dlp  →  NVIDIA Parakeet STT  →  Claude API              │
└─────────────────────────────────────────────────────────────┘
```

---

## Frontend

### Technology

| Choice | Reason |
|--------|--------|
| **Vite 5 + React 18 + TypeScript** | Fast HMR, minimal config, type safety |
| **CSS Modules** | Scoped styles, no runtime overhead, no CSS framework dependency |
| **No router** | Single-page with tab state held in `useState`; no URL-based navigation needed yet |
| **No backend calls from the current UI** | Existing drag-and-drop mode works entirely client-side |

### Entry point

```
src/
├── main.tsx          # ReactDOM.createRoot
├── App.tsx           # Theme state, getInitialTheme(), routing between DropZone ↔ Dashboard
├── index.css         # CSS custom properties (dark/light tokens)
├── types.ts          # Theme type + TranscriptAnalysis shape
└── components/
    ├── DropZone.tsx          # Initial screen: drag-and-drop or file picker
    ├── Dashboard.tsx         # Loaded state: Header + tab bar + active tab
    ├── Header.tsx            # Title, reset button, ThemeToggle
    ├── ThemeToggle.tsx       # Sun/Moon button, shared between DropZone and Header
    └── tabs/
        ├── OverviewTab.tsx        # One-liner, topics, summary, takeaways
        ├── TimelineTab.tsx        # Topic segments (Early → Late)
        ├── QuotesTab.tsx          # Filterable quote cards
        ├── InsightsTab.tsx        # Claims with novelty ratings, filterable
        ├── ReferencesTab.tsx      # People / tools / companies / concepts
        └── DisagreementsTab.tsx   # Debates between speakers
```

### Theming

CSS custom properties defined in `index.css` under `:root` (dark, default) and `[data-theme="light"]`. `getInitialTheme()` in `App.tsx` reads `localStorage` or `prefers-color-scheme` and calls `document.documentElement.setAttribute('data-theme', theme)` **synchronously** before the first React render — this prevents the CSS `transition` from firing on page load.

### Dev proxy

In development, Vite proxies `/api/*` and `/auth/*` to `http://localhost:3001`, so the frontend can make API calls without CORS configuration:

```ts
// vite.config.ts
server: {
  port: 5173,
  proxy: {
    '/api': 'http://localhost:3001',
    '/auth': 'http://localhost:3001',
  },
}
```

---

## Backend

### Technology

| Choice | Reason |
|--------|--------|
| **Fastify 5** | First-class TypeScript, fast, lifecycle hooks, native JSON schema validation |
| **tsx** | Runs TypeScript directly without a build step in development and in the Docker image |
| **@fastify/oauth2** | Google OAuth2 in ~10 lines; well-maintained official plugin |
| **@fastify/session + @fastify/cookie** | Cookie-based sessions; no JWT complexity needed at this scale |

### Directory layout

```
server/
├── index.ts              # App entry: registers plugins and routes, serves static files in prod
├── db.ts                 # SQLite setup, schema creation, prepared statement exports
├── routes/
│   ├── auth.ts           # /auth/google, /auth/google/callback, /api/auth/me, /api/auth/logout
│   ├── transcripts.ts    # GET|POST|PATCH|DELETE /api/transcripts[/:id]
│   └── jobs.ts           # POST /api/jobs, GET /api/jobs/:id, GET /api/jobs/:id/progress (SSE)
└── pipeline/
    └── fake.ts           # Simulated pipeline — replace with real VM call later
```

### API surface

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/auth/google` | — | Redirect to Google consent screen |
| `GET` | `/auth/google/callback` | — | OAuth callback; sets session cookie; redirects to frontend |
| `GET` | `/api/auth/me` | ✓ | Current user (id, email, name, avatarUrl) |
| `POST` | `/api/auth/logout` | ✓ | Destroy session |
| `GET` | `/api/transcripts` | — | List: own transcripts + all public ones |
| `GET` | `/api/transcripts/:id` | — | Single transcript with full analysis JSON |
| `POST` | `/api/transcripts` | ✓ | Upload a transcript JSON (title + data body) |
| `PATCH` | `/api/transcripts/:id` | ✓ | Toggle `isPublic` |
| `DELETE` | `/api/transcripts/:id` | ✓ | Delete own transcript |
| `POST` | `/api/jobs` | ✓ | Submit YouTube URL → `{ jobId, transcriptId }` |
| `GET` | `/api/jobs/:id` | ✓ | Job status and progress |
| `GET` | `/api/jobs/:id/progress` | ✓ | SSE stream of pipeline stage events |
| `GET` | `/api/health` | — | `{ ok: true }` — used by Docker and Railway |

### SSE progress events

```
data: {"stage":"downloading", "pct":0,   "detail":"Fetching audio from YouTube…"}
data: {"stage":"downloading", "pct":20,  "detail":"Audio downloaded"}
data: {"stage":"transcribing","pct":50,  "detail":"Transcribing audio…"}
data: {"stage":"processing",  "pct":60,  "detail":"Sending transcript to Claude…"}
data: {"stage":"done",        "pct":100, "detail":"Done", "resultId":"<transcriptId>"}
```

### Static file serving (production only)

In production (`NODE_ENV=production`), Fastify serves the Vite build from `dist/` and falls back to `index.html` for any unmatched route (SPA catch-all):

```ts
if (isProd) {
  await app.register(staticPlugin, { root: distPath, prefix: '/' })
  app.setNotFoundHandler((_req, reply) => reply.sendFile('index.html'))
}
```

This means a single process on port 3001 serves both the API and the frontend in production.

---

## Database

### Technology

**SQLite via `better-sqlite3`** — synchronous, zero-infra, single file on disk.

Suitable for personal use and small teams. Upgrade path: swap `better-sqlite3` for `postgres` + `pg` when multi-writer concurrency or horizontal scaling is needed.

WAL mode is enabled on startup for better read concurrency:
```ts
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
```

### Schema

```sql
CREATE TABLE users (
  id          TEXT PRIMARY KEY,          -- UUID v4
  google_id   TEXT UNIQUE NOT NULL,      -- Google sub claim
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  avatar_url  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE transcripts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  youtube_url   TEXT,
  video_id      TEXT,                    -- 11-char YouTube ID
  status        TEXT NOT NULL DEFAULT 'ready',   -- processing | ready | error
  is_public     INTEGER NOT NULL DEFAULT 0,       -- 0 = private, 1 = public
  json_path     TEXT,                    -- absolute path to analysis JSON on disk
  error_message TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE jobs (
  id            TEXT PRIMARY KEY,
  transcript_id TEXT REFERENCES transcripts(id) ON DELETE SET NULL,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  youtube_url   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued',
  progress      INTEGER NOT NULL DEFAULT 0,       -- 0–100
  detail        TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### File store

Analysis JSON files are written to `output/<transcriptId>-analysis/transcript_analysis.json`. The `json_path` column in `transcripts` holds the absolute path. This keeps the database row small and the JSON readable on disk without a DB query.

---

## Authentication (Google SSO)

### Flow

```
User clicks "Sign in with Google"
       │
       ▼
GET /auth/google
  └─► @fastify/oauth2 builds the Google authorization URL and redirects
       │
       ▼ (user approves on accounts.google.com)
       │
GET /auth/google/callback?code=…
  ├─► Exchange code for access token (server-to-server)
  ├─► Fetch profile from https://www.googleapis.com/oauth2/v2/userinfo
  ├─► Find or create user row in SQLite
  ├─► Set encrypted session cookie (httpOnly, sameSite: lax)
  └─► Redirect to frontend (FRONTEND_URL)
       │
       ▼
All subsequent API calls include the cookie automatically.
GET /api/auth/me  →  { id, email, name, avatarUrl }
```

### Session storage

Sessions are stored server-side (in-memory by default). The session ID is stored in an `httpOnly` cookie. The in-memory store is fine for single-instance deployments; for multi-instance add a `connect-redis` or `@fastify/session` Redis store.

### Callback URL — dev vs production

| Environment | `GOOGLE_CALLBACK_URL` | Why |
|-------------|----------------------|-----|
| Development | `http://localhost:5173/auth/google/callback` | Goes through the Vite proxy → Fastify. Cookie is set on port 5173 (same origin as the frontend), so subsequent API calls include it automatically. |
| Production | `https://your-domain.com/auth/google/callback` | Fastify serves everything; there is no proxy. |

> **Do not use port 3001 in the dev callback URL.** If you do, Google redirects the browser directly to Fastify (bypassing Vite). The session cookie is then set on `localhost:3001` instead of `localhost:5173`, creating a cross-origin cookie mismatch that is fragile and browser-dependent.

### Required environment variables

```env
GOOGLE_CLIENT_ID=…          # From Google Cloud Console → OAuth 2.0 Client
GOOGLE_CLIENT_SECRET=…
GOOGLE_CALLBACK_URL=http://localhost:5173/auth/google/callback  # dev
SESSION_SECRET=…            # ≥ 32 random characters
FRONTEND_URL=http://localhost:5173  # dev
```

### Google Cloud Console setup

1. Create a project → **APIs & Services → Credentials → Create OAuth 2.0 Client ID**
2. Application type: **Web application**
3. Authorised redirect URIs — add both:
   - `http://localhost:5173/auth/google/callback` (development, via Vite proxy)
   - `https://your-domain.com/auth/google/callback` (production)

---

## Docker & Deployment

### Image build (multi-stage)

```
Stage 1 — deps          npm ci (all deps incl. devDeps for tsx + Vite)
Stage 2 — frontend      npm run build → dist/
Stage 3 — production    node_modules + dist/ + server/ source
```

The production image runs the TypeScript server directly via `npx tsx server/index.ts`. A separate compile step is not needed because tsx is included in the image.

### Persistent volumes

Two directories must survive container restarts:

| Path in container | Contents | Docker volume |
|-------------------|----------|---------------|
| `/app/data` | SQLite database (`app.db`) | `transcript_data` |
| `/app/output` | Analysis JSON files | `transcript_output` |

### Local container testing

```bash
cp .env.example .env          # fill in Google credentials + SESSION_SECRET
docker compose up --build
# → app available at http://localhost:3001
```

### Railway deployment

Railway auto-detects `Dockerfile` and reads `railway.toml` for health check configuration:

```toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 30
```

**Steps:**
1. Push repo to GitHub
2. New Railway project → **Deploy from GitHub repo**
3. Add environment variables in the Railway dashboard (same as `.env`)
4. Add a **Volume** mounted at `/app/data` (for SQLite)
5. Add a second **Volume** mounted at `/app/output` (for JSON files)
6. Railway builds the image and deploys on every push to `main`

### Environment variables reference

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | ✓ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ✓ | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | ✓ | Full callback URL including domain |
| `SESSION_SECRET` | ✓ | ≥ 32 char random string for session signing |
| `FRONTEND_URL` | ✓ | Where to redirect after login (same origin in prod) |
| `PORT` | — | Server port (default: `3001`) |
| `NODE_ENV` | — | Set to `production` in container |

---

## Development workflow

```bash
# Terminal 1 — backend
npm run dev:server        # tsx --watch server/index.ts  →  :3001

# Terminal 2 — frontend
npm run dev               # Vite  →  :5173 (proxies /api + /auth to :3001)

# Stop both
bash scripts/stop.sh
```

### Shared types

`shared/types.ts` contains types imported by both the frontend and the server (User, Transcript, Job, ProgressEvent, TranscriptAnalysis). This ensures the API contract stays in sync without a code generation step.

---

## Key constraints and trade-offs

| Decision | Current choice | When to revisit |
|----------|---------------|-----------------|
| Database | SQLite | Multi-instance deployment or >1k concurrent users |
| Session store | In-memory | Multiple server replicas (switch to Redis) |
| Job queue | Simple async | When retries, persistence across restarts, or concurrency limits are needed (switch to BullMQ + Redis) |
| Pipeline execution | Fake stub | Replace `server/pipeline/fake.ts` with real VM call when the Python pipeline is ready |
| Audio transcription | NVIDIA Parakeet (local VM) | See `doc/extension-plan.md` for STT alternatives |
| Auth providers | Google only | Add GitHub or email/password via `@fastify/oauth2` or Lucia |
