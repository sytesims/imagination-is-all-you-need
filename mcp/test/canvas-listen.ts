/**
 * Canvas + Claude Code (2026-10-28): the dock can tell "connected" from "listening", your messages show waiting → read, the listen prompt and the
 * server instructions teach "listen to my canvas", and channel mode pushes what you type into the session as notifications/claude/channel.
 * Needs a MOCK app: OPENHIGGSFIELD_API=<mock API> and OPENHIGGSFIELD_MCP_URL=<its HTTP MCP, toolsets incl. canvas> (refuses a non-mock API).
 * Spawns its own stdio MCP for the channel part. Run: OPENHIGGSFIELD_API=http://localhost:8768 OPENHIGGSFIELD_MCP_URL=http://127.0.0.1:8791/mcp npx tsx test/canvas-listen.ts
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { channelEvent } from '../src/channel.js';

const MCP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = (process.env.OPENHIGGSFIELD_API || '').replace(/\/$/, ''); const URL_ = process.env.OPENHIGGSFIELD_MCP_URL || '';
if (!API || !URL_) { console.error('Set OPENHIGGSFIELD_API and OPENHIGGSFIELD_MCP_URL (a mock app).'); process.exit(2); }
const ok = (m: string) => console.log('ok ' + m);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const j = async (p: string, init?: RequestInit) => { const r = await fetch(API + p, init); return r.json() as Promise<any>; };
const post = (p: string, body: unknown) => j(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const textOf = (r: any) => JSON.parse(r.content?.[0]?.text ?? '{}');

const health = await j('/api/health'); assert.equal(health.backend, 'mock', 'refusing to run against a non-mock app');
const board = await post('/api/canvas/boards', { name: 'Listen test' }); const base = `/api/canvas/boards/${board.id}/agent`;
const state = async () => (await j(`${base}/state`)).agent;
const feed = async () => (await j(`${base}/feed?since=0`)).items as any[];

// ---- pure: one channel event per message, identifier-only meta keys ----
const ev = channelEvent({ boardId: 'brd_1', boardName: 'Launch' }, { seq: 4, at: 1, type: 'message', text: 'hello', selection: [{ id: 'shape:a', name: 'Hero' }] });
assert.match(ev.content, /^hello\n\n\(Selected on the board: Hero \(shape:a\)\)$/); assert.equal(ev.meta.board_id, 'brd_1'); assert.equal(ev.meta.board_name, 'Launch');
for (const k of Object.keys(ev.meta)) assert.match(k, /^[A-Za-z0-9_]+$/, `meta key ${k} must be an identifier`);
ok('channelEvent: the user\'s words as content, board_id / board_name / seq as tag attributes');

// ---- connected, not listening ----
const http = new Client({ name: 'claude-code', version: 'test' });
await http.connect(new StreamableHTTPClientTransport(new URL(URL_)));
await sleep(600);
let a = await state(); assert.equal(a.connected, true, 'a connected client shows as connected'); assert.equal(a.listening, false, 'but nobody reads this board yet');
assert.match(http.getInstructions() ?? '', /listen to my canvas/, 'the server instructions teach the phrase');
const prompts = (await http.listPrompts()).prompts.map((p) => p.name); assert.ok(prompts.includes('listen'), 'the listen prompt is offered');
const pr = await http.getPrompt({ name: 'listen', arguments: { board: board.id } }); const prText = (pr.messages[0].content as any).text as string;
for (const t of ['canvas_wait_for_message', 'canvas_say', board.id]) assert.ok(prText.includes(t), `the listen prompt names ${t}`);
ok('connected, not listening; instructions and /imagination:listen <board> teach the loop');

// ---- a hello typed before it listens: waiting, then read by the first wait ----
const hello = (await post(`${base}/messages`, { text: 'hello' })).message;
assert.equal((await feed()).find((e) => e.seq === hello.seq).readAt, undefined, 'waiting for it to read');
const w = textOf(await http.callTool({ name: 'canvas_wait_for_message', arguments: { board_id: board.id, timeout_sec: 1 } }));
assert.deepEqual(w.messages.map((m: any) => m.text), ['hello'], 'the first wait returns the hello typed before');
assert.equal((await feed()).find((e) => e.seq === hello.seq).readVia, 'wait');
a = await state(); assert.equal(a.listening, true); assert.equal(a.listenVia, 'wait');
await http.callTool({ name: 'canvas_say', arguments: { board_id: board.id, text: 'Hi! What should we make?' } });
ok('waiting → read (by the wait) → listening; the reply clears it');
await http.close();

// ---- channel mode: a stdio MCP with --channel declares claude/channel and pushes the next message ----
const got: any[] = [];
const ch = new Client({ name: 'claude-code', version: 'test' });
ch.fallbackNotificationHandler = async (n) => { got.push(n); };
await ch.connect(new StdioClientTransport({ command: 'npx', args: ['tsx', 'src/index.ts', '--channel'], cwd: MCP, env: { ...process.env, OPENHIGGSFIELD_API: API } as Record<string, string>, stderr: 'ignore' }));
assert.deepEqual((ch.getServerCapabilities() as any)?.experimental?.['claude/channel'], {}, 'channel mode declares the claude/channel capability');
assert.ok((await ch.listTools()).tools.some((t) => t.name === 'canvas_say'), 'channel mode turns the canvas tools on');
/* a second board: the first one is still the HTTP agent's (its wait counts for ~70 s), so the channel leaves it alone */
const b2 = await post('/api/canvas/boards', { name: 'Listen test 2' }); const base2 = `/api/canvas/boards/${b2.id}/agent`; await sleep(500);
a = (await j(`${base2}/state`)).agent; assert.equal(a.listening, true, 'a channel session counts as listening'); assert.equal(a.listenVia, 'channel');
const push = (await post(`${base2}/messages`, { text: 'make me a poster' })).message;
for (let i = 0; i < 40 && !got.length; i++) await sleep(150);
const n = got.find((x) => x.method === 'notifications/claude/channel'); assert.ok(n, 'the message arrived as a channel notification');
assert.equal(n.params.content, 'make me a poster'); assert.equal(n.params.meta.board_id, b2.id);
const feed2 = async () => (await j(`${base2}/feed?since=0`)).items as any[];
assert.ok((await feed2()).find((e) => e.seq === push.seq).pushedAt > 0, 'the dock says "Sent"');
await ch.callTool({ name: 'canvas_say', arguments: { board_id: b2.id, text: 'On it.' } });
assert.equal((await feed2()).find((e) => e.seq === push.seq).readVia, 'channel', 'its reply turns it into "Read"');
ok('channel mode: claude/channel capability, the message pushed as notifications/claude/channel, sent → read on the reply');
await ch.close(); await sleep(1500);
assert.equal((await j(`${base2}/state`)).agent.channel, false, 'the channel session leaves when its client does');
ok('channel session ends with the client');
console.log('canvas-listen: all ok');
process.exit(0);
