// Local ComfyUI timeouts, end to end against a FAKE ComfyUI (http + ws on 127.0.0.1, no GPU, nothing leaves the machine; the real ComfyUI is never touched).
//  1. unit (ComfyNative.run): a slow but steady run past several stall windows succeeds; a stuck run fails after the stall window and OUR running prompt is
//     interrupted ({prompt_id: ours}); the hard cap fails a steady run that runs too long; when ComfyUI no longer lists our prompt while another client's
//     prompt runs, nothing is interrupted (not_in_queue); queue wait never counts; ComfyUI restarted mid-run → "no longer has prompt"; model bytes moving
//     (o.activity) count as progress; localCapMs = max(60 min, 4 × calibrated ETA), COMFY_TIMEOUT_MS overrides.
//  2. API (own server on :8971, COMFY_STALL_TEST_PORT; temp data dir): a job in flight survives a server restart (reattached, done with its result);
//     a stalled job whose prompt ComfyUI kept is failed "Stopped: no progress for 1 min. Nothing was charged." with lateWatch, then turns done
//     ("Finished late") when ComfyUI finishes it, outputs stored, Spend $0 local; a stalled job whose prompt was interrupted is not watched.
// Run: npx tsx test/comfy-stall-timeout.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = Number(process.env.COMFY_STALL_TEST_PORT) || testPort(8971); const B = `http://localhost:${PORT}`; const ok = (m: string) => console.log('ok ' + m);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const OBJECT_INFO: Record<string, object> = {};
{ const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith('.json')) { try { const g = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const n of Object.values<any>(g ?? {})) if (n && typeof n === 'object' && typeof n.class_type === 'string') OBJECT_INFO[n.class_type] = { input: { required: {} }, output: [] }; } catch { /* not a graph */ } } } };
  walk(path.join(ROOT, '../workflows')); }
/** Scriptable fake ComfyUI. hidden = prompt ids /queue never lists (ComfyUI "kept it somewhere": the cancel finds nothing to stop). */
function fakeComfy() {
  const S = { running: null as string | null, pending: [] as string[], history: {} as Record<string, any>, calls: [] as { method: string; url: string; body: any }[], n: 0,
    hidden: new Set<string>(), graphs: new Map<string, Record<string, any>>(), socks: new Map<string, WebSocket>(), clientOf: new Map<string, string>() };
  const entry = (id: string, k: number) => [k, id, {}, {}, []];
  const server = http.createServer((req, res) => {
    let s = ''; req.on('data', (d) => (s += d)); req.on('end', async () => {
      let body: any = null; try { body = s ? JSON.parse(s) : null; } catch { body = s; }
      const url = req.url ?? ''; S.calls.push({ method: req.method ?? 'GET', url, body });
      const json = (o: unknown, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (url === '/system_stats') return json({ system: { os: 'test', comfyui_version: '0.3.60', ram_total: 64e9, ram_free: 32e9 }, devices: [{ name: 'Fake GPU', type: 'cuda', vram_total: 24e9, vram_free: 20e9 }] });
      if (url.startsWith('/object_info')) return json(OBJECT_INFO);
      if (req.method === 'POST' && url === '/upload/image') return json({ name: 'up.png', subfolder: '', type: 'input' });
      if (req.method === 'POST' && url === '/prompt') { const id = `ours-${++S.n}`; S.clientOf.set(id, body?.client_id); S.graphs.set(id, body?.prompt ?? {}); S.pending.push(id); return json({ prompt_id: id, number: 100 + S.n }); }
      if (req.method === 'GET' && url === '/queue') { const vis = (id: string | null) => !!id && !S.hidden.has(id);
        return json({ queue_running: vis(S.running) ? [entry(S.running!, 1)] : [], queue_pending: S.pending.filter(vis).map((id, i) => entry(id, 2 + i)) }); }
      if (req.method === 'POST' && url === '/queue') { for (const id of body?.delete ?? []) S.pending = S.pending.filter((x) => x !== id); return json({}); }
      if (req.method === 'POST' && url === '/interrupt') { const id = body?.prompt_id; if (!id || id === S.running) { const was = S.running; S.running = null; if (was) S.history[was] = { status: { status_str: 'error', completed: false, messages: [['execution_interrupted', {}]] }, outputs: {} }; } return json({}); }
      if (url.startsWith('/history/')) { const id = decodeURIComponent(url.slice('/history/'.length)); return json(S.history[id] ? { [id]: S.history[id] } : {}); }
      if (url.startsWith('/view')) { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(PNG); }
      res.writeHead(404); res.end();
    });
  });
  const wss = new WebSocketServer({ server }); wss.on('connection', (ws, req) => { const cid = new URL(req.url ?? '/', 'http://x').searchParams.get('clientId') ?? ''; S.socks.set(cid, ws); });
  const send = (id: string, type: string, data: object) => { try { S.socks.get(S.clientOf.get(id) ?? '')?.send(JSON.stringify({ type, data: { prompt_id: id, ...data } })); } catch { /* closed */ } };
  const sampler = (id: string) => Object.entries(S.graphs.get(id) ?? {}).find(([, n]: any) => /sampler/i.test(n?.class_type ?? '') && !/Select$/.test(n?.class_type ?? ''))?.[0] ?? null;
  const saveNodes = (id: string) => Object.entries(S.graphs.get(id) ?? {}).filter(([, n]: any) => /^Save|Preview/.test(n?.class_type ?? '')).map(([k]) => k);
  /** Our prompt leaves the queue and starts (execution_start + executing the sampler). */
  const start = (id: string) => { S.pending = S.pending.filter((x) => x !== id); S.running = id; send(id, 'execution_start', {}); send(id, 'executing', { node: sampler(id) }); };
  const step = (id: string, v: number, max = 1000) => send(id, 'progress', { node: sampler(id), value: v, max });
  const finish = (id: string) => { if (S.running === id) S.running = null; S.pending = S.pending.filter((x) => x !== id);
    S.history[id] = { status: { status_str: 'success', completed: true, messages: [['execution_success', { prompt_id: id, timestamp: Date.now() }]] }, outputs: Object.fromEntries(saveNodes(id).map((n) => [n, { images: [{ filename: `${id}.png`, subfolder: '', type: 'output' }] }])) };
    send(id, 'executing', { node: null }); };
  return { S, start, step, finish, send, listen: () => new Promise<number>((r) => server.listen(0, '127.0.0.1', () => r((server.address() as any).port))), close: () => { wss.close(); server.close(); } };
}

// 1. unit
{ const N = await import('../src/comfy/native.ts'); const f = fakeComfy(); const port = await f.listen(); const c = () => new N.ComfyNative(`http://127.0.0.1:${port}`);
  const graph = { '1': { class_type: 'KSampler', inputs: {} }, '2': { class_type: 'SaveImage', inputs: {} } };
  // a: slow but steady: a step every 250 ms for 5 s with a 1.2 s stall window (4 windows; 1.2 s leaves room for a busy 2-core CI runner) → success
  { let pid = ''; const r = c().run(graph, { stallMs: 1200, timeoutMs: 20_000, onSubmitted: (id) => { pid = id; setTimeout(() => f.start(id), 30); } });
    await sleep(100); for (let v = 1; v <= 20; v++) { f.step(pid, v); await sleep(250); } f.finish(pid);
    const a = await r; assert.ok(a.outputs['2']?.[0]?.filename, 'collected'); ok('slow but steady: 5 s of steps with a 1.2 s stall window → finishes (only a lack of progress stops a run)'); }
  // b: stuck while running (ours visible as running) → stall after the window, our prompt interrupted with its id
  { f.S.calls.length = 0; let pid = ''; const t0 = Date.now();
    const e: any = await c().run(graph, { stallMs: 700, timeoutMs: 20_000, onSubmitted: (id) => { pid = id; setTimeout(() => { f.start(id); f.step(id, 1); }, 30); } }).catch((x) => x);
    assert.ok(e instanceof N.ComfyTimeoutError, String(e)); assert.equal(e.kind, 'stall'); assert.equal(e.cancel, 'interrupted'); assert.ok(Date.now() - t0 < 5000, 'fails soon after the window');
    assert.deepEqual(f.S.calls.filter((x) => x.url === '/interrupt').map((x) => x.body), [{ prompt_id: pid }], 'one interrupt naming our prompt'); assert.equal(f.S.running, null);
    ok('stuck run: fails after the stall window, our running prompt interrupted (POST /interrupt {prompt_id: ours})'); }
  // c: someone else's prompt runs and ComfyUI no longer lists ours → no interrupt, nothing deleted (not_in_queue)
  { f.S.calls.length = 0; let pid = '';
    const e: any = await c().run(graph, { stallMs: 700, timeoutMs: 20_000, onSubmitted: (id) => { pid = id; f.S.hidden.add(id); setTimeout(() => { f.start(id); f.S.running = 'theirs'; }, 30); } }).catch((x) => x);
    assert.ok(e instanceof N.ComfyTimeoutError, String(e)); assert.equal(e.kind, 'stall'); assert.equal(e.cancel, 'not_in_queue'); assert.equal(e.promptId, pid);
    assert.ok(!f.S.calls.some((x) => x.url === '/interrupt'), 'never interrupts another client\'s prompt'); assert.ok(!f.S.calls.some((x) => x.method === 'POST' && x.url === '/queue'), 'nothing deleted'); assert.equal(f.S.running, 'theirs');
    f.S.running = null; ok('give up while another client\'s prompt runs: no interrupt, no delete (cancel = not_in_queue)'); }
  // c2: ours pending again when we give up (e.g. requeued) → removed from the pending queue, no interrupt
  { f.S.calls.length = 0; let pid = '';
    const e: any = await c().run(graph, { stallMs: 600, timeoutMs: 20_000, onSubmitted: (id) => { pid = id; setTimeout(() => { f.start(id); f.S.running = 'theirs'; f.S.pending.push(id); }, 30); } }).catch((x) => x);
    assert.equal(e?.cancel, 'removed', String(e)); assert.ok(f.S.calls.some((x) => x.method === 'POST' && x.url === '/queue' && JSON.stringify(x.body) === JSON.stringify({ delete: [pid] })));
    assert.ok(!f.S.calls.some((x) => x.url === '/interrupt')); assert.equal(f.S.running, 'theirs'); f.S.running = null; ok('give up with ours pending behind another client: POST /queue {delete:[ours]}, no interrupt'); }
  // d: hard cap: steady progress but past the cap → cap
  { let pid = ''; let stop = false; const r = c().run(graph, { stallMs: 5000, timeoutMs: 1200, onSubmitted: (id) => { pid = id; setTimeout(() => f.start(id), 30); } }).catch((x) => x);
    void (async () => { for (let v = 1; !stop && v < 100; v++) { await sleep(150); if (pid) f.step(pid, v); } })();
    const e: any = await r; stop = true; assert.ok(e instanceof N.ComfyTimeoutError, String(e)); assert.equal(e.kind, 'cap'); assert.equal(e.cancel, 'interrupted'); ok('hard cap: a run still stepping past the cap is stopped (kind cap)'); }
  // e: the queue wait never counts: 3.5 s pending behind another prompt with a 1.2 s stall window and 1.5 s cap, then a quick run → success
  { f.S.running = 'theirs'; let pid = ''; const r = c().run(graph, { stallMs: 1200, timeoutMs: 1500, onSubmitted: (id) => { pid = id; } });
    await sleep(3500); f.S.running = null; f.start(pid); await sleep(150); f.finish(pid); assert.ok((await r).outputs['2'], 'collected'); ok('queue wait never counts toward the stall window or the cap'); }
  // f: model bytes moving (activity) count as progress; no socket events for 3.5 s with a 1.2 s window → still fine
  { let pid = ''; let bytes = 0; const tick = setInterval(() => { bytes += 1e6; }, 200);
    const r = c().run(graph, { stallMs: 1200, timeoutMs: 20_000, activity: () => bytes, onSubmitted: (id) => { pid = id; setTimeout(() => f.start(id), 30); } });
    await sleep(3500); clearInterval(tick); f.finish(pid); assert.ok((await r).outputs['2']); ok('model-load bytes moving count as progress (no stall while bytes move)'); }
  // g: ComfyUI restarted mid-run: our prompt vanishes (not queued, no history) → "no longer has prompt" (existing behaviour, now also once running)
  { process.env.OPENHIGGSFIELD_COMFY_GONE_MS = '900'; let pid = '';
    const e: any = await c().run(graph, { stallMs: 60_000, timeoutMs: 60_000, onSubmitted: (id) => { pid = id; setTimeout(() => { f.start(id); setTimeout(() => { f.S.running = null; }, 200); }, 30); } }).catch((x) => x);
    delete process.env.OPENHIGGSFIELD_COMFY_GONE_MS; assert.match(String(e?.message), /no longer has prompt/); assert.ok(!(e instanceof N.ComfyTimeoutError)); void pid; ok('ComfyUI restarted mid-run (prompt gone) → "ComfyUI no longer has prompt"'); }
  // h: the hard cap formula
  { const R = await import('../src/comfy/runNative.ts'); const H = 60 * 60_000;
    assert.equal(R.localCapMs(null), H, 'no estimate → 60 min'); assert.equal(R.localCapMs({ seconds: 600, high: 900, calibrating: false, source: 'learned' }), H, '4 × 15 min = 60 min');
    assert.equal(R.localCapMs({ seconds: 1500, high: 1800, calibrating: false, source: 'learned' }), 1800 * 4 * 1000, '4 × the calibrated high end');
    assert.equal(R.localCapMs({ seconds: 3000, high: 4000, calibrating: true, source: 'reported' }), H, 'an uncalibrated guess is not used');
    ok('hard cap = max(60 min, 4 × calibrated ETA)'); }
  f.close(); }

// 2. API: restart reattach + late-result rescue
const f = fakeComfy(); const cport = await f.listen();
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ohf-comfy-stall-'));
if (await fetch(`${B}/api/health`).then(() => true, () => false)) throw new Error(`:${PORT} is in use; set COMFY_STALL_TEST_PORT`);
const env: Record<string, string | undefined> = { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'),
  OPENHIGGSFIELD_BACKEND: 'comfy', COMFY_BASE_URL: `http://127.0.0.1:${cport}`, OPENHIGGSFIELD_COMFY_API: 'native', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0',
  OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_CONCURRENCY: '2', OPENHIGGSFIELD_COMFY_STALL_MS: '1500', OPENHIGGSFIELD_LATE_SWEEP_MS: '500', OPENHIGGSFIELD_RESUME_POLL_MS: '300' };
for (const k of ['OPENHIGGSFIELD_BFL_API_KEY', 'OPENHIGGSFIELD_FAL_KEY', 'FAL_KEY', 'OPENHIGGSFIELD_REPLICATE_API_TOKEN', 'REPLICATE_API_TOKEN', 'COMFY_API_KEY', 'OPENHIGGSFIELD_COMFY_API_KEY', 'OPENHIGGSFIELD_MOCK_KEYS', 'OPENHIGGSFIELD_COMFY_MODELS_DIR', 'COMFY_MODELS_DIR', 'OPENHIGGSFIELD_COMFY_TIMEOUT_MS']) delete env[k];
const boot = () => spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: env as any, stdio: process.env.DEBUG_STALL ? 'inherit' : 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const until = async (pred: () => Promise<any>, what: string, ms = 20_000) => { const t0 = Date.now(); for (;;) { const v = await pred().catch(() => null); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await sleep(100); } };
const up = () => until(async () => (await fetch(`${B}/api/health`).then((r) => r.ok, () => false)), 'API up', 80_000);
const submit = async (prompt: string) => { const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', types: '["generate"]', prompt, model: 'flux-2-klein-4b', runOn: 'local' })) fd.append(k, v);
  const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); const b = await r.json() as any; assert.equal(r.status, 200, JSON.stringify(b)); assert.match(String(b.route), /^local:/, b.route); return b; };
let seen = 0; const nextPrompt = async () => { const want = seen + 1; await until(async () => f.S.n >= want, 'prompt submitted'); seen = want; return `ours-${want}`; };
const kill = (p: ChildProcess) => { try { process.kill(-p.pid!, 'SIGKILL'); } catch { /* gone */ } };
let p = boot();
try {
  await up();
  // 2a. restart with a local job in flight → reattached, done with its result
  const a = await submit('a paper boat'); const pa = await nextPrompt(); f.start(pa); f.step(pa, 1);
  // keep a stepping until the kill: on a slow runner the wait below can pass the 1.5 s stall window, and a stalled job would fail before the restart
  let va = 1; const beat = setInterval(() => f.step(pa, ++va), 200);
  await until(async () => (await get(`/api/jobs/${a.id}`)).progressInfo?.stage === 'generating', 'a generating'); await sleep(900); // the 400 ms flush stored comfyPrompt
  kill(p); clearInterval(beat); await until(async () => !(await fetch(`${B}/api/health`).then((r) => r.ok, () => false)), 'API down', 10_000);
  p = boot(); await up();
  const ra = await get(`/api/jobs/${a.id}`); assert.equal(ra.status, 'running', `reattached, not failed (${ra.status}: ${ra.error})`);
  f.finish(pa); const da = await until(async () => { const j = await get(`/api/jobs/${a.id}`); return j.status !== 'running' ? j : null; }, 'a settles');
  assert.equal(da.status, 'done', `${da.status}: ${da.error}`); assert.ok(da.resultUrl); assert.ok(da.warnings.some((w: string) => /server restarted during this run/.test(w)));
  ok('server restart with a local job in flight: reattached (still running), then done with its result');

  // 2b. stalled, and ComfyUI kept the prompt (cancel finds nothing to stop) → failed + watched → finishes late → done
  const b = await submit('a lighthouse'); const pb = await nextPrompt(); f.S.hidden.add(pb); f.start(pb); f.step(pb, 1);
  const fb = await until(async () => { const j = await get(`/api/jobs/${b.id}`); return j.status === 'failed' ? j : null; }, 'b fails by stall', 15_000);
  assert.equal(fb.reasonCode, 'local_stalled'); assert.equal(fb.errorType, 'timeout'); assert.match(fb.error, /Stopped: no progress for 1 min\./); assert.equal(fb.lateWatch, true, 'watched for a late result');
  assert.ok(!f.S.calls.some((x) => x.url === '/interrupt' && x.body?.prompt_id === pb), 'nothing interrupted (ComfyUI did not list it)');
  const FR = await import('../../web/src/shared/failureReasons.ts'); const v = FR.failView(fb); assert.equal(`${v.line} ${v.charge}`, 'Nothing moved for 1 minute, so we stopped it. Try again. Nothing was charged.'); assert.ok(v.actions.includes('retry'));
  f.finish(pb); const db = await until(async () => { const j = await get(`/api/jobs/${b.id}`); return j.status === 'done' ? j : null; }, 'b finishes late', 10_000);
  assert.ok(db.resultUrl && db.outputs.length === 1, 'outputs stored'); assert.ok(db.finishedLateAt); assert.equal(db.lateWatch, false); assert.equal(db.error, null); assert.equal(db.reasonCode, null);
  assert.ok(db.warnings.some((w: string) => /^Finished late/.test(w))); assert.equal((await fetch(B + db.resultUrl)).status, 200, 'the file is served');
  assert.equal(db.spend?.billedTo, 'local'); assert.equal(db.spend?.countedUsd, 0); assert.ok(!db.spend?.actualUsd, 'no charge recorded');
  const lst = await get('/api/jobs?status=done,failed&order=desc&limit=50&cursor=') /* newest first, as the feed: a status filter alone lists oldest first */; const listed = (Array.isArray(lst) ? lst : lst.items ?? []).find((x: any) => x.id === b.id); assert.equal(listed?.status, 'done', 'the feed list shows it done');
  ok('stalled with the prompt kept by ComfyUI: failed "Stopped: no progress for 1 min. Nothing was charged." (watched) → finished late → done, outputs stored, $0 local');

  // 2c. stalled while ComfyUI lists it as ours and running → interrupted, not watched
  const c = await submit('a red kite'); const pc = await nextPrompt(); f.start(pc); f.step(pc, 1);
  const fc = await until(async () => { const j = await get(`/api/jobs/${c.id}`); return j.status === 'failed' ? j : null; }, 'c fails by stall', 15_000);
  assert.equal(fc.reasonCode, 'local_stalled'); assert.equal(fc.lateWatch, false, 'interrupted: nothing to watch');
  assert.deepEqual(f.S.calls.filter((x) => x.url === '/interrupt').map((x) => x.body), [{ prompt_id: pc }], 'interrupted ours only');
  ok('stalled and ours running: interrupted with our prompt id, not watched');
} finally { kill(p); f.close(); await sleep(300); fs.rmSync(D, { recursive: true, force: true }); }
console.log('ALL OK comfy-stall-timeout'); process.exit(0);
