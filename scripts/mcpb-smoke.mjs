import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { unzipSync } from 'fflate';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(
  await readFile(join(projectRoot, 'package.json'), 'utf8'),
);
const artifact = resolve(
  process.argv[2] ?? join(projectRoot, 'artifacts', 'youtube-research-mcp.mcpb'),
);
const sandbox = await mkdtemp(join(tmpdir(), 'youtube-research-mcpb-'));
const unpacked = join(sandbox, 'bundle');


let client;
try {
  let totalSize = 0;
  const files = unzipSync(await readFile(artifact), {
    filter: ({ name, originalSize }) => {
      assert.ok(!name.startsWith('/') && !name.includes('\\') && !name.includes(':')
        && !name.split('/').includes('..'), `Unsafe archive path: ${name}`);
      totalSize += originalSize;
      assert.ok(totalSize <= 512 * 1024 * 1024, 'Bundle exceeds smoke-test extraction budget');
      return true;
    },
  });
  for (const [name, contents] of Object.entries(files)) {
    const destination = join(unpacked, name);
    if (name.endsWith('/')) await mkdir(destination, { recursive: true });
    else {
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, contents);
    }
  }
  const manifest = JSON.parse(
    await readFile(join(unpacked, 'manifest.json'), 'utf8'),
  );
  assert.equal(manifest.version, packageJson.version);

  const entryPoint = join(unpacked, manifest.server.entry_point);
  const transport = new StdioClientTransport({
    command: 'node',
    args: [entryPoint],
    env: {
      ...process.env,
      HOME: join(sandbox, 'home'),
      YOUTUBE_API_KEY: '',
    },
    stderr: 'pipe',
  });
  client = new Client({ name: 'mcpb-smoke', version: '1.0.0' });
  await client.connect(transport);

  const { tools } = await client.listTools();
  assert.equal(tools.length, 14);
  const researchTool = tools.find(({ name }) => name === 'research-video');
  assert.ok(researchTool);
  assert.ok(researchTool.outputSchema.properties.source);
  assert.ok(researchTool.outputSchema.properties.citations.items.properties.label);
  assert.ok(tools.some(({ name }) => name === 'research-videos'));

  const invalidInput = await client.callTool({
    name: 'research-video',
    arguments: { video: 'https://example.com/not-youtube' },
  });
  assert.equal(invalidInput.isError, true);
  assert.match(invalidInput.content[0].text, /valid YouTube video ID/);

  const apiOnly = await client.callTool({
    name: 'search-videos',
    arguments: { query: 'agent engineering', maxResults: 1 },
  });
  assert.equal(apiOnly.isError, true);
  assert.match(apiOnly.content[0].text, /YOUTUBE_API_KEY/);

  console.log(JSON.stringify({
    status: 'ok',
    artifact,
    version: manifest.version,
    toolsDiscovered: tools.length,
    missingApiKeyGuidance: 'ok',
    invalidInputGuidance: 'ok',
  }, null, 2));
} finally {
  await client?.close().catch(() => {});
  await rm(sandbox, { recursive: true, force: true });
}
