// Cancel locally (local ComfyUI) at every stage, end to end against a FAKE ComfyUI (http + ws on 127.0.0.1, no GPU, nothing leaves the machine).
// Own API on :8964 (COMFY_CANCEL_PORT), temp data dir, comfy backend, no keys, no models folder.
//  1. ComfyNative.cancelPrompt (unit, own fake): ours pending → POST /queue {delete:[ours]}, never /interrupt; ours running → POST /interrupt {prompt_id: ours};
//     ours absent while ANOTHER prompt runs → nothing (no interrupt); repeated calls share one answer; ComfyUI down → 'unreachable'.
//  2. API: a job waiting in ComfyUI's queue behind another prompt → cancellable:true on GET /api/jobs/:id and on /api/queue/activity →
//     POST /cancel → 200 canceled, ComfyUI got delete:[our prompt id] and no interrupt, the other prompt untouched; the job settles canceled
//     with cancellable:false, its Spend row $0 (local), no preview left, not failed (the runner's wait ended quietly).
//  3. API: our prompt RUNNING (frames + steps) → cancel → interrupt with our prompt id; job canceled, Spend $0, preview gone.
//  4. Race: our prompt already finished on ComfyUI (the runner is still saving the result) → 409 already_done, the job ends done.
//  5. Hosted / done jobs: canCancel false once dispatched to a hosted place, true while waiting in our queue (fabricated jobs, unit).
// Run: npx tsx test/comfy-cancel.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = Number(process.env.COMFY_CANCEL_PORT) || testPort(8964); const B = `http://localhost:${PORT}`; const ok = (m: string) => console.log('ok ' + m);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 7), Buffer.from([0xff, 0xd9])]);
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };

/** Every node class our workflows use (so the fake ComfyUI is never "missing custom nodes"). */
const OBJECT_INFO: Record<string, object> = {};
{ const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith('.json')) { try { const g = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const n of Object.values<any>(g ?? {})) if (n && typeof n === 'object' && typeof n.class_type === 'string') OBJECT_INFO[n.class_type] = { input: { required: {} }, output: [] }; } catch { /* not a graph */ } } } };
  walk(path.join(ROOT, '../workflows')); }
/** A scriptable fake ComfyUI: a queue (running + pending), /history, /view, /interrupt, /queue delete, websocket per client. */
function fakeComfy() {
  const S = { running: null as string | null, pending: [] as string[], history: {} as Record<string, any>, calls: [] as { method: string; url: string; body: any }[], n: 0, viewDelayMs: 0,
    autoStart: false, graphs: new Map<string, Record<string, any>>(), socks: new Map<string, WebSocket>(), clientOf: new Map<string, string>() };
  const entry = (id: string, k: number) => [k, id, {}, {}, []];
  const server = http.createServer((req, res) => {
    let s = ''; req.on('data', (d) => (s += d)); req.on('end', async () => {
      let body: any = null; try { body = s ? JSON.parse(s) : null; } catch { body = s; }
      const url = req.url ?? ''; S.calls.push({ method: req.method ?? 'GET', url, body });
      const json = (o: unknown, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (url === '/system_stats') return json({ system: { os: 'test', comfyui_version: '0.3.60', ram_total: 64e9, ram_free: 32e9 }, devices: [{ name: 'Fake GPU', type: 'cuda', vram_total: 24e9, vram_free: 20e9 }] });
      if (url.startsWith('/object_info')) return json(OBJECT_INFO);
      if (req.method === 'POST' && url === '/upload/image') return json({ name: 'up.png', subfolder: '', type: 'input' });
      if (req.method === 'POST' && url === '/prompt') { const id = `ours-${++S.n}`; S.clientOf.set(id, body?.client_id); S.graphs.set(id, body?.prompt ?? {}); S.pending.push(id); json({ prompt_id: id, number: 100 + S.n }); if (S.autoStart) setTimeout(() => start(id), 30); return; }
      if (req.method === 'GET' && url === '/queue') return json({ queue_running: S.running ? [entry(S.running, 1)] : [], queue_pending: S.pending.map((id, i) => entry(id, 2 + i)) });
      if (req.method === 'POST' && url === '/queue') { for (const id of body?.delete ?? []) S.pending = S.pending.filter((x) => x !== id); return json({}); }
      if (req.method === 'POST' && url === '/interrupt') { const id = body?.prompt_id; if (!id || id === S.running) { const was = S.running; S.running = null; if (was) { S.history[was] = { status: { status_str: 'error', completed: false, messages: [['execution_interrupted', {}]] }, outputs: {} }; send(was, 'execution_interrupted', {}); } } return json({}); }
      if (url.startsWith('/history/')) { const id = decodeURIComponent(url.slice('/history/'.length)); return json(S.history[id] ? { [id]: S.history[id] } : {}); }
      if (url.startsWith('/view')) { if (S.viewDelayMs) await sleep(S.viewDelayMs); res.writeHead(200, { 'content-type': 'image/png' }); return res.end(PNG); }
      res.writeHead(404); res.end();
    });
  });
  const wss = new WebSocketServer({ server }); wss.on('connection', (ws, req) => { const cid = new URL(req.url ?? '/', 'http://x').searchParams.get('clientId') ?? ''; S.socks.set(cid, ws); });
  const sockOf = (id: string) => S.socks.get(S.clientOf.get(id) ?? '');
  function send(id: string, type: string, data: object) { try { sockOf(id)?.send(JSON.stringify({ type, data: { prompt_id: id, ...data } })); } catch { /* closed */ } }
  /** Our prompt leaves ComfyUI's queue and starts: execution_start, a sampler step and a preview frame. */
  function start(id: string) { S.pending = S.pending.filter((x) => x !== id); S.running = id; send(id, 'execution_start', {}); send(id, 'executing', { node: firstSampler(id) });
    const step = (v: number) => { if (S.running !== id) return; send(id, 'progress', { node: firstSampler(id), value: v, max: 20 }); try { sockOf(id)?.send(Buffer.concat([u32(1), u32(1), JPG])); } catch { /* */ } };
    for (let v = 1; v <= 3; v++) setTimeout(() => step(v), 40 * v); }
  /** Our prompt finishes: history has the output of every node the graph saves. */
  function finish(id: string, outNodes: string[] = saveNodes(id)) { if (S.running === id) S.running = null; S.pending = S.pending.filter((x) => x !== id);
    S.history[id] = { status: { status_str: 'success', completed: true }, outputs: Object.fromEntries(outNodes.map((n) => [n, { images: [{ filename: `${id}.png`, subfolder: '', type: 'output' }] }])) }; send(id, 'executing', { node: null }); }
  const firstSampler = (id: string) => Object.entries(S.graphs.get(id) ?? {}).find(([, n]: any) => /sampler/i.test(n?.class_type ?? '') && !/Select$/.test(n?.class_type ?? ''))?.[0] ?? null;
  /** Node ids of the graph that save something (what /history lists as outputs). */
  const saveNodes = (id: string) => Object.entries(S.graphs.get(id) ?? {}).filter(([, n]: any) => /^Save|Preview/.test(n?.class_type ?? '')).map(([k]) => k);
  return { S, server, start, finish, send, listen: () => new Promise<number>((r) => server.listen(0, '127.0.0.1', () => r((server.address() as any).port))), close: () => { wss.close(); server.close(); } };
}

// 1. unit: cancelPrompt never touches someone else's prompt
{ const N = await import('../src/comfy/native.ts'); const f = fakeComfy(); const port = await f.listen(); const c = new N.ComfyNative(`http://127.0.0.1:${port}`);
  const reset = () => { f.S.calls.length = 0; };
  f.S.running = 'theirs'; f.S.pending = ['theirs-2', 'mine-a']; reset();
  assert.equal(await c.cancelPrompt('mine-a'), 'removed'); assert.deepEqual(f.S.pending, ['theirs-2']); assert.equal(f.S.running, 'theirs');
  assert.ok(f.S.calls.some((x) => x.method === 'POST' && x.url === '/queue' && JSON.stringify(x.body) === '{"delete":["mine-a"]}')); assert.ok(!f.S.calls.some((x) => x.url === '/interrupt'), 'pending → no interrupt');
  assert.equal(await c.cancelPrompt('mine-a'), 'removed', 'a second call shares the first answer'); assert.equal(f.S.calls.filter((x) => x.url === '/queue' && x.method === 'POST').length, 1, 'one delete');
  reset(); assert.equal(await c.cancelPrompt('mine-gone'), 'not_in_queue'); assert.ok(!f.S.calls.some((x) => x.url === '/interrupt'), 'ours not running, theirs running → no interrupt'); assert.equal(f.S.running, 'theirs');
  f.S.running = 'mine-b'; reset(); assert.equal(await c.cancelPrompt('mine-b'), 'interrupted'); const it = f.S.calls.find((x) => x.url === '/interrupt'); assert.deepEqual(it?.body, { prompt_id: 'mine-b' }, 'interrupt names our prompt');
  assert.equal(await new N.ComfyNative('http://127.0.0.1:9').cancelPrompt('x'), 'unreachable');
  f.close(); ok('cancelPrompt: pending → queue delete (no interrupt); running ours → interrupt {prompt_id}; absent while another runs → nothing; one call per prompt; unreachable → nothing'); }

// 1b. timeout clock starts when OUR prompt starts executing, not at submit (a long wait in ComfyUI's shared queue never times out a run)
{ const N = await import('../src/comfy/native.ts'); const f = fakeComfy(); const port = await f.listen(); const c = () => new N.ComfyNative(`http://127.0.0.1:${port}`);
  const graph = { '1': { class_type: 'KSampler', inputs: {} }, '2': { class_type: 'SaveImage', inputs: {} } };
  // a: waits 4 s in ComfyUI's queue (limit 1 s of RUNNING), then runs 300 ms and finishes → success, queue positions reported meanwhile
  f.S.running = 'theirs'; let pid = ''; const qpos: number[] = [];
  const ra = c().run(graph, { timeoutMs: 1000, onSubmitted: (id) => { pid = id; }, onProgress: (p) => { if (p.queuePos) qpos.push(p.queuePos); } });
  await sleep(4000); f.S.running = null; f.start(pid); await sleep(300); f.finish(pid);
  const a = await ra; assert.equal(a.promptId, pid); assert.ok(a.outputs['2']?.[0]?.filename, 'outputs collected'); assert.ok(qpos.includes(1), `queue position shown while waiting (${qpos})`);
  // b: runs longer than the limit, but ComfyUI has the result by the final check → still collected (no socket "done" message)
  f.S.running = null; let pb = ''; const rb = c().run(graph, { timeoutMs: 600, onSubmitted: (id) => { pb = id; setTimeout(() => f.start(id), 20); } });
  await sleep(150); f.S.history[pb] = { status: { status_str: 'success', completed: false }, outputs: { '2': { images: [{ filename: 'late.png', subfolder: '', type: 'output' }] } } };
  const b = await rb; assert.equal(b.outputs['2'][0].filename, 'late.png');
  // c: really stuck while running (no result) → times out after the RUNNING limit
  const t0 = Date.now(); await assert.rejects(c().run(graph, { timeoutMs: 700, onSubmitted: (id) => { setTimeout(() => f.start(id), 20); } }), N.ComfyTimeoutError); assert.ok(Date.now() - t0 < 6000);
  f.close(); ok('timeout: a 4 s wait in the ComfyUI queue with a 1 s limit still succeeds (clock starts at execution); a late result is collected by the last history check; a stuck run times out'); }

// 2–4. the API against the fake ComfyUI
const f = fakeComfy(); const cport = await f.listen();
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ohf-comfy-cancel-'));
if (await fetch(`${B}/api/health`).then(() => true, () => false)) throw new Error(`:${PORT} is in use; set COMFY_CANCEL_PORT`);
const env: Record<string, string | undefined> = { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'),
  OPENHIGGSFIELD_BACKEND: 'comfy', COMFY_BASE_URL: `http://127.0.0.1:${cport}`, OPENHIGGSFIELD_COMFY_API: 'native', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0',
  OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_CONCURRENCY: '2' };
for (const k of ['OPENHIGGSFIELD_BFL_API_KEY', 'OPENHIGGSFIELD_FAL_KEY', 'FAL_KEY', 'OPENHIGGSFIELD_REPLICATE_API_TOKEN', 'REPLICATE_API_TOKEN', 'COMFY_API_KEY', 'OPENHIGGSFIELD_COMFY_API_KEY', 'OPENHIGGSFIELD_MOCK_KEYS', 'OPENHIGGSFIELD_COMFY_MODELS_DIR', 'COMFY_MODELS_DIR', 'OPENHIGGSFIELD_CANCEL_IN_PROCESSING']) delete env[k];
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: env as any, stdio: process.env.DEBUG_CANCEL ? 'inherit' : 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const submit = async (prompt: string) => { const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', types: '["generate"]', prompt, model: 'flux-2-klein-4b', runOn: 'local' })) fd.append(k, v);
  const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); const b = await r.json() as any; assert.equal(r.status, 200, JSON.stringify(b)); assert.match(String(b.route), /^local:/, b.route); return b; };
const until = async (pred: () => Promise<any>, what: string, ms = 15_000) => { const t0 = Date.now(); for (;;) { const v = await pred(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await sleep(60); } };
/** The prompt id the fake ComfyUI handed out for this job (jobs here are submitted one at a time, so the n-th prompt after the submit). */
let seenPrompts = 0;
const promptOf = async (_id: string) => { const want = seenPrompts + 1; await until(async () => f.S.n >= want, 'prompt submitted to ComfyUI'); seenPrompts = want; return `ours-${want}`; };
const spendOf = async (id: string) => (await get(`/api/jobs/${id}`)).spend;
const cancelReq = async (id: string) => { const r = await fetch(`${B}/api/jobs/${id}/cancel`, { method: 'POST' }); return { status: r.status, body: await r.json() as any }; };
try {
  await until(async () => (await fetch(`${B}/api/health`).then((r) => r.ok, () => false)), 'API up', 80_000);
  // 2. pending in ComfyUI's queue behind another prompt
  f.S.running = 'someone-elses-prompt'; f.S.pending = ['someone-elses-next'];
  const a = await submit('a paper boat on a puddle'); const pa = await promptOf(a.id);
  assert.ok(f.S.pending.includes(pa), 'ours waits in ComfyUI'); const ja = await until(async () => { const j = await get(`/api/jobs/${a.id}`); return j.progressInfo?.stage === 'queued' && j.status === 'running' ? j : null; }, 'queued on ComfyUI');
  assert.equal(ja.cancellable, true, 'running locally, waiting in ComfyUI → cancellable'); assert.equal(ja.progressInfo.queuePosition, 2, 'behind someone-elses-next');
  const act = await get('/api/queue/activity'); assert.equal(act.items.find((x: any) => x.id === a.id)?.cancellable, true, 'activity says cancellable');
  f.S.calls.length = 0;
  const ca = await cancelReq(a.id); assert.equal(ca.status, 200, JSON.stringify(ca.body)); assert.equal(ca.body.status, 'canceled'); assert.equal(ca.body.cancellable, false); assert.equal(ca.body.comfyCancel, 'removed');
  assert.ok(f.S.calls.some((x) => x.method === 'POST' && x.url === '/queue' && JSON.stringify(x.body) === JSON.stringify({ delete: [pa] })), 'ComfyUI queue delete with our prompt id');
  assert.ok(!f.S.calls.some((x) => x.url === '/interrupt'), 'no interrupt'); assert.equal(f.S.running, 'someone-elses-prompt'); assert.deepEqual(f.S.pending, ['someone-elses-next'], 'the other prompts are untouched');
  const ea = await until(async () => { const j = await get(`/api/jobs/${a.id}`); return j.spend?.countedUsd === 0 && j.finishedAt !== undefined ? j : (j.status === 'canceled' && (await spendOf(a.id))?.billedTo ? j : null); }, 'settled');
  await sleep(400); const fa = await get(`/api/jobs/${a.id}`); assert.equal(fa.status, 'canceled', `stays canceled (${fa.status}: ${fa.error})`); assert.equal(fa.errorType, null, 'not a failure'); assert.equal(fa.cancellable, false);
  assert.equal(fa.progressInfo.stage, 'canceled'); assert.equal(fa.spend.billedTo, 'local'); assert.equal(fa.spend.countedUsd, 0); assert.equal(fa.spend.estUsd, 0);
  assert.equal((await fetch(`${B}/api/jobs/${a.id}/preview`)).status, 404); assert.ok(!(await get('/api/queue/activity')).items.some((x: any) => x.id === a.id), 'out of the activity list'); void ea;
  ok(`pending in ComfyUI's queue (#2 behind another prompt): cancellable on job + activity; cancel → POST /queue delete:[${pa}], no interrupt, others untouched; canceled (not failed), Spend $0 local`);

  // 3. ours running
  f.S.running = null; f.S.pending = []; f.S.autoStart = true;
  const b = await submit('a lighthouse at dusk'); const pb = await promptOf(b.id); await until(async () => f.S.running === pb, 'ours running');
  const jb = await until(async () => { const j = await get(`/api/jobs/${b.id}`); return j.progressInfo?.stage === 'generating' ? j : null; }, 'generating');
  assert.equal(jb.cancellable, true, 'running ours → cancellable'); await until(async () => (await fetch(`${B}/api/jobs/${b.id}/preview`)).status === 200, 'a preview frame');
  f.S.calls.length = 0; const cb = await cancelReq(b.id); assert.equal(cb.status, 200, JSON.stringify(cb.body)); assert.equal(cb.body.comfyCancel, 'interrupted');
  const its = f.S.calls.filter((x) => x.url === '/interrupt'); assert.equal(its.length, 1, 'one interrupt'); assert.deepEqual(its[0].body, { prompt_id: pb });
  await sleep(500); const fb = await get(`/api/jobs/${b.id}`); assert.equal(fb.status, 'canceled', `${fb.status}: ${fb.error}`); assert.equal(fb.errorType, null); assert.equal(fb.spend.countedUsd, 0);
  assert.equal((await fetch(`${B}/api/jobs/${b.id}/preview`)).status, 404, 'preview store freed'); assert.equal(f.S.calls.filter((x) => x.url === '/interrupt').length, 1, 'the runner did not interrupt again');
  ok(`running ours: cancel → POST /interrupt {prompt_id: ${pb}} once; canceled, Spend $0, preview freed`);

  // 3b. waiting in OUR queue (concurrency 2: two running, the third waits) → plain queue cancel, nothing sent to ComfyUI
  f.S.autoStart = false; f.S.running = 'someone-elses-prompt';
  const c1 = await submit('one'); const c2 = await submit('two'); const c3 = await submit('three');
  await promptOf(c1.id); await promptOf(c2.id); const j3 = await get(`/api/jobs/${c3.id}`); assert.equal(j3.status, 'queued'); assert.equal(j3.cancellable, true);
  f.S.calls.length = 0; const k3 = await cancelReq(c3.id); assert.equal(k3.status, 200); assert.equal(k3.body.status, 'canceled'); assert.equal(k3.body.comfyCancel, undefined); assert.ok(!f.S.calls.some((x) => x.method === 'POST'), 'nothing sent to ComfyUI');
  for (const j of [c1, c2]) assert.equal((await cancelReq(j.id)).status, 200);
  ok('waiting in our own queue: canceled at once, nothing sent to ComfyUI');

  // 4. race: ComfyUI already finished our prompt, the runner is still downloading the result → done wins
  f.S.running = null; f.S.pending = []; f.S.viewDelayMs = 1500;
  const d = await submit('a red kite'); const pd = await promptOf(d.id); f.start(pd); await sleep(200);
  const graphOut = (await get(`/api/jobs/${d.id}`)); void graphOut; f.finish(pd);
  await until(async () => f.S.calls.some((x) => x.url.startsWith('/view')), 'runner downloading');
  f.S.calls.length = 0; const cd = await cancelReq(d.id); assert.equal(cd.status, 409, JSON.stringify(cd.body)); assert.equal(cd.body.code, 'already_done');
  assert.ok(!f.S.calls.some((x) => x.method === 'POST'), 'nothing sent to ComfyUI'); const fd = await until(async () => { const j = await get(`/api/jobs/${d.id}`); return j.status !== 'running' ? j : null; }, 'job ends');
  assert.equal(fd.status, 'done', `${fd.status}: ${fd.error}`); assert.ok(fd.resultUrl);
  const again = await cancelReq(d.id); assert.equal(again.status, 409); assert.equal(again.body.code, 'already_done'); assert.equal(again.body.status, 'done');
  ok('race: prompt already finished on ComfyUI → 409 already_done, the job ends done with its result; cancel on a done job → already_done');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } f.close(); await sleep(200); fs.rmSync(D, { recursive: true, force: true }); }

// 5. unit: canCancel on fabricated jobs (comfy backend, native)
{ const D2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ohf-cancel-unit-')); process.env.OPENHIGGSFIELD_DATA_DIR = D2; process.env.OPENHIGGSFIELD_ENV_FILE = path.join(D2, 'none.env'); process.env.OPENHIGGSFIELD_BACKEND = 'comfy';
  process.env.COMFY_BASE_URL = 'http://127.0.0.1:9'; process.env.OPENHIGGSFIELD_COMFY_API = 'native'; delete process.env.OPENHIGGSFIELD_CANCEL_IN_PROCESSING;
  const Q = await import('../src/queue.ts'); const base = { id: 'x', toolId: 'create-image', provider: 'comfy-open', progress: 0, queuePos: 0, eta: 0, resultUrl: null, outputs: [], error: null, errorType: null, warnings: [], parentId: null, createdAt: 0, input: {}, cost: 0, refunded: 0 } as any;
  const cc = (o: any) => Q.canCancel({ ...base, ...o });
  assert.equal(cc({ status: 'queued', route: 'fal:fal-ai/x' }), true, 'hosted, waiting in our queue');
  assert.equal(cc({ status: 'running', route: 'fal:fal-ai/x', stage: 'submitted' }), false, 'hosted, sent to fal');
  assert.equal(cc({ status: 'running', route: 'comfy-router:kling', stage: 'rendering', progress: 40 }), false, 'hosted, sent to Comfy Router');
  assert.equal(cc({ status: 'running', route: 'local:comfy-flux2-klein', stage: 'uploading' }), true, 'local, before submit');
  assert.equal(cc({ status: 'running', route: 'local:comfy-flux2-klein', comfyPrompt: { id: 'p', base: 'http://127.0.0.1:9', pass: 0, passes: 1 } }), true, 'local, submitted');
  assert.equal(cc({ status: 'running', route: 'local:comfy-flux2-klein', simulated: true }), false, 'a sample run stays as before');
  assert.equal(cc({ status: 'running', route: 'local:comfy-flux2-klein', input: { refBatches: [[1], [2]] } }), false, 'chunked: Cancel remaining groups instead');
  for (const s of ['done', 'failed', 'canceled']) assert.equal(cc({ status: s, route: 'local:comfy-flux2-klein' }), false, s);
  const R = await import('../src/comfy/runNative.ts'); assert.equal(R.execTimeoutMs(null), 30 * 60_000, 'floor 30 min'); assert.equal(R.execTimeoutMs({ seconds: 60, high: 90 }), 30 * 60_000);
  assert.equal(R.execTimeoutMs({ seconds: 900, high: 1200 }), 1200 * 4 * 1000, 'a long video model: 4 × the high estimate'); ok('execTimeoutMs: 4 × the step-ETA estimate, never under 30 min');
  fs.rmSync(D2, { recursive: true, force: true }); ok('canCancel: local at every stage (before submit, submitted); hosted only before dispatch; never once ended'); }
console.log('ALL OK comfy-cancel'); process.exit(0);
