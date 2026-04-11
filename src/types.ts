export type Theme = 'dark' | 'light'

export interface User {
  id: string
  email: string
  name: string
  avatarUrl: string | null
}

export interface TranscriptMetadata {
  title: string;
  speakers: string[];
  estimated_duration_minutes: number;
  primary_topics: string[];
  date_hint: string;
}

export interface TranscriptSummary {
  one_liner: string;
  executive_summary: string;
  key_takeaways: string[];
}

export interface Quote {
  id: string;
  text: string;
  speaker: string;
  context: string;
  tags: string[];
}

export interface Insight {
  id: string;
  claim: string;
  speaker: string;
  supporting_detail: string;
  novelty: 'low' | 'medium' | 'high';
  tags: string[];
}

export interface Reference {
  id: string;
  name: string;
  type: 'tool' | 'project' | 'company' | 'person' | 'concept' | 'paper' | 'blog-post' | 'product';
  url: string | null;
  context: string;
  mentioned_by: string;
}

export interface DisagreementPosition {
  speaker: string;
  position: string;
}

export interface Disagreement {
  topic: string;
  positions: DisagreementPosition[];
  resolution: string;
}

export type TopicPosition = 'early' | 'early-mid' | 'mid' | 'mid-late' | 'late';

export interface TopicSegment {
  approximate_position: TopicPosition;
  topic: string;
  summary: string;
}

export interface TranscriptListItem {
  id: string
  userId: string
  title: string
  youtubeUrl: string | null
  videoId: string | null
  status: 'pending' | 'processing' | 'ready' | 'failed'
  isPublic: boolean
  hasData: boolean
  createdAt: string
  updatedAt: string
  isOwner: boolean
  owner: { id: string; name: string; avatarUrl: string | null }
}

export interface TranscriptAnalysis {
  metadata: TranscriptMetadata;
  summary: TranscriptSummary;
  quotes: Quote[];
  insights: Insight[];
  references: Reference[];
  disagreements_and_nuance: Disagreement[];
  topic_segments: TopicSegment[];
}
