// Image models added 2026-10-22 (model-catalog pass): GPT Image 2.5 Flare / Sunburst, Nano Banana 2.1 / Pro, FLUX 3 Image, FLUX.2 [max], Seedream 5.0 Flash,
// Ideogram 4.5, Qwen Image 3.0 Pro (+ Qwen Image 3.0 edit), Recraft V4.1 / V4.1 Pro, Luma UNI-1 Max.
// 1. pure: every new request body only uses fields its published schema declares (field lists copied from docs.comfy.org/router-schemas/<id>.json,
//    the BFL FLUX 3 API reference, fal's and Replicate's model API tabs, read 2026-10-22), required fields are present, enums hold; prices follow the
//    published figures (OpenAI's token formula for GPT Image 2.5, Google's per-image token equivalents, BFL / fal / Replicate per-image rows).
// 2. e2e (own mock server :9183, fake keys, mock backend: no provider is called): for each new model and place, GET /api/tools/create-image/price
//    equals what POST /api/tools/create-image/jobs charges (generate and edit, every priced resolution / tier).
// Run: npx tsx test/image-models-catalog.test.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9183); const B = `http://localhost:${PORT}`; const D = fs.mkdtempSync(path.join(os.tmpdir(), 'imgcat-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
Object.assign(process.env, NOKEYS, { OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(D, 'unit-')), OPENHIGGSFIELD_BACKEND: 'mock' });
const ok = (m: string) => console.log('ok ' + m);
const PNG = path.join(ROOT, 'samples/sample-keyframe.png');

const { ROUTER_MODELS } = await import('../src/routing/routerModels.ts');
const { ROUTER_SIZE_RULES } = await import('../src/shared/routerImageSizes.ts');
const { HOSTED_BY_ID, gptImageTokens, gptImageQuote } = await import('../src/shared/hostedPrices.ts');
await import('../src/routing/routePrices.ts');
const { usdPerImage, IMAGE_CAPS } = await import('../src/shared/imageCaps.ts');
const { GENERATE_MODELS, EDIT_MODELS, MASK_MODELS, modelNameOf } = await import('../src/shared/imageFeatures.ts');
const { falImageInput, flux2MaxSize } = await import('../src/providers/fal.ts');
const { replicateImageInput } = await import('../src/providers/replicate.ts');
const { bflFlux3ImageRequest } = await import('../src/hostedRequests.ts');

// ---------------- 1. bodies vs schemas ----------------
type S = { keys: string[]; required: string[]; enums?: Record<string, string[]> };
const GPT: S = { keys: ['background', 'image', 'mask', 'model', 'moderation', 'n', 'output_compression', 'output_format', 'partial_images', 'prompt', 'quality', 'size', 'stream', 'user'], required: ['prompt'],
  enums: { quality: ['auto', 'low', 'medium', 'high', 'xhigh', 'max', 'standard', 'hd'], output_format: ['png', 'webp', 'jpeg'] } };
const GEMINI: S = { keys: ['contents', 'generationConfig', 'safetySettings', 'systemInstruction', 'tools', 'uploadImagesToStorage', 'videoMetadata'], required: ['contents'] };
const SEEDREAM: S = { keys: ['guidance_scale', 'image', 'layer_decomposition', 'model', 'optimize_prompt_options', 'output_format', 'prompt', 'response_format', 'seed', 'sequential_image_generation', 'sequential_image_generation_options', 'size', 'stream', 'watermark'], required: [],
  enums: { output_format: ['png', 'jpeg'], response_format: ['url', 'b64_json'] } };
const IDEO45: S = { keys: ['enable_copyright_detection', 'image', 'images', 'magic_prompt', 'mask', 'num_images', 'prompt', 'quality', 'reference_images', 'seed', 'size'], required: ['prompt'], enums: { quality: ['very_low', 'low', 'medium', 'high'] } };
const QWEN: S = { keys: ['input', 'model', 'parameters'], required: ['input'] };
const RECRAFT: S = { keys: ['controls', 'model', 'n', 'prompt', 'response_format', 'size', 'style', 'style_id'], required: ['prompt'] };
const LUMA: S = { keys: ['aspect_ratio', 'image_ref', 'model', 'output_format', 'prompt', 'source', 'style', 'type', 'video', 'web_search'], required: ['prompt'],
  enums: { aspect_ratio: ['3:1', '2:1', '21:9', '16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16', '1:2', '1:3'], type: ['image', 'image_edit', 'video', 'video_edit', 'video_reframe'], output_format: ['png', 'jpeg'] } };
const FLUX2: S = { keys: ['height', 'input_image', ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => `input_image_${n}`), 'output_format', 'prompt', 'prompt_upsampling', 'safety_tolerance', 'seed', 'width'], required: ['prompt'], enums: { output_format: ['jpeg', 'png'] } };
const FLUX3_AR = ['auto', '21:9', '2:1', '16:9', '3:2', '7:5', '4:3', '5:4', '1:1', '4:5', '3:4', '5:7', '2:3', '9:16', '1:2', '9:21'];
const FLUX3: S = { keys: ['aspect_ratio', 'grounding', 'images', 'prompt', 'resolution', 'safety_tolerance', 'version'], required: ['prompt'], enums: { aspect_ratio: FLUX3_AR, resolution: ['768sq', '1k', '1.5k', '2k', '4k'] } };
const check = (name: string, body: Record<string, any>, s: S) => {
  for (const k of Object.keys(body)) assert.ok(s.keys.includes(k), `${name}: field ${k} is not in the schema`);
  for (const k of s.required) assert.ok(body[k] != null, `${name}: required ${k} missing`);
  for (const [k, vals] of Object.entries(s.enums ?? {})) if (body[k] != null) assert.ok(vals.includes(body[k]), `${name}: ${k}=${body[k]} not in ${vals.join('/')}`);
};
const NEW: Record<string, { id: string; s: S; maxRefs: number }> = {
  'api-gpt-image-25-flare': { id: 'openai/gpt-image-2.5-flare', s: GPT, maxRefs: 16 }, 'api-gpt-image-25-sunburst': { id: 'openai/gpt-image-2.5-sunburst', s: GPT, maxRefs: 16 },
  'api-nano-banana-21': { id: 'vertexai/gemini-nano-banana-2.1', s: GEMINI, maxRefs: 14 }, 'api-nano-banana-pro': { id: 'vertexai/gemini-3-pro-image', s: GEMINI, maxRefs: 14 },
  'api-flux3-image': { id: 'bfl/flux-3-image', s: FLUX3, maxRefs: 10 }, 'api-flux2-max': { id: 'bfl/flux-2-max', s: FLUX2, maxRefs: 9 },
  'api-seedream-flash': { id: 'byteplus/seedream-5-0-flash-260915', s: SEEDREAM, maxRefs: 10 }, 'api-ideogram-45': { id: 'ideogram/ideogram-4-5', s: IDEO45, maxRefs: 5 },
  'api-qwen-image-pro': { id: 'qwen/qwen-image-3.0-pro', s: QWEN, maxRefs: 3 }, 'api-qwen-image': { id: 'qwen/qwen-image-3.0', s: QWEN, maxRefs: 3 },
  'api-recraft-41': { id: 'recraft/recraftv4_1', s: RECRAFT, maxRefs: 0 }, 'api-recraft-41-pro': { id: 'recraft/recraftv4_1_pro', s: RECRAFT, maxRefs: 0 },
  'api-luma-uni1-max': { id: 'luma_2/uni-1-max', s: LUMA, maxRefs: 9 },
};
for (const [pid, want] of Object.entries(NEW)) {
  const spec = ROUTER_MODELS[pid]; assert.ok(spec, `${pid}: Router spec`); assert.equal(spec.id, want.id); assert.equal(spec.maxRefs, want.maxRefs, `${pid}: maxRefs`);
  for (const [aspect, res, tier] of [['16:9', '1K', 'low'], ['9:16', '2K', 'high'], ['auto', '1K', 'med'], ['1:1', '4K', 'med']] as const) {
    /* the exact-size models (shared/routerImageSizes.ts: Seedream 5.0, Qwen Image 3.0) offer 1K / 2K only: 4K is refused before any call, never sent as 1K */
    if (res === '4K' && ROUTER_SIZE_RULES[pid]) { await assert.rejects(spec.body({ types: ['generate'], prompt: 'a red fox', aspect, imageResolution: res }, 0), /Resolution 4K isn't offered/); continue; }
    const g = await spec.body({ types: ['generate'], prompt: 'a red fox', aspect, imageResolution: res, quality: tier, seed: 7 }, 0); check(`${pid} generate ${aspect} ${res}`, g, want.s);
  }
  if (want.maxRefs) { const e = await spec.body({ types: ['edit'], prompt: 'make it night', refPaths: [PNG, PNG], imageResolution: '1K' }, 0); check(`${pid} edit`, e, want.s);
    assert.ok(JSON.stringify(e).length > 2000, `${pid}: the edit body carries the images`); assert.equal(spec.block!({ types: ['edit'], refPaths: Array(want.maxRefs + 1).fill(PNG) }) != null, true, `${pid}: over the limit refused`); }
  else assert.match(String(spec.block!({ types: ['edit'], refPaths: [PNG] })), /prompt only/, `${pid}: text only`);
}
// per-family details the schema enum can't show
{ const g: any = await ROUTER_MODELS['api-gpt-image-25-flare'].body({ types: ['generate'], prompt: 'p', aspect: '16:9', quality: 'med' }, 0); assert.equal(g.size, '1536x864', '16:9 1K: the exact size (shared/gptImageSizes.ts), not snapped to 3:2'); assert.equal(g.quality, 'medium'); assert.equal(g.image, undefined);
  const m: any = await ROUTER_MODELS['api-gpt-image-25-sunburst'].body({ types: ['inpaint'], prompt: 'p', refPaths: [PNG], maskPath: PNG }, 0); assert.ok(m.mask && m.image?.length === 1, 'inpaint sends image + mask');
  const nb: any = await ROUTER_MODELS['api-nano-banana-21'].body({ types: ['generate'], prompt: 'p', aspect: '21:9', imageResolution: '4K', seed: 3 }, 0); assert.deepEqual(nb.generationConfig.imageConfig, { imageSize: '4K', aspectRatio: '21:9' });
  const f3: any = await ROUTER_MODELS['api-flux3-image'].body({ types: ['edit'], prompt: 'p', aspect: 'auto', refPaths: [PNG], imageResolution: '2K', seed: 9 }, 0); assert.equal(f3.seed, undefined, 'FLUX 3 has no seed'); assert.equal(f3.resolution, '2k'); assert.equal(f3.aspect_ratio, 'auto'); assert.ok(!/^data:/.test(f3.images[0]), 'raw base64');
  const sf: any = await ROUTER_MODELS['api-seedream-flash'].body({ types: ['generate'], prompt: 'p', aspect: '16:9', imageResolution: '2K' }, 0); const [w, h] = sf.size.split('x').map(Number);
  assert.ok(w * h >= 921600 && w * h <= 4624220, 'Flash size within 1280×720…~2048²×1.1'); assert.equal(sf.sequential_image_generation, undefined, '5.0 Flash does not support batch'); assert.equal(sf.watermark, false);
  const i45: any = await ROUTER_MODELS['api-ideogram-45'].body({ types: ['edit'], prompt: 'p', aspect: '16:9', refPaths: [PNG] }, 0); assert.equal(i45.size, '2560x1440', 'edit with a picked shape: that shape\'s 2K preset (shared/hostedAspects.ts)');
  { const src: any = await ROUTER_MODELS['api-ideogram-45'].body({ types: ['edit'], prompt: 'p', aspect: 'auto', aspectAuto: true, refPaths: [PNG] }, 0); assert.equal(src.size, 'source', 'edit on Match photo: size source (the photo\'s size)'); } assert.equal(i45.images.length, 1);
  const i45g: any = await ROUTER_MODELS['api-ideogram-45'].body({ types: ['generate'], prompt: 'p', aspect: '16:9', quality: 'low' }, 0); assert.equal(i45g.size, '2560x1440'); assert.equal(i45g.quality, 'low');
  const q: any = await ROUTER_MODELS['api-qwen-image-pro'].body({ types: ['edit'], prompt: 'p', refPaths: [PNG, PNG, PNG] }, 0); const c = q.input.messages[0].content;
  assert.equal(c.length, 4); assert.ok(c.slice(0, 3).every((x: any) => /^data:image\/png;base64,/.test(x.image)) && c[3].text === 'p', '1–3 images then one text');
  const [qw, qh] = q.parameters.size.split('*').map(Number); assert.ok(qw * qh >= 262144 && qw * qh <= 6553600);
  const rp: any = await ROUTER_MODELS['api-recraft-41-pro'].body({ types: ['generate'], prompt: 'p', aspect: '16:9' }, 0); assert.equal(rp.size, '2688x1536', 'Pro = 2K size table');
  const r1: any = await ROUTER_MODELS['api-recraft-41'].body({ types: ['generate'], prompt: 'p', aspect: '16:9' }, 0); assert.equal(r1.size, '1344x768');
  const fm: any = await ROUTER_MODELS['api-flux2-max'].body({ types: ['edit'], prompt: 'p', refPaths: [PNG, PNG], imageResolution: '2K', aspect: '3:2' }, 0); assert.ok(fm.input_image && fm.input_image_2 && fm.width <= 2048 && fm.height <= 2048);
}
// other places: BFL direct, fal, Replicate
{ const r = bflFlux3ImageRequest({ prompt: 'p', aspectRatio: '9:21', imageRes: '4K', images: ['aGVsbG8='] } as any); assert.equal(r.url, 'https://api.bfl.ai/v1/flux-3-image'); check('BFL flux-3-image', r.body as any, FLUX3);
  assert.equal((r.body as any).resolution, '4k');
  const FAL_F2MAX: S = { keys: ['image_size', 'output_format', 'prompt', 'enable_safety_checker', 'sync_mode', 'seed', 'safety_tolerance'], required: ['prompt'], enums: { output_format: ['jpeg', 'png'], safety_tolerance: ['1', '2', '3', '4', '5'] } };
  for (const [res, area] of [['1K', 1e6], ['2K', 4e6]] as const) for (const a of ['1:1', '16:9', '9:16', '21:9', '4:3']) {
    const b: any = falImageInput('fal-ai/flux-2-max', { prompt: 'p', seed: 3, aspectRatio: a, imageRes: res }); check(`fal flux-2-max ${res} ${a}`, b, FAL_F2MAX);
    assert.ok(b.image_size.width * b.image_size.height <= area && b.image_size.width % 16 === 0 && b.image_size.height % 16 === 0, `${res} ${a}: ${JSON.stringify(b.image_size)} ≤ ${area} px`); }
  assert.deepEqual(flux2MaxSize('1K', '1:1'), { width: 992, height: 992 });
  const REP_NBP: S = { keys: ['prompt', 'resolution', 'image_input', 'aspect_ratio', 'output_format', 'safety_filter_level', 'allow_fallback_model'], required: ['prompt'],
    enums: { resolution: ['1K', '2K', '4K'], aspect_ratio: ['match_input_image', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'], output_format: ['jpg', 'png'] } };
  for (const res of ['1K', '2K', '4K']) { const b: any = replicateImageInput('google/nano-banana-pro', { prompt: 'p', aspectRatio: '16:9', imageRes: res }); check(`replicate nano-banana-pro ${res}`, b, REP_NBP); assert.equal(b.resolution, res); assert.equal(b.allow_fallback_model, false); }
}
ok(`Router bodies follow their schemas for ${Object.keys(NEW).length} models (generate × 4 sizes, edit, limits); BFL / fal / Replicate bodies too`);

// ---------------- prices from the published figures ----------------
const cr = (credits: number) => Math.round((credits / 211) * 1e5) / 1e5; const near = (a: number | null, b: number, m: string) => assert.ok(a != null && Math.abs(a - b) < 1e-4, `${m}: ${a} vs ${b}`);
assert.equal(gptImageTokens('gpt-image-2.5', 'low', 1024, 1024), 196, 'OpenAI calculator example: 1024² low = 196 tokens');
assert.equal(gptImageTokens('gpt-image-2.5', 'medium', 1024, 1024), 439); assert.equal(gptImageTokens('gpt-image-2.5', 'high', 1024, 1024), 1756);
assert.ok(gptImageTokens('gpt-image-2.5', 'high', 1536, 1024) < 1756, 'landscape / portrait sizes use fewer tokens than 1024² (the menu figure is an upper bound)');
// GPT Image (2026-10-24): the menu figure = gptImageQuote with no shape (the costliest) and a short prompt; full checks in gpt-image-sizes.e2e.ts
near(usdPerImage('api-gpt-image-25-flare', 'high', '1K'), Math.ceil(gptImageQuote('gpt-image-2.5', 'high', '1K').usd * 1e5) / 1e5, 'GPT Image 2.5 high');
assert.ok(usdPerImage('api-gpt-image-25-flare', 'high', '1K')! > cr(1756 * 9051.9 / 1e6), 'above the image-output-only figure');
// GPT Image 2 (2026-10-22): OpenAI's formula (1024²: low 196 / medium 1756 / high 7024 = its $0.006 / $0.053 / $0.211 at $30 / 1M) × Comfy 7,600 / 1M + the 0.37 in Comfy's 1.86 low example
{ const t = (q: string, w = 1024, h = 1024) => gptImageTokens('gpt-image-2', q, w, h);
  assert.deepEqual([t('low'), t('medium'), t('high')], [196, 1756, 7024]); assert.deepEqual([t('low', 1536, 1024), t('medium', 1024, 1536), t('high', 1536, 1024)], [158, 1372, 5488]);
  for (const [q, usd] of [['low', 0.006], ['medium', 0.053], ['high', 0.211]] as const) assert.ok(Math.abs(t(q) * 30 / 1e6 - usd) < 0.0005, `OpenAI per-image ${q}`);
  for (const q of ['low', 'med', 'high'] as const) { near(usdPerImage('api-gpt-image', q, '1K'), Math.ceil(gptImageQuote('gpt-image-2', q, '1K').usd * 1e5) / 1e5, `GPT Image 2 ${q}`);
    assert.ok(usdPerImage('api-gpt-image', q, '1K')! >= cr(t(q === 'med' ? 'medium' : q) * 7600 / 1e6 + 0.3704), `GPT Image 2 ${q} ≥ Comfy's own figure`); } }
// Nano Banana (2026-10-24): image tokens + 2,000 thinking / text tokens + 2,500 prompt tokens at Comfy Router's own rates (real NB 2.1 charges ran above image-only quotes)
near(usdPerImage('api-nano-banana-21', null, '2K'), cr((1680 * 9051.9 + 2000 * 2262.975 + 2500 * 452.595) / 1e6), 'NB 2.1 2K'); near(usdPerImage('api-nano-banana-pro', null, '4K'), cr((2000 * 30384 + 2000 * 3038.4 + 2500 * 506.4) / 1e6), 'NB Pro 4K');
// quote = charge: the two real Nano Banana 2.1 runs (1K, 1 image, no refs, 1:1) were charged ≈12.07 and ≈13.3 Comfy credits ($0.0572 / $0.063)
{ const q = usdPerImage('api-nano-banana-21', null, '1K')!; for (const charged of [0.0572, 0.063]) assert.ok(q >= charged, `NB 2.1 1K quote $${q} covers the real charge $${charged}`);
  near(usdPerImage('api-nano-banana', null, '1K'), cr((1120 * 15192 + 2000 * 759.6 + 2500 * 126.6) / 1e6), 'NB 2 1K'); }
near(usdPerImage('api-flux3-image', null, '4K'), cr(183.15), 'FLUX 3 Image 4K (partner page)'); // FLUX.2 [max] (2026-10-24, per MP): 14.77 first MP + 6.33 per extra STARTED MP of the largest output (1K 1024² → 2 MP, 2K 2048² → 5 MP; was 4 MP at 2K)
  near(usdPerImage('api-flux2-max', null, '1K'), cr(14.77 + (Math.ceil(1024 * 1024 / 1e6) - 1) * 6.33), 'FLUX.2 [max] 1K'); near(usdPerImage('api-flux2-max', null, '2K'), cr(14.77 + (Math.ceil(2048 * 2048 / 1e6) - 1) * 6.33), 'FLUX.2 [max] 2K');
near(usdPerImage('api-seedream-flash', null, '2K'), cr(5.4311), 'Seedream Flash flat'); near(usdPerImage('api-ideogram-45', 'high', '1K'), cr(60.346), 'Ideogram 4.5 high');
near(usdPerImage('api-qwen-image-pro', null, '2K'), cr(22.6297), 'Qwen Pro 2K'); near(usdPerImage('api-recraft-41', null, '1K'), cr(10.56), 'Recraft V4.1'); near(usdPerImage('api-recraft-41-pro', null, '2K'), cr(63.36), 'Recraft V4.1 Pro');
near(usdPerImage('api-luma-uni1-max', null, '1K'), cr(21.1), 'UNI-1 Max'); near(usdPerImage('direct:bfl/flux-3-image', null, '4K'), 0.607, 'BFL 4K'); near(usdPerImage('fal:fal-ai/flux-2-max', null, '2K'), 0.16, 'fal max 2K');
near(usdPerImage('replicate:google/nano-banana-pro', null, '4K'), 0.3, 'Replicate NB Pro 4K');
for (const pid of Object.keys(NEW)) { assert.ok(HOSTED_BY_ID[pid], `${pid}: price row`); const c = IMAGE_CAPS[pid]; const tiers = c.qualityTiers.length ? c.qualityTiers : [null];
  for (const t of tiers) for (const r of c.resolutions) assert.ok(usdPerImage(pid, t, r) != null, `${pid} ${t} ${r}: every offered cell is priced`); }
for (const pid of Object.keys(NEW)) { assert.ok(GENERATE_MODELS.includes(pid), `${pid} in Create Image`); assert.ok(modelNameOf(pid), `${pid}: model name`); assert.equal(EDIT_MODELS.includes(pid), NEW[pid].maxRefs > 0, `${pid}: edit iff its route sends images`); }
assert.ok(MASK_MODELS.includes('api-gpt-image-25-flare') && MASK_MODELS.includes('api-gpt-image-25-sunburst'));
ok('prices: GPT Image 2.5 tokens (196 / 439 / 1756), GPT Image 2 (196 / 1756 / 7024 tokens; quotes from gptImageQuote, ≥ Comfy figures), Google per-image token equivalents, partner / Router rows, BFL / fal / Replicate rows; every offered cell priced');

// ---------------- fal image pass (2026-10-22): fal edit routes + Bria GenFill ----------------
// Field lists, required fields and enums copied from each endpoint's OpenAPI schema (fal.ai/api/openapi/queue/openapi.json?endpoint_id=<id>, read 2026-10-22).
const { FAL_EDIT_BODIES, FAL_EDIT_ROUTES, GENFILL_ROUTE, seedreamEditSize } = await import('../src/tools/imageFalModels.ts');
const { priceOf } = await import('../src/shared/pricing.ts');
const { routesFor } = await import('../src/routing/routes.ts');
const FAL_SCHEMAS: Record<string, S> = {
  'bytedance/seedream/v5/pro/edit': { keys: ['enable_safety_checker', 'enhance_prompt_mode', 'image_size', 'image_urls', 'num_images', 'output_format', 'prompt', 'sync_mode'], required: ['prompt', 'image_urls'], enums: { output_format: ['jpeg', 'png'] } },
  'bytedance/seedream/v5/flash/edit': { keys: ['enable_safety_checker', 'image_size', 'image_urls', 'num_images', 'output_format', 'prompt', 'sync_mode'], required: ['prompt', 'image_urls'], enums: { output_format: ['jpeg', 'png'] } },
  'fal-ai/nano-banana-pro/edit': { keys: ['aspect_ratio', 'enable_web_search', 'image_urls', 'limit_generations', 'num_images', 'output_format', 'prompt', 'resolution', 'safety_tolerance', 'seed', 'sync_mode', 'system_prompt'], required: ['prompt', 'image_urls'],
    enums: { resolution: ['1K', '2K', '4K'], output_format: ['jpeg', 'png', 'webp'], aspect_ratio: ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'] } },
  'ideogram/v4.5/edit': { keys: ['edit_precision', 'image_size', 'image_url', 'mask_url', 'num_images', 'prompt', 'quality', 'reference_image_urls', 'seed', 'sync_mode'], required: ['prompt', 'image_url'],
    enums: { image_size: ['auto', 'square', 'square_hd', 'portrait_4_3', 'landscape_4_3', 'portrait_16_9', 'landscape_16_9'], quality: ['very_low', 'low', 'medium', 'high'] } },
  'luma/agent/uni-1/v1/edit': { keys: ['enable_safety_checker', 'image_url', 'output_format', 'prompt', 'reference_image_urls', 'style'], required: ['prompt', 'image_url'], enums: { output_format: ['png', 'jpeg'] } },
  'luma/agent/uni-1/v1/max/edit': { keys: ['enable_safety_checker', 'image_url', 'output_format', 'prompt', 'reference_image_urls', 'style'], required: ['prompt', 'image_url'], enums: { output_format: ['png', 'jpeg'] } },
  'xai/grok-imagine-image/v2.0/edit': { keys: ['aspect_ratio', 'enable_safety_checker', 'image_urls', 'num_images', 'output_format', 'prompt', 'quality', 'resolution', 'sync_mode'], required: ['prompt'],
    enums: { aspect_ratio: ['auto', '2:1', '20:9', '19.5:9', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', '9:19.5', '9:20', '1:2'], quality: ['low', 'medium'], resolution: ['1k', '2k'], output_format: ['jpeg', 'png', 'webp'] } },
  'fal-ai/kling-image/o1': { keys: ['aspect_ratio', 'elements', 'enable_safety_checker', 'image_urls', 'num_images', 'output_format', 'prompt', 'resolution', 'sync_mode'], required: ['prompt', 'image_urls'],
    enums: { output_format: ['jpeg', 'png', 'webp'], aspect_ratio: ['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3', '21:9'], resolution: ['1K', '2K'] } },
  'fal-ai/bria/genfill': { keys: ['image_url', 'mask_url', 'negative_prompt', 'num_images', 'prompt', 'seed', 'sync_mode'], required: ['image_url', 'mask_url', 'prompt'] },
};
const MAXN: Record<string, number> = { 'bytedance/seedream/v5/pro/edit': 10, 'bytedance/seedream/v5/flash/edit': 10, 'xai/grok-imagine-image/v2.0/edit': 5, 'fal-ai/kling-image/o1': 10, 'fal-ai/nano-banana-pro/edit': 14 };
for (const r of [...FAL_EDIT_ROUTES, GENFILL_ROUTE]) {
  const s = FAL_SCHEMAS[r.endpoint]; assert.ok(s, `${r.endpoint}: schema in the test`); assert.equal(r.kind, 'fal'); assert.equal(r.priceRef, `fal:${r.endpoint}`); assert.ok(r.eachImage && r.output === 'image');
  assert.ok(HOSTED_BY_ID[r.priceRef!] && !HOSTED_BY_ID[r.priceRef!].estimated, `${r.endpoint}: exact published price`); assert.ok(routesFor(r.modelId).some((x) => x.routeId === r.routeId), `${r.endpoint}: a route of ${r.modelId}`);
  const inpaint = r.modes!.includes('inpaint') && r.modes!.length === 1;
  for (const [aspect, res, tier] of [['16:9', '1K', 'low'], ['9:16', '2K', 'high'], ['auto', '1K', 'med'], ['21:9', '2K', 'med']] as const) {
    const i = { types: [inpaint ? 'inpaint' : 'edit'], prompt: 'make it night', refPaths: [PNG, PNG], imagePath: PNG, maskPath: PNG, aspect, imageResolution: res, quality: tier, tier, seed: 7 };
    const b: any = await r.request!({ id: 'test-job', input: i }); check(`${r.endpoint} ${aspect} ${res} ${tier}`, b, s);
    const imgs = [b.image_url, ...(b.image_urls ?? []), ...(b.reference_image_urls ?? [])].filter(Boolean); assert.ok(imgs.length >= 1 && imgs.every((u: string) => /^data:image\/png;base64,/.test(u)), `${r.endpoint}: images inline`);
    if (!inpaint) assert.equal(imgs.length, 2, `${r.endpoint}: both images sent (photo first)`); if (b.num_images != null) assert.equal(b.num_images, 1, 'one image per request (n requests for n images)');
  }
  if (MAXN[r.endpoint]) assert.match(String(r.unavailableFor!({ types: ['edit'], refPaths: Array(MAXN[r.endpoint] + 1).fill(PNG) })), /up to/, `${r.endpoint}: over the limit refused`);
}
// details per endpoint
{ for (const a of ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9']) { const one = seedreamEditSize({ aspect: a, imageResolution: '1K' }); const two = seedreamEditSize({ aspect: a, imageResolution: '2K' });
    const A1 = one.width * one.height, A2 = two.width * two.height; assert.ok(A1 >= 1024 * 1024 && A1 <= 1536 * 1536, `Seedream 1K ${a}: ${A1} px in the $0.0675 band`); assert.ok(A2 > 1536 * 1536 && A2 <= 2048 * 2048, `Seedream 2K ${a}: ${A2} px in the $0.135 band`);
    assert.ok([one.width, one.height, two.width, two.height].every((x) => x % 16 === 0)); }
  const g: any = await FAL_EDIT_BODIES.grok({ types: ['edit'], prompt: 'p', refPaths: [PNG], aspect: '3:4', imageResolution: '2K', tier: 'low' }); assert.deepEqual([g.resolution, g.quality, g.aspect_ratio], ['2k', 'low', '3:4']);
  const nb: any = await FAL_EDIT_BODIES.nanoBananaPro({ types: ['edit'], prompt: 'p', refPaths: [PNG], imageResolution: '4K' }); assert.deepEqual([nb.resolution, nb.aspect_ratio, nb.enable_web_search], ['4K', 'auto', false]);
  const ie: any = await FAL_EDIT_BODIES.ideogram45({ types: ['edit'], prompt: 'p', refPaths: [PNG, PNG, PNG], tier: 'high' }, 'j1'); assert.equal(ie.reference_image_urls.length, 2); assert.equal(ie.quality, 'high'); assert.equal(ie.mask_url, undefined);
  const im: any = await FAL_EDIT_BODIES.ideogram45({ types: ['inpaint'], prompt: 'p', imagePath: PNG, refPaths: [PNG], maskPath: PNG }, 'j2');
  assert.ok(/^data:image\/png;base64,/.test(im.mask_url) && im.image_size === undefined && im.reference_image_urls === undefined, 'inpaint: inverted mask, size auto (the schema allows no size with a mask)');
  const gf: any = await FAL_EDIT_BODIES.genfill({ types: ['inpaint'], prompt: 'p', imagePath: PNG, maskPath: PNG }); assert.equal(gf.mask_url, gf.image_url, 'our white = fill mask goes as is (Bria: white = the area to fill)'); }
// prices (1 credit = $0.01): published rate + per-image surcharges, as the quote computes them
{ const cr2 = (provider: string, o: Record<string, any> = {}) => priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider, ...o } as any).credits;
  assert.equal(cr2('fal:bytedance/seedream/v5/pro/edit', { imageRes: '1K', refImages: 1 }), 7, 'Seedream Pro 1K, 1 image: $0.0675');
  assert.equal(cr2('fal:bytedance/seedream/v5/pro/edit', { imageRes: '2K', refImages: 3 }), 15, 'Seedream Pro 2K + 2 extra images: $0.135 + 2 x $0.0045 = $0.144, rounded up (2026-10-24; was 14)');
  assert.equal(cr2('fal:bytedance/seedream/v5/flash/edit', { imageRes: '2K' }), 3, 'Seedream Flash $0.027');
  assert.equal(cr2('fal:fal-ai/nano-banana-pro/edit', { imageRes: '2K' }), 15); assert.equal(cr2('fal:fal-ai/nano-banana-pro/edit', { imageRes: '4K' }), 30, 'NB Pro 4K = 2 x $0.15');
  assert.deepEqual(['low', 'med', 'high'].map((t) => cr2('fal:ideogram/v4.5/edit', { tier: t, imageRes: '1K' })), [3, 6, 22], 'Ideogram 4.5 $0.03 / $0.06 / $0.22');
  assert.equal(cr2('fal:luma/agent/uni-1/v1/edit', { refImages: 1 }), 5, 'UNI-1 edit with 1 source image: $0.045 (the page example)'); assert.equal(cr2('fal:luma/agent/uni-1/v1/max/edit', { refImages: 1 }), 11, 'UNI-1 Max: $0.105 (the page example)');
  assert.equal(cr2('fal:xai/grok-imagine-image/v2.0/edit', { tier: 'med', imageRes: '2K', refImages: 2 }), 10, 'Grok 2K medium $0.08 + 2 x $0.01'); assert.equal(cr2('fal:xai/grok-imagine-image/v2.0/edit', { tier: 'low', imageRes: '1K', refImages: 1 }), 5);
  assert.equal(cr2('fal:fal-ai/kling-image/o1', { imageRes: '2K' }), 3, 'Kling O1 $0.028'); assert.equal(cr2('fal:fal-ai/bria/genfill'), 4, 'Bria GenFill $0.04');
  assert.equal(cr2('fal:fal-ai/kling-image/o1', { imageRes: '1K', count: 3 }), 9, 'n images = n x the per-image price'); }
assert.ok(EDIT_MODELS.includes('api-grok-image') && IMAGE_CAPS['api-grok-image'].supports.maxRefs === 5, 'Grok Imagine 2.0 edits (fal route)');
assert.ok(MASK_MODELS.includes('api-ideogram-45') && MASK_MODELS.includes('fal-bria-genfill') && !GENERATE_MODELS.includes('fal-bria-genfill') && !EDIT_MODELS.includes('fal-bria-genfill'), 'Brush Edit: Ideogram 4.5 and Bria GenFill');
assert.equal(modelNameOf('fal-bria-genfill', 'inpaint'), 'Bria GenFill');
ok(`fal pass: ${FAL_EDIT_ROUTES.length + 1} fal image routes follow their schemas (images inline, one image per request, limits), published prices incl. per-image surcharges`);

// ---------------- 2. e2e: quote = charge per model and place ----------------
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_ROUTING_LIVE: '',
  OPENHIGGSFIELD_FAL_KEY: 'fal-test-key-not-real', OPENHIGGSFIELD_REPLICATE_API_TOKEN: 'r8-test-not-real' /* fal / Replicate routes need a key to be picked; the mock backend never calls them */, OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_MAX_QUEUED: '0' /* many submits in a row */, OPENHIGGSFIELD_HOSTED: '' }, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: await r.json() as any }; };
const IMG = fs.readFileSync(PNG);
const submit = async (f: Record<string, string>, nImg: number) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v);
  if (nImg) fd.append('image', new Blob([IMG], { type: 'image/png' }), 'image.png'); if (/inpaint/.test(f.types ?? '')) fd.append('mask', new Blob([IMG], { type: 'image/png' }), 'mask.png'); for (let k = 1; k < nImg; k++) fd.append('refs', new Blob([IMG], { type: 'image/png' }), `ref${k}.png`);
  const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const cases: [string, string | null, string, number, string | null, string | null][] = []; // provider, runOn, mode, images, res, tier
  for (const pid of Object.keys(NEW)) { const c = IMAGE_CAPS[pid];
    for (const t of c.qualityTiers.length ? c.qualityTiers : [null]) for (const r of c.resolutions) cases.push([pid, 'comfy', 'generate', 0, r, t]);
    if (NEW[pid].maxRefs) cases.push([pid, 'comfy', 'edit', Math.min(2, NEW[pid].maxRefs), c.edit?.resolutions?.[0] ?? c.resolutions[0], c.qualityTiers.length ? 'med' : null]); }
  for (const r of ['1K', '2K', '4K']) cases.push(['api-flux3-image', 'bfl', 'generate', 0, r, null], ['api-nano-banana-pro', 'replicate', 'generate', 0, r, null]);
  cases.push(['api-flux3-image', 'bfl', 'edit', 3, '2K', null], ['api-flux2-max', 'fal', 'generate', 0, '1K', null], ['api-flux2-max', 'fal', 'generate', 0, '2K', null]);
  // fal image pass: every fal edit route, each priced resolution / tier, with 1 and 3 images (per-image surcharges), Ideogram 4.5 inpaint and Bria GenFill
  const FALC: [string, string, (string | null)[], (string | null)[]][] = [['api-seedream', 'bytedance/seedream/v5/pro/edit', ['1K', '2K'], [null]], ['api-seedream-flash', 'bytedance/seedream/v5/flash/edit', ['1K', '2K'], [null]],
    ['api-nano-banana-pro', 'fal-ai/nano-banana-pro/edit', ['1K', '2K', '4K'], [null]], ['api-ideogram-45', 'ideogram/v4.5/edit', [null], ['low', 'med', 'high']], ['api-luma-image', 'luma/agent/uni-1/v1/edit', [null], [null]],
    ['api-luma-uni1-max', 'luma/agent/uni-1/v1/max/edit', [null], [null]], ['api-grok-image', 'xai/grok-imagine-image/v2.0/edit', ['1K', '2K'], ['low', 'med']], ['api-kling-image', 'fal-ai/kling-image/o1', ['1K', '2K'], [null]]];
  const falRoute: Record<string, string> = {};
  for (const [pid, slug, rs, ts] of FALC) { falRoute[pid] = `fal:${slug}`; for (const r of rs) for (const t of ts) for (const k of [1, 3]) cases.push([pid, 'fal', 'edit', k, r, t]); }
  cases.push(['api-ideogram-45', 'fal', 'inpaint', 1, null, 'high']);
  let n = 0;
  for (const [provider, runOn, mode, nImg, res, tier] of cases) {
    const q: Record<string, string> = { provider, mode, ...(runOn ? { runOn } : {}), ...(res ? { imageResolution: res } : {}), ...(tier ? { quality: tier } : {}), aspect: mode === 'edit' ? 'auto' : '16:9', ...(nImg ? { image: '1', refs: String(nImg) } : {}) };
    if (mode === 'edit' && provider.startsWith('api-')) q.aspect = IMAGE_CAPS[provider].edit?.allowAuto ? 'auto' : '1:1';
    if (mode === 'inpaint') q.aspect = IMAGE_CAPS[provider].edit?.allowAuto || IMAGE_CAPS[provider].allowAuto ? 'auto' : '1:1';
    const quote = await get(`/api/tools/create-image/price?${new URLSearchParams(q)}`); assert.equal(quote.status, 200, `${provider} ${runOn} ${mode} quote: ${JSON.stringify(quote.body).slice(0, 400)}`);
    const credits = quote.body.credits ?? quote.body.listCredits; assert.ok(credits > 0, `${provider} ${runOn} ${mode} ${res}: priced (${credits})`);
    const s = await submit({ provider, rights: '1', prompt: 'a lighthouse at dusk', types: JSON.stringify([mode]), aspect: q.aspect, ...(runOn ? { runOn } : {}), ...(res ? { imageResolution: res } : {}), ...(tier ? { quality: tier } : {}) }, nImg);
    assert.equal(s.status, 200, `${provider} ${runOn} ${mode} submit: ${JSON.stringify(s.body).slice(0, 400)}`);
    assert.equal(s.body.cost, credits, `${provider} ${runOn ?? ''} ${mode} ${res ?? ''} ${tier ?? ''}: quote ${credits} = charge ${s.body.cost} (route ${quote.body.route} / ${s.body.route})`);
    if (runOn === 'bfl') assert.equal(quote.body.route, 'direct:bfl/flux-3-image'); if (runOn === 'fal') assert.equal(quote.body.route, falRoute[provider] ?? 'fal:fal-ai/flux-2-max'); if (runOn === 'replicate') assert.equal(quote.body.route, 'replicate:google/nano-banana-pro');
    if (runOn === 'comfy') assert.equal(quote.body.route, `comfy-router:${provider}`);
    await fetch(`${B}/api/jobs/${s.body.id}/cancel`, { method: 'POST' }).catch(() => null); n++;
  }
  { // Bria GenFill is a Brush Edit-only engine (app-inpaint extraProviders): quote = charge there, and Create Image itself does not offer it
    const quote = await get(`/api/tools/app-inpaint/price?${new URLSearchParams({ provider: 'fal-bria-genfill', runOn: 'fal', image: '1', refs: '1' })}`); assert.equal(quote.status, 200, JSON.stringify(quote.body).slice(0, 400));
    assert.equal(quote.body.route, 'fal:fal-ai/bria/genfill'); assert.equal(quote.body.credits ?? quote.body.listCredits, 4);
    const fd = new FormData(); for (const [k, v] of Object.entries({ provider: 'fal-bria-genfill', runOn: 'fal', rights: '1', prompt: 'a red door' })) fd.append(k, v);
    fd.append('image', new Blob([IMG], { type: 'image/png' }), 'image.png'); fd.append('mask', new Blob([IMG], { type: 'image/png' }), 'mask.png');
    const r = await fetch(`${B}/api/tools/app-inpaint/jobs`, { method: 'POST', body: fd }); const sb: any = await r.json(); assert.equal(r.status, 200, JSON.stringify(sb).slice(0, 400)); assert.equal(sb.cost, 4, 'GenFill quote 4 = charge');
    await fetch(`${B}/api/jobs/${sb.id}/cancel`, { method: 'POST' }).catch(() => null); n++;
    const t = await get('/api/tools'); const ci = (t.body.tools ?? t.body).find((x: any) => x.id === 'create-image'); assert.ok(!ci.providers.some((p: any) => (p.id ?? p) === 'fal-bria-genfill'), 'not a Create Image model'); }
  ok(`quote = charge on ${n} cases (every new model on Comfy Router: each priced resolution / tier, edit with images; FLUX 3 Image on BFL, FLUX.2 [max] on fal, Nano Banana Pro on Replicate; the fal pass edit / inpaint routes)`);
  console.log('ALL OK image-models-catalog');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* */ } }
