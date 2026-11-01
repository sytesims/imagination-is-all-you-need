/**
 * Edit Video tools backend (New Agent queue, 2026-10-17). Additive: new tools + routes + prices live here; existing tools are reused.
 *   existing: Extend (h3-extend), Upscale (upscale), Re-shoot (reshoot)  → listed + small additive caps (Extend direction, Upscale 2K target + fal SeedVR2 route)
 *   new:      Reframe, Remove Background, SDR to HDR, FPS Boost, Depth Map
 * Pricing: official prices only (1 credit = $0.01), local = 0, routes without a published fixed price are usd:null (listed, never run/charged).
 * Routing: same cloud-first rules as routing/select.ts (Auto = cheapest keyed cloud; local only with useLocal or a local pin; no key → 402 no_provider).
 * Nothing here downloads or installs anything: local graphs reference weights that are manifest entries only.
 */
import path from 'node:path';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { registerProvider } from '../../providers.js';
import { registerWorkflowLicense, registerLicense } from '../../licenses.js';
import { HOSTED_BY_ID, PRICING_TABLE_EXTRA, type HostedPrice } from '../../shared/hostedPrices.js';
import { EXTRA_ROUTES, FAL_ENV, COMING_SOON, routerPlace } from '../../routing/routes.js';
import { RAY32_REFRAME_RES, RAY32_REFRAME_MAX_SEC, RAY32_ASPECTS, BRIA_VIDEO_MAX_SEC } from '../../routing/routerModels.js';
import { postEncode, BITRATES } from '../h3/videoCaps.js';
import type { RouteDef } from '../../routing/types.js';
import type { ToolDef } from '../types.js';
import { makeApp, upscaleApp } from '../apps.js';
import { h3ExtendTool } from '../h3/index.js';
import { mockRun } from '../shared.js';
import { runFfmpeg } from '../../ffmpeg.js';
import { DATA_DIR, config } from '../../config.js';
import { applyVideoUpscale } from '../videoUpscaleModels.js';
import { handOff } from '../../mediaHandoff.js';
import { EXTEND_DIRECTIONS, withExtendDirection } from '../../shared/extendPrompt.js';

const D = '2026-10-17' as const;
const bad = (field: string, message: string, code = 'invalid') => ({ error: message, issues: [{ code, field, message }] }) as any;

// ---------- Prices (official pages read 2026-10-17) ----------
export const EDIT_VIDEO_PRICES: HostedPrice[] = [
  // Reframe on fal (2026-10-31): Luma Ray 3.2 Reframe replaces Ray 2 / Ray 2 Flash, which fal retires on 2026-11-05. Listed in the /api/pricing table (PRICING_TABLE_EXTRA).
  { providerId: 'fal:luma/agent/ray/v3.2/reframe', model: 'Luma Ray 3.2 Reframe (fal)', unit: 'second', usd: 0.12, usdByQuality: { '540p': 0.06, '720p': 0.12, '1080p': 0.36 }, sourceUrl: 'https://fal.ai/models/luma/agent/ray/v3.2/reframe', checkedAt: '2026-10-31', estimated: false,
    note: 'fal: $0.06 / $0.12 / $0.36 per started second of source clip at 540p / 720p / 1080p. We send 720p (High) or 540p (Fast).' },
  { providerId: 'fal:bria/video/background-removal', model: 'Bria Video Background Removal (fal)', unit: 'second', usd: 0.14, sourceUrl: 'https://fal.ai/models/bria/video/background-removal', checkedAt: D, estimated: false, note: '"Your request will cost $0.14 per second." Input < 4000×4000 and < 30 s.' },
  { providerId: 'fal:fal-ai/seedvr/upscale/video', model: 'SeedVR2 video upscale (fal)', unit: 'mp_second', usd: 0.024, sourceUrl: 'https://fal.ai/models/fal-ai/seedvr/upscale/video', checkedAt: D, estimated: true, note: '"$0.001 per megapixel of video data (width × height × frames)" = $0.001 × fps per output-MP-second; applied at 24 fps (a 30 fps clip bills 25% more on fal).' },
  { providerId: 'fal:fal-ai/rife/video', model: 'RIFE video interpolation (fal)', unit: 'second', usd: null, estimateUsd: 0.005, estimateNote: 'fal bills $0.0013 per compute second; estimated at under 4 compute seconds per second of clip (an estimate on the safe side).', sourceUrl: 'https://fal.ai/models/fal-ai/rife/video', checkedAt: D, estimated: true, note: '"$0.0013 per compute second": billed by GPU time, no fixed per-clip price, so it runs on an estimate.' },
];
for (const p of EDIT_VIDEO_PRICES) if (!HOSTED_BY_ID[p.providerId]) HOSTED_BY_ID[p.providerId] = p;
for (const p of EDIT_VIDEO_PRICES) if (/\/reframe$/.test(p.providerId) && !PRICING_TABLE_EXTRA.includes(p)) PRICING_TABLE_EXTRA.push(p); // the Reframe tool's price rows on /pricing

// ---------- Providers (models) ----------
const local = (id: string, name: string, workflows: string[], docUrl: string, licenseParts: string[], nodes: string[]) =>
  registerProvider({ id, name, kind: 'open-weights', via: `local ComfyUI, workflows/${workflows.join(' + ')} (mock unless OPENHIGGSFIELD_BACKEND=comfy)`, workflows, docUrl, licenseParts, nodes } as any);
registerLicense({ id: 'birefnet-mit', name: 'BiRefNet (MIT)', osi: true, url: 'https://github.com/ZhengPeng7/BiRefNet/blob/main/LICENSE' } as any);
registerLicense({ id: 'rife-mit', name: 'Practical-RIFE (MIT)', osi: true, url: 'https://github.com/hzwer/Practical-RIFE/blob/main/LICENSE' } as any);
registerLicense({ id: 'depth-anything-v2-small-apache', name: 'Depth Anything V2 Small (Apache-2.0; Base/Large are CC-BY-NC-4.0 and not used)', osi: true, url: 'https://huggingface.co/depth-anything/Depth-Anything-V2-Small' } as any);
registerWorkflowLicense('remove-bg-birefnet-api.json', ['birefnet-mit']);
registerWorkflowLicense('fps-boost-rife-api.json', ['rife-mit']);
registerWorkflowLicense('depth-map-dav2-api.json', ['depth-anything-v2-small-apache']);
local('comfy-birefnet-video', 'BiRefNet (local, per frame)', ['remove-bg-birefnet-api.json'], 'https://github.com/ZhengPeng7/BiRefNet', ['birefnet-mit'], ['LoadRembgByBiRefNetModel', 'RembgByBiRefNetAdvanced']);
local('comfy-rife', 'RIFE 4.9 (local)', ['fps-boost-rife-api.json'], 'https://github.com/hzwer/Practical-RIFE', ['rife-mit'], ['RIFE VFI']);
local('comfy-depth-anything-v2', 'Depth Anything V2 Small (local, per frame)', ['depth-map-dav2-api.json'], 'https://github.com/DepthAnything/Depth-Anything-V2', ['depth-anything-v2-small-apache'], ['DepthAnythingV2Preprocessor']);
registerProvider({ id: 'local-ffmpeg-hdr', name: 'ffmpeg HDR10 conversion (local, not AI)', kind: 'open-weights', via: 'ffmpeg zscale/tonemap on this machine (no ComfyUI, no weights)', workflows: [], docUrl: 'https://ffmpeg.org/ffmpeg-filters.html#zscale' } as any);
registerProvider({ id: 'comfy-seedvr2', name: 'SeedVR2', kind: 'open-weights', via: 'fal fal-ai/seedvr/upscale/video; local ComfyUI (NVIDIA only) workflows/upscale-seedvr2-native-api.json (SeedVR2 3B, core nodes)', workflows: ['upscale-seedvr2-native-api.json'], docUrl: 'https://github.com/ByteDance-Seed/SeedVR', licenseParts: ['apache-2.0'] } as any);
registerProvider({ id: 'direct-luma-reframe', name: 'Luma Reframe', kind: 'hosted-direct', apiKeyEnv: 'OPENHIGGSFIELD_LUMA_API_KEY', via: 'Luma API (unpriced: listed only)', docUrl: 'https://docs.lumalabs.ai/' } as any);

// Luma's own API: Reframe price not verified → listed as unavailable (never runs, never charges). The Ray 3.2 routes below carry the job.
COMING_SOON['direct-luma-reframe'] = "Luma's own API has no confirmed Reframe price yet, so Reframe runs on the Luma Ray 3.2 routes";
// ---------- Cloud routes (fal) ----------
/** The source clip for a fal field (video_url): the shared hand-off (small inline, larger via fal's CDN upload). */
const dataUri = (file: string) => handOff(file, 'video', 'fal', { mime: 'video/mp4' });
const falRoute = (modelId: string, slug: string, label: string, sec: number, extra: Partial<RouteDef>): RouteDef => ({
  routeId: `fal:${slug}`, kind: 'fal', modelId, endpoint: slug, priceRef: `fal:${slug}`, sourceUrl: `https://fal.ai/models/${slug}/api`, checkedAt: D, typicalLatencySec: sec, latencyEstimated: true,
  latencySource: 'estimated: fal publishes no per-model latency', envKey: FAL_ENV, envAliases: ['FAL_KEY'], label: `${label} via fal`, output: 'video', ...extra });
/** Sent when the user gives no prompt (fal's Ray 3.2 Reframe requires one). */
const REFRAME_PROMPT = 'Extend the scene naturally to fill the new frame';
/** Ray 3.2 on fal: one route for both qualities (High = 720p, Fast = 540p, same as the Comfy Router place), billed per started second of the source. */
EXTRA_ROUTES['direct-luma-reframe'] = [
  falRoute('direct-luma-reframe', 'luma/agent/ray/v3.2/reframe', 'Luma Ray 3.2 Reframe', 120, { checkedAt: '2026-10-31', caps: { aspects: RAY32_ASPECTS, maxSeconds: RAY32_REFRAME_MAX_SEC, qualities: { high: '720p', fast: '540p' } },
    priceInput: (i) => ({ ...i, resolution: RAY32_REFRAME_RES(i), ...(Number(i.duration) > 0 ? { duration: Math.ceil(Number(i.duration)) } : {}) }),
    unavailableFor: (i) => (Number(i.duration) > RAY32_REFRAME_MAX_SEC ? `Luma Ray 3.2 reframes clips up to ${RAY32_REFRAME_MAX_SEC} s`
      : i.types?.[0] && !RAY32_ASPECTS.includes(String(i.types[0])) ? `Luma Ray 3.2 makes ${RAY32_ASPECTS.join(', ')}` : null),
    request: async (j) => ({ video_url: await dataUri(j.input.videoPath), prompt: String(j.input.prompt || REFRAME_PROMPT), aspect_ratio: j.input.types?.[0], resolution: RAY32_REFRAME_RES(j.input) }) }),
];
// Design Planner: default Reframe model = Auto → the keyed fal Ray 3.2 route (high → 720p, fast → 540p). No fal key → 402 no_provider.
registerProvider({ id: 'auto-reframe', name: 'Auto (Luma Ray 3.2)', kind: 'hosted-direct', apiKeyEnv: FAL_ENV, via: 'fal: Luma Ray 3.2 Reframe (720p high, 540p fast)', docUrl: 'https://fal.ai/models/luma/agent/ray/v3.2/reframe/api' } as any);
COMING_SOON['auto-reframe'] = 'Reframe runs on the Luma Ray 3.2 routes'; // the native (direct) route never runs; the routes below carry the job
EXTRA_ROUTES['auto-reframe'] = EXTRA_ROUTES['direct-luma-reframe'].map((r) => ({ ...r, modelId: 'auto-reframe' }));
EXTRA_ROUTES['comfy-birefnet-video'] = [falRoute('comfy-birefnet-video', 'bria/video/background-removal', 'Bria Background Removal', 60, {
  caps: { maxSeconds: 30, maxSize: '4000x4000', backgrounds: ['Transparent', 'Black', 'White', 'Green'] }, unavailableFor: (i) => Number(i.duration) >= 30 ? 'Bria takes clips under 30 s' : null,
  request: async (j) => ({ video_url: await dataUri(j.input.videoPath), background_color: j.input.types?.[0] === 'transparent' ? 'Transparent' : j.input.types?.[0] === 'white' ? 'White' : j.input.types?.[0] === 'black' ? 'Black' : 'Green', preserve_audio: true, output_container_and_codec: j.input.types?.[0] === 'transparent' ? 'webm_vp9' : 'mp4_h264' }) })];
EXTRA_ROUTES['comfy-rife'] = [falRoute('comfy-rife', 'fal-ai/rife/video', 'RIFE', 60, { caps: { estimate: 'GPU-time billed: runs on an estimate' }, request: async (j) => ({ video_url: await dataUri(j.input.videoPath), num_frames: Math.max(1, Number(j.input.fields?.multiplier ?? 2) - 1) }) })];
// One key runs everything (2026-10-27): Comfy Router places, first in each card (place order Comfy → other API). Bodies: routing/routerModels.ts.
//  - Remove Background (the Bria card of this engine, shared/modelIds.ts split): bria/video-edit-remove-background, $0.05 per s (fal: $0.14), clips to 60 s.
//  - Reframe (the Luma Reframe card): luma_2/ray-3.2 type video_reframe, its newer model (fal retires Ray 2 reframe on 2026-11-05): High = 720p $0.12 per s,
//    Fast = 540p $0.06 per s, clips to 10 s, shapes 16:9 9:16 1:1 4:3 3:4 21:9.
EXTRA_ROUTES['comfy-birefnet-video'] = [routerPlace('comfy-birefnet-video', { maxSeconds: BRIA_VIDEO_MAX_SEC, backgrounds: ['Transparent', 'Black', 'White', 'Green'] },
  { tools: ['remove-bg'], checkedAt: '2026-10-27', typicalLatencySec: 90, label: 'Comfy Router' }), ...EXTRA_ROUTES['comfy-birefnet-video']];
for (const id of ['direct-luma-reframe', 'auto-reframe']) EXTRA_ROUTES[id] = [routerPlace(id, { aspects: RAY32_ASPECTS, maxSeconds: RAY32_REFRAME_MAX_SEC, qualities: { high: '720p', fast: '540p' }, model: 'Luma Ray 3.2' },
  { tools: ['reframe'], checkedAt: '2026-10-27', typicalLatencySec: 120, label: 'Comfy Router · Ray 3.2', priceRef: 'comfy-router:luma-ray32-reframe', priceInput: (i) => ({ ...i, resolution: RAY32_REFRAME_RES(i) }) }), ...EXTRA_ROUTES[id]];
// SeedVR2, Topaz, FLUX Video Upscale and Crystal routes: tools/videoUpscaleModels.ts (one table: shared/videoUpscale.ts).

// ---------- Limits (videoCaps-style; enforced on submit and listed at GET /api/edit-video/tools) ----------
export interface EditLimits { minSeconds: number; maxSeconds: number; aspects?: string[]; qualities?: string[]; outputs?: string[]; verified: boolean; source: string }
export const EDIT_VIDEO_LIMITS: Record<string, EditLimits> = {
  'h3-extend': { minSeconds: 1, maxSeconds: 30, outputs: ['+5 s', '+8 s', '+10 s'], verified: true, source: 'shared upload limits (up to 30 s). The local graph and fal minimax/h3-max/extend-video need 4 s or more and add +5 / +10 s (their routes refuse the rest); H3 Extend · via last frame (Comfy Router) takes any clip and adds +5 / +8 / +10 s' },
  reframe: { minSeconds: 4, maxSeconds: RAY32_REFRAME_MAX_SEC, aspects: RAY32_ASPECTS, qualities: ['high', 'fast'], verified: true, source: 'fal luma/agent/ray/v3.2/reframe and Comfy Router Ray 3.2 (2026-10-31): aspect enum, source 10 s or less' },
  upscale: { minSeconds: 4, maxSeconds: 30, outputs: ['720p', '1080p', '1440p', '4k'], qualities: ['precise', 'creative'], verified: true, source: 'shared/videoUpscale.ts: per-model sizes (Topaz 1080p / 4K; FLUX Video Upscale ≤ 20 s)' },
  'remove-bg': { minSeconds: 4, maxSeconds: 30, outputs: ['transparent: WebM (VP9 + alpha, Opus audio)', 'green / black / white: MP4 (H.264)'], verified: true, source: 'fal bria/video/background-removal (< 30 s, < 4000×4000; webm_vp9 for Transparent)' },
  'sdr-hdr': { minSeconds: 4, maxSeconds: 30, verified: true, source: 'local ffmpeg; shared upload limits' },
  'fps-boost': { minSeconds: 4, maxSeconds: 30, outputs: ['48', '60'], verified: true, source: 'RIFE multiplier = target fps / source fps' },
  'depth-map': { minSeconds: 4, maxSeconds: 30, verified: true, source: 'local Depth Anything V2 Small; shared upload limits' },
  reshoot: { minSeconds: 4, maxSeconds: 30, verified: true, source: 'tools/reshoot.ts' },
};
const withLimits = (tool: ToolDef, extra?: (r: any, fields: Record<string, string>) => any): ToolDef => {
  const p = tool.parseInput.bind(tool);
  tool.parseInput = async (fields, files) => {
    const r: any = await p(fields, files); if ('error' in r) return r;
    const L = EDIT_VIDEO_LIMITS[tool.id]; const d = Number(r.duration);
    if (L && d && !r.ownLimits && (d < L.minSeconds || d > L.maxSeconds)) /* ownLimits: the engine checked its own source rule (LTX-2.5 Extend: any length to 60 s total) */ return bad('video', `${tool.name} takes clips of ${L.minSeconds}–${L.maxSeconds} s (yours is ${d.toFixed(1)} s).`, 'out_of_range');
    return extra ? extra(r, fields) ?? r : r;
  };
  return tool;
};
const t = (group: string, id: string, label: string, prompt = '') => ({ id, label, prompt, group });
/** Design Planner param names (DESIGN-NOTES): reframe {aspect, quality}, fps-boost {targetFps}, depth {format}, hdr {strength}; mapped onto the app's `types`. */
const aliasParam = (tool: ToolDef, param: string, extraInput?: { name: string; kind: string; options?: string[]; default?: string }) => {
  if (extraInput) tool.inputs.push(extraInput as any); else tool.inputs.push({ name: param, kind: 'select', options: (tool.inputs.find((i) => i.name === 'types') as any)?.options } as any);
  const ti: any = tool.inputs.find((i) => i.name === 'types'); if (ti) ti.required = false;
  const p = tool.parseInput.bind(tool);
  tool.parseInput = async (fields, files) => { const v = fields[param]; const opts = (ti?.options ?? []) as string[];
    if (!extraInput && v != null && v !== '') { if (!opts.includes(v)) return bad(param, `${param} must be one of ${opts.join(', ')}.`); fields = { ...fields, types: JSON.stringify([v]) }; }
    if (!fields.types) fields = { ...fields, types: JSON.stringify([opts[0]]) };
    return p(fields, files); };
};
const VIDEO_STAGES: [string, string][] = [['uploading', 'Uploading'], ['analyzing', 'Analyzing clip'], ['rendering', 'Processing frames'], ['muxing', 'Muxing audio']];

// ---------- New tools ----------
export const reframeTool = withLimits(makeApp({ id: 'reframe', name: 'Reframe', category: 'Edit Video', status: 'new', input: 'video', description: 'Change a clip to another aspect ratio; the model fills the new areas.',
  types: RAY32_ASPECTS.map((a) => t('Aspect', a, a)), prompt: true, resolutions: ['720p'], workflow: 'reframe-cloud-only', model: 'Luma Ray 3.2 Reframe (cloud only: no open local model)',
  fields: [{ name: 'quality', kind: 'select', options: [{ value: 'high', label: 'High (720p)' }, { value: 'fast', label: 'Fast (540p)' }], default: 'high' } as any], providers: ['auto-reframe', 'direct-luma-reframe'], stages: VIDEO_STAGES }));
reframeTool.workflows = [];
export const removeBgTool = withLimits(makeApp({ id: 'remove-bg', name: 'Remove Background', category: 'Edit Video', status: 'new', input: 'video', description: 'Cut the subject out of a clip: transparent, green, black or white background. Audio kept.',
  types: [t('Background', 'transparent', 'Transparent'), t('Background', 'green', 'Green screen'), t('Background', 'black', 'Black'), t('Background', 'white', 'White')], resolutions: ['720p'],
  workflow: 'remove-bg-birefnet-api.json', model: 'BiRefNet (local) / Bria (fal)', providers: ['comfy-birefnet-video'], stages: VIDEO_STAGES }));
// Transparent needs an alpha channel: WebM VP9 yuva420p (H.264 MP4 has none). input.alpha drives the mock render + output extension (tools/shared.ts).
{ const p = removeBgTool.parseInput.bind(removeBgTool); removeBgTool.parseInput = async (f, files) => { const r: any = await p(f, files); if ('error' in r) return r;
  return r.types?.[0] === 'transparent' ? { ...r, alpha: true, outFormat: 'webm', outMime: 'video/webm', outCodec: 'vp9 yuva420p' } : { ...r, alpha: false, outFormat: 'mp4', outMime: 'video/mp4', outCodec: 'h264' }; }; }
(removeBgTool as any).app = { ...(removeBgTool as any).app, outputFormats: { transparent: { ext: 'webm', mime: 'video/webm', codec: 'vp9', alpha: true }, green: { ext: 'mp4', mime: 'video/mp4', codec: 'h264', alpha: false }, black: { ext: 'mp4', mime: 'video/mp4', codec: 'h264', alpha: false }, white: { ext: 'mp4', mime: 'video/mp4', codec: 'h264', alpha: false } } };
export const sdrHdrTool = withLimits(makeApp({ id: 'sdr-hdr', name: 'SDR to HDR', category: 'Edit Video', status: 'new', input: 'video', description: 'Convert an SDR clip to an HDR10 (BT.2020 / PQ, 10-bit) file. Tone conversion, not AI detail.',
  types: [t('Target', 'hdr10', 'HDR10 (PQ)'), t('Target', 'hlg', 'HLG')], resolutions: ['1080p'], workflow: 'sdr-hdr-ffmpeg', model: 'ffmpeg zscale (local, 0 credits)', providers: ['local-ffmpeg-hdr'], stages: VIDEO_STAGES }));
sdrHdrTool.workflows = [];
export const fpsBoostTool = withLimits(makeApp({ id: 'fps-boost', name: 'FPS Boost', category: 'Edit Video', status: 'new', input: 'video', description: 'Interpolate new frames for smoother motion (48 or 60 fps).',
  types: [t('Target', '60', '60 fps'), t('Target', '48', '48 fps')], resolutions: ['1080p'], workflow: 'fps-boost-rife-api.json', model: 'RIFE 4.9 (local) / RIFE via fal (unpriced)', providers: ['comfy-rife'], stages: VIDEO_STAGES }));
export const depthMapTool = withLimits(makeApp({ id: 'depth-map', name: 'Depth Map', category: 'Edit Video', status: 'new', input: 'video', description: 'Turn a clip into a greyscale depth video (near = bright).',
  types: [t('Format', 'grey', 'Greyscale depth (near = bright)'), t('Format', 'inverted', 'Inverted greyscale (near = dark)')], resolutions: ['720p'], workflow: 'depth-map-dav2-api.json', model: 'Depth Anything V2 Small (local)', providers: ['comfy-depth-anything-v2'], stages: VIDEO_STAGES }));

/** Remove Background / Depth Map have local graphs (comfy/plans.ts removeBg, depthMap). With a real backend, reaching tool.run means the local
 *  graph could not run here (e.g. a remote ComfyUI without the native API): fail plainly, never hand back a sample clip as the result
 *  (job 44ba4440, 2026-11-01: a cartoon upload came back as a 1280×720 sample clip cut out in a circle). The mock backend keeps its samples. */
for (const tool of [removeBgTool, depthMapTool]) { const run0 = tool.run.bind(tool); tool.run = async (job: any) => {
  if (config.backend === 'mock') return run0(job);
  job.status = 'failed'; job.errorType = 'validation';
  job.error = `${tool.name} couldn't run its workflow on this ComfyUI, so nothing was made. Point the app at your own ComfyUI in Settings → Your computer, or pick another place to run it.`; }; }

/** SDR→HDR ffmpeg args (verified Oct 18 on CPU). zscale needs the INPUT colour space spelled out (tin/min/pin/rin = BT.709, limited range):
 *  without it, untagged or BT.709-tagged clips fail with "no path between colorspaces". Linearise at SDR white = npl nits, then BT.2020 +
 *  PQ (HDR10) or HLG, 10-bit, HEVC with matching VUI tags. strength 0–1 → SDR white mapped to 100–300 nits. Audio copied. */
export function hdrArgs(src: string, dst: string, o: { hlg?: boolean; strength?: number } = {}): string[] {
  const s = Number.isFinite(Number(o.strength)) ? Math.min(1, Math.max(0, Number(o.strength))) : 0.5; const npl = Math.round(100 + 200 * s);
  const tr = o.hlg ? 'arib-std-b67' : 'smpte2084';
  const vf = `zscale=tin=bt709:min=bt709:pin=bt709:rin=tv:t=linear:m=gbr:p=bt709:npl=${npl},format=gbrpf32le,zscale=p=bt2020:t=${tr}:m=bt2020nc:r=tv,format=yuv420p10le`;
  return ['-y', '-v', 'error', '-i', src, '-vf', vf, '-c:v', 'libx265', '-x265-params', `log-level=error:colorprim=bt2020:transfer=${tr}:colormatrix=bt2020nc`,
    '-color_primaries', 'bt2020', '-color_trc', tr, '-colorspace', 'bt2020nc', '-c:a', 'copy', dst];
}
/** Builds without zimg (Homebrew's ffmpeg) have no zscale. Same transform as a 33³ 3D LUT on ffmpeg's built-in filters: BT.1886 decode
 *  (gamma 2.4) at SDR white = npl nits, BT.709 → BT.2020 primaries (ITU-R BT.2087), then PQ (SMPTE ST 2084, 10 000 nits) or HLG (ARIB STD-B67,
 *  1 000 nits nominal peak, display OOTF gamma 1.2 undone so SDR white lands near 75 % signal, BT.2408). RGB in and out, YUV matrices done by scale (709 in, 2020nc out, limited range). */
export function hdrLut(o: { hlg?: boolean; strength?: number } = {}, n = 33): string {
  const s = Number.isFinite(Number(o.strength)) ? Math.min(1, Math.max(0, Number(o.strength))) : 0.5; const npl = 100 + 200 * s;
  const M = [[0.6274, 0.3293, 0.0433], [0.0691, 0.9195, 0.0114], [0.0164, 0.0880, 0.8956]];
  const pq = (nits: number) => { const y = Math.max(0, nits) / 10000; const m1 = 0.1593017578125, m2 = 78.84375, c1 = 0.8359375, c2 = 18.8515625, c3 = 18.6875; const p = y ** m1; return ((c1 + c2 * p) / (1 + c3 * p)) ** m2; };
  const hlg = (nits: number) => { const e = Math.min(1, Math.max(0, nits) / 1000) ** (1 / 1.2); const a = 0.17883277, b = 0.28466892, c = 0.55991073; return e <= 1 / 12 ? Math.sqrt(3 * e) : a * Math.log(12 * e - b) + c; };
  const enc = o.hlg ? hlg : pq; const lines = [`TITLE "Imagination Is All You Need SDR to ${o.hlg ? 'HLG' : 'HDR10'}"`, `LUT_3D_SIZE ${n}`];
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) { // .cube order: red fastest
    const lin = [r, g, b].map((v) => (v / (n - 1)) ** 2.4 * npl);
    lines.push(M.map((row) => enc(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]).toFixed(6)).join(' ')); }
  return lines.join('\n') + '\n';
}
export function hdrArgsLut(src: string, dst: string, lutPath: string, o: { hlg?: boolean } = {}): string[] {
  const tr = o.hlg ? 'arib-std-b67' : 'smpte2084';
  const vf = `scale=in_color_matrix=bt709:in_range=tv,format=gbrp16le,lut3d=file='${lutPath.replace(/'/g, "\\'")}':interp=tetrahedral,scale=out_color_matrix=bt2020:out_range=tv,format=yuv420p10le`;
  return ['-y', '-v', 'error', '-i', src, '-vf', vf, '-c:v', 'libx265', '-x265-params', `log-level=error:colorprim=bt2020:transfer=${tr}:colormatrix=bt2020nc`,
    '-color_primaries', 'bt2020', '-color_trc', tr, '-colorspace', 'bt2020nc', '-c:a', 'copy', dst];
}
let zscaleOk: Promise<boolean> | null = null;
const hasZscale = () => (zscaleOk ??= new Promise<boolean>((resolve) => { import('node:child_process').then(({ execFile }) => execFile('ffmpeg', ['-hide_banner', '-filters'], (e, out) => resolve(!e && / zscale /.test(String(out))))).catch(() => resolve(false)); }));
// SDR→HDR is a real local ffmpeg run (no ComfyUI); mock backend only labels the stages.
sdrHdrTool.run = async (job: any) => {
  if (config.backend === 'mock') return mockRun(job, VIDEO_STAGES, ['HDR'], 3000);
  job.status = 'running'; job.stage = 'rendering'; job.progress = 10;
  const out = `${job.id}-hdr.mp4`; const hlg = job.input.types?.[0] === 'hlg';
  let code: number;
  if (await hasZscale()) code = await runFfmpeg(hdrArgs(job.input.videoPath, path.join(DATA_DIR, out), { hlg, strength: job.input.strength }));
  else { const lut = path.join(DATA_DIR, `${job.id}-hdr.cube`); await writeFile(lut, hdrLut({ hlg, strength: job.input.strength }));
    try { code = await runFfmpeg(hdrArgsLut(job.input.videoPath, path.join(DATA_DIR, out), lut, { hlg })); } finally { await rm(lut, { force: true }); } }
  if (code !== 0) { job.status = 'failed'; job.errorType = 'temporary'; job.error = 'HDR conversion failed. Credits went back to your balance.'; return; }
  job.resultUrl = `/files/${out}`; job.outputs = [{ label: hlg ? 'HLG' : 'HDR10', url: job.resultUrl }]; job.progress = 100; job.status = 'done';
};

// ---------- Existing tools: additive caps ----------
// Extend (DESIGN-NOTES): direction forward|backward (+ our sequel/camera-pull), bitrate, audio, refImages[], elements[].
// H3 extend-video returns a continuation only and takes no image refs or elements: refImages / elements → 400 unsupported (no route can do them).
// backward (C8): H3 only continues forward, so we map it: the clip's first 4 s are reversed, H3 continues that (= what came before, in reverse),
// and the generated clip is reversed back into a lead-in. Generated audio would play backwards, so a backward extend is silent (audio stripped, warning).
const DIRECTIONS = EXTEND_DIRECTIONS; // the direction words, added once (shared/extendPrompt.ts)
h3ExtendTool.inputs.push({ name: 'direction', kind: 'select', options: ['forward', 'backward', 'sequel', 'camera-pull'], default: 'forward' } as any,
  { name: 'bitrate', kind: 'select', options: BITRATES.map((b) => b.value), default: 'standard' } as any, { name: 'audio', kind: 'select', options: ['1', '0'], default: '1' } as any,
  { name: 'refImages', kind: 'files', accept: 'image/png,image/jpeg,image/webp', max: 0 } as any, { name: 'elements', kind: 'list', max: 0 } as any);
{ const p0 = h3ExtendTool.parseInput.bind(h3ExtendTool);
  h3ExtendTool.parseInput = async (f, files) => {
    const d = f.direction || 'forward';
    if (!DIRECTIONS[d]) return bad('direction', 'Direction must be forward, backward, sequel or camera-pull.');
    if ((files.refImages ?? []).length) return bad('refImages', 'Extend takes no reference images: the H3 extend endpoints have no image-reference input.', 'unsupported');
    let els: unknown[] = []; try { els = f.elements ? JSON.parse(f.elements) : []; } catch { els = String(f.elements).split(',').filter(Boolean); }
    if (Array.isArray(els) && els.length) return bad('elements', 'Extend takes no elements: the H3 extend endpoints have no reference input.', 'unsupported');
    const bitrate = f.bitrate || 'standard'; if (!BITRATES.some((b) => b.value === bitrate)) return bad('bitrate', `Bitrate must be ${BITRATES.map((b) => b.value).join(' or ')}.`);
    let audio = f.audio == null || f.audio === '' ? true : /^(1|true|on|yes)$/i.test(f.audio);
    const r: any = await p0(f, files); if ('error' in r) return r;
    if (d === 'backward') { // reverse the clip's head; H3 conditions on the source tail, which is now the original opening
      const src = r.videoPath as string; const rev = src.replace(/(\.[^.]+)?$/, '-rev.mp4');
      const code = await runFfmpeg(['-y', '-v', 'error', '-t', '4', '-i', src, '-vf', 'reverse', ...(r.hasAudio ? ['-af', 'areverse', '-c:a', 'aac'] : ['-an']), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', rev]);
      if (code !== 0) return bad('video', "Couldn't prepare the clip for a backward extend. Try another clip or extend forward.", 'unreadable');
      r.originalVideoUrl = r.videoUrl; r.videoPath = rev; r.videoUrl = `/files/${path.basename(rev)}`; r.reverseOutput = true;
      if (audio) { audio = false; (r.warnings ??= []).push('Backward extends are silent: the generated sound would play in reverse.'); } }
    // Direction reaches every backend: local ComfyUI (h3/plan.ts reads finalPrompt), fal (h3FalBody reads hostedPrompt) and the mock (prompt).
    // Bitrate + Audio are honoured by postEncode below (our final encode, 0 credits): crf per BITRATES, audio=0 strips the track.
    const withDir = (p?: string) => withExtendDirection(p, d); // once: never doubled on a Recreate, none when the prompt already asks to continue
    return { ...r, direction: d, bitrate, audio, audioOff: 'strip', prompt: withDir(r.prompt), finalPrompt: withDir(r.finalPrompt ?? r.prompt), hostedPrompt: withDir(r.hostedPrompt ?? r.prompt) };
  }; }
withLimits(h3ExtendTool);
/** Backward extend: play the generated continuation in reverse so it becomes a lead-in to the clip (0 credits, our ffmpeg). */
async function reverseOutputs(job: any) {
  if (!job.input?.reverseOutput || job._reversed) return; job._reversed = true;
  for (const o of job.outputs ?? []) { if (!/\.mp4$/i.test(o.url)) continue; const src = path.join(DATA_DIR, path.basename(o.url)); const tmp = src.replace(/\.mp4$/i, '.rev.mp4');
    if ((await runFfmpeg(['-y', '-v', 'error', '-i', src, '-vf', 'reverse', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp])) === 0) { await (await import('node:fs/promises')).rename(tmp, src); (job.input.notes ??= []).push('reversed: backward extend (lead-in)'); } }
}
{ const run0 = h3ExtendTool.run.bind(h3ExtendTool); h3ExtendTool.run = async (job: any) => { await run0(job); if (job.status === 'done') { await reverseOutputs(job); await postEncode(job); } }; // our final encode: bitrate, audio off (0 credits)
  (h3ExtendTool as any).routedPost ??= async (job: any) => { if (job.status === 'done' || job.outputs?.length) { await reverseOutputs(job); await postEncode(job); } }; }
// Upscale: models, sizes, defaults and the size rule are wired in tools/videoUpscaleModels.ts + shared/videoUpscale.ts (applyVideoUpscale).
applyVideoUpscale(upscaleApp);

aliasParam(reframeTool, 'aspect'); aliasParam(fpsBoostTool, 'targetFps'); aliasParam(depthMapTool, 'format');
aliasParam(sdrHdrTool, 'strength', { name: 'strength', kind: 'number', default: '0.5' });
{ const p = sdrHdrTool.parseInput.bind(sdrHdrTool); sdrHdrTool.parseInput = async (f, files) => { const r: any = await p(f, files); if ('error' in r) return r;
  const st = f.strength == null || f.strength === '' ? 0.5 : Number(f.strength); if (!(st >= 0 && st <= 1)) return bad('strength', 'strength must be 0–1.', 'out_of_range'); return { ...r, strength: st }; }; }
export const NEW_EDIT_TOOLS: ToolDef[] = [reframeTool, removeBgTool, sdrHdrTool, fpsBoostTool, depthMapTool];
/** Edit Video menu order + whether the tool existed before this batch. */
export const EDIT_VIDEO_MENU: { id: string; name: string; existed: boolean }[] = [
  { id: 'h3-extend', name: 'Extend', existed: true }, { id: 'reframe', name: 'Reframe', existed: false }, { id: 'upscale', name: 'Upscale', existed: true },
  { id: 'remove-bg', name: 'Remove Background', existed: false }, { id: 'sdr-hdr', name: 'SDR to HDR', existed: false }, { id: 'fps-boost', name: 'FPS Boost', existed: false },
  { id: 'depth-map', name: 'Depth Map', existed: false }, { id: 'reshoot', name: 'Re-shoot', existed: true },
  { id: 'prompt-edit', name: 'Prompt Edit', existed: false },
];
