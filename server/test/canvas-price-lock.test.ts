// Price lock at Go (Canvas release 1, security review VERIFIED #4; user decision 2026-11-06): a proposal row stores the price it was
// approved at (quotedCredits + routeId) and Go submits them with priceLock=1. A rise under 10% runs; 10% or more, or another model or place,
// stops that row as "Price changed · $0.46 (was $0.42)" and asks again. Checked here: the shared rule, the page's check and form fields, the
// jobs route's own 409, runInOrder carrying a price stop for a card that starts later in a chain, and the proposal flow (locks sent at Go,
// a price-changed row marked, a fresh proposal that keeps the agent budget).
// Run: cd server && npx tsx test/canvas-price-lock.test.ts   (own mock server, temp data dir, mock keys, nothing leaves the machine)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const { priceLockStop, priceAskAgain } = await import('../src/shared/priceChange.ts');
const { lockVerdict, lockFields, lockOfQuote, PriceChangedError, priceChangedText } = await import('../../web/src/canvas/priceLock.ts');
const { runInOrder } = await import('../../web/src/canvas/nodeLogic.ts');
const ok = (m: string) => console.log('ok ' + m);

// ---- the rule ----
assert.equal(priceLockStop({ quotedCredits: 42, credits: 42 }), null, 'same price runs');
assert.equal(priceLockStop({ quotedCredits: 42, credits: 30 }), null, 'cheaper runs');
assert.equal(priceLockStop({ quotedCredits: 100, credits: 109 }), null, 'a 9% rise runs');
assert.equal(priceLockStop({ quotedCredits: 100, credits: 110 }), 'dearer', 'a 10% rise stops');
assert.equal(priceLockStop({ quotedCredits: 42, credits: 46 }), null, '$0.42 → $0.46 is a 9.5% rise: runs');
assert.equal(priceLockStop({ quotedCredits: 42, credits: 47 }), 'dearer', '$0.42 → $0.47 stops');
assert.equal(priceLockStop({ quotedCredits: 0, credits: 1 }), 'dearer', 'a free or sample price has no room');
assert.equal(priceLockStop({ quotedCredits: 0, credits: 0 }), null);
assert.equal(priceLockStop({ quotedRoute: 'comfy-router:a', quotedCredits: 42, route: 'comfy-router:b', credits: 40 }), 'route', 'another model or place stops, even cheaper');
assert.equal(priceLockStop({ quotedRoute: 'comfy-router:a', quotedCredits: 42, route: 'comfy-router:a', credits: 44 }), null);
assert.equal(priceLockStop({ quotedCredits: null, credits: 1 }), 'dearer', 'a lock without a price never runs blind');
assert.equal(priceAskAgain({ quotedCredits: 42, credits: 44 }), true, 'without the lock, the old rule (any rise asks) is unchanged');
ok('the lock rule: under 10% runs, 10% or more or another route stops');

// ---- the page's check, its words and its form fields ----
const lock = lockOfQuote({ credits: 42, routeId: 'comfy-router:x', cost: { estUsd: 0.42 } })!;
assert.deepEqual(lock, { credits: 42, routeId: 'comfy-router:x', usd: 0.42, runs: 1 });
assert.equal(lockVerdict(lock, { credits: 45, routeId: 'comfy-router:x', cost: { estUsd: 0.45 } }), null, 'a small rise passes');
const stop = lockVerdict(lock, { credits: 46.2, routeId: 'comfy-router:x', cost: { estUsd: 0.462 } })!;
assert.ok(stop instanceof PriceChangedError); assert.equal(stop.code, 'price_changed'); assert.equal(stop.reason, 'dearer');
assert.equal(stop.message, 'Price changed · $0.46 (was $0.42)');
assert.equal(lockVerdict(lock, { credits: 42, routeId: 'comfy-router:y', cost: { estUsd: 0.42 } })!.reason, 'route');
assert.equal(priceChangedText('route', 0.42, 0.42), 'Model or place changed · $0.42 (was $0.42)');
assert.equal(lockVerdict(null, { credits: 999 }), null, 'no lock: unchanged behaviour');
assert.deepEqual(lockFields(lock), { priceLock: '1', quotedCredits: '42', quotedRouteId: 'comfy-router:x' });
assert.deepEqual(lockFields({ credits: 120, routeId: null, usd: 1.2, runs: 4 }, 4), { priceLock: '1', quotedCredits: '30' }, 'Material Swap: the lock per swatch run');
ok('page check: words, reasons and the fields sent with the run');

// ---- runInOrder: a card that starts later in a chain carries its price stop ----
{ const locks: Record<string, any> = { A: { credits: 10, routeId: null, usd: 0.1 }, B: { credits: 10, routeId: null, usd: 0.1 } };
  let aDone = false; const later: any[] = []; const notStarted: string[] = []; const seenLocks: any[] = [];
  const quotes: Record<string, any> = { A: { credits: 10 }, B: { credits: 20, cost: { estUsd: 0.2 } } };
  const r = await runInOrder(['A', 'B'], { waits: (id) => (id === 'B' && !aDone ? [{ id: 'A', name: 'A', status: 'running' }] : []), exists: () => true, pollMs: 5,
    submit: async (id) => { seenLocks.push([id, locks[id]]); const s = lockVerdict(locks[id], quotes[id]); if (s) throw s; if (id === 'A') setTimeout(() => { aDone = true; }, 20); return `job_${id}`; },
    notStarted: (id) => notStarted.push(id), onLater: (id, x) => later.push({ id, ...x }) });
  assert.deepEqual(r.jobIds, ['job_A']); assert.deepEqual(r.later, ['B']);
  for (let i = 0; i < 100 && !later.length; i++) await new Promise((res) => setTimeout(res, 10));
  assert.equal(later[0].id, 'B'); assert.equal(later[0].failure.code, 'price_changed'); assert.equal(later[0].failure.wasUsd, 0.1); assert.equal(later[0].failure.nowUsd, 0.2);
  assert.deepEqual(seenLocks.map((x) => x[0]), ['A', 'B'], 'the waiting card is submitted with its own locked price');
  const now = await runInOrder(['B'], { waits: () => [], exists: () => true, submit: async (id) => { const s = lockVerdict(locks[id], quotes[id]); if (s) throw s; return 'x'; }, notStarted: () => undefined });
  assert.equal(now.failed[0].code, 'price_changed'); assert.equal(now.failed[0].reason, 'dearer');
  ok('waiting chain cards keep their locked price; a stop is reported with both prices'); }

// ---- the jobs route and the proposal flow, on a mock server ----
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9611); const B = `http://localhost:${PORT}`;
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'price-lock-')),
  OPENHIGGSFIELD_ENV_FILE: path.join(os.tmpdir(), 'price-lock-none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '40', COMFY_API_KEY: '', OPENHIGGSFIELD_COMFY_API_KEY: '' }, stdio: 'ignore', detached: true });
const send = async (method: string, u: string, body?: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(B + u, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } } : { headers }) });
  return { status: r.status, body: await r.json().catch(() => null) as any };
};
let ctrl: AbortController | null = null;
try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  const price = (await send('GET', '/api/tools/create-image/price?types=' + encodeURIComponent('["generate"]'))).body; const credits = Number(price.credits); const route = String(price.routeId ?? price.route ?? '');
  assert.ok(credits > 0, `a priced route on the mock server (got ${credits})`);
  const job = async (f: Record<string, string>) => { const fd = new FormData(); fd.append('prompt', 'A locked price test'); fd.append('types', '["generate"]'); for (const [k, v] of Object.entries(f)) fd.append(k, v);
    const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json().catch(() => null) as any }; };
  const small = await job({ priceLock: '1', quotedCredits: String(credits / 1.05), quotedRouteId: route });
  assert.equal(small.status, 200, `a 5% rise runs: ${JSON.stringify(small.body)?.slice(0, 200)}`);
  const big = await job({ priceLock: '1', quotedCredits: String(credits / 1.25), quotedRouteId: route });
  assert.equal(big.status, 409); assert.equal(big.body.code, 'route_changed'); assert.equal(big.body.lock, true); assert.equal(big.body.reason, 'dearer'); assert.equal(big.body.charged, false);
  assert.ok(big.body.quote && typeof big.body.quote.credits === 'number', 'the fresh quote comes back');
  const moved = await job({ priceLock: '1', quotedCredits: String(credits), quotedRouteId: 'comfy-router:somewhere-else' });
  assert.equal(moved.status, 409); assert.equal(moved.body.reason, 'route', 'another place stops even at the same price');
  const legacy = await job({ quotedCredits: String(credits / 1.05), quotedRouteId: route });
  assert.equal(legacy.status, 409, 'without priceLock the old contract is unchanged (any dearer run asks)');
  ok('jobs route: priceLock=1 lets a small rise through and stops a big rise or another route (409, nothing charged)');

  // the proposal flow through a fake canvas page
  const board = (await send('POST', '/api/canvas/boards', { name: 'Price lock' })).body;
  ctrl = new AbortController(); const res = await fetch(`${B}/api/canvas/boards/${board.id}/agent/stream`, { signal: ctrl.signal });
  const reader = res.body!.getReader(); const dec = new TextDecoder(); let buf = ''; const runOps: any[] = []; let priceNow = 0.42;
  const apply = (op: any) => {
    if (op.kind === 'propose_run') return { items: op.card_ids.map((id: string) => ({ cardId: id, title: id, workflow: 'create', model: 'Mock', status: 'draft', usd: priceNow, credits: Math.round(priceNow * 100), quote: { credits: Math.round(priceNow * 100), routeId: 'comfy-router:mock', cost: { estUsd: priceNow } }, problem: null })) };
    if (op.kind === 'run_proposal') { runOps.push(op); const failed: any[] = []; for (const id of op.card_ids) { const s = lockVerdict(op.locks[id], { credits: Math.round(priceNow * 100), routeId: 'comfy-router:mock', cost: { estUsd: priceNow } });
        if (s) failed.push({ cardId: id, error: s.message, code: 'price_changed', reason: s.reason, wasUsd: s.wasUsd, nowUsd: s.nowUsd }); } return { jobIds: [], failed }; }
    throw new Error('fake page: ' + op.kind);
  };
  void (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const block = buf.slice(0, i); buf = buf.slice(i + 2); let ev = ''; let data = '';
      for (const line of block.split('\n')) { if (line.startsWith('event:')) ev = line.slice(6).trim(); else if (line.startsWith('data:')) data += line.slice(5).trim(); }
      if (ev !== 'op' || !data) continue; const m = JSON.parse(data);
      try { await send('POST', `/api/canvas/boards/${board.id}/agent/results`, { id: m.id, ok: true, result: apply(m.op) }); } catch (e) { await send('POST', `/api/canvas/boards/${board.id}/agent/results`, { id: m.id, ok: false, error: (e as Error).message }); } } } } catch { /* closed */ } })();
  await new Promise((r) => setTimeout(r, 150));
  const budget = (await send('POST', '/api/agent/budgets', { name: 'Lock test', budgetUsd: 5 })).body;
  const prop = (await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'propose_run', card_ids: ['shape:a'] }] }, { 'x-ohf-agent-budget': budget.id ?? budget.budget?.id ?? '' })).body.results[0].result.proposal;
  assert.equal(prop.items[0].quotedCredits, 42); assert.equal(prop.items[0].routeId, 'comfy-router:mock', 'each row stores its exact quote');
  priceNow = 0.5; /* the price rose 19% between the proposal and Go */
  assert.equal((await send('POST', `/api/canvas/boards/${board.id}/agent/proposals/${prop.id}/decision`, { decision: 'go' })).status, 200);
  for (let i = 0; i < 100 && !runOps.length; i++) await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(runOps[0].locks['shape:a'], { credits: 42, routeId: 'comfy-router:mock', usd: 0.42 }, 'Go sends each row’s locked price');
  let after: any = null; for (let i = 0; i < 100; i++) { after = (await send('GET', `/api/canvas/agent/proposals/${prop.id}`)).body; if (after.status !== 'running') break; await new Promise((r) => setTimeout(r, 20)); }
  assert.equal(after.status, 'failed'); assert.match(after.error, /price changed/i);
  assert.deepEqual(after.items[0].priceChanged, { wasUsd: 0.42, nowUsd: 0.5, reason: 'dearer' }, 'the row says Price changed · $0.50 (was $0.42)');
  /* ask again: the page posts a fresh proposal for that row, under the same agent budget */
  const again = await send('POST', `/api/canvas/boards/${board.id}/agent/proposals`, { card_ids: ['shape:a'], note: 'Price changed', reprice_of: prop.id });
  assert.equal(again.status, 200); assert.equal(again.body.proposal.items[0].usd, 0.5); assert.equal(again.body.proposal.repriceOf, prop.id, 'the ask-again names the approval it replaces (the dock draws the pair as one card)'); assert.equal(again.body.proposal.status, 'pending', 'waits for Go again');
  if (prop.budget) assert.equal(again.body.proposal.budget?.id, prop.budget.id, 'the agent budget carries over');
  priceNow = 0.52; /* +4% after the new approval: still runs */
  assert.equal((await send('POST', `/api/canvas/boards/${board.id}/agent/proposals/${again.body.proposal.id}/decision`, { decision: 'go' })).status, 200);
  for (let i = 0; i < 100 && runOps.length < 2; i++) await new Promise((r) => setTimeout(r, 20));
  let a2: any = null; for (let i = 0; i < 100; i++) { a2 = (await send('GET', `/api/canvas/agent/proposals/${again.body.proposal.id}`)).body; if (a2.status !== 'running') break; await new Promise((r) => setTimeout(r, 20)); }
  assert.equal(a2.items[0].priceChanged ?? null, null, 'a small rise passes at Go');
  ok('proposal flow: locks at Go, a price-changed row, asking again under the same budget, a small rise passing');
  console.log('\nall canvas price lock checks passed');
} finally { ctrl?.abort(); try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* gone */ } }
process.exit(0);
