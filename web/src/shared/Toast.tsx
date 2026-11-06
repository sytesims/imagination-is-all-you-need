import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { errorMeta } from './errorMeta';
import { Link } from '../platform/router';
import { addToast, lifeOf, splitMessage, titleWithCount, toastBottom, toastKind, visibleToasts, type ToastAction, type ToastItem, type ToastKind } from './toastLogic';

/** The one toast system for the whole app (B2: PB-07, S-11; redesigned 2026-10-25).
 *  Slim glass pills stacked bottom-centre, just above the composer / Generate dock, a phone's tab bar or the viewer's
 *  filmstrip (measured, never covered). Each pill: a small kind icon, a bold title (with "×3" when the same message
 *  repeats), an optional grey line, an optional action, a close button and a thin countdown line.
 *  Kinds: success (orange), info (neutral), warn (amber), error (red). A message like "Link copied. Only you can open it…"
 *  splits into title + grey line at its first sentence; an info message that says something got done shows as success.
 *  Hover or focus pauses every timer; swipe sideways or press Escape to dismiss; at most 3 show, the rest wait behind "+N". */
type Kind = ToastKind;
export type ToastOpts = { /** grey line under the title (else taken from the message's second sentence) */ sub?: string; /** a link on the card, e.g. View queue */ action?: ToastAction; /** how long it stays, ms */ ms?: number };
type Show = (msg: string, kind?: Kind, opts?: ToastOpts) => void;
const Ctx = createContext<Show>(() => undefined);
export const useToast = () => useContext(Ctx);

const OUT_MS = 200;
/** Bars at the bottom of the window the stack sits above (the dock, phone tabs, the viewer's filmstrip). Mark anything else with data-toast-avoid. */
const AVOID = '.ic-dock, .dock, .mr-dock, .m-tabs, .gen-row, .vs-gen-wrap, .ic-route-err, .mr-strip, [data-toast-avoid]';
const COL_W = 420;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]); const seq = useRef(0);
  const [expanded, setExpanded] = useState(false); const [paused, setPaused] = useState(false);
  const timers = useRef(new Map<number, { t?: ReturnType<typeof setTimeout>; left: number; at: number }>());
  const pausedRef = useRef(false);
  const close = useCallback((id: number) => {
    const tm = timers.current.get(id); clearTimeout(tm?.t); timers.current.delete(id);
    setItems(xs => xs.map(x => x.id === id ? { ...x, out: true } : x));
    setTimeout(() => setItems(xs => xs.filter(x => x.id !== id)), OUT_MS);
  }, []);
  /** (Re)start a card's timer with `ms` left; while the stack is paused it only remembers the time left. */
  const arm = useCallback((id: number, ms: number) => {
    const old = timers.current.get(id); clearTimeout(old?.t);
    timers.current.set(id, { left: ms, at: Date.now(), t: pausedRef.current ? undefined : setTimeout(() => close(id), ms) });
  }, [close]);
  const pause = useCallback((on: boolean) => {
    if (pausedRef.current === on) return; pausedRef.current = on; setPaused(on);
    timers.current.forEach((tm, id) => {
      if (on) { clearTimeout(tm.t); tm.left = Math.max(0, tm.left - (Date.now() - tm.at)); tm.t = undefined; }
      else { tm.at = Date.now(); tm.t = setTimeout(() => close(id), Math.max(1200, tm.left)); }
    });
  }, [close]);
  const show = useCallback<Show>((msg, kind = 'info', opts = {}) => {
    const m = kind === 'error' ? errorMeta(msg) : undefined; if (m?.inline) return; /* B15: shown in place (route not runnable); a toast would repeat it */
    const k0: Kind = m?.calm ? 'info' : kind; // a calm notice (nothing failed) is not a red error
    const s = opts.sub ? { title: msg, sub: opts.sub } : splitMessage(msg);
    const base = { ...s, kind: toastKind(s.title, k0), detail: m?.detail, action: opts.action };
    const ms = opts.ms ?? lifeOf(base);
    setItems(xs => {
      const r = addToast(xs, { ...base, ms }, seq.current + 1); if (!r.merged) seq.current = r.id;
      r.dropped.forEach(id => { clearTimeout(timers.current.get(id)?.t); timers.current.delete(id); });
      arm(r.id, ms); return r.items;
    });
  }, [arm]);
  useEffect(() => () => { timers.current.forEach(tm => clearTimeout(tm.t)); }, []);

  const live = items.filter(x => !x.out);
  useEffect(() => { if (live.length <= 3 && expanded) setExpanded(false); if (!live.length && pausedRef.current) pause(false); }, [live.length, expanded, pause]);

  /* Sit above the dock / tab bar / filmstrip: measure them while toasts are up. */
  const region = useRef<HTMLDivElement>(null); const [bottom, setBottom] = useState<number | null>(null);
  const measure = useCallback(() => {
    if (typeof window === 'undefined') return;
    const w = window.innerWidth, h = window.innerHeight; const phone = w <= 640; const colW = phone ? w - 24 : Math.min(COL_W, w - 32);
    const boxes = Array.from(document.querySelectorAll<HTMLElement>(AVOID)).filter(el => !region.current?.contains(el) && getComputedStyle(el).visibility !== 'hidden').map(el => el.getBoundingClientRect());
    setBottom(toastBottom(boxes, { w, h }, colW, phone ? 12 : 24));
  }, []);
  useLayoutEffect(() => { if (!items.length) return; measure(); const iv = setInterval(measure, 500); addEventListener('resize', measure);
    return () => { clearInterval(iv); removeEventListener('resize', measure); }; }, [items.length > 0, measure]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Escape: inside the stack it closes the focused card; elsewhere it closes the newest card unless a dialog or menu is open (they own Escape). */
  useEffect(() => {
    if (!live.length) return;
    const key = (e: KeyboardEvent) => { if (e.key !== 'Escape' || e.defaultPrevented) return;
      const inside = region.current?.contains(document.activeElement);
      if (inside) { const card = (document.activeElement as HTMLElement).closest<HTMLElement>('[data-toast-id]'); const id = Number(card?.dataset.toastId ?? live[live.length - 1].id); e.stopPropagation(); close(id); return; }
      const a = document.activeElement; if (a && a !== document.body) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"], .dlg-scrim, .apop, .vw, .rv-modal')) return;
      close(live[live.length - 1].id); };
    addEventListener('keydown', key, true); return () => removeEventListener('keydown', key, true);
  }, [live, close]);

  const { shown, hidden } = visibleToasts(items, expanded);
  return <Ctx.Provider value={show}>{children}{typeof document !== 'undefined' && createPortal(
    <div ref={region} className={`toasts${paused ? ' toasts-paused' : ''}${expanded ? ' toasts-open' : ''}`} role="region" aria-label="Notifications" aria-live="polite" data-testid="toasts"
      style={bottom != null ? { ['--toast-bottom' as string]: `${bottom}px` } : undefined}
      onMouseEnter={() => pause(true)} onMouseLeave={() => { if (!region.current?.contains(document.activeElement)) pause(false); }}
      onFocus={() => pause(true)} onBlur={e => { if (!region.current?.contains(e.relatedTarget as Node)) pause(false); }}>
      {hidden > 0 && <button type="button" className="toast-more" data-testid="toast-more" onClick={() => setExpanded(true)} aria-label={`Show ${hidden} more notification${hidden === 1 ? '' : 's'}`}>+{hidden} more</button>}
      {expanded && live.length > 3 && <button type="button" className="toast-more" onClick={() => setExpanded(false)}>Show fewer</button>}
      {shown.map(t => <ToastCard key={t.id} t={t} close={close} />)}
    </div>, document.body)}</Ctx.Provider>;
}

function ToastCard({ t, close }: { t: ToastItem; close: (id: number) => void }) {
  const drag = useRef<{ x: number; id: number } | null>(null); const [dx, setDx] = useState(0);
  const end = (e: React.PointerEvent) => { if (!drag.current) return; const d = e.clientX - drag.current.x; drag.current = null;
    if (Math.abs(d) > 72) close(t.id); else setDx(0); };
  return <div role={t.kind === 'error' ? 'alert' : 'status'} data-toast-id={t.id} data-testid="toast" data-kind={t.kind} data-count={t.count}
    className={`toast toast-${t.kind}${t.detail ? ' toast-has-tech' : ''}${t.out ? ' toast-out' : ''}${dx ? ' toast-drag' : ''}`}
    style={dx ? { transform: `translateX(${dx}px)`, opacity: Math.max(0.2, 1 - Math.abs(dx) / 160) } : undefined}
    onPointerDown={e => { if (e.pointerType === 'mouse' && e.button !== 0) return; if ((e.target as HTMLElement).closest('button, a, summary, code')) return; drag.current = { x: e.clientX, id: e.pointerId }; }}
    onPointerMove={e => { if (drag.current) setDx(e.clientX - drag.current.x); }} onPointerUp={end} onPointerCancel={() => { drag.current = null; setDx(0); }}>
    <span className="toast-ic" aria-hidden><KindIcon kind={t.kind} /></span>
    <div className="toast-body">
      <div className="toast-line"><b className="toast-title">{t.title}</b>{t.count > 1 && <span className="toast-count" data-testid="toast-count" aria-label={`${t.count} times`}>×{t.count}</span>}</div>
      {t.sub && <span className="toast-sub">{t.sub}</span>}
      {t.detail && <details className="tech-details toast-tech" data-testid="toast-tech"><summary>Details</summary><code>{t.detail}</code></details>}
    </div>
    {t.action && (t.action.to ? <Link to={t.action.to} className="toast-act" onClick={() => close(t.id)}>{t.action.label}</Link>
      : <button type="button" className="toast-act toast-act-b" data-testid="toast-action" onClick={() => { t.action?.onClick?.(); close(t.id); }}>{t.action.label}</button>)}
    <button type="button" className="toast-x" aria-label={`Dismiss: ${titleWithCount(t)}`} data-testid="toast-close" onClick={() => close(t.id)}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg></button>
    {!t.out && <i key={`${t.count}-${t.ms}`} className="toast-bar" style={{ animationDuration: `${t.ms}ms` }} aria-hidden />}
  </div>;
}

/** The four kind icons, shared with the inline Notice. */
export function KindIcon({ kind, size = 14 }: { kind: Kind; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (kind === 'success') return <svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
  if (kind === 'info') return <svg {...p}><path d="M12 11v6" /><path d="M12 7.2v.1" /></svg>;
  /* warn: a small triangle; error: a bold "!" (never an ×, which reads as the close button next to it) */
  if (kind === 'warn') return <svg {...p} strokeWidth={2.1}><path d="M12 4.2 3.2 19.3h17.6z" /><path d="M12 10.2v3.6" /><path d="M12 16.6v.1" /></svg>;
  return <svg {...p} strokeWidth={2.8}><path d="M12 6.5v7" /><path d="M12 17.6v.1" /></svg>;
}

/** Inline copy feedback (PB-14): the control itself says "Copied" for a moment. `flash(key)` lets one hook serve several buttons. */
export function useCopied(ms = 1600): [string, (key?: string) => void] {
  const [on, setOn] = useState(''); const t = useRef<ReturnType<typeof setTimeout>>();
  const flash = useCallback((key = '1') => { clearTimeout(t.current); setOn(key); t.current = setTimeout(() => setOn(''), ms); }, [ms]);
  useEffect(() => () => clearTimeout(t.current), []);
  return [on, flash];
}
/** The "✓ Copied" label shown in place of a copy control's text. */
export const Copied = ({ text = 'Copied' }: { text?: string }) => <span className="copied-mark" role="status"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>{text}</span>;
