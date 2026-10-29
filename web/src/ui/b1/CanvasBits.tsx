import { ReactNode, useState } from 'react';
import './canvasBits.css';
/** #10 Canvas helpers: sub-tabs, How-it-works slideshow, List/Grid toggle. */
export function SubTabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  return <div className="subtabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={k === value} className={k === value ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
export function Slideshow({ slides }: { slides: { title: string; body: ReactNode; art?: ReactNode }[] }) {
  const [i, setI] = useState(0); const s = slides[i];
  return (
    <div className="slides">
      <div className="slide">{s.art && <div className="slide-art">{s.art}</div>}<div><span className="slide-n">Step {i + 1} of {slides.length}</span><h3>{s.title}</h3><div className="slide-body">{s.body}</div></div></div>
      <div className="slide-nav"><button className="btn btn-sm" disabled={!i} onClick={() => setI(i - 1)}>← Prev</button>
        <div className="slide-dots">{slides.map((_, j) => <button key={j} aria-label={`Step ${j + 1}`} className={j === i ? 'on' : ''} onClick={() => setI(j)} />)}</div>
        <button className="btn btn-sm" disabled={i === slides.length - 1} onClick={() => setI(i + 1)}>Next →</button></div>
    </div>
  );
}
export function ViewToggle({ value, onChange }: { value: 'grid' | 'list'; onChange: (v: 'grid' | 'list') => void }) {
  return <div className="seg seg-chips view-toggle"><button aria-label="Grid" className={value === 'grid' ? 'on' : ''} onClick={() => onChange('grid')}>▦</button><button aria-label="List" className={value === 'list' ? 'on' : ''} onClick={() => onChange('list')}>☰</button></div>;
}
/** PB-20: History thumbnail size (small · medium · large), a range like a zoom slider. */
export const HIST_SIZES = [150, 220, 320];
export function HistSize({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ic = (s: number) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><rect x="2.5" y="2.5" width="11" height="11" rx="2" /></svg>;
  return <label className="hist-size" title="Thumbnail size">{ic(11)}<input type="range" min={0} max={HIST_SIZES.length - 1} step={1} value={value} aria-label="Thumbnail size" data-testid="hist-size" onChange={e => onChange(Number(e.target.value))} />{ic(15)}</label>;
}
/** PB-20: History filter: all, in progress (queued or running), finished, failed. */
export type HistFilter = 'all' | 'active' | 'done' | 'failed';
export const histMatch = (f: HistFilter, status: string) => f === 'all' || (f === 'active' ? status === 'queued' || status === 'running' : f === 'done' ? status === 'done' : ['failed', 'blocked', 'canceled'].includes(status));
export function HistFilterSelect({ value, onChange, counts }: { value: HistFilter; onChange: (v: HistFilter) => void; counts: Record<HistFilter, number> }) {
  const opts: [HistFilter, string][] = [['all', 'All'], ['active', 'In progress'], ['done', 'Finished'], ['failed', 'Failed']];
  return <label className="hist-filter" title="Filter"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M2.5 4h11M4.5 8h7M6.5 12h3" /></svg>
    <select aria-label="Filter history" data-testid="hist-filter" value={value} onChange={e => onChange(e.target.value as HistFilter)}>{opts.map(([k, l]) => <option key={k} value={k}>{l} ({counts[k]})</option>)}</select></label>;
}
/** PB-19: the History tab before the first run: a large title and three step cards (our own drawings and words). */
export function HistEmpty({ media, needsInput, onStart }: { media: 'video' | 'image' | 'audio'; needsInput: boolean; onStart?: () => void }) {
  const noun = media === 'image' ? 'image' : media === 'audio' ? 'track' : 'clip'; const src = media === 'audio' ? 'a clip or a few words' : media === 'image' ? 'a photo' : 'a photo or a clip';
  const G = (d: ReactNode) => <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;
  const steps: [string, string, ReactNode, string][] = [
    ['Add your input', needsInput ? `Drop in ${src}, or pick one from Assets.` : 'Describe what you want, or start from a preset.', G(<><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>), 'hs-a'],
    ['Choose the look', 'Pick a look, then set the few options that matter.', G(<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>), 'hs-b'],
    ['Generate', `Check the price on the button and press Generate. Your ${noun} lands here and in Assets.`, G(<><path d="M10 3.5 11.8 8.2 16.5 10l-4.7 1.8L10 16.5l-1.8-4.7L3.5 10l4.7-1.8z" /><path d="M18 14.5v5M15.5 17h5" /></>), 'hs-c']];
  return <div className="hist-empty" data-testid="hist-empty">
    <h2 className="hist-empty-h">Your first {noun} is three steps away</h2>
    <p className="helper">Nothing here yet. Every run you make with this tool shows up in this tab.</p>
    <ol className="hist-steps">{steps.map(([h, p, g, c], i) => <li key={h} className={`hist-step ${c}`}><div className="hist-step-art" aria-hidden><span className="hs-glow" />{g}<span className="hs-n">{i + 1}</span></div><b>{h}</b><span>{p}</span></li>)}</ol>
    {onStart && <button type="button" className="btn btn-primary hist-start m-only" data-testid="hist-start" onClick={onStart}>Set it up</button>}
  </div>;
}
