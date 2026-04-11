/**
 * Fetch YouTube captions via the youtube-transcript package.
 * This is the fast path — no audio download, no ASR, completes in seconds.
 *
 * Uses createRequire to load the CJS bundle since the package's ESM/CJS
 * export map is broken under Node's native ESM resolution.
 */
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { YoutubeTranscript } = require('youtube-transcript') as {
  YoutubeTranscript: {
    fetchTranscript(videoId: string, opts?: { lang?: string }): Promise<
      Array<{ text: string; duration: number; offset: number; lang: string }>
    >
  }
}

export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

export interface FetchedTranscript {
  videoId: string
  segments: TranscriptSegment[]
  fullText: string
  wordCount: number
}

export async function fetchTranscript(videoId: string, lang = 'en'): Promise<FetchedTranscript> {
  const raw = await YoutubeTranscript.fetchTranscript(videoId, { lang })

  // offset and duration are in milliseconds
  const segments: TranscriptSegment[] = raw.map(item => ({
    start: item.offset / 1000,
    end: (item.offset + item.duration) / 1000,
    text: item.text,
  }))

  const fullText = segments.map(s => s.text).join(' ')
  const wordCount = fullText.split(/\s+/).length

  return { videoId, segments, fullText, wordCount }
}
