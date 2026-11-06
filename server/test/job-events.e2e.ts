// Job events through ctx.jobs (plan §3.5, Phase 4: services/jobEvents.ts, emitted by queue.ts and routing/run.ts).
//  - job/created, job/progress, job/settled fire for a run; job/attempt-failed for a failed attempt; settled and attempt-failed carry `cost`
//    (what the place reported: information only, null when nothing was reported).
//  - Listeners only watch: one that changes its copy of the job and one that throws change nothing: the same job, ledger charge and refund,
//    and Spend row as the quote says (team mode, so the ledger is charged).
//  - reportedCostOf: attempts' reported costs add up; else the provider figure; else null.
// Run: npx tsx test/job-events.e2e.ts (the real server in this process on its own port; temp data dir, mock backend, placeholder fal key,
// nothing is sent anywhere).
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { testPort } from './_ports.js';
const ok = (m: string) => console.log('ok ' + m);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-events-')); const PORT = testPort(9486); const B = `http://127.0.0.1:${PORT}`;
Object.assign(process.env, { OPENHIGGSFIELD_PROFILE: '', OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DATA_DIR: path.join(dir, 'data'), OPENHIGGSFIELD_ENV_FILE: path.join(dir, 'none.env'),
  OPENHIGGSFIELD_FILMING_FILE: path.join(dir, 'no-filming.json'), OPENHIGGSFIELD_COMFY_DETECT_URLS: 'http://127.0.0.1:9', OPENHIGGSFIELD_DEMO_AUTO: '0', OPENHIGGSFIELD_MOCK_KEYS: '1',
  OPENHIGGSFIELD_FAL_KEY: 'fake-fal-job-events', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_SEED_FEATURED: '0', OPENHIGGSFIELD_BILLING_MODE: 'team', OPENHIGGSFIELD_HOSTED: '', PORT: String(PORT) });

{ const { reportedCostOf } = await import('../src/services/jobEvents.js');
  assert.equal(reportedCostOf({ routeAttempts: [] }), null);
  assert.deepEqual(reportedCostOf({ routeAttempts: [{ n: 1, routeId: 'a', reportedCost: { usd: 0.01, source: 'provider' } }, { n: 2, routeId: 'b', reportedCost: { usd: 0.02, source: 'estimate' } }] as any }),
    { usd: 0.03, source: 'estimate', attempts: [{ n: 1, routeId: 'a', usd: 0.01, source: 'provider' }, { n: 2, routeId: 'b', usd: 0.02, source: 'estimate' }] });
  assert.deepEqual(reportedCostOf({ routeAttempts: [], actualCost: { usd: 0.04, source: 'provider' } }), { usd: 0.04, source: 'provider', attempts: [] });
  ok('reportedCostOf: attempts add up, else the provider figure, else null'); }

const { boot } = await import('../src/boot.js'); const ctx: any = await boot();
const seen: { e: string; id: string; info?: any }[] = [];
for (const e of ['job/created', 'job/progress', 'job/attempt-failed', 'job/settled'] as const)
  ctx.jobs.on(e, (job: any, info?: any, more?: any) => { seen.push({ e, id: job.id, info: e === 'job/attempt-failed' ? more : info }); job.cost = 999; job.status = 'failed'; if (job.routeAttempts) job.routeAttempts.length = 0; });
ctx.jobs.on('job/settled', () => { throw new Error('a listener that throws'); });

const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const submit = async (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries({ prompt: 'a calm lake', rights: '1', types: '["generate"]', ...fields })) f.set(k, v);
  const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: f }); return { status: r.status, body: (await r.json()) as any }; };
const waitEnd = async (id: string) => { for (let i = 0; i < 300; i++) { const j = await get(`/api/jobs/${id}`); if (!['queued', 'running'].includes(j.status)) { await new Promise((r) => setTimeout(r, 200)); return get(`/api/jobs/${id}`); } await new Promise((r) => setTimeout(r, 50)); } throw new Error('no end'); };
const ledgerOf = async (id: string) => ((await get('/api/ledger')).entries as any[]).filter((e) => String(e.jobId).startsWith(id)).map((e) => [e.kind, e.amount]).sort();

try {
  const s = await submit({ provider: 'api-flux2', route: 'fal:fal-ai/flux-2-pro' }); assert.equal(s.status, 200, JSON.stringify(s.body)); const id = s.body.id;
  const j = await waitEnd(id); assert.equal(j.status, 'done'); assert.equal(j.cost, 3); assert.equal(j.routeAttempts.length, 1);
  assert.deepEqual(await ledgerOf(id), [['charge', -3]]); const row = (await get('/api/spend?limit=50')).items.find((r: any) => r.jobId === id); assert.equal(row.estUsd, 0.03); assert.equal(row.status, 'done');
  const mine = seen.filter((x) => x.id === id).map((x) => x.e);
  assert.equal(mine[0], 'job/created'); assert.ok(mine.includes('job/progress')); assert.equal(mine.at(-1), 'job/settled');
  const st = seen.find((x) => x.id === id && x.e === 'job/settled')!; assert.equal(st.info.status, 'done'); assert.ok('cost' in st.info, 'settled carries cost (what the place reported)');
  ok(`a run: ${mine.join(' → ')}; listeners that change their copy or throw change nothing (job done, cost 3, one charge of 3, Spend row $0.03)`);

  const f = await submit({ provider: 'api-flux2', route: 'fal:fal-ai/flux-2-pro', simulateRouteFail: 'fal:fal-ai/flux-2-pro' }); const fid = f.body.id;
  const fj = await waitEnd(fid); assert.equal(fj.status, 'failed'); assert.equal(fj.routeAttempts[0].refunded, 3);
  assert.deepEqual(await ledgerOf(fid), [['charge', -3], ['refund', 3]]);
  const af = seen.find((x) => x.id === fid && x.e === 'job/attempt-failed'); assert.ok(af, 'attempt-failed fired'); assert.equal(af!.info.notCharged, true); assert.equal(af!.info.cost, null);
  assert.equal(seen.filter((x) => x.id === fid).at(-1)!.e, 'job/settled');
  ok('a failed attempt: job/attempt-failed (notCharged, cost null) then job/settled; the charge and its refund are unchanged');
} finally {
  const { mounted } = await import('../src/kernel/index.js'); await mounted.filter((m) => m.name === 'legacy').at(-1)?.fiber.dispose();
  fs.rmSync(dir, { recursive: true, force: true });
}
process.exit(0);
