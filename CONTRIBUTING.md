# Contributing

Thanks for helping make YouTube Research MCP more useful and reliable.

## Development setup

Requirements: Node.js 20 or newer.

```bash
npm install
npm test
```

Transcript tools work without credentials. Set `YOUTUBE_API_KEY` only when developing search, comments, statistics, or metadata features.

## Pull requests

- Open an issue first for large behavior or protocol changes.
- Keep changes focused and use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`).
- Add tests for new behavior and regressions.
- Run `npm test` and describe any live-video checks in the PR.
- Never commit API keys, bearer tokens, `.env` files, or transcript fixtures copied from private videos.

By contributing, you agree that your contribution is licensed under the MIT License.
