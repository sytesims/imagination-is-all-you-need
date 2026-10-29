/**
 * The three special surfaces of Create Image's bar (2026-10-23; steps 3–4):
 *  - Brush Edit ('mask'): the strip's Paint mask button / mask thumbnail (the sheet itself is MaskSheet.tsx)
 *  - Camera Angles ('multi-output'): the Angles popover (chips, multi-select, max 9) and the per-image price
 *  - Camera & Lens ('rig'): the Camera group chip over plain Create, opening the existing rig picker (RigPicker.tsx)
 * Styles: maskSheet.css (registered in pageStyles.ts).
 */
import { layersPhotoBlock } from '../../../../server/src/shared/imageLayers';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Popover } from '../../shared/Popover';
import { tip } from '../../shared/Tooltip';
import { BrushIcon, CloseIcon } from '../Icons';
import { WfIcon, viaOver, folded, type WfRecipe } from './WorkflowBar';
import RigPicker, { rigIsSet } from './RigPicker';
import { RIG_DEFAULT, CAMERA_BODIES, LENSES, FILM_STOCKS, LIGHTING, ERAS, rigLabel, rigSentence, type Rig } from '../../shared/imageFeatures';
import type { WfMask } from './MaskSheet';
import { photoBlock, expandBlock, eraseMaskBlock } from '../../../../server/src/shared/imagePhotoTools';

/* ---------------- Brush Edit ---------------- */
/** Inline after the photo slot (Create bar clean-up 2026-10-23: one compact tile): "Paint mask" (orange outline while it's what Generate
 *  waits for), or the mask as a labelled thumbnail (click edits it, ✕ or Delete removes it; how much is painted is in its tooltip). */
export function MaskStrip({ mask, hasPhoto, need, onPaint, onClear, disabled, erase }: { mask: WfMask | null; hasPhoto: boolean; need: boolean; onPaint: () => void; onClear: () => void; disabled?: boolean; /** Erase Object: say what the paint removes */ erase?: boolean }) {
  if (!hasPhoto) return null;
  const pct = mask ? Math.max(1, Math.round(mask.cover * 100)) : 0;
  const note = !mask ? '' : erase ? (mask.cover > 0.95 ? 'Covers the whole photo' : `${pct}% to erase`) : mask.cover > 0.985 ? 'The whole photo can change' : `${pct}% painted`;
  return <div className="wf-mask" data-testid="wf-mask">
    {mask ? <span className="wf-mask-t" data-testid="wf-mask-thumb"><button type="button" aria-label={`Mask: ${note}. Edit mask. Delete removes it`} data-testid="wf-mask-edit" {...tip(`Mask · ${note}. Click to edit`)} onClick={onPaint} disabled={disabled}
        onKeyDown={e => { if ((e.key === 'Delete' || e.key === 'Backspace') && !disabled) { e.preventDefault(); onClear(); } }}><img src={mask.preview} alt="" /><b>Mask</b></button>
        <button type="button" className="wf-slot-x" aria-label="Remove the mask" data-testid="wf-mask-remove" onClick={onClear} disabled={disabled}><CloseIcon size={10} strokeWidth={2.2} /></button></span>
      : <button type="button" className={`ic-chip wf-mask-b${need ? ' need' : ''}`} data-testid="wf-mask-paint" aria-haspopup="dialog" {...tip(erase ? 'Paint over what to erase' : 'Paint the area to change: only it changes')} onClick={onPaint} disabled={disabled}><BrushIcon size={14} /><span>{erase ? 'Paint what to erase' : 'Paint mask'}</span></button>}
  </div>;
}

/* ---------------- Camera Angles ---------------- */
type Opt = { value: string; label: string };
/** The picked angles, in grid order (blank / unreadable = all of them, like the server's parseShots). */
export function anglesOf(r: WfRecipe, v: string | undefined): string[] {
  const all = (r.controls.find(c => c.field === 'shots')?.options ?? []).map(o => o.value); if (v == null || v.trim() === '') return all;
  try { const x = JSON.parse(v); const ids = (Array.isArray(x) ? x : [x]).map(String); return all.filter(a => ids.includes(a)); } catch { return all; }
}
export const anglesSummary = (r: WfRecipe, ids: string[]): string => { const os = r.controls.find(c => c.field === 'shots')?.options ?? [];
  return !ids.length ? 'None' : ids.length === os.length ? `All ${os.length}` : ids.length === 1 ? (os.find(o => o.value === ids[0])?.label ?? ids[0]) : `${ids.length} angles`; };
export const anglesLabel = (n: number) => n === 0 ? 'Make angles' : n === 1 ? 'Make 1 angle' : `Make ${n} angles`;
/** Chips (multi-select, max = every angle), All / None, and what it costs per image. */
export function AnglesPanel({ r, ids, set, each }: { r: WfRecipe; ids: string[]; set: (ids: string[]) => void; /** the price of one image ("✦ 4 each", "Free · Local each") */ each: React.ReactNode }) {
  const os: Opt[] = r.controls.find(c => c.field === 'shots')?.options ?? []; const all = os.map(o => o.value);
  const toggle = (id: string) => set(ids.includes(id) ? ids.filter(x => x !== id) : all.filter(a => [...ids, id].includes(a)));
  return <div className="wf-angles" data-testid="wf-angles-panel">
    <div className="wf-pop-h"><span>Angles · {ids.length} of {all.length}</span><span className="wf-ang-bulk"><button type="button" onClick={() => set(all)} disabled={ids.length === all.length} data-testid="wf-angles-all">All</button><button type="button" onClick={() => set([])} disabled={!ids.length} data-testid="wf-angles-none">None</button></span></div>
    <div className="wf-ang-grid" role="group" aria-label="Angles">{os.map(o => { const on = ids.includes(o.value);
      return <button key={o.value} type="button" role="checkbox" aria-checked={on} className={`wf-ang${on ? ' on' : ''}`} data-testid={`wf-angle-${o.value}`} onClick={() => toggle(o.value)}><ShotGlyph id={o.value} /><span>{o.label}</span></button>; })}</div>
    <p className={`wf-ang-note${ids.length ? '' : ' warn'}`} data-testid="wf-angles-note">{ids.length ? <>{`${ids.length} image${ids.length > 1 ? 's' : ''}, one per angle`}{each ? <> · {each}</> : null}. Views the photo never showed are the model's best guess.</> : 'Pick at least one angle.'}</p>
  </div>;
}
/** Tiny camera-position glyph per angle (our own drawing: subject dot, camera triangle). */
export function ShotGlyph({ id }: { id: string }) {
  const cam: Record<string, [number, number, number]> = { front: [12, 20, 0], 'three-quarter-left': [5, 18, 45], 'three-quarter-right': [19, 18, -45], side: [3, 12, 90], back: [12, 4, 180], low: [12, 21, 0], high: [12, 20, 0], 'close-up': [12, 15, 0], wide: [12, 22, 0] };
  const [x, y, r] = cam[id] ?? [12, 20, 0];
  return <svg className="sh-glyph" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="11" r={id === 'close-up' ? 4.5 : id === 'wide' ? 2 : 3} />
    {id === 'low' && <path d="M8 20l4-4 4 4" />}{id === 'high' && <path d="M8 3l4 4 4-4" />}
    {id !== 'low' && id !== 'high' && <path transform={`rotate(${r} ${x} ${y})`} d={`M${x - 2.5} ${y + 1.5}l2.5-3 2.5 3z`} />}
  </svg>;
}

/* ---------------- Character Sheet layouts (2026-10-25) ---------------- */
/** The Layout popover: one tile per layout, the Angles grid's look (wf-ang, single pick), each with a small diagram of its panels and its line. */
export function LayoutPanel({ r, value, set }: { r: WfRecipe; value: string; set: (v: string) => void }) {
  const c = r.controls.find(x => x.field === 'layout'); const os = c?.options ?? [];
  return <div className="wf-angles wf-layouts" data-testid="wf-layout-panel">
    <div className="wf-pop-h"><span>Layout</span></div>
    <div className="wf-ang-grid" role="radiogroup" aria-label="Layout">{os.map(o => { const on = (value || c?.default) === o.value;
      return <button key={o.value} type="button" role="radio" aria-checked={on} className={`wf-ang wf-lay${on ? ' on' : ''}`} data-testid={`wf-layout-${o.value}`} onClick={() => set(o.value)}
        {...tip(o.description ? `${o.description}. The shape follows the layout` : null)}><LayoutGlyph id={o.value} /><span>{o.label}</span>{o.description ? <small>{o.description}</small> : null}</button>; })}</div>
    <p className="wf-ang-note" data-testid="wf-layout-note">One image. The frame’s shape follows the layout, matched to what the model can make.</p>
  </div>;
}
/** A layout's panels as a tiny diagram (our own drawing): tall boxes are full-body views, small squares with a dot are face close-ups. */
export function LayoutGlyph({ id }: { id: string }) {
  const body = (x: number, y: number, w: number, h: number, k: string) => <g key={k}><rect x={x} y={y} width={w} height={h} rx=".8" /><circle cx={x + w / 2} cy={y + h * .22} r={Math.min(w, h) * .16} fill="currentColor" stroke="none" /><path d={`M${x + w / 2} ${y + h * .38}v${h * .44}`} /></g>;
  const face = (x: number, y: number, w: number, h: number, k: string) => <g key={k}><rect x={x} y={y} width={w} height={h} rx=".8" /><circle cx={x + w / 2} cy={y + h * .5} r={Math.min(w, h) * .26} /></g>;
  const row = (n: number, x0: number, y: number, w: number, h: number, f: typeof body, k: string) => Array.from({ length: n }, (_, i) => f(x0 + i * (w + 1), y, w, h, `${k}${i}`));
  const parts = id === 'turnaround' ? row(4, 1.5, 4, 4.5, 14, body, 'b') : id === 'turnaround-face' ? [...row(4, 0.5, 4, 3.6, 14, body, 'b'), face(18.9, 8, 4.6, 6, 'f')]
    : id === 'expressions' ? [...row(3, 2.5, 4, 5.7, 6.5, face, 'a'), ...row(3, 2.5, 11.5, 5.7, 6.5, face, 'c')]
    : id === 'full-sheet' ? [...row(4, 1.5, 2.5, 4.5, 10.5, body, 'b'), ...row(4, 1.5, 14, 4.5, 5, face, 'f')]
    : [...row(2, 2, 4, 6, 14, body, 'b'), face(16, 7, 6, 8, 'f')]; // classic
  return <svg className="sh-glyph lay-glyph" width="44" height="40" viewBox="0 0 24 22" fill="none" stroke="currentColor" strokeWidth=".75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{parts}</svg>;
}

/* ---------------- Camera & Lens ---------------- */
const ok = (list: { id: string }[], v: unknown) => typeof v === 'string' && list.some(x => x.id === v);
/** The rig from the workflow's draft values (the recipe's control fields: cameraBody, lens, focal, aperture, film, lighting, era). Unknown values fall back. */
export function rigOfVals(v: Record<string, string>): Rig {
  const focal = Number(v.focal); return { body: ok(CAMERA_BODIES, v.cameraBody) ? v.cameraBody : RIG_DEFAULT.body, lens: ok(LENSES, v.lens) ? v.lens : RIG_DEFAULT.lens, focal: Number.isFinite(focal) && focal > 0 ? focal : RIG_DEFAULT.focal,
    aperture: v.aperture || RIG_DEFAULT.aperture, film: ok(FILM_STOCKS, v.film) ? v.film : '', lighting: ok(LIGHTING, v.lighting) ? v.lighting : '', era: ok(ERAS, v.era) ? v.era : '' };
}
export const valsOfRig = (r: Rig): Record<string, string> => ({ cameraBody: r.body, lens: r.lens, focal: String(r.focal), aperture: r.aperture, film: r.film ?? '', lighting: r.lighting ?? '', era: r.era ?? '' });
/** The chip's short text: "35 mm · f/1.8 · Kodak Portra 400 · Golden hour"; the body and lens are in the tooltip (rigLabel). */
export function rigSummary(r: Rig): string {
  const pick = (l: { id: string; label: string }[], v?: string) => l.find(x => x.id === v)?.label;
  return [`${r.focal} mm`, `f/${r.aperture}`, pick(FILM_STOCKS, r.film), pick(LIGHTING, r.lighting), pick(ERAS, r.era)].filter(Boolean).join(' · ');
}
/** Camera & Lens in the chip row: the Camera group chip (summary, full rig in the tooltip). Its credit is in the model menu (rigCredit). */
export function RigStrip({ recipe, rig, setRig, watch, overRef }: { recipe: WfRecipe; rig: Rig; setRig: (f: (r: Rig) => Rig) => void; watch?: RefObject<HTMLElement>; /** the bar's ⋯ overflow button (the chip folded into it) */ overRef?: RefObject<HTMLElement | null> }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLButtonElement>(null); const sum = rigSummary(rig); const at = useMemo(() => viaOver(ref, overRef), [overRef]);
  return <span className="wf-strip wf-ctl" data-testid="wf-controls" data-workflow={recipe.id}>
    <button ref={ref} type="button" className={`ic-chip wf-grp wf-rig wf-fold${open && !folded(ref.current) ? ' on' : ''}`} aria-haspopup="dialog" data-set={rigIsSet(rig) || undefined} aria-expanded={open} data-testid="wf-group-camera" aria-label={`Camera: ${rigLabel(rig)}`}
      {...tip(`${rigLabel(rig)}. Adds: “${rigSentence(rig)}”`)} onClick={() => setOpen(o => !o)}><WfIcon name="camera" size={14} /><span className="wf-grp-l">Camera</span><b data-testid="wf-rig-summary">{sum}</b></button>
    <Popover open={open} anchor={at} avoid={watch} gap={8} onClose={() => setOpen(false)} label="Camera and lens" testId="ic-pop-rig" className="rg-pop" width={600}><RigPicker rig={rig} setRig={setRig} /></Popover>
  </span>;
}
/** Camera & Lens's credit line, for the model menu. */
export const rigCredit = (recipe: WfRecipe) => `Ours · ${recipe.source.note || 'camera recipe'} on your Create Image model`;

/* ---------------- Photo tools (2026-10-23): Remove Background, Expand, Erase Object, Virtual Try-On ---------------- */
export const PHOTO_TOOLS = ['remove-bg', 'expand', 'erase', 'try-on', 'image-layers' /* 2026-10-24: Image to layers (also needs 512 px a side, shared/imageLayers.ts) */];
/** What Generate waits for in a photo tool, beyond its slots (the same rules the server applies on submit: shared/imagePhotoTools.ts):
 *  a photo past 8192 px, Expand's shape (already the photo's, or too far from it), Erase's mask over the whole photo. `why` = the full reason. */
export function photoToolCheck(r: WfRecipe, src: { width: number; height: number } | null, vals: Record<string, string>, mask: WfMask | null):
  { missing: string; why: string; group?: string; slot?: string; mask?: boolean } | null {
  if (!PHOTO_TOOLS.includes(r.id)) return null;
  const big = photoBlock(src); if (big) return { missing: 'Photo too large', why: big.message, slot: r.slots[0]?.name };
  if (r.id === 'image-layers') { const b = layersPhotoBlock(src); if (b) return { missing: b.code === 'photo_too_small' ? 'Photo too small (512 px min)' : 'Photo shape not supported', why: b.message, slot: r.slots[0]?.name }; }
  if (r.id === 'expand') { const t = vals.target ?? String(r.controls.find(c => c.field === 'target')?.default ?? '1:1'); const b = expandBlock(src, t);
    if (b) return { missing: b.code === 'same_aspect' ? `Already ${t}` : 'Pick a closer shape', why: b.message, group: 'canvas' }; }
  if (r.id === 'erase') { const b = eraseMaskBlock(mask?.cover); if (b) return { missing: 'Mask covers everything', why: b.message, mask: true }; }
  return null;
}
/** True when the image has transparent pixels (Remove Background on a cut-out that is already transparent). Read at 64 px. */
export function useHasAlpha(url: string | null | undefined, on: boolean): boolean {
  const [a, setA] = useState(false);
  useEffect(() => { setA(false); if (!url || !on) return; let live = true; const i = new Image(); i.onload = () => { try { const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const x = c.getContext('2d', { willReadFrequently: true }); if (!x) return; x.drawImage(i, 0, 0, 64, 64); const d = x.getImageData(0, 0, 64, 64).data; let n = 0; for (let k = 3; k < d.length; k += 4) if (d[k] < 250) n++;
    if (live) setA(n > 64 * 64 * 0.02); } catch { /* unreadable */ } }; i.src = url; return () => { live = false; }; }, [url, on]);
  return a;
}
/** The line after the strip's chips: the reason Generate is waiting (full words), else a tip for this photo. */
export function PhotoToolNote({ r, why, alpha, src }: { r: WfRecipe; why: string | null; alpha: boolean; src: { width: number; height: number } | null }) {
  const t = why ?? (r.id === 'remove-bg' && alpha ? 'This photo already has a transparent background; running it again may trim the edges more.'
    : r.id === 'expand' && src ? `Your photo (${src.width}×${src.height}) stays as it is; the new area is painted around it.` : null);
  return t ? <span className={`wf-pt-note${why ? ' why' : ''}`} data-testid="wf-pt-note" role={why ? 'status' : undefined} {...tip(t)}>{t}</span> : null;
}
