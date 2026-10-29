/** One player at a time: starting one audio (or video) pauses whichever other one is playing.
 *  Opt-in per element: `useExclusivePlayback(ref)`, or `claimPlayback(el)` from an onPlay handler. */
import { useEffect, type RefObject } from 'react';

let current: HTMLMediaElement | null = null;

/** Make `el` the one playing element; pauses the previous one if it is still playing. */
export function claimPlayback(el: HTMLMediaElement) {
  if (current && current !== el && !current.paused) { try { current.pause(); } catch { /* detached element */ } }
  current = el;
}

/** Forget `el` (unmount, or it ended), so a stale element is never paused later. */
export function releasePlayback(el: HTMLMediaElement) { if (current === el) current = null; }

/** The element that last started playing, if any (tests / debugging). */
export const currentPlayback = () => current;

/** Wire an <audio>/<video> ref into the one-at-a-time rule for its lifetime. */
export function useExclusivePlayback(ref: RefObject<HTMLMediaElement | null>) {
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onPlay = () => claimPlayback(el);
    el.addEventListener('play', onPlay);
    return () => { el.removeEventListener('play', onPlay); releasePlayback(el); };
  }, [ref]);
}
