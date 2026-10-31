/**
 * ShowcaseFilm (2026-10-26, shared): one clip, shown big. A wide rounded frame that plays the clip on a loop while it is on screen,
 * the shared SoundToggle (bottom right; only for a take marked `sound: true`), a thin progress line, and takes to switch between (poster first). Copy sits in `children` (bottom left,
 * over a soft shade); `aside` sits bottom right under the takes. Reduced motion: the poster with a play button.
 * Sound (2026-10-28): the shared sound director (shared/soundDirector.ts) decides: one page-wide choice, the clip most in view carries it,
 * crossfading as you scroll, muted until the page's first gesture (the toggle then waits and the clip in view shows a small hint).
 * `restartOnSound`: turning the sound on from this clip's button plays it from 0 (so picture and sound line up). `explicit`: a film the
 * viewer pressed Play on (IIAYN FILMS' player): its sound wins over scroll-follow while it plays. `once`: the clip plays once instead of looping, then `onEnded` (a clip that fails to load calls `onFail`);
 * `onTick` reports how far it has played (0–1) every frame without a re-render; a new `restart` value plays it from 0.
 * A clip that fails to load (missing / broken), looping or not: its poster stays, the sound button and progress line go, and `onFail` is told.
 * `seek`: jump to a time and play (Explore's IIAYN FILMS shot list); a new `n` jumps again, reduced motion included.
 * Used by Explore's hero; any page with one hero clip can use it.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { PlayIcon } from '../ui/Icons';
import { SoundToggle } from './SoundToggle';
import { VideoControls } from './VideoControls';
import { prefersReducedMotion } from './HoverClip';
import { useDirectedSound, soundRefused } from './soundDirector';
import './editorial.css';

export interface FilmTake { key: string; url: string; poster: string; thumb?: string; label: string; /** duration to show while the manual player is still a poster */ sec?: number; /** the clip has an audio track (no sound button without it) */ sound?: boolean }

export function ShowcaseFilm({ takes, take, onTake, children, aside, testId, label, className = '', once = false, onEnded, onFail, onTick, restart = 0, restartOnSound = false, priority = false, explicit = false, seek, manual = false, controls = false, hoverSound = false, onStart }: {
  /** a page's own variant (Explore's full-bleed header: `sfilm-bleed`) */ className?: string; takes: FilmTake[]; /** the take on screen (its key) */ take: string; onTake: (key: string) => void; children?: ReactNode; aside?: ReactNode; testId?: string; label: string;
  /** play once (no loop), then onEnded */ once?: boolean; onEnded?: () => void; /** the clip failed to load */ onFail?: () => void;
  /** played fraction (0–1), every frame while playing */ onTick?: (frac: number) => void; /** change it to play the clip again from the start */ restart?: number;
  /** turning the sound on (this clip's button) plays the clip from 0 */ restartOnSound?: boolean;
  /** the page's first image: load the poster first and buffer the whole clip */ priority?: boolean;
  /** the viewer pressed Play on this film: its sound wins over scroll-follow while it plays */ explicit?: boolean;
  /** jump to `t` seconds and play; change `n` to jump again */ seek?: { t: number; n: number };
  /** poster first; only a viewer's Play/seek starts it (also respects reduced motion) */ manual?: boolean;
  /** optional accessible transport, using the same video and sound director */ controls?: boolean;
  /** Opt-in fine-pointer hover / keyboard-control focus sound handoff; never starts a poster or overrides page mute. */ hoverSound?: boolean;
  /** the video actually started, so a page can clear its title overlay */ onStart?: () => void;
}) {
  const root = useRef<HTMLElement>(null); const v = useRef<HTMLVideoElement | null>(null); const bar = useRef<HTMLSpanElement>(null);
  /* the <video> as state too, so the shared transport follows a new take */ const [vEl, setVEl] = useState<HTMLVideoElement | null>(null); const setVideo = useCallback((el: HTMLVideoElement | null) => { v.current = el; setVEl(el); }, []);
  const [playing, setPlaying] = useState(false); const [still, setStill] = useState(() => manual || prefersReducedMotion()); const [bad, setBad] = useState('');
  const wanted = useRef(!manual); const onScreen = useRef(false);
  const t = takes.find(x => x.key === take) ?? takes[0]; const failed = !!t && bad === t.url;
  const tick = useRef(onTick); tick.current = onTick; const [pressed, setPressed] = useState(false);
  /* the sound director owns `muted` (the <video> mounts muted); reduced motion's Play counts as an explicit play */
  const snd = useDirectedSound({ root, media: () => v.current, sound: t?.sound === true && !still && !failed, explicit: explicit || pressed, exclusive: hoverSound });
  useEffect(() => {
    const r = root.current; if (!hoverSound || !r || still || failed || !t?.sound) return;
    let pointer = false; let keyboard = false; let keyboardMode = false;
    const update = () => snd.attend(pointer || keyboard);
    const enter = (e: PointerEvent) => { if (e.pointerType !== 'touch' && window.matchMedia('(hover: hover) and (pointer: fine)').matches) { pointer = true; update(); } };
    const leave = () => { pointer = false; update(); };
    const focus = (e: FocusEvent) => { keyboard = keyboardMode && e.target instanceof Element && e.target.matches(':focus-visible'); update(); };
    const blur = (e: FocusEvent) => { if (!(e.relatedTarget instanceof Node) || !r.contains(e.relatedTarget)) { keyboard = false; update(); } };
    const key = () => { keyboardMode = true; if (r.contains(document.activeElement)) { keyboard = true; update(); } };
    const point = () => { keyboardMode = false; if (keyboard) { keyboard = false; update(); } };
    const release = () => { pointer = false; keyboard = false; snd.attend(false); };
    r.addEventListener('pointerenter', enter); r.addEventListener('pointerleave', leave);
    r.addEventListener('focusin', focus); r.addEventListener('focusout', blur); window.addEventListener('blur', release);
    document.addEventListener('keydown', key, true); document.addEventListener('pointerdown', point, true);
    return () => { r.removeEventListener('pointerenter', enter); r.removeEventListener('pointerleave', leave); r.removeEventListener('focusin', focus); r.removeEventListener('focusout', blur); window.removeEventListener('blur', release); document.removeEventListener('keydown', key, true); document.removeEventListener('pointerdown', point, true); release(); };
  }, [hoverSound, still, failed, t?.sound, snd.attend]);
  /* play; if the browser refuses the sound after all, play muted and wait for a gesture */
  const start = useCallback(() => {
    const el = v.current; if (!el) return;
    el.play().catch((e: unknown) => {
      if ((e as { name?: string })?.name !== 'NotAllowedError') return;
      if (hoverSound) {
        if (el !== v.current || !wanted.current || !onScreen.current || document.hidden) return;
        // Audio permission is not playback intent. Always keep the wanted clip moving
        // muted when sound is refused, even if the director already muted it meanwhile.
        soundRefused(); el.play().catch(() => 0);
      } else if (!el.muted) { el.muted = true; soundRefused(); el.play().catch(() => 0); }
    });
  }, [hoverSound]);
  const pause = (el: HTMLVideoElement) => {
    // Some browsers pause an already-playing video on a script unmute WITHOUT
    // rejecting its earlier play() promise. Recover only this opt-in autoplay case:
    // never an explicit Pause, offscreen/hidden pause, ended take, or detached video.
    if (hoverSound && el === v.current && wanted.current && onScreen.current && !document.hidden && !el.ended && (snd.active || !el.muted)) {
      soundRefused(); start();
    }
  };
  /* a jump (seek): applied now, or once the clip's metadata is in (just mounted, or the poster was showing under reduced motion) */
  const pendingSeek = useRef<number | null>(null);
  const applySeek = () => { const el = v.current, t0 = pendingSeek.current; if (!el || t0 == null || !(el.readyState >= 1)) return; pendingSeek.current = null; try { el.currentTime = t0; } catch { /* not seekable yet */ } start(); };
  useEffect(() => { if (!seek) return; wanted.current = true; setPressed(true); pendingSeek.current = seek.t; setStill(false); applySeek(); }, [seek?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  /* play only while on screen */
  useEffect(() => {
    const r = root.current; if (!r || still || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => { onScreen.current = e.isIntersecting; const el = v.current; if (!el) return; if (e.isIntersecting && (hoverSound ? wanted.current : !manual || wanted.current)) start(); else el.pause(); }, { threshold: 0.25 });
    io.observe(r); return () => io.disconnect();
  }, [still, t?.url, restart, start, manual, hoverSound]);
  const play = (replay = false) => {
    wanted.current = true; setPressed(true);
    if (still) { pendingSeek.current = 0; setStill(false); return; }
    const el = v.current; if (!el) return;
    if (replay || el.ended) el.currentTime = 0;
    start();
  };
  const togglePlay = () => { const el = v.current; if (!still && el && !el.paused) { wanted.current = false; el.pause(); } else play(); };
  /* this clip's sound button: mute / unmute the page (the director moves the sound); on from here restarts it if asked */
  const toggleSound = () => {
    const on = snd.toggle(); const el = v.current;
    if (el && on) { if (restartOnSound) { try { el.currentTime = 0; } catch { /* not loaded yet */ } } if (el.paused && !document.hidden) start(); }
  };
  /* the progress line, without a re-render per frame */
  useEffect(() => {
    if (still) return; let raf = 0;
    const step = () => { const el = v.current, b = bar.current; if (el && el.duration) { const f = Math.min(1, el.currentTime / el.duration); if (b) b.style.transform = `scaleX(${f.toFixed(4)})`; tick.current?.(f); } raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [still]);
  if (!t) return null;
  return <section ref={root} className={`sfilm${playing ? ' is-playing' : ''}${still ? ' is-still' : ''}${controls ? ' has-controls' : ''}${className ? ` ${className}` : ''}`} data-testid={testId} aria-label={label}>
    <div className="sfilm-stage">
      <img key={t.poster} className="sfilm-media" src={t.poster} alt="" decoding={priority ? 'sync' : 'async'} {...(priority ? { fetchpriority: 'high' } : {})} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /* a missing poster: the dark stage, no broken-image icon */ />
      {!still && !failed && <video key={`${t.url}#${restart}`} ref={setVideo} className="sfilm-media sfilm-video" data-media-keep="" /* the hero: never budget-paused or unloaded (shared/mediaBudget); it still pauses with the tab */ src={t.url} poster={t.poster} muted loop={!once} playsInline preload={priority ? 'auto' : 'metadata'} aria-hidden
        onLoadedMetadata={() => applySeek()}
        onPlaying={() => { setPlaying(true); onStart?.(); }} onPause={e => pause(e.currentTarget)} onLoadStart={() => setPlaying(false)}
        onEnded={once ? () => { wanted.current = false; tick.current?.(1); onEnded?.(); } : undefined} onError={() => { setBad(t.url); onFail?.(); }} />}
      <span className="sfilm-shade" aria-hidden />
      {!still && !failed && <span className="sfilm-progress" aria-hidden><span ref={bar} /></span>}
    </div>
    <div className="sfilm-copy">{children}</div>
    <div className="sfilm-aside">
      {takes.length > 1 && <div className="sfilm-takes" role="radiogroup" aria-label="Takes">{takes.map((x, i) => <button key={x.key} type="button" role="radio" aria-checked={x.key === t.key}
        className={x.key === t.key ? 'on' : ''} data-testid={testId ? `${testId}-take-${x.key}` : undefined} onClick={() => onTake(x.key)}>
        <img src={x.thumb ?? x.poster} alt="" /><span><small>Take {String(i + 1).padStart(2, '0')}</small>{x.label}</span></button>)}</div>}
      {aside}
    </div>
    {still && !controls && <button type="button" className="sfilm-play" aria-label={`Play: ${label}`} data-testid={testId ? `${testId}-play` : undefined} onClick={() => { setPressed(true); setStill(false); }}><PlayIcon size={26} /></button>}
    {controls && !failed && <VideoControls video={still ? null : vEl} onToggle={togglePlay} onReplay={() => play(true)} fallbackSec={t.sec} fullscreen={root} testId={testId}
      sound={t.sound === true && !still && <SoundToggle on={snd.lit} waiting={snd.waiting} label={hoverSound && snd.hint} onToggle={toggleSound} testId={testId ? `${testId}-sound` : undefined} />} />}
    {!controls && t.sound === true && !still && !failed && <SoundToggle on={snd.lit} waiting={snd.waiting} label={snd.hint} onToggle={toggleSound} testId={testId ? `${testId}-sound` : undefined} />}
  </section>;
}
