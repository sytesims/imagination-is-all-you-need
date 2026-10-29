// Step-ETA learning for local ComfyUI runs (stepEta.ts, Oct 21 2026). Against a tiny fake ComfyUI (HTTP + websocket) on a spare port, never a
// real one; mock backend, temp data dir, no keys. Recording on the mock backend is opted in only where a check says so (OPENHIGGSFIELD_ETA_LEARN_MOCK).
//  a  graph features: Qwen Image 2.1 1024² → 25 steps, cfg 1, 3 model files; the quote and the run get the same workflow key
//  b  first run → first_run (no number, calibrating); a published figure for the GPU class → 'reported' range
//  c  a timed run through runNative (fake ComfyUI) → the quote shows a learned range; the job notes calibrating, then the next one doesn't
//  d  cold vs warm load (execution_cached loaders / same model within WARM_MS)
//  e  running job: before the first step the learned estimate counts down (job.eta set during loading)
//  f  scaling to another step count and size (source scaled, wider range); cfg > 1 doubles the step cost
//  g  outliers dropped; the range narrows as runs add up
//  h  mock runs are never recorded (mock backend without the opt-in, demo / simulated jobs, the mock pipeline)
//  i  reset (DELETE /api/eta/learned → resetLearned) clears the step timings too; old eta_samples rows are left alone until then
// Run: npx tsx test/step-eta.test.ts (needs ffmpeg on PATH)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http'; import { execFileSync } from 'node:child_process';
import { WebSocketServer } from 'ws';
const ok = (m: string) => console.log('ok ' + m);
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'step-eta-'));
const PNG = path.join(D, 'src.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x3366cc:s=32x32', '-frames:v', '1', PNG]);

// ---- fake ComfyUI ----
type RunCfg = { loadMs: number; stepMs: number; postMs: number; cached: boolean; onLoading?: () => void };
let cfg: RunCfg = { loadMs: 1200, stepMs: 40, postMs: 150, cached: false }; const history: Record<string, any> = {}; const prompts: any[] = [];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const srv = http.createServer((req, res) => {
  const u = new URL(req.url!, 'http://x'); const json = (v: any) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(v)); };
  if (u.pathname === '/prompt' && req.method === 'POST') { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { const pid = 'p-' + Math.random().toString(36).slice(2, 8); const g = JSON.parse(b).prompt; prompts.push(g); json({ prompt_id: pid }); void play(g, pid, cfg); }); return; }
  if (u.pathname.startsWith('/history/')) { const id = decodeURIComponent(u.pathname.slice(9)); return json(history[id] ? { [id]: history[id] } : {}); }
  if (u.pathname === '/queue') return json({ queue_running: [], queue_pending: [] });
  if (u.pathname === '/view') { res.setHeader('content-type', 'image/png'); return res.end(fs.readFileSync(PNG)); }
  if (u.pathname === '/upload/image') { req.resume(); req.on('end', () => json({ name: 'up.png' })); return; }
  res.statusCode = 404; res.end('{}');
});
const wss = new WebSocketServer({ server: srv }); const send = (m: any) => { for (const c of wss.clients) c.send(JSON.stringify(m)); };
async function play(g: Record<string, any>, pid: string, c: RunCfg) {
  const ids = Object.keys(g); const loaders = ids.filter((id) => /Loader/.test(g[id].class_type)); const sampler = ids.find((id) => /^KSampler/.test(g[id].class_type))!;
  const out = ids.find((id) => /^SaveImage/.test(g[id].class_type))!; const steps = Number(g[sampler].inputs.steps) || 8;
  await wait(30); send({ type: 'execution_start', data: { prompt_id: pid } });
  if (c.cached) send({ type: 'execution_cached', data: { nodes: loaders, prompt_id: pid } });
  for (const id of c.cached ? [] : loaders) send({ type: 'executing', data: { node: id, prompt_id: pid } });
  await wait(c.loadMs / 2); c.onLoading?.(); await wait(c.loadMs / 2);
  send({ type: 'executing', data: { node: sampler, prompt_id: pid } });
  for (let s = 1; s <= steps; s++) { send({ type: 'progress', data: { node: sampler, value: s, max: steps, prompt_id: pid } }); if (s < steps) await wait(c.stepMs); }
  send({ type: 'executing', data: { node: out, prompt_id: pid } }); await wait(c.postMs);
  history[pid] = { status: { completed: true, status_str: 'success' }, outputs: { [out]: { images: [{ filename: 'o.png', subfolder: '', type: 'output' }] } } };
  send({ type: 'executing', data: { node: null, prompt_id: pid } });
}
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r())); const BASE = `http://127.0.0.1:${(srv.address() as any).port}`;
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '', COMFY_API_KEY: '', COMFY_BASE_URL: BASE, OPENHIGGSFIELD_COMFY_BASE_URL: BASE });
delete process.env.OPENHIGGSFIELD_ETA_LEARN_MOCK;

const S = await import('../src/stepEta.ts'); await S.ready();
const L = await import('../src/etaLearn.ts'); const R = await import('../src/hardware/requirements.ts'); const { getTool } = await import('../src/tools/registry.ts');
const { runNative } = await import('../src/comfy/runNative.ts'); const { hwKeyOf } = await import('../src/hardware.ts'); const { put, all } = await import('../src/db.ts');
const tool = getTool('create-image')!; const HK = hwKeyOf(); // (the probe may refine the key later: checks that compare with runs call hwKeyOf() again)
const QWEN = { imageResolution: '1K', aspect: '1:1', n: 1 };
const job = (id: string, provider: string, input: Record<string, any>, extra: any = {}): any => ({ id, toolId: 'create-image', provider, status: 'running', stage: 'generating', progress: 0, queuePos: 0, eta: 0, resultUrl: null, outputs: [], error: null, errorType: null, warnings: [], createdAt: Date.now(), startedAt: Date.now(), input: { prompt: 'a lighthouse', ...input }, cost: 0, refunded: 0, route: `local:${provider}`, ...extra });

// ---- a ----
{
  const f = S.jobFeatures('create-image', 'comfy-qwen21', QWEN)!; assert.ok(f, 'features from the plan');
  assert.equal(f.steps, 25); assert.equal(f.cfg2, false); assert.equal(f.pixels, 1024 * 1024); assert.equal(f.batch, 1); assert.equal(f.models.length, 3); assert.deepEqual(f.workflows, ['create-image-qwen21-t2i-api.json']);
  const f2 = S.jobFeatures('create-image', 'comfy-qwen21', { ...QWEN, n: 2, imageResolution: '2K' })!; assert.equal(S.keysOf(f2).baseKey, S.keysOf(f).baseKey, 'same workflow + models → same base key'); assert.notEqual(S.keysOf(f2).key, S.keysOf(f).key, 'settings differ');
  assert.equal(f2.batch, 2); assert.ok(S.keysOf(f2).units > S.keysOf(f).units * 2, 'units = MP × frames × batch');
  const v = S.applyGgufVariant({ 1: { class_type: 'UNETLoader', inputs: { unet_name: 'a.safetensors', weight_dtype: 'default' } } }, { loader: 'gguf', dropIn: true, replaces: 'a.safetensors', file: 'a-Q4.gguf' });
  assert.deepEqual(S.graphFeatures(v).models, ['a-Q4.gguf'], 'a GGUF variant changes the model files (and the key)');
  ok('a: Qwen Image 2.1 1024² → 25 steps, cfg 1, 3 model files; size / batch change the key, not the base key; GGUF variant swaps the file');
}
// ---- b ----
{
  const fit = R.fitFor(tool, 'comfy-qwen21', QWEN); assert.equal(fit.etaRange.source, 'first_run'); assert.equal(fit.etaRange.seconds, null); assert.equal(fit.etaRange.low, null); assert.equal(fit.etaRange.calibrating, true);
  assert.equal(fit.etaSeconds, null, 'no made-up number on a first run');
  const rep = S.estimateFor(S.jobFeatures('create-image', 'comfy-qwen21', QWEN), HK, { reportedSeconds: 300 }); assert.equal(rep.source, 'reported'); assert.equal(rep.low, 210); assert.equal(rep.high, 420); assert.equal(rep.includesLoad, null); assert.equal(rep.calibrating, true);
  ok('b: first run → first_run (seconds/low/high null, calibrating, fit.etaSeconds null); a published GPU-class figure → reported 0.7–1.4×');
}
// ---- h (part 1): mock backend without the opt-in never records, even through a real native run ----
{
  const j = job('mock-run', 'comfy-zimage-turbo', QWEN); cfg = { loadMs: 200, stepMs: 20, postMs: 50, cached: false };
  await runNative(j); assert.equal(j.status, 'done', String(j.error)); assert.equal(S.stepRows().length, 0, 'mock backend: nothing recorded'); assert.equal(j.etaTimed, undefined);
  assert.equal(j.calibrating, true, 'the run notes it would be calibrating'); assert.equal(j.etaRange.source, 'first_run');
}
process.env.OPENHIGGSFIELD_ETA_LEARN_MOCK = '1'; // tests only: let the fake-ComfyUI runs below record
// ---- c + d + e ----
let coldLoad = 0;
{
  process.env.OPENHIGGSFIELD_ETA_WARM_MS = '-1'; // nothing counts as warm: a cold first run ('1' still counted a quote taken in the same millisecond as warm)
  const j1 = job('cal-1', 'comfy-qwen21', QWEN); let atLoad1: any = null; cfg = { loadMs: 1200, stepMs: 40, postMs: 150, cached: false, onLoading: () => { atLoad1 = { eta: j1.eta, src: j1.etaRange?.source, cal: j1.calibrating }; } };
  await runNative(j1); assert.equal(j1.status, 'done', String(j1.error));
  assert.equal(atLoad1.cal, true, 'first run is calibrating'); assert.equal(atLoad1.src, 'first_run'); assert.equal(atLoad1.eta, 0, 'no made-up ETA while the first run loads');
  const r1 = S.stepRows().find((r) => r.id === 'cal-1')!; assert.ok(r1, 'recorded'); assert.equal(r1.steps, 25); assert.equal(r1.loadKind, 'cold');
  assert.ok(r1.loadSec >= 1.0 && r1.loadSec < 2.5, `load ≈ 1.2 s: ${r1.loadSec}`); assert.ok(r1.sampleSec >= 0.8 && r1.sampleSec < 2.5, `24 × 40 ms ≈ 0.96 s: ${r1.sampleSec}`); assert.ok(r1.postSec >= 0.1, `post ${r1.postSec}`);
  assert.equal(j1.etaTimed.loadKind, 'cold'); coldLoad = r1.loadSec;
  // the quote (fitFor, same key as the run) now shows a learned range including the cold load
  const q = R.fitFor(tool, 'comfy-qwen21', QWEN).etaRange; assert.equal(q.source, 'learned'); assert.equal(q.samples, 1); assert.equal(q.includesLoad, 'cold'); assert.equal(q.calibrating, false);
  assert.ok(q.low! <= q.seconds! && q.seconds! <= q.high!, JSON.stringify(q)); assert.equal(q.steps, 25); assert.ok(Math.abs(q.loadSec! - coldLoad) < 0.11);
  ok(`c: first run times itself (load ${r1.loadSec}s cold, ${r1.sampleSec}s for 25 steps, post ${r1.postSec}s); the quote then shows learned ${q.low}–${q.high}s incl. cold load`);
  // second run right after: ComfyUI reports the loaders cached → warm; while it loads, the learned estimate counts down
  process.env.OPENHIGGSFIELD_ETA_WARM_MS = String(10 * 60_000);
  const j2 = job('cal-2', 'comfy-qwen21', QWEN); let atLoad2: any = null; cfg = { loadMs: 100, stepMs: 40, postMs: 150, cached: true, onLoading: () => { atLoad2 = { eta: j2.eta, src: j2.etaRange?.source, cal: j2.calibrating, inc: j2.etaRange?.includesLoad }; } };
  await runNative(j2); assert.equal(j2.status, 'done');
  assert.equal(atLoad2.cal, false); assert.equal(atLoad2.src, 'learned'); assert.equal(atLoad2.inc, 'warm', 'the same model ran a moment ago → warm'); assert.ok(atLoad2.eta >= 1, `eta during loading: ${atLoad2.eta}`);
  const r2 = S.stepRows().find((r) => r.id === 'cal-2')!; assert.equal(r2.loadKind, 'warm', 'execution_cached loaders → warm'); assert.ok(r2.loadSec < 0.6, `warm load ${r2.loadSec}`);
  ok(`e: during loading the running job shows the learned estimate (eta ${atLoad2.eta}s, includesLoad warm, not calibrating)`);
  const warm = R.fitFor(tool, 'comfy-qwen21', QWEN).etaRange; assert.equal(warm.includesLoad, 'warm'); assert.ok(warm.loadSec! < 0.6, `warm load used: ${warm.loadSec}`);
  process.env.OPENHIGGSFIELD_ETA_WARM_MS = '1'; await wait(5); const cold = R.fitFor(tool, 'comfy-qwen21', QWEN).etaRange; assert.equal(cold.includesLoad, 'cold'); assert.ok(Math.abs(cold.loadSec! - coldLoad) < 0.11, `cold load used: ${cold.loadSec}`);
  ok(`d: cold vs warm: loaders cached → warm row; the estimate uses warm load ${warm.loadSec}s right after a run of the same model, cold ${cold.loadSec}s otherwise`);
  // a different model is not warm even right after
  process.env.OPENHIGGSFIELD_ETA_WARM_MS = String(10 * 60_000); S.noteLoaded(hwKeyOf(), 'other-model');
  assert.equal(R.fitFor(tool, 'comfy-qwen21', QWEN).etaRange.includesLoad, 'cold', 'another model loaded since → cold');
}
// ---- f + g: the arithmetic on synthetic rows (a separate hardware key) ----
{
  const hk = 'mps|Apple M1 Max|64'; const f = S.jobFeatures('create-image', 'comfy-qwen21', QWEN)!; const k = S.keysOf(f);
  const row = (id: string, x: Partial<import('../src/stepEta.ts').StepSample> = {}) => S.addSample({ id, key: k.key, baseKey: k.baseKey, hwKey: hk, modelsSig: k.modelsSig, label: 'qwen', toolId: 'create-image', steps: 25, graphSteps: 25, units: k.units, postUnits: k.postUnits,
    loadSec: 150, loadKind: 'cold', sampleSec: 250, postSec: 6, totalSec: 406, factors: { pixels: f.pixels, frames: 1, batch: 1, cfg2: false, loras: 0 }, at: Date.now() - 3600_000, ...x });
  row('m1'); process.env.OPENHIGGSFIELD_ETA_WARM_MS = '-1';
  const one = S.estimateFor(f, hk); assert.equal(one.source, 'learned'); assert.equal(one.seconds, 406); assert.equal(one.secondsPerStep, 10);
  const w1 = one.high! - one.low!;
  // f: 20 steps of the same size → scaled, 150 + 200 + 6
  const s20 = S.estimateFor({ ...f, steps: 20 }, hk); assert.equal(s20.source, 'scaled'); assert.equal(s20.seconds, 356); assert.ok((s20.high! - s20.low!) / s20.seconds! > w1 / one.seconds!, 'scaling widens the range');
  // 1536² (2.25× the pixels) → step and post cost × 2.25
  const big = S.estimateFor({ ...f, pixels: 1536 * 1536 }, hk); assert.equal(big.source, 'scaled'); assert.equal(big.seconds, Math.round(150 + 250 * 2.25 + 6 * 2.25));
  // cfg > 1 → two model passes per step
  const cfg2 = S.estimateFor({ ...f, cfg2: true }, hk); assert.equal(cfg2.seconds, 150 + 500 + 6);
  ok(`f: one timed run (25 steps, 1024²) also estimates 20 steps (${s20.seconds}s, scaled ${s20.low}–${s20.high}), 1536² (${big.seconds}s) and cfg>1 (${cfg2.seconds}s); range widens when extrapolating`);
  // g: outliers dropped, range narrows with more runs
  row('m2', { sampleSec: 255, loadSec: 140 }); row('m3', { sampleSec: 245, loadSec: 160 }); row('m4', { sampleSec: 252, loadSec: 150 }); row('m5', { sampleSec: 248, loadSec: 145 });
  const five = S.estimateFor(f, hk); assert.equal(five.samples, 5); assert.ok(five.high! - five.low! < w1, `narrower with 5 runs: ${five.low}–${five.high} vs ${one.low}–${one.high}`);
  row('m6', { sampleSec: 1100 }); // a run while the machine was busy: 44 s/step
  const six = S.estimateFor(f, hk); assert.equal(six.samples, 5, 'the 44 s/step run is dropped'); assert.equal(six.secondsPerStep, five.secondsPerStep);
  row('m7', { loadSec: 900 }); const seven = S.estimateFor(f, hk); assert.ok(seven.loadSec! < 200, `a 900 s load is an outlier: ${seven.loadSec}`);
  assert.deepEqual(S.inliers([10, 10.2, 9.8, 40]), [0, 1, 2]); assert.deepEqual(S.inliers([10, 40]), [0, 1], 'two values: nothing to call an outlier');
  ok(`g: outliers dropped (44 s/step run, 900 s load); 5 runs give ${five.low}–${five.high}s vs ${one.low}–${one.high}s from one`);
  // the user's M1 Max case: one quick 3 min run among ~11 min ones → the estimate follows the usual runs
  for (const [i, t] of [30, 404, 394, 414].entries()) row(`u${i}`, { key: k.key + 'x', hwKey: 'mps|u|64', loadSec: t }); // totals ≈ 3 min, 11 min, 11 min, 11 min
  const u = S.estimateFor({ ...f }, 'mps|u|64'); assert.ok(u.seconds! > 550, `usual runs win: ${u.seconds}`);
  for (let i = 0; i < 25; i++) row(`k${i}`, { at: Date.now() - i * 1000 }); assert.ok(S.stepRows().filter((r) => r.key === k.key && r.hwKey === hk).length <= S.KEEP, 'keeps the last 20 per key');
}
// ---- h (part 2): demo / simulated jobs and cloud routes never record, even with the opt-in ----
{
  const pass = [{ workflow: 'w.json', graph: { 1: { class_type: 'KSampler', inputs: { steps: 4 } } }, timing: { submittedAt: 1000, startedAt: 1000, firstStepAt: 2000, lastStepAt: 3000, doneAt: 3500, steps: 4, cachedNodes: [] } }];
  const base = { id: 'x', toolId: 'create-image', status: 'done', route: 'local:comfy-qwen21' };
  assert.ok(S.sampleFromRun(base, HK, pass, 4000), 'a timed local run makes a row');
  assert.equal(S.recordRun({ ...base, id: 'demo', routing: { demo: { code: 'demo_preview' } } }, HK, pass, 4000), null, 'demo run');
  assert.equal(S.recordRun({ ...base, id: 'sim', simulated: true }, HK, pass, 4000), null, 'simulated (mockRun) job');
  assert.equal(S.recordRun({ ...base, id: 'cloud', route: 'comfy-cloud:x' }, HK, pass, 4000), null, 'cloud route (etaLearn keeps those)');
  assert.equal(S.sampleFromRun(base, HK, [{ ...pass[0], timing: null as any }], 4000), null, 'no timing (Comfy Cloud transport) → nothing');
  const { mockRun } = await import('../src/tools/shared.ts'); process.env.OPENHIGGSFIELD_MOCK_DELAY_MS = '10'; const before = S.stepRows().length;
  const mj = job('mock-pipe', 'comfy-qwen21', { outKind: 'image' }); await mockRun(mj, [['rendering', 'Rendering']], ['Result'], 10); assert.equal(S.stepRows().length, before, 'the mock pipeline never records');
  ok('h: mock backend without the opt-in, demo runs, simulated (mock pipeline) jobs, cloud routes and untimed runs are never recorded');
}
// ---- i: reset ----
{
  put('eta_samples', 'old1', { id: 'old1', key: 'camera|comfy-cloud:x|720p|≤5s', hwKey: 'cloud', renderSec: 30, downloadSec: 0, loadSec: 0, bytesDownloaded: 0, bytesLoaded: 0, units: 5, at: Date.now() });
  assert.ok(all<any>('eta_samples').some((r) => r.id === 'old1'), 'old samples stay in their own table');
  const sum = L.learnedSummary(); assert.ok(sum.steps.samples > 0 && sum.samples >= sum.steps.samples, JSON.stringify({ s: sum.samples, st: sum.steps.samples }));
  const r = L.resetLearned(); assert.ok(r.stepsCleared > 0); assert.equal(S.stepRows().length, 0); assert.equal(all<any>('eta_steps').length, 0);
  process.env.OPENHIGGSFIELD_ETA_WARM_MS = String(10 * 60_000);
  const after = R.fitFor(tool, 'comfy-qwen21', QWEN).etaRange; assert.equal(after.source, 'first_run', 'back to the first-run state'); assert.equal(after.includesLoad, null);
  ok('i: Reset learned timings clears the step timings (and the old samples) → first run again');
}
wss.close(); srv.close();
console.log('all step-eta checks passed'); process.exit(0);
