# Extension Plan: YouTube Podcast Transcription Pipeline

## Overview

Extend TranscriberUI from a static drag-and-drop viewer into a full pipeline application. The user provides a YouTube URL; the backend downloads the audio, transcribes it locally, runs it through an AI processing pipeline, and delivers a structured JSON file that the frontend can display — all within a single Node.js web application.

---

## Functional Analysis

### User journey

```
User pastes YouTube URL
        ↓
Frontend validates and submits the URL
        ↓
Backend starts a job and returns a job ID
        ↓
Frontend listens to SSE stream for live progress
        ↓
  [step 1] Audio downloaded from YouTube       (~30 sec)
  [step 2] Audio transcribed locally (STT)     (~5–20 min depending on hardware)
  [step 3] Raw transcript processed by LLM     (~30–90 sec)
  [step 4] Structured JSON generated & stored
        ↓
Frontend receives the JSON and renders the dashboard
```

### Functional requirements

| # | Requirement |
|---|-------------|
| F1 | Accept a YouTube URL as input |
| F2 | Validate the URL (accessible, has audio, not private/age-restricted) |
| F3 | Show real-time pipeline progress to the user via SSE |
| F4 | Handle long podcasts (60–120+ minutes) gracefully |
| F5 | Identify speaker turns (diarization) |
| F6 | Allow re-processing: re-run the LLM stage without re-downloading or re-transcribing |
| F7 | Store generated JSONs so the user can retrieve past results |
| F8 | Retain the existing drag-and-drop mode unchanged |
| F9 | Surface clear, human-readable error messages for each failure mode |

### Pipeline stages

```
┌─────────────────────────────────────────────────────────┐
│  Stage 1 — Download                                     │
│  Input:  YouTube URL                                    │
│  Output: audio file (.mp3) on disk                      │
│  Tool:   yt-dlp                                         │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  Stage 2 — Transcription (STT)                          │
│  Input:  audio file                                     │
│  Output: timestamped transcript with speaker labels     │
│  Tool:   NVIDIA Parakeet (local) + pyannote diarization │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  Stage 3 — LLM Processing                               │
│  Input:  raw transcript text                            │
│  Output: structured JSON matching the defined schema    │
│  Tool:   Claude API (claude-sonnet-4-6 recommended)     │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  Stage 4 — Delivery                                     │
│  Input:  structured JSON                                │
│  Output: JSON stored on disk + pushed to frontend       │
└─────────────────────────────────────────────────────────┘
```

### Error handling scenarios

| Scenario | Expected behaviour |
|----------|--------------------|
| Private or age-restricted video | Fail fast at stage 1 with a clear message |
| Video has no audio track | Fail at stage 1 |
| STT process crashes or OOMs | Retry once; if it fails again, surface the error |
| Transcript too long for LLM context | Split into overlapping chunks, process each, merge |
| LLM returns malformed JSON | Retry with stricter prompting up to 3 times |
| Network loss mid-download | Re-attempt stage 1; stages 2–4 are checkpointed |

---

## Technical Analysis

### Backend framework: Fastify

[Fastify](https://fastify.dev/) is the right choice over Express for this project:

- **First-class TypeScript support** — ships with full type definitions, no `@types/express` bolted on
- **Built-in JSON schema validation** via [Ajv](https://ajv.js.org/) — request bodies are validated automatically using schemas, no extra middleware
- **Plugin architecture** — clean separation of concerns; SSE, CORS, and static file serving are all official plugins
- **Performance** — ~2–3× faster than Express on raw throughput (not the bottleneck here, but it's free)
- **Lifecycle hooks** — `onRequest`, `preHandler`, `onSend` hooks make logging and auth easy to add later
- **`@fastify/reply-from`** is not needed for SSE — Fastify's raw `reply.raw` gives direct access to the Node.js response stream

Express would work fine for this scale, but Fastify's native TypeScript integration and schema validation reduce boilerplate meaningfully, especially when validating the YouTube URL input and the LLM output.

### Repository structure

```
TranscriberUI/
├── src/                        # existing Vite frontend (unchanged)
├── server/
│   ├── index.ts                # Fastify app entry point
│   ├── plugins/
│   │   ├── cors.ts             # @fastify/cors
│   │   └── static.ts           # @fastify/static (serves built frontend)
│   ├── routes/
│   │   ├── jobs.ts             # POST /api/jobs, GET /api/jobs/:id
│   │   ├── progress.ts         # GET /api/jobs/:id/progress (SSE)
│   │   └── results.ts          # GET /api/results, GET /api/results/:id
│   ├── pipeline/
│   │   ├── download.ts         # Stage 1: yt-dlp wrapper
│   │   ├── transcribe.ts       # Stage 2: Parakeet + diarization
│   │   ├── process.ts          # Stage 3: Claude LLM
│   │   └── index.ts            # Orchestrator, emits progress events
│   ├── queue/
│   │   └── jobQueue.ts         # BullMQ job queue
│   └── storage/
│       └── store.ts            # File-based job/result persistence
├── shared/
│   └── types.ts                # Schema types shared by frontend and backend
├── scripts/
│   └── transcribe.py           # Python script that runs Parakeet headlessly
├── doc/
├── output/                     # Generated JSON files
├── tmp/                        # Temporary audio files during processing
├── package.json
└── vite.config.ts
```

---

### Stage 1 — Audio download: yt-dlp

[yt-dlp](https://github.com/yt-dlp/yt-dlp) is the most reliable YouTube extractor available. It handles format negotiation, age gates (with cookies), live streams, and private video detection automatically.

- Called from Node.js via `child_process.spawn`
- System binary, not an npm package (`brew install yt-dlp`)
- Stdout is streamed to capture download progress percentage

```bash
yt-dlp \
  --format bestaudio \
  --extract-audio \
  --audio-format mp3 \
  --audio-quality 0 \
  --output "tmp/%(id)s.%(ext)s" \
  <URL>
```

**Alternative:** [`@distube/ytdl-core`](https://github.com/distubejs/ytdl-core) is a maintained Node.js fork, but it breaks more often as YouTube updates its internals. yt-dlp's community patches it faster.

---

### Stage 2 — Transcription: NVIDIA Parakeet (local)

#### Why local is the right call here

Running Parakeet locally eliminates the per-minute STT cost entirely, which is the largest variable cost per podcast at scale. The model quality is comparable to cloud providers.

#### What Parakeet TDT 0.6B V3 is

[NVIDIA Parakeet](https://huggingface.co/nvidia) is a family of ASR (automatic speech recognition) models based on NVIDIA's NeMo framework. The TDT (Token-and-Duration Transducer) variant at 0.6B parameters is fast and accurate, with word-level timestamps built in. You are currently running it via Spokenly on macOS.

#### Running it headlessly on a server

Spokenly is a macOS GUI wrapper. The underlying model runs via Python and can be invoked headlessly without a UI:

```python
# scripts/transcribe.py
import nemo.collections.asr as nemo_asr
import sys, json

model = nemo_asr.models.ASRModel.from_pretrained("nvidia/parakeet-tdt-0.6b-v2")
result = model.transcribe([sys.argv[1]], timestamps=True)
print(json.dumps(result))
```

Node.js calls this script via `child_process.spawn('python3', ['scripts/transcribe.py', audioPath])` and reads the JSON output from stdout.

**Dependencies (Python side):**
- `nemo_toolkit[asr]` — NeMo framework ([github.com/NVIDIA/NeMo](https://github.com/NVIDIA/NeMo))
- `torch` — PyTorch backend
- Model weights are downloaded automatically on first run (~1.2 GB, cached thereafter)

#### Hardware requirements

| Environment | Transcription speed for 90 min audio | Notes |
|-------------|--------------------------------------|-------|
| Mac M-series (Apple Silicon, local) | ~5–10 min | Metal GPU acceleration via PyTorch MPS |
| Linux server + NVIDIA GPU (T4/A10) | ~3–6 min | CUDA acceleration |
| Linux server, CPU only | ~25–45 min | Viable but slow for a user-facing tool |

**Recommendation for server deployment:** A CPU-only VPS is technically viable but makes the pipeline feel slow. If deploying to a server, a GPU instance (AWS `g4dn.xlarge` or equivalent) or a VPS with an attached GPU is worth the extra cost given the STT cost savings.

For local use on your MacBook M-series, the existing setup translates directly — NeMo supports Apple Silicon via the MPS backend.

#### Speaker diarization

Parakeet TDT handles transcription but not speaker diarization natively. To identify who is speaking, add [pyannote.audio](https://github.com/pyannote/pyannote-audio), which runs as a second Python pass on the same audio file and returns time-coded speaker labels that are merged with the Parakeet transcript.

```
Audio → Parakeet → timestamped text
Audio → pyannote → speaker segments (Speaker A: 0:00–0:42, Speaker B: 0:42–1:15, ...)
Merge → "Speaker A: [text from 0:00–0:42]  Speaker B: [text from 0:42–1:15]"
```

pyannote requires a free HuggingFace token to download the diarization model.

#### Alternative: faster-whisper

If Parakeet proves difficult to set up on a server (NeMo's dependency tree is large), [faster-whisper](https://github.com/SYSTRAN/faster-whisper) is an excellent fallback. It's a CTranslate2-based reimplementation of OpenAI Whisper that runs 4× faster than the original with lower memory usage, supports CPU and GPU, and has a simpler install (`pip install faster-whisper`). Diarization still requires pyannote.

[whisper.cpp](https://github.com/ggerganov/whisper.cpp) is another option — a pure C++ port with no Python dependency, callable from Node.js directly. Lower quality than Parakeet but extremely portable.

---

### Should you speed up the audio before transcribing?

**No — do not speed up the audio in the automated pipeline.**

Speeding up audio for human listening (1.5×) is a good habit that saves time. But for automated STT it provides no benefit and introduces risk:

1. **STT is already faster than real-time.** Parakeet processes a 90-minute audio file in 5–10 minutes — it is not real-time. There is no time to save by shortening the audio.
2. **Speed-up algorithms alter phoneme duration.** Time-stretching compresses vowels and consonants in ways that STT models are not trained on. This can measurably reduce accuracy, particularly on fast speakers and technical vocabulary.
3. **Pitch preservation is imperfect.** Most speed-up algorithms shift pitch slightly even when trying to preserve it, further diverging from natural speech patterns.

Keep the audio at 1× for the pipeline. The speed-up habit is fine for your own ears; it is not helpful for the model.

---

### Stage 3 — LLM processing: Claude API

- **SDK:** [`@anthropic-ai/sdk`](https://docs.anthropic.com/) (Node.js)
- **Model selection:** `claude-sonnet-4-6` is the right default — good reasoning, significantly cheaper than Opus, fast enough for this use case. Opus is worth trying if output quality is noticeably lacking.
- **Context:** Claude's 200k token window handles ~150k words — far more than any podcast transcript.
- **Output:** Request JSON inside `<json>` tags, validate against the schema with [Zod](https://zod.dev/), retry on validation failure.

**Long transcript strategy:** If the transcript exceeds 80k tokens (roughly a 5-hour podcast), split it into overlapping chunks of ~60k tokens with a ~5k token overlap, process each independently, then run a final merge pass asking Claude to reconcile the partial outputs.

---

### Progress reporting: Server-Sent Events (SSE)

SSE is the right transport — unidirectional, no WebSocket overhead, native browser support via `EventSource`.

```
GET /api/jobs/:id/progress  →  Content-Type: text/event-stream

data: {"stage":"download",   "status":"running", "pct":0,   "detail":"Fetching audio..."}
data: {"stage":"download",   "status":"done",    "pct":20,  "detail":"90.3 MB downloaded"}
data: {"stage":"transcribe", "status":"running", "pct":20,  "detail":"Loading model..."}
data: {"stage":"transcribe", "status":"running", "pct":35,  "detail":"Transcribing..."}
data: {"stage":"transcribe", "status":"done",    "pct":60,  "detail":"14,203 words"}
data: {"stage":"process",    "status":"running", "pct":60,  "detail":"Sending to Claude..."}
data: {"stage":"process",    "status":"done",    "pct":100, "detail":"JSON validated"}
data: {"stage":"done",       "resultId":"abc123"}
```

In Fastify, this is implemented by holding a reference to `reply.raw` (the raw Node.js `ServerResponse`) and writing to it directly as each pipeline stage completes.

---

### Job queue: BullMQ

[BullMQ](https://bullmq.io/) backed by [Redis](https://redis.io/) handles:
- Queuing jobs so multiple requests don't run simultaneously and exhaust memory
- Retries with exponential backoff on transient failures
- Job persistence across server restarts
- Progress events from worker back to the HTTP layer

**MVP alternative without Redis:** A simple async queue using `p-queue` with in-memory state. Simpler to set up, but jobs are lost if the server restarts mid-pipeline. Fine for a personal/local tool.

---

### Cost estimates

All estimates assume a 90-minute podcast (~13,500 spoken words, ~18,000 tokens).

#### Per-podcast variable costs

| Component | Local (recommended) | Cloud fallback |
|-----------|---------------------|----------------|
| Audio download (yt-dlp) | $0 | $0 |
| Transcription (Parakeet local) | $0 | $0.56 (AssemblyAI) / $0.54 (Whisper API) |
| LLM — claude-sonnet-4-6 | ~$0.10–0.15 | same |
| LLM — claude-opus-4-6 | ~$0.45–0.70 | same |
| **Total (local STT + Sonnet)** | **~$0.10–0.15** | — |
| **Total (local STT + Opus)** | **~$0.45–0.70** | — |
| **Total (cloud STT + Sonnet)** | — | **~$0.65–0.70** |

> Claude API pricing changes periodically — verify current rates at [docs.anthropic.com](https://docs.anthropic.com/). The token estimates above (20k input, 5k output) are based on typical podcast length and a moderately detailed system prompt.

#### Fixed infrastructure costs

| Scenario | Monthly cost |
|----------|-------------|
| **Run locally on your MacBook** | $0 (just electricity) |
| Cheap CPU VPS (4 vCPU, 8 GB RAM) | ~$15–25/month — transcription is slow (~40 min per podcast) |
| GPU cloud instance (NVIDIA T4, e.g. AWS `g4dn.xlarge`) | ~$0.53/hr on-demand; ~$150/month if always-on |
| GPU VPS (e.g. Hetzner, Lambda Labs) | ~$60–120/month for a dedicated GPU VPS |

**Cheapest production setup:** Run locally on your MacBook for personal use (near-zero cost). If you want a server, a CPU VPS at $20/month + Claude API at $0.10–0.15/podcast is the most cost-efficient — transcription takes longer but is perfectly usable for non-interactive batch processing.

**GPU server only makes sense if** you are processing many podcasts per day and the 40-min CPU transcription time is a UX problem.

---

### API design

```
POST   /api/jobs              Submit a YouTube URL → { jobId }
GET    /api/jobs/:id          Job status and metadata
GET    /api/jobs/:id/progress SSE stream of pipeline events
GET    /api/results           List all completed analyses
GET    /api/results/:id       Return the final analysis JSON
DELETE /api/jobs/:id          Cancel a running job or delete a result
```

---

### Frontend changes

Minimal and additive — the existing dashboard requires no changes:

1. **Entry screen:** Add a YouTube URL input alongside the existing drop zone (two modes, one screen).
2. **Progress view:** New component subscribing to the SSE stream; renders stage-by-stage pipeline progress.
3. **Result handoff:** When SSE signals `done`, fetch `GET /api/results/:id` and pass the JSON to the existing `Dashboard`.
4. **Results list:** Optional — a page listing past analyses using `GET /api/results`.

---

### Dependency summary

| Dependency | Purpose | Link |
|------------|---------|------|
| `fastify` | HTTP server | [fastify.dev](https://fastify.dev/) |
| `@fastify/cors` | CORS plugin | [fastify.dev/docs/latest/Reference/Plugins](https://fastify.dev/docs/latest/Reference/Plugins) |
| `@fastify/static` | Serve built frontend | same |
| `bullmq` | Job queue with retries | [bullmq.io](https://bullmq.io/) |
| `ioredis` | Redis client for BullMQ | [redis.io](https://redis.io/) |
| `@anthropic-ai/sdk` | Claude LLM processing | [docs.anthropic.com](https://docs.anthropic.com/) |
| `zod` | Schema validation of LLM output | [zod.dev](https://zod.dev/) |
| `tsx` | Run TypeScript in development | [github.com/privatenumber/tsx](https://github.com/privatenumber/tsx) |
| `yt-dlp` *(system)* | YouTube audio download | [github.com/yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp) |
| `nemo_toolkit[asr]` *(Python)* | NVIDIA Parakeet ASR | [github.com/NVIDIA/NeMo](https://github.com/NVIDIA/NeMo) |
| `pyannote.audio` *(Python)* | Speaker diarization | [github.com/pyannote/pyannote-audio](https://github.com/pyannote/pyannote-audio) |
| `faster-whisper` *(Python, alt)* | Alternative STT if NeMo is too heavy | [github.com/SYSTRAN/faster-whisper](https://github.com/SYSTRAN/faster-whisper) |

---

### Open decisions

| # | Decision | Options |
|---|----------|---------|
| 1 | **STT on server** | Parakeet via NeMo (best quality, heavier install) vs. faster-whisper (simpler install, slightly lower quality) |
| 2 | **Job queue** | BullMQ + Redis (robust, persistent) vs. in-memory p-queue (no infra, MVP) |
| 3 | **LLM model** | claude-sonnet-4-6 (default) vs. claude-opus-4-6 (higher quality, ~4× cost) — could be user-selectable |
| 4 | **Audio retention** | Delete after transcription (saves disk) vs. keep for potential re-transcription |
| 5 | **Deployment target** | Local MacBook only vs. hosted server (determines GPU question) |

---

## Suggested implementation order

1. **Backend scaffold** — Fastify server, folder structure, TypeScript config, dev script alongside Vite
2. **Download stage** — yt-dlp wrapper, error detection (private/age-gated videos)
3. **STT stage** — Python script wrapping Parakeet, Node.js `child_process` caller, transcript storage
4. **Diarization** — pyannote pass, merge with Parakeet output
5. **LLM stage** — Claude prompt, Zod schema validation, retry logic
6. **Job queue** — BullMQ wiring, progress event emission at each stage transition
7. **SSE endpoint** — Fastify route streaming progress events to the browser
8. **Frontend: URL mode** — URL input, progress component, result delivery to existing Dashboard
9. **Frontend: results list** — browse and re-open past analyses
