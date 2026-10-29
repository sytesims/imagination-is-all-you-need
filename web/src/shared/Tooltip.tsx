import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
/** PARITY-A A6: the one tooltip. A small dark label just above the control (below it when there's no room), in place of the
 *  browser's native `title`. Any element opts in with `data-tip="Label"` (spread `tip('Label')`); one <TooltipLayer/> at the app
 *  root does the rest, so no component needs refs or wrappers:
 *  - mouse hover shows it after a short delay (a second tooltip within a moment of the last shows at once);
 *  - keyboard focus (:focus-visible) shows it at once; touch never shows it;
 *  - Escape, a click, Enter / Space, scrolling, leaving or blurring hides it; it never shows while the control's own popover is open (aria-expanded),
 *    and it goes when any other popover opens (2026-10-27: a hover tip stayed over the Audio voice picker opened from the keyboard);
 *  - reduced motion: no fade.
 *  Controls keep their aria-label for screen readers; the label is linked with aria-describedby only when it says something else. */
export const TIP_DELAY = 400; const TIP_SKIP = 300; const TIP_GAP = 6; const EDGE = 8;
export const tip = (label: string | null | undefined) => (label ? { 'data-tip': label } : {});
type Shown = { el: HTMLElement; text: string };
export function TooltipLayer() {
  const [cur, setCur] = useState<Shown | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef(0); const lastHide = useRef(0); const curRef = useRef<Shown | null>(null);
  useEffect(() => {
    const target = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>('[data-tip]') : null);
    const show = (el: HTMLElement) => {
      const text = el.getAttribute('data-tip') ?? ''; if (!text || el.getAttribute('aria-expanded') === 'true') return;
      curRef.current = { el, text }; setCur(curRef.current);
    };
    const hide = () => { clearTimeout(timer.current); if (curRef.current) lastHide.current = Date.now(); curRef.current = null; setCur(null); };
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return; const el = target(e.target); if (!el) return; if (curRef.current?.el === el) return;
      clearTimeout(timer.current); const quick = !!curRef.current || Date.now() - lastHide.current < TIP_SKIP; if (curRef.current) hide();
      timer.current = window.setTimeout(() => show(el), quick ? 0 : TIP_DELAY);
    };
    const out = (e: PointerEvent) => { const el = target(e.target); if (!el) return; const to = e.relatedTarget as Node | null; if (to && el.contains(to)) return; if (curRef.current?.el === el || !curRef.current) hide(); };
    const focusIn = (e: FocusEvent) => { const el = target(e.target); if (!el || el !== e.target) return; let kb = false; try { kb = el.matches(':focus-visible'); } catch { kb = false; } if (!kb) return; clearTimeout(timer.current); show(el); };
    const focusOut = (e: FocusEvent) => { if (curRef.current && curRef.current.el === e.target) hide(); };
    const key = (e: KeyboardEvent) => { if ((e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') && curRef.current) hide(); };
    const down = () => hide();
    const scroll = () => { if (curRef.current) hide(); };
    document.addEventListener('pointerover', over, true); document.addEventListener('pointerout', out, true);
    document.addEventListener('focusin', focusIn, true); document.addEventListener('focusout', focusOut, true);
    document.addEventListener('keydown', key, true); document.addEventListener('pointerdown', down, true); addEventListener('scroll', scroll, true);
    return () => { clearTimeout(timer.current); document.removeEventListener('pointerover', over, true); document.removeEventListener('pointerout', out, true); document.removeEventListener('focusin', focusIn, true); document.removeEventListener('focusout', focusOut, true); document.removeEventListener('keydown', key, true); document.removeEventListener('pointerdown', down, true); removeEventListener('scroll', scroll, true); };
  }, []);
  /* hide when the control leaves the page or its popover opens (aria-expanded flips to true) */
  useEffect(() => {
    if (!cur) return; const el = cur.el;
    const mo = new MutationObserver(() => { if (!el.isConnected || el.getAttribute('aria-expanded') === 'true') { curRef.current = null; setCur(null); } else if (el.getAttribute('data-tip') !== cur.text) { curRef.current = { el, text: el.getAttribute('data-tip') ?? '' }; setCur(curRef.current); } });
    mo.observe(el, { attributes: true, attributeFilter: ['aria-expanded', 'data-tip'] }); if (el.parentNode) mo.observe(el.parentNode, { childList: true });
    /* another control's popover opening (from the keyboard, or a page's own code) takes the tip away too */
    const other = new MutationObserver(ms => { if (ms.some(m => m.target !== el && (m.target as Element).getAttribute?.('aria-expanded') === 'true')) { curRef.current = null; setCur(null); } });
    other.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-expanded'] });
    const al = el.getAttribute('aria-label'); const linked = al?.trim() !== cur.text.trim(); const prev = el.getAttribute('aria-describedby');
    if (linked) el.setAttribute('aria-describedby', [prev, 'app-tooltip'].filter(Boolean).join(' '));
    return () => { mo.disconnect(); other.disconnect(); if (linked) { if (prev) el.setAttribute('aria-describedby', prev); else el.removeAttribute('aria-describedby'); } };
  }, [cur]);
  useEffect(() => {
    if (!cur) { setPos(null); return; } const t = box.current; if (!t) return;
    const r = cur.el.getBoundingClientRect(); const w = t.offsetWidth, h = t.offsetHeight;
    const below = r.top - TIP_GAP - h < EDGE; const top = below ? r.bottom + TIP_GAP : r.top - TIP_GAP - h;
    const left = Math.max(EDGE, Math.min(r.left + r.width / 2 - w / 2, innerWidth - EDGE - w));
    setPos({ top: Math.round(top), left: Math.round(left), below });
  }, [cur]);
  if (!cur || typeof document === 'undefined') return null;
  return createPortal(<div ref={box} id="app-tooltip" role="tooltip" className={`app-tip${pos ? ' app-tip-in' : ''}${pos?.below ? ' app-tip-below' : ''}`} style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}>{cur.text}</div>, document.body);
}
