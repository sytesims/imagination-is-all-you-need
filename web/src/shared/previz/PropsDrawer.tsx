/**
 * Add props (2026-10-26): the drawer over the Direct a Shot view. Browse kit pieces by tab (thumbnails drawn by the live engine, once per
 * page). Pick one (click it, or drag it out onto the view): a ghost follows the cursor and a click places it (previz/BuildMode.tsx, 2026-10-27);
 * drag it in the view to move it, turn and size it here or with the keys, remove it, undo and redo from the header. The props are
 * part of the shot (shot.props), so they are saved with it, recorded with it and sent with the Render.
 * Your models (2026-10-27, previz/myModels.ts + server shared/previzModels.ts): the first tab lists your 3D models (Image to 3D results, GLBs you
 * uploaded, the example character) and an Upload tile. A model drops facing the camera at a real-world size; here you size it in metres, turn it,
 * fix its front, make it the actor (it takes the mannequin's place, with a hop, waddle or glide) and say in words who it is for the Render.
 * The player owns the pointer handling in the view and the engine; this is the panel only.
 */
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { PROPS_MAX, PROP_SCALE_MIN, PROP_SCALE_MAX, type PlacedProp } from '../../../../server/src/shared/previzTemplates';
import { MODELS_MAX, MODEL_H_MIN, MODEL_H_MAX, MODEL_DESC_MAX, motionsFor, type PlacedModel, type ModelMotion } from '../../../../server/src/shared/previzModels';
import { PROP_TABS, propLabel, propStartScale } from './propLibrary';
import { useModelChoices, useGlbMoves, refreshModelChoices, type ModelChoice } from './myModels';
import { Segmented } from '../BarPop';
import { CubeIcon, UploadIcon, UndoIcon, RedoIcon, RigIcon } from '../../ui/Icons';
/** Rig as a character (2026-10-27): loaded when it opens */
const RigSheet = lazy(() => import('../rig/RigSheet'));
import { tip } from '../Tooltip';
const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
import './propsDrawer.css';

/** piece id → thumbnail (JPEG data URL), kept for the page */
const THUMBS = new Map<string, string>(); const subs = new Set<() => void>();
export const saveThumbs = (rows: Record<string, string>) => { for (const [k, v] of Object.entries(rows)) THUMBS.set(k, v); subs.forEach((f) => f()); };
export const missingThumbs = (ids: string[]) => ids.filter((id) => !THUMBS.has(id));
const deg = (r: number) => Math.round((r * 180) / Math.PI);
export const MINE_TAB = 'mine';
const FRONTS = [0, 90, 180, -90] as const;

/** Your models, as the drawer needs them (the player keeps the engine side) */
export interface MineProps {
  models: PlacedModel[]; selected: number | null; onSelect: (i: number | null) => void;
  /** pick a model to place (from = where the pointer went down on its tile) */ onPick: (c: ModelChoice, from?: { x: number; y: number }) => void; onChange: (i: number, p: Partial<PlacedModel>) => void; onRemove: (i: number) => void; onUpload: (f: File) => void;
  /** a file loading or being added (its key), and the last problem in plain words */ busy: string | null; note: string | null;
  /** the files that failed to load in the view (src → reason) */ failed: Record<string, string>;
}
interface Props {
  template: string; props: PlacedProp[]; selected: number | null;
  onSelect: (i: number | null) => void; /** pick a piece to place (from = where the pointer went down on its tile) */ onPick: (id: string, from?: { x: number; y: number }) => void; onChange: (i: number, p: Partial<PlacedProp>) => void; onRemove: (i: number) => void; onClose: () => void;
  /** draw the thumbnails this tab still needs (the player asks the engine) */ onNeedThumbs: (ids: string[]) => void;
  mine: MineProps; /** the tab to open on (Use in Direct a Shot opens Your models) */ startTab?: string;
  /** the tile being placed now (p:<piece id> or m:<choice key>) */ picking: string | null; undo: { can: boolean; canRedo: boolean; undo: () => void; redo: () => void };
  selectionTools?: ReactNode;
}
/** a tile picks on pointer down (so it can be dragged out onto the view); a keyboard press (Enter / Space) picks, and again places */
const pickProps = (go: (from?: { x: number; y: number }) => void) => ({
  onPointerDown: (e: React.PointerEvent) => { if (e.button !== 0) return; e.preventDefault(); go({ x: e.clientX, y: e.clientY }); },
  onClick: (e: React.MouseEvent) => { if (e.detail === 0) go(); } });
export function PropsDrawer({ template, props, selected, onSelect, onPick, onChange, onRemove, onClose, onNeedThumbs, mine, startTab, picking, undo, selectionTools }: Props) {
  const [tab, setTab] = useState(() => startTab ?? MINE_TAB); const [, bump] = useState(0);
  useEffect(() => { if (startTab) setTab(startTab); }, [startTab]);
  useEffect(() => { const f = () => bump((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  const isMine = tab === MINE_TAB; const cur = PROP_TABS.find((t) => t.id === tab) ?? PROP_TABS[0];
  useEffect(() => { if (isMine) return; const need = missingThumbs(cur.items.map((i) => i.id)); if (need.length) onNeedThumbs(need); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const { items: choices, error: listErr, reload } = useModelChoices(isMine); const fileIn = useRef<HTMLInputElement>(null);
  const full = props.length >= PROPS_MAX; const sel = selected != null ? props[selected] : null;
  const mFull = mine.models.length >= MODELS_MAX; const mSel = mine.selected != null ? mine.models[mine.selected] : null;
  const posterOf = (src: string) => choices?.find((c) => c.src === src)?.poster ?? null; const count = props.length + mine.models.length;
  return <aside className="pd bp-host" aria-label="Add props" data-testid="pv-props" data-nofly="" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    <header className="pd-head"><b>Add props</b><small>{count ? `${count} in this shot` : 'Pick one, then click in the view'}</small>
      <button type="button" className="pd-x pd-ur" onClick={undo.undo} disabled={!undo.can} aria-label="Undo" data-testid="pv-props-undo" {...tip(`Undo (${MAC ? '⌘' : 'Ctrl+'}Z)`)}><UndoIcon size={15} /></button>
      <button type="button" className="pd-x pd-ur" onClick={undo.redo} disabled={!undo.canRedo} aria-label="Redo" data-testid="pv-props-redo" {...tip(`Redo (${MAC ? '⇧⌘' : 'Ctrl+Shift+'}Z)`)}><RedoIcon size={15} /></button>
      <button type="button" className="pd-x" onClick={onClose} aria-label="Close Add props" data-testid="pv-props-close">×</button></header>
    <div className="pd-tabs" role="tablist" aria-label="Kinds of props">
      <button type="button" role="tab" aria-selected={isMine} className={`pd-tab-mine${isMine ? ' on' : ''}`} data-testid="pv-props-tab-mine" onClick={() => setTab(MINE_TAB)}><CubeIcon size={13} />Assets · 3D models{mine.models.length > 0 && <small>{mine.models.length}</small>}</button>
      {PROP_TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} className={t.id === tab ? 'on' : ''} data-testid={`pv-props-tab-${t.id}`} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>
    {isMine && <div className="pd-assets-head"><span>GLBs · up to 40 MB</span><button type="button" className="fd-link" onClick={reload} data-testid="pv-mine-refresh">Refresh Assets</button></div>}
    {isMine ? <div className="pd-grid" role="list" data-testid="pv-mine-grid">
      <button type="button" role="listitem" className="pd-item pd-up" disabled={mFull || !!mine.busy} data-testid="pv-mine-upload" onClick={() => fileIn.current?.click()} title={mFull ? `${MODELS_MAX} of your models is the most in one shot` : 'Upload a GLB (binary glTF, up to 40 MB)'}>
        <i className="pd-ic" aria-hidden><UploadIcon size={20} /></i><span>Upload GLB</span></button>
      <input ref={fileIn} type="file" accept=".glb,model/gltf-binary" hidden data-testid="pv-mine-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) mine.onUpload(f); }} />
      {choices == null ? [0, 1].map((i) => <span key={i} className="pd-item" aria-hidden><i className="pd-ph" /><span>&nbsp;</span></span>)
        : choices.map((c) => { const used = mine.models.some((m) => m.src === c.src); const busy = mine.busy === c.key;
          const on = picking === `m:${c.key}`;
          return <button key={c.key} type="button" role="listitem" className={`pd-item${busy ? ' pd-busy' : ''}${on ? ' pd-pick' : ''}`} aria-pressed={on} disabled={mFull || (!!mine.busy && !busy)} data-testid={`pv-mine-${c.key}`} {...pickProps((from) => mine.onPick(c, from))}
            title={mFull ? `${MODELS_MAX} of your models is the most in one shot` : `Add ${c.name}${used ? ' again' : ''} as a prop in the view. Does not replace the actor.`}>
            {c.poster ? <img src={c.poster} alt="" draggable={false} /> : <i className="pd-ic" aria-hidden><CubeIcon size={22} /></i>}<span>{c.name}</span>
            <em className="pd-tag">{c.tag === 'yours' ? 'Generated' : c.tag === 'example' ? 'Example' : 'Uploaded'}</em>{busy && <i className="pd-spin" aria-label="Loading" />}</button>; })}
    </div>
      : <div className="pd-grid" role="list" data-testid="pv-props-grid">{cur.items.map((it) => { const src = THUMBS.get(it.id); const on = picking === `p:${it.id}`;
        return <button key={it.id} type="button" role="listitem" className={`pd-item${on ? ' pd-pick' : ''}`} aria-pressed={on} disabled={full} data-testid={`pv-prop-${it.id}`} {...pickProps((from) => onPick(it.id, from))}
          title={full ? `${PROPS_MAX} props is the most in one shot` : on ? 'Click in the view to place it (or click here again)' : `Place ${it.label.toLowerCase()}: click, or drag it onto the view`}>
          {src ? <img src={src} alt="" draggable={false} /> : <i className="pd-ph" aria-hidden />}<span>{it.label}</span></button>; })}</div>}
    {isMine && (mine.note || listErr) ? <p className="pd-note pd-warn" role="status" data-testid="pv-mine-note">{mine.note ?? listErr}</p>
      : isMine ? <p className="pd-note">{mFull ? `${MODELS_MAX} of your models is the most in one shot. Remove one to add another.` : choices && !choices.some((c) => c.tag === 'yours') ? 'No generated models yet. Make one in Image to 3D, upload a GLB, or try the example. Click once to add a prop.' : 'Choose a generated model from Assets, or Upload GLB. Click once to add it facing the camera; adjust its position below. Other formats are not supported here.'}</p>
      : full ? <p className="pd-note" role="status">{PROPS_MAX} props is the most in one shot. Remove one to add another.</p> : null}
    {count > 0 && <div className="pd-placed">
      <div className="pd-list" role="listbox" aria-label="Props in this shot" data-testid="pv-props-list">
        {mine.models.map((m, i) => { const poster = posterOf(m.src); const bad = mine.failed[m.src];
          return <button key={m.id} type="button" role="option" aria-selected={i === mine.selected} className={`${i === mine.selected ? 'on' : ''}${bad ? ' bad' : ''}`} onClick={() => mine.onSelect(i === mine.selected ? null : i)} data-testid={`pv-model-${i}`} title={bad ?? undefined}>
            {poster ? <img src={poster} alt="" /> : <i className="pd-ic pd-ic-s" aria-hidden><CubeIcon size={14} /></i>}<span>{m.name}</span>{m.actor && <em className="pd-star">Actor</em>}</button>; })}
        {props.map((p, i) => <button key={i} type="button" role="option" aria-selected={i === selected} className={i === selected ? 'on' : ''} onClick={() => onSelect(i === selected ? null : i)} data-testid={`pv-placed-${i}`}>
          {THUMBS.get(p.k) ? <img src={THUMBS.get(p.k)} alt="" /> : <i className="pd-ph" aria-hidden />}<span>{propLabel(p.k)}</span></button>)}</div>
      {selectionTools}
      {mSel ? <ModelEdit m={mSel} i={mine.selected!} mine={mine} template={template} />
        : sel ? <div className="pd-edit" data-testid="pv-prop-edit">
        <p className="pd-hint">Drag it in the view to move it. Q / E turn, [ ] size, D duplicates.</p>
        <label className="pd-row"><span>Turn</span><input type="range" min={-180} max={180} step={5} value={deg(sel.r)} aria-label="Turn" data-testid="pv-prop-turn" onChange={(e) => onChange(selected!, { r: (Number(e.target.value) * Math.PI) / 180 })} /><em>{deg(sel.r)}°</em></label>
        <label className="pd-row"><span>Size</span><input type="range" min={PROP_SCALE_MIN} max={PROP_SCALE_MAX} step={0.01} value={sel.s} aria-label="Size" data-testid="pv-prop-size" onChange={(e) => onChange(selected!, { s: Number(e.target.value) })} /><em>{sel.s.toFixed(2)}×</em></label>
        <span className="pd-acts"><button type="button" className="pv-btn pv-btn-ghost" onClick={() => onChange(selected!, { r: 0, s: propStartScale(template) })}>Reset</button><button type="button" className="pv-btn pd-del" onClick={() => onRemove(selected!)} data-testid="pv-prop-remove">Remove</button></span>
      </div> : <p className="pd-hint">Click a prop in the view or in this list to move, turn or size it.</p>}
    </div>}
  </aside>;
}

/** One of your models: size in metres, turn, its front, the actor and its motion, the words for the Render. */
function ModelEdit({ m, i, mine, template }: { m: PlacedModel; i: number; mine: MineProps; template: string }) {
  const bad = mine.failed[m.src]; const frontDeg = ((deg(m.front) % 360) + 540) % 360 - 180; const [desc, setDesc] = useState(m.desc);
  const hasMoves = useGlbMoves(m.src); const motions = motionsFor(hasMoves); const [rig, setRig] = useState(false);
  useEffect(() => { setDesc(m.desc); }, [m.id, m.desc]);
  return <div className="pd-edit" data-testid="pv-model-edit">
    {bad ? <p className="pd-note pd-warn" role="alert" data-testid="pv-model-bad">{bad}</p> : <p className="pd-hint">Drag it in the view to move it. Q / E turn, [ ] size, D duplicates.</p>}
    <p className="pd-hint">Role: {m.actor ? 'Actor (replaces the mannequin)' : 'Prop (keeps the actor and scene)'}</p>
    {(['x', 'z'] as const).map((axis) => <label key={axis} className="pd-row"><span>Position {axis.toUpperCase()}</span><input type="number" min={-650} max={650} step={0.1} value={m[axis]} aria-label={`Prop position ${axis.toUpperCase()}`} data-testid={`pv-model-${axis}`} onChange={(e) => { const n = e.currentTarget.valueAsNumber; if (Number.isFinite(n)) mine.onChange(i, { [axis]: n }); }} /><em>m</em></label>)}
    <label className="pd-row"><span>Size</span><input type="range" min={MODEL_H_MIN} max={Math.min(MODEL_H_MAX, template === 'diorama' ? 1 : MODEL_H_MAX)} step={0.05} value={m.h} aria-label="Height in metres" data-testid="pv-model-size" onChange={(e) => mine.onChange(i, { h: Number(e.target.value) })} /><em>{m.h.toFixed(2)} m</em></label>
    <label className="pd-row"><span>Turn</span><input type="range" min={-180} max={180} step={5} value={deg(m.r)} aria-label="Turn" data-testid="pv-model-turn" onChange={(e) => mine.onChange(i, { r: (Number(e.target.value) * Math.PI) / 180 })} /><em>{deg(m.r)}°</em></label>
    <div className="pd-row pd-row-seg"><span>Front</span><Segmented label="Which way is its front" value={FRONTS.find((f) => Math.abs(f - frontDeg) < 1) ?? 0} cols={4} testId="pv-model-front"
      options={FRONTS.map((f) => ({ value: f, label: `${f}°`, title: f === 0 ? 'The file’s own front' : `Turn its front ${f}°` }))} onChange={(v) => mine.onChange(i, { front: (Number(v) * Math.PI) / 180 })} /></div>
    <div className="pd-actor">
      <button type="button" className={`pd-actor-btn${m.actor ? ' on' : ''}`} aria-pressed={!!m.actor} data-testid="pv-model-actor" onClick={() => mine.onChange(i, { actor: m.actor ? undefined : hasMoves ? 'moves' : 'hop' })}>
        {m.actor ? 'It’s the actor' : 'Make it the actor'}</button>
      {m.actor ? <Segmented label="How it moves" value={m.actor === 'moves' && !hasMoves ? 'hop' : m.actor} cols={motions.length} testId="pv-model-motion" options={motions.map((x) => ({ value: x.id, label: x.label, title: x.hint }))} onChange={(v) => mine.onChange(i, { actor: v as ModelMotion })} />
        : <small>It takes the mannequin’s place: Play the actor moves it, Shot Recipes frame it.</small>}
      <button type="button" className="pd-rig" data-testid="pv-model-rig" onClick={() => setRig(true)} title="Give it bones and moves so it walks, runs and dances. Free, in your browser"><RigIcon size={14} />{hasMoves ? 'Rig it again' : 'Rig as a character'}</button></div>
    {rig && <Suspense fallback={null}><RigSheet src={m.src} name={m.name} jobId={m.job ?? null} front={m.front} onClose={() => setRig(false)} onSaved={() => refreshModelChoices()}
      onUse={(r) => mine.onChange(i, { src: r.url, job: r.id, actor: 'moves', front: 0 })} onUseOwn={() => mine.onChange(i, { actor: 'moves' })} /></Suspense>}
    <label className="pd-desc"><span>In the Render, it is</span><input type="text" value={desc} maxLength={MODEL_DESC_MAX} placeholder="e.g. a small green forest creature with long ears" data-testid="pv-model-desc"
      onChange={(e) => setDesc(e.target.value)} onBlur={() => { if (desc !== m.desc) mine.onChange(i, { desc }); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></label>
    <span className="pd-acts"><button type="button" className="pv-btn pd-del" onClick={() => mine.onRemove(i)} data-testid="pv-model-remove">Remove</button></span>
  </div>;
}
