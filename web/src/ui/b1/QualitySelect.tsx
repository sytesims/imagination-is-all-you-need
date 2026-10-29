import { useEffect, useRef, useState } from 'react';
import { useDismiss } from '../../shared/useDismiss';
import { useOwnAccounts, optionPrice } from '../../shared/billing';
export interface QualityOpt { value: string; label: string; desc: string; price?: number }
/** #7 Quality dropdown with a one-line description (and optional price) per option. `price` is ✦ credits (USD × 100); it reads in the
 *  Generate button's words (billing.ts optionPrice, on the place `quote` runs on). */
export default function QualitySelect({ value, options, onChange, compact, quote }: { value: string; options: QualityOpt[]; onChange: (v: string) => void; compact?: boolean; quote?: any }) {
  const own = useOwnAccounts(quote);
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null); const cur = options.find(o => o.value === value) ?? options[0]; useDismiss(open, () => setOpen(false));
  useEffect(() => { const f = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false); document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, []);
  return (
    <div className={`qsel ${compact ? 'compact' : ''}`} ref={ref}>
      <button className="qsel-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>{!compact && <span className="qsel-k">Quality</span>}<b>{cur?.label}</b><span className="qsel-caret">▾</span></button>
      {open && <ul className="qsel-menu" role="listbox">{options.map(o => <li key={o.value} role="option" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => { onChange(o.value); setOpen(false); }}>
        <div><b>{o.label}</b><small>{o.desc}</small></div>{(() => { const t = o.price != null ? optionPrice(quote, own, o.price) : null; return t && <span className="cost cost-soft">{t}</span>; })()}</li>)}</ul>}
    </div>
  );
}
