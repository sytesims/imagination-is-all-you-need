// Live preview + shared progress, unit level (no GPU, no network beyond 127.0.0.1):
//  1. parseComfyBinary on fabricated ComfyUI websocket frames (event 1 JPEG / PNG, event 4 with metadata, text event, malformed, wrong type field);
//  2. the preview store: size cap, ≤ 2 frames/s per job, max jobs (oldest evicted), drop;
//  3. comfyQueuePosition from a GET /queue body;
//  4. ComfyNative.run against a FAKE ComfyUI (http + ws on a free port): submit carries extra_data.preview_method, phases go
//     queued (with ComfyUI queue position) → loading → generating (steps) → finishing, preview frames of this prompt reach onPreview;
//  5. progressOf for each source (local-comfy, comfy-cloud, comfy-router, fal, replicate, bfl, mock) from fabricated jobs.
// Run: npx tsx test/comfy-preview.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import { WebSocketServer } from 'ws';
process.env.OPENHIGGSFIELD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ohf-preview-')); process.env.OPENHIGGSFIELD_ENV_FILE = path.join(process.env.OPENHIGGSFIELD_DATA_DIR, 'none.env');
process.env.OPENHIGGSFIELD_BACKEND = 'comfy'; process.env.OPENHIGGSFIELD_PREVIEW_MIN_INTERVAL_MS = '500'; process.env.OPENHIGGSFIELD_PREVIEW_MAX_JOBS = '3';
const ok = (m: string) => console.log('ok ' + m);
const P = await import('../src/comfy/preview.ts'); const N = await import('../src/comfy/native.ts');

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 7), Buffer.from([0xff, 0xd9])]);
const PNGB = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 3)]);
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const frame1 = (type: number, img: Buffer) => Buffer.concat([u32(1), u32(type), img]);
const frame4 = (meta: object, img: Buffer) => { const m = Buffer.from(JSON.stringify(meta)); return Buffer.concat([u32(4), u32(m.length), m, img]); };

// 1. parser
{ const a = P.parseComfyBinary(frame1(1, JPG)); assert.ok(a && a.kind === 'preview'); assert.equal(a.mime, 'image/jpeg'); assert.ok(a.data.equals(JPG));
  const b = P.parseComfyBinary(frame1(2, PNGB)); assert.ok(b && b.kind === 'preview' && b.mime === 'image/png' && b.data.equals(PNGB));
  const c = P.parseComfyBinary(frame4({ node_id: '9', prompt_id: 'abc', image_type: 'image/jpeg' }, JPG)); assert.ok(c && c.kind === 'preview'); assert.equal(c.promptId, 'abc'); assert.equal(c.nodeId, '9'); assert.ok(c.data.equals(JPG));
  assert.deepEqual(P.parseComfyBinary(Buffer.concat([u32(3), u32(1), Buffer.from('1hello')])), { kind: 'other', event: 3 }, 'text event is not a preview');
  assert.equal(P.parseComfyBinary(frame1(2, JPG)), null, 'type says PNG, bytes are JPEG → refused');
  assert.equal(P.parseComfyBinary(frame1(1, Buffer.from('not an image at all'))), null);
  assert.equal(P.parseComfyBinary(Buffer.from([0, 0, 0, 1])), null, 'too short');
  assert.equal(P.parseComfyBinary(Buffer.concat([u32(4), u32(9999), Buffer.from('{}')])), null, 'metadata length past the end');
  assert.equal(P.parseComfyBinary(Buffer.concat([u32(4), u32(3), Buffer.from('{x}'), JPG])), null, 'bad metadata JSON');
  assert.ok(P.parseComfyBinary([frame1(1, JPG).subarray(0, 10), frame1(1, JPG).subarray(10)])?.kind === 'preview', 'fragmented Buffer[] message');
  ok('parseComfyBinary: event 1 JPEG/PNG, event 4 with metadata (prompt/node id), text event ignored, malformed and mislabelled frames refused'); }

// 2. store
{ const t = 1_000_000; assert.equal(P.putPreview('j1', { mime: 'image/jpeg', data: JPG }, t), true); assert.equal(P.putPreview('j1', { mime: 'image/jpeg', data: PNGB }, t + 200), false, '< 500 ms later: throttled');
  assert.ok(P.getPreview('j1')!.data.equals(JPG)); assert.equal(P.putPreview('j1', { mime: 'image/png', data: PNGB }, t + 600), true); assert.equal(P.getPreview('j1')!.mime, 'image/png'); assert.equal(P.getPreview('j1')!.at, t + 600);
  assert.equal(P.putPreview('big', { mime: 'image/jpeg', data: Buffer.alloc(P.MAX_FRAME_BYTES + 1) }, t), false, 'over the size cap'); assert.equal(P.getPreview('big'), null);
  P.putPreview('j2', { mime: 'image/jpeg', data: JPG }, t + 1); P.putPreview('j3', { mime: 'image/jpeg', data: JPG }, t + 2); P.putPreview('j4', { mime: 'image/jpeg', data: JPG }, t + 3);
  assert.equal(P.previewStats().jobs, 3); assert.equal(P.getPreview('j1'), null, 'the job with the least recent frame is evicted (max 3 here)'); assert.ok(P.getPreview('j2') && P.getPreview('j4'));
  P.dropPreview('j2'); assert.equal(P.getPreview('j2'), null); for (const id of ['j3', 'j4']) P.dropPreview(id); assert.equal(P.previewStats().jobs, 0);
  ok(`store: latest frame per job, ≤ ${P.MAX_FRAME_BYTES} bytes, one frame per 500 ms, max jobs with oldest evicted, dropped on demand`); }

// 3. ComfyUI queue position
{ const q = { queue_running: [[10, 'theirs-a', {}, {}, []]], queue_pending: [[11, 'theirs-b', {}, {}, []], [14, 'mine', {}, {}, []], [12, 'theirs-c', {}, {}, []], [15, 'later', {}, {}, []]] };
  assert.equal(N.comfyQueuePosition(q, 'mine'), 3, 'two pending prompts ahead (numbers 11, 12) → 3rd in line'); assert.equal(N.comfyQueuePosition(q, 'theirs-a'), null, 'running → not pending');
  assert.equal(N.comfyQueuePosition({ queue_pending: [[1, 'mine']] }, 'mine'), 1); ok('comfyQueuePosition: place among ComfyUI\'s pending prompts by queue number'); }

// 4. ComfyNative.run against a fake ComfyUI
{ const graph = { '1': { class_type: 'UNETLoader', inputs: {} }, '2': { class_type: 'KSampler', inputs: {} }, '3': { class_type: 'VAEDecode', inputs: {} }, '4': { class_type: 'SaveImage', inputs: {} } };
  let body: any = null; let done = false; let queuePolls = 0; const PID = 'pid-1';
  const server = http.createServer((req, res) => {
    const json = (o: unknown) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.method === 'POST' && req.url === '/prompt') { let s = ''; req.on('data', (d) => (s += d)); req.on('end', () => { body = JSON.parse(s); json({ prompt_id: PID }); setTimeout(script, 50); }); return; }
    if (req.url === '/queue') { queuePolls++; return json({ queue_running: [[5, 'someone-else', {}, {}, []]], queue_pending: [[6, 'someone-else-2', {}, {}, []], [7, PID, {}, {}, []]] }); }
    if (req.url?.startsWith('/history/')) return json(done ? { [PID]: { status: { completed: true, status_str: 'success' }, outputs: { '4': { images: [{ filename: 'x.png', subfolder: '', type: 'output' }] } } } } : {});
    res.writeHead(404); res.end();
  });
  const wss = new WebSocketServer({ server }); let sock: any = null; wss.on('connection', (s) => { sock = s; });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r())); const port = (server.address() as any).port;
  const send = (type: string, data: object) => sock.send(JSON.stringify({ type, data: { prompt_id: PID, ...data } }));
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function script() {
    await wait(600); // waits in ComfyUI's queue (the first /queue read is immediate)
    send('execution_start', {}); await wait(30); send('executing', { node: '1' }); await wait(30);
    sock.send(frame1(1, JPG)); // a stray frame before the sampler is fine too (it is ours: per-client socket)
    send('executing', { node: '2' }); for (let i = 1; i <= 4; i++) { await wait(30); send('progress', { node: '2', value: i, max: 4 }); sock.send(i % 2 ? frame1(1, JPG) : frame4({ prompt_id: PID, node_id: '2' }, PNGB)); }
    sock.send(frame4({ prompt_id: 'other-prompt', node_id: '2' }, JPG)); // another prompt's frame (metadata says so) → ignored
    await wait(30); send('executing', { node: '3' }); await wait(30); send('executing', { node: '4' }); await wait(30); done = true; send('executing', { node: null });
  }
  const phases: string[] = []; const qpos: number[] = []; const previews: string[] = []; const stepsSeen: number[] = [];
  const c = new N.ComfyNative(`http://127.0.0.1:${port}`);
  const r = await c.run(graph, { previewMethod: 'auto', timeoutMs: 20_000,
    onProgress: (p) => { if (phases.at(-1) !== p.phase) phases.push(p.phase!); if (p.queuePos) qpos.push(p.queuePos); if (p.phase === 'generating' && p.steps) stepsSeen.push(p.steps.value); },
    onPreview: (f) => previews.push(`${f.mime}:${f.promptId ?? '-'}`) });
  assert.equal(r.promptId, PID); assert.deepEqual(body.extra_data, { preview_method: 'auto' }, 'preview method sent per prompt (extra_data)'); assert.equal(body.client_id, c.clientId);
  assert.deepEqual(phases, ['queued', 'loading', 'generating', 'finishing'], phases.join(' → ')); assert.ok(queuePolls >= 1 && qpos.includes(2), `ComfyUI queue position read (${qpos})`);
  assert.deepEqual(stepsSeen.filter((v, i, a) => a.indexOf(v) === i), [1, 2, 3, 4]);
  assert.equal(previews.length, 5, previews.join(',')); assert.ok(previews.includes('image/png:pid-1') && previews.includes('image/jpeg:-')); assert.ok(!previews.some((p) => p.includes('other-prompt')));
  const noPrev = new N.ComfyNative(`http://127.0.0.1:${port}`); done = false; body = null; phases.length = 0;
  await noPrev.run(graph, { timeoutMs: 20_000, onProgress: (p) => { if (phases.at(-1) !== p.phase) phases.push(p.phase!); } }); assert.equal(body.extra_data, undefined, 'no previewMethod → no extra_data');
  wss.close(); server.close();
  ok(`ComfyNative.run on a fake ComfyUI: extra_data.preview_method; phases ${['queued (#2 in ComfyUI\'s queue)', 'loading', 'generating 1–4/4', 'finishing'].join(' → ')}; 5 preview frames of this prompt, another prompt's frame ignored`); }

// 5. progressOf per source
{ const G = await import('../src/progress.ts'); const base: any = { id: 'p1', toolId: 'create-image', provider: 'comfy-klein4b', status: 'running', stage: 'generating', progress: 50, queuePos: 0, eta: 7, input: {}, outputs: [], warnings: [], createdAt: 1 };
  const J = (x: object) => ({ ...base, ...x }) as any;
  assert.deepEqual(G.progressOf(J({ status: 'queued', stage: 'queued', queuePos: 2, route: 'local:comfy-klein4b' })), { stage: 'queued', queuePosition: 2, source: 'local-comfy' });
  assert.deepEqual(G.progressOf(J({ route: 'local:comfy-klein4b', liveStage: 'queued', queuePos: 3, progressKind: 'indeterminate' })), { stage: 'queued', queuePosition: 3, source: 'local-comfy' }, 'waiting in ComfyUI\'s own queue');
  assert.deepEqual(G.progressOf(J({ route: 'local:comfy-klein4b', liveStage: 'loading', progress: 0, progressKind: 'indeterminate', eta: 40, etaRange: null })), { stage: 'loading', source: 'local-comfy' }, 'calibration run: no ETA, no percent');
  assert.deepEqual(G.progressOf(J({ route: 'local:comfy-klein4b', liveStage: 'generating', progressKind: 'steps', steps: { value: 3, max: 4, sampler: 1, samplers: 1 }, progress: 75, eta: 4, etaRange: { seconds: 20, source: 'learned' } })),
    { stage: 'generating', source: 'local-comfy', step: 3, steps: 4, percent: 75, etaSeconds: 4 });
  P.putPreview('p1', { mime: 'image/jpeg', data: JPG }, 5_000_000);
  const withPrev = G.progressOf(J({ route: 'local:comfy-klein4b', liveStage: 'finishing', progressKind: 'steps', progress: 99, steps: { value: 4, max: 4, sampler: 1, samplers: 1 } }));
  assert.equal(withPrev.stage, 'finishing'); assert.equal(withPrev.step, undefined, 'no step counter while finishing'); assert.equal(withPrev.previewUrl, '/api/jobs/p1/preview?at=5000000'); assert.equal(withPrev.previewAt, 5_000_000);
  assert.equal(G.progressOf(J({ status: 'done', stage: 'done', route: 'local:comfy-klein4b' })).previewUrl, undefined, 'no preview once ended'); P.dropPreview('p1');
  assert.deepEqual(G.progressOf(J({ route: 'local:comfy-klein4b', stage: 'downloading_model' })), { stage: 'loading', source: 'local-comfy' });
  assert.deepEqual(G.progressOf(J({ route: 'comfy-cloud:cloud-h3-wf', liveStage: 'queued', queuePos: 0, progressKind: 'indeterminate' })), { stage: 'queued', source: 'comfy-cloud' });
  assert.deepEqual(G.progressOf(J({ route: 'comfy-cloud:cloud-h3-wf', liveStage: 'generating', progressKind: 'steps', progress: 40, steps: null })), { stage: 'generating', source: 'comfy-cloud', percent: 40 }, 'Comfy Cloud reports a value → percent; never steps');
  assert.deepEqual(G.progressOf(J({ route: 'comfy-router:api-gpt-image', stage: 'submitted', queuePos: 4 })), { stage: 'queued', queuePosition: 4, source: 'comfy-router' });
  assert.deepEqual(G.progressOf(J({ route: 'comfy-router:api-gpt-image', stage: 'rendering', progress: 0 })), { stage: 'generating', source: 'comfy-router' }, 'status only: no percent');
  assert.deepEqual(G.progressOf(J({ route: 'fal:fal-ai/qwen-image', stage: 'downloading' })), { stage: 'finishing', source: 'fal' });
  assert.deepEqual(G.progressOf(J({ route: 'replicate:qwen/qwen-image', stage: 'rendering' })), { stage: 'generating', source: 'replicate' });
  assert.deepEqual(G.progressOf(J({ route: 'direct:bfl/flux-3-image-klein', stage: 'submitted' })), { stage: 'queued', source: 'bfl' });
  const m = G.progressOf(J({ route: 'local:comfy-klein4b', simulated: true, progress: 50, eta: 3 })); assert.equal(m.source, 'mock'); assert.equal(m.stage, 'generating'); assert.equal(m.steps, 20); assert.ok(m.step! >= 1 && m.step! <= 20);
  assert.deepEqual(G.progressOf(J({ route: 'fal:fal-ai/qwen-image', simulated: true, stage: 'rendering', progress: 40, eta: 2 })), { stage: 'generating', percent: 40, etaSeconds: 2, source: 'mock' }, 'mock of a hosted place: no steps');
  assert.deepEqual(G.progressOf(J({ status: 'blocked', route: 'fal:x' })), { stage: 'failed', source: 'fal' }); assert.deepEqual(G.progressOf(J({ status: 'canceled', route: 'fal:x' })), { stage: 'canceled', source: 'fal' });
  ok('progressOf: local-comfy (ComfyUI queue → loading → steps + step-ETA → finishing, preview while running), comfy-cloud (percent, no steps), router / fal / replicate / bfl (status only), mock (simulated, marked)'); }
process.exit(0);
