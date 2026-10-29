/**
 * DirectSpec per lab route (batch 1: BFL, MiniMax, LTX). Each spec turns a job into the lab's request (hostedRequests.ts builders) and reads
 * the lab's responses. Real cost: BFL returns credits; MiniMax returns usage (output seconds, billable characters) priced with the route's own
 * price row (routing/routePrices.ts), so the recorded cost uses the same figures as the quote. LTX returns no cost (the quote stands).
 */
import { handOff } from '../mediaHandoff.js';
import { DirectError, type DirectCost, type DirectSpec, type PollState } from './direct.js';
import { parseBflSubmit, parseBflPoll, parseMinimaxSpeech, minimaxVideoRequest, parseMinimaxVideoTask, minimaxVideoTier, minimaxImageRequest, parseMinimaxImage,
  minimaxSpeechRequest, ltxVideoRequest, parseLtxJob, bflVideoRequest, type HttpRequest, type LtxModel } from '../hostedRequests.js';
import { HOSTED_BY_ID } from '../shared/hostedPrices.js';
import { MINIMAX_CODES } from './direct.js';

type Job = { id: string; input: Record<string, any> };
const promptOf = (i: Record<string, any>) => String(i.hostedPrompt ?? i.finalPrompt ?? i.prompt ?? '');
/** Image → bare base64 through the shared hand-off (BFL keyframes take base64 or URLs). */
export const b64 = (p: string) => handOff(p, 'image', 'bfl', { accepts: ['base64'] });
const uri = async (file: string, job: Job, tag: string, kind: 'image' | 'audio' | 'video', provider: 'minimax' | 'ltx') => (await import('../tools/h3/cloud.js')).fileUri(file, job.id, tag, kind, provider);

// ---- BFL: submit → { id, polling_url, cost }; poll polling_url → Ready result.sample (cost settled) ----
const bflCost = (credits: number, settled: boolean): DirectCost => ({ usd: credits / 100, units: credits, unitLabel: 'BFL credits', settled, source: settled ? 'bfl:settled-cost' : 'bfl:cost' });
export const bflSpec = (build: (job: Job) => Promise<HttpRequest>): DirectSpec => ({ provider: 'bfl', mode: 'poll', build,
  submit: (j) => { const s = parseBflSubmit(j); return { id: s.id, pollUrl: s.pollingUrl, cost: s.cost != null ? bflCost(s.cost, false) : null }; },
  poll: (j): PollState => { const st = String(j?.status); const s: any = parseBflPoll(j); if (!s.done) return { done: false, status: st };
    if (s.error) return { done: true, status: st, error: new DirectError(`bfl: ${s.error}`, /Moderated/.test(s.error) ? 'content_blocked' : 'provider_error') };
    return { done: true, status: st, outputs: [{ url: s.url }], cost: s.cost != null ? bflCost(s.cost, true) : null }; } });
/** FLUX 3 Video on BFL: t2v, or i2v with the first frame (and the end frame for first + last). */
export const bflVideoSpec = bflSpec(async (job) => { const i = job.input; const kf = [i.mode === 'i2v' || i.mode === 'flf' ? i.imagePath : null, i.mode === 'flf' ? i.lastFramePath : null].filter(Boolean) as string[];
  return bflVideoRequest({ prompt: promptOf(i), resolution: i.resolution, duration: i.duration, aspect: i.aspect, audio: i.audio !== false, draft: !!i.draft, keyframes: await Promise.all(kf.map(b64)) }); });

// ---- MiniMax ----
const rate = (priceRef: string, key: string) => { const h = HOSTED_BY_ID[priceRef]; return h?.usdByQuality?.[key] ?? h?.usd ?? 0; };
/** H3 / H3-Max video (v2): submit → task_id; poll /v2/query/video_generation/{id}; cost = usage.output_seconds × the tier rate (+ reference images over 5 × $0.04). */
export const MINIMAX_H3_PRICE = 'direct:minimax/h3';
export const minimaxRefImages = (i: Record<string, any>) => (i.mode === 'r2v' ? Math.min(9, (i.refPaths ?? []).length) : 0);
export const minimaxVideoSpec: DirectSpec = { provider: 'minimax', mode: 'poll',
  build: async (job) => { const i = job.input; const m = String(i.mode ?? 't2v');
    return minimaxVideoRequest({ prompt: promptOf(i), resolution: i.resolution, duration: i.duration, aspect: i.aspect, mode: m,
      first: (m === 'i2v' || m === 'flf') && i.imagePath ? await uri(i.imagePath, job, 'first', 'image', 'minimax') : undefined,
      last: m === 'flf' && i.lastFramePath ? await uri(i.lastFramePath, job, 'last', 'image', 'minimax') : undefined,
      refImages: m === 'r2v' ? await Promise.all((i.refPaths ?? []).slice(0, 9).map((p: string, k: number) => uri(p, job, `ref${k}`, 'image', 'minimax'))) : undefined,
      refAudio: m === 'r2v' ? await Promise.all((i.refAudioPaths ?? []).slice(0, 3).map((p: string, k: number) => uri(p, job, `a${k}`, 'audio', 'minimax'))) : undefined }); },
  submit: (j, _req, base) => { if (!j?.task_id) throw new DirectError('MiniMax: no task_id in the answer', 'provider_error'); return { id: String(j.task_id), pollUrl: `${base}/v2/query/video_generation/${encodeURIComponent(String(j.task_id))}` }; },
  poll: (j): PollState => { const s = parseMinimaxVideoTask(j); if (!s.done) return { done: false, status: s.status };
    if (s.error) { const c = Number(s.errorCode); return { done: true, status: s.status, error: new DirectError(`MiniMax: ${s.error}`, MINIMAX_CODES[c] ?? (s.status === 'cancelled' ? 'provider_error' : 'provider_error')) }; }
    return { done: true, status: s.status, outputs: s.url ? [{ url: s.url }] : [] }; },
  cost: (j, job) => { const sec = Number(j?.task?.usage?.output_seconds); if (!(sec > 0)) return null; const t = minimaxVideoTier(job.input.resolution).ourTier;
    const refs = Math.max(0, minimaxRefImages(job.input) - 5) * 0.04; return { usd: Math.round((sec * rate(MINIMAX_H3_PRICE, t) + refs) * 1e4) / 1e4, units: sec, unitLabel: 'seconds', settled: true, source: 'minimax:usage.output_seconds' }; } };
/** image-01 (sync): data.image_urls (24 h); metadata.failed_count = images held back by MiniMax's safety check. */
export const minimaxImageSpec: DirectSpec = { provider: 'minimax', mode: 'sync', perOutput: true,
  build: async (job) => minimaxImageRequest({ prompt: promptOf(job.input), aspectRatio: job.input.aspect, seed: Number.isInteger(job.input.seed) ? job.input.seed : undefined }),
  sync: (j) => { const r = parseMinimaxImage(j); if (!r.urls.length && !r.b64.length && r.failed) throw new DirectError('MiniMax: the image was held back by its safety check', 'content_blocked');
    return { id: j?.id ? String(j.id) : null, outputs: [...r.urls.map((url) => ({ url })), ...r.b64.map((b) => ({ b64: b, mime: 'image/jpeg' }))], cost: { usd: rate('direct:minimax/image-01', ''), units: 1, unitLabel: 'images', settled: false, source: 'minimax:list-price' } }; } };
/** Speech 2.8 HD / Turbo (sync t2a_v2, output_format url): cost = extra_info.usage_characters / 1000 × the route rate. */
export const minimaxSpeechSpec = (model: 'speech-2.8-hd' | 'speech-2.8-turbo', priceRef: string): DirectSpec => ({ provider: 'minimax', mode: 'sync',
  build: async (job) => { const i = job.input; return minimaxSpeechRequest({ text: String(i.text ?? i.prompt ?? ''), voice: typeof i.voiceId === 'string' && i.voiceId ? i.voiceId : undefined, native: i.voiceNative ?? {}, format: i.voiceControls?.outputFormat, speechModel: model }); },
  sync: (j) => { const s = parseMinimaxSpeech(j); const fmt = String(j?.extra_info?.audio_format ?? 'mp3');
    return { id: s.traceId ?? null, outputs: [s.isUrl ? { url: s.audio } : { hex: s.audio, mime: fmt === 'wav' ? 'audio/wav' : fmt === 'flac' ? 'audio/flac' : 'audio/mpeg' }] }; },
  cost: (j) => { const ch = Number(j?.extra_info?.usage_characters); return ch > 0 ? { usd: Math.round((ch / 1000) * rate(priceRef, '') * 1e4) / 1e4, units: ch, unitLabel: 'characters', settled: true, source: 'minimax:usage_characters' } : null; } });

// ---- LTX: async v2, poll GET /v2/{endpoint}/{id} (≥ 5 s); result.video_url ----
/** Our camera presets → LTX camera_motion (only the moves LTX has). */
export const LTX_CAMERA_OF: Record<string, string> = { 'h3-push-in': 'dolly_in', 'h3-pull-back': 'dolly_out', 'h3-crane': 'jib_up' };
const LTX_FAIL: Record<string, 'content_blocked' | 'provider_credits'> = { content_filtered_error: 'content_blocked', insufficient_funds_error: 'provider_credits' };
export const ltxSpec = (model: LtxModel): DirectSpec => ({ provider: 'ltx', mode: 'poll',
  build: async (job) => { const i = job.input; const img = (i.mode === 'i2v' || i.mode === 'flf') && i.imagePath ? await uri(i.imagePath, job, 'first', 'image', 'ltx') : undefined;
    let aspect = i.aspect; if (img && (!aspect || aspect === 'auto')) { const { videoSize } = await import('../ffmpeg.js'); const s = await videoSize(i.imagePath).catch(() => null); if (s) aspect = s.width >= s.height ? (s.width / s.height > 1.2 ? '16:9' : '1:1') : (s.height / s.width > 1.2 ? '9:16' : '1:1'); }
    return ltxVideoRequest({ model, prompt: promptOf(i), resolution: i.resolution, aspect, duration: i.duration, audio: i.audio !== false, cameraMotion: LTX_CAMERA_OF[String(i.videoPreset ?? '')],
      image: img, lastImage: i.mode === 'flf' && i.lastFramePath ? await uri(i.lastFramePath, job, 'last', 'image', 'ltx') : undefined }); },
  submit: (j, req) => { if (!j?.id) throw new DirectError('LTX: no job id in the answer', 'provider_error'); return { id: String(j.id), pollUrl: `${req.url}/${encodeURIComponent(String(j.id))}` }; },
  poll: (j): PollState => { const s = parseLtxJob(j); if (!s.done) return { done: false, status: s.status };
    if (s.status === 'failed') return { done: true, status: s.status, error: new DirectError(`LTX: ${s.errorType}: ${s.error}`, LTX_FAIL[s.errorType ?? ''] ?? 'provider_error') };
    return { done: true, status: s.status, outputs: s.url ? [{ url: s.url }] : [] }; } });
