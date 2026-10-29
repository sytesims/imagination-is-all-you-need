import { useEffect, useRef, useState, type ReactNode } from 'react';
/** Wraps one horizontally scrolling row (its only child). Fades the edge that has more content and shows a small arrow there. */
export default function ScrollFade({ children, className = '' }: { children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null); const [edge, setEdge] = useState({ l: false, r: false });
  useEffect(() => {
    const el = box.current?.firstElementChild as HTMLElement | null; if (!el) return;
    const upd = () => setEdge(e => { const l = el.scrollLeft > 2, r = el.scrollLeft + el.clientWidth < el.scrollWidth - 2; return e.l === l && e.r === r ? e : { l, r }; });
    upd(); el.addEventListener('scroll', upd, { passive: true }); const ro = new ResizeObserver(upd); ro.observe(el); const mo = new MutationObserver(upd); mo.observe(el, { childList: true });
    return () => { el.removeEventListener('scroll', upd); ro.disconnect(); mo.disconnect(); };
  }, []);
  const go = (d: number) => { const el = box.current?.firstElementChild as HTMLElement | null; el?.scrollBy({ left: d * el.clientWidth * 0.8, behavior: 'smooth' }); };
  return <div ref={box} className={`sfade ${edge.l ? 'sf-l' : ''} ${edge.r ? 'sf-r' : ''} ${className}`} data-testid="scroll-fade">
    {children}
    {edge.l && <button type="button" className="sf-btn sf-prev" tabIndex={-1} aria-label="Scroll left" onClick={() => go(-1)}>‹</button>}
    {edge.r && <button type="button" className="sf-btn sf-next" tabIndex={-1} aria-label="Scroll right" onClick={() => go(1)}>›</button>}
  </div>;
}
