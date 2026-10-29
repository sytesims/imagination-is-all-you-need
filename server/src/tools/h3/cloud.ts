/**
 * MiniMax H3 cloud routes (fal / Replicate), additive to routing/. Endpoints, input schemas and prices read on the official pages 2026-10-17
 * (prices live in routing/routePrices.ts with source URL + date; 1 credit = $0.01):
 *   fal minimax/h3/text-to-video       prompt, duration, resolution 480P|768P|2K|4K, aspect_ratio, seed           $0.05/s 480p · $0.06/s 768p
 *   fal minimax/h3/image-to-video      + image_url (first frame), end_image_url (last frame)                       same
 *   fal minimax/h3/reference-to-video  + reference_image_urls ≤9, reference_video_urls ≤3, reference_audio_urls ≤3  same (first 5 ref images free)
 *   fal minimax/h3-max/extend-video    video_url, prompt, duration (s of new footage), resolution, aspect_ratio auto $0.05/s 480p · $0.08/s 768p
 *   replicate minimax/h3               prompt, first_frame_image, last_frame_image, reference_{image,video,audio}_urls, duration 4–15, resolution 768P|2K, ratio
 *                                       $0.08/s 768P (no 480P tier; our 480p jobs are sent and billed at 768P)
 * Files go through the shared media hand-off (mediaHandoff.ts): fal takes small files inline and larger ones from its CDN upload; Replicate's
 * reference_*_urls must be links, made with Replicate's Files API (or the server's public address).
 * Every H3 output carries native stereo audio (caps.audio = true → the "Audio on" badge).
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { RouteDef } from '../../routing/types.js';
import { DATA_DIR } from '../../config.js';
import { runFfmpeg } from '../../ffmpeg.js';
import { H3_CAMERA_MOVES, H3_EXTEND_SECONDS_CLASSIC, H3_EXTEND_MIN_SOURCE } from './catalog.js';
import { VIDEO_LIMITS, routeCaps, routeVideoReason } from './videoCaps.js';

export const H3_CHECKED = '2026-10-17';
const FAL_ENV = 'OPENHIGGSFIELD_FAL_KEY'; const REP_ENV = 'OPENHIGGSFIELD_REPLICATE_API_TOKEN';
const LAT = 'estimated: H3 768p runs take ~1–2 min on fal/Replicate per their example timings; recorded per run';
export { publicBase } from '../../mediaHandoff.js';
import { handOff, canLink, type HandOffProvider } from '../../mediaHandoff.js';
const RATIOS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];
const res = (r?: string) => (r === '480p' ? '480P' : '768P');
const dur = (d: unknown, lo = 4, hi = 15) => Math.min(hi, Math.max(lo, Math.round(Number(d) || 5)));
/** Shared local-route capabilities for Generate Video (local FL2VA int8). */
export const H3_VIDEO_CAPS = { audio: true, audioBadge: 'Audio on', modes: ['t2v', 'i2v', 'flf', 'r2v'], quality: ['fast', 'quality'], firstLastFrame: true, durations: [6, 10, 15], resolutions: ['768p', '480p'], maxSeconds: 15, fps: 24 };
const CLOUD_VIDEO_CAPS = (modes: string[], extra: Record<string, unknown> = {}) => ({ audio: true, audioBadge: 'Audio on', modes, quality: ['quality'], firstLastFrame: modes.includes('flf'), durations: [6, 10, 15], resolutions: ['768p', '480p'], maxSeconds: 15, fps: 24, ...extra });

/** A job file for a fal / Replicate / MiniMax / LTX field (images: resized to ≤1344 px JPEG first). The form comes from the shared hand-off. */
export async function fileUri(file: string, jobId: string, tag: string, kind: 'image' | 'audio' | 'video', provider: HandOffProvider = 'fal'): Promise<string> {
  if (kind === 'image') {
    const out = path.join(DATA_DIR, `${jobId}-h3${tag}.jpg`);
    if ((await runFfmpeg(['-y', '-v', 'error', '-i', file, '-vf', 'scale=1344:1344:force_original_aspect_ratio=decrease', '-q:v', '3', '-frames:v', '1', out])) !== 0) throw new Error('could not prepare image');
    return handOff(out, 'image', provider, { mime: 'image/jpeg' });
  }
  return handOff(file, kind, provider, { mime: kind === 'audio' ? (/\.mp3$/i.test(file) ? 'audio/mpeg' : 'audio/wav') : 'video/mp4' });
}
/** Replicate reference_*_urls: links only (Replicate Files API upload, or the server's public address). */
const publicUrl = (file: string, kind: 'image' | 'audio' | 'video') => handOff(file, kind, 'replicate', { accepts: ['url'], who: 'MiniMax H3 on Replicate' });
type Job = { id: string; input: Record<string, any> };
/** fal request body per endpoint (schemas above). */
export async function h3FalBody(slug: string, job: Job): Promise<Record<string, unknown>> {
  const i = job.input; const prompt = String(i.hostedPrompt ?? i.finalPrompt ?? i.prompt ?? '');
  const base: Record<string, unknown> = { prompt, resolution: res(i.resolution), prompt_expansion_mode: 'disabled', ...(Number.isInteger(i.seed) ? { seed: i.seed } : {}) };
  if (slug.endsWith('/extend-video')) return { prompt, video_url: await fileUri(i.videoPath, job.id, 'src', 'video'), duration: Number(i.extendSeconds) || 5, resolution: res(i.resolution), aspect_ratio: 'auto', output: 'continuation', enable_prompt_expansion: false, ...(Number.isInteger(i.seed) ? { seed: i.seed } : {}) };
  base.duration = dur(i.duration);
  if (slug.endsWith('/text-to-video')) return { ...base, aspect_ratio: RATIOS.includes(i.aspect) ? i.aspect : '16:9' };
  if (slug.endsWith('/image-to-video')) return { ...base, ...(i.imagePath ? { image_url: await fileUri(i.imagePath, job.id, 'first', 'image') } : {}), ...(i.lastFramePath ? { end_image_url: await fileUri(i.lastFramePath, job.id, 'last', 'image') } : {}) };
  // reference-to-video: refs (r2v) or portrait + speech (lipsync)
  const imgs: string[] = i.refPaths ?? (i.imagePath ? [i.imagePath] : []);
  const vids: string[] = (i.refVideoPaths ?? []).slice(0, 3); const auds: string[] = (i.refAudioPaths ?? []).slice(0, 3);
  return { ...base, aspect_ratio: 'adaptive', reference_image_urls: await Promise.all(imgs.slice(0, 9).map((f, k) => fileUri(f, job.id, `ref${k}`, 'image'))),
    ...(vids.length ? { reference_video_urls: await Promise.all(vids.map((f) => fileUri(f, job.id, 'v', 'video'))) } : {}),
    ...(auds.length && !i.speechPath ? { reference_audio_urls: await Promise.all(auds.map((f, k) => fileUri(f, job.id, `a${k}`, 'audio'))) } : {}),
    ...(i.speechPath ? { reference_audio_urls: [await fileUri(i.speechPath, job.id, 'speech', 'audio')], duration: dur(i.duration, 2) } : {}) };
}
export async function h3ReplicateBody(job: Job): Promise<Record<string, unknown>> {
  const i = job.input; const prompt = String(i.hostedPrompt ?? i.finalPrompt ?? i.prompt ?? '');
  const body: Record<string, unknown> = { prompt, duration: dur(i.duration), resolution: '768P' };
  if (i.mode === 't2v') body.ratio = RATIOS.includes(i.aspect) ? i.aspect : '16:9'; else body.ratio = 'adaptive';
  if ((i.mode === 'i2v' || i.mode === 'flf') && i.imagePath) body.first_frame_image = await fileUri(i.imagePath, job.id, 'first', 'image', 'replicate');
  if (i.mode === 'flf' && i.lastFramePath) body.last_frame_image = await fileUri(i.lastFramePath, job.id, 'last', 'image', 'replicate');
  if (i.mode === 'r2v' || i.mode === 'lipsync') body.reference_image_urls = await Promise.all((i.refPaths ?? (i.imagePath ? [i.imagePath] : [])).slice(0, 9).map((f: string) => publicUrl(f, 'image')));
  if (i.mode === 'r2v' && i.refVideoPaths?.length) body.reference_video_urls = await Promise.all(i.refVideoPaths.slice(0, 3).map((f: string) => publicUrl(f, 'video')));
  if (i.speechPath) body.reference_audio_urls = [await publicUrl(i.speechPath, 'audio')]; else if (i.mode === 'r2v' && i.refAudioPaths?.length) body.reference_audio_urls = await Promise.all(i.refAudioPaths.slice(0, 3).map((f: string) => publicUrl(f, 'audio')));
  return body;
}
type Mk = (o: { kind: 'fal' | 'replicate'; slug: string; label: string; sec: number; modes: string[]; caps: Record<string, unknown>; id?: string }) => RouteDef;
const needsPublic = (i: Record<string, any>) => ((i.mode === 'r2v' || i.mode === 'lipsync' || i.speechPath) && !canLink('replicate') ? "Replicate takes your reference files as links, uploaded with your Replicate token (or the server's public address). Add the token, or use the fal route" : null);
const video = (r: RouteDef, body: (job: Job) => Promise<Record<string, unknown>>): RouteDef => {
  const gv = r.modelId === 'comfy-h3'; const prev = r.unavailableFor;
  return { ...r, latencySource: LAT, checkedAt: H3_CHECKED, output: 'video', request: body, ...(gv ? { caps: { ...r.caps, ...routeCaps(r.routeId, VIDEO_LIMITS['comfy-h3']) },
    unavailableFor: (i: Record<string, any>) => prev?.(i) ?? routeVideoReason(r.routeId, i) } : {}) };
};
/** Generate Video (model comfy-h3). */
export const h3VideoRoutes = (mk: Mk): RouteDef[] => [
  video(mk({ kind: 'fal', slug: 'minimax/h3/text-to-video', label: 'MiniMax H3', sec: 90, modes: ['t2v'], caps: CLOUD_VIDEO_CAPS(['t2v']) }), (j) => h3FalBody('minimax/h3/text-to-video', j)),
  video(mk({ kind: 'fal', slug: 'minimax/h3/image-to-video', label: 'MiniMax H3 (first/last frame)', sec: 90, modes: ['i2v', 'flf'], caps: CLOUD_VIDEO_CAPS(['i2v', 'flf']) }), (j) => h3FalBody('minimax/h3/image-to-video', j)),
  video(mk({ kind: 'fal', slug: 'minimax/h3/reference-to-video', label: 'MiniMax H3 (references)', sec: 120, modes: ['r2v'], caps: CLOUD_VIDEO_CAPS(['r2v'], { refs: [1, 9], freeRefImages: 5 }) }), (j) => h3FalBody('minimax/h3/reference-to-video', j)),
  { ...video(mk({ kind: 'replicate', slug: 'minimax/h3', label: 'MiniMax H3', sec: 120, modes: ['t2v', 'i2v', 'flf', 'r2v'], caps: CLOUD_VIDEO_CAPS(['t2v', 'i2v', 'flf', 'r2v'], { resolutions: ['768p'], note: '480p is sent and billed at 768P (Replicate has no 480P)' }) }), h3ReplicateBody), unavailableFor: needsPublic },
];
/** Voice → Talking photo (model comfy-h3-lipsync): portrait + speech audio via reference-to-video. */
export const H3_LIPSYNC_CAPS = { audio: true, lipsync: true, inputs: ['portrait', 'speech'], speechSeconds: [2, 15], localRecipe: 'Ref2VA + Ref2V turbo LoRA, 6 steps' };
/** Hosted talking photo: the speech goes as one reference audio clip, which MiniMax H3 takes at 2–15 s (fal, Replicate and Comfy Router alike; only the local graph trims). */
export const hostedSpeechIssue = (name: string) => (i: Record<string, any>): string | null => { const s = Number(i.speechSeconds); return s > 15.05 ? `${name} takes speech up to 15 s; yours is ${Math.round(s * 10) / 10} s. Trim it to 15 s or less` : null; };
export const h3LipsyncRoutes = (mk: Mk): RouteDef[] => [
  { ...video(mk({ kind: 'fal', slug: 'minimax/h3/reference-to-video', id: 'fal:minimax/h3/reference-to-video#lipsync', label: 'MiniMax H3 talking photo', sec: 120, modes: ['lipsync'], caps: { ...H3_LIPSYNC_CAPS, localRecipe: undefined } }), (j) => h3FalBody('minimax/h3/reference-to-video', j)), unavailableFor: hostedSpeechIssue('MiniMax H3 on fal') },
  { ...video(mk({ kind: 'replicate', slug: 'minimax/h3', id: 'replicate:minimax/h3#lipsync', label: 'MiniMax H3 talking photo', sec: 120, modes: ['lipsync'], caps: { ...H3_LIPSYNC_CAPS, localRecipe: undefined, needsPublicUrl: true } }), h3ReplicateBody), unavailableFor: (i: Record<string, any>) => hostedSpeechIssue('MiniMax H3 on Replicate')(i) ?? needsPublic(i) },
];
/** Extend (+5 s / +10 s): fal H3 Max extend-video. */
export const h3ExtendRoutes = (mk: Mk): RouteDef[] => [
  { ...video(mk({ kind: 'fal', slug: 'minimax/h3-max/extend-video', label: 'MiniMax H3 Max extend', sec: 60, modes: ['extend'], caps: { audio: true, extendSeconds: [5, 10], minSourceSeconds: H3_EXTEND_MIN_SOURCE, returns: 'new footage only (continuation)' } }), (j) => h3FalBody('minimax/h3-max/extend-video', j)),
    unavailableFor: (i: Record<string, any>) => h3ClassicExtendIssue('H3 Max Extend on fal', i) },
];
/** The local graph and fal's H3 Max extend: +5 / +10 s from a clip of 4 s or more (+8 s and shorter clips run on H3 Extend · via last frame, Comfy Router). */
export function h3ClassicExtendIssue(name: string, i: Record<string, any>): string | null {
  const s = Number(i.extendSeconds); if (s && !(H3_EXTEND_SECONDS_CLASSIC as readonly number[]).includes(s)) return `${name} adds ${H3_EXTEND_SECONDS_CLASSIC.join(' or ')} s; +${s} s runs on H3 Extend · via last frame`;
  const src = Number(i.sourceSeconds); if (src > 0 && src < H3_EXTEND_MIN_SOURCE) return `${name} takes clips of ${H3_EXTEND_MIN_SOURCE} s or more (yours is ${Math.round(src * 10) / 10} s); H3 Extend · via last frame takes shorter clips`;
  return null;
}
/** Camera Moves (H3 presets): cloud = plain H3 image-to-video with our camera prompt (the camera LoRA stays local: licence allows hosting, but a fal /lora route is not wired without approval). */
export const h3CameraRoutes = (mk: Mk): RouteDef[] => [
  video(mk({ kind: 'fal', slug: 'minimax/h3/image-to-video', id: 'fal:minimax/h3/image-to-video#camera', label: 'MiniMax H3 camera (prompt-only)', sec: 90, modes: H3_CAMERA_MOVES.map((m) => m[0]), caps: { audio: true, cameraLora: false, intensity: ['slow', 'aggressive'], durations: [5], note: 'prompt-only camera move; the camera_motion_h3 LoRA runs locally only' } }), (j) => h3FalBody('minimax/h3/image-to-video', j)),
].map((r) => ({ ...r, // fal's H3 image-to-video takes 5–15 s (schema minimum 5): the 3 s Camera Moves length stays on the local LoRA route instead of a body fal refuses
  unavailableFor: (i: Record<string, any>) => r.unavailableFor?.(i) ?? (Number(i.duration) < 5 ? `MiniMax H3 on fal makes 5–15 s clips; ${Number(i.duration)} s camera moves run on your computer` : null) }));
