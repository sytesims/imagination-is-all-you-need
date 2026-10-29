// Shared progress + live preview + queue activity, end to end on the MOCK backend (own server on :8962, temp data dir, no keys, nothing leaves the machine):
//  1. a Local (local) Create Image job's progressInfo moves queued → loading → generating (step/steps) → finishing → done, source 'mock',
//     on GET /api/jobs/:id and on the active list (GET /api/jobs?state=active); a second job waits with queuePosition 1 (concurrency 1);
//  2. GET /api/queue/activity lists the running and the waiting job (title, model, place, price, progress, queuePosition);
//  3. GET /api/jobs/:id/preview: 404 for a hosted sample job and for a local mock job with no frame; a frame injected through the mock-only
//     dev hook is served (image, no-store) and shows up as progressInfo.previewUrl; 404 again once the job ends.
// Run: npx tsx test/progress-preview.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = Number(process.env.PROGRESS_PORT) || testPort(8962); const B = `http://localhost:${PORT}`; const ok = (m: string) => console.log('ok ' + m);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ohf-progress-'));
if (await fetch(`${B}/api/health`).then(() => true, () => false)) throw new Error(`:${PORT} is in use; set PROGRESS_PORT`);
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '4000', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_CONCURRENCY: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0',
  OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json') }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const job = async (f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', types: '["generate"]', ...f })) fd.append(k, v);
  const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); const b = await r.json() as any; assert.equal(r.status, 200, JSON.stringify(b)); return b; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 9), Buffer.from([0xff, 0xd9])]);
try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* booting */ } await sleep(500); }
  const a = await job({ prompt: 'a paper boat on a puddle, morning light', model: 'flux-2-klein-4b', runOn: 'local' });
  const b = await job({ prompt: 'a lighthouse at dusk', model: 'flux-2-klein-4b', runOn: 'local' });
  assert.match(String(a.route), /^local:/, `runs locally (${a.route})`);
  // 2. queue activity while a runs and b waits
  let act: any = null; for (let i = 0; i < 40; i++) { act = await get('/api/queue/activity'); if (act.running === 1) break; await sleep(100); }
  const bq = await get(`/api/jobs/${b.id}`); assert.equal(bq.status, 'queued'); assert.deepEqual({ ...bq.progressInfo, queueReason: undefined }, { stage: 'queued', queuePosition: 1, source: 'mock', queueReason: undefined }); assert.match(bq.progressInfo.queueReason, /^Waiting for your (Mac|computer)/); // 2026-10-25: the lane's plain reason
  assert.equal(act.running, 1); assert.equal(act.waiting, 1); assert.equal(act.concurrency, 11); assert.equal(act.lanes.local.limit, 1); /* 2026-10-25: CONCURRENCY=1 sets the local lane; concurrency = local 1 + cloud 10 */ assert.equal(typeof act.maxQueued, 'number');
  const [ra, wb] = act.items; assert.equal(ra.id, a.id); assert.equal(ra.state, 'running'); assert.equal(wb.id, b.id); assert.equal(wb.state, 'waiting'); assert.equal(wb.queuePosition, 1); assert.equal(ra.queuePosition, null);
  assert.equal(ra.title, 'a paper boat on a puddle, morning light'); assert.match(ra.model, /Klein/i); assert.equal(ra.place.runOn, 'local'); assert.equal(ra.price.free, true); assert.equal(ra.price.usd, 0); assert.equal(ra.price.sample, true);
  assert.equal(ra.progress.source, 'mock'); assert.equal(wb.progress.stage, 'queued'); assert.ok(JSON.stringify(act).length < 4000, 'compact');
  ok(`queue activity: running ${act.running} (${ra.progress.stage}) · waiting ${act.waiting} (#${wb.queuePosition}); title, model "${ra.model}", place "${ra.place.label}", price free`);
  // 3a. preview: 404 before any frame
  { const r = await fetch(`${B}/api/jobs/${a.id}/preview`); assert.equal(r.status, 404); assert.equal(r.headers.get('cache-control'), 'no-store'); assert.equal((await r.json() as any).code, 'no_preview'); }
  // 1. stages of a (and the active list carries the same object)
  const seen: string[] = []; const steps = new Set<number>(); let injected = false; let activeChecked = false;
  for (let i = 0; i < 200; i++) {
    const j = await get(`/api/jobs/${a.id}`); const pi = j.progressInfo; if (seen.at(-1) !== pi.stage) seen.push(pi.stage);
    if (pi.stage === 'generating') { assert.ok(pi.steps >= 1, 'simulated step count'); assert.ok(pi.step >= 1 && pi.step <= pi.steps); steps.add(pi.step); assert.equal(typeof pi.percent, 'number'); assert.equal(pi.source, 'mock');
      if (!activeChecked) { const list = await get('/api/jobs?state=active'); const la = list.find((x: any) => x.id === a.id); assert.ok(la?.progressInfo?.stage, 'active list has progressInfo'); assert.equal(typeof la.progress, 'number', 'progress stays a number'); activeChecked = true; }
      if (!injected) { // 3b. inject a frame (mock-only dev hook) → served + linked
        const r = await fetch(`${B}/api/dev/jobs/${a.id}/preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ b64: JPG.toString('base64') }) }); assert.equal(r.status, 200); assert.equal((await r.json() as any).kept, true);
        const pv = await fetch(`${B}/api/jobs/${a.id}/preview`); assert.equal(pv.status, 200); assert.equal(pv.headers.get('content-type'), 'image/jpeg'); assert.equal(pv.headers.get('cache-control'), 'no-store');
        assert.ok(Buffer.from(await pv.arrayBuffer()).equals(JPG)); const j2 = await get(`/api/jobs/${a.id}`); assert.match(j2.progressInfo.previewUrl, new RegExp(`^/api/jobs/${a.id}/preview\\?at=\\d+$`)); assert.equal(typeof j2.progressInfo.previewAt, 'number');
        const bad = await fetch(`${B}/api/dev/jobs/${a.id}/preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ b64: Buffer.from('hello').toString('base64') }) }); assert.equal(bad.status, 400);
        injected = true; } }
    if (j.status === 'done') break; await sleep(100);
  }
  assert.deepEqual(seen, ['loading', 'generating', 'finishing', 'done'], seen.join(' → ')); assert.ok(steps.size >= 2, `several steps seen (${[...steps]})`); assert.ok(injected && activeChecked);
  ok(`local mock job: ${seen.join(' → ')} with steps ${[...steps].join(',')} (simulated, source mock); the active list carries progressInfo and keeps progress a number`);
  { const r = await fetch(`${B}/api/jobs/${a.id}/preview`); assert.equal(r.status, 404, 'frame dropped when the job ended'); assert.equal((await get(`/api/jobs/${a.id}`)).progressInfo.previewUrl, undefined); }
  ok('preview: 404 before a frame, injected frame served as image/jpeg no-store + progressInfo.previewUrl, 400 for non-images, 404 after the job ended');
  // b now runs; a hosted sample job (fal, no key) queues behind it: status-only stages, preview 404
  const h = await job({ prompt: 'a red kite over hills', model: 'qwen-image', runOn: 'fal' }); assert.match(String(h.route), /^fal:/, h.route);
  const seenH: string[] = []; for (let i = 0; i < 300; i++) { const j = await get(`/api/jobs/${h.id}`); const pi = j.progressInfo; if (seenH.at(-1) !== pi.stage) seenH.push(pi.stage);
    if (j.status === 'running') { assert.equal(pi.step, undefined, 'hosted: no steps'); assert.equal(pi.source, 'mock'); const r = await fetch(`${B}/api/jobs/${h.id}/preview`); assert.equal(r.status, 404); }
    if (j.status === 'done') break; await sleep(100); }
  assert.equal(seenH[0], 'queued'); assert.equal(seenH.at(-1), 'done'); assert.ok(seenH.includes('generating'), seenH.join(' → ')); assert.ok(!seenH.includes('loading'), 'a hosted place never shows loading');
  assert.equal((await fetch(`${B}/api/jobs/${h.id}/preview`)).status, 404); assert.equal((await fetch(`${B}/api/jobs/nope/preview`)).status, 404);
  ok(`hosted sample (fal, no key): ${seenH.join(' → ')}, no steps, preview 404`);
  const idle = await get('/api/queue/activity'); assert.equal(idle.running + idle.waiting, 0); assert.deepEqual(idle.items, []);
  ok('queue activity empty when idle');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } }
process.exit(0);
