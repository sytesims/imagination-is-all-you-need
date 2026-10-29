// Create Image history + spend, end to end (own mock server on :8951, temp data dir, no keys):
//  6  the page's grid loads this tool's past jobs from GET /api/jobs?toolId=create-image&cursor= (what useJobs({history:true}) calls):
//     done and failed jobs from any session, newest first, failed ones carrying status + error; other tools' jobs are not in it.
//  7  Create Image is the home of every image result: GET /api/jobs?features=* lists Create Image, Edit, Relight… (not video); ?features=relight narrows; unknown id → 400.
//  8  mock runs (sample output) never count as spend: after runs on a priced cloud route on the mock backend, GET /api/spend/summary?period=day
//     says $0, and every spend row is marked simulated.
// Run: npx tsx test/create-image-history.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(8951); const B = `http://localhost:${PORT}`; const ok = (m: string) => console.log('ok ' + m);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_COUNT_SIMULATED_SPEND: '' };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-hist-'));
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '200', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_USE_LOCAL: '0',
  OPENHIGGSFIELD_SEED_FEATURED: '0' /* the Examples project (2026-10-29) seeds ordinary jobs on a fresh install; this test counts only its own */ }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const job = async (tool: string, f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); const b = await r.json() as any; assert.equal(r.status, 200, JSON.stringify(b)); return b; };
const until = async (id: string) => { for (let i = 0; i < 200; i++) { const j = await get(`/api/jobs/${id}`); if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 500)); }
  const a = await job('create-image', { prompt: 'a red kite over hills', types: '["generate"]' }); await until(a.id);
  const f = await job('create-image', { prompt: 'a broken robot', types: '["generate"]', simulate: 'temporary' }); const fj = await until(f.id); assert.equal(fj.status, 'failed');
  const other = await job('soul', { prompt: 'portrait', types: '["generate"]' }).catch(() => null); if (other) await until(other.id);
  const c = await job('create-image', { prompt: 'a lighthouse at dusk', types: '["generate"]' }); await until(c.id);
  const page = await get('/api/jobs?toolId=create-image&limit=60&cursor=');
  const ids = page.items.map((j: any) => j.id); assert.deepEqual(ids, [c.id, f.id, a.id], 'this tool only, newest first, failed included');
  const fi = page.items.find((j: any) => j.id === f.id); assert.equal(fi.status, 'failed'); assert.ok(fi.error && /try again/i.test(fi.error), fi.error);
  ok('6: GET /api/jobs?toolId=create-image&cursor= lists done and failed runs, newest first, this tool only (the grid\'s history)');
  // 7: ?features=* = every image feature (the feed + reference picker), never a video job
  const PNG = fs.readFileSync(path.join(ROOT, 'samples/sample-keyframe.png'));
  const jobF = async (tool: string, f: Record<string, string>, files: string[]) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const k of files) fd.append(k, new Blob([PNG], { type: 'image/png' }), `${k}.png`);
    const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); const b = await r.json() as any; assert.equal(r.status, 200, JSON.stringify(b)); return b; };
  const ed = await jobF('create-image', { prompt: 'make it night', types: '["edit"]', provider: 'api-gpt-image', rights: '1' }, ['image']); await until(ed.id);
  const rl = await jobF('app-relight', { provider: 'api-nano-banana', direction: 'left', rights: '1' }, ['image']); await until(rl.id);
  const vid = await job('h3-video', { prompt: 'a paper boat drifting', types: '["t2v"]', provider: 'cloud-h3', seconds: '5' }); await until(vid.id);
  const all = await get('/api/jobs?features=*&limit=60&cursor='); const allIds = all.items.map((j: any) => j.id);
  for (const id of [c.id, f.id, a.id, ed.id, rl.id]) assert.ok(allIds.includes(id), `features=* has ${id}`);
  assert.ok(!allIds.includes(vid.id), 'no video job'); assert.ok(all.items.every((j: any) => j.feature && j.feature.id), 'every item carries its image feature');
  assert.deepEqual(allIds.slice(0, 2), [rl.id, ed.id], 'newest first');
  assert.equal(all.items.find((j: any) => j.id === ed.id).feature.id, 'edit-image'); assert.equal(all.items.find((j: any) => j.id === rl.id).feature.id, 'relight');
  assert.deepEqual((await get('/api/jobs?features=image&limit=60&cursor=')).items.map((j: any) => j.id), allIds, 'features=image = features=*');
  assert.deepEqual((await get('/api/jobs?features=relight&cursor=')).items.map((j: any) => j.id), [rl.id], 'one feature');
  assert.deepEqual((await get('/api/jobs?features=relight,edit-image&cursor=')).items.map((j: any) => j.id), [rl.id, ed.id], 'a list of features');
  const bad = await fetch(`${B}/api/jobs?features=nope`); assert.equal(bad.status, 400); assert.equal(((await bad.json()) as any).issues[0].field, 'features');
  assert.ok(Array.isArray(await get('/api/jobs?features=*')), 'no cursor: plain array as before');
  ok(`7: GET /api/jobs?features=* lists every image feature (Create Image, Edit, Relight), newest first, no video; ?features=<ids> narrows; unknown → 400`);
  // 8: a priced cloud route on the mock backend (mock keys make it 'configured') is a sample run: $0
  // the exact $0.08 case: Nano Banana 2 on comfy-router, priced ✦8, run by the MOCK backend
  const nb = await job('create-image', { prompt: 'a red kite over hills', types: '["generate"]', provider: 'api-nano-banana', route: 'comfy-router:api-nano-banana' });
  assert.equal(nb.route, 'comfy-router:api-nano-banana'); assert.ok(nb.cost > 0, `priced route (cost ${nb.cost})`); await until(nb.id);
  const sum = await get('/api/spend/summary?period=day'); assert.equal(sum.totals.spentUsd, 0, JSON.stringify(sum.totals));
  const rows = await get('/api/spend?limit=50'); const list = rows.items ?? rows; assert.ok(Array.isArray(list) && list.length >= 3, JSON.stringify(rows).slice(0, 300));
  assert.ok(list.every((r: any) => r.simulated === true || r.billedTo === 'local' || r.demo === true), JSON.stringify(list.map((r: any) => [r.id, r.billedTo, r.simulated, r.demo])));
  ok(`8: mock-backend runs never count as spend (Spend today $0${nb ? `, incl. ${nb.route} at ✦${nb.cost}` : ''}); every row is simulated, local or demo`);
  console.log('ALL OK create-image-history');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } }
