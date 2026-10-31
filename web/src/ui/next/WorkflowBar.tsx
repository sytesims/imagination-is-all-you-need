/**
 * Unified Create Image, step 2: the Workflow chip, picker and strip inside Create Image's bar.
 * Recipes come from GET /api/image-workflows (server/src/shared/workflows.ts); a picked recipe still runs on its own tool
 * (app-relight, app-face-swap…) with today's form fields, and is quoted by that tool's /price (quote = charge).
 */
import { IMAGE_ACCEPT, fileFits, wrongTypeText } from '../../../../server/src/shared/mediaAccept';
import { SlotPreview, prepUpload } from '../../shared/SlotPreview';
import { useToast } from '../../shared/Toast';
import { withNativePicker } from '../../shared/MediaPicker';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Popover } from '../../shared/Popover';
import { OptPrice } from '../../shared/OptPrice';
import { BarPopover } from '../../shared/BarPop';
import { LightPanel as LightPanelUI } from '../../shared/LightPanel';
import { rigJson, lightRgb, rgbHex, type LightRig } from '../../../../server/src/shared/lightRig';
import { rigOfFields, rigChipPlain, plainDir, degTip, presetEdited } from '../../../../server/src/shared/lightEasy';
import { Link, navigate } from '../../platform/router';
import { tip } from '../../shared/Tooltip';
import { LightIcon, FaceSwapIcon, UserIcon, CharacterSheetIcon, ProductIcon, ShotsIcon, CameraMovesIcon, BrushIcon, ImageIcon, SearchIcon, CloseIcon, ChevronRightIcon, PlusIcon, UpscaleIcon, AspectIcon, CutoutIcon, ExpandIcon, EraserIcon, GarmentIcon, LayerSheetsIcon, CubeIcon, OrbitIcon, PrevizIcon, type IconProps } from '../Icons';
import type { ProviderInfo } from '../../api';
import { ScalePanel, outOf, sizeText, scaleWhy, type UpInfo, type Size } from './UpscaleBar';
import type { WorkflowRecipe } from '../../../../server/src/shared/workflows';
import { draftPromptOk } from '../../shared/batch1';
import './workflowBar.css';
import { SlotLabel } from '../../shared/SlotLabel';

export type WfRecipe = WorkflowRecipe & { modelInfo?: Record<string, { name: string | null; workflow: { line: string; url: string | null; source: string } | null; /** product shot: the aspects this model takes, per mode */ aspects?: Record<string, string[]>; /** the model's own shape when the picked one isn't offered */ defaultAspect?: string; /** the credit when a photo switches the mode */ workflowByMode?: Record<string, { line: string; url: string | null; source: string } | null> }> };
export type WfSlotFile = { file: File; url: string };
/** The values a run really sends: a shape this model doesn't offer (Auto on an API model, or 16:9 after switching models) becomes
 *  the model's own default shape, so the chip, the quote and the job agree (QA #1). Nothing is stored: switching back restores the pick. */
export function fitWfVals(r: WfRecipe, provider: string, mode: string | undefined, vals: Record<string, string>): Record<string, string> {
  const c = r.controls.find(x => x.field === 'aspect'); const mi = r.modelInfo?.[provider]; const ok = mi?.aspects?.[mode ?? r.modes.default];
  if (!c || !ok?.length) return vals; const v = vals.aspect ?? String(c.default ?? 'auto'); if (ok.includes(v)) return vals;
  return { ...vals, aspect: mi?.defaultAspect && ok.includes(mi.defaultAspect) ? mi.defaultAspect : ok.find(x => x !== 'auto') ?? ok[0] };
}
const ICONS: Record<string, (p: IconProps) => ReactNode> = { light: LightIcon, 'face-swap': FaceSwapIcon, user: UserIcon, 'character-sheet': CharacterSheetIcon, product: ProductIcon, shots: ShotsIcon, camera: CameraMovesIcon, brush: BrushIcon, create: ImageIcon, upscale: UpscaleIcon, aspect: AspectIcon, cutout: CutoutIcon, expand: ExpandIcon, eraser: EraserIcon, garment: GarmentIcon, layers: LayerSheetsIcon, cube: CubeIcon, orbit: OrbitIcon, previz: PrevizIcon, texture: BrushIcon, detail: ShotsIcon, rig: UserIcon, views: ShotsIcon, type: ImageIcon };
export const WfIcon = ({ name, size = 16 }: { name: string; size?: number }) => { const I = ICONS[name] ?? ImageIcon; return <I size={size} />; };

export { READY_WORKFLOW_TOOLS, workflowRecreateHref } from '../../shared/workflowLinks';

let cache: Promise<WfRecipe[]> | null = null;
/** The recipes (fetched once per page load; the server sends an ETag and a short max-age). */
export function useImageWorkflows(): WfRecipe[] {
  const [list, setList] = useState<WfRecipe[]>([]);
  useEffect(() => { let live = true; cache ??= fetch('/api/image-workflows').then(r => r.ok ? r.json() : { workflows: [] }).then(j => (Array.isArray(j?.workflows) ? j.workflows : [])).catch(() => { cache = null; return []; });
    cache.then(x => { if (live) setList(x); }); return () => { live = false; }; }, []);
  return list;
}

/** Per-workflow draft (prompt, model, control values), so switching workflows never mixes values. Files stay in memory for the visit. */
export interface WfDraft { prompt: string; provider: string; vals: Record<string, string>; /** 'user' = picked in the model menu ("Your pick"); absent = the default, or a preset / link / Recreate's model */ pickedBy?: 'user' }
const DKEY = (id: string) => `ohf:wf-draft:${id}`;
export const loadDraft = (id: string): WfDraft | null => { try { const x = JSON.parse(localStorage.getItem(DKEY(id)) ?? 'null'); return x && typeof x === 'object' ? { prompt: draftPromptOk(x.prompt) ? String(x.prompt ?? '') : '' /* a model's rewritten form never comes back into the box */, provider: String(x.provider ?? ''), vals: x.vals && typeof x.vals === 'object' ? x.vals : {} } : null; } catch { return null; } };
export const saveDraft = (id: string, d: WfDraft) => { try { localStorage.setItem(DKEY(id), JSON.stringify(d)); } catch { /* private window */ } };
export const defaultVals = (r: WfRecipe): Record<string, string> => Object.fromEntries(r.controls.filter(c => c.default != null && !c.optional).map(c => [c.field, String(c.default)]));

/** The bar's quote hook lives in shared/useToolQuote.ts (also the Canvas bar's); kept under this name for existing imports. */
export { useToolQuote as useWorkflowQuote } from '../../shared/useToolQuote';

/* The first chip in the bar ("Create" / "<icon> Relight ✕") is the shared WorkflowChip (shared/WorkflowChip.tsx), used by all four pages. */

const SRC_WORD: Record<string, string> = { ours: 'Ours', official: 'Official', community: 'Community' };
/** The picker: search, category tabs, one row per recipe (icon, name, one line, what it needs, source). Ready recipes load into this bar
 *  (since 2026-10-23 all of them, Brush Edit, Camera Angles and Camera & Lens included); a recipe marked 'soon' would say "Opens its page ↗" and go there (QA #6).
 *  Every row is reachable with ↑↓ Enter; Esc closes. A popover on desktop, a bottom sheet on phones. */
export function WorkflowPicker({ open, anchor, list, current, onPick, onClose, watch }: { open: boolean; anchor: RefObject<HTMLElement>; watch?: RefObject<HTMLElement>; list: WfRecipe[]; current: string; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState(''); const [tab, setTab] = useState('all'); const [hi, setHi] = useState(0); const listRef = useRef<HTMLDivElement>(null);
  const qRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!open) { setQ(''); setTab('all'); setHi(0); return; } const t = setTimeout(() => qRef.current?.focus(), 60); return () => clearTimeout(t); }, [open]);
  const ql = q.trim().toLowerCase();
  type Row = { id: string; name: string; icon: string; line: string; needs: string; src: string; ready: boolean; route?: string; cat: string };
  const rows: Row[] = useMemo(() => [
    { id: '', name: 'Create', icon: 'create', line: 'Text to image, or edit a photo with a prompt', needs: 'Prompt · photos', src: 'ours', ready: true, cat: 'basics' },
    ...list.map(r => ({ id: r.id, name: r.name, icon: r.icon, line: r.tagline, needs: r.needs, src: r.source.kind, ready: r.status === 'ready', route: r.route, cat: r.category })),
  ].filter(r => (tab === 'all' || r.cat === tab) && (!ql || `${r.name} ${r.line} ${r.cat}`.toLowerCase().includes(ql))), [list, tab, ql]);
  const pickable = rows; /* every row: ready ones load into the bar, the others open their page */
  useEffect(() => { setHi(0); }, [tab, ql]);
  const choose = (r: Row) => { onClose(); if (r.ready) onPick(r.id); else navigate(r.route ?? '/workflows'); };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!pickable.length) return; setHi(h => (h + (e.key === 'ArrowDown' ? 1 : -1) + pickable.length) % pickable.length); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = pickable[hi]; if (r) choose(r); }
  };
  useEffect(() => { const id = pickable[hi]?.id; listRef.current?.querySelector<HTMLElement>(`[data-wf-row="${CSS.escape(id ?? '-')}"]`)?.scrollIntoView({ block: 'nearest' }); }, [hi, pickable.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats = [['all', 'All'], ['edit', 'Edit'], ['people', 'People'], ['product', 'Product'], ['camera', 'Camera']];
  const heads: Record<string, string> = { basics: 'Basics', edit: 'Edit', people: 'People', product: 'Product', camera: 'Camera' };
  const order = ['basics', 'edit', 'people', 'product', 'camera'];
  return <Popover open={open} anchor={anchor} avoid={watch} gap={8} onClose={onClose} placement="top" label="Workflows" role="listbox" className="wf-pop" testId="wf-picker" focusFirst={false}>
    <div className="wf-pick" onKeyDown={key}>
      <label className="wf-q"><SearchIcon size={14} /><input ref={qRef} type="search" placeholder="Search workflows" aria-label="Search workflows" value={q} onChange={e => setQ(e.target.value)} autoFocus data-testid="wf-search" /><small className="wf-keys" aria-hidden>↑↓ to move · Enter to pick</small></label>
      <div className="wf-tabs" role="tablist" aria-label="Workflow type">{cats.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} data-testid={`wf-tab-${k}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      <div className="wf-list" ref={listRef}>
        {order.map(c => { const rs = rows.filter(r => r.cat === c); if (!rs.length) return null;
          return <div key={c} className="wf-sec" role="group" aria-label={heads[c]}><span className="wf-h">{heads[c]}</span>
            {rs.map(r => { const on = r.id === current; const lit = pickable[hi]?.id === r.id;
              const body = <><span className="wf-ic" aria-hidden><WfIcon name={r.icon} size={16} /></span><span className="wf-t"><b>{r.name}</b><small>{r.line}</small></span>
                <span className={`wf-needs${r.ready ? '' : ' wf-opens'}`}>{r.ready ? r.needs : <>Opens its page <span aria-hidden>↗</span></>}</span>{r.src !== 'ours' && <span className={`wf-src wf-src-${r.src}`}><i aria-hidden />{SRC_WORD[r.src] ?? r.src}</span>}</>;
              return r.ready
                ? <button key={r.id || 'create'} type="button" role="option" aria-selected={on} data-wf-row={r.id || '-'} data-testid={`wf-row-${r.id || 'create'}`} className={`wf-row${on ? ' on' : ''}${lit ? ' hi' : ''}`} onMouseEnter={() => setHi(pickable.indexOf(r))} onClick={() => choose(r)}>{body}</button>
                : <Link key={r.id} to={r.route ?? '/workflows'} role="option" aria-selected={false} data-wf-row={r.id} className={`wf-row wf-page${lit ? ' hi' : ''}`} data-testid={`wf-row-${r.id}`} aria-label={`${r.name}: opens its own page`} {...tip(`${r.name} has its own page. Opens it.`)} onMouseEnter={() => setHi(pickable.indexOf(r))} onClick={onClose}>{body}</Link>; })}</div>; })}
        {!rows.length && <p className="helper wf-empty">No workflows match “{q}”.</p>}
      </div>
      <div className="wf-foot"><span>{list.length} workflows</span><Link to="/workflows" className="wf-all" onClick={onClose} data-testid="wf-browse-all">Browse all workflows <ChevronRightIcon size={12} /></Link></div>
    </div>
  </Popover>;
}

/** One labelled photo slot in the strip: dashed when empty (orange = required, grey = optional), the photo with ✕ when filled.
 *  Click opens the shared picker (Uploads, Generations, Liked) for this slot; the small ⇪ uploads a file straight away.
 *  Drop a file (or a picture dragged from the feed) on it; paste while it has focus. */
function SlotBox({ slot, file, onFile, onUrl, onPick, picking, flash, onClear, disabled, num, next }: { slot: WfRecipe['slots'][number]; file: WfSlotFile | null; onFile: (f: File) => void; onUrl: (url: string) => void; onPick: () => void; picking: boolean; flash: number; onClear: () => void; disabled?: boolean;
  /** two-photo workflows: the order to add them (1, 2) */ num?: number; /** the next step: an orange ring that pulses a few times (static with reduced motion) */ next?: boolean }) {
  const toast = useToast(); const hit = useRef<HTMLButtonElement>(null); const [preview, setPreview] = useState(false);
  const inp = useRef<HTMLInputElement>(null); const [over, setOver] = useState(false); const [dims, setDims] = useState(''); const [bad, setBad] = useState(''); /* a photo that won't load: a placeholder, never a broken icon */
  const take = async (fs: FileList | File[] | null | undefined) => { if (disabled) return; const f = [...(fs ?? [])][0]; if (!f) return; if (!fileFits('image', f)) { toast(wrongTypeText(f.name, ['image']), 'error'); return; } const ready = await prepUpload(f, 'image'); if ('error' in ready) { toast(ready.error, 'error'); return; } if (ready.note) toast(ready.note); onFile(ready.file); };
  const size = file ? `${dims ? `${dims} · ` : ''}${file.file.size > 1e6 ? `${(file.file.size / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(file.file.size / 1024))} KB`}` : '';
  const can = (dt: DataTransfer) => dt.types.includes('Files') || dt.types.includes('text/uri-list');
  return <span key={flash || undefined} className={`wf-slot${file ? ' full' : slot.required ? ' req' : ' opt'}${over ? ' over' : ''}${picking ? ' picking' : ''}${flash ? ' wf-slot-new' : ''}${next && !file ? ' wf-slot-next' : ''}`} data-testid={`wf-slot-${slot.name}`} data-wf-slot={slot.name} data-next={next && !file ? '1' : undefined}
    onDragOver={e => { if (can(e.dataTransfer)) { e.preventDefault(); e.stopPropagation(); setOver(true); } }} onDragLeave={() => setOver(false)}
    onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); if (disabled) return; if (e.dataTransfer.files.length) { take(e.dataTransfer.files); return; }
      const u = (e.dataTransfer.getData('text/uri-list') || '').split('\n').map(x => x.trim()).find(x => x && !x.startsWith('#')); if (u) onUrl(u); }}>
    {num ? <i className="wf-slot-num" aria-hidden data-testid={`wf-slot-${slot.name}-num`}>{num}</i> : null}
    <input ref={inp} type="file" accept={IMAGE_ACCEPT} hidden data-testid={`wf-slot-${slot.name}-input`} onChange={e => { take(e.target.files); e.currentTarget.value = ''; }} />
    {file ? <><button ref={hit} type="button" className={`wf-slot-hit${bad === file.url ? ' bad' : ''}`} data-ref-trigger aria-haspopup="dialog" aria-expanded={preview} aria-label={`${slot.label}: open preview. Delete removes it`} {...tip(preview ? null : `${slot.label} · ${size}. Click to preview`)} onClick={() => setPreview(true)} disabled={disabled}
          onKeyDown={e => { if ((e.key === 'Delete' || e.key === 'Backspace') && !disabled) { e.preventDefault(); onClear(); } }}>{bad === file.url ? <ImageIcon size={14} /> : <img src={file.url} alt="" onLoad={e => setDims(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)} onError={() => setBad(file.url)} />}<b>{slot.label}</b></button>
        <button type="button" className="wf-slot-x" aria-label={`Remove ${slot.label.toLowerCase()}`} onClick={onClear} disabled={disabled}><CloseIcon size={10} strokeWidth={2.2} /></button></>
      : <><button type="button" className="wf-slot-hit" data-ref-trigger aria-haspopup="dialog" aria-expanded={picking} aria-label={`${num ? `${num}. ` : ''}Add ${slot.label.toLowerCase()}${slot.required ? '' : ' (optional)'}`} {...tip(`${slot.hint}. Pick from your images, upload, drop or paste`)} onClick={onPick} disabled={disabled}><PlusIcon size={14} /><SlotLabel text={slot.label} /></button>
        <button type="button" className="wf-slot-up" aria-label={`Upload ${slot.label.toLowerCase()} from this computer`} data-testid={`wf-slot-${slot.name}-upload`} {...tip('Upload from this computer')} onClick={() => withNativePicker(() => inp.current?.click())} disabled={disabled}><UploadGlyph /></button></>}
    <SlotPreview open={preview && !!file} anchor={hit} onClose={() => setPreview(false)} item={file} kind="image" title={slot.label} onReplace={onPick} onRemove={onClear} testId={`wf-slot-${slot.name}-preview`} />
  </span>;
}
const UploadGlyph = () => <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden><path d="M8 11V3M4.5 6.5 8 3l3.5 3.5M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;

const pickLabel = (r: WfRecipe, field: string, v: string) => r.controls.find(c => c.field === field)?.options?.find(o => o.value === v)?.label ?? v;
/** A control group's chip text: "Left · Soft · 50% · Warm". */
export function groupSummary(r: WfRecipe, g: WfRecipe['groups'][number], vals: Record<string, string>): string {
  if (g.id === 'light' && (vals.light || r.controls.some(c => c.field === 'light'))) return rigChipPlain(rigOfVals(vals));
  return g.summary.map(f => { const c = r.controls.find(x => x.field === f); const v = vals[f] ?? c?.default ?? ''; if (!c || v === '' || (f === 'look' && v === 'custom')) return '';
    if (c.kind === 'slider') return `${v}%`; if (f === 'direction' && vals.lightX && vals.lightY) return 'Custom';
    return c.kind === 'swatches' ? (c.options?.find(o => o.value.toUpperCase() === v.toUpperCase())?.label ?? v.toUpperCase()) : pickLabel(r, f, v); }).filter(Boolean).join(' · ');
}

/** Light group (Relight, 2026-10-24): the shared 3D light sphere. Its rig goes out as the `light` field (the server words it precisely);
 *  an old draft or link without one opens the sphere where its direction / pad / quality / brightness / colour put the light, and sends
 *  nothing new until the light is moved. A preset also picks its Relight look (that look's description stays in the prompt); changing
 *  the colour away from the preset drops the look. */
export const rigOfVals = (vals: Record<string, string>): LightRig => rigOfFields(vals);
/** The chip's tooltip and spoken name: the plain words, the exact angles only here. */
const lightTip = (vals: Record<string, string>) => { const r = rigOfVals(vals); return `${rigChipPlain(r)}${presetEdited(r) ? ' (edited)' : ''}. ${plainDir(r.key.az, r.key.el)} (${degTip(r.key.az, r.key.el)})${r.rim ? ', with a rim light' : ''}`; };
function LightPanel({ vals, set, photo }: { vals: Record<string, string>; set: (k: string, v: string) => void; photo: string | null }) {
  return <LightPanelUI value={rigOfVals(vals)} photo={photo} testId="wf-light-panel" onChange={(rig, meta) => {
    set('light', rigJson(rig)); if (meta?.preset) set('look', meta.preset.look); else if (!rig.preset && (vals.look ?? 'custom') !== 'custom') set('look', 'custom'); }} />;
}
/** Any other group: its controls as plain pickers (selects / tiles / segmented / slider). Used by later recipes. */
function GenericPanel({ r, g, vals, set, allow, optPrice }: { r: WfRecipe; g: WfRecipe['groups'][number]; vals: Record<string, string>; set: (k: string, v: string) => void; /** per field: the values this model takes (others hidden) */ allow?: Record<string, string[] | null>;
  /** an option's price (shared/optionPrice.ts words; undefined = loading, null = not priced): shown under its caption */ optPrice?: (field: string, value: string) => string | null | undefined }) {
  const opts = (c: WfRecipe['controls'][number]) => { const a = allow?.[c.field]; const os = c.options ?? []; const f = a ? os.filter(o => a.includes(o.value)) : os; return f.length ? f : os; };
  return <div className="wf-gen">{r.controls.filter(c => c.group === g.id).map(c => <div key={c.field} className="wf-gen-row"><span className="wf-pop-h">{c.label}</span>
    {c.kind === 'slider' ? <input type="range" min={c.min} max={c.max} step={c.step} value={vals[c.field] ?? c.default ?? ''} onChange={e => set(c.field, e.target.value)} />
      : c.kind === 'tiles' ? <div className="wf-tiles" role="radiogroup" aria-label={c.label}>{opts(c).map(o => <button key={o.value} type="button" role="radio" aria-checked={(vals[c.field] ?? c.default) === o.value} className={`wf-tile${(vals[c.field] ?? c.default) === o.value ? ' on' : ''}`} data-testid={`wf-tile-${o.value}`} onClick={() => set(c.field, o.value)}><i aria-hidden className={`wf-tile-sw wf-tile-${o.value}`} /><span>{o.label}</span></button>)}</div>
      : <div className="wf-seg wf-seg-wrap" role="radiogroup" aria-label={c.label}>{opts(c).map(o => <button key={o.value} type="button" role="radio" aria-checked={(vals[c.field] ?? c.default) === o.value} className={(vals[c.field] ?? c.default) === o.value ? 'on' : ''} data-testid={`wf-opt-${c.field}-${o.value}`} title={(o as any).credit ?? undefined} onClick={() => set(c.field, o.value)}>{o.value === 'auto' ? 'Auto' : o.label}{(o as any).credit ? <small className="wf-opt-note">{(o as any).credit}</small> : null}{optPrice && <OptPrice text={optPrice(c.field, o.value)} testId={`wf-opt-price-${c.field}-${o.value}`} />}</button>)}</div>}</div>)}</div>;
}
/** Upscale in the strip: what the Scale chip needs (the server's factor table, the models, the photo's size) and the Examples popup. */
export type WfUpscale = { info: UpInfo; models: ProviderInfo[]; src: Size | null; onExamples: () => void };

/** Create bar clean-up (2026-10-23): the strip is split in two, so the bar is one prompt line + one chip row at a fixed height.
 *  WorkflowInputs: the labelled photo slots (and the mask, the Fit/Crop chip, "Use as …") inline at the start of the prompt line.
 *  WorkflowControls: one chip per control group (with its popover), the fixed note and Examples, in the chip row.
 *  The credit ("Ours · light recipe on Official Comfy template") moved to the model menu (WorkflowCredit). */
export type WfChoose = { url: string; slots: { name: string; label: string; full: boolean }[] };
export function WorkflowInputs({ recipe: r, files, setFile, onPick, picking, onUrl, flash, choose, onChoose, onChooseCancel, disabled, lead, surface }: { recipe: WfRecipe; files: Record<string, WfSlotFile | null>; setFile: (slot: string, f: File | null) => void;
  /** open the shared image picker for a slot; the slot it is open for */ onPick: (slot: string) => void; picking: string | null; onUrl: (slot: string, url: string) => void; flash: { slot: string; k: number } | null;
  /** an image waiting for "Use as …" (several slots could take it) */ choose: WfChoose | null; onChoose: (slot: string) => void; onChooseCancel: () => void; disabled?: boolean;
  /** shown first (the preset tile) */ lead?: ReactNode; /** after the slots (Brush Edit: the mask; the Fit/Crop chip) */ surface?: ReactNode }) {
  const slots = [...r.slots].sort((a, b) => a.order - b.order); const firstEmpty = slots.find(s => s.required && !files[s.name]);
  return <div className="wf-strip wf-inputs" data-testid="wf-strip" data-workflow={r.id}>
    {lead}
    {choose ? <div className="wf-choose" role="group" aria-label="Use this photo as" data-testid="wf-choose"><img src={choose.url} alt="" /><span>Use as</span>
      {choose.slots.map(c => <button key={c.name} type="button" className="ic-chip wf-choose-b" data-testid={`wf-choose-${c.name}`} {...tip(c.full ? `Replaces the current ${c.label.toLowerCase()}` : null)} onClick={() => onChoose(c.name)}>{c.full ? `Replace ${c.label}` : c.label}</button>)}
      <button type="button" className="wf-choose-x" aria-label="Don’t use this photo" data-testid="wf-choose-cancel" onClick={onChooseCancel}><CloseIcon size={10} strokeWidth={2.2} /></button></div>
      : <><div className="wf-slots">{slots.map((s, i) => <span key={s.name} className="wf-slot-w">{i > 0 && <span className="wf-arrow" aria-hidden>←</span>}<SlotBox num={slots.length > 1 ? i + 1 : undefined} next={s === firstEmpty} slot={s} file={files[s.name] ?? null} onFile={f => setFile(s.name, f)} onUrl={u => onUrl(s.name, u)} onPick={() => onPick(s.name)} picking={picking === s.name} flash={flash?.slot === s.name ? flash.k : 0} onClear={() => setFile(s.name, null)} disabled={disabled} /></span>)}</div>
      {surface}</>}
  </div>;
}
/** The control groups as chips in the bar's chip row (Light, Scene, Shape, Scale, Angles, Canvas, Garment), plus the workflow's fixed note and Examples. */
/** A chip folded into the bar's ⋯ menu is display:none, so it can't place its popover: the ⋯ button does (read when the popover opens). */
export function viaOver<T extends HTMLElement>(r: RefObject<T | null>, over?: RefObject<HTMLElement | null>): RefObject<HTMLElement | null> {
  return { get current() { const e = r.current; return e && over?.current && e.closest('.ic-folded') ? over.current : e; } } as RefObject<HTMLElement | null>;
}
/** Folded into ⋯ right now. A folded chip keeps its className while its popover is open (no ' on'), since a className change from React
 *  would drop the fold class for a frame, the chip would pop back into the row and the popover would open from the wrong place. */
export const folded = (e?: Element | null) => !!e?.closest('.ic-folded');
export function WorkflowControls({ recipe: r, vals, setVal, provider, watch, mode, upscale, panels, summaries, after, openGroup, files, overRef, barPanels, optPrice, cover }: { recipe: WfRecipe; vals: Record<string, string>; setVal: (k: string, v: string) => void; provider: string; watch?: RefObject<HTMLElement>;
  /** the mode the run takes (a photo can switch it) */ mode?: string; upscale?: WfUpscale | null; /** per group: its own popover body and chip text (Camera Angles) */ panels?: Record<string, ReactNode>; summaries?: Record<string, string>;
  /** after the group chips (Camera Angles: the price per image) */ after?: ReactNode; /** open this group's popover (Generate says what's missing: no angle picked) */ openGroup?: { g: string; k: number } | null; files: Record<string, WfSlotFile | null>;
  /** the bar's ⋯ overflow button: a group folded into it anchors its popover there */ overRef?: RefObject<HTMLElement | null>;
  /** the panels are built from the shared BarPop pieces (Segmented, PopSection): give their popovers the BarPopover look (Direct a Shot) */ barPanels?: boolean;
  /** each option's price in the plain group panels (3D: Detail, Face count, Texture), from the page's variant quotes */ optPrice?: (field: string, value: string) => string | null | undefined;
  /** the popovers may cover `watch` (a Canvas card: a chip in its middle has little room above the card); they re-place when it moves instead of staying above it */ cover?: boolean }) {
  const [open, setOpen] = useState(''); const refs = useRef<Record<string, HTMLButtonElement | null>>({}); const anchor = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (openGroup?.g) { anchor.current = refs.current[openGroup.g] ?? null; setOpen(openGroup.g); } }, [openGroup?.k]); // eslint-disable-line react-hooks/exhaustive-deps
  const at = useMemo(() => viaOver(anchor, overRef), [overRef]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span className="wf-strip wf-ctl" data-testid="wf-controls" data-workflow={r.id}>
    {r.groups.map(g => { const sum = summaries?.[g.id] != null ? summaries[g.id] : g.id === 'scale' && upscale ? scaleChip(upscale, provider, Number(vals.scale ?? r.controls.find(c => c.field === 'scale')?.default ?? 4)) : g.id === 'shape' && (vals.aspect ?? 'auto') === 'auto' ? 'Auto' : groupSummary(r, g, vals);
      /* a tight bar drops the group word ("Clean studio"); the full "Scene: Clean studio" stays as the spoken name and the tooltip */
      return <button key={g.id} ref={el => { refs.current[g.id] = el; }} type="button" className={`ic-chip wf-grp wf-fold${open === g.id && !folded(refs.current[g.id]) ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={open === g.id} data-testid={`wf-group-${g.id}`} aria-label={`${g.label}: ${sum}`} {...tip(g.id === 'light' && !panels?.light ? `${g.label}: ${lightTip(vals)}` : `${g.label}: ${sum}`)}
      onClick={() => { anchor.current = refs.current[g.id]; setOpen(open === g.id ? '' : g.id); }}>
      <WfIcon name={g.icon} size={14} /><span className="wf-grp-l">{g.label}</span><b>{sum}</b>{g.id === 'light' && (vals.light || vals.color) && <i className="wf-grp-dot" style={{ background: vals.light ? rgbHex(lightRgb(rigOfVals(vals).key)) : vals.color }} aria-hidden />}</button>; })}
    {after && <span className="wf-fold wf-after">{after}</span>}
    {r.fixedNote && <span className="ic-chip ic-static wf-fixed wf-fold" data-testid="wf-fixed" {...tip('Set by this workflow')}>{r.fixedNote}</span>}
    {upscale && r.extras?.includes('upscale-examples') && <button type="button" className="ic-chip wf-exlink wf-fold" data-testid="wf-examples" aria-haspopup="dialog" onClick={upscale.onExamples}>Examples</button>}
    {r.groups.map(g => g.id === 'light' && panels?.[g.id] == null ? <BarPopover key={g.id} open={open === g.id} anchor={at} avoid={cover ? undefined : watch} watch={cover ? watch : undefined} gap={8} onClose={() => setOpen('')} label={g.label} testId={`wf-pop-${g.id}`} className="wf-gpop wf-light-pop" width={580}>
        {open === g.id && <LightPanel vals={vals} set={setVal} photo={files.image?.url ?? null} />}</BarPopover>
      : <Popover key={g.id} open={open === g.id} anchor={at} avoid={cover ? undefined : watch} watch={cover ? watch : undefined} gap={8} onClose={() => setOpen('')} label={g.label} testId={`wf-pop-${g.id}`} className={`wf-gpop${barPanels ? ' bp' : ''}`}>
      {panels?.[g.id] != null ? panels[g.id]
        : g.id === 'scale' && upscale ? <ScalePanel info={upscale.info} models={upscale.models} provider={provider} src={upscale.src} value={Number(vals.scale ?? r.controls.find(c => c.field === 'scale')?.default ?? 4)} onPick={k => { setVal('scale', String(k)); setOpen(''); }} />
        : <GenericPanel r={r} g={g} vals={vals} set={setVal} allow={{ aspect: r.modelInfo?.[provider]?.aspects?.[mode ?? r.modes.default] ?? null }} optPrice={optPrice} />}</Popover>)}
  </span>;
}
/** Where the picked workflow's graph comes from, for this model and mode ("Ours · two-image swap prompt on our create-…"): one line in the model menu. */
export function WorkflowCredit({ recipe: r, provider, mode, scale, upscale }: { recipe: WfRecipe; provider: string; mode?: string; scale?: string; upscale?: WfUpscale | null }) {
  const mi0 = r.modelInfo?.[provider]; const mi = mi0 && mode && mi0.workflowByMode?.[mode] !== undefined ? { ...mi0, workflow: mi0.workflowByMode[mode] } : mi0; const upFile = upscale?.info.workflows[provider]?.[scale ?? '4']; /* Upscale: the graph that runs for this factor */
  const line = mi?.workflow?.line && upFile ? mi.workflow.line.replace(/[\w.-]+-api\.json/, upFile) : mi?.workflow?.line;
  const credit = [`${r.source.kind === 'ours' ? 'Ours' : SRC_WORD[r.source.kind]}${r.source.note ? ` · ${r.source.note}` : ''}`, line ? `on ${line.replace(/^Ours · /, 'our ')}` : ''].filter(Boolean).join(' ');
  return <p className="wf-credit wf-credit-menu" data-testid="wf-credit"><span className="wf-credit-h">Workflow</span>{mi?.workflow?.url ? <a href={mi.workflow.url} target="_blank" rel="noreferrer" {...tip('Where this workflow comes from')}>{credit}</a> : credit}</p>;
}

/** The Scale chip's text: "×4 · 4096×4096", or "×4 · too large" when the factor can't run for this image. */
function scaleChip(u: WfUpscale, provider: string, k: number): string { const o = outOf(u.src, k); const bad = scaleWhy(u.info, u.models, provider, k, u.src);
  return bad ? `×${k} · can't run` : o ? `×${k} · ${sizeText(o)}` : `×${k}`; }
