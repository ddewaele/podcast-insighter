# Pipeline Integration Plan: Node.js Backend to Python Transcription

## Problem

The app has a working frontend, a Fastify/Prisma backend, and a fake pipeline that returns canned data. The real Python transcription script (`scripts/transcribe.py`) exists and works standalone. We need to wire them together end-to-end — and answer hard questions about containerisation, security, job management, error handling, and timeouts along the way.

---

## Current State

| Component | Status |
|-----------|--------|
| Frontend (React + SSE progress) | Done |
| Backend (Fastify + Prisma + PostgreSQL) | Done |
| Job API + SSE streaming (`/api/jobs`) | Done (wired to fake pipeline) |
| Fake pipeline (`server/pipeline/fake.ts`) | Done — returns sample JSON after ~9 sec |
| Python script (`scripts/transcribe.py`) | Done — downloads YouTube audio, transcribes via Parakeet, writes JSON |
| Claude LLM analysis stage | Not started |

### What `transcribe.py` does today

```
YouTube URL → yt-dlp download → ffmpeg WAV conversion → Parakeet STT → (optional) pyannote diarization → transcript.json + transcript.txt
```

Output: `scripts/output/<video-id>/transcript.json` (structured segments with timestamps) + `transcript.txt` (plain text).

### What the full pipeline needs to do

```
YouTube URL → download audio → transcribe (STT) → generate analysis (Claude LLM) → structured JSON → store in DB
```

The Python script covers stages 1-2. Stage 3 (LLM analysis) is a new step. Stage 4 is already handled by the existing Job/Transcript DB models.

---

## Architecture Decision: How Does Node.js Call Python?

### Option A: `child_process.spawn` (same machine)

Node.js spawns `python3 scripts/transcribe.py <url>` as a child process, reads stdout for progress, and captures the output JSON.

```
┌─────────────────────────────────┐
│  Railway / VPS                  │
│                                 │
│  Fastify (Node.js)              │
│    └─ child_process.spawn()     │
│         └─ python3 transcribe.py│
│              └─ yt-dlp, ffmpeg  │
│              └─ Parakeet model  │
└─────────────────────────────────┘
```

**Pros:**
- Simplest architecture; no networking, no auth between services
- Progress reporting via stdout line protocol
- Works for single-server deployments (Railway, Hetzner VPS, local dev)

**Cons:**
- Python + PyTorch + NeMo must be installed alongside Node.js (large image)
- Ties the transcription to the web server process — a crash or OOM takes down the web app too
- Railway's container has limited memory (default 512 MB, configurable to 8 GB)
- Cannot scale web and transcription independently

### Option B: Separate container, HTTP API

Python runs in its own container with a minimal HTTP API. Node.js calls it over the network.

```
┌──────────────────┐        HTTP         ┌────────────────────────┐
│  Fastify (Node)  │ ──────────────────→ │  Transcription Worker  │
│  Railway app     │ ← SSE / polling     │  (Python + Parakeet)   │
│  Port 3001       │                     │  Port 8000             │
└──────────────────┘                     └────────────────────────┘
         │                                         │
         └──── both connect to ────────────────────┘
                    PostgreSQL
              (postgres.railway.internal)
```

**Pros:**
- Clean separation — web app stays lightweight, worker can have a heavy image
- Worker can run on GPU hardware (different Railway service, Hetzner, or spot GPU)
- Worker crash doesn't take down the API
- Can scale independently

**Cons:**
- Two services to deploy and manage
- Need an API contract between them
- Need to secure the worker endpoint (not publicly accessible)

### Option C: Task queue (BullMQ + Redis)

Node.js enqueues a job into Redis. A separate Python (or Node.js + child_process) worker picks it up.

**Pros:**
- Built-in retries, backoff, concurrency limits, job persistence
- Jobs survive server restarts

**Cons:**
- Adds Redis as infrastructure dependency
- More moving parts for a personal/low-volume tool

### Recommendation

**Start with Option B (separate container, HTTP API).** It's the right balance:

- The Python image is ~4 GB (PyTorch + NeMo + ffmpeg). Bundling it with the 200 MB Node.js app image creates a bloated deployment and couples their lifecycles.
- On Railway, the worker runs as a second service on the private network (`worker.railway.internal`) — no public endpoint, no auth needed between services.
- For local dev, both run via `docker compose`.
- If you later need a GPU, you just move the worker to a different host — the Node.js backend doesn't change.
- BullMQ (Option C) can be added on top later if job persistence becomes important. For now, the Job table in PostgreSQL provides enough state tracking.

---

## Worker Service Design

### Container image

```dockerfile
FROM python:3.11-slim

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python dependencies (large — cached in its own layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY . .

# Pre-download the Parakeet model so first job doesn't block on a 1.2 GB download
RUN python -c "import nemo.collections.asr as nemo_asr; nemo_asr.models.ASRModel.from_pretrained('nvidia/parakeet-tdt-0.6b-v2')"

EXPOSE 8000
CMD ["python", "worker.py"]
```

**Image size:** ~4-5 GB (PyTorch + NeMo + model weights baked in). Large, but it's built once and cached.

### HTTP API (`worker.py`)

A minimal FastAPI (or plain Flask) server with two endpoints:

```
POST /transcribe
  Body: { "youtube_url": "...", "job_id": "...", "callback_url": "..." }
  Response: 202 Accepted
  → Starts transcription in background thread/process
  → POSTs progress updates to callback_url as work progresses

GET /health
  Response: { "status": "ok", "model_loaded": true, "busy": false }
```

The worker does NOT need to know about the database. It:
1. Receives a YouTube URL
2. Downloads and transcribes it
3. POSTs progress updates back to the Node.js backend (or writes to a shared queue)
4. Returns the final transcript JSON via the callback

This keeps the worker stateless and reusable.

### Progress reporting: callback vs polling vs shared DB

| Approach | How it works | Complexity |
|----------|-------------|------------|
| **Callback (webhook)** | Worker POSTs to `http://app.railway.internal:3001/api/jobs/:id/progress-update` as each stage completes | Low — worker fires HTTP requests; backend receives and broadcasts to SSE clients |
| **Polling** | Backend polls `GET worker:8000/jobs/:id/status` every few seconds | Simplest but wastes resources and adds latency |
| **Shared DB** | Worker writes progress directly to the `jobs` table in PostgreSQL | Requires giving the worker DB access; tighter coupling |

**Recommendation: Callback (webhook).** The worker POSTs progress events to the backend. The backend updates the Job record and broadcasts to SSE subscribers — exactly as the fake pipeline does today, just triggered by HTTP instead of in-process function calls.

```
Worker                              Backend                         Browser
  │                                    │                               │
  │ POST /internal/jobs/:id/progress   │                               │
  │ { stage, pct, detail }             │                               │
  │ ──────────────────────────────→    │                               │
  │                                    │ UPDATE jobs SET status=...    │
  │                                    │ SSE: data: {stage, pct, ...}  │
  │                                    │ ────────────────────────────→ │
```

### Securing the worker

The worker must not be callable from the public internet. Two layers:

**1. Network isolation (primary)**

On Railway: the worker service has **no public domain** — only a private hostname (`worker.railway.internal`). It's unreachable from outside Railway's network. This is the same pattern used for Postgres.

On Docker Compose (local dev): the worker is on an internal Docker network. Only the backend connects to it.

**2. Shared secret (defense in depth)**

Even on a private network, add a shared API key as a header:

```
# Backend → Worker request
POST http://worker.railway.internal:8000/transcribe
Authorization: Bearer ${WORKER_API_KEY}
```

```python
# Worker validates
if request.headers.get("Authorization") != f"Bearer {os.environ['WORKER_API_KEY']}":
    return Response(status_code=401)
```

`WORKER_API_KEY` is a random string set as an environment variable on both services.

**3. Callback URL validation**

The worker only POSTs progress to the callback URL provided in the original request. To prevent the worker from being tricked into calling arbitrary URLs (if somehow compromised), validate that the callback URL matches the expected backend hostname:

```python
ALLOWED_CALLBACK_HOSTS = [
    "app.railway.internal",      # Railway private network
    "host.docker.internal:3001", # Docker compose local dev
    "localhost:3001",            # Local dev
]
```

---

## Job Lifecycle and State Machine

### States

```
         ┌──────────┐
         │  queued   │  ← Job created, waiting for worker
         └────┬─────┘
              │ Worker accepts job
              ▼
       ┌──────────────┐
       │ downloading   │  ← yt-dlp fetching audio
       └──────┬───────┘
              │
              ▼
       ┌──────────────┐
       │ transcribing  │  ← Parakeet STT running
       └──────┬───────┘
              │
              ▼
       ┌──────────────┐
       │  analyzing    │  ← Claude LLM processing (new stage)
       └──────┬───────┘
              │
         ┌────┴─────┐
         ▼          ▼
    ┌────────┐ ┌─────────┐
    │  done  │ │  error  │
    └────────┘ └─────────┘
```

### New stage: `analyzing`

The current fake pipeline has three stages: `downloading → transcribing → processing`. The real pipeline replaces `processing` with `analyzing` — this is where the raw transcript is sent to the Claude API to produce the structured analysis JSON.

This stage can run either:
- **In the worker** — worker calls Claude API, returns the final analysis JSON
- **In the backend** — worker returns the raw transcript, backend calls Claude API

**Recommendation: In the worker.** Keeps the backend thin and means the worker is a self-contained "URL in → analysis JSON out" service. The Claude API key is set as an env var on the worker only.

---

## Error Handling

### Error categories and responses

| Error | Stage | Detection | User experience | Retry? |
|-------|-------|-----------|----------------|--------|
| Private/age-restricted video | downloading | yt-dlp exit code + stderr | "This video is private or age-restricted" | No — user must provide cookies or different URL |
| Video not found / invalid URL | downloading | yt-dlp exit code | "Video not found" | No |
| Network timeout during download | downloading | yt-dlp timeout | "Download timed out — try again" | Yes, once |
| Out of memory (Parakeet model load) | transcribing | OOM signal / process crash | "Transcription failed — server out of memory" | No — needs manual intervention |
| Transcription crash | transcribing | Non-zero exit code | "Transcription failed unexpectedly" | Yes, once |
| Claude API rate limit | analyzing | 429 response | "Analysis service busy — retrying..." | Yes, with backoff |
| Claude returns invalid JSON | analyzing | Zod validation failure | Retry silently (up to 3x) | Yes, up to 3x |
| Claude timeout (> 60s) | analyzing | Request timeout | Retry once with simpler prompt | Yes, once |
| Worker unreachable | queued | Connection refused / timeout | "Processing service temporarily unavailable" | Yes, with backoff |

### Retry strategy

```typescript
const RETRY_CONFIG = {
  maxRetries: 2,                    // Total attempts = 3 (1 original + 2 retries)
  retryableStages: ['downloading', 'transcribing', 'analyzing'],
  backoff: {
    downloading: [5_000, 15_000],   // 5s, 15s
    transcribing: [10_000, 30_000], // 10s, 30s (model might need time to recover)
    analyzing: [5_000, 15_000],     // 5s, 15s (Claude rate limits)
  },
}
```

### Error propagation flow

```
Worker encounters error
  │
  ├─ Is it retryable? → Retry with backoff
  │     └─ Still fails after max retries → POST error to callback
  │
  └─ Not retryable → POST error to callback immediately

Backend receives error callback
  │
  ├─ UPDATE jobs SET status='error', detail='...'
  ├─ UPDATE transcripts SET status='error', error_message='...'
  └─ Broadcast SSE: { stage: 'error', detail: '...' }
```

---

## Timeout Management

Long-running transcriptions (15-45 minutes on CPU) need careful timeout handling at every layer.

### Layer-by-layer timeouts

| Layer | Timeout | Why |
|-------|---------|-----|
| Browser → Backend (SSE) | None (persistent connection) | SSE is designed for long-lived connections; browser auto-reconnects if dropped |
| Backend → Worker (initial POST) | 30 seconds | Just the handshake — worker should accept the job quickly |
| Worker → yt-dlp | 5 minutes | Download should complete within this; if not, likely a network issue |
| Worker → Parakeet | 60 minutes | A 2-hour podcast on slow CPU could take 45+ min |
| Worker → Claude API | 120 seconds | Claude rarely takes longer; if it does, retry |
| Worker → Backend (callback) | 10 seconds | Backend should be responsive; if not, retry callback |

### Heartbeats

The worker sends periodic heartbeat callbacks during long stages to prove it's still alive:

```
POST /internal/jobs/:id/progress
{ "stage": "transcribing", "pct": 35, "detail": "Transcribing... chunk 4/18" }
```

If the backend hasn't received a heartbeat for **5 minutes**, it marks the job as `error` with detail "Worker stopped responding". The SSE client receives this and can offer a retry button.

### SSE reconnection

If the browser's SSE connection drops (network blip, laptop sleep), `EventSource` auto-reconnects. The backend should:
1. Send the current job state immediately on reconnect (already implemented — if job is done/error, the SSE endpoint returns the final state)
2. Buffer the last few events so a reconnecting client doesn't miss progress jumps (nice-to-have, not critical)

### Railway-specific timeouts

Railway has a **30-second request timeout** for HTTP requests. This does NOT affect:
- SSE connections (they're long-lived and Railway respects them)
- The worker's internal processing (not an HTTP request once accepted)

But it DOES affect:
- The `POST /transcribe` request from backend to worker — so the worker must accept the job and return `202 Accepted` immediately, then process in the background

---

## Docker Compose: Local Development

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: transcriber
      POSTGRES_PASSWORD: transcriber
      POSTGRES_DB: transcriber
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  app:
    build: .
    ports:
      - "3001:3001"
    depends_on:
      postgres:
        condition: service_healthy
    env_file:
      - .env
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://transcriber:transcriber@postgres:5432/transcriber
      WORKER_URL: http://worker:8000
      WORKER_API_KEY: dev-worker-key

  worker:
    build:
      context: ./scripts
      dockerfile: Dockerfile.worker
    environment:
      WORKER_API_KEY: dev-worker-key
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    # No ports exposed — only reachable from the app service
    # For GPU: uncomment the deploy section below
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: 1
    #           capabilities: [gpu]

volumes:
  postgres_data:
```

For local dev without Docker (faster iteration):
```bash
# Terminal 1: Postgres
docker compose up postgres -d

# Terminal 2: Worker (uses local Python venv)
cd scripts && source .venv/bin/activate && python worker.py

# Terminal 3: App
npm run dev:all
```

---

## Railway Deployment

```
┌─────────────────────────────────────────────────────────┐
│  Railway Project                                         │
│                                                          │
│  ┌───────────────┐  private  ┌─────────────────────┐    │
│  │  app (Node.js)│ ────────→ │  worker (Python)    │    │
│  │  Public domain│           │  No public endpoint │    │
│  └──────┬────────┘           └─────────┬───────────┘    │
│         │                              │                 │
│         │         ┌──────────┐         │                 │
│         └────────→│ Postgres │←────────┘                 │
│                   │ Private  │  (only if worker needs    │
│                   └──────────┘   direct DB access)       │
└─────────────────────────────────────────────────────────┘
```

### Service configuration

**App service** (existing):
- Source: main repo
- Public domain: `podcast-insighter-production.up.railway.app`
- Variables: add `WORKER_URL=http://worker.railway.internal:8000` and `WORKER_API_KEY`

**Worker service** (new):
- Source: same repo, custom Dockerfile path: `scripts/Dockerfile.worker`
- **No public domain** — private network only
- Variables: `WORKER_API_KEY`, `ANTHROPIC_API_KEY`, `HF_TOKEN` (for pyannote diarization)
- Resources: 8 GB RAM minimum (for Parakeet model)

**Postgres** (existing):
- Private network only (already configured)

---

## New Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `WORKER_URL` | App service | URL of the worker (`http://worker.railway.internal:8000` on Railway, `http://worker:8000` in Docker Compose) |
| `WORKER_API_KEY` | App + Worker | Shared secret for backend → worker authentication |
| `ANTHROPIC_API_KEY` | Worker | Claude API key for the analysis stage |
| `HF_TOKEN` | Worker | HuggingFace token for pyannote diarization model |

---

## Implementation Plan

### Phase 1: Worker service scaffold

1. Create `scripts/Dockerfile.worker` with Python 3.11, ffmpeg, PyTorch, NeMo, model pre-download
2. Create `scripts/worker.py` — FastAPI app with `POST /transcribe` and `GET /health`
3. Add the worker to `docker-compose.yml`
4. Verify: `docker compose up worker` starts, `/health` returns OK, model is loaded

### Phase 2: Wire transcription (download + STT only)

5. Implement `POST /transcribe` — accepts `{ youtube_url, job_id, callback_url }`
6. Worker calls existing `transcribe.py` logic (refactor into importable module)
7. Worker POSTs progress callbacks to the backend at each stage
8. Backend receives callbacks at a new `POST /internal/jobs/:id/progress-update` route
9. Backend updates the Job record and broadcasts to SSE — same as fake pipeline
10. Verify: submit a YouTube URL → see real download + transcription progress in the frontend

### Phase 3: Add Claude LLM analysis stage

11. Add `ANTHROPIC_API_KEY` to the worker
12. After transcription, worker sends the raw transcript to Claude API with the analysis prompt
13. Validate the response against the `TranscriptAnalysis` schema (Pydantic on Python side)
14. Retry up to 3x on invalid JSON
15. Return the full analysis JSON via the final callback
16. Backend stores it in `transcripts.json_data`
17. Verify: submit a URL → get a real, usable analysis JSON → dashboard renders it

### Phase 4: Error handling and resilience

18. Add retry logic to the worker (download retries, transcription retries)
19. Add heartbeat callbacks during long transcription stages
20. Add stale job detection in the backend (no heartbeat for 5 minutes → mark as error)
21. Surface clear error messages in the frontend for each failure mode
22. Add a "Retry" button on failed jobs in the UI

### Phase 5: Production hardening

23. Add `WORKER_API_KEY` validation on both sides
24. Add callback URL validation in the worker
25. Add resource limits in docker-compose and Railway config
26. Add logging and basic observability (job duration, error rates)
27. Update README and CLAUDE.md with the new architecture

---

## Open Questions

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Where to run the Claude API call? | Worker (self-contained) vs backend (keeps API key out of worker) | Worker — keeps backend thin, worker is already trusted |
| 2 | Should the worker connect to PostgreSQL directly? | Yes (simpler progress updates) vs no (callback only, loosely coupled) | No — callbacks keep the worker stateless and reusable |
| 3 | Diarization on or off by default? | On (better quality, needs HF_TOKEN) vs off (simpler, no HF dependency) | Off by default, on if `HF_TOKEN` is set |
| 4 | What if Railway's 8 GB is not enough for Parakeet? | Reduce model size, use faster-whisper, or move worker to Hetzner | Cross that bridge when we hit it — Parakeet uses ~4-6 GB, should fit |
| 5 | Should we support re-running just the analysis stage? | Yes (saves re-downloading and re-transcribing) vs no (simpler) | Yes (later) — store the raw transcript, allow re-analysis |
| 6 | Keep the fake pipeline for dev/testing? | Yes (frontend dev without worker) vs remove it | Yes — keep it behind an env flag (`USE_FAKE_PIPELINE=true`) |

---

## Cost Impact

| Component | Cost (per podcast) | Cost (monthly, 20 podcasts) |
|-----------|-------------------|---------------------------|
| STT (Parakeet on Railway 8 GB) | $0 (compute included in Railway plan) | $0 |
| Claude API (Sonnet, ~20k input + 5k output tokens) | ~$0.10-0.15 | ~$2-3 |
| Railway app service | — | ~$5 (Hobby plan) |
| Railway worker service | — | ~$5-10 (8 GB RAM) |
| Railway Postgres | — | ~$5 (included in Hobby) |
| **Total** | **~$0.10-0.15 per podcast** | **~$15-20/month** |

Compare to managed STT (AssemblyAI): ~$0.50/podcast = ~$10/month for STT alone, plus the same Claude API and Railway costs.
