// BytePlus ModelArk direct provider (Seedance 2.0 / Fast / Mini / 2.5 video, Seedream 5.0 Pro / Flash images), in-process with a fake fetch
// (no network, no keys, no spend). Bodies follow docs.byteplus.com/en/docs/ModelArk/1520757 and 1541523, errors 1299023, prices model-pricing (read 2026-10-23).
// Run: npx tsx test/byteplus-direct.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'byteplus-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_ARK_BASE_URL: '' });
const B = await import('../src/providers/byteplus.js');
const { directRun, directBase, DIRECT_PROVIDERS, DirectError } = await import('../src/providers/direct.js');
const { HOSTED_BY_ID, usdToCredits } = await import('../src/shared/hostedPrices.js');
const { priceOf } = await import('../src/shared/pricing.js');
const ok = (m: string) => console.log('ok ' + m);
const stub = async (f: string) => `data:stub;${path.basename(f)}`;
const roles = (b: any) => b.content.slice(1).map((c: any) => `${c.type}:${c.role}`);
const VIDEO_FIELDS = ['model', 'content', 'resolution', 'ratio', 'duration', 'generate_audio', 'watermark']; // all documented request fields

// ---------------------------------------------------------------- 1. Seedance task bodies
{ const t2v = await B.seedanceBody('seedance-2.0', { mode: 't2v', prompt: 'a lighthouse', resolution: '1080p', duration: 8, aspect: '21:9', audio: false, seed: 7 }, stub);
  assert.deepEqual(t2v, { model: 'dreamina-seedance-2-0-260128', content: [{ type: 'text', text: 'a lighthouse' }], resolution: '1080p', ratio: '21:9', duration: 8, generate_audio: false, watermark: false });
  for (const k of Object.keys(t2v)) assert.ok(VIDEO_FIELDS.includes(k), `field ${k}`); assert.ok(!('seed' in t2v) && !('camera_fixed' in t2v), 'seed / camera_fixed are Seedance 1.x only');
  assert.equal((await B.seedanceBody('seedance-2.0', { mode: 't2v', prompt: 'x', aspect: 'auto' }, stub)).ratio, 'adaptive');
  const d = await B.seedanceBody('seedance-2.0', { mode: 't2v', prompt: 'x' }, stub); assert.equal(d.resolution, '720p'); assert.equal(d.duration, 5); assert.equal(d.generate_audio, true);
  const i2v = await B.seedanceBody('seedance-2.0', { mode: 'i2v', prompt: 'x', imagePath: '/a.png', lastFramePath: '/b.png', aspect: '9:16' }, stub) as any;
  assert.deepEqual(roles(i2v), ['image_url:first_frame'], 'i2v ignores a last frame'); assert.equal(i2v.content[1].image_url.url, 'data:stub;a.png'); assert.equal(i2v.ratio, '9:16', '2.0 takes a ratio with a first frame');
  const flf = await B.seedanceBody('seedance-2.0-fast', { mode: 'flf', prompt: 'x', imagePath: '/a.png', lastFramePath: '/b.png' }, stub) as any;
  assert.equal(flf.model, 'dreamina-seedance-2-0-fast-260128'); assert.deepEqual(roles(flf), ['image_url:first_frame', 'image_url:last_frame']);
  const r2v = await B.seedanceBody('seedance-2.0-mini', { mode: 'r2v', prompt: 'x', refPaths: Array.from({ length: 12 }, (_, k) => `/r${k}.png`), refAudioPaths: ['/a.mp3', '/b.wav', '/c.wav', '/d.wav'], imagePath: '/first.png' }, stub) as any;
  assert.equal(r2v.model, 'dreamina-seedance-2-0-mini-260615'); assert.equal(roles(r2v).filter((r: string) => r === 'image_url:reference_image').length, 9); assert.equal(roles(r2v).filter((r: string) => r === 'audio_url:reference_audio').length, 3);
  assert.ok(!roles(r2v).includes('image_url:first_frame'), 'r2v never mixes frames with references');
  const s25 = await B.seedanceBody('seedance-2.5', { mode: 'i2v', prompt: 'x', imagePath: '/a.png', aspect: '16:9', duration: 25 }, stub) as any;
  assert.equal(s25.model, 'dreamina-seedance-2-5-260628'); assert.equal(s25.ratio, 'adaptive', '2.5 frame jobs only take adaptive'); assert.equal(s25.duration, 25);
  assert.equal((await B.seedanceBody('seedance-2.5', { mode: 't2v', prompt: 'x', aspect: '16:9' }, stub)).ratio, '16:9');
  assert.equal(roles(await B.seedanceBody('seedance-2.5', { mode: 'r2v', prompt: 'x', refPaths: Array(40).fill('/r.png') }, stub)).length, 30);
  // the real request: data URIs with a lowercase image/audio format
  const img = path.join(D, 'f.png'); fs.writeFileSync(img, Buffer.from([0x89, 0x50, 0x4e, 0x47])); const mp3 = path.join(D, 'v.MP3'); fs.writeFileSync(mp3, 'ID3');
  assert.equal(await B.arkDataUri(img), 'data:image/png;base64,iVBORw=='); assert.ok((await B.arkDataUri(mp3)).startsWith('data:audio/mp3;base64,'));
  const req = await B.seedanceRequest('seedance-2.0', { id: 'j', input: { mode: 'i2v', prompt: 'x', imagePath: img } }); assert.equal(req.url, 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks');
  assert.equal((req.body as any).content[1].image_url.url, 'data:image/png;base64,iVBORw==');
  ok('Seedance bodies: model ids, t2v / i2v / flf / r2v roles, ratio (adaptive for auto and 2.5 frames), resolution, duration, generate_audio, watermark false, ref caps 9/3 and 30, no seed');
}
// ---------------------------------------------------------------- 2. route refusals
{ const R = B.BYTEPLUS_ROUTES['router-seedance'][0]; const no = R.unavailableFor!;
  assert.equal(R.routeId, 'direct:byteplus/seedance-2.0'); assert.equal(R.vendor, 'byteplus'); assert.equal(R.envKey, 'OPENHIGGSFIELD_ARK_API_KEY'); assert.equal(R.priceRef, R.routeId); assert.deepEqual(R.tools, ['h3-video']);
  assert.match(no({ mode: 'r2v', refPaths: ['/a.png'], refVideoPaths: ['/v.mp4'] })!, /reference videos only as public web links/);
  assert.equal(no({ mode: 'r2v', refPaths: ['/a.png'], refAudioPaths: ['/a.wav'] }), null);
  assert.match(no({ mode: 'r2v', refAudioPaths: ['/a.wav'] })!, /at least one reference image/);
  assert.match(no({ mode: 'r2v', refPaths: Array(10).fill('/a.png') })!, /up to 9/);
  assert.match(no({ mode: 't2v', draft: true })!, /no draft/); assert.match(no({ mode: 'reshoot', videoPath: '/v.mp4' })!, /Generate Video jobs/);
  assert.match(no({ mode: 't2v', duration: 20 })!, /4–15 s/); assert.match(no({ mode: 't2v', resolution: '4K' })!, /makes/); assert.equal(no({ mode: 't2v', resolution: '1080p', duration: 15, aspect: '21:9' }), null);
  const fast = B.BYTEPLUS_NATIVE['direct-seedance-20-fast'].unavailableFor!; assert.match(fast({ mode: 't2v', resolution: '1080p' })!, /480p, 720p/);
  const s25 = B.BYTEPLUS_NATIVE['direct-seedance-25'].unavailableFor!; assert.equal(s25({ mode: 't2v', duration: 30, resolution: '1080p' }), null); assert.match(s25({ mode: 't2v', duration: 31 })!, /4–30 s/);
  assert.equal(B.BYTEPLUS_VIDEO_LIMITS['direct-seedance-25'].maxSeconds, 30); assert.deepEqual(B.BYTEPLUS_VIDEO_LIMITS['direct-seedance-20-mini'].resolutions, ['720p', '480p']);
  assert.equal(B.BYTEPLUS_NATIVE['direct-seedance-25'].vendor, 'byteplus'); assert.ok((B.BYTEPLUS_NATIVE['direct-seedance-25'].caps as any).videoCaps.durations.includes(30));
  ok('Seedance routes: reference videos refused (public URL only), audio refs with images, caps, draft / non-Generate Video jobs refused, per-engine resolution and duration limits');
}
// ---------------------------------------------------------------- 3. poll parsing + cost
{ assert.deepEqual(B.parseSeedanceTask({ status: 'queued' }), { done: false, status: 'queued' }); assert.equal(B.parseSeedanceTask({ status: 'running' }).done, false);
  const s = B.parseSeedanceTask({ id: 't', status: 'succeeded', content: { video_url: 'https://cdn.invalid/v.mp4' }, usage: { completion_tokens: 108680, total_tokens: 108680 } });
  assert.equal(s.done, true); assert.equal(s.outputs![0].url, 'https://cdn.invalid/v.mp4');
  const f = B.parseSeedanceTask({ status: 'failed', error: { code: 'OutputVideoSensitiveContentDetected', message: 'The request failed because the output video may contain sensitive information.' } });
  assert.equal(f.error!.reasonCode, 'content_blocked');
  const face = B.parseSeedanceTask({ status: 'failed', error: { code: 'InputImageSensitiveContentDetected.PrivacyInformation', message: 'The request failed because the input image may contain real person.' } });
  assert.equal(face.error!.reasonCode, 'input_invalid'); assert.ok(face.error!.message.includes(B.REAL_FACE_LINE));
  assert.equal(B.parseSeedanceTask({ status: 'expired' }).error!.reasonCode, 'queue_full'); assert.equal(B.parseSeedanceTask({ status: 'failed' }).error!.reasonCode, 'provider_error');
  // cost = usage.completion_tokens × $/1M of the tier
  const c = B.seedanceCost('seedance-2.0', { resolution: '720p', usage: { completion_tokens: 108680 } }, {})!; assert.equal(c.usd, Math.round(108680 * 7.0 / 1e6 * 1e4) / 1e4); assert.equal(c.source, 'byteplus:usage.completion_tokens'); assert.equal(c.settled, true);
  assert.equal(B.seedanceCost('seedance-2.0', { usage: { completion_tokens: 244555 } }, { resolution: '1080p' })!.usd, Math.round(244555 * 7.7 / 1e6 * 1e4) / 1e4);
  assert.equal(B.seedanceCost('seedance-2.5', { resolution: '1080p', usage: { completion_tokens: 1e6 } }, {})!.usd, 11.7); assert.equal(B.seedanceCost('seedance-2.0-mini', { usage: {} }, {}), null);
  ok('Seedance poll: queued / running / succeeded / failed (error codes) / expired; cost from usage.completion_tokens × the tier rate');
}
// ---------------------------------------------------------------- 4. price rows = formula
{ const tps = (w: number, h: number) => (w * h * 24) / 1024; const usd = (t: number, r: number) => Math.round((t * r) / 1e6 * 1e6) / 1e6;
  const want20 = { '480p': usd(tps(864, 496), 7.0), '720p': usd(tps(1112, 834), 7.0), '1080p': usd(tps(2206, 946), 7.7), '4K': usd(tps(3326, 2494), 4.0) };
  const rows = Object.fromEntries(B.BYTEPLUS_PRICES.map((p) => [p.providerId, p]));
  assert.deepEqual(rows['direct:byteplus/seedance-2.0'].usdByQuality, want20); assert.equal(rows['direct:byteplus/seedance-2.0'].unit, 'second');
  assert.deepEqual(rows['direct:byteplus/seedance-2.0'].videoInput!.usdByQuality, { '480p': usd(tps(864, 496), 4.3), '720p': usd(tps(1112, 834), 4.3), '1080p': usd(tps(2206, 946), 4.7), '4K': usd(tps(3326, 2494), 2.4) });
  assert.deepEqual(rows['direct-seedance-20-fast'].usdByQuality, { '480p': usd(tps(864, 496), 5.6), '720p': usd(tps(1112, 834), 5.6) });
  assert.deepEqual(rows['direct-seedance-20-mini'].usdByQuality, { '480p': usd(tps(864, 496), 3.5), '720p': usd(tps(1112, 834), 3.5) });
  assert.deepEqual(rows['direct-seedance-25'].usdByQuality, { '480p': usd(tps(992, 432), 10.7), '720p': usd(tps(1112, 834), 10.7), '1080p': usd(tps(2206, 946), 11.7) });
  // the published 5 s 16:9 examples sit at or under our quote (largest-token ratio): 2.0 $0.07 / 0.15 / 0.37 / 0.78 per s
  for (const [t, ex] of [['480p', 0.07], ['720p', 0.15], ['1080p', 0.37], ['4K', 0.78]] as const) assert.ok(want20[t] >= ex - 0.005 && want20[t] < ex * 1.03, `${t} ${want20[t]} vs ${ex}`);
  for (const id of ['direct:byteplus/seedance-2.0', 'direct-seedance-20-fast', 'direct-seedance-20-mini', 'direct-seedance-25', 'direct:byteplus/seedream-5.0-pro', 'direct:byteplus/seedream-5.0-flash']) {
    assert.ok(rows[id], id); assert.equal(rows[id].checkedAt, '2026-10-23'); assert.ok(rows[id].sourceUrl.startsWith('https://docs.byteplus.com/')); assert.ok(rows[id].note); }
  for (const p of B.BYTEPLUS_PRICES) HOSTED_BY_ID[p.providerId] ??= p; // the lead registers these in routing/routePrices.ts
  const q = priceOf({ toolId: 'h3-video', provider: 'direct:byteplus/seedance-2.0', quality: '720p', durationSec: 10, rates: {} }); assert.equal(q.credits, usdToCredits(want20['720p'] * 10), 'rounded up per request (quote never below the real cost)'); assert.ok(q.credits >= want20['720p'] * 10 * 100);
  assert.equal(priceOf({ toolId: 'h3-video', provider: 'direct:byteplus/seedance-2.0', quality: '720p', durationSec: 10, rates: {}, audio: false }).credits, q.credits, 'audio does not change the price');
  assert.deepEqual(rows['direct:byteplus/seedream-5.0-pro'].usdByResolution, { '1K': 0.045, '2K': 0.09 }); assert.deepEqual(rows['direct:byteplus/seedream-5.0-pro'].refImages && { usd: 0.003, free: 1 }, { usd: rows['direct:byteplus/seedream-5.0-pro'].refImages!.usd, free: rows['direct:byteplus/seedream-5.0-pro'].refImages!.free });
  assert.equal(priceOf({ toolId: 'create-image', provider: 'direct:byteplus/seedream-5.0-pro', quality: '', imageRes: '2K', refImages: 3, rates: {} }).credits, usdToCredits(0.09 + 2 * 0.003));
  assert.equal(priceOf({ toolId: 'create-image', provider: 'direct:byteplus/seedream-5.0-flash', quality: '', imageRes: '1K', count: 2, rates: {} }).credits, 4);
  ok('price rows: per-second rows = W×H×24/1024 × $/1M at the largest-token ratio per tier; video-input rows; Seedream per image + refs; priceOf quote');
}
// ---------------------------------------------------------------- 5. Seedream bodies + parsing
{ const g = await B.seedreamBody('pro', { prompt: 'cat', aspect: '16:9', imageResolution: '2K', seed: 3 }, stub) as any;
  for (const k of Object.keys(g)) assert.ok(['model', 'prompt', 'image', 'size', 'response_format', 'output_format', 'watermark'].includes(k), `field ${k}`);
  assert.equal(g.model, 'dola-seedream-5-0-pro-260628'); assert.equal(g.watermark, false); assert.equal(g.response_format, 'url'); assert.ok(!('image' in g) && !('seed' in g));
  const [w, h] = g.size.split('x').map(Number); assert.ok(w * h >= 921_600 && w * h <= 4_624_220 && Math.abs(w / h - 16 / 9) < 0.02, g.size);
  for (const a of ['21:9', '9:16', '1:1', 'auto']) for (const r of ['1K', '2K']) { const [x, y] = B.seedreamSize(a, r).split('x').map(Number); assert.ok(x * y >= 921_600 && x * y <= 4_624_220, `${a} ${r}`); }
  const e1 = await B.seedreamBody('flash', { prompt: 'x', types: ['edit'], imagePath: '/a.png' }, stub) as any; assert.equal(e1.model, 'dola-seedream-5-0-flash-260915'); assert.equal(e1.image, 'data:stub;a.png');
  const e2 = await B.seedreamBody('pro', { prompt: 'x', types: ['edit'], refPaths: Array(12).fill('/r.png') }, stub) as any; assert.equal(e2.image.length, 10);
  assert.deepEqual(B.parseSeedream({ data: [{ url: 'https://cdn.invalid/i.png', size: '2048x2048' }] }), [{ url: 'https://cdn.invalid/i.png', mime: 'image/png' }]);
  assert.deepEqual(B.parseSeedream({ data: [{ b64_json: 'AAA' }] }), [{ b64: 'AAA', mime: 'image/png' }]);
  assert.throws(() => B.parseSeedream({ error: { code: 'OutputImageSensitiveContentDetected', message: 'x' } }), (e: any) => e.reasonCode === 'content_blocked');
  assert.equal(B.seedreamCost('pro', { data: [{ size: '2048x2048' }], usage: { generated_images: 1, input_images: 3 } })!.usd, 0.096);
  assert.equal(B.seedreamCost('pro', { data: [{ size: '1024x1024' }], usage: { generated_images: 1, input_images: 1 } })!.usd, 0.045);
  assert.equal(B.seedreamCost('flash', { data: [{ size: '2048x2048' }], usage: { generated_images: 1, input_images: 4 } })!.usd, 0.018);
  const R = B.BYTEPLUS_ROUTES['api-seedream'][0]; assert.equal(R.routeId, 'direct:byteplus/seedream-5.0-pro'); assert.deepEqual(R.modes, ['generate', 'edit']); assert.equal(R.refsPriced!({ types: ['edit'], refPaths: ['/a', '/b'] }), 2);
  assert.match(R.unavailableFor!({ types: ['edit'], refPaths: Array(11).fill('/a') })!, /up to 10/); assert.equal(B.BYTEPLUS_ROUTES['api-seedream-flash'][0].routeId, 'direct:byteplus/seedream-5.0-flash');
  ok('Seedream bodies: model ids, WxH inside the documented pixel range, ≤10 refs as data URIs, watermark false, no seed; url / b64 parsing; cost by size tier + input images');
}
// ---------------------------------------------------------------- 6. error mapping
{ const e = (s: number, code: string, message = '') => B.arkError(s, { error: { code, message, type: 'x' } });
  assert.equal(e(401, 'AuthenticationError').reasonCode, 'key_invalid');
  const act = e(404, 'ModelNotOpen', 'Your account has not activated the model'); assert.equal(act.reasonCode, 'key_invalid'); assert.ok(act.message.includes('Activate this model in the ModelArk console'));
  assert.equal(e(403, 'OperationDenied.ServiceNotOpen').reasonCode, 'key_invalid'); assert.equal(e(404, 'InvalidEndpointOrModel.NotFound').reasonCode, 'key_invalid');
  assert.equal(e(403, 'AccountOverdueError').reasonCode, 'provider_credits'); assert.equal(e(403, 'OperationDenied.ServiceOverdue').reasonCode, 'provider_credits'); assert.equal(e(429, 'SetLimitExceeded').reasonCode, 'provider_credits');
  assert.equal(e(429, 'QuotaExceeded', 'Your account [1] has exhausted its free trial quota for the [m] model.').reasonCode, 'provider_credits');
  for (const c of ['QuotaExceeded', 'RateLimitExceeded.EndpointRPMExceeded', 'ModelAccountRpmRateLimitExceeded', 'ServerOverloaded', 'RequestBurstTooFast']) assert.equal(e(429, c).reasonCode, 'queue_full', c);
  for (const c of ['InputTextSensitiveContentDetected', 'InputImageSensitiveContentDetected', 'OutputVideoSensitiveContentDetected', 'InputImageSensitiveContentDetected.PolicyViolation', 'SensitiveContentDetected']) assert.equal(e(400, c).reasonCode, 'content_blocked', c);
  const face = e(400, 'InputImageSensitiveContentDetected.PrivacyInformation', 'The request failed because the input image may contain real person.'); assert.equal(face.reasonCode, 'input_invalid'); assert.ok(face.message.includes(B.REAL_FACE_LINE));
  assert.equal(e(400, 'InputVideoSensitiveContentDetected.PrivacyInformation').reasonCode, 'input_invalid');
  assert.equal(e(400, 'InvalidParameter').reasonCode, 'input_invalid'); assert.equal(e(400, 'Whatever').reasonCode, 'input_invalid'); assert.equal(e(500, 'InternalServiceError').reasonCode, 'provider_error'); assert.equal(B.arkError(502, null, 'bad gateway').reasonCode, 'provider_error');
  assert.ok(e(500, 'InternalServiceError').temporary); assert.ok(e(429, 'ServerOverloaded').temporary);
  ok('errors: auth / not activated → key_invalid (+ activate line), overdue / limit → provider_credits, rate limits → queue_full, moderation → content_blocked, real face → input_invalid (+ friendly line), 5xx → provider_error');
}
// ---------------------------------------------------------------- 7. directRun against a fake fetch
type Call = { url: string; init: any };
const fakeFetch = (handler: (url: string, init: any, n: number) => { status?: number; body?: any }) => { const calls: Call[] = []; let n = 0;
  const f = (async (url: string, init: any) => { calls.push({ url, init }); const r = handler(url, init ?? {}, n++); const st = r.status ?? 200;
    return { ok: st >= 200 && st < 300, status: st, headers: new Headers({}), json: async () => r.body, text: async () => JSON.stringify(r.body ?? '') } as any; }) as any; return { f, calls }; };
const job = (input: Record<string, any>) => ({ id: 'j1', input }); const noSleep = async () => {};
{ assert.equal(DIRECT_PROVIDERS.byteplus.name, 'BytePlus ModelArk'); assert.equal(directBase('byteplus'), 'https://ark.ap-southeast.bytepluses.com/api/v3');
  const spec = B.seedanceSpec('seedance-2.0'); const input = { mode: 't2v', prompt: 'x', resolution: '720p', duration: 5 };
  const { f, calls } = fakeFetch((url, init) => init.method === 'POST' ? { body: { id: 'cgt-1' } } : calls.length < 4 ? { body: { id: 'cgt-1', status: calls.length < 3 ? 'queued' : 'running' } }
    : { body: { id: 'cgt-1', status: 'succeeded', resolution: '720p', content: { video_url: 'https://cdn.invalid/v.mp4' }, usage: { completion_tokens: 108000, total_tokens: 108000 } } });
  const costs: any[] = []; const st: string[] = [];
  const r = await directRun(spec, await spec.build(job(input)), 'k', { f, sleep: noSleep, job: job(input), onCost: (c) => costs.push(c), onStatus: (s) => st.push(s) });
  assert.equal(r.id, 'cgt-1'); assert.equal(r.outputs[0].url, 'https://cdn.invalid/v.mp4'); assert.equal(calls[0].url, 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks');
  assert.equal(calls[1].url, 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/cgt-1'); assert.equal(calls[0].init.headers.Authorization, 'Bearer k'); assert.deepEqual(st, ['queued', 'running', 'succeeded']);
  assert.equal(JSON.parse(calls[0].init.body).watermark, false); assert.equal(costs.at(-1).usd, 0.756); assert.equal(costs.at(-1).source, 'byteplus:usage.completion_tokens');
  // regional host override, submit error, failed task
  process.env.OPENHIGGSFIELD_ARK_BASE_URL = 'https://ark.example.invalid/api/v3'; const g = fakeFetch(() => ({ status: 404, body: { error: { code: 'ModelNotOpen', message: 'Your account 1 has not activated the model m.' } } }));
  await assert.rejects(directRun(spec, await spec.build(job(input)), 'k', { f: g.f, sleep: noSleep }), (e: any) => e instanceof DirectError && e.reasonCode === 'key_invalid' && /activate this model/i.test(e.message));
  assert.equal(g.calls[0].url, 'https://ark.example.invalid/api/v3/contents/generations/tasks'); process.env.OPENHIGGSFIELD_ARK_BASE_URL = '';
  const h = fakeFetch((_u, init) => init.method === 'POST' ? { body: { id: 't2' } } : { body: { id: 't2', status: 'failed', error: { code: 'InputImageSensitiveContentDetected.PrivacyInformation', message: 'The request failed because the input image may contain real person.' } } });
  await assert.rejects(directRun(spec, await spec.build(job(input)), 'k', { f: h.f, sleep: noSleep }), (e: any) => e.reasonCode === 'input_invalid' && e.message.includes(B.REAL_FACE_LINE));
  // Seedream sync
  const img = B.seedreamSpec('pro'); const ii = { prompt: 'x', imageResolution: '1K' };
  const s = fakeFetch(() => ({ body: { model: 'dola-seedream-5-0-pro-260628', created: 1, data: [{ url: 'https://cdn.invalid/i.png', size: '1024x1024' }], usage: { generated_images: 1, input_images: 0, output_tokens: 4096 } } }));
  const ri = await directRun(img, await img.build(job(ii)), 'k', { f: s.f, sleep: noSleep, job: job(ii), onCost: (c) => costs.push(c) });
  assert.equal(ri.outputs[0].url, 'https://cdn.invalid/i.png'); assert.equal(s.calls[0].url, 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations'); assert.equal(costs.at(-1).usd, 0.045); assert.equal(s.calls.length, 1);
  const bad = fakeFetch(() => ({ status: 400, body: { error: { code: 'InputTextSensitiveContentDetected', message: 'x' } } }));
  await assert.rejects(directRun(img, await img.build(job(ii)), 'k', { f: bad.f, sleep: noSleep }), (e: any) => e.reasonCode === 'content_blocked');
  ok('directRun: submit + poll on the AP-Southeast host (Bearer), statuses, settled cost; ARK_BASE_URL override; errors on submit and in a failed task; Seedream sync call');
}
console.log('ALL OK');
