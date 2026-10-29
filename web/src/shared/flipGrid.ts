import type React from 'react';
import { useLayoutEffect, useRef } from 'react';
/** New items landing at the top of a grid (e.g. a clip an agent just made) slide the existing tiles over instead of
 *  making them jump: each tile starts at its old spot (transform) and glides to the new one. Only for prepends;
 *  filtering or re-sorting moves tiles as usual. */
export function useFlipOnPrepend(ref: React.RefObject<HTMLElement>, ids: string[], selector = ':scope > article') {
  const prevPos = useRef<Map<string, { x: number; y: number }>>(new Map()); const prevIds = useRef<string[]>([]);
  useLayoutEffect(() => {
    const g = ref.current; if (!g) return;
    const gr = g.getBoundingClientRect();
    const els = [...g.querySelectorAll<HTMLElement>(selector)];
    const pos = new Map(els.map(e => { const r = e.getBoundingClientRect(); return [e.id, { x: r.left - gr.left, y: r.top - gr.top }] as const; }));
    const old = prevIds.current;
    const prepended = old.length > 0 && ids.length > old.length && ids[0] !== old[0] && ids.includes(old[0]);
    if (prepended && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const e of els) { const was = prevPos.current.get(e.id), now = pos.get(e.id)!; if (!was) { e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' }); continue; }
        const dx = was.x - now.x, dy = was.y - now.y; if (dx || dy) e.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 300, easing: 'ease-out' }); }
    }
    prevPos.current = pos; prevIds.current = ids;
  });
}
