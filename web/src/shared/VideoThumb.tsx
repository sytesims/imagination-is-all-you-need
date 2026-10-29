/**
 * A clip's thumbnail in an input slot (2026-10-26): the one shared poster for every video slot (the Video bar, Create Video's reference clips,
 * Re-shoot, Audio's video). A bare <video preload="metadata"> paints nothing in Safari and only frame 0 in Chrome, which is black on most renders
 * and 3D mockups (a fade-in, an empty first frame), so the slot showed a black tile. This seeks to a frame a quarter in (at most 2 s) once the
 * metadata is in, so uploads, clips picked from Generations and handed-over results all show a real frame. No server work, nothing stored.
 */
import { useRef } from 'react';

/** Where the poster frame sits: a quarter in (past a fade-in), at most 2 s. */
export const posterTime = (dur: number): number => (Number.isFinite(dur) && dur > 0 ? Math.min(dur / 4, 2) : 0);

export function VideoThumb({ src, poster, className, label }: { src: string; /** a server poster when there is one (shown until the frame is in) */ poster?: string | null; className?: string; label?: string }) {
  const done = useRef<string | null>(null);
  return <video key={src} src={src} poster={poster ?? undefined} className={className} muted playsInline preload="metadata" aria-label={label} aria-hidden={label ? undefined : true} tabIndex={-1} data-testid="video-thumb"
    onLoadedMetadata={e => { const v = e.currentTarget; if (done.current === src) return; done.current = src; const t = posterTime(v.duration); if (t > 0) { try { v.currentTime = t; } catch { /* not seekable: keep the first frame */ } } }} />;
}
