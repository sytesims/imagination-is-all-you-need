/**
 * fal image pass (2026-10-22): fal routes for image EDITS on models the app already has, plus Bria GenFill for Brush Edit.
 * Every endpoint, schema and price below was read on the fal model page, its OpenAPI schema (fal.ai/api/openapi/queue/openapi.json?endpoint_id=…)
 * and the page's billing block on 2026-10-22. Only routes whose price is published exactly and computable at quote time are here
 * (quote = charge); per-megapixel routes that also bill input images (FLUX.2 edit, Qwen edit, Krea 3 edit) and token-billed ones (GPT Image,
 * Nano Banana 2.1) are not. Images and masks go inline as data URIs (fal: "your own URL or a Base64 data URI").
 * Nothing here was run against a paid API: the request bodies are checked against the schemas in test/image-models-catalog.test.ts.
 *
 *  Model card            fal endpoint                               Price (published)
 *  Seedream 5.0 Pro      bytedance/seedream/v5/pro/edit             $0.0675 (≤1536², our 1K) / $0.135 (≤2048², our 2K) + $0.0045 per input image after the first
 *  Seedream 5.0 Flash    bytedance/seedream/v5/flash/edit           $0.027 per image
 *  Nano Banana Pro       fal-ai/nano-banana-pro/edit                $0.15 per image, 4K ×2 (web search off)
 *  Ideogram 4.5          ideogram/v4.5/edit (edit + mask inpaint)   $0.03 low / $0.06 medium / $0.22 high per image (size does not change it)
 *  Luma UNI-1            luma/agent/uni-1/v1/edit                   $0.042 + $0.003 per source or reference image
 *  Luma UNI-1 Max        luma/agent/uni-1/v1/max/edit               $0.102 + $0.003 per source or reference image
 *  Grok Imagine 2.0      xai/grok-imagine-image/v2.0/edit           $0.04 / $0.06 (1K low / medium), $0.06 / $0.08 (2K) + $0.01 per input image
 *  Kling Image O1        fal-ai/kling-image/o1                      $0.028 per image (1K and 2K)
 *  Bria GenFill (new)    fal-ai/bria/genfill                        $0.04 per generation
 */
import path from 'node:path';
import { readFile, rm } from 'node:fs/promises';
import { registerProvider } from '../providers.js';
import { HOSTED_BY_ID, type HostedPrice } from '../shared/hostedPrices.js';
import { EXTRA_ROUTES, COMING_SOON, FAL_ENV } from '../routing/routes.js';
import { imageRefs } from '../routing/routerModels.js';
import { GROK_EDIT_ASPECTS, KLING_IMAGE_ASPECTS } from '../shared/hostedAspects.js';
import type { RouteDef } from '../routing/types.js';
import { imageDataUri } from './imageUpscaleModels.js';
import { runFfmpeg } from '../ffmpeg.js';
import { DATA_DIR } from '../config.js';
import { handOff } from '../mediaHandoff.js';

const D = '2026-10-22' as const;
type In = Record<string, any>;
const page = (slug: string) => `https://fal.ai/models/${slug}`;

// ---------- small helpers (same rules as the Comfy Router bodies, routing/routerModels.ts) ----------
const promptOf = (i: In) => String(i.hostedPrompt ?? i.prompt ?? '');
const aspectOf = (i: In): string | null => (typeof i.aspect === 'string' && i.aspect && i.aspect !== 'auto' ? i.aspect : null);
const resOf = (i: In): '1K' | '2K' | '4K' => (['1K', '2K', '4K'].includes(i.imageResolution) ? i.imageResolution : '1K');
const tierOf = (i: In): 'low' | 'med' | 'high' => { const q = String(i.tier ?? i.quality ?? 'med'); return /^(high|hd)$/i.test(q) ? 'high' : /^low$/i.test(q) ? 'low' : 'med'; };
const seedOf = (i: In) => (Number.isInteger(i.seed) ? { seed: Math.abs(i.seed) % 2147483648 } : {});
const uris = (ps: string[]) => Promise.all(ps.map(imageDataUri));
const refCount = (max: number) => (i: In) => Math.min(max, imageRefs(i).length);
const tooMany = (max: number) => (i: In) => { const n = imageRefs(i).length; return n > max ? `This route takes up to ${max} image${max > 1 ? 's' : ''}; you added ${n}` : null; };
/** {width,height} for an aspect at a target area, sides multiples of 16 (round 'up' = area ≥ target, 'down' = area ≤ target). */
export function areaSize(aspect: string | null, area: number, round: 'up' | 'down') {
  const [a, b] = /^(\d+):(\d+)$/.test(aspect ?? '') ? aspect!.split(':').map(Number) : [1, 1]; const r = a / b;
  const f = round === 'up' ? Math.ceil : Math.floor; return { width: f(Math.sqrt(area * r) / 16) * 16, height: f(Math.sqrt(area / r) / 16) * 16 };
}
/** Seedream 5.0 edit sizes: fal bills ≤1536×1536 px at the low rate and up to 2048×2048 at the high rate (area between 1024² and 2048²).
 *  Our 1K = at least 1024² (the schema minimum), our 2K = at most 2048², so each tier lands in the price band we quote. */
export const seedreamEditSize = (i: In) => (resOf(i) === '2K' ? areaSize(aspectOf(i), 2048 * 2048, 'down') : areaSize(aspectOf(i), 1024 * 1024, 'up'));
const pick = (v: string | null, ok: readonly string[]) => (v && ok.includes(v) ? v : 'auto');
/** A shape picked for this run (not Auto, not Match photo on an edit). */
const pickedShape = (i: In): string | null => (i.aspectAuto === true ? null : aspectOf(i));
/** Routes that always keep the photo's shape (Luma and Ideogram 4.5 edits on fal): a picked shape runs on Comfy Router instead (route caps aspects [] = Match photo only). */
const keepsPhoto = (name: string) => (i: In) => (pickedShape(i) && String(i.mode ?? modeOfTypes(i)) !== 'inpaint' ? `${name} on fal keeps your photo's shape; pick Match photo, or run on Comfy Router for ${pickedShape(i)}` : null);
/** Routes with fewer shapes than the model (Grok edits): a shape off this route's list is refused here, so nothing is sent snapped. */
const shapesOnly = (list: readonly string[], name: string) => (i: In) => { const a = pickedShape(i); return a && !list.includes(a) ? `${name} on fal takes ${list.join(', ')} or Match photo` : null; };
/** Ideogram's mask is black = edit, white = keep; ours (Brush Edit) is white = repaint. Invert with ffmpeg into a temp file. */
async function invertedMaskUri(jobId: string, maskPath: string) {
  const out = path.join(DATA_DIR, `${jobId}-mask-inverted.png`);
  const code = await runFfmpeg(['-y', '-v', 'error', '-i', maskPath, '-vf', 'format=gray,negate', out]); if (code !== 0) throw new Error('Could not prepare the mask');
  try { return await handOff(out, 'image', 'fal', { mime: 'image/png' }); } finally { await rm(out, { force: true }); }
}

// ---------- request bodies (exported for the schema test) ----------
export const FAL_EDIT_BODIES = {
  /** bytedance/seedream/v5/{pro,flash}/edit: prompt + image_urls (≤10) required; image_size {width,height} (area 1024²–2048²). */
  seedream: async (i: In) => ({ prompt: promptOf(i), image_urls: await uris(imageRefs(i).slice(0, 10)), image_size: seedreamEditSize(i), num_images: 1, output_format: 'png' }),
  /** fal-ai/nano-banana-pro/edit: resolution 1K/2K/4K, aspect_ratio (auto follows the photo), web search off (it costs extra). */
  nanoBananaPro: async (i: In) => ({ prompt: promptOf(i), image_urls: await uris(imageRefs(i).slice(0, 14)), resolution: resOf(i), num_images: 1, output_format: 'png', enable_web_search: false,
    aspect_ratio: pick(i.aspectAuto === true ? null /* Match photo */ : aspectOf(i), ['21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16']), ...seedOf(i) }),
  /** ideogram/v4.5/edit: image_url (the photo) + up to 4 reference_image_urls; inpaint = mask_url (black = edit), image_size stays auto with a mask. */
  ideogram45: async (i: In, jobId: string) => { const refs = imageRefs(i); const quality = ({ low: 'low', med: 'medium', high: 'high' } as const)[tierOf(i)];
    if (String(i.mode ?? '') === 'inpaint' || modeOfTypes(i) === 'inpaint') return { prompt: promptOf(i), image_url: await imageDataUri(i.imagePath ?? refs[0]), mask_url: await invertedMaskUri(jobId, i.maskPath), quality, num_images: 1, ...seedOf(i) };
    return { prompt: promptOf(i), image_url: await imageDataUri(refs[0]), ...(refs.length > 1 ? { reference_image_urls: await uris(refs.slice(1, 5)) } : {}), image_size: 'auto', quality, num_images: 1, ...seedOf(i) }; },
  /** luma/agent/uni-1/v1/edit and /max/edit: image_url (the photo) + up to 8 reference_image_urls. */
  luma: async (i: In) => { const refs = imageRefs(i); return { prompt: promptOf(i), image_url: await imageDataUri(refs[0]), ...(refs.length > 1 ? { reference_image_urls: await uris(refs.slice(1, 9)) } : {}), output_format: 'png' }; },
  /** xai/grok-imagine-image/v2.0/edit: image_urls (≤5), resolution 1k/2k, quality low/medium, aspect_ratio (auto follows the photo). */
  grok: async (i: In) => ({ prompt: promptOf(i), image_urls: await uris(imageRefs(i).slice(0, 5)), num_images: 1, resolution: resOf(i) === '2K' ? '2k' : '1k', quality: tierOf(i) === 'low' ? 'low' : 'medium',
    aspect_ratio: pick(pickedShape(i), GROK_EDIT_ASPECTS), output_format: 'png' }),
  /** fal-ai/kling-image/o1: image_urls (≤10), resolution 1K/2K, aspect_ratio. */
  klingO1: async (i: In) => ({ prompt: promptOf(i), image_urls: await uris(imageRefs(i).slice(0, 10)), resolution: resOf(i) === '2K' ? '2K' : '1K', num_images: 1, output_format: 'png',
    aspect_ratio: pick(pickedShape(i), KLING_IMAGE_ASPECTS) }),
  /** fal-ai/bria/genfill: image_url + mask_url (white = the area to fill, same as ours) + prompt. */
  genfill: async (i: In) => ({ prompt: promptOf(i), image_url: await imageDataUri(i.imagePath ?? imageRefs(i)[0]), mask_url: await imageDataUri(i.maskPath), num_images: 1, ...seedOf(i) }),
};
function modeOfTypes(i: In) { let t: any = i.types; if (typeof t === 'string') { try { t = JSON.parse(t); } catch { t = t.split(','); } } return Array.isArray(t) && t.length ? String(t[0]) : ''; }

// ---------- prices (1 credit = $0.01) ----------
const price = (slug: string, model: string, o: Partial<HostedPrice> & { usd: number; note: string }): HostedPrice =>
  ({ providerId: `fal:${slug}`, model, unit: 'image', sourceUrl: page(slug), checkedAt: D, estimated: false, ...o } as HostedPrice);
export const FAL_EDIT_PRICES: HostedPrice[] = [
  price('bytedance/seedream/v5/pro/edit', 'Seedream 5.0 Pro edit (fal)', { usd: 0.0675, usdByResolution: { '1K': 0.0675, '2K': 0.135 },
    refImages: { usd: 0.0045, free: 1, sourceUrl: page('bytedance/seedream/v5/pro/edit'), checkedAt: '2026-10-22', estimated: false, note: '"The first input image is not charged, and every additional input image will cost $0.0045."' },
    note: '"$0.0675 + $(0.0045 × additional input images) per output image ≤ 1536×1536; $0.135 + … between 1536×1536 and 2048×2048." Our body sends 1K at ≥1024² (≤1536²) and 2K at ≤2048² (>1536²).' }),
  price('bytedance/seedream/v5/flash/edit', 'Seedream 5.0 Flash edit (fal)', { usd: 0.027, usdByResolution: { '1K': 0.027, '2K': 0.027 }, note: '"Price: $0.027 per images" (model page, billing unit images).' }),
  price('fal-ai/nano-banana-pro/edit', 'Nano Banana Pro edit (fal)', { usd: 0.15, usdByResolution: { '1K': 0.15, '2K': 0.15, '4K': 0.3 },
    note: '"$0.15 per image … 4K outputs will be charged at double the standard rate. If web search is used, an additional $0.015" (we send enable_web_search false).' }),
  price('ideogram/v4.5/edit', 'Ideogram 4.5 edit (fal)', { usd: 0.06, usdByTier: { low: 0.03, med: 0.06, high: 0.22 }, note: '"$0.008 Very Low, $0.03 Low, $0.06 Medium, $0.22 High quality. The image size does not change the price." Our low / med / high = Low / Medium / High.' }),
  price('luma/agent/uni-1/v1/edit', 'Luma UNI-1 edit (fal)', { usd: 0.042,
    refImages: { usd: 0.003, free: 0, sourceUrl: page('luma/agent/uni-1/v1/edit'), checkedAt: '2026-10-22', estimated: false, note: '"plus $0.003 per reference or source image" (the photo counts).' },
    note: '"Each edit costs $0.042, plus $0.003 per reference or source image. An edit using 1 source image costs $0.045."' }),
  price('luma/agent/uni-1/v1/max/edit', 'Luma UNI-1 Max edit (fal)', { usd: 0.102,
    refImages: { usd: 0.003, free: 0, sourceUrl: page('luma/agent/uni-1/v1/max/edit'), checkedAt: '2026-10-22', estimated: false, note: '"plus $0.003 per reference or source image" (the photo counts).' },
    note: '"Each edit costs $0.102, plus $0.003 per reference or source image. An edit using 1 source image costs $0.105."' }),
  price('xai/grok-imagine-image/v2.0/edit', 'Grok Imagine Image 2.0 edit (fal)', { usd: 0.06, usdByTierRes: { 'low:1K': 0.04, 'med:1K': 0.06, 'low:2K': 0.06, 'med:2K': 0.08 },
    refImages: { usd: 0.01, free: 0, sourceUrl: page('xai/grok-imagine-image/v2.0/edit'), checkedAt: '2026-10-22', estimated: false, note: '"plus $0.01 per input image".' },
    note: '"$0.04 (low) or $0.06 (medium) per image for 1K, and $0.06 (low) or $0.08 (medium) per image for 2K, plus $0.01 per input image."' }),
  price('fal-ai/kling-image/o1', 'Kling Image O1 (fal)', { usd: 0.028, usdByResolution: { '1K': 0.028, '2K': 0.028 }, note: '"Price: $0.028 per images" (model page, billing unit images; same rate for 1K and 2K, as on Comfy Router).' }),
  { providerId: 'fal:fal-ai/bria/genfill', model: 'Bria GenFill (fal)', unit: 'image', usd: 0.04, sourceUrl: page('fal-ai/bria/genfill'), checkedAt: '2026-10-22', estimated: false, note: '"Your request will cost $0.04 per image."' },
];
for (const p of FAL_EDIT_PRICES) if (!HOSTED_BY_ID[p.providerId]) HOSTED_BY_ID[p.providerId] = p;

// ---------- routes ----------
const route = (modelId: string, slug: string, label: string, sec: number, o: { modes: string[]; maxRefs: number; body: (i: In, jobId: string) => Promise<Record<string, unknown>>; caps?: Record<string, unknown>;
  refsPriced?: (i: In) => number; unavailableFor?: (i: In) => string | null }): RouteDef => ({
  routeId: `fal:${slug}`, kind: 'fal', modelId, endpoint: slug, priceRef: `fal:${slug}`, sourceUrl: `${page(slug)}/api`, checkedAt: D, typicalLatencySec: sec, latencyEstimated: true,
  latencySource: 'estimated: fal publishes no per-model latency', envKey: FAL_ENV, envAliases: ['FAL_KEY'], label: `${label} via fal`, output: 'image', eachImage: true, modes: o.modes,
  request: (job) => o.body(job.input, job.id), caps: { maxRefs: o.maxRefs, ...(o.caps ?? {}) }, ...(o.refsPriced ? { refsPriced: o.refsPriced } : {}),
  unavailableFor: (i) => tooMany(o.maxRefs)(i) ?? o.unavailableFor?.(i) ?? null });
const add = (modelId: string, r: RouteDef) => { (EXTRA_ROUTES[modelId] ??= []).push(r); };
export const FAL_EDIT_ROUTES: RouteDef[] = [
  route('api-seedream', 'bytedance/seedream/v5/pro/edit', 'Seedream 5.0 Pro edit', 20, { modes: ['edit'], maxRefs: 10, body: FAL_EDIT_BODIES.seedream, refsPriced: refCount(10), caps: { resolutions: ['1K', '2K'] },
    unavailableFor: (i) => (resOf(i) === '4K' ? 'Seedream edits on fal go up to 2K' : null) }),
  route('api-seedream-flash', 'bytedance/seedream/v5/flash/edit', 'Seedream 5.0 Flash edit', 10, { modes: ['edit'], maxRefs: 10, body: FAL_EDIT_BODIES.seedream, caps: { resolutions: ['1K', '2K'] },
    unavailableFor: (i) => (resOf(i) === '4K' ? 'Seedream edits on fal go up to 2K' : null) }),
  route('api-nano-banana-pro', 'fal-ai/nano-banana-pro/edit', 'Nano Banana Pro edit', 30, { modes: ['edit'], maxRefs: 14, body: FAL_EDIT_BODIES.nanoBananaPro, caps: { resolutions: ['1K', '2K', '4K'] } }),
  route('api-ideogram-45', 'ideogram/v4.5/edit', 'Ideogram 4.5 edit', 20, { modes: ['edit', 'inpaint'], maxRefs: 5, body: FAL_EDIT_BODIES.ideogram45, caps: { mask: true, aspects: [], allowAuto: true, aspectModes: ['edit'] }, unavailableFor: keepsPhoto('Ideogram 4.5') }), // inpaint: the job parser already requires the mask
  route('api-luma-image', 'luma/agent/uni-1/v1/edit', 'Luma UNI-1 edit', 30, { modes: ['edit'], maxRefs: 9, body: FAL_EDIT_BODIES.luma, refsPriced: refCount(9), caps: { aspects: [], allowAuto: true, aspectModes: ['edit'] }, unavailableFor: keepsPhoto('Luma UNI-1') }),
  route('api-luma-uni1-max', 'luma/agent/uni-1/v1/max/edit', 'Luma UNI-1 Max edit', 40, { modes: ['edit'], maxRefs: 9, body: FAL_EDIT_BODIES.luma, refsPriced: refCount(9), caps: { aspects: [], allowAuto: true, aspectModes: ['edit'] }, unavailableFor: keepsPhoto('Luma UNI-1 Max') }),
  route('api-grok-image', 'xai/grok-imagine-image/v2.0/edit', 'Grok Imagine Image 2.0 edit', 15, { modes: ['edit'], maxRefs: 5, body: FAL_EDIT_BODIES.grok, refsPriced: refCount(5), caps: { resolutions: ['1K', '2K'], aspects: [...GROK_EDIT_ASPECTS], allowAuto: true, aspectModes: ['edit'] },
    unavailableFor: (i) => (resOf(i) === '4K' ? 'Grok Imagine edits go up to 2K' : shapesOnly(GROK_EDIT_ASPECTS, 'Grok Imagine edit')(i)) }),
  route('api-kling-image', 'fal-ai/kling-image/o1', 'Kling Image O1 edit', 20, { modes: ['edit'], maxRefs: 10, body: FAL_EDIT_BODIES.klingO1, caps: { resolutions: ['1K', '2K'], aspects: [...KLING_IMAGE_ASPECTS], allowAuto: true, aspectModes: ['edit'] },
    unavailableFor: (i) => (resOf(i) === '4K' ? 'Kling Image O1 on fal goes up to 2K' : shapesOnly(KLING_IMAGE_ASPECTS, 'Kling Image O1')(i)) }),
];
for (const r of FAL_EDIT_ROUTES) add(r.modelId, r);

// ---------- Bria GenFill (Brush Edit): a fal-only model card ----------
registerProvider({ id: 'fal-bria-genfill', name: 'Bria GenFill', kind: 'hosted-direct', apiKeyEnv: FAL_ENV, via: `fal fal-ai/bria/genfill (key in ${FAL_ENV}; sample output without a key)`, docUrl: page('fal-ai/bria/genfill') } as any);
COMING_SOON['fal-bria-genfill'] = 'Runs on fal';
export const GENFILL_ROUTE = route('fal-bria-genfill', 'fal-ai/bria/genfill', 'Bria GenFill', 15, { modes: ['inpaint'], maxRefs: 1, body: FAL_EDIT_BODIES.genfill, caps: { mask: true } }); // the job parser requires the mask (quotes carry none)
add('fal-bria-genfill', GENFILL_ROUTE);
