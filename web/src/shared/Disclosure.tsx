/**
 * Disclosure (2026-10-31): a "More options" row that opens its content in place, below itself, so nothing above it moves. A full-width button
 * with a chevron, aria-expanded / aria-controls, and the content in a region labelled by the button. `storageKey` remembers open or closed for
 * this browser session (sessionStorage; a private window just starts closed). Opening scrolls the content into view inside its scroll box.
 * Shared: Relight's light panel uses it first; any panel with extra settings can.
 */
import { useId, useRef, useState, type ReactNode } from 'react';
import './disclosure.css';

const read = (k?: string) => { if (!k) return false; try { return sessionStorage.getItem(k) === '1'; } catch { return false; } };
const write = (k: string | undefined, v: boolean) => { if (!k) return; try { sessionStorage.setItem(k, v ? '1' : '0'); } catch { /* private window */ } };
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Disclosure({ label, hint, storageKey, defaultOpen = false, testId, className = '', children }: {
  label: string; /** a short line of what is inside, shown while closed */ hint?: string; storageKey?: string; defaultOpen?: boolean; testId?: string; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(() => (storageKey ? read(storageKey) : defaultOpen)); const id = useId(); const body = useRef<HTMLDivElement>(null);
  const toggle = () => { const v = !open; setOpen(v); write(storageKey, v);
    if (v) requestAnimationFrame(() => body.current?.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' })); };
  return <div className={`dc${open ? ' open' : ''} ${className}`.trim()} data-testid={testId}>
    <button type="button" className="dc-btn" aria-expanded={open} aria-controls={`${id}-b`} id={`${id}-h`} data-testid={testId ? `${testId}-toggle` : undefined} onClick={toggle}>
      <span className="dc-l">{label}</span>{hint && !open && <span className="dc-hint">{hint}</span>}
      <svg className="dc-chev" width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open && <div ref={body} className="dc-body" id={`${id}-b`} role="region" aria-labelledby={`${id}-h`} data-testid={testId ? `${testId}-body` : undefined}>{children}</div>}
  </div>;
}
