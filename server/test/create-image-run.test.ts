// Create Image run fixes (2026-10-21), all against a tiny fake ComfyUI on a spare port (never a real one), mock backend, temp data dir, no keys:
//  5  progress: the percent comes from sampler steps only. Loader / text-encoder nodes finishing gives known:false (no percent), a sampler at
//     step 3/30 gives 10%, never the old node-count ~50% a few seconds in.
//  8  spend: mock / sample runs never count (job c8892ad0 shape: create-image, Nano Banana 2 on comfy-router, cost 8, demo:false, no provider
//     request id → $0); a run with a provider request id still counts; a mockRun marks its job simulated.
//  10 restart: a job running on a native ComfyUI with a stored prompt id reconnects on boot and finishes from /history; a prompt ComfyUI no
//     longer has (not in /history or /queue) fails with a plain reason.
//  11 opaque: an RGBA PNG (alpha 254) from ComfyUI is stored as rgb24; a tool meant for transparency (input.alpha) is left alone.
// Run: npx tsx test/create-image-run.test.ts (needs ffmpeg/ffprobe on PATH)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http'; import { execFileSync } from 'node:child_process';
import { WebSocketServer } from 'ws';
const ok = (m: string) => console.log('ok ' + m);
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-run-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '', COMFY_API_KEY: '', OPENHIGGSFIELD_COUNT_SIMULATED_SPEND: '',
  OPENHIGGSFIELD_RESUME_POLL_MS: '100', OPENHIGGSFIELD_RESUME_UNREACHABLE_MS: '2000' });

// ---- a fake ComfyUI: /prompt, /history/<id>, /queue, /view, /ws ----
const RGBA = path.join(D, 'rgba-src.png');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x3366ccFE:s=64x64,format=rgba', '-frames:v', '1', RGBA]);
const pix = (f: string) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt', '-of', 'default=nw=1:nk=1', f]).toString().trim();
assert.equal(pix(RGBA), 'rgba', 'fixture is RGBA');
const history: Record<string, any> = {}; const queue = { queue_running: [] as any[], queue_pending: [] as any[] }; let wsPlan: ((send: (m: any) => void, pid: string) => Promise<void>) | null = null;
const srv = http.createServer((req, res) => {
  const u = new URL(req.url!, 'http://x'); const json = (v: any) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(v)); };
  if (u.pathname === '/prompt' && req.method === 'POST') { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { const pid = 'p-' + Math.random().toString(36).slice(2, 8); json({ prompt_id: pid }); if (wsPlan) void wsPlan(sendAll, pid); }); return; }
  if (u.pathname.startsWith('/history/')) { const id = decodeURIComponent(u.pathname.slice(9)); return json(history[id] ? { [id]: history[id] } : {}); }
  if (u.pathname === '/queue') return json(queue);
  if (u.pathname === '/view') { res.setHeader('content-type', 'image/png'); return res.end(fs.readFileSync(RGBA)); }
  res.statusCode = 404; res.end('{}');
});
const wss = new WebSocketServer({ server: srv }); const sendAll = (m: any) => { for (const c of wss.clients) c.send(JSON.stringify(m)); };
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r())); const BASE = `http://127.0.0.1:${(srv.address() as any).port}`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- 5: real step progress ----
{
  const N = await import('../src/comfy/native.ts');
  assert.equal(N.stepPercent(0, 3, 30, 1), 10); assert.equal(N.stepPercent(1, 0, 0, 2), 50); assert.equal(N.stepPercent(1, 30, 30, 1), 99, 'never 100 before outputs');
  assert.equal(N.isSamplerNode({ class_type: 'KSampler' }), true); assert.equal(N.isSamplerNode({ class_type: 'KSamplerSelect' }), false); assert.equal(N.isSamplerNode({ class_type: 'CLIPTextEncode' }), false);
  const graph = { 1: { class_type: 'UNETLoader' }, 2: { class_type: 'CLIPLoader' }, 3: { class_type: 'VAELoader' }, 4: { class_type: 'CLIPTextEncode' }, 5: { class_type: 'CLIPTextEncode' }, 6: { class_type: 'EmptyLatentImage' }, 7: { class_type: 'KSampler' }, 8: { class_type: 'VAEDecode' }, 9: { class_type: 'SaveImage' } };
  const seen: { known?: boolean; percent: number; node: string | null }[] = [];
  wsPlan = async (send, pid) => {
    await wait(80); for (const n of ['1', '2', '3', '4', '5', '6']) { send({ type: 'executing', data: { node: n, prompt_id: pid } }); await wait(5); }
    send({ type: 'executing', data: { node: '7', prompt_id: pid } }); await wait(5);
    send({ type: 'progress', data: { node: '7', value: 3, max: 30, prompt_id: pid } }); await wait(5);
    send({ type: 'progress', data: { node: '7', value: 15, max: 30, prompt_id: pid } }); await wait(5);
    send({ type: 'executing', data: { node: '8', prompt_id: pid } }); await wait(5);
    history[pid] = { status: { completed: true, status_str: 'success' }, outputs: { 9: { images: [{ filename: 'x.png', subfolder: '', type: 'output' }] } } };
    send({ type: 'executing', data: { node: null, prompt_id: pid } });
  };
  const c = new N.ComfyNative(BASE); const r = await c.run(graph, { onProgress: (p) => seen.push({ known: p.known, percent: p.percent, node: p.node }) });
  wsPlan = null;
  assert.ok(r.promptId && r.outputs['9']?.length, 'outputs collected');
  const beforeSteps = seen.filter((s) => s.node && Number(s.node) <= 6); assert.ok(beforeSteps.length >= 6, JSON.stringify(seen));
  assert.ok(beforeSteps.every((s) => s.known === false && s.percent === 0), `loaders + encoders give no percent: ${JSON.stringify(beforeSteps)}`);
  assert.ok(seen.some((s) => s.known && s.percent === 10), `step 3/30 = 10%: ${JSON.stringify(seen)}`);
  assert.ok(seen.some((s) => s.known && s.percent === 50), 'step 15/30 = 50%');
  assert.ok(!seen.some((s) => s.known && s.node === '7' && s.percent > 50 && s.percent < 100), 'no jump past the real step');
  const ks = seen.filter((s) => s.known).map((s) => s.percent); assert.deepEqual(ks, [...ks].sort((a, b) => a - b), 'monotonic');
  ok('5: loaders / encoders finishing give known:false (no percent); KSampler 3/30 → 10%, 15/30 → 50%; monotonic; 100 only with outputs');
}

// ---- 8 + 10 + 11: seed rows before jobs.ts loads ----
const { put } = await import('../src/db.ts');
const now = Date.now();
const baseJob = (id: string, extra: any) => ({ id, toolId: 'create-image', provider: 'comfy-zimage-turbo', status: 'running', stage: 'generating', progress: 20, queuePos: 0, eta: 30, resultUrl: null, outputs: [], error: null, errorType: null, warnings: [], createdAt: now - 60_000, startedAt: now - 50_000, input: { prompt: 'a lighthouse', n: 1 }, cost: 0, refunded: 0, route: 'local:comfy-zimage-turbo', ...extra });
history['p-alive'] = { status: { completed: true, status_str: 'success' }, outputs: { 9: { images: [{ filename: 'ComfyUI_0001_.png', subfolder: '', type: 'output' }] } } };
put('jobs', 'resume1', baseJob('resume1', { requestIds: ['p-alive'], comfyPrompt: { id: 'p-alive', base: BASE, pass: 0, passes: 1, outputs: ['9'], labels: ['Result'], resumable: true, submittedAt: now - 50_000 } }));
put('jobs', 'resume2', baseJob('resume2', { requestIds: ['p-gone'], comfyPrompt: { id: 'p-gone', base: BASE, pass: 0, passes: 1, outputs: ['9'], labels: ['Result'], resumable: true, submittedAt: now - 50_000 } }));
put('jobs', 'resume3', baseJob('resume3', { comfyPrompt: null })); // no prompt id: fails as before
// item 8: the exact shape of the $0.08 row (a mock-backend run recorded as paid): done, comfy-router, cost 8, demo:false, no request id
put('jobs', 'c8892ad0', baseJob('c8892ad0', { status: 'done', stage: 'done', progress: 100, provider: 'api-nano-banana-2', route: 'comfy-router:api-nano-banana', cost: 8, outputs: [{ label: 'Result', url: '/files/c8892ad0-out0.png' }], finishedAt: now - 1000 }));
put('spend', 'c8892ad0', { id: 'c8892ad0', jobId: 'c8892ad0', createdAt: now - 60_000, finishedAt: now - 1000, toolId: 'create-image', model: 'api-nano-banana-2', modelName: 'Nano Banana 2', route: 'comfy-router:api-nano-banana', routeKind: 'comfy-router', billedTo: 'comfy', estUsd: 0.08, estUnits: 17, unitLabel: 'Comfy credits', actualUsd: null, actualSource: null, status: 'done', started: true, failureRule: 'may-charge', demo: false, mode: 'own', credits: 8 });
put('jobs', 'real1', baseJob('real1', { status: 'done', stage: 'done', progress: 100, provider: 'api-nano-banana-2', route: 'comfy-router:api-nano-banana', cost: 8, requestIds: ['comfy-req-1'], finishedAt: now - 1000 }));
put('spend', 'real1', { id: 'real1', jobId: 'real1', createdAt: now - 60_000, finishedAt: now - 1000, toolId: 'create-image', model: 'api-nano-banana-2', modelName: 'Nano Banana 2', route: 'comfy-router:api-nano-banana', routeKind: 'comfy-router', billedTo: 'comfy', estUsd: 0.08, estUnits: 17, unitLabel: 'Comfy credits', actualUsd: null, actualSource: null, status: 'done', started: true, failureRule: 'may-charge', demo: false, mode: 'own', credits: 8 });

const { jobs } = await import('../src/jobs.ts');
await import('../src/queue.ts'); // boot: reconnect running ComfyUI jobs

// ---- 8 ----
{
  const BL = await import('../src/billing.ts');
  assert.equal(BL.spentUsd('comfy', 'day'), 0.08, 'only the run with a provider request id counts (the legacy mock row c8892ad0 is $0)');
  const rows = (await import('../src/db.ts')).all<any>('spend');
  assert.equal(BL.countedUsd({ ...rows.find((r) => r.id === 'real1')!, simulated: true }), 0, 'a simulated row is $0');
  // new rows on the mock backend are flagged at submit; a mockRun marks the job simulated
  const j: any = baseJob('new1', { status: 'queued', provider: 'api-nano-banana-2', route: 'comfy-router:api-nano-banana', cost: 8 }); jobs.set(j.id, j);
  BL.recordSpend(j, 8); const r = (await import('../src/db.ts')).all<any>('spend').find((x) => x.id === 'new1'); assert.equal(r.simulated, true, 'mock backend: simulated at submit'); assert.equal(BL.countedUsd(r), 0);
  const { mockRun } = await import('../src/tools/shared.ts'); const mj: any = { ...baseJob('mock1', {}), input: { prompt: 'x', outKind: 'image' } }; process.env.OPENHIGGSFIELD_MOCK_DELAY_MS = '10';
  await mockRun(mj, [['rendering', 'Rendering']], ['Result'], 10); assert.equal(mj.simulated, true, 'mockRun marks the job simulated');
  ok('8: the $0.08 row shape (comfy-router, cost 8, demo:false, no request id) counts $0; a run with a provider request id still counts; mock-backend rows are simulated at submit; mockRun flags its job');
}

// ---- 10 + 11 ----
{
  for (let i = 0; i < 100 && ['resume1', 'resume2'].some((id) => jobs.get(id)!.status === 'running'); i++) await wait(100);
  const a = jobs.get('resume1')!; assert.equal(a.status, 'done', `${a.status} ${a.error}`); assert.equal(a.outputs.length, 1); assert.equal(a.progress, 100);
  const out = path.join(D, path.basename(a.outputs[0].url)); assert.ok(fs.existsSync(out), out); assert.equal(pix(out), 'rgb24', 'stored opaque (item 11)');
  assert.match(a.warnings.join(' '), /restarted during this run; the result was collected/);
  const b = jobs.get('resume2')!; assert.equal(b.status, 'failed'); assert.match(String(b.error), /ComfyUI no longer has this job/);
  const c = jobs.get('resume3')!; assert.equal(c.status, 'failed'); assert.match(String(c.error), /server restarted while this was in progress/);
  ok('10: boot reconnects a running native ComfyUI job: finished in /history → done with its output; gone from /history and /queue → failed with a plain reason; no prompt id → failed as before');
  const { isOpaqueImage } = await import('../src/comfy/runNative.ts'); const { flattenAlpha } = await import('../src/ffmpeg.ts');
  assert.equal(isOpaqueImage({ input: {} } as any, 'a.png'), true); assert.equal(isOpaqueImage({ input: { alpha: true } } as any, 'a.png'), false, 'transparency tools are left alone'); assert.equal(isOpaqueImage({ input: {} } as any, 'a.mp4'), false);
  const dst = path.join(D, 'flat.png'); assert.equal(await flattenAlpha(RGBA, dst), true); assert.equal(pix(dst), 'rgb24');
  const again = path.join(D, 'flat2.png'); assert.equal(await flattenAlpha(dst, again), false, 'opaque input is copied as is'); assert.equal(pix(again), 'rgb24');
  ok('11: RGBA (alpha 254) PNG → rgb24; opaque PNG copied unchanged; input.alpha (Remove BG transparent) and videos are never flattened');
}
wss.close(); srv.close();
console.log('all create-image-run checks passed'); process.exit(0);
