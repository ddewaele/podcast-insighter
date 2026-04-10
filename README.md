# TranscriberUI

A full-stack app for generating and exploring structured podcast transcript analysis. Submit a YouTube URL to transcribe and analyse a podcast, or upload an existing analysis JSON. Built with Vite + React on the frontend and Fastify + Prisma + PostgreSQL on the backend.

---

## Screenshots

### Drop zone

| Dark mode | Light mode |
|-----------|------------|
| ![Drop zone – dark](public/screenshots/dropzone-dark.png) | ![Drop zone – light](public/screenshots/dropzone-light.png) |

### Dashboard — Overview tab

| Dark mode | Light mode |
|-----------|------------|
| ![Overview – dark](public/screenshots/overview-dark.png) | ![Overview – light](public/screenshots/overview-light.png) |

### Dashboard — Other tabs

| Quotes | Insights |
|--------|----------|
| ![Quotes](public/screenshots/quotes-dark.png) | ![Insights](public/screenshots/insights-dark.png) |

| References | Timeline |
|------------|----------|
| ![References](public/screenshots/references-dark.png) | ![Timeline](public/screenshots/timeline-dark.png) |

| Debates | |
|---------|---|
| ![Debates](public/screenshots/debates-dark.png) | |

---

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/ddewaele/podcast-insighter.git
cd podcast-insighter
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `GOOGLE_CLIENT_ID` | [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | Same OAuth client |
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Add `http://localhost:5173/auth/google/callback` as an authorised redirect URI on your Google OAuth client.

### 3. Start the database

The app uses PostgreSQL. The easiest way to run one locally is via Docker Compose:

```bash
docker compose up postgres -d
```

This starts a `postgres:16` container with the credentials already set in `.env.example` (`transcriber / transcriber`).

### 4. Initialise the schema

```bash
npm run db:push
```

### 5. Start the app

```bash
npm run dev:all
```

This starts both the Fastify backend (`:3001`) and the Vite dev server (`:5173`) together. Open http://localhost:5173.

---

## Deploying to Railway

### Overview

The app is deployed as a single Docker container (Fastify serves both the API and the built Vite frontend). Postgres runs as a separate Railway service on the private network — it is never exposed publicly.

On every deploy the container runs `prisma migrate deploy` before starting the server, so database schema changes are applied automatically.

---

### Step 1 — Create the project and add Postgres

Create a new Railway project, connect this repository, then add a Postgres database. The Railway CLI is the fastest way:

```bash
npm install -g @railway/cli
railway login
railway link        # select your project
railway add --plugin postgresql
```

This provisions Postgres on Railway's **private network** — it has no public endpoint.

---

### Step 2 — Generate a domain

In your app service → **Settings → Networking**, click **Generate Domain**. This gives you your public URL (`https://<name>.up.railway.app`), which you need before you can fill in the OAuth variables.

![Railway Networking panel](public/screenshots/railway/networking-port.png)

> The "Failed to get private network endpoint" message shown for the app service is expected and can be ignored — only the Postgres service needs a private endpoint.
>
> ![Private network error](public/screenshots/railway/networking.png)

---

### Step 3 — Set environment variables

Railway will suggest variables it detects from your source code, but the suggested values are placeholder defaults from `.env.example` — **do not use them as-is**.

![Railway suggested variables](public/screenshots/railway/variables.png)

Set these values in the **Raw Editor** (faster than filling individual fields):

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `GOOGLE_CLIENT_ID` | Your real OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Your real OAuth client secret |
| `GOOGLE_CALLBACK_URL` | `https://<your-railway-domain>/auth/google/callback` |
| `FRONTEND_URL` | `https://<your-railway-domain>` |
| `SESSION_SECRET` | Output of: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

`${{Postgres.DATABASE_URL}}` is Railway's service reference syntax — it resolves to the **internal** Postgres URL at runtime, keeping the database on the private network.

Do **not** manually set `PORT` or `HOST` — Railway injects `PORT` automatically and your server reads it.

---

### Step 4 — Add the callback URL to Google Cloud Console

In [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → your OAuth client → **Authorised redirect URIs**, add:

```
https://<your-railway-domain>/auth/google/callback
```

---

### Step 5 — Deploy and verify

Trigger a deploy. Check the **Deploy Logs** tab — a successful first boot looks like:

![Deploy logs showing successful migration and server start](public/screenshots/railway/deploy-logs.png)

Key lines to look for:
- `All migrations have been successfully applied` — Postgres schema is initialised
- `Server running at http://localhost:<PORT>` — note the port Railway assigned

---

### Gotcha: port mismatch

Railway injects a `PORT` environment variable at runtime (typically `8080`). The server reads it correctly via `process.env.PORT ?? 3001`. However, when you first set up the domain in the Networking panel Railway may default to showing port `3001`.

If you see **"Application failed to respond"**:

![Application failed to respond](public/screenshots/railway/failed-to-respond.png)

Go to **Settings → Networking**, click the edit icon next to your domain, and update the port to match what the deploy logs show (e.g. `8080`). Railway's injected `PORT` is the source of truth — do not override it with a fixed value in the Variables panel.

---

## UI overview

The dashboard has six tabs:

| Tab | Contents |
|-----|----------|
| **Overview** | One-liner, primary topics, executive summary, key takeaways |
| **Timeline** | Topic segments in chronological order (Early → Late) |
| **Quotes** | All quotes, filterable by tag |
| **Insights** | Key claims with novelty ratings, filterable by novelty and tag |
| **References** | People, tools, companies, concepts etc., grouped by type |
| **Debates** | Points of disagreement between speakers, with resolution status |

---

## JSON schema

The app expects a single JSON file with the following top-level structure.

### Top-level shape

```json
{
  "metadata": { ... },
  "summary": { ... },
  "quotes": [ ... ],
  "insights": [ ... ],
  "references": [ ... ],
  "disagreements_and_nuance": [ ... ],
  "topic_segments": [ ... ]
}
```

---

### `metadata`

General information about the episode.

```json
{
  "title": "string",
  "speakers": ["string"],
  "estimated_duration_minutes": 75,
  "primary_topics": ["string"],
  "date_hint": "string"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Episode title |
| `speakers` | string[] | Speaker names and roles |
| `estimated_duration_minutes` | number | Approximate runtime |
| `primary_topics` | string[] | High-level topic tags |
| `date_hint` | string | Approximate recording date |

---

### `summary`

High-level summary of the episode.

```json
{
  "one_liner": "string",
  "executive_summary": "string",
  "key_takeaways": ["string"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `one_liner` | string | Single-sentence distillation |
| `executive_summary` | string | Multi-paragraph prose summary |
| `key_takeaways` | string[] | Ordered list of the most important points |

---

### `quotes[]`

Notable direct quotes from speakers.

```json
{
  "id": "q1",
  "text": "string",
  "speaker": "string",
  "context": "string",
  "tags": ["string"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (`q1`, `q2`, …) |
| `text` | string | The verbatim quote |
| `speaker` | string | Who said it |
| `context` | string | What prompted the quote |
| `tags` | string[] | See tag taxonomy below |

**Quote tags**

| Tag | Meaning |
|-----|---------|
| `quotable` | Stands on its own, good for sharing |
| `contrarian` | Pushes back on conventional wisdom |
| `prediction` | A forward-looking claim |
| `framework` | Offers a reusable mental model |
| `opinion` | Subjective view, not a claim of fact |
| `surprising` | Unexpected or counter-intuitive |
| `funny` | Humorous |

---

### `insights[]`

Distilled claims and observations, each with supporting evidence.

```json
{
  "id": "i1",
  "claim": "string",
  "speaker": "string",
  "supporting_detail": "string",
  "novelty": "high",
  "tags": ["string"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (`i1`, `i2`, …) |
| `claim` | string | The core assertion |
| `speaker` | string | Who made the claim |
| `supporting_detail` | string | Evidence or elaboration from the episode |
| `novelty` | `"low"` \| `"medium"` \| `"high"` | How fresh or surprising the idea is |
| `tags` | string[] | See insight tag taxonomy below |

**Insight tags**

| Tag | Meaning |
|-----|---------|
| `ai-engineering` | About building software with AI tools |
| `career` | Implications for engineering careers |
| `security` | Security risks or mitigations |
| `ethics` | Ethical considerations |
| `tooling` | Specific tools or workflows |
| `product-thinking` | Product strategy or design implications |
| `open-source` | Open source ecosystem |

---

### `references[]`

Everything mentioned in the episode: tools, people, companies, papers, and concepts.

```json
{
  "id": "r1",
  "name": "string",
  "type": "tool",
  "url": "https://example.com",
  "context": "string",
  "mentioned_by": "string"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (`r1`, `r2`, …) |
| `name` | string | Name of the reference |
| `type` | string | See type values below |
| `url` | string \| null | Link, if available |
| `context` | string | How it was used in the conversation |
| `mentioned_by` | string | Speaker who introduced it |

**Reference types**

| Type | Examples |
|------|---------|
| `tool` | Claude Code, Playwright, GPT-5.1 |
| `project` | Django, Datasette, Firefox |
| `company` | StrongDM, ThoughtWorks, Linear |
| `person` | Andrej Karpathy, Jensen Huang |
| `concept` | Lethal Trifecta, Normalization of Deviance |
| `paper` | CaMeL paper (Google DeepMind) |
| `blog-post` | Personal blogs, articles |

---

### `disagreements_and_nuance[]`

Points where speakers held different views, including how (or whether) the debate resolved.

```json
{
  "topic": "string",
  "positions": [
    { "speaker": "string", "position": "string" }
  ],
  "resolution": "string"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `topic` | string | What the disagreement is about |
| `positions` | object[] | One entry per speaker with their stated position |
| `resolution` | string | How it was resolved, or why it remains open |

The UI marks a debate as **Resolved** unless the resolution text contains "unresolved" or "open question".

---

### `topic_segments[]`

The episode broken into thematic sections in rough chronological order.

```json
{
  "approximate_position": "early",
  "topic": "string",
  "summary": "string"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `approximate_position` | string | Where in the episode this occurs |
| `topic` | string | Section heading |
| `summary` | string | What was covered |

**Position values** (in order)

```
early → early-mid → mid → mid-late → late
```

---

## Transcription pipeline

The `scripts/` directory contains `transcribe.py`, a Python script that downloads a YouTube video, transcribes it with NVIDIA Parakeet, and writes a structured `transcript.json` + plain-text `transcript.txt` to `scripts/output/<video-id>/`.

### Setup

```bash
cd scripts
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Local usage

```bash
# Public video — no auth needed
python transcribe.py https://www.youtube.com/watch?v=<id> --no-diarize

# Age-restricted or sign-in-required — read cookies from your local Chrome
python transcribe.py https://www.youtube.com/watch?v=<id> \
    --cookies-from-browser chrome --no-diarize
```

> **macOS note:** The first time you use `--cookies-from-browser chrome`, macOS will
> prompt for Keychain access (Chrome encrypts its cookies). Choose **Always Allow**
> to avoid being asked on every run.

### Headless server usage

On a server there is no browser, so you need to push cookies from your local
machine with `sync-cookies.sh`:

**1. Configure the script** — open `scripts/sync-cookies.sh` and set `REMOTE_SERVER`
to `user@your-server.com` (or export it as an env var).

**2. Run it from your local machine** whenever cookies need refreshing:

```bash
cd scripts
./sync-cookies.sh
# or: REMOTE_SERVER=user@your-server.com ./sync-cookies.sh
```

This exports cookies from your local Chrome and copies them to
`~/scripts/yt-cookies.txt` on the server.

**3. On the server**, run transcribe.py pointing at the file:

```bash
python transcribe.py https://www.youtube.com/watch?v=<id> \
    --cookies ~/scripts/yt-cookies.txt --no-diarize
```

Or set it once in your server's shell profile so you never need to pass the flag:

```bash
export YT_COOKIES_FILE=~/scripts/yt-cookies.txt
```

**When to refresh:** YouTube session cookies typically last 1–3 weeks. Refresh
when you see 403 or sign-in-required errors. If errors recur within hours, the
server IP may be flagged by YouTube's bot detection — cookie freshness alone
won't solve that.

---

## Database

The backend uses PostgreSQL via Prisma. Schema is in `prisma/schema.prisma`.

### Tables

| Table | Purpose |
|-------|---------|
| `users` | Google OAuth accounts |
| `transcripts` | Uploaded/generated analyses with visibility and status |
| `jobs` | Background pipeline jobs and their progress |

### Accessing the database

**Prisma Studio** (visual GUI, works with any `DATABASE_URL`):

```bash
npm run db:studio   # opens at http://localhost:5555
```

**psql** (local dev container):

```bash
docker compose exec postgres psql -U transcriber transcriber
```

Useful queries:

```sql
-- List all users
SELECT id, email, name, created_at FROM users;

-- List all transcripts with owner name
SELECT t.id, t.title, t.status, t.is_public, u.email, t.created_at
FROM transcripts t JOIN users u ON t.user_id = u.id
ORDER BY t.created_at DESC;

-- List all jobs
SELECT id, youtube_url, status, progress, created_at FROM jobs ORDER BY created_at DESC;
```

**GUI clients** — TablePlus and DBeaver both support PostgreSQL. Connect with `postgresql://transcriber:transcriber@localhost:5432/transcriber` for local dev.

---

## Tech stack

**Frontend**
- [Vite 5](https://vitejs.dev/) + [React 18](https://react.dev/) + TypeScript
- CSS Modules — no external CSS framework
- No client-side router — view state machine in `App.tsx`

**Backend**
- [Fastify](https://fastify.dev/) — HTTP server
- [Prisma](https://www.prisma.io/) — ORM
- PostgreSQL — database (local via Docker, production via Railway Postgres plugin)
- Google OAuth2 via `@fastify/oauth2`, server-side sessions via `@fastify/session`
