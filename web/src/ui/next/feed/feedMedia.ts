/** Feed card media helpers, shared by the result feeds (FeedCard.tsx, Create Image and Generate Video). Pure, no React, so tests import them. */
import type { JobState } from '../../../api';

export const clampAr = (ar: number) => Math.max(0.4, Math.min(2.6, ar || 1));
/** A card's tallest height in CSS px (imageCanvas.css --h × 1.5): the thumbnail size to ask for. */
export const tileMaxH = () => 1.5 * (typeof innerWidth === 'number' && innerWidth >= 1600 ? 300 : innerWidth <= 700 ? 100 : 240);

/** The output a video card shows: url, first-frame poster, shape and length (server outputs[], else the job's resultUrl and specs). */
export function videoOutOf(j: JobState): { url: string; poster: string; ar: number; sec: number } | null {
  const a = j as any; const o = ((a.outputs ?? []) as any[]).find(x => x?.url && (x.kind === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(String(x.url)))) ?? null;
  const url: string = o?.url ?? j.resultUrl ?? ''; if (!url) return null;
  return { url, poster: o?.posterUrl ?? `/api/media/poster?url=${encodeURIComponent(url)}`, ar: o?.width > 0 && o?.height > 0 ? o.width / o.height : askedAr(j), sec: Number(o?.durationSec ?? a.specs?.durationSec ?? a.input?.duration ?? 0) || 0 };
}
/** The shape the run asked for (a running or failed clip's card keeps it): input aspect "9:16", else 16:9. */
export function askedAr(j: JobState): number { const a = j as any; const m = /^(\d+):(\d+)$/.exec(String(a.input?.aspect ?? a.specs?.aspect ?? '')); return m ? Number(m[1]) / Number(m[2]) : 16 / 9; }

const MODE_TAG: Record<string, string> = { i2v: 'Image to video', flf: 'Start + end frame', r2v: 'Reference' };
const words = (id: string) => id.replace(/[-_]+/g, ' ').replace(/^\w/, c => c.toUpperCase());
/** The card's small chip: a workflow (feature), else the look (camera move or style), else the mode when it isn't plain text to video. */
export function videoTag(j: JobState): string {
  const a = j as any; const inp = a.input ?? {};
  if (a.feature?.name && a.feature?.id !== 'h3-video') return String(a.feature.name);
  if (inp.cameraMove) return words(String(inp.cameraMove)); if (inp.videoPreset) return words(String(inp.videoPreset));
  const mode = String(inp.mode ?? (Array.isArray(inp.types) ? inp.types[0] : '') ?? ''); return MODE_TAG[mode] ?? '';
}
