/**
 * HeroReel (2026-10-26, shared): a full-bleed, cinematic before → after reel. Two clips of the same shot play in sync, muted, on a loop; a
 * soft wipe drifts between them (the "before" on the left of the line, the "after" on the right), and the pointer takes the line over while
 * it is on the reel. Copy sits in `children` (bottom left, over a shade), `aside` sits bottom right. Sound: the shared SoundToggle (bottom right),
 * off by default, only when `sound` says the after clip has an audio track.
 * Posters first: the clips load with preload="metadata" and start only once the reel is on screen. Reduced motion: still posters, line at 50%.
 * Used by Explore's Direct a Shot hero (Mockup → Render); any page with a before / after pair of clips can use it.
 * A new `after` clip (Explore's Original / Sharper switch) picks up where the before clip is, so the wipe stays in step.
 * `reveal` (2026-10-27, Explore's "From one still"): the before is a still image (the run's input), the line starts at the far right (all still) and
 * sweeps once across to the left edge (all clip) when the reel comes on screen, the clip starting from 0 as it goes; a new `after` clip or `replay`
 * value sweeps again. The line is dragged (pointer down) rather than following the hover, and stays where it is let go. Reduced motion: the still
 * with a play button (play: the clip, no sweep). A clip that fails to load: the still stays, no line or sound button. Sound (2026-10-28): the
 * shared sound director (shared/soundDirector.ts) decides when the after clip sounds (the page's one choice, the clip most in view, muted
 * until the first gesture). `restartOnSound`: turning the sound on from its button plays the clip from 0. `position` sets object-position.
 * Reveal with a before CLIP (2026-10-27, Explore's "Mockup to film"): the two clips of one move stay in step. `parkAt` is where the line rests
 * after the reveal (the before's share, 0–1; default 0 = all after). `holdSweep`: the line sweeps over the two first frames held still (the
 * mockup's frame 0 → the after clip's frame 0, the painted first frame), waits a beat, then both clips play from 0 as the line eases back to
 * `parkAt`. `onPhase` reports wait → sweep → hold → play → park, and `jump` ({ to, n }: a new n jumps) shows one beat: 'wait' (the before,
 * held), 'hold' (the after's first frame, held) or 'play' (both from 0, the line to `parkAt`).
 * Keeps looping (2026-10-27, "it plays once and stops"): the clips loop, and nothing may leave them stopped while the reel is on screen and the
 * tab is visible. A media error after the clip has played (a dropped range request at the loop seam, the dev server restarting) reloads the clip
 * instead of turning the reel into the failed still (only a clip that never played counts as broken); a watchdog every 1.5 s plays a clip that
 * is paused or stuck while it should be playing (a browser pausing it on its own, a stalled seam, a missed `ended`). Off screen, a hidden tab
 * (shared/mediaPause) and the held beats of a holdSweep reveal stay paused. `onTick(t, duration)` reports the after clip's time (loop counting).
 * Keyboard (2026-10-27): a reveal's line is also a slider (Tab to it; arrows move it 5 %, Page Up / Down 20 %, Home / End to either edge). Its
 * knob shows on keyboard focus (a page's variant may show it always).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PlayIcon } from '../ui/Icons';
import { SoundToggle } from './SoundToggle';
import { prefersReducedMotion } from './HoverClip';
import { useDirectedSound, soundRefused } from './soundDirector';
import './editorial.css';

export interface ReelClip { url: string; poster: string; label: string }
export type ReelPhase = 'wait' | 'sweep' | 'hold' | 'play' | 'park';
const HOLD_MS = 1200; const PLAY_MS = 1100; /** the watchdog's beat, and the reloads a clip that already played gets after an error */ const WATCH_MS = 1500; const RETRIES = 3;

const isClip = (u: string) => /\.(mp4|webm|mov)(\?|$)/i.test(u);
const ease = (k: number) => 1 - Math.pow(1 - k, 3);

export function HeroReel({ before, after, children, aside, testId, sound = false, className = '', reveal = false, replay = 0, position, restartOnSound = false, label, parkAt = 0, holdSweep = false, onPhase, jump, onTick, onFail }: { /** a page's own variant (Explore's framed wipe: `hreel-framed`) */ className?: string; before: ReelClip; after: ReelClip; children?: ReactNode; aside?: ReactNode; testId?: string; /** the after clip has an audio track (no sound button without it) */ sound?: boolean; /** turning the sound on plays the clip from 0 */ restartOnSound?: boolean;
  /** still → clip: the before is a still, the line sweeps once from all-still to all-clip (see above) */ reveal?: boolean; /** change it to sweep again */ replay?: number;
  /** object-position for both sides, e.g. "50% 62%" */ position?: string; /** reduced motion: the play button's name */ label?: string;
  /** reveal: where the line rests afterwards (the before's share, 0–1) */ parkAt?: number; /** reveal with a before clip: sweep over the held first frames, then play (see above) */ holdSweep?: boolean;
  /** reveal: each phase as it starts */ onPhase?: (p: ReelPhase) => void; /** reveal: show one beat (a new `n` jumps) */ jump?: { to: 'wait' | 'hold' | 'play'; n: number }; /** the after clip's time, as it plays */ onTick?: (t: number, duration: number) => void; /** reveal: the after clip can't play (the still stays) */ onFail?: () => void }) {
  const root = useRef<HTMLElement>(null); const stage = useRef<HTMLDivElement>(null); const a = useRef<HTMLVideoElement>(null); const b = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false); const [reduced] = useState(prefersReducedMotion); const [still, setStill] = useState(reduced); const [bad, setBad] = useState('');
  const failed = bad === after.url; const stillBefore = !isClip(before.url); const knob = useRef<HTMLSpanElement>(null);
  /* the sound director owns the after clip's `muted` (it mounts muted) */
  const snd = useDirectedSound({ root, media: () => b.current, sound: sound && !still && !failed });
  /* the line at x (the before's share, 0–1): the stage's clip and line, and the keyboard slider's place and value */
  const paintAt = (x: number) => { const el = stage.current; if (el) { el.style.setProperty('--x', `${(x * 100).toFixed(2)}%`); el.style.setProperty('--lo', x > 0.004 && x < 0.996 ? '1' : '0'); }
    const k = knob.current; if (k) { const n = Math.round(x * 100); k.style.left = `${(x * 100).toFixed(2)}%`; k.setAttribute('aria-valuenow', String(n)); k.setAttribute('aria-valuetext', `${n}% ${before.label}, ${100 - n}% ${after.label}`); } };
  /* the line: `x` is the before's share of the frame (0–1). phase (reveal): wait (all still) → sweep → park (stays put); hold: the pointer has it */
  const pos = useRef({ x: reveal ? 1 : 0.92, target: reveal ? 1 : 0.92, hold: false, t0: 0, phase: 'wait' as ReelPhase, seen: false, frozen: false, from: 1 });
  const onScreen = useRef(false); const played = useRef(''); const retries = useRef(0); const tickCb = useRef(onTick); tickCb.current = onTick; const failCb = useRef(onFail); failCb.current = onFail;
  const phaseCb = useRef(onPhase); phaseCb.current = onPhase; const told = useRef<ReelPhase | null>(null);
  const tell = () => { const ph = pos.current.phase; if (told.current !== ph) { told.current = ph; phaseCb.current?.(ph); } };
  /* holdSweep: both clips held on frame 0 (wait, sweep, hold), or both played from 0 (play) */
  const holdAll = () => { for (const v of [a.current, b.current]) { if (!v) continue; v.pause(); try { v.currentTime = 0; } catch { /* not loaded yet */ } } };
  const playAll = () => { for (const v of [a.current, b.current]) { if (!v) continue; try { v.currentTime = 0; } catch { /* not loaded yet */ } v.play().catch((e) => playMuted(v, e)); } };
  const live = () => { const p = pos.current; return !holdSweep || (!p.frozen && (p.phase === 'play' || p.phase === 'park')); };
  const sweep = () => { const p = pos.current; p.x = p.target = 1; p.phase = 'sweep'; p.frozen = false; p.t0 = performance.now(); tell();
    if (holdSweep) { holdAll(); return; } const v = b.current; if (v) { try { v.currentTime = 0; } catch { /* not loaded yet */ } v.play().catch((e) => playMuted(v, e)); } };
  /* holdSweep: from the held first frame, both clips play from 0 and the line eases from where it is to parkAt */
  const startPlay = () => { const p = pos.current; p.phase = 'play'; p.frozen = false; p.from = p.x; p.t0 = performance.now(); tell(); playAll(); };
  /* the browser refused the sound after all: play muted (the director waits for a gesture) */
  const playMuted = (v: HTMLVideoElement, e?: unknown) => { if (!v.muted && (e as { name?: string } | undefined)?.name === 'NotAllowedError') { v.muted = true; if (v === b.current) soundRefused(); v.play().catch(() => 0); } };
  useEffect(() => {
    const el = stage.current; if (!el) return; const p = pos.current;
    const paint = () => paintAt(p.x);
    if (reveal && (failed || still)) { p.x = 1; paint(); return; } /* the still, whole */
    if (reveal && reduced) { p.x = parkAt; p.phase = 'park'; tell(); paint(); return; } /* reduced motion, after play: the clip, no sweep */
    if (still) { el.style.setProperty('--x', '50%'); return; }
    let raf = 0; if (!reveal) p.t0 = performance.now();
    const tick = (now: number) => {
      if (reveal) {
        if (p.hold) p.x += (p.target - p.x) * 0.35;
        else if (p.phase === 'sweep') { const end = holdSweep ? 0 : parkAt; const k = Math.min(1, Math.max(0, (now - p.t0 - 500) / 2600)); p.x = 1 - ease(k) * (1 - end);
          if (k >= 1) { p.phase = holdSweep ? 'hold' : 'park'; p.t0 = now; tell(); } }
        else if (p.phase === 'hold' && !p.frozen && now - p.t0 >= HOLD_MS) startPlay();
        else if (p.phase === 'play') { const k = Math.min(1, (now - p.t0) / PLAY_MS); p.x = p.from + (parkAt - p.from) * ease(k); if (k >= 1) { p.phase = 'park'; tell(); } }
      } else {
        const t = (now - p.t0) / 1000;
        if (!p.hold) p.target = t < 1.2 ? 0.92 : 0.31 + Math.cos((t - 1.2) * 0.38) * 0.09; /* opens to ~40%, then drifts 22–40%: the Render owns the frame */
        p.x += (p.target - p.x) * (p.hold ? 0.22 : 0.05);
      }
      paint(); raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [still, reveal, reduced, failed]);
  /* play only on screen; keep the before clip in step with the after. Reveal: the first time half of it is on screen, sweep */
  useEffect(() => {
    const r = root.current; if (!r || still || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => { const p = pos.current; onScreen.current = e.isIntersecting;
      if (reveal && !reduced && e.intersectionRatio >= 0.5 && p.phase === 'wait' && !p.frozen && !p.seen) { p.seen = true; sweep(); }
      for (const v of [a.current, b.current]) { if (!v) continue; if (e.isIntersecting && live()) v.play().catch((e) => playMuted(v, e)); else if (!e.isIntersecting || holdSweep) v.pause(); } }, { threshold: [0, 0.2, 0.5] });
    io.observe(r); return () => io.disconnect();
  }, [still, before.url, after.url, reveal, reduced]);
  /* keep looping: on screen, tab visible and meant to play → a paused or stuck clip plays again (see the header) */
  useEffect(() => {
    if (still || failed) return; const last = new Map<HTMLVideoElement, [number, number]>(); /* a clip's last time, and how many beats it sat there */
    const id = window.setInterval(() => {
      if (!onScreen.current || document.hidden || !live()) { last.clear(); return; }
      for (const v of [a.current, b.current]) { if (!v || v.readyState === 0) continue;
        if (v.paused || v.ended) { if (v.ended) { try { v.currentTime = 0; } catch { /* not seekable yet */ } } v.play().catch((e) => playMuted(v, e)); last.delete(v); continue; }
        const t = v.currentTime; const [was, n] = last.get(v) ?? [-1, 0]; const stuck = was === t ? n + 1 : 0; last.set(v, [t, stuck >= 2 ? 0 : stuck]);
        if (stuck >= 2) { try { v.currentTime = t >= (v.duration || Infinity) - 0.3 ? 0 : t + 0.01; } catch { /* not seekable yet */ } v.play().catch((e) => playMuted(v, e)); } }
    }, WATCH_MS);
    return () => window.clearInterval(id);
  }, [still, failed, holdSweep]); // eslint-disable-line react-hooks/exhaustive-deps
  /* a clip that already played and then errors (a dropped request at the loop seam): reload it and carry on; one that never played is broken */
  const onClipError = (v: HTMLVideoElement) => {
    if (played.current !== after.url || retries.current >= RETRIES) { if (reveal) { setBad(after.url); failCb.current?.(); } return; }
    retries.current += 1; window.setTimeout(() => { if (!v.isConnected) return; v.load(); if (onScreen.current && !document.hidden && live()) v.play().catch((e) => playMuted(v, e)); }, 400 * retries.current);
  };
  useEffect(() => { retries.current = 0; }, [after.url]);
  /* reveal: a new clip (another take) or a replay starts from the still again */
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } if (!reveal || reduced) return; const p = pos.current; if (p.seen) sweep(); else { p.x = p.target = 1; p.phase = 'wait'; } }, [after.url, replay]);
  /* jump to one beat: the before held, the after's first frame held, or both playing (holdSweep reveals) */
  useEffect(() => { if (!jump || !reveal) return; const p = pos.current; p.seen = true; p.hold = false;
    if (jump.to === 'play') { if (reduced && still) setStill(false); startPlay(); return; }
    p.frozen = true; p.phase = jump.to; p.x = p.target = jump.to === 'wait' ? 1 : 0; tell(); holdAll();
    const el = stage.current; if (el) { el.style.setProperty('--x', `${p.x * 100}%`); el.style.setProperty('--lo', '0'); } }, [jump?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const sync = () => { const x = a.current, y = b.current; if (x && y && Math.abs(x.currentTime - y.currentTime) > 0.12) x.currentTime = y.currentTime; };
  const at = (e: React.PointerEvent) => { const r = stage.current!.getBoundingClientRect(); return Math.min(reveal ? 1 : 0.98, Math.max(reveal ? 0 : 0.02, (e.clientX - r.left) / r.width)); };
  const move = (e: React.PointerEvent) => { if (!stage.current || still || failed) return; if (reveal && !pos.current.hold) return; pos.current.hold = true; pos.current.target = at(e); };
  const down = (e: React.PointerEvent) => { if (!reveal || !stage.current || still || failed) return; const p = pos.current; const wake = holdSweep && !p.frozen && (p.phase === 'sweep' || p.phase === 'hold'); p.hold = true; p.phase = 'park'; p.target = at(e); tell(); if (wake) playAll(); try { stage.current.setPointerCapture(e.pointerId); } catch { /* synthetic */ } };
  const up = () => { if (reveal) { pos.current.hold = false; pos.current.phase = 'park'; } };
  /* the keyboard slider: arrows 5 %, Page Up / Down 20 %, Home / End; it parks the line where it lands (and wakes a held holdSweep) */
  const key = (e: React.KeyboardEvent) => {
    const p = pos.current; const d: Record<string, number> = { ArrowLeft: -0.05, ArrowDown: -0.05, ArrowRight: 0.05, ArrowUp: 0.05, PageDown: -0.2, PageUp: 0.2 };
    const x = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : e.key in d ? p.x + d[e.key] : null; if (x == null) return; e.preventDefault();
    const wake = holdSweep && (p.frozen || p.phase === 'sweep' || p.phase === 'hold' || p.phase === 'wait'); p.seen = true; p.hold = false; p.frozen = false; p.phase = 'park';
    p.x = p.target = Math.min(1, Math.max(0, x)); tell(); paintAt(p.x); if (wake) playAll();
  };
  const leave = () => { if (reveal) return; pos.current.hold = false; pos.current.t0 = performance.now() - 1200; };
  const toggleSound = () => {
    const on = snd.toggle();
    const v = b.current; if (v && on) { if (holdSweep && on && !live()) { startPlay(); return; } if (on && restartOnSound) { try { v.currentTime = 0; } catch { /* not loaded yet */ } } if (live()) v.play().catch(() => 0); }
  };
  const showClip = !(reveal && still) && !failed;
  return <section ref={root} className={`hreel${ready ? ' is-ready' : ''}${still ? ' is-still' : ''}${reveal ? ' is-reveal' : ''}${failed ? ' is-failed' : ''}${className ? ` ${className}` : ''}`} data-testid={testId}>
    <div ref={stage} className="hreel-stage" style={position ? { ['--hreel-pos' as string]: position } : undefined} onPointerMove={move} onPointerLeave={leave} onPointerDown={down} onPointerUp={up} onPointerCancel={up} aria-hidden>
      {still && !reveal ? <img className="hreel-media" src={after.poster} alt="" /> : showClip ? <video ref={b} data-media-keep="" className="hreel-media" src={after.url} poster={after.poster} muted loop playsInline preload="metadata" onTimeUpdate={(e) => { sync(); tickCb.current?.(e.currentTarget.currentTime, e.currentTarget.duration || 0); }} onPlaying={() => { setReady(true); played.current = after.url; }}
        onEnded={(e) => { const v = e.currentTarget; if (!live()) return; try { v.currentTime = 0; } catch { /* not seekable */ } v.play().catch((x) => playMuted(v, x)); }} onError={(e) => onClipError(e.currentTarget)} onLoadedMetadata={(e) => { const t = a.current?.currentTime ?? 0; if (t > 0 && t < e.currentTarget.duration) e.currentTarget.currentTime = t; }} /> : null}
      <div className="hreel-before">{stillBefore ? <img className="hreel-media" src={before.url} alt="" draggable={false} /> : still ? <img className="hreel-media" src={before.poster} alt="" /> : <video ref={a} data-media-keep="" className="hreel-media" src={before.url} poster={before.poster} muted loop playsInline preload="metadata" />}</div>
      <span className="hreel-line"><i className="hreel-tag">{before.label}</i><i className="hreel-tag hreel-tag-on">{after.label}</i></span>
      <span className="hreel-grain" /><span className="hreel-shade" />
    </div>
    {reveal && showClip && !still && <span ref={knob} className="hreel-knob" role="slider" tabIndex={0} aria-label={`Line between ${before.label} and ${after.label}`} aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={100} aria-orientation="horizontal" onKeyDown={key} data-testid={testId ? `${testId}-line` : undefined} />}
    <div className="hreel-copy">{children}</div>
    {aside && <div className="hreel-aside">{aside}</div>}
    {reveal && still && !failed && <button type="button" className="hreel-play" aria-label={`Play: ${label ?? after.label}`} data-testid={testId ? `${testId}-play` : undefined} onClick={() => setStill(false)}><PlayIcon size={26} /></button>}
    {sound && !still && !failed && <SoundToggle on={snd.lit} waiting={snd.waiting} label={snd.hint} onToggle={toggleSound} testId={testId ? `${testId}-sound` : undefined} />}
  </section>;
}
