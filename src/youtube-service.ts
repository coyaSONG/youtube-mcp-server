import { google, youtube_v3 } from 'googleapis';
import dotenv from 'dotenv';
import { getSubtitles } from 'youtube-captions-scraper';
import NodeCache from 'node-cache';
import { TranscriptSegment, TranscriptOptions, FormattedTranscript, TranscriptError, TimeRange, SearchOptions } from './types/youtube-types.js';

dotenv.config();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const TRANSCRIPT_CACHE_TTL = 3600; // Cache transcripts for 1 hour

if (!YOUTUBE_API_KEY) {
  console.error('Warning: YOUTUBE_API_KEY is not defined in the environment variables');
  console.error('YouTube API functionality will be limited');
}

export class YouTubeService {
  public youtube: youtube_v3.Youtube;
  private transcriptCache: NodeCache;

  constructor() {
    if (YOUTUBE_API_KEY) {
      this.youtube = google.youtube({
        version: 'v3',
        auth: YOUTUBE_API_KEY
      });
    } else {
      // Create a dummy youtube instance for graceful degradation
      this.youtube = google.youtube({
        version: 'v3'
      });
    }
    this.transcriptCache = new NodeCache({ stdTTL: TRANSCRIPT_CACHE_TTL });
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

    const cacheKey = this.generateTranscriptCacheKey(videoId, options);
    const cachedTranscript = this.transcriptCache.get<TranscriptSegment[]>(cacheKey);

    if (cachedTranscript) {
      return this.processTranscript(cachedTranscript, options);
    }

    try {
      const scraperOptions: { videoID: string; lang?: string } = { videoID: videoId };

      if (options.language) {
        scraperOptions.lang = options.language;
      }

      const captions = await getSubtitles(scraperOptions);
      this.transcriptCache.set(cacheKey, captions);

      return this.processTranscript(captions, options);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error getting video transcript for ${videoId}:`, error);

      throw new TranscriptError({
        message: `Failed to fetch transcript: ${errorMessage}`,
        videoId,
        options,
        originalError: error instanceof Error ? error : new Error(errorMessage)
      });
    }
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

      const videoDetailsPromises = videoIds.map(id => this.getVideoDetails(id));
      const videoDetails = await Promise.all(videoDetailsPromises);

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
      processedSegments = this.segmentTranscript(processedSegments, options.segment);
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
    const { query, caseSensitive = false, contextLines = 0 } = search;

    if (!query || query.trim() === '') {
      return segments;
    }

    const matchedIndices: number[] = [];

    // Find all segments that match the search query
    segments.forEach((segment, index) => {
      const text = caseSensitive ? segment.text : segment.text.toLowerCase();
      const searchText = caseSensitive ? query : query.toLowerCase();

      if (text.includes(searchText)) {
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

  private segmentTranscript(
    segments: TranscriptSegment[],
    segmentOptions: { method: 'equal' | 'smart', count: number }
  ): TranscriptSegment[] {
    const { method = 'equal', count = 1 } = segmentOptions;

    if (count <= 1 || segments.length <= count) {
      return segments;
    }

    if (method === 'equal') {
      // Split into equal segments
      const segmentSize = Math.ceil(segments.length / count);
      const result: TranscriptSegment[][] = [];

      for (let i = 0; i < segments.length; i += segmentSize) {
        result.push(segments.slice(i, i + segmentSize));
      }

      return result.flat();
    } else {
      // Smart segmentation based on content
      // This would ideally use NLP to find natural segment boundaries
      // For now, we'll use a simple approach
      const totalDuration = segments.reduce((sum, segment) => sum + segment.duration, 0);
      const durationPerSegment = totalDuration / count;

      const result: TranscriptSegment[][] = [];
      let currentSegment: TranscriptSegment[] = [];
      let currentDuration = 0;

      segments.forEach(segment => {
        currentSegment.push(segment);
        currentDuration += segment.duration;

        if (currentDuration >= durationPerSegment && result.length < count - 1) {
          result.push(currentSegment);
          currentSegment = [];
          currentDuration = 0;
        }
      });

      if (currentSegment.length > 0) {
        result.push(currentSegment);
      }

      return result.flat();
    }
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

      // Get video details for title and other metadata
      const videoData = await this.getVideoDetails(videoId);
      const video = videoData.items?.[0];

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

      // Identify key moments (simple approach: paragraphs with the most content)
      // In a real implementation, this would use NLP to identify important moments
      const keyMoments = paragraphs
        .filter(p => p.text.length > 100) // Filter out short paragraphs
        .sort((a, b) => b.text.length - a.text.length) // Sort by length (simple heuristic)
        .slice(0, maxMoments); // Take only the top N moments

      // Create formatted output
      const title = video?.snippet?.title || 'Video Transcript';
      let formattedText = `# Key Moments in: ${title}\n\n`;

      keyMoments.forEach((moment, index) => {
        const timeFormatted = this.formatTimestamp(moment.startTime * 1000);
        formattedText += `## Key Moment ${index + 1} [${timeFormatted}]\n${moment.text}\n\n`;
      });

      // Add full transcript at the end
      formattedText += `\n# Full Transcript\n\n`;
      formattedText += transcriptData.map(segment =>
        `[${this.formatTimestamp(segment.offset)}] ${segment.text}`
      ).join('\n');

      return {
        segments: transcriptData,
        totalSegments: transcriptData.length,
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

      // Get video details for title and other metadata
      const videoData = await this.getVideoDetails(videoId);
      const video = videoData.items?.[0];

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
}