import { useRef } from 'react';
import type { AppField } from './AppFields';
/** B21 (T25): the Relight light position. Writes lightX / lightY in the server's range (−1…1, +y = upper); both or neither.
 *  With no position set, the dot shows where the picked direction puts the light (dimmed). Arrow keys move it by the server's step. */
const DIR_XY: Record<string, [number, number] | null> = { top: [0, 0.8], bottom: [0, -0.8], left: [-0.8, 0], right: [0.8, 0], front: [0, 0], back: null };
export default function LightPad({ fx, fy, values, onChange }: { fx: AppField; fy: AppField; values: Record<string, string>; onChange: (name: string, v: string) => void }) {
  const lo = fx.min ?? -1, hi = fx.max ?? 1, step = fx.step ?? 0.1; const pad = useRef<HTMLDivElement>(null); const drag = useRef(false);
  const xs = values[fx.name] ?? '', ys = values[fy.name] ?? ''; const set = xs !== '' && ys !== '';
  const dir = DIR_XY[values.direction ?? ''] ?? null;
  const x = set ? Number(xs) : dir?.[0] ?? 0, y = set ? Number(ys) : dir?.[1] ?? 0;
  const clamp = (v: number) => Math.max(lo, Math.min(hi, v)); const fmt = (v: number) => String(Math.round(clamp(v) * 100) / 100);
  const put = (nx: number, ny: number) => { onChange(fx.name, fmt(nx)); onChange(fy.name, fmt(ny)); };
  const at = (cx: number, cy: number) => { const r = pad.current?.getBoundingClientRect(); if (!r) return; put(lo + ((cx - r.left) / r.width) * (hi - lo), hi - ((cy - r.top) / r.height) * (hi - lo)); };
  const left = ((x - lo) / (hi - lo)) * 100, top = ((hi - y) / (hi - lo)) * 100;
  const colour = /^#[0-9a-f]{6}$/i.test(values.color ?? '') ? values.color : '#ffffff'; const bright = Math.max(0.15, Math.min(1, Number(values.brightness ?? 50) / 100));
  const hard = values.lightQuality === 'hard';
  /* BH12 T25: say where the light sits and how high, e.g. 'upper left, high' (screen readers and the caption read the same words) */
  const hz = x < -0.33 ? 'left' : x > 0.33 ? 'right' : 'centre'; const vt = y > 0.33 ? 'upper' : y < -0.33 ? 'lower' : '';
  const pos = vt ? `${vt} ${hz}` : hz === 'centre' ? 'front' : hz; const height = y > 0.33 ? 'high' : y < -0.33 ? 'low' : 'level';
  const DIR_WORD: Record<string, string> = { top: 'above', bottom: 'below', left: 'left', right: 'right', front: 'front', back: 'behind' };
  const spoken = !set ? `From the chosen direction (${DIR_WORD[values.direction ?? ''] ?? 'front'})` : `${pos}, ${height}`;
  const where = spoken[0].toUpperCase() + spoken.slice(1);
  return <section className="card app-field lp" data-testid="app-field-pad">
    <h2 className="types-h">Light position <span className="helper">optional</span></h2>
    <div className="lp-row">
      <div ref={pad} className={`lp-pad ${set ? 'set' : ''}`} role="slider" tabIndex={0} aria-label="Light position: arrow keys move the light" aria-valuetext={spoken} data-testid="light-pad"
        onPointerDown={e => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); at(e.clientX, e.clientY); }} onPointerMove={e => { if (drag.current) at(e.clientX, e.clientY); }} onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}
        onKeyDown={e => { const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }; const m = d[e.key]; if (m) { e.preventDefault(); put(x + m[0], y + m[1]); } }}>
        <span className="lp-cross" aria-hidden /><span className="lp-subject" aria-hidden />
        <span className={`lp-dot ${set ? '' : 'ghost'} ${!set && values.direction === 'back' ? 'behind' : ''}`} style={{ left: `${left}%`, top: `${top}%`, background: colour }} aria-hidden />
      </div>
      <div className="lp-side">
        <span className="lp-sphere" aria-hidden style={{ background: `radial-gradient(circle at ${left}% ${top}%, ${colour} 0%, ${colour}${Math.round(bright * 200).toString(16).padStart(2, '0')} ${hard ? 18 : 30}%, #1a1a1d ${hard ? 46 : 78}%)` }} />
        <small className="helper lp-where" data-testid="light-pad-where">{where}</small>
        <button type="button" className="btn btn-sm lp-reset" data-testid="light-pad-reset" disabled={!set} onClick={() => { onChange(fx.name, ''); onChange(fy.name, ''); }}>Reset</button>
      </div>
    </div>
    <p className="helper">Drag the dot or use the arrow keys. A position here replaces the direction buttons; picking a direction clears it. The light is described to the model in words, so placement is approximate.</p>
  </section>;
}
