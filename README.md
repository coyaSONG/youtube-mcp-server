# YouTube Research MCP

[![CI](https://github.com/coyaSONG/youtube-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/coyaSONG/youtube-mcp-server/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40coyasong%2Fyoutube-mcp-server?logo=npm)](https://www.npmjs.com/package/@coyasong/youtube-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/%40coyasong%2Fyoutube-mcp-server?logo=npm)](https://www.npmjs.com/package/@coyasong/youtube-mcp-server)
[![GitHub stars](https://img.shields.io/github/stars/coyaSONG/youtube-mcp-server?style=flat&logo=github)](https://github.com/coyaSONG/youtube-mcp-server/stargazers)
[![Smithery](https://smithery.ai/badge/coyaSONG/youtube-mcp-server)](https://smithery.ai/servers/coyaSONG/youtube-mcp-server)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Turn YouTube videos into citation-ready research for Codex, Claude, Cursor, and other MCP clients. Paste a video URL and get transcript evidence with timestamps and links that open at the exact quoted moment.

![YouTube Research MCP turns a video URL into focused timestamp-linked evidence](https://raw.githubusercontent.com/coyaSONG/youtube-mcp-server/main/docs/demo.svg)

```text
Input:  https://youtu.be/dQw4w9WgXcQ
Output: [01:05] ...evidence text...
        https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=65s
```

No YouTube API key is required for transcript research.

## Why this server

- **Citation-ready research** — every transcript segment includes a timestamp and source URL.
- **Zero-key quick start** — transcripts work immediately; add an API key only for search and analytics.
- **URL-first input** — accepts normal, short, Shorts, embed, live, and raw video-ID formats.
- **Agent-efficient filtering** — search inside transcripts and return nearby context instead of spending tokens on the entire video.
- **Full YouTube intelligence** — optional API mode adds comments, video/channel statistics, trends, and comparisons.
- **Remote-native MCP** — Streamable HTTP transport at `/mcp`, plus Docker and Smithery support.

## Focused evidence, not a transcript dump

The included live smoke test asks a focused question about a public video and compares the response with the full timestamped transcript:

| Response | Characters returned |
|---|---:|
| Full transcript | 85,518 |
| `research-video` (3 citations with source identity) | 1,550 |
| Reduction | **98.2%** |

This measures response characters, not model-specific tokens. Reproduce it against the default public fixture—or substitute your own video and query:

```bash
npm run test:live
LIVE_TEST_VIDEO='https://youtu.be/VIDEO_ID' LIVE_TEST_QUERY='evaluation' npm run test:live
```

## Quick start — no API key

Requirements: Node.js 20 or newer.

The shortest local install uses stdio and needs no API key:

```bash
codex mcp add youtube-research -- npx -y @coyasong/youtube-mcp-server@latest
```

For Claude Desktop and other MCPB-compatible desktop clients, download the
[latest one-click MCP bundle](https://github.com/coyaSONG/youtube-mcp-server/releases/latest/download/youtube-research-mcp.mcpb)
and open it. The bundle vendors its runtime dependencies, starts locally over
stdio, and asks for a YouTube API key only if you want the optional analytics
tools.

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=youtube-research&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40coyasong%2Fyoutube-mcp-server%40latest%22%5D%7D)

Or install from the VS Code command line:

```bash
code --add-mcp '{"name":"youtube-research","command":"npx","args":["-y","@coyasong/youtube-mcp-server@latest"]}'
```

For Claude Desktop, Cursor, and other stdio clients, use command `npx` with arguments `-y @coyasong/youtube-mcp-server@latest`.

To run the Streamable HTTP transport instead:

```bash
git clone https://github.com/coyaSONG/youtube-mcp-server.git
cd youtube-mcp-server
npm install
npm run build
npm start
```

The server starts at `http://localhost:3000/mcp` in `transcript-only` mode. Confirm it with:

```bash
curl http://localhost:3000/health
```

### Connect from Codex

With the HTTP server running:

```bash
codex mcp add youtube-research --url http://localhost:3000/mcp
```

Then ask Codex:

```text
Use research-video to find what this video says about evaluation,
and cite the exact moments: https://www.youtube.com/watch?v=VIDEO_ID
```

### Connect with MCP Inspector

```bash
npx @modelcontextprotocol/inspector
# Connect to http://localhost:3000/mcp
```

### Install through Smithery

```bash
npx -y smithery@latest auth login
npx -y smithery@latest mcp add coyaSONG/youtube-mcp-server --client claude
```

## Enable search, comments, and analytics

Set a YouTube Data API v3 key to switch from `transcript-only` to `full` mode:

```bash
export YOUTUBE_API_KEY=your_key_here
npm start
```

`YOUTUBE_API_KEY` is optional. `PORT` defaults to `3000`.

## Secure a remote deployment

Do not expose a full-mode server publicly without authentication: unauthenticated users could consume your YouTube API quota. Set a strong bearer token and restrict browser origins when deploying outside localhost:

```bash
export MCP_BEARER_TOKEN='replace-with-a-long-random-secret'
export CORS_ORIGIN='https://your-client.example'
export MAX_SESSIONS=100
export SESSION_IDLE_TIMEOUT_MS=1800000
npm start
```

Connect Codex using an environment variable rather than writing the secret into its configuration:

```bash
export YOUTUBE_MCP_TOKEN='replace-with-a-long-random-secret'
codex mcp add youtube-research \
  --url https://your-server.example/mcp \
  --bearer-token-env-var YOUTUBE_MCP_TOKEN
```

`/health` remains public for container health checks. MCP requests return `401` when authentication is enabled and the bearer token is missing or invalid. Idle sessions are removed automatically, and `MAX_SESSIONS` bounds memory use.

## Best first tool

`research-video` accepts:

- `video`: a YouTube URL or 11-character video ID
- `language`: optional caption language such as `en`, `ko`, or `ja`
- `query`: optional phrase to find inside the transcript
- `contextLines`: surrounding segments to retain, from 0 to 5
- `matchMode`: `word` (default) or `substring`
- `startSeconds` / `endSeconds`: optional time window
- `offset`: result offset for pagination
- `maxSegments`: response cap from 1 to 1,000 (default: 200)

It returns structured JSON containing the video title and channel identity, canonical video URL, full caption-track duration and segment count, matching transcript segments, human-readable citation labels, timestamps, directly navigable citation URLs, and pagination metadata. For long videos, use a `query` or time window first; follow `nextOffset` only when more evidence is needed.

### Compare evidence across videos

`research-videos` applies one focused query to 2–5 video URLs concurrently. It returns the same structured, timestamp-linked evidence for each source while capping results per video. This is useful for comparing interviews, checking whether multiple sources support a claim, or researching a topic across a short watchlist.

```json
{
  "videos": [
    "https://youtu.be/VIDEO_ONE",
    "https://youtu.be/VIDEO_TWO"
  ],
  "query": "evaluation",
  "maxSegmentsPerVideo": 10
}
```

See [YouTube Research Recipes](docs/recipes.md) for copy-paste workflows for
fact-checking claims, comparing interviews, navigating long talks, researching
multilingual captions, and building citation-ready notes.

## Capability modes

| Capability | No-key mode | With `YOUTUBE_API_KEY` |
|---|:---:|:---:|
| Transcript research, filtering, key moments, segmentation, summaries | Yes | Yes |
| Video search and comments | No | Yes |
| Video/channel metadata, statistics, trends, and comparisons | No | Yes |

Captions must be available for the requested video. Age-restricted, private, region-restricted, or caption-disabled videos may not return a transcript.

If this project saves you research time, consider
[starring the repository](https://github.com/coyaSONG/youtube-mcp-server) so
other agent builders can discover it.

## Docker

```bash
docker build -t youtube-research-mcp .
docker run --rm -p 3000:3000 youtube-research-mcp

# Full mode
docker run --rm -p 3000:3000 -e YOUTUBE_API_KEY=your_key youtube-research-mcp
```

## Development

```bash
npm run dev             # HTTP server from TypeScript
npm test                # build and run all tests
npm run test:live       # live public-video transcript and citation smoke test
npm run test:user       # clean-room smoke test against the published npm package
npm run test:mcpb       # build, unpack, and exercise the installable MCP bundle
```

Maintainers can follow the [release guide](docs/releasing.md). Published GitHub
releases run the complete npm, MCP Registry, MCPB, and Smithery delivery pipeline.

## API Reference

### Resources

- `youtube://video/{videoId}` - Get detailed information about a specific video
- `youtube://channel/{channelId}` - Get information about a specific channel
- `youtube://transcript/{videoId}` - Get transcript for a specific video
  - Optional query parameter: `?language=LANGUAGE_CODE` (e.g., `en`, `ko`, `ja`)

### Tools

#### Basic Tools
- `research-video` - Get citation-ready transcript evidence from a URL or video ID without an API key
- `research-videos` - Compare timestamp-linked evidence across 2–5 videos without an API key
- `search-videos` - Search for YouTube videos with advanced filtering options
- `get-video-comments` - Get comments for a specific video
- `get-video-transcript` - Get transcript for a specific video with optional language
- `enhanced-transcript` - Advanced transcript extraction with filtering, search, and multi-video capabilities
- `get-key-moments` - Extract key moments with timestamps from a video transcript for easier navigation
- `get-segmented-transcript` - Divide a video transcript into segments for easier analysis

Tools requiring `YOUTUBE_API_KEY` are search, comments, statistics, discovery, and channel analysis. `enhanced-transcript` needs the key only when `includeMetadata` is `true`.

#### Statistical Tools
- `get-video-stats` - Get statistical information for a specific video
- `get-channel-stats` - Get subscriber count, view count, and other channel statistics
- `compare-videos` - Compare statistics across multiple videos

#### Discovery Tools
- `get-trending-videos` - Retrieve trending videos by region and category
- `get-video-categories` - Get available video categories for a specific region

#### Analysis Tools
- `analyze-channel-videos` - Analyze performance trends of videos from a specific channel

### Prompts

- `video-analysis` - Generate an analysis of a YouTube video
- `transcript-summary` - Generate a summary of a video based on its transcript with customizable length and keywords extraction
- `segment-by-segment-analysis` - Provide detailed breakdown of content by analyzing each segment of the video

## Examples

### Accessing a Video Transcript

```
youtube://transcript/dQw4w9WgXcQ
```

### Getting a Transcript in a Specific Language

```
youtube://transcript/dQw4w9WgXcQ?language=en
```

### Using the Statistical Tools

```javascript
// Get video statistics
{
  "type": "tool",
  "name": "get-video-stats",
  "parameters": {
    "videoId": "dQw4w9WgXcQ"
  }
}

// Compare multiple videos
{
  "type": "tool",
  "name": "compare-videos",
  "parameters": {
    "videoIds": ["dQw4w9WgXcQ", "9bZkp7q19f0"]
  }
}
```

### Using the Transcript Summary Prompt

```javascript
{
  "type": "prompt",
  "name": "transcript-summary",
  "parameters": {
    "videoId": "dQw4w9WgXcQ",
    "language": "en"
  }
}
```

### Using the Enhanced Transcript Tool

```javascript
// Basic multi-video transcript extraction
{
  "type": "tool",
  "name": "enhanced-transcript",
  "parameters": {
    "videoIds": ["dQw4w9WgXcQ", "9bZkp7q19f0"],
    "format": "timestamped"
  }
}

// With search and time filtering
{
  "type": "tool",
  "name": "enhanced-transcript",
  "parameters": {
    "videoIds": ["dQw4w9WgXcQ"],
    "filters": {
      "timeRange": {
        "start": 60,  // Start at 60 seconds
        "end": 180    // End at 180 seconds
      },
      "search": {
        "query": "never gonna",
        "contextLines": 2
      }
    },
    "format": "merged"
  }
}

// With duration-based segmentation for easier analysis
{
  "type": "tool",
  "name": "enhanced-transcript",
  "parameters": {
    "videoIds": ["dQw4w9WgXcQ"],
    "filters": {
      "segment": {
        "count": 5,
        "method": "smart"  // Balances caption duration across segments
      }
    },
    "format": "timestamped",
    "language": "en"
  }
}
```

### Using the Enhanced Transcript Analysis Features

```javascript
// Get key moments from a video
{
  "type": "tool",
  "name": "get-key-moments",
  "parameters": {
    "videoId": "dQw4w9WgXcQ",
    "maxMoments": 5
  }
}

// Get a segmented transcript
{
  "type": "tool",
  "name": "get-segmented-transcript",
  "parameters": {
    "videoId": "dQw4w9WgXcQ",
    "segmentCount": 4
  }
}

// Get a segment-by-segment analysis
{
  "type": "prompt",
  "name": "segment-by-segment-analysis",
  "parameters": {
    "videoId": "dQw4w9WgXcQ",
    "segmentCount": 4
  }
}

// Get customized transcript summary
{
  "type": "prompt",
  "name": "transcript-summary",
  "parameters": {
    "videoId": "dQw4w9WgXcQ",
    "language": "en",
    "summaryLength": "detailed",
    "includeKeywords": true
  }
}
```

## Error Handling

The server handles various error conditions, including:

- Invalid or missing API key for Data API tools
- Video or channel not found
- Transcript not available
- Network issues

## License

MIT

## Acknowledgements

- [Model Context Protocol TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [YouTube Data API](https://developers.google.com/youtube/v3)
- [YouTube.js](https://github.com/LuanRT/YouTube.js)
