import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useDismiss } from './useDismiss';
/** R1: the one anchored popover. Positioned from the trigger's rect, opens above (flips below when there's no room), shifts to stay
 *  inside the viewport, and renders in a portal so a panel's overflow can't clip it. Escape and outside-click close it, and focus goes
 *  back to the trigger. Arrow keys / Home / End move between its options. On phones (<640px) it's a bottom sheet with a close button. */
export type PopPlacement = 'top' | 'bottom' | 'right';
const PHONE = 640; const GAP = 8; const EDGE = 8;
/** Phone sheets are modal: the page behind stops scrolling while one is open (counted, so a sheet opened from a sheet keeps the lock) and gets its own overflow back after. */
let locks = 0; let saved: [string, string] | null = null;
function lockPageScroll() {
  const h = document.documentElement, b = document.body;
  if (locks++ === 0) { saved = [h.style.overflow, b.style.overflow]; h.style.overflow = 'hidden'; b.style.overflow = 'hidden'; }
  return () => { if (--locks > 0 || !saved) return; [h.style.overflow, b.style.overflow] = saved; saved = null; };
}
const ITEMS = '[role=option]:not([aria-disabled=true]):not(:disabled),[role=menuitem]:not(:disabled),[role=menuitemradio]:not(:disabled),[role=radio]:not(:disabled),[data-apop-item]';
export function Popover({ open, anchor, onClose, children, label, role = 'dialog', className = '', placement = 'top', align = 'start', testId, closeButton, focusFirst = true, width, avoid, over, gap = GAP, watch, keepOpen }: {
  open: boolean; anchor: RefObject<HTMLElement | null>; onClose: () => void; children: ReactNode; label: string; role?: 'dialog' | 'listbox' | 'menu';
  className?: string; placement?: PopPlacement; align?: 'start' | 'center' | 'end'; testId?: string; /** desktop close button (phones always get one) */ closeButton?: boolean; focusFirst?: boolean; width?: number; /** opening upward, stay above this element's top edge too (e.g. the composer dock); placement 'right': open beside it (a side panel) */ avoid?: RefObject<HTMLElement | null>;
  /** a panel that sits over this element at its full width (e.g. the composer dock's Style panel), while `anchor` stays the trigger for focus and outside-click */ over?: RefObject<HTMLElement | null>;
  /** px between the trigger and the panel (default 8; composer chips use the reference's 4) */ gap?: number;
  /** re-place when this element resizes, without keeping clear of it (e.g. the composer dock under a chip popover that overlaps it) */ watch?: RefObject<HTMLElement | null>;
  /** clicks here don't close it (the prompt peek stays open while you type in the prompt) */ keepOpen?: RefObject<HTMLElement | null>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number; minH?: number; side: PopPlacement; ox: number; w?: number } | null>(null);
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.innerWidth < PHONE);
  /** 2026-10-25: where the panel opened, kept while it stays open, so a trigger whose label changes width (Layout: Classic → Turnaround + face) or folds into ⋯ doesn't drag the panel sideways. */
  const openLeft = useRef<number | null>(null);
  /** 2026-10-25: the vertical side (above / below) and the tallest height so far, kept while it stays open. A panel that gets shorter
   *  (fewer options, a narrower search) keeps its frame instead of jumping, and it never flips sides mid-use. A window resize starts over. */
  const openSide = useRef<PopPlacement | null>(null); const tallest = useRef(0);
  useDismiss(open, onClose, anchor);
  const place = () => {
    const a = anchor.current, el = box.current; if (!a || !el) return;
    const vw = window.innerWidth, vh = window.innerHeight; setPhone(vw < PHONE);
    const grown = el.scrollHeight + el.offsetHeight - el.clientHeight; tallest.current = Math.max(tallest.current, grown);
    if (vw < PHONE) { const maxH = Math.round(vh * 0.8); setPos({ top: 0, left: 0, maxH, minH: Math.min(tallest.current, maxH), side: 'bottom', ox: 0 }); return; }
    const ov = over?.current?.getBoundingClientRect(); const r = ov && ov.width ? ov : a.getBoundingClientRect(); const w = ov && ov.width ? Math.min(ov.width, vw - EDGE * 2) : el.offsetWidth; const h = tallest.current; /* + borders; the tallest so far */ const av = avoid?.current?.getBoundingClientRect(); const rt = av && av.height && placement !== 'right' ? Math.min(r.top, av.top) : r.top;
    if (placement === 'right') { /* beside a side panel (video / audio / tool panels): never over it; falls back to above/below when there's no room */
      const rx = Math.max(r.right, av?.width ? av.right : 0) + gap; if (rx + w <= vw - EDGE) { const maxH = vh - EDGE * 2; const hh = Math.min(h, maxH);
        const top = Math.max(EDGE, Math.min(r.top - 12, vh - EDGE - hh)); /* level with the trigger, shifted up to fit */ setPos({ top: Math.round(top), left: Math.round(rx), maxH: Math.round(maxH), side: 'right', ox: 0 }); return; } }
    /* 2026-10-25: opening downwards above an `avoid` element (the dock), the panel stops above it instead of covering it */
    const floor = av && av.height && av.top > r.bottom ? av.top : vh;
    const above = rt - gap - EDGE, below = floor - r.bottom - gap - EDGE;
    const side: PopPlacement = openSide.current ?? (placement !== 'bottom' ? (h <= above || above >= below ? 'top' : 'bottom') : (h <= below || below >= above ? 'bottom' : 'top')); openSide.current = side;
    const maxH = Math.max(120, side === 'top' ? above : below); const hh = Math.min(h, maxH);
    let left = align === 'center' ? r.left + r.width / 2 - w / 2 : align === 'end' ? r.right - w : r.left;
    if (openLeft.current != null) left = openLeft.current; else openLeft.current = left;
    left = Math.max(EDGE, Math.min(left, vw - EDGE - w));
    const top = side === 'top' ? rt - gap - hh : r.bottom + gap;
    setPos({ top: Math.round(top), left: Math.round(left), maxH: Math.round(maxH), minH: Math.round(hh), side, ox: Math.round(Math.min(Math.max(r.left + r.width / 2 - left, 12), w - 12)), w: ov && ov.width ? Math.round(w) : undefined });
  };
  useLayoutEffect(() => { if (!open) { setPos(null); openLeft.current = null; openSide.current = null; tallest.current = 0; return; } place(); }, [open]);
  useEffect(() => {
    if (!open) return; let raf = 0; const re = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
    const resized = () => { openSide.current = null; tallest.current = 0; re(); }; /* a new window size: measure afresh */
    addEventListener('resize', resized); addEventListener('scroll', re, true); const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(re) : null; if (box.current) ro?.observe(box.current); if (avoid?.current) ro?.observe(avoid.current); if (watch?.current) ro?.observe(watch.current); /* the dock grows (notes, quote) → re-place */
    const down = (e: PointerEvent) => { const t = e.target as Node; if (box.current?.contains(t) || anchor.current?.contains(t) || keepOpen?.current?.contains(t)) return; /* a nested popover (portal) counts as inside */ if ((t as Element).closest?.('.apop,[data-apop-keep]')) return; onClose(); };
    document.addEventListener('pointerdown', down, true);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resized); removeEventListener('scroll', re, true); ro?.disconnect(); document.removeEventListener('pointerdown', down, true); };
  }, [open, onClose]);
  useEffect(() => { if (open && phone) return lockPageScroll(); }, [open, phone]);
  useEffect(() => { if (!open || !focusFirst) return; const id = requestAnimationFrame(() => { const el = box.current; if (!el || el.contains(document.activeElement)) return; /* phones: no keyboard pop-up, so a search field isn't focused there */ const f = (window.innerWidth >= PHONE ? el.querySelector<HTMLElement>('[autofocus],input[type=search]') : null) ?? el.querySelector<HTMLElement>('[aria-selected=true],[aria-checked=true]') ?? el.querySelector<HTMLElement>(ITEMS) ?? el.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),select,[tabindex]'); f?.focus({ preventScroll: true }); }); return () => cancelAnimationFrame(id); }, [open]);
  const keys = (e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return; const t = e.target as HTMLElement; if (t.matches('input:not([type=search]):not([type=checkbox]),textarea,select')) return;
    const os = [...(box.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])].filter(x => x.offsetParent !== null); if (!os.length) return; const i = os.indexOf(document.activeElement as HTMLElement);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? os.length - 1 : e.key === 'ArrowDown' ? (i < 0 ? 0 : i + 1) : (i < 0 ? os.length - 1 : i - 1); e.preventDefault(); os[(n + os.length) % os.length].focus();
  };
  if (!open || typeof document === 'undefined') return null;
  const style: React.CSSProperties = phone ? { minHeight: pos?.minH } : { top: pos?.top ?? -9999, left: pos?.left ?? -9999, maxHeight: pos?.maxH, minHeight: pos?.minH, width: pos?.w ?? width, ['--apop-max' as any]: pos ? `${pos.maxH}px` : undefined, ['--apop-ox' as any]: `${pos?.ox ?? 24}px` };
  return createPortal(<>{phone && <div className="apop-scrim" aria-hidden />}<div ref={box} className={`apop${phone || closeButton ? ' apop-titled' : ''} ${phone ? 'apop-sheet' : `apop-at-${pos?.side ?? placement}`} ${pos ? 'apop-in' : 'apop-measure'} ${className}`} role={role} aria-label={label} aria-modal={phone && role === 'dialog' ? true : undefined} data-testid={testId} style={style} onKeyDown={keys}>
    {(phone || closeButton) && <div className="apop-top"><span className="apop-title">{label}</span><button type="button" className="apop-x" aria-label="Close" onClick={onClose}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button></div>}
    <div className="apop-body">{children}</div>
  </div></>, document.body);
}
