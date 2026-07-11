# Repository Guidelines

## Project Structure & Module Organization
- `src/index.ts`: MCP resource and tool registration shared by transports.
- `src/stdio-server.ts`: local stdio transport used by the npm executable.
- `src/http-server.ts`: Streamable HTTP `/mcp` transport and health endpoint.
- `src/youtube-service.ts`: `YouTubeService` wrapper for YouTube Data API calls, transcript retrieval, and caching.
- `src/types/youtube-types.ts`: shared TypeScript interfaces and error types.
- `src/types.d.ts`: external module declarations.
- Build output is generated in `dist/` (do not edit manually).

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run build`: compile TypeScript (`src/`) to `dist/`.
- `npm start`: run built server (`dist/http-server.js`) on `PORT` (default `3000`).
- `npm run dev`: run directly from TypeScript with `ts-node` loader.
- `npm test`: compile and run the HTTP server smoke tests.
- `npm run test:live`: exercise the flagship research tool against a public YouTube video.
- `npm run clean`: remove build artifacts.
- Docker flow: `docker build -t youtube-mcp-server .` then `docker run -p 3000:3000 --env-file .env youtube-mcp-server`.

## Coding Style & Naming Conventions
- Language: TypeScript (strict mode, NodeNext modules, ESM imports).
- Use 2-space indentation and semicolons, matching existing files.
- Prefer explicit interfaces/types for tool inputs and API responses.
- Use descriptive camelCase for variables/functions, PascalCase for classes/types, and kebab-case for MCP tool names (for example, `search-videos`).
- Keep imports module-safe for NodeNext (`./file.js` style for local imports).

## Testing Guidelines
- Minimum validation for each change:
  1. `npm test` must succeed.
  2. For protocol changes, verify `/mcp` with MCP Inspector (`npx @modelcontextprotocol/inspector`).
  3. Exercise affected tools/resources with realistic IDs and confirm error handling for invalid inputs.
- Add transport-level tests under `tests/` using Node's built-in test runner.

## Commit & Pull Request Guidelines
- Follow Conventional Commits seen in history: `feat:`, `fix:`, `docs:`, `chore:`; optional scope is encouraged (for example, `feat(transcript): ...`).
- Keep commits focused and logically grouped.
- PRs should include:
  - concise summary of behavior changes,
  - linked issue (if applicable),
  - local verification steps and results,
  - API-impact notes (new/changed MCP tools, resources, prompts, or env vars).

## Security & Configuration Tips
- `YOUTUBE_API_KEY` is optional; it enables search, comments, statistics, and metadata.
- Optional runtime controls: `PORT`, `MCP_BEARER_TOKEN`, `CORS_ORIGIN`, `MAX_SESSIONS`, and `SESSION_IDLE_TIMEOUT_MS`.
- Require `MCP_BEARER_TOKEN` and restrict `CORS_ORIGIN` for internet-facing deployments.
- Never commit `.env` files or API keys; rotate keys immediately if exposed.
