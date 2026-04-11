/**
 * Real pipeline: fetches YouTube captions, then runs Claude analysis.
 * Replaces the fake pipeline for production use.
 *
 * Falls back to the fake pipeline if ANTHROPIC_API_KEY is not set.
 */
import { prisma } from '../db.js'
import { fetchTranscript } from './youtube.js'
import { analyzeTranscript } from './analyze.js'

type ProgressCallback = (status: string, pct: number, detail: string) => void

export async function runPipeline(
  jobId: string,
  transcriptId: string,
  youtubeUrl: string,
  onProgress: ProgressCallback,
): Promise<void> {
  const updateJob = async (status: string, pct: number, detail: string) => {
    await prisma.job.update({ where: { id: jobId }, data: { status, progress: pct, detail } })
    onProgress(status, pct, detail)
  }

  try {
    // ── Stage 1: Fetch YouTube captions ─────────────────────────────────
    await updateJob('downloading', 0, 'Fetching captions from YouTube…')

    const match = youtubeUrl.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
    const videoId = match?.[1]
    if (!videoId) throw new Error('Could not extract video ID from URL')

    const transcript = await fetchTranscript(videoId)
    await updateJob('downloading', 20,
      `Captions fetched (${transcript.wordCount.toLocaleString()} words)`)

    // ── Stage 2: Analyze with Claude ────────────────────────────────────
    await updateJob('analyzing', 30, 'Sending transcript to Claude for analysis…')

    const model = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6'
    const result = await analyzeTranscript(transcript.fullText, model)

    await updateJob('analyzing', 90,
      `Analysis complete (${result.inputTokens} input, ${result.outputTokens} output tokens)`)

    // ── Stage 3: Store result ───────────────────────────────────────────
    const analysis = result.data as Record<string, unknown>
    const title = (analysis.metadata as Record<string, unknown>)?.title as string ?? 'Untitled'

    await Promise.all([
      prisma.transcript.update({
        where: { id: transcriptId },
        data: {
          status: 'ready',
          title,
          jsonData: JSON.stringify(analysis),
          errorMessage: null,
        },
      }),
      prisma.job.update({
        where: { id: jobId },
        data: { status: 'done', progress: 100, detail: 'Done', transcriptId },
      }),
    ])

    onProgress('done', 100, 'Done')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await Promise.all([
      prisma.transcript.update({ where: { id: transcriptId }, data: { status: 'error', errorMessage: message } }),
      prisma.job.update({ where: { id: jobId }, data: { status: 'error', progress: 0, detail: message } }),
    ])
    onProgress('error', 0, message)
  }
}
