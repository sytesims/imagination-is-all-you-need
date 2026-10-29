/**
 * MediaRail (2026-10-26, shared): a horizontal strip of media tiles that scrolls smoothly, snaps to tiles, fades at the edge that has more,
 * and has round prev / next buttons (hidden at either end). Children are the tiles; give each tile a width (CSS) and the rail a height.
 * Keyboard: the strip is a focusable region (arrow keys scroll it); the buttons are real buttons. Reduced motion: instant jumps.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRightIcon } from '../ui/Icons';
import { prefersReducedMotion } from './HoverClip';
import './editorial.css';

export function MediaRail({ children, label, className = '', testId }: { children: ReactNode; label: string; className?: string; testId?: string }) {
  const track = useRef<HTMLDivElement>(null); const [edge, setEdge] = useState({ start: true, end: false });
  useEffect(() => {
    const el = track.current; if (!el) return;
    const f = () => setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
    f(); el.addEventListener('scroll', f, { passive: true }); const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(f) : null; ro?.observe(el);
    return () => { el.removeEventListener('scroll', f); ro?.disconnect(); };
  }, []);
  const go = (dir: 1 | -1) => { const el = track.current; if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); };
  return <div className={`mrail${edge.start ? ' at-start' : ''}${edge.end ? ' at-end' : ''} ${className}`} data-testid={testId}>
    <div ref={track} className="mrail-track" role="region" aria-label={label} tabIndex={0}>{children}</div>
    <button type="button" className="mrail-btn mrail-prev" aria-label="Scroll back" onClick={() => go(-1)} tabIndex={edge.start ? -1 : 0}><ChevronRightIcon size={18} /></button>
    <button type="button" className="mrail-btn mrail-next" aria-label="Scroll on" onClick={() => go(1)} tabIndex={edge.end ? -1 : 0}><ChevronRightIcon size={18} /></button>
  </div>;
}
