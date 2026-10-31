/**
 * Official Comfy templates from comfy.org/workflows "Most popular" (2026-10-27): the ones the app was missing, wired as models on the tabs
 * that already do the job. One file, so the wiring sits in one place (imported once, tools/registry.ts, after every tool is built).
 *  - Gemini Omni 1.1 Flash · Comfy Cloud (Create Video: text, image, start + end frame): the GeminiVideoOmniV2 partner node (comfy/geminiOmniCloud.ts).
 *  - Topaz Bloom 2 · Comfy Cloud (Image › Upscale): the TopazImageEnhanceV2 partner node (comfy/topazImageCloud.ts); same model card as the fal place.
 *  - Wan Animate 2 · Comfy Cloud (Video › Motion Control): open weights, core nodes (comfy/wanAnimate2Cloud.ts); held until its GPU price is measured.
 *  - FLUX 3 Max (Create Video: text, start frame, start + end, up to 10 keyframes): the Flux3Max partner nodes on Comfy Cloud, and text at 720p on
 *    Comfy Router fal/flux-3-max (comfy/flux3MaxCloud.ts). One card, place "Comfy".
 *  - Kling 4.0 · Comfy Cloud (Create Video: text, start frame, start + end, 2–10 keyframes, 1–10 reference images; 3–30 s, sound always on): the Kling4 partner
 *    nodes (comfy/kling4Cloud.ts), official templates api_kling4_t2v / i2v / r2v (2026-10-31).
 *  - Product Advertisement Video: a chain on the Workflows page (shared/workflowCatalog.ts WF_CHAINS 'product-ad-multishot'), not a model.
 * Prices: shared/hostedPrices.ts (block "Official Comfy templates"). Model keys: shared/modelIds.ts (same header). Credits: shared/modelLinks.ts.
 * Nothing here was run against a paid API: graphs are checked against Comfy Cloud's object_info in test/comfy-featured.test.ts.
 */
import { registerProvider } from '../providers.js';
import { registerWorkflowLicense } from '../licenses.js';
import { registerModelInfo } from '../models.js';
import { MODEL_CATALOG } from '../shared/modelCatalog.js';
import { CLOUD_WORKFLOWS } from '../comfy/cloudWorkflows.js';
import { CLOUD_RUNNER_ROUTES } from '../routing/runnable.js';
import { NATIVE_DIRECT } from '../routing/directRoutes.js';
import { ROUTE_VIDEO_CAPS } from '../routing/videoRouteCaps.js';
import { VIDEO_LIMITS, BITRATES, type VideoLimits } from './h3/videoCaps.js';
import { h3VideoTool } from './media.js';
import { motionTransferTool } from './videoSwap.js';
import { OMNI_PROVIDER, OMNI_ROUTE, OMNI_NODE, OMNI_NAME, OMNI_DOC, OMNI_TEMPLATE_URL, OMNI_RESOLUTIONS, OMNI_SECONDS, OMNI_DEFAULT_SECONDS, OMNI_MODES, omniIssue, omniCloudPlan, prepareOmniCloud } from '../comfy/geminiOmniCloud.js';
import { BLOOM_PROVIDER, BLOOM_ROUTE, BLOOM_NODE, BLOOM_DOC, bloomCloudPlan } from '../comfy/topazImageCloud.js';
import { F3M_PROVIDER, F3M_ROUTE, F3M_ROUTER_ROUTE, F3M_ROUTER_ID, F3M_ROUTER_DOC, F3M_NAME, F3M_DOC, F3M_T2V_NODE, F3M_I2V_NODE, F3M_SECONDS, F3M_DEFAULT_SECONDS, F3M_RESOLUTIONS, F3M_ASPECTS, F3M_MAX_KEYFRAMES, F3M_MODES,
  f3mCloudIssue, f3mRouterIssue, f3mCloudPlan, f3mRouterBody, f3mRouterOutputs } from '../comfy/flux3MaxCloud.js';
import { K4_PROVIDER, K4_ROUTE, K4_NAME, K4_PR, K4_T2V_NODE, K4_I2V_NODE, K4_R2V_NODE, K4_SECONDS, K4_DEFAULT_SECONDS, K4_RESOLUTIONS, K4_ASPECTS, K4_MAX_IMAGES, K4_MAX_VIDEOS, K4_REF_VIDEO_SECONDS, K4_REF_VIDEO_FRAME, K4_MODES, K4_KEYFRAMES, k4Issue, k4PriceInput, k4CloudPlan } from '../comfy/kling4Cloud.js';
import { ROUTER_MODELS, ROUTER_RUNNER_ROUTES } from '../routing/routerModels.js';
import { EXTRA_ROUTES, routerPlace } from '../routing/routes.js';
import { WA2_PROVIDER, WA2_ROUTE, WA2_NAME, WA2_DOC, WA2_GRAPH_FILE, WA2_REQUIRES, WA2_MIN_SECONDS, WA2_MAX_SECONDS, WA2_WINDOW, WA2_FPS, wa2Issue, wa2Windows, wa2CloudPlan, prepareWa2Cloud } from '../comfy/wanAnimate2Cloud.js';

const D = '2026-10-27';
const stages = (label: string): [string, string][] => [['uploading', 'Uploading'], ['submitted', `Submitted to ${label}`], ['rendering', `${label} rendering`], ['downloading', 'Downloading result']];

// ---------- Gemini Omni 1.1 Flash · Comfy Cloud (Create Video) ----------
registerProvider({ id: OMNI_PROVIDER, name: `${OMNI_NAME} · Comfy Cloud`, kind: 'hosted', license: 'proprietary', licenseUrl: 'https://ai.google.dev/gemini-api/terms', docUrl: OMNI_DOC,
  via: `Comfy partner node ${OMNI_NODE} (model "Omni Flash 1.1") on Comfy Cloud, Comfy key in extra_data; graph from the official template ${OMNI_TEMPLATE_URL} (comfy/geminiOmniCloud.ts); sample output without a key`,
  stages: stages('Comfy Cloud'), nodes: [OMNI_NODE] } as any);
CLOUD_WORKFLOWS[OMNI_ROUTE] = { routeId: OMNI_ROUTE, provider: OMNI_PROVIDER, standalone: true, target: 'cloud', label: `${OMNI_NAME} · Comfy Cloud (partner node)`,
  graphs: [], requires: { nodes: ['LoadImage', OMNI_NODE, 'SaveVideo'], models: [] }, plan: omniCloudPlan, prepare: prepareOmniCloud, partnerAuth: true };
CLOUD_RUNNER_ROUTES.add(OMNI_ROUTE);
VIDEO_LIMITS[OMNI_PROVIDER] = { maxResolution: '4K', resolutions: [...OMNI_RESOLUTIONS], defaultSeconds: OMNI_DEFAULT_SECONDS, minSeconds: 3, maxSeconds: 10, durationStep: 1, durations: [...OMNI_SECONDS],
  aspects: ['auto', '16:9', '9:16'], audio: { supported: true, toggle: true, default: true, priceAffects: false, off: 'strip' }, refKinds: { image: 1 }, bitrate: BITRATES.map((b) => b.value), bitratePriceAffects: false,
  qualityOff: true /* Omni Flash 1.1 runs fixed settings (no Fast / Best) */, verified: true, source: `${OMNI_DOC} (Comfy Cloud object_info 2026-10-26: Omni Flash 1.1 resolution 360p / 720p / 1080p / 4k, aspect 16:9 / 9:16, length 3–10 s asked in the prompt, always with sound; 360p not offered yet)` } satisfies VideoLimits;
ROUTE_VIDEO_CAPS[OMNI_ROUTE] = { durations: [...OMNI_SECONDS], minSeconds: 3, maxSeconds: 10, aspects: ['auto', '16:9', '9:16'], resolutions: [...OMNI_RESOLUTIONS],
  audio: { supported: true, toggle: true, default: true, passthrough: false }, refKinds: ['image'], refMax: { image: 1 }, sourceUrl: OMNI_DOC, checkedAt: D, verified: true,
  note: 'The length is asked for in the prompt (the node has no length input); start + end frame sends two images.' };
NATIVE_DIRECT[OMNI_PROVIDER] = { label: 'Comfy Cloud', endpoint: `POST https://cloud.comfy.org/api/v2/jobs (graph: LoadImage → ${OMNI_NODE} → SaveVideo)`, sourceUrl: OMNI_TEMPLATE_URL, checkedAt: D,
  typicalLatencySec: 150, latencyEstimated: true, latencySource: 'estimated', output: 'video', unavailableFor: omniIssue } as any;
h3VideoTool.providers.push(OMNI_PROVIDER);
(h3VideoTool as any).app.providerModes[OMNI_PROVIDER] = [...OMNI_MODES]; // the same object makeMediaTool's parser reads
registerModelInfo(OMNI_PROVIDER, { name: OMNI_NAME, speed: 'balanced', quality: 'best', hint: 'Text, a start frame or start + end frames; sound included · 3–10 s', badges: ['premium'] } as any);
MODEL_CATALOG[OMNI_PROVIDER] = { name: OMNI_NAME, family: 'Gemini', description: 'Google’s video model on Comfy Cloud: from text, a start frame, or start and end frames to a 16:9 or 9:16 clip with sound, 3–10 s, 720p to 4K.',
  tech: `Official Comfy template ${OMNI_TEMPLATE_URL}; node ${OMNI_NODE}.` };

// ---------- Topaz Bloom 2 · Comfy Cloud (Image › Upscale) ----------
registerProvider({ id: BLOOM_PROVIDER, name: 'Topaz Bloom 2 · Comfy Cloud', kind: 'hosted', license: 'proprietary', licenseUrl: 'https://www.topazlabs.com/terms-of-use', docUrl: BLOOM_DOC,
  via: `Comfy partner node ${BLOOM_NODE} (model "Bloom 2") on Comfy Cloud, Comfy key in extra_data; graph from the official template api_topaz_image_enhance_bloom2 (comfy/topazImageCloud.ts); sample output without a key`,
  stages: stages('Comfy Cloud'), nodes: [BLOOM_NODE] } as any);
CLOUD_WORKFLOWS[BLOOM_ROUTE] = { routeId: BLOOM_ROUTE, provider: BLOOM_PROVIDER, standalone: true, target: 'cloud', label: 'Topaz Bloom 2 · Comfy Cloud (partner node)',
  graphs: [], requires: { nodes: ['LoadImage', BLOOM_NODE, 'SaveImageAdvanced'], models: [] }, plan: bloomCloudPlan, partnerAuth: true };
CLOUD_RUNNER_ROUTES.add(BLOOM_ROUTE);
NATIVE_DIRECT[BLOOM_PROVIDER] = { label: 'Comfy Cloud', endpoint: `POST https://cloud.comfy.org/api/v2/jobs (graph: LoadImage → ${BLOOM_NODE} → SaveImageAdvanced)`, sourceUrl: BLOOM_DOC, checkedAt: D,
  typicalLatencySec: 60, latencyEstimated: true, latencySource: 'estimated', output: 'image', caps: { factors: [2, 4] } } as any;
registerModelInfo(BLOOM_PROVIDER, { name: 'Topaz Bloom 2', speed: 'balanced', quality: 'best', hint: 'Creative upscale that adds fine detail · ×2 or ×4', badges: ['premium'] } as any);
MODEL_CATALOG[BLOOM_PROVIDER] = { name: 'Topaz Bloom 2', family: 'Topaz', description: 'Topaz Bloom 2 on Comfy Cloud: a creative upscale that adds fine detail and texture, best on AI images and soft art. Small things can change.',
  tech: 'Official Comfy template api_topaz_image_enhance_bloom2; node TopazImageEnhanceV2 (creativity 3, colours kept).' };

// ---------- Wan Animate 2 · Comfy Cloud (Video › Motion Control) ----------
registerWorkflowLicense(WA2_GRAPH_FILE, ['apache-2.0']);
registerProvider({ id: WA2_PROVIDER, name: `${WA2_NAME} · Comfy Cloud`, kind: 'hosted', license: 'apache-2.0', licenseUrl: 'https://huggingface.co/Comfy-Org/Wan-Animate-2', docUrl: WA2_DOC,
  via: `Comfy Cloud workflow job (API v2): the official template video_wan_animate2 flattened to core nodes (comfy/wanAnimate2Cloud.ts, reference copy workflows/${WA2_GRAPH_FILE}); price not measured yet: sample output only`,
  stages: stages('Comfy Cloud'), workflows: [WA2_GRAPH_FILE], nodes: WA2_REQUIRES.nodes } as any);
CLOUD_WORKFLOWS[WA2_ROUTE] = { routeId: WA2_ROUTE, provider: WA2_PROVIDER, standalone: true, target: 'cloud', label: `${WA2_NAME} · Comfy Cloud`,
  graphs: [WA2_GRAPH_FILE], requires: WA2_REQUIRES, plan: wa2CloudPlan, prepare: prepareWa2Cloud };
CLOUD_RUNNER_ROUTES.add(WA2_ROUTE);
/** Billed seconds: what the windows render (3.33 s each at 24 fps), not the clip's own length. */
export const wa2BillSeconds = (i: Record<string, any>) => Math.round((wa2Windows(Number(i.duration) || 3) * (WA2_WINDOW - 1) / WA2_FPS) * 100) / 100;
NATIVE_DIRECT[WA2_PROVIDER] = { label: 'Comfy Cloud', sourceUrl: WA2_DOC, checkedAt: D, typicalLatencySec: 300, latencyEstimated: true, latencySource: 'estimated', output: 'video', unavailableFor: wa2Issue,
  priceInput: (i: Record<string, any>) => ({ ...i, duration: wa2BillSeconds(i), resolution: '480p' }) } as any;
VIDEO_LIMITS[WA2_PROVIDER] = { maxResolution: '480p', resolutions: ['480p'], defaultSeconds: 4, minSeconds: 4, maxSeconds: WA2_MAX_SECONDS, durationStep: 1, durations: Array.from({ length: WA2_MAX_SECONDS - 3 }, (_, k) => k + 4),
  aspects: ['auto'], audio: { supported: true, toggle: true, default: true, priceAffects: false, off: 'strip' }, refKinds: { image: 1 }, bitrate: BITRATES.map((b) => b.value), bitratePriceAffects: false,
  qualityOff: true, verified: true, source: `${WA2_DOC} (official template video_wan_animate2: 81-frame windows, 480p; our 24 fps, up to 3 windows = 10 s; min ${WA2_MIN_SECONDS} s, the swap range's 4 s)` } satisfies VideoLimits;
ROUTE_VIDEO_CAPS[WA2_ROUTE] = { durations: null, minSeconds: 4, maxSeconds: WA2_MAX_SECONDS, aspects: null, resolutions: ['480p'], audio: { supported: true, toggle: true, default: true, passthrough: true },
  refKinds: ['video', 'image'], refMax: { video: 1, image: 1 }, sourceUrl: WA2_DOC, checkedAt: D, verified: true, note: 'Output length = the clip (up to 10 s); billed per 3.33 s window.' };
motionTransferTool.providers.push(WA2_PROVIDER);
registerModelInfo(WA2_PROVIDER, { name: WA2_NAME, speed: 'slow', quality: 'best', hint: 'Your character does the clip’s moves; no pose tracking needed · up to 10 s, 480p', badges: [] } as any);
MODEL_CATALOG[WA2_PROVIDER] = { name: WA2_NAME, family: 'Wan', description: 'Wan Animate 2 open weights (Wan team, Apache-2.0) on Comfy Cloud: the character in your image performs the motion of your clip, keeping its look, with the clip’s own sound. Up to 10 s at 480p.',
  tech: `Official Comfy template video_wan_animate2 (${WA2_DOC}); 81-frame windows chained.` };

// ---------- FLUX 3 Max · Comfy Cloud + Comfy Router (Create Video) ----------
// Native = the partner nodes on Comfy Cloud (every mode); Comfy Router fal/flux-3-max is a second Comfy place for text to video at 720p (its one published
// rate, half the node's). Keyframes: start frame (i2v), start + end (flf), and the reference slots as 1–10 keyframes in order (r2v), spread across the
// clip, or pinned with the API field keyframeTimes ("0, 2.5, 5"). reasoning_level: API field reasoning=low|high (default high, same price).
registerProvider({ id: F3M_PROVIDER, name: `${F3M_NAME} · Comfy`, kind: 'hosted', license: 'proprietary', licenseUrl: 'https://bfl.ai/legal/terms-of-service', docUrl: F3M_DOC,
  via: `Comfy partner nodes ${F3M_T2V_NODE} / ${F3M_I2V_NODE} on Comfy Cloud (Comfy key in extra_data; graphs from the official templates api_flux3_max_t2v / api_flux3_max_i2v) and Comfy Router ${F3M_ROUTER_ID} for text at 720p (comfy/flux3MaxCloud.ts); sample output without a key`,
  stages: stages('Comfy'), nodes: [F3M_T2V_NODE, F3M_I2V_NODE] } as any);
CLOUD_WORKFLOWS[F3M_ROUTE] = { routeId: F3M_ROUTE, provider: F3M_PROVIDER, standalone: true, target: 'cloud', label: `${F3M_NAME} · Comfy Cloud (partner node)`,
  graphs: [], requires: { nodes: ['LoadImage', F3M_T2V_NODE, F3M_I2V_NODE, 'SaveVideo'], models: [] }, plan: f3mCloudPlan, partnerAuth: true };
CLOUD_RUNNER_ROUTES.add(F3M_ROUTE);
ROUTER_MODELS[F3M_PROVIDER] = { name: F3M_NAME, tools: ['h3-video'], id: F3M_ROUTER_ID, doc: F3M_ROUTER_DOC, out: 'video', queue: true, maxRefs: 0, block: f3mRouterIssue, body: async (i) => f3mRouterBody(i), outputs: f3mRouterOutputs };
ROUTER_RUNNER_ROUTES.add(F3M_ROUTER_ROUTE);
const F3M_AUDIO = { supported: true, toggle: true, default: true, priceAffects: false, off: 'provider' } as const;
VIDEO_LIMITS[F3M_PROVIDER] = { maxResolution: '1080p', resolutions: ['720p', '1080p'], defaultSeconds: F3M_DEFAULT_SECONDS, minSeconds: 5, maxSeconds: 20, durationStep: 1, durations: [...F3M_SECONDS],
  aspects: [...F3M_ASPECTS], audio: { ...F3M_AUDIO }, refKinds: { image: F3M_MAX_KEYFRAMES }, bitrate: BITRATES.map((b) => b.value), bitratePriceAffects: false,
  qualityOff: true /* fixed settings: no Fast / Best */, verified: true, source: `${F3M_DOC} + Comfy Cloud object_info 2026-10-26 (${F3M_T2V_NODE} / ${F3M_I2V_NODE}: 5–20 s, 720p / 1080p, auto + 7 shapes, 1–10 keyframes spread or at times, reasoning low / high, sound on by default)` } satisfies VideoLimits;
ROUTE_VIDEO_CAPS[F3M_ROUTE] = { durations: [...F3M_SECONDS], minSeconds: 5, maxSeconds: 20, aspects: [...F3M_ASPECTS], resolutions: [...F3M_RESOLUTIONS],
  audio: { supported: true, toggle: true, default: true, passthrough: false }, refKinds: ['image'], refMax: { image: F3M_MAX_KEYFRAMES }, sourceUrl: F3M_DOC, checkedAt: D, verified: true,
  note: 'Keyframes: one image opens the clip, two are its first and last frame, more are spread across it (or pinned to seconds you give).' };
ROUTE_VIDEO_CAPS[F3M_ROUTER_ROUTE] = { durations: [...F3M_SECONDS], minSeconds: 5, maxSeconds: 20, aspects: [...F3M_ASPECTS], resolutions: ['720p'],
  audio: { supported: true, toggle: true, default: true, passthrough: false }, refKinds: [], refMax: {}, sourceUrl: F3M_ROUTER_DOC, checkedAt: D, verified: true, note: 'Text to video at 720p (the rate Comfy Router publishes).' };
NATIVE_DIRECT[F3M_PROVIDER] = { label: 'Comfy Cloud', endpoint: `POST https://cloud.comfy.org/api/v2/jobs (graph: LoadImage × 1–10 → ${F3M_I2V_NODE} → SaveVideo, or ${F3M_T2V_NODE} → SaveVideo)`, sourceUrl: F3M_DOC, checkedAt: D,
  typicalLatencySec: 240, latencyEstimated: true, latencySource: 'estimated', output: 'video', unavailableFor: f3mCloudIssue,
  caps: { audio: true, firstLastFrame: true, keyframes: F3M_MAX_KEYFRAMES, placement: ['spread', 'at times'], reasoning: ['low', 'high'], partnerNode: F3M_I2V_NODE } } as any;
// The Router place's rule holds with or without a key (unlike other Router places), so a sample's list price is the place a real run would use.
EXTRA_ROUTES[F3M_PROVIDER] = [...(EXTRA_ROUTES[F3M_PROVIDER] ?? []), { ...routerPlace(F3M_PROVIDER, { audio: true, resolutions: ['720p'], note: 'Text to video at 720p' },
  { modes: ['t2v'], checkedAt: D, typicalLatencySec: 240 }), unavailableFor: f3mRouterIssue }];
h3VideoTool.providers.push(F3M_PROVIDER);
{ const a: any = h3VideoTool.inputs.find((x: any) => x.name === 'aspect'); if (a) for (const x of F3M_ASPECTS) if (!a.options.includes(x)) a.options.push(x); } // 2:1 is FLUX 3 Max's own shape: the tool's aspect list (quote/submit check) takes what its bar offers
(h3VideoTool as any).app.providerModes[F3M_PROVIDER] = [...F3M_MODES];
{ // keyframe times and reasoning level ride on the job (API fields; the bar has no control for them yet)
  const p = h3VideoTool.parseInput.bind(h3VideoTool);
  h3VideoTool.parseInput = async (fields: Record<string, string>, files: Record<string, string[]>) => { const r: any = await p(fields, files);
    if (r && !r.error && (fields.provider === F3M_PROVIDER || r.provider === F3M_PROVIDER)) { if (fields.keyframeTimes) r.keyframeTimes = String(fields.keyframeTimes); if (fields.reasoning) r.reasoning = String(fields.reasoning) === 'low' ? 'low' : 'high'; }
    return r; };
}
registerModelInfo(F3M_PROVIDER, { name: F3M_NAME, speed: 'balanced', quality: 'best', hint: 'Text or up to 10 keyframes to one shot with sound · 5–20 s', badges: ['premium'] } as any);
MODEL_CATALOG[F3M_PROVIDER] = { name: F3M_NAME, family: 'FLUX', description: 'Black Forest Labs’ FLUX 3 Max on Comfy: text, a start frame, start and end frames, or up to 10 keyframes to one shot with its own sound, 5–20 s at 720p or 1080p.',
  tech: `Official Comfy templates api_flux3_max_t2v / api_flux3_max_i2v (nodes ${F3M_T2V_NODE} / ${F3M_I2V_NODE}); Comfy Router ${F3M_ROUTER_ID} for text at 720p.` };

// ---------- Kling 4.0 · Comfy Cloud (Create Video, 2026-10-31) ----------
// Not on Comfy Router yet (Kling 3.0 Omni is), so the partner nodes run on Comfy Cloud like FLUX 3 Max. Sound is always on: no switch that does nothing.
{ const K4D = '2026-10-31';
  registerProvider({ id: K4_PROVIDER, name: `${K4_NAME} · Comfy Cloud`, kind: 'hosted', license: 'proprietary', licenseUrl: 'https://kling.ai/document-api', docUrl: K4_PR,
    via: `Comfy partner nodes ${K4_T2V_NODE} / ${K4_I2V_NODE} / ${K4_R2V_NODE} (model "kling-4.0") on Comfy Cloud, Comfy key in extra_data; graphs from the official templates api_kling4_t2v / i2v / r2v (comfy/kling4Cloud.ts); sample output without a key`,
    stages: stages('Comfy Cloud'), nodes: [K4_T2V_NODE, K4_I2V_NODE, K4_R2V_NODE] } as any);
  CLOUD_WORKFLOWS[K4_ROUTE] = { routeId: K4_ROUTE, provider: K4_PROVIDER, standalone: true, target: 'cloud', label: `${K4_NAME} · Comfy Cloud (partner node)`,
    graphs: [], requires: { nodes: ['LoadImage', 'LoadVideo', K4_T2V_NODE, K4_I2V_NODE, K4_R2V_NODE, 'SaveVideo'], models: [] }, plan: k4CloudPlan, partnerAuth: true };
  CLOUD_RUNNER_ROUTES.add(K4_ROUTE);
  VIDEO_LIMITS[K4_PROVIDER] = { maxResolution: '1080p', resolutions: [...K4_RESOLUTIONS], defaultSeconds: K4_DEFAULT_SECONDS, minSeconds: 3, maxSeconds: 30, durationStep: 1, durations: [...K4_SECONDS],
    aspects: [...K4_ASPECTS], audio: { supported: true, toggle: false, default: true, priceAffects: false, off: 'provider' }, refKinds: { image: K4_MAX_IMAGES, video: K4_MAX_VIDEOS }, bitrate: BITRATES.map((b) => b.value), bitratePriceAffects: false,
    refVideoSeconds: { ...K4_REF_VIDEO_SECONDS, billed: 'a price range: the most is quoted (≈ up to)' }, refVideoFrame: K4_REF_VIDEO_FRAME,
    keyframes: K4_KEYFRAMES /* first + up to 8 middle + last, spaced evenly by the node */, qualityOff: true /* one model, no Fast / Best */, verified: true, source: `${K4_PR} (Kling4 nodes: 3–30 s, 720p / 1080p, text aspect 16:9 / 9:16 / 1:1 / 21:9, reference adaptive + those, up to 10 images ≥ 300 px at 2:5–5:2, stereo sound in every clip)` } satisfies VideoLimits;
  ROUTE_VIDEO_CAPS[K4_ROUTE] = { durations: [...K4_SECONDS], minSeconds: 3, maxSeconds: 30, aspects: [...K4_ASPECTS], resolutions: [...K4_RESOLUTIONS],
    audio: { supported: true, toggle: false, default: true, passthrough: false }, refKinds: ['image', 'video'], refMax: { image: K4_MAX_IMAGES, video: K4_MAX_VIDEOS }, sourceUrl: K4_PR, checkedAt: K4D, verified: true,
    note: 'Image to video takes the start frame’s shape; every clip has stereo sound. Reference videos make the price a range: the most is quoted.' };
  NATIVE_DIRECT[K4_PROVIDER] = { label: 'Comfy Cloud', endpoint: `POST https://cloud.comfy.org/api/v2/jobs (graph: ${K4_T2V_NODE} | LoadImage → ${K4_I2V_NODE} | LoadImage × 1–10 → ${K4_R2V_NODE}, then SaveVideo)`, sourceUrl: K4_PR, checkedAt: K4D,
    typicalLatencySec: 240, latencyEstimated: true, latencySource: 'estimated', output: 'video', unavailableFor: k4Issue, priceInput: k4PriceInput,
    caps: { audio: true, firstLastFrame: true, keyframes: K4_KEYFRAMES.max, references: K4_MAX_IMAGES, referenceVideos: K4_MAX_VIDEOS, partnerNode: K4_I2V_NODE } } as any;
  h3VideoTool.providers.push(K4_PROVIDER);
  (h3VideoTool as any).app.providerModes[K4_PROVIDER] = [...K4_MODES];
  registerModelInfo(K4_PROVIDER, { name: K4_NAME, speed: 'balanced', quality: 'best', hint: 'Text, frames or up to 10 references to video with stereo sound · 3–30 s', badges: ['premium'] } as any);
  MODEL_CATALOG[K4_PROVIDER] = { name: K4_NAME, family: 'Kling', description: 'Kuaishou Kling 4.0 on Comfy Cloud: text, a start frame, start and end frames, or up to 10 reference images to a 3–30 s clip with stereo sound, at 720p or 1080p. Reference to video also takes up to 5 reference videos.',
    tech: `Comfy partner nodes ${K4_T2V_NODE} / ${K4_I2V_NODE} / ${K4_R2V_NODE} (${K4_PR}); official Comfy templates api_kling4_t2v / i2v / r2v.` }; }
