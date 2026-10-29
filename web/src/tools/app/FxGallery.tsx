/* B21 T6: Photo FX effects gallery for the canvas Library. Data: tool.presets (group, posterUrl, previewWebm). */
import { useEffect, useState } from 'react';
import type { ToolInfo } from '../../api';
import { LIB_EXTRA } from '../../ui/Workspace';
import { StandInArt, hasArt } from '../../shared/StandInArt';

const ORDER = ['Physics', 'Elements', 'Scale', 'Camera'];
let lastPicked: string[] = [];
export function announcePicked(ids: string[]) { lastPicked = ids; dispatchEvent(new CustomEvent('oj:types-picked', { detail: ids })); }
const calm = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const hoverable = () => typeof matchMedia !== 'undefined' && matchMedia('(hover: hover)').matches;

export default function FxGallery({ tool }: { tool: ToolInfo }) {
  const fx = (tool.presets ?? []) as any[];
  const groups = [...ORDER.filter(g => fx.some(p => p.group === g)), ...[...new Set(fx.map(p => p.group).filter(Boolean))].filter(g => !ORDER.includes(g))];
  const [g, setG] = useState('All'); const [picked, setPicked] = useState<string[]>(lastPicked);
  useEffect(() => { const f = (e: Event) => setPicked((e as CustomEvent<string[]>).detail); addEventListener('oj:types-picked', f); return () => removeEventListener('oj:types-picked', f); }, []);
  if (!fx.length) return null;
  const shown = fx.filter(p => g === 'All' || p.group === g);
  return <section className="fxg" data-testid="fx-gallery" aria-label="Effects">
    <div className="fxg-head"><h3>Effects <span className="helper">{fx.length}</span></h3>
      <div className="pills fxg-pills" role="tablist">{['All', ...groups].map(x => <button key={x} type="button" role="tab" aria-selected={g === x} className={`pill ${g === x ? 'on' : ''}`} data-testid={`fxg-pill-${x}`} onClick={() => setG(x)}>{x}</button>)}</div></div>
    <div className="fxg-grid">{shown.map(p => { const on = picked.includes(p.id); return <div key={p.id} className={`fxg-card ${on ? 'on' : ''}`} data-testid={`fxg-${p.id}`}>
      <span className="fxg-media">{!hasArt(p) && <StandInArt id={p.id} toolId={tool.id} group={p.group} />}{p.posterUrl && <img src={p.posterUrl} alt="" loading="lazy" />}{p.previewWebm && <video src={p.previewWebm} muted loop playsInline preload="none" aria-hidden
        onMouseEnter={e => { if (!calm() && hoverable()) e.currentTarget.play().catch(() => 0); }} onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }} />}</span>
      <span className="fxg-foot"><span><b>{p.label}</b><span className="helper">{p.group}</span></span>
        <button type="button" className={`btn ${on ? '' : 'primary'} fxg-use`} data-testid={`fxg-use-${p.id}`} aria-pressed={on} onClick={() => { dispatchEvent(new CustomEvent('oj:pick-type', { detail: p.id })); }}>{on ? 'In use' : 'Use'}</button></span>
    </div>; })}</div>
  </section>;
}
LIB_EXTRA['photo-fx'] = t => <FxGallery tool={t} />;
