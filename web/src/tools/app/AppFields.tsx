/** Gallery app fields from the server (GET /api/tools → app.gallery.fields, mirrored in inputs[] with appField:true).
 *  One renderer per `control`: tiles, segmented, grid, slider, swatches, and pad (two number fields shown as one LightPad).
 *  Values go out as plain form fields with the same names. Option media: posterUrl/loopUrl when a real file exists; needsRealPoster keeps the placeholder sketch. */
import TileSketch, { hasSketch } from './TileSketch';
export type AppFieldOpt = { value: string; label: string; poster?: string | null; preview?: string | null; posterUrl?: string | null; loopUrl?: string | null; needsRealPoster?: boolean; tag?: string };
/** Real option media only: posterUrl/loopUrl from the server; needsRealPoster means none exists yet, so the honest placeholder stays. */
const mediaOf = (o: AppFieldOpt) => o.needsRealPoster ? { poster: null, loop: null } : { poster: o.posterUrl ?? o.poster ?? null, loop: o.loopUrl ?? o.preview ?? null };
const play = (e: React.SyntheticEvent<HTMLElement>, on: boolean) => { const v = e.currentTarget.querySelector('video'); if (!v) return; if (on) v.play().catch(() => 0); else { v.pause(); v.currentTime = 0; } };
export type AppField = { name: string; label?: string; kind?: string; control?: string; options?: AppFieldOpt[]; choices?: AppFieldOpt[]; default?: any; min?: number; max?: number; step?: number; help?: string; optional?: boolean };
export const appFieldsOf = (tool: any): AppField[] => {
  const g: AppField[] = Array.isArray(tool?.app?.gallery?.fields) ? tool.app.gallery.fields : [];
  const fromInputs: AppField[] = (tool?.inputs ?? []).filter((i: any) => i.appField).map((i: any) => ({ ...i, options: i.choices ?? (Array.isArray(i.options) && typeof i.options[0] === 'object' ? i.options : undefined) }));
  const byName = new Map<string, AppField>(); for (const f of [...fromInputs, ...g]) byName.set(f.name, { ...byName.get(f.name), ...f, options: f.options ?? (f as any).choices ?? byName.get(f.name)?.options });
  return [...byName.values()]; /* B21: 'pad' fields render as one LightPad */
};
export const appFieldDefaults = (fs: AppField[]): Record<string, string> => Object.fromEntries(fs.filter(f => f.default != null && f.default !== '').map(f => [f.name, String(f.default)]));
import LightPad from './LightPad';
const titleOf = (f: AppField) => f.label ?? f.name.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
/** extra: a last tile appended to a tiles field (UGC 'Use my own photo'); while it is active the field's own tiles show unchecked. */
export default function AppFields({ fields, values, onChange, extra }: { fields: AppField[]; values: Record<string, string>; onChange: (name: string, v: string) => void; extra?: Record<string, { node: React.ReactNode; active: boolean }> }) {
  if (!fields.length) return null;
  const pads = fields.filter(f => f.control === 'pad');
  /* picking a direction preset clears the pad position, so the direction is what's sent */
  const change = (name: string, v: string) => { onChange(name, v); if (name === 'direction' && pads.length === 2) pads.forEach(p => onChange(p.name, ''));
    /* Relight looks: a named look sets the light controls (still adjustable) */
    const sets = (fields.find(f => f.name === name)?.options?.find(o => o.value === v) as { sets?: Record<string, string> } | undefined)?.sets;
    if (sets && v !== 'custom') { pads.forEach(p => onChange(p.name, '')); for (const [k, x] of Object.entries(sets)) onChange(k, x); } };
  return <>{fields.map(f => { if (f.control === 'sphere') return null; /* the 3D light sphere lives in Create Image's Relight (shared/LightSphere.tsx) */ if (f.control === 'pad') return f === pads[0] && pads.length === 2 ? <LightPad key="pad" fx={pads[0]} fy={pads[1]} values={values} onChange={onChange} /> : null;
    const onChange0 = change; const opts = f.options ?? []; const v = values[f.name] ?? ''; const set = (x: string) => onChange0(f.name, x);
    return <section key={f.name} className="card app-field" data-testid={`app-field-${f.name}`}>
      <h2 className="types-h">{titleOf(f)}{f.optional && <span className="helper"> optional</span>}</h2>
      {f.control === 'tiles' && <AppTiles field={f.name} label={titleOf(f)} options={opts} value={v} onPick={set} extra={extra?.[f.name]} />}
      {(f.control === 'segmented' || (!f.control && opts.length > 0 && opts.length <= 4)) && <div className="seg af-seg" role="radiogroup" aria-label={titleOf(f)}>{opts.map(o => <button key={o.value} type="button" role="radio" aria-checked={v === o.value} className={v === o.value ? 'on' : ''} data-testid={`af-${f.name}-${o.value}`} onClick={() => set(o.value)}>{o.label}</button>)}</div>}
      {f.control === 'grid' && <div className="af-grid" role="radiogroup" aria-label={titleOf(f)}>{opts.map(o => <button key={o.value} type="button" role="radio" aria-checked={v === o.value} className={`af-cell ${v === o.value ? 'on' : ''} ${mediaOf(o).poster ? 'has-art' : ''}`} data-testid={`af-${f.name}-${o.value}`} onClick={() => set(o.value)}>{mediaOf(o).poster && <img className="af-cell-art" src={mediaOf(o).poster!} alt="" loading="lazy" aria-hidden />}{o.label}</button>)}</div>}
      {f.control === 'slider' && <div className="af-slider"><input type="range" min={f.min ?? 0} max={f.max ?? 100} step={f.step ?? 1} value={v || String(f.default ?? f.min ?? 0)} aria-label={titleOf(f)} onChange={e => set(e.target.value)} /><b>{v || String(f.default ?? '')}</b></div>}
      {f.control === 'swatches' && <div className="af-sw" role="radiogroup" aria-label={titleOf(f)}>{opts.map(o => <button key={o.value} type="button" role="radio" aria-checked={v.toLowerCase() === o.value.toLowerCase()} aria-label={o.label || o.value} title={o.label || o.value} className={`af-swatch ${v.toLowerCase() === o.value.toLowerCase() ? 'on' : ''}`} style={{ background: o.value }} onClick={() => set(o.value)} />)}</div>}
      {!f.control && opts.length > 4 && <select className="af-select" value={v} aria-label={titleOf(f)} onChange={e => set(e.target.value)}>{opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
      {f.help && <p className="helper">{f.help}</p>}
    </section>; })}</>;
}

/** One tiles field (UGC presenters, Orbit's moves): the same tiles on the app screen and in the Video bar's popover (ui/video/VideoWorkflowBar.tsx). */
export function AppTiles({ field, label, options, value, onPick, extra, className = '' }: { field: string; label: string; options: AppFieldOpt[]; value: string; onPick: (v: string) => void; extra?: { node: React.ReactNode; active: boolean }; className?: string }) {
  return <div className={`af-tiles ${className}`} role="radiogroup" aria-label={label}>{options.map((o, i) => { const on = value === o.value && !extra?.active; return <button key={o.value} type="button" role="radio" aria-checked={on} className={`af-tile ${on ? 'on' : ''}`} data-testid={`af-${field}-${o.value}`} onClick={() => onPick(o.value)} onMouseEnter={e => play(e, true)} onMouseLeave={e => play(e, false)} onFocus={e => play(e, true)} onBlur={e => play(e, false)}>
    <span className="af-media" aria-hidden>{(() => { const m = mediaOf(o); return m.poster ? <><img src={m.poster} alt="" loading="lazy" />{m.loop && <video src={m.loop} muted loop playsInline preload="none" />}</> : hasSketch(field) ? <TileSketch field={field} o={o} /> : <i className={`af-ph af-ph-${i % 6}`}>{o.label.slice(0, 1)}</i>; })()}</span><span className="af-label">{o.label}</span></button>; })}{extra?.node}</div>;
}
