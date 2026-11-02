/** Trim: pick the part of a clip a tool uses (whole seconds, or `step` seconds: Stitch trims in tenths), with the model's maximum shown. Shared by
 *  every video-to-video tool that limits length (Video Swap person swap / motion transfer) and Stitch's per-clip in/out. Two thumbs on one track (keyboard: each thumb is a slider), a read-out and an optional note. */
import { useId } from 'react';

export type Trim = { start: number; end: number };
/** 0:07, 1:05 */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;
const fmt = clock;
/** The one rule a moved handle follows (TrimRange's thumbs and the Trim sheet's handles): inside 0–D, at least min and at most max long; the other
 *  end gives way. Returns the range and which limit stopped it ('min' / 'max'), so the sheet can say so. */
export function moveTrim(value: Trim, moved: 'start' | 'end', to: number, o: { D: number; min: number; max: number; step?: number; /** the moved handle stops at the limit (the Trim sheet) instead of pushing the other end */ stop?: boolean }): Trim & { hit: 'min' | 'max' | null } {
  const step = o.step ?? 1; const q = (n: number) => Math.round(Math.round(n / step) * step * 1000) / 1000; const { D, min, max } = o;
  let start = moved === 'start' ? to : value.start, end = moved === 'end' ? to : value.end; let hit: 'min' | 'max' | null = null;
  const want = q(end - start);
  if (o.stop) { const hitOf = want < min - 1e-9 ? 'min' : want > max + 1e-9 ? 'max' : null;
    if (moved === 'start') start = Math.max(0, Math.max(end - max, Math.min(end - min, q(start)))); else end = Math.min(D, Math.min(start + max, Math.max(start + min, q(end))));
    return { start: q(start), end: q(end), hit: hitOf }; }
  start = Math.max(0, Math.min(D - min, q(start))); end = Math.max(min, Math.min(D, q(end)));
  if (moved === 'start') { if (end - start < min) end = Math.min(D, start + min); if (end - start < min) start = Math.max(0, end - min); if (end - start > max) end = start + max; }
  else { if (end - start < min) start = Math.max(0, end - min); if (end - start < min) end = Math.min(D, start + min); if (end - start > max) start = end - max; }
  if (want < min - 1e-9) hit = 'min'; else if (want > max + 1e-9) hit = 'max';
  return { start: q(start), end: q(end), hit };
}

export default function TrimRange({ duration, value, onChange, max, min = 1, step = 1, note, disabled, label = 'Swap range', testId = 'trim' }: {
  /** Clip length (seconds). */ duration: number; value: Trim; onChange: (t: Trim) => void;
  /** Longest range allowed (the model's limit) and the shortest. */ max: number; min?: number; /** seconds per move (default 1) */ step?: number;
  /** One line under the read-out (e.g. how the range runs on this model). */ note?: string | null; disabled?: boolean; label?: string; testId?: string;
}) {
  const id = useId(); const q = (n: number) => Math.round(Math.round(n / step) * step * 1000) / 1000; const D = Math.max(min, step < 1 ? q(Math.floor((duration + 0.005) / step) * step) : Math.floor(duration + 0.05));
  const len = q(value.end - value.start); const sec = (n: number) => (step < 1 ? n.toFixed(1) : String(n));
  const set = (start: number, end: number, moved: 'start' | 'end') => { const r = moveTrim(value, moved, moved === 'start' ? start : end, { D, min, max, step }); onChange({ start: r.start, end: r.end }); };
  const pct = (s: number) => `${(s / D) * 100}%`; const over = Math.floor(duration + 0.05) > max;
  return <div className={`trim ${disabled ? 'locked' : ''}`} data-testid={testId}>
    <div className="trim-h"><span className="field" id={`${id}-l`}>{label.toUpperCase()}</span>
      <span className="trim-out" data-testid={`${testId}-readout`}><b>{step < 1 ? `${sec(value.start)}–${sec(value.end)} s` : `${fmt(value.start)}–${fmt(value.end)}`}</b> · {sec(len)} s {max < D || step >= 1 ? <span className="trim-max">of max {max} s</span> : <span className="trim-max">of {sec(D)} s</span>}</span></div>
    <div className="trim-r" role="group" aria-labelledby={`${id}-l`}>
      <div className="trim-track" aria-hidden><div className="trim-fill" style={{ left: pct(value.start), width: `calc(${pct(value.end)} - ${pct(value.start)})` }} /></div>
      <input type="range" min={0} max={D} step={step} value={value.start} disabled={disabled} aria-label="Start (seconds)" aria-valuetext={`starts at ${sec(value.start)} s`} data-testid={`${testId}-start`} onChange={e => set(Number(e.target.value), value.end, 'start')} />
      <input type="range" min={0} max={D} step={step} value={value.end} disabled={disabled} aria-label="End (seconds)" aria-valuetext={`ends at ${sec(value.end)} s`} data-testid={`${testId}-end`} onChange={e => set(value.start, Number(e.target.value), 'end')} />
    </div>
    <div className="trim-scale helper" aria-hidden><span>0:00</span><span>{fmt(D)}</span></div>
    {over && <p className="helper trim-over" data-testid={`${testId}-over`}>Your clip is {Math.round(duration)} s; this model takes up to {max} s, so pick the part to use.</p>}
    {note && <p className="helper trim-note" data-testid={`${testId}-note`}>{note}</p>}
  </div>;
}
