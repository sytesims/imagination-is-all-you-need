/**
 * The one sound preview (2026-10-31, Canvas audit B4: "I wasn't able to play any audio so I didn't know which was which").
 * A round play / pause button for a sound tile (the media picker, Canvas's Assets drawer) and a thin progress line along the tile's foot.
 *  - One detached <audio> for the whole app, so only one preview plays at a time; it joins the app's one-player rule (claimPlayback) and
 *    pauses with the tab (registerMedia). stopPreview() stops it (a picker or drawer closing).
 *  - The button stops its click and pointer events, so the tile under it is never picked or dragged by it.
 *  - mediaLength(url): a clip's or sound's length from its metadata, read by a detached element (never left in the page), three at a time,
 *    remembered per URL.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { registerMedia } from './mediaPause';
import { claimPlayback, releasePlayback } from './audioPlayer';
import { PauseIcon, PlayIcon } from '../ui/Icons';
import './previewPlay.css';

type Snap = { url: string | null; on: boolean; p: number };
let snap: Snap = { url: null, on: false, p: 0 }; const subs = new Set<() => void>();
const set = (s: Partial<Snap>) => { snap = { ...snap, ...s }; subs.forEach(f => f()); };
let el: HTMLAudioElement | null = null;
function player(): HTMLAudioElement {
  if (el) return el; const a = new Audio(); a.preload = 'auto'; registerMedia(a); el = a;
  a.addEventListener('play', () => { claimPlayback(a); set({ on: true }); });
  a.addEventListener('pause', () => set({ on: false }));
  a.addEventListener('ended', () => { releasePlayback(a); set({ on: false, p: 0, url: null }); });
  a.addEventListener('timeupdate', () => set({ p: a.duration > 0 ? a.currentTime / a.duration : 0 }));
  a.addEventListener('error', () => set({ on: false, p: 0, url: null }));
  return a;
}
/** Play `url` (stopping any other preview), or pause it if it is the one playing. */
export function togglePreview(url: string) {
  const a = player();
  if (snap.url === url && !a.paused) { a.pause(); return; }
  if (snap.url !== url) { a.src = url; set({ url, p: 0 }); }
  Promise.resolve(a.play()).catch(() => set({ on: false }));
}
/** Stop the preview, whatever plays (a picker or drawer closing). */
export function stopPreview() { if (!el) return; el.pause(); el.removeAttribute('src'); el.load(); releasePlayback(el); set({ url: null, on: false, p: 0 }); }
/** This URL's preview state: playing, and how far (0..1). */
export function usePreview(url: string): { on: boolean; p: number; mine: boolean } {
  const s = useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => snap);
  const mine = s.url === url; return { mine, on: mine && s.on, p: mine ? s.p : 0 };
}

/** The play / pause button and, while this sound is the preview, a thin progress line. Place it inside a position:relative tile. */
export function PlayButton({ url, label, className = '', testId = 'pv-play' }: { url: string; /** what it plays, for the screen reader: "Play rain.wav" */ label: string; className?: string; testId?: string }) {
  const { on, p, mine } = usePreview(url); const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return <>
    <button type="button" className={`pv-play${on ? ' on' : ''}${className ? ` ${className}` : ''}`} aria-label={`${on ? 'Pause' : 'Play'} ${label}`} aria-pressed={on} title={on ? 'Pause' : 'Play'} data-testid={testId}
      onPointerDown={stop} onPointerUp={stop} onMouseDown={stop} onKeyDown={stop} onClick={e => { e.stopPropagation(); e.preventDefault(); togglePreview(url); }}>
      {on ? <PauseIcon size={14} /> : <PlayIcon size={14} />}</button>
    {mine && <span className="pv-prog" aria-hidden><i style={{ transform: `scaleX(${p})` }} /></span>}
  </>;
}

/* ---- length from metadata ---- */
const lens = new Map<string, number>(); const waiting: (() => void)[] = []; let busy = 0;
function readLength(url: string, kind: 'audio' | 'video'): Promise<number> {
  const hit = lens.get(url); if (hit != null) return Promise.resolve(hit);
  return new Promise(done => {
    const go = () => { busy++; const m = document.createElement(kind); m.preload = 'metadata'; m.muted = true; let t = 0;
      const end = (d: number) => { clearTimeout(t); m.onloadedmetadata = m.onerror = null; m.removeAttribute('src'); try { m.load(); } catch { /* gone */ }
        const n = isFinite(d) && d > 0 ? d : 0; lens.set(url, n); busy--; waiting.shift()?.(); done(n); };
      m.onloadedmetadata = () => end(m.duration); m.onerror = () => end(0); t = window.setTimeout(() => end(0), 15000); m.src = url; };
    if (busy < 3) go(); else waiting.push(go);
  });
}
/** A sound's or clip's length in seconds (0 until known, or when it can't be read). `enabled`: once the tile is near the view. */
export function useMediaLength(url: string, kind: 'audio' | 'video' | string, enabled = true): number {
  const [d, setD] = useState(() => lens.get(url) ?? 0);
  useEffect(() => { if (!enabled || (kind !== 'audio' && kind !== 'video')) return; let on = true; void readLength(url, kind).then(n => { if (on) setD(n); }); return () => { on = false; }; }, [url, kind, enabled]);
  return d;
}
/** "0.5 s", "4 s", "1:05" */
export function fmtLength(s: number): string {
  if (!isFinite(s) || s <= 0) return ''; if (s < 0.95) return `${Math.round(s * 10) / 10} s`;
  const r = Math.round(s); return r < 60 ? `${r} s` : `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
}
