# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build and Run Commands
- **Build**: `npm run build` - Compiles TypeScript to JavaScript in the `dist/` directory
- **Start**: `npm start` - Runs the HTTP MCP server from `dist/index.js` on port 3000
- **Development**: `npm run dev` - Runs the server in development mode with live TypeScript compilation
- **Clean**: `npm run clean` - Removes the `dist/` directory

### HTTP Transport Migration
- **Migration Status**: Successfully migrated from STDIO to Streamable HTTP transport (required by Smithery)
- **Endpoint**: Server accepts MCP requests at `/mcp` endpoint
- **Port**: Listens on port 3000 (or PORT environment variable)
- **Session Management**: Supports stateful operations with session ID tracking

### Docker Commands
- **Build image**: `docker build -t youtube-mcp-server .`
- **Run container**: `docker run -p 3000:3000 --env-file .env youtube-mcp-server`

### Testing
- **No test suite configured** - Consider adding Jest or similar testing framework for development

## Code Architecture

### Core Components

**Entry Point** (`src/index.ts`):
- Main MCP server initialization using `@modelcontextprotocol/sdk`
- Registers 3 resource types and 8 tools
- Uses stdio transport for MCP communication
- Handles all route definitions and tool registrations

**Service Layer** (`src/youtube-service.ts`):
- `YouTubeService` class wraps Google APIs client
- Implements caching for transcripts (1-hour TTL)
- Handles all YouTube API interactions and error handling
- Provides advanced transcript processing capabilities

**Type Definitions**:
- `src/types.d.ts` - External module type declarations for `youtube-captions-scraper`
- `src/types/youtube-types.ts` - Internal TypeScript interfaces and classes

### MCP Server Architecture

**Resources** (3 types):
- `youtube://video/{videoId}` - Video details and metadata
- `youtube://channel/{channelId}` - Channel information and statistics
- `youtube://transcript/{videoId}[?language=CODE]` - Video transcripts with optional language

**Tools** (8 available):
- `search-videos` - Advanced video search with multiple filters
- `get-video-comments` - Comment retrieval with sorting and pagination
- `get-video-transcript` - Basic transcript extraction
- `enhanced-transcript` - Advanced transcript processing with filtering/segmentation
- `get-video-stats` / `get-channel-stats` - Statistical data extraction
- `compare-videos` - Multi-video comparison analysis
- `get-trending-videos` - Regional trending content discovery
- `get-video-categories` - Available categories by region
- `analyze-channel-videos` - Channel performance analysis
- `get-key-moments` - Extract important moments from transcripts
- `get-segmented-transcript` - Divide transcripts into analyzable segments

**Prompts** (3 available):
- `video-analysis` - Generate video content analysis
- `transcript-summary` - Customizable transcript summarization
- `segment-by-segment-analysis` - Detailed segment-wise content breakdown

### Dependencies and External Services

**Core Dependencies**:
- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `googleapis` - YouTube Data API v3 client
- `youtube-captions-scraper` - Third-party transcript extraction
- `node-cache` - In-memory caching for API responses
- `zod` - Runtime schema validation

**Environment Requirements**:
- `YOUTUBE_API_KEY` - Required YouTube Data API v3 key
- `PORT` - Optional port configuration (default from environment)

### TypeScript Configuration
- Target: ES2020 with NodeNext module resolution
- Strict mode enabled with source maps and declarations
- Output directory: `dist/`

### Development Patterns
- Uses TypeScript strict mode with explicit typing
- Implements early returns for better readability
- Follows functional programming patterns with const arrow functions
- Event handlers use "handle" prefix naming convention
- Comprehensive error handling for async operations
- Environment variables for sensitive data management