# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository overview

Two loosely coupled parts that share a data contract (the `TranscriptAnalysis` JSON schema):

1. **`scripts/`** — Python pipeline: downloads YouTube audio, transcribes via NVIDIA Parakeet / NeMo, optionally diarizes speakers, and writes `transcript.json` + `transcript.txt` to `output/<video_id>/`.
2. **`src/`** — Vite + React + TypeScript frontend: a read-only viewer that accepts a `transcript_analysis.json` (produced by the `transcript-analyzer` Claude Code skill) and renders it across six tabs.

## Commands

### Frontend
```bash
npm run dev       # dev server (http://localhost:5173)
npm run build     # tsc + vite build — always run before committing to verify no type errors
npm run preview   # serve the dist/ build locally
```
There are no tests and no linter configured.

### Python pipeline
```bash
cd scripts
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Basic usage (diarization on by default — requires HF_TOKEN env var)
python transcribe.py <youtube-url>

# Common flags
python transcribe.py <url> --no-diarize                          # skip speaker diarization
python transcribe.py <url> --cookies-from-browser chrome         # use browser cookies
python transcribe.py <url> --cookies yt-cookies.txt              # use a cookie file
python transcribe.py <url> --audio-file /path/to/local.mp3       # skip download entirely
python transcribe.py <url> --output-dir ./output --keep-audio    # persist audio

# Sync YouTube cookies from local browser to remote server
REMOTE_SERVER=user@host REMOTE_PATH=~/scripts/yt-cookies.txt bash sync-cookies.sh
```

Output lands in `output/<video_id>/`: `transcript.json`, `transcript.txt`, cached `audio.mp3`, `audio_16k.wav`, `meta.json`.  
Re-running with the same video ID skips the download/conversion stages automatically.

## Frontend architecture

**No backend, no router.** The entire app is a single-page, file-driven viewer.

### Data flow
```
Drop JSON file → App.tsx (useState) → Dashboard → one of six tab components
```
`App.tsx` holds two pieces of state: `data: TranscriptAnalysis | null` and `theme: 'dark' | 'light'`. When `data` is null it renders `<DropZone>`; once a file is parsed it renders `<Dashboard>`. `theme` and its toggle are passed as props all the way down to `Header` and `DropZone`.

### Styling
CSS Modules only — no Tailwind, no CSS-in-JS. Theme switching works via CSS custom properties:
- `:root` defines dark-mode tokens (the default palette).
- `[data-theme="light"]` in `index.css` overrides them.
- `document.documentElement.setAttribute('data-theme', theme)` is called from `App.tsx` on every theme change; the choice is persisted to `localStorage` and seeded from `prefers-color-scheme` on first visit.

All color values in `.module.css` files use `var(--token-name)` — never hard-coded hex. The token set is defined entirely in `src/index.css`.

### JSON schema
`src/types.ts` is the single source of truth for the data shape. The frontend never writes or modifies data — it only reads and filters. Tab components receive slices of `TranscriptAnalysis` as props and are otherwise self-contained.

## Git workflow

Every change goes on a feature branch. One concern per branch. PR created on GitHub when done; do not merge without user review. Warn if a branch starts accumulating unrelated changes.

## Claude Code skill

`.claude/skills/transcript-analyzer/` contains a skill that takes a raw `transcript.txt` and produces two files:
- `output/<video_id>-analysis/transcript_analysis.json` — machine-readable structured analysis
- `output/<video_id>-analysis/transcript_analysis.md` — human-readable companion document

Invoke with: `/transcript-analyzer @scripts/output/<video_id>/transcript.txt`

The `output/` directory is gitignored.
