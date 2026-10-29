/**
 * fal + Replicate client contract tests (npm run contracts:routing). No network: a fake fetch serves the HAND-WRITTEN fixtures in
 * fixtures/routing and records every request, which is checked against the official docs (URL, method, auth header, body shape).
 */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { falRun, falImageInput } from '../../server/src/providers/fal.js';
import { replicateRun, replicateImageInput } from '../../server/src/providers/replicate.js';
import { allExtraRoutes } from '../../server/src/routing/routes.js';
import { h3FalBody, h3ReplicateBody } from '../../server/src/tools/h3/cloud.js';
import { HOSTED_BY_ID } from '../../server/src/shared/hostedPrices.js';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const F = (n: string) => JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures/routing', n), 'utf8'));
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x?: unknown) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${c ? '' : ' ' + JSON.stringify(x)}`); };
type Call = { url: string; method: string; headers: Record<string, string>; body?: any };
const fake = (script: [RegExp, string, any, number?][]) => { const calls: Call[] = []; let i = 0;
  const f = (async (url: string, init: any = {}) => { calls.push({ url, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined });
    const [re, method, body, status] = script[Math.min(i++, script.length - 1)];
    if (!re.test(url) || (init.method ?? 'GET') !== method) throw new Error(`unexpected ${init.method ?? 'GET'} ${url}`);
    return new Response(JSON.stringify(body), { status: status ?? 200, headers: { 'content-type': 'application/json' } }); }) as unknown as typeof fetch;
  return { f, calls }; };
// fal: submit → status IN_PROGRESS → COMPLETED → result
{ const { f, calls } = fake([[/^https:\/\/queue\.fal\.run\/fal-ai\/qwen-image$/, 'POST', F('fal-submit.json')], [/\/status$/, 'GET', F('fal-status-in-progress.json')], [/\/status$/, 'GET', F('fal-status-completed.json')], [/\/response$/, 'GET', F('fal-result.json')]]);
  const r = await falRun('fal-ai/qwen-image', falImageInput('fal-ai/qwen-image', { prompt: 'a red bicycle', seed: 7 }), 'k', { timeoutMs: 10_000, pollMs: 1, f });
  ok('fal submit: POST https://queue.fal.run/{model_id}', calls[0].method === 'POST' && calls[0].url === 'https://queue.fal.run/fal-ai/qwen-image');
  ok('fal auth: Authorization: Key <key>', calls.every((c) => c.headers.Authorization === 'Key k'));
  ok('fal body = model input (prompt, seed, image_size, num_images)', calls[0].body.prompt === 'a red bicycle' && calls[0].body.seed === 7 && calls[0].body.image_size === 'square_hd' && calls[0].body.num_images === 1, calls[0].body);
  ok('fal start timeout header', calls[0].headers['X-Fal-Request-Start-Timeout'] === '10');
  ok('fal polls status_url returned by submit', calls[1].url === F('fal-submit.json').status_url);
  ok('fal result read from response_url', calls[3].url === F('fal-status-completed.json').response_url && r.result.images[0].url.startsWith('https://v3.fal.media/'));
}
{ const { f } = fake([[/fal-ai\/qwen-image$/, 'POST', F('fal-submit.json')], [/\/status$/, 'GET', F('fal-status-error.json')]]);
  let msg = ''; try { await falRun('fal-ai/qwen-image', { prompt: 'x' }, 'k', { timeoutMs: 5000, pollMs: 1, f }); } catch (e) { msg = String(e); }
  ok('fal COMPLETED with error/error_type → throws', /runner_server_error/.test(msg), msg); }
{ const { f, calls } = fake([[/fal-ai\/qwen-image$/, 'POST', F('fal-submit.json')], [/\/status$/, 'GET', F('fal-status-in-progress.json')], [/\/cancel$/, 'PUT', { status: 'CANCELLATION_REQUESTED' }, 202]]);
  let to = false; try { await falRun('fal-ai/qwen-image', { prompt: 'x' }, 'k', { timeoutMs: 0, pollMs: 1, f }); } catch (e: any) { to = !!e.timeout; }
  ok('fal timeout → PUT cancel_url, timeout error', to && calls.at(-1)!.method === 'PUT' && calls.at(-1)!.url === F('fal-submit.json').cancel_url); }
ok('fal nano-banana-2 input uses num_images, no image_size', (() => { const b = falImageInput('fal-ai/nano-banana-2', { prompt: 'p' }); return b.num_images === 1 && !('image_size' in b); })());
ok('fal flux-2-pro input has no num_images (not in its schema)', !('num_images' in falImageInput('fal-ai/flux-2-pro', { prompt: 'p' })));
// Replicate: create (official model) → get → succeeded
{ const { f, calls } = fake([[/^https:\/\/api\.replicate\.com\/v1\/models\/qwen\/qwen-image\/predictions$/, 'POST', F('replicate-starting.json'), 201], [/\/v1\/predictions\/gm3q/, 'GET', F('replicate-succeeded.json')]]);
  const r = await replicateRun('qwen/qwen-image', replicateImageInput('qwen/qwen-image', { prompt: 'a red bicycle', seed: 7 }), 'r8_x', { timeoutMs: 10_000, pollMs: 1, f });
  ok('replicate create: POST /v1/models/{owner}/{name}/predictions', calls[0].method === 'POST' && calls[0].url === 'https://api.replicate.com/v1/models/qwen/qwen-image/predictions');
  ok('replicate auth: Authorization: Bearer <token>', calls.every((c) => c.headers.Authorization === 'Bearer r8_x'));
  ok('replicate body = { input }', JSON.stringify(Object.keys(calls[0].body)) === '["input"]' && calls[0].body.input.prompt === 'a red bicycle' && calls[0].body.input.seed === 7);
  ok('replicate Cancel-After header (min 5s)', calls[0].headers['Cancel-After'] === '10s');
  ok('replicate poll GET /v1/predictions/{id}', calls[1].url === 'https://api.replicate.com/v1/predictions/gm3qorzdhgbfurvjtvhg6dckhu');
  ok('replicate output URLs', r.urls[0].startsWith('https://replicate.delivery/'));
}
{ const { f } = fake([[/predictions$/, 'POST', F('replicate-starting.json'), 201], [/predictions\/gm3q/, 'GET', F('replicate-failed.json')]]);
  let msg = ''; try { await replicateRun('qwen/qwen-image', { prompt: 'x' }, 'k', { timeoutMs: 5000, pollMs: 1, f }); } catch (e) { msg = String(e); }
  ok('replicate failed → throws with error', /CUDA out of memory/.test(msg), msg); }
ok('replicate nano-banana-2 input has no seed (not in its schema)', !('seed' in replicateImageInput('google/nano-banana-2', { prompt: 'p', seed: 3 })));
// OpenSoul cloud routes (HAND-WRITTEN fixtures from the model API pages, 2026-10-17)
{ const sz = { width: 896, height: 1184 }; const refs = ['data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB'];
  const q = falImageInput('fal-ai/qwen-image-edit-2511', { prompt: 'p', seed: 7, imageUrls: refs, imageSize: sz });
  ok('soul fal qwen-image-edit-2511: prompt + image_urls[] + image_size {width,height}', q.prompt === 'p' && Array.isArray(q.image_urls) && (q.image_urls as string[]).length === 2 && (q as any).image_size.width === 896 && q.seed === 7, q);
  const pu = falImageInput('fal-ai/flux-pulid', { prompt: 'p', imageUrls: refs, imageSize: sz });
  ok('soul fal flux-pulid: reference_image_url (first ref) + image_size + id_weight', pu.reference_image_url === refs[0] && !('image_urls' in pu) && pu.id_weight === 1, pu);
  const zl = falImageInput('fal-ai/z-image/turbo/lora', { prompt: 'p', imageSize: sz, loras: [{ path: 'https://x/y.safetensors', scale: 0.5 }] });
  ok('soul fal z-image lora: loras[] + custom image_size', Array.isArray(zl.loras) && (zl as any).image_size.height === 1184, zl);
  const rq = replicateImageInput('qwen/qwen-image-edit-2511', { prompt: 'p', seed: 3, imageUrls: refs, aspectRatio: '3:4' });
  ok('soul replicate qwen-image-edit-2511: image[] + aspect_ratio + seed', Array.isArray(rq.image) && rq.aspect_ratio === '3:4' && rq.seed === 3, rq);
  { const { f, calls } = fake([[/fal-ai\/qwen-image-edit-2511$/, 'POST', F('fal-submit.json')], [/\/status$/, 'GET', F('fal-status-completed.json')], [/\/response$/, 'GET', F('fal-soul-qwen-edit-result.json')]]);
    const r = await falRun('fal-ai/qwen-image-edit-2511', q, 'k', { timeoutMs: 5000, pollMs: 1, f }); ok('soul fal qwen-edit run → images[0].url', calls[0].url.endsWith('/fal-ai/qwen-image-edit-2511') && r.result.images[0].url.endsWith('qwen-edit-out.png')); }
  { const { f, calls } = fake([[/fal-ai\/esrgan$/, 'POST', F('fal-submit.json')], [/\/status$/, 'GET', F('fal-status-completed.json')], [/\/response$/, 'GET', F('fal-soul-esrgan-result.json')]]);
    const r: any = await falRun('fal-ai/esrgan', { image_url: 'data:image/png;base64,AAAA', scale: 2, model: 'RealESRGAN_x2plus' }, 'k', { timeoutMs: 5000, pollMs: 1, f });
    ok('soul fal esrgan: image_url + scale + model → image.url', calls[0].body.scale === 2 && calls[0].body.model === 'RealESRGAN_x2plus' && r.result.image.url.endsWith('esrgan-out.png')); }
  { const { f, calls } = fake([[/v1\/models\/qwen\/qwen-image-edit-2511\/predictions$/, 'POST', F('replicate-starting.json'), 201], [/predictions\/gm3q/, 'GET', F('replicate-soul-qwen-edit-succeeded.json')]]);
    const r = await replicateRun('qwen/qwen-image-edit-2511', rq, 'r8', { timeoutMs: 5000, pollMs: 1, f }); ok('soul replicate qwen-edit (official model endpoint) → output url', calls[0].url.endsWith('/models/qwen/qwen-image-edit-2511/predictions') && r.urls[0].endsWith('out-0.png')); }
}
// MiniMax H3 bodies vs the documented input schemas (fal model API tabs + replicate.com/minimax/h3 README, read 2026-10-17)
{ const SAMPLES = path.join(HERE, '../../server/samples'); const img = fs.readdirSync(SAMPLES).find((x) => /\.png$/.test(x))!; const IMG = path.join(SAMPLES, img);
  const FAL_DOC: Record<string, string[]> = {
    'minimax/h3/text-to-video': ['prompt', 'duration', 'resolution', 'seed', 'enable_safety_checker', 'prompt_expansion_mode', 'target_audio_url', 'aspect_ratio'],
    'minimax/h3/image-to-video': ['prompt', 'duration', 'resolution', 'seed', 'enable_safety_checker', 'prompt_expansion_mode', 'target_audio_url', 'image_url', 'end_image_url'],
    'minimax/h3/reference-to-video': ['prompt', 'duration', 'resolution', 'seed', 'enable_safety_checker', 'prompt_expansion_mode', 'aspect_ratio', 'reference_image_urls', 'reference_video_urls', 'reference_audio_urls'],
  };
  const t2v = await h3FalBody('minimax/h3/text-to-video', { id: 'c1', input: { mode: 't2v', prompt: 'p', duration: 10, resolution: '768p', aspect: '9:16', seed: 3 } });
  ok('fal H3 t2v: documented fields only, 768P, aspect', Object.keys(t2v).every((k) => FAL_DOC['minimax/h3/text-to-video'].includes(k)) && t2v.resolution === '768P' && t2v.aspect_ratio === '9:16' && t2v.duration === 10, t2v);
  const flf = await h3FalBody('minimax/h3/image-to-video', { id: 'c2', input: { mode: 'flf', prompt: 'p', duration: 6, resolution: '480p', imagePath: IMG, lastFramePath: IMG } });
  ok('fal H3 first/last frame: image_url + end_image_url (data URIs), 480P', Object.keys(flf).every((k) => FAL_DOC['minimax/h3/image-to-video'].includes(k)) && String(flf.image_url).startsWith('data:image/') && String(flf.end_image_url).startsWith('data:image/') && flf.resolution === '480P', Object.keys(flf));
  const tmpWav = path.join(HERE, 'fixtures/routing/.h3-speech.wav'); fs.writeFileSync(tmpWav, Buffer.alloc(64));
  const ls = await h3FalBody('minimax/h3/reference-to-video', { id: 'c3', input: { mode: 'lipsync', prompt: 'p', duration: 4, imagePath: IMG, speechPath: tmpWav } }); fs.rmSync(tmpWav);
  ok('fal H3 talking photo: reference_image_urls + reference_audio_urls', Object.keys(ls).every((k) => FAL_DOC['minimax/h3/reference-to-video'].includes(k)) && (ls.reference_image_urls as string[]).length === 1 && String((ls.reference_audio_urls as string[])[0]).startsWith('data:audio/'), Object.keys(ls));
  const vid = path.join(SAMPLES, fs.readdirSync(SAMPLES).find((x) => /\.mp4$/.test(x))!);
  const ex = await h3FalBody('minimax/h3-max/extend-video', { id: 'c4', input: { prompt: 'next', videoPath: vid, extendSeconds: 10, resolution: '768p' } });
  ok('fal H3 extend: documented fields, video_url, duration 10, 768P, aspect auto, output continuation', Object.keys(ex).every((k) => ['video_url', 'prompt', 'reference_audio_urls', 'enable_prompt_expansion', 'duration', 'resolution', 'aspect_ratio', 'seed', 'output', 'enable_safety_checker'].includes(k)) && ex.output === 'continuation' && String(ex.video_url).startsWith('data:video/mp4') && ex.duration === 10 && ex.resolution === '768P' && ex.aspect_ratio === 'auto' && ex.prompt === 'next', Object.keys(ex));
  const REP = ['prompt', 'first_frame_image', 'last_frame_image', 'reference_image_urls', 'reference_video_urls', 'reference_audio_urls', 'duration', 'resolution', 'ratio'];
  const rb = await h3ReplicateBody({ id: 'c5', input: { mode: 'flf', prompt: 'p', duration: 20, imagePath: IMG, lastFramePath: IMG } });
  ok('replicate H3: documented fields, duration clamped 4–15, 768P, adaptive ratio for image modes', Object.keys(rb).every((k) => REP.includes(k)) && rb.duration === 15 && rb.resolution === '768P' && rb.ratio === 'adaptive' && !!rb.first_frame_image && !!rb.last_frame_image, Object.keys(rb));
  let threw = ''; try { await h3ReplicateBody({ id: 'c6', input: { mode: 'r2v', prompt: 'p', refPaths: [IMG] } }); } catch (e) { threw = String(e); }
  ok('replicate H3 references need public URLs (no base URL → refused before submit)', /PUBLIC_BASE_URL/.test(threw), threw);
  const { f, calls } = fake([[/^https:\/\/queue\.fal\.run\/minimax\/h3\/text-to-video$/, 'POST', F('fal-submit.json')], [/\/status$/, 'GET', F('fal-status-completed.json')], [/\/response$/, 'GET', { video: { url: 'https://v3b.fal.media/files/x.mp4', content_type: 'video/mp4' } }]]);
  const r = await falRun('minimax/h3/text-to-video', t2v, 'k', { timeoutMs: 10_000, pollMs: 1, f });
  ok('fal H3 result: video.url parsed', (r.result as any).video?.url === 'https://v3b.fal.media/files/x.mp4' && calls[0].body.prompt === 'p', r.result);
}
// every fal/Replicate route has a price row with source + date
{ // fal FLUX 3 Klein t2i request = the page's Input schema (fixture fal-flux3-klein-t2i.json)
  const K = F('fal-flux3-klein-t2i.json'); const keysOk = (b: Record<string, unknown>) => Object.keys(b).every((k) => K.allowedKeys.includes(k));
  const sizeOk = (v: any) => typeof v === 'string' ? K.imageSizeEnum.includes(v) : [v?.width, v?.height].every((n) => Number.isInteger(n) && n >= K.imageSizeMin && n <= K.imageSizeMax);
  const a = falImageInput(K.endpoint, { prompt: 'p', seed: 7 }); const b = falImageInput(K.endpoint, { prompt: 'p', imageSize: { width: 5000, height: 100 } }); const c = falImageInput(K.endpoint, { prompt: 'p', aspectRatio: '9:16' });
  ok('fal Klein t2i body keys ⊆ schema, image_size valid (default / custom clamped 256–4096 / aspect enum)', keysOk(a) && keysOk(b) && keysOk(c) && sizeOk(a.image_size) && sizeOk(b.image_size) && c.image_size === 'portrait_16_9' && K.outputFormats.includes(a.output_format) && a.num_images === 1, { a, b, c });
  ok('fal Klein fixture example request validates too', keysOk(K.exampleRequest) && sizeOk(K.exampleRequest.image_size));
}
{ // Generate Video per-model limits: every hosted model read from docs is verified, has a docs URL, and is billed per second (quote = charge is checked in video-caps e2e)
  const { VIDEO_LIMITS } = await import('../../server/src/tools/h3/videoCaps.js');
  for (const id of ['api-minimax-h3', 'router-kling', 'router-veo', 'router-seedance']) { const L = VIDEO_LIMITS[id]; const h = HOSTED_BY_ID[id];
    ok(`video limits ${id}: verified, docs source, per-second price row, durations within ${L?.minSeconds}–${L?.maxSeconds}`, !!L && L.verified && /^https:\/\/docs\.comfy\.org\//.test(L.source) && h?.unit === 'second' && h.usd != null && L.durations.every((d: number) => d >= L.minSeconds && d <= L.maxSeconds) && L.aspects.includes('auto'), { L: L && { ...L, source: L.source.slice(0, 60) }, unit: h?.unit }); }
  const k = VIDEO_LIMITS['router-kling'], v = VIDEO_LIMITS['router-veo'], s = VIDEO_LIMITS['router-seedance'], m = VIDEO_LIMITS['api-minimax-h3'];
  ok('video limits match docs (Kling 3–15, Veo 4/6/8, Seedance 4–15 9/3/3, MiniMax H3 4–15 9/3/3)', k.minSeconds === 3 && k.maxSeconds === 15 && JSON.stringify(v.durations) === '[4,6,8]' && s.minSeconds === 4 && s.maxSeconds === 15 && s.refKinds.video === 3 && s.refKinds.image === 9 && m.refKinds.video === 3 && m.refKinds.image === 9 && v.audio.default === false && k.audio.default === true);
}
{ // Seedance price row = the model we call (dreamina-seedance-2-0) at the official 2.0 token rate × the page's formula (16:9, 24 fps, no video input)
  const h = HOSTED_BY_ID['router-seedance']; const per = (w: number, hh: number, rate: number) => Math.round(((w * hh * 24) / 1024 / 1000) * rate / 211 * 1e5) / 1e5;
  ok('Seedance row: Seedance 2.0 (dreamina-seedance-2-0), not estimated, 2.112/2.323 credits per 1K tokens', !!h && /dreamina-seedance-2-0/.test(h.model) && h.estimated === false && h.checkedAt === '2026-10-17'
    && Math.abs(h.usdByQuality!['480p'] - per(854, 480, 2.112)) < 2e-5 && Math.abs(h.usdByQuality!['720p'] - per(1280, 720, 2.112)) < 2e-5 && Math.abs(h.usdByQuality!['1080p'] - per(1920, 1080, 2.323)) < 2e-5, h);
  const vi = h?.videoInput; ok('Seedance video-input rate: 1.297 / 1.418 credits per 1K tokens on (input + output) s', !!vi && Math.abs(vi.usdByQuality['480p'] - per(854, 480, 1.297)) < 2e-5 && Math.abs(vi.usdByQuality['720p'] - per(1280, 720, 1.297)) < 2e-5 && Math.abs(vi.usdByQuality['1080p'] - per(1920, 1080, 1.418)) < 2e-5, vi);
  { const { priceOf } = await import('../../server/src/shared/pricing.js'); const a = priceOf({ toolId: 'h3-video', rates: {}, quality: '720p', durationSec: 5, provider: 'router-seedance', refVideoSec: 5 } as any).credits; const b = priceOf({ toolId: 'h3-video', rates: {}, quality: '720p', durationSec: 5, provider: 'router-kling', refVideoSec: 5 } as any).credits, b0 = priceOf({ toolId: 'h3-video', rates: {}, quality: '720p', durationSec: 5, provider: 'router-kling' } as any).credits;
    ok('priceOf: Seedance 5 s out + 5 s ref video = round(10 × 28.015 / 211 × 100) = 133; Kling ignores refVideoSec', a === Math.round(10 * 28.015 / 211 * 100) && a === 133 && b === b0, { a, b, b0 }); }
  const { VIDEO_LIMITS } = await import('../../server/src/tools/h3/videoCaps.js'); const hk = (id: string) => HOSTED_BY_ID[id];
  ok('every Generate Video resolution tier has its own price (or a single flat rate)', Object.entries({ 'router-kling': 1, 'router-veo': 1, 'router-seedance': 1, 'api-minimax-h3': 1 }).every(([id]) => VIDEO_LIMITS[id].resolutions.every((r: string) => (hk(id).usdByQuality?.[r] ?? hk(id).usd) != null && (!hk(id).usdByQuality || hk(id).usdByQuality![r] != null))));
}
for (const r of allExtraRoutes()) { const h = HOSTED_BY_ID[r.priceRef!]; if ((r as any).comingSoon) { ok(`coming-soon route ${r.routeId} stays unpriced`, !!h && h.usd == null, h); continue; } ok(`price row for ${r.routeId}`, !!h && h.usd != null && /^https:\/\/(fal\.ai|replicate\.com|docs\.bfl\.ml)\//.test(h.sourceUrl) && /^2026-10-(1[67]|2[01])$/.test(h.checkedAt) /* 2026-10-20/21: provider audit re-checks */, h); }
fs.writeFileSync(path.join(HERE, 'routing-results.json'), JSON.stringify({ pass, fail, at: new Date().toISOString(), fixtures: 'hand-written from docs' }, null, 2));
console.log(`\nrouting contracts: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
