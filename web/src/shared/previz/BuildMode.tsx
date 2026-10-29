/**
 * Add props build mode (2026-10-27): how you put things into the Direct a Shot set, shaped after good build modes (pick, see it, place it).
 *  - Pick → ghost: pick a piece or one of your models in the drawer (click, or drag it out onto the view). A see-through copy follows the
 *    cursor on the floor, stops at walls (previzPlace.rayToGround), slides clear of buildings (fitSpot) and shows green where it can go and red
 *    where it can't. A click places it; Shift-click places another; Esc cancels. A second click on the same tile (or Enter) drops it in view.
 *  - Clear modes: while the drawer is open the timeline holds still and the fly / actor / guide keys sleep, so the camera never moves under
 *    you. A hint bar at the foot of the view says which keys do what right now.
 *  - Selection: a white ring under what a click would pick, the orange ring under the selected thing, and a small toolbar above it
 *    (move, turn, size, duplicate, remove, and "make it the actor" for your models). Drag it to move it (it slides along walls), Q / E turn,
 *    [ ] or scroll size, Shift for fine steps, Alt snaps to a grid, arrows nudge, D duplicates, Delete removes.
 *  - Undo / redo (Cmd+Z, Shift+Cmd+Z): every place, move, turn, size, duplicate, remove and drawer change; quick repeats are one step.
 * A drag or a scroll draws the thing elsewhere through the engine (setOverride) and changes the shot once, when you let go, so the saved shot
 * and the recordings only ever see finished edits. The maths is server/src/shared/previzPlace.ts; this file is the pointer, keys and the UI.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fitSpot, nearestFree, snapGrid, turnBy, sizeBy, sizeStep, emptyUndo, recordUndo, undoStep, redoStep, type PlaceSnap, type Spot, type UndoStack } from '../../../../server/src/shared/previzPlace';
import { PROP_SCALE_MIN, PROP_SCALE_MAX, groundAt, type PlacedProp, type PlanShot } from '../../../../server/src/shared/previzTemplates';
import { MODEL_H_MIN, MODEL_H_MAX, modelRadius, modelGroundY, faceTowards, type PlacedModel } from '../../../../server/src/shared/previzModels';
import { PROP_PIECES } from '../../../../server/src/shared/world/propCatalog';
import { KIT } from '../../../../server/src/shared/world/kitCatalog';
import { pieceRadius, propLabel, propStartScale } from './propLibrary';
import type { PrevizEngine } from './engine';
import { knownMoves, type ModelChoice } from './myModels';
import { tip } from '../Tooltip';
import { PlusIcon, MinusIcon } from '../../ui/Icons';

export type PickItem = { kind: 'prop'; k: string } | { kind: 'model'; c: ModelChoice };
/** what a model needs before it can be placed (loaded and checked, its words for the Render, its start height) */
export interface ModelPrep { fw: number; desc: string; h: number }
type Sel = { kind: 'prop' | 'model'; i: number };
interface Placing { item: PickItem; prep: ModelPrep | null; /** extra turn (Q / E) on top of facing the camera, the size */ turn: number; s: number; h: number;
  /** the spot under the cursor (null: the cursor isn't over the view yet: the ghost waits at the drop spot) */ spot: Spot | null; drop: Spot | null; r: number;
  /** a drag out of the drawer: where it started (a release far from it, over the view, places) */ from: { x: number; y: number } | null;
  /** let go over the view while the model was still loading: place it there once it is ready */ dropAt?: { x: number; y: number } }
interface Drag { sel: Sel; x: number; z: number; r: number; s: number; h: number; /** screen offset (NDC) from the cursor to the thing's foot */ ox: number; oy: number;
  start: { x: number; y: number }; moving: boolean; /** Move from the toolbar: it follows the cursor until you click */ carry: boolean; spot: Spot | null }

const STEP_GRID = (tpl: string) => (tpl === 'diorama' ? 0.05 : 0.5);
const pieceOf = (k: string) => PROP_PIECES[k] ?? KIT[k] ?? null;
const isTyping = (t: EventTarget | null) => { const el = t as HTMLElement | null; if (!el?.closest) return false; if (el.isContentEditable) return true;
  const tag = el.tagName; return tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes((el as HTMLInputElement).type)); };
const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const CMD = MAC ? '⌘' : 'Ctrl';

export interface BuildProps {
  on: boolean; engine: React.MutableRefObject<PrevizEngine | null>; canvas: React.MutableRefObject<HTMLCanvasElement | null>; stage: React.RefObject<HTMLDivElement>;
  getShot: () => PlanShot; sel: { prop: number | null; model: number | null }; select: (k: 'prop' | 'model', i: number | null) => void;
  /** write props and models (the player's edit path, which keeps recipe takes in step with an actor model) */ apply: (f: (s: PlaceSnap) => PlaceSnap) => void;
  /** load and check one of your models, its words and its start height (null: it can't be used; the player says why) */ prepModel: (c: ModelChoice) => Promise<ModelPrep | null>;
  /** a placed model from a choice */ modelOf: (c: ModelChoice, prep: ModelPrep, x: number, z: number, r: number, list: PlacedModel[]) => PlacedModel;
  /** how many pixels on the right the drawer covers (new things land in the part you can see) */ coverRight: number;
  /** the last word from the player (a model that failed to load) */ onNote: (m: string | null) => void; limits: { props: number; models: number };
  /** close the drawer (Esc with nothing going on) */ onClose: () => void;
}

export function useBuildMode(P: BuildProps) {
  const [placing, setPlacingS] = useState<Placing | null>(null); const placingRef = useRef<Placing | null>(null);
  const setPlacing = (p: Placing | null) => { placingRef.current = p; setPlacingS(p); };
  const drag = useRef<Drag | null>(null); const [dragUi, setDragUi] = useState<{ moving: boolean; carry: boolean; ok: boolean; why?: string } | null>(null);
  const [hover, setHoverS] = useState<Sel | null>(null); const hoverRef = useRef<Sel | null>(null);
  const undo = useRef<UndoStack>(emptyUndo()); const [, bumpUndo] = useState(0);
  const pending = useRef<{ sel: Sel; x: number; z: number; r: number; s: number; h: number; timer: number } | null>(null);
  const keysDown = useRef({ alt: false, shift: false }); const lastPick = useRef<{ key: string; at: number } | null>(null); const raf = useRef(0);
  const props = () => P.getShot().props ?? []; const models = () => P.getShot().models ?? [];
  const snapNow = (): PlaceSnap => ({ props: props(), models: models() });
  const tpl = () => P.getShot().template;
  const selNow = (): Sel | null => (P.sel.model != null ? { kind: 'model', i: P.sel.model } : P.sel.prop != null ? { kind: 'prop', i: P.sel.prop } : null);
  const selRef = useRef<Sel | null>(null); selRef.current = selNow();

  /** remember how things were before a change (one undo step; the same key soon after joins it) */
  const remember = (key: string | null = null) => { undo.current = recordUndo(undo.current, snapNow(), key, performance.now()); bumpUndo((n) => n + 1); };
  const change = (key: string | null, f: (s: PlaceSnap) => PlaceSnap) => { flushPending(); remember(key); P.apply(f); };
  const doUndo = (redo = false) => { flushPending(); const r = (redo ? redoStep : undoStep)(undo.current, snapNow()); if (!r.snap) return; undo.current = r.stack; const snap = r.snap; P.apply(() => snap); bumpUndo((n) => n + 1);
    const s = selRef.current; if (s && (s.kind === 'prop' ? s.i >= snap.props.length : s.i >= snap.models.length)) P.select(s.kind, null); };
  /* another set, an imported scene: the steps belong to the old one */
  const tplKey = P.getShot().template; useEffect(() => { undo.current = emptyUndo(); bumpUndo((n) => n + 1); }, [tplKey]);

  // ---- reading the view ----
  const ndc = (cx: number, cy: number) => { const r = P.canvas.current?.getBoundingClientRect(); if (!r || !r.width) return null; return [((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1)] as [number, number]; };
  const overView = (cx: number, cy: number) => { const el = document.elementFromPoint(cx, cy); return !!el && (el === P.canvas.current || !!el.closest?.('.pv-holder')); };
  const camFace = (x: number, z: number) => { const c = P.engine.current?.cameraGround(); return c ? faceTowards(x, z, c[0], c[1]) : 0; };
  const itemRad = (it: PickItem, s: number, h: number, prep: ModelPrep | null) => (it.kind === 'prop' ? pieceRadius(it.k) * s : modelRadius({ h, fw: prep?.fw ?? 1 }));
  const selRad = (s: Sel, scale: number, h: number) => { if (s.kind === 'prop') { const p = props()[s.i]; return p ? pieceRadius(p.k) * scale : 0.5; } const m = models()[s.i]; return m ? modelRadius({ h, fw: m.fw }) : 0.5; };
  /** the floor spot under a point of the view for a footprint of radius rad (snapped with Alt), or null above the horizon */
  const spotAtNdc = (n: [number, number], rad: number): Spot | null => { const e = P.engine.current; if (!e) return null; const f = e.castFloor(n[0], n[1]); if (!f) return null;
    let x = f.x, z = f.z; if (keysDown.current.alt) { const g = STEP_GRID(tpl()); x = snapGrid(x, g); z = snapGrid(z, g); } return fitSpot(tpl(), x, z, rad); };
  /** where a new thing lands without a cursor: the middle of the part of the view you can see, near the floor, clear of what is there */
  const dropSpot = (rad: number): Spot => { const e = P.engine.current; const r = P.canvas.current?.getBoundingClientRect(); const cover = r?.width ? Math.min(0.6, P.coverRight / r.width) : 0;
    const cx = -cover; /* the centre of the uncovered part, in NDC */ const far = tpl().startsWith('open-city') ? 28 : tpl() === 'diorama' ? 6 : 14;
    const cam = e?.cameraGround(); let best: Spot | null = null;
    const near = tpl() === 'diorama' ? 0.8 : 2.5;
    for (const ny of [-0.2, -0.32, -0.1, -0.45, 0, -0.6]) for (const dx of [0, -0.15, 0.15, -0.3]) { const f = e?.castFloor(cx + dx, ny); if (!f) continue;
      const dist = cam ? Math.hypot(f.x - cam[0], f.z - cam[1]) : 5; if (dist > far || dist < near) continue; const sp = fitSpot(tpl(), f.x, f.z, rad); if (!sp.ok) continue; if (sp.road && !best) { best = sp; continue; } best = sp; break; }
    const sp = best ?? fitSpot(tpl(), 0, 0, rad);
    const taken = [...props().map((p) => ({ x: p.x, z: p.z, r: pieceRadius(p.k) * p.s })), ...models().map((m) => ({ x: m.x, z: m.z, r: modelRadius(m) }))];
    const [x, z] = nearestFree(sp.x, sp.z, rad, taken, (px, pz) => fitSpot(tpl(), px, pz, rad).ok); return fitSpot(tpl(), x, z, rad); };

  // ---- the ghost ----
  const showGhost = (p: Placing | null) => { const e = P.engine.current; if (!e) return; if (!p || (p.item.kind === 'model' && !p.prep)) { e.setGhost(null); return; }
    const sp = p.spot ?? p.drop; if (!sp) { e.setGhost(null); return; } const y = groundAt(tpl(), sp.x, sp.z); const r = p.r;
    if (p.item.kind === 'prop') e.setGhost({ kind: 'prop', k: p.item.k, s: p.s, x: sp.x, y, z: sp.z, r, ok: sp.ok, rad: itemRad(p.item, p.s, p.h, p.prep) });
    else e.setGhost({ kind: 'model', src: p.item.c.src, h: p.h, front: p.item.c.front, x: sp.x, y: modelGroundY(tpl(), sp.x, sp.z, y), z: sp.z, r, ok: sp.ok, rad: itemRad(p.item, p.s, p.h, p.prep) }); };
  const updatePlacing = (patch: Partial<Placing>) => { const p = placingRef.current; if (!p) return; const n = { ...p, ...patch };
    const sp = n.spot ?? n.drop; if (sp) n.r = turnWrap(camFace(sp.x, sp.z) + n.turn); setPlacing(n); showGhost(n); };
  const turnWrap = (a: number) => Math.round(Math.atan2(Math.sin(a), Math.cos(a)) * 10000) / 10000 || 0;

  /** pick a piece or a model in the drawer; from = where a pointer went down on its tile (a drag out of the drawer) */
  const pick = (item: PickItem, from?: { x: number; y: number }): Promise<boolean> => { const key = item.kind === 'prop' ? `p:${item.k}` : `m:${item.c.key}`; const now = performance.now();
    const cur = placingRef.current; const curKey = cur ? (cur.item.kind === 'prop' ? `p:${cur.item.k}` : `m:${cur.item.c.key}`) : null;
    /* the same tile again (a second click, or the second half of a double click): drop it where the ghost waits; never two at once */
    if (cur && curKey === key) { if (lastPick.current?.key === key && now - lastPick.current.at < 120) return Promise.resolve(false); lastPick.current = { key, at: now }; return Promise.resolve(placeNow()); }
    lastPick.current = { key, at: now }; cancelDrag(); P.select('prop', null); P.select('model', null);
    if (item.kind === 'prop' ? props().length >= P.limits.props : models().length >= P.limits.models) return Promise.resolve(false);
    const s = item.kind === 'prop' ? propStartScale(tpl()) : 1; const base: Placing = { item, prep: null, turn: 0, s, h: 1, spot: null, drop: null, r: 0, from: from ?? null };
    const ready = (p: Placing) => { const drop = dropSpot(itemRad(p.item, p.s, p.h, p.prep)); const n = { ...p, drop, r: camFace(drop.x, drop.z) }; setPlacing(n); showGhost(n); };
    if (item.kind === 'prop') { ready(base); P.stage.current?.focus({ preventScroll: true }); return Promise.resolve(true); }
    setPlacing(base); showGhost(null); P.onNote(null);
    return P.prepModel(item.c).then((prep) => { const p = placingRef.current; if (!p || p.item !== item) return false; if (!prep) { setPlacing(null); showGhost(null); return false; } ready({ ...p, prep, h: prep.h }); P.stage.current?.focus({ preventScroll: true });
      if (p.dropAt) { const n = ndc(p.dropAt.x, p.dropAt.y); const sp = n ? spotAtNdc(n, itemRad(item, 1, prep.h, prep)) : null; if (sp) { updatePlacing({ spot: sp, dropAt: undefined }); placeNow(); } }
      return true; }); };
  /** place what you are holding at its spot (or the drop spot); keep = Shift: hold another */
  const placeNow = (keep = false) => { const p = placingRef.current; if (!p || (p.item.kind === 'model' && !p.prep)) return false; const sp = p.spot ?? p.drop; if (!sp || !sp.ok) return false;
    const it = p.item;
    if (it.kind === 'prop') { if (props().length >= P.limits.props) return false; const n = props().length; const row: PlacedProp = { k: it.k, x: sp.x, z: sp.z, r: p.r, s: p.s };
      change('place', (s) => ({ ...s, props: [...s.props, row] })); if (!keep) { setPlacing(null); showGhost(null); P.select('prop', n); } }
    else { const list = models(); if (list.length >= P.limits.models) return false; const m = P.modelOf(it.c, p.prep!, sp.x, sp.z, p.r, list); const n = list.length;
      change('place', (s) => ({ ...s, models: [...s.models, m] })); if (!keep || list.length + 1 >= P.limits.models) { setPlacing(null); showGhost(null); P.select('model', n); } }
    if (keep && placingRef.current) { const d = dropSpot(itemRad(p.item, p.s, p.h, p.prep)); updatePlacing({ drop: d }); }
    lastPick.current = null; return true; };
  const cancelPlacing = () => { if (!placingRef.current) return; setPlacing(null); showGhost(null); };

  // ---- moving what is placed ----
  const valuesOf = (s: Sel) => { if (s.kind === 'prop') { const p = props()[s.i]; return p ? { x: p.x, z: p.z, r: p.r, s: p.s, h: 1 } : null; } const m = models()[s.i]; return m ? { x: m.x, z: m.z, r: m.r, s: 1, h: m.h } : null; };
  const overrideOf = (d: { sel: Sel; x: number; z: number; r: number; s: number; h: number }) => (d.sel.kind === 'prop' ? { kind: 'prop' as const, i: d.sel.i, x: d.x, z: d.z, r: d.r, s: d.s } : { kind: 'model' as const, i: d.sel.i, x: d.x, z: d.z, r: d.r, h: d.h });
  const startDrag = (sel: Sel, cx: number, cy: number, carry = false) => { const v = valuesOf(sel); const e = P.engine.current; const n = ndc(cx, cy); if (!v || !e || !n) return;
    const pr = e.project(v.x, groundAt(tpl(), v.x, v.z), v.z); drag.current = { sel, ...v, ox: carry ? 0 : pr[0] - n[0], oy: carry ? 0 : pr[1] - n[1], start: { x: cx, y: cy }, moving: carry, carry, spot: null };
    setDragUi({ moving: carry, carry, ok: true }); };
  const moveDrag = (cx: number, cy: number) => { const d = drag.current; const e = P.engine.current; if (!d || !e) return;
    if (!d.moving) { if (Math.hypot(cx - d.start.x, cy - d.start.y) < 4) return; d.moving = true; }
    const n = ndc(cx, cy); if (!n) return; const sp = spotAtNdc([n[0] + d.ox, n[1] + d.oy], selRad(d.sel, d.s, d.h)); d.spot = sp;
    if (sp?.ok) { d.x = sp.x; d.z = sp.z; e.setOverride(overrideOf(d)); }
    setDragUi((u) => (u && u.moving && u.ok === !!sp?.ok && u.why === sp?.why ? u : { moving: true, carry: d.carry, ok: !!sp?.ok, why: sp?.why })); };
  const endDrag = (commit: boolean) => { const d = drag.current; if (!d) return; drag.current = null; setDragUi(null); const v = valuesOf(d.sel);
    if (commit && d.moving && v && (v.x !== d.x || v.z !== d.z || v.r !== d.r)) { const { x, z, r } = d; const i = d.sel.i;
      if (d.sel.kind === 'prop') change('move', (s) => ({ ...s, props: s.props.map((p, j) => (j === i ? { ...p, x, z, r } : p)) }));
      else change('move', (s) => ({ ...s, models: s.models.map((m, j) => (j === i ? { ...m, x, z, r } : m)) })); }
    P.engine.current?.setOverride(null); };
  const cancelDrag = () => endDrag(false);
  /* a scroll or quick sizing: drawn at once, written to the shot once it settles (one undo step) */
  const flushPending = () => { const q = pending.current; if (!q) return; pending.current = null; clearTimeout(q.timer); const { i } = q.sel; const v = valuesOf(q.sel); P.engine.current?.setOverride(null); if (!v) return;
    remember(null); P.apply((s) => (q.sel.kind === 'prop' ? { ...s, props: s.props.map((p, j) => (j === i ? { ...p, s: q.s, r: q.r } : p)) } : { ...s, models: s.models.map((m, j) => (j === i ? { ...m, h: q.h, r: q.r } : m)) })); };
  const resizeSel = (sel: Sel, k: number) => { const base = pending.current?.sel.kind === sel.kind && pending.current.sel.i === sel.i ? pending.current : valuesOf(sel) ? { sel, ...valuesOf(sel)! } : null; if (!base) return;
    const s = sel.kind === 'prop' ? sizeBy(base.s, k, PROP_SCALE_MIN, PROP_SCALE_MAX) : base.s; const h = sel.kind === 'model' ? sizeBy(base.h, k, MODEL_H_MIN, tpl() === 'diorama' ? 1 : MODEL_H_MAX) : base.h;
    const q = { sel, x: base.x, z: base.z, r: base.r, s, h, timer: 0 }; clearTimeout(pending.current?.timer); pending.current = q; q.timer = window.setTimeout(flushPending, 350);
    P.engine.current?.setOverride(overrideOf(q)); bumpUndo((n) => n + 1); };
  const turnSel = (sel: Sel, dir: 1 | -1, fine: boolean) => { const v = valuesOf(sel); if (!v) return; const r = turnBy(v.r, dir, fine); const i = sel.i;
    change(`turn:${sel.kind}:${i}`, (s) => (sel.kind === 'prop' ? { ...s, props: s.props.map((p, j) => (j === i ? { ...p, r } : p)) } : { ...s, models: s.models.map((m, j) => (j === i ? { ...m, r } : m)) })); };
  const nudgeSel = (sel: Sel, ax: number, az: number) => { const v = valuesOf(sel); const e = P.engine.current; if (!v || !e) return; const cam = e.cameraGround(); const fwd = e.castFloor(0, -0.2);
    let fx = 0, fz = -1; if (cam && fwd) { const l = Math.hypot(fwd.x - cam[0], fwd.z - cam[1]) || 1; fx = (fwd.x - cam[0]) / l; fz = (fwd.z - cam[1]) / l; }
    const step = (keysDown.current.shift ? 0.02 : 0.1) * (tpl() === 'diorama' ? 0.3 : 1); const x = v.x + (-fz * ax + fx * az) * step, z = v.z + (fx * ax + fz * az) * step; const sp = fitSpot(tpl(), x, z, selRad(sel, v.s, v.h)); if (!sp.ok) return; const i = sel.i;
    change(`nudge:${sel.kind}:${i}`, (s) => (sel.kind === 'prop' ? { ...s, props: s.props.map((p, j) => (j === i ? { ...p, x: sp.x, z: sp.z } : p)) } : { ...s, models: s.models.map((m, j) => (j === i ? { ...m, x: sp.x, z: sp.z } : m)) })); };
  const removeSel = (sel: Sel) => { const i = sel.i; change(null, (s) => (sel.kind === 'prop' ? { ...s, props: s.props.filter((_, j) => j !== i) } : { ...s, models: s.models.filter((_, j) => j !== i) })); P.select(sel.kind, null); };
  const duplicateSel = (sel: Sel) => { const v = valuesOf(sel); if (!v) return; if (sel.kind === 'prop' ? props().length >= P.limits.props : models().length >= P.limits.models) return;
    const rad = selRad(sel, v.s, v.h); const taken = [...props().map((p) => ({ x: p.x, z: p.z, r: pieceRadius(p.k) * p.s })), ...models().map((m) => ({ x: m.x, z: m.z, r: modelRadius(m) }))];
    const [x, z] = nearestFree(v.x + rad * 1.6, v.z, rad, taken, (px, pz) => fitSpot(tpl(), px, pz, rad).ok);
    if (sel.kind === 'prop') { const p = props()[sel.i]; const n = props().length; change(null, (s) => ({ ...s, props: [...s.props, { ...p, x, z }] })); P.select('prop', n); }
    else { const list = models(); const m = list[sel.i]; let k = list.length + 1; while (list.some((y) => y.id === `m${k}`)) k++; const { actor: _a, ...rest } = m; void _a; const n = list.length;
      change(null, (s) => ({ ...s, models: [...s.models, { ...rest, id: `m${k}`, x, z }] })); P.select('model', n); } };
  const makeActor = (i: number) => { const m = models()[i]; if (!m) return; change(null, (s) => ({ ...s, models: s.models.map((x, j) => { if (j === i) return m.actor ? (({ actor: _a, ...r }) => r)(x) as PlacedModel : { ...x, actor: knownMoves.get(x.src) ? 'moves' : 'hop' }; if (x.actor && !m.actor) { const { actor: _b, ...r } = x; void _b; return r as PlacedModel; } return x; }) })); };

  // ---- the pointer on the view ----
  const pickAt = (cx: number, cy: number): Sel | null => { const e = P.engine.current; const n = ndc(cx, cy); if (!e || !n) return null; const mi = e.pickModel(n[0], n[1]); if (mi != null) return { kind: 'model', i: mi }; const pi = e.pickProp(n[0], n[1]); return pi != null ? { kind: 'prop', i: pi } : null; };
  const setHover = (h: Sel | null) => { const o = hoverRef.current; if (o?.kind === h?.kind && o?.i === h?.i) return; hoverRef.current = h; setHoverS(h); P.engine.current?.setHover(h); };
  const onDown = (ev: React.PointerEvent) => { if (!P.on || ev.button !== 0) return; if ((ev.target as HTMLElement).closest('[data-nofly], button, input, .pv-views-wrap, .pv-bt')) return;
    keysDown.current.alt = ev.altKey; keysDown.current.shift = ev.shiftKey;
    if (placingRef.current) { ev.preventDefault(); const p = placingRef.current; const n = ndc(ev.clientX, ev.clientY); if (n) { const sp = spotAtNdc(n, itemRad(p.item, p.s, p.h, p.prep)); if (sp) updatePlacing({ spot: sp }); } placeNow(ev.shiftKey); return; }
    if (drag.current?.carry) { ev.preventDefault(); endDrag(true); return; }
    const hit = pickAt(ev.clientX, ev.clientY); if (!hit) { P.select('prop', null); P.select('model', null); return; }
    P.select(hit.kind, hit.i); startDrag(hit, ev.clientX, ev.clientY); (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId); ev.preventDefault(); };
  const onMove = (ev: React.PointerEvent) => { if (!P.on) return; keysDown.current.alt = ev.altKey; keysDown.current.shift = ev.shiftKey; const cx = ev.clientX, cy = ev.clientY;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => { raf.current = 0;
      if (drag.current) { moveDrag(cx, cy); return; }
      const p = placingRef.current; if (p) { if (!overView(cx, cy)) return; const n = ndc(cx, cy); if (!n) return; const sp = spotAtNdc(n, itemRad(p.item, p.s, p.h, p.prep)); if (sp) updatePlacing({ spot: sp }); return; }
      setHover(overView(cx, cy) ? pickAt(cx, cy) : null); }); };
  const onUp = () => { if (drag.current && !drag.current.carry) endDrag(true); };
  const onLeave = () => { if (!drag.current) setHover(null); };
  /* a drag out of the drawer: the ghost follows the cursor anywhere on the page; let go over the view to place it */
  useEffect(() => { if (!placing?.from) return;
    const mv = (e: PointerEvent) => { const p = placingRef.current; if (!p) return; if (!overView(e.clientX, e.clientY)) return; const n = ndc(e.clientX, e.clientY); if (!n) return;
      const sp = spotAtNdc(n, itemRad(p.item, p.s, p.h, p.prep)); if (sp) updatePlacing({ spot: sp }); };
    const up = (e: PointerEvent) => { const p = placingRef.current; if (!p?.from) return; const far = Math.hypot(e.clientX - p.from.x, e.clientY - p.from.y) > 8; updatePlacing({ from: null });
      if (far && overView(e.clientX, e.clientY)) { if (p.item.kind === 'model' && !p.prep) updatePlacing({ dropAt: { x: e.clientX, y: e.clientY } }); else placeNow(e.shiftKey); } };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); return () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; }, [!!placing?.from]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- keys (the whole page while the drawer is open; never while you type) ----
  useEffect(() => { if (!P.on) return;
    const kd = (e: KeyboardEvent) => { keysDown.current.alt = e.altKey; keysDown.current.shift = e.shiftKey; if (isTyping(e.target)) return;
      if (document.querySelector('.apop, [role=dialog][aria-modal=true]')) return;
      const mod = e.metaKey || e.ctrlKey; const k = e.key.toLowerCase(); const p = placingRef.current; const s = selRef.current; const d = drag.current; const stop = () => { e.preventDefault(); e.stopPropagation(); };
      if (mod && k === 'z') { stop(); doUndo(e.shiftKey); return; } if (mod && k === 'y') { stop(); doUndo(true); return; }
      if (mod && k === 'd' && s) { stop(); duplicateSel(s); return; }
      if (mod) return;
      const inStage = !!(e.target as HTMLElement)?.closest?.('.pv-stage, .pv-bt, .pd') || e.target === document.body;
      if (e.key === 'Escape') { stop(); if (p) cancelPlacing(); else if (d) cancelDrag(); else if (s) { flushPending(); P.select(s.kind, null); } else P.onClose(); return; }
      if (!inStage) return; if ((e.target as HTMLInputElement)?.type === 'range' && e.key.startsWith('Arrow')) return;
      if (k === 'q' || k === 'e') { stop(); const dir = k === 'q' ? 1 : -1;
        if (p) updatePlacing({ turn: turnBy(p.turn, dir, e.shiftKey) }); else if (d) { d.r = turnBy(d.r, dir, e.shiftKey); P.engine.current?.setOverride(overrideOf(d)); } else if (s) turnSel(s, dir, e.shiftKey); return; }
      const sizeKey = k === '[' || k === ']' || k === '-' || k === '=' || k === '+' || /^(BracketLeft|BracketRight|Minus|Equal|NumpadAdd|NumpadSubtract)$/.test(e.code);
      if (sizeKey) { stop(); const dir = k === ']' || k === '=' || k === '+' || /BracketRight|Equal|NumpadAdd/.test(e.code) ? 1 : -1; const f = sizeStep(dir, e.shiftKey);
        if (p) { if (p.item.kind === 'prop') updatePlacing({ s: sizeBy(p.s, f, PROP_SCALE_MIN, PROP_SCALE_MAX) }); else updatePlacing({ h: sizeBy(p.h, f, MODEL_H_MIN, tpl() === 'diorama' ? 1 : MODEL_H_MAX) }); } else if (s) resizeSel(s, f); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && s && !p) { stop(); removeSel(s); return; }
      if (k === 'd' && s && !p) { stop(); duplicateSel(s); return; }
      if (k === 'g' && s && !p && !d) { stop(); const r = P.canvas.current?.getBoundingClientRect(); if (r) startDrag(s, r.left + r.width / 2, r.top + r.height / 2, true); return; }
      if (e.key === 'Enter' && p) { stop(); placeNow(e.shiftKey); return; }
      if (e.key.startsWith('Arrow') && s && !p) { stop(); nudgeSel(s, e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0, e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0); return; }
      /* everything else the view would do (fly F, actor V, guides G, play Space, frames ←/→) sleeps while you build */
      if (e.key === ' ' || /^[a-z]$/.test(k) || e.key.startsWith('Arrow')) { if ((e.target as HTMLElement)?.closest?.('.pv-stage')) e.preventDefault(); e.stopPropagation(); } };
    const ku = (e: KeyboardEvent) => { keysDown.current.alt = e.altKey; keysDown.current.shift = e.shiftKey; };
    addEventListener('keydown', kd, true); addEventListener('keyup', ku, true); return () => { removeEventListener('keydown', kd, true); removeEventListener('keyup', ku, true); }; }); // re-bound each render: it reads the current selection
  /* scroll (or pinch) sizes what you hold or what is selected */
  useEffect(() => { const el = P.stage.current; if (!el || !P.on) return;
    const wh = (e: WheelEvent) => { const p = placingRef.current; const s = selRef.current; if (!p && !s) return; if ((e.target as HTMLElement).closest('[data-nofly], .pv-bt')) return; e.preventDefault();
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : e.shiftKey ? 0.0006 : 0.0025));
      if (p) { if (p.item.kind === 'prop') updatePlacing({ s: sizeBy(p.s, k, PROP_SCALE_MIN, PROP_SCALE_MAX) }); else updatePlacing({ h: sizeBy(p.h, k, MODEL_H_MIN, tpl() === 'diorama' ? 1 : MODEL_H_MAX) }); } else if (s) resizeSel(s, k); };
    el.addEventListener('wheel', wh, { passive: false }); return () => el.removeEventListener('wheel', wh); }); // eslint-disable-line react-hooks/exhaustive-deps
  /* closing the drawer, recording, flying: let go of everything */
  useEffect(() => { if (P.on) return; cancelPlacing(); cancelDrag(); flushPending(); setHover(null); P.engine.current?.setGhost(null); }, [P.on]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { clearTimeout(pending.current?.timer); cancelAnimationFrame(raf.current); }, []);
  /* a placed thing that was removed under the selection (undo, the drawer) */
  useEffect(() => { const h = hoverRef.current; if (h && (h.kind === 'prop' ? h.i >= props().length : h.i >= models().length)) setHover(null); });

  const ui = { placing, drag: dragUi, hover, sel: selNow(), canUndo: undo.current.past.length > 0, canRedo: undo.current.future.length > 0 };
  return { ...ui, pick, placeNow, cancelPlacing, remember, undo: () => doUndo(false), redo: () => doUndo(true),
    handlers: { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: () => endDrag(false), onPointerLeave: onLeave },
    act: { turn: (s: Sel, dir: 1 | -1) => turnSel(s, dir, false), size: (s: Sel, dir: 1 | -1) => resizeSel(s, sizeStep(dir)), duplicate: duplicateSel, remove: removeSel, actor: makeActor,
      move: (s: Sel, cx: number, cy: number) => startDrag(s, cx, cy, true) },
    placingKey: placing ? (placing.item.kind === 'prop' ? `p:${placing.item.k}` : `m:${placing.item.c.key}`) : null };
}
export type BuildMode = ReturnType<typeof useBuildMode>;

const Kbd = ({ children }: { children: ReactNode }) => <kbd className="pv-kbd">{children}</kbd>;
/** the hint bar at the foot of the view: the keys that work right now */
export function BuildHints({ b, name }: { b: BuildMode; name: string | null }) {
  const p = b.placing; const d = b.drag; const sp = p ? p.spot ?? p.drop : null;
  let lead: ReactNode; let keys: [ReactNode, string][];
  if (p && p.item.kind === 'model' && !p.prep) { lead = <span className="pv-bh-lead"><i className="as-spin" aria-hidden />Getting {p.item.c.name} ready…</span>; keys = [[<Kbd>Esc</Kbd>, 'cancel']]; }
  else if (p) { lead = sp && !sp.ok ? <span className="pv-bh-lead pv-bh-bad" data-testid="pv-bh-bad">{sp.why ?? 'It can’t go here'}</span>
      : <span className="pv-bh-lead">{p.spot ? 'Click to place' : 'Point where it goes'}{sp?.road ? <em> · on the road: traffic drives through it</em> : null}</span>;
    keys = [[<><Kbd>Q</Kbd><Kbd>E</Kbd></>, 'turn'], [<><Kbd>[</Kbd><Kbd>]</Kbd></>, 'size'], [<Kbd>Shift</Kbd>, 'fine'], [<Kbd>Esc</Kbd>, 'cancel']]; }
  else if (d?.moving || d?.carry) { lead = d.ok ? <span className="pv-bh-lead">{d.carry ? 'Click to put it down' : 'Moving'}</span> : <span className="pv-bh-lead pv-bh-bad">{d.why ?? 'It can’t go there'}</span>;
    keys = [[<><Kbd>Q</Kbd><Kbd>E</Kbd></>, 'turn'], [<Kbd>{MAC ? '⌥' : 'Alt'}</Kbd>, 'snap'], [<Kbd>Esc</Kbd>, 'cancel']]; }
  else if (b.sel) { lead = <span className="pv-bh-lead">{name ?? 'Selected'}</span>;
    keys = [[<><Kbd>Q</Kbd><Kbd>E</Kbd></>, 'turn'], [<><Kbd>[</Kbd><Kbd>]</Kbd></>, 'size'], [<Kbd>Del</Kbd>, 'remove'], [<Kbd>{CMD}Z</Kbd>, 'undo'], [<Kbd>Esc</Kbd>, 'done']]; }
  else { lead = <span className="pv-bh-lead">Pick a prop on the right, or click one in the view</span>; keys = b.canUndo ? [[<Kbd>{CMD}Z</Kbd>, 'undo'], [<Kbd>Esc</Kbd>, 'close']] : [[<Kbd>Esc</Kbd>, 'close']]; }
  return <div className="pv-bh" role="status" aria-live="polite" data-nofly="" data-testid="pv-build-hints">{lead}{keys.map(([k, w], i) => <span key={i} className="pv-bh-k">{k}<span>{w}</span></span>)}</div>;
}

const MoveIcon = ({ size = 15 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v18M3 12h18" /><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" /></svg>;
const TurnIcon = ({ size = 15, flip = false }: { size?: number; flip?: boolean }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={flip ? { transform: 'scaleX(-1)' } : undefined}><path d="M4 12a8 8 0 1 0 2.3-5.7" /><path d="M4 4v4h4" /></svg>;
const DupIcon = ({ size = 15 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
/** Selection actions live in the scrolling inspector, never clipped to the export canvas. Actor and Remove stay in its existing fields. */
export function BuildToolbar({ b, label, full }: { b: BuildMode; label: string; full: boolean }) {
  const s = b.sel; if (!s || b.placing || b.drag?.moving) return null;
  const btn = (key: string, text: string, t: string, icon: ReactNode, on: () => void, dis = false) => <button key={key} type="button" className="pv-bt-b" aria-label={t} onClick={on} disabled={dis} data-testid={`pv-bt-${key}`} {...tip(t)}>{icon}<span>{text}</span></button>;
  return <div className="pv-bt pv-bt-drawer" role="toolbar" aria-label={`${label}: move, turn, size`} data-nofly="" data-testid="pv-build-toolbar" onPointerDown={(e) => e.stopPropagation()}>
    {btn('move', 'Move', 'Move (G): it follows the cursor, click to put it down', <MoveIcon />, () => { const r = (document.querySelector('.pv-stage') as HTMLElement | null)?.getBoundingClientRect(); b.act.move(s, (r?.left ?? 0) + (r?.width ?? 0) / 2, (r?.top ?? 0) + (r?.height ?? 0) / 2); })}
    {btn('turn-l', 'Turn left', 'Turn left (Q)', <TurnIcon />, () => b.act.turn(s, 1))}{btn('turn-r', 'Turn right', 'Turn right (E)', <TurnIcon flip />, () => b.act.turn(s, -1))}
    {btn('smaller', 'Smaller', 'Smaller ([ or scroll)', <MinusIcon size={15} />, () => b.act.size(s, -1))}{btn('bigger', 'Bigger', 'Bigger (] or scroll)', <PlusIcon size={15} />, () => b.act.size(s, 1))}
    {btn('dup', 'Duplicate', full ? 'That is the most in one shot' : 'Duplicate (D)', <DupIcon />, () => b.act.duplicate(s), full)}
  </div>;
}
/** the top of a selected thing (for the toolbar): its height above the floor */
export const heightOfProp = (p: PlacedProp) => { const k = pieceOf(p.k); return k ? k.h * p.s : 1; };
export const labelOfSel = (shot: PlanShot, s: { kind: 'prop' | 'model'; i: number } | null) => (!s ? null : s.kind === 'prop' ? (shot.props?.[s.i] ? propLabel(shot.props[s.i].k) : null) : shot.models?.[s.i]?.name ?? null);
