/**
 * Sunra and kie.ai places (2026-11-06): extra routes on models we already offer, with their request bodies and price rows. Their place plugins
 * (plugins-builtin/place-sunra.ts, place-kie.ts) send them; until the place's key is set these routes are hidden (services/places.ts
 * KEY_GATED_KINDS), and kie.ai's are off unless place-kie is in the profile (INSTALLABLE_KINDS).
 *
 * Sunra (bodies from its per-model OpenAPI at https://api.sunra.ai/v1/queue, prices from its public pricing API, both read 2026-11-03):
 *   Seedance 2.5 / 2.0 Fast   bytedance/seedance-2.5|2.0-fast   text-to-video {prompt, resolution, ratio, duration, generate_audio};
 *                             image-to-video {prompt, start_image, end_image?, resolution, duration, generate_audio}. Billed per video token.
 *   MiniMax H3                minimax/minimax-h3                text-to-video {prompt, aspect_ratio, duration 4–15, resolution 480P|768P|2K};
 *                             image-to-video {prompt, start_image, end_image?, duration, resolution}. 480P $0.038/s, 768P $0.08/s.
 *   Nano Banana 2             google/gemini-3.1-flash-image     text-to-image / image-editing {prompt, images?, aspect_ratio, resolution, output_format}.
 *   GPT Image 2.5 Flare       openai/gpt-image-2.5-flare        text-to-image / image-editing {prompt, images?, width, height, quality, n, output_format}.
 *   Kling 4.0 is on Sunra too, but we don't offer Kling 4.0 yet, so it has no route here.
 * kie.ai (reseller; https://docs.kie.ai, prices from https://kie.ai/pricing model pages, read 2026-11-06):
 *   Seedance 2.5              bytedance/seedance-2-5            {prompt, first_frame_url?, last_frame_url?, resolution, aspect_ratio, duration 4–30, generate_audio}
 *   Nano Banana 2             nano-banana-2                     {prompt, image_input?, aspect_ratio, resolution 1K|2K|4K, output_format}
 * Files go up through each place's own upload (Sunra pre-signed, kie multipart), so a body only carries links.
 */
import type { RouteDef } from './types.js';
import type { HostedPrice } from '../shared/hostedPrices.js';
import { HOSTED_BY_ID } from '../shared/hostedPrices.js';
import { places, type MediaKind } from '../services/places.js';
import { imageRefs, gptSizeOf } from './routerModels.js';
import { gptImageTokens, GPT_QUOTE, promptBucket } from '../shared/hostedPrices.js';
import { GPT_IMAGE_ASPECTS, gptImageSize, gptWH } from '../shared/gptImageSizes.js';
import { GEMINI_ASPECTS_14 } from '../shared/imageCaps.js';
import { SUNRA_ENDPOINT } from '../providers/sunra.js';
import { KIE_LABEL } from '../shared/modelIds.js';

export const SUNRA_ENV = 'OPENHIGGSFIELD_SUNRA_KEY';
export const KIE_ENV = 'OPENHIGGSFIELD_KIE_KEY';
const SUNRA_CHECKED = '2026-11-03' as const; const KIE_CHECKED = '2026-11-06' as const;
const LAT = 'estimated: no published latency; recorded per run';
type Job = { id: string; input: Record<string, any> };
type In = Record<string, any>;

// ---- job helpers ----
const promptOf = (i: In) => String(i.hostedPrompt ?? i.finalPrompt ?? i.prompt ?? '');
const imageMode = (i: In) => String((Array.isArray(i.types) ? i.types[0] : typeof i.types === 'string' ? i.types.replace(/[[\]"\s]/g, '').split(',')[0] : null) ?? i.mode ?? 'generate');
const videoMode = (i: In) => String(i.mode ?? (i.imagePath ? 'i2v' : 't2v'));
const clampSec = (d: unknown, lo: number, hi: number, dflt = 5) => Math.min(hi, Math.max(lo, Math.round(Number(d) || dflt)));
const aspectOf = (i: In) => (typeof i.aspect === 'string' && i.aspect && i.aspect !== 'auto' ? i.aspect : null);
const resOf = (i: In) => (['1K', '2K', '4K'].includes(i.imageResolution) ? i.imageResolution : '1K') as '1K' | '2K' | '4K';
const omit = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));
/** Put a job file where the place reads it (its plugin's upload: Sunra pre-signed, kie multipart). */
const upload = (kind: 'sunra' | 'kie') => async (file: string, m: MediaKind) => { const p = places.get(kind); if (!p?.upload) throw new Error(`${kind === 'sunra' ? 'Sunra' : KIE_LABEL} isn’t set up in this app`); return p.upload(file, m); };
const videoIssue = (name: string) => (i: In): string | null => {
  const m = videoMode(i);
  if (!['t2v', 'i2v', 'flf'].includes(m)) return `${name} here does text to video, a first frame, or first and last frames`;
  if ((i.refVideoPaths ?? []).length || (i.refAudioPaths ?? []).length) return `${name} here takes no reference clips; they run on Comfy Cloud`;
  if ((m === 'i2v' || m === 'flf') && !i.imagePath) return `${name} needs the first frame for this job`;
  return null;
};
const refsIssue = (max: number) => (i: In): string | null => { const n = imageRefs(i).length; return n > max ? `This route takes up to ${max} images; you added ${n}` : null; };
const either = (...fs: ((i: In) => string | null)[]) => (i: In) => fs.reduce<string | null>((r, f) => r ?? f(i), null);

// ---- Sunra ----
const sunra = (modelId: string, model: string, label: string, sec: number, o: Partial<RouteDef>): RouteDef => ({
  routeId: `sunra:${model}`, kind: 'sunra', modelId, endpoint: model, priceRef: `sunra:${model}`, sourceUrl: `https://sunra.ai/models/${model}`, checkedAt: SUNRA_CHECKED,
  typicalLatencySec: sec, latencyEstimated: true, latencySource: LAT, envKey: SUNRA_ENV, label: `${label} via Sunra`, ...o });
const sUp = upload('sunra');
/** Seedance 2.5 / 2.0 Fast on Sunra: text or first (+ last) frame; resolution as picked (within the model's list), sound on unless turned off. */
const seedanceSunra = (name: string, resolutions: string[], maxSec: number) => async (job: Job) => { const i = job.input; const m = videoMode(i);
  const base = { prompt: promptOf(i), resolution: resolutions.includes(i.resolution) ? i.resolution : '720p', duration: clampSec(i.duration, 4, maxSec), generate_audio: i.audio !== false };
  if (m === 't2v') return { [SUNRA_ENDPOINT]: 'text-to-video', ...base, ratio: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'].includes(i.aspect) ? i.aspect : 'adaptive' };
  if (!i.imagePath) throw new Error(`${name} needs the first frame for this job`);
  return { [SUNRA_ENDPOINT]: 'image-to-video', ...base, start_image: await sUp(i.imagePath, 'image'), ...(m === 'flf' && i.lastFramePath ? { end_image: await sUp(i.lastFramePath, 'image') } : {}) }; };
/** MiniMax H3 on Sunra: our 480p → 480P, else 768P (the size its price row quotes; 2K is not offered here). */
const h3Sunra = async (job: Job) => { const i = job.input; const m = videoMode(i); const resolution = i.resolution === '480p' ? '480P' : '768P'; const duration = clampSec(i.duration, 4, 15);
  if (m === 't2v') return { [SUNRA_ENDPOINT]: 'text-to-video', prompt: promptOf(i), aspect_ratio: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'].includes(i.aspect) ? i.aspect : '16:9', duration, resolution };
  if (!i.imagePath) throw new Error('MiniMax H3 needs the first frame for this job');
  return { [SUNRA_ENDPOINT]: 'image-to-video', prompt: promptOf(i), start_image: await sUp(i.imagePath, 'image'), ...(m === 'flf' && i.lastFramePath ? { end_image: await sUp(i.lastFramePath, 'image') } : {}), duration, resolution }; };
const nbSunra = async (job: Job) => { const i = job.input; const refs = imageRefs(i);
  return omit({ [SUNRA_ENDPOINT]: refs.length ? 'image-editing' : 'text-to-image', prompt: promptOf(i), images: refs.length ? await Promise.all(refs.slice(0, 10).map((p) => sUp(p, 'image'))) : undefined,
    aspect_ratio: aspectOf(i) ?? undefined /* left out: Sunra's default */, resolution: resOf(i), output_format: 'png' }); };
const gptQuality = (i: In) => { const q = String(i.tier ?? i.quality ?? 'med'); return /^(high|hd)$/i.test(q) ? 'high' : /^low$/i.test(q) ? 'low' : 'medium'; };
const gptSunra = async (job: Job) => { const i = job.input; const refs = imageRefs(i); const size = gptSizeOf(i); if (!size) throw new Error(`Aspect ${aspectOf(i)} isn't supported by this model`); const { width, height } = gptWH(size);
  return omit({ [SUNRA_ENDPOINT]: refs.length ? 'image-editing' : 'text-to-image', prompt: promptOf(i), images: refs.length ? await Promise.all(refs.slice(0, 10).map((p) => sUp(p, 'image'))) : undefined,
    width, height, quality: gptQuality(i), n: 1, output_format: 'png' }); };
const H3_CAPS = { audio: true, audioBadge: 'Audio on', modes: ['t2v', 'i2v', 'flf'], quality: ['quality'], firstLastFrame: true, durations: [6, 10, 15], resolutions: ['768p', '480p'], maxSeconds: 15, fps: 24 };
const seedanceCaps = (resolutions: string[], maxSec: number) => ({ videoCaps: { durations: Array.from({ length: maxSec - 3 }, (_, k) => k + 4), minSeconds: 4, maxSeconds: maxSec, aspects: ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], resolutions,
  audio: { supported: true, toggle: true, default: true, passthrough: false }, refKinds: ['image'], refMax: {}, sourceUrl: 'https://api.sunra.ai/v1/queue', checkedAt: SUNRA_CHECKED, verified: false, note: 'Text, first frame, or first and last frames' } });
const imgRoute = (r: RouteDef, maxRefs: number, extraIssue?: (i: In) => string | null): RouteDef => ({ ...r, modes: undefined, output: 'image', eachImage: true, caps: { ...(r.caps ?? {}), maxRefs },
  unavailableFor: either((i) => (imageMode(i) === 'inpaint' ? 'Brush edits with a mask run on Comfy Cloud' : null), refsIssue(maxRefs), ...(extraIssue ? [extraIssue] : [])) });

export const SUNRA_ROUTES: Record<string, RouteDef[]> = {
  'router-seedance-25': [sunra('router-seedance-25', 'bytedance/seedance-2.5', 'Seedance 2.5', 120, { output: 'video', modes: ['t2v', 'i2v', 'flf'], tools: ['h3-video'],
    request: seedanceSunra('Seedance 2.5', ['480p', '720p', '1080p'], 30), unavailableFor: videoIssue('Seedance 2.5'), caps: seedanceCaps(['720p', '480p', '1080p'], 30) })],
  'router-seedance-20-fast': [sunra('router-seedance-20-fast', 'bytedance/seedance-2.0-fast', 'Seedance 2.0 Fast', 90, { output: 'video', modes: ['t2v', 'i2v', 'flf'], tools: ['h3-video'],
    request: seedanceSunra('Seedance 2.0 Fast', ['480p', '720p'], 15), unavailableFor: videoIssue('Seedance 2.0 Fast'), caps: seedanceCaps(['720p', '480p'], 15) })],
  'comfy-h3': [sunra('comfy-h3', 'minimax/minimax-h3', 'MiniMax H3', 120, { output: 'video', modes: ['t2v', 'i2v', 'flf'], tools: ['h3-video'], request: h3Sunra,
    unavailableFor: either(videoIssue('MiniMax H3'), (i) => (i.resolution && !['480p', '768p', '720p'].includes(String(i.resolution)) ? 'MiniMax H3 on Sunra makes 480p or 768p' : null)), caps: H3_CAPS })],
  'api-nano-banana': [imgRoute(sunra('api-nano-banana', 'google/gemini-3.1-flash-image', 'Nano Banana 2', 15, { request: nbSunra, caps: { resolutions: ['1K', '2K', '4K'], aspects: [...GEMINI_ASPECTS_14] } }), 10,
    (i) => { const a = aspectOf(i); return a && !(GEMINI_ASPECTS_14 as readonly string[]).includes(a) ? `Aspect ${a} isn't supported by this model` : null; })],
  'api-gpt-image-25-flare': [imgRoute(sunra('api-gpt-image-25-flare', 'openai/gpt-image-2.5-flare', 'GPT Image 2.5 Flare', 30, { request: gptSunra, caps: { resolutions: ['1K', '2K', '4K'], aspects: [...GPT_IMAGE_ASPECTS] } }), 10,
    (i) => (gptSizeOf(i) ? null : `Aspect ${aspectOf(i)} isn't supported by this model`))],
};

// ---- kie.ai (installable) ----
const kie = (modelId: string, model: string, label: string, sec: number, o: Partial<RouteDef>): RouteDef => ({
  routeId: `kie:${model}`, kind: 'kie', modelId, endpoint: model, priceRef: `kie:${model}`, sourceUrl: 'https://docs.kie.ai/', checkedAt: KIE_CHECKED,
  typicalLatencySec: sec, latencyEstimated: true, latencySource: LAT, envKey: KIE_ENV, label: `${label} via ${KIE_LABEL}`, ...o });
const kUp = upload('kie');
const seedanceKie = async (job: Job) => { const i = job.input; const m = videoMode(i);
  return omit({ prompt: promptOf(i), ...(m !== 't2v' ? { first_frame_url: i.imagePath ? await kUp(i.imagePath, 'image') : undefined } : {}), ...(m === 'flf' && i.lastFramePath ? { last_frame_url: await kUp(i.lastFramePath, 'image') } : {}),
    resolution: ['480p', '720p', '1080p'].includes(i.resolution) ? i.resolution : '720p', aspect_ratio: m === 't2v' && ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'].includes(i.aspect) ? i.aspect : 'adaptive',
    duration: clampSec(i.duration, 4, 30), generate_audio: i.audio !== false, output_format: 'mp4' }); };
const nbKie = async (job: Job) => { const i = job.input; const refs = imageRefs(i);
  return omit({ prompt: promptOf(i), image_input: refs.length ? await Promise.all(refs.slice(0, 10).map((p) => kUp(p, 'image'))) : undefined, aspect_ratio: aspectOf(i) ?? 'auto', resolution: resOf(i), output_format: 'png' }); };
export const KIE_ROUTES: Record<string, RouteDef[]> = {
  'router-seedance-25': [kie('router-seedance-25', 'bytedance/seedance-2-5', 'Seedance 2.5', 150, { sourceUrl: 'https://docs.kie.ai/market/bytedance/seedance-2-5', output: 'video', modes: ['t2v', 'i2v', 'flf'], tools: ['h3-video'],
    request: seedanceKie, unavailableFor: videoIssue('Seedance 2.5'), caps: { ...seedanceCaps(['720p', '480p', '1080p'], 30), reseller: true } })],
  'api-nano-banana': [imgRoute(kie('api-nano-banana', 'nano-banana-2', 'Nano Banana 2', 20, { sourceUrl: 'https://docs.kie.ai/market/google/nanobanana2', request: nbKie, caps: { resolutions: ['1K', '2K', '4K'], reseller: true } }), 10,
    (i) => { const a = aspectOf(i); return a && !['1:1', '2:3', '3:2', '1:4', '4:1', '3:4', '4:3', '4:5', '5:4', '1:8', '8:1', '9:16', '16:9', '21:9'].includes(a) ? `Aspect ${a} isn't supported by this model` : null; })],
};

// ---- prices (HostedPrice rows, keyed by route id: shared/pricing.ts priceOf prices them like every other route; checkedAt + source on each) ----
/** Seedance video tokens per output second at our sizes (the Comfy Router rows' own figures, W×H×24/1024 at the largest frame per resolution). */
const SEEDANCE_TOK_PER_SEC = { '480p': 10044, '720p': 21736.125, '1080p': 48911.16 };
const perTok = (tok: number, usdPerM: number) => Math.ceil((tok * usdPerM / 1e6) * 1e5) / 1e5;
const sunraPrice = (model: string, ep: string) => `https://api.sunra.ai/v1/pricing/model/${model}/endpoint/${ep}`;
/** GPT Image 2.5 on Sunra: OpenAI's token rates ($30 / 1M image output, $5 / 1M text in, $8 / 1M image in), the costliest shape at the size, a
 *  500-byte prompt, × 1.2 headroom (as the Comfy Router quote). The settled charge is recorded after each run (status billing.amount). */
const GPT_SUNRA = { imageOut: 30, textIn: 5, imageIn: 8 };
const gptSunraUsd = (tier: 'low' | 'med' | 'high', res: '1K' | '2K' | '4K') => { const q = tier === 'med' ? 'medium' : tier;
  const out = Math.max(...GPT_IMAGE_ASPECTS.map((a) => { const s = gptImageSize(a, res); if (!s) return 0; const { width, height } = gptWH(s); return gptImageTokens('gpt-image-2.5', q, width, height); })) + GPT_QUOTE.outTokenPad;
  const text = GPT_QUOTE.promptOverheadTokens + Math.ceil(promptBucket(null) / GPT_QUOTE.bytesPerToken);
  return Math.ceil(((out * GPT_SUNRA.imageOut + text * GPT_SUNRA.textIn) / 1e6) * GPT_QUOTE.margin * 1e5) / 1e5; };
const gptTierRes = Object.fromEntries((['low', 'med', 'high'] as const).flatMap((t) => (['1K', '2K', '4K'] as const).map((r) => [`${t}:${r}`, gptSunraUsd(t, r)])));
export const AGGREGATOR_PRICES: HostedPrice[] = [
  { providerId: 'sunra:bytedance/seedance-2.5', model: 'Seedance 2.5 (Sunra), no video input', unit: 'second', usd: perTok(SEEDANCE_TOK_PER_SEC['720p'], 10.7),
    usdByQuality: { '480p': perTok(SEEDANCE_TOK_PER_SEC['480p'], 10.7), '720p': perTok(SEEDANCE_TOK_PER_SEC['720p'], 10.7), '1080p': perTok(SEEDANCE_TOK_PER_SEC['1080p'], 11.7) },
    sourceUrl: sunraPrice('bytedance/seedance-2.5', 'text-to-video'), checkedAt: SUNRA_CHECKED, estimated: true,
    note: 'Sunra: $10.70 / 1M video tokens (480p, 720p), $11.70 (1080p), no video input; tokens per second as on the Comfy Router row (W×H×24/1024 at the largest frame). Sound on or off costs the same. Sunra adds 5% to each API top-up (not included).' },
  { providerId: 'sunra:bytedance/seedance-2.0-fast', model: 'Seedance 2.0 Fast (Sunra), no video input', unit: 'second', usd: perTok(SEEDANCE_TOK_PER_SEC['720p'], 5.29),
    usdByQuality: { '480p': perTok(SEEDANCE_TOK_PER_SEC['480p'], 5.29), '720p': perTok(SEEDANCE_TOK_PER_SEC['720p'], 5.29) },
    sourceUrl: sunraPrice('bytedance/seedance-2.0-fast', 'text-to-video'), checkedAt: SUNRA_CHECKED, estimated: true,
    note: 'Sunra: $5.29 / 1M video tokens without video input; tokens per second as on the Comfy Router row. No 1080p. Sunra adds 5% to each API top-up (not included).' },
  { providerId: 'sunra:minimax/minimax-h3', model: 'MiniMax H3 (Sunra)', unit: 'second', usd: 0.08, usdByQuality: { '480p': 0.038, '720p': 0.08, '768p': 0.08 },
    sourceUrl: sunraPrice('minimax/minimax-h3', 'text-to-video'), checkedAt: SUNRA_CHECKED, estimated: false,
    note: '"480P $0.038/s · 768P $0.08/s · 2K $0.13/s, 4-15s duration" (text and image to video). Our 720p runs at 768P. Sunra adds 5% to each API top-up (not included).' },
  { providerId: 'sunra:google/gemini-3.1-flash-image', model: 'Nano Banana 2 (Sunra)', unit: 'image', usd: 0.067, usdByResolution: { '1K': 0.067, '2K': 0.101, '4K': 0.15 },
    sourceUrl: sunraPrice('google/gemini-3.1-flash-image', 'text-to-image'), checkedAt: SUNRA_CHECKED, estimated: false,
    note: '"$0.045 per image (0.5K), $0.067 (1K), $0.101 (2K), $0.15 (4K); Google list price", the same for image editing. Sunra adds 5% to each API top-up (not included).' },
  { providerId: 'sunra:openai/gpt-image-2.5-flare', model: 'GPT Image 2.5 Flare (Sunra)', unit: 'image', usd: gptTierRes['med:1K'], usdByTierRes: gptTierRes,
    usdByResolution: { '1K': gptTierRes['med:1K'], '2K': gptTierRes['med:2K'], '4K': gptTierRes['med:4K'] },
    refImages: { usd: Math.ceil(1463 * GPT_SUNRA.imageIn / 1e6 * 1e5) / 1e5, free: 0, sourceUrl: sunraPrice('openai/gpt-image-2.5-flare', 'image-editing'), checkedAt: SUNRA_CHECKED, estimated: true, note: 'Input images $8 / 1M tokens; ~1,463 tokens per reference assumed (as on the Comfy Router row). Sunra: "Editing adds ≈ $0.008–0.012 per input image".' },
    sourceUrl: sunraPrice('openai/gpt-image-2.5-flare', 'text-to-image'), checkedAt: SUNRA_CHECKED, estimated: true,
    note: 'Token-billed (≈) at OpenAI rates: image output $30, prompt text $5 / 1M tokens; output tokens from OpenAI\'s formula for the costliest shape at the size, a 500-byte prompt, × 1.2. Sunra\'s own example: 1024×1024 high ≈ $0.053. The settled charge is recorded after each run.' },
  { providerId: 'kie:bytedance/seedance-2-5', model: `Seedance 2.5 (${KIE_LABEL}), no video input`, unit: 'second', usd: 0.315, usdByQuality: { '480p': 0.14, '720p': 0.315, '1080p': 0.79 },
    sourceUrl: 'https://kie.ai/seedance-2-5', checkedAt: KIE_CHECKED, estimated: false,
    note: 'kie.ai pricing card: "480P: 28 credits/s ($0.140/s, no video)", "720P: 63 credits/s ($0.315/s, no video)", "1080P: 158 credits/s ($0.790/s, no video)". Reseller: may change without notice.' },
  { providerId: 'kie:nano-banana-2', model: `Nano Banana 2 (${KIE_LABEL})`, unit: 'image', usd: 0.04, usdByResolution: { '1K': 0.04, '2K': 0.06, '4K': 0.09 },
    sourceUrl: 'https://kie.ai/nano-banana-2', checkedAt: KIE_CHECKED, estimated: false,
    note: '"8 credits ($0.04) for 1 K, 12 credits ($0.06) for 2 K, and 18 credits ($0.09) for 4 K". Reseller: may change without notice.' },
];
for (const p of AGGREGATOR_PRICES) if (!HOSTED_BY_ID[p.providerId]) HOSTED_BY_ID[p.providerId] = p;
