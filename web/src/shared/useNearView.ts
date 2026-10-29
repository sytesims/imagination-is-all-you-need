import { useEffect, useRef, useState } from 'react';
/**
 * Performance: true once the element is within `margin` of the viewport (and stays true). Gallery clips use it to start
 * downloading / autoplaying only when they are about to be seen; until then they show their poster, as they did while loading.
 * One shared IntersectionObserver per margin. Without IntersectionObserver (old browsers, tests) it is true at once.
 */
type Obs = { io: IntersectionObserver; cbs: Map<Element, () => void> };
const observers = new Map<string, Obs>();
function watch(el: Element, margin: string, cb: () => void) {
  let o = observers.get(margin);
  if (!o) {
    const cbs = new Map<Element, () => void>();
    const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { const f = cbs.get(e.target); if (f) { cbs.delete(e.target); io.unobserve(e.target); f(); } } }, { rootMargin: margin });
    o = { io, cbs }; observers.set(margin, o);
  }
  const obs = o; obs.cbs.set(el, cb); obs.io.observe(el);
  return () => { obs.cbs.delete(el); obs.io.unobserve(el); };
}
export function useNearView<T extends Element>(margin = '300px'): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => { const el = ref.current; if (near || !el) return; return watch(el, margin, () => setNear(true)); }, [near, margin]);
  return [ref, near];
}
