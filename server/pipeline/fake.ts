/**
 * Fake pipeline: simulates the download → transcribe → process stages.
 * Returns a copy of an existing analysis JSON after short delays.
 * Replace this with the real VM call later.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { prisma } from '../db.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..', '..')
const SAMPLE_JSON_PATH = join(ROOT, 'output', 'lXUZvyajciY-analysis', 'transcript_analysis.json')

type ProgressCallback = (status: string, pct: number, detail: string) => void

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function runFakePipeline(
  jobId: string,
  transcriptId: string,
  youtubeUrl: string,
  onProgress: ProgressCallback
): Promise<void> {
  const updateJob = async (status: string, pct: number, detail: string) => {
    await prisma.job.update({ where: { id: jobId }, data: { status, progress: pct, detail } })
    onProgress(status, pct, detail)
  }

  try {
    await updateJob('downloading', 0, 'Fetching audio from YouTube…')
    await delay(1500)
    await updateJob('downloading', 20, 'Audio downloaded (fake)')

    await updateJob('transcribing', 20, 'Loading speech recognition model…')
    await delay(2000)
    await updateJob('transcribing', 50, 'Transcribing audio…')
    await delay(1500)
    await updateJob('transcribing', 60, 'Transcript complete (fake — 12,480 words)')

    await updateJob('processing', 60, 'Sending transcript to Claude…')
    await delay(2000)
    await updateJob('processing', 90, 'Validating structured JSON…')
    await delay(500)

    let sampleData: Record<string, unknown>
    try {
      sampleData = JSON.parse(readFileSync(SAMPLE_JSON_PATH, 'utf-8'))
    } catch {
      throw new Error(`Sample JSON not found or unreadable at ${SAMPLE_JSON_PATH}`)
    }

    await Promise.all([
      prisma.transcript.update({
        where: { id: transcriptId },
        data: {
          status: 'ready',
          title: (sampleData.metadata as Record<string, unknown>)?.title as string ?? 'Untitled',
          jsonData: JSON.stringify(sampleData),
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
