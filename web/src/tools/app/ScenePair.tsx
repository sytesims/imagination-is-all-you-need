/* B21 T26: Start → End scene pair for Transitions. Two equal boxes (fixed aspect so filling them shifts nothing), Swap reverses them. */
import { IMAGE_ACCEPT } from '../../../../server/src/shared/mediaAccept';
import type { Ref } from '../../shared/References';
import type { ReactNode } from 'react';

function Slot({ id, label, r, onFile, onClear, disabled, children }: { id: string; label: string; r: Ref | null; onFile: (f: File) => void; onClear: () => void; disabled?: boolean; children?: ReactNode }) {
  return <div className={`sp-slot ${r ? 'filled' : ''}`} data-testid={`scene-${id}`}>
    <span className="sp-label">{label}</span>
    <label className="sp-box">
      <input type="file" accept={IMAGE_ACCEPT} data-testid={`scene-${id}-input`} disabled={disabled} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      {r ? <img src={r.url} alt={`${label} scene`} /> : <span className="sp-empty"><b>+</b><span>Add {label.toLowerCase()} image</span></span>}
    </label>
    {r && <button type="button" className="btn btn-sm sp-clear" onClick={onClear} disabled={disabled} data-testid={`scene-${id}-clear`}>Remove</button>}
    {children}
  </div>;
}

export default function ScenePair({ start, end, onStart, onEnd, clearStart, clearEnd, onSwap, disabled, startIssue, endIssue, err }: {
  start: Ref | null; end: Ref | null; onStart: (f: File) => void; onEnd: (f: File) => void; clearStart: () => void; clearEnd: () => void; onSwap: () => void; disabled?: boolean; startIssue?: ReactNode; endIssue?: ReactNode; err?: string;
}) {
  return <section className="card scene-pair" data-testid="scene-pair">
    <h2>Scenes</h2>
    <p className="helper">The clip starts on the first image and ends on the second. PNG or JPG.</p>
    <div className="sp-row">
      <Slot id="start" label="Start" r={start} onFile={onStart} onClear={clearStart} disabled={disabled}>{startIssue}</Slot>
      <span className="sp-arrow" aria-hidden>→</span>
      <Slot id="end" label="End" r={end} onFile={onEnd} onClear={clearEnd} disabled={disabled}>{endIssue}</Slot>
    </div>
    {err && <div className="err">{err}</div>}
    <button type="button" className="btn sp-swap" data-testid="scene-swap" onClick={onSwap} disabled={disabled || (!start && !end)}>⇄ Swap start and end</button>
  </section>;
}
