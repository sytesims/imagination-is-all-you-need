/**
 * The workflow picker of the Video and Audio bars (Create Image's picker look: ui/next/workflowBar.css + ui/video/videoWorkflows.css): search,
 * category tabs, one row per workflow (icon, name, one line, what it needs) with an ⓘ that opens How it works inline. ↑↓ Enter, Esc closes.
 * The page gives its own list, categories, icons and How it works; testids are `<prefix>-picker`, `<prefix>-row-<id>`… (vwf for Video, awf for Audio).
 * Roadmap rows (`soon`, 3D): the working workflows come first, by category; the coming-soon ones sit in one collapsed "Coming soon" group at
 * the end (2026-10-27). A search that matches one opens the group; ↑↓ skip it while it is closed.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Popover } from './Popover';
import { Link, useSearch } from '../platform/router';
import { tip } from './Tooltip';
import { InfoIcon, SearchIcon, ChevronRightIcon } from '../ui/Icons';
import '../ui/next/workflowBar.css';
import '../ui/video/videoWorkflows.css';

export type PickerItem = { id: string; name: string; tagline: string; category: string; needs: string };

/** ?picker=1 opens a page's workflow picker (the header menus' "See all" on Image, Video, Audio and 3D). The same param on every page. */
export const PICKER_PARAM = 'picker';
export const pickerHref = (page: string) => `${page}${page.includes('?') ? '&' : '?'}${PICKER_PARAM}=1`;
export const wantsPicker = (search = typeof location === 'undefined' ? '' : location.search) => new URLSearchParams(search).get(PICKER_PARAM) === '1';
/** Opens the picker when the URL gains ?picker=1 while the page is already mounted (a header link to the page you're on). */
export function usePickerParam(setOpen: (open: boolean) => void) {
  const search = useSearch(); useEffect(() => { if (wantsPicker(search)) setOpen(true); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
}
/** Drops ?picker=1 once the picker closes, so Back and a reload don't reopen it (replaceState, no navigation). */
export function clearPickerParam() {
  if (typeof location === 'undefined' || !wantsPicker()) return; const u = new URL(location.href); u.searchParams.delete(PICKER_PARAM); history.replaceState(history.state, '', `${u.pathname}${u.search}${u.hash}`);
}

export function WorkflowPicker<T extends PickerItem>({ open, anchor, watch, list, current, categories, onChoose, onClose, placement = 'top', label, prefix, noun, icon, how, foot, initialTab = 'all', className = '', soon, badge }: {
  open: boolean; anchor: RefObject<HTMLElement>; watch?: RefObject<HTMLElement>; list: T[]; current: string; categories: { id: string; label: string }[];
  onChoose: (w: T) => void; onClose: () => void; placement?: 'top' | 'bottom'; /** "Video workflows" */ label: string; /** testid prefix: "vwf", "awf" */ prefix: string; /** "video" → "Search video workflows" */ noun: string;
  icon: (w: T) => ReactNode; how: (w: T) => ReactNode; /** the footer's left line */ foot: ReactNode; /** the tab to open on */ initialTab?: string; className?: string;
  /** a roadmap row (3D: Text to 3D, Rig): listed, greyed, says Coming soon, can't be picked */ soon?: (w: T) => boolean; /** a small mark after the name (a plugin's Plugin badge) */ badge?: (w: T) => ReactNode }) {
  const [q, setQ] = useState(''); const [tab, setTab] = useState('all'); const [hi, setHi] = useState(0); const [howId, setHow] = useState(''); const listRef = useRef<HTMLDivElement>(null); const qRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!open) { setQ(''); setHow(''); setHi(0); return; } setTab(categories.some(c => c.id === initialTab) ? initialTab : 'all'); const t = setTimeout(() => qRef.current?.focus(), 60); return () => clearTimeout(t); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const ql = q.trim().toLowerCase();
  const found = useMemo(() => list.filter(w => (tab === 'all' || w.category === tab) && (!ql || `${w.name} ${w.tagline} ${w.category} ${w.needs}`.toLowerCase().includes(ql))), [list, tab, ql]);
  const catAt = (w: T) => { const i = categories.findIndex(c => c.id === w.category); return i < 0 ? categories.length : i; };
  const later = soon ? found.filter(w => soon(w)) : []; const ready = (soon ? found.filter(w => !soon(w)) : found).slice().sort((a, b) => catAt(a) - catAt(b)); /* screen order, so ↑↓ follow the sections */
  const [soonOpen, setSoonOpen] = useState(false); /* opens on the group when the page is on a coming-soon workflow (a link to one) */
  useEffect(() => { setSoonOpen(open && !!soon && list.some(w => w.id === current && soon(w))); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const showSoon = soonOpen || (!!ql && later.length > 0) || (!ready.length && later.length > 0); /* a search for one, or nothing else to show: open */
  const rows = showSoon ? [...ready, ...later] : ready; /* what ↑↓ walk through, in screen order */
  useEffect(() => { setHi(0); }, [tab, ql]);
  const choose = (w: T) => { if (soon?.(w)) return; onClose(); if (w.id !== current) onChoose(w); };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!rows.length) return; setHi(h => (h + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length); }
    else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); const r = rows[hi]; if (r) choose(r); }
  };
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-wf-pick-row="${CSS.escape(rows[hi]?.id ?? '-')}"]`)?.scrollIntoView({ block: 'nearest' }); }, [hi, rows.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const row = (w: T) => { const on = w.id === current; const lit = rows[hi]?.id === w.id; const off = !!soon?.(w);
    return <div key={w.id} className="vwf-rowwrap">
      <div className="vwf-rowline">
        <button type="button" role="option" aria-selected={on} data-wf-pick-row={w.id} {...{ [`data-${prefix}-row`]: w.id }} data-testid={`${prefix}-row-${w.id}`} className={`wf-row${on ? ' on' : ''}${lit ? ' hi' : ''}${off ? ' wf-soon' : ''}`} aria-disabled={off || undefined} {...(off ? tip(`${w.name} is coming soon`) : {})} onMouseEnter={() => setHi(rows.indexOf(w))} onClick={() => choose(w)}>
          <span className="wf-ic" aria-hidden>{icon(w)}</span><span className="wf-t"><b>{w.name}{badge?.(w)}</b><small>{w.tagline}</small></span><span className="wf-needs">{off ? 'Coming soon' : w.needs}</span></button>
        <button type="button" className={`vwf-row-info${howId === w.id ? ' on' : ''}`} aria-label={`How ${w.name} works`} aria-expanded={howId === w.id} data-testid={`${prefix}-row-info-${w.id}`} {...tip('How it works')} onClick={() => setHow(h => h === w.id ? '' : w.id)}><InfoIcon size={14} /></button>
      </div>
      {howId === w.id && how(w)}
    </div>; };
  return <Popover open={open} anchor={anchor} avoid={watch} gap={8} onClose={onClose} placement={placement} label={label} role="listbox" className={`wf-pop vwf-pop ${className}`} testId={`${prefix}-picker`} focusFirst={false}>
    <div className="wf-pick" onKeyDown={key}>
      <label className="wf-q"><SearchIcon size={14} /><input ref={qRef} type="search" placeholder={`Search ${noun} workflows`} aria-label={`Search ${noun} workflows`} value={q} onChange={e => setQ(e.target.value)} data-testid={`${prefix}-search`} /><small className="wf-keys" aria-hidden>↑↓ to move · Enter to pick</small></label>
      <div className="wf-tabs" role="tablist" aria-label="Workflow type">{categories.filter(c => c.id === 'all' || list.some(w => w.category === c.id)).map(c => <button key={c.id} type="button" role="tab" aria-selected={tab === c.id} className={tab === c.id ? 'on' : ''} data-testid={`${prefix}-tab-${c.id}`} onClick={() => setTab(c.id)}>{c.label}</button>)}</div>
      <div className="wf-list" ref={listRef}>
        {categories.filter(c => c.id !== 'all').map(c => { const rs = ready.filter(r => r.category === c.id); if (!rs.length) return null;
          return <div key={c.id} className="wf-sec" role="group" aria-label={c.label}><span className="wf-h">{c.label}</span>{rs.map(row)}</div>; })}
        {later.length > 0 && <div className="wf-sec wf-sec-soon" role="group" aria-label="Coming soon" data-testid={`${prefix}-soon`}>
          <button type="button" className="wf-h wf-soon-h" aria-expanded={showSoon} data-testid={`${prefix}-soon-toggle`} onClick={() => setSoonOpen(!showSoon)}>
            <ChevronRightIcon size={12} />Coming soon<small>{later.length}</small></button>
          {showSoon && later.map(row)}</div>}
        {!found.length && <p className="helper wf-empty">No workflows match “{q}”.</p>}
      </div>
      <div className="wf-foot"><span>{foot}</span><Link to="/workflows" className="wf-all" onClick={onClose} data-testid={`${prefix}-browse-all`}>Browse all workflows <ChevronRightIcon size={12} /></Link></div>
    </div>
  </Popover>;
}
