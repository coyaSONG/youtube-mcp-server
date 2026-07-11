import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const packageSpec = process.env.VIRTUAL_USER_PACKAGE
  ?? '@coyasong/youtube-mcp-server@latest';
const video = process.env.LIVE_TEST_VIDEO
  ?? 'https://www.youtube.com/watch?v=0Uu_VJeVVfo';
const query = process.env.LIVE_TEST_QUERY ?? 'AI';
const sandbox = await mkdtemp(join(tmpdir(), 'youtube-research-user-'));
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', packageSpec],
  env: {
    ...process.env,
    HOME: join(sandbox, 'home'),
    npm_config_cache: join(sandbox, 'npm-cache'),
  },
  stderr: 'pipe',
});
const client = new Client({ name: 'virtual-user-smoke', version: '1.0.0' });

try {
  await client.connect(transport);

  const { tools } = await client.listTools();
  assert.equal(tools.length, 14);
  assert.ok(tools.some(({ name }) => name === 'research-video'));
  assert.ok(tools.some(({ name }) => name === 'research-videos'));

  const research = await client.callTool({
    name: 'research-video',
    arguments: { video, query, contextLines: 1, maxSegments: 3 },
  });
  assert.equal(research.isError, undefined);
  assert.ok(research.structuredContent.returnedSegments > 0);
  assert.ok(research.structuredContent.returnedSegments <= 3);
  assert.match(
    research.structuredContent.citations[0].sourceUrl,
    /youtube\.com\/watch\?v=.*[?&]t=\d+s$/,
  );

  const comparison = await client.callTool({
    name: 'research-videos',
    arguments: {
      videos: [video, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
      query: 'the',
      contextLines: 0,
      maxSegmentsPerVideo: 1,
    },
  });
  assert.equal(comparison.isError, undefined);
  assert.equal(comparison.structuredContent.results.length, 2);

  const apiOnly = await client.callTool({
    name: 'search-videos',
    arguments: { query: 'agent engineering', maxResults: 1 },
  });
  assert.equal(apiOnly.isError, true);
  assert.match(apiOnly.content[0].text, /YOUTUBE_API_KEY/);

  const invalidInput = await client.callTool({
    name: 'research-video',
    arguments: { video: 'https://example.com/not-youtube' },
  });
  assert.equal(invalidInput.isError, true);
  assert.match(invalidInput.content[0].text, /valid YouTube video ID/);

  console.log(JSON.stringify({
    status: 'ok',
    package: packageSpec,
    toolsDiscovered: tools.length,
    researchedVideo: research.structuredContent.videoId,
    citationsReturned: research.structuredContent.returnedSegments,
    firstCitation: research.structuredContent.citations[0].sourceUrl,
    comparedVideos: comparison.structuredContent.results.length,
    missingApiKeyGuidance: 'ok',
    invalidInputGuidance: 'ok',
  }, null, 2));
} finally {
  await client.close().catch(() => {});
  await rm(sandbox, { recursive: true, force: true });
}
