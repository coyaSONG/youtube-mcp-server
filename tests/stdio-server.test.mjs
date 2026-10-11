import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('stdio entry point serves the flagship research tool', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/stdio-server.js'],
    stderr: 'pipe',
  });
  const client = new Client({ name: 'stdio-test-client', version: '1.0.0' });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const researchTool = tools.find((tool) => tool.name === 'research-video');
    assert.ok(researchTool);
    assert.equal(researchTool.annotations.readOnlyHint, true);
    assert.ok(researchTool.outputSchema.properties.source);
    assert.ok(researchTool.outputSchema.properties.citations.items.properties.label);

    const commentsTool = tools.find((tool) => tool.name === 'get-video-comments');
    assert.ok(commentsTool);
    assert.equal(commentsTool.annotations.readOnlyHint, true);
    assert.ok(commentsTool.inputSchema.properties.completeReplies);
    assert.ok(commentsTool.inputSchema.properties.maxRepliesPerThread);
    assert.ok(commentsTool.inputSchema.properties.searchTerms);

    const searchTool = tools.find((tool) => tool.name === 'search-videos');
    assert.ok(searchTool);
    assert.equal(searchTool.annotations.readOnlyHint, true);
    assert.ok(searchTool.inputSchema.properties.pageToken);

    const allServerReadTools = [
      'search-videos',
      'get-video-comments',
      'research-video',
      'research-videos',
      'get-video-transcript',
      'get-video-stats',
      'get-channel-stats',
      'compare-videos',
      'get-trending-videos',
      'get-video-categories',
      'analyze-channel-videos',
      'get-key-moments',
      'get-segmented-transcript',
      'enhanced-transcript',
    ];
    for (const toolName of allServerReadTools) {
      const tool = tools.find((candidate) => candidate.name === toolName);
      assert.ok(tool, `missing expected research tool ${toolName}`);
      assert.equal(tool.annotations.readOnlyHint, true, `${toolName} must be read-only`);
    }

    const noKeyComments = await client.callTool({
      name: 'get-video-comments',
      arguments: { videoId: 'video-without-key' },
    });
    assert.equal(noKeyComments.isError, true);
    assert.match(noKeyComments.content[0].text, /API key/i);
  } finally {
    await client.close();
  }
});
