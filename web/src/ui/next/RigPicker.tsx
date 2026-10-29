/* Camera & Lens rig picker: the one compact panel for the Camera chip (and its ⋯ fold). A rail of sections (Camera, Lens, Focal length,
 * Aperture, Film, Lighting, Era), each showing its current pick, and one section's chips at a time; search finds across all of them.
 * Lists and the camera sentence come from shared/imageFeatures (cameraLens.ts), the same code the server uses, so the footer line is
 * exactly what is added to the prompt. The swatches and lens icons are our own small drawings (visual hints only; nothing is sent). */
import { useId, useState, type ReactNode } from 'react';
import { CAMERA_BODIES, LENSES, FILM_STOCKS, LIGHTING, ERAS, FOCAL_LENGTHS, APERTURES, FILM_STYLER_NODE, RIG_DEFAULT, rigSentence, type Rig, type RigOption } from '../../shared/imageFeatures';
import { tip } from '../../shared/Tooltip';
import './rigPicker.css';

type Key = keyof Rig;
type Item = { v: string; label: string; hint?: string; phrase?: string; group?: string; icon?: ReactNode };
type Sec = { k: Key; h: string; items: Item[]; optional?: boolean };
const opts = (l: RigOption[], icon?: (id: string) => ReactNode): Item[] => l.map(o => ({ v: o.id, label: o.label, hint: o.hint, phrase: o.phrase, group: o.group, icon: icon?.(o.id) }));
const SECS: Sec[] = [
  { k: 'body', h: 'Camera', items: opts(CAMERA_BODIES) },
  { k: 'lens', h: 'Lens', items: opts(LENSES) },
  { k: 'focal', h: 'Focal length', items: FOCAL_LENGTHS.map(f => ({ v: String(f), label: `${f} mm`, icon: <FovIcon mm={f} /> })) },
  { k: 'aperture', h: 'Aperture', items: APERTURES.map(a => ({ v: a, label: `f/${a}`, icon: <IrisIcon f={Number(a)} /> })) },
  { k: 'film', h: 'Film stock', items: opts(FILM_STOCKS), optional: true },
  { k: 'lighting', h: 'Lighting', items: opts(LIGHTING, id => <LightSwatch id={id} />), optional: true },
  { k: 'era', h: 'Era', items: opts(ERAS, id => <EraSwatch id={id} />), optional: true },
];
const DEF: Rig = { ...RIG_DEFAULT };
const val = (r: Rig, k: Key) => String(r[k] ?? '');
const pickLabel = (s: Sec, r: Rig) => s.items.find(i => i.v === val(r, s.k))?.label ?? 'None';
/** True when the rig differs from the default (the chip's ⋯ dot, Reset). */
export const rigIsSet = (r: Rig) => (Object.keys(DEF) as Key[]).some(k => val(r, k) !== val(DEF, k));

export default function RigPicker({ rig, setRig }: { rig: Rig; setRig: (f: (r: Rig) => Rig) => void }) {
  const [tab, setTab] = useState<Key>('lighting'); const [q, setQ] = useState(''); const t = q.trim().toLowerCase(); const uid = useId();
  const set = (k: Key, v: string) => setRig(r => ({ ...r, [k]: k === 'focal' ? Number(v) : v }));
  const chip = (s: Sec, i: Item | null) => { const v = i?.v ?? ''; const on = val(rig, s.k) === v;
    return <button key={v || 'none'} type="button" role="radio" aria-checked={on} className={`rg-chip${on ? ' on' : ''}${i?.icon ? ' has-ic' : ''}`} data-testid={`rig-${s.k}-${v || 'none'}`}
      {...tip(i ? [i.hint, i.phrase && `Adds “${i.phrase}”`].filter(Boolean).join(' · ') || null : 'Nothing added')} onClick={() => set(s.k, v)}>{i?.icon}<span>{i?.label ?? 'None'}</span></button>; };
  /** a section's chips, split by group when it has several (Cinema / Film / Stills…) */
  const body = (s: Sec, items: Item[], none: boolean) => { const groups = [...new Set(items.map(i => i.group ?? ''))];
    return groups.map((g, n) => <div key={g || n} className="rg-grp">{groups.length > 1 && g && <span className="rg-gh">{g}</span>}
      <div className="rg-chips" role="radiogroup" aria-label={g ? `${s.h}: ${g}` : s.h}>{none && n === 0 && chip(s, null)}{items.filter(i => (i.group ?? '') === g).map(i => chip(s, i))}</div></div>); };
  const hits = t ? SECS.map(s => ({ s, xs: s.items.filter(i => [i.label, i.hint ?? '', i.group ?? '', s.h].some(x => x.toLowerCase().includes(t))) })).filter(x => x.xs.length) : [];
  const cur = SECS.find(s => s.k === tab)!; const setAny = rigIsSet(rig);
  return <div className="rg" data-testid="ic-rig-panel">
    <div className="rg-top">
      <input className="rg-q" type="search" placeholder="Search cameras, lenses, film, light…" aria-label="Search camera options" value={q} onChange={e => setQ(e.target.value)} />
      <button type="button" className="rg-reset" disabled={!setAny} data-testid="rig-reset" {...tip(setAny ? 'Back to the default camera, no film, lighting or era' : null)} onClick={() => setRig(() => ({ ...DEF }))}>Reset</button>
    </div>
    <div className="rg-main">
      <div className="rg-rail" role="tablist" aria-orientation="vertical" aria-label="Camera settings">{SECS.map(s => { const p = pickLabel(s, rig); const changed = val(rig, s.k) !== val(DEF, s.k);
        return <button key={s.k} type="button" role="tab" id={`${uid}-${s.k}`} aria-selected={!t && tab === s.k} aria-label={`${s.h}: ${p}`} className={`rg-tab${!t && tab === s.k ? ' on' : ''}${changed ? ' set' : ''}`} data-testid={`rig-tab-${s.k}`}
          onClick={() => { setQ(''); setTab(s.k); }}><span>{s.h}</span><b>{p}</b></button>; })}</div>
      <div className="rg-pane" role="tabpanel" aria-labelledby={t ? undefined : `${uid}-${tab}`} data-testid="rig-pane">
        {t ? (hits.length ? hits.map(({ s, xs }) => <div key={s.k} className="rg-hit"><span className="rg-sh">{s.h}</span>{body(s, xs, false)}</div>) : <p className="rg-empty">Nothing matches “{q.trim()}”.</p>)
          : body(cur, cur.items, !!cur.optional)}
      </div>
    </div>
    <p className="rg-foot" {...tip(`Adds to your prompt: “${rigSentence(rig)}”`)}><span>Adds</span> “{rigSentence(rig)}”</p>
    <p className="rg-note" data-testid="rig-community">Words, not a lens simulation: results vary by model. Same looks in ComfyUI: <a href={FILM_STYLER_NODE.repo} target="_blank" rel="noreferrer noopener" {...tip(`${FILM_STYLER_NODE.credit}. ${FILM_STYLER_NODE.note}`)}>{FILM_STYLER_NODE.name}</a></p>
  </div>;
}

/* ---------------- visual hints (our own drawings) ---------------- */
/** Each light as a lit ball: colour, where the light comes from (x, y in −1…1), and how hard it is. */
const LIGHT: Record<string, { c: string; x: number; y: number; hard?: number; kind?: 'rim' | 'sil' | 'neon' | 'flat' }> = {
  daylight: { c: '#fff3dc', x: -.4, y: -.5 }, 'golden-hour': { c: '#ffaa45', x: -.85, y: -.1 }, 'blue-hour': { c: '#86a8ff', x: 0, y: -.6, kind: 'flat' },
  overcast: { c: '#d8dce2', x: 0, y: -.3, kind: 'flat' }, 'hard-noon': { c: '#fffbe6', x: 0, y: -.9, hard: 1 }, window: { c: '#e6eefa', x: -.95, y: -.1 },
  rembrandt: { c: '#ffe0b3', x: -.6, y: -.6, hard: .6 }, butterfly: { c: '#fff0dc', x: 0, y: -.85 }, split: { c: '#f4f4f4', x: -1, y: 0, hard: 1 },
  rim: { c: '#ffd59a', x: 0, y: 0, kind: 'rim' }, silhouette: { c: '#f7e7c9', x: 0, y: 0, kind: 'sil' }, neon: { c: '#ff3fb4', x: 0, y: 0, kind: 'neon' },
  candle: { c: '#ff9535', x: .25, y: .75 }, tungsten: { c: '#ffb766', x: -.45, y: -.45 }, fluorescent: { c: '#d6f5cf', x: 0, y: -1, kind: 'flat' },
  flash: { c: '#ffffff', x: 0, y: 0, hard: 1 }, softbox: { c: '#ffffff', x: -.5, y: -.5 }, moonlight: { c: '#9ab6ff', x: .6, y: -.6, hard: .4 },
};
export function LightSwatch({ id }: { id: string }) {
  const l = LIGHT[id]; const g = `rgl${useId().replace(/:/g, '')}`; if (!l) return null;
  const fx = 50 + l.x * 32, fy = 50 + l.y * 32, mid = l.kind === 'flat' ? 85 : 38 - (l.hard ?? 0) * 14;
  return <svg className="rg-ic" width="18" height="18" viewBox="0 0 18 18" aria-hidden>
    <defs>{l.kind === 'neon' ? <linearGradient id={g} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ff3fb4" /><stop offset=".5" stopColor="#2a1a33" /><stop offset="1" stopColor="#2fd8ff" /></linearGradient>
      : <radialGradient id={g} cx={`${fx}%`} cy={`${fy}%`} fx={`${fx}%`} fy={`${fy}%`} r={l.kind === 'flat' ? '90%' : '75%'}><stop offset="0" stopColor={l.c} /><stop offset={`${mid}%`} stopColor={l.c} stopOpacity={l.kind === 'flat' ? .75 : .55} /><stop offset="100%" stopColor="#141518" /></radialGradient>}</defs>
    {l.kind === 'sil' ? <><rect width="18" height="18" rx="5" fill={l.c} /><circle cx="9" cy="9" r="5.5" fill="#141518" /></>
      : l.kind === 'rim' ? <><circle cx="9" cy="9" r="7" fill="#141518" stroke={l.c} strokeWidth="1.6" /></>
      : <circle cx="9" cy="9" r="7.5" fill={`url(#${g})`} />}
  </svg>;
}
/** Each era as a small print: its tint, with grain for the film years. */
const ERA: Record<string, [string, string, number]> = {
  '1920s': ['#d8c29c', '#7a5a38', .55], '1950s': ['#d9c69a', '#6f8f88', .45], '1960s': ['#e7a95a', '#4f86b3', .4], '1970s': ['#e09a4a', '#7c5a2c', .45],
  '1980s': ['#ff5aa5', '#3f6fd8', .25], '1990s': ['#c9d6a8', '#b98d5a', .3], '2000s': ['#b9d2ec', '#7f97b0', 0], '2010s': ['#f4b27a', '#3e8e94', 0], today: ['#f2f4f7', '#a9b4c2', 0],
};
const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .9 0'/%3E%3C/filter%3E%3Crect width='40' height='40' filter='url(%23n)'/%3E%3C/svg%3E\")";
export function EraSwatch({ id }: { id: string }) {
  const e = ERA[id]; if (!e) return null; const [a, b, grain] = e;
  return <span className="rg-ic rg-era" aria-hidden style={{ backgroundImage: `${grain ? `${GRAIN},` : ''}linear-gradient(135deg,${a},${b})`, ['--grain' as any]: grain }} />;
}
/** Field of view on a full-frame camera (horizontal), drawn as a wedge from the camera. */
export function FovIcon({ mm }: { mm: number }) {
  const deg = Math.min(150, 2 * Math.atan(18 / mm) * 180 / Math.PI); const a = deg / 2 * Math.PI / 180, R = 13, cx = 9, cy = 16;
  const x1 = cx - R * Math.sin(a), y1 = cy - R * Math.cos(a), x2 = cx + R * Math.sin(a), y2 = y1; const f = (n: number) => n.toFixed(2);
  return <svg className="rg-ic" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
    <path d={`M${cx} ${cy}L${f(x1)} ${f(y1)}A${R} ${R} 0 0 1 ${f(x2)} ${f(y2)}Z`} fill="currentColor" fillOpacity=".22" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
  </svg>;
}
/** The iris: a wider opening for a faster lens (f/0.95 open, f/16 a pinhole). */
export function IrisIcon({ f }: { f: number }) {
  const r = Math.max(1.4, 6.4 * Math.sqrt(0.95 / f));
  return <svg className="rg-ic" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden><circle cx="9" cy="9" r="7.4" stroke="currentColor" strokeWidth="1.1" /><circle cx="9" cy="9" r={r.toFixed(2)} fill="currentColor" fillOpacity=".85" /></svg>;
}
