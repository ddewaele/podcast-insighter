#!/usr/bin/env python3
"""
transcribe.py

Transcribes a YouTube video to a structured JSON transcript.

Pipeline:
  1. Fetch video metadata and download audio via yt-dlp
  2. Convert audio to 16 kHz mono WAV via ffmpeg (required by ASR models)
  3. Transcribe with NVIDIA Parakeet TDT via NeMo
  4. (Optional) Run speaker diarization with pyannote.audio
  5. Merge transcript segments with speaker labels
  6. Write structured JSON to a file or stdout

Progress messages are written to stderr so stdout is always clean JSON.
"""

import argparse
import glob
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def log(msg: str) -> None:
    """Write a timestamped progress message to stderr."""
    from datetime import datetime
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", file=sys.stderr, flush=True)


def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    """Run a subprocess, raise CalledProcessError on non-zero exit."""
    return subprocess.run(cmd, check=True, **kwargs)


# ---------------------------------------------------------------------------
# Stage 1 — Download
# ---------------------------------------------------------------------------

def download_audio(url: str, out_dir: str, cookies_file: Optional[str] = None, cookies_from_browser: Optional[str] = None, js_runtime: Optional[str] = None) -> tuple[str, dict]:
    """
    Download the best available audio stream from a YouTube URL.

    Args:
        cookies_file: Path to a Netscape-format cookies.txt file. Required when
                      YouTube demands bot verification on a headless server.
        cookies_from_browser: Browser name to extract cookies from directly, e.g.
                              'chrome', 'firefox', 'safari', 'edge'. Simpler than
                              maintaining a cookies file — yt-dlp reads the browser's
                              cookie store automatically.

    Returns:
        (path_to_audio_file, yt_dlp_video_info_dict)
    """
    log(f"[download] Fetching metadata for {url}")

    if cookies_from_browser:
        cookies_args = ["--cookies-from-browser", cookies_from_browser]
    elif cookies_file:
        cookies_args = ["--cookies", cookies_file]
    else:
        cookies_args = []
    # js_runtime: node/deno etc. — also fetch the remote EJS challenge solver from GitHub,
    # which yt-dlp no longer bundles but requires to decode YouTube's n-challenge URLs.
    js_args = ["--js-runtimes", js_runtime, "--remote-components", "ejs:github"] if js_runtime else []
    # Back off between requests so YouTube doesn't rate-limit (HTTP 429).
    rate_args = ["--sleep-requests", "2", "--retries", "5", "--retry-sleep", "10"]

    info_proc = run(
        ["yt-dlp", "--dump-json", "--no-playlist", *cookies_args, *js_args, *rate_args, url],
        stdout=subprocess.PIPE,  # capture JSON output only; let stderr flow to terminal
        text=True,
    )
    info = json.loads(info_proc.stdout)
    video_id = info["id"]

    log(f"[download] Title : {info.get('title')}")
    log(f"[download] Channel: {info.get('uploader')}")
    log(f"[download] Duration: {info.get('duration_string', '?')}")

    out_template = os.path.join(out_dir, f"{video_id}.%(ext)s")
    run([
        "yt-dlp",
        "--format", "bestaudio",
        "--extract-audio",
        "--audio-format", "mp3",
        "--no-playlist",
        *cookies_args,
        *js_args,
        *rate_args,
        "--output", out_template,
        url,
    ])

    # Find what was actually written (extension may vary)
    matches = list(Path(out_dir).glob(f"{video_id}.*"))
    if not matches:
        raise FileNotFoundError(f"yt-dlp did not produce an output file in {out_dir}")
    audio_path = str(matches[0])

    log(f"[download] Saved to {Path(audio_path).name}")
    return audio_path, info


# ---------------------------------------------------------------------------
# Stage 2 — Convert to WAV
# ---------------------------------------------------------------------------

def convert_to_wav(audio_path: str, out_dir: str) -> str:
    """
    Convert any audio file to a 16 kHz mono WAV.
    ASR models including Parakeet expect 16 kHz mono PCM.
    """
    wav_path = os.path.join(out_dir, "audio_16k.wav")
    log("[convert] Converting to 16 kHz mono WAV...")
    run([
        "ffmpeg", "-y",
        "-i", audio_path,
        "-ar", "16000",   # 16 kHz sample rate
        "-ac", "1",       # mono
        "-f", "wav",
        wav_path,
    ], capture_output=True)
    return wav_path


# ---------------------------------------------------------------------------
# Stage 3 — Transcribe
# ---------------------------------------------------------------------------

def _get_audio_duration(wav_path: str) -> float:
    """Return the duration of a WAV file in seconds using ffprobe."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            wav_path,
        ],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip())


def _split_wav(wav_path: str, chunk_seconds: int, chunks_dir: str) -> list[str]:
    """Split a WAV file into fixed-length chunks using ffmpeg. Returns sorted chunk paths."""
    run([
        "ffmpeg", "-y",
        "-i", wav_path,
        "-f", "segment",
        "-segment_time", str(chunk_seconds),
        "-c", "copy",
        os.path.join(chunks_dir, "chunk_%04d.wav"),
    ], capture_output=True)
    return sorted(glob.glob(os.path.join(chunks_dir, "chunk_*.wav")))


def _load_nemo_model(model_name: str):
    """Load and configure a NeMo ASR model."""
    import torch
    import nemo.collections.asr as nemo_asr

    log(f"[transcribe] Loading model {model_name} ...")
    log("[transcribe] (First run downloads weights — subsequent runs use the cache)")
    model = nemo_asr.models.ASRModel.from_pretrained(model_name)
    model.eval()

    if torch.cuda.is_available():
        model = model.cuda()
        log("[transcribe] Device: CUDA GPU")
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        model = model.to("mps")
        log("[transcribe] Device: Apple Silicon MPS")
    else:
        log("[transcribe] Device: CPU  (slow on long audio — chunking is active)")

    return model


def _run_inference(model, wav_path: str) -> list[dict]:
    """Run inference on a single WAV file. Returns segments with timestamps relative to that file."""
    output = model.transcribe([wav_path], timestamps=True)
    hypothesis = output[0]

    word_list = None
    for attr in ("timestamp", "timestep"):
        candidate = getattr(hypothesis, attr, None)
        if candidate:
            if isinstance(candidate, dict):
                word_list = candidate.get("word") or candidate.get("words")
            elif isinstance(candidate, list):
                word_list = candidate
            if word_list:
                break

    if word_list:
        return _group_words_into_segments(word_list)

    log("[transcribe] Warning: no word-level timestamps returned; using single segment.")
    full_text = getattr(hypothesis, "text", str(hypothesis))
    return [{"start": 0.0, "end": None, "text": full_text.strip()}]


def transcribe_audio(wav_path: str, model_name: str, chunk_minutes: int = 10) -> list[dict]:
    """
    Transcribe the WAV file using NVIDIA Parakeet TDT via NeMo.

    Audio longer than `chunk_minutes` is split into chunks and processed one at a
    time to keep peak memory usage low (avoids OOM kills on CPU-only servers).
    Timestamps are offset so the final segment list covers the full timeline.

    Returns a list of segments:
        [{"start": 0.0, "end": 3.5, "text": "Hello and welcome..."}, ...]
    """
    duration = _get_audio_duration(wav_path)
    chunk_seconds = chunk_minutes * 60

    model = _load_nemo_model(model_name)

    if duration <= chunk_seconds:
        log("[transcribe] Running inference...")
        segments = _run_inference(model, wav_path)
    else:
        n_chunks = math.ceil(duration / chunk_seconds)
        log(f"[transcribe] Audio is {duration / 60:.0f} min — splitting into {n_chunks} × {chunk_minutes}-min chunks")

        with tempfile.TemporaryDirectory(prefix="chunks_") as chunks_dir:
            chunk_files = _split_wav(wav_path, chunk_seconds, chunks_dir)
            segments = []

            for i, chunk_file in enumerate(chunk_files):
                time_offset = i * chunk_seconds
                log(f"[transcribe] Chunk {i + 1}/{len(chunk_files)} (offset {time_offset // 60:.0f}m{time_offset % 60:02d}s)...")
                chunk_segments = _run_inference(model, chunk_file)

                for seg in chunk_segments:
                    seg["start"] = round(seg["start"] + time_offset, 3)
                    if seg.get("end") is not None:
                        seg["end"] = round(seg["end"] + time_offset, 3)

                segments.extend(chunk_segments)

    word_count = sum(len(s["text"].split()) for s in segments)
    log(f"[transcribe] Done — {len(segments)} segments, ~{word_count} words")
    return segments


def _group_words_into_segments(
    words: list,
    pause_threshold: float = 0.8,
) -> list[dict]:
    """
    Group word-level timestamp entries into sentence/phrase segments.
    A new segment starts whenever there is a pause longer than `pause_threshold`
    seconds between consecutive words.

    NeMo word entries may be dicts or objects with varying attribute names;
    this function handles both.
    """
    def extract(w) -> tuple[str, float, float]:
        if isinstance(w, dict):
            text  = w.get("word", "")
            start = float(w.get("start_offset", w.get("start", 0.0)))
            end   = float(w.get("end_offset",   w.get("end",   start)))
        else:
            text  = str(getattr(w, "word",         ""))
            start = float(getattr(w, "start_offset", getattr(w, "start", 0.0)))
            end   = float(getattr(w, "end_offset",   getattr(w, "end",   start)))
        return text, start, end

    segments: list[dict] = []
    buffer_words: list[str] = []
    seg_start: Optional[float] = None
    prev_end: float = 0.0

    for entry in words:
        word, w_start, w_end = extract(entry)
        if not word:
            continue

        if seg_start is None:
            seg_start = w_start
        elif (w_start - prev_end) > pause_threshold and buffer_words:
            segments.append({
                "start": round(seg_start, 3),
                "end":   round(prev_end,  3),
                "text":  " ".join(buffer_words),
            })
            buffer_words = []
            seg_start = w_start

        buffer_words.append(word)
        prev_end = w_end

    if buffer_words and seg_start is not None:
        segments.append({
            "start": round(seg_start, 3),
            "end":   round(prev_end,  3),
            "text":  " ".join(buffer_words),
        })

    return segments


# ---------------------------------------------------------------------------
# Stage 4 — Speaker diarization (optional)
# ---------------------------------------------------------------------------

def diarize_audio(wav_path: str, hf_token: str) -> list[dict]:
    """
    Run speaker diarization with pyannote.audio 3.x.

    Returns a list of speaker turns:
        [{"start": 0.0, "end": 12.4, "speaker": "SPEAKER_00"}, ...]

    Requires a HuggingFace access token with the pyannote/speaker-diarization-3.1
    model gate accepted at: https://huggingface.co/pyannote/speaker-diarization-3.1
    """
    log("[diarize] Loading pyannote/speaker-diarization-3.1 ...")
    from pyannote.audio import Pipeline
    import torch

    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=hf_token,
    )

    if torch.cuda.is_available():
        pipeline = pipeline.to(torch.device("cuda"))
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        pipeline = pipeline.to(torch.device("mps"))

    log("[diarize] Running diarization (this can take a few minutes)...")
    diarization = pipeline(wav_path)

    turns = [
        {
            "start":   round(turn.start, 3),
            "end":     round(turn.end,   3),
            "speaker": speaker,
        }
        for turn, _, speaker in diarization.itertracks(yield_label=True)
    ]

    unique_speakers = sorted(set(t["speaker"] for t in turns))
    log(f"[diarize] Found {len(unique_speakers)} speaker(s): {', '.join(unique_speakers)}")
    return turns


def assign_speakers(
    segments: list[dict],
    speaker_turns: list[dict],
) -> list[dict]:
    """
    Assign the dominant speaker to each transcript segment based on
    time-overlap with the diarization output.
    """
    for segment in segments:
        seg_start = segment["start"]
        seg_end   = segment.get("end") or (seg_start + 0.1)

        overlap: dict[str, float] = {}
        for turn in speaker_turns:
            o_start = max(seg_start, turn["start"])
            o_end   = min(seg_end,   turn["end"])
            if o_end > o_start:
                spk = turn["speaker"]
                overlap[spk] = overlap.get(spk, 0.0) + (o_end - o_start)

        segment["speaker"] = max(overlap, key=overlap.get) if overlap else "UNKNOWN"

    return segments


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_video_id(url: str) -> Optional[str]:
    """Extract the YouTube video ID from a URL. Returns None if not recognised."""
    from urllib.parse import urlparse, parse_qs
    parsed = urlparse(url)
    if parsed.hostname in ("www.youtube.com", "youtube.com", "music.youtube.com"):
        return parse_qs(parsed.query).get("v", [None])[0]
    if parsed.hostname in ("youtu.be",):
        return parsed.path.lstrip("/").split("?")[0] or None
    # Fallback: look for an 11-char alphanumeric ID anywhere in the URL
    m = re.search(r"[A-Za-z0-9_-]{11}", url)
    return m.group(0) if m else None


def is_16k_mono_wav(path: str) -> bool:
    """Return True if the file is already a 16 kHz mono PCM WAV."""
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=sample_rate,channels,codec_name",
         "-of", "default=noprint_wrappers=1", path],
        capture_output=True, text=True,
    )
    return (
        "codec_name=pcm_s16le" in result.stdout
        and "sample_rate=16000" in result.stdout
        and "channels=1" in result.stdout
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Transcribe a YouTube video to a structured JSON transcript.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Artifacts are written to:  <output-dir>/<video-id>/
  transcript.json   — full structured transcript
  transcript.txt    — plain text (full_text field only)
  audio.mp3         — downloaded audio  (if --keep-audio)
  audio_16k.wav     — converted WAV     (if --keep-audio)

If audio files are already present in the artifact directory,
the download and convert stages are skipped automatically.

Examples:
  # Basic — artifacts saved to ./output/We7BZVKbCVw/
  python transcribe.py https://www.youtube.com/watch?v=We7BZVKbCVw --no-diarize

  # Use cookies from your local Chrome install (no plugin or file needed)
  python transcribe.py https://youtu.be/XYZ --cookies-from-browser chrome --no-diarize

  # Headless server with a cookies file and JS runtime
  python transcribe.py https://youtu.be/XYZ \\
    --cookies ~/yt-cookies.txt --js-runtime node --no-diarize

  # Re-use already-downloaded audio, skip YouTube entirely
  python transcribe.py https://youtu.be/XYZ --no-diarize
  # (re-run same URL — audio already in ./output/XYZ/, no network hit)

  # Use a local audio file with an explicit key
  python transcribe.py --audio-file ./We7BZVKbCVw.mp3 --key We7BZVKbCVw --no-diarize

  # Custom output directory
  python transcribe.py https://youtu.be/XYZ --output-dir ~/transcripts --no-diarize
        """,
    )
    parser.add_argument("url",
        nargs="?",
        help="YouTube video URL. Omit when using --audio-file with --key.")
    parser.add_argument("--output-dir",
        default="./output",
        metavar="DIR",
        help="Base directory for artifacts (default: ./output). "
             "Each run is stored under <output-dir>/<video-id>/.")
    parser.add_argument("--key",
        metavar="ID",
        help="Override the run key (default: YouTube video ID extracted from the URL). "
             "Useful when passing --audio-file without a URL.")
    parser.add_argument("--model",
        default="nvidia/parakeet-tdt-0.6b-v2",
        help="NeMo-compatible ASR model ID (default: nvidia/parakeet-tdt-0.6b-v2).")
    parser.add_argument("--hf-token",
        default=os.environ.get("HF_TOKEN"),
        help="HuggingFace access token for pyannote diarization (or set HF_TOKEN).")
    parser.add_argument("--no-diarize",
        action="store_true",
        help="Skip speaker diarization.")
    parser.add_argument("--keep-audio",
        action="store_true",
        help="Keep audio.mp3 and audio_16k.wav in the artifact directory.")
    parser.add_argument("--audio-file",
        metavar="PATH",
        help="Path to an existing audio file. Skips download; converts if not already 16 kHz mono WAV.")
    parser.add_argument("--cookies",
        default=os.environ.get("YT_COOKIES_FILE"),
        metavar="PATH",
        help="Netscape cookies.txt for YouTube authentication (or set YT_COOKIES_FILE).")
    parser.add_argument("--cookies-from-browser",
        default=os.environ.get("YT_COOKIES_FROM_BROWSER"),
        metavar="BROWSER",
        help="Extract cookies directly from a browser, e.g. chrome, firefox, safari, edge "
             "(or set YT_COOKIES_FROM_BROWSER). Takes precedence over --cookies.")
    parser.add_argument("--js-runtime",
        default=os.environ.get("YT_JS_RUNTIME"),
        metavar="RUNTIME",
        help="JS runtime for yt-dlp n-challenge solver, e.g. 'node' (or set YT_JS_RUNTIME).")
    parser.add_argument("--chunk-minutes",
        type=int,
        default=10,
        metavar="N",
        help="Split audio into N-minute chunks before transcribing (default: 10).")
    parser.add_argument("--pause-threshold",
        type=float,
        default=0.8,
        help="Silence gap in seconds that starts a new segment (default: 0.8).")
    parser.add_argument("--analyze",
        action="store_true",
        help="After transcription, run LLM analysis to produce transcript_analysis.json. "
             "Requires ANTHROPIC_API_KEY environment variable.")
    parser.add_argument("--analyze-model",
        default=os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6"),
        help="Claude model for the analysis stage (default: claude-sonnet-4-6, or set CLAUDE_MODEL).")

    args = parser.parse_args()

    if not args.url and not args.audio_file:
        parser.error("provide a YouTube URL or --audio-file PATH")

    if not args.no_diarize and not args.hf_token:
        log("Warning: no HuggingFace token found — skipping diarization.")
        log("         Provide one with --hf-token or the HF_TOKEN environment variable.")
        log("         Or suppress this warning with --no-diarize.")
        args.no_diarize = True

    # ── Determine run key and artifact directory ──────────────────────────────
    if args.key:
        run_key = args.key
    elif args.url:
        run_key = extract_video_id(args.url) or Path(args.audio_file or "unknown").stem
    else:
        run_key = Path(args.audio_file).stem

    artifact_dir = Path(args.output_dir) / run_key
    artifact_dir.mkdir(parents=True, exist_ok=True)
    log(f"[init] Artifact directory: {artifact_dir}")

    cached_wav = artifact_dir / "audio_16k.wav"
    cached_mp3 = artifact_dir / "audio.mp3"
    meta_file  = artifact_dir / "meta.json"

    with tempfile.TemporaryDirectory(prefix="transcribe_") as tmp_dir:

        # ── Stage 1: Download (skip if cached) ───────────────────────────────
        if cached_wav.exists():
            log(f"[cache] Found {cached_wav.name} — skipping download and convert")
            wav_path = str(cached_wav)
            video_info = json.loads(meta_file.read_text()) if meta_file.exists() else {
                "id": run_key, "title": run_key, "uploader": None, "duration": None
            }

        elif cached_mp3.exists():
            log(f"[cache] Found {cached_mp3.name} — skipping download, converting to WAV")
            video_info = json.loads(meta_file.read_text()) if meta_file.exists() else {
                "id": run_key, "title": run_key, "uploader": None, "duration": None
            }
            wav_path = convert_to_wav(str(cached_mp3), tmp_dir)

        elif args.audio_file:
            log(f"[audio] Using provided file: {args.audio_file}")
            video_info = {"id": run_key, "title": run_key, "uploader": None, "duration": None}
            if is_16k_mono_wav(args.audio_file):
                log("[audio] Already 16 kHz mono WAV — skipping conversion")
                wav_path = args.audio_file
            else:
                wav_path = convert_to_wav(args.audio_file, tmp_dir)

        else:
            # ── Full download from YouTube ────────────────────────────────
            raw_audio, video_info = download_audio(
                args.url, tmp_dir,
                cookies_file=args.cookies,
                cookies_from_browser=args.cookies_from_browser,
                js_runtime=args.js_runtime,
            )
            wav_path = convert_to_wav(raw_audio, tmp_dir)

            # Persist audio and metadata so future runs skip this stage
            shutil.copy(raw_audio, cached_mp3)
            shutil.copy(wav_path, cached_wav)
            meta_file.write_text(json.dumps(video_info, indent=2), encoding="utf-8")
            log(f"[cache] Audio saved to {artifact_dir}")

        # ── Stage 3: Transcribe ──────────────────────────────────────────────
        segments = transcribe_audio(wav_path, args.model, chunk_minutes=args.chunk_minutes)

        # ── Stage 4: Diarize ─────────────────────────────────────────────────
        if not args.no_diarize:
            speaker_turns = diarize_audio(wav_path, args.hf_token)
            segments = assign_speakers(segments, speaker_turns)

        # ── Assemble result ───────────────────────────────────────────────────
        full_text = " ".join(s["text"] for s in segments)
        unique_speakers = sorted(set(s["speaker"] for s in segments if "speaker" in s))

        result = {
            "url":              args.url,
            "video_id":         run_key,
            "title":            video_info.get("title"),
            "channel":          video_info.get("uploader"),
            "duration_seconds": video_info.get("duration"),
            "model":            args.model,
            "diarized":         not args.no_diarize,
            "speakers":         unique_speakers,
            "segments":         segments,
            "full_text":        full_text,
        }

        # ── Write artifacts ───────────────────────────────────────────────────
        json_path = artifact_dir / "transcript.json"
        txt_path  = artifact_dir / "transcript.txt"

        json_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
        txt_path.write_text(full_text, encoding="utf-8")

        log(f"[done] transcript.json → {json_path}")
        log(f"[done] transcript.txt  → {txt_path}")

        if args.keep_audio:
            if not cached_wav.exists():
                shutil.copy(wav_path, cached_wav)
            log(f"[done] audio kept     → {artifact_dir}")

        # ── Stage 5: LLM Analysis (optional) ────────────────────────────────
        if args.analyze:
            if not os.environ.get("ANTHROPIC_API_KEY"):
                log("Warning: --analyze requires ANTHROPIC_API_KEY — skipping analysis stage.")
            else:
                from analyze import call_claude, validate_analysis
                log(f"[analyze] Starting LLM analysis with {args.analyze_model}...")
                analysis = call_claude(full_text, model=args.analyze_model)
                analysis_path = artifact_dir / "transcript_analysis.json"
                analysis_path.write_text(
                    json.dumps(analysis, indent=2, ensure_ascii=False), encoding="utf-8"
                )
                log(f"[done] transcript_analysis.json → {analysis_path}")
                log(f"[done] {len(analysis.get('quotes', []))} quotes, "
                    f"{len(analysis.get('insights', []))} insights, "
                    f"{len(analysis.get('references', []))} references")

        log("[done] All stages complete.")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        log(f"\nError: external command failed — {exc.cmd}")
        if exc.stderr:
            # stderr is str when text=True was used, bytes otherwise
            msg = exc.stderr if isinstance(exc.stderr, str) else exc.stderr.decode(errors="replace")
            log(msg.strip())
        sys.exit(1)
    except KeyboardInterrupt:
        log("\nInterrupted.")
        sys.exit(130)
