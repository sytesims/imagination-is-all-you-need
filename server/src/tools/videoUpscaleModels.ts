/**
 * Video Upscale engines (2026-10-26, the Upscale wiring fix). The model table (names, targets, fit, modes, local speed, menu copy) is
 * shared/videoUpscale.ts; this file registers the engines, their prices and their routes, and wires the Upscale tool to that table.
 *  - Local: Real-ESRGAN x2 and 4x-UltraSharp on every frame (workflows/upscale-esrgan-api.json, core nodes), SeedVR2 3B native graph
 *    (workflows/upscale-seedvr2-native-api.json) on NVIDIA (CUDA) GPUs; on Apple Silicon it runs, but took over an hour for 2 s (a slow verdict).
 *  - fal: SeedVR2 (fal-ai/seedvr/upscale/video), target mode 720p / 1080p / 1440p / 2160p (enum read on the fal API page 2026-10-26).
 *  - Comfy (partner nodes on Comfy Cloud): Topaz Video Enhance (TopazVideoEnhanceV2): Starlight Fast, Starlight Precise 2.5, Astra 2, Starlight
 *    Creative at FullHD (1080p) or 4K (2160p). Priced per SOURCE frame (docs.comfy.org/tutorials/partner-nodes/pricing › Topaz › Video).
 *  - Comfy Router: FLUX Video Upscale (bfl/video-upscale-v1) and Crystal Video Upscaler (fal/crystal-video-upscaler). Bodies from the Router
 *    model pages (…/comfy-router/models/black-forest-labs/flux-video-upscale/code, …/fal/crystal-video-upscaler/code, read 2026-10-26).
 * Nothing here was run against a paid API: request bodies are checked in test/video-upscale.test.ts; graphs against ComfyUI GET /object_info.
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { registerProvider } from '../providers.js';
import { registerWorkflowLicense } from '../licenses.js';
import { HOSTED_BY_ID, COMFY_CREDITS_PER_USD, type HostedPrice } from '../shared/hostedPrices.js';
import { EXTRA_ROUTES, FAL_ENV, COMFY_ENV, LOCAL_ROUTE_BLOCK, LOCAL_HW_BLOCK, PARTNER_LABEL } from '../routing/routes.js';
import { NATIVE_DIRECT } from '../routing/directRoutes.js';
import { ROUTER_MODELS, ROUTER_RUNNER_ROUTES } from '../routing/routerModels.js';
import { routerBase, ROUTER_NO_FALLBACK } from '../comfyRouter.js';
import { keyValue } from '../routing/keys.js';
import { clipLink } from '../routing/renderUpload.js';
import type { RouteDef, RouteAttempt } from '../routing/types.js';
import type { Job } from '../jobs.js';
import { registerModelInfo } from '../models.js';
import { MODEL_CATALOG } from '../shared/modelCatalog.js';
import { currentHardware } from '../hardware.js';
import { runFfmpeg } from '../ffmpeg.js';
import { DATA_DIR } from '../config.js';
import { VUP_MODELS, VUP_ORDER, TOPAZ_MODEL, TOPAZ_CREDITS_PER_FRAME, VUP_PRICE_FPS, vupBlock, vupTarget, VUP_DEFAULT_TARGET, VUP_TARGET_LABEL, VUP_TARGET_LONG, videoUpscaleInfo, vupSizing, vupFactor } from '../shared/videoUpscale.js';
export { VUP_TOOLS, vupMode, vupSizing } from '../shared/videoUpscale.js';
import type { ToolDef } from './types.js';
import { handOff } from '../mediaHandoff.js';
import { statSync } from 'node:fs';

const D = '2026-10-26' as const;
const COMFY_PRICING = 'https://docs.comfy.org/tutorials/partner-nodes/pricing';
const ROUTER_PRICING = 'https://docs.comfy.org/development/comfy-router/pricing';
const c = (credits: number) => Math.round((credits / COMFY_CREDITS_PER_USD) * 1e6) / 1e6;
const targetOf = (i: Record<string, any>) => vupTarget(i.maxOutput) ?? VUP_DEFAULT_TARGET;
const factorOf = (i: Record<string, any>) => Number(i.scale) || 2;

// ---------- engines ----------
registerWorkflowLicense('upscale-esrgan-api.json', ['bsd-3-clause']);
registerWorkflowLicense('upscale-ultrasharp-api.json', ['ultrasharp-nc']);
registerWorkflowLicense('upscale-seedvr2-native-api.json', ['apache-2.0']);
registerProvider({ id: 'comfy-video-esrgan', name: 'Real-ESRGAN x2', kind: 'open-weights', via: 'local ComfyUI core nodes, workflows/upscale-esrgan-api.json (RealESRGAN_x2plus.pth; mock unless OPENHIGGSFIELD_BACKEND=comfy)',
  workflows: ['upscale-esrgan-api.json'], docUrl: 'https://github.com/xinntao/Real-ESRGAN', licenseParts: ['bsd-3-clause'], nodes: ['UpscaleModelLoader', 'ImageUpscaleWithModel', 'ResizeImageMaskNode'] } as any);
registerProvider({ id: 'comfy-video-ultrasharp', name: '4x-UltraSharp', kind: 'open-weights', via: 'local ComfyUI core nodes, workflows/upscale-ultrasharp-api.json (4x-UltraSharp.pth; mock unless OPENHIGGSFIELD_BACKEND=comfy)',
  workflows: ['upscale-ultrasharp-api.json'], docUrl: 'https://huggingface.co/Kim2091/UltraSharp', licenseParts: ['ultrasharp-nc'], nodes: ['UpscaleModelLoader', 'ImageUpscaleWithModel', 'ResizeImageMaskNode'] } as any);
for (const [id, name] of Object.entries(TOPAZ_MODEL)) registerProvider({ id, name: VUP_MODELS[id].name, kind: 'hosted', via: `Comfy partner node TopazVideoEnhanceV2 (upscaler_model "${name}") on Comfy Cloud, Comfy key; sample output without a key`,
  docUrl: 'https://docs.comfy.org/built-in-nodes/TopazVideoEnhanceV2', license: 'proprietary', nodes: ['TopazVideoEnhanceV2'] } as any);
registerProvider({ id: 'router-crystal-video', name: 'Crystal Video Upscaler', kind: 'hosted', via: 'Comfy Router fal/crystal-video-upscaler (price not published: listed, never run)', docUrl: 'https://docs.comfy.org/development/comfy-router/models/fal/crystal-video-upscaler/code' } as any);

// ---------- menu copy and real model names (one table: shared/videoUpscale.ts) ----------
const SPEED: Record<string, 'fast' | 'balanced' | 'slow'> = { 'comfy-video-esrgan': 'balanced', 'comfy-video-ultrasharp': 'slow', 'comfy-seedvr2': 'balanced', 'cloud-topaz-starlight-fast': 'fast' };
for (const id of VUP_ORDER) { const m = VUP_MODELS[id];
  for (const tool of ['upscale', 'app-video-upscale']) {
    registerModelInfo(`${tool}:${id}`, { name: m.name, speed: SPEED[id] ?? 'balanced', quality: m.label === 'Fast' || m.label === 'Balanced' ? 'good' : 'best', hint: m.blurb, tech: `${m.source.name}. ${m.price}.` });
    MODEL_CATALOG[`${tool}:${id}`] = { name: m.name, family: m.name.split(' ')[0], description: m.blurb, ...(m.place === 'local' && !m.cudaOnly ? { localOnly: true } : {}) };
  } }

// ---------- prices ----------
const topazRow = (id: string): HostedPrice => { const k = TOPAZ_CREDITS_PER_FRAME[id]; const perSec = (cr: number) => c(cr * VUP_PRICE_FPS);
  return { providerId: id, model: `${VUP_MODELS[id].name} (Comfy partner node)`, unit: 'second', usd: perSec(k['1080p']), usdByQuality: { '1080p': perSec(k['1080p']), '2160p': perSec(k['2160p']) }, sourceUrl: COMFY_PRICING, checkedAt: D, estimated: true,
    note: `Comfy partner-node page: ≈${k['1080p']} credits per source frame at FullHD (1080p), ≈${k['2160p']} at 4K (2160p), "approximate"; quoted at ${VUP_PRICE_FPS} fps (a 30 fps clip has 25% more frames and bills 25% more). 211 credits = $1.` }; };
export const VIDEO_UPSCALE_PRICES: HostedPrice[] = [
  ...Object.keys(TOPAZ_MODEL).map(topazRow),
  // FLUX Video Upscale on Comfy Router: the Router page lists bfl/video-upscale-v1 as usage-based (0.266 credits per GPU-second, no fixed figure before the run); the
  // partner-node page gives 21.12 / 30.17 credits per output MP per second (precise / creative). We quote the partner-node rule as an estimate (as FLUX 3 Video).
  { providerId: 'comfy-router:direct-flux3-upscale', model: 'FLUX Video Upscale (Comfy Router)', unit: 'mp_second', usd: c(21.12), usdByMode: { precise: c(21.12), creative: c(30.17) }, sourceUrl: ROUTER_PRICING, checkedAt: D, estimated: true,
    note: 'Estimate: the Router bills bfl/video-upscale-v1 by GPU time (0.266 Comfy credits per GPU-second), which is only known after the run. Quoted with the partner-node rule: 21.12 (precise) / 30.17 (creative) credits per output megapixel per second.' },
  { providerId: 'router-crystal-video', model: 'Crystal Video Upscaler (Comfy Router)', unit: 'mp_second', usd: null, estimateUsd: 0.143, estimateNote: 'Estimate from the Clarity AI Crystal Video Upscale partner node on the same Comfy account: 30.17 credits per output megapixel per second up to 30 fps (docs.comfy.org/tutorials/partner-nodes/pricing, read 2026-10-26).', sourceUrl: ROUTER_PRICING, checkedAt: D, estimated: true, note: 'Comfy Router pricing lists fal/crystal-video-upscaler as "Not published": runs on an estimate (the partner node\'s rate).' },
];
for (const p of VIDEO_UPSCALE_PRICES) HOSTED_BY_ID[p.providerId] = p;

// ---------- local routes: who can run them ----------
/** SeedVR2 3B runs locally on an NVIDIA card, and on Apple Silicon very slowly (2026-10-31, hardware plan B5: it ran, over an hour for 2 s, so it is a
 *  "Runs, but slow" verdict, not a block: requirements.ts fitFor → slow/mps with the time). No graphics card, or one we couldn't read: refused.
 *  Every local engine refuses a size it can't make (shared/videoUpscale.ts vupBlock). */
export const SEEDVR2_NO_GPU_REASON = 'SeedVR2 needs a graphics card on your computer. Try Real-ESRGAN x2, or SeedVR2 in the cloud';
export const seedvr2LocalBlock = (gpuType: string | null | undefined) => (gpuType === 'cuda' || gpuType === 'mps' ? null : gpuType ? SEEDVR2_NO_GPU_REASON : 'SeedVR2 needs a graphics card, and we couldn’t check yours');
for (const id of ['comfy-video-esrgan', 'comfy-video-ultrasharp']) LOCAL_ROUTE_BLOCK[id] = (i) => vupBlock(id, i);
LOCAL_HW_BLOCK['comfy-seedvr2'] = () => (seedvr2LocalBlock(currentHardware().gpu?.type ?? null) ? 'Needs a graphics card' : null);
LOCAL_ROUTE_BLOCK['comfy-seedvr2'] = (i) => seedvr2LocalBlock(currentHardware().gpu?.type ?? null) ?? vupBlock('comfy-seedvr2', i);

// ---------- fal SeedVR2 ----------
/** fal-ai/seedvr/upscale/video body: target mode, the picked size (720p / 1080p / 1440p / 2160p), MP4. */
export async function falSeedvr2Body(i: Record<string, any>, videoUrl?: string) {
  const t = targetOf(i); return { video_url: videoUrl ?? await handOff(i.videoPath, 'video', 'fal', { mime: 'video/mp4' }), upscale_mode: 'target', target_resolution: t === '4k' ? '2160p' : t === '2k' ? '1440p' : t,
    output_format: 'X264 (.mp4)', ...(Number.isInteger(i.seed) ? { seed: i.seed } : {}) };
}
EXTRA_ROUTES['comfy-seedvr2'] = [{ routeId: 'fal:fal-ai/seedvr/upscale/video', kind: 'fal', modelId: 'comfy-seedvr2', endpoint: 'fal-ai/seedvr/upscale/video', priceRef: 'fal:fal-ai/seedvr/upscale/video',
  sourceUrl: 'https://fal.ai/models/fal-ai/seedvr/upscale/video/api', checkedAt: D, typicalLatencySec: 180, latencyEstimated: true, latencySource: 'estimated: fal publishes no per-model latency',
  envKey: FAL_ENV, envAliases: ['FAL_KEY'], label: 'SeedVR2 via fal', output: 'video', caps: { mode: ['precise'], targets: ['720p', '1080p', '1440p', '4k'] },
  unavailableFor: (i) => vupBlock('comfy-seedvr2', i), request: async (j) => falSeedvr2Body(j.input) }];

// ---------- Topaz Video Enhance on Comfy Cloud (partner node) ----------
/** The inputs each upscaler_model option adds (COMFY_DYNAMICCOMBO_V3, named "upscaler_model.<input>"), at the node's own defaults (Comfy Cloud
 *  object_info, ComfyUI 0.42.5, 2026-10-26). All required: Cloud refuses a graph without them (test/cloud-partner-graphs.test.ts checks every model). */
const TOPAZ_MODEL_INPUTS: Record<string, Record<string, unknown>> = {
  'Astra 2': { creativity: 0.5, prompt: '', sharp: 0.5, realism: 0 },
  'Starlight (Astra) Creative': { creativity: 'low' },
};
/** The graph (API format), from the official template api_topaz_video_enhance: Load Video → Topaz Video Enhance → Save Video.
 *  Inputs as TopazVideoEnhanceV2's object_info lists them (ComfyUI 0.42.5): upscaler_model + its upscaler_resolution (+ the model's own inputs), interpolation off. */
export function topazGraph(provider: string, i: Record<string, any>, video: unknown) {
  const model = TOPAZ_MODEL[provider]; const res = targetOf(i) === '4k' ? '4K (2160p)' : 'FullHD (1080p)';
  const extra = Object.fromEntries(Object.entries(TOPAZ_MODEL_INPUTS[model] ?? {}).map(([k, v]) => [`upscaler_model.${k}`, v]));
  return {
    '1': { class_type: 'LoadVideo', inputs: { file: video } },
    '2': { class_type: 'TopazVideoEnhanceV2', inputs: { video: ['1', 0], upscaler_model: model, 'upscaler_model.upscaler_resolution': res, ...extra, interpolation_model: 'Disabled', dynamic_compression_level: 'Low' } },
    '3': { class_type: 'SaveVideo', inputs: { video: ['2', 0], filename_prefix: 'video/openhiggsfield-upscale', format: 'auto', 'format.codec': 'auto' } },
  };
}
const asMp4 = async (src: string, jobId: string) => { if (/\.mp4$/i.test(src)) return src; const out = path.join(DATA_DIR, `${jobId}-topaz-src.mp4`);
  if ((await runFfmpeg(['-y', '-v', 'error', '-i', src, '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', '-c:a', 'aac', out])) !== 0) throw new Error('Could not convert the clip to MP4 for Topaz'); return out; };
/** The source sound back on the upscaled clip (Topaz returns the picture; our final file keeps the clip's audio). */
async function muxSource(out: string, src: string) { const tmp = out.replace(/\.mp4$/i, '.mux.mp4');
  if ((await runFfmpeg(['-y', '-v', 'error', '-i', out, '-i', src, '-map', '0:v:0', '-map', '1:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-shortest', tmp])) === 0) await (await import('node:fs/promises')).rename(tmp, out); }
async function runTopazCloud(job: Job, r: RouteDef, attempt: RouteAttempt) {
  const { ComfyCloudV2, CloudError, cloudFailure } = await import('../comfy/cloudV2.js'); const { cloudBase } = await import('../routing/cloudRun.js');
  const cl = new ComfyCloudV2(cloudBase(), keyValue(r)!, `${job.id}-a${attempt.n}`); const i = job.input as Record<string, any>;
  try {
    job.stage = 'uploading'; const asset = await cl.upload(await asMp4(i.videoPath, job.id));
    job.stage = 'submitted';
    const res = await cl.run(topazGraph(job.provider, i, asset), { partnerAuth: true, timeoutMs: 40 * 60_000, isCanceled: () => (job.status as string) === 'canceled',
      onSubmitted: (id) => { attempt.requestId = id; job.cloudJobId = id; (job.requestIds ??= []).push(id); }, onProgress: (p) => { job.stage = p.phase === 'queued' ? 'submitted' : 'rendering'; if (p.known) job.progress = p.percent; } });
    const outs = Object.values(res.outputs).flat() as any[]; const vid = outs.find((o) => /\.(mp4|mov|webm)$/i.test(String(o.filename ?? ''))) ?? outs.find((o) => /video/i.test(String(o.content_type ?? '')));
    if (!vid) throw new CloudError('cloud_job_failed', 'the run finished without a video.', null, true, 'no video output');
    job.stage = 'muxing'; const name = `${job.id}-out0.mp4`; const dest = path.join(DATA_DIR, name); await cl.download(vid, dest); if (i.keepAudio !== false && i.hasAudio) await muxSource(dest, i.videoPath);
    job.outputs = [{ label: VUP_MODELS[job.provider].name, url: `/files/${name}` }]; job.resultUrl = job.outputs[0].url; job.status = 'done'; job.stage = 'done'; job.progress = 100; job.eta = 0;
  } catch (e) {
    if ((job.status as string) === 'canceled') return;
    if (e instanceof CloudError) throw cloudFailure(job, e, job.provider);
    throw e;
  }
}
for (const id of Object.keys(TOPAZ_MODEL)) NATIVE_DIRECT[id] = { label: `Comfy Cloud · Topaz partner node`, endpoint: 'POST https://cloud.comfy.org/api/v2/jobs (graph: LoadVideo → TopazVideoEnhanceV2 → SaveVideo)', sourceUrl: COMFY_PRICING,
  typicalLatencySec: 240, latencyEstimated: true, latencySource: 'estimated: Topaz video runs take a few minutes', output: 'video', cloudRun: runTopazCloud, caps: { targets: VUP_MODELS[id].targets, perSourceFrame: true },
  unavailableFor: (i: Record<string, any>) => vupBlock(id, i) } as any;

// ---------- Comfy Router: FLUX Video Upscale and Crystal Video Upscaler ----------
const DOC = (p: string) => `https://docs.comfy.org/development/comfy-router/models/${p}/code`;
const isCreative = (i: Record<string, any>) => { let t: any = i.types; if (typeof t === 'string') { try { t = JSON.parse(t); } catch { t = [t]; } } return (Array.isArray(t) ? t[0] : t ?? i.mode) === 'creative'; };
/** bfl/video-upscale-v1 body: input_video (base64 MP4, ≤ 20 s and 50 MB), upscale_factor 1.5–3, creativity 0 (precise) / 1 (creative), optional prompt. */
export async function routerFluxUpscaleBody(i: Record<string, any>) {
  const f = Math.min(3, Math.max(1.5, vupFactor(i))); const p = String(i.prompt ?? '').trim();
  return { input_video: await handOff(i.videoPath, 'video', 'comfy-router', { accepts: ['base64'], who: 'FLUX Video Upscale' }), upscale_factor: f, creativity: isCreative(i) ? 1 : 0, ...(p ? { prompt: p } : {}) };
}
/** fal/crystal-video-upscaler body: video_url (a link: the schema takes a URL), scale_factor (output ≤ 5K). */
export async function routerCrystalBody(i: Record<string, any>) { return { video_url: await clipLink(i.videoPath, 'video/mp4', 'Crystal Video Upscaler'), scale_factor: vupFactor(i) }; }
const fileSize = (p: string) => { try { return statSync(p).size; } catch { return 0; } };
const fluxRouterBlock = (i: Record<string, any>) => { if (Number(i.duration) > 20) return 'FLUX Video Upscale takes clips up to 20 s'; if (i.videoPath && fileSize(i.videoPath) > 50_000_000) return `This clip is ${Math.round(fileSize(i.videoPath) / 1e5) / 10} MB; FLUX Video Upscale takes up to 50 MB`; if (i.scale != null && ![1.5, 2, 3].includes(Number(i.scale))) return 'FLUX Video Upscale upscales 1.5×, 2× or 3× only'; return vupBlock('direct-flux3-upscale', i); };
ROUTER_MODELS['direct-flux3-upscale'] = { name: 'FLUX Video Upscale', id: 'bfl/video-upscale-v1', doc: DOC('black-forest-labs/flux-video-upscale'), out: 'video', queue: true, maxRefs: 0, tools: ['upscale', 'app-video-upscale'],
  block: fluxRouterBlock, body: async (i: Record<string, any>) => routerFluxUpscaleBody(i),
  outputs: (j: any) => (/moderat|error|failed/i.test(String(j?.status ?? '')) && !j?.result?.sample ? { refused: String(j.status) } : j?.result?.sample ? [{ url: j.result.sample }] : []) } as any;
ROUTER_MODELS['router-crystal-video'] = { name: 'Crystal Video Upscaler', id: 'fal/crystal-video-upscaler', doc: DOC('fal/crystal-video-upscaler'), out: 'video', queue: true, maxRefs: 0, tools: ['upscale', 'app-video-upscale'],
  block: (i: Record<string, any>) => vupBlock('router-crystal-video', i), body: async (i: Record<string, any>) => routerCrystalBody(i), outputs: (j: any) => (j?.video?.url ? [{ url: j.video.url }] : []) } as any;
ROUTER_RUNNER_ROUTES.add('comfy-router:direct-flux3-upscale'); ROUTER_RUNNER_ROUTES.add('comfy-router:router-crystal-video');
{ const rm = ROUTER_MODELS['direct-flux3-upscale']; const routeId = 'comfy-router:direct-flux3-upscale';
  const r: RouteDef = { routeId, kind: 'comfy-router', modelId: 'direct-flux3-upscale', endpoint: `POST ${routerBase()}/v2/models/${rm.id}/requests${ROUTER_NO_FALLBACK}`, priceRef: routeId, sourceUrl: rm.doc, checkedAt: D,
    typicalLatencySec: 240, latencyEstimated: true, latencySource: 'estimated', envKey: COMFY_ENV, label: PARTNER_LABEL, output: 'video', caps: { routerModel: rm.id, scales: [1.5, 2, 3], maxSeconds: 20, gpuSecondBilled: true } };
  r.unavailableFor = (i) => fluxRouterBlock(i); // shown with or without a key: a clip it can't take never gets a quote that runs
  EXTRA_ROUTES['direct-flux3-upscale'] = [r]; } // replaces the fal / Replicate "coming soon" stubs (no public FLUX Video Upscale endpoint there)

/** The size label for a job (job lists and notes). */
export const vupTargetLabel = (i: Record<string, any>) => VUP_TARGET_LABEL[targetOf(i)];

// ---------- the Upscale tool (and Draft Upscale, its gallery app) ----------
/** Every target id the size field accepts, first = default (1080p). 2k = old id of 1440p; 8k = refused by every engine (clean 400). */
export const VUP_OUTPUT_TARGETS: Record<string, number> = { '1080p': VUP_TARGET_LONG['1080p'], '720p': VUP_TARGET_LONG['720p'], '1440p': VUP_TARGET_LONG['1440p'], '4k': VUP_TARGET_LONG['4k'], '2k': VUP_TARGET_LONG['2k'], '8k': VUP_TARGET_LONG['8k'] };
const ALL_SCALES = [1.5, 2, 3, 4];
/** Wire the Upscale tool to the table: model order, sizes, factors per model, menu info, the size rule on submit. */
export function applyVideoUpscale(tool: ToolDef) {
  const a: any = tool.app; tool.providers = [...VUP_ORDER];
  // in place: makeApp's parser holds these very objects (its config), so the page, the quote and the submit read one table
  const reset = (o: Record<string, any> | null | undefined, v: Record<string, any>) => { const x = o ?? {}; for (const k of Object.keys(x)) delete x[k]; return Object.assign(x, v); };
  a.outputTargets = reset(a.outputTargets, VUP_OUTPUT_TARGETS); a.maxLongSideByProvider = reset(a.maxLongSideByProvider, Object.fromEntries(VUP_ORDER.map((p) => [p, Math.max(...VUP_MODELS[p].targets.map((t) => VUP_TARGET_LONG[t]))])));
  a.scalesByProvider = reset(a.scalesByProvider, Object.fromEntries(VUP_ORDER.map((p) => [p, VUP_MODELS[p].scales ?? ALL_SCALES])));
  a.outputTargetsByProvider = Object.fromEntries(VUP_ORDER.map((p) => [p, VUP_MODELS[p].targets]));
  a.videoUpscale = videoUpscaleInfo();
  const mo: any = tool.inputs.find((x) => x.name === 'maxOutput'); if (mo) { mo.options = Object.keys(VUP_OUTPUT_TARGETS); mo.default = VUP_DEFAULT_TARGET; mo.byProvider = { ...a.outputTargetsByProvider }; } // the bar offers each model's own sizes
  tool.model = 'Real-ESRGAN x2 / 4x-UltraSharp (local) · SeedVR2 · Topaz · FLUX Video Upscale · Crystal';
  tool.workflows = ['upscale-esrgan-api.json', 'upscale-ultrasharp-api.json', 'upscale-seedvr2-native-api.json'];
  tool.gpuSecPerSec = { '480p': 5, '720p': 5, '1080p': 6, '1440p': 7, '2160p': 9 }; // planning figure for an NVIDIA card (Real-ESRGAN x2); per-engine and Mac figures: shared/videoUpscale.ts → timing.ts
  const p0 = tool.parseInput.bind(tool);
  tool.parseInput = async (fields, files) => {
    // no model named: the tool's default (the same one the router picks), so size and checks follow the model that will run
    const prov = fields.provider || (await import('../routing/defaults.js')).defaultProviderFor(tool) || tool.providers[0]; const m = VUP_MODELS[prov];
    // the bar shows Mode only where a model has two (FLUX Video Upscale): no mode sent = Precise (every model runs it)
    const r: any = await p0({ ...fields, provider: prov, ...(m && !fields.types ? { types: '["precise"]' } : {}) }, files); if ('error' in r || !m) return r;
    vupSizing(prov, r, { maxOutput: fields.maxOutput || r.maxOutput, targetLongEdge: r.targetLongEdge });
    const why = vupBlock(prov, r); if (why) { const field = /already/.test(why) ? 'maxOutput' : /mode/.test(why) ? 'types' : 'maxOutput'; const code = /already/.test(why) ? 'already_at_target' : 'unsupported';
      return { error: `${why}.`, code, issues: [{ code, field, message: `${why}.`, allowed: field === 'types' ? m.modes : m.targets }] } as any; }
    return { ...r, modelName: m.name };
  };
  return tool;
}
