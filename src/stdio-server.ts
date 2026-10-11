#!/usr/bin/env node
import { config as loadEnvironment } from 'dotenv';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import createServer, { configSchema } from './index.js';

loadEnvironment({ quiet: true });

const server = createServer({
  config: configSchema.parse({
    youtubeApiKey: process.env.YOUTUBE_API_KEY,
  }),
});
const transport = new StdioServerTransport();

await server.connect(transport);

async function shutdown(): Promise<void> {
  await server.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});
