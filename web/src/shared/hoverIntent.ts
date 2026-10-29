import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { useDismiss } from './useDismiss';
/**
 * One hover-intent rule for every hover card (2026-10-25): the model menu's preview card (shared/ModelPreviewCard.tsx) and the Models page
 * card (shared/ModelInfoCard.tsx).
 *  - Hovering a row opens its card after a short wait; moving to another row swaps it after a shorter one (no flicker on fast moves).
 *  - Leaving the row starts a grace delay. While the pointer is still moving inside the "aim" triangle (from where it left the row to the
 *    card's near edge) the card stays put and other rows it crosses don't take over, so a diagonal move reaches the card.
 *  - Hovering or focusing the card keeps it open; leaving both the row and the card closes it.
 *  - Keyboard: focusing a row opens its card at once; Tab from the row goes into the card, Shift+Tab from its first item back to the row,
 *    Tab past its last item on to the next row; Esc inside the card closes it and puts focus back on the row.
 *  - Touch / phones (hover: none, or narrow): no hover card; the caller's own tap behaviour is unchanged.
 */
import { inAimTriangle, type Pt } from './hoverAim';
export { inAimTriangle, type Pt, type Box } from './hoverAim';

export const HOVER_MS = { open: 160, swap: 60, close: 180, /** grace while aiming at the card */ aim: 450, /** "still moving" window */ moving: 120 };
export const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** Phones and touch screens: no hover. */
export const touchUi = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 640px), (hover: none)').matches;

/** What the card element spreads on itself: keeps the card open while hovered or focused, Tab / Esc handling. */
export interface HoverCardProps { ref: (el: HTMLElement | null) => void; onMouseEnter: () => void; onMouseLeave: () => void; onFocus: () => void; onBlur: (e: FocusEvent<HTMLElement>) => void; onKeyDown: (e: KeyboardEvent<HTMLElement>) => void }

export function useHoverIntent<T>({ open = HOVER_MS.open, swap = HOVER_MS.swap, close = HOVER_MS.close, same, next }: {
  open?: number; swap?: number; close?: number; /** two targets are the same card (default: ===) */ same?: (a: T, b: T) => boolean;
  /** where Tab past the card's last item goes (default: back to the row) */ next?: (row: HTMLElement) => HTMLElement | null | undefined;
} = {}) {
  const [cur, setCur] = useState<{ t: T; el: HTMLElement } | null>(null); const curRef = useRef(cur); curRef.current = cur;
  const timer = useRef<number | undefined>(undefined); const card = useRef<HTMLElement | null>(null);
  const pt = useRef<Pt | null>(null); const moved = useRef(0); const apex = useRef<Pt | null>(null); const [inCard, setInCard] = useState(false);
  const clear = () => { window.clearTimeout(timer.current); timer.current = undefined; };
  useEffect(() => () => clear(), []);
  /* focus inside the card, read from the DOM (focus can move between the card and the row in one batch of state updates) */
  useEffect(() => { if (!cur) { setInCard(false); return; } const f = () => window.setTimeout(() => setInCard(!!card.current?.contains(document.activeElement)), 0);
    document.addEventListener('focusin', f); document.addEventListener('focusout', f); f(); return () => { document.removeEventListener('focusin', f); document.removeEventListener('focusout', f); }; }, [cur]);
  useEffect(() => { if (!cur) return; const mv = (e: PointerEvent) => { pt.current = { x: e.clientX, y: e.clientY }; moved.current = Date.now(); };
    document.addEventListener('pointermove', mv, { passive: true }); return () => document.removeEventListener('pointermove', mv); }, [!!cur]);
  /** heading for the card: inside the aim triangle and still moving */
  const aiming = () => { const c = card.current, a = apex.current, p = pt.current; if (!c || !a || !p || !c.isConnected) return false;
    return Date.now() - moved.current < HOVER_MS.moving && inAimTriangle(p, a, c.getBoundingClientRect()); };
  const hide = () => { clear(); setCur(null); };
  /** the pointer entered a row (or it got focus: `now`) */
  const enter = (t: T, el: HTMLElement, now = false) => {
    clear(); if (touchUi()) return; const c = curRef.current;
    if (c && c.el === el && (same ? same(c.t, t) : c.t === t)) { apex.current = null; return; } // back on its own row: keep it
    const go = () => { apex.current = null; setCur({ t, el }); };
    if (now) return go();
    const wait = (waited: number) => { timer.current = window.setTimeout(() => { if (aiming() && waited < HOVER_MS.aim) wait(waited + HOVER_MS.moving); else go(); }, HOVER_MS.moving); };
    if (c && aiming()) wait(0); else timer.current = window.setTimeout(go, c ? swap : open);
  };
  /** the pointer left a row (pass the event: where it left is the aim triangle's apex) or the row lost focus */
  const leave = (e?: MouseEvent | { clientX: number; clientY: number }) => {
    clear(); if (e && typeof e.clientX === 'number') { apex.current = { x: e.clientX, y: e.clientY }; pt.current = { ...apex.current }; moved.current = Date.now(); } else apex.current = null;
    const settle = (waited: number) => { timer.current = window.setTimeout(() => { if (aiming() && waited < HOVER_MS.aim) settle(waited + HOVER_MS.moving); else setCur(null); }, waited ? HOVER_MS.moving : close); };
    settle(0);
  };
  const focusIn = (): boolean => { const f = card.current?.querySelector<HTMLElement>(FOCUSABLE); if (!f) return false; clear(); f.focus(); return true; };
  /** on the row: Tab goes into its open card */
  const rowKeyDown = (e: KeyboardEvent<HTMLElement>) => { const c = curRef.current;
    if (e.key === 'Tab' && !e.shiftKey && c && c.el === e.currentTarget && e.target === e.currentTarget && focusIn()) e.preventDefault(); };
  useDismiss(inCard, () => { const el = curRef.current?.el; hide(); el?.focus(); }); // Esc inside the card: close it, back to the row (not the whole menu)
  const cardProps: HoverCardProps = {
    ref: el => { card.current = el; },
    onMouseEnter: () => { clear(); apex.current = null; },
    onMouseLeave: () => { apex.current = null; leave(); },
    onFocus: () => { clear(); setInCard(true); }, // at once, so an Esc right after Tab closes the card, not the menu
    onBlur: e => { if (e.currentTarget.contains(e.relatedTarget as Node | null)) return; const back = curRef.current?.el; if (back && back === e.relatedTarget) return; leave(); },
    onKeyDown: e => { const c = curRef.current; if (!c || e.key !== 'Tab') return; const items = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); c.el.focus(); }
      else if (!e.shiftKey && document.activeElement === items[items.length - 1]) { e.preventDefault(); const n = next?.(c.el); hide(); (n ?? c.el).focus(); } },
  };
  return { cur, enter, leave, hide, rowKeyDown, cardProps };
}
