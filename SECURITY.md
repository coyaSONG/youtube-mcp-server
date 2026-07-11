# Security Policy

## Supported versions

Security fixes are provided for the latest release on the default branch.

## Reporting a vulnerability

Please use GitHub's **Report a vulnerability** private security advisory flow for this repository. Do not open a public issue with exploit details, credentials, or a proof of concept.

Include the affected version, deployment mode, reproduction steps, impact, and any suggested mitigation. You should receive an initial acknowledgement within seven days.

## Deployment guidance

- Set `MCP_BEARER_TOKEN` for any internet-facing MCP endpoint.
- Restrict `CORS_ORIGIN` to known browser clients.
- Keep `MAX_SESSIONS` bounded and use the default idle-session cleanup.
- Treat `YOUTUBE_API_KEY` as a secret and rotate it if exposed.
