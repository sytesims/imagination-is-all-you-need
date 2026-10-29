/**
 * useSyncClips (2026-10-28, shared): several clips of the same take playing in step, as one player. Built for Explore's two-model swap
 * (the original and two swaps of one dance, side by side or in a three-way wipe); any page with N clips of the same length can use it.
 *  - Clip 0 leads: the others follow its time (re-seeked when they drift more than 0.12 s, and when they load). All loop.
 *  - Posters first: the clips load with preload="metadata" and play only while the group is on screen (a hidden tab: shared/mediaPause).
 *    A watchdog every 1.5 s plays a clip left paused while it should play and pulls stragglers back in step.
 *  - Sound: only the lead clip carries it, through the shared SoundToggle; the shared sound director (shared/soundDirector.ts) decides when
 *    (the page's one choice, the clip most in view, muted until the first gesture). `sound: false`: the lead has no sound track.
 *  - Reduced motion: `still` is true and the page shows the posters (no clip is mounted).
 * Usage: `const g = useSyncClips(3)`; put `ref={g.root}` on the group, spread `g.clip(i)` on each <video>, and render
 * `<SoundToggle on={g.sound.lit} waiting={g.sound.waiting} label={g.sound.hint} onToggle={g.toggleSound} />` when the lead clip has sound.
 */
import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './HoverClip';
import { useDirectedSound, soundRefused } from './soundDirector';

const DRIFT = 0.12; const WATCH_MS = 1500;

export function useSyncClips(count: number, { sound: hasSound = true }: { /** the lead clip has a sound track */ sound?: boolean } = {}) {
  const root = useRef<HTMLDivElement>(null); const vids = useRef<(HTMLVideoElement | null)[]>([]); const onScreen = useRef(false);
  const [still] = useState(prefersReducedMotion);
  const lead = () => vids.current[0] ?? null;
  const list = () => vids.current.slice(0, count).filter((v): v is HTMLVideoElement => !!v);
  const playMuted = (v: HTMLVideoElement, e?: unknown) => { if (!v.muted && (e as { name?: string } | undefined)?.name === 'NotAllowedError') { v.muted = true; if (v === lead()) soundRefused(); v.play().catch(() => 0); } };
  const play = (v: HTMLVideoElement) => v.play().catch((e) => playMuted(v, e));
  const follow = (v: HTMLVideoElement) => { const l = lead(); if (!l || v === l || v.readyState === 0) return; const t = l.currentTime; if (Math.abs(v.currentTime - t) > DRIFT && t < (v.duration || Infinity)) { try { v.currentTime = t; } catch { /* not seekable yet */ } } };
  /* the sound director owns the lead's `muted` (every clip mounts muted) */
  const sound = useDirectedSound({ root, media: lead, sound: hasSound && !still });
  /* play only on screen */
  useEffect(() => {
    const r = root.current; if (!r || still || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => { onScreen.current = e.isIntersecting; for (const v of list()) { if (e.isIntersecting) play(v); else v.pause(); } }, { threshold: [0, 0.2] });
    io.observe(r); return () => io.disconnect();
  }, [still, count]); // eslint-disable-line react-hooks/exhaustive-deps
  /* keep playing, keep in step */
  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => { if (!onScreen.current || document.hidden) return; for (const v of list()) { if (v.readyState === 0) continue; if (v.paused || v.ended) play(v); follow(v); } }, WATCH_MS);
    return () => window.clearInterval(id);
  }, [still, count]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleSound = () => { const on = sound.toggle(); const l = lead(); if (l && on && onScreen.current && l.paused) play(l); };
  /** the props for clip i's <video> */
  const clip = (i: number) => ({
    ref: (el: HTMLVideoElement | null) => { vids.current[i] = el; }, muted: true, loop: true, playsInline: true, preload: 'metadata' as const, 'data-media-keep': '',
    onTimeUpdate: i === 0 ? () => { for (const v of list()) follow(v); } : undefined,
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => { follow(e.currentTarget); if (onScreen.current && !document.hidden) play(e.currentTarget); },
  });
  return { root, clip, still, sound, toggleSound };
}
