import { useEffect, useRef, useState } from 'react';
import { CROSSVIEW_AZ, CROSSVIEW_DIST, CROSSVIEW_EL, CROSSVIEW_PROVIDER, CROSSVIEW_ZONE_WORDS, crossviewTooSmall, crossviewZone, type CrossViewZone } from '../../../../server/src/shared/crossview';
import { fmtDeg } from './OrbitPad';

/**
 * H3 runner Step 3 (Oct 26): the camera for "New angle · H3 CrossView · cloud". One camera for the whole take, in numbers: azimuth (left / right),
 * elevation (above / below) and distance. The pad shows the zones the CrossView-Warp LoRA was checked (green) and trained (yellow) on; red = the
 * hidden side gets invented. Same space and words as the server (server/src/shared/crossview.ts). Used by the Video bar's Re-shoot angles popover.
 */
export type CrossViewCam = { azimuth: number; elevation: number; distance: number };
export const CROSSVIEW_DEFAULT_CAM: CrossViewCam = { azimuth: CROSSVIEW_AZ.default, elevation: CROSSVIEW_EL.default, distance: CROSSVIEW_DIST.default };
export const isCrossView = (prov: string) => prov === CROSSVIEW_PROVIDER;
export const zoneLabel: Record<CrossViewZone, string> = { green: 'Green zone', yellow: 'Yellow zone', red: 'Red zone' };
export const camWords = (c: CrossViewCam) => `↻ ${fmtDeg(c.azimuth)} · ↕ ${fmtDeg(c.elevation)}${c.distance !== 1 ? ` · ×${c.distance}` : ''}`;

const W = 360, H = 180, P = 10; // pad: azimuth −90…90 across, elevation +45 (top) … −45 (bottom), P = room for the handle at the edges
const x = (az: number) => P + ((az - CROSSVIEW_AZ.min) / (CROSSVIEW_AZ.max - CROSSVIEW_AZ.min)) * (W - 2 * P);
const y = (el: number) => P + ((CROSSVIEW_EL.max - el) / (CROSSVIEW_EL.max - CROSSVIEW_EL.min)) * (H - 2 * P);
/** Half-ellipse paths: rx in azimuth degrees, up / down in elevation degrees. */
const ellipse = (rx: number, up: number, down: number) => { const cx = x(0), cy = y(0), a = x(rx) - cx, u = cy - y(up), d = y(-down) - cy;
  return `M ${cx - a} ${cy} A ${a} ${u} 0 0 1 ${cx + a} ${cy} A ${a} ${d} 0 0 1 ${cx - a} ${cy} Z`; };

type Deploy = { configured: boolean; reason: string | null; missing: string[] | null };
/** What Settings knows about the user's deployment (names only): set up or not, and what the last free check found missing for this recipe. */
function useDeploy(): Deploy | null {
  const [d, setD] = useState<Deploy | null>(null);
  useEffect(() => { let off = false; fetch('/api/comfy-deploy').then(r => r.ok ? r.json() : null).then((b: any) => { if (off || !b) return;
    const rec = b.lastProbe?.nodes?.checked ? (b.lastProbe.recipes ?? []).find((r: any) => r.id === CROSSVIEW_PROVIDER) : null;
    setD({ configured: !!b.configured, reason: b.reason ?? null, missing: rec && rec.ready === false ? [...rec.missingNodes, ...rec.missingModels] : null }); }).catch(() => 0);
    return () => { off = true; }; }, []);
  return d;
}

export function CrossViewPad({ cam, onChange, clipSec }: { cam: CrossViewCam; onChange: (c: CrossViewCam) => void; clipSec: number }) {
  const box = useRef<SVGSVGElement>(null); const drag = useRef(false); const dep = useDeploy();
  const zone = crossviewZone(cam.azimuth, cam.elevation);
  const set = (p: Partial<CrossViewCam>) => onChange({ ...cam, ...p });
  const fromEvent = (e: { clientX: number; clientY: number }) => { const r = box.current!.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, ((e.clientX - r.left) / r.width * W - P) / (W - 2 * P))), fy = Math.min(1, Math.max(0, ((e.clientY - r.top) / r.height * H - P) / (H - 2 * P)));
    set({ azimuth: Math.round(CROSSVIEW_AZ.min + fx * (CROSSVIEW_AZ.max - CROSSVIEW_AZ.min)), elevation: Math.round(CROSSVIEW_EL.max - fy * (CROSSVIEW_EL.max - CROSSVIEW_EL.min)) }); };
  const key = (e: React.KeyboardEvent) => { const st = e.shiftKey ? 15 : 5; let a = cam.azimuth, el = cam.elevation;
    if (e.key === 'ArrowLeft') a -= st; else if (e.key === 'ArrowRight') a += st; else if (e.key === 'ArrowUp') el += st; else if (e.key === 'ArrowDown') el -= st; else return;
    e.preventDefault(); set({ azimuth: Math.max(CROSSVIEW_AZ.min, Math.min(CROSSVIEW_AZ.max, a)), elevation: Math.max(CROSSVIEW_EL.min, Math.min(CROSSVIEW_EL.max, el)) }); };
  const rows = [['azimuth', 'Side', CROSSVIEW_AZ, 1, '°'], ['elevation', 'Height', CROSSVIEW_EL, 1, '°'], ['distance', 'Distance', CROSSVIEW_DIST, 0.05, '×']] as const;
  const clipNote = !clipSec ? null : clipSec < 4 ? `Your take is ${Math.round(clipSec * 10) / 10} s: too short. H3 CrossView needs 5–15 s (takes from 4 s get padded to 5 s).` : clipSec < 5 ? `Your take is ${Math.round(clipSec * 10) / 10} s: it gets padded to 5 s by holding the last frame.` : clipSec > 15.05 ? `Your take is ${Math.round(clipSec)} s: the first 15 s are used.` : null;
  return <div className="cv-pad" data-testid="cv-pad" data-zone={zone}>
    <svg ref={box} className="cv-pad-svg" viewBox={`0 0 ${W} ${H}`} role="slider" tabIndex={0} aria-label="New camera angle: drag to aim (left / right, above / below)"
      aria-valuetext={`${fmtDeg(cam.azimuth)} left-right, ${fmtDeg(cam.elevation)} above-below, ${zoneLabel[zone]}`} onKeyDown={key}
      onPointerDown={e => { drag.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); fromEvent(e); }} onPointerMove={e => { if (drag.current) fromEvent(e); }}
      onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}>
      <rect className="cv-z red" x={0} y={0} width={W} height={H} rx={8} />
      <path className="cv-z yellow" d={ellipse(90, 45, 35)} />
      <path className="cv-z green" d={ellipse(45, 30, 20)} />
      <line className="cv-axis" x1={x(0)} y1={0} x2={x(0)} y2={H} /><line className="cv-axis" x1={0} y1={y(0)} x2={W} y2={y(0)} />
      <text className="cv-l" x={P + 4} y={y(0) - 5}>Left</text><text className="cv-l" x={W - P - 4} y={y(0) - 5} textAnchor="end">Right</text>
      <text className="cv-l" x={x(0) + 5} y={P + 10}>Above</text><text className="cv-l" x={x(0) + 5} y={H - P - 3}>Below</text>
      <circle className="cv-take" cx={x(0)} cy={y(0)} r={4} /><text className="cv-l take" x={x(0) - 6} y={y(0) + 14} textAnchor="end">Take</text>
      <circle className={`cv-h ${zone}`} cx={x(cam.azimuth)} cy={y(cam.elevation)} r={8} data-testid="cv-handle" />
    </svg>
    <p className={`cv-zone ${zone}`} role="status" data-testid="cv-zone"><i aria-hidden />{CROSSVIEW_ZONE_WORDS[zone]}.{crossviewTooSmall(cam.azimuth, cam.elevation) ? ' A very small move can look like the take itself.' : ''}</p>
    <div className="rs-nums cv-nums">{rows.map(([k, l, r, step, u]) => <label key={k} className="rs-num"><span>{l}</span>
      <input type="range" className="rs-range" min={r.min} max={r.max} step={step} value={cam[k]} aria-label={`${l} slider`} data-testid={`cv-range-${k}`} onChange={e => set({ [k]: Number(e.target.value) } as any)} />
      <input type="number" min={r.min} max={r.max} step={step} value={cam[k]} aria-label={`${l} (${u === '°' ? 'degrees' : 'times the take’s distance'})`} data-testid={`cv-num-${k}`}
        onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) set({ [k]: Math.max(r.min, Math.min(r.max, v)) } as any); }} /><small aria-hidden>{u}</small></label>)}</div>
    <div className="cv-acts"><button type="button" className="vbar-link" data-testid="cv-reset" onClick={() => onChange(CROSSVIEW_DEFAULT_CAM)}>Reset to the default angle</button></div>
    <p className="cv-note">One camera for the whole take. Distance isn’t followed closely by this LoRA yet. Takes of 5–15 s.</p>
    {clipNote && <p className="cv-note warn" data-testid="cv-clip-note">{clipNote}</p>}
    {dep && !dep.configured && <p className="cv-note warn" data-testid="cv-deploy-missing">Your Comfy deployment isn’t set up yet, so this shows a sample. Add its address in Settings → Connections.</p>}
    {dep?.missing?.length ? <p className="cv-note bad" data-testid="cv-deploy-incomplete">Your deployment is missing: {dep.missing.join(', ')}. Add them to its Build, then check again in Settings → Connections.</p> : null}
  </div>;
}
