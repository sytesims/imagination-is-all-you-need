/**
 * What a finished job shows as a result card (Canvas board, assets drawer): its kind, the file, a still for the grid, and the
 * caption parts (model · place · price · time) from the shared jobCaption, so every card says the same words as the feeds.
 * No React and no canvas library here, so any page can use it.
 */
import type { JobState } from '../api';
import { jobCaption, type JobCaption } from './FeedCaption';
import { jobIs3d, posterOf3d } from './model3d';

export type { ResultKind } from './mediaKind';
import type { ResultKind } from './mediaKind';
export interface ResultMedia { kind: ResultKind; url: string; /** a still to show before play / for a 3D model (may be empty for audio) */ poster: string; title: string; caption: JobCaption }

export { resultKindOfUrl, videoPoster } from './mediaKind'; /* moved to a React-free module (the Canvas run code and its node test read them) */
import { resultKindOfUrl, videoPoster } from './mediaKind';
const promptOf = (j: JobState) => String((j.input as any)?.prompt ?? (j.input as any)?.text ?? (j.input as any)?.lyrics ?? '').replace(/\s+/g, ' ').trim();

/** The card for a finished job, or null when it has nothing to show (failed, running, or a file type we don't place). */
export function resultMedia(j: JobState, own: boolean | null): ResultMedia | null {
  if (j.status !== 'done') return null;
  const url = j.resultUrl ?? j.outputs?.[0]?.url ?? null; if (!url) return null;
  const kind: ResultKind | null = jobIs3d(j) ? '3d' : resultKindOfUrl(url); if (!kind) return null;
  const poster = kind === 'image' ? url : kind === 'video' ? videoPoster(url, j) : kind === '3d' ? posterOf3d(j) ?? '' : '';
  const caption = jobCaption(j, own);
  return { kind, url, poster, title: promptOf(j) || caption.model || 'Result', caption };
}
/** Card size on a board for a result of natural size w × h (long side 360, audio a fixed strip). */
export function resultCardSize(kind: ResultKind, w?: number | null, h?: number | null): { w: number; h: number } {
  if (kind === 'audio') return { w: 360, h: 132 };
  if (!w || !h || !isFinite(w / h)) return kind === 'video' ? { w: 384, h: 216 } : { w: 320, h: 320 };
  const r = Math.max(0.25, Math.min(4, w / h)); const L = 360;
  return r >= 1 ? { w: L, h: Math.round(L / r) } : { w: Math.round(L * r), h: L };
}
