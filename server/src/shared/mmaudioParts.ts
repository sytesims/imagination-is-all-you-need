/** Add sound / MMAudio clip lengths, shared by the server plan (comfy/plans.ts) and the web dialog (web/src/shared/addSoundLogic.ts).
 *  MMAudio is trained on 8 s clips and drifts on long ones: up to MMAUDIO_ONE_PASS_SEC runs in one pass; longer clips are scored in equal parts
 *  of ≤ MMAUDIO_CHUNK_SEC and the audio parts are joined back to back. Source clips are trimmed to SOUND_MAX_SEC on upload (media.ts LIMITS.maxSec). */
/** the frame rate ComfyUI-MMAudio's sampler assumes for its sync frames (it does not resample): every pass is re-timed to it first */
export const MMAUDIO_FPS = 25;
export const MMAUDIO_CHUNK_SEC = 8; export const MMAUDIO_ONE_PASS_SEC = 10; export const SOUND_MAX_SEC = 30;
export function mmaudioParts(secs: number): { start: number; seconds: number }[] {
  const s = Math.max(1, Number(secs) || 8); if (s <= MMAUDIO_ONE_PASS_SEC) return [{ start: 0, seconds: s }];
  const n = Math.ceil(s / MMAUDIO_CHUNK_SEC); const len = Math.round((s / n) * 100) / 100;
  return Array.from({ length: n }, (_, k) => ({ start: Math.round(k * len * 100) / 100, seconds: k === n - 1 ? Math.round((s - k * len) * 100) / 100 : len }));
}
