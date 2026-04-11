#!/usr/bin/env python3
"""
fetch_transcript.py

Fetches YouTube captions (auto-generated or manual) via youtube-transcript-api,
then optionally runs LLM analysis to produce transcript_analysis.json.

This is the fast path — no audio download, no ASR model, no GPU. Works in
seconds instead of minutes. Falls back gracefully when captions aren't available.

Usage:
  # Fetch transcript only
  python fetch_transcript.py https://www.youtube.com/watch?v=J6vYvk7R190

  # Fetch + analyze in one shot
  python fetch_transcript.py https://www.youtube.com/watch?v=J6vYvk7R190 --analyze

  # List available caption languages
  python fetch_transcript.py https://www.youtube.com/watch?v=J6vYvk7R190 --list-languages

  # Fetch a specific language
  python fetch_transcript.py https://www.youtube.com/watch?v=J6vYvk7R190 --lang pt

Requires: pip install youtube-transcript-api
Optional: pip install anthropic (for --analyze)
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path


def log(msg: str) -> None:
    from datetime import datetime
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", file=sys.stderr, flush=True)


def extract_video_id(url: str) -> str | None:
    """Extract the 11-character video ID from various YouTube URL formats."""
    patterns = [
        r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})",
        r"^([A-Za-z0-9_-]{11})$",  # bare video ID
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None


def get_api():
    """Return a YouTubeTranscriptApi instance."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        log("Error: youtube-transcript-api not installed. Run: pip install youtube-transcript-api")
        sys.exit(1)
    return YouTubeTranscriptApi()


def fetch_transcript(video_id: str, lang: str = "en") -> tuple[list[dict], str]:
    """Fetch captions for a video. Returns (segments, transcript_type).

    transcript_type is one of: 'manual', 'auto-generated'.
    """
    api = get_api()
    transcript_list = api.list(video_id)

    # Prefer manual captions, fall back to auto-generated
    transcript = None
    transcript_type = None

    try:
        transcript = transcript_list.find_manually_created_transcript([lang])
        transcript_type = "manual"
        log(f"[fetch] Found manual captions ({lang})")
    except Exception:
        pass

    if not transcript:
        try:
            transcript = transcript_list.find_generated_transcript([lang])
            transcript_type = "auto-generated"
            log(f"[fetch] Found auto-generated captions ({lang})")
        except Exception:
            pass

    if not transcript:
        available = [(t.language_code, t.language, "manual" if not t.is_generated else "auto")
                     for t in transcript_list]
        log(f"[fetch] No captions found for language '{lang}'.")
        log(f"[fetch] Available: {available}")
        sys.exit(1)

    segments = transcript.fetch()
    return segments, transcript_type


def list_languages(video_id: str) -> None:
    """Print available caption languages for a video."""
    api = get_api()
    transcript_list = api.list(video_id)

    print(f"\nAvailable captions for {video_id}:\n")
    print(f"  {'Language':<30} {'Code':<8} {'Type'}")
    print(f"  {'-'*30} {'-'*8} {'-'*15}")

    for t in transcript_list:
        kind = "manual" if not t.is_generated else "auto-generated"
        print(f"  {t.language:<30} {t.language_code:<8} {kind}")
    print()


def fetch_video_metadata(video_id: str) -> dict:
    """Fetch basic video metadata via yt-dlp (if available) or return minimal stub."""
    import shutil
    import subprocess

    if not shutil.which("yt-dlp"):
        return {"id": video_id, "title": video_id, "uploader": None, "duration": None}

    try:
        result = subprocess.run(
            ["yt-dlp", "--dump-json", "--no-playlist", "--skip-download",
             f"https://www.youtube.com/watch?v={video_id}"],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            info = json.loads(result.stdout)
            return {
                "id": info.get("id", video_id),
                "title": info.get("title", video_id),
                "uploader": info.get("uploader"),
                "duration": info.get("duration"),
            }
    except Exception as e:
        log(f"[meta] yt-dlp metadata fetch failed: {e}")

    return {"id": video_id, "title": video_id, "uploader": None, "duration": None}


def main():
    parser = argparse.ArgumentParser(
        description="Fetch YouTube captions and optionally analyze them with Claude.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("url",
        help="YouTube video URL or video ID.")
    parser.add_argument("--output-dir",
        default="./output", metavar="DIR",
        help="Base directory for artifacts (default: ./output).")
    parser.add_argument("--lang",
        default="en",
        help="Caption language code (default: en).")
    parser.add_argument("--list-languages",
        action="store_true",
        help="List available caption languages and exit.")
    parser.add_argument("--analyze",
        action="store_true",
        help="After fetching, run LLM analysis via Claude. Requires ANTHROPIC_API_KEY.")
    parser.add_argument("--analyze-model",
        default=os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6"),
        help="Claude model for analysis (default: claude-sonnet-4-6).")

    args = parser.parse_args()

    video_id = extract_video_id(args.url)
    if not video_id:
        log(f"Error: could not extract video ID from: {args.url}")
        sys.exit(1)

    log(f"[init] Video ID: {video_id}")

    if args.list_languages:
        list_languages(video_id)
        return

    # Fetch captions
    segments, transcript_type = fetch_transcript(video_id, lang=args.lang)
    log(f"[fetch] Got {len(segments)} caption segments")

    # Fetch metadata (best-effort via yt-dlp)
    log("[meta] Fetching video metadata...")
    meta = fetch_video_metadata(video_id)
    log(f"[meta] Title: {meta.get('title')}")

    # Build transcript text
    full_text = " ".join(seg.text for seg in segments)
    word_count = len(full_text.split())
    log(f"[fetch] Transcript: {len(full_text):,} chars, ~{word_count:,} words")

    # Build result
    result = {
        "url": f"https://www.youtube.com/watch?v={video_id}",
        "video_id": video_id,
        "title": meta.get("title"),
        "channel": meta.get("uploader"),
        "duration_seconds": meta.get("duration"),
        "source": f"youtube-captions ({transcript_type})",
        "language": args.lang,
        "segments": [
            {
                "start": round(seg.start, 3),
                "end": round(seg.start + seg.duration, 3),
                "text": seg.text,
            }
            for seg in segments
        ],
        "full_text": full_text,
    }

    # Write artifacts
    artifact_dir = Path(args.output_dir) / video_id
    artifact_dir.mkdir(parents=True, exist_ok=True)

    json_path = artifact_dir / "transcript.json"
    txt_path = artifact_dir / "transcript.txt"

    json_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    txt_path.write_text(full_text, encoding="utf-8")

    log(f"[done] transcript.json → {json_path}")
    log(f"[done] transcript.txt  → {txt_path}")

    # Optional: LLM analysis
    if args.analyze:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            log("Warning: --analyze requires ANTHROPIC_API_KEY — skipping analysis.")
        else:
            from analyze import call_claude
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
    main()
