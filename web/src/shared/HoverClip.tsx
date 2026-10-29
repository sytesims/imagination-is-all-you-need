/**
 * HoverClip (2026-10-26, shared): a poster first, its clip only when it's wanted. Used by Explore's tiles and rails (and any media grid).
 *  - mode "hover": plays muted while the pointer (or keyboard focus) is on the nearest [data-hover-play] ancestor (the whole tile), else itself.
 *  - mode "view": plays muted while it is on screen.
 * The <video> isn't even mounted until the first hover / first time on screen, so a page of tiles loads only WebP posters. A still (no .mp4)
 * is just the image. Reduced motion: posters only. A clip the browser can't play keeps its poster (and tells `onFail`).
 * Sound (2026-10-27): muted unless `muted={false}` (Explore's "Made with LTX-2.5" cards: the viewer's remembered choice, useClipSound). If the
 * browser refuses sound before any gesture, it plays muted instead. A new `restart` value plays it again from 0 (Explore's Image to layers
 * chapter: turning its sound on restarts the run so the sound lines up with each layer). `directed` (2026-10-28): the shared sound director
 * (shared/soundDirector.ts) owns this clip's `muted`; HoverClip leaves it alone (Explore's Image to layers).
 */
import { useEffect, useRef, useState } from 'react';
import './editorial.css';

export const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const isClip = (u: string) => /\.(mp4|webm|mov)(\?|$)/i.test(u);

/** A remembered sound choice for a group of clips (off by default; localStorage, safely). */
export function useClipSound(key: string): [boolean, () => void] {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(key) === '1'; } catch { return false; } });
  return [on, () => setOn((v) => { try { localStorage.setItem(key, v ? '0' : '1'); } catch { /* private mode: not remembered */ } return !v; })];
}

export function HoverClip({ src, poster, label = '', mode = 'hover', className = '', position, muted = true, directed = false, restart = 0, onFail }: {
  src: string; poster: string; label?: string; mode?: 'hover' | 'view'; className?: string; /** object-position, e.g. "50% 30%" */ position?: string;
  /** false: play with sound (falls back to muted if the browser blocks it) */ muted?: boolean; /** the clip can't play (missing / broken): its poster stays */ onFail?: () => void;
  /** change it to play the clip again from 0 */ restart?: number; /** the sound director sets `muted` (ignore the prop) */ directed?: boolean;
}) {
  const box = useRef<HTMLSpanElement>(null); const v = useRef<HTMLVideoElement>(null);
  const [want, setWant] = useState(false); const [mounted, setMounted] = useState(false); const [playing, setPlaying] = useState(false); const [bad, setBad] = useState(false);
  const clip = isClip(src) && !bad;
  useEffect(() => {
    const el = box.current; if (!el || !clip || prefersReducedMotion()) return;
    if (mode === 'view') {
      if (typeof IntersectionObserver === 'undefined') return;
      const io = new IntersectionObserver(([e]) => setWant(e.isIntersecting), { threshold: 0.3 }); io.observe(el); return () => io.disconnect();
    }
    const host = (el.closest('[data-hover-play]') as HTMLElement | null) ?? el;
    const on = () => setWant(true); const off = () => setWant(false);
    const offFocus = (e: FocusEvent) => { if (!host.contains(e.relatedTarget as Node | null)) off(); };
    host.addEventListener('pointerenter', on); host.addEventListener('pointerleave', off); host.addEventListener('focusin', on); host.addEventListener('focusout', offFocus);
    return () => { host.removeEventListener('pointerenter', on); host.removeEventListener('pointerleave', off); host.removeEventListener('focusin', on); host.removeEventListener('focusout', offFocus); };
  }, [mode, clip]);
  useEffect(() => { if (want) setMounted(true); }, [want]);
  useEffect(() => { const el = v.current; if (!el) return; if (!directed) el.muted = muted;
    if (want) el.play().catch(() => { if (!el.muted) { el.muted = true; el.play().catch(() => 0); } }); else el.pause(); }, [want, mounted, muted, directed]);
  const restarted = useRef(restart);
  useEffect(() => { if (restarted.current === restart) return; restarted.current = restart; const el = v.current; if (el) el.currentTime = 0; }, [restart]);
  return <span ref={box} className={`hclip${playing ? ' is-playing' : ''} ${className}`} style={position ? { ['--hclip-pos' as string]: position } : undefined}>
    <img src={poster} alt={label} loading="lazy" decoding="async" draggable={false} />
    {clip && mounted && <video ref={v} src={src} poster={poster} muted loop playsInline preload="auto" aria-hidden
      onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => { setBad(true); onFail?.(); }} />}
  </span>;
}
