import { useRef, useState } from 'react';
import { CloseIcon } from '../Icons';
import { tip } from '../../shared/Tooltip';
import { PopSection, PopNote } from '../../shared/BarPop';
import { H3KF_CAPS, H3KF_STEP, spreadTimes, type KeyframeCaps } from '../../../../server/src/shared/h3Keyframes';
import './keyframes.css';

/** Keyframes (Generate Video, 2026-10-27): stills through one shot, as many as the model takes (its videoLimits keyframes, KeyframeCaps):
 *  MiniMax H3 2–5, each at its own time in the clip; Kling 4.0 up to 10, spaced evenly by the model (no times: the rows say Start / End).
 *  The frames live in the bar's references (vrefs.keyframes), the times in its fields (keyframeTimes, JSON seconds). Times belong to the
 *  positions on the timeline: moving a frame changes which picture lands at which time. Adding or removing a frame spreads the times evenly again. */
type R = { file: File; url: string };
export const fmtSec = (t: number) => `${Number.isInteger(t) ? t : t.toFixed(1)} s`;
/** The times as the bar keeps them: one per frame, valid for this length, else evenly spread. */
export function keyframeTimesOf(raw: unknown, n: number, seconds: number): number[] {
  let t: number[] = []; try { const x = JSON.parse(String(raw ?? '[]')); if (Array.isArray(x)) t = x.map(Number); } catch { /* none yet */ }
  const ok = t.length === n && t[0] === 0 && t.every((v, k) => Number.isFinite(v) && v <= seconds && (k === 0 || v >= t[k - 1] + H3KF_STEP));
  return ok ? t : spreadTimes(n, seconds);
}
const move = <T,>(xs: T[], from: number, to: number) => { const a = [...xs]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; };

/** A frame's place when the model spaces them itself: the start, the end, or one of the evenly spaced middle frames. */
const placeOf = (k: number, n: number, short = false) => (k === 0 ? 'Start' : k === n - 1 ? 'End' : short ? String(k + 1) : 'Spaced evenly');
interface Props { frames: R[]; times: number[]; seconds: number; disabled?: boolean; /** the model's frame limits (default: MiniMax H3's) */ caps?: KeyframeCaps;
  /** frames and times together (one update) */ onChange: (frames: R[], times: number[]) => void; onAdd: () => void; onOpen: () => void }

/** The frames in the bar's lead: thumbnails with their time, drag to reorder, ✕ to remove, a click opens the frame list. */
export function KeyframeLead({ frames, times, seconds, onChange, onAdd, onOpen, caps = H3KF_CAPS }: Props) {
  const at = (k: number) => (caps.times ? fmtSec(times[k] ?? 0) : placeOf(k, frames.length, true));
  const [over, setOver] = useState<number | null>(null); const from = useRef<number | null>(null);
  const drop = (to: number) => { const f = from.current; from.current = null; setOver(null); if (f == null || f === to) return; onChange(move(frames, f, to), times); };
  return <span className="vs-kf-lead" data-testid="vs-kf-lead" role="list" aria-label="Keyframes">
    {frames.map((r, k) => <span key={r.url} role="listitem" className={`ic-th vs-kf${over === k ? ' over' : ''}`} draggable data-testid={`vs-kf-${k + 1}`}
      onDragStart={e => { from.current = k; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-keyframe', String(k)); }}
      onDragOver={e => { if (from.current == null) return; e.preventDefault(); e.stopPropagation(); setOver(k); }} onDragLeave={() => setOver(o => (o === k ? null : o))}
      onDrop={e => { if (from.current == null) return; e.preventDefault(); e.stopPropagation(); drop(k); }} onDragEnd={() => { from.current = null; setOver(null); }}>
      <button type="button" className="ic-th-hit" aria-label={caps.times ? `Frame ${k + 1} at ${at(k)}. Change times or order` : `Frame ${k + 1}, ${placeOf(k, frames.length).toLowerCase()}. Change the order`} {...tip(`Frame ${k + 1} · ${k === 0 ? 'the start' : caps.times ? at(k) : k === frames.length - 1 ? 'the end' : 'spaced evenly'} · <Picture ${k + 1}> in the prompt. Drag to reorder`)} onClick={onOpen}>
        <img src={r.url} alt="" draggable={false} /><em className="ic-att-n" data-testid={`vs-kf-time-${k + 1}`}>{at(k)}</em></button>
      <button type="button" className="ic-x" aria-label={`Remove frame ${k + 1}`} onClick={() => { const f = frames.filter((_, j) => j !== k); onChange(f, spreadTimes(f.length, seconds)); }}><CloseIcon size={12} /></button>
    </span>)}
    {frames.length < caps.max && <span className="ic-th vs-kf vs-kf-add"><button type="button" className="ic-th-hit" data-testid="vs-kf-add-tile" aria-label="Add frames" {...tip(`Add frames · ${frames.length} of ${caps.max}`)} onClick={onAdd}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      {frames.length < caps.min && <em className="vs-kf-need">{frames.length}/{caps.min}</em>}</button></span>}
  </span>;
}

/** The frame list (the Frames popover): each frame's time, its place in the order, remove; add and spread evenly. */
export function KeyframePanel({ frames, times, seconds, onChange, onAdd, caps = H3KF_CAPS }: Props) {
  const setTime = (k: number, v: number) => { const t = [...times]; t[k] = v; onChange(frames, t); };
  const lo = (k: number) => (times[k - 1] ?? 0) + H3KF_STEP; const hi = (k: number) => (k === frames.length - 1 ? seconds : (times[k + 1] ?? seconds) - H3KF_STEP);
  return <PopSection label={`Frames · ${frames.length} of ${caps.max}`} aside={`${seconds} s clip`} testId="vs-kf-panel">
    {frames.length ? <ol className="vs-kf-list" aria-label="Frames in order">
      {frames.map((r, k) => <li key={r.url} className="vs-kf-row" data-testid={`vs-kf-row-${k + 1}`}>
        <img src={r.url} alt="" className="vs-kf-row-img" />
        <span className="vs-kf-row-l"><b>Frame {k + 1}</b><small>{k === 0 ? 'Start · <Picture 1>' : `<Picture ${k + 1}>`}</small></span>
        {!caps.times ? <span className="vs-kf-t vs-kf-t-fixed" data-testid={`vs-kf-row-time-${k + 1}`}>{placeOf(k, frames.length)}</span>
          : k === 0 ? <span className="vs-kf-t vs-kf-t-fixed" data-testid={`vs-kf-row-time-${k + 1}`}>0 s</span>
          : <span className="vs-kf-t" role="group" aria-label={`Time of frame ${k + 1}`}>
            <button type="button" aria-label={`Frame ${k + 1} earlier`} disabled={times[k] - H3KF_STEP < lo(k)} onClick={() => setTime(k, times[k] - H3KF_STEP)}>−</button>
            <output data-testid={`vs-kf-row-time-${k + 1}`} aria-live="polite">{fmtSec(times[k])}</output>
            <button type="button" aria-label={`Frame ${k + 1} later`} disabled={times[k] + H3KF_STEP > hi(k)} onClick={() => setTime(k, times[k] + H3KF_STEP)}>+</button></span>}
        <span className="vs-kf-ord">
          <button type="button" aria-label={`Move frame ${k + 1} up`} {...tip('Move earlier')} disabled={k === 0} data-testid={`vs-kf-up-${k + 1}`} onClick={() => onChange(move(frames, k, k - 1), times)}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M3 7.5 6 4.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
          <button type="button" aria-label={`Move frame ${k + 1} down`} {...tip('Move later')} disabled={k === frames.length - 1} data-testid={`vs-kf-down-${k + 1}`} onClick={() => onChange(move(frames, k, k + 1), times)}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M3 4.5 6 7.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
          <button type="button" aria-label={`Remove frame ${k + 1}`} {...tip('Remove')} data-testid={`vs-kf-remove-${k + 1}`} onClick={() => { const f = frames.filter((_, j) => j !== k); onChange(f, spreadTimes(f.length, seconds)); }}><CloseIcon size={12} /></button></span>
      </li>)}
    </ol> : <PopNote testId="vs-kf-empty">{caps.times ? `Add ${caps.min} to ${caps.max} pictures. The first is where the clip starts; each of the others is a moment the shot passes through.`
      : `Add ${caps.min} to ${caps.max} pictures. The first is where the clip starts, the last where it ends; the ones between are spaced evenly.`}</PopNote>}
    <div className="vs-kf-acts">
      <button type="button" className="vs-kf-btn" data-testid="vs-kf-add" disabled={frames.length >= caps.max} onClick={onAdd}>{frames.length >= caps.max ? `${caps.max} frames is the most` : 'Add frames'}</button>
      {caps.times && frames.length > 2 && <button type="button" className="vs-kf-btn ghost" data-testid="vs-kf-spread" onClick={() => onChange(frames, spreadTimes(frames.length, seconds))}>Space evenly</button>}
    </div>
    {frames.length > 0 && frames.length < caps.min && <PopNote testId="vs-kf-need" tone="warn">Add at least one more frame.</PopNote>}
    <p className="vs-kf-tip">Type @ in the prompt and pick a frame to say what happens around it.</p>
  </PopSection>;
}
