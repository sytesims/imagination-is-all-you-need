#!/usr/bin/env node
/**
 * Imagination Is All You Need MCP server. Wraps the local HTTP API (OPENHIGGSFIELD_API, default http://localhost:8787).
 *   stdio (default):        openhiggsfield-mcp
 *   Streamable HTTP:        openhiggsfield-mcp --http [--port 8788]   → POST/GET/DELETE http://127.0.0.1:8788/mcp
 *   Agent setup:            openhiggsfield-mcp setup claude|chatgpt|all   (see agent-skills/README.md)
 *   Canvas channel (stdio): openhiggsfield-mcp --channel   (or OPENHIGGSFIELD_CANVAS_CHANNEL=1): what you type in the Canvas dock is pushed into the
 *                           Claude Code session (claude --dangerously-load-development-channels server:<name>; docs/MCP.md "Canvas + Claude Code")
 */
import { createServer as httpServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { API, WEB, disableSharedBudget, clientScope, setProcessClient } from './api.js';
import { loadTools } from './catalog.js';
import { staleWarning } from './freshness.js';
import { randomUUID } from 'node:crypto';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { sessionStarted, sessionSeen, sessionEnded, streamOpened, streamClosed, onForget } from './sessions.js';
import { startChannel } from './channel.js';
import { refuseReason } from './localOnly.js';

/** HTTP sessions by id: each has its own server + transport for as long as the client stays (sessions.ts says who is live). */
const httpSessions = new Map<string, { transport: StreamableHTTPServerTransport; server: ReturnType<typeof createServer>; client: string }>();
onForget((id) => { const s = httpSessions.get(id); httpSessions.delete(id); void s?.transport.close(); void s?.server.close(); });

/** run_tool's tool_id list comes from the live catalog: read it before building a server (cached 30 s; the generated snapshot when the API is down). */
const warmCatalog = () => Promise.race([loadTools().catch(() => null), new Promise((r) => setTimeout(r, 3000))]);

/** name + version for GET /health (read once from package.json next to dist/ and src/). */
const PKG: { name: string; version: string } = (() => { try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')); } catch { return { name: 'openhiggsfield-mcp', version: 'unknown' }; } })();
const args = process.argv.slice(2);
/** Channel mode: stdio only (Claude Code spawns channel servers as subprocesses). */
const channelMode = args.includes('--channel') || /^(1|true|yes)$/i.test(process.env.OPENHIGGSFIELD_CANVAS_CHANNEL ?? '');
if (args[0] === 'setup') {
  const { runSetup } = await import('./setup.js');
  await runSetup(args.slice(1));
} else if (args.includes('--http') || process.env.MCP_TRANSPORT === 'http') {
  const port = Number(args[args.indexOf('--port') + 1]) || Number(process.env.MCP_PORT) || 8788;
  const host = process.env.MCP_HOST || '127.0.0.1'; // local only by default (private project)
  disableSharedBudget(); // many clients, one process: budgets are handles (budget_id) per call
  if (channelMode) console.error('[openhiggsfield-mcp] --channel is ignored over HTTP: Claude Code channels are stdio servers. Run the stdio server with --channel (docs/MCP.md "Canvas + Claude Code").');
  httpServer(async (req, res) => {
    // DP #20.6: GET /health for the server's self-host check and the web Self-host page. CORS on this read-only route only (no data, no tools).
    if (req.url === '/health' || req.url?.startsWith('/health?')) {
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-max-age': '600' };
      if (req.method === 'OPTIONS') { res.writeHead(204, cors).end(); return; }
      if (req.method !== 'GET') { res.writeHead(405, { ...cors, allow: 'GET, OPTIONS' }).end(); return; }
      res.writeHead(200, { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ ok: true, name: PKG.name, version: PKG.version, transport: 'http', endpoint: '/mcp' })); return;
    }
    if (!req.url?.startsWith('/mcp')) { res.writeHead(404).end('MCP endpoint is /mcp'); return; }
    const refused = refuseReason(req.headers); // security: Host / Origin check (localOnly.ts, MCP spec: validate Origin)
    if (refused) { res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: refused }, id: null })); return; }
    // Sessions (2026-10-28): initialize starts a session (its own server + transport, kept by id) so the app knows who is connected from the
    // first moment (sessions.ts). Requests without a session we know (older clients, or ones from before this process started) are served
    // the old stateless way: a fresh server + transport per request.
    const sid = String(req.headers['mcp-session-id'] ?? '').trim();
    const known = sid ? httpSessions.get(sid) : undefined;
    try {
      let body: unknown;
      if (req.method === 'POST') { const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined; }
      if (known) {
        sessionSeen(sid);
        if (req.method === 'GET') { streamOpened(sid); res.on('close', () => streamClosed(sid)); }
        await clientScope.run(known.client, () => known.transport.handleRequest(req, res, body)); /* API calls made for it carry its name */
        return;
      }
      await warmCatalog();
      const init = req.method === 'POST' && (Array.isArray(body) ? body : [body]).find((m) => isInitializeRequest(m));
      if (init) {
        const server = createServer({ http: true });
        const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), enableJsonResponse: true,
          onsessioninitialized: (id) => { const info = (init as any).params?.clientInfo; httpSessions.set(id, { transport, server, client: String(info?.name ?? '').trim().slice(0, 60) }); sessionStarted(id, info, 'http'); },
          onsessionclosed: (id) => { httpSessions.delete(id); sessionEnded(id); } });
        transport.onclose = () => { const id = transport.sessionId; if (id && httpSessions.has(id)) { httpSessions.delete(id); sessionEnded(id); } };
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
        return;
      }
      if (sid && req.method === 'DELETE') { res.writeHead(200).end(); return; } // a session from before a restart: nothing to end
      if (sid && req.method === 'GET') { res.writeHead(405, { allow: 'POST' }).end(); return; } // no event stream for a session from before a restart (clients treat 405 as "none offered")
      const server = createServer({ http: true });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: String(e) }, id: null }));
    }
  }).listen(port, host, () => console.error(`[openhiggsfield-mcp] Streamable HTTP on http://${host}:${port}/mcp → API ${API}, links → ${WEB}`));
} else {
  await warmCatalog();
  const server = createServer({ channel: channelMode });
  let stopChannel: (() => Promise<void>) | null = null;
  /* the app shows this client as connected from initialize until this process exits (sessions.ts) */
  server.server.oninitialized = () => { const info = server.server.getClientVersion() ?? null; setProcessClient(info?.name ?? null); sessionStarted(`stdio-${process.pid}`, info, 'stdio');
    /* channel mode: start pushing canvas messages once the client is ready to hear them */
    if (channelMode && !stopChannel) stopChannel = startChannel((n) => server.server.notification(n as any)); };
  /* the client went away (stdin closed): in channel mode the poll would keep this process alive, so stop it and leave */
  if (channelMode) { const leave = () => { void (stopChannel?.() ?? Promise.resolve()).finally(() => process.exit(0)); }; server.server.onclose = leave; process.stdin.once('end', leave); }
  await server.connect(new StdioServerTransport());
  console.error(`[openhiggsfield-mcp] stdio ready → API ${API}`);
  // Built copy older than src (dist is git-ignored): say so on stderr (stdout is the protocol).
  if (import.meta.url.includes('/dist/')) { const w = staleWarning(); if (w) console.error(`[openhiggsfield-mcp] WARNING: ${w}`); }
}
