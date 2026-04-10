# TranscriberUI

A Vite + React frontend for visualizing structured podcast transcript analysis. Drop a JSON file in — no backend required.

**Dev server:** `npm run dev` → http://localhost:5180

---

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:5180, drag your `transcript_analysis.json` onto the drop zone, and explore.

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

## Tech stack

- [Vite 5](https://vitejs.dev/) + [React 18](https://react.dev/) + TypeScript
- CSS Modules — no external CSS framework
- No router, no backend — purely client-side
