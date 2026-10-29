// Official lab APIs as direct providers, batch 1 (MiniMax, LTX, BFL), in-process with fake fetch (no network, no keys, no spend).
// 1. bodies follow the official schemas (field lists from the docs read 2026-10-23); 2. the generic runner: submit + poll, sync, regional base
// URLs, error mapping (MiniMax base_resp codes in a 200, v2 HTTP codes, LTX job errors, BFL moderation), LTX 429 backoff and the 2-job queue;
// 3. every new route has a price row and quote = charge (routeCredits, the one function quote and submit share); 4. run-on comes from `vendor`.
// Run: npx tsx test/direct-providers.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'direct-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MINIMAX_BASE_URL: '', OPENHIGGSFIELD_BFL_BASE_URL: '', OPENHIGGSFIELD_LTX_BASE_URL: '' });
const H = await import('../src/hostedRequests.js');
const { directRun, DirectError, directQueue, directBase, DIRECT_PROVIDERS } = await import('../src/providers/direct.js');
const S = await import('../src/providers/directSpecs.js');
const { findRoute, routesFor } = await import('../src/routing/routes.js');
const { routeCredits } = await import('../src/routing/select.js');
const { getTool } = await import('../src/tools/registry.js');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.js');
const { runOnOfRoute } = await import('../src/shared/modelIds.js');
const { reasonOf } = await import('../../web/src/shared/failureReasons.js');
const ok = (m: string) => console.log('ok ' + m);
const subset = (o: object, allowed: string[], what: string) => { for (const k of Object.keys(o)) assert.ok(allowed.includes(k), `${what}: field ${k} is not in the published schema`); };

// ---------------------------------------------------------------- 1. bodies vs docs
{ const V2 = ['model', 'content', 'resolution', 'duration', 'ratio', 'extra', 'callback_url']; // platform.minimax.io video-generation-v2-create
  const t2v = H.minimaxVideoRequest({ prompt: 'a lighthouse', resolution: '768p', duration: 6, aspect: '16:9', mode: 't2v' }).body!; subset(t2v, V2, 'minimax t2v');
  assert.deepEqual(t2v, { model: 'MiniMax-H3', content: [{ type: 'text', text: 'a lighthouse' }], resolution: '768P', duration: 6, ratio: '16:9' });
  assert.equal(H.minimaxVideoRequest({ prompt: 'x', mode: 't2v', aspect: 'auto' }).body!.ratio, '16:9', 'text-to-video never sends adaptive');
  const max = H.minimaxVideoRequest({ prompt: 'x', resolution: '480p', duration: 4, mode: 't2v' }).body!;
  assert.equal(max.model, 'MiniMax-H3-Max'); assert.equal(max.resolution, '480P'); assert.equal(max.duration, 5, 'H3-Max: 5–15 s'); assert.deepEqual(max.extra, { prompt_expansion_mode: 'disabled' });
  assert.equal(H.minimaxVideoRequest({ prompt: 'x', resolution: '1080p', mode: 't2v' }).body!.resolution, '2K'); assert.equal(H.minimaxVideoRequest({ prompt: 'x', resolution: '720p', mode: 't2v' }).body!.resolution, '768P');
  const flf = H.minimaxVideoRequest({ prompt: 'x', mode: 'flf', first: 'data:a', last: 'data:b' }).body! as any; assert.equal(flf.ratio, undefined, 'first/last frame: adaptive (no ratio)');
  assert.deepEqual(flf.content.slice(1).map((c: any) => c.role), ['first_frame', 'last_frame']);
  const r2v = H.minimaxVideoRequest({ prompt: 'x', mode: 'r2v', refImages: Array(12).fill('data:i'), refAudio: ['data:a'] }).body! as any;
  assert.equal(r2v.content.filter((c: any) => c.role === 'reference_image').length, 9); assert.equal(r2v.ratio, 'adaptive'); assert.equal(r2v.content.at(-1).type, 'audio_url');
  assert.ok(!('seed' in t2v), 'no seed field in the v2 schema');
  assert.throws(() => H.minimaxImageRequest({ prompt: 'p'.repeat(2000) }), /up to 1,500 characters; yours is 2,000/); // prompt grammar #9: refused, never cut
  const img = H.minimaxImageRequest({ prompt: 'p'.repeat(1500), aspectRatio: '5:4', seed: 7 }).body! as any; subset(img, ['model', 'prompt', 'aspect_ratio', 'width', 'height', 'response_format', 'seed', 'n', 'prompt_optimizer'], 'image-01');
  assert.equal(img.prompt.length, 1500); assert.ok(H.MINIMAX_IMAGE_ASPECTS.includes(img.aspect_ratio)); assert.equal(img.model, 'image-01'); assert.equal(img.response_format, 'url');
  const sp = H.minimaxSpeechRequest({ text: 'hello', native: { 'voice_setting.emotion': 'neutral', 'audio_setting.sample_rate': 48000 }, speechModel: 'speech-2.8-turbo', format: 'opus' }).body! as any;
  assert.equal(sp.model, 'speech-2.8-turbo'); assert.equal(sp.voice_setting.emotion, undefined, "'neutral' is not a documented emotion"); assert.equal(sp.audio_setting.sample_rate, 32000); assert.equal(sp.audio_setting.format, 'opus'); assert.equal(sp.output_format, 'url');
  assert.equal((H.minimaxSpeechRequest({ text: 'x', native: { 'voice_setting.emotion': 'happy' } }).body as any).voice_setting.emotion, 'happy');
  ok('MiniMax bodies: v2 video (H3 / H3-Max tiers, ratio rules, frame roles, ≤9 refs, no seed), image-01, Speech 2.8 HD / Turbo (documented emotions and sample rates only)'); }
{ const LTX = ['prompt', 'model', 'duration', 'resolution', 'fps', 'generate_audio', 'camera_motion', 'image_uri', 'last_frame_uri']; // docs.ltx.io submit-text-to-video / image-to-video
  const t = H.ltxVideoRequest({ model: 'ltx-2-5-pro', prompt: 'eagle', resolution: '1080p', aspect: '16:9', duration: 8, audio: true, cameraMotion: 'dolly_in' }); subset(t.body!, LTX, 'ltx t2v');
  assert.equal(t.url, 'https://api.ltx.io/v2/text-to-video'); assert.deepEqual(t.body, { prompt: 'eagle', model: 'ltx-2-5-pro', duration: 8, resolution: '1920x1080', fps: 24, generate_audio: true, camera_motion: 'dolly_in' });
  const i = H.ltxVideoRequest({ model: 'ltx-2-3-fast', prompt: 'x', resolution: '4K', aspect: '1:1', duration: 6, audio: false, image: 'data:a', lastImage: 'data:b', cameraMotion: 'orbit' }); subset(i.body!, LTX, 'ltx i2v');
  assert.equal(i.url, 'https://api.ltx.io/v2/image-to-video'); assert.equal((i.body as any).resolution, '3840x2160', 'LTX-2.3 has no 1:1: nearest of 16:9 / 9:16'); assert.equal((i.body as any).generate_audio, false); assert.equal((i.body as any).camera_motion, undefined, 'unknown moves are not sent');
  assert.equal(H.ltxResolution('ltx-2-5-fast', '720p', '9:16'), '720x1280'); assert.equal(H.ltxResolution('ltx-2-5-pro', '1440p', '1:1'), '1440x1440');
  ok('LTX bodies: text / image-to-video, resolution "WxH" from our tier + aspect inside each model\'s grid, generate_audio, camera_motion enum only'); }
{ const V = ['mode', 'prompt', 'keyframes', 'start_video', 'draft_cache', 'resolution', 'duration', 'aspect_ratio', 'generate_audio', 'safety_tolerance', 'draft', 'version']; // docs.bfl.ml/flux_3/flux3_video
  const t = H.bflVideoRequest({ prompt: 'fox', resolution: '4K', duration: 30, aspect: '16:9' }).body!; subset(t, V, 'flux 3 video'); assert.deepEqual(t, { mode: 't2v', prompt: 'fox', resolution: 'uhd', duration: 20, aspect_ratio: '16:9', generate_audio: true, safety_tolerance: 2 });
  const d = H.bflVideoRequest({ prompt: 'x', resolution: '1080p', draft: true, keyframes: ['A', 'B'] }).body! as any; assert.equal(d.resolution, 'hd', 'draft is hd only'); assert.equal(d.draft, true); assert.deepEqual(d.keyframes, ['A', 'B']); assert.equal(d.mode, 'i2v');
  assert.equal((H.bflVideoRequest({ prompt: 'x', keyframes: ['A'] }).body as any).keyframes, 'A');
  for (const [ours, bfl] of [['720p', 'hd'], ['1080p', 'fhd'], ['1440p', 'qhd']]) assert.equal((H.bflVideoRequest({ prompt: 'x', resolution: ours }).body as any).resolution, bfl);
  const k = H.bflKlein2Request('9b', { prompt: 'p', aspectRatio: '16:9', seed: 1, images: ['1', '2', '3', '4', '5'] }); subset(k.body!, ['prompt', 'input_image', 'input_image_2', 'input_image_3', 'input_image_4', 'seed', 'width', 'height', 'safety_tolerance', 'output_format', 'user', 'webhook_url', 'webhook_secret'], 'klein 9b');
  assert.equal(k.url, 'https://api.bfl.ai/v1/flux-2-klein-9b'); assert.ok(!('input_image_5' in k.body!), 'klein takes 4 images'); assert.ok((k.body as any).width * (k.body as any).height <= 1_000_000);
  assert.equal(Object.keys(H.bflFlexRequest({ prompt: 'x', images: Array(9).fill('i') }).body!).filter((x) => x.startsWith('input_image')).length, 8, 'FLUX.2 direct: 8 input images');
  ok('BFL bodies: FLUX 3 Video (720p→hd … 4K→uhd, 5–20 s, draft = hd, keyframes), FLUX.2 [klein] 4B/9B (≤4 images, ≤1 MP), FLUX.2 [flex] ≤8 images'); }

// ---------------------------------------------------------------- 2. runner
type Call = { url: string; init: any };
const fakeFetch = (handler: (url: string, init: any, n: number) => { status?: number; body?: any; headers?: Record<string, string> }) => { const calls: Call[] = []; let n = 0;
  const f = (async (url: string, init: any) => { calls.push({ url, init }); const r = handler(url, init ?? {}, n++); const st = r.status ?? 200;
    return { ok: st >= 200 && st < 300, status: st, headers: new Headers(r.headers ?? {}), json: async () => r.body, text: async () => JSON.stringify(r.body ?? '') } as any; }) as any; return { f, calls }; };
const job = (input: Record<string, any>) => ({ id: 'j1', input });
const noSleep = async () => {};
{ // MiniMax H3 submit + poll, cost from usage.output_seconds; the key is a Bearer header, never in a URL
  const { f, calls } = fakeFetch((url, init) => init.method === 'POST' ? { body: { task_id: 't-1' } } : url.endsWith('/t-1') && calls.length < 3 ? { body: { task: { status: 'running' } } }
    : { body: { task: { status: 'succeeded', content: { url: 'https://cdn.invalid/v.mp4' }, usage: { output_seconds: 6, input_image_count: 0 } } } });
  const costs: any[] = []; const input = { mode: 't2v', prompt: 'x', resolution: '768p', duration: 6 };
  const r = await directRun(S.minimaxVideoSpec, await S.minimaxVideoSpec.build(job(input)), 'k', { f, sleep: noSleep, job: job(input), onCost: (c) => costs.push(c) });
  assert.equal(r.outputs[0].url, 'https://cdn.invalid/v.mp4'); assert.equal(calls[0].url, 'https://api.minimax.io/v2/video_generation'); assert.equal(calls[1].url, 'https://api.minimax.io/v2/query/video_generation/t-1');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer k'); assert.ok(calls.every((c) => !c.url.includes('k=')));
  assert.equal(costs.at(-1).usd, 0.48); assert.equal(costs.at(-1).source, 'minimax:usage.output_seconds');
  // China host override
  process.env.OPENHIGGSFIELD_MINIMAX_BASE_URL = 'https://api.minimaxi.com'; const g = fakeFetch((_u, init) => init.method === 'POST' ? { body: { task_id: 'x' } } : { body: { task: { status: 'succeeded', content: { url: 'u' } } } });
  await directRun(S.minimaxVideoSpec, await S.minimaxVideoSpec.build(job(input)), 'k', { f: g.f, sleep: noSleep }); assert.equal(g.calls[0].url, 'https://api.minimaxi.com/v2/video_generation'); assert.equal(g.calls[1].url, 'https://api.minimaxi.com/v2/query/video_generation/x');
  process.env.OPENHIGGSFIELD_MINIMAX_BASE_URL = ''; process.env.OPENHIGGSFIELD_BFL_BASE_URL = 'https://api.eu.bfl.ai'; assert.equal(directBase('bfl'), 'https://api.eu.bfl.ai'); process.env.OPENHIGGSFIELD_BFL_BASE_URL = '';
  ok('runner submit + poll (MiniMax v2): Bearer header, poll URL from task_id, real cost 6 s × $0.08 = $0.48; MINIMAX_BASE_URL / BFL_BASE_URL switch the host'); }
{ // MiniMax errors: v1 base_resp inside a 200, v2 HTTP codes, failed tasks
  const v1 = async (code: number) => { const { f } = fakeFetch(() => ({ body: { base_resp: { status_code: code, status_msg: 'm' } } }));
    try { await directRun(S.minimaxImageSpec, await S.minimaxImageSpec.build(job({ prompt: 'x' })), 'k', { f, sleep: noSleep }); return 'none'; } catch (e) { assert.ok(e instanceof DirectError); return (e as any).reasonCode; } };
  assert.deepEqual(await Promise.all([1004, 2049, 1008, 1026, 2013, 1002, 1000].map(v1)), ['key_invalid', 'key_invalid', 'provider_credits', 'content_blocked', 'input_invalid', 'queue_full', 'provider_error']);
  const v2 = async (st: number) => { const { f } = fakeFetch(() => ({ status: st, body: { type: 'error', error: { type: 'x', message: 'no' } } }));
    try { await directRun(S.minimaxVideoSpec, await S.minimaxVideoSpec.build(job({ prompt: 'x', mode: 't2v' })), 'k', { f, sleep: noSleep }); return 'none'; } catch (e) { return (e as any).reasonCode; } };
  assert.deepEqual(await Promise.all([401, 402, 422, 429, 400, 500, 529].map(v2)), ['key_invalid', 'provider_credits', 'content_blocked', 'queue_full', 'input_invalid', 'provider_error', 'provider_error']);
  const { f } = fakeFetch((_u, init) => init.method === 'POST' ? { body: { task_id: 't' } } : { body: { task: { status: 'failed', error: { code: '1026', message: 'sensitive' } } } });
  await assert.rejects(directRun(S.minimaxVideoSpec, await S.minimaxVideoSpec.build(job({ prompt: 'x', mode: 't2v' })), 'k', { f, sleep: noSleep }), (e: any) => e.reasonCode === 'content_blocked');
  const held = fakeFetch(() => ({ body: { data: { image_urls: [] }, metadata: { success_count: 0, failed_count: 1 }, base_resp: { status_code: 0 } } }));
  await assert.rejects(directRun(S.minimaxImageSpec, await S.minimaxImageSpec.build(job({ prompt: 'x' })), 'k', { f: held.f }), (e: any) => e.reasonCode === 'content_blocked');
  ok('MiniMax errors: base_resp 1004/2049 key, 1008 credits, 1026 content, 2013 input, 1002 busy; v2 HTTP 401/402/422/429/400/5xx; failed task code; image held back by its safety check'); }
{ // MiniMax sync: speech URL + usage_characters cost; image-01 URL
  const { f, calls } = fakeFetch(() => ({ body: { data: { audio: 'https://cdn.invalid/a.mp3', status: 2 }, extra_info: { usage_characters: 2500, audio_format: 'mp3' }, trace_id: 'tr', base_resp: { status_code: 0, status_msg: 'success' } } }));
  const spec = S.minimaxSpeechSpec('speech-2.8-turbo', 'direct-minimax-speech-turbo'); const costs: any[] = [];
  const r = await directRun(spec, await spec.build(job({ prompt: 'hi', voiceNative: {} })), 'k', { f, onCost: (c) => costs.push(c) });
  assert.equal(r.outputs[0].url, 'https://cdn.invalid/a.mp3'); assert.equal(calls.length, 1); assert.equal(JSON.parse(calls[0].init.body).model, 'speech-2.8-turbo'); assert.equal(costs[0].usd, 0.15); assert.equal(costs[0].units, 2500);
  const hex = fakeFetch(() => ({ body: { data: { audio: 'ff00' }, extra_info: { audio_format: 'wav' }, base_resp: { status_code: 0 } } }));
  assert.deepEqual((await directRun(spec, await spec.build(job({ prompt: 'hi' })), 'k', { f: hex.f })).outputs[0], { hex: 'ff00', mime: 'audio/wav' });
  ok('sync runner: Speech 2.8 Turbo URL output, cost from usage_characters (2,500 × $0.06/1k = $0.15), hex audio kept as bytes'); }
{ // LTX: 429 → wait (Retry-After, else 5 s, 10 s …) then submit again; poll ≥ 5 s; job errors mapped; 2 jobs at once, the rest wait in the app
  let posts = 0; const waits: number[] = [];
  const { f, calls } = fakeFetch((url, init) => { if (init.method === 'POST') { posts++; return posts === 1 ? { status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'queue' } }, headers: { 'retry-after': '3' } } : posts === 2 ? { status: 429, body: { type: 'error', error: { type: 'rate_limit_error' } } } : { status: 202, body: { id: 'L1' } }; }
    return url.endsWith('/L1') ? { body: { id: 'L1', status: 'completed', result: { video_url: 'https://cdn.invalid/l.mp4' } } } : { status: 404 }; });
  const spec = S.ltxSpec('ltx-2-5-fast'); const req = await spec.build(job({ mode: 't2v', prompt: 'x', resolution: '1080p', duration: 8, aspect: '16:9' }));
  const r = await directRun(spec, req, 'k', { f, sleep: async (ms) => { waits.push(ms); } });
  assert.deepEqual(waits, [3000, 5000, 5000], 'Retry-After 3 s, then the 5 s backoff, then the ≥5 s poll'); assert.equal(r.outputs[0].url, 'https://cdn.invalid/l.mp4'); assert.equal(calls.at(-1)!.url, 'https://api.ltx.io/v2/text-to-video/L1');
  assert.equal(DIRECT_PROVIDERS.ltx.pollMs, 5000);
  const fail = fakeFetch((_u, init) => init.method === 'POST' ? { status: 202, body: { id: 'L2' } } : { body: { status: 'failed', error: { type: 'insufficient_funds_error', message: 'top up' } } });
  await assert.rejects(directRun(spec, req, 'k', { f: fail.f, sleep: noSleep }), (e: any) => e.reasonCode === 'provider_credits');
  const filt = fakeFetch((_u, init) => init.method === 'POST' ? { status: 202, body: { id: 'L3' } } : { body: { status: 'failed', error: { type: 'content_filtered_error', message: 'no' } } });
  await assert.rejects(directRun(spec, req, 'k', { f: filt.f, sleep: noSleep }), (e: any) => e.reasonCode === 'content_blocked');
  const busy = fakeFetch(() => ({ status: 429, body: {} })); await assert.rejects(directRun(spec, req, 'k', { f: busy.f, sleep: noSleep, timeoutMs: 1 }), (e: any) => e.reasonCode === 'queue_full');
  // queue: three jobs, never more than two in flight
  let inFlight = 0, peak = 0; const gates: (() => void)[] = [];
  const q = fakeFetch((_u, init) => { if (init.method === 'POST') { inFlight++; peak = Math.max(peak, inFlight); return { status: 202, body: { id: 'Q' } }; } return { body: { status: 'processing' } }; });
  const slow = (async (u: string, i: any) => { const r = await q.f(u, i); return r; }) as any;
  const runs = [0, 1, 2].map(() => directRun({ ...spec, poll: (j: any) => { const s = spec.poll!(j); return gates.length > 5 ? { done: true, status: 'completed', outputs: [{ url: 'x' }] } : s; } }, req, 'k', { f: slow, sleep: () => new Promise<void>((ok) => { gates.push(ok); setTimeout(ok, 5); }) }).then((x) => { inFlight--; return x; }));
  await new Promise((r) => setTimeout(r, 2)); assert.equal(directQueue('ltx').waiting, 1, 'the third job waits in the app'); await Promise.all(runs); assert.equal(peak, 2); assert.deepEqual(directQueue('ltx'), { busy: 0, waiting: 0 });
  ok('LTX: 429 waits Retry-After / backs off (5 s, 10 s …) and submits again, gives up at the timeout; polls every 5 s; job errors mapped; 2 jobs at once, the third waits'); }
{ // BFL through the generic runner (same as before): cost estimate then settled cost, moderation → content_blocked
  const { f } = fakeFetch((_u, init) => init.method === 'POST' ? { body: { id: 'b', polling_url: 'https://api.bfl.ai/v1/get_result?id=b', cost: 24 } } : { body: { status: 'Ready', result: { sample: 'https://x.invalid/v.mp4' }, cost: 24 } });
  const costs: any[] = []; await directRun(S.bflVideoSpec, await S.bflVideoSpec.build(job({ mode: 't2v', prompt: 'x', resolution: '1080p', duration: 5 })), 'k', { f, sleep: noSleep, onCost: (c) => costs.push(c) });
  assert.deepEqual(costs.map((c) => [c.usd, c.settled, c.unitLabel]), [[0.24, false, 'BFL credits'], [0.24, true, 'BFL credits']]);
  const m = fakeFetch((_u, init) => init.method === 'POST' ? { body: { id: 'b', polling_url: 'p' } } : { body: { status: 'Request Moderated' } });
  await assert.rejects(directRun(S.bflVideoSpec, await S.bflVideoSpec.build(job({ prompt: 'x' })), 'k', { f: m.f, sleep: noSleep }), (e: any) => e.reasonCode === 'content_blocked' && /bfl: Request Moderated/.test(e.message));
  const k = fakeFetch(() => ({ status: 403, body: { detail: 'bad key' } })); await assert.rejects(directRun(S.bflVideoSpec, await S.bflVideoSpec.build(job({ prompt: 'x' })), 'k', { f: k.f }), (e: any) => e.reasonCode === 'key_invalid' && /^bfl submit 403/.test(e.message));
  ok('BFL on the generic runner: x-key, credits estimate then settled, moderation → content_blocked, 403 → key_invalid (old "bfl submit 403" wording kept)'); }

// ---------------------------------------------------------------- 3. routes, prices, quote = charge
const tool = (id: string) => { const t = getTool(id); assert.ok(t, id); return t!; };
const credits = (toolId: string, routeId: string, input: Record<string, any>) => { const r = findRoute(routeId); assert.ok(r, routeId); assert.ok(r!.direct, `${routeId} has a direct spec`); return routeCredits(tool(toolId), r!, input); };
const CASES: [string, string, Record<string, any>, number][] = [
  ['h3-video', 'direct:minimax/h3', { resolution: '768p', duration: 6, mode: 't2v' }, 48], ['h3-video', 'direct:minimax/h3', { resolution: '480p', duration: 10, mode: 't2v' }, 50],
  ['h3-video', 'direct:minimax/h3', { resolution: '768p', duration: 5, mode: 'r2v', refPaths: Array(7).fill('x.png') }, 48 /* 40 + 2 refs × $0.04 */],
  ['h3-video', 'direct:direct-ltx-25-pro', { resolution: '1080p', duration: 8 }, 136], ['h3-video', 'direct:direct-ltx-25-pro', { resolution: '4K', duration: 10 }, 390],
  ['h3-video', 'direct:direct-ltx-25-fast', { resolution: '720p', duration: 20 }, 180], ['h3-video', 'direct:direct-ltx-23-fast', { resolution: '1080p', duration: 6 }, 36],
  ['h3-video', 'direct:direct-flux3-video', { resolution: '1080p', duration: 5 }, 120], ['h3-video', 'direct:direct-flux3-video', { resolution: '4K', duration: 10 }, 410],
  ['h3-video', 'direct:direct-flux3-video', { resolution: '1080p', duration: 5, draft: true }, 30],
  ['audio', 'direct:minimax/speech-2.8-hd', { mode: 'voice', prompt: 'a'.repeat(2500) }, 25], ['audio', 'direct:direct-minimax-speech-turbo', { mode: 'voice', prompt: 'a'.repeat(2500) }, 15],
  ['create-image', 'direct:direct-minimax-image', { types: ['generate'], imageResolution: '1K' }, 1], ['create-image', 'direct:direct-minimax-image', { types: ['generate'], imageResolution: '1K', n: 3 }, 3],
  ['create-image', 'direct:bfl/flux-2-klein-4b', { types: ['generate'], imageResolution: '1K' }, 2 /* $0.014 rounded up per request (usdToCredits) */], ['create-image', 'direct:bfl/flux-2-klein-4b#edit', { types: ['edit'], imageResolution: '1K' }, 2],
  ['create-image', 'direct:direct-flux2-klein-9b', { types: ['generate'], imageResolution: '1K' }, 2], ['create-image', 'direct:bfl/flux-2-klein-9b#edit', { types: ['edit'], imageResolution: '1K' }, 2],
  ['create-image', 'direct:direct-flux2-flex', { types: ['generate'], imageResolution: '1K' }, 5], ['create-image', 'direct:bfl/flux-2-flex#edit', { types: ['edit'], imageResolution: '1K' }, 10],
];
for (const [t, r, i, want] of CASES) assert.equal(credits(t, r, i), want, `${r} ${JSON.stringify(i)}`);
for (const [, r] of CASES) { const d = findRoute(r)!; const h = HOSTED_BY_ID[d.priceRef!]; assert.ok(h && h.usd != null && h.sourceUrl && h.checkedAt === '2026-10-23', `${r}: price row with source + date`); }
// FLUX 3 Upscaler: the corrected BFL price, $0.035 Precise / $0.05 Creative per output MP-second
assert.deepEqual(HOSTED_BY_ID['direct-flux3-upscale'].usdByMode, { precise: 0.035, creative: 0.05 });
ok(`quote = charge on ${CASES.length} cases: every new route priced from its own row (source + 2026-10-23); MiniMax refs over 5 at $0.04; FLUX 3 Video draft $0.06/s; Upscaler $0.035 / $0.05`);

// route limits and modes
{ const lt = findRoute('direct:direct-ltx-25-fast')!; assert.match(lt.unavailableFor!({ resolution: '4K', duration: 12 })!, /6, 8 or 10 s/); assert.equal(lt.unavailableFor!({ resolution: '1080p', duration: 20 }), null);
  assert.match(lt.unavailableFor!({ resolution: '1080p', duration: 6, draft: true })!, /no draft/);
  const mm = findRoute('direct:minimax/h3')!; assert.match(mm.unavailableFor!({ resolution: '480p', duration: 4 })!, /5–15 s/); assert.match(mm.unavailableFor!({ mode: 'r2v', refVideoPaths: ['a.mp4'] })!, /video references/);
  assert.equal(mm.unavailableFor!({ mode: 'r2v', refPaths: ['a'], refAudioPaths: ['b'] }), null);
  assert.ok(routesFor('comfy-h3', 'h3-video').some((r) => r.routeId === 'direct:minimax/h3'), 'MiniMax direct is a place of MiniMax H3 on Generate Video'); assert.ok(!routesFor('comfy-h3', 'camera').some((r) => r.routeId === 'direct:minimax/h3'), 'not on the camera app');
  const audio = routesFor('direct-minimax-speech', 'audio').map((r) => r.routeId); assert.deepEqual(audio, ['direct:minimax/speech-2.8-hd'], 'Audio tool: the live route stands in for the native one');
  assert.deepEqual(routesFor('direct-minimax-speech', 'voice').map((r) => r.routeId), ['direct:direct-minimax-speech'], 'Voice Studio keeps the native (not wired) route');
  assert.equal(routesFor('direct-flux3-upscale')[0].direct?.provider, 'bfl'); assert.equal(routesFor('comfy-flux3-klein').find((r) => r.routeId === 'direct:bfl/flux-3-image-klein')!.direct?.provider, 'bfl');
  ok('route rules: LTX 1440p/4K 6/8/10 s, no draft; H3-Max 5–15 s, no reference videos; MiniMax direct on Generate Video only; Speech HD live on Audio only; BFL routes on the direct spec'); }

// ---------------------------------------------------------------- 4. run-on from vendor, failure map
{ assert.equal(runOnOfRoute({ kind: 'direct', envKey: 'SOMETHING_ELSE', vendor: 'ltx' }), 'ltx', 'vendor wins over the env-key regex');
  for (const [id, ro] of [['direct:minimax/h3', 'minimax'], ['direct:direct-ltx-25-pro', 'ltx'], ['direct:direct-flux3-video', 'bfl'], ['direct:direct-minimax-image', 'minimax'], ['direct:bfl/flux-2-klein-4b', 'bfl']]) assert.equal(runOnOfRoute(findRoute(id)!), ro, id);
  const W = await import('../../web/src/shared/models.js'); assert.equal(W.runOnOfRoute({ routeId: 'direct:whatever', kind: 'direct', vendor: 'ltx' }), 'ltx'); assert.equal(W.runOnOfRoute('direct:direct-ltx-23-fast'), 'ltx');
  const view = (rc: string, route: string) => reasonOf({ status: 'failed', reasonCode: rc, route });
  assert.equal(view('key_invalid', 'direct:direct-ltx-25-pro').mood, 'needsKey'); assert.equal(view('key_invalid', 'direct:direct-ltx-25-pro').title, 'Needs an LTX key');
  assert.equal(view('provider_credits', 'direct:minimax/h3').mood, 'noCredits'); assert.equal(view('provider_credits', 'direct:minimax/h3').title, 'MiniMax balance is empty');
  assert.equal(view('input_invalid', 'direct:minimax/h3').mood, 'badInput'); assert.equal(view('provider_error', 'direct:direct-flux3-video').mood, 'providerDown'); assert.equal(view('queue_full', 'direct:direct-ltx-25-fast').mood, 'providerDown');
  assert.equal(view('content_blocked', 'direct:direct-flux3-video').mood, 'badInput');
  // batch 2: OpenAI, Google Gemini API, BytePlus ModelArk
  for (const [id, ro] of [['direct:openai/gpt-image-2.5-flare', 'openai'], ['direct:google/gemini-nano-banana-2.1', 'google'], ['direct:direct-gemini-nb2-lite', 'google'], ['direct:byteplus/seedance-2.0', 'byteplus'], ['direct:byteplus/seedream-5.0-flash', 'byteplus'], ['direct:direct-seedance-25', 'byteplus']]) {
    assert.equal(runOnOfRoute(findRoute(id)!), ro, id); assert.equal(W.runOnOfRoute(id), ro, `web fallback ${id}`); }
  assert.equal(view('key_invalid', 'direct:openai/gpt-image-2').title, 'Needs an OpenAI key'); assert.equal(view('provider_credits', 'direct:google/gemini-3-pro-image').title, 'Google Gemini API balance is empty');
  assert.equal(view('provider_credits', 'direct:byteplus/seedance-2.0').title, 'BytePlus balance is empty'); assert.equal(view('input_invalid', 'direct:byteplus/seedance-2.0').mood, 'badInput');
  ok('run-on: the route\'s vendor (server and web), regex only as fallback; failure map: key → needsKey (named lab), credits → noCredits, input → badInput, busy / errors → providerDown'); }
fs.rmSync(D, { recursive: true, force: true });
console.log('ALL OK direct-providers');
