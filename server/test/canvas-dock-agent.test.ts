// Your own AI as the Canvas dock's brain (2026-10-27): what you type goes to the board's inbox with your selection; canvas_wait_for_message
// long-polls (returns early on a message, empty at the timeout); presence is on while the agent waits or polls and off after the fresh
// window; one agent per board ("busy" for a second); "planning" reaches the dock; the dock falls back to the starters when nobody listens;
// and an agent still can't run anything without Go. Own mock server, temp data dir, a short fresh window (1.5 s) so presence can expire.
// Run: cd server && npx tsx test/canvas-dock-agent.test.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { dockRoute, agentStarterPrompt, dockState, dockStatusLine, dockPill, workingLine, messageStatus, messageStatusText, listenCommand } from '../../web/src/canvas/dockAgent.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(8899); const B = `http://localhost:${PORT}`;
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-dock-')),
  OPENHIGGSFIELD_ENV_FILE: path.join(os.tmpdir(), 'canvas-dock-none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '40', OPENHIGGSFIELD_AGENT_FRESH_MS: '1500', OPENHIGGSFIELD_AGENT_LISTEN_MS: '1200', OPENHIGGSFIELD_AGENT_WORK_MS: '1200' }, stdio: 'ignore', detached: true });
const ok = (m: string) => console.log('ok ' + m);
const A = (id: string, name = 'Claude') => ({ 'x-ohf-mcp': '1', 'x-ohf-agent-name': name, 'x-ohf-agent-listener': id });
const get = async (u: string, headers: Record<string, string> = {}) => { const r = await fetch(B + u, { headers }); return { status: r.status, body: await r.json().catch(() => null) as any }; };
const send = async (method: string, u: string, body?: unknown, headers: Record<string, string> = {}) => { const r = await fetch(B + u, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) as any }; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let ctrl: AbortController | null = null;
try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await sleep(500); }
  const board = (await send('POST', '/api/canvas/boards', { name: 'Dock agent test' })).body; const base = `/api/canvas/boards/${board.id}/agent`;

  // ---- the dock's choice (pure) ----
  assert.equal(dockRoute({ connected: true, demoRunning: false, confirmWaiting: false }), 'messages', 'an agent is listening: what you type goes to it');
  assert.equal(dockRoute({ connected: false, demoRunning: false, confirmWaiting: false }), 'demo', 'nobody listening: the built-in starters');
  assert.equal(dockRoute({ connected: false, demoRunning: true, confirmWaiting: true }), 'messages', 'the demo waiting for Looks good gets the answer');
  assert.equal(dockRoute({ connected: true, demoRunning: true, confirmWaiting: false }), 'messages', 'a connected agent always gets what you type');
  assert.equal(dockRoute({ connected: false, demoRunning: true, confirmWaiting: false }), 'demo', 'no agent: the demo answers honestly (server: never a run)');
  const prompt = agentStarterPrompt(board.id, 'Launch'); for (const t of ['canvas_wait_for_message', 'canvas_list_workflows', 'canvas_batch', 'canvas_propose_run', 'canvas_review', 'canvas_say', board.id]) assert.ok(prompt.includes(t), `the starter prompt names ${t}`);
  assert.match(prompt, /Never start a run any other way/);
  ok('dock routing: agent inbox when connected, starters when not; the starter prompt names the loop');

  // ---- honest status (2026-10-28): three states, the copy, and the one thing to type ----
  assert.equal(dockState({ connected: false, listening: false }), 'off'); assert.equal(dockState({ connected: true, listening: false }), 'connected'); assert.equal(dockState({ connected: true, listening: true }), 'listening');
  assert.equal(dockState({ connected: true, listening: false, working: true }), 'working', 'building over MCP without a wait: working'); assert.equal(dockState({ connected: true, listening: true, working: true }), 'listening');
  assert.equal(dockStatusLine('off', 'Claude Code'), 'Built-in demo'); assert.equal(dockPill('off'), 'Not connected');
  assert.equal(dockStatusLine('connected', 'Claude Code'), 'Not reading this board yet'); assert.equal(dockStatusLine('connected', 'Claude Code', { sessions: 2 }), '2 agents · not here yet');
  assert.equal(dockStatusLine('working', 'Claude Code'), 'Working on this board'); assert.equal(dockPill('working'), 'Working'); assert.equal(workingLine('Claude Code'), 'Claude Code is working on this board');
  assert.equal(dockStatusLine('listening', 'Claude Code'), 'Reading this board'); assert.equal(dockStatusLine('listening', 'Claude Code', { via: 'channel' }), 'Messages go straight in');
  /* the header line never truncates (2026-10-28): every line fits the dock's 160 px column at 11 px Inter (~26 characters) */
  for (const st of ['off', 'connected', 'working', 'listening'] as const) for (const o of [{}, { sessions: 12 }, { via: 'channel' as const }]) {
    const line = dockStatusLine(st, 'A Very Long Agent Name Recorder', o); assert.ok(line.length <= 27, `"${line}" fits the header`); }
  assert.equal(listenCommand('brd_x1'), '/imagination:listen brd_x1', 'Claude Code lists MCP prompts as /<server>:<prompt>');
  assert.equal(messageStatus({ seq: 5, from: 'user', type: 'message' }, 3), 'waiting'); assert.equal(messageStatus({ seq: 5, from: 'user', type: 'message', pushedAt: 1 }, 3), 'sent');
  assert.equal(messageStatus({ seq: 5, from: 'user', type: 'message', readAt: 1 }, 3), 'read'); assert.equal(messageStatus({ seq: 5, from: 'user', type: 'message', readAt: 1 }, 6), null, 'a reply clears it');
  assert.equal(messageStatusText('waiting', 'Claude Code'), 'Waiting for Claude Code to read it');
  ok('dock copy: demo / not reading / working / listening, short enough never to truncate; /imagination:listen <board>; waiting → sent → read, cleared by a reply');

  // ---- presence off, then on with a wait, then off again after the fresh window ----
  assert.equal((await get(`${base}/state`)).body.agent.connected, false, 'nobody connected yet');
  const empty = Date.now(); const w0 = await get(`${base}/wait?timeout_sec=1`, A('L1'));
  assert.equal(w0.status, 200); assert.deepEqual(w0.body.messages, []); assert.ok(Date.now() - empty >= 900, 'the wait ran to its timeout');
  const st1 = (await get(`${base}/state`)).body.agent; assert.equal(st1.connected, true); assert.equal(st1.agentName, 'Claude', 'the dock can say "Claude is connected"');
  assert.equal(st1.listening, true, 'just waited: listening'); assert.equal(st1.listenVia, 'wait');
  await sleep(1700); const st2 = (await get(`${base}/state`)).body.agent; assert.equal(st2.connected, false, 'quiet past the window: "Not connected"'); assert.equal(st2.listening, false);
  /* a board call that isn't a wait (canvas_say) makes it connected and working on this board, not listening */
  await send('POST', `${base}/ops`, { ops: [{ kind: 'say', text: 'Hi there.' }] }, A('L1'));
  const st3 = (await get(`${base}/state`)).body.agent; assert.equal(st3.connected, true); assert.equal(st3.listening, false, 'not reading this board'); assert.equal(st3.working, true, 'working on this board');
  /* any canvas_* call on the board counts (canvas_open_board is a plain board read), a board list does not */
  await sleep(1400); assert.equal((await get(`${base}/state`)).body.agent.working, false, 'quiet past the work window');
  await get('/api/canvas/boards', A('L1')); assert.equal((await get(`${base}/state`)).body.agent.working, false, 'a board list is not work on this board');
  await get(`/api/canvas/boards/${board.id}`, A('L1')); assert.equal((await get(`${base}/state`)).body.agent.working, true, 'reading the board is');
  await sleep(1700);
  ok('presence: listening while a wait is open or just returned, working after other calls on the board (not a board list), off after the window; an empty wait returns at its timeout');

  // ---- a message typed before the agent listened isn't lost; read receipts ----
  const early = (await send('POST', `${base}/messages`, { text: 'hello' })).body.message; assert.equal(early.readAt, undefined, 'nobody read it yet');
  const wHello = await get(`${base}/wait?timeout_sec=0`, A('L1')); assert.deepEqual(wHello.body.messages.map((m: any) => m.text), ['hello'], 'the first wait (no since) returns the unread hello');
  let feedNow = (await get(`${base}/feed?since=0`)).body.items; const hello = feedNow.find((e: any) => e.seq === early.seq); assert.ok(hello.readAt > 0); assert.equal(hello.readVia, 'wait');
  assert.deepEqual((await get(`${base}/wait?timeout_sec=0`, A('L1'))).body.messages, [], 'read messages are not returned again');
  const viaInbox = (await send('POST', `${base}/messages`, { text: 'and this' })).body.message;
  await get(`${base}/inbox?since=${wHello.body.next}`, A('L1')); feedNow = (await get(`${base}/feed?since=0`)).body.items;
  assert.equal(feedNow.find((e: any) => e.seq === viaInbox.seq).readVia, 'inbox', 'canvas_inbox marks it read too');
  await get(`${base}/inbox?since=0`); assert.equal((await get(`${base}/feed?since=0`)).body.items.filter((e: any) => e.from === 'user' && !e.readAt).length, 0, 'the dock reading its own inbox marks nothing');
  ok('read receipts: a hello typed before listening reaches the first wait; wait and canvas_inbox mark messages read');
  await sleep(1700);

  // ---- channel mode: a channel session listens on every board and gets what you type pushed; a reply turns "sent" into "read" ----
  const C = A('CH1', 'claude-code');
  const p0 = get(`/api/canvas/agent/channel?timeout_sec=5`, C); await sleep(250);
  const stc = (await get(`${base}/state`)).body.agent; assert.equal(stc.listening, true, 'a polling channel session counts as listening'); assert.equal(stc.listenVia, 'channel'); assert.equal(stc.channel, true);
  const pushedMsg = (await send('POST', `${base}/messages`, { text: 'push me' })).body.message;
  const p0r = await p0; assert.equal(p0r.status, 200); assert.equal(p0r.body.items.length, 1); assert.equal(p0r.body.items[0].boardId, board.id); assert.equal(p0r.body.items[0].messages[0].text, 'push me');
  let pe = (await get(`${base}/feed?since=0`)).body.items.find((e: any) => e.seq === pushedMsg.seq); assert.ok(pe.pushedAt > 0); assert.equal(pe.readAt, undefined, 'pushed is "sent", not "read" yet');
  assert.deepEqual((await get(`/api/canvas/agent/channel?timeout_sec=0`, C)).body.items, [], 'pushed once only');
  assert.equal((await send('POST', `${base}/ops`, { ops: [{ kind: 'say', text: 'Got it.' }] }, C)).status, 200);
  pe = (await get(`${base}/feed?since=0`)).body.items.find((e: any) => e.seq === pushedMsg.seq); assert.ok(pe.readAt > 0, 'its reply means it read it'); assert.equal(pe.readVia, 'channel');
  /* a wait-loop agent on the board takes precedence: the channel leaves that board alone */
  await sleep(1700); const wl = get(`${base}/wait?timeout_sec=3`, A('L9', 'Other AI')); await sleep(200);
  const p1 = get(`/api/canvas/agent/channel?timeout_sec=1`, C); await send('POST', `${base}/messages`, { text: 'for the waiter' });
  assert.deepEqual((await wl).body.messages.map((m: any) => m.text), ['for the waiter']); assert.deepEqual((await p1).body.items, [], 'the channel skips a board with a wait open');
  assert.equal((await fetch(`${B}/api/canvas/agent/channel`, { method: 'DELETE', headers: C })).status, 200); await sleep(1700);
  assert.equal((await get(`${base}/state`)).body.agent.channel, false, 'gone at once on DELETE');
  assert.equal((await get('/api/canvas/agent/channel?timeout_sec=0')).status, 400, 'only an MCP server polls the channel');
  ok('channel: polling = listening; a message is pushed once, "sent" until the reply; a wait-loop agent keeps its board; DELETE ends it');

  // ---- SSE: the dock hears "planning" when the agent picks up a message ----
  ctrl = new AbortController(); const sse = await fetch(`${B}${base}/stream`, { signal: ctrl.signal }); const reader = sse.body!.getReader(); const dec = new TextDecoder(); let sseText = '';
  void (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) break; sseText += dec.decode(value, { stream: true }); } } catch { /* aborted */ } })();

  // ---- hand-off with selection, and the wait returns early ----
  const t0 = Date.now(); const waiting = get(`${base}/wait?timeout_sec=20`, A('L1'));
  await sleep(300);
  const sel = [{ id: 'shape:hero', name: 'Hero shot', type: 'ohf-gen', workflow: 'create', status: 'done' }];
  const m = await send('POST', `${base}/messages`, { text: 'Make three more like this one, warmer light', selection: sel }); assert.equal(m.status, 200);
  const w1 = await waiting; assert.ok(Date.now() - t0 < 3000, 'the wait returned as soon as you typed');
  assert.equal(w1.body.messages.length, 1); assert.equal(w1.body.messages[0].text, 'Make three more like this one, warmer light'); assert.deepEqual(w1.body.messages[0].selection, sel, 'your selection rides along as context');
  assert.ok(w1.body.next > 0); const again = await get(`${base}/wait?timeout_sec=0&since=${w1.body.next}`, A('L1')); assert.deepEqual(again.body.messages, [], 'since = next: nothing twice');
  await sleep(200); assert.match(sseText, /event: agent_status\ndata: \{"state":"planning","name":"Claude"/, 'the dock shows "Claude is planning…"');
  assert.equal((await send('POST', `${base}/messages`, { text: 'x', selection: [{ id: 'shape:a', bad: 1 }] })).status, 400, 'selection entries are checked');
  ok('hand-off: your message reaches the waiting agent at once, with your selection; the dock hears it is planning');

  // ---- one agent per board ----
  const busy = await get(`${base}/wait?timeout_sec=0`, A('L2', 'Other AI')); assert.equal(busy.status, 409); assert.equal(busy.body.code, 'board_busy'); assert.match(busy.body.error, /Claude is already working on this board/);
  const busyOp = await send('POST', `${base}/ops`, { ops: [{ kind: 'say', text: 'hi' }] }, A('L2', 'Other AI')); assert.equal(busyOp.status, 409, 'its ops are refused too');
  assert.equal((await send('POST', `${base}/ops`, { ops: [{ kind: 'say', text: 'On it.' }] }, A('L1'))).status, 200, 'the listening agent carries on');
  await sleep(1700); assert.equal((await get(`${base}/wait?timeout_sec=0`, A('L2', 'Other AI'))).status, 200, 'once the first goes quiet, another may listen');
  ok('one agent per board: a second gets a polite busy until the first stops');

  // ---- still nothing runs without Go: the agent can only propose ----
  const jobs0 = (await get('/api/jobs')).body.length;
  const noPage = await send('POST', `${base}/ops`, { ops: [{ kind: 'propose_run', card_ids: ['shape:hero'] }] }, A('L2', 'Other AI'));
  assert.equal(noPage.body.results[0].ok, false, 'no open board page: nothing is priced or run'); assert.equal((await get('/api/jobs')).body.length, jobs0, 'no job started');
  assert.equal((await send('POST', `${base}/ops`, { ops: [{ kind: 'run_proposal', card_ids: ['shape:hero'] }] }, A('L2', 'Other AI'))).status, 400, 'there is no op that runs: only the user\'s Go');
  ok('no run without Go: an agent can only propose');
  console.log('canvas-dock-agent: all ok');
} catch (e) { console.error(e); process.exitCode = 1; /* the finally exits: without this a failed assert ended with code 0 */
} finally {
  try { ctrl?.abort(); } catch { /* gone */ }
  try { process.kill(-srv.pid!); } catch { /* gone */ }
  process.exit(process.exitCode ?? 0);
}
