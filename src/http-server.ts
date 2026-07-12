#!/usr/bin/env node
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import createServer, { configSchema } from './index.js';

interface SessionContext {
  server: ReturnType<typeof createServer>;
  transport: StreamableHTTPServerTransport;
  lastAccessedAt: number;
}

const portRaw = process.env.PORT ?? '3000';
const port = Number(portRaw);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid PORT value: ${portRaw}`);
  process.exit(1);
}

const youtubeApiKey = process.env.YOUTUBE_API_KEY;
const bearerToken = process.env.MCP_BEARER_TOKEN;
const corsOrigin = process.env.CORS_ORIGIN ?? '*';
const maxSessions = Number(process.env.MAX_SESSIONS ?? '100');
const sessionIdleTimeoutMs = Number(process.env.SESSION_IDLE_TIMEOUT_MS ?? '1800000');

if (!Number.isInteger(maxSessions) || maxSessions < 1) {
  console.error('MAX_SESSIONS must be a positive integer.');
  process.exit(1);
}

if (!Number.isFinite(sessionIdleTimeoutMs) || sessionIdleTimeoutMs < 1000) {
  console.error('SESSION_IDLE_TIMEOUT_MS must be at least 1000.');
  process.exit(1);
}

const app = express();
const sessions = new Map<string, SessionContext>();

app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));
app.use(cors({
  origin: corsOrigin,
  exposedHeaders: ['Mcp-Session-Id']
}));

function tokensMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer);
}

app.use('/mcp', (req, res, next) => {
  if (!bearerToken) {
    next();
    return;
  }

  const authorization = req.get('authorization');
  const providedToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';

  if (!tokensMatch(providedToken, bearerToken)) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32002, message: 'Unauthorized.' },
      id: null,
    });
    return;
  }

  next();
});

function getSessionId(header: string | string[] | undefined): string | undefined {
  if (Array.isArray(header)) {
    return header[0];
  }

  return header;
}

function createServerForSession() {
  return createServer({
    config: configSchema.parse({
      youtubeApiKey,
      port: String(port)
    })
  });
}

app.get('/', (_req, res) => {
  res.status(200).json({
    name: 'YouTube Research MCP',
    version: '1.2.0',
    mcpEndpoint: '/mcp',
    healthEndpoint: '/health',
    documentation: 'https://github.com/coyaSONG/youtube-mcp-server',
  });
});

app.post('/mcp', async (req, res) => {
  const sessionId = getSessionId(req.headers['mcp-session-id']);

  try {
    if (sessionId) {
      const existingSession = sessions.get(sessionId);

      if (!existingSession) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Session not found.'
          },
          id: null
        });
        return;
      }

      existingSession.lastAccessedAt = Date.now();
      await existingSession.transport.handleRequest(req, res, req.body);
      return;
    }

    if (!isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Initialization required before sending non-session requests.'
        },
        id: null
      });
      return;
    }

    if (sessions.size >= maxSessions) {
      res.status(503).json({
        jsonrpc: '2.0',
        error: { code: -32003, message: 'Session capacity reached. Try again later.' },
        id: null,
      });
      return;
    }

    const server = createServerForSession();
    let sessionContext: SessionContext | undefined;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (initializedSessionId: string) => {
        if (sessionContext) {
          sessions.set(initializedSessionId, sessionContext);
        }
      }
    });

    transport.onclose = () => {
      const closedSessionId = transport.sessionId;

      if (closedSessionId) {
        sessions.delete(closedSessionId);
      }

      void server.close();
    };

    sessionContext = { server, transport, lastAccessedAt: Date.now() };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    const initializedSessionId = transport.sessionId;
    if (initializedSessionId && !sessions.has(initializedSessionId)) {
      sessions.set(initializedSessionId, sessionContext);
    }
  } catch (error) {
    console.error('Error handling MCP POST request:', error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error.'
        },
        id: null
      });
    }
  }
});

app.get('/mcp', async (req, res) => {
  const sessionId = getSessionId(req.headers['mcp-session-id']);

  if (!sessionId) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Missing Mcp-Session-Id header.'
      },
      id: null
    });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Session not found.'
      },
      id: null
    });
    return;
  }

  try {
    session.lastAccessedAt = Date.now();
    await session.transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling MCP GET request:', error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error.'
        },
        id: null
      });
    }
  }
});

app.delete('/mcp', async (req, res) => {
  const sessionId = getSessionId(req.headers['mcp-session-id']);

  if (!sessionId) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Missing Mcp-Session-Id header.'
      },
      id: null
    });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Session not found.'
      },
      id: null
    });
    return;
  }

  try {
    session.lastAccessedAt = Date.now();
    await session.transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling MCP DELETE request:', error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error.'
        },
        id: null
      });
    }
  }
});

app.get('/health', (_req, res) => {
  res.set('cache-control', 'no-store');
  res.status(200).json({
    status: 'ok',
    mode: youtubeApiKey ? 'full' : 'transcript-only',
    capabilities: {
      transcriptResearch: true,
      youtubeDataApi: Boolean(youtubeApiKey),
    },
  });
});

const serverInstance = app.listen(port, () => {
  console.log(`YouTube Research MCP listening on port ${port}`);
  if (!youtubeApiKey) {
    console.log('Running in transcript-only mode. Set YOUTUBE_API_KEY to enable search, comments, and statistics.');
  }
});

const sessionCleanupTimer = setInterval(() => {
  const expirationTime = Date.now() - sessionIdleTimeoutMs;
  for (const [sessionId, context] of sessions.entries()) {
    if (context.lastAccessedAt < expirationTime) {
      sessions.delete(sessionId);
      void context.transport.close().finally(() => context.server.close());
    }
  }
}, Math.min(60_000, sessionIdleTimeoutMs));
sessionCleanupTimer.unref();

async function shutdown() {
  clearInterval(sessionCleanupTimer);
  for (const [sessionId, { transport, server }] of sessions.entries()) {
    try {
      await transport.close();
      await server.close();
      sessions.delete(sessionId);
    } catch (error) {
      console.error(`Failed to close session ${sessionId}:`, error);
    }
  }

  serverInstance.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});
