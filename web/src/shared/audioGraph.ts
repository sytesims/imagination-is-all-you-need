/**
 * One shared AudioContext for every audio card and the viewer, and an AnalyserNode per <audio> element so the visuals react to the real sound.
 * Rules that keep sound safe:
 *  - an element is routed through Web Audio only when its file is ours (same origin, blob: or data:); another site's file would play silent;
 *  - only once the context is running (it starts suspended until a click: `primeAudio()` from the click handler resumes it), because a
 *    routed element in a suspended context is silent too;
 *  - once routed, an element stays routed for its life (the browser allows one source per element); when it leaves the page its nodes are
 *    disconnected and forgotten.
 */
type Tap = { src: MediaElementAudioSourceNode; an: AnalyserNode };
let ctx: AudioContext | null = null;
const taps = new WeakMap<HTMLMediaElement, Tap>();

/** The shared context, created on first use; null when the browser has no Web Audio. */
export function audioCtx(): AudioContext | null {
  if (ctx) return ctx;
  const AC: typeof AudioContext | undefined = typeof window === 'undefined' ? undefined : (window as any).AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch { ctx = null; }
  return ctx;
}

/** Call from a click / key / pointer handler: browsers (Safari most of all) only let a context start inside a user gesture. */
export function primeAudio(): void {
  const c = audioCtx(); if (c && c.state !== 'running') c.resume().catch(() => { /* not allowed yet; the visuals fall back */ });
}

/** True when the element's file can be analysed without muting it. */
export function canTap(el: HTMLMediaElement): boolean {
  const u = el.currentSrc || el.getAttribute('src') || ''; if (!u) return false;
  if (/^(blob|data):/i.test(u)) return true;
  try { return new URL(u, location.href).origin === location.origin; } catch { return false; }
}

/** The analyser for `el`, routing it on first use. Null when it can't be analysed safely (see the rules above). */
export function tapAnalyser(el: HTMLMediaElement): AnalyserNode | null {
  const hit = taps.get(el); if (hit) return hit.an;
  const c = audioCtx(); if (!c || c.state !== 'running' || !canTap(el)) return null;
  try {
    const src = c.createMediaElementSource(el); const an = c.createAnalyser();
    an.fftSize = 256; an.smoothingTimeConstant = 0.72; an.minDecibels = -88; an.maxDecibels = -8; /* wider than the default -100..-30, so loud music doesn’t pin every bar */
    src.connect(an); an.connect(c.destination);
    taps.set(el, { src, an }); return an;
  } catch { return null; }
}

/** The analyser once the context is running (resuming it if needed); null when that isn't possible. */
export async function analyserFor(el: HTMLMediaElement): Promise<AnalyserNode | null> {
  const c = audioCtx(); if (!c) return null;
  if (c.state !== 'running') { try { await c.resume(); } catch { return null; } }
  return tapAnalyser(el);
}

/** Forget `el` once it has left the page (checked after the current render, so a remount of the same element keeps its route). */
export function releaseTap(el: HTMLMediaElement): void {
  setTimeout(() => {
    if (el.isConnected) return; const t = taps.get(el); if (!t) return;
    try { t.src.disconnect(); t.an.disconnect(); } catch { /* already gone */ }
    taps.delete(el);
  }, 0);
}

/** Tests / debugging: whether `el` is routed. */
export const isTapped = (el: HTMLMediaElement) => taps.has(el);
