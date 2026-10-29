import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { StandInArt } from './StandInArt';
export type MoodItem = { id: string; label: string; posterUrl?: string | null; previewWebm?: string | null; group?: string };
/** Shared preset picker (OpenSoul looks + Photo FX). Layout follows the reference measurements; copy and media are ours. */
export default function MoodPicker({ title, sub, items, value, onPick, onClose, onBuild, testPrefix, fan, toolId }: { title: string; sub: string; items: MoodItem[]; value?: string | string[]; onPick: (id: string) => void; onClose: () => void; onBuild?: () => void; testPrefix: string; fan?: string[]; /** a tool's presets: items without art get the branded stand-in tile */ toolId?: string }) {
  const [tab, setTab] = useState<'curated' | 'mine'>('curated'); const [q, setQ] = useState('');
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  const on = (id: string) => Array.isArray(value) ? value.includes(id) : value === id;
  const shown = items.filter(i => i.label.toLowerCase().includes(q.trim().toLowerCase()));
  return createPortal(<div className="mp2-scrim" onClick={onClose}><div className="mp2" role="dialog" aria-label={title} data-testid="mood-picker" onClick={e => e.stopPropagation()}>
    <button type="button" className="mp2-x" aria-label="Close" onClick={onClose}>✕</button>
    <header className="mp2-h"><div><h2>{title}</h2><p>{sub}</p>{onBuild && <button type="button" className="mp2-build" data-testid="mood-build" onClick={onBuild}>Make your own look</button>}</div>
      {fan && fan.length > 0 && <div className="mp2-fan" aria-hidden>{fan.slice(0, 4).map((s, i) => <img key={i} src={s} alt="" />)}</div>}</header>
    <div className="mp2-bar"><div className="mp2-tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === 'curated'} className={tab === 'curated' ? 'on' : ''} onClick={() => setTab('curated')}>Curated</button><button type="button" role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')} data-testid="mood-tab-mine">My looks</button></div>
      <input className="mp2-q" type="search" placeholder="Find a look…" value={q} onChange={e => setQ(e.target.value)} data-testid="mood-search" /></div>
    <div className="mp2-grid" role="listbox">{tab === 'mine' ? <p className="helper mp2-empty">Looks you save will show here.</p> : shown.map(i => <button key={i.id} type="button" role="option" aria-selected={on(i.id)} aria-pressed={on(i.id)} className={`mp2-item ${on(i.id) ? 'on' : ''}`} data-testid={`${testPrefix}${i.id}`} onClick={() => onPick(i.id)}>
      <span className="mp2-img">{i.posterUrl ? <img src={i.posterUrl} alt="" loading="lazy" /> : toolId ? <StandInArt id={i.id} toolId={toolId} group={i.group} /> : <span className="mp2-blank">{i.label}</span>}{i.previewWebm && <video src={i.previewWebm} muted loop playsInline preload="none" onMouseEnter={e => e.currentTarget.play().catch(() => 0)} onMouseLeave={e => e.currentTarget.pause()} />}</span><b>{i.label}</b></button>)}</div>
  </div></div>, document.body);
}
