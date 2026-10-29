import { useRef } from 'react';
/** B15 (PB #14 Re-shoot shape): drag-to-orbit. x = yaw (−180 … 180, 0 = front, negative = the subject's left), y = tilt (top = camera above).
 *  The handle snaps to a pad preset within snapDeg; the live readouts show rotation and tilt. Presets come from the server ({id,label,yaw,tilt,pad}). */
export type PadPreset = { id: string; label: string; prompt?: string; yaw: number; tilt: number; pad?: boolean };
export type Space = { yaw: { min: number; max: number }; tilt: { min: number; max: number }; snapDeg: number };
const wrap = (d: number) => { let x = ((d + 180) % 360 + 360) % 360 - 180; if (x === -180 && d > 0) x = 180; return x; };
export const nearestPreset = (yaw: number, tilt: number, presets: PadPreset[], snap: number) => { let best: PadPreset | null = null, bd = Infinity;
  for (const p of presets) { const d = Math.hypot(wrap(yaw - p.yaw), tilt - p.tilt); if (d < bd) { bd = d; best = p; } } return best && bd <= snap ? best : null; };
/** Plain words for a position, close to how the server phrases an unsnapped angle. */
export const yawTiltWords = (yaw: number, tilt: number) => { const a = Math.abs(yaw); const h = a < 15 ? 'front' : a >= 165 ? 'behind' : `${Math.round(a)}° ${yaw < 0 ? 'left' : 'right'}`;
  const v = tilt >= 10 ? `${Math.round(tilt)}° above` : tilt <= -10 ? `${Math.round(-tilt)}° below` : 'eye level'; return `${h}, ${v}`; };
export const fmtDeg = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n))}°`;
export function OrbitPad({ yaw, tilt, onChange, presets, space, disabled, onPick }: { yaw: number; tilt: number; onChange: (yaw: number, tilt: number, snapped: PadPreset | null) => void; presets: PadPreset[]; space: Space; disabled?: boolean; onPick?: (p: PadPreset) => void }) {
  const box = useRef<HTMLDivElement>(null); const drag = useRef(false);
  const { yaw: Y, tilt: T, snapDeg } = space; const pad = presets.filter(p => p.pad !== false);
  const px = (v: number) => (v - Y.min) / (Y.max - Y.min) * 100; const py = (v: number) => (T.max - v) / (T.max - T.min) * 100;
  const fromEvent = (e: { clientX: number; clientY: number }) => { const r = box.current!.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), fy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    let yv = Math.round(Y.min + fx * (Y.max - Y.min)), tv = Math.round(T.max - fy * (T.max - T.min)); const s = nearestPreset(yv, tv, pad, snapDeg); if (s) { yv = s.yaw; tv = s.tilt; } onChange(yv, tv, s); };
  const key = (e: React.KeyboardEvent) => { const st = e.shiftKey ? 15 : 5; let yv = yaw, tv = tilt;
    if (e.key === 'ArrowLeft') yv -= st; else if (e.key === 'ArrowRight') yv += st; else if (e.key === 'ArrowUp') tv += st; else if (e.key === 'ArrowDown') tv -= st; else if (e.key === 'Home') { yv = 0; tv = 0; } else return;
    e.preventDefault(); yv = Math.max(Y.min, Math.min(Y.max, yv)); tv = Math.max(T.min, Math.min(T.max, tv)); onChange(yv, tv, nearestPreset(yv, tv, pad, snapDeg)); };
  const snapped = nearestPreset(yaw, tilt, pad, snapDeg);
  return <div className={`rs-orbit${disabled ? ' off' : ''}`} data-testid="rs-orbit">
    <div ref={box} className="rs-orbit-pad" role="slider" tabIndex={disabled ? -1 : 0} aria-label="Camera position: Hold and drag to change camera angle" aria-valuetext={`Rotation ${fmtDeg(yaw)}, tilt ${fmtDeg(tilt)}${snapped ? `, ${snapped.label}` : ''}`}
      aria-disabled={disabled || undefined} onKeyDown={disabled ? undefined : key}
      onPointerDown={e => { if (disabled) return; drag.current = true; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); fromEvent(e); }} onPointerMove={e => { if (drag.current) fromEvent(e); }} onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}>
      <span className="rs-orbit-grid" aria-hidden><i style={{ left: `${px(0)}%` }} className="v" /><i style={{ top: `${py(0)}%` }} className="h" /><i style={{ left: `${px(-90)}%` }} className="v q" /><i style={{ left: `${px(90)}%` }} className="v q" /></span>
      <span className="rs-orbit-l l" aria-hidden>Left</span><span className="rs-orbit-l r" aria-hidden>Right</span><span className="rs-orbit-l t" aria-hidden>Above</span><span className="rs-orbit-l b" aria-hidden>Below</span><span className="rs-orbit-l f" aria-hidden style={{ left: `${px(0)}%` }}>Front</span>
      {pad.map(p => <button key={p.id} type="button" className={`rs-orbit-pin${snapped?.id === p.id ? ' on' : ''}`} style={{ left: `${px(p.yaw)}%`, top: `${py(p.tilt)}%` }} disabled={disabled} title={p.label} aria-label={`Move to ${p.label}`} data-testid={`rs-pad-${p.id}`}
        onPointerDown={e => e.stopPropagation()} onClick={() => { onChange(p.yaw, p.tilt, p); onPick?.(p); }}><small>{p.label}</small></button>)}
      <span className={`rs-orbit-h${snapped ? ' snap' : ''}`} style={{ left: `${px(yaw)}%`, top: `${py(tilt)}%` }} aria-hidden data-testid="rs-orbit-handle" />
    </div>
    <small className="rs-orbit-hint" data-testid="rs-orbit-hint" aria-hidden>Hold and drag to change camera angle</small>
    <div className="rs-orbit-read" aria-live="polite">{/* B30: Rotation / Tilt numbers now sit in the sliders below the pad */}<span className="rs-orbit-snap"><small>{snapped ? 'Snapped to' : 'Position'}</small><b data-testid="rs-snap">{snapped ? snapped.label : yawTiltWords(yaw, tilt)}</b></span></div>
  </div>;
}

/** B15 (PB #14): what the server actually ran: each angle with its time range, orbit position and the preset it snapped to. */
export function AngleEcho({ input }: { input: any }) {
  const list: any[] = Array.isArray(input?.angles) ? input.angles : [];
  if (!list.length && !input?.sourceKind) return null;
  return <div className="rs-echo mt-12" data-testid="rs-echo">
    {input?.sourceKind === 'image' && <span className="rs-pos-chip" data-testid="rs-echo-source">From a photo{input?.duration ? ` · ${Math.round(input.duration)} s` : ''}</span>}
    {list.map((a, i) => <span key={i} className="rs-echo-row" data-testid={`rs-echo-${i}`} title={a.angle}>
      <b>{typeof a.start === 'number' && typeof a.end === 'number' ? `${a.start}–${a.end} s` : `Angle ${i + 1}`}</b>
      <span className="rs-echo-a">{a.preset || a.angle}</span>
      {typeof a.yaw === 'number' && <span className="rs-pos-chip">↻ {fmtDeg(a.yaw)} · ↕ {fmtDeg(a.tilt ?? 0)}</span>}
    </span>)}
  </div>;
}
