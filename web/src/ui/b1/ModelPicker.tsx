import { createPortal } from 'react-dom';
import { FitTag } from '../../shared/FitNote';
import type { Fit } from '../../shared/fit';
import { useRef, useState } from 'react';
import { useDismiss } from '../../shared/useDismiss';
export interface ModelCard { id: string; name: string; family: string; blurb: string; poster?: string; badge?: 'new' | 'premium'; tag?: string; flags?: string[]; soon?: string; /** B27: runnable:false: greyed, with the server's reason */ dim?: boolean; note?: string | null; /** Batch 28: the local route's fit on this computer */ fit?: Fit | null }
/** #8 Full-width model picker overlay: family tabs + search + cards. Deep-link: caller syncs `value` with ?model=. */
export default function ModelPicker({ open, models, value, onPick, onClose }: { open: boolean; models: ModelCard[]; value?: string; onPick: (id: string) => void; onClose: () => void }) {
  const fams = ['All', ...new Set(models.map(m => m.family))]; const [fam, setFam] = useState('All'); const [q, setQ] = useState('');
  /* Esc closes and focus goes back to the button that opened it (noted before the search box takes focus) */
  const opener = useRef<HTMLElement | null>(null); const wasOpen = useRef(false); if (open && !wasOpen.current) opener.current = document.activeElement as HTMLElement | null; wasOpen.current = open;
  useDismiss(open, onClose, opener);
  if (!open) return null;
  const xs = models.filter(m => (fam === 'All' || m.family === fam) && (m.name + m.blurb).toLowerCase().includes(q.toLowerCase()));
  return createPortal(
    <div className="mdl" role="dialog" aria-modal="true" aria-label="Choose a model">
      <header className="mdl-head">
        <div className="mdl-tabs">{fams.map(f => <button key={f} className={f === fam ? 'on' : ''} onClick={() => setFam(f)}>{f}</button>)}</div>
        <input className="mdl-q" type="search" placeholder="Search models" value={q} onChange={e => setQ(e.target.value)} autoFocus />
        <button className="mp-x" aria-label="Close" onClick={onClose}>✕</button>
      </header>
      <div className="mdl-grid">{xs.map(m => <div key={m.id} data-testid={`engine-${m.id.replace(/^comfy-/, '')}`} role="button" tabIndex={0} aria-pressed={m.id === value} aria-disabled={m.soon ? true : undefined} title={m.soon ? (m.dim ? m.soon : `Coming soon: ${m.soon}`) : m.note ?? undefined} className={`mdl-card ${m.id === value ? 'on' : ''} ${m.soon ? 'soon' : ''} ${m.dim ? 'dim' : ''}`} data-model={m.id} onClick={() => !m.soon && onPick(m.id)} onKeyDown={e => !m.soon && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(m.id))}>
        <div className="mdl-art" style={m.poster ? { backgroundImage: `url(${m.poster})` } : undefined}>{m.badge && <span className={`mdl-badge ${m.badge}`}>{m.badge === 'new' ? 'New' : 'Premium'}</span>}{m.soon && !m.dim ? <span className="mdl-tag mdl-soon" data-testid={`soon-${m.id}`}>Coming soon</span> : m.tag && <span className="mdl-tag">{m.tag}</span>}</div>
        <div className="mdl-body"><b>{m.name}{(m.flags ?? []).map(f => <span key={f} className={`mdl-flag ${f === 'Experimental' ? 'exp' : 'loc'}`}>{f}</span>)}</b><small>{m.blurb}</small>{m.note && <small className="mdl-note" data-testid="model-note">{m.note}</small>}<FitTag fit={m.fit} className="mdl-fit" /></div>
      </div>)}{!xs.length && <p className="mp-empty">No models match “{q}”.</p>}</div>
    </div>, document.body
  );
}
