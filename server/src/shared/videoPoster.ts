/**
 * The one poster URL for a video (server and web share it): GET /api/media/poster?url=<video>&v=<POSTER_V>.
 * The server renders a representative frame (~1 s in, skipping black frames; outputMeta.ts renderPoster) once and caches it.
 * `v` changes whenever the frame choice changes, so browsers drop posters cached under the old rule (v1 = frame 0, often black).
 */
export const POSTER_V = '2';
/** Local video URLs the poster route can read (/files, /samples, /examples, /showcase). */
const LOCAL_VIDEO = /^\/(files|samples|examples|showcase)\/[^?#]+\.(mp4|mov|webm|m4v)(\?.*)?$/i;
export const isLocalVideo = (url?: string | null): url is string => !!url && LOCAL_VIDEO.test(url);
/** The poster route URL for a video. */
export const posterRoute = (url: string): string => `/api/media/poster?url=${encodeURIComponent(url)}&v=${POSTER_V}`;
/** The still a video tile shows: its own stored poster, else the poster route for a local video, else undefined (remote clip). */
export function videoPoster(url?: string | null, stored?: string | null): string | undefined {
  if (stored) return upgradePoster(stored);
  return isLocalVideo(url) ? posterRoute(url) : undefined;
}
/** An older poster route URL (no `v`, or an old `v`) as the current one; any other URL unchanged. */
export function upgradePoster(u: string): string {
  const m = /^\/api\/media\/poster\?url=([^&]+)(?:&v=\w+)?$/.exec(u); return m ? `/api/media/poster?url=${m[1]}&v=${POSTER_V}` : u;
}
