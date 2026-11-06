// Board budget (Canvas release 1, user decision 2026-11-06): a spending limit per board that only the person sets (board menu). Stored on
// the board row, never in the board document; refused for an agent (MCP headers, an agent budget) and for anything that isn't the app's own
// page; shown in the spend chip ("$1.14 of $5.00"); checked when a run starts from the board and at Go on a proposal, next to the agent budget.
// Run: cd server && npx tsx test/canvas-board-budget.test.ts   (own mock server, temp data dir, mock keys, simulated spend counted)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ok = (m: string) => console.log('ok ' + m);
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9612); const B = `http://localhost:${PORT}`;
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'board-budget-')),
  OPENHIGGSFIELD_ENV_FILE: path.join(os.tmpdir(), 'board-budget-none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '40', COMFY_API_KEY: '', OPENHIGGSFIELD_COMFY_API_KEY: '' }, stdio: 'ignore', detached: true });
const send = async (method: string, u: string, body?: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(B + u, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } } : { headers }) });
  return { status: r.status, body: await r.json().catch(() => null) as any };
};
const PERSON = { 'sec-fetch-site': 'same-origin' }; /* what the app's own page sends (a browser sets it) */
let ctrl: AbortController | null = null;
try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  const board = (await send('POST', '/api/canvas/boards', { name: 'Budget' })).body;
  const put = (usd: unknown, h: Record<string, string>) => send('PUT', `/api/canvas/boards/${board.id}/budget`, { usd }, h);

  // ---- only the person sets it ----
  assert.equal((await put(5, {})).status, 403, 'no browser page: refused');
  for (const h of [{ 'x-ohf-mcp': '1' }, { 'x-ohf-agent-name': 'Claude' }, { 'x-ohf-agent-budget': 'agb_x' }]) {
    const r = await put(500, { ...PERSON, ...h }); assert.equal(r.status, 403, `an agent is refused (${Object.keys(h)[0]})`); assert.equal(r.body.code, 'people_only'); }
  assert.equal((await send('GET', `/api/canvas/boards/${board.id}/spend`)).body.budget, null, 'nothing was set by the refused calls');
  assert.equal((await put(-1, PERSON)).status, 400); assert.equal((await put('lots', PERSON)).status, 400);
  const set = await put(5, PERSON); assert.equal(set.status, 200); assert.deepEqual(set.body.budget, { usd: 5, spentUsd: 0, leftUsd: 5 });
  assert.equal((await send('GET', `/api/canvas/boards/${board.id}`)).body.budgetUsd, 5, 'the board row carries it');
  /* saving the board document (the page, or an agent's ops) never touches it */
  const saved = await send('PUT', `/api/canvas/boards/${board.id}`, { snapshot: { format: 'iiayn-board', version: 2, nodes: [], links: [], budgetUsd: 999 } });
  assert.equal(saved.status, 200); assert.equal((await send('GET', `/api/canvas/boards/${board.id}`)).body.budgetUsd, 5, 'not in the document');
  assert.equal((await send('PATCH', `/api/canvas/boards/${board.id}`, { name: 'Budget 2', budgetUsd: 999 } as any)).status, 200);
  assert.equal((await send('GET', `/api/canvas/boards/${board.id}`)).body.budgetUsd, 5, 'rename never changes it');
  ok('only the person sets the board budget: agents, other clients and the board document can’t');

  // ---- checked when a run starts from the board ----
  const types = encodeURIComponent('["generate"]');
  const price = (await send('GET', `/api/tools/create-image/price?types=${types}`)).body; const usd = Number(price.cost?.estUsd ?? price.credits / 100); assert.ok(usd > 0, 'a priced run');
  const job = async (boardId: string) => { const fd = new FormData(); fd.append('prompt', 'A board budget test'); fd.append('types', '["generate"]'); fd.append('boardId', boardId);
    const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json().catch(() => null) as any }; };
  assert.equal((await job(board.id)).status, 200, 'under the budget: runs');
  const spent = (await send('GET', `/api/canvas/boards/${board.id}/spend`)).body.budget; assert.ok(spent.spentUsd > 0, 'the run counts against it'); assert.equal(spent.usd, 5);
  await put(Math.round((spent.spentUsd + usd / 2) * 100) / 100, PERSON);
  const over = await job(board.id); assert.equal(over.status, 402); assert.equal(over.body.code, 'board_budget'); assert.equal(over.body.charged, false);
  assert.match(over.body.error, /board's .* budget/);
  const other = (await send('POST', '/api/canvas/boards', { name: 'No budget' })).body; assert.equal((await job(other.id)).status, 200, 'another board is not limited');
  ok('a run that would go over the board budget doesn’t start (402 board_budget, nothing charged)');

  // ---- checked at Go on a proposal ----
  await put(5, PERSON);
  ctrl = new AbortController(); const res = await fetch(`${B}/api/canvas/boards/${board.id}/agent/stream`, { signal: ctrl.signal });
  const reader = res.body!.getReader(); const dec = new TextDecoder(); let buf = ''; let ran = 0; let each = 1.5;
  const apply = (op: any) => { if (op.kind === 'propose_run') return { items: op.card_ids.map((id: string) => ({ cardId: id, title: id, workflow: 'create', model: 'Mock', status: 'draft', usd: each, credits: each * 100, quote: { credits: each * 100, cost: { estUsd: each } }, problem: null })) };
    if (op.kind === 'run_proposal') { ran++; return { jobIds: [], failed: [] }; } throw new Error(op.kind); };
  void (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const block = buf.slice(0, i); buf = buf.slice(i + 2); let ev = ''; let data = '';
      for (const line of block.split('\n')) { if (line.startsWith('event:')) ev = line.slice(6).trim(); else if (line.startsWith('data:')) data += line.slice(5).trim(); }
      if (ev !== 'op' || !data) continue; const m = JSON.parse(data);
      try { await send('POST', `/api/canvas/boards/${board.id}/agent/results`, { id: m.id, ok: true, result: apply(m.op) }); } catch (e) { await send('POST', `/api/canvas/boards/${board.id}/agent/results`, { id: m.id, ok: false, error: (e as Error).message }); } } } } catch { /* closed */ } })();
  await new Promise((r) => setTimeout(r, 150));
  const propose = async (ids: string[]) => (await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'propose_run', card_ids: ids }] })).body.results[0].result.proposal;
  const fits = await propose(['shape:a']); assert.equal(fits.overBudget, false); assert.ok(fits.boardBudget && fits.boardBudget.usd === 5, 'the dock shows the board budget');
  const tooMuch = await propose(['shape:a', 'shape:b', 'shape:c', 'shape:d']); /* 4 × $1.50 = $6 > $5 */
  assert.equal(tooMuch.overBudget, true); assert.match(tooMuch.reason, /board's budget/);
  assert.equal((await send('POST', `/api/canvas/boards/${board.id}/agent/proposals/${tooMuch.id}/decision`, { decision: 'go' })).status, 409, 'Go refused');
  /* priced under the budget, but the budget went down before Go: Go checks again */
  const later = await propose(['shape:a']); await put(0.5, PERSON);
  const go = await send('POST', `/api/canvas/boards/${board.id}/agent/proposals/${later.id}/decision`, { decision: 'go' });
  assert.equal(go.status, 409); assert.equal(go.body.code, 'board_budget'); assert.equal(ran, 0, 'nothing was sent to the page to run');
  await put(null, PERSON); assert.equal((await send('GET', `/api/canvas/boards/${board.id}/spend`)).body.budget, null, 'removed');
  const free = await propose(['shape:a']); assert.equal(free.overBudget, false); assert.equal(free.boardBudget, null);
  ok('the board budget is checked at Go on a proposal, next to the agent budget');
  console.log('\nall board budget checks passed');
} finally { ctrl?.abort(); try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* gone */ } }
process.exit(0);
