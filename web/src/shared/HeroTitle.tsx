import { useLayoutEffect, useSyncExternalStore } from 'react';
/* One h1 per tool page: a visible canvas hero title is the h1; otherwise (no hero on screen, or the phone form view hides the canvas) the hidden panel h1 stands in. */
let heroN = 0; const heroSubs = new Set<() => void>(); const heroPing = () => heroSubs.forEach(f => f());
export const useHeroShown = () => useSyncExternalStore(cb => { heroSubs.add(cb); return () => { heroSubs.delete(cb); }; }, () => heroN > 0);
/* Batch 25: the phone form view hides the canvas; while it does, the hero title isn't rendered, so the page keeps exactly one h1. */
let canvasHidden = false; const chSubs = new Set<() => void>();
export function setHeroCanvasHidden(v: boolean) { if (canvasHidden === v) return; canvasHidden = v; chSubs.forEach(f => f()); }
const useCanvasHidden = () => useSyncExternalStore(cb => { chSubs.add(cb); return () => { chSubs.delete(cb); }; }, () => canvasHidden);
export function HeroTitle({ children, className, testId = 'hero-h1' }: { children: React.ReactNode; className?: string; testId?: string }) {
  useLayoutEffect(() => { heroN++; heroPing(); return () => { heroN--; heroPing(); }; }, []);
  if (useCanvasHidden()) return null;
  return <h1 className={`hero-h1 ${className ?? ''}`} data-testid={testId}>{children}</h1>;
}
export const useNarrow = () => useSyncExternalStore(cb => { const m = matchMedia('(max-width:760px)'); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); }, () => matchMedia('(max-width:760px)').matches);

