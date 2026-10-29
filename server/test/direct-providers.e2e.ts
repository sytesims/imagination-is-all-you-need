// Official lab APIs end to end against FAKE labs (no network, fake keys, no spend): the app on :8814 (temp data dir, mock backend with
// ROUTING_LIVE=1 so keyed direct routes really call out) talks to a fake MiniMax / LTX / BFL on :8818 through the base-URL overrides.
// For each new route: quote (GET /api/tools/:id/price) → submit with quotedRouteId + quotedCredits → job done on that route, charged the quote,
// output saved locally, real cost recorded where the lab returns it; a MiniMax base_resp 1008 fails as provider_credits; LTX's 429 is waited out.
// Run: npx tsx test/direct-providers.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import http from 'node:http'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'direct-e2e-'));
const KEY = 'test-not-a-real-key'; const PORT = testPort(8814); const PORT_FAKE = testPort(8818); const FAKE = `http://127.0.0.1:${PORT_FAKE}`; const B = `http://localhost:${PORT}`;
const ok = (m: string) => console.log('ok ' + m);
const MP4 = (() => { const f = path.join(D, 'v.mp4'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=1:r=24', '-pix_fmt', 'yuv420p', f]); return fs.readFileSync(f); })();
const MP3 = Buffer.from('ID3fake-mp3-bytes');
const PNG = (() => { const f = path.join(D, 'p.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=16x16', '-frames:v', '1', f]); return fs.readFileSync(f); })();
const log: { method: string; url: string; auth: string }[] = []; let ltxPosts = 0;
const fake = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c; const body = raw ? JSON.parse(raw) : null; const url = req.url ?? ''; log.push({ method: req.method!, url, auth: String(req.headers.authorization ?? req.headers['x-key'] ?? req.headers['x-goog-api-key'] ?? '') });
  const json = (o: unknown, st = 200, h: Record<string, string> = {}) => { res.writeHead(st, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(o)); };
  if (url === '/files/v.mp4') { res.writeHead(200, { 'content-type': 'video/mp4' }); return res.end(MP4); }
  if (url === '/files/a.mp3') { res.writeHead(200, { 'content-type': 'audio/mpeg' }); return res.end(MP3); }
  // MiniMax
  if (url === '/v1/t2a_v2') return json({ data: { audio: `${FAKE}/files/a.mp3`, status: 2 }, extra_info: { usage_characters: body.text.length, audio_format: 'mp3' }, trace_id: 'tr1', base_resp: { status_code: 0, status_msg: 'success' } });
  if (url === '/v1/image_generation') return json({ base_resp: { status_code: 1008, status_msg: 'insufficient balance' } });
  if (url === '/v2/video_generation') { assert.equal(body.model, 'MiniMax-H3'); assert.equal(body.resolution, '768P'); return json({ task_id: 'mm1' }); }
  if (url === '/v2/query/video_generation/mm1') return json({ task: { id: 'mm1', status: 'succeeded', content: { url: `${FAKE}/files/v.mp4` }, usage: { output_seconds: 6, input_image_count: 0 } } });
  // LTX: the first submit is over the queue cap
  if (url === '/v2/text-to-video' && req.method === 'POST') { ltxPosts++; if (ltxPosts === 1) return json({ type: 'error', error: { type: 'rate_limit_error', message: 'queue full' } }, 429, { 'retry-after': '1' }); assert.equal(body.resolution, '1280x720'); return json({ id: 'L1', created_at: 'now' }, 202); }
  if (url === '/v2/text-to-video/L1') return json({ id: 'L1', status: 'completed', result: { video_url: `${FAKE}/files/v.mp4` } });
  // BFL
  if (url === '/v1/flux-3-video') { assert.equal(body.resolution, 'fhd'); return json({ id: 'b1', polling_url: `${FAKE}/v1/get_result?id=b1`, cost: 120 }); }
  if (url.startsWith('/v1/get_result')) return json({ id: 'b1', status: 'Ready', result: { sample: `${FAKE}/files/v.mp4` }, cost: 120 });
  // OpenAI (batch 2): Flare generates; gpt-image-2 answers the org-verification 403
  if (url === '/v1/images/generations') { if (body.model === 'gpt-image-2') return json({ error: { message: 'Your organization must be verified to use the model `gpt-image-2`.', type: 'invalid_request_error', code: null } }, 403);
    assert.equal(body.model, 'gpt-image-2.5-flare'); assert.equal(body.size, '1024x1024'); assert.equal(body.quality, 'medium'); assert.equal(body.n, 1);
    return json({ created: 1, data: [{ b64_json: PNG.toString('base64') }], output_format: 'png', usage: { input_tokens: 20, input_tokens_details: { text_tokens: 20, image_tokens: 0 }, output_tokens: 439, total_tokens: 459 } }); }
  // Google Gemini API (Interactions)
  if (url === '/v1beta/interactions') { assert.equal(req.headers['x-goog-api-key'], KEY); assert.equal(body.model, 'gemini-3.1-flash-lite-image'); assert.equal(body.response_format.image_size, '1K');
    return json({ id: 'g1', status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'image', data: PNG.toString('base64'), mime_type: 'image/png' }] }], usage: { total_input_tokens: 10, total_output_tokens: 1120, output_tokens_by_modality: [{ modality: 'image', tokens: 1120 }] } }); }
  // BytePlus ModelArk (Seedance 2.0 task: submit, then poll)
  if (url === '/api/v3/contents/generations/tasks' && req.method === 'POST') { assert.equal(body.model, 'dreamina-seedance-2-0-260128'); assert.equal(body.resolution, '720p'); assert.equal(body.duration, 5); assert.equal(body.watermark, false); return json({ id: 'cgt-1' }); }
  if (url === '/api/v3/contents/generations/tasks/cgt-1') return json({ id: 'cgt-1', status: 'succeeded', content: { video_url: `${FAKE}/files/v.mp4` }, usage: { completion_tokens: 108000, total_tokens: 108000 } });
  json({ error: 'unknown ' + url }, 404);
});
await new Promise<void>((r) => fake.listen(PORT_FAKE, '127.0.0.1', r));
let proc: ChildProcess | null = null;
try {
  const DD = fs.mkdtempSync(path.join(D, 'data-'));
  proc = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DD, OPENHIGGSFIELD_ENV_FILE: path.join(DD, 'sandbox.env'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_ROUTING_LIVE: '1', OPENHIGGSFIELD_BILLING_MODE: 'team', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(DD, 'nofilm.json'), OPENHIGGSFIELD_MOCK_KEYS: '',
    COMFY_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '',
    OPENHIGGSFIELD_MINIMAX_API_KEY: KEY, OPENHIGGSFIELD_LTX_API_KEY: KEY, OPENHIGGSFIELD_BFL_API_KEY: KEY, OPENHIGGSFIELD_OPENAI_API_KEY: KEY, OPENHIGGSFIELD_GEMINI_API_KEY: KEY, OPENHIGGSFIELD_ARK_API_KEY: KEY,
    OPENHIGGSFIELD_OPENAI_BASE_URL: FAKE, OPENHIGGSFIELD_GEMINI_BASE_URL: FAKE, OPENHIGGSFIELD_ARK_BASE_URL: `${FAKE}/api/v3`,
    OPENHIGGSFIELD_MINIMAX_BASE_URL: FAKE, OPENHIGGSFIELD_LTX_BASE_URL: FAKE, OPENHIGGSFIELD_BFL_BASE_URL: FAKE, OPENHIGGSFIELD_ROUTING_TIMEOUT_MS: '60000' } });
  let err = ''; proc.stderr!.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); });
  let up = false; for (let i = 0; i < 240 && !up; i++) { try { up = (await fetch(`${B}/api/config`)).ok; } catch { /* booting */ } if (!up) await new Promise((r) => setTimeout(r, 250)); }
  if (!up) throw new Error(`server did not start: ${err.slice(-2000)}`);
  const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
  const until = async (id: string) => { for (let i = 0; i < 600; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'canceled', 'blocked', 'needs_decision'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
  /** quote → submit with the quote → finished job */
  const run = async (tool: string, fields: Record<string, string>) => {
    const qs = new URLSearchParams(fields); const qr = await fetch(`${B}/api/tools/${tool}/price?${qs}`); const q = (await qr.json()) as any; assert.equal(qr.status, 200, `${tool} quote: ${JSON.stringify(q).slice(0, 300)}`);
    const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', ...fields, quotedRouteId: q.routeId, quotedCredits: String(q.credits) })) fd.append(k, v);
    const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); const b = (await r.json()) as any; assert.equal(r.status, 200, `${tool} submit: ${JSON.stringify(b).slice(0, 400)}`);
    assert.equal(b.route, q.routeId); assert.equal(b.cost, q.credits, 'quote = charge'); return { q, job: await until(b.id) };
  };
  const done = async (j: any, route: string, credits: number) => { assert.equal(j.status, 'done', `${route}: ${j.error} ${err.slice(-800)}`); assert.equal(j.route, route); assert.equal(j.cost, credits);
    const f = await fetch(B + j.resultUrl); assert.equal(f.status, 200, 'output saved locally'); assert.ok(!j.resultUrl.includes(`127.0.0.1:${testPort(8818)}`)); };

  { const { q, job } = await run('audio', { types: '["voice"]', prompt: 'Hello from the turbo voice.', provider: 'direct-minimax-speech-turbo' });
    assert.equal(q.routeId, 'direct:direct-minimax-speech-turbo'); await done(job, q.routeId, q.credits); assert.match(job.resultUrl, /\.mp3$/);
    assert.equal(job.actualUsd, Math.round(('Hello from the turbo voice.'.length / 1000) * 0.06 * 1e4) / 1e4, 'real cost from usage_characters'); assert.ok(log.some((l) => l.url === '/v1/t2a_v2'));
    ok(`MiniMax Speech 2.8 Turbo on the Audio tool: quoted ${q.credits} = charged; mp3 saved; real cost from usage_characters`); }
  { const { q, job } = await run('h3-video', { types: '["t2v"]', prompt: 'a lighthouse at dusk', provider: 'comfy-h3', route: 'direct:minimax/h3', resolution: '768p', duration: '6', aspect: '16:9' });
    assert.equal(q.routeId, 'direct:minimax/h3'); assert.equal(q.credits, 48); await done(job, q.routeId, 48); assert.equal(job.actualUsd, 0.48);
    ok('MiniMax H3 (MiniMax API) on Generate Video: 768p × 6 s = 48 credits quoted and charged; real cost 6 s × $0.08'); }
  { const t0 = Date.now(); const { q, job } = await run('h3-video', { types: '["t2v"]', prompt: 'an eagle over clouds', provider: 'direct-ltx-25-fast', resolution: '720p', duration: '6', aspect: '16:9' });
    assert.equal(q.routeId, 'direct:direct-ltx-25-fast'); assert.equal(q.credits, 54); await done(job, q.routeId, 54); assert.equal(ltxPosts, 2, 'the 429 was waited out, then submitted again'); assert.ok(Date.now() - t0 >= 1000);
    ok('LTX-2.5 Fast (LTX API): 720p × 6 s = 54 credits; 429 + Retry-After waited, submitted again, polled, saved'); }
  { const { q, job } = await run('h3-video', { types: '["t2v"]', prompt: 'a fox in the mist', provider: 'direct-flux3-video', resolution: '1080p', duration: '5', aspect: '16:9' });
    assert.equal(q.routeId, 'direct:direct-flux3-video'); assert.equal(q.credits, 120); await done(job, q.routeId, 120); assert.equal(job.actualUsd, 1.2);
    ok('FLUX 3 Video (BFL API): 1080p × 5 s = 120 credits; BFL settled cost recorded'); }
  { const { q, job } = await run('create-image', { types: '["generate"]', prompt: 'a red kite', provider: 'direct-minimax-image', imageResolution: '1K' });
    assert.equal(q.routeId, 'direct:direct-minimax-image'); assert.equal(job.status, 'failed'); assert.equal(job.reasonCode, 'provider_credits'); assert.equal(job.errorType, 'credits');
    ok('MiniMax image-01: base_resp 1008 inside a 200 → failed, reasonCode provider_credits (noCredits)'); }
  // ---- batch 2 ----
  { const { q, job } = await run('create-image', { types: '["generate"]', prompt: 'a paper boat', provider: 'api-gpt-image-25-flare', route: 'direct:openai/gpt-image-2.5-flare', imageResolution: '1K', quality: 'med', aspect: '1:1' });
    assert.equal(q.routeId, 'direct:openai/gpt-image-2.5-flare'); await done(job, q.routeId, q.credits); assert.match(job.resultUrl, /\.png$/);
    assert.equal(job.actualUsd, Math.round(((20 * 5 + 439 * 30) / 1e6) * 1e4) / 1e4, 'real cost from usage tokens');
    ok(`GPT Image 2.5 Flare (OpenAI API): quoted ${q.credits} = charged; base64 PNG saved; real cost from usage`); }
  { const { q, job } = await run('create-image', { types: '["generate"]', prompt: 'a paper boat', provider: 'api-gpt-image', route: 'direct:openai/gpt-image-2', imageResolution: '1K', quality: 'low', aspect: '1:1' });
    assert.equal(job.status, 'failed'); assert.equal(job.reasonCode, 'key_invalid'); assert.match(String(job.error), /verified organization/);
    ok('GPT Image 2 (OpenAI API): org-verification 403 → failed, key_invalid with the friendly line'); }
  { const { q, job } = await run('create-image', { types: '["generate"]', prompt: 'a lemon', provider: 'direct-gemini-nb2-lite', imageResolution: '1K', aspect: '1:1' });
    assert.equal(q.routeId, 'direct:direct-gemini-nb2-lite'); assert.equal(q.credits, 4 /* $0.0372 rounded up per request */); await done(job, q.routeId, 4); assert.ok(job.actualUsd > 0, 'real cost from usage');
    ok('Nano Banana 2 Lite (Gemini API, new model): 4 credits quoted and charged; x-goog-api-key header; image saved'); }
  { const { q, job } = await run('h3-video', { types: '["t2v"]', prompt: 'waves on a pier', provider: 'router-seedance', route: 'direct:byteplus/seedance-2.0', resolution: '720p', duration: '5', aspect: '16:9' });
    assert.equal(q.routeId, 'direct:byteplus/seedance-2.0'); await done(job, q.routeId, q.credits); assert.equal(job.actualUsd, 0.756, '108,000 tokens × $7 / 1M');
    ok(`Seedance 2.0 (BytePlus ModelArk) on Generate Video: 720p × 5 s quoted ${q.credits} = charged; polled; real cost from usage.completion_tokens`); }
  { const mm = log.filter((l) => /t2a_v2|video_generation|image_generation/.test(l.url)); assert.ok(mm.every((l) => l.auth === `Bearer ${KEY}`)); assert.ok(log.filter((l) => l.url.startsWith('/v1/flux') || l.url.startsWith('/v1/get_result')).every((l) => l.auth === KEY));
    assert.ok(log.filter((l) => /^\/(v1\/images|api\/v3\/contents)/.test(l.url)).every((l) => l.auth === `Bearer ${KEY}`), 'Bearer for OpenAI / BytePlus'); assert.ok(log.filter((l) => l.url.startsWith('/v1beta/')).every((l) => l.auth === KEY), 'x-goog-api-key for Gemini');
    assert.ok(log.filter((l) => l.url.startsWith('/files/')).every((l) => !l.auth), 'the key never goes with a result download'); assert.ok(log.every((l) => !l.url.includes(KEY)), 'never in a URL');
    ok('keys: Bearer for MiniMax / LTX, x-key for BFL, only on lab calls, never on downloads or in URLs'); }
  console.log('ALL OK direct-providers e2e');
} finally { if (proc?.pid) { try { process.kill(-proc.pid, 'SIGTERM'); } catch { /* gone */ } } fake.close(); setTimeout(() => fs.rmSync(D, { recursive: true, force: true }), 500); }
