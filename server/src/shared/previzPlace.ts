/**
 * Placing things in Direct a Shot (2026-10-27, the Add props build mode): the pure maths behind the ghost, the drag and undo, so the player
 * (web/src/shared/PrevizPlayer.tsx) and the engine stay thin and every rule is testable without a browser.
 *  - rayToGround: where a ray from the camera meets the floor of a preset, stopping at the first wall or building it runs into (so a point
 *    behind a shop front is never picked: you get the pavement in front of it).
 *  - fitSpot: keeps a footprint of radius r out of walls and buildings and on the set (pushed to the nearest good spot); a spot that had to
 *    move far is "not here" (the ghost turns red and a click does nothing). In the open city it also says when the spot is on the road.
 *  - nearestFree: steps along a spiral until a footprint clears what is already placed.
 *  - the undo stack: snapshots of the shot's props and your models, with quick repeats (a slider, a scroll, Q pressed five times) merged into one step.
 * Deterministic: no clocks or randomness here; `now` is passed in.
 */
import { groundAt, type PlacedProp, type PrevizTemplateId, type Vec3 } from './previzTemplates.js';
import { isCityTemplate, openCityWorld } from './world/openCity.js';
import { isRoadTile, tileOf } from './world/cityGen.js';
import type { PlacedModel } from './previzModels.js';

const r3 = (x: number) => Math.round(x * 1000) / 1000 || 0;
/** walkthrough's floor plan (engine.ts): outer walls at x = ±2.5 and z = 3.1 / −11, inner walls at z = 0 and −6 with a 1.5 m door, 2.7 m ceiling */
const HOUSE = { x: 2.44, zMax: 3.04, zMin: -10.94, inner: [0, -6], door: 0.75, doorH: 2.2, ceil: 2.7, wall: 0.06 } as const;
/** the diorama's plinth (radius, metres) and the product studio's floor */
const PLINTH = 3.95; const STUDIO: [number, number, number, number] = [-5, 5, -3.6, 4];
/** how far a spot may be pushed before it counts as "not here" (metres; the diorama is a miniature) */
const PUSH_MAX = (tpl: PrevizTemplateId) => (tpl === 'diorama' ? 0.35 : 1.4);

/** Is (x, y, z) inside something solid (a building, a wall)? The floor itself is not solid. */
export function blockedAt(tpl: PrevizTemplateId, x: number, y: number, z: number): boolean {
  if (isCityTemplate(tpl)) { const w = openCityWorld(); for (const k of w.index.near(x, x, z, z)) { const b = w.boxes[k]; if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y > b.y0 && y < b.y1) return true; } return false; }
  if (tpl === 'walkthrough') { if (y >= HOUSE.ceil) return false;
    if (Math.abs(x) > HOUSE.x || z > HOUSE.zMax || z < HOUSE.zMin) return true;
    return HOUSE.inner.some((wz) => Math.abs(z - wz) < HOUSE.wall && (Math.abs(x) > HOUSE.door || y > HOUSE.doorH)); }
  if (tpl === 'walk-by') return z < -2.7 && Math.abs(x) < 40 && y < 14; /* the row of shop fronts */
  return false;
}

/**
 * Where a ray (origin o, direction d) first meets the floor of the preset, or stops at a wall: { x, z, wall }. null when it never comes down
 * within max metres (it points at the sky). A wall hit gives the floor point just in front of the wall, on the camera's side.
 */
export function rayToGround(tpl: PrevizTemplateId, o: Vec3, d: Vec3, max = isCityTemplate(tpl) ? 160 : 60): { x: number; z: number; wall: boolean } | null {
  const n = Math.hypot(d[0], d[1], d[2]) || 1; const dx = d[0] / n, dy = d[1] / n, dz = d[2] / n; const step = isCityTemplate(tpl) ? 0.35 : tpl === 'diorama' ? 0.04 : 0.12;
  const at = (s: number): Vec3 => [o[0] + dx * s, o[1] + dy * s, o[2] + dz * s];
  /* a camera that starts inside something (it never should) does not stop at once: walls only count once the ray has been in the open */
  let open = !blockedAt(tpl, o[0], o[1], o[2]); let prev = 0;
  for (let s = step; s <= max; s += step) { const p = at(s); const g = groundAt(tpl, p[0], p[2]);
    if (p[1] <= g) { let lo = prev, hi = s; for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; const q = at(m); if (q[1] <= groundAt(tpl, q[0], q[2])) hi = m; else lo = m; } const q = at(hi); return { x: r3(q[0]), z: r3(q[2]), wall: false }; }
    const b = blockedAt(tpl, p[0], p[1], p[2]);
    if (b && open) { let lo = prev, hi = s; for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; const q = at(m); if (blockedAt(tpl, q[0], q[1], q[2])) hi = m; else lo = m; } const q = at(lo); return { x: r3(q[0] - dx * 0.02), z: r3(q[2] - dz * 0.02), wall: true }; }
    if (!b) open = true; prev = s; }
  return null;
}

export interface Spot { x: number; z: number; /** it can go here (else the ghost is red and a click does nothing) */ ok: boolean; /** how far it was pushed (metres) */ moved: number;
  /** why not, in plain words */ why?: string; /** the open city: it stands on the road (allowed; traffic drives through it) */ road?: boolean }
/** Keep a footprint of radius r at (x, z) on the set and out of walls and buildings: the nearest good spot, and whether that is close enough. */
export function fitSpot(tpl: PrevizTemplateId, x: number, z: number, r: number): Spot {
  let nx = x, nz = z; let why = '';
  if (isCityTemplate(tpl)) { const w = openCityWorld(); const rr = Math.min(Math.max(0.1, r), 6); const c = w.clampActor(x, z, rr); nx = c[0]; nz = c[2]; why = 'Not inside a building or in the water'; }
  else if (tpl === 'walkthrough') { const rr = Math.min(Math.max(0.05, r), 1.4); nx = Math.max(-HOUSE.x + rr, Math.min(HOUSE.x - rr, x)); nz = Math.max(HOUSE.zMin + rr, Math.min(HOUSE.zMax - rr, z));
    /* an inner wall: step to the side you are on, unless it fits through the door */
    for (const wz of HOUSE.inner) if (Math.abs(nz - wz) < rr + HOUSE.wall && Math.abs(nx) + rr > HOUSE.door) nz = nz >= wz ? wz + rr + HOUSE.wall : wz - rr - HOUSE.wall;
    why = 'Inside the house only'; }
  else if (tpl === 'diorama') { const d = Math.hypot(x, z); const lim = Math.max(0, PLINTH - Math.min(r, 1.5)); if (d > lim) { nx = (x / (d || 1)) * lim; nz = (z / (d || 1)) * lim; } why = 'On the round base only'; }
  else if (tpl === 'walk-by') { nz = Math.max(-2.62 + Math.min(r, 2), Math.min(14, z)); nx = Math.max(-29, Math.min(29, x)); why = 'Not inside the shops'; }
  else if (tpl === 'product-hero') { nx = Math.max(STUDIO[0], Math.min(STUDIO[1], x)); nz = Math.max(STUDIO[2], Math.min(STUDIO[3], z)); why = 'On the studio floor only'; }
  else { nx = Math.max(-60, Math.min(60, x)); nz = Math.max(-60, Math.min(60, z)); why = 'Closer in'; }
  const moved = Math.hypot(nx - x, nz - z); const ok = moved <= PUSH_MAX(tpl);
  const out: Spot = { x: r3(nx), z: r3(nz), ok, moved: r3(moved), ...(ok ? {} : { why }) };
  if (isCityTemplate(tpl)) { const [i, j] = tileOf(nx, nz); if (isRoadTile(i, j)) { const w = openCityWorld(); if (w.footAt(nx, nz) <= w.groundAt(nx, nz) + 1e-6) out.road = true; } }
  return out;
}

/** Step along a spiral from (x, z) until a footprint of radius r clears every one in `taken` (x, z, r); gives up after 40 steps (the last spot). */
export function nearestFree(x: number, z: number, r: number, taken: { x: number; z: number; r: number }[], ok: (x: number, z: number) => boolean = () => true): [number, number] {
  const clash = (px: number, pz: number) => taken.some((t) => Math.hypot(t.x - px, t.z - pz) < (t.r + r) * 0.8) || !ok(px, pz);
  if (!clash(x, z)) return [x, z];
  for (let n = 1; n < 40; n++) { const a = n * 2.4, d = Math.max(0.3, r) * 0.9 * Math.sqrt(n); const px = r3(x + Math.cos(a) * d), pz = r3(z + Math.sin(a) * d); if (!clash(px, pz)) return [px, pz]; }
  return [x, z];
}
/** snap to a grid (step metres) */
export const snapGrid = (v: number, step: number) => r3(Math.round(v / step) * step);
/** a turn step: Q (+1) / E (−1), 15° or 5° fine; wrapped to ±π */
export const turnBy = (r: number, dir: 1 | -1, fine = false) => { const a = r + dir * (Math.PI / (fine ? 36 : 12)); return Math.round(Math.atan2(Math.sin(a), Math.cos(a)) * 10000) / 10000 || 0; };
/** a size step: ] (+1) / [ (−1), 10 % or 2 % fine; or a free factor (scroll); clamped */
export const sizeBy = (s: number, k: number, lo: number, hi: number) => Math.round(Math.max(lo, Math.min(hi, s * k)) * 1000) / 1000;
export const sizeStep = (dir: 1 | -1, fine = false) => (dir > 0 ? (fine ? 1.02 : 1.1) : 1 / (fine ? 1.02 : 1.1));

// ---------- undo / redo ----------
export interface PlaceSnap { props: PlacedProp[]; models: PlacedModel[] }
export interface UndoStack { past: PlaceSnap[]; future: PlaceSnap[]; /** the last change's merge key and time (ms): a repeat within UNDO_MERGE_MS is the same step */ key: string | null; at: number }
export const UNDO_MAX = 60; export const UNDO_MERGE_MS = 900;
export const emptyUndo = (): UndoStack => ({ past: [], future: [], key: null, at: 0 });
const same = (a: PlaceSnap, b: PlaceSnap) => JSON.stringify(a) === JSON.stringify(b);
/** Before a change: remember how things were. A change with the same key soon after the last one joins its step (one undo undoes both). */
export function recordUndo(st: UndoStack, before: PlaceSnap, key: string | null = null, now = 0): UndoStack {
  if (key && st.key === key && now - st.at <= UNDO_MERGE_MS && st.past.length) return { ...st, at: now, future: [] };
  if (st.past.length && same(st.past[st.past.length - 1], before)) return { ...st, key, at: now, future: [] };
  return { past: [...st.past, before].slice(-UNDO_MAX), future: [], key, at: now };
}
/** Undo: the snapshot to go back to (null: nothing to undo) and the stack after it (now can be redone). */
export function undoStep(st: UndoStack, cur: PlaceSnap): { snap: PlaceSnap | null; stack: UndoStack } {
  const snap = st.past[st.past.length - 1]; if (!snap) return { snap: null, stack: st };
  return { snap, stack: { past: st.past.slice(0, -1), future: [...st.future, cur].slice(-UNDO_MAX), key: null, at: 0 } };
}
export function redoStep(st: UndoStack, cur: PlaceSnap): { snap: PlaceSnap | null; stack: UndoStack } {
  const snap = st.future[st.future.length - 1]; if (!snap) return { snap: null, stack: st };
  return { snap, stack: { past: [...st.past, cur].slice(-UNDO_MAX), future: st.future.slice(0, -1), key: null, at: 0 } };
}
