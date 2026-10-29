/**
 * LTX-2.5 Pro / Fast · Comfy Cloud (2026-10-27): image to video and first + last frame through Comfy's LTX-2.5 partner (API) node
 * LtxApi25ImageToVideo, run as an ordinary Comfy Cloud workflow job (API v2) with the Comfy key once in extra_data.api_key_comfy_org.
 * Why: Comfy Router's ltx/ltx-2-5-pro and ltx-2-5-fast schemas are text only (duration, fps, generate_audio, prompt, resolution), so the
 * Router place of the LTX-2.5 cards refused every job with a start image. Text to video stays on Comfy Router (routing/routerModels.ts).
 *
 * Graph (API format) = the official Comfy templates api_ltx2_5_i2v / api_ltx2_5_flf2v (github.com/Comfy-Org/workflow_templates, MIT):
 *   LoadImage (start) [+ LoadImage (last) → last_frame] → LtxApi25ImageToVideo → SaveVideo.
 * Node inputs as Comfy Cloud's object_info lists them (2026-10-26 copy; test/fixtures/object-info-comfy-cloud-2026-10-26.json): `model` is a
 * dynamic combo, so its options' inputs are named "model.duration", "model.resolution", "model.fps", "model.generate_audio" (all required).
 *   LTX-2.5 (Pro):  duration 2 3 4 5 6 8 10; resolution 1280x720 720x1280 1920x1080 1080x1920; fps 24 25 50.
 *   LTX-2.5 (Fast): duration 2 3 4 5 6 8 10 12 14 16 18 20; + 2560x1440 1440x2560 3840x2160 2160x3840; fps 24 25 48 50;
 *                   over 10 s needs 720p / 1080p and 24 / 25 fps (the node's tooltip and the LTX-2.5 partner-node page).
 * Start / last images go through the shared fit (shared/videoFit.ts planVideoFit): crop to the clip's 16:9 or 9:16 (pad when the job asks
 * fit=pad), then scaled to the exact node resolution, in a free local step before anything is uploaded (prepare).
 * Price: per second by model and resolution, the partner-node table (docs.comfy.org/tutorials/partner-nodes/pricing, Lightricks) = the node's own
 * price badge = Comfy Router's ltx-2-5-pro / ltx-2-5-fast rates (shared/hostedPrices.ts rows cloud-ltx25-pro-api / cloud-ltx25-fast-api).
 */
import path from 'node:path';
import { DATA_DIR } from '../config.js';
import { runFfmpeg, videoSize } from '../ffmpeg.js';
import { planVideoFit, type VideoInputLimits } from '../shared/videoFit.js';
import type { Plan } from './plans.js';

export type LtxApiTier = 'pro' | 'fast';
export interface LtxApiTierSpec { tier: LtxApiTier; provider: string; route: string; name: string; nodeModel: string; durations: number[]; resolutions: string[]; fps: number[] }
const SECS_PRO = [2, 3, 4, 5, 6, 8, 10]; const SECS_FAST = [...SECS_PRO, 12, 14, 16, 18, 20];
export const LTX_API_CLOUD: Record<LtxApiTier, LtxApiTierSpec> = {
  pro: { tier: 'pro', provider: 'cloud-ltx25-pro-api', route: 'comfy-cloud:cloud-ltx25-pro-api', name: 'LTX-2.5 Pro', nodeModel: 'LTX-2.5 (Pro)', durations: SECS_PRO, resolutions: ['720p', '1080p'], fps: [24, 25, 50] },
  fast: { tier: 'fast', provider: 'cloud-ltx25-fast-api', route: 'comfy-cloud:cloud-ltx25-fast-api', name: 'LTX-2.5 Fast', nodeModel: 'LTX-2.5 (Fast)', durations: SECS_FAST, resolutions: ['720p', '1080p', '1440p', '4K'], fps: [24, 25, 48, 50] },
};
export const LTX_API_NODE = 'LtxApi25ImageToVideo';
/** The official templates the graphs follow. */
export const LTX_API_TEMPLATES = { i2v: 'api_ltx2_5_i2v', flf: 'api_ltx2_5_flf2v' } as const;
export const LTX_API_DOC = 'https://docs.comfy.org/tutorials/partner-nodes/lightricks/ltx-2-5';
/** Node resolution per tier and shape. */
export const LTX_API_SIZES: Record<string, { '16:9': [number, number]; '9:16': [number, number] }> = {
  '720p': { '16:9': [1280, 720], '9:16': [720, 1280] }, '1080p': { '16:9': [1920, 1080], '9:16': [1080, 1920] },
  '1440p': { '16:9': [2560, 1440], '9:16': [1440, 2560] }, '4K': { '16:9': [3840, 2160], '9:16': [2160, 3840] },
};
export const ltxApiTierOf = (provider: string): LtxApiTierSpec | null => Object.values(LTX_API_CLOUD).find((t) => t.provider === provider || t.route === provider) ?? null;

type In = Record<string, any>;
const modeOf = (i: In): string => { const t = Array.isArray(i.types) ? i.types[0] : typeof i.types === 'string' ? (() => { try { const x = JSON.parse(i.types); return Array.isArray(x) ? x[0] : x; } catch { return i.types.split(',')[0]; } })() : null;
  return String(i.mode ?? t ?? '').trim(); };
/** '720p' / '1080p' / '1440p' / '4K' from the asked resolution (case-insensitive); unset → 1080p (the node's default; the price row's default rate). */
export const ltxApiResolution = (i: In): string => { const r = String(i.resolution ?? '').trim(); if (!r) return '1080p'; return Object.keys(LTX_API_SIZES).find((k) => k.toLowerCase() === r.toLowerCase()) ?? r; };
export const ltxApiSeconds = (i: In): number => Math.round(Number(i.duration) || 6);
export const ltxApiFps = (t: LtxApiTierSpec, i: In): number => { const f = Math.round(Number(i.fps)); return t.fps.includes(f) ? f : 24; };
const orList = (xs: (string | number)[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}` : String(xs[0] ?? ''));

/** What this route can't take (null = fine). Same check on the quote, the submit and the plan (quote = charge). */
export const ltxApiCloudIssue = (tier: LtxApiTier) => (i: In): string | null => {
  const t = LTX_API_CLOUD[tier]; const m = modeOf(i);
  if (m !== 'i2v' && m !== 'flf') return `${t.name} on Comfy Cloud runs image to video and first + last frame; text to video runs on ${tier === 'pro' ? 'Comfy Router' : 'the LTX API'}`;
  if (i.videoPath || i.speechPath || (Array.isArray(i.refVideoPaths) && i.refVideoPaths.length) || (Array.isArray(i.refAudioPaths) && i.refAudioPaths.length)) return `${t.name} on Comfy Cloud takes a prompt and images only`;
  if (i.draft) return `${t.name} on Comfy Cloud has no draft mode`;
  const res = ltxApiResolution(i); if (!t.resolutions.includes(res)) return `${t.name} on Comfy Cloud makes ${orList(t.resolutions)}; ${i.resolution} runs elsewhere`;
  const s = Number(i.duration); if (i.duration != null && i.duration !== '' && !t.durations.includes(s)) return `${t.name} on Comfy Cloud makes ${orList(t.durations)} s clips`;
  if (ltxApiSeconds(i) > 10 && !['720p', '1080p'].includes(res)) return `${t.name} makes clips over 10 s at 720p or 1080p only`;
  if (i.aspect && i.aspect !== 'auto' && !['16:9', '9:16'].includes(String(i.aspect))) return `${t.name} on Comfy Cloud makes 16:9 or 9:16; ${i.aspect} runs elsewhere`;
  return null;
};

/** The frames a run needs (the plan and the prep; a quote has no files yet, so the route check above doesn't ask). */
const framesIssue = (tier: LtxApiTier, i: In): string | null => { const t = LTX_API_CLOUD[tier];
  return !i.imagePath ? `${t.name} on Comfy Cloud needs a start image` : modeOf(i) === 'flf' && !i.lastFramePath ? `${t.name} on Comfy Cloud needs a last frame for first + last frame` : null; };
const refuse = (msg: string) => Object.assign(new Error(`${msg}. Nothing was sent or charged`), { reasonCode: 'input_blocked', errorType: 'validation' });

/** The clip's shape: the asked 16:9 / 9:16, else the start image's orientation (portrait → 9:16), else 16:9. */
export const ltxApiAspect = (i: In, img?: { width: number; height: number } | null): '16:9' | '9:16' =>
  i.aspect === '9:16' || i.aspect === '16:9' ? i.aspect : img && img.height > img.width ? '9:16' : '16:9';

/** Fit one frame to the node's exact size (shared fit maths: crop to the shape, or pad when fit=pad), as a PNG. Returns the plan's note. */
async function fitFrame(src: string, out: string, size: [number, number], aspect: string, mode: 'crop' | 'pad'): Promise<{ from: string; note: string | null }> {
  const s = await videoSize(src).catch(() => null); if (!s?.width || !s?.height) throw Object.assign(new Error('That image could not be read. Try another image. Nothing was sent or charged'), { reasonCode: 'input_blocked', errorType: 'validation' });
  const limits: VideoInputLimits = { name: 'LTX-2.5', output: { snap: [aspect] }, source: LTX_API_DOC, verified: true };
  const p = planVideoFit({ width: s.width, height: s.height }, limits, mode); const [W, H] = size;
  const vf = mode === 'pad' ? `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`
    : `${p.crop ? `crop=${p.crop.width}:${p.crop.height}:${p.crop.x}:${p.crop.y},` : ''}scale=${W}:${H}:flags=lanczos,setsar=1`;
  if ((await runFfmpeg(['-y', '-v', 'error', '-i', src, '-vf', vf, '-frames:v', '1', out])) !== 0) throw Object.assign(new Error('That image could not be prepared for the model. Try another image. Nothing was sent or charged'), { reasonCode: 'input_blocked', errorType: 'validation' });
  const scaled = s.width !== W || s.height !== H;
  return { from: `${s.width}×${s.height}`, note: p.note ?? (scaled ? `Adjusted for LTX-2.5: scaled to ${W}×${H}` : null) };
}
/** Free local prep before any upload (routing/cloudRun.ts → CloudWorkflowEntry.prepare): the start (and last) frame fitted to the node's size.
 *  Writes input.ltxApi { start, last, size, aspect, fit }. A refused job throws with reasonCode (nothing sent). */
export async function prepareLtxApiCloud(job: { id: string; provider?: string; input: In }, tier: LtxApiTier) {
  const i = job.input; const bad = ltxApiCloudIssue(tier)(i) ?? framesIssue(tier, i); if (bad) throw refuse(bad);
  const res = ltxApiResolution(i); const img = await videoSize(String(i.imagePath)).catch(() => null); const aspect = ltxApiAspect(i, img); const size = LTX_API_SIZES[res][aspect];
  const mode = String(i.fit ?? '').trim().toLowerCase() === 'pad' ? 'pad' : 'crop'; // a start frame fills the clip: crop unless the job asks fit=pad (bars would be filmed)
  const start = path.join(DATA_DIR, `${job.id}-ltxapi-start.png`); const f1 = await fitFrame(String(i.imagePath), start, size, aspect, mode);
  let last: string | null = null; let f2: { from: string; note: string | null } | null = null;
  if (modeOf(i) === 'flf') { last = path.join(DATA_DIR, `${job.id}-ltxapi-last.png`); f2 = await fitFrame(String(i.lastFramePath), last, size, aspect, mode); }
  i.ltxApi = { start, last, size: `${size[0]}x${size[1]}`, aspect, fit: { mode, start: { from: f1.from, note: f1.note }, ...(f2 ? { last: { from: f2.from, note: f2.note } } : {}) } };
}
const seed32 = (s: unknown) => (Number.isFinite(Number(s)) ? Math.abs(Math.floor(Number(s))) % 4294967296 : 42);
/** The API-format graph (official template shape). `start` / `last` are upload placeholders ({__file}) or Cloud asset refs. */
export function ltxApiGraph(tier: LtxApiTier, i: In, files: { start: unknown; last?: unknown }, o: { size?: string } = {}): Record<string, any> {
  const t = LTX_API_CLOUD[tier]; const res = ltxApiResolution(i); const size = o.size ?? LTX_API_SIZES[res]?.[ltxApiAspect(i)]?.join('x') ?? '1920x1080';
  const flf = modeOf(i) === 'flf' && files.last != null;
  return {
    '4': { class_type: 'LoadImage', inputs: { image: files.start } },
    ...(flf ? { '5': { class_type: 'LoadImage', inputs: { image: files.last } } } : {}),
    '6': { class_type: LTX_API_NODE, inputs: { image: ['4', 0], ...(flf ? { last_frame: ['5', 0] } : {}), model: t.nodeModel, 'model.duration': String(ltxApiSeconds(i)), 'model.resolution': size,
      'model.fps': String(ltxApiFps(t, i)), 'model.generate_audio': i.audio !== false, prompt: String(i.hostedPrompt || i.finalPrompt || i.prompt || ''), seed: seed32(i.seed) } },
    '2': { class_type: 'SaveVideo', inputs: { video: ['6', 0], filename_prefix: `video/openhiggsfield-ltx25-${tier}`, format: 'auto', 'format.codec': 'auto' } },
  };
}
/** The plan (comfy/cloudWorkflows.ts standalone entry): one pass, the fitted frames from prepare (the job's own images when prepare didn't run). */
export const ltxApiCloudPlan = (tier: LtxApiTier) => (j: { id: string; toolId: string; provider: string; input: In }): Plan => {
  const i = j.input; const bad = ltxApiCloudIssue(tier)(i) ?? framesIssue(tier, i); if (bad) throw refuse(bad);
  const x = i.ltxApi as { start: string; last: string | null; size: string; fit?: any } | undefined; const flf = modeOf(i) === 'flf';
  const graph = ltxApiGraph(tier, i, { start: { __file: x?.start ?? String(i.imagePath) }, ...(flf ? { last: { __file: x?.last ?? String(i.lastFramePath) } } : {}) }, { size: x?.size });
  const t = LTX_API_CLOUD[tier]; const n = graph['6'].inputs;
  const notes = [`${t.name} partner node (${LTX_API_NODE}) on Comfy Cloud: ${n['model.duration']} s, ${n['model.resolution']}, ${n['model.fps']} fps, sound ${n['model.generate_audio'] ? 'on' : 'off'}`,
    ...[x?.fit?.start?.note, x?.fit?.last?.note].filter(Boolean).map((s: string, k: number) => `${k === 0 ? 'Start' : 'Last'} frame: ${s}`)];
  return { tool: j.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false, notes,
    passes: [{ label: 'Result', workflow: flf ? LTX_API_TEMPLATES.flf : LTX_API_TEMPLATES.i2v, graph, output: '2', expect: { model: t.nodeModel, duration: n['model.duration'], resolution: n['model.resolution'] } }] };
};
