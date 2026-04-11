/**
 * Fetch YouTube captions via the youtube-transcript package.
 * This is the fast path — no audio download, no ASR, completes in seconds.
 */
import { YoutubeTranscript } from 'youtube-transcript'

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
