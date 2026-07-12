# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Reproducible MCPB packaging with a clean-room bundle smoke test.
- One-click GitHub release bundle for Claude Desktop and other MCPB clients.
- Static MCPB capability metadata for all 14 tools so registries can index the
  server without executing it first.

## [1.1.1] - 2026-07-11

### Fixed

- Match the official MCP Registry namespace to the case-sensitive GitHub account name.

## [1.1.0] - 2026-07-11

### Added

- Citation-ready `research-video` tool with URL input, timestamp links, filtering, time ranges, and pagination.
- Cross-video `research-videos` tool for applying one focused query to 2–5 sources concurrently.
- Transcript-only mode that works without a YouTube Data API key.
- Optional bearer authentication, CORS restriction, and bounded idle MCP sessions.
- Health capability reporting, transport tests, CI, and a production container health check.
- Reproducible live smoke benchmark comparing focused research with a full transcript response.
- One-click and command-line installation paths for VS Code.

### Changed

- Replaced the unreliable caption scraper with YouTube.js caption-track retrieval.
- Updated the project positioning and quick start for agent research workflows.
- Fixed enhanced transcript segmentation so equal and playback-time grouping produce real analysis chunks.

### Security

- Remote MCP deployments can require constant-time bearer-token authentication.
