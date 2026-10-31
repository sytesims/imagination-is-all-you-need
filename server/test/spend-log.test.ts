// Spend log (decision 2026-10-21): one row per job with tool, model, route, billedTo, estUsd, actualUsd (null until a provider reports it), status,
// failureRule, createdAt. Written at submit, settled when the job ends. GET /api/spend (filters provider / tool / from / to, cursor paging),
// GET /api/spend/summary?period=day|month. Unit part: costOf (local / comfy / fal / demo), countedUsd rules, BFL's reported cost → actualUsd,
// connected accounts without keys (connected:false; mock sample flagged sample:true).
// Run: npx tsx test/spend-log.test.ts (port 9143; temp data dirs, mock backend, mock keys, no network).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
// These tests exercise spend limits on the mock backend, so mock runs must count like real ones here (a real install never sets this).
process.env.OPENHIGGSFIELD_COUNT_SIMULATED_SPEND = '1';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'spendlog-')); const ok = (m: string) => console.log('ok ' + m);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '' };
// ---- unit part: its own data dir, set before any src import (db.ts opens the DB on import) ----
const DU = fs.mkdtempSync(path.join(os.tmpdir(), 'spendlog-unit-'));
Object.assign(process.env, NOKEYS, { OPENHIGGSFIELD_DATA_DIR: DU, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '' });
const BL = await import('../src/billing.ts'); const HR = await import('../src/hostedRequests.ts');
{
  const loc = BL.costOf({ kind: 'local', credits: 0 }); assert.equal(loc.billedTo, 'local'); assert.equal(loc.estUsd, 0); assert.equal(loc.estimated, false); assert.equal(loc.failureRule, 'not-charged');
  const cf = BL.costOf({ kind: 'comfy-router', routeId: 'comfy-router:api-seedream', credits: 9 }); assert.deepEqual([cf.billedTo, cf.estUsd, cf.estUnits, cf.unitLabel, cf.failureRule], ['comfy', 0.09, 19, 'Comfy credits', 'may-charge']);
  const fl = BL.costOf({ kind: 'fal', routeId: 'fal:fal-ai/qwen-image', credits: 42 }); assert.deepEqual([fl.billedTo, fl.estUsd, fl.estUnits], ['fal', 0.42, undefined]);
  const rp = BL.costOf({ kind: 'replicate', credits: 7, demo: true, listCredits: 7 }); assert.deepEqual([rp.billedTo, rp.estUsd, rp.demo, rp.realRunUsd, rp.failureRule], ['replicate', 0, true, 0.07, 'not-charged']);
  const bf = BL.costOf({ kind: 'direct', routeId: 'direct:bfl/flux-3-image-klein', credits: 1 }); assert.equal(bf.billedTo, 'bfl'); assert.equal(bf.actualReported, true);
  ok('costOf: local free, Comfy credits at 211/USD, fal USD, a demo costs $0 with realRunUsd, BFL direct → bfl');
  const row = (o: any) => ({ id: 'x', jobId: 'x', createdAt: 0, finishedAt: 1, toolId: 't', model: 'm', modelName: null, route: null, routeKind: null, billedTo: 'fal', estUsd: 0.5, estUnits: null, unitLabel: null, actualUsd: null, actualSource: null, status: 'done', started: true, failureRule: 'may-charge', demo: false, mode: 'own-accounts', credits: 50, ...o });
  assert.equal(BL.countedUsd(row({})), 0.5); assert.equal(BL.countedUsd(row({ actualUsd: 0.31 })), 0.31); assert.equal(BL.countedUsd(row({ demo: true })), 0);
  assert.equal(BL.countedUsd(row({ status: 'canceled', started: false })), 0); assert.equal(BL.countedUsd(row({ status: 'failed', failureRule: 'not-charged' })), 0); assert.equal(BL.countedUsd(row({ status: 'failed' })), 0.5);
  ok('countedUsd: actual first; demo, never-started and not-charged failures count $0; may-charge failures count the estimate');
  assert.equal(HR.parseBflSubmit({ id: 'a', polling_url: 'u', cost: 4.5 }).cost, 4.5); assert.equal(HR.parseBflSubmit({ id: 'a', polling_url: 'u' }).cost, null);
  assert.equal((HR.parseBflPoll({ status: 'Ready', result: { sample: 's' }, cost: 4 }) as any).cost, 4);
  const { jobs } = await import('../src/jobs.ts');
  const job: any = { id: 'bfl1', toolId: 'create-image', provider: 'comfy-flux3-klein', status: 'queued', createdAt: Date.now(), route: 'direct:bfl/flux-3-image-klein', input: {}, outputs: [] }; jobs.set(job.id, job);
  BL.recordSpend(job, 1); Object.assign(job, { status: 'done', startedAt: Date.now(), finishedAt: Date.now(), actualCost: { usd: 0.045, units: 4.5, unitLabel: 'BFL credits', source: 'bfl:settled-cost' } }); BL.settleSpend(job);
  const spent = BL.spentUsd('bfl', 'day'); assert.equal(spent, 0.045, 'actual cost wins over the estimate');
  ok('BFL reported cost (AsyncResponse / settled cost) → spend actualUsd');
  { // PB-08: a queued (then canceled) run's row carries the model's display name from submit, never the raw provider id
    const q: any = { id: 'pb08', toolId: 'create-image', provider: 'api-nano-banana', status: 'queued', createdAt: Date.now(), route: 'comfy-router:api-nano-banana', input: { prompt: 'x' }, outputs: [], agent: { id: 'pb08-agent', name: 'PB-08' } }; jobs.set(q.id, q);
    BL.recordSpend(q, 8); const r0 = BL.agentSpendRows('pb08-agent')[0]; assert.equal(r0.modelName, 'Nano Banana 2', JSON.stringify(r0));
    Object.assign(q, { status: 'canceled', finishedAt: Date.now() }); BL.settleSpend(q); const r1 = BL.agentSpendRows('pb08-agent')[0]; assert.equal(r1.modelName, 'Nano Banana 2'); assert.equal(r1.status, 'canceled');
    ok('spend row Model: "Nano Banana 2" while queued and after cancel (not api-nano-banana)');
  }
  const acc = await BL.accounts(); assert.ok(acc.every((a) => a.connected === false && a.source === 'unavailable')); for (const id of ['fal', 'bfl', 'comfy']) { const a = acc.find((x) => x.provider === id)!; assert.equal(a.mock?.sample, true, id); }
  assert.equal(acc.find((x) => x.provider === 'replicate')!.mock, undefined); ok('accounts without keys: connected:false; mock backend → sample balances flagged sample:true (fal, bfl, comfy only)');
  // with (fake) keys and a stubbed fetch: only the documented read-only endpoints, each key only to its own provider's host
  const real = globalThis.fetch; const calls: { url: string; headers: Record<string, string> }[] = [];
  Object.assign(process.env, { OPENHIGGSFIELD_FAL_KEY: 'fal-test-key-123456', OPENHIGGSFIELD_BFL_API_KEY: 'bfl-test-key-123456', COMFY_API_KEY: 'comfyui-test-key-123456', OPENHIGGSFIELD_REPLICATE_API_TOKEN: 'r8_test_key_123456' });
  globalThis.fetch = (async (u: any, init: any) => { const url = String(u); calls.push({ url, headers: init?.headers ?? {} }); const body = url.startsWith('https://api.fal.ai/v1/account/billing') ? { username: 'x', credits: { current_balance: 12.4, currency: 'USD' } }
    : url === 'https://api.bfl.ai/v1/credits' ? { credits: 875 } : url.startsWith('https://cloud.comfy.org/api/billing/usage/timeseries') ? { summary: { spend_micros: 2_500_000, balance: { amount_micros: 2110, currency: 'USD' } } } : null;
    return new Response(body ? JSON.stringify(body) : 'no', { status: body ? 200 : 404 }); }) as any;
  try {
    const live = await BL.accounts(true); const by = (id: string) => live.find((x) => x.provider === id)!;
    assert.deepEqual([by('fal').connected, by('fal').balance, by('fal').balanceUsd, by('fal').source], [true, 12.4, 12.4, 'provider']);
    assert.deepEqual([by('bfl').balance, by('bfl').balanceUnit, by('bfl').balanceUsd], [875, 'BFL credits', 8.75]);
    assert.deepEqual([by('comfy').balanceUsd, by('comfy').balance, by('comfy').monthSpendUsd], [21.1, Math.round(21.1 * 211), 2.5]);
    assert.deepEqual([by('replicate').connected, by('replicate').source, by('replicate').balance], [true, 'unavailable', undefined]); assert.ok(by('fal').fetchedAt);
    assert.equal(calls.length, 3, 'one read per provider with a balance API'); assert.ok(calls.every((c) => !/billing\/(top|pay|charge)|topup|checkout/i.test(c.url)), 'no top-up / payment endpoint');
    const host = (u: string) => new URL(u).host; const keyIn = (c: { headers: Record<string, string> }) => Object.values(c.headers).join(' ');
    assert.ok(calls.every((c) => (keyIn(c).includes('fal-test-key') ? host(c.url) === 'api.fal.ai' : true) && (keyIn(c).includes('bfl-test-key') ? host(c.url) === 'api.bfl.ai' : true) && (keyIn(c).includes('comfyui-test-key') ? host(c.url) === 'cloud.comfy.org' : true)), 'each key goes only to its own provider');
    assert.ok(!JSON.stringify(live).includes('test-key'), 'keys never in the response');
    await BL.accounts(); assert.equal(calls.length, 3, 'cached (5 min)');
    globalThis.fetch = (async () => new Response('denied', { status: 403 })) as any; const den = await BL.accounts(true); const f = den.find((x) => x.provider === 'fal')!;
    assert.equal(f.source, 'unavailable'); assert.match(f.note, /403/); assert.ok(!f.note.includes('fal-test-key'));
    ok('connected accounts: fal / BFL / Comfy read-only balance, Replicate unavailable, cached, 403 explained, keys never echoed');
  } finally { globalThis.fetch = real; Object.assign(process.env, { OPENHIGGSFIELD_FAL_KEY: '', OPENHIGGSFIELD_BFL_API_KEY: '', COMFY_API_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '' }); }
}
// ---- HTTP part ----
const PORT = testPort(9143); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_HOSTED: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => { const r = await fetch(B + u); return Object.assign((await r.json()) as any, { _status: r.status }); };
const submit = async (tool: string, extra: Record<string, string> = {}) => { const f = new FormData(); for (const [k, v] of Object.entries({ prompt: 'a calm lake', rights: '1', ...extra })) f.set(k, v);
  const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: f }); return { status: r.status, body: (await r.json()) as any }; };
const waitEnd = async (id: string) => { for (let i = 0; i < 80; i++) { const j = await get(`/api/jobs/${id}`); if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 250)); } throw new Error('job did not end'); };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const img = { provider: 'api-seedream', types: '["generate"]' };
  const a = await submit('create-image', img); const b = await submit('create-image', { ...img, allowFallback: '0' /* stay failed (D4 would move Auto on) */, simulateRouteFail: 'comfy-router:api-seedream' });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  const early = await get('/api/spend'); assert.ok(early.items.some((r: any) => r.jobId === a.body.id), 'recorded at submit');
  const ja = await waitEnd(a.body.id); const jb = await waitEnd(b.body.id); assert.equal(ja.status, 'done'); assert.equal(jb.status, 'failed');
  const s = await get('/api/spend'); assert.equal(s.total, 2); assert.equal(s.billingMode, 'own-accounts');
  const ra = s.items.find((r: any) => r.jobId === a.body.id); const rb = s.items.find((r: any) => r.jobId === b.body.id);
  for (const k of ['toolId', 'model', 'route', 'billedTo', 'estUsd', 'actualUsd', 'status', 'failureRule', 'createdAt']) assert.ok(k in ra, `field ${k}`);
  assert.deepEqual([ra.toolId, ra.model, ra.route, ra.billedTo, ra.status, ra.failureRule, ra.actualUsd], ['create-image', 'api-seedream', 'comfy-router:api-seedream', 'comfy', 'done', 'may-charge', null]);
  assert.equal(ra.estUsd, a.body.cost / 100); assert.equal(rb.status, 'failed'); assert.equal(rb.countedUsd, rb.estUsd, 'Comfy may charge a failed run: counted');
  ok('spend rows: written at submit, settled at the end (done / failed), actualUsd null when the provider reports none');
  assert.equal(s.items[0].createdAt >= s.items[1].createdAt, true, 'newest first');
  const p1 = await get('/api/spend?limit=1'); assert.equal(p1.items.length, 1); assert.ok(p1.nextCursor); const p2 = await get(`/api/spend?limit=1&cursor=${encodeURIComponent(p1.nextCursor)}`); assert.equal(p2.items.length, 1); assert.notEqual(p2.items[0].id, p1.items[0].id); assert.equal(p2.nextCursor, null);
  ok('cursor paging');
  assert.equal((await get('/api/spend?provider=fal')).total, 0); assert.equal((await get('/api/spend?provider=comfy')).total, 2); assert.equal((await get('/api/spend?tool=voice')).total, 0);
  assert.equal((await get(`/api/spend?from=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`)).total, 0); assert.equal((await get('/api/spend?from=nonsense'))._status, 400);
  // status filter (Spend page: the failed-runs warning opens All runs on failed runs that still count)
  assert.equal((await get('/api/spend?status=failed')).total, 1); assert.equal((await get('/api/spend?status=done')).total, 1); assert.equal((await get('/api/spend?status=failed&counted=1')).items[0].status, 'failed');
  { const ov = await get('/api/spend/overview?period=month'); assert.equal(Math.round((ov.totals.chargedUsd + ov.totals.estimatedUsd) * 1e4), Math.round(ov.totals.spentUsd * 1e4)); assert.ok(Array.isArray(ov.overQuotes)); }
  ok('filters: provider, tool, from (ISO); bad date → 400');
  const sd = await get('/api/spend/summary?period=day'); const c = sd.providers.find((x: any) => x.provider === 'comfy');
  assert.equal(c.runs, 2); assert.equal(c.estUsd, Math.round((ra.estUsd + rb.estUsd) * 10000) / 10000); assert.equal(c.actualUsd, null); assert.equal(sd.totals.runs, 2);
  assert.equal((await get('/api/spend/summary?period=month')).providers[0].runs, 2); assert.equal((await get('/api/spend/summary?period=year'))._status, 400);
  ok('summary per provider: runs, estimated vs actual, day and month');
  const acc = await get('/api/accounts'); assert.equal(acc.mockBackend, true); assert.ok(acc.accounts.every((x: any) => x.connected === false));
  ok('/api/accounts with no keys');
  console.log('ALL OK spend-log');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); fs.rmSync(DU, { recursive: true, force: true }); }
process.exit(0);
