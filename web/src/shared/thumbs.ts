/**
 * Grid thumbnails (performance): a picture shown `cssWidth` px wide in a grid loads a copy scaled to what the screen needs
 * (GET /api/media/thumb?url=&w=, server gridThumbs.ts) instead of the full-size output, which is often a 2–4K PNG or a
 * full-size video poster. The server answers the original when it is already small or can't be scaled, so the picture is
 * always the same; only the bytes change. Viewers and downloads keep the full-size URL.
 */
const WIDTHS = [160, 240, 320, 480, 640, 960, 1280]; // = server THUMB_WIDTHS
const LOCAL_IMG = /^\/(files|samples|examples)\/[^?#]+\.(png|jpe?g|webp)(\?.*)?$/i;
const POSTER = /^\/api\/media\/poster\?url=/;
/** True when `url` can be served as a grid thumbnail. */
export const thumbable = (url?: string | null): url is string => !!url && (LOCAL_IMG.test(url) || POSTER.test(url));
/** Thumbnail URL for `url` drawn `cssWidth` CSS px wide (device pixels, capped at 2×); other URLs are returned unchanged. */
export function gridSrc<T extends string | null | undefined>(url: T, cssWidth: number): T | string {
  if (!thumbable(url)) return url;
  const dpr = Math.min(2, Math.max(1, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1));
  const need = Math.ceil(cssWidth * dpr); const w = WIDTHS.find(x => x >= need) ?? WIDTHS[WIDTHS.length - 1];
  return `/api/media/thumb?url=${encodeURIComponent(url)}&w=${w}`;
}
