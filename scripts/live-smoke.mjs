import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import createServer from '../dist/index.js';

const video = process.env.LIVE_TEST_VIDEO ?? 'https://www.youtube.com/watch?v=0Uu_VJeVVfo';
const query = process.env.LIVE_TEST_QUERY ?? 'AI';
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const server = createServer({ config: {} });
const client = new Client({ name: 'live-smoke', version: '1.0.0' });

try {
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const result = await client.callTool({
    name: 'research-video',
    arguments: { video, query, contextLines: 1, maxSegments: 3 },
  });

  assert.equal(result.isError, undefined);
  assert.ok(result.structuredContent);
  assert.ok(result.structuredContent.totalTranscriptSegments > result.structuredContent.returnedSegments);
  assert.ok(result.structuredContent.totalAvailableSegments > 0);
  assert.ok(result.structuredContent.returnedSegments > 0);
  assert.ok(result.structuredContent.returnedSegments <= 3);
  assert.match(result.structuredContent.citations[0].sourceUrl, /[?&]t=\d+s$/);

  const moments = await client.callTool({
    name: 'get-key-moments',
    arguments: { videoId: video, maxMoments: 3 },
  });
  assert.equal(moments.isError, undefined);
  assert.match(moments.content[0].text, /youtube\.com\/watch\?v=.*&t=\d+s/);
  assert.doesNotMatch(moments.content[0].text, /# Full Transcript/);

  console.log(JSON.stringify({
    status: 'ok',
    videoId: result.structuredContent.videoId,
    matches: result.structuredContent.totalAvailableSegments,
    returned: result.structuredContent.returnedSegments,
    firstCitation: result.structuredContent.citations[0].sourceUrl,
    keyMoments: 3,
  }, null, 2));
} finally {
  await client.close();
  await server.close();
}
