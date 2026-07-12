import { google, youtube_v3 } from 'googleapis';
import NodeCache from 'node-cache';
import { Innertube } from 'youtubei.js';
import {
  TranscriptSegment,
  TranscriptOptions,
  FormattedTranscript,
  TranscriptError,
  TimeRange,
  SearchOptions,
  ResearchSourceMetadata,
  ResearchTranscript,
} from './types/youtube-types.js';
import { Json3CaptionResponse, parseJson3Transcript } from './transcript-parser.js';
import { segmentTranscript } from './transcript-processing.js';

const TRANSCRIPT_CACHE_TTL = 3600; // Cache transcripts for 1 hour
const TRANSCRIPT_CACHE_MAX_KEYS = 500;

interface BasicVideoInfo {
  title?: string;
  channel_id?: string;
  author?: string;
  channel?: {
    id: string;
    name: string;
    url: string;
  } | null;
  thumbnail?: Array<{ url: string }>;
}

interface TranscriptSource {
  segments: TranscriptSegment[];
  metadata: ResearchSourceMetadata;
}

function normalizeYouTubeUrl(url: string | undefined): string | null {
  if (!url) {
    return null;
  }
  return new URL(url, 'https://www.youtube.com').toString();
}

export function createResearchSourceMetadata(
  videoId: string,
  basicInfo: BasicVideoInfo,
): ResearchSourceMetadata {
  const channelId = basicInfo.channel?.id ?? basicInfo.channel_id ?? null;
  const thumbnails = basicInfo.thumbnail ?? [];
  return {
    videoId,
    title: basicInfo.title ?? videoId,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    channelId,
    channelName: basicInfo.channel?.name ?? basicInfo.author ?? null,
    channelUrl: normalizeYouTubeUrl(
      basicInfo.channel?.url
        ?? (channelId ? `/channel/${channelId}` : undefined),
    ),
    thumbnailUrl: thumbnails[thumbnails.length - 1]?.url ?? null,
  };
}

export class YouTubeService {
  private static readonly transcriptCache = new NodeCache({
    stdTTL: TRANSCRIPT_CACHE_TTL,
    maxKeys: TRANSCRIPT_CACHE_MAX_KEYS,
  });
  private static innertubePromise?: Promise<Innertube>;

  public youtube: youtube_v3.Youtube;
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.YOUTUBE_API_KEY || '';
    
    this.youtube = google.youtube({
      version: 'v3',
      auth: this.apiKey
    });
  }

  get hasApiKey(): boolean {
    return this.apiKey.length > 0;
  }

  requireApiKey(): void {
    if (!this.hasApiKey) {
      throw new Error(
        'This tool requires YOUTUBE_API_KEY. Transcript research tools work without an API key.',
      );
    }
  }

  private getInnertube(): Promise<Innertube> {
    YouTubeService.innertubePromise ??= Innertube.create();
    return YouTubeService.innertubePromise;
  }

  private async fetchTranscriptSource(
    videoId: string,
    language?: string,
  ): Promise<TranscriptSource> {
    const innertube = await this.getInnertube();
    const videoInfo = await innertube.getBasicInfo(videoId, { client: 'ANDROID_VR' });
    const tracks = videoInfo.captions?.caption_tracks ?? [];

    if (tracks.length === 0) {
      throw new Error('No caption tracks are available for this video.');
    }

    const exactTracks = language
      ? tracks.filter((track) => track.language_code.toLowerCase() === language.toLowerCase())
      : tracks;
    const track = exactTracks.find((candidate) => candidate.kind !== 'asr')
      ?? exactTracks[0]
      ?? tracks.find((candidate) => candidate.kind !== 'asr')
      ?? tracks[0];

    if (!track) {
      throw new Error(`No captions are available for language ${language}.`);
    }

    const captionUrl = new URL(track.base_url);
    captionUrl.searchParams.set('fmt', 'json3');
    if (language && track.language_code.toLowerCase() !== language.toLowerCase()) {
      if (!track.is_translatable) {
        throw new Error(`No captions are available for language ${language}.`);
      }
      captionUrl.searchParams.set('tlang', language);
    }

    const response = await fetch(captionUrl, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; YouTubeResearchMCP/1.2)' },
    });
    if (!response.ok) {
      throw new Error(`Caption request failed with HTTP ${response.status}.`);
    }

    const data = await response.json() as Json3CaptionResponse;
    const segments = parseJson3Transcript(data);

    if (segments.length === 0) {
      throw new Error('YouTube returned an empty caption track.');
    }

    return {
      segments,
      metadata: createResearchSourceMetadata(videoId, videoInfo.basic_info),
    };
  }

  async searchVideos(
    query: string,
    maxResults: number = 10,
    options: {
      channelId?: string;
      order?: string;
      type?: string;
      videoDuration?: string;
      publishedAfter?: string;
      publishedBefore?: string;
      videoCaption?: string;
      videoDefinition?: string;
      regionCode?: string;
    } = {}
  ): Promise<youtube_v3.Schema$SearchListResponse> {
    this.requireApiKey();
    try {
      const response = await this.youtube.search.list({
        part: ['snippet'],
        q: query,
        maxResults,
        type: options.type ? [options.type] : ['video'],
        channelId: options.channelId,
        order: options.order,
        videoDuration: options.videoDuration,
        publishedAfter: options.publishedAfter,
        publishedBefore: options.publishedBefore,
        videoCaption: options.videoCaption,
        videoDefinition: options.videoDefinition,
        regionCode: options.regionCode
      });
      return response.data;
    } catch (error) {
      console.error('Error searching videos:', error);
      throw error;
    }
  }

  async getVideoDetails(videoId: string): Promise<youtube_v3.Schema$VideoListResponse> {
    this.requireApiKey();
    try {
      const response = await this.youtube.videos.list({
        part: ['snippet', 'contentDetails', 'statistics'],
        id: [videoId]
      });
      return response.data;
    } catch (error) {
      console.error('Error getting video details:', error);
      throw error;
    }
  }

  async getChannelDetails(channelId: string): Promise<youtube_v3.Schema$ChannelListResponse> {
    this.requireApiKey();
    try {
      const response = await this.youtube.channels.list({
        part: ['snippet', 'statistics'],
        id: [channelId]
      });
      return response.data;
    } catch (error) {
      console.error('Error getting channel details:', error);
      throw error;
    }
  }

  async getComments(
    videoId: string,
    maxResults: number = 20,
    options: {
      order?: 'time' | 'relevance';
      pageToken?: string;
      includeReplies?: boolean;
    } = {}
  ): Promise<youtube_v3.Schema$CommentThreadListResponse> {
    this.requireApiKey();
    try {
      const { order = 'relevance', pageToken, includeReplies = false } = options;

      const response = await this.youtube.commentThreads.list({
        part: includeReplies ? ['snippet', 'replies'] : ['snippet'],
        videoId,
        maxResults,
        order,
        pageToken
      });

      return response.data;
    } catch (error) {
      console.error('Error getting comments:', error);
      throw error;
    }
  }

  async getTranscript(
    videoId: string,
    language?: string
  ): Promise<TranscriptSegment[]>;

  async getTranscript(
    videoId: string,
    options: TranscriptOptions
  ): Promise<TranscriptSegment[]>;

  async getTranscript(
    videoId: string,
    langOrOptions?: string | TranscriptOptions
  ): Promise<TranscriptSegment[]> {
    // Normalize options to support both legacy language string and new options object
    const options: TranscriptOptions = typeof langOrOptions === 'string'
      ? { language: langOrOptions }
      : langOrOptions || {};

    const source = await this.loadTranscriptSource(videoId, options);
    return this.processTranscript(source.segments, options);
  }

  async getResearchTranscript(
    videoId: string,
    options: TranscriptOptions = {},
  ): Promise<ResearchTranscript> {
    const source = await this.loadTranscriptSource(videoId, options);
    return {
      fullTranscript: source.segments,
      transcript: this.processTranscript(source.segments, options),
      source: source.metadata,
    };
  }

  async getEnhancedTranscript(
    videoId: string | string[],
    options: TranscriptOptions = {}
  ): Promise<FormattedTranscript> {
    try {
      const videoIds = Array.isArray(videoId) ? videoId : [videoId];
      const transcriptPromises = videoIds.map(id => this.getTranscript(id, options));
      const transcripts = await Promise.all(transcriptPromises);

      // Combine transcripts if multiple videos
      let combinedSegments: TranscriptSegment[] = [];
      transcripts.forEach((segments, index) => {
        // Add video identifier to each segment if multiple videos
        if (videoIds.length > 1) {
          segments = segments.map(segment => ({
            ...segment,
            videoId: videoIds[index]
          }));
        }
        combinedSegments = [...combinedSegments, ...segments];
      });

      const videoDetails = options.includeMetadata
        ? await Promise.all(videoIds.map(id => this.getVideoDetails(id)))
        : [];

      // Process and format the transcript
      const processedTranscript = this.processTranscript(combinedSegments, options);

      // Format the final output
      return this.formatTranscript(processedTranscript, videoDetails, options);
    } catch (error) {
      console.error('Error getting enhanced transcript:', error);
      throw error;
    }
  }

  private processTranscript(
    segments: TranscriptSegment[],
    options: TranscriptOptions
  ): TranscriptSegment[] {
    if (!segments.length) {
      return [];
    }

    let processedSegments = [...segments];

    // Filter by time range if specified
    if (options.timeRange) {
      processedSegments = this.filterByTimeRange(processedSegments, options.timeRange);
    }

    // Filter by search text if specified
    if (options.search) {
      processedSegments = this.filterBySearchText(processedSegments, options.search);
    }

    // Apply segment splitting if specified
    if (options.segment) {
      processedSegments = segmentTranscript(
        processedSegments,
        options.segment.method,
        options.segment.count,
      );
    }

    return processedSegments;
  }

  private filterByTimeRange(
    segments: TranscriptSegment[],
    timeRange: TimeRange
  ): TranscriptSegment[] {
    const { start = 0, end } = timeRange;

    return segments.filter(segment => {
      const segmentStart = segment.offset / 1000; // Convert to seconds
      const segmentEnd = (segment.offset + segment.duration) / 1000;

      if (end) {
        return segmentStart >= start && segmentEnd <= end;
      }

      return segmentStart >= start;
    });
  }

  private filterBySearchText(
    segments: TranscriptSegment[],
    search: SearchOptions
  ): TranscriptSegment[] {
    const { query, caseSensitive = false, contextLines = 0, matchMode = 'substring' } = search;

    if (!query || query.trim() === '') {
      return segments;
    }

    const matchedIndices: number[] = [];

    // Find all segments that match the search query
    segments.forEach((segment, index) => {
      const text = caseSensitive ? segment.text : segment.text.toLowerCase();
      const searchText = caseSensitive ? query : query.toLowerCase();
      const isMatch = matchMode === 'word'
        ? new RegExp(`(?:^|\\W)${searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|\\W)`).test(text)
        : text.includes(searchText);

      if (isMatch) {
        matchedIndices.push(index);
      }
    });

    // If no matches, return empty array
    if (matchedIndices.length === 0) {
      return [];
    }

    // Add context lines
    const indicesWithContext = new Set<number>();
    matchedIndices.forEach(index => {
      indicesWithContext.add(index);

      for (let i = 1; i <= contextLines; i++) {
        if (index - i >= 0) {
          indicesWithContext.add(index - i);
        }

        if (index + i < segments.length) {
          indicesWithContext.add(index + i);
        }
      }
    });

    // Sort indices and return segments
    return Array.from(indicesWithContext)
      .sort((a, b) => a - b)
      .map(index => segments[index]);
  }

  private formatTranscript(
    segments: TranscriptSegment[],
    videoDetails: youtube_v3.Schema$VideoListResponse[],
    options: TranscriptOptions
  ): FormattedTranscript {
    const { format = 'raw' } = options;

    // Basic metadata
    const result: FormattedTranscript = {
      segments,
      totalSegments: segments.length,
      duration: segments.reduce((sum, segment) => sum + segment.duration, 0) / 1000, // in seconds
      format
    };

    // Add video metadata if requested
    if (options.includeMetadata) {
      result.metadata = videoDetails.map(details => {
        const video = details.items?.[0];
        if (!video) return null;

        return {
          id: video.id,
          title: video.snippet?.title,
          channelId: video.snippet?.channelId,
          channelTitle: video.snippet?.channelTitle,
          publishedAt: video.snippet?.publishedAt,
          duration: video.contentDetails?.duration,
          viewCount: video.statistics?.viewCount,
          likeCount: video.statistics?.likeCount
        };
      }).filter(Boolean);
    }

    // Format transcript according to requested format
    if (format === 'timestamped') {
      result.text = segments.map(segment => {
        const startTime = this.formatTimestamp(segment.offset);
        return `[${startTime}] ${segment.text}`;
      }).join('\n');
    } else if (format === 'merged') {
      result.text = segments.map(segment => segment.text).join(' ');
    }

    return result;
  }

  /**
   * Extracts key moments from a transcript based on content analysis
   * @param videoId Video ID to analyze
   * @param maxMoments Maximum number of key moments to extract
   * @returns A formatted transcript with key moments and their timestamps
   */
  async getKeyMomentsTranscript(
    videoId: string,
    maxMoments: number = 5
  ): Promise<FormattedTranscript> {
    try {
      // Get full transcript
      const transcriptData = await this.getTranscript(videoId);

      const video = this.hasApiKey
        ? (await this.getVideoDetails(videoId)).items?.[0]
        : undefined;

      if (!transcriptData.length) {
        throw new Error('No transcript available for this video');
      }

      // Convert to paragraph chunks to better identify key moments
      const paragraphs: { text: string; startTime: number; endTime: number }[] = [];
      let currentParagraph = '';
      let startTime = 0;

      // Group segments into logical paragraphs (simple approach: group 5-8 segments together)
      const paragraphSize = Math.max(5, Math.min(8, Math.floor(transcriptData.length / 15)));

      for (let i = 0; i < transcriptData.length; i++) {
        const segment = transcriptData[i];

        if (i % paragraphSize === 0) {
          if (currentParagraph) {
            paragraphs.push({
              text: currentParagraph.trim(),
              startTime,
              endTime: segment.offset / 1000
            });
          }
          currentParagraph = segment.text;
          startTime = segment.offset / 1000;
        } else {
          currentParagraph += ' ' + segment.text;
        }
      }

      // Add the last paragraph
      if (currentParagraph) {
        const lastSegment = transcriptData[transcriptData.length - 1];
        paragraphs.push({
          text: currentParagraph.trim(),
          startTime,
          endTime: (lastSegment.offset + lastSegment.duration) / 1000
        });
      }

      const keyMoments = paragraphs
        .map((paragraph) => {
          const words = paragraph.text.toLocaleLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
          const uniqueWords = new Set(words.filter((word) => word.length > 2));
          return {
            ...paragraph,
            score: uniqueWords.size / Math.sqrt(Math.max(words.length, 1)),
          };
        })
        .filter((paragraph) => paragraph.text.length > 100)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxMoments)
        .sort((a, b) => a.startTime - b.startTime);

      const keyMomentSegments: TranscriptSegment[] = keyMoments.map((moment) => ({
        text: moment.text,
        offset: moment.startTime * 1000,
        duration: (moment.endTime - moment.startTime) * 1000,
      }));

      // Create formatted output
      const title = video?.snippet?.title || 'Video Transcript';
      let formattedText = `# Key Moments in: ${title}\n\n`;

      keyMoments.forEach((moment, index) => {
        const timeFormatted = this.formatTimestamp(moment.startTime * 1000);
        const sourceUrl = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(moment.startTime)}s`;
        formattedText += `## Key Moment ${index + 1} [${timeFormatted}](${sourceUrl})\n${moment.text}\n\n`;
      });

      return {
        segments: keyMomentSegments,
        totalSegments: keyMomentSegments.length,
        duration: (transcriptData[transcriptData.length - 1].offset +
                 transcriptData[transcriptData.length - 1].duration) / 1000,
        format: 'timestamped',
        text: formattedText,
        metadata: video ? [{
          id: video.id,
          title: video.snippet?.title,
          channelId: video.snippet?.channelId,
          channelTitle: video.snippet?.channelTitle,
          publishedAt: video.snippet?.publishedAt,
          duration: video.contentDetails?.duration,
          viewCount: video.statistics?.viewCount,
          likeCount: video.statistics?.likeCount
        }] : undefined
      };
    } catch (error) {
      console.error('Error getting key moments transcript:', error);
      throw error;
    }
  }

  /**
   * Divides a video transcript into segments and prepares it for segment-by-segment analysis
   * @param videoId Video ID to segment
   * @param segmentCount Number of segments to divide the transcript into
   * @returns A formatted transcript with segments marked by timestamps
   */
  async getSegmentedTranscript(
    videoId: string,
    segmentCount: number = 4
  ): Promise<FormattedTranscript> {
    try {
      // Get full transcript
      const transcriptData = await this.getTranscript(videoId);

      const video = this.hasApiKey
        ? (await this.getVideoDetails(videoId)).items?.[0]
        : undefined;

      if (!transcriptData.length) {
        throw new Error('No transcript available for this video');
      }

      // Calculate total duration
      const lastSegment = transcriptData[transcriptData.length - 1];
      const totalDuration = (lastSegment.offset + lastSegment.duration) / 1000; // in seconds

      // Calculate segment size
      const segmentDuration = totalDuration / segmentCount;
      const segments: {
        startTime: number;
        endTime: number;
        text: string;
        transcriptSegments: TranscriptSegment[];
      }[] = [];

      // Create segments
      for (let i = 0; i < segmentCount; i++) {
        const startTime = i * segmentDuration;
        const endTime = (i + 1) * segmentDuration;

        // Find all transcript segments that fall within this time range
        const segmentTranscript = transcriptData.filter(segment => {
          const segmentStartTime = segment.offset / 1000;
          const segmentEndTime = (segment.offset + segment.duration) / 1000;
          return segmentStartTime >= startTime && segmentStartTime < endTime;
        });

        if (segmentTranscript.length > 0) {
          segments.push({
            startTime,
            endTime,
            text: segmentTranscript.map(s => s.text).join(' '),
            transcriptSegments: segmentTranscript
          });
        }
      }

      // Create formatted output
      const title = video?.snippet?.title || 'Video Transcript';
      let formattedText = `# Segmented Transcript: ${title}\n\n`;

      segments.forEach((segment, index) => {
        const startTimeFormatted = this.formatTimestamp(segment.startTime * 1000);
        const endTimeFormatted = this.formatTimestamp(segment.endTime * 1000);

        formattedText += `## Segment ${index + 1} [${startTimeFormatted} - ${endTimeFormatted}]\n\n`;

        // Add transcript for this segment
        formattedText += segment.transcriptSegments.map(s =>
          `[${this.formatTimestamp(s.offset)}] ${s.text}`
        ).join('\n');

        formattedText += '\n\n';
      });

      return {
        segments: transcriptData,
        totalSegments: transcriptData.length,
        duration: totalDuration,
        format: 'timestamped',
        text: formattedText,
        metadata: video ? [{
          id: video.id,
          title: video.snippet?.title,
          channelId: video.snippet?.channelId,
          channelTitle: video.snippet?.channelTitle,
          publishedAt: video.snippet?.publishedAt,
          duration: video.contentDetails?.duration,
          viewCount: video.statistics?.viewCount,
          likeCount: video.statistics?.likeCount
        }] : undefined
      };
    } catch (error) {
      console.error('Error creating segmented transcript:', error);
      throw error;
    }
  }

  private formatTimestamp(milliseconds: number): string {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private generateTranscriptCacheKey(videoId: string, options: TranscriptOptions): string {
    const optionsString = JSON.stringify({
      language: options.language || 'default'
    });
    return `transcript_${videoId}_${optionsString}`;
  }

  private async loadTranscriptSource(
    videoId: string,
    options: TranscriptOptions,
  ): Promise<TranscriptSource> {
    const cacheKey = this.generateTranscriptCacheKey(videoId, options);
    const cachedSource = YouTubeService.transcriptCache.get<TranscriptSource>(cacheKey);
    if (cachedSource) {
      return cachedSource;
    }

    try {
      const source = await this.fetchTranscriptSource(videoId, options.language);
      YouTubeService.transcriptCache.set(cacheKey, source);
      return source;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error getting video transcript for ${videoId}:`, error);
      throw new TranscriptError({
        message: `Failed to fetch transcript: ${errorMessage}`,
        videoId,
        options,
        originalError: error instanceof Error ? error : new Error(errorMessage),
      });
    }
  }
}
