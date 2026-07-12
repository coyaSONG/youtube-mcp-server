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
  assert.ok(result.structuredContent.source.title.length > 0);
  assert.match(result.structuredContent.source.videoUrl, /youtube\.com\/watch\?v=/);
  assert.match(result.structuredContent.citations[0].label, /\[\d{2}:\d{2}\]$/);
  assert.match(result.structuredContent.citations[0].sourceUrl, /[?&]t=\d+s$/);

  const fullTranscript = await client.callTool({
    name: 'get-video-transcript',
    arguments: { videoId: video },
  });
  assert.equal(fullTranscript.isError, undefined);
  const fullCharacters = fullTranscript.content[0].text.length;
  const focusedCharacters = result.content[0].text.length;
  const characterReductionPercent = Number(
    ((1 - focusedCharacters / fullCharacters) * 100).toFixed(1),
  );
  assert.ok(characterReductionPercent > 90);

  const moments = await client.callTool({
    name: 'get-key-moments',
    arguments: { videoId: video, maxMoments: 3 },
  });
  assert.equal(moments.isError, undefined);
  assert.match(moments.content[0].text, /youtube\.com\/watch\?v=.*&t=\d+s/);
  assert.doesNotMatch(moments.content[0].text, /# Full Transcript/);

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
  assert.ok(comparison.structuredContent.results.every((item) => item.returnedSegments === 1));

  console.log(JSON.stringify({
    status: 'ok',
    videoId: result.structuredContent.videoId,
    title: result.structuredContent.source.title,
    channel: result.structuredContent.source.channelName,
    matches: result.structuredContent.totalAvailableSegments,
    returned: result.structuredContent.returnedSegments,
    firstCitation: result.structuredContent.citations[0].sourceUrl,
    keyMoments: 3,
    fullTranscriptCharacters: fullCharacters,
    focusedResearchCharacters: focusedCharacters,
    characterReductionPercent,
    comparedVideos: comparison.structuredContent.results.length,
  }, null, 2));
} finally {
  await client.close();
  await server.close();
}
