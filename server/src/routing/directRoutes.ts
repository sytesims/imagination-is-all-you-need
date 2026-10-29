/**
 * Official lab APIs as places of our models (batch 1, 2026-10-23: MiniMax, LTX, BFL). Read on the labs' own docs that day; prices in
 * routing/routePrices.ts (one row per route, source + date). Two shapes:
 *   DIRECT_ROUTES[engine]   extra routes on an existing model (same model card, another Run on place), merged into routes.ts EXTRA_ROUTES;
 *   NATIVE_DIRECT[engine]   fields for a hosted-direct engine's own route (providers.ts direct(...)): the spec that makes it run, its vendor and caps.
 * Batch 2 adds a lab with: a DIRECT_PROVIDERS entry (providers/direct.ts), a DirectSpec per route (providers/directSpecs.ts), a row here and a price row.
 */
import type { RouteDef } from './types.js';
import { bflSpec, b64, minimaxVideoSpec, minimaxImageSpec, minimaxSpeechSpec, ltxSpec, bflVideoSpec, minimaxRefImages } from '../providers/directSpecs.js';
import { bflFlexRequest, bflKlein2Request, oneMp } from '../hostedRequests.js';
import { VIDEO_LIMITS, routeCaps, routeVideoReason, videoCapsBlock } from '../tools/h3/videoCaps.js';
import { OPENAI_ROUTES } from '../providers/openai.js';
import { GEMINI_ROUTES, GEMINI_NATIVE } from '../providers/gemini.js';
import { BYTEPLUS_ROUTES, BYTEPLUS_NATIVE, BYTEPLUS_VIDEO_LIMITS } from '../providers/byteplus.js';

const D = '2026-10-23';
const MINIMAX_ENV = 'OPENHIGGSFIELD_MINIMAX_API_KEY'; const LTX_ENV = 'OPENHIGGSFIELD_LTX_API_KEY'; const BFL_ENV = 'OPENHIGGSFIELD_BFL_API_KEY';
const base = (o: Pick<RouteDef, 'routeId' | 'modelId' | 'endpoint' | 'sourceUrl' | 'label' | 'envKey' | 'vendor'> & Partial<RouteDef>): RouteDef => ({ kind: 'direct', priceRef: o.routeId, checkedAt: D,
  typicalLatencySec: 60, latencyEstimated: true, latencySource: 'estimated: the lab publishes no latency; recorded per run', ...o });
const refsOf = (i: Record<string, any>): string[] => (i.refPaths ?? (i.imagePath ? [i.imagePath] : []));
const promptOf = (i: Record<string, any>) => String(i.hostedPrompt ?? i.prompt ?? '');
const seedOf = (i: Record<string, any>) => (Number.isInteger(i.seed) ? i.seed : undefined);
const noDraft = (name: string) => (i: Record<string, any>) => (i.draft ? `${name} has no draft mode` : null);

// ---- MiniMax H3 / H3-Max (v2 video) on the MiniMax H3 model (engine comfy-h3, next to fal / Replicate): Generate Video only. 768p → MiniMax-H3 768P,
//      480p → MiniMax-H3-Max 480P (5–15 s). 2K stays on the Comfy Router engine (api-minimax-h3) until routes can narrow an engine's resolutions. ----
const H3_ID = 'direct:minimax/h3';
const minimaxH3: RouteDef = base({ routeId: H3_ID, modelId: 'comfy-h3', vendor: 'minimax', envKey: MINIMAX_ENV, tools: ['h3-video'], output: 'video', modes: ['t2v', 'i2v', 'flf', 'r2v'],
  endpoint: 'POST https://api.minimax.io/v2/video_generation (Bearer; poll GET /v2/query/video_generation/{task_id})', sourceUrl: 'https://platform.minimax.io/docs/api-reference/video-generation-v2-create',
  label: 'MiniMax H3 via MiniMax API', typicalLatencySec: 120, direct: minimaxVideoSpec, refsPriced: minimaxRefImages,
  caps: { audio: true, audioBadge: 'Audio on', firstLastFrame: true, ...routeCaps(H3_ID, VIDEO_LIMITS['comfy-h3']), models: { '480p': 'MiniMax-H3-Max 480P', '768p': 'MiniMax-H3 768P' }, freeRefImages: 5 },
  unavailableFor: (i) => noDraft('MiniMax H3')(i) ?? (String(i.resolution).toLowerCase() === '480p' && Number(i.duration) < 5 ? 'MiniMax H3-Max (480p) makes clips of 5–15 s' : null) ?? routeVideoReason(H3_ID, i) });

// ---- MiniMax Speech 2.8 HD on the Audio tool (Voice Studio keeps the native route: its voiceover is muxed onto a clip, not wired here) ----
const speechHd: RouteDef = base({ routeId: 'direct:minimax/speech-2.8-hd', modelId: 'direct-minimax-speech', vendor: 'minimax', envKey: MINIMAX_ENV, tools: ['audio'], replacesNative: true,
  endpoint: 'POST https://api.minimax.io/v1/t2a_v2 (model speech-2.8-hd, Bearer, output_format url)', sourceUrl: 'https://platform.minimax.io/docs/api-reference/speech-t2a-http',
  label: 'MiniMax Speech 2.8 HD via MiniMax API', typicalLatencySec: 8, direct: minimaxSpeechSpec('speech-2.8-hd', 'direct:minimax/speech-2.8-hd') });

// ---- BFL: FLUX.2 [flex] edit, FLUX.2 [klein] 4B / 9B ----
const flexEdit: RouteDef = base({ routeId: 'direct:bfl/flux-2-flex#edit', modelId: 'direct-flux2-flex', vendor: 'bfl', envKey: BFL_ENV, output: 'image', modes: ['edit'],
  endpoint: 'POST https://api.bfl.ai/v1/flux-2-flex (x-key, input_image … input_image_8; poll polling_url)', sourceUrl: 'https://docs.bfl.ml/api-reference/models/generate-or-edit-an-image-with-flux2-[flex]',
  label: 'FLUX.2 [flex] edit via BFL API', typicalLatencySec: 25, caps: { resolutions: ['1K'], maxRefs: 8 },
  unavailableFor: (i) => { const n = refsOf(i).length; return !n ? 'Needs at least one reference image' : n > 8 ? `This route takes up to 8 images; you added ${n}` : null; },
  direct: bflSpec(async (job) => { const i = job.input; return bflFlexRequest({ prompt: promptOf(i), ...oneMpWH(i.aspect), seed: seedOf(i), images: await Promise.all(refsOf(i).slice(0, 8).map(b64)) }); }) });
const oneMpWH = (aspect?: string) => { const s = oneMp(aspect); return { width: s.width, height: s.height }; };
const klein2 = (variant: '4b' | '9b', modelId: string, edit: boolean): RouteDef => base({ routeId: `direct:bfl/flux-2-klein-${variant}${edit ? '#edit' : ''}`, modelId, vendor: 'bfl', envKey: BFL_ENV, output: 'image', modes: [edit ? 'edit' : 'generate'],
  endpoint: `POST https://api.bfl.ai/v1/flux-2-klein-${variant} (x-key${edit ? ', input_image … input_image_4' : ''}; poll polling_url)`, sourceUrl: `https://docs.bfl.ml/api-reference/models/generate-or-edit-an-image-with-flux2-[klein]-${variant}`,
  label: `FLUX.2 [klein] ${variant.toUpperCase()}${edit ? ' edit' : ''} via BFL API`, typicalLatencySec: 6, caps: { resolutions: ['1K'], maxRefs: edit ? 4 : 0 },
  unavailableFor: (i) => { const n = refsOf(i).length; return edit ? (!n ? 'Needs at least one reference image' : n > 4 ? `This route takes up to 4 images; you added ${n}` : null) : n ? 'Jobs with reference images run on the edit route' : null; },
  direct: bflSpec(async (job) => { const i = job.input; return bflKlein2Request(variant, { prompt: promptOf(i), aspectRatio: i.aspect, seed: seedOf(i), images: edit ? await Promise.all(refsOf(i).slice(0, 4).map(b64)) : [] }); }) });

export const DIRECT_ROUTES: Record<string, RouteDef[]> = {
  'comfy-h3': [minimaxH3],
  'direct-minimax-speech': [speechHd],
  'direct-flux2-flex': [flexEdit],
  'comfy-klein4b': [klein2('4b', 'comfy-klein4b', false), klein2('4b', 'comfy-klein4b', true)],
  'direct-flux2-klein-9b': [klein2('9b', 'direct-flux2-klein-9b', true)],
};
// Batch 2 (2026-10-23): OpenAI, Google Gemini API, BytePlus ModelArk (routes defined next to each provider: providers/openai.ts, gemini.ts, byteplus.ts).
for (const extra of [OPENAI_ROUTES, GEMINI_ROUTES, BYTEPLUS_ROUTES]) for (const [m, rs] of Object.entries(extra)) DIRECT_ROUTES[m] = [...(DIRECT_ROUTES[m] ?? []), ...rs];
// New Seedance engines' Generate Video limits (kept in providers/byteplus.ts; registered here to avoid an import cycle with videoCaps.ts).
for (const k of ['direct-seedance-20-fast', 'direct-seedance-20-mini', 'direct-seedance-25']) VIDEO_LIMITS[k] = BYTEPLUS_VIDEO_LIMITS[k];

// ---- Native routes of hosted-direct engines ----
const ltxNative = (model: 'ltx-2-5-pro' | 'ltx-2-5-fast' | 'ltx-2-3-fast', name: string, provider: string): Partial<RouteDef> => ({ vendor: 'ltx', label: `${name} via LTX API`, output: 'video', modes: ['t2v', 'i2v', 'flf'],
  endpoint: `POST https://api.ltx.io/v2/{text-to-video|image-to-video} (model ${model}, Bearer; poll GET /v2/{endpoint}/{id} every ≥5 s; 2 jobs at once)`, sourceUrl: 'https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-text-to-video',
  checkedAt: D, typicalLatencySec: 90, direct: ltxSpec(model), caps: { audio: true, audioBadge: 'Audio on', firstLastFrame: true, cameraMotion: true, videoCaps: videoCapsBlock(VIDEO_LIMITS[provider]) },
  unavailableFor: (i) => noDraft('LTX')(i) ?? (model !== 'ltx-2-5-pro' && /^(1440p|4k)$/i.test(String(i.resolution ?? '')) && Number(i.duration) > 10 ? 'LTX makes 1440p and 4K clips of 6, 8 or 10 s' : null) });
export const NATIVE_DIRECT: Record<string, Partial<RouteDef>> = {
  'direct-minimax-speech-turbo': { vendor: 'minimax', label: 'MiniMax Speech 2.8 Turbo via MiniMax API', endpoint: 'POST https://api.minimax.io/v1/t2a_v2 (model speech-2.8-turbo, Bearer, output_format url)',
    sourceUrl: 'https://platform.minimax.io/docs/api-reference/speech-t2a-http', checkedAt: D, typicalLatencySec: 5, direct: minimaxSpeechSpec('speech-2.8-turbo', 'direct-minimax-speech-turbo') },
  'direct-minimax-image': { vendor: 'minimax', label: 'MiniMax image-01 via MiniMax API', endpoint: 'POST https://api.minimax.io/v1/image_generation (model image-01, Bearer, response_format url)', output: 'image', modes: ['generate'],
    sourceUrl: 'https://platform.minimax.io/docs/api-reference/image-generation-t2i', checkedAt: D, typicalLatencySec: 10, direct: minimaxImageSpec, caps: { resolutions: ['1K'], maxRefs: 0 } },
  'direct-ltx-25-pro': ltxNative('ltx-2-5-pro', 'LTX-2.5 Pro', 'direct-ltx-25-pro'),
  'direct-ltx-25-fast': ltxNative('ltx-2-5-fast', 'LTX-2.5 Fast', 'direct-ltx-25-fast'),
  'direct-ltx-23-fast': ltxNative('ltx-2-3-fast', 'LTX-2.3 Fast', 'direct-ltx-23-fast'),
  'direct-flux3-video': { vendor: 'bfl', label: 'FLUX 3 Video via BFL API', endpoint: 'POST https://api.bfl.ai/v1/flux-3-video (x-key; poll polling_url)', output: 'video', modes: ['t2v', 'i2v', 'flf'],
    sourceUrl: 'https://docs.bfl.ml/flux_3/flux3_video', checkedAt: D, typicalLatencySec: 120, direct: bflVideoSpec,
    caps: { audio: true, audioBadge: 'Audio on', firstLastFrame: true, draft: '720p preview at $0.06/s', videoCaps: videoCapsBlock(VIDEO_LIMITS['direct-flux3-video']) } },
  'direct-flux2-flex': { vendor: 'bfl', label: 'FLUX.2 [flex] via BFL API', endpoint: 'POST https://api.bfl.ai/v1/flux-2-flex (x-key; poll polling_url)', output: 'image', modes: ['generate'],
    sourceUrl: 'https://docs.bfl.ml/api-reference/models/generate-or-edit-an-image-with-flux2-[flex]', checkedAt: D, typicalLatencySec: 25, caps: { resolutions: ['1K'], maxRefs: 0 },
    unavailableFor: (i) => (refsOf(i).length ? 'Jobs with reference images run on the FLUX.2 [flex] edit route' : null),
    direct: bflSpec(async (job) => { const i = job.input; return bflFlexRequest({ prompt: promptOf(i), ...oneMpWH(i.aspect), seed: seedOf(i) }); }) },
  'direct-flux2-klein-9b': { ...klein2('9b', 'direct-flux2-klein-9b', false), routeId: 'direct:direct-flux2-klein-9b', priceRef: 'direct-flux2-klein-9b' },
  ...GEMINI_NATIVE, ...BYTEPLUS_NATIVE,
};
