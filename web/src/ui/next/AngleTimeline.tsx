import { useRef } from 'react';
/** Mini timeline (clip ticks + one coloured segment per angle). Drag a segment's edges to set start/end, or its body to move it. Numeric inputs stay below. */
const COLORS = ['#ff8a3d', '#4fb3ff', '#b98cff', '#3bd16f'];
export default function AngleTimeline({ duration, angles, onChange }: { duration: number; angles: { start: number; end: number; angle: string }[]; onChange: (i: number, p: { start?: number; end?: number }) => void }) {
  const box = useRef<HTMLDivElement>(null);
  if (!duration) return null;
  const pct = (t: number) => `${Math.max(0, Math.min(100, (t / duration) * 100))}%`;
  const drag = (i: number, kind: 'start' | 'end' | 'move') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation(); const el = box.current; if (!el) return;
    const r = el.getBoundingClientRect(); const a0 = angles[i]; const x0 = e.clientX; const len = a0.end - a0.start;
    const toT = (x: number) => Math.round(Math.max(0, Math.min(duration, ((x - r.left) / r.width) * duration)) * 10) / 10;
    const mv = (ev: PointerEvent) => {
      if (kind === 'start') onChange(i, { start: Math.min(toT(ev.clientX), a0.end - 0.5) });
      else if (kind === 'end') onChange(i, { end: Math.max(toT(ev.clientX), a0.start + 0.5) });
      else { const d = Math.round(((ev.clientX - x0) / r.width) * duration * 10) / 10; const s = Math.max(0, Math.min(duration - len, a0.start + d)); onChange(i, { start: Math.round(s * 10) / 10, end: Math.round((s + len) * 10) / 10 }); }
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  };
  const ticks = Array.from({ length: Math.floor(duration) + 1 }, (_, s) => s);
  return <div className="atl" ref={box} role="group" aria-label="Angle timeline">
    {ticks.map(s => <span key={s} className={`atl-tick ${s % 5 === 0 ? 'major' : ''}`} style={{ left: pct(s) }}>{s % 5 === 0 && <em>{s}s</em>}</span>)}
    {angles.map((a, i) => <div key={i} className="atl-seg" style={{ left: pct(a.start), width: `calc(${pct(a.end)} - ${pct(a.start)})`, background: COLORS[i % 4] }} onPointerDown={drag(i, 'move')} title={`Angle ${i + 1}: ${a.start}–${a.end} s`}>
      <span className="atl-h l" onPointerDown={drag(i, 'start')} aria-label={`Drag angle ${i + 1} start`} /><b>{i + 1}</b><span className="atl-h r" onPointerDown={drag(i, 'end')} aria-label={`Drag angle ${i + 1} end`} />
    </div>)}
  </div>;
}
