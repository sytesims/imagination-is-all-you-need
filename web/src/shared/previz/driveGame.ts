/**
 * Drive mode, the game layer (2026-10-27, step 1): small, on-brand feedback while you drive in the open city. Live play only: none of it is
 * recorded (a take keeps the poses; the mockup renders from them), so recordings stay deterministic. The rules are pure and tested
 * (server/test/previz-drive-game.test.ts): the same frames give the same events.
 *  - Traffic lights: driving into a signalised junction's square (CityWorld.junctions, 10 m) on red is "ran a red"; waiting at the stop line
 *    (within 16 m of the square, the lights against you, nearly stopped) is "stopped at red", and the light turning green while you wait is
 *    "green, go". Leaving the square is "crossed" (clean when you didn't run it). Amber never counts against you.
 *  - Near miss: passing another car at speed (over 6 m/s) with less than 1.1 m between the bodies, without touching it (each car is a capsule
 *    along its length). Touching it, or hitting anything hard (a sudden stop), is a "bump".
 *  - Clean streak: seconds driven since the last bump or red light; a "streak" event every milestone (30 s, 1 min, 2 min, 4 min…).
 *  - Style: a 0–1 meter: near misses, patience at red, clean crossings and parking fill it; bumps and red lights empty it; it fades slowly.
 *  - Park here: an orange bay mid-block on a quiet street 45–150 m away (kerbside, clear of parked cars and walls, never by a junction); stop in it, lined up either way,
 *    for 0.7 s and it's "parked" (a reward), then the next bay appears.
 * Hooks for later steps (quests): every event goes to the game's own listeners (on(type | '*')) and to the page-wide bus (onDriveEvent).
 */
import type { CarAt, CityWorld, Lamp } from '../../../../server/src/shared/world/openCity';
import { tileOf, isRoadTile, carScale } from '../../../../server/src/shared/world/cityGen';
import { KIT } from '../../../../server/src/shared/world/kitCatalog';
import { carClamp, rideOf } from '../../../../server/src/shared/previzVehicle';

type V3 = [number, number, number];
export type DriveEventType = 'enter' | 'exit' | 'stopped-at-red' | 'green-go' | 'ran-red' | 'crossed' | 'near-miss' | 'bump' | 'streak' | 'bay' | 'parked' | 'horn';
export interface ParkBay { x: number; z: number; y: number; /** the way the bay runs (radians, like a car's heading; either way in counts) */ heading: number; w: number; l: number; /** the bay's number (1, 2, …) */ n: number }
export interface DriveEvent {
  type: DriveEventType; /** session seconds (the frame's now) */ at: number; /** the scene clock (where the traffic and lights are) */ sceneT: number; pos: [number, number];
  junction?: number; speed?: number; /** near miss: the closest gap between the bodies (m) */ gap?: number; /** streak seconds (streak, and a bump or red light that ended one) */ streak?: number;
  bay?: ParkBay; /** what it added to the style meter (negative: took away) */ style?: number; /** crossed: you didn't run the red */ clean?: boolean;
}
/** your car this frame (null: on foot or no car) */
export interface DriveCar { k: string; pos: V3; heading: number; speed: number; inside: boolean }
export interface DriveFrame { /** seconds, monotonic (the frame clock) */ now: number; dt: number; /** the scene clock */ sceneT: number; car: DriveCar | null;
  /** the ambient traffic at sceneT (CityWorld.carsAt), or null to skip near misses this frame */ traffic: CarAt[] | null; /** offer park bays */ bays: boolean }
export interface DriveGameState {
  inside: boolean; streak: number; best: number; style: number; points: number; lastSpeed: number | null; bumpAt: number; nextMilestone: number;
  jx: { j: number; ns: boolean; inside: boolean; ran: boolean; waiting: boolean; waited: boolean } | null;
  near: Map<number, { min: number; bumped: boolean; fast: boolean }>;
  bay: ParkBay | null; bayN: number; hold: number; /** distance to the bay (m), for the HUD */ bayDist: number | null;
}
export const DRIVE = { box: 5, approach: 16, lat: 5.2, stopV: 0.6, runV: 1.5, nearGap: 1.1, touch: 0.12, nearV: 6, range: 16, hit: -40, milestones: [30, 60, 120, 240, 480],
  bayMin: 45, bayMax: 150, bayW: 2.6, bayL: 6, kerb: 3.3, parkLat: 0.6, parkAlong: 1.3, parkTurn: 0.35, parkV: 0.35, parkHold: 0.7, fade: 0.025 } as const;
const STYLE: Partial<Record<DriveEventType, number>> = { 'near-miss': 0.12, 'green-go': 0.08, crossed: 0.04, parked: 0.25, streak: 0.06, 'ran-red': -0.35, bump: -0.25 };
const POINTS: Partial<Record<DriveEventType, number>> = { 'near-miss': 50, 'green-go': 25, crossed: 10, parked: 200, streak: 100 };

export function driveGameStart(): DriveGameState {
  return { inside: false, streak: 0, best: 0, style: 0, points: 0, lastSpeed: null, bumpAt: -Infinity, nextMilestone: 0, jx: null, near: new Map(), bay: null, bayN: 0, hold: 0, bayDist: null };
}
const lampOf = (w: CityWorld, j: number, ns: boolean, t: number): Lamp => { const s = w.signalAt(j, t); return ns ? s.ns : s.ew; };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** the shortest distance between two segments in the plane */
export function segDist(a0: [number, number], a1: [number, number], b0: [number, number], b1: [number, number]): number {
  const d1 = [a1[0] - a0[0], a1[1] - a0[1]], d2 = [b1[0] - b0[0], b1[1] - b0[1]], r = [a0[0] - b0[0], a0[1] - b0[1]];
  const a = d1[0] * d1[0] + d1[1] * d1[1], e = d2[0] * d2[0] + d2[1] * d2[1], f = d2[0] * r[0] + d2[1] * r[1]; let s = 0, t = 0;
  if (a <= 1e-9 && e <= 1e-9) return Math.hypot(r[0], r[1]);
  if (a <= 1e-9) t = clamp01(f / e);
  else { const c = d1[0] * r[0] + d1[1] * r[1]; if (e <= 1e-9) s = clamp01(-c / a);
    else { const b = d1[0] * d2[0] + d1[1] * d2[1]; const den = a * e - b * b; s = den > 1e-9 ? clamp01((b * f - c * e) / den) : 0; t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp01(-c / a); } else if (t > 1) { t = 1; s = clamp01((b - c) / a); } } }
  return Math.hypot(a0[0] + d1[0] * s - (b0[0] + d2[0] * t), a0[1] + d1[1] * s - (b0[1] + d2[1] * t));
}
/** a car as a capsule: its centre line (from the back to the front circle centre) and radius */
function capsule(x: number, z: number, h: number, w: number, l: number): { a: [number, number]; b: [number, number]; r: number } {
  const r = w / 2; const half = Math.max(0, l / 2 - r); const fx = Math.sin(h), fz = Math.cos(h);
  return { a: [x - fx * half, z - fz * half], b: [x + fx * half, z + fz * half], r };
}
/** the gap between your car and another (m; ≤ 0 touching) */
export function carGap(me: { pos: V3; heading: number; k: string }, other: CarAt): number {
  const R = rideOf(me.k); const A = capsule(me.pos[0], me.pos[2], me.heading, R.width, R.length);
  const kit = KIT[other.k]; const s = carScale(other.k); const B = capsule(other.x, other.z, other.heading, (kit?.w ?? 2) * s * 0.9, (kit?.d ?? 4.4) * s);
  return segDist(A.a, A.b, B.a, B.b) - A.r - B.r;
}

/** the signalised junction you are in (its square) or driving up to (within the approach, lined up with it), nearest first */
export function junctionNear(w: CityWorld, x: number, z: number, heading: number): { j: number; inBox: boolean; ahead: number; ns: boolean } | null {
  const ns = Math.abs(Math.cos(heading)) >= Math.abs(Math.sin(heading)); const dir: [number, number] = ns ? [0, Math.sign(Math.cos(heading)) || 1] : [Math.sign(Math.sin(heading)) || 1, 0];
  let best: { j: number; inBox: boolean; ahead: number; ns: boolean } | null = null;
  for (let j = 0; j < w.junctions.length; j++) { const J = w.junctions[j]; const rx = J.x - x, rz = J.z - z; if (Math.abs(rx) > 30 || Math.abs(rz) > 30) continue;
    if (Math.abs(rx) < DRIVE.box && Math.abs(rz) < DRIVE.box) return { j, inBox: true, ahead: 0, ns };
    const ahead = rx * dir[0] + rz * dir[1]; const lat = ns ? Math.abs(rx) : Math.abs(rz);
    if (lat < DRIVE.lat && ahead > DRIVE.box && ahead < DRIVE.box + DRIVE.approach && (!best || ahead < best.ahead)) best = { j, inBox: false, ahead, ns }; }
  return best;
}

// ---- park bays ----
const loopTileCache = new WeakMap<CityWorld, Set<number>>();
/** the tiles the ambient traffic drives through (bays go on quieter streets) */
function loopTiles(w: CityWorld): Set<number> {
  let s = loopTileCache.get(w); if (s) return s; s = new Set();
  for (const L of w.spec.carLoops) for (let k = 0; k < L.pts.length; k++) { const a = L.pts[k], b = L.pts[(k + 1) % L.pts.length]; const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2);
    for (let q = 0; q <= n; q++) { const [i, j] = tileOf(a[0] + ((b[0] - a[0]) * q) / Math.max(1, n), a[1] + ((b[1] - a[1]) * q) / Math.max(1, n)); s.add(i * 1000 + j); } }
  loopTileCache.set(w, s); return s;
}
const hash = (a: number, b: number, c: number) => { const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return x - Math.floor(x); };
/** The next bay: a straight, quiet street tile 45–150 m from (x, z), ahead of you when it can, at the kerb, clear of everything solid. */
export function pickBay(w: CityWorld, x: number, z: number, heading: number, n: number): ParkBay | null {
  const T = w.spec.tile; const { x0, z0 } = w.spec.grid; const [ci, cj] = tileOf(x, z); const R = Math.ceil(DRIVE.bayMax / T); const busy = loopTiles(w); const fx = Math.sin(heading), fz = Math.cos(heading);
  const cands: { i: number; j: number; s: number }[] = [];
  for (let i = ci - R; i <= ci + R; i++) for (let j = cj - R; j <= cj + R; j++) { if (!isRoadTile(i, j) || busy.has(i * 1000 + j)) continue;
    const straight = (a: number, b: number) => { const o = [isRoadTile(a, b - 1), isRoadTile(a + 1, b), isRoadTile(a, b + 1), isRoadTile(a - 1, b)]; return o.filter(Boolean).length === 2 && o[0] === o[2]; };
    /* mid-block only: the tiles either side are straight too (no junction, no zebra crossing next to the bay) */
    if (!straight(i, j)) continue; const nz = isRoadTile(i, j - 1); if (!(nz ? straight(i, j - 1) && straight(i, j + 1) : straight(i - 1, j) && straight(i + 1, j))) continue;
    const tx = x0 + (i + 0.5) * T, tz = z0 + (j + 0.5) * T; const d = Math.hypot(tx - x, tz - z); if (d < DRIVE.bayMin || d > DRIVE.bayMax) continue;
    const ahead = ((tx - x) * fx + (tz - z) * fz) / d; cands.push({ i, j, s: hash(n, i, j) + Math.max(0, ahead) * 0.8 }); }
  cands.sort((a, b) => b.s - a.s || a.i - b.i || a.j - b.j);
  const spec = rideOf('kv.sedan');
  for (const c of cands.slice(0, 40)) { const alongZ = isRoadTile(c.i, c.j - 1); const side = hash(n + 7, c.i, c.j) < 0.5 ? -1 : 1; const tx = x0 + (c.i + 0.5) * T, tz = z0 + (c.j + 0.5) * T;
    const bx = alongZ ? tx + side * DRIVE.kerb : tx, bz = alongZ ? tz : tz + side * DRIVE.kerb; const h = alongZ ? (side > 0 ? Math.PI : 0) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
    const cl = carClamp('open-city', bx, bz, h, { ...spec, width: DRIVE.bayW, length: DRIVE.bayL }); if (Math.hypot(cl.push[0], cl.push[1]) > 0.02) continue;
    return { x: bx, z: bz, y: w.groundAt(bx, bz), heading: h, w: DRIVE.bayW, l: DRIVE.bayL, n }; }
  return null;
}
/** is the car lined up in the bay (either way round)? */
export function inBay(b: ParkBay, pos: V3, heading: number): boolean {
  const dx = pos[0] - b.x, dz = pos[2] - b.z; const fx = Math.sin(b.heading), fz = Math.cos(b.heading); const along = dx * fx + dz * fz, lat = dx * fz - dz * fx;
  let dh = (heading - b.heading) % Math.PI; if (dh < 0) dh += Math.PI; dh = Math.min(dh, Math.PI - dh);
  return Math.abs(along) < DRIVE.parkAlong && Math.abs(lat) < DRIVE.parkLat && dh < DRIVE.parkTurn;
}

/** One frame of the game: updates the state and returns what happened (in order). Deterministic: the same frames, the same events. */
export function driveStep(w: CityWorld, st: DriveGameState, f: DriveFrame): DriveEvent[] {
  const out: DriveEvent[] = []; const c = f.car; const dt = Math.max(0, Math.min(0.1, Number.isFinite(f.dt) ? f.dt : 0));
  const ev = (type: DriveEventType, more: Partial<DriveEvent> = {}) => { const d = STYLE[type] ?? 0; st.style = clamp01(st.style + d); st.points += POINTS[type] ?? 0;
    out.push({ type, at: f.now, sceneT: f.sceneT, pos: c ? [c.pos[0], c.pos[2]] : [0, 0], ...(d ? { style: d } : {}), ...more }); };
  const inside = !!c?.inside;
  if (inside !== st.inside) { st.inside = inside; ev(inside ? 'enter' : 'exit'); st.jx = null; st.near.clear(); st.lastSpeed = null; st.hold = 0; }
  st.style = clamp01(st.style - DRIVE.fade * dt);
  if (!c || !inside) { st.bayDist = st.bay && c ? Math.hypot(c.pos[0] - st.bay.x, c.pos[2] - st.bay.z) : null; return out; }
  const v = Math.abs(c.speed);
  const lose = () => { const s = st.streak; st.streak = 0; st.nextMilestone = 0; return s; };
  /* a hard stop that the brakes can't explain: you hit something */
  if (st.lastSpeed != null && dt > 0 && (v - st.lastSpeed) / dt < DRIVE.hit && st.lastSpeed > 3 && f.now - st.bumpAt > 1) { st.bumpAt = f.now; ev('bump', { speed: st.lastSpeed, streak: lose() }); }
  st.lastSpeed = v;
  // ---- traffic lights ----
  const q = junctionNear(w, c.pos[0], c.pos[2], c.heading);
  if (st.jx?.inside && (!q || !q.inBox || q.j !== st.jx.j)) { ev('crossed', { junction: st.jx.j, clean: !st.jx.ran }); st.jx = null; }
  if (q?.inBox) { if (!st.jx || st.jx.j !== q.j || !st.jx.inside) { const ns = st.jx?.j === q.j ? st.jx.ns : q.ns; const lamp = lampOf(w, q.j, ns, f.sceneT); const ran = lamp === 'red' && v > DRIVE.runV;
      if (ran) ev('ran-red', { junction: q.j, speed: v, streak: lose() }); st.jx = { j: q.j, ns, inside: true, ran, waiting: false, waited: st.jx?.j === q.j && st.jx.waited }; } }
  else if (q) { if (!st.jx || st.jx.j !== q.j) st.jx = { j: q.j, ns: q.ns, inside: false, ran: false, waiting: false, waited: false };
    const lamp = lampOf(w, q.j, st.jx.ns, f.sceneT);
    if (lamp !== 'green' && v < DRIVE.stopV && !st.jx.waiting) { st.jx.waiting = true; ev('stopped-at-red', { junction: q.j }); }
    else if (lamp === 'green' && st.jx.waiting) { st.jx.waiting = false; st.jx.waited = true; ev('green-go', { junction: q.j }); } }
  else if (st.jx && !st.jx.inside) st.jx = null;
  // ---- near misses and touches ----
  if (f.traffic) { const seen = new Set<number>();
    f.traffic.forEach((o, i) => { if (Math.abs(o.x - c.pos[0]) > DRIVE.range || Math.abs(o.z - c.pos[2]) > DRIVE.range) return; seen.add(i);
      const g = carGap(c, o); let n = st.near.get(i); if (!n) st.near.set(i, (n = { min: Infinity, bumped: false, fast: false }));
      n.min = Math.min(n.min, g); if (v > DRIVE.nearV) n.fast = true;
      if (g <= DRIVE.touch && !n.bumped) { n.bumped = true; if (f.now - st.bumpAt > 1) { st.bumpAt = f.now; ev('bump', { speed: v, streak: lose() }); } }
      if (g > n.min + 2.5 && n.min > DRIVE.touch && n.min < DRIVE.nearGap && n.fast && !n.bumped) { ev('near-miss', { gap: n.min, speed: v }); n.min = -1; /* counted: once per pass */ } });
    for (const i of [...st.near.keys()]) if (!seen.has(i)) st.near.delete(i); }
  // ---- the clean streak ----
  if (v > 1) { st.streak += dt; st.best = Math.max(st.best, st.streak); }
  const ms = DRIVE.milestones[st.nextMilestone]; if (ms != null && st.streak >= ms) { st.nextMilestone++; ev('streak', { streak: ms }); }
  // ---- park here ----
  if (f.bays && !st.bay) { const b = pickBay(w, c.pos[0], c.pos[2], c.heading, st.bayN + 1); if (b) { st.bayN = b.n; st.bay = b; st.hold = 0; ev('bay', { bay: b }); } }
  if (!f.bays && st.bay) { st.bay = null; st.hold = 0; }
  if (st.bay) { st.bayDist = Math.hypot(c.pos[0] - st.bay.x, c.pos[2] - st.bay.z);
    if (v < DRIVE.parkV && inBay(st.bay, c.pos, c.heading)) { st.hold += dt; if (st.hold >= DRIVE.parkHold) { const b = st.bay; st.bay = null; st.hold = 0; ev('parked', { bay: b }); } } else st.hold = 0; }
  else st.bayDist = null;
  return out;
}

// ---- the emitter (hooks for quests in step 2) ----
export type DriveListener = (e: DriveEvent) => void;
const bus = new Set<DriveListener>();
/** every drive event on the page, from whichever game is running (returns the unsubscribe) */
export function onDriveEvent(fn: DriveListener): () => void { bus.add(fn); return () => { bus.delete(fn); }; }
export interface DriveGame {
  readonly state: DriveGameState;
  /** one frame: updates the state, tells the listeners, returns the events */ step(f: DriveFrame): DriveEvent[];
  /** the horn (H, or the left stick click at the wheel) */ horn(now: number, sceneT: number, car: DriveCar | null): void;
  /** listen to one kind of event, or '*' for all (returns the unsubscribe) */ on(type: DriveEventType | '*', fn: DriveListener): () => void;
  /** start over (a new session, a teleport) */ reset(): void;
}
export function createDriveGame(w: CityWorld): DriveGame {
  let st = driveGameStart(); const subs = new Map<string, Set<DriveListener>>();
  const emit = (e: DriveEvent) => { for (const k of [e.type, '*']) subs.get(k)?.forEach((fn) => { try { fn(e); } catch { /* a listener never breaks the game */ } }); bus.forEach((fn) => { try { fn(e); } catch { /* same */ } }); };
  return {
    get state() { return st; },
    step(f) { const ev = driveStep(w, st, f); ev.forEach(emit); return ev; },
    horn(now, sceneT, car) { emit({ type: 'horn', at: now, sceneT, pos: car ? [car.pos[0], car.pos[2]] : [0, 0] }); },
    on(type, fn) { let s = subs.get(type); if (!s) subs.set(type, (s = new Set())); s.add(fn); return () => { s!.delete(fn); }; },
    reset() { st = driveGameStart(); },
  };
}
