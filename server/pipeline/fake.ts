/**
 * Fake pipeline: simulates the download → transcribe → process stages.
 * Returns a copy of an existing analysis JSON after short delays.
 * Replace this with the real VM call later.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { jobQueries, transcriptQueries } from '../db.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..', '..')

// A real analysis JSON to use as the fake result
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
  const update = (status: string, pct: number, detail: string) => {
    jobQueries.update.run(status, pct, detail, null, jobId)
    onProgress(status, pct, detail)
  }

  try {
    // Stage 1 — Download
    update('downloading', 0, 'Fetching audio from YouTube…')
    await delay(1500)
    update('downloading', 20, 'Audio downloaded (fake)')

    // Stage 2 — Transcribe
    update('transcribing', 20, 'Loading speech recognition model…')
    await delay(2000)
    update('transcribing', 50, 'Transcribing audio…')
    await delay(1500)
    update('transcribing', 60, 'Transcript complete (fake — 12,480 words)')

    // Stage 3 — LLM processing
    update('processing', 60, 'Sending transcript to Claude…')
    await delay(2000)
    update('processing', 90, 'Validating structured JSON…')
    await delay(500)

    // Load the sample JSON
    if (!existsSync(SAMPLE_JSON_PATH)) {
      throw new Error(`Sample JSON not found at ${SAMPLE_JSON_PATH}`)
    }
    const sampleData = JSON.parse(readFileSync(SAMPLE_JSON_PATH, 'utf-8'))

    // Persist to disk under output/<transcriptId>/
    const outDir = join(ROOT, 'output', `${transcriptId}-analysis`)
    mkdirSync(outDir, { recursive: true })
    const jsonPath = join(outDir, 'transcript_analysis.json')
    writeFileSync(jsonPath, JSON.stringify(sampleData, null, 2), 'utf-8')

    // Mark transcript ready
    transcriptQueries.updateStatus.run('ready', jsonPath, null, transcriptId)
    jobQueries.update.run('done', 100, 'Done', transcriptId, jobId)
    onProgress('done', 100, 'Done')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    transcriptQueries.updateStatus.run('error', null, message, transcriptId)
    jobQueries.update.run('error', 0, message, null, jobId)
    onProgress('error', 0, message)
  }
}
