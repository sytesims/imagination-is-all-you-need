// Comfy Router runner (comfyRouter.ts + routing/routerModels.ts + routing/routerRun.ts) against a FAKE api.comfy.org (no network, fake key, no spend).
// Unit (in process): error mapping for every Router bucket; estimate parsing; the queued loop waits the Retry-After the server names and
//  collects once; a timeout cancels; the key never leaves the Router host; bodies for representative models follow their Router schema.
// E2E: two servers on the mock backend (:8792 keyless, :8791 COMFY_API_KEY=test-not-a-real-key, OPENHIGGSFIELD_COMFY_ROUTER_URL → fake :8793):
//  listing (keyless key_missing "Add a Comfy Cloud key", keyed runnable, Hunyuan / Meta Muse coming soon), long jobs (GPT Image ×2, Seedream
//  edit, Ideogram, Kling Image, Seedance video) submit → poll → collect → stored, a short job (ElevenLabs SFX, synchronous bytes), the
//  X-Comfy-Credits-Used cost in the spend log, the estimate gate, every error (no credits, no API access, refused, bad input, timeout) with
//  one submit and the credits back, and an input the route can't take refused before anything is charged.
// Run: npx tsx test/router-runner.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import http from 'node:http'; import os from 'node:os'; import path from 'node:path'; import { randomUUID } from 'node:crypto';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'router-'));
const KEY = 'test-not-a-real-key'; const PORT_FAKE = testPort(8793); const FAKE = `http://127.0.0.1:${PORT_FAKE}`;
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const ok = (m: string) => console.log('ok ' + m);
Object.assign(process.env, NOKEYS, { OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(D, 'unit-')), OPENHIGGSFIELD_BACKEND: 'mock' });
const PNG = path.join(D, 'in.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=512x512', '-frames:v', '1', PNG]);
const OUTB = (() => { const f = path.join(D, 'out.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=64x64', '-frames:v', '1', f]); return fs.readFileSync(f); })();
const MP4 = (() => { const f = path.join(D, 'out.mp4'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=1:r=24', '-pix_fmt', 'yuv420p', f]); return fs.readFileSync(f); })();
const MP3 = Buffer.from('ID3fake-mp3-bytes');

// ---------------- unit ----------------
const R = await import('../src/comfyRouter.ts'); const M = await import('../src/routing/routerModels.ts');
{
  const e = (st: number, et: string | null, body = '') => R.routerErrorFor(st, et, body);
  assert.equal(e(401, 'unauthorized').reasonCode, 'key_invalid'); assert.equal(e(402, 'insufficient_credits').reasonCode, 'cloud_credits');
  for (const et of ['forbidden', null]) { const x = e(403, et); assert.equal(x.reasonCode, 'cloud_plan'); assert.match(x.message, /Comfy plan doesn't include API access; Standard or higher is needed/); assert.equal(x.temporary, false); }
  { const x = e(403, 'not_enabled'); assert.equal(x.reasonCode, 'route_not_enabled'); assert.match(x.message, /Comfy Router doesn't run this model yet/); assert.equal(x.temporary, false); } // not_enabled = Router off for this model, not the plan
  assert.equal(e(400, 'content_policy_violation').reasonCode, 'content_blocked'); assert.equal(e(404, 'model_not_found').reasonCode, 'model_unavailable');
  const v = e(422, 'invalid_input', JSON.stringify({ detail: [{ loc: ['body', 'size'], msg: 'bad size', type: 'value_error' }] })); assert.equal(v.reasonCode, 'input_invalid'); assert.match(v.message, /size: bad size/);
  for (const [st, et] of [[429, 'concurrency_limit_exceeded'], [429, 'rate_limited'], [429, 'queue_backlog_full']] as const) { assert.equal(e(st, et).reasonCode, 'queue_full'); assert.equal(e(st, et).temporary, true); }
  for (const et of ['provider_timeout', 'deadline_exceeded', 'queue_timeout']) assert.equal(e(504, et).reasonCode, 'cloud_timeout');
  assert.equal(e(502, 'provider_error').reasonCode, 'provider_error'); assert.equal(e(503, 'service_unavailable').reasonCode, 'cloud_unreachable'); assert.equal(e(500, 'something_new').reasonCode, 'cloud_unreachable');
  assert.equal(e(0, 'content_policy_violation').reasonCode, 'content_blocked', 'a failed COMPLETED request maps by its error_type');
  assert.deepEqual(R.parseEstimate({ source: 'exact', amount: '0.04', credits: 8.44 }), { source: 'exact', usd: 0.04, minUsd: null, maxUsd: null, credits: 8.44 });
  assert.equal(R.parseEstimate({ source: 'weird' }).source, 'unknown'); assert.equal(R.parseEstimate({ source: 'estimated', min_amount: '0.01', max_amount: '0.05' }).maxUsd, 0.05);
  ok('error buckets → reasons (401 key, 402 credits, 403 forbidden/bare → plan, 403 not_enabled → route_not_enabled, policy → refused, 404, 422 detail, 429 busy, 504 timeouts, unknown → retryable); estimate parsing');
  // queued loop with a fake fetch: Retry-After honoured, collected once, key only on the Router host
  { const calls: { url: string; method: string; key?: string }[] = []; const sleeps: number[] = []; let polls = 0; const base = 'https://router.test';
    const h = { request_id: randomUUID(), status: 'IN_QUEUE', status_url: `${base}/v2/models/openai/gpt-image-2/requests/x/status`, response_url: `${base}/v2/models/openai/gpt-image-2/requests/x`, cancel_url: `${base}/v2/models/openai/gpt-image-2/requests/x/cancel` };
    const f = (async (u: any, init: any = {}) => { calls.push({ url: String(u), method: init.method ?? 'GET', key: init.headers?.['X-API-Key'] });
      if (String(u).endsWith('/requests?fallback_provider=false') && init.method === 'POST') return new Response(JSON.stringify(h), { status: 201, headers: { 'content-type': 'application/json' } });
      if (String(u).endsWith('/status')) { polls++; return new Response(JSON.stringify({ ...h, status: polls < 2 ? 'IN_QUEUE' : polls < 3 ? 'IN_PROGRESS' : 'COMPLETED' }), { status: 200, headers: { 'content-type': 'application/json', 'retry-after': polls < 2 ? '2' : '1' } }); }
      return new Response(JSON.stringify({ data: [{ url: 'https://x/y.png' }] }), { status: 200, headers: { 'content-type': 'application/json', 'x-comfy-credits-used': '12.5' } }); }) as typeof fetch;
    const c = new R.ComfyRouter(KEY, f, base, async (ms) => { sleeps.push(ms); }, 1);
    const r = await c.runQueued('openai/gpt-image-2', { prompt: 'x' }, 'idem-1'); assert.equal(r.creditsUsed, 12.5); assert.deepEqual(r.json, { data: [{ url: 'https://x/y.png' }] });
    assert.deepEqual(sleeps, [2000, 1000], 'waits the Retry-After of each status read'); assert.equal(calls.filter((x) => x.method === 'POST').length, 1); assert.ok(calls.every((x) => x.key === KEY));
    const bad = new R.ComfyRouter(KEY, (async () => new Response(JSON.stringify({ ...h, status_url: 'https://evil.test/s' }), { status: 201, headers: { 'content-type': 'application/json' } })) as any, base, async () => {});
    await assert.rejects(bad.runQueued('openai/gpt-image-2', {}, 'k'), (x: any) => /refused to send the key/.test(x.detail));
    // timeout → cancel
    const seen: string[] = []; const slow = (async (u: any, init: any = {}) => { seen.push(`${init.method ?? 'GET'} ${u}`); if (String(u).endsWith('/requests?fallback_provider=false')) return new Response(JSON.stringify(h), { status: 201, headers: { 'content-type': 'application/json' } });
      if (String(u).endsWith('/cancel')) return new Response(JSON.stringify({ request_id: h.request_id, status: 'CANCELLATION_REQUESTED' }), { status: 202 }); return new Response(JSON.stringify({ ...h, status: 'IN_PROGRESS' }), { status: 200, headers: { 'content-type': 'application/json' } }); }) as typeof fetch;
    await assert.rejects(new R.ComfyRouter(KEY, slow, base, async () => { await new Promise((ok2) => setTimeout(ok2, 5)); }).runQueued('openai/gpt-image-2', {}, 'k', { timeoutMs: 30 }), (x: any) => x.reasonCode === 'cloud_timeout');
    assert.ok(seen.some((s) => s.startsWith('PUT') && s.endsWith('/cancel')), 'timeout asks Router to cancel'); }
  ok('queued loop: submit once → status (Retry-After 2 s, then 1 s) → collect; cost header read; a status URL on another host is refused (key never sent there); timeout → PUT cancel');
  // bodies follow the Router schemas
  { const gi = { types: ['generate'], prompt: 'a kite', aspect: '9:16', tier: 'high', seed: 5, n: 2 };
    const g = await M.ROUTER_MODELS['api-gpt-image'].body(gi, 1); assert.deepEqual(g, { prompt: 'a kite', quality: 'high', size: '864x1536', n: 1, output_format: 'png' }); // 9:16 at 1K (gptImageSizes.ts, since the real-sizes merge)
    const s = await M.ROUTER_MODELS['api-seedream'].body({ types: ['edit'], prompt: 'p', aspect: '16:9', imageResolution: '2K', refPaths: [PNG], seed: 3 }, 0) as any;
    assert.equal(s.size, '2560x1440'); /* exact 16:9 at 2K (shared/routerImageSizes.ts) */ assert.equal(s.seed, 3); assert.match(s.image[0], /^data:image\/png;base64,/); assert.equal(s.watermark, false);
    const id = await M.ROUTER_MODELS['api-ideogram'].body({ prompt: 'p', aspect: '3:4', tier: 'low' }, 0); assert.deepEqual(id, { text_prompt: 'p', rendering_speed: 'TURBO', resolution: '1728x2304' });
    const k = await M.ROUTER_MODELS['api-kling-image'].body({ types: ['edit'], prompt: 'p', aspect: '21:9', imageResolution: '4K', refPaths: [PNG] }, 0) as any; assert.equal(k.resolution, '4k'); assert.equal(k.aspect_ratio, '21:9'); assert.ok(k.image_list[0].image.length > 10);
    const nb = await M.ROUTER_MODELS['api-nano-banana'].body({ prompt: 'p', aspect: '4:5', imageResolution: '2K' }, 0) as any; assert.deepEqual(nb.generationConfig, { responseModalities: ['IMAGE'], imageConfig: { imageSize: '2K', aspectRatio: '4:5' } });
    const sd = await M.ROUTER_MODELS['router-seedance'].body({ mode: 'i2v', prompt: 'p', imagePath: PNG, duration: 5, resolution: '720p' }, 0) as any; assert.equal(sd.content[1].role, 'first_frame'); assert.equal(sd.ratio, 'adaptive');
    assert.match(M.ROUTER_MODELS['api-ideogram'].block!({ types: ['edit'], refPaths: [PNG] })!, /prompt only/); assert.equal(M.ROUTER_MODELS['router-kling'].block!({ mode: 'i2v', imagePath: PNG }), null) /* Kling 3.0 Omni takes a first frame (2026-10-25) */; assert.match(M.ROUTER_MODELS['router-ltx-25-pro'].block!({ mode: 'i2v', imagePath: PNG })!, /text to video only/);
    assert.deepEqual(M.ROUTER_MODELS['api-nano-banana'].outputs({ promptFeedback: { blockReason: 'SAFETY' } }), { refused: 'SAFETY' }); }
  ok('bodies: GPT (9:16 → 864x1536, quality, n 1 per image, seed+k), Seedream (2K 16:9 → 2728x1536, ref as data URI), Ideogram (TURBO, 1728x2304), Kling (4k, image_list), Nano Banana (imageConfig), Seedance i2v (first_frame); blocks; in-result refusals');
}

// ---------------- fake api.comfy.org ----------------
type FR = { id: string; model: string; body: any; polls: number; mode: string; canceled: boolean };
const reqs = new Map<string, FR>(); const log: { method: string; url: string; key?: string; idem?: string }[] = []; const estimates: string[] = [];
const PRICE: Record<string, number> = {}; // per model USD estimate (default 0.01)
let failSecondN = 0; // FAILSECOND: the 2nd Router submit with that marker is refused (a partial n>1 run)
const modeOf = (s: string) => (/NOESTIMATE/.test(s) ? 'noest' : /FAILSECOND/.test(s) ? 'failsecond' : /NOCREDITS/.test(s) ? 'nocredits' : /NOAPI/.test(s) ? 'noapi' : /BADINPUT/.test(s) ? 'bad' : /REFUSEME/.test(s) ? 'refused' : /SLOWME/.test(s) ? 'slow' : /PRICEY/.test(s) ? 'pricey' : 'ok');
const asset = (n: string) => `${FAKE}/assets/${n}`;
const NATIVE = (model: string, id: string): any => {
  if (model === 'openai/gpt-image-2') return { data: [{ b64_json: OUTB.toString('base64') }] };
  if (model.startsWith('byteplus/seedream')) return { data: [{ url: asset(`${id}.png`), size: '2048x1152' }] };
  if (model === 'ideogram/ideogram-v4') return { data: [{ url: asset(`${id}.png`), is_image_safe: true }] };
  if (model === 'kling/kling-image-o1') return { code: 0, data: { task_status: 'succeed', task_result: { images: [{ index: 0, url: asset(`${id}.png`) }] } } };
  if (model.startsWith('byteplus/dreamina-seedance')) return { status: 'succeeded', content: { video_url: asset(`${id}.mp4`) } };
  if (model.startsWith('vertexai/gemini')) return { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: OUTB.toString('base64') } }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 1120, thoughtsTokenCount: 300 } };
  return { data: [{ url: asset(`${id}.png`) }] };
};
const fake = http.createServer(async (req, res) => {
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); const raw = Buffer.concat(chunks).toString();
  log.push({ method: req.method!, url: req.url!, key: req.headers['x-api-key'] as string | undefined, idem: req.headers['idempotency-key'] as string | undefined });
  const send = (code: number, o: any, h: Record<string, string> = {}) => { res.writeHead(code, { 'content-type': 'application/json', 'x-comfy-request-id': randomUUID(), ...h }); res.end(JSON.stringify(o)); };
  const err = (code: number, et: string, detail: any = et) => send(code, typeof detail === 'string' ? { detail, error_type: et } : { detail }, { 'x-comfy-error-type': et });
  if (req.url!.startsWith('/assets/')) { const v = req.url!.endsWith('.mp4'); res.writeHead(200, { 'content-type': v ? 'video/mp4' : 'image/png' }); return res.end(v ? MP4 : OUTB); }
  if (req.headers['x-api-key'] !== KEY) return err(401, 'unauthorized', 'no usable credential');
  let m = /^\/v2\/models\/([^/]+)\/([^/]+)(\/estimate|\/requests)?(?:\?fallback_provider=false)?$/.exec(req.url!);
  if (m && req.method === 'POST') { const model = `${m[1]}/${m[2]}`; const mode = modeOf(raw); const body = JSON.parse(raw || '{}');
    if (m[3] === '/estimate') { estimates.push(model); if (mode === 'nocredits') return err(402, 'insufficient_credits', 'add credits');
      if (model === 'ideogram/ideogram-v4') return err(403, 'not_enabled', 'estimate rolling out'); // "no estimate": the run goes on
      if (mode === 'noest') return send(200, { source: 'unknown', currency: 'USD', provider: m[1], model }); // Comfy can't price it ahead
      const est = /EST=([0-9.]+)/.exec(raw); // EST=<usd>: the exact estimate this run gets
      const usd = est ? Number(est[1]) : mode === 'pricey' ? 5 : PRICE[model] ?? 0.01; return send(200, { source: 'exact', currency: 'USD', amount: usd.toFixed(4), amount_cents: usd * 100, credits: Math.round(usd * 211 * 100) / 100, provider: m[1], model, pricing_as_of: new Date().toISOString() }); }
    if (mode === 'nocredits') return err(402, 'insufficient_credits', 'The calling workspace does not have enough credits');
    if (mode === 'noapi') return err(403, 'forbidden', 'The credential is not entitled to this model');
    if (mode === 'bad') return err(422, 'invalid_input', [{ loc: ['body', 'size'], msg: 'size out of range', type: 'value_error' }]);
    if (!m[3]) { // synchronous: ElevenLabs answers raw audio bytes
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'x-comfy-credits-used': '29.54', 'x-comfy-request-id': randomUUID(), 'x-content-type-options': 'nosniff' }); return res.end(MP3); }
    const id = randomUUID(); const base = `${FAKE}/v2/models/${m[1]}/${m[2]}/requests/${id}`; reqs.set(id, { id, model, body, polls: 0, mode: mode === 'failsecond' ? (++failSecondN % 2 === 0 ? 'refused' : 'ok') : mode, canceled: false });
    return send(201, { request_id: id, status: 'IN_QUEUE', queue_position: 2, status_url: `${base}/status`, response_url: base, cancel_url: `${base}/cancel` }); }
  m = /^\/v2\/models\/[^/]+\/[^/]+\/requests\/([^/]+)(\/status|\/cancel)?$/.exec(req.url!);
  if (m) { const r = reqs.get(m[1]); if (!r) return err(404, 'request_not_found');
    if (m[2] === '/cancel') { r.canceled = true; return send(202, { request_id: r.id, status: 'CANCELLATION_REQUESTED' }); }
    const done = r.mode !== 'slow' && r.polls >= 2; const failed = r.canceled ? 'cancelled' : r.mode === 'refused' ? 'content_policy_violation' : null;
    if (m[2] === '/status') { r.polls++; const s = r.canceled || done ? 'COMPLETED' : r.polls < 2 ? 'IN_QUEUE' : 'IN_PROGRESS';
      return send(200, { request_id: r.id, status: s, ...(s === 'IN_QUEUE' ? { queue_position: 1 } : {}), ...(s === 'COMPLETED' && failed ? { error_type: failed } : {}), status_url: '', response_url: '', cancel_url: '' }, { 'retry-after': s === 'IN_QUEUE' ? '2' : '1' }); }
    if (!done) return send(202, { request_id: r.id, status: 'IN_PROGRESS' }, { 'retry-after': '1' });
    if (failed) return err(400, failed, 'refused');
    return send(200, NATIVE(r.model, r.id), { 'x-comfy-credits-used': '12.66' }); }
  err(404, 'model_not_found', 'unknown');
});
await new Promise<void>((r) => fake.listen(PORT_FAKE, '127.0.0.1', r));
const procs: ChildProcess[] = [];
async function boot(port: number, extra: Record<string, string>) {
  const DD = fs.mkdtempSync(path.join(D, 'data-'));
  const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ...NOKEYS, ...extra, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: DD, OPENHIGGSFIELD_ENV_FILE: path.join(DD, 'sandbox.env'),
    OPENHIGGSFIELD_BILLING_MODE: 'team', OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(DD, 'nofilm.json'),
    OPENHIGGSFIELD_COMFY_ROUTER_URL: FAKE, OPENHIGGSFIELD_ROUTER_RETRY_SCALE: '0.02', OPENHIGGSFIELD_ROUTING_TIMEOUT_MS: '3000' } });
  let err = ''; p.stderr!.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); }); procs.push(p); const B = `http://localhost:${port}`;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) return { B, err: () => err }; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  throw new Error(`server :${port} did not start: ${err.slice(-2000)}`);
}
const J = async (r: Response) => ({ status: r.status, body: (await r.json()) as any });
const post = async (B: string, tool: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', ...f })) fd.append(k, v);
  for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)], { type: 'image/png' }), path.basename(p)); return J(await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd })); };
const get = async (B: string, u: string) => (await (await fetch(B + u)).json()) as any;
const until = async (B: string, id: string) => { for (let i = 0; i < 600; i++) { const j = await get(B, `/api/jobs/${id}`); if (['done', 'failed', 'canceled', 'blocked', 'needs_decision'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 50)); } throw new Error('timeout ' + id); };
const balance = async (B: string) => (await get(B, '/api/ledger')).balance as number;
const routeOf = async (B: string, tool: string, model: string, types = 'generate') => ((await get(B, `/api/routes?toolId=${tool}&modelId=${model}&types=${types}`)).routes[0].routes as any[]).find((x) => x.routeId === `comfy-router:${model}`);
const submits = () => log.filter((l) => l.method === 'POST' && /\/requests\?fallback_provider=false$|^\/v2\/models\/[^/]+\/[^/]+\?fallback_provider=false$/.test(l.url)).length;
try {
  const [N, K] = await Promise.all([boot(testPort(8792), {}), boot(testPort(8791), { COMFY_API_KEY: KEY })]);
  // ---- listing ----
  const IMG13 = ['api-gpt-image', 'api-seedream', 'api-ideogram', 'api-recraft', 'api-luma-image', 'api-kling-image', 'api-krea', 'api-runway-image', 'api-grok-image', 'api-qwen-image', 'api-wan-image', 'api-nano-banana', 'api-flux2'];
  for (const m of IMG13) { const r = await routeOf(N.B, 'create-image', m); assert.equal(r.reasonCode, 'key_missing', `${m}: ${JSON.stringify(r)}`); assert.match(r.reason, /Comfy Cloud key/); /* mock backend: "Sample output… Real runs need a Comfy Cloud key"; real backend: "Add a Comfy Cloud key in Settings…" */ assert.equal(r.wired, true);
    const k = await routeOf(K.B, 'create-image', m); assert.equal(k.available, true, `${m} keyed: ${JSON.stringify(k)}`); assert.notEqual(k.reasonCode, 'not_wired'); assert.match(k.endpoint, /\/v2\/models\/[a-z0-9_]+\/[a-z0-9._-]+\/requests\?fallback_provider=false$/i); assert.ok(k.caps?.routerModel); }
  for (const m of ['api-hunyuan-image', 'api-meta-muse']) { const k = await routeOf(K.B, 'create-image', m); assert.equal(k.available, false); assert.equal(k.reasonCode, 'not_wired', JSON.stringify(k)); } // not in the Router catalog: stays not_wired ("Coming soon" in the picker)
  { const v = await routeOf(K.B, 'h3-video', 'router-seedance', 't2v'); assert.equal(v.available, true, JSON.stringify(v)); const a = await routeOf(K.B, 'audio', 'api-eleven-sfx', 'sfx'); assert.equal(a.available, true, JSON.stringify(a)); assert.doesNotMatch(a.endpoint, /\/requests/, 'ElevenLabs runs on the synchronous route'); assert.match(a.endpoint, /eleven[^/]*\?fallback_provider=false$/); }
  { const q = await get(K.B, '/api/tools/create-image/price?types=generate&provider=api-seedream'); assert.equal(q.runnable, true, JSON.stringify(q)); assert.equal(q.demo, false); assert.ok(q.credits > 0); }
  ok('listing: 13 image models keyless → key_missing "Add a Comfy Cloud key…", keyed → runnable on POST …/requests (never not_wired); Hunyuan / Meta Muse stay not_wired (Coming soon); Seedance video + ElevenLabs SFX runnable');
  // ---- long (queued) jobs ----
  const CASES: { tool: string; f: Record<string, string>; files?: [string, string][]; model: string; outs: number; check?: (bodies: any[]) => void }[] = [
    { tool: 'create-image', model: 'openai/gpt-image-2', outs: 2, f: { provider: 'api-gpt-image', types: '["generate"]', prompt: 'a lighthouse at dusk', aspect: '1:1', quality: 'low', n: '2', seed: '12' }, check: (b) => { assert.deepEqual(b.map((x) => x.n), [1, 1]); assert.equal(b[0].quality, 'low'); } },
    { tool: 'create-image', model: 'byteplus/seedream-5-0-pro-260628', outs: 1, f: { provider: 'api-seedream', types: '["edit"]', prompt: 'a paper boat', aspect: '16:9', imageResolution: '2K', seed: '11' }, files: [['image', PNG]], check: (b) => { assert.match(b[0].image[0], /^data:image\/png;base64,/); assert.equal(b[0].size, '2560x1440'); } },
    { tool: 'create-image', model: 'ideogram/ideogram-v4', outs: 1, f: { provider: 'api-ideogram', types: '["generate"]', prompt: 'a poster that says HELLO', aspect: '4:3', quality: 'high' }, check: (b) => assert.equal(b[0].rendering_speed, 'QUALITY') },
    { tool: 'create-image', model: 'kling/kling-image-o1', outs: 1, f: { provider: 'api-kling-image', types: '["generate"]', prompt: 'a fox in snow', aspect: '9:16', imageResolution: '2K' }, check: (b) => assert.equal(b[0].resolution, '2k') },
    { tool: 'h3-video', model: 'byteplus/dreamina-seedance-2-0-260128', outs: 1, f: { provider: 'router-seedance', types: '["t2v"]', prompt: 'a red fox trotting through snow', seconds: '5', resolution: '720p' }, check: (b) => assert.equal(b[0].content[0].type, 'text') },
  ];
  for (const c of CASES) {
    const b0 = await balance(K.B); const before = new Set(reqs.keys());
    const s = await post(K.B, c.tool, c.f, c.files ?? []); assert.equal(s.status, 200, `${c.model}: ${JSON.stringify(s.body)}`); assert.ok(s.body.cost > 0, `${c.model} charged`);
    const d = await until(K.B, s.body.id); assert.equal(d.status, 'done', `${c.model}: ${d.error} ${K.err().slice(-1500)}`); assert.equal(d.outputs.length, c.outs); assert.ok(!d.demo);
    const mine = [...reqs.values()].filter((x) => !before.has(x.id)); assert.equal(mine.length, c.outs, `${c.model}: one Router request per output`); assert.ok(mine.every((x) => x.model === c.model && x.polls >= 3));
    assert.ok(mine.some((x) => x.id === d.routerRequestId), `${c.model}: Router request id stored (${d.routerRequestId})`); c.check?.(mine.map((x) => x.body));
    const wantUsd = Math.round((12.66 * c.outs / 211) * 1e4) / 1e4;
    assert.equal(await balance(K.B), b0 - s.body.cost, `${c.model}: charged = quote`);
    const out = await fetch(K.B + d.outputs[0].url); assert.equal(out.status, 200); assert.ok((await out.arrayBuffer()).byteLength > 10);
    const sp = (await get(K.B, `/api/spend?tool=${c.tool}`)).items.find((r: any) => r.jobId === d.id); assert.ok(sp, 'spend row'); assert.equal(sp.billedTo, 'comfy'); assert.equal(sp.actualUsd, wantUsd, `actual = X-Comfy-Credits-Used ${12.66 * c.outs} / 211`); assert.equal(sp.actualSource, 'comfy-router:credits-used');
    ok(`${c.model}: ✦${s.body.cost} charged = quote; ${c.outs} queued request(s) → status ×${mine[0].polls} (Retry-After) → collect → stored; X-Comfy-Credits-Used ${12.66 * c.outs} → spend actual $${sp.actualUsd}`);
  }
  assert.ok(estimates.includes('openai/gpt-image-2') && estimates.includes('ideogram/ideogram-v4'), 'priced first (estimate called; 403 not_enabled = no estimate, run goes on)');
  // ---- short (synchronous) job: ElevenLabs SFX bytes ----
  { const before = submits(); const s = await post(K.B, 'audio', { provider: 'api-eleven-sfx', types: '["sfx"]', prompt: 'thunder rolling across a valley', duration: '10' }); assert.equal(s.status, 200, JSON.stringify(s.body));
    const d = await until(K.B, s.body.id); assert.equal(d.status, 'done', `${d.error} ${K.err().slice(-800)}`); assert.equal(submits() - before, 1); assert.match(d.outputs[0].url, /\.mp3$/);
    assert.equal(Buffer.from(await (await fetch(K.B + d.outputs[0].url)).arrayBuffer()).toString(), MP3.toString()); const sp = (await get(K.B, '/api/spend?tool=audio')).items.find((r: any) => r.jobId === d.id); assert.equal(sp.actualUsd, Math.round((29.54 / 211) * 1e4) / 1e4);
    assert.ok(log.some((l) => l.method === 'POST' && l.url === '/v2/models/elevenlabs/eleven_sfx_v2?fallback_provider=false')); ok('ElevenLabs SFX: synchronous POST /v2/models/elevenlabs/eleven_sfx_v2?fallback_provider=false → audio/mpeg bytes stored as .mp3, credits header recorded'); }
  // ---- estimate gate: Comfy prices it above the quote → not started, nothing dispatched ----
  { const b0 = await balance(K.B); const before = submits(); const s = await post(K.B, 'create-image', { provider: 'api-seedream', types: '["generate"]', prompt: 'PRICEY boat', aspect: '1:1' }); const d = await until(K.B, s.body.id);
    assert.equal(d.status, 'failed'); assert.equal(d.reasonCode, 'price_changed'); assert.match(d.error, /prices this run above the quote/); assert.equal(submits(), before, 'nothing submitted');
    for (let i = 0; i < 40 && (await balance(K.B)) !== b0; i++) await new Promise((r) => setTimeout(r, 50)); assert.equal(await balance(K.B), b0); }
  ok('price first: an estimate above the accepted quote stops the run before any submit; credits back');

  // ---- hard rule: the charge never exceeds the quote (2026-10-24: quote + $0.002 margin, was 1.25×) ----
  { const q = await get(K.B, '/api/tools/create-image/price?types=generate&provider=api-kling-image&aspect=1:1'); const quoteUsd = q.credits / 100; assert.ok(q.credits > 0, JSON.stringify(q));
    // just above quote + margin → refused before any submit, credits back
    { const b0 = await balance(K.B); const before = submits(); const est = (quoteUsd + 0.0025).toFixed(4);
      const s = await post(K.B, 'create-image', { provider: 'api-kling-image', types: '["generate"]', prompt: `a fox EST=${est}`, aspect: '1:1' }); assert.equal(s.status, 200, JSON.stringify(s.body)); assert.equal(s.body.cost, q.credits, 'charged = the quote the price endpoint showed');
      const d = await until(K.B, s.body.id); assert.equal(d.status, 'failed', `${d.status} ${d.error}`); assert.equal(d.reasonCode, 'price_changed'); assert.match(d.error, new RegExp(`\\$${est.replace('.', '\\.')} now`)); assert.equal(submits(), before, 'nothing submitted');
      for (let i = 0; i < 40 && (await balance(K.B)) !== b0; i++) await new Promise((r) => setTimeout(r, 50)); assert.equal(await balance(K.B), b0, 'credits back'); }
    // within the rounding margin → runs
    { const s = await post(K.B, 'create-image', { provider: 'api-kling-image', types: '["generate"]', prompt: `a fox EST=${(quoteUsd + 0.0015).toFixed(4)}`, aspect: '1:1' }); const d = await until(K.B, s.body.id); assert.equal(d.status, 'done', `${d.error} ${K.err().slice(-800)}`); }
    ok(`guard: Kling Image quote $${quoteUsd.toFixed(2)}: an estimate $0.0025 above it is refused before submit (credits back); $0.0015 above (rounding) runs`); }
  // ---- token-billed models with a quote allowance run without an estimate (the refusal branch, a token model WITHOUT an allowance, is unit-tested in router-ref-prices.test.ts) ----
  for (const [provider, extra] of [['api-gpt-image', { quality: 'low' }], ['api-nano-banana', {}]] as const) {
    const s = await post(K.B, 'create-image', { provider, types: '["generate"]', prompt: 'NOESTIMATE lighthouse', aspect: '1:1', ...extra }); assert.equal(s.status, 200, JSON.stringify(s.body));
    const d = await until(K.B, s.body.id); assert.equal(d.status, 'done', `${provider} (quote carries the token allowance) runs without an estimate: ${d.error} ${K.err().slice(-800)}`); assert.equal(d.outputs.length, 1); }
  ok('no estimate: GPT Image 2 and Nano Banana 2 (quotes carry the token allowance) run');
  // ---- n > 1 failing partway: the made image is charged, the one not made goes back ----
  { const b0 = await balance(K.B); const before = new Set(reqs.keys());
    const s = await post(K.B, 'create-image', { provider: 'api-gpt-image', types: '["generate"]', prompt: 'FAILSECOND kite', aspect: '1:1', quality: 'low', n: '2' }); assert.equal(s.status, 200, JSON.stringify(s.body));
    const cost = s.body.cost as number; const per = Math.floor(cost / 2); assert.ok(cost > 0 && per > 0);
    const d = await until(K.B, s.body.id); assert.equal(d.status, 'done', `${d.status} ${d.error} ${K.err().slice(-800)}`); assert.equal(d.outputs.length, 1, 'the made image is kept');
    assert.equal([...reqs.values()].filter((x) => !before.has(x.id)).length, 2, 'two Router requests (the 2nd refused)');
    for (let i = 0; i < 40 && (await balance(K.B)) !== b0 - (cost - per); i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(await balance(K.B), b0 - (cost - per), `charged ${cost - per} for the 1 image made, ${per} back for the one not made`); assert.equal(d.cost, cost - per, 'job cost = the billed image');
    assert.ok((d.warnings ?? []).some((w: string) => /1 of 2 images were made/.test(w)), JSON.stringify(d.warnings));
    ok(`partial n=2: 1 image made and charged (✦${cost - per}), ✦${per} for the image not made back; job done with a warning`); }
  // ---- refused up front (input the route can't take) ----
  { const b0 = await balance(K.B); const before = log.length; const s = await post(K.B, 'create-image', { provider: 'api-ideogram', types: '["edit"]', prompt: 'x', aspect: '1:1' }, [['image', PNG]]);
    assert.ok(s.status >= 400, JSON.stringify(s.body)); assert.match(JSON.stringify(s.body), /Ideogram V4 on Comfy Router makes new images from a prompt only|Ideogram V4 can't do Edit image/); /* 2026-10-22: edit is no longer offered for Ideogram (its Router body sends no image) */ assert.equal(await balance(K.B), b0); assert.equal(log.length, before, 'no Router call'); }
  ok('Ideogram edit with an image: refused at submit with a plain reason; nothing charged, no Router call');
  // ---- errors ----
  const ERR: [string, Record<string, string>, string, RegExp][] = [
    ['no credits (402)', { provider: 'api-gpt-image', prompt: 'NOCREDITS boat', quality: 'low' }, 'cloud_credits', /out of credits/],
    ['no API access (403 forbidden)', { provider: 'api-kling-image', prompt: 'NOAPI boat' }, 'cloud_plan', /Comfy plan doesn't include API access; Standard or higher is needed/],
    ['bad input (422)', { provider: 'api-kling-image', prompt: 'BADINPUT boat' }, 'input_invalid', /did not accept these settings \(size: size out of range\)/],
    ['refused (content policy)', { provider: 'api-kling-image', prompt: 'REFUSEME boat' }, 'content_blocked', /refused this prompt or image/],
    ['timeout', { provider: 'api-kling-image', prompt: 'SLOWME boat' }, 'cloud_timeout', /took too long; the request was cancelled/],
  ];
  for (const [name, f, code, re] of ERR) {
    const b0 = await balance(K.B); const subs0 = submits(); const before = new Set(reqs.keys());
    const s = await post(K.B, 'create-image', { types: '["generate"]', aspect: '1:1', ...f }); assert.equal(s.status, 200, JSON.stringify(s.body));
    const d = await until(K.B, s.body.id); assert.equal(d.status, 'failed', `${name}: ${d.status} ${d.error}`); assert.equal(d.reasonCode, code, `${name}: ${JSON.stringify(d)}`); assert.match(d.error, re, name);
    assert.ok(!JSON.stringify(d).includes(KEY), 'key never in the job');
    const n = submits() - subs0; assert.ok(n <= 1, `${name}: at most one submit (got ${n})`); if (code === 'cloud_credits') assert.equal(n, 0, 'credits caught at the estimate, before any submit');
    if (code === 'cloud_timeout') { const r = [...reqs.values()].find((x) => !before.has(x.id))!; assert.ok(r.canceled, 'timeout cancels the Router request'); }
    for (let i = 0; i < 40 && (await balance(K.B)) !== b0; i++) await new Promise((r) => setTimeout(r, 50)); assert.equal(await balance(K.B), b0, `${name}: credits back`);
    ok(`${name}: failed, reasonCode ${code}, "${d.error}", ${n} submit(s), credits back`);
  }
  // wrong key → key_invalid (a third server would need another boot; the client maps it)
  { const c = new R.ComfyRouter('wrong-key', fetch, FAKE); await assert.rejects(c.estimate('openai/gpt-image-2', { prompt: 'x' }), (e: any) => e.reasonCode === 'key_invalid' && !String(e.message + e.detail).includes('wrong-key')); }
  ok('wrong key: 401 unauthorized → key_invalid (key never in the message)');
  assert.ok(log.filter((l) => !l.url.startsWith('/assets/')).every((l) => l.key === KEY || l.key === 'wrong-key'), 'key on every Router call'); assert.ok(log.filter((l) => l.url.startsWith('/assets/')).every((l) => !l.key), 'result assets fetched without the key');
  assert.ok(log.filter((l) => l.method === 'POST' && !l.url.endsWith('/estimate')).every((l) => !!l.idem), 'Idempotency-Key on every run / submit');
  { const gen = log.filter((l) => l.method === 'POST' && /^\/v2\/models\/[^/]+\/[^/]+(\/requests)?(\?|$)/.test(l.url)); assert.ok(gen.length > 5, 'generation calls seen');
    assert.ok(gen.every((l) => l.url.endsWith('?fallback_provider=false')), `fallback_provider=false on every Router generation call (sync and queued): ${gen.map((l) => l.url).filter((u) => !u.endsWith('?fallback_provider=false')).join(', ')}`);
    assert.ok(log.filter((l) => l.url.endsWith('/estimate') || /\/requests\/[^/?]+/.test(l.url)).every((l) => !l.url.includes('fallback_provider')), 'estimate / status / result / cancel carry no fallback flag');
    assert.ok(R.routerPlan({ provider: 'openai', model: 'gpt-image-2', body: {}, long: true }).submit.url.endsWith('/requests?fallback_provider=false') && R.routerPlan({ provider: 'elevenlabs', model: 'eleven_v4', body: {} }).submit.url.endsWith('?fallback_provider=false'), 'routerPlan submit (queued + sync) carries the flag');
    ok('fallback_provider=false on every Router generation call; estimate / poll / collect / cancel without it'); }
  ok('the key goes on every Router call and never on result downloads; every run / submit carries an Idempotency-Key');
  console.log('ALL OK router-runner');
} finally { for (const p of procs) { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } } fake.close(); setTimeout(() => fs.rmSync(D, { recursive: true, force: true }), 500); }
