import assert from 'node:assert/strict';
import { once } from 'node:events';
import net from 'node:net';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function reservePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.equal(typeof address, 'object');
  const port = address.port;
  server.close();
  await once(server, 'close');
  return port;
}

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return response;
    } catch {
      // The child process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('HTTP server did not become healthy');
}

test('HTTP server exposes health and validates MCP sessions', async (t) => {
  const port = await reservePort();
  const env = {
    ...process.env,
    PORT: String(port),
    YOUTUBE_API_KEY: 'test-key',
    MCP_BEARER_TOKEN: 'test-token',
  };
  delete env.CORS_ORIGIN;
  const child = spawn(process.execPath, ['dist/http-server.js'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const healthResponse = await waitForHealth(baseUrl);
  const rootResponse = await fetch(baseUrl);
  assert.equal(rootResponse.status, 200);
  assert.equal(rootResponse.headers.get('x-powered-by'), null);
  assert.equal((await rootResponse.json()).mcpEndpoint, '/mcp');

  const crossOriginResponse = await fetch(baseUrl, {
    headers: { origin: 'https://untrusted.example' },
  });
  assert.equal(crossOriginResponse.headers.get('access-control-allow-origin'), null);

  assert.deepEqual(await healthResponse.json(), {
    status: 'ok',
    mode: 'full',
    capabilities: {
      transcriptResearch: true,
      youtubeDataApi: true,
    },
  });

  const unauthorizedResponse = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert.equal(unauthorizedResponse.status, 401);

  const mcpClient = new Client({ name: 'http-test-client', version: '1.0.0' });
  const mcpTransport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: {
      headers: { authorization: 'Bearer test-token' },
    },
  });
  await mcpClient.connect(mcpTransport);
  const { tools } = await mcpClient.listTools();
  const researchTool = tools.find((tool) => tool.name === 'research-video');
  assert.ok(researchTool);
  assert.ok(tools.every((tool) => tool.annotations?.readOnlyHint === true));
  assert.equal(researchTool.title, 'Research a YouTube video');
  assert.equal(researchTool.annotations.readOnlyHint, true);
  assert.equal(researchTool.annotations.destructiveHint, false);
  assert.equal(researchTool.outputSchema.type, 'object');
  await mcpClient.close();

  const uninitializedResponse = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert.equal(uninitializedResponse.status, 400);

  const missingSessionResponse = await fetch(`${baseUrl}/mcp`, {
    method: 'DELETE',
    headers: {
      authorization: 'Bearer test-token',
      'mcp-session-id': 'missing',
    },
  });
  assert.equal(missingSessionResponse.status, 404);
});

test('HTTP server only emits CORS headers for configured exact origins', async (t) => {
  const port = await reservePort();
  const child = spawn(process.execPath, ['dist/http-server.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      CORS_ORIGIN: 'https://client.example, http://localhost:5173',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl);

  const allowedResponse = await fetch(baseUrl, {
    headers: { origin: 'https://client.example' },
  });
  assert.equal(
    allowedResponse.headers.get('access-control-allow-origin'),
    'https://client.example'
  );

  const deniedResponse = await fetch(baseUrl, {
    headers: { origin: 'https://untrusted.example' },
  });
  assert.equal(deniedResponse.headers.get('access-control-allow-origin'), null);
});

test('HTTP server starts in transcript-only mode without an API key', async (t) => {
  const port = await reservePort();
  const env = { ...process.env, PORT: String(port) };
  delete env.YOUTUBE_API_KEY;

  const child = spawn(process.execPath, ['dist/http-server.js'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  });

  const response = await waitForHealth(`http://127.0.0.1:${port}`);
  assert.deepEqual(await response.json(), {
    status: 'ok',
    mode: 'transcript-only',
    capabilities: {
      transcriptResearch: true,
      youtubeDataApi: false,
    },
  });
});
