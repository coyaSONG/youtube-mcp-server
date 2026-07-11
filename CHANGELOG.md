# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Citation-ready `research-video` tool with URL input, timestamp links, filtering, time ranges, and pagination.
- Transcript-only mode that works without a YouTube Data API key.
- Optional bearer authentication, CORS restriction, and bounded idle MCP sessions.
- Health capability reporting, transport tests, CI, and a production container health check.

### Changed

- Replaced the unreliable caption scraper with YouTube.js caption-track retrieval.
- Updated the project positioning and quick start for agent research workflows.

### Security

- Remote MCP deployments can require constant-time bearer-token authentication.
