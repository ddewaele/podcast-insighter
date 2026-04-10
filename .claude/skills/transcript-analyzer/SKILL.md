---
name: transcript-analyzer
description: "Analyzes a raw audio/video transcript and produces TWO files: a structured JSON (metadata, summary, quotes, insights, references, disagreements, conversation flow) and a polished Markdown document — suitable for show notes, blog companions, or study docs. Use whenever the user wants to analyze a transcript, extract quotes, summarize a podcast/interview/talk, pull out insights or references, create show notes, or get structured output from spoken content. Trigger on: 'analyze this transcript', 'extract quotes', 'summarize this talk', 'key insights', 'pull out references', 'show notes', or any request to turn a raw transcript into organized output. Distinct from stt-workflow: this skill extracts analysis and quotes, not cleaned transcripts or exam prep."
---

# Transcript Analyzer Skill

## Overview

Given a raw transcript as input, produce two output files: a structured JSON analysis and a polished Markdown document. Both cover the same content — the JSON is for machines and downstream tooling, the Markdown is for humans.

This skill is optimized for thought-leadership content: interviews, podcasts, conference talks, and long-form conversations where the value lies in opinions, insights, references, and quotable moments.

---

## Input

- **Raw transcript text** — pasted directly into the conversation, or provided as an attached `.txt` / `.md` file at `/mnt/user-data/uploads/`.
- Optionally, the user may provide context about the speaker(s), the event, or the topic. Use this to improve metadata and reference resolution.

---

## Output — Two Files

### File 1: `transcript_analysis.json`

A single JSON object with the following structure:

```json
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
```

### File 2: `transcript_analysis.md`

A polished Markdown document following this template:

```
# [Title]

> **Speakers:** [Speaker list with roles]
> **Topics:** [comma-separated primary topics]
> **Date:** [date hint or "Unknown"]

---

## TL;DR

[One bold, clear sentence capturing the core thesis.]

---

## Summary

[3-5 paragraphs of flowing prose. Cover the arc — what opened the conversation,
the core arguments, where disagreements surfaced, how it concluded.
Write as narrative, not bullet points.]

---

## Key Takeaways

1. **[Takeaway headline]** — [1-2 sentence expansion]
2. **[Takeaway headline]** — [1-2 sentence expansion]
3. ...

---

## Notable Quotes

> "[Quote text]"
> — **[Speaker]**
>
> _Context: [Why this quote matters]_
> `Tags: opinion, quotable`

[Repeat for 8-15 selected quotes, separated by blank lines]

---

## Insights & Arguments

### [Insight headline]
- **Claim:** [Clear statement]
- **Who:** [Speaker]
- **Supporting detail:** [How they backed it up]
- **Novelty:** 🟢 High | 🟡 Medium | 🔴 Low

[Repeat for each insight]

---

## Points of Disagreement & Nuance

### [Topic]
| Speaker | Position |
|---------|----------|
| [Name]  | [Stance] |
| [Name]  | [Stance] |

**Resolution:** [How it landed]

---

## References & Links

| # | Name | Type | URL | Mentioned by | Context |
|---|------|------|-----|--------------|---------|
| 1 | [Name] | [type] | [url or —] | [Speaker] | [Brief context] |

---

## Conversation Flow

| Position | Topic | Summary |
|----------|-------|---------|
| 🟢 Early | [Topic] | [2-3 sentences] |
| 🟡 Mid   | [Topic] | [2-3 sentences] |
| 🔴 Late  | [Topic] | [2-3 sentences] |

---

_Generated from raw transcript. Quotes are lightly cleaned for readability.
Terms marked with [?] indicate uncertain STT transcription._
```

---

## Processing Rules

### Transcript Cleaning
- Fix obvious STT errors (e.g., "prompt in jackson" → "prompt injection", "data set" → "Datasette" when context makes it clear).
- Remove filler words (um, uh, like, you know) from quotes UNLESS they convey meaningful hesitation or emphasis.
- Do NOT invent words or ideas not present in the transcript.
- When uncertain about a term, include your best guess with `[?]` appended.

### Quote Selection — Select 8-15 Quotes
Prioritize these types, roughly in this order:
1. **Quotable opinions** — strong, clear stances someone might share or cite
2. **Predictions** — claims about where things are heading
3. **Contrarian takes** — positions that push back against mainstream thinking
4. **Frameworks** — mental models or ways of thinking about a problem
5. **Surprising facts or anecdotes** — stories that illustrate a larger point
6. **Humor** — genuinely funny moments that also carry insight

Skip generic filler like "that's a great question" or "I think that's really important." A good quote should be worth tweeting on its own.

### Insight Extraction
- Separate the *claim* from the *evidence*. Speakers often blend the two — your job is to tease them apart.
- Tag novelty honestly. A well-known opinion restated is "low" novelty even if the speaker is famous.
- Look for implicit insights — things the speaker assumes or implies but doesn't state directly. These are often the most valuable.

### Reference Extraction — Be Thorough
- Catch tool names, project names, people mentioned, blog posts referenced, papers cited, companies discussed, concepts named, events referenced.
- For well-known open source projects, include the GitHub or homepage URL.
- For people mentioned, note their affiliation if stated in the transcript.
- If the user provided background context about the speaker(s), use it to resolve ambiguous references.

### Handling Ambiguity
- If you cannot determine which speaker said something, label them "Unknown Speaker".
- If a technical term is garbled beyond recognition, include it as `[unintelligible — possibly about X]`.
- If the transcript seems to be missing a section (abrupt topic change), note it in the topic_segments / Conversation Flow section.

### Consistency Between Outputs
- Every quote in the JSON must appear in the Markdown, and vice versa.
- Every reference in the JSON must appear in the Markdown table.
- Every insight in the JSON must appear in the Markdown.
- The Markdown is the formatted presentation of the JSON — not a separate analysis.

---

## Step-by-Step Execution

1. **Read the input.** Accept the raw transcript from the conversation or from an uploaded file at `/mnt/user-data/uploads/`. If the user provided speaker context, note it.
2. **Scan the full transcript** to identify speakers, major topic shifts, and the overall arc before writing anything.
3. **Produce the JSON analysis** (`transcript_analysis.json`) — metadata, summary, quotes, insights, references, disagreements, topic segments.
4. **Produce the Markdown document** (`transcript_analysis.md`) — render the same content as a polished, readable document.
5. **Cross-check consistency** — verify quotes, references, and insights match between the two files.
6. **Save both files** to `/mnt/user-data/outputs/`.
7. **Call `present_files`** with both paths so the user can download them.

---

## Quality Checklist

Before presenting files, verify:
- [ ] JSON is valid and parseable.
- [ ] Markdown renders cleanly with no broken tables or formatting.
- [ ] 8-15 quotes are selected, each with context and tags.
- [ ] All references have a type and context; URLs are included where inferrable.
- [ ] Insights separate claim from evidence and have honest novelty ratings.
- [ ] Summary reads as coherent prose, not a list of bullet points.
- [ ] Every item in the JSON appears in the Markdown and vice versa.
- [ ] Both files are saved to `/mnt/user-data/outputs/` and presented via `present_files`.

---

## Notes

- If the transcript is very long, process it as a single coherent analysis — do not split across multiple runs.
- If the user asks for "just the quotes" or "just the references", still produce both files but emphasize the requested section in your conversational response.
- If the transcript has timestamps, use them to improve the topic_segments / Conversation Flow section. If it doesn't, estimate positions based on text location (first third = early, middle third = mid, last third = late).
