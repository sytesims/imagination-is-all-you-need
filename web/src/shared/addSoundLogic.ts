import { mmaudioParts, SOUND_MAX_SEC } from '../../../server/src/shared/mmaudioParts';
/** Add sound (one-click soundtrack, MMAudio): the one rule for where the action shows and what the dialog says, shared by the result viewer
 *  (Video tab, Assets → open), the Assets ⋯ menu and the Canvas quick action, and the clip-length wording from the same parts rule the server plan uses. */
export const ADD_SOUND_PROVIDER = 'comfy-mmaudio';
export const ADD_SOUND_MODEL = 'MMAudio';
/** its one route, named on the quote and the submit: it runs even when Use local ComfyUI is off (free, nothing hosted to fall back to) */
export const ADD_SOUND_ROUTE = 'local:comfy-mmaudio';
const VIDEO_URL = /\.(mp4|mov|webm|m4v)(\?|$)/i;
/** A finished clip of yours on this computer (not a sample, not in Trash): it can get sound. `url` = the output shown (default: the job's result). */
export function canAddSound(job: { id?: string; status?: string; resultUrl?: string | null; deletedAt?: unknown; isOwner?: boolean; sample?: unknown } | null | undefined, url?: string | null): boolean {
  if (!job?.id || job.status !== 'done' || job.deletedAt || job.isOwner === false || job.sample) return false;
  const u = url ?? job.resultUrl ?? ''; return VIDEO_URL.test(u) && /^\/files\//.test(u);
}
export function soundPlan(durationSec: number | null | undefined): { seconds: number | null; parts: number; note: string } {
  const d = Number(durationSec); if (!(d > 0)) return { seconds: null, parts: 1, note: 'Sound follows the clip’s length' };
  const s = Math.min(d, SOUND_MAX_SEC); const ps = mmaudioParts(s); const cut = d > SOUND_MAX_SEC ? `Only the first ${SOUND_MAX_SEC} s get sound, and the new take is ${SOUND_MAX_SEC} s long. ` : '';
  const note = ps.length > 1 ? `${cut}A ${Math.round(s)} s clip is scored in ${ps.length} parts of about ${Math.round(ps[0].seconds * 10) / 10} s, joined back to back (MMAudio works best on short clips)`
    : cut ? cut.trim() : `Sound for all ${Math.round(s * 10) / 10} s`;
  return { seconds: s, parts: ps.length, note };
}
/** What the dialog asks about the clip's own sound: silent → nothing to ask (the new sound is the soundtrack); has sound → Replace or Mix; unknown → both. */
export function mixQuestion(hasAudio: boolean | null | undefined): { ask: boolean; note: string | null } {
  return hasAudio === false ? { ask: false, note: 'This clip is silent: the new sound becomes its soundtrack' }
    : hasAudio === true ? { ask: true, note: 'This clip already has sound. Replace it, or mix the new sound in under it?' } : { ask: true, note: null };
}
/** Why the quote can't run here, in words for this action: ComfyUI down (the quote's fallback says local_unreachable) reads as that, not "needs a key". */
export function blockedReason(q: any): string | null {
  if (!q || q.failed || q.runnable !== false) return null;
  if (q.defaultFallback?.reasonCode === 'local_unreachable' || /isn.t reachable|unreachable/i.test(String(q.reason ?? ''))) return 'Your ComfyUI isn’t reachable. Start it (or check its address in Settings), then try again.';
  return q.reason ?? 'Not available here.';
}
