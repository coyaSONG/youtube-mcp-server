# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Search page-token continuation and filtered, bounded comment reply retrieval with completeness metadata.
- Manual, automatic and translated caption provenance in research results.

### Fixed

- Keep HTTP service healthy after a client terminates its MCP session; cover actual DELETE termination.
- Bound reply collection to 100 per thread by default (explicit maximum 1000), 1000 replies and 20 reply requests per call, and 1 MiB of reply JSON.
- Deduplicate reply IDs and stop non-progressing pagination without claiming complete coverage, including unknown reply counts.
- Apply current MCP SDK, fast-uri and proxy-addr security patches.

### Changed

- Require Node.js 22 or newer for the updated Google API client; align CI and MCPB compatibility.
- Update reviewed runtime dependencies and GitHub Actions; initialize dotenv explicitly and quietly.
- Replace the unavailable Smithery badge with a LightNow capability badge.
- Build unsigned MCPB ZIP archives with pinned official schema validation; remove the CLI dependency on unpatched node-forge.

## [1.2.0] - 2026-07-12

### Added

- Reproducible MCPB packaging with a clean-room bundle smoke test.
- One-click GitHub release bundle for Claude Desktop and other MCPB clients.
- Video title, channel identity, thumbnail, and human-readable labels in
  citation-ready research results without requiring an API key.

### Changed

- Cache transcript segments and source identity together so focused research
  needs only one YouTube information request.

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
