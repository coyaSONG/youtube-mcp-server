# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
