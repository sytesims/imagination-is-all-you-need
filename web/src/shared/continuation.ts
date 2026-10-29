/**
 * Results that CONTINUE their input clip (Extend: LTX-2.5 local + Comfy Cloud, MiniMax H3 Extend, Cinema "extend"): the output starts with the
 * input, so a before / after compare shows the same frames on both sides until the new part. The viewers skip Compare for these and mark the
 * seam (where the new part starts) on the video's progress bar instead. One rule, used by every surface (shared/ResultView, card and viewer).
 */
type JobLike = { toolId?: string | null; input?: any } | null | undefined;

/** True when the job's output continues its input clip (Extend and friends), so it is never shown as before / after. */
export function continuesInput(job: JobLike): boolean {
  if (!job) return false; const i: any = job.input ?? {};
  return job.toolId === 'h3-extend' || i.mode === 'extend' || (Array.isArray(i.types) && i.types.includes('extend')) || i.cinemaMode === 'extend' || !!i.ltxExtend;
}

/** The input clip's length in seconds (0 when unknown): the job's probe (sourceSeconds) or the extend plan's source. */
export function inputSecondsOf(job: JobLike): number {
  const i: any = job?.input ?? {}; const s = Number(i.sourceSeconds) || Number(i.ltxExtend?.plan?.source?.seconds) || 0;
  return s > 0 && isFinite(s) ? s : 0;
}

/** Where the new part starts in this output (seconds), or null: only for a continuation whose output really holds the input plus at least
 *  half a second more (a result that is only the new part, or an unknown input length, gets no marker). `outSec`: the output's length. */
export function seamOf(job: JobLike, outSec: number): number | null {
  if (!continuesInput(job)) return null; const s = inputSecondsOf(job);
  return s > 0 && outSec > 0 && outSec >= s + 0.5 ? s : null;
}

/** "0:10" for 10.04 s (whole seconds, like the player's clock). */
export const seamClock = (s: number) => { const n = Math.floor(Math.max(0, s)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };

/** Where "Jump to the new part" lands: about a second before the seam, so the cut is seen. */
export const seamJumpTo = (seam: number) => Math.max(0, seam - 1);

/** Extend on a clip MiniMax H3 made (Generate Video, Character Swap, an earlier H3 Extend segment…): open Extend on the H3 Extend model, whose preferred place is
 *  H3 Extend · Comfy Cloud, so the take keeps the same model from segment to segment. null = the page's own pick (LTX-2.5 22B, free locally). */
export function extendModelFor(job: { provider?: string | null; route?: string | null; modelKey?: string | null } | null | undefined): string | null {
  if (!job) return null; const s = `${job.provider ?? ''} ${job.route ?? ''} ${(job as any).modelKey ?? ''}`;
  return /(^|[\s:-])(comfy|cloud)-h3|minimax-h3/.test(s) ? 'minimax-h3-extend' /* the model key: its engine comfy-h3-extend also serves H3 Max Extend (fal) */ : null;
}
/** The Extend hand-off link with the model when the clip is H3's. */
export const withExtendModel = (href: string, job: Parameters<typeof extendModelFor>[0]) => { const m = extendModelFor(job); return m ? `${href}${href.includes('?') ? '&' : '?'}model=${m}` : href; };

