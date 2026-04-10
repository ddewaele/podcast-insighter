// Shared types between frontend and backend

export interface User {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  createdAt: string
}

export type TranscriptStatus = 'processing' | 'ready' | 'error'
export type JobStatus = 'queued' | 'downloading' | 'transcribing' | 'processing' | 'done' | 'error'

export interface Transcript {
  id: string
  userId: string
  title: string
  youtubeUrl: string | null
  videoId: string | null
  status: TranscriptStatus
  isPublic: boolean
  createdAt: string
  updatedAt: string
  // Only present when fetching a single transcript
  data?: TranscriptAnalysis
  owner?: Pick<User, 'id' | 'name' | 'avatarUrl'>
}

export interface Job {
  id: string
  transcriptId: string | null
  userId: string
  youtubeUrl: string
  status: JobStatus
  progress: number
  detail: string | null
  createdAt: string
  updatedAt: string
}

export interface ProgressEvent {
  stage: JobStatus
  status: 'running' | 'done' | 'error'
  pct: number
  detail: string
  resultId?: string
}

// The existing transcript analysis shape (from the JSON schema)
export interface TranscriptAnalysis {
  metadata: {
    title: string
    speakers: string[]
    estimated_duration_minutes: number | null
    primary_topics: string[]
    date_hint: string | null
  }
  summary: {
    one_liner: string
    executive_summary: string
    key_takeaways: string[]
  }
  quotes: Array<{
    id: string
    text: string
    speaker: string
    context: string
    tags: string[]
  }>
  insights: Array<{
    id: string
    claim: string
    speaker: string
    supporting_detail: string
    novelty: 'low' | 'medium' | 'high'
    tags: string[]
  }>
  references: Array<{
    id: string
    name: string
    type: string
    url: string | null
    context: string
    mentioned_by: string
  }>
  disagreements_and_nuance: Array<{
    topic: string
    positions: Array<{ speaker: string; position: string }>
    resolution: string
  }>
  topic_segments: Array<{
    approximate_position: string
    topic: string
    summary: string
  }>
}
