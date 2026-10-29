/**
 * How much video the page keeps decoded (2026-10-27, part of the one media manager, shared/mediaPause.ts installs it).
 *  - Decorative clips (muted + loop, no controls: Explore's tiles and rails, feed cards on hover) pause when they leave the screen, and
 *    after UNLOAD_MS off screen they drop their buffered source (src removed, preload="none"; the poster or the <img> under them stays).
 *    They get the source back a little before they scroll into view, and play again if it was the manager that paused them.
 *  - While the tab stays hidden for HIDDEN_UNLOAD_MS, every decorative clip drops its source; the ones near the screen come back on return.
 *  - At most MAX_PLAYING decorative clips play at once: a new one pauses the clip that started first.
 * A <video data-media-keep> is never paused or unloaded here (Explore's hero with its sound). Plain players (controls, sound, not looping:
 * the result viewer, the Assets player) are left alone. Pure logic with an injectable observer and timers (server/test/media-pause.test.ts).
 */
export const MAX_PLAYING = 3;
export const UNLOAD_MS = 20_000;
export const HIDDEN_UNLOAD_MS = 30_000;

/** The fields used (an HTMLVideoElement has them; tests pass plain objects). */
export interface BudgetMedia {
  paused: boolean; muted: boolean; loop: boolean; controls: boolean; isConnected: boolean;
  getAttribute(n: string): string | null; setAttribute(n: string, v: string): void; removeAttribute(n: string): void; hasAttribute(n: string): boolean;
  play(): Promise<void> | void; pause(): void; load(): void;
}
/** Muted, looping, no controls, not opted out: a clip that is decoration, safe to pause, budget and unload. */
export const isDecorative = (v: BudgetMedia) => !!v.muted && !!v.loop && !v.controls && !v.hasAttribute('data-media-keep');

type Watcher = { observe(el: BudgetMedia): void; unobserve(el: BudgetMedia): void };
export interface BudgetEnv {
  hidden: () => boolean; max?: number; unloadMs?: number; hiddenUnloadMs?: number;
  /** on / near screen reports (default: an IntersectionObserver with a 200 px margin) */ observer?: (cb: (el: BudgetMedia, near: boolean) => void) => Watcher | null;
  setTimer?: (f: () => void, ms: number) => unknown; clearTimer?: (t: unknown) => void;
}

const defaultObserver = (cb: (el: BudgetMedia, near: boolean) => void): Watcher | null => {
  if (typeof IntersectionObserver === 'undefined') return null;
  const io = new IntersectionObserver((es) => es.forEach(e => cb(e.target as unknown as BudgetMedia, e.isIntersecting)), { rootMargin: '200px 200px' });
  return { observe: (el) => io.observe(el as unknown as Element), unobserve: (el) => io.unobserve(el as unknown as Element) };
};

export function createMediaBudget(env: BudgetEnv) {
  const max = env.max ?? MAX_PLAYING; const unloadMs = env.unloadMs ?? UNLOAD_MS; const hiddenMs = env.hiddenUnloadMs ?? HIDDEN_UNLOAD_MS;
  const setT = env.setTimer ?? ((f, ms) => setTimeout(f, ms)); const clearT = env.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const watched = new Set<BudgetMedia>(); const near = new Map<BudgetMedia, boolean>(); const timers = new Map<BudgetMedia, unknown>();
  const unloaded = new Map<BudgetMedia, { src: string; preload: string | null }>(); const offPaused = new Set<BudgetMedia>();
  let playing: BudgetMedia[] = []; let hiddenTimer: unknown = null;

  const forget = (el: BudgetMedia) => { watched.delete(el); near.delete(el); unloaded.delete(el); offPaused.delete(el); playing = playing.filter(x => x !== el);
    const t = timers.get(el); if (t != null) clearT(t); timers.delete(el); w?.unobserve(el); };
  const unload = (el: BudgetMedia): boolean => {
    if (!el.isConnected || !el.paused || !isDecorative(el) || unloaded.has(el)) return false;
    const src = el.getAttribute('src'); if (!src) return false; /* <source> children or nothing loaded: leave it */
    unloaded.set(el, { src, preload: el.getAttribute('preload') });
    el.setAttribute('preload', 'none'); el.removeAttribute('src'); try { el.load(); } catch { /* releases the decoder and the buffer */ }
    return true;
  };
  const restore = (el: BudgetMedia) => {
    const rec = unloaded.get(el); if (!rec) return; unloaded.delete(el);
    if (el.getAttribute('src')) return; /* the page set a new source meanwhile: that one wins */
    if (rec.preload == null) el.removeAttribute('preload'); else el.setAttribute('preload', rec.preload);
    el.setAttribute('src', rec.src); /* setting src starts loading again */
  };
  const play = (el: BudgetMedia) => { try { const p = el.play(); if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => 0); } catch { /* not playable */ } };
  const onSeen = (el: BudgetMedia, isNear: boolean) => {
    if (!el.isConnected) { forget(el); return; }
    near.set(el, isNear);
    const t = timers.get(el); if (t != null) { clearT(t); timers.delete(el); }
    if (isNear) {
      restore(el);
      if (offPaused.delete(el) && !env.hidden() && el.paused) play(el);
      return;
    }
    if (!isDecorative(el)) return;
    if (!el.paused) { offPaused.add(el); el.pause(); }
    timers.set(el, setT(() => { timers.delete(el); if (near.get(el) === false) unload(el); }, unloadMs));
  };
  const w = (env.observer ?? defaultObserver)(onSeen);

  return {
    /** start watching a video (every <video> that starts loading) */
    watch: (el: BudgetMedia) => { if (watched.has(el)) return; watched.add(el); w?.observe(el); },
    /** a video started playing: keep at most `max` decorative clips going */
    onPlay: (el: BudgetMedia) => {
      if (unloaded.has(el)) restore(el);
      if (!isDecorative(el)) return;
      playing = playing.filter(x => x !== el && x.isConnected && !x.paused); playing.push(el);
      while (playing.length > max) { const old = playing.shift()!; offPaused.delete(old); try { old.pause(); } catch { /* gone */ } }
    },
    onStop: (el: BudgetMedia) => { playing = playing.filter(x => x !== el); },
    /** the tab went to the background: after a while, drop every decorative clip's source */
    onHidden: () => { if (hiddenTimer != null) return; hiddenTimer = setT(() => { hiddenTimer = null; if (!env.hidden()) return; [...watched].forEach(el => { if (!el.isConnected) forget(el); else unload(el); }); }, hiddenMs); },
    /** back on screen: the clips near the screen get their source back (before anything resumes) */
    onShown: () => { if (hiddenTimer != null) { clearT(hiddenTimer); hiddenTimer = null; } [...unloaded.keys()].forEach(el => { if (!el.isConnected) forget(el); else if (near.get(el) !== false) restore(el); }); },
    /** for tests and the report */
    stats: () => ({ watched: watched.size, unloaded: unloaded.size, playing: playing.length }),
    isUnloaded: (el: BudgetMedia) => unloaded.has(el),
  };
}
