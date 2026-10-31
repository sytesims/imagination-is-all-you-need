/**
 * A clip's width, height and length by URL (2026-10-31, B9). Uploads come back with them (POST /api/media probes videos), so those are
 * known at once; any other clip (a result wired in by an arrow) is read from the browser's own metadata. The Canvas card's pre-flight
 * checks them against the tool's clip rule (server/src/shared/clipLimits.ts) before Generate.
 */
import { useEffect, useState } from 'react';
import type { ClipInfo } from '../../../server/src/shared/clipLimits';

const known = new Map<string, ClipInfo | null>();
const pending = new Map<string, Promise<ClipInfo | null>>();

/** Remember what the server measured on upload. */
export function primeClip(url: string, m: { width?: number | null; height?: number | null; duration?: number | null }) {
  if (url && Number(m.width) > 0 && Number(m.height) > 0) known.set(url, { width: Number(m.width), height: Number(m.height), duration: Number(m.duration) || 0 });
}

/** The clip's size and length (null when the browser can't read it in time). */
export function probeClip(url: string, timeout = 4000): Promise<ClipInfo | null> {
  if (known.has(url)) return Promise.resolve(known.get(url) ?? null);
  const p0 = pending.get(url); if (p0) return p0;
  const p = new Promise<ClipInfo | null>(res => {
    const v = document.createElement('video'); const t = setTimeout(() => done(null), timeout);
    function done(x: ClipInfo | null) { clearTimeout(t); v.removeAttribute('src'); v.load(); known.set(url, x); pending.delete(url); res(x); }
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => done(v.videoWidth ? { width: v.videoWidth, height: v.videoHeight, duration: Number.isFinite(v.duration) ? v.duration : 0 } : null);
    v.onerror = () => done(null); v.src = url;
  });
  pending.set(url, p); return p;
}

/** url → size and length for these clips; fills in as each one is read. */
export function useClipInfo(urls: string[]): Record<string, ClipInfo> {
  const key = urls.join('\u0000');
  const now = () => Object.fromEntries(urls.map(u => [u, known.get(u)]).filter(([, x]) => x)) as Record<string, ClipInfo>;
  const [map, setMap] = useState(now);
  useEffect(() => { let on = true; setMap(now());
    for (const u of urls) if (!known.has(u)) void probeClip(u).then(() => { if (on) setMap(now()); });
    return () => { on = false; }; }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return map;
}
