/**
 * FLUX 3 Max (Black Forest Labs' video model on the FLUX 3 foundation, served through fal) on Comfy (2026-10-27). Two places, one model card:
 *  - Comfy Cloud: the partner nodes Flux3MaxTextToVideoNode / Flux3MaxImageToVideoNode run as an ordinary Comfy Cloud workflow job (API v2), the
 *    Comfy key once in extra_data.api_key_comfy_org (as LTX-2.5 Pro / Fast and Gemini Omni). Every mode: text, a start frame, start + end frame,
 *    and 1–10 keyframes spread across the clip or pinned to seconds. Graphs = the official templates api_flux3_max_t2v / api_flux3_max_i2v
 *    (github.com/Comfy-Org/workflow_templates, MIT; docs.comfy.org/tutorials/partner-nodes/black-forest-labs/flux-3-max).
 *  - Comfy Router fal/flux-3-max (docs.comfy.org/development/comfy-router/models/fal/flux-3-max/code): its schema is text only (prompt, duration,
 *    resolution, aspect_ratio, reasoning_level, generate_audio, seed) and the Router pricing page publishes ONE rate, half the partner node's 720p
 *    rate, while the field text says 1080p costs more. So Router takes text to video at 720p only (the published rate); 1080p and every job with
 *    images run on the Comfy Cloud place, whose per-resolution rates are published.
 * Node inputs as Comfy Cloud's object_info lists them (2026-10-26 copy; test fixture
 * test/fixtures/object-info-flux3-max-cloud-2026-10-26.json): prompt, aspect_ratio (auto 21:9 2:1 16:9 4:3 1:1 3:4 9:16), duration ("5"…"20", a
 * string combo), resolution (720p 1080p), reasoning_level (low high, default high), generate_audio (default true), seed (0–2147483646). Image to
 * video adds the autogrow "keyframes.image_0…image_9" (0-based, as in the template api_flux3_max_i2v) and the dynamic combo placement ("spread across the clip" | "at times" + "placement.times").
 * Price (per second of the clip; reasoning and sound don't change it): shared/hostedPrices.ts rows cloud-flux3-max (partner node: $0.060775 /
 * $0.103675 per s at 720p / 1080p until 2026-11-07 00:00 UTC, then $0.2431 / $0.4147) and comfy-router:cloud-flux3-max (Router: $0.0303875 per s
 * until then, $0.12155 after).
 */
import type { Plan } from './plans.js';
import { routeOff } from '../routing/routeOff.js';

export const F3M_PROVIDER = 'cloud-flux3-max';
export const F3M_ROUTE = `comfy-cloud:${F3M_PROVIDER}`;
export const F3M_ROUTER_ROUTE = `comfy-router:${F3M_PROVIDER}`;
export const F3M_ROUTER_ID = 'fal/flux-3-max';
export const F3M_NAME = 'FLUX 3 Max';
export const F3M_T2V_NODE = 'Flux3MaxTextToVideoNode';
export const F3M_I2V_NODE = 'Flux3MaxImageToVideoNode';
export const F3M_TEMPLATES = { t2v: 'api_flux3_max_t2v', i2v: 'api_flux3_max_i2v' } as const;
export const F3M_DOC = 'https://docs.comfy.org/tutorials/partner-nodes/black-forest-labs/flux-3-max';
export const F3M_ROUTER_DOC = 'https://docs.comfy.org/development/comfy-router/models/fal/flux-3-max/code';
export const F3M_SECONDS = Array.from({ length: 16 }, (_, k) => k + 5); // 5–20 s
export const F3M_DEFAULT_SECONDS = 5;
export const F3M_RESOLUTIONS = ['720p', '1080p'] as const;
export const F3M_ASPECTS = ['auto', '21:9', '2:1', '16:9', '4:3', '1:1', '3:4', '9:16'] as const;
export const F3M_MAX_KEYFRAMES = 10;
export const F3M_MODES = ['t2v', 'i2v', 'flf', 'r2v'] as const;
export const F3M_REASONING = ['low', 'high'] as const;
/** The launch rates end at this instant (partner-node and Router pages: "until November 7, 2026 (00:00 UTC)"). */
export const F3M_PROMO_END = Date.UTC(2026, 10, 7);
export const F3M_RATES = {
  cloud: { promo: { '720p': 0.060775, '1080p': 0.103675 }, standard: { '720p': 0.2431, '1080p': 0.4147 } },
  router: { promo: 0.0303875, standard: 0.12155 },
} as const;
export const f3mPromo = (now = Date.now()) => now < F3M_PROMO_END;

type In = Record<string, any>;
const modeOf = (i: In): string => { const t = Array.isArray(i.types) ? i.types[0] : typeof i.types === 'string' ? (() => { try { const x = JSON.parse(i.types); return Array.isArray(x) ? x[0] : x; } catch { return i.types.split(',')[0]; } })() : null;
  return String(i.mode ?? t ?? '').trim() || (i.imagePath ? 'i2v' : 't2v'); };
export const f3mMode = modeOf;
/** '720p' / '1080p' as asked (case-insensitive); unset → 720p (the node's default). */
export const f3mResolution = (i: In): string => { const r = String(i.resolution ?? '').trim(); if (!r) return '720p'; return F3M_RESOLUTIONS.find((k) => k.toLowerCase() === r.toLowerCase()) ?? r; };
export const f3mSeconds = (i: In): number => { const s = Math.round(Number(i.duration)); return F3M_SECONDS.includes(s) ? s : F3M_DEFAULT_SECONDS; };
export const f3mAspect = (i: In): string => (typeof i.aspect === 'string' && (F3M_ASPECTS as readonly string[]).includes(i.aspect) ? i.aspect : 'auto');
/** reasoning_level: the job's field (API: reasoning=low|high), else high (the node's default). */
export const f3mReasoning = (i: In): 'low' | 'high' => (String(i.reasoning ?? i.fields?.reasoning ?? '').toLowerCase() === 'low' ? 'low' : 'high');
const pathsOf = (x: unknown): string[] => (Array.isArray(x) ? x.filter((p): p is string => typeof p === 'string' && !!p) : []);
/** The keyframe images in playback order: the start frame (i2v), start + end (flf), or the reference images in order (r2v, 1–10). */
export const f3mKeyframes = (i: In): string[] => { const m = modeOf(i);
  if (m === 'i2v') return pathsOf([i.imagePath]); if (m === 'flf') return pathsOf([i.imagePath, i.lastFramePath]);
  if (m === 'r2v') { const refs = pathsOf(i.refPaths); return refs.length ? refs : pathsOf([i.imagePath]); } return []; };
/** How many keyframes a job has before its files exist (a quote): the counts the form sends, else the files. */
const keyframeCount = (i: In): number => { const m = modeOf(i); if (m === 'i2v') return 1; if (m === 'flf') return 2;
  if (m === 'r2v') return Number(i.refCount) > 0 ? Number(i.refCount) : f3mKeyframes(i).length; return 0; };
/** Pinned seconds ("0, 2.5, 5"): the job's field keyframeTimes (string or array). null = spread across the clip. */
export const f3mTimes = (i: In): number[] | null => { const raw = i.keyframeTimes ?? i.fields?.keyframeTimes; if (raw == null || raw === '') return null;
  const xs = (Array.isArray(raw) ? raw : String(raw).split(',')).map((x) => String(x).trim()).filter(Boolean).map(Number); return xs; };
const orList = (xs: (string | number)[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}` : String(xs[0] ?? ''));

/** What the Comfy Cloud place can't take (null = fine). Same check on the quote, the submit and the plan (quote = charge). */
export function f3mCloudIssue(i: In): string | null {
  const m = modeOf(i);
  if (!(F3M_MODES as readonly string[]).includes(m)) return `${F3M_NAME} makes text to video, image to video, start + end frame and keyframe clips`;
  if (i.videoPath || i.speechPath || pathsOf(i.refVideoPaths).length || pathsOf(i.refAudioPaths).length) return `${F3M_NAME} takes a prompt and images only`;
  if (i.draft) return `${F3M_NAME} has no draft mode`;
  const res = f3mResolution(i); if (!(F3M_RESOLUTIONS as readonly string[]).includes(res)) return `${F3M_NAME} makes ${orList([...F3M_RESOLUTIONS])}`;
  if (i.duration != null && i.duration !== '' && !F3M_SECONDS.includes(Number(i.duration))) return `${F3M_NAME} makes 5 to 20 s clips`;
  if (i.aspect && i.aspect !== 'auto' && !(F3M_ASPECTS as readonly string[]).includes(String(i.aspect))) return `${F3M_NAME} makes ${F3M_ASPECTS.filter((a) => a !== 'auto').join(', ')}`;
  // 720p text to video goes to Comfy Router (half the price), unless Router refused this model (not_enabled, routing/routeOff.ts): then the node runs it
  if (m === 't2v' && res === '720p' && !routeOff(F3M_ROUTER_ROUTE)) return `${F3M_NAME} text to video at 720p runs on Comfy Router (half the price)`;
  const n = keyframeCount(i); if (n > F3M_MAX_KEYFRAMES) return `${F3M_NAME} takes up to ${F3M_MAX_KEYFRAMES} keyframe images; you added ${n}`;
  const times = f3mTimes(i);
  if (times) { if (m === 't2v') return `Keyframe times need keyframe images`;
    if (times.some((t) => !Number.isFinite(t) || t < 0)) return 'Keyframe times are seconds from 0, such as 0, 2.5, 5';
    if (n && times.length !== n) return `Give one time per keyframe image (${n} images, ${times.length} times)`;
    if (times.some((t, k) => k > 0 && t <= times[k - 1])) return 'Keyframe times must go up, such as 0, 2.5, 5';
    if (times[times.length - 1] > f3mSeconds(i)) return `The last keyframe time must be inside the ${f3mSeconds(i)} s clip`; }
  return null;
}
/** What the Comfy Router place can't take: text to video at 720p only (the one rate Router publishes for fal/flux-3-max). */
export function f3mRouterIssue(i: In): string | null {
  const m = modeOf(i);
  if (m !== 't2v' || i.imagePath || pathsOf(i.refPaths).length) return `${F3M_NAME} on Comfy Router does text to video only (its Router schema has no image input); jobs with images run on Comfy Cloud`;
  if (i.videoPath || i.speechPath || pathsOf(i.refVideoPaths).length || pathsOf(i.refAudioPaths).length) return `${F3M_NAME} takes a prompt only on Comfy Router`;
  if (i.draft) return `${F3M_NAME} has no draft mode`;
  if (f3mResolution(i) !== '720p') return `${F3M_NAME} at ${i.resolution} runs on Comfy Cloud (Comfy Router publishes its 720p rate only)`;
  if (i.duration != null && i.duration !== '' && !F3M_SECONDS.includes(Number(i.duration))) return `${F3M_NAME} makes 5 to 20 s clips`;
  if (i.aspect && i.aspect !== 'auto' && !(F3M_ASPECTS as readonly string[]).includes(String(i.aspect))) return `${F3M_NAME} makes ${F3M_ASPECTS.filter((a) => a !== 'auto').join(', ')}`;
  if (f3mTimes(i)) return 'Keyframe times need keyframe images';
  return null;
}
/** The frames a run needs (the plan; a quote has no files yet). */
const framesIssue = (i: In): string | null => { const m = modeOf(i); const k = f3mKeyframes(i);
  if (m === 'i2v' && !k.length) return `${F3M_NAME} needs a start image for image to video`;
  if (m === 'flf' && k.length < 2) return `${F3M_NAME} needs a start and an end frame`;
  if (m === 'r2v' && !k.length) return `${F3M_NAME} needs at least one keyframe image`;
  return null; };
const refuse = (msg: string) => Object.assign(new Error(`${msg}. Nothing was sent or charged`), { reasonCode: 'input_blocked', errorType: 'validation' });
const promptOf = (i: In) => String(i.hostedPrompt || i.finalPrompt || i.prompt || '');
const seedOf = (s: unknown) => (Number.isFinite(Number(s)) ? Math.abs(Math.floor(Number(s))) % 2147483647 : 42);

/** The API-format graph (official template shape). `files` are upload placeholders ({__file}) or Cloud asset refs, in playback order. */
export function f3mGraph(i: In, files: unknown[] = []): Record<string, any> {
  const m = modeOf(i); const common = { prompt: promptOf(i), aspect_ratio: f3mAspect(i), duration: String(f3mSeconds(i)), resolution: f3mResolution(i), reasoning_level: f3mReasoning(i), generate_audio: i.audio !== false, seed: seedOf(i.seed) };
  if (m === 't2v' || !files.length) return {
    '1': { class_type: F3M_T2V_NODE, inputs: common },
    '2': { class_type: 'SaveVideo', inputs: { video: ['1', 0], filename_prefix: 'video/openhiggsfield-flux3-max', format: 'auto', 'format.codec': 'auto' } } };
  const kf = files.slice(0, F3M_MAX_KEYFRAMES); const times = f3mTimes(i);
  const loads = Object.fromEntries(kf.map((f, k) => [String(10 + k), { class_type: 'LoadImage', inputs: { image: f } }]));
  return { ...loads,
    '1': { class_type: F3M_I2V_NODE, inputs: { prompt: common.prompt, ...Object.fromEntries(kf.map((_, k) => [`keyframes.image_${k}`, [String(10 + k), 0]])),
      placement: times ? 'at times' : 'spread across the clip', ...(times ? { 'placement.times': times.join(', ') } : {}),
      aspect_ratio: common.aspect_ratio, duration: common.duration, resolution: common.resolution, reasoning_level: common.reasoning_level, generate_audio: common.generate_audio, seed: common.seed } },
    '2': { class_type: 'SaveVideo', inputs: { video: ['1', 0], filename_prefix: 'video/openhiggsfield-flux3-max', format: 'auto', 'format.codec': 'auto' } } };
}
/** The plan (comfy/cloudWorkflows.ts standalone entry): one pass on the template that fits the job. */
export function f3mCloudPlan(j: { id: string; toolId: string; provider: string; input: In }): Plan {
  const i = j.input; const bad = f3mCloudIssue(i) ?? framesIssue(i); if (bad) throw refuse(bad); const m = modeOf(i);
  const graph = f3mGraph(i, f3mKeyframes(i).map((p) => ({ __file: p }))); const n = graph['1'].inputs; const k = f3mKeyframes(i).length;
  const what = m === 't2v' ? 'text to video' : k === 1 ? 'one keyframe (start)' : k === 2 ? 'start + end frame' : `${k} keyframes ${n.placement === 'at times' ? `at ${n['placement.times']} s` : 'spread across the clip'}`;
  return { tool: j.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false,
    notes: [`${F3M_NAME} partner node (${m === 't2v' ? F3M_T2V_NODE : F3M_I2V_NODE}) on Comfy Cloud: ${what}, ${n.duration} s, ${n.resolution}, ${n.aspect_ratio}, reasoning ${n.reasoning_level}, sound ${n.generate_audio ? 'on' : 'off'}`],
    passes: [{ label: 'Result', workflow: `template:${m === 't2v' ? F3M_TEMPLATES.t2v : F3M_TEMPLATES.i2v}`, graph, output: '2', expect: { duration: n.duration, resolution: n.resolution } }] };
}
/** The Comfy Router body (fal/flux-3-max schema): text to video at 720p. */
export function f3mRouterBody(i: In): Record<string, unknown> {
  const bad = f3mRouterIssue(i); if (bad) throw new Error(bad);
  return { prompt: promptOf(i), duration: f3mSeconds(i), resolution: '720p', aspect_ratio: f3mAspect(i), reasoning_level: f3mReasoning(i), generate_audio: i.audio !== false, ...(Number.isInteger(i.seed) ? { seed: seedOf(i.seed) } : {}) };
}
/** Router output: { video: { url, … }, seed }. */
export const f3mRouterOutputs = (j: any) => (j?.video?.url ? [{ url: String(j.video.url) }] : j?.error || j?.detail ? { refused: String(j?.error?.message ?? j?.detail ?? 'failed') } : []);
