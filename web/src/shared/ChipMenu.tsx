import { useEffect, useRef, useState } from 'react';
import { useDismiss } from './useDismiss';
export interface ChipOpt { value: string; label: string; hint?: string; /** B27: runnable:false model, greyed (still pickable when the server runs it as a demo) */ dim?: boolean }
/** Compact chip that opens a listbox (settings rows: resolution, duration, aspect, model). Esc closes and focus goes back to the chip; arrows move between options. */
export default function ChipMenu({ label, value, options, onChange, testId, invalid, describedBy, className = '', icon }: {
  label: string; value: string; options: ChipOpt[]; onChange: (v: string) => void; testId?: string; invalid?: boolean; describedBy?: string; className?: string; icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false); const btn = useRef<HTMLButtonElement>(null); const wrap = useRef<HTMLDivElement>(null); const list = useRef<HTMLDivElement>(null);
  const cur = options.find(o => o.value === value) ?? options[0];
  useDismiss(open, () => setOpen(false), btn);
  useEffect(() => { if (!open) return; const f = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, [open]);
  useEffect(() => { if (open) requestAnimationFrame(() => (list.current?.querySelector<HTMLElement>('[aria-selected=true]') ?? list.current?.querySelector<HTMLElement>('[role=option]'))?.focus()); }, [open]);
  const move = (e: React.KeyboardEvent) => { const os = [...(list.current?.querySelectorAll<HTMLElement>('[role=option]') ?? [])]; const i = os.indexOf(document.activeElement as HTMLElement);
    const n = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? os.length - 1 : null;
    if (n != null) { e.preventDefault(); os[(n + os.length) % os.length]?.focus(); } else if (e.key === 'Tab') setOpen(false); };
  if (!options.length) return null;
  return <div className={`chipm ${className}`} ref={wrap}>
    <button ref={btn} type="button" className="dir2-chip chipm-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${cur?.label ?? ''}`} aria-invalid={invalid || undefined} aria-describedby={describedBy} data-testid={testId} data-value={cur?.value}
      onClick={() => setOpen(o => !o)} onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); } }}>{icon}<span className="chipm-v">{cur?.label}</span><i className="chipm-caret" aria-hidden>▾</i></button>
    {open && <div className="chipm-menu" role="listbox" aria-label={label} ref={list} onKeyDown={move} data-testid={testId ? `${testId}-menu` : undefined}>
      {options.map(o => { const on = o.value === cur?.value; return <button key={o.value} type="button" role="option" aria-selected={on} tabIndex={on ? 0 : -1} className={`${on ? 'on' : ''}${o.dim ? ' dim' : ''}`} data-testid={testId ? `${testId}-opt-${o.value}` : undefined} onClick={() => { onChange(o.value); setOpen(false); btn.current?.focus(); }}>
        <span className="chipm-l">{o.label}{o.hint && <small>{o.hint}</small>}</span>{on && <span aria-hidden className="chipm-tick">✓</span>}</button>; })}
    </div>}
  </div>;
}
