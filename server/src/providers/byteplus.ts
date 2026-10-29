/**
 * BytePlus ModelArk as a direct provider (batch 2, 2026-10-23): Seedance 2.0 / 2.0 Fast / 2.0 Mini / 2.5 video (submit + poll) and
 * Seedream 5.0 Pro / Flash images (one sync call). One host serves both: video runs only on AP-Southeast, so that is the default
 * (OPENHIGGSFIELD_ARK_BASE_URL swaps it). Bearer ARK key; each model must be activated in the ModelArk console first.
 *
 * Docs read 2026-10-23 (docs.byteplus.com/en/docs/ModelArk/…):
 *   create task  1520757  POST /contents/generations/tasks: content[] text | image_url (role first_frame / last_frame / reference_image;
 *                         URL, data:image/<fmt>;base64 or asset://) | video_url (public URL or asset:// only) | audio_url (URL or base64);
 *                         resolution, ratio (16:9 4:3 1:1 3:4 9:16 21:9 adaptive), duration (2.0 series 4–15, 2.5 4–30, or -1),
 *                         generate_audio, watermark. seed and camera_fixed are listed for Seedance 1.x only (strict validation), so not sent.
 *   get task     1521309  status queued | running | cancelled | succeeded | failed | expired; content.video_url (24 h); error {code, message};
 *                         usage.completion_tokens (2.0 series bill a minimum token count when the input has video).
 *   images       1541523  POST /images/generations: Seedream 5.0 pro / flash, size 1K/1.5K/2K or "WxH" (921,600…4,624,220 px, ratio 1/16…16),
 *                         image ≤10 (URL or data URI), response_format url | b64_json, output_format, watermark (default true → false). No seed.
 *   pricing      model-pricing  tokens = (input video s + output s) × W × H × fps ÷ 1024 at 24 fps; $/1M tokens below; Seedream per image.
 *   errors       1299023  error codes (below).
 *   portraits    2608626  Seedance 2.x refuses input images / videos with real human faces (InputImageSensitiveContentDetected.PrivacyInformation).
 */
import { handOff } from '../mediaHandoff.js';
import path from 'node:path';
import { DirectError, registerDirectProvider, type DirectCost, type DirectReason, type DirectSpec, type PollState } from './direct.js';
import type { HttpRequest } from '../hostedRequests.js';
import type { HostedPrice } from '../shared/hostedPrices.js';
import type { RouteDef } from '../routing/types.js';
import { BITRATES, videoCapsBlock, type VideoLimits } from '../tools/h3/videoCaps.js';
import { imageRefs } from '../routing/routerModels.js';
import { routerImageSize } from '../shared/routerImageSizes.js';

const D = '2026-10-23' as const;
const ARK = 'https://ark.ap-southeast.bytepluses.com/api/v3';
const ENV = 'OPENHIGGSFIELD_ARK_API_KEY';
const DOCS = 'https://docs.byteplus.com/en/docs/ModelArk';
const VIDEO_DOC = `${DOCS}/1520757`; const IMAGE_DOC = `${DOCS}/1541523`; const PRICE_DOC = `${DOCS}/model-pricing`;
type Job = { id: string; input: Record<string, any> };
type In = Record<string, any>;

// ---------------------------------------------------------------- errors
/** The friendly line for ModelArk's real-person refusal (docs 2608626: Seedance 2.x takes no input image or video with a real human face). */
export const REAL_FACE_LINE = "BytePlus won't take input images or videos that show a real person's face. Try an illustration or a photo without a recognisable face, or pick another model.";
export const ACTIVATE_LINE = 'Activate this model in the ModelArk console (Model activation page) for the region of your key, then try again.';
/** ModelArk error code (docs 1299023) → our reason, plus an extra plain line where it helps. */
export function arkReason(code: string, status: number, message = ''): { reason: DirectReason; line?: string } {
  const c = String(code ?? '');
  if (/\.PrivacyInformation$/.test(c)) return { reason: 'input_invalid', line: REAL_FACE_LINE };
  if (/SensitiveContentDetected/.test(c)) return { reason: 'content_blocked' };
  if (/^(ModelNotOpen|OperationDenied\.ServiceNotOpen|InvalidEndpointOrModel\.)/.test(c)) return { reason: 'key_invalid', line: ACTIVATE_LINE };
  if (/^(AuthenticationError|InvalidAccountStatus|AccessDenied|OperationDenied\.PermissionDenied)$/.test(c)) return { reason: 'key_invalid' };
  if (/^(AccountOverdueError|OperationDenied\.ServiceOverdue)$/.test(c)) return { reason: 'provider_credits', line: 'Top up your BytePlus balance, then try again.' };
  if (c === 'SetLimitExceeded') return { reason: 'provider_credits', line: 'Your ModelArk inference limit for this model is reached (Safe Experience Mode): raise or turn it off on the Model activation page.' };
  if (c === 'QuotaExceeded' && /free trial/i.test(message)) return { reason: 'provider_credits', line: ACTIVATE_LINE };
  if (/RateLimitExceeded$|^RateLimitExceeded\.|^(QuotaExceeded|ServerOverloaded|RequestBurstTooFast|InflightBatchsizeExceeded)$/.test(c)) return { reason: 'queue_full' };
  if (/^(InvalidParameter|MissingParameter|InvalidImageURL|InvalidArgumentError)/.test(c)) return { reason: 'input_invalid' };
  if (c === 'InternalServiceError') return { reason: 'provider_error' };
  const s = Number(status);
  return { reason: s === 401 || s === 403 ? 'key_invalid' : s === 402 ? 'provider_credits' : s === 429 ? 'queue_full' : s >= 400 && s < 500 ? 'input_invalid' : 'provider_error' };
}
const cut = (s: string) => s.slice(0, 300);
/** ModelArk error body { error: { code, message } } → DirectError. */
export function arkError(status: number, j: any, text = '', where = 'submit'): DirectError {
  const e = j?.error ?? j ?? {}; const code = String(e.code ?? ''); const msg = String(e.message ?? text ?? '');
  const r = arkReason(code, status, msg);
  return new DirectError(`BytePlus ${where} ${status}${code ? ` ${code}` : ''}: ${cut(msg)}${r.line ? ` ${r.line}` : ''}`, r.reason, status);
}
registerDirectProvider({ id: 'byteplus', name: 'BytePlus ModelArk', tag: 'BytePlus', auth: (key) => ({ Authorization: `Bearer ${key}` }), defaultBase: ARK, baseEnv: 'ARK_BASE_URL',
  pollMs: 5000, httpError: (s, j, t) => arkError(s, j, t) });

// ---------------------------------------------------------------- price formula
/** Seedance $ per 1M tokens (model-pricing, 2026-10-23): no video input / with video input, by output tier. */
export const SEEDANCE_RATES: Record<string, Record<string, { none: number; withVideo: number }>> = {
  'seedance-2.0': { '480p': { none: 7.0, withVideo: 4.3 }, '720p': { none: 7.0, withVideo: 4.3 }, '1080p': { none: 7.7, withVideo: 4.7 }, '4K': { none: 4.0, withVideo: 2.4 } },
  'seedance-2.0-fast': { '480p': { none: 5.6, withVideo: 3.3 }, '720p': { none: 5.6, withVideo: 3.3 } },
  'seedance-2.0-mini': { '480p': { none: 3.5, withVideo: 2.1 }, '720p': { none: 3.5, withVideo: 2.1 } },
  'seedance-2.5': { '480p': { none: 10.7, withVideo: 6.4 }, '720p': { none: 10.7, withVideo: 6.4 }, '1080p': { none: 11.7, withVideo: 7.0 } },
};
/** Output W×H per tier and ratio (create-task page, "Width and height pixel values", Seedance 2.0 series / 2.5 columns). */
const SIZES_20: Record<string, Record<string, [number, number]>> = {
  '480p': { '16:9': [864, 496], '4:3': [752, 560], '1:1': [640, 640], '3:4': [560, 752], '9:16': [496, 864], '21:9': [992, 432] },
  '720p': { '16:9': [1280, 720], '4:3': [1112, 834], '1:1': [960, 960], '3:4': [834, 1112], '9:16': [720, 1280], '21:9': [1470, 630] },
  '1080p': { '16:9': [1920, 1080], '4:3': [1664, 1248], '1:1': [1440, 1440], '3:4': [1248, 1664], '9:16': [1080, 1920], '21:9': [2206, 946] },
  '4K': { '16:9': [3840, 2160], '4:3': [3326, 2494], '1:1': [2880, 2880], '3:4': [2494, 3326], '9:16': [2160, 3840], '21:9': [4398, 1886] },
};
const SIZES_25: typeof SIZES_20 = { ...SIZES_20, '480p': { ...SIZES_20['480p'], '16:9': [854, 480], '9:16': [480, 854] } };
export const SEEDANCE_SIZES = (model: string) => (model === 'seedance-2.5' ? SIZES_25 : SIZES_20);
export const SEEDANCE_FPS = 24;
/** Tokens per output second at the LARGEST-token ratio of a tier (480p 21:9 / 16:9, 720p 4:3, 1080p 21:9, 4K 4:3), so the quote never runs under. */
export const seedanceTokensPerSec = (model: string, tier: string) => Math.max(...Object.values(SEEDANCE_SIZES(model)[tier] ?? {}).map(([w, h]) => (w * h * SEEDANCE_FPS) / 1024));
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
/** $ per output second for a tier (= tokens/s × $/1M). */
export const seedanceUsdPerSec = (model: string, tier: string, withVideo = false) => { const r = SEEDANCE_RATES[model]?.[tier]; return r ? r6((seedanceTokensPerSec(model, tier) * (withVideo ? r.withVideo : r.none)) / 1e6) : null; };
const byTier = (model: string, withVideo: boolean) => Object.fromEntries(Object.keys(SEEDANCE_RATES[model]).map((t) => [t, seedanceUsdPerSec(model, t, withVideo)!]));

/** Seedream per image (model-pricing): Pro ≤2.61 MP $0.045, above $0.09, input images from the 2nd $0.003; Flash $0.018, inputs free. */
export const SEEDREAM = {
  pro: { id: 'dola-seedream-5-0-pro-260628', small: 0.045, large: 0.09, splitPx: 2_610_000, refUsd: 0.003, freeRefs: 1 },
  flash: { id: 'dola-seedream-5-0-flash-260915', small: 0.018, large: 0.018, splitPx: Infinity, refUsd: 0, freeRefs: 0 },
} as const;

// ---------------------------------------------------------------- Seedance video
export const SEEDANCE_MODELS: Record<string, { id: string; name: string; maxRefImages: number; maxRefAudio: number; frameRatioAdaptive: boolean }> = {
  'seedance-2.0': { id: 'dreamina-seedance-2-0-260128', name: 'Seedance 2.0', maxRefImages: 9, maxRefAudio: 3, frameRatioAdaptive: false },
  'seedance-2.0-fast': { id: 'dreamina-seedance-2-0-fast-260128', name: 'Seedance 2.0 Fast', maxRefImages: 9, maxRefAudio: 3, frameRatioAdaptive: false },
  'seedance-2.0-mini': { id: 'dreamina-seedance-2-0-mini-260615', name: 'Seedance 2.0 Mini', maxRefImages: 9, maxRefAudio: 3, frameRatioAdaptive: false },
  // 2.5: first-frame and first + last frame keep the first frame's ratio ("only supports adaptive")
  'seedance-2.5': { id: 'dreamina-seedance-2-5-260628', name: 'Seedance 2.5', maxRefImages: 30, maxRefAudio: 10, frameRatioAdaptive: true },
};
const RATIOS = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'];
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.bmp': 'image/bmp', '.gif': 'image/gif', '.tif': 'image/tiff', '.tiff': 'image/tiff',
  '.heic': 'image/heic', '.heif': 'image/heif', '.mp3': 'audio/mp3', '.wav': 'audio/wav' };
/** Local file → what ModelArk takes, through the shared hand-off (mediaHandoff.ts): images and audio as data:<type>/<lowercase format>;base64
 *  (the original bytes: ModelArk takes up to 30 MB per image and 64 MB per request, and keeps trusting its own unedited outputs as inputs);
 *  a video only as a public link (the server's public address or a Comfy storage link), never inline. */
export const arkDataUri = async (file: string) => { const ext = path.extname(file).toLowerCase(); const mime = MIME[ext] ?? (/\.(mp4|mov|webm)$/.test(ext) ? 'video/mp4' : 'image/png');
  const kind = mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : 'image';
  return handOff(file, kind, 'byteplus', { mime, who: 'BytePlus ModelArk' }); };
const promptOf = (i: In) => String(i.hostedPrompt ?? i.finalPrompt ?? i.prompt ?? '');
const modeOf = (i: In) => String(i.mode ?? 't2v');
const refPathsOf = (i: In): string[] => (Array.isArray(i.refPaths) && i.refPaths.length ? i.refPaths : i.imagePath ? [i.imagePath] : []);
const tierOf = (r: unknown) => { const s = String(r ?? '').toLowerCase(); return s === '4k' ? '4K' : ['480p', '720p', '1080p'].includes(s) ? s : '720p'; };
/** POST /contents/generations/tasks body. `uri` turns a local file into what ModelArk takes (data URI; tests pass a stub). */
export async function seedanceBody(model: string, i: In, uri: (file: string) => Promise<string> = arkDataUri): Promise<Record<string, unknown>> {
  const M = SEEDANCE_MODELS[model]; const m = modeOf(i); const content: any[] = [{ type: 'text', text: promptOf(i) }];
  const frame = (m === 'i2v' || m === 'flf') && i.imagePath; const last = m === 'flf' && i.imagePath && i.lastFramePath;
  if (frame) content.push({ type: 'image_url', image_url: { url: await uri(i.imagePath) }, role: 'first_frame' });
  if (last) content.push({ type: 'image_url', image_url: { url: await uri(i.lastFramePath) }, role: 'last_frame' });
  if (m === 'r2v') {
    for (const p of refPathsOf(i).slice(0, M.maxRefImages)) content.push({ type: 'image_url', image_url: { url: await uri(p) }, role: 'reference_image' });
    for (const p of (i.refAudioPaths ?? []).slice(0, M.maxRefAudio)) content.push({ type: 'audio_url', audio_url: { url: await uri(p) }, role: 'reference_audio' });
  }
  const want = RATIOS.includes(i.aspect) ? i.aspect : 'adaptive';
  return { model: M.id, content, resolution: tierOf(i.resolution) === '4K' ? '4k' : tierOf(i.resolution), ratio: frame && M.frameRatioAdaptive ? 'adaptive' : want,
    duration: Math.round(Number(i.duration) || 5), generate_audio: i.audio !== false, watermark: false };
}
export const seedanceRequest = async (model: string, job: Job): Promise<HttpRequest> => ({ method: 'POST', url: `${ARK}/contents/generations/tasks`, headers: {}, body: await seedanceBody(model, job.input) });
/** GET task → our poll state. */
export function parseSeedanceTask(j: any): PollState {
  const st = String(j?.status ?? '');
  if (st === 'queued' || st === 'running' || !st) return { done: false, status: st || 'queued' };
  if (st === 'succeeded') return { done: true, status: st, outputs: j?.content?.video_url ? [{ url: String(j.content.video_url), mime: 'video/mp4' }] : [] };
  if (st === 'expired') return { done: true, status: st, error: new DirectError('BytePlus: the task expired before it ran (queue too long)', 'queue_full') };
  if (st === 'cancelled') return { done: true, status: st, error: new DirectError('BytePlus: the task was cancelled', 'provider_error') };
  const code = String(j?.error?.code ?? ''); const r = arkReason(code, 400, String(j?.error?.message ?? ''));
  return { done: true, status: st, error: new DirectError(`BytePlus: ${code || 'failed'}: ${cut(String(j?.error?.message ?? 'the task failed'))}${r.line ? ` ${r.line}` : ''}`, code ? r.reason : 'provider_error') };
}
/** Real cost: usage.completion_tokens × the tier's $/1M (no video input: jobs with reference videos are refused on these routes). */
export function seedanceCost(model: string, j: any, input: In): DirectCost | null {
  const t = Number(j?.usage?.completion_tokens); if (!(t > 0)) return null;
  const rate = SEEDANCE_RATES[model]?.[tierOf(j?.resolution ?? input.resolution)]?.none; if (rate == null) return null;
  return { usd: Math.round(((t * rate) / 1e6) * 1e4) / 1e4, units: t, unitLabel: 'tokens', settled: true, source: 'byteplus:usage.completion_tokens' };
}
export const seedanceSpec = (model: string): DirectSpec => ({ provider: 'byteplus', mode: 'poll', build: (job) => seedanceRequest(model, job),
  submit: (j, _req, base) => { if (!j?.id) throw new DirectError('BytePlus: no task id in the answer', 'provider_error'); return { id: String(j.id), pollUrl: `${base}/contents/generations/tasks/${encodeURIComponent(String(j.id))}` }; },
  poll: parseSeedanceTask, cost: (j, job) => seedanceCost(model, j, job.input) });

// ---------------------------------------------------------------- Seedream images
/** W×H with area ≈ `area` at our aspect, multiples of 8 (method 2; 1K = 1024² and 2K = 2048² both sit inside 921,600…4,624,220 px). */
const ratioOf = (a: string) => { const [x, y] = a.split(/[:x]/).map(Number); return x > 0 && y > 0 ? x / y : 1; };
export const seedreamSize = (aspect: unknown, res: unknown, kind?: 'pro' | 'flash') => { /* a listed shape: the same exact size as the Comfy Router route (shared/routerImageSizes.ts) */
  const listed = kind && typeof aspect === 'string' ? routerImageSize(kind === 'pro' ? 'api-seedream' : 'api-seedream-flash', aspect, typeof res === 'string' ? res : '1K') : null; if (listed) return listed; const area = res === '2K' ? 2048 * 2048 : 1024 * 1024; const r = typeof aspect === 'string' && aspect && aspect !== 'auto' ? ratioOf(aspect) : 1;
  const w = Math.round(Math.sqrt(area * r) / 8) * 8; return `${w}x${Math.round(area / w / 8) * 8}`; };
/** POST /images/generations body for one output (routing/run.ts sends one request per image, with that shot's prompt in hostedPrompt). */
export async function seedreamBody(kind: 'pro' | 'flash', i: In, uri: (file: string) => Promise<string> = arkDataUri): Promise<Record<string, unknown>> {
  const refs = imageRefs(i).slice(0, 10); const imgs = await Promise.all(refs.map(uri));
  const prompt = String(i.hostedPrompt || i.finalPrompt || i.prompt || '');
  return { model: SEEDREAM[kind].id, prompt, size: seedreamSize(i.aspect, i.imageResolution, kind), response_format: 'url', output_format: 'png', watermark: false,
    ...(imgs.length ? { image: imgs.length === 1 ? imgs[0] : imgs } : {}) };
}
export function parseSeedream(j: any) {
  if (j?.error?.code) throw arkError(400, j, '', 'image');
  return (j?.data ?? []).map((d: any) => (d?.b64_json ? { b64: String(d.b64_json), mime: 'image/png' } : { url: String(d?.url ?? ''), mime: 'image/png' })).filter((o: any) => o.b64 || o.url);
}
/** Real cost: usage.generated_images × the size tier (data[].size) + input images beyond the free one (Pro). */
export function seedreamCost(kind: 'pro' | 'flash', j: any): DirectCost | null {
  const S = SEEDREAM[kind]; const n = Number(j?.usage?.generated_images ?? (j?.data ?? []).length); if (!(n > 0)) return null;
  const px = (j?.data ?? []).map((d: any) => String(d?.size ?? '').split('x').map(Number)).map(([w, h]: number[]) => (w > 0 && h > 0 ? w * h : 0));
  const outUsd = Array.from({ length: n }, (_, k) => ((px[k] ?? px[0] ?? 0) > S.splitPx ? S.large : S.small)).reduce((a, b) => a + b, 0);
  const refs = Math.max(0, Number(j?.usage?.input_images ?? 0) - S.freeRefs) * S.refUsd;
  return { usd: Math.round((outUsd + refs) * 1e4) / 1e4, units: n, unitLabel: 'images', settled: true, source: 'byteplus:usage.generated_images' };
}
export const seedreamSpec = (kind: 'pro' | 'flash'): DirectSpec => ({ provider: 'byteplus', mode: 'sync', perOutput: true,
  build: async (job) => ({ method: 'POST', url: `${ARK}/images/generations`, headers: {}, body: await seedreamBody(kind, job.input) }),
  sync: (j) => ({ outputs: parseSeedream(j), id: null }), cost: (j) => seedreamCost(kind, j) });

// ---------------------------------------------------------------- limits (Generate Video)
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
const lim = (o: Partial<VideoLimits> & Pick<VideoLimits, 'resolutions' | 'maxResolution' | 'source'>): VideoLimits => ({ defaultSeconds: 5, minSeconds: 4, maxSeconds: 15, durationStep: 1, durations: range(4, 15),
  aspects: ['auto', ...RATIOS], audio: { supported: true, toggle: true, default: true, priceAffects: false, off: 'provider' }, refKinds: { image: 9, audio: 3 },
  bitrate: BITRATES.map((b) => b.value), bitratePriceAffects: false, verified: true, ...o });
const SRC = (what: string) => `${VIDEO_DOC} (${what}; read 2026-10-23)`;
/** Per route / engine. Reference videos are left out: ModelArk takes them only as public URLs or asset:// ids and bills a minimum token count we can't quote. */
export const BYTEPLUS_VIDEO_LIMITS: Record<string, VideoLimits> = {
  // the Seedance 2.0 route on the router-seedance engine (its engine tiers: 480p / 720p / 1080p; ModelArk's 4k is not offered here)
  'direct:byteplus/seedance-2.0': lim({ maxResolution: '1080p', resolutions: ['720p', '480p', '1080p'], source: SRC('dreamina-seedance-2-0-260128: 4–15 s, 480p/720p/1080p (4k not offered), 6 ratios + adaptive, refs 9 images / 3 audio') }),
  'direct-seedance-20-fast': lim({ maxResolution: '720p', resolutions: ['720p', '480p'], source: SRC('dreamina-seedance-2-0-fast-260128: 4–15 s, 480p/720p, 6 ratios + adaptive, refs 9 images / 3 audio') }),
  'direct-seedance-20-mini': lim({ maxResolution: '720p', resolutions: ['720p', '480p'], source: SRC('dreamina-seedance-2-0-mini-260615: 4–15 s, 480p/720p, 6 ratios + adaptive, refs 9 images / 3 audio') }),
  'direct-seedance-25': lim({ maxResolution: '1080p', resolutions: ['720p', '480p', '1080p'], maxSeconds: 30, durations: range(4, 30), refKinds: { image: 30, audio: 10 },
    source: SRC('dreamina-seedance-2-5-260628: 4–30 s, 480p/720p/1080p, first-frame jobs keep the frame ratio, refs 30 images / 10 audio') }),
};

// ---------------------------------------------------------------- routes
const VIDEO_ENDPOINT = (id: string) => `POST ${ARK}/contents/generations/tasks (model ${id}, Bearer; poll GET /contents/generations/tasks/{id})`;
/** Why a Generate Video job can't run on a Seedance ModelArk route (null = fine). */
export const seedanceBlock = (model: string, limitsKey: string) => (i: In): string | null => {
  const M = SEEDANCE_MODELS[model]; const L = BYTEPLUS_VIDEO_LIMITS[limitsKey]; const m = modeOf(i);
  if (i.draft) return `${M.name} on BytePlus has no draft mode`;
  if (!['t2v', 'i2v', 'flf', 'r2v'].includes(m) || i.videoPath || i.speechPath) return `${M.name} on BytePlus runs Generate Video jobs here (text, first or last frame, reference images)`;
  if (i.refVideoPaths?.length) return `${M.name} on BytePlus takes reference videos only as public web links (and bills a minimum we can't quote), so jobs with a reference video run on another route`;
  if ((m === 'i2v' || m === 'flf') && !i.imagePath) return `${M.name} needs the first frame for this job`;
  if (m === 'r2v' && !refPathsOf(i).length) return `${M.name} needs at least one reference image here (it takes no audio-only jobs)`;
  const n = m === 'r2v' ? refPathsOf(i).length : 0; if (n > M.maxRefImages) return `${M.name} takes up to ${M.maxRefImages} reference images; you added ${n}`;
  const a = m === 'r2v' ? (i.refAudioPaths ?? []).length : 0; if (a > M.maxRefAudio) return `${M.name} takes up to ${M.maxRefAudio} reference audio clips; you added ${a}`;
  const res = String(i.resolution ?? '').toLowerCase(); if (res && !L.resolutions.includes(res)) return `${M.name} makes ${L.resolutions.slice().sort().join(', ')} clips`;
  const d = Number(i.duration); if (i.duration != null && i.duration !== '' && !(Number.isInteger(d) && d >= L.minSeconds && d <= L.maxSeconds)) return `${M.name} makes clips of ${L.minSeconds}–${L.maxSeconds} s`;
  if (i.aspect && i.aspect !== 'auto' && !RATIOS.includes(i.aspect)) return `${M.name} doesn't do ${i.aspect}; it does ${RATIOS.join(', ')}`;
  return null;
};
const VIDEO_CAPS = { audio: true, audioBadge: 'Audio on', firstLastFrame: true };
const L20 = 'direct:byteplus/seedance-2.0';
const seedance20: RouteDef = { routeId: 'direct:byteplus/seedance-2.0', kind: 'direct', modelId: 'router-seedance', vendor: 'byteplus', envKey: ENV, priceRef: 'direct:byteplus/seedance-2.0',
  tools: ['h3-video'], output: 'video', modes: ['t2v', 'i2v', 'flf', 'r2v'], endpoint: VIDEO_ENDPOINT(SEEDANCE_MODELS['seedance-2.0'].id), sourceUrl: VIDEO_DOC, checkedAt: D,
  label: 'Seedance 2.0 via BytePlus ModelArk', typicalLatencySec: 150, latencyEstimated: true, latencySource: 'estimated: BytePlus publishes no latency; recorded per run',
  direct: seedanceSpec('seedance-2.0'), // route caps the way routeCaps() shapes them: the limits block at the top, `audio` kept boolean, the toggle detail in audioToggle
  caps: { ...VIDEO_CAPS, ...videoCapsBlock(BYTEPLUS_VIDEO_LIMITS[L20]), audio: true, audioToggle: BYTEPLUS_VIDEO_LIMITS[L20].audio, maxRefs: 9 },
  unavailableFor: seedanceBlock('seedance-2.0', L20) };
const seedream = (kind: 'pro' | 'flash', modelId: string): RouteDef => ({ routeId: `direct:byteplus/seedream-5.0-${kind}`, kind: 'direct', modelId, vendor: 'byteplus', envKey: ENV, priceRef: `direct:byteplus/seedream-5.0-${kind}`,
  output: 'image', modes: ['generate', 'edit'], endpoint: `POST ${ARK}/images/generations (model ${SEEDREAM[kind].id}, Bearer, response_format url, watermark false)`, sourceUrl: IMAGE_DOC, checkedAt: D,
  label: `Seedream 5.0 ${kind === 'pro' ? 'Pro' : 'Flash'} via BytePlus ModelArk`, typicalLatencySec: kind === 'pro' ? 20 : 8, latencyEstimated: true, latencySource: 'estimated: BytePlus publishes no latency; recorded per run',
  caps: { resolutions: ['1K', '2K'], maxRefs: 10 }, direct: seedreamSpec(kind), refsPriced: (i: In) => Math.min(10, imageRefs(i).length),
  unavailableFor: (i: In) => { const n = imageRefs(i).length; return String(i.mode ?? '') === 'inpaint' || i.maskPath ? "Seedream on BytePlus doesn't take a mask; inpaint runs on another route" : n > 10 ? `Seedream 5.0 takes up to 10 reference images; you added ${n}` : i.imageResolution === '4K' ? 'Seedream 5.0 on BytePlus makes 1K or 2K images' : null; } });
export const BYTEPLUS_ROUTES: Record<string, RouteDef[]> = {
  'router-seedance': [seedance20],
  'api-seedream': [seedream('pro', 'api-seedream')],
  'api-seedream-flash': [seedream('flash', 'api-seedream-flash')],
};
/** Native routes of the new engines (providers.ts direct(...)); fields merged like NATIVE_DIRECT. */
const native = (model: string, engine: string, latency: number): Partial<RouteDef> => ({ vendor: 'byteplus', label: `${SEEDANCE_MODELS[model].name} via BytePlus ModelArk`, output: 'video', modes: ['t2v', 'i2v', 'flf', 'r2v'],
  endpoint: VIDEO_ENDPOINT(SEEDANCE_MODELS[model].id), sourceUrl: VIDEO_DOC, checkedAt: D, typicalLatencySec: latency, direct: seedanceSpec(model),
  caps: { ...VIDEO_CAPS, maxRefs: SEEDANCE_MODELS[model].maxRefImages, videoCaps: videoCapsBlock(BYTEPLUS_VIDEO_LIMITS[engine]) }, unavailableFor: seedanceBlock(model, engine) });
export const BYTEPLUS_NATIVE: Record<string, Partial<RouteDef>> = {
  'direct-seedance-20-fast': native('seedance-2.0-fast', 'direct-seedance-20-fast', 90),
  'direct-seedance-20-mini': native('seedance-2.0-mini', 'direct-seedance-20-mini', 60),
  'direct-seedance-25': native('seedance-2.5', 'direct-seedance-25', 180),
};

// ---------------------------------------------------------------- price rows (quote = charge through priceOf)
const videoNote = (model: string) => { const T = Object.keys(SEEDANCE_RATES[model]); const R = SEEDANCE_RATES[model];
  return `ModelArk $/1M tokens, no video input: ${T.map((t) => `${t} ${R[t].none}`).join(', ')}. Tokens per output second = W×H×24/1024 at the largest-token ratio of each tier (${T.map((t) => `${t} ${Math.round(seedanceTokensPerSec(model, t))}`).join(', ')}), so other ratios cost a little less than quoted. Audio on or off costs the same. Real cost = usage.completion_tokens × the rate.`; };
const videoRow = (providerId: string, model: string, label: string): HostedPrice => { const top = Object.keys(SEEDANCE_RATES[model]).includes('720p') ? '720p' : Object.keys(SEEDANCE_RATES[model])[0];
  return { providerId, model: `${label} (${SEEDANCE_MODELS[model].id}, BytePlus ModelArk), no video input`, unit: 'second', usd: seedanceUsdPerSec(model, top)!, usdByQuality: byTier(model, false), sourceUrl: PRICE_DOC, checkedAt: D, estimated: false, note: videoNote(model),
    videoInput: { usd: seedanceUsdPerSec(model, top, true)!, usdByQuality: byTier(model, true), note: `With video input: ${Object.entries(SEEDANCE_RATES[model]).map(([t, r]) => `${t} ${r.withVideo}`).join(', ')} $/1M tokens on (input + output s); ModelArk bills a minimum token count with video input. Not used yet: these routes refuse reference videos.` } }; };
export const BYTEPLUS_PRICES: HostedPrice[] = [
  videoRow('direct:byteplus/seedance-2.0', 'seedance-2.0', 'Seedance 2.0'),
  videoRow('direct-seedance-20-fast', 'seedance-2.0-fast', 'Seedance 2.0 Fast'),
  videoRow('direct-seedance-20-mini', 'seedance-2.0-mini', 'Seedance 2.0 Mini'),
  videoRow('direct-seedance-25', 'seedance-2.5', 'Seedance 2.5'),
  { providerId: 'direct:byteplus/seedream-5.0-pro', model: `Seedream 5.0 Pro (${SEEDREAM.pro.id}, BytePlus ModelArk)`, unit: 'image', usd: 0.045, usdByResolution: { '1K': 0.045, '2K': 0.09 }, sourceUrl: PRICE_DOC, checkedAt: D, estimated: false,
    note: 'Per output image: ≤2.61 MP (1.5K or lower) $0.045, above $0.09. Our 1K asks ~1 MP, 2K ~4.2 MP. Real cost = usage.generated_images × the size tier + input images.',
    refImages: { usd: 0.003, free: 1, sourceUrl: PRICE_DOC, checkedAt: D, estimated: false, note: 'Input images: the first is free, then $0.003 each.' } },
  { providerId: 'direct:byteplus/seedream-5.0-flash', model: `Seedream 5.0 Flash (${SEEDREAM.flash.id}, BytePlus ModelArk)`, unit: 'image', usd: 0.018, usdByResolution: { '1K': 0.018, '2K': 0.018 }, sourceUrl: PRICE_DOC, checkedAt: D, estimated: false,
    note: 'Flat $0.018 per output image; input images are free.' },
];
