export interface TranscriptSegment {
  text: string;
  duration: number;
  offset: number;
  videoId?: string; // Added for multi-video transcripts
}

export interface ResearchSourceMetadata {
  videoId: string;
  title: string;
  videoUrl: string;
  channelId: string | null;
  channelName: string | null;
  channelUrl: string | null;
  thumbnailUrl: string | null;
}

export interface ResearchTranscript {
  fullTranscript: TranscriptSegment[];
  transcript: TranscriptSegment[];
  source: ResearchSourceMetadata;
}

export interface TimeRange {
  start?: number; // Start time in seconds
  end?: number; // End time in seconds
}

export interface SearchOptions {
  query: string;
  caseSensitive?: boolean;
  contextLines?: number;
  matchMode?: 'substring' | 'word';
}

export interface TranscriptOptions {
  language?: string;
  timeRange?: TimeRange;
  search?: SearchOptions;
  segment?: {
    method: 'equal' | 'smart';
    count: number;
  };
  format?: 'raw' | 'timestamped' | 'merged';
  includeMetadata?: boolean;
}

export interface TranscriptSummaryOptions {
  summaryLength?: 'short' | 'medium' | 'detailed';
  includeKeywords?: boolean;
  includeTimestamps?: boolean;
  segmentSummaries?: boolean;
}

export interface VideoMetadata {
  id?: string | null;
  title?: string | null;
  channelId?: string | null;
  channelTitle?: string | null;
  publishedAt?: string | null;
  duration?: string | null;
  viewCount?: string | null;
  likeCount?: string | null;
}

export interface FormattedTranscript {
  segments: TranscriptSegment[];
  totalSegments: number;
  duration: number; // Total duration in seconds
  format: string;
  text?: string; // Formatted text (for timestamped and merged formats)
  metadata?: Array<VideoMetadata | null>;
}

export class TranscriptError extends Error {
  public videoId: string;
  public options: TranscriptOptions;
  public originalError: Error;

  constructor(params: {
    message: string;
    videoId: string;
    options: TranscriptOptions;
    originalError: Error;
  }) {
    super(params.message);
    this.name = 'TranscriptError';
    this.videoId = params.videoId;
    this.options = params.options;
    this.originalError = params.originalError;
  }
}
