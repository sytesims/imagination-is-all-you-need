// Long local ComfyUI jobs, end to end against a FAKE ComfyUI (http + ws on 127.0.0.1, no GPU, nothing leaves the machine; the real ComfyUI is never touched).
// No clock stops a working job (user, 3 Nov 2026). "Alive" = ComfyUI's GET /queue lists our prompt.
//  1. unit (ComfyNative.run, the clock faked forward): a 5-hour run with steady steps finishes; one node silent for 90 min while /queue shows it
//     running finishes (never interrupted); the user's Cancel interrupts ours; ComfyUI restarted (prompt gone) → ComfyLostError gone; another client's
//     prompt runs and ours is gone → gone, nothing of theirs touched; ComfyUI killed mid-run → ComfyLostError unreachable; a cap someone SET still
//     works and never counts the queue wait; defaults: localCapMs() null, Cloud net 2 h. resumeNative: a reconnected prompt running 3 h (an old
//     stored 60-min cap included) is collected, never stopped.
//  2. API (own server on :8971, COMFY_STALL_TEST_PORT; temp data dir): a job in flight survives a server restart (reattached, done with its result);
//     ComfyUI drops our prompt → failed local_gone, plain words, "Nothing was charged."; ComfyUI killed mid-run → failed local_lost, plain words.
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
  return { S, start, step, finish, send, listen: () => new Promise<number>((r) => server.listen(0, '127.0.0.1', () => r((server.address() as any).port))), close: () => { if (!server.listening) return; for (const c of wss.clients) c.terminate(); wss.close(); server.close(); server.closeAllConnections(); } };
}

// The fake clock: Date.now() runs ahead by `skew` ms, so hours pass in a second (setTimeout stays real).
const realNow = Date.now.bind(Date); let skew = 0; Date.now = () => realNow() + skew;
// 1. unit
{ const N = await import('../src/comfy/native.ts'); let f = fakeComfy(); let port = await f.listen(); const c = () => new N.ComfyNative(`http://127.0.0.1:${port}`);
  const graph = { '1': { class_type: 'KSampler', inputs: {} }, '2': { class_type: 'SaveImage', inputs: {} } };
  process.env.OPENHIGGSFIELD_COMFY_GONE_MS = '900';
  // a: 5 hours of steady steps (an hour passes every 150 ms) → finishes
  { let pid = ''; const r = c().run(graph, { onSubmitted: (id) => { pid = id; setTimeout(() => f.start(id), 30); } }); await sleep(100);
    for (let v = 1; v <= 25; v++) { skew += 12 * 60_000; f.step(pid, v, 25); await sleep(30); } f.finish(pid);
    const a = await r; assert.ok(a.outputs['2']?.[0]?.filename, 'collected'); assert.ok(!f.S.calls.some((x) => x.url === '/interrupt'), 'never interrupted'); ok('a 5-hour run with steady progress finishes (no cap)'); }
  // b: one node silent for 90 min (no socket events at all) while /queue shows it running → finishes, never interrupted
  { f.S.calls.length = 0; let pid = ''; const r = c().run(graph, { onSubmitted: (id) => { pid = id; setTimeout(() => f.start(id), 30); } }); await sleep(200);
    for (let k = 0; k < 18; k++) { skew += 5 * 60_000; await sleep(120); } // 90 min of silence, /queue read again and again meanwhile
    assert.ok(f.S.calls.filter((x) => x.url === '/queue').length >= 2, '/queue was checked'); f.finish(pid);
    const b = await r; assert.ok(b.outputs['2']); assert.ok(!f.S.calls.some((x) => x.url === '/interrupt')); ok('one node silent for 90 min while /queue shows it running: finishes, never stopped'); }
  // c: the user's Cancel interrupts ours (with its id), even after hours
  { f.S.calls.length = 0; let pid = ''; let stop = false; const r = c().run(graph, { isCanceled: () => stop, onSubmitted: (id) => { pid = id; setTimeout(() => f.start(id), 30); } }).catch((x) => x);
    await sleep(300); skew += 3 * 3600_000; await sleep(100); stop = true; const e: any = await r;
    assert.equal(String(e?.message), 'canceled'); assert.deepEqual(f.S.calls.filter((x) => x.url === '/interrupt').map((x) => x.body), [{ prompt_id: pid }]); ok('Cancel after 3 h: our running prompt interrupted (POST /interrupt {prompt_id: ours})'); }
  // d: ComfyUI restarted mid-run: our prompt vanishes (not queued, no history) → ComfyLostError gone
  { const e: any = await c().run(graph, { onSubmitted: (id) => { setTimeout(() => { f.start(id); setTimeout(() => { f.S.running = null; }, 200); }, 30); } }).catch((x) => x);
    assert.ok(e instanceof N.ComfyLostError, String(e)); assert.equal(e.kind, 'gone'); assert.match(e.message, /no longer has prompt/); ok('ComfyUI restarted mid-run (prompt gone) → lost (gone)'); }
  // e: another client's prompt runs and ComfyUI no longer lists ours → gone; nothing of theirs interrupted or deleted
  { f.S.calls.length = 0; const e: any = await c().run(graph, { onSubmitted: (id) => { f.S.hidden.add(id); setTimeout(() => { f.start(id); f.S.running = 'theirs'; }, 30); } }).catch((x) => x);
    assert.ok(e instanceof N.ComfyLostError, String(e)); assert.equal(e.kind, 'gone'); assert.ok(!f.S.calls.some((x) => x.url === '/interrupt' || (x.method === 'POST' && x.url === '/queue')), 'nothing touched'); assert.equal(f.S.running, 'theirs');
    f.S.running = null; ok('ours gone while another client\'s prompt runs: lost (gone), theirs untouched'); }
  // f: a cap someone SET (OPENHIGGSFIELD_COMFY_TIMEOUT_MS → timeoutMs) still stops a run, and ComfyUI's queue wait never counts toward it
  { let pid = ''; const r = c().run(graph, { timeoutMs: 1200, onSubmitted: (id) => { pid = id; } }); f.S.running = 'theirs';
    await sleep(2500); f.S.running = null; f.start(pid); await sleep(150); f.finish(pid); assert.ok((await r).outputs['2'], 'queue wait not counted');
    const e: any = await c().run(graph, { timeoutMs: 1000, onSubmitted: (id) => { setTimeout(() => f.start(id), 30); } }).catch((x) => x);
    assert.ok(e instanceof N.ComfyTimeoutError, String(e)); assert.equal(e.cancel, 'interrupted'); ok('a set cap still works (opt-in) and never counts the queue wait'); }
  // g: defaults: no local cap, Cloud net 2 h of running
  { const R = await import('../src/comfy/runNative.ts'); assert.equal(R.localCapMs(), null, 'no local cap'); assert.equal(R.execTimeoutMs(), 2 * 3600_000, 'Cloud net 2 h');
    const L = await import('../src/shared/cloudLimits.ts'); assert.equal(L.cloudLimitNote(10 * 60), null); assert.match(String(L.cloudLimitNote(25 * 60)), /about 25 min\. Comfy Cloud stops a run after 30 min \(1 hour on the Pro plan\)/);
    assert.equal(L.nearCloudLimit(29 * 60_000), true); assert.equal(L.nearCloudLimit(10 * 60_000), false); ok('defaults: localCapMs() = none, Cloud net 2 h; Cloud limit note from 20 min'); }
  // h: reconnect after an app restart: a prompt running for 3 h (its old stored 60-min cap included) is collected, never stopped
  { const RS = await import('../src/comfy/resume.ts'); const pid = 'resumed-1'; f.S.graphs.set(pid, graph); f.S.running = pid; f.S.calls.length = 0;
    const job: any = { id: 'rz', status: 'running', input: { outKind: 'image' }, outputs: [], warnings: [], comfyPrompt: { id: pid, base: `http://127.0.0.1:${port}`, pass: 0, passes: 1, outputs: ['2'], labels: ['Result'], resumable: true, submittedAt: 0, capMs: 60 * 60_000 } };
    let polls = 0; await RS.resumeNative(job, { sleep: async () => { skew += 15 * 60_000; if (++polls === 12) f.finish(pid); } });
    assert.equal(job.status, 'done', `${job.status}: ${job.error}`); assert.ok(!f.S.calls.some((x) => x.url === '/interrupt')); ok('reconnect: a prompt running 3 h is collected (no cap, an old stored cap ignored)'); }
  // i: ComfyUI killed mid-run (connection refused) → ComfyLostError unreachable after the GONE window
  { let pid = ''; const r = c().run(graph, { onSubmitted: (id) => { pid = id; setTimeout(() => { f.start(id); f.step(id, 1); }, 30); } }).catch((x) => x);
    await sleep(400); void pid; f.close(); const t0 = realNow(); const e: any = await r;
    assert.ok(e instanceof N.ComfyLostError, String(e)); assert.equal(e.kind, 'unreachable'); assert.ok(realNow() - t0 < 15_000); ok('ComfyUI killed mid-run → lost (unreachable), fails cleanly'); }
  delete process.env.OPENHIGGSFIELD_COMFY_GONE_MS; Date.now = realNow; skew = 0; void port; }

// 2. API: restart reattach; ComfyUI drops our prompt; ComfyUI killed
const f = fakeComfy(); const cport = await f.listen();
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ohf-comfy-stall-'));
if (await fetch(`${B}/api/health`).then(() => true, () => false)) throw new Error(`:${PORT} is in use; set COMFY_STALL_TEST_PORT`);
const env: Record<string, string | undefined> = { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'),
  OPENHIGGSFIELD_BACKEND: 'comfy', COMFY_BASE_URL: `http://127.0.0.1:${cport}`, OPENHIGGSFIELD_COMFY_API: 'native', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0',
  OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_CONCURRENCY: '2', OPENHIGGSFIELD_COMFY_GONE_MS: '1500', OPENHIGGSFIELD_LATE_SWEEP_MS: '500', OPENHIGGSFIELD_RESUME_POLL_MS: '300' };
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
  let va = 1; const beat = setInterval(() => f.step(pa, ++va), 200);
  await until(async () => (await get(`/api/jobs/${a.id}`)).progressInfo?.stage === 'generating', 'a generating'); await sleep(900); // the 400 ms flush stored comfyPrompt
  kill(p); clearInterval(beat); await until(async () => !(await fetch(`${B}/api/health`).then((r) => r.ok, () => false)), 'API down', 10_000);
  p = boot(); await up();
  const ra = await get(`/api/jobs/${a.id}`); assert.equal(ra.status, 'running', `reattached, not failed (${ra.status}: ${ra.error})`);
  f.finish(pa); const da = await until(async () => { const j = await get(`/api/jobs/${a.id}`); return j.status !== 'running' ? j : null; }, 'a settles');
  assert.equal(da.status, 'done', `${da.status}: ${da.error}`); assert.ok(da.resultUrl); assert.ok(da.warnings.some((w: string) => /server restarted during this run/.test(w)));
  ok('server restart with a local job in flight: reattached (still running), then done with its result');

  // 2b. ComfyUI drops our prompt (not queued, not running, no result) → failed local_gone, plain words, nothing charged, not watched
  const b = await submit('a lighthouse'); const pb = await nextPrompt(); f.S.hidden.add(pb); f.start(pb); f.step(pb, 1);
  const fb = await until(async () => { const j = await get(`/api/jobs/${b.id}`); return j.status === 'failed' ? j : null; }, 'b fails: gone', 15_000);
  assert.equal(fb.reasonCode, 'local_gone'); assert.match(fb.error, /ComfyUI no longer has this job/); assert.ok(!/Took longer|min\b/.test(fb.error), 'no clock in the words'); assert.equal(fb.lateWatch, false);
  assert.ok(!f.S.calls.some((x) => x.url === '/interrupt' && x.body?.prompt_id === pb), 'nothing interrupted');
  const FR = await import('../../web/src/shared/failureReasons.ts'); const v = FR.failView(fb); assert.equal(v.title, 'ComfyUI lost this run'); assert.equal(v.charge, 'Nothing was charged.');
  assert.equal(fb.spend?.billedTo, 'local'); assert.ok(!fb.spend?.actualUsd, 'no charge recorded');
  ok('ComfyUI drops our prompt: failed "ComfyUI lost this run", nothing charged');

  // 2c. ComfyUI killed mid-run → failed local_lost, plain words, nothing charged
  const c = await submit('a red kite'); const pc = await nextPrompt(); f.start(pc); f.step(pc, 1);
  await until(async () => (await get(`/api/jobs/${c.id}`)).progressInfo?.stage === 'generating', 'c generating'); f.close();
  const fc = await until(async () => { const j = await get(`/api/jobs/${c.id}`); return j.status === 'failed' ? j : null; }, 'c fails: unreachable', 20_000);
  assert.equal(fc.reasonCode, 'local_lost');
  assert.match(fc.error, /ComfyUI closed or stopped answering while this was running\./); assert.ok(!/min\b/.test(fc.error)); const vc = FR.failView(fc); assert.equal(vc.title, 'ComfyUI stopped'); assert.equal(vc.charge, 'Nothing was charged.');
  ok('ComfyUI killed mid-run: failed "ComfyUI stopped", plain words, nothing charged');
} finally { kill(p); f.close(); await sleep(300); fs.rmSync(D, { recursive: true, force: true }); }
console.log('ALL OK comfy-stall-timeout'); process.exit(0);
