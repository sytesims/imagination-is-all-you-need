// Render time vs queue wait (shared/jobTiming.ts, 2026-10-22). A job that waited in ComfyUI's queue must not count the wait as render time.
//  a  jobTiming: split when renderStartedAt is known; queue wait only when > 5 s; hosted / old jobs fall back to finishedAt - startedAt
//  b  durationText formatting
//  c  runNative against a tiny fake ComfyUI (spare port, mock backend, temp data dir, no keys) that holds the prompt in its queue first:
//     renderStartedAt is set at execution_start, after the queue, not at submit
// Run: npx tsx test/job-timing.test.ts (needs ffmpeg on PATH)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http'; import { execFileSync } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { jobTiming, durationText, QUEUE_SHOWN_MS } from '../src/shared/jobTiming.ts';
const ok = (m: string) => console.log('ok ' + m);

// ---- a ----
{
  const t0 = 1_700_000_000_000; const min = 60_000;
  // the reported case: 26 min in ComfyUI's queue, then ~2 min 52 s of rendering
  const local = jobTiming({ createdAt: t0, startedAt: t0 + 200, renderStartedAt: t0 + 26 * min, finishedAt: t0 + 28 * min + 52_000 });
  assert.equal(local.split, true); assert.equal(local.renderMs, 2 * min + 52_000, 'render = finished - render start'); assert.equal(local.queueMs, 26 * min, 'queue = render start - created');
  const short = jobTiming({ createdAt: t0, startedAt: t0 + 100, renderStartedAt: t0 + 1500, finishedAt: t0 + 9000 });
  assert.equal(short.renderMs, 7500); assert.equal(short.queueMs, null, `a wait under ${QUEUE_SHOWN_MS / 1000} s is not shown`);
  const hosted = jobTiming({ createdAt: t0, startedAt: t0 + 300, finishedAt: t0 + 40_300 });
  assert.deepEqual(hosted, { renderMs: 40_000, queueMs: null, split: false }, 'hosted API / old job: today\'s total, no queue line');
  assert.deepEqual(jobTiming({ createdAt: t0, startedAt: t0 }), { renderMs: null, queueMs: null, split: false }, 'not finished: nothing');
  assert.deepEqual(jobTiming({ createdAt: t0, startedAt: t0, renderStartedAt: t0 + 5000, finishedAt: t0 + 4000 }), { renderMs: 4000, queueMs: null, split: false }, 'bad render start falls back');
  assert.deepEqual(jobTiming(null), { renderMs: null, queueMs: null, split: false });
  ok('a: 26 min queue + 2 min 52 s render split; short waits hidden; hosted / old jobs keep the total; bad data falls back');
}
// ---- b ----
{
  assert.equal(durationText(8400), '8.4 s'); assert.equal(durationText(42_000), '42 s'); assert.equal(durationText(172_000), '2 min 52 s'); assert.equal(durationText(26 * 60_000), '26 min');
  assert.equal(durationText(3_840_000), '1 h 4 min'); assert.equal(durationText(0), ''); assert.equal(durationText(null), '');
  ok('b: durationText 8.4 s / 42 s / 2 min 52 s / 26 min / 1 h 4 min');
}
// ---- c ----
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'job-timing-'));
const PNG = path.join(D, 'src.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x3366cc:s=32x32', '-frames:v', '1', PNG]);
const QUEUED_MS = 1500; const history: Record<string, any> = {}; const pending = new Set<string>();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const srv = http.createServer((req, res) => {
  const u = new URL(req.url!, 'http://x'); const json = (v: any) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(v)); };
  if (u.pathname === '/prompt' && req.method === 'POST') { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { const pid = 'p-' + Math.random().toString(36).slice(2, 8); json({ prompt_id: pid }); void play(JSON.parse(b).prompt, pid); }); return; }
  if (u.pathname.startsWith('/history/')) { const id = decodeURIComponent(u.pathname.slice(9)); return json(history[id] ? { [id]: history[id] } : {}); }
  if (u.pathname === '/queue') return json({ queue_running: [], queue_pending: [...pending].map((id, i) => [i, id]) });
  if (u.pathname === '/view') { res.setHeader('content-type', 'image/png'); return res.end(fs.readFileSync(PNG)); }
  if (u.pathname === '/upload/image') { req.resume(); req.on('end', () => json({ name: 'up.png' })); return; }
  res.statusCode = 404; res.end('{}');
});
const wss = new WebSocketServer({ server: srv }); const send = (m: any) => { for (const c of wss.clients) c.send(JSON.stringify(m)); };
let execStartAt = 0;
async function play(g: Record<string, any>, pid: string) {
  const ids = Object.keys(g); const sampler = ids.find((id) => /^KSampler/.test(g[id].class_type))!; const out = ids.find((id) => /^SaveImage/.test(g[id].class_type))!; const steps = 4;
  pending.add(pid); await wait(QUEUED_MS); pending.delete(pid); // sits in ComfyUI's own queue first
  execStartAt = Date.now(); send({ type: 'execution_start', data: { prompt_id: pid } });
  send({ type: 'executing', data: { node: sampler, prompt_id: pid } });
  for (let s = 1; s <= steps; s++) { send({ type: 'progress', data: { node: sampler, value: s, max: steps, prompt_id: pid } }); await wait(30); }
  send({ type: 'executing', data: { node: out, prompt_id: pid } }); await wait(30);
  history[pid] = { status: { completed: true, status_str: 'success' }, outputs: { [out]: { images: [{ filename: 'o.png', subfolder: '', type: 'output' }] } } };
  send({ type: 'executing', data: { node: null, prompt_id: pid } });
}
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r())); const BASE = `http://127.0.0.1:${(srv.address() as any).port}`;
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '', COMFY_API_KEY: '', COMFY_BASE_URL: BASE, OPENHIGGSFIELD_COMFY_BASE_URL: BASE });
delete process.env.OPENHIGGSFIELD_ETA_LEARN_MOCK;
try {
  const { runNative } = await import('../src/comfy/runNative.ts');
  const now = Date.now();
  const j: any = { id: 'timing-1', toolId: 'create-image', provider: 'comfy-zimage-turbo', route: 'local:comfy-zimage-turbo', status: 'running', stage: 'generating', progress: 0, queuePos: 0, eta: 0, resultUrl: null, outputs: [], error: null, errorType: null, warnings: [],
    createdAt: now, startedAt: now, input: { prompt: 'a lighthouse', imageResolution: '1K', aspect: '1:1', n: 1 }, cost: 0, refunded: 0 };
  await runNative(j); assert.notEqual(j.status, 'failed', String(j.error)); j.finishedAt = Date.now();
  assert.ok(j.renderStartedAt > 0, 'renderStartedAt recorded'); assert.ok(j.renderStartedAt >= execStartAt, 'set at execution_start, not at submit');
  assert.ok(j.renderStartedAt - j.createdAt >= QUEUED_MS - 50, `queue time ${j.renderStartedAt - j.createdAt} ms ≥ the fake queue`);
  const t = jobTiming(j); assert.equal(t.split, true); assert.ok(t.renderMs! < j.finishedAt - j.startedAt - QUEUED_MS + 100, `render ${t.renderMs} ms excludes the queue`);
  ok(`c: runNative through a queued fake ComfyUI: queued ${j.renderStartedAt - j.createdAt} ms, render ${t.renderMs} ms (total ${j.finishedAt - j.startedAt} ms)`);
} finally { srv.close(); wss.close(); }
process.exit(0);
