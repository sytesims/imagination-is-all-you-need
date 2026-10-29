/**
 * The one media manager (2026-10-27): what plays while the tab is in the background, and how much video the page keeps decoded.
 * Why: Safari unloads heavy background tabs and reloads them on return (the "it refreshed by itself" report). A page full of playing,
 * decoded clips (Explore's hero, rails, feed cards) is exactly what it drops first. So:
 *  - Tab hidden (visibilitychange, pagehide, freeze): every playing <video> / <audio> pauses, and each one remembers it was playing and
 *    whether it was muted. Back on screen (visibilitychange, pageshow from the back/forward cache, resume): only those play again, never
 *    with sound if they were muted. Something that starts playing while hidden is paused at once and joins the list.
 *  - Off screen, decorative clips (muted + loop, no controls) pause, and drop their buffered source after a while (shared/mediaBudget.ts);
 *    they come back before they scroll into view. At most 3 decorative clips play at once.
 * No registration needed for anything in the DOM: the manager finds every <video> and <audio> itself. A detached player (new Audio())
 * calls registerMedia(el); a Web Audio graph calls registerAudioContext(ctx). Opt-outs: data-media-keep on a <video> (Explore's hero:
 * never budget-paused or unloaded; it still pauses with the tab). Installed once from main.tsx.
 */
import { createMediaBudget, type BudgetMedia } from './mediaBudget';

/** The few fields the manager uses (an HTMLMediaElement has them all; tests pass plain objects). */
export interface MediaLike { paused: boolean; muted: boolean; ended?: boolean; isConnected?: boolean; play(): Promise<void> | void; pause(): void }
export interface AudioCtxLike { state: string; suspend(): Promise<void>; resume(): Promise<void> }

export interface MediaPauseEnv { /** every media element in the page right now */ list: () => Iterable<MediaLike>; hidden: () => boolean }

/** Pure core (tested in server/test/media-pause.test.ts): hide() pauses what plays and remembers it; show() resumes only that. */
export function createMediaPause(env: MediaPauseEnv) {
  const held = new Map<MediaLike, { muted: boolean }>();
  const extra = new Set<MediaLike>(); const ctxs = new Set<AudioCtxLike>(); const ctxHeld = new Set<AudioCtxLike>();
  const all = (): MediaLike[] => { const s = new Set<MediaLike>(env.list()); extra.forEach(e => s.add(e)); return [...s]; };
  const hold = (el: MediaLike) => { if (el.paused || el.ended) return; if (!held.has(el)) held.set(el, { muted: !!el.muted }); try { el.pause(); } catch { /* detached */ } };
  const hide = () => {
    all().forEach(hold);
    ctxs.forEach(c => { if (c.state === 'running') { ctxHeld.add(c); c.suspend().catch(() => 0); } });
  };
  const show = () => {
    if (env.hidden()) return;
    const back = [...held]; held.clear();
    for (const [el, rec] of back) {
      if (el.isConnected === false && !extra.has(el)) continue; /* gone from the page meanwhile */
      if (!el.paused) continue; /* something else already started it */
      if (rec.muted && !el.muted) el.muted = true; /* never come back louder than it left */
      let p: Promise<void> | void; try { p = el.play(); } catch { continue; }
      /* the browser refused sound without a fresh gesture: play muted rather than not at all, never louder */
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch((e: unknown) => { if (!el.muted && (e as { name?: string })?.name === 'NotAllowedError') { el.muted = true; Promise.resolve(el.play()).catch(() => 0); } });
    }
    const cs = [...ctxHeld]; ctxHeld.clear(); cs.forEach(c => { if (c.state === 'suspended') c.resume().catch(() => 0); });
  };
  /** A play that started while hidden (an observer, a timer): pause it and resume it with the rest. */
  const onPlay = (el: MediaLike) => { if (env.hidden()) hold(el); };
  return {
    hide, show, onPlay, sync: () => (env.hidden() ? hide() : show()),
    register: (el: MediaLike) => { extra.forEach(x => { if (x !== el && x.paused && !held.has(x)) extra.delete(x); }); /* stopped previews drop out */ extra.add(el); return () => { extra.delete(el); held.delete(el); }; },
    registerContext: (c: AudioCtxLike) => { ctxs.add(c); return () => { ctxs.delete(c); ctxHeld.delete(c); }; },
    /** how many players wait to resume (tests, the debug readout) */ get heldCount() { return held.size; },
    isHeld: (el: MediaLike) => held.has(el),
  };
}

type Mgr = ReturnType<typeof createMediaPause>;
let mgr: Mgr | null = null; const early: MediaLike[] = []; const earlyCtx: AudioCtxLike[] = [];
/** A player that isn't in the DOM (new Audio(), a preview element): pause and resume it with the tab. Returns unregister. */
export function registerMedia(el: MediaLike): () => void { if (mgr) return mgr.register(el); early.push(el); return () => { const i = early.indexOf(el); if (i >= 0) early.splice(i, 1); }; }
/** A Web Audio graph: suspended while the tab is hidden (if it was running), resumed after. Returns unregister. */
export function registerAudioContext(c: AudioCtxLike): () => void { if (mgr) return mgr.registerContext(c); earlyCtx.push(c); return () => { const i = earlyCtx.indexOf(c); if (i >= 0) earlyCtx.splice(i, 1); }; }

/** What the manager sees now (tests in the browser, the report numbers). */
export function mediaStats() {
  if (typeof document === 'undefined') return null;
  const vs = [...document.querySelectorAll('video')]; const au = [...document.querySelectorAll('audio')];
  return { videos: vs.length, withSource: vs.filter(v => !!v.getAttribute('src') || !!v.querySelector('source')).length, decoded: vs.filter(v => v.readyState >= 2).length,
    playing: vs.filter(v => !v.paused).length, playingWithSound: [...vs, ...au].filter(v => !v.paused && !v.muted).length, audio: au.length, held: mgr?.heldCount ?? 0 };
}

let installed = false;
/** Wire the manager to the page (main.tsx, once). Safe to call twice; does nothing outside a browser. */
export function installMediaManager(): void {
  if (installed || typeof document === 'undefined' || typeof window === 'undefined') return; installed = true;
  const hidden = () => document.visibilityState === 'hidden' || document.hidden === true;
  const m = createMediaPause({ hidden, list: () => document.querySelectorAll<HTMLMediaElement>('video, audio') });
  mgr = m; early.splice(0).forEach(e => m.register(e)); earlyCtx.splice(0).forEach(c => m.registerContext(c));
  const budget = createMediaBudget({ hidden });
  /* order on return matters: put back the sources first (setting src restarts loading), then resume what was playing */
  const hide = () => { m.hide(); budget.onHidden(); };
  const show = () => { if (hidden()) return; budget.onShown(); m.show(); };
  document.addEventListener('visibilitychange', () => (hidden() ? hide() : show()));
  window.addEventListener('pagehide', hide); /* bfcache: nothing plays in a frozen page */
  window.addEventListener('pageshow', (e) => { if ((e as PageTransitionEvent).persisted) show(); });
  document.addEventListener('freeze', hide); document.addEventListener('resume', show); /* Chrome's page lifecycle */
  /* media events don't bubble, but a capturing listener on the document sees every one */
  document.addEventListener('play', (e) => { const t = e.target; if (t instanceof HTMLMediaElement) { m.onPlay(t); if (!hidden()) budget.onPlay(t as unknown as BudgetMedia); } }, true);
  const off = (e: Event) => { const t = e.target; if (t instanceof HTMLVideoElement) budget.onStop(t as unknown as BudgetMedia); };
  document.addEventListener('pause', off, true); document.addEventListener('ended', off, true); document.addEventListener('emptied', off, true);
  /* every video the page loads is watched for being on / off screen */
  document.addEventListener('loadstart', (e) => { const t = e.target; if (t instanceof HTMLVideoElement) budget.watch(t as unknown as BudgetMedia); }, true);
  document.querySelectorAll('video').forEach(v => budget.watch(v as unknown as BudgetMedia));
  if (hidden()) hide();
  (window as unknown as { __ohfMedia?: unknown }).__ohfMedia = { stats: mediaStats, budget };
}
