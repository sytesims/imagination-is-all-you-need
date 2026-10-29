/**
 * LightSphere (2026-10-24): one shared 3D light control. A hairline wireframe globe around a lit preview of the photo; drag the glowing
 * KEY light (and an optional RIM light) over the sphere with the mouse, touch or the arrow keys; live mono readouts; colour temperature
 * (2000–10000K) or a creative colour, intensity, softness, ambient; presets that glide the lights into place.
 *
 * Shared, no page logic: it edits a plain `LightRig` (server/src/shared/lightRig.ts) and calls onChange; the page decides what the rig
 * does (Relight sends it with the job; a future Canvas can do the same). three loads only when a sphere mounts, and it renders on demand.
 * Reduced motion: presets jump instead of gliding.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { SPHERE_PRESETS, KELVIN_MIN, KELVIN_MAX, kelvinRgb, lightRgb, lightReadout, rigToText, wrapAz, rgbHex, type LightRig, type RigLight, type SpherePreset } from '../../../server/src/shared/lightRig';
import { createSphereEngine, type SphereEngine, type Which } from './lightSphereEngine';
import './lightSphere.css';

export type { LightRig, RigLight, SpherePreset };
/** The rig in plain words (the same words Relight's prompt uses). */
export const toText = rigToText;
export { lightMap } from './lightMap';

export interface LightSphereProps {
  value: LightRig;
  /** every committed change (drag end, key press, slider, preset landed); `preset` when a preset was picked */
  onChange: (rig: LightRig, meta?: { preset?: SpherePreset }) => void;
  /** the photo to light (an object or http URL); none = a placeholder silhouette */ photo?: string | null;
  presets?: SpherePreset[];
  /** the canvas size in CSS px */ size?: number;
  testId?: string; className?: string;
  /** 'ball' (Relight's compact panel): only the stage, a soft shaded ball with glowing lights; no presets, sliders, mono readouts or axis labels.
   *  The page names the light in plain words (`label`) and picks which light the drag and arrows move (`active` / `onActive`). */
  variant?: 'full' | 'ball'; label?: string; active?: Which; onActive?: (w: Which) => void;
}

const NEON = ['#E05AD8', '#33D6FF', '#FF3B5C', '#7CFF6B', '#8A5CFF', '#FFB347'];
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpLight = (a: RigLight, b: RigLight, t: number): RigLight => {
  const az = a.az + wrapAz(b.az - a.az) * t; const mixC = a.color || b.color;
  const ca = lightRgb(a), cb = lightRgb(b);
  return { az: wrapAz(az), el: lerp(a.el, b.el, t), kelvin: lerp(a.kelvin, b.kelvin, t), intensity: lerp(a.intensity, b.intensity, t), softness: lerp(a.softness, b.softness, t),
    ...(mixC ? { color: rgbHex(ca.map((x, i) => Math.round(lerp(x, cb[i], t))) as [number, number, number]) } : {}) };
};
const lerpRig = (a: LightRig, b: LightRig, t: number): LightRig => ({
  key: lerpLight(a.key, b.key, t), ambient: lerp(a.ambient, b.ambient, t),
  ...(a.rim && b.rim ? { rim: lerpLight(a.rim, b.rim, t) } : b.rim ? { rim: { ...b.rim, intensity: b.rim.intensity * t } } : a.rim && t < 1 ? { rim: { ...a.rim, intensity: a.rim.intensity * (1 - t) } } : {}),
});
const round = (r: LightRig): LightRig => { const L = (l: RigLight): RigLight => ({ ...l, az: Math.round(wrapAz(l.az)), el: Math.round(l.el), kelvin: Math.round(l.kelvin / 50) * 50, intensity: Math.round(l.intensity), softness: Math.round(l.softness) });
  return { ...r, key: L(r.key), ...(r.rim ? { rim: L(r.rim) } : {}), ambient: Math.round(r.ambient) }; };
const css = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const TEMP_TRACK = `linear-gradient(90deg,${[2000, 3000, 4000, 5500, 7000, 10000].map((k, i, a) => `${css(kelvinRgb(k))} ${(i / (a.length - 1)) * 100}%`).join(',')})`;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n))}°`;

export function LightSphere({ value, onChange, photo = null, presets = SPHERE_PRESETS, size = 272, testId = 'light-sphere', className = '', variant = 'full', label, active: activeIn, onActive }: LightSphereProps) {
  const ball = variant === 'ball';
  const [shown, setShown] = useState<LightRig>(value); const shownRef = useRef(shown); shownRef.current = shown;
  const busy = useRef(false); /* a drag or a preset glide in flight: the value from outside waits */
  const key = JSON.stringify(value);
  useEffect(() => { if (!busy.current) setShown(value); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [activeOwn, setActiveOwn] = useState<Which>('key'); const active = activeIn ?? activeOwn; const setActive = (w: Which) => { setActiveOwn(w); onActive?.(w); }; const act: Which = active === 'rim' && !shown.rim ? 'key' : active;
  const [tab, setTab] = useState<Which>('key');
  const canvas = useRef<HTMLCanvasElement>(null); const eng = useRef<SphereEngine | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => { let dead = false; const c = canvas.current; if (!c) return;
    createSphereEngine(c, size, { look: ball ? 'ball' : 'wire' }).then((e) => { if (dead) { e.dispose(); return; } eng.current = e; setState('ready'); }).catch(() => { if (!dead) setState('failed'); });
    return () => { dead = true; eng.current?.dispose(); eng.current = null; }; }, [size, ball]);
  useEffect(() => { eng.current?.setPhoto(photo); }, [photo, state]);
  useEffect(() => { eng.current?.setRig(shown, act); }, [shown, act, state]);
  const anim = useRef(0); const glide = useRef(0); useEffect(() => () => { glide.current++; cancelAnimationFrame(anim.current); }, []);

  const commit = (r: LightRig, meta?: { preset?: SpherePreset }) => { const x = round(r); setShown(x); onChange(x, meta); };
  const setLight = (w: Which, patch: Partial<RigLight>, opts?: { dropPreset?: boolean }) => { glide.current++; busy.current = false; const s = shownRef.current; const l = w === 'rim' ? s.rim : s.key; if (!l) return;
    const next = { ...l, ...patch }; if ('color' in patch && !patch.color) delete next.color;
    const { preset, ...rest } = s; commit({ ...(opts?.dropPreset ? rest : s), [w]: next }); };

  /* ---- drag: grab a handle (or anywhere: the active light) and move it over the sphere; a click without a drag jumps it there ---- */
  const drag = useRef<{ x: number; y: number; moved: boolean; which: Which; grabbed: boolean } | null>(null);
  const at = (e: React.PointerEvent) => { const b = canvas.current!.getBoundingClientRect(); return { x: ((e.clientX - b.left) / b.width) * size, y: ((e.clientY - b.top) / b.height) * size }; };
  const down = (e: React.PointerEvent) => { if (e.button !== 0) return; glide.current++; cancelAnimationFrame(anim.current); const p = at(e); const hit = eng.current?.pick(p.x, p.y) ?? null; const which = hit ?? act;
    setActive(which); setTab(which); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { ...p, moved: false, which, grabbed: !!hit }; busy.current = true; e.preventDefault(); };
  const move = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; const p = at(e); const dx = p.x - d.x, dy = p.y - d.y; if (!d.moved && Math.hypot(dx, dy) < 3) return;
    d.moved = true; d.x = p.x; d.y = p.y; const s = shownRef.current; const l = d.which === 'rim' ? s.rim : s.key; if (!l) return;
    const k = 0.55; setShown({ ...s, [d.which]: { ...l, az: wrapAz(l.az + dx * k), el: clamp(l.el - dy * k, -89, 89) } }); };
  const up = (e: React.PointerEvent) => { const d = drag.current; drag.current = null; busy.current = false; if (!d) return;
    if (!d.moved && !d.grabbed) { const p = at(e); const h = eng.current?.hitSphere(p.x, p.y); if (h) { setLight(d.which, { az: h.az, el: clamp(h.el, -89, 89) }); return; } }
    if (d.moved) commit(shownRef.current); };

  /* ---- keyboard: arrows move the active light (Shift ×3, Alt 1°), K / R pick the light, Home = straight on ---- */
  const keys = (e: React.KeyboardEvent) => {
    const s = shownRef.current; const l = act === 'rim' ? s.rim : s.key; if (!l) return; const st = e.shiftKey ? 15 : e.altKey ? 1 : 5;
    const m: Record<string, [number, number]> = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] };
    if (m[e.key]) { e.preventDefault(); e.stopPropagation(); setLight(act, { az: wrapAz(l.az + m[e.key][0]), el: clamp(l.el + m[e.key][1], -89, 89) }); return; }
    if (e.key === 'Home') { e.preventDefault(); setLight(act, { az: 0, el: 0 }); return; }
    if ((e.key === 'k' || e.key === 'K') && !e.metaKey && !e.ctrlKey) { setActive('key'); setTab('key'); return; }
    if ((e.key === 'r' || e.key === 'R') && s.rim && !e.metaKey && !e.ctrlKey) { setActive('rim'); setTab('rim'); }
  };

  /* ---- presets glide the lights into place (reduced motion: they jump) ---- */
  const pick = (p: SpherePreset) => { glide.current++; cancelAnimationFrame(anim.current); const to: LightRig = { ...structuredClone(p.rig), preset: p.id };
    setActive('key'); setTab('key');
    if (reduced()) { busy.current = false; commit(to, { preset: p }); return; }
    const from = shownRef.current; const t0 = performance.now(); busy.current = true; const run = ++glide.current;
    const land = () => { if (glide.current !== run || !busy.current) return; cancelAnimationFrame(anim.current); busy.current = false; commit(to, { preset: p }); };
    const step = (now: number) => { if (glide.current !== run) return; const k = Math.min(1, (now - t0) / 560); if (k < 1) { setShown(lerpRig(from, to, ease(k))); anim.current = requestAnimationFrame(step); } else land(); };
    anim.current = requestAnimationFrame(step); setTimeout(land, 700); /* a hidden tab pauses frames: land anyway */ };

  const L = tab === 'rim' ? shown.rim : shown.key; const lc = (l: RigLight) => css(lightRgb(l));
  const addRim = () => { const s = shownRef.current; commit({ ...s, rim: { az: s.key.az <= 0 ? 150 : -150, el: 20, kelvin: 6500, intensity: 60, softness: 30 } }); setActive('rim'); setTab('rim'); };
  const dropRim = () => { const { rim: _r, ...s } = shownRef.current; commit(s); setActive('key'); setTab('key'); };
  const hudL = act === 'rim' && shown.rim ? shown.rim : shown.key;

  const stage = <div className={`ls-stage ls-${state}${ball ? ' ls-ball' : ''}`} style={{ width: size, height: size } as CSSProperties} tabIndex={0} role="group" aria-roledescription="light sphere"
    aria-label={ball ? `${label ?? ''} Drag the light around the ball, or use the arrow keys${shown.rim ? '. K and R pick the light' : ''}.`.trim() : `Light sphere. ${lightReadout(hudL, act === 'rim' ? 'Rim' : 'Key')}. Arrow keys move the light, Shift for bigger steps, K and R pick the light.`}
    data-testid={`${testId}-stage`} onKeyDown={keys}>
    <canvas ref={canvas} width={size} height={size} style={{ width: size, height: size }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-testid={`${testId}-canvas`} />
    {!ball && <><span className="ls-hud" aria-hidden><b>{act === 'rim' ? 'RIM' : 'KEY'}</b> AZ <em>{signed(Math.round(wrapAz(hudL.az)))}</em> EL <em>{signed(Math.round(hudL.el))}</em></span>
      <span className="ls-ax ls-ax-t" aria-hidden>TOP</span><span className="ls-ax ls-ax-b" aria-hidden>BELOW</span><span className="ls-ax ls-ax-l" aria-hidden>L</span><span className="ls-ax ls-ax-r" aria-hidden>R</span></>}
    {state !== 'ready' && <span className="ls-wait" aria-hidden>{state === 'failed' ? (ball ? '3D view unavailable · use the arrows' : '3D view unavailable · use the arrows and sliders') : ball ? 'Loading…' : 'Loading 3D…'}</span>}
  </div>;
  if (ball) return <div className={`ls ls-v-ball ${className}`.trim()} data-testid={testId}>{stage}</div>;

  return <div className={`ls ${className}`.trim()} data-testid={testId}>
    <div className="ls-presets" role="group" aria-label="Light presets" data-testid={`${testId}-presets`}>
      {presets.map((p) => { const on = shown.preset === p.id; const c = lightRgb(p.rig.key); const rc = p.rig.rim ? lightRgb(p.rig.rim) : null;
        return <button key={p.id} type="button" className={`ls-preset${on ? ' on' : ''}`} aria-pressed={on} data-testid={`${testId}-preset-${p.id}`} onClick={() => pick(p)}>
          <i aria-hidden style={{ background: rc ? `linear-gradient(135deg,${css(c)} 0 50%,${css(rc)} 50%)` : css(c) }} />{p.label}</button>; })}
    </div>
    <div className="ls-main">
      <div className="ls-left">
        {stage}
        <div className="ls-read" aria-live="polite" data-testid={`${testId}-readout`}>
          <p className={act === 'key' ? 'on' : ''}><i style={{ background: lc(shown.key) }} />{lightReadout(shown.key, 'Key')}</p>
          {shown.rim && <p className={act === 'rim' ? 'on' : ''}><i style={{ background: lc(shown.rim) }} />{lightReadout(shown.rim, 'Rim').replace(/ · (soft|hard) \d+%$/, '')} · {Math.round(shown.rim.intensity)}%</p>}
          <p className="ls-amb"><i />Ambient · {Math.round(shown.ambient)}%</p>
        </div>
      </div>
      <div className="ls-ctl">
        <div className="ls-tabs" role="tablist" aria-label="Which light">
          {(['key', 'rim'] as Which[]).map((w) => <button key={w} type="button" role="tab" aria-selected={tab === w} className={tab === w ? 'on' : ''} data-testid={`${testId}-tab-${w}`}
            onClick={() => { setTab(w); if (w === 'key' || shown.rim) setActive(w); }}>{w === 'key' ? 'Key light' : 'Rim light'}{w === 'rim' && !shown.rim && <small>off</small>}</button>)}
        </div>
        {tab === 'rim' && !shown.rim ? <div className="ls-empty"><p>A second light behind the subject draws a bright edge around the hair and shoulders.</p>
          <button type="button" className="ls-btn" data-testid={`${testId}-add-rim`} onClick={addRim}>Add rim light</button></div>
          : L && <>
            <Range label="Temperature" value={L.kelvin} min={KELVIN_MIN} max={KELVIN_MAX} step={100} track={TEMP_TRACK} dim={!!L.color} testId={`${testId}-kelvin`}
              text={L.color ? 'off · colour' : `${Math.round(L.kelvin / 100) * 100}K`} ends={['Warm', 'Cool']} onInput={(v) => setLight(tab, { kelvin: v, color: undefined }, { dropPreset: true })} />
            <div className="ls-row">
              <div className="ls-h"><span>Colour</span><em>{L.color ?? 'from temperature'}</em></div>
              <div className="ls-sw" role="radiogroup" aria-label="Light colour">
                <button type="button" role="radio" aria-checked={!L.color} className={`ls-sw-k${!L.color ? ' on' : ''}`} style={{ background: css(kelvinRgb(L.kelvin)) }} aria-label="Use the colour temperature" title="Use the colour temperature" onClick={() => setLight(tab, { color: undefined }, { dropPreset: true })}>K</button>
                {NEON.map((c) => <button key={c} type="button" role="radio" aria-checked={L.color === c} className={L.color === c ? 'on' : ''} style={{ background: c }} aria-label={`Colour ${c}`} title={c} onClick={() => setLight(tab, { color: c }, { dropPreset: true })} />)}
                <label className="ls-sw-any" title="Any colour"><input type="color" value={(L.color ?? rgbHex(kelvinRgb(L.kelvin))).toLowerCase()} aria-label="Pick any colour" data-testid={`${testId}-color`} onChange={(e) => setLight(tab, { color: e.target.value.toUpperCase() }, { dropPreset: true })} /></label>
              </div>
            </div>
            <Range label="Intensity" value={L.intensity} min={0} max={100} step={1} text={`${Math.round(L.intensity)}%`} testId={`${testId}-intensity`} onInput={(v) => setLight(tab, { intensity: v })} />
            {tab === 'key' && <Range label="Softness" value={L.softness} min={0} max={100} step={1} text={`${L.softness >= 50 ? 'soft' : 'hard'} ${Math.round(L.softness)}%`} ends={['Hard', 'Soft']} testId={`${testId}-softness`} onInput={(v) => setLight('key', { softness: v })} />}
            {tab === 'rim' && <button type="button" className="ls-btn ls-btn-q" data-testid={`${testId}-drop-rim`} onClick={dropRim}>Remove rim light</button>}
          </>}
        <div className="ls-sep" />
        <Range label="Ambient" value={shown.ambient} min={0} max={100} step={1} text={`${Math.round(shown.ambient)}%`} ends={['Low-key', 'High-key']} testId={`${testId}-ambient`} onInput={(v) => commit({ ...shownRef.current, ambient: v })} />
        <p className="ls-tip">Drag a light on the sphere, or focus it and use the arrows.</p>
      </div>
    </div>
  </div>;
}

export function Range({ label, value, min, max, step, text, onInput, track, ends, dim, testId }: { label: string; value: number; min: number; max: number; step: number; text: string; onInput: (v: number) => void;
  track?: string; ends?: [string, string]; dim?: boolean; testId?: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return <label className={`ls-row ls-range-w${dim ? ' dim' : ''}`}>
    <span className="ls-h"><span>{label}</span><em data-testid={testId ? `${testId}-value` : undefined}>{text}</em></span>
    <input type="range" className="ls-range" min={min} max={max} step={step} value={Math.round(value)} data-testid={testId} aria-valuetext={text}
      style={{ ['--ls-track' as any]: track ?? `linear-gradient(90deg,rgba(255,255,255,.55) 0 ${pct}%,rgba(255,255,255,.12) ${pct}% 100%)` }} onChange={(e) => onInput(Number(e.target.value))} />
    {ends && <span className="ls-ends" aria-hidden><span>{ends[0]}</span><span>{ends[1]}</span></span>}
  </label>;
}
