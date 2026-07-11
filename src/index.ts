#!/usr/bin/env node
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { YouTubeService } from './youtube-service.js';
import { TranscriptOptions } from './types/youtube-types.js';
import { createTimestampUrl, extractVideoId } from './youtube-url.js';

// Configuration schema for Smithery
export const configSchema = z.object({
  youtubeApiKey: z.string().optional().describe("Optional YouTube Data API v3 key for search, comments, and statistics"),
  port: z.string().optional().describe("Server port").default("3000")
});

// Helper function to format time in MM:SS format
function formatTime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

const READ_ONLY_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const researchOutputSchema = {
  videoId: z.string(),
  sourceUrl: z.string().url(),
  language: z.string(),
  query: z.string().nullable(),
  matchMode: z.enum(['word', 'substring']).nullable(),
  timeRange: z.object({
    startSeconds: z.number().nullable(),
    endSeconds: z.number().nullable(),
  }),
  totalTranscriptSegments: z.number().int().min(1),
  totalAvailableSegments: z.number().int().min(0),
  returnedSegments: z.number().int().min(0),
  offset: z.number().int().min(0),
  truncated: z.boolean(),
  nextOffset: z.number().int().min(0).nullable(),
  durationSeconds: z.number().min(0),
  citations: z.array(z.object({
    timestamp: z.string(),
    seconds: z.number().min(0),
    text: z.string(),
    sourceUrl: z.string().url(),
  })),
} as const;

interface ResearchVideoOptions {
  video: string;
  language?: string;
  query?: string;
  contextLines: number;
  matchMode: 'word' | 'substring';
  startSeconds?: number;
  endSeconds?: number;
  offset: number;
  maxSegments: number;
}

async function researchVideo(
  youtubeService: YouTubeService,
  options: ResearchVideoOptions,
) {
  const {
    video,
    language,
    query,
    contextLines,
    matchMode,
    startSeconds,
    endSeconds,
    offset,
    maxSegments,
  } = options;
  if (endSeconds !== undefined && startSeconds !== undefined && endSeconds <= startSeconds) {
    throw new Error('endSeconds must be greater than startSeconds.');
  }

  const videoId = extractVideoId(video);
  const fullTranscript = await youtubeService.getTranscript(videoId, { language });
  const hasFilters = query !== undefined || startSeconds !== undefined || endSeconds !== undefined;
  const segments = hasFilters
    ? await youtubeService.getTranscript(videoId, {
        language,
        timeRange: startSeconds !== undefined || endSeconds !== undefined
          ? { start: startSeconds, end: endSeconds }
          : undefined,
        search: query ? { query, contextLines, matchMode } : undefined,
      })
    : fullTranscript;
  const durationSeconds = fullTranscript.reduce(
    (maximum, segment) => Math.max(maximum, (segment.offset + segment.duration) / 1000),
    0,
  );
  const selectedSegments = segments.slice(offset, offset + maxSegments);
  const citations = selectedSegments.map((segment) => {
    const seconds = segment.offset / 1000;
    return {
      timestamp: formatTime(segment.offset),
      seconds,
      text: segment.text,
      sourceUrl: createTimestampUrl(videoId, seconds),
    };
  });

  return {
    videoId,
    sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    language: language ?? 'default',
    query: query ?? null,
    matchMode: query ? matchMode : null,
    timeRange: { startSeconds: startSeconds ?? null, endSeconds: endSeconds ?? null },
    totalTranscriptSegments: fullTranscript.length,
    totalAvailableSegments: segments.length,
    returnedSegments: citations.length,
    offset,
    truncated: offset + citations.length < segments.length,
    nextOffset: offset + citations.length < segments.length
      ? offset + citations.length
      : null,
    durationSeconds,
    citations,
  };
}

// Export default function for Smithery
export default function createServer({ config }: { config: z.infer<typeof configSchema> }) {
  // Initialize the YouTube service with the provided API key
  const youtubeService = new YouTubeService(config.youtubeApiKey);

  // Create the MCP server
  const server = new McpServer({
    name: 'YouTube Research MCP',
    version: '1.1.0'
  });

  // Define resources
  server.resource(
    'video',
    new ResourceTemplate('youtube://video/{videoId}', { list: undefined }),
    {
      description: 'Get detailed information about a specific YouTube video by ID'
    },
    async (uri, { videoId }) => {
      try {
        // Ensure videoId is a string, not an array
        const videoIdStr = Array.isArray(videoId) ? videoId[0] : videoId;
        const videoData = await youtubeService.getVideoDetails(videoIdStr);
        const video = videoData.items?.[0];

        if (!video) {
          return {
            contents: [{
              uri: uri.href,
              text: `Video with ID ${videoIdStr} not found.`
            }]
          };
        }

        const details = {
          id: video.id,
          title: video.snippet?.title,
          description: video.snippet?.description,
          publishedAt: video.snippet?.publishedAt,
          channelId: video.snippet?.channelId,
          channelTitle: video.snippet?.channelTitle,
          viewCount: video.statistics?.viewCount,
          likeCount: video.statistics?.likeCount,
          commentCount: video.statistics?.commentCount,
          duration: video.contentDetails?.duration
        };

        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(details, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching video details: ${error}`
          }]
        };
      }
    }
  );

  server.resource(
    'channel',
    new ResourceTemplate('youtube://channel/{channelId}', { list: undefined }),
    {
      description: 'Get information about a specific YouTube channel by ID'
    },
    async (uri, { channelId }) => {
      try {
        // Ensure channelId is a string, not an array
        const channelIdStr = Array.isArray(channelId) ? channelId[0] : channelId;
        const channelData = await youtubeService.getChannelDetails(channelIdStr);
        const channel = channelData.items?.[0];

        if (!channel) {
          return {
            contents: [{
              uri: uri.href,
              text: `Channel with ID ${channelIdStr} not found.`
            }]
          };
        }

        const details = {
          id: channel.id,
          title: channel.snippet?.title,
          description: channel.snippet?.description,
          publishedAt: channel.snippet?.publishedAt,
          subscriberCount: channel.statistics?.subscriberCount,
          videoCount: channel.statistics?.videoCount,
          viewCount: channel.statistics?.viewCount
        };

        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(details, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching channel details: ${error}`
          }]
        };
      }
    }
  );

  server.resource(
    'transcript',
    new ResourceTemplate('youtube://transcript/{videoId}', { list: undefined }),
    {
      description: 'Get the transcript/captions for a specific YouTube video with optional language parameter'
    },
    async (uri, { videoId }) => {
      try {
        // Parse parameters from the URL
        const url = new URL(uri.href);
        const language = url.searchParams.get('language');

        // Ensure videoId is a string, not an array
        const videoIdStr = Array.isArray(videoId) ? videoId[0] : videoId;

        try {
          // Get transcript
          const transcriptData = await youtubeService.getTranscript(videoIdStr, language || undefined);

          // Format the transcript with timestamps
          const formattedTranscript = transcriptData.map(caption =>
            `[${formatTime(caption.offset)}] ${caption.text}`
          ).join('\n');

          // Create metadata
          const metadata = {
            videoId: videoIdStr,
            language: language || 'default',
            captionCount: transcriptData.length
          };

          return {
            contents: [{
              uri: uri.href,
              text: `# Transcript for: ${videoIdStr}\n\n${formattedTranscript}`
            }],
            metadata
          };
        } catch (error) {
          return {
            contents: [{
              uri: uri.href,
              text: `Transcript not available for video ID ${videoIdStr}. Error: ${error}`
            }]
          };
        }
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching transcript: ${error}`
          }]
        };
      }
    }
  );

  // Define tools
  server.tool(
    'search-videos',
    '[Requires YOUTUBE_API_KEY] Search for YouTube videos with advanced filtering options. Supports parameters: \
- query: Search term (required) \
- maxResults: Number of results to return (1-50) \
- channelId: Filter by specific channel \
- order: Sort by date, rating, viewCount, relevance, title \
- type: Filter by resource type (video, channel, playlist) \
- videoDuration: Filter by length (short: <4min, medium: 4-20min, long: >20min) \
- publishedAfter/publishedBefore: Filter by publish date (ISO format) \
- videoCaption: Filter by caption availability \
- videoDefinition: Filter by quality (standard/high) \
- regionCode: Filter by country (ISO country code)',
    {
      query: z.string().min(1),
      maxResults: z.number().min(1).max(50).optional(),
      channelId: z.string().optional(),
      order: z.enum(['date', 'rating', 'relevance', 'title', 'videoCount', 'viewCount']).optional(),
      type: z.enum(['video', 'channel', 'playlist']).optional(),
      videoDuration: z.enum(['any', 'short', 'medium', 'long']).optional(),
      publishedAfter: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/).optional(),
      publishedBefore: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/).optional(),
      videoCaption: z.enum(['any', 'closedCaption', 'none']).optional(),
      videoDefinition: z.enum(['any', 'high', 'standard']).optional(),
      regionCode: z.string().length(2).optional()
    },
    READ_ONLY_TOOL_ANNOTATIONS,
    async ({ query, maxResults = 10, channelId, order, type, videoDuration, publishedAfter, publishedBefore, videoCaption, videoDefinition, regionCode }) => {
      try {
        const searchResults = await youtubeService.searchVideos(query, maxResults, {
          channelId,
          order,
          type,
          videoDuration,
          publishedAfter,
          publishedBefore,
          videoCaption,
          videoDefinition,
          regionCode
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(searchResults, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error searching videos: ${error}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'get-video-comments',
    '[Requires YOUTUBE_API_KEY] Retrieve comments for a specific YouTube video with sorting options',
    {
      videoId: z.string().min(1),
      maxResults: z.number().min(1).max(100).optional(),
      order: z.enum(['time', 'relevance']).optional(),
      includeReplies: z.boolean().optional(),
      pageToken: z.string().optional()
    },
    READ_ONLY_TOOL_ANNOTATIONS,
    async ({ videoId, maxResults = 20, order = 'relevance', includeReplies = false, pageToken }) => {
      try {
        const commentsData = await youtubeService.getComments(videoId, maxResults, {
          order,
          includeReplies,
          pageToken
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(commentsData, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error fetching comments: ${error}`
          }],
          isError: true
        };
      }
    }
  );

  server.registerTool(
    'research-video',
    {
      title: 'Research a YouTube video',
      description: 'Extract a citation-ready YouTube transcript without requiring a YouTube API key. Accepts a video ID or URL and returns timestamped source links that agents can cite and open directly.',
      inputSchema: {
        video: z.string().min(1).describe('YouTube video ID or URL'),
        language: z.string().optional().describe('Caption language code, for example en, ko, or ja'),
        query: z.string().min(1).optional().describe('Return only matching transcript segments'),
        contextLines: z.number().int().min(0).max(5).optional().describe('Nearby segments to include around query matches'),
        matchMode: z.enum(['word', 'substring']).optional().describe('Whole-word matching is the default'),
        startSeconds: z.number().min(0).optional().describe('Only inspect captions at or after this time'),
        endSeconds: z.number().min(0).optional().describe('Only inspect captions at or before this time'),
        offset: z.number().int().min(0).optional().describe('Result offset for pagination'),
        maxSegments: z.number().int().min(1).max(1000).optional().describe('Maximum citations to return; defaults to 200'),
      },
      outputSchema: researchOutputSchema,
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({
      video,
      language,
      query,
      contextLines = 1,
      matchMode = 'word',
      startSeconds,
      endSeconds,
      offset = 0,
      maxSegments = 200,
    }) => {
      try {
        const result = await researchVideo(youtubeService, {
          video,
          language,
          query,
          contextLines,
          matchMode,
          startSeconds,
          endSeconds,
          offset,
          maxSegments,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
          structuredContent: result,
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Failed to research video: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'research-videos',
    {
      title: 'Compare evidence across YouTube videos',
      description: 'Run the same focused transcript query across 2 to 5 YouTube videos and return timestamp-linked evidence for comparison. No YouTube API key is required.',
      inputSchema: {
        videos: z.array(z.string().min(1)).min(2).max(5).describe('YouTube video IDs or URLs'),
        query: z.string().min(1).describe('Phrase or word to find in every transcript'),
        language: z.string().optional().describe('Optional caption language code'),
        contextLines: z.number().int().min(0).max(3).optional(),
        matchMode: z.enum(['word', 'substring']).optional(),
        maxSegmentsPerVideo: z.number().int().min(1).max(100).optional(),
      },
      outputSchema: {
        query: z.string(),
        videosRequested: z.number().int().min(2).max(5),
        results: z.array(z.object(researchOutputSchema)),
      },
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({
      videos,
      query,
      language,
      contextLines = 1,
      matchMode = 'word',
      maxSegmentsPerVideo = 20,
    }) => {
      try {
        const results = await Promise.all(videos.map((video) => researchVideo(youtubeService, {
          video,
          language,
          query,
          contextLines,
          matchMode,
          offset: 0,
          maxSegments: maxSegmentsPerVideo,
        })));
        const result = { query, videosRequested: videos.length, results };
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Failed to research videos: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'get-video-transcript',
    'Get the transcript/captions for a YouTube video with optional language selection. This tool retrieves the full transcript of a video with timestamped captions. Each caption includes the text and its timestamp in the video. Parameters: videoId (required) - The YouTube video ID; language (optional) - Language code for the transcript (e.g., "en", "ko", "ja"). If not specified, the default language for the video will be used. Returns a text with each caption line preceded by its timestamp.',
    {
      videoId: z.string().min(1).describe('YouTube video ID or URL'),
      language: z.string().optional()
    },
    READ_ONLY_TOOL_ANNOTATIONS,
    async ({ videoId, language }) => {
      try {
        const resolvedVideoId = extractVideoId(videoId);
        const transcriptData = await youtubeService.getTranscript(resolvedVideoId, language);

        // Optionally format the transcript for better readability
        const formattedTranscript = transcriptData.map(caption =>
          `[${formatTime(caption.offset)}] ${caption.text}`
        ).join('\n');

        return {
          content: [{
            type: 'text',
            text: formattedTranscript
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error fetching transcript: ${error}`
          }],
          isError: true
        };
      }
    }
  );

  // Additional tools
  server.tool(
    'get-video-stats',
    '[Requires YOUTUBE_API_KEY] Get statistical information for a specific YouTube video (views, likes, comments, upload date, etc.)',
    {
      videoId: z.string().min(1)
    },
    READ_ONLY_TOOL_ANNOTATIONS,
    async ({ videoId }) => {
      try {
        const videoData = await youtubeService.getVideoDetails(videoId);
        const video = videoData.items?.[0];

        if (!video) {
          return {
            content: [{
              type: 'text',
              text: `Video with ID ${videoId} not found.`
            }],
            isError: true
          };
        }

        const stats = {
          videoId: video.id,
          title: video.snippet?.title,
          publishedAt: video.snippet?.publishedAt,
          channelTitle: video.snippet?.channelTitle,
          viewCount: video.statistics?.viewCount,
          likeCount: video.statistics?.likeCount,
          commentCount: video.statistics?.commentCount,
          duration: video.contentDetails?.duration
        };

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(stats, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error fetching video statistics: ${error}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'get-channel-stats',
    '[Requires YOUTUBE_API_KEY] Get statistical information for a specific YouTube channel (subscriber count, total views, video count, etc.)',
    {
      channelId: z.string().min(1)
    },
    READ_ONLY_TOOL_ANNOTATIONS,
    async ({ channelId }) => {
      try {
        const channelData = await youtubeService.getChannelDetails(channelId);
        const channel = channelData.items?.[0];

        if (!channel) {
          return {
            content: [{
              type: 'text',
              text: `Channel with ID ${channelId} not found.`
            }],
            isError: true
          };
        }

        const stats = {
          channelId: channel.id,
          title: channel.snippet?.title,
          createdAt: channel.snippet?.publishedAt,
          subscriberCount: channel.statistics?.subscriberCount,
          videoCount: channel.statistics?.videoCount,
          viewCount: channel.statistics?.viewCount,
          thumbnailUrl: channel.snippet?.thumbnails?.default?.url
        };

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(stats, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error fetching channel statistics: ${error}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'compare-videos',
    '[Requires YOUTUBE_API_KEY] Compare statistics for multiple YouTube videos',
    {
      videoIds: z.array(z.string()).min(2).max(10)
    },
    READ_ONLY_TOOL_ANNOTATIONS,
    async ({ videoIds }) => {
      try {
        const results = [];

        for (const videoId of videoIds) {
          const videoData = await youtubeService.getVideoDetails(videoId);
          const video = videoData.items?.[0];

          if (video) {
            results.push({
              videoId: video.id,
              title: video.snippet?.title,
              viewCount: Number(video.statistics?.viewCount || 0),
              likeCount: Number(video.statistics?.likeCount || 0),
              commentCount: Number(video.statistics?.commentCount || 0),
              publishedAt: video.snippet?.publishedAt
            });
          }
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error comparing videos: ${error}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'get-trending-videos',
    '[Requires YOUTUBE_API_KEY] Retrieve trending videos by region and category. This helps analyze current popular content trends.',
    {
      regionCode: z.string().length(2).optional(),
      categoryId: z.string().optional(),
      maxResults: z.number().min(1).max(50).optional()
    },
    READ_ONLY_TOOL_ANNOTATIONS,
    async ({ regionCode = 'US', categoryId, maxResults = 10 }) => {
      try {
        youtubeService.requireApiKey();
        const response = await youtubeService.youtube.videos.list({
          part: ['snippet', 'contentDetails', 'statistics'],
          chart: 'mostPopular',
          regionCode,
          videoCategoryId: categoryId,
          maxResults
        });

        const trendingVideos = response.data.items?.map(video => ({
          videoId: video.id,
          title: video.snippet?.title,
          channelTitle: video.snippet?.channelTitle,
          publishedAt: video.snippet?.publishedAt,
          viewCount: video.statistics?.viewCount,
          likeCount: video.statistics?.likeCount,
          commentCount: video.statistics?.commentCount
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(trendingVideos, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error fetching trending videos: ${error}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'get-video-categories',
    '[Requires YOUTUBE_API_KEY] Retrieve available video categories for a specific region',
    {
      regionCode: z.string().length(2).optional()
    },
    READ_ONLY_TOOL_ANNOTATIONS,
    async ({ regionCode = 'US' }) => {
      try {
        youtubeService.requireApiKey();
        const response = await youtubeService.youtube.videoCategories.list({
          part: ['snippet'],
          regionCode
        });

        const categories = response.data.items?.map(category => ({
          id: category.id,
          title: category.snippet?.title
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(categories, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error fetching video categories: ${error}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'analyze-channel-videos',
    '[Requires YOUTUBE_API_KEY] Analyze recent videos from a specific channel to identify performance trends',
    {
      channelId: z.string().min(1),
      maxResults: z.number().min(1).max(50).optional(),
      sortBy: z.enum(['date', 'viewCount', 'rating']).optional()
    },
    READ_ONLY_TOOL_ANNOTATIONS,
    async ({ channelId, maxResults = 10, sortBy = 'date' }) => {
      try {
        youtubeService.requireApiKey();
        // First get all videos from the channel
        const searchResponse = await youtubeService.youtube.search.list({
          part: ['snippet'],
          channelId,
          maxResults,
          order: sortBy,
          type: ['video']
        });

        // Extract videoIds and filter out any null or undefined values
        const videoIds: string[] = searchResponse.data.items
          ?.map(item => item.id?.videoId)
          .filter((id): id is string => id !== null && id !== undefined) || [];

        if (videoIds.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `No videos found for channel ${channelId}`
            }]
          };
        }

        // Then get detailed stats for each video
        const videosResponse = await youtubeService.youtube.videos.list({
          part: ['snippet', 'statistics', 'contentDetails'],
          id: videoIds
        });

        interface VideoAnalysisItem {
          videoId: string;
          title: string | null | undefined;
          publishedAt: string | null | undefined;
          duration: string | null | undefined;
          viewCount: number;
          likeCount: number;
          commentCount: number;
        }

        const videoAnalysis: VideoAnalysisItem[] = videosResponse.data.items?.map(video => ({
          videoId: video.id || '',
          title: video.snippet?.title,
          publishedAt: video.snippet?.publishedAt,
          duration: video.contentDetails?.duration,
          viewCount: Number(video.statistics?.viewCount || 0),
          likeCount: Number(video.statistics?.likeCount || 0),
          commentCount: Number(video.statistics?.commentCount || 0)
        })) || [];

        // Calculate averages
        if (videoAnalysis.length > 0) {
          const avgViews = videoAnalysis.reduce((sum: number, video: VideoAnalysisItem) => sum + video.viewCount, 0) / videoAnalysis.length;
          const avgLikes = videoAnalysis.reduce((sum: number, video: VideoAnalysisItem) => sum + video.likeCount, 0) / videoAnalysis.length;
          const avgComments = videoAnalysis.reduce((sum: number, video: VideoAnalysisItem) => sum + video.commentCount, 0) / videoAnalysis.length;

          const result = {
            channelId,
            videoCount: videoAnalysis.length,
            averages: {
              viewCount: avgViews,
              likeCount: avgLikes,
              commentCount: avgComments
            },
            videos: videoAnalysis
          };

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `No video data available for analysis`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error analyzing channel videos: ${error}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'enhanced-transcript',
    'Advanced transcript extraction tool with filtering, search, and multi-video capabilities. Provides rich transcript data for detailed analysis and processing. This tool offers multiple advanced features: 1) Extract transcripts from multiple videos in one request; 2) Filter by time ranges to focus on specific parts; 3) Search for specific content within transcripts; 4) Segment transcripts for structural analysis; 5) Format output in different ways (raw, timestamped, merged text); 6) Include video metadata. Parameters: videoIds (required) - Array of YouTube video IDs (up to 5); language (optional) - Language code; format (optional) - Output format ("raw", "timestamped", "merged"); includeMetadata (optional) - Whether to include video details; filters (optional) - Complex filtering options including timeRange, search, and segment.',
    {
      videoIds: z.array(z.string()).min(1).max(5),
      language: z.string().optional(),
      format: z.enum(['raw', 'timestamped', 'merged']).optional(),
      includeMetadata: z.boolean().optional(),
      filters: z.object({
        timeRange: z.object({
          start: z.number().min(0).optional(),
          end: z.number().min(0).optional()
        }).optional(),
        search: z.object({
          query: z.string().min(1),
          caseSensitive: z.boolean().optional(),
          contextLines: z.number().min(0).max(5).optional()
        }).optional(),
        segment: z.object({
          method: z.enum(['equal', 'smart']).optional(),
          count: z.number().min(1).max(10).optional()
        }).optional()
      }).optional()
    },
    READ_ONLY_TOOL_ANNOTATIONS,
    async ({ videoIds, language, format, includeMetadata, filters }) => {
      try {
        const options: TranscriptOptions = {
          language,
          format,
          includeMetadata,
          timeRange: filters?.timeRange,
          search: filters?.search
        };

        // Only add segment option if both method and count are provided
        if (filters?.segment?.method && filters?.segment?.count) {
          options.segment = {
            method: filters.segment.method,
            count: filters.segment.count
          };
        }

        // Call the enhanced transcript method
        const transcript = await youtubeService.getEnhancedTranscript(videoIds, options);

        // Convert to MCP format
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(transcript, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Failed to process transcript: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'get-key-moments',
    'Extract concise, timestamp-linked key moments from a video transcript without returning the full transcript. Useful for quickly navigating longer videos. Parameters: videoId (required) - A YouTube video ID or URL; maxMoments (optional) - Number of key moments to extract (default: 5, max: 10).',
    {
      videoId: z.string().min(1).describe('YouTube video ID or URL'),
      maxMoments: z.number().int().min(1).max(10).optional()
    },
    READ_ONLY_TOOL_ANNOTATIONS,
    async ({ videoId, maxMoments }) => {
      try {
        const resolvedVideoId = extractVideoId(videoId);
        const keyMomentsTranscript = await youtubeService.getKeyMomentsTranscript(resolvedVideoId, maxMoments ?? 5);

        return {
          content: [{
            type: 'text',
            text: keyMomentsTranscript.text || 'No key moments found'
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error extracting key moments: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'get-segmented-transcript',
    'Divide a video transcript into segments for easier analysis and navigation. This tool splits the video into equal time segments and extracts the transcript for each segment with proper timestamps. Ideal for analyzing the structure of longer videos or when you need to focus on specific parts of the content. Parameters: videoId (required) - The YouTube video ID; segmentCount (optional) - Number of segments to divide the video into (default: 4, max: 10). Returns a markdown-formatted text with each segment clearly labeled with time ranges and containing the relevant transcript text.',
    {
      videoId: z.string().min(1).describe('YouTube video ID or URL'),
      segmentCount: z.number().int().min(2).max(10).optional()
    },
    READ_ONLY_TOOL_ANNOTATIONS,
    async ({ videoId, segmentCount }) => {
      try {
        const resolvedVideoId = extractVideoId(videoId);
        const segmentedTranscript = await youtubeService.getSegmentedTranscript(resolvedVideoId, segmentCount ?? 4);

        return {
          content: [{
            type: 'text',
            text: segmentedTranscript.text || 'Failed to create segmented transcript'
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error creating segmented transcript: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  server.prompt(
    'segment-by-segment-analysis',
    'Analyze a YouTube video segment by segment for a detailed breakdown of content. This prompt divides the video into the specified number of segments and provides a comprehensive analysis of each part. Particularly useful for longer videos where the content changes throughout or for educational videos with multiple topics. The analysis includes key points, important quotes, and how each segment connects to the overall theme. Parameters: videoId (required) - The YouTube video ID; segmentCount (optional) - Number of segments to divide the video into (default: 4, range: 2-8).',
    {
      videoId: z.string().min(1).describe('YouTube video ID or URL'),
      segmentCount: z.number().int().min(2).max(8).optional(),
    },
    async ({ videoId, segmentCount }) => {
      try {
        const resolvedVideoId = extractVideoId(videoId);
        const segmentedTranscript = await youtubeService.getSegmentedTranscript(resolvedVideoId, segmentCount ?? 4);

        if (!segmentedTranscript.text) {
          throw new Error('Failed to generate segmented transcript');
        }

        return {
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `Please provide a segment-by-segment analysis of the following YouTube video:

Video: https://www.youtube.com/watch?v=${resolvedVideoId}

${segmentedTranscript.text}

For each segment, please provide:
1. A brief summary of the key points and information presented
2. Any important quotes or statements
3. How this segment connects to the overall topic of the video

Conclude with a brief overall summary that ties together the main themes across all segments.`
            }
          }]
        };
      } catch (error) {
        return {
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `Error creating segment analysis prompt: ${error}`
            }
          }]
        };
      }
    }
  );

  // Define prompts
  server.prompt(
    'video-analysis',
    'Generate an analysis of a YouTube video based on its content and statistics',
    {
      videoId: z.string().min(1)
    },
    ({ videoId }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Please analyze this YouTube video (ID: ${videoId}). Include information about the video's content, key points, and audience reception.`
        }
      }]
    })
  );

  server.prompt(
    'transcript-summary',
    'Generate a summary of a YouTube video based on its transcript content with customizable options. This prompt provides different summary levels from brief overviews to detailed analyses, and can extract key topics from the content. Optimal for quickly understanding video content without watching the entire video. Parameters: videoId (required) - The YouTube video ID; language (optional) - Language code for transcript (e.g., "en", "ko"); summaryLength (optional) - Level of detail in summary ("short", "medium", or "detailed", default: "medium"); includeKeywords (optional) - Whether to extract key topics (set to "true" to enable).',
    {
      videoId: z.string().min(1).describe('YouTube video ID or URL'),
      language: z.string().optional(),
      summaryLength: z.enum(['short', 'medium', 'detailed']).optional(),
      includeKeywords: z.boolean().optional(),
    },
    async ({ videoId, language, summaryLength, includeKeywords }) => {
      try {
        const finalSummaryLength = summaryLength || 'medium';
        const resolvedVideoId = extractVideoId(videoId);
        const transcriptData = await youtubeService.getTranscript(resolvedVideoId, language);

        // Format transcript text
        const transcriptText = transcriptData.map(caption => caption.text).join(' ');

        // Define summary instructions based on length
        let summaryInstructions = '';
        switch(finalSummaryLength) {
          case 'short':
            summaryInstructions = `Please provide a brief summary of this video in 3-5 sentences that captures the main idea.`;
            break;
          case 'detailed':
            summaryInstructions = `Please provide a comprehensive summary of this video, including:
1. A detailed overview of the main topics (at least 3-4 paragraphs)
2. All important details, facts, and arguments presented
3. The structure of the content and how ideas are developed
4. The overall tone, style, and intended audience of the content
5. Any conclusions or calls to action mentioned`;
            break;
          case 'medium':
          default:
            summaryInstructions = `Please provide:
1. A concise summary of the main topics and key points
2. Important details or facts presented
3. The overall tone and style of the content`;
            break;
        }

        // Add keywords extraction if requested
        if (includeKeywords) {
          summaryInstructions += `\n\nAlso extract and list 5-10 key topics, themes, or keywords from the content in the format:
KEY TOPICS: [comma-separated list of key topics/keywords]`;
        }

        return {
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `Please provide a ${finalSummaryLength} summary of the following YouTube video transcript.

Source: https://www.youtube.com/watch?v=${resolvedVideoId}

Transcript:
${transcriptText}

${summaryInstructions}`
            }
          }]
        };
      } catch (error) {
        return {
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `Error creating transcript summary prompt: ${error}`
            }
          }]
        };
      }
    }
  );

  return server.server;
}
