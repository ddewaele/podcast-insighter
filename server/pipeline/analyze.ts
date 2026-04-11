/**
 * Send a raw transcript to Claude and get back a structured TranscriptAnalysis JSON.
 * Uses tool_use with forced tool_choice so the output is schema-validated by the API.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { Tool } from '@anthropic-ai/sdk/resources/messages.js'

const SYSTEM_PROMPT = `You are a transcript analyst specializing in thought-leadership content: interviews, podcasts, conference talks, and long-form conversations.

Given a raw transcript, analyze it and call the save_analysis tool with the structured result.

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

Skip generic filler like "that's a great question" or "I think that's really important."

### Insight Extraction
- Separate the claim from the evidence.
- Tag novelty honestly. A well-known opinion restated is "low" novelty even if the speaker is famous.
- Look for implicit insights — things the speaker assumes or implies but doesn't state directly.

### Reference Extraction — Be Thorough
- Catch tool names, project names, people mentioned, blog posts referenced, papers cited, companies discussed, concepts named, events referenced.
- For well-known open source projects, include the GitHub or homepage URL.
- For people mentioned, note their affiliation if stated in the transcript.

### Handling Ambiguity
- If you cannot determine which speaker said something, label them "Unknown Speaker".
- If a technical term is garbled beyond recognition, include it as [unintelligible — possibly about X].`

const ANALYSIS_TOOL: Tool = {
  name: 'save_analysis',
  description: 'Save the structured transcript analysis.',
  input_schema: {
    type: 'object' as const,
    required: ['metadata', 'summary', 'quotes', 'insights', 'references',
               'disagreements_and_nuance', 'topic_segments'],
    properties: {
      metadata: {
        type: 'object',
        required: ['title', 'speakers', 'estimated_duration_minutes', 'primary_topics', 'date_hint'],
        properties: {
          title: { type: 'string' },
          speakers: { type: 'array', items: { type: 'string' } },
          estimated_duration_minutes: { type: ['number', 'null'] },
          primary_topics: { type: 'array', items: { type: 'string' } },
          date_hint: { type: ['string', 'null'] },
        },
      },
      summary: {
        type: 'object',
        required: ['one_liner', 'executive_summary', 'key_takeaways'],
        properties: {
          one_liner: { type: 'string' },
          executive_summary: { type: 'string' },
          key_takeaways: { type: 'array', items: { type: 'string' } },
        },
      },
      quotes: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'text', 'speaker', 'context', 'tags'],
          properties: {
            id: { type: 'string' },
            text: { type: 'string' },
            speaker: { type: 'string' },
            context: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      insights: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'claim', 'speaker', 'supporting_detail', 'novelty', 'tags'],
          properties: {
            id: { type: 'string' },
            claim: { type: 'string' },
            speaker: { type: 'string' },
            supporting_detail: { type: 'string' },
            novelty: { type: 'string', enum: ['low', 'medium', 'high'] },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      references: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'name', 'type', 'url', 'context', 'mentioned_by'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            type: { type: 'string', enum: [
              'tool', 'project', 'paper', 'person', 'book', 'blog-post',
              'concept', 'company', 'event', 'dataset', 'product',
            ]},
            url: { type: ['string', 'null'] },
            context: { type: 'string' },
            mentioned_by: { type: 'string' },
          },
        },
      },
      disagreements_and_nuance: {
        type: 'array',
        items: {
          type: 'object',
          required: ['topic', 'positions', 'resolution'],
          properties: {
            topic: { type: 'string' },
            positions: {
              type: 'array',
              items: {
                type: 'object',
                required: ['speaker', 'position'],
                properties: {
                  speaker: { type: 'string' },
                  position: { type: 'string' },
                },
              },
            },
            resolution: { type: 'string' },
          },
        },
      },
      topic_segments: {
        type: 'array',
        items: {
          type: 'object',
          required: ['approximate_position', 'topic', 'summary'],
          properties: {
            approximate_position: { type: 'string', enum: [
              'early', 'early-mid', 'mid', 'mid-late', 'late',
            ]},
            topic: { type: 'string' },
            summary: { type: 'string' },
          },
        },
      },
    },
  },
}

export interface AnalysisResult {
  data: Record<string, unknown>
  inputTokens: number
  outputTokens: number
}

export async function analyzeTranscript(
  transcriptText: string,
  model = 'claude-sonnet-4-6',
): Promise<AnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required for transcript analysis')
  }

  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model,
    max_tokens: 16384,
    system: SYSTEM_PROMPT,
    tools: [ANALYSIS_TOOL],
    tool_choice: { type: 'tool' as const, name: 'save_analysis' },
    messages: [
      {
        role: 'user',
        content: `Analyze this transcript and call save_analysis with the result:\n\n${transcriptText}`,
      },
    ],
  })

  const toolBlock = response.content.find(block => block.type === 'tool_use')
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('Claude did not return a tool_use block')
  }

  return {
    data: toolBlock.input as Record<string, unknown>,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}
