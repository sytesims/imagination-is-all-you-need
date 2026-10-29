/**
 * The sound director (2026-10-28, shared; Explore): one page-wide sound mode for every clip with sound, so the sound follows the section
 * you are looking at. Every player with a sound track registers here (shared ShowcaseFilm, HeroReel, useSyncClips, or a page's own
 * HoverClip through useDirectedSound); nothing else may touch a registered clip's `muted`.
 *  - One choice for the page, on by default, remembered in localStorage (SOUND_KEY). The old per-section keys (heroSound, stillSound,
 *    koiSound, swapSound, layersSound, filmSound, x3dSound) fold into it once: any "on" → on, else any "off" → off; then they are removed.
 *  - The clip with sound that is most in view carries it (an IntersectionObserver per clip: how much of what could show is showing, then
 *    nearest the middle of the screen). Every other clip is muted. A change crossfades over FADE_MS (the old one fades out, the new one in).
 *    A clip below MIN_SHARE in view never sounds, so a silent section in view means silence.
 *  - Browsers refuse sound before the page gets a gesture: until then everything plays muted, the sound buttons show "waiting" and the
 *    clip that would sound shows one small hint. The first click, key or tap anywhere turns the sound on for the clip in view.
 *  - One sound at a time, always. A film the viewer pressed Play on (`explicit`: IIAYN FILMS' player) wins over scroll-follow while it plays
 *    (and while any of it is on screen); it gives the sound back when it ends, pauses or closes.
 *  - Muting from any clip's button mutes the page; unmuting from a clip's button brings the sound back there (it is preferred while in view).
 *  - A hidden tab: every clip is muted at once (shared/mediaPause pauses them); back on screen, the clip in view gets its sound back.
 *  - Opt-in hoverSound films: temporary pointer/keyboard attention wins while playing and visible, without changing mute or activation.
 *    Handoffs to/from that group fade out before fading in, so even rapid pointer moves never overlap two audible tracks.
 * Pure parts (shared/soundPick.ts: readSoundChoice, pickSound) are tested in server/test/sound-director.test.ts.
 */
import { useCallback, useEffect, useId, useRef, useSyncExternalStore, type RefObject } from 'react';

import { MIN_SHARE, OLD_SOUND_KEYS, SOUND_KEY, FADE_MS, SETTLE_MS, pickSound, readSoundChoice, type SoundCandidate } from './soundPick';
export { SOUND_KEY, OLD_SOUND_KEYS, readSoundChoice, pickSound } from './soundPick';

/* ------------------------------------------------------------------ the store ------------------------------------------------------------------ */
interface Entry { id: string; root: Element | null; media: () => HTMLMediaElement | null; sound: boolean; explicit: boolean; exclusive: boolean; share: number; off: number; order: number }
export interface SoundSnapshot { /** the page's choice */ on: boolean; /** the page has had a gesture (sound allowed) */ gesture: boolean; /** the clip that carries (or would carry) the sound */ active: string | null }

const entries = new Map<string, Entry>(); let order = 0; let prefer: string | null = null;
let attention: string | null = null; let attendedLast = false; let exclusiveHandoff = false; let revision = 0;
let snap: SoundSnapshot = { on: true, gesture: false, active: null }; let loaded = false;
const subs = new Set<() => void>();
const set = (p: Partial<SoundSnapshot>) => { const n = { ...snap, ...p }; if (n.on === snap.on && n.gesture === snap.gesture && n.active === snap.active) return; snap = n; subs.forEach((f) => f()); };
const hidden = () => typeof document !== 'undefined' && (document.visibilityState === 'hidden' || document.hidden === true);

function load() {
  if (loaded) return; loaded = true;
  const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
  const c = readSoundChoice(get); snap = { ...snap, on: c.on };
  if (c.migrated) { try { localStorage.setItem(SOUND_KEY, c.on ? '1' : '0'); OLD_SOUND_KEYS.forEach((k) => localStorage.removeItem(k)); } catch { /* private mode: not remembered */ } }
  const ua = (typeof navigator !== 'undefined' ? (navigator as { userActivation?: { hasBeenActive?: boolean } }).userActivation : undefined);
  if (ua?.hasBeenActive) snap = { ...snap, gesture: true };
}
const save = (on: boolean) => { try { localStorage.setItem(SOUND_KEY, on ? '1' : '0'); } catch { /* private mode: not remembered */ } };

/* ------------------------------------------------------------------ fades ------------------------------------------------------------------ */
const fades = new Map<HTMLMediaElement, number>();
/** to 1: unmute and fade in; to 0: fade out, then mute (and put the volume back, so a muted clip rests at full volume) */
function fade(el: HTMLMediaElement, to: 0 | 1, instant: boolean, done?: () => void, duration = FADE_MS) {
  const running = fades.get(el); if (running != null) { cancelAnimationFrame(running); fades.delete(el); }
  if (to === 0 && el.muted) { el.volume = 1; done?.(); return; }
  if (to === 1 && !el.muted && el.volume >= 1 && running == null) { done?.(); return; }
  if (instant || typeof requestAnimationFrame !== 'function') { if (to) { el.volume = 1; el.muted = false; } else { el.muted = true; el.volume = 1; } done?.(); return; }
  if (to === 1 && el.muted) { el.volume = 0; el.muted = false; }
  const from = el.volume; const dur = Math.max(1, duration * Math.abs(to - from)); const t0 = performance.now();
  const step = (now: number) => { const k = Math.min(1, (now - t0) / dur); el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) { fades.set(el, requestAnimationFrame(step)); return; } fades.delete(el); if (to === 0) { el.muted = true; el.volume = 1; } done?.(); };
  fades.set(el, requestAnimationFrame(step));
}

/* ------------------------------------------------------------------ the director ------------------------------------------------------------------ */
function candidates(): SoundCandidate[] {
  return [...entries.values()].map((e) => { const el = e.media(); return { id: e.id, sound: e.sound && !!el, share: e.share, off: e.off, explicit: e.explicit, playing: !!el && !el.paused && !el.ended, order: e.order }; });
}
/** pick the clip, then fade every registered clip to where it should be */
function apply() {
  const current = ++revision;
  if (prefer) { const p = entries.get(prefer); if (!p || p.share < MIN_SHARE) prefer = null; }
  if (attention) { const p = entries.get(attention); if (!p || !p.sound || p.share < MIN_SHARE || hidden()) attention = null; }
  const active = pickSound(candidates(), prefer, attention); set({ active });
  const loud = snap.on && snap.gesture && !hidden(); const now = hidden();
  const attended = !!attention && attention === active;
  const exclusive = attended || attendedLast || exclusiveHandoff || !!(active && entries.get(active)?.exclusive)
    || [...entries.values()].some(e => e.exclusive && e.media()?.muted === false);
  attendedLast = attended;
  if (exclusive) {
    // Hover handoffs are fade-out THEN fade-in, not overlapping crossfades.
    // A revision invalidates pending arrivals when the pointer moves rapidly.
    const media = [...entries.values()].flatMap(e => { const el = e.media(); return el ? [{ id: e.id, el, share: e.share, sound: e.sound }] : []; });
    if (!loud) { exclusiveHandoff = false; media.forEach(({ el }) => fade(el, 0, true)); return; }
    media.filter(e => e.share <= 0 || !e.sound).forEach(({ el }) => fade(el, 0, true));
    const target = media.find(e => e.id === active)?.el;
    const outgoing = media.filter(e => e.id !== active && !e.el.muted);
    media.filter(e => e.id !== active && e.el.muted).forEach(({ el }) => fade(el, 0, true));
    exclusiveHandoff = outgoing.length > 0;
    if (!outgoing.length) { if (target) fade(target, 1, false, undefined, FADE_MS / 2); return; }
    if (target) fade(target, 0, true);
    let left = outgoing.length;
    outgoing.forEach(({ el }) => fade(el, 0, now, () => {
      if (--left === 0 && revision === current) { exclusiveHandoff = false; if (target && active && entries.get(active)?.media() === target) fade(target, 1, false, undefined, FADE_MS / 2); }
    }, FADE_MS / 2));
    return;
  }
  for (const e of entries.values()) { const el = e.media(); if (el) fade(el, loud && e.id === active ? 1 : 0, now); }
}
let timer: ReturnType<typeof setTimeout> | null = null;
/** apply after the view settles (scrolling, a clip starting or stopping) */
function schedule() { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; apply(); }, SETTLE_MS); }

let installed = false;
function install() {
  if (installed || typeof document === 'undefined') return; installed = true; load();
  /* the first click, key or tap anywhere turns the sound on (inside the gesture, so the browser allows it); a sound button handles itself */
  const go = (e: Event) => { if (snap.gesture) return; if ((e.target as Element | null)?.closest?.('.snd-toggle')) return; set({ gesture: true }); apply(); };
  (['pointerdown', 'keydown', 'touchstart'] as const).forEach((n) => document.addEventListener(n, go, { capture: true, passive: true }));
  /* a hidden tab: everything muted now; back: the clip in view gets its sound */
  document.addEventListener('visibilitychange', () => apply());
  /* a clip starting, pausing or ending can change who carries the sound (an explicit film, a remounted clip) */
  const media = (e: Event) => { const t = e.target; if (t instanceof HTMLMediaElement && [...entries.values()].some((x) => x.media() === t)) schedule(); };
  ['play', 'pause', 'ended', 'emptied'].forEach((n) => document.addEventListener(n, media, true));
  if (typeof window !== 'undefined') (window as unknown as { __ohfSound?: unknown }).__ohfSound = { state: () => ({ ...snap, prefer, attention, clips: candidates() }) };
}

/** The viewer's mute / unmute (any clip's sound button). Returns true when the page's sound is now on. Waiting for a gesture: this click is it. */
export function toggleSound(from?: string): boolean {
  load();
  if (snap.on && !snap.gesture) { prefer = from ?? prefer; set({ gesture: true }); apply(); return true; }
  const on = !snap.on; set({ on, gesture: true }); save(on); if (on && from) prefer = from; apply(); return on;
}
/** The viewer chose to watch something with sound (a film's Play press, inside that click): the page's sound goes on, even if it was muted. */
export function turnSoundOn() { set({ on: true, gesture: true }); save(true); apply(); }
/** The browser refused sound after all (a play() with sound failed): back to waiting for a gesture. */
export function soundRefused() { set({ gesture: false }); apply(); }

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const getSnap = () => snap;

export interface DirectedSound { /** the page's sound is on (the button is lit) */ lit: boolean; /** wanted, waiting for the first gesture */ waiting: boolean;
  /** show the small "Click for sound" hint here (this clip would sound) */ hint: boolean; /** this clip carries the sound now */ active: boolean; /** mute / unmute the page from here; true when now on */ toggle: () => boolean;
  /** Temporary hover/keyboard preference; never changes mute choice or grants browser activation. */ attend: (on: boolean) => void }

/**
 * Register a clip with the director. `root`: the box whose visibility counts; `media`: the element that carries the sound (read when needed,
 * so a remounted <video> is picked up); `sound`: the clip has a sound track and its player shows it now; `explicit`: a film the viewer pressed
 * Play on. The player renders its <video> muted and never sets `muted` itself.
 */
export function useDirectedSound({ root, media, sound, explicit = false, exclusive = false }: { root: RefObject<Element>; media: () => HTMLMediaElement | null; sound: boolean; explicit?: boolean; /** Fade out before handing sound to/from an interactive group. Default players retain their crossfade. */ exclusive?: boolean }): DirectedSound {
  const id = useId(); const get = useRef(media); get.current = media;
  useEffect(() => { install(); }, []);
  useEffect(() => {
    const e: Entry = { id, root: null, media: () => get.current(), sound, explicit, exclusive, share: 0, off: 1, order: ++order };
    const prev = entries.get(id); if (prev) { e.share = prev.share; e.off = prev.off; e.order = prev.order; }
    entries.set(id, e); schedule();
    const r = root.current; let io: IntersectionObserver | null = null;
    if (r && typeof IntersectionObserver !== 'undefined') {
      e.root = r;
      io = new IntersectionObserver(([x]) => {
        const vh = x.rootBounds?.height || window.innerHeight || 1; const h = x.boundingClientRect.height || 1;
        e.share = x.isIntersecting ? Math.min(1, x.intersectionRect.height / Math.min(h, vh)) : 0;
        e.off = Math.abs((x.boundingClientRect.top + h / 2) - vh / 2) / vh; schedule();
      }, { threshold: Array.from({ length: 21 }, (_, k) => k / 20) });
      io.observe(r);
    }
    return () => { io?.disconnect(); if (entries.get(id) === e) { entries.delete(id); ++revision; if (attention === id) attention = null; const el = e.media(); if (el) fade(el, 0, true); } schedule(); };
  }, [id, sound, explicit, exclusive, root]);
  const s = useSyncExternalStore(subscribe, getSnap, getSnap);
  const attend = useCallback((on: boolean) => {
    if (on) attention = id; else if (attention === id) attention = null; else return;
    apply();
  }, [id]);
  return { lit: s.on && s.gesture, waiting: s.on && !s.gesture, hint: s.on && !s.gesture && s.active === id, active: s.active === id && s.on && s.gesture, toggle: () => toggleSound(id), attend };
}
