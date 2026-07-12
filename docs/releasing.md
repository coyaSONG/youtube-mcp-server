# Releasing

Releases are designed to run unattended after their one-time trust setup. The
`Release` GitHub Actions workflow validates the tag and package versions, runs
the package and MCPB smoke tests, and then delivers the release to:

1. npm through OpenID Connect (OIDC) trusted publishing
2. the official MCP Registry through GitHub OIDC
3. the GitHub release as an installable MCPB asset
4. Smithery when the `SMITHERY_API_KEY` repository secret is available

The workflow checks npm and the MCP Registry before publishing, so rerunning a
partially completed release does not attempt to overwrite an existing version.
GitHub concurrency also prevents two jobs for the same tag from publishing at
the same time.

## One-time setup

Configure `@coyasong/youtube-mcp-server` on npm with this trusted publisher:

| Setting | Value |
|---|---|
| Provider | GitHub Actions |
| Organization or user | `coyaSONG` |
| Repository | `youtube-mcp-server` |
| Workflow filename | `release-mcpb.yml` |
| Environment | `release` |
| Allowed action | `npm publish` |

The workflow uses a GitHub-hosted runner and grants only `contents: write` and
`id-token: write`. No npm token is stored in GitHub. After one successful OIDC
release, npm's publishing access should be set to require 2FA and disallow
traditional tokens.

Add a Smithery API key with server write access as the `SMITHERY_API_KEY`
repository secret. This is the only long-lived release credential; npm and the
official MCP Registry use short-lived OIDC credentials.

## Publish a version

1. Update the version in `package.json`, `package-lock.json`, `server.json`, and
   `mcpb/manifest.json`, plus runtime version strings and `CHANGELOG.md`.
2. Merge the version PR only after CI succeeds.
3. Create a GitHub release whose tag is exactly `v` followed by the package
   version, for example `v1.3.0`.
4. Publish the GitHub release.
5. Confirm the `Release` workflow succeeds.

The workflow rejects mismatched tag and package versions before any publish
step. It also supports manual reruns with the existing release tag through
`workflow_dispatch`.

## Recovery

Rerun the same workflow with the same tag. Already-published npm and MCP
Registry versions are skipped, while the GitHub MCPB asset is safely replaced.
If Smithery is temporarily unavailable, rerun after it recovers.
