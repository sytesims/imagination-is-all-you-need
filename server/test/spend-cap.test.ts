// Monthly spend cap (spendCap.ts, off by default) and the Spend page tally (GET /api/spend/tally).
//  Unit: capVerdict under / exactly at / over the cap, cap off, a $0 cap, free runs never refused, the reset date; monthToDateUsd leaves out
//        local runs, never-sent runs and last month's runs.
//  HTTP: with a cap set, the quote says runnable:false (spend_cap) and a submit / retry past it gets 402 spend_cap with nothing charged;
//        a run under the cap goes; a free local run goes even past the cap; PUT validation; turning it off lets runs go again.
// Run: npx tsx test/spend-cap.test.ts (port 9694; temp data dirs, mock backend, mock keys, no network).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_COUNT_SIMULATED_SPEND = '1'; // mock runs count like real ones here (a real install never sets this)
const ROOT = path.resolve(import.meta.dirname, '..'); const ok = (m: string) => console.log('ok ' + m);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const DU = fs.mkdtempSync(path.join(os.tmpdir(), 'spendcap-unit-')); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'spendcap-'));
Object.assign(process.env, NOKEYS, { OPENHIGGSFIELD_DATA_DIR: DU, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '' });
let p: ReturnType<typeof spawn> | null = null;
try {
  // ---- unit ----
  const SC = await import('../src/spendCap.ts');
  const now = new Date(2026, 10, 20, 12); // 20 Nov 2026, local time
  assert.equal(SC.capVerdict({ capUsd: null, spentUsd: 999, runUsd: 5, now }).ok, true); ok('cap off: always runs');
  assert.equal(SC.capVerdict({ capUsd: 20, spentUsd: 10, runUsd: 5, now }).ok, true); ok('under the cap: runs');
  assert.equal(SC.capVerdict({ capUsd: 20, spentUsd: 15, runUsd: 5, now }).ok, true); assert.equal(SC.capVerdict({ capUsd: 0.3, spentUsd: 0.1, runUsd: 0.2, now }).ok, true, 'cent rounding, no float drift');
  ok('exactly at the cap: runs (0.1 + 0.2 = 0.3 too)');
  const over = SC.capVerdict({ capUsd: 20, spentUsd: 15.01, runUsd: 5, now }); assert.equal(over.ok, false);
  assert.match(over.message!, /past your \$20 monthly limit/); assert.match(over.message!, /December 1/); assert.match(over.message!, /Nothing was charged/); assert.equal(over.leftUsd, 4.99);
  ok(`over the cap: refused ("${over.message}")`);
  assert.equal(SC.capVerdict({ capUsd: 0, spentUsd: 0, runUsd: 0.01, now }).ok, false); assert.equal(SC.capVerdict({ capUsd: 0, spentUsd: 0, runUsd: 0, now }).ok, true);
  assert.equal(SC.capVerdict({ capUsd: 5, spentUsd: 50, runUsd: 0, now }).ok, true); ok('a $0 cap stops every paid run; free runs always go, even past the cap');
  assert.equal(SC.nextMonthStart(new Date(2026, 11, 31, 23, 59)).getTime(), new Date(2027, 0, 1).getTime()); ok('December resets on 1 January');
  assert.deepEqual(SC.saveSpendCap(-1).ok, false); assert.deepEqual(SC.saveSpendCap('abc').ok, false); assert.deepEqual(SC.saveSpendCap('12.345'), { ok: true, monthlyUsd: 12.35 }); assert.equal(SC.spendCapUsd(), 12.35);
  assert.deepEqual(SC.saveSpendCap(null), { ok: true, monthlyUsd: null }); assert.equal(SC.spendCapUsd(), null); ok('saveSpendCap: rejects negative / text, rounds to the cent, null turns it off');

  const BL = await import('../src/billing.ts'); const { jobs } = await import('../src/jobs.ts');
  const mk = (id: string, createdAt: number, route: string, credits: number, extra: any = {}) => { const j: any = { id, toolId: 'create-image', provider: 'api-seedream', status: 'queued', createdAt, route, input: {}, outputs: [], ...extra }; jobs.set(id, j); BL.recordSpend(j, credits);
    Object.assign(j, { status: extra.endStatus ?? 'done', startedAt: createdAt, finishedAt: createdAt + 1000, requestIds: ['r'] }); BL.settleSpend(j); };
  const t0 = new Date(2026, 10, 3).getTime(); const lastMonth = new Date(2026, 9, 31, 23, 59).getTime();
  mk('a1', t0, 'comfy-router:api-seedream', 300); mk('a2', t0 + 1, 'comfy-router:api-seedream', 150); mk('loc', t0 + 2, 'local:comfy-flux3-klein', 0); mk('old', lastMonth, 'comfy-router:api-seedream', 900);
  mk('nc', t0 + 3, 'comfy-router:api-seedream', 500, { endStatus: 'failed', reasonCode: 'cloud_credits', requestIds: [] });
  (jobs.get('nc') as any).requestIds = []; // never reached the provider
  const mtd = BL.monthToDateUsd(now); assert.equal(mtd, 4.5, `month to date ${mtd}`); assert.equal(BL.monthToDateUsd(now, 'a1'), 1.5);
  ok('month to date: $4.50 (local free, a never-sent failure and last month left out; one job can be excluded)');
  assert.equal(BL.monthToDateUsd(new Date(2026, 9, 31, 23, 59, 59)), 9, 'on 31 Oct only October counts');
  ok('month boundary: a run at 23:59 on 31 Oct counts in October, not November');
  fs.rmSync(DU, { recursive: true, force: true });

  // ---- HTTP ----
  const PORT = testPort(9694); const B = `http://localhost:${PORT}`;
  p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_SEED_FEATURED: '0',
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_HOSTED: '' }, stdio: 'ignore', detached: true });
  const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
  const send = async (m: string, u: string, b: unknown) => { const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: (await r.json()) as any }; };
  const submit = async (extra: Record<string, string> = {}) => { const f = new FormData(); for (const [k, v] of Object.entries({ prompt: 'a calm lake', provider: 'api-seedream', types: '["generate"]', rights: '1', ...extra })) f.set(k, v);
    const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: f }); return { status: r.status, body: (await r.json()) as any }; };
  const waitEnd = async (id: string) => { for (let i = 0; i < 200; i++) { const j = await get(`/api/jobs/${id}`); if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('job did not end'); };
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const Q = '/api/tools/create-image/price?provider=api-seedream';
  const q0 = await get(Q); const price = q0.cost.estUsd; assert.ok(price > 0, JSON.stringify(q0.cost)); assert.equal(q0.spendCap, undefined, 'no cap info while off');
  const t0h = await get('/api/spend/tally'); assert.equal(t0h.cap.monthlyUsd, null); assert.equal(t0h.thisMonth.spentUsd, 0); assert.deepEqual(t0h.projects, []); ok('tally with no spend: $0, no projects, cap off');
  assert.equal((await send('PUT', '/api/settings/spend-cap', { monthlyUsd: -5 })).status, 400); ok('PUT a negative limit: 400');
  // one paid run in a project
  const pr = await send('POST', '/api/projects', { name: 'Client ads' }); const pid = pr.body?.id ?? pr.body?.project?.id;
  const s1 = await submit(pid ? { projectId: pid } : {}); assert.equal(s1.status, 200, JSON.stringify(s1.body)); await waitEnd(s1.body.id);
  const t1 = await get('/api/spend/tally'); assert.equal(t1.thisMonth.spentUsd, price); assert.equal(t1.thisMonth.paidRuns, 1);
  if (pid) assert.equal(t1.projects.find((x: any) => x.projectId === pid)?.thisMonthUsd, price, JSON.stringify(t1.projects));
  ok(`one paid run ($${price}) shows in this month${pid ? ' and under its project' : ''}`);
  // a failed run to retry later (mock: the quoted route fails; allowFallback 0 keeps it failed)
  const sf = await submit({ simulateRouteFail: q0.route, allowFallback: '0' }); assert.equal(sf.status, 200, JSON.stringify(sf.body)); assert.equal((await waitEnd(sf.body.id)).status, 'failed');
  const spent = (await get('/api/spend/tally')).thisMonth.spentUsd; ok(`a failed run counts as the ledger already does (Comfy may bill failures): month now $${spent}`);
  // a cap that the next run would cross
  const cap = Math.round((spent + price * 0.5) * 100) / 100; const put = await send('PUT', '/api/settings/spend-cap', { monthlyUsd: cap }); assert.equal(put.status, 200); assert.equal(put.body.cap.monthlyUsd, cap);
  const q1 = await get(Q); assert.equal(q1.runnable, false); assert.equal(q1.blockedCode, 'spend_cap'); assert.match(q1.blockedReason, /monthly limit/); assert.equal(q1.spendCap.monthlyUsd, cap);
  ok('quote past the cap: runnable:false, blockedCode spend_cap, the sentence for the Generate bar');
  const rowsBefore = (await get('/api/spend?limit=200')).total;
  const s2 = await submit(); assert.equal(s2.status, 402, JSON.stringify(s2.body)); assert.equal(s2.body.code, 'spend_cap'); assert.equal(s2.body.charged, false); assert.match(s2.body.error, /past your \$[\d.]+ monthly limit/);
  const rt = await send('POST', `/api/jobs/${sf.body.id}/retry`, {}); assert.equal(rt.status, 402, JSON.stringify(rt.body)); assert.equal(rt.body.code, 'spend_cap');
  assert.equal((await get('/api/spend?limit=200')).total, rowsBefore, 'nothing written to the Spend log');
  ok('submit and retry past the cap: 402 spend_cap, nothing charged, no Spend row');
  const loc = await submit({ provider: 'comfy-flux3-klein', runOn: 'local' }); assert.equal(loc.status, 200, JSON.stringify(loc.body)); await waitEnd(loc.body.id);
  ok('a free local run still goes past the cap');
  const raise = await send('PUT', '/api/settings/spend-cap', { monthlyUsd: Math.round((spent + price) * 100) / 100 }); assert.equal(raise.status, 200);
  const s3 = await submit(); assert.equal(s3.status, 200, `exactly at the cap runs: ${JSON.stringify(s3.body)}`); await waitEnd(s3.body.id);
  const s4 = await submit(); assert.equal(s4.status, 402); ok('raised to exactly one more run: it runs (exactly at the cap), the next is refused');
  await send('PUT', '/api/settings/spend-cap', { monthlyUsd: null }); const q2 = await get(Q); assert.equal(q2.runnable, true); assert.equal(q2.spendCap, undefined);
  const s5 = await submit(); assert.equal(s5.status, 200); ok('cap off again: runs go');
  console.log('ALL OK spend-cap');
} finally { if (p) try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); fs.rmSync(DU, { recursive: true, force: true }); }
