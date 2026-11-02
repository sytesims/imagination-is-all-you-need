/** The kind of a result file from its URL, and a video's still. No React, no CSS (moved out of resultMedia.ts, 2026-10-24). */
import { is3dUrl } from './model3d';
export type ResultKind = 'image' | 'video' | 'audio' | '3d';
const IMG = /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i, AUD = /\.(wav|mp3|ogg|oga|flac|m4a|aac|opus)(\?|#|$)/i, VID = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
export function resultKindOfUrl(url: string | null | undefined): ResultKind | null {
  if (!url) return null; if (is3dUrl(url)) return '3d'; if (AUD.test(url)) return 'audio'; if (VID.test(url)) return 'video'; if (IMG.test(url)) return 'image'; return null;
}
/** The file's own extension (lower case, no query), e.g. 'flac' for /files/song.flac?v=2; null when it has none. Save names use it. */
export const fileExtOf = (url: string | null | undefined): string | null => String(url ?? '').split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() ?? null;
/** The video's server-made still (GET /api/media/thumb), or the job's own poster when it has one. */
export const videoPoster = (url: string, j?: any) => j?.outputs?.[0]?.posterUrl ?? `/api/media/thumb?url=${encodeURIComponent(url)}`;
