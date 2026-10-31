/**
 * LightPanel (2026-10-25, second pass): Relight's light panel, read top to bottom in two steps, inside one frame that never changes size.
 * 1 Pick a look: all ten looks as small cards in a 5 × 2 grid (each a sketch of that light on the user's photo), with Reset back to the look.
 * 2 Adjust: the user's photo is the direction control (drag the glow, or the arrow keys on it). The light snaps to 26 fixed positions
 *   (2026-10-31, shared/lightRig.ts lightCell), shown as guide dots while you move it, and the header names the position in the same words
 *   the prompt uses. Beside it, two tabs share one fixed box: "Light" (six quick picks, Strength, Soft / Hard, Colour swatches) and
 *   "More options" (Key / + Rim light, warmth = warm ↔ cool, rim brightness, background). The old 3D ball is gone: the drag-on-photo preview already reaches every angle (front and behind)
 *   on the user's own picture, and a second control for the same thing made the panel harder to read.
 * Shared, no page logic: it edits a plain `LightRig` (server/src/shared/lightRig.ts) through the plain-words layer (lightEasy.ts) and calls
 * onChange; the page decides what the rig does. The preview is CSS over the photo: instant, free, and labelled approximate.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { SPHERE_PRESETS, DEFAULT_RIG, KELVIN_MIN, KELVIN_MAX, LIGHT_STEP, kelvinRgb, lightRgb, rgbHex, snapAngles, wrapAz, colourName, type LightRig, type RigLight, type SpherePreset } from '../../../server/src/shared/lightRig';
import { DIRECTIONS, STRENGTHS, QUALITIES, directionOf, withDirection, plainDir, degTip, strengthOf, withStrength, qualityOf, withQuality, presetEdited, ambientPlain, warmthPlain,
  handleOf, anglesOfPoint, gridPoints, sketchOf, type DirId, type StrengthId, type QualityId } from '../../../server/src/shared/lightEasy';
import { Segmented } from './BarPop';
import { PresetTile } from './PresetTile';
import { Range } from './LightSphere';
import { tip } from './Tooltip';
import './lookPicker.css'; /* the shared .lk-tabs */
import './lightPanel.css';

type Which = 'key' | 'rim';
const NEON = ['#FFB347', '#FF3B5C', '#E05AD8', '#8A5CFF', '#33D6FF', '#7CFF6B'];
const css = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const TEMP_TRACK = `linear-gradient(90deg,${[2000, 3000, 4000, 5500, 7000, 10000].map((k, i, a) => `${css(kelvinRgb(k))} ${(i / (a.length - 1)) * 100}%`).join(',')})`;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** No photo yet: a quiet head-and-shoulders figure (our own drawing) so the looks and the preview still show the light. */
export const LIGHT_SAMPLE = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3c41"/><stop offset="1" stop-color="#202125"/></linearGradient><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9c3bb"/><stop offset="1" stop-color="#8d8882"/></linearGradient></defs><rect width="200" height="240" fill="url(#b)"/><g fill="url(#f)"><ellipse cx="100" cy="92" rx="36" ry="44"/><rect x="86" y="128" width="28" height="30"/><path d="M28 240c3-60 34-86 72-88 38 2 69 28 72 88z"/></g></svg>`)}`;

/** The light sketched over a photo (CSS layers; a transparent photo keeps its see-through parts clean). */
export function LightSketch({ rig, photo, className = '', children, onLoad }: { rig: LightRig; photo?: string | null; className?: string; children?: ReactNode; onLoad?: (w: number, h: number) => void }) {
  const src = photo || LIGHT_SAMPLE; const sk = useMemo(() => sketchOf(rig), [JSON.stringify(rig)]); // eslint-disable-line react-hooks/exhaustive-deps
  const mask = `url("${src}")`;
  return <span className={`lsk ${className}`.trim()} aria-hidden={children ? undefined : true}>
    <img src={src} alt="" draggable={false} style={{ filter: sk.filter }} onLoad={(e) => onLoad?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} />
    {sk.layers.map((l, i) => <i key={i} className="lsk-l" style={{ background: l.bg, mixBlendMode: l.blend, opacity: l.opacity, WebkitMaskImage: mask, maskImage: mask } as CSSProperties} />)}
    {children}
  </span>;
}

export interface LightPanelProps {
  value: LightRig;
  /** every change; `preset` when a look was picked */ onChange: (rig: LightRig, meta?: { preset?: SpherePreset }) => void;
  photo?: string | null; testId?: string;
}

const TAB_KEY = 'ohf:light-more';
type Tab = 'light' | 'more';
export function LightPanel({ value: rig, onChange, photo = null, testId = 'light-panel' }: LightPanelProps) {
  const [act0, setAct] = useState<Which>('key'); const act: Which = act0 === 'rim' && !rig.rim ? 'key' : act0; const L = (act === 'rim' ? rig.rim : rig.key) ?? rig.key;
  const [tab, setTab0] = useState<Tab>(() => { try { return localStorage.getItem(TAB_KEY) === '1' ? 'more' : 'light'; } catch { return 'light'; } });
  const setTab = (t: Tab) => { setTab0(t); try { localStorage.setItem(TAB_KEY, t === 'more' ? '1' : '0'); } catch { /* private window */ } };
  const [ar, setAr] = useState(4 / 5);
  useEffect(() => { if (!photo) setAr(5 / 6); }, [photo]);

  const commit = (r: LightRig, meta?: { preset?: SpherePreset }) => onChange(r, meta);
  /** change the active light; a colour change leaves the look behind (the look's colour no longer holds) */
  const setLight = (patch: Partial<RigLight>, opts?: { dropPreset?: boolean }) => { const next: RigLight = { ...L, ...patch }; if ('color' in patch && !patch.color) delete next.color;
    const { preset: _p, ...rest } = rig; commit({ ...(opts?.dropPreset ? rest : rig), [act]: next }); };
  const pick = (p: SpherePreset) => { setAct('key'); commit({ ...structuredClone(p.rig), preset: p.id }, { preset: p }); };
  const addRim = () => { commit({ ...rig, rim: { az: rig.key.az <= 0 ? 135 : -135, el: 0, kelvin: 6500, intensity: 60, softness: 30 } }); setAct('rim'); };
  const dropRim = () => { const { rim: _r, ...r } = rig; commit(r); setAct('key'); };

  const edited = presetEdited(rig); const pr = SPHERE_PRESETS.find((p) => p.id === rig.preset);
  const who = act === 'rim' ? 'Rim light' : 'Light';
  /* Reset: back to the picked look as it comes, or to the default light when the light is your own */
  const canReset = pr ? edited : JSON.stringify([rig.key, rig.rim ?? null, rig.ambient]) !== JSON.stringify([DEFAULT_RIG.key, null, DEFAULT_RIG.ambient]);
  const reset = () => { setAct('key'); if (pr) pick(pr); else commit(structuredClone(DEFAULT_RIG)); };

  /* ---- the preview: drag the glow (or click to drop it there); it snaps to the nearest fixed position, shown as guide dots; arrows step one position ---- */
  const box = useRef<HTMLDivElement>(null); const drag = useRef<{ behind: boolean } | null>(null); const [live, setLive] = useState<LightRig | null>(null); const shown = live ?? rig;
  const shownL = (act === 'rim' ? shown.rim : shown.key) ?? shown.key; const h = handleOf(shownL.az, shownL.el);
  /* the header and the quick picks follow the light as it moves (live while dragging) */ const dir = directionOf(shownL.az, shownL.el); const words = plainDir(shownL.az, shownL.el);
  const at = (e: React.PointerEvent, behind: boolean) => { const b = box.current!.getBoundingClientRect(); const a = anglesOfPoint((e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height, behind); return { ...rig, [act]: { ...L, ...a } } as LightRig; };
  const down = (e: React.PointerEvent) => { if (e.button !== 0 || (e.target as HTMLElement).closest('.lp-which')) return; e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const behind = Math.abs(wrapAz(L.az)) > 90; drag.current = { behind }; setLive(at(e, behind));
    (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.lp-handle')?.focus({ preventScroll: true }); };
  const move = (e: React.PointerEvent) => { if (drag.current) setLive(at(e, drag.current.behind)); };
  const up = () => { const d = drag.current; drag.current = null; if (d && live) commit(live); setLive(null); };
  const keys = (e: React.KeyboardEvent) => {
    /* one fixed position per press: left / right go round the subject (past the side to behind), up / down through high, level, low and the poles */
    const st = LIGHT_STEP; const cur = snapAngles(L.az, L.el);
    const m: Record<string, [number, number]> = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] };
    if (m[e.key]) { e.preventDefault(); e.stopPropagation(); if (Math.abs(cur.el) === 90 && m[e.key][0]) return; /* straight above / below: no sides */
      setLight(snapAngles(cur.az + m[e.key][0], clamp(cur.el + m[e.key][1], -90, 90))); }
    else if (e.key === 'Home') { e.preventDefault(); setLight(withDirection(L, 'front')); }
  };
  const tabRow = useRef<HTMLDivElement>(null);
  const tabKeys = (e: React.KeyboardEvent) => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); e.stopPropagation(); const n: Tab = tab === 'light' ? 'more' : 'light'; setTab(n);
    requestAnimationFrame(() => tabRow.current?.querySelector<HTMLElement>(`[data-tab="${n}"]`)?.focus()); };
  /* the preview keeps one height; its width follows the photo's shape (portrait to square) */
  const pw = Math.round(clamp(ar, 0.72, 1) * 236);

  return <div className="lp" data-testid={testId}>
    <div className="lp-step"><b className="lp-n" aria-hidden>1</b><h3 className="lp-step-t" id={`${testId}-s1`}>Pick a look</h3>
      <span className="lp-look" data-testid={`${testId}-look`}>{pr ? <>{pr.label}{edited && <em className="lp-edited" data-testid={`${testId}-edited`}>edited</em>}</> : <span className="lp-dim">Your own</span>}</span>
      <button type="button" className="lp-reset" disabled={!canReset} data-testid={`${testId}-reset`} onClick={reset} aria-label={pr ? `Reset to ${pr.label} as it comes` : 'Reset to the default light'} {...tip(pr ? `Back to ${pr.label} as it comes` : 'Back to the default light')}>
        <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden><path d="M3.3 6.3A5 5 0 1 1 3 9.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M2.7 2.9v3.6h3.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>Reset</button></div>
    <div className="lp-looks" role="group" aria-labelledby={`${testId}-s1`} data-testid={`${testId}-presets`}>
      {SPHERE_PRESETS.map((p) => <PresetTile key={p.id} size="compact" className="lp-tile" label={p.label} selected={rig.preset === p.id} testId={`${testId}-preset-${p.id}`}
        title={`${p.label}: ${plainDir(p.rig.key.az, p.rig.key.el).toLowerCase()}${p.rig.rim ? ', with a rim light' : ''}`} onClick={() => pick(p)}
        media={<LightSketch rig={p.rig} photo={photo} />} />)}
    </div>

    <div className="lp-step lp-step2"><b className="lp-n" aria-hidden>2</b><h3 className="lp-step-t">Adjust the light</h3>
      <div ref={tabRow} className="lk-tabs lp-tabs" role="tablist" aria-label="Light settings" onKeyDown={tabKeys}>
        {(['light', 'more'] as Tab[]).map((t) => <button key={t} type="button" role="tab" data-tab={t} id={`${testId}-tab-${t}`} aria-selected={tab === t} aria-controls={`${testId}-pane`} tabIndex={tab === t ? 0 : -1}
          className={tab === t ? 'on' : ''} data-testid={t === 'more' ? `${testId}-more-toggle` : `${testId}-basics-tab`} onClick={() => setTab(t)}>{t === 'light' ? 'Light' : 'More options'}</button>)}
      </div></div>
    <div className="lp-adj">
      <div className="lp-prev-w">
        <div className="lp-prev" ref={box} style={{ ['--lp-w' as any]: `${pw}px` }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-testid={`${testId}-preview`}>
          <LightSketch rig={shown} photo={photo} onLoad={(w, hh) => w && hh && setAr(w / hh)}>
            <span className={`lp-grid${live ? ' on' : ''}`} aria-hidden data-testid={`${testId}-grid`}>{gridPoints(h.behind).map((g) => <i key={g.id} style={{ left: `${g.x * 100}%`, top: `${g.y * 100}%` }} />)}</span>
            {shown.rim && (() => { const o = act === 'key' ? shown.rim : shown.key; const r = handleOf(o.az, o.el); return <span className={`lp-dot${r.behind ? ' lp-behind' : ''}`} style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, ['--lp-c' as any]: css(lightRgb(o)) }} aria-hidden />; })()}
            <span className={`lp-handle${h.behind ? ' lp-behind' : ''}${live ? ' lp-drag' : ''}`} style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%`, ['--lp-c' as any]: css(lightRgb(shownL)) }}
              tabIndex={0} role="slider" aria-label={`${who} position on your photo. Drag it, or use the arrow keys to step to the next spot`} aria-valuetext={`${plainDir(shownL.az, shownL.el)} (${degTip(shownL.az, shownL.el)})`}
              aria-valuemin={-180} aria-valuemax={180} aria-valuenow={Math.round(wrapAz(shownL.az))} data-testid={`${testId}-handle`} onKeyDown={keys} />
          </LightSketch>
          {rig.rim && <span className="lp-which" role="group" aria-label="Which light you move">
            {(['key', 'rim'] as Which[]).map((w) => <button key={w} type="button" aria-pressed={act === w} className={act === w ? 'on' : ''} data-testid={`${testId}-move-${w}`} onClick={() => setAct(w)}>
              <i style={{ background: css(lightRgb(w === 'rim' ? rig.rim! : rig.key)) }} />{w === 'key' ? 'Key' : 'Rim'}</button>)}</span>}
          <span className="lp-tag" aria-hidden>Preview (approximate)</span>
        </div>
        <p className="lp-hint" data-testid={`${testId}-hint`}>Drag the glow to move the {act === 'rim' ? 'rim light' : 'light'}</p>
      </div>

      <div className="lp-pane" id={`${testId}-pane`} role="tabpanel" aria-labelledby={`${testId}-tab-${tab}`} data-testid={tab === 'more' ? `${testId}-more` : `${testId}-basics`}>
        {tab === 'light' ? <>
          <div className="lp-row"><div className="lp-h"><span>{act === 'rim' ? 'Rim light from' : 'Light from'}</span><em data-testid={`${testId}-words`} {...tip(degTip(L.az, L.el))}>{words}</em></div>
            <Segmented<DirId | ''> label={`${who} direction`} value={dir ?? ''} testId={`${testId}-dir`} className="lp-seg-sm" onChange={(d) => d && setLight(withDirection(L, d))}
              options={DIRECTIONS.map((d) => ({ value: d.id, label: d.label, testId: `${testId}-dir-${d.id}`, title: plainDir(d.az, d.el) }))} /></div>
          <div className="lp-row"><div className="lp-h"><span>Strength</span><em>{STRENGTHS.find((s) => s.id === strengthOf(rig))?.hint}</em></div>
            <Segmented<StrengthId> label="Strength" value={strengthOf(rig)} testId={`${testId}-strength`} className="lp-seg-sm" onChange={(s) => commit(withStrength(rig, s))}
              options={STRENGTHS.map((s) => ({ value: s.id, label: s.label, title: s.hint, testId: `${testId}-strength-${s.id}` }))} /></div>
          <div className="lp-row"><div className="lp-h"><span>Shadows</span><em>{QUALITIES.find((q) => q.id === qualityOf(rig.key))?.hint}</em></div>
            <Segmented<QualityId> label="Light quality" value={qualityOf(rig.key)} testId={`${testId}-quality`} className="lp-seg-sm" onChange={(q) => commit(withQuality(rig, q))}
              options={QUALITIES.map((q) => ({ value: q.id, label: q.label, title: q.hint, testId: `${testId}-quality-${q.id}` }))} /></div>
          <div className="lp-row"><div className="lp-h"><span>{act === 'rim' ? 'Rim colour' : 'Colour'}</span><em data-testid={`${testId}-colour-words`}>{L.color ? cap(colourName(L.color)) : warmthPlain(L)}</em></div>
            <div className="lp-sw" role="radiogroup" aria-label={`${who} colour`}>
              <button type="button" role="radio" aria-checked={!L.color} className={`lp-sw-n${!L.color ? ' on' : ''}`} style={{ background: css(kelvinRgb(L.kelvin)) }} data-testid={`${testId}-natural`} {...tip('Natural light: set it warmer or cooler in More options')} aria-label="Natural light (warmth in More options)" onClick={() => setLight({ color: undefined }, { dropPreset: true })} />
              {NEON.map((c) => <button key={c} type="button" role="radio" aria-checked={L.color === c} className={L.color === c ? 'on' : ''} style={{ background: c }} aria-label={cap(colourName(c))} {...tip(cap(colourName(c)))} onClick={() => setLight({ color: c }, { dropPreset: true })} />)}
              <label className={`lp-sw-any${L.color && !NEON.includes(L.color) ? ' on' : ''}`} {...tip('Any colour')}><input type="color" value={(L.color ?? rgbHex(kelvinRgb(L.kelvin))).toLowerCase()} aria-label="Pick any colour" data-testid={`${testId}-color`} onChange={(e) => setLight({ color: e.target.value.toUpperCase() }, { dropPreset: true })} /></label>
            </div>
          </div>
        </> : <>
          <div className="lp-row"><div className="lp-h"><span>Lights</span><em>{rig.rim ? 'Pick one to change it' : 'Add an edge light from behind'}</em></div>
            <div className="lp-lights" role="group" aria-label="Lights">
              <button type="button" className={`lp-lchip${act === 'key' ? ' on' : ''}`} aria-pressed={act === 'key'} data-testid={`${testId}-light-key`} onClick={() => setAct('key')}><i style={{ background: css(lightRgb(rig.key)) }} />Key light</button>
              {rig.rim ? <span className={`lp-lchip lp-lchip-x${act === 'rim' ? ' on' : ''}`}><button type="button" aria-pressed={act === 'rim'} data-testid={`${testId}-light-rim`} onClick={() => setAct('rim')}><i style={{ background: css(lightRgb(rig.rim)) }} />Rim light</button>
                <button type="button" className="lp-x" aria-label="Remove the rim light" data-testid={`${testId}-drop-rim`} onClick={dropRim}>×</button></span>
                : <button type="button" className="lp-lchip lp-add" data-testid={`${testId}-add-rim`} onClick={addRim} {...tip('A second light behind the subject draws a bright edge around hair and shoulders')}>+ Rim light</button>}
            </div></div>
          <div className="lp-row">
            <Range label={act === 'rim' ? 'Rim warmth' : 'Warmth'} value={L.kelvin} min={KELVIN_MIN} max={KELVIN_MAX} step={100} track={TEMP_TRACK} dim={!!L.color} testId={`${testId}-kelvin`}
              text={warmthPlain(L)} ends={['Warm', 'Cool']} onInput={(v) => setLight({ kelvin: v, color: undefined }, { dropPreset: true })} />
            {L.color && <p className="lp-note" data-testid={`${testId}-color-note`}>A colour is on. Pick the first colour dot on the Light tab to use warmth again.</p>}</div>
          {act === 'rim' && rig.rim && <div className="lp-row"><Range label="Rim brightness" value={rig.rim.intensity} min={0} max={100} step={1} text={rig.rim.intensity < 35 ? 'Faint' : rig.rim.intensity < 70 ? 'Clear' : 'Bright'} testId={`${testId}-rim-intensity`} onInput={(v) => setLight({ intensity: v })} /></div>}
          <div className="lp-row"><Range label="Background" value={rig.ambient} min={0} max={100} step={1} text={ambientPlain(rig.ambient)} ends={['Dark mood', 'Bright and airy']} testId={`${testId}-ambient`} onInput={(v) => commit({ ...rig, ambient: v })} /></div>
        </>}
      </div>
    </div>
  </div>;
}
