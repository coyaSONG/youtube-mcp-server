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
  } finally {
    await client.close();
  }
});
