// Retries, "Try on <place>" and upscales must go through the submission spend guard.
//  S-01: a retry and a Try on write a Spend row with the estimate, like a submit (spending limits were removed 2026-10-28, so nothing blocks them).
//        An upscale writes a Spend row and goes through the same guard (today's upscale engine is local, $0).
//  S-02: Try on without remember leaves GET /api/me/routing unchanged; with remember:true it saves the place for that tool + model.
//  S-04: a retry / Try on is rerun 'retry' | 'try-on', not "enhanced" (job field, ?enhanced=1, /api/assets/counts); an upscale still is.
// Run: npx tsx test/rerun-spend-guard.e2e.ts (port 8797; temp data dir + env file, mock backend, mock keys, no network).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'rerunspend-')); const ok = (m: string) => console.log('ok ' + m);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '', OPENHIGGSFIELD_USE_LOCAL: '' };
const PORT = testPort(8797); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_SEED_FEATURED: '0' /* counts your own results only (no Examples project) */, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'),
  // MOCK_KEYS: Comfy + BFL count as set up (mock runs, nothing sent; fal / Replicate keys are never mocked). LOCAL_AVAILABLE + USE_LOCAL: Local is
  // ready, so a FLUX 3 Klein run that fails on it offers "Try on BFL" (a priced hosted place).
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_HOSTED: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const send = async (m: string, u: string, b: unknown) => { const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: (await r.json()) as any }; };
const submit = async (tool: string, extra: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries({ prompt: 'a calm lake', rights: '1', ...extra })) f.set(k, v);
  const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: f }); return { status: r.status, body: (await r.json()) as any }; };
const waitEnd = async (id: string) => { for (let i = 0; i < 200; i++) { const j = await get(`/api/jobs/${id}`); if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('job did not end ' + id); };
const list = async (u: string) => { const b = await get(u); return (Array.isArray(b) ? b : b.items ?? b.jobs ?? []) as any[]; };
const spendRows = async () => (await get('/api/spend?limit=200')).items as any[];
const IMG = { provider: 'api-seedream', types: '["generate"]', allowFallback: '0' /* stay failed on the quoted place (D4 would move a pre-selected place on) */ };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const q = await get('/api/tools/create-image/price?provider=api-seedream'); assert.ok(q.cost?.estUsd > 0, `a priced hosted route: ${JSON.stringify(q.cost)}`); assert.ok(q.route, 'quote names its route');
  /** A failed run on the quoted route (mock: simulateRouteFail), with its Try on offers. */
  const failedJob = async (f: Record<string, string> = IMG, route: string = q.route) => { const s = await submit('create-image', { ...f, simulateRouteFail: route }); assert.equal(s.status, 200, JSON.stringify(s.body)); const j = await waitEnd(s.body.id); assert.equal(j.status, 'failed'); return j; };
  // Pre-selection is Comfy → other API → Local (TRANSPARENCY-PLAN 4k 5b-1): with mock keys Klein would start on BFL, so pick Local as its Run on (saved choice)
  { const pin = await send('PUT', '/api/me/routing', { perModel: { 'comfy-flux3-klein': { route: 'local:comfy-flux3-klein' } } }); assert.equal(pin.status, 200, JSON.stringify(pin.body)); }
  const KLEIN = { provider: 'comfy-flux3-klein', types: '["generate"]' }; const qk = await get('/api/tools/create-image/price?provider=comfy-flux3-klein&types=generate');
  assert.equal(qk.runOn, 'local', `Klein runs locally here (saved choice): ${qk.route}`);

  // ---- S-01: plain retry ----
  const f1 = await failedJob();
  const r1 = await send('POST', `/api/jobs/${f1.id}/retry`, {}); assert.equal(r1.status, 200, JSON.stringify(r1.body)); assert.equal(r1.body.rerun, 'retry'); assert.ok(r1.body.estimate?.estUsd > 0);
  const row1 = (await spendRows()).find((r) => r.jobId === r1.body.id); assert.ok(row1, 'retry has a Spend row'); assert.ok(row1.estUsd > 0); assert.equal(row1.billedTo, q.cost.billedTo);
  const j1 = await waitEnd(r1.body.id); assert.equal(j1.status, 'done'); assert.equal(j1.rerun, 'retry'); assert.equal(j1.enhanced, false, 'S-04: a retry is not enhanced');
  ok(`retry: Spend row (${row1.billedTo}, est $${row1.estUsd}), job rerun:retry, enhanced:false`);

  // ---- S-01 + S-02: Try on ----
  const f2 = await failedJob(KLEIN, qk.route); const offer = (f2.tryOn ?? []).find((o: any) => !o.demo && o.runOn !== 'local'); assert.ok(offer, `a paid Try on offer: ${JSON.stringify(f2.tryOn)}`);
  const routing0 = await get('/api/me/routing');
  const t1 = await send('POST', `/api/jobs/${f2.id}/retry`, { runOn: offer.runOn }); assert.equal(t1.status, 200, JSON.stringify(t1.body)); assert.equal(t1.body.runOn, offer.runOn); assert.equal(t1.body.rerun, 'try-on'); assert.equal(t1.body.remembered, false);
  const row2 = (await spendRows()).find((r) => r.jobId === t1.body.id); assert.ok(row2, 'Try on has a Spend row'); assert.ok(row2.estUsd > 0); assert.notEqual(row2.billedTo, 'local');
  assert.deepEqual((await get('/api/me/routing')).perTool, routing0.perTool, 'S-02: Try on alone leaves the saved choices unchanged');
  const j2 = await waitEnd(t1.body.id); assert.equal(j2.rerun, 'try-on'); assert.equal(j2.enhanced, false);
  ok(`Try on ${offer.runOn}: Spend row (${row2.billedTo}, est $${row2.estUsd}); /api/me/routing unchanged; rerun:try-on, enhanced:false`);
  const f3 = await failedJob(KLEIN, qk.route); const t2 = await send('POST', `/api/jobs/${f3.id}/retry`, { runOn: offer.runOn, remember: true }); assert.equal(t2.status, 200, JSON.stringify(t2.body)); assert.equal(t2.body.remembered, true);
  const routing1 = await get('/api/me/routing'); assert.equal(routing1.perTool?.['create-image']?.[t2.body.modelKey]?.runOn, offer.runOn, `remember saves the choice: ${JSON.stringify(routing1.perTool)}`);
  ok(`Try on with remember:true saves create-image · ${t2.body.modelKey} → ${offer.runOn}`);
  await send('PUT', '/api/me/routing', { perTool: {} }); await waitEnd(t2.body.id);

  // ---- S-04: counts and filters ----
  const enhList = await list('/api/jobs?enhanced=1&limit=200'); assert.ok(enhList.length === 0 || enhList.every((x: any) => x.enhanced), 'filter works');
  assert.ok(!enhList.some((x: any) => [r1.body.id, t1.body.id, t2.body.id].includes(x.id)), 'retries are not in ?enhanced=1');
  const c0 = await get('/api/assets/counts'); assert.equal(c0.byMedia.enhanced, 0, `no enhanced asset yet: ${JSON.stringify(c0.byMedia)}`);
  ok('?enhanced=1 and /api/assets/counts leave retries and Try ons out');

  // ---- S-01: upscale ----
  const v = await submit('h3-video', { prompt: 'boat', types: '["t2v"]', draft: '1', provider: 'comfy-h3' /* a model with a draft mode (the Auto default, Seedance 2.5, has none) */ }); assert.equal(v.status, 200, JSON.stringify(v.body)); const vj = await waitEnd(v.body.id); assert.equal(vj.status, 'done');
  const u = await send('POST', `/api/jobs/${vj.id}/upscale`, {}); assert.equal(u.status, 200, `a local ($0) upscale runs: ${JSON.stringify(u.body)}`);
  const rowU = (await spendRows()).find((r) => r.jobId === u.body.id); assert.ok(rowU, 'upscale has a Spend row'); assert.equal(rowU.toolId, 'upscale'); assert.equal(rowU.billedTo, 'local'); assert.equal(rowU.estUsd, 0);
  const uj = await waitEnd(u.body.id); assert.equal(uj.enhanced, true, 'an upscale is still enhanced'); assert.ok(!uj.rerun);
  assert.equal((await get('/api/assets/counts')).byMedia.enhanced, 1, 'the upscale counts as Enhanced');
  ok(`upscale: through the guard, Spend row (${rowU.billedTo}, $${rowU.estUsd}), enhanced:true, counted once`);
  console.log('ALL OK rerun-spend-guard');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
