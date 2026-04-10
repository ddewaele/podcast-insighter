#!/usr/bin/env python3
"""
analyze.py

Transforms a raw transcript into a structured analysis JSON using the Claude API.

Can be used standalone or called from transcribe.py via --analyze.

Usage:
  # Standalone — analyze an existing transcript
  python analyze.py scripts/output/<video-id>/transcript.txt

  # With explicit output path
  python analyze.py transcript.txt -o output/analysis/transcript_analysis.json

  # With a specific model
  python analyze.py transcript.txt --model claude-sonnet-4-6

Requires ANTHROPIC_API_KEY environment variable.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Optional


def log(msg: str) -> None:
    from datetime import datetime
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are a transcript analyst specializing in thought-leadership content: interviews, podcasts, conference talks, and long-form conversations.

Given a raw transcript, produce a single JSON object with the exact structure specified below. Do not include any text outside the JSON — no preamble, no markdown fences, no commentary.

## Output JSON Schema

{
  "metadata": {
    "title": "Best guess at the episode/talk title",
    "speakers": ["Speaker A (role/affiliation if inferrable)", "Speaker B"],
    "estimated_duration_minutes": null,
    "primary_topics": ["topic1", "topic2", "topic3"],
    "date_hint": "Any date references found in the transcript, or null"
  },

  "summary": {
    "one_liner": "A single sentence capturing the core thesis or takeaway.",
    "executive_summary": "3-5 paragraph summary covering the arc of the conversation.",
    "key_takeaways": [
      "Actionable or memorable takeaway 1",
      "Actionable or memorable takeaway 2"
    ]
  },

  "quotes": [
    {
      "id": "q1",
      "text": "The exact words from the transcript, cleaned minimally.",
      "speaker": "Speaker name or label",
      "context": "1-2 sentences explaining why this quote matters.",
      "tags": ["opinion", "prediction", "technical-insight", "contrarian", "funny", "quotable", "framework"]
    }
  ],

  "insights": [
    {
      "id": "i1",
      "claim": "A clear statement of the insight or argument made.",
      "speaker": "Who made this point",
      "supporting_detail": "How they supported it — anecdote, data, reasoning.",
      "novelty": "low | medium | high",
      "tags": ["ai-engineering", "open-source", "security", "product-thinking", "career", "ethics", "tooling"]
    }
  ],

  "references": [
    {
      "id": "r1",
      "name": "Name of the tool, project, paper, person, book, blog post, or concept",
      "type": "tool | project | paper | person | book | blog-post | concept | company | event | dataset",
      "url": "URL if mentioned or trivially inferrable, otherwise null",
      "context": "How it came up and why it was relevant.",
      "mentioned_by": "Speaker name"
    }
  ],

  "disagreements_and_nuance": [
    {
      "topic": "What the disagreement or nuanced point is about",
      "positions": [
        {"speaker": "Speaker A", "position": "Their stance"},
        {"speaker": "Speaker B", "position": "Their stance"}
      ],
      "resolution": "Was it resolved? How? Or left as an open question?"
    }
  ],

  "topic_segments": [
    {
      "approximate_position": "early | mid | late",
      "topic": "Topic being discussed",
      "summary": "2-3 sentence summary of this segment"
    }
  ]
}

## Processing Rules

### Transcript Cleaning
- Fix obvious STT errors (e.g., "prompt in jackson" → "prompt injection", "data set" → "Datasette" when context makes it clear).
- Remove filler words (um, uh, like, you know) from quotes UNLESS they convey meaningful hesitation.
- Do NOT invent words or ideas not present in the transcript.
- When uncertain about a term, include your best guess with [?] appended.

### Quote Selection — Select 8-15 Quotes
Prioritize these types, roughly in this order:
1. Quotable opinions — strong, clear stances someone might share or cite
2. Predictions — claims about where things are heading
3. Contrarian takes — positions that push back against mainstream thinking
4. Frameworks — mental models or ways of thinking about a problem
5. Surprising facts or anecdotes — stories that illustrate a larger point
6. Humor — genuinely funny moments that also carry insight

Skip generic filler like "that's a great question" or "I think that's really important." A good quote should be worth tweeting on its own.

### Insight Extraction
- Separate the claim from the evidence. Speakers often blend the two — your job is to tease them apart.
- Tag novelty honestly. A well-known opinion restated is "low" novelty even if the speaker is famous.
- Look for implicit insights — things the speaker assumes or implies but doesn't state directly.

### Reference Extraction — Be Thorough
- Catch tool names, project names, people mentioned, blog posts referenced, papers cited, companies discussed, concepts named, events referenced.
- For well-known open source projects, include the GitHub or homepage URL.
- For people mentioned, note their affiliation if stated in the transcript.

### Handling Ambiguity
- If you cannot determine which speaker said something, label them "Unknown Speaker".
- If a technical term is garbled beyond recognition, include it as [unintelligible — possibly about X].
- If the transcript seems to be missing a section (abrupt topic change), note it in the topic_segments.

## Important
- Return ONLY valid JSON. No markdown fences, no text before or after.
- Include 8-15 quotes, each with context and tags.
- Every reference must have a type and context.
- The executive_summary must read as coherent prose, not bullet points.
- novelty values must be exactly one of: "low", "medium", "high".
- approximate_position values must be one of: "early", "early-mid", "mid", "mid-late", "late".
- reference type must be one of: "tool", "project", "paper", "person", "book", "blog-post", "concept", "company", "event", "dataset"."""


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------

REQUIRED_TOP_KEYS = {"metadata", "summary", "quotes", "insights", "references",
                     "disagreements_and_nuance", "topic_segments"}

VALID_NOVELTY = {"low", "medium", "high"}
VALID_POSITION = {"early", "early-mid", "mid", "mid-late", "late"}
VALID_REF_TYPE = {"tool", "project", "paper", "person", "book", "blog-post",
                  "concept", "company", "event", "dataset"}


def validate_analysis(data: dict) -> list[str]:
    """Return a list of validation errors (empty = valid)."""
    errors: list[str] = []

    missing = REQUIRED_TOP_KEYS - set(data.keys())
    if missing:
        errors.append(f"Missing top-level keys: {missing}")
        return errors  # Can't validate further

    # metadata
    meta = data["metadata"]
    for field in ("title", "speakers", "primary_topics"):
        if field not in meta:
            errors.append(f"metadata.{field} is missing")

    # summary
    summary = data["summary"]
    for field in ("one_liner", "executive_summary", "key_takeaways"):
        if field not in summary:
            errors.append(f"summary.{field} is missing")

    # quotes
    quotes = data.get("quotes", [])
    if len(quotes) < 5:
        errors.append(f"Expected at least 5 quotes, got {len(quotes)}")
    for q in quotes:
        for field in ("id", "text", "speaker", "context", "tags"):
            if field not in q:
                errors.append(f"Quote {q.get('id', '?')} missing field: {field}")

    # insights
    for ins in data.get("insights", []):
        if ins.get("novelty") not in VALID_NOVELTY:
            errors.append(f"Insight {ins.get('id', '?')} has invalid novelty: {ins.get('novelty')}")

    # references
    for ref in data.get("references", []):
        if ref.get("type") not in VALID_REF_TYPE:
            errors.append(f"Reference {ref.get('id', '?')} has invalid type: {ref.get('type')}")

    # topic_segments
    for seg in data.get("topic_segments", []):
        if seg.get("approximate_position") not in VALID_POSITION:
            errors.append(f"Topic segment has invalid position: {seg.get('approximate_position')}")

    return errors


# ---------------------------------------------------------------------------
# Claude API call
# ---------------------------------------------------------------------------

def call_claude(transcript_text: str, model: str, max_retries: int = 3) -> dict:
    """Send the transcript to Claude and return the parsed analysis JSON."""
    try:
        from anthropic import Anthropic
    except ImportError:
        log("Error: anthropic package not installed. Run: pip install anthropic")
        sys.exit(1)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        log("Error: ANTHROPIC_API_KEY environment variable is required")
        sys.exit(1)

    client = Anthropic(api_key=api_key)

    for attempt in range(1, max_retries + 1):
        log(f"[analyze] Sending to Claude ({model}) — attempt {attempt}/{max_retries}")
        start = time.time()

        try:
            response = client.messages.create(
                model=model,
                max_tokens=16384,
                system=SYSTEM_PROMPT,
                messages=[
                    {
                        "role": "user",
                        "content": f"Analyze this transcript and return the structured JSON:\n\n{transcript_text}",
                    }
                ],
            )
        except Exception as e:
            log(f"[analyze] API error: {e}")
            if attempt < max_retries:
                wait = 5 * attempt
                log(f"[analyze] Retrying in {wait}s...")
                time.sleep(wait)
                continue
            raise

        elapsed = time.time() - start
        raw_text = response.content[0].text.strip()
        log(f"[analyze] Response received in {elapsed:.1f}s "
            f"({response.usage.input_tokens} input, {response.usage.output_tokens} output tokens)")

        # Strip markdown fences if the model wrapped the JSON
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[1]  # Remove opening fence line
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]
            raw_text = raw_text.strip()

        # Parse JSON
        try:
            data = json.loads(raw_text)
        except json.JSONDecodeError as e:
            log(f"[analyze] Invalid JSON from Claude: {e}")
            if attempt < max_retries:
                log(f"[analyze] Retrying with stricter prompt...")
                continue
            raise ValueError(f"Claude returned invalid JSON after {max_retries} attempts") from e

        # Validate schema
        errors = validate_analysis(data)
        if errors:
            log(f"[analyze] Validation errors ({len(errors)}):")
            for err in errors[:10]:
                log(f"  - {err}")
            if attempt < max_retries:
                log(f"[analyze] Retrying...")
                continue
            log("[analyze] Warning: proceeding with validation errors after max retries")

        return data

    raise RuntimeError("Unreachable")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Transform a raw transcript into a structured analysis JSON using Claude.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Requires ANTHROPIC_API_KEY environment variable.",
    )
    parser.add_argument("transcript",
        help="Path to transcript text file (or transcript.json — will extract full_text).")
    parser.add_argument("-o", "--output",
        metavar="PATH",
        help="Output path for transcript_analysis.json (default: same directory as input).")
    parser.add_argument("--model",
        default=os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6"),
        help="Claude model to use (default: claude-sonnet-4-6, or set CLAUDE_MODEL).")
    parser.add_argument("--max-retries",
        type=int, default=3,
        help="Maximum retry attempts on API or validation failure (default: 3).")

    args = parser.parse_args()

    input_path = Path(args.transcript)
    if not input_path.exists():
        log(f"Error: file not found: {input_path}")
        sys.exit(1)

    # Read transcript — support both .txt (plain text) and .json (extract full_text)
    raw = input_path.read_text(encoding="utf-8")
    if input_path.suffix == ".json":
        try:
            transcript_data = json.loads(raw)
            transcript_text = transcript_data.get("full_text", raw)
            log(f"[analyze] Extracted full_text from JSON ({len(transcript_text):,} chars)")
        except json.JSONDecodeError:
            transcript_text = raw
    else:
        transcript_text = raw

    log(f"[analyze] Transcript: {len(transcript_text):,} chars, ~{len(transcript_text.split()):,} words")

    # Call Claude
    analysis = call_claude(transcript_text, model=args.model, max_retries=args.max_retries)

    # Determine output path
    if args.output:
        out_path = Path(args.output)
    else:
        out_path = input_path.parent / "transcript_analysis.json"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(analysis, indent=2, ensure_ascii=False), encoding="utf-8")
    log(f"[done] Analysis written to {out_path}")
    log(f"[done] {len(analysis.get('quotes', []))} quotes, "
        f"{len(analysis.get('insights', []))} insights, "
        f"{len(analysis.get('references', []))} references")


if __name__ == "__main__":
    main()
