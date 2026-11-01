import { ROUTE_VIDEO_CAPS, localVideoCaps } from './videoRouteCaps.js';
import { LOCAL_LABEL } from '../shared/modelIds.js';
import { REEL_TOOL_IDS } from '../shared/photosToReel.js';
import { vupFactor } from '../shared/videoUpscale.js';
/**
 * Route registry: every model (provider id) gets its native route (local ComfyUI / Comfy API Router or partner node / Comfy Cloud / the lab's direct API),
 * plus fal and Replicate routes ONLY where the model is officially listed there (slugs and input schemas checked on the model pages, 2026-10-16).
 * Prices live in shared/hostedPrices.ts (native hosted) and routing/routePrices.ts (fal/Replicate); never here.
 */
import { getProvider, comfyCloudOpen, type ProviderDef } from '../providers.js';
import { HOSTED_BY_ID } from '../shared/hostedPrices.js';
import './routePrices.js';
import type { RouteDef } from './types.js';
import { hostedPromptOf } from './hostedPrompt.js';
import { VIDEO_LIMITS, routeCaps, routeVideoReason } from '../tools/h3/videoCaps.js';
import { soulCloudRoutes, SOUL_LOCAL_CAPS } from '../tools/soul/cloud.js';
import { h3VideoRoutes, h3LipsyncRoutes, h3ExtendRoutes, h3CameraRoutes, h3ClassicExtendIssue, H3_VIDEO_CAPS, H3_LIPSYNC_CAPS } from '../tools/h3/cloud.js';
import { h3xCloudIssue, h3xRenderSeconds, h3xTier, H3X_SECONDS_LIST, H3X_DEFAULT_SECONDS, H3X_MAX_TOTAL, H3X_PROMPT_PREFIX, H3X_TIPS } from '../comfy/h3ExtendCloud.js';
import { H3_ROUTER_EXTEND_SECONDS, H3_ROUTER_EXTEND_LABEL, h3RouterExtendSeconds } from '../tools/h3/routerExtend.js';
import { ROUTER_MODELS, NOT_ON_ROUTER, H3_SPEECH_SECONDS, h3LipsyncSeconds, h3CameraRouterSeconds, h3CameraRouterNote, h3LipsyncNote } from './routerModels.js';
import { H3_CAMERA_MOVES, H3_EXTEND_OVERLAP_FRAMES } from '../tools/h3/catalog.js';
import { routerBase, ROUTER_NO_FALLBACK } from '../comfyRouter.js';
import { capsFor, GEMINI_ASPECTS_10 } from '../shared/imageCaps.js';
import { REPLICATE_FLUX2_ASPECTS } from '../shared/hostedAspects.js';
import { keyValue } from './keys.js';
import { bflSpec, b64 } from '../providers/directSpecs.js';
import { LAYOUT_BOXES_LOCAL_ONLY, withFlux3BoxRows } from '../shared/layoutBoxes.js';
import { DIRECT_ROUTES, NATIVE_DIRECT } from './directRoutes.js';
import { DEPLOY_ROUTES, isDeployRouteId, deployRoute } from './deployRoutes.js';
import { charswapCloudIssue } from '../comfy/h3CharSwapCloud.js';
import { charswapWhoIssue } from '../shared/cloudSwap.js';
import { LTX_DFR, ltxDfrAdjustNote, ltxDfrPriceInput, ltxDfrResolution } from '../shared/ltxDfr.js';
import { ltx25CloudIssue, ltx25CloudRenderSeconds } from '../comfy/ltx25Cloud.js';
import { layoutCloudIssue } from '../comfy/ltx25LayoutCloud.js';
import { vfxCloudIssue, vfxLocalIssue } from '../comfy/ltx23VfxCloud.js';
import { FOOTAGE_CLOUD_EFFECTS } from '../shared/footageFx.js';
import { IT_PROVIDER, IT_MAX_SECONDS, itIssue, itBillSeconds } from '../comfy/infiniteTalkCloud.js';
import { TV_MAX_SECONDS, TV_PART_MAX } from '../shared/talkingVideo.js';
import { LTX_API_CLOUD, ltxApiCloudIssue } from '../comfy/ltx25ApiCloud.js';
import { H3KF_PROVIDER, H3KF_MODE, H3KF_SECONDS, H3KF_MIN_FRAMES, H3KF_MAX_FRAMES, H3KF_STEP, KEYFRAMES_CLOUD_ONLY, h3KeyframesIssue, jobModeOf } from '../comfy/h3KeyframesCloud.js';

const CHECKED = '2026-10-16';
export const FAL_ENV = 'OPENHIGGSFIELD_FAL_KEY';
export const REPLICATE_ENV = 'OPENHIGGSFIELD_REPLICATE_API_TOKEN';
export const COMFY_ENV = 'COMFY_API_KEY';
const FAL_LAT = 'estimated: fal publishes no per-model latency; status.metrics.inference_time is recorded per run';
const REP_LAT = 'estimated: Replicate shows a p50 run time only for some models; metrics.predict_time is recorded per run';

const fal = (modelId: string, slug: string, label: string, sec: number): RouteDef => ({
  routeId: `fal:${slug}`, kind: 'fal', modelId, endpoint: slug, priceRef: `fal:${slug}`, sourceUrl: `https://fal.ai/models/${slug}/api`, checkedAt: CHECKED,
  typicalLatencySec: sec, latencyEstimated: true, latencySource: FAL_LAT, envKey: FAL_ENV, envAliases: ['FAL_KEY'], modes: ['generate'], label: `${label} via fal`,
});
const rep = (modelId: string, slug: string, label: string, sec: number): RouteDef => ({
  routeId: `replicate:${slug}`, kind: 'replicate', modelId, endpoint: slug, priceRef: `replicate:${slug}`, sourceUrl: `https://replicate.com/${slug}/api`, checkedAt: CHECKED,
  typicalLatencySec: sec, latencyEstimated: true, latencySource: REP_LAT, envKey: REPLICATE_ENV, envAliases: ['REPLICATE_API_TOKEN'], modes: ['generate'], label: `${label} via Replicate`,
});
const h3mk = (modelId: string) => (o: { kind: 'fal' | 'replicate'; slug: string; label: string; sec: number; modes: string[]; caps: Record<string, unknown>; id?: string }): RouteDef => {
  const r = (o.kind === 'fal' ? fal : rep)(modelId, o.slug, o.label, o.sec);
  return { ...r, ...(o.id ? { routeId: o.id } : {}), modes: o.modes.length ? o.modes : undefined, caps: o.caps };
};
/** Wan 2.2 TI2V 5B local route (2026-10-24): silent, text or start frame, short drafts; `note` is the honest speed line the model menu shows. */
export const WAN22_5B_SLOW_NOTE = 'Local video is slow: a 2 s clip at 704p takes about 9 minutes on an M1 Max, 5 s over 30 minutes. Start with short drafts.';
export const WAN22_5B_CAPS = { audio: false, localOnly: true, modes: ['t2v', 'i2v'], quality: ['fast', 'quality'], firstLastFrame: false, durations: [2, 3, 4, 5], resolutions: ['704p', '480p'], maxSeconds: 5, fps: 24, slow: true, note: WAN22_5B_SLOW_NOTE };
/** LTX-2.5 22B local route (2026-10-25): with its own sound, text / start frame / first + last frame, short drafts; the honest speed line. */
export const LTX25_VIDEO_SLOW_NOTE = 'Local LTX-2.5 can be slow on your computer: a 5 s Draft clip took about 19 minutes on an M1 Max (Sharper is about twice as slow). Start with 2–3 s Drafts.';
export const LTX25_VIDEO_CAPS = { audio: true, localOnly: true, modes: ['t2v', 'i2v', 'flf'], firstLastFrame: true, durations: [2, 3, 4, 5], resolutions: ['448p', '576p'], maxSeconds: 5, fps: 24, slow: true, note: LTX25_VIDEO_SLOW_NOTE };
/** LTX-2.5 Talking Photo local route (2026-10-26): length follows the speech (≤ 4.7 s for now; longer takes chained later). */
export const LTX25_LIPSYNC_NOTE = 'Local LTX-2.5 can be slow on your computer: a 2 s Draft talking clip takes about 8 minutes, the 4.7 s maximum about 19 minutes on an M1 Max. Speech longer than 4.7 s is cut for now.';
export const LTX25_LIPSYNC_CAPS = { audio: true, localOnly: true, modes: ['lipsync'], imageOptional: true, maxSeconds: 4.7, resolutions: ['448p', '576p'], fps: 24, slow: true, soundtrack: 'your speech', note: LTX25_LIPSYNC_NOTE };
/** LTX-2.5 Extend local route (2026-10-26): +2–5 s per pass from the last frames, joined with the sound continued. */
export const LTX25_EXTEND_NOTE = 'Local LTX-2.5 can be slow on your computer: each +2 s Draft takes about 8 minutes on an M1 Max (Sharper about twice as long). Chain passes to keep going, up to 60 s.';
/** InfiniteTalk (Wan 2.1) · Comfy Cloud (2026-10-27, comfy/infiniteTalkCloud.ts): photo + speech up to 60 s, 480p, one 81-frame window per 3.24 s. */
export const IT_CAPS = { audio: true, lipsync: true, modes: ['lipsync'], inputs: ['portrait', 'speech'], speechSeconds: [1, IT_MAX_SECONDS], maxSeconds: IT_MAX_SECONDS, resolutions: ['480p'], aspects: ['auto', '16:9', '9:16', '1:1'], fps: 25, speakers: 1, soundtrack: 'your speech', windowSeconds: 3.24, /* Talking Video (split=1, shared/talkingVideo.ts) */ longSpeechSeconds: TV_MAX_SECONDS, partSeconds: TV_PART_MAX, note: 'Open InfiniteTalk on Wan 2.1 (official Comfy template) on Comfy Cloud: one person talks for as long as the speech, up to 60 s per job (up to 5 minutes in parts of 55 s, joined with soft cuts), at 480p. Billed per 3.24 s window.' };
export const LTX25_EXTEND_CAPS = { audio: true, localOnly: true, modes: ['extend'], extendSeconds: [2, 3, 4, 5], resolutions: ['448p', '576p'], fps: 24, slow: true, guideFrames: [1, 9, 17], returns: 'the whole clip, joined (source + continuation)', note: LTX25_EXTEND_NOTE };
/** Local-route capabilities per model (UI chips/badges). */
const LOCAL_CAPS: Record<string, Record<string, unknown>> = {
  'comfy-h3': H3_VIDEO_CAPS,
  'comfy-h3-lipsync': H3_LIPSYNC_CAPS,
  'comfy-h3-charswap': { experimental: true, localOnly: true, audio: false, get note() { return charswapNote; } }, // HW-SHAPES: sizes from the requirements formula
  'comfy-h3-extend': { audio: true, extendSeconds: [5, 10], minSourceSeconds: 4, overlapFrames: 22, returns: 'new footage only (continuation)' },
  'comfy-h3-camera': { audio: true, cameraLora: true, intensity: ['slow', 'aggressive'] },
  'comfy-h3-restyle': { audio: true, styleRef: true, lora: 'style_transfer', localOnly: true },
  'comfy-h3-vfx': { audio: true, lora: 'vfx_edit', localOnly: true },
  'comfy-wan22-5b': WAN22_5B_CAPS,
  'comfy-ltx25-video': LTX25_VIDEO_CAPS,
  'comfy-ltx25-lipsync': LTX25_LIPSYNC_CAPS,
  'comfy-ltx25-extend': LTX25_EXTEND_CAPS,
  [IT_PROVIDER]: IT_CAPS, // InfiniteTalk · Comfy Cloud (its native route; LOCAL_CAPS sets any model's native caps)
};
/** Extra (non-native) routes. Text-to-image only: the edit/inpaint endpoints have other schemas and aren't wired. */
/** FLUX 3 Upscaler stubs (coming soon): listed so they can be switched on later; never run, never charge (priceRef → usd:null). */
export const FLUX3_UPSCALE_NO_API = 'No public API on this service yet';
const comingSoon = (kind: 'fal' | 'replicate', label: string): RouteDef => ({ routeId: `${kind}:pending/flux-3-upscaler`, kind, modelId: 'direct-flux3-upscale', endpoint: '(no public endpoint yet)',
  priceRef: `${kind}:pending/flux-3-upscaler`, sourceUrl: kind === 'fal' ? 'https://fal.ai/models' : 'https://replicate.com/black-forest-labs', checkedAt: '2026-10-17', typicalLatencySec: 120, latencyEstimated: true,
  envKey: kind === 'fal' ? FAL_ENV : REPLICATE_ENV, envAliases: [kind === 'fal' ? 'FAL_KEY' : 'REPLICATE_API_TOKEN'], label: `FLUX 3 Upscaler via ${label} (coming soon)`, comingSoon: FLUX3_UPSCALE_NO_API, caps: { comingSoon: true } });
/** Why a model's LOCAL route can't take a job on this computer (tool files add entries: tools/videoUpscaleModels.ts). Checked like any route block. */
export const LOCAL_ROUTE_BLOCK: Record<string, (i: Record<string, any>) => string | null> = {};
/** Why a model's LOCAL route can't run on this computer at all, whatever the job (SeedVR2 3B: NVIDIA only). The menu shows that place as unavailable. */
export const LOCAL_HW_BLOCK: Record<string, () => string | null> = {};
/** Native routes that are coming soon (reason shown instead of running). */
/** Partner models not in the Comfy Router catalog (routerModels.ts NOT_ON_ROUTER: HY Image 3.5, Muse Image, Fish Audio S2.1 Pro, Sonilo; HeyGen Voice left 2026-10-31)
 *  are Coming soon in every mode: with or without keys (mock keys included) they never show Ready, never run and never charge. Tool files add more. */
export const COMING_SOON: Record<string, string> = { ...NOT_ON_ROUTER };
/** FLUX 3 Upscaler on BFL: Precise / Creative mode = the Upscale tool's Mode preset; limits per the BFL docs (2026-10-17). */
const UPSCALE_BFL = {
  caps: { mode: ['precise', 'creative'], factor: { min: 1.5, max: 3 }, scales: [1.5, 2, 3], maxSeconds: 20, maxSource: '2560x1440', maxMB: 50, keepsAudio: true, pricing: 'output MP × seconds × $0.035 precise / $0.05 creative' },
  unavailableFor: (i: Record<string, any>) => {
    if ((Array.isArray(i.types) ? i.types[0] : i.mode) === 'smooth60') return 'BFL has Precise and Creative modes only';
    if (i.scale != null && ![1.5, 2, 3].includes(Number(i.scale))) return 'BFL upscales 1.5×, 2× or 3× only';
    if (Number(i.duration) > 20) return 'BFL takes clips up to 20 s';
    const s = i.inputSize ?? i.sourceSize; if (s && (Math.max(s.width, s.height) > 2560 || Math.min(s.width, s.height) > 1440)) return 'BFL takes sources up to 2560×1440';
    try { if (i.videoPath && require_fs().statSync(i.videoPath).size > 50 * 1024 * 1024) return 'BFL takes files up to 50 MB'; } catch { /* missing file: the run reports it */ }
    return null;
  },
  vendor: 'bfl' as const,
  direct: bflSpec(async (job) => { const { bflVideoUpscaleRequest } = await import('../hostedRequests.js'); const i = job.input; const mode = (Array.isArray(i.types) ? i.types[0] : i.mode) === 'creative' ? 'creative' : 'precise';
    return bflVideoUpscaleRequest({ inputVideo: await b64(i.videoPath), factor: vupFactor(i), mode, prompt: i.prompt }); }), // the size we quoted (shared/videoUpscale.ts)
};
import { createRequire } from 'node:module'; const require_fs = () => createRequire(import.meta.url)('node:fs') as typeof import('node:fs');
/** FLUX 3 Image Klein capabilities (BFL docs + ComfyUI announcement, 2026-10-17). maxRefs = what each route accepts. */
export const KLEIN3_CAPS = { native4K: true, layoutBoxes: true, multiRef: true, edit: true, textRendering: true } as const;
const klein3Bfl: RouteDef = { routeId: 'direct:bfl/flux-3-image-klein', kind: 'direct', modelId: 'comfy-flux3-klein', endpoint: 'POST https://api.bfl.ai/v1/flux-3-image-klein (x-key, poll polling_url)',
  priceRef: 'direct:bfl/flux-3-image-klein', sourceUrl: 'https://docs.bfl.ml/api-reference/utility/generate-an-image-with-flux-3-klein', checkedAt: '2026-10-17', typicalLatencySec: 8, latencyEstimated: true, latencySource: 'estimated',
  envKey: 'OPENHIGGSFIELD_BFL_API_KEY', modes: ['generate', 'edit'], label: 'FLUX 3 Klein via BFL API', caps: { ...KLEIN3_CAPS, resolutions: ['1K', '2K', '4K'], maxRefs: 10 }, output: 'image',
  vendor: 'bfl', direct: bflSpec(async (job) => { const { bflKleinRequest } = await import('../hostedRequests.js'); const i = job.input; const refs: string[] = (i.refPaths ?? (i.imagePath ? [i.imagePath] : [])).slice(0, 10);
    return bflKleinRequest({ prompt: hostedPromptOf(i), aspectRatio: i.aspect, imageRes: i.imageResolution, seed: Number.isInteger(i.seed) ? i.seed : undefined, images: await Promise.all(refs.map(b64)) }); }) };
const klein3Fal: RouteDef = { ...fal('comfy-flux3-klein', 'blackforestlabs/flux-3/klein/text-to-image', 'FLUX 3 Klein', 6), sourceUrl: 'https://fal.ai/models/blackforestlabs/flux-3/klein/text-to-image', checkedAt: '2026-10-17',
  caps: { native4K: true, layoutBoxes: true, textRendering: true, resolutions: ['1K', '2K', '4K'], maxRefs: 0, maxSide: 4096, minSide: 256, outputFormats: ['jpeg', 'png', 'webp'], promptExpansion: true },
  unavailableFor: (i) => ((i.refPaths ?? []).length || i.imagePath ? 'Jobs with reference images run on the FLUX 3 Klein edit route' : null) };
/** fal FLUX.3 Klein edit-image (https://fal.ai/models/blackforestlabs/flux-3/klein/edit-image/api, read 2026-10-17): prompt + image_urls (required, ≤10),
 *  image_size optional (256–4096 per side; default = the single ref's size ≤4 MP, or the first ref's size ≤1 MP with several), num_images, output_format, enable_prompt_expansion, bounding_boxes. Same planned price schedule as text-to-image. */
const klein3FalEdit: RouteDef = { ...fal('comfy-flux3-klein', 'blackforestlabs/flux-3/klein/edit-image', 'FLUX 3 Klein edit', 6), sourceUrl: 'https://fal.ai/models/blackforestlabs/flux-3/klein/edit-image/api', checkedAt: '2026-10-17',
  modes: undefined, caps: { ...KLEIN3_CAPS, resolutions: ['1K', '2K', '4K'], maxRefs: 10, maxSide: 4096, minSide: 256, outputFormats: ['jpeg', 'png', 'webp'], promptExpansion: true },
  unavailableFor: (i) => { const n = (i.refPaths ?? []).length || (i.imagePath ? 1 : 0); return !n ? 'Needs at least one reference image' : n > 10 ? `This route takes up to 10 reference images; you added ${n}` : null; } };
/** FLUX 3 Image on the BFL API (2026-10-22): generate and edit (≤10 images), 1K / 2K / 4K; 4K only without references (BFL caps outputs at 4 MP with references). */
const flux3Bfl: RouteDef = { routeId: 'direct:bfl/flux-3-image', kind: 'direct', modelId: 'api-flux3-image', endpoint: 'POST https://api.bfl.ai/v1/flux-3-image (x-key, poll polling_url)',
  priceRef: 'direct:bfl/flux-3-image', sourceUrl: 'https://docs.bfl.ml/api-reference/utility/generate-an-image-with-flux-3', checkedAt: '2026-10-22', typicalLatencySec: 20, latencyEstimated: true, latencySource: 'estimated',
  envKey: 'OPENHIGGSFIELD_BFL_API_KEY', modes: ['generate', 'edit'], label: 'FLUX 3 Image via BFL API', caps: { resolutions: ['1K', '2K', '4K'], maxRefs: 10 }, output: 'image',
  unavailableFor: (i) => { const n = (i.refPaths ?? []).length || (i.imagePath ? 1 : 0); return n > 10 ? `This route takes up to 10 images; you added ${n}` : n && i.imageResolution === '4K' ? 'FLUX 3 Image edits go up to 2K (4 MP with reference images)'
    : i.imageResolution === '0.75K' || i.imageResolution === '1.5K' ? `${i.imageResolution} runs on Comfy Router; the BFL route makes 1K, 2K and 4K` : null; },
  vendor: 'bfl', direct: bflSpec(async (job) => { const { bflFlux3ImageRequest } = await import('../hostedRequests.js'); const i = job.input; const refs: string[] = (i.refPaths ?? (i.imagePath ? [i.imagePath] : [])).slice(0, 10);
    return bflFlux3ImageRequest({ prompt: withFlux3BoxRows(hostedPromptOf(i), i.layoutBoxes) /* layout boxes: the partner node's rows */, aspectRatio: i.aspect, imageRes: i.imageResolution, images: await Promise.all(refs.map(b64)) }); }) };
/** FLUX.2 [max] on fal, text-to-image only (fal-ai/flux-2-max, https://fal.ai/models/fal-ai/flux-2-max/api, 2026-10-22). The edit endpoint bills the input
 *  images' megapixels too (sizes unknown at quote time), so it is not wired. Our body sends an explicit image_size of ≤1 MP (1K) or ≤4 MP (2K). */
const flux2MaxFal: RouteDef = { ...fal('api-flux2-max', 'fal-ai/flux-2-max', 'FLUX.2 [max]', 12), sourceUrl: 'https://fal.ai/models/fal-ai/flux-2-max/api', checkedAt: '2026-10-22', caps: { resolutions: ['1K', '2K'], maxRefs: 0 },
  unavailableFor: (i) => ((i.refPaths ?? []).length || i.imagePath ? 'Jobs with reference images run on the Comfy Router route' : null) };
/** Nano Banana Pro on Replicate (google/nano-banana-pro, official model, 2026-10-22): text-to-image, resolution 1K / 2K / 4K ($0.15 / $0.15 / $0.30). */
const nbProRep: RouteDef = { ...rep('api-nano-banana-pro', 'google/nano-banana-pro', 'Nano Banana Pro', 30), checkedAt: '2026-10-22', caps: { resolutions: ['1K', '2K', '4K'], maxRefs: 0 },
  unavailableFor: (i) => ((i.refPaths ?? []).length || i.imagePath ? 'Jobs with reference images run on the Comfy Router route' : null) };
export const EXTRA_ROUTES: Record<string, RouteDef[]> = {
  // Image models added 2026-10-22 (model-catalog pass): Comfy Router is the native route; these are the other official places with a published price.
  'api-flux3-image': [flux3Bfl], 'api-flux2-max': [flux2MaxFal], 'api-nano-banana-pro': [nbProRep],
  // FLUX 3 Image Klein: BFL direct (generate + edit, up to 10 refs) and fal text-to-image. No Replicate route: replicate/flux-3-klein-image-lora is GPU-time billed (no fixed price), text-to-image only, ≤4 MP.
  // Layout boxes (shared/layoutBoxes.ts) run on the local graph only: the hosted klein places can't take a job that has them (never silently dropped)
  'comfy-flux3-klein': [klein3Bfl, klein3Fal, klein3FalEdit].map((r) => ({ ...r, unavailableFor: (i: Record<string, any>) => (Array.isArray(i.layoutBoxes) && i.layoutBoxes.length ? LAYOUT_BOXES_LOCAL_ONLY : r.unavailableFor?.(i) ?? null) })),
  'direct-flux3-upscale': [comingSoon('fal', 'fal'), comingSoon('replicate', 'Replicate')],
  // Nano Banana 2 edit on fal (2026-10-21, Face Swap / Shots): image_urls (target first), $0.08 per 1K image (https://fal.ai/models/fal-ai/nano-banana-2/edit). Edit jobs only.
  'api-nano-banana': [{ ...fal('api-nano-banana', 'fal-ai/nano-banana-2', 'Nano Banana 2', 12), caps: { resolutions: ['1K'] } /* our fal body sends no size: 1K, $0.08 */ }, { ...fal('api-nano-banana', 'fal-ai/nano-banana-2/edit', 'Nano Banana 2 edit', 14), modes: ['edit'], sourceUrl: 'https://fal.ai/models/fal-ai/nano-banana-2/edit/api', checkedAt: '2026-10-21', caps: { maxRefs: 4, resolutions: ['1K'] },
    unavailableFor: (i) => { const n = (i.refPaths ?? []).length || (i.imagePath ? 1 : 0); return n > 4 ? `This route takes up to 4 images; you added ${n}` : null; } /* edit mode always carries the image (modes: ['edit']) */ }, rep('api-nano-banana', 'google/nano-banana-2', 'Nano Banana 2', 15)],
  // FLUX.2 [pro]: fal sends the picked shape as image_size at ≤ 1 MP (providers/fal.ts); Replicate passes aspect_ratio unchanged, so it keeps the five shapes it always took.
  'api-flux2': [fal('api-flux2', 'fal-ai/flux-2-pro', 'FLUX.2 [pro]', 10), { ...rep('api-flux2', 'black-forest-labs/flux-2-pro', 'FLUX.2 [pro]', 12), caps: { aspects: [...REPLICATE_FLUX2_ASPECTS], allowAuto: false },
    unavailableFor: (i) => { const a = typeof i.aspect === 'string' && i.aspect !== 'auto' ? i.aspect : null; return a && !REPLICATE_FLUX2_ASPECTS.includes(a) ? `FLUX.2 [pro] on Replicate takes ${REPLICATE_FLUX2_ASPECTS.join(', ')}` : null; } }],
  'comfy-qwen-image': [fal('comfy-qwen-image', 'fal-ai/qwen-image', 'Qwen-Image', 8), rep('comfy-qwen-image', 'qwen/qwen-image', 'Qwen-Image', 10)],
  'comfy-zimage-turbo': [fal('comfy-zimage-turbo', 'fal-ai/z-image/turbo', 'Z-Image-Turbo', 3), rep('comfy-zimage-turbo', 'prunaai/z-image-turbo', 'Z-Image-Turbo', 4)],
  // OpenSoul: fal's Z-Image-Turbo LoRA endpoint (docs: `loras` max 3, path = URL or HF repo) carries the ZIT look LoRAs; Replicate's has no LoRA input (prompt-only).
  // OpenSoul (tools/soul/cloud.ts): text routes + reference (character) routes per the official model pages; capabilities in `caps`.
  // MiniMax H3 (approved H3 additions, 2026-10-17): official fal + Replicate endpoints; request bodies + caps in tools/h3/cloud.ts.
  'comfy-h3': h3VideoRoutes(h3mk('comfy-h3')),
  'comfy-h3-lipsync': h3LipsyncRoutes(h3mk('comfy-h3-lipsync')),
  'comfy-h3-extend': h3ExtendRoutes(h3mk('comfy-h3-extend')),
  'comfy-h3-camera': h3CameraRoutes(h3mk('comfy-h3-camera')),
  'comfy-soul': soulCloudRoutes((o) => ({ ...(o.kind === 'fal' ? fal : rep)('comfy-soul', o.slug, o.label, o.sec), modes: o.modes, caps: o.caps, checkedAt: '2026-10-17' })),
};
// H3 runner Step 3 (Oct 26): New angle · H3 CrossView · cloud runs only on the user's own Comfy deployment (never shared Comfy Cloud), so its deployment
// route stands in for the native comfy-cloud one everywhere. Graph + plan: comfy/crossview.ts.
EXTRA_ROUTES['cloud-h3-crossview'] = [{ ...deployRoute('cloud-h3-crossview', 'cloud-h3-crossview', { typicalLatencySec: 360, output: 'video', caps: { audio: true, keepsAudio: true, resolutions: ['480p', '768p'], minSeconds: 5, maxSeconds: 15, fps: 24, oneAngle: true } }), replacesNative: true }];
// Official lab APIs, batch 1 (routing/directRoutes.ts): extra places on existing models.
for (const [m, rs] of Object.entries(DIRECT_ROUTES)) EXTRA_ROUTES[m] = [...(EXTRA_ROUTES[m] ?? []), ...rs];
/** BH10 P2 #16: where a local route runs. Copy wave 1 (2026-10-27): always "Your computer" (LOCAL_LABEL), ComfyUI graph or not. */
export const localRunnerName = (_p: { id: string; via?: string; workflows?: string[] }) => LOCAL_LABEL; // copy wave 1: one name for every local runner (ComfyUI or not)
/** The route the model already had before routing existed. */
export function nativeRoute(p: ProviderDef): RouteDef {
  if (p.kind === 'open-weights') return { routeId: `local:${p.id}`, kind: 'local', modelId: p.id, endpoint: p.workflows?.[0] ? `workflows/${p.workflows[0]}` : p.via, priceRef: null,
    sourceUrl: p.docUrl ?? 'https://docs.comfy.org/', checkedAt: CHECKED, typicalLatencySec: 0, latencyEstimated: true, latencySource: 'see timing.ts ETA per tool (hardware-dependent)', envKey: null, label: `${localRunnerName(p)} · free` };
  const h = HOSTED_BY_ID[p.id];
  if (p.kind === 'hosted-direct') return { routeId: `direct:${p.id}`, kind: 'direct', modelId: p.id, endpoint: p.via, priceRef: p.id, sourceUrl: p.docUrl ?? h?.sourceUrl ?? '', checkedAt: CHECKED,
    typicalLatencySec: 10, latencyEstimated: true, latencySource: 'estimated', envKey: p.apiKeyEnv ?? null, label: `${p.name}` };
  const cloud = p.id.startsWith('cloud-');
  return { routeId: `${cloud ? 'comfy-cloud' : 'comfy-router'}:${p.id}`, kind: cloud ? 'comfy-cloud' : 'comfy-router', modelId: p.id, endpoint: p.nodes?.join(', ') || p.via, priceRef: p.id,
    sourceUrl: p.docUrl ?? h?.sourceUrl ?? 'https://docs.comfy.org/tutorials/partner-nodes/pricing', checkedAt: CHECKED, typicalLatencySec: /video|kling|veo|seedance|h3/i.test(p.id) ? 120 : 15,
    latencyEstimated: true, latencySource: 'estimated', envKey: COMFY_ENV, label: cloud && comfyCloudOpen(p) ? 'Comfy Cloud' : PARTNER_LABEL };
}
/** Partner/API nodes use the Comfy key but are not labelled plain 'Comfy Cloud'. */
export const PARTNER_LABEL = 'Comfy Router';
/** Comfy Router as an EXTRA Run on place of a model whose native route is elsewhere (2026-10-25: Nano Banana 2 Lite, native = the Gemini API).
 *  Same model card; the body, block and refs come from routing/routerModels.ts (keyed by the model id, so the runner finds it from the route id);
 *  priceRef = the route id (its own Router price row in shared/hostedPrices.ts). Like a native Router route, a job it can't take is refused up
 *  front only with a Comfy key set (keyless samples stay as before). */
export const routerPlace = (modelId: string, caps: Record<string, unknown>, over: Partial<RouteDef> = {}): RouteDef => { const rm = ROUTER_MODELS[modelId]; const routeId = `comfy-router:${modelId}`;
  const r: RouteDef = { routeId, kind: 'comfy-router', modelId, endpoint: `POST ${routerBase()}/v2/models/${rm.id}${rm.queue ? '/requests' : ''}${ROUTER_NO_FALLBACK}`, priceRef: routeId,
    sourceUrl: rm.doc, checkedAt: '2026-10-25', typicalLatencySec: 15, latencyEstimated: true, latencySource: 'estimated', envKey: COMFY_ENV, label: PARTNER_LABEL, output: rm.out === 'image' ? 'image' : rm.out === 'video' ? 'video' : undefined,
    ...over, caps: { routerModel: rm.id, maxRefs: rm.maxRefs, ...caps } };
  r.unavailableFor = (i) => (keyValue(r) ? rm.block?.(i) ?? null : null); return r; };
EXTRA_ROUTES['direct-gemini-nb2-lite'] = [...(EXTRA_ROUTES['direct-gemini-nb2-lite'] ?? []), routerPlace('direct-gemini-nb2-lite', { resolutions: ['1K'], aspects: [...GEMINI_ASPECTS_10] })];
// H3 Camera Motion on Comfy Router (2026-10-26): prompt-directed (the move in words, no camera LoRA), billed as MiniMax H3 on Router (4–15 s; a shorter
// move is made as 4 s and the job says so, 2026-10-28).
// The camera_motion_h3 LoRA version stays on the local graph (and a deployment); fal keeps its own prompt-only place.
EXTRA_ROUTES['comfy-h3-camera'] = [...(EXTRA_ROUTES['comfy-h3-camera'] ?? []), routerPlace('comfy-h3-camera', { audio: true, cameraLora: false, promptDirected: true, methodLabel: 'prompt-directed', intensity: ['slow', 'aggressive'], durations: [4, 5, 6, 8, 10], note: 'prompt-directed camera move on plain MiniMax H3; the camera_motion_h3 LoRA runs locally only' },
  { priceRef: 'api-minimax-h3', modes: H3_CAMERA_MOVES.map((m) => m[0]), label: 'Comfy Router · prompt-directed', checkedAt: '2026-10-26', typicalLatencySec: 120, priceInput: (i) => ({ ...i, duration: h3CameraRouterSeconds(i), resolution: '768p' }), adjustNote: h3CameraRouterNote })];
// H3 Extend · via last frame on Comfy Router (2026-10-26, H3 map F3): the exact last frame → Router H3 image to video → joined (routerModels.ts
// 'comfy-h3-extend', tools/h3/routerExtend.ts). Billed as MiniMax H3 on Router for the new seconds (+5 / +8 / +10). The local graph keeps +5 / +10 from 4 s clips.
EXTRA_ROUTES['comfy-h3-extend'] = [...(EXTRA_ROUTES['comfy-h3-extend'] ?? []), routerPlace('comfy-h3-extend', { audio: true, extendSeconds: [...H3_ROUTER_EXTEND_SECONDS], method: 'last-frame', methodLabel: 'via last frame', returns: 'the clip plus the new footage, joined', note: 'Image to video from the exact last frame, joined; motion is not carried over' },
  { priceRef: 'api-minimax-h3', modes: ['extend'], label: H3_ROUTER_EXTEND_LABEL, checkedAt: '2026-10-26', typicalLatencySec: 150, priceInput: (i) => ({ ...i, duration: h3RouterExtendSeconds(i), resolution: '768p' }) })];
LOCAL_ROUTE_BLOCK['comfy-h3-extend'] = (i) => h3ClassicExtendIssue('H3 Extend on your computer', i);
LOCAL_ROUTE_BLOCK['comfy-h3-charswap'] = charswapWhoIssue; // H3 Character Swap needs a click or a side (shared/cloudSwap.ts), on every place
// H3 Talking Photo on Comfy Router (2026-10-26, H3 map F2): portrait = reference image, speech = reference audio (routerModels.ts 'comfy-h3-lipsync'),
// billed as MiniMax H3 on Router (priceRef api-minimax-h3) for the clip it makes: the speech length rounded up, 5–15 s. fal / Replicate stay as places.
EXTRA_ROUTES['comfy-h3-lipsync'] = [routerPlace('comfy-h3-lipsync', { ...H3_LIPSYNC_CAPS, localRecipe: undefined, speechSeconds: [H3_SPEECH_SECONDS.min, H3_SPEECH_SECONDS.max], minSeconds: 5, note: 'reference to video: portrait as Image 1, speech as Audio 1 (no LoRA)' },
  { priceRef: 'api-minimax-h3', modes: ['lipsync'], label: 'Comfy Router', checkedAt: '2026-10-26', typicalLatencySec: 120, priceInput: (i) => ({ ...i, duration: h3LipsyncSeconds(i), resolution: '768p' }), adjustNote: h3LipsyncNote }), ...(EXTRA_ROUTES['comfy-h3-lipsync'] ?? [])]; // Comfy first (the place order), fal / Replicate after
/** B6 tier of a route: 0 Comfy Cloud workflow (open weights, no API nodes), 1 Comfy Cloud · partner API, 2 direct API (fal, Replicate, BFL, vendor), 3 local. */
export function tierOf(r: { kind: string; routeId: string }): 0 | 1 | 2 | 3 {
  if (r.kind === 'local') return 3;
  if (isDeployRouteId(r.routeId)) return 0; // your own Comfy deployment: our workflow graph, open weights
  if (r.kind === 'comfy-cloud') return comfyCloudOpen(getProvider(r.routeId.slice('comfy-cloud:'.length))) ? 0 : 1;
  if (r.kind === 'comfy-router') return 1;
  return 2;
}
export const TIER_LABELS = ['Comfy Cloud', PARTNER_LABEL, 'API', 'Local'] as const;
export const tierLabel = (r: { kind: string; routeId: string }) => TIER_LABELS[tierOf(r)];
/**
 * B6 change 1: Comfy Cloud workflow twins as routes of their open model (one card, chips Comfy Cloud · API · Local). The twin's own provider id
 * stays a hidden alias (provider=cloud-ltx-camera still runs, saved pins and old jobs resolve). Each twin serves only its tools and jobs:
 *  - comfy-h3 → comfy-cloud:cloud-h3-wf (Generate Video and its apps; text or first-frame image; our local H3 graph on Comfy Cloud),
 *  - comfy-open on Camera Moves → comfy-cloud:cloud-ltx-camera (the LTX moves only),
 *  - comfy-open on Re-shoot → comfy-cloud:cloud-reshoot.
 */
const TWINS: { model: string; twin: string; tools: string[]; /** only the tool itself, never a gallery app built on it (app-transition, app-ugc-ad) */ exactTool?: boolean; /** picked by the mode alone, never a Run-on choice */ notAChoice?: boolean; modes?: string[]; unavailableFor?: (i: Record<string, any>) => string | null; priceInput?: RouteDef['priceInput']; adjustNote?: RouteDef['adjustNote']; caps?: Record<string, unknown>; /** an unmeasured price keeps the model as it was before the twin (select.ts twinHeld) */ heldUntilMeasured?: boolean; /** provider=<twin> is read as model + this route on quote and submit (mapTwinAlias) */ aliasOk?: boolean }[] = [
  { model: 'comfy-h3', twin: 'cloud-h3-wf', tools: ['h3-video'], modes: ['t2v', 'i2v'] },
  // Oct 27: MiniMax H3 Keyframes · Comfy Cloud (comfy/h3KeyframesCloud.ts): the official multiframe template, the H3 card's Keyframes mode (2–5 stills at
  // chosen times → one shot). The only place that makes Keyframes; billed per second of clip at the picked size (an estimate until measured).
  { model: 'comfy-h3', twin: H3KF_PROVIDER, tools: ['h3-video'], exactTool: true, notAChoice: true, modes: [H3KF_MODE], unavailableFor: h3KeyframesIssue,
    caps: { audio: true, keyframes: { min: H3KF_MIN_FRAMES, max: H3KF_MAX_FRAMES, step: H3KF_STEP, firstAtStart: true }, durations: [...H3KF_SECONDS], resolutions: ['768p', '480p'], quality: ['fast', 'quality'], fps: 24,
      note: 'Open MiniMax H3 on Comfy Cloud: 2–5 frames, each at its own time, joined into one shot with sound; 5–15 s, 768p or 480p.' } },
  { model: 'comfy-open', twin: 'cloud-ltx-camera', tools: ['camera'], unavailableFor: (i) => { const t = (Array.isArray(i.types) ? i.types : typeof i.types === 'string' ? (() => { try { const x = JSON.parse(i.types); return Array.isArray(x) ? x : [x]; } catch { return i.types.split(','); } })() : []).map(String);
    return t.length && t.every((x: string) => /^ltx-/.test(x.trim())) ? null : 'This route only runs the LTX camera moves'; } },
  { model: 'comfy-open', twin: 'cloud-reshoot', tools: ['reshoot'] },
  // Oct 26: H3 Character Swap on shared Comfy Cloud with the user's imported LoRA (comfy/h3CharSwapCloud.ts): one pass, 2–15 s, mask-free
  { model: 'comfy-h3-charswap', twin: 'cloud-h3-charswap', tools: ['object-swap', 'motion-transfer'], unavailableFor: (i) => charswapWhoIssue(i) ?? charswapCloudIssue(i) },
  // Oct 27: LTX-2.5 22B on shared Comfy Cloud (comfy/ltx25Cloud.ts): Generate Video (text, start frame, Loop, first + last) and Transitions' Morph; Extend with the
  // picture-and-sound continuation. Billed per RENDERED second (Extend includes the kept context). 720p runs here only (LOCAL_ROUTE_BLOCK below).
  // DFR (2026-10-29, shared/ltxDfr.ts + comfy/ltx25Dfr.ts): the official DFR template on image to video, priced per second with or without the 48 fps pass
  // (priceInput); asked where it can't run (text to video, Loop) it runs at 720p with a note (adjustNote).
  { model: 'comfy-ltx25-video', twin: 'cloud-ltx25-video', tools: ['h3-video', 'app-transition'], unavailableFor: ltx25CloudIssue, heldUntilMeasured: true, priceInput: ltxDfrPriceInput, adjustNote: ltxDfrAdjustNote,
    caps: { ...LTX25_VIDEO_CAPS, localOnly: false, slow: false, resolutions: ['448p', '576p', '720p', LTX_DFR], dfr: { modes: ['i2v'], fps: [24, 48], stages: 3 }, note: 'Open LTX-2.5 22B on Comfy Cloud: Draft, Sharper, 720p or DFR (best quality, image to video), 2–5 s, with its own sound.' } },
  { model: 'comfy-ltx25-extend', twin: 'cloud-ltx25-extend', tools: ['h3-extend'], unavailableFor: ltx25CloudIssue, heldUntilMeasured: true, priceInput: (i) => ({ ...i, duration: ltx25CloudRenderSeconds(i) }),
    caps: { ...LTX25_EXTEND_CAPS, localOnly: false, slow: false, resolutions: ['448p', '576p', '720p'], methods: ['continue', 'guide'], defaultMethod: 'continue', contextSeconds: 5.04, pictureFadeFrames: 16, note: 'Open LTX-2.5 22B on Comfy Cloud: the model sees and hears the last 5 s of your clip and makes only the new seconds (picture and sound continue); +2–5 s, up to 720p.' } },
  // Oct 27: H3 Extend · Comfy Cloud (comfy/h3ExtendCloud.ts): the local H3 Extend graph on shared Comfy Cloud, one segment per job (+2–14 s), the last 22 frames
  // of picture and sound as context, joined. Billed per RENDERED second (context + new frames on H3's grid), from the asked seconds and tier only.
  { model: 'comfy-h3-extend', twin: 'cloud-h3-extend', tools: ['h3-extend'], unavailableFor: h3xCloudIssue, heldUntilMeasured: true, priceInput: (i) => ({ ...i, duration: h3xRenderSeconds(i), resolution: h3xTier(i) }),
    caps: { audio: true, extendSeconds: [...H3X_SECONDS_LIST], defaultExtendSeconds: H3X_DEFAULT_SECONDS, contextFrames: H3_EXTEND_OVERLAP_FRAMES, resolutions: ['768p', '480p'], characterPhoto: true, maxTotalSeconds: H3X_MAX_TOTAL, method: 'continue', methodLabel: 'picture and sound continue',
      returns: 'the clip plus the new footage, joined', promptPrefix: H3X_PROMPT_PREFIX, tips: [...H3X_TIPS], note: 'Open MiniMax H3 on Comfy Cloud: the model sees and hears the last 22 frames of your clip and keeps going; +2–14 s per segment, extend again for a longer take.' } },
  // Oct 27: MiniMax Music 3 on shared Comfy Cloud (comfy/cloudWorkflows.ts, workflows/cloud/audio-minimax-music3-api.json): Music, Music for a video and
  // Music Bed (soundtrack base). Billed per second of the song asked (max_duration; GPU time follows the length). Held until one measured run sets the price.
  { model: 'comfy-minimax-music3', twin: 'cloud-minimax-music', tools: ['audio', 'soundtrack'], heldUntilMeasured: true /* music only: the engine is listed in Music alone */, priceInput: (i) => (Number(i.outputDuration ?? i.duration) > 0 ? { ...i, duration: minimaxSongSeconds(i) } : i) /* a listing with no length keeps the shared default, like every per-second row; a job always has one */, caps: { maxSeconds: 360, lyrics: true, instrumental: true, note: 'Open MiniMax Music 3 on Comfy Cloud: the official template, same caption and lyrics as Local.' } },
  // Oct 27: LTX-2.5 Pro / Fast on Comfy Cloud via the LTX-2.5 partner node (comfy/ltx25ApiCloud.ts): image to video and first + last frame. Comfy Router's
  // ltx-2-5-pro schema is text only, so the Pro card's Comfy place runs text on Router and images here (same card, same place "Comfy"). Fast has no Router
  // place: this is its Comfy place for image jobs. Billed per second at the partner-node rate (fixed, not GPU time: no heldUntilMeasured).
  ...Object.values(LTX_API_CLOUD).map((t) => ({ model: t.tier === 'pro' ? 'router-ltx-25-pro' : 'direct-ltx-25-fast', twin: t.provider, tools: ['h3-video'], modes: ['i2v', 'flf'], unavailableFor: ltxApiCloudIssue(t.tier),
    caps: { audio: true, firstLastFrame: true, partnerNode: 'LtxApi25ImageToVideo', durations: t.durations, resolutions: t.resolutions, aspects: ['auto', '16:9', '9:16'], fps: t.fps, note: `${t.name} partner node on Comfy Cloud: start image or first + last frame, ${t.durations[0]}–${t.durations[t.durations.length - 1]} s, ${t.resolutions.join(' / ')}, with its own sound.` } })),
  // Oct 27: Render (Direct a Shot step 3) on shared Comfy Cloud: LTX-2.5 22B + Lightricks' Layout to Render IC-LoRA (the user's import; comfy/ltx25LayoutCloud.ts).
  // Billed per second of mockup at Draft / Sharper / 720p; 720p and lengths over 5 s run here only. The sheet picks this place itself (Place: Comfy Cloud).
  { model: 'comfy-ltx25-layout', twin: 'cloud-ltx25-layout', tools: ['make-it-real'], unavailableFor: layoutCloudIssue, heldUntilMeasured: true,
    caps: { localOnly: false, slow: false, resolutions: ['448p', '576p', '720p'], minSec: 2, maxSec: 10, importLora: 'layout-lora', note: 'LTX-2.5 22B + Lightricks’ Layout to Render on Comfy Cloud: Draft, Sharper or 720p, 2–10 s, with its own sound. Needs the LoRA imported into your Comfy Cloud model library.' } },
  // Oct 27: Footage Effects on shared Comfy Cloud (comfy/ltx23VfxCloud.ts): four official Comfy LTX-2.3 IC-LoRA templates (Restore old footage, Remove an object,
  // Remove subtitles, Extend the frame) that run here only. Nov 1: Vanish, Day to night, Rain and Flood run here too (LTX-2.3 LoRAs) AND locally (unchanged);
  // Alpha matte stays on this computer. Billed per second of clip, one price row for every effect (the same two-stage GPU work).
  { model: 'comfy-ltx25-iclora', twin: 'cloud-ltx23-vfx', tools: ['footage-fx'], unavailableFor: vfxCloudIssue, heldUntilMeasured: true, aliasOk: true,
    caps: { localOnly: false, slow: false, resolutions: ['448p', '576p'], durations: [2, 3, 4, 5], effects: FOOTAGE_CLOUD_EFFECTS.map((e) => e.id), note: 'LTX-2.3 on Comfy Cloud: remove people, day to night, rain, flood, restore old footage, remove an object or subtitles, or extend the frame. 2–5 s, Draft or Sharper, your sound kept.' } },
];
/** MiniMax Music 3 · Comfy Cloud bills the song length the graph asks for (max_duration): comfy/plans.ts songPlan's rule (the clip's length for a
 *  video, else the picked length; 60 s when none; 1–360 s), so the quote and the charge price the same seconds. */
export const minimaxSongSeconds = (i: Record<string, any>) => Math.min(360, Math.max(1, Number(i.outputDuration ?? i.duration) || 60));
/** The local LTX-2.5 routes render the Mac sizes only: 720p and the picture-and-sound continuation run on Comfy Cloud (2026-10-27). */
LOCAL_ROUTE_BLOCK['comfy-ltx25-video'] = (i) => (String(ltxDfrResolution(i)) === '720p' ? '720p runs on Comfy Cloud; on your computer pick Draft or Sharper' : null); // DFR that can't run (text, Loop) runs as 720p
LOCAL_ROUTE_BLOCK['comfy-ltx25-extend'] = (i) => (String(i.resolution) === '720p' ? '720p runs on Comfy Cloud; on your computer pick Draft or Sharper'
  : i.extendMethod === 'continue' ? 'Picture-and-sound continuation runs on Comfy Cloud; your computer continues from the last frames' : null);
/** The local Render route makes the Mac sizes only: 720p runs on Comfy Cloud (2026-10-27). */
/** Footage Effects (2026-10-27): the Comfy Cloud effects (LTX-2.3 templates) never run on your computer. */
LOCAL_ROUTE_BLOCK['comfy-ltx25-iclora'] = vfxLocalIssue;
LOCAL_ROUTE_BLOCK['comfy-ltx25-layout'] = (i) => (String(i.resolution) === '720p' ? '720p runs on Comfy Cloud; on your computer pick Draft or Sharper' : null);
/** Routes the job's mode alone picks (Keyframes · Comfy Cloud): never offered as a Run-on choice. */
export const NOT_A_CHOICE = new Set(TWINS.filter((t) => t.notAChoice).map((t) => `comfy-cloud:${t.twin}`));
export const TWIN_ALIASES: Record<string, { model: string; route: string; tools: string[] }> = Object.fromEntries(TWINS.map((t) => [t.twin, { model: t.model, route: `comfy-cloud:${t.twin}`, tools: t.tools }]));
/** provider=<twin card> (an API / MCP caller copying a provider id from /api/tools, e.g. cloud-ltx23-vfx on Footage Effects): the open model plus its
 *  Comfy Cloud route, so the quote and the submit judge the same route with the same rules (2026-11-01: the quote priced the twin's bare route,
 *  skipping its unavailableFor, while the submit refused the provider outright). Only twins marked aliasOk, on a tool that doesn't list the twin
 *  itself (others keep their old behaviour until checked one by one). An explicit route= wins. Fields change in place; true when it mapped. */
export function mapTwinAlias(tool: { id: string; app?: any; providers?: string[] } | null | undefined, f: Record<string, any>): boolean {
  const tk = toolKeys(tool ?? null); let hit = false;
  for (const k of ['provider', 'model'] as const) { const id = f[k]; if (typeof id !== 'string' || !isTwinAlias(id, tk) || tool?.providers?.includes(id) || !TWINS.some((t) => t.twin === id && t.aliasOk && t.tools.some((x) => tk.includes(x)))) continue; const a = TWIN_ALIASES[id];
    f[k] = a.model; if (!f.route || f.route === 'auto') f.route = a.route; hit = true; }
  return hit;
}
/** True when this provider id is a twin card shown as a route of its open model on this tool (hidden from the tool's model list). */
export const isTwinAlias = (providerId: string, toolIds: string[]) => !!TWIN_ALIASES[providerId] && TWIN_ALIASES[providerId].tools.some((t) => toolIds.includes(t));
function twinRoutes(modelId: string, toolIds: string[]): RouteDef[] {
  return TWINS.filter((t) => t.model === modelId && (t.exactTool ? t.tools.includes(toolIds[0]) : t.tools.some((x) => toolIds.includes(x)))).flatMap((t) => { const p = getProvider(t.twin); if (!p) return [];
    const r = nativeRoute(p); return [{ ...r, modelId, twinProvider: t.twin, tools: t.tools, label: 'Comfy Cloud', ...(t.notAChoice ? { notAChoice: true } : {}), ...(t.modes ? { modes: t.modes } : {}), ...(t.unavailableFor ? { unavailableFor: t.unavailableFor } : {}), ...(t.priceInput ? { priceInput: t.priceInput } : {}), ...(t.adjustNote ? { adjustNote: t.adjustNote } : {}), ...(t.heldUntilMeasured ? { heldUntilMeasured: true } : {}), ...(t.caps ? { caps: { ...(r.caps ?? {}), ...t.caps } } : {}) }]; });
}
/** The tool ids a route list is built for: the tool itself and, for gallery apps, its base tool. */
export const toolKeys = (tool?: { id: string; app?: any } | null): string[] => (tool ? [tool.id, ...((tool as any).app?.gallery?.base ? [(tool as any).app.gallery.base] : []), ...(REEL_TOOL_IDS.includes(tool.id) ? ['camera'] : [])] : []);
/** Routes of one model. With a tool (B6), Comfy Cloud workflow twins serving that tool are added as routes of the open model. */
export function routesFor(modelId: string, tool?: { id: string; app?: any } | string | null): RouteDef[] {
  const p = getProvider(modelId); if (!p) return [];
  const tk = typeof tool === 'string' ? [tool] : toolKeys(tool ?? null);
  const native = nativeRoute(p); if (modelId === 'direct-flux3-upscale') Object.assign(native, { label: 'FLUX 3 Upscaler via BFL API', sourceUrl: 'https://docs.bfl.ai/flux_tools/flux_video_upscale', checkedAt: '2026-10-17', endpoint: 'POST https://api.bfl.ai/v1/flux-tools/video-upscale-v1', typicalLatencySec: 180, output: 'video' }, UPSCALE_BFL);
  if (NATIVE_DIRECT[modelId]) Object.assign(native, NATIVE_DIRECT[modelId]); // hosted-direct engines with a live lab connection (routing/directRoutes.ts)
  if (modelId === 'direct-flux3-upscale') native.vendor = 'bfl';
  if (COMING_SOON[modelId]) { native.comingSoon = COMING_SOON[modelId]; native.caps = { comingSoon: true }; native.label = `${p.name}`; }
  if (modelId === 'comfy-flux3-klein') native.caps = { ...KLEIN3_CAPS, resolutions: ['1K', '2K', '4K'], maxRefs: 10 /* workflows/create-image-flux3klein-multiref-api.json */ };
  if (modelId === 'comfy-soul') native.caps = SOUL_LOCAL_CAPS; if (LOCAL_CAPS[modelId]) native.caps = LOCAL_CAPS[modelId];
  if (native.kind === 'local' && LOCAL_ROUTE_BLOCK[modelId]) { const prev = native.unavailableFor; native.unavailableFor = (i) => prev?.(i) ?? LOCAL_ROUTE_BLOCK[modelId](i); } // a local graph that can't take this job here (Video Upscale: SeedVR2 3B on CUDA only, a size the model can't make)
  if (modelId === 'comfy-h3') { native.caps = { ...H3_VIDEO_CAPS, ...routeCaps(native.routeId, VIDEO_LIMITS['comfy-h3']) }; native.unavailableFor = (i) => (jobModeOf(i) === H3KF_MODE ? KEYFRAMES_CLOUD_ONLY : routeVideoReason(native.routeId, i)); } // Keyframes: Comfy Cloud only (TWINS)
  if (modelId === 'comfy-wan22-5b') { native.caps = { ...WAN22_5B_CAPS, ...routeCaps(native.routeId, VIDEO_LIMITS['comfy-wan22-5b']), audio: false }; native.unavailableFor = (i) => routeVideoReason(native.routeId, i); }
  if (modelId === IT_PROVIDER) { native.unavailableFor = itIssue; native.priceInput = (i) => ({ ...i, duration: itBillSeconds(i), resolution: '480p' }); native.typicalLatencySec = 300; } // InfiniteTalk: refuses > 60 s before any upload; billed per rendered window
  if (modelId === 'cloud-ltx25-video') { native.priceInput = ltxDfrPriceInput; native.adjustNote = ltxDfrAdjustNote; } // the twin's alias route (findRoute by route id): DFR priced the same as on the card
  if (modelId === 'comfy-ltx25-video') { native.caps = { ...LTX25_VIDEO_CAPS, ...routeCaps(native.routeId, VIDEO_LIMITS['comfy-ltx25-video']) }; native.unavailableFor = (i) => routeVideoReason(native.routeId, i) ?? LOCAL_ROUTE_BLOCK['comfy-ltx25-video']?.(i) ?? null; native.adjustNote = ltxDfrAdjustNote; } // DFR: local with its files (the weights gate) // 720p: Comfy Cloud only
  const rmAll = native.kind === 'comfy-router' ? ROUTER_MODELS[modelId] : undefined;
  const rm = rmAll && (!rmAll.tools || !tk.length || rmAll.tools.some((t) => tk.includes(t))) ? rmAll : undefined;
  if (rmAll && !rm) native.routerOff = true; // a tool whose jobs the Router body doesn't map (Camera Moves, swaps, re-shoot, Cinema): stays as before (not wired)
  if (rm) { // Comfy Router (routing/routerModels.ts): the Router model id, and what this route can take. With a Comfy key set, a job it can't take is refused up front (nothing charged).
    native.endpoint = `POST ${routerBase()}/v2/models/${rm.id}${rm.queue ? '/requests' : ''}${ROUTER_NO_FALLBACK}`; native.sourceUrl = rm.doc;
    native.caps = { ...(native.caps ?? {}), routerModel: rm.id, ...(rm.idFor ? { routerEditModel: rm.idFor({ types: ['edit'], refPaths: ['photo.png'] }) } /* FIBO 2.0: edits call bria/fibo */ : {}), ...(rm.out === 'image' ? { maxRefs: Math.min(rm.maxRefs, capsFor(modelId)?.supports.maxRefs ?? rm.maxRefs) } : {}) };
    const prev = native.unavailableFor; native.unavailableFor = (i) => prev?.(i) ?? (keyValue(native) ? rm.block?.(i) ?? null : null); } // keyless samples stay as before
  if (modelId === 'router-ltx-25-pro' && rm) native.modes = ['t2v']; // 2026-10-27: the Router schema is text only; image jobs of this card run on its Comfy Cloud partner-node twin (TWINS), with or without a key
  // Tool-scoped extra routes (RouteDef.tools) are listed on their tools only; one that replacesNative stands in for the native route there.
  const extra = (EXTRA_ROUTES[modelId] ?? []).filter((r) => !r.tools || !tk.length || r.tools.some((t) => tk.includes(t)));
  const dropNative = extra.some((r) => r.replacesNative && (!r.tools ? true : tk.length > 0 && r.tools.some((t) => tk.includes(t)))); // no tools = everywhere (H3 CrossView: deployment only)
  const all = [...(dropNative ? [] : [native]), ...extra, ...(tk.length ? twinRoutes(modelId, tk) : [])];
  for (const r of all) if (!/h3|wan22-5b|ltx25-video/.test(r.modelId) && !r.caps?.videoCaps) { // H3 keeps tools/h3/videoCaps.ts
    const vc = ROUTE_VIDEO_CAPS[r.routeId] ?? (r.kind === 'local' && LOCAL_VIDEO_MODELS.has(r.modelId) ? localVideoCaps(r.routeId, String(r.endpoint)) : null); if (vc) r.caps = { ...(r.caps ?? {}), videoCaps: vc }; }
  return all;
}
/** Local video models (non-H3) on video tools. */
const LOCAL_VIDEO_MODELS = new Set(['comfy-open', 'comfy-funcamera', 'comfy-seedvr2', 'comfy-rife', 'comfy-birefnet-video', 'comfy-depth-anything-v2', 'local-ffmpeg-hdr']);
export const findRoute = (routeId: string): RouteDef | undefined => {
  const [kind, ...rest] = routeId.split(':'); const id = rest.join(':');
  if (kind === 'comfy-deploy') return Object.values(EXTRA_ROUTES).flat().find((r) => r.routeId === routeId) ?? DEPLOY_ROUTES[routeId]; // H3 runner Step 1: your Comfy deployment
  const extra = Object.values(EXTRA_ROUTES).flat().find((r) => r.routeId === routeId); if (extra || kind === 'fal' || kind === 'replicate') return extra;
  const p = getProvider(id); return p ? routesFor(p.id).find((r) => r.routeId === routeId) : undefined;
};
export const allExtraRoutes = () => Object.values(EXTRA_ROUTES).flat();
/** HW-SHAPES: the charswap note is generated from the manifest sizes + the VRAM formula (hardware/requirements.ts), loaded lazily (no import cycle). */
let charswapNote = '~42 GB of weights, ~30 GB VRAM; licence on the Models & Licences page';
void import('../hardware/requirements.js').then(async (R) => { const M = await import('../modelWeights.js'); const wf = 'object-swap-h3-charswap-api.json'; const v = R.wfVram(wf);
  const gb = M.weightsForWorkflows([wf]).reduce((a, f) => a + (f.sizeBytes ?? 0), 0) / 1e9; if (v && gb > 0) charswapNote = `~${Math.round(gb)} GB of weights, ~${Math.floor(v.recommendedVramGB)} GB VRAM; licence on the Models & Licences page`; }).catch(() => undefined);
